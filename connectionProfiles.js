
import { get_settings, error, debug, toast_debounced, getContext, CONNECT_API_MAP, selectorsSillyTavern } from './index.js';
import { CONNECTION_TOAST_DURATION_MS, PROFILE_SWITCH_DELAY_MS } from './constants.js';
import { oai_settings, proxies } from '../../../openai.js';

// Connection profiles
let connection_profiles_active;
function check_connection_profiles_active() {
  // detect whether the connection profiles extension is active by checking for the UI elements
  if (connection_profiles_active === undefined) {
    connection_profiles_active = $(selectorsSillyTavern.extensions.sysSettingsButton).find(selectorsSillyTavern.extensions.connectionProfiles).length > 0;

    // If not found and we haven't retried yet, schedule a retry after 2 seconds
    if (!connection_profiles_active) {
      setTimeout(() => {
        // Guard against test environment where jQuery might not be fully available
        if (typeof $ !== 'function' || typeof $.fn === 'undefined') {return;}

        connection_profiles_active = undefined; // Reset to force re-check
        // Try to refresh the UI if connection profiles are now available
        const elem = $(selectorsSillyTavern.extensions.sysSettingsButton);
        if (elem && typeof elem.find === 'function' && elem.find(selectorsSillyTavern.extensions.connectionProfiles).length > 0) {
          // Connection profiles are now available, refresh the settings UI (fire-and-forget async import)
          void (async () => {
            try {
              const module = await import('./profileUI.js');
              if (module.refresh_settings) {
                module.refresh_settings();
              }
            } catch (err) {
              console.error('[AutoRecap] Failed to load profileUI module:', err);
            }
          })();
        }
      }, CONNECTION_TOAST_DURATION_MS);
    }
  }
  return connection_profiles_active;
}
async function get_current_connection_profile() {
  if (!check_connection_profiles_active()) {return null;} // if the extension isn't active, return
  // get the current connection profile
  const ctx = getContext();
  const result = await ctx.executeSlashCommandsWithOptions(`/profile`);
  return result.pipe;
}
async function get_connection_profile_api(name ) {
  // Get the API for the given connection profile name. If not given, get the current recap profile.
  if (!check_connection_profiles_active()) {return null;} // if the extension isn't active, return
  let profileName = name;
  if (profileName === undefined) {profileName = await get_recap_connection_profile();}
  const ctx = getContext();
  const result = await ctx.executeSlashCommandsWithOptions(`/profile-get ${profileName}`);

  if (!result.pipe) {
    debug(`/profile-get ${profileName} returned nothing - no connection profile selected`);
    return null;
  }

  let data;
  try {
    data = JSON.parse(result.pipe);
  } catch {
    error(`Failed to parse JSON from /profile-get for \"${name}\". Result:`);
    error(result);
    return null;
  }

  // If the API type isn't defined, it might be excluded from the connection profile. Assume based on mode.
  if (data.api === undefined) {
    debug(`API not defined in connection profile ${name}. Mode is ${data.mode}`);
    if (data.mode === 'tc') {return 'textgenerationwebui';}
    if (data.mode === 'cc') {return 'openai';}
    return null;
  }

  // need to map the API type to a completion API
  if (CONNECT_API_MAP[data.api] === undefined) {
    error(`API type "${data.api}" not found in CONNECT_API_MAP - could not identify API.`);
    return null;
  }
  return CONNECT_API_MAP[data.api].selected;
}
async function get_recap_connection_profile() {
  // get the current connection profile OR the default if it isn't valid for the current API
  let name = get_settings('connection_profile');

  // If none selected, invalid, or connection profiles not active, use the current profile
  if (name === "" || !(await verify_connection_profile(name)) || !check_connection_profiles_active()) {
    name = await get_current_connection_profile();
  }

  return name;
}
async function set_connection_profile(name ) {
  // Set the connection profile
  if (!check_connection_profiles_active()) {return;} // if the extension isn't active, return
  if (!name) {return;} // if no name provided, return
  if (name === (await get_current_connection_profile())) {return;} // If already using the current profile, return
  if (!(await verify_connection_profile(name))) {return;} // don't set an invalid profile

  // Set the connection profile
  debug(`Setting connection profile to "${name}"`);
  toastr.info(`Setting connection profile to "${name}"`);
  const ctx = getContext();
  await ctx.executeSlashCommandsWithOptions(`/profile ${name}`);

  // Wait a moment for the profile to fully apply
  await new Promise((resolve) => setTimeout(resolve, PROFILE_SWITCH_DELAY_MS));
}
async function get_connection_profiles() {
  // Get a list of available connection profiles

  if (!check_connection_profiles_active()) {return null;} // if the extension isn't active, return
  const ctx = getContext();
  const result = await ctx.executeSlashCommandsWithOptions(`/profile-list`);
  try {
    return JSON.parse(result.pipe);
  } catch {
    error("Failed to parse JSON from /profile-list. Result:");
    error(result);
    return null;
  }

}
function get_connection_profile_objects() {
  // Get full profile objects with both id and name

  if (!check_connection_profiles_active()) {return null;}
  const ctx = getContext();
  return ctx.extensionSettings.connectionManager?.profiles || [];
}
async function verify_connection_profile(name ) {
  // check if the given connection profile name is valid
  if (!check_connection_profiles_active()) {return false;} // if the extension isn't active, return
  if (name === "") {return true;} // no profile selected, always valid

  const names = await get_connection_profiles();
  return names?.includes(name) ?? false;
}
async function check_connection_profile_valid() {
  // check whether the current connection profile selected for recap generation is valid
  if (!check_connection_profiles_active()) {return false;} // if the extension isn't active, return
  const recap_connection = get_settings('connection_profile');
  const valid = await verify_connection_profile(recap_connection);
  if (!valid) {
    toast_debounced(`Your selected recap connection profile "${recap_connection}" is not valid.`, "warning");
  }
  return valid;
}
function find_profile_by_name(profileName) {
  const ctx = getContext();
  const profiles = ctx.extensionSettings.connectionManager?.profiles || [];
  return profiles.find((p) => p.name === profileName);
}
function extract_custom_url(profile) {
  return profile['custom-url'] || profile['custom_url'] || profile.customUrl;
}
function extract_reverse_proxy_url(profile) {
  return profile['reverse-proxy'] || profile['reverse_proxy'] || profile['proxy-url'] || profile['proxy_url'] || profile.reverseProxy || profile['server-url'] || profile['server_url'];
}
function get_connection_profile_proxy_url(profileName) {
  if (!check_connection_profiles_active()) {
    debug('[Proxy Detection] Connection profiles not active');
    return null;
  }

  const profile = find_profile_by_name(profileName);
  if (!profile) {
    debug(`[Proxy Detection] Profile "${profileName}" not found in connectionManager.profiles`);
    return null;
  }

  debug(`[Proxy Detection] Raw profile object:`, JSON.stringify(profile, null, 2));
  debug(`[Proxy Detection] Profile field names:`, Object.keys(profile));

  // Check OpenAI settings for reverse proxy (Connection Manager uses this!)
  // Import oai_settings and proxies directly from openai.js (like shared.js does)
  debug(`[Proxy Detection] oai_settings.reverse_proxy:`, oai_settings.reverse_proxy);
  if (oai_settings.reverse_proxy) {
    debug(`[Proxy Detection] Found reverse proxy in oai_settings: ${oai_settings.reverse_proxy}`);
    return oai_settings.reverse_proxy;
  }

  // Check for proxy preset (Connection Manager looks up proxies array from openai.js)
  debug(`[Proxy Detection] OpenAI proxies array:`, proxies.map(p => ({ name: p.name, url: p.url })));
  const proxyPreset = proxies.find((p) => p.name === profile.proxy);
  if (proxyPreset?.url) {
    debug(`[Proxy Detection] Found proxy preset "${profile.proxy}":`, proxyPreset.url);
    return proxyPreset.url;
  }

  const customUrl = extract_custom_url(profile);
  if (customUrl) {
    debug(`[Proxy Detection] Found custom endpoint URL in profile: ${customUrl}`);
    return customUrl;
  }

  const reverseProxyUrl = extract_reverse_proxy_url(profile);
  if (reverseProxyUrl) {
    debug(`[Proxy Detection] Found reverse proxy URL in profile: ${reverseProxyUrl}`);
    return reverseProxyUrl;
  }

  debug(`[Proxy Detection] No reverse proxy found`);
  return null;
}
function is_using_first_hop_proxy(profileName) {
  // Check if the given connection profile is using the first-hop proxy (localhost:8765)
  const proxyUrl = get_connection_profile_proxy_url(profileName);
  debug(`[Proxy Detection] Proxy URL for profile "${profileName}": ${proxyUrl}`);
  const isUsing = proxyUrl?.includes('http://localhost:8765') ?? false;
  debug(`[Proxy Detection] Is using first-hop proxy: ${isUsing}`);
  return isUsing;
}
async function should_send_chat_details() {
  // Automatically determine if chat details should be sent based on whether we're using first-hop proxy
  const profileName = await get_recap_connection_profile();
  debug(`[Proxy Detection] Recap connection profile: "${profileName}"`);
  if (!profileName) {
    debug('[Proxy Detection] No profile name, returning false');
    return false;
  }
  const result = is_using_first_hop_proxy(profileName);
  debug(`[Proxy Detection] Final result: ${result}`);
  return result;
}

export {
  check_connection_profiles_active,
  get_current_connection_profile,
  get_connection_profile_api,
  get_recap_connection_profile,
  set_connection_profile,
  get_connection_profiles,
  get_connection_profile_objects,
  verify_connection_profile,
  check_connection_profile_valid,
  get_connection_profile_proxy_url,
  is_using_first_hop_proxy,
  should_send_chat_details };
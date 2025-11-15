
import { get_settings, error, debug, toast_debounced, getContext, CONNECT_API_MAP, selectorsSillyTavern } from './index.js';
import { CONNECTION_TOAST_DURATION_MS, PROFILE_SWITCH_DELAY_MS } from './constants.js';

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
async function get_connection_profile_proxy_url(profileName) {
  // Get the proxy URL for a given connection profile
  if (!check_connection_profiles_active()) {
    debug('[Proxy Detection] Connection profiles not active');
    return null;
  }

  const ctx = getContext();
  const result = await ctx.executeSlashCommandsWithOptions(`/profile-get ${profileName}`);

  if (!result.pipe) {
    debug(`[Proxy Detection] /profile-get ${profileName} returned nothing - no connection profile selected`);
    return null;
  }

  let profileData;
  try {
    profileData = JSON.parse(result.pipe);
    debug(`[Proxy Detection] Full profile data:`, JSON.stringify(profileData, null, 2));
  } catch {
    error(`Failed to parse JSON from /profile-get for "${profileName}". Result:`);
    error(result);
    return null;
  }

  // Check if there's a direct URL in the profile (api-url field)
  if (profileData['api-url']) {
    debug(`[Proxy Detection] Found direct api-url in profile: ${profileData['api-url']}`);
    return profileData['api-url'];
  }

  // Get the proxy presets from connection manager
  const proxies = ctx.extensionSettings.connectionManager?.proxies || [];
  debug(`[Proxy Detection] Available proxies:`, proxies.length > 0 ? JSON.stringify(proxies, null, 2) : '(none)');

  // Look up the proxy URL by name
  const proxyPreset = proxies.find((p) => p.name === profileData.proxy);
  debug(`[Proxy Detection] Profile proxy name: "${profileData.proxy}", Found preset:`, proxyPreset ? JSON.stringify(proxyPreset, null, 2) : 'undefined');

  return proxyPreset?.url || null;
}
async function is_using_first_hop_proxy(profileName) {
  // Check if the given connection profile is using the first-hop proxy (localhost:8765)
  const proxyUrl = await get_connection_profile_proxy_url(profileName);
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
  const result = await is_using_first_hop_proxy(profileName);
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
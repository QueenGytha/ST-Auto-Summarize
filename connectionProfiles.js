import { get_settings, set_settings, error, debug, toast_debounced, getContext } from './index.js';

// Connection profiles
let connection_profiles_active;
function check_connection_profiles_active() {
    // detect whether the connection profiles extension is active by checking for the UI elements
    if (connection_profiles_active === undefined) {
        connection_profiles_active = $('#sys-settings-button').find('#connection_profiles').length > 0
        
        // If not found and we haven't retried yet, schedule a retry after 2 seconds
        if (!connection_profiles_active) {
            setTimeout(() => {
                connection_profiles_active = undefined; // Reset to force re-check
                // Try to refresh the UI if connection profiles are now available
                if ($('#sys-settings-button').find('#connection_profiles').length > 0) {
                    // Connection profiles are now available, refresh the settings UI
                    import('./profileUI.js').then(module => {
                        if (module.refresh_settings) {
                            module.refresh_settings();
                        }
                    });
                }
            }, 2000);
        }
    }
    return connection_profiles_active;
}
async function get_current_connection_profile() {
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    // get the current connection profile
    let ctx = getContext();
    let result = await ctx.executeSlashCommandsWithOptions(`/profile`)
    return result.pipe
}
async function get_connection_profile_api(name) {
    // Get the API for the given connection profile name. If not given, get the current summary profile.
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    if (name === undefined) name = await get_summary_connection_profile()
    let ctx = getContext();
    let result = await ctx.executeSlashCommandsWithOptions(`/profile-get ${name}`)

    if (!result.pipe) {
        debug(`/profile-get ${name} returned nothing - no connection profile selected`)
        return
    }

    let data;
    try {
        data = JSON.parse(result.pipe)
    } catch {
        error(`Failed to parse JSON from /profile-get for \"${name}\". Result:`)
        error(result)
        return
    }

    // If the API type isn't defined, it might be excluded from the connection profile. Assume based on mode.
    if (data.api === undefined) {
        debug(`API not defined in connection profile ${name}. Mode is ${data.mode}`)
        if (data.mode === 'tc') return 'textgenerationwebui'
        if (data.mode === 'cc') return 'openai'
    }

    // need to map the API type to a completion API
    if (CONNECT_API_MAP[data.api] === undefined) {
        error(`API type "${data.api}" not found in CONNECT_API_MAP - could not identify API.`)
        return
    }
    return CONNECT_API_MAP[data.api].selected
}
async function get_summary_connection_profile() {
    // get the current connection profile OR the default if it isn't valid for the current API
    let name = get_settings('connection_profile');

    // If none selected, invalid, or connection profiles not active, use the current profile
    if (name === "" || !await verify_connection_profile(name) || !check_connection_profiles_active()) {
        name = await get_current_connection_profile();
    }

    return name
}
async function set_connection_profile(name) {
    // Set the connection profile
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    if (name === await get_current_connection_profile()) return;  // If already using the current preset, return
    if (!await check_connection_profile_valid()) return;  // don't set an invalid preset

    // Set the completion preset
    debug(`Setting connection profile to "${name}"`)
    if (get_settings('debug_mode')) {
        toastr.info(`Setting connection profile to "${name}"`);
    }
    let ctx = getContext();
    await ctx.executeSlashCommandsWithOptions(`/profile ${name}`)
}
async function get_connection_profiles() {
    // Get a list of available connection profiles

    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    let ctx = getContext();
    let result = await ctx.executeSlashCommandsWithOptions(`/profile-list`)
    try {
        return JSON.parse(result.pipe)
    } catch {
        error("Failed to parse JSON from /profile-list. Result:")
        error(result)
    }

}
async function verify_connection_profile(name) {
    // check if the given connection profile name is valid
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    if (name === "") return true;  // no profile selected, always valid

    let names = await get_connection_profiles()
    return names.includes(name)
}
async function check_connection_profile_valid()  {
    // check whether the current connection profile selected for summarization is valid
    if (!check_connection_profiles_active()) return;  // if the extension isn't active, return
    let summary_connection = get_settings('connection_profile')
    let valid = await verify_connection_profile(summary_connection)
    if (!valid) {
        toast_debounced(`Your selected summary connection profile "${summary_connection}" is not valid.`, "warning")
    }
    return valid
}

export {
    check_connection_profiles_active,
    get_current_connection_profile,
    get_connection_profile_api,
    get_summary_connection_profile,
    set_connection_profile,
    get_connection_profiles,
    verify_connection_profile,
    check_connection_profile_valid
};
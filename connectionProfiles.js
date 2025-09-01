import { get_settings, set_settings, error, debug, toast_debounced, getContext, CONNECT_API_MAP } from './index.js';

// Connection profiles
let connection_profiles_active;
let connection_profiles_retry_attempted = false;
function check_connection_profiles_active() {
    // detect whether the connection profiles extension is active by checking for the UI elements
    if (connection_profiles_active === undefined) {
        let found = false;
        
        console.log('[ST-Auto-Summarize] Checking for connection profiles...');
        
        // Method 1: Check the original selector
        if ($('#sys-settings-button').find('#connection_profiles').length > 0) {
            found = true;
            console.log('[ST-Auto-Summarize] Connection profiles found via sys-settings-button');
        }
        
        // Method 2: Check for connection profiles in settings directly
        if (!found && $('#connection_profiles').length > 0) {
            found = true;
            console.log('[ST-Auto-Summarize] Connection profiles found via direct selector');
        }
        
        // Method 3: Check if the /profile command exists (indicates extension is loaded)
        if (!found) {
            try {
                const ctx = getContext();
                if (ctx && ctx.SlashCommandParser && ctx.SlashCommandParser.commands && ctx.SlashCommandParser.commands.has('profile')) {
                    found = true;
                    console.log('[ST-Auto-Summarize] Connection profiles found via slash command');
                }
            } catch (e) {
                // Ignore errors, extension might not be fully loaded yet
                console.log('[ST-Auto-Summarize] Error checking slash commands:', e.message);
            }
        }
        
        connection_profiles_active = found;
        console.log('[ST-Auto-Summarize] Connection profiles active:', found);
        
        // If not found and we haven't retried yet, schedule a retry after 2 seconds
        if (!found && !connection_profiles_retry_attempted) {
            connection_profiles_retry_attempted = true;
            console.log('[ST-Auto-Summarize] Connection profiles not found, scheduling retry in 2 seconds');
            setTimeout(() => {
                console.log('[ST-Auto-Summarize] Retrying connection profiles detection');
                connection_profiles_active = undefined; // Reset to force re-check
                const result = check_connection_profiles_active(); // Retry
                if (result) {
                    // Connection profiles were found, refresh the settings UI
                    console.log('[ST-Auto-Summarize] Connection profiles found after retry, refreshing settings UI');
                    // Import refresh_settings dynamically to avoid circular imports
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

function reset_connection_profiles_cache() {
    // Reset the cached value to force a re-check
    connection_profiles_active = undefined;
    connection_profiles_retry_attempted = false;
}

export {
    check_connection_profiles_active,
    get_current_connection_profile,
    get_connection_profile_api,
    get_summary_connection_profile,
    set_connection_profile,
    get_connection_profiles,
    verify_connection_profile,
    check_connection_profile_valid,
    reset_connection_profiles_cache
};
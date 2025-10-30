// @flow
import {
    log,
    error,
    toast,
    debug,
    extension_settings,
    MODULE_NAME,
    default_settings,
    refresh_settings,
    saveSettingsDebounced,
    get_extension_directory,
    load_profile,
    getContext,
    refresh_memory,
    update_all_message_visuals,
    scrollChatToBottom,
    selected_group
} from './index.js';
import { DEFAULT_MERGE_PROMPTS } from './trackingEntries.js';
import { DEFAULT_ENTITY_TYPES } from './entityTypes.js';

// Settings
const global_settings = {
    profiles: {},  // dict of profiles by name
    character_profiles: {},  // dict of character identifiers to profile names
    chat_profiles: {},  // dict of chat identifiers to profile names
    profile: 'Default', // Current profile
    notify_on_profile_switch: false,
    chats_enabled: {},  // dict of chat IDs to whether memory is enabled
    global_toggle_state: true,  // global state of memory (used when a profile uses the global state)
    disabled_group_characters: {},  // group chat IDs mapped to a list of disabled character keys
    memory_edit_interface_settings: {}  // settings last used in the memory edit interface
}
const settings_ui_map = {}  // map of settings to UI elements

// Settings Management
function initialize_settings() {
    if (extension_settings[MODULE_NAME] !== undefined) {  // setting already initialized
        log("Settings already initialized.")
        soft_reset_settings();
    } else {  // no settings present, first time initializing
        log("Extension settings not found. Initializing...")
        hard_reset_settings();
    }

    // Initialize Auto-Lorebooks GLOBAL settings (merged extension uses separate namespace)
    // NOTE: Per-profile settings (tracking, summary_processing) are stored in profiles via default_settings
    if (!extension_settings.autoLorebooks) {
        log("Auto-Lorebooks global settings not found. Initializing with defaults...")
        extension_settings.autoLorebooks = {
            enabledByDefault: true,
            nameTemplate: 'z-AutoLB - {{char}} - {{chat}}',
            deleteOnChatDelete: true,
            debug_mode: true,
            entity_types: [...DEFAULT_ENTITY_TYPES],
            queue: {
                enabled: true,
                use_lorebook: true,
                display_enabled: true
            }
        };
        saveSettingsDebounced();
    } else {
        // Merge with defaults for any missing global properties
        const defaultLorebooks = {
            enabledByDefault: true,
            nameTemplate: 'z-AutoLB - {{char}} - {{chat}}',
            deleteOnChatDelete: true,
            debug_mode: true,
            entity_types: [...DEFAULT_ENTITY_TYPES],
            queue: {
                enabled: true,
                use_lorebook: true,
                display_enabled: true
            }
        };

        // Deep merge nested objects (only global settings)
        extension_settings.autoLorebooks = {
            ...defaultLorebooks,
            ...extension_settings.autoLorebooks,
            queue: {
                ...defaultLorebooks.queue,
                ...extension_settings.autoLorebooks.queue
            }
        };

        // Remove old per-profile settings from global namespace if they exist
        // These are now stored in individual profiles
        if (extension_settings.autoLorebooks.tracking) {
            delete extension_settings.autoLorebooks.tracking;
        }
        if (extension_settings.autoLorebooks.summary_processing) {
            delete extension_settings.autoLorebooks.summary_processing;
        }
    }

    // load default profile
    load_profile();
}
function hard_reset_settings() {
    // Set the settings to the completely fresh values, deleting all profiles too
    // $FlowFixMe[prop-missing]
    if (global_settings['profiles']['Default'] === undefined) {  // if the default profile doesn't exist, create it
        // $FlowFixMe[prop-missing] [cannot-resolve-name]
        global_settings['profiles']['Default'] = structuredClone(default_settings);
    }
    // $FlowFixMe[cannot-resolve-name]
    extension_settings[MODULE_NAME] = structuredClone({
        ...default_settings,
        ...global_settings
    });
}
function soft_reset_settings() {
    // fix any missing settings without destroying profiles
    extension_settings[MODULE_NAME] = Object.assign(
        // $FlowFixMe[cannot-resolve-name]
        structuredClone(default_settings),
        // $FlowFixMe[cannot-resolve-name]
        structuredClone(global_settings),
        extension_settings[MODULE_NAME]
    );

    // check for any missing profiles
    const profiles = get_settings('profiles');
    if (Object.keys(profiles).length === 0) {
        log("No profiles found, creating default profile.")
        // $FlowFixMe[cannot-resolve-name]
        profiles['Default'] = structuredClone(default_settings);
        set_settings('profiles', profiles);
    } else { // for each existing profile, add any missing default settings without overwriting existing settings
        for (const [profile, settings] of Object.entries(profiles)) {
            // $FlowFixMe[cannot-resolve-name]
            profiles[profile] = Object.assign(structuredClone(default_settings), settings);
        }
        set_settings('profiles', profiles);
    }
}
function reset_settings() {
    // Reset ONLY the currently selected profile to defaults
    // Preserves all other profiles and global settings

    const currentProfile = get_settings('profile');
    const profiles = get_settings('profiles');

    if (!currentProfile) {
        log("No profile selected, cannot reset");
        toast("No profile selected", "error");
        return;
    }

    log(`Resetting profile "${currentProfile}" to defaults`);

    // Reset the current profile to default settings
    // This includes ALL 117+ settings - connection profiles, presets, prompts, everything
    // $FlowFixMe[cannot-resolve-name]
    profiles[currentProfile] = structuredClone(default_settings);

    set_settings('profiles', profiles);

    // Reload the profile to apply the reset settings
    load_profile(currentProfile);

    // Save immediately
    saveSettingsDebounced();

    // Refresh the UI
    refresh_settings();

    log(`Profile "${currentProfile}" reset to defaults`);
    toast(`Profile "${currentProfile}" reset to defaults`, "success");
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function set_settings(key /*: string */, value /*: any */) /*: void */ {
    // Set a setting for the extension and save it (value can be any type - legitimate use of any)
    extension_settings[MODULE_NAME][key] = value;
    saveSettingsDebounced();
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function get_settings(key /*: string */) /*: any */ {
    // Get a setting for the extension, or the default value if not set (returns any type - legitimate use of any)
    // $FlowFixMe[invalid-computed-prop] - key is a dynamic string property
    return extension_settings[MODULE_NAME]?.[key] ?? default_settings[key];
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function get_settings_element(key /*: string */) /*: any */ {
    // Returns DOM/jQuery element - any is appropriate
    // $FlowFixMe[invalid-computed-prop] - key is a dynamic string property
    return settings_ui_map[key]?.[0]
}
// $FlowFixMe[signature-verification-failure]
async function get_manifest() {
    // Get the manifest.json for the extension
    const module_dir = get_extension_directory();
    const path = `${module_dir}/manifest.json`
    // $FlowFixMe[cannot-resolve-name]
    const response = await fetch(path)
    if (response.ok) {
        return await response.json();
    }
    error(`Error getting manifest.json from "${path}": status: ${response.status}`);
}
// $FlowFixMe[signature-verification-failure]
async function load_settings_html() {
    // fetch the settings html file and append it to the settings div.
    log("Loading settings.html...")

    const module_dir = get_extension_directory()
    const path = `${module_dir}/settings.html`
    // $FlowFixMe[cannot-resolve-name]
    const found = await $.get(path).then(async response => {
        log(`Loaded settings.html at "${path}"`)
        // $FlowFixMe[cannot-resolve-name]
        $("#extensions_settings2").append(response);  // load html into the settings div\
        return true
    }).catch((response) => {
        error(`Error getting settings.json from "${path}": status: ${response.status}`);
        return false
    })

    return new Promise(resolve => resolve(found))
}

// $FlowFixMe[signature-verification-failure]
function chat_enabled() {
    // check if the extension is enabled in the current chat
    const context = getContext();

    // global state
    if (get_settings('use_global_toggle_state')) {
        return get_settings('global_toggle_state')
    }

    // per-chat state
    return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled')
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function toggle_chat_enabled(value /*: ?boolean */=null) /*: void */ {
    // Change the state of the extension. If value is null, toggle. Otherwise, set to the given value
    const current = chat_enabled();

    if (value === null) {  // toggle
        value = !current;
    } else if (value === current) {
        return;  // no change
    }

    // set the new value
    if (get_settings('use_global_toggle_state')) {   // using the global state - update the global state
        set_settings('global_toggle_state', value);
    } else {  // using per-chat state - update the chat state
        const enabled = get_settings('chats_enabled');
        const context = getContext();
        enabled[context.chatId] = value;
        set_settings('chats_enabled', enabled);
    }


    if (value) {
        // $FlowFixMe[cannot-resolve-name]
        toastr.info(`Memory is now enabled for this chat`);
    } else {
        // $FlowFixMe[cannot-resolve-name]
        toastr.warning(`Memory is now disabled for this chat`);
    }
    refresh_memory()

    // update the message visuals
    update_all_message_visuals()  //not needed? happens in update_message_influsion_flags

    // refresh settings UI
    refresh_settings()

    // scroll to the bottom of the chat
    scrollChatToBottom()
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function character_enabled(character_key /*: string */) /*: boolean */ {
    // check if the given character is enabled for summarization in the current chat
    const group_id = selected_group
    if (selected_group === null) return true;  // not in group chat, always enabled

    const disabled_characters_settings = get_settings('disabled_group_characters')
    const disabled_characters = disabled_characters_settings[group_id]
    if (!disabled_characters) return true;
    return !disabled_characters.includes(character_key)

}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function toggle_character_enabled(character_key /*: string */) /*: void */ {
    // Toggle whether the given character is enabled for summarization in the current chat
    const group_id = selected_group
    if (group_id === undefined) return;  // not in group chat, nothing to toggle

    const disabled_characters_settings = get_settings('disabled_group_characters')
    const disabled_characters = disabled_characters_settings[group_id] || []
    const disabled = disabled_characters.includes(character_key)

    if (disabled) {  // if currently disabled, enable by removing it from the disabled set
        disabled_characters.splice(disabled_characters.indexOf(character_key), 1);
    } else {  // if enabled, disable by adding it to the disabled set
        disabled_characters.push(character_key);
    }

    disabled_characters_settings[group_id] = disabled_characters
    set_settings('disabled_group_characters', disabled_characters_settings)
    debug(`${disabled ? "Enabled" : "Disabled"} group character summarization (${character_key})`)
    refresh_memory()
}

export {
    initialize_settings,
    hard_reset_settings,
    soft_reset_settings,
    reset_settings,
    set_settings,
    get_settings,
    get_settings_element,
    get_manifest,
    load_settings_html,
    global_settings,
    settings_ui_map,
    chat_enabled,
    toggle_chat_enabled,
    character_enabled,
    toggle_character_enabled
};

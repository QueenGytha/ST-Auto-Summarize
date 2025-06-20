import { initialize_settings_listeners } from './settingsUI.js';
import {
    initialize_settings,
    hard_reset_settings,
    soft_reset_settings,
    reset_settings,
    set_settings,
    get_settings,
    get_settings_element,
    get_manifest,
    load_settings_html
} from './settingsManager.js';
import { initialize_slash_commands } from './slashCommands.js';
import {
    log,
    debug,
    error,
    toast,
    toast_debounced,
    saveChatDebounced,
    count_tokens,
    get_context_size,
    get_long_token_limit,
    get_short_token_limit,
    get_current_character_identifier,
    get_current_chat_identifier,
    get_extension_directory,
    clean_string_for_title,
    escape_string,
    unescape_string,
    check_st_version
} from './utils.js';
import {
    get_combined_summary_key,
    save_combined_summary,
    load_combined_summary,
    get_combined_summary_preset_max_tokens,
    get_combined_memory,
    create_combined_summary_prompt,
    collect_messages_to_combine,
    flag_summaries_as_combined,
    generate_combined_summary
} from './combinedSummary.js';
import {
    copy_settings,
    detect_settings_difference,
    save_profile,
    load_profile,
    export_profile,
    import_profile,
    rename_profile,
    new_profile,
    delete_profile,
    toggle_character_profile,
    toggle_chat_profile,
    get_character_profile,
    set_character_profile,
    get_chat_profile,
    auto_load_profile,
    set_chat_profile
} from './profileManager.js';
import {
    default_combined_summary_prompt,
    default_prompt,
    default_long_template,
    default_short_template,
    default_combined_template // <-- add this line
} from './defaultPrompts.js';
import { MemoryEditInterface } from './memoryEditInterface.js';
import { default_settings } from './defaultSettings.js';
import { getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition } from '../../../utils.js';
import { getContext, getApiUrl, extension_settings } from '../../../extensions.js';
import {
    animation_duration,
    scrollChatToBottom,
    extension_prompt_roles,
    extension_prompt_types,
    is_send_press,
    saveSettingsDebounced,
    generateRaw,
    getMaxContextSize,
    streamingProcessor,
    amount_gen,
    system_message_types,
    CONNECT_API_MAP,
    main_api,
    chat_metadata,
} from '../../../../script.js';
import { getPresetManager } from '../../../preset-manager.js'
import { formatInstructModeChat } from '../../../instruct-mode.js';
import { is_group_generating, selected_group, openGroupId } from '../../../group-chats.js';
import { loadMovingUIState, renderStoryString, power_user } from '../../../power-user.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { debounce_timeout } from '../../../constants.js';
import { MacrosParser } from '../../../macros.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { getRegexScripts } from '../../../../scripts/extensions/regex/index.js'
import { runRegexScript } from '../../../../scripts/extensions/regex/engine.js'

import {
    addSceneBreakButton,
    bindSceneBreakButton,
    renderAllSceneBreaks
} from './sceneBreak.js';

export { MODULE_NAME };

// THe module name modifies where settings are stored, where information is stored on message objects, macros, etc.
const MODULE_NAME = 'auto_summarize_memory';
const MODULE_NAME_FANCY = 'auto_summarize Memory';
const PROGRESS_BAR_ID = `${MODULE_NAME}_progress_bar`;

// CSS classes (must match the CSS file because I'm too stupid to figure out how to do this properly)
const css_message_div = "auto_summarize_memory_display"
const css_short_memory = "auto_summarize_short_memory"
const css_long_memory = "auto_summarize_long_memory"
const css_remember_memory = `auto_summarize_old_memory`
const css_exclude_memory = `auto_summarize_exclude_memory`
const css_lagging_memory = `auto_summarize_lagging_memory`
const summary_div_class = `auto_summarize_memory_text`  // class put on all added summary divs to identify them
const summary_reasoning_class = 'auto_summarize_memory_reasoning'
const css_button_separator = `auto_summarize_memory_button_separator`
const css_edit_textarea = `auto_summarize_memory_edit_textarea`
const settings_div_id = `auto_summarize_memory_settings`  // ID of the main settings div.
const settings_content_class = `auto_summarize_memory_settings_content` // Class for the main settings content div which is transferred to the popup
const group_member_enable_button = `auto_summarize_memory_group_member_enable`
const group_member_enable_button_highlight = `auto_summarize_memory_group_member_enabled`

// Macros for long-term and short-term memory injection
const long_memory_macro = `long_term_memory`;
const short_memory_macro = `short_term_memory`;
const generic_memories_macro = `memories`;

// message button classes
const remember_button_class = `${MODULE_NAME}_remember_button`
const summarize_button_class = `${MODULE_NAME}_summarize_button`
const edit_button_class = `${MODULE_NAME}_edit_button`
const forget_button_class = `${MODULE_NAME}_forget_button`
const delete_button_class = `${MODULE_NAME}_delete_button`

// Combined Summary Feature additions at the top
const combined_memory_macro = `combined_memory`;

Object.assign(default_settings, {
    combined_summary_new_count: 0,
    combined_summary_enabled: false,
    show_combined_summary_toast: true,
    combined_summary_prompt: default_combined_summary_prompt,
    combined_summary_prefill: "",
    combined_summary_template: default_combined_template,
    combined_summary_position: extension_prompt_types.IN_PROMPT,
    combined_summary_depth: 2,
    combined_summary_role: extension_prompt_roles.SYSTEM,
    combined_summary_scan: false,
    combined_summary_context_limit: 10,
    combined_summary_context_type: 'percent',
    combined_summary_connection_profile: "",
    combined_summary_completion_preset: "",
});

async function validate_summary(summary, type = "regular") {
    if (!get_settings('error_detection_enabled')) return true;
    
    // Check if error detection is enabled for this summary type
    const enabled_key = type === "regular" ? 'regular_summary_error_detection_enabled' : 'combined_summary_error_detection_enabled';
    if (!get_settings(enabled_key)) return true;
    
    debug(`[Validation] Validating ${type} summary...`);
    
    // Ensure chat is blocked during validation
    let ctx = getContext();
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    try {
        // Get the error detection prompt
        const prompt_key = type === "regular" ? 'regular_summary_error_detection_prompt' : 'combined_summary_error_detection_prompt';
        let prompt = get_settings(prompt_key);
        
        // Substitute the summary in the prompt
        prompt = prompt.replace("{{summary}}", summary);
        
        // Save current preset and profile
        const summary_preset = type === "regular" ? 
            get_settings('completion_preset') : 
            get_settings('combined_summary_completion_preset');
        const current_preset = await get_current_preset();
        const summary_profile = get_settings('connection_profile');
        const current_profile = await get_current_connection_profile();

        // Set the error detection preset
        const preset_key = type === "regular" ? 'regular_summary_error_detection_preset' : 'combined_summary_error_detection_preset';
        const error_preset = get_settings(preset_key);
        if (error_preset) {
            debug(`[Validation] Using custom validation preset: ${error_preset}`);
            await set_preset(error_preset);
        }

        // Add prefill if configured
        const prefill_key = type === "regular" ? 'regular_summary_error_detection_prefill' : 'combined_summary_error_detection_prefill';
        const prefill = get_settings(prefill_key);
        if (prefill) {
            debug(`[Validation] Adding prefill to validation prompt`);
            prompt = `${prompt}\n${prefill}`;
        }
        
        // Generate validation response
        let validation_result;
        debug(`[Validation] Sending validation prompt: ${prompt.substring(0, 200)}...`);
        validation_result = await summarize_text(prompt);
        debug(`[Validation] Raw validation result: ${validation_result}`);
        
        // Clean up and check result
        validation_result = validation_result.trim().toUpperCase();
        const is_valid = validation_result.includes("VALID") && !validation_result.includes("INVALID");
        
        if (!is_valid) {
            debug(`[Validation] Summary validation failed: "${validation_result}"`);
        } else {
            debug(`[Validation] Summary validation passed with result: "${validation_result}"`);
        }
        
        // Restore original preset and profile
        await set_preset(current_preset);
        await set_connection_profile(current_profile);
        
        return is_valid;
    } catch (e) {
        error(`[Validation] Error during summary validation: ${e}`);
        
        // Restore original preset and profile
        await set_preset(current_preset);
        await set_connection_profile(current_profile);
        
        // If validation fails technically, assume the summary is valid
        return true;
    } finally {
        // We don't re-enable buttons here because that will be handled 
        // by the calling function after all retries are complete
    }
}

// global flags and whatnot
var STOP_SUMMARIZATION = false  // flag toggled when stopping summarization
var SUMMARIZATION_DELAY_TIMEOUT = null  // the set_timeout object for the summarization delay
var SUMMARIZATION_DELAY_RESOLVE = null

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


// Completion presets
function get_current_preset() {
    // get the currently selected completion preset
    return getPresetManager().getSelectedPresetName()
}
async function get_summary_preset() {
    // get the current summary preset OR the default if it isn't valid for the current API
    let preset_name = get_settings('completion_preset');
    if (preset_name === "" || !await verify_preset(preset_name)) {  // none selected or invalid, use the current preset
        preset_name = get_current_preset();
    }
    return preset_name
}
async function set_preset(name) {
    if (name === get_current_preset()) return;  // If already using the current preset, return

    if (!check_preset_valid()) return;  // don't set an invalid preset

    // Set the completion preset
    debug(`Setting completion preset to ${name}`)
    if (get_settings('debug_mode')) {
        // commented out toast // toastr.info(`Setting completion preset to ${name}`);
    }
    let ctx = getContext();
    await ctx.executeSlashCommandsWithOptions(`/preset ${name}`)
}
async function get_presets() {
    // Get the list of available completion presets for the selected connection profile API
    let summary_api = await get_connection_profile_api()  // API for the summary connection profile (undefined if not active)
    let { presets, preset_names } = getPresetManager().getPresetList(summary_api)  // presets for the given API (current if undefined)
    // array of names
    if (Array.isArray(preset_names)) return preset_names
    // object of {names: index}
    return Object.keys(preset_names)
}
async function verify_preset(name) {
    // check if the given preset name is valid for the current API
    if (name === "") return true;  // no preset selected, always valid

    let preset_names = await get_presets()

    if (Array.isArray(preset_names)) {  // array of names
        return preset_names.includes(name)
    } else {  // object of {names: index}
        return preset_names[name] !== undefined
    }

}
async function check_preset_valid() {
    // check whether the current preset selected for summarization is valid
    let summary_preset = get_settings('completion_preset')
    let valid_preset = await verify_preset(summary_preset)
    if (!valid_preset) {
        toast_debounced(`Your selected summary preset "${summary_preset}" is not valid for the current API.`, "warning")
        return false
    }
    return true
}
async function get_summary_preset_max_tokens() {
    // get the maximum token length for the chosen summary preset
    let preset_name = await get_summary_preset()
    let preset = getPresetManager().getCompletionPresetByName(preset_name)

    // if the preset doesn't have a genamt (which it may not for some reason), use the current genamt. See https://discord.com/channels/1100685673633153084/1100820587586273343/1341566534908121149
    // Also if you are using chat completion, it's openai_max_tokens instead.
    let max_tokens = preset?.genamt || preset?.openai_max_tokens || amount_gen
    debug("Got summary preset genamt: "+max_tokens)

    return max_tokens
}

// Connection profiles
let connection_profiles_active;
function check_connection_profiles_active() {
    // detect whether the connection profiles extension is active by checking for the UI elements
    if (connection_profiles_active === undefined) {
        connection_profiles_active = $('#sys-settings-button').find('#connection_profiles').length > 0
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

function chat_enabled() {
    // check if the extension is enabled in the current chat
    let context = getContext();

    // global state
    if (get_settings('use_global_toggle_state')) {
        return get_settings('global_toggle_state')
    }

    // per-chat state
    return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled')
}
function toggle_chat_enabled(value=null) {
    // Change the state of the extension. If value is null, toggle. Otherwise, set to the given value
    let current = chat_enabled();

    if (value === null) {  // toggle
        value = !current;
    } else if (value === current) {
        return;  // no change
    }

    // set the new value
    if (get_settings('use_global_toggle_state')) {   // using the global state - update the global state
        set_settings('global_toggle_state', value);
    } else {  // using per-chat state - update the chat state
        let enabled = get_settings('chats_enabled');
        let context = getContext();
        enabled[context.chatId] = value;
        set_settings('chats_enabled', enabled);
    }


    if (value) {
        toastr.info(`Memory is now enabled for this chat`);
    } else {
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
function character_enabled(character_key) {
    // check if the given character is enabled for summarization in the current chat
    let group_id = selected_group
    if (selected_group === null) return true;  // not in group chat, always enabled

    let disabled_characters_settings = get_settings('disabled_group_characters')
    let disabled_characters = disabled_characters_settings[group_id]
    if (!disabled_characters) return true;
    return !disabled_characters.includes(character_key)

}
function toggle_character_enabled(character_key) {
    // Toggle whether the given character is enabled for summarization in the current chat
    let group_id = selected_group
    if (group_id === undefined) return true;  // not in group chat, always enabled

    let disabled_characters_settings = get_settings('disabled_group_characters')
    let disabled_characters = disabled_characters_settings[group_id] || []
    let disabled = disabled_characters.includes(character_key)

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


/**
 * Bind a UI element to a setting.
 * @param selector {string} jQuery Selector for the UI element
 * @param key {string} Key of the setting
 * @param type {string} Type of the setting (number, boolean)
 * @param callback {function} Callback function to run when the setting is updated
 * @param disable {boolean} Whether to disable the element when chat is disabled
 */
function bind_setting(selector, key, type=null, callback=null, disable=true) {
    // Bind a UI element to a setting, so if the UI element changes, the setting is updated
    selector = `.${settings_content_class} ${selector}`  // add the settings div to the selector
    let element = $(selector)
    settings_ui_map[key] = [element, type]

    // if no elements found, log error
    if (element.length === 0) {
        error(`No element found for selector [${selector}] for setting [${key}]`);
        return;
    }

    // mark as a settings UI function
    if (disable) {
        element.addClass('settings_input');
    }

    // default trigger for a settings update is on a "change" event (as opposed to an input event)
    let trigger = 'change';

    // Set the UI element to the current setting value
    set_setting_ui_element(key, element, type);

    // Make the UI element update the setting when changed
    element.on(trigger, function (event) {
        let value;
        if (type === 'number') {  // number input
            value = Number($(this).val());
        } else if (type === 'boolean') {  // checkbox
            value = Boolean($(this).prop('checked'));
        } else {  // text, dropdown, select2
            value = $(this).val();
            value = unescape_string(value)  // ensures values like "\n" are NOT escaped from input
        }

        // update the setting
        set_settings(key, value)

        // trigger callback if provided, passing the new value
        if (callback !== null) {
            callback(value);
        }

        // update all other settings UI elements
        refresh_settings()

        // refresh memory state (update message inclusion criteria, etc)
        if (trigger === 'change') {
            refresh_memory();
        } else if (trigger === 'input') {
            refresh_memory_debounced();  // debounce the refresh for input elements
        }
    });
}
function bind_function(selector, func, disable=true) {
    // bind a function to an element (typically a button or input)
    // if disable is true, disable the element if chat is disabled
    selector = `.${settings_content_class} ${selector}`
    let element = $(selector);
    if (element.length === 0) {
        error(`No element found for selector [${selector}] when binding function`);
        return;
    }

    // mark as a settings UI element
    if (disable) {
        element.addClass('settings_input');
    }

    // check if it's an input element, and bind a "change" event if so
    if (element.is('input')) {
        element.on('change', function (event) {
            func(event);
        });
    } else {  // otherwise, bind a "click" event
        element.on('click', function (event) {
            func(event);
        });
    }
}
function set_setting_ui_element(key, element, type) {
    // Set a UI element to the current setting value
    let radio = false;
    if (element.is('input[type="radio"]')) {
        radio = true;
    }

    // get the setting value
    let setting_value = get_settings(key);
    if (type === "text") {
        setting_value = escape_string(setting_value)  // escape values like "\n"
    }

    // initialize the UI element with the setting value
    if (radio) {  // if a radio group, select the one that matches the setting value
        let selected = element.filter(`[value="${setting_value}"]`)
        if (selected.length === 0) {
            error(`Error: No radio button found for value [${setting_value}] for setting [${key}]`);
            return;
        }
        selected.prop('checked', true);
    } else {  // otherwise, set the value directly
        if (type === 'boolean') {  // checkbox
            element.prop('checked', setting_value);
        } else {  // text input or dropdown
            element.val(setting_value);
        }
    }
}
function update_save_icon_highlight() {
    // If the current settings are different than the current profile, highlight the save button
    if (detect_settings_difference()) {
        $('#save_profile').addClass('button_highlight');
    } else {
        $('#save_profile').removeClass('button_highlight');
    }
}
function update_profile_section() {
    let context = getContext()

    let current_profile = get_settings('profile')
    let current_character_profile = get_character_profile();
    let current_chat_profile = get_chat_profile();
    let profile_options = Object.keys(get_settings('profiles'));

    let $choose_profile_dropdown = $(`.${settings_content_class} #profile`).empty();
    let $character = $('button#character_profile')
    let $chat = $('button#chat_profile')
    let $character_icon = $character.find('i')
    let $chat_icon = $chat.find('i')


    // Set the profile dropdowns to reflect the available profiles and the currently chosen one
    for (let profile of profile_options) {
        // if the current character/chat has a default profile, indicate as such
        let text = profile
        if (profile === current_character_profile) {
            text = `${profile} (character)`
        } else if (profile === current_chat_profile) {
            text = `${profile} (chat)`
        }
        $choose_profile_dropdown.append(`<option value="${profile}">${text}</option>`);
    }

    // if (current_character_profile) {  // set the current chosen profile in the dropdown
    //     choose_profile_dropdown.val(current_character_profile);
    // }


    // When in a group chat, the character profile lock is disabled
    if (context.groupId) {
        $character.prop('disabled', true)
    }

    // button highlights and icons

    let lock_class = 'fa-lock'
    let unlock_class = 'fa-unlock'
    let highlight_class = 'button_highlight'

    if (current_character_profile === current_profile) {
        $character.addClass(highlight_class);
        $character_icon.removeClass(unlock_class)
        $character_icon.addClass(lock_class)
    } else {
        $character.removeClass(highlight_class)
        $character_icon.removeClass(lock_class)
        $character_icon.addClass(unlock_class)
    }

    if (current_chat_profile === current_profile) {
        $chat.addClass(highlight_class);
        $chat_icon.removeClass(unlock_class)
        $chat_icon.addClass(lock_class)
    } else {
        $chat.removeClass(highlight_class)
        $chat_icon.removeClass(lock_class)
        $chat_icon.addClass(unlock_class)
    }
}
async function update_preset_dropdown() {
    // set the completion preset dropdown
    let $preset_select = $(`.${settings_content_class} #completion_preset`);
    let summary_preset = get_settings('completion_preset')
    let preset_options = await get_presets()
    $preset_select.empty();
    $preset_select.append(`<option value="">Same as Current</option>`)
    for (let option of preset_options) {  // construct the dropdown options
        $preset_select.append(`<option value="${option}">${option}</option>`)
    }
    $preset_select.val(summary_preset)

    // set a click event to refresh the preset dropdown for the currently available presets
    $preset_select.off('click').on('click', () => update_preset_dropdown());

}
async function update_combined_summary_preset_dropdown() {
    let $preset_select = $(`.${settings_content_class} #combined_summary_completion_preset`);
    let summary_preset = get_settings('combined_summary_completion_preset');
    let preset_options = await get_presets();
    $preset_select.empty();
    $preset_select.append(`<option value="">Same as Current</option>`);
    for (let option of preset_options) {
        $preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $preset_select.val(summary_preset);

    // Refresh on click
    $preset_select.off('click').on('click', () => update_combined_summary_preset_dropdown());
}
async function update_connection_profile_dropdown() {
    // set the completion preset dropdown
    let $connection_select = $(`.${settings_content_class} #connection_profile`);
    let summary_connection = get_settings('connection_profile')
    let connection_options = await get_connection_profiles()
    $connection_select.empty();
    $connection_select.append(`<option value="">Same as Current</option>`)
    for (let option of connection_options) {  // construct the dropdown options
        $connection_select.append(`<option value="${option}">${option}</option>`)
    }
    $connection_select.val(summary_connection)

    // set a click event to refresh the dropdown
    $connection_select.off('click').on('click', () => update_connection_profile_dropdown());
}
function refresh_settings() {
    // Refresh all settings UI elements according to the current settings
    debug("Refreshing settings...")

        // Error detection presets
    update_error_detection_preset_dropdown();
    
    // Enable/disable error detection fields based on master toggle
    let error_detection_enabled = get_settings('error_detection_enabled');
    $(`.${settings_content_class} .error_detection_setting`).prop('disabled', !error_detection_enabled);
    
    // Enable/disable type-specific error detection settings
    let regular_error_enabled = get_settings('regular_summary_error_detection_enabled');
    let combined_error_enabled = get_settings('combined_summary_error_detection_enabled');
    
    $(`.${settings_content_class} .regular_error_detection_setting`).prop('disabled', !error_detection_enabled || !regular_error_enabled);
    $(`.${settings_content_class} .combined_error_detection_setting`).prop('disabled', !error_detection_enabled || !combined_error_enabled);

    // connection profiles
    if (check_connection_profiles_active()) {
        update_connection_profile_dropdown()
        check_connection_profile_valid()
    } else { // if connection profiles extension isn't active, hide the connection profile dropdown
        $(`.${settings_content_class} #connection_profile`).parent().hide()
        debug("Connection profiles extension not active. Hiding connection profile dropdown.")
    }

    // completion presets
    update_preset_dropdown()
    update_combined_summary_preset_dropdown();
    check_preset_valid()

    // if prompt doesn't have {{message}}, insert it
    if (!get_settings('prompt').includes("{{message}}")) {
        set_settings('prompt', get_settings('prompt') + "\n{{message}}")
        debug("{{message}} macro not found in summary prompt. It has been added automatically.")
    }

    // auto_summarize_message_limit must be >= auto_summarize_batch_size (unless the limit is disabled, i.e. -1)
    let auto_limit = get_settings('auto_summarize_message_limit')
    let batch_size = get_settings('auto_summarize_batch_size')
    if (auto_limit >= 0 && (auto_limit < batch_size)) {
        set_settings('auto_summarize_message_limit', get_settings('auto_summarize_batch_size'));
        toast("The auto-summarize message limit must be greater than or equal to the batch size.", "warning")
    }

    // update the save icon highlight
    update_save_icon_highlight();

    // update the profile section
    update_profile_section()

    // iterate through the settings map and set each element to the current setting value
    for (let [key, [element, type]] of Object.entries(settings_ui_map)) {
        set_setting_ui_element(key, element, type);
    }

    // enable or disable settings based on others
    if (chat_enabled()) {
        $(`.${settings_content_class} .settings_input`).prop('disabled', false);  // enable all settings

        // when auto-summarize is disabled, related settings get disabled
        let auto_summarize = get_settings('auto_summarize');
        get_settings_element('auto_summarize_on_send')?.prop('disabled', !auto_summarize)
        get_settings_element('auto_summarize_message_limit')?.prop('disabled', !auto_summarize);
        get_settings_element('auto_summarize_batch_size')?.prop('disabled', !auto_summarize);
        get_settings_element('auto_summarize_progress')?.prop('disabled', !auto_summarize);
        get_settings_element('summarization_delay')?.prop('disabled', !auto_summarize);


        // If message history is disabled, disable the relevant settings
        let history_disabled = get_settings('include_message_history_mode') === "none";
        get_settings_element('include_message_history')?.prop('disabled', history_disabled)
        get_settings_element('include_user_messages_in_history')?.prop('disabled', history_disabled)
        get_settings_element('preview_message_history')?.prop('disabled', history_disabled)

        if (!history_disabled && !get_settings('prompt').includes("{{history}}")) {
            toastr.warning("To include message history, you must use the {{history}} macro in the prompt.")
        }

        // If not excluding message, then disable the option to preserve the last user message
        let excluding_messages = get_settings('exclude_messages_after_threshold')
        get_settings_element('keep_last_user_message')?.prop('disabled', !excluding_messages)


    } else {  // memory is disabled for this chat
        $(`.${settings_content_class} .settings_input`).prop('disabled', true);  // disable all settings
    }


    //////////////////////
    // Settings not in the config

    // set group chat character enable button state
    set_character_enabled_button_states()

}

// some unused function for a multiselect
function refresh_character_select() {
    // sets the select2 multiselect for choosing a list of characters
    let context = getContext()

    // get all characters present in the current chat
    let char_id = context.characterId;
    let group_id = context.groupId;
    let character_options = []  // {id, name}
    if (char_id !== undefined && char_id !== null) {  // we are in an individual chat, add the character
        let id = context.characters[char_id].avatar
        character_options.push({id: id, name: context.characters[char_id].name})
    } else if (group_id) {   // we are in a group - add all members
        let group = context.groups.find(g => g.id == group_id)  // find the group we are in by ID
        for (let key of group.members) {
            let char = context.characters.find(c => c.avatar == key)
            character_options.push({id: key, name: char.name})  // add all group members to options
        }
    }

    // add the user to the list of options
    character_options.push({id: "user", name: "User (you)"})

    // set the current value (default if empty)
    let current_selection = get_settings('characters_to_summarize')
    log(current_selection)

    // register the element as a select2 widget
    refresh_select2_element('characters_to_summarize', current_selection, character_options,'No characters filtered - all will be summarized.')

}

/*
Use like this:
<div class="flex-container justifySpaceBetween alignItemsCenter">
    <label title="description here">
        <span>label here</span>
        <select id="id_here" multiple="multiple" class="select2_multi_sameline"></select>
    </label>
</div>
 */
function refresh_select2_element(id, selected, options, placeholder="") {
    // Refresh a select2 element with the given ID (a select element) and set the options

    // check whether the dropdown is open. If so, don't update the options (it messes with the widget)
    let $dropdown = $(`#select2-${id}-results`)
    if ($dropdown.length > 0) {
        return
    }

    let $select = $(`#${id}`)
    $select.empty()  // clear current options

    // add the options to the dropdown
    for (let {id, name} of options) {
        let option = $(`<option value="${id}">${name}</option>`)
        $select.append(option);
    }

    // If the select2 widget hasn't been created yet, create it
    let $widget = $(`.${settings_content_class} ul#select2-${id}-container`)
    if ($widget.length === 0) {
        $select.select2({  // register as a select2 element
            width: '100%',
            placeholder: placeholder,
            allowClear: true,
            closeOnSelect: false,
        });

        // select2ChoiceClickSubscribe($select, () => {
        //     log("CLICKED")
        // }, {buttonStyle: true, closeDrawer: true});

        //$select.on('select2:unselect', unselect_callback);
        //$select.on('select2:select', select_callback);
    }

    // set current selection.
    // change.select2 lets the widget update itself, but doesn't trigger the change event (which would cause infinite recursion).
    $select.val(selected)
    $select.trigger('change.select2')
}

// UI functions
function get_message_div(index) {
    // given a message index, get the div element for that message
    // it will have an attribute "mesid" that is the message index
    let div = $(`div[mesid="${index}"]`);
    if (div.length === 0) {
        return null;
    }
    return div;
}
function get_summary_style_class(message) {
    let include = get_data(message, 'include');
    let remember = get_data(message, 'remember');
    let exclude = get_data(message, 'exclude');  // force-excluded by user
    let lagging = get_data(message, 'lagging');  // not injected yet

    let style = ""
    if (remember && include) {  // marked to be remembered and included in memory anywhere
        style = css_long_memory
    } else if (include === "short") {  // not marked to remember, but included in short-term memory
        style = css_short_memory
    } else if (remember) {  // marked to be remembered but not included in memory
        style = css_remember_memory
    } else if (exclude) {  // marked as force-excluded
        style = css_exclude_memory
    }

    if (lagging) {
        style = `${style} ${css_lagging_memory}`
    }

    return style
}
function update_message_visuals(i, style=true, text=null) {
    // Update the message visuals according to its current memory status
    // Each message div will have a div added to it with the memory for that message.
    // Even if there is no memory, I add the div because otherwise the spacing changes when the memory is added later.

    // div not found (message may not be loaded)
    let div_element = get_message_div(i);
    if (!div_element) {
        return;
    }

    // remove any existing added divs
    div_element.find(`div.${summary_div_class}`).remove();

    // If setting isn't enabled, don't display memories
    if (!get_settings('display_memories') || !chat_enabled()) {
        return;
    }

    let chat = getContext().chat;
    let message = chat[i];
    let error_message = get_data(message, 'error');
    let reasoning = get_data(message, 'reasoning')
    let memory = get_memory(message)

    // get the div holding the main message text
    let message_element = div_element.find('div.mes_text');
    let style_class = style ? get_summary_style_class(message) : ""

    // if no text is provided, use the memory text
    if (!text) {
        text = ""  // default text when no memory
        if (memory) {
            text = clean_string_for_title(`Memory: ${memory}`)
        } else if (error_message) {
            style_class = ''  // clear the style class if there's an error
            text = `Error: ${error_message}`
        }
    }

    // create the div element for the memory and add it to the message div
    let memory_div = $(`<div class="${summary_div_class} ${css_message_div}"><span class="${style_class}">${text}</span></div>`)
    if (reasoning) {
        reasoning = clean_string_for_title(reasoning)
        memory_div.prepend($(`<span class="${summary_reasoning_class}" title="${reasoning}">[Reasoning] </span>`))
    }
    message_element.after(memory_div);

    // add a click event to the memory div to edit the memory
    memory_div.on('click', function () {
        open_edit_memory_input(i);
    })
}
function update_all_message_visuals() {
    // update the message visuals of each visible message, styled according to the inclusion criteria
    let chat = getContext().chat
    let first_displayed_message_id = Number($('#chat').children('.mes').first().attr('mesid'))
    for (let i=chat.length-1; i >= first_displayed_message_id; i--) {
        update_message_visuals(i, true);
    }
}
function open_edit_memory_input(index) {
    // Allow the user to edit a message summary
    let message = getContext().chat[index];
    let memory = get_memory(message)
    memory = memory?.trim() ?? '';  // get the current memory text

    let $message_div = get_message_div(index);  // top level div for this message
    let $message_text_div = $message_div.find('.mes_text')  // holds message text
    let $memory_div = $message_div.find(`div.${summary_div_class}`);  // div holding the memory text

    // Hide the memory div and add the textarea after the main message text
    let $textarea = $(`<textarea class="${css_message_div} ${css_edit_textarea}" rows="1"></textarea>`);
    $memory_div.hide();
    $message_text_div.after($textarea);
    $textarea.focus();  // focus on the textarea
    $textarea.val(memory);  // set the textarea value to the memory text (this is done after focus to keep the cursor at the end)
    $textarea.height($textarea[0].scrollHeight-10);  // set the height of the textarea to fit the text

    function confirm_edit() {
        let new_memory = $textarea.val();
        if (new_memory === memory) {  // no change
            cancel_edit()
            return;
        }
        edit_memory(message, new_memory)
        $textarea.remove();  // remove the textarea
        $memory_div.show();  // show the memory div
        refresh_memory();
    }

    function cancel_edit() {
        $textarea.remove();  // remove the textarea
        $memory_div.show();  // show the memory div
    }

    // save when the textarea loses focus, or when enter is pressed
    $textarea.on('blur', confirm_edit);
    $textarea.on('keydown', function (event) {
        if (event.key === 'Enter') {  // confirm edit
            event.preventDefault();
            confirm_edit();
        } else if (event.key === 'Escape') {  // cancel edit
            event.preventDefault();
            cancel_edit();
        }
    })
}
function display_injection_preview() {
    let text = refresh_memory()
    text = `...\n\n${text}\n\n...`
    display_text_modal("Memory State Preview", text);
}

async function display_text_modal(title, text="") {
    // Display a modal with the given title and text
    // replace newlines in text with <br> for HTML
    let ctx = getContext();
    text = text.replace(/\n/g, '<br>');
    let html = `<h2>${title}</h2><div style="text-align: left; overflow: auto;">${text}</div>`
    //const popupResult = await ctx.callPopup(html, 'text', undefined, { okButton: `Close` });
    let popup = new ctx.Popup(html, ctx.POPUP_TYPE.TEXT, undefined, {okButton: 'Close', allowVerticalScrolling: true});
    await popup.show()
}
async function get_user_setting_text_input(key, title, description="") {
    // Display a modal with a text area input, populated with a given setting value
    let value = get_settings(key) ?? '';

    title = `
<h3>${title}</h3>
<p>${description}</p>
`

    let restore_button = {  // don't specify "result" key do not close the popup
        text: 'Restore Default',
        appendAtEnd: true,
        action: () => { // fill the input with the default value
            popup.mainInput.value = default_settings[key] ?? '';
        }
    }
    let ctx = getContext();
    let popup = new ctx.Popup(title, ctx.POPUP_TYPE.INPUT, value, {rows: 20, customButtons: [restore_button]});

    // Now remove the ".result-control" class to prevent it from submitting when you hit enter.
    popup.mainInput.classList.remove('result-control');

    let input = await popup.show();
    if (input) {
        set_settings(key, input);
        refresh_settings()
        refresh_memory()
    }
}
function progress_bar(id, progress, total, title) {
    // Display, update, or remove a progress bar
    id = `${PROGRESS_BAR_ID}_${id}`
    let $existing = $(`.${id}`);
    if ($existing.length > 0) {  // update the progress bar
        if (title) $existing.find('div.title').text(title);
        if (progress) {
            $existing.find('span.progress').text(progress)
            $existing.find('progress').val(progress)
        }
        if (total) {
            $existing.find('span.total').text(total)
            $existing.find('progress').attr('max', total)
        }
        return;
    }

    // create the progress bar
    let bar = $(`
<div class="${id} auto_summarize_progress_bar flex-container justifyspacebetween alignitemscenter">
    <div class="title">${title}</div>
    <div>(<span class="progress">${progress}</span> / <span class="total">${total}</span>)</div>
    <progress value="${progress}" max="${total}" class="flex1"></progress>
    <button class="menu_button fa-solid fa-stop" title="Abort summarization"></button>
</div>`)

    // add a click event to abort the summarization
    bar.find('button').on('click', function () {
        stop_summarization();
    })

    // append to the main chat area (#sheld)
    $('#sheld').append(bar);

    // append to the edit interface if it's open
    if (memoryEditInterface?.is_open()) {
        memoryEditInterface.$progress_bar.append(bar)
    }
}
function remove_progress_bar(id) {
    id = `${PROGRESS_BAR_ID}_${id}`
    let $existing = $(`.${id}`);
    if ($existing.length > 0) {  // found
        debug("Removing progress bar")
        $existing.remove();
    }
}

// Message functions
function set_data(message, key, value) {
    // store information on the message object
    if (!message.extra) {
        message.extra = {};
    }
    if (!message.extra[MODULE_NAME]) {
        message.extra[MODULE_NAME] = {};
    }

    message.extra[MODULE_NAME][key] = value;

    // Also save on the current swipe info if present
    let swipe_index = message.swipe_id
    if (swipe_index && message.swipe_info?.[swipe_index]) {
        if (!message.swipe_info[swipe_index].extra) {
            message.swipe_info[swipe_index].extra = {};
        }
        message.swipe_info[swipe_index].extra[MODULE_NAME] = structuredClone(message.extra[MODULE_NAME])
    }

    saveChatDebounced();
}
function get_data(message, key) {
    // get information from the message object
    return message?.extra?.[MODULE_NAME]?.[key];
}
function get_memory(message) {
    // returns the memory (and reasoning, if present) properly prepended with the prefill (if present)
    let memory = get_data(message, 'memory') ?? ""
    let prefill = get_data(message, 'prefill') ?? ""

    // prepend the prefill to the memory if needed
    if (get_settings('show_prefill')) {
        memory = `${prefill}${memory}`
    }
    return memory
}
function edit_memory(message, text) {
    // perform a manual edit of the memory text

    let current_text = get_memory(message)
    if (text === current_text) return;  // no change
    set_data(message, "memory", text);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", Boolean(text))  // mark as edited if not deleted

    // deleting or adding text to a deleted memory, remove some other flags
    if (!text || !current_text) {
        set_data(message, "exclude", false)
        set_data(message, "remember", false)
    }
}
function clear_memory(message) {
    // clear the memory from a message
    set_data(message, "memory", null);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", false)
    set_data(message, "exclude", false)
    set_data(message, "remember", false)
}
function toggle_memory_value(indexes, value, check_value, set_value) {
    // For each message index, call set_value(index, value) function on each.
    // If no value given, toggle the values. Only toggle false if ALL are true.

    if (value === null) {  // no value - toggle
        let all_true = true
        for (let index of indexes) {
            if (!check_value(index)) {
                all_true = false
                set_value(index, true)
            }
        }

        if (all_true) {  // set to false only if all are true
            for (let index of indexes) {
                set_value(index, false)
            }
        }

    } else {  // value given
        for (let index of indexes) {
            set_value(index, value)
        }
    }

}
function get_previous_swipe_memory(message, key) {
    // get information from the message's previous swipe
    if (!message.swipe_id) {
        return null;
    }
    return message?.swipe_info?.[message.swipe_id-1]?.extra?.[MODULE_NAME]?.[key];
}
async function remember_message_toggle(indexes=null, value=null) {
    // Toggle the "remember" status of a set of messages
    let context = getContext();

    if (indexes === null) {  // Default to the last message, min 0
        indexes = [Math.max(context.chat.length-1, 0)];
    } else if (!Array.isArray(indexes)) {  // only one index given
        indexes = [indexes];
    }

    // messages without a summary
    let summarize = [];

    function set(index, value) {
        let message = context.chat[index]
        set_data(message, 'remember', value);
        set_data(message, 'exclude', false);  // regardless, remove excluded flag

        let memory = get_data(message, 'memory')
        if (value && !memory) {
            summarize.push(index)
        }
        debug(`Set message ${index} remembered status: ${value}`);
    }

    function check(index) {
        return get_data(context.chat[index], 'remember')
    }

    toggle_memory_value(indexes, value, check, set)

    // summarize any messages that have no summary
    if (summarize.length > 0) {
        await summarize_messages(summarize);
    }
    refresh_memory();
}
function forget_message_toggle(indexes=null, value=null) {
    // Toggle the "forget" status of a message
    let context = getContext();

    if (indexes === null) {  // Default to the last message, min 0
        indexes = [Math.max(context.chat.length-1, 0)];
    } else if (!Array.isArray(indexes)) {  // only one index given
        indexes = [indexes];
    }

    function set(index, value) {
        let message = context.chat[index]
        set_data(message, 'exclude', value);
        set_data(message, 'remember', false);  // regardless, remove excluded flag
        debug(`Set message ${index} exclude status: ${value}`);
    }

    function check(index) {
        return get_data(context.chat[index], 'exclude')
    }

    toggle_memory_value(indexes, value, check, set)
    refresh_memory()
}
function get_character_key(message) {
    // get the unique identifier of the character that sent a message
    return message.original_avatar
}


// Retrieving memories
function check_message_exclusion(message) {
    // check for any exclusion criteria for a given message based on current settings
    // (this does NOT take context lengths into account, only exclusion criteria based on the message itself).
    if (!message) return false;

    // system messages sent by this extension are always ignored
    if (get_data(message, 'is_auto_summarize_system_memory')) {
        return false;
    }

    // first check if it has been marked to be remembered by the user - if so, it bypasses all other exclusion criteria
    if (get_data(message, 'remember')) {
        return true;
    }

    // check if it's marked to be excluded - if so, exclude it
    if (get_data(message, 'exclude')) {
        return false;
    }

    // check if it's a user message and exclude if the setting is disabled
    if (!get_settings('include_user_messages') && message.is_user) {
        return false
    }

    // check if it's a thought message and exclude (Stepped Thinking extension)
    // TODO: This is deprecated in the thought extension, could be removed at some point?
    if (message.is_thoughts) {
        return false
    }

    // check if it's a hidden message and exclude if the setting is disabled
    if (!get_settings('include_system_messages') && message.is_system) {
        return false;
    }

    // check if it's a narrator message
    if (!get_settings('include_narrator_messages') && message.extra.type === system_message_types.NARRATOR) {
        return false
    }

    // check if the character is disabled
    let char_key = get_character_key(message)
    if (!character_enabled(char_key)) {
        return false;
    }

    // Check if the message is too short
    let token_size = count_tokens(message.mes);
    if (token_size < get_settings('message_length_threshold')) {
        return false;
    }

    return true;
}
function update_message_inclusion_flags() {
    // Update all messages in the chat, flagging them as short-term or long-term memories to include in the injection.
    // This has to be run on the entire chat since it needs to take the context limits into account.
    let context = getContext();
    let chat = context.chat;

    debug("Updating message inclusion flags")

    let injection_threshold = get_settings('summary_injection_threshold')
    let exclude_messages = get_settings('exclude_messages_after_threshold')
    let keep_last_user_message = get_settings('keep_last_user_message')
    let first_to_inject = chat.length - injection_threshold
    let last_user_message_identified = false

    // iterate through the chat in reverse order and mark the messages that should be included in short-term and long-term memory
    let short_limit_reached = false;
    let long_limit_reached = false;
    let long_term_end_index = null;  // index of the most recent message that doesn't fit in short-term memory
    let end = chat.length - 1;
    let summary = ""  // total concatenated summary so far
    let new_summary = ""  // temp summary storage to check token length
    for (let i = end; i >= 0; i--) {
        let message = chat[i];

        // Mark whether the message is lagging behind the exclusion threshold (even if no summary)
        let lagging = i >= first_to_inject

        // If needed, mark the most recent user message as lagging
        if (exclude_messages && keep_last_user_message && !last_user_message_identified && message.is_user) {
            last_user_message_identified = true
            lagging = true
            debug(`Marked most recent user message as lagging: ${i}`)
        }
        set_data(message, 'lagging', lagging)

        // check for any of the exclusion criteria
        let include = check_message_exclusion(message)
        if (!include) {
            set_data(message, 'include', null);
            continue;
        }

        if (!short_limit_reached) {  // short-term limit hasn't been reached yet
            let memory = get_memory(message)
            if (!memory) {  // If it doesn't have a memory, mark it as excluded and move to the next
                set_data(message, 'include', null)
                continue
            }

            new_summary = concatenate_summary(summary, message)  // concatenate this summary
            let short_token_size = count_tokens(new_summary);
            if (short_token_size > get_short_token_limit()) {  // over context limit
                short_limit_reached = true;
                long_term_end_index = i;  // this is where long-term memory ends and short-term begins
                summary = ""  // reset summary
            } else {  // under context limit
                set_data(message, 'include', 'short');
                summary = new_summary
                continue
            }
        }

        // if the short-term limit has been reached, check the long-term limit
        let remember = get_data(message, 'remember');
        if (!long_limit_reached && remember) {  // long-term limit hasn't been reached yet and the message was marked to be remembered
            new_summary = concatenate_summary(summary, message)  // concatenate this summary
            let long_token_size = count_tokens(new_summary);
            if (long_token_size > get_long_token_limit()) {  // over context limit
                long_limit_reached = true;
            } else {
                set_data(message, 'include', 'long');  // mark the message as long-term
                summary = new_summary
                continue
            }
        }

        // if we haven't marked it for inclusion yet, mark it as excluded
        set_data(message, 'include', null);
    }

    update_all_message_visuals()
}
function concatenate_summary(existing_text, message) {
    // given an existing text of concatenated summaries, concatenate the next one onto it
    let memory = get_memory(message)
    if (!memory) {  // if there's no summary, do nothing
        return existing_text
    }
    let separator = get_settings('summary_injection_separator')
    return existing_text + separator + memory
}
function concatenate_summaries(indexes) {
    let context = getContext();
    let chat = context.chat;
    let summaries = [];
    let count = 1;
    for (let i of indexes) {
        let message = chat[i];
        let memory = get_memory(message);
        if (memory) {
            summaries.push({ id: count, summary: memory });
            count++;
        }
    }
    return JSON.stringify(summaries, null, 2);
}

function collect_chat_messages(include) {
    // Get a list of chat message indexes identified by the given criteria
    let context = getContext();
    let indexes = []  // list of indexes of messages

    // iterate in reverse order
    for (let i = context.chat.length-1; i >= 0; i--) {
        let message = context.chat[i];
        if (!get_data(message, 'memory')) continue  // no memory
        if (get_data(message, 'lagging')) continue  // lagging - not injected yet
        if (get_data(message, 'include') !== include) continue  // not the include types we want
        indexes.push(i)
    }

    // reverse the indexes so they are in chronological order
    indexes.reverse()
    return indexes
}
function get_long_memory() {
    // get the injection text for long-term memory
    let indexes = collect_chat_messages('long')
    if (indexes.length === 0) return ""  // if no memories, return empty

    let text = concatenate_summaries(indexes);
    let template = get_settings('long_template')
    let ctx = getContext();

    // replace memories macro
    return ctx.substituteParamsExtended(template, {[generic_memories_macro]: text});
}
function get_short_memory() {
    // get the injection text for short-term memory
    let indexes = collect_chat_messages('short')
    if (indexes.length === 0) return ""  // if no memories, return empty

    let text = concatenate_summaries(indexes);
    let template = get_settings('short_template')
    let ctx = getContext();

    // replace memories macro
    return ctx.substituteParamsExtended(template, {[generic_memories_macro]: text});
}

// Add an interception function to reduce the number of messages injected normally
// This has to match the manifest.json "generate_interceptor" key
globalThis.memory_intercept_messages = function (chat, _contextSize, _abort, type) {
    if (!chat_enabled()) return;   // if memory disabled, do nothing
    if (!get_settings('exclude_messages_after_threshold')) return  // if not excluding any messages, do nothing
    refresh_memory()

    let start = chat.length-1
    if (type === 'continue') start--  // if a continue, keep the most recent message

    // symbol is used to prevent accidentally leaking modifications to permanent chat.
    let IGNORE_SYMBOL = getContext().symbols.ignore

    // Remove any messages that have summaries injected
    for (let i=start; i >= 0; i--) {
        delete chat[i].extra.ignore_formatting
        let message = chat[i]
        let lagging = get_data(message, 'lagging')  // The message should be kept
        chat[i] = structuredClone(chat[i])  // keep changes temporary for this generation
        chat[i].extra[IGNORE_SYMBOL] = !lagging
    }
};


// Summarization
async function summarize_messages(indexes=null, show_progress=true) {
    // Summarize the given list of message indexes (or a single index)
    let ctx = getContext();

    if (indexes === null) {  // default to the mose recent message, min 0
        indexes = [Math.max(ctx.chat.length - 1, 0)]
    }
    indexes = Array.isArray(indexes) ? indexes : [indexes]  // cast to array if only one given
    if (!indexes.length) return;

    debug(`Summarizing ${indexes.length} messages`)

     // only show progress if there's more than one message to summarize
    show_progress = show_progress && indexes.length > 1;

    // set stop flag to false just in case
    STOP_SUMMARIZATION = false

    // optionally block user from sending chat messages while summarization is in progress
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    // Save the current completion preset (must happen before you set the connection profile because it changes the preset)
    let summary_preset = get_settings('completion_preset');
    let current_preset = await get_current_preset();

    // Get the current connection profile
    let summary_profile = get_settings('connection_profile');
    let current_profile = await get_current_connection_profile()

    // set the completion preset and connection profile for summarization (preset must be set after connection profile)
    await set_connection_profile(summary_profile);
    await set_preset(summary_preset);

    let n = 0;
    let anyModified = false;
    
    try {
        for (let i of indexes) {
            if (show_progress) progress_bar('summarize', n+1, indexes.length, "Summarizing");

            // check if summarization was stopped by the user
            if (STOP_SUMMARIZATION) {
                log('Summarization stopped');
                break;
            }

            const result = await summarize_message(i);
            if (result.modified) {
                anyModified = true;
            }

            // wait for time delay if set
            let time_delay = get_settings('summarization_time_delay')
            if (time_delay > 0 && n < indexes.length-1) {  // delay all except the last

                // check if summarization was stopped by the user during summarization
                if (STOP_SUMMARIZATION) {
                    log('Summarization stopped');
                    break;
                }

                debug(`Delaying generation by ${time_delay} seconds`)
                if (show_progress) progress_bar('summarize', null, null, "Delaying")
                await new Promise((resolve) => {
                    SUMMARIZATION_DELAY_TIMEOUT = setTimeout(resolve, time_delay * 1000)
                    SUMMARIZATION_DELAY_RESOLVE = resolve  // store the resolve function to call when cleared
                });
            }

            n += 1;
        }

        // If any summaries were modified and combined summary settings are enabled, and we meet the threshold
        // run the combined summary AFTER all individual summaries are complete
        if (anyModified && get_settings('combined_summary_enabled')) {
            let run_interval = get_settings('combined_summary_run_interval') || 1;
            let new_count = get_settings('combined_summary_new_count') || 0;
            
            if (new_count >= run_interval) {
                if (get_settings('show_combined_summary_toast')) {
                    toast("Generating combined summary after individual summaries...", "info");
                }
                
                // Generate combined summary after individual summaries are done
                await generate_combined_summary();
                set_settings('combined_summary_new_count', 0); // reset counter
            }
        }
    } finally {
        // restore the completion preset and connection profile
        await set_connection_profile(current_profile);
        await set_preset(current_preset);

        // remove the progress bar
        if (show_progress) remove_progress_bar('summarize');

        if (STOP_SUMMARIZATION) {  // check if summarization was stopped
            STOP_SUMMARIZATION = false;  // reset the flag
        } else {
            debug(`Messages summarized: ${indexes.length}`);
        }

        if (get_settings('block_chat')) {
            ctx.activateSendButtons();
        }

        refresh_memory();

        // Update the memory state interface if it's open
        memoryEditInterface.update_table();
    }
}
async function summarize_message(index) {
    // Summarize a message given the chat index, replacing any existing memories
    // Should only be used from summarize_messages()

    let context = getContext();
    let message = context.chat[index]
    let message_hash = getStringHash(message.mes);

    // Temporarily update the message summary text to indicate that it's being summarized (no styling based on inclusion criteria)
    // A full visual update with style should be done on the whole chat after inclusion criteria have been recalculated
    update_message_visuals(index, false, "Summarizing...")
    memoryEditInterface.update_message_visuals(index, null, false, "Summarizing...")

    // If the most recent message, scroll to the bottom to get the summary in view.
    if (index === context.chat.length - 1) {
        scrollChatToBottom();
    }

    // construct the full summary prompt for the message
    let prompt = await create_summary_prompt(index)

    // summarize it
    let summary;
    let err = null;
    let retry_count = 0;
    const max_retries = get_settings('regular_summary_error_detection_retries');
    
    while (true) {
        try {
            if (retry_count > 0) {
                debug(`[Validation] Retry attempt ${retry_count}/${max_retries} for message ${index}`);
                update_message_visuals(index, false, `Summarizing (retry ${retry_count}/${max_retries})...`);
                memoryEditInterface.update_message_visuals(index, null, false, `Summarizing (retry ${retry_count}/${max_retries})...`);
            }
            
            debug(`Summarizing message ${index}...`)
            summary = await summarize_text(prompt);
            
            // Validate the summary if error detection is enabled
            if (get_settings('error_detection_enabled') && 
                get_settings('regular_summary_error_detection_enabled')) {
                
                const is_valid = await validate_summary(summary, "regular");
                
                if (is_valid) {
                    debug("[Validation] Summary validation passed");
                    break; // Valid summary, exit the loop
                } else {
                    retry_count++;
                    debug(`[Validation] Summary failed validation: "${summary.substring(0, 100)}..."`);
                    
                    if (retry_count >= max_retries) {
                        err = "Failed to generate valid summary after max retries";
                        summary = null;
                        
                        // Mark the message as force-excluded
                        set_data(message, 'exclude', true);
                        
                        // Show toast notification about failure
                        toast(`Message ${index}: Failed to generate valid summary after ${max_retries} attempts. Message has been excluded from memory.`, "warning");
                        
                        debug(`[Validation] Max retries (${max_retries}) reached for message ${index}. Marking as excluded.`);
                        break; // Max retries reached, give up
                    }
                    debug(`[Validation] Retry ${retry_count}/${max_retries} for message ${index}`);
                    continue; // Retry summarization
                }
            } else {
                // No validation needed
                break;
            }
        } catch (e) {
            if (e === "Clicked stop button") {  // summarization was aborted
                err = "Summarization aborted"
            } else {
                error(`Unrecognized error when summarizing message ${index}: ${e}`)
            }
            summary = null;
            break;
        }
    }

    const previouslyHadSummary = Boolean(get_data(message, 'memory'));
    let wasSummaryModified = false;

    if (summary) {
        debug("Message summarized: " + summary)

        // stick the prefill on the front and try to parse reasoning
        let prefill = get_settings('prefill')
        let prefilled_summary = summary
        if (prefill) {
            prefilled_summary = `${prefill}${summary}`
        }

        let parsed_reasoning_object = context.parseReasoningFromString(prefilled_summary)
        let reasoning = "";
        if (parsed_reasoning_object?.reasoning) {
            debug("Reasoning parsed: ")
            debug(parsed_reasoning_object)
            reasoning = parsed_reasoning_object.reasoning  // reasoning with prefill
            summary = parsed_reasoning_object.content  // summary (no prefill)
        }

        // Check if the summary is different from the previous one
        const currentSummary = get_data(message, 'memory');
        wasSummaryModified = currentSummary !== summary;

        // The summary that is stored is WITHOUT the prefill, regardless of whether there was reasoning.
        // If there is reasoning, it will be stored with the prefill and the prefill will be empty

        set_data(message, 'memory', summary);
        set_data(message, 'hash', message_hash);  // store the hash of the message that we just summarized
        set_data(message, 'error', null);  // clear the error message
        set_data(message, 'edited', false);  // clear the error message
        set_data(message, 'prefill', reasoning ? "" : get_settings('prefill'))  // store prefill if there was no reasoning.
        set_data(message, 'reasoning', reasoning)
        
        // When regenerating a summary, make sure it's eligible for combining again
        set_data(message, 'combined_summary_included', false);
        
        // Only increment combined summary count if this is a new summary or an updated one
        if (!previouslyHadSummary || wasSummaryModified) {
            set_settings('combined_summary_new_count', (get_settings('combined_summary_new_count') || 0) + 1);
        }
    } else {  // generation failed
        error(`Failed to summarize message ${index} - generation failed.`);
        set_data(message, 'error', err || "Summarization failed");  // store the error message
        set_data(message, 'memory', null);  // clear the memory if generation failed
        set_data(message, 'edited', false);  // clear the error message
        set_data(message, 'prefill', null)
        set_data(message, 'reasoning', null)
    }

    // update the message summary text again now with the memory, still no styling
    update_message_visuals(index, false)
    memoryEditInterface.update_message_visuals(index, null, false)

    // If the most recent message, scroll to the bottom
    if (index === context.chat.length - 1) {
        scrollChatToBottom()
    }
    
    return { success: !!summary, modified: wasSummaryModified };
}
async function summarize_text(prompt) {
    // get size of text
    let token_size = count_tokens(prompt);

    let context_size = get_context_size();
    if (token_size > context_size) {
        error(`Text ${token_size} exceeds context size ${context_size}.`);
    }

    let ctx = getContext()

    // At least one openai-style API required at least two messages to be sent.
    // We can do this by adding a system prompt, which will get added as another message in generateRaw().
    // A hack obviously. Is this a standard requirement for openai-style chat completion?
    // TODO update with a more robust method
    let system_prompt = false
    if (main_api === 'openai') {
        system_prompt = "Complete the requested task."
    }

    // TODO do the world info injection manually instead
    let include_world_info = get_settings('include_world_info');
    let result;
    if (include_world_info) {
        /**
         * Background generation based on the provided prompt.
         * @param {string} quiet_prompt Instruction prompt for the AI
         * @param {boolean} quietToLoud Whether the message should be sent in a foreground (loud) or background (quiet) mode
         * @param {boolean} skipWIAN whether to skip addition of World Info and Author's Note into the prompt
         * @param {string} quietImage Image to use for the quiet prompt
         * @param {string} quietName Name to use for the quiet prompt (defaults to "System:")
         * @param {number} [responseLength] Maximum response length. If unset, the global default value is used.
         * @returns
         */
        result = await ctx.generateQuietPrompt(prompt, true, false, system_prompt, "assistant");
    } else {
        /**
         * Generates a message using the provided prompt.
         * @param {string} prompt Prompt to generate a message from
         * @param {string} api API to use. Main API is used if not specified.
         * @param {boolean} instructOverride true to override instruct mode, false to use the default value
         * @param {boolean} quietToLoud true to generate a message in system mode, false to generate a message in character mode
         * @param {string} [systemPrompt] System prompt to use. Only Instruct mode or OpenAI.
         * @param {number} [responseLength] Maximum response length. If unset, the global default value is used.
         * @returns {Promise<string>} Generated message
         */
        result = await generateRaw(prompt, '', true, false, system_prompt, null, false);
    }

    // trim incomplete sentences if set in ST settings
    if (ctx.powerUserSettings.trim_sentences) {
        result = trimToEndSentence(result);
    }

    return result;
}
function get_message_history(index) {
    // Get a history of messages leading up to the given index (excluding the message at the index)
    // If the include_message_history setting is 0, returns null
    let num_history_messages = get_settings('include_message_history');
    let mode = get_settings('include_message_history_mode');
    if (num_history_messages === 0 || mode === "none") {
        return;
    }

    let ctx = getContext()
    let chat = ctx.chat

    let num_included = 0;
    let history = []
    for (let i = index-1; num_included < num_history_messages && i>=0; i--) {
        let m = chat[i];
        let include = true

        // whether we include the message itself is determined only by these settings.
        // Even if the message wouldn't be *summarized* we still want to include it in the history for context.
        if (m.is_user && !get_settings('include_user_messages_in_history')) {
            include = false;
        } else if (m.is_system && !get_settings('include_system_messages_in_history')) {
            include = false;
        } else if (m.is_thoughts && !get_settings('include_thought_messages_in_history')) {
            include = false;
        }

        if (!include) continue;

        let included = false
        if (mode === "summaries_only" || mode === "messages_and_summaries") {

            // Whether we include the *summary* is determined by the regular summary inclusion criteria.
            // This is so the inclusion matches the summary injection.
            let include_summary = check_message_exclusion(m)
            let memory = get_memory(m)
            if (include_summary && memory) {
                memory = `Summary: ${memory}`
                history.push(formatInstructModeChat("assistant", memory, false, false, "", "", "", null))
                included = true
            }
        }
        if (mode === "messages_only" || mode === "messages_and_summaries") {
            history.push(formatInstructModeChat(m.name, m.mes, m.is_user, false, "", ctx.name1, ctx.name2, null))
            included = true
        }

        if (included) {
            num_included++
        }
    }

    // reverse the history so that the most recent message is first
    history.reverse()

    // join with newlines
    return history.join('\n')
}
function system_prompt_split(text) {
    // Given text with some number of {{macro}} items, split the text by these items and format the rest as system messages surrounding the macros
    // It is assumed that the macros will be later replaced with appropriate text

    // split on either {{...}} or {{#if ... /if}}.
    // /g flag is for global, /s flag makes . match newlines so the {{#if ... /if}} can span multiple lines
    let parts = text.split(/(\{\{#if.*?\/if}})|(\{\{.*?}})/gs);

    let formatted = parts.map((part) => {
        if (!part) return ""  // some parts are undefined
        part = part.trim()  // trim whitespace
        if (!part) return ""  // if empty after trimming
        if (part.startsWith('{{') && part.endsWith('}}')) {
            return part  // don't format macros
        }
        let formatted = formatInstructModeChat("assistant", part, false, true, "", "", "", null)
        return `${formatted}`
    })
    return formatted.join('')
}
function substitute_conditionals(text, params) {
    // substitute any {{#if macro}} ... {{/if}} blocks in the text with the corresponding content if the macro is present in the params object.
    // Does NOT replace the actual macros, that is done in substitute_params()

    let parts = text.split(/(\{\{#if.*?\/if}})/gs);
    let formatted = parts.map((part) => {
        if (!part) return ""
        if (!part.startsWith('{{#if')) return part
        part = part.trim()  // clean whitespace
        let macro_name = part.match(/\{\{#if (.*?)}}/)[1]
        let macro_present = Boolean(params[macro_name]?.trim())
        let conditional_content = part.match(/\{\{#if.*?}}(.*?)\{\{\/if}}/s)[1] ?? ""
        return macro_present ? conditional_content : ""
    })
    return formatted.join('')
}
function substitute_params(text, params) {
    // custom function to parse macros because I literally cannot find where ST does it in their code.
    // Does NOT take into account {{#if macro}} ... {{/if}} blocks, that is done in substitute_conditionals()
    // If the macro is not found in the params object, it is replaced with an empty string

    let parts = text.split(/(\{\{.*?}})/g);
    let formatted = parts.map((part) => {
        if (!part) return ""
        if (!part.startsWith('{{') || !part.endsWith('}}')) return part
        part = part.trim()  // clean whitespace
        let macro = part.slice(2, -2)
        return params[macro] ?? ""
    })
    return formatted.join('')
}
async function create_summary_prompt(index) {
    // create the full summary prompt for the message at the given index.
    // the instruct template will automatically add an input sequence to the beginning and an output sequence to the end.
    // Therefore, if we are NOT using instructOverride, we have to remove the first system sequence at the very beginning which gets added by format_system_prompt.
    // If we ARE using instructOverride, we have to add a final trailing output sequence

    let ctx = getContext()
    let chat = ctx.chat
    let message = chat[index];

    // get history of messages (formatted as system messages) leading up to the message
    let history_text = get_message_history(index);

    // format the message itself
    let message_text = formatInstructModeChat(message.name, message.mes, message.is_user, false, "", ctx.name1, ctx.name2, null)

    // get the full prompt template from settings
    let prompt = get_settings('prompt');

    // first substitute any global macros like {{persona}}, {{char}}, etc...
    let words = await get_summary_preset_max_tokens()
    prompt = ctx.substituteParamsExtended(prompt, {"words": words})

    // then substitute any {{#if macro}} ... {{/if}} blocks
    prompt = substitute_conditionals(prompt, {"message": message_text, "history": history_text})

    // The conditional substitutions have to be done before splitting and making each section a system prompt, because the conditional content may contain regular text
    //  that should be included in the system prompt.

    // if nesting
    if (get_settings('nest_messages_in_prompt')) {
        // substitute custom macros
        prompt = substitute_params(prompt, {"message": message_text, "history": history_text});  // substitute "message" and "history" macros

        // then wrap it in the system prompt (if using instructOverride)
        prompt = formatInstructModeChat("", prompt, false, true, "", "", "", null)
    } else {  // otherwise
        // first make each prompt section its own system prompt
        prompt = system_prompt_split(prompt)

        // now substitute the custom macros
        prompt = substitute_params(prompt, {"message": message_text, "history": history_text});  // substitute "message" and "history" macros
    }

    // If using instructOverride, append the assistant starting message template to the text, replacing the name with "assistant" if needed
    let output_sequence = ctx.substituteParamsExtended(power_user.instruct.output_sequence, {name: "assistant"});
    prompt = `${prompt}\n${output_sequence}`

    // finally, append the prefill
    prompt = `${prompt} ${get_settings('prefill')}`

    return prompt
}

async function auto_hide_messages_by_command() {
    let ctx = getContext();
    let auto_hide_age = get_settings('auto_hide_message_age');
    if (auto_hide_age < 0) {
        debug("[auto_hide] Disabled (auto_hide_age < 0)");
        return;
    }

    let chat = ctx.chat;
    let cutoff = chat.length - auto_hide_age;
    let to_hide = [];
    let to_unhide = [];

    debug(`[auto_hide] Running. auto_hide_age=${auto_hide_age}, chat.length=${chat.length}, cutoff=${cutoff}`);

    for (let i = 0; i < chat.length; i++) {
        if (i < cutoff) {
            debug(`[auto_hide] Will hide message ${i}`);
            to_hide.push(i);
        } else {
            debug(`[auto_hide] Will unhide message ${i}`);
            to_unhide.push(i);
        }
    }

    // Hide in a single range if possible
    if (to_hide.length > 0) {
        let start = to_hide[0];
        let end = to_hide[to_hide.length - 1];
        debug(`[auto_hide] Hiding messages ${start}-${end}`);
        await ctx.executeSlashCommandsWithOptions(`/hide ${start}-${end}`);
    }

    // Batch unhide contiguous ranges
    if (to_unhide.length > 0) {
        let batchStart = null;
        let last = null;
        for (let i = 0; i < to_unhide.length; i++) {
            if (batchStart === null) batchStart = to_unhide[i];
            if (last !== null && to_unhide[i] !== last + 1) {
                // Send previous batch
                if (batchStart === last) {
                    debug(`[auto_hide] Unhiding message ${batchStart}`);
                    await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}`);
                } else {
                    debug(`[auto_hide] Unhiding messages ${batchStart}-${last}`);
                    await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}-${last}`);
                }
                batchStart = to_unhide[i];
            }
            last = to_unhide[i];
        }
        // Send final batch
        if (batchStart !== null) {
            if (batchStart === last) {
                debug(`[auto_hide] Unhiding message ${batchStart}`);
                await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}`);
            } else {
                debug(`[auto_hide] Unhiding messages ${batchStart}-${last}`);
                await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}-${last}`);
            }
        }
    }

    // Wait a bit for SillyTavern to update the UI/backend
    debug("[auto_hide] Waiting for backend/UI update...");
    await new Promise(resolve => setTimeout(resolve, 200));
}

async function refresh_memory() {
    let ctx = getContext();

    // --- Auto-hide/unhide messages older than X ---
    await auto_hide_messages_by_command();
    // --- end auto-hide ---

    if (!chat_enabled()) { // if chat not enabled, remove the injections
        ctx.setExtensionPrompt(`${MODULE_NAME}_long`, "");
        ctx.setExtensionPrompt(`${MODULE_NAME}_short`, "");
        ctx.setExtensionPrompt(`${MODULE_NAME}_combined`, "");
        return;
    }

    debug("Refreshing memory")

    // Update the UI according to the current state of the chat memories, and update the injection prompts accordingly
    update_message_inclusion_flags()  // update the inclusion flags for all messages

    // get the filled out templates
    let long_injection = get_long_memory();
    let short_injection = get_short_memory();

    // --- Combined Summary Injection ---
    // Don't generate combined summary here, just load the existing one
    const combined_summary = load_combined_summary();
    let combined_injection = "";
    
    if (get_settings('combined_summary_enabled') && combined_summary) {
        let template = get_settings('combined_summary_template');
        combined_injection = ctx.substituteParamsExtended(template, {[generic_memories_macro]: combined_summary});
    }
    // --- END Combined Summary Injection ---

    let long_term_position = get_settings('long_term_position')
    let short_term_position = get_settings('short_term_position')
    let combined_summary_position = get_settings('combined_summary_position');

    // if using text completion, we need to wrap it in a system prompt
    if (main_api !== 'openai') {
        if (long_term_position !== extension_prompt_types.IN_CHAT && long_injection.length) long_injection = formatInstructModeChat("", long_injection, false, true)
        if (short_term_position !== extension_prompt_types.IN_CHAT && short_injection.length) short_injection = formatInstructModeChat("", short_injection, false, true)
        if (combined_summary_position !== extension_prompt_types.IN_CHAT && combined_injection.length) combined_injection = formatInstructModeChat("", combined_injection, false, true)
    }

    // inject the memories into the templates, if they exist
    ctx.setExtensionPrompt(`${MODULE_NAME}_long`,  long_injection,  long_term_position, get_settings('long_term_depth'), get_settings('long_term_scan'), get_settings('long_term_role'));
    ctx.setExtensionPrompt(`${MODULE_NAME}_short`, short_injection, short_term_position, get_settings('short_term_depth'), get_settings('short_term_scan'), get_settings('short_term_role'));
    ctx.setExtensionPrompt(`${MODULE_NAME}_combined`, combined_injection, combined_summary_position, get_settings('combined_summary_depth'), get_settings('combined_summary_scan'), get_settings('combined_summary_role'));

    return `${long_injection}\n\n...\n\n${short_injection}\n\n...\n\n${combined_injection}`  // return the concatenated memory text
}
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);

function stop_summarization() {
    // Immediately stop summarization of the chat
    STOP_SUMMARIZATION = true  // set the flag
    let ctx = getContext()
    ctx.stopGeneration();  // stop generation on current message
    clearTimeout(SUMMARIZATION_DELAY_TIMEOUT)  // clear the summarization delay timeout
    if (SUMMARIZATION_DELAY_RESOLVE !== null) SUMMARIZATION_DELAY_RESOLVE()  // resolve the delay promise so the await goes through
    log("Aborted summarization.")
}
function collect_messages_to_auto_summarize() {
    // iterate through the chat in chronological order and check which messages need to be summarized.
    let context = getContext();

    let messages_to_summarize = []  // list of indexes of messages to summarize
    let depth_limit = get_settings('auto_summarize_message_limit')  // how many valid messages back we can go
    let lag = get_settings('summarization_delay');  // number of messages to delay summarization for
    let depth = 0
    debug(`Collecting messages to summarize. Depth limit: ${depth_limit}, Lag: ${lag}`)
    for (let i = context.chat.length-1; i >= 0; i--) {
        // get current message
        let message = context.chat[i];

        // check message exclusion criteria
        let include = check_message_exclusion(message);  // check if the message should be included due to current settings
        if (!include) {
            debug(`ID [${i}]: excluded`)
            continue;
        }

        depth++

        // don't include if below the lag value
        if (depth <= lag) {
            debug(`ID [${i}]: Depth < lag (${depth} < ${lag})`)
            continue
        }

        // Check depth limit (only applies if at least 1)
        if (depth_limit > 0 && depth > depth_limit + lag) {
            debug(`ID [${i}]: Depth > depth limit + lag (${depth} > ${depth_limit} + ${lag})`)
            break;
        }

        // skip messages that already have a summary
        if (get_data(message, 'memory')) {
            debug(`ID [${i}]: Already has a memory`)
            continue;
        }

        // this message can be summarized
        messages_to_summarize.push(i)
        debug(`ID [${i}]: Included`)
    }
    debug(`Messages to summarize (${messages_to_summarize.length}): ${messages_to_summarize}`)
    return messages_to_summarize.reverse()  // reverse for chronological order
}
async function auto_summarize_chat() {
    // Perform automatic summarization on the chat
    log('Auto-Summarizing chat...')
    let messages_to_summarize = collect_messages_to_auto_summarize()

    // If we don't have enough messages to batch, don't summarize
    let messages_to_batch = get_settings('auto_summarize_batch_size');  // number of messages to summarize in a batch
    if (messages_to_summarize.length < messages_to_batch) {
        debug(`Not enough messages (${messages_to_summarize.length}) to summarize in a batch (${messages_to_batch})`)
        messages_to_summarize = []
    }

    let show_progress = get_settings('auto_summarize_progress');
    await summarize_messages(messages_to_summarize, show_progress);
}

// Event handling
var last_message_swiped = null  // if an index, that was the last message swiped
async function on_chat_event(event=null, data=null) {
    // When the chat is updated, check if the summarization should be triggered
    debug("Chat updated: " + event)

    const context = getContext();
    let index = data

    switch (event) {
        case 'chat_changed':  // chat was changed
            last_message_swiped = null;
            auto_load_profile();  // load the profile for the current chat or character
            refresh_memory();  // refresh the memory state
            if (context?.chat?.length) {
                scrollChatToBottom();  // scroll to the bottom of the chat (area is added due to memories)
            }
            break;

        case 'message_deleted':   // message was deleted
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message deleted, refreshing memory")
            refresh_memory();
            break;

        case 'before_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
            if (!get_settings('auto_summarize_on_send')) break;  // if auto-summarize-on-send is disabled, skip
            index = context.chat.length - 1
            if (last_message_swiped === index) break;  // this is a swipe, skip
            debug("Summarizing chat before message")
            await auto_summarize_chat();  // auto-summarize the chat
            break;

        // currently no triggers on user message rendered
        case 'user_message':
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing

            // Summarize the chat if "include_user_messages" is enabled
            if (get_settings('include_user_messages')) {
                debug("New user message detected, summarizing")
                await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
            }

            break;

        case 'char_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!context.groupId && context.characterId === undefined) break; // no characters or group selected
            if (streamingProcessor && !streamingProcessor.isFinished) break;  // Streaming in-progress
            if (last_message_swiped === index) {  // this is a swipe
                let message = context.chat[index];
                if (!get_settings('auto_summarize_on_swipe')) break;  // if auto-summarize on swipe is disabled, do nothing
                if (!check_message_exclusion(message)) break;  // if the message is excluded, skip
                if (!get_previous_swipe_memory(message, 'memory')) break;  // if the previous swipe doesn't have a memory, skip
                debug("re-summarizing on swipe")
                await summarize_messages(index);  // summarize the swiped message
                refresh_memory()
                break;
            } else { // not a swipe
                last_message_swiped = null;
                if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
                if (get_settings("auto_summarize_on_send")) break;  // if auto_summarize_on_send is enabled, don't auto-summarize on character message
                debug("New message detected, summarizing")
                await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
                break;
            }

        case 'message_edited':  // Message has been edited
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize_on_edit')) break;  // if auto-summarize on edit is disabled, skip
            if (!check_message_exclusion(context.chat[index])) break;  // if the message is excluded, skip
            if (!get_data(context.chat[index], 'memory')) break;  // if the message doesn't have a memory, skip
            debug("Message with memory edited, summarizing")
            summarize_messages(index);  // summarize that message (no await so the message edit goes through)

            // TODO: I'd like to be able to refresh the memory here, but we can't await the summarization because
            //  then the message edit textbox doesn't close until the summary is done.

            break;

        case 'message_swiped':  // when this event occurs, don't summarize yet (a new_message event will follow)
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message swiped, reloading memory")

            // if this is creating a new swipe, remove the current memory.
            // This is detected when the swipe ID is greater than the last index in the swipes array,
            //  i.e. when the swipe ID is EQUAL to the length of the swipes array, not when it's length-1.
            let message = context.chat[index];
            if (message.swipe_id === message.swipes.length) {
                clear_memory(message)
            }

            refresh_memory()
            last_message_swiped = index;

            // make sure the chat is scrolled to the bottom because the memory will change
            scrollChatToBottom();
            break;

        default:
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug(`Unknown event: "${event}", refreshing memory`)
            refresh_memory();
    }
}

async function update_error_detection_preset_dropdown() {
    // Set the completion preset dropdown for error detection
    let $regular_preset_select = $(`.${settings_content_class} #regular_summary_error_detection_preset`);
    let $combined_preset_select = $(`.${settings_content_class} #combined_summary_error_detection_preset`);
    let regular_preset = get_settings('regular_summary_error_detection_preset');
    let combined_preset = get_settings('combined_summary_error_detection_preset');
    let preset_options = await get_presets();
    
    // Update regular summary error detection preset dropdown
    $regular_preset_select.empty();
    $regular_preset_select.append(`<option value="">Same as Summary</option>`);
    for (let option of preset_options) {
        $regular_preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $regular_preset_select.val(regular_preset);
    $regular_preset_select.off('click').on('click', () => update_error_detection_preset_dropdown());
    
    // Update combined summary error detection preset dropdown
    $combined_preset_select.empty();
    $combined_preset_select.append(`<option value="">Same as Combined Summary</option>`);
    for (let option of preset_options) {
        $combined_preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $combined_preset_select.val(combined_preset);
    $combined_preset_select.off('click').on('click', () => update_error_detection_preset_dropdown());
}

function initialize_message_buttons() {
    // Add the message buttons to the chat messages
    debug("Initializing message buttons")
    let ctx = getContext()

    let html = `
<div title="Remember (toggle inclusion of summary in long-term memory)" class="mes_button ${remember_button_class} fa-solid fa-brain" tabindex="0"></div>
<div title="Force Exclude (toggle inclusion of summary from all memory)" class="mes_button ${forget_button_class} fa-solid fa-ban" tabindex="0"></div>
<div title="Edit Summary" class="mes_button ${edit_button_class} fa-solid fa-pen-fancy" tabindex="0"></div>
<div title="Summarize (AI)" class="mes_button ${summarize_button_class} fa-solid fa-quote-left" tabindex="0"></div>
<span class="${css_button_separator}"></span>
`

    $("#message_template .mes_buttons .extraMesButtons").prepend(html);

    // button events
    let $chat = $("div#chat")
    $chat.on("click", `.${remember_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        remember_message_toggle(message_id);
    });
    $chat.on("click", `.${forget_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        forget_message_toggle(message_id);
    })
    $chat.on("click", `.${summarize_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await summarize_messages(message_id);  // summarize the message
    });
    $chat.on("click", `.${edit_button_class}`, async function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await open_edit_memory_input(message_id);
    });

    // when a message is hidden/unhidden, trigger a memory refresh.
    // Yes the chat is saved already when these buttons are clicked, but we need to wait until after to refresh.
    $chat.on("click", ".mes_hide", async () => {
        await ctx.saveChat()
        refresh_memory()
    });
    $chat.on("click", ".mes_unhide", async () => {
        await ctx.saveChat()
        refresh_memory()
    });
}
function initialize_group_member_buttons() {
    // Insert a button into the group member selection to disable summarization
    debug("Initializing group member buttons")

    let $template = $('#group_member_template').find('.group_member_icon')
    let $button = $(`<div title="Toggle summarization for memory" class="right_menu_button fa-solid fa-lg fa-brain ${group_member_enable_button}"></div>`)

    // add listeners
    $(document).on("click", `.${group_member_enable_button}`, (e) => {

        let member_block = $(e.target).closest('.group_member');
        let char_key = member_block.data('id')
        let char_id = member_block.attr('chid')

        if (!char_key) {
            error("Character key not found in group member block.")
        }

        // toggle the enabled status of this character
        toggle_character_enabled(char_key)
        set_character_enabled_button_states()  // update the button state
    })

    $template.prepend($button)
}
function set_character_enabled_button_states() {
    // for each character in the group chat, set the button state based on their enabled status
    let $enable_buttons = $(`#rm_group_members`).find(`.${group_member_enable_button}`)

    // if we are creating a new group (openGroupId is undefined), then hide the buttons
    if (openGroupId === undefined) {
        $enable_buttons.hide()
        return
    }

    // set the state of each button
    for (let button of $enable_buttons) {
        let member_block = $(button).closest('.group_member');
        let char_key = member_block.data('id')
        let enabled = character_enabled(char_key)
        if (enabled) {
            $(button).addClass(group_member_enable_button_highlight)
        } else {
            $(button).removeClass(group_member_enable_button_highlight)
        }
    }
}

function add_menu_button(text, fa_icon, callback, hover=null) {
    let $button = $(`
    <div class="list-group-item flex-container flexGap5 interactable" title="${hover ?? text}" tabindex="0">
        <i class="${fa_icon}"></i>
        <span>${text}</span>
    </div>
    `)

    let $extensions_menu = $('#extensionsMenu');
    if (!$extensions_menu.length) {
        error('Could not find the extensions menu');
    }

    $button.appendTo($extensions_menu)
    $button.click(() => callback());
}
function initialize_menu_buttons() {
    add_menu_button("Toggle Memory", "fa-solid fa-brain", toggle_chat_enabled, "Toggle memory for the current chat.")
}


// Popout handling.
// We save a jQuery reference to the entire settings content, and move it between the original location and the popout.
// This is done carefully to preserve all event listeners when moving, and the move is always done before calling remove() on the popout.
// clone() doesn't work because of the select2 widget for some reason.
let $settings_element = null;  // all settings content
let $original_settings_parent = null;  // original location of the settings element
let $popout = null;  // the popout element
let POPOUT_VISIBLE = false;
function initialize_popout() {
    // initialize the popout logic, creating the $popout object and storing the $settings_element

    // Get the settings element and store it
    $settings_element = $(`#${settings_div_id}`).find(`.inline-drawer-content .${settings_content_class}`)
    $original_settings_parent = $settings_element.parent()  // where the settings are originally placed

    debug('Creating popout window...');

    // repurposes the zoomed avatar template (it's a floating div to the left of the chat)
    $popout = $($('#zoomed_avatar_template').html());
    $popout.attr('id', 'qmExtensionPopout').removeClass('zoomed_avatar').addClass('draggable').empty();

    // create the control bar with the close button
    const controlBarHtml = `<div class="panelControlBar flex-container">
    <div class="fa-solid fa-grip drag-grabber hoverglow"></div>
    <div class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
    </div>`;
    $popout.append(controlBarHtml)

    loadMovingUIState();
    dragElement($popout);

    // set up the popout button in the settings to toggle it
    bind_function('#auto_summarize_popout_button', (e) => {
        toggle_popout();
        e.stopPropagation();
    })

    // when escape is pressed, toggle the popout.
    // This has to be here because ST removes .draggable items when escape is pressed, destroying the popout.
    $(document).on('keydown', async function (event) {
         if (event.key === 'Escape') {
             close_popout()
         }
    });
}
function open_popout() {
    debug("Showing popout")
    $('body').append($popout);  // add the popout to the body

    // setup listener for close button to remove the popout
    $popout.find('.dragClose').off('click').on('click', function () {
        close_popout()
    });

    $settings_element.appendTo($popout)  // move the settings to the popout
    $popout.fadeIn(animation_duration);
    POPOUT_VISIBLE = true
}
function close_popout() {
    debug("Hiding popout")
    $popout.fadeOut(animation_duration, () => {
        $settings_element.appendTo($original_settings_parent)  // move the settings back
        $popout.remove()  // remove the popout
    });
    POPOUT_VISIBLE = false
}
function toggle_popout() {
    // toggle the popout window
    if (POPOUT_VISIBLE) {
        close_popout()
    } else {
        open_popout()
    }
}

// Entry point
let memoryEditInterface;
jQuery(async function () {
    log(`Loading extension...`)

    // Read version from manifest.json
    const manifest = await get_manifest();
    const VERSION = manifest.version;
    log(`Version: ${VERSION}`)

    check_st_version()

    // Load settings
    initialize_settings();

    memoryEditInterface = new MemoryEditInterface()

    // load settings html
    await load_settings_html();

    // initialize UI stuff
    initialize_settings_listeners();
    initialize_popout()
    initialize_message_buttons();
    initialize_group_member_buttons();
    initialize_slash_commands();
    initialize_menu_buttons();

    addSceneBreakButton();
    bindSceneBreakButton(get_message_div, getContext, set_data, get_data, saveChatDebounced);

    // ST event listeners
    let ctx = getContext();
    let eventSource = ctx.eventSource;
    let event_types = ctx.event_types;
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('char_message', id));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, (id) => on_chat_event('user_message', id));
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (id, stuff) => on_chat_event('before_message', id));
    eventSource.on(event_types.MESSAGE_DELETED, (id) => on_chat_event('message_deleted', id));
    eventSource.on(event_types.MESSAGE_EDITED, (id) => on_chat_event('message_edited', id));
    eventSource.on(event_types.MESSAGE_SWIPED, (id) => on_chat_event('message_swiped', id));
    eventSource.on(event_types.CHAT_CHANGED, () => on_chat_event('chat_changed'));
    eventSource.on(event_types.MORE_MESSAGES_LOADED, refresh_memory)
    eventSource.on(event_types.MORE_MESSAGES_LOADED, () => {
    refresh_memory();
    renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
    });
    eventSource.on('groupSelected', set_character_enabled_button_states)
    eventSource.on(event_types.GROUP_UPDATED, set_character_enabled_button_states)

    // Global Macros
    MacrosParser.registerMacro(short_memory_macro, () => get_short_memory());
    MacrosParser.registerMacro(long_memory_macro, () => get_long_memory());
    MacrosParser.registerMacro(combined_memory_macro, () => get_combined_memory());

    // Export to the Global namespace so can be used in the console for debugging
    window.getContext = getContext;
    window.refresh_memory = refresh_memory;
    window.generate_combined_summary = generate_combined_summary;
});


// ...existing code...
export {
    // Summarization and memory
    summarize_text,
    check_preset_valid,
    set_preset,
    set_connection_profile,
    get_current_preset,
    get_current_connection_profile,
    get_data,
    set_data,
    get_memory,
    edit_memory,
    clear_memory,
    toggle_memory_value,
    get_previous_swipe_memory,
    remember_message_toggle,
    forget_message_toggle,
    MODULE_NAME_FANCY, 
    debounce_timeout,
    getMaxContextSize,
    debounce,
    get_character_key,
    getContext,
    get_settings,
    set_settings,
    global_settings,
    extension_settings,
    debug,
    log,
    refresh_memory,
    summarize_messages,
    get_current_character_identifier,
    get_current_chat_identifier,
    display_injection_preview,
    concatenate_summaries,
    copyText,
    getRegexScripts,
    runRegexScript,
    refresh_settings,
    remember_button_class,
    summarize_button_class,
    forget_button_class,
    css_message_div,
    css_short_memory,
    css_long_memory,
    css_remember_memory,
    css_exclude_memory,
    css_lagging_memory,
    get_summary_style_class,
    chat_metadata,
    amount_gen,
    error,
    formatInstructModeChat,
    getPresetManager,
    get_summary_preset,
    substitute_params,
    toast,
    verify_preset,
    get_summary_preset_max_tokens,
    // previously not included
    refresh_select2_element,
    get_message_div,
    update_message_visuals,
    update_all_message_visuals,
    open_edit_memory_input,
    display_text_modal,
    get_user_setting_text_input,
    progress_bar,
    remove_progress_bar,
    system_prompt_split,
    initialize_settings,
    hard_reset_settings,
    soft_reset_settings,
    reset_settings,
    get_settings_element,
    get_manifest,
    load_settings_html,
    chat_enabled,
    toggle_chat_enabled,
    character_enabled,
    toggle_character_enabled,
    bind_setting,
    bind_function,
    set_setting_ui_element,
    update_save_icon_highlight,
    update_profile_section,
    update_preset_dropdown,
    update_combined_summary_preset_dropdown,
    update_connection_profile_dropdown,
    refresh_character_select,
    update_error_detection_preset_dropdown,
    update_message_inclusion_flags,
    concatenate_summary,
    collect_chat_messages,
    get_long_memory,
    get_short_memory,
    summarize_message,
    validate_summary,
    get_message_history,
    substitute_conditionals,
    create_summary_prompt,
    auto_hide_messages_by_command,
    stop_summarization,
    collect_messages_to_auto_summarize,
    auto_summarize_chat,
    on_chat_event,
    initialize_settings_listeners,
    initialize_message_buttons,
    initialize_group_member_buttons,
    set_character_enabled_button_states,
    initialize_slash_commands,
    add_menu_button,
    initialize_menu_buttons,
    initialize_popout,
    open_popout,
    close_popout,
    toggle_popout,
    //settingsManager
    saveSettingsDebounced,
    settings_ui_map
};

export * from './combinedSummary.js';
export * from './profileManager.js';
export * from './memoryEditInterface.js';
export * from './defaultPrompts.js';
export * from './defaultSettings.js';
export * from './sceneBreak.js';
export * from './utils.js';
export * from './slashCommands.js';
export * from './settingsManager.js';
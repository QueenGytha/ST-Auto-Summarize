import { initialize_settings_listeners } from './settingsUI.js';
import { initialize_settings, hard_reset_settings, soft_reset_settings, reset_settings, set_settings, get_settings, get_settings_element, get_manifest, load_settings_html} from './settingsManager.js';
import { initialize_slash_commands } from './slashCommands.js';
import { log, debug, error, toast, toast_debounced, saveChatDebounced, count_tokens, get_context_size, get_long_token_limit, get_short_token_limit, get_current_character_identifier, get_current_chat_identifier, get_extension_directory, clean_string_for_title, escape_string, unescape_string, check_st_version } from './utils.js';
import { get_combined_summary_key, save_combined_summary, load_combined_summary, get_combined_summary_preset_max_tokens, get_combined_memory, create_combined_summary_prompt, collect_messages_to_combine, flag_summaries_as_combined, generate_combined_summary } from './combinedSummary.js';
import { copy_settings, detect_settings_difference, save_profile, load_profile, export_profile, import_profile, rename_profile, new_profile, delete_profile, toggle_character_profile, toggle_chat_profile, get_character_profile, set_character_profile, get_chat_profile, auto_load_profile, set_chat_profile } from './profileManager.js';
import { default_combined_summary_prompt, default_prompt, default_long_template, default_short_template, default_combined_template } from './defaultPrompts.js';
import { MemoryEditInterface } from './memoryEditInterface.js';
import { default_settings } from './defaultSettings.js';
import { getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition } from '../../../utils.js';
import { getContext, getApiUrl, extension_settings } from '../../../extensions.js';
import { animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, is_send_press, saveSettingsDebounced, generateRaw, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata } from '../../../../script.js';
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
import { addSceneBreakButton, bindSceneBreakButton, renderAllSceneBreaks } from './sceneBreak.js';
import { get_message_div, get_summary_style_class, update_message_visuals, update_all_message_visuals, open_edit_memory_input } from './messageVisuals.js';
import { check_message_exclusion, update_message_inclusion_flags, collect_chat_messages, concatenate_summary, concatenate_summaries, get_long_memory, get_short_memory } from './memoryCore.js';
import { progress_bar, remove_progress_bar } from './progressBar.js';
import { bind_setting, bind_function, set_setting_ui_element } from './uiBindings.js';
import { refresh_character_select, refresh_select2_element } from './characterSelect.js';
import { update_save_icon_highlight, update_profile_section, update_preset_dropdown, update_combined_summary_preset_dropdown, update_connection_profile_dropdown, refresh_settings, update_error_detection_preset_dropdown } from './profileUI.js';
import { set_data, get_data, get_memory, edit_memory, clear_memory, toggle_memory_value, get_previous_swipe_memory, remember_message_toggle, forget_message_toggle, get_character_key } from './messageData.js';
import { initialize_popout, open_popout, close_popout, toggle_popout } from './popout.js';

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
    MODULE_NAME,
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
    css_edit_textarea,
    summary_div_class,
    summary_reasoning_class,
    PROGRESS_BAR_ID,
    system_message_types,
    generic_memories_macro,
    refresh_memory_debounced,
    settings_content_class,
    check_connection_profiles_active,
    css_button_separator,
    get_connection_profiles,
    get_presets,
    verify_connection_profile,
    animation_duration,
    loadMovingUIState,
    dragElement,
    settings_div_id,
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
export * from './messageVisuals.js';
export * from './memoryCore.js';
export * from './progressBar.js';
export * from './uiBindings.js';
export * from './characterSelect.js';
export * from './profileUI.js';
export * from './messageData.js';
export * from './popout.js';
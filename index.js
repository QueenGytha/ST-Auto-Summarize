// Imports from SillyTavern
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
import { getContext, getApiUrl, extension_settings } from '../../../extensions.js';
import { getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition } from '../../../utils.js';
import { animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, is_send_press, saveSettingsDebounced, generateRaw, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata } from '../../../../script.js';

// Imports from our local files
import { initialize_settings_listeners } from './settingsUI.js';
import { initialize_settings, hard_reset_settings, soft_reset_settings, reset_settings, set_settings, get_settings, get_settings_element, get_manifest, load_settings_html} from './settingsManager.js';
import { initialize_slash_commands } from './slashCommands.js';
import { log, debug, error, toast, toast_debounced, saveChatDebounced, count_tokens, get_context_size, get_long_token_limit, get_short_token_limit, get_current_character_identifier, get_current_chat_identifier, get_extension_directory, clean_string_for_title, escape_string, unescape_string, check_st_version } from './utils.js';
import { get_combined_summary_key, save_combined_summary, load_combined_summary, get_combined_summary_preset_max_tokens, get_combined_memory, create_combined_summary_prompt, collect_messages_to_combine, flag_summaries_as_combined, generate_combined_summary } from './combinedSummary.js';
import { copy_settings, detect_settings_difference, save_profile, load_profile, export_profile, import_profile, rename_profile, new_profile, delete_profile, toggle_character_profile, toggle_chat_profile, get_character_profile, set_character_profile, get_chat_profile, auto_load_profile, set_chat_profile } from './profileManager.js';
import { default_combined_summary_prompt, default_prompt, default_long_template, default_short_template, default_combined_template } from './defaultPrompts.js';
import { MemoryEditInterface } from './memoryEditInterface.js';
import { default_settings } from './defaultSettings.js';
import { addSceneBreakButton, bindSceneBreakButton, renderAllSceneBreaks } from './sceneBreak.js';
import { get_message_div, get_summary_style_class, update_message_visuals, update_all_message_visuals, open_edit_memory_input } from './messageVisuals.js';
import { check_message_exclusion, update_message_inclusion_flags, collect_chat_messages, concatenate_summary, concatenate_summaries, get_long_memory, get_short_memory } from './memoryCore.js';
import { progress_bar, remove_progress_bar } from './progressBar.js';
import { bind_setting, bind_function, set_setting_ui_element } from './uiBindings.js';
import { refresh_character_select, refresh_select2_element } from './characterSelect.js';
import { update_save_icon_highlight, update_profile_section, update_preset_dropdown, update_combined_summary_preset_dropdown, update_connection_profile_dropdown, refresh_settings, update_error_detection_preset_dropdown } from './profileUI.js';
import { set_data, get_data, get_memory, edit_memory, clear_memory, toggle_memory_value, get_previous_swipe_memory, remember_message_toggle, forget_message_toggle, get_character_key } from './messageData.js';
import { initialize_popout, open_popout, close_popout, toggle_popout } from './popout.js';
import { initialize_message_buttons, initialize_group_member_buttons, set_character_enabled_button_states, add_menu_button, initialize_menu_buttons } from './buttonBindings.js';
import { check_connection_profiles_active, get_current_connection_profile, get_connection_profile_api, get_summary_connection_profile, set_connection_profile, get_connection_profiles, verify_connection_profile, check_connection_profile_valid } from './connectionProfiles.js';
import { system_prompt_split, substitute_conditionals, substitute_params } from './promptUtils.js';
import { setStopSummarization, summarize_messages, summarize_message, summarize_text, get_message_history, create_summary_prompt, auto_summarize_chat, collect_messages_to_auto_summarize, stop_summarization } from './summarization.js';

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
setStopSummarization(false);
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
    get_character_key,
    get_settings,
    set_settings,
    debug,
    log,
    refresh_memory,
    summarize_messages,
    get_current_character_identifier,
    get_current_chat_identifier,
    display_injection_preview,
    concatenate_summaries,
    refresh_settings,
    get_summary_style_class,
    error,
    formatInstructModeChat,
    get_summary_preset,
    substitute_params,
    toast,
    verify_preset,
    get_summary_preset_max_tokens,
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
    add_menu_button,
    initialize_menu_buttons,
    initialize_popout,
    open_popout,
    close_popout,
    toggle_popout,
    check_connection_profiles_active,
    get_connection_profiles,
    get_presets,
    verify_connection_profile,
};

export {
    // Consts from within index
    memoryEditInterface, refresh_memory_debounced, MODULE_NAME, MODULE_NAME_FANCY, PROGRESS_BAR_ID, css_message_div, css_short_memory, css_long_memory, css_remember_memory, css_exclude_memory, css_lagging_memory, summary_div_class, summary_reasoning_class, css_button_separator, css_edit_textarea, settings_div_id, settings_content_class, group_member_enable_button, group_member_enable_button_highlight, long_memory_macro, short_memory_macro, generic_memories_macro, remember_button_class, summarize_button_class, edit_button_class, forget_button_class, delete_button_class, combined_memory_macro, global_settings, settings_ui_map
}

export {
    // Exports from imported SillyTavern modules
    getPresetManager, is_group_generating, selected_group, openGroupId, loadMovingUIState, renderStoryString, power_user, dragElement, debounce_timeout, MacrosParser, commonEnumProviders, getRegexScripts, runRegexScript, getContext, getApiUrl, extension_settings, getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition, animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, is_send_press, saveSettingsDebounced, generateRaw, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata
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
export * from './buttonBindings.js';
export * from './connectionProfiles.js';
export * from './promptUtils.js';
export * from './summarization.js';
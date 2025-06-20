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
import { initialize_settings, hard_reset_settings, soft_reset_settings, reset_settings, set_settings, get_settings, get_settings_element, get_manifest, load_settings_html, global_settings, settings_ui_map } from './settingsManager.js';
import { initialize_slash_commands } from './slashCommands.js';
import { log, debug, error, toast, toast_debounced, saveChatDebounced, count_tokens, get_context_size, get_long_token_limit, get_short_token_limit, get_current_character_identifier, get_current_chat_identifier, get_extension_directory, clean_string_for_title, escape_string, unescape_string, check_st_version, display_injection_preview, display_text_modal, get_user_setting_text_input } from './utils.js';
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
import { validate_summary } from './summaryValidation.js';
import { get_current_preset, get_summary_preset, set_preset, get_presets, verify_preset, check_preset_valid, get_summary_preset_max_tokens} from './presetManager.js';
import { on_chat_event, memoryEditInterface } from './eventHandlers.js';
import { settings_content_class, group_member_enable_button, group_member_enable_button_highlight, css_message_div, css_short_memory, css_long_memory, css_remember_memory, css_exclude_memory, css_lagging_memory, summary_div_class, summary_reasoning_class, css_button_separator, css_edit_textarea, settings_div_id, MODULE_NAME, MODULE_NAME_FANCY, PROGRESS_BAR_ID, short_memory_macro,  long_memory_macro, generic_memories_macro, remember_button_class, summarize_button_class, edit_button_class, forget_button_class, delete_button_class, combined_memory_macro } from './styleConstants.js';
import { auto_hide_messages_by_command } from './autoHide.js';  

// global flags and whatnot
setStopSummarization(false);
var SUMMARIZATION_DELAY_TIMEOUT = null  // the set_timeout object for the summarization delay
var SUMMARIZATION_DELAY_RESOLVE = null

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
    memoryEditInterface, refresh_memory_debounced, css_message_div, css_short_memory, css_long_memory, css_remember_memory, css_exclude_memory, css_lagging_memory, summary_div_class, summary_reasoning_class, css_button_separator, css_edit_textarea, settings_div_id, settings_content_class, group_member_enable_button, group_member_enable_button_highlight, global_settings, settings_ui_map
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
export * from './summaryValidation.js';
export * from './presetManager.js';
export * from './eventHandlers.js';
export * from './styleConstants.js';
export * from './autoHide.js'; 

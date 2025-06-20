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
import { initialize_settings, hard_reset_settings, soft_reset_settings, reset_settings, set_settings, get_settings, get_settings_element, get_manifest, load_settings_html, global_settings, settings_ui_map, chat_enabled, toggle_chat_enabled, character_enabled, toggle_character_enabled } from './settingsManager.js';
import { initialize_slash_commands } from './slashCommands.js';
import { log, debug, error, toast, toast_debounced, saveChatDebounced, count_tokens, get_context_size, get_long_token_limit, get_short_token_limit, get_current_character_identifier, get_current_chat_identifier, get_extension_directory, clean_string_for_title, escape_string, unescape_string, check_st_version, display_injection_preview, display_text_modal, get_user_setting_text_input } from './utils.js';
import { get_combined_summary_key, save_combined_summary, load_combined_summary, get_combined_summary_preset_max_tokens, get_combined_memory, create_combined_summary_prompt, collect_messages_to_combine, flag_summaries_as_combined, generate_combined_summary } from './combinedSummary.js';
import { copy_settings, detect_settings_difference, save_profile, load_profile, export_profile, import_profile, rename_profile, new_profile, delete_profile, toggle_character_profile, toggle_chat_profile, get_character_profile, set_character_profile, get_chat_profile, auto_load_profile, set_chat_profile } from './profileManager.js';
import { default_combined_summary_prompt, default_prompt, default_long_template, default_short_template, default_combined_template } from './defaultPrompts.js';
import { MemoryEditInterface } from './memoryEditInterface.js';
import { default_settings } from './defaultSettings.js';
import { addSceneBreakButton, bindSceneBreakButton, renderAllSceneBreaks } from './sceneBreak.js';
import { get_message_div, get_summary_style_class, update_message_visuals, update_all_message_visuals, open_edit_memory_input } from './messageVisuals.js';
import { check_message_exclusion, update_message_inclusion_flags, collect_chat_messages, concatenate_summary, concatenate_summaries, get_long_memory, get_short_memory, refresh_memory, refresh_memory_debounced } from './memoryCore.js';
import { progress_bar, remove_progress_bar } from './progressBar.js';
import { bind_setting, bind_function, set_setting_ui_element } from './uiBindings.js';
import { refresh_character_select, refresh_select2_element } from './characterSelect.js';
import { update_save_icon_highlight, update_profile_section, update_scene_summary_preset_dropdown, update_preset_dropdown, update_combined_summary_preset_dropdown, update_connection_profile_dropdown, refresh_settings, update_error_detection_preset_dropdown } from './profileUI.js';
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


export {
    // Exports from imported SillyTavern modules
    formatInstructModeChat, getPresetManager, is_group_generating, selected_group, openGroupId, loadMovingUIState, renderStoryString, power_user, dragElement, debounce_timeout, MacrosParser, commonEnumProviders, getRegexScripts, runRegexScript, getContext, getApiUrl, extension_settings, getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition, animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, is_send_press, saveSettingsDebounced, generateRaw, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata
};


export * from './settingsUI.js';
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
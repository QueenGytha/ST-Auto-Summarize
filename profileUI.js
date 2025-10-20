// @flow
import {
    get_settings,
    set_settings,
    check_preset_valid,
    get_presets,
    get_connection_profiles,
    check_connection_profile_valid,
    toast,
    debug,
    error,
    settings_content_class,
    set_setting_ui_element,
    settings_ui_map,
    chat_enabled,
    set_character_enabled_button_states,
    get_character_profile,
    get_chat_profile,
    get_settings_element,
    detect_settings_difference,
    getContext,
    default_short_template,
    default_scene_template,
    extension_settings,
} from './index.js';

function update_save_icon_highlight() {
    // If the current settings are different than the current profile, highlight the save button
    if (detect_settings_difference()) {
        // $FlowFixMe[cannot-resolve-name]
        $('#save_profile').addClass('button_highlight');
    } else {
        // $FlowFixMe[cannot-resolve-name]
        $('#save_profile').removeClass('button_highlight');
    }
}
function update_profile_section() {
    const context = getContext()

    const current_profile = get_settings('profile')
    const current_character_profile = get_character_profile();
    const current_chat_profile = get_chat_profile();
    const profile_options = Object.keys(get_settings('profiles'));

    // $FlowFixMe[cannot-resolve-name]
    const $choose_profile_dropdown = $(`.${settings_content_class} #profile`).empty();
    // $FlowFixMe[cannot-resolve-name]
    const $character = $('button#character_profile')
    // $FlowFixMe[cannot-resolve-name]
    const $chat = $('button#chat_profile')
    const $character_icon = $character.find('i')
    const $chat_icon = $chat.find('i')


    // Set the profile dropdowns to reflect the available profiles and the currently chosen one
    for (const profile of profile_options) {
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

    const lock_class = 'fa-lock'
    const unlock_class = 'fa-unlock'
    const highlight_class = 'button_highlight'

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

async function update_scene_summary_preset_dropdown() {
    // $FlowFixMe[cannot-resolve-name]
    const $preset_select = $('#scene_summary_completion_preset');
    const summary_preset = get_settings('scene_summary_completion_preset');
    const preset_options = await get_presets();
    $preset_select.empty();
    $preset_select.append(`<option value="">Same as Current</option>`);
    for (const option of preset_options) {
        $preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $preset_select.val(summary_preset);
    $preset_select.off('click').on('click', () => update_scene_summary_preset_dropdown());
}

async function update_auto_scene_break_preset_dropdown() {
    // $FlowFixMe[cannot-resolve-name]
    const $preset_select = $('#auto_scene_break_completion_preset');
    const summary_preset = get_settings('auto_scene_break_completion_preset');
    const preset_options = await get_presets();
    $preset_select.empty();
    $preset_select.append(`<option value="">Same as Current</option>`);
    for (const option of preset_options) {
        $preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $preset_select.val(summary_preset);
    $preset_select.off('click').on('click', () => update_auto_scene_break_preset_dropdown());
}

async function update_auto_scene_break_connection_profile_dropdown() {
    // $FlowFixMe[cannot-resolve-name]
    const $connection_select = $('#auto_scene_break_connection_profile');
    const summary_connection = get_settings('auto_scene_break_connection_profile');
    const connection_options = await get_connection_profiles();
    $connection_select.empty();
    $connection_select.append(`<option value="">Same as Current</option>`);
    if (connection_options && Array.isArray(connection_options)) {
        for (const option of connection_options) {
            $connection_select.append(`<option value="${option}">${option}</option>`);
        }
    }
    $connection_select.val(summary_connection);
    $connection_select.off('click').on('click', () => update_auto_scene_break_connection_profile_dropdown());
}

async function update_preset_dropdown() {
    // set the completion preset dropdown
    // $FlowFixMe[cannot-resolve-name]
    const $preset_select = $(`.${settings_content_class} #completion_preset`);
    const summary_preset = get_settings('completion_preset')
    const preset_options = await get_presets()
    $preset_select.empty();
    $preset_select.append(`<option value="">Same as Current</option>`)
    for (const option of preset_options) {  // construct the dropdown options
        $preset_select.append(`<option value="${option}">${option}</option>`)
    }
    $preset_select.val(summary_preset)

    // set a click event to refresh the preset dropdown for the currently available presets
    $preset_select.off('click').on('click', () => update_preset_dropdown());

}
async function update_connection_profile_dropdown() {
    // set the completion preset dropdown
    // $FlowFixMe[cannot-resolve-name]
    const $connection_select = $(`.${settings_content_class} #connection_profile`);
    const summary_connection = get_settings('connection_profile')
    
    const connection_options = await get_connection_profiles()
    
    $connection_select.empty();
    $connection_select.append(`<option value="">Same as Current</option>`)
    
    if (connection_options && Array.isArray(connection_options)) {
        for (const option of connection_options) {  // construct the dropdown options
            $connection_select.append(`<option value="${option}">${option}</option>`)
        }
    }
    $connection_select.val(summary_connection)

    // set a click event to refresh the dropdown
    $connection_select.off('click').on('click', () => update_connection_profile_dropdown());
}

async function update_error_detection_preset_dropdown() {
    // Set the completion preset dropdown for error detection
    // $FlowFixMe[cannot-resolve-name]
    const $regular_preset_select = $(`.${settings_content_class} #message_summary_error_detection_preset`);
    // $FlowFixMe[cannot-resolve-name]
    const $scene_preset_select = $(`.${settings_content_class} #scene_summary_error_detection_preset`);
    const regular_preset = get_settings('message_summary_error_detection_preset');
    const scene_preset = get_settings('scene_summary_error_detection_preset');
    const preset_options = await get_presets();

    // Update regular summary error detection preset dropdown
    $regular_preset_select.empty();
    $regular_preset_select.append(`<option value="">Same as Summary</option>`);
    for (const option of preset_options) {
        $regular_preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $regular_preset_select.val(regular_preset);
    $regular_preset_select.off('click').on('click', () => update_error_detection_preset_dropdown());

    // Update scene summary error detection preset dropdown
    $scene_preset_select.empty();
    $scene_preset_select.append(`<option value="">Same as Scene Summary</option>`);
    for (const option of preset_options) {
        $scene_preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $scene_preset_select.val(scene_preset);
    $scene_preset_select.off('click').on('click', () => update_error_detection_preset_dropdown());

}

// Helper: Update all preset and profile dropdowns
function updateAllDropdowns() {
    update_error_detection_preset_dropdown();
    update_connection_profile_dropdown();
    check_connection_profile_valid();
    // $FlowFixMe[cannot-resolve-name]
    $(`.${settings_content_class} #connection_profile`).parent().show();

    update_preset_dropdown();
    update_scene_summary_preset_dropdown();
    update_auto_scene_break_preset_dropdown();
    update_auto_scene_break_connection_profile_dropdown();
    update_running_scene_summary_preset_dropdown();
    update_running_scene_summary_connection_profile_dropdown();
    check_preset_valid();
}

// Helper: Update error detection settings
function updateErrorDetectionSettings() {
    const error_detection_enabled = get_settings('error_detection_enabled');
    // $FlowFixMe[cannot-resolve-name]
    $(`.${settings_content_class} .error_detection_setting`).prop('disabled', !error_detection_enabled);

    const regular_error_enabled = get_settings('message_summary_error_detection_enabled');
    // $FlowFixMe[cannot-resolve-name]
    $(`.${settings_content_class} .regular_error_detection_setting`).prop('disabled', !error_detection_enabled || !regular_error_enabled);
}

// Helper: Validate and fix settings
function validateAndFixSettings() {
    // Ensure {{message}} macro is in prompt
    const prompt = get_settings('prompt');
    if (typeof prompt === "string" && !prompt.includes("{{message}}")) {
        set_settings('prompt', prompt + "\n{{message}}");
        debug("{{message}} macro not found in summary prompt. It has been added automatically.");
    }

    // Ensure auto_summarize_message_limit >= auto_summarize_batch_size
    const auto_limit = get_settings('auto_summarize_message_limit');
    const batch_size = get_settings('auto_summarize_batch_size');
    if (auto_limit >= 0 && (auto_limit < batch_size)) {
        set_settings('auto_summarize_message_limit', get_settings('auto_summarize_batch_size'));
        toast("The auto-summarize message limit must be greater than or equal to the batch size.", "warning");
    }
}

// Helper: Update conditional settings based on dependencies
function updateConditionalSettings() {
    const auto_summarize = get_settings('auto_summarize');
    get_settings_element('auto_summarize_on_send')?.prop('disabled', !auto_summarize);
    get_settings_element('auto_summarize_message_limit')?.prop('disabled', !auto_summarize);
    get_settings_element('auto_summarize_batch_size')?.prop('disabled', !auto_summarize);
    get_settings_element('auto_summarize_progress')?.prop('disabled', !auto_summarize);
    get_settings_element('summarization_delay')?.prop('disabled', !auto_summarize);

    const history_disabled = get_settings('include_message_history_mode') === "none";
    get_settings_element('include_message_history')?.prop('disabled', history_disabled);
    get_settings_element('include_user_messages_in_history')?.prop('disabled', history_disabled);
    get_settings_element('preview_message_history')?.prop('disabled', history_disabled);

    if (!history_disabled && !get_settings('prompt').includes("{{history}}")) {
        // $FlowFixMe[cannot-resolve-name]
        toastr.warning("To include message history, you must use the {{history}} macro in the prompt.");
    }

    const excluding_messages = get_settings('exclude_messages_after_threshold');
    get_settings_element('keep_last_user_message')?.prop('disabled', !excluding_messages);
}

function refresh_settings() {
    // Refresh all settings UI elements according to the current settings
    debug("Refreshing settings...");

    // $FlowFixMe[cannot-resolve-name]
    $('#scene_summary_template').val(get_settings('scene_summary_template') || default_scene_template);
    // $FlowFixMe[cannot-resolve-name]
    $('#short_template').val(get_settings('short_template') || default_short_template);

    updateErrorDetectionSettings();
    updateAllDropdowns();
    validateAndFixSettings();

    update_save_icon_highlight();
    update_profile_section();

    // Iterate through the settings map and set each element to the current setting value
    // $FlowFixMe[incompatible-use]
    for (const [key, [element, type]] of Object.entries(settings_ui_map)) {
        set_setting_ui_element(key, element, type);
    }

    // Refresh Auto-Lorebooks settings UI (merged extension)
    refresh_lorebooks_settings_ui();

    // Enable or disable settings based on others
    if (chat_enabled()) {
        // $FlowFixMe[cannot-resolve-name]
        $(`.${settings_content_class} .settings_input`).prop('disabled', false);
        updateConditionalSettings();
    } else {
        // $FlowFixMe[cannot-resolve-name]
        $(`.${settings_content_class} .settings_input`).prop('disabled', true);
    }


    //////////////////////
    // Settings not in the config

    // set group chat character enable button state
    set_character_enabled_button_states()
}

async function update_running_scene_summary_preset_dropdown() {
    // $FlowFixMe[cannot-resolve-name]
    const $preset_select = $('#running_scene_summary_completion_preset');
    const summary_preset = get_settings('running_scene_summary_completion_preset');
    const preset_options = await get_presets();
    $preset_select.empty();
    $preset_select.append(`<option value="">Same as Current</option>`);
    for (const option of preset_options) {
        $preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $preset_select.val(summary_preset);
    $preset_select.off('click').on('click', () => update_running_scene_summary_preset_dropdown());
}

async function update_running_scene_summary_connection_profile_dropdown() {
    // $FlowFixMe[cannot-resolve-name]
    const $connection_select = $('#running_scene_summary_connection_profile');
    const summary_connection = get_settings('running_scene_summary_connection_profile');
    const connection_options = await get_connection_profiles();
    $connection_select.empty();
    $connection_select.append(`<option value="">Same as Current</option>`);
    if (connection_options && Array.isArray(connection_options)) {
        for (const option of connection_options) {
            $connection_select.append(`<option value="${option}">${option}</option>`);
        }
    }
    $connection_select.val(summary_connection);
    $connection_select.off('click').on('click', () => update_running_scene_summary_connection_profile_dropdown());
}

/**
 * Refresh Auto-Lorebooks settings UI
 * Loads values from extension_settings.autoLorebooks into UI elements
 */
function refresh_lorebooks_settings_ui() {
    try {
        // Load global settings from extension_settings.autoLorebooks
        // $FlowFixMe[prop-missing]
        const lorebooksSettings = extension_settings.autoLorebooks || {};

        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-enabled-by-default').prop('checked', lorebooksSettings.enabledByDefault ?? true);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-delete-on-chat-delete').prop('checked', lorebooksSettings.deleteOnChatDelete ?? true);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-name-template').val(lorebooksSettings.nameTemplate || 'z-AutoLB - {{char}} - {{chat}}');
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-debug-mode').prop('checked', lorebooksSettings.debug_mode ?? true);

        // Load queue settings
        const queueSettings = lorebooksSettings.queue || {};
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-queue-enabled').prop('checked', queueSettings.enabled !== false);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-queue-use-lorebook').prop('checked', queueSettings.use_lorebook !== false);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-queue-display-enabled').prop('checked', queueSettings.display_enabled !== false);

        // Load tracking settings
        const tracking = lorebooksSettings.tracking || {};
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-enabled').prop('checked', tracking.enabled ?? true);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-intercept-send').prop('checked', tracking.intercept_send_button ?? true);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-auto-create').prop('checked', tracking.auto_create ?? true);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-remove-syntax').prop('checked', tracking.remove_from_message ?? true);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-syntax-gm-notes').val(tracking.syntax_gm_notes || '<-- gm_notes: {{content}} -->');
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-syntax-character-stats').val(tracking.syntax_character_stats || '<-- character_stats: {{content}} -->');
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-merge-prefill').val(tracking.merge_prefill || '');
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-merge-prompt-gm-notes').val(tracking.merge_prompt_gm_notes || '');
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-tracking-merge-prompt-character-stats').val(tracking.merge_prompt_character_stats || '');

        // Load summary processing settings
        const summaryProcessing = lorebooksSettings.summary_processing || {};
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-summary-processing-enabled').prop('checked', summaryProcessing.enabled ?? true);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-summary-skip-duplicates').prop('checked', summaryProcessing.skip_duplicates ?? true);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-summary-merge-prefill').val(summaryProcessing.merge_prefill || '');
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-summary-merge-prompt').val(summaryProcessing.merge_prompt || '');

        debug("Auto-Lorebooks settings UI refreshed");

    } catch (err) {
        error("Error refreshing Auto-Lorebooks settings UI", err);
    }
}

export {
    update_save_icon_highlight,
    update_profile_section,
    update_preset_dropdown,
    update_connection_profile_dropdown,
    refresh_settings,
    update_error_detection_preset_dropdown,
    update_scene_summary_preset_dropdown,
    update_auto_scene_break_preset_dropdown,
    update_auto_scene_break_connection_profile_dropdown,
    update_running_scene_summary_preset_dropdown,
    update_running_scene_summary_connection_profile_dropdown
};
import {
    get_settings,
    set_settings,
    check_preset_valid,
    get_presets,
    get_connection_profiles,
    check_connection_profile_valid,
    toast,
    debug,
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
    default_long_template,
    default_scene_template,
    default_combined_template,
} from './index.js';

function update_save_icon_highlight() {
    // If the current settings are different than the current profile, highlight the save button
    if (detect_settings_difference()) {
        $('#save_profile').addClass('button_highlight');
    } else {
        $('#save_profile').removeClass('button_highlight');
    }
}
function update_profile_section() {
    const context = getContext()

    const current_profile = get_settings('profile')
    const current_character_profile = get_character_profile();
    const current_chat_profile = get_chat_profile();
    const profile_options = Object.keys(get_settings('profiles'));

    const $choose_profile_dropdown = $(`.${settings_content_class} #profile`).empty();
    const $character = $('button#character_profile')
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
async function update_combined_summary_preset_dropdown() {
    const $preset_select = $(`.${settings_content_class} #combined_summary_completion_preset`);
    const summary_preset = get_settings('combined_summary_completion_preset');
    const preset_options = await get_presets();
    $preset_select.empty();
    $preset_select.append(`<option value="">Same as Current</option>`);
    for (const option of preset_options) {
        $preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $preset_select.val(summary_preset);

    // Refresh on click
    $preset_select.off('click').on('click', () => update_combined_summary_preset_dropdown());
}
async function update_connection_profile_dropdown() {
    // set the completion preset dropdown
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
    const $regular_preset_select = $(`.${settings_content_class} #regular_summary_error_detection_preset`);
    const $scene_preset_select = $(`.${settings_content_class} #scene_summary_error_detection_preset`);
    const $combined_preset_select = $(`.${settings_content_class} #combined_summary_error_detection_preset`);
    const regular_preset = get_settings('regular_summary_error_detection_preset');
    const scene_preset = get_settings('scene_summary_error_detection_preset');
    const combined_preset = get_settings('combined_summary_error_detection_preset');
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

    // Update combined summary error detection preset dropdown
    $combined_preset_select.empty();
    $combined_preset_select.append(`<option value="">Same as Combined Summary</option>`);
    for (const option of preset_options) {
        $combined_preset_select.append(`<option value="${option}">${option}</option>`);
    }
    $combined_preset_select.val(combined_preset);
    $combined_preset_select.off('click').on('click', () => update_error_detection_preset_dropdown());
}

function refresh_settings() {
    // Refresh all settings UI elements according to the current settings
    debug("Refreshing settings...")

    $('#scene_summary_template').val(get_settings('scene_summary_template') || default_scene_template);
    $('#combined_summary_template').val(get_settings('combined_summary_template') || default_combined_template);
    $('#short_template').val(get_settings('short_template') || default_short_template);
    $('#long_template').val(get_settings('long_template') || default_long_template);

        // Error detection presets
    update_error_detection_preset_dropdown();
    
    // Enable/disable error detection fields based on master toggle
    const error_detection_enabled = get_settings('error_detection_enabled');
    $(`.${settings_content_class} .error_detection_setting`).prop('disabled', !error_detection_enabled);
    
    // Enable/disable type-specific error detection settings
    const regular_error_enabled = get_settings('regular_summary_error_detection_enabled');
    const combined_error_enabled = get_settings('combined_summary_error_detection_enabled');
    
    $(`.${settings_content_class} .regular_error_detection_setting`).prop('disabled', !error_detection_enabled || !regular_error_enabled);
    $(`.${settings_content_class} .combined_error_detection_setting`).prop('disabled', !error_detection_enabled || !combined_error_enabled);

    // connection profiles
    // Always show the connection profile dropdown - let the user decide if they want to use it
    update_connection_profile_dropdown()
    check_connection_profile_valid()
    // Make sure the connection profile dropdown is visible
    $(`.${settings_content_class} #connection_profile`).parent().show()

    // completion presets
    update_preset_dropdown();
    update_combined_summary_preset_dropdown();
    update_scene_summary_preset_dropdown();
    update_auto_scene_break_preset_dropdown();
    update_auto_scene_break_connection_profile_dropdown();
    update_running_scene_summary_preset_dropdown();
    update_running_scene_summary_connection_profile_dropdown();
    check_preset_valid();

    // if prompt doesn't have {{message}}, insert it
    const prompt = get_settings('prompt');
    if (typeof prompt === "string" && !prompt.includes("{{message}}")) {
        set_settings('prompt', prompt + "\n{{message}}")
        debug("{{message}} macro not found in summary prompt. It has been added automatically.")
    }

    // auto_summarize_message_limit must be >= auto_summarize_batch_size (unless the limit is disabled, i.e. -1)
    const auto_limit = get_settings('auto_summarize_message_limit')
    const batch_size = get_settings('auto_summarize_batch_size')
    if (auto_limit >= 0 && (auto_limit < batch_size)) {
        set_settings('auto_summarize_message_limit', get_settings('auto_summarize_batch_size'));
        toast("The auto-summarize message limit must be greater than or equal to the batch size.", "warning")
    }

    // update the save icon highlight
    update_save_icon_highlight();

    // update the profile section
    update_profile_section()

    // iterate through the settings map and set each element to the current setting value
    for (const [key, [element, type]] of Object.entries(settings_ui_map)) {
        set_setting_ui_element(key, element, type);
    }

    // enable or disable settings based on others
    if (chat_enabled()) {
        $(`.${settings_content_class} .settings_input`).prop('disabled', false);  // enable all settings

        // when auto-summarize is disabled, related settings get disabled
        const auto_summarize = get_settings('auto_summarize');
        get_settings_element('auto_summarize_on_send')?.prop('disabled', !auto_summarize)
        get_settings_element('auto_summarize_message_limit')?.prop('disabled', !auto_summarize);
        get_settings_element('auto_summarize_batch_size')?.prop('disabled', !auto_summarize);
        get_settings_element('auto_summarize_progress')?.prop('disabled', !auto_summarize);
        get_settings_element('summarization_delay')?.prop('disabled', !auto_summarize);


        // If message history is disabled, disable the relevant settings
        const history_disabled = get_settings('include_message_history_mode') === "none";
        get_settings_element('include_message_history')?.prop('disabled', history_disabled)
        get_settings_element('include_user_messages_in_history')?.prop('disabled', history_disabled)
        get_settings_element('preview_message_history')?.prop('disabled', history_disabled)

        if (!history_disabled && !get_settings('prompt').includes("{{history}}")) {
            toastr.warning("To include message history, you must use the {{history}} macro in the prompt.")
        }

        // If not excluding message, then disable the option to preserve the last user message
        const excluding_messages = get_settings('exclude_messages_after_threshold')
        get_settings_element('keep_last_user_message')?.prop('disabled', !excluding_messages)


    } else {  // memory is disabled for this chat
        $(`.${settings_content_class} .settings_input`).prop('disabled', true);  // disable all settings
    }


    //////////////////////
    // Settings not in the config

    // set group chat character enable button state
    set_character_enabled_button_states()
}

async function update_running_scene_summary_preset_dropdown() {
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

export {
    update_save_icon_highlight,
    update_profile_section,
    update_preset_dropdown,
    update_combined_summary_preset_dropdown,
    update_connection_profile_dropdown,
    refresh_settings,
    update_error_detection_preset_dropdown,
    update_scene_summary_preset_dropdown,
    update_auto_scene_break_preset_dropdown,
    update_auto_scene_break_connection_profile_dropdown,
    update_running_scene_summary_preset_dropdown,
    update_running_scene_summary_connection_profile_dropdown
};
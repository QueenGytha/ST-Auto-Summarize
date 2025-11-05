// @flow
import {
    log,
    debug,
    error,
    toast,
    get_settings,
    set_settings,
    save_profile,
    load_profile,
    rename_profile,
    new_profile,
    delete_profile,
    export_profile,
    import_profile,
    toggle_character_profile,
    toggle_chat_profile,
    toggle_chat_enabled,
    refresh_settings,
    refresh_memory,
    get_user_setting_text_input,
    display_text_modal,
    bind_setting,
    bind_function,
    reset_settings,
    extension_settings,
    saveSettingsDebounced,
} from './index.js';
import { auto_lorebook_entry_lookup_prompt, auto_lorebook_entry_deduplicate_prompt } from './defaultPrompts.js';
import {
    ensureEntityTypesSetting,
    renderEntityTypesList,
    handleAddEntityTypeFromInput,
    removeEntityType,
    restoreEntityTypesToDefault,
} from './entityTypeSettingsUI.js';

// UI initialization
async function initialize_settings_listeners() {
    log("Initializing settings listeners")


    bind_setting('#error_detection_enabled', 'error_detection_enabled', 'boolean');
    bind_setting('#auto_hide_scene_count', 'auto_hide_scene_count', 'number', refresh_memory);

    // Trigger profile changes
    bind_setting('#profile', 'profile', 'text', () => load_profile(), false);
    bind_function('#restore_profile', () => load_profile(), false);
    bind_function('#rename_profile', () => rename_profile(), false)
    bind_function('#new_profile', new_profile, false);
    bind_function('#delete_profile', delete_profile, false);

    bind_function('#export_profile', () => export_profile(), false)
    bind_function('#import_profile', (e) => {

        // $FlowFixMe[cannot-resolve-name]
        log($(e.target))
        // $FlowFixMe[cannot-resolve-name]
        log($(e.target).parent().find("#import_file"))
        // $FlowFixMe[cannot-resolve-name]
        $(e.target).parent().find("#import_file").click()
    }, false)
    bind_function('#import_file', async (e) => await import_profile(e), false)

    bind_function('#character_profile', () => toggle_character_profile());
    bind_function('#chat_profile', () => toggle_chat_profile());
    bind_setting('#notify_on_profile_switch', 'notify_on_profile_switch', 'boolean')

    bind_function('#revert_settings', reset_settings);

    bind_function('#toggle_chat_memory', () => toggle_chat_enabled(), false);
    bind_function("#refresh_memory", () => refresh_memory());

    // First-Hop Proxy Integration Settings
    bind_setting('#first_hop_proxy_send_chat_details', 'first_hop_proxy_send_chat_details', 'boolean');
    bind_setting('#wrap_lorebook_entries', 'wrap_lorebook_entries', 'boolean');

    // Message Filtering Settings (used by scene summaries)
    bind_setting('#include_user_messages', 'include_user_messages', 'boolean');
    bind_setting('#include_system_messages', 'include_system_messages', 'boolean');
    bind_setting('#include_narrator_messages', 'include_narrator_messages', 'boolean');
    bind_setting('#message_length_threshold', 'message_length_threshold', 'number');

    bind_setting('#default_chat_enabled', 'default_chat_enabled', 'boolean');
    bind_setting('#use_global_toggle_state', 'use_global_toggle_state', 'boolean');

    // --- Scene Summary Settings ---
    bind_setting('#scene_summary_auto_name', 'scene_summary_auto_name', 'boolean');
    bind_setting('#scene_summary_auto_name_manual', 'scene_summary_auto_name_manual', 'boolean');
    bind_setting('#scene_summary_navigator_width', 'scene_summary_navigator_width', 'number', (value /*: number */) => {
        // Enforce min/max constraints (30-500 pixels)
        const clampedValue = Math.max(30, Math.min(500, value));
        if (clampedValue !== value) {
            set_settings('scene_summary_navigator_width', clampedValue);
            refresh_settings();
            toast('Navigator width clamped to valid range (30-500 pixels)', 'warning');
        }
        // Re-render navigator bar with new width
        // $FlowFixMe[cannot-resolve-name]
        if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
        // Update navbar toggle button position to match new width
        // $FlowFixMe[cannot-resolve-name]
        if (window.updateNavbarToggleButtonPosition) window.updateNavbarToggleButtonPosition();
    });
    bind_setting('#scene_summary_navigator_font_size', 'scene_summary_navigator_font_size', 'number', () => {
        // Re-render navigator bar with new font size
        // $FlowFixMe[cannot-resolve-name]
        if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
    });
    bind_setting('#scene_summary_prompt', 'scene_summary_prompt', 'text');
    bind_setting('#scene_summary_prefill', 'scene_summary_prefill', 'text');
    bind_setting('#scene_summary_message_types', 'scene_summary_message_types', 'text');

    // Persist and display scene_summary_history_count
    // $FlowFixMe[cannot-resolve-name]
    const $sceneHistoryCount = $('#scene_summary_history_count');
    // $FlowFixMe[cannot-resolve-name]
    const $sceneHistoryCountDisplay = $('#scene_summary_history_count_display');
    // Set default if not present
    if (get_settings('scene_summary_history_count') === undefined) {
        set_settings('scene_summary_history_count', 1);
    }
    $sceneHistoryCount.val(get_settings('scene_summary_history_count') || 1);
    $sceneHistoryCountDisplay.text($sceneHistoryCount.val());
    // $FlowFixMe[missing-this-annot]
    $sceneHistoryCount.on('input change', function () {
        // $FlowFixMe[cannot-resolve-name]
        const val = Math.max(1, Math.min(99, Number($(this).val()) || 1));
        set_settings('scene_summary_history_count', val);
        save_profile(); // auto-save when changed
        $sceneHistoryCount.val(val);
        $sceneHistoryCountDisplay.text(val);
    });

    // --- Scene Summary Validation Settings ---
    bind_setting('#scene_summary_error_detection_enabled', 'scene_summary_error_detection_enabled', 'boolean');
    bind_setting('#scene_summary_error_detection_preset', 'scene_summary_error_detection_preset', 'text');
    bind_setting('#scene_summary_error_detection_prefill', 'scene_summary_error_detection_prefill', 'text');
    bind_setting('#scene_summary_error_detection_retries', 'scene_summary_error_detection_retries', 'number');
    bind_setting('#scene_summary_error_detection_prompt', 'scene_summary_error_detection_prompt', 'text');

    bind_function('#edit_scene_summary_error_detection_prompt', async () => {
        const description = `
Configure the prompt used to verify that scene summaries meet your criteria.
The prompt should return "VALID" for acceptable summaries and "INVALID" for unacceptable ones.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{summary}}:</b> The generated scene summary to validate.</li>
</ul>`;
        await get_user_setting_text_input('scene_summary_error_detection_prompt', 'Edit Scene Summary Error Detection Prompt', description);
    });
    bind_function('#edit_scene_summary_prompt', async () => {
        const description = `
Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{message}}:</b> The scene content to summarize.</li>
    <li><b>{{history}}:</b> The message history as configured by the "Scene Message History Mode" setting.</li>
    <li><b>{{words}}:</b> The token limit as defined by the chosen completion preset.</li>
    <li><b>{{lorebook_entry_types}}:</b> Pipe-delimited list of enabled lorebook entry types.</li>
</ul>
`;
        await get_user_setting_text_input('scene_summary_prompt', 'Edit Scene Summary Prompt', description);
    });

    // Scene summary context limit and type
    bind_setting('#scene_summary_context_limit', 'scene_summary_context_limit', 'number');
    bind_setting('input[name="scene_summary_context_type"]', 'scene_summary_context_type', 'text');

    // Scene summary preset and connection profile
    bind_setting('#scene_summary_completion_preset', 'scene_summary_completion_preset', 'text');
    bind_setting('#scene_summary_connection_profile', 'scene_summary_connection_profile', 'text');

    // --- Running Scene Summary Settings ---
    bind_setting('#running_scene_summary_auto_generate', 'running_scene_summary_auto_generate', 'boolean');
    bind_setting('#running_scene_summary_show_navbar', 'running_scene_summary_show_navbar', 'boolean', () => {
        // Refresh navbar buttons visibility
        // $FlowFixMe[cannot-resolve-name]
        if (window.updateRunningSceneSummaryNavbar) window.updateRunningSceneSummaryNavbar();
    });
    bind_setting('#running_scene_summary_prompt', 'running_scene_summary_prompt', 'text');
    bind_setting('#running_scene_summary_prefill', 'running_scene_summary_prefill', 'text');
    bind_setting('#running_scene_summary_completion_preset', 'running_scene_summary_completion_preset', 'text');
    bind_setting('#running_scene_summary_connection_profile', 'running_scene_summary_connection_profile', 'text');
    bind_setting('#running_scene_summary_position', 'running_scene_summary_position', 'number');
    bind_setting('#running_scene_summary_depth', 'running_scene_summary_depth', 'number');
    bind_setting('#running_scene_summary_role', 'running_scene_summary_role');
    bind_setting('#running_scene_summary_scan', 'running_scene_summary_scan', 'boolean');
    bind_setting('#running_scene_summary_context_limit', 'running_scene_summary_context_limit', 'number');
    bind_setting('input[name="running_scene_summary_context_type"]', 'running_scene_summary_context_type', 'text');

    // Running scene summary exclude latest slider
    // $FlowFixMe[cannot-resolve-name]
    const $runningExcludeLatest = $('#running_scene_summary_exclude_latest');
    // $FlowFixMe[cannot-resolve-name]
    const $runningExcludeLatestDisplay = $('#running_scene_summary_exclude_latest_display');
    if (get_settings('running_scene_summary_exclude_latest') === undefined) {
        set_settings('running_scene_summary_exclude_latest', 1);
    }
    $runningExcludeLatest.val(get_settings('running_scene_summary_exclude_latest') || 1);
    $runningExcludeLatestDisplay.text($runningExcludeLatest.val());
    // $FlowFixMe[missing-this-annot]
    $runningExcludeLatest.on('input change', function () {
        // $FlowFixMe[cannot-resolve-name]
        const val = Math.max(0, Math.min(5, Number($(this).val()) || 1));
        set_settings('running_scene_summary_exclude_latest', val);
        save_profile();
        $runningExcludeLatest.val(val);
        $runningExcludeLatestDisplay.text(val);
    });

    // View/edit running scene summary button
    bind_function('#view_running_scene_summary', async () => {
        const { get_running_summary, get_current_running_summary_version, get_running_summary_versions, set_current_running_summary_version } = await import('./runningSceneSummary.js');
        const current = get_running_summary(get_current_running_summary_version());
        // $FlowFixMe[cannot-resolve-name]
        const ctx = getContext();

        if (!current) {
            toast('No running summary available yet. Generate a scene summary first.', 'warning');
            return;
        }

        const html = `
            <div>
                <h3>View/Edit Running Scene Summary</h3>
                <p>Current version: v${current.version} (${current.prev_scene_index ?? 0} > ${current.new_scene_index ?? 0})</p>
                <p>Editing will create a new version.</p>
                <textarea id="view_running_summary_textarea" rows="20" style="width: 100%; height: 400px;">${current.content || ""}</textarea>
            </div>
        `;

        try {
            const result = await ctx.callPopup(html, 'text', undefined, {
                okButton: "Save",
                cancelButton: "Cancel",
                wide: true,
                large: true
            });

            if (result) {
                // $FlowFixMe[cannot-resolve-name]
                const edited = $('#view_running_summary_textarea').val();
                if (edited !== null && edited !== current.content) {
                    // Editing creates a new version with same scene indexes
                    const versions = get_running_summary_versions();
                    const newVersion = {
                        version: versions.length + 1,
                        content: edited,
                        timestamp: Date.now(),
                        scene_count: current.scene_count,
                        exclude_count: current.exclude_count,
                        prev_scene_index: current.prev_scene_index ?? 0,
                        new_scene_index: current.new_scene_index ?? 0,
                    };
                    versions.push(newVersion);
                    set_current_running_summary_version(newVersion.version);
                    toast('Created new version from edit', 'success');
                    refresh_memory();
                }
            }
        } catch (err) {
            error('Failed to edit running summary', err);
        }
    });

    // Edit running scene summary prompt button
    bind_function('#edit_running_scene_summary_prompt', async () => {
        const description = `
Configure the prompt used to combine multiple scene summaries into a cohesive narrative memory.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{current_running_summary}}:</b> The current running summary (if exists).</li>
    <li><b>{{scene_summaries}}:</b> The individual scene summaries to merge.</li>
</ul>`;
        await get_user_setting_text_input('running_scene_summary_prompt', 'Edit Running Scene Summary Prompt', description);
    });

    // --- Auto Scene Break Detection Settings ---
    bind_setting('#auto_scene_break_on_load', 'auto_scene_break_on_load', 'boolean');
    bind_setting('#auto_scene_break_on_new_message', 'auto_scene_break_on_new_message', 'boolean');
    bind_setting('#auto_scene_break_generate_summary', 'auto_scene_break_generate_summary', 'boolean');
    bind_setting('#auto_scene_break_check_which_messages', 'auto_scene_break_check_which_messages', 'text');
    bind_setting('#auto_scene_break_recent_message_count', 'auto_scene_break_recent_message_count', 'number');
    bind_setting('#auto_scene_break_prompt', 'auto_scene_break_prompt', 'text');
    bind_setting('#auto_scene_break_prefill', 'auto_scene_break_prefill', 'text');
    bind_setting('#auto_scene_break_connection_profile', 'auto_scene_break_connection_profile', 'text');
    bind_setting('#auto_scene_break_completion_preset', 'auto_scene_break_completion_preset', 'text');

    // Message offset with live display update
    // $FlowFixMe[cannot-resolve-name]
    const $autoSceneBreakOffset = $('#auto_scene_break_message_offset');
    // $FlowFixMe[cannot-resolve-name]
    const $autoSceneBreakOffsetValue = $('#auto_scene_break_message_offset_value');
    if (get_settings('auto_scene_break_message_offset') === undefined) {
        set_settings('auto_scene_break_message_offset', 1);
    }
    $autoSceneBreakOffset.val(get_settings('auto_scene_break_message_offset') ?? 1);
    $autoSceneBreakOffsetValue.text($autoSceneBreakOffset.val());
    // $FlowFixMe[missing-this-annot]
    $autoSceneBreakOffset.on('input change', function () {
        // $FlowFixMe[cannot-resolve-name]
        let val = Number($(this).val());
        if (isNaN(val)) val = 1;
        val = Math.max(0, Math.min(10, val));
        set_settings('auto_scene_break_message_offset', val);
        save_profile(); // auto-save when changed
        $autoSceneBreakOffset.val(val);
        $autoSceneBreakOffsetValue.text(val);
    });

    // Edit prompt button
    bind_function('#edit_auto_scene_break_prompt', async () => {
        const description = `
Configure the prompt used to detect scene breaks automatically.
The prompt should return "true" if the message is a scene break, or "false" if it is not.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{message}}:</b> The message text to analyze for scene break detection.</li>
</ul>`;
        await get_user_setting_text_input('auto_scene_break_prompt', 'Edit Auto Scene Break Detection Prompt', description);
    });

    // Initialize running scene summary navbar
    const { createRunningSceneSummaryNavbar, updateRunningSceneSummaryNavbar } = await import('./runningSceneSummaryUI.js');
    createRunningSceneSummaryNavbar();
    updateRunningSceneSummaryNavbar();

    // Initialize Auto-Lorebooks settings event listeners
    initialize_lorebooks_settings_listeners();

    refresh_settings()
}

/**
 * Initialize event listeners for Auto-Lorebooks settings UI
 */
function initialize_lorebooks_settings_listeners() {
    ensureEntityTypesSetting();
    renderEntityTypesList();

    // Entity type management
    // $FlowFixMe[cannot-resolve-name]
    $(document).on('click', '#autolorebooks-add-entity-type', (event) => {
        event.preventDefault();
        handleAddEntityTypeFromInput();
    });
    // $FlowFixMe[cannot-resolve-name]
    $(document).on('keypress', '#autolorebooks-entity-type-input', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleAddEntityTypeFromInput();
        }
    });
    // $FlowFixMe[cannot-resolve-name]
    $(document).on('click', '.autolorebooks-entity-type-remove', (event) => {
        event.preventDefault();
        const type = $(event.currentTarget).attr('data-type') || '';
        removeEntityType(type);
    });
    // $FlowFixMe[cannot-resolve-name]
    $(document).on('click', '#autolorebooks-restore-entity-types', (event) => {
        event.preventDefault();
        restoreEntityTypesToDefault();
    });

    // Name template input
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('input', '#autolorebooks-name-template', function() {
        const value = $(this).val().trim();
        if (value && value.length > 0) {
            // $FlowFixMe[prop-missing]
            if (!extension_settings.autoLorebooks) extension_settings.autoLorebooks = {};
            // $FlowFixMe[prop-missing]
            extension_settings.autoLorebooks.nameTemplate = value;
            saveSettingsDebounced();
        }
    });

    // Delete on chat delete checkbox
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-delete-on-chat-delete', function() {
        const value = $(this).prop('checked');
        // $FlowFixMe[prop-missing]
        if (!extension_settings.autoLorebooks) extension_settings.autoLorebooks = {};
        // $FlowFixMe[prop-missing]
        extension_settings.autoLorebooks.deleteOnChatDelete = value;
        saveSettingsDebounced();
    });

    // Auto-reorder alphabetically checkbox
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-auto-reorder-alphabetically', function() {
        const value = $(this).prop('checked');
        // $FlowFixMe[prop-missing]
        if (!extension_settings.autoLorebooks) extension_settings.autoLorebooks = {};
        // $FlowFixMe[prop-missing]
        extension_settings.autoLorebooks.autoReorderAlphabetically = value;
        saveSettingsDebounced();
    });

    // Removed legacy Auto-Lorebooks queue toggles (queue is mandatory)

    // Summary processing settings
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-summary-skip-duplicates', function() {
        const value = $(this).prop('checked');
        set_settings('auto_lorebooks_summary_skip_duplicates', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-summary-merge-connection', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_merge_connection_profile', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-summary-merge-preset', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_merge_completion_preset', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('input', '#autolorebooks-summary-merge-prefill', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_merge_prefill', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('input', '#autolorebooks-summary-merge-prompt', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_merge_prompt', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-summary-triage-connection', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_lorebook_entry_lookup_connection_profile', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-summary-triage-preset', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_lorebook_entry_lookup_completion_preset', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('input', '#autolorebooks-summary-triage-prefill', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_lorebook_entry_lookup_prefill', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('input', '#autolorebooks-summary-triage-prompt', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_lorebook_entry_lookup_prompt', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-summary-entry-deduplicate-connection', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_connection_profile', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('change', '#autolorebooks-summary-entry-deduplicate-preset', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_completion_preset', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('input', '#autolorebooks-summary-entry-deduplicate-prefill', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_prefill', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('input', '#autolorebooks-summary-entry-deduplicate-prompt', function() {
        const value = $(this).val();
        set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_prompt', value);
        save_profile();
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('click', '#restore-summary-triage-prompt', function() {
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-summary-lorebook-entry-lookup-prompt').val(auto_lorebook_entry_lookup_prompt);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-summary-lorebook-entry-lookup-prompt').trigger('input');
        toast('Lorebook Entry Lookup prompt restored to default', 'success');
    });

    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('click', '#restore-summary-entry-deduplicate-prompt', function() {
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-summary-entry-deduplicate-prompt').val(auto_lorebook_entry_deduplicate_prompt);
        // $FlowFixMe[cannot-resolve-name]
        $('#autolorebooks-summary-entry-deduplicate-prompt').trigger('input');
        toast('LorebookEntryDeduplicate prompt restored to default', 'success');
    });

    debug("Auto-Lorebooks settings event listeners initialized");
}

export { initialize_settings_listeners };

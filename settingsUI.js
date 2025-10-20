// @flow
import {
    log,
    error,
    toast,
    get_message_history,
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
    create_summary_prompt,
    toggle_chat_profile,
    toggle_chat_enabled,
    refresh_settings,
    refresh_memory,
    stop_summarization,
    memoryEditInterface,
    get_summary_preset_max_tokens,
    get_user_setting_text_input,
    display_text_modal,
    bind_setting,
    bind_function,
    reset_settings,
    get_short_token_limit,
    default_scene_template,
} from './index.js';

// UI initialization
async function initialize_settings_listeners() {
    log("Initializing settings listeners")


    bind_setting('#error_detection_enabled', 'error_detection_enabled', 'boolean');
    bind_setting('#message_summary_error_detection_enabled', 'message_summary_error_detection_enabled', 'boolean');
    bind_setting('#message_summary_error_detection_retries', 'message_summary_error_detection_retries', 'number');
    bind_setting('#message_summary_error_detection_preset', 'message_summary_error_detection_preset', 'text');
    bind_setting('#message_summary_error_detection_prefill', 'message_summary_error_detection_prefill', 'text');
    bind_setting('#scene_summary_template', 'scene_summary_template', 'text');

    bind_function('#edit_scene_injection_template', async () => {
        const description = `
    This controls the template for scene summary injection.<br>
    Macros: <b>{{scene_summaries}}</b> will be replaced with the scene summaries.
        `;
        const value = await get_user_setting_text_input('scene_summary_template', 'Edit Scene Injection Template', description, default_scene_template);
        if (value !== undefined) {
            set_settings('scene_summary_template', value);
            save_profile();
        }
    });

    bind_function('#edit_message_summary_error_detection_prompt', async () => {
        const description = `
Configure the prompt used to verify that regular summaries meet your criteria.
The prompt should return "VALID" for acceptable summaries and "INVALID" for unacceptable ones.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{summary}}:</b> The generated summary to validate.</li>
</ul>`;
        get_user_setting_text_input('message_summary_error_detection_prompt', 'Edit Message Summary Error Detection Prompt', description);
    });

    bind_setting('#auto_hide_message_age', 'auto_hide_message_age', 'number', refresh_memory);
    bind_setting('#auto_hide_scene_count', 'auto_hide_scene_count', 'number', refresh_memory);

    // Trigger profile changes
    bind_setting('#profile', 'profile', 'text', () => load_profile(), false);
    bind_function('#save_profile', () => save_profile(), false);
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

    bind_function('#stop_summarization', stop_summarization);
    bind_function('#revert_settings', reset_settings);

    bind_function('#toggle_chat_memory', () => toggle_chat_enabled(), false);
    bind_function('#edit_memory_state', () => memoryEditInterface.show())
    bind_function("#refresh_memory", () => refresh_memory());

    bind_function('#edit_summary_prompt', async () => {
        const max_tokens = await get_summary_preset_max_tokens()
        const description = `
Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{message}}:</b> The message text.</li>
    <li><b>{{history}}:</b> The message history as configured by the "Message History" setting.</li>
    <li><b>{{words}}:</b> The token limit as defined by the chosen completion preset (Currently: ${max_tokens}).</li>
</ul>
`
        get_user_setting_text_input('prompt', 'Edit Summary Prompt', description)
    })
    bind_function('#preview_message_history', async () => {
        // $FlowFixMe[cannot-resolve-name]
        const chat = getContext().chat;
        const history = get_message_history(chat.length-1);
        display_text_modal("{{history}} Macro Preview (Last Message)", history);
    })
    bind_function('#preview_summary_prompt', async () => {
        // $FlowFixMe[cannot-resolve-name]
        const text = await create_summary_prompt(getContext().chat.length-1)
        display_text_modal("Summary Prompt Preview (Last Message)", text);
    })

    bind_setting('#connection_profile', 'connection_profile', 'text')
    bind_setting('#completion_preset', 'completion_preset', 'text')
    bind_setting('#auto_summarize', 'auto_summarize', 'boolean');
    bind_setting('#auto_summarize_on_edit', 'auto_summarize_on_edit', 'boolean');
    bind_setting('#auto_summarize_on_swipe', 'auto_summarize_on_swipe', 'boolean');
    bind_setting('#auto_summarize_batch_size', 'auto_summarize_batch_size', 'number');
    bind_setting('#auto_summarize_message_limit', 'auto_summarize_message_limit', 'number');
    bind_setting('#auto_summarize_progress', 'auto_summarize_progress', 'boolean');
    bind_setting('#auto_summarize_on_send', 'auto_summarize_on_send', 'boolean');
    bind_setting('#summarization_delay', 'summarization_delay', 'number');
    bind_setting('#summarization_time_delay', 'summarization_time_delay', 'number')
    bind_setting('#prefill', 'prefill', 'text')
    bind_setting('#show_prefill', 'show_prefill', 'boolean')

    bind_setting('#include_user_messages', 'include_user_messages', 'boolean');
    bind_setting('#include_system_messages', 'include_system_messages', 'boolean');
    bind_setting('#include_narrator_messages', 'include_narrator_messages', 'boolean')
    bind_setting('#message_length_threshold', 'message_length_threshold', 'number');

    bind_setting('#include_world_info', 'include_world_info', 'boolean');
    bind_setting('#block_chat', 'block_chat', 'boolean');
    bind_setting('#nest_messages_in_prompt', 'nest_messages_in_prompt', 'boolean')
    bind_setting('#include_message_history', 'include_message_history', 'number');
    bind_setting('#include_message_history_mode', 'include_message_history_mode', 'text');
    bind_setting('#include_user_messages_in_history', 'include_user_messages_in_history', 'boolean');

    bind_setting('#summary_injection_separator', 'summary_injection_separator', 'text')
    bind_setting('#summary_injection_threshold', 'summary_injection_threshold', 'number');
    bind_setting('#exclude_messages_after_threshold', 'exclude_messages_after_threshold', 'boolean');
    bind_setting('#keep_last_user_message', 'keep_last_user_message', 'boolean')

    bind_setting('#message_summary_context_limit', 'message_summary_context_limit', 'number', () => {
        // $FlowFixMe[cannot-resolve-name]
        $('#message_summary_context_limit_display').text(get_short_token_limit());
    });
    bind_setting('input[name="message_summary_context_type"]', 'message_summary_context_type', 'text', () => {
        // $FlowFixMe[cannot-resolve-name]
        $('#message_summary_context_limit_display').text(get_short_token_limit());
    })

    bind_setting('#debug_mode', 'debug_mode', 'boolean');
    bind_setting('#display_memories', 'display_memories', 'boolean')
    bind_setting('#default_chat_enabled', 'default_chat_enabled', 'boolean');
    bind_setting('#use_global_toggle_state', 'use_global_toggle_state', 'boolean');

    // Operation Queue settings
    bind_setting('#operation_queue_enabled', 'operation_queue_enabled', 'boolean');
    bind_setting('#operation_queue_use_lorebook', 'operation_queue_use_lorebook', 'boolean');
    bind_setting('#operation_queue_display_enabled', 'operation_queue_display_enabled', 'boolean');

    // trigger the change event once to update the display at start
    // $FlowFixMe[cannot-resolve-name]
    $('#message_summary_context_limit').trigger('change');

    // --- Scene Summary Settings ---
    bind_setting('#scene_summary_enabled', 'scene_summary_enabled', 'boolean');
    bind_setting('#scene_summary_auto_name', 'scene_summary_auto_name', 'boolean');
    bind_setting('#scene_summary_auto_name_manual', 'scene_summary_auto_name_manual', 'boolean');
    bind_setting('#scene_summary_navigator_width', 'scene_summary_navigator_width', 'number', () => {
        // Re-render navigator bar with new width
        // $FlowFixMe[cannot-resolve-name]
        if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
    });
    bind_setting('#scene_summary_navigator_font_size', 'scene_summary_navigator_font_size', 'number', () => {
        // Re-render navigator bar with new font size
        // $FlowFixMe[cannot-resolve-name]
        if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
    });
    bind_setting('#scene_summary_prompt', 'scene_summary_prompt', 'text');
    bind_setting('#scene_summary_prefill', 'scene_summary_prefill', 'text');
    bind_setting('#scene_summary_position', 'scene_summary_position', 'number');
    bind_setting('#scene_summary_depth', 'scene_summary_depth', 'number');
    bind_setting('#scene_summary_role', 'scene_summary_role');
    bind_setting('#scene_summary_scan', 'scene_summary_scan', 'boolean');
    bind_setting('#scene_summary_history_mode', 'scene_summary_history_mode', 'text');
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
        get_user_setting_text_input('scene_summary_error_detection_prompt', 'Edit Scene Summary Error Detection Prompt', description);
    });
    bind_function('#edit_scene_summary_prompt', async () => {
        const description = `
Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{message}}:</b> The scene content to summarize.</li>
    <li><b>{{history}}:</b> The message history as configured by the "Scene Message History Mode" setting.</li>
    <li><b>{{words}}:</b> The token limit as defined by the chosen completion preset.</li>
</ul>
`;
        get_user_setting_text_input('scene_summary_prompt', 'Edit Scene Summary Prompt', description);
    });

    // Scene summary context limit and type
    bind_setting('#scene_summary_context_limit', 'scene_summary_context_limit', 'number');
    bind_setting('input[name="scene_summary_context_type"]', 'scene_summary_context_type', 'text');

    // --- Running Scene Summary Settings ---
    bind_setting('#running_scene_summary_enabled', 'running_scene_summary_enabled', 'boolean', refresh_memory);
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
        get_user_setting_text_input('running_scene_summary_prompt', 'Edit Running Scene Summary Prompt', description);
    });

    // --- Auto Scene Break Detection Settings ---
    bind_setting('#auto_scene_break_enabled', 'auto_scene_break_enabled', 'boolean');
    bind_setting('#auto_scene_break_on_load', 'auto_scene_break_on_load', 'boolean');
    bind_setting('#auto_scene_break_on_new_message', 'auto_scene_break_on_new_message', 'boolean');
    bind_setting('#auto_scene_break_generate_summary', 'auto_scene_break_generate_summary', 'boolean');
    bind_setting('#auto_scene_break_check_which_messages', 'auto_scene_break_check_which_messages', 'text');
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
        get_user_setting_text_input('auto_scene_break_prompt', 'Edit Auto Scene Break Detection Prompt', description);
    });

    // Initialize running scene summary navbar
    const { createRunningSceneSummaryNavbar, updateRunningSceneSummaryNavbar } = await import('./runningSceneSummaryUI.js');
    createRunningSceneSummaryNavbar();
    updateRunningSceneSummaryNavbar();

    refresh_settings()
}

export { initialize_settings_listeners };
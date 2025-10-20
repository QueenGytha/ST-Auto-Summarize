import {
    log,
    error,
    toast,
    SUBSYSTEM,
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
    generate_combined_summary,
    get_summary_preset_max_tokens,
    get_combined_summary_preset_max_tokens,
    get_user_setting_text_input,
    display_text_modal,
    bind_setting,
    bind_function,
    reset_settings,
    get_long_token_limit,
    get_short_token_limit,
    load_combined_summary,
    save_combined_summary,
    short_memory_macro,
    long_memory_macro,
    generic_memories_macro,
    default_short_template,
    default_long_template,
    default_scene_template,
    default_combined_template,
} from './index.js';

// UI initialization
async function initialize_settings_listeners() {
    log("Initializing settings listeners")


    bind_setting('#error_detection_enabled', 'error_detection_enabled', 'boolean');
    bind_setting('#regular_summary_error_detection_enabled', 'regular_summary_error_detection_enabled', 'boolean');
    bind_setting('#combined_summary_error_detection_enabled', 'combined_summary_error_detection_enabled', 'boolean');
    bind_setting('#regular_summary_error_detection_retries', 'regular_summary_error_detection_retries', 'number');
    bind_setting('#combined_summary_error_detection_retries', 'combined_summary_error_detection_retries', 'number');
    bind_setting('#regular_summary_error_detection_preset', 'regular_summary_error_detection_preset', 'text');
    bind_setting('#combined_summary_error_detection_preset', 'combined_summary_error_detection_preset', 'text');
    bind_setting('#regular_summary_error_detection_prefill', 'regular_summary_error_detection_prefill', 'text');
    bind_setting('#combined_summary_error_detection_prefill', 'combined_summary_error_detection_prefill', 'text');
    bind_setting('#short_template', 'short_template', 'text');
    bind_setting('#long_template', 'long_template', 'text');
    bind_setting('#scene_summary_template', 'scene_summary_template', 'text');
    bind_setting('#combined_summary_template', 'combined_summary_template', 'text');

    bind_function('#edit_short_term_injection_template', async () => {
        const description = `
        This controls the template for short-term memory injection.<br>
        Macros: <b>{{memories}}</b> will be replaced with the short-term summaries.
        `;
        const value = await get_user_setting_text_input('short_template', 'Edit Short-Term Injection Template', description, default_short_template);
        if (value !== undefined) {
            set_settings('short_template', value);
            save_profile();
        }
    });

    bind_function('#edit_long_term_injection_template', async () => {
        const description = `
        This controls the template for long-term memory injection.<br>
        Macros: <b>{{memories}}</b> will be replaced with the long-term summaries.
        `;
        const value = await get_user_setting_text_input('long_template', 'Edit Long-Term Injection Template', description, default_long_template);
        if (value !== undefined) {
            set_settings('long_template', value);
            save_profile();
        }
    });

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

    bind_function('#edit_combined_injection_template', async () => {
        const description = `
    This controls the template for combined summary injection.<br>
    Macros: <b>{{memories}}</b> will be replaced with the combined summaries.
        `;
        const value = await get_user_setting_text_input('combined_summary_template', 'Edit Combined Injection Template', description, default_combined_template);
        if (value !== undefined) {
            set_settings('combined_summary_template', value);
            save_profile();
        }
    });

    bind_function('#edit_regular_summary_error_detection_prompt', async () => {
        const description = `
Configure the prompt used to verify that regular summaries meet your criteria.
The prompt should return "VALID" for acceptable summaries and "INVALID" for unacceptable ones.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{summary}}:</b> The generated summary to validate.</li>
</ul>`;
        get_user_setting_text_input('regular_summary_error_detection_prompt', 'Edit Regular Summary Error Detection Prompt', description);
    });
    
    bind_function('#edit_combined_summary_error_detection_prompt', async () => {
        const description = `
Configure the prompt used to verify that combined summaries meet your criteria.
The prompt should return "VALID" for acceptable summaries and "INVALID" for unacceptable ones.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{summary}}:</b> The generated combined summary to validate.</li>
</ul>`;
        get_user_setting_text_input('combined_summary_error_detection_prompt', 'Edit Combined Summary Error Detection Prompt', description);
    });

    bind_setting('#combined_summary_short_count', 'combined_summary_short_count', 'number');
    bind_setting('#combined_summary_short_once', 'combined_summary_short_once', 'boolean');
    bind_setting('#combined_summary_long_count', 'combined_summary_long_count', 'number');
    bind_setting('#combined_summary_long_once', 'combined_summary_long_once', 'boolean');
    bind_setting('#combined_summary_scene_count', 'combined_summary_scene_count', 'number');
    bind_setting('#combined_summary_scene_once', 'combined_summary_scene_once', 'boolean');

    bind_setting('#combined_summary_run_interval', 'combined_summary_run_interval', 'number');
    bind_setting('#auto_hide_message_age', 'auto_hide_message_age', 'number', refresh_memory);
    bind_setting('#auto_hide_scene_count', 'auto_hide_scene_count', 'number', refresh_memory);
    bind_setting('#show_combined_summary_toast', 'show_combined_summary_toast', 'boolean');

    // Trigger profile changes
    bind_setting('#profile', 'profile', 'text', () => load_profile(), false);
    bind_function('#save_profile', () => save_profile(), false);
    bind_function('#restore_profile', () => load_profile(), false);
    bind_function('#rename_profile', () => rename_profile(), false)
    bind_function('#new_profile', new_profile, false);
    bind_function('#delete_profile', delete_profile, false);

    bind_function('#export_profile', () => export_profile(), false)
    bind_function('#import_profile', (e) => {

        log($(e.target))
        log($(e.target).parent().find("#import_file"))
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
    bind_function('#edit_long_term_memory_prompt', async () => {
        const description = `
<ul style="text-align: left; font-size: smaller;">
    <li>This will be the content of the <b>{{${long_memory_macro}}}</b> macro.</li>
    <li>If there is nothing in long-term memory, the whole macro will be empty.</li>
    <li>In this input, the <b>{{${generic_memories_macro}}}</b> macro will be replaced by all long-term memories.</li>
</ul>`
        get_user_setting_text_input('long_template', `Edit Long-Term Memory Injection`, description)
    })
    bind_function('#edit_short_term_memory_prompt', async () => {
        const description = `
<ul style="text-align: left; font-size: smaller;">
    <li>This will be the content of the <b>{{${short_memory_macro}}}</b> macro.</li>
    <li>If there is nothing in short-term memory, the whole macro will be empty.</li>
    <li>In this input, the <b>{{${generic_memories_macro}}}</b> macro will be replaced by all short-term memories.</li>
</ul>`
        get_user_setting_text_input('short_template', `Edit Short-Term Memory Injection`, description)
    })
    bind_function('#preview_message_history', async () => {
        const chat = getContext().chat;
        const history = get_message_history(chat.length-1);
        display_text_modal("{{history}} Macro Preview (Last Message)", history);
    })
    bind_function('#preview_summary_prompt', async () => {
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

    bind_setting('input[name="short_term_position"]', 'short_term_position', 'number');
    bind_setting('#short_term_depth', 'short_term_depth', 'number');
    bind_setting('#short_term_role', 'short_term_role');
    bind_setting('#short_term_scan', 'short_term_scan', 'boolean');
    bind_setting('#short_term_context_limit', 'short_term_context_limit', 'number', () => {
        $('#short_term_context_limit_display').text(get_short_token_limit());
    });
    bind_setting('input[name="short_term_context_type"]', 'short_term_context_type', 'text', () => {
        $('#short_term_context_limit_display').text(get_short_token_limit());
    })

    bind_setting('input[name="long_term_position"]', 'long_term_position', 'number');
    bind_setting('#long_term_depth', 'long_term_depth', 'number');
    bind_setting('#long_term_role', 'long_term_role');
    bind_setting('#long_term_scan', 'long_term_scan', 'boolean');
    bind_setting('#long_term_context_limit', 'long_term_context_limit', 'number', () => {
        $('#long_term_context_limit_display').text(get_long_token_limit());  // update the displayed token limit
    });
    bind_setting('input[name="long_term_context_type"]', 'long_term_context_type', 'text', () => {
        $('#long_term_context_limit_display').text(get_long_token_limit());  // update the displayed token limit
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
    $('#long_term_context_limit').trigger('change');
    $('#short_term_context_limit').trigger('change');

    // --- Combined Summary Settings ---
    bind_setting('#combined_summary_enabled', 'combined_summary_enabled', 'boolean');
    bind_setting('#combined_summary_prompt', 'combined_summary_prompt', 'text');
    bind_setting('#combined_summary_prefill', 'combined_summary_prefill', 'text');
    bind_setting('#combined_summary_template', 'combined_summary_template', 'text');
    bind_setting('#combined_summary_position', 'combined_summary_position', 'number');
    bind_setting('#combined_summary_depth', 'combined_summary_depth', 'number');
    bind_setting('#combined_summary_role', 'combined_summary_role');
    bind_setting('#combined_summary_scan', 'combined_summary_scan', 'boolean');
    bind_setting('#combined_summary_context_limit', 'combined_summary_context_limit', 'number');
    bind_setting('input[name="combined_summary_context_type"]', 'combined_summary_context_type', 'text');
    bind_setting('#combined_summary_completion_preset', 'combined_summary_completion_preset', 'text');
    bind_function('#edit_combined_summary_prompt', async () => {
        const max_tokens = await get_combined_summary_preset_max_tokens();
        const description = `
Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{message}}:</b> The concatenated summaries.</li>
    <li><b>{{history}}:</b> The message history (chat messages and/or summaries) as configured in 'Message History'.</li>
    <li><b>{{words}}:</b> The token limit as defined by the chosen completion preset (Currently: ${max_tokens}).</li>
    <li><b>{{previous_combined_summary}}:</b> The previously generated combined summary, if one exists..</li>
</ul>
`;
        get_user_setting_text_input('combined_summary_prompt', 'Edit Combined Summary Prompt', description);
    });
    bind_function('#view_combined_summary', async () => {
    const summary = load_combined_summary();
    
    // Create a popup with editable textarea
    const ctx = getContext();
    const title = "Current Combined Summary";
    const description = "You can edit the combined summary below:";
    
    // Create HTML with a textarea but NO custom buttons - we'll handle them using callPopup's default buttons
    const html = `
        <div>
            <h3>${title}</h3>
            <p>${description}</p>
            <textarea id="combined_summary_textarea" rows="20" style="width: 100%; height: 300px;">${summary || ""}</textarea>
        </div>
    `;
    
    try {
        // Create a popup with standard buttons that we rename
        const result = await ctx.callPopup(html, 'text', undefined, {
            okButton: "Save",
            cancelButton: "Cancel",
            wide: true,
            large: true
        });
        
        // If the user clicked Save (OK button), save the summary
        if (result) {
            const newText = $('#combined_summary_textarea').val();
            save_combined_summary(newText);
            toast("Combined summary updated successfully", "success");
            refresh_memory();
        }
        // If Cancel is clicked, do nothing (popup closes automatically)
        
        // Add a regenerate button AFTER the popup is shown
        setTimeout(() => {
            const $popup = $('.popup:visible');
            
            // Create and style the regenerate button
            const $regenerateBtn = $('<button class="menu_button"><i class="fa-solid fa-rotate"></i> Regenerate</button>');
            $regenerateBtn.css({
                'position': 'absolute',
                'bottom': '28px',
                'left': '20px',
                'z-index': '10'
            });
            
            // Handle regenerate functionality
            $regenerateBtn.on('click', async function() {
                $(this).prop('disabled', true);
                $(this).html('<i class="fa-solid fa-spinner fa-spin"></i> Generating...');
                
                try {
                    toast("Generating new combined summary...", "info");
                    const newSummary = await generate_combined_summary();
                    $('#combined_summary_textarea').val(newSummary || "");
                } catch (err) {
                    toast("Error generating combined summary: " + err, "error");
                } finally {
                    $(this).prop('disabled', false);
                    $(this).html('<i class="fa-solid fa-rotate"></i> Regenerate');
                }
            });
            
            // Add the button to the visible popup
            $popup.append($regenerateBtn);

            // --- Add Cancel button ---
            // Only add if not already present
            if ($popup.find('.menu_button.cancel-combined-summary').length === 0) {
                const $cancelBtn = $('<button class="menu_button cancel-combined-summary"><i class="fa-solid fa-xmark"></i> Cancel</button>');
                $cancelBtn.css({
                    'position': 'absolute',
                    'bottom': '28px',
                    'left': '150px',
                    'z-index': '10'
                });
                $cancelBtn.on('click', function() {
                    // Close the popup without saving changes
                    $popup.find('.popup-close, .close, .fa-circle-xmark').trigger('click');
                });
                $popup.append($cancelBtn);
            }
            // --- End Cancel button ---
        }, 10); // Short delay to ensure popup is rendered
        
    } catch (err) {
        error(SUBSYSTEM.UI, "Error with popup:", err);
        // Fallback to basic prompt if the popup fails
        const confirmEdit = confirm("Would you like to manually edit the combined summary?");
        if (confirmEdit) {
            const newText = prompt("Enter new combined summary:", summary || "");
            if (newText !== null) {
                save_combined_summary(newText);
                toast("Combined summary updated successfully", "success");
                refresh_memory();
            }
        }
    }
});
    // --- END Combined Summary Settings ---

    // --- Scene Summary Settings ---
    bind_setting('#scene_summary_enabled', 'scene_summary_enabled', 'boolean');
    bind_setting('#scene_summary_auto_name', 'scene_summary_auto_name', 'boolean');
    bind_setting('#scene_summary_auto_name_manual', 'scene_summary_auto_name_manual', 'boolean');
    bind_setting('#scene_summary_navigator_width', 'scene_summary_navigator_width', 'number', () => {
        // Re-render navigator bar with new width
        if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
    });
    bind_setting('#scene_summary_navigator_font_size', 'scene_summary_navigator_font_size', 'number', () => {
        // Re-render navigator bar with new font size
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
    const $sceneHistoryCount = $('#scene_summary_history_count');
    const $sceneHistoryCountDisplay = $('#scene_summary_history_count_display');
    // Set default if not present
    if (get_settings('scene_summary_history_count') === undefined) {
        set_settings('scene_summary_history_count', 1);
    }
    $sceneHistoryCount.val(get_settings('scene_summary_history_count') || 1);
    $sceneHistoryCountDisplay.text($sceneHistoryCount.val());
    $sceneHistoryCount.on('input change', function () {
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
    const $runningExcludeLatest = $('#running_scene_summary_exclude_latest');
    const $runningExcludeLatestDisplay = $('#running_scene_summary_exclude_latest_display');
    if (get_settings('running_scene_summary_exclude_latest') === undefined) {
        set_settings('running_scene_summary_exclude_latest', 1);
    }
    $runningExcludeLatest.val(get_settings('running_scene_summary_exclude_latest') || 1);
    $runningExcludeLatestDisplay.text($runningExcludeLatest.val());
    $runningExcludeLatest.on('input change', function () {
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
    const $autoSceneBreakOffset = $('#auto_scene_break_message_offset');
    const $autoSceneBreakOffsetValue = $('#auto_scene_break_message_offset_value');
    if (get_settings('auto_scene_break_message_offset') === undefined) {
        set_settings('auto_scene_break_message_offset', 1);
    }
    $autoSceneBreakOffset.val(get_settings('auto_scene_break_message_offset') ?? 1);
    $autoSceneBreakOffsetValue.text($autoSceneBreakOffset.val());
    $autoSceneBreakOffset.on('input change', function () {
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
import {
    log,
    debug,
    error,
    toast,
    get_settings,
    set_settings,
    get_settings_element,
    get_manifest,
    load_settings_html,
    save_profile,
    load_profile,
    rename_profile,
    new_profile,
    delete_profile,
    export_profile,
    import_profile,
    toggle_character_profile,
    toggle_chat_profile,
    get_character_profile,
    set_character_profile,
    get_chat_profile,
    refresh_settings,
    refresh_memory,
    summarize_messages,
    stop_summarization,
    remember_message_toggle,
    forget_message_toggle,
    display_injection_preview,
    collect_messages_to_auto_summarize,
    generate_combined_summary,
    get_summary_preset_max_tokens,
    get_combined_summary_preset_max_tokens,
    get_user_setting_text_input,
    display_text_modal,
    open_edit_memory_input,
    MemoryEditInterface,
    bind_setting,
    bind_function,
    reset_settings,
    get_long_token_limit,
    get_short_token_limit
} from './index.js';

// UI initialization
function initialize_settings_listeners() {
    log("Initializing settings listeners")

        // Error detection section
    bind_setting('#error_detection_enabled', 'error_detection_enabled', 'boolean');
    bind_setting('#regular_summary_error_detection_enabled', 'regular_summary_error_detection_enabled', 'boolean');
    bind_setting('#combined_summary_error_detection_enabled', 'combined_summary_error_detection_enabled', 'boolean');
    bind_setting('#regular_summary_error_detection_retries', 'regular_summary_error_detection_retries', 'number');
    bind_setting('#combined_summary_error_detection_retries', 'combined_summary_error_detection_retries', 'number');
    bind_setting('#regular_summary_error_detection_preset', 'regular_summary_error_detection_preset', 'text');
    bind_setting('#combined_summary_error_detection_preset', 'combined_summary_error_detection_preset', 'text');
    bind_setting('#regular_summary_error_detection_prefill', 'regular_summary_error_detection_prefill', 'text');
    bind_setting('#combined_summary_error_detection_prefill', 'combined_summary_error_detection_prefill', 'text');
    
    bind_function('#edit_regular_summary_error_detection_prompt', async () => {
        let description = `
Configure the prompt used to verify that regular summaries meet your criteria.
The prompt should return "VALID" for acceptable summaries and "INVALID" for unacceptable ones.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{summary}}:</b> The generated summary to validate.</li>
</ul>`;
        get_user_setting_text_input('regular_summary_error_detection_prompt', 'Edit Regular Summary Error Detection Prompt', description);
    });
    
    bind_function('#edit_combined_summary_error_detection_prompt', async () => {
        let description = `
Configure the prompt used to verify that combined summaries meet your criteria.
The prompt should return "VALID" for acceptable summaries and "INVALID" for unacceptable ones.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{summary}}:</b> The generated combined summary to validate.</li>
</ul>`;
        get_user_setting_text_input('combined_summary_error_detection_prompt', 'Edit Combined Summary Error Detection Prompt', description);
    });

    bind_setting('#combined_summary_run_interval', 'combined_summary_run_interval', 'number');
    bind_setting('#auto_hide_message_age', 'auto_hide_message_age', 'number', () => refresh_memory());
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
        let max_tokens = await get_summary_preset_max_tokens()
        let description = `
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
        let description = `
<ul style="text-align: left; font-size: smaller;">
    <li>This will be the content of the <b>{{${long_memory_macro}}}</b> macro.</li>
    <li>If there is nothing in long-term memory, the whole macro will be empty.</li>
    <li>In this input, the <b>{{${generic_memories_macro}}}</b> macro will be replaced by all long-term memories.</li>
</ul>`
        get_user_setting_text_input('long_template', `Edit Long-Term Memory Injection`, description)
    })
    bind_function('#edit_short_term_memory_prompt', async () => {
        let description = `
<ul style="text-align: left; font-size: smaller;">
    <li>This will be the content of the <b>{{${short_memory_macro}}}</b> macro.</li>
    <li>If there is nothing in short-term memory, the whole macro will be empty.</li>
    <li>In this input, the <b>{{${generic_memories_macro}}}</b> macro will be replaced by all short-term memories.</li>
</ul>`
        get_user_setting_text_input('short_template', `Edit Short-Term Memory Injection`, description)
    })
    bind_function('#preview_message_history', async () => {
        let chat = getContext().chat;
        let history = get_message_history(chat.length-1);
        display_text_modal("{{history}} Macro Preview (Last Message)", history);
    })
    bind_function('#preview_summary_prompt', async () => {
        let text = await create_summary_prompt(getContext().chat.length-1)
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
        let max_tokens = await get_combined_summary_preset_max_tokens();
        let description = `
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
    let ctx = getContext();
    let title = "Current Combined Summary";
    let description = "You can edit the combined summary below:";
    
    // Create HTML with a textarea but NO custom buttons - we'll handle them using callPopup's default buttons
    let html = `
        <div>
            <h3>${title}</h3>
            <p>${description}</p>
            <textarea id="combined_summary_textarea" rows="20" style="width: 100%; height: 300px;">${summary || ""}</textarea>
        </div>
    `;
    
    try {
        // Store original summary for potential restoration
        const originalSummary = summary;
        
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
                    let newSummary = await generate_combined_summary();
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
        
    } catch (error) {
        console.error("Error with popup:", error);
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

    refresh_settings()
}

export { initialize_settings_listeners };
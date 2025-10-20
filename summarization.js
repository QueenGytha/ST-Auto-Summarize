import {
    get_settings,
    set_settings,
    get_data,
    set_data,
    get_memory,
    check_message_exclusion,
    update_message_visuals,
    memoryEditInterface,
    progress_bar,
    remove_progress_bar,
    toast,
    error,
    debug,
    log,
    count_tokens,
    get_context_size,
    get_summary_preset_max_tokens,
    formatInstructModeChat,
    substitute_conditionals,
    substitute_params,
    system_prompt_split,
    get_current_preset,
    set_preset,
    get_current_connection_profile,
    set_connection_profile,
    getContext,
    scrollChatToBottom,
    validate_summary,
    refresh_memory,
    power_user,
    main_api,
    getStringHash,
    generateRaw,
    trimToEndSentence,
    generate_combined_summary
} from './index.js';

// Summarization
let SUMMARIZATION_DELAY_TIMEOUT = null  // the set_timeout object for the summarization delay
let SUMMARIZATION_DELAY_RESOLVE = null

let STOP_SUMMARIZATION
function getStopSummarization() {
    return STOP_SUMMARIZATION;
}

function setStopSummarization(val) {
    STOP_SUMMARIZATION = val;
}
setStopSummarization(false);

async function summarize_messages(indexes=null, show_progress=true) {
    // Summarize the given list of message indexes (or a single index)
    const ctx = getContext();

    if (indexes === null) {  // default to the mose recent message, min 0
        indexes = [Math.max(ctx.chat.length - 1, 0)]
    }
    indexes = Array.isArray(indexes) ? indexes : [indexes]  // cast to array if only one given
    if (!indexes.length) return;

    debug(`Summarizing ${indexes.length} messages`)

    // Check if operation queue is enabled - if so, queue operations instead of executing directly
    if (get_settings('operation_queue_enabled') !== false) {
        const { queueSummarizeMessages } = await import('./queueIntegration.js');
        const queued = queueSummarizeMessages(indexes);
        if (queued && queued.length > 0) {
            debug(`Queued ${queued.length} summarization operations`);
            return; // Operations will be processed by queue
        }
        // If queueing failed, fall through to direct execution
        debug('Failed to queue operations, executing directly');
    }

     // only show progress if there's more than one message to summarize
    show_progress = show_progress && indexes.length > 1;

    // set stop flag to false just in case
    setStopSummarization(false);

    // optionally block user from sending chat messages while summarization is in progress
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    // Save the current completion preset (must happen before you set the connection profile because it changes the preset)
    const summary_preset = get_settings('completion_preset');
    const current_preset = await get_current_preset();

    // Get the current connection profile
    const summary_profile = get_settings('connection_profile');
    const current_profile = await get_current_connection_profile()

    // set the completion preset and connection profile for summarization (preset must be set after connection profile)
    await set_connection_profile(summary_profile);
    await set_preset(summary_preset);

    let n = 0;
    let anyModified = false;
    
    try {
        for (const i of indexes) {
            if (show_progress) progress_bar('summarize', n+1, indexes.length, "Summarizing");

            // check if summarization was stopped by the user
            if (getStopSummarization()) {
                log('Summarization stopped');
                break;
            }

            const result = await summarize_message(i);
            if (result.modified) {
                anyModified = true;
            }

            // wait for time delay if set
            const time_delay = get_settings('summarization_time_delay')
            if (time_delay > 0 && n < indexes.length-1) {  // delay all except the last

                // check if summarization was stopped by the user during summarization
                if (getStopSummarization()) {
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
            const run_interval = get_settings('combined_summary_run_interval') || 1;
            const new_count = get_settings('combined_summary_new_count') || 0;
            
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

        if (getStopSummarization()) {  // check if summarization was stopped
            setStopSummarization(false);  // reset the flag
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

    const context = getContext();
    const message = context.chat[index]
    const message_hash = getStringHash(message.mes);

    // Temporarily update the message summary text to indicate that it's being summarized (no styling based on inclusion criteria)
    // A full visual update with style should be done on the whole chat after inclusion criteria have been recalculated
    update_message_visuals(index, false, "Summarizing...")
    memoryEditInterface.update_message_visuals(index, null, false, "Summarizing...")

    // If the most recent message, scroll to the bottom to get the summary in view.
    if (index === context.chat.length - 1) {
        scrollChatToBottom();
    }

    // construct the full summary prompt for the message
    const prompt = await create_summary_prompt(index)

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
        const prefill = get_settings('prefill')
        let prefilled_summary = summary
        if (prefill) {
            prefilled_summary = `${prefill}${summary}`
        }

        const parsed_reasoning_object = context.parseReasoningFromString(prefilled_summary)
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
    const token_size = count_tokens(prompt);

    const context_size = get_context_size();
    if (token_size > context_size) {
        error(`Text ${token_size} exceeds context size ${context_size}.`);
    }

    const ctx = getContext()

    // At least one openai-style API required at least two messages to be sent.
    // We can do this by adding a system prompt, which will get added as another message in generateRaw().
    // A hack obviously. Is this a standard requirement for openai-style chat completion?
    // TODO update with a more robust method
    let system_prompt = false
    if (main_api === 'openai') {
        system_prompt = "Complete the requested task."
    }

    // TODO do the world info injection manually instead
    const include_world_info = get_settings('include_world_info');
    let result;

    try {
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
    } catch (err) {
        // SillyTavern strips error details before they reach us
        // Just re-throw for upper-level handling
        throw err;
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
    const num_history_messages = get_settings('include_message_history');
    const mode = get_settings('include_message_history_mode');
    if (num_history_messages === 0 || mode === "none") {
        return;
    }

    const ctx = getContext()
    const chat = ctx.chat

    let num_included = 0;
    const history = []
    for (let i = index-1; num_included < num_history_messages && i>=0; i--) {
        const m = chat[i];
        let include = true

        // whether we include the message itself is determined only by these settings.
        // Even if the message wouldn't be *summarized* we still want to include it in the history for context.
        if ((m.is_user && !get_settings('include_user_messages_in_history')) ||
            (m.is_system && !get_settings('include_system_messages_in_history')) ||
            (m.is_thoughts && !get_settings('include_thought_messages_in_history'))) {
            include = false;
        }

        if (!include) continue;

        let included = false
        if (mode === "summaries_only" || mode === "messages_and_summaries") {

            // Whether we include the *summary* is determined by the regular summary inclusion criteria.
            // This is so the inclusion matches the summary injection.
            const include_summary = check_message_exclusion(m)
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

async function create_summary_prompt(index) {
    // create the full summary prompt for the message at the given index.
    // the instruct template will automatically add an input sequence to the beginning and an output sequence to the end.
    // Therefore, if we are NOT using instructOverride, we have to remove the first system sequence at the very beginning which gets added by format_system_prompt.
    // If we ARE using instructOverride, we have to add a final trailing output sequence

    const ctx = getContext()
    const chat = ctx.chat
    const message = chat[index];

    // get history of messages (formatted as system messages) leading up to the message
    const history_text = get_message_history(index);

    // format the message itself
    const message_text = formatInstructModeChat(message.name, message.mes, message.is_user, false, "", ctx.name1, ctx.name2, null)

    // get the full prompt template from settings
    let prompt = get_settings('prompt');

    // first substitute any global macros like {{persona}}, {{char}}, etc...
    const words = await get_summary_preset_max_tokens()
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
    const output_sequence = ctx.substituteParamsExtended(power_user.instruct.output_sequence, {name: "assistant"});
    prompt = `${prompt}\n${output_sequence}`

    // finally, append the prefill
    prompt = `${prompt} ${get_settings('prefill')}`

    return prompt
}

function stop_summarization() {
    // Immediately stop summarization of the chat
    setStopSummarization(true);  // set the flag
    const ctx = getContext()
    ctx.stopGeneration();  // stop generation on current message
    clearTimeout(SUMMARIZATION_DELAY_TIMEOUT)  // clear the summarization delay timeout
    if (SUMMARIZATION_DELAY_RESOLVE !== null) SUMMARIZATION_DELAY_RESOLVE()  // resolve the delay promise so the await goes through
    log("Aborted summarization.")
}
function collect_messages_to_auto_summarize() {
    // iterate through the chat in chronological order and check which messages need to be summarized.
    const context = getContext();

    const messages_to_summarize = []  // list of indexes of messages to summarize
    const depth_limit = get_settings('auto_summarize_message_limit')  // how many valid messages back we can go
    const lag = get_settings('summarization_delay');  // number of messages to delay summarization for
    let depth = 0
    debug(`Collecting messages to summarize. Depth limit: ${depth_limit}, Lag: ${lag}`)
    for (let i = context.chat.length-1; i >= 0; i--) {
        // get current message
        const message = context.chat[i];

        // check message exclusion criteria
        const include = check_message_exclusion(message);  // check if the message should be included due to current settings
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
    const messages_to_batch = get_settings('auto_summarize_batch_size');  // number of messages to summarize in a batch
    if (messages_to_summarize.length < messages_to_batch) {
        debug(`Not enough messages (${messages_to_summarize.length}) to summarize in a batch (${messages_to_batch})`)
        messages_to_summarize = []
    }

    const show_progress = get_settings('auto_summarize_progress');
    await summarize_messages(messages_to_summarize, show_progress);
}

export {
    summarize_messages,
    summarize_message,
    create_summary_prompt,
    stop_summarization,
    collect_messages_to_auto_summarize,
    auto_summarize_chat,
    summarize_text,
    get_message_history,
    setStopSummarization,
    getStopSummarization
};
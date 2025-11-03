// @flow
import {
    get_settings,
    get_data,
    set_data,
    get_memory,
    check_message_exclusion,
    update_message_visuals,
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
    getContext,
    scrollChatToBottom,
    validate_summary,
    refresh_memory,
    power_user,
    main_api,
    extension_settings,
    getStringHash,
    generateRaw,
    trimToEndSentence,
    get_connection_profile_api,
    getPresetManager,
    set_connection_profile,
    get_current_connection_profile
} from './index.js';
import { getConfiguredEntityTypeDefinitions, formatEntityTypeListForPrompt } from './entityTypes.js';

// Summarization
let SUMMARIZATION_DELAY_TIMEOUT = null  // the set_timeout object for the summarization delay
let SUMMARIZATION_DELAY_RESOLVE = null

let STOP_SUMMARIZATION
// $FlowFixMe[signature-verification-failure]
function getStopSummarization() {
    return STOP_SUMMARIZATION;
}

// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function setStopSummarization(val /*: boolean */) /*: void */ {
    STOP_SUMMARIZATION = val;
}
setStopSummarization(false);

// Helper: Switch to summarization profile/preset
// $FlowFixMe[missing-local-annot]
async function switchToSummarizationProfile() /*: Promise<?{savedProfile: ?string, api: ?string, presetManager: ?any, savedPreset: ?any}> */ {
    const summary_preset = get_settings('completion_preset');
    const summary_profile = get_settings('connection_profile');

    // Save current connection profile
    const savedProfile = await get_current_connection_profile();

    // Switch to configured connection profile if specified
    if (summary_profile) {
        await set_connection_profile(summary_profile);
        debug(`Switched connection profile to: ${summary_profile}`);
    }

    // Get API type for the configured connection profile
    const api = await get_connection_profile_api(summary_profile);
    if (!api) {
        debug('No API found for connection profile, using defaults');
        return { savedProfile, api: undefined, presetManager: undefined, savedPreset: undefined };
    }

    // Get PresetManager for that API
    const presetManager = getPresetManager(api);
    if (!presetManager) {
        debug(`No PresetManager found for API: ${api}`);
        return { savedProfile, api, presetManager: undefined, savedPreset: undefined };
    }

    // Save current preset for this API
    const savedPreset = presetManager.getSelectedPreset();

    // Switch to configured preset if specified
    if (summary_preset) {
        const presetValue = presetManager.findPreset(summary_preset);
        if (presetValue) {
            debug(`Switching ${api} preset to: ${summary_preset}`);
            presetManager.selectPreset(presetValue);
        } else {
            debug(`Preset '${summary_preset}' not found for API ${api}`);
        }
    }

    return { savedProfile, api, presetManager, savedPreset };
}

// Helper: Restore original profile/preset
// $FlowFixMe[missing-local-annot]
async function restoreOriginalProfile(saved) {
    if (!saved) return;

    // Restore preset if it was changed
    if (saved.presetManager && saved.savedPreset) {
        debug(`Restoring ${saved.api} preset to original`);
        saved.presetManager.selectPreset(saved.savedPreset);
    }

    // Restore connection profile if it was changed
    if (saved.savedProfile) {
        await set_connection_profile(saved.savedProfile);
        debug(`Restored connection profile to: ${saved.savedProfile}`);
    }
}

// Helper: Process time delay between summarizations
// $FlowFixMe[missing-local-annot]
async function processTimeDelay(show_progress, n, indexes_length) {
    const time_delay = get_settings('summarization_time_delay');
    if (time_delay <= 0 || n >= indexes_length - 1) return true;

    if (getStopSummarization()) {
        log('Summarization stopped');
        return false;
    }

    debug(`Delaying generation by ${time_delay} seconds`);

    await new Promise((resolve) => {
        SUMMARIZATION_DELAY_TIMEOUT = setTimeout(resolve, time_delay * 1000);
        SUMMARIZATION_DELAY_RESOLVE = resolve;
    });

    return true;
}

// Helper: Cleanup after summarization
// $FlowFixMe[missing-local-annot]
function cleanupAfterSummarization(ctx, show_progress, indexes_length) {
    if (getStopSummarization()) {
        setStopSummarization(false);
    } else {
        debug(`Messages summarized: ${indexes_length}`);
    }

    ctx.activateSendButtons();

    refresh_memory();
}

// $FlowFixMe[signature-verification-failure] [missing-local-annot]
async function summarize_messages(indexes /*: ?(number | Array<number>) */=null, show_progress /*: boolean */=true) /*: Promise<void> */ {
    const ctx = getContext();

    // Normalize indexes
    let indexArray /*: Array<number> */;
    if (indexes == null) {  // == catches both null and undefined
        indexArray = [Math.max(ctx.chat.length - 1, 0)];
    } else if (Array.isArray(indexes)) {
        indexArray = indexes;
    } else {
        // indexes is number here (not null/undefined, not array)
        indexArray = [indexes];
    }
    if (!indexArray.length) return;

    debug(`Summarizing ${indexArray.length} messages`);

    // Note: Message summarization is no longer queued (removed due to message threshold exclusion removal)
    // The queue is only used for scene summaries, validation, and lorebook processing

    // Setup
    show_progress = show_progress && indexArray.length > 1;
    setStopSummarization(false);

    ctx.deactivateSendButtons();

    const savedProfile = await switchToSummarizationProfile();

    let n = 0;

    try {
        for (const i /*: number */ of indexArray) {
            if (getStopSummarization()) {
                log('Summarization stopped');
                break;
            }

            // Sequential execution required: messages must be summarized in order, respecting rate limits
            // eslint-disable-next-line no-await-in-loop
            await summarize_message(i);

            // Sequential execution required: rate limiting delay between summaries
            // eslint-disable-next-line no-await-in-loop
            const shouldContinue = await processTimeDelay(show_progress, n, indexArray.length);
            if (!shouldContinue) break;

            n += 1;
        }
    } finally {
        await restoreOriginalProfile(savedProfile);
        cleanupAfterSummarization(ctx, show_progress, indexArray.length);
    }
}
// Helper: Handle summary validation and retries
// $FlowFixMe[missing-local-annot]
async function validateAndRetrySummary(summary, index, message, retry_count, max_retries) {
    const is_valid = await validate_summary(summary, "regular");

    if (is_valid) {
        debug("[Validation] Summary validation passed");
        return { valid: true, retry_count };
    }

    retry_count++;
    debug(`[Validation] Summary failed validation: "${summary.substring(0, 100)}..."`);

    if (retry_count >= max_retries) {
        set_data(message, 'exclude', true);
        toast(`Message ${index}: Failed to generate valid summary after ${max_retries} attempts. Message has been excluded from memory.`, "warning");
        debug(`[Validation] Max retries (${max_retries}) reached for message ${index}. Marking as excluded.`);
        return { valid: false, retry_count, maxRetriesReached: true };
    }

    debug(`[Validation] Retry ${retry_count}/${max_retries} for message ${index}`);
    return { valid: false, retry_count, maxRetriesReached: false };
}

// $FlowFixMe[signature-verification-failure] [missing-local-annot]
async function summarize_message(index /*: number */) /*: Promise<{success: boolean, modified: boolean}> */ {
    // Summarize a message given the chat index, replacing any existing memories
    // Should only be used from summarize_messages()

    const context = getContext();
    const message = context.chat[index];
    const message_hash = getStringHash(message.mes);

    // Temporarily update the message summary text to indicate that it's being summarized
    update_message_visuals(index, false, "Summarizing...");

    if (index === context.chat.length - 1) {
        scrollChatToBottom();
    }

    const prompt = await create_summary_prompt(index);

    let summary;
    let err = null;
    let retry_count = 0;
    const max_retries = get_settings('message_summary_error_detection_retries');
    const validationEnabled = get_settings('error_detection_enabled') && get_settings('message_summary_error_detection_enabled');

    while (true) {
        try {
            if (retry_count > 0) {
                debug(`[Validation] Retry attempt ${retry_count}/${max_retries} for message ${index}`);
                update_message_visuals(index, false, `Summarizing (retry ${retry_count}/${max_retries})...`);
            }

            debug(`Summarizing message ${index}...`);
            // Sequential execution required: retry loop must wait for each summary attempt
            // eslint-disable-next-line no-await-in-loop
            summary = await summarize_text(prompt);

            // Validate the summary if error detection is enabled
            if (validationEnabled) {
                // Sequential execution required: validation must complete before retry
                // eslint-disable-next-line no-await-in-loop
                const result = await validateAndRetrySummary(summary, index, message, retry_count, max_retries);
                retry_count = result.retry_count;

                if (result.valid) {
                    break;
                }
                if (result.maxRetriesReached) {
                    err = "Failed to generate valid summary after max retries";
                    summary = null;
                    break;
                }
                continue; // Retry
            } else {
                break; // No validation needed
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

    // If the most recent message, scroll to the bottom
    if (index === context.chat.length - 1) {
        scrollChatToBottom()
    }
    
    return { success: !!summary, modified: wasSummaryModified };
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
async function summarize_text(prompt /*: string */) /*: Promise<string> */ {
    // Test override: allow tests to inject a fixed response
    if (typeof globalThis !== 'undefined') {
        // $FlowFixMe[prop-missing] - test-only hook not present in runtime types
        const __override = globalThis.__TEST_SUMMARIZE_TEXT_RESPONSE;
        if (typeof __override === 'string') {
            return __override;
        }
    }

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
        // $FlowFixMe[incompatible-type]
        system_prompt = "Complete the requested task."
    }

    let result;

    try {
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
        // Metadata injection now handled by global generateRaw interceptor
        // $FlowFixMe[extra-arg]
        result = await generateRaw({
            prompt: prompt,
            instructOverride: true,
            quietToLoud: false,
            // $FlowFixMe[incompatible-type] - system_prompt can be false or string, passing as-is
            systemPrompt: system_prompt,
            responseLength: null,
            trimNames: false
        });
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
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function get_message_history(index /*: number */) /*: string */ {
    // Get a history of messages leading up to the given index (excluding the message at the index)
    // If the include_message_history setting is 0, returns empty string
    const num_history_messages = get_settings('include_message_history');
    const mode = get_settings('include_message_history_mode');
    if (num_history_messages === 0 || mode === "none") {
        return "";
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

// $FlowFixMe[signature-verification-failure] [missing-local-annot]
async function create_summary_prompt(index /*: number */) /*: Promise<string> */ {
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
    const typeDefinitions = getConfiguredEntityTypeDefinitions(extension_settings?.autoLorebooks?.entity_types);
    let lorebookTypesMacro = formatEntityTypeListForPrompt(typeDefinitions);
    if (!lorebookTypesMacro) {
        lorebookTypesMacro = formatEntityTypeListForPrompt(getConfiguredEntityTypeDefinitions(undefined));
    }
    const macroParams = {
        message: message_text,
        history: history_text,
        lorebook_entry_types: lorebookTypesMacro,
    };

    if (get_settings('nest_messages_in_prompt')) {
        // substitute custom macros
        prompt = substitute_params(prompt, macroParams);  // substitute custom macros

        // then wrap it in the system prompt (if using instructOverride)
        prompt = formatInstructModeChat("", prompt, false, true, "", "", "", null)
    } else {  // otherwise
        // first make each prompt section its own system prompt
        prompt = system_prompt_split(prompt)

        // now substitute the custom macros
        prompt = substitute_params(prompt, macroParams);
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
// $FlowFixMe[signature-verification-failure]
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
    // $FlowFixMe[incompatible-type]
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
    summarize_text, // Used by scene summaries
};

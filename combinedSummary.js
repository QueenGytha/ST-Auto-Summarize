import {
    summarize_text,
    set_preset,
    set_connection_profile,
    get_current_preset,
    get_current_connection_profile,
    get_data,
    getContext,
    get_settings,
    set_settings,
    debug,
    error,
    toast,
    log,
    set_data,
    concatenate_summaries,
    formatInstructModeChat,
    substitute_conditionals,
    substitute_params,
    getPresetManager,
    get_summary_preset,
    verify_preset,
    amount_gen,
    validate_summary,
    collect_scene_summary_indexes
} from './index.js';

function get_combined_summary_key() {
    const ctx = getContext();
    const chatId = ctx.chatId;
    const charId = ctx.characterId || 'group';
    return `combined_summary_saved_${chatId}_${charId}`;
}

function save_combined_summary(summary) {
    set_settings(get_combined_summary_key(), summary);
}

function load_combined_summary() {
    return get_settings(get_combined_summary_key()) || "";
}

async function generate_combined_summary() {
    if (!get_settings('combined_summary_enabled')) return "Combined Summary is Disabled";

    // Check if there are new summaries to process
    const summariesToCombine = collect_messages_to_combine();
    if (summariesToCombine.length === 0) {
        debug("[COMBINED SUMMARY] No new summaries to combine");
        if (get_settings('show_combined_summary_toast')) {
            toast("No new summaries to combine", "info");
        }
        return "No new summaries to combine";
    }

    // Check if operation queue is enabled
    const queueEnabled = get_settings('operation_queue_enabled') !== false;
    if (queueEnabled) {
        debug("[COMBINED SUMMARY] [Queue] Operation queue enabled, queueing combined summary generation");

        // Import queue integration
        const { queueGenerateCombinedSummary } = await import('./queueIntegration.js');

        // Queue the combined summary generation
        const operationId = queueGenerateCombinedSummary();

        if (operationId) {
            log("[COMBINED SUMMARY] [Queue] Queued combined summary generation:", operationId);
            if (get_settings('show_combined_summary_toast')) {
                toast("Queued combined summary generation", "info");
            }
            return "Queued"; // Operation will be processed by queue
        }

        debug("[COMBINED SUMMARY] [Queue] Failed to queue operation, falling back to direct execution");
    }

    // Fallback to direct execution if queue disabled or queueing failed
    debug("[COMBINED SUMMARY] Executing combined summary generation directly (queue disabled or unavailable)");

    if (get_settings('show_combined_summary_toast')) {
        toast("Generating combined summary...", "info");
    }
    
    const ctx = getContext();
    const prompt = await create_combined_summary_prompt();
    
    // If prompt creation failed due to no summaries, exit early
    if (!prompt) {
        debug("[COMBINED SUMMARY] Failed to create prompt, likely no summaries to combine");
        if (get_settings('show_combined_summary_toast')) {
            toast("No content to generate combined summary", "warning");
        }
        return "Failed to create combined summary prompt";
    }
    
    const profile = get_settings('combined_summary_connection_profile');
    const preset = get_settings('combined_summary_completion_preset');
    const current_profile = await get_current_connection_profile();
    const current_preset = await get_current_preset();
    const previous_summary = load_combined_summary(); // Store the previous valid summary

    // optionally block user from sending chat messages while summarization is in progress
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    await set_connection_profile(profile);
    await set_preset(preset);

    let summary = "";
    let retry_count = 0;
    const max_retries = get_settings('combined_summary_error_detection_retries');
    
    try {
        debug("=== [COMBINED SUMMARY] Prompt sent to model ===");
        debug(prompt);
        
        while (true) {
            if (retry_count > 0) {
                debug(`[Validation] Combined summary retry attempt ${retry_count}/${max_retries}`);
                if (get_settings('show_combined_summary_toast')) {
                    toast(`Generating combined summary (retry ${retry_count}/${max_retries})...`, "info");
                }
            }
            
            summary = await summarize_text(prompt);
            debug("=== [COMBINED SUMMARY] Model response ===");
            debug(summary);
            
            // Validate the combined summary if error detection is enabled
            if (get_settings('error_detection_enabled') && 
                get_settings('combined_summary_error_detection_enabled')) {
                
                const is_valid = await validate_summary(summary, "combined");
                
                if (is_valid) {
                    debug("[Validation] Combined summary validation passed");
                    break; // Valid summary, exit the loop
                } else {
                    retry_count++;
                    debug(`[Validation] Combined summary failed validation: "${summary.substring(0, 100)}..."`);
                    
                    if (retry_count >= max_retries) {
                        error(`[Validation] Failed to generate valid combined summary after ${max_retries} retries.`);
                        
                        // Keep the previous summary instead of saving the invalid one
                        if (previous_summary) {
                            debug("[Validation] Keeping previous valid combined summary");
                            summary = previous_summary;
                            toast(`Failed to generate valid combined summary. Keeping previous summary.`, "warning");
                        } else {
                            debug("[Validation] No previous summary to fall back to");
                            summary = null;
                            toast(`Failed to generate valid combined summary. No previous summary found.`, "warning");
                        }
                        break; // Max retries reached, give up
                    }
                    debug(`[Validation] Retry ${retry_count}/${max_retries} for combined summary`);
                    continue; // Retry summarization
                }
            } else {
                // No validation needed
                break;
            }
        }
        
        // Only save if we got a valid summary
        if (summary) {
            save_combined_summary(summary);

            // Mark all processed summaries as combined
            flag_summaries_as_combined(summariesToCombine);
        }
    } catch (e) {
        error("Combined summary generation failed: " + e);
    } finally {
        // Make sure we re-enable input even if there's an error
        if (get_settings('block_chat')) {
            ctx.activateSendButtons();
        }
    }

    await set_connection_profile(current_profile);
    await set_preset(current_preset);

    return summary || previous_summary || "";
}

async function get_combined_summary_preset_max_tokens() {
    let preset_name = get_settings('combined_summary_completion_preset');
    if (!preset_name || !(await verify_preset(preset_name))) {
        preset_name = await get_summary_preset();
    }
    const preset = getPresetManager().getCompletionPresetByName(preset_name);
    return preset?.genamt || preset?.openai_max_tokens || amount_gen;
}

function collect_messages_to_combine() {
    const context = getContext();
    const chat = context.chat;
    let indexes = [];

    // Settings for each type
    const shortCount = get_settings('combined_summary_short_count');
    const shortOnce = get_settings('combined_summary_short_once');
    const longCount = get_settings('combined_summary_long_count');
    const longOnce = get_settings('combined_summary_long_once');
    const sceneCount = get_settings('combined_summary_scene_count');
    const sceneOnce = get_settings('combined_summary_scene_once');

    // Helper to filter and limit
    function collect(type, count, once) {
        if (count === -1) return [];
        const filtered = [];
        for (let i = 0; i < chat.length; i++) {
            const msg = chat[i];
            if (!get_data(msg, 'memory')) continue;
            if (get_data(msg, 'include') !== type) continue;
            if (once && get_data(msg, `combined_summary_included_${type}`)) continue;
            filtered.push(i);
        }
        if (count > 0) return filtered.slice(-count); // most recent N
        return filtered;
    }

    // Short-term
    indexes.push(...collect('short', shortCount, shortOnce));
    // Long-term
    indexes.push(...collect('long', longCount, longOnce));

    // Scene summaries
    if (sceneCount !== -1) {
        const sceneIndexes = collect_scene_summary_indexes();
        let filtered = [];
        for (const idx of sceneIndexes) {
            const msg = chat[idx];
            if (sceneOnce && get_data(msg, 'combined_summary_included_scene')) continue;
            filtered.push(idx);
        }
        if (sceneCount > 0) filtered = filtered.slice(-sceneCount);
        indexes.push(...filtered);
    }

    // Remove duplicates and sort
    indexes = [...new Set(indexes)].sort((a, b) => a - b);

    debug(`[COMBINED SUMMARY] Found ${indexes.length} messages to combine`);
    return indexes;
}

function flag_summaries_as_combined(indexes) {
    if (!indexes || indexes.length === 0) return;
    const context = getContext();
    const chat = context.chat;
    const shortOnce = get_settings('combined_summary_short_once');
    const longOnce = get_settings('combined_summary_long_once');
    const sceneOnce = get_settings('combined_summary_scene_once');
    for (const i of indexes) {
        const msg = chat[i];
        const type = get_data(msg, 'include');
        if (type === 'short' && shortOnce) set_data(msg, 'combined_summary_included_short', true);
        if (type === 'long' && longOnce) set_data(msg, 'combined_summary_included_long', true);
        if (get_data(msg, 'scene_summary_memory') && sceneOnce) set_data(msg, 'combined_summary_included_scene', true);
    }
    debug(`[COMBINED SUMMARY] Marked ${indexes.length} summaries as combined`);
}

// When including scene summaries in combined summaries, use 'scene_summary_memory' from the message object.
// Do NOT expect scene summaries to be in the root 'memory' property like short/long summaries.
async function create_combined_summary_prompt() {
    const ctx = getContext();
    const summariesToCombine = collect_messages_to_combine();
    if (!summariesToCombine.length) {
        debug("[COMBINED SUMMARY] No summaries to combine, returning null");
        return null;
    }

    // Get the summaries as JSON array (as required by the default prompt)
    const summaries_json = concatenate_summaries(summariesToCombine);

    // Get previous combined summary if needed
    const previous_combined_summary = load_combined_summary();

    // Get message history if needed (optional, depending on your template)
    // For now, we'll leave it empty:
    const history = "";

    // Get the template from settings
    let prompt = get_settings('combined_summary_prompt') || "";
    const words = await get_combined_summary_preset_max_tokens();

    // Substitute macros
    prompt = ctx.substituteParamsExtended(prompt, {
        words,
        previous_combined_summary: previous_combined_summary || ""
    });

    // Substitute conditionals ({{#if ...}})
    prompt = substitute_conditionals(prompt, {
        message: summaries_json,
        history,
        previous_combined_summary: previous_combined_summary || ""
    });

    // Substitute regular params ({{macro}})
    prompt = substitute_params(prompt, {
        message: summaries_json,
        history,
        previous_combined_summary: previous_combined_summary || ""
    });

    // Format as system prompt if required
    prompt = formatInstructModeChat("", prompt, false, true, "", "", "", null);

    // Add prefill if set
    prompt = `${prompt}\n${get_settings('combined_summary_prefill') || ""}`;

    return prompt;
}

export {
    generate_combined_summary,
    get_combined_summary_preset_max_tokens,
    load_combined_summary,
    save_combined_summary
}
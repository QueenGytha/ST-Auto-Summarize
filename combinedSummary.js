import { summarize_text, set_preset, set_connection_profile, get_current_preset, get_current_connection_profile, get_data, getContext, get_settings, set_settings, debug, error, toast, set_data, concatenate_summaries, formatInstructModeChat, substitute_conditionals, substitute_params, getPresetManager, get_summary_preset, verify_preset, amount_gen } from './index.js';

function get_combined_summary_key() {
    let ctx = getContext();
    let chatId = ctx.chatId;
    let charId = ctx.characterId || 'group';
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
    let summariesToCombine = collect_messages_to_combine();
    if (summariesToCombine.length === 0) {
        debug("[COMBINED SUMMARY] No new summaries to combine");
        if (get_settings('show_combined_summary_toast')) {
            toast("No new summaries to combine", "info");
        }
        return "No new summaries to combine";
    }
    
    if (get_settings('show_combined_summary_toast')) {
        toast("Generating combined summary...", "info");
    }
    
    let ctx = getContext();
    let prompt = await create_combined_summary_prompt();
    
    // If prompt creation failed due to no summaries, exit early
    if (!prompt) {
        debug("[COMBINED SUMMARY] Failed to create prompt, likely no summaries to combine");
        if (get_settings('show_combined_summary_toast')) {
            toast("No content to generate combined summary", "warning");
        }
        return "Failed to create combined summary prompt";
    }
    
    let profile = get_settings('combined_summary_connection_profile');
    let preset = get_settings('combined_summary_completion_preset');
    let current_profile = await get_current_connection_profile();
    let current_preset = await get_current_preset();
    let previous_summary = load_combined_summary(); // Store the previous valid summary

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
    let preset = getPresetManager().getCompletionPresetByName(preset_name);
    return preset?.genamt || preset?.openai_max_tokens || amount_gen;
}

function get_combined_memory() {
    if (!get_settings('combined_summary_enabled')) return "";
    let ctx = getContext();
    let chat = ctx.chat;
    let indexes = [];
    for (let i = 0; i < chat.length; i++) {
        let message = chat[i];
        if (get_data(message, 'memory') && !get_data(message, 'combined_summary_included')) {
            indexes.push(i);
        }
    }
    if (indexes.length === 0) return "";
    let text = concatenate_summaries(indexes);
    let template = get_settings('combined_summary_template');
    return ctx.substituteParamsExtended(template, { memories: text });
}

async function create_combined_summary_prompt() {
    let ctx = getContext();
    let summaries = get_combined_memory();
    let prompt = get_settings('combined_summary_prompt');
    let words = await get_combined_summary_preset_max_tokens();
    let previous_summary = load_combined_summary();

    if (!summaries || summaries.trim() === "") {
        debug("[COMBINED SUMMARY] No summaries to combine, returning null");
        return null;
    }

    prompt = ctx.substituteParamsExtended(prompt, {
        "words": words,
        "previous_combined_summary": previous_summary || ""
    });
    prompt = substitute_conditionals(prompt, {
        "message": summaries,
        "history": "",
        "previous_combined_summary": previous_summary || ""
    });
    prompt = substitute_params(prompt, {
        "message": summaries,
        "history": "",
        "previous_combined_summary": previous_summary || ""
    });
    prompt = formatInstructModeChat("", prompt, false, true, "", "", "", null);
    prompt = `${prompt}\n${get_settings('combined_summary_prefill')}`;
    return prompt;
}

// New function to collect messages that need to be included in combined summary
function collect_messages_to_combine() {
    let context = getContext();
    let chat = context.chat;
    let indexes = [];
    for (let i = 0; i < chat.length; i++) {
        let message = chat[i];
        if (get_data(message, 'memory') && get_data(message, 'combined_summary_included') !== true) {
            indexes.push(i);
        }
    }
    debug(`[COMBINED SUMMARY] Found ${indexes.length} messages to combine`);
    return indexes;
}

// Update flag_summaries_as_combined function to take an array of indexes
function flag_summaries_as_combined(indexes) {
    if (!indexes || indexes.length === 0) return;
    let context = getContext();
    let chat = context.chat;
    for (let i of indexes) {
        let message = chat[i];
        set_data(message, 'combined_summary_included', true);
    }
    debug(`[COMBINED SUMMARY] Marked ${indexes.length} summaries as combined`);
}

export {
    get_combined_summary_key,
    save_combined_summary,
    load_combined_summary,
    get_combined_summary_preset_max_tokens,
    get_combined_memory,
    create_combined_summary_prompt,
    collect_messages_to_combine,
    flag_summaries_as_combined,
    generate_combined_summary
};
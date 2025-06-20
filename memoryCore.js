import {
    get_settings,
    set_data,
    get_data,
    getContext,
    get_memory,
    count_tokens,
    get_short_token_limit,
    get_long_token_limit,
    update_all_message_visuals,
    debug,
    character_enabled,
    get_character_key,
    system_message_types,
    generic_memories_macro,
    auto_hide_messages_by_command,
    chat_enabled,
    MODULE_NAME,
    load_combined_summary,
    formatInstructModeChat,
    main_api,
    extension_prompt_types,
    debounce,
    debounce_timeout
} from './index.js';

// Retrieving memories
function check_message_exclusion(message) {
    // check for any exclusion criteria for a given message based on current settings
    // (this does NOT take context lengths into account, only exclusion criteria based on the message itself).
    if (!message) return false;

    // system messages sent by this extension are always ignored
    if (get_data(message, 'is_auto_summarize_system_memory')) {
        return false;
    }

    // first check if it has been marked to be remembered by the user - if so, it bypasses all other exclusion criteria
    if (get_data(message, 'remember')) {
        return true;
    }

    // check if it's marked to be excluded - if so, exclude it
    if (get_data(message, 'exclude')) {
        return false;
    }

    // check if it's a user message and exclude if the setting is disabled
    if (!get_settings('include_user_messages') && message.is_user) {
        return false
    }

    // check if it's a thought message and exclude (Stepped Thinking extension)
    // TODO: This is deprecated in the thought extension, could be removed at some point?
    if (message.is_thoughts) {
        return false
    }

    // check if it's a hidden message and exclude if the setting is disabled
    if (!get_settings('include_system_messages') && message.is_system) {
        return false;
    }

    // check if it's a narrator message
    if (!get_settings('include_narrator_messages') && message.extra.type === system_message_types.NARRATOR) {
        return false
    }

    // check if the character is disabled
    let char_key = get_character_key(message)
    if (!character_enabled(char_key)) {
        return false;
    }

    // Check if the message is too short
    let token_size = count_tokens(message.mes);
    if (token_size < get_settings('message_length_threshold')) {
        return false;
    }

    return true;
}
function update_message_inclusion_flags() {
    // Update all messages in the chat, flagging them as short-term or long-term memories to include in the injection.
    // This has to be run on the entire chat since it needs to take the context limits into account.
    let context = getContext();
    let chat = context.chat;

    debug("Updating message inclusion flags")

    let injection_threshold = get_settings('summary_injection_threshold')
    let exclude_messages = get_settings('exclude_messages_after_threshold')
    let keep_last_user_message = get_settings('keep_last_user_message')
    let first_to_inject = chat.length - injection_threshold
    let last_user_message_identified = false

    // iterate through the chat in reverse order and mark the messages that should be included in short-term and long-term memory
    let short_limit_reached = false;
    let long_limit_reached = false;
    let long_term_end_index = null;  // index of the most recent message that doesn't fit in short-term memory
    let end = chat.length - 1;
    let summary = ""  // total concatenated summary so far
    let new_summary = ""  // temp summary storage to check token length
    for (let i = end; i >= 0; i--) {
        let message = chat[i];

        // Mark whether the message is lagging behind the exclusion threshold (even if no summary)
        let lagging = i >= first_to_inject

        // If needed, mark the most recent user message as lagging
        if (exclude_messages && keep_last_user_message && !last_user_message_identified && message.is_user) {
            last_user_message_identified = true
            lagging = true
            debug(`Marked most recent user message as lagging: ${i}`)
        }
        set_data(message, 'lagging', lagging)

        // check for any of the exclusion criteria
        let include = check_message_exclusion(message)
        if (!include) {
            set_data(message, 'include', null);
            continue;
        }

        if (!short_limit_reached) {  // short-term limit hasn't been reached yet
            let memory = get_memory(message)
            if (!memory) {  // If it doesn't have a memory, mark it as excluded and move to the next
                set_data(message, 'include', null)
                continue
            }

            new_summary = concatenate_summary(summary, message)  // concatenate this summary
            let short_token_size = count_tokens(new_summary);
            if (short_token_size > get_short_token_limit()) {  // over context limit
                short_limit_reached = true;
                long_term_end_index = i;  // this is where long-term memory ends and short-term begins
                summary = ""  // reset summary
            } else {  // under context limit
                set_data(message, 'include', 'short');
                summary = new_summary
                continue
            }
        }

        // if the short-term limit has been reached, check the long-term limit
        let remember = get_data(message, 'remember');
        if (!long_limit_reached && remember) {  // long-term limit hasn't been reached yet and the message was marked to be remembered
            new_summary = concatenate_summary(summary, message)  // concatenate this summary
            let long_token_size = count_tokens(new_summary);
            if (long_token_size > get_long_token_limit()) {  // over context limit
                long_limit_reached = true;
            } else {
                set_data(message, 'include', 'long');  // mark the message as long-term
                summary = new_summary
                continue
            }
        }

        // if we haven't marked it for inclusion yet, mark it as excluded
        set_data(message, 'include', null);
    }

    update_all_message_visuals()
}
function concatenate_summary(existing_text, message) {
    // given an existing text of concatenated summaries, concatenate the next one onto it
    let memory = get_memory(message)
    if (!memory) {  // if there's no summary, do nothing
        return existing_text
    }
    let separator = get_settings('summary_injection_separator')
    return existing_text + separator + memory
}
function concatenate_summaries(indexes) {
    let context = getContext();
    let chat = context.chat;
    let summaries = [];
    let count = 1;
    for (let i of indexes) {
        let message = chat[i];
        let memory = get_memory(message);
        if (memory) {
            summaries.push({ id: count, summary: memory });
            count++;
        }
    }
    return JSON.stringify(summaries, null, 2);
}

function collect_chat_messages(include) {
    // Get a list of chat message indexes identified by the given criteria
    let context = getContext();
    let indexes = []  // list of indexes of messages

    // iterate in reverse order
    for (let i = context.chat.length-1; i >= 0; i--) {
        let message = context.chat[i];
        if (!get_data(message, 'memory')) continue  // no memory
        if (get_data(message, 'lagging')) continue  // lagging - not injected yet
        if (get_data(message, 'include') !== include) continue  // not the include types we want
        indexes.push(i)
    }

    // reverse the indexes so they are in chronological order
    indexes.reverse()
    return indexes
}
function get_long_memory() {
    // get the injection text for long-term memory
    let indexes = collect_chat_messages('long')
    if (indexes.length === 0) return ""  // if no memories, return empty

    let text = concatenate_summaries(indexes);
    let template = get_settings('long_template')
    let ctx = getContext();

    // replace memories macro
    return ctx.substituteParamsExtended(template, {[generic_memories_macro]: text});
}
function get_short_memory() {
    // get the injection text for short-term memory
    let indexes = collect_chat_messages('short')
    if (indexes.length === 0) return ""  // if no memories, return empty

    let text = concatenate_summaries(indexes);
    let template = get_settings('short_template')
    let ctx = getContext();

    // replace memories macro
    return ctx.substituteParamsExtended(template, {[generic_memories_macro]: text});
}

// --- Add this helper for scene memory injection ---
function get_scene_memory() {
    // Example: concatenate all scene summaries (customize as needed)
    const ctx = getContext();
    const chat = ctx.chat;
    let sceneSummaries = [];
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        // You may want to use a more robust check for scene summary messages
        if (msg && msg.scene_summary) {
            sceneSummaries.push(msg.scene_summary);
        }
    }
    return sceneSummaries.join('\n');
}

async function refresh_memory() {
    let ctx = getContext();

    // --- Auto-hide/unhide messages older than X ---
    await auto_hide_messages_by_command();
    // --- end auto-hide ---

    if (!chat_enabled()) { // if chat not enabled, remove the injections
        ctx.setExtensionPrompt(`${MODULE_NAME}_long`, "", extension_prompt_types.IN_PROMPT, 0);
        ctx.setExtensionPrompt(`${MODULE_NAME}_short`, "", extension_prompt_types.IN_PROMPT, 0);
        ctx.setExtensionPrompt(`${MODULE_NAME}_combined`, "", extension_prompt_types.IN_PROMPT, 0);
        ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
        return;
    }

    debug("Refreshing memory")

    // Update the UI according to the current state of the chat memories, and update the injection prompts accordingly
    update_message_inclusion_flags()  // update the inclusion flags for all messages

    // get the filled out templates
    let long_injection = get_long_memory();
    let short_injection = get_short_memory();

    // --- Combined Summary Injection ---
    const combined_summary = load_combined_summary();
    let combined_injection = "";
    if (get_settings('combined_summary_enabled') && combined_summary) {
        let template = get_settings('combined_summary_template');
        combined_injection = ctx.substituteParamsExtended(template, {[generic_memories_macro]: combined_summary});
    }
    // --- END Combined Summary Injection ---

    // --- Scene Summary Injection ---
    let scene_injection = "";
    if (get_settings('scene_summary_enabled')) {
        // You may want to implement get_scene_memory() if not present
        if (typeof get_scene_memory === "function") {
            scene_injection = get_scene_memory();
        } else {
            scene_injection = ""; // fallback if not implemented
        }
    }
    // --- END Scene Summary Injection ---

    let long_term_position = get_settings('long_term_position')
    let short_term_position = get_settings('short_term_position')
    let combined_summary_position = get_settings('combined_summary_position');
    let scene_summary_position = get_settings('scene_summary_position');
    let long_term_role = get_settings('long_term_role');
    let short_term_role = get_settings('short_term_role');
    let combined_summary_role = get_settings('combined_summary_role');
    let scene_summary_role = get_settings('scene_summary_role');
    let long_term_depth = get_settings('long_term_depth');
    let short_term_depth = get_settings('short_term_depth');
    let combined_summary_depth = get_settings('combined_summary_depth');
    let scene_summary_depth = get_settings('scene_summary_depth');
    let long_term_scan = get_settings('long_term_scan');
    let short_term_scan = get_settings('short_term_scan');
    let combined_summary_scan = get_settings('combined_summary_scan');
    let scene_summary_scan = get_settings('scene_summary_scan');

    // if using text completion, we need to wrap it in a system prompt
    if (main_api !== 'openai') {
        if (long_term_position !== extension_prompt_types.IN_CHAT && long_injection.length)
            long_injection = formatInstructModeChat("", long_injection, false, false, "", ctx.name1, ctx.name2, null);
        if (short_term_position !== extension_prompt_types.IN_CHAT && short_injection.length)
            short_injection = formatInstructModeChat("", short_injection, false, false, "", ctx.name1, ctx.name2, null);
        if (combined_summary_position !== extension_prompt_types.IN_CHAT && combined_injection.length)
            combined_injection = formatInstructModeChat("", combined_injection, false, false, "", ctx.name1, ctx.name2, null);
        if (scene_summary_position !== extension_prompt_types.IN_CHAT && scene_injection.length)
            scene_injection = formatInstructModeChat("", scene_injection, false, false, "", ctx.name1, ctx.name2, null);
    }

    // inject the memories into the templates, if they exist
    ctx.setExtensionPrompt(`${MODULE_NAME}_long`,  long_injection,  long_term_position, long_term_depth, long_term_scan, long_term_role);
    ctx.setExtensionPrompt(`${MODULE_NAME}_short`, short_injection, short_term_position, short_term_depth, short_term_scan, short_term_role);
    ctx.setExtensionPrompt(`${MODULE_NAME}_combined`, combined_injection, combined_summary_position, combined_summary_depth, combined_summary_scan, combined_summary_role);
    ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, scene_injection, scene_summary_position, scene_summary_depth, scene_summary_scan, scene_summary_role);

    if (get_settings('debug_mode')) {
        debug(`[MEMORY INJECTION] Long-term injected at position ${long_term_position} as role ${long_term_role}:`);
        debug(long_injection);
        debug(`[MEMORY INJECTION] Short-term injected at position ${short_term_position} as role ${short_term_role}:`);
        debug(short_injection);
        debug(`[MEMORY INJECTION] Combined summary injected at position ${combined_summary_position} as role ${combined_summary_role}:`);
        debug(combined_injection);
        debug(`[MEMORY INJECTION] Scene summary injected at position ${scene_summary_position} as role ${scene_summary_role}:`);
        debug(scene_injection);
    }

    return `${long_injection}\n\n...\n\n${short_injection}\n\n...\n\n${combined_injection}\n\n...\n\n${scene_injection}`  // return the concatenated memory text
}
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);


export {
    check_message_exclusion,
    update_message_inclusion_flags,
    collect_chat_messages,
    concatenate_summary,
    concatenate_summaries,
    get_long_memory,
    get_short_memory,
    refresh_memory,
    refresh_memory_debounced
};
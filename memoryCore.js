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
    generic_memories_macro
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

export {
    check_message_exclusion,
    update_message_inclusion_flags,
    collect_chat_messages,
    concatenate_summary,
    concatenate_summaries,
    get_long_memory,
    get_short_memory
};
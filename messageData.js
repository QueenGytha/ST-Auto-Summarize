import {
    MODULE_NAME,
    get_settings,
    saveChatDebounced,
    debug,
    refresh_memory,
    summarize_messages,
    chat_enabled,
    getContext
} from './index.js';

// For short/long summaries, use 'memory' and 'include' at the root of the message object.
// For scene summaries, use 'scene_summary_memory' and related keys (see memoryCore.js and sceneBreak.js).

// Message functions
function set_data(message, key, value) {
    // store information on the message object
    if (!message.extra) {
        message.extra = {};
    }
    if (!message.extra[MODULE_NAME]) {
        message.extra[MODULE_NAME] = {};
    }

    message.extra[MODULE_NAME][key] = value;

    // Also save on the current swipe info if present
    let swipe_index = message.swipe_id
    if (swipe_index && message.swipe_info?.[swipe_index]) {
        if (!message.swipe_info[swipe_index].extra) {
            message.swipe_info[swipe_index].extra = {};
        }
        message.swipe_info[swipe_index].extra[MODULE_NAME] = structuredClone(message.extra[MODULE_NAME])
    }

    // Only save if chat is loaded and has a chatId
    const ctx = getContext();
    if (ctx?.chat && ctx?.chatId) {
        saveChatDebounced();
    }
}
function get_data(message, key) {
    // get information from the message object
    return message?.extra?.[MODULE_NAME]?.[key];
}
function get_memory(message) {
    // returns the memory (and reasoning, if present) properly prepended with the prefill (if present)
    let memory = get_data(message, 'memory') ?? ""
    let prefill = get_data(message, 'prefill') ?? ""

    // prepend the prefill to the memory if needed
    if (get_settings('show_prefill')) {
        memory = `${prefill}${memory}`
    }
    return memory
}
function edit_memory(message, text) {
    // perform a manual edit of the memory text

    let current_text = get_memory(message)
    if (text === current_text) return;  // no change
    set_data(message, "memory", text);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", Boolean(text))  // mark as edited if not deleted

    // deleting or adding text to a deleted memory, remove some other flags
    if (!text || !current_text) {
        set_data(message, "exclude", false)
        set_data(message, "remember", false)
    }
}
function clear_memory(message) {
    // clear the memory from a message
    set_data(message, "memory", null);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", false)
    set_data(message, "exclude", false)
    set_data(message, "remember", false)
}
function toggle_memory_value(indexes, value, check_value, set_value) {
    // For each message index, call set_value(index, value) function on each.
    // If no value given, toggle the values. Only toggle false if ALL are true.

    if (value === null) {  // no value - toggle
        let all_true = true
        for (let index of indexes) {
            if (!check_value(index)) {
                all_true = false
                set_value(index, true)
            }
        }

        if (all_true) {  // set to false only if all are true
            for (let index of indexes) {
                set_value(index, false)
            }
        }

    } else {  // value given
        for (let index of indexes) {
            set_value(index, value)
        }
    }

}
function get_previous_swipe_memory(message, key) {
    // get information from the message's previous swipe
    if (!message.swipe_id) {
        return null;
    }
    return message?.swipe_info?.[message.swipe_id-1]?.extra?.[MODULE_NAME]?.[key];
}
async function remember_message_toggle(indexes=null, value=null) {
    // Toggle the "remember" status of a set of messages
    let context = getContext();

    if (indexes === null) {  // Default to the last message, min 0
        indexes = [Math.max(context.chat.length-1, 0)];
    } else if (!Array.isArray(indexes)) {  // only one index given
        indexes = [indexes];
    }

    // messages without a summary
    let summarize = [];

    function set(index, value) {
        let message = context.chat[index]
        set_data(message, 'remember', value);
        set_data(message, 'exclude', false);  // regardless, remove excluded flag

        let memory = get_data(message, 'memory')
        if (value && !memory) {
            summarize.push(index)
        }
        debug(`Set message ${index} remembered status: ${value}`);
    }

    function check(index) {
        return get_data(context.chat[index], 'remember')
    }

    toggle_memory_value(indexes, value, check, set)

    // summarize any messages that have no summary
    if (summarize.length > 0) {
        await summarize_messages(summarize);
    }
    refresh_memory();
}
function forget_message_toggle(indexes=null, value=null) {
    // Toggle the "forget" status of a message
    let context = getContext();

    if (indexes === null) {  // Default to the last message, min 0
        indexes = [Math.max(context.chat.length-1, 0)];
    } else if (!Array.isArray(indexes)) {  // only one index given
        indexes = [indexes];
    }

    function set(index, value) {
        let message = context.chat[index]
        set_data(message, 'exclude', value);
        set_data(message, 'remember', false);  // regardless, remove excluded flag
        debug(`Set message ${index} exclude status: ${value}`);
    }

    function check(index) {
        return get_data(context.chat[index], 'exclude')
    }

    toggle_memory_value(indexes, value, check, set)
    refresh_memory()
}
function get_character_key(message) {
    // get the unique identifier of the character that sent a message
    return message.original_avatar
}

// Add an interception function to reduce the number of messages injected normally
// This has to match the manifest.json "generate_interceptor" key
globalThis.memory_intercept_messages = function (chat, _contextSize, _abort, type) {
    if (!chat_enabled()) return;   // if memory disabled, do nothing
    if (!get_settings('exclude_messages_after_threshold')) return  // if not excluding any messages, do nothing
    refresh_memory()

    let start = chat.length-1
    if (type === 'continue') start--  // if a continue, keep the most recent message

    // symbol is used to prevent accidentally leaking modifications to permanent chat.
    let IGNORE_SYMBOL = getContext().symbols.ignore

    // Remove any messages that have summaries injected
    for (let i=start; i >= 0; i--) {
        delete chat[i].extra.ignore_formatting
        let message = chat[i]
        let lagging = get_data(message, 'lagging')  // The message should be kept
        chat[i] = structuredClone(chat[i])  // keep changes temporary for this generation
        chat[i].extra[IGNORE_SYMBOL] = !lagging
    }
};

export {
    set_data,
    get_data,
    get_memory,
    edit_memory,
    clear_memory,
    toggle_memory_value,
    get_previous_swipe_memory,
    remember_message_toggle,
    forget_message_toggle,
    get_character_key
};
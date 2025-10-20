// @flow
import {
    MODULE_NAME,
    get_settings,
    saveChatDebounced,
    debug,
    refresh_memory,
    chat_enabled,
    getContext
} from './index.js';

// For short/long summaries, use 'memory' and 'include' at the root of the message object.
// For scene summaries, use 'scene_summary_memory' and related keys (see memoryCore.js and sceneBreak.js).

// Message functions
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function set_data(message /*: any */, key /*: any */, value /*: any */) {
    // store information on the message object
    if (!message.extra) {
        message.extra = {};
    }
    // $FlowFixMe[invalid-computed-prop]
    if (!message.extra[MODULE_NAME]) {
        // $FlowFixMe[prop-missing]
        message.extra[MODULE_NAME] = {};
    }

    message.extra[MODULE_NAME][key] = value;

    // Also save on the current swipe info if present
    const swipe_index = message.swipe_id
    if (swipe_index && message.swipe_info?.[swipe_index]) {
        if (!message.swipe_info[swipe_index].extra) {
            message.swipe_info[swipe_index].extra = {};
        }
        // $FlowFixMe[prop-missing] [cannot-resolve-name]
        message.swipe_info[swipe_index].extra[MODULE_NAME] = structuredClone(message.extra[MODULE_NAME])
    }

    // Only save if chat is loaded and has a chatId
    const ctx = getContext();
    if (ctx?.chat && ctx?.chatId) {
        saveChatDebounced();
    }
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function get_data(message /*: any */, key /*: any */) {
    // get information from the message object
    return message?.extra?.[MODULE_NAME]?.[key];
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function get_memory(message /*: any */) {
    // returns the memory (and reasoning, if present) properly prepended with the prefill (if present)
    let memory = get_data(message, 'memory') ?? ""
    const prefill = get_data(message, 'prefill') ?? ""

    // prepend the prefill to the memory if needed
    if (get_settings('show_prefill')) {
        memory = `${prefill}${memory}`
    }
    return memory
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function edit_memory(message /*: any */, text /*: any */) {
    // perform a manual edit of the memory text

    const current_text = get_memory(message)
    if (text === current_text) return;  // no change
    set_data(message, "memory", text);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", Boolean(text))  // mark as edited if not deleted

    // deleting or adding text to a deleted memory, remove some other flags
    if (!text || !current_text) {
        set_data(message, "exclude", false)
    }
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function clear_memory(message /*: any */) {
    // clear the memory from a message
    set_data(message, "memory", null);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", false)
    set_data(message, "exclude", false)
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function toggle_memory_value(indexes /*: any */, value /*: any */, check_value /*: any */, set_value /*: any */) {
    // For each message index, call set_value(index, value) function on each.
    // If no value given, toggle the values. Only toggle false if ALL are true.

    if (value === null) {  // no value - toggle
        let all_true = true
        for (const index of indexes) {
            if (!check_value(index)) {
                all_true = false
                set_value(index, true)
            }
        }

        if (all_true) {  // set to false only if all are true
            for (const index of indexes) {
                set_value(index, false)
            }
        }

    } else {  // value given
        for (const index of indexes) {
            set_value(index, value)
        }
    }

}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function get_previous_swipe_memory(message /*: any */, key /*: any */) {
    // get information from the message's previous swipe
    if (!message.swipe_id) {
        return null;
    }
    return message?.swipe_info?.[message.swipe_id-1]?.extra?.[MODULE_NAME]?.[key];
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function forget_message_toggle(indexes /*: any */=null, value /*: any */=null) {
    // Toggle the "forget" status of a message
    const context = getContext();

    if (indexes === null) {  // Default to the last message, min 0
        indexes = [Math.max(context.chat.length-1, 0)];
    } else if (!Array.isArray(indexes)) {  // only one index given
        indexes = [indexes];
    }

    // $FlowFixMe[missing-local-annot]
    function set(index, value) {
        const message = context.chat[index]
        set_data(message, 'exclude', value);
        debug(`Set message ${index} exclude status: ${value}`);
    }

    // $FlowFixMe[missing-local-annot]
    function check(index) {
        return get_data(context.chat[index], 'exclude')
    }

    toggle_memory_value(indexes, value, check, set)
    refresh_memory()
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function get_character_key(message /*: any */) {
    // get the unique identifier of the character that sent a message
    return message.original_avatar
}

// Add an interception function to reduce the number of messages injected normally
// This has to match the manifest.json "generate_interceptor" key
// $FlowFixMe[prop-missing]
globalThis.memory_intercept_messages = function (chat /*: any */, _contextSize /*: any */, _abort /*: any */, type /*: any */) {
    if (!chat_enabled()) return;   // if memory disabled, do nothing
    if (!get_settings('exclude_messages_after_threshold')) return  // if not excluding any messages, do nothing
    refresh_memory()

    let start = chat.length-1
    if (type === 'continue') start--  // if a continue, keep the most recent message

    // symbol is used to prevent accidentally leaking modifications to permanent chat.
    const IGNORE_SYMBOL = getContext().symbols.ignore

    // Remove any messages that have summaries injected
    for (let i=start; i >= 0; i--) {
        delete chat[i].extra.ignore_formatting
        const message = chat[i]
        const lagging = get_data(message, 'lagging')  // The message should be kept
        // $FlowFixMe[cannot-resolve-name]
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
    forget_message_toggle,
    get_character_key
};
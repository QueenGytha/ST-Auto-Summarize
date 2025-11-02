// @flow
import {
    MODULE_NAME,
    get_settings,
    saveChatDebounced,
    getContext
} from './index.js';

// For short/long summaries, use 'memory' and 'include' at the root of the message object.
// For scene summaries, use 'scene_summary_memory' and related keys (see memoryCore.js and sceneBreak.js).

// Message functions
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function set_data(message /*: STMessage */, key /*: string */, value /*: any */) /*: void */ {
    // store information on the message object (value can be any type - legitimate use of any)
    if (!message.extra) {
        message.extra = {};
    }
    // $FlowFixMe[invalid-computed-prop] - MODULE_NAME is a constant string key
    if (!message.extra[MODULE_NAME]) {
        // $FlowFixMe[prop-missing] - Dynamically adding property
        message.extra[MODULE_NAME] = {};
    }

    // $FlowFixMe[incompatible-use] - extra is guaranteed to exist by checks above
    message.extra[MODULE_NAME][key] = value;

    // Also save on the current swipe info if present
    const swipe_index = message.swipe_id
    if (swipe_index && message.swipe_info?.[swipe_index]) {
        if (!message.swipe_info[swipe_index].extra) {
            message.swipe_info[swipe_index].extra = {};
        }
        // $FlowFixMe[prop-missing] [cannot-resolve-name] - Dynamically adding property, structuredClone is global
        // $FlowFixMe[incompatible-use] - message.extra[MODULE_NAME] is guaranteed to exist by checks above (lines 19-26)
        message.swipe_info[swipe_index].extra[MODULE_NAME] = structuredClone(message.extra[MODULE_NAME])
    }

    // Only save if chat is loaded and has a chatId
    const ctx = getContext();
    if (ctx?.chat && ctx?.chatId) {
        saveChatDebounced();
    }
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function get_data(message /*: STMessage */, key /*: string */) /*: any */ {
    // get information from the message object (return value can be any type - legitimate use of any)
    return message?.extra?.[MODULE_NAME]?.[key];
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function get_memory(message /*: STMessage */) /*: string */ {
    // returns the memory (and reasoning, if present) properly prepended with the prefill (if present)
    let memory = get_data(message, 'memory') ?? ""
    const prefill = get_data(message, 'prefill') ?? ""

    // prepend the prefill to the memory if needed
    if (get_settings('show_prefill')) {
        memory = `${prefill}${memory}`
    }
    return memory
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function edit_memory(message /*: STMessage */, text /*: string */) /*: void */ {
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
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function clear_memory(message /*: STMessage */) /*: void */ {
    // clear the memory from a message
    set_data(message, "memory", null);
    set_data(message, "error", null)  // remove any errors
    set_data(message, "reasoning", null)  // remove any reasoning
    set_data(message, "prefill", null)  // remove any prefill
    set_data(message, "edited", false)
    set_data(message, "exclude", false)
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function toggle_memory_value(
    indexes /*: Array<number> */,
    value /*: ?boolean */,
    check_value /*: (index: number) => boolean */,
    set_value /*: (index: number, value: boolean) => void */
) /*: void */ {
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

    } else {  // value given (not null at this point)
        for (const index of indexes) {
            // $FlowFixMe[incompatible-type] - value is not null here due to else branch
            set_value(index, value)
        }
    }

}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function get_previous_swipe_memory(message /*: STMessage */, key /*: string */) /*: any */ {
    // get information from the message's previous swipe (return value can be any type - legitimate use of any)
    if (!message.swipe_id) {
        return null;
    }
    // $FlowFixMe[invalid-computed-prop] - MODULE_NAME is a constant string key
    return message?.swipe_info?.[message.swipe_id-1]?.extra?.[MODULE_NAME]?.[key];
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function get_character_key(message /*: STMessage */) /*: string */ {
    // get the unique identifier of the character that sent a message
    return message.original_avatar || ''
}

// Add an interception function to reduce the number of messages injected normally
// This has to match the manifest.json "generate_interceptor" key
// $FlowFixMe[prop-missing] - globalThis extension is correct
globalThis.memory_intercept_messages = function (
    _chat /*: Array<any> */,  // Unused parameter (indicated by underscore) - any is appropriate
    _contextSize /*: any */,  // Unused parameter (indicated by underscore) - any is appropriate
    _abort /*: any */,        // Unused parameter (indicated by underscore) - any is appropriate
    _type /*: string */       // Unused parameter (indicated by underscore)
) /*: void */ {
    // Message exclusion feature removed - this function now does nothing
    return;
};

export {
    set_data,
    get_data,
    get_memory,
    edit_memory,
    clear_memory,
    toggle_memory_value,
    get_previous_swipe_memory,
    get_character_key
};
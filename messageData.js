
import {
  MODULE_NAME,
  get_settings,
  saveChatDebounced,
  getContext } from
'./index.js';

// For short/long recaps, use 'memory' and 'include' at the root of the message object.
// For scene recaps, use 'scene_recap_memory' and related keys (see memoryCore.js and sceneBreak.js).

// Message functions
function set_data(message , key , value ) {
  // store information on the message object (value can be any type - legitimate use of any)
  if (!message.extra) {
    message.extra = {};
  }
  if (!message.extra[MODULE_NAME]) {
    message.extra[MODULE_NAME] = {};
  }

  message.extra[MODULE_NAME][key] = value;

  // Also save on the current swipe info if present
  const swipe_index = message.swipe_id;
  if (swipe_index && message.swipe_info?.[swipe_index]) {
    if (!message.swipe_info[swipe_index].extra) {
      message.swipe_info[swipe_index].extra = {};
    }
    message.swipe_info[swipe_index].extra[MODULE_NAME] = structuredClone(message.extra[MODULE_NAME]);
  }

  // Only save if chat is loaded and has a chatId
  const ctx = getContext();
  if (ctx?.chat && ctx?.chatId) {
    saveChatDebounced();
  }
}
function get_data(message , key ) {
  // get information from the message object (return value can be any type - legitimate use of any)
  return message?.extra?.[MODULE_NAME]?.[key];
}
function get_memory(message ) {
  // returns the memory (and reasoning, if present) properly prepended with the prefill (if present)
  let memory = get_data(message, 'memory') ?? "";
  const prefill = get_data(message, 'prefill') ?? "";

  // prepend the prefill to the memory if needed
  if (get_settings('show_prefill')) {
    memory = `${prefill}${memory}`;
  }
  return memory;
}
function edit_memory(message , text ) {
  // perform a manual edit of the memory text

  const current_text = get_memory(message);
  if (text === current_text) {return;} // no change
  set_data(message, "memory", text);
  set_data(message, "error", null); // remove any errors
  set_data(message, "reasoning", null); // remove any reasoning
  set_data(message, "prefill", null); // remove any prefill
  set_data(message, "edited", Boolean(text)); // mark as edited if not deleted

  // deleting or adding text to a deleted memory, remove some other flags
  if (!text || !current_text) {
    set_data(message, "exclude", false);
  }
}
function clear_memory(message ) {
  // clear the memory from a message
  set_data(message, "memory", null);
  set_data(message, "error", null); // remove any errors
  set_data(message, "reasoning", null); // remove any reasoning
  set_data(message, "prefill", null); // remove any prefill
  set_data(message, "edited", false);
  set_data(message, "exclude", false);
}
function toggle_memory_value(
indexes ,
value ,
check_value ,
set_value )
{
  // For each message index, call set_value(index, value) function on each.
  // If no value given, toggle the values. Only toggle false if ALL are true.

  if (value === null) {// no value - toggle
    let all_true = true;
    for (const index of indexes) {
      if (!check_value(index)) {
        all_true = false;
        set_value(index, true);
      }
    }

    if (all_true) {// set to false only if all are true
      for (const index of indexes) {
        set_value(index, false);
      }
    }

  } else {// value given (not null at this point)
    for (const index of indexes) {
      set_value(index, value);
    }
  }

}
function get_previous_swipe_memory(message , key ) {
  // get information from the message's previous swipe (return value can be any type - legitimate use of any)
  if (!message.swipe_id) {
    return null;
  }
  return message?.swipe_info?.[message.swipe_id - 1]?.extra?.[MODULE_NAME]?.[key];
}
function get_character_key(message ) {
  // get the unique identifier of the character that sent a message
  return message.original_avatar || '';
}

// Add an interception function to reduce the number of messages injected normally
// This has to match the manifest.json "generate_interceptor" key
globalThis.memory_intercept_messages = function (
_chat , // Unused parameter (indicated by underscore) - any is appropriate
_contextSize , // Unused parameter (indicated by underscore) - any is appropriate
_abort , // Unused parameter (indicated by underscore) - any is appropriate
_type  // Unused parameter (indicated by underscore)
) {
  // Message exclusion feature removed - this function now does nothing
};

export {
  set_data,
  get_data,
  get_memory,
  edit_memory,
  clear_memory,
  toggle_memory_value,
  get_previous_swipe_memory,
  get_character_key };
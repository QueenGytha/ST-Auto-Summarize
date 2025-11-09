
import {
  get_settings,
  set_data,
  get_data,
  getContext,
  get_memory,
  count_tokens,
  get_short_token_limit,
  update_all_message_visuals,
  debug,
  character_enabled,
  get_character_key,
  system_message_types,
  auto_hide_messages_by_command,
  chat_enabled,
  MODULE_NAME,
  extension_prompt_types,
  debounce,
  debounce_timeout,
  SUBSYSTEM,
  saveChatDebounced } from
'./index.js';
import { get_running_recap_injection, clear_running_scene_recaps } from './runningSceneRecap.js';

// INJECTION RECORDING FOR LOGS
let last_scene_injection = "";

// RECAP PROPERTY STRUCTURE:
// - Single message recaps are stored at the root of the message object:
//     - 'memory': the recap text
//     - 'include': 'Recap of message(s)'
// - Scene recaps are NOT stored at the root. Instead, they use:
//     - 'scene_recap_memory': the recap text for the scene break
//     - 'scene_break_visible': whether the scene break is visible
//     - 'scene_recap_include': whether to include this scene recap in injections
//     - 'scene_recap_versions': array of all versions of the scene recap
//     - 'scene_recap_current_index': index of the current version

// Retrieving memories
function check_message_exclusion(message ) {
  // check for any exclusion criteria for a given message based on current settings
  // (this does NOT take context lengths into account, only exclusion criteria based on the message itself).
  if (!message) {return false;}

  // system messages sent by this extension are always ignored
  if (get_data(message, 'is_auto_recap_system_memory')) {
    return false;
  }

  // check if it's marked to be excluded - if so, exclude it
  if (get_data(message, 'exclude')) {
    return false;
  }

  // check if it's a user message and exclude if the setting is disabled
  if (!get_settings('include_user_messages') && message.is_user) {
    return false;
  }

  // check if it's a thought message and exclude (Stepped Thinking extension)
  // NOTE: message.is_thoughts may be deprecated in newer versions of the Stepped Thinking extension,
  // but we keep this check for backward compatibility with older versions
  if (message.is_thoughts) {
    return false;
  }

  // check if it's a hidden message and exclude if the setting is disabled
  if (!get_settings('include_system_messages') && message.is_system) {
    return false;
  }

  // check if it's a narrator message
  if (!get_settings('include_narrator_messages') && message.extra?.type === system_message_types.NARRATOR) {
    return false;
  }

  // check if the character is disabled
  const char_key = get_character_key(message);
  if (!character_enabled(char_key)) {
    return false;
  }

  // Check if the message is too short
  const token_size = count_tokens(message.mes);
  if (token_size < get_settings('message_length_threshold')) {
    return false;
  }

  return true;
}
function update_message_inclusion_flags() {
  // Update all messages in the chat, flagging them as single message recaps or long-term memories to include in the injection.
  // This has to be run on the entire chat since it needs to take the context limits into account.
  const context = getContext();
  const chat = context.chat;

  debug("Updating message inclusion flags");

  // iterate through the chat in reverse order and mark the messages that should be included as single message recaps
  let message_recap_limit_reached = false;
  const end = chat.length - 1;
  let recap = ""; // total concatenated recap so far
  let new_recap = ""; // temp recap storage to check token length
  for (let i = end; i >= 0; i--) {
    const message = chat[i];

    // check for any of the exclusion criteria
    const include = check_message_exclusion(message);
    if (!include) {
      set_data(message, 'include', null);
      continue;
    }

    if (!message_recap_limit_reached) {// single message limit hasn't been reached yet
      const memory = get_memory(message);
      if (!memory) {// If it doesn't have a memory, mark it as excluded and move to the next
        set_data(message, 'include', null);
        continue;
      }

      new_recap = concatenate_recap(recap, message); // concatenate this recap
      const message_recap_token_size = count_tokens(new_recap);
      if (message_recap_token_size > get_short_token_limit()) {// over context limit
        message_recap_limit_reached = true;
        recap = ""; // reset recap
      } else {// under context limit
        set_data(message, 'include', 'Recap of message(s)');
        recap = new_recap;
        continue;
      }
    }

    // if we haven't marked it for inclusion yet, mark it as excluded
    set_data(message, 'include', null);
  }

  update_all_message_visuals();
}
function concatenate_recap(existing_text , message ) {
  // given an existing text of concatenated recaps, concatenate the next one onto it
  const memory = get_memory(message);
  if (!memory) {// if there's no recap, do nothing
    return existing_text;
  }
  const separator = existing_text ? "\n" : "";
  return existing_text + separator + memory;
}

// Scene recaps are stored in 'scene_recap_memory' (not 'memory') on the message object.
function concatenate_recaps(indexes ) {
  const context = getContext();
  const chat = context.chat;
  const recaps = [];
  let count = 1;
  for (const i of indexes) {
    const message = chat[i];
    let type, recap;
    if (get_data(message, 'scene_recap_memory')) {
      // Scene recap
      type = 'Scene-wide Recap';
      recap = get_data(message, 'scene_recap_memory');
    } else {
      // Single message recap
      type = get_data(message, 'include');
      recap = get_data(message, 'memory');
    }
    if (recap) {
      recaps.push({ id: count, recap, type });
      count++;
    }
  }
  return JSON.stringify(recaps, null, 2);
}

// Comprehensive cleanup with detailed auditing - tracks 6 types of cleared data
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Cleanup with detailed auditing of 6 data types inherently complex
function clear_all_recaps_for_chat() {
  const ctx = getContext();
  const chat = ctx.chat;

  if (!Array.isArray(chat) || chat.length === 0) {
    debug(SUBSYSTEM.MEMORY, 'No chat loaded while attempting to clear recaps');
    return {
      messageMetadataCleared: 0,
      singleRecapsCleared: 0,
      sceneRecapsCleared: 0,
      sceneBreaksCleared: 0,
      checkedFlagsCleared: 0,
      swipeRecapsCleared: 0,
      runningRecapCleared: 0
    };
  }

  let messageMetadataCleared = 0;
  let singleRecapsCleared = 0;
  let sceneRecapsCleared = 0;
  let sceneBreaksCleared = 0;
  let checkedFlagsCleared = 0;
  let swipeRecapsCleared = 0;

  for (const message of chat) {
    const moduleData = message?.extra?.[MODULE_NAME];

    if (moduleData) {
      messageMetadataCleared++;

      if (moduleData.memory) {
        singleRecapsCleared++;
      }

      if (
      moduleData.scene_recap_memory ||
      Array.isArray(moduleData.scene_recap_versions) && moduleData.scene_recap_versions.length > 0)
      {
        sceneRecapsCleared++;
      }

      if (moduleData.scene_break) {
        sceneBreaksCleared++;
      }

      if (moduleData.auto_scene_break_checked) {
        checkedFlagsCleared++;
      }

      delete message.extra[MODULE_NAME];
      if (message.extra && Object.keys(message.extra).length === 0) {
        delete message.extra;
      }
    }

    if (Array.isArray(message?.swipe_info)) {
      for (const swipe of message.swipe_info) {
        if (swipe?.extra?.[MODULE_NAME]) {
          delete swipe.extra[MODULE_NAME];
          if (swipe.extra && Object.keys(swipe.extra).length === 0) {
            delete swipe.extra;
          }
          swipeRecapsCleared++;
        }
      }
    }
  }

  const runningRecapCleared = clear_running_scene_recaps();

  saveChatDebounced();

  debug(
    SUBSYSTEM.MEMORY,
    `[Reset] Cleared recaps: messages=${messageMetadataCleared}, single=${singleRecapsCleared}, scenes=${sceneRecapsCleared}, sceneBreaks=${sceneBreaksCleared}, checked=${checkedFlagsCleared}, swipes=${swipeRecapsCleared}, runningVersions=${runningRecapCleared}`
  );

  if (typeof window !== 'undefined') {
    // Flag scene break detector to perform a full rescan on next run
    window.autoRecapForceSceneBreakRescan = true;
  }

  return {
    messageMetadataCleared,
    singleRecapsCleared,
    sceneRecapsCleared,
    sceneBreaksCleared,
    checkedFlagsCleared,
    swipeRecapsCleared,
    runningRecapCleared
  };
}

function collect_chat_messages(include ) {
  // Get a list of chat message indexes identified by the given criteria
  const context = getContext();
  const indexes = []; // list of indexes of messages

  // iterate in reverse order
  for (let i = context.chat.length - 1; i >= 0; i--) {
    const message = context.chat[i];
    if (!get_data(message, 'memory')) {continue;} // no memory
    if (get_data(message, 'include') !== include) {continue;} // not the include types we want
    indexes.push(i);
  }

  // reverse the indexes so they are in chronological order
  indexes.reverse();
  return indexes;
}

async function refresh_memory() {
  const ctx = getContext();

  // --- Declare scene injection position/role/depth/scan variables ---
  const scene_recap_position = get_settings('running_scene_recap_position');
  const scene_recap_role = get_settings('running_scene_recap_role');
  const scene_recap_depth = get_settings('running_scene_recap_depth');
  const scene_recap_scan = get_settings('running_scene_recap_scan');

  // --- Auto-hide/unhide messages older than X ---
  await auto_hide_messages_by_command();
  // --- end auto-hide ---

  if (!chat_enabled()) {// if chat not enabled, remove the injections
    ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
    return "";
  }

  debug("Refreshing memory");

  // Update the UI according to the current state of the chat memories
  update_message_inclusion_flags(); // update the inclusion flags for all messages

  // --- Scene Recap Injection ---
  const scene_injection = get_running_recap_injection();
  debug(SUBSYSTEM.MEMORY, `Using running scene recap for injection (${scene_injection.length} chars)`);

  // Store for later logging
  last_scene_injection = scene_injection;

  // Only inject scene recaps (message recaps are NOT injected)
  ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, scene_injection, scene_recap_position, scene_recap_depth, scene_recap_scan, scene_recap_role);

  return scene_injection; // return the scene injection
}
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);


export {
  check_message_exclusion,
  collect_chat_messages,
  concatenate_recaps,
  clear_all_recaps_for_chat,
  refresh_memory,
  refresh_memory_debounced,
  last_scene_injection };

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
  generic_memories_macro,
  auto_hide_messages_by_command,
  chat_enabled,
  MODULE_NAME,
  extension_prompt_types,
  debounce,
  debounce_timeout,
  SUBSYSTEM,
  saveChatDebounced } from
'./index.js';
import { get_running_summary_injection, clear_running_scene_summaries } from './runningSceneSummary.js';

// INJECTION RECORDING FOR LOGS
let last_scene_injection = "";

// SUMMARY PROPERTY STRUCTURE:
// - Single message summaries are stored at the root of the message object:
//     - 'memory': the summary text
//     - 'include': 'Summary of message(s)'
// - Scene summaries are NOT stored at the root. Instead, they use:
//     - 'scene_summary_memory': the summary text for the scene break
//     - 'scene_break_visible': whether the scene break is visible
//     - 'scene_summary_include': whether to include this scene summary in injections
//     - 'scene_summary_versions': array of all versions of the scene summary
//     - 'scene_summary_current_index': index of the current version

// Retrieving memories
function check_message_exclusion(message ) {
  // check for any exclusion criteria for a given message based on current settings
  // (this does NOT take context lengths into account, only exclusion criteria based on the message itself).
  if (!message) return false;

  // system messages sent by this extension are always ignored
  if (get_data(message, 'is_auto_summarize_system_memory')) {
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
  // TODO: This is deprecated in the thought extension, could be removed at some point?
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
  // Update all messages in the chat, flagging them as single message summaries or long-term memories to include in the injection.
  // This has to be run on the entire chat since it needs to take the context limits into account.
  const context = getContext();
  const chat = context.chat;

  debug("Updating message inclusion flags");

  // iterate through the chat in reverse order and mark the messages that should be included as single message summaries
  let message_summary_limit_reached = false;
  const end = chat.length - 1;
  let summary = ""; // total concatenated summary so far
  let new_summary = ""; // temp summary storage to check token length
  for (let i = end; i >= 0; i--) {
    const message = chat[i];

    // check for any of the exclusion criteria
    const include = check_message_exclusion(message);
    if (!include) {
      set_data(message, 'include', null);
      continue;
    }

    if (!message_summary_limit_reached) {// single message limit hasn't been reached yet
      const memory = get_memory(message);
      if (!memory) {// If it doesn't have a memory, mark it as excluded and move to the next
        set_data(message, 'include', null);
        continue;
      }

      new_summary = concatenate_summary(summary, message); // concatenate this summary
      const message_summary_token_size = count_tokens(new_summary);
      if (message_summary_token_size > get_short_token_limit()) {// over context limit
        message_summary_limit_reached = true;
        summary = ""; // reset summary
      } else {// under context limit
        set_data(message, 'include', 'Summary of message(s)');
        summary = new_summary;
        continue;
      }
    }

    // if we haven't marked it for inclusion yet, mark it as excluded
    set_data(message, 'include', null);
  }

  update_all_message_visuals();
}
function concatenate_summary(existing_text , message ) {
  // given an existing text of concatenated summaries, concatenate the next one onto it
  const memory = get_memory(message);
  if (!memory) {// if there's no summary, do nothing
    return existing_text;
  }
  const separator = existing_text ? "\n" : "";
  return existing_text + separator + memory;
}

// Scene summaries are stored in 'scene_summary_memory' (not 'memory') on the message object.
function concatenate_summaries(indexes ) {
  const context = getContext();
  const chat = context.chat;
  const summaries = [];
  let count = 1;
  for (const i of indexes) {
    const message = chat[i];
    let type, summary;
    if (get_data(message, 'scene_summary_memory')) {
      // Scene summary
      type = 'Scene-wide Sumary';
      summary = get_data(message, 'scene_summary_memory');
    } else {
      // Single message summary
      type = get_data(message, 'include');
      summary = get_data(message, 'memory');
    }
    if (summary) {
      summaries.push({ id: count, summary, type });
      count++;
    }
  }
  return JSON.stringify(summaries, null, 2);
}

function clear_all_summaries_for_chat() {
  const ctx = getContext();
  const chat = ctx.chat;

  if (!Array.isArray(chat) || chat.length === 0) {
    debug(SUBSYSTEM.MEMORY, 'No chat loaded while attempting to clear summaries');
    return {
      messageMetadataCleared: 0,
      singleSummariesCleared: 0,
      sceneSummariesCleared: 0,
      sceneBreaksCleared: 0,
      checkedFlagsCleared: 0,
      swipeSummariesCleared: 0,
      runningSummaryCleared: 0
    };
  }

  let messageMetadataCleared = 0;
  let singleSummariesCleared = 0;
  let sceneSummariesCleared = 0;
  let sceneBreaksCleared = 0;
  let checkedFlagsCleared = 0;
  let swipeSummariesCleared = 0;

  for (const message of chat) {
    const moduleData = message?.extra?.[MODULE_NAME];

    if (moduleData) {
      messageMetadataCleared++;

      if (moduleData.memory) {
        singleSummariesCleared++;
      }

      if (
      moduleData.scene_summary_memory ||
      Array.isArray(moduleData.scene_summary_versions) && moduleData.scene_summary_versions.length > 0)
      {
        sceneSummariesCleared++;
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
          swipeSummariesCleared++;
        }
      }
    }
  }

  const runningSummaryCleared = clear_running_scene_summaries();

  saveChatDebounced();

  debug(
    SUBSYSTEM.MEMORY,
    `[Reset] Cleared summaries: messages=${messageMetadataCleared}, single=${singleSummariesCleared}, scenes=${sceneSummariesCleared}, sceneBreaks=${sceneBreaksCleared}, checked=${checkedFlagsCleared}, swipes=${swipeSummariesCleared}, runningVersions=${runningSummaryCleared}`
  );

  if (typeof window !== 'undefined') {
    // Flag scene break detector to perform a full rescan on next run
    window.autoSummarizeForceSceneBreakRescan = true;
  }

  return {
    messageMetadataCleared,
    singleSummariesCleared,
    sceneSummariesCleared,
    sceneBreaksCleared,
    checkedFlagsCleared,
    swipeSummariesCleared,
    runningSummaryCleared
  };
}

function collect_chat_messages(include ) {
  // Get a list of chat message indexes identified by the given criteria
  const context = getContext();
  const indexes = []; // list of indexes of messages

  // iterate in reverse order
  for (let i = context.chat.length - 1; i >= 0; i--) {
    const message = context.chat[i];
    if (!get_data(message, 'memory')) continue; // no memory
    if (get_data(message, 'include') !== include) continue; // not the include types we want
    indexes.push(i);
  }

  // reverse the indexes so they are in chronological order
  indexes.reverse();
  return indexes;
}
function get_message_summary_injection() {
  // get the injection text for single message summary
  const indexes = collect_chat_messages('Summary of message(s)');
  if (indexes.length === 0) return ""; // if no memories, return empty

  const text = concatenate_summaries(indexes);
  const template = get_settings('short_template');
  const ctx = getContext();

  // replace memories macro
  return ctx.substituteParamsExtended(template, { [generic_memories_macro]: text });
}

async function refresh_memory() {
  const ctx = getContext();

  // --- Declare scene injection position/role/depth/scan variables ---
  const scene_summary_position = get_settings('running_scene_summary_position');
  const scene_summary_role = get_settings('running_scene_summary_role');
  const scene_summary_depth = get_settings('running_scene_summary_depth');
  const scene_summary_scan = get_settings('running_scene_summary_scan');

  // --- Auto-hide/unhide messages older than X ---
  await auto_hide_messages_by_command();
  // --- end auto-hide ---

  if (!chat_enabled()) {// if chat not enabled, remove the injections
    ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
    return;
  }

  debug("Refreshing memory");

  // Update the UI according to the current state of the chat memories
  update_message_inclusion_flags(); // update the inclusion flags for all messages

  // --- Scene Summary Injection ---
  const scene_injection = get_running_summary_injection();
  debug(SUBSYSTEM.MEMORY, `Using running scene summary for injection (${scene_injection.length} chars)`);

  // Store for later logging
  last_scene_injection = scene_injection;

  // Only inject scene summaries (message summaries are NOT injected)
  ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, scene_injection, scene_summary_position, scene_summary_depth, scene_summary_scan, scene_summary_role);

  return scene_injection; // return the scene injection
}
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);


export {
  check_message_exclusion,
  collect_chat_messages,
  concatenate_summaries,
  clear_all_summaries_for_chat,
  refresh_memory,
  refresh_memory_debounced,
  last_scene_injection };
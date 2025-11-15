
import {
  get_settings,
  getContext,
  debug,
  auto_hide_messages_by_command,
  chat_enabled,
  MODULE_NAME,
  extension_prompt_types,
  debounce,
  debounce_timeout,
  SUBSYSTEM,
  saveChatDebounced,
  clearActiveLorebooksData } from
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

// NOTE: Per-message recap injection has been removed. Only scene recaps are injected.
// The following legacy code has been removed:
// - check_message_exclusion() - filtered messages for per-message recap inclusion
// - update_message_inclusion_flags() - set message.include flags for UI display
// - concatenate_recap() - concatenated per-message recaps
// - concatenate_recaps() - created JSON arrays of recaps (never used)
// - collect_chat_messages() - collected message indexes by inclusion type (never used)

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

    if (message.extra?.activeLorebookEntries) {
      delete message.extra.activeLorebookEntries;
    }

    if (message.extra?.inactiveLorebookEntries) {
      delete message.extra.inactiveLorebookEntries;
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

  clearActiveLorebooksData();

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
  clear_all_recaps_for_chat,
  refresh_memory,
  refresh_memory_debounced,
  last_scene_injection };
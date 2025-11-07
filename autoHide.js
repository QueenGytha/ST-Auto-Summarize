
import {
  getContext,
  get_settings,
  debug,
  get_data } from
'./index.js';
import { ANIMATION_DELAY_MS } from './constants.js';

// Helper: Find all visible scene breaks
function findVisibleSceneBreaks(chat) {
  const scene_break_indexes = [];
  for (let i = 0; i < chat.length; i++) {
    if (get_data(chat[i], 'scene_break') && get_data(chat[i], 'scene_break_visible') !== false) {
      scene_break_indexes.push(i);
    }
  }
  return scene_break_indexes;
}

// Helper: Apply scene-based hiding rules
function applySceneBasedHiding(chat, auto_hide_scene_count, to_hide, to_unhide) {
  if (auto_hide_scene_count < 0) return;

  const scene_break_indexes = findVisibleSceneBreaks(chat);
  const scenes_to_keep = auto_hide_scene_count;

  if (scene_break_indexes.length >= scenes_to_keep) {
    const first_visible_scene = scene_break_indexes.length - scenes_to_keep;
    const visible_start = scene_break_indexes[first_visible_scene] + 1;

    // Hide all messages before visible_start
    for (let i = 0; i < visible_start; i++) {
      to_hide.add(i);
      to_unhide.delete(i);
    }

    // Unhide all messages from visible_start onwards
    for (let i = visible_start; i < chat.length; i++) {
      to_unhide.add(i);
      to_hide.delete(i);
    }
  }
}

// Helper: Execute hide/unhide command for a range
async function executeCommand(ctx, command, batchStart, last) {
  if (batchStart === last) {
    debug(`[auto_hide] ${command}ing message ${batchStart}`);
    await ctx.executeSlashCommandsWithOptions(`/${command} ${batchStart}`);
  } else {
    debug(`[auto_hide] ${command}ing messages ${batchStart}-${last}`);
    await ctx.executeSlashCommandsWithOptions(`/${command} ${batchStart}-${last}`);
  }
}

// Helper: Process batched commands for contiguous ranges
async function processBatchedCommands(ctx, indexes, command) {
  if (indexes.length === 0) return;

  let batchStart = null;
  let last = null;

  for (let i = 0; i < indexes.length; i++) {
    if (batchStart === null) batchStart = indexes[i];

    if (last !== null && indexes[i] !== last + 1) {
      // Sequential execution required: batches must complete in order
      // eslint-disable-next-line no-await-in-loop
      await executeCommand(ctx, command, batchStart, last);
      batchStart = indexes[i];
    }
    last = indexes[i];
  }

  if (batchStart !== null) {
    await executeCommand(ctx, command, batchStart, last);
  }
}

async function auto_hide_messages_by_command() {
  const ctx = getContext();
  const auto_hide_scene_count = get_settings('auto_hide_scene_count');
  const chat = ctx.chat;

  const to_hide = new Set();
  const to_unhide = new Set();

  // Initialize unhide set with all messages (scene-based hiding will override as needed)
  for (let i = 0; i < chat.length; i++) {
    to_unhide.add(i);
  }

  // Apply scene-based hiding rules
  applySceneBasedHiding(chat, auto_hide_scene_count, to_hide, to_unhide);

  // Convert sets to sorted arrays and execute commands
  const to_hide_arr = Array.from(to_hide).sort((a, b) => a - b);
  const to_unhide_arr = Array.from(to_unhide).sort((a, b) => a - b);

  await processBatchedCommands(ctx, to_hide_arr, 'hide');
  await processBatchedCommands(ctx, to_unhide_arr, 'unhide');

  // Wait for SillyTavern to update
  debug("[auto_hide] Waiting for backend/UI update...");
  await new Promise((resolve) => setTimeout(resolve, ANIMATION_DELAY_MS));
}

export {
  auto_hide_messages_by_command };
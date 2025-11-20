/**
 * Checkpoint/Branch Lorebook Integration
 *
 * Creates point-in-time lorebook snapshots for checkpoints/branches.
 */

import { reconstructPointInTimeLorebook } from './lorebookReconstruction.js';
import { debug, error, toast, SUBSYSTEM, generateLorebookName, getUniqueLorebookName } from './utils.js';
import { getContext } from './index.js';
import { extension_settings } from '../../../extensions.js';
import { world_names } from '../../../world-info.js';
import { chat_metadata, saveMetadata } from '../../../../script.js';

// Track which messages have had lorebooks created (to prevent double-creation on re-click)
const processedMessages = new Set();

/**
 * Create lorebook for checkpoint/branch at the given message
 * @param {number} messageIndex - Message index where checkpoint/branch will be created
 * @param {string} newChatName - The NEW chat name (branch/checkpoint name)
 * @returns {Promise<string>} Lorebook name
 */
export async function createCheckpointLorebook(messageIndex, newChatName) {
  // Check if already processed
  if (processedMessages.has(messageIndex)) {
    debug(SUBSYSTEM.LOREBOOK, `Lorebook already created for message ${messageIndex}, skipping`);
    return null;
  }

  const ctx = getContext();

  // Generate lorebook name using template system with the NEW chat name
  const template = extension_settings?.autoLorebooks?.nameTemplate || 'z-AutoLB-{{chat}}';
  const characterName = ctx.name2 || ctx.characterName || 'Unknown';

  // Use the NEW branch/checkpoint chat name
  const baseName = generateLorebookName(template, characterName, newChatName);
  const lorebookName = getUniqueLorebookName(baseName, world_names);

  debug(SUBSYSTEM.LOREBOOK, `Creating lorebook for checkpoint/branch: ${lorebookName}`);

  toast('Creating point-in-time lorebook snapshot...', 'info');

  try {
    // Reconstruct lorebook from scene break metadata
    const result = await reconstructPointInTimeLorebook(messageIndex, lorebookName);

    debug(SUBSYSTEM.LOREBOOK,
      `✓ Lorebook reconstructed: ${result.lorebookName} ` +
      `(${result.entriesReconstructed} entries from message ${result.sourceMessageIndex})`
    );

    // Attach lorebook to the NEW chat (we're already in the branch/checkpoint now)
    chat_metadata.world_info = result.lorebookName;
    await saveMetadata();

    toast(`Lorebook snapshot created: ${result.entriesReconstructed} entries`, 'success');

    // Mark as processed
    processedMessages.add(messageIndex);

    return result.lorebookName;

  } catch (err) {
    error(SUBSYSTEM.LOREBOOK, 'Lorebook reconstruction failed:', err);
    toast(`Lorebook reconstruction failed: ${err.message}`, 'error');
    throw err;
  }
}

/**
 * Dummy install function for compatibility
 */
export function installCheckpointLorebookHook() {
  // No longer needed - integration happens in buttonBindings.js
  debug(SUBSYSTEM.LOREBOOK, 'Checkpoint lorebook integration is now handled in buttonBindings.js');
}

/**
 * Uninstall the hook (for testing/cleanup)
 */
export function uninstallCheckpointLorebookHook() {
  processedMessages.clear();
  debug(SUBSYSTEM.LOREBOOK, 'Checkpoint lorebook hook uninstalled');
}

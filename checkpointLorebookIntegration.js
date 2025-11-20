/**
 * Checkpoint/Branch Lorebook Integration
 *
 * Hooks into SillyTavern's saveChat to reconstruct lorebooks when
 * creating checkpoints or branches.
 */

import { reconstructPointInTimeLorebook } from './lorebookReconstruction.js';
import { debug, error, toast, SUBSYSTEM, generateLorebookName, getUniqueLorebookName } from './utils.js';
import { getContext } from './index.js';
import { extension_settings } from '../../../extensions.js';
import { world_names } from '../../../world-info.js';
import * as ScriptModule from '../../../script.js';

let originalSaveChat = null;
let hookInstalled = false;

/**
 * Install hook into SillyTavern's saveChat function
 */
export function installCheckpointLorebookHook() {
  if (hookInstalled) {
    debug(SUBSYSTEM.LOREBOOK, 'Checkpoint lorebook hook already installed');
    return;
  }

  const ctx = getContext();

  // Import and wrap the actual saveChat function from script.js
  // This is what bookmarks.js calls, NOT ctx.saveChat
  originalSaveChat = ScriptModule.saveChat;

  if (!originalSaveChat) {
    error(SUBSYSTEM.LOREBOOK, 'Cannot install checkpoint lorebook hook: saveChat not found in script.js');
    return;
  }

  // Helper: Handle checkpoint/branch lorebook reconstruction
  async function handleCheckpointLorebook(options) {
    debug(SUBSYSTEM.LOREBOOK,
      `Checkpoint/branch detected: ${options.chatName} from message ${options.mesId}`
    );

    // Generate lorebook name using template system
    const template = extension_settings?.autoLorebooks?.nameTemplate || 'z-AutoLB-{{chat}}';
    const characterName = ctx.name2 || ctx.characterName || 'Unknown';
    const baseName = generateLorebookName(template, characterName, options.chatName);
    const lorebookName = getUniqueLorebookName(baseName, world_names);

    debug(SUBSYSTEM.LOREBOOK, `Generated lorebook name: ${lorebookName} (from template: ${template})`);

    toast('Creating point-in-time lorebook snapshot...', 'info');

    // Block until reconstruction completes - don't create branch/checkpoint if it fails
    const result = await reconstructPointInTimeLorebook(options.mesId, lorebookName);

    debug(SUBSYSTEM.LOREBOOK,
      `✓ Lorebook reconstructed: ${result.lorebookName} ` +
      `(${result.entriesReconstructed} entries from message ${result.sourceMessageIndex})`
    );

    // Inject lorebook name into checkpoint/branch metadata
    options.withMetadata.world_info = result.lorebookName;

    toast(`Lorebook snapshot created: ${result.entriesReconstructed} entries`, 'success');
  }

  // Wrap saveChat on the module to intercept all calls (including from bookmarks.js)
  // eslint-disable-next-line complexity -- Wrapper requires conditional logic for checkpoint detection and error handling
  ScriptModule.saveChat = async function wrappedSaveChat(options) {
    // eslint-disable-next-line no-console -- Diagnostic logging for debugging hook execution
    console.log('[AUTO-RECAP] saveChat WRAPPER CALLED:', JSON.stringify({
      chatName: options?.chatName,
      mesId: options?.mesId,
      hasWithMetadata: !!options?.withMetadata,
      hasMainChat: options?.withMetadata?.main_chat !== undefined
    }));

    debug(SUBSYSTEM.LOREBOOK, `saveChat wrapper called with options: ${JSON.stringify({
      chatName: options?.chatName,
      mesId: options?.mesId,
      hasWithMetadata: !!options?.withMetadata,
      hasMainChat: options?.withMetadata?.main_chat !== undefined
    })}`);

    try {
      // Check if this is a checkpoint or branch being created
      const isCheckpointOrBranch = options?.withMetadata?.main_chat !== undefined;

      if (isCheckpointOrBranch && options?.chatName && options?.mesId !== undefined) {
        // eslint-disable-next-line no-console -- Diagnostic logging for debugging checkpoint detection
        console.log('[AUTO-RECAP] CHECKPOINT/BRANCH DETECTED - starting reconstruction');
        await handleCheckpointLorebook(options);
      }

      // Call original saveChat with potentially modified metadata
      return await originalSaveChat.call(this, options);

    } catch (err) {
      error(SUBSYSTEM.LOREBOOK, 'Error in saveChat wrapper:', err);

      // If this was a checkpoint/branch creation, throw error to block it
      const wasCheckpointOrBranch = options?.withMetadata?.main_chat !== undefined;
      if (wasCheckpointOrBranch) {
        toast('Checkpoint/branch creation blocked due to lorebook reconstruction failure', 'error');
        throw err;
      }

      // For regular saves, continue despite error
      return await originalSaveChat.call(this, options);
    }
  };

  hookInstalled = true;
  debug(SUBSYSTEM.LOREBOOK, '✓ Checkpoint lorebook hook installed');
}

/**
 * Uninstall the hook (for testing/cleanup)
 */
export function uninstallCheckpointLorebookHook() {
  if (!hookInstalled || !originalSaveChat) {
    return;
  }

  ScriptModule.saveChat = originalSaveChat;
  originalSaveChat = null;
  hookInstalled = false;

  debug(SUBSYSTEM.LOREBOOK, 'Checkpoint lorebook hook uninstalled');
}

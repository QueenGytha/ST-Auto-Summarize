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

  // Save reference to original saveChat
  originalSaveChat = ctx.saveChat;

  if (!originalSaveChat) {
    error(SUBSYSTEM.LOREBOOK, 'Cannot install checkpoint lorebook hook: saveChat not found');
    return;
  }

  // Wrap saveChat to intercept checkpoint/branch creation
  ctx.saveChat = async function wrappedSaveChat(options) {
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

        try {
          const result = await reconstructPointInTimeLorebook(options.mesId, lorebookName);

          debug(SUBSYSTEM.LOREBOOK,
            `✓ Lorebook reconstructed: ${result.lorebookName} ` +
            `(${result.entriesReconstructed} entries from message ${result.sourceMessageIndex})`
          );

          // Inject lorebook name into checkpoint/branch metadata
          options.withMetadata.world_info = result.lorebookName;

          toast(`Lorebook snapshot created: ${result.entriesReconstructed} entries`, 'success');

        } catch (err) {
          error(SUBSYSTEM.LOREBOOK, 'Lorebook reconstruction failed:', err);
          toast(`Lorebook reconstruction failed: ${err.message}`, 'error');
          // Don't throw - let checkpoint/branch be created without custom lorebook
          // User can manually fix the lorebook attachment
        }
      }

      // Call original saveChat with potentially modified metadata
      return await originalSaveChat.call(this, options);

    } catch (err) {
      error(SUBSYSTEM.LOREBOOK, 'Error in saveChat wrapper:', err);
      // Call original on error to ensure checkpoint/branch creation doesn't break
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

  const ctx = getContext();
  ctx.saveChat = originalSaveChat;
  originalSaveChat = null;
  hookInstalled = false;

  debug(SUBSYSTEM.LOREBOOK, 'Checkpoint lorebook hook uninstalled');
}

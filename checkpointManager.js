import {
  createNewWorldInfo,
  loadWorldInfo,
  saveWorldInfo,
  createWorldInfoEntry
} from '../../../world-info.js';
import { createNewBookmark, createBranch } from '../../../bookmarks.js';
import { chat_metadata, saveMetadata, getCurrentChatId, openCharacterChat } from '../../../../script.js';
import { selected_group, openGroupChat } from '../../../group-chats.js';

let debug, error;
let isCreatingCheckpoint = false;

export function initCheckpointManager(utils) {
  debug = utils.debug;
  error = utils.error;
}

function copyEntryProperties(newEntry, sourceEntry) {
  newEntry.comment = sourceEntry.comment || '';
  newEntry.content = sourceEntry.content || '';
  newEntry.key = Array.isArray(sourceEntry.key) ? [...sourceEntry.key] : [];
  newEntry.keysecondary = Array.isArray(sourceEntry.keysecondary) ? [...sourceEntry.keysecondary] : [];

  const numberFields = ['order', 'position', 'depth', 'sticky', 'probability'];
  const booleanFields = ['constant', 'disable', 'excludeRecursion', 'preventRecursion', 'ignoreBudget', 'useProbability'];

  for (const field of numberFields) {
    if (typeof sourceEntry[field] === 'number') {
      newEntry[field] = sourceEntry[field];
    }
  }

  for (const field of booleanFields) {
    if (typeof sourceEntry[field] === 'boolean') {
      newEntry[field] = sourceEntry[field];
    }
  }

  if (sourceEntry.role !== undefined) {
    newEntry.role = sourceEntry.role;
  }

  if (Array.isArray(sourceEntry.tags)) {
    newEntry.tags = [...sourceEntry.tags];
  }
}

function isInternalEntry(comment) {
  if (!comment) {
    return false;
  }
  const internalPrefixes = ['_registry_', '__operation_queue', '_combined_recap_', '_running_scene_recap_'];
  return internalPrefixes.some(prefix => comment.startsWith(prefix));
}

export async function cloneLorebook(sourceLorebookName, targetLorebookName) {
  if (!sourceLorebookName) {
    debug?.('cloneLorebook: source lorebook is null/undefined, skipping clone');
    return null;
  }

  if (!targetLorebookName) {
    throw new Error('cloneLorebook: target lorebook name is required');
  }

  const sourceData = await loadWorldInfo(sourceLorebookName);
  if (!sourceData) {
    throw new Error(`cloneLorebook: failed to load source lorebook: ${sourceLorebookName}`);
  }

  const created = await createNewWorldInfo(targetLorebookName);
  if (!created) {
    throw new Error(`cloneLorebook: failed to create target lorebook: ${targetLorebookName}`);
  }

  const targetData = await loadWorldInfo(targetLorebookName);
  if (!targetData) {
    throw new Error(`cloneLorebook: failed to load newly created lorebook: ${targetLorebookName}`);
  }

  if (!targetData.entries) {
    targetData.entries = {};
  }

  const sourceEntries = Object.values(sourceData.entries || {});

  for (const sourceEntry of sourceEntries) {
    if (!sourceEntry) {
      continue;
    }

    if (isInternalEntry(sourceEntry.comment)) {
      debug?.(`cloneLorebook: skipping internal entry: ${sourceEntry.comment}`);
      continue;
    }

    const newEntry = createWorldInfoEntry(targetLorebookName, targetData);
    if (!newEntry) {
      error?.(`cloneLorebook: failed to create entry in target lorebook`);
      continue;
    }

    copyEntryProperties(newEntry, sourceEntry);
  }

  await saveWorldInfo(targetLorebookName, targetData, true);

  debug?.(`cloneLorebook: cloned ${sourceEntries.length} entries from "${sourceLorebookName}" to "${targetLorebookName}"`);

  return targetLorebookName;
}

export async function createValidatedCheckpoint(mesId, checkpointName) {
  if (isCreatingCheckpoint) {
    debug?.('createValidatedCheckpoint: checkpoint creation already in progress, blocking');
    return { success: false, blocked: true, error: 'Checkpoint creation already in progress' };
  }

  if (!checkpointName) {
    return { success: false, error: 'Checkpoint name is required' };
  }

  isCreatingCheckpoint = true;
  const startChatId = getCurrentChatId();
  const originalLorebook = chat_metadata.world_info;
  const originalState = chat_metadata.auto_recap_checkpoint_state;
  let clonedLorebookName = null;

  try {
    if (originalLorebook) {
      clonedLorebookName = `${originalLorebook}_checkpoint_${Date.now()}`;
      await cloneLorebook(originalLorebook, clonedLorebookName);
    }

    chat_metadata.world_info = clonedLorebookName;
    chat_metadata.auto_recap_checkpoint_state = {
      created_at: Date.now(),
      lorebook_cloned: !!clonedLorebookName,
      original_lorebook: originalLorebook
    };

    const result = await createNewBookmark(checkpointName, mesId);

    if (getCurrentChatId() !== startChatId) {
      throw new Error('Chat context changed during checkpoint creation');
    }

    if (!result) {
      throw new Error('Failed to create checkpoint via SillyTavern bookmarks API');
    }

    debug?.(`createValidatedCheckpoint: checkpoint created successfully: ${checkpointName}`);
    return { success: true, checkpointName, lorebookCloned: !!clonedLorebookName };

  } catch (err) {
    error?.('createValidatedCheckpoint: failed to create checkpoint', err);

    return { success: false, error: String(err) };

  } finally {
    if (getCurrentChatId() === startChatId) {
      if (originalState === undefined) {
        delete chat_metadata.auto_recap_checkpoint_state;
      } else {
        chat_metadata.auto_recap_checkpoint_state = originalState;
      }
      chat_metadata.world_info = originalLorebook;

      try {
        await saveMetadata();
      } catch (metaErr) {
        error?.('createValidatedCheckpoint: failed to save metadata restoration', metaErr);
      }
    } else {
      error?.('createValidatedCheckpoint: chat context changed - cannot restore metadata safely');
    }

    isCreatingCheckpoint = false;
  }
}

export async function createValidatedBranch(mesId) {
  if (isCreatingCheckpoint) {
    debug?.('createValidatedBranch: operation already in progress, blocking');
    return { success: false, blocked: true, error: 'Another checkpoint/branch operation is in progress' };
  }

  isCreatingCheckpoint = true;
  const startChatId = getCurrentChatId();
  const originalLorebook = chat_metadata.world_info;
  const originalState = chat_metadata.auto_recap_checkpoint_state;
  let clonedLorebookName = null;
  let fileName = null;

  try {
    if (originalLorebook) {
      clonedLorebookName = `${originalLorebook}_branch_${Date.now()}`;
      await cloneLorebook(originalLorebook, clonedLorebookName);
    }

    chat_metadata.world_info = clonedLorebookName;
    chat_metadata.auto_recap_checkpoint_state = {
      created_at: Date.now(),
      lorebook_cloned: !!clonedLorebookName,
      original_lorebook: originalLorebook,
      is_branch: true
    };

    fileName = await createBranch(mesId);

    if (getCurrentChatId() !== startChatId) {
      throw new Error('Chat context changed during branch creation');
    }

    if (!fileName) {
      throw new Error('Failed to create branch via SillyTavern bookmarks API');
    }

  } catch (err) {
    error?.('createValidatedBranch: failed to create branch', err);
    return { success: false, error: String(err) };

  } finally {
    if (getCurrentChatId() === startChatId) {
      if (originalState === undefined) {
        delete chat_metadata.auto_recap_checkpoint_state;
      } else {
        chat_metadata.auto_recap_checkpoint_state = originalState;
      }
      chat_metadata.world_info = originalLorebook;

      try {
        await saveMetadata();
      } catch (metaErr) {
        error?.('createValidatedBranch: failed to save metadata restoration', metaErr);
      }
    } else {
      error?.('createValidatedBranch: chat context changed - cannot restore metadata safely');
    }

    isCreatingCheckpoint = false;
  }

  if (fileName) {
    try {
      await (selected_group ? openGroupChat(selected_group, fileName) : openCharacterChat(fileName));
    } catch (openErr) {
      error?.('createValidatedBranch: failed to open branch', openErr);
      return { success: false, error: `Branch created but failed to open: ${String(openErr)}` };
    }
  }

  debug?.(`createValidatedBranch: branch created and opened successfully: ${fileName}`);
  return { success: true, fileName, lorebookCloned: !!clonedLorebookName };
}

export default {
  initCheckpointManager,
  cloneLorebook,
  createValidatedCheckpoint,
  createValidatedBranch
};

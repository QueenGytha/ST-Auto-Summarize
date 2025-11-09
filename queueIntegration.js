
// queueIntegration.js - Helper functions to queue operations instead of executing immediately

import {
  enqueueOperation,
  OperationType,
  getAllOperations,
  updateOperationStatus,
  OperationStatus } from
'./operationQueue.js';
import {
  get_settings,
  debug,
  SUBSYSTEM } from
'./index.js';
import { MAX_RECAP_ATTEMPTS, HIGH_PRIORITY_OFFSET, OPERATION_ID_LENGTH } from './constants.js';

// Priority for running recap operations - must run AFTER all lorebook operations
// HIGHER numbers run FIRST, so running recap needs LOWER priority than lorebooks (lookup=11, resolve=12, create=14)
const RUNNING_RECAP_PRIORITY = 10;

export function queueValidateRecap(recap , type , options  = {}) {
  // Capture settings at enqueue time for tooltip display
  const includePresetPrompts = get_settings('scene_recap_error_detection_include_preset_prompts') ?? false;

  return enqueueOperation(
    OperationType.VALIDATE_RECAP,
    { recap, type },
    {
      priority: options.priority ?? MAX_RECAP_ATTEMPTS, // Medium priority - nice-to-have enhancement
      dependencies: options.dependencies ?? [],
      metadata: {
        validation_type: type,
        hasPrefill: false, // Validation operations don't use prefills
        includePresetPrompts,
        ...options.metadata
      }
    }
  );
}

export function queueDetectSceneBreak(index , options  = {}) {
  return enqueueOperation(
    OperationType.DETECT_SCENE_BREAK,
    { index },
    {
      priority: options.priority ?? HIGH_PRIORITY_OFFSET, // Lowest priority - detection can wait for important operations
      dependencies: options.dependencies ?? [],
      metadata: {
        message_index: index,
        ...options.metadata
      }
    }
  );
}

export function queueDetectSceneBreaks(indexes , options  = {}) {
  return indexes.map((index) => queueDetectSceneBreak(index, options));
}

export function queueGenerateSceneRecap(index , options  = {}) {
  // Capture settings at enqueue time for tooltip display
  const includePresetPrompts = get_settings('scene_recap_include_preset_prompts') ?? false;

  return enqueueOperation(
    OperationType.GENERATE_SCENE_RECAP,
    { index },
    {
      priority: options.priority ?? 0,
      dependencies: options.dependencies ?? [],
      metadata: {
        scene_index: index,
        hasPrefill: false, // Scene recap operations don't use prefills
        includePresetPrompts,
        ...options.metadata
      }
    }
  );
}

export function queueGenerateRunningRecap(options  = {}) {
  // Capture settings at enqueue time for tooltip display
  const includePresetPrompts = get_settings('running_scene_recap_include_preset_prompts') ?? false;

  return enqueueOperation(
    OperationType.GENERATE_RUNNING_RECAP,
    {},
    {
      priority: options.priority ?? RUNNING_RECAP_PRIORITY,
      dependencies: options.dependencies ?? [],
      metadata: {
        hasPrefill: false, // Running recap operations don't use prefills
        includePresetPrompts,
        ...options.metadata
      }
    }
  );
}

export function queueCombineSceneWithRunning(index , options  = {}) {
  return enqueueOperation(
    OperationType.COMBINE_SCENE_WITH_RUNNING,
    { index },
    {
      priority: options.priority ?? RUNNING_RECAP_PRIORITY,
      dependencies: options.dependencies ?? [],
      metadata: {
        scene_index: index,
        ...options.metadata
      }
    }
  );
}

function validateQueueStatus() {
  return true;
}

function extractEntryName(entryData ) {
  return String(entryData.name || entryData.comment || 'Unknown').toLowerCase().trim();
}

async function cancelSupersededOperations(lowerName , messageIndex , recapHash ) {
  if (!recapHash) {return;}

  try {
    const ops = getAllOperations();
    for (const op of ops) {
      if (op.type !== OperationType.LOREBOOK_ENTRY_LOOKUP) {continue;}
      if (op.status !== OperationStatus.PENDING) {continue;}
      const metaName = String(op?.metadata?.entry_name || '').toLowerCase().trim();
      if (metaName !== lowerName) {continue;}
      if (op?.metadata?.message_index !== messageIndex) {continue;}
      const opHash = op.metadata?.recap_hash || null;
      if (opHash && opHash === recapHash) {continue;}
      // Sequential execution required: operations must be updated in order
      // eslint-disable-next-line no-await-in-loop -- Operations must be updated sequentially to maintain queue state
      await updateOperationStatus(op.id, OperationStatus.CANCELLED, 'Replaced by newer recap version');
    }
  } catch {/* best effort dedup */}
}

function hasActiveDuplicate(lowerName , messageIndex , recapHash ) {
  try {
    const ops = getAllOperations();
    return ops.some((op) => {
      const status = op.status;
      const active = status === 'pending' || status === 'in_progress';
      if (!active) {return false;}

      if (op.type === OperationType.LOREBOOK_ENTRY_LOOKUP) {
        const metaName = String(op?.metadata?.entry_name || '').toLowerCase().trim();
        const sameMsg = op?.metadata?.message_index === messageIndex;
        if (!sameMsg || metaName !== lowerName) {return false;}
        const opHash = op.metadata?.recap_hash || null;
        if (recapHash && opHash && opHash !== recapHash) {return false;}
        return true;
      }

      return false;
    });
  } catch {
    return false;
  }
}

async function prepareLorebookEntryLookupContext(entryData ) {
  const { generateEntryId, createPendingEntry } = await import('./lorebookPendingOps.js');
  const { ensureRegistryState, buildRegistryListing, normalizeEntryData } = await import('./recapToLorebookProcessor.js');
  const { getConfiguredEntityTypeDefinitions } = await import('./entityTypes.js');

  const entryId = generateEntryId();
  const normalizedEntry = normalizeEntryData(entryData);
  createPendingEntry(entryId, normalizedEntry);

  const registryState = ensureRegistryState();
  const registryListing = buildRegistryListing(registryState);
  const entityTypeDefs = getConfiguredEntityTypeDefinitions(get_settings('autoLorebooks')?.entity_types);
  const typeList = entityTypeDefs.map((def) => def.name).filter(Boolean).join('|') || 'character';

  return { entryId, normalizedEntry, registryListing, typeList };
}

function enqueueLorebookEntryLookupOperation(
context ,
entryName ,
messageIndex ,
recapHash ,
options )
{
  // Capture settings at enqueue time for tooltip display
  const prefill = get_settings('auto_lorebooks_recap_lorebook_entry_lookup_prefill') || '';
  const includePresetPrompts = get_settings('auto_lorebooks_recap_lorebook_entry_lookup_include_preset_prompts') ?? false;

  return enqueueOperation(
    OperationType.LOREBOOK_ENTRY_LOOKUP,
    { entryId: context.entryId, entryData: context.normalizedEntry, registryListing: context.registryListing, typeList: context.typeList },
    {
      priority: options.priority ?? OPERATION_ID_LENGTH, // First stage of lorebook pipeline - lowest in group
      dependencies: options.dependencies ?? [],
      metadata: {
        entry_name: entryName,
        entry_comment: context.normalizedEntry.comment,
        message_index: messageIndex,
        recap_hash: recapHash || null,
        hasPrefill: Boolean(prefill && prefill.trim().length > 0),
        includePresetPrompts,
        ...options.metadata
      }
    }
  );
}

export async function queueProcessLorebookEntry(entryData , messageIndex , recapHash , options  = {}) {
  const entryName = entryData.name || entryData.comment || 'Unknown';
  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Called for entry: ${entryName}, messageIndex: ${messageIndex}, recapHash: ${recapHash || 'none'}`);

  if (!validateQueueStatus()) {
    debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Queue validation failed - queue not enabled or not ready`);
    return null;
  }

  const lowerName = extractEntryName(entryData);
  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Extracted name: ${lowerName}, queueing lorebook entry (new pipeline): ${entryName} from message ${messageIndex}`);

  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Checking for superseded operations...`);
  await cancelSupersededOperations(lowerName, messageIndex, recapHash);

  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Checking for active duplicates...`);
  if (hasActiveDuplicate(lowerName, messageIndex, recapHash)) {
    debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] ✗ Skipping duplicate lorebook op for: ${entryName}`);
    return null;
  }

  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Preparing lookup context...`);
  const context = await prepareLorebookEntryLookupContext(entryData);

  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Enqueueing LOREBOOK_ENTRY_LOOKUP operation...`);
  const opId = await enqueueLorebookEntryLookupOperation(context, entryName, messageIndex, recapHash, options);
  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] ${opId ? '✓' : '✗'} Operation ${opId ? 'enqueued with ID: ' + opId : 'failed to enqueue'}`);
  return opId;
}

export default {
  queueValidateRecap,
  queueDetectSceneBreak,
  queueDetectSceneBreaks,
  queueGenerateSceneRecap,
  queueGenerateRunningRecap,
  queueCombineSceneWithRunning,
  queueProcessLorebookEntry
};

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

/**
 * Queue a summary validation operation
 * @param {string} summary - Summary text to validate
 * @param {string} type - Validation type ('regular' or 'scene')
 * @param {object} options - Additional options
 * @returns {Promise<string>} Operation ID
 */
export async function queueValidateSummary(summary , type , options  = {}) {
  return await enqueueOperation(
    OperationType.VALIDATE_SUMMARY,
    { summary, type },
    {
      priority: options.priority ?? 5, // Medium priority - nice-to-have enhancement
      dependencies: options.dependencies ?? [],
      metadata: {
        validation_type: type,
        ...options.metadata
      }
    }
  );
}

/**
 * Queue a scene break detection operation
 * @param {number} index - Message index
 * @param {object} options - Additional options
 * @returns {Promise<string>} Operation ID
 */
export async function queueDetectSceneBreak(index , options  = {}) {
  return await enqueueOperation(
    OperationType.DETECT_SCENE_BREAK,
    { index },
    {
      priority: options.priority ?? -10, // Lowest priority - detection can wait for important operations
      dependencies: options.dependencies ?? [],
      metadata: {
        message_index: index,
        ...options.metadata
      }
    }
  );
}

/**
 * Queue multiple scene break detection operations
 * @param {Array<number>} indexes - Array of message indexes
 * @param {object} options - Additional options
 * @returns {Promise<Array<string>>} Array of operation IDs
 */
export async function queueDetectSceneBreaks(indexes , options  = {}) {
  return await Promise.all(indexes.map((index) => queueDetectSceneBreak(index, options)));
}

/**
 * Queue a scene summary generation operation
 * @param {number} index - Scene break message index
 * @param {object} options - Additional options
 * @returns {Promise<string>} Operation ID
 */
export async function queueGenerateSceneSummary(index , options  = {}) {
  return await enqueueOperation(
    OperationType.GENERATE_SCENE_SUMMARY,
    { index },
    {
      priority: options.priority ?? 0,
      dependencies: options.dependencies ?? [],
      metadata: {
        scene_index: index,
        ...options.metadata
      }
    }
  );
}

/**
 * Queue a running summary generation operation (bulk)
 * @param {object} options - Additional options
 * @returns {Promise<string>} Operation ID
 */
export async function queueGenerateRunningSummary(options  = {}) {
  return await enqueueOperation(
    OperationType.GENERATE_RUNNING_SUMMARY,
    {},
    {
      priority: options.priority ?? 15, // High priority - important narrative synthesis
      dependencies: options.dependencies ?? [],
      metadata: {
        ...options.metadata
      }
    }
  );
}

/**
 * Queue combining a scene with running summary
 * @param {number} index - Scene index to combine
 * @param {object} options - Additional options
 * @returns {Promise<string>} Operation ID
 */
export async function queueCombineSceneWithRunning(index , options  = {}) {
  return await enqueueOperation(
    OperationType.COMBINE_SCENE_WITH_RUNNING,
    { index },
    {
      priority: options.priority ?? 15, // High priority - important narrative synthesis
      dependencies: options.dependencies ?? [],
      metadata: {
        scene_index: index,
        ...options.metadata
      }
    }
  );
}

/**
 * Queue is mandatory for this extension.
 * Always returns true. Fallback to direct execution happens only
 * when enqueueing fails at runtime (e.g., no lorebook attached during init).
 */
function validateQueueStatus() {
  return true;
}

/**
 * Extracts and normalizes entry name
 * @param {any} entryData - Entry data
 * @returns {string} - Normalized entry name
 */
function extractEntryName(entryData ) {
  return String(entryData.name || entryData.comment || 'Unknown').toLowerCase().trim();
}

/**
 * Cancels operations superseded by newer summary versions
 * @param {string} lowerName - Normalized entry name
 * @param {number} messageIndex - Message index
 * @param {string|null} summaryHash - Current summary hash
 * @returns {Promise<void>}
 */
async function cancelSupersededOperations(lowerName , messageIndex , summaryHash ) {
  if (!summaryHash) return;

  try {
    const ops = getAllOperations();
    for (const op of ops) {
      if (op.type !== OperationType.LOREBOOK_ENTRY_LOOKUP) continue;
      if (op.status !== OperationStatus.PENDING) continue;
      const metaName = String(op?.metadata?.entry_name || '').toLowerCase().trim();
      if (metaName !== lowerName) continue;
      if (op?.metadata?.message_index !== messageIndex) continue;
      const opHash = op.metadata?.summary_hash || null;
      if (opHash && opHash === summaryHash) continue;
      // Sequential execution required: operations must be updated in order
      // eslint-disable-next-line no-await-in-loop
      await updateOperationStatus(op.id, OperationStatus.CANCELLED, 'Replaced by newer summary version');
    }
  } catch {/* best effort dedup */}
}

/**
 * Checks for active duplicate operations
 * @param {string} lowerName - Normalized entry name
 * @param {number} messageIndex - Message index
 * @param {string|null} summaryHash - Current summary hash
 * @returns {boolean} - Whether duplicate exists
 */
function hasActiveDuplicate(lowerName , messageIndex , summaryHash ) {
  try {
    const ops = getAllOperations();
    return ops.some((op) => {
      const status = op.status;
      const active = status === 'pending' || status === 'in_progress';
      if (!active) return false;

      if (op.type === OperationType.LOREBOOK_ENTRY_LOOKUP) {
        const metaName = String(op?.metadata?.entry_name || '').toLowerCase().trim();
        const sameMsg = op?.metadata?.message_index === messageIndex;
        if (!sameMsg || metaName !== lowerName) return false;
        const opHash = op.metadata?.summary_hash || null;
        if (summaryHash && opHash && opHash !== summaryHash) return false;
        return true;
      }

      return false;
    });
  } catch {
    return false;
  }
}

/**
 * Prepares lorebook entry lookup context
 * @param {any} entryData - Entry data
 * @returns {Promise<any>} - Context object
 */
async function prepareLorebookEntryLookupContext(entryData ) {
  const { generateEntryId, createPendingEntry } = await import('./lorebookPendingOps.js');
  const { ensureRegistryState, buildRegistryListing, normalizeEntryData } = await import('./summaryToLorebookProcessor.js');
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

/**
 * Enqueues lorebook entry lookup operation
 * @param {any} context - Lorebook entry lookup context
 * @param {string} entryName - Entry name
 * @param {number} messageIndex - Message index
 * @param {string|null} summaryHash - Summary hash
 * @param {any} options - Queueing options
 * @returns {Promise<string|null>} - Operation ID
 */
async function enqueueLorebookEntryLookupOperation(
context ,
entryName ,
messageIndex ,
summaryHash ,
options )
{
  return await enqueueOperation(
    OperationType.LOREBOOK_ENTRY_LOOKUP,
    { entryId: context.entryId, entryData: context.normalizedEntry, registryListing: context.registryListing, typeList: context.typeList },
    {
      priority: options.priority ?? 11, // First stage of lorebook pipeline - lowest in group
      dependencies: options.dependencies ?? [],
      metadata: {
        entry_name: entryName,
        entry_comment: context.normalizedEntry.comment,
        message_index: messageIndex,
        summary_hash: summaryHash || null,
        ...options.metadata
      }
    }
  );
}

/**
 * Queue processing of a single lorebook entry using multi-operation pipeline
 * @param {Object} entryData - Lorebook entry data {name, type, keywords, content}
 * @param {number} messageIndex - Message index this entry came from
 * @param {?string} summaryHash - Hash of the summary version that produced this entry
 * @param {Object} options - Queue options
 * @returns {Promise<string|null>} Operation ID or null if queue disabled
 */
export async function queueProcessLorebookEntry(entryData , messageIndex , summaryHash , options  = {}) {
  const entryName = entryData.name || entryData.comment || 'Unknown';
  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Called for entry: ${entryName}, messageIndex: ${messageIndex}, summaryHash: ${summaryHash || 'none'}`);

  if (!validateQueueStatus()) {
    debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Queue validation failed - queue not enabled or not ready`);
    return null;
  }

  const lowerName = extractEntryName(entryData);
  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Extracted name: ${lowerName}, queueing lorebook entry (new pipeline): ${entryName} from message ${messageIndex}`);

  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Checking for superseded operations...`);
  await cancelSupersededOperations(lowerName, messageIndex, summaryHash);

  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Checking for active duplicates...`);
  if (hasActiveDuplicate(lowerName, messageIndex, summaryHash)) {
    debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] ✗ Skipping duplicate lorebook op for: ${entryName}`);
    return null;
  }

  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Preparing lookup context...`);
  const context = await prepareLorebookEntryLookupContext(entryData);

  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] Enqueueing LOREBOOK_ENTRY_LOOKUP operation...`);
  const opId = await enqueueLorebookEntryLookupOperation(context, entryName, messageIndex, summaryHash, options);
  debug(SUBSYSTEM.QUEUE, `[QUEUE LOREBOOK] ${opId ? '✓' : '✗'} Operation ${opId ? 'enqueued with ID: ' + opId : 'failed to enqueue'}`);
  return opId;
}

export default {
  queueValidateSummary,
  queueDetectSceneBreak,
  queueDetectSceneBreaks,
  queueGenerateSceneSummary,
  queueGenerateRunningSummary,
  queueCombineSceneWithRunning,
  queueProcessLorebookEntry
};
// @flow
// queueIntegration.js - Helper functions to queue operations instead of executing immediately

import {
    enqueueOperation,
    OperationType,
    getAllOperations,
    updateOperationStatus,
    OperationStatus,
} from './operationQueue.js';
import {
    get_settings,
    debug,
    SUBSYSTEM,
} from './index.js';

/**
 * Check if queueing is enabled
 */
function isQueueEnabled() {
    return get_settings('operation_queue_enabled') !== false;
}

/**
 * Queue a message summarization operation
 * @param {number} index - Message index
 * @param {object} options - Additional options (priority, dependencies, etc.)
 * @returns {Promise<string>} Operation ID
 */
export async function queueSummarizeMessage(index /*: number */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<?string> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue summarization');
        return null;
    }

    return await enqueueOperation(
        OperationType.SUMMARIZE_MESSAGE,
        { index },
        {
            priority: options.priority ?? 0,
            dependencies: options.dependencies ?? [],
            metadata: {
                message_index: index,
                ...options.metadata
            }
        }
    );
}

/**
 * Queue multiple message summarization operations
 * @param {Array<number>} indexes - Array of message indexes
 * @param {object} options - Additional options
 * @returns {Promise<Array<string>>} Array of operation IDs
 */
export async function queueSummarizeMessages(indexes /*: Array<number> */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<Array<?string>> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue batch summarization');
        return [];
    }

    return await Promise.all(indexes.map(index => queueSummarizeMessage(index, options)));
}

/**
 * Queue a summary validation operation
 * @param {string} summary - Summary text to validate
 * @param {string} type - Validation type ('regular' or 'scene')
 * @param {object} options - Additional options
 * @returns {Promise<string>} Operation ID
 */
export async function queueValidateSummary(summary /*: string */, type /*: string */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<?string> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue validation');
        return null;
    }

    return await enqueueOperation(
        OperationType.VALIDATE_SUMMARY,
        { summary, type },
        {
            priority: options.priority ?? 1, // Higher priority for validation
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
export async function queueDetectSceneBreak(index /*: number */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<?string> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue scene break detection');
        return null;
    }

    return await enqueueOperation(
        OperationType.DETECT_SCENE_BREAK,
        { index },
        {
            priority: options.priority ?? 0,
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
export async function queueDetectSceneBreaks(indexes /*: Array<number> */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<Array<?string>> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue batch scene detection');
        return [];
    }

    return await Promise.all(indexes.map(index => queueDetectSceneBreak(index, options)));
}

/**
 * Queue a scene summary generation operation
 * @param {number} index - Scene break message index
 * @param {object} options - Additional options
 * @returns {Promise<string>} Operation ID
 */
export async function queueGenerateSceneSummary(index /*: number */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<?string> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue scene summary generation');
        return null;
    }

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
export async function queueGenerateRunningSummary(options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<?string> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue running summary generation');
        return null;
    }

    return await enqueueOperation(
        OperationType.GENERATE_RUNNING_SUMMARY,
        {},
        {
            priority: options.priority ?? 0,
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
export async function queueCombineSceneWithRunning(index /*: number */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<?string> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue scene combination');
        return null;
    }

    return await enqueueOperation(
        OperationType.COMBINE_SCENE_WITH_RUNNING,
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
 * Queue processing of a single lorebook entry using multi-operation pipeline
 * @param {Object} entryData - Lorebook entry data {name, type, keywords, content}
 * @param {number} messageIndex - Message index this entry came from
 * @param {?string} summaryHash - Hash of the summary version that produced this entry
 * @param {Object} options - Queue options
 * @returns {Promise<string|null>} Operation ID or null if queue disabled
 */
export async function queueProcessLorebookEntry(entryData /*: Object */, messageIndex /*: number */, summaryHash /*: ?string */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<?string> */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue lorebook entry processing');
        return null;
    }

    const entryName = entryData.name || entryData.comment || 'Unknown';
    const lowerName = String(entryName).toLowerCase().trim();
    debug(SUBSYSTEM.QUEUE, `Queueing lorebook entry (new pipeline): ${entryName} from message ${messageIndex}`);

    // De-duplicate: if there is already a pending or in-progress operation for the same entry
    // Check for TRIAGE_LOREBOOK_ENTRY operations (the new pipeline starts with triage)
    let ops /*: Array<any> */ = [];
    try {
        ops = getAllOperations();

        // Cancel pending triage operations for this message/entry produced by older summary versions
        if (summaryHash) {
            for (const op of ops) {
                if (op.type !== OperationType.TRIAGE_LOREBOOK_ENTRY) continue;
                if (op.status !== OperationStatus.PENDING) continue;
                const metaName = String(op?.metadata?.entry_name || '').toLowerCase().trim();
                if (metaName !== lowerName) continue;
                if (op?.metadata?.message_index !== messageIndex) continue;
                const opHash = op.metadata?.summary_hash || null;
                if (opHash && opHash === summaryHash) continue;
                await updateOperationStatus(op.id, OperationStatus.CANCELLED, 'Replaced by newer summary version');
            }
        }

        // Check for duplicates - look for any active triage operations for the same entry
        const hasDuplicate = ops.some(op => {
            const status = op.status;
            const active = status === 'pending' || status === 'in_progress';
            if (!active) return false;

            if (op.type === OperationType.TRIAGE_LOREBOOK_ENTRY) {
                const metaName = String(op?.metadata?.entry_name || '').toLowerCase().trim();
                const sameMsg = op?.metadata?.message_index === messageIndex;
                if (!sameMsg || metaName !== lowerName) return false;
                const opHash = op.metadata?.summary_hash || null;
                if (summaryHash && opHash && opHash !== summaryHash) return false;
                return true;
            }

            return false;
        });

        if (hasDuplicate) {
            debug(SUBSYSTEM.QUEUE, `Skipping duplicate lorebook op for: ${entryName}`);
            return null;
        }
    } catch { /* best effort dedup */ }

    // Import pending ops helpers and processor functions
    const { generateEntryId, createPendingEntry } = await import('./lorebookPendingOps.js');
    const { ensureRegistryState, buildRegistryListing, normalizeEntryData } = await import('./summaryToLorebookProcessor.js');
    const { getConfiguredEntityTypeDefinitions } = await import('./entityTypes.js');

    // Generate unique entry ID
    const entryId = generateEntryId();

    // Normalize and store entry data in pending ops
    const normalizedEntry = normalizeEntryData(entryData);
    createPendingEntry(entryId, normalizedEntry);

    // Build registry listing and type list for triage
    const registryState = ensureRegistryState();
    const registryListing = buildRegistryListing(registryState);
    const entityTypeDefs = getConfiguredEntityTypeDefinitions(get_settings('autoLorebooks')?.entity_types);
    const typeList = entityTypeDefs.map(def => def.name).filter(Boolean).join('|') || 'character';

    // Enqueue TRIAGE operation (first stage of pipeline)
    return await enqueueOperation(
        OperationType.TRIAGE_LOREBOOK_ENTRY,
        { entryId, entryData: normalizedEntry, registryListing, typeList },
        {
            priority: options.priority ?? 0,
            dependencies: options.dependencies ?? [],
            metadata: {
                entry_name: entryName,
                entry_comment: normalizedEntry.comment,
                message_index: messageIndex,
                summary_hash: summaryHash || null,
                ...options.metadata
            }
        }
    );
}

export default {
    queueSummarizeMessage,
    queueSummarizeMessages,
    queueValidateSummary,
    queueDetectSceneBreak,
    queueDetectSceneBreaks,
    queueGenerateSceneSummary,
    queueGenerateRunningSummary,
    queueCombineSceneWithRunning,
    queueProcessLorebookEntry,
};

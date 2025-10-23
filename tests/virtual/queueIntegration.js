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
 * Validates queue status
 * @returns {boolean} - Whether queue is enabled
 */
function validateQueueStatus() /*: boolean */ {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue lorebook entry processing');
        return false;
    }
    return true;
}

/**
 * Extracts and normalizes entry name
 * @param {any} entryData - Entry data
 * @returns {string} - Normalized entry name
 */
function extractEntryName(entryData /*: any */) /*: string */ {
    return String(entryData.name || entryData.comment || 'Unknown').toLowerCase().trim();
}

/**
 * Cancels operations superseded by newer summary versions
 * @param {string} lowerName - Normalized entry name
 * @param {number} messageIndex - Message index
 * @param {string|null} summaryHash - Current summary hash
 * @returns {Promise<void>}
 */
async function cancelSupersededOperations(lowerName /*: string */, messageIndex /*: number */, summaryHash /*: ?string */) /*: Promise<void> */ {
    if (!summaryHash) return;

    try {
        const ops = getAllOperations();
        for (const op of ops) {
            if (op.type !== OperationType.TRIAGE_LOREBOOK_ENTRY) continue;
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
    } catch { /* best effort dedup */ }
}

/**
 * Checks for active duplicate operations
 * @param {string} lowerName - Normalized entry name
 * @param {number} messageIndex - Message index
 * @param {string|null} summaryHash - Current summary hash
 * @returns {boolean} - Whether duplicate exists
 */
function hasActiveDuplicate(lowerName /*: string */, messageIndex /*: number */, summaryHash /*: ?string */) /*: boolean */ {
    try {
        const ops = getAllOperations();
        return ops.some(op => {
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
    } catch {
        return false;
    }
}

/**
 * Prepares triage context
 * @param {any} entryData - Entry data
 * @returns {Promise<any>} - Context object
 */
async function prepareTriageContext(entryData /*: any */) /*: Promise<any> */ {
    const { generateEntryId, createPendingEntry } = await import('./lorebookPendingOps.js');
    const { ensureRegistryState, buildRegistryListing, normalizeEntryData } = await import('./summaryToLorebookProcessor.js');
    const { getConfiguredEntityTypeDefinitions } = await import('./entityTypes.js');

    const entryId = generateEntryId();
    const normalizedEntry = normalizeEntryData(entryData);
    createPendingEntry(entryId, normalizedEntry);

    const registryState = ensureRegistryState();
    const registryListing = buildRegistryListing(registryState);
    const entityTypeDefs = getConfiguredEntityTypeDefinitions(get_settings('autoLorebooks')?.entity_types);
    const typeList = entityTypeDefs.map(def => def.name).filter(Boolean).join('|') || 'character';

    return { entryId, normalizedEntry, registryListing, typeList };
}

/**
 * Enqueues triage operation
 * @param {any} context - Triage context
 * @param {string} entryName - Entry name
 * @param {number} messageIndex - Message index
 * @param {string|null} summaryHash - Summary hash
 * @param {any} options - Queueing options
 * @returns {Promise<string|null>} - Operation ID
 */
async function enqueueTriageOperation(
    context /*: any */,
    entryName /*: string */,
    messageIndex /*: number */,
    summaryHash /*: ?string */,
    options /*: any */
) /*: Promise<?string> */ {
    return await enqueueOperation(
        OperationType.TRIAGE_LOREBOOK_ENTRY,
        { entryId: context.entryId, entryData: context.normalizedEntry, registryListing: context.registryListing, typeList: context.typeList },
        {
            priority: options.priority ?? 0,
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
export async function queueProcessLorebookEntry(entryData /*: Object */, messageIndex /*: number */, summaryHash /*: ?string */, options /*: {priority?: number, dependencies?: Array<string>, metadata?: Object} */ = {}) /*: Promise<?string> */ {
    if (!validateQueueStatus()) {
        return null;
    }

    const entryName = entryData.name || entryData.comment || 'Unknown';
    const lowerName = extractEntryName(entryData);
    debug(SUBSYSTEM.QUEUE, `Queueing lorebook entry (new pipeline): ${entryName} from message ${messageIndex}`);

    await cancelSupersededOperations(lowerName, messageIndex, summaryHash);

    if (hasActiveDuplicate(lowerName, messageIndex, summaryHash)) {
        debug(SUBSYSTEM.QUEUE, `Skipping duplicate lorebook op for: ${entryName}`);
        return null;
    }

    const context = await prepareTriageContext(entryData);

    return await enqueueTriageOperation(context, entryName, messageIndex, summaryHash, options);
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

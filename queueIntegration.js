// @flow
// queueIntegration.js - Helper functions to queue operations instead of executing immediately

import {
    enqueueOperation,
    OperationType,
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
 * @returns {string} Operation ID
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
export function queueSummarizeMessage(index: any, options: any = {}) {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue summarization');
        return null;
    }

    return enqueueOperation(
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
 * @returns {Array<string>} Array of operation IDs
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
export function queueSummarizeMessages(indexes: any, options: any = {}) {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue batch summarization');
        return [];
    }

    return indexes.map(index => queueSummarizeMessage(index, options));
}

/**
 * Queue a summary validation operation
 * @param {string} summary - Summary text to validate
 * @param {string} type - Validation type ('regular' or 'scene')
 * @param {object} options - Additional options
 * @returns {string} Operation ID
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
export function queueValidateSummary(summary: any, type: any, options: any = {}) {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue validation');
        return null;
    }

    return enqueueOperation(
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
 * @returns {string} Operation ID
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
export function queueDetectSceneBreak(index: any, options: any = {}) {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue scene break detection');
        return null;
    }

    return enqueueOperation(
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
 * @returns {Array<string>} Array of operation IDs
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
export function queueDetectSceneBreaks(indexes: any, options: any = {}) {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue batch scene detection');
        return [];
    }

    return indexes.map(index => queueDetectSceneBreak(index, options));
}

/**
 * Queue a scene summary generation operation
 * @param {number} index - Scene break message index
 * @param {object} options - Additional options
 * @returns {string} Operation ID
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
export function queueGenerateSceneSummary(index: any, options: any = {}) {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue scene summary generation');
        return null;
    }

    return enqueueOperation(
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
 * @returns {string} Operation ID
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
export function queueGenerateRunningSummary(options: any = {}) {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue running summary generation');
        return null;
    }

    return enqueueOperation(
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
 * @returns {string} Operation ID
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
export function queueCombineSceneWithRunning(index: any, options: any = {}) {
    if (!isQueueEnabled()) {
        debug(SUBSYSTEM.QUEUE, 'Queue disabled, cannot queue scene combination');
        return null;
    }

    return enqueueOperation(
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

export default {
    queueSummarizeMessage,
    queueSummarizeMessages,
    queueValidateSummary,
    queueDetectSceneBreak,
    queueDetectSceneBreaks,
    queueGenerateSceneSummary,
    queueGenerateRunningSummary,
    queueCombineSceneWithRunning,
};

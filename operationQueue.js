// operationQueue.js - Persistent operation queue using shared lorebook entry storage

import {
    getContext,
    chat_metadata,
    debug,
    log,
    error,
    toast,
    get_settings,
    SUBSYSTEM,
} from './index.js';

import {
    loadWorldInfo,
    saveWorldInfo,
    createWorldInfoEntry,
    METADATA_KEY
} from '../../../world-info.js';

// Queue entry name in lorebook - NEVER ACTIVE (disabled, used only for persistence)
const QUEUE_ENTRY_NAME = '__operation_queue';

// Operation status constants
export const OperationStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

// Operation type constants
export const OperationType = {
    SUMMARIZE_MESSAGE: 'summarize_message',
    VALIDATE_SUMMARY: 'validate_summary',
    DETECT_SCENE_BREAK: 'detect_scene_break',
    GENERATE_SCENE_SUMMARY: 'generate_scene_summary',
    GENERATE_SCENE_NAME: 'generate_scene_name',
    GENERATE_RUNNING_SUMMARY: 'generate_running_summary',
    COMBINE_SCENE_WITH_RUNNING: 'combine_scene_with_running',
    GENERATE_COMBINED_SUMMARY: 'generate_combined_summary',
};

// Module state
let isInitialized = false;
let currentQueue = null;
let queueProcessor = null;
let uiUpdateCallback = null;

/**
 * Initialize the operation queue system
 */
export async function initOperationQueue() {
    if (isInitialized) {
        debug(SUBSYSTEM.QUEUE, 'Operation queue already initialized');
        return;
    }

    debug(SUBSYSTEM.QUEUE, 'Initializing operation queue system');

    // Load queue from storage
    await loadQueue();

    isInitialized = true;
    log(SUBSYSTEM.QUEUE, 'Operation queue system initialized');
}

/**
 * Get attached lorebook name
 */
function getAttachedLorebook() {
    return chat_metadata?.[METADATA_KEY];
}

/**
 * Get or create the __operation_queue lorebook entry
 * Returns the entry object or null if lorebook not available
 */
async function getQueueEntry() {
    const lorebookName = getAttachedLorebook();
    if (!lorebookName) {
        debug(SUBSYSTEM.QUEUE, 'No lorebook attached, cannot access queue entry');
        return null;
    }

    // Load the lorebook
    const worldInfo = await loadWorldInfo(lorebookName);
    if (!worldInfo) {
        error(SUBSYSTEM.QUEUE, 'Failed to load lorebook:', lorebookName);
        return null;
    }

    // Find the queue entry
    let queueEntry = worldInfo.entries.find(e => e.comment === QUEUE_ENTRY_NAME);

    // Create the queue entry if it doesn't exist
    if (!queueEntry) {
        debug(SUBSYSTEM.QUEUE, 'Creating __operation_queue lorebook entry');
        const emptyQueue = {
            queue: [],
            current_operation_id: null,
            paused: false,
            version: 1
        };

        queueEntry = createWorldInfoEntry(lorebookName, {
            key: [],
            keysecondary: [],
            content: JSON.stringify(emptyQueue, null, 2),
            comment: QUEUE_ENTRY_NAME,
            constant: false,
            disable: true,  // Never inject into context
            excludeRecursion: true,  // Never trigger other entries
            order: 9999,  // Low priority
            position: 0,
            depth: 0
        });

        if (!queueEntry) {
            error(SUBSYSTEM.QUEUE, 'Failed to create queue entry');
            return null;
        }

        // Save the lorebook with new entry
        await saveWorldInfo(lorebookName, worldInfo);
        debug(SUBSYSTEM.QUEUE, 'Created queue entry with UID:', queueEntry.uid);
    }

    return queueEntry;
}

/**
 * Load queue from lorebook entry
 */
async function loadQueue() {
    try {
        const queueEntry = await getQueueEntry();

        if (!queueEntry) {
            debug(SUBSYSTEM.QUEUE, 'No queue entry available, using default empty queue');
            currentQueue = {
                queue: [],
                current_operation_id: null,
                paused: false,
                version: 1
            };
            return;
        }

        // Parse queue from entry content
        try {
            currentQueue = JSON.parse(queueEntry.content || '{}');
            if (!currentQueue.queue) {
                currentQueue.queue = [];
            }
            if (currentQueue.version === undefined) {
                currentQueue.version = 1;
            }
        } catch (parseErr) {
            error(SUBSYSTEM.QUEUE, 'Failed to parse queue entry content:', parseErr);
            currentQueue = {
                queue: [],
                current_operation_id: null,
                paused: false,
                version: 1
            };
        }

        debug(SUBSYSTEM.QUEUE, `Loaded queue with ${currentQueue.queue.length} operations`);

        // Clean up any stale in_progress operations (from crashes/restarts)
        let cleanedCount = 0;
        for (const op of currentQueue.queue) {
            if (op.status === OperationStatus.IN_PROGRESS) {
                op.status = OperationStatus.PENDING;
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            debug(SUBSYSTEM.QUEUE, `Cleaned ${cleanedCount} stale in_progress operations`);
            await saveQueue();
        }

        notifyUIUpdate();
    } catch (err) {
        error(SUBSYSTEM.QUEUE, 'Failed to load queue:', err);
        currentQueue = {
            queue: [],
            current_operation_id: null,
            paused: false,
            version: 1
        };
    }
}

/**
 * Save queue to lorebook entry
 */
async function saveQueue() {
    try {
        const lorebookName = getAttachedLorebook();
        if (!lorebookName) {
            debug(SUBSYSTEM.QUEUE, 'No lorebook attached, cannot save');
            return;
        }

        const worldInfo = await loadWorldInfo(lorebookName);
        if (!worldInfo) {
            error(SUBSYSTEM.QUEUE, 'Failed to load lorebook:', lorebookName);
            return;
        }

        // Find and update the queue entry
        const queueEntry = worldInfo.entries.find(e => e.comment === QUEUE_ENTRY_NAME);
        if (!queueEntry) {
            error(SUBSYSTEM.QUEUE, 'Queue entry not found, cannot save');
            return;
        }

        // Update the entry content
        queueEntry.content = JSON.stringify(currentQueue, null, 2);

        // Save the lorebook
        await saveWorldInfo(lorebookName, worldInfo);

        debug(SUBSYSTEM.QUEUE, 'Saved queue to lorebook entry');
        notifyUIUpdate();
    } catch (err) {
        error(SUBSYSTEM.QUEUE, 'Failed to save queue:', err);
    }
}

/**
 * Generate unique operation ID
 */
function generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add operation to queue
 * @param {string} type - Operation type from OperationType
 * @param {object} params - Operation parameters
 * @param {object} options - Optional settings (priority, dependencies, etc.)
 * @returns {string} Operation ID
 */
export async function enqueueOperation(type, params, options = {}) {
    if (!isInitialized) {
        await initOperationQueue();
    }

    const operation = {
        id: generateOperationId(),
        type: type,
        params: params,
        status: OperationStatus.PENDING,
        created_at: Date.now(),
        started_at: null,
        completed_at: null,
        error: null,
        retries: 0,
        max_retries: options.max_retries ?? 3,
        priority: options.priority ?? 0,
        dependencies: options.dependencies ?? [],
        metadata: options.metadata ?? {}
    };

    currentQueue.queue.push(operation);
    await saveQueue();

    debug(SUBSYSTEM.QUEUE, `Enqueued ${type} operation:`, operation.id);

    // Auto-start processing if not paused
    if (!currentQueue.paused && !queueProcessor) {
        startQueueProcessor();
    }

    return operation.id;
}

/**
 * Get operation by ID
 */
export function getOperation(operationId) {
    return currentQueue.queue.find(op => op.id === operationId);
}

/**
 * Get all operations
 */
export function getAllOperations() {
    return [...currentQueue.queue];
}

/**
 * Get pending operations
 */
export function getPendingOperations() {
    return currentQueue.queue.filter(op => op.status === OperationStatus.PENDING);
}

/**
 * Get in-progress operations
 */
export function getInProgressOperations() {
    return currentQueue.queue.filter(op => op.status === OperationStatus.IN_PROGRESS);
}

/**
 * Get completed operations
 */
export function getCompletedOperations() {
    return currentQueue.queue.filter(op => op.status === OperationStatus.COMPLETED);
}

/**
 * Get failed operations
 */
export function getFailedOperations() {
    return currentQueue.queue.filter(op => op.status === OperationStatus.FAILED);
}

/**
 * Update operation status
 */
export async function updateOperationStatus(operationId, status, errorMsg = null) {
    const operation = getOperation(operationId);
    if (!operation) {
        error(SUBSYSTEM.QUEUE, `Operation ${operationId} not found`);
        return;
    }

    operation.status = status;

    if (status === OperationStatus.IN_PROGRESS && !operation.started_at) {
        operation.started_at = Date.now();
    }

    if (status === OperationStatus.COMPLETED || status === OperationStatus.FAILED || status === OperationStatus.CANCELLED) {
        operation.completed_at = Date.now();
        currentQueue.current_operation_id = null;
    }

    if (errorMsg) {
        operation.error = String(errorMsg);
    }

    await saveQueue();
    debug(SUBSYSTEM.QUEUE, `Operation ${operationId} status: ${status}`);
}

/**
 * Remove operation from queue
 */
export async function removeOperation(operationId) {
    const index = currentQueue.queue.findIndex(op => op.id === operationId);
    if (index === -1) {
        return false;
    }

    currentQueue.queue.splice(index, 1);
    await saveQueue();

    debug(SUBSYSTEM.QUEUE, `Removed operation ${operationId}`);
    return true;
}

/**
 * Clear completed operations from queue
 */
export async function clearCompletedOperations() {
    const before = currentQueue.queue.length;
    currentQueue.queue = currentQueue.queue.filter(op =>
        op.status !== OperationStatus.COMPLETED
    );
    const removed = before - currentQueue.queue.length;

    if (removed > 0) {
        await saveQueue();
        debug(SUBSYSTEM.QUEUE, `Cleared ${removed} completed operations`);
        toast(`Cleared ${removed} completed operation(s)`, 'info');
    }

    return removed;
}

/**
 * Clear all operations from queue
 */
export async function clearAllOperations() {
    const count = currentQueue.queue.length;
    currentQueue.queue = [];
    currentQueue.current_operation_id = null;
    await saveQueue();

    debug(SUBSYSTEM.QUEUE, `Cleared all ${count} operations`);
    toast(`Cleared all ${count} operation(s)`, 'info');

    return count;
}

/**
 * Pause queue processing
 */
export async function pauseQueue() {
    currentQueue.paused = true;
    await saveQueue();
    log(SUBSYSTEM.QUEUE, 'Queue paused');
    toast('Operation queue paused', 'info');
}

/**
 * Resume queue processing
 */
export async function resumeQueue() {
    currentQueue.paused = false;
    await saveQueue();
    log(SUBSYSTEM.QUEUE, 'Queue resumed');
    toast('Operation queue resumed', 'info');

    if (!queueProcessor) {
        startQueueProcessor();
    }
}

/**
 * Check if queue is paused
 */
export function isQueuePaused() {
    return currentQueue.paused;
}

/**
 * Get next operation to process
 * Considers dependencies and priority
 */
function getNextOperation() {
    const pending = getPendingOperations();

    if (pending.length === 0) {
        return null;
    }

    // Filter out operations with unmet dependencies
    const ready = pending.filter(op => {
        if (!op.dependencies || op.dependencies.length === 0) {
            return true;
        }

        // Check if all dependencies are completed
        return op.dependencies.every(depId => {
            const dep = getOperation(depId);
            return dep && dep.status === OperationStatus.COMPLETED;
        });
    });

    if (ready.length === 0) {
        return null;
    }

    // Sort by priority (higher first), then by created_at (older first)
    ready.sort((a, b) => {
        if (a.priority !== b.priority) {
            return b.priority - a.priority; // Higher priority first
        }
        return a.created_at - b.created_at; // Older first
    });

    return ready[0];
}

/**
 * Register operation handler
 * Handlers should be async functions that accept (operation) and return result
 */
const operationHandlers = new Map();

export function registerOperationHandler(operationType, handler) {
    operationHandlers.set(operationType, handler);
    debug(SUBSYSTEM.QUEUE, `Registered handler for ${operationType}`);
}

/**
 * Execute an operation
 */
async function executeOperation(operation) {
    const handler = operationHandlers.get(operation.type);

    if (!handler) {
        throw new Error(`No handler registered for operation type: ${operation.type}`);
    }

    debug(SUBSYSTEM.QUEUE, `Executing ${operation.type}:`, operation.id);
    await updateOperationStatus(operation.id, OperationStatus.IN_PROGRESS);

    try {
        const result = await handler(operation);
        await updateOperationStatus(operation.id, OperationStatus.COMPLETED);
        debug(SUBSYSTEM.QUEUE, `Completed ${operation.type}:`, operation.id);
        return result;
    } catch (err) {
        error(SUBSYSTEM.QUEUE, `Failed ${operation.type}:`, operation.id, err);

        // Check if we should retry
        if (operation.retries < operation.max_retries) {
            operation.retries++;
            await updateOperationStatus(operation.id, OperationStatus.PENDING, `Retry ${operation.retries}/${operation.max_retries}: ${err.message || err}`);
            debug(SUBSYSTEM.QUEUE, `Will retry ${operation.type} (${operation.retries}/${operation.max_retries})`);
        } else {
            await updateOperationStatus(operation.id, OperationStatus.FAILED, err.message || String(err));
        }

        throw err;
    }
}

/**
 * Start queue processor
 */
function startQueueProcessor() {
    if (queueProcessor) {
        debug(SUBSYSTEM.QUEUE, 'Queue processor already running');
        return;
    }

    debug(SUBSYSTEM.QUEUE, 'Starting queue processor');

    queueProcessor = (async () => {
        while (true) {
            // Check if paused
            if (currentQueue.paused) {
                debug(SUBSYSTEM.QUEUE, 'Queue paused, stopping processor');
                queueProcessor = null;
                return;
            }

            // Get next operation
            const operation = getNextOperation();

            if (!operation) {
                debug(SUBSYSTEM.QUEUE, 'No operations to process, stopping processor');
                queueProcessor = null;
                return;
            }

            // Execute operation
            currentQueue.current_operation_id = operation.id;
            await saveQueue();

            try {
                await executeOperation(operation);
            } catch (err) {
                // Error already handled in executeOperation
                // Continue processing other operations
            }

            // Small delay between operations
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    })();
}

/**
 * Register UI update callback
 */
export function registerUIUpdateCallback(callback) {
    uiUpdateCallback = callback;
    debug(SUBSYSTEM.QUEUE, 'Registered UI update callback');
}

/**
 * Notify UI of updates
 */
function notifyUIUpdate() {
    if (uiUpdateCallback) {
        try {
            uiUpdateCallback();
        } catch (err) {
            error(SUBSYSTEM.QUEUE, 'UI update callback error:', err);
        }
    }
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
    return {
        total: currentQueue.queue.length,
        pending: getPendingOperations().length,
        in_progress: getInProgressOperations().length,
        completed: getCompletedOperations().length,
        failed: getFailedOperations().length,
        paused: currentQueue.paused
    };
}

export default {
    initOperationQueue,
    enqueueOperation,
    getOperation,
    getAllOperations,
    getPendingOperations,
    getInProgressOperations,
    getCompletedOperations,
    getFailedOperations,
    updateOperationStatus,
    removeOperation,
    clearCompletedOperations,
    clearAllOperations,
    pauseQueue,
    resumeQueue,
    isQueuePaused,
    registerOperationHandler,
    registerUIUpdateCallback,
    getQueueStats,
    OperationStatus,
    OperationType
};

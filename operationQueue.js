// @flow
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
    setQueueBlocking,
    getCurrentConnectionSettings,
    switchConnectionSettings
} from './index.js';

import {
    loadWorldInfo,
    saveWorldInfo,
    METADATA_KEY
// $FlowFixMe[cannot-resolve-module]
} from '../../../world-info.js';

// Queue entry name in lorebook - NEVER ACTIVE (disabled, used only for persistence)
const QUEUE_ENTRY_NAME = '__operation_queue';

// Operation status constants
export const OperationStatus /*: { [key: string]: OperationStatusType } */ = /*:: ( */ {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
} /*:: : { [key: string]: OperationStatusType }) */;

// Operation type constants
export const OperationType /*: { [key: string]: OperationTypeType } */ = /*:: ( */ {
    VALIDATE_SUMMARY: 'validate_summary',
    DETECT_SCENE_BREAK: 'detect_scene_break',
    GENERATE_SCENE_SUMMARY: 'generate_scene_summary',
    GENERATE_SCENE_NAME: 'generate_scene_name',
    GENERATE_RUNNING_SUMMARY: 'generate_running_summary',
    COMBINE_SCENE_WITH_RUNNING: 'combine_scene_with_running',
    GENERATE_COMBINED_SUMMARY: 'generate_combined_summary',
    // Legacy monolithic operation (deprecated, kept for backward compat)
    PROCESS_LOREBOOK_ENTRY: 'process_lorebook_entry',
    // New multi-stage lorebook operations
    LOREBOOK_ENTRY_LOOKUP: 'lorebook_entry_lookup',
    RESOLVE_LOREBOOK_ENTRY: 'resolve_lorebook_entry',
    CREATE_LOREBOOK_ENTRY: 'create_lorebook_entry',
    MERGE_LOREBOOK_ENTRY: 'merge_lorebook_entry',
    UPDATE_LOREBOOK_REGISTRY: 'update_lorebook_registry',
} /*:: : { [key: string]: OperationTypeType }) */;

// Flow type definitions
/*::
type OperationStatusType = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
type OperationTypeType = 'summarize_message' | 'validate_summary' | 'detect_scene_break' | 'generate_scene_summary' | 'generate_scene_name' | 'generate_running_summary' | 'combine_scene_with_running' | 'generate_combined_summary' | 'process_lorebook_entry' | 'lorebook_entry_lookup' | 'resolve_lorebook_entry' | 'create_lorebook_entry' | 'merge_lorebook_entry' | 'update_lorebook_registry';

type ConnectionSettings = {
    +connectionProfile?: string,  // undefined = "same as current" (readonly for Flow variance)
    +completionPreset?: string,   // undefined = "same as current" (readonly for Flow variance)
};

type Operation = {
    id: string,
    type: OperationTypeType,
    params: any,
    status: OperationStatusType,
    created_at: number,
    started_at: ?number,
    completed_at: ?number,
    error: ?string,
    retries: number,
    priority: number,
    dependencies: Array<string>,
    metadata: any,
    queueVersion: number,
    executionSettings?: ConnectionSettings,  // Settings to use when executing
    restoreSettings?: ConnectionSettings,     // Settings to restore after execution
    ...
};

type QueueStructure = {
    queue: Array<Operation>,
    current_operation_id: ?string,
    paused: boolean,
    version: number,
    ...
};
*/

// Module state
let isInitialized /*: boolean */ = false;
let currentQueue /*: ?QueueStructure */ = null;
let queueProcessor /*: ?Promise<void> */ = null;
let uiUpdateCallback /*: ?Function */ = null;
let isClearing /*: boolean */ = false;  // Flag to prevent enqueuing during clear
let queueVersion /*: number */ = 0;  // Incremented on clear to invalidate in-flight operations
let isChatBlocked /*: boolean */ = false;  // Tracks whether chat is currently blocked by queue

/**
 * Set chat blocking state for the queue
 * @param {boolean} blocked - Whether to block chat
 */
function setQueueChatBlocking(blocked /*: boolean */) {
    if (isChatBlocked === blocked) {
        // Already in desired state, skip
        return;
    }

    isChatBlocked = blocked;
    // Control button blocking state (blocks ST's activateSendButtons from working)
    setQueueBlocking(blocked);
    debug(SUBSYSTEM.QUEUE, `Chat ${blocked ? 'BLOCKED' : 'UNBLOCKED'} by operation queue`);
    notifyUIUpdate();
}

/**
 * Initialize the operation queue system
 */
export async function initOperationQueue() {
    if (isInitialized) {
        debug(SUBSYSTEM.QUEUE, 'Operation queue already initialized');
        return;
    }

    log(SUBSYSTEM.QUEUE, '>>> Initializing operation queue system <<<');

    // Load queue from storage (this will create the lorebook entry if needed)
    log(SUBSYSTEM.QUEUE, 'Loading queue from storage...');
    await loadQueue();

    // Ensure the queue entry exists in the lorebook
    log(SUBSYSTEM.QUEUE, 'Checking for queue entry in lorebook...');
    const queueEntry = await getQueueEntry();
    if (queueEntry) {
        log(SUBSYSTEM.QUEUE, `✓ Queue entry exists with UID ${queueEntry.uid}`);
    } else {
        log(SUBSYSTEM.QUEUE, '⚠ No lorebook attached yet, queue entry will be created when lorebook is available');
    }

    // Restore chat blocking state based on queue contents
    // $FlowFixMe[incompatible-use]
    if (currentQueue && currentQueue.queue.length > 0) {
        log(SUBSYSTEM.QUEUE, `Restoring chat block state - ${currentQueue.queue.length} operations in queue`);
        setQueueChatBlocking(true);
    }

    // Install button and Enter key interceptors
    log(SUBSYSTEM.QUEUE, 'Installing button and Enter key interceptors...');
    const { installButtonInterceptor, installEnterKeyInterceptor } = await import('./index.js');
    installButtonInterceptor();
    installEnterKeyInterceptor();

    isInitialized = true;
    log(SUBSYSTEM.QUEUE, '✓ Operation queue system initialized successfully');
}

/**
 * Reload queue from lorebook (called on chat change)
 */
export async function reloadQueue() {
    if (!isInitialized) {
        debug(SUBSYSTEM.QUEUE, 'Queue not initialized yet, skipping reload');
        return;
    }

    log(SUBSYSTEM.QUEUE, 'Reloading queue from current chat lorebook...');

    // Load queue from storage
    await loadQueue();

    // Restore chat blocking state based on queue contents
    // $FlowFixMe[incompatible-use]
    if (currentQueue && currentQueue.queue.length > 0) {
        log(SUBSYSTEM.QUEUE, `Restoring chat block state on reload - ${currentQueue.queue.length} operations in queue`);
        setQueueChatBlocking(true);
    } else {
        // Queue is empty, ensure chat is unblocked
        setQueueChatBlocking(false);
    }

    // Start queue processor if there are pending operations and not paused
    const pending = getPendingOperations();
    // $FlowFixMe[incompatible-use]
    if (pending.length > 0 && !currentQueue.paused) {
        if (!queueProcessor) {
            log(SUBSYSTEM.QUEUE, `Found ${pending.length} pending operations, starting processor`);
            startQueueProcessor();
        } else {
            debug(SUBSYSTEM.QUEUE, `Found ${pending.length} pending operations but processor already running`);
        }
    } else if (pending.length > 0) {
        debug(SUBSYSTEM.QUEUE, `Found ${pending.length} pending operations (paused: ${String(currentQueue?.paused ?? 'unknown')})`);
    }

    notifyUIUpdate();
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
        log(SUBSYSTEM.QUEUE, '⚠ No lorebook attached, cannot access queue entry');
        return null;
    }

    log(SUBSYSTEM.QUEUE, `Lorebook attached: "${lorebookName}"`);

    // Load the lorebook
    const worldInfo = await loadWorldInfo(lorebookName);
    if (!worldInfo) {
        error(SUBSYSTEM.QUEUE, 'Failed to load lorebook:', lorebookName);
        return null;
    }

    // Convert entries to array if it's an object (SillyTavern uses object with UID keys)
    const entriesArray = Array.isArray(worldInfo.entries)
        ? worldInfo.entries
        : Object.values(worldInfo.entries || {});

    log(SUBSYSTEM.QUEUE, `Lorebook loaded, has ${entriesArray.length} entries`);

    // Find the queue entry
    let queueEntry = entriesArray.find(e => e.comment === QUEUE_ENTRY_NAME);

    // Create the queue entry if it doesn't exist
    if (!queueEntry) {
        log(SUBSYSTEM.QUEUE, `Creating ${QUEUE_ENTRY_NAME} lorebook entry...`);
        const emptyQueue = {
            queue: [],
            current_operation_id: null,
            paused: false,
            version: 1
        };

        // Generate a unique UID for the new entry
        const newUid = Date.now();

        // Create the entry object manually
        queueEntry = {
            uid: newUid,
            key: [],
            keysecondary: [],
            content: JSON.stringify(emptyQueue, null, 2),
            comment: QUEUE_ENTRY_NAME,
            constant: false,
            disable: true,  // Never inject into context
            excludeRecursion: true,  // Never trigger other entries
            order: 9999,  // Low priority
            position: 0,
            depth: 4,
            selectiveLogic: 0,
            addMemo: false,
            displayIndex: newUid,
            probability: 100,
            useProbability: true
        };

        // Add the entry to the worldInfo.entries object
        if (!worldInfo.entries) {
            worldInfo.entries = {};
        }
        // $FlowFixMe[invalid-computed-prop]
        worldInfo.entries[newUid] = queueEntry;

        // Save the lorebook with new entry
        try {
            await saveWorldInfo(lorebookName, worldInfo, true);
            log(SUBSYSTEM.QUEUE, `✓ Created queue entry with UID: ${queueEntry.uid}`);
        } catch (saveErr) {
            error(SUBSYSTEM.QUEUE, 'Failed to save lorebook after creating queue entry:', saveErr);
            return null;
        }
    }

    return queueEntry;
}

/**
 * Load queue from storage (lorebook or chat_metadata based on settings)
 */
async function loadQueue() {
    try {
        const useLorebook = get_settings('operation_queue_use_lorebook') !== false;
        log(SUBSYSTEM.QUEUE, `Loading queue - mode: ${useLorebook ? 'LOREBOOK' : 'CHAT_METADATA'}`);

        if (useLorebook) {
            log(SUBSYSTEM.QUEUE, 'Attempting to get queue entry from lorebook...');
            // Try to load from lorebook entry
            const queueEntry = await getQueueEntry();

            if (queueEntry) {
                log(SUBSYSTEM.QUEUE, '✓ Found existing queue entry in lorebook');
                // Parse queue from entry content
                try {
                    currentQueue = JSON.parse(queueEntry.content || '{}');
                    if (!currentQueue.queue) {
                        currentQueue.queue = [];
                    }
                    if (currentQueue.version === undefined) {
                        currentQueue.version = 1;
                    }
                    debug(SUBSYSTEM.QUEUE, `Loaded queue from lorebook with ${currentQueue.queue.length} operations`);
                } catch (parseErr) {
                    error(SUBSYSTEM.QUEUE, 'Failed to parse queue entry content:', parseErr);
                    currentQueue = /*:: ( */ {
                        queue: [],
                        current_operation_id: null,
                        paused: false,
                        version: 1
                    } /*:: : QueueStructure) */;
                }
            } else {
                // No lorebook entry yet, use empty queue
                debug(SUBSYSTEM.QUEUE, 'No lorebook queue entry yet, using empty queue');
                currentQueue = /*:: ( */ {
                    queue: [],
                    current_operation_id: null,
                    paused: false,
                    version: 1
                } /*:: : QueueStructure) */;
            }
        } else {
            // Load from chat_metadata (fallback mode)
            if (!chat_metadata.auto_summarize_operation_queue) {
                chat_metadata.auto_summarize_operation_queue = /*:: ( */ {
                    queue: [],
                    current_operation_id: null,
                    paused: false,
                    version: 1
                } /*:: : QueueStructure) */;
            }
            currentQueue = chat_metadata.auto_summarize_operation_queue;
            debug(SUBSYSTEM.QUEUE, `Loaded queue from chat_metadata with ${currentQueue.queue.length} operations`);
        }

        // Clean up any stale in_progress operations (from crashes/restarts)
        if (currentQueue) {
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
        }

        notifyUIUpdate();
    } catch (err) {
        error(SUBSYSTEM.QUEUE, 'Failed to load queue:', err);
        currentQueue = /*:: ( */ {
            queue: [],
            current_operation_id: null,
            paused: false,
            version: 1
        } /*:: : QueueStructure) */;
    }
}

/**
 * Save queue to storage (lorebook or chat_metadata based on settings)
 * @param {boolean} force - If true, skip reload and force save current in-memory state
 */
// $FlowFixMe[missing-local-annot]
async function saveQueue(force = false) {
    try {
        const useLorebook = get_settings('operation_queue_use_lorebook') !== false;

        if (useLorebook) {
            // Save to lorebook entry
            const lorebookName = getAttachedLorebook();
            if (!lorebookName) {
                debug(SUBSYSTEM.QUEUE, 'No lorebook attached, cannot save to lorebook');
                return;
            }

            // Ensure the queue entry exists first
            const existingEntry = await getQueueEntry();
            if (!existingEntry) {
                error(SUBSYSTEM.QUEUE, 'Failed to get or create queue entry, cannot save');
                return;
            }

            // Load the lorebook fresh to get current state
            const worldInfo = await loadWorldInfo(lorebookName);
            if (!worldInfo) {
                error(SUBSYSTEM.QUEUE, 'Failed to load lorebook:', lorebookName);
                return;
            }

            // Convert entries to array if it's an object
            const entriesArray = Array.isArray(worldInfo.entries)
                ? worldInfo.entries
                : Object.values(worldInfo.entries || {});

            // Find the queue entry in the freshly loaded worldInfo
            const queueEntry = entriesArray.find(e => e.comment === QUEUE_ENTRY_NAME);
            if (!queueEntry) {
                error(SUBSYSTEM.QUEUE, 'Queue entry disappeared after creation, cannot save');
                return;
            }

            // Reload from lorebook unless this is a forced save (like during clear)
            // This prevents overwriting changes made by other extensions (e.g. Auto-Lorebooks)
            if (!force) {
                try {
                    const savedQueue = JSON.parse(queueEntry.content || '{}');
                    if (savedQueue.queue && Array.isArray(savedQueue.queue)) {
                        // BUG FIX: Do NOT overwrite in-memory queue - was causing operations to disappear
                        // currentQueue = savedQueue;
                        // $FlowFixMe[incompatible-use]
                        debug(SUBSYSTEM.QUEUE, `Keeping in-memory queue with ${currentQueue.queue.length} operations`);
                    }
                } catch {
                    debug(SUBSYSTEM.QUEUE, 'Could not parse existing queue, proceeding with current in-memory queue');
                }
            }

            // Update the entry content in the worldInfo structure
            queueEntry.content = JSON.stringify(currentQueue, null, 2);

            // Also update in the worldInfo.entries object if it's keyed by UID
            if (!Array.isArray(worldInfo.entries) && worldInfo.entries[queueEntry.uid]) {
                worldInfo.entries[queueEntry.uid].content = queueEntry.content;
            }

            // Save the lorebook
            await saveWorldInfo(lorebookName, worldInfo, true);

            debug(SUBSYSTEM.QUEUE, 'Saved queue to lorebook entry');
        } else {
            // Save to chat_metadata (fallback mode)
            chat_metadata.auto_summarize_operation_queue = currentQueue;

            // Trigger a chat save
            const ctx = getContext();
            if (ctx.saveChat) {
                ctx.saveChat();
            }

            debug(SUBSYSTEM.QUEUE, 'Saved queue to chat_metadata');
        }

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
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export async function enqueueOperation(type /*: OperationTypeType */, params /*: any */, options /*: Object */ = {}) /*: Promise<?string> */ {
    // params is any as defined in Operation type - legitimate use of any
    if (!isInitialized) {
        await initOperationQueue();
    }

    // Prevent enqueueing operations if queue is being cleared
    if (isClearing) {
        debug(SUBSYSTEM.QUEUE, `Rejecting enqueue of ${type} - queue is being cleared`);
        return null;
    }

    // Check if queue version has changed (queue was cleared while this was pending)
    if (options.queueVersion !== undefined && options.queueVersion !== queueVersion) {
        debug(SUBSYSTEM.QUEUE, `Rejecting enqueue of ${type} - queue was cleared (version mismatch: ${options.queueVersion} !== ${queueVersion})`);
        return null;
    }

    const operation /*: Operation */ = /*:: ( */ {
        id: generateOperationId(),
        type: type,
        params: params,
        status: OperationStatus.PENDING,
        created_at: Date.now(),
        started_at: null,
        completed_at: null,
        error: null,
        retries: 0,
        priority: options.priority ?? 0,
        dependencies: options.dependencies ?? [],
        metadata: options.metadata ?? {},
        queueVersion: queueVersion,  // Stamp with current version
        executionSettings: options.executionSettings,  // Connection settings to use during execution
        restoreSettings: options.restoreSettings        // Connection settings to restore after execution
    } /*:: : Operation) */;

    // Block chat immediately if this is the first operation being added
    // $FlowFixMe[incompatible-use]
    const wasEmpty = currentQueue.queue.length === 0;

    // $FlowFixMe[incompatible-use] [incompatible-type]
    currentQueue.queue.push(operation);
    await saveQueue();

    debug(SUBSYSTEM.QUEUE, `Enqueued ${type} operation:`, operation.id);

    // Block chat if queue was empty before this enqueue
    if (wasEmpty) {
        setQueueChatBlocking(true);
    }

    // Auto-start processing if not paused
    // $FlowFixMe[incompatible-use]
    if (!currentQueue.paused && !queueProcessor) {
        startQueueProcessor();
    }

    return operation.id;
}

/**
 * Get operation by ID
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export function getOperation(operationId /*: string */) /*: ?Operation */ {
    // $FlowFixMe[incompatible-use]
    return currentQueue.queue.find(op => op.id === operationId);
}

/**
 * Get all operations
 */
// $FlowFixMe[signature-verification-failure]
export function getAllOperations() {
    // $FlowFixMe[incompatible-use]
    return [...currentQueue.queue];
}

/**
 * Get pending operations
 */
// $FlowFixMe[signature-verification-failure]
export function getPendingOperations() {
    // $FlowFixMe[incompatible-use]
    return currentQueue.queue.filter(op => op.status === OperationStatus.PENDING);
}

/**
 * Get in-progress operations
 */
// $FlowFixMe[signature-verification-failure]
export function getInProgressOperations() {
    // $FlowFixMe[incompatible-use]
    return currentQueue.queue.filter(op => op.status === OperationStatus.IN_PROGRESS);
}

/**
 * Check if queue is actively processing operations
 * Used by send message interceptor to block sends during queue operations
 */
export function isQueueActive() /*: boolean */ {
    if (!currentQueue) return false;
    // $FlowFixMe[incompatible-use]
    return currentQueue.queue.length > 0 || queueProcessor !== null;
}

/**
 * Get the current chat blocking state
 * @returns {boolean} - Whether chat is currently blocked by queue
 */
export function isChatBlockedByQueue() /*: boolean */ {
    return isChatBlocked;
}

/**
 * Get completed operations
 */
// $FlowFixMe[signature-verification-failure]
export function getCompletedOperations() {
    // $FlowFixMe[incompatible-use]
    return currentQueue.queue.filter(op => op.status === OperationStatus.COMPLETED);
}

/**
 * Get failed operations
 */
// $FlowFixMe[signature-verification-failure]
export function getFailedOperations() {
    // $FlowFixMe[incompatible-use]
    return currentQueue.queue.filter(op => op.status === OperationStatus.FAILED);
}

/**
 * Update operation status
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export async function updateOperationStatus(operationId /*: string */, status /*: OperationStatusType */, errorMsg /*: ?string */ = null) /*: Promise<void> */ {
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
        // $FlowFixMe[incompatible-use]
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
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export async function removeOperation(operationId /*: string */) /*: Promise<boolean> */ {
    // $FlowFixMe[incompatible-use]
    const index = currentQueue.queue.findIndex(op => op.id === operationId);
    if (index === -1) {
        return false;
    }

    // $FlowFixMe[incompatible-use]
    currentQueue.queue.splice(index, 1);
    await saveQueue();

    debug(SUBSYSTEM.QUEUE, `Removed operation ${operationId}`);

    // Unblock chat if queue is now empty
    // $FlowFixMe[incompatible-use]
    if (currentQueue.queue.length === 0) {
        setQueueChatBlocking(false);
    }

    return true;
}

/**
 * Clear completed operations from queue
 */
// $FlowFixMe[signature-verification-failure]
export async function clearCompletedOperations() {
    // $FlowFixMe[incompatible-use]
    const before = currentQueue.queue.length;
    // $FlowFixMe[incompatible-use]
    currentQueue.queue = currentQueue.queue.filter(op =>
        op.status !== OperationStatus.COMPLETED
    );
    const removed = before - currentQueue.queue.length;

    if (removed > 0) {
        await saveQueue();
        debug(SUBSYSTEM.QUEUE, `Cleared ${removed} completed operations`);
        toast(`Cleared ${removed} completed operation(s)`, 'info');

        // Unblock chat if queue is now empty
        // $FlowFixMe[incompatible-use]
        if (currentQueue.queue.length === 0) {
            setQueueChatBlocking(false);
        }
    }

    return removed;
}

/**
 * Clear all operations from queue
 * Stops queue processor and clears all operations regardless of type or status
 */
// $FlowFixMe[signature-verification-failure]
export async function clearAllOperations() {
    // $FlowFixMe[incompatible-use]
    const count = currentQueue.queue.length;

    // Set clearing flag to prevent new operations from being enqueued
    isClearing = true;
    debug(SUBSYSTEM.QUEUE, 'Setting isClearing flag to prevent new operations during clear');

    // Increment queue version to invalidate any in-flight operations
    queueVersion++;
    debug(SUBSYSTEM.QUEUE, `Incremented queue version to ${queueVersion} - invalidating in-flight operations`);

    // Stop the queue processor first to prevent operations from continuing
    if (queueProcessor) {
        debug(SUBSYSTEM.QUEUE, 'Stopping queue processor before clearing operations');
        // Set paused flag to stop processor loop
        // $FlowFixMe[incompatible-use]
        const wasPaused = currentQueue.paused;
        // $FlowFixMe[incompatible-use] [incompatible-type]
        currentQueue.paused = true;

        // Wait for processor to stop (it checks paused flag on each iteration)
        await new Promise(resolve => setTimeout(resolve, 100));
        queueProcessor = null;

        // Restore paused state
        // $FlowFixMe[incompatible-use] [incompatible-type]
        currentQueue.paused = wasPaused;
    }

    // Clear all operations regardless of type or status
    // $FlowFixMe[incompatible-use]
    currentQueue.queue = [];
    // $FlowFixMe[incompatible-use]
    currentQueue.current_operation_id = null;

    await saveQueue(true);  // Force save without reload

    // Unblock chat since queue is now empty
    setQueueChatBlocking(false);

    // Clear the flag after a short delay to allow any in-flight enqueue attempts to be rejected
    await new Promise(resolve => setTimeout(resolve, 500));
    isClearing = false;
    debug(SUBSYSTEM.QUEUE, 'Cleared isClearing flag - enqueue operations now allowed');

    debug(SUBSYSTEM.QUEUE, `Cleared all ${count} operations (including in-progress)`);
    toast(`Cleared all ${count} operation(s)`, 'info');

    return count;
}

/**
 * Pause queue processing
 */
export async function pauseQueue() {
    // $FlowFixMe[incompatible-use] [incompatible-type]
    currentQueue.paused = true;
    await saveQueue();
    log(SUBSYSTEM.QUEUE, 'Queue paused');
    toast('Operation queue paused', 'info');
}

/**
 * Resume queue processing
 */
export async function resumeQueue() {
    // $FlowFixMe[incompatible-use]
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
// $FlowFixMe[signature-verification-failure]
export function isQueuePaused() {
    // $FlowFixMe[incompatible-use]
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
        // Check dependencies
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
// $FlowFixMe[underconstrained-implicit-instantiation]
const operationHandlers = new Map();

// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export function registerOperationHandler(operationType /*: string */, handler /*: (operation: Operation) => Promise<any> */) /*: void */ {
    // handler returns any because different operations return different result types - legitimate use of any
    operationHandlers.set(operationType, handler);
    debug(SUBSYSTEM.QUEUE, `Registered handler for ${operationType}`);
}

/**
 * Execute an operation
 */
// $FlowFixMe[recursive-definition] - Function signature is correct but Flow needs annotation
// eslint-disable-next-line complexity
async function executeOperation(operation /*: Operation */) /*: Promise<any> */ {
    // returns any because different operations return different result types - legitimate use of any
    const handler = operationHandlers.get(operation.type);

    if (!handler) {
        throw new Error(`No handler registered for operation type: ${operation.type}`);
    }

    debug(SUBSYSTEM.QUEUE, `Executing ${operation.type}:`, operation.id);
    await updateOperationStatus(operation.id, OperationStatus.IN_PROGRESS);

    // Capture current settings before any switching (only if functions available and execution settings specified)
    let originalSettings = null;
    let presetBeforeProfileSwitch = null;

    try {
        // Handle execution settings switching
        if (operation.executionSettings && getCurrentConnectionSettings && switchConnectionSettings) {
            // Capture original settings so we can restore later
            originalSettings = await getCurrentConnectionSettings();
            const executionSettings /*: ?ConnectionSettings */ = operation.executionSettings;  // Flow type cast
            const connectionProfile /*: ?string */ = executionSettings?.connectionProfile;
            const completionPreset /*: ?string */ = executionSettings?.completionPreset;

            // If changing profile, capture current preset FIRST (before profile switch)
            if (connectionProfile) {
                presetBeforeProfileSwitch = originalSettings?.completionPreset;
                debug(SUBSYSTEM.QUEUE, `Switching to execution profile: ${connectionProfile}`);
                await switchConnectionSettings(connectionProfile, undefined);
            }

            // If preset specified, switch to it (overrides profile's default)
            // If preset NOT specified but we switched profiles, restore the captured preset
            if (completionPreset) {
                debug(SUBSYSTEM.QUEUE, `Switching to execution preset: ${completionPreset}`);
                await switchConnectionSettings(undefined, completionPreset);
            } else if (connectionProfile && presetBeforeProfileSwitch) {
                // Edge case: Only profile changed, preset is "same as current"
                // Must explicitly restore it because profile switch auto-loads default
                debug(SUBSYSTEM.QUEUE, `Restoring preset after profile switch: ${presetBeforeProfileSwitch}`);
                await switchConnectionSettings(undefined, presetBeforeProfileSwitch);
            }
        }

        debug(SUBSYSTEM.QUEUE, `[LIFECYCLE] About to call handler for ${operation.type}, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
        const result = await handler(operation);
        debug(SUBSYSTEM.QUEUE, `[LIFECYCLE] Handler returned for ${operation.type}, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);

        await updateOperationStatus(operation.id, OperationStatus.COMPLETED);
        debug(SUBSYSTEM.QUEUE, `Completed ${operation.type}:`, operation.id);

        // Auto-remove completed operations
        debug(SUBSYSTEM.QUEUE, `[LIFECYCLE] About to remove operation ${operation.id}, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
        await removeOperation(operation.id);
        debug(SUBSYSTEM.QUEUE, `[LIFECYCLE] After removeOperation, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
        debug(SUBSYSTEM.QUEUE, `Auto-removed completed operation:`, operation.id);

        return result;
    } catch (err) {
        error(SUBSYSTEM.QUEUE, `Failed ${operation.type}:`, operation.id, err);
        const errText = (err && err.message) ? String(err.message) : String(err);

        // Since SillyTavern strips error details, we can't detect rate limits specifically.
        // "Bad Request" could be a rate limit, so we retry on ALL errors with exponential backoff.
        // Only fail on truly non-retryable errors (auth failures, etc.)

        // Only these errors are truly non-retryable (very conservative list)
        const nonRetryable = /unauthorized|forbidden|authentication.?required|invalid.?api.?key/i.test(errText);

        if (nonRetryable) {
            await updateOperationStatus(operation.id, OperationStatus.FAILED, errText);
            await removeOperation(operation.id);
            toast(`Queue operation failed (${operation.type}): ${errText}`, 'error');
            return null;
        }

        // Retry with exponential backoff on ALL other errors (including "Bad Request" which may be rate limits)
        // No retry cap - keep retrying indefinitely until it succeeds
        operation.retries++;
        const backoffDelay = Math.min(10 * Math.pow(2, operation.retries - 1) * 1000, 300000);
        await updateOperationStatus(operation.id, OperationStatus.PENDING, `Retry ${operation.retries} after ${backoffDelay/1000}s: ${errText}`);
        log(SUBSYSTEM.QUEUE, `⚠️ Operation failed (likely rate limit)! Waiting ${backoffDelay/1000}s before retry ${operation.retries}`);
        await saveQueue();
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        debug(SUBSYSTEM.QUEUE, `Retrying ${operation.type} after backoff (retry ${operation.retries})...`);
        return await executeOperation(operation);
    } finally {
        // CRITICAL: If we switched to execution settings, we MUST restore (whether operation succeeded or failed)
        // Wrap in try-catch to prevent errors from breaking operation flow
        try {
            if (operation.executionSettings && getCurrentConnectionSettings && switchConnectionSettings) {
                // Determine what settings to restore to
                const targetSettings /*: ?ConnectionSettings */ = operation.restoreSettings || originalSettings;
                if (!targetSettings) return; // No settings to restore

                const connectionProfile /*: ?string */ = targetSettings?.connectionProfile;
                const completionPreset /*: ?string */ = targetSettings?.completionPreset;
                let presetBeforeRestoreProfileSwitch = null;

                // If changing profile, capture current preset FIRST (before profile switch)
                if (connectionProfile) {
                    const currentSettings = await getCurrentConnectionSettings();
                    presetBeforeRestoreProfileSwitch = currentSettings?.completionPreset;
                    debug(SUBSYSTEM.QUEUE, `Restoring to profile: ${connectionProfile}`);
                    await switchConnectionSettings(connectionProfile, undefined);
                }

                // If preset specified, switch to it (overrides profile's default)
                // If preset NOT specified but we switched profiles, restore the captured preset
                if (completionPreset) {
                    debug(SUBSYSTEM.QUEUE, `Restoring to preset: ${completionPreset}`);
                    await switchConnectionSettings(undefined, completionPreset);
                } else if (connectionProfile && presetBeforeRestoreProfileSwitch) {
                    // Edge case: Only profile changed, preset is "same as current"
                    // Must explicitly restore it because profile switch auto-loads default
                    debug(SUBSYSTEM.QUEUE, `Restoring preset after profile switch: ${presetBeforeRestoreProfileSwitch}`);
                    await switchConnectionSettings(undefined, presetBeforeRestoreProfileSwitch);
                }
            }
        } catch (err) {
            // Log but don't throw - restoration errors shouldn't break operation processing
            debug(SUBSYSTEM.QUEUE, `Failed to restore connection settings: ${String(err)}`);
        }
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
    // Ensure chat is blocked for entire queue processing duration (safety fallback)
    setQueueChatBlocking(true);

    // $FlowFixMe[definition-cycle]
    queueProcessor = (async () => {
        while (true) {
            debug(SUBSYSTEM.QUEUE, `[LOOP] Start of iteration, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);

            // Check if paused
            // $FlowFixMe[incompatible-use]
            if (currentQueue.paused) {
                debug(SUBSYSTEM.QUEUE, 'Queue paused, stopping processor (chat remains blocked)');
                // Do NOT unblock chat - it stays blocked even when paused
                queueProcessor = null;
                return;
            }

            // Get next operation
            const operation = getNextOperation();

            if (!operation) {
                debug(SUBSYSTEM.QUEUE, 'No operations to process, stopping processor');
                // Only unblock when queue is fully empty
                setQueueChatBlocking(false);
                queueProcessor = null;
                notifyUIUpdate();
                return;
            }

            debug(SUBSYSTEM.QUEUE, `[LOOP] Found operation: ${operation.type}, id: ${operation.id}`);

            // Mark operation as in progress BEFORE saving
            // $FlowFixMe[incompatible-use]
            currentQueue.current_operation_id = operation.id;
            operation.status = /*:: ( */ OperationStatus.IN_PROGRESS /*:: : OperationStatusType) */;
            if (!operation.started_at) {
                operation.started_at = Date.now();
            }
            // Sequential execution required: queue must be saved before executing operation
            // eslint-disable-next-line no-await-in-loop
            await saveQueue();

            debug(SUBSYSTEM.QUEUE, `[LOOP] About to execute operation, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
            try {
                // Sequential execution required: operations must execute one at a time in order
                // eslint-disable-next-line no-await-in-loop
                await executeOperation(operation);
            } catch {
                // Error already handled in executeOperation
                // Continue processing other operations
            }
            debug(SUBSYSTEM.QUEUE, `[LOOP] After executeOperation, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);

            // Sequential execution required: rate limiting delay between operations
            debug(SUBSYSTEM.QUEUE, `[LOOP] Starting 5-second delay, queue state: blocked=${String(isChatBlocked)}`);
            // eslint-disable-next-line no-await-in-loop
            await new Promise(resolve => setTimeout(resolve, 5000));
            debug(SUBSYSTEM.QUEUE, `[LOOP] After 5-second delay, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
        }
    })();
}

/**
 * Register UI update callback
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export function registerUIUpdateCallback(callback /*: () => void */) /*: void */ {
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
// $FlowFixMe[signature-verification-failure]
export function getQueueStats() {
    return {
        // $FlowFixMe[incompatible-use]
        total: currentQueue.queue.length,
        pending: getPendingOperations().length,
        in_progress: getInProgressOperations().length,
        completed: getCompletedOperations().length,
        failed: getFailedOperations().length,
        // $FlowFixMe[incompatible-use]
        paused: currentQueue.paused
    };
}

export default {
    initOperationQueue,
    reloadQueue,
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

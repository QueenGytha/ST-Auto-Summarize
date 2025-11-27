
// operationQueue.js - Persistent operation queue using shared lorebook entry storage

/* global AbortController -- Browser API for aborting async operations */

import {
  chat_metadata,
  debug,
  log,
  error,
  toast,
  SUBSYSTEM,
  setQueueBlocking,
  get_settings,
  shouldOperationBlockChat } from
'./index.js';

import {
  loadWorldInfo,
  saveWorldInfo,
  updateWorldInfoList,
  METADATA_KEY
} from '../../../world-info.js';

import {
  lorebookExists,
  attachLorebook
} from './lorebookManager.js';

import {
  ID_GENERATION_BASE,
  ENTRY_ID_LENGTH,
  FULL_COMPLETION_PERCENTAGE,
  UI_UPDATE_DELAY_MS,
  DEFAULT_POLLING_INTERVAL,
  ONE_SECOND_MS,
  QUEUE_OPERATION_TIMEOUT_MS,
  OPERATION_FETCH_TIMEOUT_MS
} from './constants.js';

// Queue entry name in lorebook - NEVER ACTIVE (disabled, used only for persistence)
const QUEUE_ENTRY_NAME = '__operation_queue';

// Operation status constants
export const OperationStatus  = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying'
} ;

// Operation type constants
export const OperationType  = {
  VALIDATE_RECAP: 'validate_recap',
  DETECT_SCENE_BREAK: 'detect_scene_break',
  DETECT_SCENE_BREAK_BACKWARDS: 'detect_scene_break_backwards',
  GENERATE_SCENE_RECAP: 'generate_scene_recap',
  ORGANIZE_SCENE_RECAP: 'organize_scene_recap',
  PARSE_SCENE_RECAP: 'parse_scene_recap',
  FILTER_SCENE_RECAP_SL: 'filter_scene_recap_sl',
  GENERATE_RUNNING_RECAP: 'generate_running_recap',
  COMBINE_SCENE_WITH_RUNNING: 'combine_scene_with_running',
  // Multi-stage lorebook operations
  LOREBOOK_ENTRY_LOOKUP: 'lorebook_entry_lookup',
  RESOLVE_LOREBOOK_ENTRY: 'resolve_lorebook_entry',
  CREATE_LOREBOOK_ENTRY: 'create_lorebook_entry',
  MERGE_LOREBOOK_ENTRY: 'merge_lorebook_entry',
  COMPACT_LOREBOOK_ENTRY: 'auto_lorebooks_recap_lorebook_entry_compaction',
  POPULATE_REGISTRIES: 'populate_registries',
  UPDATE_LOREBOOK_REGISTRY: 'update_lorebook_registry',
  UPDATE_LOREBOOK_SNAPSHOT: 'update_lorebook_snapshot',
  CHAT: 'chat'
} ;

// Flow type definitions


// Module state
let isInitialized  = false;
let currentQueue  = null;
let queueProcessor  = null; // Reference to active processor promise (not per-queue, processor uses currentQueue)
let uiUpdateCallback  = null;
let isChatBlocked  = false; // Tracks whether chat is currently blocked by queue
let isProcessorActive  = false; // GLOBAL reentrancy guard - prevents concurrent processor loops across all chats

// Transient fields stored in currentQueue (not serialized):
// - isClearing: boolean - Flag to prevent enqueuing during clear
// - activeOperationControllers: Map - Tracks active operations for abortion: opId -> { reject }

// Initialize transient (non-serialized) fields on a queue object
function initTransientFields(queue) {
  queue.isClearing = false;
  queue.activeOperationControllers = new Map();
  return queue;
}

// Serialize queue for storage, excluding transient fields
function serializeQueue(queue) {
  const { isClearing, activeOperationControllers, ...persistentFields } = queue;
  return JSON.stringify(persistentFields, null, 2);
}

function setQueueChatBlocking(blocked ) {
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

  // CONDITIONAL BLOCKING: Restore chat blocking state based on queue contents
  if (currentQueue && currentQueue.queue.length > 0) {
    // Check if any operations need blocking (use "same as current" profile)
    const needsBlocking = currentQueue.queue.some(op => shouldOperationBlockChat(op.type));
    if (needsBlocking) {
      log(SUBSYSTEM.QUEUE, `Restoring chat block state - ${currentQueue.queue.length} operations in queue, at least one uses same profile`);
      setQueueChatBlocking(true);
    } else {
      log(SUBSYSTEM.QUEUE, `NOT blocking chat - ${currentQueue.queue.length} operations in queue, all use separate profiles`);
    }
  }

  // Install button and Enter key interceptors
  log(SUBSYSTEM.QUEUE, 'Installing button and Enter key interceptors...');
  const { installButtonInterceptor, installEnterKeyInterceptor } = await import('./index.js');
  installButtonInterceptor();
  installEnterKeyInterceptor();

  isInitialized = true;
  log(SUBSYSTEM.QUEUE, '✓ Operation queue system initialized successfully');
}

export async function reloadQueue() {
  if (!isInitialized) {
    debug(SUBSYSTEM.QUEUE, 'Queue not initialized yet, skipping reload');
    return;
  }

  log(SUBSYSTEM.QUEUE, 'Reloading queue from current chat lorebook...');

  // Load queue from storage
  await loadQueue();

  // CONDITIONAL BLOCKING: Restore chat blocking state based on queue contents
  if (currentQueue && currentQueue.queue.length > 0) {
    const needsBlocking = currentQueue.queue.some(op => shouldOperationBlockChat(op.type));
    if (needsBlocking) {
      log(SUBSYSTEM.QUEUE, `Restoring chat block state on reload - ${currentQueue.queue.length} operations in queue`);
      setQueueChatBlocking(true);
    } else {
      log(SUBSYSTEM.QUEUE, `NOT blocking on reload - ${currentQueue.queue.length} operations use separate profiles`);
      setQueueChatBlocking(false);
    }
  } else {
    // Queue is empty, ensure chat is unblocked
    setQueueChatBlocking(false);
  }

  // Start queue processor if there are pending operations and not paused
  const pending = getPendingOperations();
  if (pending.length > 0 && !currentQueue.paused) {
    if (!isProcessorActive) {
      log(SUBSYSTEM.QUEUE, `Found ${pending.length} pending operations, starting processor`);
      startQueueProcessor();
    } else {
      debug(SUBSYSTEM.QUEUE, `Found ${pending.length} pending operations but processor already active`);
    }
  } else if (pending.length > 0) {
    debug(SUBSYSTEM.QUEUE, `Found ${pending.length} pending operations (paused: ${String(currentQueue?.paused ?? 'unknown')})`);
  }

  notifyUIUpdate();
}

function getAttachedLorebook() {
  return chat_metadata?.[METADATA_KEY];
}

async function getQueueEntry() {
  const lorebookName = getAttachedLorebook();
  if (!lorebookName) {
    log(SUBSYSTEM.QUEUE, '⚠ No lorebook attached, cannot access queue entry');
    return null;
  }

  log(SUBSYSTEM.QUEUE, `Lorebook attached: "${lorebookName}"`);

  // CRITICAL: Verify lorebook is actually in world_names
  // If not, SillyTavern won't send entries and everything breaks silently
  if (!lorebookExists(lorebookName)) {
    error(SUBSYSTEM.QUEUE, `CRITICAL: Lorebook "${lorebookName}" is attached in metadata but NOT in world_names!`);
    error(SUBSYSTEM.QUEUE, 'This means SillyTavern will NOT send lorebook entries to the LLM.');
    error(SUBSYSTEM.QUEUE, 'Attempting to refresh world_names and reattach...');

    // Try refreshing world_names
    await updateWorldInfoList();

    // Check if it exists now
    if (lorebookExists(lorebookName)) {
      log(SUBSYSTEM.QUEUE, 'Lorebook found after refresh. Reattaching...');
      const reattached = attachLorebook(lorebookName);
      if (!reattached) {
        error(SUBSYSTEM.QUEUE, 'Failed to reattach lorebook');
        toast('CRITICAL: Queue lorebook is detached and reattachment failed!', 'error');
        return null;
      }

      // Verify the reattachment actually worked
      const nowAttached = getAttachedLorebook();
      if (nowAttached !== lorebookName) {
        error(SUBSYSTEM.QUEUE, `CRITICAL: Reattached lorebook but metadata shows "${nowAttached}" instead of "${lorebookName}"`);
        toast('CRITICAL: Queue lorebook reattachment verification failed!', 'error');
        return null;
      }

      log(SUBSYSTEM.QUEUE, 'Successfully reattached and verified lorebook');
    } else {
      error(SUBSYSTEM.QUEUE, 'Lorebook file does not exist at all');
      toast('CRITICAL: Queue lorebook file is missing! Extension cannot function.', 'error');
      return null;
    }
  }

  // Load the lorebook
  const worldInfo = await loadWorldInfo(lorebookName);
  if (!worldInfo) {
    error(SUBSYSTEM.QUEUE, 'Failed to load lorebook:', lorebookName);
    return null;
  }

  // Convert entries to array if it's an object (SillyTavern uses object with UID keys)
  const entriesArray = Array.isArray(worldInfo.entries) ?
  worldInfo.entries :
  Object.values(worldInfo.entries || {});

  log(SUBSYSTEM.QUEUE, `Lorebook loaded, has ${entriesArray.length} entries`);

  // Find the queue entry
  let queueEntry = entriesArray.find((e) => e.comment === QUEUE_ENTRY_NAME);

  // Create the queue entry if it doesn't exist
  if (!queueEntry) {
    log(SUBSYSTEM.QUEUE, `Creating ${QUEUE_ENTRY_NAME} lorebook entry...`);
    const emptyQueue = {
      queue: [],
      current_operation_id: null,
      paused: false,
      version: 1,
      queueVersion: 0
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
      disable: true, // Never inject into context
      excludeRecursion: true, // Never trigger other entries
      order: 9999, // Low priority
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

async function loadQueue() {
  try {
    log(SUBSYSTEM.QUEUE, 'Loading queue from lorebook...');

    // Load from lorebook entry
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
        if (currentQueue.queueVersion === undefined) {
          currentQueue.queueVersion = 0;
        }
        debug(SUBSYSTEM.QUEUE, `Loaded queue from lorebook with ${currentQueue.queue.length} operations`);
      } catch (parseErr) {
        error(SUBSYSTEM.QUEUE, 'Failed to parse queue entry content:', parseErr);
        currentQueue = {
          queue: [],
          current_operation_id: null,
          paused: false,
          version: 1,
          queueVersion: 0
        };
      }
    } else {
      // No lorebook entry yet, use empty queue
      debug(SUBSYSTEM.QUEUE, 'No lorebook queue entry yet, using empty queue');
      currentQueue = {
        queue: [],
        current_operation_id: null,
        paused: false,
        version: 1,
        queueVersion: 0
      };
    }

    // Initialize transient (non-serialized) fields
    initTransientFields(currentQueue);

    // Clean up any stale in_progress operations (from crashes/restarts)
    // Also recreate AbortControllers for all operations (not serialized to storage)
    if (currentQueue) {
      let cleanedCount = 0;
      for (const op of currentQueue.queue) {
        // Recreate AbortController (lost during serialization)
        if (!op.abortController || typeof op.abortController.abort !== 'function') {
          op.abortController = new AbortController();
        }

        // Initialize pauseBeforeExecution flag if missing (for operations loaded from old queue format)
        if (op.pauseBeforeExecution === undefined) {
          op.pauseBeforeExecution = false;
        }

        // Reset stale IN_PROGRESS operations
        if (op.status === OperationStatus.IN_PROGRESS) {
          op.status = OperationStatus.PENDING;
          cleanedCount++;
        }

        // Reset RETRYING operations (backoff timer lost during reload)
        if (op.status === OperationStatus.RETRYING) {
          op.status = OperationStatus.PENDING;
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        debug(SUBSYSTEM.QUEUE, `Cleaned ${cleanedCount} stale in_progress/retrying operations`);
        await saveQueue();
      }
    }

    notifyUIUpdate();
  } catch (err) {
    error(SUBSYSTEM.QUEUE, 'Failed to load queue:', err);
    currentQueue = initTransientFields({
      queue: [],
      current_operation_id: null,
      paused: false,
      version: 1,
      queueVersion: 0
    });
  }
}

async function saveQueue(force = false) {
  try {
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
    const entriesArray = Array.isArray(worldInfo.entries) ?
    worldInfo.entries :
    Object.values(worldInfo.entries || {});

    // Find the queue entry in the freshly loaded worldInfo
    const queueEntry = entriesArray.find((e) => e.comment === QUEUE_ENTRY_NAME);
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
          debug(SUBSYSTEM.QUEUE, `Keeping in-memory queue with ${currentQueue.queue.length} operations`);
        }
      } catch {
        debug(SUBSYSTEM.QUEUE, 'Could not parse existing queue, proceeding with current in-memory queue');
      }
    }

    // Update the entry content in the worldInfo structure (exclude transient fields)
    queueEntry.content = serializeQueue(currentQueue);

    // Also update in the worldInfo.entries object if it's keyed by UID
    if (!Array.isArray(worldInfo.entries) && worldInfo.entries[queueEntry.uid]) {
      worldInfo.entries[queueEntry.uid].content = queueEntry.content;
    }

    // Save the lorebook
    await saveWorldInfo(lorebookName, worldInfo, true);

    debug(SUBSYSTEM.QUEUE, 'Saved queue to lorebook entry');

    notifyUIUpdate();
  } catch (err) {
    error(SUBSYSTEM.QUEUE, 'Failed to save queue:', err);
  }
}

function generateOperationId() {
  return `op_${Date.now()}_${Math.random().toString(ID_GENERATION_BASE).slice(2, 2 + ENTRY_ID_LENGTH)}`;
}

export async function enqueueOperation(type , params , options  = {}) {
  // params is any as defined in Operation type - legitimate use of any
  if (!isInitialized) {
    await initOperationQueue();
  }

  // Prevent enqueueing operations if queue is being cleared
  if (currentQueue.isClearing) {
    debug(SUBSYSTEM.QUEUE, `Rejecting enqueue of ${type} - queue is being cleared`);
    return null;
  }

  // Check if queue version has changed (queue was cleared while this was pending)
  if (options.queueVersion !== undefined && options.queueVersion !== currentQueue.queueVersion) {
    debug(SUBSYSTEM.QUEUE, `Rejecting enqueue of ${type} - queue was cleared (version mismatch: ${options.queueVersion} !== ${currentQueue.queueVersion})`);
    return null;
  }

  const operation  = {
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
    queueVersion: currentQueue.queueVersion, // Stamp with current version
    pauseBeforeExecution: false, // Pause queue before executing this operation
    abortController: new AbortController() // For cancelling operations (not serialized to storage)
  } ;

  // Block chat immediately if this is the first operation being added
  const wasEmpty = currentQueue.queue.length === 0;

  currentQueue.queue.push(operation);
  await saveQueue();

  debug(SUBSYSTEM.QUEUE, `Enqueued ${type} operation:`, operation.id);

  // CONDITIONAL BLOCKING: Only block if operation uses "same as current" profile
  // Empty profile = same as user's profile = MUST BLOCK (conflict risk)
  // Non-empty profile = separate connection = DON'T BLOCK (concurrent operation)
  if (wasEmpty && shouldOperationBlockChat(type)) {
    setQueueChatBlocking(true);
    debug(SUBSYSTEM.QUEUE, `Chat BLOCKED - operation ${type} uses same profile as user`);
  } else if (wasEmpty) {
    debug(SUBSYSTEM.QUEUE, `Chat NOT blocked - operation ${type} uses separate profile`);
  }

  // Auto-start processing if not paused and processor not already active
  if (!currentQueue.paused && !isProcessorActive) {
    startQueueProcessor();
  }

  return operation.id;
}

export function getOperation(operationId ) {
  return currentQueue.queue.find((op) => op.id === operationId);
}

export function getAbortSignal(operation ) {
  return operation?.abortController?.signal ?? null;
}

export function throwIfAborted(signal , operationType , context  = '') {
  if (signal?.aborted) {
    const msg = context
      ? `${operationType} cancelled during ${context}, discarding result`
      : `${operationType} cancelled, discarding result`;
    debug(SUBSYSTEM.QUEUE, msg);
    throw new Error('Operation cancelled by user');
  }
}

export function getAllOperations() {
  return [...currentQueue.queue];
}

export function getPendingOperations() {
  return currentQueue.queue.filter((op) => op.status === OperationStatus.PENDING);
}

export function getInProgressOperations() {
  return currentQueue.queue.filter((op) => op.status === OperationStatus.IN_PROGRESS);
}

export function isQueueActive() {
  if (!currentQueue) {return false;}
  return currentQueue.queue.length > 0 || queueProcessor !== null;
}

export function isChatBlockedByQueue() {
  return isChatBlocked;
}

export function getCompletedOperations() {
  return currentQueue.queue.filter((op) => op.status === OperationStatus.COMPLETED);
}

export function getFailedOperations() {
  return currentQueue.queue.filter((op) => op.status === OperationStatus.FAILED);
}

export async function updateOperationStatus(operationId , status , errorMsg  = null) {
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

export async function updateOperationMetadata(operationId , newMetadata ) {
  const operation = getOperation(operationId);
  if (!operation) {
    error(SUBSYSTEM.QUEUE, `Operation ${operationId} not found`);
    return;
  }

  operation.metadata = { ...operation.metadata, ...newMetadata };

  await saveQueue();
  notifyUIUpdate();
  debug(SUBSYSTEM.QUEUE, `Operation ${operationId} metadata updated`);
}

export async function toggleOperationPauseFlag(operationId ) {
  const operation = getOperation(operationId);
  if (!operation) {
    error(SUBSYSTEM.QUEUE, `Operation ${operationId} not found`);
    return false;
  }

  operation.pauseBeforeExecution = !operation.pauseBeforeExecution;
  await saveQueue();
  notifyUIUpdate();
  debug(SUBSYSTEM.QUEUE, `Operation ${operationId} pause flag toggled to ${String(operation.pauseBeforeExecution)}`);
  return operation.pauseBeforeExecution;
}

export async function removeOperation(operationId ) {
  const index = currentQueue.queue.findIndex((op) => op.id === operationId);
  if (index === -1) {
    return false;
  }

  const operation = currentQueue.queue[index];

  // If operation is IN_PROGRESS or RETRYING, attempt to abort it first
  if (operation.status === OperationStatus.IN_PROGRESS || operation.status === OperationStatus.RETRYING) {
    // Abort the AbortController signal (allows handlers to check signal.aborted)
    if (operation.abortController && typeof operation.abortController.abort === 'function') {
      operation.abortController.abort('Operation cancelled by user');
      debug(SUBSYSTEM.QUEUE, `Aborted signal for ${operation.status} operation ${operationId}`);
    }

    // Also reject the Promise wrapper (for executeOperation's Promise.race)
    const controller = currentQueue.activeOperationControllers.get(operationId);
    if (controller?.reject) {
      // Abort the in-flight operation by rejecting its promise
      debug(SUBSYSTEM.QUEUE, `Aborting ${operation.status} operation ${operationId}`);
      controller.reject(new Error(`Operation cancelled by user`));

      // Mark as cancelled (prevents retry logic from kicking in)
      await updateOperationStatus(operationId, OperationStatus.CANCELLED);
      toast(`Operation cancelled: ${operation.type}`, 'warning');
    }
  }

  // Remove this operation ID from any other operation's dependencies
  // This prevents dependent operations from getting stuck waiting for a removed operation
  for (const op of currentQueue.queue) {
    if (op.dependencies?.includes(operationId)) {
      op.dependencies = op.dependencies.filter(id => id !== operationId);
      debug(SUBSYSTEM.QUEUE, `Removed dependency ${operationId} from operation ${op.id}`);
    }
  }

  currentQueue.queue.splice(index, 1);
  await saveQueue();

  debug(SUBSYSTEM.QUEUE, `Removed operation ${operationId}`);

  // CONDITIONAL BLOCKING: Check if any remaining operations need blocking
  if (currentQueue.queue.length === 0) {
    // Queue empty - always unblock
    setQueueChatBlocking(false);
    debug(SUBSYSTEM.QUEUE, 'Chat UNBLOCKED - queue empty');
  } else {
    // Queue not empty - check if any remaining operations use "same as current" profile
    const needsBlocking = currentQueue.queue.some(op => shouldOperationBlockChat(op.type));

    if (!needsBlocking && isChatBlocked) {
      // All remaining operations use separate profiles - unblock chat
      setQueueChatBlocking(false);
      debug(SUBSYSTEM.QUEUE, 'Chat UNBLOCKED - remaining operations use separate profiles');
    } else if (needsBlocking && !isChatBlocked) {
      // At least one operation needs blocking - block chat
      setQueueChatBlocking(true);
      debug(SUBSYSTEM.QUEUE, 'Chat BLOCKED - remaining operations use same profile as user');
    }
  }

  return true;
}

export async function transferDependencies(fromOperationId , toOperationId ) {
  if (!fromOperationId || !toOperationId) {
    debug(SUBSYSTEM.QUEUE, 'transferDependencies called with invalid IDs');
    return;
  }

  let transferCount = 0;

  for (const op of currentQueue.queue) {
    if (op.dependencies?.includes(fromOperationId)) {
      op.dependencies = op.dependencies.filter(id => id !== fromOperationId);
      op.dependencies.push(toOperationId);
      transferCount++;
      debug(SUBSYSTEM.QUEUE, `Transferred dependency from ${fromOperationId} to ${toOperationId} for operation ${op.id} (${op.type})`);
    }
  }

  if (transferCount > 0) {
    await saveQueue();
    debug(SUBSYSTEM.QUEUE, `Transferred ${transferCount} dependencies from ${fromOperationId} to ${toOperationId}`);
  }
}

export async function clearCompletedOperations() {
  const before = currentQueue.queue.length;
  currentQueue.queue = currentQueue.queue.filter((op) =>
  op.status !== OperationStatus.COMPLETED
  );
  const removed = before - currentQueue.queue.length;

  if (removed > 0) {
    await saveQueue();
    debug(SUBSYSTEM.QUEUE, `Cleared ${removed} completed operations`);
    toast(`Cleared ${removed} completed operation(s)`, 'info');

    // Unblock chat if queue is now empty
    if (currentQueue.queue.length === 0) {
      setQueueChatBlocking(false);
    }
  }

  return removed;
}

export async function clearAllOperations() {
  const count = currentQueue.queue.length;

  // Set clearing flag to prevent new operations from being enqueued
  currentQueue.isClearing = true;
  debug(SUBSYSTEM.QUEUE, 'Setting isClearing flag to prevent new operations during clear');

  // Increment queue version to invalidate any in-flight operations
  currentQueue.queueVersion++;
  debug(SUBSYSTEM.QUEUE, `Incremented queue version to ${currentQueue.queueVersion} - invalidating in-flight operations`);

  // Abort all IN_PROGRESS/RETRYING operations FIRST (before removing from queue)
  // This triggers their abort controllers, stopping execution immediately
  const activeOps = currentQueue.queue.filter(op =>
    op.status === OperationStatus.IN_PROGRESS ||
    op.status === OperationStatus.RETRYING
  );

  for (const op of activeOps) {
    // Abort the AbortController signal (allows handlers to check signal.aborted)
    if (op.abortController && typeof op.abortController.abort === 'function') {
      op.abortController.abort('Queue cleared by user');
    }

    // Also reject the Promise wrapper (for executeOperation's Promise.race)
    const controller = currentQueue.activeOperationControllers.get(op.id);
    if (controller?.reject) {
      debug(SUBSYSTEM.QUEUE, `Aborting ${op.status} operation ${op.id} during queue clear`);
      controller.reject(new Error('Queue cleared by user'));
    }
  }

  if (activeOps.length > 0) {
    debug(SUBSYSTEM.QUEUE, `Aborted ${activeOps.length} active operation(s)`);
  }

  // Stop the queue processor first to prevent operations from continuing
  if (queueProcessor) {
    debug(SUBSYSTEM.QUEUE, 'Stopping queue processor before clearing operations');
    // Set paused flag to stop processor loop
    const wasPaused = currentQueue.paused;
    currentQueue.paused = true;

    // Wait for processor to stop (it checks paused flag on each iteration)
    await new Promise((resolve) => setTimeout(resolve, FULL_COMPLETION_PERCENTAGE));
    queueProcessor = null;

    // Restore paused state
    currentQueue.paused = wasPaused;
  }

  // Clear all operations regardless of type or status
  currentQueue.queue = [];
  currentQueue.current_operation_id = null;

  await saveQueue(true); // Force save without reload

  // Unblock chat since queue is now empty
  setQueueChatBlocking(false);

  // Clear the flag after a short delay to allow any in-flight enqueue attempts to be rejected
  await new Promise((resolve) => setTimeout(resolve, UI_UPDATE_DELAY_MS));
  currentQueue.isClearing = false;
  debug(SUBSYSTEM.QUEUE, 'Cleared isClearing flag - enqueue operations now allowed');

  debug(SUBSYSTEM.QUEUE, `Cleared all ${count} operations (including in-progress)`);
  toast(`Cleared all ${count} operation(s)`, 'info');

  return count;
}

export async function pauseQueue() {
  currentQueue.paused = true;
  await saveQueue();
  log(SUBSYSTEM.QUEUE, 'Queue paused');
  toast('Operation queue paused', 'info');
}

export async function resumeQueue() {
  currentQueue.paused = false;
  await saveQueue();
  log(SUBSYSTEM.QUEUE, 'Queue resumed');
  toast('Operation queue resumed', 'info');

  if (!isProcessorActive) {
    startQueueProcessor();
  }
}

export function isQueuePaused() {
  return currentQueue.paused;
}

export function isQueueProcessorActive() {
  return isProcessorActive;
}

function getNextOperation() {
  const pending = getPendingOperations();

  if (pending.length === 0) {
    return null;
  }

  // Filter out operations with unmet dependencies
  const ready = pending.filter((op) => {
    // Check dependencies
    if (!op.dependencies || op.dependencies.length === 0) {
      return true;
    }

    // Check if all dependencies are completed (or removed - removal implies completion)
    return op.dependencies.every((depId) => {
      const dep = getOperation(depId);
      if (!dep) {
        // Operation was removed after completion - treat as satisfied
        // This handles race condition where dependency completes before dependent op is queued
        debug(SUBSYSTEM.QUEUE, `Dependency ${depId} for ${op.id} not found (already removed) - treating as satisfied`);
        return true;
      }
      return dep.status === OperationStatus.COMPLETED;
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

const operationHandlers = new Map();

export function registerOperationHandler(operationType , handler ) {
  // handler returns any because different operations return different result types - legitimate use of any
  operationHandlers.set(operationType, handler);
  debug(SUBSYSTEM.QUEUE, `Registered handler for ${operationType}`);
}

// Core queue processor: abort handling, retry logic, error recovery
// eslint-disable-next-line complexity -- Queue processor handles abort, retry, and error recovery
async function executeOperation(operation ) {
  // returns any because different operations return different result types - legitimate use of any
  const handler = operationHandlers.get(operation.type);

  if (!handler) {
    throw new Error(`No handler registered for operation type: ${operation.type}`);
  }

  debug(SUBSYSTEM.QUEUE, `Executing ${operation.type}:`, operation.id);
  await updateOperationStatus(operation.id, OperationStatus.IN_PROGRESS);

  // Register abort controller for this operation
  // Allows manual cancellation via removeOperation() while IN_PROGRESS
  let abortReject = null;
  const abortPromise = new Promise((_resolve, reject) => {
    abortReject = reject;
  });
  currentQueue.activeOperationControllers.set(operation.id, { reject: abortReject });

  try {
    debug(SUBSYSTEM.QUEUE, `[LIFECYCLE] About to call handler for ${operation.type}, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
    // Race between handler completion and manual abort
    // If user removes operation while IN_PROGRESS, abort wins and throws
    const result = await Promise.race([
      handler(operation),
      abortPromise
    ]);
    debug(SUBSYSTEM.QUEUE, `[LIFECYCLE] Handler returned for ${operation.type}, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);

    // CRITICAL: Check if queue was cleared while we were executing
    // Defense-in-depth: Even if abort failed, this prevents completion/saving
    const currentOp = getOperation(operation.id);
    if (!currentOp || currentOp.queueVersion !== currentQueue.queueVersion) {
      debug(SUBSYSTEM.QUEUE, `Operation ${operation.id} invalidated by queue clear (version ${operation.queueVersion} != ${currentQueue.queueVersion}) - discarding result`);
      return null; // Don't mark as completed, don't save results
    }

    // If a compaction just finished, stash the compacted content onto any dependent merges before
    // the dependency gets removed. Otherwise those merges fall back to stale pre-compaction content.
    if (operation.type === OperationType.COMPACT_LOREBOOK_ENTRY && result?.compactedContent) {
      const dependents = currentQueue.queue.filter((op) =>
        Array.isArray(op.dependencies) &&
        op.dependencies.includes(operation.id) &&
        op.type === OperationType.MERGE_LOREBOOK_ENTRY
      );

      if (dependents.length > 0) {
        const updatePromises = dependents.map((dep) => updateOperationMetadata(dep.id, {
          compactedContent: result.compactedContent,
          compactedContentOpId: operation.id,
          was_compacted: true
        }));
        await Promise.all(updatePromises);
      }
    }

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
    const errText = err && err.message ? String(err.message) : String(err);

    // Since SillyTavern strips error details, we can't detect rate limits specifically.
    // "Bad Request" could be a rate limit, so we retry on ALL errors with exponential backoff.
    // Only fail on truly non-retryable errors (auth failures, etc.)

    // Check if operation was cancelled by user (from removeOperation)
    const wasCancelled = /cancelled by user/i.test(errText);

    if (wasCancelled) {
      // Operation was manually cancelled - already marked as CANCELLED and removed
      debug(SUBSYSTEM.QUEUE, `Operation ${operation.id} was cancelled by user, aborting`);
      return null;
    }

    // Only these errors are truly non-retryable (very conservative list)
    const nonRetryable = /unauthorized|forbidden|authentication.?required|invalid.?api.?key/i.test(errText);

    if (nonRetryable) {
      await updateOperationStatus(operation.id, OperationStatus.FAILED, errText);
      await removeOperation(operation.id);
      toast(`Queue operation failed (${operation.type}): ${errText}`, 'error');
      return null;
    }

    // Check max retry limit
    const settings = get_settings();
    const maxRetries = settings?.max_retries ?? 0; // Default to 0 (unlimited) if not set

    // If max_retries is 0, retry indefinitely; otherwise check limit
    if (maxRetries > 0 && operation.retries >= maxRetries) {
      await updateOperationStatus(operation.id, OperationStatus.FAILED, `Max retries (${maxRetries}) exceeded: ${errText}`);
      await removeOperation(operation.id);
      toast(`Queue operation failed after ${maxRetries} retries (${operation.type}): ${errText}`, 'error');
      return null;
    }

    // Retry with exponential backoff on ALL other errors (including "Bad Request" which may be rate limits)
    // INTENTIONAL: Unlimited retries by default (max_retries = 0)
    // WHY: LLM API errors are often transient (rate limits, temporary outages)
    // HOW TO STOP: User manually removes operation from queue UI during backoff
    operation.retries++;
    const backoffDelay = Math.min(DEFAULT_POLLING_INTERVAL * Math.pow(2, operation.retries - 1) * ONE_SECOND_MS, QUEUE_OPERATION_TIMEOUT_MS);
    await updateOperationStatus(operation.id, OperationStatus.RETRYING, `Retry ${operation.retries}${maxRetries > 0 ? `/${maxRetries}` : ''} after ${backoffDelay / ONE_SECOND_MS}s: ${errText}`);
    log(SUBSYSTEM.QUEUE, `⚠️ Operation failed (likely rate limit)! Waiting ${backoffDelay / ONE_SECOND_MS}s before retry ${operation.retries}${maxRetries > 0 ? `/${maxRetries}` : ''}`);
    await saveQueue();
    notifyUIUpdate(); // Update UI to show retrying status
    await new Promise((resolve) => setTimeout(resolve, backoffDelay));

    // CRITICAL: Check if operation was manually removed during backoff
    // This allows users to abort retrying operations by removing them from the queue UI
    if (!getOperation(operation.id)) {
      debug(SUBSYSTEM.QUEUE, `Operation ${operation.id} was removed during backoff, aborting retry`);
      return null;
    }

    // Check if queue was paused during backoff
    // If paused, reset operation to PENDING so it can be picked up when queue resumes
    if (currentQueue.paused) {
      debug(SUBSYSTEM.QUEUE, `Queue paused during backoff for ${operation.id}, aborting retry`);
      await updateOperationStatus(operation.id, OperationStatus.PENDING);
      return null;
    }

    debug(SUBSYSTEM.QUEUE, `Retrying ${operation.type} after backoff (retry ${operation.retries})...`);
    return await executeOperation(operation);
  } finally {
    // Cleanup: Remove abort controller for this operation
    // This happens whether operation succeeded, failed, or was aborted
    currentQueue.activeOperationControllers.delete(operation.id);
    debug(SUBSYSTEM.QUEUE, `Cleaned up abort controller for operation ${operation.id}`);
  }
}

function startQueueProcessor() {
  // CRITICAL: Reentrancy guard - prevent multiple processor loops from running concurrently
  if (isProcessorActive) {
    debug(SUBSYSTEM.QUEUE, 'Queue processor already active, skipping start (reentrancy protection)');
    return;
  }

  // Set flag BEFORE starting async IIFE to prevent race conditions
  isProcessorActive = true;
  debug(SUBSYSTEM.QUEUE, 'Starting queue processor (isProcessorActive = true)');

  // CONDITIONAL BLOCKING: Check if any operations need blocking (safety fallback)
  const needsBlocking = currentQueue.queue.some(op => shouldOperationBlockChat(op.type));
  if (needsBlocking) {
    setQueueChatBlocking(true);
    debug(SUBSYSTEM.QUEUE, 'Chat blocked - at least one operation uses same profile');
  } else {
    debug(SUBSYSTEM.QUEUE, 'Chat NOT blocked - all operations use separate profiles');
  }

  queueProcessor = (async () => {
    try {
      while (true) {
        debug(SUBSYSTEM.QUEUE, `[LOOP] Start of iteration, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);

        // Check if paused
        if (currentQueue.paused) {
          debug(SUBSYSTEM.QUEUE, 'Queue paused, stopping processor (chat remains blocked)');
          // Do NOT unblock chat - it stays blocked even when paused
          queueProcessor = null;
          isProcessorActive = false; // CRITICAL: Clear flag on exit
          return;
        }

        // Get next operation
        const operation = getNextOperation();

        if (!operation) {
          debug(SUBSYSTEM.QUEUE, 'No operations to process, stopping processor');
          // Only unblock when queue is fully empty
          setQueueChatBlocking(false);
          queueProcessor = null;
          isProcessorActive = false; // CRITICAL: Clear flag on exit
          notifyUIUpdate();
          return;
        }

      debug(SUBSYSTEM.QUEUE, `[LOOP] Found operation: ${operation.type}, id: ${operation.id}`);

      // Check if operation has pause flag set
      if (operation.pauseBeforeExecution) {
        log(SUBSYSTEM.QUEUE, `Operation ${operation.id} (${operation.type}) has pause flag set - pausing queue`);
        operation.pauseBeforeExecution = false; // Clear flag so it doesn't pause again
        currentQueue.paused = true;
        // Sequential execution required: queue must be saved before pausing
        // eslint-disable-next-line no-await-in-loop -- Queue state must be persisted before pausing
        await saveQueue();
        toast(`Queue paused before: ${operation.type}`, 'info');
        queueProcessor = null;
        isProcessorActive = false;
        notifyUIUpdate();
        return;
      }

      // Mark operation as in progress BEFORE saving
      currentQueue.current_operation_id = operation.id;
      operation.status = OperationStatus.IN_PROGRESS ;
      if (!operation.started_at) {
        operation.started_at = Date.now();
      }
      // Sequential execution required: queue must be saved before executing operation
      // eslint-disable-next-line no-await-in-loop -- Queue state must be persisted before each operation
      await saveQueue();

      debug(SUBSYSTEM.QUEUE, `[LOOP] About to execute operation, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
      try {
        // Sequential execution required: operations must execute one at a time in order
        // eslint-disable-next-line no-await-in-loop -- Operations must execute sequentially to prevent race conditions
        await executeOperation(operation);
      } catch {


        // Error already handled in executeOperation
        // Continue processing other operations
      }debug(SUBSYSTEM.QUEUE, `[LOOP] After executeOperation, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
      // Sequential execution required: rate limiting delay between operations
      debug(SUBSYSTEM.QUEUE, `[LOOP] Starting 5-second delay, queue state: blocked=${String(isChatBlocked)}`);
      // eslint-disable-next-line no-await-in-loop -- Rate limiting delay required between operations
      await new Promise((resolve) => setTimeout(resolve, OPERATION_FETCH_TIMEOUT_MS));
      debug(SUBSYSTEM.QUEUE, `[LOOP] After 5-second delay, queue state: blocked=${String(isChatBlocked)}, queueLength=${currentQueue?.queue?.length ?? 0}`);
    }
    } finally {
      // CRITICAL: Always clear the active flag when processor exits (safety net)
      isProcessorActive = false;
      queueProcessor = null;
      debug(SUBSYSTEM.QUEUE, 'Queue processor exiting (isProcessorActive = false)');
    }
  })();
}

export function registerUIUpdateCallback(callback ) {
  uiUpdateCallback = callback;
  debug(SUBSYSTEM.QUEUE, 'Registered UI update callback');
}

function notifyUIUpdate() {
  if (uiUpdateCallback) {
    try {
      uiUpdateCallback();
    } catch (err) {
      error(SUBSYSTEM.QUEUE, 'UI update callback error:', err);
    }
  }
}

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
  reloadQueue,
  enqueueOperation,
  getOperation,
  getAllOperations,
  getPendingOperations,
  getInProgressOperations,
  getCompletedOperations,
  getFailedOperations,
  updateOperationStatus,
  updateOperationMetadata,
  toggleOperationPauseFlag,
  removeOperation,
  clearCompletedOperations,
  clearAllOperations,
  pauseQueue,
  resumeQueue,
  isQueuePaused,
  isQueueProcessorActive,
  registerOperationHandler,
  registerUIUpdateCallback,
  getQueueStats,
  OperationStatus,
  OperationType
};

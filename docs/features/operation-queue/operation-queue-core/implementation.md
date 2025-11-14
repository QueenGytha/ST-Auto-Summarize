# Operation Queue System - Implementation Documentation

## Overview

The Operation Queue System is a persistent, sequential operation processor that handles all async operations in ST-Auto-Recap. It queues operations, processes them one-at-a-time, persists state to survive page reloads, supports priorities and dependencies, and can block chat while processing critical operations.

**Key File**: `operationQueue.js` (1033 lines)

**Core Design Principles**:
- **Sequential Execution**: One operation at a time to prevent race conditions
- **Persistent State**: Queue state stored in lorebook entry (survives page reload)
- **Graceful Recovery**: Handles crashes, aborts, retries with exponential backoff
- **Chat Blocking**: Blocks user input when operations use same connection profile
- **Handler Architecture**: Pluggable handlers for each operation type

---

## Architecture

### File Structure

```
ST-Auto-Recap/
├── operationQueue.js          # Core queue (1033 lines) - state, processor, persistence
├── operationTypes.js          # Operation type constants (18 lines)
├── operationHandlers.js       # Handler registration (903 lines) - one handler per operation type
├── operationQueueUI.js        # UI display in navbar (641 lines)
├── operationContext.js        # Thread-local context for LLM calls (30 lines)
├── queueIntegration.js        # Helper functions to enqueue operations (317 lines)
└── lorebookManager.js         # Queue persistence via lorebook entries
```

### Module Dependencies

```
operationQueue.js
    ↓ imports
├── index.js (barrel exports)
├── world-info.js (SillyTavern lorebook APIs)
└── constants.js (timeouts, limits)

operationHandlers.js
    ↓ imports
├── operationQueue.js (enqueueOperation, registerOperationHandler)
├── recapValidation.js (validate_recap)
├── autoSceneBreakDetection.js (detectSceneBreak)
├── sceneBreak.js (generateSceneRecap)
├── runningSceneRecap.js (generate_running_scene_recap, combine_scene_with_running_recap)
├── recapToLorebookProcessor.js (lorebook pipeline stages)
├── lorebookEntryMerger.js (mergeLorebookEntry)
└── lorebookManager.js (addLorebookEntry, updateRegistryEntryContent)

operationQueueUI.js
    ↓ imports
├── operationQueue.js (getAllOperations, pauseQueue, removeOperation)
└── index.js (selectors, debug utilities)
```

---

## Data Structures

### Operation Object

```javascript
interface Operation {
  // Identity
  id: string;                    // Generated: "op_1234567890_abc123"
  type: OperationType;           // e.g., "validate_recap", "detect_scene_break"

  // Parameters (operation-specific)
  params: any;                   // { recap, type } for validation, { index } for scene recap, etc.

  // Status tracking
  status: OperationStatus;       // "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "retrying"
  created_at: number;            // Unix timestamp (milliseconds)
  started_at: number | null;     // When execution began
  completed_at: number | null;   // When execution finished

  // Error handling
  error: string | null;          // Error message if failed/retrying
  retries: number;               // Retry counter (for exponential backoff)

  // Queue management
  priority: number;              // Higher = runs first (0 = default)
  dependencies: string[];        // Array of operation IDs that must complete first
  queueVersion: number;          // Version stamp (invalidated on queue clear)

  // Metadata (operation-specific, for UI display)
  metadata: {
    entry_comment?: string;      // Lorebook entry name
    scene_index?: number;        // Message index for scene operations
    hasPrefill?: boolean;        // Whether operation uses prefill
    includePresetPrompts?: boolean; // Whether operation includes preset prompts
    triggered_by?: string;       // What triggered this operation
    // ... other operation-specific metadata
  };

  // Runtime (not serialized to storage)
  abortController: AbortController; // For cancelling in-flight operations
}
```

### Queue State

```javascript
interface QueueState {
  queue: Operation[];                 // All operations (pending, in_progress, failed)
  current_operation_id: string | null; // ID of currently executing operation
  paused: boolean;                     // Whether queue is paused
  version: number;                     // Queue version (incremented on clear)
}
```

### Operation Status Constants

```javascript
export const OperationStatus = {
  PENDING: 'pending',           // Queued, waiting to execute
  IN_PROGRESS: 'in_progress',   // Currently executing
  COMPLETED: 'completed',       // Successfully finished (auto-removed)
  FAILED: 'failed',            // Failed permanently (max retries or non-retryable error)
  CANCELLED: 'cancelled',      // Cancelled by user
  RETRYING: 'retrying'         // Waiting to retry after failure
};
```

### Operation Type Constants

```javascript
export const OperationType = {
  // Scene operations
  VALIDATE_RECAP: 'validate_recap',                     // Validate recap for errors
  DETECT_SCENE_BREAK: 'detect_scene_break',            // Detect scene break in range
  GENERATE_SCENE_RECAP: 'generate_scene_recap',        // Generate scene recap
  GENERATE_RUNNING_RECAP: 'generate_running_recap',    // Generate running recap (bulk)
  COMBINE_SCENE_WITH_RUNNING: 'combine_scene_with_running', // Combine scene with running

  // Lorebook operations (multi-stage pipeline)
  LOREBOOK_ENTRY_LOOKUP: 'lorebook_entry_lookup',      // Stage 1: Lookup existing entries
  RESOLVE_LOREBOOK_ENTRY: 'resolve_lorebook_entry',    // Stage 2: Deduplicate (conditional)
  CREATE_LOREBOOK_ENTRY: 'create_lorebook_entry',      // Stage 3: Create or merge
  MERGE_LOREBOOK_ENTRY: 'merge_lorebook_entry',        // Standalone merge
  UPDATE_LOREBOOK_REGISTRY: 'update_lorebook_registry', // Stage 4: Update registry
  POPULATE_REGISTRIES: 'populate_registries',          // Bulk registry population

  CHAT: 'chat'                                         // User chat message (for blocking)
};
```

---

## Queue Persistence

### Storage Location

Queue state is stored in a **disabled lorebook entry** in the chat's attached lorebook:

```javascript
// Entry comment identifier
const QUEUE_ENTRY_NAME = '__operation_queue';

// Entry configuration
{
  uid: 1704067200000,           // Generated UID
  comment: '__operation_queue',  // Identifier
  content: JSON.stringify(queueState, null, 2), // Queue state as JSON
  disable: true,                // Never inject into context
  excludeRecursion: true,       // Never trigger other entries
  order: 9999,                  // Low priority
  key: [],                      // No activation keys
  keysecondary: []             // No secondary keys
}
```

### Why Lorebook Storage?

1. **Persistence**: Survives page reload (F5, browser restart)
2. **Per-Chat**: Each chat has its own queue state
3. **No Backend Changes**: Uses existing SillyTavern lorebook system
4. **Automatic Saving**: Piggybacks on ST's lorebook save mechanism

### Storage Functions

```javascript
async function loadQueue() {
  // 1. Find lorebook attached to current chat
  const lorebookName = chat_metadata?.[METADATA_KEY];

  // 2. Load lorebook entries
  const worldInfo = await loadWorldInfo(lorebookName);

  // 3. Find __operation_queue entry
  const queueEntry = worldInfo.entries.find(e => e.comment === QUEUE_ENTRY_NAME);

  // 4. Parse queue state from entry.content
  currentQueue = JSON.parse(queueEntry.content || '{}');

  // 5. Clean up stale operations (IN_PROGRESS -> PENDING after reload)
  for (const op of currentQueue.queue) {
    if (op.status === OperationStatus.IN_PROGRESS) {
      op.status = OperationStatus.PENDING;
    }
    // Recreate AbortController (not serialized)
    op.abortController = new AbortController();
  }
}

async function saveQueue(force = false) {
  // 1. Load lorebook fresh (avoid overwriting changes from other extensions)
  const worldInfo = await loadWorldInfo(lorebookName);

  // 2. Find queue entry
  const queueEntry = worldInfo.entries.find(e => e.comment === QUEUE_ENTRY_NAME);

  // 3. Update entry content
  queueEntry.content = JSON.stringify(currentQueue, null, 2);

  // 4. Save lorebook
  await saveWorldInfo(lorebookName, worldInfo, true);
}
```

---

## Queue Processor

### Sequential Execution Loop

The queue processor runs as a single async IIFE loop:

```javascript
function startQueueProcessor() {
  // CRITICAL: Reentrancy guard
  if (isProcessorActive) {
    debug('Queue processor already active, skipping start');
    return;
  }

  isProcessorActive = true;

  queueProcessor = (async () => {
    try {
      while (true) {
        // Check if paused
        if (currentQueue.paused) {
          queueProcessor = null;
          isProcessorActive = false;
          return;
        }

        // Get next operation (respects priorities and dependencies)
        const operation = getNextOperation();

        if (!operation) {
          // Queue empty - unblock chat and exit
          setQueueChatBlocking(false);
          queueProcessor = null;
          isProcessorActive = false;
          return;
        }

        // Mark as in progress
        operation.status = OperationStatus.IN_PROGRESS;
        currentQueue.current_operation_id = operation.id;
        await saveQueue();

        // Execute operation
        try {
          await executeOperation(operation);
        } catch {
          // Error already handled in executeOperation
        }

        // Rate limiting delay (5 seconds between operations)
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } finally {
      // Always clear active flag
      isProcessorActive = false;
      queueProcessor = null;
    }
  })();
}
```

### Operation Selection Algorithm

```javascript
function getNextOperation() {
  // 1. Get all pending operations
  const pending = currentQueue.queue.filter(op => op.status === OperationStatus.PENDING);

  if (pending.length === 0) {
    return null;
  }

  // 2. Filter by dependencies (only ready operations)
  const ready = pending.filter(op => {
    // No dependencies? Ready to run
    if (!op.dependencies || op.dependencies.length === 0) {
      return true;
    }

    // All dependencies completed? Ready to run
    return op.dependencies.every(depId => {
      const dep = getOperation(depId);
      return dep && dep.status === OperationStatus.COMPLETED;
    });
  });

  if (ready.length === 0) {
    return null; // All pending operations blocked by dependencies
  }

  // 3. Sort by priority (higher first), then by created_at (older first)
  ready.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority; // Higher priority first
    }
    return a.created_at - b.created_at; // Older first (FIFO within same priority)
  });

  return ready[0];
}
```

### Priority Levels

```javascript
// Priority scale (higher = runs first)
const PRIORITIES = {
  CRITICAL: 20,      // Scene recaps (highest)
  HIGH: 15,          // Lorebook registry updates
  MEDIUM: 12,        // Lorebook deduplication
  NORMAL: 11,        // Lorebook lookup
  LOW: 10,           // Running recap combine
  LOWEST: 5,         // Scene break detection
  DEFAULT: 0         // Validation, misc operations
};
```

**Priority Rules**:
- **Higher numbers run first**: Priority 20 executes before priority 10
- **Same priority = FIFO**: Oldest (earliest `created_at`) runs first
- **Dependencies override priority**: Dependent operations wait regardless of priority

---

## Operation Execution

### Execute Operation Flow

```javascript
async function executeOperation(operation) {
  const handler = operationHandlers.get(operation.type);

  if (!handler) {
    throw new Error(`No handler registered for operation type: ${operation.type}`);
  }

  // Update status
  await updateOperationStatus(operation.id, OperationStatus.IN_PROGRESS);

  // Register abort controller (for manual cancellation)
  let abortReject = null;
  const abortPromise = new Promise((_resolve, reject) => {
    abortReject = reject;
  });
  activeOperationControllers.set(operation.id, { reject: abortReject });

  try {
    // Race between handler completion and manual abort
    const result = await Promise.race([
      handler(operation),
      abortPromise
    ]);

    // CRITICAL: Check if queue was cleared during execution
    const currentOp = getOperation(operation.id);
    if (!currentOp || currentOp.queueVersion !== queueVersion) {
      debug('Operation invalidated by queue clear - discarding result');
      return null;
    }

    // Mark as completed
    await updateOperationStatus(operation.id, OperationStatus.COMPLETED);

    // Auto-remove completed operations
    await removeOperation(operation.id);

    return result;
  } catch (err) {
    const errText = String(err.message || err);

    // Check if operation was cancelled by user
    if (/cancelled by user/i.test(errText)) {
      debug('Operation cancelled by user, aborting');
      return null;
    }

    // Non-retryable errors (very conservative list)
    const nonRetryable = /unauthorized|forbidden|authentication.?required|invalid.?api.?key/i.test(errText);

    if (nonRetryable) {
      await updateOperationStatus(operation.id, OperationStatus.FAILED, errText);
      await removeOperation(operation.id);
      toast(`Queue operation failed (${operation.type}): ${errText}`, 'error');
      return null;
    }

    // Check max retry limit
    const settings = get_settings();
    const maxRetries = settings?.max_retries ?? 0; // 0 = unlimited

    if (maxRetries > 0 && operation.retries >= maxRetries) {
      await updateOperationStatus(operation.id, OperationStatus.FAILED, `Max retries (${maxRetries}) exceeded: ${errText}`);
      await removeOperation(operation.id);
      toast(`Queue operation failed after ${maxRetries} retries (${operation.type}): ${errText}`, 'error');
      return null;
    }

    // Retry with exponential backoff
    operation.retries++;
    const backoffDelay = Math.min(5000 * Math.pow(2, operation.retries - 1), 120000);
    await updateOperationStatus(operation.id, OperationStatus.RETRYING, `Retry ${operation.retries}${maxRetries > 0 ? `/${maxRetries}` : ''} after ${backoffDelay / 1000}s: ${errText}`);
    await saveQueue();
    await new Promise(resolve => setTimeout(resolve, backoffDelay));

    // Check if operation was removed during backoff
    if (!getOperation(operation.id)) {
      debug('Operation removed during backoff, aborting retry');
      return null;
    }

    // Retry recursively
    return await executeOperation(operation);
  } finally {
    // Cleanup: Remove abort controller
    activeOperationControllers.delete(operation.id);
  }
}
```

### Error Handling Strategy

**Default: Unlimited Retries**

By default, the queue retries ALL errors indefinitely with exponential backoff:
- **Rationale**: LLM API errors are often transient (rate limits, temporary outages)
- **Backoff**: 5s, 10s, 20s, 40s, 80s, capped at 120s
- **User Control**: User can manually remove operations from queue UI during backoff

**Max Retries Setting**:
- `max_retries = 0` (default): Unlimited retries
- `max_retries > 0`: Fail after N retries

**Non-Retryable Errors**:
Only these errors fail immediately without retry:
- `unauthorized` / `forbidden`
- `authentication required`
- `invalid api key`

**Retry Display**:
- Status changes to `RETRYING`
- Error message shows: "Retry 1 after 5s: Bad Request"
- UI displays spinning icon with retry counter

---

## Handler Architecture

### Handler Registration

Handlers are registered at initialization via `registerAllOperationHandlers()`:

```javascript
export function registerOperationHandler(operationType, handler) {
  operationHandlers.set(operationType, handler);
  debug(`Registered handler for ${operationType}`);
}

// In operationHandlers.js
export function registerAllOperationHandlers() {
  // Validate recap
  registerOperationHandler(OperationType.VALIDATE_RECAP, async (operation) => {
    const { recap, type } = operation.params;
    const signal = getAbortSignal(operation);

    const isValid = await validate_recap(recap, type);

    throwIfAborted(signal, 'VALIDATE_RECAP', 'validation');

    return { isValid };
  });

  // Detect scene break (range-based)
  registerOperationHandler(OperationType.DETECT_SCENE_BREAK, async (operation) => {
    const { startIndex, endIndex, offset = 0 } = operation.params;
    const signal = getAbortSignal(operation);

    const result = await detectSceneBreak(startIndex, endIndex, offset);

    throwIfAborted(signal, 'DETECT_SCENE_BREAK', 'LLM call');

    // ... validation, scene break placement, recursive queueing

    return result;
  });

  // ... 10+ more handlers (see operationHandlers.js)
}
```

### Handler Pattern

All handlers follow this pattern:

```javascript
async (operation) => {
  // 1. Extract params
  const { param1, param2 } = operation.params;
  const signal = getAbortSignal(operation);

  // 2. Execute operation logic (LLM call, data processing, etc.)
  const result = await doSomething(param1, param2);

  // 3. Check if cancelled after LLM call (before side effects)
  throwIfAborted(signal, 'OPERATION_TYPE', 'LLM call');

  // 4. Apply side effects (update data, enqueue follow-up operations)
  await updateData(result);
  await enqueueOperation(OperationType.NEXT_STAGE, { ... });

  // 5. Return result
  return result;
}
```

### Abort Signal Pattern

Operations can be cancelled mid-execution:

```javascript
// Get abort signal from operation
const signal = getAbortSignal(operation);

// Pass signal to async operations
const response = await fetch(url, { signal });

// Check if aborted after async operations (before side effects)
throwIfAborted(signal, 'OPERATION_TYPE', 'LLM call');

// throwIfAborted throws Error('Operation cancelled by user') if signal.aborted
```

**Why Check After LLM Calls?**:
- LLM calls are expensive (time, tokens, cost)
- Side effects (data updates, UI changes) should not apply if cancelled
- Abort signal allows graceful cancellation without corrupting state

---

## Chat Blocking Mechanism

### Conditional Blocking

The queue blocks chat input **only when operations use the same connection profile as the user**:

```javascript
// Check if operation blocks chat
function shouldOperationBlockChat(operationType) {
  // Get connection profile for this operation type
  const profile = get_settings(`${operationType}_connection_profile`);

  // Empty profile = "same as current" = MUST BLOCK (conflict risk)
  // Non-empty profile = separate connection = DON'T BLOCK (concurrent operation)
  return !profile || profile.trim() === '';
}

// Block chat when needed
if (shouldOperationBlockChat(operation.type)) {
  setQueueChatBlocking(true);
  debug('Chat BLOCKED - operation uses same profile as user');
} else {
  debug('Chat NOT blocked - operation uses separate profile');
}
```

### Blocking Implementation

```javascript
function setQueueChatBlocking(blocked) {
  if (isChatBlocked === blocked) {
    // Already in desired state, skip
    return;
  }

  isChatBlocked = blocked;

  // Control button blocking state (blocks ST's activateSendButtons)
  setQueueBlocking(blocked);

  debug(`Chat ${blocked ? 'BLOCKED' : 'UNBLOCKED'} by operation queue`);
  notifyUIUpdate();
}
```

**Blocking Lifecycle**:
1. **Queue empty**: Chat unblocked
2. **Operation added (same profile)**: Chat blocked immediately
3. **Operation in progress**: Chat remains blocked
4. **Operation completes**: Check remaining operations
   - If any remaining use same profile: Keep blocked
   - If all remaining use separate profiles: Unblock
5. **Queue empty**: Chat unblocked

### Button and Enter Key Interception

```javascript
// Install interceptors at queue initialization
async function initOperationQueue() {
  // ...

  const { installButtonInterceptor, installEnterKeyInterceptor } = await import('./index.js');
  installButtonInterceptor();  // Blocks send button clicks
  installEnterKeyInterceptor(); // Blocks Enter key presses
}

// Button interceptor (in index.js)
function installButtonInterceptor() {
  $(document).on('click', selectorsSillyTavern.chat.sendButton, function(e) {
    if (isChatBlockedByQueue()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('Operation queue is processing', 'warning');
      return false;
    }
  });
}

// Enter key interceptor (in index.js)
function installEnterKeyInterceptor() {
  $(document).on('keydown', selectorsSillyTavern.chat.input, function(e) {
    if (e.key === 'Enter' && !e.shiftKey && isChatBlockedByQueue()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('Operation queue is processing', 'warning');
      return false;
    }
  });
}
```

---

## Queue Management Functions

### Enqueue Operation

```javascript
export async function enqueueOperation(type, params, options = {}) {
  // Check if queue is being cleared
  if (isClearing) {
    debug(`Rejecting enqueue of ${type} - queue is being cleared`);
    return null;
  }

  // Check if queue version changed (queue was cleared while this was pending)
  if (options.queueVersion !== undefined && options.queueVersion !== queueVersion) {
    debug(`Rejecting enqueue of ${type} - queue was cleared (version mismatch)`);
    return null;
  }

  // Create operation object
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
    priority: options.priority ?? 0,
    dependencies: options.dependencies ?? [],
    metadata: options.metadata ?? {},
    queueVersion: queueVersion,
    abortController: new AbortController()
  };

  // Add to queue
  const wasEmpty = currentQueue.queue.length === 0;
  currentQueue.queue.push(operation);
  await saveQueue();

  debug(`Enqueued ${type} operation: ${operation.id}`);

  // Block chat if needed
  if (wasEmpty && shouldOperationBlockChat(type)) {
    setQueueChatBlocking(true);
  }

  // Auto-start processor if not paused
  if (!currentQueue.paused && !isProcessorActive) {
    startQueueProcessor();
  }

  return operation.id;
}
```

### Remove Operation

```javascript
export async function removeOperation(operationId) {
  const index = currentQueue.queue.findIndex(op => op.id === operationId);
  if (index === -1) {
    return false;
  }

  const operation = currentQueue.queue[index];

  // If IN_PROGRESS/RETRYING, abort it first
  if (operation.status === OperationStatus.IN_PROGRESS || operation.status === OperationStatus.RETRYING) {
    // Abort the AbortController signal
    if (operation.abortController) {
      operation.abortController.abort('Operation cancelled by user');
    }

    // Reject the Promise wrapper (for executeOperation's Promise.race)
    const controller = activeOperationControllers.get(operationId);
    if (controller?.reject) {
      controller.reject(new Error('Operation cancelled by user'));
      await updateOperationStatus(operationId, OperationStatus.CANCELLED);
      toast(`Operation cancelled: ${operation.type}`, 'warning');
    }
  }

  // Remove from dependencies of other operations
  for (const op of currentQueue.queue) {
    if (op.dependencies?.includes(operationId)) {
      op.dependencies = op.dependencies.filter(id => id !== operationId);
    }
  }

  // Remove from queue
  currentQueue.queue.splice(index, 1);
  await saveQueue();

  debug(`Removed operation ${operationId}`);

  // Check if chat should be unblocked
  if (currentQueue.queue.length === 0) {
    setQueueChatBlocking(false);
  } else {
    const needsBlocking = currentQueue.queue.some(op => shouldOperationBlockChat(op.type));
    if (!needsBlocking && isChatBlocked) {
      setQueueChatBlocking(false);
    }
  }

  return true;
}
```

### Clear All Operations

```javascript
export async function clearAllOperations() {
  const count = currentQueue.queue.length;

  // Set clearing flag to prevent new operations
  isClearing = true;

  // Increment queue version to invalidate in-flight operations
  queueVersion++;

  // Abort all active operations
  const activeOps = currentQueue.queue.filter(op =>
    op.status === OperationStatus.IN_PROGRESS || op.status === OperationStatus.RETRYING
  );

  for (const op of activeOps) {
    // Abort signal
    if (op.abortController) {
      op.abortController.abort('Queue cleared by user');
    }

    // Reject promise
    const controller = activeOperationControllers.get(op.id);
    if (controller?.reject) {
      controller.reject(new Error('Queue cleared by user'));
    }
  }

  // Stop processor
  if (queueProcessor) {
    const wasPaused = currentQueue.paused;
    currentQueue.paused = true;
    await new Promise(resolve => setTimeout(resolve, 100));
    queueProcessor = null;
    currentQueue.paused = wasPaused;
  }

  // Clear queue
  currentQueue.queue = [];
  currentQueue.current_operation_id = null;
  await saveQueue(true);

  // Unblock chat
  setQueueChatBlocking(false);

  // Clear flag after delay
  await new Promise(resolve => setTimeout(resolve, 250));
  isClearing = false;

  debug(`Cleared all ${count} operations`);
  toast(`Cleared all ${count} operation(s)`, 'info');

  return count;
}
```

### Pause/Resume Queue

```javascript
export async function pauseQueue() {
  currentQueue.paused = true;
  await saveQueue();
  log('Queue paused');
  toast('Operation queue paused', 'info');
}

export async function resumeQueue() {
  currentQueue.paused = false;
  await saveQueue();
  log('Queue resumed');
  toast('Operation queue resumed', 'info');

  if (!isProcessorActive) {
    startQueueProcessor();
  }
}
```

---

## UI Integration

### Queue Display

The queue UI is displayed in a navbar panel with:

- **Header**: Operation count, pause/resume button, clear all button, collapse/expand toggle
- **Operation List**: All pending/in_progress/failed/retrying operations
- **Per-Operation Display**:
  - Status icon (spinning for in_progress, clock for pending, etc.)
  - Operation type (formatted for readability)
  - Parameters (message index, entry name, etc.)
  - Retry counter (if retrying)
  - Error message (if failed/retrying)
  - Remove button (cancel and remove)

```javascript
// Navbar structure
<div id="shared_operation_queue_ui">
  <div class="queue-header">
    <h4>Operations <span id="queue_count">(3)</span></h4>
    <button id="queue_toggle_pause" class="fa-pause" title="Pause queue"></button>
    <button id="queue_clear_all" class="fa-trash" title="Clear all"></button>
    <i class="fa-chevron-up"></i> <!-- Collapse/expand toggle -->
  </div>
  <div id="queue_list_container" class="queue-list">
    <div id="queue_operations_list">
      <!-- Operations rendered here -->
      <div class="queue-operation" style="background: rgba(33,150,243,0.1);">
        <div class="queue-operation-header">
          <div class="queue-operation-icon">
            <i class="fa-spinner fa-spin" style="color: var(--SmartThemeBodyColor);"></i>
          </div>
          <div class="queue-operation-content">
            <div class="queue-operation-type">Scene Recap</div>
            <div class="queue-operation-params">Message #42</div>
          </div>
          <button class="queue-operation-remove fa-times" data-operation-id="op_123_abc" title="Cancel and Remove"></button>
        </div>
      </div>
    </div>
  </div>
</div>
```

### UI Update Callback

```javascript
// Register callback to update UI when queue changes
registerUIUpdateCallback(updateQueueDisplay);

// Queue calls this whenever state changes
function notifyUIUpdate() {
  if (uiUpdateCallback) {
    try {
      uiUpdateCallback();
    } catch (err) {
      error('UI update callback error:', err);
    }
  }
}
```

### Operation Display Sorting

Operations are sorted in UI for optimal visibility:

1. **IN_PROGRESS** first (most important)
2. **RETRYING** second (requires attention)
3. **PENDING** third (waiting to run)
4. **FAILED** fourth (needs user action)
5. Within same status: Higher priority first, then older first

---

## Integration Points

### Scene Break Detection

```javascript
// In autoSceneBreakDetection.js
await enqueueOperation(
  OperationType.DETECT_SCENE_BREAK,
  { startIndex, endIndex, offset },
  { priority: 5 }
);
```

### Scene Recap Generation

```javascript
// In sceneBreak.js
await enqueueOperation(
  OperationType.GENERATE_SCENE_RECAP,
  { index },
  { priority: 20, metadata: { scene_index: index } }
);
```

### Lorebook Processing

```javascript
// In queueIntegration.js
// Stage 1: Lookup
await enqueueOperation(
  OperationType.LOREBOOK_ENTRY_LOOKUP,
  { entryId, entryData, registryListing, typeList },
  { priority: 11 }
);

// Stage 2: Deduplicate (conditional, enqueued by Stage 1 handler)
await enqueueOperation(
  OperationType.RESOLVE_LOREBOOK_ENTRY,
  { entryId },
  { priority: 12 }
);

// Stage 3: Create or Merge (enqueued by Stage 1 or 2 handler)
await enqueueOperation(
  OperationType.CREATE_LOREBOOK_ENTRY,
  { entryId, action: 'create' },
  { priority: 14 }
);

// Stage 4: Update Registry (enqueued by Stage 3 handler)
await enqueueOperation(
  OperationType.UPDATE_LOREBOOK_REGISTRY,
  { entryId, entityType, entityId },
  { priority: 14 }
);
```

### Running Scene Recap

```javascript
// In queueIntegration.js
await enqueueOperation(
  OperationType.COMBINE_SCENE_WITH_RUNNING,
  { index },
  {
    priority: 10,
    dependencies: lorebookOpIds // Wait for lorebook operations to complete
  }
);
```

---

## Queue Statistics

```javascript
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
```

---

## Initialization

```javascript
export async function initOperationQueue() {
  if (isInitialized) {
    debug('Operation queue already initialized');
    return;
  }

  log('>>> Initializing operation queue system <<<');

  // Load queue from storage
  await loadQueue();

  // Ensure queue entry exists in lorebook
  const queueEntry = await getQueueEntry();

  // Restore chat blocking state if operations are queued
  if (currentQueue && currentQueue.queue.length > 0) {
    const needsBlocking = currentQueue.queue.some(op => shouldOperationBlockChat(op.type));
    if (needsBlocking) {
      setQueueChatBlocking(true);
    }
  }

  // Install button and Enter key interceptors
  const { installButtonInterceptor, installEnterKeyInterceptor } = await import('./index.js');
  installButtonInterceptor();
  installEnterKeyInterceptor();

  isInitialized = true;
  log('✓ Operation queue system initialized successfully');
}
```

---

## Testing Considerations

### Test Overrides

Tests can override operation behavior using global test overrides:

```javascript
// In test file
globalThis.__TEST_RECAP_TEXT_RESPONSE = 'Mock recap text';

// operationHandlers.js checks for this override
const __override = globalThis.__TEST_RECAP_TEXT_RESPONSE;
if (typeof __override === 'string') {
  return __override;
}
```

### Queue State Inspection

```javascript
// Get all operations
const operations = getAllOperations();

// Get operation by ID
const operation = getOperation(operationId);

// Check queue status
const isActive = isQueueActive();
const isPaused = isQueuePaused();
const isBlocked = isChatBlockedByQueue();

// Get stats
const stats = getQueueStats();
```

---

## Best Practices

### When to Use the Queue

**Always Use Queue For**:
- LLM calls (scene recaps, validation, detection)
- Lorebook operations (create, merge, registry updates)
- Operations that depend on other operations
- Operations that need to run sequentially

**Don't Use Queue For**:
- Synchronous operations (UI updates, data reads)
- Operations that need immediate feedback
- Operations that can run in parallel

### Priority Guidelines

- **20**: Critical operations (scene recaps)
- **14-15**: High priority (lorebook operations, registry updates)
- **10-12**: Medium priority (lorebook lookup, deduplication)
- **5**: Low priority (scene break detection)
- **0**: Default priority (validation, misc)

### Dependencies

Use dependencies when:
- Operation B needs result of Operation A
- Operations must run in specific order
- Lorebook merge must wait for lookup/deduplicate
- Running recap must wait for all lorebook operations

```javascript
// Example: Running recap depends on lorebook operations
const lorebookOpIds = []; // Collect operation IDs during scene recap
await enqueueOperation(
  OperationType.COMBINE_SCENE_WITH_RUNNING,
  { index },
  { dependencies: lorebookOpIds } // Wait for all lorebook operations
);
```

### Error Handling

- **Default to retry**: Unlimited retries with exponential backoff
- **Allow user abort**: Users can remove operations from UI during retry
- **Specific errors only**: Only auth errors fail immediately
- **Preserve state**: Operations can check abort signal to avoid corrupting state

---

## Troubleshooting

### Queue Not Processing

**Symptom**: Operations stuck in PENDING state, processor not running

**Causes**:
1. Queue paused (check pause button in UI)
2. Processor crashed (check browser console for errors)
3. Dependencies not met (check operation dependencies)

**Fix**:
```javascript
// Resume queue
await resumeQueue();

// Force restart processor (in browser console)
const { startQueueProcessor } = await import('./operationQueue.js');
startQueueProcessor();
```

### Operations Disappearing

**Symptom**: Enqueued operations not appearing in queue

**Causes**:
1. Queue version mismatch (queue was cleared while operation was being enqueued)
2. isClearing flag set (queue is being cleared)

**Fix**: Check queue version and isClearing flag:
```javascript
console.log('Queue version:', queueVersion);
console.log('Is clearing:', isClearing);
```

### Chat Remains Blocked

**Symptom**: Chat blocked even though queue is empty

**Causes**:
1. isChatBlocked flag stuck true
2. Processor crashed without cleanup

**Fix**:
```javascript
// Force unblock (in browser console)
const { setQueueChatBlocking } = await import('./operationQueue.js');
setQueueChatBlocking(false);
```

### Stale IN_PROGRESS Operations

**Symptom**: Operations stuck in IN_PROGRESS after page reload

**Causes**:
1. Page reloaded while operation was running
2. Browser crashed during operation

**Fix**: Queue automatically resets IN_PROGRESS to PENDING on load:
```javascript
// In loadQueue()
for (const op of currentQueue.queue) {
  if (op.status === OperationStatus.IN_PROGRESS) {
    op.status = OperationStatus.PENDING;
  }
}
```

---

## Performance Characteristics

### Queue Overhead

- **Enqueueing**: O(1) - append to array
- **Saving**: O(n) - serialize all operations to JSON
- **Finding next**: O(n log n) - filter and sort by priority
- **Execution**: Sequential - one operation at a time

### Memory Usage

- **Per operation**: ~1-2 KB (operation object + params)
- **Queue storage**: Grows with number of operations
- **Completed operations**: Auto-removed (0 memory overhead)

### Rate Limiting

- **Between operations**: 5 seconds (OPERATION_FETCH_TIMEOUT_MS)
- **Retry backoff**: 5s, 10s, 20s, 40s, 80s, capped at 120s
- **Total throughput**: ~12 operations per minute (with 5s delay)

---

## Future Enhancements

### Potential Improvements

1. **Parallel Execution**: Allow multiple operations with different connection profiles to run in parallel
2. **Operation Batching**: Batch similar operations into single LLM call (e.g., multiple validations)
3. **Smart Retry**: Detect specific error types (rate limits) and adjust backoff accordingly
4. **Operation History**: Store completed operations for debugging/auditing
5. **Queue Metrics**: Track operation duration, success rate, retry frequency
6. **Priority Preemption**: Allow high-priority operations to interrupt low-priority operations

### Known Limitations

1. **Sequential Only**: Operations run one-at-a-time (can't parallelize even with separate profiles)
2. **No Batching**: Each operation = separate LLM call (no batching optimization)
3. **No Operation Merging**: Duplicate operations aren't automatically merged
4. **No Queue Persistence Across Chats**: Each chat has separate queue (can't share operations)

---

## Related Documentation

- [Data Flow Documentation](./data-flow.md) - Operation lifecycle and data flow diagrams
- [Overview](./overview.md) - High-level feature summary
- [Operation Handlers](../../../operationHandlers.js) - Handler implementations
- [Queue Integration](../../../queueIntegration.js) - Helper functions for enqueueing operations

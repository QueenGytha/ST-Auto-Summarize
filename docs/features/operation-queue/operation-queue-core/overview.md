# Operation Queue System - Overview

## What is the Operation Queue?

The Operation Queue System is a **persistent, sequential operation processor** that handles all async operations in ST-Auto-Recap. It ensures reliable execution of LLM calls, lorebook operations, and data processing while preventing race conditions and maintaining system stability.

**Key Features**:
- **Sequential Execution**: One operation at a time (prevents conflicts)
- **Persistent State**: Queue survives page reload (stored in lorebook)
- **Graceful Recovery**: Handles crashes, retries with exponential backoff
- **Chat Blocking**: Blocks user input when needed (same connection profile)
- **Handler Architecture**: Pluggable handlers for each operation type
- **Priority Management**: High-priority operations run first
- **Dependency Support**: Operations can wait for other operations
- **UI Visibility**: Real-time display of queue status

---

## Why Does It Exist?

### Problem

Before the queue system:
1. **Race Conditions**: Multiple LLM calls happening simultaneously
2. **Lost Operations**: Page reload = lost in-progress operations
3. **No Retry Logic**: Failed operations = manual retry required
4. **Chat Conflicts**: User's message could conflict with recap generation
5. **No Visibility**: Users couldn't see what was happening

### Solution

The queue system provides:
1. **Sequential Processing**: One operation at a time, guaranteed order
2. **Persistence**: Operations survive browser reload
3. **Automatic Retries**: Exponential backoff for transient failures
4. **Chat Blocking**: Prevents user messages when needed
5. **Transparent UI**: Users see what's happening, can cancel operations

---

## Architecture

### Core Components

```
operationQueue.js (1033 lines)
├── Queue State Management
│   ├── Operation storage (in-memory + lorebook)
│   ├── Status tracking (pending, in_progress, completed, failed, retrying)
│   └── Version management (for queue clears)
│
├── Queue Processor
│   ├── Sequential execution loop
│   ├── Priority and dependency resolution
│   ├── Abort handling
│   └── Retry logic with exponential backoff
│
└── Chat Blocking
    ├── Conditional blocking (same profile only)
    ├── Button/Enter key interception
    └── Automatic unblocking

operationHandlers.js (903 lines)
├── Handler Registration
│   ├── registerOperationHandler(type, handler)
│   └── registerAllOperationHandlers()
│
└── Handler Implementations
    ├── Scene operations (validation, detection, recap generation)
    ├── Lorebook operations (lookup, deduplicate, create, merge, registry)
    └── Running recap operations (combine, generate)

operationQueueUI.js (641 lines)
├── Navbar Panel
│   ├── Operation list display
│   ├── Pause/resume/clear controls
│   └── Collapse/expand toggle
│
└── Operation Rendering
    ├── Status icons (spinning, clock, error, etc.)
    ├── Error messages and retry counters
    └── Remove buttons (cancel and remove)
```

---

## Operation Types

### Scene Operations

| Type | Description | Priority |
|------|-------------|----------|
| `VALIDATE_RECAP` | Validate recap for errors | 3 (Default) |
| `DETECT_SCENE_BREAK` | Detect scene break in range | 5 (Low) |
| `GENERATE_SCENE_RECAP` | Generate scene recap | 20 (Critical) |
| `GENERATE_RUNNING_RECAP` | Generate running recap (bulk) | 10 (Medium) |
| `COMBINE_SCENE_WITH_RUNNING` | Combine scene with running | 10 (Medium) |

### Lorebook Operations

| Type | Description | Priority |
|------|-------------|----------|
| `LOREBOOK_ENTRY_LOOKUP` | Stage 1: Lookup existing entries | 11 (Normal) |
| `RESOLVE_LOREBOOK_ENTRY` | Stage 2: Deduplicate (conditional) | 12 (Medium) |
| `CREATE_LOREBOOK_ENTRY` | Stage 3: Create or merge | 14 (High) |
| `MERGE_LOREBOOK_ENTRY` | Standalone merge | 13 (High) |
| `UPDATE_LOREBOOK_REGISTRY` | Stage 4: Update registry | 14 (High) |
| `POPULATE_REGISTRIES` | Bulk registry population | 12 (Medium) |

---

## How It Works

### Operation Lifecycle

```
1. ENQUEUE
   enqueueOperation(type, params, options)
     ↓
   Create operation object
     ↓
   Add to queue (persist to lorebook)
     ↓
   Block chat if needed
     ↓
   Start processor if not active

2. QUEUED (PENDING)
   Operation waits in queue
     ↓
   Visible in UI with clock icon
     ↓
   Waits for: processor, dependencies, higher priority ops

3. SELECTED
   getNextOperation()
     ↓
   Filter: pending, dependencies met
     ↓
   Sort: priority (high→low), age (old→new)
     ↓
   Return first operation

4. EXECUTING (IN_PROGRESS)
   executeOperation(operation)
     ↓
   Update status: IN_PROGRESS
     ↓
   Call handler(operation)
     ↓
   Handler executes: LLM call, data processing
     ↓
   Check abort signal
     ↓
   Apply side effects
     ↓
   Mark COMPLETED
     ↓
   Auto-remove from queue
     ↓
   Check if chat should be unblocked

5. ERROR HANDLING
   If handler fails:
     ↓
   Check error type
     ↓
   Non-retryable (auth errors) → FAILED → Remove
   Retryable (rate limits, etc.) → RETRYING → Backoff → Retry
   Cancelled by user → CANCELLED → Remove
```

### Queue Persistence

Queue state is stored in a **disabled lorebook entry**:

```javascript
// Entry identifier
comment: '__operation_queue'

// Entry content (JSON)
{
  queue: [Operation, Operation, ...],
  current_operation_id: "op_123_abc",
  paused: false,
  version: 1
}

// Entry configuration
disable: true              // Never inject into context
excludeRecursion: true    // Never trigger other entries
```

**Why Lorebook?**
- Survives page reload (F5, browser restart)
- Per-chat (each chat has own queue)
- No backend changes needed
- Automatic saving

---

## Chat Blocking

### When Does It Block?

The queue blocks chat input **only when operations use the same connection profile as the user**:

```javascript
// Check if operation blocks chat
shouldOperationBlockChat(operationType) {
  const profile = get_settings(`${type}_connection_profile`);

  // Empty profile = "same as current" = MUST BLOCK
  // Non-empty profile = separate connection = DON'T BLOCK
  return !profile || profile.trim() === '';
}
```

**Blocking Lifecycle**:
1. **Queue empty**: Chat unblocked
2. **Operation added (same profile)**: Chat blocked immediately
3. **Operation completes**: Check remaining operations
   - Any remaining use same profile? Keep blocked
   - All remaining use separate profiles? Unblock
4. **Queue empty**: Chat unblocked

### How Does It Block?

1. **Button Interception**: Intercepts send button clicks
2. **Enter Key Interception**: Intercepts Enter key presses
3. **Visual Indicator**: Shows "Operation queue is processing" toast
4. **Navbar Display**: Queue UI shows active operations

---

## Error Handling

### Retry Strategy

**Default: Unlimited Retries with Exponential Backoff**

```
Retry 1: 5 seconds
Retry 2: 10 seconds
Retry 3: 20 seconds
Retry 4: 40 seconds
Retry 5: 80 seconds
Retry 6+: 120 seconds (capped)
```

**Rationale**: LLM API errors are often transient (rate limits, temporary outages)

**User Control**: Users can manually remove operations from queue UI during backoff

### Non-Retryable Errors

Only these errors fail immediately:
- `unauthorized` / `forbidden`
- `authentication required`
- `invalid api key`

All other errors (including "Bad Request" which may be rate limits) are retried.

### Max Retries Setting

- `max_retries = 0` (default): Unlimited retries
- `max_retries > 0`: Fail after N retries

---

## UI Integration

### Queue Panel

Located in navbar, shows:
- **Header**: Operation count, pause/resume button, clear all button
- **Operation List**: All pending/in_progress/failed/retrying operations
- **Per-Operation Display**:
  - Status icon (spinning for in_progress, clock for pending)
  - Operation type (formatted for readability)
  - Parameters (message index, entry name)
  - Retry counter (if retrying)
  - Error message (if failed/retrying)
  - Remove button (cancel and remove)

### Status Icons

- **PENDING**: Clock icon (gray)
- **IN_PROGRESS**: Spinning spinner (blue)
- **RETRYING**: Spinning rotate icon (orange)
- **FAILED**: X icon (red)
- **CANCELLED**: Ban icon (orange)
- **COMPLETED**: Auto-removed (not displayed)

---

## Multi-Stage Pipelines

### Lorebook Entry Processing

```
STAGE 1: LOREBOOK_ENTRY_LOOKUP
  Input: entryData, registryListing, typeList
    ↓
  LLM: "Find existing entries matching this entity"
    ↓
  Output: type, sameEntityUids, needsFullContextUids, synopsis
    ↓
  Decide next stage:
    - Need deduplication? → RESOLVE_LOREBOOK_ENTRY
    - Exact match? → CREATE_LOREBOOK_ENTRY (merge)
    - No match? → CREATE_LOREBOOK_ENTRY (create)

STAGE 2: RESOLVE_LOREBOOK_ENTRY (Conditional)
  Input: entryId
    ↓
  LLM: "Which entry is the same entity?"
    ↓
  Output: resolvedUid, synopsis
    ↓
  Decide next stage:
    - Match found? → CREATE_LOREBOOK_ENTRY (merge)
    - No match? → CREATE_LOREBOOK_ENTRY (create)

STAGE 3: CREATE_LOREBOOK_ENTRY
  Input: entryId, action (create|merge), resolvedUid?
    ↓
  IF merge: LLM merges content, updates entry
  IF create: Creates new entry, checks for duplicates
    ↓
  Enqueue next stage: UPDATE_LOREBOOK_REGISTRY

STAGE 4: UPDATE_LOREBOOK_REGISTRY
  Input: entryId, entityType, entityId, action
    ↓
  Updates registry entry content
    ↓
  Reorders lorebook entries alphabetically
    ↓
  Shows success toast
```

### Scene Break Detection

```
DETECT_SCENE_BREAK
  Input: startIndex, endIndex, offset
    ↓
  LLM: "Analyze messages for scene breaks"
    ↓
  Output: sceneBreakAt, rationale
    ↓
  IF scene break found:
    - Place scene break marker
    - Mark messages as checked
    - Enqueue GENERATE_SCENE_RECAP (if auto-generate enabled)
    - Enqueue DETECT_SCENE_BREAK for remaining range (recursive)

GENERATE_SCENE_RECAP
  Input: index (scene break message)
    ↓
  Generate recap via LLM
    ↓
  Extract entities, queue lorebook operations
    ↓
  Enqueue COMBINE_SCENE_WITH_RUNNING
    - Dependencies: all lorebook operation IDs
    - Waits for lorebook operations to complete

COMBINE_SCENE_WITH_RUNNING
  Input: index
    ↓
  Wait for dependencies (lorebook ops)
    ↓
  Collect all scene recaps
    ↓
  LLM: "Combine scenes into running narrative"
    ↓
  Store in chat_metadata
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
- **10-12**: Medium priority (lorebook lookup, deduplication, running recap)
- **5**: Low priority (scene break detection)
- **0**: Default priority (validation, misc)

### Dependencies

Use dependencies when:
- Operation B needs result of Operation A
- Operations must run in specific order
- Running recap must wait for lorebook operations

```javascript
// Example: Running recap depends on lorebook operations
await enqueueOperation(
  OperationType.COMBINE_SCENE_WITH_RUNNING,
  { index },
  { dependencies: lorebookOpIds }
);
```

---

## Performance

### Throughput

- **Sequential Processing**: 1 operation at a time
- **Rate Limiting**: 5 seconds between operations
- **Throughput**: ~12 operations per minute (no failures)
- **With Retries**: Slower (backoff delays add up)

### Memory

- **Per Operation**: ~2-8 KB
- **Queue Storage**: Grows with number of operations
- **Completed Operations**: Auto-removed (0 memory overhead)
- **Practical Limit**: ~200-300 operations (lorebook entry size limit)

---

## Troubleshooting

### Queue Not Processing

**Symptom**: Operations stuck in PENDING

**Causes**:
1. Queue paused (check pause button)
2. Processor crashed (check browser console)
3. Dependencies not met (check operation dependencies)

**Fix**: Resume queue or restart processor

### Chat Remains Blocked

**Symptom**: Chat blocked even though queue is empty

**Fix**: Force unblock in browser console:
```javascript
const { setQueueChatBlocking } = await import('./operationQueue.js');
setQueueChatBlocking(false);
```

### Operations Disappearing

**Symptom**: Enqueued operations not appearing

**Causes**:
1. Queue version mismatch (queue was cleared)
2. isClearing flag set (queue is being cleared)

---

## Documentation

### Complete Documentation

1. **[implementation.md](./implementation.md)** (600 lines)
   - Complete technical implementation details
   - Queue state management
   - Processor logic
   - Handler architecture
   - Chat blocking mechanism
   - Error recovery
   - Best practices

2. **[data-flow.md](./data-flow.md)** (300 lines)
   - Operation lifecycle diagrams
   - State transition flow
   - Queue persistence flow
   - Multi-stage pipelines
   - Chat blocking data flow
   - UI update cycle
   - Error recovery flow

3. **[overview.md](./overview.md)** (this file)
   - High-level feature summary
   - Quick reference
   - Architecture overview

### Related Code

- **[operationQueue.js](../../../../operationQueue.js)** - Core queue implementation
- **[operationHandlers.js](../../../../operationHandlers.js)** - Handler implementations
- **[operationQueueUI.js](../../../../operationQueueUI.js)** - UI display
- **[queueIntegration.js](../../../../queueIntegration.js)** - Helper functions

---

## Summary

The Operation Queue System provides reliable, sequential execution of async operations with:

- **Persistence**: Operations survive page reload
- **Recovery**: Automatic retries with exponential backoff
- **Safety**: Chat blocking prevents conflicts
- **Visibility**: Real-time UI display
- **Control**: User can pause, resume, clear, or cancel operations
- **Flexibility**: Priority and dependency management

This architecture ensures system stability, prevents race conditions, and provides transparent operation execution for all async tasks in ST-Auto-Recap.

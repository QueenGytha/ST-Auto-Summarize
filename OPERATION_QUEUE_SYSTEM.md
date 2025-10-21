# Operation Queue System

**Persistent, crash-resistant operation queue for ST-Auto-Summarize and ST-Auto-Lorebooks**

## Overview

The Operation Queue System provides a persistent, robust way to manage AI operations in both extensions. Operations are stored in chat metadata and survive SillyTavern restarts, browser crashes, and network interruptions.

## Key Features

- ✅ **Persistent storage** - Queue state saved to chat metadata
- ✅ **Survives restarts** - Automatically resumes on chat reload
- ✅ **Auto-recovery** - Cleans up stale operations after crashes
- ✅ **Priority system** - Important operations run first
- ✅ **Dependencies** - Operations can wait for others to complete
- ✅ **Automatic retries** - Failed operations retry with exponential backoff
- ✅ **Real-time UI** - Visual status display in navbar
- ✅ **Slash commands** - Easy queue control via commands

## Architecture

### Components

```
operationQueue.js       - Core queue logic, storage, processing
operationQueueUI.js     - UI display and controls
operationHandlers.js    - Operation execution handlers
queueIntegration.js     - Helper functions to queue operations
```

### Data Storage

#### ST-Auto-Summarize
```javascript
chat_metadata.auto_summarize_operation_queue = {
    queue: [...],                  // Array of operation objects
    current_operation_id: null,    // Currently executing operation
    paused: false,                 // Queue pause state
    version: 1                     // Schema version
}
```

#### ST-Auto-Lorebooks
```javascript
chat_metadata.auto_lorebooks_operation_queue = {
    queue: [...],
    current_operation_id: null,
    paused: false,
    version: 1
}
```

### Operation Object

```javascript
{
    id: "op_1234567890_abc123",   // Unique ID
    type: "SUMMARIZE_MESSAGE",     // Operation type
    params: {                      // Type-specific parameters
        index: 5
    },
    status: "pending",             // pending|in_progress|completed|failed|cancelled
    created_at: 1234567890,        // Timestamp
    started_at: null,              // When execution began
    completed_at: null,            // When execution ended
    error: null,                   // Error message if failed
    retries: 0,                    // Current retry count
    max_retries: 3,                // Maximum retries allowed
    priority: 0,                   // Higher = runs first
    dependencies: [],              // IDs of operations to wait for
    metadata: {}                   // Custom metadata
}
```

## Operation Types

### ST-Auto-Summarize

| Type | Description | Parameters |
|------|-------------|------------|
| `SUMMARIZE_MESSAGE` | Summarize a single message | `{ index }` |
| `VALIDATE_SUMMARY` | Validate a summary | `{ summary, type }` |
| `DETECT_SCENE_BREAK` | Detect if message is scene break | `{ index }` |
| `GENERATE_SCENE_SUMMARY` | Generate scene summary | `{ index }` |
| `GENERATE_SCENE_NAME` | Generate scene name | `{ index, summary }` |
| `GENERATE_RUNNING_SUMMARY` | Generate running summary (bulk) | `{}` |
| `COMBINE_SCENE_WITH_RUNNING` | Combine scene with running | `{ index }` |
| `GENERATE_COMBINED_SUMMARY` | Generate combined summary | `{}` |

### ST-Auto-Lorebooks

| Type | Description | Parameters |
|------|-------------|------------|
| `MERGE_GM_NOTES` | Merge GM notes with AI | `{ lorebookName, updateContent }` |
| `MERGE_CHARACTER_STATS` | Merge character stats with AI | `{ lorebookName, updateContent }` |
| `UPDATE_CATEGORY_INDEX` | Update single category index | `{ lorebookName, category }` |
| `UPDATE_ALL_CATEGORY_INDEXES` | Update all category indexes | `{ lorebookName }` |
| `EXTRACT_ENTITIES` | Extract entities from text | `{ lorebookName, sourceText }` |

## Usage

### Programmatic API

#### Queue Operations (ST-Auto-Summarize)

```javascript
import { queueSummarizeMessage } from './queueIntegration.js';

// Queue a single message summarization
const opId = queueSummarizeMessage(5, {
    priority: 1,
    max_retries: 3
});

// Queue multiple messages
import { queueSummarizeMessages } from './queueIntegration.js';
const opIds = queueSummarizeMessages([5, 6, 7, 8, 9]);

// Queue with dependencies
const sceneOpId = queueDetectSceneBreak(10);
const summaryOpId = queueGenerateSceneSummary(10, {
    dependencies: [sceneOpId]  // Wait for scene detection first
});
```

#### Queue Operations (ST-Auto-Lorebooks)

```javascript
import { queueMergeGMNotes } from './queueIntegration.js';

// Queue GM notes merge
const opId = queueMergeGMNotes('z-AutoLB - Alice - chat123', 'New GM notes content', {
    priority: 1
});

// Queue category index update
import { queueUpdateAllCategoryIndexes } from './queueIntegration.js';
queueUpdateAllCategoryIndexes('z-AutoLB - Alice - chat123');
```

#### Queue Management

```javascript
import {
    pauseQueue,
    resumeQueue,
    getQueueStats,
    clearCompletedOperations,
    clearAllOperations
} from './operationQueue.js';

// Pause processing
pauseQueue();

// Resume processing
resumeQueue();

// Get statistics
const stats = getQueueStats();
console.log(`${stats.pending} pending, ${stats.in_progress} running`);

// Clear completed
clearCompletedOperations();

// Clear everything
clearAllOperations();
```

### Slash Commands

#### ST-Auto-Summarize

```
/queue-status          - Show queue statistics
/queue                 - Alias for queue-status
/queue-pause           - Pause the queue
/queue-resume          - Resume the queue
/queue-clear-completed - Clear completed operations
/queue-clear-all       - Clear all operations
```

#### ST-Auto-Lorebooks

```
/alb-queue-status          - Show queue statistics
/alb-queue                 - Alias for alb-queue-status
/alb-queue-pause           - Pause the queue
/alb-queue-resume          - Resume the queue
/alb-queue-clear-completed - Clear completed operations
/alb-queue-clear-all       - Clear all operations
```

## Settings

### ST-Auto-Summarize

```javascript
extension_settings.auto_summarize = {
    operation_queue_enabled: true,          // Enable queue system
    operation_queue_display_enabled: true,  // Show UI
    // ... other settings
}
```

### ST-Auto-Lorebooks

```javascript
extension_settings.autoLorebooks = {
    queue: {
        enabled: true,          // Enable queue system
        display_enabled: true   // Show UI
    },
    // ... other settings
}
```

## UI Display

### Location

- **ST-Auto-Summarize**: Bottom of scene navigator bar in navbar
- **ST-Auto-Lorebooks**: Bottom of settings panel

### Controls

- **⏸️ Pause/Resume** - Pause or resume queue processing
- **✅ Clear Completed** - Remove all completed operations
- **🗑️ Clear All** - Remove all operations
- **⌄ Collapse/Expand** - Show/hide operation list
- **✖️ Remove** - Remove individual operation (per-operation button)

### Status Icons

- **⏱️ Pending** - Operation waiting to run (gray)
- **⚙️ In Progress** - Operation currently executing (blue, spinning)
- **✅ Completed** - Operation finished successfully (green)
- **❌ Failed** - Operation failed after all retries (red)
- **🚫 Cancelled** - Operation cancelled by user (orange)

## How It Works

### 1. Queue Initialization

When extension loads:
1. Read queue from `chat_metadata`
2. Clean up stale "in_progress" operations (from crashes)
3. Reset them to "pending"
4. Auto-start processor if operations exist

### 2. Operation Processing

The queue processor:
1. Finds next eligible operation (considers dependencies, priority)
2. Marks it as "in_progress"
3. Executes the operation handler
4. On success: Marks "completed"
5. On failure: Retries up to `max_retries`, then marks "failed"
6. Continues to next operation

### 3. Persistence

After every state change:
1. Queue saved to `chat_metadata`
2. SillyTavern's `saveChat()` called
3. Queue persisted to disk

### 4. Recovery After Crash

When chat loads:
1. Check for "in_progress" operations
2. These indicate interrupted operations
3. Reset to "pending" status
4. Queue automatically resumes

## Example Scenarios

### Scenario 1: Batch Summarization

You want to summarize messages 10-20:

```javascript
const opIds = queueSummarizeMessages([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
```

**Result:**
- 11 operations queued
- Process sequentially with 5s delay between each
- If SillyTavern crashes at message 15, queue resumes at 16 on reload
- UI shows real-time progress

### Scenario 2: Scene Break Detection with Auto-Summary

Detect scene breaks and auto-generate summaries:

```javascript
// Queue scene detection
const detectionIds = queueDetectSceneBreaks([10, 11, 12, 13, 14]);

// Queue summaries with dependencies
detectionIds.forEach((detectionId, i) => {
    queueGenerateSceneSummary(10 + i, {
        dependencies: [detectionId],  // Wait for detection first
        priority: 1                    // Higher priority
    });
});
```

**Result:**
- Detect scene breaks first
- For each detected scene, generate summary
- Dependencies ensure correct order
- Higher priority ensures summaries run before other tasks

### Scenario 3: GM Notes Update

AI sends tracking syntax, queue handles merge:

```javascript
// Parsed from message: <-- gm_notes: The party discovered a secret cave -->
queueMergeGMNotes('z-AutoLB - Alice - chat123', 'The party discovered a secret cave', {
    priority: 2  // Very high priority for tracking updates
});
```

**Result:**
- Operation queued with high priority
- Runs before lower-priority operations
- AI merge preserves existing content
- Entry updated in lorebook

## Advanced Features

### Priority System

Operations with higher priority run first:

```javascript
queueOperation(type, params, { priority: 2 });  // Runs first
queueOperation(type, params, { priority: 1 });  // Runs second
queueOperation(type, params, { priority: 0 });  // Runs last (default)
```

### Dependencies

Operations can wait for others:

```javascript
const op1 = queueOperation(OperationType.DETECT_SCENE_BREAK, { index: 5 });
const op2 = queueOperation(OperationType.GENERATE_SCENE_SUMMARY, { index: 5 }, {
    dependencies: [op1]  // Wait for op1 to complete
});
```

### Retry Logic

Failed operations automatically retry:

```javascript
queueOperation(type, params, {
    max_retries: 5  // Retry up to 5 times
});
```

Retry behavior:
- Retry 1: Immediate
- Retry 2: After failure
- Retry 3: After failure
- ... up to max_retries
- Then mark as "failed"

### Custom Metadata

Store custom data with operations:

```javascript
queueOperation(type, params, {
    metadata: {
        user_triggered: true,
        batch_id: "batch_123",
        custom_field: "value"
    }
});
```

## Troubleshooting

### Queue Not Processing

**Symptoms:**
- Operations stuck in "pending"
- UI shows "0 running"

**Solutions:**
1. Check if queue is paused: `/queue-status`
2. Resume if paused: `/queue-resume`
3. Check console for errors
4. Restart SillyTavern if needed

### Operations Stuck "In Progress"

**Symptoms:**
- Operations show spinning icon forever
- No progress after waiting

**Cause:** SillyTavern crashed during execution

**Solution:**
1. Reload chat - operations auto-reset to "pending"
2. Queue automatically resumes

### Too Many Failed Operations

**Symptoms:**
- Many operations showing red ❌
- Error messages in console

**Solutions:**
1. Check API connectivity
2. Check rate limits
3. Increase `max_retries` for operations
4. Clear failed: `/queue-clear-all`

### Queue Growing Too Large

**Symptoms:**
- Hundreds of operations queued
- Slow UI performance

**Solutions:**
1. Pause queue: `/queue-pause`
2. Clear completed: `/queue-clear-completed`
3. If needed, clear all: `/queue-clear-all`

## Performance Considerations

### Memory Usage

- Each operation: ~500 bytes
- 100 operations: ~50 KB
- 1000 operations: ~500 KB

**Recommendation:** Clear completed operations periodically

### Processing Speed

- Sequential processing (one at a time)
- ~5-10 seconds per AI operation
- 100 operations: ~8-16 minutes

**Recommendation:** Use priorities for important operations

### Chat Metadata Size

Queue stored in `chat_metadata`, which is saved to disk:
- Small queues: negligible impact
- Large queues (1000+ ops): may slow chat saves

**Recommendation:** Clear old operations regularly

## Future Enhancements

Planned features:

1. **Parallel processing** - Run multiple operations simultaneously
2. **Rate limiting** - Automatic throttling for API limits
3. **Operation scheduling** - Schedule operations for specific times
4. **Batch operations** - Group related operations for efficiency
5. **Progress tracking** - Detailed progress for long-running operations
6. **Operation history** - View completed operations history
7. **Export/Import** - Backup and restore queue state

## Developer Guide

### Registering New Operation Types

1. **Add operation type constant:**

```javascript
// operationQueue.js
export const OperationType = {
    // ... existing types
    MY_NEW_OPERATION: 'my_new_operation'
};
```

2. **Register handler:**

```javascript
// operationHandlers.js
registerOperationHandler(OperationType.MY_NEW_OPERATION, async (operation) => {
    const { param1, param2 } = operation.params;
    // Execute operation
    const result = await doSomething(param1, param2);
    return result;
});
```

3. **Add helper function:**

```javascript
// queueIntegration.js
export function queueMyNewOperation(param1, param2, options = {}) {
    return enqueueOperation(
        OperationType.MY_NEW_OPERATION,
        { param1, param2 },
        options
    );
}
```

### Testing

Test queue functionality:

```javascript
// Queue a test operation
const opId = queueSummarizeMessage(5);

// Check status
const stats = getQueueStats();
console.log(stats);

// Monitor completion
const checkInterval = setInterval(() => {
    const op = getOperation(opId);
    if (op.status === 'completed') {
        console.log('Operation completed!');
        clearInterval(checkInterval);
    }
}, 1000);
```

---

**Version:** 1.0
**Last Updated:** 2025-01-20
**Maintained By:** Claude Code Team

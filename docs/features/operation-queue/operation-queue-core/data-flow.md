# Operation Queue System - Data Flow Documentation

## Overview

This document traces the complete lifecycle of operations through the queue system, from enqueueing to completion. It covers operation state transitions, data persistence, handler execution, and integration with other systems.

---

## Operation Lifecycle

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          OPERATION LIFECYCLE                             │
└─────────────────────────────────────────────────────────────────────────┘

1. ENQUEUE
   ┌──────────────────────────────────────────────────────────┐
   │ enqueueOperation(type, params, options)                  │
   │  ↓                                                        │
   │ Create operation object:                                 │
   │  - Generate ID: "op_1234567890_abc123"                  │
   │  - Set status: PENDING                                   │
   │  - Set priority, dependencies, metadata                  │
   │  - Create AbortController                                │
   │  ↓                                                        │
   │ Add to currentQueue.queue[]                              │
   │  ↓                                                        │
   │ saveQueue() → Persist to lorebook entry                  │
   │  ↓                                                        │
   │ Check if chat blocking needed                            │
   │  ↓                                                        │
   │ Start processor if not active                            │
   └──────────────────────────────────────────────────────────┘

2. QUEUED (PENDING)
   ┌──────────────────────────────────────────────────────────┐
   │ Operation waits in queue                                 │
   │  - Status: PENDING                                       │
   │  - Visible in UI with clock icon                         │
   │  - Can be removed by user                                │
   │  - Waits for:                                            │
   │    • Processor to be available                           │
   │    • Dependencies to complete                            │
   │    • Higher priority operations to finish                │
   └──────────────────────────────────────────────────────────┘

3. SELECTED
   ┌──────────────────────────────────────────────────────────┐
   │ getNextOperation()                                        │
   │  ↓                                                        │
   │ Filter by:                                               │
   │  - Status = PENDING                                      │
   │  - Dependencies met (all completed)                      │
   │  ↓                                                        │
   │ Sort by:                                                 │
   │  - Priority (higher first)                               │
   │  - Created timestamp (older first)                       │
   │  ↓                                                        │
   │ Return first operation                                   │
   └──────────────────────────────────────────────────────────┘

4. EXECUTING (IN_PROGRESS)
   ┌──────────────────────────────────────────────────────────┐
   │ executeOperation(operation)                               │
   │  ↓                                                        │
   │ Update status: IN_PROGRESS                               │
   │ Set started_at timestamp                                 │
   │ saveQueue()                                              │
   │  ↓                                                        │
   │ Register abort controller                                │
   │  ↓                                                        │
   │ Promise.race([                                           │
   │   handler(operation),    ← Execute handler              │
   │   abortPromise           ← Allow manual cancellation     │
   │ ])                                                       │
   │  ↓                                                        │
   │ Handler executes:                                        │
   │  - Extract params                                        │
   │  - Call LLM / perform operation                          │
   │  - Check abort signal                                    │
   │  - Apply side effects                                    │
   │  - Return result                                         │
   │  ↓                                                        │
   │ Check if queue cleared during execution                  │
   │  ↓                                                        │
   │ Update status: COMPLETED                                 │
   │ Set completed_at timestamp                               │
   │ saveQueue()                                              │
   │  ↓                                                        │
   │ Remove operation from queue                              │
   │  ↓                                                        │
   │ Check if chat should be unblocked                        │
   └──────────────────────────────────────────────────────────┘

5. ERROR HANDLING
   ┌──────────────────────────────────────────────────────────┐
   │ catch (err)                                              │
   │  ↓                                                        │
   │ Check error type:                                        │
   │  ↓                                                        │
   │ IF: "cancelled by user"                                  │
   │  → Status: CANCELLED                                     │
   │  → Remove from queue                                     │
   │  ↓                                                        │
   │ ELSE IF: Non-retryable (auth errors)                     │
   │  → Status: FAILED                                        │
   │  → Remove from queue                                     │
   │  → Show error toast                                      │
   │  ↓                                                        │
   │ ELSE IF: Max retries exceeded                            │
   │  → Status: FAILED                                        │
   │  → Remove from queue                                     │
   │  → Show error toast                                      │
   │  ↓                                                        │
   │ ELSE: Retryable error                                    │
   │  → Increment operation.retries                           │
   │  → Calculate backoff: 5s * 2^(retries-1), cap at 120s  │
   │  → Status: RETRYING                                      │
   │  → saveQueue()                                           │
   │  → Wait backoff delay                                    │
   │  → Check if removed during backoff                       │
   │  → Retry: executeOperation(operation)                    │
   └──────────────────────────────────────────────────────────┘

6. COMPLETED
   ┌──────────────────────────────────────────────────────────┐
   │ Status: COMPLETED                                        │
   │  ↓                                                        │
   │ Auto-removed from queue immediately                      │
   │  ↓                                                        │
   │ Result returned to caller (if needed)                    │
   │  ↓                                                        │
   │ Dependent operations can now proceed                     │
   └──────────────────────────────────────────────────────────┘
```

---

## State Transitions

### Status Flow Chart

```
                    ┌──────────────┐
                    │   ENQUEUED   │
                    │   (PENDING)  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────────────────────┐
                    │  Processor picks next        │
                    │  Dependencies met?           │
                    │  Priority sorted              │
                    └──────┬───────────────────────┘
                           │
                    ┌──────▼───────┐
                    │ IN_PROGRESS  │
                    └──┬─────────┬─┘
                       │         │
           ┌───────────▼─┐   ┌──▼──────────┐
           │  Handler    │   │  User       │
           │  succeeds   │   │  cancels    │
           └───────┬─────┘   └──┬──────────┘
                   │            │
            ┌──────▼────┐   ┌──▼──────┐
            │ COMPLETED │   │CANCELLED│
            │(auto-rm)  │   │ (removed)│
            └───────────┘   └─────────┘

           ┌───────────────┐
           │ Handler fails │
           └───────┬───────┘
                   │
        ┌──────────▼──────────┐
        │ Check error type    │
        └──┬──────────────┬───┘
           │              │
    ┌──────▼─────┐  ┌────▼──────┐
    │Non-retryable│  │ Retryable │
    └──────┬──────┘  └────┬──────┘
           │              │
      ┌────▼───┐     ┌───▼─────┐
      │ FAILED │     │RETRYING │
      │(removed)│     └───┬─────┘
      └────────┘         │
                     ┌───▼────┐
                     │ Backoff│
                     │ delay  │
                     └───┬────┘
                         │
              ┌──────────▼─────────────┐
              │ Still in queue?        │
              │ Queue not paused?      │
              └──┬────────────────┬────┘
                 │                │
            ┌────▼─────┐    ┌────▼────┐
            │  Retry   │    │ Abort   │
            │(loop to  │    │(removed) │
            │IN_PROGRESS)   └─────────┘
            └──────────┘
```

---

## Queue Persistence Flow

### Save/Load Cycle

```
┌─────────────────────────────────────────────────────────────┐
│                     PERSISTENCE CYCLE                        │
└─────────────────────────────────────────────────────────────┘

SAVE QUEUE
  ┌────────────────────────────────────────┐
  │ saveQueue()                            │
  │  ↓                                     │
  │ Get attached lorebook name             │
  │  chat_metadata[METADATA_KEY]          │
  │  ↓                                     │
  │ Load lorebook fresh                    │
  │  await loadWorldInfo(lorebookName)    │
  │  ↓                                     │
  │ Find __operation_queue entry           │
  │  entries.find(e => e.comment === ...) │
  │  ↓                                     │
  │ Serialize queue state to JSON          │
  │  JSON.stringify(currentQueue, null, 2) │
  │  ↓                                     │
  │ Update entry.content                   │
  │  queueEntry.content = json             │
  │  ↓                                     │
  │ Save lorebook                          │
  │  await saveWorldInfo(...)              │
  └────────────────────────────────────────┘

LOAD QUEUE
  ┌────────────────────────────────────────┐
  │ loadQueue()                            │
  │  ↓                                     │
  │ Get attached lorebook name             │
  │  chat_metadata[METADATA_KEY]          │
  │  ↓                                     │
  │ Load lorebook                          │
  │  await loadWorldInfo(lorebookName)    │
  │  ↓                                     │
  │ Find __operation_queue entry           │
  │  entries.find(e => e.comment === ...) │
  │  ↓                                     │
  │ Parse queue state from JSON            │
  │  currentQueue = JSON.parse(content)    │
  │  ↓                                     │
  │ Clean up stale operations              │
  │  - IN_PROGRESS → PENDING               │
  │  - RETRYING → PENDING                  │
  │  - Recreate AbortControllers           │
  │  ↓                                     │
  │ Restore chat blocking state            │
  │  if (queue has operations using same profile) │
  │    setQueueChatBlocking(true)          │
  └────────────────────────────────────────┘

ON PAGE RELOAD
  ┌────────────────────────────────────────┐
  │ Browser F5 / Restart                   │
  │  ↓                                     │
  │ Extension loads                        │
  │  ↓                                     │
  │ initOperationQueue()                   │
  │  ↓                                     │
  │ loadQueue()                            │
  │  ↓                                     │
  │ Queue state restored from lorebook     │
  │  ↓                                     │
  │ Stale IN_PROGRESS → PENDING            │
  │  ↓                                     │
  │ Processor restarts                     │
  │  ↓                                     │
  │ Operations resume execution            │
  └────────────────────────────────────────┘
```

---

## Handler Execution Flow

### Generic Handler Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                     HANDLER EXECUTION                        │
└─────────────────────────────────────────────────────────────┘

handler(operation)
  │
  ├─ 1. EXTRACT PARAMS
  │    const { param1, param2 } = operation.params;
  │    const signal = getAbortSignal(operation);
  │
  ├─ 2. EXECUTE OPERATION LOGIC
  │    const result = await performOperation(param1, param2, signal);
  │    // LLM call, data processing, etc.
  │
  ├─ 3. CHECK ABORT SIGNAL
  │    throwIfAborted(signal, 'OPERATION_TYPE', 'LLM call');
  │    // Throws if operation was cancelled during execution
  │
  ├─ 4. APPLY SIDE EFFECTS
  │    await updateData(result);
  │    await saveChatDebounced();
  │    // Only after confirming operation wasn't cancelled
  │
  ├─ 5. ENQUEUE FOLLOW-UP OPERATIONS
  │    await enqueueOperation(OperationType.NEXT_STAGE, { ... });
  │    // Chain dependent operations
  │
  └─ 6. RETURN RESULT
       return { success: true, data: result };
```

### Example: Scene Recap Handler

```
GENERATE_SCENE_RECAP Handler
  │
  ├─ Extract params
  │    const { index } = operation.params;
  │    const signal = getAbortSignal(operation);
  │
  ├─ Show loading state
  │    $recapBox.val("Generating scene recap...");
  │
  ├─ Call scene recap generator
  │    const result = await generateSceneRecap({
  │      index,
  │      skipQueue: true,
  │      signal
  │    });
  │
  ├─ Check abort signal
  │    throwIfAborted(signal, 'GENERATE_SCENE_RECAP', 'LLM call');
  │
  ├─ Show success toast
  │    toast('✓ Scene recap generated', 'success');
  │
  ├─ Queue running recap if enabled
  │    if (auto_generate_running_recap) {
  │      await queueCombineSceneWithRunning(index, {
  │        dependencies: result.lorebookOpIds
  │      });
  │    }
  │
  └─ Return result
       return { recap: result.recap };
```

---

## Multi-Stage Operation Pipelines

### Lorebook Entry Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   LOREBOOK ENTRY PROCESSING PIPELINE                     │
└─────────────────────────────────────────────────────────────────────────┘

STAGE 1: LOREBOOK_ENTRY_LOOKUP
  ┌──────────────────────────────────────────────────────────┐
  │ Input: entryData, registryListing, typeList             │
  │  ↓                                                        │
  │ Call LLM: "Find existing entries matching this entity"   │
  │  ↓                                                        │
  │ Response:                                                │
  │  - type: "character" | "location" | ...                 │
  │  - sameEntityUids: ["uid1", "uid2"]                     │
  │  - needsFullContextUids: ["uid3"]                       │
  │  - synopsis: "Brief description"                         │
  │  ↓                                                        │
  │ Store result in pending ops                              │
  │  ↓                                                        │
  │ Decide next stage:                                       │
  │  ┌─────────────────────────────────────────────────────┐│
  │  │ IF needsFullContextUids > 0:                        ││
  │  │   → Enqueue RESOLVE_LOREBOOK_ENTRY (Stage 2)        ││
  │  │                                                      ││
  │  │ ELSE IF sameEntityUids.length === 1:                ││
  │  │   → Enqueue CREATE_LOREBOOK_ENTRY (merge) (Stage 3)││
  │  │                                                      ││
  │  │ ELSE:                                                ││
  │  │   → Enqueue CREATE_LOREBOOK_ENTRY (create) (Stage 3)││
  │  └─────────────────────────────────────────────────────┘│
  └──────────────────────────────────────────────────────────┘

STAGE 2: RESOLVE_LOREBOOK_ENTRY (Conditional)
  ┌──────────────────────────────────────────────────────────┐
  │ Input: entryId (loads from pending ops)                  │
  │  ↓                                                        │
  │ Get lookup result (from Stage 1)                         │
  │  ↓                                                        │
  │ Build candidate entries (full content)                   │
  │  ↓                                                        │
  │ Call LLM: "Which entry is the same entity?"             │
  │  ↓                                                        │
  │ Response:                                                │
  │  - resolvedUid: "uid1" | null                           │
  │  - synopsis: "Updated description"                       │
  │  ↓                                                        │
  │ Store result in pending ops                              │
  │  ↓                                                        │
  │ Decide next stage:                                       │
  │  ┌─────────────────────────────────────────────────────┐│
  │  │ IF resolvedUid:                                      ││
  │  │   → Enqueue CREATE_LOREBOOK_ENTRY (merge) (Stage 3) ││
  │  │                                                      ││
  │  │ ELSE:                                                ││
  │  │   → Enqueue CREATE_LOREBOOK_ENTRY (create) (Stage 3)││
  │  └─────────────────────────────────────────────────────┘│
  └──────────────────────────────────────────────────────────┘

STAGE 3: CREATE_LOREBOOK_ENTRY
  ┌──────────────────────────────────────────────────────────┐
  │ Input: entryId, action (create|merge), resolvedUid?     │
  │  ↓                                                        │
  │ IF action === "merge":                                   │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ Load existing entry by resolvedUid                 │ │
  │  │  ↓                                                  │ │
  │  │ Call LLM: "Merge new content with existing"        │ │
  │  │  ↓                                                  │ │
  │  │ Update entry in lorebook                           │ │
  │  │  ↓                                                  │ │
  │  │ Update registry record                             │ │
  │  └────────────────────────────────────────────────────┘ │
  │                                                          │
  │ ELSE action === "create":                                │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ Check for duplicate name                           │ │
  │  │  ↓                                                  │ │
  │  │ Create new entry in lorebook                       │ │
  │  │  ↓                                                  │ │
  │  │ Update registry record                             │ │
  │  └────────────────────────────────────────────────────┘ │
  │  ↓                                                        │
  │ Enqueue UPDATE_LOREBOOK_REGISTRY (Stage 4)               │
  │  ↓                                                        │
  │ Return: { entityId, entityUid, action }                  │
  └──────────────────────────────────────────────────────────┘

STAGE 4: UPDATE_LOREBOOK_REGISTRY
  ┌──────────────────────────────────────────────────────────┐
  │ Input: entryId, entityType, entityId, action             │
  │  ↓                                                        │
  │ Load registry state                                      │
  │  ↓                                                        │
  │ Build registry items for type                            │
  │  ↓                                                        │
  │ Update registry entry content in lorebook                │
  │  ↓                                                        │
  │ Save metadata                                            │
  │  ↓                                                        │
  │ Reorder lorebook entries alphabetically                  │
  │  ↓                                                        │
  │ Complete pending entry (cleanup)                         │
  │  ↓                                                        │
  │ Show success toast                                       │
  │  ↓                                                        │
  │ Return: { success: true }                                │
  └──────────────────────────────────────────────────────────┘
```

### Scene Break Detection Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  SCENE BREAK DETECTION PIPELINE                          │
└─────────────────────────────────────────────────────────────────────────┘

DETECT_SCENE_BREAK
  ┌──────────────────────────────────────────────────────────┐
  │ Input: startIndex, endIndex, offset                      │
  │  ↓                                                        │
  │ Call LLM: "Analyze messages for scene breaks"           │
  │  ↓                                                        │
  │ Response:                                                │
  │  - sceneBreakAt: 42 | false                             │
  │  - rationale: "Message #42: Time skip to next day"      │
  │  ↓                                                        │
  │ Validate response:                                       │
  │  - Check minimum scene length                            │
  │  - Check rationale doesn't reference formatting          │
  │  - Check continuity/objective rule                       │
  │  ↓                                                        │
  │ IF sceneBreakAt found and valid:                         │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ Place scene break marker at sceneBreakAt          │ │
  │  │  ↓                                                  │ │
  │  │ Mark messages startIndex-sceneBreakAt as checked  │ │
  │  │  ↓                                                  │ │
  │  │ IF auto_scene_break_generate_recap:                │ │
  │  │   → Enqueue GENERATE_SCENE_RECAP(sceneBreakAt)    │ │
  │  │  ↓                                                  │ │
  │  │ IF remaining messages >= minimum:                  │ │
  │  │   → Enqueue DETECT_SCENE_BREAK(sceneBreakAt+1, endIndex) │
  │  └────────────────────────────────────────────────────┘ │
  │                                                          │
  │ ELSE no scene break:                                     │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ Mark messages startIndex-endIndex as checked      │ │
  │  └────────────────────────────────────────────────────┘ │
  │  ↓                                                        │
  │ Return: { sceneBreakAt, rationale }                      │
  └──────────────────────────────────────────────────────────┘

GENERATE_SCENE_RECAP
  ┌──────────────────────────────────────────────────────────┐
  │ Input: index (scene break message)                       │
  │  ↓                                                        │
  │ Call scene recap generator                               │
  │  ↓                                                        │
  │ Store recap in message.scene_recap_memory                │
  │  ↓                                                        │
  │ Extract entities and queue lorebook operations           │
  │  ↓                                                        │
  │ IF running_scene_recap_auto_generate:                    │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ Enqueue COMBINE_SCENE_WITH_RUNNING(index)         │ │
  │  │  dependencies: [all lorebook operation IDs]        │ │
  │  └────────────────────────────────────────────────────┘ │
  │  ↓                                                        │
  │ Return: { recap, lorebookOpIds }                         │
  └──────────────────────────────────────────────────────────┘

COMBINE_SCENE_WITH_RUNNING
  ┌──────────────────────────────────────────────────────────┐
  │ Input: index (scene break message)                       │
  │  ↓                                                        │
  │ Wait for dependencies (lorebook ops) to complete         │
  │  ↓                                                        │
  │ Collect all scene recaps                                 │
  │  ↓                                                        │
  │ Call LLM: "Combine scenes into running narrative"       │
  │  ↓                                                        │
  │ Store in chat_metadata.auto_recap_running_scene_recaps   │
  │  ↓                                                        │
  │ Return: { recap }                                        │
  └──────────────────────────────────────────────────────────┘
```

---

## Chat Blocking Data Flow

### Blocking Decision Logic

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     CHAT BLOCKING DECISION FLOW                          │
└─────────────────────────────────────────────────────────────────────────┘

ON ENQUEUE
  ┌──────────────────────────────────────────────────────────┐
  │ enqueueOperation(type, params, options)                  │
  │  ↓                                                        │
  │ Check if queue was empty before                          │
  │  const wasEmpty = currentQueue.queue.length === 0;      │
  │  ↓                                                        │
  │ Add operation to queue                                   │
  │  ↓                                                        │
  │ IF wasEmpty && shouldOperationBlockChat(type):           │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ setQueueChatBlocking(true)                         │ │
  │  │  ↓                                                  │ │
  │  │ Block send button and Enter key                    │ │
  │  │  ↓                                                  │ │
  │  │ Show blocking indicator in UI                      │ │
  │  └────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────┘

SHOULD BLOCK CHECK
  ┌──────────────────────────────────────────────────────────┐
  │ shouldOperationBlockChat(operationType)                  │
  │  ↓                                                        │
  │ Get connection profile for operation type                │
  │  const profile = get_settings(`${type}_connection_profile`); │
  │  ↓                                                        │
  │ IF profile is empty or not set:                          │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ return true  // Same profile = BLOCK              │ │
  │  │ (Operation uses same connection as user's chat)   │ │
  │  └────────────────────────────────────────────────────┘ │
  │                                                          │
  │ ELSE:                                                    │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ return false // Separate profile = DON'T BLOCK    │ │
  │  │ (Operation uses dedicated connection)              │ │
  │  └────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────┘

ON REMOVE/COMPLETE
  ┌──────────────────────────────────────────────────────────┐
  │ removeOperation(operationId)                             │
  │  ↓                                                        │
  │ Remove operation from queue                              │
  │  ↓                                                        │
  │ IF queue is now empty:                                   │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ setQueueChatBlocking(false)                        │ │
  │  │ → Unblock chat                                     │ │
  │  └────────────────────────────────────────────────────┘ │
  │                                                          │
  │ ELSE queue has remaining operations:                     │
  │  ┌────────────────────────────────────────────────────┐ │
  │  │ Check if ANY remaining use same profile:           │ │
  │  │  const needsBlocking = queue.some(op =>            │ │
  │  │    shouldOperationBlockChat(op.type));             │ │
  │  │  ↓                                                  │ │
  │  │ IF needsBlocking && currently blocked:             │ │
  │  │   → Keep blocked                                   │ │
  │  │  ↓                                                  │ │
  │  │ IF !needsBlocking && currently blocked:            │ │
  │  │   → Unblock (all remaining use separate profiles)  │ │
  │  │  ↓                                                  │ │
  │  │ IF needsBlocking && not blocked:                   │ │
  │  │   → Block (at least one uses same profile)         │ │
  │  └────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────┘
```

---

## UI Update Flow

### UI Refresh Cycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          UI UPDATE CYCLE                                 │
└─────────────────────────────────────────────────────────────────────────┘

TRIGGER UI UPDATE
  ┌──────────────────────────────────────────────────────────┐
  │ Queue state changes:                                     │
  │  - Operation enqueued                                    │
  │  - Status updated                                        │
  │  - Operation removed                                     │
  │  - Queue cleared                                         │
  │  - Queue paused/resumed                                  │
  │  ↓                                                        │
  │ notifyUIUpdate()                                         │
  │  ↓                                                        │
  │ uiUpdateCallback()                                       │
  │  ↓                                                        │
  │ updateQueueDisplay()                                     │
  └──────────────────────────────────────────────────────────┘

UPDATE QUEUE DISPLAY
  ┌──────────────────────────────────────────────────────────┐
  │ updateQueueDisplay()                                     │
  │  ↓                                                        │
  │ Get queue stats                                          │
  │  const stats = getQueueStats();                         │
  │  ↓                                                        │
  │ Update header count                                      │
  │  $('#queue_count').text(`(${stats.pending + stats.in_progress + stats.failed})`); │
  │  ↓                                                        │
  │ Update pause/resume button                               │
  │  if (stats.paused) {                                    │
  │    $pauseBtn.removeClass('fa-pause').addClass('fa-play'); │
  │  }                                                        │
  │  ↓                                                        │
  │ Render operations list                                   │
  │  renderOperationsList();                                 │
  └──────────────────────────────────────────────────────────┘

RENDER OPERATIONS LIST
  ┌──────────────────────────────────────────────────────────┐
  │ renderOperationsList()                                   │
  │  ↓                                                        │
  │ Get all operations                                       │
  │  const operations = getAllOperations();                 │
  │  ↓                                                        │
  │ Filter out completed operations                          │
  │  (they're auto-removed, but for safety)                 │
  │  ↓                                                        │
  │ Sort operations:                                         │
  │  1. IN_PROGRESS first                                    │
  │  2. RETRYING second                                      │
  │  3. PENDING third                                        │
  │  4. FAILED fourth                                        │
  │  5. Within same status: priority, then age               │
  │  ↓                                                        │
  │ Render each operation                                    │
  │  const $operations = sorted.map(op => renderOperation(op)); │
  │  ↓                                                        │
  │ Update DOM                                               │
  │  $('#queue_operations_list').html($operations);         │
  │  ↓                                                        │
  │ Update queue height                                      │
  │  updateQueueHeight();                                    │
  └──────────────────────────────────────────────────────────┘

RENDER OPERATION
  ┌──────────────────────────────────────────────────────────┐
  │ renderOperation(operation)                               │
  │  ↓                                                        │
  │ Get status icon                                          │
  │  - PENDING: clock icon                                   │
  │  - IN_PROGRESS: spinning spinner                         │
  │  - RETRYING: spinning rotate icon (orange)               │
  │  - FAILED: X icon (red)                                  │
  │  - CANCELLED: ban icon (orange)                          │
  │  ↓                                                        │
  │ Format operation type                                    │
  │  "validate_recap" → "Validate"                          │
  │  "generate_scene_recap" → "Scene Recap"                 │
  │  ↓                                                        │
  │ Format operation params                                  │
  │  { index: 42 } → "Message #42"                          │
  │  ↓                                                        │
  │ Build tooltip with metadata                              │
  │  - Prefill: Yes/No                                       │
  │  - Preset Prompts: Yes/No                                │
  │  - Message/Scene index                                   │
  │  - Entry name                                            │
  │  ↓                                                        │
  │ Show error message if failed/retrying                    │
  │  operation.error → displayed below operation             │
  │  ↓                                                        │
  │ Show retry counter if retrying                           │
  │  "Retry 3/5" or "Retry 3" (if unlimited)                │
  │  ↓                                                        │
  │ Add remove button                                        │
  │  - PENDING/FAILED: "Remove"                              │
  │  - IN_PROGRESS/RETRYING: "Cancel and Remove"             │
  │  ↓                                                        │
  │ Return jQuery element                                    │
  └──────────────────────────────────────────────────────────┘
```

---

## Error Recovery Flow

### Retry with Exponential Backoff

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ERROR RECOVERY WITH BACKOFF                          │
└─────────────────────────────────────────────────────────────────────────┘

  Operation fails
       ↓
  Check error type
       ↓
  ┌──────────────────────────────────┐
  │ Retryable error (rate limit, etc)│
  └──────────────┬───────────────────┘
                 ↓
  Increment operation.retries++
                 ↓
  Calculate backoff delay
  delay = min(5000 * 2^(retries-1), 120000)
                 ↓
  ┌──────────────────────────────────┐
  │ Retry 1: 5000ms (5s)             │
  │ Retry 2: 10000ms (10s)           │
  │ Retry 3: 20000ms (20s)           │
  │ Retry 4: 40000ms (40s)           │
  │ Retry 5: 80000ms (80s)           │
  │ Retry 6+: 120000ms (120s) [cap]  │
  └──────────────┬───────────────────┘
                 ↓
  Update status: RETRYING
  Set error message: "Retry N after Xs: [error]"
                 ↓
  saveQueue()
                 ↓
  notifyUIUpdate()
  (Shows retrying status in UI)
                 ↓
  await backoff delay
                 ↓
  Check if operation still in queue
  (User may have removed during delay)
                 ↓
       ┌─────────┴─────────┐
       │                   │
  Still in queue      Removed
       │                   │
       ↓                   ↓
  Check if paused    Abort retry
       │            (return null)
       ↓
  ┌────┴─────┐
  │          │
Paused    Not paused
  │          │
  ↓          ↓
Reset to   Retry
PENDING    operation
(return)   (recursive)
```

---

## Integration with Other Systems

### Scene Recap → Lorebook → Running Recap

```
User generates scene recap
       ↓
┌──────────────────────────────────────────┐
│ GENERATE_SCENE_RECAP handler             │
│  ↓                                       │
│ Generate recap text via LLM              │
│  ↓                                       │
│ Extract entities from recap              │
│  ↓                                       │
│ For each entity:                         │
│  ┌──────────────────────────────────────┤
│  │ Enqueue LOREBOOK_ENTRY_LOOKUP       ││
│  │  ↓                                  ││
│  │ Store operation ID in lorebookOpIds ││
│  └──────────────────────────────────────┤
│  ↓                                       │
│ Enqueue COMBINE_SCENE_WITH_RUNNING       │
│  dependencies: lorebookOpIds             │
│  (Waits for all lorebook ops)            │
└──────────────────────────────────────────┘
       ↓
Queue processor picks lorebook ops
       ↓
┌──────────────────────────────────────────┐
│ LOREBOOK_ENTRY_LOOKUP handlers           │
│  ↓                                       │
│ Process each entity lookup               │
│  ↓                                       │
│ Chain to deduplicate/create/merge        │
│  ↓                                       │
│ Update registry                          │
│  ↓                                       │
│ Mark as COMPLETED                        │
└──────────────────────────────────────────┘
       ↓
All lorebook ops complete
       ↓
COMBINE_SCENE_WITH_RUNNING becomes ready
       ↓
┌──────────────────────────────────────────┐
│ COMBINE_SCENE_WITH_RUNNING handler       │
│  ↓                                       │
│ Collect all scene recaps                 │
│  ↓                                       │
│ Generate combined narrative via LLM      │
│  ↓                                       │
│ Store in chat_metadata                   │
│  ↓                                       │
│ Mark as COMPLETED                        │
└──────────────────────────────────────────┘
```

---

## Performance Characteristics

### Operation Throughput

```
Sequential Processing:
  - 1 operation at a time
  - 5 second delay between operations
  - ~12 operations per minute

With Retries:
  - First retry: 5s delay
  - Second retry: 10s delay (15s total)
  - Third retry: 20s delay (35s total)
  - Unlimited retries by default

Queue Processing Time:
  - 10 operations with no failures: ~50 seconds (10 ops * 5s)
  - 10 operations with 1 retry each: ~100 seconds (10 ops * (5s + 5s))
  - Large queues (100+ ops): Several minutes to hours
```

### Memory Usage

```
Per Operation:
  - Operation object: ~1-2 KB
  - Params (varies): ~0.5-5 KB
  - Metadata: ~0.2-1 KB
  - Total: ~2-8 KB per operation

Queue Storage:
  - 10 operations: ~20-80 KB
  - 100 operations: ~200-800 KB
  - Lorebook entry limit: ~1 MB (ST limit)
  - Practical limit: ~200-300 operations

Completed Operations:
  - Auto-removed: 0 KB overhead
  - No history retained
```

---

## Summary

The Operation Queue System provides:

1. **Sequential Processing**: One operation at a time, preventing race conditions
2. **Persistent State**: Queue survives page reload via lorebook storage
3. **Graceful Recovery**: Handles crashes, aborts, retries with exponential backoff
4. **Chat Blocking**: Blocks user input when operations use same connection profile
5. **Handler Architecture**: Pluggable handlers for each operation type
6. **Multi-Stage Pipelines**: Complex workflows (lorebook processing, scene detection)
7. **UI Integration**: Real-time operation display with status, progress, errors
8. **Error Recovery**: Unlimited retries by default, user can abort during backoff

This architecture ensures reliable, sequential execution of async operations while maintaining system stability and user control.

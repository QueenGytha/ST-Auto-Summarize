# Message Data Persistence - Data Flow

## Table of Contents

- [Overview](#overview)
- [Operation Flows](#operation-flows)
- [Complete Request Examples](#complete-request-examples)
- [Recovery and Edge Cases](#recovery-and-edge-cases)

---

## Overview

This document traces the complete data flow for message data persistence. All data is stored in and retrieved from message.extra.auto_recap_memory, with automatic synchronization to SillyTavern's chat save system.


### Flow Diagram Conventions

Arrow types used in flow diagrams:
- → indicates synchronous call/operation
- ⇒ indicates async call/operation
- │ indicates continuation
- └─ indicates final step
- [STEP] indicates named operation with file reference

---

## Major Operation Flows

### Flow 1: Store Recap - Complete Sequence

**Trigger:** Recap generation completes successfully
**Files:** operationHandlers.js, messageData.js:13-38

1. recap_text() returns recap text
2. Call: set_data(message, 'memory', recapText)
3. messageData.js lines 15-22 STORE
   - Create message.extra if missing
   - Create auto_recap_memory namespace
   - Store value at message.extra.auto_recap_memory[key]
4. If message.swipe_id exists (line 25-31):
   - structuredClone() data to swipe
5. getContext() check (line 34)
6. If ctx.chat && ctx.chatId:
   - saveChatDebounced() queues save
7. After 2000ms: Chat JSON written to disk
   - message.extra persisted to file system

**Result:** Data stored immediately, persisted 2 seconds later

### Flow 2: Retrieve Recap - Safe Access

**Trigger:** UI needs to display recap
**Files:** messageVisuals.js, messageData.js:39-42

1. messageVisuals.js: get_data(message, 'memory')
2. messageData.js line 41 RETRIEVE
   - return message?.extra?.[MODULE_NAME]?.[key]
3. Optional chaining evaluation
   - Short-circuits if any step missing
4. Caller: const recap = get_data(message, 'memory') ?? 'No recap'
5. Fallback applied if undefined

**Result:** Safe retrieval, no errors, fallback handles missing data

### Flow 3: Multi-Key Update - Debounced Save

**Trigger:** Recap generation with error handling
**Files:** operationHandlers.js, messageData.js

Success Path:
1. recap_text() completes
2. set_data(message, 'memory', recapText)
3. set_data(message, 'include', 'Recap of message(s)')
4. set_data(message, 'error', null)
5. saveChatDebounced() triggered 3 times
6. Debounce batches into SINGLE disk write

**Result:** Multiple keys saved atomically

### Flow 4: Session Persistence

**Trigger:** User closes and reopens SillyTavern
**Files:** Chat storage, messageData.js

Store Phase:
1. User sends message
2. set_data() stores recap
3. saveChatDebounced() queued
4. 2000ms later: Chat JSON written to disk
5. message.extra persisted with all data

Recover Phase:
1. User reopens SillyTavern
2. Chat loads from disk
3. message.extra restored
4. get_data() retrieves recap
5. No regeneration needed

**Result:** Complete data preservation across sessions

### Flow 5: Swipe Data Management

**Trigger:** User swipes message
**Files:** messageData.js:25-31, messageData.js:110-116

1. set_data(message, 'memory', newRecap)
2. structuredClone() to active swipe
3. Each swipe has independent copy
4. User swipes: message.swipe_id changes
5. get_data() retrieves current data
6. get_previous_swipe_memory() gets previous swipe data

**Result:** Each swipe maintains independent data

---

## Complete Request Examples

### Example 1: Simple Recap Storage

Before: message = {id: 'msg-1', mes: 'Hello'}
Operation: set_data(message, 'memory', 'User greeting')
After: message.extra.auto_recap_memory.memory = 'User greeting'

### Example 2: Retrieve with Fallback

State: message = {id: 'msg-2', extra: null}
Operation: const recap = get_data(message, 'memory') ?? 'No recap'
Result: recap = 'No recap' (no error)

### Example 3: Error Handling

Sequence:
1. set_data(message, 'memory', 'Generating...')
2. recap_text() throws error
3. set_data(message, 'error', 'Generation failed')
4. Single save operation

Result: Error state persisted

---

## Edge Cases and Recovery

### Edge Case 1: Chat Not Loaded

Process: getContext() returns null, saveChatDebounced() NOT called
Result: Data in RAM only, lost on garbage collection
Protection: Context check at messageData.js:34-36

### Edge Case 2: Malformed Swipe

Process: swipe_info not array, optional chaining short-circuits
Result: Replication skipped, no error
Protection: Optional chaining at messageData.js:26

### Edge Case 3: Null Message

Process: null?.extra short-circuits, returns undefined
Result: No error, fallback applied
Protection: Optional chaining at messageData.js:41

---

**Status:** Complete - All major flows documented with execution traces

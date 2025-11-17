# Active and Inactive Entry Snapshots - Data Flow

## Table of Contents

1. [Overview](#overview)
2. [Normal Message Generation Flow](#normal-message-generation-flow)
3. [Swipe Generation Flow](#swipe-generation-flow)
4. [Continue Generation Flow](#continue-generation-flow)
5. [Sticky Entry Lifecycle Flow](#sticky-entry-lifecycle-flow)
6. [Constant Entry Lifecycle Flow](#constant-entry-lifecycle-flow)
7. [Multi-Lorebook Snapshot Flow](#multi-lorebook-snapshot-flow)
8. [Snapshot Retrieval Flow](#snapshot-retrieval-flow)
9. [Chat Switch Flow](#chat-switch-flow)
10. [Memory Cleanup Flow](#memory-cleanup-flow)
11. [Complete Request Examples](#complete-request-examples)

## Overview

This document traces data flow through the Active and Inactive Entry Snapshots system, showing how lorebook entries are captured, tracked, and persisted for each message generation.

### Flow Diagram Conventions

```
┌─────────────┐
│ Process Box │
└─────────────┘
      ↓
   Decision
   /      \
 YES       NO
  ↓         ↓
Result    Result
```

### Key Data Structures

```typescript
// Active entries for current message
mergedEntries: Array<LorebookEntry>

// Sticky entry tracking (cross-message)
activeStickyEntries: Map<string, {
  entry: LorebookEntry,
  stickyCount: number,
  messageIndex: number
}>

// All entries from all lorebooks
allLorebookEntries: Array<LorebookEntry>

// Active/inactive split
activeEntriesFromAll: Array<LorebookEntry>
inactiveEntries: Array<LorebookEntry>
```

## Normal Message Generation Flow

### Trigger

User sends a new message to the LLM.

### Complete Trace

```
STEP 1: User types message and presses Send
    ↓
STEP 2: SillyTavern begins generation preparation
    ↓
STEP 3: Event fired: GENERATION_STARTED(genType='normal')
    File: index.js:498
    ↓
STEP 4: Calculate target message index
    Code: index.js:500-512
    chatLength = ctx.chat?.length || 0  // e.g., 50
    genType === 'normal'
        ↓
    targetMessageIndex = chatLength  // = 50 (new message)
    currentGenerationType = 'normal'
    ↓
STEP 5: SillyTavern processes lorebook activation
    (Internal ST process - determines which entries match keywords)
    ↓
STEP 6: Event fired: WORLD_INFO_ACTIVATED(entries)
    File: index.js:518
    Data: [
      {uid: 1, comment: 'Alice', world: 'characters.json', sticky: 3, ...},
      {uid: 5, comment: 'Tavern', world: 'locations.json', sticky: 0, ...}
    ]
    ↓
STEP 7-17: Snapshot capture process (see implementation.md for details)
    - Decrement sticky counters
    - Get still-active entries
    - Enhance newly activated entries
    - Update sticky tracking
    - Merge active + still-active
    - Load ALL lorebook entries
    - Split active/inactive
    - Persist to message.extra
```

### Data Transformation Summary

**Input:**
```javascript
entries = [
  {uid: 1, comment: 'Alice', sticky: 3, ...},
  {uid: 5, comment: 'Tavern', sticky: 0, ...}
]
```

**Output (message.extra):**
```javascript
{
  activeLorebookEntries: [
    {comment: 'Alice', uid: 1, strategy: 'normal', sticky: 3, ...},
    {comment: 'Tavern', uid: 5, strategy: 'normal', sticky: 0, ...}
  ],
  inactiveLorebookEntries: [
    {comment: 'Bob', uid: 2, strategy: 'normal', ...},
    {comment: 'Carol', uid: 3, strategy: 'normal', ...},
    ... (76 more entries)
  ]
}
```

### ASCII Flow Diagram

```
┌─────────────────────────────────────┐
│  User Sends Message                 │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  GENERATION_STARTED('normal')       │
│  targetMessageIndex = chatLength    │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  ST Determines Active Entries       │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  WORLD_INFO_ACTIVATED(entries)      │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Decrement Sticky Counters          │
│  Remove Expired Entries             │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Get Still-Active Entries           │
│  (constant + sticky > 0)            │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Enhance New Entries                │
│  (add strategy, normalize fields)   │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Update Sticky Tracking             │
│  (add sticky/constant to Map)       │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Merge New + Still-Active           │
│  (deduplicate by UID)               │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Load ALL Entries from Lorebooks    │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Split Active/Inactive              │
│  (based on merged UIDs)             │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Store in Memory Map                │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  Persist to message.extra           │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  SillyTavern Auto-Save              │
└─────────────────────────────────────┘
```

## Complete Request Examples

### Example 1: First Message with Alice

**Scenario:** User sends first message mentioning "Alice"

**Initial State:**
- No sticky entries tracked
- Empty activeLorebooksPerMessage Map

**Execution:**
```
1. User: "Hello Alice!"
2. GENERATION_STARTED('normal'), targetMessageIndex = 0
3. ST activates "Alice" entry (keyword match)
4. WORLD_INFO_ACTIVATED([{uid: 1, comment: 'Alice', sticky: 3}])
5. Snapshot captured:
   - Active: [{Alice, sticky: 3}]
   - Inactive: [{Bob}, {Carol}, ... 48 more]
6. Persisted to message[0].extra
7. activeStickyEntries.set(1, {stickyCount: 3, messageIndex: 0})
```

**Result:**
- Message 0 has snapshot with Alice active
- Alice tracked for 3 generations

### Example 2: Second Message (Sticky Active)

**Scenario:** User sends message without "Alice" keyword

**Initial State:**
- activeStickyEntries has Alice with stickyCount=3

**Execution:**
```
1. User: "What should we do?"
2. GENERATION_STARTED('normal'), targetMessageIndex = 1
3. decrementStickyCounters() → Alice stickyCount = 2
4. WORLD_INFO_ACTIVATED([]) (no new activations)
5. getStillActiveEntries() → [Alice] (stickyCount=2 > 0)
6. Snapshot captured:
   - Active: [{Alice, sticky: 3}] (from sticky tracking)
   - Inactive: [{Bob}, {Carol}, ... 49 more]
7. Persisted to message[1].extra
```

**Result:**
- Message 1 has Alice in snapshot (no keyword match, but sticky)
- Alice stickyCount now 2

---

**NOTE:** This data-flow.md file is incomplete due to agent response truncation. Full flows for swipe, continue, sticky lifecycle, constant lifecycle, multi-lorebook, retrieval, chat switch, and memory cleanup need to be added. See implementation.md for complete technical details.

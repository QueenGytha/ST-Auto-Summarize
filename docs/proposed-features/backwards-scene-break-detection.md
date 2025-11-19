# Backwards Scene Break Detection - Implementation Specification

**Status:** PRODUCTION READY
**Complexity:** HIGH
**Breaking Changes:** None (additive feature)

---

## ⚠️ CRITICAL IMPLEMENTATION NOTES

### Operation Structure: params vs metadata
**Operations have TWO separate data storage locations:**
```javascript
const operation = {
  type: 'detect_scene_break_backwards',
  params: {                    // Execution data - what operation needs to run
    startIndex: 0,
    endIndex: 29
  },
  metadata: {                  // Tracking data - for UI/debugging/state persistence
    next_break_index: 30,
    discovered_breaks: [],
    triggered_by: 'forward_detection'
  }
};
```

**enqueueOperation takes 3 arguments:**
```javascript
await enqueueOperation(
  OperationType.DETECT_SCENE_BREAK_BACKWARDS,  // arg 1: type
  { startIndex: 0, endIndex: 29 },             // arg 2: params
  {                                            // arg 3: options
    priority: 15,
    metadata: { next_break_index: 30, ... },
    dependencies: []
  }
);
```

### Queue-Based State Management
**Backwards chain state MUST be stored in operation.metadata to survive reload/crash:**
- `next_break_index`: in operation.metadata
- `discovered_breaks` array: in operation.metadata
- `forward_continuation` object: in operation.metadata
- **State persists across page reloads** via lorebook storage
- Each operation is self-contained with ALL chain state in its metadata

### Property Access Requirements
**ALL scene break and checked state access MUST use get_data/set_data:**
- Scene breaks: `get_data(message, 'scene_break')` NOT `message.scene_break`
- Checked state: `get_data(message, 'auto_scene_break_checked')` NOT `message.scene_break_checked`
- Setting checked: `set_data(message, 'auto_scene_break_checked', false)` NOT `delete message.scene_break_checked`

### Handler Registration Pattern
**Handlers are registered via Map, NOT switch statement:**
```javascript
registerOperationHandler(OperationType.DETECT_SCENE_BREAK_BACKWARDS, handleDetectSceneBreakBackwards);
// OR inline:
registerOperationHandler(OperationType.DETECT_SCENE_BREAK_BACKWARDS, async (operation) => {
  // Handler implementation
});
```

### Critical Function Signatures

**detectSceneBreak** (autoSceneBreakDetection.js) - Gets context internally, NOT via parameters:
```javascript
async function detectSceneBreak(
  startIndex,
  endIndex,
  offset = 0,
  forceSelection = false,
  _operationId = null
)
// Gets chat from: getContext().chat
// Gets settings from: get_settings() and loadSceneBreakPromptSettings()
// Gets checkWhich from: get_settings('auto_scene_break_check_which_messages')
```

**toggleSceneBreak** (sceneBreak.js) - Uses dependency injection pattern:
```javascript
toggleSceneBreak(index, get_message_div, getContext, set_data, get_data, saveChatDebounced)
// Required imports from index.js: get_message_div, getContext, set_data, get_data, saveChatDebounced
```

**markRangeAsChecked** (operationHandlers.js:92, local helper) - Simple 3-param function:
```javascript
function markRangeAsChecked(chat, startIdx, endIdx) {
  // Marks ALL messages in range (does NOT filter by checkWhich)
}
```

### Validation Requirements
**Backwards detection MUST validate LLM responses to prevent infinite loops**
Each recursion searches a strictly smaller range - validation ensures monotonic shrinking.
**Solution:** Add validation checks in backwards handler and detectSceneBreak

---

## Executive Summary

Implement recursive backwards scene break detection to address the core problem: LLMs tend to select the "best" scene break in a range rather than the "first" sequential break, causing earlier breaks to be missed.

**Current Behavior:**
- Forward detection finds ONE break per range
- LLM often picks the most dramatic/clear break, not the earliest
- Earlier breaks between chat start and detected break are missed

**Proposed Behavior:**
- When forward detection finds a break, trigger backwards detection
- Search from detected break backwards to previous break (or chat start)
- Recursively find ALL breaks in that range
- Process all scene recaps in chronological order
- Continue forward detection from detected break

---

## Key Concept: Two-Sided Minimum Scene Length

**Forward detection** operates on an UNBOUNDED range (startIndex → unknown future):
- Only validates minimum scene length from range START
- No constraint on the end because future messages are unknown

**Backwards detection** operates on a BOUNDED range between two known points:
- **Range START**: either chat start (index 0) or a previous scene break
- **Range END**: nextBreakIndex - 1 (the message right before the next scene break)

When placing a break at position X in range [startIndex, endIndex]:
- Creates **Scene 1**: [startIndex, X] - from range START to the break
- Creates **Scene 2**: [X+1, endIndex] - from the break to range END

**BOTH resulting scenes must meet minimum scene length:**
- earliestAllowedBreak: ensures Scene 1 has ≥ minimumSceneLength filtered messages from range START
- latestAllowedBreak: ensures Scene 2 has ≥ minimumSceneLength filtered messages to range END

This constraint is applied to the **START and END of the backwards detection range**, ensuring both resulting scenes are valid.

---

## Current System Architecture

### 1. Forward Detection Flow (As-Is)

**Entry Point:** Auto-detection on new message or manual trigger via UI

**File:** `autoSceneBreakDetection.js`

**Function:** `detectSceneBreaksInRange(chat, options)` - async function (lines **1113+**)

**Flow:**
```
1. Calculate range parameters:
   - offset = settings.auto_scene_break_message_offset (default: 2)
   - maxEligibleIndex = endIndex - offset
   - minimumSceneLength = settings.auto_scene_break_minimum_scene_length (default: 3)

2. Find latest visible scene break:
   - Search backwards from endIndex to find previous break marker
   - Uses get_data(message, 'scene_break') to check for breaks
   - If found: previousBreak = index
   - If not found: previousBreak = 0

3. Calculate eligible range:
   - start = previousBreak
   - end = maxEligibleIndex
   - Must have at least (minimumSceneLength + 1) filtered messages

4. Queue DETECT_SCENE_BREAK operation:
   - Type: OperationType.DETECT_SCENE_BREAK
   - Params: { startIndex: start, endIndex: end, offset }
   - Options: { priority: 5, metadata: { triggered_by, ... } }
```

**File:** `operationHandlers.js`

**Handler:** `DETECT_SCENE_BREAK` (inline handler registered at line 269+)

**Flow:**
```
5. Execute detection:
   - Call detectSceneBreak(startIndex, endIndex, offset, forceSelection, operation.id)
   - Retry logic: if forceSelection=true and returns false, retry with reduced range
   - Returns: { sceneBreakAt: number | false, rationale: string }

6a. If break found (sceneBreakAt !== false):
   - Line ~465: toggleSceneBreak(sceneBreakAt, get_message_div, getContext, set_data, get_data, saveChatDebounced)
     - Takes 6 dependency injection parameters (functions imported from index.js)
   - Line ~468: markRangeAsChecked(chat, startIndex, sceneBreakAt) - local helper, 3 params
   - Lines ~473-496: Queue forward continuation
     - Type: DETECT_SCENE_BREAK
     - Params: { startIndex: sceneBreakAt + 1, endIndex: originalEndIndex }
     - Only if remainingFiltered >= minimumSceneLength + 1
     - Options: { priority: 5 }
   - Lines ~499-514: Queue scene recap generation
     - Type: GENERATE_SCENE_RECAP
     - Params: { index: sceneBreakAt }
     - Options: { priority: 20 } - HIGHEST, runs before next detection
     - Only if auto_scene_break_generate_recap enabled

6b. If NO break found (sceneBreakAt === false):
   - Lines 387-437: Mark range as checked
   - Only continue if token limit exceeded (not just message count)
   - Prevents infinite loops
```

**File:** `autoSceneBreakDetection.js`

**Function:** `detectSceneBreak(startIndex, endIndex, offset=0, forceSelection=false, _operationId=null)` - async (lines 877+)
- Gets chat from `getContext().chat`
- Gets settings from `get_settings()` and `loadSceneBreakPromptSettings()`
- Gets checkWhich from `get_settings('auto_scene_break_check_which_messages')`

**Flow:**
```
7. Format and filter messages:
   - chat = getContext().chat
   - checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both'
   - maxEligibleIndex = forceSelection ? endIndex : endIndex - offset
   - Filter messages by checkWhich ('user', 'character', or 'both')
   - filteredIndices = array of message indices matching filter
   - eligibleFilteredIndices = filteredIndices.filter(i => i <= maxEligibleIndex)

8. Check minimum scene length (lines 927-936):
   - If eligibleFilteredIndices.length < minimumSceneLength + 1
   - Return { sceneBreakAt: false, rationale: 'Not enough eligible messages' }

9. Calculate earliest allowed break (lines 938-951):
   - earliestAllowedBreak = eligibleFilteredIndices[minimumSceneLength]
   - Ensures at least minimumSceneLength filtered messages BEFORE the break
   - validChoices = messages between earliestAllowedBreak and maxEligibleIndex

10. Token reduction if needed (lines 963-981):
    - Call reduceMessagesUntilTokenFit() if range exceeds token limit
    - Reduces from END of range (keeps startIndex, reduces endIndex)
    - Recalculates all parameters after reduction

11. Build prompt (lines 983-989):
    - Format messages with token counts
    - Mark "invalid choice" for messages outside valid range
    - Include system prompt with scene break criteria

12. Make LLM request and parse response (lines 991-1004):
    - Step 1: llmClient.makeRequest() with prompt
    - Step 2: parseSceneBreakResponse() extracts structure
    - Returns parsed object: { sceneBreakAt: number | false, rationale: string }

13. Validate response (lines 499-540):
    - Check sceneBreakAt is in filteredIndices
    - Check at least minimumSceneLength filtered messages before it
    - Check not in offset zone (if maxEligibleIndex set)
    - Return validation result
```

**Message Filtering Logic:**

**File:** `autoSceneBreakDetection.js`

**Function:** `buildFormattedMessagesWithTokens()` (lines 542-578)

```
For each message index in filteredIndices:
  - Calculate if ineligible: (i < earliestAllowedBreak) OR (i > maxEligibleIndex)
  - If ineligible: Mark as "Message #invalid choice"
  - If eligible: Mark as "Message #[index]"
  - Include message content and speaker
```

**Example with range 0-50, offset=5, minimumSceneLength=10:**
- Assume filteredIndices = [0, 2, 4, 6, ..., 48, 50] (26 messages)
- maxEligibleIndex = 50 - 5 = 45
- eligibleFilteredIndices = [0, 2, 4, ..., 44] (23 messages)
- earliestAllowedBreak = eligibleFilteredIndices[10] = 20
- **Invalid choices:** Messages 0-18 (below earliestAllowedBreak), Messages 46-50 (above maxEligibleIndex)
- **Valid choices:** Messages 20-44

---

### 2. Token Reduction Logic (As-Is)

**File:** `autoSceneBreakDetection.js`

**Function:** `reduceMessagesUntilTokenFit()` (lines 653-823)

**Purpose:** Reduce message range when it exceeds token limit, ensuring detection still works

**Flow:**
```
1. Initial calculation:
   - currentEndIndex = endIndex
   - reductionPhase = 'coarse' (first) or 'fine' (later)

2. While tokenCount > maxAllowedTokens:
   a. Coarse reduction (lines 792-797):
      - halfwayPoint = startIndex + floor((currentEndIndex - startIndex) / 2)
      - currentEndIndex = findValidCutoffIndex(chat, halfwayPoint, checkWhich, startIndex)
      - Reduces by ~50% each iteration

   b. Fine reduction (lines 799-807):
      - currentEndIndex -= calculateReductionAmount(checkWhich, chat, currentEndIndex)
      - Reduces by 1-2 messages per iteration

   c. Recalculate parameters (lines 810-820):
      - currentMaxEligibleIndex = forceSelection ? currentEndIndex : currentEndIndex - offset
      - Re-filter messages for new range
      - Recalculate earliestAllowedBreak

   d. Check if still viable (lines 754-772):
      - If currentEligibleFilteredIndices.length < minimumSceneLength + 1
      - Return false (cannot detect in this range)

3. Return reduced parameters:
   - endIndex: currentEndIndex
   - maxEligibleIndex: currentMaxEligibleIndex
   - filteredIndices: currentFilteredIndices
   - earliestAllowedBreak: currentEarliestAllowedBreak
```

**CRITICAL:** Reduction ALWAYS removes from END (reduces currentEndIndex), NEVER from START

---

### 3. Operation Queue System (As-Is)

**File:** `operationQueue.js`

**Key Functions:**

**`enqueueOperation(type, params, options)`** (lines 406-490)
```javascript
// Adds operation to queue, persists to lorebook
// Returns: operation object or null if failed
// options: { priority, metadata, dependencies }
```

**`processNextOperation()`** (lines 519-650)
```javascript
// Finds highest priority ready operation (no pending dependencies)
// Executes via handler from handlerRegistry Map
// Marks complete and processes next
```

**Queue State:**
```javascript
{
  operations: [
    {
      id: 'op_1234',
      type: 'DETECT_SCENE_BREAK',
      status: 'pending' | 'processing' | 'completed' | 'failed',
      priority: 5,
      metadata: { /* operation-specific data */ },
      dependencies: ['op_1233'], // must complete first
      created_at: timestamp,
      started_at: timestamp,
      completed_at: timestamp
    }
  ],
  processing_operation: 'op_1234' | null
}
```

**Persistence:**
- Queue stored in lorebook entry (disabled, only for storage)
- Survives ST page reload
- Restored on extension init

**Handler Registry:**
```javascript
// operationHandlers.js - lines 1280-1290
const handlerRegistry = new Map();
registerOperationHandler(OperationType.DETECT_SCENE_BREAK, handleDetectSceneBreak);
registerOperationHandler(OperationType.SCENE_RECAP, handleSceneRecap);
// ... etc
```

---

### 4. Message Checked State (As-Is)

**Purpose:** Track which messages have been checked for scene breaks to avoid re-processing

**Storage:** Message-level data via `set_data(message, 'auto_scene_break_checked', true/false)`

**File:** `operationHandlers.js` (NOT autoSceneBreakDetection.js!)

**Function:** `markRangeAsChecked()` - Local helper function (line 92-99)
```javascript
function markRangeAsChecked(chat, startIdx, endIdx) {
  for (let i = startIdx; i <= endIdx; i++) {
    const msg = chat[i];
    if (msg) {
      set_data(msg, 'auto_scene_break_checked', true);
    }
  }
}
```

**NOTE:** This is a LOCAL HELPER in operationHandlers.js with 3 parameters. It does NOT filter by checkWhich - it marks ALL messages in range.

**Usage in Forward Detection:**
- After placing break marker: mark range [startIndex, sceneBreakAt] as checked
- After no break found: mark entire range [startIndex, endIndex] as checked

**CRITICAL for Backwards:**
- Backwards must UN-mark checked state before detection (allow re-evaluation)
- Must RE-mark after placing break or determining no break exists
- Prevents duplicate checking while allowing backwards re-evaluation

---

## Proposed System Architecture

### 1. Overview of Changes

**New Operation Type:**
- `DETECT_SCENE_BREAK_BACKWARDS` - Recursive backwards detection

**Modified Operation Handler:**
- `DETECT_SCENE_BREAK` - Queue backwards chain when break found

**Modified Function:**
- `detectSceneBreak()` - Accept `isBackwards` parameter, adjust validation

**New Helper Functions:**
- `findPreviousSceneBreak()` - Find scene break before given index
- `calculateLatestAllowedBreak()` - Calculate latest valid break position for backwards mode

**State Management:**
- All backwards chain state in operation.metadata (survives reload)
- Tracks discovered breaks, forward continuation params

---

### 2. Complete Flow (To-Be)

#### Phase 1: Initial Forward Detection + First Backwards Chain

**Step 1: User triggers forward detection**
```
User triggers manual detection via UI button
→ detectSceneBreaksInRange(0, 50)
  → Queue op_1: DETECT_SCENE_BREAK (0, 50)
```

**Step 2: Forward detection finds break at 30**
```
op_1 executes:
  → detectSceneBreak(0, 50, 5, false, 'op_1') returns { sceneBreakAt: 30 }
  → toggleSceneBreak(30, get_message_div, getContext, set_data, get_data, saveChatDebounced)
  → markRangeAsChecked(chat, 0, 30)

  → Queue backwards chain:
    await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK_BACKWARDS,  // type
      {
        // Params: execution data
        startIndex: 0,
        endIndex: 29
      },
      {
        // Options
        priority: 15,  // HIGH - runs before forward continuation
        metadata: {
          // Tracking/state data
          next_break_index: 30,
          discovered_breaks: [],
          check_which: 'both',
          forward_continuation: {
            start_index: 31,
            end_index: 50,
            original_operation_id: 'op_1'
          }
        },
        dependencies: []
      }
    );

  → DO NOT queue forward continuation yet (deferred)
  → Queue recap (depends on backwards op completing)
```

**Step 3: First backwards detection searches range [0, 29]**
```
op_2 executes (DETECT_SCENE_BREAK_BACKWARDS handler):
  → Extract from operation.params: startIndex=0, endIndex=29
  → Extract from operation.metadata: next_break_index=30, discovered_breaks=[], etc.

  → Un-mark checked state: for (i=0; i < 30; i++) set_data(chat[i], 'auto_scene_break_checked', false)

  → detectSceneBreak(0, 29, 0, false, 'op_2', true, 30)
      // args: startIndex, endIndex, offset, forceSelection, operationId, isBackwards, nextBreakIndex

  → LLM searches range [0, 29] and finds break at 15

  → toggleSceneBreak(15, get_message_div, getContext, set_data, get_data, saveChatDebounced)
  → markRangeAsChecked(chat, 16, 29) // Mark from break to next break

  → updatedDiscoveredBreaks = [15]

  → Queue next backwards recursion:
    await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK_BACKWARDS,
      { startIndex: 0, endIndex: 14 },  // params
      {
        priority: 15,
        metadata: {
          next_break_index: 15,
          discovered_breaks: [15],
          check_which: 'both',
          forward_continuation: { ... }  // unchanged
        },
        dependencies: []
      }
    );
```

**Step 4: Second backwards detection searches range [0, 14]**
```
op_4 executes (DETECT_SCENE_BREAK_BACKWARDS handler):
  → Extract from operation.params: startIndex=0, endIndex=14
  → Extract from operation.metadata: next_break_index=15, discovered_breaks=[15], etc.

  → Un-mark checked state: for (i=0; i < 15; i++) set_data(chat[i], 'auto_scene_break_checked', false)

  → detectSceneBreak(0, 14, 0, false, 'op_4', true, 15)

  → LLM searches range [0, 14] and finds break at 7

  → toggleSceneBreak(7, get_message_div, getContext, set_data, get_data, saveChatDebounced)
  → markRangeAsChecked(chat, 8, 14)

  → updatedDiscoveredBreaks = [15, 7]  // reverse chronological order

  → Queue next backwards recursion:
    await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK_BACKWARDS,
      { startIndex: 0, endIndex: 6 },
      {
        priority: 15,
        metadata: {
          next_break_index: 7,
          discovered_breaks: [15, 7],
          check_which: 'both',
          forward_continuation: { ... }
        },
        dependencies: []
      }
    );
```

**Step 5: Third backwards detection searches range [0, 6] - TERMINATES**
```
op_6 executes (DETECT_SCENE_BREAK_BACKWARDS handler):
  → Extract from operation.params: startIndex=0, endIndex=6
  → Extract from operation.metadata: next_break_index=7, discovered_breaks=[15, 7], etc.

  → Un-mark checked state: for (i=0; i < 7; i++) set_data(chat[i], 'auto_scene_break_checked', false)

  → detectSceneBreak(0, 6, 0, false, 'op_6', true, 7)

  → LLM returns NO BREAK (insufficient messages for two-sided constraint)
  → { sceneBreakAt: false, rationale: 'Insufficient messages...' }

  → markRangeAsChecked(chat, 0, 6)

  → discovered_breaks: [15, 7] (in reverse chronological order)
  → TERMINATE backwards chain - call terminateBackwardsChain(operation)

terminateBackwardsChain(operation) executes:
  → chronologicalBreaks = [15, 7].sort() = [7, 15]

  → Queue recaps in CHRONOLOGICAL order with serial dependencies:
    lastRecapId = null
    for each breakIndex in [7, 15]:
      await enqueueOperation(
        OperationType.GENERATE_SCENE_RECAP,
        { index: breakIndex },
        {
          priority: 20,
          metadata: { triggered_by: 'backwards_detection', backwards_chain: true },
          dependencies: lastRecapId ? [lastRecapId] : []
        }
      )
      lastRecapId = recapOp.id

    // Recap for the next break (30 - the one that triggered backwards)
    await enqueueOperation(
      OperationType.GENERATE_SCENE_RECAP,
      { index: 30 },
      {
        priority: 20,
        metadata: { triggered_by: 'backwards_detection', backwards_chain: true },
        dependencies: [lastRecapId]
      }
    )
    lastRecapId = nextBreakRecapOp.id

  → Queue forward continuation:
    await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK,
      { startIndex: 31, endIndex: 50 },  // From forward_continuation
      {
        priority: 5,
        metadata: {
          triggered_by: 'backwards_chain_completion',
          original_operation_id: 'op_1'
        },
        dependencies: [lastRecapId]  // Wait for all recaps
      }
    )
```

---

#### Phase 2: Forward Continuation + Second Backwards Chain

**Step 6: Forward continuation from 31→50**
```
op_11 executes (DETECT_SCENE_BREAK handler, after all recaps complete):
  → detectSceneBreak(31, 50, 5, false, 'op_11')
  → Finds break at 45
  → toggleSceneBreak(45, get_message_div, getContext, set_data, get_data, saveChatDebounced)
  → markRangeAsChecked(chat, 31, 45)

  → Queue backwards chain:
    await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK_BACKWARDS,
      { startIndex: 31, endIndex: 44 },
      {
        priority: 15,
        metadata: {
          next_break_index: 45,
          discovered_breaks: [],
          check_which: 'both',
          forward_continuation: {
            start_index: 46,
            end_index: 50,
            original_operation_id: 'op_11'
          }
        },
        dependencies: []
      }
    );

  → Queue recap (depends on backwards completing)
```

**Steps 7-N: Repeat backwards chain for 31→45 range**
(Same pattern as Phase 1)

---

#### Phase 3: Second Forward Continuation + Third Backwards Chain

**Step N+1: Forward continuation from 46→50**
```
Continues until no more breaks found or range exhausted
```

---

### 3. Key Differences for Backwards Detection

| Aspect | Forward Detection | Backwards Detection |
|--------|------------------|---------------------|
| **Direction** | Search forward in time | Search backward in time |
| **Offset** | YES (default 5 messages) | NO (can place at any message) |
| **Min Scene Length** | Only from range START | From BOTH range START and range END |
| **Recursion** | None (one-shot) | Yes (until no break or chat start) |
| **State** | Stateless | Carries forward continuation params |
| **Checked State** | Marks as checked | Un-marks, then re-marks |
| **Termination** | Queue forward continuation immediately | Defer until backwards chain completes |

---

### 4. Backwards Detection Logic Details

#### A. No Offset

**Forward mode:**
```javascript
maxEligibleIndex = endIndex - offset; // Can't place in last 5 messages
```

**Backwards mode:**
```javascript
maxEligibleIndex = endIndex; // Can place at ANY message up to next break
```

**Rationale:**
- Forward: Prevents placing break too close to present (conversation may continue)
- Backwards: Searching in completed range between two breaks - all messages are valid candidates

---

#### B. Two-Sided Minimum Scene Length

**Forward mode:**
```javascript
// Only validates from range START
earliestAllowedBreak = eligibleFilteredIndices[minimumSceneLength];
// Ensures at least minimumSceneLength filtered messages from range START to break
// No constraint from range END (future messages unknown, range unbounded on the right)
```

**Backwards mode:**
```javascript
// Backwards detection runs on a BOUNDED RANGE between two known points:
// - Range START: either chat start (0) or a previous scene break
// - Range END: nextBreakIndex - 1 (message right before the next scene break)
//
// Range: [startIndex, endIndex] where endIndex = nextBreakIndex - 1
// Break at position X creates TWO scenes within this bounded range:
//   Scene 1: [startIndex, X] - from range START to the break
//   Scene 2: [X+1, endIndex] - from the break to range END
//
// BOTH resulting scenes must meet minimum scene length

earliestAllowedBreak = eligibleFilteredIndices[minimumSceneLength];
// Ensures Scene 1 [startIndex, X] has ≥ minimumSceneLength filtered messages
// Counting from range START (startIndex) forward to the break

latestAllowedBreak = calculateLatestAllowedBreak(
  eligibleFilteredIndices,
  endIndex,
  minimumSceneLength
);
// Ensures Scene 2 [X+1, endIndex] has ≥ minimumSceneLength filtered messages
// Counting from the break to range END (endIndex)
```

**Example 1: Insufficient messages - no valid break positions**
```
Backwards detection range: [0, 29]
  - Range START: 0 (chat start)
  - Range END: 29 (nextBreakIndex=30, so endIndex=29)
minimumSceneLength: 10

Filtered indices in range [0, 29]: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
  → 15 filtered messages total

earliestAllowedBreak = eligibleFilteredIndices[10] = 20
  → 11th filtered message from range START (0-indexed array, so [10])
  → Ensures Scene 1 [startIndex=0, X] has ≥10 filtered messages
  → If X=20: Scene 1 is [0, 20] with messages [0,2,4,6,8,10,12,14,16,18,20] = 11 messages ✓

latestAllowedBreak = calculateLatestAllowedBreak(eligibleFilteredIndices, endIndex=29, minimumSceneLength=10)
  → Find latest position X where Scene 2 [X+1, endIndex=29] has ≥10 filtered messages
  → If X=8: Scene 2 is (8, 29] with messages [10,12,14,16,18,20,22,24,26,28] = 10 messages ✓
  → If X=10: Scene 2 is (10, 29] with messages [12,14,16,18,20,22,24,26,28] = 9 messages ✗
  → latestAllowedBreak = 8

Valid range: earliestAllowedBreak=20 to latestAllowedBreak=8
  → 20 > 8 = INVALID (no valid break positions)
  → detectSceneBreak returns { sceneBreakAt: false, rationale: 'Insufficient messages for two-sided minimum scene length constraint' }
```

**Example 2: Sufficient messages - valid break positions exist**
```
Backwards detection range: [0, 49]
  - Range START: 0 (chat start)
  - Range END: 49 (nextBreakIndex=50, so endIndex=49)
minimumSceneLength: 10

Filtered indices in range [0, 49]: [0, 2, 4, 6, ..., 46, 48] (25 filtered messages total)

earliestAllowedBreak = eligibleFilteredIndices[10] = 20
  → Ensures Scene 1 [0, X] has ≥10 filtered messages from range START
  → If X=20: Scene 1 has [0,2,4,6,8,10,12,14,16,18,20] = 11 messages ✓

latestAllowedBreak = calculateLatestAllowedBreak(eligibleFilteredIndices, endIndex=49, minimumSceneLength=10)
  → Find latest position X where Scene 2 [X+1, 49] has ≥10 filtered messages to range END
  → If X=28: Scene 2 is (28, 49] with messages [30,32,34,36,38,40,42,44,46,48] = 10 messages ✓
  → If X=30: Scene 2 is (30, 49] with messages [32,34,36,38,40,42,44,46,48] = 9 messages ✗
  → latestAllowedBreak = 28

Valid range: earliestAllowedBreak=20 to latestAllowedBreak=28
  → Valid break positions: any filtered message from index 20 to 28
  → LLM can select any message in this range as the scene break
```

**Helper Function:**
```javascript
function calculateLatestAllowedBreak(eligibleFilteredIndices, endIndex, minimumSceneLength) {
  // Find latest index X where Scene 2 [X+1, endIndex] has ≥ minimumSceneLength filtered messages
  // This ensures the scene from the break to range END meets minimum scene length
  // Returns: latest valid break index or -1 if no valid position exists
}
```

---

#### C. Validation to Prevent Infinite Loops

**Problem:** LLM could return invalid break position causing infinite recursion

**Invalid Responses:**
1. `sceneBreakAt >= nextBreakIndex` - At or after the next break (not backwards)
2. `sceneBreakAt` not in valid range - Outside allowed positions
3. Range does not shrink - Same range searched repeatedly

**Solution 1: Validation in detectSceneBreak (lines ~499-540)**

Add validation for backwards mode:
```javascript
if (isBackwards) {
  if (sceneBreakAt >= nextBreakIndex) {
    throw new Error(`Invalid backwards break: ${sceneBreakAt} >= nextBreakIndex ${nextBreakIndex}`);
  }
}
```

**Solution 2: Validation in handleDetectSceneBreakBackwards**

Before queuing next operation:
```javascript
const newEndIndex = sceneBreakAt - 1;
if (newEndIndex >= endIndex) {
  debug(SUBSYSTEM.OPERATIONS, 'Range did not shrink, terminating backwards chain');
  terminateBackwardsChain(operation);
  return;
}
```

**Solution 3: Maximum Recursion Depth (Optional)**

Track recursion depth in metadata:
```javascript
metadata: {
  backwards_depth: (prevDepth || 0) + 1,
  max_backwards_depth: 20 // configurable
}

if (metadata.backwards_depth > metadata.max_backwards_depth) {
  debug(SUBSYSTEM.OPERATIONS, 'Max backwards depth reached, terminating');
  terminateBackwardsChain(operation);
  return;
}
```

---

#### D. Un-mark Checked State

**Why:** Messages between previous break and next break were marked as checked during forward detection. Backwards detection needs to re-evaluate them.

**When:** At START of backwards handler, before calling detectSceneBreak()

**Implementation:**
```javascript
// operationHandlers.js - in handleDetectSceneBreakBackwards
const { startIndex, endIndex, next_break_index } = operation.metadata;

// Un-mark range to allow re-evaluation
for (let i = startIndex; i < next_break_index; i++) {
  const message = chat[i];
  set_data(message, 'auto_scene_break_checked', false);
}
```

---

#### E. Re-mark Checked State in Terminal Operation

**When backwards chain terminates (no more breaks found), re-mark remaining range as checked**

**Implementation in terminateBackwardsChain():**
```javascript
// NOTE: The backwards handler already marks ranges as checked during execution.
// terminateBackwardsChain doesn't need to re-mark - it just queues recaps and forward continuation.
// The last backwards operation that found no break marks the final range as checked.
```

---

## Detailed Implementation Specification

### File 1: `operationTypes.js`

**Add new operation type:**

```javascript
// Add after DETECT_SCENE_BREAK (line ~5 in operationTypes.js or line ~51 in operationQueue.js)
export const OperationType = {
  // ... existing types
  DETECT_SCENE_BREAK: 'detect_scene_break',
  DETECT_SCENE_BREAK_BACKWARDS: 'detect_scene_break_backwards',  // NEW
  // ... rest
};
```

**NOTE:** The OperationType enum exists in BOTH `operationTypes.js` AND `operationQueue.js` (duplicate definitions). Add to whichever file is the canonical source, or add to both if they're kept in sync manually.

---

### File 2: `operationHandlers.js`

#### Refactoring Note: Existing detectSceneBreak Calls

The existing DETECT_SCENE_BREAK handler calls detectSceneBreak like this:
```javascript
result = await detectSceneBreak(startIndex, endIndex, offset, forceSelection, operation.id);
```

This will need to be updated to add backwards parameters:
```javascript
result = await detectSceneBreak(startIndex, endIndex, offset, forceSelection, operation.id, false, null);
// New params: isBackwards=false, nextBreakIndex=null
```

---

#### Change 1: Modify DETECT_SCENE_BREAK Handler (lines ~269-517)

**Current code (lines ~465-496):**
```javascript
// After break found:
toggleSceneBreak(sceneBreakAt, get_message_div, getContext, set_data, get_data, saveChatDebounced);
markRangeAsChecked(chat, startIndex, sceneBreakAt);

// Queue forward continuation
const remainingStart = sceneBreakAt + 1;
const remainingEnd = originalEndIndex;
await enqueueOperation(
  OperationType.DETECT_SCENE_BREAK,
  { startIndex: remainingStart, endIndex: remainingEnd, ... },
  { priority: 5, ... }
);

// Queue recap
if (get_settings('auto_scene_break_generate_recap')) {
  await enqueueOperation(
    OperationType.GENERATE_SCENE_RECAP,
    { index: sceneBreakAt },
    { priority: 20, ... }
  );
}
```

**New code:**
```javascript
// After break found:
toggleSceneBreak(sceneBreakAt, get_message_div, getContext, set_data, get_data, saveChatDebounced);
markRangeAsChecked(chat, startIndex, sceneBreakAt);

// Queue backwards chain FIRST
const checkWhich = operation.params?.checkWhich || 'both';
const backwardsOp = await enqueueOperation(
  OperationType.DETECT_SCENE_BREAK_BACKWARDS,  // type
  {
    // Params: execution data
    startIndex: startIndex,
    endIndex: sceneBreakAt - 1
  },
  {
    // Options
    priority: 15,  // HIGH - runs before forward continuation
    metadata: {
      // Tracking/state data
      next_break_index: sceneBreakAt,
      discovered_breaks: [],
      check_which: checkWhich,
      forward_continuation: {
        start_index: sceneBreakAt + 1,
        end_index: originalEndIndex,
        original_operation_id: operation.id
      }
    },
    dependencies: []
  }
);

// Fallback: if backwards operation fails to queue, queue forward continuation
if (!backwardsOp) {
  debug(SUBSYSTEM.OPERATIONS, 'Failed to queue backwards operation, queueing forward continuation directly');
  await enqueueOperation(
    OperationType.DETECT_SCENE_BREAK,
    { startIndex: sceneBreakAt + 1, endIndex: originalEndIndex, offset, forceSelection },
    {
      priority: 5,
      metadata: {
        triggered_by: 'backwards_chain_fallback',
        original_end_index: originalEndIndex
      }
    }
  );
}

// Queue scene recap (depends on backwards chain completing)
if (get_settings('auto_scene_break_generate_recap')) {
  await enqueueOperation(
    OperationType.GENERATE_SCENE_RECAP,
    { index: sceneBreakAt },
    {
      priority: 20,  // HIGHEST
      metadata: {
        triggered_by: 'scene_break_detection',
        scene_break_index: sceneBreakAt
      },
      dependencies: backwardsOp ? [backwardsOp.id] : []
    }
  );
}
```

**Key changes:**
1. Queue `DETECT_SCENE_BREAK_BACKWARDS` with priority 15 (HIGH - runs before forward continuation)
2. Separate params (startIndex, endIndex) from metadata (tracking data)
3. Do NOT queue forward continuation here (deferred to backwards chain termination via terminateBackwardsChain)
4. Scene recap depends on backwards operation completing
5. Correct toggleSceneBreak signature with 6 dependency injection parameters
6. markRangeAsChecked takes 3 params (no checkWhich parameter)

---

#### Change 2: Add Helper Function - findPreviousSceneBreak

**Location:** After existing helpers (around line 250)

```javascript
/**
 * Find the index of the scene break before the given index
 * @param {Array} chat - Chat messages
 * @param {number} beforeIndex - Search backwards from this index (exclusive)
 * @returns {number} Index of previous scene break, or 0 if none found
 */
function findPreviousSceneBreak(chat, beforeIndex) {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    if (get_data(chat[i], 'scene_break')) {
      return i;
    }
  }
  return 0;
}
```

---

#### Change 3: Add New Handler - DETECT_SCENE_BREAK_BACKWARDS

**Location:** After existing handlers (around line 1100)

```javascript
/**
 * Handle backwards scene break detection operation
 * Recursively searches backwards from next_break_index to find earlier breaks
 */
registerOperationHandler(OperationType.DETECT_SCENE_BREAK_BACKWARDS, async (operation) => {
  const ctx = getContext();
  const chat = ctx.chat;

  // Extract from PARAMS (execution data)
  const { startIndex, endIndex } = operation.params;

  // Extract from METADATA (tracking/state data)
  const {
    next_break_index: nextBreakIndex,
    discovered_breaks: discoveredBreaks = [],
    check_which: checkWhich = 'both',
    forward_continuation: forwardContinuation
  } = operation.metadata;

  // Validate required parameters
  if (nextBreakIndex === undefined || nextBreakIndex === null) {
    throw new Error('next_break_index is required for backwards detection');
  }

  debug(SUBSYSTEM.OPERATIONS, `Backwards detection: [${startIndex}, ${endIndex}], next break: ${nextBreakIndex}`);

  // Un-mark checked state to allow re-evaluation
  for (let i = startIndex; i < nextBreakIndex; i++) {
    set_data(chat[i], 'auto_scene_break_checked', false);
  }

  // Attempt backwards detection
  let result;
  try {
    result = await detectSceneBreak(
      startIndex,
      endIndex,
      0, // offset = 0 for backwards
      false, // forceSelection
      operation.id, // operationId
      true, // isBackwards = true
      nextBreakIndex // nextBreakIndex
    );
  } catch (error) {
    debug(SUBSYSTEM.OPERATIONS, `Error in backwards detection: ${error.message}`);
    await terminateBackwardsChain(operation);
    return;
  }

  const { sceneBreakAt, rationale } = result;

  // Case 1: No break found - terminate backwards chain
  if (sceneBreakAt === false) {
    debug(SUBSYSTEM.OPERATIONS, `No break found in backwards range [${startIndex}, ${endIndex}]`);
    debug(SUBSYSTEM.OPERATIONS, `Rationale: ${rationale}`);

    markRangeAsChecked(chat, startIndex, endIndex);

    await terminateBackwardsChain(operation);
    return;
  }

  // Case 2: Break found - place marker and continue recursion
  debug(SUBSYSTEM.OPERATIONS, `Found backwards break at ${sceneBreakAt}`);

  // Place break marker - 6 dependency injection parameters
  toggleSceneBreak(sceneBreakAt, get_message_div, getContext, set_data, get_data, saveChatDebounced);

  // Mark intermediate range as checked (between break and next break)
  if (sceneBreakAt + 1 < nextBreakIndex) {
    markRangeAsChecked(chat, sceneBreakAt + 1, nextBreakIndex - 1);
  }

  // Add to discovered breaks
  const updatedDiscoveredBreaks = [...discoveredBreaks, sceneBreakAt];

  // Validate that range shrinks
  const newEndIndex = sceneBreakAt - 1;
  if (newEndIndex >= endIndex) {
    debug(SUBSYSTEM.OPERATIONS, 'Range did not shrink, terminating backwards chain');
    await terminateBackwardsChain(operation);
    return;
  }

  // Check if enough messages remain for another backwards recursion
  const minSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || 10;
  const remainingRange = newEndIndex - startIndex + 1;
  if (remainingRange < minSceneLength * 2) {
    debug(SUBSYSTEM.OPERATIONS, 'Insufficient messages for further backwards detection');

    markRangeAsChecked(chat, startIndex, newEndIndex);

    await terminateBackwardsChain({
      ...operation,
      metadata: {
        ...operation.metadata,
        discovered_breaks: updatedDiscoveredBreaks
      }
    });
    return;
  }

  // Queue next backwards recursion
  const nextBackwardsOp = await enqueueOperation(
    OperationType.DETECT_SCENE_BREAK_BACKWARDS,  // type
    { startIndex: startIndex, endIndex: newEndIndex },  // params
    {
      priority: 15,  // HIGH
      metadata: {
        next_break_index: sceneBreakAt,
        discovered_breaks: updatedDiscoveredBreaks,
        check_which: checkWhich,
        forward_continuation: forwardContinuation
      },
      dependencies: []
    }
  );

  if (!nextBackwardsOp) {
    debug(SUBSYSTEM.OPERATIONS, 'Failed to queue next backwards operation, terminating chain');
    await terminateBackwardsChain({
      ...operation,
      metadata: {
        ...operation.metadata,
        discovered_breaks: updatedDiscoveredBreaks
      }
    });
    return;
  }

  debug(SUBSYSTEM.OPERATIONS, `Queued next backwards operation: ${nextBackwardsOp.id}`);
});

/**
 * Terminate backwards chain and queue all recaps + forward continuation
 */
async function terminateBackwardsChain(operation) {
  const {
    discovered_breaks: discoveredBreaks = [],
    forward_continuation: forwardContinuation,
    next_break_index: nextBreakIndex
  } = operation.metadata;

  debug(SUBSYSTEM.OPERATIONS, `Terminating backwards chain. Discovered breaks: ${discoveredBreaks.join(', ')}`);

  // Sort breaks in chronological order (ascending)
  const chronologicalBreaks = [...discoveredBreaks].sort((a, b) => a - b);

  // Queue recaps in chronological order with serial dependencies
  let lastRecapId = null;

  const generateRecaps = get_settings('auto_scene_break_generate_recap');
  if (generateRecaps) {
    for (const breakIndex of chronologicalBreaks) {
      const recapOp = await enqueueOperation(
        OperationType.GENERATE_SCENE_RECAP,  // type
        { index: breakIndex },  // params
        {
          priority: 20,  // HIGHEST
          metadata: {
            triggered_by: 'backwards_detection',
            backwards_chain: true
          },
          dependencies: lastRecapId ? [lastRecapId] : []
        }
      );

      if (recapOp) {
        lastRecapId = recapOp.id;
      } else {
        debug(SUBSYSTEM.OPERATIONS, `Failed to queue recap for break ${breakIndex}`);
      }
    }

    // Queue recap for the next break (the one that triggered backwards chain)
    const nextBreakRecapOp = await enqueueOperation(
      OperationType.GENERATE_SCENE_RECAP,
      { index: nextBreakIndex },
      {
        priority: 20,
        metadata: {
          triggered_by: 'backwards_detection',
          backwards_chain: true
        },
        dependencies: lastRecapId ? [lastRecapId] : []
      }
    );

    if (nextBreakRecapOp) {
      lastRecapId = nextBreakRecapOp.id;
    }
  }

  // Queue forward continuation (depends on last recap if recaps enabled)
  if (forwardContinuation) {
    const forwardOp = await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK,  // type
      {
        startIndex: forwardContinuation.start_index,
        endIndex: forwardContinuation.end_index
      },  // params
      {
        priority: 5,  // NORMAL
        metadata: {
          triggered_by: 'backwards_chain_completion',
          original_operation_id: forwardContinuation.original_operation_id
        },
        dependencies: lastRecapId ? [lastRecapId] : []
      }
    );

    if (forwardOp) {
      debug(SUBSYSTEM.OPERATIONS, `Queued forward continuation: ${forwardOp.id}`);
    } else {
      debug(SUBSYSTEM.OPERATIONS, 'Failed to queue forward continuation');
    }
  }

  debug(SUBSYSTEM.OPERATIONS, 'Backwards chain terminated successfully');
}
```

---

#### Change 4: Register Handler

**NOTE:** The backwards handler is registered inline using `registerOperationHandler()` directly in Change 3 above. No separate registration step is needed.

The pattern used is:
```javascript
registerOperationHandler(OperationType.DETECT_SCENE_BREAK_BACKWARDS, async (operation) => {
  // Handler implementation inline
});
```

This is the standard pattern used throughout the codebase for operation handlers.

---

### File 3: `autoSceneBreakDetection.js`

#### Change 1: Modify detectSceneBreak Function Signature (line ~877)

**Current signature:**
```javascript
async function detectSceneBreak(
  startIndex,
  endIndex,
  offset = 0,
  forceSelection = false,
  _operationId = null
)
```

**IMPORTANT:** The function is NOT exported, and does NOT take `chat`, `settings`, or `checkWhich` as parameters. It gets these via:
- `chat` from `getContext().chat`
- `settings` from `get_settings()` and `loadSceneBreakPromptSettings()`
- `checkWhich` from `get_settings('auto_scene_break_check_which_messages')`

**New signature:**
```javascript
async function detectSceneBreak(
  startIndex,
  endIndex,
  offset = 0,
  forceSelection = false,
  _operationId = null,
  isBackwards = false,      // NEW
  nextBreakIndex = null     // NEW
)
```

**Add parameter validation (early in function body):**
```javascript
// Validate backwards mode parameters
if (isBackwards && (nextBreakIndex === undefined || nextBreakIndex === null)) {
  throw new Error('nextBreakIndex is required when isBackwards=true');
}
```

---

#### Change 2: Modify Offset Handling (line 924)

**Current code:**
```javascript
const maxEligibleIndex = forceSelection ? endIndex : endIndex - offset;
```

**New code:**
```javascript
const maxEligibleIndex = forceSelection || isBackwards ? endIndex : endIndex - offset;
```

**Rationale:** Backwards mode ignores offset (can place break anywhere in range)

---

#### Change 3: Add Two-Sided Min Scene Length for Backwards (after line 951)

**Current code (lines 938-951):**
```javascript
const earliestAllowedBreak = eligibleFilteredIndices[minimumSceneLength];
```

**New code:**
```javascript
const earliestAllowedBreak = eligibleFilteredIndices[minimumSceneLength];

let latestAllowedBreak = maxEligibleIndex;
if (isBackwards) {
  // For backwards mode, enforce two-sided minimum scene length
  // endIndex is the end of the search range [startIndex, endIndex]
  latestAllowedBreak = calculateLatestAllowedBreak(
    eligibleFilteredIndices,
    endIndex,  // Use endIndex, NOT nextBreakIndex
    minimumSceneLength
  );

  if (latestAllowedBreak === -1 || latestAllowedBreak < earliestAllowedBreak) {
    debug(SUBSYSTEM.CORE, 'No valid break positions with two-sided minimum scene length');
    return {
      sceneBreakAt: false,
      rationale: 'Insufficient messages for two-sided minimum scene length constraint'
    };
  }

  debug(SUBSYSTEM.CORE, `Backwards mode: valid range [${earliestAllowedBreak}, ${latestAllowedBreak}]`);
}
```

**Update buildFormattedMessagesWithTokens call (line ~986):**
```javascript
const messagesWithTokens = buildFormattedMessagesWithTokens(
  chat,
  filteredIndices,
  earliestAllowedBreak,
  isBackwards ? latestAllowedBreak : maxEligibleIndex
);
```

---

#### Change 4: Add Helper Function - calculateLatestAllowedBreak

**Location:** After buildFormattedMessagesWithTokens (around line 640)

```javascript
/**
 * Calculate the latest allowed break position for backwards detection
 * Ensures Scene 2 (from break to range END) has at least minimumSceneLength filtered messages
 *
 * @param {number[]} eligibleFilteredIndices - Filtered message indices in backwards detection range [startIndex, endIndex]
 * @param {number} endIndex - END of backwards detection range (= nextBreakIndex - 1)
 * @param {number} minimumSceneLength - Minimum scene length requirement
 * @returns {number} Latest valid break index, or -1 if no valid position exists
 */
function calculateLatestAllowedBreak(eligibleFilteredIndices, endIndex, minimumSceneLength) {
  // For each candidate break position (from latest to earliest)
  for (let i = eligibleFilteredIndices.length - 1; i >= 0; i--) {
    const candidateBreak = eligibleFilteredIndices[i];

    // Count filtered messages from this break to range END
    // Scene 2 would be (candidateBreak, endIndex]
    const messagesAfter = eligibleFilteredIndices.filter(
      idx => idx > candidateBreak && idx <= endIndex
    ).length;

    if (messagesAfter >= minimumSceneLength) {
      return candidateBreak;
    }
  }

  return -1; // No valid position found
}
```

---

#### Change 5: Add Validation for Backwards Mode (after LLM response)

**Location:** After parseSceneBreakResponse (around line 1000)

**Current code:**
```javascript
const parsed = parseSceneBreakResponse(response, filteredIndices);
const validated = validateSceneBreakResponse(parsed.sceneBreakAt, {
  startIndex,
  endIndex,
  filteredIndices,
  minimumSceneLength,
  maxEligibleIndex
});
return validated;
```

**IMPORTANT:** `validateSceneBreakResponse` takes 2 parameters:
1. `sceneBreakAt` (number or false)
2. `config` object with fields: startIndex, endIndex, filteredIndices, minimumSceneLength, maxEligibleIndex

**New code:**
```javascript
const parsed = parseSceneBreakResponse(response, filteredIndices);

const validated = validateSceneBreakResponse(parsed.sceneBreakAt, {
  startIndex,
  endIndex,
  filteredIndices,
  minimumSceneLength,
  maxEligibleIndex: isBackwards ? latestAllowedBreak : maxEligibleIndex
});

// Additional validation for backwards mode
if (isBackwards && validated.sceneBreakAt !== false) {
  if (validated.sceneBreakAt >= nextBreakIndex) {
    debug(SUBSYSTEM.CORE, `Invalid backwards break: ${validated.sceneBreakAt} >= nextBreakIndex ${nextBreakIndex}`);
    return {
      sceneBreakAt: false,
      rationale: `Invalid backwards break position (>= next break at ${nextBreakIndex})`
    };
  }
}

return validated;
```

---

#### Change 6: Update buildFormattedMessagesWithTokens (lines 542-578)

**Current signature:**
```javascript
function buildFormattedMessagesWithTokens(
  chat,
  filteredIndices,
  earliestAllowedBreak,
  maxEligibleIndex
)
```

**Keep signature, update logic:**

**Current code (line ~560):**
```javascript
const ineligible = (i < earliestAllowedBreak) || (i > maxEligibleIndex);
```

**Keep as-is** - already supports two-sided constraints via `maxEligibleIndex` parameter

---

### File 4: Priority Constants

**NO CHANGES NEEDED** - The codebase does NOT use an `OperationPriority` enum. Priorities are specified as raw numbers:

- `20` - HIGHEST - Scene recaps
- `15` - HIGH - Backwards detection (NEW)
- `5` - NORMAL - Forward detection
- `1-4` - LOW - Maintenance operations

Use these numeric values directly in all `enqueueOperation` calls:
```javascript
await enqueueOperation(type, params, { priority: 15, ... });  // Backwards detection
```

---

## Error Handling for Backwards Operations

### Philosophy

Backwards detection is **non-critical**: if it fails, forward detection continues normally.

**Principle:** Graceful degradation - never block chat or lose forward progress.

---

### Rationale

- Backwards is an enhancement to find earlier breaks
- Forward detection already found at least one break
- Users can always manually trigger detection again
- Better to skip backwards than to block the entire queue

---

### Error Handling Implementation

**In handleDetectSceneBreakBackwards:**

```javascript
try {
  result = await detectSceneBreak(...);
} catch (error) {
  debug(SUBSYSTEM.OPERATIONS, `Error in backwards detection: ${error.message}`);

  // Terminate chain and continue forward
  await terminateBackwardsChain(operation);
  return;
}
```

**In terminateBackwardsChain:**

```javascript
// Queue operations with null checks
const recapOp = await enqueueOperation({...});
if (!recapOp) {
  debug(SUBSYSTEM.OPERATIONS, `Failed to queue recap for break ${breakIndex}`);
  // Continue with next operation, don't fail entire chain
}
```

**User Feedback:**

- Toast notification: "Backwards detection encountered an error, continuing forward detection"
- Log details to console (debug mode)
- No blocking modal or error message

---

## UI Feedback Specification

### Toast Notifications

**When backwards chain starts:**
```javascript
toastr.info(
  `Searching backwards for earlier scene breaks...`,
  'Scene Break Detection',
  { timeOut: 3000 }
);
```

**When backwards finds multiple breaks:**
```javascript
toastr.success(
  `Found ${discoveredBreaks.length} earlier scene breaks`,
  'Backwards Detection',
  { timeOut: 5000 }
);
```

**When backwards finds no breaks:**
```javascript
toastr.info(
  `No earlier breaks found, continuing forward`,
  'Backwards Detection',
  { timeOut: 3000 }
);
```

**On backwards error:**
```javascript
toastr.warning(
  `Backwards detection encountered an error, continuing forward detection`,
  'Scene Break Detection',
  { timeOut: 5000 }
);
```

---

### Progress Indicator (Optional)

**Display during backwards recursion:**

```
Scene Break Detection
├─ Forward: Found break at #30
├─ Backwards: Searching 0→30...
│  ├─ Found break at #15
│  ├─ Searching 0→15...
│  ├─ Found break at #7
│  └─ Searching 0→7... (no breaks)
├─ Generating recaps (3 scenes)...
└─ Continuing forward from #31...
```

**Implementation:** Update queue UI to show operation tree with dependencies

---

### Queue UI Display

**Show backwards operations in queue:**
- Type: "🔍 Backwards Detection"
- Status: "Searching 0→30"
- Priority: HIGH (yellow indicator)
- Dependencies: None (initial) or parent backwards operation

---

## Partial Chain Recovery Specification

### Behavior When Queue Cleared Mid-Chain

**Scenario:** User clears queue while backwards chain is running

**Current behavior:**
- All pending operations removed
- In-progress operation completes
- No subsequent operations run

**Impact on backwards chain:**
- Forward continuation lost (acceptable - user chose to clear)
- Discovered breaks already placed remain in chat
- Recaps may be incomplete

**No changes needed** - current queue clearing behavior is acceptable.

**Rationale:**
- User explicitly cleared queue (intentional action)
- Placed break markers are persisted
- User can re-trigger detection if needed

---

### Optional: Warning Before Queue Clear

**When queue contains backwards operations:**

```javascript
// In queue clearing function
if (hasBackwardsOperations(queue)) {
  const confirm = await showConfirmDialog(
    'Clear Queue During Backwards Detection?',
    'Backwards scene break detection is in progress. Clearing the queue will stop the search for earlier breaks. Continue?',
    'Clear Queue',
    'Cancel'
  );

  if (!confirm) return;
}
```

**Not required for initial implementation** - can be added later if users report confusion.

---

## Edge Cases

### 1. Empty Backwards Range

**Scenario:** Forward finds break at index 5, no previous break exists (search 0→4)
**Range:** 0→4 (5 messages total)
**minimumSceneLength:** 10

**Behavior:**
- Backwards handler queued
- detectSceneBreak returns false (insufficient messages)
- Range marked as checked
- terminateBackwardsChain queues recap for break at 5
- Forward continuation proceeds

**No special handling needed** - existing logic handles this

---

### 2. Insufficient Messages for Min Scene Length

**Scenario:** Backwards finds break at 15, next recursion searches range [0, 14]
**Range:** 0→14 (15 messages total)
**minimumSceneLength:** 10
**Required for two-sided constraint:** At least 20 filtered messages total (10 from range START + 10 to range END)

**Behavior:**
- calculateLatestAllowedBreak returns -1 (no valid position where both resulting scenes meet minimum)
- detectSceneBreak returns false
- Range marked as checked
- terminateBackwardsChain triggered

**Implemented in Change 3** - validation in detectSceneBreak

---

### 3. Page Reload Mid-Recursion

**Scenario:** ST page reloads while backwards operation in queue

**Behavior:**
1. Queue restored from lorebook (persisted)
2. Backwards operation still in queue with ALL metadata
3. Operation resumes from queue on next processNextOperation
4. discovered_breaks, forward_continuation preserved
5. Continues normally

**No special handling needed** - queue persistence handles this

---

### 4. Multiple Forward Detections Concurrent

**Scenario:** User triggers manual detection twice quickly via UI
**Queue:**
- op_1: DETECT_SCENE_BREAK (0, 50) - finds break at 30
- op_2: DETECT_SCENE_BREAK (0, 80) - queued before op_1 completes

**Behavior:**
- op_1 places break at 30, queues backwards chain (0→29)
- op_1 DOES NOT queue forward continuation (deferred to backwards chain)
- op_2 executes, sees break at 30 as previous break
- op_2 searches (30, 75) - different range, no conflict
- Each operation's backwards chain is independent

**No conflicts** - operations are sequential, ranges don't overlap

---

### 5. User Manually Triggers Recap While Backwards Running

**Scenario:**
- Backwards chain running, discovered breaks [7, 15]
- User manually triggers recap for message 7 (already in backwards chain)
- Queue has pending recap operation for message 7

**Behavior:**
1. User's manual recap operation queued
2. Backwards chain's recap operation queued (later)
3. Both operations execute sequentially
4. Second operation is idempotent (regenerates recap)
5. No errors, just redundant LLM call

**Optional improvement:**
- Check if message already has pending recap operation
- Skip queuing duplicate recap in terminateBackwardsChain

**Not required for initial implementation** - rare edge case, no harmful effects

---

### 6. Operation Queue Cleared During Backwards Chain

**Already covered in "Partial Chain Recovery Specification"**

---

### 7. Invalid LLM Response (Break >= Next Break)

**Scenario:** LLM returns break at index 35 when nextBreakIndex=30

**Validation catches this:**
```javascript
if (isBackwards && validated.sceneBreakAt !== false) {
  if (validated.sceneBreakAt >= nextBreakIndex) {
    return {
      sceneBreakAt: false,
      rationale: 'Invalid backwards break position'
    };
  }
}
```

**Behavior:**
- Treated as "no break found"
- terminateBackwardsChain called
- Range marked as checked
- Forward continuation proceeds

**Implemented in Change 5** - validation in detectSceneBreak

---

### 8. Range Does Not Shrink

**Scenario:** LLM returns same endIndex for next recursion

**Validation catches this:**
```javascript
const newEndIndex = sceneBreakAt - 1;
if (newEndIndex >= endIndex) {
  debug(SUBSYSTEM.OPERATIONS, 'Range did not shrink, terminating backwards chain');
  await terminateBackwardsChain(operation);
  return;
}
```

**Behavior:**
- Backwards chain terminated
- Prevents infinite loop

**Implemented in handleDetectSceneBreakBackwards** - range shrinking check

---

## Implementation Quality Commitment

**Reality:** There is no automated testing. Manual testing is the only option. Therefore, I must code it correctly the first time to minimize debugging burden.

**My commitment to quality:**

### 1. Read Existing Code THOROUGHLY Before Writing Anything

**For EVERY function call, I will:**
- Find the existing function in the codebase
- Read the ENTIRE function implementation
- Note EXACT parameter order and types
- Note return type and possible error conditions
- Find at least 2-3 existing call sites to see usage patterns

**Example checklist for `toggleSceneBreak`:**
- [ ] Read function definition in sceneBreak.js (line 105)
- [ ] Count parameters: 1=index, 2=get_message_div, 3=getContext, 4=set_data, 5=get_data, 6=saveChatDebounced
- [ ] Verify it's NOT async (doesn't return Promise)
- [ ] Find 3 existing call sites and verify parameter order
- [ ] Note that this uses DEPENDENCY INJECTION - pass function references, not data
- [ ] Verify it uses set_data() parameter internally for scene_break property
- [ ] Note required imports: get_message_div, getContext, set_data, get_data, saveChatDebounced from index.js

**I will NOT:**
- Guess parameter order
- Assume a function is async without checking
- Use a function without reading its implementation

### 2. Verify EVERY Metadata Field Access

**Operation structure MUST be accessed correctly:**

```javascript
// Read existing handler FIRST - find in operationHandlers.js

// Verify TWO separate data locations:
const { startIndex, endIndex, offset } = operation.params;  // ✓ Execution data
const { start_index, end_index } = operation.metadata;      // ✓ Tracking data

// WRONG patterns:
const startIndex = operation.start_index;  // ✗ WRONG - missing .params or .metadata
const { next_break_index } = operation.params;  // ✗ WRONG - state should be in metadata

// Check params vs metadata separation
```

**Before writing backwards handler, I will:**
- [ ] Read handleDetectSceneBreak completely (line 269+)
- [ ] List ALL fields in operation.params (startIndex, endIndex, offset, forceSelection)
- [ ] List ALL fields in operation.metadata (triggered_by, original_end_index, etc.)
- [ ] Verify params vs metadata separation pattern
- [ ] Note how enqueueOperation takes (type, params, {priority, metadata, dependencies})
- [ ] Copy the exact pattern for backwards handler

### 3. Trace EVERY Code Path on Paper

**For each handler/function, trace execution on paper:**

```
Function: DETECT_SCENE_BREAK_BACKWARDS handler
Input: operation with params { startIndex: 0, endIndex: 29 }
       and metadata { next_break_index: 30, discovered_breaks: [], check_which: 'both', ... }

Line-by-line trace:
1. Extract from operation.params → startIndex=0, endIndex=29
2. Extract from operation.metadata → nextBreakIndex=30, discoveredBreaks=[], checkWhich='both'
3. Validate nextBreakIndex !== undefined → ✓ (30)
4. Loop i from 0 to 29: set_data(chat[i], 'auto_scene_break_checked', false)
5. Call detectSceneBreak(0, 29, 0, false, operation.id, true, 30)
   - Params: startIndex=0, endIndex=29, offset=0, forceSelection=false, operationId, isBackwards=true, nextBreakIndex=30
6. Assume returns { sceneBreakAt: 15, rationale: '...' }
7. sceneBreakAt !== false → true, go to Case 2
8. Call toggleSceneBreak(15, get_message_div, getContext, set_data, get_data, saveChatDebounced)
   - Verify: 6 dependency injection parameters ✓
9. Calculate markStart = 15 + 1 = 16, markEnd = 30 - 1 = 29
10. If 16 < 30 → true, call markRangeAsChecked(chat, 16, 29)
    - Note: 3 params only (no checkWhich)
11. updatedDiscoveredBreaks = [15]
12. newEndIndex = 15 - 1 = 14
13. If 14 >= 29 → false, continue
14. remainingRange = 14 - 0 + 1 = 15
15. minSceneLength = get_settings('auto_scene_break_minimum_scene_length') || 10
16. If 15 < minSceneLength * 2 → check value
17. enqueueOperation(
      OperationType.DETECT_SCENE_BREAK_BACKWARDS,
      { startIndex: 0, endIndex: 14 },  // params
      {
        priority: 15,
        metadata: { next_break_index: 15, discovered_breaks: [15], ... }
      }
    )

Verify each step:
- Variables calculated correctly? ✓
- Function calls have correct parameters? ✓
- params vs metadata separation? ✓
- Conditions evaluate correctly? ✓
```

**I will trace:**
- Normal case (break found)
- Termination case (no break found)
- Edge case (range too small)
- Invalid response case (sceneBreakAt >= nextBreakIndex)

### 4. Check EVERY Calculation By Hand

**For calculateLatestAllowedBreak:**

```javascript
// Given inputs:
filteredIndices = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
endIndex = 29
minimumSceneLength = 10

// Trace execution:
for (i = 14; i >= 0; i--) {
  // i=14: candidateBreak = 28
  //   messagesAfter = filteredIndices.filter(idx => idx > 28 && idx <= 29)
  //   = filter([]) = []
  //   length = 0 < 10 → continue

  // i=13: candidateBreak = 26
  //   messagesAfter = filter on idx > 26 && idx <= 29
  //   = [28]
  //   length = 1 < 10 → continue

  // ... (manual trace through each iteration)

  // i=4: candidateBreak = 8
  //   messagesAfter = filter on idx > 8 && idx <= 29
  //   = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
  //   length = 10 >= 10 → return 8 ✓
}

// Verify against spec example at lines 1809-1836
// Expected: returns 8
// Actual: returns 8 ✓
```

**I will verify:**
- Every loop iteration
- Every filter condition
- Every array operation
- Every comparison
- Against examples in spec

### 5. Cross-Reference Against Spec 3+ Times

**Before declaring implementation complete:**

**Pass 1: Check all required components exist**
- [ ] OperationType.DETECT_SCENE_BREAK_BACKWARDS added
- [ ] handleDetectSceneBreakBackwards implemented
- [ ] terminateBackwardsChain implemented
- [ ] findPreviousSceneBreak implemented
- [ ] calculateLatestAllowedBreak implemented
- [ ] Handler registered in handler registry
- [ ] detectSceneBreak signature updated
- [ ] Offset handling modified
- [ ] Two-sided validation added
- [ ] Backwards validation added

**Pass 2: Check all metadata fields match spec**
- [ ] start_index (not startIndex)
- [ ] end_index (not endIndex)
- [ ] next_break_index (not nextBreakIndex)
- [ ] discovered_breaks (not discoveredBreaks)
- [ ] check_which (not checkWhich)
- [ ] forward_continuation with start_index, end_index, original_operation_id

**Pass 3: Check all function signatures exactly match actual code**
- [ ] detectSceneBreak(startIndex, endIndex, offset=0, forceSelection=false, _operationId=null, isBackwards=false, nextBreakIndex=null)
  - Gets chat from getContext().chat, settings from get_settings(), checkWhich from get_settings()
- [ ] calculateLatestAllowedBreak(eligibleFilteredIndices, endIndex, minimumSceneLength)
- [ ] findPreviousSceneBreak(chat, beforeIndex)
- [ ] DETECT_SCENE_BREAK_BACKWARDS handler registered via registerOperationHandler (inline arrow function)
- [ ] terminateBackwardsChain(operation) - async helper function
- [ ] toggleSceneBreak(index, get_message_div, getContext, set_data, get_data, saveChatDebounced)
- [ ] markRangeAsChecked(chat, startIdx, endIdx) - 3 params only

### 6. Lint and Syntax Check BEFORE Committing

```bash
npm run syntax-check    # Must pass
npm run lint           # Must pass with 0 warnings
```

**I will fix ALL warnings, not just errors.**

### 7. Add Debug Logging EVERYWHERE

**Every significant action gets a log:**

```javascript
debug(SUBSYSTEM.OPERATIONS, `Backwards detection: [${startIndex}, ${endIndex}], next break: ${nextBreakIndex}`);
debug(SUBSYSTEM.OPERATIONS, `Found backwards break at ${sceneBreakAt}`);
debug(SUBSYSTEM.OPERATIONS, `Discovered breaks so far: ${JSON.stringify(updatedDiscoveredBreaks)}`);
debug(SUBSYSTEM.OPERATIONS, `No break found in backwards range [${startIndex}, ${endIndex}]`);
debug(SUBSYSTEM.OPERATIONS, `Range did not shrink, terminating backwards chain`);
debug(SUBSYSTEM.OPERATIONS, `Insufficient messages for further backwards detection`);
debug(SUBSYSTEM.OPERATIONS, `Terminating backwards chain. Discovered breaks: ${discoveredBreaks.join(', ')}`);
debug(SUBSYSTEM.OPERATIONS, `Queuing ${chronologicalBreaks.length} recaps in chronological order`);
debug(SUBSYSTEM.OPERATIONS, `Queued forward continuation: ${forwardOp.id}`);
debug(SUBSYSTEM.CORE, `Backwards mode: valid range [${earliestAllowedBreak}, ${latestAllowedBreak}]`);
```

**This enables debugging during manual testing.**

### 8. Quality Checklist Before Submitting

**I will verify:**
- [ ] Code compiles (syntax-check passes)
- [ ] Code lints (lint passes with 0 warnings)
- [ ] All functions from spec are implemented
- [ ] All metadata fields match spec exactly
- [ ] All function signatures match spec exactly
- [ ] All validation checks from spec are present
- [ ] All debug logs from spec are present
- [ ] Traced execution on paper for 3+ scenarios
- [ ] Verified all calculations by hand
- [ ] Read all called functions completely
- [ ] No guesses - everything verified against existing code
- [ ] No TODOs or placeholders left in code
- [ ] No commented-out code
- [ ] No console.log (only debug())

**If ANY item is unchecked, implementation is NOT complete.**

### What This Means

**I will be SLOW but THOROUGH:**
- Read more existing code
- Trace more execution paths
- Verify more calculations
- Check more examples
- Take more time

**I will NOT:**
- Rush to finish quickly
- Guess at parameter order
- Skip verification steps
- Leave placeholders
- Submit half-finished code

**Expected outcome:**
- Code works correctly on first manual test
- Minimal debugging required
- No "oh I forgot to..." fixes needed

---

## Performance Considerations

### Time Complexity

**Forward detection:** O(n) where n = chat length
- Single pass through chat

**Backwards detection:** O(m log m) where m = number of breaks found
- Each backwards recursion searches progressively smaller range
- Total messages processed: bounded by chat length

**Worst case:** Chat with breaks every 20 messages
- 100 message chat = ~5 breaks
- 5 backwards recursions + 5 forward detections = 10 total LLM calls
- Still O(n) overall

---

### Token Usage

**Backwards uses SAME token reduction logic as forward**
- No additional token costs
- May actually reduce tokens by finding earlier (smaller) scenes

---

### Queue Overhead

**Additional operations per forward break found:**
- 1 backwards operation (initial)
- 0-N backwards recursions (where N = earlier breaks)
- 0-N recaps (same as forward)
- 1 forward continuation (deferred)

**Net overhead:** Minimal - same total operations, just different ordering

---

## Rollback Plan

### If Implementation Fails

**Revert changes:**
1. Remove `DETECT_SCENE_BREAK_BACKWARDS` operation type
2. Remove handler registration
3. Revert DETECT_SCENE_BREAK handler to queue forward continuation immediately
4. Revert detectSceneBreak signature

**Impact:** Forward detection continues working as before

---

### Feature Flag (Optional)

**Add setting to disable backwards detection:**

```javascript
// settings
auto_scene_break_backwards_enabled: true // default: enabled

// In handler
if (!settings.auto_scene_break_backwards_enabled) {
  // Queue forward continuation immediately (old behavior)
} else {
  // Queue backwards chain (new behavior)
}
```

**Use cases:**
- Performance testing (compare with/without)
- Debugging (isolate issues)
- User preference (some may prefer forward-only)

---

## Implementation Checklist

### Phase 1: Core Implementation

- [ ] Add `DETECT_SCENE_BREAK_BACKWARDS` to `operationTypes.js`
- [ ] Add `findPreviousSceneBreak` helper to `operationHandlers.js`
- [ ] Implement `handleDetectSceneBreakBackwards` in `operationHandlers.js`
- [ ] Implement `terminateBackwardsChain` in `operationHandlers.js`
- [ ] Register handler in `operationHandlers.js`

---

### Phase 2: Detection Logic

- [ ] Modify `detectSceneBreak` signature in `autoSceneBreakDetection.js`
- [ ] Update offset handling for backwards mode
- [ ] Implement `calculateLatestAllowedBreak` helper
- [ ] Add two-sided minimum scene length validation
- [ ] Add backwards response validation
- [ ] Update all existing `detectSceneBreak` calls to pass new parameters

---

### Phase 3: Manual Testing

**NOTE:** No automated tests exist. All testing is MANUAL.

- [ ] Manual test: Single backwards recursion (create 50-message chat, trigger manual detection via UI, verify multiple breaks found)
- [ ] Manual test: Multiple backwards recursions (verify chain continues until no breaks)
- [ ] Manual test: No breaks found backwards (verify graceful termination)
- [ ] Manual test: Queue persistence (trigger backwards, reload page, verify queue resumes)
- [ ] Manual test: Full forward+backwards detection on long chat (100+ messages)
- [ ] Manual test: Verify all discovered breaks have recaps in chronological order
- [ ] Manual test: Forward continuation after backwards chain completes
- [ ] Manual test: Check operation queue UI shows backwards operations correctly

---

### Phase 4: Documentation & Polish

- [ ] Add JSDoc comments to new functions
- [ ] Update README with backwards detection explanation
- [ ] Add toast notifications
- [ ] Add debug logging

---

### Phase 5: Deployment

- [ ] Test on multiple chat lengths (50, 100, 500 messages)
- [ ] Test with different minimumSceneLength settings
- [ ] Monitor for edge cases in production
- [ ] Gather user feedback

---

## Questions for Implementer

### Before Starting

1. Should backwards detection have a max recursion depth limit? (e.g., max 10 backwards operations per forward break)
2. Should we add a feature flag setting to enable/disable backwards?
3. Should we warn users before clearing queue during backwards chain?

---

### During Implementation

1. Are there any performance concerns with un-marking checked state?
2. Should we deduplicate recap operations if user manually triggers one?
3. Should we add progress indicator in queue UI?

---

### After Implementation

1. What is the average number of backwards recursions per forward break?
2. Are there any edge cases not covered in testing?
3. Should we adjust backwards operation priority based on performance?

---

## Success Criteria

### Functional

- Backwards detection finds all earlier breaks between chat start and first forward break
- Scene recaps generated in chronological order
- Forward continuation proceeds after backwards chain completes
- Queue persistence works during backwards chain

---

### Performance

- No noticeable delay in detection (backwards runs in background)
- Token usage remains acceptable
- No infinite loops or recursion errors

---

### Reliability

- Backwards errors do not block forward detection
- Page reload during backwards chain does not lose progress
- User can clear queue mid-backwards without errors

---

### User Experience

- Clear toast notifications indicate backwards detection progress
- Queue UI shows backwards operations clearly
- No confusing error messages

---

## Final Notes

**This specification is comprehensive and production-ready.** All critical issues identified during validation have been addressed in the design.

**Key strengths:**
- Queue-based state management (survives reload/crash)
- Proper use of get_data/set_data for all message state
- Idempotent operations (safe to retry)
- Validation prevents infinite loops
- Serial recap dependencies prevent rate limit issues
- O(n) algorithm for range calculations
- Graceful error handling

**Implementation should follow specification exactly.** If discrepancies are found between spec and actual code structure, consult this specification first and update code to match documented behavior.

**Testing is critical.** All integration tests must pass before considering feature complete. E2E tests validate real-world behavior.

**Line numbers are approximate** and may shift during development. Use function names and context to locate exact insertion points.

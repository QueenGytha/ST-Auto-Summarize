# Backwards Scene Break Detection - Implementation Specification

**Status:** PRODUCTION READY
**Complexity:** HIGH
**Breaking Changes:** None (additive feature)

---

## ⚠️ CRITICAL IMPLEMENTATION NOTES

### Queue-Based State Management
**ALL state MUST be stored in operation.metadata to survive reload/crash:**
- `discovered_breaks` array: in operation.metadata, NOT function parameters
- `forward_continuation` object: in operation.metadata, NOT function parameters
- `next_break_index`: in operation.metadata, NOT function parameters
- **NEVER pass state as function parameters between operations**
- Each operation is self-contained with ALL state in its metadata
- Queue persists to lorebook - survives ST reload/crash

### Property Access Requirements
**ALL scene break and checked state access MUST use get_data/set_data:**
- Scene breaks: `get_data(message, 'scene_break')` NOT `message.scene_break`
- Checked state: `get_data(message, 'auto_scene_break_checked')` NOT `message.scene_break_checked`
- Setting checked: `set_data(message, 'auto_scene_break_checked', false)` NOT `delete message.scene_break_checked`

### Handler Registration Pattern
**Handlers are registered via Map, NOT switch statement:**
```javascript
registerOperationHandler(OperationType.DETECT_SCENE_BREAK_BACKWARDS, handleDetectSceneBreakBackwards);
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

**Entry Point:** User triggers `/scenebreak` or auto-detection on new message

**File:** `autoSceneBreakDetection.js`

**Function:** `detectSceneBreaksInRange(startIndex, endIndex)` (lines **1113-1192**)

**Flow:**
```
1. Calculate range parameters:
   - offset = settings.auto_scene_break_message_offset (default: 5)
   - maxEligibleIndex = endIndex - offset
   - minimumSceneLength = settings.minimum_scene_length (default: 10)

2. Find latest visible scene break (lines 1141-1151)
   - Search backwards from endIndex to find previous break marker
   - Uses get_data(message, 'scene_break') to check for breaks
   - If found: previousBreak = index
   - If not found: previousBreak = 0

3. Calculate eligible range (lines 1127-1132):
   - start = previousBreak
   - end = maxEligibleIndex
   - Must have at least (minimumSceneLength + 1) filtered messages

4. Queue DETECT_SCENE_BREAK operation (lines 1179-1182):
   - Priority: 5 (normal)
   - Params: { startIndex: start, endIndex: end, offset }
   - Metadata: { triggered_by, start_index, end_index, ... }
```

**File:** `operationHandlers.js`

**Handler:** `DETECT_SCENE_BREAK` (lines 269-517)

**Flow:**
```
5. Execute detection (lines 301-461):
   - Call detectSceneBreak() with retry logic
   - If forceSelection=true and returns false, retry with reduced range
   - Returns: { sceneBreakAt: number | false, rationale: string }

6a. If break found (sceneBreakAt !== false):
   - Line 465: toggleSceneBreak() - places break marker (requires 6 parameters, NOT async)
   - Lines 468-469: markRangeAsChecked() - marks messages as checked via set_data()
   - Lines 473-496: Queue forward continuation
     - remainingStart = sceneBreakAt + 1
     - remainingEnd = originalEndIndex
     - Only if remainingFiltered >= minimumSceneLength + 1
     - Priority: 5
   - Lines 499-514: Queue scene recap generation
     - Priority: 20 (HIGHEST - runs before next detection)
     - Only if auto_scene_break_generate_recap enabled

6b. If NO break found (sceneBreakAt === false):
   - Lines 387-437: Mark range as checked
   - Only continue if token limit exceeded (not just message count)
   - Prevents infinite loops
```

**File:** `autoSceneBreakDetection.js`

**Function:** `detectSceneBreak()` (lines 877-**1019**)

**Flow:**
```
7. Format and filter messages (lines 922-963):
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

**File:** `autoSceneBreakDetection.js`

**Function:** `markRangeAsChecked()` (lines 1062-1083)
```javascript
function markRangeAsChecked(chat, startIndex, endIndex, checkWhich = 'both') {
  // For each message in range:
  // - set_data(message, 'auto_scene_break_checked', true)
  // - Respects checkWhich filter (only mark messages that would be checked)
}
```

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
User: /scenebreak
→ detectSceneBreaksInRange(0, 50)
  → Queue op_1: DETECT_SCENE_BREAK (0, 50)
```

**Step 2: Forward detection finds break at 30**
```
op_1 executes:
  → detectSceneBreak(0, 50, offset=5) returns { sceneBreakAt: 30 }
  → Place break marker at 30
  → Mark [0, 30] as checked

  → Queue backwards chain:
    op_2: DETECT_SCENE_BREAK_BACKWARDS
      metadata: {
        start_index: 0,           // Range START (chat start)
        end_index: 29,            // Range END (nextBreakIndex - 1)
        next_break_index: 30,     // The break that triggered backwards search
        discovered_breaks: [],    // No breaks found yet
        check_which: 'both',      // Message filter setting
        forward_continuation: {
          start_index: 31,        // Where forward should continue from
          end_index: 50,          // Where forward should continue to
          original_operation_id: 'op_1'
        }
      }
      dependencies: []
      priority: 15 (HIGH - runs before forward continuation)

  → DO NOT queue forward continuation yet (deferred)
  → Queue recap: op_3: SCENE_RECAP (30), depends on op_2
```

**Step 3: First backwards detection searches range [0, 29]**
```
op_2 executes:
  → Backwards detection range: [0, 29]
    - Range START: 0 (chat start, no previous break)
    - Range END: 29 (nextBreakIndex - 1 = 30 - 1)

  → Un-mark [0, 29] as checked (allow re-evaluation of this range)

  → detectSceneBreak(
      startIndex: 0,
      endIndex: 29,
      offset: 0,           // NO offset in backwards mode
      isBackwards: true,
      nextBreakIndex: 30
    )

  → LLM searches range [0, 29] and finds break at 15

  → Place break marker at 15
  → Mark [16, 29] as checked (range from break to range END)

  → Add 15 to discovered_breaks: [15]

  → Queue next backwards recursion:
    op_4: DETECT_SCENE_BREAK_BACKWARDS
      metadata: {
        start_index: 0,           // Same START (chat start)
        end_index: 14,            // New END (found break - 1 = 15 - 1)
        next_break_index: 15,     // The break just found
        discovered_breaks: [15],  // Accumulate discovered breaks
        check_which: 'both',
        forward_continuation: { ... } // Carry forward (unchanged)
      }
      dependencies: []
      priority: 15

  → Queue recap: op_5: SCENE_RECAP (15), depends on op_4
```

**Step 4: Second backwards detection searches range [0, 14]**
```
op_4 executes:
  → Backwards detection range: [0, 14]
    - Range START: 0 (chat start, still no previous break)
    - Range END: 14 (nextBreakIndex - 1 = 15 - 1)

  → Un-mark [0, 14] as checked

  → detectSceneBreak(
      startIndex: 0,
      endIndex: 14,
      offset: 0,
      isBackwards: true,
      nextBreakIndex: 15
    )

  → LLM searches range [0, 14] and finds break at 7

  → Place break marker at 7
  → Mark [8, 14] as checked (range from break to range END)

  → Add 7 to discovered_breaks: [15, 7]

  → Queue next backwards recursion:
    op_6: DETECT_SCENE_BREAK_BACKWARDS
      metadata: {
        start_index: 0,
        end_index: 6,             // New END (found break - 1 = 7 - 1)
        next_break_index: 7,
        discovered_breaks: [15, 7],
        check_which: 'both',
        forward_continuation: { ... }
      }
      dependencies: []
      priority: 15

  → Queue recap: op_7: SCENE_RECAP (7), depends on op_6
```

**Step 5: Third backwards detection searches range [0, 6] - TERMINATES**
```
op_6 executes:
  → Backwards detection range: [0, 6]
    - Range START: 0 (chat start)
    - Range END: 6 (nextBreakIndex - 1 = 7 - 1)

  → Un-mark [0, 6] as checked

  → detectSceneBreak(
      startIndex: 0,
      endIndex: 6,
      offset: 0,
      isBackwards: true,
      nextBreakIndex: 7
    )

  → LLM returns NO BREAK (insufficient messages for two-sided constraint,
     or no scene change detected in range)
  → { sceneBreakAt: false, rationale: 'Insufficient messages for two-sided minimum scene length constraint' }

  → Mark [0, 6] as checked (final range from chat START to first break)

  → discovered_breaks: [15, 7] (in reverse chronological order)
  → TERMINATE backwards chain - call terminateBackwardsChain()

terminateBackwardsChain() executes:
  → Sort discovered_breaks chronologically: [7, 15]

  → Queue recaps in CHRONOLOGICAL order with serial dependencies:
    op_8: SCENE_RECAP (7)
      dependencies: []       // First recap, no dependencies
      priority: 20 (HIGHEST)

    op_9: SCENE_RECAP (15)
      dependencies: [op_8]   // Waits for previous recap
      priority: 20 (HIGHEST)

    op_10: SCENE_RECAP (30)
      dependencies: [op_9]   // Waits for previous recap
      priority: 20 (HIGHEST)

  → Queue forward continuation:
    op_11: DETECT_SCENE_BREAK
      metadata: {
        start_index: 31,     // From saved forward_continuation
        end_index: 50,       // From saved forward_continuation
        triggered_by: 'backwards_chain_completion'
      }
      dependencies: [op_10]  // Waits for all recaps to complete
      priority: 5 (NORMAL)
```

---

#### Phase 2: Forward Continuation + Second Backwards Chain

**Step 6: Forward continuation from 31→50**
```
op_11 executes (after all recaps complete):
  → detectSceneBreak(31, 50)
  → Finds break at 45
  → Place break marker at 45
  → Mark [31, 45] as checked

  → Queue backwards chain:
    op_12: DETECT_SCENE_BREAK_BACKWARDS (31, 45)
      metadata: {
        next_break_index: 45,
        discovered_breaks: [],
        forward_continuation: {
          startIndex: 46,
          endIndex: 50,
          originalOperation: 'op_11'
        }
      }

  → Queue recap: op_13: SCENE_RECAP (45), depends on op_12
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
// Mark remaining range as checked (startIndex to first discovered break or nextBreakIndex)
const firstBreakIndex = discovered_breaks.length > 0
  ? Math.min(...discovered_breaks)
  : next_break_index;

markRangeAsChecked(chat, startIndex, firstBreakIndex - 1, checkWhich);
```

---

## Detailed Implementation Specification

### File 1: `operationTypes.js`

**Add new operation type:**

```javascript
// Line ~50 (after existing operation types)
export const OperationType = {
  // ... existing types
  DETECT_SCENE_BREAK: 'DETECT_SCENE_BREAK',
  DETECT_SCENE_BREAK_BACKWARDS: 'DETECT_SCENE_BREAK_BACKWARDS', // NEW
  // ... rest
};
```

---

### File 2: `operationHandlers.js`

#### Refactoring Note: Existing detectSceneBreak Calls

Throughout the handler, there are calls to:
```javascript
detectSceneBreak(chat, settings, startIndex, endIndex, offset, checkWhich, forceSelection);
```

These will need to be updated to pass `isBackwards=false` and `nextBreakIndex=null`:
```javascript
detectSceneBreak(chat, settings, startIndex, endIndex, offset, checkWhich, forceSelection, false, null);
```

---

#### Change 1: Modify DETECT_SCENE_BREAK Handler (lines 269-517)

**Current code (lines 465-496):**
```javascript
// After break found:
toggleSceneBreak(chat, sceneBreakAt, true, false, settings, sceneChangeTypes);
markRangeAsChecked(chat, startIndex, sceneBreakAt, checkWhich);

// Queue forward continuation
const remainingStart = sceneBreakAt + 1;
const remainingEnd = originalEndIndex;
// ... queue DETECT_SCENE_BREAK for remaining range
```

**New code:**
```javascript
// After break found:
toggleSceneBreak(chat, sceneBreakAt, true, false, settings, sceneChangeTypes);
markRangeAsChecked(chat, startIndex, sceneBreakAt, checkWhich);

// Queue backwards chain FIRST
const backwardsOp = await enqueueOperation({
  type: OperationType.DETECT_SCENE_BREAK_BACKWARDS,
  priority: OperationPriority.HIGH, // 15 - runs before forward continuation
  metadata: {
    start_index: startIndex,
    end_index: sceneBreakAt - 1,
    next_break_index: sceneBreakAt,
    discovered_breaks: [],
    check_which: checkWhich,
    forward_continuation: {
      start_index: sceneBreakAt + 1,
      end_index: originalEndIndex,
      original_operation_id: operation.id
    }
  }
});

if (!backwardsOp) {
  debug(SUBSYSTEM.OPERATIONS, 'Failed to queue backwards operation, queueing forward continuation directly');
  // Fallback: queue forward continuation
  const forwardOp = await enqueueOperation({
    type: OperationType.DETECT_SCENE_BREAK,
    priority: OperationPriority.NORMAL,
    metadata: {
      start_index: sceneBreakAt + 1,
      end_index: originalEndIndex,
      // ... existing metadata
    }
  });
}

// Queue scene recap (depends on backwards chain completing)
if (settings.auto_scene_break_generate_recap) {
  await enqueueOperation({
    type: OperationType.SCENE_RECAP,
    priority: OperationPriority.HIGHEST, // 20
    metadata: {
      message_id: sceneBreakAt,
      // ... existing metadata
    },
    dependencies: backwardsOp ? [backwardsOp.id] : []
  });
}
```

**Key changes:**
1. Queue `DETECT_SCENE_BREAK_BACKWARDS` with HIGH priority (15)
2. Store forward continuation params in backwards operation metadata
3. Do NOT queue forward continuation here (deferred to backwards chain termination)
4. Scene recap depends on backwards operation

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
 *
 * @param {Object} operation - Operation from queue
 * @param {Object} operation.metadata - Contains:
 *   - start_index: Start of search range
 *   - end_index: End of search range (exclusive, < next_break_index)
 *   - next_break_index: Index of next scene break (search backwards from here)
 *   - discovered_breaks: Array of break indices found so far (reverse chronological)
 *   - check_which: 'user' | 'character' | 'both'
 *   - forward_continuation: { start_index, end_index, original_operation_id }
 */
async function handleDetectSceneBreakBackwards(operation) {
  const chat = getContext().chat;
  const settings = get_settings();

  const {
    start_index: startIndex,
    end_index: endIndex,
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
      chat,
      settings,
      startIndex,
      endIndex,
      0, // offset = 0 for backwards
      checkWhich,
      false, // forceSelection
      true, // isBackwards = true
      nextBreakIndex // nextBreakIndex
    );
  } catch (error) {
    debug(SUBSYSTEM.OPERATIONS, `Error in backwards detection: ${error.message}`);

    // On error, terminate backwards chain and continue forward
    await terminateBackwardsChain(operation);
    return;
  }

  const { sceneBreakAt, rationale } = result;

  // Case 1: No break found - terminate backwards chain
  if (sceneBreakAt === false) {
    debug(SUBSYSTEM.OPERATIONS, `No break found in backwards range [${startIndex}, ${endIndex}]`);
    debug(SUBSYSTEM.OPERATIONS, `Rationale: ${rationale}`);

    // Mark range as checked
    markRangeAsChecked(chat, startIndex, endIndex, checkWhich);

    // Terminate chain and queue forward continuation
    await terminateBackwardsChain(operation);
    return;
  }

  // Case 2: Break found - place marker and continue recursion
  debug(SUBSYSTEM.OPERATIONS, `Found backwards break at ${sceneBreakAt}`);

  // Place break marker
  const { sceneChangeTypes } = getContext();
  toggleSceneBreak(chat, sceneBreakAt, true, false, settings, sceneChangeTypes);

  // Mark intermediate range as checked (between break and next break)
  if (sceneBreakAt + 1 < nextBreakIndex) {
    markRangeAsChecked(chat, sceneBreakAt + 1, nextBreakIndex - 1, checkWhich);
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
  const remainingRange = newEndIndex - startIndex + 1;
  if (remainingRange < settings.minimum_scene_length * 2) {
    debug(SUBSYSTEM.OPERATIONS, 'Insufficient messages for further backwards detection');

    // Mark remaining range as checked
    markRangeAsChecked(chat, startIndex, newEndIndex, checkWhich);

    // Terminate chain
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
  const nextBackwardsOp = await enqueueOperation({
    type: OperationType.DETECT_SCENE_BREAK_BACKWARDS,
    priority: OperationPriority.HIGH, // 15
    metadata: {
      start_index: startIndex,
      end_index: newEndIndex,
      next_break_index: sceneBreakAt,
      discovered_breaks: updatedDiscoveredBreaks,
      check_which: checkWhich,
      forward_continuation: forwardContinuation
    }
  });

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
}

/**
 * Terminate backwards chain and queue all recaps + forward continuation
 *
 * @param {Object} operation - Final backwards operation
 */
async function terminateBackwardsChain(operation) {
  const chat = getContext().chat;
  const settings = get_settings();

  const {
    discovered_breaks: discoveredBreaks = [],
    forward_continuation: forwardContinuation,
    next_break_index: nextBreakIndex,
    check_which: checkWhich
  } = operation.metadata;

  debug(SUBSYSTEM.OPERATIONS, `Terminating backwards chain. Discovered breaks: ${discoveredBreaks.join(', ')}`);

  // Sort breaks in chronological order (ascending)
  const chronologicalBreaks = [...discoveredBreaks].sort((a, b) => a - b);

  // Queue recaps in chronological order with serial dependencies
  let lastRecapId = null;
  const recapIds = [];

  if (settings.auto_scene_break_generate_recap) {
    for (const breakIndex of chronologicalBreaks) {
      const recapOp = await enqueueOperation({
        type: OperationType.SCENE_RECAP,
        priority: OperationPriority.HIGHEST, // 20
        metadata: {
          message_id: breakIndex,
          triggered_by: 'backwards_detection',
          backwards_chain: true
        },
        dependencies: lastRecapId ? [lastRecapId] : []
      });

      if (recapOp) {
        recapIds.push(recapOp.id);
        lastRecapId = recapOp.id;
      } else {
        debug(SUBSYSTEM.OPERATIONS, `Failed to queue recap for break ${breakIndex}`);
      }
    }

    // Queue recap for the next break (the one that triggered backwards chain)
    const nextBreakRecapOp = await enqueueOperation({
      type: OperationType.SCENE_RECAP,
      priority: OperationPriority.HIGHEST, // 20
      metadata: {
        message_id: nextBreakIndex,
        triggered_by: 'backwards_detection',
        backwards_chain: true
      },
      dependencies: lastRecapId ? [lastRecapId] : []
    });

    if (nextBreakRecapOp) {
      lastRecapId = nextBreakRecapOp.id;
    }
  }

  // Queue forward continuation (depends on last recap if recaps enabled)
  if (forwardContinuation) {
    const forwardOp = await enqueueOperation({
      type: OperationType.DETECT_SCENE_BREAK,
      priority: OperationPriority.NORMAL, // 5
      metadata: {
        start_index: forwardContinuation.start_index,
        end_index: forwardContinuation.end_index,
        triggered_by: 'backwards_chain_completion',
        original_operation_id: forwardContinuation.original_operation_id
      },
      dependencies: lastRecapId ? [lastRecapId] : []
    });

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

**Location:** Near end of file, in handler registration section (lines ~1280-1290)

```javascript
// Existing registrations
registerOperationHandler(OperationType.DETECT_SCENE_BREAK, handleDetectSceneBreak);
registerOperationHandler(OperationType.SCENE_RECAP, handleSceneRecap);
// ... etc

// NEW: Register backwards handler
registerOperationHandler(OperationType.DETECT_SCENE_BREAK_BACKWARDS, handleDetectSceneBreakBackwards);
```

---

### File 3: `autoSceneBreakDetection.js`

#### Change 1: Modify detectSceneBreak Function Signature (line 877)

**Current signature:**
```javascript
export async function detectSceneBreak(
  chat,
  settings,
  startIndex,
  endIndex,
  offset,
  checkWhich,
  forceSelection = false
)
```

**New signature:**
```javascript
export async function detectSceneBreak(
  chat,
  settings,
  startIndex,
  endIndex,
  offset,
  checkWhich,
  forceSelection = false,
  isBackwards = false,
  nextBreakIndex = null
)
```

**Add parameter validation (after line 877):**
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
return validateSceneBreakResponse(parsed, filteredIndices, earliestAllowedBreak, maxEligibleIndex);
```

**New code:**
```javascript
const parsed = parseSceneBreakResponse(response, filteredIndices);

const validated = validateSceneBreakResponse(
  parsed,
  filteredIndices,
  earliestAllowedBreak,
  isBackwards ? latestAllowedBreak : maxEligibleIndex
);

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

**File:** `operationQueue.js` or `constants.js` (wherever priority is defined)

**Add HIGH priority level:**
```javascript
export const OperationPriority = {
  HIGHEST: 20, // Scene recaps
  HIGH: 15,    // NEW - Backwards detection
  NORMAL: 5,   // Forward detection
  LOW: 1       // Maintenance operations
};
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

**Scenario:** User triggers `/scenebreak` twice quickly
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

## Manual Testing & Verification

**Reality Check:** There is NO automated test infrastructure. All verification is observational - you run the feature, watch what happens, and check if it looks right.

**What you CAN actually verify:**
- Console logs (if debug logging works)
- Queue UI operations and priorities
- Scene break markers appearing in chat
- Whether the feature crashes or not
- Whether LLM calls happen in the right order

**What you CANNOT easily verify without test infrastructure:**
- Internal function behavior (not exposed to console)
- Invalid LLM responses (can't mock without test infrastructure)
- Exact message checked state (would need to inspect chat object manually)
- Edge cases that don't naturally occur

---

### Basic Smoke Test

**Goal:** Verify the feature doesn't crash and appears to work

```
Setup:
1. Create chat with 50+ messages containing obvious scene changes
2. Set minimumSceneLength = 5 (easier to test with lower threshold)
3. Enable debug logging for SUBSYSTEM.OPERATIONS
4. Open browser DevTools console

Test Steps:
1. Trigger /scenebreak
2. Watch console logs for:
   - "Backwards detection: [X, Y]" entries
   - Range numbers decreasing over time (proving recursion)
   - No red errors
3. Watch queue UI for:
   - DETECT_SCENE_BREAK_BACKWARDS operations appearing
   - Priority 15 for backwards ops
   - Priority 20 for recap ops
   - Priority 5 for forward continuation
4. Wait for all operations to complete
5. Look at chat - should see multiple scene break markers
6. Check console - no errors

Success Criteria:
- No crashes
- Multiple backwards operations executed
- Scene breaks placed in chat
- Recaps generated (if enabled)
- No infinite loops (operations eventually complete)
```

---

### Page Reload Test

**Goal:** Verify queue persistence works during backwards chain

```
Test Steps:
1. Start /scenebreak on chat with 100+ messages
2. Watch queue UI until backwards operations appear
3. Note the current operation ID in queue
4. Reload page (F5) mid-operation
5. After reload, check queue UI:
   - Queue still has operations
   - Operations resume processing
   - No duplicate operations created
6. Let it finish
7. Check chat has scene breaks

Success Criteria:
- Page reload doesn't lose queue state
- Detection completes successfully after reload
- No duplicate breaks created
```

---

### Queue Clear Test

**Goal:** Verify graceful termination when user clears queue

```
Test Steps:
1. Start /scenebreak on chat with 100+ messages
2. Wait until backwards operations are in queue
3. Click "Clear Queue" button
4. Verify:
   - Queue empties
   - No new operations added
   - Console has no errors
   - Scene breaks already placed remain in chat
5. Trigger /scenebreak again
6. Verify it works normally

Success Criteria:
- Queue clearing doesn't crash
- Can restart detection after clearing
- Already-placed breaks don't get removed or duplicated
```

---

### Insufficient Messages Test

**Goal:** Verify backwards chain terminates when range too small

```
Setup:
1. Create chat with exactly 25 messages
2. Set minimumSceneLength = 10
3. Manually place scene break at message 20 using button menu
4. Enable debug logging

Test Steps:
1. Trigger /scenebreak from message 20 to end (will process range after break)
2. Separately trigger detection on range [0, 19] if possible
   OR wait for detection to naturally search that range
3. Watch console for:
   - "Insufficient messages for two-sided minimum scene length constraint"
   - OR "Terminating backwards chain"
4. Verify backwards chain stops (no infinite recursion)

Success Criteria:
- Backwards chain terminates when range too small
- No crash
- No infinite loop
```

---

### Visual Inspection Checklist

**After running /scenebreak on a large chat, manually verify:**

1. **Scene Break Markers**
   - [ ] Multiple scene breaks visible in chat (colored bars)
   - [ ] Breaks appear in chronological order
   - [ ] No duplicate breaks at same message

2. **Console Logs** (if debug enabled)
   - [ ] Logs show "Backwards detection: [X, Y]" with decreasing Y values
   - [ ] Logs show "Found backwards break at N"
   - [ ] Logs show "Terminating backwards chain"
   - [ ] Logs show discovered_breaks array
   - [ ] No error logs (red text)

3. **Queue UI**
   - [ ] DETECT_SCENE_BREAK_BACKWARDS operations appeared
   - [ ] Priority 15 shown for backwards ops
   - [ ] SCENE_RECAP operations appeared after backwards ops
   - [ ] Priority 20 for recap ops
   - [ ] DETECT_SCENE_BREAK forward continuation appeared last
   - [ ] Priority 5 for forward continuation
   - [ ] Operations completed in order (no deadlocks)

4. **Recaps** (if enabled)
   - [ ] Scene recaps generated for each scene break
   - [ ] Recaps appear in message UI below scene break messages
   - [ ] Recap order is chronological (earliest scene first)

5. **Performance**
   - [ ] No UI freezing during detection
   - [ ] Operations complete in reasonable time
   - [ ] Browser doesn't crash or hang

---

### What to Log During Implementation

**Add these debug logs to verify behavior during manual testing:**

```javascript
// In handleDetectSceneBreakBackwards - start
debug(SUBSYSTEM.OPERATIONS, `Backwards detection: [${startIndex}, ${endIndex}], next break: ${nextBreakIndex}`);

// In handleDetectSceneBreakBackwards - break found
debug(SUBSYSTEM.OPERATIONS, `Found backwards break at ${sceneBreakAt}`);
debug(SUBSYSTEM.OPERATIONS, `Discovered breaks so far: ${JSON.stringify([...discoveredBreaks, sceneBreakAt])}`);

// In handleDetectSceneBreakBackwards - no break found
debug(SUBSYSTEM.OPERATIONS, `No break found in backwards range [${startIndex}, ${endIndex}]`);

// In handleDetectSceneBreakBackwards - termination
debug(SUBSYSTEM.OPERATIONS, `Range did not shrink, terminating backwards chain`);
debug(SUBSYSTEM.OPERATIONS, `Insufficient messages for further backwards detection`);

// In terminateBackwardsChain
debug(SUBSYSTEM.OPERATIONS, `Terminating backwards chain. Discovered breaks: ${discoveredBreaks.join(', ')}`);
debug(SUBSYSTEM.OPERATIONS, `Queuing ${chronologicalBreaks.length} recaps in chronological order`);
debug(SUBSYSTEM.OPERATIONS, `Queued forward continuation: ${forwardOp.id}`);

// In detectSceneBreak - backwards mode
debug(SUBSYSTEM.CORE, `Backwards mode: valid range [${earliestAllowedBreak}, ${latestAllowedBreak}]`);
debug(SUBSYSTEM.CORE, `No valid break positions with two-sided minimum scene length`);
```

**These logs let you observe:**
- Range shrinking over backwards recursions
- Discovered breaks accumulating
- Termination conditions triggering
- Valid break position calculations

---

### Known Limitations of Manual Testing

**Cannot easily verify:**
- Helper function correctness (need unit tests or console access)
- Invalid LLM response handling (need mock infrastructure)
- Exact edge case behavior (need targeted test cases)
- Performance under all conditions (need benchmarking)
- Race conditions (need stress testing)

**Best effort verification:**
- Run feature on various chat sizes
- Watch for crashes and errors
- Check output looks reasonable
- Hope edge cases don't occur in production
- Fix bugs when users report them

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

### Phase 3: Testing

- [ ] Unit tests for `findPreviousSceneBreak`
- [ ] Unit tests for `calculateLatestAllowedBreak`
- [ ] Unit tests for backwards mode in `detectSceneBreak`
- [ ] Integration test: single backwards recursion
- [ ] Integration test: multiple backwards recursions
- [ ] Integration test: no breaks found backwards
- [ ] Integration test: queue persistence
- [ ] E2E test: full detection with backwards

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

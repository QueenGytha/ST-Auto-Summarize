# Checkpoint Integration - Implementation Plan

**Date:** 2025-01-12
**Status:** ⚠️ DESIGN PHASE - No implementation exists
**Version:** V1 (Original plan with filtered entries)
**Estimated Time:** Full implementation from scratch: 12-18 hours

---

## ⚠️ NEW: V2 Requirements Available

**This document describes the V1 implementation plan** (filter internal entries).

**NEW V2 Requirements** (2025-01-12) simplify the implementation:
- **Copy ALL lorebook entries** (no filtering logic needed)
- **Rely on automatic chat_metadata restoration** (simpler restore)
- **Validation focus** (detect corruption vs manual restoration)

**See `CHECKPOINT_REQUIREMENTS_V2.md` for the NEW approach.**

V2 is estimated at **7-9 hours** (vs 12-18 for V1) due to:
- No filtering logic to implement/test
- No manual restoration logic needed
- Simpler validation-only approach

---

## ⚠️ DOCUMENT STATUS

**This document describes issues found in a DELETED implementation.**

The original implementation has been removed due to critical bugs. This document now serves as:
1. Documentation of lessons learned
2. Implementation plan for V1 (superseded by V2)
3. List of issues to avoid

**Issues in DELETED Implementation:**
1. ~~**createNewBookmark() parameters BACKWARDS**~~ - **DOCUMENTATION ERROR** - Parameters were actually correct
2. **Race Condition in Finally Blocks** - Could corrupt unrelated chats
3. **Missing Requirements Validation** - Invalid checkpoints could be created

**⚠️ IMPORTANT: `isInternalEntry()` is NOT for Checkpoints**

The `isInternalEntry()` function (lorebookManager.js:362-365) is used EXCLUSIVELY for duplicating entries from global/character lorebooks into chat lorebooks during chat creation. It is NOT used for checkpoint cloning.

**Bugs exist in this function** but they affect the lorebook duplication feature, NOT checkpoints (which don't exist). Checkpoint cloning will require a SEPARATE function that copies ALL entries without filtering.

---

## Overview

This document describes the complete implementation plan for checkpoint integration, incorporating lessons learned from the deleted prototype:

---

## CRITICAL BUG #1: Race Condition in Finally Blocks

### Severity
🔴 **CRITICAL** - Silent data corruption possible

### The Problem

**Current Code (checkpointManager.js lines 161-176, 220-235):**
```javascript
} finally {
  if (originalState === undefined) {
    delete chat_metadata.auto_recap_checkpoint_state;
  } else {
    chat_metadata.auto_recap_checkpoint_state = originalState;
  }
  chat_metadata.world_info = originalLorebook;  // ❌ Which chat?

  try {
    await saveMetadata();
  } catch (metaErr) {
    error?.('failed to save metadata restoration', metaErr);
  }

  isCreatingCheckpoint = false;
}
```

**Attack Scenario:**
```
t=0:   createValidatedCheckpoint starts in chat "Main"
t=10:  startChatId = "Main"
t=50:  originalLorebook = "LB-Main"
t=100: User switches to chat "Other" (has lorebook "LB-Other")
t=150: Context validation throws error
t=160: CATCH block executes
t=170: FINALLY block executes
t=180: chat_metadata.world_info = "LB-Main"  ❌ But we're in "Other" chat!
t=190: saveMetadata() saves "Other" chat with "LB-Main" lorebook
```

**Result:** Chat "Other" is now permanently corrupted with wrong lorebook.

### The Fix

**Location:** checkpointManager.js lines 161-176 AND lines 220-235

**Change 1: createValidatedCheckpoint (lines 161-176)**

Replace:
```javascript
  } finally {
    if (originalState === undefined) {
      delete chat_metadata.auto_recap_checkpoint_state;
    } else {
      chat_metadata.auto_recap_checkpoint_state = originalState;
    }
    chat_metadata.world_info = originalLorebook;

    try {
      await saveMetadata();
    } catch (metaErr) {
      error?.('createValidatedCheckpoint: failed to save metadata restoration', metaErr);
    }

    isCreatingCheckpoint = false;
  }
```

With:
```javascript
  } finally {
    // CRITICAL: Only restore metadata if still in same chat
    // Otherwise we would corrupt unrelated chat's metadata
    if (getCurrentChatId() === startChatId) {
      if (originalState === undefined) {
        delete chat_metadata.auto_recap_checkpoint_state;
      } else {
        chat_metadata.auto_recap_checkpoint_state = originalState;
      }
      chat_metadata.world_info = originalLorebook;

      try {
        await saveMetadata();
      } catch (metaErr) {
        error?.('createValidatedCheckpoint: failed to save metadata restoration', metaErr);
      }
    } else {
      error?.('createValidatedCheckpoint: chat context changed - cannot restore metadata safely (would corrupt current chat)');
      // Do NOT restore metadata - we're in a different chat now
      // The original chat's metadata was already corrupted, but better than corrupting ANOTHER chat
    }

    isCreatingCheckpoint = false;
  }
```

**Change 2: createValidatedBranch (lines 220-235)**

Replace:
```javascript
  } finally {
    if (originalState === undefined) {
      delete chat_metadata.auto_recap_checkpoint_state;
    } else {
      chat_metadata.auto_recap_checkpoint_state = originalState;
    }
    chat_metadata.world_info = originalLorebook;

    try {
      await saveMetadata();
    } catch (metaErr) {
      error?.('createValidatedBranch: failed to save metadata restoration', metaErr);
    }

    isCreatingCheckpoint = false;
  }
```

With:
```javascript
  } finally {
    // CRITICAL: Only restore metadata if still in same chat
    if (getCurrentChatId() === startChatId) {
      if (originalState === undefined) {
        delete chat_metadata.auto_recap_checkpoint_state;
      } else {
        chat_metadata.auto_recap_checkpoint_state = originalState;
      }
      chat_metadata.world_info = originalLorebook;

      try {
        await saveMetadata();
      } catch (metaErr) {
        error?.('createValidatedBranch: failed to save metadata restoration', metaErr);
      }
    } else {
      error?.('createValidatedBranch: chat context changed - cannot restore metadata safely (would corrupt current chat)');
    }

    isCreatingCheckpoint = false;
  }
```

### Verification Steps

**Test Case 1: Normal Operation**
```javascript
// Start checkpoint creation in "Main" chat
const result = await createValidatedCheckpoint(5, "Test");
// Expected: success, metadata restored to "Main"
// Verify: getCurrentChatId() === "Main"
// Verify: chat_metadata.world_info === original lorebook
```

**Test Case 2: Chat Switch Mid-Operation**
```javascript
// Start checkpoint creation
setTimeout(() => {
  // Switch chat mid-operation
  openCharacterChat("Other");
}, 100);

const result = await createValidatedCheckpoint(5, "Test");
// Expected: error thrown, metadata NOT restored
// Verify: "Other" chat metadata unchanged
// Verify: Error logged about chat context change
```

**Test Case 3: Error Recovery**
```javascript
// Inject error during checkpoint creation
const result = await createValidatedCheckpoint(5, "Test");
// Expected: error returned, metadata restored (if still in same chat)
// Verify: chat_metadata.world_info === original
```

### Estimated Time
⏱️ **1-2 hours** (includes testing)

---

## ⚠️ IMPORTANT: Lorebook Duplication Bug (NOT Related to Checkpoints)

### Clarification
This section describes a bug in the lorebook duplication feature (global/character→chat). The `isInternalEntry()` function is NOT used for checkpoint cloning.

### The Facts
- Operation queue entry comment: `'__operation_queue'` (operationQueue.js line 36)
- lorebookManager.js filter: `'_operations_queue_'` ❌ WRONG pattern
- **This affects lorebook duplication, NOT checkpoint cloning**
- **Checkpoint cloning will use a SEPARATE function (not `isInternalEntry()`)**

**Current Code (lorebookManager.js line 362-367):**
```javascript
function isInternalEntry(comment) {
  return comment.startsWith('_registry_') ||
    comment.startsWith('_operations_queue_') ||  // ❌ WRONG PATTERN
    comment.startsWith('_combined_recap_') ||
    comment.startsWith('_running_scene_recap_');
}
```

**Impact on Lorebook Duplication:**
- Operation queue entries may not be filtered correctly during duplication from global/character lorebooks

**NOT Related to Checkpoints:**
- Checkpoint cloning will use V2 approach: copy ALL entries without any filtering
- Checkpoint cloning needs a completely SEPARATE function
- Do NOT reuse `isInternalEntry()` for checkpoint cloning

### Verification Steps

**Test Case 1: Verify Pattern Matching**
```javascript
// Create test entries
const testEntries = [
  { comment: '__operation_queue' },  // Should be filtered
  { comment: '_registry_locations' },  // Should be filtered
  { comment: '_combined_recap_v1' },  // Should be filtered
  { comment: '_running_scene_recap_v1' },  // Should be filtered
  { comment: '__index_categories' },  // Should be filtered
  { comment: 'User Entry' }  // Should be cloned
];

// Run through filter
const filtered = testEntries.filter(e => !isInternalEntry(e.comment));

// Verify: Only 'User Entry' remains
expect(filtered.length).toBe(1);
expect(filtered[0].comment).toBe('User Entry');
```

**Test Case 2: Real Lorebook Cloning**
```javascript
// Setup: Create lorebook with queue entry
await addLorebookEntry('__operation_queue', { content: 'test queue' });
await addLorebookEntry('User Entry', { content: 'user data' });

// Clone lorebook
const cloned = await cloneLorebook('source', 'target');

// Verify: Cloned lorebook has ONLY user entry
const entries = await getLorebookEntries('target');
expect(entries.length).toBe(1);
expect(entries[0].comment).toBe('User Entry');
```

**Test Case 3: Verify All Internal Patterns**
```bash
# Search codebase for all internal entry patterns
grep -r "comment.*=.*'_" . --include="*.js"
grep -r "comment.*=.*\"_" . --include="*.js"

# Verify all found patterns are in filter list
```

### Estimated Time
⏱️ **30 minutes** (simple pattern fix + testing)

---

## CRITICAL BUG #3: Missing Requirements Validation

### Severity
🔴 **CRITICAL** - Invalid checkpoints can be created

### The Problem

**Design Requirement (docs lines 109-265):**
Checkpoints should ONLY be created when:
1. ✅ Operation queue is empty
2. ✅ Message is a scene break
3. ✅ Scene has a recap
4. ✅ Running scene recap exists

**Current Implementation:** NONE of these checks exist!

**Impact:**
- Users can create checkpoints mid-operation → incomplete state
- Checkpoints created without recaps → no memory to restore
- No guarantee checkpoint represents valid point-in-time
- Combined with Bug #2: queue entries get cloned

### The Fix

**Step 1: Create Validation Module**

**New File:** `checkpointValidator.js`

```javascript
import { chat, chat_metadata } from '../../../script.js';
import { get_data } from './messageData.js';

let debug, error;
let getQueueState;

export function initCheckpointValidator(utils, operationQueue) {
  debug = utils.debug;
  error = utils.error;
  getQueueState = operationQueue.getQueueState;
}

export function validateCheckpointRequirements(mesId) {
  const errors = [];

  // Requirement 1: Queue must be empty
  const queue = getQueueState();
  if (queue && queue.length > 0) {
    errors.push('Operation queue is not empty - cannot create checkpoint during active operations');
  }

  // Requirement 2: Message must exist and be valid index
  if (mesId < 0 || mesId >= chat.length) {
    errors.push(`Invalid message index: ${mesId} (chat has ${chat.length} messages)`);
    return { valid: false, errors };
  }

  const message = chat[mesId];
  if (!message) {
    errors.push(`Message at index ${mesId} does not exist`);
    return { valid: false, errors };
  }

  // Requirement 3: Message should be a scene break (recommended but not strict)
  const isSceneBreak = get_data(message, 'is_scene_break');
  if (!isSceneBreak) {
    debug?.(`Warning: Creating checkpoint at non-scene-break message ${mesId}`);
    // Not an error, just a warning
  }

  // Requirement 4: Scene should have a recap (if scene breaks are enabled)
  const sceneRecap = get_data(message, 'scene_recap_memory');
  if (isSceneBreak && !sceneRecap) {
    errors.push(`Scene break at message ${mesId} has no scene recap`);
  }

  // Requirement 5: Running scene recap should exist (if feature enabled)
  const runningRecap = chat_metadata?.auto_recap?.running_scene_recap;
  if (!runningRecap || !runningRecap.memory) {
    errors.push('No running scene recap exists - cannot create valid checkpoint');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: isSceneBreak ? [] : ['Checkpoint created at non-scene-break message']
  };
}

export default {
  initCheckpointValidator,
  validateCheckpointRequirements
};
```

**Step 2: Integrate Validation into checkpointManager.js**

Add import at top:
```javascript
import { validateCheckpointRequirements } from './checkpointValidator.js';
```

Update `createValidatedCheckpoint` (after line 120):
```javascript
export async function createValidatedCheckpoint(mesId, checkpointName) {
  if (isCreatingCheckpoint) {
    debug?.('createValidatedCheckpoint: checkpoint creation already in progress, blocking');
    return { success: false, blocked: true, error: 'Checkpoint creation already in progress' };
  }

  if (!checkpointName) {
    return { success: false, error: 'Checkpoint name is required' };
  }

  // CRITICAL: Validate requirements before proceeding
  const validation = validateCheckpointRequirements(mesId);
  if (!validation.valid) {
    error?.('createValidatedCheckpoint: validation failed', validation.errors);
    return {
      success: false,
      error: `Cannot create checkpoint: ${validation.errors.join('; ')}`,
      validationErrors: validation.errors
    };
  }

  if (validation.warnings && validation.warnings.length > 0) {
    debug?.('createValidatedCheckpoint: warnings', validation.warnings);
  }

  isCreatingCheckpoint = true;
  // ... rest of function
```

**Step 3: Export and Initialize**

**index.js - Add export:**
```javascript
// After line 199
export * from './checkpointValidator.js';
```

**eventHandlers.js - Initialize after checkpointManager:**
```javascript
// After line 448
debug(SUBSYSTEM.EVENT, '[EVENT HANDLERS] Initializing checkpointValidator...');
const checkpointValidator = await import('./checkpointValidator.js');
checkpointValidator.initCheckpointValidator(lorebookUtils, operationQueueModule);
```

### Verification Steps

**Test Case 1: Queue Not Empty**
```javascript
// Queue an operation
await enqueueOperation({ type: 'RECAP', metadata: {} });

// Try to create checkpoint
const result = await createValidatedCheckpoint(5, "Test");

// Expected: Validation failure
expect(result.success).toBe(false);
expect(result.error).toContain('queue is not empty');
```

**Test Case 2: No Running Recap**
```javascript
// Clear running recap
delete chat_metadata.auto_recap.running_scene_recap;

// Try to create checkpoint
const result = await createValidatedCheckpoint(5, "Test");

// Expected: Validation failure
expect(result.success).toBe(false);
expect(result.error).toContain('No running scene recap');
```

**Test Case 3: Invalid Message Index**
```javascript
// Try to create checkpoint at invalid index
const result = await createValidatedCheckpoint(999, "Test");

// Expected: Validation failure
expect(result.success).toBe(false);
expect(result.error).toContain('Invalid message index');
```

**Test Case 4: All Requirements Met**
```javascript
// Setup: Valid state
// - Queue empty
// - Message exists and is scene break
// - Scene has recap
// - Running recap exists

const result = await createValidatedCheckpoint(5, "Test");

// Expected: Success
expect(result.success).toBe(true);
```

### Estimated Time
⏱️ **2-3 hours** (module creation + integration + testing)

---

## Implementation Order

### Phase 1: Quick Wins (30 minutes)
1. ✅ Fix lorebookManager.js pattern (Bug #2)
2. ✅ Add `__index_` to filter lists (Bug #2 extension)
3. ✅ Run tests to verify pattern matching

### Phase 2: Race Condition (1-2 hours)
1. ✅ Update createValidatedCheckpoint finally block (Bug #1)
2. ✅ Update createValidatedBranch finally block (Bug #1)
3. ✅ Create test cases for chat switching
4. ✅ Verify error handling

### Phase 3: Validation Module (2-3 hours)
1. ✅ Create checkpointValidator.js (Bug #3)
2. ✅ Implement validation logic
3. ✅ Integrate into checkpointManager.js
4. ✅ Export from index.js
5. ✅ Initialize in eventHandlers.js
6. ✅ Create comprehensive test suite

### Phase 4: Final Verification (1 hour)
1. ✅ Run all P0 tests
2. ✅ Run integration tests
3. ✅ Manual testing of edge cases
4. ✅ Verify all error messages clear
5. ✅ Update documentation

---

## Success Criteria

**After All Fixes:**
- ✅ P0-1 test passes (lorebook isolation)
- ✅ P0-2 test passes (branch isolation)
- ✅ P0-3 test passes (branch timing)
- ✅ P0-4 test passes (concurrent blocking)
- ✅ P0-5 test passes (chat switch detection)
- ✅ No operation queue entries in cloned lorebooks
- ✅ No chat corruption on race conditions
- ✅ No invalid checkpoints created
- ✅ All lint/syntax checks pass

---

## Risk Assessment After Fixes

**Before Fixes:**
- 🔴 Data corruption: HIGH
- 🔴 Invalid state: HIGH
- 🔴 Queue contamination: HIGH
- 🟠 User confusion: MEDIUM

**After Fixes:**
- 🟢 Data corruption: LOW (race condition fixed)
- 🟢 Invalid state: LOW (validation added)
- 🟢 Queue contamination: NONE (pattern fixed)
- 🟡 User confusion: LOW-MEDIUM (clear errors)

---

## Next Steps After Critical Fixes

**Once these 3 bugs are fixed, the implementation will be:**
- ✅ Safe to use for basic checkpoint functionality
- ✅ Isolated lorebooks (no queue contamination)
- ✅ Protected against race conditions
- ✅ Validated state before creation

**Remaining work for production (optional):**
- Complete state recording (running recap version)
- State restoration on checkpoint load
- UI blocking during creation
- Progress indicators for large lorebooks
- Queue debouncing implementation

---

## Estimated Total Time

**Critical Fixes:** 4-6 hours
- Bug #1 (Race Condition): 1-2 hours
- Bug #2 (Pattern Fix): 30 minutes
- Bug #3 (Validation): 2-3 hours
- Final Testing: 1 hour

**Full Production Ready:** 12-18 hours
- Critical fixes: 4-6 hours
- State recording/restoration: 5-6 hours
- UI/UX improvements: 2-3 hours
- Comprehensive testing: 3-4 hours

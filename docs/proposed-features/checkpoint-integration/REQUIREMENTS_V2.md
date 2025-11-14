# Checkpoint/Branch System - Requirements V2

**Last Updated:** 2025-01-12
**Status:** DESIGN SPECIFICATION (NOT IMPLEMENTED)

---

## Executive Summary

This document defines the **NEW requirements** for checkpoint/branch creation in ST-Auto-Recap, replacing the previous "filtered internal entries" approach with a **complete point-in-time snapshot** approach.

### Key Changes from V1

| Aspect | V1 (OLD) | V2 (NEW) |
|--------|----------|----------|
| **Lorebook Cloning** | Filter out internal entries | Copy ALL entries (no filtering) |
| **Internal Entries** | Excluded (registries, queue, indexes) | Included (complete state) |
| **Running Recap** | Capture version number only | Capture + validate full versions array |
| **Combined Recap** | Not specified | Capture + validate full content |
| **Queue Check** | Planned | BLOCKING - must be empty |
| **Point-in-Time** | Partial (user entries only) | Complete (everything) |

---

## Core Requirements

### R1: Copy ALL Lorebook Entries

**Requirement:** When creating a checkpoint/branch, clone the lorebook and copy **every entry** without filtering.

**Rationale:**
- Complete point-in-time snapshot requires ALL data
- Registry state at checkpoint time must be preserved
- Index state must be preserved
- Nothing should be lost between checkpoint creation and restoration

**Includes:**
- ✅ All user entries (character, location, event, etc.)
- ✅ All registry entries (`_registry_character`, `_registry_location`, etc.)
- ✅ All index entries (`__index_*`)
- ✅ Queue entry (`__operation_queue`) - will be empty due to R2
- ✅ Any other internal entries

**Implementation Impact:**
- Remove ALL filtering logic from `cloneLorebook()`
- Copy every entry regardless of comment prefix
- Larger lorebook files (acceptable trade-off for correctness)

---

### R2: Block Checkpoint Creation if Queue Not Empty

**Requirement:** Checkpoint/branch creation MUST fail with error if operation queue contains any pending or in-progress operations.

**Rationale:**
- Queue operations represent "future work" not yet reflected in message state
- Creating checkpoint mid-operation captures incomplete state
- Operations could complete between checkpoint creation and user noticing
- Clean state = reliable checkpoint

**Validation:**
```javascript
function validateQueueEmpty() {
  const queue = getCurrentQueue();
  const pending = queue?.queue?.filter(op =>
    op.status === 'pending' || op.status === 'in_progress'
  );

  if (pending.length > 0) {
    throw new Error(
      `Cannot create checkpoint: ${pending.length} operations in queue. ` +
      `Please wait for queue to finish.`
    );
  }
}
```

**User Experience:**
- Show error message with pending operation count
- Tell user to wait for queue to finish
- Show queue progress UI
- Optionally: Add "Create Checkpoint When Ready" button that auto-creates after queue finishes

---

### R3: Capture Running Scene Recap Versions

**Requirement:** Capture the complete running scene recap state including current version and all versions array.

**Storage Location:** `chat_metadata.auto_recap_running_scene_recaps`

**Structure:**
```typescript
interface RunningSceneRecapStorage {
  chat_id: string;
  current_version: number;          // Active version ← CAPTURE THIS
  versions: RunningRecapVersion[];  // All versions ← CAPTURE THIS
}

interface RunningRecapVersion {
  version: number;
  timestamp: number;
  content: string;
  scene_count: number;
  excluded_count: number;
  prev_scene_index: number;
  new_scene_index: number;
}
```

**Checkpoint Metadata:**
```javascript
{
  running_recap_version: number | null,           // Current version at checkpoint time
  running_recap_scene_count: number,              // Number of scenes in current version
  running_recap_versions: RunningRecapVersion[],  // Full versions array (for debugging)
}
```

**Key Insight:** The entire structure is **automatically saved** in `chat_metadata` when checkpoint is created. The metadata fields are for **validation only** - to detect corruption or mismatches when restoring.

**Validation on Restore:**
```javascript
async function validateRunningRecapState(checkpointState) {
  const runningRecap = chat_metadata.auto_recap_running_scene_recaps;

  if (runningRecap) {
    // Verify current version matches
    if (runningRecap.current_version !== checkpointState.running_recap_version) {
      error(`Running recap version mismatch: expected ${checkpointState.running_recap_version}, got ${runningRecap.current_version}`);
    }

    // Verify version exists in versions array
    const versionExists = runningRecap.versions.some(v => v.version === checkpointState.running_recap_version);
    if (!versionExists && checkpointState.running_recap_version !== null) {
      error(`Running recap version ${checkpointState.running_recap_version} not found in checkpoint data`);
    }
  }
}
```

**Branch Divergence:**
Both sides of a branch can progress independently:
- Main chat at message 100, running recap v10
- Create checkpoint at message 50, running recap v5
- Main continues to v15
- Checkpoint branch adds messages, progresses to v8
- Each branch maintains its own independent versions array
- No conflict because each checkpoint has its own `chat_metadata` file

---

### R4: Capture Combined Recap

**Requirement:** Capture the combined recap state at checkpoint time.

**Storage Location:** `chat_metadata.auto_recap.combined_recap`

**Structure:**
```typescript
interface CombinedRecapStorage {
  chat_id: string;
  content: string;              // Combined recap text ← CAPTURE THIS
  message_count: number;        // Number of messages ← CAPTURE THIS
  timestamp: number;            // When generated ← CAPTURE THIS
}
```

**Checkpoint Metadata:**
```javascript
{
  combined_recap_content: string,
  combined_recap_message_count: number,
  combined_recap_timestamp: number | null,
}
```

**Key Insight:** Like running recap, this is **automatically saved** in `chat_metadata`. Metadata fields are for validation only.

**Validation on Restore:**
```javascript
async function validateCombinedRecapState(checkpointState) {
  const combinedRecap = chat_metadata.auto_recap?.combined_recap;

  if (combinedRecap && checkpointState.combined_recap_message_count > 0) {
    if (combinedRecap.message_count !== checkpointState.combined_recap_message_count) {
      warn(`Combined recap message count mismatch: expected ${checkpointState.combined_recap_message_count}, got ${combinedRecap.message_count}`);
    }
  }
}
```

---

### R5: Complete Point-in-Time Correctness

**Requirement:** Nothing should ever be lost between checkpoints/branches forwards and backwards. The point-in-time state must be exactly preserved and restored.

**What Gets Automatically Captured (via chat_metadata save):**
✅ Running scene recap (entire structure with all versions)
✅ Combined recap (entire structure)
✅ All message data with per-message recaps
✅ Scene break data
✅ Extension settings (saved in chat metadata)
✅ Message indices and state

**What Gets Manually Captured (via lorebook clone):**
✅ ALL user lorebook entries
✅ ALL internal lorebook entries (registries, indexes, queue)
✅ Lorebook-level settings
✅ Entry order and display indices

**What Does NOT Need Capture (Global Settings):**
⚠️ Extension global settings - Shared across all chats (correct behavior)
⚠️ Connection profiles - Shared across all chats (correct behavior)

**Verification:**
- Checkpoint created at message 50
- Main chat progresses to message 100
- Load checkpoint → Should be EXACTLY at message 50 state
- Every recap, version, registry entry, index entry should match message 50 state
- Load main chat → Should be EXACTLY at message 100 state
- No contamination between the two

---

## Data Flow

### Checkpoint Creation Flow

```
1. User clicks "Create Checkpoint"
   ↓
2. Validate Requirements
   - Queue MUST be empty (R2) ← BLOCKING
   - Message MUST exist
   - Scene recap SHOULD exist (warn if missing)
   - Running recap SHOULD exist (warn if missing)
   ↓
3. Clone Lorebook (R1)
   - Copy ALL entries (no filtering)
   - Generate new UIDs to avoid conflicts
   - Save as new lorebook file
   ↓
4. Capture State (R3, R4, R5)
   - Record running recap version + versions array
   - Record combined recap content + metadata
   - Record lorebook name
   - Record validation results
   ↓
5. Create Checkpoint via SillyTavern
   - Call createNewBookmark(mesId, { forceName })
   - SillyTavern saves chat_metadata (includes running/combined recap automatically)
   - Checkpoint metadata includes our state snapshot
   ↓
6. Success
   - Show notification with checkpoint details
   - Display running recap version, combined recap size
```

### Checkpoint Restoration Flow

```
1. User loads checkpoint
   ↓
2. SillyTavern loads chat file
   - Replaces chat_metadata entirely (running recap, combined recap auto-restored)
   - Fires CHAT_CHANGED event
   ↓
3. Extension detects CHAT_CHANGED
   - Check if chat_metadata.main_chat exists (indicates checkpoint/branch)
   ↓
4. Validate Checkpoint State (R3, R4, R5)
   - Verify running recap version matches expected
   - Verify running recap version exists in versions array
   - Verify combined recap message count matches
   - Verify lorebook name matches
   ↓
5. Show Restoration Notification
   - Display checkpoint name
   - Display running recap version + scene count
   - Display combined recap message count
   - Display creation timestamp
   ↓
6. Success
   - Point-in-time state fully restored
   - No manual restoration needed (chat_metadata replacement handled it)
```

---

## Implementation Simplifications from V1

### Simplification 1: No Manual Restoration Logic

**V1 Approach:** Manually restore running recap version, combined recap content, etc.

**V2 Approach:** Rely on SillyTavern's `chat_metadata` replacement. When a checkpoint is loaded, `chat_metadata` is **completely replaced** from the checkpoint file. This means:
- Running scene recap structure is automatically restored
- Combined recap structure is automatically restored
- All extension state in `chat_metadata` is automatically restored

**What We Add:** Validation to detect corruption or mismatches.

### Simplification 2: No Internal Entry Filtering

**V1 Approach:** Maintain a list of internal entry prefixes and filter them during cloning.

**V2 Approach:** Copy everything. No filtering logic needed.

**Benefits:**
- Simpler code (no filter maintenance)
- Future-proof (works with any new internal entry types)
- More correct (complete point-in-time snapshot)

### Simplification 3: Queue Blocking is Simple

**V1 Approach:** Complex logic to handle queue during checkpoint creation.

**V2 Approach:** Just block if queue not empty. User must wait.

**Benefits:**
- Simpler implementation
- Clearer user contract
- Guarantees clean state

---

## Edge Cases

### Edge Case 1: Queue Entry in Cloned Lorebook

**Scenario:** Queue is empty at checkpoint creation, so `__operation_queue` entry exists but contains empty array.

**Result:** Entry gets cloned to checkpoint lorebook.

**Impact:** Harmless - empty queue entry in checkpoint lorebook has no effect. When checkpoint is loaded, extension initializes its own queue from that entry (which is empty).

**Validation:** None needed - this is correct behavior.

---

### Edge Case 2: Both Sides Progress After Branch

**Scenario:**
- Main chat at v5, create checkpoint
- Main progresses to v10 (5 new versions)
- Checkpoint branch progresses to v8 (3 new versions from v5)

**Result:** Each branch has independent versions arrays:
- Main: versions 1-10 (10 entries)
- Checkpoint: versions 1-8 (8 entries)

**Restoration:**
- Load main → v10 active, 10 versions available
- Load checkpoint → v8 active, 8 versions available
- No conflict - each has own `chat_metadata`

**Validation:** Verify current_version exists in versions array for that chat.

---

### Edge Case 3: Legacy Checkpoints (Pre-V2)

**Scenario:** Checkpoint was created before V2 implementation (no checkpoint state metadata).

**Detection:** `chat_metadata.auto_recap_checkpoint_state` is undefined or null.

**Handling:**
```javascript
if (!checkpointState) {
  debug('No checkpoint state found (legacy checkpoint or not a checkpoint)');
  return; // Skip validation
}
```

**Impact:** Legacy checkpoints continue to work, just without validation.

---

### Edge Case 4: Lorebook Name Mismatch

**Scenario:** User manually changed lorebook after checkpoint creation, or lorebook file was deleted.

**Detection:** `chat_metadata.world_info !== checkpointState.cloned_lorebook_name`

**Handling:**
```javascript
if (currentLorebook !== state.cloned_lorebook_name) {
  warn(
    `Lorebook mismatch:\n` +
    `  Expected: ${state.cloned_lorebook_name}\n` +
    `  Current: ${currentLorebook}\n` +
    `This checkpoint may not have proper isolation.`
  );
}
```

**Impact:** Warn user, but don't block. They might have manually fixed something.

---

## Testing Requirements

### Test 1: Queue Blocking
**Setup:** Add operation to queue
**Action:** Try to create checkpoint
**Expected:** Error "Cannot create checkpoint: 1 operations in queue"

### Test 2: All Entries Cloned
**Setup:** Create lorebook with user entries + internal entries (registries, indexes)
**Action:** Create checkpoint
**Expected:**
- Cloned lorebook contains ALL entries
- Entry count in clone = entry count in original
- Registry entries present in clone
- Index entries present in clone

### Test 3: Running Recap Isolation
**Setup:**
- Main chat at v5, create checkpoint
- Main progresses to v10
**Action:** Load checkpoint
**Expected:**
- Checkpoint shows v5 active
- Checkpoint has versions 1-5 only
- Main has v10 active
- Main has versions 1-10

### Test 4: Combined Recap Preservation
**Setup:** Create checkpoint with combined recap (100 messages)
**Action:** Load checkpoint
**Expected:** Combined recap message count = 100 (matches checkpoint metadata)

### Test 5: Complete State Restoration
**Setup:**
- Main at message 100, v10, 20 registry entries
- Create checkpoint at message 50, v5
**Action:** Switch between main and checkpoint
**Expected:**
- Checkpoint: message 50, v5, state at that time
- Main: message 100, v10, current state
- No contamination

---

## Implementation Notes

### Note 1: chat_metadata Replacement

From `CHECKPOINT_BRANCH_BEHAVIOR.md`, when loading a chat:
```javascript
// SillyTavern's getChat() - script.js:6641
const data = await $.ajax({...});
// ... extract chat_metadata from data ...
chat_metadata = data;  // ← COMPLETE REPLACEMENT
```

This is KEY to understanding why we don't need manual restoration. The entire `chat_metadata` object is replaced, including all our extension data.

### Note 2: UID Generation

When cloning lorebook entries, we MUST regenerate UIDs:
```javascript
const newUid = Date.now() + copiedCount;
clonedEntry.uid = newUid;
clonedEntry.displayIndex = newUid;
```

This prevents UID conflicts between original and cloned lorebooks.

### Note 3: Error vs Warn

**Use error()** for:
- Version mismatches (data corruption)
- Missing expected versions (data corruption)
- Queue not empty (blocking validation)

**Use warn()** for:
- Lorebook name mismatch (user might have fixed something)
- Combined recap count mismatch (might be regenerated)
- Missing optional state (not critical)

---

## Summary

The V2 requirements dramatically simplify the implementation while providing MORE correctness:

1. **Copy ALL entries** - No filtering logic needed
2. **Block on queue** - Simple validation
3. **Capture versions arrays** - For validation/debugging
4. **Rely on automatic restoration** - chat_metadata replacement handles it
5. **Validate on restore** - Detect corruption/mismatches

The key insight is that **most of the work is done automatically** by SillyTavern's chat loading mechanism. We just need to:
- Clone the lorebook (all entries)
- Validate requirements before creation
- Validate state after restoration
- Show clear errors when something is wrong

This is simpler, more correct, and easier to test than V1.

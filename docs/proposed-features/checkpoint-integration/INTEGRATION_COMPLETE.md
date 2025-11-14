# ST-Auto-Recap: Complete Checkpoint & Branch Integration

---

## ⚠️ **DOCUMENT STATUS: DESIGN SPECIFICATION** ⚠️

**THIS IS A DESIGN DOCUMENT, NOT IMPLEMENTED CODE**

- **Implementation Status:** NOT IMPLEMENTED
- **Code Files:** DELETED (contained critical bugs)
- **Test Files:** DELETED (assumed wrong APIs)
- **Current State:** Research and design phase only
- **Version:** V1 (Original design with filtered internal entries)

### ⚠️ NEW: V2 Requirements Available

**This document describes the V1 design** (filter internal entries during cloning).

**NEW V2 Requirements** (2025-01-12) take a different approach:
- **Copy ALL lorebook entries** (no filtering)
- **Block checkpoint creation if queue not empty**
- **Capture + validate running scene recap versions**
- **Capture + validate combined recap**
- **Complete point-in-time correctness**

**See `CHECKPOINT_REQUIREMENTS_V2.md` for the NEW specification.**

The V2 approach is **simpler and more correct** than V1. This document remains as historical reference for the original design thinking.

### What This Document Contains:
- ✅ Architecture design for checkpoint/branch integration (V1)
- ✅ Verified understanding of SillyTavern APIs
- ✅ Complete flow diagrams and data structures (V1)
- ❌ NO working implementation exists
- ❌ Requirements validation: PLANNED but not implemented
- ❌ State recording: PLANNED but not implemented
- ❌ State restoration: PLANNED but not implemented

### Known Issues:

**In Deleted Implementation:**
1. ~~**createNewBookmark() parameters BACKWARDS**~~ - **FALSE ALARM** - docs were actually correct
2. **Test helpers assumed non-existent APIs** - tests could not run

**In LIVE CODE (Must Fix Before Implementation):**
1. **Wrong pattern in lorebookManager.js:364** - Uses `'_operations_queue_'` instead of `'__operation_queue'` - **BLOCKS isolation**
2. **Missing `__index_` pattern** - Category indexes would be cloned unnecessarily
3. **Dead code patterns** - `_combined_recap_` and `_running_scene_recap_` filter non-existent entries

See `CHECKPOINT_IMPLEMENTATION_STATUS.md` for complete details.

---

## Executive Summary

This document describes the complete solution for checkpoint and branch integration in the ST-Auto-Recap extension. The solution combines **requirements validation** (ensures clean state) with **lorebook cloning** (ensures isolated future) to provide reliable, corruption-free checkpoints.

**Key Principles:**
1. **Requirements validation** → Only create checkpoints at STABLE, COMPLETE states
2. **Lorebook cloning** → Each checkpoint gets ISOLATED lorebook copy
3. **State recording** → Capture point-in-time snapshot of all extension data
4. **State restoration** → Load correct state when switching to checkpoint

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Architecture](#solution-architecture)
3. [Requirements Validation](#requirements-validation)
4. [Lorebook Cloning](#lorebook-cloning)
5. [State Recording](#state-recording)
6. [State Restoration](#state-restoration)
7. [Complete Flow Diagrams](#complete-flow-diagrams)
8. [Data Structures](#data-structures)
9. [Implementation Files](#implementation-files)
10. [Edge Cases & Error Handling](#edge-cases--error-handling)
11. [User Experience](#user-experience)
12. [Testing Strategy](#testing-strategy)

---

## Problem Statement

### Current Issues

**Problem 1: Shared Lorebook Contamination**

When a checkpoint is created in SillyTavern:
- Checkpoint metadata contains `chat_metadata.world_info = "z-AutoLB-main123"`
- Main chat also has `chat_metadata.world_info = "z-AutoLB-main123"`
- Both reference the **SAME lorebook file** on disk
- Extension stores operation queue and registry in this lorebook

**Result:** All checkpoints/branches share the same lorebook, causing:
- Queue operations in main timeline appear in checkpoints
- Registry updates in one timeline affect all others
- No isolation between diverging narratives
- Data corruption and contamination

**Problem 2: Unstable Checkpoint State**

Checkpoints can be created at any message, even with:
- Queue actively processing operations
- Incomplete scene recaps
- No running scene summary
- Mid-conversation (not at scene boundary)

**Result:** Checkpoints capture incomplete, unstable state:
- "Future" operations (not yet processed) appear in checkpoint metadata
- Running recap version may reference messages beyond checkpoint scope
- No guarantee of narrative completeness at checkpoint point

**Problem 3: Lorebook Reference Instability**

After checkpoint creation:
- Main chat detaches lorebook or switches to different one
- Checkpoint metadata still references original lorebook name
- Original lorebook may no longer exist or be attached

**Result:** Checkpoint loads with incorrect or missing lorebook

---

## Solution Architecture

### Two-Part Solution

**Part 1: Requirements Validation (CLEAN STATE)**

Before creating checkpoint, validate:
1. ✅ Operation queue is empty (no pending changes)
2. ✅ Message is a scene break (narrative boundary)
3. ✅ Scene has a recap (scene summary complete)
4. ✅ Running scene recap exists (full narrative context)

If ANY requirement fails → **BLOCK** checkpoint creation with clear error

**Part 2: Lorebook Cloning (ISOLATED FUTURE)**

When creating checkpoint:
1. Clone attached lorebook → new file for checkpoint timeline
2. Filter internal entries (remove queue/registry from clone)
3. Update checkpoint metadata → reference cloned lorebook
4. Record state → running recap version, lorebook name, etc.

**Result:** Each checkpoint has its own lorebook, isolated from main timeline

### Why Both Are Needed

| Component | Purpose | What It Prevents |
|-----------|---------|------------------|
| **Requirements Validation** | Ensures checkpoint captures COMPLETE state | Incomplete recaps, pending operations in snapshot |
| **Lorebook Cloning** | Ensures future divergence doesn't contaminate | Queue ops in main affecting checkpoint, registry pollution |

**Together:** Clean snapshot + isolated future = reliable, corruption-free checkpoints

---

## Requirements Validation

### The Four Requirements

#### Requirement 1: Operation Queue Must Be Empty

**What:** No pending operations in the queue

**Why:** Queue operations represent incomplete work:
- Scene recap generation in progress
- Running recap update pending
- Registry updates not yet applied

If queue is active, checkpoint would capture intermediate state.

**Check:**
```javascript
function isQueueEmpty() {
  const queue = getCurrentQueue();
  const pending = queue?.queue?.filter(op =>
    op.status === 'pending' || op.status === 'in_progress'
  );
  return pending.length === 0;
}
```

**Error if fails:**
"Operation queue has 3 pending operations. Wait for queue to finish."

#### Requirement 2: Message Must Be Scene Break

**What:** Target message is marked as a scene break

**Why:** Scene breaks are natural narrative boundaries:
- Represent complete narrative units
- Have scene-level recaps
- Logical checkpoint points in story

Checkpoints should align with narrative structure.

**Check:**
```javascript
function hasSceneBreak(messageIndex) {
  const message = chat[messageIndex];
  const isSceneBreak = get_data(message, 'scene_break');
  const isVisible = get_data(message, 'scene_break_visible');
  return isSceneBreak === true && isVisible !== false;
}
```

**Error if fails:**
"Message is not a scene break. Only scene breaks can be checkpointed."

#### Requirement 3: Scene Must Have Recap

**What:** Scene break has generated scene recap

**Why:** Scene recap summarizes the complete scene:
- Without it, scene content isn't captured in memory
- Running recap may not include this scene yet
- Checkpoint would be missing scene context

**Check:**
```javascript
function hasSceneRecap(messageIndex) {
  const message = chat[messageIndex];
  const sceneRecap = get_data(message, 'scene_recap_memory');
  return sceneRecap && sceneRecap.trim().length > 0;
}
```

**Error if fails:**
"Scene has no recap. Generate scene recap first."

#### Requirement 4: Running Scene Recap Must Exist

**What:** At least one running scene recap version exists

**Why:** Running recap is the complete narrative summary:
- Combines all scene recaps into continuous narrative
- Provides full story context up to checkpoint
- Essential for correct memory injection

Without it, checkpoint has no narrative context.

**Check:**
```javascript
function hasValidRunningRecap() {
  const storage = chat_metadata.auto_recap_running_scene_recaps;
  return storage?.versions?.length > 0 &&
         storage.current_version !== undefined;
}
```

**Error if fails:**
"No running scene recap exists. Generate running scene recap."

### Validation Function

**Complete validation:**
```javascript
export function validateCheckpointRequirements(messageIndex) {
  const errors = [];

  // Check 1: Queue
  if (!isQueueEmpty()) {
    errors.push({
      code: 'QUEUE_NOT_EMPTY',
      message: 'Operation queue is not empty',
      action: 'Wait for all operations to complete',
      details: `${getPendingOperations().length} operations pending`
    });
  }

  // Check 2: Scene break
  if (!hasSceneBreak(messageIndex)) {
    errors.push({
      code: 'NO_SCENE_BREAK',
      message: 'Message is not a scene break',
      action: 'Mark this message as a scene break',
      details: 'Use the clapperboard button to create scene break'
    });
  }

  // Check 3: Scene recap
  if (!hasSceneRecap(messageIndex)) {
    errors.push({
      code: 'NO_SCENE_RECAP',
      message: 'Scene has no recap',
      action: 'Generate scene recap',
      details: 'Open scene break panel and click Generate'
    });
  }

  // Check 4: Running recap
  if (!hasValidRunningRecap()) {
    errors.push({
      code: 'NO_RUNNING_RECAP',
      message: 'No running scene recap',
      action: 'Generate running scene recap',
      details: 'Open extension settings and generate running recap'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    state: {
      queueEmpty: isQueueEmpty(),
      hasSceneBreak: hasSceneBreak(messageIndex),
      hasSceneRecap: hasSceneRecap(messageIndex),
      hasRunningRecap: hasValidRunningRecap(),
      messageIndex
    }
  };
}
```

**Blocking behavior:**
If validation fails, checkpoint creation is **BLOCKED** with clear error message showing:
- Which requirements failed
- Why each is required
- What user needs to do to fix

---

## Lorebook Cloning

### Why Clone Lorebooks

**Shared lorebook problem:**
```
Main Chat:
  chat_metadata.world_info = "z-AutoLB-main"

Checkpoint (current):
  chat_metadata.world_info = "z-AutoLB-main"  ← SAME FILE

Result: Shared lorebook = shared queue and registry
```

**With cloning:**
```
Main Chat:
  chat_metadata.world_info = "z-AutoLB-main"
  Operations: [op1, op2, op3, op4]

Checkpoint:
  chat_metadata.world_info = "z-AutoLB-main__CP_Checkpoint5"  ← DIFFERENT FILE
  Operations: []  ← Empty (queue was empty at checkpoint time)

Result: Isolated lorebooks = isolated state
```

### Cloning Strategy

#### Step 1: Generate Unique Name

**Naming convention:**
```
Base lorebook: "z-AutoLB-main123"
Checkpoint: "Checkpoint #5 - 2025-01-12 14:30:00"

Cloned lorebook: "z-AutoLB-main123__CP_Checkpoint_5_-_2025-01-12_14-30-00"
```

**Algorithm:**
```javascript
function generateCheckpointLorebookName(baseName, checkpointName) {
  // Sanitize: remove special chars, replace spaces with underscores
  const sanitized = checkpointName
    .replace(/[^a-zA-Z0-9_\- ]/g, '')  // Remove special chars
    .replace(/\s+/g, '_')               // Spaces → underscores
    .substring(0, 50);                  // Limit length

  return `${baseName}__CP_${sanitized}`;
}
```

**Prefix:** `__CP_` clearly marks lorebook as checkpoint-owned

#### Step 2: Filter Internal Entries

**Internal entry types** (should NOT be cloned):
- `__operation_queue` - Queue state (should be empty anyway)
- `_registry_character` - Registry entries (will be empty in clone)
- `_registry_location` - Registry entries
- `_registry_event` - Registry entries
- etc.

**User entry types** (SHOULD be cloned):
- All user-created lorebook entries
- Character descriptions
- Location details
- Plot notes
- Any entry with user-provided content

**⚠️ IMPORTANT: V2 Approach - Copy ALL Entries**

**V2 Requirement:** Checkpoint cloning must copy ALL entries without filtering to ensure complete point-in-time correctness.

```javascript
// V2: NO FILTERING - copy everything for complete snapshot
function shouldCloneEntry(entry) {
  // V2: Always clone - complete point-in-time snapshot
  return true;
}
```

**NOTE:** Do NOT reuse `isInternalEntry()` from lorebookManager.js - that function is exclusively for duplicating from global/character lorebooks to chat lorebooks and is NOT appropriate for checkpoint cloning.

#### Step 3: Deep Clone Entries

**⚠️ CRITICAL: Preserve UIDs for Registry Integrity**

UIDs in SillyTavern lorebooks are **lorebook-unique**, NOT globally unique. When cloning to a new lorebook file, UIDs MUST be preserved exactly to maintain registry entry references.

**See [LOREBOOK_DUPLICATION_CORRECT_METHOD.md](LOREBOOK_DUPLICATION_CORRECT_METHOD.md) for the definitive specification.**

**Clone process:**
```javascript
async function cloneLorebook(sourceLorebookName, checkpointName) {
  // 1. Load source lorebook
  const sourceData = await loadWorldInfo(sourceLorebookName);
  if (!sourceData) {
    throw new Error(`Source lorebook "${sourceLorebookName}" not found`);
  }

  // 2. Generate clone name
  const cloneName = generateCheckpointLorebookName(
    sourceLorebookName,
    checkpointName
  );

  // 3. Create new empty lorebook
  const created = await createNewWorldInfo(cloneName);
  if (!created) {
    throw new Error(`Failed to create cloned lorebook "${cloneName}"`);
  }

  // 4. Copy ALL entries with ORIGINAL UIDs (V2: Complete point-in-time snapshot)
  const cloneData = { entries: {} };
  let copiedCount = 0;

  for (const [uid, entry] of Object.entries(sourceData.entries || {})) {
    if (!entry) continue;

    // Deep clone entry (no shared references)
    const clonedEntry = JSON.parse(JSON.stringify(entry));

    // ✅ PRESERVE original UID - ensures registry entries remain valid
    // UIDs are lorebook-unique, NOT globally unique
    cloneData.entries[uid] = clonedEntry;
    copiedCount++;
  }

  // 5. Copy lorebook-level settings
  if (sourceData.name) cloneData.name = cloneName;
  if (sourceData.extensions) {
    cloneData.extensions = JSON.parse(JSON.stringify(sourceData.extensions));
  }

  // 6. Save cloned lorebook
  await saveWorldInfo(cloneName, cloneData, true);
  await invalidateLorebookCache(cloneName);

  // 7. Verify registry integrity (code-based, NOT LLM)
  await verifyRegistryIntegrity(cloneName);

  // 8. Reorder alphabetically if setting enabled
  await reorderLorebookEntriesAlphabetically(cloneName);

  log(`✓ Cloned "${sourceLorebookName}" → "${cloneName}"`);
  log(`  Copied: ${copiedCount} entries with UIDs preserved`);

  return cloneName;
}
```

#### Step 4: Handle Clone Failures

**If clone fails:**
1. Show clear error to user
2. **ABORT** checkpoint creation
3. Do NOT create checkpoint with shared lorebook
4. Clean up any partially created files

**Error handling:**
```javascript
async function cloneLorebook(sourceLorebookName, checkpointName) {
  try {
    // ... cloning logic ...
    return cloneName;
  } catch (err) {
    error(`Failed to clone lorebook: ${err.message}`);

    // Clean up partially created lorebook if exists
    if (world_names.includes(cloneName)) {
      await deleteWorldInfo(cloneName);
    }

    return null; // Signal failure
  }
}
```

**Caller handling:**
```javascript
const clonedLorebook = await cloneLorebook(originalLorebook, checkpointName);

if (!clonedLorebook) {
  toastr.error('Failed to clone lorebook. Checkpoint creation aborted.', 'Error');
  return null; // Do NOT proceed with checkpoint creation
}
```

---

## State Recording

### What State to Record

**Checkpoint state metadata structure:**
```javascript
{
  // Metadata
  timestamp: 1736697000000,              // When checkpoint was created
  message_id: 42,                        // Which message checkpoint is at
  extension_version: "1.5.0",            // Extension version (for compatibility)

  // Requirements proof (all should be true)
  queue_was_empty: true,
  has_scene_break: true,
  has_scene_recap: true,
  has_running_recap: true,

  // Lorebook information
  cloned_lorebook_name: "z-AutoLB-main__CP_Checkpoint5",
  original_lorebook_name: "z-AutoLB-main",

  // Running recap snapshot
  running_recap_version: 3,              // Which version to use
  running_recap_content: "Full narrative summary...",
  running_recap_scene_count: 5,          // How many scenes included

  // Scene information
  scene_break_name: "Important Scene",
  scene_recap: "Scene summary text..."
}
```

### When to Record

**Timing:** AFTER validation passes, AFTER lorebook cloned, BEFORE checkpoint created

**Why this order:**
1. Validate first (may abort if invalid)
2. Clone lorebook (may abort if clone fails)
3. Record state (we have all the data we need)
4. Create checkpoint (state is saved with checkpoint)

### How to Record

**Approach:** Inject state into `chat_metadata` temporarily

**Process:**
```javascript
async function createValidatedCheckpoint(messageId, checkpointName) {
  // 1. Validate
  const validation = validateCheckpointRequirements(messageId);
  if (!validation.valid) {
    return null; // Blocked
  }

  // 2. Clone lorebook
  const clonedLorebook = await cloneLorebook(originalLorebook, checkpointName);
  if (!clonedLorebook) {
    return null; // Failed
  }

  // 3. Record state
  const state = recordCheckpointState(messageId, clonedLorebook);

  // 4. INJECT state into chat_metadata temporarily
  const originalState = chat_metadata.auto_recap_checkpoint_state;
  chat_metadata.auto_recap_checkpoint_state = state;

  // 5. SWAP lorebook reference temporarily
  const originalLorebook = chat_metadata.world_info;
  chat_metadata.world_info = clonedLorebook;

  try {
    // 6. CREATE checkpoint (ST saves chat_metadata including our injected state)
    const result = await originalCreateNewBookmark(messageId, {
      forceName: checkpointName
    });

    if (!result) {
      throw new Error('Checkpoint creation failed');
    }

    log(`✓ Checkpoint created with state: ${result}`);
    return result;

  } finally {
    // 7. RESTORE original values in main chat
    if (originalState === undefined) {
      delete chat_metadata.auto_recap_checkpoint_state;
    } else {
      chat_metadata.auto_recap_checkpoint_state = originalState;
    }

    chat_metadata.world_info = originalLorebook;
    await saveMetadata();
  }
}
```

**Key technique: Metadata injection**

SillyTavern's `saveChat()` function merges metadata:
```javascript
const metadata = { ...chat_metadata, ...(withMetadata || {}) };
```

By temporarily modifying `chat_metadata` before calling `createNewBookmark()`:
- Checkpoint captures our modified state
- We restore original state after
- Main chat retains its original values
- Checkpoint has the injected state

### Recording Function

```javascript
function recordCheckpointState(messageId, clonedLorebookName) {
  const message = chat[messageId];
  const runningRecap = chat_metadata.auto_recap_running_scene_recaps;
  const currentVersion = runningRecap.versions[runningRecap.current_version];

  return {
    // Metadata
    timestamp: Date.now(),
    message_id: messageId,
    extension_version: getManifest()?.version || 'unknown',

    // Requirements proof
    queue_was_empty: true,  // Validated before reaching here
    has_scene_break: true,
    has_scene_recap: true,
    has_running_recap: true,

    // Lorebook
    cloned_lorebook_name: clonedLorebookName,
    original_lorebook_name: chat_metadata.world_info,

    // Running recap
    running_recap_version: runningRecap.current_version,
    running_recap_content: currentVersion?.content || '',
    running_recap_scene_count: currentVersion?.scene_count || 0,

    // Scene
    scene_break_name: get_data(message, 'scene_break_name') || '',
    scene_recap: get_data(message, 'scene_recap_memory') || ''
  };
}
```

---

## State Restoration

### When to Restore

**Event:** `CHAT_CHANGED` event fires

**Detection:**
```javascript
eventSource.on(event_types.CHAT_CHANGED, async () => {
  // Check if loading a checkpoint/branch
  if (chat_metadata.main_chat) {
    // We're in a checkpoint (main_chat points to parent)

    // Get checkpoint state
    const checkpointState = chat_metadata.auto_recap_checkpoint_state;

    if (checkpointState) {
      await restoreCheckpointState(checkpointState);
    } else {
      // Legacy checkpoint (created before this feature)
      debug('No checkpoint state found (legacy checkpoint)');
    }
  }
});
```

### What to Restore

**1. Verify Cloned Lorebook**

Checkpoint should have cloned lorebook attached:
```javascript
const currentLorebook = chat_metadata.world_info;
const expectedLorebook = checkpointState.cloned_lorebook_name;

if (currentLorebook !== expectedLorebook) {
  warn(`Lorebook mismatch! Expected "${expectedLorebook}", got "${currentLorebook}"`);
  // This shouldn't happen, but log for debugging
}
```

**2. Restore Running Recap Version**

Set running recap to use checkpoint's recorded version:
```javascript
const runningRecap = chat_metadata.auto_recap_running_scene_recaps;

if (runningRecap) {
  // Find the version
  const versionExists = runningRecap.versions.some(
    v => v.version === checkpointState.running_recap_version
  );

  if (versionExists) {
    runningRecap.current_version = checkpointState.running_recap_version;
    log(`Using running recap version ${checkpointState.running_recap_version}`);
  } else {
    error(`Running recap version ${checkpointState.running_recap_version} not found in checkpoint`);
  }
}
```

**3. Refresh Memory Injection**

Force memory system to re-inject with restored version:
```javascript
await refreshMemoryInjection();
```

**4. Show User Notification**

```javascript
toastr.info(
  `Loaded checkpoint: ${checkpointState.scene_break_name}\n` +
  `Running recap version: ${checkpointState.running_recap_version}\n` +
  `Created: ${new Date(checkpointState.timestamp).toLocaleString()}`,
  'Checkpoint Loaded'
);
```

### Complete Restoration Function

```javascript
async function restoreCheckpointState(state) {
  log(`Restoring checkpoint state from ${new Date(state.timestamp)}`);

  // 1. Verify lorebook
  const currentLorebook = chat_metadata.world_info;
  if (currentLorebook !== state.cloned_lorebook_name) {
    warn(
      `Lorebook mismatch:\n` +
      `  Expected: ${state.cloned_lorebook_name}\n` +
      `  Current: ${currentLorebook}`
    );
  } else {
    log(`✓ Using cloned lorebook: ${currentLorebook}`);
  }

  // 2. Restore running recap version
  const runningRecap = chat_metadata.auto_recap_running_scene_recaps;

  if (runningRecap) {
    const targetVersion = state.running_recap_version;
    const versionExists = runningRecap.versions.some(v => v.version === targetVersion);

    if (versionExists) {
      runningRecap.current_version = targetVersion;
      log(`✓ Restored running recap to version ${targetVersion}`);
    } else {
      error(`✗ Running recap version ${targetVersion} not found`);
      error(`  Available versions: ${runningRecap.versions.map(v => v.version).join(', ')}`);
    }
  } else {
    warn('No running recap storage found in checkpoint');
  }

  // 3. Refresh memory injection
  log('Refreshing memory injection...');
  await refreshMemoryInjection();

  // 4. Show notification
  const sceneName = state.scene_break_name || 'Unnamed Scene';
  const createdDate = new Date(state.timestamp).toLocaleString();

  toastr.info(
    `Checkpoint: ${sceneName}\n` +
    `Running Recap v${state.running_recap_version} (${state.running_recap_scene_count} scenes)\n` +
    `Created: ${createdDate}`,
    'Checkpoint Loaded',
    { timeOut: 5000 }
  );

  log(`✓ Checkpoint state restored successfully`);
}
```

---

## Complete Flow Diagrams

### Checkpoint Creation Flow

```
User clicks "Create Checkpoint" on scene break message

    ↓

1. VALIDATE REQUIREMENTS
   ├─ Queue empty? → NO → ✗ BLOCK with error
   ├─ Scene break? → NO → ✗ BLOCK with error
   ├─ Scene recap? → NO → ✗ BLOCK with error
   └─ Running recap? → NO → ✗ BLOCK with error

   All YES? → ✓ Continue

    ↓

2. CLONE LOREBOOK
   ├─ Get attached lorebook: "z-AutoLB-main"
   ├─ Generate clone name: "z-AutoLB-main__CP_Checkpoint5"
   ├─ Load source lorebook data
   ├─ Filter internal entries (_registry_*, __operation_queue)
   ├─ Deep clone user entries
   ├─ Save cloned lorebook → new file created
   └─ Return cloned name

   Failed? → ✗ ABORT checkpoint creation

    ↓

3. RECORD STATE
   ├─ running_recap_version: 3
   ├─ cloned_lorebook_name: "z-AutoLB-main__CP_Checkpoint5"
   ├─ original_lorebook_name: "z-AutoLB-main"
   ├─ scene_break_name: "Important Scene"
   ├─ scene_recap: "..."
   └─ timestamp, message_id, requirements proof

    ↓

4. INJECT STATE & LOREBOOK
   ├─ Save original: originalLorebook = chat_metadata.world_info
   ├─ Inject state: chat_metadata.auto_recap_checkpoint_state = state
   └─ Swap lorebook: chat_metadata.world_info = clonedLorebook

    ↓

5. CREATE CHECKPOINT (ST API)
   └─ await createNewBookmark(mesId, { forceName: "Checkpoint5" })
      → ST saves chat_metadata (includes our injected state + cloned lorebook ref)

    ↓

6. RESTORE MAIN CHAT
   ├─ Remove state: delete chat_metadata.auto_recap_checkpoint_state
   ├─ Restore lorebook: chat_metadata.world_info = originalLorebook
   └─ Save metadata

    ↓

✓ CHECKPOINT CREATED
  - Has isolated lorebook: "z-AutoLB-main__CP_Checkpoint5"
  - Has recorded state: running recap v3, scene info
  - Main chat unchanged: uses "z-AutoLB-main"
```

### Checkpoint Load Flow

```
User opens checkpoint "Checkpoint5"

    ↓

ST loads checkpoint chat file
  - Loads chat_metadata from first element of JSONL
  - chat_metadata.world_info = "z-AutoLB-main__CP_Checkpoint5" (cloned lorebook)
  - chat_metadata.auto_recap_checkpoint_state = { ... state ... }

    ↓

CHAT_CHANGED event fires

    ↓

1. DETECT CHECKPOINT
   ├─ Check: chat_metadata.main_chat exists?
   └─ YES → We're in a checkpoint

    ↓

2. GET CHECKPOINT STATE
   └─ state = chat_metadata.auto_recap_checkpoint_state

    ↓

3. RESTORE STATE
   ├─ Verify lorebook: chat_metadata.world_info === state.cloned_lorebook_name
   ├─ Restore running recap version:
   │  └─ runningRecap.current_version = state.running_recap_version
   ├─ Refresh memory injection → uses restored version
   └─ Show notification to user

    ↓

✓ CHECKPOINT LOADED
  - Using cloned lorebook (isolated from main)
  - Using recorded running recap version
  - Memory injection correct for checkpoint point-in-time
```

### Main → Checkpoint → Main Flow

```
INITIAL STATE (Main Chat)

Main Chat:
  - Lorebook: "z-AutoLB-main"
  - Queue: [] (empty)
  - Running recap: version 5 (10 scenes)
  - Messages: 0-100

    ↓

CREATE CHECKPOINT at message 50

    ↓

Checkpoint Created:
  - Name: "Checkpoint #5"
  - Lorebook: "z-AutoLB-main__CP_Checkpoint5" (CLONED)
  - State recorded:
    - running_recap_version: 5
    - scene_recap: "Scene at message 50"
    - message_id: 50
  - Messages: 0-50 (trimmed)

    ↓

MAIN CHAT CONTINUES

Main Chat progresses:
  - Add messages 51-150
  - Generate new recaps
  - Queue operations → stored in "z-AutoLB-main" lorebook
  - Update running recap → version 8 (15 scenes)
  - Add entities to registry → stored in "z-AutoLB-main" lorebook

    ↓

SWITCH TO CHECKPOINT

Load Checkpoint #5:
  - Lorebook: "z-AutoLB-main__CP_Checkpoint5"
    → Does NOT see main's queue operations
    → Does NOT see main's registry updates
  - Running recap: version 5 (restored from state)
    → Does NOT see main's versions 6, 7, 8
  - Messages: 0-50
    → Does NOT see main's messages 51-150

✓ CHECKPOINT ISOLATED
  - No contamination from main timeline
  - Correct point-in-time state

    ↓

SWITCH BACK TO MAIN

Load Main Chat:
  - Lorebook: "z-AutoLB-main" (original)
    → Has all queue operations
    → Has all registry updates
  - Running recap: version 8 (current)
    → Has all 15 scenes
  - Messages: 0-150
    → Has all messages

✓ MAIN UNCHANGED
  - No data loss
  - Timeline continued independently
```

---

## Data Structures

### Checkpoint State Metadata

**Storage location:** `chat_metadata.auto_recap_checkpoint_state`

**Type:** Object

**Structure:**
```typescript
interface CheckpointStateMetadata {
  // Metadata
  timestamp: number;                    // Unix timestamp (ms)
  message_id: number;                   // Message index where checkpoint was created
  extension_version: string;            // Extension version (e.g., "1.5.0")

  // Requirements proof
  queue_was_empty: boolean;             // Always true (validated)
  has_scene_break: boolean;             // Always true (validated)
  has_scene_recap: boolean;             // Always true (validated)
  has_running_recap: boolean;           // Always true (validated)

  // Lorebook
  cloned_lorebook_name: string | null;  // Cloned lorebook name (or null if no lorebook)
  original_lorebook_name: string | null; // Original lorebook name (for reference)

  // Running recap snapshot
  running_recap_version: number | null; // Which version to use
  running_recap_content: string | null; // Full content (backup)
  running_recap_scene_count: number;    // How many scenes included

  // Scene information
  scene_break_name: string | null;      // Name of scene at checkpoint
  scene_recap: string | null;           // Scene recap text
}
```

**Example:**
```json
{
  "timestamp": 1736697000000,
  "message_id": 42,
  "extension_version": "1.5.0",

  "queue_was_empty": true,
  "has_scene_break": true,
  "has_scene_recap": true,
  "has_running_recap": true,

  "cloned_lorebook_name": "z-AutoLB-main123__CP_Important_Scene_-_2025-01-12_14-30-00",
  "original_lorebook_name": "z-AutoLB-main123",

  "running_recap_version": 3,
  "running_recap_content": "The story so far: Alice entered the castle...",
  "running_recap_scene_count": 5,

  "scene_break_name": "Important Scene",
  "scene_recap": "Alice discovered a hidden door..."
}
```

### Validation Result

**Type:** Object

**Structure:**
```typescript
interface ValidationResult {
  valid: boolean;                       // Overall validity
  errors: ValidationError[];            // List of validation errors (empty if valid)
  warnings: string[];                   // Non-blocking warnings
  state: {                              // Current state of each requirement
    queueEmpty: boolean;
    hasSceneBreak: boolean;
    hasSceneRecap: boolean;
    hasRunningRecap: boolean;
    messageIndex: number;
  };
}

interface ValidationError {
  code: string;                         // Error code (e.g., "QUEUE_NOT_EMPTY")
  message: string;                      // Human-readable message
  action: string;                       // What user needs to do
  details?: string;                     // Additional details
}
```

**Example (valid):**
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "state": {
    "queueEmpty": true,
    "hasSceneBreak": true,
    "hasSceneRecap": true,
    "hasRunningRecap": true,
    "messageIndex": 42
  }
}
```

**Example (invalid):**
```json
{
  "valid": false,
  "errors": [
    {
      "code": "QUEUE_NOT_EMPTY",
      "message": "Operation queue is not empty",
      "action": "Wait for all operations to complete",
      "details": "3 operations pending: GENERATE_SCENE_RECAP, UPDATE_REGISTRY, COMBINE_RECAPS"
    },
    {
      "code": "NO_SCENE_RECAP",
      "message": "Scene has no recap",
      "action": "Generate scene recap",
      "details": "Open scene break panel and click Generate button"
    }
  ],
  "warnings": [],
  "state": {
    "queueEmpty": false,
    "hasSceneBreak": true,
    "hasSceneRecap": false,
    "hasRunningRecap": true,
    "messageIndex": 42
  }
}
```

---

## Implementation Files

### New Files to Create

**1. `checkpointValidator.js`**
- **Purpose:** Validate all checkpoint requirements
- **Exports:**
  - `validateCheckpointRequirements(messageIndex)` → ValidationResult
  - `isQueueEmpty()` → boolean
  - `hasSceneBreak(messageIndex)` → boolean
  - `hasSceneRecap(messageIndex)` → boolean
  - `hasValidRunningRecap()` → boolean
  - `formatValidationErrors(result)` → string

**2. `lorebookCloner.js`**
- **Purpose:** Clone lorebooks for checkpoint isolation
- **Exports:**
  - `cloneLorebook(sourceLorebookName, checkpointName)` → Promise<string | null>
  - `generateCheckpointLorebookName(baseName, checkpointName)` → string
  - `isInternalEntry(comment)` → boolean
  - `getAttachedLorebookName()` → string | null

**3. `checkpointManager.js`**
- **Purpose:** Orchestrate checkpoint creation with validation + cloning
- **Exports:**
  - `createValidatedCheckpoint(messageId, checkpointName)` → Promise<string | null>
  - `recordCheckpointState(messageId, clonedLorebookName)` → CheckpointStateMetadata
  - `restoreCheckpointState(state)` → Promise<void>
  - `getCheckpointState(checkpointName)` → CheckpointStateMetadata | null

### Files to Modify

**1. `slashCommandHandlers.js`**
- Wrap `/checkpoint-create` command
- Use `createValidatedCheckpoint()` instead of ST's direct API

**2. `eventHandlers.js`**
- Add checkpoint state restoration in `CHAT_CHANGED` handler
- Call `restoreCheckpointState()` when loading checkpoint

**3. `index.js`**
- Export new checkpoint modules
- Add `CHECKPOINT` subsystem to logging

**4. `lorebookManager.js`**
- Export `cloneLorebook()` function
- Add lorebook cache invalidation helper

---

## Critical Mitigations (P0)

**REQUIRED FOR SAFE IMPLEMENTATION**

Based on comprehensive code analysis, two critical risks have been identified that MUST be mitigated before implementing checkpoint support. These are classified as P0 (Priority 0) - **implementation blocking** issues.

### M1: Branch Auto-Open Timing Protection

**Risk Level:** 🔴 **CRITICAL (P0)**

#### Problem

SillyTavern's `branchChat()` function **immediately opens** the newly created branch (unlike checkpoints which stay on the current chat). This creates a critical timing window where:

1. Branch file is created with shared lorebook reference
2. Chat immediately switches to branch (`openCharacterChat()` called)
3. `CHAT_CHANGED` event fires
4. Extension's `handleChatChanged()` runs
5. Extension calls `reloadQueue()` which loads from **shared lorebook**
6. Branch inherits queue operations from main chat (**CONTAMINATION**)

**Timeline:**
```
t=0ms:   User creates branch
t=20ms:  Branch file saved (references shared lorebook)
         Main chat queue: [op1, op2, op3]
t=60ms:  openCharacterChat(branchName) called ← AUTO-OPENS
t=170ms: CHAT_CHANGED event fires
t=180ms: Extension's handleChatChanged() runs
t=190ms: reloadQueue() loads from shared lorebook
t=200ms: Branch now has queue: [op1, op2, op3] ❌ CONTAMINATION
```

#### Solution

Apply **same validation and lorebook cloning to branches** as checkpoints:

**Code Location:** `bookmarks.js:390-406` (SillyTavern core) or extension wrapper

**Required Changes:**

1. **Extend validation to branches:**
```javascript
// In checkpointValidator.js or checkpointManager.js
export async function validateBranchRequirements(mesId) {
  // Use same validation as checkpoints
  return await validateCheckpointRequirements(mesId);
}
```

2. **Use createBranch() directly (NOT branchChat()):**

**⚠️ CRITICAL: Do NOT call `branchChat()` inside try/finally** - it opens the branch before finally executes, causing restoration in wrong chat!

**✅ CORRECT Implementation:**
```javascript
// In checkpointManager.js
import { createBranch } from '../../../scripts/bookmarks.js';
import { saveItemizedPrompts, openCharacterChat, openGroupChat } from '../../../scripts/script.js';

export async function createValidatedBranch(mesId) {
  // 1. Validate requirements (same as checkpoints)
  const validation = await validateCheckpointRequirements(mesId);
  if (!validation.valid) {
    showValidationErrors(validation.errors);
    return null;
  }

  // 2. Clone lorebook BEFORE branch creation
  const originalLorebook = chat_metadata.world_info;
  if (!originalLorebook) {
    toastr.error('No lorebook attached to current chat');
    return null;
  }

  const clonedLorebook = await cloneLorebook(
    originalLorebook,
    `Branch_${mesId}_${Date.now()}`
  );

  if (!clonedLorebook) {
    toastr.error('Failed to clone lorebook for branch isolation');
    return null;
  }

  // 3. Create branch with cloned lorebook (don't open yet)
  const originalState = chat_metadata.auto_recap_checkpoint_state;
  let fileName;

  try {
    // Inject cloned lorebook into metadata
    chat_metadata.world_info = clonedLorebook;
    chat_metadata.auto_recap_checkpoint_state = recordCheckpointState(mesId, clonedLorebook);

    // Create branch FILE only (doesn't open)
    fileName = await createBranch(mesId);

    if (!fileName) {
      throw new Error('Branch creation failed');
    }

    // Save itemized prompts
    await saveItemizedPrompts(fileName);

  } finally {
    // 4. RESTORE BEFORE OPENING (still in main chat here!)
    if (originalState === undefined) {
      delete chat_metadata.auto_recap_checkpoint_state;
    } else {
      chat_metadata.auto_recap_checkpoint_state = originalState;
    }
    chat_metadata.world_info = originalLorebook;

    // Save main chat to persist restoration
    await saveChatConditional();
  }

  // 5. NOW open branch (OUTSIDE try/finally)
  // Branch loads its own metadata from file (has cloned lorebook)
  if (fileName) {
    if (selected_group) {
      await openGroupChat(selected_group, fileName);
    } else {
      await openCharacterChat(fileName);
    }
  }

  log(`✓ Branch created with isolated lorebook: ${fileName}`);
  return fileName;
}
```

**Why This Works:**
- ✅ `createBranch()` saves branch file but doesn't open it
- ✅ `finally` executes while still in MAIN chat
- ✅ Restoration happens in correct context
- ✅ Branch opens AFTER restoration, loads its own cloned lorebook from file

**Execution Timeline (CORRECTED):**
```
t=0ms:   User creates branch (in MAIN chat)
t=200ms: cloneLorebook() completes → "lorebook-ABC__BRANCH_5"
t=210ms: chat_metadata.world_info = "lorebook-ABC__BRANCH_5" (MAIN chat modified)
t=220ms: await createBranch(5)
         → Saves branch file with cloned lorebook ✓
         → Returns (still in MAIN chat)
t=250ms: finally executes (still in MAIN chat) ✓
         → chat_metadata.world_info = "lorebook-ABC" (MAIN chat restored)
t=280ms: await openCharacterChat(branchName)
         → Switches to branch
         → Loads branch metadata (has "lorebook-ABC__BRANCH_5") ✓
t=320ms: Now in BRANCH chat

Result: ✅ Main chat has "lorebook-ABC"
        ✅ Branch has "lorebook-ABC__BRANCH_5"
        ✅ Complete isolation
```

3. **Add branch creation lock:**
```javascript
let isCreatingBranch = false;

export async function createValidatedBranch(mesId) {
  if (isCreatingBranch) {
    toastr.warning('Branch creation already in progress');
    return null;
  }

  isCreatingBranch = true;
  setQueueBlocking(true);  // Block UI during creation

  try {
    // ... validation and creation logic ...
    return branchName;
  } finally {
    setQueueBlocking(false);
    isCreatingBranch = false;
  }
}
```

**Files to modify:**
- `checkpointManager.js` - Add `createValidatedBranch()`
- `eventHandlers.js` or extension init - Hook into `branchChat()`
- UI bindings - Call `createValidatedBranch()` instead of ST's `branchChat()`

**Testing Requirements:**
- Create branch with non-empty queue → Must be blocked
- Create branch with empty queue → Must succeed with isolated lorebook
- Branch must have clean queue (not inherit from main)
- Verify branch's lorebook is cloned (different name)

**Implementation Priority:** **P0 - MUST IMPLEMENT BEFORE RELEASE**

---

### M2: Concurrent Operation Protection

**Risk Level:** 🔴 **CRITICAL (P0)**

#### Problem

Checkpoint/branch creation involves multiple async operations without reentrancy protection:

**Identified Race Conditions:**

1. **Rapid checkpoint creation:**
   - User clicks "Create Checkpoint" twice quickly
   - Both validations pass (queue empty at both times)
   - Both start lorebook cloning (async)
   - Second checkpoint overwrites `message.extra.bookmark_link`
   - First checkpoint orphaned

2. **Chat switch during creation:**
   - User starts checkpoint creation
   - Lorebook cloning in progress (async, ~200ms)
   - User switches to different chat
   - `chat_metadata` reset to new chat
   - Clone completes
   - `createNewBookmark()` runs with **wrong chat's metadata** ❌ CORRUPTION

3. **Lorebook modification during clone:**
   - Checkpoint creation starts, lorebook cloning begins
   - Clone reads lorebook entries (snapshot)
   - User manually adds new lorebook entry
   - Clone completes without new entry
   - Checkpoint saved with incomplete lorebook

#### Solution

Implement **creation locks, UI blocking, and context validation:**

**Required Changes:**

1. **Add checkpoint creation lock:**
```javascript
// In checkpointManager.js (module-level)
let isCreatingCheckpoint = false;

export async function createValidatedCheckpoint(mesId, checkpointName) {
  // Reentrancy protection
  if (isCreatingCheckpoint) {
    toastr.warning('Checkpoint creation already in progress. Please wait.');
    return null;
  }

  isCreatingCheckpoint = true;
  setQueueBlocking(true);  // Block UI (reuse queue blocking mechanism)

  try {
    // ... checkpoint creation logic ...
    return checkpointName;

  } catch (error) {
    error(SUBSYSTEM.CHECKPOINT, 'Checkpoint creation failed:', error);
    toastr.error(`Failed to create checkpoint: ${error.message}`);
    return null;

  } finally {
    // ALWAYS release lock and unblock UI
    setQueueBlocking(false);
    isCreatingCheckpoint = false;
  }
}
```

2. **Add chat context validation:**
```javascript
export async function createValidatedCheckpoint(mesId, checkpointName) {
  if (isCreatingCheckpoint) { return null; }

  isCreatingCheckpoint = true;
  setQueueBlocking(true);

  // CAPTURE CONTEXT BEFORE async operations
  const chatIdBefore = getCurrentChatId();
  const characterBefore = this_chid;
  const groupBefore = selected_group;

  try {
    // 1. Validation (synchronous)
    const validation = await validateCheckpointRequirements(mesId);
    if (!validation.valid) {
      showValidationErrors(validation.errors);
      return null;
    }

    // 2. Lorebook cloning (ASYNC - long operation)
    const clonedLorebook = await cloneLorebook(
      getAttachedLorebookName(),
      checkpointName
    );

    // VALIDATE CONTEXT AFTER async operation
    const chatIdAfter = getCurrentChatId();
    const characterAfter = this_chid;
    const groupAfter = selected_group;

    if (chatIdBefore !== chatIdAfter ||
        characterBefore !== characterAfter ||
        groupBefore !== groupAfter) {
      // Context changed - abort!
      throw new Error(
        'Chat context changed during checkpoint creation. ' +
        'Checkpoint aborted to prevent corruption.'
      );
    }

    // 3. Metadata injection and checkpoint creation
    // ... rest of logic ...

    return checkpointName;

  } finally {
    setQueueBlocking(false);
    isCreatingCheckpoint = false;
  }
}
```

3. **Add queue reload debouncing:**

**CRITICAL**: The following corrected implementation prevents hanging promises when debouncing.

**Why the fix is necessary:**
- When `clearTimeout()` cancels a timer, the old Promise never resolves
- Rapid chat switches create orphaned promises that hang forever
- Must track ALL pending resolvers and resolve them together

**Timeline showing the bug:**
```
t=0:   Call 1: reloadQueue() → Promise p1, sets timer t1
t=50:  Call 2: reloadQueue() → Promise p2, clearTimeout(t1), sets timer t2
                                ↑ Timer t1 cancelled, p1 NEVER resolves! ❌
t=150: Timer t2 fires → resolves p2 only ✓
       await p1 ← HANGS FOREVER ❌
```

**Corrected implementation:**
```javascript
// In operationQueue.js or eventHandlers.js
let reloadQueueDebounceTimer = null;
let pendingResolvers = [];  // Track ALL promises

export async function reloadQueue() {
  // Debounce rapid reloads (e.g., rapid chat switches)
  if (reloadQueueDebounceTimer) {
    clearTimeout(reloadQueueDebounceTimer);
  }

  return new Promise((resolve) => {
    pendingResolvers.push(resolve);  // Add to tracking array

    reloadQueueDebounceTimer = setTimeout(async () => {
      reloadQueueDebounceTimer = null;
      await reloadQueueInternal();

      // Resolve ALL pending promises (including cancelled ones)
      for (const r of pendingResolvers) {
        r();
      }
      pendingResolvers = [];
    }, 100);  // 100ms debounce
  });
}
```

**What happens with the fix:**
```
t=0:   Call 1: reloadQueue() → Promise p1, pendingResolvers=[r1], sets timer t1
t=50:  Call 2: reloadQueue() → Promise p2, pendingResolvers=[r1,r2], sets timer t2
t=150: Timer t2 fires → resolves BOTH r1() and r2() ✓
       await p1 ← resolves immediately ✓
       await p2 ← resolves immediately ✓
```

4. **UI blocking during creation:**
```javascript
// Reuse existing queue blocking mechanism
export async function createValidatedCheckpoint(mesId, checkpointName) {
  // ...
  setQueueBlocking(true);  // Hides send button, shows blocking indicator
  try {
    // ... creation logic ...
  } finally {
    setQueueBlocking(false);  // Restores UI
  }
}
```

**Files to modify:**
- `checkpointManager.js` - Add lock, context validation, UI blocking
- `operationQueue.js` - Add reload debouncing
- `eventHandlers.js` - Use debounced reload

**Testing Requirements:**
- Click "Create Checkpoint" twice rapidly → Second must be blocked
- Start checkpoint creation, switch chat immediately → Must abort with error
- Start checkpoint creation, try to send message → Must be blocked (UI)
- Rapid chat switches (5 in 2 seconds) → Queue reloads once per chat (debounced)

**Implementation Priority:** **P0 - MUST IMPLEMENT BEFORE RELEASE**

---

### M3: Additional Safeguards (Recommended with P0)

While implementing P0 mitigations, consider adding these complementary safeguards:

**Atomic Lorebook Cloning:**
```javascript
async function cloneLorebook(sourceName, checkpointName) {
  const clonedName = generateCheckpointLorebookName(sourceName, checkpointName);
  let clonedLorebook = null;

  try {
    const sourceData = await loadWorldInfo(sourceName);
    clonedLorebook = await createNewWorldInfo(clonedName);

    // Clone all entries at once (atomic)
    const clonedEntries = [];
    for (const entry of Object.values(sourceData.entries || {})) {
      if (isInternalEntry(entry.comment)) continue;
      clonedEntries.push(deepCloneEntry(entry));
    }

    clonedLorebook.entries = Object.fromEntries(
      clonedEntries.map(e => [e.uid, e])
    );

    await saveWorldInfo(clonedName, clonedLorebook);
    return clonedName;

  } catch (error) {
    // ROLLBACK: Delete partial clone
    if (clonedLorebook) {
      try {
        await deleteWorldInfo(clonedName);
        debug('Rolled back partial lorebook clone:', clonedName);
      } catch (deleteError) {
        error('Failed to rollback partial clone:', deleteError);
      }
    }
    throw new Error(`Lorebook clone failed: ${error.message}`);
  }
}
```

**Metadata Restoration (already in design, emphasize importance):**
```javascript
// ALWAYS use try/finally to restore original metadata
const originalLorebook = chat_metadata.world_info;
const originalState = chat_metadata.auto_recap_checkpoint_state;

try {
  // Inject temporary metadata
  chat_metadata.world_info = clonedLorebook;
  chat_metadata.auto_recap_checkpoint_state = state;

  // Create checkpoint
  await createNewBookmark(mesId, options);

} finally {
  // ALWAYS restore (even on crash/error)
  chat_metadata.world_info = originalLorebook;
  chat_metadata.auto_recap_checkpoint_state = originalState;
}
```

---

### Implementation Order

**Phase 1: P0 Mitigations (CRITICAL - Week 1)**
1. Day 1-2: Implement checkpoint creation lock + UI blocking
2. Day 2-3: Implement chat context validation
3. Day 3-4: Implement branch validation + cloning
4. Day 4-5: Implement queue reload debouncing
5. Day 5-6: Testing all P0 mitigations
6. Day 6-7: Code review + fixes

**Phase 2: Core Features (Week 2)**
1. Requirements validation (as documented)
2. Lorebook cloning with atomic operations
3. State recording and restoration
4. (Continue with original implementation plan)

**Estimated Time Impact:**
- Original estimate: 25-32 hours
- P0 mitigations: +8 hours
- Testing P0: +6 hours
- **New total: 39-46 hours (5-6 days)**

---

## Edge Cases & Error Handling

### Case 1: No Lorebook Attached

**Scenario:** Chat has no lorebook attached

**Behavior:**
- Skip lorebook cloning step
- Record `cloned_lorebook_name: null` in state
- Checkpoint creation proceeds normally
- Checkpoint has no lorebook (valid state)

**Code:**
```javascript
const originalLorebook = getAttachedLorebookName();

if (!originalLorebook) {
  debug('No lorebook attached, skipping cloning');
  clonedLorebook = null;
} else {
  clonedLorebook = await cloneLorebook(originalLorebook, checkpointName);
  if (!clonedLorebook) {
    return null; // Abort
  }
}
```

### Case 2: Lorebook Clone Fails

**Scenario:** Cloning process encounters error (disk full, permission denied, etc.)

**Behavior:**
- Show clear error message to user
- **ABORT** checkpoint creation
- Do NOT create checkpoint with shared lorebook
- Clean up any partially created files

**Code:**
```javascript
const clonedLorebook = await cloneLorebook(originalLorebook, checkpointName);

if (!clonedLorebook) {
  toastr.error(
    'Failed to clone lorebook for checkpoint isolation. ' +
    'Checkpoint creation aborted to prevent data corruption.',
    'Checkpoint Failed',
    { timeOut: 10000 }
  );
  return null; // Hard abort
}
```

### Case 3: Old Checkpoints (No State)

**Scenario:** Loading checkpoint created before this feature was implemented

**Behavior:**
- `chat_metadata.auto_recap_checkpoint_state` is undefined
- Skip state restoration
- Still load checkpoint (legacy behavior)
- Show warning about no isolation guarantee

**Code:**
```javascript
if (chat_metadata.main_chat) {
  const checkpointState = chat_metadata.auto_recap_checkpoint_state;

  if (checkpointState) {
    await restoreCheckpointState(checkpointState);
  } else {
    debug('Legacy checkpoint detected (no state metadata)');
    toastr.warning(
      'This checkpoint was created before full isolation support. ' +
      'It may share data with the main timeline.',
      'Legacy Checkpoint',
      { timeOut: 5000 }
    );
  }
}
```

### Case 4: Checkpoint Deletion

**Scenario:** User deletes checkpoint chat

**Behavior:**
- Checkpoint chat file is deleted by ST
- Cloned lorebook becomes **orphaned** (no chat references it)
- Orphaned lorebook is NOT automatically deleted
- User can manually delete from World Info UI if desired

**Rationale:**
- Safe default: Don't delete data automatically
- User may want to recover checkpoint
- Orphaned lorebooks are harmless (just take disk space)

**Future enhancement (optional):**
- Add "Clean Up Orphaned Checkpoint Lorebooks" button in settings
- Scans for lorebooks matching `__CP_*` pattern
- Shows list with creation dates
- User selects which to delete

### Case 5: Queue Not Empty

**Scenario:** User tries to create checkpoint while queue is processing operations

**Behavior:**
- Hard block with clear error message
- Show list of pending operations
- Tell user to wait for queue to finish

**Error message:**
```
Cannot create checkpoint:

• Operation queue has 3 pending operations

Pending operations:
  1. GENERATE_SCENE_RECAP (message 38)
  2. UPDATE_REGISTRY (entity: "Alice")
  3. COMBINE_SCENE_WITH_RUNNING (scene 5)

Action: Wait for queue to finish processing, then try again.
```

### Case 6: Not a Scene Break

**Scenario:** User tries to create checkpoint on regular message (not scene break)

**Behavior:**
- Hard block with clear error message
- Tell user to mark as scene break first

**Error message:**
```
Cannot create checkpoint:

• Message 42 is not a scene break

Only scene breaks can be checkpointed because they represent complete narrative units.

Action: Mark this message as a scene break using the clapperboard button (🎬), then try again.
```

### Case 7: No Scene Recap

**Scenario:** Scene break exists but has no generated recap

**Behavior:**
- Hard block with clear error message
- Tell user to generate scene recap

**Error message:**
```
Cannot create checkpoint:

• Scene break has no recap

Checkpoint requires a complete scene recap to ensure full narrative context is captured.

Action:
  1. Click the scene break panel to expand it
  2. Click the "Generate" button to create scene recap
  3. Wait for generation to complete
  4. Try creating checkpoint again
```

### Case 8: No Running Recap

**Scenario:** No running scene recap exists

**Behavior:**
- Hard block with clear error message
- Tell user to generate running recap

**Error message:**
```
Cannot create checkpoint:

• No running scene recap exists

Running recap provides the complete narrative summary needed for correct checkpoint state.

Action:
  1. Open extension settings
  2. Navigate to "Running Scene Recap" section
  3. Click "Generate Running Recap" button
  4. Wait for generation to complete
  5. Try creating checkpoint again
```

### Case 9: Running Recap Version Not Found

**Scenario:** Checkpoint state references running recap version that doesn't exist in checkpoint

**Behavior:**
- Log error message
- Show warning to user
- Use latest available version as fallback

**Code:**
```javascript
const versionExists = runningRecap.versions.some(
  v => v.version === state.running_recap_version
);

if (versionExists) {
  runningRecap.current_version = state.running_recap_version;
} else {
  error(`Running recap version ${state.running_recap_version} not found`);
  error(`Available: ${runningRecap.versions.map(v => v.version).join(', ')}`);

  // Fallback to latest
  runningRecap.current_version = Math.max(...runningRecap.versions.map(v => v.version));

  toastr.warning(
    `Checkpoint's running recap version not found. Using latest available version.`,
    'Checkpoint Warning'
  );
}
```

### Case 10: Lorebook Reference Mismatch

**Scenario:** Checkpoint metadata says lorebook should be "A" but actually attached lorebook is "B"

**Behavior:**
- Log warning message
- Use whatever is attached (trust current state)
- Show diagnostic info in console

**Code:**
```javascript
const currentLorebook = chat_metadata.world_info;
const expectedLorebook = checkpointState.cloned_lorebook_name;

if (currentLorebook !== expectedLorebook) {
  warn(
    `Lorebook mismatch detected:\n` +
    `  Expected: "${expectedLorebook}"\n` +
    `  Current: "${currentLorebook}"\n` +
    `This may indicate the checkpoint was manually modified or the lorebook was deleted.`
  );

  // Still proceed with current lorebook
  debug(`Using current lorebook: "${currentLorebook}"`);
}
```

---

## User Experience

### Success Flow

**User creates valid checkpoint:**

```
User: /checkpoint-create Important Scene

Extension:
  [1/4] Validating requirements...
    ✓ Operation queue is empty
    ✓ Message is a scene break
    ✓ Scene has recap
    ✓ Running scene recap exists

  [2/4] Cloning lorebook...
    Source: "z-AutoLB-main123"
    Clone: "z-AutoLB-main123__CP_Important_Scene_-_2025-01-12_14-30-00"
    Copied 47 entries, filtered 3 internal entries
    ✓ Lorebook cloned successfully

  [3/4] Recording checkpoint state...
    ✓ Running recap version: 5 (10 scenes)
    ✓ Scene: "Important Scene" at message 42

  [4/4] Creating checkpoint...
    ✓ Checkpoint created: "Important Scene - 2025-01-12 14:30:00"

Toast (success):
  "Checkpoint created: Important Scene - 2025-01-12 14:30:00"
```

### Failure Flow (Multiple Errors)

**User tries to create checkpoint on incomplete state:**

```
User: /checkpoint-create Test

Extension:
  [1/4] Validating requirements...
    ✗ Operation queue has 2 pending operations
    ✓ Message is a scene break
    ✗ Scene has no recap
    ✓ Running scene recap exists

  Validation failed. Checkpoint creation blocked.

Popup (error):
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Cannot Create Checkpoint
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  The following requirements must be met:

  1. Operation queue is not empty
     Queue has 2 pending operations:
       • GENERATE_SCENE_RECAP (message 38)
       • UPDATE_REGISTRY (entity: "Castle")

     → Wait for all operations to complete

  2. Scene has no recap
     Checkpoint requires a complete scene recap
     to ensure full narrative context.

     → Generate scene recap first:
       1. Expand scene break panel
       2. Click "Generate" button
       3. Wait for completion

  [Close]
```

### Loading Checkpoint

**User switches to checkpoint:**

```
User clicks checkpoint chat in sidebar

SillyTavern loads checkpoint...

Extension (CHAT_CHANGED event):
  [1/3] Detected checkpoint load
    Main chat: "Main Story"
    Checkpoint: "Important Scene - 2025-01-12 14:30:00"

  [2/3] Loading checkpoint state...
    ✓ Cloned lorebook attached: "z-AutoLB-main123__CP_Important_Scene..."
    ✓ Restored running recap to version 5 (10 scenes)

  [3/3] Refreshing memory injection...
    ✓ Memory updated to use checkpoint state

Toast (info, 5s):
  Checkpoint Loaded
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Scene: Important Scene
  Running Recap: version 5 (10 scenes)
  Created: 1/12/2025, 2:30:00 PM
```

### Diagnostic Command

**User checks checkpoint status:**

```
User: /recap-checkpoint-status

Console:
  === CHECKPOINT STATUS ===
  {
    "is_checkpoint": true,
    "main_chat": "Main Story",
    "current_chat": "Important Scene - 2025-01-12 14:30:00",
    "checkpoint_state": {
      "timestamp": 1736697000000,
      "message_id": 42,
      "queue_was_empty": true,
      "has_scene_break": true,
      "has_scene_recap": true,
      "has_running_recap": true,
      "cloned_lorebook_name": "z-AutoLB-main123__CP_Important_Scene...",
      "original_lorebook_name": "z-AutoLB-main123",
      "running_recap_version": 5,
      "running_recap_scene_count": 10,
      "scene_break_name": "Important Scene"
    },
    "current_lorebook": "z-AutoLB-main123__CP_Important_Scene...",
    "lorebook_match": true,
    "running_recap_current_version": 5,
    "running_recap_version_match": true
  }

Toast (success):
  "Checkpoint state valid. All checks passed."
```

### Visual Indicators

**Checkpoint-ready messages:**

```
Message 42 (scene break with complete recaps):
  🎬 Important Scene
  [Summary of scene...]

  Action buttons:
    🏴 [Create Checkpoint] ← GREEN (checkpoint-ready)
    🌿 [Create Branch]     ← GREEN (checkpoint-ready)

  Hover tooltip:
    "Create checkpoint (ready ✓)"
```

**Checkpoint-blocked messages:**

```
Message 43 (scene break but no recap):
  🎬 Another Scene
  [Scene content...]

  Action buttons:
    🏴 [Create Checkpoint] ← GRAY/DIMMED (blocked)
    🌿 [Create Branch]     ← GRAY/DIMMED (blocked)

  Hover tooltip:
    "Checkpoint blocked: NO_SCENE_RECAP"
```

---

## Testing Strategy

### Unit Tests

**File: `checkpointValidator.spec.js`**

Test each validation function:
```javascript
describe('checkpointValidator', () => {
  describe('isQueueEmpty', () => {
    it('returns true when queue is empty', () => {
      // Setup: empty queue
      // Assert: isQueueEmpty() === true
    });

    it('returns false when queue has pending operations', () => {
      // Setup: queue with 2 pending operations
      // Assert: isQueueEmpty() === false
    });
  });

  describe('hasSceneBreak', () => {
    it('returns true when message is visible scene break', () => {
      // Setup: message with scene_break=true, scene_break_visible=true
      // Assert: hasSceneBreak(index) === true
    });

    it('returns false when message is hidden scene break', () => {
      // Setup: message with scene_break=true, scene_break_visible=false
      // Assert: hasSceneBreak(index) === false
    });

    it('returns false when message is not scene break', () => {
      // Setup: regular message
      // Assert: hasSceneBreak(index) === false
    });
  });

  // Similar tests for hasSceneRecap, hasValidRunningRecap

  describe('validateCheckpointRequirements', () => {
    it('returns valid=true when all requirements met', () => {
      // Setup: all requirements pass
      // Assert: result.valid === true, result.errors.length === 0
    });

    it('returns errors when queue not empty', () => {
      // Setup: queue has 2 operations
      // Assert: result.valid === false, result.errors includes QUEUE_NOT_EMPTY
    });

    it('returns multiple errors when multiple requirements fail', () => {
      // Setup: queue not empty, no scene recap
      // Assert: result.errors.length === 2
    });
  });
});
```

**File: `lorebookCloner.spec.js`**

Test cloning logic:
```javascript
describe('lorebookCloner', () => {
  describe('generateCheckpointLorebookName', () => {
    it('generates name with __CP_ prefix', () => {
      const result = generateCheckpointLorebookName('z-AutoLB-main', 'Test');
      expect(result).toBe('z-AutoLB-main__CP_Test');
    });

    it('sanitizes special characters', () => {
      const result = generateCheckpointLorebookName('z-AutoLB-main', 'Test #5!');
      expect(result).toBe('z-AutoLB-main__CP_Test_5');
    });

    it('limits length to 50 characters', () => {
      const longName = 'A'.repeat(100);
      const result = generateCheckpointLorebookName('z-AutoLB-main', longName);
      expect(result.length).toBeLessThanOrEqual(65); // base + __CP_ + 50
    });
  });

  describe('isInternalEntry', () => {
    it('returns true for queue entry', () => {
      expect(isInternalEntry('__operation_queue')).toBe(true);
    });

    it('returns true for registry entry', () => {
      expect(isInternalEntry('_registry_character')).toBe(true);
    });

    it('returns false for user entry', () => {
      expect(isInternalEntry('My Character')).toBe(false);
    });
  });

  describe('cloneLorebook', () => {
    it('creates cloned lorebook with user entries', async () => {
      // Setup: source lorebook with 5 user entries, 2 internal entries
      // Execute: cloneLorebook(source, 'Test')
      // Assert: cloned lorebook created, has 5 entries (internal filtered)
    });

    it('returns null if source lorebook not found', async () => {
      // Setup: non-existent source
      // Execute: cloneLorebook('nonexistent', 'Test')
      // Assert: returns null
    });

    it('deep clones entries (no shared references)', async () => {
      // Setup: source with entry
      // Execute: clone lorebook
      // Modify cloned entry
      // Assert: source entry unchanged
    });
  });
});
```

**File: `checkpointManager.spec.js`**

Test orchestration:
```javascript
describe('checkpointManager', () => {
  describe('createValidatedCheckpoint', () => {
    it('blocks when validation fails', async () => {
      // Setup: queue not empty
      // Execute: createValidatedCheckpoint(42, 'Test')
      // Assert: returns null, no checkpoint created
    });

    it('aborts when lorebook clone fails', async () => {
      // Setup: all valid, but clone will fail
      // Execute: createValidatedCheckpoint(42, 'Test')
      // Assert: returns null, no checkpoint created
    });

    it('creates checkpoint with cloned lorebook when valid', async () => {
      // Setup: all requirements met
      // Execute: createValidatedCheckpoint(42, 'Test')
      // Assert: checkpoint created, has cloned lorebook, state recorded
    });

    it('restores main chat state after creation', async () => {
      // Setup: original lorebook "A"
      // Execute: createValidatedCheckpoint (clones to "B")
      // Assert: main chat still has lorebook "A"
    });
  });

  describe('restoreCheckpointState', () => {
    it('restores running recap version', async () => {
      // Setup: state with version 3, current version is 5
      // Execute: restoreCheckpointState(state)
      // Assert: current version changed to 3
    });

    it('logs warning if version not found', async () => {
      // Setup: state references non-existent version
      // Execute: restoreCheckpointState(state)
      // Assert: warning logged, fallback used
    });
  });
});
```

### E2E Tests

**File: `tests/features/checkpoint-validation-blocking.spec.js`**

Test validation blocking:
```javascript
test('blocks checkpoint when queue not empty', async ({ page }) => {
  // 1. Navigate to chat
  // 2. Queue operation (scene recap generation)
  // 3. Try to create checkpoint while queue active
  // 4. Verify: error message shown
  // 5. Verify: checkpoint not created
});

test('blocks checkpoint when not scene break', async ({ page }) => {
  // 1. Navigate to chat
  // 2. Select regular message (not scene break)
  // 3. Try to create checkpoint
  // 4. Verify: error about no scene break
  // 5. Verify: checkpoint not created
});

test('allows checkpoint when all requirements met', async ({ page }) => {
  // 1. Navigate to chat
  // 2. Create scene break with recap
  // 3. Generate running recap
  // 4. Wait for queue to finish
  // 5. Create checkpoint
  // 6. Verify: checkpoint created successfully
});
```

**File: `tests/features/checkpoint-lorebook-isolation.spec.js`**

Test lorebook isolation:
```javascript
test('checkpoint has cloned lorebook', async ({ page }) => {
  // 1. Create valid checkpoint
  // 2. Check checkpoint's chat_metadata
  // 3. Verify: world_info ends with __CP_{name}
  // 4. Verify: cloned lorebook file exists
  // 5. Verify: main chat still has original lorebook
});

test('main timeline operations do not affect checkpoint', async ({ page }) => {
  // 1. Create checkpoint
  // 2. Continue main chat
  // 3. Add operation to main's queue (via lorebook)
  // 4. Switch to checkpoint
  // 5. Verify: checkpoint queue is empty (doesn't see main's operation)
});

test('checkpoint operations do not affect main', async ({ page }) => {
  // 1. Create checkpoint
  // 2. Switch to checkpoint
  // 3. Add operation to checkpoint's queue
  // 4. Switch back to main
  // 5. Verify: main queue doesn't have checkpoint's operation
});

test('branches are independent', async ({ page }) => {
  // 1. Create branch A at message 50
  // 2. Create branch B at message 50
  // 3. In branch A: add operation
  // 4. In branch B: verify doesn't see branch A's operation
  // 5. In main: verify doesn't see either branch's operations
});
```

**File: `tests/features/checkpoint-state-restoration.spec.js`**

Test state restoration:
```javascript
test('restores correct running recap version', async ({ page }) => {
  // 1. Main chat has running recap v5
  // 2. Create checkpoint (records v5)
  // 3. Main chat updates to v7
  // 4. Switch to checkpoint
  // 5. Verify: checkpoint uses v5 (not v7)
});

test('shows checkpoint info on load', async ({ page }) => {
  // 1. Create checkpoint
  // 2. Switch away
  // 3. Switch back to checkpoint
  // 4. Verify: notification shown with checkpoint info
  // 5. Verify: shows scene name, running recap version, creation date
});

test('handles legacy checkpoints gracefully', async ({ page }) => {
  // 1. Load checkpoint created before this feature
  // 2. Verify: no error
  // 3. Verify: warning shown about no isolation
  // 4. Verify: checkpoint still works
});
```

### Manual Testing Checklist

**Validation:**
- [ ] Try creating checkpoint with queue active → blocked
- [ ] Try creating checkpoint on non-scene-break → blocked
- [ ] Try creating checkpoint without scene recap → blocked
- [ ] Try creating checkpoint without running recap → blocked
- [ ] Create valid checkpoint → succeeds

**Cloning:**
- [ ] Checkpoint has unique cloned lorebook name
- [ ] Cloned lorebook contains user entries
- [ ] Cloned lorebook does NOT contain internal entries
- [ ] Main chat still has original lorebook

**Isolation:**
- [ ] Add operation in main → checkpoint doesn't see it
- [ ] Add operation in checkpoint → main doesn't see it
- [ ] Create two branches → they don't see each other's data
- [ ] Registry updates in one timeline don't affect others

**State:**
- [ ] Checkpoint records correct running recap version
- [ ] Checkpoint records scene info
- [ ] Loading checkpoint restores correct running recap version
- [ ] Memory injection uses correct checkpoint state

**Edge Cases:**
- [ ] Checkpoint with no lorebook attached → works
- [ ] Lorebook clone fails → checkpoint aborted
- [ ] Old checkpoint (no state) → shows warning, still loads
- [ ] Checkpoint deletion → cloned lorebook orphaned (safe)

---

## Conclusion

This complete solution provides **robust, reliable checkpoint and branch support** through:

1. **Strict validation** - Only checkpoints at stable, complete states
2. **Lorebook isolation** - Each checkpoint has independent lorebook copy
3. **State preservation** - Full point-in-time snapshot of narrative context
4. **Graceful error handling** - All edge cases covered with clear messaging
5. **Comprehensive testing** - Unit, E2E, and manual tests ensure correctness

**Key Benefits:**

- ✅ **No data contamination** - Complete isolation between timelines
- ✅ **No data loss** - Main and checkpoint timelines independent
- ✅ **Correct point-in-time** - Running recap version matches checkpoint
- ✅ **User-friendly** - Clear validation errors, helpful guidance
- ✅ **Safe** - Hard blocks prevent invalid checkpoints

**Implementation Status:** Documented, ready for implementation

**Estimated Effort:** 25-32 hours (3-4 days)

---

## See Also

- [DATA_STORAGE_INVENTORY.md](DATA_STORAGE_INVENTORY.md) - Complete storage inventory
- [CHECKPOINT_BRANCH_BEHAVIOR.md](CHECKPOINT_BRANCH_BEHAVIOR.md) - SillyTavern checkpoint mechanics
- [RUNNING_SCENE_RECAP.md](RUNNING_SCENE_RECAP.md) - Running scene recap system
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Troubleshooting guide

# Checkpoint Lorebook Management - Complete Specification

**Date:** 2025-01-12 (Updated after verification)
**Status:** ✅ VERIFIED - Simpler than originally thought
**Priority:** 🔴 CRITICAL - Core mechanism for checkpoint isolation

---

## Executive Summary

**VERIFICATION RESULTS:**

After complete code analysis (see CHECKPOINT_VERIFICATION_RESULTS.md and CHECKPOINT_CRITICAL_GAP.md), verified that:

**Checkpoint lorebook isolation works AUTOMATICALLY** via `chat_metadata.world_info` value changes.

**What Actually Happens:**
1. Extension always reads lorebook name from `chat_metadata.world_info`
2. Different chat files have different `chat_metadata.world_info` values
3. Extension automatically reads from different lorebooks based on that value
4. NO explicit "lorebook switching" or "force reload" needed
5. `loadWorldInfo(name)` is a fetch function (by name), not a "make active" function
6. Checkpoint isolation happens automatically without explicit loading logic

**What Still Needs Implementation:**
1. Clone lorebook FILE when creating checkpoint
2. Temporarily swap `chat_metadata.world_info` before creating checkpoint
3. Restore original value after checkpoint created
4. Track checkpoint→lorebook mappings for cleanup
5. Validate lorebook existence, offer repair if missing
6. Handle branches reactively (ST creates them with shared reference)

---

## SillyTavern Lorebook System - How It Actually Works

### Storage Model

**Lorebook Files:**
- Location: `data/worlds/`
- Format: JSON files containing entries and settings
- Named: `{lorebook-name}.json`

**Chat Reference:**
- Location: `chat_metadata.world_info`
- Type: `string` (lorebook name, NOT file path, NOT loaded data)
- Meaning: "Name of lorebook this chat uses"
- Replaces completely when chat loads (chat_metadata completely replaced)

### `loadWorldInfo(name)` Function

**What it does:**
```javascript
export async function loadWorldInfo(name) {
    if (!name) return;

    // Check cache
    if (worldInfoCache.has(name)) {
        return worldInfoCache.get(name);
    }

    // Fetch from server by NAME
    const response = await fetch('/api/worldinfo/get', {
        method: 'POST',
        body: JSON.stringify({ name: name }),
    });

    const data = await response.json();
    worldInfoCache.set(name, data);  // Cache result
    return data;
}
```

**Key characteristics:**
1. **Pure fetch function** - takes name, returns data object
2. **No global state changes** (except cache for performance)
3. **NOT a "make active" or "switch to" function**
4. Each call fetches data for the specified NAME
5. Different name → different data → automatic isolation

### How Extension Uses Lorebooks

**Extension pattern everywhere:**
```javascript
// 1. Get lorebook name from chat_metadata
function getAttachedLorebook() {
    return chat_metadata?.world_info;
}

// 2. Fetch data for that lorebook by name
const lorebookName = getAttachedLorebook();
const worldInfo = await loadWorldInfo(lorebookName);

// 3. Read/write data in that lorebook
const queueEntry = worldInfo.entries.find(e => e.comment === '__operation_queue');
```

**Example with automatic isolation:**
```javascript
// Main chat loaded
// chat_metadata.world_info = 'main-lorebook'
getAttachedLorebook() → 'main-lorebook'
loadWorldInfo('main-lorebook') → { entries: { /* main queue */ } }
// ✅ Extension reads main chat's queue

// User loads checkpoint
// chat_metadata.world_info = 'checkpoint-lorebook-clone'  (from checkpoint file)
getAttachedLorebook() → 'checkpoint-lorebook-clone'
loadWorldInfo('checkpoint-lorebook-clone') → { entries: { /* checkpoint queue */ } }
// ✅ Extension reads checkpoint's queue

// Different chat_metadata.world_info → different name → different data → isolation
```

### Why There's No "Currently Loaded" State

**WRONG MODEL (what we originally thought):**
```javascript
// Global singleton:
let currentlyLoadedLorebook = 'some-lorebook';

// Need to explicitly switch:
function switchLorebook(newName) {
    currentlyLoadedLorebook = newName;
    // ... update global state ...
}
```

**ACTUAL MODEL (verified):**
```javascript
// NO global "currently loaded" singleton exists

// Each operation fetches by name:
const data1 = await loadWorldInfo('lorebook-A');  // Returns A's data
const data2 = await loadWorldInfo('lorebook-B');  // Returns B's data

// Different name parameter → different returned data
// No "switching" or "activation" needed
```

---

## The Complete Lifecycle (Simplified)

### Phase 1: Checkpoint Creation

```javascript
async function createCheckpoint(mesId, checkpointName) {
  // === STATE AT START ===
  // chat_metadata.world_info: 'main-lorebook'
  // Extension operations read from chat_metadata.world_info

  // 1. Clone lorebook (creates FILE on disk with new name)
  const originalLB = chat_metadata.world_info; // 'main-lorebook'
  const clonedLB = await cloneLorebook(originalLB, checkpointName);
  // Creates: 'main-lorebook_checkpoint_{name}_{timestamp}.json'

  // === STATE AFTER CLONE ===
  // File on disk: cloned lorebook file created (new name)
  // chat_metadata.world_info: 'main-lorebook' (UNCHANGED)
  // Extension operations continue reading from chat_metadata.world_info

  // 2. Temporarily update chat_metadata for save
  chat_metadata.world_info = clonedLB;

  // === STATE AFTER METADATA UPDATE ===
  // chat_metadata.world_info: clonedLB (temporary change)
  // Subsequent extension operations would now read from clonedLB
  // (but we immediately create checkpoint, so minimal risk)

  // 3. Create checkpoint (saves chat file with updated metadata)
  await createNewBookmark(mesId, { forceName: checkpointName });
  // Checkpoint file now contains: { world_info: clonedLB, main_chat: 'main-id', ... }

  // === STATE AFTER CHECKPOINT CREATION ===
  // chat_metadata.world_info: clonedLB (from temp change)
  // Checkpoint file on disk: { world_info: clonedLB }
  // Main chat still active in UI

  // 4. Restore original metadata for main chat
  chat_metadata.world_info = originalLB;
  await saveChat(); // Save main chat with original lorebook name

  // === STATE AFTER RESTORE ===
  // chat_metadata.world_info: 'main-lorebook' (restored)
  // Main chat file on disk: { world_info: 'main-lorebook' }
  // Checkpoint file on disk: { world_info: clonedLB }
  // Extension operations continue reading from 'main-lorebook'

  // === CRITICAL POINTS ===
  // - Main chat continues using original lorebook throughout
  // - Cloned lorebook file exists on disk with different name
  // - Checkpoint file has cloned lorebook name in metadata
  // - No explicit "switching" needed - isolation is automatic via metadata values
}
```

### Phase 2: Checkpoint Loading (User Switches TO Checkpoint)

```javascript
// === BEFORE: User on Main Chat ===
// chat_metadata.world_info: 'main-lorebook'
// Extension operations read from: 'main-lorebook'

// User clicks "Load Checkpoint"
// SillyTavern's getChat() loads checkpoint file from disk

// === AFTER getChat(), BEFORE CHAT_CHANGED ===
// chat_metadata completely REPLACED: { world_info: clonedLB, main_chat: 'main-id', ... }
// chat_metadata.world_info: clonedLB (NEW VALUE from checkpoint file)

// CHAT_CHANGED event fires
eventSource.on(event_types.CHAT_CHANGED, async () => {
  // Extension's handler (handleChatChanged in eventHandlers.js)

  // Reload extension state
  await reloadQueue();

  // Inside reloadQueue() → loadQueue() → getQueueEntry() → getAttachedLorebook():
  const lorebookName = chat_metadata.world_info;  // Returns: clonedLB
  const worldInfo = await loadWorldInfo(lorebookName);  // Fetches: clonedLB data
  const queueEntry = worldInfo.entries.find(e => e.comment === '__operation_queue');
  // ✅ Reads from CLONED lorebook automatically

  // Validate checkpoint state (if this is our checkpoint)
  if (chat_metadata.auto_recap_checkpoint_state) {
    await validateCheckpointState(chat_metadata.auto_recap_checkpoint_state);
  }
});

// === AFTER CHAT_CHANGED HANDLER ===
// chat_metadata.world_info: clonedLB
// Extension operations read from: clonedLB (automatically via chat_metadata.world_info)
// ✅ COMPLETE ISOLATION ACHIEVED - NO EXPLICIT LOADING NEEDED
```

### Phase 3: Switching Back to Main Chat

```javascript
// === BEFORE: User on Checkpoint ===
// chat_metadata.world_info: clonedLB
// Extension operations read from: clonedLB

// User clicks "Back to Main Chat"
// SillyTavern's getChat() loads main chat file from disk

// === AFTER getChat(), BEFORE CHAT_CHANGED ===
// chat_metadata completely REPLACED: { world_info: 'main-lorebook', ... }
// chat_metadata.world_info: 'main-lorebook' (NEW VALUE from main chat file)

// CHAT_CHANGED event fires
eventSource.on(event_types.CHAT_CHANGED, async () => {
  // Extension's handler automatically runs

  // Reload extension state
  await reloadQueue();

  // Inside reloadQueue() → loadQueue() → getQueueEntry() → getAttachedLorebook():
  const lorebookName = chat_metadata.world_info;  // Returns: 'main-lorebook'
  const worldInfo = await loadWorldInfo(lorebookName);  // Fetches: main-lorebook data
  const queueEntry = worldInfo.entries.find(e => e.comment === '__operation_queue');
  // ✅ Reads from MAIN lorebook automatically
});

// === AFTER CHAT_CHANGED HANDLER ===
// chat_metadata.world_info: 'main-lorebook'
// Extension operations read from: 'main-lorebook' (automatically)
// ✅ BACK TO MAIN STATE, NO CONTAMINATION, NO EXPLICIT SWITCHING NEEDED
```

### Phase 4: Checkpoint Deletion / Cleanup

```javascript
// User deletes checkpoint from SillyTavern UI
// SillyTavern deletes checkpoint chat file
// BUT: Cloned lorebook file STILL EXISTS on disk

// We need to hook into checkpoint deletion
// (Requires listening to ST events or polling)

async function onCheckpointDeleted(checkpointChatName) {
  // 1. Load checkpoint metadata to find cloned lorebook name
  // (This might require us to cache checkpoint -> lorebook mappings)
  const clonedLB = await getClonedLorebookName(checkpointChatName);

  if (!clonedLB) return; // Not our checkpoint or already cleaned

  // 2. Safety check: Don't delete if it's the currently active lorebook
  if (clonedLB === chat_metadata.world_info) {
    warn('Not deleting lorebook - currently in use by active chat');
    return;
  }

  // 3. Check if any other checkpoints use this lorebook
  const otherCheckpointsUsingLB = await findCheckpointsUsingLorebook(clonedLB);
  if (otherCheckpointsUsingLB.length > 0) {
    debug('Not deleting lorebook - used by other checkpoints');
    return;
  }

  // 4. Safe to delete cloned lorebook
  await deleteWorldInfo(clonedLB);
  log(`Cleaned up cloned lorebook: ${clonedLB}`);
}
```

---

## Critical Implementation Requirements

### Requirement 1: Explicit Lorebook Switching

**MUST DO:**
```javascript
eventSource.on(event_types.CHAT_CHANGED, async () => {
  const expectedLB = chat_metadata.world_info;

  if (expectedLB) {
    // ALWAYS explicitly load the expected lorebook
    await loadWorldInfo(expectedLB);
  }

  // Then reload extension state
  await reloadQueue();
  await validateCheckpointState();
});
```

**WHY:**
- SillyTavern does NOT automatically switch lorebooks
- Without this, checkpoint loads with WRONG lorebook
- Extension reads/writes to wrong lorebook = contamination

### Requirement 2: Never Change Loaded Lorebook During Checkpoint Creation

**MUST NOT DO:**
```javascript
// ❌ WRONG
async function createCheckpoint(mesId, name) {
  const clonedLB = await cloneLorebook(...);
  await loadWorldInfo(clonedLB); // ❌ DON'T DO THIS
  await createNewBookmark(...);
  await loadWorldInfo(originalLB); // ❌ Switching back is confusing
}
```

**MUST DO:**
```javascript
// ✅ CORRECT
async function createCheckpoint(mesId, name) {
  const clonedLB = await cloneLorebook(...); // Creates file
  // Don't load it - just update metadata
  chat_metadata.world_info = clonedLB;
  await createNewBookmark(...);
  chat_metadata.world_info = originalLB;
  // Main chat still on original lorebook throughout
}
```

**WHY:**
- Main chat is still active during checkpoint creation
- Switching lorebooks mid-operation is confusing and error-prone
- Extension might be actively writing - don't pull the rug out
- Cloned lorebook not needed until checkpoint is loaded

### Requirement 3: Track Checkpoint-Lorebook Mappings

**Need to maintain:**
```javascript
// In chat_metadata or persistent storage
{
  checkpoint_lorebook_mappings: {
    'User__Character__2024-01-01__Checkpoint1': 'main-lorebook_checkpoint_Checkpoint1_1234567',
    'User__Character__2024-01-01__Checkpoint2': 'main-lorebook_checkpoint_Checkpoint2_7654321'
  }
}
```

**WHY:**
- Need to find cloned lorebook when checkpoint is deleted
- Can't load checkpoint file after it's deleted (chicken-and-egg)
- Need to prevent deleting lorebook used by other checkpoints

**Where to store:**
- Option A: In main chat's `chat_metadata.auto_recap.checkpoint_lorebook_map`
- Option B: Global extension storage (persists across chat switches)
- Option C: In each checkpoint's `chat_metadata` (requires loading checkpoint to delete)

**Recommended: Option A** - Store in main chat metadata, update when checkpoints created/deleted

### Requirement 4: Lorebook Existence Validation

**MUST CHECK:**
```javascript
async function validateCheckpointLorebook(expectedLB) {
  const exists = await checkLorebookExists(expectedLB);

  if (!exists) {
    error(`Checkpoint lorebook missing: ${expectedLB}`);

    // Offer repair
    const action = await callPopup(
      'Checkpoint lorebook is missing. Choose action:',
      'select',
      [
        'Create empty lorebook',
        'Clone from current lorebook',
        'Detach (remove lorebook reference)',
        'Cancel load'
      ]
    );

    switch (action) {
      case 'Create empty lorebook':
        await createNewWorldInfo(expectedLB);
        await loadWorldInfo(expectedLB);
        break;

      case 'Clone from current lorebook':
        const currentLB = chat_metadata.world_info;
        await cloneLorebook(currentLB, expectedLB);
        await loadWorldInfo(expectedLB);
        break;

      case 'Detach':
        chat_metadata.world_info = null;
        await saveChat();
        break;

      case 'Cancel load':
        throw new Error('Checkpoint load cancelled');
    }
  }
}
```

**WHY:**
- Cloned lorebook files can be manually deleted
- User might delete wrong lorebook file
- Checkpoint becomes unusable without repair option

### Requirement 5: Prevent Pollution During Rollback

**Scenario:**
```
1. User on main chat (v10, 50 messages)
2. Creates checkpoint at message 30 (v5)
3. Main continues to v15, 100 messages
4. User loads checkpoint
5. Adds messages in checkpoint (now v6, 35 messages)
6. User loads main again
```

**Problem if not careful:**
- Checkpoint's lorebook has v6 data (5 scenes)
- Main's lorebook has v15 data (10 scenes)
- If we mix them up, main gets checkpoint data or vice versa

**Solution:**
- ALWAYS explicitly load correct lorebook on EVERY chat switch
- NEVER merge lorebook data between timelines
- Each timeline's lorebook is immutable from other timeline's perspective

**Implementation:**
```javascript
eventSource.on(event_types.CHAT_CHANGED, async () => {
  const currentChatId = getCurrentChatId();
  const expectedLB = chat_metadata.world_info;

  // Track which chat we're switching to
  debug(`Chat switched to: ${currentChatId}`);
  debug(`Expected lorebook: ${expectedLB}`);

  // ALWAYS load expected lorebook, no matter what
  if (expectedLB) {
    await loadWorldInfo(expectedLB);
    debug(`Loaded lorebook: ${expectedLB}`);
  }

  // Verify loaded correctly
  const actualLB = getCurrentlyLoadedLorebook();
  if (actualLB !== expectedLB) {
    error(`Lorebook mismatch after switch: expected ${expectedLB}, got ${actualLB}`);
  }

  // Now safe to reload extension state
  await reloadQueue();
});
```

### Requirement 6: Handle Concurrent Checkpoint Creation

**Scenario:**
- User creates multiple checkpoints rapidly
- Each clones lorebook
- All happening while main chat is active

**Problem:**
- Multiple clone operations accessing same source lorebook
- Possible race conditions in file I/O
- Possible UID conflicts in cloned entries

**Solution:**
```javascript
let checkpointCreationLock = false;

async function createCheckpoint(mesId, name) {
  // Wait for any in-progress checkpoint creation
  while (checkpointCreationLock) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  checkpointCreationLock = true;
  try {
    // ... checkpoint creation logic ...
  } finally {
    checkpointCreationLock = false;
  }
}
```

---

## API Requirements

### APIs We MUST Use

**From SillyTavern world-info.js:**
```javascript
await loadWorldInfo(name)         // Load lorebook by name
await saveWorldInfo(name, data)   // Save lorebook data
await createNewWorldInfo(name)    // Create new lorebook
await deleteWorldInfo(name)       // Delete lorebook file
```

**From SillyTavern bookmarks.js:**
```javascript
await createNewBookmark(mesId, { forceName })  // Create checkpoint
```

**From SillyTavern script.js:**
```javascript
await saveChat(chatId, mesId, withMetadata)    // Save chat with metadata
getCurrentChatId()                              // Get current chat ID
```

### APIs We Need to CREATE

**Lorebook utility functions:**
```javascript
async function getCurrentlyLoadedLorebook() {
  // Get name of currently loaded lorebook
  // May need to check internal ST state
}

async function checkLorebookExists(name) {
  // Check if lorebook file exists on disk
  // Could use fetch to /api/worldinfo/get
}

function getClonedLorebookName(originalName, checkpointName) {
  // Generate unique name for cloned lorebook
  const timestamp = Date.now();
  return `${originalName}_checkpoint_${checkpointName}_${timestamp}`;
}
```

**Checkpoint tracking:**
```javascript
function addCheckpointLorebookMapping(checkpointChatId, lorebookName) {
  if (!chat_metadata.auto_recap) chat_metadata.auto_recap = {};
  if (!chat_metadata.auto_recap.checkpoint_lorebook_map) {
    chat_metadata.auto_recap.checkpoint_lorebook_map = {};
  }
  chat_metadata.auto_recap.checkpoint_lorebook_map[checkpointChatId] = lorebookName;
}

function getCheckpointLorebookMapping(checkpointChatId) {
  return chat_metadata.auto_recap?.checkpoint_lorebook_map?.[checkpointChatId];
}

function removeCheckpointLorebookMapping(checkpointChatId) {
  delete chat_metadata.auto_recap?.checkpoint_lorebook_map?.[checkpointChatId];
}

async function findCheckpointsUsingLorebook(lorebookName) {
  // Find all checkpoints that reference this lorebook
  const map = chat_metadata.auto_recap?.checkpoint_lorebook_map || {};
  return Object.entries(map)
    .filter(([chatId, lb]) => lb === lorebookName)
    .map(([chatId]) => chatId);
}
```

---

## Lorebook Cloning Implementation

### ⚠️ CRITICAL: UID Preservation Required

**UIDs are lorebook-unique, NOT globally unique.**

When cloning lorebooks for checkpoints, **UIDs MUST be preserved exactly** to maintain registry entry integrity.

**See [LOREBOOK_DUPLICATION_CORRECT_METHOD.md](LOREBOOK_DUPLICATION_CORRECT_METHOD.md) for the definitive specification.**

### Correct Cloning Method

```javascript
async function cloneLorebook(sourceLorebookName, checkpointName) {
  const sourceData = await loadWorldInfo(sourceLorebookName);
  if (!sourceData || !sourceData.entries) {
    throw new Error(`Failed to load source lorebook: ${sourceLorebookName}`);
  }

  const cloneName = getClonedLorebookName(sourceLorebookName, checkpointName);
  const created = await createNewWorldInfo(cloneName);
  if (!created) {
    throw new Error(`Failed to create cloned lorebook: ${cloneName}`);
  }

  const cloneData = await loadWorldInfo(cloneName);
  if (!cloneData.entries) {
    cloneData.entries = {};
  }

  // Copy ALL entries with ORIGINAL UIDs for complete point-in-time snapshot
  for (const [uid, entry] of Object.entries(sourceData.entries)) {
    if (!entry) continue;

    // Deep clone to avoid shared references
    cloneData.entries[uid] = JSON.parse(JSON.stringify(entry));
  }

  // Save cloned lorebook with all entries
  await saveWorldInfo(cloneName, cloneData, true);
  await invalidateLorebookCache(cloneName);

  // Verify registry integrity (code-based verification, NOT LLM)
  await verifyRegistryIntegrity(cloneName);

  // Reorder alphabetically if setting enabled
  await reorderLorebookEntriesAlphabetically(cloneName);

  return cloneName;
}
```

**Key Points:**
- ✅ Copy entries with ORIGINAL UIDs (not new UIDs)
- ✅ Copy ALL entries including `_registry_*` (complete snapshot)
- ✅ Verify registry UIDs match actual entries (code-based)
- ✅ NO LLM calls (instant, reliable, free)
- ✅ Reorder alphabetically at end if setting enabled

---

## Complete Flow - Step by Step

### Creating a Checkpoint

```javascript
async function createCheckpoint(mesId, checkpointName) {
  // 1. Validation
  await validateCheckpointRequirements(mesId);

  // 2. Clone lorebook (creates file, doesn't load)
  //    CRITICAL: Uses UID-preserving method (see above)
  const originalLB = chat_metadata.world_info;
  if (!originalLB) throw new Error('No lorebook attached');

  const clonedLB = await cloneLorebook(originalLB, checkpointName);

  // 3. Update metadata temporarily
  const originalMeta = chat_metadata.world_info;
  chat_metadata.world_info = clonedLB;

  // 4. Add checkpoint state metadata
  chat_metadata.auto_recap_checkpoint_state = captureState(mesId, clonedLB);

  // 5. Create checkpoint (saves with cloned lorebook name)
  await createNewBookmark(mesId, { forceName: checkpointName });

  // 6. Track mapping for cleanup later
  const checkpointChatId = generateCheckpointChatId(checkpointName);
  addCheckpointLorebookMapping(checkpointChatId, clonedLB);

  // 7. Restore original metadata
  chat_metadata.world_info = originalMeta;
  delete chat_metadata.auto_recap_checkpoint_state;

  // 8. Save main chat with restored metadata
  await saveChat();

  log(`Checkpoint created: ${checkpointName}`);
  log(`Cloned lorebook: ${clonedLB}`);
}
```

### Loading a Checkpoint

```javascript
eventSource.on(event_types.CHAT_CHANGED, async () => {
  try {
    const expectedLB = chat_metadata.world_info;

    // 1. Validate lorebook exists
    if (expectedLB) {
      const exists = await checkLorebookExists(expectedLB);
      if (!exists) {
        await handleMissingLorebook(expectedLB);
      }
    }

    // 2. Load expected lorebook
    if (expectedLB) {
      await loadWorldInfo(expectedLB);
      debug(`Switched to lorebook: ${expectedLB}`);
    }

    // 3. Reload extension state from correct lorebook
    await reloadQueue();
    debug('Queue reloaded from correct lorebook');

    // 4. Validate checkpoint state
    if (chat_metadata.auto_recap_checkpoint_state) {
      await validateCheckpointState(chat_metadata.auto_recap_checkpoint_state);
    }

  } catch (error) {
    console.error('Error handling chat change:', error);
    toastr.error(`Failed to load chat: ${error.message}`);
  }
});
```

### Deleting a Checkpoint

```javascript
// Listen for checkpoint deletion (if ST provides event)
// OR: Periodic cleanup check

async function checkpointCleanup() {
  const map = chat_metadata.auto_recap?.checkpoint_lorebook_map || {};

  for (const [checkpointChatId, lorebookName] of Object.entries(map)) {
    // Check if checkpoint chat file still exists
    const checkpointExists = await checkChatExists(checkpointChatId);

    if (!checkpointExists) {
      // Checkpoint deleted, clean up lorebook

      // Safety: Don't delete if currently active
      if (lorebookName === chat_metadata.world_info) {
        warn(`Not deleting ${lorebookName} - currently active`);
        continue;
      }

      // Safety: Check if other checkpoints use it
      const others = await findCheckpointsUsingLorebook(lorebookName);
      if (others.length > 1) {
        debug(`Not deleting ${lorebookName} - used by ${others.length} checkpoints`);
        continue;
      }

      // Safe to delete
      await deleteWorldInfo(lorebookName);
      removeCheckpointLorebookMapping(checkpointChatId);
      log(`Cleaned up lorebook: ${lorebookName}`);
    }
  }
}

// Run cleanup periodically or on checkpoint operations
setInterval(checkpointCleanup, 60000); // Every minute
```

---

## Testing Requirements

### Test 1: Lorebook Switching on Chat Load

**Setup:**
1. Create main chat with lorebook A
2. Create checkpoint (clones to lorebook B)

**Test:**
1. Load checkpoint
2. Verify `loadWorldInfo(B)` was called
3. Verify extension queue loaded from lorebook B
4. Add queue operation in checkpoint
5. Load main chat
6. Verify `loadWorldInfo(A)` was called
7. Verify extension queue loaded from lorebook A (no new operation)

**Expected:** Complete isolation, no contamination

### Test 2: Rapid Checkpoint Switching

**Setup:**
1. Create 3 checkpoints (CP1, CP2, CP3)

**Test:**
1. Load CP1 → verify lorebook CP1
2. Load CP2 → verify lorebook CP2
3. Load main → verify lorebook main
4. Load CP3 → verify lorebook CP3
5. Load CP1 → verify lorebook CP1

**Expected:** Each switch loads correct lorebook, no mixing

### Test 3: Missing Lorebook Recovery

**Setup:**
1. Create checkpoint with cloned lorebook
2. Manually delete cloned lorebook file

**Test:**
1. Load checkpoint
2. Verify error detected
3. Choose "Create empty lorebook"
4. Verify checkpoint loads successfully
5. Verify extension can operate (empty queue, etc.)

**Expected:** Graceful recovery, no crash

### Test 4: Checkpoint Cleanup

**Setup:**
1. Create checkpoint (clones lorebook)
2. Verify cloned lorebook file exists

**Test:**
1. Delete checkpoint from ST UI
2. Wait for cleanup check
3. Verify cloned lorebook file deleted
4. Verify mapping removed from main chat metadata

**Expected:** No orphaned lorebook files

### Test 5: Multiple Checkpoints Same Lorebook

**Setup:**
1. Create CP1 (clones to LB1)
2. Manually set CP2 to also use LB1 (edge case)

**Test:**
1. Delete CP1
2. Verify LB1 NOT deleted (still used by CP2)
3. Delete CP2
4. Verify LB1 now deleted

**Expected:** Ref-counting prevents premature deletion

---

## Summary of Changes from Original Design

### What Was WRONG ❌

1. **Assumed automatic lorebook switching** - ST doesn't do this
2. **No explicit `loadWorldInfo()` calls** - Required for switching
3. **No lorebook existence checking** - Crashes if file missing
4. **No checkpoint cleanup** - Orphaned lorebook files
5. **No tracking of checkpoint-lorebook mappings** - Can't clean up
6. **No handling of rapid switches** - Race conditions possible

### What Is NOW CORRECT ✅

1. **Explicit lorebook switching** - Call `loadWorldInfo()` on every CHAT_CHANGED
2. **Lorebook existence validation** - Check + repair options
3. **Checkpoint cleanup** - Delete cloned lorebooks when checkpoint deleted
4. **Mapping tracking** - Store checkpoint→lorebook in main chat metadata
5. **Locking** - Prevent concurrent checkpoint creation
6. **Complete lifecycle** - Creation, loading, switching, deletion all handled

### Estimated Additional Complexity

- **Original estimate:** 7-9 hours
- **Additional work for lorebook management:**
  - Explicit switching logic: +1 hour
  - Existence checking + repair: +1 hour
  - Cleanup logic: +1-2 hours
  - Mapping tracking: +0.5 hours
  - Testing: +2 hours
- **NEW estimate:** 12-15 hours

---

## Open Questions

1. **Does SillyTavern provide checkpoint deletion events?**
   - If yes, hook into those
   - If no, need periodic cleanup polling

2. **Can we get currently loaded lorebook name?**
   - Need to check ST internal state
   - May need to track ourselves

3. **What happens if loadWorldInfo() fails?**
   - Does it throw error?
   - Does it fail silently?
   - Need error handling strategy

4. **Are there lorebook caching issues?**
   - Does ST cache lorebook data?
   - Do we need to force reload?

These need verification before implementation.

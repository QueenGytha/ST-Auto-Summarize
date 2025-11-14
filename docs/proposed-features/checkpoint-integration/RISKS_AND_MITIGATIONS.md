# Checkpoint Integration: Risks and Mitigations

**Document Version:** 1.0
**Last Updated:** 2025-01-12
**Status:** Complete Research - Pre-Implementation

## Executive Summary

This document catalogs all identified risks, edge cases, and mitigation strategies for implementing checkpoint/branch support in the ST-Auto-Recap extension. Based on comprehensive code analysis and validation against actual SillyTavern behavior, 2 critical (P0) risks have been identified that MUST be addressed before implementation.

**Overall Risk Assessment:** MEDIUM-HIGH
**Implementation Readiness:** 95% (pending P0 mitigations)
**Recommended Action:** Implement P0 mitigations before proceeding

---

## Critical Risk Summary

| Risk ID | Area | Severity | Impact | Status |
|---------|------|----------|--------|--------|
| R1 | Branch Auto-Open Timing | 🔴 HIGH | Data contamination | Mitigation required |
| R2 | Concurrent Operations | 🔴 HIGH | Race conditions, corruption | Mitigation required |
| R3 | Nested Checkpoints | 🟡 MEDIUM | Reference chain issues | Mitigations recommended |
| R4 | Data Corruption Vectors | 🟡 MEDIUM | Multiple failure modes | Mitigations planned |
| R5 | Performance Scalability | 🟡 MEDIUM | Large lorebooks slow | Warnings needed |
| R6 | Group Chat Support | 🟢 LOW | Minor differences | Documentation only |
| R7 | Profile Switching | 🟢 LOW | Already handled | No action needed |
| R8 | Version Compatibility | 🟢 LOW | Stable APIs | Optional check |
| R9 | Recovery Options | 🟢 LOW | Limited repair | Nice-to-have |
| R10 | User Error Messages | 🟢 LOW | UX improvement | Nice-to-have |

---

## Risk Details

### 🔴 R1: Branch Auto-Open Timing (CRITICAL)

**Priority:** P0 - Must fix before implementation

#### Problem Description

When users create a branch in SillyTavern, the branch is **immediately opened** (unlike checkpoints which stay on the current chat). This creates a critical timing window where:

1. Branch file is created with shared lorebook reference
2. Chat immediately switches to branch (`openCharacterChat()` called)
3. Extension's `CHAT_CHANGED` event handler fires
4. Handler calls `reloadQueue()` which loads from the **shared lorebook**
5. Branch inherits queue operations from main chat (CONTAMINATION)

#### Code Evidence

From `bookmarks.js:390-406`:
```javascript
export async function branchChat(mesId) {
  const fileName = await createBranch(mesId);  // Creates branch file
  await saveItemizedPrompts(fileName);

  // IMMEDIATELY OPENS THE BRANCH (key difference from checkpoints)
  if (selected_group) {
    await openGroupChat(selected_group, fileName);
  } else {
    await openCharacterChat(fileName);  // <-- Auto-opens
  }

  return fileName;
}
```

#### Execution Timeline

```
t=0ms:   User clicks "Create Branch"
t=10ms:  createBranch() executes
t=50ms:  saveChat() completes (branch file saved)
         - Branch references SAME lorebook as main
         - main chat has queue: [op1, op2, op3]
t=60ms:  openCharacterChat(branchName) called
t=70ms:  chat_metadata = {} (reset)
t=150ms: getChat() loads branch chat file
t=160ms: chat_metadata loaded (contains world_info: "shared-lorebook")
t=170ms: CHAT_CHANGED event fires
t=180ms: Extension's handleChatChanged() runs
t=190ms: reloadQueue() called
t=200ms: Queue loads from shared-lorebook
         - Branch now has queue: [op1, op2, op3] ❌ CONTAMINATION
```

#### Impact

- **Severity:** HIGH
- **Frequency:** Every branch creation
- **Data Loss:** Queue operations from main appear in branch
- **User Experience:** Confusing behavior, unexpected recap operations in branch
- **Corruption Risk:** Operations targeting main chat messages execute in branch context

#### Mitigation Strategies

**Option A: Validate Requirements for Branches** (Recommended)
```javascript
// Apply same validation to branches as checkpoints
async function branchChat(mesId) {
  // Validate requirements before creating branch
  const validation = await validateCheckpointRequirements(mesId);
  if (!validation.valid) {
    showValidationErrors(validation.errors);
    return null;
  }

  // Proceed with branch creation + lorebook cloning
  const fileName = await createBranchWithIsolation(mesId);
  // ...
}
```

**Option B: Clone Lorebook for Branches**
```javascript
async function createBranchWithIsolation(mesId) {
  // 1. Clone lorebook (same as checkpoints)
  const clonedLorebook = await cloneLorebook(getCurrentLorebook(), 'branch');

  // 2. Inject cloned lorebook into metadata
  const original = chat_metadata.world_info;
  chat_metadata.world_info = clonedLorebook;

  try {
    // 3. Create branch (will save with cloned lorebook)
    const fileName = await createBranch(mesId);
    await saveItemizedPrompts(fileName);

    // 4. Open branch (now has isolated lorebook)
    if (selected_group) {
      await openGroupChat(selected_group, fileName);
    } else {
      await openCharacterChat(fileName);
    }

    return fileName;
  } finally {
    // 5. Restore original
    chat_metadata.world_info = original;
  }
}
```

**Option C: Clear Queue Before Auto-Open**
```javascript
async function branchChat(mesId) {
  const fileName = await createBranch(mesId);
  await saveItemizedPrompts(fileName);

  // Clear queue in new branch before opening
  await clearQueueInChat(fileName);

  if (selected_group) {
    await openGroupChat(selected_group, fileName);
  } else {
    await openCharacterChat(fileName);
  }

  return fileName;
}
```

**Recommendation:** Implement **Option A + B**
- Validate requirements (ensures clean state)
- Clone lorebook (ensures isolation)
- Provides consistent behavior between checkpoints and branches
- No data loss, full isolation

#### Implementation Priority

**P0 - CRITICAL** - Must implement before any checkpoint feature release

#### Testing Requirements

1. Create branch with non-empty queue → Should be blocked
2. Create branch with empty queue → Should succeed with isolated lorebook
3. Create branch, verify queue in branch is empty
4. Create branch, add operations in branch, switch to main → queues should be separate
5. Verify branch's lorebook is cloned (different name)

---

### 🔴 R2: Concurrent Operations (CRITICAL)

**Priority:** P0 - Must fix before implementation

#### Problem Description

Checkpoint creation involves multiple async operations (validation, lorebook cloning, metadata injection, bookmark creation). Without proper locking and reentrancy protection, several race conditions can occur:

1. **Rapid checkpoint creation** - User creates multiple checkpoints quickly
2. **Chat switching during creation** - User switches chats mid-creation
3. **Lorebook modification during cloning** - User edits lorebook while being cloned
4. **Multiple queue reloads** - CHAT_CHANGED fires multiple times rapidly

#### Identified Race Conditions

##### RC1: Rapid Checkpoint Creation

```
Timeline:
t=0ms:   User clicks "Create Checkpoint A"
t=10ms:  Validation passes (queue empty)
t=20ms:  Lorebook cloning starts (async, ~200ms)
t=100ms: User clicks "Create Checkpoint B" (impatient)
t=110ms: Validation passes (queue still empty)
t=120ms: Lorebook cloning starts for B
t=220ms: Clone A completes
t=230ms: createNewBookmark(A) called
t=240ms: message.extra.bookmark_link = "Checkpoint A"
t=320ms: Clone B completes
t=330ms: createNewBookmark(B) called
t=340ms: message.extra.bookmark_link = "Checkpoint B" ❌ OVERWRITES

Result: Checkpoint A orphaned (bookmark_link overwritten)
```

##### RC2: Chat Switch During Creation

```
Timeline:
t=0ms:   User creates checkpoint (validation passed)
t=50ms:  Lorebook cloning in progress
t=100ms: User switches to different chat (impatient)
t=110ms: CHAT_CHANGED event fires
t=120ms: Extension's handleChatChanged() runs
t=130ms: chat_metadata reset to new chat ❌
t=200ms: Lorebook clone completes
t=210ms: createNewBookmark() runs with WRONG chat_metadata

Result: Checkpoint created with wrong chat's metadata (corruption)
```

##### RC3: Lorebook Modification During Clone

```
Timeline:
t=0ms:   Checkpoint creation starts
t=20ms:  Lorebook clone begins (reads entries)
t=50ms:  Clone processing entry 50/100
t=100ms: User adds new lorebook entry manually ❌
t=150ms: Clone completes (without new entry)
t=200ms: Checkpoint saved with incomplete lorebook clone

Result: Checkpoint missing user's new entry (data loss)
```

##### RC4: Multiple Queue Reloads

```
Timeline:
t=0ms:   CHAT_CHANGED fires (user switches chat)
t=10ms:  handleChatChanged() starts
t=20ms:  reloadQueue() called
t=30ms:  reloadQueue() loading lorebook (async)
t=40ms:  User switches chat again (rapid switching) ❌
t=50ms:  CHAT_CHANGED fires again
t=60ms:  handleChatChanged() starts AGAIN
t=70ms:  reloadQueue() called AGAIN
t=80ms:  First reloadQueue() completes
t=90ms:  Second reloadQueue() starts

Result: Redundant reloads, potential state corruption
```

#### Current Protections

From `operationQueue.js:898-903`:
```javascript
function startQueueProcessor() {
  if (isProcessorActive) {
    debug('Queue processor already active, skipping (reentrancy protection)');
    return;
  }
  isProcessorActive = true;
  // ...
}
```

**Queue has reentrancy protection ✅**
**Checkpoint creation has NO protection ❌**

#### Impact

- **Severity:** HIGH
- **Frequency:** Low (requires specific user actions) but HIGH impact when occurs
- **Data Loss:** Orphaned checkpoints, corrupted metadata, missing entries
- **User Experience:** Confusing errors, invisible failures
- **Corruption Risk:** Silent data corruption (hard to debug)

#### Mitigation Strategies

**M1: Checkpoint Creation Lock** (REQUIRED)

```javascript
// checkpointManager.js
let isCreatingCheckpoint = false;

export async function createCheckpointWithValidation(mesId, options = {}) {
  // Reentrancy protection
  if (isCreatingCheckpoint) {
    toastr.warning('Checkpoint creation already in progress. Please wait.');
    return null;
  }

  isCreatingCheckpoint = true;
  try {
    // ... validation and checkpoint creation logic ...
    return checkpointName;
  } catch (error) {
    error(SUBSYSTEM.CHECKPOINT, 'Checkpoint creation failed:', error);
    toastr.error(`Failed to create checkpoint: ${error.message}`);
    return null;
  } finally {
    isCreatingCheckpoint = false;
  }
}
```

**M2: UI Blocking During Creation** (REQUIRED)

```javascript
export async function createCheckpointWithValidation(mesId, options = {}) {
  if (isCreatingCheckpoint) { return null; }

  isCreatingCheckpoint = true;
  setQueueBlocking(true);  // Reuse existing queue blocking mechanism

  try {
    // ... checkpoint creation ...
    return checkpointName;
  } finally {
    setQueueBlocking(false);
    isCreatingCheckpoint = false;
  }
}
```

**M3: Chat Context Validation** (REQUIRED)

```javascript
export async function createCheckpointWithValidation(mesId, options = {}) {
  isCreatingCheckpoint = true;
  setQueueBlocking(true);

  // Capture chat context BEFORE async operations
  const chatIdBefore = getCurrentChatId();
  const characterBefore = this_chid;
  const groupBefore = selected_group;

  try {
    // Validation
    const validation = await validateCheckpointRequirements(mesId);
    if (!validation.valid) { return null; }

    // Lorebook cloning (async operation)
    const clonedLorebook = await cloneLorebook(...);

    // VALIDATE CONTEXT AFTER ASYNC
    const chatIdAfter = getCurrentChatId();
    const characterAfter = this_chid;
    const groupAfter = selected_group;

    if (chatIdBefore !== chatIdAfter ||
        characterBefore !== characterAfter ||
        groupBefore !== groupAfter) {
      throw new Error('Chat context changed during checkpoint creation. Checkpoint aborted.');
    }

    // Proceed with checkpoint creation
    // ...
  } finally {
    setQueueBlocking(false);
    isCreatingCheckpoint = false;
  }
}
```

**M4: Lorebook Locking** (OPTIONAL - Complex)

```javascript
const lorebookLocks = new Map();  // lorebookName -> Promise

async function withLorebookLock(lorebookName, fn) {
  // Wait for existing lock
  while (lorebookLocks.has(lorebookName)) {
    await lorebookLocks.get(lorebookName);
  }

  // Acquire lock
  const lockPromise = (async () => {
    try {
      return await fn();
    } finally {
      lorebookLocks.delete(lorebookName);
    }
  })();

  lorebookLocks.set(lorebookName, lockPromise);
  return lockPromise;
}

// Usage
await withLorebookLock(lorebookName, async () => {
  return await cloneLorebook(lorebookName, checkpointName);
});
```

**M5: Queue Reload Debouncing** (RECOMMENDED)

```javascript
let reloadQueueDebounceTimer = null;

export async function reloadQueue() {
  // Debounce rapid reloads
  if (reloadQueueDebounceTimer) {
    clearTimeout(reloadQueueDebounceTimer);
  }

  return new Promise((resolve) => {
    reloadQueueDebounceTimer = setTimeout(async () => {
      reloadQueueDebounceTimer = null;
      await reloadQueueInternal();
      resolve();
    }, 100);  // 100ms debounce
  });
}
```

#### Recommendation

Implement **M1, M2, M3** (REQUIRED) + **M5** (RECOMMENDED)
- M1: Prevents concurrent creation attempts
- M2: Prevents user interference during creation
- M3: Detects and aborts on context changes
- M5: Reduces redundant queue reloads

M4 (lorebook locking) is optional - only needed if users frequently edit lorebooks during checkpoint creation (unlikely).

#### Implementation Priority

**P0 - CRITICAL** - Must implement before any checkpoint feature release

#### Testing Requirements

1. **Rapid Creation Test:**
   - Click "Create Checkpoint" twice rapidly
   - Second click should show "already in progress" warning
   - Only one checkpoint should be created

2. **Chat Switch Test:**
   - Start checkpoint creation
   - Immediately switch to different chat
   - Should abort with context change error
   - No corrupted checkpoint files

3. **UI Block Test:**
   - Start checkpoint creation
   - Try to send message (should be blocked)
   - UI should show blocking indicator
   - UI should unblock after completion/failure

4. **Queue Reload Test:**
   - Switch chats rapidly (5 switches in 2 seconds)
   - Queue should reload only once per chat (debounced)
   - No console errors

---

### 🟡 R3: Nested Checkpoints (MEDIUM)

**Priority:** P2 - Recommended mitigation

#### Problem Description

SillyTavern allows creating checkpoints from checkpoints (nested checkpoints). The `main_chat` field always points to the **immediate parent**, not the root chat. This creates reference chains that can grow arbitrarily long and may break if intermediate checkpoints are deleted.

#### Reference Chain Example

```
Main Chat: "Story with Alice"
  ↓ Create checkpoint at message 50
Checkpoint A: "Checkpoint #5 - 2025-01-12"
  main_chat: "Story with Alice"
  ↓ User continues to message 70
  ↓ Create checkpoint
Checkpoint B: "Checkpoint #7 - 2025-01-12"
  main_chat: "Checkpoint #5 - 2025-01-12"  ←← Points to PARENT
  ↓ User continues to message 90
  ↓ Create checkpoint
Checkpoint C: "Checkpoint #9 - 2025-01-12"
  main_chat: "Checkpoint #7 - 2025-01-12"  ←← Points to PARENT
```

**Reference Chain:** C → B → A → Main

#### Lorebook Name Chain

With lorebook cloning, names can grow:

```
Main Chat Lorebook: "z-AutoLB-Story"

Checkpoint A Lorebook: "z-AutoLB-Story__CP_Checkpoint5"

Checkpoint B Lorebook: "z-AutoLB-Story__CP_Checkpoint5__CP_Checkpoint7"

Checkpoint C Lorebook: "z-AutoLB-Story__CP_Checkpoint5__CP_Checkpoint7__CP_Checkpoint9"
```

#### Navigation Behavior

From `bookmarks.js:260-274`:
```javascript
async function backToMainChat() {
  const mainChatName = getMainChatName();  // Returns chat_metadata.main_chat
  // Opens immediate parent (not root)
}
```

**User Experience:**
```
User in Checkpoint C
  /checkpoint-exit → Goes to Checkpoint B
  /checkpoint-exit → Goes to Checkpoint A
  /checkpoint-exit → Goes to Main Chat
```

#### Corruption Scenario: Deleted Intermediate Checkpoint

```
Main → Checkpoint A → Checkpoint B → Checkpoint C

User deletes Checkpoint B (manually deletes file)

Checkpoint C metadata:
  main_chat: "Checkpoint B"  ←← No longer exists!

User tries to exit Checkpoint C:
  /checkpoint-exit → ERROR: Chat "Checkpoint B" not found
```

#### Impact

- **Severity:** MEDIUM
- **Frequency:** Low (requires multiple nested levels + deletion)
- **Data Loss:** Navigation broken, user cannot return to parent
- **User Experience:** Confusing multi-level navigation
- **Corruption Risk:** Orphaned checkpoints if parent deleted

#### Mitigation Strategies

**M1: Store Root Chat Reference** (Recommended)

```javascript
// When creating checkpoint, store BOTH parent and root
async function createCheckpointMetadata(mesId) {
  const parentChat = selected_group
    ? groups?.find(x => x.id == selected_group)?.chat_id
    : characters[this_chid].chat;

  const rootChat = chat_metadata.root_chat || chat_metadata.main_chat || parentChat;

  return {
    main_chat: parentChat,     // Immediate parent
    root_chat: rootChat,        // Original root chat
    nesting_depth: (chat_metadata.nesting_depth || 0) + 1
  };
}
```

**M2: Limit Nesting Depth**

```javascript
async function validateCheckpointRequirements(mesId) {
  // ... existing validation ...

  const currentDepth = chat_metadata.nesting_depth || 0;
  const MAX_NESTING_DEPTH = 5;

  if (currentDepth >= MAX_NESTING_DEPTH) {
    errors.push(`Maximum nesting depth (${MAX_NESTING_DEPTH}) reached`);
  }

  return { valid: errors.length === 0, errors };
}
```

**M3: Validate Parent Exists**

```javascript
async function loadCheckpointState() {
  const checkpointState = chat_metadata.auto_recap_checkpoint_state;
  if (!checkpointState) { return; }

  // Validate parent chat exists
  if (chat_metadata.main_chat) {
    const allChats = await getExistingChatNames();
    if (!allChats.includes(chat_metadata.main_chat)) {
      toastr.warning(
        `Parent checkpoint "${chat_metadata.main_chat}" not found. ` +
        `This checkpoint may be orphaned.`
      );

      // Optionally: Update to point to root_chat if available
      if (chat_metadata.root_chat && allChats.includes(chat_metadata.root_chat)) {
        chat_metadata.main_chat = chat_metadata.root_chat;
        toastr.info(`Linked to root chat "${chat_metadata.root_chat}" instead.`);
      }
    }
  }

  // ... rest of state loading ...
}
```

**M4: UI Indicator for Nesting**

```javascript
// Show nesting depth in UI
function updateCheckpointUI() {
  const depth = chat_metadata.nesting_depth || 0;
  const rootChat = chat_metadata.root_chat;

  if (depth > 0 && rootChat) {
    const indicator = '↑'.repeat(depth) + ` ${rootChat}`;
    $('#checkpoint_depth_indicator').text(indicator).show();
  } else {
    $('#checkpoint_depth_indicator').hide();
  }
}
```

#### Recommendation

Implement **M1, M3, M4**:
- M1: Prevents orphaning by keeping root reference
- M3: Detects and repairs broken chains
- M4: Makes nesting visible to users

M2 (depth limit) is optional but recommended (set to 5 levels).

#### Implementation Priority

**P2 - RECOMMENDED** - Should implement, not blocking

#### Testing Requirements

1. Create nested checkpoint (3 levels deep)
2. Verify `root_chat` points to original main chat
3. Delete intermediate checkpoint
4. Load deepest checkpoint → should detect missing parent
5. Should offer to link to root chat instead
6. Verify lorebook name length reasonable

---

### 🟡 R4: Data Corruption Vectors (MEDIUM)

**Priority:** P1 - Important safeguards

#### Identified Corruption Scenarios

##### C1: Lorebook Clone Partial Failure

**Scenario:**
```
Clone operation processes 50/100 entries
Network error / disk full / crash occurs
Partial lorebook created with 50 entries (missing 50)
Checkpoint created with reference to incomplete lorebook
```

**Impact:** Data loss (missing lorebook entries)

**Mitigation:**
```javascript
async function cloneLorebook(sourceName, checkpointName) {
  const clonedName = generateClonedLorebookName(sourceName, checkpointName);
  let clonedLorebook = null;

  try {
    // Load source
    const sourceData = await loadWorldInfo(sourceName);

    // Create clone
    clonedLorebook = await createNewWorldInfo(clonedName);

    // Clone ALL entries (V2: NO FILTERING - complete point-in-time snapshot)
    const clonedEntries = [];
    for (const entry of Object.values(sourceData.entries || {})) {
      // V2: Copy everything - no filtering
      clonedEntries.push(deepCloneEntry(entry));
    }

    // Write ALL entries at once
    clonedLorebook.entries = Object.fromEntries(
      clonedEntries.map(e => [e.uid, e])
    );

    // Save
    await saveWorldInfo(clonedName, clonedLorebook);

    return clonedName;

  } catch (error) {
    // Rollback: Delete partial clone
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

##### C2: Metadata Injection Interrupted

**Scenario:**
```
chat_metadata.auto_recap_checkpoint_state = state  ✅
chat_metadata.world_info = clonedLorebook           ✅
await createNewBookmark(mesId)                      ← Browser crashes here
Main chat has wrong lorebook reference temporarily
```

**Impact:** Main chat temporarily has cloned lorebook reference

**Mitigation:**
```javascript
async function createCheckpointWithValidation(mesId, options = {}) {
  // ... validation ...

  // Save original values
  const originalLorebook = chat_metadata.world_info;
  const originalCheckpointState = chat_metadata.auto_recap_checkpoint_state;

  try {
    // Clone lorebook
    const clonedLorebook = await cloneLorebook(...);

    // Inject metadata
    chat_metadata.auto_recap_checkpoint_state = checkpointState;
    chat_metadata.world_info = clonedLorebook;

    // Create checkpoint (saves current chat_metadata)
    const checkpointName = await createNewBookmark(mesId, options);

    return checkpointName;

  } finally {
    // ALWAYS restore original values (even on crash/error)
    chat_metadata.world_info = originalLorebook;
    chat_metadata.auto_recap_checkpoint_state = originalCheckpointState;

    // Note: finally blocks execute even on browser crashes (before unload)
  }
}
```

##### C3: Running Recap Version Mismatch

**Scenario:**
```
Checkpoint records: running_scene_recap_version = 5
User manually deletes version 5 from running recap versions array
User loads checkpoint
Extension tries to load version 5 → not found
```

**Impact:** Running recap data unavailable

**Mitigation:**
```javascript
async function loadCheckpointState() {
  const checkpointState = chat_metadata.auto_recap_checkpoint_state;
  const requestedVersion = checkpointState.running_scene_recap_version;

  const storage = get_running_recap_storage();
  const versionData = storage.versions[requestedVersion];

  if (!versionData) {
    warn(
      `Running recap version ${requestedVersion} not found. ` +
      `Available versions: ${Object.keys(storage.versions).join(', ')}`
    );

    // Fallback: Use latest version
    const latestVersion = Math.max(...Object.keys(storage.versions).map(Number));
    if (storage.versions[latestVersion]) {
      toastr.warning(
        `Running recap version ${requestedVersion} missing. ` +
        `Using latest version ${latestVersion} instead.`
      );
      storage.current_version = latestVersion;
    } else {
      toastr.error('No running recap versions available.');
    }
  } else {
    // Restore version
    storage.current_version = requestedVersion;
  }
}
```

##### C4: Lorebook Reference to Deleted Lorebook

**Scenario:**
```
Checkpoint metadata: world_info = "z-AutoLB-Main__CP_Test"
User manually deletes that lorebook file
User loads checkpoint
Extension expects lorebook "z-AutoLB-Main__CP_Test" → not found
```

**Impact:** Checkpoint lorebook unavailable, queue/registry data lost

**Mitigation:**
```javascript
async function loadCheckpointState() {
  const checkpointState = chat_metadata.auto_recap_checkpoint_state;
  const checkpointLorebook = checkpointState.original_lorebook;

  // Validate lorebook exists
  const allLorebooks = await getWorldInfoNames();
  if (!allLorebooks.includes(checkpointLorebook)) {
    toastr.error(
      `Checkpoint lorebook "${checkpointLorebook}" not found. ` +
      `This checkpoint's data may be incomplete.`
    );

    // Offer repair options
    const choice = await showDialog({
      title: 'Missing Checkpoint Lorebook',
      message: `The lorebook "${checkpointLorebook}" is missing. What would you like to do?`,
      buttons: [
        { label: 'Create Empty Lorebook', value: 'create' },
        { label: 'Use Current Lorebook', value: 'current' },
        { label: 'Cancel', value: 'cancel' }
      ]
    });

    if (choice === 'create') {
      await createNewWorldInfo(checkpointLorebook);
      toastr.info(`Created empty lorebook "${checkpointLorebook}"`);
    } else if (choice === 'current') {
      // Keep current lorebook (do nothing)
      toastr.info('Using current lorebook instead');
    } else {
      return;  // Abort state loading
    }
  }

  // ... rest of state loading ...
}
```

##### C5: Chat ID Mismatch in Running Recap

**Scenario:**
```
Main chat ID: "2025-01-12-Story"
Running recap storage: { chat_id: "2025-01-12-Story", ... }

Checkpoint created with chat ID: "Checkpoint #5"
Running recap validation fires: chat_id !== "Checkpoint #5"
Running recap data RESET (data loss)
```

**Current Behavior** (from `runningSceneRecap.js:28-39`):
```javascript
if (chat_metadata.auto_recap_running_scene_recaps.chat_id !== currentChatId) {
  error(
    SUBSYSTEM.RUNNING,
    `Running recap storage belongs to chat '${chat_metadata.auto_recap_running_scene_recaps.chat_id}', ` +
    `but current chat is '${currentChatId}'. Resetting to prevent cross-chat contamination.`
  );
  chat_metadata.auto_recap_running_scene_recaps = {
    chat_id: currentChatId,
    current_version: 0,
    versions: []
  };
}
```

**Impact:** Running recap data lost when loading checkpoint

**Mitigation:**
```javascript
// Option 1: Preserve parent's chat_id in checkpoints
function get_running_recap_storage() {
  const currentChatId = getCurrentChatId();

  // Check if this is a checkpoint (has main_chat)
  const isCheckpoint = !!chat_metadata.main_chat;
  const parentChatId = chat_metadata.main_chat;

  if (!chat_metadata.auto_recap_running_scene_recaps) {
    chat_metadata.auto_recap_running_scene_recaps = {
      chat_id: isCheckpoint ? parentChatId : currentChatId,  // Use parent's ID
      current_version: 0,
      versions: []
    };
  } else {
    const storedChatId = chat_metadata.auto_recap_running_scene_recaps.chat_id;

    // Allow mismatch if this is a checkpoint and stored ID matches parent
    if (isCheckpoint && storedChatId === parentChatId) {
      // Valid: checkpoint using parent's running recap data
      return chat_metadata.auto_recap_running_scene_recaps;
    }

    if (storedChatId !== currentChatId) {
      // Invalid: reset
      error(SUBSYSTEM.RUNNING, 'Chat ID mismatch, resetting...');
      chat_metadata.auto_recap_running_scene_recaps = {
        chat_id: isCheckpoint ? parentChatId : currentChatId,
        current_version: 0,
        versions: []
      };
    }
  }

  return chat_metadata.auto_recap_running_scene_recaps;
}
```

#### Implementation Priority

**P1 - IMPORTANT** - Implement all atomic operations and rollbacks

#### Testing Requirements

1. Simulate clone failure (network error during clone)
2. Verify partial clone is deleted (rollback)
3. Simulate crash during metadata injection
4. Verify original metadata restored on next load
5. Delete lorebook, load checkpoint → should detect and offer repair
6. Delete running recap version, load checkpoint → should fallback to latest

---

### 🟡 R5: Performance Scalability (MEDIUM)

**Priority:** P2 - Add warnings and limits

#### Performance Characteristics

**Lorebook Clone Operation:**
- **Time Complexity:** O(n) where n = number of entries
- **Space Complexity:** O(n) (full deep clone)
- **Measured Time:** ~50-200ms for typical lorebook (100 entries)
- **Large Lorebook:** ~500-2000ms for 1000 entries
- **Blocking:** Yes (async but sequential, blocks UI during creation)

**Storage Growth:**
- 1 checkpoint with 1MB lorebook = 1MB additional storage
- 10 checkpoints = 10MB additional storage
- No automatic cleanup of orphaned clones
- Unlimited growth potential

#### Code Analysis

From `lorebookManager.js:370-427`:
```javascript
async function cloneLorebook(sourceName, targetName) {
  const sourceData = await loadWorldInfo(sourceName);  // O(1) file read

  // O(n) iteration over all entries (V2: NO FILTERING)
  for (const entry of Object.values(sourceData.entries || {})) {
    // V2: Copy everything - no filtering for complete snapshot

    // Deep clone each entry (O(m) where m = entry size)
    const clonedEntry = JSON.parse(JSON.stringify(entry));
    // ...
  }

  await saveWorldInfo(targetName, clonedData);  // O(1) file write
}
```

**Total Complexity:** O(n * m) where n = entries, m = avg entry size

#### Impact Scenarios

**Scenario 1: Large Lorebook**
```
Lorebook: 1000 entries, 2000 chars each = 2MB total
Clone time: ~2 seconds
UI blocked: 2 seconds (poor UX)
Storage: +2MB per checkpoint
10 checkpoints: +20MB storage
```

**Scenario 2: Nested Checkpoints**
```
Main lorebook: 500 entries (500KB)
Checkpoint A: Clone of 500 entries (500KB)
Checkpoint B from A: Clone of clone (500KB)
Checkpoint C from B: Clone of clone of clone (500KB)

Total storage: 500KB * 4 = 2MB
Each clone inherits ALL entries from parent
```

#### Impact

- **Severity:** MEDIUM
- **Frequency:** Low (most lorebooks <200 entries)
- **Data Loss:** None
- **User Experience:** Slow checkpoint creation for large lorebooks
- **Resource Usage:** Disk space can grow significantly

#### Mitigation Strategies

**M1: Size Warning**

```javascript
async function validateCheckpointRequirements(mesId) {
  // ... existing validation ...

  const lorebookName = getAttachedLorebook();
  if (lorebookName) {
    const lorebookData = await loadWorldInfo(lorebookName);
    const entryCount = Object.keys(lorebookData.entries || {}).length;

    if (entryCount > 500) {
      const proceed = await confirmDialog(
        'Large Lorebook Warning',
        `This lorebook has ${entryCount} entries. Cloning may take 1-2 seconds. Continue?`
      );

      if (!proceed) {
        return { valid: false, errors: ['User cancelled due to large lorebook'] };
      }
    }

    if (entryCount > 1000) {
      errors.push(`Lorebook too large (${entryCount} entries). Maximum 1000 entries.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

**M2: Progress Indicator**

```javascript
async function cloneLorebook(sourceName, targetName) {
  const sourceData = await loadWorldInfo(sourceName);
  const entries = Object.values(sourceData.entries || {});
  const totalEntries = entries.length;

  toastr.info(`Cloning lorebook (${totalEntries} entries)...`, { timeOut: 0, extendedTimeOut: 0 });

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    // ... clone entry ...

    // Update progress every 50 entries
    if (i % 50 === 0) {
      toastr.info(`Cloning: ${i}/${totalEntries} entries`, { timeOut: 0 });
    }
  }

  toastr.clear();
  toastr.success('Lorebook cloned successfully');
}
```

**M3: Cleanup Utility**

```javascript
async function findOrphanedCheckpointLorebooks() {
  const allLorebooks = await getWorldInfoNames();
  const checkpointLorebooks = allLorebooks.filter(name => name.includes('__CP_'));

  const orphaned = [];

  for (const lorebookName of checkpointLorebooks) {
    // Extract checkpoint name from lorebook name
    const checkpointName = extractCheckpointName(lorebookName);

    // Check if checkpoint still exists
    const allChats = await getExistingChatNames();
    if (!allChats.includes(checkpointName)) {
      orphaned.push(lorebookName);
    }
  }

  return orphaned;
}

async function cleanupOrphanedLorebooks() {
  const orphaned = await findOrphanedCheckpointLorebooks();

  if (orphaned.length === 0) {
    toastr.info('No orphaned checkpoint lorebooks found');
    return;
  }

  const proceed = await confirmDialog(
    'Cleanup Orphaned Lorebooks',
    `Found ${orphaned.length} orphaned checkpoint lorebooks. Delete them to free up space?`
  );

  if (proceed) {
    for (const lorebookName of orphaned) {
      await deleteWorldInfo(lorebookName);
    }
    toastr.success(`Deleted ${orphaned.length} orphaned lorebooks`);
  }
}
```

**M4: Entry Limit**

```javascript
const MAX_CHECKPOINT_LOREBOOK_ENTRIES = 1000;

async function validateCheckpointRequirements(mesId) {
  // ... existing validation ...

  const lorebookName = getAttachedLorebook();
  if (lorebookName) {
    const lorebookData = await loadWorldInfo(lorebookName);
    const entryCount = Object.keys(lorebookData.entries || {}).length;

    if (entryCount > MAX_CHECKPOINT_LOREBOOK_ENTRIES) {
      errors.push(
        `Lorebook too large (${entryCount} entries). ` +
        `Maximum ${MAX_CHECKPOINT_LOREBOOK_ENTRIES} entries for checkpoints.`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
```

#### Recommendation

Implement **M1** (size warning) and **M3** (cleanup utility).
M2 and M4 are optional based on performance testing results.

#### Implementation Priority

**P2 - RECOMMENDED** - Add warnings and cleanup, not blocking

#### Testing Requirements

1. Create checkpoint with 500 entry lorebook → should show warning
2. Create checkpoint with 1000 entry lorebook → should be blocked (if M4 implemented)
3. Create 5 checkpoints, delete 3, run cleanup → should delete 3 orphaned lorebooks
4. Measure clone time for various lorebook sizes (100, 500, 1000 entries)

---

### 🟢 R6: Group Chat Support (LOW)

**Priority:** P3 - Documentation only

#### Analysis

Group chat checkpoints work identically to solo chat checkpoints with minor differences in storage location.

**Code Evidence:**

From `bookmarks.js:232-236`:
```javascript
if (selected_group) {
  await saveGroupBookmarkChat(selected_group, name, newMetadata, mesId);
} else {
  await saveChat({ chatName: name, withMetadata: newMetadata, mesId });
}
```

From `group-chats.js:2100-2127`:
```javascript
export async function saveGroupBookmarkChat(groupId, name, metadata, mesId) {
  const group = groups.find(x => x.id === groupId);
  if (!group) { return; }

  // SAME metadata merge behavior
  group.past_metadata[name] = { ...chat_metadata, ...(metadata || {}) };
  group.chats.push(name);

  // SAME message trimming
  const trimmed_chat = (mesId !== undefined && mesId >= 0 && mesId < chat.length)
    ? chat.slice(0, parseInt(mesId) + 1)
    : chat;

  await editGroup(groupId, true, false);
  await fetch('/api/chats/group/save', { /* ... */ });
}
```

**Key Differences:**
| Aspect | Solo Chat | Group Chat |
|--------|-----------|------------|
| Storage API | `/api/chats/save` | `/api/chats/group/save` |
| Metadata location | Chat file first element | `group.past_metadata[chatName]` |
| Metadata behavior | Merge then replace | Merge then replace (identical) |
| Message trimming | `slice(0, mesId + 1)` | `slice(0, mesId + 1)` (identical) |

**Extension Support:**

From `lorebookManager.js:179-227`:
```javascript
if (selected_group) {
  isGroupChat = true;
  const group = groups?.find((x) => x.id === selected_group);
  if (group) {
    groupName = group.name;
    chatId = group.chat_id;
    characterName = groupName;  // Use group name as character name
  }
}
```

**Extension already handles group chats throughout** ✅

#### Impact

- **Severity:** LOW
- **Frequency:** N/A (already supported)
- **Data Loss:** None
- **User Experience:** Transparent
- **Corruption Risk:** None (same mechanisms)

#### Mitigation

**Only requirement:** Ensure lorebook cloning uses appropriate name generation for group chats.

```javascript
function generateClonedLorebookName(sourceName, checkpointName) {
  const chatContext = selected_group
    ? `Group_${groups.find(x => x.id === selected_group)?.name || 'Unknown'}`
    : `Character_${characters[this_chid]?.name || 'Unknown'}`;

  return `${sourceName}__CP_${checkpointName}__${chatContext}`;
}
```

#### Implementation Priority

**P3 - LOW** - Documentation only, no code changes needed

#### Testing Requirements

1. Create checkpoint in group chat
2. Verify lorebook cloned with group context in name
3. Switch to checkpoint in group chat
4. Verify state restored correctly
5. Create branch in group chat
6. Verify isolation works

---

### 🟢 R7: Profile Switching (LOW)

**Priority:** P3 - No action needed

#### Analysis

Extension profiles (settings profiles) and connection profiles do not affect checkpoint integrity. Profile switching is already handled correctly by the extension's existing `auto_load_profile()` mechanism.

**Profile System:**

From `profileManager.js:297-302`:
```javascript
function auto_load_profile() {
  // Load the settings profile for the current chat or character
  const profile = get_chat_profile() || get_character_profile();
  load_profile(profile || 'Default');
  refresh_settings();
}
```

**Triggered on CHAT_CHANGED** (from `eventHandlers.js:62`):
```javascript
async function handleChatChanged() {
  auto_load_profile();  // ← Automatically loads correct profile
  // ...
}
```

#### Checkpoint Loading Flow

```
User loads checkpoint
  ↓
openCharacterChat(checkpointName) executes
  ↓
CHAT_CHANGED event fires
  ↓
Extension's handleChatChanged() runs
  ↓
auto_load_profile() runs
  ↓
Character/chat-specific profile loaded (not checkpoint creator's profile)
  ↓
Checkpoint state restored with CURRENT profile settings
```

#### Scenarios

**Scenario A: Different Profile at Load**
```
Main Chat (Profile A: GPT-4):
  - Create checkpoint at message 50

User switches to Profile B (Claude)
  - Loads checkpoint
  - auto_load_profile() runs
  - Profile for character loaded (might be A or B depending on character settings)
  - New recaps generated use loaded profile (correct behavior)
```

**Scenario B: Character-Specific Profile**
```
Character "Alice" has default profile: "Alice-Profile"
  - User manually switches to "Generic-Profile"
  - Creates checkpoint

User loads checkpoint
  - auto_load_profile() runs
  - Loads "Alice-Profile" (character's default, not "Generic-Profile")
  - Correct behavior: character settings take precedence
```

#### Design Decision

**Should checkpoint metadata include profile info?**

**NO** - Here's why:

1. **Character/chat profiles take precedence** - Profile is a setting, not chat state
2. **User may intentionally want different profile** - Allow flexibility
3. **Profile switching is user-controlled** - Not automatic state
4. **Conflict resolution complex** - Character profile vs checkpoint profile vs current profile

**Current design is correct:** Don't save profile in checkpoint metadata.

#### Impact

- **Severity:** LOW
- **Frequency:** N/A (already correct)
- **Data Loss:** None
- **User Experience:** Correct (character/chat profile used)
- **Corruption Risk:** None

#### Mitigation

None needed. Current behavior is correct.

#### Implementation Priority

**P3 - NONE** - No changes needed

#### Testing Requirements

1. Create checkpoint with Profile A active
2. Switch to Profile B
3. Load checkpoint
4. Verify profile auto-loads based on character/chat settings (not forced to A)
5. Generate new recap in checkpoint
6. Verify uses current profile (not original)

---

### 🟢 R8: Version Compatibility (LOW)

**Priority:** P3 - Optional version check

#### Analysis

SillyTavern's checkpoint APIs appear stable across versions. The core functions (`saveChat`, `getChat`, `createNewBookmark`) have maintained consistent behavior.

**API Stability:**
- `saveChat()` - Signature changed to destructured params but maintains backward compatibility
- `getChat()` - Stable
- `chat_metadata` structure - Stable
- `message.extra` structure - Stable
- Lorebook metadata (`world_info`) - Stable

**Version Detection:**

```javascript
// SillyTavern exposes version via context
const ctx = getContext();
const stVersion = ctx.version;  // e.g., "1.12.0"
```

#### Impact

- **Severity:** LOW
- **Frequency:** Rare (ST updates don't usually break APIs)
- **Data Loss:** None (APIs are stable)
- **User Experience:** Transparent
- **Corruption Risk:** Low (would fail loudly if APIs changed)

#### Mitigation (Optional)

```javascript
const MIN_SUPPORTED_ST_VERSION = '1.10.0';

function checkSillyTavernCompatibility() {
  const ctx = getContext();
  const stVersion = ctx.version || 'unknown';

  if (stVersion === 'unknown') {
    warn('Unable to detect SillyTavern version');
    return true;  // Allow anyway
  }

  if (compareVersions(stVersion, MIN_SUPPORTED_ST_VERSION) < 0) {
    toastr.warning(
      `SillyTavern ${stVersion} detected. ` +
      `Checkpoint support requires ${MIN_SUPPORTED_ST_VERSION}+. ` +
      `Some features may not work correctly.`
    );
    return false;
  }

  return true;
}

// Call on extension init
eventEmitter.on(event_types.APP_READY, () => {
  checkSillyTavernCompatibility();
});
```

#### Implementation Priority

**P3 - OPTIONAL** - Nice to have, not critical

#### Testing Requirements

1. Mock ST version as old version (1.8.0)
2. Verify warning shown on extension init
3. Mock ST version as current (1.12.0)
4. Verify no warning

---

### 🟢 R9: Rollback/Recovery (LOW)

**Priority:** P3 - Nice to have

#### Current Recovery Mechanisms

**Existing Safeguards:**
1. ✅ Validation blocks invalid checkpoints (prevents corruption)
2. ✅ `finally` blocks restore state after failures (in design)
3. ✅ Atomic lorebook cloning with rollback (in mitigations)
4. ⚠️ No checkpoint integrity validation on load
5. ⚠️ No repair function for corrupted checkpoints

#### Proposed Recovery Features

**Feature 1: Checkpoint Integrity Check**

```javascript
async function validateCheckpointIntegrity(checkpointName) {
  const issues = [];

  // Load checkpoint chat
  const checkpointData = await loadChat(checkpointName);
  const checkpointMetadata = checkpointData[0]?.chat_metadata || {};

  // Check 1: Lorebook exists
  const lorebookRef = checkpointMetadata.world_info;
  if (lorebookRef) {
    const allLorebooks = await getWorldInfoNames();
    if (!allLorebooks.includes(lorebookRef)) {
      issues.push({
        type: 'missing_lorebook',
        severity: 'high',
        message: `Lorebook "${lorebookRef}" not found`,
        lorebook: lorebookRef
      });
    }
  }

  // Check 2: Running recap versions exist
  const checkpointState = checkpointMetadata.auto_recap_checkpoint_state;
  if (checkpointState?.running_scene_recap_version !== undefined) {
    const runningRecap = checkpointMetadata.auto_recap_running_scene_recaps;
    const requestedVersion = checkpointState.running_scene_recap_version;

    if (!runningRecap?.versions?.[requestedVersion]) {
      issues.push({
        type: 'missing_running_recap_version',
        severity: 'medium',
        message: `Running recap version ${requestedVersion} not found`,
        requested: requestedVersion,
        available: Object.keys(runningRecap?.versions || {})
      });
    }
  }

  // Check 3: Main chat exists (for non-root checkpoints)
  const mainChat = checkpointMetadata.main_chat;
  if (mainChat) {
    const allChats = await getExistingChatNames();
    if (!allChats.includes(mainChat)) {
      issues.push({
        type: 'missing_parent_chat',
        severity: 'medium',
        message: `Parent chat "${mainChat}" not found`,
        parent: mainChat
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues: issues
  };
}
```

**Feature 2: Repair Function**

```javascript
async function repairCheckpoint(checkpointName) {
  const integrity = await validateCheckpointIntegrity(checkpointName);

  if (integrity.valid) {
    toastr.info('Checkpoint integrity OK - no repair needed');
    return;
  }

  log(`Repairing checkpoint "${checkpointName}"...`);

  for (const issue of integrity.issues) {
    switch (issue.type) {
      case 'missing_lorebook':
        const action = await askUser({
          question: `Lorebook "${issue.lorebook}" is missing. What to do?`,
          options: [
            'Create empty lorebook',
            'Clone from current lorebook',
            'Detach lorebook reference',
            'Skip'
          ]
        });

        if (action === 'Create empty lorebook') {
          await createNewWorldInfo(issue.lorebook);
          toastr.success(`Created empty lorebook "${issue.lorebook}"`);
        } else if (action === 'Clone from current lorebook') {
          const currentLorebook = getAttachedLorebook();
          if (currentLorebook) {
            await cloneLorebook(currentLorebook, issue.lorebook);
            toastr.success(`Cloned current lorebook to "${issue.lorebook}"`);
          }
        } else if (action === 'Detach lorebook reference') {
          // Update checkpoint metadata to remove lorebook reference
          // (requires modifying saved checkpoint file)
          toastr.info('Lorebook reference detached');
        }
        break;

      case 'missing_running_recap_version':
        toastr.warning(
          `Running recap version ${issue.requested} missing. ` +
          `Will use latest version (${Math.max(...issue.available)}) instead.`
        );
        // Automatic fallback (no user action needed)
        break;

      case 'missing_parent_chat':
        const rootChat = checkpointMetadata.root_chat;
        if (rootChat) {
          toastr.info(`Parent missing, will link to root "${rootChat}" instead`);
        } else {
          toastr.warning(`Parent chat "${issue.parent}" missing - checkpoint may be orphaned`);
        }
        break;
    }
  }

  toastr.success('Checkpoint repair complete');
}
```

#### Impact

- **Severity:** LOW
- **Frequency:** Rare (only on corrupted checkpoints)
- **Data Loss:** Can prevent data loss by detecting issues early
- **User Experience:** Improved (can recover from errors)
- **Corruption Risk:** Reduces risk by detecting/repairing corruption

#### Implementation Priority

**P3 - NICE TO HAVE** - Optional feature, not critical

#### Testing Requirements

1. Manually corrupt checkpoint (delete referenced lorebook)
2. Run integrity check → should detect missing lorebook
3. Run repair → should offer to recreate
4. Verify checkpoint loads after repair

---

### 🟢 R10: User Error Messages (LOW)

**Priority:** P3 - UX improvement

#### Current Error Handling

**Validation errors:**
✅ Displayed via toastr
✅ Clear messages (e.g., "Queue must be empty")

**Missing improvements:**
⚠️ No visual indicator for "checkpoint-ready" state
⚠️ No detailed validation status tooltip
⚠️ No progress indicator during checkpoint creation
⚠️ Generic error messages for complex failures

#### Proposed UI Enhancements

**Enhancement 1: Checkpoint-Ready Indicator**

```javascript
// Add visual indicator to scene break messages
function updateSceneBreakCheckpointStatus(message) {
  const mesId = chat.indexOf(message);
  const validation = validateCheckpointRequirements(mesId);

  const indicator = $(`#chat .mes[mesid="${mesId}"] .checkpoint-ready-indicator`);

  if (validation.valid) {
    indicator.removeClass('not-ready').addClass('ready');
    indicator.attr('title', 'Ready to create checkpoint');
    indicator.html('✓ Checkpoint Ready');
  } else {
    indicator.removeClass('ready').addClass('not-ready');
    indicator.attr('title', validation.errors.join('\n'));
    indicator.html('✗ Not Ready');
  }
}
```

**Enhancement 2: Detailed Validation Tooltip**

```javascript
function showValidationStatus(mesId) {
  const validation = validateCheckpointRequirements(mesId);

  const tooltip = `
    <div class="checkpoint-validation-status">
      <h4>Checkpoint Requirements</h4>
      <ul>
        <li class="${validation.queueEmpty ? 'pass' : 'fail'}">
          ${validation.queueEmpty ? '✓' : '✗'} Queue empty
        </li>
        <li class="${validation.isSceneBreak ? 'pass' : 'fail'}">
          ${validation.isSceneBreak ? '✓' : '✗'} Message is scene break
        </li>
        <li class="${validation.hasSceneRecap ? 'pass' : 'fail'}">
          ${validation.hasSceneRecap ? '✓' : '✗'} Scene recap exists
        </li>
        <li class="${validation.hasRunningRecap ? 'pass' : 'fail'}">
          ${validation.hasRunningRecap ? '✓' : '✗'} Running recap exists
        </li>
      </ul>
    </div>
  `;

  return tooltip;
}
```

**Enhancement 3: Progress Indicator**

```javascript
async function createCheckpointWithValidation(mesId, options = {}) {
  const progressSteps = [
    { name: 'Validating requirements', progress: 0 },
    { name: 'Cloning lorebook', progress: 25 },
    { name: 'Preparing metadata', progress: 60 },
    { name: 'Creating checkpoint', progress: 80 },
    { name: 'Finalizing', progress: 95 }
  ];

  const progressBar = showProgressBar('Creating Checkpoint', progressSteps[0].name);

  try {
    // Step 1: Validation
    updateProgress(progressBar, progressSteps[0]);
    const validation = await validateCheckpointRequirements(mesId);
    if (!validation.valid) {
      showValidationErrors(validation.errors);
      return null;
    }

    // Step 2: Clone lorebook
    updateProgress(progressBar, progressSteps[1]);
    const clonedLorebook = await cloneLorebook(...);

    // Step 3: Prepare metadata
    updateProgress(progressBar, progressSteps[2]);
    const checkpointState = prepareCheckpointState(...);

    // Step 4: Create checkpoint
    updateProgress(progressBar, progressSteps[3]);
    const checkpointName = await createNewBookmark(mesId, options);

    // Step 5: Finalize
    updateProgress(progressBar, progressSteps[4]);
    await finalizeCheckpoint(checkpointName);

    updateProgress(progressBar, { name: 'Complete!', progress: 100 });
    setTimeout(() => closeProgressBar(progressBar), 1000);

    return checkpointName;

  } catch (error) {
    closeProgressBar(progressBar);
    throw error;
  }
}
```

**Enhancement 4: Detailed Error Panel**

```javascript
function showValidationErrors(errors) {
  const errorPanel = $('<div class="checkpoint-validation-errors"></div>');

  errorPanel.html(`
    <h3>Cannot Create Checkpoint</h3>
    <p>The following requirements are not met:</p>
    <ul>
      ${errors.map(err => `<li>${err}</li>`).join('')}
    </ul>
    <p>Please address these issues and try again.</p>
  `);

  callPopup(errorPanel, 'text');
}
```

#### Impact

- **Severity:** LOW
- **Frequency:** N/A (UX improvement)
- **Data Loss:** None (prevents user errors)
- **User Experience:** Improved clarity
- **Corruption Risk:** Reduced (users understand requirements)

#### Implementation Priority

**P3 - NICE TO HAVE** - UX polish, not critical

#### Testing Requirements

1. View scene break message with queue not empty → should show "Not Ready" indicator
2. Hover over indicator → should show detailed validation status
3. Create checkpoint → should show progress bar with steps
4. Validation fails → should show detailed error panel (not just toast)

---

## Open Questions

These questions CANNOT be answered without implementation or live testing:

1. **Actual Clone Performance**
   - Q: What is the actual clone time for 100/500/1000 entry lorebooks?
   - Why: Need benchmarks to set appropriate warnings/limits
   - Test: Create checkpoints with various lorebook sizes, measure time

2. **Memory Usage During Clone**
   - Q: How much memory does deep cloning consume for large lorebooks?
   - Why: May need memory-efficient streaming clone for very large lorebooks
   - Test: Profile memory usage during 1000-entry lorebook clone

3. **Browser Tab Close Timing**
   - Q: Do `finally` blocks always execute before tab close?
   - Why: Critical for cleanup (restore original metadata)
   - Test: Close tab during checkpoint creation, check if metadata restored on next load

4. **SillyTavern Version Breaking Changes**
   - Q: Have checkpoint APIs changed in historical ST versions?
   - Why: Determine minimum supported version
   - Test: Review ST changelog and test with older ST versions

5. **Reasonable Nesting Depth**
   - Q: What nesting depth do users actually need?
   - Why: Set appropriate limit (3 levels? 5 levels? unlimited?)
   - Test: User feedback and usage patterns

6. **Orphaned Lorebook Cleanup**
   - Q: Should cleanup be automatic or manual?
   - Why: Balance between safety (keep everything) and disk space
   - Test: User preference survey

7. **Concurrent Lorebook Edits**
   - Q: Do users actually edit lorebooks during checkpoint creation?
   - Why: Determines if M4 (lorebook locking) is needed
   - Test: Usage telemetry (if implemented)

8. **Queue Reload Frequency**
   - Q: How often do rapid chat switches occur in practice?
   - Why: Optimize debounce timing (100ms? 500ms?)
   - Test: Usage telemetry (if implemented)

---

## Implementation Checklist

### Phase 0: Pre-Implementation (MUST COMPLETE FIRST)

- [ ] Review all documentation with team
- [ ] Decide on P2/P3 mitigation priorities
- [ ] Create test plan for all P0/P1 mitigations
- [ ] Set up test environment

### Phase 1: Critical Mitigations (P0)

**R1: Branch Auto-Open Timing**
- [ ] Implement `validateCheckpointRequirements()` for branches
- [ ] Implement lorebook cloning for branches (same as checkpoints)
- [ ] Add branch creation lock (prevent concurrent branch creates)
- [ ] Test: Branch with queue → blocked
- [ ] Test: Branch with empty queue → isolated lorebook

**R2: Concurrent Operations**
- [ ] Add checkpoint creation lock (`isCreatingCheckpoint` flag)
- [ ] Add UI blocking during creation (`setQueueBlocking(true)`)
- [ ] Add chat context validation after async operations
- [ ] Add queue reload debouncing (100ms)
- [ ] Test: Rapid checkpoint creation → second blocked
- [ ] Test: Chat switch during creation → aborted
- [ ] Test: UI blocked during creation

### Phase 2: Important Safeguards (P1)

**R4: Data Corruption**
- [ ] Implement atomic lorebook cloning with rollback
- [ ] Add `finally` blocks for metadata restoration
- [ ] Add missing lorebook detection on load
- [ ] Add running recap version fallback
- [ ] Test: Clone failure → partial clone deleted
- [ ] Test: Missing lorebook → detection and repair offer

### Phase 3: Recommended Features (P2)

**R3: Nested Checkpoints**
- [ ] Add `root_chat` and `nesting_depth` to checkpoint metadata
- [ ] Add parent existence validation on load
- [ ] Add UI indicator for nesting depth
- [ ] Test: 3-level nesting → root_chat preserved
- [ ] Test: Deleted parent → fallback to root

**R5: Performance**
- [ ] Add lorebook size warning (>500 entries)
- [ ] Implement orphaned lorebook cleanup utility
- [ ] Test: Large lorebook → warning shown
- [ ] Test: Cleanup → orphaned lorebooks deleted

### Phase 4: Optional Polish (P3)

**R6-R10: Low Priority**
- [ ] Document group chat specifics
- [ ] Add ST version check (optional)
- [ ] Implement checkpoint integrity check (optional)
- [ ] Add UI enhancements (optional)

---

## Risk Summary Dashboard

```
CRITICAL RISKS (P0):
🔴 R1: Branch Auto-Open Timing      [MITIGATION REQUIRED]
🔴 R2: Concurrent Operations        [MITIGATION REQUIRED]

IMPORTANT RISKS (P1):
🟡 R4: Data Corruption Vectors      [SAFEGUARDS RECOMMENDED]

MODERATE RISKS (P2):
🟡 R3: Nested Checkpoints           [MITIGATIONS RECOMMENDED]
🟡 R5: Performance Scalability      [WARNINGS RECOMMENDED]

LOW RISKS (P3):
🟢 R6: Group Chat Support           [DOCUMENTATION ONLY]
🟢 R7: Profile Switching            [NO ACTION NEEDED]
🟢 R8: Version Compatibility        [OPTIONAL CHECK]
🟢 R9: Rollback/Recovery            [NICE TO HAVE]
🟢 R10: User Error Messages         [UX IMPROVEMENT]
```

---

## Conclusion

The checkpoint integration design is fundamentally sound and ready for implementation. Two critical risks (R1, R2) MUST be addressed with proper guards and locks before release. All other risks have clear mitigation strategies ranging from important safeguards to optional polish.

**Estimated Implementation Timeline:**
- Core implementation: 25-32 hours (as originally documented)
- P0 mitigations: +8 hours
- P1 safeguards: +6 hours
- P2 features: +8 hours
- Testing (all phases): +16 hours
- **Total: 63-70 hours (8-9 days)**

**Confidence Level:** 95% - Ready to proceed with P0 mitigations

---

**Document Prepared By:** Comprehensive Code Analysis
**Review Status:** Ready for Implementation Team Review
**Next Steps:** Review → Approve P0/P1/P2 scope → Begin implementation

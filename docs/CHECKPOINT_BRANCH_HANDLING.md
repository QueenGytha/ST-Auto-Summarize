# Branch Handling - Complete Strategy

**Date:** 2025-01-12
**Status:** DESIGN - Branching requires different approach than checkpoints
**Priority:** 🔴 CRITICAL - Branches contaminate instantly without intervention

---

## The Branch Problem

### Checkpoint vs Branch Creation

**Checkpoint (`createNewBookmark()`):**
1. Creates checkpoint file
2. Does NOT open it
3. User stays on current chat
4. User manually loads checkpoint later
5. ✅ We have time to fix metadata before it's loaded

**Branch (`branchChat()`):**
1. Creates branch file
2. **IMMEDIATELY opens it** via `openCharacterChat()`
3. User is instantly on the branch
4. CHAT_CHANGED fires
5. Extension handlers run
6. ❌ Branch already has shared lorebook, contamination happens NOW

### Why We Can't Use Checkpoint Approach

**Checkpoint approach:**
```javascript
// 1. Clone lorebook
const clonedLB = await cloneLorebook(...);

// 2. Update metadata
chat_metadata.world_info = clonedLB;

// 3. Create checkpoint
await createNewBookmark(...);

// 4. Restore metadata
chat_metadata.world_info = originalLB;
```

**This doesn't work for branches because:**
- We can't intercept `branchChat()` (it's ST code)
- By the time we know a branch was created, it's already open
- The branch file already has shared lorebook reference
- Extension already reloaded queue from shared lorebook
- Contamination already happened

---

## Reactive Fix Strategy

Since we can't **prevent** branch contamination, we must **fix it immediately** when detected.

### Detection Flow

```javascript
eventSource.on(event_types.CHAT_CHANGED, async () => {
  const isCheckpointOrBranch = !!chat_metadata.main_chat;

  if (isCheckpointOrBranch) {
    const hasCheckpointState = !!chat_metadata.auto_recap_checkpoint_state;

    if (hasCheckpointState) {
      // This is OUR checkpoint - already has cloned lorebook
      await handleCheckpoint();
    } else {
      // This is either:
      // - A branch created by ST (needs fixing)
      // - A legacy checkpoint (no checkpoint state)
      // - A checkpoint created before our feature

      const alreadyFixed = chat_metadata.auto_recap_branch_fixed;

      if (!alreadyFixed) {
        // First time loading this branch - FIX IT NOW
        await fixBranchLorebook();
      } else {
        // Already fixed in a previous load
        await loadCorrectLorebook();
      }
    }
  }

  // Load expected lorebook
  await loadWorldInfo(chat_metadata.world_info);

  // Reload extension state
  await reloadQueue();
});
```

### Fix Function

```javascript
async function fixBranchLorebook() {
  const currentLB = chat_metadata.world_info;
  const branchChatId = getCurrentChatId();

  log(`Fixing branch lorebook: ${branchChatId}`);

  // 1. Clone lorebook NOW (branch already exists with shared reference)
  const clonedLB = await cloneLorebook(currentLB, branchChatId);

  // 2. Update THIS branch's metadata to use cloned lorebook
  chat_metadata.world_info = clonedLB;
  chat_metadata.auto_recap_branch_fixed = true;
  chat_metadata.auto_recap_branch_fixed_timestamp = Date.now();

  // 3. Save branch with updated metadata
  await saveChat();

  // 4. Track mapping for cleanup
  await trackBranchLorebookMapping(branchChatId, clonedLB);

  // 5. Extension operations will now automatically read from cloned lorebook
  // (via chat_metadata.world_info which now contains clonedLB)
  // No explicit loading needed - isolation is automatic

  log(`✓ Branch fixed: ${branchChatId} now uses ${clonedLB}`);
}
```

---

## Timeline Analysis

### What Happens During Branch Creation

```
t=0ms:   User clicks "Create Branch" in ST
t=10ms:  ST's branchChat() starts
t=20ms:  ST's createBranch() creates branch file
         Branch file contains: { world_info: "shared-lorebook", main_chat: "main-chat-id" }
t=30ms:  Branch file saved to disk
t=40ms:  ST's openCharacterChat(branchName) called
t=50ms:  ST's clearChat() clears current UI
t=60ms:  ST's getChat() loads branch file
t=70ms:  chat_metadata = { world_info: "shared-lorebook", ... } (SHARED REFERENCE)
t=80ms:  ST's CHAT_CHANGED event fires
t=85ms:  OUR handler runs (registered first)
t=85ms:    - Detect: branch + no checkpoint state + not fixed
t=86ms:    - Clone lorebook (creates cloned-lorebook file)
t=120ms:   - Update chat_metadata.world_info = "cloned-lorebook"
t=121ms:   - Save branch (overwrites file with cloned reference)
t=140ms:   - Load cloned lorebook
t=150ms:   - Mark as fixed
t=151ms:  OUR handler completes
t=160ms:  Extension's handler runs
t=161ms:    - Reloads queue from currently loaded lorebook
t=162ms:    - Currently loaded = "cloned-lorebook" ✅ CORRECT
t=170ms:  Extension operations continue
```

### Critical Race Condition

**IF extension's CHAT_CHANGED handler runs BEFORE ours:**
```
t=80ms:  CHAT_CHANGED fires
t=81ms:  Extension handler runs FIRST
t=82ms:    - Reloads queue from "shared-lorebook" ❌ CONTAMINATION
t=90ms:  OUR handler runs SECOND
t=91ms:    - Fixes lorebook reference
t=92ms:    - Loads cloned lorebook
t=100ms:   - But extension already has contaminated queue ❌ TOO LATE
```

**Solution: Run our handler FIRST**

---

## Handler Priority / Registration Order

### Problem

Event listeners fire in **registration order**. If extension registers CHAT_CHANGED listener before our checkpoint manager, contamination happens.

### Solution Options

#### Option 1: Register Early

Register our checkpoint handler VERY early in extension initialization, before any other handlers.

```javascript
// In extension initialization (index.js or early init)
async function initializeCheckpointManager() {
  // Register FIRST, before other handlers
  eventSource.on(event_types.CHAT_CHANGED, handleCheckpointChatChanged);

  // Then register normal extension handlers
  registerExtensionHandlers();
}
```

**Pro:** Simple, works if we control initialization order
**Con:** Fragile, depends on init order

#### Option 2: Intercept Queue Reload

Instead of relying on handler order, intercept the extension's queue reload function itself.

```javascript
// Wrap the extension's reloadQueue function
function initializeCheckpointManager() {
  const originalReloadQueue = window.AutoRecap.reloadQueue;

  window.AutoRecap.reloadQueue = async function(...args) {
    // BEFORE reloading queue, ensure correct lorebook
    await ensureCorrectLorebookLoaded();

    // NOW reload queue
    return originalReloadQueue.apply(this, args);
  };
}

async function ensureCorrectLorebookLoaded() {
  const expectedLB = chat_metadata.world_info;

  // Check if this is a branch that needs fixing
  if (chat_metadata.main_chat && !chat_metadata.auto_recap_checkpoint_state) {
    if (!chat_metadata.auto_recap_branch_fixed) {
      await fixBranchLorebook();
    }
  }

  // Ensure correct lorebook is loaded
  if (expectedLB) {
    await loadWorldInfo(expectedLB);
  }
}
```

**Pro:** Guaranteed to run before queue reload, regardless of handler order
**Con:** More invasive, wraps internal function

#### Option 3: Both

Use both approaches for defense in depth.

**Recommended: Option 3**

---

## Complete Implementation

### In eventHandlers.js

```javascript
// Register early, before other handlers
export function initializeCheckpointHandlers() {
  eventSource.on(event_types.CHAT_CHANGED, handleCheckpointChatChanged);
}

async function handleCheckpointChatChanged() {
  try {
    const isCheckpointOrBranch = !!chat_metadata.main_chat;

    if (!isCheckpointOrBranch) {
      // Regular chat, just load lorebook
      const expectedLB = chat_metadata.world_info;
      if (expectedLB) {
        await loadWorldInfo(expectedLB);
      }
      return;
    }

    // This is a checkpoint or branch
    const hasCheckpointState = !!chat_metadata.auto_recap_checkpoint_state;

    if (hasCheckpointState) {
      // Our checkpoint - already has cloned lorebook
      await handleCheckpointLoad();
    } else {
      // Branch or legacy checkpoint
      await handleBranchLoad();
    }

  } catch (error) {
    console.error('[Auto-Recap] Checkpoint/branch handler error:', error);
    toastr.error(`Failed to load checkpoint/branch: ${error.message}`);
  }
}

async function handleCheckpointLoad() {
  const state = chat_metadata.auto_recap_checkpoint_state;
  const expectedLB = state.cloned_lorebook_name;

  // Validate lorebook exists
  if (!await checkLorebookExists(expectedLB)) {
    await handleMissingLorebook(expectedLB);
  }

  // Load checkpoint's lorebook
  await loadWorldInfo(expectedLB);

  // Validate checkpoint state
  await validateCheckpointState(state);
}

async function handleBranchLoad() {
  const alreadyFixed = chat_metadata.auto_recap_branch_fixed;

  if (!alreadyFixed) {
    // First time loading this branch - fix it NOW
    await fixBranchLorebook();
  } else {
    // Already fixed, just load correct lorebook
    const expectedLB = chat_metadata.world_info;
    if (expectedLB) {
      await loadWorldInfo(expectedLB);
    }
  }
}

async function fixBranchLorebook() {
  const currentLB = chat_metadata.world_info;
  const branchChatId = getCurrentChatId();

  debug(`Fixing branch: ${branchChatId}, current LB: ${currentLB}`);

  // Clone lorebook
  const clonedLB = await cloneLorebook(currentLB, branchChatId);

  // Update branch metadata
  chat_metadata.world_info = clonedLB;
  chat_metadata.auto_recap_branch_fixed = true;
  chat_metadata.auto_recap_branch_fixed_timestamp = Date.now();
  chat_metadata.auto_recap_branch_original_lorebook = currentLB;

  // Save branch with updated metadata
  await saveChat();

  // Track for cleanup
  addBranchLorebookMapping(branchChatId, clonedLB);

  // Load cloned lorebook
  await loadWorldInfo(clonedLB);

  log(`✓ Branch fixed: ${clonedLB}`);

  toastr.info(
    `Branch isolated with cloned lorebook\n${clonedLB}`,
    'Branch Fixed',
    { timeOut: 3000 }
  );
}
```

### In checkpointManager.js (add branch utilities)

```javascript
/**
 * Add branch-lorebook mapping to main chat
 * Similar to checkpoint mappings but for branches
 */
function addBranchLorebookMapping(branchChatId, lorebookName) {
  // Need to update MAIN chat's metadata, not branch
  // This is tricky - we're currently on the branch

  // Option A: Load main chat, update, save, reload branch
  // Option B: Track in global storage
  // Option C: Track in branch itself (easier but less centralized)

  // Going with Option C for simplicity
  chat_metadata.auto_recap_branch_lorebook = lorebookName;

  // Also track in extension global state for cleanup
  if (!window.AutoRecap.branchLorebookMap) {
    window.AutoRecap.branchLorebookMap = {};
  }
  window.AutoRecap.branchLorebookMap[branchChatId] = lorebookName;
}

/**
 * Clone lorebook for branch
 * Same as checkpoint cloning but with branch-specific naming
 */
async function cloneLorebook(sourceLorebookName, branchOrCheckpointName) {
  const timestamp = Date.now();
  const cloneName = `${sourceLorebookName}_branch_${branchOrCheckpointName}_${timestamp}`;

  // Rest is same as checkpoint lorebook cloning
  // ... (see CHECKPOINT_LOREBOOK_MANAGEMENT.md)

  return cloneName;
}
```

---

## Branch Cleanup

### Problem

When branch is deleted, need to delete cloned lorebook.

Same as checkpoint cleanup, but need to track branches separately.

### Solution

```javascript
async function branchCleanup() {
  const branchMap = window.AutoRecap.branchLorebookMap || {};

  for (const [branchChatId, lorebookName] of Object.entries(branchMap)) {
    // Check if branch still exists
    const branchExists = await checkChatExists(branchChatId);

    if (!branchExists) {
      // Branch deleted, clean up lorebook

      // Safety checks (same as checkpoint cleanup)
      if (lorebookName === chat_metadata.world_info) {
        warn(`Not deleting ${lorebookName} - currently active`);
        continue;
      }

      // Delete lorebook
      await deleteWorldInfo(lorebookName);
      delete window.AutoRecap.branchLorebookMap[branchChatId];
      log(`Cleaned up branch lorebook: ${lorebookName}`);
    }
  }
}

// Run periodically
setInterval(branchCleanup, 60000);
```

---

## Edge Cases

### Edge Case 1: Branch of a Branch

**Scenario:**
1. Main chat → Branch A
2. Branch A → Branch B
3. Branch B references Branch A's cloned lorebook

**Handling:**
- Branch B is treated same as any branch
- When Branch B is created, it has Branch A's cloned lorebook reference
- Our handler detects: branch + not fixed
- Clones Branch A's lorebook → creates Branch B's lorebook
- Branch B now has its own clone
- ✅ Complete isolation across branch tree

### Edge Case 2: Branch Created While Queue Active

**Scenario:**
1. Main chat has pending queue operations
2. User creates branch
3. Branch is fixed (lorebook cloned)
4. Queue operations from main continue...in main's lorebook
5. ✅ Branch is isolated, main operations don't affect it

**No special handling needed** - branch is on its own timeline immediately.

### Edge Case 3: User Deletes Cloned Lorebook Manually

**Scenario:**
1. Branch exists with cloned lorebook
2. User manually deletes lorebook file
3. User loads branch
4. Lorebook missing

**Handling:**
- Same as checkpoint lorebook missing
- Detect in `handleBranchLoad()`
- Offer repair options (create empty, clone from current, detach)

```javascript
async function handleBranchLoad() {
  const expectedLB = chat_metadata.world_info;

  if (expectedLB) {
    const exists = await checkLorebookExists(expectedLB);

    if (!exists) {
      await handleMissingLorebook(expectedLB);
    } else {
      await loadWorldInfo(expectedLB);
    }
  }

  // Mark as already fixed if not already
  if (!chat_metadata.auto_recap_branch_fixed) {
    chat_metadata.auto_recap_branch_fixed = true;
    await saveChat();
  }
}
```

---

## Testing Requirements

### Test 1: Branch Creation Isolation

**Steps:**
1. Create main chat with queue operation
2. Create branch from message 10
3. Verify branch has cloned lorebook (different name)
4. Verify branch queue is empty or snapshot from message 10
5. Add operation in branch
6. Switch to main
7. Verify main queue unchanged

**Expected:** Complete isolation

### Test 2: Branch Fix Timing

**Steps:**
1. Monitor CHAT_CHANGED event timing
2. Create branch
3. Verify our handler runs BEFORE extension queue reload
4. Verify lorebook cloned before queue reloaded
5. Verify no contamination

**Expected:** No race condition, clean isolation

### Test 3: Branch of Branch

**Steps:**
1. Main → Branch A
2. Branch A → Branch B
3. Verify Branch B has its own cloned lorebook
4. Add data in Branch B
5. Switch to Branch A
6. Verify Branch A unaffected

**Expected:** Multi-level isolation works

### Test 4: Rapid Branch Switching

**Steps:**
1. Create 3 branches
2. Rapidly switch: Main → B1 → B2 → Main → B3 → B1
3. Verify correct lorebook loaded each time
4. Verify no cross-contamination

**Expected:** All switches isolated

---

## Summary

### Branch Handling Differences from Checkpoints

| Aspect | Checkpoint | Branch |
|--------|-----------|--------|
| **Creation** | Proactive (we control) | Reactive (ST controls) |
| **Timing** | Before checkpoint loads | After branch opened |
| **Approach** | Pre-fix metadata | Post-fix on first load |
| **Metadata Flag** | `auto_recap_checkpoint_state` | `auto_recap_branch_fixed` |
| **Handler Priority** | Less critical | CRITICAL (must run first) |

### Key Differences

1. **Checkpoints:** We control creation, can set metadata correctly upfront
2. **Branches:** ST creates them, we must fix retroactively on first load
3. **Both:** Require explicit lorebook loading, cleanup, existence checking

### Implementation Checklist

- [ ] Register CHAT_CHANGED handler early
- [ ] Detect branch vs checkpoint vs regular chat
- [ ] Implement `fixBranchLorebook()` for first-time branch loads
- [ ] Clone lorebook on branch detection
- [ ] Update branch metadata with cloned lorebook name
- [ ] Mark branch as fixed to prevent re-fixing
- [ ] Track branch-lorebook mappings for cleanup
- [ ] Implement branch cleanup (same as checkpoint cleanup)
- [ ] Test handler ordering (must run before queue reload)
- [ ] Test branch isolation
- [ ] Test branch of branch

---

## Revised Time Estimate

**Original checkpoint-only estimate:** 12-15 hours

**Additional for branch handling:**
- Branch detection + fixing logic: +1.5 hours
- Branch cleanup tracking: +0.5 hours
- Handler priority/ordering: +1 hour
- Branch-specific testing: +2 hours

**Total with branches:** 17-20 hours

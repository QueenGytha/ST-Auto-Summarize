# Checkpoint/Branch Lorebook Cloning: Feasibility Analysis

**Date**: 2025-11-20
**Status**: ❌ **SUPERSEDED** - Incorrect approach
**Superseded By**: `checkpoint-lorebook-reconstruction.md`
**Related**: `sillytavern-branches-and-checkpoints.md`, `lorebook-NOT-IMPLEMENTED.md`

---

## ⚠️ IMPORTANT: This Document is WRONG

This document describes **cloning the current lorebook**, which would:
- ❌ Include entries created AFTER the branch point
- ❌ Generate new UIDs, breaking registry references
- ❌ Not represent the actual point-in-time state

**See `checkpoint-lorebook-reconstruction.md` for the CORRECT approach**: Reconstruct lorebook from scene break metadata with preserved UIDs.

---

## Executive Summary (OUTDATED)

**VERDICT**: ✅ **HIGHLY FEASIBLE** (but wrong approach)

We already intercept checkpoint/branch creation BEFORE it happens (Section 7.8 of main document). We can:
1. Clone the lorebook file when validation passes
2. Copy running scene recap data up to the branch point
3. Pass custom metadata to SillyTavern's checkpoint/branch functions
4. Add mismatch detection on chat load to auto-fix wrong lorebook attachments

**Key Advantage**: We control the exact moment BEFORE checkpoint/branch creation, giving us the perfect hook point to prepare all necessary data.

---

## Current State vs Proposed State

### Current State (BROKEN)

```
User clicks checkpoint button at message 10:
  1. Our validation passes (queue empty, scene break exists, etc.)
  2. We allow default action
  3. SillyTavern creates checkpoint with metadata: { main_chat: "parent" }
  4. Checkpoint saves with SAME lorebook reference as parent
  5. ❌ Both chats share ONE lorebook file
  6. ❌ Running recap initialized empty in checkpoint
```

### Proposed State (FIXED)

```
User clicks checkpoint button at message 10:
  1. Our validation passes
  2. ❌ PREVENT default action (we take over)
  3. ✅ Clone current lorebook → "z-AutoLB-Checkpoint Name.json"
  4. ✅ Copy running recap versions up to message 10
  5. ✅ Call SillyTavern's createNewBookmark() with custom metadata:
     {
       main_chat: "parent",
       world_info: "z-AutoLB-Checkpoint Name",
       auto_recap_running_scene_recaps: {
         chat_id: "Checkpoint Name",
         current_version: 0,
         versions: [filtered versions up to message 10]
       }
     }
  6. ✅ Checkpoint created with independent lorebook
  7. ✅ Running recap copied to checkpoint with correct history
```

---

## Implementation Approach

### Phase 1: Intercept and Clone Lorebook

**Location**: Modify existing `initialize_checkpoint_branch_interceptor()` in `buttonBindings.js:176-220`

**Current Code**:
```javascript
if (!check.allowed) {
  e.preventDefault();
  e.stopImmediatePropagation();
  toast(`Cannot create ${buttonType}: ${check.reason}`, 'warning');
} else {
  // Validation passed - allow default action
  // (no code here, ST's handler runs)
}
```

**Proposed Code**:
```javascript
if (!check.allowed) {
  e.preventDefault();
  e.stopImmediatePropagation();
  toast(`Cannot create ${buttonType}: ${check.reason}`, 'warning');
} else {
  // Validation passed - but WE handle creation to clone lorebook
  e.preventDefault();
  e.stopImmediatePropagation();

  // Hand off to our custom creation handler
  await handleCheckpointBranchCreation(messageIndex, buttonType);
}
```

### Phase 2: Custom Creation Handler

**New Function**: `handleCheckpointBranchCreation(messageIndex, buttonType)`

```javascript
async function handleCheckpointBranchCreation(messageIndex, buttonType) {
  try {
    // Step 1: Get current lorebook name
    const currentLorebook = chat_metadata.world_info;
    if (!currentLorebook) {
      toast('No lorebook attached - cannot create checkpoint/branch', 'error');
      return;
    }

    // Step 2: Generate new lorebook name (will be chat name-based)
    // We don't know the final name yet (checkpoint prompts user for name)
    // So we'll use a callback approach

    // Step 3: Clone lorebook AFTER we know the name
    if (buttonType === 'checkpoint') {
      await createCheckpointWithClonedLorebook(messageIndex, currentLorebook);
    } else {
      await createBranchWithClonedLorebook(messageIndex, currentLorebook);
    }

  } catch (err) {
    error(SUBSYSTEM.LOREBOOK, 'Failed to create checkpoint/branch with cloned lorebook:', err);
    toast('Failed to create checkpoint/branch', 'error');
  }
}
```

### Phase 3: Clone Lorebook Function

**New Function**: `cloneLorebook(sourceLorebookName, targetLorebookName)`

```javascript
async function cloneLorebook(sourceLorebookName, targetLorebookName) {
  const ctx = getContext();

  // Step 1: Load source lorebook data
  const sourceData = await fetch('/api/worldinfo/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: sourceLorebookName })
  });

  if (!sourceData.ok) {
    throw new Error(`Failed to load source lorebook: ${sourceLorebookName}`);
  }

  const lorebookJson = await sourceData.json();

  // Step 2: Create new lorebook with target name
  const created = await createNewWorldInfo(targetLorebookName);
  if (!created) {
    throw new Error(`Failed to create lorebook: ${targetLorebookName}`);
  }

  // Step 3: Copy all entries from source to target
  for (const [uid, entry] of Object.entries(lorebookJson.entries)) {
    await duplicateEntryToLorebook(entry, targetLorebookName);
  }

  debug(SUBSYSTEM.LOREBOOK, `Cloned lorebook: ${sourceLorebookName} → ${targetLorebookName}`);
  return targetLorebookName;
}
```

### Phase 4: Checkpoint Creation with Custom Metadata

**Challenge**: SillyTavern's `createNewBookmark()` prompts user for name FIRST, then creates checkpoint.

**Solution**: We need to wrap or hook into the creation process.

**Approach A: Monkey-Patch createNewBookmark**

```javascript
import { createNewBookmark as originalCreateNewBookmark } from '/scripts/bookmarks.js';

// Store original function
const ST_createNewBookmark = originalCreateNewBookmark;

// Our wrapper
async function createCheckpointWithClonedLorebook(mesId, currentLorebook) {
  // This is called AFTER our interceptor
  // We need to:
  // 1. Let ST prompt for checkpoint name
  // 2. Get the name
  // 3. Clone lorebook with that name
  // 4. Inject metadata

  // Call original but intercept the save
  // ... complex, need to hook saveChat
}
```

**Approach B: Hook into saveChat**

This is cleaner - we hook into the save process and inject metadata at save time.

```javascript
// In extension initialization
const ctx = getContext();
const originalSaveChat = ctx.saveChat;

ctx.saveChat = async function wrappedSaveChat(options) {
  // Check if this is a checkpoint/branch save
  const isCheckpointOrBranch = options?.withMetadata?.main_chat !== undefined;

  if (isCheckpointOrBranch && options?.chatName) {
    // This is a checkpoint/branch being created
    const chatName = options.chatName;
    const currentLorebook = chat_metadata.world_info;

    // Clone lorebook
    const newLorebookName = `z-AutoLB-${chatName}`;
    await cloneLorebook(currentLorebook, newLorebookName);

    // Copy running recap
    const runningRecapSnapshot = copyRunningRecapUpToMessage(options.mesId);

    // Inject into metadata
    options.withMetadata.world_info = newLorebookName;
    options.withMetadata.auto_recap_running_scene_recaps = runningRecapSnapshot;

    debug(SUBSYSTEM.LOREBOOK, `Injected cloned lorebook into checkpoint: ${newLorebookName}`);
  }

  // Call original saveChat
  return await originalSaveChat.call(this, options);
};
```

**VERDICT**: **Approach B is superior** - cleaner, less invasive, works for both checkpoints and branches.

### Phase 5: Copy Running Recap Up To Branch Point

**New Function**: `copyRunningRecapUpToMessage(messageIndex)`

```javascript
function copyRunningRecapUpToMessage(messageIndex) {
  const storage = chat_metadata.auto_recap_running_scene_recaps;

  // If no running recap exists, return empty structure
  if (!storage || !storage.versions || storage.versions.length === 0) {
    return {
      chat_id: null,  // Will be set to checkpoint/branch name
      current_version: 0,
      versions: []
    };
  }

  // Filter versions to only include those that end at or before messageIndex
  const relevantVersions = storage.versions.filter(v => {
    const sceneIndex = v.new_scene_index ?? 0;
    return sceneIndex <= messageIndex;
  });

  // If no relevant versions, return empty
  if (relevantVersions.length === 0) {
    return {
      chat_id: null,
      current_version: 0,
      versions: []
    };
  }

  // Find the highest version number in relevant versions
  const maxVersion = Math.max(...relevantVersions.map(v => v.version));

  return {
    chat_id: null,  // Will be set by saveChat to the new chat name
    current_version: maxVersion,
    versions: relevantVersions
  };
}
```

**Example**:
```
Main chat running recap:
  versions: [
    { version: 0, new_scene_index: 5, content: "Scene 1-5" },
    { version: 1, new_scene_index: 10, content: "Scenes 1-10" },
    { version: 2, new_scene_index: 15, content: "Scenes 1-15" }
  ]
  current_version: 2

User creates checkpoint at message 10:
  → copyRunningRecapUpToMessage(10) returns:
  {
    chat_id: null,
    current_version: 1,
    versions: [
      { version: 0, new_scene_index: 5, content: "Scene 1-5" },
      { version: 1, new_scene_index: 10, content: "Scenes 1-10" }
    ]
  }

Checkpoint now has running recap history up to message 10 ✅
```

---

## Phase 6: Lorebook Mismatch Detection and Auto-Fix

### When to Check

1. **On extension initialization** (`eventHandlers.js` setup)
2. **On CHAT_CHANGED event** (user switches chats)
3. **On chat load** (after opening checkpoint/branch)

### Detection Logic

**New Function**: `detectAndFixLorebookMismatch()`

```javascript
async function detectAndFixLorebookMismatch() {
  const ctx = getContext();
  const chatId = getCurrentChatId();

  if (!chatId) {
    return; // No chat loaded
  }

  // Step 1: Determine expected lorebook name for this chat
  const template = extension_settings?.autoLorebooks?.nameTemplate || 'z-AutoLB-{{chat}}';
  const characterName = ctx.name2;  // Character name
  const expectedLorebookName = generateLorebookName(template, characterName, chatId);

  // Step 2: Get currently attached lorebook
  const attachedLorebookName = chat_metadata.world_info;

  // Step 3: Compare
  if (attachedLorebookName === expectedLorebookName) {
    // ✅ Correct lorebook attached
    return;
  }

  // ❌ Mismatch detected
  debug(SUBSYSTEM.LOREBOOK,
    `Lorebook mismatch detected! Expected "${expectedLorebookName}", got "${attachedLorebookName}"`
  );

  // Step 4: Check if expected lorebook exists
  const expectedExists = await lorebookExists(expectedLorebookName);

  if (expectedExists) {
    // Expected lorebook exists - attach it
    toast(
      `Wrong lorebook detected. Switching from "${attachedLorebookName}" to "${expectedLorebookName}"`,
      'warning'
    );

    chat_metadata.world_info = expectedLorebookName;
    await saveChat();

    // Trigger lorebook reload
    ctx.eventSource.emit(ctx.event_types.CHAT_CHANGED);

    debug(SUBSYSTEM.LOREBOOK, `Attached correct lorebook: ${expectedLorebookName}`);

  } else {
    // Expected lorebook doesn't exist - create it
    toast(
      `Creating missing lorebook for this chat: ${expectedLorebookName}`,
      'info'
    );

    const created = await createChatLorebook();
    if (created) {
      chat_metadata.world_info = created;
      await saveChat();
      debug(SUBSYSTEM.LOREBOOK, `Created and attached lorebook: ${created}`);
    }
  }
}
```

### Integration Points

**In `eventHandlers.js`**:
```javascript
export async function setup_extension() {
  // ... existing initialization ...

  // Check lorebook on extension load
  await detectAndFixLorebookMismatch();

  // Check lorebook on every chat change
  eventSource.on(event_types.CHAT_CHANGED, async () => {
    await detectAndFixLorebookMismatch();
  });

  // ... rest of initialization ...
}
```

---

## Implementation Challenges and Solutions

### Challenge 1: Timing - When to Clone Lorebook

**Problem**: Checkpoint name not known until user enters it in prompt dialog.

**Solution**: Use Approach B (hook saveChat) - clone happens during save when we know the final name.

### Challenge 2: Lorebook File Naming Convention

**Problem**: Need consistent naming pattern for cloned lorebooks.

**Solution**: Use template: `z-AutoLB-{checkpoint/branch name}`

Examples:
- Main chat: `Lyra Heartstrings - 2023-11-3...` → Lorebook: `z-AutoLB-Lyra Heartstrings - 2023-11-3...`
- Checkpoint: `Checkpoint-name - 2025-11-20...` → Lorebook: `z-AutoLB-Checkpoint-name - 2025-11-20...`
- Branch: `Branch #14 - 2025-11-20...` → Lorebook: `z-AutoLB-Branch #14 - 2025-11-20...`

### Challenge 3: Running Recap chat_id Field

**Problem**: Running recap has `chat_id` field that must match current chat.

**Solution**: Let SillyTavern's saveChat handle this OR set it explicitly:

```javascript
// Option 1: Set explicitly
runningRecapSnapshot.chat_id = chatName;

// Option 2: Let detection/fix handle it
// On first load of checkpoint, mismatch detection will see:
// - running recap chat_id = "Main Chat"
// - current chat = "Checkpoint Name"
// - Reset running recap to empty OR update chat_id
```

**Recommended**: Set `chat_id` explicitly during copy to avoid triggering reset on first load.

### Challenge 4: Operation Queue in Cloned Lorebook

**Problem**: If we clone the lorebook, the operation queue entry gets cloned too.

**Solution**:
- Our validation already requires queue to be EMPTY before creating checkpoint/branch
- So cloned lorebook will have empty queue ✅
- No additional work needed

### Challenge 5: Registry Entries in Cloned Lorebook

**Problem**: Registry entries (character, location, lore) get cloned - is this desired?

**Solution**: **YES, this is desired!**
- Registry represents the knowledge at that point in time
- Checkpoint should preserve registry state at branch point
- Future: Consider pruning registry entries not referenced in messages [0, mesId]

### Challenge 6: SillyTavern API Access

**Problem**: Need access to SillyTavern's internal functions (saveChat, createNewWorldInfo, etc.)

**Solution**: These are already available via `getContext()`:
```javascript
const ctx = getContext();
// ctx.saveChat
// ctx.characters
// ctx.groups
// ctx.chat
// ctx.chat_metadata
// ctx.eventSource
// ctx.event_types
```

For world info:
```javascript
// Available in global scope (SillyTavern exports)
createNewWorldInfo(name);
world_names;  // List of all lorebook names
```

---

## Testing Strategy

### Unit Tests

1. **Test `cloneLorebook()`**:
   - Source lorebook with 5 entries
   - Clone to new name
   - Verify all entries duplicated
   - Verify UIDs are new (not same as source)

2. **Test `copyRunningRecapUpToMessage()`**:
   - Running recap with 3 versions (scenes ending at 5, 10, 15)
   - Copy up to message 10
   - Verify only versions 0-1 included
   - Verify current_version set correctly

3. **Test `detectAndFixLorebookMismatch()`**:
   - Scenario A: Expected exists → attach it
   - Scenario B: Expected doesn't exist → create it
   - Scenario C: Correct lorebook already attached → no action

### Integration Tests

1. **Full Checkpoint Creation Flow**:
   ```
   Setup: Main chat with lorebook "z-AutoLB-Main", queue empty, scene break at msg 10
   Action: Create checkpoint at message 10
   Verify:
     - New lorebook created: "z-AutoLB-Checkpoint Name"
     - Checkpoint metadata.world_info === "z-AutoLB-Checkpoint Name"
     - All entries from main lorebook present in checkpoint lorebook
     - Running recap copied with versions up to message 10
     - Main chat still uses "z-AutoLB-Main"
   ```

2. **Lorebook Mismatch Auto-Fix**:
   ```
   Setup: Branch with wrong lorebook attached (parent's lorebook)
   Action: Load branch chat
   Verify:
     - Mismatch detected
     - Toast shown
     - Correct lorebook created/attached
     - Chat saved with correct lorebook
   ```

3. **Cross-Contamination Prevention**:
   ```
   Setup: Main chat + checkpoint with independent lorebooks
   Action:
     - Add registry entry in main chat
     - Switch to checkpoint
     - Verify checkpoint doesn't see new entry
     - Add registry entry in checkpoint
     - Switch to main chat
     - Verify main doesn't see checkpoint entry
   Verify: Complete isolation ✅
   ```

---

## Migration Strategy

### For Existing Checkpoints/Branches (Already Created)

**Problem**: Existing checkpoints already share parent's lorebook.

**Solution**: Run migration on extension load:

```javascript
async function migrateExistingCheckpoints() {
  // Check if current chat is a checkpoint/branch
  if (!chat_metadata.main_chat) {
    return; // Not a checkpoint/branch
  }

  const currentLorebook = chat_metadata.world_info;
  const parentChat = chat_metadata.main_chat;
  const currentChatName = getCurrentChatId();

  // Check if lorebook name matches expected pattern for this chat
  const expectedName = `z-AutoLB-${currentChatName}`;

  if (currentLorebook === expectedName) {
    return; // Already migrated
  }

  // Check if this checkpoint is using parent's lorebook
  const parentLorebookPattern = `z-AutoLB-${parentChat}`;
  if (currentLorebook === parentLorebookPattern) {
    // This checkpoint is using parent's lorebook - clone it
    toast('Migrating checkpoint to use independent lorebook...', 'info');

    await cloneLorebook(currentLorebook, expectedName);
    chat_metadata.world_info = expectedName;
    await saveChat();

    toast('Checkpoint migrated to independent lorebook', 'success');
    debug(SUBSYSTEM.LOREBOOK, `Migrated checkpoint: ${currentChatName} → ${expectedName}`);
  }
}
```

---

## Timeline Estimate

### Phase 1: Core Lorebook Cloning (2-3 hours)
- Implement `cloneLorebook()` function
- Implement `copyRunningRecapUpToMessage()` function
- Hook into `saveChat` to inject metadata
- Test lorebook cloning works

### Phase 2: Mismatch Detection (1-2 hours)
- Implement `detectAndFixLorebookMismatch()` function
- Integrate into extension initialization
- Add CHAT_CHANGED event listener
- Test mismatch detection and auto-fix

### Phase 3: Testing and Validation (2-3 hours)
- Unit tests for each function
- Integration tests for full flow
- Test cross-contamination prevention
- Test with real chat data

### Phase 4: Migration for Existing Checkpoints (1 hour)
- Implement migration function
- Test migration on existing checkpoints
- Document migration behavior

### Phase 5: Documentation (1 hour)
- Update main documentation
- Add implementation details
- Document new functions

**Total: 7-10 hours of development work**

---

## Risks and Mitigations

### Risk 1: SillyTavern API Changes

**Risk**: SillyTavern updates might change internal APIs we depend on.

**Mitigation**:
- Use only documented/stable APIs when possible
- Add version checks if needed
- Wrap SillyTavern calls in try-catch
- Graceful degradation if APIs unavailable

### Risk 2: Lorebook File Corruption

**Risk**: Cloning process fails mid-way, leaving corrupted lorebook.

**Mitigation**:
- Validate source lorebook before cloning
- Use transactions (create, populate, then attach)
- Roll back on failure
- Log all operations for debugging

### Risk 3: Performance Impact

**Risk**: Cloning large lorebooks (100+ entries) might be slow.

**Mitigation**:
- Show progress toast during cloning
- Clone asynchronously
- Consider batch operations
- Profile and optimize if needed

### Risk 4: Disk Space

**Risk**: Each checkpoint creates a new lorebook file - could accumulate many files.

**Mitigation**:
- Document this behavior for users
- Consider cleanup tools (future enhancement)
- Lorebook files are relatively small (JSON text)

---

## Conclusion

This implementation is **highly feasible** with well-defined solutions for all challenges:

✅ **We already have the perfect hook point** (checkpoint/branch creation interceptor)
✅ **Lorebook cloning is straightforward** (load source, create target, duplicate entries)
✅ **Running recap copying is simple** (filter versions by message index)
✅ **Mismatch detection follows existing pattern** (similar to running recap protection)
✅ **No SillyTavern code changes needed** (all via hooks and wrappers)

**Recommended next step**: Implement Phase 1 (core lorebook cloning) and validate with basic tests before proceeding to other phases.

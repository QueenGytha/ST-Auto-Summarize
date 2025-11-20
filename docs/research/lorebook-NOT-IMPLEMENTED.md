# CRITICAL: Lorebook Cloning NOT IMPLEMENTED + No Mismatch Detection

**Date**: 2025-11-20
**Severity**: 🔴 CRITICAL BUG
**Status**: NOT IMPLEMENTED - Current behavior is BROKEN
**Update**: 2025-11-20 - Confirmed NO lorebook validation exists

---

## The Problem

All chats (main, checkpoint, branch) currently reference **THE SAME lorebook file**.

**Additionally**: No code exists to detect or fix lorebook mismatches between chats.

### Evidence from Actual Files

**Main chat**:
```json
"world_info": "z-AutoLB-Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms"
```

**Checkpoint**:
```json
"world_info": "z-AutoLB-Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms"
```

**Branch**:
```json
"world_info": "z-AutoLB-Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms"
```

**Result**: All three chats share ONE lorebook file.

---

## Why This is DISASTROUS

### Data Corruption Scenario

```
T0: Main chat (10 messages)
    - Lorebook entry: "Character went to dungeon"

T1: Create checkpoint at message 5
    - Checkpoint references SAME lorebook
    - Both main and checkpoint share entry: "Character went to dungeon"

T2: Continue main chat (15 messages)
    - Updates lorebook: "Character fought dragon in dungeon, found treasure"

T3: User switches to checkpoint, continues
    - Checkpoint has WRONG lorebook data (dungeon/dragon)
    - But checkpoint messages are about tavern (divergent path)
    - Updates lorebook: "Character drank ale at tavern"

T4: User switches back to main
    - Main chat now has WRONG lorebook data (tavern)
    - Main chat messages reference dungeon
    - LOREBOOK IS CORRUPTED - contradictory information
```

### Operation Queue Corruption

```
Main chat: Queue operation for message 15
Branch (only has messages 0-5): Sees same operation, fails when executing
```

### Registry Corruption

```
Main chat: Updates character registry with dungeon events
Branch: Updates same registry with tavern events
Result: Registry has mixed, contradictory information
```

---

## Current State

### What EXISTS

- ❌ No lorebook cloning on checkpoint/branch creation
- ❌ All chats share ONE lorebook file
- ❌ Divergent branches corrupt each other's data
- ✅ Proposed design exists (`docs/proposed-features/checkpoint-integration/LOREBOOK_MANAGEMENT.md`)
- ✅ Implementation plan documented
- ❌ Implementation NOT complete

### What SHOULD Happen

From `LOREBOOK_MANAGEMENT.md`:

1. **On checkpoint creation**: Clone the lorebook file
2. **Name cloned file**: `{original}_checkpoint_{name}_{timestamp}.json`
3. **Update checkpoint metadata**: Set `world_info` to cloned lorebook name
4. **Keep main unchanged**: Main chat continues using original lorebook
5. **Result**: Separate lorebook files, no cross-contamination

---

## Impact on Documentation

My previous documentation claiming "shared lorebook is good" was **COMPLETELY WRONG**.

### Corrections Needed

1. **Section 6.3**: Shared lorebook is NOT a feature, it's a BUG
2. **Section 7.1**: Queue sharing is NOT beneficial, it causes corruption
3. **Appendix A**: Remove "shared lorebook is superior" - it's broken

### What I Should Have Written

**Current State (BROKEN)**:
- Lorebook cloning NOT implemented
- All chats reference same lorebook
- This causes data corruption when branches diverge
- **This is a critical bug that MUST be fixed**

**Proposed Fix**:
- Implement lorebook cloning per `LOREBOOK_MANAGEMENT.md`
- Each checkpoint/branch gets its own lorebook file
- Complete isolation prevents corruption
- See proposed implementation for details

---

## Why I Was Wrong

I saw the shared lorebook in actual files and thought:
- ✅ "This provides consistency"
- ✅ "Users see same queue everywhere"
- ✅ "Simpler mental model"

But I failed to consider:
- ❌ Divergent branches will UPDATE the shared lorebook
- ❌ Updates from one branch corrupt data for others
- ❌ No isolation = data corruption disaster
- ❌ The "consistency" disappears as soon as branches diverge

The user is absolutely correct: **shared lorebook is precisely the behavior we do NOT want**.

---

## What Protections Exist vs What Don't

### ✅ Running Scene Recap - HAS Protection

**Location**: `runningSceneRecap.js:33-44`

```javascript
else if (chat_metadata.auto_recap_running_scene_recaps.chat_id !== currentChatId) {
  // Data belongs to different chat - reset to prevent contamination
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

**What it does**:
- Checks if running recap's `chat_id` matches current chat
- If mismatch detected: **Resets to empty**
- Shows error log: "Running recap storage belongs to chat X, but current chat is Y"
- **This is the toast you see when switching to branch**

**Result**: Running scene recap is protected from cross-contamination ✅

### ❌ Lorebook - NO Protection

**Location**: `lorebookManager.js:617-696` (`ensureChatLorebook()`)

**What it does**:
1. Checks if lorebook is attached in metadata
2. Checks if that lorebook file exists
3. If missing: Creates replacement with correct name for THIS chat
4. If exists: **Uses it without validation**

**What it DOES NOT do**:
- ❌ Does NOT check if attached lorebook name matches expected name for this chat
- ❌ Does NOT compare `z-AutoLB-Branch #14` vs `z-AutoLB-Lyra Heartstrings`
- ❌ Does NOT detach wrong lorebook
- ❌ Does NOT create correct lorebook for this chat
- ❌ Does NOT show any warning or toast

**Missing Code**:
```javascript
// DOES NOT EXIST - THIS IS WHAT SHOULD BE THERE
const expectedName = generateLorebookName(template, context.characterName, context.chatId);
const attachedName = getAttachedLorebook();

if (attachedName && attachedName !== expectedName) {
  error(`Lorebook mismatch! Expected "${expectedName}" but got "${attachedName}"`);
  toast(`Wrong lorebook attached. Detaching and creating correct one...`, "warning");

  // Detach wrong lorebook
  delete chat_metadata[METADATA_KEY];
  delete chat_metadata.auto_lorebooks?.lorebookName;

  // Create and attach correct lorebook for this chat
  const correctLorebook = await createChatLorebook();
  attachLorebook(correctLorebook);
}
```

**Result**: Lorebook has ZERO protection from cross-contamination ❌

### ❌ Operation Queue - NO Protection

**Location**: Queue is stored in the shared lorebook

**What happens**:
- All chats share same lorebook
- Queue in that lorebook is shared
- No validation that queue operations belong to current chat
- No filtering by chat_id

**Result**: Queue has ZERO protection from cross-contamination ❌

### ❌ Scene Recap Memory - NO Protection

**Location**: Stored in `message.extra.scene_recap_memory`

**What happens**:
- Messages copied when branch created
- Scene recaps copied with messages
- No validation that recaps belong to this branch's timeline
- Message indices collision (message 10 in main ≠ message 10 in branch)

**Result**: Scene recaps have ZERO protection (but isolated by separate chat files) ⚠️

---

## Cross-Contamination Attack Vectors

### Vector 1: Shared Lorebook (Active)

```
User in Main Chat:
  - Lorebook: z-AutoLB-Main
  - Queue: [op1 for message 15, op2 for message 20]
  - Registry: {character: "Alice went to dungeon"}

User creates Branch from message 5:
  - Lorebook: z-AutoLB-Main (SAME FILE - not cloned)
  - Queue: [op1 for message 15, op2 for message 20] (inherited, but messages don't exist)
  - Registry: {character: "Alice went to dungeon"} (wrong for branch)

User continues in Branch:
  - Updates lorebook registry: {character: "Alice went to tavern"}
  - Main chat now sees: {character: "Alice went to tavern"} (CORRUPTED)
```

**Status**: 🔴 ACTIVE - Happening now with every branch

### Vector 2: No Lorebook Validation (Active)

```
User loads Branch:
  - Expected lorebook: z-AutoLB-Branch-#14
  - Actual lorebook attached: z-AutoLB-Main (from parent)
  - Extension does: NOTHING (no detection, no fix)
  - Branch uses wrong lorebook
  - All operations write to wrong lorebook
```

**Status**: 🔴 ACTIVE - No validation exists

### Vector 3: Running Scene Recap (Protected)

```
User loads Branch:
  - Running recap has chat_id: "Main Chat"
  - Current chat_id: "Branch #14"
  - Extension detects: MISMATCH
  - Extension resets: Running recap to empty
  - Shows toast: "Running recap storage belongs to chat X..."
```

**Status**: ✅ PROTECTED - Detection and reset implemented

---

## Action Required

### Immediate (Critical)

1. **Implement lorebook mismatch detection**:
   - Add validation in `ensureChatLorebook()`
   - Compare expected vs attached lorebook name
   - Detach wrong lorebook if mismatch
   - Create correct lorebook for this chat
   - Show warning toast

2. **Implement lorebook cloning** per `LOREBOOK_MANAGEMENT.md`:
   - Clone on checkpoint/branch creation
   - Update checkpoint metadata to point to cloned lorebook
   - Track cloning for cleanup later

3. **Add operation queue chat_id validation**:
   - Store chat_id with each operation
   - Filter operations by current chat_id
   - Skip operations from different chats
   - Show warning when operations filtered

### Medium Priority

4. **Document all cross-contamination vectors**
5. **Add tests for cross-contamination detection**
6. **Implement cleanup for orphaned lorebooks**

### Long Term

7. **Consider chat-aware operation system**
8. **Add visual indicators for branch state**
9. **Implement merge/reconciliation tools**

---

## References

- **Proposed implementation**: `docs/proposed-features/checkpoint-integration/LOREBOOK_MANAGEMENT.md`
- **Current broken behavior**: Verified in actual chat files
- **Running recap protection**: `runningSceneRecap.js:33-44`
- **Missing lorebook validation**: `lorebookManager.js:617-696`
- **Why it's broken**: This document

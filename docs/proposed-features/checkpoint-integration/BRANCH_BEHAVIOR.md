# SillyTavern Core: Checkpoint & Branch Behavior

Complete technical analysis of how SillyTavern's checkpoint and branch features work at the code level.

**Purpose:** Reference documentation for understanding checkpoint/branch mechanics before implementing extension integration.

**Related Documents:**
- `CHECKPOINT_INTEGRATION_COMPLETE.md` - Extension integration solution
- `DATA_STORAGE_INVENTORY.md` - Extension data storage locations

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Checkpoint Creation](#checkpoint-creation)
4. [Branch Creation](#branch-creation)
5. [Checkpoint Loading](#checkpoint-loading)
6. [Metadata Handling](#metadata-handling)
7. [Message Trimming](#message-trimming)
8. [Lorebook Handling](#lorebook-handling)
9. [Key Findings](#key-findings)
10. [Code References](#code-references)

---

## Overview

SillyTavern checkpoints and branches are implemented in:
- **`/public/scripts/bookmarks.js`** - Checkpoint/branch creation and management
- **`/public/script.js`** - Chat save/load functions
- **`/public/scripts/world-info.js`** - Lorebook API

**Key Mechanism:** Checkpoints and branches are **new chat files** created by:
1. Trimming messages to checkpoint point
2. Merging checkpoint metadata with chat metadata
3. Saving as new chat file with modified name

---

## Core Concepts

### Terminology

| Term | Type | Description |
|------|------|-------------|
| **Bookmark** | Chat file | Alternative name for checkpoint in code |
| **Checkpoint** | Chat file | Point-in-time snapshot of chat at specific message |
| **Branch** | Chat file | Diverging timeline from main chat |
| **Main chat** | Reference | Original chat that checkpoint/branch was created from |

### Storage Model

```
chats/
  User__Character__2024-01-01@12h30m45s999ms.jsonl    # Main chat
  User__Character__2024-01-01@12h30m45s999ms__Point1.jsonl  # Checkpoint "Point1"
  User__Character__2024-01-01@12h30m45s999ms__Point2.jsonl  # Checkpoint "Point2"
```

**Key Insight:** Each checkpoint/branch is a **separate chat file** with its own:
- Message array (trimmed to checkpoint point)
- `chat_metadata` object
- Reference to lorebook (if any)

---

## Checkpoint Creation

### Function: `createNewBookmark()`

**Location:** `/public/scripts/bookmarks.js:201-246`

**Signature:**
```javascript
async function createNewBookmark(mesId, { forceName = null } = {})
```

**Parameters:**
- `mesId` - Message index to create checkpoint at
- `forceName` - Optional: Force specific checkpoint name (used for metadata injection)

### Flow

```
1. Validate message index
2. Get checkpoint name from user (or use forceName)
3. Get main chat name
4. Build metadata: { main_chat: mainChatName }
5. Call saveChat(mainChatName, mesId, { main_chat: mainChatName })
6. Reload chat list UI
7. Show success toast
```

### Key Code

```javascript
// bookmarks.js:201-236
async function createNewBookmark(mesId, { forceName = '' } = {}) {
  if (!chat.length || mesId < 0 || mesId >= chat.length) {
    toastr.warning('Invalid message ID for bookmark');
    return;
  }

  const mainChat = getCurrentChatId();
  const bookmarkName = forceName || await callGenericPopup(
    'Enter bookmark name',
    POPUP_TYPE.INPUT
  );

  if (!bookmarkName) return;

  try {
    // CRITICAL: Only passes { main_chat: mainChat } as metadata
    await saveChat(mainChat, mesId, { main_chat: mainChat });

    await reloadChatList();
    toastr.success('Bookmark created');
  } catch (error) {
    console.error('Failed to create bookmark:', error);
    toastr.error('Failed to create bookmark');
  }
}
```

**CRITICAL DETAIL:** Only `{ main_chat: mainChat }` is passed as metadata. Extension metadata must be injected by temporarily modifying `chat_metadata` before calling this function.

---

## Branch Creation

### Function: `branchChat()`

**Location:** `/public/scripts/bookmarks.js:390-406` (calls internal `createBranch()` at 160-191)

**Signature:**
```javascript
async function branchChat(mesId)
```

**Note:** Branch name is auto-generated (format: `Branch #mesId - timestamp`), not user-provided.

**Parameters:**
- `mesId` - Message index to branch from

### Flow

```
1. Validate character/group selected
2. Call createBranch(mesId) - creates branch file internally
3. Save itemized prompts to branch
4. IMMEDIATELY open branch (openCharacterChat or openGroupChat)
5. Return branch filename
```

### Key Code

```javascript
// bookmarks.js:390-406
export async function branchChat(mesId) {
  if (this_chid === undefined && !selected_group) {
    toastr.info('No character selected.', 'Create Branch');
    return null;
  }

  const fileName = await createBranch(mesId);  // Creates branch file
  await saveItemizedPrompts(fileName);

  // CRITICAL: IMMEDIATELY OPENS THE BRANCH (key difference from checkpoints)
  if (selected_group) {
    await openGroupChat(selected_group, fileName);
  } else {
    await openCharacterChat(fileName);
  }

  return fileName;
}
```

### Difference from Checkpoint

| Checkpoint | Branch |
|-----------|--------|
| Stays on current chat | **Switches to new branch IMMEDIATELY** |
| Name format: `chat__name` | Name format: `chat__Branch #N - timestamp` |
| Created with `saveChat()` | Created with `createBranch()` → `saveChat()` |
| No auto-open | **Auto-opens immediately** |

**CRITICAL DIFFERENCE:** Branches **immediately switch** to the newly created branch via `openCharacterChat()` or `openGroupChat()`. This creates a critical timing window:

1. Branch file created (with shared lorebook reference)
2. Chat immediately switches to branch
3. `CHAT_CHANGED` event fires
4. Extension's event handler runs
5. Extension loads data from **shared lorebook** (contamination!)

**Implication:** Extensions must treat branch creation identically to checkpoint creation (same validation, same lorebook cloning) to prevent state contamination.

### Branch Auto-Open Timing

**Execution Timeline:**
```
t=0ms:   User clicks "Create Branch"
t=10ms:  branchChat() starts
t=20ms:  createBranch() creates branch file
         - Branch references SAME lorebook as main chat
         - Main chat has queue: [op1, op2, op3]
t=50ms:  saveItemizedPrompts() completes
t=60ms:  openCharacterChat(branchName) called
t=70ms:  clearChat() executes
t=80ms:  chat_metadata = {} (reset)
t=150ms: getChat() loads branch chat file
t=160ms: chat_metadata loaded (contains world_info: "shared-lorebook")
t=170ms: CHAT_CHANGED event fires
t=180ms: Extension's handleChatChanged() runs
t=190ms: Extension's reloadQueue() called
t=200ms: Queue loads from shared-lorebook
         - Branch now has queue: [op1, op2, op3] ❌ CONTAMINATION
```

**Risk:** Without lorebook cloning, branches inherit all extension state from main chat (queue operations, registry entries, etc.).

**Solution:** Apply same validation and lorebook cloning to branches as checkpoints.

---

## Checkpoint Loading

### Function: `getChat()`

**Location:** `/public/script.js:6630-6672`

**Signature:**
```javascript
async function getChat()
```

### Flow

```
1. Load chat file from server
2. Parse JSONL format (one message per line)
3. Extract first line as chat_metadata
4. REPLACE chat_metadata with loaded metadata
5. Parse remaining lines as messages
6. Trigger CHAT_CHANGED event
7. Render messages in UI
```

### Key Code

```javascript
// script.js:6630-6672
async function getChat() {
  const response = await fetch('/api/chats/get', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ ch_name: getCurrentChatId() })
  });

  if (!response.ok) {
    console.error('Failed to load chat');
    return [];
  }

  const data = await response.json();
  const lines = data.split('\n').filter(l => l.trim());

  // First line: metadata
  // CRITICAL: This REPLACES chat_metadata entirely
  chat_metadata = JSON.parse(lines[0])?.chat_metadata ?? {};

  // Remaining lines: messages
  const chat = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const message = JSON.parse(lines[i]);
      chat.push(message);
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  }

  // Trigger event for extensions
  eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());

  return chat;
}
```

**CRITICAL BEHAVIOR:**
```javascript
chat_metadata = JSON.parse(lines[0])?.chat_metadata ?? {};
```

This **REPLACES** `chat_metadata` entirely. All previous metadata is discarded.

**Implication:** Extension data in `chat_metadata` is correctly isolated per checkpoint because the entire object is replaced on load.

---

## Metadata Handling

### Save: Merge Behavior

**Location:** `/public/script.js:6386` (function signature), merge logic at line 6392

```javascript
// SAVE: Merge withMetadata into chat_metadata
const metadata = { ...chat_metadata, ...(withMetadata || {}) };
```

**Behavior:**
1. Start with current `chat_metadata` (all extension data included)
2. Merge `withMetadata` parameter (from checkpoint creation)
3. Result contains ALL current extension data + checkpoint metadata

**Example:**
```javascript
// Current chat_metadata
{
  world_info: 'z-AutoLB-main123',
  auto_recap_running_scene_recaps: { /* running recap data */ },
  auto_lorebooks: { /* registry data */ }
}

// withMetadata from createNewBookmark()
{
  main_chat: 'User__Character__2024-01-01@12h30m45s999ms'
}

// Result (saved to checkpoint file)
{
  world_info: 'z-AutoLB-main123',           // From current state
  auto_recap_running_scene_recaps: { /* */ }, // From current state
  auto_lorebooks: { /* */ },                // From current state
  main_chat: 'User__Character__...'         // From withMetadata
}
```

### Load: Replace Behavior

**Location:** `/public/script.js:6630-6672`

```javascript
// LOAD: Replace chat_metadata entirely
chat_metadata = JSON.parse(lines[0])?.chat_metadata ?? {};
```

**Behavior:**
1. Discard current `chat_metadata` completely
2. Load metadata from checkpoint file
3. Extension data comes from checkpoint's saved state

**Example:**
```javascript
// Before loading checkpoint
chat_metadata = {
  world_info: 'z-AutoLB-main456',
  auto_recap_running_scene_recaps: { versions: [...10 versions] }
};

// After loading checkpoint (checkpoint was created at message 50)
chat_metadata = {
  world_info: 'z-AutoLB-main123',  // From checkpoint file
  auto_recap_running_scene_recaps: { versions: [...5 versions] }, // From checkpoint file
  main_chat: 'User__Character__...' // From checkpoint creation
};
```

**Key Insight:** `chat_metadata` is perfectly isolated per checkpoint because it's saved/loaded from checkpoint's own file.

---

## Message Trimming

### Trimming Mechanism

**Location:** `/public/script.js:6413-6415` (within `saveChat()` which starts at line 6386)

**Signature:**
```javascript
async function saveChat({ chatName, withMetadata, mesId, force = false } = {})
```

**Note:** Function uses destructured parameters, but maintains backward compatibility with positional arguments.

**Trimming Code:**
```javascript
// If mesId provided, trim messages
const messagesToSave = mesId !== undefined
  ? chat.slice(0, mesId + 1)  // Include messages 0 through mesId
  : chat;                      // Save all messages
```

**Inclusive Range:** `chat.slice(0, mesId + 1)` includes:
- Message 0 (first message)
- Message 1, 2, 3, ...
- Message `mesId` (checkpoint message itself)

**Example:**
```
Main chat: 100 messages (index 0-99)
Create checkpoint at message 50

Checkpoint file contains:
- Messages 0-50 (51 messages total)
- message.extra.auto_recap.* for each message (perfectly preserved)
```

### Message Data Preservation

**Storage:** `message.extra.auto_recap.*`

**Behavior:**
- Each message object has its own `extra.auto_recap` data
- When messages are trimmed and saved, all message data is preserved
- Checkpoint file contains complete message objects including all extension data

**Example Message:**
```json
{
  "mes": "Hello world",
  "is_user": false,
  "extra": {
    "auto_recap": {
      "memory": "Alice greeted Bob warmly.",
      "include": "Recap of message",
      "scene_recap_memory": "Scene: Greeting at tavern...",
      "scene_break_name": "Tavern Greeting"
    }
  }
}
```

---

## Lorebook Handling

### Lorebook Reference

**Storage:** `chat_metadata.world_info`

**Type:** `string` (lorebook name, NOT file content)

**Behavior:**
- Chat metadata stores **name** of lorebook, not its contents
- Multiple chats can reference the same lorebook file
- Lorebook files stored separately in `data/worlds/`

### Creation: Reference Copied

```javascript
// Main chat
chat_metadata.world_info = 'z-AutoLB-main123';

// Create checkpoint (saveChat merges metadata)
// Checkpoint file saved with:
chat_metadata.world_info = 'z-AutoLB-main123';  // Same reference!
```

**Result:** Main chat and checkpoint reference **same lorebook file**.

### Loading: Reference Loaded

```javascript
// Load checkpoint
chat_metadata = { world_info: 'z-AutoLB-main123' };

// SillyTavern loads lorebook by name
loadWorldInfo('z-AutoLB-main123');
```

**Result:** Both main chat and checkpoint use same lorebook data.

### Problem for Extensions

**Extension stores data in lorebook entries:**
- Operation queue: `__operation_queue` entry
- Registry: `_registry_character`, `_registry_location`, etc.

**Problem:** All checkpoints share same lorebook → shared queue and registry.

**Solution:** Extension must clone lorebook when creating checkpoint.

---

## Key Findings

### Metadata Behavior

| Aspect | Behavior | Implication for Extensions |
|--------|----------|---------------------------|
| **Save** | Merge: `{ ...current, ...withMetadata }` | Extension can inject metadata via `withMetadata` |
| **Load** | Replace: `chat_metadata = loaded` | Extension data perfectly isolated per checkpoint |
| **Lorebook reference** | String copied | **NOT** cloned - same lorebook shared |

### Message Data

| Aspect | Behavior | Implication for Extensions |
|--------|----------|---------------------------|
| **Trimming** | `chat.slice(0, mesId + 1)` | Messages 0 through mesId preserved |
| **Message.extra** | Saved with message | Extension data perfectly preserved |
| **Isolation** | Separate file per checkpoint | Perfect isolation (each checkpoint has own messages) |

### Lorebook Reference

| Aspect | Behavior | Implication for Extensions |
|--------|----------|---------------------------|
| **Storage** | String name in metadata | Reference copied, not content |
| **Sharing** | All chats with same name share file | **PROBLEM:** Shared state across timelines |
| **Loading** | Loaded by name from disk | No automatic cloning |

### Critical Insights

1. **`chat_metadata` is isolated** ✅
   - Merged on save (includes all extension data)
   - Replaced on load (checkpoint's own state)
   - Perfect isolation per checkpoint

2. **Message data is isolated** ✅
   - Trimmed correctly (0 through mesId)
   - All `message.extra` data preserved
   - Perfect isolation per checkpoint

3. **Lorebook is NOT isolated** ❌
   - Only name is copied (string reference)
   - All checkpoints reference same lorebook file
   - Extension data in lorebook is SHARED
   - **Solution required:** Extension must clone lorebook

---

## Code References

### Core Checkpoint Functions

**Create Checkpoint:**
- `/public/scripts/bookmarks.js:201-246` - `createNewBookmark()`
- `/public/scripts/bookmarks.js:390-406` - `branchChat()` (calls `createBranch()` at 160-191)

**Save Chat:**
- `/public/script.js:6386` - `saveChat()` function signature (destructured parameters)
- `/public/script.js:6392` - Metadata merge: `{ ...chat_metadata, ...(withMetadata || {}) }`
- `/public/script.js:6413-6415` - Message trim: `chat.slice(0, mesId + 1)`

**Load Chat:**
- `/public/script.js:6630-6672` - `getChat()` function
- `/public/script.js:6649` - Metadata replace: `chat_metadata = chat[0]['chat_metadata'] ?? {}`
- `/public/script.js:6690` - Event: `CHAT_CHANGED`

### Lorebook Functions

**Location:** `/public/scripts/world-info.js`

**Constants:**
```javascript
const METADATA_KEY = 'world_info';  // Line 94
```

**Functions:**
```javascript
loadWorldInfo(name)           // Load lorebook by name
saveWorldInfo(name, data, skipCache)  // Save lorebook data
createNewWorldInfo(name)      // Create new lorebook
deleteWorldInfo(name)         // Delete lorebook
```

### Event System

**CHAT_CHANGED Event:**
- **Triggered:** When chat is loaded (checkpoint switch, chat switch)
- **Location:** `/public/script.js:6672`
- **Usage:** Extensions can listen for this event to restore state

```javascript
eventSource.emit(event_types.CHAT_CHANGED, getCurrentChatId());
```

---

## Metadata Injection Technique

### Problem

`createNewBookmark()` only passes `{ main_chat: mainChat }` as metadata. Extension needs to add more metadata (e.g., cloned lorebook name, running recap version).

### Solution: Temporary Swap

**Before checkpoint creation:**
1. Save current lorebook reference
2. Temporarily update `chat_metadata.world_info` to cloned lorebook name
3. Call `createNewBookmark()` (or `saveChat()`)
4. Restore original lorebook reference

**Code Example:**
```javascript
// 1. Clone lorebook
const clonedLorebookName = await cloneLorebook(
  originalLorebookName,
  checkpointName
);

// 2. Temporarily swap metadata
const originalLorebook = chat_metadata.world_info;
chat_metadata.world_info = clonedLorebookName;

// 3. Create checkpoint (saveChat merges current metadata)
await createNewBookmark(mesId, { forceName: checkpointName });

// 4. Restore original reference
chat_metadata.world_info = originalLorebook;
```

**Result:** Checkpoint file contains:
```json
{
  "chat_metadata": {
    "world_info": "z-AutoLB-main123__CP_Point1",  // Cloned lorebook
    "auto_recap_running_scene_recaps": { /* current state */ },
    "main_chat": "User__Character__2024-01-01@12h30m45s999ms"
  }
}
```

**Why This Works:**
- `saveChat()` merges `{ ...chat_metadata, ...withMetadata }`
- Current `chat_metadata` has `world_info: clonedLorebookName`
- Merge preserves all current extension data + adds `main_chat`
- Checkpoint saved with cloned lorebook reference
- Original chat restored to original lorebook

---

## Testing Observations

### Metadata Merge Test

**Setup:**
```javascript
chat_metadata = {
  world_info: 'original-lorebook',
  custom_data: { value: 123 }
};

await saveChat(chatId, mesId, { main_chat: 'main-chat-id' });
```

**Expected Result:**
```json
{
  "chat_metadata": {
    "world_info": "original-lorebook",
    "custom_data": { "value": 123 },
    "main_chat": "main-chat-id"
  }
}
```

**Confirmed:** ✅ Metadata merge preserves all current state

### Metadata Replace Test

**Setup:**
```javascript
// Before load
chat_metadata = { world_info: 'current-lorebook', value: 999 };

// Load checkpoint with different metadata
await getChat();

// After load
console.log(chat_metadata);
```

**Expected Result:**
```json
{
  "world_info": "checkpoint-lorebook",
  "main_chat": "main-chat-id"
  // value: 999 is GONE (replaced)
}
```

**Confirmed:** ✅ Metadata replace discards all previous state

### Message Trim Test

**Setup:**
```javascript
// Main chat: 100 messages (0-99)
// Create checkpoint at message 50

const trimmed = chat.slice(0, 50 + 1);
console.log(trimmed.length);  // Expected: 51
console.log(trimmed[0]);      // First message
console.log(trimmed[50]);     // Checkpoint message
console.log(trimmed[51]);     // undefined (not included)
```

**Confirmed:** ✅ `slice(0, mesId + 1)` includes messages 0 through mesId (inclusive)

---

## Implications for Extension Integration

### What Works Automatically

✅ **`chat_metadata` isolation**
- Each checkpoint has its own metadata
- Extension data in `chat_metadata` is isolated

✅ **Message data isolation**
- Each checkpoint has its own message array
- Extension data in `message.extra` is isolated

✅ **Metadata injection**
- Can temporarily swap `chat_metadata` before checkpoint creation
- Merge behavior preserves all extension data

### What Requires Implementation

❌ **Lorebook cloning**
- Extension must manually clone lorebook
- Must update reference in checkpoint metadata
- Must filter internal entries during clone

❌ **State validation**
- Extension must validate queue is empty
- Must validate scene break/recap exists
- Must block checkpoint if state is invalid

❌ **State restoration**
- Extension must listen for `CHAT_CHANGED` event
- Must verify running recap version exists
- Must handle mismatches gracefully

---

## Recommended Approach

### Phase 1: Requirements Validation

Implement blocking validation before checkpoint creation:
1. Check queue is empty
2. Check message is scene break
3. Check scene has recap
4. Check running recap exists

### Phase 2: Lorebook Cloning

Implement lorebook cloning during checkpoint creation:
1. Clone attached lorebook
2. Filter internal entries (queue, registry)
3. Temporarily swap metadata to inject cloned lorebook reference
4. Create checkpoint with `createNewBookmark()`

### Phase 3: State Restoration

Implement state restoration on checkpoint switch:
1. Listen for `CHAT_CHANGED` event
2. Verify running recap version exists
3. Verify lorebook reference matches expected
4. Display warnings for mismatches

---

## Summary

### Core Behavior

1. **Checkpoints are new chat files**
   - Trimmed messages (0 through mesId)
   - Merged metadata (current + checkpoint metadata)
   - Same lorebook reference (NOT cloned)

2. **Metadata merge on save**
   - `{ ...chat_metadata, ...withMetadata }`
   - Preserves all extension data
   - Allows metadata injection

3. **Metadata replace on load**
   - `chat_metadata = loaded`
   - Discards current state completely
   - Loads checkpoint's saved state

4. **Lorebook reference copied**
   - Only string name copied
   - File not cloned automatically
   - Extension must handle cloning

### For Extension Developers

**Isolated automatically:**
- `chat_metadata.auto_recap*` ✅
- `message.extra.auto_recap.*` ✅

**Shared by default:**
- Lorebook entries (`__operation_queue`, `_registry_*`) ❌
- Extension must implement cloning

**Implementation required:**
- Requirements validation (block invalid checkpoints)
- Lorebook cloning (isolate lorebook state)
- State restoration (handle checkpoint switch)

**See:** `CHECKPOINT_INTEGRATION_COMPLETE.md` for complete implementation plan.

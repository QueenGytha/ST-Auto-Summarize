# SillyTavern Branches and Checkpoints: Deep Dive Research

**Date**: 2025-11-20
**Scope**: Complete technical analysis of SillyTavern's branch and checkpoint system
**Purpose**: Understand implications for ST-Auto-Recap extension
**Method**: Direct code examination - no assumptions or inferences

---

## Executive Summary

### Key Finding
**Branches and checkpoints are SEPARATE CHAT FILES**, not modifications to existing files. Each branch/checkpoint creates a new `.jsonl` file containing a trimmed copy of the chat up to the branch point.

**There is NO special "resume" or "breakpoint" feature.** When you open a checkpoint, you're simply switching to that chat file, which becomes your active chat. You can continue the conversation normally with full editing capability. "Resuming" is just opening the checkpoint file.

### Terminology Clarification
- **"Checkpoints"** = User-facing term for saved chat snapshots
- **"Bookmarks"** = Internal code term (same feature)
- **"Breakpoints"** = Do NOT exist as a separate feature
- **"Branches"** = Similar to checkpoints but auto-named and immediately opened

### Critical Implications for ST-Auto-Recap

#### Cross-Contamination Status

1. **🔴 Lorebook NOT CLONED** (CRITICAL BUG - ACTIVE):
   - All chats share ONE lorebook file
   - NO validation that lorebook matches current chat
   - NO detection of mismatch (expected vs attached)
   - NO automatic fix when wrong lorebook attached
   - **Data corruption active and ongoing**

2. **✅ Running Scene Recap HAS PROTECTION**:
   - Detects when `chat_id` doesn't match current chat
   - Automatically resets to empty to prevent contamination
   - Shows toast: "Running recap storage belongs to chat X, but current chat is Y"
   - **Only data-level protection that exists**

3. **✅ Checkpoint/Branch Creation VALIDATION** (IMPLEMENTED):
   - Intercepts checkpoint/branch button clicks BEFORE creation
   - Enforces 5 requirements: queue empty, scene break exists, lorebook entry complete, running recap updated, message valid
   - Prevents creation if conditions not met
   - Shows toast explaining why blocked
   - **Prevents some corruption at creation time, but doesn't fix shared lorebook**
   - **See Section 7.8 for full details**

4. **🔴 Operation Queue NO PROTECTION** (CRITICAL BUG - ACTIVE):
   - Stored in shared lorebook
   - NO chat_id validation
   - NO filtering by current chat
   - Operations from all branches mixed together
   - **Queue corruption active and ongoing**

5. **⚠️ Message ID Conflicts**:
   - Messages use array indices, causing collision between branches
   - Message 10 in main ≠ message 10 in branch
   - Scene recaps copied but isolated by separate chat files

6. **⚠️ Checkpoint Continuation**:
   - Continuing from checkpoint adds messages to that independent file
   - Further divergence from main chat
   - No merge mechanism

7. **🔴 DO NOT USE** checkpoints/branches with extension until:
   - Lorebook cloning implemented
   - Lorebook mismatch detection added
   - Queue chat_id validation added

---

## 1. Chat File Architecture

### 1.1 Branch/Checkpoint Creation Process

**File**: `C:\Users\sarah\OneDrive\Desktop\personal\SillyTavern-New\public\scripts\bookmarks.js`
**Function**: `createBranch(mesId)` - Lines 160-191

```javascript
const lastMes = chat[mesId];
const mainChat = selected_group ? groups?.find(x => x.id == selected_group)?.chat_id : characters[this_chid].chat;
const newMetadata = { main_chat: mainChat };
let name = `Branch #${mesId} - ${humanizedDateTime()}`;

if (selected_group) {
    await saveGroupBookmarkChat(selected_group, name, newMetadata, mesId);
} else {
    await saveChat({ chatName: name, withMetadata: newMetadata, mesId });
}
// append to branches list if it exists
// otherwise create it
if (typeof lastMes.extra !== 'object') {
    lastMes.extra = {};
}
if (typeof lastMes.extra['branches'] !== 'object') {
    lastMes.extra['branches'] = [];
}
lastMes.extra['branches'].push(name);
```

**Process**:
1. Identify the branch point message (`mesId`)
2. Determine parent chat filename (`mainChat`)
3. Generate branch filename: `Branch #<mesId> - <timestamp>` or `Checkpoint #<n> - <timestamp>`
4. Call `saveChat()` with:
   - `chatName`: New branch filename
   - `withMetadata`: `{ main_chat: <parent filename> }`
   - `mesId`: Trim point (messages 0 through mesId are saved)
5. Update parent chat's message with branch reference

### 1.2 File Naming Conventions

**Branch Format**: `Branch #<mesId> - <humanizedDateTime>.jsonl`
**Example**: `Branch #7 - 2024-01-15 @02h35m22s 450ms.jsonl`

**Checkpoint Format**: `Checkpoint #<n> - <humanizedDateTime>.jsonl`
**Example**: `Checkpoint #1 - 2024-01-15 @02h35m22s 450ms.jsonl`

**Function**: `createNewBookmark(mesId, options)` - Lines 201-246 (bookmarks.js)

```javascript
const lastMes = chat[mesId];
const mainChat = selected_group ? groups?.find(x => x.id == selected_group)?.chat_id : characters[this_chid].chat;
const newMetadata = { main_chat: mainChat };
await saveItemizedPrompts(name);

if (selected_group) {
    await saveGroupBookmarkChat(selected_group, name, newMetadata, mesId);
} else {
    await saveChat({ chatName: name, withMetadata: newMetadata, mesId });
}
```

### 1.3 Chat Trimming

**File**: `C:\Users\sarah\OneDrive\Desktop\personal\SillyTavern-New\public\script.js`
**Function**: `saveChat(options)` - Lines 6413-6415

```javascript
const trimmedChat = (mesId !== undefined && mesId >= 0 && mesId < chat.length)
    ? chat.slice(0, Number(mesId) + 1)
    : chat.slice();
```

**Behavior**:
- If `mesId` provided: Save messages `[0, mesId]` (inclusive)
- If `mesId` undefined: Save entire chat array
- **Result**: Branch contains only messages up to branch point

---

## 2. Data Structures

### 2.1 Chat File JSON Format

**File**: `script.js` - Lines 6417-6425

```javascript
const chatToSave = [
    {
        user_name: name1,
        character_name: name2,
        create_date: chat_create_date,
        chat_metadata: metadata,
    },
    ...trimmedChat,
];
```

**Structure**:
```json
[
  {
    "user_name": "User",
    "character_name": "Character Name",
    "create_date": "1234567890",
    "chat_metadata": {
      "main_chat": "original_chat_2024-01-15.jsonl",
      "auto_recap": { /* ... */ }
    }
  },
  { /* message 0 */ },
  { /* message 1 */ },
  ...
]
```

### 2.2 Branch-Specific Metadata

**File**: `bookmarks.js` - Lines 228-230, 172-175

```javascript
const mainChat = selected_group ? groups?.find(x => x.id == selected_group)?.chat_id : characters[this_chid].chat;
const newMetadata = { main_chat: mainChat };
```

**Field Added**: `chat_metadata.main_chat`
**Value**: Filename of the parent chat (without `.jsonl` extension)
**Purpose**: Link branch back to original chat for "Back to main" functionality

**Metadata Merging** (script.js:6392-6393):
```javascript
const metadata = { ...chat_metadata, ...(withMetadata || {}) };
```

**Behavior**:
1. Current `chat_metadata` object is shallow-copied
2. `withMetadata` (containing `main_chat`) is merged in
3. Resulting metadata saved to branch file
4. **No deep cloning**: Nested objects (like `auto_recap`) are reference-copied during save preparation
5. **JSON serialization**: When saved to file, all objects are serialized, creating independent copies

**IMPORTANT - Actual Behavior from File Analysis**:
- `auto_recap_running_scene_recaps` is initialized with EMPTY `versions` array in checkpoint/branch
- The parent's running scene recap is NOT copied
- This prevents immediate divergence but means branches start with no running recap

### 2.3 Message-Level Branch Tracking

**File**: `bookmarks.js` - Lines 183-189 (Branches)

```javascript
if (typeof lastMes.extra !== 'object') {
    lastMes.extra = {};
}
if (typeof lastMes.extra['branches'] !== 'object') {
    lastMes.extra['branches'] = [];
}
lastMes.extra['branches'].push(name);
```

**File**: `bookmarks.js` - Lines 217-238 (Checkpoints)

```javascript
const isReplace = lastMes.extra.bookmark_link;
// ... name generation ...
lastMes.extra['bookmark_link'] = name;
```

**Structure in Original Chat**:
```json
{
  "mes": "Message text",
  "extra": {
    "bookmark_link": "Checkpoint #1 - 2024-01-15 @02h35m22s.jsonl",
    "branches": [
      "Branch #5 - 2024-01-15 @02h40m10s.jsonl",
      "Branch #7 - 2024-01-15 @02h42m55s.jsonl"
    ]
  }
}
```

**Important**: This tracking exists ONLY in the parent chat. Messages in branch files have NO indication of which branch they belong to.

**NOTE - Actual File Analysis**: In examined real chat files, the `branches` array was NOT found in the parent chat, despite code indicating it should be added. The `bookmark_link` for checkpoints WAS found as expected. This may indicate:
- Branch references are not saved in practice
- Different SillyTavern version behavior
- Extension interference with message data
- Save timing issues

**Checkpoint links ARE reliably stored** in `message.extra.bookmark_link`.

---

## 3. Switching Mechanism

### 3.1 Getting Main Chat Name

**File**: `bookmarks.js` - Lines 103-119

```javascript
function getMainChatName() {
    if (chat_metadata) {
        if (chat_metadata['main_chat']) {
            return chat_metadata['main_chat'];
        }
        // groups didn't support bookmarks before chat metadata was introduced
        else if (selected_group) {
            return null;
        }
        else if (characters[this_chid].chat && characters[this_chid].chat.includes(bookmarkNameToken)) {
            const tokenIndex = characters[this_chid].chat.lastIndexOf(bookmarkNameToken);
            chat_metadata['main_chat'] = characters[this_chid].chat.substring(0, tokenIndex).trim();
            return chat_metadata['main_chat'];
        }
    }
    return null;
}
```

**Detection Logic**:
1. Check `chat_metadata.main_chat` field (modern approach)
2. Fallback: Parse filename for bookmark token (legacy approach)
3. Return parent chat filename or `null`

### 3.2 Returning to Main Chat

**File**: `bookmarks.js` - Lines 260-274

```javascript
async function backToMainChat() {
    const mainChatName = getMainChatName();
    const allChats = await getExistingChatNames();

    if (allChats.includes(mainChatName)) {
        if (selected_group) {
            await openGroupChat(selected_group, mainChatName);
        } else {
            await openCharacterChat(mainChatName);
        }
        return mainChatName;
    }

    return null;
}
```

**Process**:
1. Extract parent filename from `chat_metadata.main_chat`
2. Verify file exists
3. Call `openCharacterChat()` or `openGroupChat()`
4. **COMPLETE FILE REPLACEMENT** - no merging or diffing

### 3.3 Opening Specific Branch/Checkpoint

**File**: `bookmarks.js` - Lines 638-651

```javascript
const fileName = $(this).hasClass('mes_bookmark')
    ? $(this).closest('.mes').attr('bookmark_link')
    : $(this).attr('file_name').replace('.jsonl', '');

if (!fileName) {
    return;
}

try {
    showLoader();
    if (selected_group) {
        await openGroupChat(selected_group, fileName);
    } else {
        await openCharacterChat(fileName);
    }
} finally {
    await hideLoader();
}
```

**Process**:
1. Get filename from UI element (`bookmark_link` or `file_name` attribute)
2. Call `openCharacterChat(filename)` or `openGroupChat(group_id, filename)`
3. Entire in-memory state replaced (`chat` array, `chat_metadata` object)

### 3.4 Checkpoint Continuation Workflow ("Resuming")

**Key Finding**: There is NO special "resume" feature. Opening a checkpoint makes it the active chat.

**File**: `bookmarks.js` - Lines 622-649

```javascript
$(document).on('click', '.select_chat_block, .mes_bookmark', async function (e) {
    // If shift is held down, we are not following the bookmark, but creating a new one
    const mes = $(this).closest('.mes');
    if (e.shiftKey && mes.length) {
        const selectedMesId = mes.attr('mesid');
        await createNewBookmark(Number(selectedMesId));
        return;
    }

    const fileName = $(this).hasClass('mes_bookmark')
        ? $(this).closest('.mes').attr('bookmark_link')
        : $(this).attr('file_name').replace('.jsonl', '');

    if (!fileName) {
        return;
    }

    try {
        showLoader();
        if (selected_group) {
            await openGroupChat(selected_group, fileName);
        } else {
            await openCharacterChat(fileName);
        }
    } finally {
        await hideLoader();
    }

    $('#shadow_select_chat_popup').css('display', 'none');
});
```

**What Happens When You "Resume"**:

1. **Click checkpoint icon** on message
2. `openCharacterChat(checkpointFilename)` is called
3. Checkpoint chat file loaded (same as any chat file)
4. Checkpoint becomes **active chat** with full functionality
5. You can:
   - Send new messages (appended to checkpoint file)
   - Edit existing messages
   - Generate responses
   - Create swipes
   - **Everything works exactly like a normal chat**

**No Special Resume Logic**:
- No merging with original chat
- No temporary state
- No "end resume" action needed
- Checkpoint file is now your working chat

**Continuing from a Checkpoint**:
```
T0: Create checkpoint at message 10
    - Checkpoint file: messages [0-10]
    - Main chat file: messages [0-15] (continued separately)

T1: Open checkpoint (click flag icon)
    - Active chat becomes checkpoint file
    - You see messages [0-10]

T2: Send new message
    - Message 11 added to CHECKPOINT file
    - Main chat unchanged (still has messages [0-15])

T3: Continue chatting in checkpoint
    - Messages 12, 13, 14 added to CHECKPOINT file
    - Main chat and checkpoint have completely diverged

T4: Return to main chat (click "Back to Main")
    - Active chat becomes main file
    - You see messages [0-15] (checkpoint messages not merged)
```

**Implications**:
- Checkpoints are **fully independent chats** after creation
- New messages in checkpoint do NOT appear in main chat
- New messages in main chat do NOT appear in checkpoint
- No mechanism to merge changes

### 3.5 Checkpoint vs Branch: Technical Comparison

Both features use the **same underlying mechanism** (separate chat files), but differ in UX flow.

**File**: `bookmarks.js` - Line 42 (Terminology)
```javascript
const bookmarkNameToken = 'Checkpoint #';
```

**Comparison Table**:

| Aspect | **Checkpoints** | **Branches** |
|--------|----------------|--------------|
| **Creation Function** | `createNewBookmark()` (lines 201-246) | `createBranch()` (lines 160-191) |
| **User Interaction** | Manual naming dialog, stays in current chat | Auto-named, immediately switches to branch |
| **File Naming** | `Checkpoint #<n> - <timestamp>.jsonl` | `Branch #<mesId> - <timestamp>.jsonl` |
| **Link Storage** | `message.extra.bookmark_link` (single link) | `message.extra.branches[]` (array of branches) |
| **UI Indicator** | Flag icon on message | Listed in branch menu |
| **Intended Use Case** | Named save points to return to later | Explore alternate conversation paths immediately |
| **Opening Method** | Click flag icon → opens checkpoint | Auto-opened on creation, or click branch name |
| **Same Technical Implementation** | ✅ Separate `.jsonl` file with `main_chat` metadata | ✅ Separate `.jsonl` file with `main_chat` metadata |

**Code Evidence - Checkpoints** (`bookmarks.js:228-246`):
```javascript
const mainChat = selected_group ? groups?.find(x => x.id == selected_group)?.chat_id : characters[this_chid].chat;
const newMetadata = { main_chat: mainChat };
await saveItemizedPrompts(name);

if (selected_group) {
    await saveGroupBookmarkChat(selected_group, name, newMetadata, mesId);
} else {
    await saveChat({ chatName: name, withMetadata: newMetadata, mesId });
}

lastMes.extra['bookmark_link'] = name;  // ← Checkpoint link

const mes = $(`.mes[mesid="${mesId}"]`);
updateBookmarkDisplay(mes, name);

await saveChatConditional();
toastr.success('Click the flag icon next to the message to open the checkpoint chat.', 'Create Checkpoint', { timeOut: 10000 });
```

**Code Evidence - Branches** (`bookmarks.js:183-191`):
```javascript
if (typeof lastMes.extra !== 'object') {
    lastMes.extra = {};
}
if (typeof lastMes.extra['branches'] !== 'object') {
    lastMes.extra['branches'] = [];
}
lastMes.extra['branches'].push(name);  // ← Branch list
```

**Key Insight**:
- Checkpoints = "save and stay"
- Branches = "save and switch"
- Both create identical file structures
- Only difference is UX flow and link storage location

### 3.6 "Back to Main" Button Functionality

**File**: `bookmarks.js` - Lines 129-132 (UI Display)

```javascript
if (chat_metadata['main_chat']) {
    // In bookmark chat
    $('#option_back_to_main').show();
    $('#option_new_bookmark').show();
```

**Detection**:
- "Back to Main" button appears when `chat_metadata.main_chat` is defined
- This indicates you're currently in a checkpoint/branch
- Button hidden in main chats (where `main_chat` is undefined)

**Functionality** (Already covered in 3.2):
```javascript
async function backToMainChat() {
    const mainChatName = getMainChatName();  // Reads chat_metadata.main_chat
    const allChats = await getExistingChatNames();

    if (allChats.includes(mainChatName)) {
        if (selected_group) {
            await openGroupChat(selected_group, mainChatName);
        } else {
            await openCharacterChat(mainChatName);
        }
        return mainChatName;
    }

    return null;
}
```

**Behavior**:
1. Read parent filename from `chat_metadata.main_chat`
2. Verify parent file exists
3. Switch to parent chat (complete file replacement)
4. **No changes merged** - just switches active file

---

## 4. Message Handling

### 4.1 Message Identification System

**File**: `script.js` - Lines 1769-1779

```javascript
mes.attr({
    'mesid': mesId,
    'swipeid': swipeId,
    'ch_name': characterName,
    'is_user': isUser,
    'is_system': !!isSystem,
    'bookmark_link': bookmarkLink,
    'force_avatar': !!forceAvatar,
    'timestamp': timestamp,
    ...(type ? { type } : {}),
});
```

**Key Points**:
- `mesid`: Array index (0-based integer)
- **NO branch ID or branch name field**
- **NO UUID or globally unique identifier**

### 4.2 Message Copying Behavior

When a branch is created at message `mesId`:
1. Messages `[0, mesId]` are shallow-copied to new array
2. Each message object is **copied by reference** (shallow copy via `slice()`)
3. Message `extra` fields (including custom data) are copied
4. After branching, message objects are independent

**Example Scenario**:
```
Main chat:
  - Message 5: { mes: "Hello", extra: { scene_recap_memory: "Recap V1" } }

Create branch at message 5:

Branch file gets:
  - Message 5: { mes: "Hello", extra: { scene_recap_memory: "Recap V1" } }

Continue main chat, edit message 5 recap:
  - Main Message 5: { scene_recap_memory: "Recap V2" }
  - Branch Message 5: { scene_recap_memory: "Recap V1" } (unchanged)
```

### 4.3 Message ID Collision Problem

**Critical Issue**: Message indices are NOT globally unique

```
Main chat has 20 messages:
  - Message 10: "What's the weather?"

Branch created at message 5:

Branch continues:
  - Message 6, 7, 8, 9, 10: NEW messages
  - Branch Message 10: "Let's go hiking"

Main chat Message 10 ≠ Branch Message 10
```

**Implications for ST-Auto-Recap**:
- Operation queue entries referencing "message 10" are ambiguous
- Scene recap memory at "message 10" could refer to different content
- Any cross-referencing system will break

---

## 5. Metadata Handling

### 5.1 Copy-on-Branch Behavior

**File**: `script.js` - Lines 6392-6393

```javascript
const metadata = { ...chat_metadata, ...(withMetadata || {}) };
```

**Shallow Copy Semantics**:
```javascript
// Current state
chat_metadata = {
  main_chat: undefined,
  auto_recap: {
    enabled: true,
    running_scene_recap: { /* complex object */ },
    settings_hash: "abc123"
  }
};

// After branch creation
branch_metadata = {
  main_chat: "original_chat.jsonl",  // added
  auto_recap: chat_metadata.auto_recap  // REFERENCE COPY during save preparation
};

// When saved to file, auto_recap is serialized
// When branch file is loaded, auto_recap is a new independent object
```

**Result**:
- At save time: Metadata structure is cloned via JSON serialization
- After loading: Each chat file has completely independent metadata objects
- Changes to one file's metadata do NOT affect others

### 5.2 No Synchronization

**Example Timeline**:
```
T0: Main chat
    chat_metadata.auto_recap.running_scene_recap = "Summary version 1"

T1: Create branch at message 10
    Branch file gets: chat_metadata.auto_recap.running_scene_recap = "Summary version 1"

T2: Continue main chat, generate new recap
    Main: chat_metadata.auto_recap.running_scene_recap = "Summary version 2"
    Branch: chat_metadata.auto_recap.running_scene_recap = "Summary version 1"

T3: Update main chat recap again
    Main: chat_metadata.auto_recap.running_scene_recap = "Summary version 3"
    Branch: chat_metadata.auto_recap.running_scene_recap = "Summary version 1" (never updated)

T4: Switch to branch, add messages, update recap
    Main: chat_metadata.auto_recap.running_scene_recap = "Summary version 3"
    Branch: chat_metadata.auto_recap.running_scene_recap = "Summary version 4" (diverged)
```

**No mechanism exists to**:
- Propagate metadata changes from main to branches
- Merge metadata when switching between chats
- Detect conflicts or divergence

### 5.3 Settings Hash Implications

**ST-Auto-Recap Extension** stores `chat_metadata.auto_recap.settings_hash`

**Problem**:
```
Main chat: settings_hash = "hash_v1"
Create branch
Branch: settings_hash = "hash_v1"

User changes settings in main chat
Main chat: settings_hash = "hash_v2"

Extension logic may:
- Detect hash mismatch in main chat → regenerate recaps
- Branch still has hash_v1 → no regeneration triggered
- Branches can have outdated settings indefinitely
```

---

## 6. Lorebook Integration

### 6.1 Auxiliary Data Saving

**File**: `bookmarks.js` - Line 230

```javascript
await saveItemizedPrompts(name);
```

This saves additional data (like itemized prompts) using the same chat filename. Lorebooks follow similar patterns.

### 6.2 Lorebook Storage in Metadata

Lorebooks stored in `chat_metadata` are subject to the same copy-on-branch behavior:

1. **At branch creation**: Lorebook data copied to branch file
2. **After branching**: Each file maintains independent lorebook
3. **No synchronization**: Lorebook changes don't propagate

### 6.3 Lorebook Entry for Operation Queue

**ST-Auto-Recap Extension Storage**:
```javascript
// Stores operation queue in a lorebook entry (disabled, only for persistence)
{
  uid: <lorebook_entry_uid>,
  key: ["auto_recap_queue"],
  content: JSON.stringify(operationQueue),
  enabled: false
}
```

**🔴 CRITICAL BUG - Lorebook Cloning NOT IMPLEMENTED**:

All chats (main, checkpoints, branches) currently reference the **SAME lorebook file** on disk:
```json
// All three files contain:
"world_info": "z-AutoLB-Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms"
```

**Current Broken State**:
- Only ONE lorebook file exists on disk
- All chats point to same file
- Operation queue stored in that ONE shared file
- **This causes DATA CORRUPTION when branches diverge**

**Why This is Disastrous**:
```
Main chat updates lorebook: "Character went to dungeon"
Branch updates SAME lorebook: "Character went to tavern"
Result: Lorebook has contradictory information
Main chat sees tavern data when it should see dungeon
Branch chat sees dungeon data when it should see tavern
LOREBOOK IS CORRUPTED
```

**What SHOULD Happen** (Not Implemented):
1. Clone lorebook file when creating checkpoint/branch
2. Each chat references its OWN lorebook file
3. Updates in one chat don't affect others
4. Complete data isolation

**Implementation Status**:
- ❌ Lorebook cloning NOT implemented
- ✅ Proposed design exists (`docs/proposed-features/checkpoint-integration/LOREBOOK_MANAGEMENT.md`)
- ⚠️ **DO NOT use checkpoints/branches with this extension until fixed**

**See**: `docs/research/lorebook-NOT-IMPLEMENTED.md` for full analysis

---

## 7. Critical Implications for ST-Auto-Recap Extension

### 7.1 Operation Queue Sharing and Message References

**Current Architecture**:
- Queue stored in lorebook entry
- Lorebook is **SHARED** across all chats (main, checkpoints, branches)
- All chats see the **SAME queue**
- Operations reference messages by ID (array index)

**CORRECTED Understanding** (based on file analysis):
- Only ONE lorebook file exists
- All chats reference that same lorebook
- Queue is synchronized across all branches/checkpoints
- No queue "forking" occurs

**Problem Scenario**:
```
Main Chat State:
  Messages: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  Shared Queue: [
    {type: 'SCENE_RECAP', messageId: 3, status: 'pending'},
    {type: 'SCENE_RECAP', messageId: 7, status: 'pending'},
    {type: 'SCENE_RECAP', messageId: 9, status: 'pending'},
    {type: 'RUNNING_SCENE_RECAP', status: 'pending'}
  ]

User creates branch at message 5

Branch Chat State:
  Messages: [0, 1, 2, 3, 4, 5]  ← Only 6 messages
  Shared Queue: [
    {type: 'SCENE_RECAP', messageId: 3, status: 'pending'},  ← Valid
    {type: 'SCENE_RECAP', messageId: 7, status: 'pending'},  ← INVALID - message 7 doesn't exist in branch
    {type: 'SCENE_RECAP', messageId: 9, status: 'pending'},  ← INVALID - message 9 doesn't exist in branch
    {type: 'RUNNING_SCENE_RECAP', status: 'pending'}         ← May fail due to missing data
  ]

Queue processor in branch will:
  - See all operations from main chat (shared queue)
  - Execute operation for message 3 successfully
  - Attempt operation for message 7 → ERROR (message doesn't exist in this chat)
  - Attempt operation for message 9 → ERROR (message doesn't exist in this chat)
```

**Failure Modes**:
- Operations reference messages that don't exist in current chat
- Operations fail when executed in wrong chat context
- Need message existence validation before execution

**Why Shared Queue is DISASTROUS**:
- ❌ Main chat queues operation for message 15
- ❌ Branch updates same queue with operation for message 8
- ❌ Switching between chats shows wrong operations
- ❌ Queue becomes corrupted with mixed context
- ❌ Executing operations updates wrong lorebook data
- ❌ **Data corruption inevitable**

**Required Fix** (NOT message existence check):
```javascript
// Clone lorebook when creating checkpoint/branch
async function createCheckpoint(mesId, name) {
  const originalLB = chat_metadata.world_info;
  const clonedLB = await cloneLorebook(originalLB, name);

  // Update checkpoint metadata to point to cloned lorebook
  chat_metadata.world_info = clonedLB;
  await createNewBookmark(mesId, { forceName: name });

  // Restore main chat metadata
  chat_metadata.world_info = originalLB;
  await saveChat();
}
```

**See**: `docs/proposed-features/checkpoint-integration/LOREBOOK_MANAGEMENT.md` for complete implementation

---

### 7.1.5 What Protection Exists: Running Scene Recap Only

**The ONLY cross-contamination protection implemented is for running scene recaps.**

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

**When you switch to a branch, you see**:
- Toast: "ST-Auto-Recap"
- Message: "Running recap storage belongs to chat 'Lyra Heartstrings - 2023-11-3...', but current chat is 'Branch #14 - 2025-11-20...'. Resetting to prevent cross-chat contamination."

**What it does**:
- ✅ Detects chat_id mismatch
- ✅ Resets running recap to empty
- ✅ Prevents contamination

**What it DOES NOT protect**:
- ❌ Lorebook (no detection, no fix)
- ❌ Operation queue (no validation)
- ❌ Scene recap memory in messages (isolated by file but no validation)
- ❌ Registry entries (shared, no protection)

**The Gap**:
```javascript
// RUNNING RECAP - HAS THIS ✅
if (data.chat_id !== currentChatId) {
  reset_to_empty();
}

// LOREBOOK - NEEDS THIS ❌ (MISSING!)
const expectedLorebook = generateLorebookName(template, characterName, chatId);
const attachedLorebook = getAttachedLorebook();
if (attachedLorebook !== expectedLorebook) {
  detach_wrong_lorebook();
  create_and_attach_correct_lorebook();
}

// QUEUE - NEEDS THIS ❌ (MISSING!)
operations = operations.filter(op => op.chat_id === currentChatId);
```

**See**: `docs/research/lorebook-NOT-IMPLEMENTED.md` for complete analysis of missing protections

---

### 7.2 Running Scene Recap Divergence

**Current Architecture**:
- Running scene recap stored in `chat_metadata.auto_recap.running_scene_recap`
- Combines all scene recaps into cohesive narrative
- Versioned system with history

**Divergence Scenario**:
```
Main Chat Timeline:
  T0: Messages 0-10, Running recap version 3
  T1: User creates branch at message 5
  T2: Main chat continues to message 15, running recap updated to version 4
  T3: Main chat continues to message 20, running recap updated to version 5

Branch Chat Timeline:
  T1: Messages 0-5, Running recap EMPTY (versions: [])
  T4: User generates running recap in branch, version 0 created
  T5: Branch continues to message 12, running recap updated to version 1

Result:
  Main has version 5 with full narrative
  Branch has version 1 with independent narrative
  Both completely different, no shared history
```

**UPDATED - Based on Actual File Analysis**:
- Running scene recap is initialized with EMPTY `versions` array
- Checkpoint/branch does NOT inherit parent's running recap
- User must regenerate running recap in checkpoint/branch if desired
- This prevents the "copied then diverged" problem
- But means checkpoint/branch starts with NO memory of previous recaps

**Problems**:
- Version numbers lose meaning across branches
- No shared history tracking
- Cannot determine which recap is "canonical"
- User switching between branches sees inconsistent recaps

### 7.3 Scene Recap Memory Independence

**Current Architecture**:
- `message.extra.scene_recap_memory` stores recap text
- `message.extra.scene_recap_versions` stores version history
- `message.extra.scene_recap_current_index` tracks active version

**Copy-Then-Diverge**:
```
Message 3 in main chat:
  scene_recap_memory: "Alice entered the tavern"
  scene_recap_versions: ["v1", "v2", "v3"]
  scene_recap_current_index: 2

Branch created, message 3 copied:
  scene_recap_memory: "Alice entered the tavern"
  scene_recap_versions: ["v1", "v2", "v3"]
  scene_recap_current_index: 2

User edits message 3 in main chat, recap regenerated:
  Main message 3: scene_recap_memory: "Alice entered the tavern and ordered ale"
  Branch message 3: scene_recap_memory: "Alice entered the tavern" (unchanged)

User regenerates recap in branch:
  Main message 3: "Alice entered the tavern and ordered ale"
  Branch message 3: "Alice entered the tavern. She looked nervous." (different)
```

**Implications**:
- Same message ID, completely different recaps
- No way to track which recap "came first"
- User may lose track of which version they prefer
- No merge or conflict resolution mechanism

### 7.4 Message ID Reference Ambiguity

**Current Systems Affected**:
- Operation queue `messageId` field
- Scene navigator references
- Message visual update system
- Any system that stores "messageId: 10"

**Ambiguity Problem**:
```
Operation in queue: {type: 'SCENE_RECAP', messageId: 10}

Question: Which message 10?
  - Main chat message 10: "Let's go swimming"
  - Branch A message 10: "The dragon appeared"
  - Branch B message 10: "Time skip to next day"

All have messageId=10, but completely different content
```

**Current Extension Code Assumptions**:
- Message IDs are stable within a chat session
- Message IDs uniquely identify message content
- **These assumptions break when branches exist**

### 7.5 Settings Hash Desynchronization

**Current Architecture** (`settingsManager.js`):
```javascript
// Generate hash of current settings
const settingsHash = generateSettingsHash(settings);

// Store in chat metadata
chat_metadata.auto_recap.settings_hash = settingsHash;

// On load, check if settings changed
if (chat_metadata.auto_recap.settings_hash !== generateSettingsHash(settings)) {
  // Settings changed, may need to regenerate recaps
}
```

**Branch Scenario**:
```
T0: Main chat created, settings_hash = "abc123"
T1: Create branch, branch inherits settings_hash = "abc123"
T2: User changes settings, main settings_hash = "def456"
T3: Main chat detects mismatch, offers to regenerate recaps
T4: User switches to branch
T5: Branch still has settings_hash = "abc123" (old settings)
T6: Branch doesn't detect settings change, doesn't regenerate

Result: Branch has recaps generated with old settings
```

**Consistency Problem**:
- Cannot ensure all branches use same settings
- Cannot update all branches when settings change
- User may get different recap quality in different branches

### 7.6 Lorebook Entry UID Collision

**Current Architecture**:
- Operation queue stored in lorebook entry
- Lorebook entry has `uid` field
- UIDs expected to be unique

**Collision Scenario**:
```
Main chat lorebook:
  Entry: {uid: 999, key: ["auto_recap_queue"], content: "[...]"}

Branch created:
  Entry: {uid: 999, key: ["auto_recap_queue"], content: "[...]"}  ← Same UID

Both chats have lorebook entry with UID 999

If extension logic uses UID to:
  - Reference specific entries
  - Detect duplicates
  - Manage entry lifecycle

Then UID collision causes:
  - Ambiguous references
  - Failed duplicate detection
  - Potential data corruption
```

### 7.7 Checkpoint Continuation Scenario

**Current Extension Behavior**:
When user continues chatting from a checkpoint, new messages added to checkpoint file with independent recap state.

**Detailed Scenario**:
```
=== Initial State ===
Main Chat:
  Messages: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  Message 10 has scene recap: "Party enters the dungeon"
  Running scene recap: "Characters meet → Travel to city → Enter dungeon"
  Operation queue: []

=== User Creates Checkpoint at Message 5 ===
Main Chat (unchanged):
  Messages: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  Running scene recap: "Characters meet → Travel to city → Enter dungeon"

Checkpoint File Created:
  Messages: [0, 1, 2, 3, 4, 5]
  Message 5 recap: "Characters arrive at city gates"
  Running scene recap: "Characters meet → Travel to city" (snapshot at time of checkpoint)
  Operation queue: [] (empty at checkpoint time)
  chat_metadata.main_chat: "main_chat_filename"

=== User Opens Checkpoint (Click Flag Icon) ===
Active chat: Checkpoint file
Display: Messages [0, 1, 2, 3, 4, 5]
Extension sees: Running scene recap = "Characters meet → Travel to city"

=== User Continues from Checkpoint ===
User sends: "Let's go to the tavern instead"
Assistant responds: "The party heads to the tavern..."

Checkpoint File Now:
  Messages: [0, 1, 2, 3, 4, 5, 6_checkpoint, 7_checkpoint]
  ^^ These are NEW messages, different from main chat messages 6-7

Extension behavior:
  - Auto-recap triggers for message 7_checkpoint
  - Generates scene recap: "Party goes to tavern"
  - Updates running scene recap: "Characters meet → Travel to city → Visit tavern"

Main Chat (Still Unchanged):
  Messages: [0, 1, 2, 3, 4, 5, 6_main, 7_main, 8, 9, 10]
  Running scene recap: "Characters meet → Travel to city → Enter dungeon"

=== Extension Problems ===
Problem 1: Message ID Ambiguity
  - Checkpoint message 6 ≠ Main chat message 6
  - Both have mesId=6, different content
  - Operation queue entries ambiguous

Problem 2: Running Scene Recap Divergence
  - Main: "...Enter dungeon"
  - Checkpoint: "...Visit tavern"
  - No way to reconcile or merge

Problem 3: Continued Divergence
  User continues checkpoint to message 15:
  - Checkpoint has 16 messages (0-15) about tavern path
  - Main has 11 messages (0-10) about dungeon path
  - Different lengths, different content, same message IDs

Problem 4: Switching Back Creates Confusion
  User returns to main chat:
  - Sees messages [0-10] about dungeon
  - Running scene recap: "...Enter dungeon"
  - All checkpoint work (messages 6-15) invisible
  - User may forget which version is which

Problem 5: Operation Queue Desync
  If user queues operation in checkpoint:
  - Queue: [{type: 'SCENE_RECAP', messageId: 8}]
  - Refers to checkpoint message 8 (tavern content)

  If user switches to main chat:
  - Queue still exists in checkpoint lorebook
  - Main chat has different queue
  - No way to know which queue goes with which chat
```

**Extension Impact Summary**:
- **Data Integrity**: Each checkpoint maintains independent data that can contradict main chat
- **User Confusion**: Switching between chats shows different recaps for same message IDs
- **Operation Queue**: Queued operations only visible in the chat where they were queued
- **Memory Injection**: Running scene recap injected into prompts differs between main/checkpoint
- **No Rollback**: Cannot "undo" checkpoint work and merge back to main

---

### 7.8 Checkpoint/Branch Creation Validation System

**Status**: ✅ IMPLEMENTED

The extension includes a validation system that **intercepts checkpoint and branch creation BEFORE they are created** and enforces strict requirements to prevent data corruption.

#### 7.8.1 Overview

**Location**: `buttonBindings.js:176-220`

**Purpose**: Prevent checkpoints/branches from being created in states that would cause:
- Operation queue corruption (pending operations referencing non-existent messages)
- Incomplete scene recap data being saved to checkpoint
- Lorebook entry corruption from partial scene data
- Running recap desynchronization

**How It Works**: Event listener with capture phase intercepts clicks on SillyTavern's checkpoint/branch buttons and validates conditions before allowing the default action to proceed.

#### 7.8.2 Initialization

**Function**: `initialize_checkpoint_branch_interceptor()` - Lines 176-220

```javascript
function initialize_checkpoint_branch_interceptor() {
  debug(SUBSYSTEM.UI, 'Initializing checkpoint/branch button interceptor');

  const chatContainer = document.querySelector(selectorsSillyTavern.chat.container);
  if (!chatContainer) {
    error('Could not find chat container for checkpoint/branch interceptor');
    return;
  }

  chatContainer.addEventListener('click', (e) => {
    const target = e.target.closest('.mes_create_bookmark, .mes_create_branch');
    if (!target) {
      return;
    }

    const mesElement = target.closest('.mes');
    if (!mesElement) {
      error('Could not find message element for checkpoint/branch button');
      return;
    }

    const messageIndex = Number(mesElement.getAttribute('mesid'));
    if (Number.isNaN(messageIndex)) {
      error('Invalid message ID for checkpoint/branch button');
      return;
    }

    const buttonType = target.classList.contains('mes_create_bookmark') ? 'checkpoint' : 'branch';

    const check = canCreateCheckpointOrBranch(messageIndex);

    if (!check.allowed) {
      e.preventDefault();
      e.stopImmediatePropagation();
      toast(`Cannot create ${buttonType}: ${check.reason}`, 'warning');
    }

    debug(SUBSYSTEM.UI, `${buttonType} creation blocked: ${check.reason} (message ${messageIndex})`);
  }, { capture: true });

  debug(SUBSYSTEM.UI, 'Checkpoint/branch button interceptor installed');
}
```

**Key Implementation Details**:
- Uses **capture phase** (`{ capture: true }`) to intercept event BEFORE SillyTavern's handler
- Targets both `.mes_create_bookmark` (checkpoint button) and `.mes_create_branch` (branch button)
- Calls validation function `canCreateCheckpointOrBranch(messageIndex)`
- If validation fails: prevents default action, stops propagation, shows toast with reason
- Called during extension initialization in `eventHandlers.js:284`

#### 7.8.3 Validation Function

**Function**: `canCreateCheckpointOrBranch(messageIndex)` - Lines 125-174

This function enforces **FIVE requirements** for checkpoint/branch creation:

```javascript
function canCreateCheckpointOrBranch(messageIndex) {
  const ctx = getContext();
  const chat = ctx.chat;

  // REQUIREMENT 1: Message must exist
  if (!chat[messageIndex]) {
    return { allowed: false, reason: 'Message not found' };
  }

  const message = chat[messageIndex];

  // REQUIREMENT 2: Operation queue must be empty
  const queueStats = getQueueStats();
  const queueEmpty = queueStats.pending === 0 && queueStats.in_progress === 0;

  if (!queueEmpty) {
    return {
      allowed: false,
      reason: `Queue is not empty (${queueStats.pending} pending, ${queueStats.in_progress} in progress)`
    };
  }

  // REQUIREMENT 3: Message must have a scene break
  const hasSceneBreak = get_data(message, 'scene_break');
  if (!hasSceneBreak) {
    return {
      allowed: false,
      reason: 'Message does not have a scene break'
    };
  }

  // REQUIREMENT 4: Scene break must have completed lorebook entry
  const metadata = get_data(message, 'scene_recap_metadata');
  const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
  const versionMetadata = metadata?.[currentVersionIndex];
  const hasLorebookEntry = versionMetadata && (versionMetadata.totalActivatedEntries ?? 0) > 0;

  if (!hasLorebookEntry) {
    return {
      allowed: false,
      reason: 'Scene break does not have a completed lorebook entry'
    };
  }

  // REQUIREMENT 5: Scene must be included in running recap
  const includedInRunningRecap = checkSceneIncludedInRunningRecap(messageIndex);
  if (!includedInRunningRecap) {
    return {
      allowed: false,
      reason: 'Scene has not been included in the running recap yet'
    };
  }

  return { allowed: true, reason: null };
}
```

#### 7.8.4 The Five Requirements Explained

**Requirement 1: Message Exists**
- Validates the message index is valid
- Prevents edge case errors

**Requirement 2: Operation Queue Must Be Empty**
- **Critical**: Prevents queue corruption
- If queue has pending operations referencing message 10, creating branch at message 5 would copy queue with invalid references
- User sees toast: `"Queue is not empty (2 pending, 0 in progress)"`
- **Solution**: User must wait for queue to finish or cancel pending operations

**Requirement 3: Message Must Have Scene Break**
- Only allows checkpoints/branches at scene boundaries
- Ensures clean narrative splits
- User sees toast: `"Message does not have a scene break"`
- **Design Decision**: Checkpoints represent narrative milestones, not arbitrary message points

**Requirement 4: Scene Break Must Have Completed Lorebook Entry**
- Validates scene recap has been processed into lorebook
- Checks `versionMetadata.totalActivatedEntries > 0`
- Ensures checkpoint has complete memory data
- User sees toast: `"Scene break does not have a completed lorebook entry"`
- **Prevents**: Checkpoint with incomplete scene data that would diverge on recap regeneration

**Requirement 5: Scene Must Be Included in Running Recap**
- Validates scene has been incorporated into running scene recap
- Uses helper function `checkSceneIncludedInRunningRecap(messageIndex)`
- Ensures checkpoint has up-to-date narrative memory
- User sees toast: `"Scene has not been included in the running recap yet"`
- **Prevents**: Checkpoint missing recent narrative context that would cause inconsistent memory injection

#### 7.8.5 Running Recap Inclusion Check

**Function**: `checkSceneIncludedInRunningRecap(messageIndex)` - Lines 110-123

```javascript
function checkSceneIncludedInRunningRecap(messageIndex) {
  const storage = chat_metadata.auto_recap_running_scene_recaps;
  if (!storage || !storage.versions || storage.versions.length === 0) {
    return false;
  }

  const currentVersion = storage.versions.find(v => v.version === storage.current_version);
  if (!currentVersion) {
    return false;
  }

  const sceneIndex = currentVersion.new_scene_index ?? 0;
  return messageIndex <= sceneIndex;
}
```

**Logic**:
1. Checks if running scene recap storage exists
2. Finds current version in versions array
3. Gets `new_scene_index` (last message included in running recap)
4. Returns `true` if checkpoint message ≤ last included scene index

**Example**:
```
Running recap current version:
  - new_scene_index: 14 (recap includes scenes up to message 14)

User tries to create checkpoint at message 10:
  - 10 <= 14 → ✅ Allowed (scene included in running recap)

User tries to create checkpoint at message 18:
  - 18 > 14 → ❌ Blocked (scene not yet in running recap)
```

#### 7.8.6 User Experience Flow

**Success Path**:
```
1. User navigates to message with scene break
2. Scene recap generated and saved to lorebook
3. Running scene recap regenerated to include this scene
4. User clicks checkpoint/branch button
5. Validation passes all 5 requirements
6. SillyTavern creates checkpoint/branch normally
7. No toast shown (success is silent)
```

**Failure Path - Empty Queue Requirement**:
```
1. User has 3 pending operations in queue
2. User clicks checkpoint button at message 10
3. Validation fails at requirement 2
4. Event prevented, propagation stopped
5. Toast shown: "Cannot create checkpoint: Queue is not empty (3 pending, 0 in progress)"
6. User must wait for queue to complete or cancel operations
7. Checkpoint not created
```

**Failure Path - Missing Scene Break**:
```
1. User clicks checkpoint button at message 8 (no scene break)
2. Validation fails at requirement 3
3. Toast shown: "Cannot create checkpoint: Message does not have a scene break"
4. User must create scene break first (manual or auto-detection)
5. Checkpoint not created
```

**Failure Path - Scene Not in Running Recap**:
```
1. User just generated scene recap at message 14
2. Running recap not yet regenerated
3. User clicks checkpoint button immediately
4. Validation fails at requirement 5
5. Toast shown: "Cannot create checkpoint: Scene has not been included in the running recap yet"
6. User must trigger running recap regeneration (manual or wait for auto)
7. Checkpoint not created
```

#### 7.8.7 Why This Prevents Data Corruption

**Without This Validation**:
```
T0: User has pending operation for message 15 scene recap
T1: User creates checkpoint at message 5
    → Checkpoint created with queue containing "generate scene recap for message 15"
T2: User opens checkpoint (only has messages 0-5)
    → Queue processor tries to execute operation
    → Message 15 doesn't exist in checkpoint
    → ERROR or corrupted state
```

**With This Validation**:
```
T0: User has pending operation for message 15 scene recap
T1: User tries to create checkpoint at message 5
    → Validation blocks: "Queue is not empty (1 pending, 0 in progress)"
T2: User waits for operation to complete
T3: Queue now empty
T4: User creates checkpoint successfully
    → Checkpoint created with empty queue
    → No invalid message references
    → Clean state
```

**Scene Break Requirement Benefit**:
```
Without requirement:
  - Checkpoint at message 7 (mid-scene)
  - Scene recap at message 10 (scene end)
  - Checkpoint missing scene conclusion in memory

With requirement:
  - Checkpoint only at message 10 (scene break)
  - Complete scene recap in checkpoint
  - Clean narrative boundary
  - Memory state consistent
```

#### 7.8.8 Limitations of Current Validation

**What It DOES Protect**:
- ✅ Queue operations referencing non-existent messages
- ✅ Incomplete scene data in checkpoint
- ✅ Missing running recap context
- ✅ Scene narrative splits (enforces scene boundaries)

**What It DOES NOT Protect** (Still Broken):
- ❌ Lorebook not being cloned (still shared across all chats)
- ❌ No lorebook mismatch detection when loading checkpoint
- ❌ No automatic lorebook fix when wrong lorebook attached
- ❌ Registry data corruption from shared lorebook
- ❌ Queue corruption from shared lorebook (only prevents at creation time)

**Critical Gap**: Validation prevents corruption at checkpoint **CREATION** time, but does NOT fix the shared lorebook problem. Once checkpoint is created, all the shared lorebook corruption issues still apply.

**See**: Section 7.1.5 "What Protection Exists: Running Scene Recap Only" for details on missing lorebook protections.

#### 7.8.9 Integration with Extension Initialization

**Called From**: `eventHandlers.js:284`

```javascript
export async function setup_extension() {
  // ... other initialization ...
  initialize_message_buttons();
  initialize_group_member_buttons();
  initialize_checkpoint_branch_interceptor();  // ← Installed here
  initialize_slash_commands();
  initialize_menu_buttons();
  // ...
}
```

**Initialization Order**:
1. Extension settings loaded
2. UI elements created
3. Event handlers registered
4. **Checkpoint/branch interceptor installed** ← This step
5. Slash commands registered
6. Menu buttons initialized

**Why This Order**: Interceptor must be installed AFTER chat container exists but BEFORE user interaction begins.

---

## 8. Code Reference Appendix

### 8.1 Primary Files

| File Path | Description | Lines Examined |
|-----------|-------------|----------------|
| `SillyTavern-New/public/scripts/bookmarks.js` | Complete branch/checkpoint implementation | 1-669 (entire file) |
| `SillyTavern-New/public/script.js` | Chat save/load system | 6386-6472, 1769-1779, 6413-6415 |
| `SillyTavern-New/public/index.html` | UI entry point | 7668 |
| `ST-Auto-Summarize/buttonBindings.js` | Checkpoint/branch validation interceptor | 110-220 |
| `ST-Auto-Summarize/eventHandlers.js` | Extension initialization | 284 |
| `ST-Auto-Summarize/runningSceneRecap.js` | Running recap chat_id protection | 33-44 |

### 8.2 Key Functions

#### `createBranch(mesId)`
**Location**: `bookmarks.js:160-191`
**Purpose**: Create new branch from specified message
**Key Actions**:
- Generate branch filename
- Save trimmed chat with `main_chat` metadata
- Update parent message with branch reference

#### `createNewBookmark(mesId, options)`
**Location**: `bookmarks.js:201-246`
**Purpose**: Create checkpoint (named branch)
**Key Actions**:
- Handle checkpoint naming and replacement
- Save itemized prompts
- Store bookmark link in message

#### `saveChat(options)`
**Location**: `script.js:6386-6472`
**Purpose**: Save chat to .jsonl file
**Parameters**:
- `chatName`: Filename (without extension)
- `withMetadata`: Extra metadata to merge
- `mesId`: Trim point (optional)

#### `backToMainChat()`
**Location**: `bookmarks.js:260-274`
**Purpose**: Return from branch to parent chat
**Process**:
- Read `chat_metadata.main_chat`
- Verify file exists
- Load parent chat file

#### `getMainChatName()`
**Location**: `bookmarks.js:103-119`
**Purpose**: Extract parent chat filename
**Returns**: Parent filename or `null`

#### `branchChat(mesId)`
**Location**: `bookmarks.js:390-406`
**Purpose**: UI handler for branch creation
**Process**:
- Validate message ID
- Call `createBranch()`
- Show toast notification

#### Checkpoint/Branch Click Handler
**Location**: `bookmarks.js:622-649`
**Purpose**: Handle clicking on checkpoint flag or branch link
**Key Actions**:
- Extract filename from UI element
- Call `openCharacterChat()` or `openGroupChat()`
- Load checkpoint/branch as active chat
- No special "resume" logic - just opens the file

#### `updateBookmarkDisplay(mes, name)`
**Location**: Referenced in `bookmarks.js:426`
**Purpose**: Update UI to show checkpoint flag icon on message
**Parameters**:
- `mes`: jQuery message element
- `name`: Checkpoint filename

#### `initialize_checkpoint_branch_interceptor()` (ST-Auto-Summarize)
**Location**: `buttonBindings.js:176-220`
**Purpose**: Install event listener to validate checkpoint/branch creation
**Process**:
- Finds chat container element
- Adds click listener with capture phase
- Intercepts `.mes_create_bookmark` and `.mes_create_branch` button clicks
- Calls validation function
- Prevents default action if validation fails

#### `canCreateCheckpointOrBranch(messageIndex)` (ST-Auto-Summarize)
**Location**: `buttonBindings.js:125-174`
**Purpose**: Validate if checkpoint/branch can be created at message
**Returns**: `{ allowed: boolean, reason: string|null }`
**Requirements Checked**:
1. Message exists
2. Operation queue is empty
3. Message has scene break
4. Scene break has completed lorebook entry
5. Scene included in running recap

#### `checkSceneIncludedInRunningRecap(messageIndex)` (ST-Auto-Summarize)
**Location**: `buttonBindings.js:110-123`
**Purpose**: Check if scene is included in current running recap
**Returns**: `boolean`
**Logic**:
- Gets current running recap version
- Compares `messageIndex` to `new_scene_index`
- Returns true if message ≤ last scene index in recap

### 8.3 Data Structure Locations

| Structure | File | Lines |
|-----------|------|-------|
| Chat file format | `script.js` | 6417-6425 |
| Metadata merging | `script.js` | 6392-6393 |
| Message attributes | `script.js` | 1769-1779 |
| Chat trimming | `script.js` | 6413-6415 |
| Branch tracking in message | `bookmarks.js` | 183-189 |
| Checkpoint link in message | `bookmarks.js` | 217-238 |
| Branch metadata structure | `bookmarks.js` | 172-175, 228-230 |

### 8.4 UI Integration Points

**Checkpoint Creation UI**:
- "Save checkpoint" button: `index.html:7668`
- Checkpoint creation handler: `bookmarks.js:201-246` (`createNewBookmark`)
- Naming dialog: User provides custom name
- Visual indicator: Flag icon appears on message after creation

**Branch Creation UI**:
- Message context menu: `bookmarks.js:390-406` (`branchChat`)
- Branch creation handler: `bookmarks.js:160-191` (`createBranch`)
- Auto-naming: `Branch #<mesId> - <timestamp>`
- Immediately switches to branch

**Checkpoint/Branch Opening UI**:
- Checkpoint flag click: `bookmarks.js:622-649` (`.mes_bookmark` selector)
- Branch link click: `bookmarks.js:622-649` (`.select_chat_block` selector)
- Shift+click: Creates new checkpoint instead of opening
- Opens chat file via `openCharacterChat()` or `openGroupChat()`

**Navigation UI**:
- "Back to main chat" button: `bookmarks.js:260-274` (`backToMainChat`)
- Button visibility: `bookmarks.js:129-132` (shown when `chat_metadata.main_chat` exists)
- Branch list in message: `bookmarks.js:580-610`

**Visual Indicators**:
- Checkpoint: Flag icon on message (stored in `message.extra.bookmark_link`)
- Branches: Listed in message context menu (stored in `message.extra.branches[]`)
- "Back to Main" button: Only visible in checkpoint/branch chats

---

## 9. Recommendations for ST-Auto-Recap Extension

### 9.1 Detection Strategy

#### Detect if Current Chat is a Branch
```javascript
/**
 * Check if currently in a branch/checkpoint
 * @returns {boolean} True if in branch, false if in main chat
 */
function isInBranch() {
    return chat_metadata?.main_chat !== undefined && chat_metadata?.main_chat !== null;
}

/**
 * Get parent chat filename
 * @returns {string|null} Parent chat filename or null
 */
function getParentChatName() {
    return chat_metadata?.main_chat || null;
}
```

#### Detect Branch Creation Event
**Challenge**: No event fired when branch is created

**Possible Approaches**:
1. **Poll `chat_metadata.main_chat`**: Check on every `CHAT_CHANGED` event
2. **Monitor chat filename changes**: Compare `characters[this_chid].chat` or `groups[selected_group].chat_id`
3. **Hook into `openCharacterChat()`**: Detect when chat file changes

### 9.2 Implementation Options

#### Option 1: Disable Extension in Branches (Simplest)

**Behavior**:
- Detect `chat_metadata.main_chat` on extension load
- If in branch: Show warning banner
- Disable all recap generation buttons
- Disable auto-recap triggers
- Clear operation queue (or hide UI)

**Implementation**:
```javascript
// In index.js or eventHandlers.js
function checkBranchStatus() {
    if (isInBranch()) {
        showWarningBanner('Auto-Recap is disabled in branches. Return to main chat to use recapping.');
        disableExtensionFeatures();
        return false;
    }
    return true;
}

// Call on extension load and chat change
eventSource.on(event_types.CHAT_CHANGED, () => {
    checkBranchStatus();
});
```

**Pros**:
- Simple to implement
- No data corruption risk
- Clear user communication

**Cons**:
- Feature unavailable in branches
- Users cannot recap branch conversations

#### Option 2: Clear Queue on Branch Entry (Moderate)

**Behavior**:
- Detect when switching to a branch
- Clear operation queue in branch
- Warn user: "Operation queue cleared - branches maintain independent state"
- Allow recap generation in branch (but independent from main chat)

**Implementation**:
```javascript
// Track current chat name
let previousChatName = null;

function handleChatSwitch() {
    const currentChatName = getCurrentChatName();

    if (currentChatName !== previousChatName) {
        if (isInBranch()) {
            clearOperationQueue();
            showToast('Branch detected: Operation queue cleared. Recaps generated in this branch are independent.');
        }
        previousChatName = currentChatName;
    }
}
```

**Pros**:
- Extension functional in branches
- Prevents queue reference errors
- Each branch maintains independent recaps

**Cons**:
- Queue state lost on branch switch
- Running scene recaps diverge (may confuse users)
- No synchronization between branches

#### Option 3: Full Branch Support (Complex)

**Behavior**:
- Detect branch creation before it happens
- Filter operation queue to only valid operations
- Update message references in queue
- Track branch relationships
- Maintain separate queue per chat file
- Potentially warn about divergence

**Implementation Challenges**:
1. **~~No pre-branch-creation hook~~**: ✅ **IMPLEMENTED** - Validation interceptor exists (see Section 7.8), but only validates conditions, doesn't modify queue or clone lorebook
2. **Message ID remapping**: Cannot determine which operations reference which messages
3. **Queue filtering**: Complex logic to determine operation validity
4. **Cross-branch tracking**: Would need to store branch genealogy
5. **Lorebook cloning**: Must clone lorebook file and update checkpoint metadata to reference cloned file (NOT implemented - critical bug)

**Example Pseudocode**:
```javascript
// Detect branch creation (post-facto)
function onBranchCreated(branchChatName, parentChatName, branchPointMessageId) {
    const parentQueue = loadQueueFromLorebook(parentChatName);
    const branchQueue = filterQueueForBranch(parentQueue, branchPointMessageId);
    saveQueueToLorebook(branchChatName, branchQueue);
}

function filterQueueForBranch(queue, maxMessageId) {
    return queue.filter(op => {
        // Keep operations without message reference
        if (!op.metadata?.message_id) return true;

        // Keep operations referencing valid messages
        if (op.metadata.message_id <= maxMessageId) return true;

        // Discard operations referencing future messages
        return false;
    });
}
```

**Pros**:
- Full extension functionality in branches
- Prevents queue reference errors
- Most user-friendly

**Cons**:
- Very complex implementation
- Requires hooking into ST's branch creation (if possible)
- High maintenance burden
- Risk of subtle bugs

### 9.3 Recommended Approach

**Phase 1: Detection & Warning (Immediate)**
- Implement Option 1 (disable in branches)
- Add clear user communication
- Prevent data corruption

**Phase 2: Independent Branch Support (Future)**
- Implement Option 2 (clear queue on switch)
- Document branch behavior
- Allow users to generate recaps in branches

**Phase 3: Advanced Support (If Needed)**
- Only if users request cross-branch features
- Requires significant architectural changes
- Consider branch-aware operation system

---

## 10. Further Investigation Needed

### 10.1 Event System

**Question**: Are there SillyTavern events for branch operations?

**Investigate**:
- Search for event firing in `bookmarks.js`
- Check `eventSource.emit()` calls
- Look for `BRANCH_CREATED`, `BOOKMARK_CREATED`, `CHAT_LOADED` events

**Location to Search**: `bookmarks.js`, `script.js` (around chat loading functions)

### 10.2 Message UID System

**Question**: Does SillyTavern have UUIDs for messages beyond array indices?

**Investigate**:
- Check message object structure for UUID fields
- Look for message ID generation functions
- Examine how swipes are tracked (might use UUIDs)

**Potential Fields**: `message.id`, `message.uuid`, `message.swipe_id`

### 10.3 Lorebook Entry UID Assignment

**Question**: How are lorebook entry UIDs generated? Are they preserved across branches?

**Investigate**:
- Lorebook entry creation code
- UID generation logic (timestamp? counter? UUID?)
- What happens to UIDs when lorebook is copied

**Location**: Lorebook management code (likely in `script.js` or separate file)

### 10.4 Group Chat Behavior

**Question**: Do branches work differently for group chats?

**Investigate**:
- `saveGroupBookmarkChat()` function
- Group-specific branch logic in `bookmarks.js`
- Group chat metadata structure

**Note**: Code has group-specific branches in multiple places:
- `bookmarks.js:172-177` (group check in `createBranch`)
- `bookmarks.js:228-236` (group check in `createNewBookmark`)

### 10.5 Chat File Loading Process

**Question**: What exactly happens during `openCharacterChat()`?

**Investigate**:
- Complete chat loading flow
- When is `chat_metadata` populated?
- When do events fire during loading?
- Is there a "chat fully loaded" event?

**Purpose**: Determine best hook point for branch detection

---

## 11. Conclusion

SillyTavern's branch and checkpoint system creates **independent chat files** with **no synchronization mechanism**. For ST-Auto-Recap extension, this means:

### Core Findings

1. **No Special Resume Feature**: "Resuming" from a checkpoint simply means opening that chat file. It becomes your active chat with full editing capability.

2. **Separate Files, Not Snapshots**: Each checkpoint/branch is a complete `.jsonl` file that diverges independently from the original chat.

3. **Breakpoints Don't Exist**: Only checkpoints (manually named) and branches (auto-named) exist. Both use identical underlying implementation.

4. **Continuation = Divergence**: Continuing from a checkpoint adds messages to that file, not the original. No merging occurs.

### Critical Implications for ST-Auto-Recap Extension

1. **🔴 Lorebook NOT CLONED** (CRITICAL BUG): All chats share ONE lorebook file. When branches diverge and update the shared lorebook, data corruption is inevitable. **This must be fixed before checkpoints/branches are usable.**

2. **Running Scene Recap Independence**: Each branch maintains independent recap state with no synchronization. Running recap initialized EMPTY in checkpoint/branch (not copied from parent). Continuing from a checkpoint creates independent recaps.

3. **Message ID Ambiguity**: Messages use array indices, causing collisions between branches. Message 10 in main chat ≠ message 10 in checkpoint.

4. **Metadata Mostly Independent**: `chat_metadata.auto_recap` structure copied at branch time, but running scene recap starts with empty versions array. Each chat maintains independent settings hash, version numbers, etc.

5. **Queue Corruption Inevitable**: Because lorebook is shared, queue updates from different branches overwrite each other, creating corrupted mixed state.

6. **User Experience**: Switching between main chat and checkpoints shows different recaps for same message IDs. No visual indication of which data belongs to which timeline. **Plus lorebook corruption makes extension unusable.**

### Immediate Action Required

Implement branch/checkpoint detection and choose a strategy:

**Option A (Safest)**: Disable extension in branches
- Detect `chat_metadata.main_chat`
- Show warning banner
- Prevent all operations in checkpoints/branches

**Option B (Functional)**: Clear queue on branch entry
- Allow extension to work in branches
- Clear operation queue when entering branch
- Warn user about independent state

**Option C (Complex)**: Full branch support
- Requires extensive architectural changes
- Hook into branch creation
- Filter/update operation queue
- Track branch genealogy
- High complexity, high maintenance

### Recommended Immediate Implementation

**Phase 1**: Option A (disable in branches)
- Prevents data corruption
- Clear user communication
- Simple to implement

**Phase 2** (if user demand exists): Option B
- Independent operation in each chat file
- Document behavior clearly
- Accept divergence as expected

### Long-Term Considerations

- Document branch behavior clearly for users
- Consider whether cross-branch features are necessary
- Monitor user feedback on branch usage patterns
- Evaluate if branch-aware features provide sufficient value for implementation cost

---

**Document Version**: 5.0
**Last Updated**: 2025-11-20
**Changes**:
- v2.0: Added checkpoint continuation/resume investigation, clarified terminology (no breakpoints), added detailed checkpoint continuation scenario
- v2.1: Added actual file analysis findings, corrected running scene recap behavior (empty, not copied), noted branch reference discrepancy
- v3.0: **WRONG** - Incorrectly stated shared lorebook was good (MISTAKE)
- v4.0: **CORRECTED** - Shared lorebook is CRITICAL BUG causing data corruption. Lorebook cloning NOT implemented. Updated all sections to reflect this is broken, not a feature. Added warnings not to use checkpoints/branches.
- v5.0: **ADDED** - Documented checkpoint/branch creation validation system (Section 7.8). Added validation interceptor details, five requirements enforced, user experience flows, and limitations. Updated executive summary and code references. Corrected "No pre-branch-creation hook" statement in implementation challenges.
**Verified Against**: Real chat files from Lyra Heartstrings directory
**Key Documents**:
- `docs/research/lorebook-NOT-IMPLEMENTED.md` (current broken state)
- `docs/proposed-features/checkpoint-integration/LOREBOOK_MANAGEMENT.md` (how to fix it)
**Next Review**: After lorebook cloning implementation

---

## Appendix A: Key Corrections from File Analysis

**Based on examination of actual checkpoint and branch files**, the following corrections were made to this document:

1. **🔴 Lorebook NOT CLONED** (Section 6.3, 7.1) - **CRITICAL BUG**:
   - **Expected**: Lorebook should be cloned when creating checkpoint/branch
   - **Actual**: Only ONE lorebook file exists, all chats reference SAME file
   - **Impact**: **DATA CORRUPTION when branches diverge**. Shared lorebook is a critical bug, not a feature. Divergent branches updating same lorebook creates corrupted, contradictory data.
   - **Fix Required**: Implement lorebook cloning per `LOREBOOK_MANAGEMENT.md`

2. **Running Scene Recap Behavior** (Section 5.1, 7.2):
   - **Expected**: Metadata shallow-copied, running recap copied
   - **Actual**: Running recap initialized with EMPTY `versions` array
   - **Impact**: Checkpoints/branches start with NO running scene recap (this is OK)

3. **Branch Reference Storage** (Section 2.3):
   - **Expected**: Branches stored in `message.extra.branches[]`
   - **Actual**: `branches` array NOT found in real files
   - **Impact**: Branch references may not be accessible from parent chat

4. **Checkpoint Link Storage** (Section 2.3):
   - **Expected**: Stored in `message.extra.bookmark_link`
   - **Actual**: ✅ Confirmed in real files
   - **Impact**: Checkpoint links work as documented

**Critical Finding**: Shared lorebook is a **CRITICAL BUG**, not a feature:
- ❌ Divergent branches corrupt each other's lorebook data
- ❌ No data isolation = contradictory information
- ❌ Extension becomes unusable with branches
- ❌ NO validation that attached lorebook matches current chat
- ❌ NO automatic detection or fix for lorebook mismatch
- ✅ ONLY protection: Running scene recap (auto-resets on chat_id mismatch)
- ⚠️ **DO NOT use checkpoints/branches until lorebook cloning AND mismatch detection implemented**

**See**:
- `docs/research/lorebook-NOT-IMPLEMENTED.md` - Complete bug analysis + missing protections
- `docs/proposed-features/checkpoint-integration/LOREBOOK_MANAGEMENT.md` - How to fix it


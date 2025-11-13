# SillyTavern Checkpoints & Branches: Complete Technical Documentation

## Executive Summary

SillyTavern provides two distinct features for managing chat history versions:

1. **Checkpoints** - Named snapshots permanently linked to specific messages
2. **Branches** - Named chat variants automatically opened after creation

Both features work by creating new chat files containing the history up to a given message. The user can navigate between them using UI buttons or slash commands.

---

## 1. CHECKPOINTS OVERVIEW

### What Are Checkpoints?

Checkpoints are **named chat saves** that are **permanently linked** to a specific message within a chat. A message can have one checkpoint link at a time. If you create a new checkpoint on a message that already has one, the old checkpoint is "unlinked" but remains saved in Chat Management - it becomes an orphaned independent chat.

**Key Characteristics:**
- Created by user action (UI button or slash command)
- Persistently linked to a message via `message.extra.bookmark_link`
- Displayed as a flag icon (⚑) beneath messages
- Can be replaced (unlinks the old checkpoint but doesn't delete it)
- Parent chat is tracked via `chat_metadata.main_chat`
- Slash commands available for creation and navigation
- Auto-named with timestamp if user doesn't provide a name

### Checkpoint Storage

**Message-Level Storage** (in each message):
```javascript
message.extra = {
    bookmark_link: "Checkpoint Name - 2024-10-26 14:30:45"  // The linked checkpoint name
}
```

**Chat-Level Metadata**:
```javascript
chat_metadata = {
    main_chat: "Original Chat Name"  // Reference to parent chat (for exiting checkpoint)
}
```

**File System**:
- Checkpoints are separate JSONL chat files (one per checkpoint)
- Located in `/data/chats/{character_avatar}/` directory
- Contain trimmed chat history (up to checkpoint message)
- Can exist independently even if unlinked from message

---

## 2. BRANCHES OVERVIEW

### What Are Branches?

Branches are **automatic variants** of a chat created from a specific message. Unlike checkpoints, branches are:
- **Not permanently linked** to the originating message
- **Automatically opened** after creation
- Useful for exploring alternative conversation paths
- Tracked in `message.extra.branches` array

**Key Characteristics:**
- Auto-named with format: `Branch #{messageId} - {timestamp}`
- Created with `/branch-create` command or UI button
- Immediately opens the new branch chat
- Multiple branches can originate from the same message
- Listed in `message.extra.branches` array for reference

### Branch Storage

**Message-Level Storage** (tracks originating branches):
```javascript
message.extra = {
    branches: [
        "Branch #5 - 2024-10-26 14:30:45",
        "Branch #5 - 2024-10-26 14:45:22"  // Multiple branches from same message
    ]
}
```

**Chat-Level Metadata**:
```javascript
chat_metadata = {
    main_chat: "Original Chat Name"  // Parent chat reference
}
```

**File System**:
- Stored as separate JSONL chat files
- Can be opened independently or via slash commands

---

## 3. DATA STRUCTURES

### Message Structure (Relevant Fields)

Located in `chat` array, each message has:

```javascript
{
    // Core message fields
    name: "Character Name",
    mes: "Message content",
    send_date: 1729952445000,  // timestamp
    is_user: false,            // or true for user messages
    is_system: false,          // or true for system messages

    // Extra metadata (most relevant for checkpoints/branches)
    extra: {
        bookmark_link: "Checkpoint Name - Date",  // Checkpoint link
        branches: ["Branch #5 - Date", ...],     // List of branches from this message

        // Other extra fields (unrelated to checkpoints):
        image: "image_url",
        video: "video_url",
        file: { name: "filename", size: 1024 },
        bias: "generation bias text",
        type: "narrator",      // For system messages
        token_count: 150,
        gen_id: 1234567890,    // For group chats
        ...
    }
}
```

### Chat Metadata Structure

Located in `chat_metadata` object:

```javascript
chat_metadata = {
    // Checkpoint/Branch related
    main_chat: "Original Chat Name",  // Parent chat (for checkpoints/branches)

    // Other metadata (unrelated):
    scenario: "Chat scenario text",
    tainted: false,           // Marks if chat needs saving
    integrity: "uuid-v4",     // Chat integrity check
    position: 0,              // Author's note position
    depth: 3,                 // Author's note depth
    role: "system",           // Author's note role
    ...
}
```

### Checkpoint/Branch Creation Metadata

When creating a checkpoint or branch:

```javascript
const newMetadata = {
    main_chat: mainChatName  // Set to current chat name so child can navigate back
};

// For group chats:
const mainChat = groups?.find(x => x.id == selected_group)?.chat_id;

// For solo chats:
const mainChat = characters[this_chid].chat;
```

---

## 4. KEY FUNCTIONS & APIs

### Checkpoint Creation

**Primary Function** (from `bookmarks.js`):
```javascript
async function createNewBookmark(mesId, { forceName = null } = {})
```

**Flow:**
1. Validates message exists
2. Checks if checkpoint already exists on message
3. Gets checkpoint name (auto-generates if empty)
4. Saves chat with metadata including `main_chat`
5. Links checkpoint to message via `message.extra.bookmark_link`
6. Updates UI display
7. Auto-saves chat

**Example Code:**
```javascript
const mainChat = characters[this_chid].chat;
const newMetadata = { main_chat: mainChat };

await saveChat({
    chatName: name,           // Checkpoint name with timestamp
    withMetadata: newMetadata, // Sets main_chat reference
    mesId: messageIndex       // Save only up to this message
});

lastMes.extra['bookmark_link'] = name;
await saveChatConditional();
```

### Branch Creation

**Primary Function** (from `bookmarks.js`):
```javascript
async function createBranch(mesId)
async function branchChat(mesId)  // Wrapper that also opens the branch
```

**Flow:**
1. Validates message exists
2. Auto-names branch: `Branch #{mesId} - {timestamp}`
3. Saves chat with metadata including `main_chat`
4. Appends branch name to `message.extra.branches` array
5. Opens the new branch chat immediately

**Example Code:**
```javascript
const mainChat = characters[this_chid].chat;
const newMetadata = { main_chat: mainChat };
let name = `Branch #${mesId} - ${humanizedDateTime()}`;

await saveChat({
    chatName: name,
    withMetadata: newMetadata,
    mesId
});

if (typeof lastMes.extra !== 'object') {
    lastMes.extra = {};
}
if (typeof lastMes.extra['branches'] !== 'object') {
    lastMes.extra['branches'] = [];
}
lastMes.extra['branches'].push(name);

// For solo chats:
await openCharacterChat(name);

// For group chats:
await openGroupChat(selected_group, name);
```

### Navigation Functions

**Open Checkpoint:**
```javascript
// From slash command /checkpoint-go
const checkPointName = chat[mesId].extra?.bookmark_link;
await openCharacterChat(checkPointName);
```

**Exit Checkpoint (Return to Main Chat):**
```javascript
const mainChatName = getMainChatName();
await openCharacterChat(mainChatName);
```

**Get Parent Chat Name:**
```javascript
function getMainChatName() {
    if (chat_metadata['main_chat']) {
        return chat_metadata['main_chat'];
    }
    // Fallback for legacy chats (before chat_metadata.main_chat existed):
    if (characters[this_chid].chat &&
        characters[this_chid].chat.includes('Checkpoint #')) {
        const tokenIndex = characters[this_chid].chat.lastIndexOf('Checkpoint #');
        chat_metadata['main_chat'] = characters[this_chid].chat.substring(0, tokenIndex).trim();
        return chat_metadata['main_chat'];
    }
    return null;
}
```

### Save Chat Function

**Primary Function** (from `script.js`):
```javascript
async function saveChat({
    chatName,      // Name of the chat file to save
    withMetadata,  // Metadata to merge with current chat_metadata
    mesId,         // Optional: trim chat to this message
    force = false  // Force overwrite on integrity check failure
} = {})
```

**How It Works:**
```javascript
// Merge provided metadata with current metadata
const metadata = { ...chat_metadata, ...(withMetadata || {}) };

// If mesId provided, trim chat history
const trimmedChat = (mesId !== undefined && mesId >= 0 && mesId < chat.length)
    ? chat.slice(0, Number(mesId) + 1)
    : chat.slice();

// Create save payload
const chatToSave = [
    {
        user_name: name1,
        character_name: name2,
        create_date: chat_create_date,
        chat_metadata: metadata,  // Include merged metadata
    },
    ...trimmedChat,  // Messages
];

// Send to server
const result = await fetch('/api/chats/save', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({
        ch_name: characters[this_chid].name,
        file_name: fileName,
        chat: chatToSave,
        avatar_url: characters[this_chid].avatar,
        force: force,
    }),
});
```

### Character Chat Opening

**Function** (from `script.js`):
```javascript
async function openCharacterChat(file_name) {
    await waitUntilCondition(() => !isChatSaving);
    await clearChat();
    characters[this_chid]['chat'] = file_name;  // Update character's current chat
    chat.length = 0;
    chat_metadata = {};  // Reset metadata
    await getChat();      // Load chat from server
}
```

**What It Does:**
1. Waits for any save operations to complete
2. Clears current chat from memory
3. Updates character's current chat file reference
4. Resets chat_metadata (will be loaded from file)
5. Fetches the chat file from server
6. Fires `CHAT_CHANGED` event

---

## 5. SLASH COMMANDS

### Checkpoint Commands

| Command | Returns | Example | Purpose |
|---------|---------|---------|---------|
| `/checkpoint-create [name]` | Checkpoint name | `/checkpoint-create My Checkpoint` | Create checkpoint on last message with custom name |
| `/checkpoint-create mesId={id} [name]` | Checkpoint name | `/checkpoint-create mesId=5 Important point` | Create on specific message |
| `/checkpoint-go [mesId]` | Checkpoint name | `/checkpoint-go` | Open checkpoint linked to message |
| `/checkpoint-exit` | Parent chat name | `/checkpoint-exit` | Return to main chat |
| `/checkpoint-parent` | Parent chat name | `/checkpoint-parent` | Get parent chat name without opening |
| `/checkpoint-get [mesId]` | Checkpoint name | `/checkpoint-get` | Get checkpoint name for message |
| `/checkpoint-list [links=true\|false]` | JSON array | `/checkpoint-list links=true` | List all checkpoints (as links or mesIds) |

### Branch Commands

| Command | Returns | Example | Purpose |
|---------|---------|---------|---------|
| `/branch-create [mesId]` | Branch name | `/branch-create` | Create branch and open it |

---

## 6. UI ELEMENTS & INTERACTIONS

### Message UI Elements

**In HTML** (from `index.html`):
```html
<div class="mes" mesid="" ch_name="" is_user="" is_system="" bookmark_link="">
    <!-- Other message content -->

    <!-- Message action buttons -->
    <div title="Create checkpoint" class="mes_button mes_create_bookmark fa-flag-checkered"></div>
    <div title="Create branch" class="mes_button mes_create_branch fa-code-branch"></div>

    <!-- Checkpoint flag (only visible if checkpoint exists) -->
    <div class="mes_button mes_bookmark fa-flag"
         data-tooltip="Click to open checkpoint chat&#10;Shift+Click to replace the existing checkpoint with a new one">
    </div>
</div>
```

### Event Handlers (from `bookmarks.js`)

```javascript
// Checkpoint flag click or message block click
$(document).on('click', '.select_chat_block, .mes_bookmark', async function (e) {
    const mes = $(this).closest('.mes');

    // Shift+click creates new checkpoint instead of opening
    if (e.shiftKey && mes.length) {
        const selectedMesId = mes.attr('mesid');
        await createNewBookmark(Number(selectedMesId));
        return;
    }

    // Regular click opens the checkpoint
    const fileName = $(this).hasClass('mes_bookmark')
        ? $(this).closest('.mes').attr('bookmark_link')
        : $(this).attr('file_name').replace('.jsonl', '');

    await openCharacterChat(fileName);
});

// Create checkpoint button
$(document).on('click', '.mes_create_bookmark', async function () {
    const mesId = $(this).closest('.mes').attr('mesid');
    if (mesId !== undefined) {
        await createNewBookmark(Number(mesId));
    }
});

// Create branch button
$(document).on('click', '.mes_create_branch', async function () {
    const mesId = $(this).closest('.mes').attr('mesid');
    if (mesId !== undefined) {
        await branchChat(Number(mesId));
    }
});
```

### Chat Selection UI

**In HTML** (from `index.html`):
```html
<div class="select_chat_block" file_name="chat_filename.jsonl">
    <div class="select_chat_block_filename">Chat Name</div>
    <div class="select_chat_block_mes">Last message preview</div>
</div>
```

**Updates** (from `script.js`):
```javascript
// When displaying past chats
const template = $('#past_chat_template .select_chat_block_wrapper').clone();
template.find('.select_chat_block').attr('file_name', chat.file_name);
template.find('.select_chat_block_filename').text(chat.file_name);
template.find('.select_chat_block_mes').text(chat.preview_message);

// Highlight checkpoint chats
if (chat.file_name === chat_metadata['main_chat']) {
    template.find('.select_chat_block').attr('highlight', String(true));
}
```

---

## 7. MESSAGE ID & SWIPE HANDLING

### Message IDs in Checkpoints/Branches

When a checkpoint or branch is created, **only messages up to (and including) the target message are saved**:

```javascript
const trimmedChat = (mesId !== undefined && mesId >= 0 && mesId < chat.length)
    ? chat.slice(0, Number(mesId) + 1)  // Includes messages 0 through mesId
    : chat.slice();
```

**Important Notes:**
- Message IDs are indices (0-based) in the `chat` array
- A checkpoint created at message 5 contains messages 0-5
- When the checkpoint is opened, message IDs are the same (0-based indices)
- Swipe data is **preserved** when saving (each message keeps its swipes)
- Generation IDs are preserved for group chat compatibility

### Swipe Preservation

```javascript
// When copying message data (e.g., in group chat conversion):
message.extra = structuredClone(targetMessage.extra);
// This preserves image_swipes, video, file, and other extra fields
```

---

## 8. EVENT SYSTEM

### Relevant Events

From `scripts/events.js`:

```javascript
event_types = {
    CHAT_CHANGED: 'chat_id_changed',           // Fired when opening checkpoint/branch
    MESSAGE_EDITED: 'message_edited',          // Fired when message.extra.bookmark_link changes
    MESSAGE_UPDATED: 'message_updated',        // Fired after message changes
    CHAT_CREATED: 'chat_created',              // Could be fired for new checkpoints/branches
    CHAT_DELETED: 'chat_deleted',              // Fired when checkpoint/branch deleted
}
```

### When Events Fire

**When Creating a Checkpoint:**
1. `saveChat()` is called
2. Chat file is saved to server
3. `saveChatConditional()` saves the message with the new bookmark_link
4. `MESSAGE_UPDATED` event fired (if bookmarkLink changed)

**When Opening a Checkpoint:**
1. `openCharacterChat(fileName)` called
2. `CHAT_CHANGED` event fired
3. `getChat()` loads messages from server
4. Chat UI updates to show new messages

**When Creating a Branch:**
1. `saveChat()` saves the branch file
2. `message.extra.branches` array is updated
3. `MESSAGE_UPDATED` event fired
4. `CHAT_CHANGED` event fired (when opening the branch)

---

## 9. GROUP CHAT SUPPORT

### Group Checkpoints/Branches

Group chats use similar logic but with group-specific functions:

```javascript
// From group-chats.js
async function saveGroupBookmarkChat(groupId, name, metadata, mesId) {
    const group = groups.find(x => x.id === groupId);

    if (!group) {
        return;
    }

    // Store checkpoint metadata in group
    group.past_metadata[name] = {
        ...chat_metadata,
        ...(metadata || {})
    };

    // Add to group's chat list
    group.chats.push(name);

    // Trim chat to message
    const trimmed_chat = (mesId !== undefined && mesId >= 0 && mesId < chat.length)
        ? chat.slice(0, parseInt(mesId) + 1)
        : chat;

    // Save group to database
    await editGroup(groupId, true, false);

    // Save chat file
    const response = await fetch('/api/chats/group/save', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            id: name,
            chat: [...trimmed_chat]
        }),
    });
}
```

### Group Chat Opening

```javascript
// From bookmarks.js - supports both solo and group
if (selected_group) {
    await openGroupChat(selected_group, fileName);
} else {
    await openCharacterChat(fileName);
}
```

---

## 10. WORKFLOW DIAGRAMS

### Checkpoint Creation Workflow

```
User clicks "Create Checkpoint" button on message 5
        ↓
showBookmarkMenu() triggers getBookmarkName()
        ↓
User enters checkpoint name (or leaves empty for auto-generate)
        ↓
createNewBookmark(mesId) is called
        ↓
Check if message already has bookmark_link
        ↓
Call saveChat({
    chatName: "My Checkpoint - 2024-10-26",
    withMetadata: { main_chat: "Original Chat" },
    mesId: 5  ← Save only up to message 5
})
        ↓
Server saves JSONL file: My Checkpoint - 2024-10-26.jsonl
        ↓
Update message[5].extra.bookmark_link = "My Checkpoint - 2024-10-26"
        ↓
saveChatConditional() saves updated message.extra
        ↓
UI updated to show flag icon on message 5
        ↓
✓ Checkpoint created and linked
```

### Branch Creation Workflow

```
User clicks "Create Branch" button on message 5
        ↓
branchChat(mesId) called
        ↓
createBranch(mesId) is called
        ↓
Auto-name: "Branch #5 - 2024-10-26 14:30:45"
        ↓
Call saveChat({
    chatName: "Branch #5 - 2024-10-26 14:30:45",
    withMetadata: { main_chat: "Original Chat" },
    mesId: 5
})
        ↓
Server saves JSONL file: Branch #5 - 2024-10-26 14:30:45.jsonl
        ↓
Append branch name to message[5].extra.branches array
        ↓
Call openCharacterChat("Branch #5 - 2024-10-26 14:30:45")
        ↓
CHAT_CHANGED event fired
        ↓
Load new chat into memory
        ↓
✓ Branch created and opened automatically
```

### Opening a Checkpoint

```
User clicks checkpoint flag on message
        ↓
.mes_bookmark click handler triggered
        ↓
Get bookmark_link from message element
        ↓
Call openCharacterChat(bookmarkName)
        ↓
clearChat() - empties current chat from memory
        ↓
characters[this_chid]['chat'] = bookmarkName  ← Update character state
        ↓
getChat() - fetch checkpoint chat from server
        ↓
Load chat_metadata.main_chat from file (contains parent chat name)
        ↓
UI populated with checkpoint messages
        ↓
Checkpoint chat is now active
        ↓
/checkpoint-exit command available to return
```

### Exiting a Checkpoint

```
User types /checkpoint-exit
        ↓
checkPointExit() called
        ↓
getMainChatName() retrieves chat_metadata['main_chat']
        ↓
Call openCharacterChat(mainChatName)
        ↓
Parent chat is loaded
        ↓
Users can see all original messages again
        ↓
Child checkpoint link preserved on message
```

---

## 11. API ENDPOINTS

### Server-Side Chat Operations

**Save Chat**:
```
POST /api/chats/save
Content-Type: application/json

{
    "ch_name": "Character Name",
    "file_name": "chat_name.jsonl",
    "avatar_url": "character_avatar.png",
    "chat": [
        {
            "user_name": "User",
            "character_name": "Character",
            "create_date": 1729952445000,
            "chat_metadata": {
                "main_chat": "Parent Chat Name",
                ...other metadata...
            }
        },
        { ...message objects... }
    ],
    "force": false  // Set to true to force overwrite on integrity failure
}
```

**Get Chat**:
```
POST /api/chats/get
```

**Get Chats List**:
```
POST /api/characters/chats
Content-Type: application/json

{
    "avatar_url": "character_avatar.png",
    "simple": true
}

Response:
{
    "chat_name.jsonl": {
        "file_name": "chat_name.jsonl",
        "preview_message": "Last message text...",
        "date_created": 1729952445000
    },
    ...
}
```

---

## 12. KEY GOTCHAS & EDGE CASES

### 1. Checkpoint Naming

- Empty input triggers auto-generation: `Checkpoint #{number} - {timestamp}`
- Must be unique to character/group
- Timestamp is always appended to custom names

### 2. Multiple Bookmarks on Same Message

- Creating a new checkpoint on a message with existing bookmark_link:
  - Old checkpoint **unlinked** (link removed from message)
  - Old checkpoint file **remains** on disk
  - Can still be accessed via Chat Management

### 3. Legacy Checkpoints (Before chat_metadata.main_chat)

- Old checkpoints stored `main_chat` in character name
- `getMainChatName()` handles backward compatibility:
  ```javascript
  if (characters[this_chid].chat &&
      characters[this_chid].chat.includes('Checkpoint #')) {
      // Extract main chat from character's current chat name
  }
  ```

### 4. Chat Metadata Persistence

- `chat_metadata` is loaded from the **first message** of a chat file
- Contains `main_chat` reference for navigation back to parent
- Lost when chat cleared (e.g., opening new chat)
- Must call `getChat()` to reload metadata

### 5. Message ID Stability

- Message IDs are array indices (0-based)
- When checkpoint/branch opened, old message IDs are valid
- If chat is edited (messages added/removed), IDs can shift
- Checkpoint links are by name, not by message ID - they're stable

### 6. Swipe Data Preservation

- All message.extra fields preserved when saving
- Swipes remain intact in checkpoint/branch
- Can regenerate swipes in checkpoints independently

### 7. Group Chat vs Solo Chat

- Both support checkpoints/branches
- **Group chats** use `/api/chats/group/save`
- **Solo chats** use `/api/chats/save`
- Functions check `selected_group` variable to determine which API to use

### 8. Nested Checkpoints

- Can create checkpoints of checkpoints
- `chat_metadata.main_chat` always points to immediate parent
- `main_chat` is the **direct parent**, not the root chat
- Users must navigate backward through chain manually

---

## 13. TESTING CONSIDERATIONS

### Creating Test Checkpoints

```javascript
// Via slash command in chat
/checkpoint-create Test Checkpoint

// Via API
fetch('/api/chats/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        ch_name: "Test Character",
        file_name: "Test Checkpoint - 2024-10-26",
        avatar_url: "test_avatar.png",
        chat: [
            {
                user_name: "User",
                character_name: "Test Character",
                create_date: Date.now(),
                chat_metadata: { main_chat: "Original Chat" }
            },
            // Messages...
        ]
    })
});
```

### Verifying Checkpoint Links

```javascript
// In console
chat[5].extra?.bookmark_link  // Returns checkpoint name or undefined

// Get all checkpoints
chat.filter(msg => msg.extra?.bookmark_link)
    .map((msg, idx) => ({ index: idx, checkpoint: msg.extra.bookmark_link }))
```

---

## 14. INTEGRATION POINTS FOR EXTENSIONS

### Listening for Checkpoint/Branch Events

```javascript
import { eventSource, event_types } from './events.js';

// When checkpoint/branch opened
eventSource.on(event_types.CHAT_CHANGED, (chatId) => {
    console.log('Chat changed to:', chatId);
    // Check if we're in a checkpoint
    const mainChat = chat_metadata['main_chat'];
    if (mainChat) {
        console.log('In checkpoint! Main chat:', mainChat);
    }
});

// When checkpoint linked to message
eventSource.on(event_types.MESSAGE_UPDATED, (messageId) => {
    const checkpoint = chat[messageId].extra?.bookmark_link;
    if (checkpoint) {
        console.log('Message', messageId, 'has checkpoint:', checkpoint);
    }
});
```

### Creating Checkpoints Programmatically

```javascript
import { createNewBookmark } from './bookmarks.js';

// Create checkpoint on last message
const checkpointName = await createNewBookmark(chat.length - 1, {
    forceName: "Auto-Generated Checkpoint"
});
console.log('Created:', checkpointName);
```

---

## 15. COMPLETE EXAMPLE: CHECKPOINT LIFECYCLE

```javascript
// Step 1: Create checkpoint on message 10
await createNewBookmark(10, { forceName: "Interesting Scene" });

// Result in memory:
// chat[10].extra.bookmark_link = "Interesting Scene - 2024-10-26 14:30:45"
// chat_metadata.main_chat = "Original Chat"

// Step 2: File saved to disk
// File: "Interesting Scene - 2024-10-26 14:30:45.jsonl"
// Contains: messages 0-10 plus metadata with main_chat reference

// Step 3: User opens checkpoint from UI
await openCharacterChat("Interesting Scene - 2024-10-26 14:30:45");

// Result:
// characters[this_chid].chat = "Interesting Scene - 2024-10-26 14:30:45"
// chat array reloaded with 11 messages (0-10)
// chat_metadata.main_chat = "Original Chat" (loaded from file)
// UI shows checkpoint messages

// Step 4: User types /checkpoint-exit
await backToMainChat();

// Result:
// characters[this_chid].chat = "Original Chat"
// chat array reloaded with original messages
// User back in original chat

// Step 5: User creates new checkpoint on same message
await createNewBookmark(10, { forceName: "Another checkpoint" });

// Result:
// Old checkpoint "Interesting Scene - ..." is UNLINKED
// chat[10].extra.bookmark_link = "Another checkpoint - 2024-10-26 14:45:00"
// Old checkpoint file still exists on disk
// Can still access via Chat Management menu
```

---

## 16. CONCLUSION

Checkpoints and Branches provide powerful chat management features:

**Checkpoints:**
- Permanent message-level bookmarks
- Useful for saving important points in conversation
- Can be replaced (old ones become orphaned)
- Parent/child navigation via `chat_metadata.main_chat`

**Branches:**
- Quick conversation alternatives
- Auto-opened after creation
- Tracked in `message.extra.branches` array
- Useful for exploring "what if" scenarios

Both features leverage the same underlying mechanism: creating new chat files with trimmed history and linking them via metadata. The UI and slash commands make them easy to use, while the data structures make them flexible and powerful.

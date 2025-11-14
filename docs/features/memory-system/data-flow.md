# Memory System Data Flow

## Overview

This document traces the complete data flow for the memory system from message creation through recap storage, memory calculation, and final injection into the LLM prompt.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     MESSAGE LIFECYCLE                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  User sends      │
                    │  message or AI   │
                    │  generates reply │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  MESSAGE_SENT    │
                    │  event fired     │
                    └──────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
  ┌──────────────────┐              ┌──────────────────┐
  │ Recap generation │              │ Scene break      │
  │ queued           │              │ detection queued │
  └──────────────────┘              └──────────────────┘
            │                                   │
            ▼                                   ▼
  ┌──────────────────┐              ┌──────────────────┐
  │ LLM generates    │              │ LLM detects      │
  │ recap text       │              │ scene break      │
  └──────────────────┘              └──────────────────┘
            │                                   │
            ▼                                   │
  ┌──────────────────┐                         │
  │ set_data(msg,    │                         │
  │ 'memory', text)  │                         │
  └──────────────────┘                         │
            │                                   │
            └─────────────────┬─────────────────┘
                              ▼
                    ┌──────────────────┐
                    │ refresh_memory() │
                    │ triggered        │
                    └──────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
            ▼                                   ▼
  ┌──────────────────┐              ┌──────────────────┐
  │ Calculate which  │              │ Get running      │
  │ messages to      │              │ scene recap      │
  │ include          │              │ for injection    │
  └──────────────────┘              └──────────────────┘
            │                                   │
            ▼                                   │
  ┌──────────────────┐                         │
  │ Update message   │                         │
  │ inclusion flags  │                         │
  └──────────────────┘                         │
            │                                   │
            ▼                                   │
  ┌──────────────────┐                         │
  │ Update visual    │                         │
  │ indicators       │                         │
  └──────────────────┘                         │
            │                                   │
            └─────────────────┬─────────────────┘
                              ▼
                    ┌──────────────────┐
                    │ ctx.setExtension │
                    │ Prompt() called  │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Memory injected  │
                    │ into next LLM    │
                    │ request          │
                    └──────────────────┘
```

---

## Flow 1: Message Recap Generation

### Trigger

User sends message OR AI generates reply → `MESSAGE_SENT` event

**Source:** `eventHandlers.js`

### Step 1: Queue Recap Operation

```javascript
// eventHandlers.js
await enqueueOperation({
  type: OperationType.RECAP,
  priority: OperationPriority.NORMAL,
  metadata: {
    message_id: messageId,
    // ... other metadata
  }
});
```

### Step 2: Operation Handler Executes

```javascript
// operationHandlers.js
async function handleRecapOperation(operation) {
  const message = chat[operation.metadata.message_id];

  // Call recap generation
  const recap_text = await recap_text(
    prompt,
    prefill,
    include_presets,
    preset_name
  );

  // Store on message
  set_data(message, 'memory', recap_text);
  set_data(message, 'include', null); // Will be calculated by refresh_memory

  // Trigger memory refresh
  await refresh_memory();
}
```

**Source:** `operationHandlers.js`, `recapping.js:recap_text()`

### Step 3: Store Recap on Message

```javascript
// messageData.js:set_data()
function set_data(message, key, value) {
  if (!message.extra) message.extra = {};
  if (!message.extra[MODULE_NAME]) message.extra[MODULE_NAME] = {};

  message.extra[MODULE_NAME][key] = value;

  // Also save on current swipe
  const swipe_index = message.swipe_id;
  if (swipe_index && message.swipe_info?.[swipe_index]) {
    message.swipe_info[swipe_index].extra[MODULE_NAME] =
      structuredClone(message.extra[MODULE_NAME]);
  }

  saveChatDebounced();
}
```

**Source:** `messageData.js:13-38`

### Step 4: Trigger Memory Refresh

After storing recap, `refresh_memory()` is called to recalculate inclusion.

---

## Flow 2: Memory Refresh and Inclusion Calculation

### Trigger

- After recap generation completes
- After settings change
- After scene break created
- Manual user refresh

**Source:** `memoryCore.js:300-334`

### Step 1: Auto-Hide Messages

```javascript
// memoryCore.js:refresh_memory()
async function refresh_memory() {
  // Hide old messages by scene count
  await auto_hide_messages_by_command();

  // Continue with memory calculation...
}
```

**Source:** `memoryCore.js:310`, `autoHide.js:81-107`

### Step 2: Update Inclusion Flags

```javascript
// memoryCore.js:update_message_inclusion_flags()
function update_message_inclusion_flags() {
  const chat = getContext().chat;

  // Iterate REVERSE (newest to oldest)
  let recap = "";
  let limit_reached = false;

  for (let i = chat.length - 1; i >= 0; i--) {
    const message = chat[i];

    // Check exclusion criteria
    const include = check_message_exclusion(message);
    if (!include) {
      set_data(message, 'include', null);
      continue;
    }

    if (!limit_reached) {
      const memory = get_memory(message);
      if (!memory) {
        set_data(message, 'include', null);
        continue;
      }

      // Try adding this recap
      const new_recap = concatenate_recap(recap, message);
      const token_size = count_tokens(new_recap);

      if (token_size > get_short_token_limit()) {
        // LIMIT REACHED
        limit_reached = true;
        set_data(message, 'include', null);
      } else {
        // UNDER LIMIT - include it
        set_data(message, 'include', 'Recap of message(s)');
        recap = new_recap;
      }
    } else {
      set_data(message, 'include', null);
    }
  }

  update_all_message_visuals();
}
```

**Source:** `memoryCore.js:93-140`

### Step 3: Get Scene Recap Injection

```javascript
// memoryCore.js:refresh_memory()
const scene_injection = get_running_recap_injection();

// get_running_recap_injection() returns current version
// of running scene recap from chat_metadata
```

**Source:** `memoryCore.js:324`, `runningSceneRecap.js:get_running_recap_injection()`

### Step 4: Inject Memory

```javascript
// memoryCore.js:refresh_memory()
ctx.setExtensionPrompt(
  `${MODULE_NAME}_scene`,        // Key
  scene_injection,               // Value (running scene recap text)
  scene_recap_position,          // Position (0-2)
  scene_recap_depth,             // Depth
  scene_recap_scan,              // Scan flag
  scene_recap_role               // Role (0-2)
);
```

**Source:** `memoryCore.js:331`

---

## Flow 3: Scene Recap Generation and Running Recap Update

### Trigger

Scene break detected or manually created → scene recap generation queued

**Source:** `sceneBreak.js`, `autoSceneBreakDetection.js`

### Step 1: Generate Scene Recap

```javascript
// operationHandlers.js:handleSceneRecapOperation()
async function handleSceneRecapOperation(operation) {
  const message = chat[operation.metadata.message_id];

  // Collect messages in scene
  const scene_messages = collectMessagesInScene(message_id);

  // Generate scene recap via LLM
  const scene_recap_text = await generateSceneRecap(scene_messages);

  // Store on scene break message
  set_data(message, 'scene_recap_memory', scene_recap_text);
  set_data(message, 'scene_recap_versions', [scene_recap_text]);
  set_data(message, 'scene_recap_current_index', 0);

  // Queue running recap regeneration
  if (get_settings('running_scene_recap_auto_generate')) {
    await enqueueOperation({
      type: OperationType.RUNNING_SCENE_RECAP,
      priority: OperationPriority.HIGH
    });
  }
}
```

**Source:** `operationHandlers.js`, `sceneBreak.js`

### Step 2: Generate Running Scene Recap

```javascript
// operationHandlers.js:handleRunningSceneRecapOperation()
async function handleRunningSceneRecapOperation(operation) {
  // Collect all scene recaps
  const scene_recaps = collectAllSceneRecaps();

  // Generate combined running recap via LLM
  const running_recap_text = await generateRunningSceneRecap(scene_recaps);

  // Store in chat_metadata
  add_running_recap_version(
    running_recap_text,
    scene_count,
    excluded_count,
    prev_scene_index,
    new_scene_index
  );

  // Trigger memory refresh to inject new version
  await refresh_memory();
}
```

**Source:** `operationHandlers.js`, `runningSceneRecap.js:add_running_recap_version()`

### Step 3: Version Storage

```javascript
// runningSceneRecap.js:add_running_recap_version()
function add_running_recap_version(content, scene_count, ...) {
  const storage = get_running_recap_storage();

  // Find highest version number
  const max_version = storage.versions.reduce(
    (max, v) => Math.max(max, v.version), -1
  );
  const new_version = max_version + 1;

  // Create version object
  const version_obj = {
    version: new_version,
    timestamp: Date.now(),
    content: content,
    scene_count: scene_count,
    excluded_count: excluded_count,
    prev_scene_index: prev_scene_index,
    new_scene_index: new_scene_index
  };

  storage.versions.push(version_obj);
  storage.current_version = new_version;

  saveChatDebounced();

  return new_version;
}
```

**Source:** `runningSceneRecap.js:86-123`

---

## Flow 4: Memory Injection into LLM Request

### Step 1: User Triggers Chat Message

User types message and presses Enter

### Step 2: SillyTavern Prepares Prompt

SillyTavern's core `generateRaw()` function builds the prompt:

1. Character card data
2. Chat history
3. Extension prompts (including memory)
4. System prompts
5. User message

### Step 3: Extension Prompt Insertion

```javascript
// SillyTavern's prompt builder checks extension_prompts registry
// Finds our key: `auto_recap_scene`
// Gets value: running scene recap text
// Inserts at specified position/depth/role

const extension_prompts = {
  'auto_recap_scene': {
    value: "Scene 1: Introduction...\nScene 2: Conflict...",
    position: 2,  // AFTER_PROMPT
    depth: 2,
    role: 0,      // SYSTEM
    scan: false
  }
};
```

### Step 4: Final Prompt Structure

```
[Extension prompts with position=BEFORE_PROMPT, depth=0]
[Character card: description/personality/scenario]
[Extension prompts with position=IN_PROMPT, depth=0]
[Chat history: recent messages]
[Extension prompts with position=IN_PROMPT, depth=2]
  → MEMORY INJECTED HERE (running scene recap)
[Extension prompts with position=AFTER_PROMPT]
[User's new message]
```

**Source:** SillyTavern's prompt building logic (external to extension)

### Step 5: LLM Receives Prompt

The LLM sees the memory as part of the prompt and generates a response that's aware of the scene context.

---

## Flow 5: Token Limit Calculation

### Input

- `message_recap_context_limit` setting (number)
- `message_recap_context_type` setting ("percent" or "absolute")
- Current context size (from SillyTavern)

**Source:** `defaultSettings.js`, `utils.js:93-103`

### Calculation

```javascript
// utils.js:get_short_token_limit()
function get_short_token_limit() {
  const limit = get_settings('message_recap_context_limit');
  const type = get_settings('message_recap_context_type');

  if (type === "percent") {
    const context_size = get_context_size();
    return Math.floor(context_size * limit / 100);
  } else {
    return limit; // Absolute token count
  }
}
```

**Source:** `utils.js:93-103`

### Example

- Context size: 8192 tokens
- Setting: 10% (percent type)
- Result: `Math.floor(8192 * 10 / 100)` = **819 tokens**

### Usage

This limit is used in `update_message_inclusion_flags()` to stop accumulating recaps when the limit is exceeded.

**Source:** `memoryCore.js:125`

---

## Flow 6: Message Exclusion Decision Tree

```
Message arrives
    │
    ▼
Is it an extension system message?
    │
    ├─YES─→ EXCLUDE
    │
    ▼
Is it marked as excluded?
    │
    ├─YES─→ EXCLUDE
    │
    ▼
Is it a user message AND include_user_messages=false?
    │
    ├─YES─→ EXCLUDE
    │
    ▼
Is it a thought message (Stepped Thinking)?
    │
    ├─YES─→ EXCLUDE
    │
    ▼
Is it a system message AND include_system_messages=false?
    │
    ├─YES─→ EXCLUDE
    │
    ▼
Is it a narrator message AND include_narrator_messages=false?
    │
    ├─YES─→ EXCLUDE
    │
    ▼
Is character disabled in group chat?
    │
    ├─YES─→ EXCLUDE
    │
    ▼
Is message token count < message_length_threshold?
    │
    ├─YES─→ EXCLUDE
    │
    ▼
INCLUDE
```

**Source:** `memoryCore.js:42-92`

---

## Flow 7: Auto-Hide Execution

### Input

- `auto_hide_scene_count` setting (number of scenes to keep visible)
- Current chat with scene break markers

**Source:** `autoHide.js:81-107`

### Algorithm

```javascript
// autoHide.js:auto_hide_messages_by_command()
async function auto_hide_messages_by_command() {
  const scene_count = get_settings('auto_hide_scene_count');
  const chat = getContext().chat;

  const to_hide = new Set();
  const to_unhide = new Set();

  // 1. Initialize: assume all visible
  for (let i = 0; i < chat.length; i++) {
    to_unhide.add(i);
  }

  // 2. Find visible scene breaks
  const scene_breaks = findVisibleSceneBreaks(chat);

  // 3. Calculate visible start
  if (scene_breaks.length >= scene_count) {
    const first_visible = scene_breaks.length - scene_count;
    const visible_start = scene_breaks[first_visible] + 1;

    // 4. Hide messages before visible_start
    for (let i = 0; i < visible_start; i++) {
      to_hide.add(i);
      to_unhide.delete(i);
    }

    // 5. Unhide messages after visible_start
    for (let i = visible_start; i < chat.length; i++) {
      to_unhide.add(i);
      to_hide.delete(i);
    }
  }

  // 6. Execute hide/unhide commands in batches
  await processBatchedCommands(ctx, Array.from(to_hide).sort(), 'hide');
  await processBatchedCommands(ctx, Array.from(to_unhide).sort(), 'unhide');
}
```

**Source:** `autoHide.js:81-107`

### Example

- Chat has 100 messages
- Scene breaks at: [10, 30, 50, 70, 90]
- Setting: `auto_hide_scene_count = 2` (keep last 2 scenes visible)

**Calculation:**
- Keep scenes starting at indexes: [70, 90]
- `visible_start = 71` (message after scene break at 70)
- Hide messages: 0-70
- Unhide messages: 71-99

---

## Flow 8: Cross-Chat Validation (Running Recap)

### Purpose

Prevent running scene recap data from one chat being used in another chat.

**Source:** `runningSceneRecap.js:19-43`

### Validation Flow

```javascript
function get_running_recap_storage() {
  const currentChatId = getCurrentChatId();

  if (!chat_metadata.auto_recap_running_scene_recaps) {
    // Initialize fresh storage
    return {
      chat_id: currentChatId,
      current_version: 0,
      versions: []
    };
  }

  const stored_chat_id = chat_metadata.auto_recap_running_scene_recaps.chat_id;

  if (stored_chat_id !== currentChatId) {
    // CROSS-CHAT CONTAMINATION DETECTED
    error(SUBSYSTEM.RUNNING,
      `Storage belongs to chat '${stored_chat_id}', ` +
      `but current is '${currentChatId}'. Resetting.`
    );

    // Reset to prevent contamination
    chat_metadata.auto_recap_running_scene_recaps = {
      chat_id: currentChatId,
      current_version: 0,
      versions: []
    };
  }

  return chat_metadata.auto_recap_running_scene_recaps;
}
```

**Source:** `runningSceneRecap.js:19-43`

### When Validation Runs

Every time running recap data is accessed:
- `get_running_recap_storage()`
- `get_running_recap_versions()`
- `get_running_recap()`
- `add_running_recap_version()`

---

## Data Persistence Flow

```
┌──────────────────────────────────────────────────────┐
│              IN-MEMORY STATE                         │
│                                                      │
│  - message.extra.auto_recap.*                       │
│  - chat_metadata.auto_recap_running_scene_recaps    │
│                                                      │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │ saveChatDebounced│
         │ () called        │
         └──────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │ Debounce timer   │
         │ (relaxed: 1s)    │
         └──────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │ ctx.saveChat()   │
         │ executed         │
         └──────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │ JSON serialized  │
         │ to disk          │
         └──────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│              PERSISTED STATE                         │
│                                                      │
│  /chats/[character]/[timestamp].jsonl                │
│                                                      │
│  {                                                   │
│    "chat_metadata": {                               │
│      "auto_recap_running_scene_recaps": { ... }     │
│    },                                               │
│    "messages": [                                    │
│      {                                              │
│        "extra": {                                   │
│          "auto_recap": { ... }                      │
│        }                                            │
│      }                                              │
│    ]                                                │
│  }                                                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Related Documentation

- [Implementation Details](./implementation.md) - Complete technical implementation
- [Running Scene Recap](../RUNNING_SCENE_RECAP.md) - Running recap system
- [Data Storage Inventory](../../reference/DATA_STORAGE_INVENTORY.md) - Storage reference

---

**Status:** Complete and actively used

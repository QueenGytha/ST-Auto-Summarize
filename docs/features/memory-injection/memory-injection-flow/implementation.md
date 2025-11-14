# Memory Injection Flow - Implementation Details

This document provides a comprehensive technical breakdown of how memory injection works in ST-Auto-Recap, tracing the complete flow from trigger to LLM prompt.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Injection Trigger Mechanism](#injection-trigger-mechanism)
4. [Memory Selection Logic](#memory-selection-logic)
5. [Memory Formatting](#memory-formatting)
6. [Injection Registration](#injection-registration)
7. [Position, Depth, and Role Control](#position-depth-and-role-control)
8. [Enable/Disable Control](#enabledisable-control)
9. [Performance Considerations](#performance-considerations)
10. [Code Examples](#code-examples)

---

## Architecture Overview

### File Structure

```
ST-Auto-Recap/
├── memoryCore.js                # Central injection orchestration
├── runningSceneRecap.js         # Running recap generation and injection text
├── settingsManager.js           # Chat enable/disable logic
├── eventHandlers.js             # Event-based injection triggers
├── defaultSettings.js           # Injection configuration defaults
└── index.js                     # Barrel exports for injection functions
```

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `refresh_memory()` | memoryCore.js | Main orchestrator for memory injection |
| `refresh_memory_debounced()` | memoryCore.js | Debounced version for frequent events |
| `get_running_recap_injection()` | runningSceneRecap.js | Formats running recap for injection |
| `chat_enabled()` | settingsManager.js | Determines if injection should occur |
| `update_message_inclusion_flags()` | memoryCore.js | Marks messages for inclusion (unused in current implementation) |
| `check_message_exclusion()` | memoryCore.js | Filters messages by exclusion criteria |

---

## Core Components

### 1. Memory Core (memoryCore.js)

The `memoryCore.js` file is the central orchestrator for memory injection. It contains the `refresh_memory()` function which:

1. Checks if chat is enabled
2. Auto-hides old messages (if configured)
3. Updates message inclusion flags (currently unused)
4. Retrieves running scene recap injection text
5. Registers injection with SillyTavern via `setExtensionPrompt()`

**Key Code Section** (memoryCore.js:300-334):

```javascript
async function refresh_memory() {
  const ctx = getContext();

  // --- Declare scene injection position/role/depth/scan variables ---
  const scene_recap_position = get_settings('running_scene_recap_position');
  const scene_recap_role = get_settings('running_scene_recap_role');
  const scene_recap_depth = get_settings('running_scene_recap_depth');
  const scene_recap_scan = get_settings('running_scene_recap_scan');

  // --- Auto-hide/unhide messages older than X ---
  await auto_hide_messages_by_command();
  // --- end auto-hide ---

  if (!chat_enabled()) {// if chat not enabled, remove the injections
    ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
    return "";
  }

  debug("Refreshing memory");

  // Update the UI according to the current state of the chat memories
  update_message_inclusion_flags(); // update the inclusion flags for all messages

  // --- Scene Recap Injection ---
  const scene_injection = get_running_recap_injection();
  debug(SUBSYSTEM.MEMORY, `Using running scene recap for injection (${scene_injection.length} chars)`);

  // Store for later logging
  last_scene_injection = scene_injection;

  // Only inject scene recaps (message recaps are NOT injected)
  ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, scene_injection, scene_recap_position, scene_recap_depth, scene_recap_scan, scene_recap_role);

  return scene_injection; // return the scene injection
}
```

### 2. Running Scene Recap (runningSceneRecap.js)

This module provides the `get_running_recap_injection()` function which:

1. Retrieves the current running recap version
2. Applies the template to format the recap for injection
3. Returns the formatted injection text

**Key Code Section** (runningSceneRecap.js:621-634):

```javascript
function get_running_recap_injection() {
  const current = get_running_recap();
  if (!current || !current.content) {
    return "";
  }

  const template = get_settings('running_scene_recap_template') || "";
  if (!template.trim()) {
    // Fallback to simple format
    return current.content;
  }

  return template.replace(/\{\{running_recap\}\}/g, current.content);
}
```

### 3. Settings Manager (settingsManager.js)

The `chat_enabled()` function determines whether memory injection should occur for the current chat:

**Key Code Section** (settingsManager.js:202-212):

```javascript
function chat_enabled() {
  // check if the extension is enabled in the current chat
  const context = getContext();

  // global state
  if (get_settings('use_global_toggle_state')) {
    return get_settings('global_toggle_state');
  }

  // per-chat state
  return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled');
}
```

---

## Injection Trigger Mechanism

### Event-Based Triggers

Memory injection is triggered by SillyTavern events through `eventHandlers.js`. The following events trigger `refresh_memory()`:

#### Event: CHAT_CHANGED

**Handler**: `handleChatChanged()` (eventHandlers.js:59-89)

```javascript
async function handleChatChanged() {
  const context = getContext();

  auto_load_profile(); // load the profile for the current chat or character
  refresh_memory(); // refresh the memory state
  if (context?.chat?.length) {
    scrollChatToBottom(); // scroll to the bottom of the chat (area is added due to memories)
  }
  // Auto scene break detection on chat load
  processSceneBreakOnChatLoad();

  // Ensure chat lorebook exists
  // ... lorebook initialization ...

  // Reload queue from new chat's lorebook (after ensuring it's available)
  // ... queue reload ...
}
```

**Purpose**: When user switches chats, reload memory for the new chat.

#### Event: MESSAGE_DELETED

**Handler**: `handleMessageDeleted()` (eventHandlers.js:129-140)

```javascript
function handleMessageDeleted() {
  if (!chat_enabled()) {return;}
  debug("Message deleted, refreshing memory and cleaning up running recaps");
  refresh_memory();
  cleanup_invalid_running_recaps();
  // Update the version selector UI after cleanup
  if (typeof window.updateVersionSelector === 'function') {
    window.updateVersionSelector();
  }
  // Refresh the scene navigator bar to remove deleted scenes
  renderSceneNavigatorBar();
}
```

**Purpose**: When a message is deleted, refresh memory to remove deleted content from injection.

#### Event: MESSAGE_SWIPED

**Handler**: `handleMessageSwiped()` (eventHandlers.js:177-194)

```javascript
function handleMessageSwiped(index) {
  if (!chat_enabled()) {return;}
  const context = getContext();
  debug("Message swiped, reloading memory");

  // if this is creating a new swipe, remove the current memory.
  // This is detected when the swipe ID is greater than the last index in the swipes array,
  //  i.e. when the swipe ID is EQUAL to the length of the swipes array, not when it's length-1.
  const message = context.chat[index];
  if (message.swipe_id === message.swipes.length) {
    clear_memory(message);
  }

  refresh_memory();

  // make sure the chat is scrolled to the bottom because the memory will change
  scrollChatToBottom();
}
```

**Purpose**: When user swipes to a different response, refresh memory to reflect new content.

#### Event: MESSAGE_SENT

**Handler**: `handleMessageSent()` (eventHandlers.js:196-201)

```javascript
function handleMessageSent() {
  if (!chat_enabled()) {return;}
  if (last_scene_injection) {
    debug(`[MEMORY INJECTION] scene_injection:\n${last_scene_injection}`);
  }
}
```

**Purpose**: Log the injection that was used for this message (for debugging).

#### Event: MORE_MESSAGES_LOADED

**Direct Listener** (eventHandlers.js:396-402)

```javascript
eventSource.on(event_types.MORE_MESSAGES_LOADED, () => {
  refresh_memory();
  renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
  renderSceneNavigatorBar();
});
```

**Purpose**: When older messages are loaded into view, refresh memory to include them.

### Debouncing Strategy

Two versions of `refresh_memory()` exist:

1. **`refresh_memory()`**: Immediate execution
2. **`refresh_memory_debounced()`**: Debounced with `debounce_timeout.relaxed` (typically 300ms)

**Debouncing Code** (memoryCore.js:335):

```javascript
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);
```

**When to Use Each**:

- Use **immediate** for critical events (chat changed, message sent)
- Use **debounced** for frequent events (UI updates, rapid message edits)

---

## Memory Selection Logic

### Current Implementation: Running Scene Recap Only

The current implementation ONLY injects running scene recaps. Individual message recaps are NOT injected, despite the infrastructure existing for them.

**Evidence** (memoryCore.js:330-331):

```javascript
// Only inject scene recaps (message recaps are NOT injected)
ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, scene_injection, scene_recap_position, scene_recap_depth, scene_recap_scan, scene_recap_role);
```

### Infrastructure for Individual Message Recaps (Unused)

The code contains infrastructure for individual message recap selection, but it's not currently used for injection:

#### Message Inclusion Flags

**Function**: `update_message_inclusion_flags()` (memoryCore.js:93-140)

This function was designed to mark messages for inclusion in short-term memory by:

1. Iterating through chat in reverse order (newest to oldest)
2. Checking each message against exclusion criteria
3. Checking if message has a recap (`get_memory()`)
4. Accumulating recaps until token limit is reached
5. Marking included messages with `set_data(message, 'include', 'Recap of message(s)')`

**Key Code**:

```javascript
function update_message_inclusion_flags() {
  // Update all messages in the chat, flagging them as single message recaps or long-term memories to include in the injection.
  // This has to be run on the entire chat since it needs to take the context limits into account.
  const context = getContext();
  const chat = context.chat;

  debug("Updating message inclusion flags");

  // iterate through the chat in reverse order and mark the messages that should be included as single message recaps
  let message_recap_limit_reached = false;
  const end = chat.length - 1;
  let recap = ""; // total concatenated recap so far
  let new_recap = ""; // temp recap storage to check token length
  for (let i = end; i >= 0; i--) {
    const message = chat[i];

    // check for any of the exclusion criteria
    const include = check_message_exclusion(message);
    if (!include) {
      set_data(message, 'include', null);
      continue;
    }

    if (!message_recap_limit_reached) {// single message limit hasn't been reached yet
      const memory = get_memory(message);
      if (!memory) {// If it doesn't have a memory, mark it as excluded and move to the next
        set_data(message, 'include', null);
        continue;
      }

      new_recap = concatenate_recap(recap, message); // concatenate this recap
      const message_recap_token_size = count_tokens(new_recap);
      if (message_recap_token_size > get_short_token_limit()) {// over context limit
        message_recap_limit_reached = true;
        recap = ""; // reset recap
      } else {// under context limit
        set_data(message, 'include', 'Recap of message(s)');
        recap = new_recap;
        continue;
      }
    }

    // if we haven't marked it for inclusion yet, mark it as excluded
    set_data(message, 'include', null);
  }

  update_all_message_visuals();
}
```

#### Message Exclusion Criteria

**Function**: `check_message_exclusion()` (memoryCore.js:42-92)

This function checks if a message should be excluded from recap injection based on:

1. Extension-generated system messages (`is_auto_recap_system_memory`)
2. Explicitly excluded messages (`exclude` flag)
3. User messages (if `include_user_messages` is false)
4. Thought messages from Stepped Thinking extension
5. System/hidden messages (if `include_system_messages` is false)
6. Narrator messages (if `include_narrator_messages` is false)
7. Messages from disabled characters
8. Messages below token threshold (`message_length_threshold`)

**Key Code**:

```javascript
function check_message_exclusion(message) {
  // check for any exclusion criteria for a given message based on current settings
  // (this does NOT take context lengths into account, only exclusion criteria based on the message itself).
  if (!message) {return false;}

  // system messages sent by this extension are always ignored
  if (get_data(message, 'is_auto_recap_system_memory')) {
    return false;
  }

  // check if it's marked to be excluded - if so, exclude it
  if (get_data(message, 'exclude')) {
    return false;
  }

  // check if it's a user message and exclude if the setting is disabled
  if (!get_settings('include_user_messages') && message.is_user) {
    return false;
  }

  // check if it's a thought message and exclude (Stepped Thinking extension)
  // NOTE: message.is_thoughts may be deprecated in newer versions of the Stepped Thinking extension,
  // but we keep this check for backward compatibility with older versions
  if (message.is_thoughts) {
    return false;
  }

  // check if it's a hidden message and exclude if the setting is disabled
  if (!get_settings('include_system_messages') && message.is_system) {
    return false;
  }

  // check if it's a narrator message
  if (!get_settings('include_narrator_messages') && message.extra?.type === system_message_types.NARRATOR) {
    return false;
  }

  // check if the character is disabled
  const char_key = get_character_key(message);
  if (!character_enabled(char_key)) {
    return false;
  }

  // Check if the message is too short
  const token_size = count_tokens(message.mes);
  if (token_size < get_settings('message_length_threshold')) {
    return false;
  }

  return true;
}
```

---

## Memory Formatting

### Template System

Memory formatting uses a simple template replacement system where `{{variable}}` placeholders are replaced with actual values.

**Current Template Variables**:

- `{{running_recap}}` - Replaced with current running recap content

**Default Template** (defaultSettings.js):

```javascript
const default_running_scene_template = `# Story Memory

The following is a cumulative memory of key scenes and developments from the roleplay so far.

{{running_recap}}`;
```

### Template Application

**Implementation** (runningSceneRecap.js:621-634):

```javascript
function get_running_recap_injection() {
  const current = get_running_recap();
  if (!current || !current.content) {
    return "";
  }

  const template = get_settings('running_scene_recap_template') || "";
  if (!template.trim()) {
    // Fallback to simple format
    return current.content;
  }

  return template.replace(/\{\{running_recap\}\}/g, current.content);
}
```

**Logic**:

1. Get current running recap version
2. If no content exists, return empty string (no injection)
3. Get template from settings
4. If template is empty/blank, return raw content (no formatting)
5. Replace `{{running_recap}}` with actual content
6. Return formatted injection text

### Empty Injection Behavior

When memory injection has no content to inject:

1. `get_running_recap_injection()` returns empty string `""`
2. `refresh_memory()` still calls `setExtensionPrompt()` with empty string
3. SillyTavern ignores empty extension prompts (no injection occurs)

**Code** (memoryCore.js:314):

```javascript
if (!chat_enabled()) {// if chat not enabled, remove the injections
  ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
  return "";
}
```

---

## Injection Registration

### SillyTavern Extension Prompt System

SillyTavern provides an **extension prompt system** that allows extensions to inject text into the LLM prompt at specific positions. This is accessed via the context object:

**API Signature** (sillytavern.d.ts:367-373):

```typescript
export function setExtensionPrompt(
    key: string,
    value: string,
    position: number,
    depth: number,
    scan?: boolean,
    role?: number,
    filter?: any
): void;
```

**Parameters**:

- `key`: Unique identifier for this extension prompt (e.g., `"auto_recap_scene"`)
- `value`: The text to inject (the actual memory content)
- `position`: Where to inject (see Position Control)
- `depth`: How deep in context to inject (see Depth Control)
- `scan`: Whether to scan this text for world info activation (optional)
- `role`: What role to use for injection (see Role Control, optional)
- `filter`: Optional filter function (not used by ST-Auto-Recap)

### Registration Call

**Implementation** (memoryCore.js:331):

```javascript
ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, scene_injection, scene_recap_position, scene_recap_depth, scene_recap_scan, scene_recap_role);
```

**Breakdown**:

- `${MODULE_NAME}_scene` = `"auto_recap_scene"` (unique key for scene injection)
- `scene_injection` = Formatted memory text from `get_running_recap_injection()`
- `scene_recap_position` = Setting: `running_scene_recap_position` (default: 2)
- `scene_recap_depth` = Setting: `running_scene_recap_depth` (default: 2)
- `scene_recap_scan` = Setting: `running_scene_recap_scan` (default: false)
- `scene_recap_role` = Setting: `running_scene_recap_role` (default: 0)

### Clearing Injections

When chat is disabled, the extension clears its injection by setting an empty string:

```javascript
ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
```

---

## Position, Depth, and Role Control

### Position Control

**Setting**: `running_scene_recap_position`
**Type**: Number (enum from `extension_prompt_types`)
**Default**: 2 (IN_PROMPT)

**Available Positions** (sillytavern.d.ts:148-153):

```typescript
export const extension_prompt_types: {
    BEFORE_PROMPT: number;  // 0 - Before character definitions
    IN_PROMPT: number;      // 1 - After character definitions
    AFTER_PROMPT: number;   // 2 - In system prompt area (recommended)
    [key: string]: number;
};
```

**Position Meanings**:

- `BEFORE_PROMPT (0)`: Inject before character card definitions
- `IN_PROMPT (1)`: Inject after character definitions but before chat history
- `AFTER_PROMPT (2)`: Inject in system prompt area (most common, default)

**Why Default is IN_PROMPT (2)**:

The default was set to position 2 (IN_PROMPT) to place memories in the system prompt area, where they act as persistent context that frames the entire conversation. This is the recommended position for memory-type injections.

### Depth Control

**Setting**: `running_scene_recap_depth`
**Type**: Number
**Default**: 2

**What Depth Means**:

Depth controls how far back in the context window the injection appears. Lower depth = closer to the end of the prompt (more recent context). Higher depth = further back (older context).

**Depth Values**:

- `0`: Shallowest (closest to current message)
- `1-9`: Progressively deeper
- Higher numbers push injection further back in context

**Why Default is 2**:

Depth 2 places memories near the beginning of the context but not at the absolute start. This gives them prominence without overshadowing the immediate conversation context.

### Role Control

**Setting**: `running_scene_recap_role`
**Type**: Number (enum from `extension_prompt_roles`)
**Default**: 0 (SYSTEM)

**Available Roles** (sillytavern.d.ts:159-164):

```typescript
export const extension_prompt_roles: {
    SYSTEM: number;     // 0 - System message role
    USER: number;       // 1 - User message role
    ASSISTANT: number;  // 2 - Assistant/AI message role
    [key: string]: number;
};
```

**Role Meanings**:

- `SYSTEM (0)`: Inject as system message (recommended for memory)
- `USER (1)`: Inject as if the user said it
- `ASSISTANT (2)`: Inject as if the AI said it

**Why Default is SYSTEM (0)**:

System role is appropriate for memory because it provides context/framing for the conversation without appearing to be part of the actual chat dialogue.

### Scan Control

**Setting**: `running_scene_recap_scan`
**Type**: Boolean
**Default**: false

**What Scan Means**:

When `scan: true`, SillyTavern's world info system will scan the injected memory text for keywords and potentially activate additional world info entries based on matches.

**Why Default is false**:

Scanning is disabled by default because:

1. Memories already contain relevant context
2. Scanning memories could trigger excessive world info activation
3. Token budget is better spent on actual memories

---

## Enable/Disable Control

### Chat-Level Enable

Memory injection can be controlled at the chat level using the `chat_enabled()` function.

**Implementation** (settingsManager.js:202-212):

```javascript
function chat_enabled() {
  // check if the extension is enabled in the current chat
  const context = getContext();

  // global state
  if (get_settings('use_global_toggle_state')) {
    return get_settings('global_toggle_state');
  }

  // per-chat state
  return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled');
}
```

**Logic**:

1. If `use_global_toggle_state` is true, return `global_toggle_state` (global on/off)
2. Otherwise, check `chats_enabled[chatId]` for per-chat state
3. If no per-chat state exists, fall back to `default_chat_enabled` setting

### Settings Hierarchy

```
1. Global Toggle (if enabled)
   └─ global_toggle_state

2. Per-Chat Toggle (if global disabled)
   ├─ chats_enabled[chatId]
   └─ default_chat_enabled (fallback)
```

### Disabling Injection

When injection is disabled, `refresh_memory()` clears the extension prompt:

```javascript
if (!chat_enabled()) {// if chat not enabled, remove the injections
  ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
  return "";
}
```

---

## Performance Considerations

### Debouncing Strategy

The extension uses debouncing to prevent excessive memory refreshes during rapid events.

**Debounce Configuration** (memoryCore.js:335):

```javascript
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);
```

**Debounce Timeouts** (constants.js):

```javascript
export const debounce_timeout = {
  // ... other timeouts ...
  relaxed: 300,  // 300ms delay for non-critical updates
};
```

**When to Use Debounced**:

- Frequent UI updates
- Rapid message edits
- Multiple sequential operations

**When to Use Immediate**:

- Critical chat events (CHAT_CHANGED, MESSAGE_SENT)
- User-initiated actions
- Operations that must complete before next step

### Token Counting Overhead

The `update_message_inclusion_flags()` function counts tokens for every message to determine inclusion. This is currently called on every `refresh_memory()` even though the results aren't used for injection.

**Optimization Opportunity**:

Since individual message recaps aren't currently injected, the `update_message_inclusion_flags()` call could be skipped to improve performance. However, it's kept for UI purposes (showing which messages would be included).

### Empty Injection Optimization

SillyTavern automatically ignores empty extension prompts, so there's no performance penalty for calling `setExtensionPrompt()` with an empty string when no memories exist.

---

## Code Examples

### Example 1: Basic Memory Injection Flow

```javascript
// Event triggered: CHAT_CHANGED
// Handler calls refresh_memory()

async function refresh_memory() {
  const ctx = getContext();

  // Get injection settings
  const scene_recap_position = get_settings('running_scene_recap_position'); // 2
  const scene_recap_role = get_settings('running_scene_recap_role'); // 0 (SYSTEM)
  const scene_recap_depth = get_settings('running_scene_recap_depth'); // 2
  const scene_recap_scan = get_settings('running_scene_recap_scan'); // false

  // Auto-hide old messages
  await auto_hide_messages_by_command();

  // Check if injection is enabled for this chat
  if (!chat_enabled()) {
    // Clear injection if disabled
    ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
    return "";
  }

  // Update message inclusion flags (currently unused)
  update_message_inclusion_flags();

  // Get running scene recap injection text
  const scene_injection = get_running_recap_injection();
  // Result: "# Story Memory\n\nThe following is...\n\n## Characters\n..."

  // Register injection with SillyTavern
  ctx.setExtensionPrompt(
    `${MODULE_NAME}_scene`,  // key: "auto_recap_scene"
    scene_injection,          // value: formatted memory text
    scene_recap_position,     // position: 2 (IN_PROMPT)
    scene_recap_depth,        // depth: 2
    scene_recap_scan,         // scan: false
    scene_recap_role          // role: 0 (SYSTEM)
  );

  return scene_injection;
}
```

### Example 2: Template Formatting

```javascript
// User has configured a custom template
const template = get_settings('running_scene_recap_template');
// Template: "=== STORY CONTEXT ===\n\n{{running_recap}}\n\n=== END CONTEXT ==="

// Running recap content
const current = get_running_recap();
const content = current.content;
// Content: "## Characters\nAlice: Warrior princess\n\n## Locations\nKingdom of Light"

// Apply template
const injection = template.replace(/\{\{running_recap\}\}/g, content);

// Result:
// "=== STORY CONTEXT ===
//
// ## Characters
// Alice: Warrior princess
//
// ## Locations
// Kingdom of Light
//
// === END CONTEXT ==="
```

### Example 3: Enable/Disable Logic

```javascript
// Scenario 1: Global toggle enabled
get_settings('use_global_toggle_state'); // true
get_settings('global_toggle_state'); // true
chat_enabled(); // Returns: true (all chats enabled)

// Scenario 2: Per-chat toggle
get_settings('use_global_toggle_state'); // false
getContext().chatId; // "chat-123"
get_settings('chats_enabled'); // {"chat-123": false, "chat-456": true}
chat_enabled(); // Returns: false (this chat disabled)

// Scenario 3: Default fallback
get_settings('use_global_toggle_state'); // false
getContext().chatId; // "chat-789"
get_settings('chats_enabled'); // {"chat-123": false} (chat-789 not present)
get_settings('default_chat_enabled'); // true
chat_enabled(); // Returns: true (fallback to default)
```

### Example 4: Event-Based Trigger

```javascript
// Event: MESSAGE_DELETED
// User deletes a message from the chat

// SillyTavern fires event
eventSource.on(event_types.MESSAGE_DELETED, (id) => on_chat_event('message_deleted', id));

// Event router dispatches to handler
async function on_chat_event(event, data) {
  const handler = eventHandlers[event];
  await handler(data); // Calls handleMessageDeleted()
}

// Handler refreshes memory
function handleMessageDeleted() {
  if (!chat_enabled()) {return;} // Early exit if disabled

  debug("Message deleted, refreshing memory and cleaning up running recaps");

  refresh_memory(); // Refresh injection to reflect deleted content
  cleanup_invalid_running_recaps(); // Remove invalid recap versions

  // Update UI
  if (typeof window.updateVersionSelector === 'function') {
    window.updateVersionSelector();
  }
  renderSceneNavigatorBar();
}
```

### Example 5: Clearing Injection When Disabled

```javascript
// User disables extension for current chat
set_settings('chats_enabled', {
  ...get_settings('chats_enabled'),
  [getContext().chatId]: false
});

// Next message send triggers refresh_memory()
async function refresh_memory() {
  const ctx = getContext();

  // ... get settings ...

  // Check if enabled
  if (!chat_enabled()) { // Returns false
    // Clear injection by setting empty string
    ctx.setExtensionPrompt(
      `${MODULE_NAME}_scene`,
      "", // Empty value
      extension_prompt_types.IN_PROMPT,
      0   // Minimal depth
    );
    return ""; // Early exit
  }

  // ... rest of injection logic (not executed) ...
}
```

---

## Summary

The Memory Injection Flow in ST-Auto-Recap is a sophisticated system that:

1. **Triggers** on SillyTavern events (chat changed, message sent, etc.)
2. **Checks** if injection is enabled for the current chat
3. **Selects** running scene recap as the memory to inject (individual recaps unused)
4. **Formats** memory using template system (default or custom)
5. **Registers** injection with SillyTavern via `setExtensionPrompt()`
6. **Controls** injection placement using position, depth, and role settings
7. **Optimizes** performance using debouncing for frequent events

The system is designed for extensibility (individual message recaps are partially implemented) but currently focuses on running scene recap injection as the primary memory type.

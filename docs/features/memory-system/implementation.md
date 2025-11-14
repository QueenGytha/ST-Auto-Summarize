# Memory System Architecture - Implementation Details

## Overview

The Memory System is the critical architecture that manages how recaps are stored, calculated, and injected into LLM prompts. It handles multiple memory tiers with different inclusion strategies, token limits, and injection positions.

This document provides comprehensive implementation details for the memory system architecture.

## Core Architecture

### Memory Tiers

The system manages **5 distinct memory tiers**:

1. **Short-Term Memory** - Recent message recaps within token budget
2. **Long-Term Memory** - Older message recaps (DEPRECATED - not currently used)
3. **Scene Recaps** - Scene-level summaries at scene break markers
4. **Combined Recap** - Merged narrative of all message recaps
5. **Running Scene Recap** - Combined narrative of all scene recaps (versioned)

### Primary Files

| File | Lines | Purpose |
|------|-------|---------|
| `memoryCore.js` | 345 | Core memory calculation and injection logic |
| `messageData.js` | 141 | Message-level data storage and retrieval |
| `runningSceneRecap.js` | 300+ | Running scene recap versioning system |
| `autoHide.js` | 110 | Auto-hide old messages by scene count |
| `utils.js` | 93-103 | Token limit calculation |

---

## Memory Storage Architecture

### Message-Level Storage

Memory is stored at the message level using the `MODULE_NAME` namespace under `message.extra`:

```javascript
// Storage structure
message.extra.auto_recap = {
  memory: "The recap text",           // Regular message recap
  include: "Recap of message(s)",     // Inclusion status
  scene_recap_memory: "Scene recap",  // Scene-level recap
  scene_recap_versions: [...],        // All scene recap versions
  scene_recap_current_index: 0,       // Active version
  exclude: false,                     // Exclusion flag
  edited: false,                      // Manual edit flag
  prefill: "...",                     // Prefill used
  reasoning: "...",                   // LLM reasoning
  error: null                         // Error message if failed
}
```

**Source:** `messageData.js:13-22`, `memoryCore.js:30-39`

### Access Functions

```javascript
// Read data from message
function get_data(message, key) {
  return message?.extra?.[MODULE_NAME]?.[key];
}

// Write data to message
function set_data(message, key, value) {
  if (!message.extra) message.extra = {};
  if (!message.extra[MODULE_NAME]) message.extra[MODULE_NAME] = {};
  message.extra[MODULE_NAME][key] = value;

  // Also save on current swipe
  const swipe_index = message.swipe_id;
  if (swipe_index && message.swipe_info?.[swipe_index]) {
    // Copy to swipe info
  }

  saveChatDebounced();
}
```

**Source:** `messageData.js:13-38`

### Memory Retrieval

The `get_memory()` function retrieves memory with optional prefill:

```javascript
function get_memory(message) {
  let memory = get_data(message, 'memory') ?? "";
  const prefill = get_data(message, 'prefill') ?? "";

  // Prepend prefill if setting enabled
  if (get_settings('show_prefill')) {
    memory = `${prefill}${memory}`;
  }
  return memory;
}
```

**Source:** `messageData.js:43-52`

---

## Message Inclusion Logic

### Exclusion Criteria

The `check_message_exclusion()` function determines if a message should be excluded from memory:

```javascript
function check_message_exclusion(message) {
  // 1. System messages from this extension
  if (get_data(message, 'is_auto_recap_system_memory')) {
    return false;
  }

  // 2. Explicitly excluded messages
  if (get_data(message, 'exclude')) {
    return false;
  }

  // 3. User messages (if setting disabled)
  if (!get_settings('include_user_messages') && message.is_user) {
    return false;
  }

  // 4. Thought messages (Stepped Thinking extension)
  if (message.is_thoughts) {
    return false;
  }

  // 5. System/hidden messages (if setting disabled)
  if (!get_settings('include_system_messages') && message.is_system) {
    return false;
  }

  // 6. Narrator messages (if setting disabled)
  if (!get_settings('include_narrator_messages') &&
      message.extra?.type === system_message_types.NARRATOR) {
    return false;
  }

  // 7. Disabled characters (in group chats)
  const char_key = get_character_key(message);
  if (!character_enabled(char_key)) {
    return false;
  }

  // 8. Messages below token threshold
  const token_size = count_tokens(message.mes);
  if (token_size < get_settings('message_length_threshold')) {
    return false;
  }

  return true; // Include this message
}
```

**Source:** `memoryCore.js:42-92`

### Settings That Control Exclusion

| Setting | Type | Default | Effect |
|---------|------|---------|--------|
| `include_user_messages` | boolean | true | Include user messages in recaps |
| `include_system_messages` | boolean | true | Include hidden/system messages |
| `include_narrator_messages` | boolean | true | Include narrator messages |
| `message_length_threshold` | number | 0 | Minimum message token size |
| `disabled_group_characters` | object | {} | Disabled characters in group chats |

**Source:** `defaultSettings.js:46-49`, `settingsManager.js:252-282`

---

## Short-Term Memory Calculation

### Token Limit Calculation

The token limit for short-term memory is calculated dynamically:

```javascript
function get_short_token_limit() {
  const message_recap_context_limit = get_settings('message_recap_context_limit');
  const number_type = get_settings('message_recap_context_type');

  if (number_type === "percent") {
    const context_size = get_context_size();
    return Math.floor(context_size * message_recap_context_limit / 100);
  } else {
    return message_recap_context_limit; // Absolute token count
  }
}
```

**Source:** `utils.js:93-103`

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `message_recap_context_limit` | number | varies | Token limit (absolute or percent) |
| `message_recap_context_type` | string | "percent" | "percent" or "absolute" |

### Inclusion Algorithm

The `update_message_inclusion_flags()` function calculates which messages to include:

```javascript
function update_message_inclusion_flags() {
  const context = getContext();
  const chat = context.chat;

  // Iterate in REVERSE order (newest to oldest)
  let message_recap_limit_reached = false;
  const end = chat.length - 1;
  let recap = ""; // Accumulated recap text

  for (let i = end; i >= 0; i--) {
    const message = chat[i];

    // Check exclusion criteria
    const include = check_message_exclusion(message);
    if (!include) {
      set_data(message, 'include', null);
      continue;
    }

    if (!message_recap_limit_reached) {
      const memory = get_memory(message);
      if (!memory) {
        set_data(message, 'include', null);
        continue;
      }

      // Try concatenating this recap
      new_recap = concatenate_recap(recap, message);
      const token_size = count_tokens(new_recap);

      if (token_size > get_short_token_limit()) {
        // LIMIT REACHED - stop including
        message_recap_limit_reached = true;
        recap = "";
      } else {
        // UNDER LIMIT - mark for inclusion
        set_data(message, 'include', 'Recap of message(s)');
        recap = new_recap;
        continue;
      }
    }

    // Not included - mark as excluded
    set_data(message, 'include', null);
  }

  update_all_message_visuals();
}
```

**Source:** `memoryCore.js:93-140`

### Concatenation Logic

```javascript
function concatenate_recap(existing_text, message) {
  const memory = get_memory(message);
  if (!memory) return existing_text;

  const separator = existing_text ? "\n" : "";
  return existing_text + separator + memory;
}
```

**Source:** `memoryCore.js:141-149`

---

## Scene Recap System

### Storage Location

Scene recaps are stored differently than message recaps:

- **Message recaps**: `message.extra.auto_recap.memory`
- **Scene recaps**: `message.extra.auto_recap.scene_recap_memory`

**Source:** `memoryCore.js:30-39`

### Scene Recap Fields

| Field | Type | Description |
|-------|------|-------------|
| `scene_recap_memory` | string | Current scene recap text |
| `scene_recap_versions` | array | All versions of the recap |
| `scene_recap_current_index` | number | Active version index |
| `scene_break_name` | string | Scene name/title |
| `scene_break_visible` | boolean | Whether scene break is visible |
| `scene_recap_include` | boolean | Whether to include in injection |

### Scene Recap Collection

```javascript
function concatenate_recaps(indexes) {
  const context = getContext();
  const chat = context.chat;
  const recaps = [];
  let count = 1;

  for (const i of indexes) {
    const message = chat[i];
    let type, recap;

    if (get_data(message, 'scene_recap_memory')) {
      // Scene recap
      type = 'Scene-wide Recap';
      recap = get_data(message, 'scene_recap_memory');
    } else {
      // Single message recap
      type = get_data(message, 'include');
      recap = get_data(message, 'memory');
    }

    if (recap) {
      recaps.push({ id: count, recap, type });
      count++;
    }
  }

  return JSON.stringify(recaps, null, 2);
}
```

**Source:** `memoryCore.js:152-175`

---

## Running Scene Recap System

### Storage Location

Running scene recaps are stored in **chat metadata** (not message-level):

```javascript
chat_metadata.auto_recap_running_scene_recaps = {
  chat_id: currentChatId,      // Chat ID for validation
  current_version: 0,          // Active version number
  versions: [                  // All versions
    {
      version: 0,
      timestamp: Date.now(),
      content: "...",
      scene_count: 5,
      excluded_count: 1,
      prev_scene_index: 0,
      new_scene_index: 4
    }
  ]
}
```

**Source:** `runningSceneRecap.js:19-43`

### Version Management

```javascript
function get_running_recap_storage() {
  const currentChatId = getCurrentChatId();

  if (!chat_metadata.auto_recap_running_scene_recaps) {
    // Initialize storage
    chat_metadata.auto_recap_running_scene_recaps = {
      chat_id: currentChatId,
      current_version: 0,
      versions: []
    };
  } else if (chat_metadata.auto_recap_running_scene_recaps.chat_id !== currentChatId) {
    // VALIDATION: Prevent cross-chat contamination
    error(SUBSYSTEM.RUNNING,
      `Running recap storage belongs to chat '${...}', but current chat is '${...}'`);

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

### Adding New Versions

```javascript
function add_running_recap_version(
  content,
  scene_count,
  excluded_count,
  prev_scene_index = 0,
  new_scene_index = 0
) {
  const storage = get_running_recap_storage();
  const versions = storage.versions || [];

  // Find highest version number
  const max_version = versions.reduce((max, v) => Math.max(max, v.version), -1);
  const new_version = max_version + 1;

  const version_obj = {
    version: new_version,
    timestamp: Date.now(),
    content: content,
    scene_count: scene_count,
    excluded_count: excluded_count,
    prev_scene_index: prev_scene_index,
    new_scene_index: new_scene_index
  };

  versions.push(version_obj);
  storage.versions = versions;
  storage.current_version = new_version;

  saveChatDebounced();

  return new_version;
}
```

**Source:** `runningSceneRecap.js:86-123`

---

## Memory Injection System

### Injection Mechanism

Memory is injected using SillyTavern's `setExtensionPrompt()` API:

```javascript
ctx.setExtensionPrompt(
  key,        // Unique identifier (e.g., "auto_recap_scene")
  value,      // The memory text to inject
  position,   // Where to inject (extension_prompt_types)
  depth,      // How many messages back
  scan,       // Whether to scan for activation
  role        // Message role (system/user/assistant)
);
```

**Source:** `sillytavern.d.ts:367-375`, `memoryCore.js:331`

### Extension Prompt Types

```javascript
extension_prompt_types = {
  BEFORE_PROMPT: 0,  // Before everything
  IN_PROMPT: 1,      // In the prompt (main position)
  AFTER_PROMPT: 2    // After the prompt
}
```

**Source:** `sillytavern.d.ts:149-154`

### Extension Prompt Roles

```javascript
extension_prompt_roles = {
  SYSTEM: 0,      // System message
  USER: 1,        // User message
  ASSISTANT: 2    // Assistant message
}
```

**Source:** `sillytavern.d.ts:157-165`

### Current Injection Strategy

The extension currently injects **ONLY scene recaps** (message recaps are NOT injected):

```javascript
async function refresh_memory() {
  const ctx = getContext();

  // Get scene recap injection settings
  const scene_recap_position = get_settings('running_scene_recap_position');
  const scene_recap_role = get_settings('running_scene_recap_role');
  const scene_recap_depth = get_settings('running_scene_recap_depth');
  const scene_recap_scan = get_settings('running_scene_recap_scan');

  // Auto-hide old messages
  await auto_hide_messages_by_command();

  if (!chat_enabled()) {
    // Clear injection if chat disabled
    ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
    return "";
  }

  // Update message inclusion flags (for UI display)
  update_message_inclusion_flags();

  // Get running scene recap for injection
  const scene_injection = get_running_recap_injection();

  // Store for logging
  last_scene_injection = scene_injection;

  // INJECT: Only scene recaps (message recaps NOT injected)
  ctx.setExtensionPrompt(
    `${MODULE_NAME}_scene`,
    scene_injection,
    scene_recap_position,
    scene_recap_depth,
    scene_recap_scan,
    scene_recap_role
  );

  return scene_injection;
}
```

**Source:** `memoryCore.js:300-334`

### Injection Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `running_scene_recap_position` | number | 2 | Position type (BEFORE_PROMPT=0, IN_PROMPT=1, AFTER_PROMPT=2) |
| `running_scene_recap_depth` | number | 2 | How many messages back to inject |
| `running_scene_recap_role` | number | 0 | Message role (SYSTEM=0, USER=1, ASSISTANT=2) |
| `running_scene_recap_scan` | boolean | false | Whether to scan for activation |

**Source:** `defaultSettings.js:88-91`, `memoryCore.js:304-307`

---

## Auto-Hide System

### Purpose

The auto-hide system hides messages older than a specified number of scenes to keep the UI manageable.

### Algorithm

```javascript
async function auto_hide_messages_by_command() {
  const ctx = getContext();
  const auto_hide_scene_count = get_settings('auto_hide_scene_count');
  const chat = ctx.chat;

  const to_hide = new Set();
  const to_unhide = new Set();

  // Initialize: assume all messages should be visible
  for (let i = 0; i < chat.length; i++) {
    to_unhide.add(i);
  }

  // Apply scene-based hiding
  applySceneBasedHiding(chat, auto_hide_scene_count, to_hide, to_unhide);

  // Execute hide/unhide commands
  await processBatchedCommands(ctx, Array.from(to_hide).sort(), 'hide');
  await processBatchedCommands(ctx, Array.from(to_unhide).sort(), 'unhide');
}
```

**Source:** `autoHide.js:81-107`

### Scene-Based Hiding

```javascript
function applySceneBasedHiding(chat, auto_hide_scene_count, to_hide, to_unhide) {
  if (auto_hide_scene_count < 0) return;

  // Find all visible scene breaks
  const scene_break_indexes = findVisibleSceneBreaks(chat);
  const scenes_to_keep = auto_hide_scene_count;

  if (scene_break_indexes.length >= scenes_to_keep) {
    const first_visible_scene = scene_break_indexes.length - scenes_to_keep;
    const visible_start = scene_break_indexes[first_visible_scene] + 1;

    // Hide all messages before visible_start
    for (let i = 0; i < visible_start; i++) {
      to_hide.add(i);
      to_unhide.delete(i);
    }

    // Unhide all messages from visible_start onwards
    for (let i = visible_start; i < chat.length; i++) {
      to_unhide.add(i);
      to_hide.delete(i);
    }
  }
}
```

**Source:** `autoHide.js:22-44`

### Setting

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `auto_hide_scene_count` | number | 2 | Hide messages older than this many scenes |

**Source:** `defaultSettings.js:67`

---

## Memory Cleanup

### Comprehensive Cleanup

The `clear_all_recaps_for_chat()` function removes all recap data:

```javascript
function clear_all_recaps_for_chat() {
  const ctx = getContext();
  const chat = ctx.chat;

  let messageMetadataCleared = 0;
  let singleRecapsCleared = 0;
  let sceneRecapsCleared = 0;
  let sceneBreaksCleared = 0;
  let checkedFlagsCleared = 0;
  let swipeRecapsCleared = 0;

  for (const message of chat) {
    const moduleData = message?.extra?.[MODULE_NAME];

    if (moduleData) {
      messageMetadataCleared++;

      if (moduleData.memory) singleRecapsCleared++;
      if (moduleData.scene_recap_memory) sceneRecapsCleared++;
      if (moduleData.scene_break) sceneBreaksCleared++;
      if (moduleData.auto_scene_break_checked) checkedFlagsCleared++;

      // Remove entire module data block
      delete message.extra[MODULE_NAME];
      if (message.extra && Object.keys(message.extra).length === 0) {
        delete message.extra;
      }
    }

    // Clear lorebook tracking data
    if (message.extra?.activeLorebookEntries) {
      delete message.extra.activeLorebookEntries;
    }
    if (message.extra?.inactiveLorebookEntries) {
      delete message.extra.inactiveLorebookEntries;
    }

    // Clear swipe recap data
    if (Array.isArray(message?.swipe_info)) {
      for (const swipe of message.swipe_info) {
        if (swipe?.extra?.[MODULE_NAME]) {
          delete swipe.extra[MODULE_NAME];
          if (swipe.extra && Object.keys(swipe.extra).length === 0) {
            delete swipe.extra;
          }
          swipeRecapsCleared++;
        }
      }
    }
  }

  // Clear running scene recaps
  const runningRecapCleared = clear_running_scene_recaps();

  // Clear active lorebook data
  clearActiveLorebooksData();

  saveChatDebounced();

  // Force scene break rescan on next run
  if (typeof window !== 'undefined') {
    window.autoRecapForceSceneBreakRescan = true;
  }

  return {
    messageMetadataCleared,
    singleRecapsCleared,
    sceneRecapsCleared,
    sceneBreaksCleared,
    checkedFlagsCleared,
    swipeRecapsCleared,
    runningRecapCleared
  };
}
```

**Source:** `memoryCore.js:177-280`

---

## Refresh Memory Flow

### Trigger Points

The `refresh_memory()` function is called at several points:

1. **After message send** - `eventHandlers.js`
2. **After scene break created** - `sceneBreak.js`
3. **After settings change** - `settingsUI.js`
4. **Manual refresh** - User clicks refresh button

### Debouncing

```javascript
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);
```

**Source:** `memoryCore.js:335`

The debounced version prevents rapid repeated calls during bulk operations.

---

## Message Visuals Integration

### Visual Indicators

The memory system integrates with `messageVisuals.js` to show recap status below each message:

- **Green** - Recap generated and included in memory
- **Yellow** - Recap generated but excluded (past token limit)
- **Red** - Error during recap generation
- **Gray** - No recap or recap disabled

### Update Function

```javascript
update_all_message_visuals(); // Updates ALL message indicators
```

Called by:
- `memoryCore.js:139` - After updating inclusion flags
- Various other modules when recap data changes

---

## Settings Integration

### Memory-Related Settings

#### Message Filtering

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `include_user_messages` | boolean | true | Include user messages |
| `include_system_messages` | boolean | true | Include system/hidden messages |
| `include_narrator_messages` | boolean | true | Include narrator messages |
| `message_length_threshold` | number | 0 | Minimum token size |

**Source:** `defaultSettings.js:46-49`

#### Token Limits

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `message_recap_context_limit` | number | varies | Token limit for short-term memory |
| `message_recap_context_type` | string | "percent" | "percent" or "absolute" |

#### Scene Recap Injection

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `running_scene_recap_position` | number | 2 | Injection position (0-2) |
| `running_scene_recap_depth` | number | 2 | Injection depth |
| `running_scene_recap_role` | number | 0 | Message role (0-2) |
| `running_scene_recap_scan` | boolean | false | Scan for activation |

**Source:** `defaultSettings.js:88-91`

#### Running Scene Recap

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `running_scene_recap_enabled` | boolean | true | Enable running scene recap |
| `running_scene_recap_exclude_latest` | number | 1 | Exclude N latest scenes |
| `running_scene_recap_auto_generate` | boolean | true | Auto-generate on new scene |

**Source:** `defaultSettings.js:83-95`

---

## Key Algorithms Summary

### 1. Message Inclusion Algorithm

**Purpose:** Determine which messages to include in short-term memory

**Strategy:**
- Iterate messages in REVERSE order (newest to oldest)
- Accumulate recap text while under token limit
- Stop when limit exceeded
- Mark messages with inclusion status

**Source:** `memoryCore.js:93-140`

### 2. Scene Recap Collection

**Purpose:** Collect all scene recaps for a range of messages

**Strategy:**
- Iterate through message indexes
- Check for scene recap or message recap
- Build array of recap objects with type labels
- Return as JSON string

**Source:** `memoryCore.js:152-175`

### 3. Auto-Hide Algorithm

**Purpose:** Hide messages older than N scenes

**Strategy:**
- Find all visible scene breaks
- Calculate visible start index (N scenes back)
- Mark all messages before visible_start for hiding
- Mark all messages after visible_start for unhiding
- Execute batched hide/unhide commands

**Source:** `autoHide.js:22-107`

### 4. Running Recap Version Management

**Purpose:** Maintain versioned history of running scene recaps

**Strategy:**
- Store versions in chat metadata with chat_id validation
- Auto-increment version numbers
- Track scene count and excluded count per version
- Support manual version switching
- Delete old versions when needed

**Source:** `runningSceneRecap.js:19-150`

---

## Integration Points

### With Scene Break System

- **Scene creation** triggers running recap regeneration
- **Scene visibility** affects auto-hide calculation
- **Scene recaps** feed into running scene recap

### With Recap Generation

- **Message recaps** stored via `set_data(message, 'memory', ...)`
- **Scene recaps** stored via `set_data(message, 'scene_recap_memory', ...)`
- **Inclusion flags** updated after recap generation

### With UI System

- **Message visuals** show recap status below messages
- **Scene navigator** shows scene break markers
- **Version selector** shows running recap versions

### With Event System

- **MESSAGE_SENT** triggers recap generation and memory refresh
- **MESSAGE_EDITED** triggers recap regeneration
- **MESSAGE_SWIPED** triggers recap regeneration
- **CHAT_CHANGED** triggers memory refresh

---

## Performance Considerations

### Token Counting

Token counting is expensive - the system caches token counts where possible and only recalculates when necessary.

### Debouncing

Memory refresh is debounced to prevent rapid repeated calls:

```javascript
const refresh_memory_debounced = debounce(refresh_memory, debounce_timeout.relaxed);
```

**Source:** `memoryCore.js:335`

### Batch Operations

Auto-hide executes hide/unhide commands in batches for contiguous ranges:

```javascript
// Instead of: /hide 1, /hide 2, /hide 3
// Execute: /hide 1-3
```

**Source:** `autoHide.js:47-79`

---

## Error Handling

### Chat Validation

Running scene recap validates chat_id to prevent cross-chat contamination:

```javascript
if (chat_metadata.auto_recap_running_scene_recaps.chat_id !== currentChatId) {
  error(SUBSYSTEM.RUNNING, `Running recap storage belongs to different chat`);
  // Reset storage
}
```

**Source:** `runningSceneRecap.js:28-39`

### Missing Data

Functions handle missing data gracefully:

```javascript
if (!memory) {
  set_data(message, 'include', null);
  continue; // Skip this message
}
```

**Source:** `memoryCore.js:118-121`

---

## Testing Considerations

### Test Coverage Required

1. **Message inclusion** with various exclusion criteria
2. **Token limit enforcement** (both percent and absolute)
3. **Scene recap collection** with mixed message/scene recaps
4. **Auto-hide logic** with various scene counts
5. **Running recap versioning** with cross-chat validation
6. **Memory refresh** triggers at various points

### Mock Requirements

Tests need to mock:
- `getContext()` - Chat state
- `get_settings()` - Settings values
- `count_tokens()` - Token counting
- `setExtensionPrompt()` - Injection API

---

## Future Enhancements

### Potential Improvements

1. **Long-term memory tier** - Currently deprecated but could be re-enabled
2. **Combined recap injection** - Currently not injected
3. **Per-tier token limits** - Different limits for different tiers
4. **Smart inclusion** - ML-based importance ranking
5. **Compression strategies** - Hierarchical summarization

---

## Related Documentation

- [Data Flow Diagram](./data-flow.md) - Visual flow of memory calculation
- [Running Scene Recap](../RUNNING_SCENE_RECAP.md) - Running recap system details
- [Data Storage Inventory](../../reference/DATA_STORAGE_INVENTORY.md) - Complete storage reference
- [Settings Guide](../../guides/DEFAULT_SETTINGS_BEST_PRACTICES.md) - Configuration recommendations

---

**Implementation Status:** Complete and actively used in production

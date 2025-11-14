# Chat Enable/Disable Per Chat - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Data Structures](#data-structures)
4. [Key Mechanisms](#key-mechanisms)
5. [Integration Points](#integration-points)
6. [Error Handling](#error-handling)
7. [Testing](#testing)

## Overview

The Chat Enable/Disable Per Chat feature allows users to toggle the entire Auto-Recap extension on or off for individual chats. When disabled, the extension performs no operations and injects no memory into the LLM prompt.

### Purpose

1. **Per-chat control**: Independent enable/disable state for each chat
2. **Global mode option**: Alternative mode where all chats share one toggle state
3. **Memory gating**: All memory injection disabled when feature is off
4. **Event filtering**: No event handlers execute when disabled
5. **Persistent state**: Settings survive chat switches and page reloads

### Architecture

**Three-Tier State System:**
- **Global Toggle Mode**: Single state for all chats
- **Per-Chat Mode**: Independent state per chat ID
- **Default Fallback**: State for new/unknown chats

### Key Files

- `settingsManager.js` - Core enable/disable logic
- `eventHandlers.js` - Feature gate checks
- `memoryCore.js` - Memory injection gating
- `settingsUI.js` - UI toggle bindings
- `slashCommands.js` - `/toggle_memory` command
- `buttonBindings.js` - Context menu button

## Core Components

### chat_enabled()

**File:** settingsManager.js:202-213

Returns `true` if the extension is enabled for the current chat, `false` if disabled.

**Signature:**
```javascript
function chat_enabled()
```

**Logic:**
```javascript
// 1. Check mode
if (get_settings('use_global_toggle_state')) {
  return get_settings('global_toggle_state');
}

// 2. Get current chat ID
const chatId = getCurrentChatId();

// 3. Lookup per-chat state
const enabled = get_settings('chats_enabled') || {};
if (chatId in enabled) {
  return enabled[chatId];
}

// 4. Fallback to default
return get_settings('default_chat_enabled');
```

**Called By:**
- memoryCore.js:313 - Memory injection gate
- eventHandlers.js:130, 143, 169, 178, 197, 204 - Event handler gates
- messageVisuals.js:54-55 - Visual indicator display
- Various other locations (20+ call sites)

**Return Value:**
- `true` - Extension is enabled for current chat
- `false` - Extension is disabled for current chat

### toggle_chat_enabled(value = null)

**File:** settingsManager.js:214-251

Toggles or sets the enabled state for the current chat.

**Signature:**
```javascript
function toggle_chat_enabled(value = null)
```

**Parameters:**
- `value` (boolean|null) - If provided, sets to this value. If null, toggles current state.

**Logic:**
```javascript
// 1. Get current state
const current = chat_enabled();

// 2. Calculate new value
const newValue = (value !== null) ? value : !current;

// 3. Update settings based on mode
if (get_settings('use_global_toggle_state')) {
  // Global mode: update global_toggle_state
  set_settings('global_toggle_state', newValue);
} else {
  // Per-chat mode: update chats_enabled dictionary
  const chatId = getCurrentChatId();
  const enabled = get_settings('chats_enabled') || {};
  enabled[chatId] = newValue;
  set_settings('chats_enabled', enabled);
}

// 4. Save settings
saveSettingsDebounced();

// 5. Update UI
const message = newValue
  ? "Memory is now enabled for this chat"
  : "Memory is now disabled for this chat";
toastr.info(message, 'Memory Toggled', {timeOut: 2000});

// 6. Refresh memory and UI
refresh_memory();
update_all_message_visuals();
refresh_settings();
scrollChatToBottom();
```

**Called By:**
- settingsUI.js:77 - Toggle button click handler
- slashCommands.js:68 - `/toggle_memory` command
- buttonBindings.js:100 - Context menu button

**Effects:**
- Updates extension_settings
- Triggers debounced settings save
- Shows toast notification
- Refreshes memory injection
- Updates message visuals
- Refreshes settings UI
- Scrolls chat to bottom

### getCurrentChatId()

**File:** settingsManager.js:117-120

Gets the current chat identifier.

**Signature:**
```javascript
function getCurrentChatId()
```

**Return Value:**
- Single character chat: `this_chid` (character ID number)
- Group chat: `selected_group` (group ID string)

**Usage:**
```javascript
const chatId = getCurrentChatId();
// Returns: 42 (for character) or 'group_1234' (for group)
```

## Data Structures

### Extension Settings Storage

**Location:** `extension_settings['auto_recap']`

**Relevant Keys:**
```javascript
{
  // Mode Selection
  use_global_toggle_state: boolean,  // true = global mode, false = per-chat mode

  // Global Mode State
  global_toggle_state: boolean,      // State when in global mode (affects all chats)

  // Per-Chat Mode State
  chats_enabled: {                   // Dictionary of per-chat states
    [chatId: string|number]: boolean
  },

  // Fallback Default
  default_chat_enabled: boolean,     // Default for new/unknown chats

  // ... 60+ other extension settings
}
```

### State Lookup Examples

**Example 1: Per-Chat Mode**
```javascript
extension_settings['auto_recap'] = {
  use_global_toggle_state: false,
  chats_enabled: {
    42: true,           // Character 42: enabled
    43: false,          // Character 43: disabled
    'group_1': true     // Group 1: enabled
  },
  default_chat_enabled: true
};

// Current chat: 42
chat_enabled(); // → true

// Current chat: 43
chat_enabled(); // → false

// Current chat: 44 (new, not in dictionary)
chat_enabled(); // → true (uses default_chat_enabled)
```

**Example 2: Global Mode**
```javascript
extension_settings['auto_recap'] = {
  use_global_toggle_state: true,
  global_toggle_state: false,
  chats_enabled: {
    42: true,    // IGNORED in global mode
    43: false    // IGNORED in global mode
  },
  default_chat_enabled: true  // IGNORED in global mode
};

// ALL chats return same value
chat_enabled(); // → false (regardless of chat ID)
```

## Key Mechanisms

### Initialization Flow

**Event:** `CHAT_CHANGED`

**Handler:** eventHandlers.js:59-89

**Flow:**
```
STEP 1: SillyTavern fires CHAT_CHANGED event
    ↓
STEP 2: handleChatChanged() called
    File: eventHandlers.js:59
    ↓
STEP 3: Check if extension enabled
    Call: chat_enabled()
    File: settingsManager.js:202
    ↓
STEP 4: If disabled → Skip all initialization
    No profile loading
    No memory refresh
    No UI updates
    ↓
STEP 5: If enabled → Full initialization
    auto_load_profile()
    refresh_memory()
    update_all_message_visuals()
    initialize_message_buttons()
```

### Toggle Flow

**User Action:** Click toggle button

**Handler:** settingsUI.js:77

**Flow:**
```
STEP 1: User clicks memory toggle button
    Selector: selectorsExtension.memory.toggle
    Handler: toggle_chat_enabled()
    File: settingsManager.js:214
    ↓
STEP 2: Get current state
    current = chat_enabled()  // e.g., true
    ↓
STEP 3: Calculate new value
    newValue = !current  // e.g., false
    ↓
STEP 4: Update settings based on mode

    If use_global_toggle_state = true:
        set_settings('global_toggle_state', false)
        → Affects ALL chats immediately

    If use_global_toggle_state = false:
        chatId = getCurrentChatId()  // e.g., 42
        enabled = get_settings('chats_enabled')  // e.g., {42: true, 43: false}
        enabled[42] = false
        set_settings('chats_enabled', {42: false, 43: false})
        → Affects ONLY current chat
    ↓
STEP 5: Save settings
    saveSettingsDebounced()
    → Debounced write to extension_settings
    ↓
STEP 6: Show toast notification
    toastr.info("Memory is now disabled for this chat", ...)
    ↓
STEP 7: Refresh memory injection
    refresh_memory()
    → Calls chat_enabled() to determine injection
    → If disabled: clears all memory from prompt
    → If enabled: injects memory into prompt
    ↓
STEP 8: Update visuals
    update_all_message_visuals()
    → Hides/shows memory indicators below messages
    ↓
STEP 9: Refresh UI
    refresh_settings()
    → Updates toggle button state in settings panel
    ↓
STEP 10: Scroll chat
    scrollChatToBottom()
    → User sees all updates
```

### Chat Switch Flow

**Event:** `CHAT_CHANGED`

**Flow:**
```
STEP 1: User switches from Chat A to Chat B
    SillyTavern fires CHAT_CHANGED event
    ↓
STEP 2: handleChatChanged() executes
    File: eventHandlers.js:59
    ↓
STEP 3: chat_enabled() checks new chat state

    Mode: Per-Chat
    chatId = getCurrentChatId()  // Chat B ID
    enabled = get_settings('chats_enabled')
    Lookup: enabled[chatB]

    Chat B state in dictionary? → Return that value
    Chat B NOT in dictionary? → Return default_chat_enabled
    ↓
STEP 4: Branch based on state

    If Chat B disabled:
        → Skip profile loading
        → Skip memory refresh
        → Clear all memory from prompt
        → Hide all visuals
        → Update toggle to "off" state

    If Chat B enabled:
        → Load profile for Chat B
        → Refresh memory for Chat B messages
        → Inject memory into prompt
        → Show memory visuals
        → Update toggle to "on" state
```

### Memory Injection Gating

**Location:** memoryCore.js:313-316

**Logic:**
```javascript
function inject_memory() {
  // Gate check
  if (!chat_enabled()) {
    // Extension disabled: clear ALL injections
    clear_all_memory_from_prompt();
    return;
  }

  // Extension enabled: proceed with injection
  const memory = gather_memory_for_injection();
  insert_memory_into_prompt(memory);
}
```

**Effect:**
- Disabled → No memory visible to LLM
- Enabled → Full memory injection per settings

### Event Handler Gating

**Pattern Used in eventHandlers.js:**

**Example 1: MESSAGE_SENT handler**
```javascript
// File: eventHandlers.js:197
function handleMessageSent(messageIndex) {
  // Gate check
  if (!chat_enabled()) return;

  // Proceed with recap generation
  enqueueOperation({
    type: OperationType.RECAP,
    metadata: { message_id: messageIndex }
  });
}
```

**All Gated Handlers:**
- handleCharMessage (line 169) - Character message received
- handleMessageDeleted (line 130) - Message deleted
- handleMessageEdited (line 143) - Message edited
- handleMessageSwiped (line 178) - Message swiped
- handleMessageSent (line 197) - Message sent
- handleChatChanged (line 59) - Chat switched
- handleGroupChatCreated (line 204) - Group chat created

**Effect:**
- Disabled → No operations queued, no processing
- Enabled → Full event handling per normal

## Integration Points

### Settings UI Integration

**File:** settingsUI.js

**Toggle Button:**
- Selector: `selectorsExtension.memory.toggle`
- Event: `click`
- Handler: `() => toggle_chat_enabled()`
- Line: 77

**Checkboxes:**
- `default_chat_enabled` checkbox
  - Updates: `extension_settings.auto_recap.default_chat_enabled`
  - Line: 90
- `use_global_toggle_state` checkbox
  - Updates: `extension_settings.auto_recap.use_global_toggle_state`
  - Line: 91

### Slash Command Integration

**File:** slashCommands.js:56-72

**Command:** `/toggle_memory`

**Handler:**
```javascript
SlashCommandParser.addCommandObject(SlashCommand.fromProps({
  name: 'toggle_memory',
  callback: (args, value) => {
    if (value === undefined || value.trim() === '') {
      // No argument: toggle
      toggle_chat_enabled();
    } else {
      // Argument provided: set to true/false
      const enabled = isTrueBoolean(value);
      toggle_chat_enabled(enabled);
    }
    return String(chat_enabled());
  },
  returns: 'boolean (string)',
  helpString: 'Toggle memory for current chat or set to true/false'
}));
```

**Usage:**
```
/toggle_memory          → Toggles current state
/toggle_memory true     → Enables for current chat
/toggle_memory false    → Disables for current chat
```

### Context Menu Integration

**File:** buttonBindings.js:100

**Button:** "Toggle Memory" in message context menu

**Handler:**
```javascript
$(document).on('click', '.toggle_memory_button', function() {
  toggle_chat_enabled();
});
```

### Memory Core Integration

**File:** memoryCore.js:313-316

**Function:** `inject_memory()`

**Integration:**
```javascript
if (!chat_enabled()) {
  // Clear all memory from prompt
  clear_all_memory_from_prompt();
  return;
}

// Proceed with normal memory injection
```

### Message Visuals Integration

**File:** messageVisuals.js:54-55

**Function:** `update_message_visual(messageIndex)`

**Integration:**
```javascript
if (!chat_enabled()) {
  // Hide all memory indicators
  remove_visual_indicator(messageIndex);
  return;
}

// Show memory indicators per normal
```

### Event System Integration

**All event handlers check `chat_enabled()` before processing:**

| Event | Handler | File | Line | Effect if Disabled |
|-------|---------|------|------|-------------------|
| MESSAGE_SENT | handleMessageSent | eventHandlers.js | 197 | No recap generated |
| MESSAGE_RECEIVED | handleCharMessage | eventHandlers.js | 169 | No recap generated |
| MESSAGE_DELETED | handleMessageDeleted | eventHandlers.js | 130 | No cleanup |
| MESSAGE_EDITED | handleMessageEdited | eventHandlers.js | 143 | No regeneration |
| MESSAGE_SWIPED | handleMessageSwiped | eventHandlers.js | 178 | No regeneration |
| CHAT_CHANGED | handleChatChanged | eventHandlers.js | 59 | No initialization |
| GROUP_CHAT_CREATED | handleGroupChatCreated | eventHandlers.js | 204 | No setup |

## Error Handling

### Missing Context

**Scenario:** `getCurrentChatId()` called when no chat loaded

**Handling:**
- SillyTavern guarantees context exists when events fire
- Extension only processes during active chat
- No explicit error handling needed

**Fallback:**
- Returns `undefined` if no context
- Lookup `enabled[undefined]` → not found → uses `default_chat_enabled`

### Corrupted chats_enabled Dictionary

**Scenario:** `chats_enabled` contains invalid data

**Detection:**
```javascript
const enabled = get_settings('chats_enabled') || {};
if (typeof enabled !== 'object') {
  enabled = {};
}
```

**Recovery:**
- `soft_reset_settings()` restores defaults
- `hard_reset_settings()` full reset
- File: settingsManager.js:300-400

### Missing Chat ID in Dictionary

**Scenario:** Chat ID not in `chats_enabled` dictionary

**Handling:**
```javascript
const enabled = get_settings('chats_enabled') || {};
if (chatId in enabled) {
  return enabled[chatId];
}
// Not found: use default
return get_settings('default_chat_enabled');
```

**Effect:**
- New chats get `default_chat_enabled` value
- First toggle adds chat to dictionary
- Graceful fallback, no errors

### Mode Switch Edge Case

**Scenario:** User switches from per-chat to global mode

**Handling:**
```javascript
// chat_enabled() checks mode first
if (get_settings('use_global_toggle_state')) {
  // Use global state (ignores chats_enabled dictionary)
  return get_settings('global_toggle_state');
}
```

**Effect:**
- Per-chat states preserved in dictionary
- Global mode ignores them
- Switching back to per-chat mode restores previous states
- No data loss

## Testing

### Test Scenario 1: Per-Chat Toggle

**Setup:**
1. Set `use_global_toggle_state = false`
2. Load Chat A (character 42)
3. Enable memory: `toggle_chat_enabled(true)`

**Verification:**
```javascript
// Check settings
extension_settings.auto_recap.chats_enabled[42] === true

// Check function
chat_enabled() === true

// Check UI
$('.memory_toggle_button').hasClass('menu_button_active') === true
```

**Test:**
4. Switch to Chat B (character 43)
5. Check state: `chat_enabled()` → should be `default_chat_enabled` (Chat B not in dictionary)
6. Disable memory: `toggle_chat_enabled(false)`
7. Switch back to Chat A
8. Verify: `chat_enabled() === true` (independent states)

**Expected:**
- Chat A and B have independent states
- Toggling in one doesn't affect the other
- States persist across switches

### Test Scenario 2: Global Mode

**Setup:**
1. Set `use_global_toggle_state = true`
2. Set `global_toggle_state = true`
3. Load Chat A

**Verification:**
```javascript
chat_enabled() === true
```

**Test:**
4. Toggle off: `toggle_chat_enabled()`
5. Switch to Chat B
6. Check state: `chat_enabled()` → should be `false`
7. Toggle on from Chat B
8. Switch to Chat C
9. Check state: `chat_enabled()` → should be `true`

**Expected:**
- All chats share same toggle state
- Toggling in any chat affects all chats
- Immediate effect across all chats

### Test Scenario 3: Memory Injection

**Setup:**
1. Load chat with existing recaps
2. Enable memory
3. Generate new message

**Verification (enabled):**
```javascript
// Memory should be injected
const prompt = gather_prompt_for_llm();
prompt.includes('Memory:') === true  // Memory present in prompt
```

**Test:**
4. Disable memory: `toggle_chat_enabled(false)`
5. Generate new message

**Verification (disabled):**
```javascript
// Memory should NOT be injected
const prompt = gather_prompt_for_llm();
prompt.includes('Memory:') === false  // No memory in prompt
```

**Expected:**
- Enabled → Memory visible in LLM prompt
- Disabled → No memory in LLM prompt

### Test Scenario 4: Persistence

**Setup:**
1. Load Chat A
2. Enable memory: `toggle_chat_enabled(true)`
3. Reload extension: `location.reload()`

**Verification:**
```javascript
// After reload
chat_enabled() === true  // State restored from extension_settings
```

**Expected:**
- State persists across page reload
- Settings auto-saved via `saveSettingsDebounced()`

### Test Scenario 5: Event Handler Gating

**Setup:**
1. Load chat
2. Disable memory: `toggle_chat_enabled(false)`
3. Send message

**Verification:**
```javascript
// Check operation queue
const queue = getOperationQueue();
queue.length === 0  // No recap operation queued
```

**Test:**
4. Enable memory: `toggle_chat_enabled(true)`
5. Send message

**Verification:**
```javascript
// Check operation queue
const queue = getOperationQueue();
queue.some(op => op.type === OperationType.RECAP) === true  // Recap queued
```

**Expected:**
- Disabled → No event handlers execute, no operations
- Enabled → Full event handling, operations queued

### Test Scenario 6: Visual Indicators

**Setup:**
1. Load chat with existing recaps
2. Recaps visible below messages

**Test:**
3. Disable memory: `toggle_chat_enabled(false)`

**Verification:**
```javascript
// Check message visuals
$('.memory_display').is(':visible') === false  // Indicators hidden
```

**Test:**
4. Enable memory: `toggle_chat_enabled(true)`

**Verification:**
```javascript
// Check message visuals
$('.memory_display').is(':visible') === true  // Indicators shown
```

**Expected:**
- Disabled → All visual indicators hidden
- Enabled → Visual indicators shown

---

**Status:** Fully Documented - Complete implementation details with all functions, flows, and integration points

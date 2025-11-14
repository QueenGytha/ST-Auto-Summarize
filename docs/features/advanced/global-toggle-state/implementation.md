# Global Toggle State - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Data Structures](#data-structures)
4. [Key Mechanisms](#key-mechanisms)
5. [Settings UI Integration](#settings-ui-integration)
6. [Integration Points](#integration-points)

---

## Overview

The Global Toggle State feature allows the Auto-Recap extension to operate in "global mode" where a single enable/disable toggle state is shared across ALL chats.

### What This Feature Does

1. **Unified Control**: One toggle controls extension state for all chats
2. **State Sharing**: All chats reference the same `global_toggle_state` boolean value
3. **Instant Global Effect**: Changes affect all chats immediately
4. **Mode Selection**: Users can switch between global mode and per-chat mode

### Relationship to Per-Chat Mode

**Per-Chat Mode (Default):**
- `use_global_toggle_state: false`
- Each chat has its own enable/disable state in `chats_enabled` dictionary
- Toggling affects only the current chat

**Global Mode (Alternative):**
- `use_global_toggle_state: true`
- All chats share a single boolean: `global_toggle_state`
- Toggling affects all chats immediately

## Core Components

### 1. Settings Definition

**File:** `defaultSettings.js:43`
```javascript
use_global_toggle_state: false,  // Mode selector
```

**File:** `settingsManager.js:31`
```javascript
global_toggle_state: true,  // Global state when use_global_toggle_state = true
```

### 2. Main Function: chat_enabled()

**File:** `settingsManager.js:202-213`

```javascript
function chat_enabled() {
  const context = getContext();
  
  if (get_settings('use_global_toggle_state')) {
    return get_settings('global_toggle_state');
  }
  
  return get_settings('chats_enabled')?.[context.chatId] ?? 
         get_settings('default_chat_enabled');
}
```

**Mode Selection Logic:**
- If `use_global_toggle_state` is true: return `global_toggle_state` (affects all chats)
- Otherwise: return per-chat state or default

**Called By:** eventHandlers.js, memoryCore.js, messageVisuals.js, settingsUI.js, and 15+ other locations

### 3. Toggle Function: toggle_chat_enabled(value = null)

**File:** `settingsManager.js:214-251`

**Key Logic:**
- Calculate new value (toggle if null)
- Check mode and update appropriately:
  - Global mode: Update `global_toggle_state` (affects ALL chats)
  - Per-chat mode: Update `chats_enabled[currentChat]` (affects only this chat)
- Refresh UI and memory

### 4. Settings Access Functions

**File:** `settingsManager.js:160-168`

```javascript
function set_settings(key, value) {
  extension_settings[MODULE_NAME][key] = value;
  saveSettingsDebounced();
}

function get_settings(key) {
  return extension_settings[MODULE_NAME]?.[key] ?? default_settings[key];
}
```

## Data Structures

### Extension Settings Storage

**Location:** `extension_settings['auto_recap']`

```javascript
{
  use_global_toggle_state: boolean,    // Mode selector
  global_toggle_state: boolean,         // Shared state for all chats
  chats_enabled: {                      // Dictionary of per-chat states
    [chatId]: boolean
  },
  default_chat_enabled: boolean,        // Default for new chats
}
```

## Key Mechanisms

### Mode Selection

Single mode flag determines which data source is used:
- Global mode: Uses `global_toggle_state` (one value for all)
- Per-chat mode: Uses `chats_enabled[chatId]` (per-chat dictionary)

### State Propagation

1. User toggles in Chat A
2. `toggle_chat_enabled()` writes to `global_toggle_state`
3. Settings saved to disk
4. Chat B calls `chat_enabled()`
5. Returns same `global_toggle_state` value
6. Result: Chat B sees identical state as Chat A

## Settings UI Integration

**File:** `settings.html:437-439`

```html
<label title="Uses global on/off state..." class="checkbox_label">
  <input id="use_global_toggle_state" data-testid="misc-global-toggle" type="checkbox" />
  <span>Use Global Toggle State</span>
</label>
```

**File:** `settingsUI.js:91`

```javascript
bind_setting(selectorsExtension.misc.globalToggle, 'use_global_toggle_state', 'boolean');
```

## Integration Points

1. **Memory Injection (memoryCore.js):** Gates all memory gathering on `chat_enabled()`
2. **Event Handlers (eventHandlers.js):** All check `chat_enabled()` before executing
3. **Chat Switch (eventHandlers.js:59-89):** Calls `refresh_memory()` on each chat switch
4. **Toggle Button (settingsUI.js:77-78):** Bound to `toggle_chat_enabled()`
5. **Message Visuals (messageVisuals.js:54-55):** Gate on `chat_enabled()`
6. **Slash Commands (slashCommands.js:68):** Calls `toggle_chat_enabled()`

---

**Status:** Fully Documented - Implementation details complete with file references

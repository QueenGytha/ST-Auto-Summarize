# Chat Enable/Disable Per Chat - Data Flow

## Table of Contents

1. [Overview](#overview)
2. [Enable Extension Flow](#enable-extension-flow)
3. [Disable Extension Flow](#disable-extension-flow)
4. [Chat Switch Flow](#chat-switch-flow)
5. [Settings Persistence Flow](#settings-persistence-flow)
6. [Default State Initialization Flow](#default-state-initialization-flow)
7. [Complete Request Examples](#complete-request-examples)

## Overview

This document traces data flow through the Chat Enable/Disable Per Chat system, showing how extension state is toggled, persisted, and loaded for each chat.

### Flow Diagram Conventions

```
┌─────────────┐
│ Process Box │
└─────────────┘
      ↓
   Decision
   /      \
 YES       NO
  ↓         ↓
Result    Result
```

### Key Data Structures

```javascript
// Extension settings
extension_settings.auto_recap = {
  use_global_toggle_state: boolean,  // Mode selector
  global_toggle_state: boolean,       // Global mode value
  chats_enabled: {                    // Per-chat states
    [chatId]: boolean
  },
  default_chat_enabled: boolean       // Fallback for new chats
}

// State lookup
chat_enabled() → boolean
```

## Enable Extension Flow

### Trigger

User clicks toggle button to enable memory for current chat.

### Complete Trace

```
STEP 1: User clicks memory toggle button
    Location: Settings panel or navbar
    Selector: selectorsExtension.memory.toggle
    Event: 'click'
    File: settingsUI.js:77
    ↓
STEP 2: Handler invoked
    Function: toggle_chat_enabled()
    File: settingsManager.js:214
    Arguments: (none - will toggle current state)
    ↓
STEP 3: Get current state
    Call: chat_enabled()
    File: settingsManager.js:202

    Check mode: use_global_toggle_state = false (per-chat mode)
    Get chatId: getCurrentChatId() = 42
    Lookup: chats_enabled[42] = false
    Result: current = false
    ↓
STEP 4: Calculate new value
    value === null (no argument provided)
    newValue = !current = !false = true
    ↓
STEP 5: Update settings based on mode
    Mode: use_global_toggle_state = false

    Branch: Per-Chat Mode
    chatId = 42
    enabled = get_settings('chats_enabled') = {43: false}
    enabled[42] = true
    New state: {42: true, 43: false}

    Call: set_settings('chats_enabled', {42: true, 43: false})
    File: settingsManager.js:82
    ↓
STEP 6: Save settings
    Call: saveSettingsDebounced()
    File: settingsManager.js:95

    Debounced write to: extension_settings.auto_recap.chats_enabled
    Persistence: Auto-saved by SillyTavern
    ↓
STEP 7: Show notification
    Call: toastr.info("Memory is now enabled for this chat", 'Memory Toggled', {timeOut: 2000})
    UI: Toast notification appears
    ↓
STEP 8: Refresh memory injection
    Call: refresh_memory()
    File: memoryCore.js:245

    Sub-flow:
      → chat_enabled() = true (new state)
      → gather_all_memory() executes
      → inject_memory_into_prompt()
      → Memory now visible to LLM
    ↓
STEP 9: Update message visuals
    Call: update_all_message_visuals()
    File: messageVisuals.js:15

    For each message:
      → chat_enabled() = true
      → show_visual_indicator(messageIndex)
      → Memory displays appear below messages
    ↓
STEP 10: Refresh settings UI
    Call: refresh_settings()
    File: settingsUI.js:120

    Update toggle button:
      → Add 'menu_button_active' class
      → Button appears highlighted/active
    ↓
STEP 11: Scroll chat
    Call: scrollChatToBottom()
    SillyTavern function
    User sees all updates
```

### Data Transformation Summary

**Input:**
```javascript
// Before enable
extension_settings.auto_recap = {
  use_global_toggle_state: false,
  chats_enabled: {43: false},
  default_chat_enabled: true
}

// Current chat: 42
chat_enabled() → true (fallback to default_chat_enabled)
```

**Output:**
```javascript
// After enable
extension_settings.auto_recap = {
  use_global_toggle_state: false,
  chats_enabled: {42: true, 43: false},  // Chat 42 explicitly enabled
  default_chat_enabled: true
}

// Current chat: 42
chat_enabled() → true (explicit state in dictionary)
```

### ASCII Flow Diagram

```
┌────────────────────────────────────┐
│  User Clicks Toggle Button         │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│  toggle_chat_enabled()             │
│  No arguments (toggle mode)        │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│  Get Current State                 │
│  chat_enabled() → false            │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│  Calculate New Value               │
│  newValue = !false = true          │
└──────────────┬─────────────────────┘
               ↓
       Check Mode
      /          \
  Global?       Per-Chat?
     NO            YES
     ↓              ↓
┌──────────┐  ┌───────────────────────┐
│  Update  │  │  Update chats_enabled │
│  global_ │  │  chats_enabled[42]=true│
│  toggle  │  └──────────┬────────────┘
└────┬─────┘             ↓
     │            ┌──────────────────────┐
     └────────────│  Save Settings       │
                  │  saveSettingsDebounced()│
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │  Show Toast          │
                  │  "Memory enabled"    │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │  Refresh Memory      │
                  │  Inject into prompt  │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │  Update Visuals      │
                  │  Show indicators     │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │  Refresh UI          │
                  │  Highlight button    │
                  └──────────┬───────────┘
                             ↓
                  ┌──────────────────────┐
                  │  Scroll Chat         │
                  └──────────────────────┘
```

## Disable Extension Flow

### Trigger

User clicks toggle button to disable memory for current chat.

### Complete Trace

```
STEP 1: User clicks memory toggle button
    Current state: Enabled (button highlighted)
    File: settingsUI.js:77
    ↓
STEP 2: Handler invoked
    Function: toggle_chat_enabled()
    Arguments: (none)
    ↓
STEP 3: Get current state
    Call: chat_enabled()
    Result: current = true
    ↓
STEP 4: Calculate new value
    newValue = !true = false
    ↓
STEP 5: Update settings
    Mode: Per-Chat
    chatId = 42
    enabled[42] = false

    Call: set_settings('chats_enabled', {42: false, 43: false})
    ↓
STEP 6: Save settings
    Call: saveSettingsDebounced()
    ↓
STEP 7: Show notification
    Toast: "Memory is now disabled for this chat"
    ↓
STEP 8: Clear memory injection
    Call: refresh_memory()

    Sub-flow:
      → chat_enabled() = false
      → clear_all_memory_from_prompt()
      → No memory visible to LLM
    ↓
STEP 9: Hide message visuals
    Call: update_all_message_visuals()

    For each message:
      → chat_enabled() = false
      → remove_visual_indicator(messageIndex)
      → Memory displays hidden
    ↓
STEP 10: Refresh settings UI
    Toggle button:
      → Remove 'menu_button_active' class
      → Button appears dimmed/inactive
    ↓
STEP 11: Scroll chat
    User sees all updates
```

### Data Transformation Summary

**Input:**
```javascript
// Before disable
extension_settings.auto_recap = {
  chats_enabled: {42: true, 43: false}
}

chat_enabled() → true
```

**Output:**
```javascript
// After disable
extension_settings.auto_recap = {
  chats_enabled: {42: false, 43: false}
}

chat_enabled() → false
```

## Chat Switch Flow

### Trigger

User switches from Chat A to Chat B.

### Complete Trace

```
STEP 1: User clicks Chat B in chat list
    SillyTavern fires: CHAT_CHANGED event
    File: SillyTavern core
    ↓
STEP 2: Event handler invoked
    Function: handleChatChanged()
    File: eventHandlers.js:59
    ↓
STEP 3: Check if extension enabled for NEW chat
    Call: chat_enabled()
    File: settingsManager.js:202

    Mode: Per-Chat
    chatId = getCurrentChatId() = 43 (Chat B)
    chats_enabled = {42: true, 43: false}
    Lookup: chats_enabled[43] = false

    Result: false (Chat B is disabled)
    ↓
STEP 4: Branch based on state

    Chat B enabled? NO
    ↓
STEP 5: Skip all initialization (DISABLED branch)
    auto_load_profile() → SKIPPED
    refresh_memory() → SKIPPED
    update_all_message_visuals() → SKIPPED
    initialize_message_buttons() → SKIPPED

    Result:
      - No memory injected
      - No visuals shown
      - Toggle button appears inactive
      - Extension effectively OFF for Chat B
```

### Data Flow Diagram

```
┌─────────────────────────────────────┐
│  User Switches to Chat B            │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  CHAT_CHANGED Event                 │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  handleChatChanged()                │
└──────────────┬──────────────────────┘
               ↓
┌─────────────────────────────────────┐
│  chat_enabled()                     │
│  Check Chat B state                 │
└──────────────┬──────────────────────┘
               ↓
       Get chatId = 43
       Lookup chats_enabled[43]
               ↓
        ┌─────┴──────┐
        │            │
    Found=false   Not found
        │            │
        ↓            ↓
┌──────────────┐  ┌──────────────────┐
│  Chat B      │  │  Use             │
│  DISABLED    │  │  default_chat_   │
│              │  │  enabled         │
└──────┬───────┘  └────────┬─────────┘
       │                   │
       └─────────┬─────────┘
                 ↓
          State = false
                 ↓
┌─────────────────────────────────────┐
│  DISABLED Branch                    │
│  - Skip profile load                │
│  - Skip memory refresh              │
│  - Skip visual updates              │
│  - Skip button initialization       │
└─────────────────────────────────────┘
```

### Comparison: Enabled vs Disabled Chat Switch

**Chat A (Enabled) → Chat B (Disabled):**

| Step | Chat A | Chat B |
|------|--------|--------|
| State check | `chat_enabled() = true` | `chat_enabled() = false` |
| Profile load | ✓ Executed | ✗ Skipped |
| Memory refresh | ✓ Executed | ✗ Skipped |
| Visuals | ✓ Shown | ✗ Hidden |
| Toggle button | Active/highlighted | Inactive/dimmed |
| LLM prompt | Memory injected | No memory |

## Settings Persistence Flow

### Trigger

Extension settings are modified.

### Complete Trace

```
STEP 1: Settings modified
    Action: toggle_chat_enabled() updates chats_enabled
    Data: {42: true, 43: false}
    ↓
STEP 2: Debounced save triggered
    Function: saveSettingsDebounced()
    File: settingsManager.js:95
    Delay: 1000ms
    ↓
STEP 3: Debounce timer expires
    Timer completes after 1 second of inactivity
    ↓
STEP 4: Save function executes
    Function: saveSettings()
    File: settingsManager.js:72
    ↓
STEP 5: Write to extension_settings
    Target: extension_settings['auto_recap']
    Keys updated:
      - chats_enabled
      - global_toggle_state (if global mode)
    ↓
STEP 6: SillyTavern auto-save
    ST writes extension_settings to:
      - public/settings/{user}/settings.json
      - Backend storage
    ↓
STEP 7: Persistence complete
    State survives:
      - Page reload
      - Extension reload
      - Browser restart
```

### Persistence Guarantees

**Survived by:**
- Page reload (F5)
- Extension reload
- Chat switch
- Browser restart
- ST server restart

**Lost if:**
- Settings file deleted
- Hard reset settings (`hard_reset_settings()`)
- Extension uninstalled

## Default State Initialization Flow

### Trigger

User loads a chat that has never been explicitly enabled/disabled.

### Complete Trace

```
STEP 1: User loads Chat C (new chat, never toggled)
    CHAT_CHANGED event fires
    ↓
STEP 2: handleChatChanged() executes
    Call: chat_enabled()
    ↓
STEP 3: State lookup
    Mode: Per-Chat
    chatId = getCurrentChatId() = 99 (Chat C)
    chats_enabled = {42: true, 43: false}
    Lookup: chats_enabled[99]

    Result: undefined (not in dictionary)
    ↓
STEP 4: Fallback to default
    Return: get_settings('default_chat_enabled')
    Value: true (default setting)

    Result: Chat C is ENABLED by default
    ↓
STEP 5: Full initialization
    auto_load_profile()
    refresh_memory()
    update_all_message_visuals()
    initialize_message_buttons()

    Extension fully active for Chat C
    ↓
STEP 6: First toggle
    User: toggle_chat_enabled()

    chatId = 99
    enabled[99] = false (toggled off)
    New state: {42: true, 43: false, 99: false}

    Chat C now explicitly disabled
```

### State Transition Diagram

```
New Chat (ID: 99)
       ↓
  Not in dictionary
       ↓
┌─────────────────────────────────┐
│  Use default_chat_enabled       │
│  Value: true (default setting)  │
└────────────┬────────────────────┘
             ↓
     Initial State: ENABLED
             ↓
┌─────────────────────────────────┐
│  User Toggles                   │
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  Add to Dictionary              │
│  chats_enabled[99] = false      │
└────────────┬────────────────────┘
             ↓
     State: DISABLED (explicit)
             ↓
┌─────────────────────────────────┐
│  Future Lookups                 │
│  chats_enabled[99] → false      │
│  (no longer uses default)       │
└─────────────────────────────────┘
```

## Complete Request Examples

### Example 1: Enable Memory for Current Chat (Per-Chat Mode)

**Scenario:** User wants to enable memory for Chat 42

**Initial State:**
```javascript
extension_settings.auto_recap = {
  use_global_toggle_state: false,
  chats_enabled: {42: false, 43: true},
  default_chat_enabled: true
}

// Current chat: 42
chat_enabled() → false
```

**Execution:**
```
1. User: Clicks toggle button
2. Handler: toggle_chat_enabled()
3. Current state: chat_enabled() = false
4. New value: !false = true
5. Update: chats_enabled[42] = true
6. Save: saveSettingsDebounced()
7. Toast: "Memory is now enabled for this chat"
8. Memory: refresh_memory() → inject memory
9. Visuals: update_all_message_visuals() → show indicators
10. UI: refresh_settings() → highlight toggle
11. Scroll: scrollChatToBottom()
```

**Result:**
```javascript
extension_settings.auto_recap = {
  use_global_toggle_state: false,
  chats_enabled: {42: true, 43: true},  // Chat 42 now enabled
  default_chat_enabled: true
}

// Current chat: 42
chat_enabled() → true
```

### Example 2: Disable Memory Using Slash Command

**Scenario:** User types `/toggle_memory false` in Chat 43

**Initial State:**
```javascript
extension_settings.auto_recap = {
  use_global_toggle_state: false,
  chats_enabled: {42: true, 43: true},
  default_chat_enabled: true
}

// Current chat: 43
chat_enabled() → true
```

**Execution:**
```
1. User: Types "/toggle_memory false" and presses Enter
2. Command parser: Extracts argument "false"
3. Handler: toggle_chat_enabled(false)
4. Value provided: newValue = false (not toggled, set explicitly)
5. Update: chats_enabled[43] = false
6. Save: saveSettingsDebounced()
7. Toast: "Memory is now disabled for this chat"
8. Memory: refresh_memory() → clear memory
9. Visuals: update_all_message_visuals() → hide indicators
10. UI: refresh_settings() → dim toggle
11. Command return: "false" (new state)
```

**Result:**
```javascript
extension_settings.auto_recap = {
  use_global_toggle_state: false,
  chats_enabled: {42: true, 43: false},  // Chat 43 now disabled
  default_chat_enabled: true
}

// Current chat: 43
chat_enabled() → false
```

### Example 3: Switch Between Enabled and Disabled Chats

**Scenario:** User switches from enabled Chat 42 to disabled Chat 43

**Initial State:**
```javascript
extension_settings.auto_recap = {
  use_global_toggle_state: false,
  chats_enabled: {42: true, 43: false},
  default_chat_enabled: true
}

// Current chat: 42
chat_enabled() → true
```

**Execution:**
```
1. User: Clicks Chat 43 in chat list
2. ST Event: CHAT_CHANGED
3. Handler: handleChatChanged()

4. State Check (Chat 43):
   chatId = getCurrentChatId() = 43
   Lookup: chats_enabled[43] = false
   chat_enabled() = false

5. Disabled Branch:
   - auto_load_profile() SKIPPED
   - refresh_memory() SKIPPED
   - update_all_message_visuals() SKIPPED
   - initialize_message_buttons() SKIPPED

6. UI State:
   - Toggle button: inactive/dimmed
   - Memory displays: hidden
   - No memory in LLM prompt

7. User: Switches back to Chat 42

8. State Check (Chat 42):
   chatId = 42
   Lookup: chats_enabled[42] = true
   chat_enabled() = true

9. Enabled Branch:
   - auto_load_profile() EXECUTED
   - refresh_memory() EXECUTED (memory injected)
   - update_all_message_visuals() EXECUTED (indicators shown)
   - initialize_message_buttons() EXECUTED

10. UI State:
    - Toggle button: active/highlighted
    - Memory displays: visible
    - Memory in LLM prompt
```

**Result:**
- Chat 42 and Chat 43 have independent states
- Switching between them loads appropriate state
- States persist across switches

### Example 4: Global Mode Toggle Affects All Chats

**Scenario:** User enables global mode and toggles memory off

**Initial State:**
```javascript
extension_settings.auto_recap = {
  use_global_toggle_state: false,
  global_toggle_state: true,
  chats_enabled: {42: true, 43: false},
  default_chat_enabled: true
}

// Current chat: 42, Per-Chat Mode
chat_enabled() → true (from chats_enabled[42])
```

**Execution:**
```
1. User: Enables "Use Global Toggle State" checkbox
   set_settings('use_global_toggle_state', true)
   saveSettingsDebounced()

2. State Change:
   Mode: Per-Chat → Global

3. Current Chat (42):
   chat_enabled() → true (from global_toggle_state, not chats_enabled)

4. User: Clicks toggle button to disable
   toggle_chat_enabled()

5. New Value Calculation:
   current = true
   newValue = !true = false

6. Update (Global Mode):
   set_settings('global_toggle_state', false)
   (chats_enabled dictionary IGNORED)

7. Effect on ALL Chats:
   Chat 42: chat_enabled() = false
   Chat 43: chat_enabled() = false
   Chat 99: chat_enabled() = false
   Any chat: chat_enabled() = false

8. User: Switches to Chat 43
   chat_enabled() = false (global mode)
   Extension disabled

9. User: Toggles on from Chat 43
   set_settings('global_toggle_state', true)

10. Effect on ALL Chats:
    Chat 42: chat_enabled() = true
    Chat 43: chat_enabled() = true
    Any chat: chat_enabled() = true
```

**Result:**
```javascript
extension_settings.auto_recap = {
  use_global_toggle_state: true,
  global_toggle_state: true,  // Affects ALL chats
  chats_enabled: {42: true, 43: false},  // Preserved but IGNORED
  default_chat_enabled: true  // IGNORED in global mode
}

// All chats:
chat_enabled() → true (global)
```

---

**Status:** Fully Documented - Complete data flow traces for all operations with state transitions and examples

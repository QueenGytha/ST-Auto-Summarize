# Global Toggle State - Data Flow

## Table of Contents

1. [Overview](#overview)
2. [Complete Request Examples](#complete-request-examples)

---

## Overview

This document traces data flow through the Global Toggle State system.

### Key Data Structures

```javascript
extension_settings.auto_recap = {
  use_global_toggle_state: boolean,
  global_toggle_state: boolean,
  chats_enabled: {[chatId]: boolean},
  default_chat_enabled: boolean
}
```

## Complete Request Examples

### Example 1: Enable Global Mode

```
Initial State:
  use_global_toggle_state: false
  chats_enabled: {42: true}

Action: User checks "Use Global Toggle State"

Execution:
  bind_setting() handler fires
  set_settings('use_global_toggle_state', true)
  saveSettingsDebounced()

Result:
  use_global_toggle_state: true
  global_toggle_state: true

Effect:
  All chats use global_toggle_state (same value)
```

### Example 2: Toggle While in Global Mode

```
Initial State:
  use_global_toggle_state: true
  global_toggle_state: true

Action: User clicks toggle button

Execution:
  toggle_chat_enabled()
  current = true
  newValue = false
  set_settings('global_toggle_state', false)

Result:
  global_toggle_state: false

Effect:
  Chat A: false (disabled)
  Chat B: false (disabled - same state!)
  Chat C: false (disabled - same state!)
```

### Example 3: Mode Switch from Global to Per-Chat

```
Initial State:
  use_global_toggle_state: true
  chats_enabled: {42: true, 43: false}

Action: User unchecks "Use Global Toggle State"

Execution:
  set_settings('use_global_toggle_state', false)

Result:
  use_global_toggle_state: false
  chats_enabled: {42: true, 43: false}  (active again!)

Effect:
  Chat 42: true (restored)
  Chat 43: false (restored)
```

### Example 4: Chat Switch with Global Mode

```
State:
  use_global_toggle_state: true
  global_toggle_state: true

Action: User switches from Chat A to Chat B

Execution:
  handleChatChanged() fires
  refresh_memory() called
  chat_enabled() executes
    use_global_toggle_state = true
    returns global_toggle_state = true

Result:
  Chat B sees identical state as Chat A
```

---

Status: Data flow fully documented with 4 end-to-end examples

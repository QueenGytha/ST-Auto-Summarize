# Default Chat Enabled State - Data Flow

## Table of Contents

1. [Overview](#overview)
2. [Chat Enabled Lookup Flow](#chat-enabled-lookup-flow)
3. [New Chat Initialization Flow](#new-chat-initialization-flow)
4. [Toggle Chat State Flow](#toggle-chat-state-flow)
5. [Profile Switch Flow](#profile-switch-flow)
6. [ASCII Diagrams](#ascii-diagrams)
7. [Complete Examples](#complete-examples)

---

## Overview

This document traces data flows through the Default Chat Enabled State feature. It shows how the three-tier state system processes requests.

### Key Data Structures

**Settings Object:**
```javascript
extension_settings['auto_recap'] = {
  default_chat_enabled: true,
  chats_enabled: { chatId1: true, chatId2: false },
  global_toggle_state: true,
  use_global_toggle_state: false
}
```

**Context Object:**
```javascript
context = {
  chatId: 'chat_123_xyz',
  chat: [ ... ]
}
```

---

## Chat Enabled Lookup Flow

### Basic Lookup Operation

```
User requests memory status
        |
        v
chat_enabled() called
        |
        ├─ getContext() gets chatId
        ├─ Check: use_global_toggle_state?
        ├─ YES: Return global_toggle_state
        ├─ NO: Check chats_enabled[chatId]
        ├─ Found: Return per-chat state
        └─ Not found: Return default_chat_enabled
```

### Example 1: New Chat Returns Default

**Input:**
```javascript
use_global_toggle_state: false
chats_enabled: { chat_old: true }
default_chat_enabled: true
context.chatId: 'chat_new'
```

**Processing:**
- global toggle? NO
- chats_enabled['chat_new']? undefined
- Return: default_chat_enabled = true

**Output:** true

### Example 2: Disabled Chat

**Input:**
```javascript
use_global_toggle_state: false
chats_enabled: { chat_123: false }
default_chat_enabled: true
context.chatId: 'chat_123'
```

**Processing:**
- global toggle? NO
- chats_enabled['chat_123']? false
- Return: false

**Output:** false

### Example 3: Global Toggle

**Input:**
```javascript
use_global_toggle_state: true
global_toggle_state: false
chats_enabled: { chat_123: true }
default_chat_enabled: true
context.chatId: 'chat_123'
```

**Processing:**
- global toggle? YES
- Return global_toggle_state immediately

**Output:** false (ignores per-chat and default)

---

## New Chat Initialization Flow

### When New Chat Loads

```
User opens new chat
        |
        v
CHAT_CHANGED event
        |
        v
handleChatChanged()
        |
        ├─ auto_load_profile()
        ├─ refresh_memory()
        │  └─ chat_enabled()
        │     ├─ Check global toggle
        │     ├─ Check chats_enabled[chatId]
        │     │  (NOT FOUND for new chat)
        │     └─ Return default_chat_enabled
        |
        └─ Chat initialized with default
```

### State After Load

**Existing Chat (Previously Toggled):**
```javascript
chats_enabled['chat_1'] = false
chat_enabled() → false
```

**New Chat (Never Toggled):**
```javascript
chats_enabled['chat_2'] = undefined
chat_enabled() → default_chat_enabled (true)
```

---

## Toggle Chat State Flow

### User Clicks Toggle

```
User clicks toggle button
        |
        v
toggle_chat_enabled()
        |
        ├─ current = chat_enabled()
        ├─ newValue = !current
        ├─ Check: use_global_toggle_state?
        ├─ YES: Update global_toggle_state
        ├─ NO: Add explicit entry
        │  ├─ enabled[chatId] = newValue
        │  └─ set_settings('chats_enabled', enabled)
        |
        └─ saveSettingsDebounced()
```

### Before Toggle

```javascript
chats_enabled: {}
default_chat_enabled: true
chat_enabled() → true
```

### After Toggle

```javascript
chats_enabled: { chatId: false }
default_chat_enabled: true
chat_enabled() → false
```

**Key:** Once toggled, never uses default again.

---

## Profile Switch Flow

### User Switches Profile

```
User selects new profile
        |
        v
load_profile(profileName)
        |
        ├─ Copy new profile's settings
        ├─ Update default_chat_enabled
        ├─ refresh_settings()
        │  └─ Update UI
        |
        └─ Next calls use new default
```

### Before Switch (Profile A)

```javascript
profile: 'A'
default_chat_enabled: true
chats_enabled: { chat_123: false }
chat_123: chat_enabled() → false
new_chat: chat_enabled() → true
```

### After Switch (Profile B)

```javascript
profile: 'B'
default_chat_enabled: false
chats_enabled: { chat_123: false }
chat_123: chat_enabled() → false
new_chat: chat_enabled() → false
```

**Result:** Explicit states persist, new chats use new default

---

## Fallback Recovery Flow

### Corrupted Dictionary

```
chats_enabled = null
        |
        v
chat_enabled()
        |
        ├─ get_settings('chats_enabled') → null
        ├─ ?.[chatId] → undefined (safe)
        ├─ ?? get_settings('default_chat_enabled')
        |
        └─ Return true (recovery)
```

### Missing Setting

```
default_chat_enabled missing
        |
        v
get_settings('default_chat_enabled')
        |
        ├─ extension_settings? → undefined
        ├─ ?? default_settings['default_chat_enabled']
        |
        └─ Return true (factory default)
```

---

## ASCII Diagrams

### Three-Tier Decision Diagram

```
              chat_enabled()
                    |
                    v
           use_global_toggle?
             /              \
           YES               NO
            |                |
         return          check per-chat
      global_toggle         |
                            v
                   chatId in chats_enabled?
                     /               \
                   YES               NO
                    |                |
          return per-chat        return default
```

### State Transition

```
[New Chat - No State]
        |
        v
chat_enabled() → default_chat_enabled
        |
[User Toggles Memory]
        |
        v
[Explicit State Created]
        |
        v
chat_enabled() → chats_enabled[chatId]
        |
[Default Changes]
        |
        v
[This Chat Unaffected]
```

---

## Complete Examples

### Example 1: New Chat with Default Enabled

**Scenario:**
- default_chat_enabled = true
- New chat, no explicit state

**Trace:**
```
1. CHAT_CHANGED event
   chat_enabled() checks:
   - global toggle? false
   - chats_enabled['new']? undefined
   → return true (default)
   Result: Memory ENABLED

2. MESSAGE_SENT
   if (!chat_enabled())? false
   → Generate recap
   Result: Recap CREATED

3. Visuals updated
   if (!chat_enabled())? false
   → Show indicators
   Result: Indicators SHOWN
```

**Final:**
- Memory enabled via default
- Recap generated
- Indicators shown

### Example 2: Chat Toggled to Disabled

**Starting:**
```javascript
default_chat_enabled: true
chats_enabled: {}
chat_enabled() → true
```

**Toggle Called:**
```
1. current = chat_enabled() → true
2. newValue = !true → false
3. enabled[chatId] = false
4. set_settings('chats_enabled', { chatId: false })
```

**After Toggle:**
```javascript
default_chat_enabled: true
chats_enabled: { chatId: false }
chat_enabled() → false
```

**Later: Default Changes to False:**
```javascript
default_chat_enabled: false
chats_enabled: { chatId: false }
chat_enabled() → false
(Unaffected, uses explicit)
```

### Example 3: Profile Switch

**Profile A:**
```javascript
default_chat_enabled: true
chats_enabled: { chat_1: false }
```

**Profile B:**
```javascript
default_chat_enabled: false
chats_enabled: { chat_1: false }
```

**Switch A → B:**
```
1. load_profile('B')
2. default_chat_enabled updated to false
3. chats_enabled persists

In chat_1:
- chat_enabled() → false (explicit, unaffected)

In new_chat_2:
- chat_enabled() → false (new default from Profile B)
```

**Result:** New chats use Profile B default


---

## Detailed Request Tracing

### Trace 1: User Sends Message in New Chat

**Initial Setup:**
```javascript
{
  profile: 'Default',
  default_chat_enabled: true,
  chats_enabled: {},
  use_global_toggle_state: false,
  context.chatId: 'chat_brand_new'
}
```

**Step-by-Step Execution:**

```
1. User types message and presses Enter
   ↓
2. ST fires MESSAGE_SENT event
   ↓
3. eventHandlers.js line 128: handleMessageSent(message)
   ↓
4. Line 130: if (!chat_enabled()) {return;}
   ↓
5. chat_enabled() function
   ├─ const context = getContext()
   │  └─ context.chatId = 'chat_brand_new'
   ├─ get_settings('use_global_toggle_state')
   │  └─ Returns: false
   ├─ use_global_toggle_state? NO → Continue
   ├─ get_settings('chats_enabled')
   │  └─ Returns: {}
   ├─ ?.[context.chatId]
   │  └─ Returns: undefined
   ├─ ?? get_settings('default_chat_enabled')
   │  └─ Returns: true
   └─ Return: true
   ↓
6. if (!true) {return;} → Continue (not disabled)
   ↓
7. Generate recap (recap_text() called)
   ↓
8. set_data(message, 'memory', recapText)
   ↓
9. update_all_message_visuals()
   ├─ messageVisuals.js line 54
   ├─ if (!chat_enabled()) → false
   └─ Show recap indicators
   ↓
10. refreshMemory()
    ↓
11. Recap saved and shown to user
```

**Final State:**
```javascript
{
  chats_enabled: {},  // Still empty, no explicit toggle
  message: {
    memory: 'The recap text...',
    include: 'Recap of message(s)'
  },
  visuals: 'Recap badge shown below message'
}
```

**Key Observation:** No explicit entry created in chats_enabled; chat continues using default.

### Trace 2: User Toggles Memory Off

**Starting State (from previous example):**
```javascript
{
  default_chat_enabled: true,
  chats_enabled: {},
  context.chatId: 'chat_brand_new'
}
```

**Execution:**

```
1. User clicks "Toggle Memory" button in UI
   ↓
2. bind_function triggers toggleMemoryButton click
   ↓
3. settingsUI.js line 77: toggle_chat_enabled()
   ↓
4. settingsManager.js line 214: toggle_chat_enabled(value=null)
   ├─ const current = chat_enabled()
   │  ├─ use_global_toggle_state? false
   │  ├─ chats_enabled['chat_brand_new']? undefined
   │  └─ Return default_chat_enabled: true
   │     current = true
   │
   ├─ newValue = !current = !true = false
   │
   ├─ newValue === current? false === true? NO → Continue
   │
   ├─ get_settings('use_global_toggle_state')? false
   │  └─ NOT global toggle mode
   │
   ├─ const enabled = get_settings('chats_enabled')
   │  └─ Returns: {}
   │
   ├─ const context = getContext()
   │  └─ chatId: 'chat_brand_new'
   │
   ├─ enabled[context.chatId] = newValue
   │  └─ enabled['chat_brand_new'] = false
   │     Result: { chat_brand_new: false }
   │
   ├─ set_settings('chats_enabled', enabled)
   │  ├─ extension_settings['auto_recap']['chats_enabled'] = {...}
   │  └─ saveSettingsDebounced() queued
   │
   ├─ UI toastr: "Memory is now disabled for this chat"
   │
   ├─ refresh_memory()
   │
   ├─ update_all_message_visuals()
   │
   └─ refresh_settings()
      ↓
5. localStorage updated after 500ms
```

**Final State:**
```javascript
{
  default_chat_enabled: true,
  chats_enabled: { chat_brand_new: false },
  context.chatId: 'chat_brand_new'
}
```

**Verification:**
```javascript
chat_enabled()
├─ use_global_toggle_state? false
├─ chats_enabled['chat_brand_new']? false
└─ Return: false
```

### Trace 3: Change Global Default, Then Check Both Chats

**Before Change:**
```javascript
{
  profile: 'Default',
  default_chat_enabled: true,
  chats_enabled: { chat_brand_new: false },
  chat_old: (explicitly enabled elsewhere)
}
```

**User Changes Default Setting:**
```
1. User unchecks "Default enabled for new chats" checkbox
   ↓
2. jQuery change event
   ↓
3. bind_setting callback
   ↓
4. set_settings('default_chat_enabled', false)
   ├─ extension_settings['auto_recap']['default_chat_enabled'] = false
   └─ saveSettingsDebounced()
   ↓
5. localStorage updated
```

**After Change:**
```javascript
{
  default_chat_enabled: false,
  chats_enabled: { chat_brand_new: false }
}
```

**Chat States After Change:**

In chat_brand_new:
```javascript
chat_enabled()
├─ use_global_toggle_state? false
├─ chats_enabled['chat_brand_new']? false
└─ Return: false (UNCHANGED)
// This chat was explicitly disabled, not affected
```

In chat_old:
```javascript
chat_enabled()
├─ use_global_toggle_state? false
├─ chats_enabled['chat_old']? (assume undefined)
└─ Return: default_chat_enabled: false
// This chat uses new default now!
```

In new_chat_z (brand new):
```javascript
chat_enabled()
├─ use_global_toggle_state? false
├─ chats_enabled['new_chat_z']? undefined
└─ Return: default_chat_enabled: false
// New chats now default to false
```

---

## Comparison: Before vs After Operations

### Default Value Change Effect

| Scenario | Before Default Change | After Default Change | Why |
|----------|----------------------|----------------------|-----|
| chat_A (explicit: false) | false | false | Uses explicit, not default |
| chat_B (no explicit) | true | false | Uses new default |
| chat_C (new) | true | false | Uses new default |

### Global Toggle Effect

| Scenario | Global Off | Global On |
|----------|-----------|-----------|
| chat_A (explicit: false) | false | global_toggle_state |
| chat_B (no explicit) | default | global_toggle_state |
| New Chat | default | global_toggle_state |

---

## State Mutation Points

**Where default_chat_enabled Changes:**
1. UI checkbox toggle (settingsUI.js:90)
2. Profile load (settingsManager.js - load_profile)
3. hard_reset_settings() (sets to true)
4. soft_reset_settings() (ensures exists)
5. reset_settings() (resets to true)

**Where chats_enabled Changes:**
1. toggle_chat_enabled() - adds/updates entry (settingsManager.js:214)
2. Never removed by extension (manual deletion only)
3. Persists across profile switches

**Side Effects:**
- Any change triggers saveSettingsDebounced()
- Any change should trigger refresh_settings()
- Any change should trigger refresh_memory()

---

## Edge Cases and Recovery

### Edge Case 1: Profile Corruption

**State:**
```javascript
extension_settings['auto_recap']['profiles']['BadProfile'] = null
```

**Recovery:**
```javascript
soft_reset_settings()
├─ Find profiles['BadProfile'] = null
├─ Merge with defaults
└─ profiles['BadProfile'] = {...defaults...}
```

### Edge Case 2: Chat ID Reuse

**Scenario:**
```
User deletes chat_123
Later creates new chat_123
chats_enabled['chat_123'] = false (old value)
```

**Effect:**
```javascript
chat_enabled()
├─ chats_enabled['chat_123'] = false
└─ Return: false
// New chat uses old chat's state!
```

**Mitigation:** handleChatDeleted() should clean up entries.

### Edge Case 3: Context Unavailable

**State:**
```javascript
context = null
context.chatId → TypeError
```

**Protection:**
```javascript
const context = getContext()
context?.chatId → undefined (safe)
chats_enabled?.[undefined] → undefined
?? default_chat_enabled → true
// Graceful fallback
```


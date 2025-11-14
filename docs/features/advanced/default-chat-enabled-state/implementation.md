# Default Chat Enabled State - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Settings Storage](#settings-storage)
4. [Fallback Mechanism](#fallback-mechanism)
5. [Integration with chat_enabled()](#integration)
6. [UI Integration](#ui-integration)
7. [State Management](#state-management)
8. [Initialization](#initialization)
9. [Error Handling](#error-handling)
10. [Testing](#testing)

---

## Overview

The **Default Chat Enabled State** feature allows users to configure whether memory recaps are enabled by default for newly created chats. When a chat is first encountered, if no explicit per-chat state exists, the extension defaults to the `default_chat_enabled` setting value.

### Purpose

1. Global default state for new chats
2. Fallback mechanism when no per-chat state exists
3. Eliminates configuration ambiguity
4. Works with Feature #4 (per-chat enable/disable)

### Key Files

- `defaultSettings.js` - Default definition (line 42)
- `settingsManager.js` - Core logic (lines 202-213)
- `settingsUI.js` - UI binding (line 90)
- `selectorsExtension.js` - DOM selector (line 57)

---

## Core Components

### chat_enabled() Function

**File:** settingsManager.js, **Lines:** 202-213

```javascript
function chat_enabled() {
  const context = getContext();

  if (get_settings('use_global_toggle_state')) {
    return get_settings('global_toggle_state');
  }

  return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled');
}
```

**Purpose:** Primary interface for checking if memory is enabled

**Return Type:** Boolean

**Logic:**
1. Get current chat context
2. Check if global toggle enabled
   - If YES: Return global_toggle_state
   - If NO: Continue
3. Look up chat in per-chat dictionary
   - If found: Return per-chat state
   - If not: Return default_chat_enabled

**Called By:**
- eventHandlers.js (lines 130, 143, 148, 169, 178, 197, 204)
- memoryCore.js (line 313)
- messageVisuals.js (line 54)
- profileUI.js (line 237)
- slashCommands.js (line 77)

### get_settings() Function

**File:** settingsManager.js, **Lines:** 165-168

Returns extension setting or default if not set.

**For default_chat_enabled:**
- First checks: `extension_settings['auto_recap']['default_chat_enabled']`
- Falls back to: `default_settings['default_chat_enabled']` (true)

### set_settings() Function

**File:** settingsManager.js, **Lines:** 160-164

Updates setting and queues debounced save to localStorage.

### toggle_chat_enabled() Function

**File:** settingsManager.js, **Lines:** 214-251

Toggles memory state for current chat. Creates explicit per-chat entry when toggling.

---

## Settings Storage

### Storage Hierarchy

```
localStorage
  extension_settings['auto_recap']
    default_chat_enabled (boolean)
    chats_enabled (object)
    global_toggle_state (boolean)
    use_global_toggle_state (boolean)
    profiles (object)
```

### Default Value Location

**File:** defaultSettings.js, **Line:** 42

```javascript
export const default_settings = {
  default_chat_enabled: true,
  use_global_toggle_state: false,
};
```

Type: Boolean
Value: true
Scope: Per-profile

### Profile-Specific Storage

Each profile stores its own default_chat_enabled value in profiles[profileName]['default_chat_enabled'].

---

## Fallback Mechanism

### Three-Tier State System

**Tier 1: Global Toggle (Highest)**
- Condition: use_global_toggle_state === true
- Value: global_toggle_state
- Effect: ALL chats same state

**Tier 2: Per-Chat (Medium)**
- Condition: Chat in chats_enabled
- Value: chats_enabled[chatId]
- Effect: This chat only

**Tier 3: Default (Lowest)**
- Condition: Chat not in chats_enabled
- Value: default_chat_enabled
- Effect: New chats

### Fallback Code

**Line 212 in settingsManager.js:**

```javascript
return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled');
```

- `get_settings('chats_enabled')` - Returns object or undefined
- `?.[context.chatId]` - Safe property access
- `??` - Nullish coalescing
- `get_settings('default_chat_enabled')` - Fallback value

### When Fallback Occurs

1. New chat first encountered
2. Chat not in chats_enabled dictionary
3. Settings corruption
4. Dictionary entry deleted

---

## Integration Points

### Event Guards (eventHandlers.js)

All message events check chat_enabled() before operating:

- Line 130 (MESSAGE_SENT): if (!chat_enabled()) {return;}
- Line 143 (MESSAGE_EDITED): if (!chat_enabled()) {return;}
- Line 148 (MESSAGE_SWIPED): if (!chat_enabled()) {return;}
- Line 169 (MESSAGE_DELETED): if (!chat_enabled()) {return;}

### Memory Core (memoryCore.js)

Line 313: if (!chat_enabled()) { /* remove injections */ }

### Visual Indicators (messageVisuals.js)

Line 54: if (!chat_enabled()) { /* hide indicators */ }

---

## UI Integration

### Settings Control

- Type: Checkbox
- Label: "Default enabled for new chats"
- Selector: [data-testid="misc-default-enabled"]
- Setting: default_chat_enabled
- Location: Settings → Miscellaneous

### Two-Way Binding

User toggles checkbox:
1. Change event fired
2. bind_setting callback
3. set_settings() called
4. localStorage updated

Page loads:
1. get_settings() reads value
2. Checkbox state set to match
3. User sees current setting

---

## State Management

### Migration to Explicit State

**Before Toggle:**
- chats_enabled = {}
- chat_enabled() returns default (true)

**After Toggle:**
- chats_enabled = {chatId: false}
- chat_enabled() returns explicit (false)

**Key:** Once explicit, ignores default changes.

### Profile Behavior

Each profile has independent default:
- Profile A: default_chat_enabled = true
- Profile B: default_chat_enabled = false

Switch profiles = change active default

---

## Initialization

### hard_reset_settings()

Lines 91-102

- Deletes all profiles
- Creates Default profile
- Sets default_chat_enabled: true

### soft_reset_settings()

Lines 103-123

- Preserves profiles
- Adds missing settings
- Ensures all required values exist

### reset_settings()

Lines 124-159

- Resets current profile only
- Sets default_chat_enabled: true
- Preserves other profiles

---

## Error Handling

### Missing Setting

`get_settings()` fallback returns default value (never undefined).

### Corrupted Dictionary

Safe optional chaining (?.) prevents crashes.

### Missing Context

Optional chaining on property access handles invalid context.

### Complete Corruption

soft_reset_settings() rebuilds missing settings on startup.

---

## Testing

### Test Case 1: Default Returns True
- use_global_toggle_state = false
- chats_enabled = {}
- Result: chat_enabled() === true

### Test Case 2: Per-Chat Overrides
- chats_enabled = {chat_123: false}
- Result: chat_enabled() === false

### Test Case 3: Global Overrides All
- use_global_toggle_state = true
- global_toggle_state = false
- Result: chat_enabled() === false

### Test Case 4: Fallback on Missing
- chats_enabled = {}
- context.chatId = 'new_chat'
- Result: chat_enabled() === true

### Integration Tests

- New chat uses default
- Toggle creates explicit entry
- Profile switch changes default
- Multiple chats have different states


---

## Advanced Integration Scenarios

### Scenario 1: Migration from Disabled Default to Enabled

**Initial State:**
```javascript
default_chat_enabled: false
chats_enabled: {
  chat_A: true,   // Explicit override (enabled)
  chat_B: false   // Uses default (disabled)
}
```

**User Changes Default to True:**
```javascript
// User toggles "Default enabled for new chats" checkbox
set_settings('default_chat_enabled', true)
// localStorage updated
```

**Effect Analysis:**
- Chat A: Still uses explicit true (unchanged)
- Chat B: Still uses default false (but default now true, not applied)
- New Chat C: Uses new default true

**Important:** Changing default does NOT affect existing chats with explicit state.

### Scenario 2: Global Toggle Override

**State:**
```javascript
use_global_toggle_state: true
global_toggle_state: false
default_chat_enabled: true
chats_enabled: {
  chat_1: true,
  chat_2: false
}
```

**Result:**
- All chats return false (from global_toggle_state)
- default_chat_enabled ignored
- Per-chat states ignored
- Only global_toggle_state matters

**Code Path:**
```javascript
function chat_enabled() {
  if (get_settings('use_global_toggle_state')) {
    return get_settings('global_toggle_state');  // Returns false
  }
  // ... rest never executes
}
```

### Scenario 3: Concurrent Profile Operations

**Operation Sequence:**
```
1. User in Profile A (default_chat_enabled: true)
2. Opens chat_new (no explicit state)
3. chat_enabled() → true (uses Profile A default)
4. User opens message editor for chat_new
5. User switches to Profile B (default_chat_enabled: false)
6. profile switch → refresh_settings()
7. User closes message editor
8. chat_enabled() called again for same chat
   → false (now uses Profile B default!)
```

**Implication:** A chat can change enabled state when profile switches, even without toggling.

---

## Performance Characteristics

### chat_enabled() Performance

**Time Complexity:** O(1)
- Single object lookup
- No loops or iterations
- Constant time fallback chain

**Memory:** Minimal
- Returns boolean (no allocation)
- Reuses context object

**Call Frequency:**
- Called once per event guard
- Typically 1-2 times per message operation
- Cached in local variable when used multiple times

**Optimization Note:** Avoid calling multiple times in tight loops. Cache result:
```javascript
const enabled = chat_enabled();
if (enabled) { /* ... */ }
if (enabled) { /* ... */ }
if (enabled) { /* ... */ }
```

Instead of:
```javascript
if (chat_enabled()) { /* ... */ }
if (chat_enabled()) { /* ... */ }
if (chat_enabled()) { /* ... */ }
```

---

## Backwards Compatibility

### Upgrade Path

**Old Installation (No Explicit Support):**
```javascript
// No default_chat_enabled setting
chats_enabled: undefined
```

**First Load with Upgrade:**
```
soft_reset_settings()
  ├─ Check for missing default_chat_enabled
  ├─ Not found in extension_settings
  ├─ Add from defaults: true
  └─ Merge into all profiles
```

**Result:** Always has sensible default

### Legacy Data Migration

**Very Old Settings (Pre-Feature):**
- chats_enabled might not exist at all
- Handling: `get_settings()` returns undefined → falls back to default_settings

**Pre-profile Chats:**
- Chat state may not be keyed correctly
- Handling: Different structure automatically uses fallback

---

## Common Implementation Mistakes to Avoid

### Mistake 1: Direct Property Access (Wrong)
```javascript
// WRONG - crashes if chats_enabled is null
const isEnabled = extension_settings['auto_recap']['chats_enabled'][context.chatId];
```

**Correct Approach:**
```javascript
// RIGHT - uses safe optional chaining
return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled');
```

### Mistake 2: Assuming Explicit State Exists (Wrong)
```javascript
// WRONG - assumes chat always in dictionary
if (chats_enabled[context.chatId]) { /* ... */ }
```

**Correct Approach:**
```javascript
// RIGHT - falls back to default if not found
const state = chats_enabled?.[context.chatId] ?? default_chat_enabled;
```

### Mistake 3: Forgetting Profile Scope (Wrong)
```javascript
// WRONG - assumes global default
const default = extension_settings['auto_recap']['default_chat_enabled'];
```

**Correct Approach:**
```javascript
// RIGHT - gets from current profile context
const default = get_settings('default_chat_enabled');
```

### Mistake 4: Not Persisting Changes (Wrong)
```javascript
// WRONG - memory only, not saved
extension_settings['auto_recap']['default_chat_enabled'] = false;
```

**Correct Approach:**
```javascript
// RIGHT - saves to localStorage
set_settings('default_chat_enabled', false);
```

---

## Related Settings and Dependencies

### use_global_toggle_state

- Type: Boolean
- Default: false
- Effect: Enables/disables Tier 1 override
- When true: default_chat_enabled is ignored

### global_toggle_state

- Type: Boolean
- Default: true
- Effect: Tier 1 value (all chats same state)
- Only used if use_global_toggle_state === true

### chats_enabled Dictionary

- Type: Object
- Keys: Chat IDs (strings)
- Values: Boolean enabled state
- Persistent across profiles
- Created on first toggle

### Profiles

- Type: Object
- Keys: Profile names
- Values: Profile settings object
- Each profile has its own default_chat_enabled
- Shared chats_enabled dictionary

---

## Debugging Guide

### Check Current State

```javascript
// In browser console:
console.log(window.AutoRecap.get_settings('default_chat_enabled'));
console.log(window.AutoRecap.get_settings('chats_enabled'));
console.log(window.AutoRecap.get_settings('use_global_toggle_state'));
console.log(window.AutoRecap.get_settings('global_toggle_state'));
```

### Trace Lookup

```javascript
function debug_chat_enabled() {
  const context = getContext();
  console.log('Chat ID:', context.chatId);
  
  const globalToggle = get_settings('use_global_toggle_state');
  console.log('Global toggle enabled:', globalToggle);
  
  if (globalToggle) {
    const globalState = get_settings('global_toggle_state');
    console.log('Global state:', globalState);
    return globalState;
  }
  
  const chatsEnabled = get_settings('chats_enabled');
  console.log('Chats enabled dict:', chatsEnabled);
  
  const perChatState = chatsEnabled?.[context.chatId];
  console.log('Per-chat state:', perChatState);
  
  if (perChatState !== undefined) {
    return perChatState;
  }
  
  const defaultState = get_settings('default_chat_enabled');
  console.log('Default state:', defaultState);
  return defaultState;
}
```

### Check localStorage

```javascript
// In browser console:
const autoRecap = localStorage.getItem('extension_settings');
const settings = JSON.parse(autoRecap);
console.log(settings.auto_recap.default_chat_enabled);
console.log(settings.auto_recap.chats_enabled);
```


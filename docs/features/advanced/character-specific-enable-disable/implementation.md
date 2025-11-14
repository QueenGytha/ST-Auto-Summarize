# Character-Specific Enable/Disable - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Settings Storage](#settings-storage)
4. [Initialization](#initialization)
5. [State Management](#state-management)
6. [UI Integration](#ui-integration)
7. [Message Filtering](#message-filtering)

## Overview

The Character-Specific Enable/Disable feature allows users to toggle recap generation per character in group chats. Messages from disabled characters are excluded from memory injection.

### Purpose

1. Granular control: Enable/disable per character independently
2. Group-only: Only available in group chats
3. Persistent: Settings survive chat switches and page reloads
4. Visual feedback: Buttons indicate current state
5. Memory filtering: Disabled character messages excluded from injection

### Key Files

- `settingsManager.js` - State management and toggles
- `buttonBindings.js` - UI buttons and visualization
- `memoryCore.js` - Message filtering logic
- `messageData.js` - Character identification
- `eventHandlers.js` - Event synchronization
- `styleConstants.js` - CSS classes

## Core Components

### character_enabled(character_key)

**File:** settingsManager.js:252-262

Returns `true` if character recap generation is ENABLED, `false` if DISABLED.

```javascript
const enabled = character_enabled("alice.png");
```

**Called By:**
- memoryCore.js:81 - Message filtering
- buttonBindings.js:74 - Button visualization

### toggle_character_enabled(character_key)

**File:** settingsManager.js:263-282

Toggles character state and saves to settings. Only works in group chats.

```javascript
toggle_character_enabled("alice.png");
```

**Called By:**
- buttonBindings.js:54 - User clicks button

### initialize_group_member_buttons()

**File:** buttonBindings.js:36-59

Creates brain icon button for each group member with click event delegation.

**Called By:**
- eventHandlers.js:275 - During initialization

### set_character_enabled_button_states()

**File:** buttonBindings.js:60-81

Updates visual state of all character buttons (adds/removes highlight class).

**Called By:**
- Line 55 - After toggle
- eventHandlers.js:406-407 - On group events
- profileUI.js:243 - On settings refresh

### check_message_exclusion(message)

**File:** memoryCore.js:42-92

Determines if message should be included in memory. Character check at lines 79-83:

```javascript
const char_key = get_character_key(message);
if (!character_enabled(char_key)) {
  return false;
}
```

### get_character_key(message)

**File:** messageData.js:117-120

Returns character's unique identifier: `message.original_avatar || ''`

## Settings Storage

### Data Structure

**Path:** `extension_settings.auto_recap_memory.disabled_group_characters`

```javascript
{
  "group_id_1": ["char_key_1", "char_key_2"],
  "group_id_2": ["char_key_3"]
}
```

**Rules:**
- Keyed by group chat ID
- Values are arrays of disabled character keys
- Absence = all characters enabled
- Empty array = all characters enabled
- Presence in array = character disabled

**Initialization (settingsManager.js:24-34):**
```javascript
const global_settings = {
  disabled_group_characters: {}
};
```

## Initialization

### Startup Sequence

1. eventHandlers.initializeExtension() - line 234
2. initialize_settings() - line 260
3. initialize_group_member_buttons() - line 275
4. refresh_settings() - line 280
5. Event listeners - lines 406-407

### Events

```javascript
eventSource.on('groupSelected', set_character_enabled_button_states);
eventSource.on(event_types.GROUP_UPDATED, set_character_enabled_button_states);
```

## State Management

### Enable Character
```
Character disabled
  ↓ user clicks
toggle_character_enabled(char_key)
  ↓ remove from array
set_settings() saves
  ↓ debounced
refresh_memory() re-evaluates
  ↓ includes messages
set_character_enabled_button_states() updates UI
  ↓
Character enabled (highlighted)
```

### Disable Character
```
Character enabled
  ↓ user clicks
toggle_character_enabled(char_key)
  ↓ add to array
set_settings() saves
  ↓ debounced
refresh_memory() re-evaluates
  ↓ excludes messages
set_character_enabled_button_states() updates UI
  ↓
Character disabled (dimmed)
```

## UI Integration

### Button Classes

**styleConstants.js:12-13:**
```javascript
group_member_enable_button: 'auto_recap_memory_group_member_enable'
group_member_enable_button_highlight: 'auto_recap_memory_group_member_enabled'
```

**States:**
- Enabled: Has highlight class (bright)
- Disabled: No highlight class (dimmed)

## Message Filtering

### Exclusion Order

1. Auto-recap system message? → exclude
2. Marked excluded? → exclude
3. User message excluded? → exclude
4. Thought message? → exclude
5. System message excluded? → exclude
6. Narrator message excluded? → exclude
7. **Character disabled?** → exclude ← THIS FEATURE
8. Too short? → exclude
9. Otherwise → include

### Example

**Setup:**
- Group with Alice (disabled), Bob (enabled)
- disabled_group_characters[group_id] = ["alice.png"]

**Result:**
- Alice's messages: EXCLUDED (character disabled)
- Bob's messages: INCLUDED (character enabled)

---

**Status:** Complete - Core components and integration traced.

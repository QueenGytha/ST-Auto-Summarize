# Group Member Enable Buttons - Implementation

## Overview

The Group Member Enable Buttons feature (Feature #169) provides UI buttons in SillyTavern's group chat member list to toggle recap generation for individual characters. It is the frontend UI layer for Feature #168 (Character-Specific Enable/Disable).

**What it does:**
- Creates brain icon buttons next to each group member
- Clicking toggles character enabled/disabled state
- Enabled (bright): messages included in recaps
- Disabled (dimmed): messages excluded from recaps

## Core Components

### 1. Button Initialization (`initialize_group_member_buttons()`)
- File: buttonBindings.js lines 36-59
- Creates button div with brain icon in template
- Registers document-level click delegation listener

### 2. Button State Update (`set_character_enabled_button_states()`)
- File: buttonBindings.js lines 60-81
- Updates visual state of all buttons to match backend state
- Calls `character_enabled()` for each character to determine appearance

### 3. Click Handler (inline, lines 44-56)
- Extracts character key from clicked button
- Calls `toggle_character_enabled(char_key)` to update backend
- Calls `set_character_enabled_button_states()` to refresh UI

## Key Mechanisms

### Button Lifecycle
1. Extension initializes - buttonBindings.js imported
2. initialize_group_member_buttons() executes
3. Button added to template
4. SillyTavern clones template for each group member
5. Buttons appear in member list
6. Event delegation listener handles clicks
7. On page reload, cycle repeats

### State Visualization
- Backend state: `disabled_group_characters[group_id]` contains disabled character keys
- Check function: `character_enabled(char_key)` returns true if not in disabled list
- Visual mapping: `character_enabled()` true → add highlight class (bright)
- CSS rendering: highlight class produces cyan glow effect

### Click Event Flow
1. User clicks button
2. Extract character key from DOM (data-id attribute)
3. Call `toggle_character_enabled(char_key)`:
   - Modify disabled_group_characters
   - Call set_settings() to update
   - Call saveSettingsDebounced() to persist
   - Call refresh_memory() to update injection
4. Call `set_character_enabled_button_states()`:
   - For each button, get character key
   - Call `character_enabled(key)`
   - Add/remove highlight class
5. CSS transition (0.2s) smoothly changes button appearance

### State Persistence
- Changes saved via `saveSettingsDebounced()` (1 second delay)
- Written to browser localStorage
- On reload, restored from localStorage
- Works across different group chats

### Group Chat Detection
- Single chat: buttons always enabled (can't toggle)
- Creating group: buttons hidden (openGroupId undefined)
- Existing group: buttons shown and toggleable

## Data Structures

### Button DOM
```html
<div class="right_menu_button fa-solid fa-lg fa-brain auto_recap_memory_group_member_enable"
     title="Toggle recap generation for memory">
</div>
```

### Settings Storage
```javascript
extension_settings.auto_recap_memory.disabled_group_characters = {
  "group_1": ["alice.png"],           // Alice disabled
  "group_2": ["alice.png", "bob.png"] // Alice & Bob disabled
}
```

## Error Handling

1. **Missing character key** - Error logged, execution continues
2. **Missing container** - No error, buttons not updated
3. **Settings save failure** - UI updates but state lost on reload
4. **Memory refresh exception** - Button updates but memory delayed
5. **Undefined group ID** - Guard clause prevents state change

## Integration Points

1. **Backend (settingsManager.js)**
   - `character_enabled(char_key)` - Check enabled state
   - `toggle_character_enabled(char_key)` - Toggle state

2. **Events (eventHandlers.js)**
   - 'groupSelected' - Update buttons when switching groups
   - GROUP_UPDATED - Update buttons when members change

3. **Settings (profileUI.js)**
   - `refresh_settings()` calls set_character_enabled_button_states()

4. **Memory (memoryCore.js)**
   - Message filtering uses `character_enabled()`
   - `toggle_character_enabled()` calls `refresh_memory()`

## Testing

### Test 1: Button Visibility
- Enter group chat
- Verify brain icon for each member
- Buttons positioned left of member icon

### Test 2: Button Click
- Click member button
- Verify immediate toggle (dim/bright)
- Verify smooth transition (0.2s)
- Check settings: `get_settings('disabled_group_characters')[selected_group]`

### Test 3: State Persistence
- Disable members
- Reload page (F5)
- Verify state persists

### Test 4: New Group
- Create new group
- Before save: buttons hidden
- After save: buttons visible and bright

### Test 5: Memory Effect
- Disable character
- Send message
- Verify disabled character excluded from memory
- Check: `get_data(message, 'include')`

## Summary

Feature #169 provides the UI for Feature #168's character enable/disable system. Buttons create a reactive UI that reflects backend state, persists across reloads, and integrates with memory injection filtering.

# Group Member Enable Buttons - Data Flow

## Overview

This document traces complete data flow for button feature operations from user action through backend state changes to visual feedback and persistence.

## Operation Flows

### Flow 1: Button Initialization

Trigger: Extension initialization during ST load

Steps:
1. Extension module loads (buttonBindings.js imported)
2. initializeExtension() calls initialize_group_member_buttons()  
3. Get group member template from DOM
4. Create button div with brain icon and classes
5. Register document-level click event delegation listener
6. Insert button into template (prepend)
7. User enters group chat
8. SillyTavern clones template for each member (includes button)
9. Buttons appear in member list
10. CHAT_CHANGED event fires
11. set_character_enabled_button_states() called
12. For each button: character_enabled() checks state, adds/removes class

Result: Buttons visible with correct bright/dim state

### Flow 2: Click Button to Enable Character

1. User clicks button (currently dimmed/disabled)
2. Click bubbles to document
3. jQuery delegation catches event
4. Extract char_key from DOM: member_block.data('id')
5. Validate character key (log error if missing, continue)
6. Call toggle_character_enabled(char_key):
   - Get disabled_group_characters[group_id]
   - Check if char_key in list (YES = disabled)
   - Remove from list (enable)
   - set_settings() to update setting
   - saveSettingsDebounced() queues 1s save
   - refresh_memory() filters messages
7. In refresh_memory():
   - For each message in chat:
   - character_enabled(char_key) checks updated list
   - Enabled: set include = 'Recap of message(s)'
   - Disabled: set include = null
8. Call set_character_enabled_button_states():
   - For each button:
   - Call character_enabled(char_key)
   - If true: add highlight class (bright)
   - If false: remove class (dim)
9. CSS transition applies (0.2s ease-in-out):
   - Opacity: 0.4 to 1.0
   - Brightness: 0.5 to 1.0
   - Filter: add cyan drop-shadow
10. After 1 second:
    - saveSettingsDebounced() executes
    - Settings serialized to JSON
    - Written to browser localStorage
    - Persisted to disk

Final State: Character enabled, button bright, messages included, state saved

### Flow 3: Click Button to Disable Character

Same process as Flow 2 but in reverse direction:
- Add character_key to disabled list
- Button dims
- Messages excluded
- State persisted

### Flow 4: Group Chat State Detection

When user switches chat:
1. CHAT_CHANGED event fires
2. selected_group may be null (single) or group_id (group)
3. openGroupId may be undefined (creating) or defined (exists)
4. set_character_enabled_button_states() checks:
   - If openGroupId undefined: hide all buttons, return
   - If selected_group null: buttons always enabled (no toggle)
   - Otherwise: update buttons for current group state

### Flow 5: New Group Creation

1. User creates group, adds members
2. openGroupId = undefined (not yet saved)
3. set_character_enabled_button_states() called
4. Check: openGroupId undefined? YES
5. Hide all buttons (no point before save)
6. User clicks Save
7. Group saved to server
8. openGroupId = group_id (now defined)
9. GROUP_UPDATED event fires
10. set_character_enabled_button_states() called
11. For each new member:
    - character_enabled(char_key) returns true (no disabled list yet)
    - Add highlight class (all bright)
12. All buttons shown and bright

Result: New group with all characters enabled

## Data Flow Diagram

User Action
  |
  v-- Extract Data from DOM
  |
  v-- Backend Update (toggle_character_enabled)
  |   - Modify disabled_group_characters setting
  |   - Queue persistence (saveSettingsDebounced)
  |
  v-- Memory Update (refresh_memory)
  |   - For each message:
  |   - Call character_enabled(char_key)
  |   - Set include flag
  |
  v-- UI Update (set_character_enabled_button_states)
  |   - For each button:
  |   - Call character_enabled(char_key)
  |   - Add/remove highlight class
  |
  v-- CSS Transition (0.2s)
  |   - Smooth opacity and brightness change
  |
  v-- Visual Feedback Complete
  |
  v-- [1 second later] Persistence
      - saveSettingsDebounced() executes
      - Write to localStorage
      - Settings persisted

## Complete Example: Enable Alice

Initial State:


User clicks Alice button:


Final State:


## Summary

Data flow shows how user click triggers cascading updates:
- Backend state modified and queued for persistence
- Memory inclusion flags updated via character_enabled()
- All button states refreshed via character_enabled()
- CSS provides smooth visual transition
- After 1s delay, settings persisted to storage
- On page reload, state restored from storage

This creates a fully reactive system where visual state always reflects backend state.

# Character-Specific Enable/Disable - Data Flow

## Complete Operation Flows

### Enable Character Flow

USER ACTION: Click button to enable Alice in Group 1

Step 1: Event triggered
  Location: Group member list, Alice button
  Event type: click
  Target: div.auto_recap_memory_group_member_enable

Step 2: Extract character key
  File: buttonBindings.js:47
  Data: member_block.data('id') = "alice.png"

Step 3: Toggle state
  Function: toggle_character_enabled("alice.png")
  File: settingsManager.js:263-282
  Get current disabled list: ["alice.png", "bob.png"]
  Alice in list? YES, Remove her
  New list: ["bob.png"]
  Save to: extension_settings.auto_recap_memory.disabled_group_characters

Step 4: Refresh memory
  Function: refresh_memory()
  Update each message's inclusion flag
  Alice's messages: now INCLUDED (not in disabled list)

Step 5: Update UI
  Function: set_character_enabled_button_states()
  Alice's button: add highlight class
  Visual: button appears active/bright

Final Result:
  disabled_group_characters[group_1] = ["bob.png"]
  character_enabled("alice.png") = true
  Alice messages included in memory
  Alice button highlighted

### Disable Character Flow

USER ACTION: Click button to disable Bob in Group 1

Step 1: Event triggered
  Click on Bob's button

Step 2: Extract key
  char_key = "bob.png"

Step 3: Toggle state
  Current disabled list: []
  Bob in list? NO, Add him
  New list: ["bob.png"]
  Save to settings

Step 4: Refresh memory
  Bob's messages: now EXCLUDED

Step 5: Update UI
  Remove highlight class from Bob's button
  Visual: button appears inactive/dimmed

Final Result:
  disabled_group_characters[group_1] = ["bob.png"]
  character_enabled("bob.png") = false
  Bob messages excluded
  Bob button dimmed

## Message Filtering Flow

SCENARIO: Update message inclusion flags

Input: 3 messages from Alice (disabled), Bob (enabled), Charlie (enabled)

For each message:

Message 1 - Alice:
  1. get_character_key(message) = "alice.png"
  2. character_enabled("alice.png")
     Check: "alice.png" in disabled_group_characters[group_1]?
     YES, Alice is disabled
     Return: false
  3. !character_enabled() returns true
  4. check_message_exclusion() returns false (EXCLUDE)
  5. set_data(message, 'include', null)

Message 2 - Bob:
  1. get_character_key(message) = "bob.png"
  2. character_enabled("bob.png")
     Check: "bob.png" in disabled list?
     NO, Bob is enabled
     Return: true
  3. !character_enabled() returns false (continue)
  4. check_message_exclusion() returns true (INCLUDE)
  5. set_data(message, 'include', 'Recap of message(s)')

Message 3 - Charlie:
  Similar to Bob
  Result: INCLUDED

Final Inclusion State:
  Alice message: include = null (EXCLUDED)
  Bob message: include = 'Recap of message(s)' (INCLUDED)
  Charlie message: include = 'Recap of message(s)' (INCLUDED)

Memory Injection Effect:
  Only Bob and Charlie messages appear in LLM prompts
  Alice messages completely filtered out

## Group Chat Initialization

When user switches to group chat:

Step 1: groupSelected event fired

Step 2: Event handler called
  Function: set_character_enabled_button_states()
  File: eventHandlers.js:406

Step 3: For each member button
  Get character key from DOM
  Call character_enabled(char_key)
  Check disabled_group_characters[this_group_id]
  Add/remove highlight class

Step 4: Buttons display current state
  Disabled characters: dimmed buttons
  Enabled characters: highlighted buttons

## Settings Persistence

When character state changes:

Step 1: toggle_character_enabled() modifies array

Step 2: set_settings() called
  Stores in memory

Step 3: saveSettingsDebounced() saves
  Writes to: extension_settings.auto_recap_memory
  Persists to browser storage

Step 4: On page reload
  Settings restored from storage
  Button states match saved state
  Message filtering uses saved state

## Example Data Transformations

### Example 1: Enable Alice

Initial State:
  extension_settings.auto_recap_memory.disabled_group_characters = {
    "group_1": ["alice.png", "bob.png"]
  }

User Action: Click Alice's button

Processing:
  toggle_character_enabled("alice.png")
    group_id = "group_1"
    disabled_characters = ["alice.png", "bob.png"]
    disabled = true (alice in list)
    
    if (disabled) {
      disabled_characters.splice(indexOf("alice.png"), 1)
    }
    Result: ["bob.png"]
    
    set_settings('disabled_group_characters', {
      "group_1": ["bob.png"]
    })

Final State:
  extension_settings.auto_recap_memory.disabled_group_characters = {
    "group_1": ["bob.png"]
  }

  character_enabled("alice.png"):
    disabled_group_characters[group_1] = ["bob.png"]
    "alice.png" in ["bob.png"]? NO
    Returns: true (ENABLED)

### Example 2: Message Filtering

Initial Setup:
  Group members: Alice (disabled), Bob (enabled), Charlie (enabled)
  disabled_group_characters[group_1] = ["alice.png"]

  Messages in chat:
    [1] Alice: "Hello there!"
    [2] Bob: "Hi everyone"
    [3] Charlie: "Hey!"
    [4] Alice: "How are you?"
    [5] Bob: "Great!"

Processing During Memory Update:

  Message [1] - Alice:
    char_key = "alice.png"
    character_enabled("alice.png")
      "alice.png" in ["alice.png"]? YES
      Returns: false
    
    check_message_exclusion() returns false
    Result: EXCLUDED
    set_data: 'include' = null

  Message [2] - Bob:
    char_key = "bob.png"
    character_enabled("bob.png")
      "bob.png" in ["alice.png"]? NO
      Returns: true
    
    check_message_exclusion() returns true
    Result: INCLUDED
    set_data: 'include' = 'Recap of message(s)'

  Message [3] - Charlie:
    Similar to Bob
    Result: INCLUDED

  Message [4] - Alice:
    Similar to Message [1]
    Result: EXCLUDED

  Message [5] - Bob:
    Similar to Message [2]
    Result: INCLUDED

Memory Injection Summary:
  Messages to inject: [2] Bob, [3] Charlie, [5] Bob
  Messages to exclude: [1] Alice, [4] Alice

---

Status: Complete - All operation flows traced with data values and state changes.

# Message Data Persistence - Implementation Details

## Overview

Message Data Persistence provides the foundational pattern for storing extension-specific data on SillyTavern message objects. It ensures data is properly persisted to the chat backend, survives page reloads, and integrates seamlessly with SillyTavern's message lifecycle (swipes, edits, deletions).

The system provides two core functions:
- `get_data(message, key)` - Retrieve extension data from a message
- `set_data(message, key, value)` - Store extension data on a message

All recap-related data (memory text, inclusion status, scene recaps, etc.) is stored using this pattern.

## Module Location

**File**: `messageData.js`

**Exports**:
```javascript
export {
  set_data,
  get_data,
  get_memory,
  edit_memory,
  clear_memory,
  toggle_memory_value,
  get_previous_swipe_memory,
  get_character_key
};
```

## Core Implementation

### Data Storage Structure

Extension data is stored in the `message.extra` object under the extension's module name (`auto_recap_memory`):

```javascript
{
  "mes": "Message text...",
  "is_user": false,
  "extra": {
    "auto_recap_memory": {
      "memory": "The recap text...",
      "include": "Recap of message(s)",
      "exclude": false,
      "error": null,
      "reasoning": "...",
      "prefill": "...",
      "edited": false,
      "scene_break": true,
      "scene_break_visible": true,
      "scene_recap_memory": "Scene recap text...",
      // ... other extension data keys
    }
  },
  "swipe_info": [
    {
      "extra": {
        "auto_recap_memory": {
          // Swipe-specific data...
        }
      }
    }
  ]
}
```

**Key Design Principles**:
1. **Namespacing**: All data is stored under `message.extra[MODULE_NAME]` to avoid conflicts with other extensions
2. **Swipe Synchronization**: Data is automatically cloned to `message.swipe_info[swipe_index].extra[MODULE_NAME]` on write
3. **Chat Persistence**: Data is automatically saved to the chat backend via `saveChatDebounced()` after every write

### set_data() Function

**Purpose**: Store extension data on a message object and trigger chat save.

**Signature**:
```javascript
function set_data(message, key, value)
```

**Parameters**:
- `message` (Object) - SillyTavern message object
- `key` (string) - Data key to store
- `value` (any) - Value to store (can be any JSON-serializable type)

**Implementation**:
```javascript
function set_data(message, key, value) {
  // 1. Initialize message.extra if needed
  if (!message.extra) {
    message.extra = {};
  }

  // 2. Initialize extension namespace if needed
  if (!message.extra[MODULE_NAME]) {
    message.extra[MODULE_NAME] = {};
  }

  // 3. Store the data
  message.extra[MODULE_NAME][key] = value;

  // 4. Synchronize to current swipe (if swipe exists)
  const swipe_index = message.swipe_id;
  if (swipe_index && message.swipe_info?.[swipe_index]) {
    if (!message.swipe_info[swipe_index].extra) {
      message.swipe_info[swipe_index].extra = {};
    }
    // Deep clone to prevent reference sharing
    message.swipe_info[swipe_index].extra[MODULE_NAME] =
      structuredClone(message.extra[MODULE_NAME]);
  }

  // 5. Trigger chat save (debounced)
  const ctx = getContext();
  if (ctx?.chat && ctx?.chatId) {
    saveChatDebounced();
  }
}
```

**Behavior**:
1. **Automatic Initialization**: Creates `message.extra` and `message.extra[MODULE_NAME]` if they don't exist
2. **Swipe Synchronization**: When a swipe is active (`message.swipe_id` exists), clones ALL extension data to that swipe's `extra` object
3. **Deep Clone**: Uses `structuredClone()` to prevent reference sharing between main message and swipe data
4. **Conditional Save**: Only triggers save if a chat is currently loaded (`ctx.chat` and `ctx.chatId` exist)
5. **Debounced Save**: Uses `saveChatDebounced()` to batch multiple writes into a single save operation

**Usage Examples**:
```javascript
// Store recap text
set_data(message, 'memory', 'The character entered the room.');

// Store inclusion status
set_data(message, 'include', 'Recap of message(s)');

// Store scene break marker
set_data(message, 'scene_break', true);

// Store complex object
set_data(message, 'scene_recap_versions', [
  { version: 0, content: '...', timestamp: 1234567890 },
  { version: 1, content: '...', timestamp: 1234567900 }
]);

// Clear data by setting to null
set_data(message, 'error', null);
```

### get_data() Function

**Purpose**: Retrieve extension data from a message object.

**Signature**:
```javascript
function get_data(message, key)
```

**Parameters**:
- `message` (Object) - SillyTavern message object
- `key` (string) - Data key to retrieve

**Returns**:
- `any` - The stored value, or `undefined` if key doesn't exist

**Implementation**:
```javascript
function get_data(message, key) {
  return message?.extra?.[MODULE_NAME]?.[key];
}
```

**Behavior**:
1. **Safe Navigation**: Uses optional chaining (`?.`) to safely traverse nested properties
2. **Undefined on Missing**: Returns `undefined` if any part of the path doesn't exist
3. **No Side Effects**: Pure read operation with no modifications

**Usage Examples**:
```javascript
// Get recap text
const memory = get_data(message, 'memory');
// Returns: "The character entered the room." or undefined

// Get inclusion status
const include = get_data(message, 'include');
// Returns: "Recap of message(s)" or null or undefined

// Get scene break status
const isSceneBreak = get_data(message, 'scene_break');
// Returns: true, false, or undefined

// Check for existence with truthiness
if (get_data(message, 'memory')) {
  // Message has a recap
}

// Check for explicit null/undefined
if (get_data(message, 'error') === null) {
  // Error was explicitly cleared
}
```

### saveChatDebounced() Integration

**Purpose**: Debounced wrapper around SillyTavern's `saveChat()` to batch writes.

**Definition** (in `utils.js`):
```javascript
const saveChatDebounced = debounce(
  () => getContext().saveChat(),
  debounce_timeout.relaxed
);
```

**Behavior**:
- **Debounce Timer**: `debounce_timeout.relaxed` (typically 1000ms)
- **Batching**: Multiple rapid `set_data()` calls result in a single save operation
- **SillyTavern Integration**: Calls `getContext().saveChat()` which writes to backend

**Example Scenario**:
```javascript
// Multiple writes in quick succession
set_data(message, 'memory', 'Recap text...');
set_data(message, 'include', 'Recap of message(s)');
set_data(message, 'error', null);
set_data(message, 'reasoning', 'LLM reasoning...');

// Only triggers ONE save operation after debounce period
// (Instead of 4 separate save operations)
```

## Complete Data Key Inventory

### Regular Message Recap Data

#### memory
**Type**: `string | null`
**Purpose**: The recap text for a single message
**Set By**: `operationHandlers.js` after LLM generation
**Read By**: `memoryCore.js` for injection, `messageVisuals.js` for display

**Example**:
```javascript
set_data(message, 'memory', 'Alice entered the library and began searching for a book.');
```

#### include
**Type**: `string | null`
**Purpose**: Inclusion status for memory injection
**Values**:
- `"Recap of message(s)"` - Included as short-term memory
- `null` - Not included (excluded by filters or context limits)

**Set By**: `memoryCore.js` in `update_message_inclusion_flags()`
**Read By**: `memoryCore.js` for injection, `messageVisuals.js` for color-coding

**Example**:
```javascript
set_data(message, 'include', 'Recap of message(s)');
```

#### exclude
**Type**: `boolean`
**Purpose**: User manually forced this message to be excluded from injection
**Set By**: User via message button menu
**Read By**: `memoryCore.js` in `check_message_exclusion()`

**Example**:
```javascript
set_data(message, 'exclude', true);
```

#### error
**Type**: `string | null`
**Purpose**: Error message if recap generation failed
**Set By**: `operationHandlers.js` on LLM error
**Read By**: `messageVisuals.js` to display error below message

**Example**:
```javascript
set_data(message, 'error', 'LLM request timed out');
```

#### reasoning
**Type**: `string | null`
**Purpose**: LLM's chain-of-thought reasoning (if included in prompt)
**Set By**: `operationHandlers.js` if extracted from LLM response
**Read By**: `messageVisuals.js` to display in [Reasoning] tag

**Example**:
```javascript
set_data(message, 'reasoning', 'The message focuses on character emotion and location change.');
```

#### prefill
**Type**: `string | null`
**Purpose**: Prefill text used in LLM generation (if any)
**Set By**: `operationHandlers.js` during recap generation
**Read By**: `messageData.js` in `get_memory()` to prepend to memory

**Example**:
```javascript
set_data(message, 'prefill', 'In this scene: ');
```

#### edited
**Type**: `boolean`
**Purpose**: User manually edited the recap text
**Set By**: `messageData.js` in `edit_memory()`
**Read By**: Future features (validation bypass, UI indicators)

**Example**:
```javascript
set_data(message, 'edited', true);
```

### Scene Break Data

#### scene_break
**Type**: `boolean`
**Purpose**: Marks this message as the end of a scene
**Set By**: User via scene break button or auto-detection
**Read By**: `sceneBreak.js` for rendering, `sceneNavigator.js` for navigation

**Example**:
```javascript
set_data(message, 'scene_break', true);
```

#### scene_break_visible
**Type**: `boolean`
**Purpose**: Whether the scene break is currently visible in UI
**Set By**: User via toggle, `sceneBreak.js`
**Read By**: `sceneBreak.js` for rendering, auto-detection for range calculation

**Example**:
```javascript
set_data(message, 'scene_break_visible', false); // Hidden scene break
```

#### scene_break_name
**Type**: `string | null`
**Purpose**: User-assigned name for the scene
**Set By**: User via scene break UI
**Read By**: `sceneBreak.js` for display, `sceneNavigator.js` for navigation menu

**Example**:
```javascript
set_data(message, 'scene_break_name', 'Chapter 2: The Library');
```

#### scene_break_collapsed
**Type**: `boolean`
**Purpose**: Whether the scene break UI is collapsed
**Set By**: User via collapse toggle
**Read By**: `sceneBreak.js` for rendering state

**Example**:
```javascript
set_data(message, 'scene_break_collapsed', true);
```

### Scene Recap Data

#### scene_recap_memory
**Type**: `string | null`
**Purpose**: The recap text for the entire scene
**Set By**: `sceneBreak.js` after LLM generation
**Read By**: `runningSceneRecap.js` for combination, `memoryCore.js` for injection

**Example**:
```javascript
set_data(message, 'scene_recap_memory', 'Alice explored the library, discovering a hidden section...');
```

#### scene_recap_versions
**Type**: `Array<Object> | null`
**Purpose**: Version history of scene recaps
**Structure**:
```javascript
[
  {
    version: 0,
    timestamp: 1234567890000,
    content: "Scene recap text...",
    metadata: { /* generation settings */ }
  },
  // ... more versions
]
```

**Set By**: `sceneBreak.js` when generating new recap versions
**Read By**: `sceneBreak.js` for version selection UI

**Example**:
```javascript
set_data(message, 'scene_recap_versions', [
  {
    version: 0,
    timestamp: Date.now(),
    content: 'Original scene recap...',
    metadata: { prompt_version: 1 }
  }
]);
```

#### scene_recap_current_index
**Type**: `number | null`
**Purpose**: Index of currently active scene recap version
**Set By**: User via version selector, `sceneBreak.js`
**Read By**: `sceneBreak.js` to display correct version

**Example**:
```javascript
set_data(message, 'scene_recap_current_index', 2); // Using version 2
```

#### scene_recap_hash
**Type**: `string | null`
**Purpose**: Hash of scene recap content for change detection
**Set By**: `sceneBreak.js` after generation
**Read By**: `sceneBreak.js` to detect if recap changed

**Example**:
```javascript
set_data(message, 'scene_recap_hash', 'a3f5b9c2');
```

#### scene_recap_metadata
**Type**: `Object | null`
**Purpose**: Generation metadata (settings, timestamp, etc.)
**Set By**: `sceneBreak.js` during generation
**Read By**: Future features (regeneration with same settings)

**Example**:
```javascript
set_data(message, 'scene_recap_metadata', {
  generated_at: Date.now(),
  prompt_version: 'scene_recap_v2',
  connection_profile: 'scene-recap-profile'
});
```

#### scene_recap_include
**Type**: `boolean`
**Purpose**: Whether to include this scene recap in memory injection
**Set By**: User via toggle, `sceneBreak.js`
**Read By**: `memoryCore.js` for injection decisions

**Example**:
```javascript
set_data(message, 'scene_recap_include', false); // Exclude from injection
```

### Auto Scene Break Detection Data

#### auto_scene_break_checked
**Type**: `boolean`
**Purpose**: Marks that this message has been checked by auto-detection
**Set By**: `autoSceneBreakDetection.js` after checking
**Read By**: `autoSceneBreakDetection.js` to skip already-checked messages

**Behavior**:
- **Swipe Reset**: Lost when message is swiped/regenerated (by design)
- **Range Marking**: Entire ranges are marked after successful detection
- **Recheck on Hide**: Cleared when scene break is hidden

**Example**:
```javascript
set_data(message, 'auto_scene_break_checked', true);
```

### System Message Markers

#### is_auto_recap_system_memory
**Type**: `boolean`
**Purpose**: Marks system-generated messages (scene indicators, etc.)
**Set By**: System when creating internal messages
**Read By**: `memoryCore.js` to exclude from recap generation

**Example**:
```javascript
set_data(message, 'is_auto_recap_system_memory', true);
```

## Higher-Level Helper Functions

### get_memory()

**Purpose**: Get the complete memory text including optional prefill.

**Signature**:
```javascript
function get_memory(message)
```

**Returns**: `string` - Complete memory text (prefill + memory)

**Implementation**:
```javascript
function get_memory(message) {
  let memory = get_data(message, 'memory') ?? "";
  const prefill = get_data(message, 'prefill') ?? "";

  // Prepend prefill if setting enabled
  if (get_settings('show_prefill')) {
    memory = `${prefill}${memory}`;
  }
  return memory;
}
```

**Usage**:
```javascript
const fullMemory = get_memory(message);
// Returns: "In this scene: Alice entered the library."
//   (if prefill="In this scene: " and memory="Alice entered the library.")
```

### edit_memory()

**Purpose**: Manually edit a message's recap text and clear related metadata.

**Signature**:
```javascript
function edit_memory(message, text)
```

**Parameters**:
- `message` (Object) - Message to edit
- `text` (string) - New recap text

**Implementation**:
```javascript
function edit_memory(message, text) {
  const current_text = get_memory(message);
  if (text === current_text) { return; } // No change

  set_data(message, "memory", text);
  set_data(message, "error", null);      // Clear errors
  set_data(message, "reasoning", null);  // Clear reasoning
  set_data(message, "prefill", null);    // Clear prefill
  set_data(message, "edited", Boolean(text)); // Mark as edited

  // If deleting or adding to deleted memory, clear exclusion
  if (!text || !current_text) {
    set_data(message, "exclude", false);
  }
}
```

**Behavior**:
1. **Change Detection**: No-op if text hasn't changed
2. **Metadata Cleanup**: Clears error, reasoning, and prefill
3. **Edit Tracking**: Sets `edited` flag to true if text is non-empty
4. **Exclusion Reset**: Clears `exclude` flag when creating or deleting memory

**Usage**:
```javascript
edit_memory(message, 'Corrected recap text...');
// Sets memory, clears error/reasoning/prefill, marks edited=true
```

### clear_memory()

**Purpose**: Completely clear a message's recap data.

**Signature**:
```javascript
function clear_memory(message)
```

**Implementation**:
```javascript
function clear_memory(message) {
  set_data(message, "memory", null);
  set_data(message, "error", null);
  set_data(message, "reasoning", null);
  set_data(message, "prefill", null);
  set_data(message, "edited", false);
  set_data(message, "exclude", false);
}
```

**Usage**:
```javascript
clear_memory(message);
// Clears all recap-related data from message
```

### toggle_memory_value()

**Purpose**: Toggle a boolean value across multiple messages (for batch operations).

**Signature**:
```javascript
function toggle_memory_value(
  indexes,      // Array of message indexes
  value,        // null (toggle) or boolean (set)
  check_value,  // Function: (index) => boolean
  set_value     // Function: (index, value) => void
)
```

**Behavior**:
- **Toggle Mode** (`value === null`): Set to true if any are false, set all to false if all are true
- **Set Mode** (`value !== null`): Set all to the specified value

**Usage**:
```javascript
// Toggle exclusion for messages 5, 6, 7
toggle_memory_value(
  [5, 6, 7],
  null, // Toggle mode
  (idx) => get_data(chat[idx], 'exclude'),
  (idx, val) => set_data(chat[idx], 'exclude', val)
);
```

### get_previous_swipe_memory()

**Purpose**: Get recap data from a message's previous swipe.

**Signature**:
```javascript
function get_previous_swipe_memory(message, key)
```

**Returns**: Data from previous swipe, or `null` if no previous swipe exists

**Implementation**:
```javascript
function get_previous_swipe_memory(message, key) {
  if (!message.swipe_id) {
    return null;
  }
  return message?.swipe_info?.[message.swipe_id - 1]?.extra?.[MODULE_NAME]?.[key];
}
```

**Usage**:
```javascript
// Get memory from previous swipe
const prevMemory = get_previous_swipe_memory(message, 'memory');
// Returns: previous swipe's recap, or null
```

### get_character_key()

**Purpose**: Get unique identifier for the character who sent a message.

**Signature**:
```javascript
function get_character_key(message)
```

**Returns**: `string` - Character's avatar path (unique identifier), or empty string

**Implementation**:
```javascript
function get_character_key(message) {
  return message.original_avatar || '';
}
```

**Usage**:
```javascript
const charKey = get_character_key(message);
// Returns: "Alice.png" or "Bob.png" etc.
```

## Swipe Behavior

### Swipe Data Synchronization

When `set_data()` is called, it automatically synchronizes data to the current swipe:

```javascript
const swipe_index = message.swipe_id;
if (swipe_index && message.swipe_info?.[swipe_index]) {
  if (!message.swipe_info[swipe_index].extra) {
    message.swipe_info[swipe_index].extra = {};
  }
  message.swipe_info[swipe_index].extra[MODULE_NAME] =
    structuredClone(message.extra[MODULE_NAME]);
}
```

**Key Points**:
1. **Current Swipe Only**: Only the active swipe (`message.swipe_id`) is synchronized
2. **Deep Clone**: Uses `structuredClone()` to prevent reference sharing
3. **Complete Copy**: Copies ALL extension data, not just the changed key

### Swipe Switching Behavior

When user swipes to a different response:
1. SillyTavern changes `message.swipe_id` to the new swipe index
2. Extension data in `message.extra[MODULE_NAME]` is NOT automatically updated
3. Next `get_data()` still reads from `message.extra[MODULE_NAME]` (old data)
4. Next `set_data()` overwrites `message.extra[MODULE_NAME]` and syncs to new swipe

**Implication**: Each swipe can have independent recap data. When switching swipes, old recap data may briefly persist until new generation occurs.

### Accessing Swipe-Specific Data

To access data from a specific swipe (not just the current one):

```javascript
// Get data from swipe 2
const swipe2Memory = message.swipe_info?.[2]?.extra?.auto_recap_memory?.memory;

// Get data from previous swipe
const prevSwipeMemory = get_previous_swipe_memory(message, 'memory');

// Get data from all swipes
const allSwipeMemories = message.swipe_info?.map(swipe =>
  swipe?.extra?.auto_recap_memory?.memory
).filter(Boolean);
```

## Chat Persistence Flow

### Write Path

```
User Action (e.g., generate recap)
    ↓
set_data(message, 'memory', '...')
    ↓
message.extra[MODULE_NAME].memory = '...'
    ↓
Sync to message.swipe_info[swipe_id].extra[MODULE_NAME]
    ↓
saveChatDebounced() called
    ↓
[Debounce wait period: 1000ms]
    ↓
getContext().saveChat()
    ↓
SillyTavern serializes chat to JSON
    ↓
POST /api/chats/save
    ↓
Backend writes to jsonl file
```

### Read Path

```
User loads chat
    ↓
SillyTavern loads chat from backend
    ↓
GET /api/chats/load
    ↓
Backend reads jsonl file
    ↓
SillyTavern deserializes JSON to chat array
    ↓
getContext().chat populated with messages
    ↓
get_data(message, 'memory')
    ↓
Returns message.extra.auto_recap_memory.memory
```

## Performance Considerations

### Debouncing

**Problem**: Without debouncing, every `set_data()` would trigger a separate backend save operation, causing:
- High server load
- Poor UI responsiveness
- Race conditions with concurrent saves

**Solution**: `saveChatDebounced()` batches multiple writes:
```javascript
// These 4 writes trigger only ONE save after 1000ms
set_data(msg, 'memory', '...');
set_data(msg, 'include', '...');
set_data(msg, 'error', null);
set_data(msg, 'reasoning', '...');
```

**Tradeoff**: Data may not be saved immediately to backend. If user closes browser before debounce completes, recent writes may be lost.

### Swipe Cloning Overhead

**Problem**: `set_data()` clones ALL extension data to current swipe using `structuredClone()`.

**Cost**:
- For small data (single recap): negligible (~0.1ms)
- For large data (scene recap with versions): ~1-5ms per write

**Mitigation**: Debouncing reduces the number of clone operations by batching writes.

### Memory Usage

**Storage Structure**: Each message stores extension data at two locations:
1. `message.extra[MODULE_NAME]` - Main storage
2. `message.swipe_info[i].extra[MODULE_NAME]` - Per-swipe storage

**Worst Case**: Message with 10 swipes and large scene recap data:
```
Main data: ~5KB
Swipe data: 10 × ~5KB = 50KB
Total: ~55KB per message
```

**Typical Case**: Message with 2 swipes and small recap:
```
Main data: ~500B
Swipe data: 2 × ~500B = 1KB
Total: ~1.5KB per message
```

## Error Handling

### Missing Message Object

```javascript
// get_data() safely handles null/undefined messages
const memory = get_data(null, 'memory');
// Returns: undefined (no error thrown)

// set_data() will throw if message is null
set_data(null, 'memory', '...'); // TypeError: Cannot set property 'extra' of null
```

**Best Practice**: Always validate message exists before calling `set_data()`:
```javascript
if (message) {
  set_data(message, 'memory', '...');
}
```

### Missing Chat Context

```javascript
// set_data() checks for chat context before saving
const ctx = getContext();
if (ctx?.chat && ctx?.chatId) {
  saveChatDebounced();
}
```

**Behavior**: If no chat is loaded, `set_data()` stores data in-memory but does NOT trigger backend save. Data will be lost on page reload.

### Invalid Keys

```javascript
// No validation on key names
set_data(message, '', 'value');           // Stores under key ""
set_data(message, 'invalid key!', 'val'); // Stores under key "invalid key!"
```

**Best Practice**: Use documented key names from the Data Key Inventory to avoid conflicts.

## Integration with SillyTavern Message Lifecycle

### Message Creation

When SillyTavern creates a new message:
1. Message object has no `extra` property initially
2. First `set_data()` call initializes `message.extra` and `message.extra[MODULE_NAME]`
3. Data persists through `saveChatDebounced()`

### Message Swipe

When user swipes to a different response:
1. SillyTavern updates `message.swipe_id`
2. Extension data in `message.extra[MODULE_NAME]` remains unchanged
3. Next `set_data()` syncs to new swipe index
4. Previous swipe's data is preserved in `message.swipe_info[prev_index].extra[MODULE_NAME]`

### Message Edit

When user edits message text:
1. SillyTavern updates `message.mes`
2. Extension data is NOT automatically cleared
3. Event handler (`MESSAGE_EDITED`) may trigger recap regeneration
4. New recap overwrites old data via `set_data()`

### Message Deletion

When user deletes a message:
1. SillyTavern removes message from `chat` array
2. Extension data is deleted along with message object
3. Event handler (`MESSAGE_DELETED`) may trigger cleanup operations

### Chat Save/Load

**Save**:
1. SillyTavern serializes entire `chat` array to JSON
2. All `message.extra[MODULE_NAME]` data is included
3. Backend writes to `chats/Chat-Name.jsonl`

**Load**:
1. Backend reads from `chats/Chat-Name.jsonl`
2. SillyTavern deserializes JSON to `chat` array
3. All `message.extra[MODULE_NAME]` data is restored

## Testing Considerations

### Unit Testing

Mock message object structure:
```javascript
const mockMessage = {
  mes: "Test message",
  is_user: false,
  extra: {
    auto_recap_memory: {
      memory: "Test recap"
    }
  },
  swipe_id: 0,
  swipe_info: [
    {
      extra: {
        auto_recap_memory: {
          memory: "Test recap"
        }
      }
    }
  ]
};

// Test get_data
const memory = get_data(mockMessage, 'memory');
assert(memory === "Test recap");

// Test set_data
set_data(mockMessage, 'memory', 'Updated recap');
assert(mockMessage.extra.auto_recap_memory.memory === "Updated recap");
```

### E2E Testing

Verify persistence across page reload:
```javascript
// 1. Generate recap
await generateRecap(messageIndex);

// 2. Verify data in memory
const memory = get_data(chat[messageIndex], 'memory');
expect(memory).toBeTruthy();

// 3. Reload page
await page.reload();

// 4. Verify data persisted
const memoryAfterReload = get_data(chat[messageIndex], 'memory');
expect(memoryAfterReload).toBe(memory);
```

### Swipe Testing

Verify independent swipe data:
```javascript
// 1. Generate recap on first swipe
await generateRecap(messageIndex);
const swipe0Memory = get_data(chat[messageIndex], 'memory');

// 2. Swipe to second response
await swipeRight(messageIndex);

// 3. Generate different recap on second swipe
await generateRecap(messageIndex);
const swipe1Memory = get_data(chat[messageIndex], 'memory');

// 4. Verify swipes have independent data
expect(swipe0Memory).not.toBe(swipe1Memory);
expect(chat[messageIndex].swipe_info[0].extra.auto_recap_memory.memory).toBe(swipe0Memory);
expect(chat[messageIndex].swipe_info[1].extra.auto_recap_memory.memory).toBe(swipe1Memory);
```

## Common Patterns

### Pattern 1: Conditional Data Storage

Store data only if it doesn't already exist:
```javascript
if (!get_data(message, 'memory')) {
  set_data(message, 'memory', 'Default recap...');
}
```

### Pattern 2: Batch Updates

Update multiple keys in sequence (single save):
```javascript
set_data(message, 'memory', '...');
set_data(message, 'include', 'Recap of message(s)');
set_data(message, 'error', null);
// Only one saveChatDebounced() call after 1000ms
```

### Pattern 3: Null vs Undefined Checks

```javascript
// Check if key was explicitly set to null
if (get_data(message, 'error') === null) {
  // Error was cleared
}

// Check if key was never set
if (get_data(message, 'error') === undefined) {
  // Error was never created
}

// Check if key is falsy (null, undefined, false, "", 0)
if (!get_data(message, 'memory')) {
  // No recap exists
}
```

### Pattern 4: Safe Data Access

```javascript
// Safe access with fallback
const memory = get_data(message, 'memory') ?? 'No recap available';

// Safe array access
const versions = get_data(message, 'scene_recap_versions') ?? [];
const latestVersion = versions[versions.length - 1] ?? null;

// Safe object access
const metadata = get_data(message, 'scene_recap_metadata') ?? {};
const timestamp = metadata.generated_at ?? Date.now();
```

### Pattern 5: Conditional Persistence

Save only if data changed:
```javascript
const oldValue = get_data(message, 'memory');
const newValue = '...';
if (oldValue !== newValue) {
  set_data(message, 'memory', newValue);
}
```

## Migration Considerations

### Adding New Data Keys

New keys can be added without migration:
```javascript
// New feature: track generation count
set_data(message, 'generation_count', 1);
```

**Backward Compatibility**: Old messages without this key return `undefined`, which is handled gracefully.

### Renaming Data Keys

Requires migration logic:
```javascript
// Migrate old 'recap' key to new 'memory' key
const chat = getContext().chat;
for (const message of chat) {
  const oldRecap = get_data(message, 'recap'); // Old key
  if (oldRecap && !get_data(message, 'memory')) { // New key doesn't exist
    set_data(message, 'memory', oldRecap); // Migrate
    set_data(message, 'recap', null); // Clear old key
  }
}
```

### Changing Data Structure

Requires version detection and migration:
```javascript
// Old: scene_recap_versions was a simple array
// New: scene_recap_versions has version, timestamp, content properties

const versions = get_data(message, 'scene_recap_versions');
if (Array.isArray(versions) && versions.length > 0) {
  // Check if old format (simple strings)
  if (typeof versions[0] === 'string') {
    // Migrate to new format
    const newVersions = versions.map((content, index) => ({
      version: index,
      timestamp: Date.now(),
      content: content
    }));
    set_data(message, 'scene_recap_versions', newVersions);
  }
}
```

## Debugging Tools

### Inspect Message Data

Console command to view all extension data:
```javascript
// Inspect specific message
const message = getContext().chat[50];
console.log(message.extra?.auto_recap_memory);

// Inspect all messages with recaps
getContext().chat.forEach((msg, i) => {
  const memory = msg.extra?.auto_recap_memory?.memory;
  if (memory) {
    console.log(`Message ${i}: ${memory.substring(0, 50)}...`);
  }
});
```

### Verify Save Operations

Track when saves occur:
```javascript
// Override saveChatDebounced to add logging
const originalSave = saveChatDebounced;
saveChatDebounced = function() {
  console.log('[AutoRecap] Saving chat...');
  return originalSave();
};
```

### Validate Data Integrity

Check for missing or corrupt data:
```javascript
const chat = getContext().chat;
const issues = [];

for (let i = 0; i < chat.length; i++) {
  const message = chat[i];
  const memory = get_data(message, 'memory');
  const include = get_data(message, 'include');

  // Has memory but no include status
  if (memory && !include) {
    issues.push(`Message ${i}: Has memory but no include status`);
  }

  // Has include status but no memory
  if (include && !memory) {
    issues.push(`Message ${i}: Has include status but no memory`);
  }
}

if (issues.length > 0) {
  console.error('[AutoRecap] Data integrity issues:', issues);
}
```

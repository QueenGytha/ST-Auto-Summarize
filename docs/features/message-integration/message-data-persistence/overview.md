# Message Data Persistence - Overview

## Feature Summary

Message Data Persistence is the foundational system for storing and retrieving extension-specific data on SillyTavern message objects. It provides two core functions (`get_data` and `set_data`) that handle namespacing, swipe synchronization, and automatic chat persistence.

## Why This Feature Exists

SillyTavern message objects are plain JavaScript objects that are serialized to disk when the chat is saved. Extensions need a standardized way to:

1. **Store custom data** on messages without conflicts with other extensions
2. **Persist data** across page reloads and browser sessions
3. **Handle swipe data** independently for each response alternative
4. **Trigger chat saves** automatically when data changes

This feature provides all of that through a simple, consistent API.

## Core Functions

### set_data(message, key, value)

Stores extension data on a message object.

**Example**:
```javascript
set_data(message, 'memory', 'Alice entered the library.');
set_data(message, 'include', 'Recap of message(s)');
set_data(message, 'scene_break', true);
```

**What it does**:
1. Stores data at `message.extra.auto_recap_memory[key]`
2. Clones data to current swipe (`message.swipe_info[swipe_id].extra`)
3. Triggers debounced chat save to backend (1000ms delay)

### get_data(message, key)

Retrieves extension data from a message object.

**Example**:
```javascript
const memory = get_data(message, 'memory');
// Returns: "Alice entered the library." or undefined

const isSceneBreak = get_data(message, 'scene_break');
// Returns: true, false, or undefined
```

**What it does**:
1. Safely navigates to `message.extra.auto_recap_memory[key]`
2. Returns `undefined` if any part of path is missing
3. No side effects (pure read operation)

## Data Storage Structure

Extension data is stored under a namespace to avoid conflicts:

```javascript
{
  "mes": "Message text...",
  "is_user": false,
  "extra": {
    "auto_recap_memory": {           // ← Extension namespace
      "memory": "Recap text...",      // ← Data keys
      "include": "Recap of message(s)",
      "scene_break": true,
      // ... other data
    },
    "other_extension": { /* ... */ }  // ← Other extensions' data
  },
  "swipe_info": [
    {
      "extra": {
        "auto_recap_memory": { /* swipe-specific data */ }
      }
    }
  ]
}
```

## Complete Data Key Reference

### Regular Recap Data
- `memory` (string) - The recap text for a message
- `include` (string|null) - Inclusion status: "Recap of message(s)" or null
- `exclude` (boolean) - User manually excluded this message
- `error` (string|null) - Error message if recap generation failed
- `reasoning` (string|null) - LLM's chain-of-thought reasoning
- `prefill` (string|null) - Prefill text used in generation
- `edited` (boolean) - User manually edited the recap

### Scene Break Data
- `scene_break` (boolean) - Marks end of a scene
- `scene_break_visible` (boolean) - Scene break is visible in UI
- `scene_break_name` (string|null) - User-assigned scene name
- `scene_break_collapsed` (boolean) - Scene break UI is collapsed

### Scene Recap Data
- `scene_recap_memory` (string|null) - Scene recap text
- `scene_recap_versions` (Array<Object>) - Version history of scene recaps
- `scene_recap_current_index` (number) - Active version index
- `scene_recap_hash` (string) - Hash for change detection
- `scene_recap_metadata` (Object) - Generation metadata
- `scene_recap_include` (boolean) - Include in memory injection

### Auto Scene Break Detection
- `auto_scene_break_checked` (boolean) - Message checked by auto-detection

### System Markers
- `is_auto_recap_system_memory` (boolean) - System-generated message

## Key Features

### 1. Automatic Namespacing

All data is stored under `message.extra[MODULE_NAME]` where `MODULE_NAME = 'auto_recap_memory'`. This prevents conflicts with other extensions or SillyTavern's internal data.

### 2. Swipe Synchronization

When you call `set_data()`, it automatically synchronizes data to the current swipe:

```javascript
set_data(message, 'memory', 'Recap for swipe 1');
// Automatically copies to: message.swipe_info[swipe_id].extra.auto_recap_memory
```

Each swipe can have independent recap data.

### 3. Debounced Chat Saves

Multiple writes are batched into a single backend save operation:

```javascript
set_data(message, 'memory', '...');     // Triggers debounce timer
set_data(message, 'include', '...');    // Resets timer
set_data(message, 'error', null);       // Resets timer
// Only ONE backend save occurs after 1000ms
```

This reduces server load and improves performance.

### 4. Safe Data Access

`get_data()` uses optional chaining to safely handle missing data:

```javascript
const memory = get_data(null, 'memory');          // Returns: undefined
const memory = get_data(message, 'nonexistent');  // Returns: undefined
const memory = get_data(message, 'memory');       // Returns: actual value or undefined
```

No errors are thrown if message or data doesn't exist.

## Common Usage Patterns

### Pattern 1: Store Recap After Generation

```javascript
// In operation handler after LLM returns recap
const recapText = await llmClient.generateRaw(prompt);

set_data(message, 'memory', recapText);
set_data(message, 'reasoning', llmReasoning);
set_data(message, 'error', null);
// All 3 writes batched into single save
```

### Pattern 2: Read Recap for Display

```javascript
// In message visuals component
const memory = get_data(message, 'memory');
const include = get_data(message, 'include');

if (memory) {
  displayRecap(memory, include);
}
```

### Pattern 3: Check Data Existence

```javascript
// Check if recap exists
if (get_data(message, 'memory')) {
  // Message has a recap
}

// Check if explicitly set to null
if (get_data(message, 'error') === null) {
  // Error was cleared
}

// Check if never set
if (get_data(message, 'error') === undefined) {
  // Error was never created
}
```

### Pattern 4: Update Scene Break State

```javascript
// Mark message as scene break
set_data(message, 'scene_break', true);
set_data(message, 'scene_break_visible', true);
set_data(message, 'scene_break_name', 'Chapter 2');
```

### Pattern 5: Clear Recap Data

```javascript
// Clear all recap-related data
set_data(message, 'memory', null);
set_data(message, 'error', null);
set_data(message, 'reasoning', null);
set_data(message, 'prefill', null);
set_data(message, 'edited', false);
set_data(message, 'exclude', false);
```

## Helper Functions

### get_memory(message)

Get complete memory text including prefill:

```javascript
const memory = get_memory(message);
// Returns: "In this scene: Alice entered the library."
//   (if prefill="In this scene: " and memory="Alice entered the library.")
```

### edit_memory(message, text)

Edit recap and clear related metadata:

```javascript
edit_memory(message, 'Corrected recap text...');
// Sets memory, clears error/reasoning/prefill, marks edited=true
```

### clear_memory(message)

Clear all recap data:

```javascript
clear_memory(message);
// Clears memory, error, reasoning, prefill, edited, exclude
```

### get_previous_swipe_memory(message, key)

Get data from previous swipe:

```javascript
const prevMemory = get_previous_swipe_memory(message, 'memory');
// Returns: previous swipe's recap, or null
```

## Persistence Behavior

### When Data is Saved

1. **Immediate**: Data is stored in memory (`message.extra`)
2. **Debounced**: Backend save is scheduled after 1000ms
3. **Batched**: Multiple writes within 1000ms trigger only ONE save

### What Survives Page Reload

✅ **Persisted**:
- All data in `message.extra.auto_recap_memory`
- All data in `message.swipe_info[i].extra.auto_recap_memory`
- Scene recap versions
- Scene break markers

❌ **Not Persisted**:
- In-memory caches (e.g., active lorebook entries Map)
- UI state (e.g., collapsed panels)
- Running recap data (stored in `chat_metadata` instead)

## Swipe Behavior

### Independent Swipe Data

Each swipe stores its own recap data:

```javascript
// Swipe 0
set_data(message, 'memory', 'Recap for swipe 0');

// User swipes right → swipe 1
set_data(message, 'memory', 'Recap for swipe 1');

// Data is isolated:
message.swipe_info[0].extra.auto_recap_memory.memory = 'Recap for swipe 0'
message.swipe_info[1].extra.auto_recap_memory.memory = 'Recap for swipe 1'
```

### Stale Data on Swipe Switch

When switching swipes, `message.extra` may briefly show stale data:

```javascript
// Current: swipe 1
message.extra.auto_recap_memory.memory = 'Recap for swipe 1'

// User swipes to swipe 2
message.swipe_id = 2

// Main storage NOT automatically updated:
get_data(message, 'memory')  // Returns: 'Recap for swipe 1' (STALE)

// Swipe storage has correct data:
message.swipe_info[2].extra.auto_recap_memory.memory = 'Recap for swipe 2'
```

**Solution**: Next `set_data()` overwrites stale data with correct swipe data.

## Performance Considerations

### Write Performance

- **Single write**: ~1-5ms (including swipe clone)
- **Batch writes**: Same total time, but only ONE backend save

### Read Performance

- **Single read**: <0.2ms (negligible overhead)

### Memory Usage

- **Typical message**: ~1.5KB (2 swipes)
- **Scene break**: ~12.5KB (with versions)
- **500-message chat**: ~750KB total extension data

## Error Handling

### Missing Message

```javascript
get_data(null, 'memory')  // Returns: undefined (no error)
set_data(null, 'memory')  // Throws: TypeError (message is null)
```

**Best Practice**: Always validate message exists before `set_data()`.

### Missing Chat Context

If no chat is loaded, `set_data()` stores data in-memory but does NOT save to backend:

```javascript
set_data(message, 'memory', '...');
// Data exists in memory, but not saved to disk
// Will be lost on page reload
```

### Save Failure

If backend save fails, data exists in-memory but not on disk. Will be lost if user closes browser before retry succeeds.

## Integration Points

### Event Handlers

```javascript
// After message sent/received
eventHandlers.js: MESSAGE_SENT
  → Generate recap
  → set_data(message, 'memory', recap)
```

### Memory Injection

```javascript
// Before LLM generation
memoryCore.js: refresh_memory()
  → get_data(message, 'memory') for each message
  → Inject into prompt
```

### UI Display

```javascript
// Display recap below message
messageVisuals.js: update_message_visuals()
  → get_data(message, 'memory')
  → get_data(message, 'include')
  → Render colored recap text
```

### Scene Navigation

```javascript
// Build scene list
sceneNavigator.js: renderSceneNavigatorBar()
  → get_data(message, 'scene_break')
  → get_data(message, 'scene_break_name')
  → Render navigation links
```

## Testing

### Unit Tests

```javascript
const message = { mes: "Test", is_user: false };

set_data(message, 'memory', 'Test recap');
assert(get_data(message, 'memory') === 'Test recap');
```

### E2E Tests

```javascript
// Verify persistence across reload
await generateRecap(messageIndex);
const memory = get_data(chat[messageIndex], 'memory');

await page.reload();

const memoryAfterReload = get_data(chat[messageIndex], 'memory');
expect(memoryAfterReload).toBe(memory);
```

## Related Documentation

- **[implementation.md](./implementation.md)** - Detailed technical implementation (600 lines)
- **[data-flow.md](./data-flow.md)** - Complete data flow diagrams (300 lines)
- **[messageData.js](../../../messageData.js)** - Source code implementation

## Quick Reference

| Task | Code |
|------|------|
| Store recap | `set_data(message, 'memory', 'Recap...')` |
| Get recap | `get_data(message, 'memory')` |
| Clear recap | `set_data(message, 'memory', null)` |
| Mark scene break | `set_data(message, 'scene_break', true)` |
| Get scene name | `get_data(message, 'scene_break_name')` |
| Check if edited | `get_data(message, 'edited')` |
| Get full memory | `get_memory(message)` |
| Edit memory | `edit_memory(message, 'New text')` |
| Clear all | `clear_memory(message)` |

## Migration Notes

When adding new data keys, ensure backward compatibility:

```javascript
// Safe pattern for new keys
const newFeatureData = get_data(message, 'new_feature_data') ?? defaultValue;
```

When renaming keys, implement migration logic:

```javascript
// Migrate old key to new key
const oldData = get_data(message, 'old_key');
if (oldData && !get_data(message, 'new_key')) {
  set_data(message, 'new_key', oldData);
  set_data(message, 'old_key', null);
}
```

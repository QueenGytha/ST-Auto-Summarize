# Message Data Persistence - Implementation

## Table of Contents

- [Overview](#overview)
- [Core Components](#core-components)
- [Key Mechanisms](#key-mechanisms)
- [Data Structures](#data-structures)
- [Error Handling](#error-handling)
- [Integration Points](#integration-points)
- [Swipe-Aware Data Persistence](#swipe-aware-data-persistence)
- [Testing](#testing)

---

## Overview

The **Message Data Persistence** feature is the foundational mechanism for storing and retrieving custom data on SillyTavern messages. Rather than using direct property assignment (fragile and non-persistent), the extension uses SillyTavern's native `message.extra` object—a structured storage container for extension metadata.

### What This Feature Does

- All recap text, metadata, UI state stored in `message.extra.auto_recap_memory`
- Type flexibility: strings, objects, arrays, booleans, null
- Automatic disk persistence via `saveChatDebounced()`
- Swipe support with independent data copies
- Safe access with optional chaining preventing crashes

### Why Message.extra is Used

1. **Persists across sessions**: Stored in chat JSON files on disk
2. **Message-bound**: Each message has independent namespace
3. **Type-agnostic**: Stores any JavaScript value
4. **Auto-save integration**: Integrates with ST's save system
5. **Swipe-aware**: Each swipe maintains independent copy

---

## Core Components

### set_data() Function

**File:** messageData.js:13-38

Stores a data value on a message in `message.extra.auto_recap_memory` namespace.

**Implementation:**
- Lazy-initializes `message.extra` if missing
- Lazy-initializes `message.extra[MODULE_NAME]` if missing
- Stores value at `message.extra.auto_recap_memory[key]`
- Replicates to active swipe using `structuredClone()`
- Triggers debounced chat save if context exists

**Module Constant:**
- `MODULE_NAME = 'auto_recap_memory'` (styleConstants.js:16)

### get_data() Function

**File:** messageData.js:39-42

Retrieves a data value from `message.extra.auto_recap_memory` namespace.

**Implementation:**
- Uses safe optional chaining: `message?.extra?.[MODULE_NAME]?.[key]`
- Returns `undefined` if any step is missing
- No default values provided

### Data Keys Reference

All keys stored under `message.extra.auto_recap_memory`:

| Key | Type | Purpose | Source |
|-----|------|---------|--------|
| memory | string | Recap text | operationHandlers |
| include | string | Injection type | memoryCore |
| error | string | Error message | operationHandlers |
| reasoning | string | LLM reasoning | operationHandlers |
| prefill | string | LLM prefix | operationHandlers |
| edited | boolean | Manual edit flag | messageData |
| exclude | boolean | Force-exclude flag | messageData |
| scene_recap_memory | string | Scene recap | operationHandlers |
| scene_break | boolean | Scene boundary | sceneBreak |
| scene_break_visible | boolean | UI visibility | sceneBreak |
| scene_break_name | string | Scene label | sceneBreak |
| scene_recap_versions | array | All versions | sceneBreak |
| scene_recap_current_index | number | Active version | sceneBreak |
| auto_scene_break_checked | boolean | Detection flag | autoSceneBreakDetection |

---

## Key Mechanisms

### Data Storage Flow

''''
set_data(message, key, value)
  └─ Create message.extra if missing
  └─ Create auto_recap_memory namespace if missing
  └─ Store: message.extra.auto_recap_memory[key] = value
  └─ If message has active swipe: structuredClone() to swipe
  └─ If chat loaded: saveChatDebounced() → disk save
''''

### Auto-Save Mechanism

**File:** messageData.js:33-37

The `set_data()` function automatically triggers chat saves when context exists.

Properties:
- Debounced 2000ms batching
- Only if chat context exists
- Prevents orphaned message errors
- Fully transparent to caller

### Session Persistence

Data survives reload through chat JSON:

1. set_data() stores recap
2. saveChatDebounced() writes to disk
3. Chat stored at: <ST_DATA>/chats/<char_id>/<chat>.jsonl
4. User reloads SillyTavern
5. Chat loads from disk
6. get_data() retrieves values immediately

---

## Error Handling

### Missing message.extra

**messageData.js:15-16:**
Auto-created on first write.

### Missing Module Namespace

**messageData.js:18-19:**
Auto-created on first write.

### Null/Undefined Safety

**messageData.js:39-42:**
Returns `undefined` if any step missing. No errors thrown.

### Chat Context Validation

**messageData.js:34-36:**
Data stored in memory if chat not loaded. Prevents corruption.

### Swipe Validation

**messageData.js:25-31:**
Validates swipe existence before write. Deep clones prevent reference sharing.

---

## Integration Points

### Files Using get_data/set_data

27 files total across:
- Core storage and utilities
- Recap generation and operations
- Memory injection and UI display
- Scene management and detection

### Call Frequency

- **set_data()**: 28 calls (messageData.js, operationHandlers.js, etc)
- **get_data()**: 40+ calls (memoryCore.js, sceneBreak.js, etc)

---

## Swipe-Aware Data Persistence

### Data Replication

**File: messageData.js:25-31**

When data is written to message, it's also written to active swipe using `structuredClone()` for independence.

### Previous Swipe Access

**File: messageData.js:110-116**

Function to retrieve data from previous swipe for comparison.

---

## Testing

### Test Scenarios

Comprehensive test coverage including:
- Basic storage/retrieval
- Auto-structure creation
- Swipe replication
- Null safety
- JSON serialization
- Type preservation

---

**Status:** Complete - Core documentation with all file references

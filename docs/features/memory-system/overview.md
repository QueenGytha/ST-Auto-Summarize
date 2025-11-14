# Memory System Architecture

## Overview

The **Memory System** is the critical architecture that manages how recaps are stored, calculated, and injected into LLM prompts. It handles multiple memory tiers with different inclusion strategies, token limits, and injection positions.

This system determines which recaps are visible to the LLM during chat generation, enabling context retention across long conversations while staying within token budget constraints.

---

## Key Concepts

### Memory Tiers

The system manages **5 distinct memory tiers**:

1. **Short-Term Memory** - Recent message recaps within token budget
2. **Long-Term Memory** - Older message recaps (DEPRECATED - not currently used)
3. **Scene Recaps** - Scene-level summaries at scene break markers
4. **Combined Recap** - Merged narrative of all message recaps
5. **Running Scene Recap** - Combined narrative of all scene recaps (versioned)

Currently, **only the running scene recap** is injected into LLM prompts. Short-term message recaps are calculated and flagged but not injected.

### Memory Storage

- **Message-level data** - Stored at `message.extra.auto_recap.*`
- **Chat-level data** - Stored at `chat_metadata.auto_recap_running_scene_recaps`
- **Access functions** - `get_data()` / `set_data()` for message data
- **Persistence** - Saved in chat JSON files

### Memory Injection

Memory is injected using SillyTavern's `setExtensionPrompt()` API:

- **Position** - Where in the prompt (BEFORE_PROMPT, IN_PROMPT, AFTER_PROMPT)
- **Depth** - How many messages back to inject
- **Role** - Message role (SYSTEM, USER, ASSISTANT)
- **Scan** - Whether to scan for activation

---

## Core Files

| File | Purpose |
|------|---------|
| `memoryCore.js` | Memory calculation and injection logic |
| `messageData.js` | Message-level data storage/retrieval |
| `runningSceneRecap.js` | Running scene recap versioning |
| `autoHide.js` | Auto-hide old messages by scene count |
| `utils.js` | Token limit calculation |

---

## Key Functions

### Memory Calculation

```javascript
// memoryCore.js
function update_message_inclusion_flags() {
  // Iterate messages in REVERSE order (newest to oldest)
  // Accumulate recap text while under token limit
  // Mark messages with inclusion status
  // Stop when limit exceeded
}
```

### Memory Injection

```javascript
// memoryCore.js
async function refresh_memory() {
  // 1. Auto-hide old messages by scene count
  // 2. Update message inclusion flags
  // 3. Get running scene recap for injection
  // 4. Inject memory via setExtensionPrompt()
}
```

### Token Limit Calculation

```javascript
// utils.js
function get_short_token_limit() {
  // Calculate token limit based on:
  // - Context size
  // - Setting value (percent or absolute)
  // Returns: token limit for short-term memory
}
```

---

## Message Inclusion Logic

### Exclusion Criteria

Messages are excluded if:

1. System messages from this extension
2. Explicitly excluded via `exclude` flag
3. User messages (if `include_user_messages` disabled)
4. Thought messages (Stepped Thinking extension)
5. System/hidden messages (if `include_system_messages` disabled)
6. Narrator messages (if `include_narrator_messages` disabled)
7. Disabled characters in group chats
8. Below minimum token threshold

**Source:** `memoryCore.js:check_message_exclusion()`

### Inclusion Algorithm

1. Start from newest message
2. Check exclusion criteria
3. If message has recap and under token limit, mark for inclusion
4. Accumulate recap text
5. Continue until token limit exceeded
6. Mark remaining messages as excluded

**Source:** `memoryCore.js:update_message_inclusion_flags()`

---

## Settings Reference

### Message Filtering

| Setting | Default | Description |
|---------|---------|-------------|
| `include_user_messages` | true | Include user messages |
| `include_system_messages` | true | Include system messages |
| `include_narrator_messages` | true | Include narrator messages |
| `message_length_threshold` | 0 | Minimum token size |

### Token Limits

| Setting | Default | Description |
|---------|---------|-------------|
| `message_recap_context_limit` | varies | Token limit (number) |
| `message_recap_context_type` | "percent" | "percent" or "absolute" |

### Scene Recap Injection

| Setting | Default | Description |
|---------|---------|-------------|
| `running_scene_recap_position` | 2 | Injection position (0-2) |
| `running_scene_recap_depth` | 2 | Injection depth |
| `running_scene_recap_role` | 0 | Message role (0-2) |
| `running_scene_recap_scan` | false | Scan for activation |

### Auto-Hide

| Setting | Default | Description |
|---------|---------|-------------|
| `auto_hide_scene_count` | 2 | Hide messages older than N scenes |

---

## Memory Lifecycle

```
1. Message arrives
   ↓
2. Recap generated and stored
   ↓
3. refresh_memory() triggered
   ↓
4. Calculate inclusion flags
   ↓
5. Update visual indicators
   ↓
6. Get running scene recap
   ↓
7. Inject memory via setExtensionPrompt()
   ↓
8. Memory available in next LLM request
```

---

## Integration Points

### With Recap Generation

- Message recaps stored via `set_data(message, 'memory', ...)`
- Scene recaps stored via `set_data(message, 'scene_recap_memory', ...)`
- Inclusion flags updated after generation

### With Scene Break System

- Scene creation triggers running recap regeneration
- Scene visibility affects auto-hide calculation
- Scene recaps feed into running scene recap

### With UI System

- Message visuals show recap status below messages
- Scene navigator shows scene break markers
- Version selector shows running recap versions

### With Event System

- `MESSAGE_SENT` triggers recap generation and memory refresh
- `MESSAGE_EDITED` triggers recap regeneration
- `MESSAGE_SWIPED` triggers recap regeneration
- `CHAT_CHANGED` triggers memory refresh

---

## Current Implementation Status

### Fully Implemented

- Short-term memory calculation
- Running scene recap versioning
- Memory injection via `setExtensionPrompt()`
- Token limit enforcement
- Auto-hide by scene count
- Message inclusion flags
- Visual indicators

### Deprecated/Unused

- Long-term memory tier
- Combined recap injection
- Message recap injection (only scene recaps injected)

---

## Architecture Highlights

### Token Budget Management

The system dynamically calculates token limits based on context size and settings, ensuring memory stays within budget constraints.

### Reverse Iteration Strategy

Messages are processed newest-to-oldest when calculating inclusion, prioritizing recent context over older messages.

### Cross-Chat Validation

Running scene recap storage validates chat_id to prevent cross-chat contamination when switching between chats.

### Debounced Refresh

Memory refresh is debounced to prevent rapid repeated calls during bulk operations.

### Batch Command Execution

Auto-hide executes hide/unhide commands in batches for contiguous message ranges, improving performance.

---

## Common Use Cases

### View Memory Status

Check which messages are included in memory:

```javascript
// Message visuals show status below each message:
// - Green: Included in memory
// - Yellow: Excluded (past token limit)
// - Red: Error during generation
// - Gray: No recap
```

### Adjust Token Budget

Change the token limit for short-term memory:

```javascript
// Settings UI:
// - message_recap_context_limit: 10 (percent) or 1000 (absolute)
// - message_recap_context_type: "percent" or "absolute"
```

### Control Scene Visibility

Hide older messages to keep UI manageable:

```javascript
// Settings UI:
// - auto_hide_scene_count: 2 (keep last 2 scenes visible)
```

### Switch Running Recap Version

View different versions of the running scene recap:

```javascript
// Version selector in navbar
// - Select version from dropdown
// - System injects selected version into next LLM request
```

---

## Technical Documentation

### Detailed Implementation

See [implementation.md](./implementation.md) for:
- Complete function signatures
- Algorithm details
- Code examples
- File/line references

### Data Flow Diagrams

See [data-flow.md](./data-flow.md) for:
- Visual flow diagrams
- Step-by-step execution traces
- Data transformation flows
- Integration flows

---

## Related Features

- [Running Scene Recap](../RUNNING_SCENE_RECAP.md) - Running recap system details
- [Scene Break Detection](../AUTO_SCENE_BREAK_DETECTION.md) - Auto scene break detection
- [Data Storage Inventory](../../reference/DATA_STORAGE_INVENTORY.md) - Complete storage reference
- [Settings Guide](../../guides/DEFAULT_SETTINGS_BEST_PRACTICES.md) - Configuration recommendations

---

**Implementation Status:** Complete and actively used in production

**Primary Maintainer:** `memoryCore.js` (345 lines)

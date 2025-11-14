# Sticky Entry Rounds Tracking - Implementation Details

## Overview

The **Sticky Entry Rounds Tracking** system maintains lorebook entries as active across multiple generations (message sends/swipes) based on configurable countdown timers.

## Purpose

1. **Temporary Persistence**: Keep entries active for N generations after activation
2. **Context Continuity**: Ensure entries remain available without keyword triggers
3. **Flexible Duration**: Support custom round counts via `sticky` property
4. **Constant Entry Support**: Handle both timed and always-active entries
5. **State Preservation**: Maintain sticky state across page reloads

## Entry Types

| Type | Behavior | Config |
|------|----------|--------|
| **Sticky Entry** | Active for N generations then expires | `entry.sticky = N` |
| **Constant Entry** | Always active, never expires | `entry.constant = true` |
| **Normal Entry** | Active only on keyword match | Neither property |

## Architecture

### Module Organization

| File | Purpose |
|------|---------|
| `index.js:257-616` | Core implementation |
| `lorebookManager.js:27` | DEFAULT_STICKY_ROUNDS constant |
| `profileUI.js:301` | Settings UI |
| `lorebookViewer.js:102` | Visual display |
| `recapToLorebookProcessor.js` | Entry creation |

### Event Flow

```
User sends message
  ↓
GENERATION_STARTED
  ↓
SillyTavern determines entries to inject
  ↓
WORLD_INFO_ACTIVATED
  ↓
1. decrementStickyCounters()
2. getStillActiveEntries()
3. Merge with new entries
4. Persist to message.extra
5. updateStickyTracking()
```

## Core Components

### 1. installWorldInfoActivationLogger()

Installs event handlers for sticky entry tracking.

**Called**: `eventHandlers.js:256`

**Handles**:
- `GENERATION_STARTED` - Record generation type
- `WORLD_INFO_ACTIVATED` - Track entry activation
- `CHAT_CHANGED` - Clear sticky state

### 2. decrementStickyCounters()

Decrement countdown for all tracked entries. Remove when count reaches 0.

**Called**: Before merging with new activations

**Example**:
```
Round 1: Entry X (sticky=3) activated
  stickyCount: 3

Round 2-4: Each generation
  stickyCount: 3 → 2 → 1 → 0

Round 5: Entry expired
```

### 3. getStillActiveEntries()

Return entries that should remain active from previous generations.

Includes entries where:
- `entry.constant === true`, OR
- `stickyCount > 0`

### 4. updateStickyTracking()

Register newly activated entries for future tracking.

For each entry:
- If `sticky > 0`: register with `stickyCount = entry.sticky`
- If `constant === true`: register with `stickyCount = Infinity`

### 5. getEntryStrategy()

Determine entry strategy. Returns `'constant'`, `'vectorized'`, or `'normal'`.

## Data Structures

### activeStickyEntries Map

```javascript
Map<string, {
  entry: entryObject,
  stickyCount: number,
  messageIndex: number
}>
```

### activeLorebooksPerMessage Map

```javascript
Map<number, Array<entryObject>>
```

## Lifecycle

1. **Definition**: Set `entry.sticky = N`
2. **First Activation**: Keyword match triggers activation
3. **Persistence**: `updateStickyTracking()` registers entry
4. **Subsequent Rounds**: `decrementStickyCounters()` decrements count
5. **Inclusion**: `getStillActiveEntries()` keeps entry active
6. **Expiration**: Count reaches 0, entry removed

## Integration Points

### GENERATION_STARTED (index.js:466-471)
Records generation type and target message index.

### WORLD_INFO_ACTIVATED (index.js:473-515)
Main handler. Decrements, merges, persists, registers.

### CHAT_CHANGED (index.js:505-512)
Clears all sticky state on chat switch.

## Durability & Persistence

Sticky state persists via `message.extra`:
```javascript
message.extra.activeLorebookEntries = [...]
message.extra.inactiveLorebookEntries = [...]
```

On reload:
1. Check `message.extra` first (persisted)
2. Fall back to in-memory Map (current session)

## Configuration

### Default Sticky Rounds

`lorebookManager.js:27`:
```javascript
const DEFAULT_STICKY_ROUNDS = 4;
```

### Settings UI

`profileUI.js:301` - Number input for sticky rounds

## UI Integration

### Visual Indicator

`lorebookViewer.js:102`:
```javascript
const stickyDisplay = entry.sticky > 0 ? 
  `<span style="color: #ffa500;">📌 ${entry.sticky}</span>` : '';
```

## Summary

Sticky Entry Rounds Tracking provides:
- Automatic persistence across generations
- Accurate countdown management
- Constant entry support
- Durable state preservation
- Clean event-driven architecture

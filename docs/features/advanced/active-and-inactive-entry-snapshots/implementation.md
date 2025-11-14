# Active and Inactive Entry Snapshots - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Data Structures](#data-structures)
5. [Lifecycle Management](#lifecycle-management)
6. [Entry Strategy Detection](#entry-strategy-detection)
7. [Sticky Entry Tracking](#sticky-entry-tracking)
8. [Snapshot Capture Process](#snapshot-capture-process)
9. [Persistence Mechanism](#persistence-mechanism)
10. [Retrieval Interface](#retrieval-interface)
11. [Integration with Lorebook System](#integration-with-lorebook-system)
12. [UI Integration](#ui-integration)
13. [Memory Cleanup](#memory-cleanup)
14. [Error Handling](#error-handling)
15. [Testing and Validation](#testing-and-validation)

## Overview

The Active and Inactive Entry Snapshots feature captures a **complete snapshot** of lorebook entries for every message generation, storing both entries that were activated (injected into the LLM prompt) and those that were loaded but not activated. This provides a full historical record of the lorebook state at each message for debugging, analysis, and future features like branching/checkpoints.

### Purpose

1. **Historical Record**: Preserve exact lorebook state per message
2. **Active/Inactive Separation**: Track which entries were used vs available
3. **Sticky Entry Management**: Maintain sticky/constant entry state across generations
4. **Complete Snapshot**: Store ALL entries from ALL loaded lorebooks
5. **Strategy Tracking**: Capture injection strategy (constant/vectorized/normal)
6. **UI Inspection**: Enable viewing lorebook state via UI modal

### Key Files

**File** | **Purpose** | **Lines**
---------|-------------|----------
`index.js:257-616` | Core tracker installation and event handlers | 360
`lorebookViewer.js` | UI modal for viewing snapshots | 207
`memoryCore.js:234-240` | Cleanup on memory clear | 7
`sceneBreak.js:1029-1035` | Manual snapshot for scene breaks | 7
`eventHandlers.js:44,256` | Initialization during extension load | 2

### Key Features

- **Two-tier tracking**: In-memory Maps + persistent `message.extra` storage
- **Generation type awareness**: Handles swipe/continue/normal generations correctly
- **Sticky entry lifecycle**: Tracks countdown timers for sticky entries
- **Strategy detection**: Identifies constant/vectorized/normal injection patterns
- **Complete lorebook loading**: Fetches ALL entries from all active lorebooks
- **Active/inactive split**: Separates activated from available-but-unused entries
- **Durable storage**: Survives page reload via `message.extra` persistence

## Architecture

### Event-Based Activation Flow

```
GENERATION_STARTED event
    ↓
Calculate target message index (swipe/continue/normal)
    ↓
WORLD_INFO_ACTIVATED event (fired by SillyTavern)
    ↓
Decrement sticky counters
    ↓
Get still-active sticky/constant entries
    ↓
Enhance newly activated entries with metadata
    ↓
Update sticky tracking
    ↓
Merge new + still-active entries
    ↓
Load ALL entries from ALL lorebooks
    ↓
Split into active/inactive based on activation
    ↓
Persist to message.extra.activeLorebookEntries
Persist to message.extra.inactiveLorebookEntries
```

### Two-Tier Storage Architecture

**Tier 1: In-Memory Maps** (session-scoped)
```javascript
activeLorebooksPerMessage = new Map()  // messageIndex → entry[]
activeStickyEntries = new Map()        // uid → {entry, stickyCount, messageIndex}
```

**Tier 2: Persistent Storage** (durable across reloads)
```javascript
message.extra.activeLorebookEntries = [...]   // Active entries array
message.extra.inactiveLorebookEntries = [...] // Inactive entries array
```

**Access Pattern:**
1. Retrieval functions (`getActiveLorebooksForMessage`) check `message.extra` FIRST
2. Fall back to in-memory Map if not found in `message.extra`
3. This ensures data survives page reload

### SillyTavern Event Integration

The feature hooks into SillyTavern's lorebook injection system via events:

**Event** | **Purpose** | **Data Provided**
----------|-------------|------------------
`GENERATION_STARTED` | Determine target message index | `genType` (swipe/continue/normal)
`WORLD_INFO_ACTIVATED` | Capture activated entries | `entries[]` (newly activated entries)
`CHAT_CHANGED` | Clear sticky state on chat switch | None

**Why `WORLD_INFO_ACTIVATED`?**

SillyTavern fires this event AFTER determining which lorebook entries to inject into the prompt. It provides the exact list of entries that will be sent to the LLM. We capture this list + fetch all other entries to create a complete snapshot.

**Source:** `selectorsSillyTavern.js:73`

## Core Components

### installWorldInfoActivationLogger()

**Purpose:** Install event listeners for lorebook activation tracking

**File:** `index.js:485-616`

**Signature:**
```javascript
export function installWorldInfoActivationLogger(): void
```

**Parameters:** None

**Returns:** `void`

**Description:**

Installs three event handlers:
1. `GENERATION_STARTED` - Tracks generation type and target message index
2. `WORLD_INFO_ACTIVATED` - Captures entry activation and creates snapshot
3. `CHAT_CHANGED` - Clears sticky entry state

**Implementation:**
```javascript
export function installWorldInfoActivationLogger() {
  debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Installing activation tracker');

  const ctx = getContext();
  const eventSource = ctx?.eventSource;
  const event_types = ctx?.event_types;

  if (!eventSource || !event_types?.WORLD_INFO_ACTIVATED || !event_types?.GENERATION_STARTED) {
    debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Unable to install tracker (missing eventSource or event types)');
    return;
  }

  // Track generation type and target message index
  eventSource.on(event_types.GENERATION_STARTED, (genType) => {
    currentGenerationType = genType;
    const chatLength = ctx.chat?.length || 0;

    // Calculate target message index based on generation type
    if (genType === 'swipe') {
      targetMessageIndex = Math.max(0, chatLength - 1);
    } else if (genType === 'continue') {
      targetMessageIndex = Math.max(0, chatLength - 1);
    } else {
      targetMessageIndex = chatLength;
    }

    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Generation started: type=${genType}, targetIndex=${targetMessageIndex}`);
  });

  // Track world info activations
  eventSource.on(event_types.WORLD_INFO_ACTIVATED, async (entries) => {
    // ... (see next section)
  });

  // Clear sticky state on chat change
  eventSource.on(event_types.CHAT_CHANGED, () => {
    debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Chat changed, clearing sticky entry state');
    activeStickyEntries.clear();
    currentGenerationType = null;
    targetMessageIndex = null;
  });

  debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] ✓ Tracker installed successfully');
}
```

**Call Site:** `eventHandlers.js:256`

**Installation Flow:**
```
Extension initialization (eventHandlers.js:handleExtensionLoad)
    ↓
Line 256: installWorldInfoActivationLogger()
    ↓
Hooks into SillyTavern event system
    ↓
Ready to track activations
```

### getActiveLorebooksForMessage()

**Purpose:** Retrieve active lorebook entries for a specific message

**File:** `index.js:272-283`

**Signature:**
```javascript
export function getActiveLorebooksForMessage(messageIndex: number): Array<LorebookEntry> | null
```

**Parameters:**

Parameter | Type | Description
----------|------|------------
`messageIndex` | number | Index of message in `chat` array

**Returns:** `Array<LorebookEntry> | null` - Array of active entry objects, or `null` if none

**Description:**

Retrieves active entries using persistence-first strategy:
1. Check `message.extra.activeLorebookEntries` (persistent storage)
2. Fall back to `activeLorebooksPerMessage` Map (in-memory)
3. Return `null` if no data found

**Implementation:**
```javascript
export function getActiveLorebooksForMessage(messageIndex) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  // Try to load from persisted data first
  if (message?.extra?.activeLorebookEntries) {
    return message.extra.activeLorebookEntries;
  }

  // Fall back to in-memory storage
  return activeLorebooksPerMessage.get(messageIndex) || null;
}
```

**Usage Example:**
```javascript
// From lorebookViewer.js:63
const activeEntries = getActiveLorebooksForMessage(messageIndex);
if (activeEntries && activeEntries.length > 0) {
  // Display active entries in modal
}
```

### getInactiveLorebooksForMessage()

**Purpose:** Retrieve inactive lorebook entries for a specific message

**File:** `index.js:290-299`

**Signature:**
```javascript
export function getInactiveLorebooksForMessage(messageIndex: number): Array<LorebookEntry> | null
```

**Parameters:**

Parameter | Type | Description
----------|------|------------
`messageIndex` | number | Index of message in `chat` array

**Returns:** `Array<LorebookEntry> | null` - Array of inactive entry objects, or `null` if none

**Description:**

Retrieves inactive entries from `message.extra.inactiveLorebookEntries`. Unlike active entries, inactive entries are ONLY stored in persistent storage (no in-memory Map fallback).

**Implementation:**
```javascript
export function getInactiveLorebooksForMessage(messageIndex) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  if (message?.extra?.inactiveLorebookEntries) {
    return message.extra.inactiveLorebookEntries;
  }

  return null;
}
```

**Why no in-memory fallback?**

Inactive entries are only captured at the moment of activation. There's no need for in-memory storage since they're written directly to `message.extra` during the snapshot process.

### clearActiveLorebooksData()

**Purpose:** Clear all lorebook tracking data from memory

**File:** `index.js:304-309`

**Signature:**
```javascript
export function clearActiveLorebooksData(): void
```

**Parameters:** None

**Returns:** `void`

**Description:**

Clears all in-memory tracking state:
- `activeLorebooksPerMessage` Map
- `activeStickyEntries` Map
- `currentGenerationType` variable
- `targetMessageIndex` variable

**Implementation:**
```javascript
export function clearActiveLorebooksData() {
  activeLorebooksPerMessage.clear();
  activeStickyEntries.clear();
  currentGenerationType = null;
  targetMessageIndex = null;
}
```

**Usage:**

Called during memory cleanup operations (e.g., `memoryCore.js:clear_memory()`). Note that this only clears **in-memory** state; persistent `message.extra` data remains intact.

### getEntryStrategy()

**Purpose:** Determine lorebook entry injection strategy type

**File:** `index.js:314-318`

**Signature:**
```javascript
function getEntryStrategy(entry: LorebookEntry): 'constant' | 'vectorized' | 'normal'
```

**Parameters:**

Parameter | Type | Description
----------|------|------------
`entry` | LorebookEntry | Lorebook entry object

**Returns:** `'constant' | 'vectorized' | 'normal'` - Strategy type string

**Description:**

Analyzes entry flags to determine injection strategy:
- `constant`: Entry always injected (priority check)
- `vectorized`: Entry uses vector search (secondary check)
- `normal`: Entry uses keyword matching (default)

**Implementation:**
```javascript
function getEntryStrategy(entry) {
  if (entry.constant === true) {return 'constant';}
  if (entry.vectorized === true) {return 'vectorized';}
  return 'normal';
}
```

**Decision Tree:**
```
entry.constant === true?
    ↓ YES → 'constant'
    ↓ NO
entry.vectorized === true?
    ↓ YES → 'vectorized'
    ↓ NO → 'normal'
```

**Priority Order:**

1. **constant** takes precedence (always-active entries)
2. **vectorized** is secondary (embedding-based activation)
3. **normal** is default (keyword-based activation)

### decrementStickyCounters()

**Purpose:** Decrement sticky counters and remove expired entries

**File:** `index.js:324-344`

**Signature:**
```javascript
function decrementStickyCounters(): void
```

**Parameters:** None

**Returns:** `void`

**Description:**

Iterates through `activeStickyEntries` Map and:
1. Decrements `stickyCount` for each entry (if > 0)
2. Marks entries with count 0 for removal
3. Removes expired entries from tracking

**Implementation:**
```javascript
function decrementStickyCounters() {
  const toRemove = [];

  for (const [uid, stickyData] of activeStickyEntries.entries()) {
    if (stickyData.stickyCount > 0) {
      stickyData.stickyCount--;
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Decremented sticky count for ${stickyData.entry.comment}: ${stickyData.stickyCount} remaining`);

      if (stickyData.stickyCount === 0) {
        toRemove.push(uid);
      }
    }
  }

  // Remove expired entries
  for (const uid of toRemove) {
    const removed = activeStickyEntries.get(uid);
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Removed expired sticky entry: ${removed.entry.comment}`);
    activeStickyEntries.delete(uid);
  }
}
```

**Lifecycle Example:**
```
Message 50: Entry "Alice" activated with sticky=3
    activeStickyEntries.set('alice-uid', {entry, stickyCount: 3, messageIndex: 50})

Message 51: GENERATION_STARTED fired
    decrementStickyCounters() → stickyCount = 2
    Entry still active, included in snapshot

Message 52: GENERATION_STARTED fired
    decrementStickyCounters() → stickyCount = 1
    Entry still active

Message 53: GENERATION_STARTED fired
    decrementStickyCounters() → stickyCount = 0
    Entry marked for removal, deleted from activeStickyEntries
```

**Special Case: Constant Entries**

Constant entries have `stickyCount = Infinity`, so they never expire:
```javascript
if (strategy === 'constant') {
  activeStickyEntries.set(entry.uid, {
    entry: entry,
    stickyCount: Infinity, // Never expires
    messageIndex: messageIndex
  });
}
```

### getStillActiveEntries()

**Purpose:** Get currently active sticky/constant entries

**File:** `index.js:350-361`

**Signature:**
```javascript
function getStillActiveEntries(): Array<LorebookEntry>
```

**Parameters:** None

**Returns:** `Array<LorebookEntry>` - Array of still-active entry objects

**Description:**

Returns entries from `activeStickyEntries` that are still active:
- Constant entries (always active)
- Sticky entries with `stickyCount > 0`

**Implementation:**
```javascript
function getStillActiveEntries() {
  const stillActive = [];

  for (const [, stickyData] of activeStickyEntries.entries()) {
    // Include if: constant OR sticky count > 0
    if (stickyData.entry.constant || stickyData.stickyCount > 0) {
      stillActive.push(stickyData.entry);
    }
  }

  return stillActive;
}
```

**Inclusion Logic:**
```
entry.constant === true
    ↓ YES → Include
    ↓ NO
stickyCount > 0
    ↓ YES → Include
    ↓ NO → Exclude
```

**Usage in Snapshot Flow:**

After decrementing counters, `getStillActiveEntries()` provides entries that should remain active for the current generation. These are merged with newly activated entries to create the complete active set.

### updateStickyTracking()

**Purpose:** Update sticky entry tracking with newly activated entries

**File:** `index.js:366-390`

**Signature:**
```javascript
function updateStickyTracking(entries: Array<LorebookEntry>, messageIndex: number): void
```

**Parameters:**

Parameter | Type | Description
----------|------|------------
`entries` | Array<LorebookEntry> | Newly activated entries
`messageIndex` | number | Target message index

**Returns:** `void`

**Description:**

Updates `activeStickyEntries` Map with newly activated entries that have sticky or constant flags:
- Sticky entries: Track with their `sticky` value as countdown
- Constant entries: Track with `Infinity` (never expires)

**Implementation:**
```javascript
function updateStickyTracking(entries, messageIndex) {
  for (const entry of entries) {
    const strategy = getEntryStrategy(entry);

    // Track sticky entries
    if (entry.sticky && entry.sticky > 0) {
      activeStickyEntries.set(entry.uid, {
        entry: entry,
        stickyCount: entry.sticky,
        messageIndex: messageIndex
      });
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Tracking sticky entry: ${entry.comment} (${entry.sticky} rounds)`);
    }

    // Track constant entries (always active)
    if (strategy === 'constant') {
      activeStickyEntries.set(entry.uid, {
        entry: entry,
        stickyCount: Infinity, // Never expires
        messageIndex: messageIndex
      });
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Tracking constant entry: ${entry.comment}`);
    }
  }
}
```

**Tracking Decision Tree:**
```
For each newly activated entry:
    ↓
entry.sticky > 0?
    ↓ YES → Add to activeStickyEntries with stickyCount = entry.sticky
    ↓ NO
entry.constant === true?
    ↓ YES → Add to activeStickyEntries with stickyCount = Infinity
    ↓ NO → Don't track (normal entry, only active for current message)
```

**Example Tracking Data:**
```javascript
activeStickyEntries = new Map([
  ['uid-123', {
    entry: {comment: 'Alice', uid: 'uid-123', sticky: 3, ...},
    stickyCount: 3,
    messageIndex: 50
  }],
  ['uid-456', {
    entry: {comment: 'World Setting', uid: 'uid-456', constant: true, ...},
    stickyCount: Infinity,
    messageIndex: 50
  }]
])
```

### getAllLorebookEntries()

**Purpose:** Load ALL entries from ALL lorebooks referenced by active entries

**File:** `index.js:400-439`

**Signature:**
```javascript
async function getAllLorebookEntries(mergedEntries: Array<LorebookEntry>): Promise<Array<LorebookEntry>>
```

**Parameters:**

Parameter | Type | Description
----------|------|------------
`mergedEntries` | Array<LorebookEntry> | Active lorebook entries (for extracting world names)

**Returns:** `Promise<Array<LorebookEntry>>` - Array of ALL entry objects from all worlds

**Description:**

Creates a complete snapshot by:
1. Extracting unique world (lorebook) names from active entries
2. Loading each lorebook via `loadWorldInfo()`
3. Converting all entries to enhanced format with metadata
4. Returning flattened array of all entries

**Implementation:**
```javascript
async function getAllLorebookEntries(mergedEntries) {
  const allEntries = [];

  // Extract unique world names from active entries
  const uniqueWorldNames = new Set(mergedEntries.map(e => e.world));

  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Loading entries from ${uniqueWorldNames.size} unique lorebook(s)`);

  for (const worldName of uniqueWorldNames) {
    // eslint-disable-next-line no-await-in-loop -- Sequential loading required to fetch lorebook data
    const worldData = await loadWorldInfo(worldName);

    if (!worldData?.entries) {
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Lorebook "${worldName}" has no entries`);
      continue;
    }

    for (const entry of Object.values(worldData.entries)) {
      const strategy = getEntryStrategy(entry);
      allEntries.push({
        comment: entry.comment || '(unnamed)',
        uid: entry.uid,
        world: worldName,
        key: entry.key || [],
        position: entry.position,
        depth: entry.depth,
        order: entry.order,
        role: entry.role,
        constant: entry.constant || false,
        vectorized: entry.vectorized || false,
        sticky: entry.sticky || 0,
        strategy: strategy,
        content: entry.content || ''
      });
    }
  }

  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Loaded ${allEntries.length} total entries from all lorebooks`);
  return allEntries;
}
```

**Data Flow:**
```
mergedEntries = [
  {uid: 1, world: 'characters.json', ...},
  {uid: 5, world: 'characters.json', ...},
  {uid: 12, world: 'locations.json', ...}
]
    ↓
uniqueWorldNames = Set(['characters.json', 'locations.json'])
    ↓
Load characters.json → Extract all 50 entries
Load locations.json → Extract all 30 entries
    ↓
allEntries = [80 total entries with enhanced metadata]
```

**Why Load All Entries?**

This creates a **complete historical snapshot** of the lorebook state. Even if only 3 entries were active, we capture all 80 available entries so we know:
- What WAS available but NOT used
- Complete lorebook configuration at that moment
- Full context for debugging/analysis

**Performance Consideration:**

Uses `eslint-disable-next-line no-await-in-loop` because lorebook loading is inherently sequential (filesystem/API operation). Attempting to parallelize would not improve performance and could cause race conditions.

### persistToMessage()

**Purpose:** Persist active lorebook entries to message metadata

**File:** `index.js:441-456`

**Signature:**
```javascript
function persistToMessage(messageIndex: number, entries: Array<LorebookEntry>): void
```

**Parameters:**

Parameter | Type | Description
----------|------|------------
`messageIndex` | number | Target message index
`entries` | Array<LorebookEntry> | Active entry objects to persist

**Returns:** `void`

**Description:**

Writes active entries to `message.extra.activeLorebookEntries` for durable storage. This ensures data survives:
- Page reload
- Extension reload
- Chat save/load
- Export/import

**Implementation:**
```javascript
function persistToMessage(messageIndex, entries) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  if (!message) {
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Cannot persist: message ${messageIndex} not found`);
    return;
  }

  if (!message.extra) {
    message.extra = {};
  }

  message.extra.activeLorebookEntries = entries;
  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Persisted ${entries.length} entries to message ${messageIndex}.extra`);
}
```

**Storage Location:**
```javascript
chat[messageIndex].extra.activeLorebookEntries = [
  {comment: 'Alice', uid: 1, world: 'characters.json', strategy: 'normal', ...},
  {comment: 'Tavern', uid: 5, world: 'locations.json', strategy: 'constant', ...},
  // ... all active entries
]
```

**Chat File Representation:**

When chat is saved to JSON, this appears as:
```json
{
  "mes": "Hello!",
  "is_user": false,
  "extra": {
    "activeLorebookEntries": [
      {
        "comment": "Alice",
        "uid": 1,
        "world": "characters.json",
        "key": ["Alice", "girl"],
        "position": 0,
        "depth": 4,
        "order": 100,
        "role": 0,
        "constant": false,
        "vectorized": false,
        "sticky": 0,
        "strategy": "normal",
        "content": "[Alice: cheerful young woman...]"
      }
    ]
  }
}
```

### persistInactiveToMessage()

**Purpose:** Persist inactive lorebook entries to message metadata

**File:** `index.js:463-478`

**Signature:**
```javascript
function persistInactiveToMessage(messageIndex: number, entries: Array<LorebookEntry>): void
```

**Parameters:**

Parameter | Type | Description
----------|------|------------
`messageIndex` | number | Target message index
`entries` | Array<LorebookEntry> | Inactive entry objects to persist

**Returns:** `void`

**Description:**

Writes inactive entries to `message.extra.inactiveLorebookEntries`. Identical to `persistToMessage()` but for inactive entries.

**Implementation:**
```javascript
function persistInactiveToMessage(messageIndex, entries) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  if (!message) {
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Cannot persist inactive entries: message ${messageIndex} not found`);
    return;
  }

  if (!message.extra) {
    message.extra = {};
  }

  message.extra.inactiveLorebookEntries = entries;
  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Persisted ${entries.length} inactive entries to message ${messageIndex}.extra`);
}
```

**Storage Location:**
```javascript
chat[messageIndex].extra.inactiveLorebookEntries = [
  {comment: 'Bob', uid: 2, world: 'characters.json', strategy: 'normal', ...},
  {comment: 'Forest', uid: 6, world: 'locations.json', strategy: 'normal', ...},
  // ... all inactive entries
]
```

## Data Structures

### LorebookEntry (Enhanced Format)

**Source:** Created in `index.js:535-552` and `index.js:419-433`

**Structure:**
```typescript
interface LorebookEntry {
  comment: string;        // Entry name/comment
  uid: number | string;   // Unique identifier
  world: string;          // Lorebook filename
  key: string[];          // Primary activation keywords
  position: number;       // Injection position (0-7)
  depth: number;          // Scan depth
  order: number;          // Insertion order
  role: number;           // Role filter (0=all, 1=system, 2=user, 3=assistant)
  constant: boolean;      // Always inject flag
  vectorized: boolean;    // Use vector search flag
  sticky: number;         // Sticky rounds remaining
  strategy: 'constant' | 'vectorized' | 'normal';  // Detected strategy
  content: string;        // Entry content text
}
```

**Field Descriptions:**

Field | Type | Source | Description
------|------|--------|------------
`comment` | string | `entry.comment` | Entry display name
`uid` | number/string | `entry.uid` | SillyTavern's unique ID
`world` | string | `worldName` | Lorebook filename (e.g., "characters.json")
`key` | string[] | `entry.key` | Primary keywords for activation
`position` | number | `entry.position` | 0=↑Char, 1=↓Char, 2=↑AN, 3=↓AN, 4=@D, 5=↑EM, 6=↓EM, 7=➡️
`depth` | number | `entry.depth` | How far back to scan for keywords
`order` | number | `entry.order` | Insertion order among entries at same position/depth
`role` | number | `entry.role` | Role filter (which message types to scan)
`constant` | boolean | `entry.constant` | If true, always injected regardless of keywords
`vectorized` | boolean | `entry.vectorized` | If true, uses embedding similarity
`sticky` | number | `entry.sticky` | Number of generations to remain active after initial activation
`strategy` | string | Calculated | One of 'constant', 'vectorized', 'normal'
`content` | string | `entry.content` | Full entry text to inject

**Position Name Mapping:**

Position | Symbol | Name | Description
---------|--------|------|------------
0 | ↑Char | Before Character | Before character card
1 | ↓Char | After Character | After character card
2 | ↑AN | Before Author's Note | Before AN
3 | ↓AN | After Author's Note | After AN
4 | @D | At Depth | At specified depth
5 | ↑EM | Before Example Messages | Before examples
6 | ↓EM | After Example Messages | After examples
7 | ➡️ | Relative Position | Relative to current message

**Source:** `lorebookViewer.js:92`

### StickyTrackingData

**Source:** `index.js:264` (Map value structure)

**Structure:**
```typescript
interface StickyTrackingData {
  entry: LorebookEntry;    // Full entry object
  stickyCount: number;     // Remaining rounds (Infinity for constant entries)
  messageIndex: number;    // Message where entry was activated
}
```

**Storage:**
```javascript
activeStickyEntries = new Map<string, StickyTrackingData>()
// Key: entry.uid (string)
// Value: StickyTrackingData object
```

**Lifecycle Example:**
```javascript
// Message 50: Entry activated with sticky=3
activeStickyEntries.set('alice-123', {
  entry: {comment: 'Alice', uid: 'alice-123', sticky: 3, ...},
  stickyCount: 3,
  messageIndex: 50
});

// Message 51: Decremented
// stickyCount = 2

// Message 52: Decremented
// stickyCount = 1

// Message 53: Decremented
// stickyCount = 0
// Entry removed from Map
```

### Module-Level State Variables

**Source:** `index.js:263-266`

**Variables:**

Variable | Type | Purpose | Scope
---------|------|---------|------
`activeLorebooksPerMessage` | `Map<number, Array<LorebookEntry>>` | In-memory cache of active entries per message | Session
`activeStickyEntries` | `Map<string, StickyTrackingData>` | Tracking for sticky/constant entries | Session
`currentGenerationType` | `string | null` | Type of current generation (swipe/continue/normal) | Session
`targetMessageIndex` | `number | null` | Calculated target message index for snapshot | Session

**Initialization:**
```javascript
const activeLorebooksPerMessage = new Map();
const activeStickyEntries = new Map();
let currentGenerationType = null;
let targetMessageIndex = null;
```

**Lifecycle:**

State | When | How
------|------|----
Created | Module load | Variable initialization
Populated | `WORLD_INFO_ACTIVATED` event | Event handler adds entries
Cleared | `CHAT_CHANGED` event | `activeStickyEntries.clear()`
Cleared | `clearActiveLorebooksData()` | All Maps cleared

## Lifecycle Management

### Initialization

**Trigger:** Extension load

**Flow:**
```
eventHandlers.js:handleExtensionLoad()
    ↓ Line 256
installWorldInfoActivationLogger()
    ↓
Hook GENERATION_STARTED event
Hook WORLD_INFO_ACTIVATED event
Hook CHAT_CHANGED event
    ↓
Ready to track activations
```

**Code Path:**
```javascript
// eventHandlers.js:256
installWorldInfoActivationLogger();
    ↓
// index.js:485
export function installWorldInfoActivationLogger() {
  eventSource.on(event_types.GENERATION_STARTED, ...);
  eventSource.on(event_types.WORLD_INFO_ACTIVATED, ...);
  eventSource.on(event_types.CHAT_CHANGED, ...);
}
```

### Per-Message Capture

**Trigger:** LLM generation

**Sequence:**
```
1. User sends message / swipes / continues
    ↓
2. SillyTavern fires GENERATION_STARTED('swipe'|'continue'|'normal')
    ↓
3. Event handler calculates targetMessageIndex
    ↓
4. SillyTavern determines which lorebook entries to activate
    ↓
5. SillyTavern fires WORLD_INFO_ACTIVATED(entries[])
    ↓
6. Event handler captures snapshot
    ↓
7. Snapshot persisted to message.extra
```

**Detailed Steps (WORLD_INFO_ACTIVATED handler):**

```javascript
// index.js:518-605
eventSource.on(event_types.WORLD_INFO_ACTIVATED, async (entries) => {
  // 1. Determine target message index
  const messageIndex = targetMessageIndex !== null ? targetMessageIndex : Math.max(0, chatLength - 1);

  // 2. Decrement sticky counters
  decrementStickyCounters();

  // 3. Get still-active sticky/constant entries
  const stillActive = getStillActiveEntries();

  // 4. Enhance newly activated entries with metadata
  const enhancedEntries = entries.map(entry => ({
    comment: entry.comment || '(unnamed)',
    uid: entry.uid,
    world: entry.world,
    key: entry.key || [],
    position: entry.position,
    depth: entry.depth,
    order: entry.order,
    role: entry.role,
    constant: entry.constant || false,
    vectorized: entry.vectorized || false,
    sticky: entry.sticky || 0,
    strategy: getEntryStrategy(entry),
    content: entry.content || ''
  }));

  // 5. Update sticky tracking
  updateStickyTracking(enhancedEntries, messageIndex);

  // 6. Merge newly activated + still-active entries (dedupe by UID)
  const entryMap = new Map();
  for (const entry of stillActive) {
    entryMap.set(entry.uid, entry);
  }
  for (const entry of enhancedEntries) {
    entryMap.set(entry.uid, entry);
  }
  const mergedEntries = Array.from(entryMap.values());

  // 7. Load ALL entries from ALL lorebooks
  const allLorebookEntries = await getAllLorebookEntries(mergedEntries);

  // 8. Split into active/inactive
  const activeUIDs = new Set(mergedEntries.map(e => e.uid));
  const activeEntriesFromAll = [];
  const inactiveEntries = [];
  for (const entry of allLorebookEntries) {
    if (activeUIDs.has(entry.uid)) {
      activeEntriesFromAll.push(entry);
    } else {
      inactiveEntries.push(entry);
    }
  }

  // 9. Store in memory
  activeLorebooksPerMessage.set(messageIndex, mergedEntries);

  // 10. Persist to message.extra
  persistToMessage(messageIndex, mergedEntries);
  persistInactiveToMessage(messageIndex, inactiveEntries);
});
```

### Chat Switch Cleanup

**Trigger:** `CHAT_CHANGED` event

**Flow:**
```
User switches chat
    ↓
CHAT_CHANGED event fires
    ↓
Clear sticky entry state
    activeStickyEntries.clear()
    currentGenerationType = null
    targetMessageIndex = null
    ↓
Ready for new chat's tracking
```

**Code:**
```javascript
// index.js:608-613
eventSource.on(event_types.CHAT_CHANGED, () => {
  debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Chat changed, clearing sticky entry state');
  activeStickyEntries.clear();
  currentGenerationType = null;
  targetMessageIndex = null;
});
```

**Why Clear Sticky State?**

Sticky entries are **chat-specific**. When switching chats, we must clear the tracking Map to avoid:
- Carrying over sticky entries from previous chat
- Incorrect sticky countdown state
- UID collisions between different lorebooks

**What's NOT Cleared:**

- `activeLorebooksPerMessage` Map - Remains in memory but will be replaced when new chat loads
- Persistent `message.extra` data - Belongs to chat files, remains intact

### Memory Clear Cleanup

**Trigger:** `clear_memory()` called (e.g., clearing all recaps)

**Flow:**
```
User clicks "Clear All Memories"
    ↓
memoryCore.js:clear_memory()
    ↓
Delete message.extra.activeLorebookEntries
Delete message.extra.inactiveLorebookEntries
    ↓
Snapshot data removed from message
```

**Code:**
```javascript
// memoryCore.js:234-240
if (message.extra?.activeLorebookEntries) {
  delete message.extra.activeLorebookEntries;
}

if (message.extra?.inactiveLorebookEntries) {
  delete message.extra.inactiveLorebookEntries;
}
```

**Scope:**

Clears **persistent** snapshot data from messages. In-memory Maps are not affected by this operation (would require `clearActiveLorebooksData()` call).

## Entry Strategy Detection

### Strategy Types

**Source:** `index.js:314-318`

**Strategy** | **Condition** | **Activation Method** | **Use Case**
------------|---------------|----------------------|-------------
`constant` | `entry.constant === true` | Always injected | World settings, always-relevant info
`vectorized` | `entry.vectorized === true` | Embedding similarity | Semantic search, concept matching
`normal` | Default | Keyword matching | Standard lorebook entries

### Detection Logic

**Priority Order:**
1. Check `constant` flag first (highest priority)
2. Check `vectorized` flag second
3. Default to `normal`

**Code:**
```javascript
function getEntryStrategy(entry) {
  if (entry.constant === true) {return 'constant';}
  if (entry.vectorized === true) {return 'vectorized';}
  return 'normal';
}
```

**Decision Tree:**
```
                    Entry
                      ↓
              constant === true?
                /           \
              YES            NO
               ↓              ↓
           'constant'   vectorized === true?
                           /          \
                         YES           NO
                          ↓             ↓
                   'vectorized'     'normal'
```

### Strategy Display

**UI Representation (lorebookViewer.js:85-89):**

```javascript
const strategyEmoji = {
  'constant': '🔵',      // Blue circle for always-active
  'vectorized': '🔗',    // Link for semantic connection
  'normal': '🟢'         // Green circle for keyword-based
};
```

**Modal Display:**

```
Active Entries (5) (🔵 2 constant, 🔗 1 vectorized, 🟢 2 normal)
  🔵 1. World Setting (constant)
  🔵 2. Character Card (constant)
  🔗 3. Similar Concept (vectorized)
  🟢 4. Alice (normal)
  🟢 5. Tavern (normal)
```

## Sticky Entry Tracking

### Sticky Entry Lifecycle

**Sticky Entry:** Lorebook entry that remains active for N generations after initial activation

**Example:** Entry with `sticky=3` remains active for 3 message generations

**Full Lifecycle:**
```
Message 50: "Alice walks into the tavern"
    ↓
Entry "Alice" activated by keyword match
entry.sticky = 3
    ↓
Add to activeStickyEntries:
  {uid: 'alice-123', stickyCount: 3, messageIndex: 50}
    ↓
Include in snapshot for message 50

Message 51: "She sits down"
    ↓
GENERATION_STARTED fires
decrementStickyCounters() → stickyCount = 2
    ↓
WORLD_INFO_ACTIVATED fires
getStillActiveEntries() returns "Alice" (stickyCount > 0)
    ↓
Merge with newly activated entries
Include in snapshot for message 51

Message 52: "She orders a drink"
    ↓
decrementStickyCounters() → stickyCount = 1
getStillActiveEntries() returns "Alice"
Include in snapshot for message 52

Message 53: "She drinks it"
    ↓
decrementStickyCounters() → stickyCount = 0
Entry marked for removal
activeStickyEntries.delete('alice-123')
    ↓
Entry NO LONGER active for message 53
(unless re-activated by keyword match)
```

### Constant Entry Lifecycle

**Constant Entry:** Entry with `constant=true` flag, always active regardless of keywords

**Lifecycle:**
```
Message 50: First generation after chat load
    ↓
Entry "World Setting" activated (constant=true)
    ↓
Add to activeStickyEntries:
  {uid: 'world-456', stickyCount: Infinity, messageIndex: 50}
    ↓
Include in snapshot for message 50

Message 51, 52, 53, ...
    ↓
decrementStickyCounters() → stickyCount = Infinity (unchanged)
getStillActiveEntries() → Always returns "World Setting"
    ↓
Include in every snapshot until chat switch
```

**Why `Infinity`?**

Constant entries never expire. Using `Infinity` ensures:
- `stickyCount > 0` check always passes
- Decrement operation has no effect (`Infinity - 1 = Infinity`)
- Entry never removed from `activeStickyEntries`

### Sticky Tracking Data Structure

**Map Structure:**
```javascript
activeStickyEntries = new Map([
  // Sticky entry (expires after 3 rounds)
  ['alice-123', {
    entry: {comment: 'Alice', uid: 'alice-123', sticky: 3, constant: false, ...},
    stickyCount: 2,  // Currently 2 rounds remaining
    messageIndex: 50  // First activated at message 50
  }],

  // Constant entry (never expires)
  ['world-456', {
    entry: {comment: 'World Setting', uid: 'world-456', constant: true, ...},
    stickyCount: Infinity,
    messageIndex: 50
  }]
])
```

### Re-activation Behavior

**Scenario:** Sticky entry re-activated before expiring

**Flow:**
```
Message 50: "Alice" activated (sticky=3)
  activeStickyEntries['alice-123'].stickyCount = 3

Message 51: Decrement → stickyCount = 2

Message 52: "Alice laughs" (keyword match, re-activates)
  ↓
updateStickyTracking() called with "Alice" in newly activated entries
  ↓
activeStickyEntries.set('alice-123', {stickyCount: 3, ...})
  ↓
Counter RESET to 3 (entry gets "renewed")
```

**Result:** Re-activation resets the sticky counter to original value, extending the entry's lifespan.

## Snapshot Capture Process

### Complete Flow (Annotated)

```javascript
// STEP 1: GENERATION_STARTED event (index.js:498-515)
eventSource.on(event_types.GENERATION_STARTED, (genType) => {
  currentGenerationType = genType;
  const chatLength = ctx.chat?.length || 0;

  // Calculate target message index
  if (genType === 'swipe') {
    targetMessageIndex = Math.max(0, chatLength - 1);  // Replace last message
  } else if (genType === 'continue') {
    targetMessageIndex = Math.max(0, chatLength - 1);  // Append to last message
  } else {
    targetMessageIndex = chatLength;  // New message
  }
});

// STEP 2: WORLD_INFO_ACTIVATED event (index.js:518-605)
eventSource.on(event_types.WORLD_INFO_ACTIVATED, async (entries) => {
  const chatLength = ctx.chat?.length || 0;
  const messageIndex = targetMessageIndex !== null ? targetMessageIndex : Math.max(0, chatLength - 1);

  // STEP 3: Decrement sticky counters for previous generation
  decrementStickyCounters();
  // Effect: Entries from previous generation have stickyCount reduced by 1
  // Expired entries (stickyCount = 0) removed from activeStickyEntries

  // STEP 4: Get still-active sticky/constant entries
  const stillActive = getStillActiveEntries();
  // Returns: Entries with constant=true OR stickyCount > 0

  // STEP 5: Enhance newly activated entries with metadata
  const enhancedEntries = entries.map(entry => {
    const strategy = getEntryStrategy(entry);
    return {
      comment: entry.comment || '(unnamed)',
      uid: entry.uid,
      world: entry.world,
      key: entry.key || [],
      position: entry.position,
      depth: entry.depth,
      order: entry.order,
      role: entry.role,
      constant: entry.constant || false,
      vectorized: entry.vectorized || false,
      sticky: entry.sticky || 0,
      strategy: strategy,
      content: entry.content || ''
    };
  });

  // STEP 6: Update sticky tracking with newly activated entries
  updateStickyTracking(enhancedEntries, messageIndex);
  // Effect: Sticky/constant entries added to activeStickyEntries Map

  // STEP 7: Merge newly activated + still-active entries (deduplicate by UID)
  const entryMap = new Map();
  for (const entry of stillActive) {
    entryMap.set(entry.uid, entry);  // Add still-active first
  }
  for (const entry of enhancedEntries) {
    entryMap.set(entry.uid, entry);  // Overwrite/add newly activated
  }
  const mergedEntries = Array.from(entryMap.values());
  // Result: Complete list of active entries (new + carried-over)

  // STEP 8: Load ALL entries from ALL lorebooks
  const allLorebookEntries = await getAllLorebookEntries(mergedEntries);
  // Returns: Every entry from every lorebook referenced by active entries

  // STEP 9: Split into active/inactive based on activation state
  const activeUIDs = new Set(mergedEntries.map(e => e.uid));
  const activeEntriesFromAll = [];
  const inactiveEntries = [];
  for (const entry of allLorebookEntries) {
    if (activeUIDs.has(entry.uid)) {
      activeEntriesFromAll.push(entry);
    } else {
      inactiveEntries.push(entry);
    }
  }

  // STEP 10: Store in memory (use mergedEntries which has sticky metadata)
  activeLorebooksPerMessage.set(messageIndex, mergedEntries);

  // STEP 11: Persist to message.extra
  persistToMessage(messageIndex, mergedEntries);
  persistInactiveToMessage(messageIndex, inactiveEntries);
  // Effect: Data saved to message object, will be written to chat JSON
});
```

### Data Transformation Example

**Input (from SillyTavern):**
```javascript
entries = [
  {
    uid: 123,
    comment: 'Alice',
    content: '[Alice: cheerful woman...]',
    key: ['Alice', 'girl'],
    constant: false,
    vectorized: false,
    sticky: 3,
    position: 0,
    depth: 4,
    order: 100,
    role: 0,
    world: 'characters.json'
  },
  {
    uid: 456,
    comment: 'World Setting',
    content: '[World: fantasy setting...]',
    key: [],
    constant: true,
    vectorized: false,
    sticky: 0,
    position: 0,
    depth: 0,
    order: 0,
    role: 0,
    world: 'world.json'
  }
]
```

**Output (enhanced format):**
```javascript
enhancedEntries = [
  {
    comment: 'Alice',
    uid: 123,
    world: 'characters.json',
    key: ['Alice', 'girl'],
    position: 0,
    depth: 4,
    order: 100,
    role: 0,
    constant: false,
    vectorized: false,
    sticky: 3,
    strategy: 'normal',  // ← Calculated
    content: '[Alice: cheerful woman...]'
  },
  {
    comment: 'World Setting',
    uid: 456,
    world: 'world.json',
    key: [],
    position: 0,
    depth: 0,
    order: 0,
    role: 0,
    constant: true,
    vectorized: false,
    sticky: 0,
    strategy: 'constant',  // ← Calculated
    content: '[World: fantasy setting...]'
  }
]
```

**Sticky Tracking Update:**
```javascript
activeStickyEntries = new Map([
  [123, {
    entry: {comment: 'Alice', uid: 123, sticky: 3, strategy: 'normal', ...},
    stickyCount: 3,
    messageIndex: 50
  }],
  [456, {
    entry: {comment: 'World Setting', uid: 456, constant: true, strategy: 'constant', ...},
    stickyCount: Infinity,
    messageIndex: 50
  }]
])
```

### Merge Logic (Active + Still-Active)

**Scenario:** Message with newly activated entries + sticky entries from previous messages

**Before Merge:**
```javascript
stillActive = [
  {comment: 'World Setting', uid: 456, strategy: 'constant', ...}  // From message 40
]

enhancedEntries = [
  {comment: 'Alice', uid: 123, strategy: 'normal', sticky: 3, ...},  // Newly activated
  {comment: 'Tavern', uid: 789, strategy: 'normal', sticky: 0, ...}  // Newly activated
]
```

**Merge Process:**
```javascript
const entryMap = new Map();

// Add still-active first
for (const entry of stillActive) {
  entryMap.set(entry.uid, entry);
}
// Map state: {456 → World Setting}

// Add newly activated (overwrites if UID exists)
for (const entry of enhancedEntries) {
  entryMap.set(entry.uid, entry);
}
// Map state: {456 → World Setting, 123 → Alice, 789 → Tavern}

const mergedEntries = Array.from(entryMap.values());
```

**After Merge:**
```javascript
mergedEntries = [
  {comment: 'World Setting', uid: 456, strategy: 'constant', ...},
  {comment: 'Alice', uid: 123, strategy: 'normal', sticky: 3, ...},
  {comment: 'Tavern', uid: 789, strategy: 'normal', sticky: 0, ...}
]
```

**Deduplication:** If an entry appears in both `stillActive` and `enhancedEntries` (re-activation), the newly activated version OVERWRITES the sticky version (map `.set()` replaces existing key).

### Active/Inactive Split

**Scenario:** Lorebook has 10 entries, 3 are activated

**All Lorebook Entries (from `getAllLorebookEntries()`):**
```javascript
allLorebookEntries = [
  {uid: 1, comment: 'Alice', ...},      // Will be active
  {uid: 2, comment: 'Bob', ...},        // Will be inactive
  {uid: 3, comment: 'Carol', ...},      // Will be inactive
  {uid: 4, comment: 'Tavern', ...},     // Will be active
  {uid: 5, comment: 'Forest', ...},     // Will be inactive
  {uid: 6, comment: 'Castle', ...},     // Will be inactive
  {uid: 7, comment: 'Sword', ...},      // Will be inactive
  {uid: 8, comment: 'Magic', ...},      // Will be inactive
  {uid: 9, comment: 'Quest', ...},      // Will be inactive
  {uid: 10, comment: 'Dragon', ...}     // Will be active
]
```

**Active UIDs:**
```javascript
mergedEntries = [
  {uid: 1, comment: 'Alice', ...},
  {uid: 4, comment: 'Tavern', ...},
  {uid: 10, comment: 'Dragon', ...}
]

activeUIDs = new Set([1, 4, 10])
```

**Split Process:**
```javascript
const activeEntriesFromAll = [];
const inactiveEntries = [];

for (const entry of allLorebookEntries) {
  if (activeUIDs.has(entry.uid)) {
    activeEntriesFromAll.push(entry);
  } else {
    inactiveEntries.push(entry);
  }
}
```

**Result:**
```javascript
// Stored as message.extra.activeLorebookEntries
activeEntriesFromAll = [
  {uid: 1, comment: 'Alice', ...},
  {uid: 4, comment: 'Tavern', ...},
  {uid: 10, comment: 'Dragon', ...}
]

// Stored as message.extra.inactiveLorebookEntries
inactiveEntries = [
  {uid: 2, comment: 'Bob', ...},
  {uid: 3, comment: 'Carol', ...},
  {uid: 5, comment: 'Forest', ...},
  {uid: 6, comment: 'Castle', ...},
  {uid: 7, comment: 'Sword', ...},
  {uid: 8, comment: 'Magic', ...},
  {uid: 9, comment: 'Quest', ...}
]
```

## Persistence Mechanism

### Storage Layers

**Layer** | **Location** | **Scope** | **Survives Reload**
----------|--------------|-----------|--------------------
In-Memory | `activeLorebooksPerMessage` Map | Session | ❌ No
In-Memory | `activeStickyEntries` Map | Session | ❌ No
Persistent | `message.extra.activeLorebookEntries` | Message | ✅ Yes
Persistent | `message.extra.inactiveLorebookEntries` | Message | ✅ Yes

### Persistence Flow

```
Snapshot captured
    ↓
Store in activeLorebooksPerMessage Map (in-memory)
    ↓
persistToMessage() → message.extra.activeLorebookEntries = [...]
persistInactiveToMessage() → message.extra.inactiveLorebookEntries = [...]
    ↓
SillyTavern's chat save (automatic on message changes)
    ↓
message.extra written to chat JSON file
    ↓
Data survives reload
```

### Retrieval Priority

**`getActiveLorebooksForMessage()` retrieval order:**

```
1. Check message.extra.activeLorebookEntries (persistent)
    ↓ Found
  Return data ✓

    ↓ Not found
2. Check activeLorebooksPerMessage.get(messageIndex) (in-memory)
    ↓ Found
  Return data ✓

    ↓ Not found
3. Return null
```

**Why this order?**

- **Persistent first**: Ensures data from previous sessions is used
- **In-memory fallback**: Handles current session before chat save completes
- **Null return**: Indicates no snapshot available for this message

### Chat File Format

**Example chat file entry with snapshot data:**

```json
{
  "user_name": "User",
  "character_name": "Alice",
  "create_date": "2025-01-15 10:30:00",
  "chat_metadata": {
    "auto_recap": {
      "enabled": true
    }
  },
  "mes": [
    {
      "name": "User",
      "is_user": true,
      "send_date": "2025-01-15 10:30:15",
      "mes": "Hello Alice!",
      "extra": {}
    },
    {
      "name": "Alice",
      "is_user": false,
      "send_date": "2025-01-15 10:30:20",
      "mes": "Hi there! How are you?",
      "extra": {
        "activeLorebookEntries": [
          {
            "comment": "Alice",
            "uid": 123,
            "world": "characters.json",
            "key": ["Alice", "girl"],
            "position": 0,
            "depth": 4,
            "order": 100,
            "role": 0,
            "constant": false,
            "vectorized": false,
            "sticky": 0,
            "strategy": "normal",
            "content": "[Alice: cheerful young woman who loves adventures]"
          }
        ],
        "inactiveLorebookEntries": [
          {
            "comment": "Bob",
            "uid": 124,
            "world": "characters.json",
            "key": ["Bob", "man"],
            "position": 0,
            "depth": 4,
            "order": 100,
            "role": 0,
            "constant": false,
            "vectorized": false,
            "sticky": 0,
            "strategy": "normal",
            "content": "[Bob: Alice's brother]"
          }
        ]
      }
    }
  ]
}
```

## Retrieval Interface

### getActiveLorebooksForMessage()

**Purpose:** Public API for retrieving active entries

**Usage Locations:**

File | Line | Purpose
-----|------|--------
`lorebookViewer.js` | 63 | Display active entries in modal
Future features | N/A | Checkpoint integration, branching analysis

**Example Usage:**
```javascript
import { getActiveLorebooksForMessage } from './index.js';

function analyzeMessage(messageIndex) {
  const activeEntries = getActiveLorebooksForMessage(messageIndex);

  if (!activeEntries) {
    console.log('No snapshot available');
    return;
  }

  console.log(`Found ${activeEntries.length} active entries:`);
  for (const entry of activeEntries) {
    console.log(`- ${entry.strategy}: ${entry.comment}`);
  }
}
```

### getInactiveLorebooksForMessage()

**Purpose:** Public API for retrieving inactive entries

**Usage Locations:**

File | Line | Purpose
-----|------|--------
`lorebookViewer.js` | 64 | Display inactive entries in modal
Future features | N/A | Complete lorebook state analysis

**Example Usage:**
```javascript
import { getInactiveLorebooksForMessage } from './index.js';

function getCompleteSnapshot(messageIndex) {
  const active = getActiveLorebooksForMessage(messageIndex);
  const inactive = getInactiveLorebooksForMessage(messageIndex);

  return {
    active: active || [],
    inactive: inactive || [],
    total: (active?.length || 0) + (inactive?.length || 0)
  };
}
```

### clearActiveLorebooksData()

**Purpose:** Clear in-memory tracking state

**Usage Locations:**

File | Line | Purpose
-----|------|--------
`memoryCore.js` | (Potential) | Clear memory on chat clear
Future features | N/A | Manual cache clearing

**Example Usage:**
```javascript
import { clearActiveLorebooksData } from './index.js';

function resetTrackingState() {
  clearActiveLorebooksData();
  console.log('Tracking state cleared');
}
```

## Integration with Lorebook System

### SillyTavern Lorebook Loading

**Source:** `index.js:410` (`loadWorldInfo()` import from ST)

**Function:** `loadWorldInfo(worldName: string): Promise<WorldInfo>`

**Returns:**
```typescript
interface WorldInfo {
  entries: Record<string, LorebookEntry> | Array<LorebookEntry>;
  // ... other lorebook metadata
}
```

**Usage in Feature:**
```javascript
// index.js:400-439
async function getAllLorebookEntries(mergedEntries) {
  const uniqueWorldNames = new Set(mergedEntries.map(e => e.world));

  for (const worldName of uniqueWorldNames) {
    const worldData = await loadWorldInfo(worldName);

    if (!worldData?.entries) {
      continue;
    }

    for (const entry of Object.values(worldData.entries)) {
      // Process entry
    }
  }
}
```

**Entry Structure (from SillyTavern):**

SillyTavern stores entries as:
- **Object:** `{[uid]: entry, ...}` (keyed by UID)
- **OR Array:** `[entry, ...]`

Feature handles both via `Object.values()` which works for both structures.

### World Name Extraction

**Source:** `index.js:404`

```javascript
const uniqueWorldNames = new Set(mergedEntries.map(e => e.world));
```

**How `entry.world` is populated:**

When SillyTavern fires `WORLD_INFO_ACTIVATED`, each entry includes:
```javascript
{
  uid: 123,
  comment: 'Alice',
  world: 'characters.json',  // ← Lorebook filename
  // ...
}
```

The `world` field identifies which lorebook file the entry came from. This allows the feature to:
1. Determine which lorebooks are currently active
2. Load those lorebooks to get ALL entries
3. Create complete snapshot with active/inactive split

### Multiple Lorebook Support

**Scenario:** Chat has multiple attached lorebooks

**Example:**
```javascript
mergedEntries = [
  {uid: 1, world: 'characters.json', comment: 'Alice', ...},
  {uid: 5, world: 'characters.json', comment: 'Bob', ...},
  {uid: 12, world: 'locations.json', comment: 'Tavern', ...},
  {uid: 20, world: 'world.json', comment: 'Setting', ...}
]
```

**Unique world extraction:**
```javascript
uniqueWorldNames = new Set(['characters.json', 'locations.json', 'world.json'])
```

**Loading process:**
```
Load 'characters.json' → Get 50 entries
Load 'locations.json' → Get 30 entries
Load 'world.json' → Get 10 entries
    ↓
allLorebookEntries = [90 total entries]
```

**Active/Inactive split:**
```
Active UIDs: {1, 5, 12, 20}
    ↓
Active: 4 entries (from 3 different lorebooks)
Inactive: 86 entries (from 3 different lorebooks)
```

## UI Integration

### Lorebook Viewer Button

**Source:** `lorebookViewer.js:10-25`

**Button HTML:**
```html
<div title="View active lorebook entries"
     class="mes_button lorebook-viewer-button fa-solid fa-book-atlas"
     tabindex="0">
</div>
```

**Insertion Point:**

Button inserted after scene break button in message template:
```javascript
// lorebookViewer.js:16-18
const sceneBreakButton = $(`${selectorsSillyTavern.message.template} ... .auto_recap_scene_break_button`);
sceneBreakButton.after(html);
```

**Visual Representation:**
```
[Message Content]
[Scene Break Button] [Lorebook Viewer Button] [Other Buttons...]
```

### Button Click Handler

**Source:** `lorebookViewer.js:27-37`

```javascript
export function bindLorebookViewerButton() {
  $(`div${selectorsSillyTavern.chat.container}`).on("click", `.${LOREBOOK_VIEWER_BUTTON_CLASS}`, function () {
    const message_block = $(this).closest(selectorsSillyTavern.message.block);
    const message_id = Number(message_block.attr("mesid"));

    debug(SUBSYSTEM.LOREBOOK,`[Auto-Recap:LorebookViewer] Clicked for message ${message_id}`);
    showLorebookEntriesModal(message_id);
  });
}
```

**Flow:**
```
User clicks book icon
    ↓
Event handler extracts message ID from DOM
    ↓
showLorebookEntriesModal(messageId)
    ↓
getActiveLorebooksForMessage(messageId)
getInactiveLorebooksForMessage(messageId)
    ↓
Build modal HTML
    ↓
Display via ctx.callPopup()
```

### Modal Display

**Source:** `lorebookViewer.js:61-191`

**Structure:**
```
┌─────────────────────────────────────┐
│ Lorebook Snapshot - Message #52     │
├─────────────────────────────────────┤
│ ✓ Active Entries (3)                │
│ (🔵 1 constant, 🟢 2 normal)        │
│ ┌─────────────────────────────────┐ │
│ │ 🔵 1. World Setting             │ │
│ │   World: world.json             │ │
│ │   Keys: (no keys)               │ │
│ │   Position: ↑Char               │ │
│ │   [Content preview...]          │ │
│ ├─────────────────────────────────┤ │
│ │ 🟢 2. Alice                     │ │
│ │   World: characters.json        │ │
│ │   Keys: Alice, girl             │ │
│ │   Position: ↑Char               │ │
│ │   Depth: 4, Order: 100          │ │
│ │   [Content preview...]          │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ ○ Inactive Entries (47)             │
│ ┌─────────────────────────────────┐ │
│ │ 🟢 1. Bob                       │ │
│ │ 🟢 2. Carol                     │ │
│ │ ... (45 more)                   │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│              [Close]                │
└─────────────────────────────────────┘
```

### Scene Break Lorebook Icon

**Source:** `lorebookViewer.js:193-206`

**Purpose:** Add lorebook icon to scene break markers

**HTML:**
```html
<i class="fa-solid fa-book-atlas scene-lorebook-viewer"
   data-message-index="52"
   title="View active lorebook entries"
   style="cursor:pointer; margin-left:0.5em;">
</i>
```

**Binding:**
```javascript
export function bindSceneBreakLorebookIcons() {
  $(`div${selectorsSillyTavern.chat.container}`).on("click", ".scene-lorebook-viewer", function (e) {
    e.stopPropagation();
    const messageIndex = Number($(this).attr("data-message-index"));
    showLorebookEntriesModal(messageIndex);
  });
}
```

**Visual:**
```
╔═══════════════════════════════════╗
║ Scene Break: "Tavern Arrival" 📖 ║
╚═══════════════════════════════════╝
                              ↑
                         Lorebook icon
```

## Memory Cleanup

### clear_memory() Integration

**Source:** `memoryCore.js:234-240`

**Trigger:** User clicks "Clear All Memories" button

**Flow:**
```
memoryCore.js:clear_memory()
    ↓
For each message in chat:
    ↓
  Delete message.extra.auto_recap.* (recap data)
  Delete message.extra.activeLorebookEntries
  Delete message.extra.inactiveLorebookEntries
    ↓
Snapshot data removed from all messages
```

**Code:**
```javascript
// memoryCore.js:234-240
if (message.extra?.activeLorebookEntries) {
  delete message.extra.activeLorebookEntries;
}

if (message.extra?.inactiveLorebookEntries) {
  delete message.extra.inactiveLorebookEntries;
}
```

**Effect:**

- **Persistent data**: Deleted from `message.extra`
- **In-memory Maps**: NOT affected (remain populated until next chat load or manual clear)
- **Sticky tracking**: NOT affected (continues tracking sticky entries)

**Full Memory Clear:**

For complete cleanup, call both:
```javascript
clear_memory();  // Deletes persistent data
clearActiveLorebooksData();  // Clears in-memory Maps
```

### Chat Switch Cleanup

**Source:** `index.js:608-613`

**Automatic cleanup on `CHAT_CHANGED` event:**

```javascript
eventSource.on(event_types.CHAT_CHANGED, () => {
  debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Chat changed, clearing sticky entry state');
  activeStickyEntries.clear();
  currentGenerationType = null;
  targetMessageIndex = null;
});
```

**What's cleared:**

- ✅ `activeStickyEntries` Map (sticky tracking is chat-specific)
- ✅ `currentGenerationType` (generation state reset)
- ✅ `targetMessageIndex` (message index reset)

**What's NOT cleared:**

- ❌ `activeLorebooksPerMessage` Map (will be replaced when new chat loads)
- ❌ Persistent `message.extra` data (belongs to chat files)

## Error Handling

### Missing Message Guard

**Locations:**
- `persistToMessage()` - `index.js:446`
- `persistInactiveToMessage()` - `index.js:467`

**Pattern:**
```javascript
function persistToMessage(messageIndex, entries) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  if (!message) {
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Cannot persist: message ${messageIndex} not found`);
    return;  // Early return, no error thrown
  }

  // Continue with persistence
}
```

**Scenario:** Message index calculated incorrectly or chat array modified during processing

**Behavior:** Silent failure with debug log, no exception thrown

### Missing Event Types Guard

**Location:** `installWorldInfoActivationLogger()` - `index.js:492-495`

**Pattern:**
```javascript
if (!eventSource || !event_types?.WORLD_INFO_ACTIVATED || !event_types?.GENERATION_STARTED) {
  debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Unable to install tracker (missing eventSource or event types)');
  return;  // Early return, no installation
}
```

**Scenario:** SillyTavern version too old or event system changed

**Behavior:** Feature disabled, no exception thrown, extension continues loading

### Missing Lorebook Guard

**Location:** `getAllLorebookEntries()` - `index.js:412-415`

**Pattern:**
```javascript
const worldData = await loadWorldInfo(worldName);

if (!worldData?.entries) {
  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Lorebook "${worldName}" has no entries`);
  continue;  // Skip this lorebook
}
```

**Scenario:** Lorebook file deleted or corrupted

**Behavior:** Skip missing lorebook, continue with others, partial snapshot created

### Null Return Handling

**Functions:**
- `getActiveLorebooksForMessage()` - Returns `null` if no data
- `getInactiveLorebooksForMessage()` - Returns `null` if no data

**Calling Code Must Handle:**
```javascript
// lorebookViewer.js:66
if ((!activeEntries || activeEntries.length === 0) && (!inactiveEntries || inactiveEntries.length === 0)) {
  // Show "no data" modal
  return;
}
```

**Best Practice:**

Always check for `null` before iterating:
```javascript
const active = getActiveLorebooksForMessage(index);
if (active && active.length > 0) {
  for (const entry of active) {
    // Process entry
  }
}
```

## Testing and Validation

### Manual Testing Checklist

**Test** | **Steps** | **Expected Result**
---------|-----------|--------------------
Basic Snapshot | 1. Send message<br>2. Click lorebook icon | Modal shows active/inactive entries
Sticky Tracking | 1. Activate sticky=3 entry<br>2. Send 3 messages<br>3. Check each snapshot | Entry active for 3 messages, then inactive
Constant Entry | 1. Enable constant entry<br>2. Send multiple messages<br>3. Check snapshots | Entry in every snapshot
Swipe Handling | 1. Send message<br>2. Swipe response<br>3. Check snapshot | Snapshot at correct index (last message)
Multiple Lorebooks | 1. Attach 2+ lorebooks<br>2. Send message<br>3. View snapshot | Entries from all lorebooks captured
Chat Switch | 1. Activate sticky entry<br>2. Switch chat<br>3. Switch back<br>4. Check sticky state | Sticky state cleared on switch
Page Reload | 1. Capture snapshot<br>2. Reload page<br>3. View snapshot | Data persists across reload

### Validation Points

**Data Integrity:**
```javascript
// Verify active entries match activation
const activeUIDs = new Set(mergedEntries.map(e => e.uid));
const allUIDs = new Set(allLorebookEntries.map(e => e.uid));
assert(activeUIDs.isSubsetOf(allUIDs), 'All active UIDs must exist in all entries');
```

**Sticky Counter Validity:**
```javascript
// Verify sticky counts are non-negative
for (const [uid, data] of activeStickyEntries.entries()) {
  assert(data.stickyCount >= 0, `Sticky count for ${uid} must be non-negative`);
}
```

**Snapshot Completeness:**
```javascript
// Verify no entries lost in active/inactive split
const activeCount = activeEntriesFromAll.length;
const inactiveCount = inactiveEntries.length;
const totalCount = allLorebookEntries.length;
assert(activeCount + inactiveCount === totalCount, 'Active + inactive must equal total');
```

### Debug Logging

**Key Debug Points:**

```javascript
// index.js:486
debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Installing activation tracker');

// index.js:514
debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Generation started: type=${genType}, targetIndex=${targetMessageIndex}`);

// index.js:524-525
debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Event fired - Chat length: ${chatLength}, Target message: ${messageIndex}, Type: ${currentGenerationType}`);
debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] ${entries.length} newly activated entries`);

// index.js:532
debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] ${stillActive.length} still-active sticky/constant entries`);

// index.js:572
debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Total active entries for message ${messageIndex}: ${mergedEntries.length} (${enhancedEntries.length} new + ${stillActive.length} still-active)`);

// index.js:597
debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Complete snapshot: ${allLorebookEntries.length} total entries (${activeEntriesFromAll.length} active, ${inactiveEntries.length} inactive)`);
```

**Debug Pattern:**

All logs use `[worldinfoactive]` prefix for easy filtering:
```bash
# Filter logs in browser console
> localStorage.setItem('debug', '*');
> // Reload page
> // Look for lines containing "[worldinfoactive]"
```

### Console Inspection

**Access Data in Console:**
```javascript
// Get active entries for message 50
AutoRecap.getActiveLorebooksForMessage(50)

// Get inactive entries
AutoRecap.getInactiveLorebooksForMessage(50)

// Clear tracking data
AutoRecap.clearActiveLorebooksData()
```

**Note:** Functions must be exported to `window.AutoRecap` for console access (currently only `get_settings`, `set_settings`, `default_settings`, `_testMarker` are exported).

---

## Summary

The Active and Inactive Entry Snapshots feature provides a comprehensive historical record of lorebook state for every message, enabling:

- **Complete Transparency**: See exactly which entries were active vs available
- **Sticky Entry Management**: Track entry lifecycle across multiple generations
- **Strategy Detection**: Understand how entries were activated (constant/vectorized/normal)
- **Durable Storage**: Persist data in `message.extra` for long-term analysis
- **UI Inspection**: View snapshots via modal with rich metadata display

The feature integrates seamlessly with SillyTavern's lorebook system using event-based capture and two-tier storage (in-memory + persistent) to ensure data survives page reloads while maintaining performance.

# Core Recapping System - Implementation

## Overview

The core recapping system is the foundational feature of ST-Auto-Recap that generates AI-powered summaries of roleplay chat content. The extension currently implements **scene-based recapping** as its primary recapping mechanism, where scenes (groups of related messages) are summarized as narrative units.

**Important architectural note**: This extension originally supported per-message recapping, but has evolved to focus on scene-based recapping as the primary workflow. The message-level memory system (`message.memory`, `message.include`) remains in the codebase for backwards compatibility and potential future use, but the active recapping features operate at the scene level.

## Purpose & Requirements

### Why Scene-Based Recapping Exists

1. **Context Preservation**: Maintains narrative coherence when original chat messages scroll out of LLM context window
2. **Memory Management**: Provides structured, token-efficient summaries that can be injected back into prompts
3. **Narrative Continuity**: Captures key events, character dynamics, and story beats for long roleplay sessions
4. **Entity Extraction**: Automatically extracts characters, locations, items, and other entities into lorebook entries
5. **Flexible Context**: Supports different memory injection strategies (short-term, scene-based, running narrative)

### Key Use Cases

- Long-form roleplay sessions that exceed model context limits
- Multi-scene narratives requiring continuity across scenes
- Character relationship tracking over time
- World-building with automatic lorebook population
- Story progression tracking with pending threads and objectives

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         User Interface                            │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │Scene Break │  │Auto Detection│  │Manual Scene Break Button│  │
│  │   Marker   │  │  Triggering  │  │     (per message)       │  │
│  └────┬───────┘  └──────┬───────┘  └───────────┬─────────────┘  │
└────────┼──────────────────┼──────────────────────┼────────────────┘
         │                  │                      │
         └──────────────────┴──────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  eventHandlers │
                    │  ┌──────────┐  │
                    │  │char_msg  │  │
                    │  │chat_chg  │  │
                    │  └──────────┘  │
                    └───────┬────────┘
                            │
                ┌───────────▼────────────┐
                │   sceneBreak.js        │
                │ ┌────────────────────┐ │
                │ │toggleSceneBreak()  │ │
                │ │generateSceneRecap()│ │
                │ └────────┬───────────┘ │
                └──────────┼──────────────┘
                           │
           ┌───────────────▼───────────────┐
           │      operationQueue.js        │
           │  ┌─────────────────────────┐  │
           │  │enqueueOperation()       │  │
           │  │ - Type: GENERATE_SCENE  │  │
           │  │ - Priority: 20          │  │
           │  │ - Metadata: scene_index │  │
           │  └───────────┬─────────────┘  │
           └──────────────┼─────────────────┘
                          │
          ┌───────────────▼────────────────┐
          │    operationHandlers.js        │
          │ ┌───────────────────────────┐  │
          │ │GENERATE_SCENE_RECAP       │  │
          │ │  handler                  │  │
          │ └───────────┬───────────────┘  │
          └─────────────┼───────────────────┘
                        │
      ┌─────────────────┼─────────────────┐
      │                 │                 │
┌─────▼──────┐   ┌──────▼───────┐  ┌─────▼──────┐
│ Collect    │   │Format Prompt │  │Get Active  │
│ Scene      │   │with Template │  │Lorebooks   │
│ Messages   │   │& Macros      │  │(optional)  │
└─────┬──────┘   └──────┬───────┘  └─────┬──────┘
      └─────────────────┼─────────────────┘
                        │
                ┌───────▼────────┐
                │  llmClient.js  │
                │ ┌────────────┐ │
                │ │sendLLM     │ │
                │ │Request()   │ │
                │ └─────┬──────┘ │
                └───────┼────────┘
                        │
        ┌───────────────▼───────────────┐
        │ SillyTavern ConnectionManager │
        │   (via profile selection)     │
        └───────────────┬───────────────┘
                        │
                  ┌─────▼──────┐
                  │ LLM API    │
                  │ (OpenAI,   │
                  │  Claude,   │
                  │  etc.)     │
                  └─────┬──────┘
                        │
             ┌──────────▼───────────┐
             │ JSON Response Parse  │
             │  {scene_name, recap, │
             │   atmosphere,        │
             │   emotional_beats,   │
             │   setting_lore: [...]}│
             └──────────┬───────────┘
                        │
      ┌─────────────────┼─────────────────┐
      │                 │                 │
┌─────▼──────┐   ┌──────▼───────┐  ┌─────▼──────────┐
│Store Recap │   │Process       │  │Queue Lorebook  │
│in message  │   │setting_lore  │  │Entry Operations│
│.scene_recap│   │Entities      │  │(conditional)   │
│_memory     │   │              │  │                │
└─────┬──────┘   └──────┬───────┘  └─────┬──────────┘
      └─────────────────┼─────────────────┘
                        │
                ┌───────▼────────┐
                │ memoryCore.js  │
                │ ┌────────────┐ │
                │ │Injection   │ │
                │ │Logic       │ │
                │ └────────────┘ │
                └────────────────┘
```

## Source Files

| File | Purpose | Key Functions | Lines |
|------|---------|---------------|-------|
| `sceneBreak.js` | Scene break UI & scene recap generation | `toggleSceneBreak()`, `generateSceneRecap()`, `collectSceneObjects()`, `getActiveLorebooksAtPosition()` | 1080 |
| `operationHandlers.js` | Queue operation handlers | `registerOperationHandler(GENERATE_SCENE_RECAP, ...)` | 903 |
| `operationQueue.js` | Async operation queue management | `enqueueOperation()`, `processQueue()`, `getAbortSignal()` | ~800 |
| `llmClient.js` | LLM request wrapper for ConnectionManager | `sendLLMRequest()`, `getConnectionManagerProfileId()` | 250 |
| `defaultPrompts.js` | Prompt templates | `scene_recap_prompt`, `default_prompt` (legacy) | 1080 |
| `memoryCore.js` | Memory injection into LLM prompts | `update_message_inclusion_flags()`, `get_memory()`, `concatenate_recaps()` | ~600 |
| `eventHandlers.js` | SillyTavern event integration | `handleCharMessage()`, `handleChatChanged()` | 493 |
| `queueIntegration.js` | Queue operation wrappers | `queueGenerateSceneRecap()`, `queueCombineSceneWithRunning()` | ~400 |
| `messageData.js` | Message metadata management | `get_data()`, `set_data()` | ~200 |
| `recapValidation.js` | Recap format validation | `validate_recap()` | ~200 |

## Key Functions

### `generateSceneRecap(options)`

**File**: `sceneBreak.js:700-900`

**Purpose**: Orchestrates scene recap generation by collecting scene content, calling the LLM, and processing the results.

**Parameters**:
- `options` (object):
  - `index` (number): Message index where scene ends (scene break marker position)
  - `get_message_div` (function): Returns jQuery element for message
  - `getContext` (function): Returns SillyTavern context object
  - `get_data` (function): Retrieves message metadata
  - `set_data` (function): Stores message metadata
  - `saveChatDebounced` (function): Saves chat with debouncing
  - `skipQueue` (boolean): If true, execute immediately; if false, queue the operation
  - `signal` (AbortSignal, optional): Abort signal for cancellation

**Returns**: `Promise<{recap: string, lorebookOpIds: string[]}>`

**Throws**:
- `Error` if no chat is loaded
- `Error` if scene has no messages
- `Error` if LLM request fails

**Called By**:
- `operationHandlers.js:357` - GENERATE_SCENE_RECAP operation handler
- `sceneBreak.js:233` - Generate button click handler
- `autoSceneBreakDetection.js` - Auto scene break detection success

**Calls**:
- `findSceneBoundaries()` - Determines scene start/end indices
- `collectSceneObjects()` - Extracts messages to summarize
- `getActiveLorebooksAtPosition()` - Retrieves active lorebook entries
- `prepareScenePrompt()` - Formats prompt with macros
- `sendLLMRequest()` - Makes LLM API call
- `processSceneRecapResponse()` - Parses JSON response and queues lorebook operations

**Execution Flow**:
1. Check if operation should be queued (skipQueue=false) → enqueue and return
2. Find scene boundaries (startIdx to index)
3. Collect scene messages based on message type filter (user/character/both)
4. Get active lorebook entries at scene position (if enabled)
5. Format prompt template with scene content and active lorebooks
6. Check abort signal before LLM call
7. Call `sendLLMRequest()` with connection profile and preset
8. Parse JSON response: `{scene_name, recap, atmosphere, emotional_beats, setting_lore}`
9. Store recap in message metadata (`scene_recap_memory`, `scene_recap_versions`)
10. Process `setting_lore` array → queue lorebook entry operations
11. Return recap text and lorebook operation IDs

### `sendLLMRequest(profileId, prompt, operationType, options)`

**File**: `llmClient.js:10-231`

**Purpose**: Sends LLM requests through SillyTavern's ConnectionManager with profile-based configuration.

**Parameters**:
- `profileId` (string): ConnectionManager profile UUID (required, no empty string allowed)
- `prompt` (string|array): Prompt text or messages array
- `operationType` (string): Operation type from `OperationType` enum (e.g., 'GENERATE_SCENE_RECAP')
- `options` (object):
  - `preset` (string): Completion preset name (required; empty string means use active preset)
  - `prefill` (string): Assistant prefill text
  - `includePreset` (boolean): Whether to load preset prompts (system/assistant messages)
  - `stream` (boolean): Enable streaming
  - `signal` (AbortSignal): Cancellation signal
  - `trimSentences` (boolean): Trim to complete sentences (default true)

**Returns**: `Promise<string>` - The generated text response

**Throws**:
- `Error` if profileId is empty or missing
- `Error` if preset is undefined/null
- `Error` if preset not found
- `Error` if preset has no max_tokens configured
- `Error` if prompt exceeds context size
- `Error` if ConnectionManager request fails

**Called By**:
- `sceneBreak.js` (via generateSceneRecap) - Scene recap generation
- `runningSceneRecap.js` - Running scene recap generation
- `recapValidation.js` - Recap validation
- `autoSceneBreakDetection.js` - Scene break detection
- `recapToLorebookProcessor.js` - Lorebook entry lookup/deduplicate
- `lorebookEntryMerger.js` - Lorebook entry merging

**Calls**:
- `ctx.extensionSettings.connectionManager.profiles.find()` - Retrieve profile configuration
- `getPresetManager().getCompletionPresetByName()` - Load preset parameters
- `count_tokens()` - Token size validation
- `loadPresetPrompts()` - Load preset messages (if includePreset=true)
- `injectMetadataIntoChatArray()` - Add operation metadata
- `ctx.ConnectionManagerRequestService.sendRequest()` - Make LLM API call
- `trimToEndSentence()` - Post-process response

**Test Override Support**:
```javascript
// Tests can override LLM responses
globalThis.__TEST_RECAP_TEXT_RESPONSE = 'Mock recap text';
```

### `enqueueOperation(type, params, options)`

**File**: `operationQueue.js:~200-250`

**Purpose**: Adds an async operation to the persistent queue for sequential execution.

**Parameters**:
- `type` (string): Operation type from `OperationType` enum
- `params` (object): Operation-specific parameters
- `options` (object):
  - `priority` (number): Priority (higher = earlier execution, default 10)
  - `queueVersion` (number): Queue version for grouping
  - `metadata` (object): Additional metadata for debugging
  - `dependencies` (string[]): Operation IDs that must complete first

**Returns**: `Promise<string>` - Operation ID (UUID)

**Throws**: `Error` if queue fails to persist

**Called By**:
- `queueIntegration.js` - All queue integration wrappers
- `operationHandlers.js` - Handlers queueing follow-up operations
- `sceneBreak.js` - Manual button clicks
- `autoSceneBreakDetection.js` - Auto-detected scene breaks

**Calls**:
- `saveQueueState()` - Persists queue to lorebook entry
- `processQueue()` - Triggers queue processing (debounced)

**Storage**: Queue state persisted in lorebook entry `Auto-Recap Operations Queue` (disabled, metadata-only)

### `registerOperationHandler(type, handler)`

**File**: `operationQueue.js:~100-150`

**Purpose**: Registers a handler function for a specific operation type.

**Parameters**:
- `type` (string): Operation type from `OperationType` enum
- `handler` (async function): Handler function `(operation) => Promise<result>`

**Called By**: `operationHandlers.js:registerAllOperationHandlers()`

**Handler Signature**:
```javascript
async function handler(operation) {
  // operation.id - unique ID
  // operation.type - operation type
  // operation.params - operation parameters
  // operation.metadata - additional metadata
  // operation.status - 'pending' | 'in_progress' | 'completed' | 'failed'

  const signal = getAbortSignal(operation);
  // ... perform work ...
  throwIfAborted(signal, 'OPERATION_TYPE', 'phase');
  return { /* result object */ };
}
```

### `toggleSceneBreak(index, ...deps)`

**File**: `sceneBreak.js:97-152`

**Purpose**: Toggles scene break marker visibility and clears auto-detection flags when hiding.

**Parameters**:
- `index` (number): Message index
- `get_message_div` (function): jQuery element retrieval
- `getContext` (function): Context retrieval
- `set_data` (function): Metadata storage
- `get_data` (function): Metadata retrieval
- `saveChatDebounced` (function): Debounced save

**Side Effects**:
- Creates scene break marker if none exists
- Toggles visibility flag
- Clears `auto_scene_break_checked` flags in range when hiding scene
- Updates all scene break UI
- Triggers auto-hide logic
- Refreshes scene navigator bar

### `collectSceneObjects(startIdx, endIdx, chat)`

**File**: `sceneBreak.js:637-659`

**Purpose**: Extracts scene messages based on message type filter.

**Parameters**:
- `startIdx` (number): Scene start index
- `endIdx` (number): Scene end index (inclusive)
- `chat` (array): Chat message array

**Returns**: `Array<{type: 'message', index: number, name: string, is_user: boolean, text: string}>`

**Filters**: Based on `scene_recap_message_types` setting ('user'|'character'|'both')

### `getActiveLorebooksAtPosition(endIdx, ctx, get_data)`

**File**: `sceneBreak.js:724-830`

**Purpose**: Retrieves active lorebook entries at a specific scene position for context injection.

**Parameters**:
- `endIdx` (number): Scene end index
- `ctx` (object): SillyTavern context
- `get_data` (function): Metadata retrieval

**Returns**: `Promise<{entries: Array, metadata: object}>`
- `entries`: Array of enhanced lorebook entry objects with `uid`, `comment`, `content`, `keys`, `world`, `strategy`
- `metadata`: Scene boundaries, entry count, filtering details

**Execution**:
1. Check if `scene_recap_include_active_setting_lore` setting enabled
2. Find scene boundaries (walk back to previous scene break)
3. Extract scene messages
4. Call `checkWorldInfo(sceneMessages, maxContext)` - ST's lorebook activation
5. Filter results:
   - Remove registry entries (`_registry_*`, tag `auto_lorebooks_registry`)
   - Remove queue entry (`Auto-Recap Operations Queue`)
   - If `suppress_other_lorebooks` enabled, keep only chat lorebook entries
6. Enhance entries with strategy metadata (constant/vectorized/normal)
7. Return entries with metadata

**Integration**: Entries formatted with `formatSettingLoreForPrompt()` and injected into `{{active_setting_lore}}` macro

## Data Structures

### Scene Recap Storage (Message Metadata)

Scene recaps are stored in message metadata using `set_data(message, key, value)`:

```javascript
// Scene break marker
message.extra.scene_break = true;                    // Scene break exists
message.extra.scene_break_visible = true;            // Visible in UI
message.extra.scene_break_collapsed = false;         // Recap box collapsed

// Scene recap content (versioned)
message.extra.scene_recap_memory = "Current recap"; // Active recap text
message.extra.scene_recap_versions = [              // All versions
  "Version 1 text",
  "Version 2 text (current)",
  "Version 3 text"
];
message.extra.scene_recap_current_index = 1;        // Active version (0-indexed)

// Legacy fields (backward compatibility)
message.extra.scene_break_recap = "Current recap"; // Same as scene_recap_memory
message.extra.scene_break_name = "Scene Title";    // Deprecated (now in recap JSON)

// Metadata
message.extra.scene_recap_hash = "abc123";         // Content hash for change detection
message.extra.scene_recap_metadata = {             // Additional metadata
  lorebookEntryCount: 5,
  generatedAt: 1234567890
};

// Auto-detection tracking
message.extra.auto_scene_break_checked = true;     // Auto-detection processed
```

### Scene Recap JSON Response

LLM returns structured JSON matching `scene_recap_prompt` template:

```javascript
{
  "scene_name": "Brief descriptive title",
  "recap": "# Running Narrative\n\n## Current Situation\n- bullet points\n\n## Key Developments\n- bullet points\n\n## Tone & Style\n- bullet points\n\n## Pending Threads\n- bullet points",
  "atmosphere": "Brief sensory/mood context (time, lighting, weather, tension)",
  "emotional_beats": "Character: emotion with trigger → consequence; NextChar: ...",
  "setting_lore": [
    {
      "type": "character",
      "name": "Entity Name",
      "content": "- Identity: Type — Canonical Name\n- Synopsis: ...\n- Attributes: ...\n- Psychology: ...\n- Relationships: ...",
      "keywords": ["keyword1", "keyword2"],
      "secondaryKeys": ["and-term"],
      "uid": "12345"  // Optional: existing entity UID for merge
    }
  ]
}
```

### Operation Metadata

Operation queue entries:

```javascript
{
  id: "uuid-v4",
  type: "GENERATE_SCENE_RECAP",
  status: "pending",  // 'pending' | 'in_progress' | 'completed' | 'failed'
  priority: 20,
  params: {
    index: 42  // Scene break message index
  },
  metadata: {
    scene_index: 42,
    triggered_by: "auto_scene_break_detection",
    hasPrefill: false,
    includePresetPrompts: false
  },
  queueVersion: 1,
  dependencies: [],  // Operation IDs that must complete first
  result: null,      // Populated after completion
  error: null,       // Populated on failure
  createdAt: 1234567890,
  startedAt: null,
  completedAt: null
}
```

## Integration Points

### Events Listened To

- **`CHARACTER_MESSAGE_RENDERED`** (`eventHandlers.js:374`) - Triggers auto scene break detection after character responds
- **`CHAT_CHANGED`** (`eventHandlers.js:388, 403`) - Reloads queue from new chat's lorebook, renders scene breaks
- **`MESSAGE_DELETED`** (`eventHandlers.js:377`) - Refreshes memory and cleans up invalid running recaps
- **`MESSAGE_SWIPED`** (`eventHandlers.js:387`) - Clears memory for new swipes, refreshes memory injection
- **`MESSAGE_SENT`** (`eventHandlers.js:397`) - Logs scene injection for debugging
- **`MORE_MESSAGES_LOADED`** (`eventHandlers.js:396, 398`) - Refreshes memory, re-renders scene breaks

### Events Emitted

- **None directly** - The recapping system is event-driven but doesn't emit custom events. It responds to ST events and updates state via message metadata and UI rendering.

### Dependencies on Other Features

**Operation Queue**:
- All scene recap generation flows through the operation queue
- Queue provides cancellation support via AbortSignal
- Queue persistence ensures operations survive page reloads
- Queue blocking prevents chat during recap generation (when enabled)

**Message Data System**:
- Recaps stored in `message.extra.scene_recap_memory` via `set_data()`
- Scene break flags stored via `set_data()`
- Versioning system tracks all recap iterations

**Settings & Profiles**:
- Connection profile determines which LLM API to use
- Completion preset controls generation parameters (temperature, max_tokens, etc.)
- Scene recap settings control message filtering, history count, active lorebook inclusion

**Lorebook Integration**:
- `setting_lore` entities automatically queued for lorebook processing
- Active lorebook entries injected into scene recap prompt context
- Lorebook suppression filters non-chat lorebooks

**Auto Scene Break Detection**:
- Automatically detects scene transitions based on content analysis
- Queues `DETECT_SCENE_BREAK` operations
- Places scene break markers and queues scene recap generation

**Memory Injection**:
- Scene recaps injected into LLM prompts via `memoryCore.js`
- Injection position controlled by settings (depth, role, position)
- Supports short-term, scene-based, and running narrative modes

### Modules That Use This Feature

- **`memoryCore.js`** - Injects scene recaps into LLM prompts
- **`runningSceneRecap.js`** - Combines scene recaps into running narrative
- **`autoSceneBreakDetection.js`** - Triggers scene recap generation after detecting breaks
- **`sceneNavigator.js`** - Displays scene break navigation UI
- **`lorebookManager.js`** - Processes extracted `setting_lore` entities
- **`recapToLorebookProcessor.js`** - Handles lorebook entry pipeline for entities
- **`profileManager.js`** - Provides connection profile resolution for LLM calls

## Settings & Configuration

| Setting | Key | Type | Default | Purpose |
|---------|-----|------|---------|---------|
| Scene Recap Prompt | `scene_recap_prompt` | string | (template) | Prompt template for scene recap generation with macros |
| Scene Recap Prefill | `scene_recap_prefill` | string | '' | Assistant prefill text for recap generation |
| Scene Recap Connection Profile | `scene_recap_connection_profile` | string (UUID) | '' | ConnectionManager profile UUID for recap API calls |
| Scene Recap Completion Preset | `scene_recap_completion_preset` | string | '' | Completion preset name (empty = use active) |
| Scene Recap Include Preset Prompts | `scene_recap_include_preset_prompts` | boolean | false | Load preset system/assistant messages |
| Scene Recap Message Types | `scene_recap_message_types` | string | 'both' | Which messages to include ('user'/'character'/'both') |
| Scene Recap History Count | `scene_recap_history_count` | number | 1 | How many previous scenes to include (currently only 1 supported) |
| Scene Recap Include Active Setting Lore | `scene_recap_include_active_setting_lore` | boolean | true | Include active lorebook entries in prompt context |
| Suppress Other Lorebooks | `suppress_other_lorebooks` | boolean | true | Filter to only chat lorebook entries (exclude global/character lorebooks) |
| Scene Recap Default Collapsed | `scene_recap_default_collapsed` | boolean | true | Default collapsed state for new scene breaks |
| Auto Scene Break Generate Recap | `auto_scene_break_generate_recap` | boolean | true | Automatically generate recap after auto-detecting scene break |
| Running Scene Recap Auto Generate | `running_scene_recap_auto_generate` | boolean | true | Automatically generate running recap after scene recap completes |

## Storage Locations

### Message Data

Scene recap data stored in `message.extra` via `set_data()`:

- `scene_break` - Boolean: scene break marker exists
- `scene_break_visible` - Boolean: scene break visible in UI
- `scene_break_collapsed` - Boolean: recap box collapsed state
- `scene_recap_memory` - String: current active recap text
- `scene_recap_versions` - Array<string>: all recap versions
- `scene_recap_current_index` - Number: active version index (0-indexed)
- `scene_recap_hash` - String: content hash for change detection
- `scene_recap_metadata` - Object: additional metadata (lorebook count, timestamp)
- `scene_break_recap` - String: legacy field (same as scene_recap_memory)
- `scene_break_name` - String: legacy field (deprecated, now in recap JSON)
- `auto_scene_break_checked` - Boolean: auto-detection processed flag

### Chat Metadata

No chat-level metadata for scene recapping (scene recaps are per-message only).

Running scene recap uses chat metadata - see `RUNNING_SCENE_RECAP.md`.

### Extension Settings

All scene recap settings stored in `extension_settings.auto_recap`:

```javascript
extension_settings.auto_recap = {
  scene_recap_prompt: "...",
  scene_recap_prefill: "",
  scene_recap_connection_profile: "uuid",
  scene_recap_completion_preset: "",
  scene_recap_include_preset_prompts: false,
  scene_recap_message_types: "both",
  scene_recap_history_count: 1,
  scene_recap_include_active_setting_lore: true,
  suppress_other_lorebooks: true,
  scene_recap_default_collapsed: true,
  auto_scene_break_generate_recap: true,
  running_scene_recap_auto_generate: true,
  // ... other settings
};
```

### Lorebook

**Operation Queue Storage**:
- Entry name: `Auto-Recap Operations Queue`
- Purpose: Persists queue state across page reloads
- Properties: Disabled, metadata storage only, not injected into prompts

**Extracted Entities**:
- Scene recap `setting_lore` entities queued for lorebook processing
- See `recapToLorebookProcessor.js` and lorebook integration docs

## UI Components

### Scene Break Marker

**Selector**: `.auto_recap_scene_break_div`

**Location**: Inserted above message with `mesid` attribute matching scene break index

**Components**:
- **Collapse/Expand Button**: `.scene-collapse-toggle` - Toggles recap box visibility
- **Scene Start Link**: `.scene-start-link` - Hyperlink to scene start message (e.g., "#42")
- **Preview Icon**: `.scene-preview-recap` - Shows scene content preview in popup
- **Lorebook Icon**: `.scene-lorebook-icon` - Opens lorebook viewer filtered to scene
- **Recap Textarea**: `.scene-recap-box` - Editable recap text with version controls
- **Generate Button**: `.scene-generate-recap` - Triggers recap generation
- **Rollback/Forward Buttons**: `.scene-rollback-recap`, `.scene-rollforward-recap` - Navigate versions
- **Regenerate Running Button**: `.scene-regenerate-running` - Combine scene with running recap
- **Version Indicator**: Displays current version (e.g., "v2/3")

**State Classes**:
- `sceneBreak-visible` - Scene break is visible
- `sceneBreak-hidden` - Scene break is hidden
- `sceneBreak-collapsed` - Recap box is collapsed
- `sceneBreak-selected` - Scene break is selected (visual feedback)

### Scene Break Button (Per Message)

**Selector**: `.auto_recap_scene_break_button`

**Location**: Message button bar (added to message template)

**Tooltip**: "Mark end of scene"

**Icon**: `fa-solid fa-clapperboard`

**Action**: Toggles scene break marker on click

### Event Handlers

**Scene Break Toggle**:
```javascript
// File: sceneBreak.js:88-92
$(`div${selectorsSillyTavern.chat.container}`).on("click", `.${SCENE_BREAK_BUTTON_CLASS}`, function () {
  const message_id = Number($(this).closest(selectorsSillyTavern.message.block).attr("mesid"));
  toggleSceneBreak(message_id, ...deps);
});
```

**Generate Recap Button**:
```javascript
// File: sceneBreak.js:493-496
$sceneBreak.find(selectorsExtension.sceneBreak.generateRecap).off('click').on('click', async function (e) {
  e.stopPropagation();
  await handleGenerateRecapButtonClick(index, chat, message, $sceneBreak, ...deps);
});
```

**Recap Textarea Change**:
```javascript
// File: sceneBreak.js:408-420
$sceneBreak.find(selectorsExtension.sceneBreak.recapBox).on('change blur', function () {
  const updatedVersions = getSceneRecapVersions(message, get_data).slice();
  const idx = getCurrentSceneRecapIndex(message, get_data);
  const newRecap = convertActualNewlinesToLiteral($(this).val());
  updatedVersions[idx] = newRecap;
  setSceneRecapVersions(message, set_data, updatedVersions);
  set_data(message, SCENE_BREAK_RECAP_KEY, newRecap);
  set_data(message, SCENE_RECAP_MEMORY_KEY, newRecap);
  set_data(message, SCENE_RECAP_HASH_KEY, computeRecapHash(newRecap));
  saveChatDebounced();
});
```

## Public API

**Exported from `sceneBreak.js`**:
```javascript
export function addSceneBreakButton();
export function bindSceneBreakButton(get_message_div, getContext, set_data, get_data, saveChatDebounced);
export function toggleSceneBreak(index, get_message_div, getContext, set_data, get_data, saveChatDebounced);
export function generateSceneRecap(options);
export function renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
export function renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
export function collectSceneContent(startIdx, endIdx, mode, ctx, _get_memory);
```

**Exported from `operationQueue.js`**:
```javascript
export function enqueueOperation(type, params, options);
export function registerOperationHandler(type, handler);
export function getAbortSignal(operation);
export function throwIfAborted(signal, operationType, phase);
export function initOperationQueue();
export function reloadQueue();
```

**Exported from `llmClient.js`**:
```javascript
export async function sendLLMRequest(profileId, prompt, operationType, options);
export function getConnectionManagerProfileId(profileName);
export function resolveProfileSettings(profileId);
```

**Exported from `queueIntegration.js`**:
```javascript
export async function queueGenerateSceneRecap(index, options);
export async function queueCombineSceneWithRunning(index, options);
export async function queueDetectSceneBreak(startIndex, endIndex, offset, options);
```

## Execution Flow

See implementation.md and data-flow.md for detailed execution flows.

## Testing Approach

### End-to-End Test Scenario

**Setup**:
1. Start SillyTavern at `http://localhost:8000`
2. Load chat with multiple messages
3. Enable scene recap settings
4. Configure connection profile and completion preset

**Test Steps**:
1. **Place Scene Break Marker**:
   - Click scene break button on message
   - Assert: Scene break div appears above message
   - Assert: Recap box is visible (or collapsed if default)

2. **Generate Scene Recap**:
   - Click "Generate" button
   - Assert: Operation queued toast appears
   - Assert: Queue indicator shows in UI
   - Wait for LLM response (mock or real)
   - Assert: Recap text populated in textarea
   - Assert: Version indicator shows "v1/1"

3. **Verify Storage**:
   - Read message metadata via `get_data(message, 'scene_recap_memory')`
   - Assert: Recap text matches UI display
   - Assert: `scene_recap_versions` array has 1 entry
   - Assert: `scene_recap_current_index` is 0

4. **Edit and Create New Version**:
   - Modify recap text in textarea
   - Blur textarea
   - Click "Generate" button again
   - Wait for completion
   - Assert: Version indicator shows "v2/2"
   - Assert: `scene_recap_versions` array has 2 entries

5. **Navigate Versions**:
   - Click rollback button
   - Assert: Version indicator shows "v1/2"
   - Assert: Recap text reverts to version 1
   - Click rollforward button
   - Assert: Version indicator shows "v2/2"
   - Assert: Recap text shows version 2

6. **Verify Lorebook Processing**:
   - Check if `setting_lore` entities were extracted
   - Assert: Lorebook entries queued (check queue state)
   - Wait for lorebook operations to complete
   - Assert: New lorebook entries created (if new entities)
   - Assert: Existing entries merged (if matching entities)

7. **Verify Memory Injection**:
   - Send a new message (trigger LLM call)
   - Intercept prompt via `CHAT_COMPLETION_PROMPT_READY` event
   - Assert: Scene recap injected into prompt
   - Assert: Injection position matches settings (depth, role)

### Test Overrides

**Mock LLM Response**:
```javascript
// In test setup
globalThis.__TEST_RECAP_TEXT_RESPONSE = JSON.stringify({
  "scene_name": "Test Scene",
  "recap": "## Current Situation\n- Test situation\n\n## Key Developments\n- Test development",
  "atmosphere": "Test atmosphere",
  "emotional_beats": "TestChar: test emotion",
  "setting_lore": []
});
```

## Edge Cases & Error Handling

### Scene Has No Messages

**Scenario**: Scene break placed on first message or immediately after another scene break.

**Behavior**:
- `findSceneBoundaries()` returns `startIdx = endIdx`
- `collectSceneObjects()` returns array with 1 message
- LLM called with single message content
- No error thrown (valid edge case)

### LLM Call Fails

**Scenario**: API returns error, network failure, or invalid response.

**Behavior**:
1. `sendLLMRequest()` throws error
2. Operation handler catches error
3. Operation marked as 'failed' in queue
4. Toast notification: "Failed to generate scene recap"
5. UI remains in "Generate" button state (not loading)
6. Error logged to console with full details
7. Queue continues processing next operation

**User Recovery**: Click "Generate" button again to retry.

### Invalid JSON Response

**Scenario**: LLM returns malformed JSON or text instead of JSON.

**Behavior**:
1. `JSON.parse()` throws SyntaxError
2. Caught in operation handler
3. Error toast: "Invalid recap format"
4. Operation marked as 'failed'
5. Original message content unchanged

**User Recovery**: Adjust prompt template or try different preset.

### Connection Profile Missing

**Scenario**: Setting points to profile UUID that no longer exists.

**Behavior**:
1. `sendLLMRequest()` checks profile existence
2. Throws error: "Connection Manager profile not found: {uuid}"
3. Operation fails immediately (no LLM call attempted)
4. Toast: "Connection profile not found"

**User Recovery**: Configure valid connection profile in settings.

### Completion Preset Missing

**Scenario**: Setting specifies preset that doesn't exist.

**Behavior**:
1. `sendLLMRequest()` attempts to load preset
2. Throws error: "Preset '{name}' not found"
3. Operation fails before LLM call
4. Toast: "Completion preset not found"

**User Recovery**: Configure valid preset or use empty string (active preset).

### Preset Has No Max Tokens

**Scenario**: Preset misconfigured, missing `genamt` or `openai_max_tokens`.

**Behavior**:
1. `sendLLMRequest()` validates preset
2. Throws error: "Preset has no valid max_tokens"
3. Operation fails before LLM call
4. Toast: "Invalid preset configuration"

**User Recovery**: Fix preset configuration in SillyTavern settings.

### Prompt Exceeds Context Size

**Scenario**: Scene content + active lorebooks + prompt template > model context.

**Behavior**:
1. `sendLLMRequest()` counts tokens
2. Throws error: "Prompt {tokens} exceeds available context {available}"
3. Operation fails before LLM call
4. Toast: "Prompt too large for model"

**User Recovery**:
- Reduce `scene_recap_history_count`
- Disable `scene_recap_include_active_setting_lore`
- Split scene into multiple smaller scenes
- Use model with larger context

### Operation Cancelled (AbortSignal)

**Scenario**: User reloads page, changes chat, or operation queue cancelled.

**Behavior**:
1. `throwIfAborted()` checks signal after each async step
2. Throws AbortError
3. Operation marked as 'cancelled'
4. No error toast (expected cancellation)
5. Queue moves to next operation

### Message Deleted During Generation

**Scenario**: User deletes message while recap generation in progress.

**Behavior**:
1. Operation completes normally
2. Attempts to store recap via `set_data()`
3. Message no longer exists in chat array
4. Storage fails silently (no crash)
5. Recap discarded

**Prevention**: Queue blocking mode prevents chat modifications during generation.

### Recap Box Edit During Generation

**Scenario**: User manually edits recap text while generation in progress.

**Behavior**:
1. User edit creates new version
2. Generation completes and tries to store result
3. Generation creates another new version
4. User's version preserved in version history
5. Generated version becomes active

**Prevention**: UI should disable textarea during generation (implementation may vary).

## Debugging Guide

### Enable Debug Logging

```javascript
// In browser console
localStorage.setItem('debug_subsystem_scene', 'true');
localStorage.setItem('debug_subsystem_queue', 'true');
location.reload();
```

**Available Subsystems**:
- `CORE` - Core recapping logic
- `SCENE` - Scene break and scene recap
- `QUEUE` - Operation queue
- `MEMORY` - Memory injection
- `LOREBOOK` - Lorebook integration
- `UI` - UI updates
- `EVENT` - Event handlers

### Common Issues

**Issue**: Scene recap not generating

**Checklist**:
1. Check console for errors
2. Verify connection profile exists: `extension_settings.auto_recap.scene_recap_connection_profile`
3. Verify completion preset exists (or empty string for active)
4. Check queue state: Look for lorebook entry "Auto-Recap Operations Queue"
5. Check if operation is stuck in queue
6. Verify LLM API credentials in ConnectionManager profile

**Issue**: Recap contains wrong content

**Checklist**:
1. Check message type filter: `scene_recap_message_types` setting
2. Verify scene boundaries are correct (check scene start link)
3. Review active lorebook context (if enabled)
4. Inspect final prompt in console (debug logging)
5. Try different completion preset
6. Adjust prompt template

**Issue**: Lorebook entities not extracted

**Checklist**:
1. Verify `setting_lore` array in LLM JSON response
2. Check queue for lorebook operations (should follow scene recap)
3. Verify lorebook integration settings enabled
4. Check console for lorebook processing errors
5. Ensure chat has attached lorebook

**Issue**: Memory not injecting into prompts

**Checklist**:
1. Verify `scene_recap_memory` stored in message metadata
2. Check memory injection settings (depth, role, position)
3. Enable `MEMORY` subsystem debug logging
4. Send test message and check `CHAT_COMPLETION_PROMPT_READY` event
5. Verify `<roleplay_memory>` block in final prompt

## Related Features

- **[Running Scene Recap](../RUNNING_SCENE_RECAP.md)** - Combines scene recaps into running narrative
- **[Auto Scene Break Detection](../AUTO_SCENE_BREAK_DETECTION.md)** - Automatically detects scene transitions
- **[Memory System](../memory-system/)** - Memory injection into LLM prompts
- **[Lorebook Integration](../lorebook-integration/)** - Entity extraction and lorebook management
- **[Operation Queue](../operation-queue/)** - Async operation management
- **[Connection Profiles](../profile-configuration/)** - LLM API configuration

## Code Examples

### Example 1: Basic Scene Recap Generation

```javascript
// Manual scene recap generation
import { generateSceneRecap } from './sceneBreak.js';
import { getContext, get_data, set_data, saveChatDebounced } from './index.js';

const index = 42; // Message index where scene ends

await generateSceneRecap({
  index,
  get_message_div: (idx) => $(`div[mesid="${idx}"]`),
  getContext,
  get_data,
  set_data,
  saveChatDebounced,
  skipQueue: false // Use queue
});
```

### Example 2: Custom Scene Recap Prompt

```javascript
// Modify scene recap prompt in settings
import { set_settings } from './index.js';

const customPrompt = `Extract scene information into JSON format.

Required format:
{
  "scene_name": "Brief title",
  "recap": "## Current Situation\n...",
  "atmosphere": "Brief mood context",
  "emotional_beats": "Character emotional moments",
  "setting_lore": []
}

Scene content:
{{scene_messages}}`;

set_settings('scene_recap_prompt', customPrompt);
```

### Example 3: Queue Scene Recap with Dependencies

```javascript
// Queue scene recap that depends on prior operations
import { queueGenerateSceneRecap } from './queueIntegration.js';

const opId = await queueGenerateSceneRecap(42, {
  priority: 20,
  dependencies: ['uuid-of-prerequisite-operation']
});

console.log('Queued scene recap:', opId);
```

### Example 4: Override LLM Response in Tests

```javascript
// Mock LLM response for testing
globalThis.__TEST_RECAP_TEXT_RESPONSE = JSON.stringify({
  "scene_name": "Test Scene Title",
  "recap": "## Current Situation\n- Test location\n\n## Key Developments\n- Test event",
  "atmosphere": "Morning; bright sunlight; calm mood",
  "emotional_beats": "Alice: determined resolve from prior failure",
  "setting_lore": [
    {
      "type": "character",
      "name": "Alice",
      "content": "- Identity: Character — Alice\n- Attributes: Determined warrior",
      "keywords": ["alice"],
      "secondaryKeys": []
    }
  ]
});

// Now calls to sendLLMRequest will return this mock response
```

### Example 5: Access Scene Recap from Message

```javascript
// Read scene recap from message metadata
import { get_data } from './index.js';

const message = context.chat[42];
const sceneRecap = get_data(message, 'scene_recap_memory');
const versions = get_data(message, 'scene_recap_versions');
const currentIndex = get_data(message, 'scene_recap_current_index');

console.log('Current recap:', sceneRecap);
console.log(`Version ${currentIndex + 1}/${versions.length}`);
```

## Performance Considerations

**LLM Call Latency**:
- Scene recap generation typically takes 5-30 seconds depending on model and scene length
- Larger scenes with more messages increase prompt size and response time
- ConnectionManager profile determines API latency (local vs cloud)

**Token Optimization**:
- Active lorebook inclusion adds significant tokens to prompt
- Consider disabling `scene_recap_include_active_setting_lore` for very large scenes
- Message type filtering (`scene_recap_message_types`) reduces prompt size

**Queue Processing**:
- Operations execute sequentially (no parallelization)
- Scene recap generation blocks other operations
- Queue blocking mode prevents chat during generation (optional)
- Queue state persistence adds small overhead per operation

**Memory Injection Impact**:
- Scene recaps injected into every LLM call add token overhead
- Depth/position settings control how many recaps are injected
- Running scene recap provides more token-efficient alternative

**UI Rendering**:
- Rendering all scene breaks on chat load iterates entire chat history
- Scene break UI updates are debounced (500ms)
- Large chats with many scene breaks may experience render delay

## Security Considerations

**Prompt Injection**:
- User-controlled recap text not sanitized before injection
- Malicious recap content could influence LLM behavior
- Mitigation: Recap validation checks format but not content safety

**API Key Exposure**:
- ConnectionManager profiles store API keys
- Keys not exposed in extension code or logs
- Keys managed by SillyTavern's ConnectionManager

**Lorebook Storage**:
- Queue state stored in lorebook entry (JSON)
- Queue data includes operation metadata but not sensitive content
- Lorebook entries accessible to all extensions

**Test Overrides**:
- `globalThis.__TEST_RECAP_TEXT_RESPONSE` allows response mocking
- Only active when explicitly set (not in production)
- Tests should clean up overrides after use

## Future Enhancements

### Planned

- **Per-Message Recapping**: Restore individual message recap generation (legacy code exists)
- **Parallel Operation Processing**: Allow non-dependent operations to run concurrently
- **Recap Templates**: Preset recap formats (narrative, bullet points, dialogue-focused)
- **Recap Merging**: Combine multiple scene recaps into single summary

### Considerations

- **Streaming Support**: Stream recap generation for real-time progress
- **Recap Caching**: Cache LLM responses to avoid regeneration
- **Batch Scene Recap**: Generate recaps for multiple scenes in single LLM call
- **Recap Diff View**: Show changes between versions visually
- **Recap Search**: Full-text search across all scene recaps
- **Export/Import**: Export recaps as standalone JSON/markdown

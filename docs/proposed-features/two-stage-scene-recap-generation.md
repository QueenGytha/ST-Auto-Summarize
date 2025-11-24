# Two-Stage Scene Recap Generation: Analysis & Implementation Plan

## Overview

This document analyzes the proposal to split scene recap generation into two sequential operations:

1. **Stage 1 (GENERATE_SCENE_RECAP)**: Extract raw data from scene messages (entities, events, topics, etc.) - **KEEP EXISTING OPERATION**
2. **Stage 2 (PARSE_SCENE_RECAP)**: Deduplicate, sort, and format the extracted data into final recap text - **NEW OPERATION**

**Note**: This is a refactor, not a rewrite. The existing `GENERATE_SCENE_RECAP` operation becomes Stage 1. We add a new `PARSE_SCENE_RECAP` operation for Stage 2, and move lorebook queueing logic from Stage 1 to Stage 2.

## Current Architecture

### Single-Stage Scene Recap Flow

```
GENERATE_SCENE_RECAP (Priority 9)
�"o�? Collect messages in scene
�"o�? Build prompt with macros
�"o�? Call LLM (single prompt)
�"o�? Extract JSON response
�"o�? Store in message.scene_recap_memory
�"o�? Queue lorebook operations (if enabled)
�",  �"o�? LOREBOOK_ENTRY_LOOKUP (Priority 11)
�",  �"o�? RESOLVE_LOREBOOK_ENTRY (Priority 12, if needed)
�",  �"o�? CREATE_LOREBOOK_ENTRY (Priority 14)
�",  �""�? UPDATE_LOREBOOK_REGISTRY (Priority 13)
�""�? Auto-queue COMBINE_SCENE_WITH_RUNNING
   �""�? Dependencies: all lorebook operation IDs
```

**Key Files**:

- `sceneBreak.js` line 1740+: `generateSceneRecap()` function
- `operationHandlers.js` lines 985-1130: `GENERATE_SCENE_RECAP` handler
- `operationArtifacts.js`: Artifact management for `scene_recap` operation type

**Current Prompt Artifact** (`scene_recap`):

- Single prompt that handles both extraction and formatting
- Uses macros: `{{scene_messages}}`, `{{active_lore}}`, etc.
- Returns JSON with formatted recap text

---

## Proposed Two-Stage Architecture

### Stage 1: Generate Scene Recap (Extract Data)

**Operation Type**: `GENERATE_SCENE_RECAP` (existing, repurposed)

**Purpose**: Extract raw structured data from scene messages without formatting or deduplication.

**Input**:

- Scene messages ONLY (via `{{scene_messages}}` macro)
- NO `{{active_setting_lore}}` - Stage 1 should not see existing lore
- NO comparison context

**Output** (Raw JSON - Exhaustive chronological extraction):

```json
{
  "chronological_items": [
    {"type": "event", "description": "Alice entered the room", "message": 42},
    {"type": "entity_mention", "name": "Alice", "details": "wearing red dress", "message": 42},
    {"type": "setting_detail", "aspect": "location", "value": "tavern interior", "message": 42},
    {"type": "event", "description": "Bob greeted Alice", "message": 44},
    {"type": "entity_mention", "name": "Bob", "details": "talking loudly", "message": 44},
    {"type": "quote", "speaker": "Bob", "text": "Welcome, friend!", "message": 44},
    {"type": "event", "description": "Alice drew her sword", "message": 47},
    {"type": "entity_mention", "name": "Alice", "details": "holding sword", "message": 47},
    {"type": "tone_shift", "description": "atmosphere became tense", "message": 47}
  ]
}
```

**Key characteristics**:
- Chronological order (by message number)
- ALL details extracted (duplicates, overlaps - everything)
- No filtering, no "is this new?" decisions
- No knowledge of existing setting_lore
- No separation into recap vs lore categories

**Storage**: Extracted data stored directly in `message.scene_recap_memory` (same location as final recap).

**Changes from current implementation**:

- Update prompt artifact to focus on extraction only (no formatting)
- Remove lorebook queueing logic (moves to Stage 2)
- Remove COMBINE queueing logic (moves to Stage 2)
- Add queueing of PARSE_SCENE_RECAP operation

**Prompt Artifact**: Existing `scene_recap` artifact updated to focus on extraction without formatting concerns.

---

### Stage 2: Parse Scene Recap (Format Data)

**New Operation Type**: `PARSE_SCENE_RECAP`

**Purpose**: Compare extracted data against existing lore, determine what's new/changed, format into final recap.

**Input**:

- Extracted data from Stage 1 (read from `message.scene_recap_memory`)
- `{{active_setting_lore}}` macro (for comparison and UID lookup)
- `{{lorebook_entry_types}}` macro (allowed entity types)
- Scene index (for message access)

**Processing Logic** (LLM-Based):

1. **Deduplicate within extracted data** (e.g., Alice's multiple mentions → consolidated)
2. **Compare against `{{active_setting_lore}}`** - The MAIN task:
   - Identify what's NEW (not in existing lore)
   - Identify what's CHANGED (meaningfully different from existing lore)
   - Filter out what's already captured and unchanged
3. **UID lookup and matching**:
   - Match entities to existing lore entries
   - Copy UIDs for exact matches (same type + name + identity)
   - Omit UID for new entities or uncertain matches
4. **Categorize extracted data**:
   - What belongs in `recap` (plot beats, events, tone shifts)
   - What belongs in `setting_lore` (persistent entity details that are new/changed)
5. **Format final output** matching current system's JSON structure

**Output** (Final JSON - matches current system format):

```json
{
  "scene_name": "Tense Tavern Encounter",
  "recap": "DEV: Alice entered tavern; Bob greeted; tension escalated\nTONE: tense atmosphere\nPEND: potential conflict",
  "setting_lore": [
    {
      "type": "character",
      "name": "Alice",
      "content": "State: at tavern; armed with sword",
      "keywords": ["alice"],
      "uid": "existing-uid-if-matched"
    },
    {
      "type": "character",
      "name": "Bob",
      "content": "Notable dialogue: \"Welcome, friend!\" (greeting Alice at tavern)",
      "keywords": ["bob"]
    }
  ]
}
```

**Note**: Only entities with NEW or CHANGED information are included in `setting_lore`. UID is copied only for exact matches to existing entries.

**Storage**: Final formatted recap **overwrites** `message.scene_recap_memory` (replaces Stage 1's raw extracted data).

**Logic moved from GENERATE_SCENE_RECAP**:

- Queue lorebook operations (LOOKUP �+' RESOLVE �+' CREATE �+' REGISTRY)
- Queue COMBINE_SCENE_WITH_RUNNING operation
- All operations depend on PARSE_SCENE_RECAP completing

**Prompt Artifact**: New artifact type `parse_scene_recap` focused on formatting and narrative construction.

---

### Complete Two-Stage Flow

#### Automatic Flow (manual = false)

```
GENERATE_SCENE_RECAP (Priority 9) [EXISTING - REFACTORED]
�"o�? Collect scene messages
�"o�? Call LLM with extraction prompt
�"o�? Store raw extracted data in message.scene_recap_memory
�""�? Auto-queue PARSE_SCENE_RECAP (manual: false)
   �""�? Dependency: this operation

PARSE_SCENE_RECAP (Priority 9) [NEW OPERATION]
�"o�? Read extracted data from message.scene_recap_memory
�"o�? Call LLM with formatting prompt
�"o�? Overwrite message.scene_recap_memory with formatted recap
�"o�? Check manual flag = false �+' Queue lorebook operations [MOVED FROM GENERATE_SCENE_RECAP]
�",  �""�? [All lorebook stages: LOOKUP �+' RESOLVE �+' CREATE �+' REGISTRY]
�""�? Check manual flag = false �+' Queue COMBINE_SCENE_WITH_RUNNING [MOVED FROM GENERATE_SCENE_RECAP]
   �""�? Dependencies: all lorebook operation IDs

COMBINE_SCENE_WITH_RUNNING (Priority 10) [UNCHANGED]
�"o�? Takes the formatted scene recap from PARSE_SCENE_RECAP
�"o�? Combines it with the running narrative
�""�? Updates chat_metadata.auto_recap.running_scene_recap
```

#### Manual Flow (manual = true)

```
User clicks "Generate" button

GENERATE_SCENE_RECAP (Priority 9) [metadata: { manual: true }]
�"o�? Collect scene messages
�"o�? Call LLM with extraction prompt
�"o�? Store raw extracted data in message.scene_recap_memory
�""�? Auto-queue PARSE_SCENE_RECAP (manual: true)
   �""�? Dependency: this operation

PARSE_SCENE_RECAP (Priority 9) [metadata: { manual: true }]
�"o�? Read extracted data from message.scene_recap_memory
�"o�? Call LLM with formatting prompt
�"o�? Overwrite message.scene_recap_memory with formatted recap
�"o�? Check manual flag = true �+' SKIP lorebook operations
�""�? Check manual flag = true �+' SKIP COMBINE operation

Result: Formatted recap saved, but NOT combined into running recap
User can regenerate if unsatisfied, manually trigger COMBINE later
```

**Key Points**:

- The two-stage split applies to BOTH manual and automatic generation
- The `manual` flag flows through both stages
- Lorebook/COMBINE logic moves from `GENERATE_SCENE_RECAP` to `PARSE_SCENE_RECAP`
- Manual operations complete both stages but skip lorebook/COMBINE
- `COMBINE_SCENE_WITH_RUNNING` operation remains unchanged

---

## Implementation Issues & Considerations

### 1. Operation Dependency Management

**Issue**: Stage 2 must wait for Stage 1 to complete and access its output.

**Solution**: Use existing dependency system. GENERATE_SCENE_RECAP stores extracted data on the message, PARSE_SCENE_RECAP reads and overwrites it.

```javascript
// In GENERATE_SCENE_RECAP handler (existing handler, modified)
const extractionResult = await extractSceneData({ index, signal });

// Store extracted data directly on the message (same field as final recap)
const message = chat[index];
set_data(message, 'scene_recap_memory', extractionResult);

// Store token breakdown in operation metadata
await updateOperationMetadata(operation.id, {
  tokens_used: tokenBreakdown.tokens_used
});

// REMOVE: Lorebook queueing logic (moves to PARSE_SCENE_RECAP)
// REMOVE: COMBINE queueing logic (moves to PARSE_SCENE_RECAP)

// ADD: Queue PARSE_SCENE_RECAP with dependency
const parseOpId = await enqueueOperation(
  OperationType.PARSE_SCENE_RECAP,
  { index },
  {
    dependencies: [operation.id],  // Wait for extraction
    priority: 9,                    // Same priority as extraction
    metadata: {
      scene_index: index
    }
  }
);

return { parseOperationId: parseOpId };
```

**In PARSE_SCENE_RECAP handler (new handler)**:

```javascript
// Read extraction result from message
const message = chat[operation.params.index];
const extractedData = get_data(message, 'scene_recap_memory');

if (!extractedData) {
  throw new Error('Extraction data not found on message - GENERATE_SCENE_RECAP may have failed');
}

// Process and format
const formattedRecap = await formatSceneRecap({
  extractedData,
  index: operation.params.index,
  signal
});

// Overwrite with formatted recap
set_data(message, 'scene_recap_memory', formattedRecap.recap);

// ADD: Lorebook queueing logic (moved from GENERATE_SCENE_RECAP)
const lorebookOpIds = await queueLorebookOperations(index, formattedRecap);

// ADD: COMBINE queueing logic (moved from GENERATE_SCENE_RECAP)
if (get_settings('running_scene_recap_auto_generate')) {
  await queueCombineSceneWithRunning(index, {
    dependencies: lorebookOpIds,
    metadata: { ... }
  });
}
```

---

### 2. Data Storage Location

**Solution**: Store extracted data directly in `message.scene_recap_memory`, where the final recap normally goes.

**Implementation**:

- GENERATE_SCENE_RECAP: Stores raw extracted JSON in `message.scene_recap_memory`
- PARSE_SCENE_RECAP: Reads raw data from `message.scene_recap_memory`, formats it, then overwrites with final recap

**Benefits**:

- Uses existing message data storage pattern (`set_data` / `get_data`)
- Automatically persisted via ST's chat saving mechanism
- No temporary storage management needed
- No cleanup logic required
- Data survives page reloads naturally
- Simple and obvious

**Consideration**: Between GENERATE_SCENE_RECAP and PARSE_SCENE_RECAP completion, `message.scene_recap_memory` contains raw extracted JSON instead of formatted recap text. This is fine because:

- Operations execute sequentially (PARSE_SCENE_RECAP immediately follows GENERATE_SCENE_RECAP via dependency)
- Operation queue blocks if configured
- UI can show "Generating..." / "Parsing..." status during this period

---

### 3. Operation Ordering & Scene Completion

**Issue**: Ensure entire scene pipeline (both stages + lorebook ops) completes before next scene begins.

**Current System** (backwards detection):

```javascript
// In DETECT_SCENE_BREAK_BACKWARDS handler (operationHandlers.js:869-883)
const discoveredBreaks = [sceneBreakAt, ...operation.metadata.discovered_breaks];

if (startIndex > 0) {
  // Continue backwards
  await enqueueOperation(
    OperationType.DETECT_SCENE_BREAK_BACKWARDS,
    { startIndex, endIndex: sceneBreakAt - 1 },
    { priority: 15, metadata: { next_break_index: sceneBreakAt, discovered_breaks } }
  );
} else {
  // Termination: queue all scene recaps
  for (let i = 0; i < discoveredBreaks.length; i++) {
    const sceneIndex = discoveredBreaks[i];
    const recapOpId = await enqueueOperation(
      OperationType.GENERATE_SCENE_RECAP,
      { index: sceneIndex },
      { priority: 9 }
    );
  }
}
```

**With Two Stages**:

The key insight is that **dependencies already handle this**. The existing COMBINE operation waits for all lorebook operations, which are queued from Stage 2. This creates a natural dependency chain:

```
Scene 42:
  EXTRACT_SCENE_DATA (P9) �+' FORMAT_SCENE_RECAP (P9)
    �+' LOREBOOK_ENTRY_LOOKUP (P11)
    �+' RESOLVE_LOREBOOK_ENTRY (P12)
    �+' CREATE_LOREBOOK_ENTRY (P14)
    �+' UPDATE_LOREBOOK_REGISTRY (P13)
    �+' COMBINE_SCENE_WITH_RUNNING (P10, dependencies: [all above])

Scene 87:
  EXTRACT_SCENE_DATA (P9) �+' FORMAT_SCENE_RECAP (P9) �+' [...]
```

**Priority-based execution** ensures all Scene 42 operations complete before Scene 87:

- Scene 42 extraction (P9) and Scene 87 extraction (P9) queued
- Scene 42 extraction runs first (older created_at timestamp)
- Scene 42 format (P9, dependency: extraction) queues
- Scene 42 lorebook ops (P11-P14) queue from format handler
- **Scene 42's high-priority lorebook ops (P11-P14) run before Scene 87's extraction (P9)**
- Scene 42 COMBINE (P10, dependencies: lorebook ops) queues
- Scene 42 COMBINE completes
- **Now** Scene 87 extraction runs

**No additional changes needed** for operation ordering.

---

### 4. Backwards Detection Chain

**Issue**: Backwards detection termination queues all scene recaps. No changes needed.

**Solution**: Keep existing logic - it already queues GENERATE_SCENE_RECAP.

```javascript
// In operationHandlers.js backwards handler termination (NO CHANGE)
for (let i = 0; i < discoveredBreaks.length; i++) {
  const sceneIndex = discoveredBreaks[i];
  const recapOpId = await enqueueOperation(
    OperationType.GENERATE_SCENE_RECAP,  // Keep existing
    { index: sceneIndex },
    { priority: 9, metadata: { scene_index: sceneIndex } }
  );
}
```

GENERATE_SCENE_RECAP auto-queues PARSE_SCENE_RECAP, which then queues lorebook/COMBINE operations.

---

### 5. Manual vs Automatic Recap Generation

**Current Behavior**: The system distinguishes manual from automatic generation using a `manual` flag in operation metadata.

**Key Differences** (from `sceneBreak.js` and `operationHandlers.js`):

| Aspect               | Manual (button click) | Automatic (auto-detection) |
| -------------------- | --------------------- | -------------------------- |
| Lorebook extraction  | SKIPPED               | EXECUTED                   |
| COMBINE operation    | SKIPPED               | QUEUED (if enabled)        |
| Running recap update | NEVER                 | YES (if enabled)           |
| Purpose              | User review/iteration | Full pipeline              |

**Why?** Manual operations skip lorebook/combine so users can regenerate without polluting memory until they're satisfied.

**Current Manual Flow**:

```javascript
// sceneBreak.js:463 - Button click handler
await generateSceneRecap({ index, manual: true });

// sceneBreak.js:1621 - saveSceneRecap() checks manual flag
if (recap && !manual) {  // Skip lorebook if manual
  lorebookOpIds = await extractAndQueueLorebookEntries(recap, messageIndex, versionIndex);
}

// operationHandlers.js:1031 - Handler checks manual flag
const isManual = operation.metadata?.manual === true;
if (!isManual && get_settings('running_scene_recap_auto_generate')) {
  await queueCombineSceneWithRunning(index, { dependencies: result.lorebookOpIds });
}
```

**For Two-Stage System**:

**Manual operations must run BOTH stages but skip lorebook/combine**:

1. User clicks "Generate" �+' queues GENERATE_SCENE_RECAP with `manual: true`
2. GENERATE_SCENE_RECAP extracts data, stores raw JSON, queues PARSE_SCENE_RECAP with `manual: true`
3. PARSE_SCENE_RECAP formats data, overwrites with final recap
4. PARSE_SCENE_RECAP skips lorebook extraction (checks manual flag)
5. PARSE_SCENE_RECAP skips COMBINE operation (checks manual flag)
6. User sees formatted recap, can regenerate entire flow if unsatisfied
7. Later, user manually triggers COMBINE if desired

**Implementation Changes**:

```javascript
// In GENERATE_SCENE_RECAP handler (modified)
const isManual = operation.metadata?.manual === true;

// Queue PARSE_SCENE_RECAP with manual flag passed through
const parseOpId = await enqueueOperation(
  OperationType.PARSE_SCENE_RECAP,
  { index },
  {
    dependencies: [operation.id],
    priority: 9,
    metadata: {
      scene_index: index,
      manual: isManual  // <-- Pass manual flag to Stage 2
    }
  }
);

// REMOVE lorebook queueing (moved to PARSE_SCENE_RECAP)
// REMOVE COMBINE queueing (moved to PARSE_SCENE_RECAP)
```

```javascript
// In PARSE_SCENE_RECAP handler (new)
const isManual = operation.metadata?.manual === true;

// Format recap
const formattedRecap = await formatSceneRecap({ extractedData, index, signal });
set_data(message, 'scene_recap_memory', formattedRecap.recap);

// Only queue lorebook operations if NOT manual
let lorebookOpIds = [];
if (!isManual) {
  lorebookOpIds = await extractAndQueueLorebookEntries(formattedRecap.recap, index);
}

// Only queue COMBINE if NOT manual AND auto-generate enabled
if (!isManual && get_settings('running_scene_recap_auto_generate')) {
  await queueCombineSceneWithRunning(index, {
    dependencies: lorebookOpIds,
    metadata: { ... }
  });
}
```

**No changes to button/slash command triggers** - they already pass `manual: true`, which flows through both stages.

---

### 6. Prompt Artifacts

**Status**: Update existing `scene_recap` artifact, add new `parse_scene_recap` artifact.

**Implementation**:

1. **Update existing artifact type**: Modify `scene_recap` in `operationArtifacts.js`
   - Update default prompt to focus on extraction only
   - Keep existing artifact structure
2. **Add new artifact type**:
   - `parse_scene_recap` - Default formatting/parsing prompt
3. **Design prompts with clear separation of concerns**

**Prompt Design Guidance**:

**Extraction Prompt (`scene_recap` - UPDATED)**:

**Inputs**:
- ONLY `{{scene_messages}}` macro
- NO `{{active_setting_lore}}` (Stage 1 shouldn't see existing lore)
- NO `{{lorebook_entry_types}}` (not needed for extraction)

**Task**:
- Extract ALL roleplay details chronologically
- Include: events, entity mentions, quotes, tone shifts, setting details, everything
- Extract duplicates and overlaps - comprehensive dump
- No filtering, no "is this new?" decisions
- No knowledge of what belongs in "recap" vs "setting_lore"
- Output: JSON with `chronological_items` array

**Key principle**: Stage 1 is "dumb extraction" - just collect everything in order

**Formatting Prompt (`parse_scene_recap` - NEW)**:

**Inputs**:
- Stage 1 output (chronological_items from `message.scene_recap_memory`)
- `{{active_setting_lore}}` macro (for comparison)
- `{{lorebook_entry_types}}` macro (allowed types)

**Task**:
- Deduplicate within extracted data
- **Compare against `{{active_setting_lore}}`** - determine what's NEW/CHANGED
- Lookup and match UIDs for existing entities
- Decide what goes in `recap` vs `setting_lore`
- Format output: `{scene_name, recap, setting_lore}`
- Only include setting_lore entries that are meaningfully new/changed

**Key principle**: Stage 2 is "smart filtering" - all comparison and categorization logic

---

### 7. Prompt Preparation Changes

**Issue**: `prepareScenePrompt()` currently builds macros including `{{active_setting_lore}}`. Stage 1 must NOT receive this macro.

**File**: `sceneBreak.js` lines 1313-1407

**Current behavior** (lines 1331-1333, 1396-1404):
```javascript
// Get active lorebooks if enabled
const { entries: activeEntries, metadata: lorebookMetadata } = await getActiveLorebooksAtPosition(endIdx, ctx, get_data, skipSettingsModification);
const activeSettingLoreText = buildActiveSettingLore(activeEntries);

// Build macro values
const params = {
  scene_messages: formattedMessages,
  lorebook_entry_types: lorebookTypesMacro,
  active_setting_lore: activeSettingLoreText,  // <-- Stage 1 should NOT get this
  prefill: buildPrefill(prefill)
};
```

**Solution Options**:

**Option A: Conditional macro building** (simpler, recommended)
```javascript
// In prepareScenePrompt(), add parameter: isStage1 = false
export async function prepareScenePrompt(sceneObjects, ctx, endIdx, get_data, skipSettingsModification = false, isStage1 = false) {
  // ... existing code ...

  // Build macro values conditionally
  const params = {
    scene_messages: formattedMessages,
    prefill: buildPrefill(prefill)
  };

  // Stage 2 only: add lore-related macros
  if (!isStage1) {
    params.lorebook_entry_types = lorebookTypesMacro;
    params.active_setting_lore = activeSettingLoreText;
  }

  const prompt = await substitute_params(promptTemplate, params);
  return { prompt, prefill, lorebookMetadata, ... };
}
```

**Option B: Separate function for Stage 2**
```javascript
// New function: prepareParseScenePrompt()
export async function prepareParseScenePrompt(extractedData, ctx, endIdx, get_data) {
  const config = await resolveOperationConfig('parse_scene_recap');
  const promptTemplate = config.prompt;
  const prefill = config.prefill || "";

  // Get lore for comparison
  const { entries: activeEntries } = await getActiveLorebooksAtPosition(endIdx, ctx, get_data);
  const activeSettingLoreText = buildActiveSettingLore(activeEntries);
  const typeDefinitions = getConfiguredEntityTypeDefinitions();
  const lorebookTypesMacro = buildLorebookEntryTypes(typeDefinitions);

  // Build macro values with Stage 1 output
  const params = {
    extracted_data: JSON.stringify(extractedData, null, 2),  // Pretty-print for LLM
    active_setting_lore: activeSettingLoreText,
    lorebook_entry_types: lorebookTypesMacro,
    prefill: buildPrefill(prefill)
  };

  const prompt = await substitute_params(promptTemplate, params);
  return { prompt, prefill };
}
```

**Recommendation**: Use Option A for Stage 1 (simpler), then call existing `prepareScenePrompt()` or create new function for Stage 2 depending on whether Stage 2 needs `{{extracted_data}}` macro or reads from message directly.

**Implementation in handlers**:

```javascript
// In GENERATE_SCENE_RECAP handler (Stage 1)
const { prompt, prefill } = await prepareScenePrompt(sceneObjects, ctx, endIdx, get_data, false, true);  // isStage1 = true

// In PARSE_SCENE_RECAP handler (Stage 2)
// Option 1: Read extraction from message, use new prep function
const extractedData = JSON.parse(get_data(message, 'scene_recap_memory'));
const { prompt, prefill } = await prepareParseScenePrompt(extractedData, ctx, endIdx, get_data);

// Option 2: Or pass to existing prepareScenePrompt if template uses message data
const { prompt, prefill } = await prepareScenePrompt(sceneObjects, ctx, endIdx, get_data, false, false);  // isStage1 = false
```

---

### 8. Artifact System Wiring Requirements

**CRITICAL**: Adding a new operation type to the artifact system requires THREE mandatory changes. Skipping any of these will cause validation errors.

#### Change 1: Update OPERATION_TYPES Array

**File**: `operationArtifacts.js` (lines 5-15)

The `OPERATION_TYPES` array defines which operation types are valid for artifact creation. This is used for validation.

```javascript
const OPERATION_TYPES = [
  'scene_recap',
  'scene_recap_error_detection',
  'auto_scene_break',
  'running_scene_recap',
  'auto_lorebooks_recap_merge',
  'auto_lorebooks_recap_lorebook_entry_lookup',
  'auto_lorebooks_recap_lorebook_entry_deduplicate',
  'auto_lorebooks_bulk_populate',
  'auto_lorebooks_recap_lorebook_entry_compaction',
  'parse_scene_recap'  // �+? ADD THIS LINE
];
```

**Why Required**: The `createArtifact()` function validates operation types against this array (lines 17-20):

```javascript
export function createArtifact(operationType, artifactData) {
  if (!OPERATION_TYPES.includes(operationType)) {
    throw new Error(`Invalid operation type: ${operationType}`);  // �+? Will throw without update
  }
  // ...
}
```

#### Change 2: Create Default Artifact

**File**: `defaultSettings.js`

Every operation type needs a default artifact configuration. Add to `default_settings.operation_artifacts`:

```javascript
operation_artifacts: {
  // ... existing artifacts
  parse_scene_recap: [{
    name: 'Default',
    prompt: '[Default parsing/formatting prompt will be designed separately]',
    prefill: '',
    connection_profile: null,
    completion_preset_name: null,
    include_preset_prompts: false,
    isDefault: true,
    internalVersion: 1,
    createdAt: Date.now(),
    modifiedAt: Date.now()
  }]
}
```

#### Change 3: Artifact Initialization

**File**: `operationArtifacts.js`

When settings are loaded, artifacts are initialized from default settings. The system uses `OPERATION_TYPES` array to validate during initialization.

**What Happens Without These Changes**:

1. Attempt to call `createArtifact('parse_scene_recap', ...)` �+' `Error: Invalid operation type: parse_scene_recap`
2. Attempt to resolve config for PARSE_SCENE_RECAP �+' fails silently or throws error
3. Handler tries to get prompt artifact �+' no artifact found, operation fails

**Execution Order Matters**:

- Must update `OPERATION_TYPES` array BEFORE any artifact creation attempts
- Must have default artifact BEFORE any config resolution attempts
- These are initialization-time requirements, not runtime

---

### 8. Error Handling & Retries

**Issue**: If Stage 1 succeeds but Stage 2 fails, what happens on retry?

**Scenarios**:

**Scenario A: GENERATE_SCENE_RECAP success, PARSE_SCENE_RECAP failure**

- GENERATE_SCENE_RECAP status = COMPLETED
- PARSE_SCENE_RECAP status = FAILED �+' RETRYING �+' PENDING
- On retry, PARSE_SCENE_RECAP re-runs using stored extraction data from message
- **No re-extraction needed** (efficient)

**Scenario B: GENERATE_SCENE_RECAP failure**

- GENERATE_SCENE_RECAP status = FAILED �+' RETRYING �+' PENDING
- PARSE_SCENE_RECAP never queues (dependency not met)
- On GENERATE_SCENE_RECAP retry, extraction runs again
- On GENERATE_SCENE_RECAP success, PARSE_SCENE_RECAP auto-queues

**Scenario C: User cancels GENERATE_SCENE_RECAP**

- GENERATE_SCENE_RECAP status = CANCELLED
- PARSE_SCENE_RECAP never queues
- User must manually re-trigger (or retry operation)

**Implementation**:

```javascript
// In PARSE_SCENE_RECAP handler
const message = chat[operation.params.index];
const extractedData = get_data(message, 'scene_recap_memory');

if (!extractedData) {
  // Edge case: GENERATE_SCENE_RECAP completed but no data on message
  throw new Error('Extraction data not found on message - GENERATE_SCENE_RECAP may have failed');
}

// Validate it's raw extracted data (JSON structure) not a previous formatted recap
// Both stages store JSON strings (per sceneBreak.js:1497), so we check structure
let parsed;
try {
  parsed = typeof extractedData === 'string' ? JSON.parse(extractedData) : extractedData;
} catch (e) {
  throw new Error('Failed to parse extraction data as JSON - GENERATE_SCENE_RECAP may have failed');
}

// Check for extraction data structure (has chronological_items)
if (!parsed.chronological_items || !Array.isArray(parsed.chronological_items)) {
  // If it has 'recap' field, it's already formatted (wrong stage)
  if (parsed.recap) {
    throw new Error('Expected raw extracted data but found formatted recap - GENERATE_SCENE_RECAP may have skipped');
  }
  throw new Error('Extraction data missing chronological_items array - invalid structure');
}
```

**Retry Logic**: Existing retry logic in `operationQueue.js` handles this automatically. Failed operations retry up to max_retries.

---

### 8. Token Usage Tracking

**Issue**: Token breakdown tracking currently captures single LLM call. With two stages, need to track both.

**Solution**: Track separately in each operation's metadata.

```javascript
// Stage 1 operation metadata
{
  extractedData: { ... },
  tokens_used: 1500,
  max_context: 200000,
  stage: 'extraction'
}

// Stage 2 operation metadata
{
  tokens_used: 800,
  max_context: 200000,
  stage: 'formatting',
  extraction_op: 'op_xxx'
}
```

**UI Display** (`operationQueueUI.js`):

- Show both operations in queue with separate token counts
- Aggregate token count for scene in summary: "Scene 42: 2300 tokens (1500 extract + 800 format)"

**Token Breakdown Component** (`tokenBreakdown.js`):

- Update to show two-stage breakdown when both operations present

---

### 9. Operation Context (Thread-Local Suffixes)

**Issue**: Operation context suffix used for ST_METADATA injection in `generateRawInterceptor.js`. Need distinct suffixes for each stage.

**Solution**: Use stage-specific suffixes.

```javascript
// In GENERATE_SCENE_RECAP handler
setOperationSuffix(`-scene${index}-generate`);
try {
  const result = await sendLLMRequest(...);
} finally {
  clearOperationSuffix();
}

// In PARSE_SCENE_RECAP handler
setOperationSuffix(`-scene${index}-parse`);
try {
  const result = await sendLLMRequest(...);
} finally {
  clearOperationSuffix();
}
```

**Benefit**: Separate LLM logs for generation (extraction) vs parsing (formatting) in ST's generation log.

---

### 10. UI Clarity & User Understanding

**Issue**: Users see two operations per scene instead of one. May cause confusion.

**Mitigations**:

**Option A: Grouped Display**

```
Scene Recap: Scene 42
�"o�? �o" Extract scene data (1500 tokens)
�""�? �?3 Format recap (pending)
```

**Option B: Collapse into Single Display**

```
�?3 Generating Scene 42 recap... (extraction complete, formatting...)
```

**Option C: Progress Indicator**

```
Scene 42: [�-��-��-��-��-��-��-��-��-��-�] 50% (extraction complete)
```

**Recommendation**: Option A (grouped display) with collapsible UI for details.

**Implementation** (`operationQueueUI.js`):

- Detect related operations (same scene index)
- Group in UI under parent label
- Show individual operation details in expandable section

---

### 11. Testing Strategy

**Issue**: Tests currently mock single GENERATE_SCENE_RECAP operation. Need to update for two stages.

**Test Updates** (in `tests/` directory):

**Unit Tests**:

```javascript
describe('Two-Stage Scene Recap', () => {
  it('queues PARSE_SCENE_RECAP after GENERATE_SCENE_RECAP completes', async () => {
    const generateOp = await enqueueOperation(OperationType.GENERATE_SCENE_RECAP, { index: 42 });

    // Simulate generation completion
    await completeOperation(generateOp.id);

    // Check parse operation queued
    const parseOp = findOperationByType(OperationType.PARSE_SCENE_RECAP);
    expect(parseOp).toBeDefined();
    expect(parseOp.dependencies).toContain(generateOp.id);
  });

  it('fails PARSE_SCENE_RECAP if extraction data missing', async () => {
    const generateOp = await enqueueOperation(OperationType.GENERATE_SCENE_RECAP, { index: 42 });
    await completeOperation(generateOp.id); // Complete without storing data

    const parseOp = findOperationByType(OperationType.PARSE_SCENE_RECAP);
    await expect(executeOperation(parseOp.id)).rejects.toThrow('data not found');
  });

  it('moves lorebook queueing to PARSE_SCENE_RECAP', async () => {
    const generateOp = await enqueueOperation(OperationType.GENERATE_SCENE_RECAP, { index: 42 });
    await completeOperation(generateOp.id);

    // No lorebook ops after GENERATE_SCENE_RECAP
    expect(findOperationByType(OperationType.LOREBOOK_ENTRY_LOOKUP)).toBeUndefined();

    // Complete PARSE_SCENE_RECAP
    const parseOp = findOperationByType(OperationType.PARSE_SCENE_RECAP);
    await completeOperation(parseOp.id);

    // Lorebook ops queued after PARSE_SCENE_RECAP
    expect(findOperationByType(OperationType.LOREBOOK_ENTRY_LOOKUP)).toBeDefined();
  });
});
```

**E2E Tests**:

```javascript
test('scene recap generation completes both stages', async ({ page }) => {
  // Queue generation (triggers both stages)
  await queueSceneRecap(page, 42);

  // Wait for both operations to complete
  await page.waitForSelector('[data-operation-type="GENERATE_SCENE_RECAP"][data-status="completed"]');
  await page.waitForSelector('[data-operation-type="PARSE_SCENE_RECAP"][data-status="completed"]');

  // Verify formatted recap stored
  const recap = await getSceneRecap(page, 42);
  expect(recap).toBeTruthy();
  expect(typeof recap).toBe('string'); // Formatted, not raw JSON
});
```

**Test Overrides**:

```javascript
// For generation (extraction) stage
globalThis.__TEST_GENERATE_SCENE_RECAP_RESPONSE = JSON.stringify({
  entities: [{ name: 'Alice', details: 'test' }],
  events: [{ description: 'test event' }]
});

// For parsing (formatting) stage
globalThis.__TEST_PARSE_SCENE_RECAP_RESPONSE = JSON.stringify({
  recap: 'Formatted test recap'
});
```

---

## Implementation Phases

**EXECUTION ORDER CRITICAL**: Implementation phases must be completed sequentially. Phase 1 establishes the artifact system wiring that Phase 2 depends on. Attempting to create handlers before completing artifact system setup will cause validation errors.

### Phase 1: Core Infrastructure

**CRITICAL**: These changes must happen in the correct order to avoid validation errors.

1. **Add new operation type** to `operationTypes.js`:

   ```javascript
   export const OperationType = {
     // ... existing types
     PARSE_SCENE_RECAP: 'parse_scene_recap',  // �+? ADD THIS
   };
   ```

   - Keep existing `GENERATE_SCENE_RECAP`
2. **CRITICAL: Wire up artifact system** in `operationArtifacts.js`:

   ```javascript
   const OPERATION_TYPES = [
     'scene_recap',
     // ... existing types
     'parse_scene_recap',  // �+? ADD THIS - REQUIRED FOR VALIDATION
   ];
   ```

   - **Without this, `createArtifact()` will throw validation error**
   - This MUST be done before any artifact creation/resolution
3. **Create default artifact** in `defaultSettings.js`:

   ```javascript
   operation_artifacts: {
     // ... existing artifacts
     parse_scene_recap: [{
       name: 'Default',
       prompt: '[Formatting prompt - to be designed]',
       prefill: '',
       connection_profile: null,
       completion_preset_name: null,
       include_preset_prompts: false,
       isDefault: true,
       internalVersion: 1,
       createdAt: Date.now(),
       modifiedAt: Date.now()
     }]
   }
   ```

   - Required for initialization
4. **Update existing `scene_recap` artifact** in `defaultSettings.js`:

   - Modify default prompt to focus on extraction only (no formatting)

### Phase 2: Prompt Preparation

1. **Modify `prepareScenePrompt()` in `sceneBreak.js`**:
   - Add `isStage1` parameter (default false)
   - Conditionally exclude `{{active_setting_lore}}` and `{{lorebook_entry_types}}` macros when `isStage1 = true`
   - Stage 1 gets ONLY `{{scene_messages}}` macro

2. **Create `prepareParseScenePrompt()` in `sceneBreak.js`** (or use conditional in existing function):
   - Resolve `parse_scene_recap` artifact config
   - Get `{{active_setting_lore}}` entries
   - Get `{{lorebook_entry_types}}`
   - Read extracted data from message
   - Build `{{extracted_data}}` macro (pretty-printed JSON)
   - Return prompt with all Stage 2 macros

### Phase 3: Operation Handlers

1. **Modify existing `GENERATE_SCENE_RECAP` handler in `operationHandlers.js`**:
   - Keep message collection logic
   - **CHANGE**: Call `prepareScenePrompt(..., true)` with `isStage1 = true`
   - Keep LLM call with extraction prompt (no lore macros)
   - Keep storing data in `message.scene_recap_memory` (now stores extraction JSON)
   - **REMOVE**: Lorebook queueing logic
   - **REMOVE**: COMBINE queueing logic
   - **ADD**: Queue PARSE_SCENE_RECAP with dependency on this operation
   - **ADD**: Pass `manual` flag through to PARSE_SCENE_RECAP metadata

2. **Implement new `PARSE_SCENE_RECAP` handler in `operationHandlers.js`**:
   - Read extraction data from `message.scene_recap_memory`
   - Validate structure (has `chronological_items` array, not `recap` field)
   - Call `prepareParseScenePrompt()` with extracted data
   - Call LLM with formatting prompt (includes lore macros)
   - Parse response, validate has `{scene_name, recap, setting_lore}` structure
   - Overwrite `message.scene_recap_memory` with formatted recap JSON
   - Check `manual` flag: if false, queue lorebook and COMBINE operations
   - **ADD**: Lorebook queueing logic (moved from GENERATE_SCENE_RECAP)
   - **ADD**: COMBINE queueing logic (moved from GENERATE_SCENE_RECAP)

### Phase 4: Integration Points

1. No changes to backwards detection (already queues GENERATE_SCENE_RECAP)
2. No changes to manual recap triggers (already queue GENERATE_SCENE_RECAP)
3. Update operation context suffixes (separate for generate vs parse)
4. Update token tracking aggregation (show both operations)

### Phase 5: UI Updates

1. Grouped operation display in queue UI
2. Two-stage progress indicators
3. Token breakdown display for both stages

### Phase 6: Testing

1. Update unit tests for two-stage flow
2. Update E2E tests with new operation types
3. Add test overrides for both stages
4. Test error scenarios (Stage 1 fails, Stage 2 fails, data missing)

### Phase 7: Documentation

1. Update user documentation with two-stage explanation
2. Add prompt design guide for extraction vs formatting
3. Update developer docs with new operation flow diagrams

---

## Alternative Approaches

### Alternative 1: Single Operation, Two LLM Calls

Instead of two operations, keep single GENERATE_SCENE_RECAP operation but make two sequential LLM calls internally.

**Pros**:

- Simpler operation queue structure
- No dependency management needed
- Less UI complexity

**Cons**:

- Can't retry Stage 2 independently if Stage 1 succeeds
- Token tracking less granular
- Can't customize Stage 2 prompt independently (single artifact)
- Stage 2 failure forces full re-extraction

**Decision**: Not using this approach. Separate operations provide better failure isolation and customization, which are critical for complex LLM workflows.

---

### Alternative 2: Algorithmic Formatting (No LLM)

Stage 2 uses algorithmic deduplication/formatting instead of LLM.

**Pros**:

- Faster (no LLM call)
- No tokens used for formatting
- Deterministic output

**Cons**:

- Less flexible formatting
- Can't apply narrative style
- May not handle edge cases well (e.g., "Alice" vs "Alice Smith")

**Decision**: Not using this approach. Stage 2 will use LLM for best narrative quality and flexibility.

---

### Alternative 3: Streaming Between Stages

Stage 1 streams extraction results, Stage 2 processes incrementally.

**Pros**:

- Lower latency for small scenes
- Progressive enhancement

**Cons**:

- Complex implementation
- ST's generateRaw() doesn't support streaming well
- Harder to handle retries

**Recommendation**: Not worth complexity for current use case.

---

## Decisions Made

1. **Repurpose GENERATE_SCENE_RECAP, add PARSE_SCENE_RECAP** �o"

   - Keep existing GENERATE_SCENE_RECAP operation as Stage 1 (extraction)
   - Add new PARSE_SCENE_RECAP operation as Stage 2 (formatting)
   - No deletion/recreation - just refactor existing handler
   - Move lorebook queueing from Stage 1 to Stage 2
2. **Stage 2 uses LLM for formatting** �o"

   - Provides best narrative quality
   - Allows flexible deduplication and consolidation
   - Users can customize formatting style via prompt artifacts
3. **Running scene recap remains single-stage** �o"

   - The two-stage split applies ONLY to individual scene recap generation
   - `COMBINE_SCENE_WITH_RUNNING` operation is unchanged
   - Flow: Generate (extract) �+' Parse (format) �+' Produce final scene recap �+' Combine with running narrative
   - Running recap combines the already-formatted scene recaps into the total narrative
4. **No changes to existing triggers** �o"

   - Backwards detection already queues GENERATE_SCENE_RECAP (no change)
   - Manual triggers already queue GENERATE_SCENE_RECAP (no change)
   - GENERATE_SCENE_RECAP auto-chains to PARSE_SCENE_RECAP
   - Natural dependency chain handles ordering

## Implementation Summary

All design questions have been resolved:

1. **Data Storage** �o"

   - Store extracted data in `message.scene_recap_memory`
   - PARSE_SCENE_RECAP overwrites with formatted recap
   - Uses existing message data patterns
2. **Stage 2 Processing** �o"

   - New PARSE_SCENE_RECAP operation with LLM-based formatting
3. **Running Recap** �o"

   - Remains single-stage (COMBINE_SCENE_WITH_RUNNING unchanged)
   - Operates on formatted scene recaps
4. **Code Reuse** �o"

   - Repurpose GENERATE_SCENE_RECAP as Stage 1 (no deletion/recreation)
   - Move lorebook queueing logic to PARSE_SCENE_RECAP
   - No changes to backwards detection or manual triggers

---

## Conclusion

**Splitting scene recap generation into two stages is architecturally feasible** with the existing operations system. The dependency-based ordering and priority scheduling already handle complex multi-stage workflows (as seen in lorebook pipeline).

**Confirmed Approach**:

- **Stage 1 (GENERATE_SCENE_RECAP)**: Repurpose existing operation to extract raw structured data from scene messages
- **Stage 2 (PARSE_SCENE_RECAP)**: New operation that uses LLM to deduplicate, consolidate, and format into narrative recap
- **Running recap (COMBINE_SCENE_WITH_RUNNING)**: Remains single-stage, operates on formatted scene recaps
- **Lorebook queueing**: Moves from GENERATE_SCENE_RECAP to PARSE_SCENE_RECAP

**Key Benefits**:

- Separation of concerns (extraction vs formatting)
- Better failure isolation (retry Stage 2 without re-extraction)
- Independent customization of extraction and formatting prompts
- Granular token tracking for each stage
- LLM formatting provides narrative quality and flexibility

**Key Challenges**:

- UI clarity (solvable with grouped display showing both stages)
- Testing complexity (manageable with existing test infrastructure)
- Prompt design for extraction vs formatting (clear separation of concerns needed)

**Next Steps**: Proceed with two-stage implementation using the phased approach outlined above. Start with Phase 1 (infrastructure) and Phase 2 (handlers), then iterate on UI and testing.

# Operations System Assessment - End-to-End Analysis

## Executive Summary

**CRITICAL FINDINGS:**
1. **COMPLETE MISMATCH** between operation queue types and artifact operation types
2. **MISSING ARTIFACTS** for 4 operation types (no prompts configured)
3. **DUPLICATE/INCOMPLETE** resolution logic across multiple files
4. **INCONSISTENT METADATA** injection across operations

---

## 1. Operation Types Inventory

### 1.1 Queue Operation Types (operationQueue.js:49-62)

```javascript
export const OperationType = {
  VALIDATE_RECAP: 'validate_recap',
  DETECT_SCENE_BREAK: 'detect_scene_break',
  GENERATE_SCENE_RECAP: 'generate_scene_recap',
  GENERATE_RUNNING_RECAP: 'generate_running_recap',
  COMBINE_SCENE_WITH_RUNNING: 'combine_scene_with_running',
  // Multi-stage lorebook operations
  LOREBOOK_ENTRY_LOOKUP: 'lorebook_entry_lookup',
  RESOLVE_LOREBOOK_ENTRY: 'resolve_lorebook_entry',
  CREATE_LOREBOOK_ENTRY: 'create_lorebook_entry',
  MERGE_LOREBOOK_ENTRY: 'merge_lorebook_entry',
  UPDATE_LOREBOOK_REGISTRY: 'update_lorebook_registry',
  POPULATE_REGISTRIES: 'populate_registries'
};
```

**Total: 11 operation types**

### 1.2 Artifact Operation Types (operationArtifacts.js:5-14)

```javascript
const OPERATION_TYPES = [
  'scene_recap',
  'scene_recap_error_detection',
  'auto_scene_break',
  'running_scene_recap',
  'auto_lorebooks_recap_merge',
  'auto_lorebooks_recap_lorebook_entry_lookup',
  'auto_lorebooks_recap_lorebook_entry_deduplicate',
  'auto_lorebooks_bulk_populate'
];
```

**Total: 8 artifact types**

---

## 2. CRITICAL ISSUE: Naming Mismatch

### 2.1 Operation Types vs Artifacts Mapping (BROKEN)

| Queue OperationType | Artifact Type | Status | Notes |
|-------------------|---------------|--------|-------|
| `VALIDATE_RECAP` | `scene_recap_error_detection` | ❓ UNCLEAR | Used in handler but mapping uncertain |
| `DETECT_SCENE_BREAK` | `auto_scene_break` | ✅ MATCHES | Direct mapping |
| `GENERATE_SCENE_RECAP` | `scene_recap` | ✅ MATCHES | Direct mapping |
| `GENERATE_RUNNING_RECAP` | `running_scene_recap` | ✅ MATCHES | Direct mapping |
| `COMBINE_SCENE_WITH_RUNNING` | ❌ **NO ARTIFACT** | 🔴 MISSING | No prompt configured! |
| `LOREBOOK_ENTRY_LOOKUP` | `auto_lorebooks_recap_lorebook_entry_lookup` | ✅ MATCHES | Direct mapping |
| `RESOLVE_LOREBOOK_ENTRY` | `auto_lorebooks_recap_lorebook_entry_deduplicate` | ✅ MATCHES | Direct mapping |
| `CREATE_LOREBOOK_ENTRY` | ❌ **NO ARTIFACT** | 🔴 MISSING | Uses MERGE artifact when merging |
| `MERGE_LOREBOOK_ENTRY` | `auto_lorebooks_recap_merge` | ✅ MATCHES | Standalone merge operation |
| `UPDATE_LOREBOOK_REGISTRY` | ❌ **NO ARTIFACT** | 🔴 MISSING | No LLM call (registry update only) |
| `POPULATE_REGISTRIES` | `auto_lorebooks_bulk_populate` | ✅ MATCHES | Direct mapping |

**Summary:**
- ✅ **7 operations** have matching artifacts
- 🔴 **3 operations** have NO artifacts configured
- ❓ **1 operation** has unclear mapping (VALIDATE_RECAP)

### 2.2 Why This Is Broken

**Problem:** The system has TWO separate naming conventions:

1. **Queue uses:** `validate_recap`, `detect_scene_break`, `generate_scene_recap`
2. **Artifacts use:** `scene_recap_error_detection`, `auto_scene_break`, `scene_recap`

**Impact:**
- When `resolveOperationConfig('detect_scene_break')` is called:
  - It looks for artifacts with operationType `'detect_scene_break'`
  - But the artifact system stores it as `'auto_scene_break'`
  - **Result:** Returns default artifact or error!

**Evidence from code:**
```javascript
// operationsPresetsResolution.js:169
export function resolveOperationConfig(operationType) {
  // operationType = 'detect_scene_break' (from OperationType enum)
  const artifactName = preset.operations[operationType]; // ❌ UNDEFINED!
  // Because preset.operations has 'auto_scene_break', not 'detect_scene_break'
}
```

---

## 3. Metadata System Analysis

### 3.1 Metadata Fields Written by Operations

#### Common Metadata (operation.metadata):
- `triggered_by` (string) - Why operation was enqueued
- `scene_index` (number) - Scene break message index
- `entry_comment` (string) - Lorebook entry comment
- `hasPrefill` (boolean) - Whether artifact has prefill
- `includePresetPrompts` (boolean) - Whether to include preset prompts

#### Scene Break Specific:
- `range_reduced` (boolean) - Whether range was reduced due to token limits
- `original_end_index` (number) - Original end index before reduction
- `current_end_index` (number) - Current end index after reduction
- `earliest_allowed_break` (number) - Earliest allowed scene break index
- `start_index` (number) - Start index of range
- `end_index` (number) - End index of range

#### Token Breakdown (via updateOperationMetadata):
- `tokens_preset` (number)
- `tokens_system` (number)
- `tokens_user` (number)
- `tokens_prefill` (number)
- `tokens_lorebooks` (number)
- `tokens_messages` (number)
- `tokens_content_subtotal` (number)
- `tokens_json_structure` (number)
- `tokens_metadata` (number)
- `tokens_overhead_subtotal` (number)
- `tokens_total` (number)
- `tokens_max_context` (number)
- `tokens_max_tokens` (number)

### 3.2 Metadata Injection (metadataInjector.js)

**Injected into LLM prompts:**
```javascript
{
  version: '1.0',
  chat: 'ChatName',
  operation: 'operation_type',
  timestamp: '...' (if includeTimestamp),
  operations_preset: 'Default',
  artifact: {
    operation_type: '...',
    name: '...',
    version: 123,
    connection_profile: '...',
    connection_profile_source: 'ST Current' | 'artifact',
    completion_preset: '...',
    completion_preset_source: 'ST Current' | 'artifact'
  },
  tokens: { ... },
  custom: { ... }
}
```

### 3.3 ISSUE: Incomplete Metadata for Operations

**Operations that write token metadata:**
1. ✅ VALIDATE_RECAP (operationHandlers.js:254-260)
2. ✅ DETECT_SCENE_BREAK (operationHandlers.js:334-342)
3. ✅ GENERATE_SCENE_RECAP (operationHandlers.js:541-547)
4. ✅ GENERATE_RUNNING_RECAP (operationHandlers.js:640-647)
5. ✅ COMBINE_SCENE_WITH_RUNNING (operationHandlers.js:665-671)
6. ✅ MERGE_LOREBOOK_ENTRY (operationHandlers.js:697-703)
7. ✅ LOREBOOK_ENTRY_LOOKUP (operationHandlers.js:752-758)
8. ✅ RESOLVE_LOREBOOK_ENTRY (operationHandlers.js:903-909)
9. ✅ POPULATE_REGISTRIES (operationHandlers.js:1301-1307)

**Operations that DON'T write token metadata:**
1. ❌ CREATE_LOREBOOK_ENTRY - **NO token metadata** (no LLM call if creating, only if merging via sub-handler)
2. ❌ UPDATE_LOREBOOK_REGISTRY - **NO token metadata** (no LLM call, registry update only)

**Gap:** CREATE_LOREBOOK_ENTRY calls merge handler which DOES write metadata, but only when action='merge'. When action='create', no metadata is written.

---

## 4. Configuration Resolution Duplication

### 4.1 Where Configuration is Resolved

**File:** `operationsPresetsResolution.js`

**Function:** `resolveOperationConfig(operationType)` (line 169-213)

**What it does:**
1. Calls `resolveOperationsPreset()` to get preset name
2. Looks up artifact in preset
3. Returns artifact configuration

**Logging:** Lines 201-206 (using `SUBSYSTEM.OPERATIONS` which DIDN'T EXIST until just now!)

```javascript
debug(SUBSYSTEM.OPERATIONS, `[${operationType}] Configuration resolved:`);
debug(SUBSYSTEM.OPERATIONS, `  Operations preset: "${presetName}"`);
debug(SUBSYSTEM.OPERATIONS, `  Artifact: "${artifactName}" (version ${artifact.internalVersion})`);
debug(SUBSYSTEM.OPERATIONS, `  Connection profile: ${profileDisplay}`);
debug(SUBSYSTEM.OPERATIONS, `  Completion preset: ${presetDisplay}`);
debug(SUBSYSTEM.OPERATIONS, `  Include preset prompts: ${artifact.include_preset_prompts || false}`);
```

### 4.2 Where Configuration is Used

**operationHandlers.js** builds settings objects manually:

**Example 1: LOREBOOK_ENTRY_LOOKUP handler (lines 719-740)**
```javascript
const mergeConfig = resolveOperationConfig('auto_lorebooks_recap_merge');
const lookupConfig = resolveOperationConfig('auto_lorebooks_recap_lorebook_entry_lookup');
const deduplicateConfig = resolveOperationConfig('auto_lorebooks_recap_lorebook_entry_deduplicate');

const settings = {
  merge_connection_profile: mergeConfig.connection_profile || '',
  merge_completion_preset: mergeConfig.completion_preset_name || '',
  merge_prefill: mergeConfig.prefill || '',
  merge_prompt: mergeConfig.prompt || '',
  lorebook_entry_lookup_connection_profile: lookupConfig.connection_profile || '',
  lorebook_entry_lookup_completion_preset: lookupConfig.completion_preset_name || '',
  // ... MORE FIELDS
};
```

**Example 2: RESOLVE_LOREBOOK_ENTRY handler (lines 844-865)** - **EXACT DUPLICATE**

**Example 3: POPULATE_REGISTRIES handler (lines 1279-1287)**
```javascript
const bulkPopulateConfig = resolveOperationConfig('auto_lorebooks_bulk_populate');

const settings = {
  bulk_populate_prompt: bulkPopulateConfig.prompt,
  bulk_populate_prefill: bulkPopulateConfig.prefill,
  bulk_populate_connection_profile: bulkPopulateConfig.connection_profile,
  bulk_populate_completion_preset: bulkPopulateConfig.completion_preset_name,
  bulk_populate_include_preset_prompts: bulkPopulateConfig.include_preset_prompts
};
```

### 4.3 DUPLICATION ISSUES

**Problem 1: Settings object construction is duplicated**
- LOREBOOK_ENTRY_LOOKUP handler builds merge/lookup/deduplicate settings
- RESOLVE_LOREBOOK_ENTRY handler builds EXACT SAME settings (lines 844-865 duplicate 719-740)
- **This is complete duplication!**

**Problem 2: No centralized mapping**
- Each handler manually calls `resolveOperationConfig(operationType)`
- But operationType uses DIFFERENT names than artifact types
- **Result:** Must manually map operation types to artifact types in each handler

**Problem 3: Logging is incomplete**
- `resolveOperationConfig()` logs configuration using `SUBSYSTEM.OPERATIONS`
- But SUBSYSTEM.OPERATIONS **didn't exist** until I just added it!
- Previous logs showed `undefined` for subsystem

---

## 5. System Architecture Problems

### 5.1 The Core Issue: Two Separate Type Systems

**System 1: Operation Queue**
- Uses: `OperationType` enum (operationQueue.js:49-62)
- Values: `validate_recap`, `detect_scene_break`, `generate_scene_recap`, etc.
- Purpose: Queue management, operation handlers

**System 2: Artifacts**
- Uses: `OPERATION_TYPES` array (operationArtifacts.js:5-14)
- Values: `scene_recap`, `scene_recap_error_detection`, `auto_scene_break`, etc.
- Purpose: Prompt/configuration storage

**The Problem:**
- These should be THE SAME but they're NOT
- When queue uses `detect_scene_break`, artifacts use `auto_scene_break`
- When queue uses `generate_scene_recap`, artifacts use `scene_recap`
- **Result:** Manual mapping required everywhere, prone to errors

### 5.2 Missing Abstraction Layer

**What's Missing:**
- No centralized operation type registry
- No single source of truth for operation types
- No validation that queue types match artifact types
- No type mapping utility

**What's Needed:**
- `OPERATION_DEFINITIONS` object that maps queue types to artifact types
- Single source of truth that both systems reference
- Validation on startup that all queue types have corresponding artifacts

### 5.3 Incomplete Coverage

**Operations WITHOUT artifacts (no prompts configured):**

1. **COMBINE_SCENE_WITH_RUNNING** - 🔴 CRITICAL
   - Handler: operationHandlers.js:654-675
   - Calls: `combine_scene_with_running_recap(index)`
   - **Problem:** Where does this get its prompt/config?
   - **Likely bug:** Uses fallback or wrong artifact

2. **CREATE_LOREBOOK_ENTRY** - ⚠️ CONDITIONAL
   - Handler: operationHandlers.js:1207-1232
   - Action: 'create' or 'merge'
   - **Problem:** When action='create', no LLM call (just adds entry)
   - **Problem:** When action='merge', uses MERGE_LOREBOOK_ENTRY artifact
   - **Result:** Inconsistent - sometimes needs artifact, sometimes doesn't

3. **UPDATE_LOREBOOK_REGISTRY** - ✅ OK
   - Handler: operationHandlers.js:1238-1271
   - **No LLM call** - just updates registry content
   - **Result:** Correctly doesn't need artifact

---

## 6. Required Fixes

### 6.1 CRITICAL: Unify Operation Type Systems

**Problem:** Two separate type systems (OperationType vs OPERATION_TYPES) with different names

**Solution:** Create single source of truth

**File to create:** `operationDefinitions.js`

```javascript
export const OPERATION_DEFINITIONS = {
  // Scene operations
  VALIDATE_RECAP: {
    queueType: 'validate_recap',
    artifactType: 'scene_recap_error_detection',
    requiresLLM: true,
    requiresArtifact: true
  },
  DETECT_SCENE_BREAK: {
    queueType: 'detect_scene_break',
    artifactType: 'auto_scene_break',
    requiresLLM: true,
    requiresArtifact: true
  },
  GENERATE_SCENE_RECAP: {
    queueType: 'generate_scene_recap',
    artifactType: 'scene_recap',
    requiresLLM: true,
    requiresArtifact: true
  },
  GENERATE_RUNNING_RECAP: {
    queueType: 'generate_running_recap',
    artifactType: 'running_scene_recap',
    requiresLLM: true,
    requiresArtifact: true
  },
  COMBINE_SCENE_WITH_RUNNING: {
    queueType: 'combine_scene_with_running',
    artifactType: 'running_scene_recap_combine', // ❌ MISSING - needs to be created!
    requiresLLM: true,
    requiresArtifact: true
  },

  // Lorebook operations
  LOREBOOK_ENTRY_LOOKUP: {
    queueType: 'lorebook_entry_lookup',
    artifactType: 'auto_lorebooks_recap_lorebook_entry_lookup',
    requiresLLM: true,
    requiresArtifact: true
  },
  RESOLVE_LOREBOOK_ENTRY: {
    queueType: 'resolve_lorebook_entry',
    artifactType: 'auto_lorebooks_recap_lorebook_entry_deduplicate',
    requiresLLM: true,
    requiresArtifact: true
  },
  CREATE_LOREBOOK_ENTRY: {
    queueType: 'create_lorebook_entry',
    artifactType: null, // Uses MERGE artifact when merging, none when creating
    requiresLLM: false, // Conditional - only when action='merge'
    requiresArtifact: false
  },
  MERGE_LOREBOOK_ENTRY: {
    queueType: 'merge_lorebook_entry',
    artifactType: 'auto_lorebooks_recap_merge',
    requiresLLM: true,
    requiresArtifact: true
  },
  UPDATE_LOREBOOK_REGISTRY: {
    queueType: 'update_lorebook_registry',
    artifactType: null,
    requiresLLM: false,
    requiresArtifact: false
  },
  POPULATE_REGISTRIES: {
    queueType: 'populate_registries',
    artifactType: 'auto_lorebooks_bulk_populate',
    requiresLLM: true,
    requiresArtifact: true
  }
};

// Export queue types for operationQueue.js
export const OperationType = Object.fromEntries(
  Object.entries(OPERATION_DEFINITIONS).map(([key, def]) => [key, def.queueType])
);

// Export artifact types for operationArtifacts.js
export const OPERATION_TYPES = Object.values(OPERATION_DEFINITIONS)
  .filter(def => def.artifactType !== null)
  .map(def => def.artifactType);

// Utility: Map queue type to artifact type
export function getArtifactType(queueType) {
  const def = Object.values(OPERATION_DEFINITIONS).find(d => d.queueType === queueType);
  return def?.artifactType || null;
}

// Utility: Map artifact type to queue type
export function getQueueType(artifactType) {
  const def = Object.values(OPERATION_DEFINITIONS).find(d => d.artifactType === artifactType);
  return def?.queueType || null;
}
```

**Then update:**
- `operationQueue.js` - import OperationType from definitions
- `operationArtifacts.js` - import OPERATION_TYPES from definitions
- `operationsPresetsResolution.js` - use `getArtifactType()` for mapping

### 6.2 Fix resolveOperationConfig to use mapping

**Current code (BROKEN):**
```javascript
export function resolveOperationConfig(operationType) {
  // operationType = 'detect_scene_break'
  const artifactName = preset.operations[operationType]; // ❌ UNDEFINED!
}
```

**Fixed code:**
```javascript
import { getArtifactType } from './operationDefinitions.js';

export function resolveOperationConfig(operationType) {
  // Map queue type to artifact type
  const artifactType = getArtifactType(operationType);
  if (!artifactType) {
    error(SUBSYSTEM.CORE, `No artifact type for operation: ${operationType}`);
    return getDefaultArtifact(operationType);
  }

  const artifactName = preset.operations[artifactType]; // ✅ CORRECT!
  // ...
}
```

### 6.3 Create Missing Artifact for COMBINE_SCENE_WITH_RUNNING

**Problem:** Operation exists but has no artifact/prompt configured

**Solution:**
1. Add to `operationDefinitions.js`:
   ```javascript
   COMBINE_SCENE_WITH_RUNNING: {
     queueType: 'combine_scene_with_running',
     artifactType: 'running_scene_recap_combine',
     requiresLLM: true,
     requiresArtifact: true
   }
   ```

2. Add to `default_settings.operation_artifacts`:
   ```javascript
   running_scene_recap_combine: [{
     name: 'Default',
     prompt: '...',  // Extract from combine_scene_with_running_recap() function
     prefill: '',
     connection_profile: null,
     completion_preset_name: '',
     include_preset_prompts: false,
     isDefault: true,
     internalVersion: 1
   }]
   ```

3. Update `runningSceneRecap.js` to use artifact instead of hardcoded prompt

### 6.4 Centralize Settings Construction

**Problem:** Handlers duplicate settings object construction

**Current (DUPLICATED):**
```javascript
// In LOREBOOK_ENTRY_LOOKUP handler (lines 719-740)
const mergeConfig = resolveOperationConfig('auto_lorebooks_recap_merge');
const lookupConfig = resolveOperationConfig('auto_lorebooks_recap_lorebook_entry_lookup');
const deduplicateConfig = resolveOperationConfig('auto_lorebooks_recap_lorebook_entry_deduplicate');

const settings = {
  merge_connection_profile: mergeConfig.connection_profile || '',
  merge_completion_preset: mergeConfig.completion_preset_name || '',
  merge_prefill: mergeConfig.prefill || '',
  merge_prompt: mergeConfig.prompt || '',
  // ... etc
};

// In RESOLVE_LOREBOOK_ENTRY handler (lines 844-865)
// EXACT SAME CODE - complete duplication!
```

**Solution:** Create utility function

**File:** `operationsPresetsResolution.js`

```javascript
export function buildLorebookOperationsSettings() {
  const mergeConfig = resolveOperationConfig('merge_lorebook_entry');
  const lookupConfig = resolveOperationConfig('lorebook_entry_lookup');
  const deduplicateConfig = resolveOperationConfig('resolve_lorebook_entry');

  return {
    merge_connection_profile: mergeConfig.connection_profile || '',
    merge_completion_preset: mergeConfig.completion_preset_name || '',
    merge_prefill: mergeConfig.prefill || '',
    merge_prompt: mergeConfig.prompt || '',
    merge_include_preset_prompts: mergeConfig.include_preset_prompts ?? false,

    lorebook_entry_lookup_connection_profile: lookupConfig.connection_profile || '',
    lorebook_entry_lookup_completion_preset: lookupConfig.completion_preset_name || '',
    lorebook_entry_lookup_prefill: lookupConfig.prefill || '',
    lorebook_entry_lookup_prompt: lookupConfig.prompt || '',
    lorebook_entry_lookup_include_preset_prompts: lookupConfig.include_preset_prompts ?? false,

    lorebook_entry_deduplicate_connection_profile: deduplicateConfig.connection_profile || '',
    lorebook_entry_deduplicate_completion_preset: deduplicateConfig.completion_preset_name || '',
    lorebook_entry_deduplicate_prefill: deduplicateConfig.prefill || '',
    lorebook_entry_deduplicate_prompt: deduplicateConfig.prompt || '',
    lorebook_entry_deduplicate_include_preset_prompts: deduplicateConfig.include_preset_prompts ?? false,

    skip_duplicates: get_settings('auto_lorebooks_recap_skip_duplicates') ?? true
  };
}
```

**Then in handlers:**
```javascript
// operationHandlers.js:712
registerOperationHandler(OperationType.LOREBOOK_ENTRY_LOOKUP, async (operation) => {
  const settings = buildLorebookOperationsSettings(); // ✅ ONE LINE instead of 20!
  // ...
});

// operationHandlers.js:831
registerOperationHandler(OperationType.RESOLVE_LOREBOOK_ENTRY, async (operation) => {
  const settings = buildLorebookOperationsSettings(); // ✅ SAME!
  // ...
});
```

### 6.5 Fix Metadata Injection for All Operations

**Problem:** Some operations don't get artifact metadata

**Solution:** Ensure every LLM call passes `operationType` to metadata injection

**Check these files:**
- `recapping.js` - scene recap generation
- `recapValidation.js` - recap validation
- `autoSceneBreakDetection.js` - scene break detection
- `runningSceneRecap.js` - running recap and combine operations
- `recapToLorebookProcessor.js` - lorebook operations

**Ensure all call sites use:**
```javascript
await injectMetadata(prompt, {
  operation: 'operation_name',
  operationType: 'queue_operation_type', // ✅ REQUIRED for artifact metadata
  includeTimestamp: true,
  tokenBreakdown: breakdown,
  custom: { ... }
});
```

### 6.6 Remove SUBSYSTEM.OPERATIONS (Just Added It, Should Not Have)

**Problem:** I just added `SUBSYSTEM.OPERATIONS` but it duplicates existing subsystems

**Existing subsystems that cover operations:**
- `SUBSYSTEM.QUEUE` - for queue operations
- `SUBSYSTEM.CORE` - for configuration resolution
- `SUBSYSTEM.LOREBOOK` - for lorebook operations

**Solution:** Remove `SUBSYSTEM.OPERATIONS` and use existing subsystems:
- Configuration resolution logging → `SUBSYSTEM.CORE`
- Queue handler logging → `SUBSYSTEM.QUEUE`
- Lorebook logging → `SUBSYSTEM.LOREBOOK`

---

## 7. Impact Analysis

### 7.1 Current State: BROKEN

**Symptoms:**
- Operations use wrong artifacts (fallback to Default)
- Configuration resolution logs show `undefined` for subsystem
- Duplicate code across handlers
- Missing prompts for COMBINE_SCENE_WITH_RUNNING
- Inconsistent metadata across operations

### 7.2 After Fixes: WORKING

**Benefits:**
1. ✅ Single source of truth for operation types
2. ✅ Automatic validation that all operations have artifacts
3. ✅ No more manual mapping in handlers
4. ✅ Centralized settings construction (DRY)
5. ✅ Complete metadata for all operations
6. ✅ Proper logging with correct subsystems

---

## 8. Summary of Required Changes

### Files to Create:
1. **operationDefinitions.js** - Single source of truth for operation types

### Files to Modify:
1. **operationQueue.js** - Import OperationType from definitions
2. **operationArtifacts.js** - Import OPERATION_TYPES from definitions
3. **operationsPresetsResolution.js**:
   - Add `buildLorebookOperationsSettings()`
   - Update `resolveOperationConfig()` to use `getArtifactType()`
   - Change logging from `SUBSYSTEM.OPERATIONS` to `SUBSYSTEM.CORE`
4. **operationHandlers.js** - Replace duplicated settings construction with utility call
5. **utils.js** - Remove `OPERATIONS: '[Operations]'` from SUBSYSTEM
6. **default_settings.js** - Add `running_scene_recap_combine` artifact
7. **runningSceneRecap.js** - Update to use artifact instead of hardcoded prompt
8. **All LLM calling files** - Ensure `operationType` passed to metadata injection

### Testing Required:
1. Verify all 11 operation types resolve to correct artifacts
2. Verify metadata includes artifact info for all operations
3. Verify no duplicate settings construction
4. Verify COMBINE_SCENE_WITH_RUNNING uses new artifact
5. Verify logging uses correct subsystems

---

## Appendix A: Complete Operation Type Mapping Table

| Operation Key | Queue Type | Artifact Type | Has Artifact | Requires LLM | Handler | Notes |
|--------------|------------|---------------|--------------|--------------|---------|-------|
| VALIDATE_RECAP | `validate_recap` | `scene_recap_error_detection` | ✅ | ✅ | operationHandlers.js:243 | Validates recap quality |
| DETECT_SCENE_BREAK | `detect_scene_break` | `auto_scene_break` | ✅ | ✅ | operationHandlers.js:268 | Detects scene breaks in range |
| GENERATE_SCENE_RECAP | `generate_scene_recap` | `scene_recap` | ✅ | ✅ | operationHandlers.js:512 | Generates scene recap |
| GENERATE_RUNNING_RECAP | `generate_running_recap` | `running_scene_recap` | ✅ | ✅ | operationHandlers.js:631 | Generates bulk running recap |
| COMBINE_SCENE_WITH_RUNNING | `combine_scene_with_running` | ❌ **MISSING** | ❌ | ✅ | operationHandlers.js:654 | Combines scene into running |
| LOREBOOK_ENTRY_LOOKUP | `lorebook_entry_lookup` | `auto_lorebooks_recap_lorebook_entry_lookup` | ✅ | ✅ | operationHandlers.js:712 | Lookup existing entities |
| RESOLVE_LOREBOOK_ENTRY | `resolve_lorebook_entry` | `auto_lorebooks_recap_lorebook_entry_deduplicate` | ✅ | ✅ | operationHandlers.js:831 | Deduplicate entities |
| CREATE_LOREBOOK_ENTRY | `create_lorebook_entry` | N/A | N/A | Conditional | operationHandlers.js:1207 | Create or merge entry |
| MERGE_LOREBOOK_ENTRY | `merge_lorebook_entry` | `auto_lorebooks_recap_merge` | ✅ | ✅ | operationHandlers.js:678 | Standalone merge |
| UPDATE_LOREBOOK_REGISTRY | `update_lorebook_registry` | N/A | N/A | ❌ | operationHandlers.js:1238 | Update registry content |
| POPULATE_REGISTRIES | `populate_registries` | `auto_lorebooks_bulk_populate` | ✅ | ✅ | operationHandlers.js:1273 | Bulk populate registries |

---

**END OF ASSESSMENT**

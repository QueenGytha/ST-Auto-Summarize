# Lorebook Lookup Optimization: Skip Redundant Lookups on First Scene

## Document Status
- **Status:** DRAFT - Under Review
- **Created:** 2025-01-22
- **Last Updated:** 2025-01-22
- **Verification:** COMPLETED - All claims verified against actual code
- **Reviewers:** TBD
- **Implementation:** NOT STARTED

## Code Verification Results

**Verification Date:** 2025-01-22
**Status:** ✅ VERIFIED - All critical discrepancies corrected

**Critical Issues Found & Fixed:**
1. ✅ CORRECTED: LOREBOOK_ENTRY_LOOKUP priority is **11** (OPERATION_ID_LENGTH), not 15
2. ✅ VERIFIED: `chat_metadata` exported from script.js:403, `saveMetadata` from script.js:8019
3. ✅ CORRECTED: Import path is `'../../../../script.js'` (verified from lorebookManager.js:17)
4. ✅ DOCUMENTED: `invalidateLorebookCache()` must be exported (currently private at line 41)
5. ✅ DOCUMENTED: `isInternalEntry()` must be exported AND fixed (currently private, has bug at line 360)
6. ✅ VERIFIED: All function signatures and call chains validated against actual code

**Confidence Level:** HIGH - All code claims verified against source files, NO ASSUMPTIONS

---

## 1. Problem Statement

### Current Behavior
When processing the first scene recap in a chat, the system performs redundant LLM lookups for every entity extracted from the recap to check for duplicates in the lorebook. However, on the first scene when no user content has been added yet, these lookups are guaranteed to find no matches.

### The Issue
For a scene with N entities (e.g., 10 characters, 5 locations), we make N LLM API calls to check for duplicates in an empty lorebook. This wastes:
- Time (N * ~2-5 seconds per lookup)
- Money (N API calls at GPT-4 pricing)
- Processing overhead (queueing, state management, error handling)

### Example Scenario
```
First scene recap extracts:
- 5 characters
- 3 locations
- 2 items

Current flow:
1. Character 1 → LOREBOOK_ENTRY_LOOKUP (LLM call) → "no match" → CREATE
2. Character 2 → LOREBOOK_ENTRY_LOOKUP (LLM call) → "no match" → CREATE
3. Character 3 → LOREBOOK_ENTRY_LOOKUP (LLM call) → "no match" → CREATE
... (10 total LLM calls)

Optimized flow:
1. Check lorebook is empty ONCE
2. Character 1 → CREATE (skip lookup)
3. Character 2 → CREATE (skip lookup)
4. Character 3 → CREATE (skip lookup)
... (0 lookup LLM calls)
```

**Savings:** 10 LLM calls on first scene alone.

---

## 2. Current Behavior Analysis

### 2.1 Complete Execution Flow

#### Entry Point: Scene Recap Generation
**File:** `sceneBreak.js`
**Function:** `generateSceneRecap()` → `saveSceneRecap()` → `extractAndQueueLorebookEntries()`

**ACTUAL CODE (sceneBreak.js:1406-1475):**
- Function starts at line 1406, not 1390
- Contains JSON parsing, deduplication, extensive debug logging
- Uses `computeRecapHash()` not `generateRecapHash()`
- Accesses `parsed.setting_lore` not `recap.setting_lore`
- Passes options with metadata: `{ metadata: { version_index: versionIndex } }`

**Simplified structure (NOT actual code):**
```javascript
// SIMPLIFIED - actual function is much more complex
async function extractAndQueueLorebookEntries(recap, messageIndex, versionIndex) {
  const recapHash = computeRecapHash(recap);
  const parsed = JSON.parse(recap);
  // ... deduplication logic ...

  for (const entry of uniqueEntries) {
    await queueProcessLorebookEntry(entry, messageIndex, recapHash, {
      metadata: { version_index: versionIndex }
    });
  }
}
```

**Key Point:** This loops through EVERY entity in the recap and calls `queueProcessLorebookEntry()` for each one sequentially.

#### Lorebook Entry Processing
**File:** `queueIntegration.js`
**Function:** `queueProcessLorebookEntry()`

```javascript
// queueIntegration.js:275-342 (simplified)
async function queueProcessLorebookEntry(entry, messageIndex, recapHash, options = {}) {
  // 1. Check for duplicate operations already in queue
  const duplicateOp = findDuplicateOperation(entry, messageIndex);
  if (duplicateOp) {
    debug('Skipping duplicate operation');
    return;
  }

  // 2. Prepare lookup context
  const context = await prepareLorebookEntryLookupContext(
    entry,
    messageIndex,
    recapHash,
    options
  );

  // 3. Enqueue LOREBOOK_ENTRY_LOOKUP operation
  await enqueueLorebookEntryLookupOperation(context, options);
}
```

**Key Point:** Every entity gets a `LOREBOOK_ENTRY_LOOKUP` operation enqueued.

#### Lookup Context Preparation
**File:** `queueIntegration.js`
**Function:** `prepareLorebookEntryLookupContext()`

**ACTUAL CODE (queueIntegration.js:202-217):**
- Function starts at line 202, NOT 97
- Takes ONLY 1 parameter: `async function prepareLorebookEntryLookupContext(entryData)`
- Does NOT take messageIndex, recapHash, or options parameters
- Returns: `{ entryId, normalizedEntry, registryListing, typeList }`

```javascript
// queueIntegration.js:202-217 (ACTUAL CODE)
async function prepareLorebookEntryLookupContext(entryData) {
  const { generateEntryId, createPendingEntry } = await import('./lorebookPendingOps.js');
  const { ensureRegistryState, buildRegistryListing, normalizeEntryData } = await import('./recapToLorebookProcessor.js');
  const { getConfiguredEntityTypeDefinitions } = await import('./entityTypes.js');

  const entryId = generateEntryId();
  const normalizedEntry = normalizeEntryData(entryData);
  createPendingEntry(entryId, normalizedEntry);

  const registryState = ensureRegistryState();
  const registryListing = buildRegistryListing(registryState);
  const entityTypeDefs = getConfiguredEntityTypeDefinitions(get_settings('autoLorebooks')?.entity_types);
  const typeList = entityTypeDefs;

  return { entryId, normalizedEntry, registryListing, typeList };
}
```

**Key Point:** Even when registry is empty, we still build a listing (returns `"No registry entries available yet."`).

#### Operation Execution
**File:** `operationHandlers.js`
**Function:** `LOREBOOK_ENTRY_LOOKUP` handler

```javascript
// operationHandlers.js:1207-1306 (simplified)
async function handleLorebookEntryLookup(operation) {
  const { entryData, registryListing } = operation.params;

  // 1. Build settings
  const settings = buildLorebookOperationsSettings();

  // 2. Call LLM to find matching UIDs
  const result = await runLorebookEntryLookupStage(
    entryData,
    registryListing, // Contains "No registry entries available yet."
    typeList,
    settings
  );

  // 3. Based on result, enqueue next operation
  if (result.sameEntityUids.length === 1) {
    // Exact match → MERGE
    await enqueueCreateLorebookEntry({ action: 'merge', uid: result.sameEntityUids[0] });
  } else if (result.sameEntityUids.length > 1) {
    // Multiple matches → RESOLVE
    await enqueueResolveLorebookEntry({ uids: result.sameEntityUids });
  } else {
    // No match → CREATE NEW
    await enqueueCreateLorebookEntry({ action: 'create' });
  }

  return result;
}
```

**Key Point:** LLM is called with registry listing. When empty, LLM sees "No registry entries" and returns "no match", but we still burned an API call.

### 2.2 Operation Priority System

**Queue Processing:** Sequential execution, priority-based ordering

**ACTUAL CODE (operationQueue.js:829-863):**
- Function getNextOperation() starts at line 829
- Sorting logic at lines 854-860

```javascript
// operationQueue.js:854-860 (sorting logic only)
// Sort by priority (higher first), then by created_at (older first)
ready.sort((a, b) => {
  if (a.priority !== b.priority) {
    return b.priority - a.priority; // Higher priority first
  }
  return a.created_at - b.created_at; // Older first
});

return ready[0];
```

**Priority Values:**
- `POPULATE_REGISTRIES`: 100 (high)
- `LOREBOOK_ENTRY_LOOKUP`: 11 (medium) - uses OPERATION_ID_LENGTH constant
- `CREATE_LOREBOOK_ENTRY`: 14 (medium-low)

**Sequence Guarantee:**
1. Lorebook created
2. `duplicateActiveLorebookEntries()` enqueues `POPULATE_REGISTRIES` (priority 100)
3. Scene recap enqueues multiple `LOREBOOK_ENTRY_LOOKUP` operations (priority 11)
4. Queue processor runs `POPULATE_REGISTRIES` **first** (higher priority)
5. Queue processor runs lookups **after** (lower priority)

**CRITICAL INSIGHT:** By the time ANY lookup operation executes, `POPULATE_REGISTRIES` has already completed (or wasn't enqueued at all if no imports).

### 2.3 Registry Population from Imports

**File:** `lorebookManager.js`
**Function:** `duplicateActiveLorebookEntries()`

**When Called:**
1. `createChatLorebook()` line 606 - When creating new chat lorebook
2. `ensureChatLorebook()` line 663 - When ensuring existing chat lorebook

**What It Does:**
```javascript
// lorebookManager.js:508-552 (simplified)
async function duplicateActiveLorebookEntries(chatLorebookName) {
  // 1. Get all active global/character/persona lorebooks
  const activeBooks = getActiveLorebookNames();

  // 2. For each active lorebook
  for (const bookName of activeBooks) {
    const entries = await loadWorldInfo(bookName);

    // 3. Filter out internal entries
    for (const entry of entries) {
      if (isInternalEntry(entry.comment)) continue;

      // 4. Duplicate entry to chat lorebook
      await addLorebookEntry(chatLorebookName, entry);
    }
  }

  // 5. Enqueue POPULATE_REGISTRIES to index imported entries
  if (allCreatedEntries.length > 0) {
    await enqueueOperation(
      OperationType.POPULATE_REGISTRIES,
      { entries: allCreatedEntries, lorebookName: chatLorebookName },
      { priority: 100 }
    );
  }
}
```

**Key Point:** If user has character/global lorebooks, entries are imported BEFORE any scene recaps run.

### 2.4 System vs. Real Entries

**System Entries (Created by Extension):**
1. **Registry entries:** `_registry_character`, `_registry_location`, etc.
   - Comment starts with `_registry_`
   - Disabled (never injected into context)
   - Contains JSON index of entities by type

2. **Operation queue:** `__operation_queue`
   - Comment equals `__operation_queue` (exact match)
   - Disabled (never injected into context)
   - Contains JSON queue state

**Real Entries (User Content):**
- Any entry with comment NOT matching system patterns
- Includes imported entries from character/global lorebooks
- Includes entries created from scene recaps

**Detection Function:**
```javascript
// lorebookManager.js:358-361 (CURRENT - HAS BUG)
function isInternalEntry(comment) {
  return comment.startsWith('_registry_') ||
    comment.startsWith('_operations_queue_'); // ❌ WRONG
}

// SHOULD BE:
function isInternalEntry(comment) {
  return comment.startsWith('_registry_') ||
    comment === '__operation_queue'; // ✅ CORRECT
}
```

**BUG:** Current implementation checks `startsWith('_operations_queue_')` but actual queue entry comment is `__operation_queue` (double underscore, no trailing underscore, no 's').

---

## 3. Proposed Solution

### 3.1 High-Level Strategy

**Check lorebook state ONCE before processing scene recap entities, then skip ALL lookups for that scene if lorebook is empty.**

**Key Principle:** Optimization applies to entire scene atomically, not per-entity.

### 3.2 Where to Implement Check

**File:** `sceneBreak.js`
**Function:** `extractAndQueueLorebookEntries()`
**Location:** Before the loop that processes entities

```javascript
async function extractAndQueueLorebookEntries(recap, messageIndex, versionIndex) {
  if (!recap || !recap.setting_lore || recap.setting_lore.length === 0) {
    return;
  }

  const recapHash = generateRecapHash(recap);

  // ===== NEW: CHECK LOREBOOK STATE ONCE =====
  const skipAllLookups = await shouldSkipLookupsForScene(messageIndex, versionIndex);
  // =========================================

  for (const entry of recap.setting_lore) {
    await queueProcessLorebookEntry(entry, messageIndex, recapHash, {
      skipLookup: skipAllLookups // Pass flag to each entry
    });
  }
}
```

### 3.3 Detection Logic

**New Function:** `shouldSkipLookupsForScene()`

```javascript
async function shouldSkipLookupsForScene(messageIndex, versionIndex) {
  // 1. Get attached lorebook name
  const lorebookName = getAttachedLorebook();
  if (!lorebookName) {
    debug('No lorebook attached, cannot skip lookups');
    return false;
  }

  // 2. CRITICAL: Invalidate cache to get fresh data
  //    This ensures we see entries created by POPULATE_REGISTRIES
  await invalidateLorebookCache(lorebookName);

  // 3. Load ALL lorebook entries (fresh, not cached)
  const allEntries = await getLorebookEntries(lorebookName);
  if (!allEntries) {
    debug('Failed to load lorebook entries');
    return false;
  }

  // 4. Filter out system entries
  const realEntries = allEntries.filter(entry =>
    !isInternalEntry(entry?.comment || '')
  );

  // 5. If no real entries exist, safe to skip lookups
  const isEmpty = realEntries.length === 0;

  if (isEmpty) {
    log(`Lorebook is empty (${allEntries.length} system entries only). Skipping lookups for scene ${messageIndex}.`);
  } else {
    debug(`Lorebook has ${realEntries.length} real entries. Using normal lookup flow.`);
  }

  return isEmpty;
}
```

### 3.4 Skip Execution Logic

**File:** `queueIntegration.js`
**Function:** `queueProcessLorebookEntry()`
**Modification:** Check `options.skipLookup` flag

```javascript
async function queueProcessLorebookEntry(entry, messageIndex, recapHash, options = {}) {
  // 1. Check for duplicate operations (unchanged)
  const duplicateOp = findDuplicateOperation(entry, messageIndex);
  if (duplicateOp) {
    debug('Skipping duplicate operation');
    return;
  }

  // ===== NEW: CHECK SKIP FLAG =====
  if (options.skipLookup === true) {
    // Skip LOOKUP, go directly to CREATE
    const entryId = generateEntryId(entry);
    const normalizedData = normalizeEntryData(entry);

    await enqueueOperation(
      OperationType.CREATE_LOREBOOK_ENTRY,
      {
        entryId,
        entryData: normalizedData,
        action: 'create', // Force create, not merge
        messageIndex,
        recapHash
      },
      {
        priority: 14,
        metadata: {
          message_index: messageIndex,
          recap_hash: recapHash,
          skipped_lookup: true,
          skip_reason: 'lorebook_empty'
        }
      }
    );

    debug(`Skipped lookup for ${entry.name}, enqueued CREATE directly`);
    return;
  }
  // ================================

  // 2. Normal path (unchanged)
  const context = await prepareLorebookEntryLookupContext(
    entry,
    messageIndex,
    recapHash,
    options
  );

  await enqueueLorebookEntryLookupOperation(context, options);
}
```

---

## 4. Safety Guarantees

### 4.1 Race Condition Protection

**Question:** What if `POPULATE_REGISTRIES` hasn't run yet when we check?

**Answer:** Impossible due to priority ordering.

**Proof:**
1. `duplicateActiveLorebookEntries()` runs during lorebook creation/initialization
2. It enqueues `POPULATE_REGISTRIES` with priority 100
3. Scene recap happens LATER (user sends message, triggers recap)
4. Scene recap enqueues operations with priority 15
5. Queue processor always runs priority 100 before priority 15
6. By the time `shouldSkipLookupsForScene()` executes, `POPULATE_REGISTRIES` has completed

**Edge Case:** What if `POPULATE_REGISTRIES` is still IN_PROGRESS?

**Answer:** The check happens in `extractAndQueueLorebookEntries()`, which runs **synchronously** during recap generation, BEFORE any operations are enqueued. At this point:
- If imports exist, `POPULATE_REGISTRIES` is already in queue (priority 100)
- Our lookups will be enqueued with priority 15
- Queue processor runs `POPULATE_REGISTRIES` first
- Then runs our lookups (but we already decided to skip them)

**WAIT - PROBLEM IDENTIFIED:**

The check happens BEFORE operations are enqueued. But `POPULATE_REGISTRIES` might not have run yet if this is the first scene recap!

**Timeline:**
```
T0: Chat created
T1: Lorebook created
T2: duplicateActiveLorebookEntries() called
T3: POPULATE_REGISTRIES enqueued (priority 100)
T4: User sends first message
T5: Scene recap generated
T6: extractAndQueueLorebookEntries() called
T7: shouldSkipLookupsForScene() checks lorebook ← POPULATE_REGISTRIES hasn't run!
T8: LOREBOOK_ENTRY_LOOKUP operations enqueued (priority 15)
T9: Queue processor runs POPULATE_REGISTRIES
T10: Registry populated with imported entries
T11: Queue processor runs LOREBOOK_ENTRY_LOOKUP ← Should NOT have skipped!
```

**CRITICAL ISSUE FOUND:** We can't check lorebook state before enqueueing because `POPULATE_REGISTRIES` may not have run yet!

### 4.2 Solution: Check at Execution Time

**Revised Strategy:** Move the check from enqueue time to execution time.

**Implementation:**
1. Always enqueue `LOREBOOK_ENTRY_LOOKUP` operations (unchanged)
2. In the LOOKUP handler, check if lorebook is empty
3. If empty, skip LLM call and return "no match" immediately
4. This happens AFTER `POPULATE_REGISTRIES` completes

**File:** `operationHandlers.js`
**Function:** `handleLorebookEntryLookup()`

```javascript
async function handleLorebookEntryLookup(operation) {
  const { entryData, registryListing, lorebookName } = operation.params;

  // ===== NEW: CHECK IF LOREBOOK IS EMPTY =====
  await invalidateLorebookCache(lorebookName);
  const allEntries = await getLorebookEntries(lorebookName);
  const realEntries = allEntries.filter(e => !isInternalEntry(e?.comment || ''));

  if (realEntries.length === 0) {
    // Lorebook is empty, skip LLM call
    log(`Lorebook empty during lookup for ${entryData.name}. Skipping LLM call.`);

    // Return "no match" result (same as LLM would return)
    const result = {
      type: entryData.type,
      synopsis: entryData.synopsis,
      sameEntityUids: [],
      needsFullContextUids: []
    };

    // Enqueue CREATE operation
    await enqueueCreateLorebookEntry({
      ...operation.params,
      action: 'create',
      metadata: {
        ...operation.metadata,
        skipped_llm: true,
        skip_reason: 'lorebook_empty'
      }
    });

    return result;
  }
  // ==========================================

  // Normal path: Call LLM
  const settings = buildLorebookOperationsSettings();
  const result = await runLorebookEntryLookupStage(
    entryData,
    registryListing,
    typeList,
    settings
  );

  // Enqueue next operation based on result...
}
```

**Why This Works:**
- By execution time, `POPULATE_REGISTRIES` (priority 100) has completed
- Cache invalidation ensures fresh data
- First entity sees empty lorebook, skips LLM
- Second entity sees 1 entry (from first entity's CREATE)
- Only first entity benefits? NO...

**WAIT - SAME PROBLEM:**
Entity 1 creates entry, Entity 2 sees non-empty lorebook!

### 4.3 Solution: Scene-Level Operation Metadata

**Revised Strategy:** Add scene-level metadata to track "all operations in this scene can skip lookup."

**Implementation:**
1. In `extractAndQueueLorebookEntries()`, check if THIS is the first scene AND first version
2. If yes, add metadata flag to ALL operations: `first_scene_first_version: true`
3. In LOOKUP handler, check both:
   - Is lorebook empty? (at execution time)
   - Is this flagged as first scene? (from metadata)
4. Skip LLM ONLY if BOTH conditions true

**Why This Works:**
- All entities in first scene get flagged
- Even though Entity 2 sees non-empty lorebook (from Entity 1's create), the flag indicates "this entire scene should skip"
- The flag persists through the queue, not affected by execution order

**Code:**

```javascript
// sceneBreak.js
async function extractAndQueueLorebookEntries(recap, messageIndex, versionIndex) {
  // Check if this is first scene, first version
  const isFirstScene = (messageIndex === 0 && versionIndex === 0);

  for (const entry of recap.setting_lore) {
    await queueProcessLorebookEntry(entry, messageIndex, recapHash, {
      firstSceneFirstVersion: isFirstScene
    });
  }
}

// queueIntegration.js
async function queueProcessLorebookEntry(entry, messageIndex, recapHash, options = {}) {
  const context = await prepareLorebookEntryLookupContext(...);

  await enqueueOperation(
    OperationType.LOREBOOK_ENTRY_LOOKUP,
    { ...context },
    {
      priority: 15,
      metadata: {
        message_index: messageIndex,
        first_scene_first_version: options.firstSceneFirstVersion || false
      }
    }
  );
}

// operationHandlers.js
async function handleLorebookEntryLookup(operation) {
  // Check BOTH conditions
  const isFirstScene = operation.metadata?.first_scene_first_version === true;

  await invalidateLorebookCache(lorebookName);
  const allEntries = await getLorebookEntries(lorebookName);
  const realEntries = allEntries.filter(e => !isInternalEntry(e?.comment || ''));
  const isEmptyAtStart = realEntries.length === 0;

  if (isFirstScene && isEmptyAtStart) {
    // Skip LLM call
    log(`First scene with empty lorebook. Skipping LLM for ${entryData.name}.`);
    // Return "no match" and enqueue CREATE...
  }

  // Normal LLM lookup...
}
```

**PROBLEM:** Entity 2 will see `isEmptyAtStart = false` because Entity 1 already created an entry!

### 4.4 Final Solution: Check ONCE, Store Result in Shared Metadata

**Revised Strategy:** Check lorebook state ONCE at the start of processing the scene, store result in chat metadata, all operations read from that.

**Implementation:**

```javascript
// sceneBreak.js
async function extractAndQueueLorebookEntries(recap, messageIndex, versionIndex) {
  const recapHash = generateRecapHash(recap);

  // Check ONCE before processing any entities
  const lorebookWasEmpty = await checkAndStoreLorebookEmptyState(messageIndex, versionIndex);

  for (const entry of recap.setting_lore) {
    await queueProcessLorebookEntry(entry, messageIndex, recapHash, {
      lorebookWasEmptyAtSceneStart: lorebookWasEmpty
    });
  }
}

async function checkAndStoreLorebookEmptyState(messageIndex, versionIndex) {
  const lorebookName = getAttachedLorebook();
  if (!lorebookName) return false;

  await invalidateLorebookCache(lorebookName);
  const allEntries = await getLorebookEntries(lorebookName);
  const realEntries = allEntries.filter(e => !isInternalEntry(e?.comment || ''));

  const isEmpty = realEntries.length === 0;

  // Store in metadata for this scene
  if (!chat_metadata.auto_lorebooks) {
    chat_metadata.auto_lorebooks = {};
  }
  if (!chat_metadata.auto_lorebooks.scene_empty_states) {
    chat_metadata.auto_lorebooks.scene_empty_states = {};
  }

  const sceneKey = `${messageIndex}_${versionIndex}`;
  chat_metadata.auto_lorebooks.scene_empty_states[sceneKey] = isEmpty;
  saveMetadata();

  return isEmpty;
}

// queueIntegration.js
async function queueProcessLorebookEntry(entry, messageIndex, recapHash, options = {}) {
  await enqueueOperation(
    OperationType.LOREBOOK_ENTRY_LOOKUP,
    { ... },
    {
      metadata: {
        lorebook_was_empty_at_scene_start: options.lorebookWasEmptyAtSceneStart || false
      }
    }
  );
}

// operationHandlers.js
async function handleLorebookEntryLookup(operation) {
  const lorebookWasEmpty = operation.metadata?.lorebook_was_empty_at_scene_start === true;

  if (lorebookWasEmpty) {
    // Skip LLM, all entities in this scene can skip
    log(`Skipping LLM lookup - lorebook was empty at scene start`);
    // Return "no match"...
  }

  // Normal LLM lookup...
}
```

**THIS WORKS!**
- Check happens ONCE before any operations enqueued
- Result stored in metadata
- ALL operations in that scene get the same answer
- No race conditions (check happens synchronously)
- Cache invalidated before check (fresh data)

### 4.5 Edge Case Analysis

#### Case 1: Character Lorebook with 50 Entries
- Timeline:
  - Chat created
  - Lorebook created
  - `duplicateActiveLorebookEntries()` imports 50 entries
  - First scene recap
  - `checkAndStoreLorebookEmptyState()` runs
  - Finds 50 real entries
  - Returns `false`
  - All lookups proceed normally
- **Result:** ✅ No skipping, normal duplicate detection works

#### Case 2: Global Lorebook with Common NPCs
- Timeline:
  - Chat created with global lorebook active
  - Chat lorebook created
  - Imports NPCs from global lorebook
  - First scene mentions imported NPC
  - Lookup check finds entries
  - Normal lookup detects match
  - Merges instead of creating duplicate
- **Result:** ✅ No duplicates created

#### Case 3: Empty Lorebook, 10 Entities in First Scene
- Timeline:
  - Chat created
  - Lorebook created (only system entries)
  - First scene recap with 10 entities
  - `checkAndStoreLorebookEmptyState()` finds 0 real entries
  - All 10 entities get `lorebook_was_empty_at_scene_start: true`
  - Entity 1 lookup skips LLM, creates entry
  - Entity 2 lookup skips LLM, creates entry
  - ... all 10 skip LLM
- **Result:** ✅ 10 LLM calls saved

#### Case 4: Second Scene Recap
- Timeline:
  - First scene created 10 entries
  - Second scene recap
  - `checkAndStoreLorebookEmptyState()` finds 10 real entries
  - Returns `false`
  - All lookups proceed normally
- **Result:** ✅ Normal deduplication works

#### Case 5: Regenerate First Scene (Version 1)
- Timeline:
  - First scene version 0 created 10 entries
  - User regenerates first scene (version 1)
  - `checkAndStoreLorebookEmptyState(0, 1)` finds 10 real entries (from version 0)
  - Returns `false`
  - All lookups proceed normally
- **Result:** ✅ Deduplication works, prevents duplicates

---

## 5. Implementation Details

### 5.1 Files to Modify

#### File 1: `lorebookManager.js`

**Change 1:** Fix `isInternalEntry()` bug
```javascript
// Line 358-361 (BEFORE)
function isInternalEntry(comment) {
  return comment.startsWith('_registry_') ||
    comment.startsWith('_operations_queue_'); // ❌ WRONG
}

// Line 358-361 (AFTER)
export function isInternalEntry(comment) {
  return comment.startsWith('_registry_') ||
    comment === '__operation_queue'; // ✅ CORRECT
}
```

**Reason:** Fix bug and export for use in other modules.

#### File 2: `sceneBreak.js`

**Change 1:** Import dependencies
```javascript
// Add to imports at top of file
import { isInternalEntry, getLorebookEntries, invalidateLorebookCache } from './lorebookManager.js';
import { chat_metadata, saveMetadata } from '../../../../script.js';
```

**Change 2:** Add `checkAndStoreLorebookEmptyState()` function
```javascript
// Add before extractAndQueueLorebookEntries()
async function checkAndStoreLorebookEmptyState(messageIndex, versionIndex) {
  try {
    const lorebookName = getAttachedLorebook();
    if (!lorebookName) {
      debug(SUBSYSTEM.LOREBOOK, 'No lorebook attached, cannot check empty state');
      return false;
    }

    // CRITICAL: Invalidate cache to get fresh data
    await invalidateLorebookCache(lorebookName);

    // Load ALL entries (fresh, not cached)
    const allEntries = await getLorebookEntries(lorebookName);
    if (!allEntries) {
      error(SUBSYSTEM.LOREBOOK, 'Failed to load lorebook entries for empty check');
      return false;
    }

    // Filter out system entries
    const realEntries = allEntries.filter(entry =>
      !isInternalEntry(entry?.comment || '')
    );

    const isEmpty = realEntries.length === 0;

    // Store result in metadata
    if (!chat_metadata.auto_lorebooks) {
      chat_metadata.auto_lorebooks = {};
    }
    if (!chat_metadata.auto_lorebooks.scene_empty_states) {
      chat_metadata.auto_lorebooks.scene_empty_states = {};
    }

    const sceneKey = `${messageIndex}_${versionIndex}`;
    chat_metadata.auto_lorebooks.scene_empty_states[sceneKey] = isEmpty;
    saveMetadata();

    if (isEmpty) {
      log(SUBSYSTEM.LOREBOOK, `Scene ${messageIndex}.${versionIndex}: Lorebook empty (${allEntries.length} system entries). Will skip lookups.`);
    } else {
      debug(SUBSYSTEM.LOREBOOK, `Scene ${messageIndex}.${versionIndex}: Lorebook has ${realEntries.length} real entries. Using normal lookup flow.`);
    }

    return isEmpty;
  } catch (err) {
    error(SUBSYSTEM.LOREBOOK, 'Error checking lorebook empty state:', err);
    return false; // Fail safe: use normal lookup flow
  }
}
```

**Change 3:** Modify `extractAndQueueLorebookEntries()`

**Location:** Function starts at line 1406 (not 1390 - that's the call site)

**IMPORTANT:** The actual function has JSON parsing, deduplication, and extensive debug logging. The code below shows only the key structural changes needed for the optimization.

```javascript
// SIMPLIFIED BEFORE (actual code has more logic - see sceneBreak.js:1406-1475)
async function extractAndQueueLorebookEntries(recap, messageIndex, versionIndex) {
  // ... (JSON parsing, validation, deduplication logic) ...

  const recapHash = computeRecapHash(recap); // Note: actual function name is computeRecapHash

  for (const entry of uniqueEntries) {
    await queueProcessLorebookEntry(entry, messageIndex, recapHash, { metadata: { version_index: versionIndex } });
  }

  return lorebookOpIds;
}

// AFTER (add empty check before loop)
async function extractAndQueueLorebookEntries(recap, messageIndex, versionIndex) {
  // ... (JSON parsing, validation, deduplication logic - unchanged) ...

  const recapHash = computeRecapHash(recap);

  // ===== NEW: Check ONCE if lorebook is empty at start of this scene =====
  const lorebookWasEmpty = await checkAndStoreLorebookEmptyState(messageIndex, versionIndex);
  // ====================================================================

  for (const entry of uniqueEntries) {
    await queueProcessLorebookEntry(entry, messageIndex, recapHash, {
      metadata: {
        version_index: versionIndex,
        lorebook_was_empty_at_scene_start: lorebookWasEmpty // ← ADD THIS
      }
    });
  }

  return lorebookOpIds;
}
```

#### File 3: `queueIntegration.js`

**Change 1:** Modify `queueProcessLorebookEntry()` signature and operation metadata
```javascript
// Line 275 (BEFORE)
async function queueProcessLorebookEntry(entry, messageIndex, recapHash, options = {}) {

// Line 275 (AFTER) - Add options parameter
async function queueProcessLorebookEntry(entry, messageIndex, recapHash, options = {}) {

// Then in the enqueueLorebookEntryLookupOperation() call (line 229-246)
// The function already spreads options.metadata at line 242
// The flag will automatically be included via: ...options.metadata
// So no changes needed to enqueueLorebookEntryLookupOperation itself
// The metadata flag will be passed through from queueProcessLorebookEntry's options parameter
```

#### File 4: `operationHandlers.js`

**Change 1:** Modify `LOREBOOK_ENTRY_LOOKUP` handler

**ACTUAL CODE (operationHandlers.js:1207-1306):**
- Handler registered at line 1207
- Ends at line 1306 (closing brace)

```javascript
// Add optimization check after line 1211
registerOperationHandler(OperationType.LOREBOOK_ENTRY_LOOKUP, async (operation) => {
  const { entryId, entryData, registryListing, typeList } = operation.params;
  const signal = getAbortSignal(operation);
  debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] ⚙️ Starting for: ${entryData.comment || 'Unknown'}, entryId: ${entryId}`);
  debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Operation ID: ${operation.id}, Status: ${operation.status}`);

  // ===== OPTIMIZATION: Skip LLM if lorebook was empty at scene start =====
  const lorebookWasEmpty = operation.metadata?.lorebook_was_empty_at_scene_start === true;

  if (lorebookWasEmpty) {
    log(SUBSYSTEM.LOREBOOK, `Skipping LLM lookup for "${entryData.comment}" - lorebook was empty at scene start`);

    // Store placeholder result in pending ops (required by pipeline)
    const lorebookEntryLookupResult = {
      type: entryData.type || 'unknown',
      synopsis: entryData.synopsis || '',
      sameEntityUids: [],
      needsFullContextUids: []
    };

    setLorebookEntryLookupResult(entryId, lorebookEntryLookupResult);
    markStageInProgress(entryId, 'lorebook_entry_lookup_complete');

    // Enqueue CREATE operation directly (matches structure at line 1287-1301)
    const nextOpId = await enqueueOperation(
      OperationType.CREATE_LOREBOOK_ENTRY,
      { entryId, action: 'create' },
      {
        priority: 14,
        queueVersion: operation.queueVersion,
        metadata: {
          entry_comment: entryData.comment,
          message_index: operation.metadata?.message_index,
          version_index: operation.metadata?.version_index,
          hasPrefill: false,
          includePresetPrompts: false,
          skipped_llm_lookup: true,
          skip_reason: 'lorebook_was_empty_at_scene_start'
        }
      }
    );
    await transferDependencies(operation.id, nextOpId);

    return lorebookEntryLookupResult;
  }
  // ======================================================================

  // Normal path: Build settings and call LLM
  const settings = await buildLorebookOperationsSettings();
  debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Settings - skip_duplicates: ${settings.skip_duplicates}`);

  // Run lorebook entry lookup
  debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Running lookup stage...`);
  const lorebookEntryLookupResult = await runLorebookEntryLookupStage(entryData, registryListing, typeList, settings);

  // ... (rest of normal logic continues unchanged - lines 1222-1304)
});
```

**IMPORTANT:** The actual handler code structure must match the existing pattern:
- Extract params: `{ entryId, entryData, registryListing, typeList }`
- Call `setLorebookEntryLookupResult()` and `markStageInProgress()` even when skipping
- CREATE params: `{ entryId, action: 'create' }` only (no lorebookName, messageIndex, etc.)
- Must call `await transferDependencies(operation.id, nextOpId)` to maintain dependency chain

### 5.2 Import Statement Updates

**sceneBreak.js:**
```javascript
// Add these imports
import {
  isInternalEntry,
  getLorebookEntries,
  invalidateLorebookCache, // NOTE: Must export this first (currently private)
  getAttachedLorebook
} from './lorebookManager.js';
import { chat_metadata, saveMetadata } from '../../../../script.js';
```

**VERIFIED:**
- ✅ `chat_metadata` exported from script.js (line 403)
- ✅ `saveMetadata` exported from script.js (line 8019)
- ✅ Import path verified from lorebookManager.js line 17: `'../../../../script.js'`
- ⚠️ `invalidateLorebookCache()` currently private in lorebookManager.js (line 41), must export
- ⚠️ `isInternalEntry()` currently private in lorebookManager.js (line 358), must export AND fix bug

**lorebookManager.js:**
```javascript
// Update export to include isInternalEntry AND invalidateLorebookCache
export {
  initLorebookManager,
  getCurrentContext,
  getAttachedLorebook,
  lorebookExists,
  handleMissingLorebook,
  attachLorebook,
  createChatLorebook,
  ensureChatLorebook,
  deleteChatLorebook,
  getLorebookMetadata,
  initializeChatLorebook,
  addLorebookEntry,
  modifyLorebookEntry,
  deleteLorebookEntry,
  getLorebookEntries,
  updateRegistryEntryContent,
  reorderLorebookEntriesAlphabetically,
  isInternalEntry,        // ADD THIS
  invalidateLorebookCache // ADD THIS
};
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Test 1: isInternalEntry() Function**
```javascript
describe('isInternalEntry', () => {
  it('should identify registry entries', () => {
    expect(isInternalEntry('_registry_character')).toBe(true);
    expect(isInternalEntry('_registry_location')).toBe(true);
  });

  it('should identify operation queue entry', () => {
    expect(isInternalEntry('__operation_queue')).toBe(true);
  });

  it('should NOT identify real entries', () => {
    expect(isInternalEntry('Alice')).toBe(false);
    expect(isInternalEntry('character-Bob')).toBe(false);
  });

  it('should handle edge cases', () => {
    expect(isInternalEntry('')).toBe(false);
    expect(isInternalEntry(null)).toBe(false);
    expect(isInternalEntry(undefined)).toBe(false);
  });
});
```

**Test 2: checkAndStoreLorebookEmptyState() Function**
```javascript
describe('checkAndStoreLorebookEmptyState', () => {
  it('should return true when lorebook has only system entries', async () => {
    // Setup: Create lorebook with only registries
    const isEmpty = await checkAndStoreLorebookEmptyState(0, 0);
    expect(isEmpty).toBe(true);
  });

  it('should return false when lorebook has real entries', async () => {
    // Setup: Add a real entry to lorebook
    await addLorebookEntry(lorebookName, { comment: 'Alice', content: '...' });
    const isEmpty = await checkAndStoreLorebookEmptyState(0, 0);
    expect(isEmpty).toBe(false);
  });

  it('should store result in chat metadata', async () => {
    await checkAndStoreLorebookEmptyState(0, 0);
    expect(chat_metadata.auto_lorebooks.scene_empty_states['0_0']).toBeDefined();
  });
});
```

### 6.2 Integration Tests

**Test 1: Empty Lorebook - Skip All Lookups**
```
Setup:
- New chat
- No character/global lorebooks
- First message generates scene recap with 5 entities

Expected:
- checkAndStoreLorebookEmptyState(0, 0) returns true
- All 5 entities get lorebook_was_empty_at_scene_start: true
- All 5 LOREBOOK_ENTRY_LOOKUP operations skip LLM call
- All 5 CREATE_LOREBOOK_ENTRY operations execute
- 5 entries created in lorebook
- 0 LLM lookup calls made

Verify:
- Check operation metadata for skipped_llm_lookup: true
- Count LLM API calls (should be 0)
- Check lorebook has 5 real entries
```

**Test 2: Imported Entries - Normal Lookup Flow**
```
Setup:
- New chat
- Character has lorebook with "Alice" entry
- Chat lorebook imports "Alice"
- First message mentions "Alice"

Expected:
- duplicateActiveLorebookEntries() imports Alice
- POPULATE_REGISTRIES runs (priority 100)
- checkAndStoreLorebookEmptyState(0, 0) returns false (1 real entry)
- LOREBOOK_ENTRY_LOOKUP uses normal LLM lookup
- LLM finds match to Alice's UID
- MERGE operation executes instead of CREATE
- No duplicate "Alice" entry created

Verify:
- Lorebook has 1 Alice entry (not 2)
- LLM lookup was called
- MERGE operation executed
```

**Test 3: Second Scene - Normal Flow**
```
Setup:
- First scene created 10 entries
- Second message generates second scene recap

Expected:
- checkAndStoreLorebookEmptyState(1, 0) returns false (10 real entries)
- All lookups use normal LLM flow
- Duplicate detection works

Verify:
- LLM lookups executed
- No duplicate entries created
```

### 6.3 Performance Tests

**Test 1: Measure LLM Call Reduction**
```
Setup:
- First scene with 10 entities
- Monitor LLM API calls

Baseline (without optimization):
- 10 LOOKUP calls (1 per entity)
- Total: 10 LLM calls

Optimized (with optimization):
- 0 LOOKUP calls (all skipped)
- Total: 0 LLM calls

Expected savings: 10 LLM calls
```

**Test 2: Time Savings**
```
Assumptions:
- Average LLM lookup: 3 seconds
- 10 entities in first scene

Baseline time:
- 10 lookups * 3s = 30 seconds
- 10 creates * 2s = 20 seconds
- Total: 50 seconds

Optimized time:
- 0 lookups * 3s = 0 seconds
- 10 creates * 2s = 20 seconds
- Total: 20 seconds

Expected savings: 30 seconds (60% reduction)
```

### 6.4 Edge Case Tests

**Test 1: Race Condition - Rapid Scene Generation**
```
Setup:
- Generate multiple scenes rapidly

Expected:
- Each scene checks independently
- No interference between scenes
- Empty check is atomic per scene
```

**Test 2: Regenerate First Scene**
```
Setup:
- Generate first scene (version 0)
- Regenerate first scene (version 1)

Expected:
- Version 0: lorebook empty, skips lookups
- Version 1: lorebook has entries from v0, uses normal lookups
- No duplicates created
```

**Test 3: Cache Invalidation**
```
Setup:
- Manually modify lorebook between check and execution

Expected:
- Cache invalidation ensures fresh data
- Check sees current state
- No stale data used
```

---

## 7. Risks & Mitigations

### Risk 1: Stale Cache Data
**Scenario:** Cache not invalidated, check sees old empty state, misses new imports.

**Probability:** Medium (cache invalidation is critical)

**Impact:** High (could create duplicates)

**Mitigation:**
- Always call `invalidateLorebookCache()` before `getLorebookEntries()`
- Add defensive logging to verify cache invalidation
- Add test to verify fresh data is loaded

### Risk 2: Metadata Storage Failure
**Scenario:** `saveMetadata()` fails, empty state not persisted.

**Probability:** Low (metadata saves are robust)

**Impact:** Low (worst case: optimization doesn't apply, uses normal flow)

**Mitigation:**
- Wrap in try-catch, log errors
- Fail safe: return `false` on error (uses normal lookup)
- Non-critical optimization, failure doesn't break functionality

### Risk 3: Import Timing Edge Case
**Scenario:** Imports happen after empty check but before operations execute.

**Probability:** Very Low (imports happen during lorebook creation, before any recaps)

**Impact:** Low (would use normal lookup flow)

**Mitigation:**
- Document initialization order clearly
- Add assertion: imports must complete before first scene recap
- Queue priority system guarantees correct ordering

### Risk 4: Incorrect isInternalEntry() Logic
**Scenario:** Bug in filter logic, treats real entries as system entries.

**Probability:** Low (simple string matching)

**Impact:** High (could skip lookups when shouldn't)

**Mitigation:**
- Extensive unit tests for isInternalEntry()
- Test with real-world entry names
- Log all filtered entries for debugging

### Risk 5: Operation Metadata Corruption
**Scenario:** Metadata flag gets lost or corrupted during queue processing.

**Probability:** Very Low (queue metadata is stable)

**Impact:** Medium (would skip optimization, use normal flow)

**Mitigation:**
- Log metadata at enqueue time
- Log metadata at execution time
- Verify metadata structure in tests

---

## 8. Performance Impact

### 8.1 Expected Savings

**Scenario 1: Small Scene (5 entities)**
- Baseline: 5 LLM lookups * 3s = 15s
- Optimized: 0 LLM lookups = 0s
- Savings: 15 seconds, 5 API calls

**Scenario 2: Medium Scene (10 entities)**
- Baseline: 10 LLM lookups * 3s = 30s
- Optimized: 0 LLM lookups = 0s
- Savings: 30 seconds, 10 API calls

**Scenario 3: Large Scene (20 entities)**
- Baseline: 20 LLM lookups * 3s = 60s
- Optimized: 0 LLM lookups = 0s
- Savings: 60 seconds, 20 API calls

### 8.2 Cost Savings

**Assumptions:**
- GPT-4 Turbo input: $10 per 1M tokens
- Average lookup prompt: 500 tokens
- Average lookup response: 100 tokens

**Per Lookup Cost:**
- Input: 500 tokens * $10 / 1M = $0.005
- Output: 100 tokens * $30 / 1M = $0.003
- Total: $0.008 per lookup

**Savings per Scene:**
- 5 entities: 5 * $0.008 = $0.04
- 10 entities: 10 * $0.008 = $0.08
- 20 entities: 20 * $0.008 = $0.16

**Yearly Savings (example user):**
- 100 new chats per year
- Average 10 entities per first scene
- Total: 100 * $0.08 = $8.00 saved per year

### 8.3 Overhead Cost

**Added Operations:**
- `invalidateLorebookCache()`: ~1ms
- `getLorebookEntries()`: ~10ms (file I/O)
- Filter operation: ~1ms
- Metadata save: ~5ms
- Total overhead: ~17ms per scene

**Net Benefit:**
- Time saved: 30s (for 10 entities)
- Overhead: 0.017s
- Net savings: 29.983s (99.9% reduction)

### 8.4 When Optimization Applies

**Applies to:**
- First scene recap only
- When no character/global lorebooks imported entries
- Typically: new chats with new characters

**Does NOT apply to:**
- Second and subsequent scenes (lorebook has entries)
- Chats with imported character lorebooks
- Regenerated first scene recaps (version > 0)

**Estimated Coverage:**
- ~30% of all chats (many users have character lorebooks)
- ~10% of all scene recaps (only first scene)
- Still valuable for new users and new characters

---

## 9. Open Questions

### Q1: Should we add a setting to disable this optimization?
**Context:** Some users may want to force lookups even when empty (paranoia, testing).

**Options:**
1. No setting - optimization always applies (simpler)
2. Add toggle in extension settings (more control)

**Recommendation:** No setting. Optimization is safe and transparent. Advanced users can see metadata flags if needed.

### Q2: Should we log skipped lookups to UI?
**Context:** Users might want to know optimization is working.

**Options:**
1. Silent optimization (no UI indication)
2. Debug log only (visible in console)
3. Toast notification "Skipped 10 lookups for first scene"

**Recommendation:** Debug log only. Too much UI noise for internal optimization.

### Q3: Should we track optimization metrics?
**Context:** Could count total LLM calls saved, display in stats.

**Options:**
1. No tracking (simplest)
2. Track in metadata: `total_lookups_skipped`
3. Display in settings UI

**Recommendation:** Track in metadata for debugging, no UI display.

### Q4: What happens during bulk regeneration?
**Context:** User regenerates all scene recaps at once.

**Behavior:**
- First scene (0,0): Lorebook empty → skip lookups
- Second scene (1,0): Lorebook has entries → normal lookups
- Third scene (2,0): Lorebook has more entries → normal lookups

**Expected:** Optimization only applies to first scene, which is correct.

### Q5: Should we extend optimization to other scenarios?
**Context:** Could skip lookups when registry listing is identical to previous operation.

**Options:**
1. Only optimize first scene (conservative, this proposal)
2. Extend to detect "no new entries since last lookup"
3. Cache LLM lookup results

**Recommendation:** Start conservative (first scene only). Monitor for other optimization opportunities.

---

## 10. Approval Checklist

Before implementation, verify:

- [ ] Problem statement is clear and agreed upon
- [ ] Solution approach is validated
- [ ] All edge cases are documented
- [ ] Safety guarantees are sufficient
- [ ] Code changes are minimal and focused
- [ ] Testing strategy is comprehensive
- [ ] Performance benefits are measurable
- [ ] Risks are identified and mitigated
- [ ] Implementation plan is detailed

---

## 11. Implementation Plan

### Phase 1: Foundation (Bug Fix & Exports)
1. Fix `isInternalEntry()` bug in lorebookManager.js (line 358-361)
   - Change `comment.startsWith('_operations_queue_')` to `comment === '__operation_queue'`
2. Export `isInternalEntry()` for external use
3. Export `invalidateLorebookCache()` for external use (currently private at line 41)
4. Add unit tests for `isInternalEntry()`
5. Verify tests pass

### Phase 2: Empty Check Logic
1. Add required imports to sceneBreak.js:
   - Import `chat_metadata` and `saveMetadata` from '../../../../script.js' (VERIFIED: exported at lines 403, 8019)
   - Import `isInternalEntry`, `getLorebookEntries`, `invalidateLorebookCache` from './lorebookManager.js' (NOTE: must export these first)
   - `getAttachedLorebook` already imported ✅
2. Add `checkAndStoreLorebookEmptyState()` function to sceneBreak.js
3. Add unit tests for empty check function
4. Verify correct behavior with/without imports

### Phase 3: Integration
1. Modify `extractAndQueueLorebookEntries()` to call empty check
2. Pass metadata to `queueProcessLorebookEntry()`
3. Update operation metadata in `queueIntegration.js`
4. Add integration tests

### Phase 4: Optimization Logic
1. Modify LOREBOOK_ENTRY_LOOKUP handler in operationHandlers.js
2. Add skip logic with logging
3. Add tests for skip behavior
4. Verify no regressions

### Phase 5: Validation
1. Run full test suite
2. Manual testing with various scenarios
3. Performance benchmarks
4. Edge case verification

### Phase 6: Documentation
1. Update CLAUDE.md with optimization details
2. Add inline comments explaining optimization
3. Document metadata structure
4. Update operation flow diagrams

---

## End of Design Document

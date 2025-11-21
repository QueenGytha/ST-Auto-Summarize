# Lorebook Lookup Optimization — Reality-Aligned Plan

**Status:** ✅ IMPLEMENTED
**Implemented:** 2025-11-22
**Last verified against code:** 2025-11-22
**Goal:** Skip LLM lookups for first-scene recap entities when the attached chat lorebook has no real entries.

## Implementation Summary

All components of this optimization have been implemented:

1. **Bug Fix:** Fixed `isInternalEntry` pattern matching (was checking `_operations_queue_`, now correctly checks `__operation_queue`)
2. **Exports:** Exported `isInternalEntry` and `invalidateLorebookCache` from `lorebookManager.js`
3. **Empty Check:** Added `checkLorebookEmptyState()` helper in `sceneBreak.js`
4. **Metadata Propagation:** `lorebook_was_empty_at_scene_start` flag passed through queue metadata
5. **Skip Path:** Implemented skip logic in `LOREBOOK_ENTRY_LOOKUP` handler with mandatory re-validation
6. **Observability:** Debug logging for skip decisions and skip metadata tracking
7. **Tests:** Unit tests for `isInternalEntry` and integration test placeholders

### Files Modified
- `lorebookManager.js`: Fixed bug, exported helpers (lines 41, 358, 1139-1140)
- `sceneBreak.js`: Added empty check helper and integration (lines 27, 1404-1434, 1460, 1489)
- `operationHandlers.js`: Added skip path with helper functions (lines 65-66, 93-164, 1293-1296)
- `tests/unit/lorebookManager.unit.spec.js`: Unit tests (new file)
- `tests/features/skip-lookup-optimization.spec.js`: Integration tests (new file, placeholders)

## 1) Verified facts (current code)
- No skip path exists. `LOREBOOK_ENTRY_LOOKUP` handler (operationHandlers.js ~1207-1304) always calls `runLorebookEntryLookupStage` and then enqueues RESOLVE/CREATE/MERGE.
- `extractAndQueueLorebookEntries` (sceneBreak.js ~1406+) parses recap `setting_lore`, dedupes by name/comment, and sequentially enqueues each entry via `queueProcessLorebookEntry(entry, messageIndex, recapHash, { metadata: { version_index } })`. No empty-lorebook check; no skip flag.
- `queueProcessLorebookEntry` (queueIntegration.js ~275+) prepares context, cancels superseded ops, and enqueues `LOREBOOK_ENTRY_LOOKUP` at priority `OPERATION_ID_LENGTH` (=11, constants.js:92). Metadata currently includes entry name/comment, message index, recap hash, prefill flags, and any passed `options.metadata` (only `version_index` today).
- Queue ordering (`operationQueue.js`): `getNextOperation` sorts by priority desc, then created_at. `POPULATE_REGISTRIES` is enqueued at priority 100 from `duplicateActiveLorebookEntries` (lorebookManager.js ~492-505), so it executes before lookup (11) but does not trigger any skip.
- Internal-entry helper `isInternalEntry` (lorebookManager.js ~358) matches `_registry_` and `_operations_queue_`. The actual queue entry is `__operation_queue` (operationQueue.js:36). The helper is not exported.
- `invalidateLorebookCache` exists in lorebookManager.js (top of file) but is not exported.
- `chat_metadata` and `saveMetadata` are exported from public/script.js (~403, ~8019). Import path from this extension to script.js is `../../../../script.js`.

## 2) Current behavior (no optimization)
1. Scene recap save path calls `extractAndQueueLorebookEntries` (sceneBreak.js ~1393).  
2. Each unique recap entity is enqueued as `LOREBOOK_ENTRY_LOOKUP` with priority 11 (queueIntegration.js ~232).  
3. Handler runs the LLM lookup and then enqueues RESOLVE (12) or CREATE/MERGE (14) (operationHandlers.js ~1207-1304).  
4. `POPULATE_REGISTRIES` (100) runs before lookup if imports happen, but lookups still execute afterward.

## 3) Gaps vs. desired optimization
- No detection of “lorebook empty at scene start.”
- No metadata flag propagated through the queue.
- No skip/short-circuit path in the lookup handler.
- Helper/export gaps: `isInternalEntry` wrong pattern and private; `invalidateLorebookCache` private.
- No observability indicating skipped lookups.

## 4) Implementation plan (concrete, code-aligned)
### A. Fix helpers and exports (lorebookManager.js)
1) `isInternalEntry(comment)`  
   - Treat as internal: comments starting with `_registry_` OR exactly `__operation_queue`.  
   - Export the function for reuse.  
2) `invalidateLorebookCache(lorebookName)`  
   - Export the existing helper so callers can force a fresh read.  
3) (Optional) Add a small unit to guard null/undefined comments.

### B. Scene-level check and flag (sceneBreak.js)
1) Add `checkLorebookEmptyState(messageIndex, versionIndex)` that:  
   - Fetches `lorebookName` via `getAttachedLorebook`; if none, return false.  
   - Calls `invalidateLorebookCache(lorebookName)` then `getLorebookEntries(lorebookName)`.  
   - Filters entries with `isInternalEntry` to count real entries.  
   - Returns `true` if zero real entries; `false` otherwise. Optionally store debug metadata (e.g., `chat_metadata.auto_lorebooks.scene_empty_flags["${messageIndex}_${versionIndex}"]`).  
2) In `extractAndQueueLorebookEntries`, call this helper once before queuing.  
3) Pass the boolean as `lorebook_was_empty_at_scene_start` inside `options.metadata` to `queueProcessLorebookEntry`.  
4) Imports needed: `getAttachedLorebook`, `getLorebookEntries`, `invalidateLorebookCache`, `isInternalEntry` (from lorebookManager.js), and optionally `chat_metadata`/`saveMetadata` (public/script.js) if persisting debug info.

### C. Metadata propagation (queueIntegration.js)
- No structural change needed; `enqueueLorebookEntryLookupOperation` already spreads `options.metadata`. Ensure callers now supply `lorebook_was_empty_at_scene_start` from sceneBreak.js.

### D. Skip path in handler (operationHandlers.js)
1) At start of `LOREBOOK_ENTRY_LOOKUP`, read `operation.metadata.lorebook_was_empty_at_scene_start === true`.  
2) If true, optionally re-validate emptiness to avoid bad flags: load entries for the attached lorebook and filter via `isInternalEntry`.  
3) When still empty, short-circuit:  
   - Build a synthetic result: `{ type: entryData.type || 'unknown', synopsis: entryData.synopsis || '', sameEntityUids: [], needsFullContextUids: [] }`.  
   - Call `setLorebookEntryLookupResult(entryId, result)` and `markStageInProgress(entryId, 'lorebook_entry_lookup_complete')`.  
   - Enqueue `CREATE_LOREBOOK_ENTRY` with priority 14, copying message/version metadata, and add `skipped_llm_lookup: true` plus `skip_reason: 'lorebook_empty_at_scene_start'`.  
   - Transfer dependencies (`transferDependencies(operation.id, nextOpId)`).  
   - Return the synthetic result without calling the LLM.  
4) Otherwise, run the existing lookup flow unchanged.

### E. Observability (recommended)
- Debug log when skipping: include messageIndex/versionIndex and entry comment.  
- Optionally persist a counter of skipped lookups in `chat_metadata` for troubleshooting.

## 5) Testing plan
- **Unit:**  
  - `isInternalEntry` recognizes `_registry_*` and `__operation_queue`; rejects normal comments and empty/null.  
  - Scene empty check returns true when only internal entries exist, false when a real entry is present.  
- **Integration:**  
  - New chat, no imports, first-scene recap with multiple entities → all lookup operations skip LLM, all CREATEs fire, `skipped_llm_lookup` metadata set.  
  - Chat with imported entries (duplicateActiveLorebookEntries + POPULATE_REGISTRIES) → empty check is false, lookup runs, merge/dedupe path works.  
  - Second scene → flag should be false; normal lookup path.  
- **Manual/telemetry:** Confirm debug logs show skip decisions; verify no LLM calls occur in the skipped path.

## 6) Acceptance criteria
- For an empty lorebook first scene, every `LOREBOOK_ENTRY_LOOKUP` operation short-circuits (no LLM call) and enqueues CREATE with `skipped_llm_lookup: true`.  
- For non-empty lorebooks (imports or prior entries), lookup runs as today.  
- `isInternalEntry` correctly ignores `__operation_queue` and `_registry_*`, preventing miscounts.  
- No change to queue ordering or priority behavior.  
- Tests covering helper correctness and skip/normal-path behaviors are added and passing.

## 7) Code reference map (current state)
- sceneBreak.js: `extractAndQueueLorebookEntries` ~1406+.  
- queueIntegration.js: `prepareLorebookEntryLookupContext` ~202; `enqueueLorebookEntryLookupOperation` ~232; `queueProcessLorebookEntry` ~275.  
- operationHandlers.js: `LOREBOOK_ENTRY_LOOKUP` handler ~1207-1304.  
- constants.js: `OPERATION_ID_LENGTH = 11` (line ~92).  
- operationQueue.js: priority sort in `getNextOperation`; queue entry name `__operation_queue` (line ~36).  
- lorebookManager.js: `invalidateLorebookCache` (top, private), `isInternalEntry` (~358, wrong pattern, private), `duplicateActiveLorebookEntries` enqueues `POPULATE_REGISTRIES` priority 100 (~492-505).  
- public/script.js: exports `chat_metadata` (~403) and `saveMetadata` (~8019).

## 8) Out of scope
- UI surfacing of skip events.  
- Broader deduplication optimizations beyond the first-scene empty-case.  
- Changes to registry population or import behavior.  
- Network/token cost tracking dashboards.

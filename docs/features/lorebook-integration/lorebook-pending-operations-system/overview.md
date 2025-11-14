# Lorebook Pending Operations System - Overview

## What is the Lorebook Pending Operations System?

The Lorebook Pending Operations System is a multi-stage state machine that tracks lorebook entry processing through a complete pipeline: **lookup → deduplicate → merge/create → registry update**. Each operation maintains persistent state in `chat_metadata.autoLorebooks.pendingOps`, allowing operations to span multiple asynchronous stages while preserving data integrity across page reloads and operation failures.

This system coordinates AI-powered entity extraction from scene recaps, deduplication against existing lorebook entries, intelligent merging of content, and registry synchronization—all while maintaining referential integrity and preventing duplicate entries.

## Key Capabilities

### Multi-Stage Pipeline Coordination
- **Stage 1: Lorebook Entry Lookup** - AI identifies entity type and potential duplicates
- **Stage 2: Lorebook Entry Deduplication** (conditional) - AI resolves ambiguous matches with full context
- **Stage 3: Create/Merge** - Creates new entry or merges with existing
- **Stage 4: Registry Update** - Updates registry lorebook entry content and metadata

### Persistent State Management
- Pending operations survive page reloads via `chat_metadata` persistence
- Each operation tracks current stage, entry data, and AI results
- State mutations atomic with automatic `saveMetadata()` calls
- Stale entry cleanup (default 24hr expiration)

### Data Flow Tracking
- Entry data stored at operation creation (comment, content, keys, type, flags)
- Lorebook Entry Lookup results cached (type, synopsis, duplicate UIDs)
- Lorebook Entry Deduplication results cached (resolved UID, final synopsis)
- Stage progression tracked (`lorebook_entry_lookup`, `lorebook_entry_lookup_complete`, etc.)

### Error Recovery
- Operation failures leave pending state intact for debugging
- Manual cleanup via `completePendingEntry()` or auto-cleanup after expiration
- State inspection available via `getAllPendingEntries()` for diagnostics

## Architecture Summary

```
Entry Extraction → createPendingEntry(entryId, entryData)
                         ↓ [stage: lorebook_entry_lookup]
                   Store in chat_metadata.autoLorebooks.pendingOps[entryId]
                         ↓
                   Queue LOREBOOK_ENTRY_LOOKUP operation
                         ↓
                   AI Call: Identify type & duplicates
                         ↓
                   setLorebookEntryLookupResult(entryId, {type, synopsis, sameEntityUids, needsFullContextUids})
                         ↓ [stage: lorebook_entry_lookup_complete]
                   ┌─────┴─────┐
                   │           │
      needsFullContextUids?   sameEntityUids.length === 1?
                   │           │
                  YES         YES (exact match)
                   │           │
                   ↓           ↓
         Queue RESOLVE_LOREBOOK_ENTRY   setLorebookEntryDeduplicateResult(entryId, {resolvedUid, synopsis})
                   ↓                    ↓ [stage: lorebook_entry_deduplicate_complete]
         AI Call: Full context          └──────┐
                   ↓                            │
         setLorebookEntryDeduplicateResult()    │
                   ↓ [stage: lorebook_entry_deduplicate_complete]
                   └────────┬───────────────────┘
                            ↓
                   Queue CREATE_LOREBOOK_ENTRY (action: merge or create)
                            ↓
                   getEntryData(entryId)
                   getLorebookEntryDeduplicateResult(entryId)
                            ↓
                   Create new entry OR merge with existing
                            ↓
                   Queue UPDATE_LOREBOOK_REGISTRY
                            ↓
                   Update registry entry content
                   completePendingEntry(entryId) → delete pendingOps[entryId]
                            ↓
                   Operation complete (cleanup)
```

## Quick Reference

### Core Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `generateEntryId()` | Generate unique entry ID | `string` (e.g., "entry_1699900000000_abc123") |
| `createPendingEntry(entryId, entryData)` | Initialize pending operation | Pending entry object |
| `updatePendingEntry(entryId, updates)` | Update pending entry state | `void` |
| `getPendingEntry(entryId)` | Retrieve pending entry | Pending entry object or `null` |
| `setLorebookEntryLookupResult(entryId, result)` | Store Stage 1 AI results | `void` |
| `setLorebookEntryDeduplicateResult(entryId, result)` | Store Stage 2 AI results | `void` |
| `markStageInProgress(entryId, stage)` | Update stage marker | `void` |
| `completePendingEntry(entryId)` | Remove completed operation | `void` |
| `cleanupStalePendingEntries(maxAgeMs)` | Remove expired entries | `number` (count removed) |

### Data Access Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `getEntryData(entryId)` | Get original entry data | Entry data object or `null` |
| `getLorebookEntryLookupResult(entryId)` | Get Stage 1 results | Lookup result object or `null` |
| `getLorebookEntryDeduplicateResult(entryId)` | Get Stage 2 results | Deduplicate result object or `null` |
| `getAllPendingEntries()` | Get all pending operations | `Object<entryId, pendingEntry>` |

### Storage Location

**Chat Metadata Path**: `chat_metadata.autoLorebooks.pendingOps`

**Structure**:
```javascript
{
  "entry_1699900000000_abc123": {
    stage: "lorebook_entry_lookup_complete",
    timestamp: 1699900000000,
    entryData: { comment: "character-Alice", content: "...", keys: [...], ... },
    lorebookEntryLookupResult: { type: "character", synopsis: "...", sameEntityUids: [], needsFullContextUids: ["42"] },
    lorebookEntryDeduplicateResult: null  // Not yet run
  }
}
```

### Settings

No direct settings for pending operations system. State lifetime controlled by:
- `cleanupStalePendingEntries()` called with default 24hr expiration
- No UI settings for pending operations (internal system)

## Common Use Cases

### Use Case 1: Process Single Entity from Scene Recap

```javascript
import { createPendingEntry, generateEntryId } from './lorebookPendingOps.js';
import { enqueueOperation, OperationType } from './operationQueue.js';

// Entity extracted from scene recap JSON
const entityData = {
  comment: "character-Alice",
  content: "- Identity: Character — Alice\n- Synopsis: Brave warrior",
  keys: ["alice", "warrior"],
  secondaryKeys: [],
  type: "character"
};

// Generate unique ID
const entryId = generateEntryId();

// Create pending entry (initial stage: lorebook_entry_lookup)
createPendingEntry(entryId, entityData);

// Queue lookup operation
await enqueueOperation(
  OperationType.LOREBOOK_ENTRY_LOOKUP,
  { entryId, entryData: entityData, registryListing: "...", typeList: "character|location|item" },
  { priority: 12 }
);

// Pipeline continues automatically through stages
```

### Use Case 2: Retrieve Pending Entry During Operation

```javascript
import { getPendingEntry, getEntryData, getLorebookEntryLookupResult } from './lorebookPendingOps.js';

// In operation handler (e.g., RESOLVE_LOREBOOK_ENTRY)
const entryId = operation.params.entryId;

// Get full pending entry
const pendingEntry = getPendingEntry(entryId);
console.log('Current stage:', pendingEntry.stage);

// Get specific data
const entryData = getEntryData(entryId);
const lookupResult = getLorebookEntryLookupResult(entryId);

if (!entryData || !lookupResult) {
  throw new Error(`Missing pending data for entry ${entryId}`);
}

// Use data for next stage...
```

### Use Case 3: Debug Pending Operations

```javascript
import { getAllPendingEntries } from './lorebookPendingOps.js';

// Get all pending operations
const pending = getAllPendingEntries();

console.log('Pending operations:', Object.keys(pending).length);

for (const [entryId, entry] of Object.entries(pending)) {
  console.log(`Entry ${entryId}:`, {
    stage: entry.stage,
    age: Date.now() - entry.timestamp,
    comment: entry.entryData?.comment
  });
}
```

### Use Case 4: Manual Cleanup

```javascript
import { cleanupStalePendingEntries, completePendingEntry } from './lorebookPendingOps.js';

// Clean up entries older than 1 hour
const removed = cleanupStalePendingEntries(3600000);
console.log(`Removed ${removed} stale entries`);

// Manually complete specific entry
completePendingEntry('entry_1699900000000_abc123');
```

## Related Features

### Direct Dependencies
- **[Operation Queue](../../operation-queue/)** - Executes lorebook operations that use pending state
- **[Lorebook Entry Lookup](../lorebook-entry-lookup/)** - Stage 1: Type identification and duplicate detection
- **[Lorebook Entry Deduplication](../lorebook-entry-deduplication/)** - Stage 2: Ambiguous match resolution
- **[Lorebook Entry Creation](../lorebook-entry-creation/)** - Stage 3: New entry creation
- **[Lorebook Entry Merging](../lorebook-entry-merging/)** - Stage 3: Existing entry merge
- **[Lorebook Registry Entries](../lorebook-registry-entries/)** - Stage 4: Registry update

### Upstream Consumers
- **[Recap to Lorebook Processor](../../recap-to-lorebook/)** - Creates pending entries for scene recap entities
- **[Scene Recap Generation](../../core-recapping/)** - Extracts entities from scene recaps

### Related Documentation
- [Lorebook Integration Overview](../README.md)
- [Operation Handlers](../../operation-queue/operation-handlers.md)
- [Data Storage Inventory](../../../reference/DATA_STORAGE_INVENTORY.md)

## Documentation Structure

### 1. [overview.md](overview.md) (This File)

High-level summary, architecture, quick reference, common use cases.

### 2. [implementation.md](implementation.md)

**Comprehensive technical reference** (~1,000-1,200 lines):
- Detailed architecture with ASCII diagrams
- Complete source file inventory
- Full function signatures with parameters, returns, errors, execution flow
- Data structures and JSON examples
- Integration points with operation handlers
- Storage schema and persistence
- Edge cases and error handling
- Debugging guide
- Code examples

### 3. [data-flow.md](data-flow.md)

**Complete execution flow traces** (~300-900 lines):
- Entry point scenarios (scene recap entity extraction)
- Step-by-step execution through all 4 stages
- Actual code snippets showing implementation
- Data transformations at each stage
- State mutations and persistence
- Error flows and recovery
- Conditional stage execution (lookup vs deduplicate)

## Code Example

### Complete Lifecycle Example

```javascript
// Example: Complete pending operation lifecycle

import {
  generateEntryId,
  createPendingEntry,
  updatePendingEntry,
  setLorebookEntryLookupResult,
  setLorebookEntryDeduplicateResult,
  markStageInProgress,
  completePendingEntry,
  getPendingEntry
} from './lorebookPendingOps.js';

// 1. Initialize pending entry
const entryId = generateEntryId(); // "entry_1699900000000_abc123"
const entryData = {
  comment: "character-Bob",
  content: "- Identity: Character — Bob\n- Synopsis: Mysterious stranger",
  keys: ["bob", "stranger"],
  secondaryKeys: [],
  type: "character"
};

createPendingEntry(entryId, entryData);
// State: { stage: "lorebook_entry_lookup", timestamp: 1699900000000, entryData: {...} }

// 2. Simulate Stage 1: Lorebook Entry Lookup
const lookupResult = {
  type: "character",
  synopsis: "Mysterious stranger who arrived in town recently",
  sameEntityUids: [],
  needsFullContextUids: ["42", "73"] // Ambiguous matches
};

setLorebookEntryLookupResult(entryId, lookupResult);
// State: { ..., stage: "lorebook_entry_lookup_complete", lorebookEntryLookupResult: {...} }

// 3. Simulate Stage 2: Lorebook Entry Deduplication (conditional)
const deduplicateResult = {
  resolvedUid: "42", // Matched existing entry
  synopsis: "Mysterious stranger named Bob who arrived in town recently"
};

setLorebookEntryDeduplicateResult(entryId, deduplicateResult);
// State: { ..., stage: "lorebook_entry_deduplicate_complete", lorebookEntryDeduplicateResult: {...} }

// 4. Simulate Stage 3: Merge
markStageInProgress(entryId, 'merge_in_progress');
// ... merge logic ...
markStageInProgress(entryId, 'merge_complete');

// 5. Inspect state
const pending = getPendingEntry(entryId);
console.log('Current stage:', pending.stage);
console.log('Resolved UID:', pending.lorebookEntryDeduplicateResult.resolvedUid);

// 6. Complete operation (cleanup)
completePendingEntry(entryId);
// Entry removed from chat_metadata.autoLorebooks.pendingOps
```

## Performance Considerations

**Memory Usage**:
- Each pending entry stores ~1-5KB of data (entry content, AI results)
- Typical chat has 0-20 pending operations at any time
- Total overhead: ~100KB max per chat

**Persistence Overhead**:
- Every state mutation calls `saveMetadata()` (debounced at 1 second)
- Chat metadata file size increases by ~1-5KB per pending operation
- Auto-cleanup prevents unbounded growth

**Lookup Performance**:
- `getPendingEntry()` is O(1) hash lookup
- `getAllPendingEntries()` returns reference (no copy)
- No performance concerns for typical usage

## Security Considerations

**Data Integrity**:
- Entry IDs use timestamp + random suffix (collision risk: ~1 in 10^9 per millisecond)
- No validation of entry data structure (trusts upstream callers)
- State mutations not transactional (partial updates possible on crash)

**Data Exposure**:
- Pending operations stored in chat metadata (accessible to all extensions)
- Entry content includes potentially sensitive RP data
- No encryption or access control

**Cleanup Safety**:
- Stale cleanup uses configurable timeout (default 24hr)
- No automatic cleanup on operation failures (manual intervention required)
- Cleanup does not validate if operation truly completed (trusts caller)

## Troubleshooting

### Issue: Pending entries not cleaned up

**Symptom**: `getAllPendingEntries()` shows many old entries

**Causes**:
1. Operation failed before calling `completePendingEntry()`
2. Page reload interrupted operation
3. Bug in operation handler

**Solution**:
```javascript
// Manual cleanup
import { cleanupStalePendingEntries, getAllPendingEntries } from './lorebookPendingOps.js';

// Check pending entries
const pending = getAllPendingEntries();
console.log('Pending count:', Object.keys(pending).length);

// Clean up stale entries (default 24hr)
const removed = cleanupStalePendingEntries();
console.log('Removed:', removed);

// Aggressive cleanup (1hr threshold)
const removed2 = cleanupStalePendingEntries(3600000);
```

### Issue: Missing pending data in operation handler

**Symptom**: `getEntryData()` returns `null` during operation

**Causes**:
1. Entry ID mismatch (typo or wrong variable)
2. Entry cleaned up before operation completed
3. Entry never created (upstream bug)

**Solution**:
```javascript
// Defensive handling
const entryData = getEntryData(entryId);
if (!entryData) {
  throw new Error(`Missing entry data for ${entryId}`);
}

// Debug: Check all pending entries
const pending = getAllPendingEntries();
console.log('Available entry IDs:', Object.keys(pending));
```

### Issue: State not persisting across reloads

**Symptom**: Pending entries disappear after page reload

**Causes**:
1. Chat not saved before reload
2. Browser crash prevented save
3. Storage quota exceeded

**Solution**:
- Ensure `saveMetadata()` called after state mutations (automatic in all functions)
- Check browser console for storage errors
- Verify chat metadata file exists and is valid

## Next Steps

- **For implementation details**: Read [implementation.md](implementation.md)
- **For data flow traces**: Read [data-flow.md](data-flow.md)
- **For lorebook integration**: See [Lorebook Integration Overview](../README.md)
- **For operation queue**: See [Operation Queue Documentation](../../operation-queue/)

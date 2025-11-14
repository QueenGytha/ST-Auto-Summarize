# Chat Metadata Storage - Data Flow

## Table of Contents

1. [Overview](#overview)
2. [Running Scene Recap Storage Flow](#running-scene-recap-storage-flow)
3. [Pending Lorebook Operations Flow](#pending-lorebook-operations-flow)
4. [Processed Recaps Tracking Flow](#processed-recaps-tracking-flow)
5. [Cross-Chat Validation Flow](#cross-chat-validation-flow)
6. [Complete Request Examples](#complete-request-examples)
7. [Data Persistence Flow](#data-persistence-flow)
8. [Summary](#summary)

---

## Overview

This document traces the complete data flow for different types of operations through the chat metadata storage system. Each section shows the path from initial call to final persistence.

---

## Running Scene Recap Storage Flow

### Initialization on First Access

Trigger: User views running scene recap for first time

Flow:

1. Call get_running_recap_storage()
2. Check if chat_metadata.auto_recap_running_scene_recaps exists
3. If NO: Create new storage object with chat_id and empty versions array
4. If YES: Validate chat_id against currentChatId
5. If mismatch: RESET storage (prevents cross-chat contamination)
6. If match: Use existing storage
7. Return validated storage object

### Adding a New Version

Trigger: User generates or updates running scene recap

Call Stack: generate_running_scene_recap() -> add_running_recap_version()

Steps:

1. Retrieve storage via get_running_recap_storage() (ensures chat_id validation)
2. Get versions array: versions = storage.versions || []
3. Find max version number from existing versions
4. Create new version object with version, timestamp, content, scene_count, excluded_count, prev_scene_index, new_scene_index
5. Push to versions array and update storage
6. Update storage.current_version to new version number
7. Persist to disk via saveChatDebounced()
8. Update UI dropdown if window.updateVersionSelector exists
9. Return new version number

---

## Pending Lorebook Operations Flow

### Creating Pending Entry

Trigger: Start processing lorebook entry from recap

Call: createPendingEntry(entryId, entryData)

Steps:

1. Call ensurePendingOps() to initialize structure
2. Creates chat_metadata.autoLorebooks with pendingOps if needed
3. Retrieve pending ops reference
4. Create pending entry with stage, timestamp, and entryData
5. Persist immediately via saveMetadata() (not debounced)
6. Return created entry object

### Updating Pending Entry with Results

Trigger: Lookup stage completes, got results

Call: setLorebookEntryLookupResult() or updatePendingEntry()

Steps:

1. Get existing entry from pending[entryId]
2. If not found: Error and return
3. Merge updates into entry via Object.assign()
4. Update stage to 'lookup_complete' or similar
5. Add lorebookEntryLookupResult with type, synopsis, sameEntityUids, needsFullContextUids
6. Persist via saveMetadata()

### Completing Pending Entry

Trigger: Entry has been added to lorebook

Call: completePendingEntry(entryId)

Steps:

1. Get pending ops via ensurePendingOps()
2. Check if entry exists
3. Delete from storage: delete pending[entryId]
4. Persist via saveMetadata()

---

## Processed Recaps Tracking Flow

### Initialization

Trigger: First time checking if recap was processed

Steps:

1. Check existence of chat_metadata.auto_lorebooks_processed_recaps
2. If missing: Create empty array
3. Return as Set for deduplication

### Marking Recap as Processed

Trigger: Recap has been successfully processed

Call: markRecapProcessed(recapId)

Steps:

1. Get current processed set via getProcessedRecaps()
2. Add recapId to set
3. Convert back to array: Array.from(processed)
4. Store in chat_metadata.auto_lorebooks_processed_recaps
5. Persist via saveMetadata()

### Checking if Processed

Trigger: Before processing recap

Call: isRecapProcessed(recapId)

Steps:

1. Get processed set via getProcessedRecaps()
2. Check membership: processed.has(recapId)
3. Return boolean

---

## Cross-Chat Validation Flow

### On Chat Switch

When user switches from Chat A to Chat B:

1. SillyTavern replaces chat_metadata with Chat B's data
2. Extension code accesses running recap
3. Calls get_running_recap_storage()
4. Check if storage structure exists
5. If not: Create new (Chat B doesn't have data yet)
6. If yes: Validate chat_id
7. If chat_id mismatch: Data belongs to different chat
8. RESET to empty state with new chat_id
9. If chat_id match: Use storage as-is
10. Return validated storage

---

## Complete Request Examples

### Example 1: Generate and Store Running Scene Recap

Request: User clicks "Generate Running Recap" button

Flow:

1. generate_running_scene_recap() called
2. Collect scene indexes from chat
3. Build scene text from recaps
4. Call LLM with prompt
5. LLM response: "The party discovers..."
6. Parse response to get recap_content
7. Call add_running_recap_version()
8. Storage modified with new version
9. saveChatDebounced() called
10. File saved to disk with updated chat_metadata

### Example 2: Process Lorebook Entry from Recap

Request: Extract entity from recap and add to lorebook

Flow:

1. createPendingEntry(entryId, entryData) called
2. Chat metadata updated with new pending entry
3. saveMetadata() called (immediate)
4. Queue lookup operation
5. Lookup completes, found matching entry
6. setLorebookEntryLookupResult() called
7. Chat metadata updated with lookup result
8. saveMetadata() called
9. Merge with existing entry
10. completePendingEntry(entryId) called
11. Entry deleted from pending ops
12. saveMetadata() called

### Example 3: Prevent Duplicate Recap Processing

Request: Process multiple recaps

Flow:

1. First recap: recapId = "recap_1731640000000_abc123"
2. Check: isRecapProcessed(recapId) -> false
3. Process recap: Extract entities, create entries
4. Mark processed: markRecapProcessed(recapId)
5. Chat metadata updated with processed recap ID
6. saveMetadata() called

7. Same recap again (user refreshes):
8. Check: isRecapProcessed(recapId) -> true
9. SKIP processing (already handled)

---

## Data Persistence Flow

### When Data is Saved

Debounced saves (multiple quick changes):
- add_running_recap_version() uses saveChatDebounced()
- Waits for debounce period before hitting disk
- Reduces I/O when multiple changes in sequence

Immediate saves (critical operations):
- createPendingEntry() uses saveMetadata()
- updatePendingEntry() uses saveMetadata()
- completePendingEntry() uses saveMetadata()
- markRecapProcessed() uses saveMetadata()
- Ensures persistence immediately

### Persistence Timeline

Debounced scenario:

- T=0ms: add_running_recap_version() modifies in memory, schedules save (500ms)
- T=50ms: add_running_recap_version() called again, reschedules
- T=100ms: add_running_recap_version() called again, reschedules
- T=600ms: Debounce expired, single saveMetadata() to disk

Immediate scenario:

- T=0ms: createPendingEntry() modifies in memory, calls saveMetadata() immediately
- T=0ms: updatePendingEntry() modifies in memory, calls saveMetadata() immediately

---

## Summary

Chat metadata storage follows clear data flow patterns:

1. **Reading**: Access via get_* functions with defensive checks
2. **Modifying**: Direct object property updates in memory
3. **Persisting**: Either debounced or immediate saveMetadata() calls
4. **Validating**: Cross-chat checks on every access
5. **Cleaning**: Stale data removal on schedule

Each flow ensures data integrity through explicit chat_id validation and immediate persistence of critical operations.

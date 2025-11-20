# Out-of-Order Scene Combine Design Document

## Problem Statement

When user manually places a scene break EARLIER in the chat timeline (for branching), combining that scene creates lorebook pollution from FUTURE timeline entries.

### Example Timeline Issue

```
Timeline:  20 → 40 → 60 → 80 → 100 (all combined, lorebook has their entries)
User action: Place scene break at message 30, generate recap, combine

CURRENT BEHAVIOR (BROKEN):
- extractAndQueueLorebookEntries() extracts ["Lyra", "Marcus"] from scene 30's recap
- LOREBOOK_ENTRY_LOOKUP searches the SHARED lorebook
- Finds EXISTING "Lyra" entry (created by scene 60/80/100 - FUTURE timeline)
- Merges with future entry or uses future content
- Scene 30 snapshot gets polluted with future data

EXPECTED BEHAVIOR:
- Scene 30 should ONLY see entries from scene 20 (the only scene BEFORE it)
- Lorebook entries created by scenes 40, 60, 80, 100 should be invisible during scene 30's combine
```

## Verified SillyTavern Lorebook APIs

**Source:** `C:\Users\sarah\OneDrive\Desktop\personal\SillyTavern-New\public\scripts\world-info.js`

**Imports available in our extension:**
```javascript
import {
  createNewWorldInfo,      // Creates new lorebook file
  deleteWorldInfo,         // Deletes lorebook file
  loadWorldInfo,           // Loads lorebook data
  saveWorldInfo,           // Saves lorebook data
  createWorldInfoEntry,    // Creates entry in lorebook
  deleteWorldInfoEntry,    // Deletes entry from lorebook
  updateWorldInfoList,     // Refreshes world_names array
  METADATA_KEY,            // 'world_info' - chat attachment key
  world_names,             // Array of all lorebook names
  selected_world_info,     // Currently active lorebooks
  world_info               // Global lorebook state
} from '../../../world-info.js';
```

**Verified functions from `lorebookManager.js`:**
```javascript
// Line 231-238: Get attached lorebook name
export function getAttachedLorebook() {
  return chat_metadata?.[METADATA_KEY] || null;
}

// Line 295-327: Attach lorebook to chat
export function attachLorebook(lorebookName) {
  chat_metadata[METADATA_KEY] = lorebookName;
  chat_metadata.auto_lorebooks.lorebookName = lorebookName;
  saveMetadata();
  return true;
}

// Line 707-737: Delete lorebook file
export async function deleteChatLorebook(lorebookName) {
  const result = await deleteWorldInfo(lorebookName);
  return result;
}

// Line 240-248: Check if lorebook exists
export function lorebookExists(lorebookName) {
  return world_names && world_names.includes(lorebookName);
}
```

**VERIFIED:** We can detach, create temp, attach temp, delete temp, reattach original.

## Verified Snapshot System

**Source:** `sceneBreak.js` lines 1258-1281

**Scene break metadata structure:**
```javascript
// Stored in message.extra.auto_recap_memory.scene_recap_metadata
metadata[versionIndex] = {
  timestamp: Date.now(),
  chatLorebookName: "chat-name-lorebook",
  totalActivatedEntries: 5,
  allEntries: [/* full entry objects including registries */],
  entries: [/* active entry objects */],
  created_entry_uids: [/* UIDs created by this version */],
  combined_at: Date.now() // Added when combine completes
}
```

**VERIFIED:**
- `allEntries` contains ALL lorebook entries (including registries) at snapshot time
- `entries` contains ACTIVE entries only
- Both are deep-copied with Array spreads
- `created_entry_uids` tracks which UIDs belong to this version

## Verified Checkpoint Lorebook Reconstruction

**Source:** `lorebookReconstruction.js`

**Main function (line 381-425):**
```javascript
export async function reconstructPointInTimeLorebook(messageIndex, targetLorebookName) {
  // Step 1: Extract from snapshot
  const historicalState = extractHistoricalLorebookState(messageIndex);

  // Step 2: Create new lorebook
  const sanitizedLorebookName = await createLorebookForSnapshot(targetLorebookName);

  // Step 3: Reconstruct entries
  await reconstructLorebookEntries(sanitizedLorebookName, historicalState);

  // Step 4: Create operation queue entry
  await createOperationQueueEntry(sanitizedLorebookName);

  return { lorebookName: sanitizedLorebookName, entriesReconstructed, ... };
}
```

**Extract function (line 25-95):**
```javascript
export function extractHistoricalLorebookState(messageIndex) {
  const message = chat[messageIndex];
  const metadata = get_data(message, 'scene_recap_metadata');
  const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
  const versionMetadata = metadata[currentVersionIndex];

  const allEntries = versionMetadata.allEntries; // All entries including registries
  const sortedEntries = [...allEntries].sort((a, b) => a.uid - b.uid);

  return {
    entries: sortedEntries,
    sourceLorebookName: versionMetadata.chatLorebookName,
    totalEntries: sortedEntries.length,
    sourceMessageIndex: messageIndex,
    hasUIDGaps: /* UID validation */
  };
}
```

**VERIFIED:**
- Can extract `allEntries` from any scene break's metadata
- Can create new lorebook from scratch
- Can populate entries sequentially with correct UIDs
- Creates operation queue entry in new lorebook

## Verified COMBINE Operation Flow

**Source:** `operationHandlers.js` lines 1064-1117

**Handler execution order:**
```javascript
registerOperationHandler(OperationType.COMBINE_SCENE_WITH_RUNNING, async (operation) => {
  const index = operation.metadata.scene_index;

  // 1. Run combine (creates running recap)
  const result = await combine_scene_with_running_recap(index);

  // 2. Store token breakdown
  await updateOperationMetadata(operation.id, tokenMetadata);

  // 3. Update lorebook snapshot AFTER all lorebook ops complete
  //    (operation.dependencies contains completed lorebook op IDs)
  await updateSceneLorebookSnapshot(index);

  // 4. Mark scene as locked (combined_at timestamp)
  metadata[currentVersionIndex].combined_at = Date.now();
  set_data(message, 'scene_recap_metadata', metadata);

  return { recap: result?.recap || result };
});
```

**Dependency system:**
- COMBINE depends on lorebook operation IDs
- Won't execute until ALL dependencies complete
- Dependencies are lorebook ops: LOOKUP → RESOLVE → CREATE → UPDATE_REGISTRY

**VERIFIED:**
- COMBINE runs AFTER all lorebook operations finish
- Snapshot update runs INSIDE combine handler
- Locking happens AFTER snapshot update
- Operation queue guarantees sequential execution

## Finding Previous Scene

**Required:** Find the scene break immediately BEFORE the out-of-order scene.

**Search pattern:**
```javascript
function findPreviousSceneBreak(messageIndex, chat, get_data) {
  // Search backwards from messageIndex-1
  for (let i = messageIndex - 1; i >= 0; i--) {
    if (get_data(chat[i], 'scene_break')) {
      // Found previous scene break
      return i;
    }
  }
  // No previous scene (this is first scene)
  return null;
}
```

**VERIFIED:** Can iterate chat backwards checking `get_data(chat[i], 'scene_break')`.

## Proposed Solution Architecture

### High-Level Flow

```
1. User combines scene 30 (out of order - scenes 40,60,80,100 exist after it)
2. Detect out-of-order: messageIndex < latest combined scene
3. Find previous scene (20)
4. Load scene 20's snapshot (allEntries)
5. Create temp lorebook from snapshot
6. Detach original lorebook, attach temp lorebook
7. Run normal COMBINE operation (sees only temp lorebook)
8. Snapshot stores created_entry_uids
9. Detach temp lorebook, delete temp file, reattach original
10. Scene 30 is locked with correct snapshot
```

### Detection Logic

```javascript
function isOutOfOrderCombine(messageIndex, chat, get_data) {
  // Find latest combined scene
  let latestCombinedIndex = -1;
  for (let i = chat.length - 1; i >= 0; i--) {
    const metadata = get_data(chat[i], 'scene_recap_metadata');
    if (!metadata) continue;

    const currentIdx = get_data(chat[i], 'scene_recap_current_index') ?? 0;
    if (metadata[currentIdx]?.combined_at) {
      latestCombinedIndex = i;
      break;
    }
  }

  // Out of order if combining before latest combined scene
  return latestCombinedIndex > messageIndex;
}
```

### Temp Lorebook Creation

```javascript
async function createTempLorebookFromPreviousScene(messageIndex, chat, get_data) {
  // Find previous scene
  const prevSceneIndex = findPreviousSceneBreak(messageIndex, chat, get_data);

  if (prevSceneIndex === null) {
    // No previous scene - use empty lorebook (first scene in timeline)
    const tempName = `temp-scene-${messageIndex}-${Date.now()}`;
    await createLorebookForSnapshot(tempName);
    return { tempLorebookName: tempName, prevSceneIndex: null };
  }

  // Extract previous scene's snapshot
  const tempName = `temp-scene-${messageIndex}-${Date.now()}`;
  const result = await reconstructPointInTimeLorebook(prevSceneIndex, tempName);

  return {
    tempLorebookName: result.lorebookName,
    prevSceneIndex: prevSceneIndex
  };
}
```

### Wrapper for COMBINE Operation

```javascript
async function combineWithTemporaryLorebook(messageIndex) {
  // 1. Save original lorebook name
  const originalLorebook = getAttachedLorebook();

  // 2. Create temp lorebook from previous scene
  const { tempLorebookName } = await createTempLorebookFromPreviousScene(messageIndex, chat, get_data);

  // 3. Detach original
  // (Just need to change metadata, no explicit detach function needed)

  // 4. Attach temp lorebook
  const attached = attachLorebook(tempLorebookName);
  if (!attached) {
    throw new Error(`Failed to attach temp lorebook: ${tempLorebookName}`);
  }

  try {
    // 5. Run normal COMBINE operation
    //    - extractAndQueueLorebookEntries() extracts setting_lore
    //    - LOREBOOK_ENTRY_LOOKUP searches temp lorebook (only has previous timeline entries)
    //    - CREATE_LOREBOOK_ENTRY creates in temp lorebook
    //    - created_entry_uids tracks new UIDs
    //    - COMBINE runs
    //    - updateSceneLorebookSnapshot() filters by created_entry_uids
    //    - Scene marked as locked

    await runNormalCombineOperation(messageIndex);

  } finally {
    // 6. Cleanup: detach temp, delete temp, reattach original
    if (tempLorebookName) {
      await deleteChatLorebook(tempLorebookName);
    }

    if (originalLorebook) {
      attachLorebook(originalLorebook);
    }
  }
}
```

## Critical Assumptions to Verify

### ASSUMPTION 1: Lorebook isolation
**Claim:** When temp lorebook is attached, LOREBOOK_ENTRY_LOOKUP will ONLY search temp lorebook (not original).

**Verification needed:**
- Check how LOREBOOK_ENTRY_LOOKUP gets lorebook name
- Check if it uses `getAttachedLorebook()` or some other method
- Check if multiple lorebooks can be active simultaneously

### ASSUMPTION 2: Operation queue integrity
**Claim:** Changing attached lorebook mid-operation won't corrupt operation queue.

**Verification needed:**
- Check if operation queue is stored IN the lorebook file
- If yes: temp lorebook needs operation queue entry (VERIFIED: reconstructPointInTimeLorebook creates it)
- If no: changing lorebook won't affect queue

### ASSUMPTION 3: Snapshot independence
**Claim:** Snapshot update uses created_entry_uids, so it doesn't matter that entries are in temp lorebook.

**Current code (operationHandlers.js:134-184):**
```javascript
const createdUids = metadata[currentVersionIndex].created_entry_uids || [];
const allLorebookEntries = Object.values(worldData.entries)
  .filter(entry => {
    if (!entry || entry.comment === '__operation_queue') {return false;}
    const uid = String(entry.uid);
    return createdUidSet.has(uid);
  })
```

**PROBLEM:** `worldData` comes from temp lorebook, but `created_entry_uids` tracks UIDs that won't exist in original lorebook!

**FIX REQUIRED:** After cleanup, scene snapshot will have UIDs that don't exist in original lorebook. This is CORRECT for branching - checkpoint system will reconstruct from snapshot.

### ASSUMPTION 4: World names refresh
**Claim:** `world_names` array updates when temp lorebook is created/deleted.

**Verification needed:**
- Check if `createNewWorldInfo()` adds to `world_names`
- Check if `deleteWorldInfo()` removes from `world_names`
- May need to call `updateWorldInfoList()` manually

## Error Handling Requirements

1. **Temp lorebook creation fails:** Abort combine, show error
2. **Attach temp fails:** Delete temp lorebook, abort combine
3. **Combine operation fails:** Delete temp, reattach original
4. **Detach/reattach original fails:** Critical error, manual recovery needed
5. **Delete temp fails:** Log warning, temp file remains (cleanup on next init)

## Integration Points

### Where to hook the wrapper

**Option A:** Wrap in `sceneBreak.js` combine button handler (line 593-632)
- Check if out-of-order before calling `queueCombineSceneWithRunning`
- If out-of-order, call wrapper instead

**Option B:** Wrap in `queueIntegration.js` queueCombineSceneWithRunning (line 135-180)
- Detect out-of-order inside queue function
- Handle temp lorebook before enqueueing operations

**Recommendation:** Option A (button handler level)
- Cleaner separation
- Easier to test
- Doesn't complicate queue system

## Testing Strategy

### Test Cases

1. **Normal order combine:** Scenes 20, 40, 60 → combine in order → no temp lorebook
2. **Out of order with previous:** Scenes 20, 40 combined → place at 30 → temp from 20
3. **Out of order first scene:** Place at 10 → no previous → empty temp lorebook
4. **Temp lorebook isolation:** Scene 30 should NOT see scene 40's "Lyra" entry
5. **Cleanup verification:** Temp lorebook deleted, original reattached
6. **Error recovery:** Failed combine → temp deleted, original reattached
7. **Snapshot correctness:** Scene 30 snapshot has only its created UIDs
8. **Checkpoint branching:** Branch from scene 30 → uses scene 30's snapshot

### Manual Verification Steps

1. Create chat with scenes at 20, 40, 60 (all combined)
2. Check original lorebook has entries [A, B, C, D, E, F]
3. Place scene break at 30
4. Generate recap with setting_lore: ["Lyra", "Marcus"]
5. **Before clicking combine:** Note current lorebook name
6. Click combine on scene 30
7. **During combine:** Check lorebook attachment (should be temp)
8. **After combine:** Check lorebook attachment (should be original)
9. Check scene 30 snapshot: should have [Lyra, Marcus] UIDs only
10. Check original lorebook: should still have [A, B, C, D, E, F]
11. Check temp lorebook deleted: `world_names` should not contain temp

## Remaining Verifications Needed

1. ✅ SillyTavern lorebook APIs (VERIFIED)
2. ✅ Snapshot system (VERIFIED)
3. ✅ Checkpoint reconstruction (VERIFIED)
4. ✅ COMBINE operation flow (VERIFIED)
5. ❌ LOREBOOK_ENTRY_LOOKUP lorebook source
6. ❌ Operation queue storage location
7. ❌ World names auto-update behavior
8. ❌ Multiple lorebook activation behavior

## Next Steps

1. Verify remaining assumptions (5-8 above)
2. Choose integration point (Option A vs B)
3. Implement detection function
4. Implement temp lorebook wrapper
5. Add error handling
6. Write tests
7. Manual verification

## CRITICAL: NO IMPLEMENTATION WITHOUT VERIFICATION

DO NOT PROCEED TO IMPLEMENTATION UNTIL ALL ASSUMPTIONS VERIFIED AGAINST REAL CODE.

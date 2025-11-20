# Checkpoint/Branch Lorebook Reconstruction from Scene Break Metadata

**Date**: 2025-11-20
**Status**: ❌ **SUPERSEDED** - Overcomplicated approach
**Superseded By**: `checkpoint-lorebook-reconstruction-CORRECTED.md`
**Related**: `checkpoint-lorebook-cloning-feasibility.md`, `sillytavern-branches-and-checkpoints.md`

---

## ⚠️ IMPORTANT: This Document is Overcomplicated

This document assumed UIDs were timestamps and tried to force UID injection.

**Actual discovery**: Lorebook UIDs are **sequential starting at 0** (0, 1, 2, 3...), NOT timestamps. The operation queue entry uses a timestamp UID, but we exclude that.

**Result**: Much simpler approach - just create entries in UID order and they automatically get matching UIDs.

**See `checkpoint-lorebook-reconstruction-CORRECTED.md` for the simple, correct approach.**

---

## Critical Insight: We Have Point-in-Time Snapshots (Still True)

The scene break metadata already contains a **complete snapshot** of the lorebook state at that message. We don't clone the current lorebook - we **reconstruct** the historical state from the snapshot.

---

## Scene Recap Metadata Structure

### What's Stored in `message.extra.auto_recap_memory.scene_recap_metadata`

**Location**: `sceneBreak.js:926-936`

```javascript
{
  entries: [
    {
      uid: 1763632438061,
      comment: "character-Lyra Heartstrings",
      world: "z-AutoLB-Lyra Heartstrings - 2023-11-3...",
      key: ["Lyra", "Lyra Heartstrings"],
      position: 0,  // before_char, after_char, etc.
      depth: 4,
      order: 100,
      role: 0,  // system, user, assistant
      constant: false,
      vectorized: false,
      sticky: 0,
      strategy: "normal",  // normal, constant, or vectorized
      content: "{\n  \"name\": \"Lyra Heartstrings\",\n  \"species\": \"Unicorn\",\n  ..."
    },
    // ... more entries in activation order
  ],
  metadata: {
    startIdx: 0,
    endIdx: 14,
    sceneMessageCount: 15,
    totalActivatedEntries: 5,
    totalBeforeFiltering: 8,
    chatLorebookName: "z-AutoLB-Lyra Heartstrings - 2023-11-3...",
    suppressOtherLorebooks: true,
    entryNames: ["character-Lyra Heartstrings", "character-Bon Bon", ...]
  }
}
```

### Critical Properties for Reconstruction

1. **`uid`**: The unique identifier - **MUST match after recreation**
2. **`world`**: Which lorebook the entry came from (may be different from chat lorebook)
3. **`content`**: The actual entry content
4. **`comment`**: Entry name/identifier
5. All other properties: keys, position, depth, order, role, constant, vectorized, sticky

---

## The UID Problem

### SillyTavern UID Generation

**From SillyTavern's world-info.js**:
```javascript
// UIDs are timestamps in milliseconds
const uid = Date.now();
```

**Key Facts**:
- UIDs are **sequential** (increasing timestamps)
- UIDs are **globally unique** across all lorebooks
- UIDs are assigned **at creation time**
- Once created, UIDs **never change**
- UIDs generated in rapid succession are sequential (1ms apart)

### Two Approaches to Consider

#### Approach A: Sequential Creation (Simpler - Try First)

**Key Insight**: If we create entries in UID order, the new UIDs will also be sequential.

```
Historical state (sorted by UID):
  Entry 1: uid=1000, comment="character-Alice"
  Entry 2: uid=1001, comment="location-Park"
  Entry 3: uid=1002, comment="lore-Magic"

Create in same order:
  Entry 1: uid=2000, comment="character-Alice"
  Entry 2: uid=2001, comment="location-Park"
  Entry 3: uid=2002, comment="lore-Magic"
```

**Result**: Relative order preserved, UIDs sequential.

**But wait**: Do registry entries reference absolute UIDs?

If registry content is:
```json
{
  "character-Alice": { "uid": 1000, "lastModified": 123456 }
}
```

Then after reconstruction, this content would still reference `uid: 1000` but the actual entry has `uid: 2000`.

**Potential Solution**: Update registry entry content during reconstruction to map old UIDs → new UIDs.

**We won't know until we try** - this might "just work" if the registry doesn't store absolute UID references, or if the lookup mechanism is resilient to this.

#### Approach B: UID Injection (Complex - Fallback)

**Force SillyTavern to use our historical UIDs** instead of generating new ones.

This requires manipulating the lorebook JSON directly to inject historical UIDs, then validating they match exactly.

---

## Lorebook Reconstruction Algorithm (Approach A - Sequential Creation)

### Phase 1: Extract Historical State

```javascript
function extractHistoricalLorebookState(messageIndex) {
  const message = chat[messageIndex];

  // Get scene recap metadata for current version
  const metadata = get_data(message, 'scene_recap_metadata');
  const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
  const versionMetadata = metadata?.[currentVersionIndex];

  if (!versionMetadata?.entries || versionMetadata.entries.length === 0) {
    throw new Error('No lorebook entries found in scene break metadata');
  }

  // Sort entries by UID ascending (creation order)
  const sortedEntries = [...versionMetadata.entries].sort((a, b) => a.uid - b.uid);

  return {
    entries: sortedEntries,
    chatLorebookName: versionMetadata.metadata?.chatLorebookName,
    totalEntries: sortedEntries.length
  };
}
```

### Phase 2: Create New Lorebook

```javascript
async function createCheckpointLorebook(checkpointName) {
  const lorebookName = `z-AutoLB-${checkpointName}`;

  // Create empty lorebook
  const created = await createNewWorldInfo(lorebookName);
  if (!created) {
    throw new Error(`Failed to create lorebook: ${lorebookName}`);
  }

  debug(SUBSYSTEM.LOREBOOK, `Created checkpoint lorebook: ${lorebookName}`);
  return lorebookName;
}
```

### Phase 3: Reconstruct Entries in Order (Let SillyTavern Generate Sequential UIDs)

**Simple Implementation**: Create entries in UID order, let SillyTavern generate new sequential UIDs.

```javascript
async function reconstructLorebookEntries(targetLorebookName, historicalState) {
  const { entries } = historicalState;

  debug(SUBSYSTEM.LOREBOOK, `Reconstructing ${entries.length} entries in UID order`);

  const createdEntries = [];
  const uidMapping = {};  // old UID → new UID

  for (const historicalEntry of entries) {
    try {
      // Create entry normally (SillyTavern generates new UID)
      const newEntry = await createLorebookEntry(
        targetLorebookName,
        historicalEntry
      );

      // Track UID mapping
      uidMapping[historicalEntry.uid] = newEntry.uid;

      debug(SUBSYSTEM.LOREBOOK,
        `Created entry "${historicalEntry.comment}": ${historicalEntry.uid} → ${newEntry.uid}`
      );

      createdEntries.push(newEntry);

    } catch (err) {
      error(SUBSYSTEM.LOREBOOK, `Failed to create entry ${historicalEntry.comment}:`, err);
      throw err;
    }
  }

  debug(SUBSYSTEM.LOREBOOK, `✓ Created ${entries.length} entries with sequential UIDs`);

  return {
    entries: createdEntries,
    uidMapping  // Return mapping for potential registry updates
  };
}
```

### Phase 4: Create Entry (Let SillyTavern Generate UID)

**Simple function** - just create the entry with historical data, let SillyTavern assign UID:

```javascript
async function createLorebookEntry(lorebookName, entryData) {
  // Load the lorebook
  const response = await fetch('/api/worldinfo/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: lorebookName })
  });

  if (!response.ok) {
    throw new Error(`Failed to load lorebook: ${lorebookName}`);
  }

  const lorebook = await response.json();

  // Create entry - SillyTavern will generate UID via Date.now()
  const newUID = Date.now();
  const newEntry = {
    uid: newUID,
    comment: entryData.comment || '',
    key: Array.isArray(entryData.key) ? entryData.key : [],
    keysecondary: Array.isArray(entryData.secondary_keys) ? entryData.secondary_keys : [],
    content: entryData.content || '',
    constant: entryData.constant || false,
    vectorized: entryData.vectorized || false,
    selective: entryData.selective || true,
    position: entryData.position ?? 0,
    depth: entryData.depth ?? 4,
    order: entryData.order ?? 100,
    role: entryData.role ?? 0,
    sticky: entryData.sticky ?? 0,

    // SillyTavern required fields
    enabled: true,
    extensions: {},
    automationId: '',
    excludeRecursion: false,
    preventRecursion: false,
    delayUntilRecursion: false,
    displayIndex: Object.keys(lorebook.entries || {}).length,
    probability: 100,
    useProbability: true,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: false,
    matchWholeWords: false,
    useGroupScoring: false
  };

  // Add entry to lorebook
  if (!lorebook.entries) {
    lorebook.entries = {};
  }
  lorebook.entries[newUID] = newEntry;

  // Save lorebook back
  const saveResponse = await fetch('/api/worldinfo/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: lorebookName, data: lorebook })
  });

  if (!saveResponse.ok) {
    throw new Error(`Failed to save entry to lorebook: ${lorebookName}`);
  }

  debug(SUBSYSTEM.LOREBOOK, `Created entry with UID ${newUID}: ${entryData.comment}`);
  return newEntry;
}
```

### Phase 5: (Optional) Update Registry UID References

**If registry entries contain absolute UID references**, we need to update them:

```javascript
async function updateRegistryUIDReferences(lorebookName, uidMapping) {
  // Load the lorebook
  const lorebook = await loadWorldInfo(lorebookName);

  // Find registry entries (comment starts with "__registry")
  const registryEntries = Object.values(lorebook.entries)
    .filter(entry => entry.comment && entry.comment.startsWith('__registry'));

  if (registryEntries.length === 0) {
    debug(SUBSYSTEM.LOREBOOK, 'No registry entries to update');
    return;
  }

  for (const registryEntry of registryEntries) {
    let content = registryEntry.content;
    let updated = false;

    // Replace old UIDs with new UIDs in the content
    for (const [oldUID, newUID] of Object.entries(uidMapping)) {
      // Match patterns like: "uid": 1234567890
      const uidPattern = new RegExp(`"uid"\\s*:\\s*${oldUID}\\b`, 'g');
      if (uidPattern.test(content)) {
        content = content.replace(uidPattern, `"uid": ${newUID}`);
        updated = true;
      }
    }

    if (updated) {
      registryEntry.content = content;
      debug(SUBSYSTEM.LOREBOOK, `Updated UID references in registry entry: ${registryEntry.comment}`);
    }
  }

  // Save updated lorebook
  await saveWorldInfo(lorebookName, lorebook);
  debug(SUBSYSTEM.LOREBOOK, 'Registry UID references updated');
}
```

**Note**: We may not need this step at all - test first to see if registry lookups work without updating references.

---

## Complete Flow: Checkpoint Creation with Lorebook Reconstruction

### Step-by-Step Process

```javascript
async function createCheckpointWithReconstructedLorebook(messageIndex, checkpointName) {
  try {
    // Step 1: Extract historical lorebook state from scene break
    const historicalState = extractHistoricalLorebookState(messageIndex);

    debug(SUBSYSTEM.LOREBOOK,
      `Extracted ${historicalState.totalEntries} entries from scene break at message ${messageIndex}`
    );

    // Step 2: Create new lorebook for checkpoint
    const checkpointLorebookName = await createCheckpointLorebook(checkpointName);

    // Step 3: Reconstruct all entries with original UIDs
    const createdEntries = await reconstructLorebookEntries(
      checkpointLorebookName,
      historicalState
    );

    // Step 4: Copy running recap up to branch point
    const runningRecapSnapshot = copyRunningRecapUpToMessage(messageIndex);
    runningRecapSnapshot.chat_id = checkpointName;

    // Step 5: Return metadata to inject into checkpoint
    return {
      world_info: checkpointLorebookName,
      auto_recap_running_scene_recaps: runningRecapSnapshot,
      checkpoint_lorebook_reconstructed: true,
      checkpoint_lorebook_entries: createdEntries.length,
      checkpoint_source_message: messageIndex
    };

  } catch (err) {
    error(SUBSYSTEM.LOREBOOK, 'Failed to create checkpoint with reconstructed lorebook:', err);
    throw err;
  }
}
```

### Integration with saveChat Hook

```javascript
// Wrap SillyTavern's saveChat
const originalSaveChat = ctx.saveChat;

ctx.saveChat = async function wrappedSaveChat(options) {
  const isCheckpointOrBranch = options?.withMetadata?.main_chat !== undefined;

  if (isCheckpointOrBranch && options?.chatName && options?.mesId !== undefined) {
    try {
      // Reconstruct lorebook from scene break metadata
      const reconstructedMetadata = await createCheckpointWithReconstructedLorebook(
        options.mesId,
        options.chatName
      );

      // Inject into checkpoint metadata
      Object.assign(options.withMetadata, reconstructedMetadata);

      toast('Creating checkpoint with reconstructed lorebook...', 'info');

    } catch (err) {
      error(SUBSYSTEM.LOREBOOK, 'Lorebook reconstruction failed:', err);
      toast(`Checkpoint creation failed: ${err.message}`, 'error');
      throw err;
    }
  }

  return await originalSaveChat.call(this, options);
};
```

---

## UID Validation: Why It's Critical

### What Can Go Wrong

**Scenario 1: UID Generation Collision**
```
Historical UID: 1234567890000
New UID generated: 1763632438061  (current timestamp)

Result: Registry entry references 1234567890000
        Lorebook has entry with 1763632438061
        → Registry lookup fails! Entry not found.
```

**Scenario 2: UID Order Mismatch**
```
Historical creation order:
  Entry A: uid=1000
  Entry B: uid=1001

If we create B before A:
  Entry B gets uid=2000 (first created)
  Entry A gets uid=2001 (second created)

Result: UID order reversed!
        Registry corruption if order matters.
```

### Validation Strategy

```javascript
// After creating all entries, validate UIDs match
function validateReconstructedUIDs(historicalEntries, createdEntries) {
  const mismatches = [];

  for (let i = 0; i < historicalEntries.length; i++) {
    const historical = historicalEntries[i];
    const created = createdEntries[i];

    if (historical.uid !== created.uid) {
      mismatches.push({
        index: i,
        comment: historical.comment,
        expectedUID: historical.uid,
        actualUID: created.uid,
        delta: created.uid - historical.uid
      });
    }
  }

  if (mismatches.length > 0) {
    // Log detailed mismatch information
    error(SUBSYSTEM.LOREBOOK, 'UID validation failed:');
    for (const mismatch of mismatches) {
      error(SUBSYSTEM.LOREBOOK,
        `  Entry "${mismatch.comment}": expected ${mismatch.expectedUID}, got ${mismatch.actualUID} (Δ${mismatch.delta})`
      );
    }

    throw new Error(`UID validation failed: ${mismatches.length}/${historicalEntries.length} entries have wrong UIDs`);
  }

  debug(SUBSYSTEM.LOREBOOK, `✓ UID validation passed: all ${createdEntries.length} entries have correct UIDs`);
  return true;
}
```

---

## Edge Cases and Considerations

### Edge Case 1: Multiple Lorebooks (World Source)

**Problem**: Scene break metadata may include entries from multiple lorebooks (chat lorebook + global lorebook + character lorebook).

**Solution**:
```javascript
// Group entries by source lorebook
const entriesByWorld = groupBy(historicalState.entries, 'world');

// Only reconstruct entries from chat lorebook
const chatLorebookEntries = entriesByWorld[historicalState.chatLorebookName] || [];

// Global/character lorebook entries are NOT reconstructed
// They'll be re-activated naturally when the checkpoint is loaded
```

**Reasoning**: We only need to reconstruct the chat-specific lorebook. Global/character lorebooks still exist and will activate normally.

### Edge Case 2: Missing Scene Break Metadata

**Problem**: Message doesn't have scene break or metadata is incomplete.

**Solution**:
```javascript
function extractHistoricalLorebookState(messageIndex) {
  const message = chat[messageIndex];

  if (!get_data(message, 'scene_break')) {
    throw new Error('Cannot create checkpoint: message is not a scene break');
  }

  const metadata = get_data(message, 'scene_recap_metadata');
  if (!metadata || metadata.length === 0) {
    throw new Error('Cannot create checkpoint: no scene recap metadata found');
  }

  // ... rest of extraction
}
```

This error will be caught by the existing validation (`canCreateCheckpointOrBranch`) which already checks for scene break.

### Edge Case 3: UID Injection Failure

**Problem**: SillyTavern's API might reject or override our forced UID.

**Solution**: After creating each entry, immediately validate UID and fail fast:

```javascript
const newEntry = await createLorebookEntryWithUID(lorebookName, entryData, forcedUID);

// Immediate validation
if (newEntry.uid !== forcedUID) {
  throw new Error(
    `UID injection failed for entry "${entryData.comment}": ` +
    `expected ${forcedUID}, got ${newEntry.uid}`
  );
}
```

### Edge Case 4: Entries with Same Content but Different UIDs

**Problem**: Registry might have entries with same content but different UIDs across versions.

**Solution**: UIDs are the **primary key**. Content doesn't matter - we must preserve exact UIDs.

```javascript
// DO NOT deduplicate by content
// DO NOT merge entries with same content
// Each UID must be preserved exactly as it was historically
```

---

## Running Recap Snapshot (Already Covered)

From previous feasibility doc - this part remains the same:

```javascript
function copyRunningRecapUpToMessage(messageIndex) {
  const storage = chat_metadata.auto_recap_running_scene_recaps;

  if (!storage?.versions?.length) {
    return { chat_id: null, current_version: 0, versions: [] };
  }

  const relevantVersions = storage.versions.filter(v =>
    (v.new_scene_index ?? 0) <= messageIndex
  );

  const maxVersion = Math.max(...relevantVersions.map(v => v.version), 0);

  return {
    chat_id: null,  // Will be set to checkpoint name
    current_version: maxVersion,
    versions: relevantVersions
  };
}
```

---

## Testing Strategy

### Test 1: UID Preservation

```javascript
// Setup
const message = chat[10];  // Scene break with 5 lorebook entries
const historicalUIDs = [1000, 1001, 1002, 1003, 1004];

// Action
const reconstructed = await createCheckpointWithReconstructedLorebook(10, 'Test Checkpoint');

// Verify
const checkpointLorebook = await loadWorldInfo(reconstructed.world_info);
const actualUIDs = Object.keys(checkpointLorebook.entries).map(Number).sort();

expect(actualUIDs).toEqual(historicalUIDs);  // ✓ UIDs match exactly
```

### Test 2: UID Order Preservation

```javascript
// Setup
const historicalEntries = [
  { uid: 1000, comment: 'entry-A' },
  { uid: 1005, comment: 'entry-B' },
  { uid: 1003, comment: 'entry-C' }
];

// Action
const createdEntries = await reconstructLorebookEntries('test-lorebook', { entries: historicalEntries });

// Verify
expect(createdEntries[0].uid).toBe(1000);
expect(createdEntries[1].uid).toBe(1005);
expect(createdEntries[2].uid).toBe(1003);
// Order preserved even though UIDs not sequential
```

### Test 3: Registry References Remain Valid

```javascript
// Setup
const mainChat = loadChat('Main Chat');
const message10 = mainChat[10];
const registryEntry = getLorebookEntry('character-Alice');  // uid=1000

// Create checkpoint
await createCheckpoint(10, 'Checkpoint-1');

// Load checkpoint
await loadChat('Checkpoint-1');

// Verify
const checkpointRegistryEntry = getLorebookEntry('character-Alice');
expect(checkpointRegistryEntry.uid).toBe(1000);  // ✓ Same UID
expect(checkpointRegistryEntry.content).toBe(registryEntry.content);  // ✓ Same content
```

### Test 4: Cross-Contamination Still Prevented

```javascript
// Setup
await createCheckpoint(10, 'Checkpoint-1');  // Has entries [1000, 1001, 1002]

// Add new entry in main chat
await addRegistryEntry('location-NewPlace');  // uid=2000

// Load checkpoint
await loadChat('Checkpoint-1');

// Verify
const checkpointEntries = getLorebookEntries();
expect(checkpointEntries.map(e => e.uid)).not.toContain(2000);  // ✓ Isolated
```

---

## Implementation Timeline

### Phase 1: Proof of Concept Test (1 hour) - DO THIS FIRST
- Create a simple test: create 3 entries in rapid succession
- Verify UIDs are sequential (e.g., 2000, 2001, 2002)
- Check if 1ms gaps between entries are consistent
- **This validates the sequential UID assumption**

### Phase 2: Historical State Extraction (1-2 hours)
- Implement `extractHistoricalLorebookState()`
- Handle edge cases (missing metadata, multiple lorebooks)
- Sort entries by UID ascending

### Phase 3: Basic Reconstruction (2-3 hours)
- Implement `reconstructLorebookEntries()` with sequential creation
- Track UID mapping (old → new)
- Error handling and logging

### Phase 4: Integration (2 hours)
- Hook into saveChat
- Inject metadata into checkpoint
- Running recap copying

### Phase 5: Testing Without Registry Updates (2 hours)
- Create checkpoint with reconstructed lorebook
- Test if registry lookups work with new UIDs
- **If this works, we're done!**
- **If it doesn't work, proceed to Phase 6**

### Phase 6: Registry UID Update (if needed) (2-3 hours)
- Implement `updateRegistryUIDReferences()`
- Update registry content to use new UIDs
- Test registry lookups after update

### Phase 7: Full Integration Testing (2-3 hours)
- Cross-contamination prevention tests
- Edge case testing
- Migration for existing checkpoints

**Optimistic Total: 8-10 hours** (if registry doesn't need UID updates)
**Pessimistic Total: 12-14 hours** (if registry needs UID updates)

---

## Critical Success Factors

1. **Sequential UID Generation Must Be Reliable**: UIDs generated in rapid succession must be sequential (Test this first!)
2. **UID Order Must Preserve**: Create entries in ascending historical UID order
3. **Scene Break Metadata Must Be Complete**: Entries must have all required fields
4. **Registry May or May Not Need UID Remapping**: Test without remapping first - it might "just work"

---

## Conclusion

This approach is **fundamentally different** from simple lorebook cloning:

❌ **Wrong Approach**: Clone current lorebook → includes future entries → wrong point-in-time state
✅ **Correct Approach**: Reconstruct from scene break metadata → exact historical state

The scene break metadata is our **point-in-time snapshot** - it already contains everything we need.

### Two-Phase Strategy

**Approach A (Try First - Simpler)**:
1. Extract entries from scene break metadata
2. Sort by UID ascending (creation order)
3. Create entries in that order → SillyTavern generates sequential new UIDs
4. Test if registry works with new UIDs
5. If yes: Done! ✅
6. If no: Proceed to optional UID remapping

**Approach B (Fallback - If Needed)**:
1. All steps from Approach A
2. Plus: Remap old UIDs → new UIDs in registry entry content
3. Or: Force historical UIDs via direct lorebook JSON manipulation

### Key Insight from User

**UIDs are generated sequentially** (timestamps). As long as we create entries in the same relative order, the new UIDs will also be sequential. This preserves the relationship between entries without needing to force specific UID values.

### Critical First Step

**Create a proof-of-concept test** (1 hour):
- Create 3 lorebook entries in rapid succession
- Verify UIDs are sequential (e.g., 2000, 2001, 2002)
- Confirm 1ms gaps are consistent
- **This validates our core assumption**

If UIDs are reliably sequential, Approach A should work with minimal complexity.

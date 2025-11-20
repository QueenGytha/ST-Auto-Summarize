# Checkpoint/Branch Lorebook Reconstruction - CORRECTED APPROACH

**Date**: 2025-11-20
**Status**: ✅ SIMPLE AND FEASIBLE
**Supersedes**: `checkpoint-lorebook-reconstruction.md` (overcomplicated)
**Related**: `sillytavern-branches-and-checkpoints.md`, `lorebook-NOT-IMPLEMENTED.md`

---

## Critical Discovery: UIDs Start at 0, Not Timestamps

**Examination of actual lorebook file**: `z-AutoLB-Lyra Heartstrings - 2023-11-3 @23h 45m 12s 272ms.json`

### UID Structure

**Regular entries**:
```json
{
  "0": { "uid": 0, "comment": "_registry_character" },
  "1": { "uid": 1, "comment": "_registry_location" },
  "2": { "uid": 2, "comment": "_registry_item" },
  "3": { "uid": 3, "comment": "_registry_faction" },
  "4": { "uid": 4, "comment": "_registry_lore" },
  "5": { "uid": 5, "comment": "_registry_quest" },
  "6": { "uid": 6, "comment": "_registry_rule" },
  "7": { "uid": 7, "comment": "character-Lyra Heartstrings" },
  "8": { "uid": 8, "comment": "character-Bon Bon" },
  "9": { "uid": 9, "comment": "location-Park" },
  "10": { "uid": 10, "comment": "location-Lyra and Bon Bon's Home" },
  "11": { "uid": 11, "comment": "lore-Equestria Society" }
}
```

**Operation queue entry** (special case):
```json
{
  "1763632438061": {
    "uid": 1763632438061,
    "comment": "__operation_queue"
  }
}
```

### Key Insights

1. **Regular entries have sequential UIDs starting at 0**: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
2. **Operation queue uses timestamp UID**: 1763632438061 (current timestamp in ms)
3. **Registry references use UIDs**: "uid: 7 | name: character-Lyra Heartstrings"

### Why This Makes Everything Simple

If we create entries in UID order (0, 1, 2, 3...), the new lorebook will also assign them UIDs 0, 1, 2, 3...

**Result**: UIDs match exactly! Registry references remain valid!

---

## The Simple Algorithm

### Phase 1: Extract Historical State (Exclude Operation Queue)

```javascript
function extractHistoricalLorebookState(messageIndex) {
  const message = chat[messageIndex];
  const metadata = get_data(message, 'scene_recap_metadata');
  const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
  const versionMetadata = metadata?.[currentVersionIndex];

  if (!versionMetadata?.entries || versionMetadata.entries.length === 0) {
    throw new Error('No lorebook entries found in scene break metadata');
  }

  // Filter out operation queue entry (has comment "__operation_queue")
  const contentEntries = versionMetadata.entries.filter(
    entry => entry.comment !== '__operation_queue'
  );

  // Sort by UID ascending (creation order)
  const sortedEntries = [...contentEntries].sort((a, b) => a.uid - b.uid);

  debug(SUBSYSTEM.LOREBOOK,
    `Extracted ${sortedEntries.length} entries (excluding operation queue) from scene break`
  );

  return {
    entries: sortedEntries,
    chatLorebookName: versionMetadata.metadata?.chatLorebookName,
    totalEntries: sortedEntries.length
  };
}
```

### Phase 2: Create Lorebook

```javascript
async function createCheckpointLorebook(checkpointName) {
  const lorebookName = `z-AutoLB-${checkpointName}`;

  const created = await createNewWorldInfo(lorebookName);
  if (!created) {
    throw new Error(`Failed to create lorebook: ${lorebookName}`);
  }

  debug(SUBSYSTEM.LOREBOOK, `Created checkpoint lorebook: ${lorebookName}`);
  return lorebookName;
}
```

### Phase 3: Reconstruct Entries in UID Order

**Key insight**: Create entries in ascending UID order → they get UIDs 0, 1, 2, 3... automatically

```javascript
async function reconstructLorebookEntries(targetLorebookName, historicalState) {
  const { entries } = historicalState;

  debug(SUBSYSTEM.LOREBOOK,
    `Reconstructing ${entries.length} entries in UID order (0 to ${entries.length - 1})`
  );

  for (let i = 0; i < entries.length; i++) {
    const historicalEntry = entries[i];

    // Create entry normally - will get UID based on creation order
    await createLorebookEntry(targetLorebookName, historicalEntry);

    debug(SUBSYSTEM.LOREBOOK,
      `Created entry ${i}: "${historicalEntry.comment}" (original uid=${historicalEntry.uid}, new uid=${i})`
    );
  }

  debug(SUBSYSTEM.LOREBOOK,
    `✓ Reconstructed ${entries.length} entries with UIDs 0-${entries.length - 1}`
  );
}
```

**Expected Result**:
```
Historical entry with uid=0 → created first  → new uid=0 ✓
Historical entry with uid=1 → created second → new uid=1 ✓
Historical entry with uid=2 → created third  → new uid=2 ✓
...
Historical entry with uid=11 → created 12th  → new uid=11 ✓
```

### Phase 4: Create Individual Entry

```javascript
async function createLorebookEntry(lorebookName, entryData) {
  const response = await fetch('/api/worldinfo/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: lorebookName })
  });

  if (!response.ok) {
    throw new Error(`Failed to load lorebook: ${lorebookName}`);
  }

  const lorebook = await response.json();

  // Determine next UID (sequential)
  const existingUIDs = Object.keys(lorebook.entries || {}).map(Number);
  const nextUID = existingUIDs.length > 0 ? Math.max(...existingUIDs) + 1 : 0;

  const newEntry = {
    uid: nextUID,
    comment: entryData.comment || '',
    key: Array.isArray(entryData.key) ? entryData.key : [],
    keysecondary: Array.isArray(entryData.keysecondary) ? entryData.keysecondary : [],
    content: entryData.content || '',
    constant: entryData.constant || false,
    vectorized: entryData.vectorized || false,
    selective: entryData.selective !== undefined ? entryData.selective : true,
    selectiveLogic: entryData.selectiveLogic ?? 0,
    position: entryData.position ?? 0,
    depth: entryData.depth ?? 4,
    order: entryData.order ?? 100,
    role: entryData.role ?? 0,
    sticky: entryData.sticky ?? null,

    // SillyTavern required fields
    enabled: true,
    addMemo: false,
    excludeRecursion: false,
    preventRecursion: entryData.preventRecursion || false,
    ignoreBudget: entryData.ignoreBudget || false,
    disable: entryData.disable || false,
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false,
    delayUntilRecursion: 0,
    probability: 100,
    useProbability: false,
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    cooldown: null,
    delay: null,
    displayIndex: nextUID,
    triggers: [],
    tags: entryData.tags || []
  };

  if (!lorebook.entries) {
    lorebook.entries = {};
  }
  lorebook.entries[nextUID] = newEntry;

  const saveResponse = await fetch('/api/worldinfo/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: lorebookName, data: lorebook })
  });

  if (!saveResponse.ok) {
    throw new Error(`Failed to save entry to lorebook: ${lorebookName}`);
  }

  return newEntry;
}
```

---

## Complete Flow

```javascript
async function createCheckpointWithReconstructedLorebook(messageIndex, checkpointName) {
  try {
    // Step 1: Extract historical lorebook state (excluding operation queue)
    const historicalState = extractHistoricalLorebookState(messageIndex);

    // Step 2: Create new lorebook for checkpoint
    const checkpointLorebookName = await createCheckpointLorebook(checkpointName);

    // Step 3: Reconstruct all entries in UID order
    await reconstructLorebookEntries(checkpointLorebookName, historicalState);

    // Step 4: Copy running recap up to branch point
    const runningRecapSnapshot = copyRunningRecapUpToMessage(messageIndex);
    runningRecapSnapshot.chat_id = checkpointName;

    // Step 5: Return metadata to inject into checkpoint
    return {
      world_info: checkpointLorebookName,
      auto_recap_running_scene_recaps: runningRecapSnapshot,
      checkpoint_lorebook_reconstructed: true,
      checkpoint_lorebook_entries: historicalState.totalEntries,
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
const originalSaveChat = ctx.saveChat;

ctx.saveChat = async function wrappedSaveChat(options) {
  const isCheckpointOrBranch = options?.withMetadata?.main_chat !== undefined;

  if (isCheckpointOrBranch && options?.chatName && options?.mesId !== undefined) {
    try {
      const reconstructedMetadata = await createCheckpointWithReconstructedLorebook(
        options.mesId,
        options.chatName
      );

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

## Why Registry References Stay Valid

**Example**:

**Original lorebook**:
```
uid 0: _registry_character (content: "uid: 7 | character-Lyra Heartstrings")
uid 7: character-Lyra Heartstrings
```

**After reconstruction** (entries created in order 0→7):
```
uid 0: _registry_character (content: "uid: 7 | character-Lyra Heartstrings")
uid 7: character-Lyra Heartstrings
```

**Result**: Registry reference "uid: 7" still points to the correct entry! ✅

**No UID remapping needed!** 🎉

---

## Operation Queue Entry

**Why we don't copy it**:
1. Validation requires queue to be **empty** before checkpoint/branch creation
2. Empty queue entry will be **automatically created** when extension initializes the new lorebook
3. New operation queue gets a **new timestamp UID** (e.g., 1763632438061)
4. This doesn't affect the sequential UIDs (0, 1, 2...) for content entries

**Handling**:
```javascript
// Filter out operation queue from historical entries
const contentEntries = versionMetadata.entries.filter(
  entry => entry.comment !== '__operation_queue'
);
```

---

## Edge Cases

### Edge Case 1: Scene Break Has Operation Queue in Metadata

**Scenario**: Scene break metadata includes operation queue entry (shouldn't happen but handle it).

**Solution**: Filter it out explicitly:
```javascript
const contentEntries = entries.filter(e => e.comment !== '__operation_queue');
```

### Edge Case 2: UIDs Not Starting at 0

**Scenario**: Historical lorebook has UIDs like [5, 6, 7, 8] (first 5 deleted).

**Solution**: Still works! Create in order:
```
Historical uid=5 → new uid=0
Historical uid=6 → new uid=1
Historical uid=7 → new uid=2
Historical uid=8 → new uid=3
```

Registry references will need updating in this case.

**Detection**:
```javascript
const firstUID = sortedEntries[0].uid;
if (firstUID !== 0) {
  debug(SUBSYSTEM.LOREBOOK,
    `Warning: Historical UIDs don't start at 0 (start at ${firstUID}). ` +
    `Registry references may need updating.`
  );
}
```

### Edge Case 3: Missing Entries (Gaps in UID Sequence)

**Scenario**: UIDs are [0, 1, 2, 5, 6, 7] (3 and 4 deleted).

**Solution**: Create in order:
```
Historical uid=0 → new uid=0 ✓
Historical uid=1 → new uid=1 ✓
Historical uid=2 → new uid=2 ✓
Historical uid=5 → new uid=3 ❌ (was 5, now 3)
Historical uid=6 → new uid=4 ❌ (was 6, now 4)
Historical uid=7 → new uid=5 ❌ (was 7, now 5)
```

Registry references need updating.

**Detection**:
```javascript
const hasGaps = sortedEntries.some((entry, index) => entry.uid !== index);
if (hasGaps) {
  debug(SUBSYSTEM.LOREBOOK, 'Warning: UID sequence has gaps. Registry references may need updating.');
}
```

**Mitigation**: Since we control lorebook creation (auto-lorebooks extension), we never delete entries, only disable them. So gaps shouldn't exist in practice.

---

## Implementation Timeline

### Phase 1: Basic Implementation (4-5 hours)
- Implement `extractHistoricalLorebookState()` with operation queue filtering
- Implement `createCheckpointLorebook()`
- Implement `reconstructLorebookEntries()` with sequential creation
- Implement `createLorebookEntry()`

### Phase 2: Integration (2 hours)
- Hook into saveChat
- Inject metadata into checkpoint
- Running recap copying

### Phase 3: Testing (2-3 hours)
- Test with real scene break
- Verify UIDs match (0, 1, 2...)
- Verify registry references work
- Test cross-contamination prevention

### Phase 4: Edge Case Handling (1-2 hours)
- Add UID gap detection
- Add warnings for non-standard UID sequences
- Handle missing metadata gracefully

**Total: 9-12 hours**

---

## Critical Success Factors

1. **✅ UIDs are sequential starting at 0** (verified in actual lorebooks)
2. **✅ Operation queue can be excluded** (must be empty per validation)
3. **✅ Creating entries in order preserves UIDs** (0→0, 1→1, 2→2...)
4. **✅ No registry remapping needed** (UIDs match exactly)

---

## Advantages Over Previous Approach

**Previous (overcomplicated)**:
- Tried to inject historical UIDs
- Tried to force timestamp UIDs
- Tracked UID mappings
- Updated registry content

**Current (simple)**:
- Create entries in UID order
- Let SillyTavern assign sequential UIDs
- UIDs automatically match
- Registry references automatically work

**Simplicity**: Reduced from ~15 hours to ~10 hours, and much less complex.

---

## Conclusion

The discovery that **lorebook UIDs start at 0 and increment sequentially** (not timestamps) makes reconstruction trivial:

1. Extract entries from scene break metadata
2. Filter out operation queue entry
3. Sort by UID ascending
4. Create entries in that order
5. New UIDs will be 0, 1, 2, 3... matching the originals
6. Registry references remain valid

**No UID remapping needed in the common case!**

The only complexity is handling edge cases (gaps in UIDs, non-zero start), but those shouldn't occur in practice since we control lorebook creation and never delete entries.

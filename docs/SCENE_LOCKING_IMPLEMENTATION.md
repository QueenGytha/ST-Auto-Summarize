# Scene Locking Implementation

## Problem Solved

**Original Problem:** Out-of-order scene combines would pollute lorebook with entries from future timeline.

**Solution:** Prevent out-of-order combines entirely by locking earlier scenes when later scenes are combined.

## Implementation (sceneBreak.js)

### 1. Helper Function: Check for Later Combined Scenes

```javascript
// Lines 328-349
function hasLaterCombinedScenes(index, chat, get_data) {
  for (let i = index + 1; i < chat.length; i++) {
    const laterMessage = chat[i];
    if (!get_data(laterMessage, SCENE_BREAK_KEY)) {
      continue;
    }

    // Only count real scenes (with recap data), not empty bookmarks
    const laterRecap = get_data(laterMessage, SCENE_RECAP_MEMORY_KEY);
    if (!laterRecap) {
      continue;
    }

    const laterMetadata = get_data(laterMessage, SCENE_RECAP_METADATA_KEY) || {};
    const laterCurrentIdx = get_data(laterMessage, 'scene_recap_current_index') ?? 0;
    if (laterMetadata[laterCurrentIdx]?.combined_at) {
      return true;
    }
  }
  return false;
}
```

**Logic:**
- Iterates through all messages after the current scene
- Skips non-scene-break messages
- **CRITICAL:** Ignores empty scene breaks (no recap data) - these are just bookmarks
- Checks if later scene has `combined_at` timestamp
- Returns true if ANY later real scene is combined

### 2. Locking Logic in renderSceneBreak

```javascript
// Lines 448-452
const metadata = get_data(message, SCENE_RECAP_METADATA_KEY) || {};
const thisSceneCombined = metadata[currentIdx]?.combined_at !== undefined;
const hasLaterCombinedScene = hasLaterCombinedScenes(index, chat, get_data);
const isCombined = thisSceneCombined || hasLaterCombinedScene;
```

**Scene is locked if:**
- This scene has been combined (`thisSceneCombined`)
- OR any later scene has been combined (`hasLaterCombinedScene`)

### 3. UI Updates in buildSceneBreakElement

```javascript
// Lines 349-352
const lockedBadge = isCombined ? (hasLaterCombinedScene ?
  '<span style="color:#888; font-size:0.85em; margin-left:0.5em;" title="Cannot modify - later scenes already combined">[Locked - Later scenes exist]</span>' :
  '<span style="color:#888; font-size:0.85em; margin-left:0.5em;" title="Scene already combined">[Locked]</span>') : '';
```

**Locked scenes show:**
- `[Locked - Later scenes exist]` - if locked because later scenes are combined
- `[Locked]` - if locked because this scene itself is combined

**Buttons disabled when locked:**
- Previous/Next recap buttons (version navigation)
- Combine button
- Recap textarea (read-only)

**Generate button stays enabled:**
- Allows creating new unlocked version

## Empty Scene Breaks (Critical)

**Definition:** Scene break with no `scene_recap_memory` data.

**Behavior:**
- Treated as visual bookmark only
- Does NOT block earlier scenes from combining
- Does NOT count as "later combined scene"
- **CRITICALLY:** Skipped when finding scene boundaries (prevents orphaning messages)
- Will NOT be included in checkpoint/branch lorebook reconstruction

**Use case:** User places scene break to mark a spot for future branching, but hasn't generated recap yet.

### Scene Boundary Detection

**Without bookmark skipping (BROKEN):**
```
Scene 20 (has recap) → msgs 21-30 → Scene 30 (BOOKMARK) → msgs 31-40 → Scene 40 (has recap)

Scene 40 looks backwards:
- Finds Scene 30 (bookmark)
- Uses msg 31 as start
- Scene 40 covers msgs 31-40 ❌
- Messages 21-30 are ORPHANED (never recapped)
```

**With bookmark skipping (FIXED):**
```
Scene 20 (has recap) → msgs 21-30 → Scene 30 (BOOKMARK) → msgs 31-40 → Scene 40 (has recap)

Scene 40 looks backwards:
- Finds Scene 30 (bookmark) - SKIPS IT
- Continues to Scene 20 (has recap)
- Uses msg 21 as start
- Scene 40 covers msgs 21-40 ✓
- All messages are recapped
```

### Fixed Functions

**1. findSceneBoundaries() (sceneBreak.js:303-333)**
- Searches backwards for previous scene break
- Checks if scene has recap data
- Skips empty bookmarks
- Used by: Scene recap generation, scene display

**2. Auto scene break detection (autoSceneBreakDetection.js:764-778)**
- Calculates scene start for token counting
- Checks if scene has recap data before using as boundary
- Skips empty bookmarks
- Used by: Auto break detection, token limit validation

## Timeline Progression Rules

**Forward progression ONLY:**

```
✓ Scene 20 → Scene 40 → Scene 60 (allowed)
✗ Scene 60 → Scene 20 → Scene 40 (blocked by locking)
```

**Example scenario:**
```
1. Chat has scenes at 20, 40, 60 (none combined yet)
2. User combines scene 60 → scene 60 locked
3. User tries to generate/combine scene 40 → BLOCKED [Locked - Later scenes exist]
4. User tries to generate/combine scene 20 → BLOCKED [Locked - Later scenes exist]
5. Only scenes 80, 100, 120... can be generated/combined
```

**Branching workflow:**
```
1. Chat has scenes at 20, 40, 60 (all combined)
2. User wants to branch from scene 40
3. User creates checkpoint at scene 40 (separate operation)
4. Checkpoint system:
   - Finds previous scene (20)
   - Loads scene 20's snapshot (allEntries)
   - Creates NEW lorebook from snapshot
   - Creates NEW chat with that lorebook
   - User continues from scene 40 in new chat
5. Original chat timeline remains unchanged
```

## Relationship to Branching/Checkpoints

**IMPORTANT:** Scene locking is SEPARATE from branching/checkpoints.

**Branching does NOT require out-of-order combines:**
- User branches by creating checkpoint/new chat
- Checkpoint system reconstructs lorebook from previous scene's snapshot
- New chat has clean timeline starting from branch point
- No need to combine scenes out-of-order

**This is why we removed requirement:**
> "remove the requirement for a branch/checkpoint to be done on a scene break (but still keep our logic hooking into it, which we'll use later)"

Branching can happen anywhere, not just at scene breaks. Scene breaks just provide convenient checkpoints with lorebook snapshots.

## Combined_at Timestamp

**Set by:** `operationHandlers.js` lines 1104-1115 in COMBINE_SCENE_WITH_RUNNING handler

```javascript
// Mark this scene/version as combined (locked in - prevents further modification)
const ctx = getContext();
const message = ctx.chat[index];
if (message) {
  const metadata = get_data(message, 'scene_recap_metadata') || {};
  const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
  if (metadata[currentVersionIndex]) {
    metadata[currentVersionIndex].combined_at = Date.now();
    set_data(message, 'scene_recap_metadata', metadata);
    saveChatDebounced();
    debug(SUBSYSTEM.QUEUE, `Marked scene ${index} version ${currentVersionIndex} as combined (locked)`);
  }
}
```

**Timing:** Set AFTER lorebook snapshot update, before returning from combine operation.

**Purpose:** Permanent marker that this scene version has been processed and integrated into running recap.

## Benefits of This Approach

1. **Simple:** No temp lorebook juggling, no queue state management
2. **Safe:** Prevents timeline pollution entirely by blocking out-of-order operations
3. **Clear UX:** User sees exactly why scene is locked
4. **Natural flow:** Encourages forward progression, branching uses separate mechanism
5. **No edge cases:** Empty bookmarks don't interfere with locking logic

## Related Files

- `OUT_OF_ORDER_COMBINE_DESIGN.md` - Original complex approach (OBSOLETE, kept for reference)
- `lorebookReconstruction.js` - Checkpoint system (separate from locking)
- `operationHandlers.js:1104-1115` - Sets `combined_at` timestamp
- `sceneBreak.js:328-349` - Helper function checking for later scenes
- `sceneBreak.js:448-452` - Locking logic
- `sceneBreak.js:349-352` - Locked badge UI

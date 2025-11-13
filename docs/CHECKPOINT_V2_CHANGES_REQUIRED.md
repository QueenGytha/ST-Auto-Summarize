# Checkpoint V2 - Complete Changes Required

**Date:** 2025-01-12
**Purpose:** Comprehensive list of ALL changes needed to implement V2 checkpoint requirements
**Status:** DESIGN - Not implemented

---

## Overview

This document outlines every file that needs to be created or modified to implement the V2 checkpoint/branch system with complete point-in-time correctness.

**IMPORTANT:** See `LOREBOOK_DUPLICATION_CORRECT_METHOD.md` for the definitive specification on how to copy lorebook entries while preserving UIDs and registry integrity. This document references that method throughout.

---

## Changes to Existing Files

### ⚠️ IMPORTANT: lorebookManager.js `isInternalEntry()` is NOT for Checkpoints

**CRITICAL:** The `isInternalEntry()` function (lorebookManager.js:362-365) is used EXCLUSIVELY for duplicating entries from global/character lorebooks into chat lorebooks during chat creation.

**It is NOT used for checkpoint/branch lorebook cloning and MUST NOT be modified for that purpose.**

**Purpose:** Filters internal entries (`_registry_*`, operation queue, category indexes) when copying FROM active global/character lorebooks TO a new chat lorebook.

**Usage:** Called by `processLorebookForDuplication()` (line 420) → `duplicateActiveLorebookEntries()` (line 577) → `createChatLorebook()` (line 577)

**For Checkpoints:** V2 checkpoint cloning will require a SEPARATE function that copies ALL entries (no filtering) to create complete point-in-time snapshots.

---

### 1. eventHandlers.js (Add CHAT_CHANGED Handler)

**File:** `eventHandlers.js`
**Location:** After existing event handlers (around line 430)
**Type:** New event handler

**Add:**
```javascript
/**
 * Handle chat changed event - detects checkpoint/branch loads
 * Validates and notifies about checkpoint state restoration
 */
eventSource.on(event_types.CHAT_CHANGED, async () => {
  try {
    // Check if we're in a checkpoint/branch
    if (!chat_metadata.main_chat) {
      // Not a checkpoint, regular chat
      return;
    }

    // We're in a checkpoint/branch
    const checkpointState = chat_metadata.auto_recap_checkpoint_state;

    if (!checkpointState) {
      // Legacy checkpoint (created before V2) or no checkpoint data
      debug(SUBSYSTEM.CORE, 'No checkpoint state metadata found');
      return;
    }

    // Validate and notify about checkpoint restoration
    const { restoreCheckpointState } = await import('./checkpointManager.js');
    await restoreCheckpointState(checkpointState);

  } catch (error) {
    console.error('[Auto-Recap] Error handling checkpoint restoration:', error);
    toastr.error(`Checkpoint restoration failed: ${error.message}`, 'Checkpoint Error');
  }
});
```

**Why:** This detects when a checkpoint/branch is loaded and validates that the state was restored correctly. It's the entry point for checkpoint restoration validation.

---

### 3. index.js (Export Checkpoint Functions)

**File:** `index.js`
**Location:** In the exports section (around line 200+)
**Type:** Add exports

**Add to exports:**
```javascript
// Checkpoint/Branch Management
export { createCheckpoint } from './checkpointManager.js';
export { validateCheckpointRequirements } from './checkpointManager.js';
```

**Add to window.AutoRecap exposure (if needed for UI):**
```javascript
window.AutoRecap = {
  // ... existing exports ...

  // Checkpoint management
  createCheckpoint: async (messageId, checkpointName) => {
    const { createCheckpoint } = await import('./checkpointManager.js');
    return createCheckpoint(messageId, checkpointName);
  },
};
```

**Why:** Makes checkpoint functions available to other modules and UI code.

---

## New Files to Create

### 4. checkpointManager.js (Complete New File)

**File:** `checkpointManager.js` (NEW)
**Location:** Root of extension directory
**Size:** ~500-600 lines
**Type:** Core checkpoint logic

**Structure:**
```javascript
/**
 * Checkpoint/Branch Management for ST-Auto-Recap
 *
 * V2 Requirements:
 * - Copy ALL lorebook entries (no filtering)
 * - Block creation if queue not empty
 * - Capture running recap versions + combined recap
 * - Validate on restoration
 * - Complete point-in-time correctness
 */

import {
  debug,
  SUBSYSTEM,
  get_settings,
  chat_metadata,
  getCurrentChatId,
  error,
  warn,
  log
} from './index.js';

import {
  getCurrentQueue,
  isQueueEmpty
} from './operationQueue.js';

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate requirements before creating checkpoint
 * @throws {Error} if validation fails
 */
export async function validateCheckpointRequirements(messageId) {
  const errors = [];
  const warnings = [];

  // 1. Queue MUST be empty (BLOCKING)
  if (!isQueueEmpty()) {
    const queue = getCurrentQueue();
    const pending = queue?.queue?.filter(op =>
      op.status === 'pending' || op.status === 'in_progress'
    );
    errors.push(`Queue has ${pending.length} pending operations. Wait for queue to finish.`);
  }

  // 2. Message MUST exist
  const messages = context.chat;
  const message = messages[messageId];
  if (!message) {
    errors.push(`Message ${messageId} does not exist`);
  }

  // 3. Scene recap SHOULD exist (warning)
  const sceneRecap = message?.scene_recap_memory;
  if (!sceneRecap) {
    warnings.push('No scene recap at this message');
  }

  // 4. Running recap SHOULD exist (warning)
  const runningRecap = chat_metadata.auto_recap_running_scene_recaps;
  if (!runningRecap || !runningRecap.current_version) {
    warnings.push('No running scene recap available');
  }

  // 5. Scene break SHOULD exist at this message (warning)
  const isSceneBreak = message?.scene_break;
  if (!isSceneBreak) {
    warnings.push('Message is not a scene break');
  }

  if (errors.length > 0) {
    throw new Error(`Checkpoint validation failed:\n${errors.join('\n')}`);
  }

  return {
    valid: true,
    warnings,
    messageId,
    message
  };
}

// ============================================================================
// LOREBOOK CLONING (V2: Copy ALL Entries)
// ============================================================================

/**
 * Clone lorebook with ALL entries (no filtering)
 * V2 Requirement: Complete point-in-time snapshot
 */
async function cloneLorebook(sourceLorebookName, checkpointName) {
  debug(SUBSYSTEM.CORE, `Cloning lorebook: ${sourceLorebookName}`);

  // 1. Load source lorebook
  const sourceData = await loadWorldInfo(sourceLorebookName);
  if (!sourceData) {
    throw new Error(`Source lorebook "${sourceLorebookName}" not found`);
  }

  // 2. Generate clone name
  const timestamp = Date.now();
  const cloneName = `${sourceLorebookName}_checkpoint_${checkpointName}_${timestamp}`;

  // 3. Create new empty lorebook
  const created = await createNewWorldInfo(cloneName);
  if (!created) {
    throw new Error(`Failed to create cloned lorebook "${cloneName}"`);
  }

  // 4. Copy ALL entries with ORIGINAL UIDs (V2: NO FILTERING, PRESERVE UIDs)
  const cloneData = { entries: {} };
  let copiedCount = 0;

  for (const [uid, entry] of Object.entries(sourceData.entries || {})) {
    // V2: Copy EVERYTHING - no filtering
    // CRITICAL: Preserve original UID (UIDs are lorebook-unique, not globally unique)
    const clonedEntry = JSON.parse(JSON.stringify(entry));

    // Keep original UID - this ensures registry entries remain valid
    cloneData.entries[uid] = clonedEntry;
    copiedCount++;
  }

  // 4b. Verify registry integrity (code-based, NOT LLM)
  await verifyRegistryIntegrity(cloneName);

  // 5. Copy lorebook-level settings
  if (sourceData.name) cloneData.name = cloneName;
  if (sourceData.extensions) {
    cloneData.extensions = JSON.parse(JSON.stringify(sourceData.extensions));
  }

  // 6. Save cloned lorebook
  await saveWorldInfo(cloneName, cloneData, true);

  log(`✓ Cloned "${sourceLorebookName}" → "${cloneName}"`);
  log(`  Copied: ${copiedCount} entries (ALL entries, no filtering)`);

  return {
    cloneName,
    entriesCopied: copiedCount,
    sourceLorebookName
  };
}

/**
 * Verify registry entries reference valid UIDs (CODE-BASED verification)
 * This ensures registry integrity after lorebook duplication/cloning
 */
async function verifyRegistryIntegrity(lorebookName) {
  const data = await loadWorldInfo(lorebookName);
  if (!data || !data.entries) {
    return { valid: true, errors: [] };
  }

  const allEntries = Object.values(data.entries);
  const errors = [];

  // Get all valid entry UIDs (excluding registry entries themselves)
  const validUIDs = new Set();
  for (const entry of allEntries) {
    if (!entry || !entry.comment) continue;
    if (entry.comment.startsWith('_registry_')) continue;
    validUIDs.add(String(entry.uid));
  }

  // Check each registry entry
  for (const entry of allEntries) {
    if (!entry || !entry.comment) continue;
    if (!entry.comment.startsWith('_registry_')) continue;

    const registryType = entry.comment.replace('_registry_', '');

    try {
      const registryData = JSON.parse(entry.content || '{}');
      const items = registryData.items || [];

      for (const item of items) {
        const itemUID = String(item.id || item.uid);
        if (!validUIDs.has(itemUID)) {
          errors.push({
            registryType,
            invalidUID: itemUID,
            itemName: item.name || item.comment || 'Unknown'
          });
        }
      }
    } catch (err) {
      errors.push({
        registryType,
        error: `Failed to parse registry: ${err.message}`
      });
    }
  }

  if (errors.length > 0) {
    error(SUBSYSTEM.CORE, `Registry integrity check failed for ${lorebookName}:`, errors);
    return { valid: false, errors };
  }

  debug(SUBSYSTEM.CORE, `✓ Registry integrity verified for ${lorebookName}`);
  return { valid: true, errors: [] };
}

// ============================================================================
// STATE CAPTURE
// ============================================================================

/**
 * Capture complete checkpoint state
 * V2: Includes running recap versions, combined recap, etc.
 */
function captureCheckpointState(messageId, clonedLorebookName, validationResult) {
  const message = validationResult.message;
  const runningRecap = chat_metadata.auto_recap_running_scene_recaps;
  const combinedRecap = chat_metadata.auto_recap?.combined_recap;

  const state = {
    // Metadata
    version: 2,  // V2 checkpoint format
    timestamp: Date.now(),
    message_id: messageId,
    extension_version: '1.0.0',  // TODO: Get from package.json or constants
    chat_id: getCurrentChatId(),

    // Requirements proof
    queue_was_empty: true,  // Validated before we got here
    has_scene_break: !!message.scene_break,
    has_scene_recap: !!message.scene_recap_memory,
    has_running_recap: !!(runningRecap && runningRecap.current_version),

    // Lorebook
    cloned_lorebook_name: clonedLorebookName,
    original_lorebook_name: chat_metadata.world_info,

    // Running recap (for validation)
    running_recap_version: runningRecap?.current_version || null,
    running_recap_scene_count: runningRecap?.versions?.length || 0,
    running_recap_versions: JSON.parse(JSON.stringify(runningRecap?.versions || [])),

    // Combined recap (for validation)
    combined_recap_content: combinedRecap?.content || '',
    combined_recap_message_count: combinedRecap?.message_count || 0,
    combined_recap_timestamp: combinedRecap?.timestamp || null,

    // Scene information
    scene_break_name: message.scene_break?.name || null,
    scene_recap: message.scene_recap_memory || null,

    // Validation warnings
    warnings: validationResult.warnings || []
  };

  debug(SUBSYSTEM.CORE, 'Captured checkpoint state:', state);
  return state;
}

// ============================================================================
// CHECKPOINT CREATION
// ============================================================================

/**
 * Create checkpoint at specified message
 * V2: Complete point-in-time snapshot with ALL lorebook entries
 */
export async function createCheckpoint(messageId, checkpointName) {
  debug(SUBSYSTEM.CORE, `Creating checkpoint: ${checkpointName} at message ${messageId}`);

  try {
    // 1. Validate requirements (BLOCKING if fails)
    const validationResult = await validateCheckpointRequirements(messageId);

    // Show warnings to user if any
    if (validationResult.warnings.length > 0) {
      toastr.warning(
        validationResult.warnings.join('\n'),
        'Checkpoint Warnings',
        { timeOut: 5000 }
      );
    }

    // 2. Clone lorebook (copy ALL entries)
    const currentLorebook = chat_metadata.world_info;
    if (!currentLorebook) {
      throw new Error('No lorebook attached to current chat');
    }

    const { cloneName, entriesCopied } = await cloneLorebook(
      currentLorebook,
      checkpointName
    );

    // 3. Capture complete state
    const checkpointState = captureCheckpointState(
      messageId,
      cloneName,
      validationResult
    );

    // 4. Store state in chat_metadata (will be saved with checkpoint)
    chat_metadata.auto_recap_checkpoint_state = checkpointState;

    // 5. Create checkpoint via SillyTavern
    // Note: createNewBookmark saves chat_metadata automatically
    const result = await createNewBookmark(messageId, {
      forceName: checkpointName
    });

    if (!result) {
      throw new Error('createNewBookmark returned false');
    }

    // 6. Update checkpoint chat's lorebook reference
    // (The checkpoint chat file was just created by createNewBookmark)
    // We need to update its world_info to point to the cloned lorebook
    // TODO: This might require loading the checkpoint chat and updating it
    // For now, assume it inherits current chat_metadata which we just updated

    // 7. Success notification
    toastr.success(
      `Checkpoint created: ${checkpointName}\n` +
      `Lorebook: ${cloneName}\n` +
      `Entries copied: ${entriesCopied}\n` +
      `Running Recap v${checkpointState.running_recap_version} (${checkpointState.running_recap_scene_count} versions)\n` +
      `Combined Recap: ${checkpointState.combined_recap_message_count} messages`,
      'Checkpoint Created',
      { timeOut: 5000 }
    );

    log(`✓ Checkpoint created successfully: ${checkpointName}`);
    log(`  Lorebook: ${cloneName}`);
    log(`  Entries: ${entriesCopied}`);
    log(`  Running Recap: v${checkpointState.running_recap_version}`);

    return {
      success: true,
      checkpointName,
      clonedLorebookName: cloneName,
      state: checkpointState
    };

  } catch (error) {
    console.error('[Auto-Recap] Checkpoint creation failed:', error);
    toastr.error(
      error.message || 'Unknown error',
      'Checkpoint Failed',
      { timeOut: 5000 }
    );
    throw error;
  }
}

// ============================================================================
// STATE RESTORATION & VALIDATION
// ============================================================================

/**
 * Validate checkpoint state after restoration
 * V2: Validates running recap versions, combined recap, etc.
 */
export async function restoreCheckpointState(checkpointState) {
  debug(SUBSYSTEM.CORE, 'Restoring checkpoint state:', checkpointState);

  const errors = [];
  const warnings = [];

  // 1. Verify lorebook
  const currentLorebook = chat_metadata.world_info;
  if (currentLorebook !== checkpointState.cloned_lorebook_name) {
    warnings.push(
      `Lorebook mismatch:\n` +
      `  Expected: ${checkpointState.cloned_lorebook_name}\n` +
      `  Current: ${currentLorebook}`
    );
  } else {
    log(`✓ Using cloned lorebook: ${currentLorebook}`);
  }

  // 2. Validate running recap version
  const runningRecap = chat_metadata.auto_recap_running_scene_recaps;

  if (runningRecap && checkpointState.running_recap_version !== null) {
    const expectedVersion = checkpointState.running_recap_version;
    const actualVersion = runningRecap.current_version;

    if (expectedVersion !== actualVersion) {
      errors.push(
        `Running recap version mismatch:\n` +
        `  Expected: v${expectedVersion}\n` +
        `  Actual: v${actualVersion}`
      );
    } else {
      log(`✓ Running recap version correct: v${actualVersion}`);
    }

    // Verify version exists in versions array
    const versionExists = runningRecap.versions.some(v => v.version === expectedVersion);
    if (!versionExists) {
      errors.push(
        `Running recap version ${expectedVersion} not found in versions array.\n` +
        `Available versions: ${runningRecap.versions.map(v => v.version).join(', ')}`
      );
    } else {
      log(`✓ Running recap version ${expectedVersion} exists in versions array`);
    }
  }

  // 3. Validate combined recap
  const combinedRecap = chat_metadata.auto_recap?.combined_recap;

  if (combinedRecap && checkpointState.combined_recap_message_count > 0) {
    if (combinedRecap.message_count !== checkpointState.combined_recap_message_count) {
      warnings.push(
        `Combined recap message count mismatch:\n` +
        `  Expected: ${checkpointState.combined_recap_message_count}\n` +
        `  Actual: ${combinedRecap.message_count}`
      );
    } else {
      log(`✓ Combined recap message count correct: ${combinedRecap.message_count}`);
    }
  }

  // 4. Show notification
  const sceneName = checkpointState.scene_break_name || 'Unnamed Scene';
  const createdDate = new Date(checkpointState.timestamp).toLocaleString();

  if (errors.length > 0) {
    toastr.error(
      `Checkpoint state validation errors:\n${errors.join('\n')}`,
      'Checkpoint Validation Failed',
      { timeOut: 10000 }
    );
  }

  if (warnings.length > 0) {
    toastr.warning(
      `Checkpoint warnings:\n${warnings.join('\n')}`,
      'Checkpoint Warnings',
      { timeOut: 7000 }
    );
  }

  if (errors.length === 0) {
    toastr.info(
      `Checkpoint: ${sceneName}\n` +
      `Running Recap: v${checkpointState.running_recap_version} (${checkpointState.running_recap_scene_count} versions)\n` +
      `Combined Recap: ${checkpointState.combined_recap_message_count} messages\n` +
      `Created: ${createdDate}`,
      'Checkpoint Loaded',
      { timeOut: 5000 }
    );
  }

  log(`Checkpoint state restoration complete`);
  log(`  Errors: ${errors.length}`);
  log(`  Warnings: ${warnings.length}`);

  return {
    success: errors.length === 0,
    errors,
    warnings
  };
}
```

**Key Functions:**
1. `validateCheckpointRequirements()` - Check queue empty, message exists, etc.
2. `cloneLorebook()` - Copy ALL entries (V2: no filtering)
3. `captureCheckpointState()` - Record all state metadata
4. `createCheckpoint()` - Main entry point for checkpoint creation
5. `restoreCheckpointState()` - Validate state after CHAT_CHANGED

---

### 5. UI Changes (Multiple Files)

#### A. Add "Create Checkpoint" Button

**Option 1: Message Menu Button**

**File:** `buttonBindings.js`
**Location:** Add to message button menu
**Code:**
```javascript
// Add checkpoint button to message menu
const checkpointButton = $(
  '<div class="mes_button"><i class="fa-solid fa-bookmark"></i> Create Checkpoint</div>'
);

checkpointButton.on('click', async function() {
  const messageId = $(this).closest('.mes').attr('mesid');

  // Prompt for checkpoint name
  const checkpointName = await callPopup('Enter checkpoint name:', 'input');
  if (!checkpointName) return;

  try {
    const { createCheckpoint } = await import('./checkpointManager.js');
    await createCheckpoint(parseInt(messageId), checkpointName);
  } catch (error) {
    console.error('Checkpoint creation error:', error);
  }
});
```

**Option 2: Settings UI Button**

**File:** `settingsUI.js`
**Location:** Add to settings panel
**Code:**
```javascript
$('#auto_recap_create_checkpoint').on('click', async function() {
  const currentMessage = context.chat.length - 1;

  const checkpointName = await callPopup(
    'Enter checkpoint name:\n\n' +
    'Requirements:\n' +
    '- Queue must be empty\n' +
    '- Preferably at a scene break',
    'input'
  );

  if (!checkpointName) return;

  try {
    const { createCheckpoint } = await import('./checkpointManager.js');
    await createCheckpoint(currentMessage, checkpointName);
  } catch (error) {
    // Error already shown by createCheckpoint
  }
});
```

#### B. Queue Blocking UI Enhancement

**File:** `operationQueueUI.js`
**Enhancement:** Show "Cannot create checkpoint" message when queue active

**Add:**
```javascript
function updateQueueBlockingUI() {
  const queueActive = !isQueueEmpty();

  if (queueActive) {
    $('#auto_recap_checkpoint_status')
      .text('⏳ Cannot create checkpoint - queue active')
      .css('color', '#ff9800');
  } else {
    $('#auto_recap_checkpoint_status')
      .text('✓ Ready to create checkpoint')
      .css('color', '#4caf50');
  }
}
```

---

## Testing Changes

### 6. New Test Files

#### A. Checkpoint Creation Test

**File:** `tests/features/checkpoint-creation-v2.spec.js` (NEW)
**Purpose:** Test V2 checkpoint creation requirements

**Tests:**
1. Queue blocking (error if queue not empty)
2. All entries cloned (verify count matches)
3. Running recap captured (verify version in metadata)
4. Combined recap captured (verify content in metadata)
5. Lorebook isolation (verify different names)

#### B. Checkpoint Restoration Test

**File:** `tests/features/checkpoint-restoration-v2.spec.js` (NEW)
**Purpose:** Test V2 checkpoint restoration validation

**Tests:**
1. Running recap version validation (matches expected)
2. Combined recap validation (matches expected)
3. Lorebook validation (correct lorebook loaded)
4. Notification display (success/error messages)

#### C. Branch Divergence Test

**File:** `tests/features/checkpoint-branch-divergence.spec.js` (NEW)
**Purpose:** Test independent branch progression

**Tests:**
1. Create checkpoint at v5
2. Main progresses to v10
3. Checkpoint branch progresses to v8
4. Verify isolation (no contamination)
5. Switch between branches (verify versions correct)

---

## Import/API Changes

### 7. Required SillyTavern APIs

These SillyTavern functions must be imported/used:

**From `world-info.js`:**
```javascript
loadWorldInfo(name)          // Load lorebook data
saveWorldInfo(name, data)    // Save lorebook data
createNewWorldInfo(name)     // Create new lorebook
```

**From `bookmarks.js`:**
```javascript
createNewBookmark(mesId, options)  // Create checkpoint
```

**From `script.js`:**
```javascript
event_types.CHAT_CHANGED     // Event for chat loads
context.chat                 // Message array
chat_metadata                // Chat metadata global
getCurrentChatId()           // Get current chat ID
```

**From `power-user.js` (via SillyTavern globals):**
```javascript
toastr.success()             // Success notifications
toastr.error()               // Error notifications
toastr.warning()             // Warning notifications
toastr.info()                // Info notifications
callPopup()                  // User input dialog
```

---

## Configuration Changes

### 8. Settings Schema

**File:** Extension manifest or settings definition
**Add checkpoint settings:**

```javascript
{
  checkpoint_auto_name: true,           // Auto-generate checkpoint names
  checkpoint_name_template: 'Scene {scene_number} - {scene_name}',
  checkpoint_require_scene_break: false, // Only allow at scene breaks
  checkpoint_show_warnings: true,       // Show warnings for missing recaps
}
```

---

## CRITICAL UPDATE: Lorebook Management Requirements

**MAJOR OVERSIGHT DISCOVERED:**

SillyTavern does NOT automatically load lorebooks when chats switch. We MUST explicitly call `loadWorldInfo()` on every CHAT_CHANGED event.

**See `CHECKPOINT_LOREBOOK_MANAGEMENT.md` for complete specification.**

### Additional Requirements:

1. **Explicit lorebook switching** - Call `loadWorldInfo()` when checkpoint loads
2. **Lorebook existence validation** - Check file exists, offer repair
3. **Checkpoint cleanup** - Delete cloned lorebook when checkpoint deleted
4. **Mapping tracking** - Track checkpoint→lorebook mappings for cleanup
5. **Concurrent operation locking** - Prevent race conditions

**Updated time estimate:** 12-15 hours (was 7-9)

---

## Summary of All Changes

### Files to Modify (4 files)

1. ✅ `lorebookManager.js` - Fix pattern bugs (lines 362-365)
2. ✅ `eventHandlers.js` - Add CHAT_CHANGED handler with LOREBOOK SWITCHING (~50 lines, was ~20)
3. ✅ `index.js` - Export checkpoint functions (~5 lines)
4. ✅ `settingsUI.js` or `buttonBindings.js` - Add UI trigger (~20 lines)

### Files to Create (4-6 files)

1. ✅ `checkpointManager.js` - Core logic (~500-600 lines)
2. ✅ `tests/features/checkpoint-creation-v2.spec.js` - Creation tests (~200 lines)
3. ✅ `tests/features/checkpoint-restoration-v2.spec.js` - Restoration tests (~200 lines)
4. ✅ `tests/features/checkpoint-branch-divergence.spec.js` - Divergence tests (~250 lines)
5. Optional: `checkpointUI.js` - Dedicated UI helpers (~100 lines)
6. Optional: `checkpointSettings.js` - Settings management (~50 lines)

### Total Estimated Lines of Code

- Core implementation: ~600 lines
- Event handlers & wiring: ~50 lines
- UI: ~50-100 lines
- Tests: ~650 lines
- **Total: ~1,350-1,450 lines**

### Estimated Implementation Time

- Core logic (checkpointManager.js): 3-4 hours
- Event handlers & exports: 0.5 hours
- UI implementation: 1 hour
- Bug fixes (lorebookManager.js): 0.25 hours
- Testing setup & implementation: 2-3 hours
- **Total: 6.75-8.75 hours** (rounds to 7-9 hours)

---

## Implementation Order

### Phase 1: Foundation (1-2 hours)
1. Fix lorebookManager.js patterns
2. Create checkpointManager.js skeleton
3. Add exports to index.js

### Phase 2: Core Logic (2-3 hours)
1. Implement validateCheckpointRequirements()
2. Implement cloneLorebook() (V2: no filtering)
3. Implement captureCheckpointState()
4. Implement createCheckpoint()

### Phase 3: Restoration (1-2 hours)
1. Implement restoreCheckpointState()
2. Add CHAT_CHANGED handler to eventHandlers.js
3. Test restoration validation

### Phase 4: UI (1 hour)
1. Add checkpoint button to message menu or settings
2. Add queue blocking UI indicator
3. Test user flow

### Phase 5: Testing (2-3 hours)
1. Write checkpoint creation tests
2. Write restoration validation tests
3. Write branch divergence tests
4. Run full test suite

---

## Critical Implementation Notes

### Note 1: Lorebook Name Update After Checkpoint Creation

After calling `createNewBookmark()`, the checkpoint chat file is created. However, that checkpoint's `chat_metadata.world_info` needs to point to the CLONED lorebook, not the original.

**Problem:** `createNewBookmark()` copies current `chat_metadata` which has the ORIGINAL lorebook name.

**Solution Options:**
A. Update `chat_metadata.world_info` BEFORE calling `createNewBookmark()`
B. Load checkpoint chat file after creation and update its `world_info` field
C. Rely on user manually switching lorebooks (NOT ACCEPTABLE)

**Recommended:** Option A - Update chat_metadata before checkpoint creation:
```javascript
// Before creating checkpoint
const originalLorebook = chat_metadata.world_info;
chat_metadata.world_info = cloneName;  // Point to clone

// Create checkpoint (copies chat_metadata with clone name)
await createNewBookmark(messageId, { forceName: checkpointName });

// Restore original for main chat
chat_metadata.world_info = originalLorebook;
await saveChat();  // Save main chat with original lorebook
```

### Note 2: Race Conditions

Be careful of race conditions where:
1. User creates checkpoint
2. Queue operation starts before checkpoint creation completes
3. Chat switches during checkpoint creation

**Mitigation:**
- Use operation lock (similar to existing queue locks)
- Validate chat ID hasn't changed during operation
- Block UI during checkpoint creation

### Note 3: Version Field in chat_metadata

Add version field to detect V2 checkpoints:
```javascript
chat_metadata.auto_recap_checkpoint_state = {
  version: 2,  // V2 format
  // ... rest of state
};
```

This allows future migration from V1 to V3 if needed.

---

## Verification Checklist

Before considering implementation complete:

- [ ] Queue blocking works (error when queue not empty)
- [ ] All lorebook entries copied (count matches source)
- [ ] Running recap version captured in metadata
- [ ] Combined recap captured in metadata
- [ ] Checkpoint uses cloned lorebook (not original)
- [ ] Main chat uses original lorebook (not clone)
- [ ] Restoration validation runs on CHAT_CHANGED
- [ ] Version mismatches detected and reported
- [ ] Lorebook mismatches detected and reported
- [ ] Notifications show correct information
- [ ] Branch divergence works (independent versions)
- [ ] No contamination between branches
- [ ] Legacy checkpoints handled gracefully
- [ ] All tests pass

---

## Open Questions

1. **Lorebook cleanup:** Should we delete cloned lorebooks when checkpoint is deleted?
2. **Clone naming:** Should include chat name in clone name for clarity?
3. **UI location:** Message menu button vs settings panel button vs both?
4. **Auto-checkpoint:** Should we support auto-checkpoint on scene break?
5. **Checkpoint list UI:** Should we show list of available checkpoints?
6. **Branch visualization:** Should we show branch tree diagram?

These can be addressed during or after initial implementation.

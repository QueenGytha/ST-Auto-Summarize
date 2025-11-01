# Settings Access Bug Documentation

## Critical Bug: Incorrect Settings Access Pattern

### Summary
Multiple files in the ST-Auto-Summarize extension were accessing per-profile settings incorrectly by reading directly from `extension_settings.autoLorebooks.summary_processing` instead of using the profile-aware `get_settings()` function. This caused settings to be ignored or return empty/undefined values.

---

## Background: Profile-Based Settings System

### Settings Architecture

The extension has TWO types of settings:

#### 1. **GLOBAL SETTINGS** (stored in `extension_settings.autoLorebooks`)
These apply to ALL profiles and are accessed directly:

```javascript
// CORRECT for global settings
const nameTemplate = extension_settings?.autoLorebooks?.nameTemplate;
const debugMode = extension_settings?.autoLorebooks?.debug_mode;
const entityTypes = extension_settings?.autoLorebooks?.entity_types;
```

**Global settings include:**
- `enabledByDefault`
- `nameTemplate`
- `deleteOnChatDelete`
- `autoReorderAlphabetically`
- `debug_mode`
- `entity_types`
- `queue.enabled`
- `queue.use_lorebook`
- `queue.display_enabled`

#### 2. **PER-PROFILE SETTINGS** (stored in individual profiles)
These are unique to each profile and MUST be accessed via `get_settings()`:

```javascript
// CORRECT for per-profile settings
const mergePrompt = get_settings('auto_lorebooks_summary_merge_prompt');
const trackingEnabled = get_settings('auto_lorebooks_tracking_enabled');
```

**Per-profile settings include:**

**Tracking settings** (prefix: `auto_lorebooks_tracking_*`):
- `tracking_enabled`
- `tracking_intercept_send_button`
- `tracking_auto_create`
- `tracking_remove_from_message`
- `tracking_syntax_gm_notes`
- `tracking_syntax_character_stats`
- `tracking_merge_prefill`
- `tracking_merge_prompt_gm_notes`
- `tracking_merge_prompt_character_stats`
- `tracking_merge_connection_profile`
- `tracking_merge_completion_preset`

**Summary processing settings** (prefix: `auto_lorebooks_summary_*`):
- `summary_enabled`
- `summary_skip_duplicates`
- `summary_merge_prompt`
- `summary_merge_prefill`
- `summary_merge_connection_profile`
- `summary_merge_completion_preset`
- `summary_lorebook_entry_lookup_prompt`
- `summary_lorebook_entry_lookup_prefill`
- `summary_lorebook_entry_lookup_connection_profile`
- `summary_lorebook_entry_lookup_completion_preset`
- `summary_lorebook_entry_deduplicate_prompt`
- `summary_lorebook_entry_deduplicate_prefill`
- `summary_lorebook_entry_deduplicate_connection_profile`
- `summary_lorebook_entry_deduplicate_completion_preset`

---

## The Bug

### What Was Wrong

**INCORRECT PATTERN (causes bug):**
```javascript
// WRONG - This returns empty/undefined for per-profile settings!
const summarySettings = extension_settings?.autoLorebooks?.summary_processing || {};
const trackingSettings = extension_settings?.autoLorebooks?.tracking || {};
```

**Why this fails:**
1. During initialization (`settingsManager.js:93-98`), the system **deletes** `summary_processing` and `tracking` from the global namespace:
   ```javascript
   if (extension_settings.autoLorebooks.tracking) {
       delete extension_settings.autoLorebooks.tracking;
   }
   if (extension_settings.autoLorebooks.summary_processing) {
       delete extension_settings.autoLorebooks.summary_processing;
   }
   ```

2. These settings are migrated to individual profiles and must be accessed via `get_settings()`

3. Accessing the deleted path returns `undefined`, which falls back to `{}` (empty object)

4. Result: All profile-specific settings are ignored!

---

## Files That Were Fixed

### 1. `lorebookEntryMerger.js`

**Problem:** Direct access to `extension_settings.autoLorebooks.summary_processing`

**BEFORE (WRONG):**
```javascript
function getSummaryProcessingSetting(key, defaultValue = null) {
    try {
        const settings = extension_settings?.autoLorebooks?.summary_processing || {};
        return settings[key] ?? defaultValue;
    } catch (err) {
        error("Error getting summary processing setting", err);
        return defaultValue;
    }
}
```

**AFTER (CORRECT):**
```javascript
function getSummaryProcessingSetting(key, defaultValue = null) {
    try {
        // ALL summary processing settings are per-profile
        const settingKey = `auto_lorebooks_summary_${key}`;
        return get_settings(settingKey) ?? defaultValue;
    } catch (err) {
        error("Error getting summary processing setting", err);
        return defaultValue;
    }
}
```

**Additional fixes in this file:**
- Line 12: Changed `let getSetting` to `let get_settings`
- Line 34: Changed initialization from `getSetting = settingsManagerModule.getSetting` to `get_settings = settingsManagerModule.get_settings`
- Line 187: Changed `getSetting?.('queue')?.enabled` to `get_settings?.('queue')?.enabled`

---

### 2. `summaryToLorebookProcessor.js` (FIXED)

**Location:** Line 1245 in `buildProcessingContext()` function

**BEFORE (WRONG):**
```javascript
const summarySettings = extension_settings?.autoLorebooks?.summary_processing || {};
```

**AFTER (CORRECT):**
```javascript
// Build summary settings object using profile-aware getter
const summarySettings = {
    merge_connection_profile: getSummaryProcessingSetting('merge_connection_profile', ''),
    merge_completion_preset: getSummaryProcessingSetting('merge_completion_preset', ''),
    merge_prefill: getSummaryProcessingSetting('merge_prefill', ''),
    merge_prompt: getSummaryProcessingSetting('merge_prompt', ''),
    lorebook_entry_lookup_connection_profile: getSummaryProcessingSetting('lorebook_entry_lookup_connection_profile', ''),
    lorebook_entry_lookup_completion_preset: getSummaryProcessingSetting('lorebook_entry_lookup_completion_preset', ''),
    lorebook_entry_lookup_prefill: getSummaryProcessingSetting('lorebook_entry_lookup_prefill', ''),
    lorebook_entry_lookup_prompt: getSummaryProcessingSetting('lorebook_entry_lookup_prompt', ''),
    lorebook_entry_deduplicate_connection_profile: getSummaryProcessingSetting('lorebook_entry_deduplicate_connection_profile', ''),
    lorebook_entry_deduplicate_completion_preset: getSummaryProcessingSetting('lorebook_entry_deduplicate_completion_preset', ''),
    lorebook_entry_deduplicate_prefill: getSummaryProcessingSetting('lorebook_entry_deduplicate_prefill', ''),
    lorebook_entry_deduplicate_prompt: getSummaryProcessingSetting('lorebook_entry_deduplicate_prompt', ''),
    skip_duplicates: getSummaryProcessingSetting('skip_duplicates', true),
    enabled: getSummaryProcessingSetting('enabled', false),
};
```

**Note:** The main code path (`loadSummaryContext()` at lines 1016-1031) already used the correct pattern. The `buildProcessingContext()` function is now also fixed.

---

### 3. `runningSceneSummary.js` (FIXED)

**Location:** Line 611 in `combine_scene_with_running_summary()` function

**Problem:** Incorrect setting key name

**BEFORE (WRONG):**
```javascript
const autoLorebooksEnabled = get_settings('auto_lorebooks_summary_processing_enabled');
```

**AFTER (CORRECT):**
```javascript
const autoLorebooksEnabled = get_settings('auto_lorebooks_summary_enabled');
```

**Explanation:** The setting key name was `auto_lorebooks_summary_processing_enabled`, but the actual setting defined in `defaultSettings.js:144` is `auto_lorebooks_summary_enabled`. This caused the setting to always return `undefined`, preventing the conditional check from working correctly.

---

## Correct Patterns to Follow

### For Per-Profile Settings

**Pattern 1: Direct access via get_settings()**
```javascript
// Import get_settings from settingsManager
let get_settings;

// In init function
get_settings = settingsManagerModule.get_settings;

// Usage
const mergePrompt = get_settings('auto_lorebooks_summary_merge_prompt');
const trackingEnabled = get_settings('auto_lorebooks_tracking_enabled');
```

**Pattern 2: Helper function (preferred)**
```javascript
function getSummaryProcessingSetting(key, defaultValue = null) {
    try {
        const settingKey = `auto_lorebooks_summary_${key}`;
        return get_settings(settingKey) ?? defaultValue;
    } catch (err) {
        error("Error getting summary processing setting", err);
        return defaultValue;
    }
}

// Usage
const mergePrompt = getSummaryProcessingSetting('merge_prompt');
```

### For Global Settings

**Direct access is fine:**
```javascript
const debugMode = extension_settings?.autoLorebooks?.debug_mode;
const entityTypes = extension_settings?.autoLorebooks?.entity_types;
```

---

## How to Identify These Bugs

### Search Patterns to Find Violations

1. **Direct access to deleted namespaces:**
   ```javascript
   extension_settings?.autoLorebooks?.summary_processing
   extension_settings?.autoLorebooks?.tracking
   extension_settings.autoLorebooks.summary_processing
   extension_settings.autoLorebooks.tracking
   ```

2. **Look for:**
   - Any file that accesses these paths without using `get_settings()`
   - Functions that don't have `get_settings` imported but try to read per-profile settings

### Correct Examples to Reference

**Files doing it correctly:**
- `summaryToLorebookProcessor.js` - `loadSummaryContext()` function (lines 1016-1031)
- `summaryToLorebookProcessor.js` - `getSummaryProcessingSetting()` helper (lines 83-92)
- `trackingEntries.js` - `getTrackingSetting()` helper (lines 111-120)
- `operationQueue.js` - Uses `get_settings('operation_queue_use_lorebook')` correctly
- `lorebookEntryMerger.js` - Fixed to use correct pattern

---

## Impact of This Bug

### Symptoms When Bug is Present

1. **Settings UI shows correct values, but they're ignored at runtime**
   - User updates merge prompt in settings
   - Code still uses old hardcoded default prompt
   - Confusion: "I changed the setting but nothing changed!"

2. **Profile-specific settings don't work**
   - All profiles use the same (default/empty) settings
   - Profile switching has no effect on these settings

3. **Fallback to hardcoded defaults**
   - When `extension_settings.autoLorebooks.summary_processing` returns `undefined`
   - Code falls back to `|| {}` or hardcoded defaults
   - User customizations are lost

### Real Example: Merge Prompt Bug

**What happened:**
1. User updated `merge_prompt` in settings UI to include name resolution instructions
2. Settings UI correctly saved to profile: `auto_lorebooks_summary_merge_prompt`
3. `lorebookEntryMerger.js` tried to read from `extension_settings.autoLorebooks.summary_processing.merge_prompt`
4. That path was deleted during init → returned `undefined`
5. Code fell back to hardcoded old prompt via `getDefaultMergePrompt()`
6. New prompt with FORMAT 1/FORMAT 2 instructions was never used
7. AI always returned plain text, never JSON with `canonicalName`
8. Name resolution feature completely broken

---

## Testing Checklist

After fixing settings access issues:

- [ ] Create a new profile
- [ ] Change a per-profile setting (e.g., merge_prompt)
- [ ] Verify the change takes effect at runtime
- [ ] Switch to a different profile
- [ ] Verify different profile uses its own settings
- [ ] Check console for any "undefined" errors related to settings
- [ ] Verify global settings still work correctly

---

## Related Files and Functions

### Settings Manager
- `settingsManager.js:93-98` - Deletes old per-profile settings from global namespace
- `settingsManager.js:get_settings()` - Function to read profile-aware settings
- `settingsManager.js:set_settings()` - Function to write profile-aware settings

### Default Settings
- `defaultSettings.js` - Contains all default values
  - Settings with `auto_lorebooks_summary_*` prefix are per-profile
  - Settings with `auto_lorebooks_tracking_*` prefix are per-profile
  - Other `auto_lorebooks_*` settings are global

### Helper Functions
- `summaryToLorebookProcessor.js:getSummaryProcessingSetting()` - Helper for summary settings
- `trackingEntries.js:getTrackingSetting()` - Helper for tracking settings

---

## Future Prevention

### Code Review Checklist

When reviewing code that accesses settings:

1. **Identify the setting type:**
   - Is it `tracking_*` or `summary_*`? → Per-profile (use `get_settings()`)
   - Is it something else? → Check `defaultSettings.js` to confirm if global or per-profile

2. **Check the access pattern:**
   - Per-profile: MUST use `get_settings('auto_lorebooks_[type]_[key]')`
   - Global: Can use `extension_settings.autoLorebooks.[key]`

3. **Verify initialization:**
   - Is `get_settings` imported/initialized if needed?
   - Does the function name match? (`get_settings` not `getSetting`)

4. **Test with profiles:**
   - Create multiple profiles with different settings
   - Verify each profile respects its own settings

---

## Summary

**The Bug:** Reading per-profile settings directly from `extension_settings.autoLorebooks.summary_processing` or `extension_settings.autoLorebooks.tracking` returns `undefined` because these paths are deleted during initialization.

**The Fix:** Always use `get_settings('auto_lorebooks_[type]_[key]')` for per-profile settings.

**Files Fixed:**
- ✅ `lorebookEntryMerger.js` - Fixed `getSummaryProcessingSetting()` and all `getSetting` references
- ✅ `summaryToLorebookProcessor.js` - Fixed `buildProcessingContext()` to use profile-aware settings (Line 1245)
- ✅ `runningSceneSummary.js` - Fixed incorrect setting key name from `auto_lorebooks_summary_processing_enabled` to `auto_lorebooks_summary_enabled` (Line 611)
- ✅ `tests/virtual/summaryToLorebookProcessor.js` - Fixed to match main file
- ✅ `tests/virtual/runningSceneSummary.js` - Fixed to match main file

**All Known Issues Resolved:** ✅

**Prevention:** Always check if a setting is per-profile (has `tracking_*` or `summary_*` prefix) and use the appropriate access method.

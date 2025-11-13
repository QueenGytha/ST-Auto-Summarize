# Settings and Profile System - End-to-End Analysis

**Document Version:** 1.0
**Date:** 2025-11-12
**Status:** Pre-Release Assessment
**Purpose:** Comprehensive analysis of settings architecture for release readiness

---

## Executive Summary

The ST-Auto-Summarize extension has a **well-designed profile system** with strong foundations for character/chat-specific customization. However, it has **critical gaps** that must be addressed before public release to ensure:

1. User settings survive extension updates
2. Schema changes don't break existing profiles
3. Users receive improvements while preserving customizations
4. Imported profiles don't crash the extension

### Key Findings

| Category | Status | Details |
|----------|--------|---------|
| **Profile System** | ✅ Strong | 117+ settings per profile, character/chat-specific |
| **Settings Preservation** | ✅ Works | User customizations preserved during updates |
| **Connection Profile Migration** | ✅ Exists | Template for future migrations |
| **Settings Versioning** | ❌ Missing | No version tracking, can't evolve schema safely |
| **Prompt Versioning** | ❌ Missing | Users stuck on old prompts indefinitely |
| **Multi-Profile Migration** | ❌ Broken | Only active profile migrated, others break |
| **Import Validation** | ❌ Missing | Old profiles can crash extension |
| **Update Notifications** | ❌ Missing | Users unaware of improvements |

### Risk Assessment

**For Immediate Release:**
- **MEDIUM RISK** - Extension works but lacks schema evolution capability
- Users won't receive prompt improvements
- Future updates may break without versioning

**For Long-Term Maintenance:**
- **HIGH RISK** - Cannot safely evolve settings schema
- Cannot deprecate old settings
- Cannot track migration state

---

## Table of Contents

1. [Settings Architecture](#1-settings-architecture)
2. [Profile System](#2-profile-system)
3. [Settings Initialization](#3-settings-initialization)
4. [Update Behavior](#4-update-behavior)
5. [Prompt Management](#5-prompt-management)
6. [Migration System](#6-migration-system)
7. [Reference Extension Patterns](#7-reference-extension-patterns)
8. [Critical Issues](#8-critical-issues)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Recommendations](#10-recommendations)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 1. Settings Architecture

### 1.1 Storage Layers

The extension uses a **four-tier storage hierarchy** with clear precedence rules:

```
┌─────────────────────────────────────────────────────────┐
│ TIER 1: EXTENSION SETTINGS (Global)                    │
│ Location: extension_settings.auto_recap                │
│ Scope: Shared across all characters/chats              │
│ Persistence: SillyTavern settings.json                 │
├─────────────────────────────────────────────────────────┤
│ Content:                                                │
│ ├─ profiles: {}           # All profile definitions    │
│ ├─ character_profiles: {} # Character → profile map    │
│ ├─ chat_profiles: {}      # Chat → profile map         │
│ ├─ profile: "Default"     # Currently active profile   │
│ ├─ chats_enabled: {}      # Per-chat toggle states     │
│ ├─ global_toggle_state    # Global on/off switch       │
│ └─ [other global state]                                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ TIER 2: PROFILE DATA (Per-Profile)                     │
│ Location: extension_settings.auto_recap.profiles[name] │
│ Scope: Named configuration sets                        │
│ Persistence: SillyTavern settings.json                 │
├─────────────────────────────────────────────────────────┤
│ Structure:                                              │
│ profiles: {                                             │
│   "Default": {                                          │
│     scene_recap_prompt: "...",          # 117+ settings│
│     scene_recap_connection_profile: "", # per profile  │
│     auto_scene_break_enabled: true,                    │
│     injection_position: "after_main",                  │
│     // ... all feature settings                        │
│   },                                                    │
│   "Claude-Profile": { ... },                           │
│   "GPT4-Profile": { ... }                              │
│ }                                                       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ TIER 3: CHAT METADATA (Per-Chat)                       │
│ Location: chat_metadata.auto_recap                     │
│ Scope: Individual chat instance                        │
│ Persistence: Chat JSON file (chats/*.jsonl)            │
├─────────────────────────────────────────────────────────┤
│ Content:                                                │
│ ├─ enabled: boolean       # Chat-specific enable state │
│ ├─ settings_hash: string  # Settings fingerprint       │
│ ├─ running_scene_recap: { # Running scene recap data   │
│ │    versions: [],        # Versioned narratives       │
│ │    current_index: 0     # Active version             │
│ │  }                                                    │
│ └─ combined_recap: {}     # Combined recap data        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ TIER 4: MESSAGE DATA (Per-Message)                     │
│ Location: message.extra.auto_recap                     │
│ Scope: Individual message                              │
│ Persistence: Chat JSON file (chats/*.jsonl)            │
├─────────────────────────────────────────────────────────┤
│ Content:                                                │
│ ├─ memory: string              # Recap text            │
│ ├─ scene_recap_memory: string  # Scene recap text      │
│ ├─ scene_recap_versions: []    # All recap versions    │
│ ├─ scene_recap_current_index   # Active version index  │
│ ├─ timestamp: number            # Generation time      │
│ └─ [other metadata]                                    │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Settings Cascade Resolution

**Profile Selection Priority:**
1. **Chat-specific profile** (`chat_profiles[chatId]`) - Highest priority
2. **Character-specific profile** (`character_profiles[characterId]`)
3. **Currently active profile** (`profile`)
4. **"Default" profile** - Fallback

**Implementation:**
```javascript
// From profileManager.js:297-301
function auto_load_profile() {
  const profile = get_chat_profile() || get_character_profile();
  load_profile(profile || 'Default');
  refresh_settings();
}
```

**Trigger Points:**
- `CHAT_CHANGED` event (automatic)
- Manual profile switch via UI
- Extension initialization

### 1.3 Profile-Specific vs Global Settings

#### Profile-Specific Settings (117+ per profile)

**All settings except global mappings are profile-specific:**

**Prompts (17 settings):**
- `scene_recap_prompt` - Scene recap generation
- `scene_recap_prefill` - Scene recap prefill
- `scene_recap_error_detection_prompt` - Validation prompt
- `scene_recap_error_detection_prefill` - Validation prefill
- `auto_scene_break_prompt` - Scene break detection
- `auto_scene_break_prefill` - Scene break prefill
- `running_scene_recap_prompt` - Running scene recap
- `running_scene_recap_prefill` - Running scene recap prefill
- `running_scene_recap_template` - Running scene template
- `auto_lorebooks_recap_merge_prompt` - Recap merge prompt
- `auto_lorebooks_recap_merge_prefill` - Recap merge prefill
- `auto_lorebooks_recap_lorebook_entry_lookup_prompt` - Entry lookup
- `auto_lorebooks_recap_lorebook_entry_lookup_prefill` - Entry lookup prefill
- `auto_lorebooks_recap_lorebook_entry_deduplicate_prompt` - Deduplication
- `auto_lorebooks_recap_lorebook_entry_deduplicate_prefill` - Deduplication prefill
- `auto_lorebooks_bulk_populate_prompt` - Bulk populate prompt
- `auto_lorebooks_bulk_populate_prefill` - Bulk populate prefill

**Connection Profiles (6 settings):**
- `scene_recap_connection_profile` - Scene recap API connection
- `scene_recap_error_detection_connection_profile` - Validation connection
- `auto_scene_break_connection_profile` - Scene break detection connection
- `running_scene_recap_connection_profile` - Running scene recap connection
- `auto_lorebooks_recap_connection_profile` - Auto-Lorebooks connection
- `auto_lorebooks_bulk_populate_connection_profile` - Bulk populate connection

**Feature Toggles (20+ settings):**
- `auto_recap_enabled` - Master toggle
- `auto_scene_break_enabled` - Auto scene break detection
- `auto_scene_break_on_load` - Detect on chat load
- `running_scene_recap_enabled` - Running scene recap feature
- `auto_lorebooks_enabled` - Auto-Lorebooks feature
- `auto_lorebooks_recap_tracking_enabled` - Recap tracking
- `auto_lorebooks_recap_processing_enabled` - Recap processing
- `include_presets` - Include preset prompts
- `ignore_group_members` - Disable for group chat members
- ... (more toggles)

**Injection Settings (10+ settings):**
- `injection_position` - Where to inject memory
- `injection_depth` - How deep to inject
- `injection_role` - Role for injection
- `injection_scan_depth` - Scan depth
- `short_term_injection_position` - Short-term position
- `long_term_injection_position` - Long-term position
- ... (more injection settings)

**Operational Settings (30+ settings):**
- `recap_queue_blocking` - Block chat during queue
- `auto_scene_break_minimum_scene_length` - Scene length threshold
- `scene_break_offset_messages` - Scene break offset
- `running_scene_recap_max_versions` - Version limit
- `auto_lorebooks_recap_merge_max_recaps` - Merge limit
- ... (more operational settings)

**Completion Presets (6 settings):**
- `scene_recap_completion_preset_name` - Scene recap preset
- `scene_recap_error_detection_completion_preset_name` - Validation preset
- `auto_scene_break_completion_preset_name` - Scene break preset
- `running_scene_recap_completion_preset_name` - Running scene preset
- `auto_lorebooks_recap_completion_preset_name` - Auto-Lorebooks preset
- `auto_lorebooks_bulk_populate_completion_preset_name` - Bulk populate preset

#### Global Settings (Shared across all profiles)

**Profile Management:**
- `profiles` - Profile definitions
- `character_profiles` - Character → profile mapping
- `chat_profiles` - Chat → profile mapping
- `profile` - Currently active profile name
- `notify_on_profile_switch` - UI notification preference

**Global State:**
- `chats_enabled` - Per-chat enabled state
- `global_toggle_state` - Global toggle state
- `disabled_group_characters` - Group chat character filter
- `memory_edit_interface_settings` - UI state

**Auto-Lorebooks Global Settings** (separate namespace):
- `extension_settings.autoLorebooks.nameTemplate` - Lorebook naming
- `extension_settings.autoLorebooks.deleteOnChatDelete` - Cleanup behavior
- `extension_settings.autoLorebooks.autoReorderAlphabetically` - Sorting
- `extension_settings.autoLorebooks.entity_types` - Entity type definitions

### 1.4 Settings File Locations

**Extension Settings:**
```
SillyTavern/data/default-user/settings.json
└─ extension_settings
   ├─ auto_recap: { ... }      # Main extension settings
   └─ autoLorebooks: { ... }   # Auto-Lorebooks settings
```

**Chat Metadata:**
```
SillyTavern/data/default-user/chats/{character}/
└─ {chat_id}.jsonl
   └─ Each message line contains:
      ├─ mes: "message text"
      ├─ extra: { auto_recap: { ... } }  # Message-level data
      └─ ...
   └─ Final metadata line contains:
      └─ chat_metadata: { auto_recap: { ... } }  # Chat-level data
```

**Profile Export Format:**
```json
{
  "scene_recap_prompt": "...",
  "scene_recap_connection_profile": "",
  "auto_scene_break_enabled": true,
  "injection_position": "after_main",
  "_version": 1
}
```

---

## 2. Profile System

### 2.1 Profile Operations

#### Create New Profile

**User Action:** Click "New Profile" button in settings

**Code Flow:**
```javascript
// From profileManager.js:172-183
function new_profile() {
  const profiles = get_settings('profiles');

  // Generate unique name
  let profile = 'New Profile';
  let i = 1;
  while (profiles[profile]) {
    profile = `New Profile ${i}`;
    i++;
  }

  // Copy current settings to new profile
  save_profile(profile);

  // Switch to new profile
  load_profile(profile);
}
```

**Result:**
- New profile created with copy of current settings
- User switched to new profile
- Original profile unchanged

#### Save Profile

**User Action:** Modify settings, click "Save Profile"

**Code Flow:**
```javascript
// From profileManager.js:61-76
function save_profile(profile = null) {
  let targetProfile = profile || get_settings('profile');

  // Copy current active settings (excluding global settings)
  const profiles = get_settings('profiles');
  profiles[targetProfile] = copy_settings();  // 117+ settings copied
  set_settings('profiles', profiles);

  // Validate connection profiles
  check_preset_valid();
}
```

**What Gets Saved:**
- All 117+ profile-specific settings
- Current state of prompts, toggles, connection profiles
- Does NOT save: global settings, profile mappings

#### Load Profile

**User Action:** Select profile from dropdown, switch chat/character

**Code Flow:**
```javascript
// From profileManager.js:77-98
function load_profile(profile = null) {
  let targetProfile = profile || get_settings('profile');

  // Get profile settings
  const settings = copy_settings(targetProfile);

  // Merge into active settings (overwrites current)
  Object.assign(extension_settings[MODULE_NAME], settings);
  set_settings('profile', targetProfile);

  // Notify user
  if (get_settings("notify_on_profile_switch")) {
    toast(`Switched to profile "${targetProfile}"`, 'info');
  }

  // Update UI
  refresh_settings();
}
```

**What Happens:**
- All active settings replaced with profile settings
- Previous profile's in-memory state discarded (unless saved)
- UI refreshed to show new profile's settings

**⚠️ WARNING:** Unsaved changes to previous profile are LOST.

#### Delete Profile

**User Action:** Click "Delete Profile" button

**Code Flow:**
```javascript
// From profileManager.js:153-171
function delete_profile() {
  const profile = get_settings('profile');

  // Cannot delete Default profile
  if (profile === 'Default') {
    toast("Cannot delete the Default profile", "error");
    return;
  }

  // Remove profile
  const profiles = get_settings('profiles');
  delete profiles[profile];
  set_settings('profiles', profiles);

  // Clean up mappings
  remove_profile_from_all_mappings(profile);

  // Switch to Default
  load_profile('Default');
}
```

**What Gets Deleted:**
- Profile definition removed
- Character/chat mappings cleaned up
- User switched to "Default" profile

**⚠️ NO UNDO:** Deletion is permanent, no confirmation dialog.

### 2.2 Profile Auto-Loading

#### When Profiles Auto-Load

**Trigger Events:**
1. `CHAT_CHANGED` - User switches chat
2. Extension initialization - First load
3. Character change - New character selected

**Auto-Load Logic:**
```javascript
// From eventHandlers.js:62-68
async function handleChatChanged() {
  auto_load_profile();  // Load appropriate profile
  await maybeAutoProcessSceneBreaks();
  await maybeRefreshRunningSceneRecap();
}

// From profileManager.js:297-301
function auto_load_profile() {
  // Priority: chat > character > Default
  const profile = get_chat_profile() || get_character_profile();
  load_profile(profile || 'Default');
  refresh_settings();
}
```

**Resolution Order:**
```
1. Check: chat_profiles[chatId] exists?
   → YES: Load that profile
   → NO: Continue to step 2

2. Check: character_profiles[characterId] exists?
   → YES: Load that profile
   → NO: Continue to step 3

3. Load: "Default" profile
```

#### Setting Character-Specific Profile

**User Action:** Click "Set as Default for Character" button

**Code Flow:**
```javascript
// From profileManager.js:217-225
function set_profile_for_character() {
  const character = get_character_name();
  const profile = get_settings('profile');

  const character_profiles = get_settings('character_profiles');
  character_profiles[character] = profile;
  set_settings('character_profiles', character_profiles);

  toast(`Profile "${profile}" set as default for character "${character}"`, 'success');
}
```

**Persistence:**
- Stored in global settings (`extension_settings.auto_recap.character_profiles`)
- Persists across chat changes
- Applies to all chats with that character

#### Setting Chat-Specific Profile

**User Action:** Click "Set as Default for Chat" button

**Code Flow:**
```javascript
// From profileManager.js:226-234
function set_profile_for_chat() {
  const chatId = get_chat_id();
  const profile = get_settings('profile');

  const chat_profiles = get_settings('chat_profiles');
  chat_profiles[chatId] = profile;
  set_settings('chat_profiles', chat_profiles);

  toast(`Profile "${profile}" set as default for this chat`, 'success');
}
```

**Persistence:**
- Stored in global settings (`extension_settings.auto_recap.chat_profiles`)
- Highest priority (overrides character profile)
- Specific to individual chat instance

**Priority Example:**
```
Character: "Alice"
Chat ID: "alice-2023-11-12"

character_profiles["Alice"] = "Claude-Profile"
chat_profiles["alice-2023-11-12"] = "GPT4-Profile"

Result: "GPT4-Profile" loads (chat-specific wins)
```

### 2.3 Profile Import/Export

#### Export Profile

**User Action:** Click "Export Profile" button

**Code Flow:**
```javascript
// From profileManager.js:99-115
function export_profile(profile = null) {
  let targetProfile = profile || get_settings('profile');
  const settings = copy_settings(targetProfile);

  // Serialize to JSON
  const data = JSON.stringify(settings, null, JSON_INDENT_SPACES);

  // Download file
  download(data, `${profile}.json`, 'application/json');
}
```

**Export Format:**
```json
{
  "scene_recap_prompt": "...",
  "scene_recap_prefill": "{",
  "scene_recap_connection_profile": "",
  "auto_scene_break_enabled": true,
  "injection_position": "after_main",
  "... 117+ settings ..."
}
```

**What's Exported:**
- All 117+ profile-specific settings
- Current state of prompts, toggles, connection profiles
- Does NOT export: global settings, mappings, version info

**⚠️ ISSUE:** No version metadata, imported into future/past versions may break.

#### Import Profile

**User Action:** Click "Import Profile" button, select JSON file

**Code Flow:**
```javascript
// From profileManager.js:116-135
async function import_profile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const name = file.name.replace('.json', '');
  const data = await parseJsonFile(file);

  // Save directly to profiles (❌ NO VALIDATION)
  const profiles = get_settings('profiles');
  profiles[name] = data;
  set_settings('profiles', profiles);

  toast(`Profile "${name}" imported`, 'success');
  refresh_settings();
}
```

**⚠️ CRITICAL ISSUES:**
1. **No validation** - Malformed JSON accepted
2. **No migration** - Old schema not upgraded
3. **No version check** - Incompatible versions crash
4. **No conflict detection** - Overwrites existing profile silently

**Risk Scenarios:**
```javascript
// Scenario 1: Import from old version missing new settings
// Imported profile has 100 settings, current version needs 117
// Missing 17 settings → undefined errors at runtime

// Scenario 2: Import with old schema
// Old: scene_recap_prompt: "string"
// New: scene_recap_prompt: { text: "...", version: 1 }
// Type mismatch → crash

// Scenario 3: Import with invalid data
// setting: { invalid: "structure" }
// No validation → runtime errors
```

### 2.4 Profile Management UI

#### Profile Dropdown

**Location:** Top of settings panel

**Code:**
```javascript
// From settingsUI.js:82-88
bind_function(selectorsExtension.profileDropdown, async () => {
  const profile = $(selectorsExtension.profileDropdown).val();
  save_profile();  // Save current profile first
  load_profile(profile);  // Switch to selected profile
});
```

**Behavior:**
- Auto-saves current profile before switching
- Loads selected profile immediately
- Updates all UI fields with new profile's values

#### Profile Buttons

**Available Actions:**
- "New Profile" - Create copy of current settings
- "Save Profile" - Save current settings to active profile
- "Delete Profile" - Remove profile (except Default)
- "Export Profile" - Download as JSON
- "Import Profile" - Load from JSON
- "Set as Default for Character" - Auto-load for character
- "Set as Default for Chat" - Auto-load for this chat

---

## 3. Settings Initialization

### 3.1 First Load (Fresh Install)

**Entry Point:**
```javascript
// From eventHandlers.js:246-269
async function initializeExtension() {
  // 1. Initialize settings
  initialize_settings();

  // 2. Initialize Auto-Lorebooks
  initializeAutoLorebooksGlobalSettings();

  // 3. Load profile
  load_profile();

  // 4. Run migrations
  await migrateConnectionProfileSettings();

  // ... rest of initialization
}
```

**Settings Initialization:**
```javascript
// From settingsManager.js:48-90
function initialize_settings() {
  if (extension_settings[MODULE_NAME] !== undefined) {
    log("Settings already initialized.");
    soft_reset_settings();  // Update scenario
  } else {
    log("Extension settings not found. Initializing...");
    hard_reset_settings();  // First install
  }

  load_profile();
}
```

### 3.2 Hard Reset (First Install)

**When:** `extension_settings.auto_recap` does NOT exist

**Code Flow:**
```javascript
// From settingsManager.js:91-102
function hard_reset_settings() {
  // 1. Create Default profile if missing
  if (global_settings['profiles']['Default'] === undefined) {
    global_settings['profiles']['Default'] = structuredClone(default_settings);
  }

  // 2. Merge defaults + globals into active settings
  extension_settings[MODULE_NAME] = structuredClone({
    ...default_settings,  // All 117+ default settings
    ...global_settings    // Global settings (profiles, mappings, etc.)
  });

  // 3. Initialize Auto-Lorebooks
  extension_settings.autoLorebooks = getDefaultAutoLorebookSettings();

  // 4. Save to disk
  saveSettingsDebounced();
}
```

**Result:**
- Default profile created with all default settings
- Active settings initialized
- Auto-Lorebooks initialized
- Settings persisted to `settings.json`

### 3.3 Soft Reset (Extension Update)

**When:** `extension_settings.auto_recap` EXISTS (user has settings)

**Code Flow:**
```javascript
// From settingsManager.js:103-123
function soft_reset_settings() {
  // 1. Merge active settings (priority: existing > globals > defaults)
  extension_settings[MODULE_NAME] = Object.assign(
    structuredClone(default_settings),  // New defaults (base)
    structuredClone(global_settings),   // Global settings (override)
    extension_settings[MODULE_NAME]     // Existing settings (highest priority)
  );

  // 2. Merge each profile with new defaults
  const profiles = get_settings('profiles');
  for (const [profile, settings] of Object.entries(profiles)) {
    profiles[profile] = Object.assign(
      structuredClone(default_settings),  // New defaults (base)
      settings                             // User settings (override)
    );
  }
  set_settings('profiles', profiles);

  // 3. Save
  saveSettingsDebounced();
}
```

**Merge Behavior:**
```javascript
// Object.assign merges LEFT → RIGHT (right side wins)
Object.assign(defaults, user_settings)
// Result: user_settings override defaults

// Example:
const defaults = { a: 1, b: 2, c: 3 };
const user = { b: 999 };
Object.assign(defaults, user);
// Result: { a: 1, b: 999, c: 3 }
//         ^^^ new  ^^^ kept  ^^^ new
```

**What Happens During Update:**

| Setting State | Old Value | New Default | Result | Outcome |
|---------------|-----------|-------------|--------|---------|
| User never set | (none) | "new value" | "new value" | ✅ Gets new default |
| User customized | "custom" | "new value" | "custom" | ✅ Keeps customization |
| Removed from defaults | "old" | (none) | "old" | ⚠️ Dead setting persists |
| Type changed | "string" | { object } | "string" | ❌ Type mismatch |
| Renamed | (none) | (none) | (none) | ❌ Both old/new exist |

**✅ GOOD:**
- New settings added automatically
- User customizations preserved

**❌ PROBLEMS:**
- Removed settings never cleaned up
- Type changes cause errors
- Renamed settings create duplicates
- Users with old customizations never get new improved defaults

### 3.4 Auto-Lorebooks Initialization

**Separate Settings Namespace:**
```javascript
// From settingsManager.js:124-145
function initializeAutoLorebooksGlobalSettings() {
  if (!extension_settings.autoLorebooks) {
    // First time: use defaults
    extension_settings.autoLorebooks = getDefaultAutoLorebookSettings();
  } else {
    // Merge with defaults (add new settings)
    const defaults = getDefaultAutoLorebookSettings();
    extension_settings.autoLorebooks = {
      ...defaults,
      ...extension_settings.autoLorebooks
    };

    // Remove legacy settings
    delete extension_settings.autoLorebooks.enableAutoLorebooks;
  }

  saveSettingsDebounced();
}
```

**Auto-Lorebooks Settings:**
```javascript
// From settingsManager.js:17-24
function getDefaultAutoLorebookSettings() {
  return {
    nameTemplate: '[Recap] {{chat_name}}',  // Lorebook naming
    deleteOnChatDelete: true,                // Auto-cleanup
    autoReorderAlphabetically: false,        // Entry sorting
    entity_types: {}                         // Entity type definitions
  };
}
```

**Key Difference from Main Settings:**
- Uses spread operator (`...`) instead of `Object.assign()`
- Same behavior: user settings override defaults
- Explicitly removes deprecated settings

---

## 4. Update Behavior

### 4.1 Extension Update Scenario

**Scenario:** Developer ships new version with:
- Improved prompt defaults
- New settings added
- Old settings removed
- Settings renamed

**User Update Flow:**

```
User installs new version
         ↓
Extension loads with new defaultSettings.js
         ↓
initialize_settings() called
         ↓
extension_settings.auto_recap exists? → YES
         ↓
soft_reset_settings() runs
         ↓
┌────────────────────────────────────────────────┐
│ Active Settings Merge                          │
├────────────────────────────────────────────────┤
│ Object.assign(                                 │
│   new_defaults,     // Base                    │
│   global_settings,  // Profile mappings        │
│   old_settings      // USER SETTINGS WIN       │
│ )                                              │
└────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────┐
│ Profile Settings Merge (ALL PROFILES)          │
├────────────────────────────────────────────────┤
│ for each profile:                              │
│   Object.assign(                               │
│     new_defaults,   // Base                    │
│     profile_data    // USER SETTINGS WIN       │
│   )                                            │
└────────────────────────────────────────────────┘
         ↓
Settings saved to disk
```

### 4.2 What Survives Updates

**✅ Preserved:**
- All user-modified settings (correct behavior)
- All profile definitions
- Character/chat profile mappings
- Global state (toggles, enabled chats)

**⚠️ Added Automatically:**
- New settings from `default_settings` (with default values)
- Missing settings that user doesn't have yet

**❌ Problems:**
- Old settings never removed (clutter)
- Improved default prompts NOT received by users
- Type changes cause runtime errors
- Renamed settings create duplicates

### 4.3 Specific Update Scenarios

#### Scenario A: Developer Improves Prompt

**Old Version:**
```javascript
// defaultPrompts.js v1.0
export const scene_recap_prompt = `Generate a recap...`;
```

**New Version:**
```javascript
// defaultPrompts.js v2.0
export const scene_recap_prompt = `Generate a detailed recap with improved JSON extraction...`;
```

**User Experience:**
```
User A (never customized):
  Old: uses default from v1.0
  After update: STILL uses v1.0 text
  ❌ PROBLEM: Never gets improvement

User B (customized prompt):
  Old: uses custom prompt
  After update: STILL uses custom prompt
  ✅ CORRECT: Customization preserved
  ⚠️ ISSUE: No notification of available improvement
```

**Root Cause:**
```javascript
// soft_reset_settings()
Object.assign(new_defaults, user_settings)
// user_settings.scene_recap_prompt overwrites new_defaults.scene_recap_prompt
// Even if user never touched it, old value exists → wins
```

#### Scenario B: Developer Adds New Setting

**New Version:**
```javascript
// defaultSettings.js v2.0
export const default_settings = {
  // ... existing settings
  new_feature_enabled: true,  // NEW SETTING
  new_feature_threshold: 50,  // NEW SETTING
};
```

**User Experience:**
```
User A:
  After update: new_feature_enabled = true (default value)
  ✅ CORRECT: New settings added automatically
```

**Code Behavior:**
```javascript
// soft_reset_settings()
Object.assign(
  { new_feature_enabled: true },  // New default
  { /* user doesn't have this */ } // User settings
)
// Result: new_feature_enabled = true (default wins)
```

#### Scenario C: Developer Removes Setting

**Old Version:**
```javascript
export const default_settings = {
  deprecated_setting: "old value",
  // ... other settings
};
```

**New Version:**
```javascript
export const default_settings = {
  // deprecated_setting removed
  // ... other settings
};
```

**User Experience:**
```
User A:
  Before update: deprecated_setting exists in their profile
  After update: deprecated_setting STILL exists
  ❌ PROBLEM: Dead setting never cleaned up
  ⚠️ IMPACT: Clutters settings, may cause confusion
```

**Why:**
```javascript
// soft_reset_settings()
Object.assign(
  { /* deprecated_setting not in defaults */ },
  { deprecated_setting: "old value" }  // User still has it
)
// Result: deprecated_setting persists
```

#### Scenario D: Developer Changes Setting Type

**Old Version:**
```javascript
export const default_settings = {
  setting_x: "string value"
};
```

**New Version:**
```javascript
export const default_settings = {
  setting_x: { value: "string", metadata: {} }  // Now an object
};
```

**User Experience:**
```
User A:
  Before update: setting_x = "string value"
  After update: setting_x = "string value"
  ❌ CRASH: Code expects object, gets string

Code:
  const value = get_settings('setting_x').value;
  // TypeError: Cannot read property 'value' of string
```

**Why:**
```javascript
// soft_reset_settings()
Object.assign(
  { setting_x: { value: "...", metadata: {} } },  // New default (object)
  { setting_x: "string value" }                    // User has (string)
)
// Result: setting_x = "string value" (user wins, type mismatch)
```

#### Scenario E: Developer Renames Setting

**Old Version:**
```javascript
export const default_settings = {
  old_name: "value"
};
```

**New Version:**
```javascript
export const default_settings = {
  new_name: "value"  // Renamed
};
```

**User Experience:**
```
User A:
  Before update: old_name = "custom value"
  After update:
    old_name = "custom value"  // Old name persists
    new_name = "value"         // New name added
  ❌ PROBLEM: Duplicate data, code uses new_name, user setting lost
```

**Why:**
```javascript
// soft_reset_settings()
Object.assign(
  { new_name: "value" },        // New default
  { old_name: "custom value" }  // User has old name
)
// Result: { old_name: "custom value", new_name: "value" }
// Both exist, code reads new_name, user customization on old_name ignored
```

### 4.4 Migration System (Current)

**What Exists:**
```javascript
// From settingsMigration.js:25-59
export async function migrateConnectionProfileSettings() {
  let migrated = false;

  const PROFILE_SETTING_KEYS = [
    'scene_recap_connection_profile',
    'scene_recap_error_detection_connection_profile',
    // ... more keys
  ];

  for (const key of PROFILE_SETTING_KEYS) {
    const currentValue = get_settings(key);

    // Skip if already UUID or empty
    if (!currentValue || currentValue === '' || isUUID(currentValue)) {
      continue;
    }

    // Convert profile name → UUID
    const profileId = await getConnectionManagerProfileId(currentValue);

    if (profileId) {
      set_settings(key, profileId);
      migrated = true;
    } else {
      set_settings(key, '');  // Reset if profile not found
      migrated = true;
    }
  }

  return migrated;
}
```

**What It Does:**
- Migrates connection profile names → UUIDs
- Runs during extension initialization
- Idempotent (safe to run multiple times)

**✅ Good Patterns:**
- Detects if migration needed (isUUID check)
- Handles missing data (resets to empty)
- Idempotent design

**❌ Issues:**
- Runs EVERY extension load (not just first time)
- No version tracking (can't skip if already done)
- Only migrates ACTIVE settings (not all profiles)
- No migration registry (hard-coded in initialization)

### 4.5 Multi-Profile Migration Gap

**Problem:** Migrations only run on active settings, not all profiles

**Scenario:**
```
User has 3 profiles:
- Default (active)
- Claude-Profile (inactive)
- GPT4-Profile (inactive)

Extension updates with migration:
  Old: connection_profile = "profile-name"
  New: connection_profile = "uuid-1234"

Migration runs:
  ✅ Default profile: migrated (active)
  ❌ Claude-Profile: NOT migrated (inactive)
  ❌ GPT4-Profile: NOT migrated (inactive)

User switches to Claude-Profile:
  ❌ CRASH: Code expects UUID, gets profile name
```

**Why:**
```javascript
// Migration only touches active settings
const currentValue = get_settings(key);  // Reads from active settings only
set_settings(key, profileId);            // Writes to active settings only

// Profiles stored separately, not touched
extension_settings.auto_recap.profiles['Claude-Profile'] = {
  connection_profile: "old-name"  // ❌ Never migrated
};
```

**Impact:**
- Any migration affects only 1 profile (active)
- Other profiles remain on old schema
- Switching to unmigrated profile → errors

---

## 5. Prompt Management

### 5.1 Prompt Storage

**All prompts stored as plain strings in profiles:**

```javascript
// From defaultSettings.js
export const default_settings = {
  // Scene recap
  scene_recap_prompt: scene_recap_prompt,  // Imported from defaultPrompts.js
  scene_recap_prefill: JSON_EXTRACTION_PREFILL,

  // Validation
  scene_recap_error_detection_prompt: scene_recap_error_detection_prompt,
  scene_recap_error_detection_prefill: JSON_EXTRACTION_PREFILL,

  // Scene break detection
  auto_scene_break_prompt: auto_scene_break_detection_prompt,
  auto_scene_break_prefill: JSON_EXTRACTION_PREFILL,

  // Running scene recap
  running_scene_recap_prompt: running_scene_recap_prompt,
  running_scene_recap_prefill: JSON_EXTRACTION_PREFILL,
  running_scene_recap_template: default_running_scene_template,

  // Auto-Lorebooks (17 total prompts)
  auto_lorebooks_recap_merge_prompt: `[150+ line inline prompt]`,
  // ... more prompts
};
```

**Prompt Sources:**

| Prompt | Source | Lines | Location |
|--------|--------|-------|----------|
| `scene_recap_prompt` | `defaultPrompts.js` | ~50 | Imported |
| `scene_recap_error_detection_prompt` | `defaultPrompts.js` | ~40 | Imported |
| `auto_scene_break_prompt` | `defaultPrompts.js` | ~60 | Imported |
| `running_scene_recap_prompt` | `defaultPrompts.js` | ~70 | Imported |
| `auto_lorebooks_recap_merge_prompt` | `defaultSettings.js` | ~150 | Inline ❌ |
| `auto_lorebooks_*_prompt` | `defaultPrompts.js` | ~400 | Imported |

**⚠️ ISSUE:** One major prompt (`auto_lorebooks_recap_merge_prompt`) stored inline in `defaultSettings.js` instead of `defaultPrompts.js`.

### 5.2 Prompt Metadata (None)

**Current Structure:**
```javascript
profile.scene_recap_prompt = "Prompt text...";  // Just a string
```

**No metadata tracked:**
- ❌ No version number
- ❌ No "is_customized" flag
- ❌ No "original_default" for comparison
- ❌ No "last_updated" timestamp
- ❌ No "changelog" or "description"

**Impact:**
- Can't detect if user modified prompt
- Can't detect if default has improved
- Can't offer updates ("New version available")
- Can't show diff between custom and default
- Can't track prompt evolution

### 5.3 Prompt Customization

#### User Customization Flow

**UI:**
```javascript
// From settingsUI.js:152-164
bind_function(selectorsExtension.scene.editPrompt, async () => {
  const description = `
Available Macros:
- {{message}}: The scene content to recap.
- {{history}}: The message history for context.
- {{words}}: The token limit for the recap.
`;
  await get_user_setting_text_input(
    'scene_recap_prompt',
    'Edit Scene Recap Prompt',
    description
  );
});
```

**Modal Function:**
```javascript
// From settingsUI.js:27-60
async function get_user_setting_text_input(settingKey, title, description) {
  const currentValue = get_settings(settingKey);

  // Show modal with textarea
  const result = await callGenericPopup(
    `<div>${description}</div>
     <textarea id="setting_input">${currentValue}</textarea>`,
    title,
    POPUP_TYPE.CONFIRM
  );

  if (result === POPUP_RESULT.AFFIRMATIVE) {
    const newValue = $('#setting_input').val();
    set_settings(settingKey, newValue);  // ❌ No metadata set
    refresh_settings();
  }
}
```

**What Happens:**
1. User clicks "Edit" button
2. Modal shows current prompt text
3. User modifies text
4. Text saved to profile
5. ❌ **No indication** that prompt is now customized
6. ❌ **No way** to reset to default

**Missing UX:**
- No "Reset to Default" button
- No visual indicator of customization
- No diff view (compare with default)
- No confirmation on reset
- No undo functionality

### 5.4 Prompt Versioning Gap

**Problem:** No way to version prompts or track improvements

**Use Case: Developer Improves Prompt**

```javascript
// Version 1.0
const scene_recap_prompt = `
Generate a recap of the scene.
Output JSON: {"recap": "..."}
`;

// Version 2.0 (improved JSON extraction)
const scene_recap_prompt = `
Generate a detailed recap of the scene with improved JSON extraction.
Output ONLY valid JSON with no additional text.
Use this exact format: {"recap": "..."}
`;
```

**Current Behavior:**
```
User A (installed v1.0, never customized):
  - Has v1.0 prompt in profile
  - Updates to v2.0
  - STILL has v1.0 prompt (never replaced)
  - ❌ Misses improvement

User B (installed v1.0, customized prompt):
  - Has custom prompt in profile
  - Updates to v2.0
  - STILL has custom prompt (correct)
  - ⚠️ No notification that defaults improved
  - Can't see what changed
  - Can't merge improvements
```

**Desired Behavior:**
```
User A (installed v1.0, never customized):
  - Has v1.0 prompt
  - Updates to v2.0
  - Notification: "Scene recap prompt improved (v1→v2). Update?"
  - User clicks "View Changes" → sees diff
  - User clicks "Update" → gets v2.0
  - ✅ Receives improvement

User B (installed v1.0, customized prompt):
  - Has custom prompt (based on v1.0)
  - Updates to v2.0
  - Notification: "Scene recap prompt improved (v1→v2). You have customizations."
  - User clicks "View Changes" → sees diff with their custom
  - Options:
    - "Keep Custom" → keeps current
    - "Update (lose custom)" → gets v2.0, loses custom
    - "View Side-by-Side" → manual merge
  - ✅ Informed choice
```

### 5.5 Prompt Update Workflow (Ideal)

**Required Infrastructure:**

1. **Prompt Metadata Structure:**
```javascript
{
  text: "Prompt content...",
  version: 2,
  is_customized: false,
  original_default_version: 2,
  original_default_text: "Prompt content...",
  customized_at: null,
  changelog: "v2: Improved JSON extraction"
}
```

2. **Default Prompt Registry:**
```javascript
// defaultPrompts.js
export const prompt_versions = {
  scene_recap_prompt: {
    version: 2,
    text: scene_recap_prompt,
    changelog: "v2: Improved JSON extraction, added error handling"
  }
};
```

3. **Update Detection:**
```javascript
function checkPromptUpdates() {
  const updates = [];

  for (const [key, defaultPrompt] of Object.entries(prompt_versions)) {
    const userPrompt = get_settings(key);

    if (userPrompt.version < defaultPrompt.version) {
      updates.push({
        key,
        currentVersion: userPrompt.version,
        newVersion: defaultPrompt.version,
        is_customized: userPrompt.is_customized,
        changelog: defaultPrompt.changelog
      });
    }
  }

  return updates;
}
```

4. **Update UI:**
```javascript
function showPromptUpdateDialog(updates) {
  const html = `
    <h3>Prompt Updates Available</h3>
    <p>${updates.length} prompts have improvements:</p>
    <ul>
      ${updates.map(u => `
        <li>
          <strong>${u.key}</strong> (v${u.currentVersion} → v${u.newVersion})
          ${u.is_customized ? '<span class="badge">⚠️ Customized</span>' : ''}
          <br>
          <em>${u.changelog}</em>
          <br>
          <button onclick="viewDiff('${u.key}')">View Changes</button>
          ${u.is_customized
            ? '<button onclick="updatePrompt('${u.key}', true)">Update (lose custom)</button>'
            : '<button onclick="updatePrompt('${u.key}', false)">Update</button>'
          }
        </li>
      `).join('')}
    </ul>
  `;

  showModal(html);
}
```

---

## 6. Migration System

### 6.1 Current Migration: Connection Profiles

**Purpose:** Convert connection profile names → UUIDs

**Background:**
- Old: `connection_profile: "Default"`
- New: `connection_profile: "uuid-1234-5678"`
- SillyTavern changed API from names to UUIDs

**Implementation:**
```javascript
// From settingsMigration.js:25-59
export async function migrateConnectionProfileSettings() {
  let migrated = false;

  const PROFILE_SETTING_KEYS = [
    'scene_recap_connection_profile',
    'scene_recap_error_detection_connection_profile',
    'auto_scene_break_connection_profile',
    'running_scene_recap_connection_profile',
    'auto_lorebooks_recap_connection_profile',
    'auto_lorebooks_bulk_populate_connection_profile',
  ];

  for (const key of PROFILE_SETTING_KEYS) {
    const currentValue = get_settings(key);

    // Skip if already migrated
    if (!currentValue || currentValue === '' || isUUID(currentValue)) {
      continue;
    }

    // Look up UUID from name
    const profileId = await getConnectionManagerProfileId(currentValue);

    if (profileId) {
      // Migration successful
      set_settings(key, profileId);
      migrated = true;
      debug(SUBSYSTEM.SETTINGS, `Migrated ${key}: "${currentValue}" → "${profileId}"`);
    } else {
      // Profile not found, reset
      set_settings(key, '');
      migrated = true;
      debug(SUBSYSTEM.SETTINGS, `Reset ${key}: profile "${currentValue}" not found`);
    }
  }

  if (migrated) {
    save_profile();  // Save changes
  }

  return migrated;
}
```

**When It Runs:**
```javascript
// From eventHandlers.js:266-269
async function initializeExtension() {
  initialize_settings();
  initializeAutoLorebooksGlobalSettings();
  load_profile();
  await migrateConnectionProfileSettings();  // ← HERE
  // ... rest
}
```

**✅ Good Patterns:**
- **Idempotent:** Safe to run multiple times (checks `isUUID()`)
- **Defensive:** Handles missing profiles gracefully
- **Logging:** Debug output for tracking
- **Returns status:** Indicates if changes made

**❌ Issues:**
- **Runs every load:** No version tracking, runs on every extension initialization
- **Only active settings:** Doesn't migrate inactive profiles
- **Hard-coded:** Not extensible for future migrations
- **No registry:** Migration logic mixed with initialization code

### 6.2 Migration Gap: Multi-Profile

**Problem:** Migration only touches active settings

**Current Code:**
```javascript
const currentValue = get_settings(key);  // ← Reads from ACTIVE settings only
set_settings(key, profileId);            // ← Writes to ACTIVE settings only
```

**Impact:**
```
User has profiles:
  - Default (active) ✅ Migrated
  - Claude-Profile   ❌ Not migrated
  - GPT4-Profile     ❌ Not migrated

User switches to Claude-Profile:
  Code expects UUID, gets profile name → ERROR
```

**Fix Required:**
```javascript
async function migrateConnectionProfileSettings() {
  let migrated = false;

  // 1. Migrate active settings (current behavior)
  for (const key of PROFILE_SETTING_KEYS) {
    // ... existing logic
  }

  // 2. Migrate ALL profiles (NEW)
  const profiles = get_settings('profiles');
  for (const [profileName, profileData] of Object.entries(profiles)) {
    for (const key of PROFILE_SETTING_KEYS) {
      const currentValue = profileData[key];

      if (!currentValue || currentValue === '' || isUUID(currentValue)) {
        continue;
      }

      const profileId = await getConnectionManagerProfileId(currentValue);
      profileData[key] = profileId || '';
      migrated = true;
    }
  }

  if (migrated) {
    set_settings('profiles', profiles);
    save_profile();
  }

  return migrated;
}
```

### 6.3 Migration Gap: No Version Tracking

**Problem:** No way to track which migrations have run

**Current Behavior:**
```javascript
// Runs on EVERY extension load
await migrateConnectionProfileSettings();

// Inside migration:
if (isUUID(currentValue)) {
  continue;  // Skip if already migrated
}
```

**Issues:**
- **Performance:** Unnecessary checks on every load
- **No history:** Can't tell if migration ran before
- **No skipping:** Migrations can't be skipped once applied

**Ideal Behavior:**
```javascript
// Settings include version
profile._version = 2;
profile._migrations_applied = ['connection-profiles-to-uuid'];

// Migration registry
const migrations = [
  {
    id: 'connection-profiles-to-uuid',
    version: 1,
    async migrate(settings) {
      // ... migration logic
      return settings;
    }
  },
  {
    id: 'add-new-feature-settings',
    version: 2,
    async migrate(settings) {
      // ... migration logic
      return settings;
    }
  }
];

// Run migrations
async function migrateProfile(profile) {
  const appliedMigrations = profile._migrations_applied || [];

  for (const migration of migrations) {
    // Skip if already applied
    if (appliedMigrations.includes(migration.id)) {
      continue;
    }

    // Run migration
    profile = await migration.migrate(profile);
    appliedMigrations.push(migration.id);
  }

  profile._migrations_applied = appliedMigrations;
  profile._version = migrations[migrations.length - 1].version;

  return profile;
}
```

### 6.4 Migration Gap: No Registry Pattern

**Problem:** Migrations hard-coded in initialization

**Current:**
```javascript
// eventHandlers.js
await migrateConnectionProfileSettings();  // Hard-coded
```

**Future: New Migration Needed**
```javascript
// eventHandlers.js
await migrateConnectionProfileSettings();
await migrateSomeOtherThing();  // ← Added manually
await migrateYetAnotherThing(); // ← Added manually
```

**Issues:**
- **Not scalable:** Every migration adds a line
- **Order-dependent:** Must run in correct order
- **No centralization:** Migrations scattered

**Better Pattern:**
```javascript
// settingsMigration.js
const migrations = [
  {
    id: 'connection-profiles-to-uuid',
    version: 1,
    description: 'Convert connection profile names to UUIDs',
    async migrate(settings) {
      // Existing migration logic
      return settings;
    }
  },
  {
    id: 'prompt-versioning',
    version: 2,
    description: 'Convert prompts from strings to versioned objects',
    async migrate(settings) {
      // New migration logic
      return settings;
    }
  }
];

export async function runMigrations(settings) {
  const currentVersion = settings._version || 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      debug(SUBSYSTEM.SETTINGS, `Running migration: ${migration.description}`);
      settings = await migration.migrate(settings);
      settings._version = migration.version;
    }
  }

  return settings;
}

// eventHandlers.js
await runMigrations(extension_settings.auto_recap);
```

### 6.5 Migration Gap: Import Validation

**Problem:** Imported profiles bypass validation and migration

**Current Code:**
```javascript
// From profileManager.js:128
async function import_profile(e) {
  const file = e.target.files[0];
  const name = file.name.replace('.json', '');
  const data = await parseJsonFile(file);

  // ❌ NO VALIDATION
  // ❌ NO MIGRATION
  profiles[name] = data;  // Directly saved
  set_settings('profiles', profiles);
}
```

**Risk Scenarios:**

1. **Old Schema Import:**
```json
{
  "scene_recap_prompt": "...",
  "connection_profile": "Default"
}
```
- Missing new settings → undefined errors
- Old connection profile format → type errors
- No version tracking → can't detect

2. **Invalid Data Import:**
```json
{
  "scene_recap_prompt": { "invalid": "structure" },
  "some_setting": null
}
```
- Type mismatches → runtime crashes
- Null values → unexpected behavior

3. **Future Version Import:**
```json
{
  "_version": 5,
  "future_setting": "..."
}
```
- Current code is v2
- Unknown settings → ignored or errors

**Fix Required:**
```javascript
async function import_profile(e) {
  const file = e.target.files[0];
  const name = file.name.replace('.json', '');
  let data = await parseJsonFile(file);

  // 1. VALIDATE
  if (!data || typeof data !== 'object') {
    toast("Invalid profile file", "error");
    return;
  }

  // 2. CHECK VERSION
  const importedVersion = data._version || 0;
  const currentVersion = SETTINGS_VERSION;

  if (importedVersion > currentVersion) {
    const proceed = await confirm(
      `This profile is from a newer version (v${importedVersion}). ` +
      `Current version is v${currentVersion}. Some settings may not work. Continue?`
    );
    if (!proceed) return;
  }

  // 3. MIGRATE
  data = Object.assign(
    structuredClone(default_settings),  // Fill missing settings
    data                                 // Preserve imported data
  );
  data = await runMigrations(data);     // Run migrations

  // 4. SAVE
  const profiles = get_settings('profiles');
  profiles[name] = data;
  set_settings('profiles', profiles);

  toast(`Profile "${name}" imported and migrated to v${data._version}`, 'success');
  refresh_settings();
}
```

---

## 7. Reference Extension Patterns

### 7.1 SillyTavern Memory Extension

**Location:** `SillyTavern/public/scripts/extensions/memory/index.js`

#### Settings Initialization

```javascript
// From memory/index.js:139-149
function loadSettings() {
  // Create namespace if missing
  if (Object.keys(extension_settings.memory).length === 0) {
    Object.assign(extension_settings.memory, defaultSettings);
  }

  // Add missing keys individually
  for (const key of Object.keys(defaultSettings)) {
    if (extension_settings.memory[key] === undefined) {
      extension_settings.memory[key] = defaultSettings[key];
    }
  }

  // Populate UI
  $('#memory_prompt').val(extension_settings.memory.prompt);
  $('#memory_template').val(extension_settings.memory.template);
  // ...
}
```

**Pattern:**
- ✅ Simple additive merge (add missing keys only)
- ✅ Preserves existing settings
- ❌ No versioning
- ❌ No migration system
- ❌ No prompt versioning

**Comparison:**
- **Similar to ST-Auto-Summarize:** Additive merge, no versioning
- **Simpler:** No profiles, just global settings
- **Same issues:** Can't evolve schema, users stuck on old defaults

### 7.2 SillyTavern Quick Reply Extension

**Location:** `SillyTavern/public/scripts/extensions/quick-reply/index.js`

#### Settings with Versioning

```javascript
// From quick-reply/index.js:66-105
const loadSets = async () => {
  const response = await fetch('/api/quick-replies');
  const setList = (await response.json()).quickReplyPresets ?? [];

  for (const set of setList) {
    // VERSION CHECK
    if (set.version !== 2) {
      // MIGRATION v1 → v2
      set.version = 2;
      set.disableSend = set.quickActionEnabled ?? false;
      set.placeBeforeInput = set.placeBeforeInputEnabled ?? false;
      set.injectInput = set.quickActionEnabled ?? false;

      // Migrate slots → qrList
      set.qrList = set.quickReplySlots.map((slot, idx) => {
        const qr = {};
        qr.id = idx + 1;
        qr.label = slot.label ?? '';
        qr.message = slot.mes ?? '';
        qr.title = slot.label ?? '';
        qr.isHidden = slot.hidden ?? false;
        // ... more field mappings
        return qr;
      });

      // Remove old fields
      delete set.quickReplySlots;
      delete set.quickActionEnabled;
      delete set.placeBeforeInputEnabled;
    }

    // Only load if version matches
    if (set.version == 2) {
      QuickReplySet.list.push(QuickReplySet.from(JSON.parse(JSON.stringify(set))));
    }
  }
};
```

**Pattern:**
- ✅ **Version field** on each data structure
- ✅ **Explicit migration** from v1 → v2
- ✅ **Field renaming** with fallbacks (`??` operator)
- ✅ **Schema evolution** (slots → qrList)
- ✅ **Old field cleanup** (delete deprecated)
- ✅ **Version gate** (only load compatible versions)

#### Settings Namespace Migration

```javascript
// From quick-reply/index.js:109-134
const loadSettings = async () => {
  // Check for v2 namespace
  if (!extension_settings.quickReplyV2) {
    // Check for v1 namespace
    if (!extension_settings.quickReply) {
      // FIRST INSTALL
      extension_settings.quickReplyV2 = defaultSettings;
    } else {
      // MIGRATE v1 → v2
      extension_settings.quickReplyV2 = {
        isEnabled: extension_settings.quickReply.quickReplyEnabled ?? false,
        isCombined: false,
        config: {
          setList: [{
            set: extension_settings.quickReply.selectedPreset ?? 'Default',
            isVisible: true,
          }],
        },
      };

      // Keep old namespace for backward compat (optional)
      // delete extension_settings.quickReply;
    }
  }

  // Load settings with error handling
  try {
    settings = QuickReplySettings.from(extension_settings.quickReplyV2);
  } catch (ex) {
    console.error('Failed to load Quick Reply settings, using defaults', ex);
    settings = QuickReplySettings.from(defaultSettings);
  }
};
```

**Pattern:**
- ✅ **Namespace versioning** (quickReply → quickReplyV2)
- ✅ **Backward compatibility** (check for v1, migrate)
- ✅ **Safe initialization** (first install vs migration)
- ✅ **Error handling** (fallback to defaults)
- ✅ **Clear separation** (v1 vs v2 namespaces)

**Why This Works:**
- Breaking schema changes → new namespace
- Old users → automatic migration
- New users → clean v2 install
- Migration runs ONCE (namespace check)

### 7.3 Best Practices from Quick Reply

**1. Version Field on Data Structures**
```javascript
const set = {
  version: 2,
  // ... data
};

if (set.version !== CURRENT_VERSION) {
  set = migrateSet(set);
}
```

**2. Namespace Versioning for Breaking Changes**
```javascript
// Old
extension_settings.quickReply = { ... };

// New
extension_settings.quickReplyV2 = { ... };

// Migration check
if (!extension_settings.quickReplyV2) {
  if (extension_settings.quickReply) {
    // Migrate old → new
  } else {
    // First install
  }
}
```

**3. Explicit Migration Functions**
```javascript
function migrateV1toV2(oldData) {
  return {
    version: 2,
    newField: oldData.oldField ?? 'default',
    // ... map all fields
  };
}
```

**4. Fallback Error Handling**
```javascript
try {
  settings = Settings.from(extension_settings.myExtension);
} catch (ex) {
  console.error('Settings load failed, using defaults', ex);
  settings = Settings.from(defaultSettings);
}
```

**5. Field Renaming with Fallbacks**
```javascript
set.disableSend = set.quickActionEnabled ?? false;
//                ^^^^^^^^^^^^^^^^^^^^^^^ old field
//                                        ^^ default if missing
delete set.quickActionEnabled;  // Clean up old field
```

### 7.4 Applying Quick Reply Patterns to ST-Auto-Summarize

**Current ST-Auto-Summarize:**
```javascript
extension_settings.auto_recap = {
  profiles: {
    "Default": { /* 117 settings */ }
  }
};
```

**With Quick Reply Patterns:**
```javascript
// 1. Add version to each profile
extension_settings.auto_recap = {
  _version: 2,  // Extension schema version
  profiles: {
    "Default": {
      _version: 2,  // Profile schema version
      _migrations_applied: ['connection-profiles-to-uuid'],
      // ... 117 settings
    }
  }
};

// 2. Version check on load
if (profile._version !== CURRENT_PROFILE_VERSION) {
  profile = migrateProfile(profile);
}

// 3. Migration registry
const migrations = [
  {
    version: 1,
    migrate: (profile) => {
      // Initial version
      return profile;
    }
  },
  {
    version: 2,
    migrate: async (profile) => {
      // Connection profiles → UUIDs
      for (const key of CONNECTION_PROFILE_KEYS) {
        if (profile[key] && !isUUID(profile[key])) {
          profile[key] = await getConnectionManagerProfileId(profile[key]) || '';
        }
      }
      return profile;
    }
  }
];

// 4. Run migrations
async function migrateProfile(profile) {
  const fromVersion = profile._version || 1;

  for (let i = fromVersion; i < migrations.length; i++) {
    profile = await migrations[i].migrate(profile);
  }

  profile._version = migrations.length;
  return profile;
}
```

---

## 8. Critical Issues

### 8.1 No Settings Versioning

**Issue:** No version tracking on settings or profiles

**Impact:**
- Cannot safely evolve schema
- Cannot track which migrations ran
- Cannot skip completed migrations
- Cannot warn about incompatible versions

**Risk Level:** 🔴 **HIGH** - Blocks schema evolution

**Examples:**
```javascript
// Current: No version
profile = {
  scene_recap_prompt: "..."
};

// Needed: Version tracking
profile = {
  _version: 2,
  _migrations_applied: ['connection-profiles-to-uuid'],
  scene_recap_prompt: "..."
};
```

**Solution:**
1. Add `_version` field to `default_settings`
2. Add `_migrations_applied` array to track migrations
3. Increment version when schema changes
4. Check version before loading/importing

### 8.2 No Prompt Versioning

**Issue:** Prompts stored as plain strings with no metadata

**Impact:**
- Users never get improved prompts
- Cannot detect customization
- Cannot show "new version available"
- Cannot compare with defaults

**Risk Level:** 🟡 **MEDIUM** - Users miss improvements

**Examples:**
```javascript
// Current: Plain string
profile.scene_recap_prompt = "Generate a recap...";

// Needed: Versioned object
profile.scene_recap_prompt = {
  text: "Generate a recap...",
  version: 2,
  is_customized: false,
  original_default: "Generate a recap...",
  customized_at: null
};
```

**Solution:**
1. Convert prompts to objects (with backward compat)
2. Add version field
3. Track customization flag
4. Store original default for comparison
5. Check for updates on extension load

### 8.3 Multi-Profile Migration Gap

**Issue:** Migrations only run on active profile

**Impact:**
- Inactive profiles remain on old schema
- Switching to unmigrated profile → errors
- Users must manually switch to each profile

**Risk Level:** 🔴 **HIGH** - Breaks inactive profiles

**Example:**
```
User has profiles: Default, Claude, GPT4
Active profile: Default

Migration runs:
  ✅ Default → migrated
  ❌ Claude → NOT migrated
  ❌ GPT4 → NOT migrated

User switches to Claude:
  ❌ ERROR: Old schema, code expects new schema
```

**Solution:**
```javascript
// Migrate ALL profiles
function soft_reset_settings() {
  // ... existing active settings merge

  // NEW: Migrate all profiles
  const profiles = get_settings('profiles');
  for (const [name, profileData] of Object.entries(profiles)) {
    profiles[name] = await migrateProfile(
      Object.assign(structuredClone(default_settings), profileData)
    );
  }
  set_settings('profiles', profiles);
}
```

### 8.4 No Import Validation

**Issue:** Imported profiles bypass validation and migration

**Impact:**
- Old profiles crash extension
- Invalid data causes runtime errors
- Missing settings → undefined errors
- Type mismatches → crashes

**Risk Level:** 🟡 **MEDIUM** - User-triggered, but bad UX

**Example:**
```javascript
// User imports profile from old version
{
  "scene_recap_prompt": "...",
  "connection_profile": "Default"  // Old format
  // Missing 17 new settings
}

// Current code:
profiles[name] = data;  // ❌ Directly saved

// Runtime:
const uuid = get_settings('scene_recap_connection_profile');
// undefined (setting doesn't exist)

// Code expects UUID:
if (isUUID(uuid)) { ... }
// TypeError: Cannot read property 'length' of undefined
```

**Solution:**
```javascript
async function import_profile(e) {
  let data = await parseJsonFile(file);

  // 1. Validate structure
  if (!data || typeof data !== 'object') {
    toast("Invalid profile file", "error");
    return;
  }

  // 2. Merge with defaults (add missing settings)
  data = Object.assign(structuredClone(default_settings), data);

  // 3. Run migrations
  data = await migrateProfile(data);

  // 4. Save
  profiles[name] = data;
  toast(`Profile imported and migrated to v${data._version}`, 'success');
}
```

### 8.5 Users Don't Get New Defaults

**Issue:** Update merge preserves old settings, blocking new defaults

**Impact:**
- Users never receive improved prompts
- Users miss new feature settings
- Users stuck on old defaults forever

**Risk Level:** 🟡 **MEDIUM** - Not breaking, but poor UX

**Example:**
```javascript
// User installed v1.0 with defaults
profile.scene_recap_prompt = "Old prompt...";

// Developer ships v2.0 with improved prompt
default_settings.scene_recap_prompt = "New improved prompt...";

// soft_reset_settings()
Object.assign(new_defaults, user_profile);
// Result: user_profile.scene_recap_prompt wins
// User never gets improvement
```

**Root Cause:**
```javascript
// Merge order: defaults ← user (user wins)
Object.assign(default_settings, user_settings)
```

**Solution Options:**

**Option A: Prompt Versioning (Recommended)**
```javascript
// Track if user customized
if (user_prompt.is_customized) {
  // Keep user customization
} else if (user_prompt.version < default_prompt.version) {
  // User hasn't customized, update to new default
  user_prompt = default_prompt;
}
```

**Option B: Selective Update UI**
```javascript
// Notify user of available updates
const updates = checkForUpdates();
if (updates.length > 0) {
  showUpdateDialog(updates);  // Let user choose
}
```

**Option C: Migration to Latest Defaults**
```javascript
// Migration forcibly updates specific settings
{
  version: 3,
  migrate: (profile) => {
    // Force update scene_recap_prompt if not customized
    if (profile.scene_recap_prompt === OLD_DEFAULT) {
      profile.scene_recap_prompt = NEW_DEFAULT;
    }
    return profile;
  }
}
```

### 8.6 No Customization Indicators

**Issue:** Users can't tell which settings they modified

**Impact:**
- No visual indication of customization
- Can't easily reset to defaults
- Can't compare with defaults
- Accidental overwrites

**Risk Level:** 🟢 **LOW** - UX issue, not breaking

**Example:**
```
User opens settings panel:
  scene_recap_prompt: [text field with prompt]

Questions:
  - Is this the default or did I customize it?
  - What's the current default?
  - How do I reset to default?
  - What changed since I customized?

❌ No answers available
```

**Solution:**
```html
<!-- Add indicators and controls -->
<div class="setting-row">
  <label>Scene Recap Prompt</label>
  <span class="customized-badge">⚠️ Customized</span>
  <button class="edit-btn">Edit</button>
  <button class="reset-btn">Reset to Default</button>
  <button class="diff-btn">Compare with Default</button>
</div>
```

```javascript
// Track customization
function editPrompt(key) {
  const current = get_settings(key);
  const newValue = await promptUser(current.text);

  if (newValue !== current.original_default) {
    current.is_customized = true;
    current.customized_at = Date.now();
  }

  current.text = newValue;
  set_settings(key, current);
}

function resetToDefault(key) {
  const defaultPrompt = default_prompts[key];
  set_settings(key, structuredClone(defaultPrompt));
  toast(`Reset to default`, 'success');
}
```

### 8.7 Migration Runs Every Load

**Issue:** Migrations run on every extension initialization

**Impact:**
- Unnecessary performance overhead
- UUID lookups on every load
- No way to skip completed migrations

**Risk Level:** 🟢 **LOW** - Performance issue, not breaking

**Example:**
```javascript
// Current: Runs every time
async function initializeExtension() {
  await migrateConnectionProfileSettings();  // ← Always runs
}

// Migration checks internally
if (isUUID(value)) {
  continue;  // Skip if already migrated
}

// But still iterates through all settings
// Still makes UUID checks
```

**Solution:**
```javascript
// Track migration status
profile._migrations_applied = ['connection-profiles-to-uuid'];

// Skip if already applied
async function migrateProfile(profile) {
  const applied = profile._migrations_applied || [];

  for (const migration of migrations) {
    if (applied.includes(migration.id)) {
      continue;  // Skip completed migration
    }

    profile = await migration.migrate(profile);
    applied.push(migration.id);
  }

  profile._migrations_applied = applied;
  return profile;
}
```

### 8.8 No Migration Registry

**Issue:** Migrations hard-coded, not centralized

**Impact:**
- Hard to add new migrations
- Order dependencies unclear
- Testing difficult
- No migration history

**Risk Level:** 🟢 **LOW** - Code quality issue

**Solution:**
```javascript
// Centralized migration registry
const migrations = [
  {
    id: 'connection-profiles-to-uuid',
    version: 1,
    description: 'Convert connection profile names to UUIDs',
    async migrate(profile) {
      // Existing migration logic
      return profile;
    }
  },
  {
    id: 'prompt-versioning',
    version: 2,
    description: 'Convert prompts to versioned objects',
    async migrate(profile) {
      // New migration logic
      return profile;
    }
  }
];

// Single entry point
export async function runMigrations(profile) {
  // ... runs all migrations in order
}
```

---

## 9. Data Flow Diagrams

### 9.1 Settings Initialization Flow

```
┌─────────────────────────────────────────────────────────┐
│ Extension Load                                          │
│ (eventHandlers.js:initializeExtension)                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ initialize_settings()                                   │
│ (settingsManager.js:48)                                │
├─────────────────────────────────────────────────────────┤
│ Check: extension_settings.auto_recap exists?           │
└────────────┬─────────────────────┬──────────────────────┘
             │ NO                  │ YES
             │ (First Install)     │ (Update)
             ▼                     ▼
┌──────────────────────┐  ┌────────────────────────────────┐
│ hard_reset_settings  │  │ soft_reset_settings            │
├──────────────────────┤  ├────────────────────────────────┤
│ 1. Create Default    │  │ 1. Merge active settings:      │
│    profile from      │  │    defaults → globals → user   │
│    defaults          │  │    (user wins)                 │
│                      │  │                                │
│ 2. Merge defaults +  │  │ 2. For each profile:           │
│    globals into      │  │    merge defaults → profile    │
│    active settings   │  │    (profile wins)              │
│                      │  │                                │
│ 3. Save to disk      │  │ 3. Save to disk                │
└──────────┬───────────┘  └────────────┬───────────────────┘
           │                           │
           └───────────┬───────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│ initializeAutoLorebooksGlobalSettings()                 │
│ (settingsManager.js:124)                               │
├─────────────────────────────────────────────────────────┤
│ Check: extension_settings.autoLorebooks exists?        │
│   NO: Set to defaults                                  │
│   YES: Merge with defaults, remove legacy settings     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ load_profile()                                          │
│ (profileManager.js:77)                                 │
├─────────────────────────────────────────────────────────┤
│ 1. Get 'Default' profile (or specified profile)        │
│ 2. Copy profile settings                               │
│ 3. Merge into active settings (overwrite)              │
│ 4. Update UI                                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ migrateConnectionProfileSettings()                      │
│ (settingsMigration.js:25)                              │
├─────────────────────────────────────────────────────────┤
│ For each connection_profile setting:                   │
│   If value is not UUID:                                │
│     Look up UUID from Connection Manager               │
│     Replace name with UUID                             │
│                                                        │
│ ❌ ONLY MIGRATES ACTIVE SETTINGS                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
                  [Done]
```

### 9.2 Profile Load Flow (Chat Change)

```
┌─────────────────────────────────────────────────────────┐
│ Trigger: CHAT_CHANGED event                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ handleChatChanged()                                     │
│ (eventHandlers.js:62)                                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ auto_load_profile()                                     │
│ (profileManager.js:297)                                │
├─────────────────────────────────────────────────────────┤
│ Profile Resolution (priority order):                   │
│                                                        │
│ 1. Check chat_profiles[chatId]                        │
│    ├─ EXISTS: Use this profile                        │
│    └─ NOT EXISTS: Continue to step 2                  │
│                                                        │
│ 2. Check character_profiles[characterId]              │
│    ├─ EXISTS: Use this profile                        │
│    └─ NOT EXISTS: Continue to step 3                  │
│                                                        │
│ 3. Use "Default" profile                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ load_profile(profileName)                              │
│ (profileManager.js:77)                                 │
├─────────────────────────────────────────────────────────┤
│ 1. copy_settings(profileName)                          │
│    ├─ Get profiles[profileName]                        │
│    ├─ structuredClone(profile)                         │
│    └─ Remove global_settings keys                      │
│                                                        │
│ 2. Object.assign(active_settings, profile_settings)   │
│    └─ Overwrites active settings with profile          │
│                                                        │
│ 3. set_settings('profile', profileName)                │
│    └─ Update current profile tracker                   │
│                                                        │
│ 4. Optional toast notification                         │
│    └─ "Switched to profile X"                          │
│                                                        │
│ 5. refresh_settings()                                  │
│    └─ Update UI with new profile values                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
                  [Done]
```

### 9.3 Profile Save Flow

```
┌─────────────────────────────────────────────────────────┐
│ User Modifies Settings in UI                           │
│ (Changes prompts, toggles, connection profiles, etc.)  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Automatic Save (Debounced)                             │
│ (settingsManager.js:saveSettingsDebounced)             │
│                                                        │
│ OR                                                     │
│                                                        │
│ Manual Save Profile Button Click                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ save_profile(profileName)                              │
│ (profileManager.js:61)                                 │
├─────────────────────────────────────────────────────────┤
│ 1. Get target profile name                             │
│    └─ Use provided name OR current active profile      │
│                                                        │
│ 2. copy_settings()                                     │
│    ├─ structuredClone(active_settings)                 │
│    ├─ Remove global_settings keys                      │
│    │   (profiles, character_profiles, chat_profiles,   │
│    │    profile, notify_on_profile_switch, etc.)       │
│    └─ Returns ~117 profile-specific settings           │
│                                                        │
│ 3. Save to profiles object                             │
│    └─ profiles[targetProfile] = copied_settings        │
│                                                        │
│ 4. check_preset_valid()                                │
│    └─ Validate connection profiles are valid           │
│                                                        │
│ 5. Persist to disk                                     │
│    └─ saveSettingsDebounced()                          │
│       └─ SillyTavern saves extension_settings to       │
│          settings.json                                 │
└─────────────────────────────────────────────────────────┘
```

### 9.4 Update Scenario Flow

```
┌─────────────────────────────────────────────────────────┐
│ Developer Ships New Version                            │
│ - New defaultSettings.js loaded                        │
│ - Improved prompts                                     │
│ - New settings added                                   │
│ - Some settings removed                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ User Loads Extension                                   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ initialize_settings()                                   │
│ ├─ extension_settings.auto_recap exists? → YES         │
│ └─ soft_reset_settings()                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Merge Active Settings                                  │
├─────────────────────────────────────────────────────────┤
│ Object.assign(                                         │
│   new_defaults,      ← v2.0 defaults                   │
│   global_settings,   ← profile mappings, etc.          │
│   old_settings       ← v1.0 user settings (WINS)       │
│ )                                                      │
│                                                        │
│ Result for each setting:                               │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Setting A (user never set):                        │ │
│ │   new_defaults.A = "new value"                     │ │
│ │   old_settings: (doesn't have A)                   │ │
│ │   → Result: "new value" ✅                          │ │
│ ├────────────────────────────────────────────────────┤ │
│ │ Setting B (user customized):                       │ │
│ │   new_defaults.B = "improved default"              │ │
│ │   old_settings.B = "user custom"                   │ │
│ │   → Result: "user custom" ✅ (preserved)           │ │
│ ├────────────────────────────────────────────────────┤ │
│ │ Setting C (user has old default):                  │ │
│ │   new_defaults.C = "improved prompt v2"            │ │
│ │   old_settings.C = "old prompt v1"                 │ │
│ │   → Result: "old prompt v1" ❌ (stuck on old)      │ │
│ ├────────────────────────────────────────────────────┤ │
│ │ Setting D (removed from defaults):                 │ │
│ │   new_defaults: (doesn't have D)                   │ │
│ │   old_settings.D = "old value"                     │ │
│ │   → Result: "old value" ⚠️ (dead setting persists) │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ Merge Each Profile                                      │
├─────────────────────────────────────────────────────────┤
│ for (const [name, profile] of Object.entries(profiles)) │
│ {                                                       │
│   profiles[name] = Object.assign(                      │
│     new_defaults,  ← v2.0 defaults                     │
│     profile        ← v1.0 profile data (WINS)          │
│   );                                                   │
│ }                                                      │
│                                                        │
│ Result:                                                │
│ ✅ New settings added to all profiles                  │
│ ✅ User customizations preserved                       │
│ ❌ Users don't get improved defaults                   │
│ ⚠️ Dead settings persist                               │
│                                                        │
│ ❌ INACTIVE PROFILES NOT MIGRATED                      │
│    (Migration runs later, only on active settings)     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ load_profile('Default')                                │
│ └─ Loads Default profile into active settings          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│ migrateConnectionProfileSettings()                      │
├─────────────────────────────────────────────────────────┤
│ Migrates ONLY active settings:                         │
│   ✅ Default profile (loaded) → migrated               │
│   ❌ Other profiles (not loaded) → NOT migrated        │
│                                                        │
│ User later switches to "Claude-Profile":               │
│   ❌ ERROR: Old schema, expects new schema             │
└─────────────────────────────────────────────────────────┘
```

### 9.5 Profile Import/Export Flow

```
┌─────────────────────────────────────────────────────────┐
│ EXPORT FLOW                                            │
└─────────────────────────────────────────────────────────┘

User clicks "Export Profile"
         ↓
┌─────────────────────────────────────────────────────────┐
│ export_profile(profileName)                            │
│ (profileManager.js:99)                                 │
├─────────────────────────────────────────────────────────┤
│ 1. copy_settings(profileName)                          │
│    └─ Get profile data, remove global settings         │
│                                                        │
│ 2. JSON.stringify(settings, null, 2)                   │
│    └─ Pretty-print JSON                                │
│                                                        │
│ 3. download(data, 'ProfileName.json')                  │
│    └─ Trigger browser download                         │
└─────────────────────────────────────────────────────────┘
         ↓
   ProfileName.json downloaded
   (117+ settings, NO VERSION METADATA)


┌─────────────────────────────────────────────────────────┐
│ IMPORT FLOW                                            │
└─────────────────────────────────────────────────────────┘

User clicks "Import Profile", selects file
         ↓
┌─────────────────────────────────────────────────────────┐
│ import_profile(event)                                  │
│ (profileManager.js:116)                                │
├─────────────────────────────────────────────────────────┤
│ 1. Get file from input                                 │
│                                                        │
│ 2. Parse JSON                                          │
│    └─ parseJsonFile(file)                              │
│                                                        │
│ 3. ❌ NO VALIDATION                                    │
│    ├─ No structure check                               │
│    ├─ No version check                                 │
│    ├─ No migration                                     │
│    └─ No missing settings check                        │
│                                                        │
│ 4. Direct save                                         │
│    └─ profiles[name] = data                            │
│                                                        │
│ 5. Persist to disk                                     │
│    └─ set_settings('profiles', profiles)               │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ POTENTIAL ISSUES                                       │
├─────────────────────────────────────────────────────────┤
│ ❌ Old version profile:                                │
│    - Missing new settings → undefined errors           │
│    - Old connection profile format → type errors       │
│                                                        │
│ ❌ Invalid structure:                                  │
│    - Malformed JSON → parse errors                     │
│    - Wrong types → runtime crashes                     │
│                                                        │
│ ❌ Future version profile:                             │
│    - Unknown settings → silently ignored               │
│    - Newer schema → compatibility issues               │
└─────────────────────────────────────────────────────────┘
```

---

## 10. Recommendations

### 10.1 Critical (Pre-Release Requirements)

These changes are **required** before public release to ensure:
- Settings survive extension updates
- Schema can evolve safely
- User data is protected

#### 1. Add Settings Versioning

**What:**
- Add `_version` field to all profiles
- Track current schema version
- Enable version-gated migrations

**Implementation:**
```javascript
// defaultSettings.js
export const SETTINGS_VERSION = 1;

export const default_settings = {
  _version: SETTINGS_VERSION,
  _migrations_applied: [],
  // ... existing 117 settings
};

// Check version before loading
if (profile._version !== SETTINGS_VERSION) {
  profile = await migrateProfile(profile);
}
```

**Benefits:**
- ✅ Can detect schema changes
- ✅ Can track migration status
- ✅ Can warn about incompatible versions
- ✅ Can evolve schema safely

#### 2. Create Migration Registry

**What:**
- Centralize all migrations in one place
- Version each migration
- Track which migrations ran

**Implementation:**
```javascript
// settingsMigration.js
const migrations = [
  {
    id: 'connection-profiles-to-uuid',
    version: 1,
    description: 'Convert connection profile names to UUIDs',
    async migrate(settings) {
      // Existing migration logic
      return settings;
    }
  }
];

export async function migrateProfile(profile) {
  const applied = profile._migrations_applied || [];

  for (const migration of migrations) {
    if (applied.includes(migration.id)) continue;

    profile = await migration.migrate(profile);
    applied.push(migration.id);
  }

  profile._migrations_applied = applied;
  profile._version = SETTINGS_VERSION;
  return profile;
}
```

**Benefits:**
- ✅ Easy to add new migrations
- ✅ Clear migration history
- ✅ Testable in isolation
- ✅ Idempotent by design

#### 3. Migrate All Profiles on Update

**What:**
- Run migrations on ALL profiles, not just active
- Fix multi-profile migration gap

**Implementation:**
```javascript
// settingsManager.js:soft_reset_settings
function soft_reset_settings() {
  // ... existing active settings merge

  // NEW: Migrate all profiles
  const profiles = get_settings('profiles');
  for (const [name, profileData] of Object.entries(profiles)) {
    // Merge with defaults (add missing settings)
    let merged = Object.assign(
      structuredClone(default_settings),
      profileData
    );

    // Run migrations
    profiles[name] = await migrateProfile(merged);
  }
  set_settings('profiles', profiles);
}
```

**Benefits:**
- ✅ All profiles stay in sync
- ✅ No broken profiles when switching
- ✅ Consistent schema across all profiles

#### 4. Validate and Migrate Imported Profiles

**What:**
- Validate imported profile structure
- Auto-migrate to current version
- Show warnings for incompatible profiles

**Implementation:**
```javascript
// profileManager.js:import_profile
async function import_profile(e) {
  const file = e.target.files[0];
  const name = file.name.replace('.json', '');
  let data = await parseJsonFile(file);

  // 1. VALIDATE
  if (!data || typeof data !== 'object') {
    toast("Invalid profile file", "error");
    return;
  }

  // 2. CHECK VERSION
  const importedVersion = data._version || 0;
  if (importedVersion > SETTINGS_VERSION) {
    const proceed = await confirm(
      `This profile is from a newer version (v${importedVersion}). ` +
      `Some settings may not work. Continue?`
    );
    if (!proceed) return;
  }

  // 3. MERGE WITH DEFAULTS (add missing settings)
  data = Object.assign(structuredClone(default_settings), data);

  // 4. MIGRATE
  data = await migrateProfile(data);

  // 5. SAVE
  const profiles = get_settings('profiles');
  profiles[name] = data;
  set_settings('profiles', profiles);

  toast(`Profile "${name}" imported and migrated to v${data._version}`, 'success');
}
```

**Benefits:**
- ✅ Old profiles work correctly
- ✅ Missing settings added automatically
- ✅ Future version warning
- ✅ Safe import process

### 10.2 Recommended (Release Enhancement)

These changes improve user experience but aren't strictly required for stability.

#### 5. Add Prompt Versioning

**What:**
- Convert prompts from strings to versioned objects
- Track customization status
- Enable selective updates

**Implementation:**
```javascript
// Prompt structure
{
  text: "Prompt content...",
  version: 2,
  is_customized: false,
  original_default_version: 2,
  original_default_text: "Prompt content...",
  customized_at: null
}

// Backward compatibility
function getPromptText(prompt) {
  if (typeof prompt === 'string') {
    // Old format, auto-migrate
    return prompt;
  }
  return prompt.text;
}

// Migration to convert strings → objects
{
  id: 'prompt-versioning',
  version: 2,
  async migrate(settings) {
    const promptKeys = [
      'scene_recap_prompt',
      'running_scene_recap_prompt',
      // ... all prompt keys
    ];

    for (const key of promptKeys) {
      if (typeof settings[key] === 'string') {
        settings[key] = {
          text: settings[key],
          version: 1,
          is_customized: false,
          original_default_version: 1,
          original_default_text: default_settings[key].text,
          customized_at: null
        };
      }
    }

    return settings;
  }
}
```

**Benefits:**
- ✅ Can detect prompt improvements
- ✅ Can offer updates
- ✅ Can track customization
- ✅ Can compare with defaults

#### 6. Build Update Notification System

**What:**
- Check for new prompt versions on load
- Show update dialog
- Allow selective updates

**Implementation:**
```javascript
// On extension load
async function checkForPromptUpdates() {
  const updates = [];

  const promptKeys = Object.keys(default_prompts);
  for (const key of promptKeys) {
    const userPrompt = get_settings(key);
    const defaultPrompt = default_prompts[key];

    if (userPrompt.version < defaultPrompt.version) {
      updates.push({
        key,
        oldVersion: userPrompt.version,
        newVersion: defaultPrompt.version,
        is_customized: userPrompt.is_customized,
        changelog: defaultPrompt.changelog
      });
    }
  }

  if (updates.length > 0) {
    showUpdateDialog(updates);
  }
}

// Update dialog
function showUpdateDialog(updates) {
  const html = `
    <h3>Prompt Updates Available</h3>
    <p>${updates.length} prompts have improvements:</p>
    <ul>
      ${updates.map(u => `
        <li>
          <strong>${u.key}</strong> (v${u.oldVersion} → v${u.newVersion})
          ${u.is_customized ? '<span class="badge">⚠️ Customized</span>' : ''}
          <p>${u.changelog}</p>
          <button onclick="viewDiff('${u.key}')">View Changes</button>
          <button onclick="updatePrompt('${u.key}')">
            ${u.is_customized ? 'Update (lose custom)' : 'Update'}
          </button>
        </li>
      `).join('')}
    </ul>
    <button onclick="dismissUpdates()">Dismiss</button>
  `;

  showModal(html);
}
```

**Benefits:**
- ✅ Users aware of improvements
- ✅ Opt-in updates
- ✅ Informed decisions

#### 7. Add Customization Indicators

**What:**
- Show which prompts/settings are customized
- Add "Reset to Default" buttons
- Add diff view

**Implementation:**
```javascript
// UI indicator
function renderPromptSetting(key) {
  const prompt = get_settings(key);
  const isCustomized = prompt.is_customized;

  return `
    <div class="setting-row">
      <label>${key}</label>
      ${isCustomized ? '<span class="customized-badge">⚠️ Customized</span>' : ''}
      <button onclick="editPrompt('${key}')">Edit</button>
      ${isCustomized ? `
        <button onclick="resetToDefault('${key}')">Reset to Default</button>
        <button onclick="viewDiff('${key}')">Compare</button>
      ` : ''}
    </div>
  `;
}

// Reset function
function resetToDefault(key) {
  const confirm = await confirm(
    `Reset "${key}" to default? Your customizations will be lost.`
  );

  if (confirm) {
    const defaultPrompt = structuredClone(default_prompts[key]);
    set_settings(key, defaultPrompt);
    toast("Reset to default", "success");
    refresh_settings();
  }
}

// Diff view
function viewDiff(key) {
  const userPrompt = get_settings(key);
  const defaultPrompt = default_prompts[key];

  const diff = computeDiff(userPrompt.text, defaultPrompt.text);

  showModal(`
    <h3>Prompt Comparison: ${key}</h3>
    <div class="diff-view">
      <div class="diff-section">
        <h4>Your Custom Version</h4>
        <pre>${escapeHtml(userPrompt.text)}</pre>
      </div>
      <div class="diff-section">
        <h4>Current Default</h4>
        <pre>${escapeHtml(defaultPrompt.text)}</pre>
      </div>
      <div class="diff-section">
        <h4>Changes</h4>
        <pre>${renderDiff(diff)}</pre>
      </div>
    </div>
  `);
}
```

**Benefits:**
- ✅ Clear visibility
- ✅ Easy reset
- ✅ Side-by-side comparison

### 10.3 Nice-to-Have (Post-Release)

#### 8. Profile Cloning

**What:**
- "Duplicate Profile" button
- Clone current profile for experimentation

**Implementation:**
```javascript
function cloneProfile() {
  const currentProfile = get_settings('profile');
  const profiles = get_settings('profiles');

  let newName = `${currentProfile} (Copy)`;
  let i = 1;
  while (profiles[newName]) {
    newName = `${currentProfile} (Copy ${i})`;
    i++;
  }

  profiles[newName] = structuredClone(profiles[currentProfile]);
  set_settings('profiles', profiles);

  load_profile(newName);
  toast(`Profile "${newName}" created`, 'success');
}
```

#### 9. Settings Changelog

**What:**
- Document setting changes between versions
- Show changelog in UI

**Implementation:**
```javascript
// changelog.json
{
  "2.0.0": {
    "prompts": {
      "scene_recap_prompt": {
        "version": 2,
        "changes": "Improved JSON extraction reliability"
      }
    },
    "settings": {
      "auto_scene_break_minimum_scene_length": {
        "added": true,
        "description": "Control scene break sensitivity"
      }
    }
  }
}
```

#### 10. Migration Testing Suite

**What:**
- Automated tests for migrations
- Test schema evolution

**Implementation:**
```javascript
// tests/migrations.spec.js
test('migration: connection profiles to UUID', async () => {
  const oldProfile = {
    scene_recap_connection_profile: 'Default'
  };

  const migrated = await migrateProfile(oldProfile);

  expect(isUUID(migrated.scene_recap_connection_profile)).toBe(true);
});

test('migration: all profiles migrated', async () => {
  const settings = {
    profiles: {
      'Default': { connection_profile: 'Default' },
      'Claude': { connection_profile: 'Claude' }
    }
  };

  await soft_reset_settings();

  const profiles = get_settings('profiles');
  expect(isUUID(profiles['Default'].connection_profile)).toBe(true);
  expect(isUUID(profiles['Claude'].connection_profile)).toBe(true);
});
```

---

## 11. Implementation Roadmap

### Phase 1: Critical Pre-Release (1-2 weeks)

**Goal:** Enable safe schema evolution and protect user data

**Tasks:**
1. **Add Settings Versioning Infrastructure**
   - [x] Research: Document current system ← DONE
   - [ ] Add `_version` field to `default_settings`
   - [ ] Add `SETTINGS_VERSION` constant
   - [ ] Add `_migrations_applied` array

2. **Create Migration Registry**
   - [ ] Create migration registry structure
   - [ ] Move connection profile migration to registry
   - [ ] Implement `runMigrations()` function
   - [ ] Add migration tracking

3. **Fix Multi-Profile Migration**
   - [ ] Update `soft_reset_settings()` to migrate all profiles
   - [ ] Test with multiple profiles
   - [ ] Ensure inactive profiles migrate correctly

4. **Fix Import Validation**
   - [ ] Add JSON structure validation
   - [ ] Add version compatibility check
   - [ ] Add auto-migration on import
   - [ ] Add warning dialogs

5. **Testing**
   - [ ] Test fresh install
   - [ ] Test upgrade from current version
   - [ ] Test profile import/export
   - [ ] Test multiple profiles
   - [ ] Test migration idempotency

**Success Criteria:**
- ✅ All profiles migrate on update
- ✅ Imported profiles auto-migrate
- ✅ Version tracking works
- ✅ No data loss during updates

### Phase 2: Prompt Versioning (1 week)

**Goal:** Enable prompt updates while preserving customizations

**Tasks:**
1. **Prompt Metadata Structure**
   - [ ] Design prompt object structure
   - [ ] Implement backward compatibility helpers
   - [ ] Create migration: strings → objects

2. **Update Detection**
   - [ ] Add version to default prompts
   - [ ] Implement update checker
   - [ ] Track customization flag on edit

3. **Update UI**
   - [ ] Design update notification dialog
   - [ ] Implement update confirmation
   - [ ] Add "View Changes" functionality

4. **Testing**
   - [ ] Test prompt updates
   - [ ] Test customization detection
   - [ ] Test backward compatibility

**Success Criteria:**
- ✅ Prompts have version metadata
- ✅ Customizations detected
- ✅ Users notified of updates

### Phase 3: UX Improvements (1 week)

**Goal:** Improve settings management UX

**Tasks:**
1. **Customization Indicators**
   - [ ] Add badges for customized prompts
   - [ ] Add "Reset to Default" buttons
   - [ ] Style indicators

2. **Diff View**
   - [ ] Implement diff algorithm
   - [ ] Build diff UI
   - [ ] Add side-by-side comparison

3. **Testing**
   - [ ] Test reset functionality
   - [ ] Test diff accuracy
   - [ ] Test UI responsiveness

**Success Criteria:**
- ✅ Users can see customizations
- ✅ Users can reset to defaults
- ✅ Users can compare versions

### Phase 4: Polish (Post-Release)

**Goal:** Nice-to-have features

**Tasks:**
1. Profile cloning
2. Settings changelog display
3. Migration test suite
4. Documentation updates

---

## 12. Conclusion

### Summary

**Current State:**
- ✅ Well-designed profile system with strong foundations
- ✅ Settings preservation works correctly
- ⚠️ No versioning infrastructure limits schema evolution
- ⚠️ Users stuck on old prompts indefinitely
- ❌ Multi-profile migration broken

**For Release Readiness:**

**CRITICAL (Must Fix):**
1. Add settings versioning
2. Create migration registry
3. Fix multi-profile migration
4. Validate imported profiles

**RECOMMENDED (Should Fix):**
5. Add prompt versioning
6. Build update notifications
7. Add customization indicators

**NICE-TO-HAVE (Can Defer):**
8. Profile cloning
9. Settings changelog UI
10. Diff view

### Risk Mitigation

**Without Critical Fixes:**
- **HIGH RISK:** Schema changes break existing profiles
- **MEDIUM RISK:** Users never receive improvements
- **HIGH RISK:** Inactive profiles break on switch

**With Critical Fixes:**
- ✅ Can safely evolve schema
- ✅ User data protected
- ✅ All profiles stay in sync
- ✅ Clean upgrade path

### Next Steps

1. **Implement Phase 1** (Critical) - 1-2 weeks
2. **Test thoroughly** - Settings, profiles, migrations
3. **Implement Phase 2** (Recommended) - 1 week
4. **Release with versioning** - Safe schema evolution enabled
5. **Gather feedback** - Monitor for issues
6. **Implement Phase 3** - UX improvements

---

**End of Document**

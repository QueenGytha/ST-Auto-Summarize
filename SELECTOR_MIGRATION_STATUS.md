# Selector Centralization Migration - Status Document

**Last Updated**: 2025-01-06
**Project**: ST-Auto-Summarize Extension
**Task**: Centralize all selectors into two files to prevent AI hallucination and ensure specificity

---

## 🎯 OVERALL GOAL

Create a **single source of truth** for all DOM selectors used in the ST-Auto-Summarize extension by:

1. Adding `data-testid` attributes to all extension HTML elements
2. Creating `selectorsExtension.js` - Extension UI selectors (using data-testid)
3. Creating `selectorsSillyTavern.js` - SillyTavern UI selectors (using existing IDs)
4. Migrating ALL codebase references to use these centralized selector files
5. Preventing hardcoded selectors that could lead to false positives

**Why?** AI frequently fabricates or guesses selectors, leading to bugs. Centralized selectors force precision and prevent hallucination.

---

## 📚 CRITICAL REFERENCE DOCUMENTS

**You MUST read these before proceeding:**

1. `/docs/development/SELECTORS_GUIDE.md` - Complete selector strategy and rules
2. `/docs/development/PLAYWRIGHT_TESTING_GUIDE.md` - Testing approach context
3. `/docs/development/PLAYWRIGHT_TEST_WRITING_GUIDE.md` - Test writing patterns

**Key Files Modified:**
- `settings.html` - Extension settings HTML (✅ COMPLETED - has data-testid attributes)

**Key Files to Create:**
- `selectorsExtension.js` - Extension selectors (⏳ NEXT STEP)
- `selectorsSillyTavern.js` - SillyTavern selectors (⏳ NEXT STEP)

---

## ✅ PHASE 1: COMPLETED - HTML data-testid Attributes

**Status**: ✅ **COMPLETE** (100 data-testid attributes added to settings.html)

### What Was Done

Added `data-testid` attributes to **ALL 100 interactive elements** in `settings.html` following strict naming convention:

**Naming Convention Applied:**
- **Format**: `[feature]-[element]` or `[feature]-[action]`
- **Style**: lowercase, kebab-case
- **Examples**: `memory-toggle`, `profile-select`, `scene-edit-prompt`
- **Rule**: Each data-testid MUST be unique across entire extension

### Complete List of data-testid Attributes Added

#### Extension Container & Popout (2)
```html
data-testid="extension-settings-panel"  → #auto_summarize_memory_settings
data-testid="extension-popout"          → #auto_summarize_popout_button
```

#### Memory Controls (2)
```html
data-testid="memory-toggle"   → #toggle_chat_memory
data-testid="memory-refresh"  → #refresh_memory
```

#### Profile Management (11)
```html
data-testid="profile-select"             → #profile
data-testid="profile-import"             → #import_profile
data-testid="profile-export"             → #export_profile
data-testid="profile-import-file"        → #import_file
data-testid="profile-rename"             → #rename_profile
data-testid="profile-new"                → #new_profile
data-testid="profile-restore"            → #restore_profile
data-testid="profile-delete"             → #delete_profile
data-testid="profile-character-autoload" → #character_profile
data-testid="profile-chat-autoload"      → #chat_profile
data-testid="profile-notify-switch"      → #notify_on_profile_switch
```

#### First-Hop Proxy (2)
```html
data-testid="proxy-send-chat-details" → #first_hop_proxy_send_chat_details
data-testid="proxy-wrap-lorebook"     → #wrap_lorebook_entries
```

#### Message Filtering (4)
```html
data-testid="filter-include-user"   → #include_user_messages
data-testid="filter-include-hidden" → #include_system_messages
data-testid="filter-include-system" → #include_narrator_messages
data-testid="filter-message-length" → #message_length_threshold
```

#### Scene Summary (17)
```html
data-testid="scene-nav-width"              → #scene_summary_navigator_width
data-testid="scene-nav-font-size"          → #scene_summary_navigator_font_size
data-testid="scene-auto-name-detection"    → #scene_summary_auto_name
data-testid="scene-auto-name-manual"       → #scene_summary_auto_name_manual
data-testid="scene-default-collapsed"      → #scene_summary_default_collapsed
data-testid="scene-edit-prompt"            → #edit_scene_summary_prompt
data-testid="scene-prompt"                 → #scene_summary_prompt
data-testid="scene-default-prompt"         → #scene_summary_default_prompt
data-testid="scene-completion-preset"      → #scene_summary_completion_preset
data-testid="scene-connection-profile"     → #scene_summary_connection_profile
data-testid="scene-prefill"                → #scene_summary_prefill
data-testid="scene-message-types"          → #scene_summary_message_types
data-testid="scene-history-count"          → #scene_summary_history_count
data-testid="scene-history-count-display"  → #scene_summary_history_count_display
data-testid="scene-context-limit"          → #scene_summary_context_limit
data-testid="scene-context-type-percent"   → radio button
data-testid="scene-context-type-tokens"    → radio button
```

#### Running Scene Summary (17)
```html
data-testid="running-exclude-latest"         → #running_scene_summary_exclude_latest
data-testid="running-exclude-latest-display" → #running_scene_summary_exclude_latest_display
data-testid="running-auto-generate"          → #running_scene_summary_auto_generate
data-testid="running-show-navbar"            → #running_scene_summary_show_navbar
data-testid="running-view"                   → #view_running_scene_summary
data-testid="running-edit-prompt"            → #edit_running_scene_summary_prompt
data-testid="running-prompt"                 → #running_scene_summary_prompt
data-testid="running-completion-preset"      → #running_scene_summary_completion_preset
data-testid="running-connection-profile"     → #running_scene_summary_connection_profile
data-testid="running-prefill"                → #running_scene_summary_prefill
data-testid="running-position"               → #running_scene_summary_position
data-testid="running-depth"                  → #running_scene_summary_depth
data-testid="running-role"                   → #running_scene_summary_role
data-testid="running-scan"                   → #running_scene_summary_scan
data-testid="running-context-limit"          → #running_scene_summary_context_limit
data-testid="running-context-type-percent"   → radio button
data-testid="running-context-type-tokens"    → radio button
```

#### Auto Scene Break Detection (12)
```html
data-testid="auto-scene-on-load"           → #auto_scene_break_on_load
data-testid="auto-scene-on-message"        → #auto_scene_break_on_new_message
data-testid="auto-scene-generate-summary"  → #auto_scene_break_generate_summary
data-testid="auto-scene-message-offset"    → #auto_scene_break_message_offset
data-testid="auto-scene-offset-display"    → #auto_scene_break_message_offset_value
data-testid="auto-scene-recent-count"      → #auto_scene_break_recent_message_count
data-testid="auto-scene-check-which"       → #auto_scene_break_check_which_messages
data-testid="auto-scene-edit-prompt"       → #edit_auto_scene_break_prompt
data-testid="auto-scene-prompt"            → #auto_scene_break_prompt
data-testid="auto-scene-connection-profile" → #auto_scene_break_connection_profile
data-testid="auto-scene-completion-preset"  → #auto_scene_break_completion_preset
data-testid="auto-scene-prefill"            → #auto_scene_break_prefill
```

#### Summary Validation (7)
```html
data-testid="validation-enabled"           → #error_detection_enabled
data-testid="validation-scene-enabled"     → #scene_summary_error_detection_enabled
data-testid="validation-scene-edit-prompt" → #edit_scene_summary_error_detection_prompt
data-testid="validation-scene-preset"      → #scene_summary_error_detection_preset
data-testid="validation-scene-prefill"     → #scene_summary_error_detection_prefill
data-testid="validation-scene-retries"     → #scene_summary_error_detection_retries
data-testid="validation-scene-prompt"      → #scene_summary_error_detection_prompt
```

#### Auto-Hide (1)
```html
data-testid="auto-hide-scene-count" → #auto_hide_scene_count
```

#### Miscellaneous (2)
```html
data-testid="misc-default-enabled" → #default_chat_enabled
data-testid="misc-global-toggle"   → #use_global_toggle_state
```

#### Auto-Lorebooks (22)
```html
data-testid="lorebook-delete-on-chat"         → #autolorebooks-delete-on-chat-delete
data-testid="lorebook-auto-reorder"           → #autolorebooks-auto-reorder-alphabetically
data-testid="lorebook-name-template"          → #autolorebooks-name-template
data-testid="lorebook-entity-types-list"      → #autolorebooks-entity-types-list
data-testid="lorebook-entity-type-input"      → #autolorebooks-entity-type-input
data-testid="lorebook-add-entity-type"        → #autolorebooks-add-entity-type
data-testid="lorebook-restore-entity-types"   → #autolorebooks-restore-entity-types
data-testid="lorebook-skip-duplicates"        → #autolorebooks-summary-skip-duplicates
data-testid="lorebook-merge-connection"       → #autolorebooks-summary-merge-connection
data-testid="lorebook-merge-preset"           → #autolorebooks-summary-merge-preset
data-testid="lorebook-merge-prefill"          → #autolorebooks-summary-merge-prefill
data-testid="lorebook-merge-prompt"           → #autolorebooks-summary-merge-prompt
data-testid="lorebook-lookup-connection"      → #autolorebooks-summary-lorebook-entry-lookup-connection
data-testid="lorebook-lookup-preset"          → #autolorebooks-summary-lorebook-entry-lookup-preset
data-testid="lorebook-lookup-prefill"         → #autolorebooks-summary-lorebook-entry-lookup-prefill
data-testid="lorebook-lookup-prompt"          → #autolorebooks-summary-lorebook-entry-lookup-prompt
data-testid="lorebook-restore-lookup-prompt"  → #restore-summary-triage-prompt
data-testid="lorebook-dedupe-connection"      → #autolorebooks-summary-entry-deduplicate-connection
data-testid="lorebook-dedupe-preset"          → #autolorebooks-summary-entry-deduplicate-preset
data-testid="lorebook-dedupe-prefill"         → #autolorebooks-summary-entry-deduplicate-prefill
data-testid="lorebook-dedupe-prompt"          → #autolorebooks-summary-entry-deduplicate-prompt
data-testid="lorebook-restore-dedupe-prompt"  → #restore-summary-entry-deduplicate-prompt
```

#### Restore Defaults (1)
```html
data-testid="settings-restore-defaults" → #revert_settings
```

---

## ⏳ PHASE 2: IN PROGRESS - Create Selector Files

**Status**: ⏳ **NEXT STEP**

### Step 2.1: Create `selectorsExtension.js`

**Location**: `/public/scripts/extensions/third-party/ST-Auto-Summarize/selectorsExtension.js`

**Purpose**: Single source of truth for ALL extension UI selectors

**Structure Template**:
```javascript
/**
 * Extension UI Selectors
 *
 * CRITICAL RULES:
 * - All selectors use data-testid attributes
 * - Format: [data-testid="selector-name"]
 * - NEVER modify without updating corresponding HTML
 * - NEVER add generic class selectors (.mes, .mes_text, etc.)
 * - ONLY specific, unique selectors allowed
 */

export const selectorsExtension = {
  // Main container
  settings: {
    panel: '[data-testid="extension-settings-panel"]',     // #auto_summarize_memory_settings
    popout: '[data-testid="extension-popout"]',            // #auto_summarize_popout_button
    restoreDefaults: '[data-testid="settings-restore-defaults"]', // #revert_settings
  },

  // Memory controls
  memory: {
    toggle: '[data-testid="memory-toggle"]',   // #toggle_chat_memory
    refresh: '[data-testid="memory-refresh"]', // #refresh_memory
  },

  // Profile management
  profiles: {
    select: '[data-testid="profile-select"]',              // #profile
    import: '[data-testid="profile-import"]',              // #import_profile
    export: '[data-testid="profile-export"]',              // #export_profile
    importFile: '[data-testid="profile-import-file"]',     // #import_file
    rename: '[data-testid="profile-rename"]',              // #rename_profile
    new: '[data-testid="profile-new"]',                    // #new_profile
    restore: '[data-testid="profile-restore"]',            // #restore_profile
    delete: '[data-testid="profile-delete"]',              // #delete_profile
    characterAutoload: '[data-testid="profile-character-autoload"]', // #character_profile
    chatAutoload: '[data-testid="profile-chat-autoload"]', // #chat_profile
    notifySwitch: '[data-testid="profile-notify-switch"]', // #notify_on_profile_switch
  },

  // Proxy settings
  proxy: {
    sendChatDetails: '[data-testid="proxy-send-chat-details"]', // #first_hop_proxy_send_chat_details
    wrapLorebook: '[data-testid="proxy-wrap-lorebook"]',        // #wrap_lorebook_entries
  },

  // Message filtering
  filter: {
    includeUser: '[data-testid="filter-include-user"]',     // #include_user_messages
    includeHidden: '[data-testid="filter-include-hidden"]', // #include_system_messages
    includeSystem: '[data-testid="filter-include-system"]', // #include_narrator_messages
    messageLength: '[data-testid="filter-message-length"]', // #message_length_threshold
  },

  // Scene summary
  scene: {
    navWidth: '[data-testid="scene-nav-width"]',                // #scene_summary_navigator_width
    navFontSize: '[data-testid="scene-nav-font-size"]',         // #scene_summary_navigator_font_size
    autoNameDetection: '[data-testid="scene-auto-name-detection"]', // #scene_summary_auto_name
    autoNameManual: '[data-testid="scene-auto-name-manual"]',   // #scene_summary_auto_name_manual
    defaultCollapsed: '[data-testid="scene-default-collapsed"]', // #scene_summary_default_collapsed
    editPrompt: '[data-testid="scene-edit-prompt"]',            // #edit_scene_summary_prompt
    prompt: '[data-testid="scene-prompt"]',                     // #scene_summary_prompt
    defaultPrompt: '[data-testid="scene-default-prompt"]',      // #scene_summary_default_prompt
    completionPreset: '[data-testid="scene-completion-preset"]', // #scene_summary_completion_preset
    connectionProfile: '[data-testid="scene-connection-profile"]', // #scene_summary_connection_profile
    prefill: '[data-testid="scene-prefill"]',                   // #scene_summary_prefill
    messageTypes: '[data-testid="scene-message-types"]',        // #scene_summary_message_types
    historyCount: '[data-testid="scene-history-count"]',        // #scene_summary_history_count
    historyCountDisplay: '[data-testid="scene-history-count-display"]', // #scene_summary_history_count_display
    contextLimit: '[data-testid="scene-context-limit"]',        // #scene_summary_context_limit
    contextTypePercent: '[data-testid="scene-context-type-percent"]', // radio
    contextTypeTokens: '[data-testid="scene-context-type-tokens"]',   // radio
  },

  // Running scene summary
  running: {
    excludeLatest: '[data-testid="running-exclude-latest"]',         // #running_scene_summary_exclude_latest
    excludeLatestDisplay: '[data-testid="running-exclude-latest-display"]', // #running_scene_summary_exclude_latest_display
    autoGenerate: '[data-testid="running-auto-generate"]',           // #running_scene_summary_auto_generate
    showNavbar: '[data-testid="running-show-navbar"]',               // #running_scene_summary_show_navbar
    view: '[data-testid="running-view"]',                            // #view_running_scene_summary
    editPrompt: '[data-testid="running-edit-prompt"]',               // #edit_running_scene_summary_prompt
    prompt: '[data-testid="running-prompt"]',                        // #running_scene_summary_prompt
    completionPreset: '[data-testid="running-completion-preset"]',   // #running_scene_summary_completion_preset
    connectionProfile: '[data-testid="running-connection-profile"]', // #running_scene_summary_connection_profile
    prefill: '[data-testid="running-prefill"]',                      // #running_scene_summary_prefill
    position: '[data-testid="running-position"]',                    // #running_scene_summary_position
    depth: '[data-testid="running-depth"]',                          // #running_scene_summary_depth
    role: '[data-testid="running-role"]',                            // #running_scene_summary_role
    scan: '[data-testid="running-scan"]',                            // #running_scene_summary_scan
    contextLimit: '[data-testid="running-context-limit"]',           // #running_scene_summary_context_limit
    contextTypePercent: '[data-testid="running-context-type-percent"]', // radio
    contextTypeTokens: '[data-testid="running-context-type-tokens"]',   // radio
  },

  // Auto scene break detection
  autoScene: {
    onLoad: '[data-testid="auto-scene-on-load"]',               // #auto_scene_break_on_load
    onMessage: '[data-testid="auto-scene-on-message"]',         // #auto_scene_break_on_new_message
    generateSummary: '[data-testid="auto-scene-generate-summary"]', // #auto_scene_break_generate_summary
    messageOffset: '[data-testid="auto-scene-message-offset"]', // #auto_scene_break_message_offset
    offsetDisplay: '[data-testid="auto-scene-offset-display"]', // #auto_scene_break_message_offset_value
    recentCount: '[data-testid="auto-scene-recent-count"]',     // #auto_scene_break_recent_message_count
    checkWhich: '[data-testid="auto-scene-check-which"]',       // #auto_scene_break_check_which_messages
    editPrompt: '[data-testid="auto-scene-edit-prompt"]',       // #edit_auto_scene_break_prompt
    prompt: '[data-testid="auto-scene-prompt"]',                // #auto_scene_break_prompt
    connectionProfile: '[data-testid="auto-scene-connection-profile"]', // #auto_scene_break_connection_profile
    completionPreset: '[data-testid="auto-scene-completion-preset"]',   // #auto_scene_break_completion_preset
    prefill: '[data-testid="auto-scene-prefill"]',              // #auto_scene_break_prefill
  },

  // Validation
  validation: {
    enabled: '[data-testid="validation-enabled"]',             // #error_detection_enabled
    sceneEnabled: '[data-testid="validation-scene-enabled"]',  // #scene_summary_error_detection_enabled
    sceneEditPrompt: '[data-testid="validation-scene-edit-prompt"]', // #edit_scene_summary_error_detection_prompt
    scenePreset: '[data-testid="validation-scene-preset"]',    // #scene_summary_error_detection_preset
    scenePrefill: '[data-testid="validation-scene-prefill"]',  // #scene_summary_error_detection_prefill
    sceneRetries: '[data-testid="validation-scene-retries"]',  // #scene_summary_error_detection_retries
    scenePrompt: '[data-testid="validation-scene-prompt"]',    // #scene_summary_error_detection_prompt
  },

  // Auto-hide
  autoHide: {
    sceneCount: '[data-testid="auto-hide-scene-count"]', // #auto_hide_scene_count
  },

  // Miscellaneous
  misc: {
    defaultEnabled: '[data-testid="misc-default-enabled"]', // #default_chat_enabled
    globalToggle: '[data-testid="misc-global-toggle"]',     // #use_global_toggle_state
  },

  // Auto-Lorebooks
  lorebook: {
    deleteOnChat: '[data-testid="lorebook-delete-on-chat"]',         // #autolorebooks-delete-on-chat-delete
    autoReorder: '[data-testid="lorebook-auto-reorder"]',            // #autolorebooks-auto-reorder-alphabetically
    nameTemplate: '[data-testid="lorebook-name-template"]',          // #autolorebooks-name-template
    entityTypesList: '[data-testid="lorebook-entity-types-list"]',   // #autolorebooks-entity-types-list
    entityTypeInput: '[data-testid="lorebook-entity-type-input"]',   // #autolorebooks-entity-type-input
    addEntityType: '[data-testid="lorebook-add-entity-type"]',       // #autolorebooks-add-entity-type
    restoreEntityTypes: '[data-testid="lorebook-restore-entity-types"]', // #autolorebooks-restore-entity-types
    skipDuplicates: '[data-testid="lorebook-skip-duplicates"]',      // #autolorebooks-summary-skip-duplicates
    mergeConnection: '[data-testid="lorebook-merge-connection"]',    // #autolorebooks-summary-merge-connection
    mergePreset: '[data-testid="lorebook-merge-preset"]',            // #autolorebooks-summary-merge-preset
    mergePrefill: '[data-testid="lorebook-merge-prefill"]',          // #autolorebooks-summary-merge-prefill
    mergePrompt: '[data-testid="lorebook-merge-prompt"]',            // #autolorebooks-summary-merge-prompt
    lookupConnection: '[data-testid="lorebook-lookup-connection"]',  // #autolorebooks-summary-lorebook-entry-lookup-connection
    lookupPreset: '[data-testid="lorebook-lookup-preset"]',          // #autolorebooks-summary-lorebook-entry-lookup-preset
    lookupPrefill: '[data-testid="lorebook-lookup-prefill"]',        // #autolorebooks-summary-lorebook-entry-lookup-prefill
    lookupPrompt: '[data-testid="lorebook-lookup-prompt"]',          // #autolorebooks-summary-lorebook-entry-lookup-prompt
    restoreLookupPrompt: '[data-testid="lorebook-restore-lookup-prompt"]', // #restore-summary-triage-prompt
    dedupeConnection: '[data-testid="lorebook-dedupe-connection"]',  // #autolorebooks-summary-entry-deduplicate-connection
    dedupePreset: '[data-testid="lorebook-dedupe-preset"]',          // #autolorebooks-summary-entry-deduplicate-preset
    dedupePrefill: '[data-testid="lorebook-dedupe-prefill"]',        // #autolorebooks-summary-entry-deduplicate-prefill
    dedupePrompt: '[data-testid="lorebook-dedupe-prompt"]',          // #autolorebooks-summary-entry-deduplicate-prompt
    restoreDedupePrompt: '[data-testid="lorebook-restore-dedupe-prompt"]', // #restore-summary-entry-deduplicate-prompt
  },
};
```

**CRITICAL RULES for selectorsExtension.js:**
- ✅ ONLY use `[data-testid="..."]` format
- ✅ EVERY selector must map to an existing data-testid in settings.html
- ❌ NEVER use ID selectors (#element-id)
- ❌ NEVER use generic class selectors (.mes, .group_member, etc.)
- ❌ NO dynamic selectors - only static HTML elements

---

### Step 2.2: Create `selectorsSillyTavern.js`

**Location**: `/public/scripts/extensions/third-party/ST-Auto-Summarize/selectorsSillyTavern.js`

**Purpose**: Single source of truth for SillyTavern UI selectors

**CRITICAL**: Only include selectors that are:
- ✅ Unique IDs (e.g., `#send_but`, `#mes_stop`, `#chat`)
- ✅ Specific tag+ID combos (e.g., `div#chat`)
- ✅ Specific attribute selectors with dynamic values (e.g., `div[mesid="${id}"]`)
- ❌ NEVER generic classes (`.mes`, `.mes_text`, `.group_member` are FORBIDDEN)

**Structure Template**:
```javascript
/**
 * SillyTavern UI Selectors
 *
 * CRITICAL RULES:
 * - ONLY specific, unique selectors
 * - Uses ST's existing IDs and specific patterns
 * - NO GENERIC CLASSES (.mes, .mes_text, .group_member, etc.)
 * - Track ST version for maintenance
 * - May break when ST updates
 */

export const selectorsSillyTavern = {
  // Version tracking
  version: {
    current: '1.12.0',        // Update when ST version changes
    lastUpdated: '2025-01-06',
  },

  // Chat elements (ONLY specific selectors)
  chat: {
    container: 'div#chat',                        // ✅ Specific tag+ID
    containerId: '#chat',                         // ✅ Unique ID
    sendButton: '#send_but',                      // ✅ Unique ID
    stopButton: '#mes_stop',                      // ✅ Unique ID
    sendTextarea: '#send_textarea',               // ✅ Unique ID
    messageTemplate: '#message_template',         // ✅ Unique ID
    messageByIdAttr: (id) => `div[mesid="${id}"]`, // ✅ Specific attribute selector with parameter
    // ❌ FORBIDDEN: .mes, .mes_text, .mes_buttons (too generic, false positives)
  },

  // Group chat (ONLY specific selectors)
  groupChat: {
    memberTemplate: '#group_member_template',     // ✅ Unique ID
    membersContainer: '#rm_group_members',        // ✅ Unique ID
    // ❌ FORBIDDEN: .group_member, .group_member_icon (too generic)
  },

  // Settings & Extensions
  settings: {
    extensionsMenu: '#extensionsMenu',            // ✅ Unique ID
    extensionsSettings: '#extensions_settings2',  // ✅ Unique ID
    sysSettingsButton: '#sys-settings-button',    // ✅ Unique ID
    connectionProfiles: '#connection_profiles',   // ✅ Unique ID (within sys-settings)
  },

  // UI elements
  ui: {
    sheld: '#sheld',                              // ✅ Unique ID
    zoomedAvatarTemplate: '#zoomed_avatar_template', // ✅ Unique ID
    body: 'body',                                 // ✅ Unique tag
  },
};
```

**Files Currently Using ST Selectors** (need migration):
- `index.js` - Uses `#send_but`, `#mes_stop`, `#send_textarea`
- `buttonBindings.js` - Uses `div#chat`, `#group_member_template`, `#rm_group_members`, `#extensionsMenu`
- `messageVisuals.js` - Uses `#chat`, `div[mesid="${index}"]`
- `sceneBreak.js` - Uses `div#chat`, `#chat`, `div[mesid="${index}"]`
- `sceneNavigator.js` - Uses `#chat`, `div[mesid]`, `#sheld`
- `connectionProfiles.js` - Uses `#sys-settings-button`, `#connection_profiles`
- `popout.js` - Uses `#zoomed_avatar_template`, `body`
- `operationQueueUI.js` - Uses `#sheld`, `body`
- `runningSceneSummaryUI.js` - Uses `#sheld`
- `lorebookViewer.js` - Uses `div#chat`
- `operationHandlers.js` - Uses `div[mesid="${index}"]`
- `autoSceneBreakDetection.js` - Uses `div[mesid]`

**DO NOT INCLUDE** (too generic, will cause false positives):
- ❌ `.mes` - Could match multiple elements
- ❌ `.mes_text` - Could match multiple elements
- ❌ `.mes_buttons` - Could match multiple elements
- ❌ `.extraMesButtons` - Could match multiple elements
- ❌ `.group_member` - Could match multiple elements
- ❌ `.group_member_icon` - Could match multiple elements

---

### Step 2.3: Update `index.js` (Barrel Exports)

**Add to existing index.js**:
```javascript
// Export selector files
export { selectorsExtension } from './selectorsExtension.js';
export { selectorsSillyTavern } from './selectorsSillyTavern.js';
```

This allows all other modules to import via:
```javascript
import { selectorsExtension, selectorsSillyTavern } from './index.js';
```

---

## ⏳ PHASE 3: TODO - Migrate All Code References

**Status**: ⏳ **FUTURE STEP**

### Files Requiring Migration (~20+ files)

**CRITICAL**: Every file using jQuery/DOM selectors must:
1. Import selector files: `import { selectorsExtension, selectorsSillyTavern } from './index.js';`
2. Replace ALL hardcoded selectors with references
3. Verify NO false positives possible

**High-Priority Files** (Heavy selector usage):
1. `profileUI.js` - 30+ selectors (mostly extension)
2. `settingsUI.js` - 50+ selectors (mostly extension)
3. `sceneBreak.js` - 40+ selectors (mix of extension & ST)
4. `operationQueueUI.js` - 20+ selectors (mostly extension)
5. `runningSceneSummaryUI.js` - 15+ selectors (mostly extension)
6. `buttonBindings.js` - 10+ selectors (mostly ST)
7. `messageVisuals.js` - 8+ selectors (mostly ST)
8. `lorebookViewer.js` - 5+ selectors (mostly ST)
9. `connectionProfiles.js` - 5+ selectors (ST)
10. `popout.js` - 5+ selectors (mix)

**Medium-Priority Files**:
- `entityTypeSettingsUI.js`
- `autoSceneBreakDetection.js`
- `operationHandlers.js`
- `sceneNavigator.js`
- `index.js` (ST API references only)

**Migration Pattern Examples**:

```javascript
// ❌ BEFORE (hardcoded - will be blocked by validation):
$('#profile').on('change', handler);
$('#toggle_chat_memory').on('click', handler);
$('#send_but').on('click', handler);

// ✅ AFTER (using selector files):
import { selectorsExtension, selectorsSillyTavern } from './index.js';

$(selectorsExtension.profiles.select).on('change', handler);
$(selectorsExtension.memory.toggle).on('click', handler);
$(selectorsSillyTavern.chat.sendButton).on('click', handler);
```

---

## 🚨 CRITICAL RULES - MUST FOLLOW

### Selector Specificity Rules

1. **NO GENERIC CLASS SELECTORS**
   - ❌ FORBIDDEN: `.mes`, `.mes_text`, `.group_member`, `.extraMesButtons`
   - **Why?** These match multiple elements and cause false positives
   - ✅ ALLOWED: Unique IDs, data-testid, specific tag+ID combos

2. **NO SHORTCUTS OR WORKAROUNDS**
   - ❌ FORBIDDEN: Fallback chains, partial selectors, "try this if that fails"
   - ✅ REQUIRED: Single, specific, provably unique selector

3. **NO HARDCODED SELECTORS IN CODE**
   - ❌ FORBIDDEN: `$('#element')`, `document.getElementById('element')`
   - ✅ REQUIRED: Import from selector files

4. **EXTENSION SELECTORS = data-testid ONLY**
   - All extension selectors MUST use `[data-testid="..."]` format
   - Corresponds to HTML attributes we just added

5. **ST SELECTORS = ONLY UNIQUE IDs**
   - Use existing ST IDs: `#send_but`, `#mes_stop`, `#chat`
   - NO generic classes from ST either

### Verification Checklist

Before marking Phase 2 complete:
- [ ] `selectorsExtension.js` exists with all 100+ selectors
- [ ] Every selector uses `[data-testid="..."]` format
- [ ] Every data-testid maps to settings.html exactly
- [ ] `selectorsSillyTavern.js` exists with ~15-20 selectors
- [ ] ZERO generic class selectors in selectorsSillyTavern.js
- [ ] `index.js` exports both selector files
- [ ] All selectors are provably unique (no false positives)

Before marking Phase 3 complete:
- [ ] All ~20 files import selector files
- [ ] ZERO hardcoded selectors remain in codebase
- [ ] All `$('#...')` replaced with `$(selectorsExtension.*)`
- [ ] All ST selectors use `selectorsSillyTavern.*`
- [ ] Validation script passes (when implemented)
- [ ] Manual verification: Each selector targets correct element

---

## 📋 NEXT SESSION ACTION PLAN

### Step 1: Create selectorsExtension.js

**File**: `selectorsExtension.js`

**Actions**:
1. Create new file in extension root directory
2. Copy structure from this document (see "Step 2.1" above)
3. Add ALL 100 selectors from the complete list above
4. Verify format: `[data-testid="selector-name"]`
5. Verify naming matches settings.html exactly
6. Add JSDoc comments explaining critical rules

### Step 2: Create selectorsSillyTavern.js

**File**: `selectorsSillyTavern.js`

**Actions**:
1. Create new file in extension root directory
2. Copy structure from this document (see "Step 2.2" above)
3. Add ONLY unique ST selectors from "Files Currently Using ST Selectors" list
4. DO NOT add generic classes (`.mes`, `.group_member`, etc.)
5. Add version tracking
6. Add JSDoc comments explaining critical rules

### Step 3: Update index.js

**File**: `index.js`

**Actions**:
1. Add imports for both selector files
2. Add re-exports via barrel pattern
3. Verify other modules can import from `./index.js`

### Step 4: Verify

**Verification**:
1. Confirm both selector files exist
2. Confirm all data-testid values exist in settings.html
3. Confirm ZERO generic class selectors
4. Confirm index.js exports both files
5. Run: `grep -E '\.(mes|group_member)' selectorsExtension.js selectorsSillyTavern.js`
   - Should return ZERO results

---

## 📊 PROGRESS TRACKING

| Phase | Task | Status | Completion |
|-------|------|--------|------------|
| 1 | Add data-testid to settings.html | ✅ DONE | 100% (100/100 attributes) |
| 2.1 | Create selectorsExtension.js | ⏳ NEXT | 0% |
| 2.2 | Create selectorsSillyTavern.js | ⏳ NEXT | 0% |
| 2.3 | Update index.js | ⏳ NEXT | 0% |
| 3 | Migrate all code references | 🔲 TODO | 0% (~20 files) |
| 4 | Create validation script | 🔲 TODO | 0% |
| 5 | Verify no hardcoded selectors | 🔲 TODO | 0% |

---

## 🔍 CONTEXT FOR AI

**If you are Claude reading this document in a fresh session:**

1. **What has been done**: All HTML elements in `settings.html` now have `data-testid` attributes (100 total) following kebab-case naming convention.

2. **What you need to do next**: Create two selector files (`selectorsExtension.js` and `selectorsSillyTavern.js`) that centralize all DOM selectors.

3. **Why this matters**: Without centralized selectors, you (AI) tend to fabricate or guess selectors, causing bugs. This forces you to use exact, verified selectors.

4. **Critical constraints**:
   - NO generic class selectors (`.mes`, `.group_member`, etc.)
   - ONLY specific, unique selectors
   - Extension selectors use data-testid format: `[data-testid="name"]`
   - ST selectors use unique IDs: `#send_but`, `div#chat`

5. **Reference documents**: Read `SELECTORS_GUIDE.md` before starting

6. **Your task**: Follow "NEXT SESSION ACTION PLAN" above, starting with Step 1

---

## 📝 FINAL NOTES

- **DO NOT** skip validation steps
- **DO NOT** use generic class selectors
- **DO NOT** create workarounds or shortcuts
- **DO** verify every selector is specific and unique
- **DO** follow the naming conventions exactly
- **DO** check settings.html for exact data-testid values

**This is a precision task. False positives defeat the entire purpose.**

End of document.

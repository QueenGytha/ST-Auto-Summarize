// Extension UI Selectors
// Single source of truth for all extension UI selectors
// All selectors use data-testid attributes in [data-testid="name"] format

// Helper function to scope selectors to settings content area
// This is used for popout vs inline settings disambiguation
export function scopeToSettings(selector, settingsClass) {
  return `.${settingsClass} ${selector}`;
}

// Helper function to get artifact selector for operation type
export function getArtifactSelector(operationType) {
  const selectorMap = {
    'scene_recap': '[data-testid="artifact-scene-recap"]',
    'scene_recap_error_detection': '[data-testid="artifact-scene-recap-error"]',
    'auto_scene_break': '[data-testid="artifact-auto-scene-break"]',
    'running_scene_recap': '[data-testid="artifact-running-scene-recap"]',
    'auto_lorebooks_recap_merge': '[data-testid="artifact-lorebooks-merge"]',
    'auto_lorebooks_recap_lorebook_entry_lookup': '[data-testid="artifact-lorebooks-lookup"]',
    'auto_lorebooks_recap_lorebook_entry_deduplicate': '[data-testid="artifact-lorebooks-deduplicate"]',
    'auto_lorebooks_bulk_populate': '[data-testid="artifact-lorebooks-bulk-populate"]',
    'auto_lorebooks_recap_lorebook_entry_compaction': '[data-testid="artifact-lorebooks-compaction"]'
  };
  return selectorMap[operationType];
}

export const selectorsExtension = {
  // Main container & settings
  settings: {
    panel: '[data-testid="extension-settings-panel"]',  // #auto_recap_memory_settings
    popout: '[data-testid="extension-popout"]',         // #auto_recap_popout_button
    restoreDefaults: '[data-testid="settings-restore-defaults"]',  // #revert_settings
  },

  // Memory controls
  memory: {
    toggle: '[data-testid="memory-toggle"]',    // #toggle_chat_memory
    refresh: '[data-testid="memory-refresh"]',  // #refresh_memory
    text: '.auto_recap_memory_text',        // General class applied to memory text elements
  },

  // Profile management
  profiles: {
    select: '[data-testid="profile-select"]',     // #profile
    import: '[data-testid="profile-import"]',     // #import_profile
    export: '[data-testid="profile-export"]',     // #export_profile
    importFile: '[data-testid="profile-import-file"]',  // #import_file
    rename: '[data-testid="profile-rename"]',     // #rename_profile
    new: '[data-testid="profile-new"]',           // #new_profile
    restore: '[data-testid="profile-restore"]',   // #restore_profile
    delete: '[data-testid="profile-delete"]',     // #delete_profile
    characterAutoload: '[data-testid="profile-character-autoload"]',  // #character_profile
    chatAutoload: '[data-testid="profile-chat-autoload"]',  // #chat_profile
    notifySwitch: '[data-testid="profile-notify-switch"]',  // #notify_on_profile_switch
  },

  // First-Hop Proxy Integration
  proxy: {
    manualOverride: '[data-testid="proxy-manual-override"]',  // #first_hop_proxy_manual_override
    suppressOtherLorebooks: '[data-testid="proxy-suppress-other-lorebooks"]',  // #suppress_other_lorebooks
  },

  // Token Counting Settings
  tokenCounting: {
    correctionFactor: '[data-testid="token-correction-factor"]',  // #tokenizer_correction_factor
  },

  // Operations Presets
  operationsPresets: {
    // Preset selector and controls
    section: '[data-testid="operations-preset-section"]',              // Main preset section
    selector: '[data-testid="operations-preset-selector"]',            // #auto_recap_preset_selector
    badge: '[data-testid="operations-preset-badge"]',                  // #auto_recap_preset_source_badge
    description: '[data-testid="operations-preset-description"]',      // #auto_recap_preset_description

    // Preset action buttons
    save: '[data-testid="operations-preset-save"]',                    // #auto_recap_preset_save
    rename: '[data-testid="operations-preset-rename"]',                // #auto_recap_preset_rename
    delete: '[data-testid="operations-preset-delete"]',                // #auto_recap_preset_delete
    import: '[data-testid="operations-preset-import"]',                // #auto_recap_preset_import
    export: '[data-testid="operations-preset-export"]',                // #auto_recap_preset_export
    duplicate: '[data-testid="operations-preset-duplicate"]',          // #auto_recap_preset_duplicate
    stickyCharacter: '[data-testid="operations-preset-sticky-character"]',  // #auto_recap_preset_sticky_character
    stickyChat: '[data-testid="operations-preset-sticky-chat"]',       // #auto_recap_preset_sticky_chat
    importFile: '[data-testid="operations-preset-import-file"]',       // #auto_recap_preset_import_file

    // Operation type sections
    opSceneRecap: '[data-testid="operation-type-scene-recap"]',
    opSceneRecapError: '[data-testid="operation-type-scene-recap-error"]',
    opAutoSceneBreak: '[data-testid="operation-type-auto-scene-break"]',
    opRunningSceneRecap: '[data-testid="operation-type-running-scene-recap"]',
    opLorebooksMerge: '[data-testid="operation-type-lorebooks-merge"]',
    opLorebooksLookup: '[data-testid="operation-type-lorebooks-lookup"]',
    opLorebooksDeduplicate: '[data-testid="operation-type-lorebooks-deduplicate"]',
    opLorebooksBulkPopulate: '[data-testid="operation-type-lorebooks-bulk-populate"]',

    // Artifact selectors
    artifactSceneRecap: '[data-testid="artifact-scene-recap"]',                          // #auto_recap_artifact_scene_recap
    artifactSceneRecapError: '[data-testid="artifact-scene-recap-error"]',               // #auto_recap_artifact_scene_recap_error_detection
    artifactAutoSceneBreak: '[data-testid="artifact-auto-scene-break"]',                 // #auto_recap_artifact_auto_scene_break
    artifactRunningSceneRecap: '[data-testid="artifact-running-scene-recap"]',           // #auto_recap_artifact_running_scene_recap
    artifactLorebooksMerge: '[data-testid="artifact-lorebooks-merge"]',                  // #auto_recap_artifact_auto_lorebooks_recap_merge
    artifactLorebooksLookup: '[data-testid="artifact-lorebooks-lookup"]',                // #auto_recap_artifact_auto_lorebooks_recap_lorebook_entry_lookup
    artifactLorebooksDeduplicate: '[data-testid="artifact-lorebooks-deduplicate"]',      // #auto_recap_artifact_auto_lorebooks_recap_lorebook_entry_deduplicate
    artifactLorebooksBulkPopulate: '[data-testid="artifact-lorebooks-bulk-populate"]',   // #auto_recap_artifact_auto_lorebooks_bulk_populate
    artifactLorebooksCompaction: '[data-testid="artifact-lorebooks-compaction"]',        // #auto_recap_artifact_auto_lorebooks_recap_lorebook_entry_compaction

    // Artifact action buttons (generic class-based selectors)
    artifactEditClass: '.auto_recap_artifact_edit',
    artifactRenameClass: '.auto_recap_artifact_rename',
    artifactDeleteClass: '.auto_recap_artifact_delete',
    artifactDuplicateClass: '.auto_recap_artifact_duplicate',

    // Artifact Editor Modal
    modal: '[data-testid="artifact-editor-modal"]',                    // #auto_recap_artifact_editor_modal
    modalBackdrop: '.auto_recap_artifact_editor_backdrop',             // Modal backdrop
    modalTitle: '[data-testid="artifact-editor-title"]',               // #auto_recap_artifact_editor_title
    modalClose: '[data-testid="artifact-editor-close"]',               // #auto_recap_artifact_editor_close
    modalName: '[data-testid="artifact-editor-name"]',                 // #auto_recap_artifact_editor_name
    modalDescription: '[data-testid="artifact-editor-description"]',   // #auto_recap_artifact_editor_description
    modalPrompt: '[data-testid="artifact-editor-prompt"]',             // #auto_recap_artifact_editor_prompt
    modalPrefill: '[data-testid="artifact-editor-prefill"]',           // #auto_recap_artifact_editor_prefill
    modalConnection: '[data-testid="artifact-editor-connection"]',     // #auto_recap_artifact_editor_connection
    modalPreset: '[data-testid="artifact-editor-preset"]',             // #auto_recap_artifact_editor_preset
    modalIncludeFlag: '[data-testid="artifact-editor-include-flag"]',  // #auto_recap_artifact_editor_include_flag
    modalForcedPrompt: '[data-testid="artifact-editor-forced-prompt"]',  // #auto_recap_artifact_editor_forced_prompt
    modalForcedPrefill: '[data-testid="artifact-editor-forced-prefill"]',  // #auto_recap_artifact_editor_forced_prefill
    modalForcedConnection: '[data-testid="artifact-editor-forced-connection"]',  // #auto_recap_artifact_editor_forced_connection
    modalForcedPreset: '[data-testid="artifact-editor-forced-preset"]',  // #auto_recap_artifact_editor_forced_preset
    modalForcedIncludeFlag: '[data-testid="artifact-editor-forced-include-flag"]',  // #auto_recap_artifact_editor_forced_include_flag
    modalForcedSection: '[data-testid="artifact-editor-forced-section"]',  // #auto_recap_artifact_editor_forced_section
    modalSave: '[data-testid="artifact-editor-save"]',                 // #auto_recap_artifact_editor_save
    modalCancel: '[data-testid="artifact-editor-cancel"]',             // #auto_recap_artifact_editor_cancel
    modalMacroReferenceContent: '#auto_recap_macro_reference_content',  // Macro reference content container
  },

  // Miscellaneous Settings
  misc: {
    defaultEnabled: '[data-testid="misc-default-enabled"]',  // #default_chat_enabled
    globalToggle: '[data-testid="misc-global-toggle"]',      // #use_global_toggle_state
    compactionThreshold: '[data-testid="lorebook-compaction-threshold"]', // #lorebook_compaction_threshold
  },

  // Auto-Hide Settings
  autoHide: {
    sceneCount: '[data-testid="auto-hide-scene-count"]',  // #auto_hide_scene_count
  },

  // Validation Settings
  validation: {
    enabled: '[data-testid="validation-enabled"]',                    // #error_detection_enabled
    sceneEnabled: '[data-testid="validation-scene-enabled"]',         // #scene_recap_error_detection_enabled
    sceneRetries: '[data-testid="validation-scene-retries"]',         // #scene_recap_error_detection_retries
    errorDetectionSetting: '.error_detection_setting',                // Class for error detection settings
    // Legacy selectors for profileUI.js (UI elements removed, kept for backward compatibility)
    scenePreset: '[data-testid="validation-scene-preset"]',           // Removed from UI
  },

  // Scene Recap Settings
  scene: {
    navWidth: '[data-testid="scene-nav-width"]',                     // #scene_recap_navigator_width
    navFontSize: '[data-testid="scene-nav-font-size"]',              // #scene_recap_navigator_font_size
    defaultCollapsed: '[data-testid="scene-default-collapsed"]',     // #scene_recap_default_collapsed
    nameAppendRange: '[data-testid="scene-name-append-range"]',      // #scene_name_append_range
    includeActiveSettingLore: '[data-testid="scene-include-active-setting-lore"]',  // #scene_recap_include_active_setting_prompts
    messageTypes: '[data-testid="scene-message-types"]',             // #scene_recap_message_types
    historyCount: '[data-testid="scene-history-count"]',             // #scene_recap_history_count
    historyCountDisplay: '[data-testid="scene-history-count-display"]',  // #scene_recap_history_count_display
    // Legacy selectors for profileUI.js (UI elements removed, kept for backward compatibility)
    connectionProfile: '[data-testid="scene-connection-profile"]',   // Removed from UI
    completionPreset: '[data-testid="scene-completion-preset"]',     // Removed from UI
  },

  // Running Scene Recap Settings
  running: {
    excludeLatest: '[data-testid="running-exclude-latest"]',                  // #running_scene_recap_exclude_latest
    excludeLatestDisplay: '[data-testid="running-exclude-latest-display"]',   // #running_scene_recap_exclude_latest_display
    autoGenerate: '[data-testid="running-auto-generate"]',                    // #running_scene_recap_auto_generate
    showNavbar: '[data-testid="running-show-navbar"]',                        // #running_scene_recap_show_navbar
    view: '[data-testid="running-view"]',                                     // #view_running_scene_recap
    position: '[data-testid="running-position"]',                             // #running_scene_recap_position
    depth: '[data-testid="running-depth"]',                                   // #running_scene_recap_depth
    role: '[data-testid="running-role"]',                                     // #running_scene_recap_role
    scan: '[data-testid="running-scan"]',                                     // #running_scene_recap_scan
    // Legacy selectors for profileUI.js (UI elements removed, kept for backward compatibility)
    connectionProfile: '[data-testid="running-connection-profile"]',          // Removed from UI
    completionPreset: '[data-testid="running-completion-preset"]',            // Removed from UI
  },

  // Auto Scene Break Detection Settings
  autoScene: {
    onLoad: '[data-testid="auto-scene-on-load"]',                     // #auto_scene_break_on_load
    onMessage: '[data-testid="auto-scene-on-message"]',               // #auto_scene_break_on_new_message
    generateRecap: '[data-testid="auto-scene-generate-recap"]',   // #auto_scene_break_generate_recap
    messageOffset: '[data-testid="auto-scene-message-offset"]',       // #auto_scene_break_message_offset
    offsetDisplay: '[data-testid="auto-scene-offset-display"]',       // #auto_scene_break_message_offset_value
    checkWhich: '[data-testid="auto-scene-check-which"]',             // #auto_scene_break_check_which_messages
    minLength: '[data-testid="auto-scene-min-length"]',               // #auto_scene_break_minimum_scene_length
    minLengthDisplay: '[data-testid="auto-scene-min-length-display"]', // #auto_scene_break_minimum_scene_length_value
    // Legacy selectors for profileUI.js (UI elements removed, kept for backward compatibility)
    connectionProfile: '[data-testid="auto-scene-connection-profile"]',  // Removed from UI
    completionPreset: '[data-testid="auto-scene-completion-preset"]',    // Removed from UI
  },

  // Auto-Lorebooks Settings
  lorebook: {
    deleteOnChat: '[data-testid="lorebook-delete-on-chat"]',              // #autolorebooks-delete-on-chat-delete
    autoReorder: '[data-testid="lorebook-auto-reorder"]',                 // #autolorebooks-auto-reorder-alphabetically
    nameTemplate: '[data-testid="lorebook-name-template"]',               // #autolorebooks-name-template
    entityTypesList: '[data-testid="lorebook-entity-types-list"]',        // #autolorebooks-entity-types-list
    entityTypeInput: '[data-testid="lorebook-entity-type-input"]',        // #autolorebooks-entity-type-input
    addEntityType: '[data-testid="lorebook-add-entity-type"]',            // #autolorebooks-add-entity-type
    restoreEntityTypes: '[data-testid="lorebook-restore-entity-types"]',  // #autolorebooks-restore-entity-types
    skipDuplicates: '[data-testid="lorebook-skip-duplicates"]',           // #autolorebooks-recap-skip-duplicates
    entryExcludeRecursion: '[data-testid="lorebook-entry-exclude-recursion"]',  // #autolorebooks-entry-exclude-recursion
    entryPreventRecursion: '[data-testid="lorebook-entry-prevent-recursion"]',  // #autolorebooks-entry-prevent-recursion
    entryIgnoreBudget: '[data-testid="lorebook-entry-ignore-budget"]',          // #autolorebooks-entry-ignore-budget
    entrySticky: '[data-testid="lorebook-entry-sticky"]',                       // #autolorebooks-entry-sticky
    // Legacy selectors for profileUI.js (UI elements removed, kept for backward compatibility)
    mergeConnection: '[data-testid="lorebook-merge-connection"]',                // Removed from UI
    mergePreset: '[data-testid="lorebook-merge-preset"]',                        // Removed from UI
    mergeIncludePresetPrompts: '[data-testid="lorebook-merge-include-preset-prompts"]',  // Removed from UI
    mergePrefill: '[data-testid="lorebook-merge-prefill"]',                      // Removed from UI
    mergePrompt: '[data-testid="lorebook-merge-prompt"]',                        // Removed from UI
    lookupConnection: '[data-testid="lorebook-lookup-connection"]',              // Removed from UI
    lookupPreset: '[data-testid="lorebook-lookup-preset"]',                      // Removed from UI
    lookupIncludePresetPrompts: '[data-testid="lorebook-lookup-include-preset-prompts"]',  // Removed from UI
    lookupPrefill: '[data-testid="lorebook-lookup-prefill"]',                    // Removed from UI
    lookupPrompt: '[data-testid="lorebook-lookup-prompt"]',                      // Removed from UI
    dedupeConnection: '[data-testid="lorebook-dedupe-connection"]',              // Removed from UI
    dedupePreset: '[data-testid="lorebook-dedupe-preset"]',                      // Removed from UI
    dedupeIncludePresetPrompts: '[data-testid="lorebook-dedupe-include-preset-prompts"]',  // Removed from UI
    dedupePrefill: '[data-testid="lorebook-dedupe-prefill"]',                    // Removed from UI
    dedupePrompt: '[data-testid="lorebook-dedupe-prompt"]',                      // Removed from UI
  },

  // Operation Queue UI (dynamically created)
  queue: {
    panel: '[data-testid="queue-panel"]',                      // #shared_operation_queue_ui
    listContainer: '[data-testid="queue-list-container"]',     // #queue_list_container
    count: '[data-testid="queue-count"]',                      // #queue_count
    togglePause: '[data-testid="queue-toggle-pause"]',         // #queue_toggle_pause
    clearAll: '[data-testid="queue-clear-all"]',               // #queue_clear_all
    operationsList: '[data-testid="queue-operations-list"]',   // #queue_operations_list
    navbarToggle: '[data-testid="queue-navbar-toggle"]',       // #queue_navbar_toggle
    toggleVisibility: '[data-testid="queue-toggle-visibility"]', // #queue_toggle_visibility
    header: '[data-testid="queue-header"]',                    // .queue-header
  },

  // Running Scene Recap UI (dynamically created)
  runningUI: {
    versionSelector: '[data-testid="running-version-selector"]',  // #running_recap_version_selector
    editBtn: '[data-testid="running-edit-btn"]',                   // #running_recap_edit_btn
    scanBreaksBtn: '[data-testid="running-scan-breaks-btn"]',      // #running_recap_scan_breaks_btn
    clearAllBtn: '[data-testid="running-clear-all-btn"]',          // #running_recap_clear_all_btn
    clearDeleteLorebook: '[data-testid="clear-recaps-delete-lorebook"]',  // #clear_recaps_delete_lorebook
    editTextarea: '[data-testid="running-edit-textarea"]',         // #running_recap_edit_textarea
    controls: '[data-testid="running-recap-controls"]',          // .running-recap-controls
  },

  // Scene Navigator (dynamically created)
  sceneNav: {
    bar: '[data-testid="scene-navigator-bar"]',  // #scene-recap-navigator-bar
    linksContainer: '[data-testid="scene-nav-links-container"]',  // .scene-nav-links-container
  },

  // Scene Break (dynamically created)
  sceneBreak: {
    div: '[data-testid="scene-break-div"]',                          // .auto_recap_scene_break_div
    name: '[data-testid="scene-break-name"]',                        // .sceneBreak-name
    collapseToggle: '[data-testid="scene-collapse-toggle"]',         // .scene-collapse-toggle
    recapBox: '[data-testid="scene-recap-box"]',                 // .scene-recap-box
    startLink: '[data-testid="scene-start-link"]',                   // .scene-start-link
    previewRecap: '[data-testid="scene-preview-recap"]',         // .scene-preview-recap
    generateRecap: '[data-testid="scene-generate-recap"]',       // .scene-generate-recap
    rollbackRecap: '[data-testid="scene-rollback-recap"]',       // .scene-rollback-recap
    rollforwardRecap: '[data-testid="scene-rollforward-recap"]', // .scene-rollforward-recap
    regenerateRunning: '[data-testid="scene-regenerate-running"]',   // .scene-regenerate-running
    restoreLorebook: '.scene-lorebook-restore',                  // .scene-lorebook-restore
    deleteScene: '.scene-delete-scene',                          // .scene-delete-scene
  },

  // Popout (dynamically created)
  popout: {
    dragClose: '[data-testid="popout-drag-close"]',  // .dragClose
  },

  // View Running Recap (settings popup, dynamically created)
  viewRunning: {
    textarea: '[data-testid="view-running-recap-textarea"]',  // #view_running_recap_textarea
  },

  // Select2 library helpers (for dynamically generated elements we don't control)
  select2: {
    results: (id) => `#select2-${id}-results`,        // Select2 dropdown results container
    element: (id) => `#${id}`,                         // Original select element
    container: (id, settingsClass) => `.${settingsClass} ul#select2-${id}-container`,  // Select2 widget container
  },
};

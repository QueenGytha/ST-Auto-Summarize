// Extension UI Selectors
// Single source of truth for all extension UI selectors
// All selectors use data-testid attributes in [data-testid="name"] format

// Helper function to scope selectors to settings content area
// This is used for popout vs inline settings disambiguation
export function scopeToSettings(selector, settingsClass) {
  return `.${settingsClass} ${selector}`;
}

export const selectorsExtension = {
  // Main container & settings
  settings: {
    panel: '[data-testid="extension-settings-panel"]',  // #auto_summarize_memory_settings
    popout: '[data-testid="extension-popout"]',         // #auto_summarize_popout_button
    restoreDefaults: '[data-testid="settings-restore-defaults"]',  // #revert_settings
  },

  // Memory controls
  memory: {
    toggle: '[data-testid="memory-toggle"]',    // #toggle_chat_memory
    refresh: '[data-testid="memory-refresh"]',  // #refresh_memory
    text: '.auto_summarize_memory_text',        // General class applied to memory text elements
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
    sendChatDetails: '[data-testid="proxy-send-chat-details"]',  // #first_hop_proxy_send_chat_details
    wrapLorebook: '[data-testid="proxy-wrap-lorebook"]',  // #wrap_lorebook_entries
  },

  // Message Filtering
  filter: {
    includeUser: '[data-testid="filter-include-user"]',     // #include_user_messages
    includeHidden: '[data-testid="filter-include-hidden"]', // #include_system_messages
    includeSystem: '[data-testid="filter-include-system"]', // #include_narrator_messages
    messageLength: '[data-testid="filter-message-length"]', // #message_length_threshold
  },

  // Miscellaneous Settings
  misc: {
    defaultEnabled: '[data-testid="misc-default-enabled"]',  // #default_chat_enabled
    globalToggle: '[data-testid="misc-global-toggle"]',      // #use_global_toggle_state
  },

  // Auto-Hide Settings
  autoHide: {
    sceneCount: '[data-testid="auto-hide-scene-count"]',  // #auto_hide_scene_count
  },

  // Validation Settings
  validation: {
    enabled: '[data-testid="validation-enabled"]',                    // #error_detection_enabled
    sceneEnabled: '[data-testid="validation-scene-enabled"]',         // #scene_summary_error_detection_enabled
    sceneEditPrompt: '[data-testid="validation-scene-edit-prompt"]',  // #edit_scene_summary_error_detection_prompt
    scenePreset: '[data-testid="validation-scene-preset"]',           // #scene_summary_error_detection_preset
    sceneIncludePresetPrompts: '[data-testid="validation-scene-include-preset-prompts"]',  // #scene_summary_error_detection_include_preset_prompts
    scenePrefill: '[data-testid="validation-scene-prefill"]',         // #scene_summary_error_detection_prefill
    sceneRetries: '[data-testid="validation-scene-retries"]',         // #scene_summary_error_detection_retries
    scenePrompt: '[data-testid="validation-scene-prompt"]',           // #scene_summary_error_detection_prompt
    errorDetectionSetting: '.error_detection_setting',                // Class for error detection settings
  },

  // Scene Summary Settings
  scene: {
    navWidth: '[data-testid="scene-nav-width"]',                     // #scene_summary_navigator_width
    navFontSize: '[data-testid="scene-nav-font-size"]',              // #scene_summary_navigator_font_size
    autoNameDetection: '[data-testid="scene-auto-name-detection"]',  // #scene_summary_auto_name
    autoNameManual: '[data-testid="scene-auto-name-manual"]',        // #scene_summary_auto_name_manual
    defaultCollapsed: '[data-testid="scene-default-collapsed"]',     // #scene_summary_default_collapsed
    editPrompt: '[data-testid="scene-edit-prompt"]',                 // #edit_scene_summary_prompt
    prompt: '[data-testid="scene-prompt"]',                          // #scene_summary_prompt
    defaultPrompt: '[data-testid="scene-default-prompt"]',           // #scene_summary_default_prompt
    completionPreset: '[data-testid="scene-completion-preset"]',     // #scene_summary_completion_preset
    includePresetPrompts: '[data-testid="scene-include-preset-prompts"]',  // #scene_summary_include_preset_prompts
    connectionProfile: '[data-testid="scene-connection-profile"]',   // #scene_summary_connection_profile
    prefill: '[data-testid="scene-prefill"]',                        // #scene_summary_prefill
    messageTypes: '[data-testid="scene-message-types"]',             // #scene_summary_message_types
    historyCount: '[data-testid="scene-history-count"]',             // #scene_summary_history_count
    historyCountDisplay: '[data-testid="scene-history-count-display"]',  // #scene_summary_history_count_display
    contextLimit: '[data-testid="scene-context-limit"]',             // #scene_summary_context_limit
    contextTypePercent: '[data-testid="scene-context-type-percent"]',  // radio button
    contextTypeTokens: '[data-testid="scene-context-type-tokens"]',    // radio button
  },

  // Running Scene Summary Settings
  running: {
    excludeLatest: '[data-testid="running-exclude-latest"]',                  // #running_scene_summary_exclude_latest
    excludeLatestDisplay: '[data-testid="running-exclude-latest-display"]',   // #running_scene_summary_exclude_latest_display
    autoGenerate: '[data-testid="running-auto-generate"]',                    // #running_scene_summary_auto_generate
    showNavbar: '[data-testid="running-show-navbar"]',                        // #running_scene_summary_show_navbar
    view: '[data-testid="running-view"]',                                     // #view_running_scene_summary
    editPrompt: '[data-testid="running-edit-prompt"]',                        // #edit_running_scene_summary_prompt
    prompt: '[data-testid="running-prompt"]',                                 // #running_scene_summary_prompt
    completionPreset: '[data-testid="running-completion-preset"]',            // #running_scene_summary_completion_preset
    includePresetPrompts: '[data-testid="running-include-preset-prompts"]',   // #running_scene_summary_include_preset_prompts
    connectionProfile: '[data-testid="running-connection-profile"]',          // #running_scene_summary_connection_profile
    prefill: '[data-testid="running-prefill"]',                               // #running_scene_summary_prefill
    position: '[data-testid="running-position"]',                             // #running_scene_summary_position
    depth: '[data-testid="running-depth"]',                                   // #running_scene_summary_depth
    role: '[data-testid="running-role"]',                                     // #running_scene_summary_role
    scan: '[data-testid="running-scan"]',                                     // #running_scene_summary_scan
    contextLimit: '[data-testid="running-context-limit"]',                    // #running_scene_summary_context_limit
    contextTypePercent: '[data-testid="running-context-type-percent"]',       // radio button
    contextTypeTokens: '[data-testid="running-context-type-tokens"]',         // radio button
  },

  // Auto Scene Break Detection Settings
  autoScene: {
    onLoad: '[data-testid="auto-scene-on-load"]',                     // #auto_scene_break_on_load
    onMessage: '[data-testid="auto-scene-on-message"]',               // #auto_scene_break_on_new_message
    generateSummary: '[data-testid="auto-scene-generate-summary"]',   // #auto_scene_break_generate_summary
    messageOffset: '[data-testid="auto-scene-message-offset"]',       // #auto_scene_break_message_offset
    offsetDisplay: '[data-testid="auto-scene-offset-display"]',       // #auto_scene_break_message_offset_value
    recentCount: '[data-testid="auto-scene-recent-count"]',           // #auto_scene_break_recent_message_count
    checkWhich: '[data-testid="auto-scene-check-which"]',             // #auto_scene_break_check_which_messages
    editPrompt: '[data-testid="auto-scene-edit-prompt"]',             // #edit_auto_scene_break_prompt
    prompt: '[data-testid="auto-scene-prompt"]',                      // #auto_scene_break_prompt
    connectionProfile: '[data-testid="auto-scene-connection-profile"]',  // #auto_scene_break_connection_profile
    completionPreset: '[data-testid="auto-scene-completion-preset"]',    // #auto_scene_break_completion_preset
    includePresetPrompts: '[data-testid="auto-scene-include-preset-prompts"]',  // #auto_scene_break_include_preset_prompts
    prefill: '[data-testid="auto-scene-prefill"]',                    // #auto_scene_break_prefill
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
    skipDuplicates: '[data-testid="lorebook-skip-duplicates"]',           // #autolorebooks-summary-skip-duplicates
    mergeConnection: '[data-testid="lorebook-merge-connection"]',         // #autolorebooks-summary-merge-connection
    mergePreset: '[data-testid="lorebook-merge-preset"]',                 // #autolorebooks-summary-merge-preset
    mergeIncludePresetPrompts: '[data-testid="lorebook-merge-include-preset-prompts"]',  // #auto_lorebooks_summary_merge_include_preset_prompts
    mergePrefill: '[data-testid="lorebook-merge-prefill"]',               // #autolorebooks-summary-merge-prefill
    mergePrompt: '[data-testid="lorebook-merge-prompt"]',                 // #autolorebooks-summary-merge-prompt
    lookupConnection: '[data-testid="lorebook-lookup-connection"]',       // #autolorebooks-summary-lorebook-entry-lookup-connection
    lookupPreset: '[data-testid="lorebook-lookup-preset"]',               // #autolorebooks-summary-lorebook-entry-lookup-preset
    lookupIncludePresetPrompts: '[data-testid="lorebook-lookup-include-preset-prompts"]',  // #auto_lorebooks_summary_lorebook_entry_lookup_include_preset_prompts
    lookupPrefill: '[data-testid="lorebook-lookup-prefill"]',             // #autolorebooks-summary-lorebook-entry-lookup-prefill
    lookupPrompt: '[data-testid="lorebook-lookup-prompt"]',               // #autolorebooks-summary-lorebook-entry-lookup-prompt
    restoreLookupPrompt: '[data-testid="lorebook-restore-lookup-prompt"]',  // #restore-summary-triage-prompt
    dedupeConnection: '[data-testid="lorebook-dedupe-connection"]',       // #autolorebooks-summary-entry-deduplicate-connection
    dedupePreset: '[data-testid="lorebook-dedupe-preset"]',               // #autolorebooks-summary-entry-deduplicate-preset
    dedupeIncludePresetPrompts: '[data-testid="lorebook-dedupe-include-preset-prompts"]',  // #auto_lorebooks_summary_lorebook_entry_deduplicate_include_preset_prompts
    dedupePrefill: '[data-testid="lorebook-dedupe-prefill"]',             // #autolorebooks-summary-entry-deduplicate-prefill
    dedupePrompt: '[data-testid="lorebook-dedupe-prompt"]',               // #autolorebooks-summary-entry-deduplicate-prompt
    restoreDedupePrompt: '[data-testid="lorebook-restore-dedupe-prompt"]',  // #restore-summary-entry-deduplicate-prompt
  },

  // Lorebook Viewer Settings
  lorebookViewer: {
    groupByWorld: '[data-testid="lorebook-viewer-group"]',    // #lorebook-viewer-group-by-world
    showDepth: '[data-testid="lorebook-viewer-depth"]',       // #lorebook-viewer-show-depth
    showContent: '[data-testid="lorebook-viewer-content"]',   // #lorebook-viewer-show-content
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

  // Running Scene Summary UI (dynamically created)
  runningUI: {
    versionSelector: '[data-testid="running-version-selector"]',  // #running_summary_version_selector
    editBtn: '[data-testid="running-edit-btn"]',                   // #running_summary_edit_btn
    scanBreaksBtn: '[data-testid="running-scan-breaks-btn"]',      // #running_summary_scan_breaks_btn
    clearAllBtn: '[data-testid="running-clear-all-btn"]',          // #running_summary_clear_all_btn
    editTextarea: '[data-testid="running-edit-textarea"]',         // #running_summary_edit_textarea
    controls: '[data-testid="running-summary-controls"]',          // .running-summary-controls
  },

  // Scene Navigator (dynamically created)
  sceneNav: {
    bar: '[data-testid="scene-navigator-bar"]',  // #scene-summary-navigator-bar
  },

  // Scene Break (dynamically created)
  sceneBreak: {
    div: '[data-testid="scene-break-div"]',                          // .auto_summarize_scene_break_div
    name: '[data-testid="scene-break-name"]',                        // .sceneBreak-name
    collapseToggle: '[data-testid="scene-collapse-toggle"]',         // .scene-collapse-toggle
    summaryBox: '[data-testid="scene-summary-box"]',                 // .scene-summary-box
    startLink: '[data-testid="scene-start-link"]',                   // .scene-start-link
    previewSummary: '[data-testid="scene-preview-summary"]',         // .scene-preview-summary
    generateSummary: '[data-testid="scene-generate-summary"]',       // .scene-generate-summary
    rollbackSummary: '[data-testid="scene-rollback-summary"]',       // .scene-rollback-summary
    rollforwardSummary: '[data-testid="scene-rollforward-summary"]', // .scene-rollforward-summary
    regenerateRunning: '[data-testid="scene-regenerate-running"]',   // .scene-regenerate-running
  },

  // Popout (dynamically created)
  popout: {
    dragClose: '[data-testid="popout-drag-close"]',  // .dragClose
  },

  // View Running Summary (settings popup, dynamically created)
  viewRunning: {
    textarea: '[data-testid="view-running-summary-textarea"]',  // #view_running_summary_textarea
  },

  // Select2 library helpers (for dynamically generated elements we don't control)
  select2: {
    results: (id) => `#select2-${id}-results`,        // Select2 dropdown results container
    element: (id) => `#${id}`,                         // Original select element
    container: (id, settingsClass) => `.${settingsClass} ul#select2-${id}-container`,  // Select2 widget container
  },
};

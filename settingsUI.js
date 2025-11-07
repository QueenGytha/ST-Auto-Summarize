
import {
  log,
  debug,
  error,
  toast,
  get_settings,
  set_settings,
  save_profile,
  load_profile,
  rename_profile,
  new_profile,
  delete_profile,
  export_profile,
  import_profile,
  toggle_character_profile,
  toggle_chat_profile,
  toggle_chat_enabled,
  refresh_settings,
  refresh_memory,
  get_user_setting_text_input,
  bind_setting,
  bind_function,
  reset_settings,
  extension_settings,
  saveSettingsDebounced,
  selectorsExtension } from
'./index.js';
import { auto_lorebook_entry_lookup_prompt, auto_lorebook_entry_deduplicate_prompt } from './defaultPrompts.js';
import {
  ensureEntityTypesSetting,
  renderEntityTypesList,
  handleAddEntityTypeFromInput,
  removeEntityType,
  restoreEntityTypesToDefault } from
'./entityTypeSettingsUI.js';
import {
  MAX_LINE_LENGTH,
  UI_UPDATE_DELAY_MS,
  MAX_DISPLAY_PERCENTAGE,
  MAX_SUMMARY_ATTEMPTS,
  DEFAULT_POLLING_INTERVAL
} from './constants.js';

// UI initialization
async function initialize_settings_listeners() {
  log("Initializing settings listeners");


  bind_setting(selectorsExtension.validation.enabled, 'error_detection_enabled', 'boolean');
  bind_setting(selectorsExtension.autoHide.sceneCount, 'auto_hide_scene_count', 'number', refresh_memory);

  // Trigger profile changes
  bind_setting(selectorsExtension.profiles.select, 'profile', 'text', () => load_profile(), false);
  bind_function(selectorsExtension.profiles.restore, () => load_profile(), false);
  bind_function(selectorsExtension.profiles.rename, () => rename_profile(), false);
  bind_function(selectorsExtension.profiles.new, new_profile, false);
  bind_function(selectorsExtension.profiles.delete, delete_profile, false);

  bind_function(selectorsExtension.profiles.export, () => export_profile(), false);
  bind_function(selectorsExtension.profiles.import, (e) => {

    log($(e.target));
    log($(e.target).parent().find(selectorsExtension.profiles.importFile));
    $(e.target).parent().find(selectorsExtension.profiles.importFile).click();
  }, false);
  bind_function(selectorsExtension.profiles.importFile, async (e) => await import_profile(e), false);

  bind_function(selectorsExtension.profiles.characterAutoload, () => toggle_character_profile());
  bind_function(selectorsExtension.profiles.chatAutoload, () => toggle_chat_profile());
  bind_setting(selectorsExtension.profiles.notifySwitch, 'notify_on_profile_switch', 'boolean');

  bind_function(selectorsExtension.settings.restoreDefaults, reset_settings);

  bind_function(selectorsExtension.memory.toggle, () => toggle_chat_enabled(), false);
  bind_function(selectorsExtension.memory.refresh, () => refresh_memory());

  // First-Hop Proxy Integration Settings
  bind_setting(selectorsExtension.proxy.sendChatDetails, 'first_hop_proxy_send_chat_details', 'boolean');
  bind_setting(selectorsExtension.proxy.wrapLorebook, 'wrap_lorebook_entries', 'boolean');

  // Lorebook Viewer Settings
  bind_setting(selectorsExtension.lorebookViewer.groupByWorld, 'lorebook_viewer_group_by_world', 'boolean');
  bind_setting(selectorsExtension.lorebookViewer.showDepth, 'lorebook_viewer_show_depth', 'boolean');
  bind_setting(selectorsExtension.lorebookViewer.showContent, 'lorebook_viewer_show_content', 'boolean');

  // Message Filtering Settings (used by scene summaries)
  bind_setting(selectorsExtension.filter.includeUser, 'include_user_messages', 'boolean');
  bind_setting(selectorsExtension.filter.includeHidden, 'include_system_messages', 'boolean');
  bind_setting(selectorsExtension.filter.includeSystem, 'include_narrator_messages', 'boolean');
  bind_setting(selectorsExtension.filter.messageLength, 'message_length_threshold', 'number');

  bind_setting(selectorsExtension.misc.defaultEnabled, 'default_chat_enabled', 'boolean');
  bind_setting(selectorsExtension.misc.globalToggle, 'use_global_toggle_state', 'boolean');

  // --- Scene Summary Settings ---
  bind_setting(selectorsExtension.scene.autoNameDetection, 'scene_summary_auto_name', 'boolean');
  bind_setting(selectorsExtension.scene.autoNameManual, 'scene_summary_auto_name_manual', 'boolean');
  bind_setting(selectorsExtension.scene.navWidth, 'scene_summary_navigator_width', 'number', (value ) => {
    // Enforce min/max constraints (30-500 pixels)
    const clampedValue = Math.max(MAX_LINE_LENGTH, Math.min(UI_UPDATE_DELAY_MS, value));
    if (clampedValue !== value) {
      set_settings('scene_summary_navigator_width', clampedValue);
      refresh_settings();
      toast(`Navigator width clamped to valid range (${MAX_LINE_LENGTH}-${UI_UPDATE_DELAY_MS} pixels)`, 'warning');
    }
    // Re-render navigator bar with new width
    if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
    // Update navbar toggle button position to match new width
    if (window.updateNavbarToggleButtonPosition) window.updateNavbarToggleButtonPosition();
  });
  bind_setting(selectorsExtension.scene.navFontSize, 'scene_summary_navigator_font_size', 'number', () => {
    // Re-render navigator bar with new font size
    if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
  });
  bind_setting(selectorsExtension.scene.prompt, 'scene_summary_prompt', 'text');
  bind_setting(selectorsExtension.scene.prefill, 'scene_summary_prefill', 'text');
  bind_setting(selectorsExtension.scene.messageTypes, 'scene_summary_message_types', 'text');

  // Persist and display scene_summary_history_count
  const $sceneHistoryCount = $(selectorsExtension.scene.historyCount);
  const $sceneHistoryCountDisplay = $(selectorsExtension.scene.historyCountDisplay);
  // Set default if not present
  if (get_settings('scene_summary_history_count') === undefined) {
    set_settings('scene_summary_history_count', 1);
  }
  $sceneHistoryCount.val(get_settings('scene_summary_history_count') || 1);
  $sceneHistoryCountDisplay.text($sceneHistoryCount.val());
  $sceneHistoryCount.on('input change', function () {
    const val = Math.max(1, Math.min(MAX_DISPLAY_PERCENTAGE, Number($(this).val()) || 1));
    set_settings('scene_summary_history_count', val);
    save_profile(); // auto-save when changed
    $sceneHistoryCount.val(val);
    $sceneHistoryCountDisplay.text(val);
  });

  // --- Scene Summary Validation Settings ---
  bind_setting(selectorsExtension.validation.sceneEnabled, 'scene_summary_error_detection_enabled', 'boolean');
  bind_setting(selectorsExtension.validation.scenePreset, 'scene_summary_error_detection_preset', 'text');
  bind_setting(selectorsExtension.validation.sceneIncludePresetPrompts, 'scene_summary_error_detection_include_preset_prompts', 'boolean');
  bind_setting(selectorsExtension.validation.scenePrefill, 'scene_summary_error_detection_prefill', 'text');
  bind_setting(selectorsExtension.validation.sceneRetries, 'scene_summary_error_detection_retries', 'number');
  bind_setting(selectorsExtension.validation.scenePrompt, 'scene_summary_error_detection_prompt', 'text');

  bind_function(selectorsExtension.validation.sceneEditPrompt, async () => {
    const description = `
Configure the prompt used to verify that scene summaries meet your criteria.
The prompt should return "VALID" for acceptable summaries and "INVALID" for unacceptable ones.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{summary}}:</b> The generated scene summary to validate.</li>
</ul>`;
    await get_user_setting_text_input('scene_summary_error_detection_prompt', 'Edit Scene Summary Error Detection Prompt', description);
  });
  bind_function(selectorsExtension.scene.editPrompt, async () => {
    const description = `
Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{message}}:</b> The scene content to summarize.</li>
    <li><b>{{history}}:</b> The message history as configured by the "Scene Message History Mode" setting.</li>
    <li><b>{{words}}:</b> The token limit as defined by the chosen completion preset.</li>
    <li><b>{{lorebook_entry_types}}:</b> Pipe-delimited list of enabled lorebook entry types.</li>
</ul>
`;
    await get_user_setting_text_input('scene_summary_prompt', 'Edit Scene Summary Prompt', description);
  });

  // Scene summary context limit and type
  bind_setting(selectorsExtension.scene.contextLimit, 'scene_summary_context_limit', 'number');
  bind_setting('input[name="scene_summary_context_type"]', 'scene_summary_context_type', 'text');  // Radio button group

  // Scene summary preset and connection profile
  bind_setting(selectorsExtension.scene.completionPreset, 'scene_summary_completion_preset', 'text');
  bind_setting(selectorsExtension.scene.includePresetPrompts, 'scene_summary_include_preset_prompts', 'boolean');
  bind_setting(selectorsExtension.scene.connectionProfile, 'scene_summary_connection_profile', 'text');

  // --- Running Scene Summary Settings ---
  bind_setting(selectorsExtension.running.autoGenerate, 'running_scene_summary_auto_generate', 'boolean');
  bind_setting(selectorsExtension.running.showNavbar, 'running_scene_summary_show_navbar', 'boolean', () => {
    // Refresh navbar buttons visibility
    if (window.updateRunningSceneSummaryNavbar) window.updateRunningSceneSummaryNavbar();
  });
  bind_setting(selectorsExtension.running.prompt, 'running_scene_summary_prompt', 'text');
  bind_setting(selectorsExtension.running.prefill, 'running_scene_summary_prefill', 'text');
  bind_setting(selectorsExtension.running.completionPreset, 'running_scene_summary_completion_preset', 'text');
  bind_setting(selectorsExtension.running.includePresetPrompts, 'running_scene_summary_include_preset_prompts', 'boolean');
  bind_setting(selectorsExtension.running.connectionProfile, 'running_scene_summary_connection_profile', 'text');
  bind_setting(selectorsExtension.running.position, 'running_scene_summary_position', 'number');
  bind_setting(selectorsExtension.running.depth, 'running_scene_summary_depth', 'number');
  bind_setting(selectorsExtension.running.role, 'running_scene_summary_role');
  bind_setting(selectorsExtension.running.scan, 'running_scene_summary_scan', 'boolean');
  bind_setting(selectorsExtension.running.contextLimit, 'running_scene_summary_context_limit', 'number');
  bind_setting('input[name="running_scene_summary_context_type"]', 'running_scene_summary_context_type', 'text');  // Radio button group

  // Running scene summary exclude latest slider
  const $runningExcludeLatest = $(selectorsExtension.running.excludeLatest);
  const $runningExcludeLatestDisplay = $(selectorsExtension.running.excludeLatestDisplay);
  if (get_settings('running_scene_summary_exclude_latest') === undefined) {
    set_settings('running_scene_summary_exclude_latest', 1);
  }
  $runningExcludeLatest.val(get_settings('running_scene_summary_exclude_latest') || 1);
  $runningExcludeLatestDisplay.text($runningExcludeLatest.val());
  $runningExcludeLatest.on('input change', function () {
    const val = Math.max(0, Math.min(MAX_SUMMARY_ATTEMPTS, Number($(this).val()) || 1));
    set_settings('running_scene_summary_exclude_latest', val);
    save_profile();
    $runningExcludeLatest.val(val);
    $runningExcludeLatestDisplay.text(val);
  });

  // View/edit running scene summary button
  bind_function(selectorsExtension.running.view, async () => {
    const { get_running_summary, get_current_running_summary_version, get_running_summary_versions, set_current_running_summary_version } = await import('./runningSceneSummary.js');
    const current = get_running_summary(get_current_running_summary_version());
    const ctx = getContext();

    if (!current) {
      toast('No running summary available yet. Generate a scene summary first.', 'warning');
      return;
    }

    const html = `
            <div>
                <h3>View/Edit Running Scene Summary</h3>
                <p>Current version: v${current.version} (${current.prev_scene_index ?? 0} > ${current.new_scene_index ?? 0})</p>
                <p>Editing will create a new version.</p>
                <textarea id="view_running_summary_textarea" data-testid="view-running-summary-textarea" rows="20" style="width: 100%; height: 400px;">${current.content || ""}</textarea>
            </div>
        `;

    try {
      const result = await ctx.callPopup(html, 'text', undefined, {
        okButton: "Save",
        cancelButton: "Cancel",
        wide: true,
        large: true
      });

      if (result) {
        const edited = $(selectorsExtension.viewRunning.textarea).val();
        if (edited !== null && edited !== current.content) {
          // Editing creates a new version with same scene indexes
          const versions = get_running_summary_versions();
          const newVersion = {
            version: versions.length + 1,
            content: edited,
            timestamp: Date.now(),
            scene_count: current.scene_count,
            exclude_count: current.exclude_count,
            prev_scene_index: current.prev_scene_index ?? 0,
            new_scene_index: current.new_scene_index ?? 0
          };
          versions.push(newVersion);
          set_current_running_summary_version(newVersion.version);
          toast('Created new version from edit', 'success');
          refresh_memory();
        }
      }
    } catch (err) {
      error('Failed to edit running summary', err);
    }
  });

  // Edit running scene summary prompt button
  bind_function(selectorsExtension.running.editPrompt, async () => {
    const description = `
Configure the prompt used to combine multiple scene summaries into a cohesive narrative memory.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{current_running_summary}}:</b> The current running summary (if exists).</li>
    <li><b>{{scene_summaries}}:</b> The individual scene summaries to merge.</li>
</ul>`;
    await get_user_setting_text_input('running_scene_summary_prompt', 'Edit Running Scene Summary Prompt', description);
  });

  // --- Auto Scene Break Detection Settings ---
  bind_setting(selectorsExtension.autoScene.onLoad, 'auto_scene_break_on_load', 'boolean');
  bind_setting(selectorsExtension.autoScene.onMessage, 'auto_scene_break_on_new_message', 'boolean');
  bind_setting(selectorsExtension.autoScene.generateSummary, 'auto_scene_break_generate_summary', 'boolean');
  bind_setting(selectorsExtension.autoScene.checkWhich, 'auto_scene_break_check_which_messages', 'text');
  bind_setting(selectorsExtension.autoScene.recentCount, 'auto_scene_break_recent_message_count', 'number');
  bind_setting(selectorsExtension.autoScene.prompt, 'auto_scene_break_prompt', 'text');
  bind_setting(selectorsExtension.autoScene.prefill, 'auto_scene_break_prefill', 'text');
  bind_setting(selectorsExtension.autoScene.connectionProfile, 'auto_scene_break_connection_profile', 'text');
  bind_setting(selectorsExtension.autoScene.completionPreset, 'auto_scene_break_completion_preset', 'text');
  bind_setting(selectorsExtension.autoScene.includePresetPrompts, 'auto_scene_break_include_preset_prompts', 'boolean');

  // Message offset with live display update
  const $autoSceneBreakOffset = $(selectorsExtension.autoScene.messageOffset);
  const $autoSceneBreakOffsetValue = $(selectorsExtension.autoScene.offsetDisplay);
  if (get_settings('auto_scene_break_message_offset') === undefined) {
    set_settings('auto_scene_break_message_offset', 1);
  }
  $autoSceneBreakOffset.val(get_settings('auto_scene_break_message_offset') ?? 1);
  $autoSceneBreakOffsetValue.text($autoSceneBreakOffset.val());
  $autoSceneBreakOffset.on('input change', function () {
    let val = Number($(this).val());
    if (isNaN(val)) val = 1;
    val = Math.max(0, Math.min(DEFAULT_POLLING_INTERVAL, val));
    set_settings('auto_scene_break_message_offset', val);
    save_profile(); // auto-save when changed
    $autoSceneBreakOffset.val(val);
    $autoSceneBreakOffsetValue.text(val);
  });

  // Edit prompt button
  bind_function(selectorsExtension.autoScene.editPrompt, async () => {
    const description = `
Configure the prompt used to detect scene breaks automatically.
The prompt should return "true" if the message is a scene break, or "false" if it is not.

Available Macros:
<ul style="text-align: left; font-size: smaller;">
    <li><b>{{message}}:</b> The message text to analyze for scene break detection.</li>
</ul>`;
    await get_user_setting_text_input('auto_scene_break_prompt', 'Edit Auto Scene Break Detection Prompt', description);
  });

  // Initialize running scene summary navbar
  const { createRunningSceneSummaryNavbar, updateRunningSceneSummaryNavbar } = await import('./runningSceneSummaryUI.js');
  createRunningSceneSummaryNavbar();
  updateRunningSceneSummaryNavbar();

  // Initialize Auto-Lorebooks settings event listeners
  initialize_lorebooks_settings_listeners();

  // Initialize Lorebook Viewer settings
  initialize_lorebook_viewer_settings_listeners();

  refresh_settings();
}

function initialize_lorebooks_settings_listeners() {
  ensureEntityTypesSetting();
  renderEntityTypesList();

  // Entity type management
  $(document).on('click', '#autolorebooks-add-entity-type', (event) => {
    event.preventDefault();
    handleAddEntityTypeFromInput();
  });
  $(document).on('keypress', '#autolorebooks-entity-type-input', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddEntityTypeFromInput();
    }
  });
  $(document).on('click', '.autolorebooks-entity-type-remove', (event) => {
    event.preventDefault();
    const type = $(event.currentTarget).attr('data-type') || '';
    removeEntityType(type);
  });
  $(document).on('click', '#autolorebooks-restore-entity-types', (event) => {
    event.preventDefault();
    restoreEntityTypesToDefault();
  });

  // Name template input
  $(document).on('input', '#autolorebooks-name-template', function () {
    const value = $(this).val().trim();
    if (value && value.length > 0) {
      if (!extension_settings.autoLorebooks) extension_settings.autoLorebooks = {};
      extension_settings.autoLorebooks.nameTemplate = value;
      saveSettingsDebounced();
    }
  });

  // Delete on chat delete checkbox
  $(document).on('change', '#autolorebooks-delete-on-chat-delete', function () {
    const value = $(this).prop('checked');
    if (!extension_settings.autoLorebooks) extension_settings.autoLorebooks = {};
    extension_settings.autoLorebooks.deleteOnChatDelete = value;
    saveSettingsDebounced();
  });

  // Auto-reorder alphabetically checkbox
  $(document).on('change', '#autolorebooks-auto-reorder-alphabetically', function () {
    const value = $(this).prop('checked');
    if (!extension_settings.autoLorebooks) extension_settings.autoLorebooks = {};
    extension_settings.autoLorebooks.autoReorderAlphabetically = value;
    saveSettingsDebounced();
  });

  // Removed legacy Auto-Lorebooks queue toggles (queue is mandatory)

  // Summary processing settings
  $(document).on('change', '#autolorebooks-summary-skip-duplicates', function () {
    const value = $(this).prop('checked');
    set_settings('auto_lorebooks_summary_skip_duplicates', value);
    save_profile();
  });

  $(document).on('change', '#autolorebooks-summary-merge-connection', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_merge_connection_profile', value);
    save_profile();
  });

  $(document).on('change', '#autolorebooks-summary-merge-preset', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_merge_completion_preset', value);
    save_profile();
  });

  $(document).on('change', selectorsExtension.lorebook.mergeIncludePresetPrompts, function () {
    const value = $(this).prop('checked');
    set_settings('auto_lorebooks_summary_merge_include_preset_prompts', value);
    save_profile();
  });

  $(document).on('input', '#autolorebooks-summary-merge-prefill', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_merge_prefill', value);
    save_profile();
  });

  $(document).on('input', '#autolorebooks-summary-merge-prompt', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_merge_prompt', value);
    save_profile();
  });

  $(document).on('change', '#autolorebooks-summary-triage-connection', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_lorebook_entry_lookup_connection_profile', value);
    save_profile();
  });

  $(document).on('change', '#autolorebooks-summary-triage-preset', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_lorebook_entry_lookup_completion_preset', value);
    save_profile();
  });

  $(document).on('change', selectorsExtension.lorebook.lookupIncludePresetPrompts, function () {
    const value = $(this).prop('checked');
    set_settings('auto_lorebooks_summary_lorebook_entry_lookup_include_preset_prompts', value);
    save_profile();
  });

  $(document).on('input', '#autolorebooks-summary-triage-prefill', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_lorebook_entry_lookup_prefill', value);
    save_profile();
  });

  $(document).on('input', '#autolorebooks-summary-triage-prompt', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_lorebook_entry_lookup_prompt', value);
    save_profile();
  });

  $(document).on('change', '#autolorebooks-summary-entry-deduplicate-connection', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_connection_profile', value);
    save_profile();
  });

  $(document).on('change', '#autolorebooks-summary-entry-deduplicate-preset', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_completion_preset', value);
    save_profile();
  });

  $(document).on('change', selectorsExtension.lorebook.dedupeIncludePresetPrompts, function () {
    const value = $(this).prop('checked');
    set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_include_preset_prompts', value);
    save_profile();
  });

  $(document).on('input', '#autolorebooks-summary-entry-deduplicate-prefill', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_prefill', value);
    save_profile();
  });

  $(document).on('input', '#autolorebooks-summary-entry-deduplicate-prompt', function () {
    const value = $(this).val();
    set_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_prompt', value);
    save_profile();
  });

  $(document).on('click', '#restore-summary-triage-prompt', function () {
    $(selectorsExtension.lorebook.lookupPrompt).val(auto_lorebook_entry_lookup_prompt);
    $(selectorsExtension.lorebook.lookupPrompt).trigger('input');
    toast('Lorebook Entry Lookup prompt restored to default', 'success');
  });

  $(document).on('click', '#restore-summary-entry-deduplicate-prompt', function () {
    $(selectorsExtension.lorebook.dedupePrompt).val(auto_lorebook_entry_deduplicate_prompt);
    $(selectorsExtension.lorebook.dedupePrompt).trigger('input');
    toast('LorebookEntryDeduplicate prompt restored to default', 'success');
  });

  debug("Auto-Lorebooks settings event listeners initialized");
}

function initialize_lorebook_viewer_settings_listeners() {
  // Group by world checkbox
  $(document).on('change', '#lorebook-viewer-group-by-world', function () {
    const value = $(this).prop('checked');
    set_settings('lorebook_viewer_group_by_world', value);
    save_profile();
  });

  // Show depth checkbox
  $(document).on('change', '#lorebook-viewer-show-depth', function () {
    const value = $(this).prop('checked');
    set_settings('lorebook_viewer_show_depth', value);
    save_profile();
  });

  // Show content checkbox
  $(document).on('change', '#lorebook-viewer-show-content', function () {
    const value = $(this).prop('checked');
    set_settings('lorebook_viewer_show_content', value);
    save_profile();
  });

  debug("Lorebook Viewer settings event listeners initialized");
}

export { initialize_settings_listeners };
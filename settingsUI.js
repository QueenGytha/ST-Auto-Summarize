
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
  bind_setting,
  bind_function,
  reset_settings,
  extension_settings,
  saveSettingsDebounced,
  selectorsExtension } from
'./index.js';
import { initializeEntityTypesUI } from './entityTypeSettingsUI.js';
import { initializeEntryDefaultsUI } from './entryDefaultsSettingsUI.js';
import { initializeOperationsPresetsUI, loadActivePreset } from './operationsPresetsUIBindings.js';
import {
  MAX_LINE_LENGTH,
  UI_UPDATE_DELAY_MS,
  MAX_DISPLAY_PERCENTAGE,
  MAX_RECAP_ATTEMPTS,
  DEFAULT_POLLING_INTERVAL,
  DEFAULT_MINIMUM_SCENE_LENGTH,
  MAX_SCENE_LENGTH_SETTING
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
  bind_function(selectorsExtension.profiles.importFile, (e) => void import_profile(e), false);

  bind_function(selectorsExtension.profiles.characterAutoload, () => toggle_character_profile());
  bind_function(selectorsExtension.profiles.chatAutoload, () => toggle_chat_profile());
  bind_setting(selectorsExtension.profiles.notifySwitch, 'notify_on_profile_switch', 'boolean');

  bind_function(selectorsExtension.settings.restoreDefaults, reset_settings);

  bind_function(selectorsExtension.memory.toggle, () => toggle_chat_enabled(), false);
  bind_function(selectorsExtension.memory.refresh, () => refresh_memory());

  // First-Hop Proxy Integration Settings
  bind_setting(selectorsExtension.proxy.manualOverride, 'first_hop_proxy_manual_override', 'boolean');
  bind_setting(selectorsExtension.proxy.suppressOtherLorebooks, 'suppress_other_lorebooks', 'boolean');

  // Token Counting Settings
  bind_setting(selectorsExtension.tokenCounting.correctionFactor, 'tokenizer_correction_factor', 'number');

  bind_setting(selectorsExtension.misc.defaultEnabled, 'default_chat_enabled', 'boolean');
  bind_setting(selectorsExtension.misc.globalToggle, 'use_global_toggle_state', 'boolean');
  bind_setting(selectorsExtension.misc.compactionThreshold, 'auto_lorebooks_compaction_threshold', 'number');
  bind_setting(selectorsExtension.misc.operationDelay, 'operation_delay_ms', 'number');

  // --- Scene Recap Settings ---
  // Scene names are now provided by the recap output itself (scene_name field)
  bind_setting(selectorsExtension.scene.navWidth, 'scene_recap_navigator_width', 'number', (value ) => {
    // Enforce min/max constraints (30-500 pixels)
    const clampedValue = Math.max(MAX_LINE_LENGTH, Math.min(UI_UPDATE_DELAY_MS, value));
    if (clampedValue !== value) {
      set_settings('scene_recap_navigator_width', clampedValue);
      refresh_settings();
      toast(`Navigator width clamped to valid range (${MAX_LINE_LENGTH}-${UI_UPDATE_DELAY_MS} pixels)`, 'warning');
    }
    // Re-render navigator bar with new width
    if (window.renderSceneNavigatorBar) {window.renderSceneNavigatorBar();}
    // Update navbar toggle button position to match new width
    if (window.updateNavbarToggleButtonPosition) {window.updateNavbarToggleButtonPosition();}
  });
  bind_setting(selectorsExtension.scene.navFontSize, 'scene_recap_navigator_font_size', 'number', () => {
    // Re-render navigator bar with new font size
    if (window.renderSceneNavigatorBar) {window.renderSceneNavigatorBar();}
  });
  bind_setting(selectorsExtension.scene.defaultCollapsed, 'scene_recap_default_collapsed', 'boolean');
  bind_setting(selectorsExtension.scene.nameAppendRange, 'scene_name_append_range', 'boolean');
  bind_setting(selectorsExtension.scene.messageTypes, 'scene_recap_message_types', 'text');

  // Persist and display scene_recap_history_count
  const $sceneHistoryCount = $(selectorsExtension.scene.historyCount);
  const $sceneHistoryCountDisplay = $(selectorsExtension.scene.historyCountDisplay);
  // Set default if not present
  if (get_settings('scene_recap_history_count') === undefined) {
    set_settings('scene_recap_history_count', 1);
  }
  $sceneHistoryCount.val(get_settings('scene_recap_history_count') || 1);
  $sceneHistoryCountDisplay.text($sceneHistoryCount.val());
  $sceneHistoryCount.on('input change', function () {
    const val = Math.max(1, Math.min(MAX_DISPLAY_PERCENTAGE, Number($(this).val()) || 1));
    set_settings('scene_recap_history_count', val);
    save_profile(); // auto-save when changed
    $sceneHistoryCount.val(val);
    $sceneHistoryCountDisplay.text(val);
  });

  // --- Scene Recap Validation Settings ---
  bind_setting(selectorsExtension.validation.sceneEnabled, 'scene_recap_error_detection_enabled', 'boolean');
  bind_setting(selectorsExtension.validation.sceneRetries, 'scene_recap_error_detection_retries', 'number');

  bind_setting(selectorsExtension.scene.includeActiveSettingLore, 'scene_recap_include_active_setting_lore', 'boolean');

  // --- Running Scene Recap Settings ---
  bind_setting(selectorsExtension.running.autoGenerate, 'running_scene_recap_auto_generate', 'boolean');
  bind_setting(selectorsExtension.running.showNavbar, 'running_scene_recap_show_navbar', 'boolean', () => {
    // Refresh navbar buttons visibility
    if (window.updateRunningSceneRecapNavbar) {window.updateRunningSceneRecapNavbar();}
  });
  bind_setting(selectorsExtension.running.position, 'running_scene_recap_position', 'number');
  bind_setting(selectorsExtension.running.depth, 'running_scene_recap_depth', 'number');
  bind_setting(selectorsExtension.running.role, 'running_scene_recap_role');
  bind_setting(selectorsExtension.running.scan, 'running_scene_recap_scan', 'boolean');

  // Running scene recap exclude latest slider
  const $runningExcludeLatest = $(selectorsExtension.running.excludeLatest);
  const $runningExcludeLatestDisplay = $(selectorsExtension.running.excludeLatestDisplay);
  if (get_settings('running_scene_recap_exclude_latest') === undefined) {
    set_settings('running_scene_recap_exclude_latest', 1);
  }
  $runningExcludeLatest.val(get_settings('running_scene_recap_exclude_latest') || 1);
  $runningExcludeLatestDisplay.text($runningExcludeLatest.val());
  $runningExcludeLatest.on('input change', function () {
    const val = Math.max(0, Math.min(MAX_RECAP_ATTEMPTS, Number($(this).val()) || 1));
    set_settings('running_scene_recap_exclude_latest', val);
    save_profile();
    $runningExcludeLatest.val(val);
    $runningExcludeLatestDisplay.text(val);
  });

  // View/edit running scene recap button
  bind_function(selectorsExtension.running.view, async () => {
    const { get_running_recap, get_current_running_recap_version, get_running_recap_versions, set_current_running_recap_version } = await import('./runningSceneRecap.js');
    const current = get_running_recap(get_current_running_recap_version());
    const ctx = getContext();

    if (!current) {
      toast('No running recap available yet. Generate a scene recap first.', 'warning');
      return;
    }

    const html = `
            <div>
                <h3>View/Edit Running Scene Recap</h3>
                <p>Current version: v${current.version} (${current.prev_scene_index ?? 0} > ${current.new_scene_index ?? 0})</p>
                <p>Editing will create a new version.</p>
                <textarea id="view_running_recap_textarea" data-testid="view-running-recap-textarea" rows="20" style="width: 100%; height: 400px;">${current.content || ""}</textarea>
            </div>
        `;

    try {
      const popup = new ctx.Popup(html, ctx.POPUP_TYPE.CONFIRM, '', {
        okButton: "Save",
        wide: true,
        large: true
      });

      const result = await popup.show();

      if (result) {
        const edited = $(selectorsExtension.viewRunning.textarea).val();
        if (edited !== null && edited !== current.content) {
          // Editing creates a new version with same scene indexes
          const versions = get_running_recap_versions();
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
          set_current_running_recap_version(newVersion.version);
          toast('Created new version from edit', 'success');
          refresh_memory();
        }
      }
    } catch (err) {
      error('Failed to edit running recap', err);
    }
  });

  // --- Auto Scene Break Detection Settings ---
  bind_setting(selectorsExtension.autoScene.onLoad, 'auto_scene_break_on_load', 'boolean');
  bind_setting(selectorsExtension.autoScene.onMessage, 'auto_scene_break_on_new_message', 'boolean');
  bind_setting(selectorsExtension.autoScene.generateRecap, 'auto_scene_break_generate_recap', 'boolean');
  bind_setting(selectorsExtension.autoScene.checkWhich, 'auto_scene_break_check_which_messages', 'text');

  // Minimum scene length with live display update
  const $autoSceneMinLength = $(selectorsExtension.autoScene.minLength);
  const $autoSceneMinLengthDisplay = $(selectorsExtension.autoScene.minLengthDisplay);
  if (get_settings('auto_scene_break_minimum_scene_length') === undefined) {
    set_settings('auto_scene_break_minimum_scene_length', DEFAULT_MINIMUM_SCENE_LENGTH);
  }
  $autoSceneMinLength.val(get_settings('auto_scene_break_minimum_scene_length') ?? DEFAULT_MINIMUM_SCENE_LENGTH);
  $autoSceneMinLengthDisplay.text($autoSceneMinLength.val());
  $autoSceneMinLength.on('input change', function () {
    let val = Number($(this).val());
    if (Number.isNaN(val)) {val = DEFAULT_MINIMUM_SCENE_LENGTH;}
    val = Math.max(1, Math.min(MAX_SCENE_LENGTH_SETTING, val));
    set_settings('auto_scene_break_minimum_scene_length', val);
    save_profile();
    $autoSceneMinLength.val(val);
    $autoSceneMinLengthDisplay.text(val);
  });

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
    if (Number.isNaN(val)) {val = 1;}
    val = Math.max(0, Math.min(DEFAULT_POLLING_INTERVAL, val));
    set_settings('auto_scene_break_message_offset', val);
    save_profile(); // auto-save when changed
    $autoSceneBreakOffset.val(val);
    $autoSceneBreakOffsetValue.text(val);
  });

  // Initialize running scene recap navbar
  const { createRunningSceneRecapNavbar, updateRunningSceneRecapNavbar } = await import('./runningSceneRecapUI.js');
  createRunningSceneRecapNavbar();
  updateRunningSceneRecapNavbar();

  // Initialize Auto-Lorebooks settings event listeners
  initialize_lorebooks_settings_listeners();

  refresh_settings();
}

function initialize_lorebooks_settings_listeners() {
  // Entity types UI is now in Operations Configuration - initialized via initializeEntityTypesUI()
  // which is called after the settings HTML is loaded

  // Name template input
  $(document).on('input', '#autolorebooks-name-template', function () {
    const value = $(this).val().trim();
    if (value && value.length > 0) {
      if (!extension_settings.autoLorebooks) {extension_settings.autoLorebooks = {};}
      extension_settings.autoLorebooks.nameTemplate = value;
      saveSettingsDebounced();
    }
  });

  // Delete on chat delete checkbox
  $(document).on('change', '#autolorebooks-delete-on-chat-delete', function () {
    const value = $(this).prop('checked');
    if (!extension_settings.autoLorebooks) {extension_settings.autoLorebooks = {};}
    extension_settings.autoLorebooks.deleteOnChatDelete = value;
    saveSettingsDebounced();
  });

  // Auto-reorder alphabetically checkbox
  $(document).on('change', '#autolorebooks-auto-reorder-alphabetically', function () {
    const value = $(this).prop('checked');
    if (!extension_settings.autoLorebooks) {extension_settings.autoLorebooks = {};}
    extension_settings.autoLorebooks.autoReorderAlphabetically = value;
    saveSettingsDebounced();
  });

  // Removed legacy Auto-Lorebooks queue toggles (queue is mandatory)
  // Entry defaults bindings moved to entryDefaultsSettingsUI.js

  debug("Auto-Lorebooks settings event listeners initialized");

  initializeOperationsPresetsUI();
  debug("Operations Presets UI initialized");

  initializeEntityTypesUI();
  debug("Entity Types UI initialized");

  initializeEntryDefaultsUI();
  debug("Entry Defaults UI initialized");
}

export { initialize_settings_listeners, loadActivePreset };

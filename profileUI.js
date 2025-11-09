
import {
  get_settings,
  set_settings,
  check_preset_valid,
  get_presets,
  get_connection_profiles,
  toast,
  debug,
  error,
  settings_content_class,
  set_setting_ui_element,
  settings_ui_map,
  chat_enabled,
  selectorsExtension,
  scopeToSettings,
  set_character_enabled_button_states,
  get_character_profile,
  get_chat_profile,
  get_settings_element,
  getContext,
  extension_settings } from
'./index.js';
import { ensureEntityTypesSetting, renderEntityTypesList } from './entityTypeSettingsUI.js';

function update_profile_section() {
  const context = getContext();

  const current_profile = get_settings('profile');
  const current_character_profile = get_character_profile();
  const current_chat_profile = get_chat_profile();
  const profile_options = Object.keys(get_settings('profiles'));

  const $choose_profile_dropdown = $(`.${settings_content_class} ${selectorsExtension.profiles.select}`).empty();
  const $character = $(selectorsExtension.profiles.characterAutoload);
  const $chat = $(selectorsExtension.profiles.chatAutoload);
  const $character_icon = $character.find('i');
  const $chat_icon = $chat.find('i');


  // Set the profile dropdowns to reflect the available profiles and the currently chosen one
  for (const profile of profile_options) {
    // if the current character/chat has a default profile, indicate as such
    let text = profile;
    if (profile === current_character_profile) {
      text = `${profile} (character)`;
    } else if (profile === current_chat_profile) {
      text = `${profile} (chat)`;
    }
    $choose_profile_dropdown.append(`<option value="${profile}">${text}</option>`);
  }

  // if (current_character_profile) {  // set the current chosen profile in the dropdown
  //     choose_profile_dropdown.val(current_character_profile);
  // }


  // When in a group chat, the character profile lock is disabled
  if (context.groupId) {
    $character.prop('disabled', true);
  }

  // button highlights and icons

  const lock_class = 'fa-lock';
  const unlock_class = 'fa-unlock';
  const highlight_class = 'button_highlight';

  if (current_character_profile === current_profile) {
    $character.addClass(highlight_class);
    $character_icon.removeClass(unlock_class);
    $character_icon.addClass(lock_class);
  } else {
    $character.removeClass(highlight_class);
    $character_icon.removeClass(lock_class);
    $character_icon.addClass(unlock_class);
  }

  if (current_chat_profile === current_profile) {
    $chat.addClass(highlight_class);
    $chat_icon.removeClass(unlock_class);
    $chat_icon.addClass(lock_class);
  } else {
    $chat.removeClass(highlight_class);
    $chat_icon.removeClass(lock_class);
    $chat_icon.addClass(unlock_class);
  }
}

async function update_scene_recap_preset_dropdown() {
  const $preset_select = $(selectorsExtension.scene.completionPreset);
  const recap_preset = get_settings('scene_recap_completion_preset');
  const preset_options = await get_presets();
  $preset_select.empty();
  $preset_select.append(`<option value="">Same as Current</option>`);
  for (const option of preset_options) {
    $preset_select.append(`<option value="${option}">${option}</option>`);
  }
  $preset_select.val(recap_preset);
  $preset_select.off('click').on('click', () => update_scene_recap_preset_dropdown());
}

async function update_scene_recap_connection_profile_dropdown() {
  const $connection_select = $(selectorsExtension.scene.connectionProfile);
  const recap_connection = get_settings('scene_recap_connection_profile');
  const connection_options = await get_connection_profiles();
  $connection_select.empty();
  $connection_select.append(`<option value="">Same as Current</option>`);
  if (connection_options && Array.isArray(connection_options)) {
    for (const option of connection_options) {
      $connection_select.append(`<option value="${option}">${option}</option>`);
    }
  }
  $connection_select.val(recap_connection);
  $connection_select.off('click').on('click', () => update_scene_recap_connection_profile_dropdown());
}

async function update_auto_scene_break_preset_dropdown() {
  const $preset_select = $(selectorsExtension.autoScene.completionPreset);
  const recap_preset = get_settings('auto_scene_break_completion_preset');
  const preset_options = await get_presets();
  $preset_select.empty();
  $preset_select.append(`<option value="">Same as Current</option>`);
  for (const option of preset_options) {
    $preset_select.append(`<option value="${option}">${option}</option>`);
  }
  $preset_select.val(recap_preset);
  $preset_select.off('click').on('click', () => update_auto_scene_break_preset_dropdown());
}

async function update_auto_scene_break_connection_profile_dropdown() {
  const $connection_select = $(selectorsExtension.autoScene.connectionProfile);
  const recap_connection = get_settings('auto_scene_break_connection_profile');
  const connection_options = await get_connection_profiles();
  $connection_select.empty();
  $connection_select.append(`<option value="">Same as Current</option>`);
  if (connection_options && Array.isArray(connection_options)) {
    for (const option of connection_options) {
      $connection_select.append(`<option value="${option}">${option}</option>`);
    }
  }
  $connection_select.val(recap_connection);
  $connection_select.off('click').on('click', () => update_auto_scene_break_connection_profile_dropdown());
}

async function update_error_detection_preset_dropdown() {
  const $scene_preset_select = $(scopeToSettings(selectorsExtension.validation.scenePreset, settings_content_class));
  const scene_preset = get_settings('scene_recap_error_detection_preset');
  const preset_options = await get_presets();

  $scene_preset_select.empty();
  $scene_preset_select.append(`<option value="">Same as Scene Recap</option>`);
  for (const option of preset_options) {
    $scene_preset_select.append(`<option value="${option}">${option}</option>`);
  }
  $scene_preset_select.val(scene_preset);
  $scene_preset_select.off('click').on('click', () => update_error_detection_preset_dropdown());
}

// Helper: Update all preset and profile dropdowns
async function updateAllDropdowns() {
  await update_error_detection_preset_dropdown();
  await update_scene_recap_preset_dropdown();
  await update_scene_recap_connection_profile_dropdown();
  await update_auto_scene_break_preset_dropdown();
  await update_auto_scene_break_connection_profile_dropdown();
  await update_running_scene_recap_preset_dropdown();
  await update_running_scene_recap_connection_profile_dropdown();
  check_preset_valid();
}

// Helper: Update error detection settings
function updateErrorDetectionSettings() {
  const error_detection_enabled = get_settings('error_detection_enabled');
  $(scopeToSettings(selectorsExtension.validation.errorDetectionSetting, settings_content_class)).prop('disabled', !error_detection_enabled);
}

// Helper: Validate and fix settings
function validateAndFixSettings() {
  // Ensure {{message}} macro is in prompt
  const prompt = get_settings('prompt');
  if (typeof prompt === "string" && !prompt.includes("{{message}}")) {
    set_settings('prompt', prompt + "\n{{message}}");
    debug("{{message}} macro not found in recap prompt. It has been added automatically.");
  }

  // Ensure auto_recap_message_limit >= auto_recap_batch_size
  const auto_limit = get_settings('auto_recap_message_limit');
  const batch_size = get_settings('auto_recap_batch_size');
  if (auto_limit >= 0 && auto_limit < batch_size) {
    set_settings('auto_recap_message_limit', get_settings('auto_recap_batch_size'));
    toast("The auto-recap message limit must be greater than or equal to the batch size.", "warning");
  }
}

// Helper: Update conditional settings based on dependencies
function updateConditionalSettings() {
  const auto_recap = get_settings('auto_recap');
  get_settings_element('auto_recap_on_send')?.prop('disabled', !auto_recap);
  get_settings_element('auto_recap_message_limit')?.prop('disabled', !auto_recap);
  get_settings_element('auto_recap_batch_size')?.prop('disabled', !auto_recap);
  get_settings_element('auto_recap_progress')?.prop('disabled', !auto_recap);
  get_settings_element('recap_delay')?.prop('disabled', !auto_recap);

  const history_disabled = get_settings('include_message_history_mode') === "none";
  get_settings_element('include_message_history')?.prop('disabled', history_disabled);
  get_settings_element('include_user_messages_in_history')?.prop('disabled', history_disabled);
  get_settings_element('preview_message_history')?.prop('disabled', history_disabled);

  const prompt = get_settings('prompt');
  if (!history_disabled && prompt && !prompt.includes("{{history}}")) {
    toastr.warning("To include message history, you must use the {{history}} macro in the prompt.");
  }
}

function refresh_settings() {
  // Refresh all settings UI elements according to the current settings
  debug("Refreshing settings...");

  updateErrorDetectionSettings();
  void updateAllDropdowns();
  validateAndFixSettings();

  update_profile_section();

  // Iterate through the settings map and set each element to the current setting value
  for (const [key, [element, type]] of Object.entries(settings_ui_map)) {
    set_setting_ui_element(key, element, type);
  }

  // Refresh Auto-Lorebooks settings UI (merged extension)
  refresh_lorebooks_settings_ui();

  // Enable or disable settings based on others
  if (chat_enabled()) {
    updateConditionalSettings();
  }

  // Settings not in the config
  // set group chat character enable button state
  set_character_enabled_button_states();
}

async function update_running_scene_recap_preset_dropdown() {
  const $preset_select = $(selectorsExtension.running.completionPreset);
  const recap_preset = get_settings('running_scene_recap_completion_preset');
  const preset_options = await get_presets();
  $preset_select.empty();
  $preset_select.append(`<option value="">Same as Current</option>`);
  for (const option of preset_options) {
    $preset_select.append(`<option value="${option}">${option}</option>`);
  }
  $preset_select.val(recap_preset);
  $preset_select.off('click').on('click', () => update_running_scene_recap_preset_dropdown());
}

async function update_running_scene_recap_connection_profile_dropdown() {
  const $connection_select = $(selectorsExtension.running.connectionProfile);
  const recap_connection = get_settings('running_scene_recap_connection_profile');
  const connection_options = await get_connection_profiles();
  $connection_select.empty();
  $connection_select.append(`<option value="">Same as Current</option>`);
  if (connection_options && Array.isArray(connection_options)) {
    for (const option of connection_options) {
      $connection_select.append(`<option value="${option}">${option}</option>`);
    }
  }
  $connection_select.val(recap_connection);
  $connection_select.off('click').on('click', () => update_running_scene_recap_connection_profile_dropdown());
}

function loadLorebooksSettings() {
  return extension_settings.autoLorebooks || {};
}

function refreshGlobalSettingsUI(settings ) {
  $(selectorsExtension.lorebook.deleteOnChat).prop('checked', settings.deleteOnChatDelete ?? true);
  $(selectorsExtension.lorebook.autoReorder).prop('checked', settings.autoReorderAlphabetically ?? true);
  $(selectorsExtension.lorebook.nameTemplate).val(settings.nameTemplate || 'z-AutoLB-{{chat}}');
}

// Removed legacy queue settings UI (queue is mandatory)

function refreshRecapProcessingUI() {
  // All recap processing settings are now per-profile, read from profile settings
  $(selectorsExtension.lorebook.skipDuplicates).prop('checked', get_settings('auto_lorebooks_recap_skip_duplicates') ?? true);
  $(selectorsExtension.lorebook.mergePrefill).val(get_settings('auto_lorebooks_recap_merge_prefill') || '');
  $(selectorsExtension.lorebook.mergePrompt).val(get_settings('auto_lorebooks_recap_merge_prompt') || '');
  $(selectorsExtension.lorebook.mergeIncludePresetPrompts).prop('checked', get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false);
  $(selectorsExtension.lorebook.lookupPrefill).val(get_settings('auto_lorebooks_recap_lorebook_entry_lookup_prefill') || '');
  $(selectorsExtension.lorebook.lookupPrompt).val(get_settings('auto_lorebooks_recap_lorebook_entry_lookup_prompt') || '');
  $(selectorsExtension.lorebook.lookupIncludePresetPrompts).prop('checked', get_settings('auto_lorebooks_recap_lorebook_entry_lookup_include_preset_prompts') ?? false);
  $(selectorsExtension.lorebook.dedupePrefill).val(get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_prefill') || '');
  $(selectorsExtension.lorebook.dedupePrompt).val(get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_prompt') || '');
  $(selectorsExtension.lorebook.dedupeIncludePresetPrompts).prop('checked', get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_include_preset_prompts') ?? false);
}

function refreshEntityTypesUI() {
  ensureEntityTypesSetting();
  renderEntityTypesList();
}

async function refreshConnectionDropdowns() {
  await update_autolorebooks_recap_merge_connection_dropdown();
  await update_autolorebooks_recap_merge_preset_dropdown();
  await update_autolorebooks_recap_triage_connection_dropdown();
  await update_autolorebooks_recap_triage_preset_dropdown();
  await update_autolorebooks_recap_lorebook_entry_deduplicate_connection_dropdown();
  await update_autolorebooks_recap_lorebook_entry_deduplicate_preset_dropdown();
}

function refresh_lorebooks_settings_ui() {
  try {
    // Load global settings (not per-profile)
    const settings = loadLorebooksSettings();

    // Refresh global settings UI
    refreshGlobalSettingsUI(settings);

    // Refresh per-profile settings UI (recap processing)
    // These functions now read directly from profile via get_settings()
    refreshRecapProcessingUI();

    refreshEntityTypesUI();
    void refreshConnectionDropdowns();

    debug("Auto-Lorebooks settings UI refreshed");

  } catch (err) {
    error("Error refreshing Auto-Lorebooks settings UI", err);
  }
}

async function update_autolorebooks_recap_merge_connection_dropdown() {
  const $connection_select = $(selectorsExtension.lorebook.mergeConnection);
  const currentValue = get_settings('auto_lorebooks_recap_merge_connection_profile') || '';
  const connection_options = await get_connection_profiles();
  $connection_select.empty();
  $connection_select.append(`<option value="">Same as Current</option>`);
  if (connection_options && Array.isArray(connection_options)) {
    for (const option of connection_options) {
      $connection_select.append(`<option value="${option}">${option}</option>`);
    }
  }
  $connection_select.val(currentValue);
  $connection_select.off('click').on('click', () => update_autolorebooks_recap_merge_connection_dropdown());
}

async function update_autolorebooks_recap_merge_preset_dropdown() {
  const $preset_select = $(selectorsExtension.lorebook.mergePreset);
  const currentValue = get_settings('auto_lorebooks_recap_merge_completion_preset') || '';
  const preset_options = await get_presets();
  $preset_select.empty();
  $preset_select.append(`<option value="">Same as Current</option>`);
  for (const option of preset_options) {
    $preset_select.append(`<option value="${option}">${option}</option>`);
  }
  $preset_select.val(currentValue);
  $preset_select.off('click').on('click', () => update_autolorebooks_recap_merge_preset_dropdown());
}

async function update_autolorebooks_recap_triage_connection_dropdown() {
  const $connection_select = $(selectorsExtension.lorebook.lookupConnection);
  const currentValue = get_settings('auto_lorebooks_recap_lorebook_entry_lookup_connection_profile') || '';
  const connection_options = await get_connection_profiles();
  $connection_select.empty();
  $connection_select.append(`<option value="">Same as Current</option>`);
  if (connection_options && Array.isArray(connection_options)) {
    for (const option of connection_options) {
      $connection_select.append(`<option value="${option}">${option}</option>`);
    }
  }
  $connection_select.val(currentValue);
  $connection_select.off('click').on('click', () => update_autolorebooks_recap_triage_connection_dropdown());
}

async function update_autolorebooks_recap_triage_preset_dropdown() {
  const $preset_select = $(selectorsExtension.lorebook.lookupPreset);
  const currentValue = get_settings('auto_lorebooks_recap_lorebook_entry_lookup_completion_preset') || '';
  const preset_options = await get_presets();
  $preset_select.empty();
  $preset_select.append(`<option value="">Same as Current</option>`);
  for (const option of preset_options) {
    $preset_select.append(`<option value="${option}">${option}</option>`);
  }
  $preset_select.val(currentValue);
  $preset_select.off('click').on('click', () => update_autolorebooks_recap_triage_preset_dropdown());
}

async function update_autolorebooks_recap_lorebook_entry_deduplicate_connection_dropdown() {
  const $connection_select = $(selectorsExtension.lorebook.dedupeConnection);
  const currentValue = get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_connection_profile') || '';
  const connection_options = await get_connection_profiles();
  $connection_select.empty();
  $connection_select.append(`<option value="">Same as Current</option>`);
  if (connection_options && Array.isArray(connection_options)) {
    for (const option of connection_options) {
      $connection_select.append(`<option value="${option}">${option}</option>`);
    }
  }
  $connection_select.val(currentValue);
  $connection_select.off('click').on('click', () => update_autolorebooks_recap_lorebook_entry_deduplicate_connection_dropdown());
}

async function update_autolorebooks_recap_lorebook_entry_deduplicate_preset_dropdown() {
  const $preset_select = $(selectorsExtension.lorebook.dedupePreset);
  const currentValue = get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_completion_preset') || '';
  const preset_options = await get_presets();
  $preset_select.empty();
  $preset_select.append(`<option value="">Same as Current</option>`);
  for (const option of preset_options) {
    $preset_select.append(`<option value="${option}">${option}</option>`);
  }
  $preset_select.val(currentValue);
  $preset_select.off('click').on('click', () => update_autolorebooks_recap_lorebook_entry_deduplicate_preset_dropdown());
}

export {
  update_profile_section,
  refresh_settings,
  update_error_detection_preset_dropdown,
  update_scene_recap_preset_dropdown,
  update_scene_recap_connection_profile_dropdown,
  update_auto_scene_break_preset_dropdown,
  update_auto_scene_break_connection_profile_dropdown,
  update_running_scene_recap_preset_dropdown,
  update_running_scene_recap_connection_profile_dropdown };
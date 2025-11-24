import {
  toast,
  selectorsExtension,
  extension_settings,
  MODULE_NAME,
  get_current_character_identifier,
  get_current_chat_identifier,
  saveSettingsDebounced,
  set_settings,
  get_settings,
  default_settings
} from './index.js';
import { getArtifactSelector } from './selectorsExtension.js';
import { get_connection_profile_objects } from './connectionProfiles.js';
import { get_presets } from './presetManager.js';
import { updatePreset, deletePreset, duplicatePreset, renamePreset, setCharacterStickyPreset, setChatStickyPreset, getCharacterStickyPreset, getChatStickyPreset, clearCharacterSticky, clearChatSticky, listPresets, getPreset } from './operationsPresets.js';
import { updateArtifact, deleteArtifact, listArtifacts, createNewArtifactVersion } from './operationArtifacts.js';
import { exportPreset } from './operationsPresetsExport.js';
import { importPreset } from './operationsPresetsImport.js';
import { resolveOperationsPreset, setUserSelectedPreset } from './operationsPresetsResolution.js';

const MODAL_FADE_DURATION_MS = 200;
const OPERATION_TYPE_DATA_KEY = 'operation-type';

let isLoadingPreset = false;

const OPERATION_TYPES = [
  'auto_lorebooks_bulk_populate',
  'auto_scene_break',
  'scene_recap_error_detection',
  'scene_recap',
  'running_scene_recap',
  'auto_lorebooks_recap_lorebook_entry_lookup',
  'auto_lorebooks_recap_lorebook_entry_deduplicate',
  'auto_lorebooks_recap_merge',
  'auto_lorebooks_recap_lorebook_entry_compaction',
  'parse_scene_recap'
];

function ensureNotDefaultPreset() {
  const presetName = $(selectorsExtension.operationsPresets.selector).val();

  if (presetName !== 'Default') {
    return presetName;
  }

  // Auto-generate versioned name like "Default v2", "Default v3", etc.
  const presets = listPresets();
  const presetNames = new Set(presets.map(p => p.name));
  const baseName = 'Default';
  let version = 2;
  let newName = `${baseName} v${version}`;

  while (presetNames.has(newName)) {
    version++;
    newName = `${baseName} v${version}`;
  }

  duplicatePreset('Default', newName);
  saveSettingsDebounced();

  if (!getPreset(newName)) {
    toast('Failed to create preset, please try again', 'error');
    return null;
  }

  refreshPresetSelector();
  $(selectorsExtension.operationsPresets.selector).val(newName);
  setUserSelectedPreset(newName);
  refreshPresetButtons();
  refreshStickyButtonColors();
  refreshAllArtifactSelectors();

  toast(`Created new preset: "${newName}"`, 'info');

  return newName;
}

/**
 * Initialize operations presets UI bindings
 * PLACEHOLDER: These are basic bindings to demonstrate UI functionality
 * Full implementation will be added in Phase 3
 */
export function initializeOperationsPresetsUI() {
  bindPresetControls();
  bindArtifactControls();
  bindArtifactEditorModal();
  loadActivePreset();
}

/**
 * Load the active preset based on sticky/profile resolution
 * Called on initialization and when chat/character changes
 */
export function loadActivePreset() {
  isLoadingPreset = true;
  refreshPresetSelector();
  const { presetName } = resolveOperationsPreset();
  $(selectorsExtension.operationsPresets.selector).val(presetName);
  refreshPresetBadge();
  refreshPresetButtons();
  refreshAllArtifactSelectors();
  refreshPresetDescription();
  isLoadingPreset = false;
}

/**
 * Bind preset-level controls (save, rename, delete, import, export, sticky)
 */
function bindPresetControls() {
  $(selectorsExtension.operationsPresets.selector).on('change', () => {
    const selectedPreset = $(selectorsExtension.operationsPresets.selector).val();
    if (!isLoadingPreset) {
      setUserSelectedPreset(selectedPreset);
    }
    refreshAllArtifactSelectors();
    refreshStickyButtonColors();
    refreshPresetButtons();
    refreshPresetDescription();
  });

  $(selectorsExtension.operationsPresets.description).on('change', () => {
    const presetName = $(selectorsExtension.operationsPresets.selector).val();
    const description = $(selectorsExtension.operationsPresets.description).val();

    if (presetName === 'Default') {
      toast('Cannot edit Default preset description', 'error');
      return;
    }

    try {
      updatePreset(presetName, { description });
      saveSettingsDebounced();
    } catch (err) {
      toast(`Failed to update description: ${err.message}`, 'error');
    }
  });

  $(selectorsExtension.operationsPresets.rename).on('click', () => {
    const oldName = $(selectorsExtension.operationsPresets.selector).val();
    const newName = prompt('Enter new preset name:', oldName);
    if (!newName || newName === oldName) {
      return;
    }

    try {
      renamePreset(oldName, newName);
      saveSettingsDebounced();
      refreshPresetSelector();
      $(selectorsExtension.operationsPresets.selector).val(newName);
      toast(`Renamed preset to: "${newName}"`, 'success');
    } catch (err) {
      toast(`Failed to rename preset: ${err.message}`, 'error');
    }
  });

  $(selectorsExtension.operationsPresets.delete).on('click', () => {
    const presetName = $(selectorsExtension.operationsPresets.selector).val();
    if (presetName === 'Default') {
      toast('Cannot delete Default preset', 'error');
      return;
    }

    if (!confirm(`Delete preset "${presetName}"?`)) {
      return;
    }

    try {
      deletePreset(presetName);
      saveSettingsDebounced();
      loadActivePreset();
      toast(`Deleted preset: "${presetName}"`, 'success');
    } catch (err) {
      toast(`Failed to delete preset: ${err.message}`, 'error');
    }
  });

  $(selectorsExtension.operationsPresets.import).on('click', () => {
    $(selectorsExtension.operationsPresets.importFile).click();
  });

  $(selectorsExtension.operationsPresets.importFile).on('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
      return;
    }

    try {
      const jsonString = await file.text();
      const presetName = await importPreset(jsonString);
      saveSettingsDebounced();
      setUserSelectedPreset(presetName);
      loadActivePreset();
      toast(`Imported preset: "${presetName}"`, 'success');
    } catch (err) {
      toast(`Failed to import preset: ${err.message}`, 'error');
    } finally {
      e.target.value = '';
    }
  });

  $(selectorsExtension.operationsPresets.export).on('click', () => {
    const presetName = $(selectorsExtension.operationsPresets.selector).val();
    try {
      const jsonString = exportPreset(presetName);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${presetName.replace(/[^a-z0-9]/gi, '_')}_preset.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`Exported preset: "${presetName}"`, 'success');
    } catch (err) {
      toast(`Failed to export preset: ${err.message}`, 'error');
    }
  });

  $(selectorsExtension.operationsPresets.duplicate).on('click', () => {
    const presetName = $(selectorsExtension.operationsPresets.selector).val();
    const newName = `Copy of ${presetName}`;

    try {
      duplicatePreset(presetName, newName);
      saveSettingsDebounced();
      refreshPresetSelector();
      $(selectorsExtension.operationsPresets.selector).val(newName);
      toast(`Duplicated preset as: "${newName}"`, 'success');
    } catch (err) {
      toast(`Failed to duplicate preset: ${err.message}`, 'error');
    }
  });

  $(selectorsExtension.operationsPresets.stickyCharacter).on('click', () => {
    const presetName = $(selectorsExtension.operationsPresets.selector).val();
    const characterKey = get_current_character_identifier();

    if (!characterKey) {
      toast('No character selected', 'error');
      return;
    }

    try {
      const currentSticky = getCharacterStickyPreset(characterKey);
      if (currentSticky === presetName) {
        clearCharacterSticky(characterKey);
        saveSettingsDebounced();
        toast(`Removed character sticky`, 'success');
      } else {
        setCharacterStickyPreset(characterKey, presetName);
        saveSettingsDebounced();
        toast(`Preset "${presetName}" stickied to character`, 'success');
      }
      refreshPresetBadge();
      refreshStickyButtonColors();
    } catch (err) {
      toast(`Failed to toggle character sticky: ${err.message}`, 'error');
    }
  });

  $(selectorsExtension.operationsPresets.stickyChat).on('click', () => {
    const presetName = $(selectorsExtension.operationsPresets.selector).val();
    const chatId = get_current_chat_identifier();

    if (!chatId) {
      toast('No chat selected', 'error');
      return;
    }

    try {
      const currentSticky = getChatStickyPreset(chatId);
      if (currentSticky === presetName) {
        clearChatSticky(chatId);
        saveSettingsDebounced();
        toast(`Removed chat sticky`, 'success');
      } else {
        setChatStickyPreset(chatId, presetName);
        saveSettingsDebounced();
        toast(`Preset "${presetName}" stickied to chat`, 'success');
      }
      refreshPresetBadge();
      refreshStickyButtonColors();
    } catch (err) {
      toast(`Failed to toggle chat sticky: ${err.message}`, 'error');
    }
  });
}

/**
 * Bind artifact-level controls (edit, rename, delete, duplicate)
 */
function bindArtifactControls() {
  // Add change handlers to all artifact selectors
  for (const operationType of OPERATION_TYPES) {
    $(getArtifactSelector(operationType)).on('change', () => {
      const selectedArtifact = $(getArtifactSelector(operationType)).val();
      const presetName = ensureNotDefaultPreset();

      if (!presetName) {
        return;
      }

      // Update preset with new artifact selection
      updatePreset(presetName, {
        operations: {
          [operationType]: selectedArtifact
        }
      });
      saveSettingsDebounced();
      refreshArtifactButtons(operationType);
    });
  }

  $(document).on('click', selectorsExtension.operationsPresets.artifactEditClass, async (e) => {
    const operationType = $(e.currentTarget).data(OPERATION_TYPE_DATA_KEY);
    await openArtifactEditor(operationType);
  });

  $(document).on('click', selectorsExtension.operationsPresets.artifactRenameClass, (e) => {
    const operationType = $(e.currentTarget).data(OPERATION_TYPE_DATA_KEY);
    const currentName = $(getArtifactSelector(operationType)).val();

    if (currentName === 'Default') {
      toast('Cannot rename Default artifact. Duplicate it first.', 'error');
      return;
    }

    const newName = prompt('Enter new artifact name:', currentName);

    if (!newName || newName === currentName) {
      return;
    }

    try {
      const allArtifacts = get_settings('operation_artifacts') || {};
      const artifacts = allArtifacts[operationType] || [];
      const artifact = artifacts.find(a => a.name === currentName);
      if (!artifact) {
        throw new Error(`Artifact not found: ${currentName}`);
      }

      artifact.name = newName;
      artifact.modifiedAt = Date.now();
      allArtifacts[operationType] = artifacts;
      set_settings('operation_artifacts', allArtifacts);

      // Update all presets that reference this artifact
      const presets = get_settings('operations_presets') || {};
      for (const preset of Object.values(presets)) {
        if (preset.operations[operationType] === currentName) {
          preset.operations[operationType] = newName;
        }
      }
      set_settings('operations_presets', presets);

      saveSettingsDebounced();
      refreshArtifactSelector(operationType, newName);
      toast(`Renamed artifact to: "${newName}"`, 'success');
    } catch (err) {
      toast(`Failed to rename artifact: ${err.message}`, 'error');
    }
  });

  $(document).on('click', selectorsExtension.operationsPresets.artifactDeleteClass, (e) => {
    const operationType = $(e.currentTarget).data(OPERATION_TYPE_DATA_KEY);
    const artifactName = $(getArtifactSelector(operationType)).val();

    if (artifactName === 'Default') {
      toast('Cannot delete Default artifact', 'error');
      return;
    }

    if (!confirm(`Delete artifact "${artifactName}"?`)) {
      return;
    }

    try {
      deleteArtifact(operationType, artifactName);
      saveSettingsDebounced();
      refreshArtifactSelector(operationType, 'Default');
      toast(`Deleted artifact: "${artifactName}"`, 'success');
    } catch (err) {
      toast(`Failed to delete artifact: ${err.message}`, 'error');
    }
  });

  $(document).on('click', selectorsExtension.operationsPresets.artifactDuplicateClass, (e) => {
    const operationType = $(e.currentTarget).data(OPERATION_TYPE_DATA_KEY);
    const artifactName = $(getArtifactSelector(operationType)).val();

    const presetName = ensureNotDefaultPreset();
    if (!presetName) {
      return;
    }

    const newArtifactName = createNewArtifactVersion(operationType, artifactName);

    // Update preset to reference the new artifact
    updatePreset(presetName, {
      operations: {
        [operationType]: newArtifactName
      }
    });

    saveSettingsDebounced();
    refreshArtifactSelector(operationType, newArtifactName);
    toast(`Duplicated artifact as: "${newArtifactName}"`, 'success');
  });
}

/**
 * Bind artifact editor modal controls
 */
function bindArtifactEditorModal() {
  $(selectorsExtension.operationsPresets.modalClose).on('click', closeArtifactEditor);
  $(selectorsExtension.operationsPresets.modalCancel).on('click', closeArtifactEditor);

  $(selectorsExtension.operationsPresets.modalSave).on('click', () => {
    const operationType = $(selectorsExtension.operationsPresets.modal).data(OPERATION_TYPE_DATA_KEY);
    const artifactName = $(selectorsExtension.operationsPresets.modalName).val();

    const artifactData = {
      name: artifactName,
      description: $(selectorsExtension.operationsPresets.modalDescription).val(),
      prompt: $(selectorsExtension.operationsPresets.modalPrompt).val(),
      prefill: $(selectorsExtension.operationsPresets.modalPrefill).val(),
      connection_profile: $(selectorsExtension.operationsPresets.modalConnection).val() || null,
      completion_preset_name: $(selectorsExtension.operationsPresets.modalPreset).val(),
      include_preset_prompts: $(selectorsExtension.operationsPresets.modalIncludeFlag).prop('checked')
    };

    if (operationType === 'auto_scene_break') {
      artifactData.forced_prompt = $(selectorsExtension.operationsPresets.modalForcedPrompt).val();
      artifactData.forced_prefill = $(selectorsExtension.operationsPresets.modalForcedPrefill).val();
      artifactData.forced_connection_profile = $(selectorsExtension.operationsPresets.modalForcedConnection).val() || null;
      artifactData.forced_completion_preset_name = $(selectorsExtension.operationsPresets.modalForcedPreset).val();
      artifactData.forced_include_preset_prompts = $(selectorsExtension.operationsPresets.modalForcedIncludeFlag).prop('checked');
    }

    try {
      const resultArtifactName = updateArtifact(operationType, artifactName, artifactData);
      const wasDefaultEdited = resultArtifactName !== artifactName;

      if (wasDefaultEdited) {
        const presetName = ensureNotDefaultPreset();
        if (!presetName) {
          return;
        }

        updatePreset(presetName, {
          operations: {
            [operationType]: resultArtifactName
          }
        });
      }

      saveSettingsDebounced();
      toast('Artifact saved successfully', 'success');
      closeArtifactEditor();
      refreshArtifactSelector(operationType, resultArtifactName);
    } catch (err) {
      toast(`Failed to save artifact: ${err.message}`, 'error');
    }
  });

  $(selectorsExtension.operationsPresets.modalBackdrop).on('click', closeArtifactEditor);
}


/**
 * Populate connection profile dropdown
 */
function populateConnectionProfileDropdown() {
  const $select = $(selectorsExtension.operationsPresets.modalConnection);
  const currentValue = $select.val();
  const connection_profiles = get_connection_profile_objects();

  $select.empty();
  $select.append($('<option>').val('').text('Use Current Connection'));

  if (connection_profiles && Array.isArray(connection_profiles)) {
    for (const profile of connection_profiles) {
      $select.append($('<option>').val(profile.id).text(profile.name));
    }
  }

  if (currentValue) {
    $select.val(currentValue);
  }
}

/**
 * Populate completion preset dropdown
 */
async function populateCompletionPresetDropdown() {
  const $select = $(selectorsExtension.operationsPresets.modalPreset);
  const currentValue = $select.val();
  const preset_options = await get_presets();

  $select.empty();
  $select.append($('<option>').val('').text('Use Default Preset'));

  for (const option of preset_options) {
    $select.append($('<option>').val(option).text(option));
  }

  if (currentValue) {
    $select.val(currentValue);
  }
}

/**
 * Open the artifact editor modal for a specific operation type
 * @param {string} operationType - The operation type to edit
 */
async function openArtifactEditor(operationType) {
  const operationNames = {
    'scene_recap': 'Scene Recap (Stage 1: Extraction)',
    'parse_scene_recap': 'Parse Scene Recap (Stage 2: Filtering)',
    'scene_recap_error_detection': 'Scene Recap Error Detection',
    'auto_scene_break': 'Auto Scene Break Detection',
    'running_scene_recap': 'Running Scene Recap',
    'auto_lorebooks_recap_merge': 'Auto-Lorebooks: Recap Merge',
    'auto_lorebooks_recap_lorebook_entry_lookup': 'Auto-Lorebooks: Entry Lookup',
    'auto_lorebooks_recap_lorebook_entry_deduplicate': 'Auto-Lorebooks: Entry Deduplicate',
    'auto_lorebooks_bulk_populate': 'Auto-Lorebooks: Bulk Populate',
    'auto_lorebooks_recap_lorebook_entry_compaction': 'Auto-Lorebooks: Entry Compaction'
  };

  const operationName = operationNames[operationType] || operationType;
  const artifactName = $(getArtifactSelector(operationType)).val();

  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];
  let config = operationArtifacts.find(a => a.name === artifactName);

  if (!config) {
    const defaultArtifacts = default_settings.operation_artifacts;
    if (defaultArtifacts && defaultArtifacts[operationType]) {
      config = defaultArtifacts[operationType].find(a => a.name === artifactName);
    }
  }

  if (!config) {
    toast(`Artifact not found: ${artifactName}`, 'error');
    return;
  }

  populateConnectionProfileDropdown();
  await populateCompletionPresetDropdown();

  if (operationType === 'auto_scene_break') {
    const $forcedConnectionSelect = $(selectorsExtension.operationsPresets.modalForcedConnection);
    const connection_profiles = get_connection_profile_objects();
    $forcedConnectionSelect.empty();
    $forcedConnectionSelect.append('<option value="">Use Current Connection</option>');
    for (const profile of connection_profiles) {
      $forcedConnectionSelect.append(`<option value="${profile.id}">${profile.name}</option>`);
    }

    const $forcedPresetSelect = $(selectorsExtension.operationsPresets.modalForcedPreset);
    const preset_options = await get_presets();
    $forcedPresetSelect.empty();
    $forcedPresetSelect.append('<option value="">Use Default Preset</option>');
    for (const preset of preset_options) {
      $forcedPresetSelect.append(`<option value="${preset}">${preset}</option>`);
    }
  }

  $(selectorsExtension.operationsPresets.modalTitle).text(`Edit Operation Artifact - ${operationName}`);
  $(selectorsExtension.operationsPresets.modalName).val(config.name);
  $(selectorsExtension.operationsPresets.modalDescription).val(config.customLabel || '');
  $(selectorsExtension.operationsPresets.modalPrompt).val(config.prompt);
  $(selectorsExtension.operationsPresets.modalPrefill).val(config.prefill);
  $(selectorsExtension.operationsPresets.modalConnection).val(config.connection_profile || '');
  $(selectorsExtension.operationsPresets.modalPreset).val(config.completion_preset_name);
  $(selectorsExtension.operationsPresets.modalIncludeFlag).prop('checked', config.include_preset_prompts);

  if (operationType === 'auto_scene_break') {
    $(selectorsExtension.operationsPresets.modalForcedPrompt).val(config.forced_prompt || '');
    $(selectorsExtension.operationsPresets.modalForcedPrefill).val(config.forced_prefill || '');
    $(selectorsExtension.operationsPresets.modalForcedConnection).val(config.forced_connection_profile || '');
    $(selectorsExtension.operationsPresets.modalForcedPreset).val(config.forced_completion_preset_name || '');
    $(selectorsExtension.operationsPresets.modalForcedIncludeFlag).prop('checked', config.forced_include_preset_prompts || false);
    $(selectorsExtension.operationsPresets.modalForcedSection).show();
  } else {
    $(selectorsExtension.operationsPresets.modalForcedSection).hide();
  }

  $(selectorsExtension.operationsPresets.modal).data(OPERATION_TYPE_DATA_KEY, operationType);

  // Populate macro reference (async, don't block modal)
  void populateMacroReference();

  $(selectorsExtension.operationsPresets.modal).fadeIn(MODAL_FADE_DURATION_MS);
}

/**
 * Populate the macro reference dropdown with available macros
 */
async function populateMacroReference() {
  try {
    const { macroDescriptions } = await import('./macros/index.js');

    if (!macroDescriptions || Object.keys(macroDescriptions).length === 0) {
      $(selectorsExtension.operationsPresets.modalMacroReferenceContent).html('<p class="opacity50p">No macros available.</p>');
      return;
    }

    // Build HTML for macro reference
    let html = '<div style="font-size: 0.9em;">';

    // Group by category (extract from usedBy)
    const categories = {
      'Scene Recap': [],
      'Running Scene Recap': [],
      'Scene Break Detection': [],
      'Lorebook Processing': [],
      'General': []
    };

    for (const [macroName, desc] of Object.entries(macroDescriptions)) {
      const usedByText = (desc.usedBy || []).join(', ');
      let category = 'General';

      if (usedByText.includes('scene-recap') || usedByText.includes('sceneBreak')) {
        category = 'Scene Recap';
      } else if (usedByText.includes('running-scene-recap')) {
        category = 'Running Scene Recap';
      } else if (usedByText.includes('scene-break-detection')) {
        category = 'Scene Break Detection';
      } else if (usedByText.includes('lorebook') || usedByText.includes('merge')) {
        category = 'Lorebook Processing';
      }

      categories[category].push({ name: macroName, desc });
    }

    const MAX_FORMAT_LENGTH = 80;
    const FORMAT_TRUNCATE_LENGTH = 77;

    // Render each category
    for (const [category, macros] of Object.entries(categories)) {
      if (macros.length === 0) {
        continue;
      }

      html += `<div style="margin-bottom: 15px;">`;
      html += `<h5 style="margin: 10px 0 8px 0; color: rgba(255,255,255,0.7); font-size: 0.95em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">${category}</h5>`;

      for (const { name, desc } of macros) {
        html += `<div style="margin-bottom: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-left: 3px solid rgba(100,150,255,0.5); border-radius: 3px;">`;
        html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">`;
        html += `<code style="background: rgba(100,150,255,0.15); padding: 2px 6px; border-radius: 3px; font-size: 0.9em; font-weight: 600;">{{${name}}}</code>`;
        html += `<button onclick="navigator.clipboard.writeText('{{${name}}}'); window.toastr?.success('Copied to clipboard!')" style="padding: 2px 8px; font-size: 0.75em; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; cursor: pointer;" title="Copy macro">📋</button>`;
        html += `</div>`;
        html += `<div style="font-size: 0.85em; opacity: 0.7; margin-top: 4px;">`;
        html += `<div><strong>Input:</strong> ${desc.source || 'N/A'}</div>`;
        if (desc.format) {
          const shortFormat = desc.format.length > MAX_FORMAT_LENGTH ? desc.format.slice(0, FORMAT_TRUNCATE_LENGTH) + '...' : desc.format;
          html += `<div><strong>Output:</strong> ${shortFormat}</div>`;
        }
        html += `</div>`;
        html += `</div>`;
      }

      html += `</div>`;
    }

    html += '</div>';
    $(selectorsExtension.operationsPresets.modalMacroReferenceContent).html(html);

  } catch (error) {
    console.error('Failed to load macro reference:', error);
    $(selectorsExtension.operationsPresets.modalMacroReferenceContent).html('<p class="opacity50p">Error loading macros.</p>');
  }
}

/**
 * Close the artifact editor modal
 */
function closeArtifactEditor() {
  $(selectorsExtension.operationsPresets.modal).fadeOut(MODAL_FADE_DURATION_MS);
}

function refreshPresetSelector() {
  const presets = listPresets();
  const $selector = $(selectorsExtension.operationsPresets.selector);
  const currentValue = $selector.val();

  $selector.empty();
  for (const preset of presets) {
    $selector.append($('<option>').val(preset.name).text(preset.name));
  }

  if (presets.some(p => p.name === currentValue)) {
    $selector.val(currentValue);
  }
}

function refreshPresetBadge() {
  const chatId = get_current_chat_identifier();
  const characterKey = get_current_character_identifier();

  const chatSticky = extension_settings[MODULE_NAME].chat_sticky_presets?.[chatId];
  const characterSticky = extension_settings[MODULE_NAME].character_sticky_presets?.[characterKey];

  const $badge = $(selectorsExtension.operationsPresets.badge);
  $badge.removeClass('fa-solid fa-file fa-user fa-comments');

  if (chatSticky) {
    $badge.addClass('fa-solid fa-comments');
    $badge.attr('title', 'Using chat-specific preset');
  } else if (characterSticky) {
    $badge.addClass('fa-solid fa-user');
    $badge.attr('title', 'Using character-specific preset');
  } else {
    $badge.addClass('fa-solid fa-file');
    $badge.attr('title', 'Using profile default preset');
  }

  refreshStickyButtonColors();
}

function refreshPresetDescription() {
  const presetName = $(selectorsExtension.operationsPresets.selector).val();

  if (!presetName || typeof presetName !== 'string') {
    return;
  }

  const preset = getPreset(presetName);
  const $description = $(selectorsExtension.operationsPresets.description);

  if (preset) {
    $description.val(preset.description || '');
  } else {
    $description.val('');
  }
}

function refreshStickyButtonColors() {
  const presetName = $(selectorsExtension.operationsPresets.selector).val();
  const chatId = get_current_chat_identifier();
  const characterKey = get_current_character_identifier();

  if (!chatId && !characterKey) {
    return;
  }

  const chatSticky = chatId ? getChatStickyPreset(chatId) : null;
  const characterSticky = characterKey ? getCharacterStickyPreset(characterKey) : null;

  const $charButton = $(selectorsExtension.operationsPresets.stickyCharacter);
  const $chatButton = $(selectorsExtension.operationsPresets.stickyChat);
  const $charIcon = $charButton.find('i');
  const $chatIcon = $chatButton.find('i');

  const lockClass = 'fa-lock';
  const unlockClass = 'fa-unlock';
  const highlightClass = 'button_highlight';

  if (characterSticky === presetName) {
    $charButton.addClass(highlightClass);
    $charIcon.removeClass(unlockClass).addClass(lockClass);
  } else {
    $charButton.removeClass(highlightClass);
    $charIcon.removeClass(lockClass).addClass(unlockClass);
  }

  if (chatSticky === presetName) {
    $chatButton.addClass(highlightClass);
    $chatIcon.removeClass(unlockClass).addClass(lockClass);
  } else {
    $chatButton.removeClass(highlightClass);
    $chatIcon.removeClass(lockClass).addClass(unlockClass);
  }
}

function refreshArtifactSelector(operationType, selectValue = null) {
  const artifacts = listArtifacts(operationType);
  const $selector = $(getArtifactSelector(operationType));
  const currentValue = selectValue || $selector.val();

  $selector.empty();
  for (const artifact of artifacts) {
    $selector.append($('<option>').val(artifact.name).text(artifact.name));
  }

  if (artifacts.some(a => a.name === currentValue)) {
    $selector.val(currentValue);
  }

  refreshArtifactButtons(operationType);
}

function refreshAllArtifactSelectors() {
  const presetName = $(selectorsExtension.operationsPresets.selector).val();

  if (!presetName || typeof presetName !== 'string') {
    return;
  }

  const preset = getPreset(presetName);

  if (!preset) {
    return;
  }

  for (const operationType of OPERATION_TYPES) {
    const artifactName = preset.operations[operationType];
    if (artifactName) {
      refreshArtifactSelector(operationType, artifactName);
    }
  }
}

function refreshArtifactButtons(operationType) {
  const $selector = $(getArtifactSelector(operationType));
  const artifactName = $selector.val();
  const isDefault = artifactName === 'Default';

  const $renameBtn = $(`button[data-operation-type="${operationType}"].auto_recap_artifact_rename`);
  const $deleteBtn = $(`button[data-operation-type="${operationType}"].auto_recap_artifact_delete`);

  if (isDefault) {
    $renameBtn.prop('disabled', true);
    $deleteBtn.prop('disabled', true);
  } else {
    $renameBtn.prop('disabled', false);
    $deleteBtn.prop('disabled', false);
  }
}

function refreshPresetButtons() {
  const presetName = $(selectorsExtension.operationsPresets.selector).val();
  const isDefault = presetName === 'Default';

  $(selectorsExtension.operationsPresets.rename).prop('disabled', isDefault);
  $(selectorsExtension.operationsPresets.delete).prop('disabled', isDefault);
}

export { refreshPresetSelector, refreshPresetBadge, refreshArtifactSelector };

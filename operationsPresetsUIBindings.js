import {
  toast,
  selectorsExtension
} from './index.js';

const MODAL_FADE_DURATION_MS = 200;

/**
 * Initialize operations presets UI bindings
 * PLACEHOLDER: These are basic bindings to demonstrate UI functionality
 * Full implementation will be added in Phase 3
 */
export function initializeOperationsPresetsUI() {
  bindPresetControls();
  bindArtifactControls();
  bindArtifactEditorModal();
}

/**
 * Bind preset-level controls (save, rename, delete, import, export, sticky)
 */
function bindPresetControls() {
  $(selectorsExtension.operationsPresets.save).on('click', () => {
    toast('Preset save functionality not yet implemented', 'info');
  });

  $(selectorsExtension.operationsPresets.rename).on('click', () => {
    toast('Preset rename functionality not yet implemented', 'info');
  });

  $(selectorsExtension.operationsPresets.delete).on('click', () => {
    toast('Preset delete functionality not yet implemented', 'info');
  });

  $(selectorsExtension.operationsPresets.import).on('click', () => {
    $(selectorsExtension.operationsPresets.importFile).click();
  });

  $(selectorsExtension.operationsPresets.importFile).on('change', () => {
    toast('Preset import functionality not yet implemented', 'info');
  });

  $(selectorsExtension.operationsPresets.export).on('click', () => {
    toast('Preset export functionality not yet implemented', 'info');
  });

  $(selectorsExtension.operationsPresets.duplicate).on('click', () => {
    toast('Preset duplicate functionality not yet implemented', 'info');
  });

  $(selectorsExtension.operationsPresets.stickyCharacter).on('click', () => {
    toast('Sticky to character functionality not yet implemented', 'info');
  });

  $(selectorsExtension.operationsPresets.stickyChat).on('click', () => {
    toast('Sticky to chat functionality not yet implemented', 'info');
  });
}

/**
 * Bind artifact-level controls (edit, rename, delete, duplicate)
 */
function bindArtifactControls() {
  $(document).on('click', selectorsExtension.operationsPresets.artifactEditClass, (e) => {
    const operationType = $(e.currentTarget).data('operation-type');
    openArtifactEditor(operationType);
  });

  $(document).on('click', selectorsExtension.operationsPresets.artifactRenameClass, () => {
    toast('Artifact rename functionality not yet implemented', 'info');
  });

  $(document).on('click', selectorsExtension.operationsPresets.artifactDeleteClass, () => {
    toast('Artifact delete functionality not yet implemented', 'info');
  });

  $(document).on('click', selectorsExtension.operationsPresets.artifactDuplicateClass, () => {
    toast('Artifact duplicate functionality not yet implemented', 'info');
  });
}

/**
 * Bind artifact editor modal controls
 */
function bindArtifactEditorModal() {
  $(selectorsExtension.operationsPresets.modalClose).on('click', closeArtifactEditor);
  $(selectorsExtension.operationsPresets.modalCancel).on('click', closeArtifactEditor);

  $(selectorsExtension.operationsPresets.modalSave).on('click', () => {
    toast('Save functionality not yet implemented', 'info');
    closeArtifactEditor();
  });

  $(selectorsExtension.operationsPresets.modalBackdrop).on('click', closeArtifactEditor);
}

/**
 * Open the artifact editor modal for a specific operation type
 * @param {string} operationType - The operation type to edit
 */
function openArtifactEditor(operationType) {
  const operationNames = {
    'scene_recap': 'Scene Recap',
    'scene_recap_error_detection': 'Scene Recap Error Detection',
    'auto_scene_break': 'Auto Scene Break Detection',
    'running_scene_recap': 'Running Scene Recap',
    'auto_lorebooks_recap_merge': 'Auto-Lorebooks: Recap Merge',
    'auto_lorebooks_recap_lorebook_entry_lookup': 'Auto-Lorebooks: Entry Lookup',
    'auto_lorebooks_recap_lorebook_entry_deduplicate': 'Auto-Lorebooks: Entry Deduplicate',
    'auto_lorebooks_bulk_populate': 'Auto-Lorebooks: Bulk Populate'
  };

  const operationName = operationNames[operationType] || operationType;

  $(selectorsExtension.operationsPresets.modalTitle).text(`Edit Operation Artifact - ${operationName}`);

  $(selectorsExtension.operationsPresets.modalName).val('Default');
  $(selectorsExtension.operationsPresets.modalDescription).val('');
  $(selectorsExtension.operationsPresets.modalPrompt).val('(Placeholder prompt text)');
  $(selectorsExtension.operationsPresets.modalPrefill).val('{');
  $(selectorsExtension.operationsPresets.modalConnection).val('');
  $(selectorsExtension.operationsPresets.modalPreset).val('');
  $(selectorsExtension.operationsPresets.modalIncludeFlag).prop('checked', false);

  $(selectorsExtension.operationsPresets.modal).fadeIn(MODAL_FADE_DURATION_MS);
}

/**
 * Close the artifact editor modal
 */
function closeArtifactEditor() {
  $(selectorsExtension.operationsPresets.modal).fadeOut(MODAL_FADE_DURATION_MS);
}

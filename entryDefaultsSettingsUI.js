
import { log, SUBSYSTEM } from './index.js';
import { DEFAULT_ENTRY_DEFAULTS } from './entryDefaults.js';
import { getArtifact, updateArtifact, listArtifacts } from './operationArtifacts.js';
import { selectorsExtension } from './selectorsExtension.js';

let debounceTimer = null;
const DEBOUNCE_DELAY = 500;

/**
 * Get the currently selected entry defaults artifact name from the selector
 */
function getSelectedArtifactName() {
  const $selector = $(selectorsExtension.operationsPresets.artifactEntryDefaults);
  return $selector.val() || 'Default';
}

/**
 * Get the current entry defaults from the selected artifact
 */
function getCurrentDefaults() {
  const artifactName = getSelectedArtifactName();
  const artifact = getArtifact('entry_defaults', artifactName);

  if (artifact && artifact.defaults) {
    return artifact.defaults;
  }

  return { ...DEFAULT_ENTRY_DEFAULTS };
}

/**
 * Save entry defaults to the current artifact (with copy-on-write for defaults)
 */
function saveDefaults(defaults) {
  const artifactName = getSelectedArtifactName();

  // Update the artifact (will create new version if editing default)
  const newName = updateArtifact('entry_defaults', artifactName, { defaults });

  // If a new version was created, update the selector
  if (newName !== artifactName) {
    refreshArtifactSelector(newName);
  }

  log(SUBSYSTEM.SETTINGS, `Saved entry defaults to artifact: ${newName}`);
}

/**
 * Debounced save to avoid too many writes
 */
function debouncedSave(defaults) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    saveDefaults(defaults);
    debounceTimer = null;
  }, DEBOUNCE_DELAY);
}

/**
 * Refresh the artifact selector dropdown with current artifacts
 */
function refreshArtifactSelector(selectedName = null) {
  const $selector = $(selectorsExtension.operationsPresets.artifactEntryDefaults);
  if ($selector.length === 0) { return; }

  const artifacts = listArtifacts('entry_defaults');
  const currentValue = selectedName || $selector.val() || 'Default';

  $selector.empty();

  for (const artifact of artifacts) {
    const $option = $('<option></option>')
      .val(artifact.name)
      .text(artifact.name);
    if (artifact.name === currentValue) {
      $option.prop('selected', true);
    }
    $selector.append($option);
  }
}

/**
 * Load current entry defaults into the UI controls from the selected artifact
 */
function loadCurrentDefaultsToUI() {
  const defaults = getCurrentDefaults();

  $(selectorsExtension.lorebook.entryExcludeRecursion).prop('checked', defaults.exclude_recursion);
  $(selectorsExtension.lorebook.entryPreventRecursion).prop('checked', defaults.prevent_recursion);
  $(selectorsExtension.lorebook.entryIgnoreBudget).prop('checked', defaults.ignore_budget);
  $(selectorsExtension.lorebook.entrySticky).val(defaults.sticky);
}

/**
 * Handle change to exclude_recursion setting
 */
function onExcludeRecursionChange() {
  const value = $(selectorsExtension.lorebook.entryExcludeRecursion).prop('checked');
  const current = getCurrentDefaults();
  debouncedSave({ ...current, exclude_recursion: value });
}

/**
 * Handle change to prevent_recursion setting
 */
function onPreventRecursionChange() {
  const value = $(selectorsExtension.lorebook.entryPreventRecursion).prop('checked');
  const current = getCurrentDefaults();
  debouncedSave({ ...current, prevent_recursion: value });
}

/**
 * Handle change to ignore_budget setting
 */
function onIgnoreBudgetChange() {
  const value = $(selectorsExtension.lorebook.entryIgnoreBudget).prop('checked');
  const current = getCurrentDefaults();
  debouncedSave({ ...current, ignore_budget: value });
}

/**
 * Handle change to sticky setting
 */
function onStickyChange() {
  const value = Number($(selectorsExtension.lorebook.entrySticky).val()) || 0;
  const current = getCurrentDefaults();
  debouncedSave({ ...current, sticky: value });
}

/**
 * Handle artifact selector change
 */
function onArtifactChange() {
  loadCurrentDefaultsToUI();
}

/**
 * Initialize entry defaults UI bindings
 */
export function initializeEntryDefaultsUI() {
  // Bind change handlers
  $(document).on('change', selectorsExtension.lorebook.entryExcludeRecursion, onExcludeRecursionChange);
  $(document).on('change', selectorsExtension.lorebook.entryPreventRecursion, onPreventRecursionChange);
  $(document).on('change', selectorsExtension.lorebook.entryIgnoreBudget, onIgnoreBudgetChange);
  $(document).on('input', selectorsExtension.lorebook.entrySticky, onStickyChange);

  // Bind artifact selector change
  $(document).on('change', selectorsExtension.operationsPresets.artifactEntryDefaults, onArtifactChange);

  // Initial load
  refreshArtifactSelector();
  loadCurrentDefaultsToUI();

  log(SUBSYSTEM.SETTINGS, 'Entry defaults UI initialized');
}

export { loadCurrentDefaultsToUI, refreshArtifactSelector };

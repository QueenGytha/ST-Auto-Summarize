
import { log, SUBSYSTEM } from './index.js';
import { DEFAULT_ENTRY_DEFAULTS } from './entityTypes.js';
import { getArtifact, updateArtifact } from './operationArtifacts.js';
import { selectorsExtension } from './selectorsExtension.js';

let debounceTimer = null;
const DEBOUNCE_DELAY = 500;

/**
 * Get the currently selected entity types artifact name from the selector
 * (entry defaults are now part of entity_types artifact)
 */
function getSelectedArtifactName() {
  const $selector = $(selectorsExtension.operationsPresets.artifactEntityTypes);
  return $selector.val() || 'Default';
}

/**
 * Get the current entry defaults from the entity_types artifact
 */
function getCurrentDefaults() {
  const artifactName = getSelectedArtifactName();
  const artifact = getArtifact('entity_types', artifactName);

  if (artifact && artifact.defaults) {
    return artifact.defaults;
  }

  return { ...DEFAULT_ENTRY_DEFAULTS };
}

/**
 * Save entry defaults to the entity_types artifact
 */
function saveDefaults(defaults) {
  const artifactName = getSelectedArtifactName();

  // Update the entity_types artifact with new defaults
  const newName = updateArtifact('entity_types', artifactName, { defaults });

  log(SUBSYSTEM.SETTINGS, `Saved entry defaults to entity_types artifact: ${newName}`);
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
 * Refresh entry defaults UI (no separate selector - uses entity_types selector)
 */
function refreshArtifactSelector() {
  // Entry defaults now use the entity_types selector, so just reload the UI values
  loadCurrentDefaultsToUI();
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
 * Handle entity_types artifact selector change (entry defaults follow entity_types)
 */
function onEntityTypesArtifactChange() {
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

  // Bind entity_types artifact selector change (entry defaults are part of entity_types)
  $(document).on('change', selectorsExtension.operationsPresets.artifactEntityTypes, onEntityTypesArtifactChange);

  // Initial load
  loadCurrentDefaultsToUI();

  log(SUBSYSTEM.SETTINGS, 'Entry defaults UI initialized');
}

export { loadCurrentDefaultsToUI, refreshArtifactSelector };

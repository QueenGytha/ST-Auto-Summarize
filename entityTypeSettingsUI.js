
import { toast, selectorsExtension, log, SUBSYSTEM } from './index.js';
import {
  DEFAULT_ENTITY_TYPES,
  sanitizeEntityTypeName,
  ensureRecapEntry
} from './entityTypes.js';
import { getArtifact, updateArtifact, listArtifacts } from './operationArtifacts.js';

let debounceTimer = null;
const DEBOUNCE_DELAY = 500;
const DATA_INDEX_ATTR = 'data-index';

/**
 * Get the currently selected entity types artifact name from the selector
 */
function getSelectedArtifactName() {
  const $selector = $(selectorsExtension.operationsPresets.artifactEntityTypes);
  return $selector.val() || 'Default';
}

/**
 * Get the current entity types from the selected artifact
 */
function getCurrentEntityTypes() {
  const artifactName = getSelectedArtifactName();
  const artifact = getArtifact('entity_types', artifactName);

  if (artifact && artifact.types) {
    return artifact.types;
  }

  // Fall back to defaults
  return [...DEFAULT_ENTITY_TYPES];
}

/**
 * Save entity types to the current artifact (with copy-on-write for defaults)
 */
function saveEntityTypes(types) {
  const artifactName = getSelectedArtifactName();
  const validTypes = ensureRecapEntry(types);

  // Update the artifact (will create new version if editing default)
  const newName = updateArtifact('entity_types', artifactName, { types: validTypes });

  // If a new version was created, update the selector
  if (newName !== artifactName) {
    refreshArtifactSelector(newName);
  }

  log(SUBSYSTEM.SETTINGS, `Saved entity types to artifact: ${newName}`);
}

/**
 * Debounced save to avoid too many writes
 */
function debouncedSave(types) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    saveEntityTypes(types);
    debounceTimer = null;
  }, DEBOUNCE_DELAY);
}

/**
 * Refresh the artifact selector dropdown with current artifacts
 */
function refreshArtifactSelector(selectedName = null) {
  const $selector = $(selectorsExtension.operationsPresets.artifactEntityTypes);
  if ($selector.length === 0) { return; }

  const artifacts = listArtifacts('entity_types');
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

  // Update button states
  updateButtonStates();
}

/**
 * Update button states based on whether current artifact is default
 */
function updateButtonStates() {
  const artifactName = getSelectedArtifactName();
  const artifact = getArtifact('entity_types', artifactName);
  const isDefault = artifact?.isDefault || false;

  // Rename and Delete are disabled for defaults
  $(selectorsExtension.operationsPresets.entityTypesArtifactRename).prop('disabled', isDefault);
  $(selectorsExtension.operationsPresets.entityTypesArtifactDelete).prop('disabled', isDefault);
}

/**
 * Render the entity types table
 */
export function renderEntityTypesTable() {
  const $container = $(selectorsExtension.operationsPresets.entityTypesTableContainer);
  if ($container.length === 0) { return; }

  const types = getCurrentEntityTypes();

  $container.empty();

  // Create table
  const $table = $('<table data-testid="entity-types-table" class="entity-types-table" style="width: 100%; border-collapse: collapse;"></table>');

  // Header row
  const $header = $(`
    <thead>
      <tr style="text-align: left;">
        <th style="padding: 5px; width: 120px;">Name</th>
        <th style="padding: 5px; width: 70px; text-align: center;">Constant</th>
        <th style="padding: 5px;">Usage (LLM guidance)</th>
        <th style="padding: 5px; width: 40px;"></th>
      </tr>
    </thead>
  `);
  $table.append($header);

  // Body
  const $body = $('<tbody></tbody>');

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const isRecap = type.isGuidanceOnly === true;

    const $row = $('<tr class="entity-type-row" style="border-bottom: 1px solid var(--SmartThemeBorderColor);"></tr>');
    $row.attr(DATA_INDEX_ATTR, i);

    // Name column
    const $nameCell = $('<td style="padding: 5px;"></td>');
    if (isRecap) {
      // Recap row - name is fixed
      $nameCell.html('<code class="padding3px" style="background: var(--SmartThemeBlurTintColor);">recap</code> <i class="fa-solid fa-file-lines" title="Guidance-only: tells LLM what goes in recap vs lorebook entries"></i>');
    } else {
      const $nameInput = $('<input type="text" class="entity-type-name-input text_pole" style="width: 100%;" placeholder="type name">')
        .val(type.name || '')
        .attr(DATA_INDEX_ATTR, i);
      $nameCell.append($nameInput);
    }
    $row.append($nameCell);

    // Constant checkbox column
    const $constantCell = $('<td style="padding: 5px; text-align: center;"></td>');
    if (isRecap) {
      // Recap row - no constant checkbox
      $constantCell.text('—');
    } else {
      const $checkbox = $('<input type="checkbox" class="entity-type-constant-checkbox">')
        .prop('checked', type.constant === true)
        .attr(DATA_INDEX_ATTR, i);
      $constantCell.append($checkbox);
    }
    $row.append($constantCell);

    // Usage column
    const $usageCell = $('<td style="padding: 5px;"></td>');
    const $usageInput = $('<input type="text" class="entity-type-usage-input text_pole" style="width: 100%;" placeholder="LLM guidance for this type">')
      .val(type.usage || '')
      .attr('data-index', i);
    $usageCell.append($usageInput);
    $row.append($usageCell);

    // Delete button column
    const $deleteCell = $('<td style="padding: 5px; text-align: center;"></td>');
    if (isRecap) {
      // Recap row - no delete button
      $deleteCell.text('—');
    } else {
      const $deleteBtn = $('<button class="entity-type-delete-btn menu_button fa-solid fa-trash" title="Remove this type"></button>')
        .attr(DATA_INDEX_ATTR, i);
      $deleteCell.append($deleteBtn);
    }
    $row.append($deleteCell);

    $body.append($row);
  }

  $table.append($body);
  $container.append($table);

  // Add row button
  const $addBtn = $('<button data-testid="entity-types-add-row" class="menu_button" style="margin-top: 10px;"><i class="fa-solid fa-plus"></i> Add Type</button>');
  $container.append($addBtn);
}

/**
 * Collect current types from the table UI
 */
function collectTypesFromTable() {
  const types = [];
  const $rows = $(selectorsExtension.operationsPresets.entityTypeRowClass);

  $rows.each(function() {
    const $row = $(this);

    // Check if this is the recap row (no name input)
    const $nameInput = $row.find(selectorsExtension.operationsPresets.entityTypeNameInput);

    if ($nameInput.length === 0) {
      // Recap row - preserve it
      const currentTypes = getCurrentEntityTypes();
      const recapEntry = currentTypes.find(t => t.isGuidanceOnly);
      if (recapEntry) {
        const $usageInput = $row.find(selectorsExtension.operationsPresets.entityTypeUsageInput);
        types.push({
          ...recapEntry,
          usage: $usageInput.val() || recapEntry.usage
        });
      }
    } else {
      // Regular type row
      const name = sanitizeEntityTypeName($nameInput.val() || '');
      const $constantCheckbox = $row.find(selectorsExtension.operationsPresets.entityTypeConstantCheckbox);
      const $usageInput = $row.find(selectorsExtension.operationsPresets.entityTypeUsageInput);

      // Only include if name is not empty
      if (name) {
        types.push({
          name: name,
          constant: $constantCheckbox.prop('checked'),
          usage: $usageInput.val() || '',
          isGuidanceOnly: false
        });
      }
    }
  });

  return types;
}

/**
 * Handle table input changes
 */
function handleTableChange() {
  const types = collectTypesFromTable();
  debouncedSave(types);
}

/**
 * Handle add row button click
 */
function handleAddRow() {
  const types = collectTypesFromTable();
  types.push({
    name: '',
    constant: false,
    usage: '',
    isGuidanceOnly: false
  });
  saveEntityTypes(types);
  renderEntityTypesTable();
}

/**
 * Handle delete row button click
 */
function handleDeleteRow(index) {
  const types = collectTypesFromTable();
  // Don't allow deleting the recap entry
  if (types[index]?.isGuidanceOnly) {
    toast('Cannot delete the recap entry', 'warning');
    return;
  }
  types.splice(index, 1);
  saveEntityTypes(types);
  renderEntityTypesTable();
}

/**
 * Handle artifact selector change
 */
function handleArtifactChange() {
  renderEntityTypesTable();
  updateButtonStates();
}

/**
 * Initialize entity types UI event listeners
 */
export function initializeEntityTypesUI() {
  // Artifact selector change
  $(document).on('change', selectorsExtension.operationsPresets.artifactEntityTypes, handleArtifactChange);

  // Table input changes (delegated)
  $(document).on('change input', '.entity-type-name-input, .entity-type-constant-checkbox, .entity-type-usage-input', handleTableChange);

  // Add row button
  $(document).on('click', '[data-testid="entity-types-add-row"]', handleAddRow);

  // Delete row button (delegated)
  $(document).on('click', '.entity-type-delete-btn', function() {
    const index = Number.parseInt($(this).attr(DATA_INDEX_ATTR), 10);
    handleDeleteRow(index);
  });

  // Initial render
  refreshArtifactSelector();
  renderEntityTypesTable();
}

/**
 * Refresh the entity types UI (called when profile changes, etc.)
 */
export function refreshEntityTypesUI() {
  refreshArtifactSelector();
  renderEntityTypesTable();
}

// Legacy exports for backward compatibility (these are no longer used)
export function ensureEntityTypesSetting() {
  // No-op - migration handles this now
}

export function getEntityTypesSetting() {
  return getCurrentEntityTypes();
}

export function setEntityTypesSetting(types) {
  saveEntityTypes(types);
  renderEntityTypesTable();
}

export function renderEntityTypesList() {
  // Redirect to new table rendering
  renderEntityTypesTable();
}

export function handleAddEntityTypeFromInput() {
  // No longer used - table has inline add
}

export function removeEntityType(_type) {
  // No longer used - table has inline delete
}

export function restoreEntityTypesToDefault() {
  saveEntityTypes([...DEFAULT_ENTITY_TYPES]);
  renderEntityTypesTable();
}

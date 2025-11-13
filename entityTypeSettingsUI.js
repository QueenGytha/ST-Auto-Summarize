
import { extension_settings, saveSettingsDebounced, toast, selectorsExtension } from './index.js';
import {
  DEFAULT_ENTITY_TYPES,
  normalizeEntityTypeDefinition,
  parseEntityTypeDefinition } from
'./entityTypes.js';


function ensureEntityTypesSetting() {
  if (!extension_settings.autoLorebooks) {
    extension_settings.autoLorebooks = {} ;
  }
  const autoLorebooks  = extension_settings.autoLorebooks;
  const current = autoLorebooks.entity_types;
  if (!Array.isArray(current)) {
    autoLorebooks.entity_types = [...DEFAULT_ENTITY_TYPES];
    return;
  }
  const cleaned = Array.from(new Set(current.map((t) => normalizeEntityTypeDefinition(String(t))).filter(Boolean)));
  autoLorebooks.entity_types = cleaned.length > 0 ? cleaned : [...DEFAULT_ENTITY_TYPES];
}

function getEntityTypesSetting() {
  ensureEntityTypesSetting();
  const autoLorebooks  = extension_settings.autoLorebooks;
  return [...(autoLorebooks.entity_types ?? [])];
}

function setEntityTypesSetting(types ) {
  const cleaned = Array.from(new Set(types.map((t) => normalizeEntityTypeDefinition(String(t))).filter(Boolean)));
  if (!extension_settings.autoLorebooks) {
    extension_settings.autoLorebooks = {} ;
  }
  const autoLorebooks  = extension_settings.autoLorebooks;
  autoLorebooks.entity_types = cleaned.length > 0 ? cleaned : [...DEFAULT_ENTITY_TYPES];
  saveSettingsDebounced();
  renderEntityTypesList();
}

function renderEntityTypesList() {
  ensureEntityTypesSetting();
  const autoLorebooks  = extension_settings.autoLorebooks;
  const types = autoLorebooks.entity_types ?? [];
  const $list = $(selectorsExtension.lorebook.entityTypesList);
  if ($list.length === 0) {return;}
  $list.empty();

  if (types.length === 0) {
    $list.append('<div class="opacity50p">No types configured.</div>');
    return;
  }

  for (const type of types) {
    const def = parseEntityTypeDefinition(type);
    const $row = $('<div class="flex-container alignitemscenter justifyspacebetween margin-bot-5px autolorebooks-entity-type-row"></div>');
    const $labelWrapper = $('<div class="flex-container alignitemscenter" style="gap:6px;"></div>');
    const baseLabel = def.name || type;
    const $base = $('<code class="padding3px"></code>').text(baseLabel);
    $labelWrapper.append($base);
    for (const flag of def.entryFlags) {
      const $flag = $('<span class="tag opacity80"></span>').text(`entry:${flag}`);
      $labelWrapper.append($flag);
    }
    const $remove = $('<button class="menu_button fa-solid fa-trash autolorebooks-entity-type-remove" title="Remove"></button>').attr('data-type', type);
    $row.append($labelWrapper).append($remove);
    $list.append($row);
  }
}

function handleAddEntityTypeFromInput() {
  const raw = String($(selectorsExtension.lorebook.entityTypeInput).val() || '');
  const normalized = normalizeEntityTypeDefinition(raw);
  const def = parseEntityTypeDefinition(normalized);
  if (!def.name) {
    toast('Enter a valid type (letters, numbers, hyphen/underscore). Optionally add flags like quest(entry:constant).', 'warning');
    return;
  }
  const types = getEntityTypesSetting();
  if (types.includes(normalized)) {
    toast('Type already exists.', 'warning');
    return;
  }
  types.push(normalized);
  setEntityTypesSetting(types);
  $(selectorsExtension.lorebook.entityTypeInput).val('');
}

function removeEntityType(type ) {
  const normalized = normalizeEntityTypeDefinition(type);
  const types = getEntityTypesSetting().filter((t) => t !== normalized);
  setEntityTypesSetting(types);
}

function restoreEntityTypesToDefault() {
  setEntityTypesSetting([...DEFAULT_ENTITY_TYPES]);
}

export {
  ensureEntityTypesSetting,
  getEntityTypesSetting,
  setEntityTypesSetting,
  renderEntityTypesList,
  handleAddEntityTypeFromInput,
  removeEntityType,
  restoreEntityTypesToDefault };
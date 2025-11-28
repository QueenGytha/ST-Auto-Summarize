
import { get_settings, set_settings, log, SUBSYSTEM, saveSettingsDebounced, extension_settings, MODULE_NAME } from './index.js';
import { default_settings } from './defaultSettings.js';

const ERROR_PRESET_NAME_REQUIRED = 'Preset name is required and must be a string';

const OPERATION_TYPES = [
  'scene_recap',
  'organize_scene_recap',
  'scene_recap_error_detection',
  'auto_scene_break',
  'running_scene_recap',
  'auto_lorebooks_recap_merge',
  'auto_lorebooks_recap_lorebook_entry_lookup',
  'auto_lorebooks_recap_lorebook_entry_deduplicate',
  'auto_lorebooks_bulk_populate',
  'auto_lorebooks_recap_lorebook_entry_compaction',
  'parse_scene_recap',
  'filter_scene_recap_sl',
  'entity_types',
  'entry_defaults'
];

function getPresetsForModification() {
  if (!extension_settings[MODULE_NAME].operations_presets) {
    extension_settings[MODULE_NAME].operations_presets = structuredClone(default_settings.operations_presets);
  }
  return extension_settings[MODULE_NAME].operations_presets;
}

function getStickiesForModification(type) {
  const key = type === 'character' ? 'character_sticky_presets' : 'chat_sticky_presets';
  if (!extension_settings[MODULE_NAME][key]) {
    extension_settings[MODULE_NAME][key] = {};
  }
  return extension_settings[MODULE_NAME][key];
}

function getProfilesForModification() {
  if (!extension_settings[MODULE_NAME].profiles) {
    extension_settings[MODULE_NAME].profiles = structuredClone(default_settings.profiles);
  }
  return extension_settings[MODULE_NAME].profiles;
}

export function createPreset(presetName, description = null) {
  if (!presetName || typeof presetName !== 'string') {
    throw new Error(ERROR_PRESET_NAME_REQUIRED);
  }

  const presets = get_settings('operations_presets') || {};

  if (presets[presetName]) {
    throw new Error(`Preset already exists: ${presetName}`);
  }

  const operations = {};
  for (const operationType of OPERATION_TYPES) {
    operations[operationType] = 'Default';
  }

  const newPreset = {
    name: presetName,
    isDefault: false,
    operations: operations,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    description: description
  };

  presets[presetName] = newPreset;
  set_settings('operations_presets', presets);
  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Created preset: "${presetName}"`);
  return newPreset;
}

export function updatePreset(presetName, updates) {
  if (!presetName || typeof presetName !== 'string') {
    throw new Error(ERROR_PRESET_NAME_REQUIRED);
  }

  const presets = getPresetsForModification();
  const preset = presets[presetName];

  if (!preset) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  if (updates.operations) {
    for (const [operationType, artifactName] of Object.entries(updates.operations)) {
      if (!OPERATION_TYPES.includes(operationType)) {
        throw new Error(`Invalid operation type: ${operationType}`);
      }
      preset.operations[operationType] = artifactName;
    }
  }

  if (updates.description !== undefined) {
    preset.description = updates.description;
  }

  preset.modifiedAt = Date.now();

  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Updated preset: "${presetName}"`);
  return preset;
}

export function deletePreset(presetName) {
  if (!presetName || typeof presetName !== 'string') {
    throw new Error(ERROR_PRESET_NAME_REQUIRED);
  }

  const presets = getPresetsForModification();
  const preset = presets[presetName];

  if (!preset) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  if (preset.isDefault) {
    throw new Error('Cannot delete Default preset');
  }

  delete presets[presetName];

  const characterStickies = getStickiesForModification('character');
  for (const [charKey, stickyPreset] of Object.entries(characterStickies)) {
    if (stickyPreset === presetName) {
      delete characterStickies[charKey];
    }
  }

  const chatStickies = getStickiesForModification('chat');
  for (const [chatId, stickyPreset] of Object.entries(chatStickies)) {
    if (stickyPreset === presetName) {
      delete chatStickies[chatId];
    }
  }

  const profiles = getProfilesForModification();
  for (const profile of Object.values(profiles)) {
    if (profile.active_operations_preset === presetName) {
      profile.active_operations_preset = 'Default';
    }
  }

  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Deleted preset: "${presetName}"`);
  return true;
}

export function getPreset(presetName) {
  if (!presetName || typeof presetName !== 'string') {
    throw new Error(ERROR_PRESET_NAME_REQUIRED);
  }

  const presets = get_settings('operations_presets') || {};
  return presets[presetName] || null;
}

export function listPresets() {
  const presets = get_settings('operations_presets') || {};
  return Object.values(presets);
}

export function duplicatePreset(presetName, newName) {
  if (!presetName || typeof presetName !== 'string') {
    throw new Error(ERROR_PRESET_NAME_REQUIRED);
  }
  if (!newName || typeof newName !== 'string') {
    throw new Error('New name is required and must be a string');
  }

  const presets = getPresetsForModification();
  const sourcePreset = presets[presetName];

  if (!sourcePreset) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  if (presets[newName]) {
    throw new Error(`Preset already exists: ${newName}`);
  }

  const duplicatedPreset = {
    name: newName,
    isDefault: false,
    operations: { ...sourcePreset.operations },
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    description: sourcePreset.description
  };

  presets[newName] = duplicatedPreset;
  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Duplicated preset "${presetName}" → "${newName}"`);
  return duplicatedPreset;
}

export function renamePreset(oldName, newName) {
  if (!oldName || typeof oldName !== 'string') {
    throw new Error('Old name is required and must be a string');
  }
  if (!newName || typeof newName !== 'string') {
    throw new Error('New name is required and must be a string');
  }

  const presets = getPresetsForModification();
  const preset = presets[oldName];

  if (!preset) {
    throw new Error(`Preset not found: ${oldName}`);
  }

  if (preset.isDefault) {
    throw new Error('Cannot rename Default preset');
  }

  if (presets[newName]) {
    throw new Error(`Preset already exists: ${newName}`);
  }

  preset.name = newName;
  preset.modifiedAt = Date.now();

  presets[newName] = preset;
  delete presets[oldName];

  const characterStickies = getStickiesForModification('character');
  for (const [charKey, stickyPreset] of Object.entries(characterStickies)) {
    if (stickyPreset === oldName) {
      characterStickies[charKey] = newName;
    }
  }

  const chatStickies = getStickiesForModification('chat');
  for (const [chatId, stickyPreset] of Object.entries(chatStickies)) {
    if (stickyPreset === oldName) {
      chatStickies[chatId] = newName;
    }
  }

  const profiles = getProfilesForModification();
  for (const profile of Object.values(profiles)) {
    if (profile.active_operations_preset === oldName) {
      profile.active_operations_preset = newName;
    }
  }

  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Renamed preset "${oldName}" → "${newName}"`);
  return preset;
}

export function setCharacterStickyPreset(characterKey, presetName) {
  if (!characterKey || typeof characterKey !== 'string') {
    throw new Error('Character key is required and must be a string');
  }
  if (!presetName || typeof presetName !== 'string') {
    throw new Error(ERROR_PRESET_NAME_REQUIRED);
  }

  const presets = get_settings('operations_presets') || {};
  if (!presets[presetName]) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  const characterStickies = getStickiesForModification('character');
  characterStickies[characterKey] = presetName;
  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Set character sticky preset: "${characterKey}" → "${presetName}"`);
  return true;
}

export function getCharacterStickyPreset(characterKey) {
  if (!characterKey || typeof characterKey !== 'string') {
    throw new Error('Character key is required and must be a string');
  }

  const characterStickies = get_settings('character_sticky_presets') || {};
  return characterStickies[characterKey] || null;
}

export function setChatStickyPreset(chatId, presetName) {
  if (!chatId || typeof chatId !== 'string') {
    throw new Error('Chat ID is required and must be a string');
  }
  if (!presetName || typeof presetName !== 'string') {
    throw new Error(ERROR_PRESET_NAME_REQUIRED);
  }

  const presets = get_settings('operations_presets') || {};
  if (!presets[presetName]) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  const chatStickies = getStickiesForModification('chat');
  chatStickies[chatId] = presetName;
  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Set chat sticky preset: "${chatId}" → "${presetName}"`);
  return true;
}

export function getChatStickyPreset(chatId) {
  if (!chatId || typeof chatId !== 'string') {
    throw new Error('Chat ID is required and must be a string');
  }

  const chatStickies = get_settings('chat_sticky_presets') || {};
  return chatStickies[chatId] || null;
}

export function clearCharacterSticky(characterKey) {
  if (!characterKey || typeof characterKey !== 'string') {
    throw new Error('Character key is required and must be a string');
  }

  const characterStickies = getStickiesForModification('character');
  if (characterStickies[characterKey]) {
    delete characterStickies[characterKey];
    saveSettingsDebounced();
    log(SUBSYSTEM.CORE, `Cleared character sticky preset for: "${characterKey}"`);
    return true;
  }

  return false;
}

export function clearChatSticky(chatId) {
  if (!chatId || typeof chatId !== 'string') {
    throw new Error('Chat ID is required and must be a string');
  }

  const chatStickies = getStickiesForModification('chat');
  if (chatStickies[chatId]) {
    delete chatStickies[chatId];
    saveSettingsDebounced();
    log(SUBSYSTEM.CORE, `Cleared chat sticky preset for: "${chatId}"`);
    return true;
  }

  return false;
}

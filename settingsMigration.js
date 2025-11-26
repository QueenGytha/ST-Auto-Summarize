// settingsMigration.js
// Migration utilities for settings
// - Migrates from slash command profile names to Connection Manager UUIDs
// - Migrates entity types from legacy string format to new artifact format

import { get_settings, set_settings, log, SUBSYSTEM, extension_settings, saveSettingsDebounced } from './index.js';
import { getConnectionManagerProfileId } from './llmClient.js';
import { convertLegacyEntityType, DEFAULT_ENTITY_TYPES } from './entityTypes.js';

const PROFILE_SETTING_KEYS = [
  'scene_recap_connection_profile',
  'auto_scene_break_connection_profile',
  'running_scene_recap_connection_profile',
  'auto_lorebooks_recap_merge_connection_profile',
  'auto_lorebooks_recap_lorebook_entry_lookup_connection_profile',
  'auto_lorebooks_recap_lorebook_entry_deduplicate_connection_profile',
  'auto_lorebooks_bulk_populate_connection_profile',
  'scene_recap_error_detection_connection_profile'
];

function isUUID(str) {
  if (!str || typeof str !== 'string') {return false;}
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function migrateConnectionProfileSettings() {
  let migrated = false;

  for (const key of PROFILE_SETTING_KEYS) {
    const currentValue = get_settings(key);

    if (!currentValue || currentValue === '' || isUUID(currentValue)) {
      continue;
    }

    log(SUBSYSTEM.SETTINGS, `Migrating ${key}: "${currentValue}" (profile name) → UUID`);

    // eslint-disable-next-line no-await-in-loop -- Sequential migration required: each profile lookup depends on Connection Manager state
    const profileId = await getConnectionManagerProfileId(currentValue);

    if (profileId) {
      set_settings(key, profileId);
      migrated = true;
      log(SUBSYSTEM.SETTINGS, `  ✓ Migrated to UUID: "${profileId}"`);
    } else {
      console.warn(`Profile "${currentValue}" not found in Connection Manager. Resetting ${key} to "same as current".`);
      set_settings(key, '');
      migrated = true;
      log(SUBSYSTEM.SETTINGS, `  ⚠ Profile not found, reset to empty (same as current)`);
    }
  }

  if (migrated) {
    log(SUBSYSTEM.SETTINGS, '✓ Connection profile settings migrated to Connection Manager UUIDs');
  } else {
    log(SUBSYSTEM.SETTINGS, 'No migration needed - all profile settings already use UUIDs or empty');
  }

  return migrated;
}

export function needsMigration() {
  const settings = get_settings();

  for (const key of PROFILE_SETTING_KEYS) {
    const currentValue = settings[key];

    if (currentValue && currentValue !== '' && !isUUID(currentValue)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if entity types need migration from legacy format
 * Legacy format: autoLorebooks.entity_types = ['character', 'quest(entry:constant)', ...]
 * New format: operation_artifacts.entity_types = [{ name, types: [...], ... }]
 */
export function needsEntityTypesMigration() {
  const settings = get_settings();

  // Check if legacy format exists
  const legacyTypes = settings?.autoLorebooks?.entity_types;
  if (!Array.isArray(legacyTypes) || legacyTypes.length === 0) {
    return false;
  }

  // Check if first item is a string (legacy) vs object (new)
  const firstItem = legacyTypes[0];
  if (typeof firstItem === 'string') {
    return true;
  }

  return false;
}

/**
 * Migrate entity types from legacy string array format to new artifact format
 * The migrated data becomes the DEFAULT artifact (user's existing config is preserved as default)
 */
export function migrateEntityTypesToArtifact() {
  const settings = get_settings();

  // Check if legacy format exists
  const legacyTypes = settings?.autoLorebooks?.entity_types;
  if (!Array.isArray(legacyTypes) || legacyTypes.length === 0) {
    log(SUBSYSTEM.SETTINGS, 'No legacy entity types to migrate');
    return false;
  }

  // Check if first item is a string (legacy format)
  const firstItem = legacyTypes[0];
  if (typeof firstItem !== 'string') {
    log(SUBSYSTEM.SETTINGS, 'Entity types already in new format, skipping migration');
    return false;
  }

  log(SUBSYSTEM.SETTINGS, `Migrating ${legacyTypes.length} legacy entity types to new artifact format...`);

  // Convert each legacy string to new object format
  const convertedTypes = [];

  // Always add the recap entry first (it's new and wasn't in legacy format)
  const recapEntry = DEFAULT_ENTITY_TYPES.find(t => t.isGuidanceOnly);
  if (recapEntry) {
    convertedTypes.push({ ...recapEntry });
  }

  for (const legacyType of legacyTypes) {
    const converted = convertLegacyEntityType(legacyType);
    if (converted) {
      // Try to find matching default to get usage description
      const defaultMatch = DEFAULT_ENTITY_TYPES.find(d => d.name === converted.name);
      if (defaultMatch) {
        converted.usage = defaultMatch.usage;
      }
      convertedTypes.push(converted);
    }
  }

  // Create the new artifact structure
  const newArtifact = {
    name: 'Default',
    types: convertedTypes,
    isDefault: true,
    internalVersion: 1,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    customLabel: null
  };

  // Ensure operation_artifacts exists
  if (!extension_settings.auto_recap) {
    extension_settings.auto_recap = {};
  }
  if (!extension_settings.auto_recap.operation_artifacts) {
    extension_settings.auto_recap.operation_artifacts = {};
  }

  // Set the new artifact (this becomes the default)
  extension_settings.auto_recap.operation_artifacts.entity_types = [newArtifact];

  // Update operations_presets to include entity_types if not present
  if (extension_settings.auto_recap.operations_presets) {
    for (const preset of Object.values(extension_settings.auto_recap.operations_presets)) {
      if (preset.operations && !preset.operations.entity_types) {
        preset.operations.entity_types = 'Default';
      }
    }
  }

  // Remove the legacy storage location
  if (extension_settings.autoLorebooks) {
    delete extension_settings.autoLorebooks.entity_types;
  }

  saveSettingsDebounced();

  log(SUBSYSTEM.SETTINGS, `✓ Migrated entity types to artifact format: ${convertedTypes.length} types`);
  return true;
}

/**
 * Run all migrations
 */
export async function runAllMigrations() {
  let migrated = false;

  // Run connection profile migration
  if (needsMigration()) {
    const profileMigrated = await migrateConnectionProfileSettings();
    migrated = migrated || profileMigrated;
  }

  // Run entity types migration
  if (needsEntityTypesMigration()) {
    const entityTypesMigrated = migrateEntityTypesToArtifact();
    migrated = migrated || entityTypesMigrated;
  }

  return migrated;
}

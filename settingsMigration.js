// settingsMigration.js
// Migration utilities for connection profile settings
// Migrates from slash command profile names to Connection Manager UUIDs

import { get_settings, set_settings, log, SUBSYSTEM } from './index.js';
import { getConnectionManagerProfileId } from './llmClient.js';

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

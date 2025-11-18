// profileResolution.js
// Profile resolution and blocking decision logic for operations
// CRITICAL: Empty profile = "same as current" = BLOCKS (conflict risk)
//           Non-empty profile = separate connection = DON'T BLOCK (concurrent operation)

import { OperationType } from './operationTypes.js';
import { get_settings, getContext } from './index.js';

const OPERATION_PROFILE_MAP = {
  [OperationType.VALIDATE_RECAP]: 'scene_recap_error_detection_connection_profile',
  [OperationType.DETECT_SCENE_BREAK]: 'auto_scene_break_connection_profile',
  [OperationType.GENERATE_SCENE_RECAP]: 'scene_recap_connection_profile',
  [OperationType.GENERATE_RUNNING_RECAP]: 'running_scene_recap_connection_profile',
  [OperationType.COMBINE_SCENE_WITH_RUNNING]: 'running_scene_recap_connection_profile',
  [OperationType.LOREBOOK_ENTRY_LOOKUP]: 'auto_lorebooks_recap_lorebook_entry_lookup_connection_profile',
  [OperationType.RESOLVE_LOREBOOK_ENTRY]: 'auto_lorebooks_recap_lorebook_entry_deduplicate_connection_profile',
  [OperationType.CREATE_LOREBOOK_ENTRY]: 'auto_lorebooks_recap_merge_connection_profile',
  [OperationType.MERGE_LOREBOOK_ENTRY]: 'auto_lorebooks_recap_merge_connection_profile',
  [OperationType.POPULATE_REGISTRIES]: 'auto_lorebooks_bulk_populate_connection_profile',
  [OperationType.UPDATE_LOREBOOK_REGISTRY]: null
};

export function getProfileForOperation(operationType) {
  const settingKey = OPERATION_PROFILE_MAP[operationType];
  if (!settingKey) {return '';}

  return get_settings(settingKey) || '';
}

export function resolveProfileId(profileId) {
  if (profileId && profileId !== '') {
    return profileId;
  }

  const ctx = getContext();
  const selectedProfileId = ctx.extensionSettings.connectionManager?.selectedProfile;

  if (!selectedProfileId) {
    throw new Error('FATAL: Empty connection profile setting means "use current active profile", but no ConnectionManager profile is currently active (selectedProfile is null). Please either: 1) Select a ConnectionManager profile in ST, OR 2) Configure a specific profile in Auto-Recap settings.');
  }

  const profile = ctx.extensionSettings.connectionManager.profiles.find(p => p.id === selectedProfileId);
  if (!profile) {
    ctx.extensionSettings.connectionManager.selectedProfile = null;
    throw new Error(`FATAL: Current ConnectionManager profile ID "${selectedProfileId}" not found in profiles list (profile may have been deleted). The stale profile reference has been cleared. Please select a valid ConnectionManager profile in SillyTavern.`);
  }

  return profile.id;
}

export function shouldOperationBlockChat(operationType) {
  const profileId = getProfileForOperation(operationType);
  const resolvedProfile = resolveProfileId(profileId);
  const currentProfile = resolveProfileId('');
  return resolvedProfile === currentProfile;
}

export function operationUsesSeparateProfile(operationType) {
  return !shouldOperationBlockChat(operationType);
}

export function getAllOperationProfiles() {
  const profiles = {};
  for (const [opType, settingKey] of Object.entries(OPERATION_PROFILE_MAP)) {
    if (settingKey) {
      profiles[opType] = get_settings(settingKey) || '';
    }
  }
  return profiles;
}

export function getConnectionProfileById(profileId) {
  if (!profileId) {
    return null;
  }
  const ctx = getContext();
  return ctx.extensionSettings.connectionManager?.profiles?.find(p => p.id === profileId) || null;
}

export function getPresetManagerType(profileId) {
  const profile = getConnectionProfileById(profileId);
  if (!profile) {
    return 'openai'; // default
  }

  // Map SillyTavern API types to preset manager types
  // 'custom' API type uses OpenAI-compatible format, so use 'openai' preset manager
  const apiType = profile.api;

  if (apiType === 'custom') {
    return 'openai';
  }

  return apiType || 'openai';
}

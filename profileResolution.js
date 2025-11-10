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
  const storedProfile = ctx.extensionSettings.connectionProfile;

  if (!storedProfile || storedProfile === '') {
    throw new Error('FATAL: ctx.extensionSettings.connectionProfile is not set. Empty profile = "same as current" but current profile is undefined. This is a configuration error.');
  }

  return storedProfile;
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

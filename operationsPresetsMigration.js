
import { get_settings, set_settings, log, SUBSYSTEM, saveSettingsDebounced, default_settings } from './index.js';

const OPERATION_TYPES = [
  'scene_recap',
  'scene_recap_error_detection',
  'auto_scene_break',
  'running_scene_recap',
  'auto_lorebooks_recap_merge',
  'auto_lorebooks_recap_lorebook_entry_lookup',
  'auto_lorebooks_recap_lorebook_entry_deduplicate',
  'auto_lorebooks_bulk_populate'
];

export function needsOperationsPresetsMigration() {
  const artifacts = get_settings('operation_artifacts');
  const presets = get_settings('operations_presets');

  if (artifacts && presets) {
    return false;
  }

  const profiles = get_settings('profiles');
  for (const profile of Object.values(profiles)) {
    if (profile.scene_recap_prompt !== undefined) {
      return true;
    }
  }

  return false;
}

export function migrateToOperationsPresets() {
  log(SUBSYSTEM.CORE, '=== Starting Operations Presets Migration ===');

  backupBeforeMigration();

  const profiles = get_settings('profiles');
  const artifacts = {};
  const presets = {};

  for (const operationType of OPERATION_TYPES) {
    artifacts[operationType] = [
      createDefaultArtifact(operationType)
    ];
  }

  for (const [profileName, profileSettings] of Object.entries(profiles)) {
    log(SUBSYSTEM.CORE, `Migrating profile: "${profileName}"`);

    const presetOperations = {};

    for (const operationType of OPERATION_TYPES) {
      const gatheredConfig = gatherScatteredSettings(profileSettings, operationType);
      const defaultConfig = getDefaultConfigForType(operationType);

      const isCustomized = !deepEqualConfigs(gatheredConfig, defaultConfig);

      if (isCustomized) {
        const customArtifact = {
          name: `${operationType} v1`,
          prompt: gatheredConfig.prompt,
          prefill: gatheredConfig.prefill,
          connection_profile: gatheredConfig.connection_profile || null,
          completion_preset_name: gatheredConfig.completion_preset_name,
          include_preset_prompts: gatheredConfig.include_preset_prompts,
          isDefault: false,
          internalVersion: 1,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          customLabel: `Migrated from profile "${profileName}"`
        };

        if (operationType === 'auto_scene_break') {
          customArtifact.forced_prompt = gatheredConfig.forced_prompt || '';
          customArtifact.forced_prefill = gatheredConfig.forced_prefill || '';
        }

        artifacts[operationType].push(customArtifact);
        presetOperations[operationType] = customArtifact.name;

        log(SUBSYSTEM.CORE, `  ✓ ${operationType} → CUSTOM ARTIFACT`);
      } else {
        presetOperations[operationType] = 'Default';
        log(SUBSYSTEM.CORE, `  ✓ ${operationType} → DEFAULT ARTIFACT`);
      }

      delete profileSettings[`${operationType}_prompt`];
      delete profileSettings[`${operationType}_prefill`];
      delete profileSettings[`${operationType}_connection_profile`];
      delete profileSettings[`${operationType}_completion_preset_name`];
      delete profileSettings[`${operationType}_include_preset_prompts`];

      if (operationType === 'auto_scene_break') {
        delete profileSettings[`${operationType}_forced_prompt`];
        delete profileSettings[`${operationType}_forced_prefill`];
      }
    }

    const presetName = `${profileName} (migrated)`;
    presets[presetName] = {
      name: presetName,
      isDefault: profileName === 'Default',
      operations: presetOperations,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      description: `Migrated from profile "${profileName}"`
    };

    profileSettings.active_operations_preset = presetName;
  }

  set_settings('operation_artifacts', artifacts);
  set_settings('operations_presets', presets);
  set_settings('profiles', profiles);

  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, '=== Operations Presets Migration Complete ===');
  return true;
}

export function gatherScatteredSettings(profileSettings, operationType) {
  const config = {
    prompt: profileSettings[`${operationType}_prompt`],
    prefill: profileSettings[`${operationType}_prefill`],
    connection_profile: profileSettings[`${operationType}_connection_profile`],
    completion_preset_name: profileSettings[`${operationType}_completion_preset_name`],
    include_preset_prompts: profileSettings[`${operationType}_include_preset_prompts`]
  };

  if (operationType === 'auto_scene_break') {
    config.forced_prompt = profileSettings[`${operationType}_forced_prompt`];
    config.forced_prefill = profileSettings[`${operationType}_forced_prefill`];
  }

  return config;
}

export function backupBeforeMigration() {
  const profiles = get_settings('profiles');
  const backup = {
    profiles: structuredClone(profiles),
    timestamp: Date.now(),
    version: '1.x'
  };

  set_settings('_migration_backup_operations_presets', backup);
  saveSettingsDebounced();
  log(SUBSYSTEM.CORE, 'Created backup before operations presets migration');
}

function createDefaultArtifact(operationType) {
  const defaultArtifacts = default_settings.operation_artifacts;

  if (!defaultArtifacts || !defaultArtifacts[operationType] || !defaultArtifacts[operationType][0]) {
    throw new Error(`No default artifact found for operation type: ${operationType}`);
  }

  return structuredClone(defaultArtifacts[operationType][0]);
}

function getDefaultConfigForType(operationType) {
  const defaultArtifacts = default_settings.operation_artifacts;

  if (!defaultArtifacts || !defaultArtifacts[operationType] || !defaultArtifacts[operationType][0]) {
    throw new Error(`No default config found for operation type: ${operationType}`);
  }

  const artifact = defaultArtifacts[operationType][0];

  const config = {
    prompt: artifact.prompt,
    prefill: artifact.prefill,
    connection_profile: artifact.connection_profile,
    completion_preset_name: artifact.completion_preset_name,
    include_preset_prompts: artifact.include_preset_prompts
  };

  if (operationType === 'auto_scene_break') {
    config.forced_prompt = artifact.forced_prompt || '';
    config.forced_prefill = artifact.forced_prefill || '';
  }

  return config;
}

function deepEqualConfigs(config1, config2) {
  if (!config1 || !config2) {
    return false;
  }

  if (config1.prompt !== config2.prompt) {
    return false;
  }
  if (config1.prefill !== config2.prefill) {
    return false;
  }
  if (config1.connection_profile !== config2.connection_profile) {
    return false;
  }
  if (config1.completion_preset_name !== config2.completion_preset_name) {
    return false;
  }
  if (config1.include_preset_prompts !== config2.include_preset_prompts) {
    return false;
  }

  if (config1.forced_prompt !== config2.forced_prompt) {
    return false;
  }
  if (config1.forced_prefill !== config2.forced_prefill) {
    return false;
  }

  return true;
}

export function updateDefaultArtifacts() {
  log(SUBSYSTEM.CORE, '=== Updating Default artifacts from code ===');

  const savedArtifacts = get_settings('operation_artifacts');
  if (!savedArtifacts) {
    log(SUBSYSTEM.CORE, 'No artifacts in storage, skipping update');
    return false;
  }

  let updated = false;

  for (const operationType of OPERATION_TYPES) {
    const savedOperationArtifacts = savedArtifacts[operationType];
    if (!savedOperationArtifacts || !Array.isArray(savedOperationArtifacts)) {
      continue;
    }

    const codeDefault = default_settings.operation_artifacts?.[operationType]?.[0];

    if (!codeDefault) {
      continue;
    }

    const index = savedOperationArtifacts.findIndex(a => a.isDefault);
    if (index !== -1) {
      log(SUBSYSTEM.CORE, `Updating Default artifact for ${operationType} from code`);
      savedOperationArtifacts[index] = structuredClone(codeDefault);
      updated = true;
    }
  }

  if (updated) {
    set_settings('operation_artifacts', savedArtifacts);
    saveSettingsDebounced();
    log(SUBSYSTEM.CORE, '=== Default artifacts updated ===');
  } else {
    log(SUBSYSTEM.CORE, '=== No Default artifacts found to update ===');
  }

  return updated;
}


import { get_settings, set_settings, error, log, SUBSYSTEM, saveSettingsDebounced } from './index.js';
import { findArtifactByContent, createArtifact } from './operationArtifacts.js';

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

export async function importPreset(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }

  if (data.format_version !== '1.0') {
    throw new Error(`Unsupported format version: ${data.format_version}`);
  }

  if (!data.operations || typeof data.operations !== 'object') {
    throw new Error('Invalid preset format: missing operations');
  }

  validateImportedOperations(data.operations);

  let presetName = data.preset_name;
  let counter = 1;
  const presets = get_settings('operations_presets') || {};
  while (presets[presetName]) {
    presetName = `${data.preset_name} (${counter})`;
    counter++;
  }

  const artifactMapping = {};
  for (const [operationType, operationData] of Object.entries(data.operations)) {
    // Sequential import required: each artifact creation may reference previous artifacts
    // eslint-disable-next-line no-await-in-loop -- Artifacts must be created sequentially
    const connectionProfileUuid = await lookupConnectionProfileUuid(operationData.connection_profile_name);
    const existingArtifact = findArtifactByContent(operationType, {
      prompt: operationData.prompt,
      prefill: operationData.prefill,
      connection_profile: connectionProfileUuid,
      completion_preset_name: operationData.completion_preset_name,
      include_preset_prompts: operationData.include_preset_prompts
    });

    if (existingArtifact) {
      artifactMapping[operationType] = existingArtifact.name;
      log(SUBSYSTEM.CORE, `Reusing existing artifact: ${existingArtifact.name} for ${operationType}`);
    } else {
      // eslint-disable-next-line no-await-in-loop -- Artifacts must be created sequentially
      const newArtifactName = await createArtifactFromImport(operationType, operationData);
      artifactMapping[operationType] = newArtifactName;
    }
  }

  const newPreset = {
    name: presetName,
    isDefault: false,
    operations: artifactMapping,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    description: data.preset_description || `Imported on ${new Date().toLocaleString()}`
  };

  presets[presetName] = newPreset;
  set_settings('operations_presets', presets);
  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Imported preset: "${presetName}"`);
  return presetName;
}

function validateImportedOperations(operations) {
  for (const operationType of OPERATION_TYPES) {
    if (!operations[operationType]) {
      throw new Error(`Missing operation: ${operationType}`);
    }

    const op = operations[operationType];
    if (!op.artifact_name || typeof op.artifact_name !== 'string') {
      throw new Error(`Invalid artifact_name for ${operationType}`);
    }
    if (!op.prompt || typeof op.prompt !== 'string') {
      throw new Error(`Invalid prompt for ${operationType}`);
    }
    if (typeof op.prefill !== 'string') {
      throw new Error(`Invalid prefill for ${operationType}`);
    }
    if (op.connection_profile_name !== null && typeof op.connection_profile_name !== 'string') {
      throw new Error(`Invalid connection_profile_name for ${operationType}`);
    }
    if (typeof op.completion_preset_name !== 'string') {
      throw new Error(`Invalid completion_preset_name for ${operationType}`);
    }
    if (typeof op.include_preset_prompts !== 'boolean') {
      throw new Error(`Invalid include_preset_prompts for ${operationType}`);
    }
  }
}

async function createArtifactFromImport(operationType, operationData) {
  const connectionProfileUuid = await lookupConnectionProfileUuid(operationData.connection_profile_name);

  const artifactData = {
    name: `${operationData.artifact_name} (imported)`,
    prompt: operationData.prompt,
    prefill: operationData.prefill,
    connection_profile: connectionProfileUuid,
    completion_preset_name: operationData.completion_preset_name,
    include_preset_prompts: operationData.include_preset_prompts,
    customLabel: `Imported from ${operationData.artifact_name}`
  };

  return createArtifact(operationType, artifactData);
}

async function lookupConnectionProfileUuid(name) {
  if (!name) {
    return null;
  }

  const profile = await lookupConnectionProfileByName(name);
  if (!profile) {
    log(SUBSYSTEM.CORE, `Connection profile not found: ${name}, using null`);
    return null;
  }
  return profile;
}

function lookupConnectionProfileByName(name) {
  if (!name) {
    return null;
  }

  try {
    const connectionManager = window.SillyTavern?.connectionManager;
    if (!connectionManager) {
      error('ConnectionManager not available');
      return null;
    }

    const profiles = connectionManager.getAllProfiles();
    const profile = profiles.find(p => p.name === name);
    return profile?.uuid || null;
  } catch (err) {
    error(`Failed to lookup connection profile by name "${name}":`, err);
    return null;
  }
}

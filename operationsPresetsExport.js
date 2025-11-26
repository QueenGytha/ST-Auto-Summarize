
import { get_settings, error, debug } from './index.js';
import { getArtifact } from './operationArtifacts.js';

const OPERATION_TYPES = [
  'scene_recap',
  'scene_recap_error_detection',
  'auto_scene_break',
  'running_scene_recap',
  'auto_lorebooks_recap_merge',
  'auto_lorebooks_recap_lorebook_entry_lookup',
  'auto_lorebooks_recap_lorebook_entry_deduplicate',
  'auto_lorebooks_bulk_populate',
  'auto_lorebooks_recap_lorebook_entry_compaction',
  'parse_scene_recap',
  'entity_types'
];

export function exportPreset(presetName) {
  const presets = get_settings('operations_presets') || {};
  const preset = presets[presetName];

  if (!preset) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  const exportData = {
    format_version: '1.0',
    exported_at: Date.now(),
    preset_name: preset.name,
    preset_description: preset.description,
    operations: {}
  };

  for (const operationType of OPERATION_TYPES) {
    const artifactName = preset.operations[operationType];
    const artifact = getArtifact(operationType, artifactName);

    if (!artifact) {
      error(`Artifact not found: ${artifactName} for ${operationType}, using Default`);
      const defaultArtifact = getArtifact(operationType, 'Default');
      if (!defaultArtifact) {
        throw new Error(`No default artifact found for ${operationType}`);
      }
      exportData.operations[operationType] = createOperationExportData(defaultArtifact);
    } else {
      exportData.operations[operationType] = createOperationExportData(artifact);
    }
  }

  return JSON.stringify(exportData, null, 2);
}

function createOperationExportData(artifact) {
  let connectionProfileName = null;
  if (artifact.connection_profile) {
    connectionProfileName = getConnectionProfileName(artifact.connection_profile);
  }

  return {
    artifact_name: artifact.name,
    prompt: artifact.prompt,
    prefill: artifact.prefill,
    connection_profile_name: connectionProfileName,
    completion_preset_name: artifact.completion_preset_name,
    include_preset_prompts: artifact.include_preset_prompts
  };
}

function getConnectionProfileName(uuid) {
  if (!uuid) {
    return null;
  }

  try {
    const connectionManager = window.SillyTavern?.connectionManager;
    if (!connectionManager) {
      debug('ConnectionManager not available during preset export');
      return null;
    }

    const profile = connectionManager.getProfileByUuid(uuid);
    return profile?.name || null;
  } catch (err) {
    debug(`Failed to get connection profile name for UUID ${uuid}:`, err);
    return null;
  }
}

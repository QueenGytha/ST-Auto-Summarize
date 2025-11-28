
import { get_settings, set_settings, log, SUBSYSTEM, saveSettingsDebounced } from './index.js';
import { default_settings } from './defaultSettings.js';
import { resolveOperationsPreset } from './operationsPresetsResolution.js';

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

function validateOperationType(operationType) {
  if (!OPERATION_TYPES.includes(operationType)) {
    throw new Error(`Invalid operation type: ${operationType}`);
  }
}

function validateArtifactInput(operationType, artifactData) {
  if (operationType === 'entity_types') {
    if (!artifactData.types || !Array.isArray(artifactData.types)) {
      throw new Error('Entity types artifact must have a types array');
    }
  } else if (operationType === 'entry_defaults') {
    if (!artifactData.defaults || typeof artifactData.defaults !== 'object') {
      throw new Error('Entry defaults artifact must have a defaults object');
    }
  } else if (!artifactData.prompt) {
    throw new Error('Artifact must have a prompt');
  }
}

function buildEntityTypesArtifact(artifactData, newVersion) {
  return {
    name: artifactData.name || `v${newVersion}`,
    types: artifactData.types,
    isDefault: artifactData.isDefault || false,
    internalVersion: newVersion,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    customLabel: artifactData.customLabel || null
  };
}

function buildEntryDefaultsArtifact(artifactData, newVersion) {
  return {
    name: artifactData.name || `v${newVersion}`,
    defaults: artifactData.defaults,
    isDefault: artifactData.isDefault || false,
    internalVersion: newVersion,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    customLabel: artifactData.customLabel || null
  };
}

function buildBasePromptArtifact(artifactData, newVersion) {
  return {
    name: artifactData.name || `v${newVersion}`,
    prompt: artifactData.prompt,
    prefill: artifactData.prefill || '',
    connection_profile: artifactData.connection_profile || null,
    completion_preset_name: artifactData.completion_preset_name || '',
    include_preset_prompts: artifactData.include_preset_prompts || false,
    isDefault: artifactData.isDefault || false,
    internalVersion: newVersion,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    customLabel: artifactData.customLabel || null
  };
}

function addAutoSceneBreakFields(artifact, artifactData) {
  artifact.forced_prompt = artifactData.forced_prompt || '';
  artifact.forced_prefill = artifactData.forced_prefill || '';
  artifact.forced_connection_profile = artifactData.forced_connection_profile || null;
  artifact.forced_completion_preset_name = artifactData.forced_completion_preset_name || '';
  artifact.forced_include_preset_prompts = artifactData.forced_include_preset_prompts || false;
}

function getNextVersion(operationArtifacts) {
  const maxVersion = operationArtifacts.length > 0
    ? Math.max(...operationArtifacts.map(a => a.internalVersion))
    : 0;
  return maxVersion + 1;
}

export function createArtifact(operationType, artifactData) {
  validateOperationType(operationType);
  validateArtifactInput(operationType, artifactData);

  const artifacts = get_settings('operation_artifacts') || {};
  if (!artifacts[operationType]) {
    artifacts[operationType] = [];
  }

  const operationArtifacts = artifacts[operationType];
  const newVersion = getNextVersion(operationArtifacts);

  let newArtifact;
  if (operationType === 'entity_types') {
    newArtifact = buildEntityTypesArtifact(artifactData, newVersion);
  } else if (operationType === 'entry_defaults') {
    newArtifact = buildEntryDefaultsArtifact(artifactData, newVersion);
  } else {
    newArtifact = buildBasePromptArtifact(artifactData, newVersion);
    if (operationType === 'auto_scene_break') {
      addAutoSceneBreakFields(newArtifact, artifactData);
    }
  }

  operationArtifacts.push(newArtifact);
  artifacts[operationType] = operationArtifacts;
  set_settings('operation_artifacts', artifacts);
  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Created artifact "${newArtifact.name}" for ${operationType}`);
  return newArtifact.name;
}

function applyEntityTypesChanges(artifact, changes) {
  if (changes.types !== undefined) {
    artifact.types = changes.types;
  }
  if (changes.customLabel !== undefined) {
    artifact.customLabel = changes.customLabel;
  }
}

function applyEntryDefaultsChanges(artifact, changes) {
  if (changes.defaults !== undefined) {
    artifact.defaults = changes.defaults;
  }
  if (changes.customLabel !== undefined) {
    artifact.customLabel = changes.customLabel;
  }
}

function applyPromptChanges(artifact, changes) {
  if (changes.prompt !== undefined) {
    artifact.prompt = changes.prompt;
  }
  if (changes.prefill !== undefined) {
    artifact.prefill = changes.prefill;
  }
  if (changes.connection_profile !== undefined) {
    artifact.connection_profile = changes.connection_profile;
  }
  if (changes.completion_preset_name !== undefined) {
    artifact.completion_preset_name = changes.completion_preset_name;
  }
  if (changes.include_preset_prompts !== undefined) {
    artifact.include_preset_prompts = changes.include_preset_prompts;
  }
  if (changes.customLabel !== undefined) {
    artifact.customLabel = changes.customLabel;
  }
}

function applyAutoSceneBreakChanges(artifact, changes) {
  if (changes.forced_prompt !== undefined) {
    artifact.forced_prompt = changes.forced_prompt;
  }
  if (changes.forced_prefill !== undefined) {
    artifact.forced_prefill = changes.forced_prefill;
  }
  if (changes.forced_connection_profile !== undefined) {
    artifact.forced_connection_profile = changes.forced_connection_profile;
  }
  if (changes.forced_completion_preset_name !== undefined) {
    artifact.forced_completion_preset_name = changes.forced_completion_preset_name;
  }
  if (changes.forced_include_preset_prompts !== undefined) {
    artifact.forced_include_preset_prompts = changes.forced_include_preset_prompts;
  }
}

function applyChangesToArtifact(operationType, artifact, changes) {
  if (operationType === 'entity_types') {
    applyEntityTypesChanges(artifact, changes);
  } else if (operationType === 'entry_defaults') {
    applyEntryDefaultsChanges(artifact, changes);
  } else {
    applyPromptChanges(artifact, changes);
    if (operationType === 'auto_scene_break') {
      applyAutoSceneBreakChanges(artifact, changes);
    }
  }
  artifact.modifiedAt = Date.now();
}

export function updateArtifact(operationType, artifactName, changes) {
  validateOperationType(operationType);

  const currentArtifact = getArtifact(operationType, artifactName);
  if (!currentArtifact) {
    throw new Error(`Artifact not found: ${artifactName}`);
  }

  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];

  let targetArtifact;
  let targetName;

  if (currentArtifact.isDefault) {
    targetName = createNewArtifactVersion(operationType, artifactName);
    targetArtifact = operationArtifacts.find(a => a.name === targetName);
  } else {
    targetArtifact = currentArtifact;
    targetName = artifactName;
  }

  applyChangesToArtifact(operationType, targetArtifact, changes);

  artifacts[operationType] = operationArtifacts;
  set_settings('operation_artifacts', artifacts);
  saveSettingsDebounced();

  const action = currentArtifact.isDefault ? 'Created version' : 'Updated';
  log(SUBSYSTEM.CORE, `${action} artifact "${artifactName}" → "${targetName}" for ${operationType}`);
  return targetName;
}

export function deleteArtifact(operationType, artifactName) {
  if (!OPERATION_TYPES.includes(operationType)) {
    throw new Error(`Invalid operation type: ${operationType}`);
  }

  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];

  const artifact = operationArtifacts.find(a => a.name === artifactName);
  if (!artifact) {
    throw new Error(`Artifact not found: ${artifactName}`);
  }

  if (artifact.isDefault) {
    throw new Error('Cannot delete Default artifact');
  }

  const { presetName: currentPreset } = resolveOperationsPreset();
  const referencedNames = getReferencedArtifactNames(currentPreset);
  if (referencedNames.has(artifactName)) {
    throw new Error(`Artifact "${artifactName}" is referenced in one or more presets other than "${currentPreset}"`);
  }

  artifacts[operationType] = operationArtifacts.filter(a => a.name !== artifactName);
  set_settings('operation_artifacts', artifacts);
  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Deleted artifact "${artifactName}" for ${operationType}`);
  return true;
}

export function getArtifact(operationType, artifactName) {
  if (!OPERATION_TYPES.includes(operationType)) {
    throw new Error(`Invalid operation type: ${operationType}`);
  }

  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];

  let artifact = operationArtifacts.find(a => a.name === artifactName);

  if (!artifact) {
    const defaultArtifacts = default_settings.operation_artifacts;
    if (defaultArtifacts && defaultArtifacts[operationType]) {
      artifact = defaultArtifacts[operationType].find(a => a.name === artifactName);
    }
  }

  return artifact || null;
}

export function listArtifacts(operationType) {
  if (!OPERATION_TYPES.includes(operationType)) {
    throw new Error(`Invalid operation type: ${operationType}`);
  }

  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType];

  if (operationArtifacts && operationArtifacts.length > 0) {
    return operationArtifacts;
  }

  const defaultArtifacts = default_settings.operation_artifacts;

  if (defaultArtifacts && defaultArtifacts[operationType]) {
    return structuredClone(defaultArtifacts[operationType]);
  }

  return [];
}

export function findArtifactByContent(operationType, content) {
  if (!OPERATION_TYPES.includes(operationType)) {
    throw new Error(`Invalid operation type: ${operationType}`);
  }

  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];

  return operationArtifacts.find(a => {
    // entity_types uses types array instead of prompt
    if (operationType === 'entity_types') {
      return JSON.stringify(a.types) === JSON.stringify(content.types);
    }

    // entry_defaults uses defaults object instead of prompt
    if (operationType === 'entry_defaults') {
      return JSON.stringify(a.defaults) === JSON.stringify(content.defaults);
    }

    const basicMatch = a.prompt === content.prompt &&
      a.prefill === content.prefill &&
      a.connection_profile === content.connection_profile &&
      a.completion_preset_name === content.completion_preset_name &&
      a.include_preset_prompts === content.include_preset_prompts;

    if (operationType === 'auto_scene_break') {
      return basicMatch &&
        a.forced_prompt === content.forced_prompt &&
        a.forced_prefill === content.forced_prefill;
    }

    return basicMatch;
  }) || null;
}

export function createNewArtifactVersion(operationType, currentArtifactName) {
  if (!OPERATION_TYPES.includes(operationType)) {
    throw new Error(`Invalid operation type: ${operationType}`);
  }

  const artifacts = get_settings('operation_artifacts') || {};
  let operationArtifacts = artifacts[operationType] || [];

  let currentArtifact = operationArtifacts.find(a => a.name === currentArtifactName);

  if (!currentArtifact) {
    const defaultArtifacts = default_settings.operation_artifacts;
    if (defaultArtifacts && defaultArtifacts[operationType]) {
      currentArtifact = defaultArtifacts[operationType].find(a => a.name === currentArtifactName);
      if (currentArtifact) {
        operationArtifacts = structuredClone(defaultArtifacts[operationType]);
      }
    }
  }

  if (!currentArtifact) {
    throw new Error(`Artifact not found: ${currentArtifactName}`);
  }

  const maxVersion = Math.max(...operationArtifacts.map(a => a.internalVersion));
  const newVersion = maxVersion + 1;

  const newName = currentArtifact.customLabel
    ? `${currentArtifact.customLabel} v${newVersion}`
    : `v${newVersion}`;

  const newArtifact = {
    ...structuredClone(currentArtifact),
    name: newName,
    isDefault: false,
    internalVersion: newVersion,
    createdAt: Date.now(),
    modifiedAt: Date.now()
  };

  operationArtifacts.push(newArtifact);
  artifacts[operationType] = operationArtifacts;
  set_settings('operation_artifacts', artifacts);
  saveSettingsDebounced();

  log(SUBSYSTEM.CORE, `Created version ${newVersion} of artifact: ${currentArtifactName} → ${newName}`);
  return newName;
}

export function pruneArtifactVersions(operationType, maxVersions = 10) {
  if (!OPERATION_TYPES.includes(operationType)) {
    throw new Error(`Invalid operation type: ${operationType}`);
  }

  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];

  const defaults = operationArtifacts.filter(a => a.isDefault);
  const nonDefaults = operationArtifacts.filter(a => !a.isDefault);

  const referencedNames = getReferencedArtifactNames();

  nonDefaults.sort((a, b) => b.internalVersion - a.internalVersion);

  const toKeep = nonDefaults.filter((artifact, index) => {
    return index < maxVersions || referencedNames.has(artifact.name);
  });

  const pruned = [...defaults, ...toKeep];

  artifacts[operationType] = pruned;
  set_settings('operation_artifacts', artifacts);
  saveSettingsDebounced();

  const removedCount = operationArtifacts.length - pruned.length;
  if (removedCount > 0) {
    log(SUBSYSTEM.CORE, `Pruned ${removedCount} old artifact versions for ${operationType}`);
  }

  return removedCount;
}

export function getReferencedArtifactNames(excludePresetName = null) {
  const presets = get_settings('operations_presets') || {};
  const referenced = new Set();

  for (const [presetName, preset] of Object.entries(presets)) {
    if (excludePresetName && presetName === excludePresetName) {
      continue;
    }
    for (const artifactName of Object.values(preset.operations)) {
      referenced.add(artifactName);
    }
  }

  return referenced;
}

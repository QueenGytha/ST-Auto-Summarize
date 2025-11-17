
import { get_settings, set_settings, error, log, SUBSYSTEM, get_current_chat_identifier, get_current_character_identifier } from './index.js';

export function presetExists(presetName) {
  if (!presetName || typeof presetName !== 'string') {
    return false;
  }

  const presets = get_settings('operations_presets') || {};
  return !!presets[presetName];
}

export function setUserSelectedPreset(presetName) {
  set_settings('active_operations_preset_global', presetName);
  log(SUBSYSTEM.CORE, `Set user-selected preset to: "${presetName}"`);
}

export function resolveOperationsPreset() {
  try {
    const chatId = get_current_chat_identifier();
    if (chatId) {
      const chatStickies = get_settings('chat_sticky_presets') || {};
      const chatPreset = chatStickies[chatId];
      if (chatPreset && presetExists(chatPreset)) {
        log(SUBSYSTEM.CORE, `Resolved preset from chat sticky: "${chatPreset}"`);
        return chatPreset;
      }
    }

    const characterKey = get_current_character_identifier();
    if (characterKey) {
      const characterStickies = get_settings('character_sticky_presets') || {};
      const characterPreset = characterStickies[characterKey];
      if (characterPreset && presetExists(characterPreset)) {
        log(SUBSYSTEM.CORE, `Resolved preset from character sticky: "${characterPreset}"`);
        return characterPreset;
      }
    }

    const userSelection = get_settings('active_operations_preset_global');
    if (userSelection && presetExists(userSelection)) {
      log(SUBSYSTEM.CORE, `Resolved preset from user selection: "${userSelection}"`);
      return userSelection;
    }

    const profile = get_settings('profile');
    const profiles = get_settings('profiles');
    const activePreset = profiles[profile]?.active_operations_preset;
    if (activePreset && presetExists(activePreset)) {
      log(SUBSYSTEM.CORE, `Resolved preset from profile: "${activePreset}"`);
      return activePreset;
    }

    log(SUBSYSTEM.CORE, 'Resolved preset to Default (fallback)');
    return 'Default';

  } catch (err) {
    error(SUBSYSTEM.CORE, 'Failed to resolve operations preset:', err);
    return 'Default';
  }
}

export function getDefaultArtifact(operationType) {
  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];
  const defaultArtifact = operationArtifacts.find(a => a.isDefault);

  if (!defaultArtifact) {
    throw new Error(`No default artifact found for ${operationType}`);
  }

  return defaultArtifact;
}

export function resolveOperationConfig(operationType) {
  try {
    const presetName = resolveOperationsPreset();
    const presets = get_settings('operations_presets') || {};
    const preset = presets[presetName];

    if (!preset) {
      error(SUBSYSTEM.CORE, `Preset not found: ${presetName}, using Default`);
      return getDefaultArtifact(operationType);
    }

    const artifactName = preset.operations[operationType];
    if (!artifactName) {
      error(SUBSYSTEM.CORE, `No artifact defined for ${operationType} in preset ${presetName}`);
      return getDefaultArtifact(operationType);
    }

    const artifacts = get_settings('operation_artifacts') || {};
    const operationArtifacts = artifacts[operationType] || [];
    const artifact = operationArtifacts.find(a => a.name === artifactName);

    if (!artifact) {
      error(SUBSYSTEM.CORE, `Artifact not found: ${artifactName} for ${operationType}`);
      return getDefaultArtifact(operationType);
    }

    log(SUBSYSTEM.CORE, `Resolved config for ${operationType}: preset="${presetName}", artifact="${artifactName}"`);
    return artifact;

  } catch (err) {
    error(SUBSYSTEM.CORE, `Failed to resolve operation config for ${operationType}:`, err);
    return getDefaultArtifact(operationType);
  }
}

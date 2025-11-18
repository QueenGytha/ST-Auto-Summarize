
import { get_settings, set_settings, error, log, debug, SUBSYSTEM, get_current_chat_identifier, get_current_character_identifier, getContext } from './index.js';

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

/**
 * Resolve actual profile and preset being used (for metadata, not logging)
 * @param {string} artifactProfileId - Connection profile ID from artifact (may be empty)
 * @param {string} artifactPresetName - Completion preset name from artifact (may be empty)
 * @returns {{profileName: string, presetName: string, usingSTCurrentProfile: boolean, usingSTCurrentPreset: boolean}}
 */
export function resolveActualProfileAndPreset(artifactProfileId, artifactPresetName) {
  const ctx = getContext();
  let profileName = null;
  let usingSTCurrentProfile = false;

  // Resolve profile
  if (artifactProfileId && artifactProfileId !== '') {
    const profile = ctx.extensionSettings.connectionManager?.profiles?.find(p => p.id === artifactProfileId);
    profileName = profile?.name || null;
  } else {
    // Using ST current
    usingSTCurrentProfile = true;
    const selectedProfileId = ctx.extensionSettings.connectionManager?.selectedProfile;
    if (selectedProfileId) {
      const profile = ctx.extensionSettings.connectionManager?.profiles?.find(p => p.id === selectedProfileId);
      profileName = profile?.name || null;
    }
  }

  // Resolve preset
  let presetName = null;
  let usingSTCurrentPreset = false;

  if (artifactPresetName && artifactPresetName !== '') {
    presetName = artifactPresetName;
  } else {
    // Using ST current
    usingSTCurrentPreset = true;
    try {
      presetName = ctx.presetSettings?.name || ctx.chatCompletionSettings?.name || null;
    } catch {
      presetName = null;
    }
  }

  return {
    profileName,
    presetName,
    usingSTCurrentProfile,
    usingSTCurrentPreset
  };
}

/**
 * Resolve connection profile name with "(ST Current)" suffix when using ST's active profile
 * @param {string} artifactProfileId - Connection profile ID from artifact (may be empty)
 * @param {string} artifactPresetName - Completion preset name from artifact (may be empty)
 * @returns {{profileDisplay: string, presetDisplay: string}} Formatted names for logging
 */
function resolveDisplayNames(artifactProfileId, artifactPresetName) {
  // Use the single source of truth
  const { profileName, presetName, usingSTCurrentProfile, usingSTCurrentPreset } =
    resolveActualProfileAndPreset(artifactProfileId, artifactPresetName);

  // Format for display
  let profileDisplay;
  if (!profileName) {
    profileDisplay = '"(none)"';
  } else if (usingSTCurrentProfile) {
    profileDisplay = `"${profileName}" (ST Current)`;
  } else {
    profileDisplay = `"${profileName}"`;
  }

  let presetDisplay;
  if (!presetName) {
    presetDisplay = '"(none)"';
  } else if (usingSTCurrentPreset) {
    presetDisplay = `"${presetName}" (ST Current)`;
  } else {
    presetDisplay = `"${presetName}"`;
  }

  return { profileDisplay, presetDisplay };
}

export function getDefaultArtifact(operationType) {
  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];
  const defaultArtifact = operationArtifacts.find(a => a.isDefault);

  if (!defaultArtifact) {
    throw new Error(`No default artifact found for ${operationType}`);
  }

  // Log default artifact usage with resolved names
  const presetName = resolveOperationsPreset();
  const { profileDisplay, presetDisplay } = resolveDisplayNames(
    defaultArtifact.connection_profile,
    defaultArtifact.completion_preset_name
  );

  debug(SUBSYSTEM.CORE, `[${operationType}] Using default artifact (preset "${presetName}" missing this operation):`);
  debug(SUBSYSTEM.CORE, `  Artifact: "${defaultArtifact.name}" (version ${defaultArtifact.internalVersion})`);
  debug(SUBSYSTEM.CORE, `  Connection profile: ${profileDisplay}`);
  debug(SUBSYSTEM.CORE, `  Completion preset: ${presetDisplay}`);
  debug(SUBSYSTEM.CORE, `  Include preset prompts: ${defaultArtifact.include_preset_prompts || false}`);
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

    // Log resolved configuration with actual profile/preset names
    const { profileDisplay, presetDisplay } = resolveDisplayNames(
      artifact.connection_profile,
      artifact.completion_preset_name
    );

    debug(SUBSYSTEM.CORE, `[${operationType}] Configuration resolved:`);
    debug(SUBSYSTEM.CORE, `  Operations preset: "${presetName}"`);
    debug(SUBSYSTEM.CORE, `  Artifact: "${artifactName}" (version ${artifact.internalVersion})`);
    debug(SUBSYSTEM.CORE, `  Connection profile: ${profileDisplay}`);
    debug(SUBSYSTEM.CORE, `  Completion preset: ${presetDisplay}`);
    debug(SUBSYSTEM.CORE, `  Include preset prompts: ${artifact.include_preset_prompts || false}`);
    return artifact;

  } catch (err) {
    error(SUBSYSTEM.CORE, `Failed to resolve operation config for ${operationType}:`, err);
    return getDefaultArtifact(operationType);
  }
}

export function buildLorebookOperationsSettings() {
  const mergeConfig = resolveOperationConfig('auto_lorebooks_recap_merge');
  const lookupConfig = resolveOperationConfig('auto_lorebooks_recap_lorebook_entry_lookup');
  const deduplicateConfig = resolveOperationConfig('auto_lorebooks_recap_lorebook_entry_deduplicate');

  return {
    merge_connection_profile: mergeConfig.connection_profile || '',
    merge_completion_preset: mergeConfig.completion_preset_name || '',
    merge_prefill: mergeConfig.prefill || '',
    merge_prompt: mergeConfig.prompt || '',
    merge_include_preset_prompts: mergeConfig.include_preset_prompts ?? false,

    lorebook_entry_lookup_connection_profile: lookupConfig.connection_profile || '',
    lorebook_entry_lookup_completion_preset: lookupConfig.completion_preset_name || '',
    lorebook_entry_lookup_prefill: lookupConfig.prefill || '',
    lorebook_entry_lookup_prompt: lookupConfig.prompt || '',
    lorebook_entry_lookup_include_preset_prompts: lookupConfig.include_preset_prompts ?? false,

    lorebook_entry_deduplicate_connection_profile: deduplicateConfig.connection_profile || '',
    lorebook_entry_deduplicate_completion_preset: deduplicateConfig.completion_preset_name || '',
    lorebook_entry_deduplicate_prefill: deduplicateConfig.prefill || '',
    lorebook_entry_deduplicate_prompt: deduplicateConfig.prompt || '',
    lorebook_entry_deduplicate_include_preset_prompts: deduplicateConfig.include_preset_prompts ?? false,

    skip_duplicates: get_settings('auto_lorebooks_recap_skip_duplicates') ?? true
  };
}

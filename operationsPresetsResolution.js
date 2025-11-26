
import { get_settings, set_settings, error, log, debug, SUBSYSTEM, get_current_chat_identifier, get_current_character_identifier, getContext, default_settings } from './index.js';

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
        return { presetName: chatPreset, source: 'chat-sticky' };
      }
    }

    const characterKey = get_current_character_identifier();
    if (characterKey) {
      const characterStickies = get_settings('character_sticky_presets') || {};
      const characterPreset = characterStickies[characterKey];
      if (characterPreset && presetExists(characterPreset)) {
        log(SUBSYSTEM.CORE, `Resolved preset from character sticky: "${characterPreset}"`);
        return { presetName: characterPreset, source: 'character-sticky' };
      }
    }

    const userSelection = get_settings('active_operations_preset_global');
    if (userSelection && presetExists(userSelection)) {
      log(SUBSYSTEM.CORE, `Resolved preset from user selection: "${userSelection}"`);
      return { presetName: userSelection, source: 'global-selection' };
    }

    const profile = get_settings('profile');
    const profiles = get_settings('profiles');
    const activePreset = profiles[profile]?.active_operations_preset;
    if (activePreset && presetExists(activePreset)) {
      log(SUBSYSTEM.CORE, `Resolved preset from profile: "${activePreset}"`);
      return { presetName: activePreset, source: 'profile' };
    }

    log(SUBSYSTEM.CORE, 'Resolved preset to Default (fallback)');
    return { presetName: 'Default', source: 'fallback' };

  } catch (err) {
    error(SUBSYSTEM.CORE, 'Failed to resolve operations preset:', err);
    return { presetName: 'Default', source: 'fallback' };
  }
}

/**
 * Resolve actual profile and preset being used (for metadata, not logging)
 * @param {string} artifactProfileId - Connection profile ID from artifact (may be empty)
 * @param {string} artifactPresetName - Completion preset name from artifact (may be empty)
 * @returns {{profileName: string, presetName: string, usingSTCurrentProfile: boolean, usingSTCurrentPreset: boolean}}
 */
export async function resolveActualProfileAndPreset(artifactProfileId, artifactPresetName) {
  const ctx = getContext();
  let profileName = null;
  let usingSTCurrentProfile = false;
  let profileData = null;

  // Resolve profile
  if (artifactProfileId && artifactProfileId !== '') {
    profileData = ctx.extensionSettings.connectionManager?.profiles?.find(p => p.id === artifactProfileId);
    profileName = profileData?.name || null;
  } else {
    // Using ST current
    usingSTCurrentProfile = true;
    const selectedProfileId = ctx.extensionSettings.connectionManager?.selectedProfile;
    if (selectedProfileId) {
      profileData = ctx.extensionSettings.connectionManager?.profiles?.find(p => p.id === selectedProfileId);
      profileName = profileData?.name || null;
    }
  }

  // Resolve preset
  let presetName = null;
  let usingSTCurrentPreset = false;

  if (artifactPresetName && artifactPresetName !== '') {
    presetName = artifactPresetName;
  } else {
    // Using ST current - get the actual preset name from preset manager
    usingSTCurrentPreset = true;
    try {
      // Determine API type from profile
      let apiType = 'openai'; // default
      if (profileData?.api_type) {
        apiType = profileData.api_type;
      }

      const { getPresetManager } = await import('../../../preset-manager.js');
      const presetManager = getPresetManager(apiType);
      presetName = presetManager?.getSelectedPresetName() || null;
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
async function resolveDisplayNames(artifactProfileId, artifactPresetName) {
  // Use the single source of truth
  const { profileName, presetName, usingSTCurrentProfile, usingSTCurrentPreset } =
    await resolveActualProfileAndPreset(artifactProfileId, artifactPresetName);

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

export async function getDefaultArtifact(operationType) {
  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];
  let defaultArtifact = operationArtifacts.find(a => a.isDefault);

  if (!defaultArtifact) {
    const defaultArtifacts = default_settings.operation_artifacts;
    if (defaultArtifacts && defaultArtifacts[operationType]) {
      defaultArtifact = defaultArtifacts[operationType].find(a => a.isDefault);
    }
  }

  if (!defaultArtifact) {
    throw new Error(`No default artifact found for ${operationType}`);
  }

  // Log default artifact usage with resolved names
  const { presetName } = resolveOperationsPreset();
  const { profileDisplay, presetDisplay } = await resolveDisplayNames(
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

export async function resolveOperationConfig(operationType) {
  try {
    const { presetName } = resolveOperationsPreset();
    const presets = get_settings('operations_presets') || {};
    const preset = presets[presetName];

    if (!preset) {
      error(SUBSYSTEM.CORE, `Preset not found: ${presetName}, using Default`);
      return await getDefaultArtifact(operationType);
    }

    const artifactName = preset.operations[operationType];
    if (!artifactName) {
      debug(SUBSYSTEM.CORE, `[${operationType}] Not defined in preset "${presetName}", using Default artifact`);
      return await getDefaultArtifact(operationType);
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

    if (!artifact) {
      debug(SUBSYSTEM.CORE, `[${operationType}] Artifact "${artifactName}" not found, using Default artifact`);
      return await getDefaultArtifact(operationType);
    }

    // Log resolved configuration with actual profile/preset names
    const { profileDisplay, presetDisplay } = await resolveDisplayNames(
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
    return await getDefaultArtifact(operationType);
  }
}

export async function buildLorebookOperationsSettings() {
  const mergeConfig = await resolveOperationConfig('auto_lorebooks_recap_merge');
  const lookupConfig = await resolveOperationConfig('auto_lorebooks_recap_lorebook_entry_lookup');
  const deduplicateConfig = await resolveOperationConfig('auto_lorebooks_recap_lorebook_entry_deduplicate');

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
    lorebook_entry_deduplicate_include_preset_prompts: deduplicateConfig.include_preset_prompts ?? false
  };
}

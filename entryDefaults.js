import { DEFAULT_ENTRY_DEFAULTS } from './entityTypes.js';

// Re-export for backwards compatibility
export { DEFAULT_ENTRY_DEFAULTS };

/**
 * Get entry defaults from the entity_types artifact (defaults are part of entity_types now)
 * @param {object} settings - Extension settings object
 * @returns {object} Entry defaults object with exclude_recursion, prevent_recursion, ignore_budget, sticky
 */
export function getEntryDefaultsFromSettings(settings) {
  // Try to get from entity_types artifact (new format - defaults are part of entity_types)
  const artifacts = settings?.operation_artifacts?.entity_types;
  if (artifacts && artifacts.length > 0) {
    const activeArtifact = artifacts.find(a => a.isDefault) || artifacts[0];
    if (activeArtifact && activeArtifact.defaults) {
      return validateAndNormalizeDefaults(activeArtifact.defaults);
    }
  }

  // Fall back to legacy entry_defaults artifact (migration support)
  const legacyArtifacts = settings?.operation_artifacts?.entry_defaults;
  if (legacyArtifacts && legacyArtifacts.length > 0) {
    const activeArtifact = legacyArtifacts.find(a => a.isDefault) || legacyArtifacts[0];
    if (activeArtifact && activeArtifact.defaults) {
      return validateAndNormalizeDefaults(activeArtifact.defaults);
    }
  }

  // Fall back to legacy settings format
  const legacyDefaults = extractLegacyDefaults(settings);
  if (legacyDefaults) {
    return legacyDefaults;
  }

  return { ...DEFAULT_ENTRY_DEFAULTS };
}

/**
 * Extract entry defaults from legacy settings format
 * @param {object} settings - Extension settings object
 * @returns {object|null} Entry defaults object or null if not found
 */
function extractLegacyDefaults(settings) {
  if (!settings) {
    return null;
  }

  const hasLegacySettings =
    settings.auto_lorebooks_entry_exclude_recursion !== undefined ||
    settings.auto_lorebooks_entry_prevent_recursion !== undefined ||
    settings.auto_lorebooks_entry_ignore_budget !== undefined ||
    settings.auto_lorebooks_entry_sticky !== undefined;

  if (!hasLegacySettings) {
    return null;
  }

  return {
    exclude_recursion: settings.auto_lorebooks_entry_exclude_recursion ?? DEFAULT_ENTRY_DEFAULTS.exclude_recursion,
    prevent_recursion: settings.auto_lorebooks_entry_prevent_recursion ?? DEFAULT_ENTRY_DEFAULTS.prevent_recursion,
    ignore_budget: settings.auto_lorebooks_entry_ignore_budget ?? DEFAULT_ENTRY_DEFAULTS.ignore_budget,
    sticky: settings.auto_lorebooks_entry_sticky ?? DEFAULT_ENTRY_DEFAULTS.sticky
  };
}

/**
 * Validate and normalize entry defaults object
 * Ensures all required properties exist with correct types
 * @param {object} defaults - Entry defaults object to validate
 * @returns {object} Validated and normalized entry defaults
 */
export function validateAndNormalizeDefaults(defaults) {
  if (!defaults || typeof defaults !== 'object') {
    return { ...DEFAULT_ENTRY_DEFAULTS };
  }

  return {
    exclude_recursion: typeof defaults.exclude_recursion === 'boolean'
      ? defaults.exclude_recursion
      : DEFAULT_ENTRY_DEFAULTS.exclude_recursion,
    prevent_recursion: typeof defaults.prevent_recursion === 'boolean'
      ? defaults.prevent_recursion
      : DEFAULT_ENTRY_DEFAULTS.prevent_recursion,
    ignore_budget: typeof defaults.ignore_budget === 'boolean'
      ? defaults.ignore_budget
      : DEFAULT_ENTRY_DEFAULTS.ignore_budget,
    sticky: typeof defaults.sticky === 'number' && defaults.sticky >= 0
      ? defaults.sticky
      : DEFAULT_ENTRY_DEFAULTS.sticky
  };
}

/**
 * Apply entry defaults to a lorebook entry object
 * @param {object} entry - Lorebook entry object to modify
 * @param {object} defaults - Entry defaults to apply
 */
export function applyEntryDefaults(entry, defaults) {
  if (!entry || !defaults) {
    return;
  }

  const normalized = validateAndNormalizeDefaults(defaults);

  entry.excludeRecursion = normalized.exclude_recursion;
  entry.preventRecursion = normalized.prevent_recursion;
  entry.extensions = entry.extensions || {};
  entry.extensions.ignore_budget = normalized.ignore_budget;
  entry.sticky = normalized.sticky;
}

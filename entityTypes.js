

// Default entity types with the new table-based structure
// Each entry has: name, constant (boolean), usage (string), and optionally isGuidanceOnly (boolean)
// These descriptions are included in prompts via {{lorebook_entry_types_with_guidance}} macro.
// Use them to guide LLM on what goes where - reduces repetition in prompts.
export const DEFAULT_ENTITY_TYPES = [
  // Special guidance-only entry (always first, cannot be deleted)
  { name: 'recap', constant: null, usage: '(NOT FOR SL ENTRIES) Goes in rc field: DEV (plot outcomes, key events), PEND (unresolved plot threads - narrative hooks, NOT character goals), KNOWS (who knows what secrets). High-level only.', isGuidanceOnly: true },
  // Regular lorebook entry types
  { name: 'character', constant: false, usage: 'Named characters. Bullets: Identity (background, role, position), State (conditions, belongings, status), Voice (distinctive quotes), Arc (growth journey), Stance (relationship per target).' },
  { name: 'location', constant: false, usage: 'Places and settings. Include history, significance, current conditions if persistent.' },
  { name: 'item', constant: false, usage: 'Important objects. Full details here; characters just list in Belongings. Track ownership, significance, abilities.' },
  { name: 'faction', constant: false, usage: 'Groups and organizations. Include their goals, stances toward other factions/characters, internal dynamics.' },
  { name: 'lore', constant: false, usage: 'World history, mythology, events, magic systems, world rules. Facts that persist and inform the setting.' },
  { name: 'quest', constant: true, usage: 'Character goals and missions. What they are actively trying to achieve (distinct from PEND plot threads).' },
  { name: 'rule', constant: true, usage: 'OOC constraints, TTRPG systems, roleplay boundaries. Meta-rules that govern the story.' }
];

// Legacy format for backwards compatibility during migration
export const LEGACY_ENTITY_TYPES = [
  'character',
  'location',
  'item',
  'faction',
  'lore',
  'quest(entry:constant)',
  'rule(entry:constant)'
];

const VALID_ENTRY_FLAGS = new Set(['constant']);

function sanitizeBaseName(value) {
  return value.
    toLowerCase().
    trim().
    replace(/\s+/g, '_').
    replace(/[^a-z0-9_-]/g, '');
}

/**
 * Parse a legacy entity type definition string (e.g., "quest(entry:constant)")
 * into the new object format { name, constant, usage, isGuidanceOnly }
 */
export function parseEntityTypeDefinition(rawValue) {
  // If already in new object format, return as-is with validation
  if (rawValue && typeof rawValue === 'object' && rawValue.name !== undefined) {
    return {
      raw: rawValue.name,
      name: sanitizeBaseName(rawValue.name),
      entryFlags: rawValue.constant ? ['constant'] : [],
      usage: rawValue.usage || '',
      isGuidanceOnly: rawValue.isGuidanceOnly || false,
      constant: rawValue.constant
    };
  }

  // Parse legacy string format
  const trimmed = String(rawValue || '').trim();
  const lower = trimmed.toLowerCase();

  let namePart = lower;
  let flagsPart = '';

  const openIdx = lower.indexOf('(');
  const closeIdx = lower.lastIndexOf(')');

  if (openIdx >= 0 && closeIdx > openIdx) {
    namePart = lower.slice(0, openIdx);
    flagsPart = lower.slice(openIdx + 1, closeIdx);
  }

  const name = sanitizeBaseName(namePart);
  const entryFlags = [];

  if (flagsPart) {
    const tokens = flagsPart.split(',');
    for (const token of tokens) {
      const t = token.trim();
      if (!t) { continue; }
      if (!t.startsWith('entry:')) { continue; }
      const flagName = t.slice('entry:'.length).trim();
      if (VALID_ENTRY_FLAGS.has(flagName)) {
        if (!entryFlags.includes(flagName)) {
          entryFlags.push(flagName);
        }
      }
    }
  }

  return {
    raw: trimmed,
    name,
    entryFlags,
    usage: '',
    isGuidanceOnly: false,
    constant: entryFlags.includes('constant')
  };
}

/**
 * Convert a legacy string format (e.g., "quest(entry:constant)") to the new object format
 */
export function convertLegacyEntityType(rawString) {
  const parsed = parseEntityTypeDefinition(rawString);
  if (!parsed.name) { return null; }

  return {
    name: parsed.name,
    constant: parsed.entryFlags.includes('constant'),
    usage: '',
    isGuidanceOnly: false
  };
}

/**
 * Normalize an entity type to the canonical string format (legacy compatibility)
 */
export function normalizeEntityTypeDefinition(rawValue) {
  const parsed = parseEntityTypeDefinition(rawValue);
  if (!parsed.name) { return ''; }
  const flags = [...parsed.entryFlags].sort().map((flag) => `entry:${flag}`);
  return flags.length ? `${parsed.name}(${flags.join(',')})` : parsed.name;
}

export function sanitizeEntityType(value) {
  return normalizeEntityTypeDefinition(value);
}

/**
 * Get configured entity type definitions from the new artifact system
 * Returns array of objects: { name, constant, usage, isGuidanceOnly }
 */
export function getConfiguredEntityTypeDefinitions(typesArray) {
  // If no array provided or empty, use defaults
  if (!Array.isArray(typesArray) || typesArray.length === 0) {
    return [...DEFAULT_ENTITY_TYPES];
  }

  // Check if array contains new format (objects) or legacy format (strings)
  const firstItem = typesArray[0];
  const isNewFormat = firstItem && typeof firstItem === 'object' && firstItem.name !== undefined;

  if (isNewFormat) {
    // Filter out blank entries and ensure recap is always present
    const filtered = typesArray.filter(t => t.name && t.name.trim());
    const hasRecap = filtered.some(t => t.name === 'recap' && t.isGuidanceOnly);
    if (!hasRecap) {
      // Add default recap entry at the beginning
      const recapEntry = DEFAULT_ENTITY_TYPES.find(t => t.isGuidanceOnly);
      if (recapEntry) {
        filtered.unshift({ ...recapEntry });
      }
    }
    return filtered;
  }

  // Legacy string format - convert to new format
  const defs = [];
  const seen = new Set();

  for (const raw of typesArray) {
    const normalized = normalizeEntityTypeDefinition(raw);
    if (!normalized) { continue; }
    if (seen.has(normalized)) { continue; }
    seen.add(normalized);

    const converted = convertLegacyEntityType(raw);
    if (converted) {
      defs.push(converted);
    }
  }

  // Ensure recap entry exists
  const hasRecap = defs.some(t => t.name === 'recap' && t.isGuidanceOnly);
  if (!hasRecap) {
    const recapEntry = DEFAULT_ENTITY_TYPES.find(t => t.isGuidanceOnly);
    if (recapEntry) {
      defs.unshift({ ...recapEntry });
    }
  }

  if (defs.length === 0) {
    return [...DEFAULT_ENTITY_TYPES];
  }

  return defs;
}

/**
 * Format entity type list for the simple {{lorebook_entry_types}} macro
 * Returns pipe-delimited string of type names, excluding guidance-only entries
 */
export function formatEntityTypeListForPrompt(defs) {
  return defs
    .filter(def => !def.isGuidanceOnly && def.name && def.name.trim())
    .map((def) => typeof def === 'object' ? def.name : parseEntityTypeDefinition(def).name)
    .filter(Boolean)
    .join('|');
}

/**
 * Format entity type list for the {{lorebook_entry_types_with_guidance}} macro
 * Returns newline-separated list of "name: usage" including guidance-only entries
 */
export function formatEntityTypeListWithGuidance(defs) {
  return defs
    .filter(def => def.name && def.name.trim())
    .map(def => {
      const name = typeof def === 'object' ? def.name : parseEntityTypeDefinition(def).name;
      const usage = typeof def === 'object' ? (def.usage || '') : '';
      return usage ? `${name}: ${usage}` : name;
    })
    .filter(Boolean)
    .join('\n');
}

export function createEntityTypeMap(defs) {
  const map = new Map();
  for (const def of defs) {
    const name = typeof def === 'object' ? def.name : parseEntityTypeDefinition(def).name;
    if (!name) { continue; }
    if (!map.has(name)) {
      map.set(name, def);
    }
  }
  return map;
}

export function applyEntityTypeFlagsToEntry(entry, def) {
  if (!def) { return; }

  // Handle both old format (entryFlags array) and new format (constant boolean)
  const isConstant = def.constant === true ||
    (Array.isArray(def.entryFlags) && def.entryFlags.includes('constant'));

  if (isConstant) {
    entry.constant = true;
    entry.disable = false;
    entry.useProbability = false;
    entry.probability = 100;
  }
}

export function sanitizeEntityTypeName(name) {
  return sanitizeBaseName(name);
}

/**
 * Get entity type definitions from extension settings
 * Supports both legacy format in autoLorebooks.entity_types and new artifact format
 */
export function getEntityTypeDefinitionsFromSettings(settings) {
  // First try to get from artifact system (new format)
  const artifacts = settings?.operation_artifacts?.entity_types;
  if (artifacts && artifacts.length > 0) {
    // Get the active artifact (for now, just use the first/default one)
    // This will be enhanced when we add preset resolution
    const activeArtifact = artifacts.find(a => a.isDefault) || artifacts[0];
    if (activeArtifact && activeArtifact.types) {
      return getConfiguredEntityTypeDefinitions(activeArtifact.types);
    }
  }

  // Fall back to legacy format
  const rawList = settings?.autoLorebooks?.entity_types;
  return getConfiguredEntityTypeDefinitions(rawList);
}

/**
 * Validate an entity type entry
 * Returns { valid: boolean, error?: string }
 */
export function validateEntityTypeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, error: 'Entry must be an object' };
  }

  if (entry.isGuidanceOnly) {
    // Recap entry only needs usage
    return { valid: true };
  }

  const name = sanitizeBaseName(entry.name || '');
  if (!name) {
    return { valid: false, error: 'Name is required' };
  }

  return { valid: true };
}

/**
 * Ensure the recap entry exists in a types array
 * Returns a new array with recap entry added if missing
 */
export function ensureRecapEntry(types) {
  const hasRecap = types.some(t => t.name === 'recap' && t.isGuidanceOnly);
  if (hasRecap) {
    return types;
  }

  const recapEntry = DEFAULT_ENTITY_TYPES.find(t => t.isGuidanceOnly);
  if (recapEntry) {
    return [{ ...recapEntry }, ...types];
  }

  return types;
}

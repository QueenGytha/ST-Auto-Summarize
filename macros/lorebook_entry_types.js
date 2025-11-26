export const name = 'lorebook_entry_types';

/**
 * Build the lorebook entry types macro value
 * Returns pipe-delimited string of type names, excluding guidance-only entries (like "recap")
 * @param {Array} typeDefinitions - Array of entity type definitions (new format with objects or legacy format)
 * @returns {string} Pipe-delimited type names like "character|location|item|faction|lore|quest|rule"
 */
export function build(typeDefinitions) {
  if (!Array.isArray(typeDefinitions)) {
    return '';
  }

  return typeDefinitions
    .filter(def => {
      // Exclude guidance-only entries (like "recap")
      if (def && typeof def === 'object' && def.isGuidanceOnly) {
        return false;
      }
      // Exclude blank entries
      const typeName = typeof def === 'object' ? def.name : def;
      return typeName && String(typeName).trim();
    })
    .map((def) => {
      // Handle both new object format and legacy string format
      if (typeof def === 'object') {
        return def.name;
      }
      return def;
    })
    .filter(Boolean)
    .join('|');
}

export const description = {
  format: 'Pipe-delimited string "character|location|item|faction|lore|quest|rule"',
  source: 'entityTypes.js getConfiguredEntityTypeDefinitions()',
  notes: 'Excludes guidance-only entries (like "recap") and blank entries',
  usedBy: ['scene-recap.js', 'lorebook-entry-lookup.js', 'lorebook-entry-deduplicate.js', 'lorebook-bulk-populate.js']
};

export const name = 'lorebook_entry_types_with_guidance';

/**
 * Build the lorebook entry types macro value with usage guidance
 * Returns newline-separated list of "name: usage" INCLUDING guidance-only entries (like "recap")
 * This tells the LLM what category each piece of information should go into
 *
 * @param {Array} typeDefinitions - Array of entity type definitions (new format with objects)
 * @returns {string} Newline-separated list like:
 *   recap: General plot progression, emotional beats, temporary states
 *   character: Named characters appearing in the story
 *   location: Places, settings, and notable locations
 */
export function build(typeDefinitions) {
  if (!Array.isArray(typeDefinitions)) {
    return '';
  }

  return typeDefinitions
    .filter(def => {
      // Exclude blank entries only
      const typeName = typeof def === 'object' ? def.name : def;
      return typeName && String(typeName).trim();
    })
    .map(def => {
      // Handle both new object format and legacy string format
      if (typeof def === 'object') {
        const usage = def.usage || '';
        return usage ? `${def.name}: ${usage}` : def.name;
      }
      // Legacy format - just the name
      return String(def);
    })
    .filter(Boolean)
    .join('\n');
}

export const description = {
  format: 'Newline-separated list "name: usage guidance"',
  source: 'entityTypes.js getConfiguredEntityTypeDefinitions()',
  notes: 'INCLUDES guidance-only entries (like "recap") to help LLM categorize information',
  example: `recap: General plot progression, emotional beats, temporary states
character: Named characters appearing in the story
location: Places, settings, and notable locations
item: Important objects and possessions
faction: Groups, organizations, and affiliations
lore: World history, mythology, and background lore
rule: Roleplay rules, constraints, and boundaries`,
  usedBy: ['scene-recap prompts that need categorization guidance']
};

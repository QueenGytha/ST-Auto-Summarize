export const name = 'lorebook_entry_types';

export function build(typeDefinitions) {
  return typeDefinitions.map((def) => def.name).filter(Boolean).join('|');
}

export const description = {
  format: 'String "character, location, item, faction, quest, rule, lore"',
  source: 'entityTypes.js formatEntityTypeListForPrompt()',
  usedBy: ['scene-recap.js', 'lorebook-entry-lookup.js', 'lorebook-entry-deduplicate.js', 'lorebook-bulk-populate.js']
};

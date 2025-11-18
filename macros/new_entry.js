export const name = 'new_entry';

export function build(payload) {
  return JSON.stringify(payload, null, 2);
}

export const description = {
  format: 'JSON object {name, type, keywords, secondaryKeys, content, comment}',
  source: 'recapToLorebookProcessor.js buildNewEntryPayload()',
  usedBy: ['lorebook-entry-lookup.js', 'lorebook-entry-deduplicate.js']
};

export const name = 'candidate_entries';

export function build(entries) {
  return JSON.stringify(entries, null, 2);
}

export const description = {
  format: 'JSON array of entry objects with full content field',
  source: 'recapToLorebookProcessor.js (fetches full entries from lorebook)',
  usedBy: ['lorebook-entry-deduplicate.js']
};

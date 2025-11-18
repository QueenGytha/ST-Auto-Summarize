export const name = 'new_entries';

export function build(entriesArray) {
  return JSON.stringify(entriesArray, null, 2);
}

export const description = {
  format: 'JSON array of entry objects',
  source: 'recapToLorebookProcessor.js (bulk population)',
  usedBy: ['lorebook-bulk-populate.js']
};

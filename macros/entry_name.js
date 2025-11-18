export const name = 'entry_name';

export function build(entryName) {
  return entryName || '';
}

export const description = {
  format: 'Plain text string',
  source: 'lorebookEntryMerger.js (from entry.comment or entry name)',
  usedBy: ['lorebook-recap-merge.js']
};

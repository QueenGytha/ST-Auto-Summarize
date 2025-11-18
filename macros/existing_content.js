export const name = 'existing_content';

export function build(content) {
  return content || '';
}

export const description = {
  format: 'Plain text content of lorebook entry',
  source: 'lorebookEntryMerger.js (from existing lorebook entry)',
  usedBy: ['lorebook-recap-merge.js']
};

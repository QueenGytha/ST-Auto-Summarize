export const name = 'new_content';

export function build(content) {
  return content || '';
}

export const description = {
  format: 'Plain text content to merge',
  source: 'lorebookEntryMerger.js (from scene recap)',
  usedBy: ['lorebook-recap-merge.js']
};

export const name = 'lorebook_entry_lookup_synopsis';

export function build(synopsis) {
  return synopsis || '';
}

export const description = {
  format: 'Plain text, one-line string (≤15 words)',
  source: 'recapToLorebookProcessor.js (from Stage 1 LLM response)',
  usedBy: ['lorebook-entry-deduplicate.js']
};

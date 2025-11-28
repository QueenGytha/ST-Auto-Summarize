export const name = 'extracted_sl';

export function build(entries) {
  if (!entries || entries.length === 0) {
    return '[]';
  }
  return JSON.stringify(entries, null, 2);
}

export const description = {
  format: 'JSON array of entity entries [{t, n, c, k}, ...]',
  source: 'Combined entities from Stage 2 (.entities) and Stage 3 (.entities for events)',
  usedBy: ['scene-recap-stage4-filter-sl.js']
};

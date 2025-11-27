export const name = 'extracted_sl';

export function build(entries) {
  if (!entries || entries.length === 0) {
    return '[]';
  }
  return JSON.stringify(entries, null, 2);
}

export const description = {
  format: 'JSON array of setting_lore entries [{t, n, c, k}, ...]',
  source: 'Stage 2 output .sl field',
  usedBy: ['scene-recap-stage4-filter-sl.js']
};

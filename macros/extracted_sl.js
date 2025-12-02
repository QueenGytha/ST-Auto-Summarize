export const name = 'extracted_sl';

export function build(entries) {
  if (!entries || entries.length === 0) {
    return '[]';
  }
  return JSON.stringify(entries, null, 2);
}

export const description = {
  format: 'JSON array of entity entries [{type, name, keywords, content: [...]}, ...]',
  source: 'Stage 2 output .entities field',
  usedBy: ['scene-recap-stage4-filter-sl.js']
};

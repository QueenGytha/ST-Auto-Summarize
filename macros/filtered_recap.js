export const name = 'filtered_recap';

export function build(filtered) {
  if (!filtered) {
    return '{}';
  }
  // Stage 3 outputs: {developments: [...], open: [...], state: [...], resolved: [...]}
  return JSON.stringify(filtered, null, 2);
}

export const description = {
  format: 'JSON object with developments, open, state, resolved arrays',
  source: 'Stage 3 output',
  usedBy: ['running-scene-recap.js']
};

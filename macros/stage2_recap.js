export const name = 'stage2_recap';

export function build(recap) {
  if (!recap) {
    return '{}';
  }
  // Stage 2 outputs: {outcomes: "...", threads: "...", state: "..."}
  return JSON.stringify(recap, null, 2);
}

export const description = {
  format: 'JSON object with outcomes, threads, state fields',
  source: 'Stage 2 output .recap field',
  usedBy: ['scene-recap-stage3-filtering.js']
};

export const name = 'extracted_rc';

export function build(content) {
  return content || '';
}

export const description = {
  format: 'String with DEV/PEND/KNOWS sections or empty string',
  source: 'Stage 2 output .rc field',
  usedBy: ['scene-recap-stage3-filtering.js']
};

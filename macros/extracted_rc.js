export const name = 'extracted_rc';

export function build(content) {
  return content || '';
}

export const description = {
  format: 'String with DEV/PEND sections or empty string',
  source: 'Stage 2 output .plot field (legacy support)',
  usedBy: ['running-scene-recap.js (legacy)']
};

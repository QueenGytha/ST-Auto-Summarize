export const name = 'minimum_scene_length';

export function build(value) {
  return String(value);
}

export const description = {
  format: 'String representation of integer',
  source: 'autoSceneBreakDetection.js (from settings)',
  usedBy: ['auto-scene-break-detection.js']
};

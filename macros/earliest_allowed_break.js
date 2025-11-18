export const name = 'earliest_allowed_break';

export function build(value) {
  return String(value);
}

export const description = {
  format: 'String representation of integer message index',
  source: 'autoSceneBreakDetection.js (calculated from minimumSceneLength)',
  usedBy: ['auto-scene-break-detection.js', 'auto-scene-break-forced.js']
};

import { extractRecapString } from '../recapNormalization.js';

export const name = 'scene_recaps';

export function build(sceneDataArray) {
  return sceneDataArray.map((scene, i) => {
    const sceneName = scene.name || `Scene ${i + 1}`;
    // Use centralized extraction that handles all formats
    const recapText = extractRecapString(scene.recap);
    return `[Scene ${i + 1}: ${sceneName}]\n${recapText}`;
  }).join('\n\n');
}

export const description = {
  format: 'Multi-line string "[Scene N: name]\\nrecap text" blocks joined by \\n\\n',
  source: 'Takes array of {name, recap} objects',
  usedBy: ['running-scene-recap.js']
};

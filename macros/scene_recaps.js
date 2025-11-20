import { extractRecapText as extractRecapTextUtil } from '../recapFormatter.js';

export const name = 'scene_recaps';

export function build(sceneDataArray) {
  return sceneDataArray.map((scene, i) => {
    const sceneName = scene.name || `Scene ${i + 1}`;
    const recapText = extractRecapText(scene.recap);
    return `[Scene ${i + 1}: ${sceneName}]\n${recapText}`;
  }).join('\n\n');
}

function extractRecapText(scene_recap_memory) {
  const json_to_parse = String(scene_recap_memory || '').trim();
  if (!json_to_parse) {
    return "";
  }

  // Use the centralized parser that handles both JSON and formatted text
  return extractRecapTextUtil(json_to_parse);
}

export const description = {
  format: 'Multi-line string "[Scene N: name]\\nrecap text" blocks joined by \\n\\n',
  source: 'Takes array of {name, recap} objects',
  usedBy: ['running-scene-recap.js']
};

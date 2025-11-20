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

  let extracted_text = json_to_parse;

  try {
    const parsed = JSON.parse(json_to_parse);
    if (parsed && typeof parsed === 'object') {
      extracted_text = parsed.recap || "";
    }
  } catch {
    // Not JSON or parsing failed - use the whole text as-is
  }
  return extracted_text;
}

export const description = {
  format: 'Multi-line string "[Scene N: name]\\nrecap text" blocks joined by \\n\\n',
  source: 'Takes array of {name, recap} objects',
  usedBy: ['running-scene-recap.js']
};

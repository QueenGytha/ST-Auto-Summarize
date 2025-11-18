export const name = 'message';

export function build(sceneObjects) {
  return JSON.stringify(sceneObjects, null, 2);
}

export const description = {
  format: 'JSON array of message objects with {type, index, name, text, is_user, recap}',
  source: 'sceneBreak.js prepareScenePrompt()',
  usedBy: ['scene-recap.js (backward compatibility)']
};

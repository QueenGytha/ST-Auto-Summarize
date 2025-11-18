export const name = 'scene_messages';

export function build(sceneObjects) {
  const messageTexts = [];

  for (const obj of sceneObjects) {
    let formatted = '';
    if (obj.type === 'message') {
      const role = obj.is_user ? 'USER' : 'CHARACTER';
      formatted = `[${role}: ${obj.name}]\n${obj.text}`;
    } else if (obj.type === 'recap') {
      formatted = `[RECAP]\n${obj.recap}`;
    }

    if (formatted) {
      messageTexts.push(formatted);
    }
  }

  return messageTexts.join('\n\n');
}

export const description = {
  format: 'Multi-line string with "[USER: name]\\ntext" or "[RECAP]\\ntext" blocks joined by \\n\\n',
  source: 'Takes array of scene objects with {type, is_user, name, text, recap}',
  usedBy: ['scene-recap.js']
};

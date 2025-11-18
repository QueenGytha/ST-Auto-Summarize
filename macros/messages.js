export const name = 'messages';

export function build(formattedMessages) {
  return formattedMessages;
}

export const description = {
  format: 'Multi-line string with numbered messages: "1. [USER: name]\\ntext\\n\\n2. [CHARACTER: name]\\ntext"',
  source: 'autoSceneBreakDetection.js buildPromptFromTemplate()',
  usedBy: ['auto-scene-break-detection.js', 'auto-scene-break-forced.js']
};

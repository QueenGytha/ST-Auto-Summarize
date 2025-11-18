export const name = 'current_running_recap';

export function build(content) {
  return content || "";
}

export const description = {
  format: 'Markdown text with ## headers (Current Situation, Key Developments, etc.) or empty string',
  source: 'runningSceneRecap.js get_current_running_recap_content()',
  usedBy: ['running-scene-recap.js (conditionally included via {{#if}})']
};

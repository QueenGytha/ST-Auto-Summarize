export const name = 'active_setting_lore';

export function build(entries) {
  if (!entries || entries.length === 0) {
    return '';
  }

  const instructions = `INSTRUCTIONS: The following <setting_lore> entries contain context that is active for this scene. Only include information from these entries that is new or has changed in the scene. If the scene rehashes something already captured in these entries, omit it to avoid duplication.\n\n`;
  const formattedEntries = entries.map(e => {
    const entryName = e.comment || 'Unnamed Entry';
    const uid = e.uid || '';
    const world = e.world || '';
    const position = e.position !== undefined ? e.position : '';
    const order = e.order !== undefined ? e.order : '';
    const keys = (e.key || []).join('|');

    const unwrappedContent = (e.content || '')
      .trim()
      .replace(/^<setting_lore[^>]*>\s*/i, '')
      .replace(/\s*<\/setting_lore>$/i, '')
      .trim();

    return `<setting_lore name="${entryName}" uid="${uid}" world="${world}" position="${position}" order="${order}" keys="${keys}">\n${unwrappedContent}\n</setting_lore>`;
  }).join('\n\n');

  return instructions + formattedEntries;
}

export const description = {
  format: 'XML-style tags: <setting_lore name="X" uid="Y" keys="Z">\\ncontent\\n</setting_lore> joined by \\n\\n',
  source: 'Takes array of lorebook entry objects',
  usedBy: ['scene-recap.js']
};

export default ({ test, expect }) => {
  const v = (p) => new URL('../../tests/virtual/' + p, import.meta.url).href;

  test('DEFAULT_ENTITY_TYPES matches expected order', async () => {
    const { DEFAULT_ENTITY_TYPES } = await import(v('entityTypes.js'));
    expect(DEFAULT_ENTITY_TYPES).toEqual([
      'character',
      'location',
      'item',
      'faction',
      'quest(entry:constant)',
      'rule(entry:constant)'
    ]);
  });

  test('normalizeEntityTypeDefinition parses base name and flags', async () => {
    const { normalizeEntityTypeDefinition, parseEntityTypeDefinition } = await import(v('entityTypes.js'));
    const normalized = normalizeEntityTypeDefinition(' Quest ( entry:constant , entry:constant ) ');
    expect(normalized).toBe('quest(entry:constant)');
    const def = parseEntityTypeDefinition(normalized);
    expect(def.name).toBe('quest');
    expect(def.entryFlags).toEqual(['constant']);
  });

  test('normalizeEntityTypeDefinition strips invalid characters', async () => {
    const { normalizeEntityTypeDefinition } = await import(v('entityTypes.js'));
    expect(normalizeEntityTypeDefinition('Magic Item')).toBe('magic_item');
    expect(normalizeEntityTypeDefinition('We!rd-Type')).toBe('werd-type');
  });
};

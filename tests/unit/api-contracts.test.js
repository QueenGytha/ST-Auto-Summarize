export default ({ test, expect }) => {
  test('api-contracts: world-info stubs exist and behave', async () => {
    const ext = await import('../../tests/virtual/stubs/externals.js');
    expect(typeof ext.loadWorldInfo).toBe('function');
    expect(typeof ext.saveWorldInfo).toBe('function');
    expect(typeof ext.createNewWorldInfo).toBe('function');
    expect(Array.isArray(ext.world_names)).toBe(true);

    // Create, save, load
    await ext.createNewWorldInfo('lb1');
    const w = await ext.loadWorldInfo('lb1');
    expect(!!w).toBe(true);
    w.entries = w.entries || {};
    await ext.saveWorldInfo('lb1', w);
  });

  test('api-contracts: extension_settings structure available', async () => {
    const ext = await import('../../tests/virtual/stubs/externals.js');
    expect(!!ext.extension_settings.autoLorebooks).toBe(true);
  });
};


export default ({ test, expect }) => {
  const v = (p) => new URL('../../tests/virtual/' + p, import.meta.url).href;

  async function resetWorld() {
    const ext = await import(v('stubs/externals.js'));
    // delete all existing worlds to isolate tests
    const names = [...ext.world_names];
    for (const n of names) {
      // eslint-disable-next-line no-await-in-loop
      await ext.deleteWorldInfo(n);
    }
    // also clear chat metadata attachment
    delete ext.chat_metadata[ext.METADATA_KEY];
  }

  test('Lorebook: reorderLorebookEntriesAlphabetically sorts entries alphabetically', async () => {
    await resetWorld();
    const ext = await import(v('stubs/externals.js'));
    const lbm = await import(v('lorebookManager.js'));
    const utils = await import(v('utils.js'));

    // Wire modules
    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast() {},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });

    // Enable auto-reorder setting
    ext.extension_settings.autoLorebooks.autoReorderAlphabetically = true;

    // Create a test lorebook
    const lorebookName = 'test-lorebook';
    await ext.createNewWorldInfo(lorebookName);

    // Add entries in non-alphabetical order
    await lbm.addLorebookEntry(lorebookName, { comment: 'Zebra', content: 'A striped animal' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Apple', content: 'A fruit' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Mountain', content: 'A landform' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Book', content: 'Reading material' });

    // Load lorebook and check order values
    const wi = await ext.loadWorldInfo(lorebookName);
    const entries = Object.values(wi.entries).filter(e => !e.comment.startsWith('_registry_'));

    // Sort by order descending (how ST displays them)
    entries.sort((a, b) => b.order - a.order);

    // Check that entries are alphabetically sorted by comment
    expect(entries[0].comment).toBe('Apple');
    expect(entries[1].comment).toBe('Book');
    expect(entries[2].comment).toBe('Mountain');
    expect(entries[3].comment).toBe('Zebra');

    // Check that order values are descending from 1000
    expect(entries[0].order).toBe(1000); // Apple
    expect(entries[1].order).toBe(999);  // Book
    expect(entries[2].order).toBe(998);  // Mountain
    expect(entries[3].order).toBe(997);  // Zebra
  });

  test('Lorebook: reordering handles case-insensitive sorting', async () => {
    await resetWorld();
    const ext = await import(v('stubs/externals.js'));
    const lbm = await import(v('lorebookManager.js'));
    const utils = await import(v('utils.js'));

    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast() {},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });

    ext.extension_settings.autoLorebooks.autoReorderAlphabetically = true;

    const lorebookName = 'test-case-sensitive';
    await ext.createNewWorldInfo(lorebookName);

    await lbm.addLorebookEntry(lorebookName, { comment: 'zebra', content: 'lowercase' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Apple', content: 'capitalized' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'MOUNTAIN', content: 'uppercase' });

    const wi = await ext.loadWorldInfo(lorebookName);
    const entries = Object.values(wi.entries).filter(e => !e.comment.startsWith('_registry_'));
    entries.sort((a, b) => b.order - a.order);

    // Should be sorted case-insensitively
    expect(entries[0].comment).toBe('Apple');
    expect(entries[1].comment).toBe('MOUNTAIN');
    expect(entries[2].comment).toBe('zebra');
  });

  test('Lorebook: reordering when setting is disabled does not reorder', async () => {
    await resetWorld();
    const ext = await import(v('stubs/externals.js'));
    const lbm = await import(v('lorebookManager.js'));
    const utils = await import(v('utils.js'));

    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast() {},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });

    // Disable auto-reorder setting
    ext.extension_settings.autoLorebooks.autoReorderAlphabetically = false;

    const lorebookName = 'test-disabled';
    await ext.createNewWorldInfo(lorebookName);

    // Add entries - they should NOT be reordered
    await lbm.addLorebookEntry(lorebookName, { comment: 'Zebra', content: 'Last' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Apple', content: 'First' });

    const wi = await ext.loadWorldInfo(lorebookName);
    const entries = Object.values(wi.entries).filter(e => !e.comment.startsWith('_registry_'));

    // Order values should be default (100) since no reordering occurred
    entries.forEach(entry => {
      expect(entry.order).toBe(100);
    });
  });

  test('Lorebook: modifying entry comment triggers reorder', async () => {
    await resetWorld();
    const ext = await import(v('stubs/externals.js'));
    const lbm = await import(v('lorebookManager.js'));
    const utils = await import(v('utils.js'));

    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast() {},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });

    ext.extension_settings.autoLorebooks.autoReorderAlphabetically = true;

    const lorebookName = 'test-rename';
    await ext.createNewWorldInfo(lorebookName);

    await lbm.addLorebookEntry(lorebookName, { comment: 'Charlie', content: 'C' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Bob', content: 'B' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Alice', content: 'A' });

    // Get the UID of 'Charlie'
    let wi = await ext.loadWorldInfo(lorebookName);
    const charlieEntry = Object.values(wi.entries).find(e => e.comment === 'Charlie');
    expect(charlieEntry).toBeDefined();

    // Rename 'Charlie' to 'David'
    await lbm.modifyLorebookEntry(lorebookName, charlieEntry.uid, { comment: 'David' });

    // Verify reordering occurred
    wi = await ext.loadWorldInfo(lorebookName);
    const entries = Object.values(wi.entries).filter(e => !e.comment.startsWith('_registry_'));
    entries.sort((a, b) => b.order - a.order);

    expect(entries[0].comment).toBe('Alice');
    expect(entries[1].comment).toBe('Bob');
    expect(entries[2].comment).toBe('David');
  });

  test('Lorebook: reordering includes all entry types (including registries)', async () => {
    await resetWorld();
    const ext = await import(v('stubs/externals.js'));
    const lbm = await import(v('lorebookManager.js'));
    const utils = await import(v('utils.js'));

    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast() {},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });

    ext.extension_settings.autoLorebooks.autoReorderAlphabetically = true;

    const lorebookName = 'test-all-types';
    await ext.createNewWorldInfo(lorebookName);

    // Initialize will create registry entries
    await lbm.initializeChatLorebook();

    // Add regular entries
    await lbm.addLorebookEntry(lorebookName, { comment: 'Zebra', content: 'Z' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Apple', content: 'A' });

    const wi = await ext.loadWorldInfo(lorebookName);
    const allEntries = Object.values(wi.entries);

    // All entries should have order values assigned (not default 100)
    // Registry entries start with _registry_
    const registryEntries = allEntries.filter(e => e.comment.startsWith('_registry_'));
    const regularEntries = allEntries.filter(e => !e.comment.startsWith('_registry_'));

    // Both types should have varying order values from alphabetical sorting
    const allOrders = allEntries.map(e => e.order);
    const uniqueOrders = new Set(allOrders);

    // Should have multiple different order values if reordering worked
    expect(uniqueOrders.size > 1).toBe(true);

    // Verify alphabetical order across ALL entries
    const sortedEntries = [...allEntries].sort((a, b) => b.order - a.order);
    for (let i = 1; i < sortedEntries.length; i++) {
      const prev = sortedEntries[i - 1].comment.toLowerCase();
      const curr = sortedEntries[i].comment.toLowerCase();
      const comparison = prev.localeCompare(curr);
      expect(comparison <= 0).toBe(true);
    }
  });
};

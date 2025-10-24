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

  test('Auto-lorebook: creates and attaches when initialized for chat', async () => {
    await resetWorld();
    const ext = await import(v('stubs/externals.js'));
    const lbm = await import(v('lorebookManager.js'));
    const tracking = await import(v('trackingEntries.js'));
    const entityTypes = await import(v('entityTypes.js'));
    const utils = await import(v('utils.js'));

    // Wire modules (minimal utils)
    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast() {},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });
    tracking.initTrackingEntries({ log(){}, debug(){}, error(){}, toast(){} }, lbm, null, null);

    // Sanity
    expect(ext.chat_metadata[ext.METADATA_KEY]).toBe(undefined);

    // Initialize for current chat
    await lbm.initializeChatLorebook();
    await tracking.initializeChatTrackingEntries();


    // Should have created and attached a lorebook
    const attached = ext.chat_metadata[ext.METADATA_KEY];
    expect(typeof attached).toBe('string');
    expect(ext.world_names.includes(attached)).toBe(true);

    // Load lorebook and verify tracking entries exist
    const wi = await ext.loadWorldInfo(attached);
    const entries = wi?.entries ? Object.values(wi.entries) : [];
    const hasGM = entries.some(e => e.comment === '__gm_notes');
    const hasStats = entries.some(e => e.comment === '__character_stats');
    expect(hasGM).toBe(true);
    expect(hasStats).toBe(true);

    const defs = entityTypes.getConfiguredEntityTypeDefinitions(ext.extension_settings?.autoLorebooks?.entity_types);
    const expectedRegistries = defs.map(def => `_registry_${def.name}`);
    expectedRegistries.forEach(name => {
      const found = entries.find(e => e.comment === name);
      expect(found).toBeDefined();
      expect(found?.disable).toBe(true);
      expect(found?.preventRecursion).toBe(true);
      expect(Array.isArray(found?.tags) && found.tags.includes('auto_lorebooks_registry')).toBe(true);
    });
  }, 8000);

  test('Auto-lorebook: deletes matching lorebook on chat_deleted (character chat)', async () => {
    await resetWorld();
    const { on_chat_event } = await import(v('eventHandlers.js'));
    const ext = await import(v('stubs/externals.js'));
    const utils = await import(v('utils.js'));

    // Prepare a lorebook that matches the reconstructed name
    const template = ext.extension_settings?.autoLorebooks?.nameTemplate || 'z-AutoLB - {{char}} - {{chat}}';
    const deletedChatName = 'Alice - 2025-01-02@12h00m';
    const lorebookName = utils.generateLorebookName(template, 'Alice', deletedChatName);
    await ext.createNewWorldInfo(lorebookName);
    expect(ext.world_names.includes(lorebookName)).toBe(true);

    // Emit deletion event
    await on_chat_event('chat_deleted', deletedChatName);

    // Lorebook should be gone
    expect(ext.world_names.includes(lorebookName)).toBe(false);
  }, 8000);

  test('Auto-lorebook: deletes matching lorebook on chat_deleted (group chat)', async () => {
    await resetWorld();
    const { on_chat_event } = await import(v('eventHandlers.js'));
    const ext = await import(v('stubs/externals.js'));
    const utils = await import(v('utils.js'));

    // Simulate a group owning a chat id
    const groupName = 'The Party';
    const groupChatId = 'group-chat-1';
    // mutate the exported array in place (ESM exports are read-only bindings)
    ext.groups.length = 0;
    ext.groups.push({ id: 'g1', name: groupName, chats: [groupChatId] });

    // Create a lorebook with the expected name pattern
    const template = ext.extension_settings?.autoLorebooks?.nameTemplate || 'z-AutoLB - {{char}} - {{chat}}';
    const lorebookName = utils.generateLorebookName(template, groupName, groupChatId);
    await ext.createNewWorldInfo(lorebookName);
    expect(ext.world_names.includes(lorebookName)).toBe(true);

    // Emit deletion event for the group chat id
    await on_chat_event('chat_deleted', groupChatId);

    // Lorebook should be deleted
    expect(ext.world_names.includes(lorebookName)).toBe(false);
  }, 8000);
};

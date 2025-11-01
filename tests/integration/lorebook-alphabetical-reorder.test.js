export default ({ test, expect }) => {
  const v = (p) => new URL('../../tests/virtual/' + p, import.meta.url).href;

  async function resetWorld(ext) {
    const names = [...ext.world_names];
    for (const n of names) {
      // eslint-disable-next-line no-await-in-loop
      await ext.deleteWorldInfo(n);
    }
    delete ext.chat_metadata[ext.METADATA_KEY];
    ext.chat_metadata.auto_lorebooks = {};
    ext.chat_metadata.auto_lorebooks_processed_summaries = [];
    ext.extension_settings.autoLorebooks = {
      enabledByDefault: true,
      autoReorderAlphabetically: true,
      summary_processing: {},
      nameTemplate: 'z-AutoLB - {{char}} - {{chat}}',
      deleteOnChatDelete: true,
      debug_mode: true,
    };
    ext.setGenerateRawImplementation(null);
  }

  async function setupProcessor(options = {}) {
    const ext = await import(v('stubs/externals.js'));
    const utils = await import(v('utils.js'));
    const lbm = await import(v('lorebookManager.js'));
    const proc = await import(v('summaryToLorebookProcessor.js'));
    const defaults = (await import(v('defaultSettings.js'))).default_settings;

    await resetWorld(ext);

    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast(){},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });

    if (!ext.extension_settings.autoLorebooks) ext.extension_settings.autoLorebooks = {};
    if (!ext.extension_settings.autoLorebooks.summary_processing) ext.extension_settings.autoLorebooks.summary_processing = {};
    Object.assign(ext.extension_settings.autoLorebooks.summary_processing, {
      merge_prompt: defaults.auto_lorebooks_summary_merge_prompt,
      merge_prefill: defaults.auto_lorebooks_summary_merge_prefill,
      merge_connection_profile: defaults.auto_lorebooks_summary_merge_connection_profile,
      merge_completion_preset: defaults.auto_lorebooks_summary_merge_completion_preset,
      lorebook_entry_lookup_prompt: defaults.auto_lorebooks_summary_lorebook_entry_lookup_prompt,
      lorebook_entry_lookup_prefill: defaults.auto_lorebooks_summary_lorebook_entry_lookup_prefill,
      lorebook_entry_lookup_connection_profile: defaults.auto_lorebooks_summary_lorebook_entry_lookup_connection_profile,
      lorebook_entry_lookup_completion_preset: defaults.auto_lorebooks_summary_lorebook_entry_lookup_completion_preset,
      lorebook_entry_deduplicate_prompt: defaults.auto_lorebooks_summary_lorebook_entry_deduplicate_prompt,
      lorebook_entry_deduplicate_prefill: defaults.auto_lorebooks_summary_lorebook_entry_deduplicate_prefill,
      lorebook_entry_deduplicate_connection_profile: defaults.auto_lorebooks_summary_lorebook_entry_deduplicate_connection_profile,
      lorebook_entry_deduplicate_completion_preset: defaults.auto_lorebooks_summary_lorebook_entry_deduplicate_completion_preset,
      use_queue: false,
      skip_duplicates: false,
    });

    const entryMerger = {
      mergeLorebookEntry: options.mergeImpl || (async () => ({ success: true })),
    };

    proc.initSummaryToLorebookProcessor(
      { log(){}, debug(){}, error(){}, toast(){}, get_settings(){ return ext.extension_settings.autoLorebooks.summary_processing; } },
      lbm,
      entryMerger,
      { withConnectionSettings: async (prof, preset, fn) => await fn() }  // Stub: just run the function
    );

    return { ext, proc, lbm, entryMerger };
  }

  test('Integration: entries created via processor are alphabetically ordered', async () => {
    const { ext, proc, lbm } = await setupProcessor();

    // Create lorebook
    const lorebookName = await lbm.createChatLorebook();
    expect(lorebookName).toBeDefined();
    lbm.attachLorebook(lorebookName);

    // Process multiple entries in non-alphabetical order
    const entries = [
      { name: 'Zebra', type: 'character', content: 'A striped animal', keywords: ['zebra', 'animal'] },
      { name: 'Apple', type: 'item', content: 'A red fruit', keywords: ['apple', 'fruit'] },
      { name: 'Mountain', type: 'location', content: 'A tall landform', keywords: ['mountain', 'peak'] },
      { name: 'Book', type: 'item', content: 'Reading material', keywords: ['book', 'read'] },
    ];

    for (const entry of entries) {
      // eslint-disable-next-line no-await-in-loop
      await proc.processSingleLorebookEntry(entry, { useQueue: false });
    }

    // Verify alphabetical ordering
    const wi = await ext.loadWorldInfo(lorebookName);
    const allEntries = Object.values(wi.entries);

    // Filter out registry entries for clarity
    const contentEntries = allEntries.filter(e => !e.comment.startsWith('_registry_'));

    // Sort by order descending (ST display order)
    contentEntries.sort((a, b) => b.order - a.order);

    // Check alphabetical order (with type prefixes)
    // Alphabetically: character-Zebra, item-Apple, item-Book, location-Mountain
    expect(contentEntries[0].comment).toBe('character-Zebra');
    expect(contentEntries[1].comment).toBe('item-Apple');
    expect(contentEntries[2].comment).toBe('item-Book');
    expect(contentEntries[3].comment).toBe('location-Mountain');

    // Check descending order values
    expect(contentEntries[0].order > contentEntries[1].order).toBe(true);
    expect(contentEntries[1].order > contentEntries[2].order).toBe(true);
    expect(contentEntries[2].order > contentEntries[3].order).toBe(true);
  }, 8000);

  test('Integration: renaming entry via modifyLorebookEntry triggers reorder', async () => {
    const ext = await import(v('stubs/externals.js'));
    const utils = await import(v('utils.js'));
    const lbm = await import(v('lorebookManager.js'));

    await resetWorld(ext);

    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast(){},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });

    const lorebookName = await lbm.createChatLorebook();
    lbm.attachLorebook(lorebookName);

    // Create initial entries
    await lbm.addLorebookEntry(lorebookName, { comment: 'Charlie', content: 'C' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Alice', content: 'A' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Bob', content: 'B' });

    // Get Charlie's UID
    let wi = await ext.loadWorldInfo(lorebookName);
    const charlieEntry = Object.values(wi.entries).find(e => e.comment === 'Charlie');
    expect(charlieEntry).toBeDefined();

    // Rename Charlie to David
    await lbm.modifyLorebookEntry(lorebookName, charlieEntry.uid, { comment: 'David' });

    // Verify new alphabetical order
    wi = await ext.loadWorldInfo(lorebookName);
    const entries = Object.values(wi.entries).filter(e => !e.comment.startsWith('_registry_'));
    entries.sort((a, b) => b.order - a.order);

    expect(entries.map(e => e.comment)).toEqual(['Alice', 'Bob', 'David']);
  }, 8000);

  /*
   * Note: Queue-based test removed due to complex initialization requirements
   * The reordering functionality in queue operations is tested via:
   * - Unit tests for reorderLorebookEntriesAlphabetically()
   * - Integration test for processSingleLorebookEntry() above
   * - operationHandlers.js includes reorder call after UPDATE_LOREBOOK_REGISTRY
   */

  test('Integration: reorder respects setting toggle', async () => {
    const ext = await import(v('stubs/externals.js'));
    const utils = await import(v('utils.js'));
    const lbm = await import(v('lorebookManager.js'));

    await resetWorld(ext);

    // Disable auto-reorder
    ext.extension_settings.autoLorebooks.autoReorderAlphabetically = false;

    lbm.initLorebookManager({
      log(){}, debug(){}, error(){}, toast(){},
      generateLorebookName: utils.generateLorebookName,
      getUniqueLorebookName: utils.getUniqueLorebookName,
    });

    const lorebookName = await lbm.createChatLorebook();
    lbm.attachLorebook(lorebookName);

    // Add entries
    await lbm.addLorebookEntry(lorebookName, { comment: 'Zebra', content: 'Z' });
    await lbm.addLorebookEntry(lorebookName, { comment: 'Apple', content: 'A' });

    // Verify no reordering occurred (should have default order values)
    const wi = await ext.loadWorldInfo(lorebookName);
    const entries = Object.values(wi.entries).filter(e => !e.comment.startsWith('_registry_'));

    // Without reordering, entries should have default order (100)
    entries.forEach(entry => {
      expect(entry.order).toBe(100);
    });
  }, 8000);
};

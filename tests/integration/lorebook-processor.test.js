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
    ext.extension_settings.autoLorebooks = { enabledByDefault: true, summary_processing: {}, nameTemplate: 'z-AutoLB - {{char}} - {{chat}}', deleteOnChatDelete: true, debug_mode: true };
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

  test('processor: useQueue enqueues merge op', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');
    const proc = await import('../../tests/virtual/summaryToLorebookProcessor.js');
    await oq.pauseQueue();
    await oq.clearAllOperations();
    // initialize processor; inject simple merger
    proc.initSummaryToLorebookProcessor(
      { log(){}, debug(){}, error(){}, toast(){}, get_settings(){ return true; } },
      { getAttachedLorebook: () => 'lb', getLorebookEntries: async () => [], addLorebookEntry: async () => ({ uid: 1 }) },
      { mergeLorebookEntry: async () => ({ success: true }) },
      { withConnectionSettings: async (prof, preset, fn) => await fn() }  // Stub
    );

    // Register merge handler to avoid retries
    oq.registerOperationHandler(oq.OperationType.MERGE_LOREBOOK_ENTRY, async () => ({ success: true }));

    const entry = { name: 'Test', content: 'abc', keywords: ['a'] };
    const res = await proc.processSingleLorebookEntry(entry, { useQueue: true });
    await oq.resumeQueue();

    // Queue should have received an operation and then processed it
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const stats = oq.getQueueStats();
      if (stats.pending === 0 && stats.in_progress === 0) break;
      await new Promise(r => setTimeout(r, 25));
    }

    const stats = oq.getQueueStats();
    expect(stats.pending).toBe(0);
  }, 8000);

  test('processor: direct merge path calls merger', async () => {
    const ext = await import('../../tests/virtual/stubs/externals.js');
    const proc = await import('../../tests/virtual/summaryToLorebookProcessor.js');
    let called = false;

    // Configure prompts so triage/resolution stages execute
    if (!ext.extension_settings.autoLorebooks) ext.extension_settings.autoLorebooks = {};
    if (!ext.extension_settings.autoLorebooks.summary_processing) ext.extension_settings.autoLorebooks.summary_processing = {};
    Object.assign(ext.extension_settings.autoLorebooks.summary_processing, {
      lorebook_entry_lookup_prompt: '{{new_entry}}',
      lorebook_entry_lookup_prefill: '',
      lorebook_entry_lookup_connection_profile: '',
      lorebook_entry_lookup_completion_preset: '',
      lorebook_entry_deduplicate_prompt: '{{candidate_entries}}',
      lorebook_entry_deduplicate_prefill: '',
      lorebook_entry_deduplicate_connection_profile: '',
      lorebook_entry_deduplicate_completion_preset: ''
    });

    // Seed registry state with existing entity id
    ext.chat_metadata.auto_lorebooks = ext.chat_metadata.auto_lorebooks || {};
    ext.chat_metadata.auto_lorebooks.registry = {
      index: {
        char_0001: {
          uid: 7,
          type: 'character',
          name: 'Test',
          comment: 'character-Test',
          synopsis: 'old',
          aliases: []
        }
      },
      counters: { character: 1 }
    };

    const responses = [
      JSON.stringify({ type: 'character', synopsis: 'existing', sameEntityIds: ['char_0001'], needsFullContextIds: [] }),
      JSON.stringify({ resolvedId: 'char_0001', synopsis: 'updated' })
    ];
    let callIndex = 0;
    ext.setGenerateRawImplementation(async () => responses[callIndex++] || JSON.stringify({ resolvedId: 'new', synopsis: '' }));

    proc.initSummaryToLorebookProcessor(
      { log(){}, debug(){}, error(){}, toast(){}, get_settings(){ return true; } },
      {
        getAttachedLorebook: () => 'lb',
        getLorebookEntries: async () => ([{ uid: 7, comment: 'character-Test', key: [], keysecondary: [], content: 'prev' }]),
        addLorebookEntry: async () => ({ uid: 1 })
      },
      { mergeLorebookEntry: async () => { called = true; return ({ success: true }); } },
      { withConnectionSettings: async (prof, preset, fn) => await fn() }  // Stub
    );
    const entry = { name: 'Test', content: 'abc', keywords: ['a'] };
    await proc.processSingleLorebookEntry(entry, { useQueue: false });
    expect(called).toBe(true);
    ext.setGenerateRawImplementation(null);
  });

  test('processSingleLorebookEntry merges existing entity via staged pipeline', async () => {
    const merges = { count: 0 };
    const { ext, proc } = await setupProcessor({ mergeImpl: async () => { merges.count += 1; return { success: true }; } });

    const lorebookName = 'lb';
    await ext.createNewWorldInfo(lorebookName);
    ext.chat_metadata[ext.METADATA_KEY] = lorebookName;

    const data = await ext.loadWorldInfo(lorebookName);
    const existing = ext.createWorldInfoEntry(lorebookName, data);
    existing.comment = 'Test';
    existing.content = 'Original content';
    existing.key = ['test'];
    await ext.saveWorldInfo(lorebookName, data);

    ext.chat_metadata.auto_lorebooks = {
      registry: {
        index: {
          char_0001: { uid: existing.uid, type: 'character', name: 'Test', comment: 'character-Test', synopsis: 'old synopsis', aliases: ['test'] }
        },
        counters: { character: 1 }
      }
    };

    const responses = [
      JSON.stringify({ type: 'character', synopsis: 'triage synopsis', sameEntityIds: ['char_0001'], needsFullContextIds: [] }),
      JSON.stringify({ resolvedId: 'char_0001', synopsis: 'merged synopsis' })
    ];
    let callIndex = 0;
    ext.setGenerateRawImplementation(async () => responses[callIndex++] || JSON.stringify({ resolvedId: 'new', synopsis: '' }));

    const result = await proc.processSingleLorebookEntry({ name: 'Test', content: 'Updated info', keys: ['test'] }, { useQueue: false });
    expect(result.success).toBe(true);
    expect(result.action).toBe('merged');
    expect(result.id).toBe('char_0001');
    expect(merges.count).toBe(1);

    expect(ext.chat_metadata.auto_lorebooks.registry.index.char_0001.synopsis).toBe('merged synopsis');
    const stored = await ext.loadWorldInfo(lorebookName);
    const registryEntry = Object.values(stored.entries).find(e => e.comment === '_registry_character');
    expect(Boolean((registryEntry?.content || '').includes('merged synopsis'))).toBe(true);

    ext.setGenerateRawImplementation(null);
  });

  test('processSingleLorebookEntry creates new entity when no matches exist', async () => {
    const { ext, proc } = await setupProcessor();

    const lorebookName = 'lb';
    await ext.createNewWorldInfo(lorebookName);
    ext.chat_metadata[ext.METADATA_KEY] = lorebookName;

    ext.chat_metadata.auto_lorebooks = {
      registry: {
        index: {},
        counters: {}
      }
    };

    const responses = [
      JSON.stringify({ type: 'character', synopsis: 'fresh synopsis', sameEntityIds: [], needsFullContextIds: [] })
    ];
    let callIndex = 0;
    ext.setGenerateRawImplementation(async () => responses[callIndex++] || JSON.stringify({ resolvedId: 'new', synopsis: 'fresh synopsis' }));

    const result = await proc.processSingleLorebookEntry({ name: 'Nova', content: 'New character', keys: ['nova'] }, { useQueue: false });
    expect(result.success).toBe(true);
    expect(result.action).toBe('created');
    expect(result.id).toBe('char_0001');

    const index = ext.chat_metadata.auto_lorebooks.registry.index;
    expect(Object.keys(index)).toEqual(['char_0001']);
    expect(index.char_0001.synopsis).toBe('fresh synopsis');

    const stored = await ext.loadWorldInfo(lorebookName);
    const newEntry = Object.values(stored.entries).find(e => e.comment === 'character-Nova');
    expect(newEntry?.content).toBe('New character');

    ext.setGenerateRawImplementation(null);
  });

  test('processSingleLorebookEntry creates new entity after requesting full context', async () => {
    const merges = { count: 0 };
    const { ext, proc } = await setupProcessor({ mergeImpl: async () => { merges.count += 1; return { success: true }; } });

    const lorebookName = 'lb';
    await ext.createNewWorldInfo(lorebookName);
    ext.chat_metadata[ext.METADATA_KEY] = lorebookName;

    const data = await ext.loadWorldInfo(lorebookName);
    const existing = ext.createWorldInfoEntry(lorebookName, data);
    existing.comment = 'Test';
    existing.content = 'Original content';
    existing.key = ['test'];
    await ext.saveWorldInfo(lorebookName, data);

    ext.chat_metadata.auto_lorebooks = {
      registry: {
        index: {
          char_0001: { uid: existing.uid, type: 'character', name: 'Test', comment: 'character-Test', synopsis: 'old synopsis', aliases: ['test'] }
        },
        counters: { character: 1 }
      }
    };

    const responses = [
      JSON.stringify({ type: 'character', synopsis: 'needs context', sameEntityIds: [], needsFullContextIds: ['char_0001'] }),
      JSON.stringify({ resolvedId: 'new', synopsis: 'brand new synopsis' })
    ];
    let callIndex = 0;
    ext.setGenerateRawImplementation(async () => responses[callIndex++] || JSON.stringify({ resolvedId: 'new', synopsis: 'brand new synopsis' }));

    const result = await proc.processSingleLorebookEntry({ name: 'Nova', content: 'New character', keys: ['nova'] }, { useQueue: false });
    expect(result.success).toBe(true);
    expect(result.action).toBe('created');
    expect(result.id).toBe('char_0002');
    expect(merges.count).toBe(0);

    const index = ext.chat_metadata.auto_lorebooks.registry.index;
    expect(index.char_0001.synopsis).toBe('old synopsis');
    expect(index.char_0002.synopsis).toBe('brand new synopsis');

    const stored = await ext.loadWorldInfo(lorebookName);
    const newEntry = Object.values(stored.entries).find(e => e.comment === 'character-Nova');
    expect(newEntry?.content).toBe('New character');

    ext.setGenerateRawImplementation(null);
  });

  test('processSummaryToLorebook merges and creates entries end-to-end', async () => {
    const merges = { count: 0 };
    const { ext, proc } = await setupProcessor({ mergeImpl: async () => { merges.count += 1; return { success: true }; } });

    const lorebookName = 'lb';
    await ext.createNewWorldInfo(lorebookName);
    ext.chat_metadata[ext.METADATA_KEY] = lorebookName;

    const data = await ext.loadWorldInfo(lorebookName);
    const existing = ext.createWorldInfoEntry(lorebookName, data);
    existing.comment = 'Test';
    existing.content = 'Original content';
    existing.key = ['test'];
    await ext.saveWorldInfo(lorebookName, data);

    ext.chat_metadata.auto_lorebooks = {
      registry: {
        index: {
          char_0001: { uid: existing.uid, type: 'character', name: 'Test', comment: 'character-Test', synopsis: 'old synopsis', aliases: ['test'] }
        },
        counters: { character: 1 }
      }
    };

    const responses = [
      JSON.stringify({ type: 'character', synopsis: 'triage synopsis', sameEntityIds: ['char_0001'], needsFullContextIds: [] }),
      JSON.stringify({ resolvedId: 'char_0001', synopsis: 'merged synopsis' })
    ];
    let callIndex = 0;
    ext.setGenerateRawImplementation(async () => responses[callIndex++] || JSON.stringify({ resolvedId: 'new', synopsis: 'fresh synopsis' }));

    const summary = {
      timestamp: Date.now(),
      lorebooks: [
        { name: 'Test', content: 'Updated info', keys: ['test'], type: 'character' },
        { name: 'Nova', content: 'New character', keys: ['nova'], type: 'character' }
      ]
    };

    const result = await proc.processSummaryToLorebook(summary, { useQueue: false, skipDuplicates: false });
    expect(result.success).toBe(true);
    expect(result.results.merged.length).toBe(1);
    expect(result.results.created.length).toBe(1);
    expect(merges.count).toBe(1);
    expect(ext.chat_metadata.auto_lorebooks_processed_summaries.length).toBe(1);

    const index = ext.chat_metadata.auto_lorebooks.registry.index;
    expect(index.char_0001.synopsis).toBe('merged synopsis');
    expect(index.char_0002.synopsis).toBe('fresh synopsis');

    const stored = await ext.loadWorldInfo(lorebookName);
    const newEntry = Object.values(stored.entries).find(e => e.comment === 'character-Nova');
    expect(newEntry?.content).toBe('New character');

    ext.setGenerateRawImplementation(null);
  });
};

export default ({ test, expect }) => {
  test('processor: useQueue enqueues merge op', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');
    const proc = await import('../../tests/virtual/summaryToLorebookProcessor.js');
    await oq.pauseQueue();
    await oq.clearAllOperations();
    // initialize processor; inject simple merger
    proc.initSummaryToLorebookProcessor(
      { log(){}, debug(){}, error(){}, toast(){}, get_settings(){ return true; } },
      { getAttachedLorebook: () => 'lb', getLorebookEntries: async () => [], addLorebookEntry: async () => ({ uid: 1 }) },
      { mergeLorebookEntry: async () => ({ success: true }) }
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
      triage_prompt: '{{new_entry}}',
      triage_prefill: '',
      triage_connection_profile: '',
      triage_completion_preset: '',
      resolution_prompt: '{{candidate_entries}}',
      resolution_prefill: '',
      resolution_connection_profile: '',
      resolution_completion_preset: ''
    });

    // Seed registry state with existing entity id
    ext.chat_metadata.auto_lorebooks = ext.chat_metadata.auto_lorebooks || {};
    ext.chat_metadata.auto_lorebooks.registry = {
      index: {
        char_0001: {
          uid: 7,
          type: 'character',
          name: 'Test',
          comment: 'Test',
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
        getLorebookEntries: async () => ([{ uid: 7, comment: 'Test', key: [], keysecondary: [], content: 'prev' }]),
        addLorebookEntry: async () => ({ uid: 1 })
      },
      { mergeLorebookEntry: async () => { called = true; return ({ success: true }); } }
    );
    const entry = { name: 'Test', content: 'abc', keywords: ['a'] };
    await proc.processSingleLorebookEntry(entry, { useQueue: false });
    expect(called).toBe(true);
    ext.setGenerateRawImplementation(null);
  });
};

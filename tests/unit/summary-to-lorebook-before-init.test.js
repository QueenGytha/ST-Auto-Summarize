export default ({ test, expect }) => {
  test('summaryToLorebook: fails without triage prompt configured', async () => {
    const proc = await import('../../tests/virtual/summaryToLorebookProcessor.js');
    const ext = await import('../../tests/virtual/stubs/externals.js');
    // Configure keyword generation prompt via extension_settings to exercise fallback
    ext.extension_settings.autoLorebooks.keyword_generation_prompt = '["a","b"]';
    // Initialize without get_settings in utils
    proc.initSummaryToLorebookProcessor(
      { log(){}, debug(){}, error(){}, toast(){} },
      { getAttachedLorebook: () => 'lb', getLorebookEntries: async () => [], addLorebookEntry: async () => ({ uid: 1 }) },
      { mergeLorebookEntry: async () => ({ success: true }) }
    );

    const entry = { name: 'TestEntry', content: 'Some content', keywords: [] };
    const res = await proc.processSingleLorebookEntry(entry, { useQueue: false });
    // Should fail because lorebook_entry_lookup_prompt is missing
    expect(res.success).toBe(false);
  });
};


// @flow
// Tests for missing prompt warning behavior

export default ({ test, expect } /*: any */) => {
    // Helper to initialize module with stubs
    async function initModule() {
        const mod = await import('../../tests/virtual/summaryToLorebookProcessor.js');

        // Initialize with stub functions (required for error/debug/log/toast)
        mod.initSummaryToLorebookProcessor(
            {
                log() {},
                debug() {},
                error() {},
                toast() {}
            },
            {
                getAttachedLorebook: () => 'test-lorebook',
                getLorebookEntries: async () => [],
                addLorebookEntry: async (name, entry) => ({ uid: 1, ...entry })
            },
            {
                mergeLorebookEntry: async () => ({ success: true })
            }
        );

        return mod;
    }

    test('runTriageStage: warns and returns early when triage_prompt is missing', async () => {
        const mod = await initModule();

        const normalizedEntry = {
            comment: 'Test Entry',
            content: 'Test content',
            keys: ['test'],
            type: 'character'
        };

        const emptySettings = {};
        const result = await mod.runTriageStage(normalizedEntry, 'Registry listing', 'character|location', emptySettings);

        // Should return early with empty results
        expect(result.type).toBe('character');
        expect(result.synopsis).toBe('');
        expect(result.sameEntityIds.length).toBe(0);
        expect(result.needsFullContextIds.length).toBe(0);
    });

    test('runTriageStage: warns when settings object has no triage_prompt property', async () => {
        const mod = await initModule();

        const normalizedEntry = {
            comment: 'Test Entry',
            content: 'Test content',
            keys: ['test'],
            type: 'character'
        };

        const settingsWithoutPrompt = {
            triage_prefill: '',
            triage_connection_profile: '',
            triage_completion_preset: ''
            // Missing triage_prompt
        };

        const result = await mod.runTriageStage(normalizedEntry, 'Registry listing', 'character|location', settingsWithoutPrompt);

        expect(result.type).toBe('character');
        expect(result.synopsis).toBe('');
        expect(result.sameEntityIds.length).toBe(0);
        expect(result.needsFullContextIds.length).toBe(0);
    });

    test('runTriageStage: warns when triage_prompt is empty string', async () => {
        const mod = await initModule();

        const normalizedEntry = {
            comment: 'Test Entry',
            content: 'Test content',
            keys: ['test'],
            type: 'character'
        };

        const settingsWithEmptyPrompt = {
            triage_prompt: '',  // Empty string
            triage_prefill: '',
            triage_connection_profile: '',
            triage_completion_preset: ''
        };

        const result = await mod.runTriageStage(normalizedEntry, 'Registry listing', 'character|location', settingsWithEmptyPrompt);

        expect(result.type).toBe('character');
        expect(result.synopsis).toBe('');
        expect(result.sameEntityIds.length).toBe(0);
        expect(result.needsFullContextIds.length).toBe(0);
    });

    test('runResolutionStage: skips when resolution_prompt is missing', async () => {
        const mod = await initModule();

        const normalizedEntry = {
            comment: 'Test Entry',
            content: 'Test content',
            keys: ['test'],
            type: 'character'
        };

        const candidateEntries = [
            {
                id: 'char_0001',
                uid: 123,
                comment: 'Existing Entry',
                content: 'Existing content',
                keys: ['existing']
            }
        ];

        const settingsWithoutResolutionPrompt = {
            // Missing resolution_prompt
            resolution_prefill: '',
            resolution_connection_profile: '',
            resolution_completion_preset: ''
        };

        const result = await mod.runResolutionStage(
            normalizedEntry,
            'Test synopsis',
            candidateEntries,
            'character',
            settingsWithoutResolutionPrompt
        );

        // Should return early with fallback values
        expect(result.resolvedId).toBe(null);
        expect(result.synopsis).toBe('Test synopsis');
    });

    test('normalizeEntryData: handles entry with missing fields', async () => {
        const mod = await import('../../tests/virtual/summaryToLorebookProcessor.js');

        const partialEntry = {
            name: 'Test Name'
            // Missing: content, keywords, type
        };

        const normalized = mod.normalizeEntryData(partialEntry);

        expect(normalized.comment).toBe('Test Name');
        expect(normalized.content).toBe('');
        expect(Array.isArray(normalized.keys)).toBe(true);
        expect(normalized.keys.length).toBe(0);
        expect(normalized.type).toBe('');
    });

    test('normalizeEntryData: accepts keywords field from prompt JSON', async () => {
        const mod = await import('../../tests/virtual/summaryToLorebookProcessor.js');

        const entryWithKeywords = {
            name: 'Test Entity',
            content: 'Test content',
            keywords: ['keyword1', 'keyword2'],
            type: 'character'
        };

        const normalized = mod.normalizeEntryData(entryWithKeywords);

        expect(normalized.comment).toBe('Test Entity');
        expect(normalized.content).toBe('Test content');
        expect(normalized.keys).toEqual(['keyword1', 'keyword2']);
        expect(normalized.type).toBe('character');
    });

    test('ensureRegistryState: initializes registry if missing', async () => {
        const mod = await import('../../tests/virtual/summaryToLorebookProcessor.js');
        const { chat_metadata } = await import('../../tests/virtual/stubs/externals.js');

        // Clear auto_lorebooks
        delete chat_metadata.auto_lorebooks;

        const registry = mod.ensureRegistryState();

        expect(registry).toBeDefined();
        expect(typeof registry.index).toBe('object');
        expect(typeof registry.counters).toBe('object');
        expect(chat_metadata.auto_lorebooks.registry).toBe(registry);
    });

    test('ensureRegistryState: preserves existing registry', async () => {
        const mod = await import('../../tests/virtual/summaryToLorebookProcessor.js');
        const { chat_metadata } = await import('../../tests/virtual/stubs/externals.js');

        // Set up existing registry
        chat_metadata.auto_lorebooks = {
            registry: {
                index: { 'char_0001': { name: 'Test', type: 'character' } },
                counters: { character: 1 }
            }
        };

        const registry = mod.ensureRegistryState();

        expect(registry.index['char_0001']).toBeDefined();
        expect(registry.index['char_0001'].name).toBe('Test');
        expect(registry.counters.character).toBe(1);
    });

    test('assignEntityId: generates correct ID format', async () => {
        const mod = await import('../../tests/virtual/summaryToLorebookProcessor.js');

        const state /*: any */ = {
            index: {},
            counters: {}
        };

        const id1 = mod.assignEntityId(state, 'character');
        expect(id1).toBe('char_0001');
        expect(state.counters.character).toBe(1);

        const id2 = mod.assignEntityId(state, 'character');
        expect(id2).toBe('char_0002');
        expect(state.counters.character).toBe(2);

        const id3 = mod.assignEntityId(state, 'location');
        expect(id3).toBe('loca_0001');
        expect(state.counters.location).toBe(1);
    });

    test('buildRegistryListing: formats registry correctly', async () => {
        const mod = await import('../../tests/virtual/summaryToLorebookProcessor.js');

        const state = {
            index: {
                'char_0001': {
                    type: 'character',
                    name: 'Alice',
                    comment: 'Alice',
                    aliases: ['alice', 'warrior'],
                    synopsis: 'Skilled warrior'
                },
                'loca_0001': {
                    type: 'location',
                    name: 'Tavern',
                    comment: 'Rusty Nail Tavern',
                    aliases: ['tavern', 'inn'],
                    synopsis: 'Local gathering place'
                }
            },
            counters: {
                character: 1,
                location: 1
            }
        };

        const listing = mod.buildRegistryListing(state);

        // Use includes instead of toContain (test framework limitation)
        expect(listing.includes('[Type: character]')).toBeTruthy();
        expect(listing.includes('[Type: location]')).toBeTruthy();
        expect(listing.includes('id: char_0001')).toBeTruthy();
        expect(listing.includes('name: Alice')).toBeTruthy();
        expect(listing.includes('aliases: alice; warrior')).toBeTruthy();
        expect(listing.includes('synopsis: Skilled warrior')).toBeTruthy();
    });

    test('buildRegistryListing: returns message when empty', async () => {
        const mod = await import('../../tests/virtual/summaryToLorebookProcessor.js');

        const emptyState = {
            index: {},
            counters: {}
        };

        const listing = mod.buildRegistryListing(emptyState);

        expect(listing).toBe('No registry entries available yet.');
    });
};

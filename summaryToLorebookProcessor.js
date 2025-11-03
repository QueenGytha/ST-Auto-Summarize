// @flow
// summaryToLorebookProcessor.js - Extract lorebook entries from summary JSON objects and process them

// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { chat_metadata, saveMetadata, generateRaw } from '../../../../script.js';
// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { extension_settings } from '../../../extensions.js';

import {
    getConfiguredEntityTypeDefinitions,
    createEntityTypeMap,
    applyEntityTypeFlagsToEntry,
    sanitizeEntityTypeName,
    normalizeEntityTypeDefinition,
    parseEntityTypeDefinition,
} from './entityTypes.js';

import { injectMetadata } from './metadataInjector.js';

// Will be imported from index.js via barrel exports
let log /*: any */, debug /*: any */, error /*: any */, toast /*: any */;  // Utility functions - any type is legitimate
let getAttachedLorebook /*: any */, getLorebookEntries /*: any */, addLorebookEntry /*: any */;  // Lorebook functions - any type is legitimate
let mergeLorebookEntry /*: any */;  // Entry merger function - any type is legitimate
let updateRegistryEntryContent /*: any */;
let withConnectionSettings /*: any */;  // Connection settings management - any type is legitimate
let get_settings /*: any */, set_settings /*: any */;  // Profile settings functions - any type is legitimate

const REGISTRY_PREFIX /*: string */ = '_registry_';

// Removed getSetting helper; no settings access needed here

/**
 * Initialize the summary-to-lorebook processor module
 */
// $FlowFixMe[signature-verification-failure]
export function initSummaryToLorebookProcessor(utils /*: any */, lorebookManagerModule /*: any */, entryMergerModule /*: any */, connectionSettingsManager /*: any */, settingsManager /*: any */) /*: void */ {
    // All parameters are any type - objects with various properties - legitimate use of any
    log = utils.log;
    debug = utils.debug;
    error = utils.error;
    toast = utils.toast;
    get_settings = settingsManager.get_settings;
    set_settings = settingsManager.set_settings;

    // Import lorebook manager functions
    if (lorebookManagerModule) {
        getAttachedLorebook = lorebookManagerModule.getAttachedLorebook;
        getLorebookEntries = lorebookManagerModule.getLorebookEntries;
        addLorebookEntry = lorebookManagerModule.addLorebookEntry;
        updateRegistryEntryContent = lorebookManagerModule.updateRegistryEntryContent;
    }

    // Import entry merger function
    if (entryMergerModule) {
        mergeLorebookEntry = entryMergerModule.mergeLorebookEntry;
    }

    // Import connection settings management
    console.log('[summaryToLorebookProcessor INIT] connectionSettingsManager:', connectionSettingsManager);
    console.log('[summaryToLorebookProcessor INIT] connectionSettingsManager keys:', Object.keys(connectionSettingsManager || {}));

    if (connectionSettingsManager) {
        withConnectionSettings = connectionSettingsManager.withConnectionSettings;
        console.log('[summaryToLorebookProcessor INIT] withConnectionSettings after assignment:', withConnectionSettings);
        console.log('[summaryToLorebookProcessor INIT] typeof withConnectionSettings:', typeof withConnectionSettings);

        if (!withConnectionSettings || typeof withConnectionSettings !== 'function') {
            error?.('Failed to import withConnectionSettings from connectionSettingsManager', {
                hasManager: !!connectionSettingsManager,
                exports: Object.keys(connectionSettingsManager || {}),
                withConnectionSettings: typeof withConnectionSettings
            });
        } else {
            console.log('[summaryToLorebookProcessor INIT] ✓ Successfully imported withConnectionSettings');
            debug?.('[summaryToLorebookProcessor] Successfully imported withConnectionSettings');
        }
    } else {
        console.error('[summaryToLorebookProcessor INIT] connectionSettingsManager is undefined/null!');
    }
}

/**
 * Get summary processing settings (with defaults)
 */
function getSummaryProcessingSetting(key /*: string */, defaultValue /*: any */ = null) /*: any */ {
    try {
        // ALL summary processing settings are per-profile
        const settingKey = `auto_lorebooks_summary_${key}`;
        return get_settings(settingKey) ?? defaultValue;
    } catch (err) {
        error("Error getting summary processing setting", err);
        return defaultValue;
    }
}

/**
 * Set summary processing setting
 */
function setSummaryProcessingSetting(key /*: string */, value /*: any */) /*: void */ {
    try {
        // ALL summary processing settings are per-profile
        const settingKey = `auto_lorebooks_summary_${key}`;
        set_settings(settingKey, value);
    } catch (err) {
        error("Error setting summary processing setting", err);
    }
}

/**
 * Get processed summaries tracker from chat metadata
 * @returns {Set<string>} Set of processed summary IDs
 */
function getProcessedSummaries() /*: any */ {
    if (!chat_metadata.auto_lorebooks_processed_summaries) {
        chat_metadata.auto_lorebooks_processed_summaries = [];
    }
    return new Set(chat_metadata.auto_lorebooks_processed_summaries);
}

/**
 * Mark a summary as processed
 * @param {string} summaryId - Unique ID for the summary
 */
function markSummaryProcessed(summaryId /*: string */) /*: void */ {
    const processed = getProcessedSummaries();
    processed.add(summaryId);
    chat_metadata.auto_lorebooks_processed_summaries = Array.from(processed);
    saveMetadata();
    debug(`Marked summary as processed: ${summaryId}`);
}

/**
 * Check if a summary has been processed
 * @param {string} summaryId - Unique ID for the summary
 * @returns {boolean}
 */
function isSummaryProcessed(summaryId /*: string */) /*: boolean */ {
    return getProcessedSummaries().has(summaryId);
}

/**
 * Generate unique ID for a summary object
 * @param {Object} summary - Summary object
 * @returns {string} Unique ID
 */
function generateSummaryId(summary /*: any */) /*: string */ {
    // Use timestamp + content hash as ID
    const timestamp = summary.timestamp || Date.now();
    const content = JSON.stringify(summary.lorebook || summary);
    const hash = simpleHash(content);
    return `summary_${timestamp}_${hash}`;
}

/**
 * Simple hash function for content
 * @param {string} str - String to hash
 * @returns {string} Hash value
 */
function simpleHash(str /*: string */) /*: string */ {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Extract lorebook portion from a summary JSON object
 * @param {Object} summary - Summary object
 * @returns {Object|null} Lorebook data or null
 */
function extractLorebookData(summary /*: any */) /*: any */ {
    try {
        // Check if summary has a lorebooks array (plural - standard format)
        if (summary.lorebooks && Array.isArray(summary.lorebooks)) {
            debug('Found lorebooks array in summary');
            return { entries: summary.lorebooks };
        }

        // Check if summary has a lorebook property (singular - legacy format)
        if (summary.lorebook) {
            debug('Found lorebook property in summary');
            return summary.lorebook;
        }

        // Check if summary has entries array directly
        if (summary.entries && Array.isArray(summary.entries)) {
            debug('Found entries array in summary');
            return { entries: summary.entries };
        }

        // Check if the entire summary is lorebook data
        if (summary.comment || summary.content || summary.keys) {
            debug('Summary appears to be a single entry');
            return { entries: [summary] };
        }

        debug('No lorebook data found in summary');
        return null;

    } catch (err) {
        error('Error extracting lorebook data from summary', err);
        return null;
    }
}

/**
 * Find existing entry by comment/name
 * @param {Array} entries - Array of existing lorebook entries
 * @param {Object} newEntry - New entry to find
 * @returns {Object|null} Matching entry or null
 */
/**
 * Build entry name with type prefix
 * @param {Object} entry - Entry data
 * @returns {string} Entry name with type prefix
 */
function buildEntryName(entry /*: any */) /*: string */ {
    const baseName = entry.comment || entry.name || '';
    const type = entry.type;

    // Skip prefix for special entries (registry and system entries)
    if (baseName.startsWith('_registry_') || baseName.startsWith('__')) {
        return baseName;
    }

    // Add type prefix if type exists and name exists
    if (type && baseName) {
        const sanitizedType = sanitizeEntityTypeName(type);
        // Check if name already has type prefix to avoid duplication
        if (baseName.startsWith(`${sanitizedType}-`)) {
            return baseName;
        }
        return `${sanitizedType}-${baseName}`;
    }

    return baseName;
}

/**
 * Normalize entry data structure
 * @param {Object} entry - Entry data
 * @returns {Object} Normalized entry
 */
export function normalizeEntryData(entry /*: any */) /*: any */ {
    return {
        comment: buildEntryName(entry),
        content: entry.content || entry.description || '',
        // Accept "keywords" (from prompt JSON), "keys" (internal), or "key" (WI format)
        keys: entry.keys || entry.keywords || entry.key || [],
        secondaryKeys: entry.secondaryKeys || entry.keysecondary || [],
        constant: entry.constant,
        disable: entry.disable ?? false,
        order: entry.order ?? 100,
        position: entry.position ?? 0,
        depth: entry.depth ?? 4,
        type: typeof entry.type === 'string' ? sanitizeEntityTypeName(entry.type) : ''
    };
}

// Standalone keyword generation has been removed; entries must provide keywords in the summary JSON.

function isRegistryEntry(entry /*: any */) /*: boolean */ {
    const comment = entry?.comment;
    return typeof comment === 'string' && comment.startsWith(REGISTRY_PREFIX);
}

export function ensureRegistryState() /*: any */ {
    const metadata /*: any */ = chat_metadata;
    if (!metadata.auto_lorebooks || typeof metadata.auto_lorebooks !== 'object') {
        metadata.auto_lorebooks = {};
    }
    const autoLorebooks /*: any */ = metadata.auto_lorebooks;
    const registry = autoLorebooks.registry;
    if (registry && typeof registry === 'object') {
        if (!registry.index || typeof registry.index !== 'object') registry.index = {};
        if (!registry.counters || typeof registry.counters !== 'object') registry.counters = {};
        return registry;
    }
    const newState = { index: {}, counters: {} };
    autoLorebooks.registry = newState;
    return newState;
}

function buildTypePrefix(type /*: string */) /*: string */ {
    const base = sanitizeEntityTypeName(type) || 'type';
    if (base.length >= 4) return base.slice(0, 4);
    return base.padEnd(4, 'x');
}

export function assignEntityId(state /*: any */, type /*: string */) /*: string */ {
    const counters = state.counters || {};
    const current = Number(counters[type]) || 0;
    const next = current + 1;
    counters[type] = next;
    const prefix = buildTypePrefix(type);
    return `${prefix}_${String(next).padStart(4, '0')}`;
}

export function ensureStringArray(value /*: any */) /*: Array<string> */ {
    if (Array.isArray(value)) {
        return value.map(v => String(v)).filter(Boolean);
    }
    return [];
}

export function updateRegistryRecord(state /*: any */, id /*: string */, updates /*: any */) /*: void */ {
    if (!state.index[id]) {
        state.index[id] = {};
    }
    const record = state.index[id];
    if (updates.uid !== undefined) record.uid = updates.uid;
    if (updates.type) record.type = updates.type;
    if (updates.name !== undefined) record.name = updates.name;
    if (updates.comment !== undefined) record.comment = updates.comment;
    if (updates.synopsis !== undefined) record.synopsis = updates.synopsis;
    if (updates.aliases !== undefined) record.aliases = ensureStringArray(updates.aliases);
}

export function buildRegistryListing(state /*: any */) /*: string */ {
    const grouped /*: { [key: string]: Array<any> } */ = {};
    Object.entries(state.index || {}).forEach(([id, record]) => {
        if (!record) return;
        const type = record.type || 'unknown';
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push({ id, ...record });
    });
    const types = Object.keys(grouped);
    if (types.length === 0) {
        return 'No registry entries available yet.';
    }
    const sections = [];
    types.sort().forEach(type => {
        sections.push(`[Type: ${type}]`);
        const records = grouped[type] || [];
        records.sort((a, b) => {
            const nameA = (a.name || a.comment || '').toLowerCase();
            const nameB = (b.name || b.comment || '').toLowerCase();
            return nameA.localeCompare(nameB);
        }).forEach((record, index) => {
            const name = record.name || record.comment || 'Unknown';
            const aliases = ensureStringArray(record.aliases);
            const aliasText = aliases.length > 0 ? aliases.join('; ') : '—';
            const synopsis = record.synopsis || '—';
            sections.push(`${index + 1}. id: ${record.id} | name: ${name} | aliases: ${aliasText} | synopsis: ${synopsis}`);
        });
        sections.push('');
    });
    return sections.join('\n').trim();
}

export function buildRegistryItemsForType(state /*: any */, type /*: string */) /*: Array<any> */ {
    const items = [];
    Object.entries(state.index || {}).forEach(([id, record]) => {
        if (!record) return;
        if ((record.type || 'unknown') !== type) return;
        items.push({
            id,
            name: record.name || '',
            comment: record.comment || '',
            aliases: ensureStringArray(record.aliases),
            synopsis: record.synopsis || ''
        });
    });
    items.sort((a, b) => (a.name || a.comment || '').localeCompare(b.name || b.comment || ''));
    return items;
}

export function buildCandidateEntriesData(candidateIds /*: Array<string> */, registryState /*: any */, existingEntriesMap /*: Map<string, any> */) /*: Array<any> */ {
    const data = [];
    candidateIds.forEach(id => {
        const record = registryState.index?.[id];
        if (!record) return;
        const entry = existingEntriesMap.get(String(record.uid));
        if (!entry) return;
        data.push({
            id,
            uid: record.uid,
            comment: entry.comment || '',
            content: entry.content || '',
            keys: Array.isArray(entry.key) ? entry.key : [],
            secondaryKeys: Array.isArray(entry.keysecondary) ? entry.keysecondary : [],
            aliases: ensureStringArray(record.aliases),
            synopsis: record.synopsis || ''
        });
    });
    return data;
}

function buildNewEntryPayload(entry /*: any */) /*: any */ {
    return {
        comment: entry.comment || '',
        content: entry.content || '',
        keys: ensureStringArray(entry.keys),
        secondaryKeys: ensureStringArray(entry.secondaryKeys),
        type: entry.type || '',
        constant: Boolean(entry.constant),
        disable: Boolean(entry.disable)
    };
}

async function runModelWithSettings(
    prompt /*: string */,
    prefill /*: string */,
    connectionProfile /*: string */,
    completionPreset /*: string */,
    label /*: string */
) /*: Promise<?string> */ {
    try {
        console.log('[runModelWithSettings] Called with label:', label);
        console.log('[runModelWithSettings] withConnectionSettings:', withConnectionSettings);
        console.log('[runModelWithSettings] typeof withConnectionSettings:', typeof withConnectionSettings);

        // Validate that withConnectionSettings is available
        if (!withConnectionSettings || typeof withConnectionSettings !== 'function') {
            const errorMsg = 'withConnectionSettings is not available. Module may not be initialized properly.';
            console.error('[runModelWithSettings] ERROR:', errorMsg);
            console.error('[runModelWithSettings] Stack trace:', new Error().stack);
            error?.(errorMsg, {
                typeofWithConnectionSettings: typeof withConnectionSettings,
                initialized: !!withConnectionSettings
            });
            throw new Error(errorMsg);
        }

        // Inject metadata for proxy tracking
        const promptWithMetadata = injectMetadata(prompt, {
            operation: label // Use label as operation type (e.g., 'lorebook_entry_lookup', 'lorebookEntryDeduplicate')
        });

        // Use centralized connection settings management
        const response = await withConnectionSettings(
            connectionProfile,
            completionPreset,
            async () => {
                return await generateRaw({
                    prompt: promptWithMetadata,
                    instructOverride: false,
                    quietToLoud: false,
                    prefill: prefill || ''
                });
            }
        );

        if (typeof response === 'string') {
            debug?.(`Auto-Lorebooks ${label} response length: ${response.length}`);
            return response.trim();
        }

        error?.(`Auto-Lorebooks ${label} returned non-string response`);
        return null;
    } catch (err) {
        error?.(`Error during Auto-Lorebooks ${label}`, err);
        // Re-throw to let queue retry logic handle it (don't return null)
        throw err;
    }
}

function sanitizeLorebookEntryLookupType(rawType /*: any */) /*: string */ {
    if (!rawType || typeof rawType !== 'string') return '';
    const normalized = normalizeEntityTypeDefinition(rawType);
    const parsed = parseEntityTypeDefinition(normalized);
    return parsed.name || sanitizeEntityTypeName(rawType);
}

function parseJsonSafe(raw /*: ?string */) /*: any */ {
    if (!raw) return null;

    let cleaned = raw.trim();

    // Strip markdown code fences if present
    // Handles: ```json\n{...}\n``` or ```\n{...}\n```
    if (cleaned.startsWith('```')) {
        const lines = cleaned.split('\n');
        // Remove first line (```json or ```)
        lines.shift();
        // Remove last line if it's just ```
        if (lines.length > 0 && lines[lines.length - 1].trim() === '```') {
            lines.pop();
        }
        cleaned = lines.join('\n').trim();
    }

    try {
        return JSON.parse(cleaned);
    } catch (err) {
        // Try original string as fallback in case our cleaning broke something
        if (cleaned !== raw.trim()) {
            try {
                return JSON.parse(raw.trim());
            } catch {
                // Both failed, log the original error with original input
                error?.('Failed to parse JSON response', err, raw);
                return null;
            }
        }
        error?.('Failed to parse JSON response', err, raw);
        return null;
    }
}

/**
 * Logs warning and throws error when lorebook entry lookup prompt is missing
 * @param {any} normalizedEntry - The entry being processed
 * @throws {Error} - Always throws to fail the operation
 */
function handleMissingLorebookEntryLookupPrompt(normalizedEntry /*: any */) /*: void */ {
    const entryName = normalizedEntry?.comment || normalizedEntry?.name || 'Unknown';
    error(`CRITICAL: Lorebook Entry Lookup prompt is missing! Cannot process entry: ${entryName}`);
    error('Settings check - lorebook_entry_lookup_prompt is missing or empty');
    toast(`Auto-Lorebooks: Lorebook Entry Lookup prompt missing! Cannot process lorebook entries. Check extension settings.`, 'error');
    throw new Error(`Auto-Lorebooks configuration error: lorebook_entry_lookup_prompt is required but missing. Cannot process entry: ${entryName}`);
}

export async function runLorebookEntryLookupStage(
    normalizedEntry /*: any */,
    registryListing /*: string */,
    typeList /*: string */,
    settings /*: any */
) /*: Promise<{ type: string, synopsis: string, sameEntityIds: Array<string>, needsFullContextIds: Array<string> }> */ {
    const promptTemplate = settings?.lorebook_entry_lookup_prompt || '';
    if (!promptTemplate) {
        handleMissingLorebookEntryLookupPrompt(normalizedEntry);
        // Flow doesn't understand throw above never returns
        // $FlowFixMe[incompatible-return] - This code is unreachable because handleMissingLorebookEntryLookupPrompt always throws
        return { type: '', synopsis: '', sameEntityIds: [], needsFullContextIds: [] };
    }
    const payload = buildNewEntryPayload(normalizedEntry);
    const prompt = promptTemplate
        .replace(/\{\{lorebook_entry_types\}\}/g, typeList)
        .replace(/\{\{new_entry\}\}/g, JSON.stringify(payload, null, 2))
        .replace(/\{\{candidate_registry\}\}/g, registryListing);

    const response = await runModelWithSettings(
        prompt,
        settings?.lorebook_entry_lookup_prefill || '',
        settings?.lorebook_entry_lookup_connection_profile || '',
        settings?.lorebook_entry_lookup_completion_preset || '',
        'lorebook_entry_lookup'
    );

    const parsed = parseJsonSafe(response);
    if (!parsed || typeof parsed !== 'object') {
        return {
            type: normalizedEntry.type || '',
            synopsis: '',
            sameEntityIds: [],
            needsFullContextIds: []
        };
    }

    const type = sanitizeLorebookEntryLookupType(parsed.type) || normalizedEntry.type || '';
    const sameIds = ensureStringArray(parsed.sameEntityIds).map(id => String(id));
    const needsIds = ensureStringArray(parsed.needsFullContextIds).map(id => String(id));
    const synopsis = typeof parsed.synopsis === 'string' ? parsed.synopsis.trim() : '';

    return {
        type,
        synopsis,
        sameEntityIds: sameIds,
        needsFullContextIds: needsIds
    };
}

/**
 * Checks if lorebook entry deduplicate stage should run
 * @param {any[]} candidateEntries - Candidate entries
 * @param {any} settings - Processing settings
 * @returns {boolean} - Whether to run lorebook entry deduplicate
 */
function shouldRunLorebookEntryDeduplicate(candidateEntries /*: any */, settings /*: any */) /*: boolean */ {
    if (!candidateEntries || candidateEntries.length === 0) {
        return false;
    }
    const promptTemplate = settings?.lorebook_entry_deduplicate_prompt || '';
    if (!promptTemplate) {
        error(`CRITICAL: LorebookEntryDeduplicate prompt is missing! Cannot resolve ${candidateEntries.length} duplicate candidate(s).`);
        error('Settings check - lorebook_entry_deduplicate_prompt is missing or empty');
        toast(`Auto-Lorebooks: LorebookEntryDeduplicate prompt missing! Cannot process lorebook entries with potential duplicates. Check extension settings.`, 'error');
        throw new Error(`Auto-Lorebooks configuration error: lorebook_entry_deduplicate_prompt is required when duplicate candidates exist, but it is missing. Found ${candidateEntries.length} candidate(s) that need deduplication.`);
    }
    return true;
}

/**
 * Builds lorebook entry deduplicate prompt
 * @param {any} normalizedEntry - Entry to resolve
 * @param {string} lorebookEntryLookupSynopsis - Lorebook Entry Lookup synopsis
 * @param {any[]} candidateEntries - Candidate entries
 * @param {string} singleType - Entity type
 * @param {any} settings - Settings
 * @returns {string} - Built prompt
 */
function buildLorebookEntryDeduplicatePrompt(
    normalizedEntry /*: any */,
    lorebookEntryLookupSynopsis /*: string */,
    candidateEntries /*: any */,
    singleType /*: string */,
    settings /*: any */
) /*: string */ {
    const payload = buildNewEntryPayload(normalizedEntry);
    const promptTemplate = settings?.lorebook_entry_deduplicate_prompt || '';
    return promptTemplate
        .replace(/\{\{lorebook_entry_types\}\}/g, singleType || '')
        .replace(/\{\{new_entry\}\}/g, JSON.stringify(payload, null, 2))
        .replace(/\{\{lorebook_entry_lookup_synopsis\}\}/g, lorebookEntryLookupSynopsis || '')
        .replace(/\{\{candidate_entries\}\}/g, JSON.stringify(candidateEntries, null, 2));
}

/**
 * Executes lorebook entry deduplicate LLM call
 * @param {string} prompt - LorebookEntryDeduplicate prompt
 * @param {any} settings - Settings
 * @returns {Promise<string>} - LLM response
 */
async function executeLorebookEntryDeduplicateLLMCall(prompt /*: string */, settings /*: any */) /*: Promise<?string> */ {
    return await runModelWithSettings(
        prompt,
        settings?.lorebook_entry_deduplicate_prefill || '',
        settings?.lorebook_entry_deduplicate_connection_profile || '',
        settings?.lorebook_entry_deduplicate_completion_preset || '',
        'lorebookEntryDeduplicate'
    );
}

/**
 * Parses lorebook entry deduplicate response
 * @param {string} response - LLM response
 * @param {string} fallbackSynopsis - Fallback synopsis
 * @returns {{resolvedId: string|null, synopsis: string}} - Parsed result
 */
function parseLorebookEntryDeduplicateResponse(response /*: string */, fallbackSynopsis /*: string */) /*: any */ {
    const parsed = parseJsonSafe(response);
    if (!parsed || typeof parsed !== 'object') {
        return { resolvedId: null, synopsis: fallbackSynopsis || '' };
    }

    let resolvedId = parsed.resolvedId;
    if (resolvedId && typeof resolvedId === 'string') {
        const lowered = resolvedId.trim().toLowerCase();
        if (lowered === 'new' || lowered === 'none' || lowered === 'null') {
            resolvedId = null;
        }
    } else {
        resolvedId = null;
    }

    const synopsis = typeof parsed.synopsis === 'string' && parsed.synopsis.trim().length > 0
        ? parsed.synopsis.trim()
        : fallbackSynopsis || '';

    return { resolvedId: resolvedId ? String(resolvedId) : null, synopsis };
}

export async function runLorebookEntryDeduplicateStage(
    normalizedEntry /*: any */,
    lorebookEntryLookupSynopsis /*: string */,
    candidateEntries /*: Array<any> */,
    singleType /*: string */,
    settings /*: any */
) /*: Promise<{ resolvedId: ?string, synopsis: string }> */ {
    if (!shouldRunLorebookEntryDeduplicate(candidateEntries, settings)) {
        return { resolvedId: null, synopsis: lorebookEntryLookupSynopsis || '' };
    }

    const prompt = buildLorebookEntryDeduplicatePrompt(normalizedEntry, lorebookEntryLookupSynopsis, candidateEntries, singleType, settings);
    const response = await executeLorebookEntryDeduplicateLLMCall(prompt, settings);

    if (!response) {
        return { resolvedId: null, synopsis: lorebookEntryLookupSynopsis || '' };
    }

    return parseLorebookEntryDeduplicateResponse(response, lorebookEntryLookupSynopsis);
}

/**
 * Resolves and applies the entity type for a normalized entry
 * Handles type fallbacks and applies type-specific flags
 * @param {any} normalizedEntry - The entry to resolve type for
 * @param {any} lorebookEntryLookup - Lorebook Entry Lookup result containing suggested type
 * @param {Map<string, any>} entityTypeMap - Map of entity type definitions
 * @param {Array<any>} entityTypeDefs - Array of all entity type definitions
 * @returns {{targetType: string, typeDef: any}} - Resolved type name and definition
 */
function resolveEntryType(
    normalizedEntry /*: any */,
    lorebookEntryLookup /*: any */,
    entityTypeMap /*: any */,
    entityTypeDefs /*: any */
) /*: any */ {
    let targetType = lorebookEntryLookup.type || normalizedEntry.type || '';
    let typeDef = targetType ? entityTypeMap.get(targetType) : null;

    // Try fallback with sanitized name
    if (!typeDef && targetType) {
        const fallbackName = sanitizeEntityTypeName(targetType);
        typeDef = entityTypeMap.get(fallbackName);
        if (typeDef) targetType = typeDef.name;
    }

    // Use first available type as ultimate fallback
    if (!typeDef && entityTypeDefs.length > 0) {
        typeDef = entityTypeDefs[0];
        targetType = typeDef?.name || targetType || 'character';
    }

    // Apply type to entry
    normalizedEntry.type = targetType;
    applyEntityTypeFlagsToEntry(normalizedEntry, typeDef || null);

    return { targetType, typeDef };
}

/**
 * Builds candidate entry list and optionally runs lorebook entry deduplicate stage
 * @param {any} lorebookEntryLookup - Lorebook Entry Lookup result with candidate IDs
 * @param {any} registryState - Current registry state
 * @param {Map<number, any>} existingEntriesMap - Map of existing entries by UID
 * @param {any} normalizedEntry - The entry being processed
 * @param {string} targetType - The resolved type
 * @param {any} settings - Processing settings
 * @returns {Promise<{candidateIds: string[], lorebookEntryDeduplicate: any}>} - Candidates and deduplication result
 */
async function buildCandidateListAndResolve(
    lorebookEntryLookup /*: any */,
    registryState /*: any */,
    existingEntriesMap /*: any */,
    normalizedEntry /*: any */,
    targetType /*: string */,
    settings /*: any */
) /*: Promise<any> */ {
    const candidateIdSet /*: Set<string> */ = new Set();
    lorebookEntryLookup.sameEntityIds.forEach(id => candidateIdSet.add(String(id)));
    lorebookEntryLookup.needsFullContextIds.forEach(id => candidateIdSet.add(String(id)));
    const candidateIds = Array.from(candidateIdSet).filter(id => registryState.index?.[id]);

    let lorebookEntryDeduplicate = null;
    if (candidateIds.length > 0) {
        const candidateEntries = buildCandidateEntriesData(candidateIds, registryState, existingEntriesMap);
        if (candidateEntries.length > 0) {
            lorebookEntryDeduplicate = await runLorebookEntryDeduplicateStage(normalizedEntry, lorebookEntryLookup.synopsis || '', candidateEntries, targetType, settings);
        }
    }

    if (!lorebookEntryDeduplicate) {
        lorebookEntryDeduplicate = { resolvedId: null, synopsis: lorebookEntryLookup.synopsis || '' };
    }

    return { candidateIds, lorebookEntryDeduplicate };
}

/**
 * Applies fallback logic and validates the resolved entity ID
 * @param {any} lorebookEntryDeduplicate - Initial deduplication result
 * @param {string[]} candidateIds - List of candidate IDs
 * @param {any} lorebookEntryLookup - Lorebook Entry Lookup result
 * @param {any} registryState - Current registry state
 * @returns {{resolvedId: string|null, previousType: string|null, finalSynopsis: string}} - Final identity resolution
 */
function applyFallbackAndValidateIdentity(
    lorebookEntryDeduplicate /*: any */,
    candidateIds /*: any */,
    lorebookEntryLookup /*: any */,
    registryState /*: any */
) /*: any */ {
    let resolvedId = lorebookEntryDeduplicate.resolvedId;

    // Single candidate fallback: if only one candidate and no needsFullContext, use it
    if (!resolvedId && candidateIds.length === 1 && (!lorebookEntryLookup.needsFullContextIds || lorebookEntryLookup.needsFullContextIds.length === 0)) {
        const fallbackId = candidateIds[0];
        if (registryState.index?.[fallbackId]) {
            resolvedId = fallbackId;
        }
    }

    // Validate resolved ID exists in registry
    if (resolvedId && !registryState.index?.[resolvedId]) {
        resolvedId = null;
    }

    const previousType = resolvedId ? registryState.index?.[resolvedId]?.type : null;
    const finalSynopsis = lorebookEntryDeduplicate.synopsis || lorebookEntryLookup.synopsis || '';

    return { resolvedId, previousType, finalSynopsis };
}

/**
 * Executes the merge workflow for an existing entity
 * @param {string} resolvedId - The resolved entity ID
 * @param {any} normalizedEntry - The entry to merge
 * @param {string} targetType - The target entity type
 * @param {string|null} previousType - Previous type if changed
 * @param {string} finalSynopsis - Final synopsis text
 * @param {any} ctx - Processing context
 * @returns {Promise<boolean>} - True if merge succeeded, false otherwise
 */
async function executeMergeWorkflow(
    resolvedId /*: string */,
    normalizedEntry /*: any */,
    targetType /*: string */,
    previousType /*: ?string */,
    finalSynopsis /*: string */,
    ctx /*: any */
) /*: Promise<boolean> */ {
    const { lorebookName, existingEntriesMap, registryState, useQueue, results, typesToUpdate } = ctx;

    const record = registryState.index?.[resolvedId];
    const existingEntry = record ? existingEntriesMap.get(String(record.uid)) : null;

    if (!record || !existingEntry) {
        return false;
    }

    try {
        const mergeResult = await mergeLorebookEntry(
            lorebookName,
            existingEntry,
            normalizedEntry,
            { useQueue }
        );

        if (mergeResult?.success) {
            // Determine final comment/name after potential name resolution
            let finalComment = normalizedEntry.comment || existingEntry.comment || '';

            // If AI suggested a canonical name during merge, use it
            if (mergeResult.canonicalName && mergeResult.canonicalName.trim()) {
                const typeMatch = finalComment.match(/^([^-]+)-/);
                const typePrefix = typeMatch ? typeMatch[1] + '-' : '';
                finalComment = typePrefix + mergeResult.canonicalName.trim();
            }

            results.merged.push({ comment: finalComment, uid: existingEntry.uid, id: resolvedId });
            updateRegistryRecord(registryState, resolvedId, {
                uid: existingEntry.uid,
                type: targetType,
                name: finalComment,
                comment: finalComment,
                aliases: ensureStringArray(normalizedEntry.keys),
                synopsis: finalSynopsis
            });
            ctx.registryStateDirty = true;
            typesToUpdate.add(targetType);
            if (previousType && previousType !== targetType) {
                typesToUpdate.add(previousType);
            }
            return true;
        } else {
            results.failed.push({ comment: normalizedEntry.comment, error: mergeResult?.message || 'Merge failed' });
            return false;
        }
    } catch (err) {
        error?.(`Failed to merge entry: ${normalizedEntry.comment}`, err);
        results.failed.push({ comment: normalizedEntry.comment, error: err.message || 'Merge error' });
        return false;
    }
}

/**
 * Executes the create workflow for a new entity
 * @param {any} normalizedEntry - The entry to create
 * @param {string} targetType - The target entity type
 * @param {string} finalSynopsis - Final synopsis text
 * @param {any} ctx - Processing context
 * @returns {Promise<void>}
 */
async function executeCreateWorkflow(
    normalizedEntry /*: any */,
    targetType /*: string */,
    finalSynopsis /*: string */,
    ctx /*: any */
) /*: Promise<void> */ {
    const { lorebookName, existingEntries, existingEntriesMap, registryState, results, typesToUpdate } = ctx;

    try {
        const createdEntry = await addLorebookEntry(lorebookName, normalizedEntry);
        if (createdEntry) {
            const newId = assignEntityId(registryState, targetType);
            updateRegistryRecord(registryState, newId, {
                uid: createdEntry.uid,
                type: targetType,
                name: normalizedEntry.comment || createdEntry.comment || '',
                comment: normalizedEntry.comment || createdEntry.comment || '',
                aliases: ensureStringArray(normalizedEntry.keys),
                synopsis: finalSynopsis
            });
            ctx.registryStateDirty = true;
            typesToUpdate.add(targetType);
            results.created.push({ comment: normalizedEntry.comment, uid: createdEntry.uid, id: newId });
            existingEntries.push(createdEntry);
            existingEntriesMap.set(String(createdEntry.uid), createdEntry);
        } else {
            results.failed.push({ comment: normalizedEntry.comment, error: 'Failed to create entry' });
        }
    } catch (err) {
        error?.(`Failed to create entry: ${normalizedEntry.comment}`, err);
        results.failed.push({ comment: normalizedEntry.comment, error: err.message || 'Creation error' });
    }
}

async function handleLorebookEntry(normalizedEntry /*: any */, ctx /*: any */) /*: Promise<void> */ {
    const {
        existingEntriesMap,
        registryState,
        entityTypeDefs,
        entityTypeMap,
        settings,
        typeList,
    } = ctx;

    const registryListing = buildRegistryListing(registryState);
    const lorebookEntryLookup = await runLorebookEntryLookupStage(normalizedEntry, registryListing, typeList, settings);

    const { targetType } = resolveEntryType(normalizedEntry, lorebookEntryLookup, entityTypeMap, entityTypeDefs);

    const { candidateIds, lorebookEntryDeduplicate } = await buildCandidateListAndResolve(
        lorebookEntryLookup,
        registryState,
        existingEntriesMap,
        normalizedEntry,
        targetType,
        settings
    );

    const { resolvedId, previousType, finalSynopsis } = applyFallbackAndValidateIdentity(
        lorebookEntryDeduplicate,
        candidateIds,
        lorebookEntryLookup,
        registryState
    );

    if (resolvedId) {
        const merged = await executeMergeWorkflow(
            resolvedId,
            normalizedEntry,
            targetType,
            previousType,
            finalSynopsis,
            ctx
        );
        if (merged) {
            return;
        }
    }

    await executeCreateWorkflow(normalizedEntry, targetType, finalSynopsis, ctx);
}

/**
 * Initializes summary processing configuration
 * @param {any} summary - Summary to process
 * @param {any} options - Processing options
 * @returns {{useQueue: boolean, skipDuplicates: boolean, summaryId: string, entityTypeDefs: any[], entityTypeMap: Map}} - Config
 */
function initializeSummaryProcessing(summary /*: any */, options /*: any */) /*: any */ {
    const { useQueue = true, skipDuplicates = true } = options;
    const entityTypeDefs = getConfiguredEntityTypeDefinitions(extension_settings?.autoLorebooks?.entity_types);
    const entityTypeMap = createEntityTypeMap(entityTypeDefs);
    const summaryId = generateSummaryId(summary);

    return { useQueue, skipDuplicates, summaryId, entityTypeDefs, entityTypeMap };
}

/**
 * Checks if summary should be skipped due to duplicate
 * @param {string} summaryId - Summary ID
 * @param {boolean} skipDuplicates - Whether to skip duplicates
 * @returns {boolean} - True if should skip
 */
function shouldSkipDuplicate(summaryId /*: string */, skipDuplicates /*: boolean */) /*: boolean */ {
    if (skipDuplicates && isSummaryProcessed(summaryId)) {
        debug(`Summary already processed: ${summaryId}`);
        return true;
    }
    return false;
}

/**
 * Extracts and validates entities from summary
 * @param {any} summary - Summary to extract from
 * @returns {{valid: boolean, entries?: any[], error?: string}} - Extraction result
 */
function extractAndValidateEntities(summary /*: any */) /*: any */ {
    const lorebookData = extractLorebookData(summary);
    if (!lorebookData || !lorebookData.entries) {
        debug('No lorebook entries found in summary');
        return { valid: false, error: 'No lorebook data found' };
    }
    return { valid: true, entries: lorebookData.entries };
}

/**
 * Loads summary processing context
 * @param {any} config - Summary configuration
 * @returns {Promise<any>} - Context or error
 */
async function loadSummaryContext(config /*: any */) /*: Promise<any> */ {
    const lorebookName = getAttachedLorebook();
    if (!lorebookName) {
        error('No lorebook attached to process summary');
        return { error: 'No lorebook attached' };
    }

    const existingEntriesRaw = await getLorebookEntries(lorebookName);
    if (!existingEntriesRaw) {
        error('Failed to get existing entries');
        return { error: 'Failed to load lorebook' };
    }

    const existingEntries = existingEntriesRaw.filter(entry => !isRegistryEntry(entry));
    const existingEntriesMap /*: Map<string, any> */ = new Map();
    existingEntries.forEach(entry => {
        if (entry && entry.uid !== undefined) {
            existingEntriesMap.set(String(entry.uid), entry);
        }
    });

    const registryState = ensureRegistryState();

    // Build summarySettings from per-profile settings
    const summarySettings = {
        merge_connection_profile: getSummaryProcessingSetting('merge_connection_profile', ''),
        merge_completion_preset: getSummaryProcessingSetting('merge_completion_preset', ''),
        merge_prefill: getSummaryProcessingSetting('merge_prefill', ''),
        merge_prompt: getSummaryProcessingSetting('merge_prompt', ''),
        lorebook_entry_lookup_connection_profile: getSummaryProcessingSetting('lorebook_entry_lookup_connection_profile', ''),
        lorebook_entry_lookup_completion_preset: getSummaryProcessingSetting('lorebook_entry_lookup_completion_preset', ''),
        lorebook_entry_lookup_prefill: getSummaryProcessingSetting('lorebook_entry_lookup_prefill', ''),
        lorebook_entry_lookup_prompt: getSummaryProcessingSetting('lorebook_entry_lookup_prompt', ''),
        lorebook_entry_deduplicate_connection_profile: getSummaryProcessingSetting('lorebook_entry_deduplicate_connection_profile', ''),
        lorebook_entry_deduplicate_completion_preset: getSummaryProcessingSetting('lorebook_entry_deduplicate_completion_preset', ''),
        lorebook_entry_deduplicate_prefill: getSummaryProcessingSetting('lorebook_entry_deduplicate_prefill', ''),
        lorebook_entry_deduplicate_prompt: getSummaryProcessingSetting('lorebook_entry_deduplicate_prompt', ''),
        skip_duplicates: getSummaryProcessingSetting('skip_duplicates', true),
        enabled: getSummaryProcessingSetting('enabled', false),
    };

    const typeList = config.entityTypeDefs.map(def => def.name).filter(Boolean).join('|') || 'character';

    // Validate critical settings are loaded
    if (!summarySettings.lorebook_entry_lookup_prompt) {
        error('CRITICAL: Auto-Lorebooks lorebook_entry_lookup_prompt not found in profile settings');
        error('Lorebook Entry Lookup prompt type:', typeof summarySettings.lorebook_entry_lookup_prompt);
        error('Lorebook Entry Lookup prompt length:', summarySettings.lorebook_entry_lookup_prompt?.length || 0);
        toast('Auto-Lorebooks: Critical configuration error - lorebook entry lookup prompt not loaded! Check browser console for details.', 'error');
    }
    if (!summarySettings.lorebook_entry_deduplicate_prompt) {
        error('CRITICAL: Auto-Lorebooks lorebook_entry_deduplicate_prompt not found in profile settings');
        error('LorebookEntryDeduplicate prompt type:', typeof summarySettings.lorebook_entry_deduplicate_prompt);
        error('LorebookEntryDeduplicate prompt length:', summarySettings.lorebook_entry_deduplicate_prompt?.length || 0);
        toast('Auto-Lorebooks: Critical configuration error - lorebook entry deduplicate prompt not loaded! Check browser console for details.', 'error');
    }

    return {
        lorebookName,
        existingEntries,
        existingEntriesMap,
        registryState,
        summarySettings,
        typeList
    };
}

/**
 * Processes batch of entries
 * @param {any[]} entries - Entries to process
 * @param {any} context - Processing context
 * @param {any} config - Summary configuration
 * @returns {Promise<void>}
 */
async function processBatchEntries(entries /*: any */, context /*: any */, config /*: any */) /*: Promise<void> */ {
    for (const newEntryData of entries) {
        const normalizedEntry = normalizeEntryData(newEntryData);
        if (!normalizedEntry.type) {
            const fallback = typeof newEntryData.type === 'string' ? sanitizeEntityTypeName(newEntryData.type) : '';
            normalizedEntry.type = fallback || config.entityTypeDefs[0]?.name || 'character';
        }
        // Sequential execution required: lorebook entries must be processed in order
        // eslint-disable-next-line no-await-in-loop
        await handleLorebookEntry(normalizedEntry, context);
    }
}

/**
 * Finalizes summary processing
 * @param {any} context - Processing context
 * @param {string} summaryId - Summary ID
 * @returns {Promise<void>}
 */
async function finalizeSummaryProcessing(context /*: any */, summaryId /*: string */) /*: Promise<void> */ {
    await finalizeRegistryUpdates(context);
    markSummaryProcessed(summaryId);
}

/**
 * Builds summary result with user notifications
 * @param {any} results - Processing results
 * @param {number} totalEntries - Total entries processed
 * @returns {any} - Result object
 */
function buildSummaryResult(results /*: any */, totalEntries /*: number */) /*: any */ {
    const message = `Processed ${totalEntries} entries: ${results.created.length} created, ${results.merged.length} merged, ${results.failed.length} failed`;
    log(message);

    if (results.created.length > 0 || results.merged.length > 0) {
        toast(message, 'success');
    } else if (results.failed.length > 0) {
        toast(`Failed to process ${results.failed.length} entries`, 'warning');
    }

    return { success: true, results, message };
}

/**
 * Process a single summary object - extracts lorebook entries and creates/merges them
 * @param {Object} summary - Summary object to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processSummaryToLorebook(summary /*: any */, options /*: any */ = {}) /*: Promise<any> */ {
    try {
        // Initialize configuration
        const config = initializeSummaryProcessing(summary, options);

        // Check for duplicate
        if (shouldSkipDuplicate(config.summaryId, config.skipDuplicates)) {
            return { success: true, skipped: true, message: 'Already processed' };
        }

        // Extract and validate entities
        const extraction = extractAndValidateEntities(summary);
        if (!extraction.valid) {
            return { success: false, message: extraction.error };
        }

        // Load processing context
        const ctx = await loadSummaryContext(config);
        if (ctx.error) {
            return { success: false, message: ctx.error };
        }

        // Build full context
        const results /*: any */ = { created: [], merged: [], failed: [] };
        const typesToUpdate /*: Set<string> */ = new Set();
        const context = {
            lorebookName: ctx.lorebookName,
            existingEntries: ctx.existingEntries,
            existingEntriesMap: ctx.existingEntriesMap,
            registryState: ctx.registryState,
            entityTypeDefs: config.entityTypeDefs,
            entityTypeMap: config.entityTypeMap,
            settings: ctx.summarySettings,
            useQueue: config.useQueue,
            results,
            typesToUpdate,
            typeList: ctx.typeList,
            registryStateDirty: false
        };

        // Process batch
        await processBatchEntries(extraction.entries, context, config);

        // Finalize
        await finalizeSummaryProcessing(context, config.summaryId);

        // Build result
        return buildSummaryResult(results, extraction.entries.length);

    } catch (err) {
        error('Error processing summary to lorebook', err);
        return {
            success: false,
            message: err.message
        };
    }
}

/**
 * Finalizes registry updates after processing
 * @param {any} context - Processing context
 * @returns {Promise<void>}
 */
async function finalizeRegistryUpdates(context /*: any */) /*: Promise<void> */ {
    const { lorebookName, typesToUpdate, registryState } = context;

    if (typesToUpdate.size > 0 && typeof updateRegistryEntryContent === 'function') {
        for (const type of typesToUpdate) {
            const items = buildRegistryItemsForType(registryState, type);
            // Sequential execution required: registry entries must update in order
            // eslint-disable-next-line no-await-in-loop
            await updateRegistryEntryContent(lorebookName, type, items);
        }
    }

    if (context.registryStateDirty) {
        saveMetadata();
    }
}

/**
 * Process a single lorebook entry - creates or merges with existing entry
 * @param {Object} entryData - Single lorebook entry data
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
/**
 * Process multiple summaries - extracts lorebook entries from each and creates/merges them
 * @param {Array<Object>} summaries - Array of summary objects
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Combined results
 */
export async function processSummariesToLorebook(summaries /*: any */, options /*: any */ = {}) /*: Promise<any> */ {
    try {
        if (!Array.isArray(summaries) || summaries.length === 0) {
            return {
                success: false,
                message: 'No summaries provided'
            };
        }

        log(`Processing ${summaries.length} summaries to lorebook...`);

        const allResults = {
            processed: 0,
            skipped: 0,
            created: [],
            merged: [],
            failed: []
        };

        for (const summary of summaries) {
            // Sequential execution required: summaries must be processed in order
            // eslint-disable-next-line no-await-in-loop
            const result = await processSummaryToLorebook(summary, options);

            if (result.skipped) {
                allResults.skipped++;
            } else if (result.success) {
                allResults.processed++;
                if (result.results) {
                    allResults.created.push(...result.results.created);
                    allResults.merged.push(...result.results.merged);
                    allResults.failed.push(...result.results.failed);
                }
            }
        }

        const message = `Processed ${allResults.processed} summaries (${allResults.skipped} skipped): ${allResults.created.length} created, ${allResults.merged.length} merged, ${allResults.failed.length} failed`;
        log(message);
        toast(message, 'info');

        return {
            success: true,
            results: allResults,
            message
        };

    } catch (err) {
        error('Error processing summaries to lorebook', err);
        return {
            success: false,
            message: err.message
        };
    }
}

/**
 * Clear processed summaries tracker
 */
export function clearProcessedSummaries() /*: void */ {
    chat_metadata.auto_lorebooks_processed_summaries = [];
    saveMetadata();
    log('Cleared processed summaries tracker');
    toast('Cleared processed summaries tracker', 'info');
}

export default {
    initSummaryToLorebookProcessor,
    processSummaryToLorebook,
    processSummariesToLorebook,
    clearProcessedSummaries,
    isSummaryProcessed
};

// @flow
// summaryToLorebookProcessor.js - Extract lorebook entries from summary JSON objects and process them

// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { chat_metadata, saveMetadata, generateRaw } from './stubs/externals.js';
// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { extension_settings } from './stubs/externals.js';

import {
    getConfiguredEntityTypeDefinitions,
    createEntityTypeMap,
    applyEntityTypeFlagsToEntry,
    sanitizeEntityTypeName,
    normalizeEntityTypeDefinition,
    parseEntityTypeDefinition,
} from './entityTypes.js';

// Will be imported from index.js via barrel exports
let log /*: any */, debug /*: any */, error /*: any */, toast /*: any */;  // Utility functions - any type is legitimate
let getAttachedLorebook /*: any */, getLorebookEntries /*: any */, addLorebookEntry /*: any */;  // Lorebook functions - any type is legitimate
let mergeLorebookEntry /*: any */;  // Entry merger function - any type is legitimate
let updateRegistryEntryContent /*: any */;

const REGISTRY_PREFIX /*: string */ = '_registry_';

// Removed getSetting helper; no settings access needed here

/**
 * Initialize the summary-to-lorebook processor module
 */
// $FlowFixMe[signature-verification-failure]
export function initSummaryToLorebookProcessor(utils /*: any */, lorebookManagerModule /*: any */, entryMergerModule /*: any */) /*: void */ {
    // All parameters are any type - objects with various properties - legitimate use of any
    log = utils.log;
    debug = utils.debug;
    error = utils.error;
    toast = utils.toast;

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
 * Normalize entry data structure
 * @param {Object} entry - Entry data
 * @returns {Object} Normalized entry
 */
export function normalizeEntryData(entry /*: any */) /*: any */ {
    return {
        comment: entry.comment || entry.name || '',
        content: entry.content || entry.description || '',
        // Accept "keywords" (from prompt JSON), "keys" (internal), or "key" (WI format)
        keys: entry.keys || entry.keywords || entry.key || [],
        secondaryKeys: entry.secondaryKeys || entry.keysecondary || [],
        constant: entry.constant ?? false,
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
    const manager = window.getPresetManager?.();
    const currentPreset = manager?.selected_preset;
    const currentProfile = window.connection_profile;
    try {
        if (completionPreset && window.setPreset) {
            await window.setPreset(completionPreset);
        }
        if (connectionProfile && window.setConnectionProfile) {
            await window.setConnectionProfile(connectionProfile);
        }
        const response = await generateRaw({
            prompt,
            api: '',
            instructOverride: false,
            quietToLoud: false,
            prefill: prefill || ''
        });
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
    } finally {
        if (completionPreset && currentPreset && window.setPreset) {
            await window.setPreset(currentPreset);
        }
        if (connectionProfile && window.setConnectionProfile) {
            await window.setConnectionProfile(currentProfile);
        }
    }
}

function sanitizeTriageType(rawType /*: any */) /*: string */ {
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
 * Logs warning and throws error when triage prompt is missing
 * @param {any} normalizedEntry - The entry being processed
 * @throws {Error} - Always throws to fail the operation
 */
function handleMissingTriagePrompt(normalizedEntry /*: any */) /*: void */ {
    const entryName = normalizedEntry?.comment || normalizedEntry?.name || 'Unknown';
    error(`CRITICAL: Triage prompt is missing! Cannot process entry: ${entryName}`);
    error('Settings check - triage_prompt is missing or empty');
    toast(`Auto-Lorebooks: Triage prompt missing! Cannot process lorebook entries. Check extension settings.`, 'error');
    throw new Error(`Auto-Lorebooks configuration error: triage_prompt is required but missing. Cannot process entry: ${entryName}`);
}

export async function runTriageStage(
    normalizedEntry /*: any */,
    registryListing /*: string */,
    typeList /*: string */,
    settings /*: any */
) /*: Promise<{ type: string, synopsis: string, sameEntityIds: Array<string>, needsFullContextIds: Array<string> }> */ {
    const promptTemplate = settings?.triage_prompt || '';
    if (!promptTemplate) {
        handleMissingTriagePrompt(normalizedEntry);
        // Flow doesn't understand throw above never returns
        // $FlowFixMe[incompatible-return] - This code is unreachable because handleMissingTriagePrompt always throws
        return { type: '', synopsis: '', sameEntityIds: [], needsFullContextIds: [] };
    }
    const payload = buildNewEntryPayload(normalizedEntry);
    const prompt = promptTemplate
        .replace(/\{\{lorebook_entry_types\}\}/g, typeList)
        .replace(/\{\{new_entry\}\}/g, JSON.stringify(payload, null, 2))
        .replace(/\{\{candidate_registry\}\}/g, registryListing);

    const response = await runModelWithSettings(
        prompt,
        settings?.triage_prefill || '',
        settings?.triage_connection_profile || '',
        settings?.triage_completion_preset || '',
        'triage'
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

    const type = sanitizeTriageType(parsed.type) || normalizedEntry.type || '';
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
 * Checks if resolution stage should run
 * @param {any[]} candidateEntries - Candidate entries
 * @param {any} settings - Processing settings
 * @returns {boolean} - Whether to run resolution
 */
function shouldRunResolution(candidateEntries /*: any */, settings /*: any */) /*: boolean */ {
    if (!candidateEntries || candidateEntries.length === 0) {
        return false;
    }
    const promptTemplate = settings?.resolution_prompt || '';
    if (!promptTemplate) {
        error(`CRITICAL: Resolution prompt is missing! Cannot resolve ${candidateEntries.length} duplicate candidate(s).`);
        error('Settings check - resolution_prompt is missing or empty');
        toast(`Auto-Lorebooks: Resolution prompt missing! Cannot process lorebook entries with potential duplicates. Check extension settings.`, 'error');
        throw new Error(`Auto-Lorebooks configuration error: resolution_prompt is required when duplicate candidates exist, but it is missing. Found ${candidateEntries.length} candidate(s) that need resolution.`);
    }
    return true;
}

/**
 * Builds resolution prompt
 * @param {any} normalizedEntry - Entry to resolve
 * @param {string} triageSynopsis - Triage synopsis
 * @param {any[]} candidateEntries - Candidate entries
 * @param {string} singleType - Entity type
 * @param {any} settings - Settings
 * @returns {string} - Built prompt
 */
function buildResolutionPrompt(
    normalizedEntry /*: any */,
    triageSynopsis /*: string */,
    candidateEntries /*: any */,
    singleType /*: string */,
    settings /*: any */
) /*: string */ {
    const payload = buildNewEntryPayload(normalizedEntry);
    const promptTemplate = settings?.resolution_prompt || '';
    return promptTemplate
        .replace(/\{\{lorebook_entry_types\}\}/g, singleType || '')
        .replace(/\{\{new_entry\}\}/g, JSON.stringify(payload, null, 2))
        .replace(/\{\{triage_synopsis\}\}/g, triageSynopsis || '')
        .replace(/\{\{candidate_entries\}\}/g, JSON.stringify(candidateEntries, null, 2));
}

/**
 * Executes resolution LLM call
 * @param {string} prompt - Resolution prompt
 * @param {any} settings - Settings
 * @returns {Promise<string>} - LLM response
 */
async function executeResolutionLLMCall(prompt /*: string */, settings /*: any */) /*: Promise<?string> */ {
    return await runModelWithSettings(
        prompt,
        settings?.resolution_prefill || '',
        settings?.resolution_connection_profile || '',
        settings?.resolution_completion_preset || '',
        'resolution'
    );
}

/**
 * Parses resolution response
 * @param {string} response - LLM response
 * @param {string} fallbackSynopsis - Fallback synopsis
 * @returns {{resolvedId: string|null, synopsis: string}} - Parsed result
 */
function parseResolutionResponse(response /*: string */, fallbackSynopsis /*: string */) /*: any */ {
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

export async function runResolutionStage(
    normalizedEntry /*: any */,
    triageSynopsis /*: string */,
    candidateEntries /*: Array<any> */,
    singleType /*: string */,
    settings /*: any */
) /*: Promise<{ resolvedId: ?string, synopsis: string }> */ {
    if (!shouldRunResolution(candidateEntries, settings)) {
        return { resolvedId: null, synopsis: triageSynopsis || '' };
    }

    const prompt = buildResolutionPrompt(normalizedEntry, triageSynopsis, candidateEntries, singleType, settings);
    const response = await executeResolutionLLMCall(prompt, settings);

    if (!response) {
        return { resolvedId: null, synopsis: triageSynopsis || '' };
    }

    return parseResolutionResponse(response, triageSynopsis);
}

/**
 * Resolves and applies the entity type for a normalized entry
 * Handles type fallbacks and applies type-specific flags
 * @param {any} normalizedEntry - The entry to resolve type for
 * @param {any} triage - Triage result containing suggested type
 * @param {Map<string, any>} entityTypeMap - Map of entity type definitions
 * @param {Array<any>} entityTypeDefs - Array of all entity type definitions
 * @returns {{targetType: string, typeDef: any}} - Resolved type name and definition
 */
function resolveEntryType(
    normalizedEntry /*: any */,
    triage /*: any */,
    entityTypeMap /*: any */,
    entityTypeDefs /*: any */
) /*: any */ {
    let targetType = triage.type || normalizedEntry.type || '';
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
 * Builds candidate entry list and optionally runs resolution stage
 * @param {any} triage - Triage result with candidate IDs
 * @param {any} registryState - Current registry state
 * @param {Map<number, any>} existingEntriesMap - Map of existing entries by UID
 * @param {any} normalizedEntry - The entry being processed
 * @param {string} targetType - The resolved type
 * @param {any} settings - Processing settings
 * @returns {Promise<{candidateIds: string[], resolution: any}>} - Candidates and resolution result
 */
async function buildCandidateListAndResolve(
    triage /*: any */,
    registryState /*: any */,
    existingEntriesMap /*: any */,
    normalizedEntry /*: any */,
    targetType /*: string */,
    settings /*: any */
) /*: Promise<any> */ {
    const candidateIdSet /*: Set<string> */ = new Set();
    triage.sameEntityIds.forEach(id => candidateIdSet.add(String(id)));
    triage.needsFullContextIds.forEach(id => candidateIdSet.add(String(id)));
    const candidateIds = Array.from(candidateIdSet).filter(id => registryState.index?.[id]);

    let resolution = null;
    if (candidateIds.length > 0) {
        const candidateEntries = buildCandidateEntriesData(candidateIds, registryState, existingEntriesMap);
        if (candidateEntries.length > 0) {
            resolution = await runResolutionStage(normalizedEntry, triage.synopsis || '', candidateEntries, targetType, settings);
        }
    }

    if (!resolution) {
        resolution = { resolvedId: null, synopsis: triage.synopsis || '' };
    }

    return { candidateIds, resolution };
}

/**
 * Applies fallback logic and validates the resolved entity ID
 * @param {any} resolution - Initial resolution result
 * @param {string[]} candidateIds - List of candidate IDs
 * @param {any} triage - Triage result
 * @param {any} registryState - Current registry state
 * @returns {{resolvedId: string|null, previousType: string|null, finalSynopsis: string}} - Final identity resolution
 */
function applyFallbackAndValidateIdentity(
    resolution /*: any */,
    candidateIds /*: any */,
    triage /*: any */,
    registryState /*: any */
) /*: any */ {
    let resolvedId = resolution.resolvedId;

    // Single candidate fallback: if only one candidate and no needsFullContext, use it
    if (!resolvedId && candidateIds.length === 1 && (!triage.needsFullContextIds || triage.needsFullContextIds.length === 0)) {
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
    const finalSynopsis = resolution.synopsis || triage.synopsis || '';

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
            results.merged.push({ comment: normalizedEntry.comment, uid: existingEntry.uid, id: resolvedId });
            updateRegistryRecord(registryState, resolvedId, {
                uid: existingEntry.uid,
                type: targetType,
                name: normalizedEntry.comment || existingEntry.comment || '',
                comment: normalizedEntry.comment || existingEntry.comment || '',
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
    const triage = await runTriageStage(normalizedEntry, registryListing, typeList, settings);

    const { targetType } = resolveEntryType(normalizedEntry, triage, entityTypeMap, entityTypeDefs);

    const { candidateIds, resolution } = await buildCandidateListAndResolve(
        triage,
        registryState,
        existingEntriesMap,
        normalizedEntry,
        targetType,
        settings
    );

    const { resolvedId, previousType, finalSynopsis } = applyFallbackAndValidateIdentity(
        resolution,
        candidateIds,
        triage,
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
    const summarySettings = extension_settings?.autoLorebooks?.summary_processing || {};
    const typeList = config.entityTypeDefs.map(def => def.name).filter(Boolean).join('|') || 'character';

    // Validate critical settings are loaded
    if (!summarySettings.triage_prompt) {
        error('CRITICAL: Auto-Lorebooks triage_prompt not found in extension_settings.autoLorebooks.summary_processing');
        error('extension_settings path check:', {
            hasAutoLorebooks: !!extension_settings?.autoLorebooks,
            hasSummaryProcessing: !!extension_settings?.autoLorebooks?.summary_processing,
            summaryProcessingKeys: extension_settings?.autoLorebooks?.summary_processing ? Object.keys(extension_settings.autoLorebooks.summary_processing) : [],
            triagePromptType: typeof summarySettings.triage_prompt,
            triagePromptLength: summarySettings.triage_prompt?.length || 0
        });
        error('Full summary_processing object:', summarySettings);
        toast('Auto-Lorebooks: Critical configuration error - triage prompt not loaded! Check browser console for details.', 'error');
    }
    if (!summarySettings.resolution_prompt) {
        error('CRITICAL: Auto-Lorebooks resolution_prompt not found in extension_settings.autoLorebooks.summary_processing');
        error('Resolution prompt type:', typeof summarySettings.resolution_prompt);
        error('Resolution prompt length:', summarySettings.resolution_prompt?.length || 0);
        toast('Auto-Lorebooks: Critical configuration error - resolution prompt not loaded! Check browser console for details.', 'error');
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
 * Validates entry input data
 * @param {any} entryData - Entry data to validate
 * @returns {{valid: boolean, error?: string}} - Validation result
 */
function validateEntryInput(entryData /*: any */) /*: any */ {
    if (!entryData) {
        return { valid: false, error: 'No entry data provided' };
    }
    return { valid: true };
}

/**
 * Loads processing configuration including entity types and lorebook name
 * @param {any} _options - Processing options (reserved for future use)
 * @returns {{lorebookName: string|null, entityTypeDefs: any[], entityTypeMap: Map<string, any>}} - Configuration
 */
function loadProcessingConfig(_options /*: any */ = {}) /*: any */ {
    const lorebookName = getAttachedLorebook();
    if (!lorebookName) {
        error('No lorebook attached to process entry');
        return { lorebookName: null, entityTypeDefs: [], entityTypeMap: new Map() };
    }

    const entityTypeDefs = getConfiguredEntityTypeDefinitions(extension_settings?.autoLorebooks?.entity_types);
    const entityTypeMap = createEntityTypeMap(entityTypeDefs);

    return { lorebookName, entityTypeDefs, entityTypeMap };
}

/**
 * Normalizes and types the entry data
 * @param {any} entryData - Raw entry data
 * @param {any[]} entityTypeDefs - Entity type definitions
 * @param {Map<string, any>} entityTypeMap - Entity type map
 * @returns {any} - Normalized entry
 */
function normalizeAndTypeEntry(entryData /*: any */, entityTypeDefs /*: any */, entityTypeMap /*: any */) /*: any */ {
    const normalizedEntry = normalizeEntryData(entryData);
    let typeName = normalizedEntry.type || (typeof entryData.type === 'string' ? sanitizeEntityTypeName(entryData.type) : '');
    if (!typeName) {
        typeName = entityTypeDefs[0]?.name || 'character';
    }
    const initialTypeDef = entityTypeMap.get(typeName) || null;
    normalizedEntry.type = initialTypeDef ? initialTypeDef.name : typeName;
    applyEntityTypeFlagsToEntry(normalizedEntry, initialTypeDef);
    debug(`Processing lorebook entry: ${normalizedEntry.comment}`);
    return normalizedEntry;
}

/**
 * Builds the processing context object
 * @param {string} lorebookName - Name of the lorebook
 * @param {any} normalizedEntry - Normalized entry
 * @param {any[]} existingEntries - Existing entries
 * @param {Map<string, any>} existingEntriesMap - Map of existing entries
 * @param {any} registryState - Registry state
 * @param {any[]} entityTypeDefs - Entity type definitions
 * @param {Map<string, any>} entityTypeMap - Entity type map
 * @param {boolean} useQueue - Whether to use queue
 * @returns {any} - Processing context
 */
function buildProcessingContext(
    lorebookName /*: string */,
    normalizedEntry /*: any */,
    existingEntries /*: any */,
    existingEntriesMap /*: any */,
    registryState /*: any */,
    entityTypeDefs /*: any */,
    entityTypeMap /*: any */,
    useQueue /*: boolean */
) /*: any */ {
    const summarySettings = extension_settings?.autoLorebooks?.summary_processing || {};
    const typesToUpdate /*: Set<string> */ = new Set();
    const typeList = entityTypeDefs.map(def => def.name).filter(Boolean).join('|') || 'character';
    const results /*: any */ = { created: [], merged: [], failed: [] };

    return {
        lorebookName,
        existingEntries,
        existingEntriesMap,
        registryState,
        entityTypeDefs,
        entityTypeMap,
        settings: summarySettings,
        useQueue,
        results,
        typesToUpdate,
        typeList,
        registryStateDirty: false
    };
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
 * Builds the processing result from context
 * @param {any} context - Processing context
 * @param {any} normalizedEntry - Normalized entry
 * @returns {any} - Processing result
 */
function buildProcessingResult(context /*: any */, normalizedEntry /*: any */) /*: any */ {
    const { results } = context;

    if (results.merged.length > 0) {
        const merged = results.merged[0];
        return {
            success: true,
            action: 'merged',
            comment: normalizedEntry.comment,
            uid: merged.uid,
            id: merged.id
        };
    }

    if (results.created.length > 0) {
        const created = results.created[0];
        return {
            success: true,
            action: 'created',
            comment: normalizedEntry.comment,
            uid: created.uid,
            id: created.id
        };
    }

    if (results.failed.length > 0) {
        const failure = results.failed[0];
        return {
            success: false,
            message: failure.error || 'Failed to process entry',
            comment: normalizedEntry.comment
        };
    }

    return {
        success: true,
        action: 'skipped',
        comment: normalizedEntry.comment
    };
}

/**
 * Process a single lorebook entry - creates or merges with existing entry
 * @param {Object} entryData - Single lorebook entry data
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processSingleLorebookEntry(entryData /*: any */, options /*: any */ = {}) /*: Promise<any> */ {
    try {
        const { useQueue = false } = options;

        // Validate input
        const validation = validateEntryInput(entryData);
        if (!validation.valid) {
            return { success: false, message: validation.error };
        }

        // Load configuration
        const config = loadProcessingConfig(options);
        if (!config.lorebookName) {
            return { success: false, message: 'No lorebook attached' };
        }

        // Normalize entry
        const normalizedEntry = normalizeAndTypeEntry(entryData, config.entityTypeDefs, config.entityTypeMap);

        // Get existing entries
        const existingEntriesRaw = await getLorebookEntries(config.lorebookName);
        if (!existingEntriesRaw) {
            error('Failed to get existing entries');
            return { success: false, message: 'Failed to load lorebook' };
        }

        const existingEntries = existingEntriesRaw.filter(entry => !isRegistryEntry(entry));
        const existingEntriesMap /*: Map<string, any> */ = new Map();
        existingEntries.forEach(entry => {
            if (entry && entry.uid !== undefined) {
                existingEntriesMap.set(String(entry.uid), entry);
            }
        });

        const registryState = ensureRegistryState();

        // Build context
        const context = buildProcessingContext(
            config.lorebookName,
            normalizedEntry,
            existingEntries,
            existingEntriesMap,
            registryState,
            config.entityTypeDefs,
            config.entityTypeMap,
            useQueue
        );

        // Process entry
        await handleLorebookEntry(normalizedEntry, context);

        // Finalize updates
        await finalizeRegistryUpdates(context);

        // Build result
        return buildProcessingResult(context, normalizedEntry);

    } catch (err) {
        error('Error processing single lorebook entry', err);
        return {
            success: false,
            message: err.message,
            comment: entryData?.comment || entryData?.name || 'Unknown'
        };
    }
}

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
    processSingleLorebookEntry,
    processSummariesToLorebook,
    clearProcessedSummaries,
    isSummaryProcessed
};

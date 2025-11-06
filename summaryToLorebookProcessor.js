
// summaryToLorebookProcessor.js - Extract lorebook entries from summary JSON objects and process them

import { chat_metadata, saveMetadata } from '../../../../script.js';
// Use wrapped version from our interceptor
import { wrappedGenerateRaw as generateRaw } from './generateRawInterceptor.js';
import { extension_settings } from '../../../extensions.js';
import { loadPresetPrompts } from './presetPromptLoader.js';

import {
  getConfiguredEntityTypeDefinitions,
  createEntityTypeMap,
  applyEntityTypeFlagsToEntry,
  sanitizeEntityTypeName,
  normalizeEntityTypeDefinition,
  parseEntityTypeDefinition } from
'./entityTypes.js';

// Will be imported from index.js via barrel exports
let log , debug , error , toast ; // Utility functions - any type is legitimate
let getAttachedLorebook , getLorebookEntries , addLorebookEntry ; // Lorebook functions - any type is legitimate
let mergeLorebookEntry ; // Entry merger function - any type is legitimate
let updateRegistryEntryContent ;
let withConnectionSettings ; // Connection settings management - any type is legitimate
let get_settings , set_settings ; // Profile settings functions - any type is legitimate

const REGISTRY_PREFIX  = '_registry_';

// Removed getSetting helper; no settings access needed here

export function initSummaryToLorebookProcessor(utils , lorebookManagerModule , entryMergerModule , connectionSettingsManager , settingsManager ) {
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

function getSummaryProcessingSetting(key , defaultValue  = null) {
  try {
    // ALL summary processing settings are per-profile
    const settingKey = `auto_lorebooks_summary_${key}`;
    return get_settings(settingKey) ?? defaultValue;
  } catch (err) {
    error("Error getting summary processing setting", err);
    return defaultValue;
  }
}

// eslint-disable-next-line no-unused-vars
function setSummaryProcessingSetting(key , value ) {
  try {
    // ALL summary processing settings are per-profile
    const settingKey = `auto_lorebooks_summary_${key}`;
    set_settings(settingKey, value);
  } catch (err) {
    error("Error setting summary processing setting", err);
  }
}

function getProcessedSummaries() {
  if (!chat_metadata.auto_lorebooks_processed_summaries) {
    chat_metadata.auto_lorebooks_processed_summaries = [];
  }
  return new Set(chat_metadata.auto_lorebooks_processed_summaries);
}

function markSummaryProcessed(summaryId ) {
  const processed = getProcessedSummaries();
  processed.add(summaryId);
  chat_metadata.auto_lorebooks_processed_summaries = Array.from(processed);
  saveMetadata();
  debug(`Marked summary as processed: ${summaryId}`);
}

function isSummaryProcessed(summaryId ) {
  return getProcessedSummaries().has(summaryId);
}

function generateSummaryId(summary ) {
  // Use timestamp + content hash as ID
  const timestamp = summary.timestamp || Date.now();
  const content = JSON.stringify(summary.lorebook || summary);
  const hash = simpleHash(content);
  return `summary_${timestamp}_${hash}`;
}

function simpleHash(str ) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

function extractLorebookData(summary ) {
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

function buildEntryName(entry ) {
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

export function normalizeEntryData(entry ) {
  const comment = buildEntryName(entry);
  let content = entry.content || entry.description || '';

  // Inject type-EntityName prefix into PList content
  // Replace [Type: or [EntityName: with [type-EntityName: to match the title/comment
  if (content && content.trim().startsWith('[')) {
    const colonIndex = content.indexOf(':');
    if (colonIndex > 0) {
      // Replace everything between [ and : with the comment (type-EntityName)
      content = `[${comment}${content.substring(colonIndex)}`;
    }
  }

  return {
    comment,
    content,
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

function isRegistryEntry(entry ) {
  const comment = entry?.comment;
  return typeof comment === 'string' && comment.startsWith(REGISTRY_PREFIX);
}

export function ensureRegistryState() {
  const metadata  = chat_metadata;
  if (!metadata.auto_lorebooks || typeof metadata.auto_lorebooks !== 'object') {
    metadata.auto_lorebooks = {};
  }
  const autoLorebooks  = metadata.auto_lorebooks;
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

function buildTypePrefix(type ) {
  const base = sanitizeEntityTypeName(type) || 'type';
  if (base.length >= 4) return base.slice(0, 4);
  return base.padEnd(4, 'x');
}

export function assignEntityId(state , type ) {
  const counters = state.counters || {};
  const current = Number(counters[type]) || 0;
  const next = current + 1;
  counters[type] = next;
  const prefix = buildTypePrefix(type);
  return `${prefix}_${String(next).padStart(4, '0')}`;
}

export function ensureStringArray(value ) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  return [];
}

export function updateRegistryRecord(state , id , updates ) {
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

export function buildRegistryListing(state ) {
  const grouped  = {};
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
  types.sort().forEach((type) => {
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

export function buildRegistryItemsForType(state , type ) {
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

export function buildCandidateEntriesData(candidateIds , registryState , existingEntriesMap ) {
  const data = [];
  candidateIds.forEach((id) => {
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

function buildNewEntryPayload(entry ) {
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
prompt ,
prefill ,
connectionProfile ,
completionPreset ,
label ,
entryComment , // Optional entry comment for context suffix
include_preset_prompts = false
) {
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

    // Metadata injection now handled by global generateRaw interceptor
    // Use centralized connection settings management
    const response = await withConnectionSettings(
      connectionProfile,
      completionPreset,
      // eslint-disable-next-line complexity
      async () => {
        // Set operation context for ST_METADATA
        const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
        if (entryComment) {
          setOperationSuffix(`-${entryComment}`);
        }

        try {
          // Build prompt input - either string (current behavior) or messages array (with preset prompts)
          let prompt_input;

          console.log('[runModelWithSettings] label:', label);
          console.log('[runModelWithSettings] include_preset_prompts:', include_preset_prompts);
          console.log('[runModelWithSettings] completionPreset (param):', completionPreset);

          // If preset_name is empty, use the currently active preset (like summarization.js does)
          const { get_current_preset } = await import('./index.js');
          const effectivePresetName = completionPreset || (include_preset_prompts ? get_current_preset() : '');

          console.log('[runModelWithSettings] effectivePresetName:', effectivePresetName);
          console.log('[runModelWithSettings] Condition check (include && preset):', include_preset_prompts && effectivePresetName);

          if (include_preset_prompts && effectivePresetName) {
            // Load preset prompts and get preset settings
            const { getPresetManager } = await import('../../../preset-manager.js');
            const presetManager = getPresetManager('openai');
            const preset = presetManager?.getCompletionPresetByName(effectivePresetName);
            const presetMessages = await loadPresetPrompts(effectivePresetName);

            console.log('[runModelWithSettings] presetMessages loaded:', presetMessages?.length || 0, 'prompts');
            if (presetMessages && presetMessages.length > 0) {
              console.log('[runModelWithSettings] First preset prompt role:', presetMessages[0]?.role);
              console.log('[runModelWithSettings] First preset prompt content length:', presetMessages[0]?.content?.length || 0);
            }

            // Use extension's prefill if set, otherwise use preset's prefill
            const effectivePrefill = prefill || preset?.assistant_prefill || '';
            console.log('[runModelWithSettings] effectivePrefill source:', prefill ? 'extension' : (preset?.assistant_prefill ? 'preset' : 'empty'));

            // Only use messages array if we actually got preset prompts
            if (presetMessages && presetMessages.length > 0) {
              console.log('[runModelWithSettings] Using messages array format with preset prompts');

              // Build messages array: preset prompts FIRST, then extension prompt
              prompt_input = [
                ...presetMessages,
                { role: 'user', content: prompt }
              ];

              return await generateRaw({
                prompt: prompt_input,
                instructOverride: false,  // Let preset prompts control formatting
                quietToLoud: false,
                prefill: effectivePrefill
              });
            } else {
              console.warn('[runModelWithSettings] include_preset_prompts enabled but no preset prompts loaded, falling back to string format');
              // Fall back to string format
              return await generateRaw({
                prompt: prompt,
                instructOverride: false,
                quietToLoud: false,
                prefill: prefill || ''
              });
            }
          } else {
            console.log('[runModelWithSettings] Using string format (include_preset_prompts not enabled or no preset)');
            // Current behavior - string prompt only
            return await generateRaw({
              prompt: prompt,
              instructOverride: false,
              quietToLoud: false,
              prefill: prefill || ''
            });
          }
        } finally {
          clearOperationSuffix();
        }
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

function sanitizeLorebookEntryLookupType(rawType ) {
  if (!rawType || typeof rawType !== 'string') return '';
  const normalized = normalizeEntityTypeDefinition(rawType);
  const parsed = parseEntityTypeDefinition(normalized);
  return parsed.name || sanitizeEntityTypeName(rawType);
}

// parseJsonSafe REMOVED - now using centralized extractJsonFromResponse from utils.js

function handleMissingLorebookEntryLookupPrompt(normalizedEntry ) {
  const entryName = normalizedEntry?.comment || normalizedEntry?.name || 'Unknown';
  error(`CRITICAL: Lorebook Entry Lookup prompt is missing! Cannot process entry: ${entryName}`);
  error('Settings check - lorebook_entry_lookup_prompt is missing or empty');
  toast(`Auto-Lorebooks: Lorebook Entry Lookup prompt missing! Cannot process lorebook entries. Check extension settings.`, 'error');
  throw new Error(`Auto-Lorebooks configuration error: lorebook_entry_lookup_prompt is required but missing. Cannot process entry: ${entryName}`);
}

export async function runLorebookEntryLookupStage(
normalizedEntry ,
registryListing ,
typeList ,
settings )
{
  const promptTemplate = settings?.lorebook_entry_lookup_prompt || '';
  if (!promptTemplate) {
    handleMissingLorebookEntryLookupPrompt(normalizedEntry);
    // Flow doesn't understand throw above never returns
    return { type: '', synopsis: '', sameEntityIds: [], needsFullContextIds: [] };
  }
  const payload = buildNewEntryPayload(normalizedEntry);
  const prompt = promptTemplate.
  replace(/\{\{lorebook_entry_types\}\}/g, typeList).
  replace(/\{\{new_entry\}\}/g, JSON.stringify(payload, null, 2)).
  replace(/\{\{candidate_registry\}\}/g, registryListing);

  const response = await runModelWithSettings(
    prompt,
    settings?.lorebook_entry_lookup_prefill || '',
    settings?.lorebook_entry_lookup_connection_profile || '',
    settings?.lorebook_entry_lookup_completion_preset || '',
    'lorebook_entry_lookup',
    normalizedEntry.comment, // Pass comment for context suffix
    settings?.lorebook_entry_lookup_include_preset_prompts || false
  );

  // Parse JSON using centralized helper (doesn't throw, uses try-catch internally)
  let parsed;
  try {
    const { extractJsonFromResponse } = await import('./utils.js');
    parsed = extractJsonFromResponse(response, {
      requiredFields: ['type'],
      context: 'lorebook entry lookup'
    });
  } catch (err) {
    // If parsing failed, return default structure
    debug?.('Failed to parse lorebook entry lookup response:', err);
    return {
      type: normalizedEntry.type || '',
      synopsis: '',
      sameEntityIds: [],
      needsFullContextIds: []
    };
  }

  const type = sanitizeLorebookEntryLookupType(parsed.type) || normalizedEntry.type || '';
  const sameIds = ensureStringArray(parsed.sameEntityIds).map((id) => String(id));
  const needsIds = ensureStringArray(parsed.needsFullContextIds).map((id) => String(id));
  const synopsis = typeof parsed.synopsis === 'string' ? parsed.synopsis.trim() : '';

  return {
    type,
    synopsis,
    sameEntityIds: sameIds,
    needsFullContextIds: needsIds
  };
}

function shouldRunLorebookEntryDeduplicate(candidateEntries , settings ) {
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

function buildLorebookEntryDeduplicatePrompt(
normalizedEntry ,
lorebookEntryLookupSynopsis ,
candidateEntries ,
singleType ,
settings )
{
  const payload = buildNewEntryPayload(normalizedEntry);
  const promptTemplate = settings?.lorebook_entry_deduplicate_prompt || '';
  return promptTemplate.
  replace(/\{\{lorebook_entry_types\}\}/g, singleType || '').
  replace(/\{\{new_entry\}\}/g, JSON.stringify(payload, null, 2)).
  replace(/\{\{lorebook_entry_lookup_synopsis\}\}/g, lorebookEntryLookupSynopsis || '').
  replace(/\{\{candidate_entries\}\}/g, JSON.stringify(candidateEntries, null, 2));
}

async function executeLorebookEntryDeduplicateLLMCall(prompt , settings , entryComment ) {
  return await runModelWithSettings(
    prompt,
    settings?.lorebook_entry_deduplicate_prefill || '',
    settings?.lorebook_entry_deduplicate_connection_profile || '',
    settings?.lorebook_entry_deduplicate_completion_preset || '',
    'lorebookEntryDeduplicate',
    entryComment, // Pass comment for context suffix
    settings?.lorebook_entry_deduplicate_include_preset_prompts || false
  );
}

async function parseLorebookEntryDeduplicateResponse(response , fallbackSynopsis ) {
  // Parse JSON using centralized helper
  let parsed;
  try {
    const { extractJsonFromResponse } = await import('./utils.js');
    parsed = extractJsonFromResponse(response, {
      requiredFields: ['resolvedId'],
      context: 'lorebook entry deduplication'
    });
  } catch (err) {
    // If parsing failed, return default structure
    debug?.('Failed to parse lorebook entry deduplication response:', err);
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

  const synopsis = typeof parsed.synopsis === 'string' && parsed.synopsis.trim().length > 0 ?
  parsed.synopsis.trim() :
  fallbackSynopsis || '';

  return { resolvedId: resolvedId ? String(resolvedId) : null, synopsis };
}

export async function runLorebookEntryDeduplicateStage(
normalizedEntry ,
lorebookEntryLookupSynopsis ,
candidateEntries ,
singleType ,
settings )
{
  if (!shouldRunLorebookEntryDeduplicate(candidateEntries, settings)) {
    return { resolvedId: null, synopsis: lorebookEntryLookupSynopsis || '' };
  }

  const prompt = buildLorebookEntryDeduplicatePrompt(normalizedEntry, lorebookEntryLookupSynopsis, candidateEntries, singleType, settings);
  const response = await executeLorebookEntryDeduplicateLLMCall(prompt, settings, normalizedEntry.comment);

  if (!response) {
    return { resolvedId: null, synopsis: lorebookEntryLookupSynopsis || '' };
  }

  return await parseLorebookEntryDeduplicateResponse(response, lorebookEntryLookupSynopsis);
}

function resolveEntryType(
normalizedEntry ,
lorebookEntryLookup ,
entityTypeMap ,
entityTypeDefs )
{
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

async function buildCandidateListAndResolve(
lorebookEntryLookup ,
registryState ,
existingEntriesMap ,
normalizedEntry ,
targetType ,
settings )
{
  const candidateIdSet  = new Set();
  lorebookEntryLookup.sameEntityIds.forEach((id) => candidateIdSet.add(String(id)));
  lorebookEntryLookup.needsFullContextIds.forEach((id) => candidateIdSet.add(String(id)));
  const candidateIds = Array.from(candidateIdSet).filter((id) => registryState.index?.[id]);

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

function applyFallbackAndValidateIdentity(
lorebookEntryDeduplicate ,
candidateIds ,
lorebookEntryLookup ,
registryState )
{
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

async function executeMergeWorkflow(
resolvedId ,
normalizedEntry ,
targetType ,
previousType ,
finalSynopsis ,
ctx )
{
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

async function executeCreateWorkflow(
normalizedEntry ,
targetType ,
finalSynopsis ,
ctx )
{
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

async function handleLorebookEntry(normalizedEntry , ctx ) {
  const {
    existingEntriesMap,
    registryState,
    entityTypeDefs,
    entityTypeMap,
    settings,
    typeList
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

function initializeSummaryProcessing(summary , options ) {
  const { useQueue = true, skipDuplicates = true } = options;
  const entityTypeDefs = getConfiguredEntityTypeDefinitions(extension_settings?.autoLorebooks?.entity_types);
  const entityTypeMap = createEntityTypeMap(entityTypeDefs);
  const summaryId = generateSummaryId(summary);

  return { useQueue, skipDuplicates, summaryId, entityTypeDefs, entityTypeMap };
}

function shouldSkipDuplicate(summaryId , skipDuplicates ) {
  if (skipDuplicates && isSummaryProcessed(summaryId)) {
    debug(`Summary already processed: ${summaryId}`);
    return true;
  }
  return false;
}

function extractAndValidateEntities(summary ) {
  const lorebookData = extractLorebookData(summary);
  if (!lorebookData || !lorebookData.entries) {
    debug('No lorebook entries found in summary');
    return { valid: false, error: 'No lorebook data found' };
  }
  return { valid: true, entries: lorebookData.entries };
}

async function loadSummaryContext(config ) {
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

  const existingEntries = existingEntriesRaw.filter((entry) => !isRegistryEntry(entry));
  const existingEntriesMap  = new Map();
  existingEntries.forEach((entry) => {
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
    enabled: getSummaryProcessingSetting('enabled', false)
  };

  const typeList = config.entityTypeDefs.map((def) => def.name).filter(Boolean).join('|') || 'character';

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

async function processBatchEntries(entries , context , config ) {
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

async function finalizeSummaryProcessing(context , summaryId ) {
  await finalizeRegistryUpdates(context);
  markSummaryProcessed(summaryId);
}

function buildSummaryResult(results , totalEntries ) {
  const message = `Processed ${totalEntries} entries: ${results.created.length} created, ${results.merged.length} merged, ${results.failed.length} failed`;
  log(message);

  if (results.created.length > 0 || results.merged.length > 0) {
    toast(message, 'success');
  } else if (results.failed.length > 0) {
    toast(`Failed to process ${results.failed.length} entries`, 'warning');
  }

  return { success: true, results, message };
}

export async function processSummaryToLorebook(summary , options  = {}) {
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
    const results  = { created: [], merged: [], failed: [] };
    const typesToUpdate  = new Set();
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

async function finalizeRegistryUpdates(context ) {
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

export async function processSummariesToLorebook(summaries , options  = {}) {
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

export function clearProcessedSummaries() {
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
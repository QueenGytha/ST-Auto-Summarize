
// recapToLorebookProcessor.js - Extract lorebook entries from recap JSON objects and process them

import { chat_metadata, saveMetadata, name1 } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

import {
  getEntityTypeDefinitionsFromSettings,
  createEntityTypeMap,
  applyEntityTypeFlagsToEntry,
  sanitizeEntityTypeName,
  normalizeEntityTypeDefinition,
  parseEntityTypeDefinition } from
'./entityTypes.js';
import { getEntryDefaultsFromSettings } from './entryDefaults.js';

import { SUBSYSTEM } from './index.js';
import { buildAllMacroParams, substitute_params } from './macros/index.js';

import {
  FULL_COMPLETION_PERCENTAGE,
  MIN_ENTITY_SECTIONS } from './constants.js';

// Will be imported from index.js via barrel exports
let log , debug , error , toast ; // Utility functions - any type is legitimate
let getAttachedLorebook , getLorebookEntries , addLorebookEntry , modifyLorebookEntry ; // Lorebook functions - any type is legitimate
let mergeLorebookEntry ; // Entry merger function - any type is legitimate
let updateRegistryEntryContent ;

const REGISTRY_PREFIX  = '_registry_';

/**
 * Check if a UID string is meaningful (non-empty and not stringified null/undefined)
 * @param {string} uid - The UID string to check
 * @returns {boolean} True if UID is meaningful and should be validated
 */
function isMeaningfulUid(uid) {
  return uid && uid !== 'null' && uid !== 'undefined';
}

// Removed getSetting helper; no settings access needed here

export function initRecapToLorebookProcessor(utils , lorebookManagerModule , entryMergerModule ) {
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
    modifyLorebookEntry = lorebookManagerModule.modifyLorebookEntry;
    updateRegistryEntryContent = lorebookManagerModule.updateRegistryEntryContent;
  }

  // Import entry merger function
  if (entryMergerModule) {
    mergeLorebookEntry = entryMergerModule.mergeLorebookEntry;
  }
}

function extractLorebookData(recap ) {
  try {
    // Check if recap has setting_lore (new canonical field)
    if (recap.setting_lore && Array.isArray(recap.setting_lore)) {
      debug('Found setting_lore array in recap');
      return { entries: recap.setting_lore };
    }

    // No legacy support

    // Check if recap has a lorebook property (singular - legacy format)
    if (recap.lorebook) {
      debug('Found lorebook property in recap');
      return recap.lorebook;
    }

    // Check if recap has entries array directly
    if (recap.entries && Array.isArray(recap.entries)) {
      debug('Found entries array in recap');
      return { entries: recap.entries };
    }

    // Check if the entire recap is lorebook data
    if (recap.comment || recap.content || recap.keys) {
      debug('Recap appears to be a single entry');
      return { entries: [recap] };
    }

    debug('No lorebook data found in recap');
    return null;

  } catch (err) {
    error('Error extracting lorebook data from recap', err);
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

const POSSESSIVE_SUFFIX_LENGTH = 2;
const MIN_WORD_LENGTH_FOR_PLURAL = 3;

function singularize(token) {
  try {
    if (!token) {return token;}
    // very light singularization for simple possessives/plurals
    if (token.endsWith("'s")) {return token.slice(0, -POSSESSIVE_SUFFIX_LENGTH);}
    if (token.endsWith("'s")) {return token.slice(0, -POSSESSIVE_SUFFIX_LENGTH);}
    if (token.endsWith('s') && token.length > MIN_WORD_LENGTH_FOR_PLURAL) {return token.slice(0, -1);}
    return token;
  } catch { return token; }
}

// Helper: normalize string to lowercase and trim
const norm = (s) => String(s).toLowerCase().trim();
// Helper: replace hyphens with spaces
const dehyphen = (s) => s.replace(/[–—-]+/g, ' ');
// Helper: remove apostrophes
const deapos = (s) => s.replace(/['']/g, '');


const MAX_KEYWORDS = 10;
const MAX_TOKEN_LENGTH = 32;
const MAX_TOKEN_WORDS = 4;
const STUB_WEIGHT = 5;
const WEIGHT_REDUCTION_SMALL = 0.25;
const WEIGHT_REDUCTION_MEDIUM = 0.5;
const STUB_BONUS = 3;
const LONG_TOKEN_THRESHOLD = 14;
const LONG_TOKEN_PENALTY = 0.02;

function deriveEntryStub(comment) {
  if (!comment) {return '';}
  // Drop type prefix (character-foo, [Type:] etc.) and normalize
  const stripped = comment.replace(/^[^-\]]*-\s*/, '').replace(/^\[([^\]]+)\]\s*/, '');
  return norm(stripped);
}

const isTooLong = (token) => token.length > MAX_TOKEN_LENGTH || token.split(/\s+/).length > MAX_TOKEN_WORDS;

function refineKeywords(rawKeys = [], entryComment = '') {
const LOCATION_GENERIC = new Set(['gate', 'bell', 'tavern', 'inn', 'row', 'grounds', 'alley', 'square', 'market']);
const GENERIC_NOUNS = new Set(['city','neighborhood','district','room','building','street','road','lane','place','hall','house','yard','garden','shop','store','pub','bar','market','square','ground','grounds','eyes','eye','hair','horse','man','woman','boy','girl','male','female']);
const STOPWORDS = new Set(['the','a','an','of','and','or','to','for','in','on','at','by','from','into','through','over','after','before','between','under','against','during','without','within','along','across','behind','beyond','about','above','below','near','with','is','are','was','were','be','been','being','this','that','these','those','it','its']);
const TEMPORAL_CONTEXT = new Set([
  'today','tonight','tomorrow','yesterday','tonite',
  'morning','afternoon','evening','night','midnight','noon','dawn','dusk','sunrise','sunset',
  'bell','bells','candlemark','candlemarks',
  'hour','hours','minute','minutes','day','days','week','weeks','month','months','year','years','season','seasons'
]);

  const stub = deriveEntryStub(entryComment);
  const seen = new Set();
  const candidates = [];

  const isTemporal = (token) => {
    if (TEMPORAL_CONTEXT.has(token)) {return true;}
    const parts = token.split(/\s+/).filter(Boolean);
    if (parts.some((p) => TEMPORAL_CONTEXT.has(p))) {return true;}
    if (/^\d+$/.test(token) || /^\d+[:.]\d+$/.test(token)) {return true;} // pure numbers or timestamp-like tokens
    if (/^\d+\s*(am|pm)$/.test(token)) {return true;}
    return false;
  };

  const isGeneric = (token) => STOPWORDS.has(token) || GENERIC_NOUNS.has(token) || LOCATION_GENERIC.has(token) || isTemporal(token);

  const pushCandidate = (token, weight = 0) => {
    const t = norm(token);
    if (!t || seen.has(t) || isTooLong(t)) {return;}
    if (isGeneric(t) && t !== stub) {return;}
    seen.add(t);
    candidates.push({ token: t, weight });
  };

  // Anchor keywords around the canonical stub so we always keep the entity name
  if (stub) {
    pushCandidate(stub, STUB_WEIGHT);
    const stubNoHyphen = dehyphen(stub);
    if (stubNoHyphen !== stub) {pushCandidate(stubNoHyphen, STUB_WEIGHT);}
  }

  const keyed = Array.isArray(rawKeys) ? rawKeys : [];
  for (let i = 0; i < keyed.length; i++) {
    const raw = keyed[i];
    const base = norm(raw);
    if (!base) {continue;}

    const priority = Math.max(0, keyed.length - i); // preserve earlier user-supplied ordering
    pushCandidate(base, priority);

    const noHyphen = dehyphen(base);
    const noApos = deapos(noHyphen);
    if (noHyphen !== base) {pushCandidate(noHyphen, priority - WEIGHT_REDUCTION_SMALL);}
    if (noApos !== base && noApos !== noHyphen) {pushCandidate(noApos, priority - WEIGHT_REDUCTION_SMALL);}

    const parts = noHyphen.split(/[^a-z0-9]+/g).filter(Boolean);
    if (parts.length >= 2) {
      // Add a specific anchor from the phrase (longest non-generic part)
      const specificParts = parts
        .map((p) => singularize(p))
        .map(norm)
        .filter((p) => p && !isGeneric(p));

      if (specificParts.length > 0) {
        const anchor = specificParts.sort((a, b) => b.length - a.length)[0];
        pushCandidate(anchor, priority - WEIGHT_REDUCTION_MEDIUM);
      }

      // Keep the phrase if it is not just generics
      if (!noApos.split(/\s+/).every((w) => isGeneric(w))) {
        pushCandidate(noApos, priority - WEIGHT_REDUCTION_MEDIUM);
      }
    }
  }

  // Score and cap
  const scored = candidates.map(({ token, weight }) => {
    let score = weight;
    if (stub && token.includes(stub)) {score += STUB_BONUS;}
    if (token.split(/\s+/).length === 1) {score += WEIGHT_REDUCTION_SMALL;} // prefer compact anchors
    if (token.length > LONG_TOKEN_THRESHOLD) {score -= (token.length - LONG_TOKEN_THRESHOLD) * LONG_TOKEN_PENALTY;} // light penalty for very long tokens
    return { token, score };
  });

  scored.sort((a, b) => b.score - a.score || a.token.localeCompare(b.token));
  const keys = scored.slice(0, MAX_KEYWORDS).map((c) => c.token);

  return { keys, secondary: [] };
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
      content = `[${comment}${content.slice(colonIndex)}`;
    }
  }

  // Accept "keywords" (from prompt JSON), "keys" (internal), or "key" (WI format)
  const rawKeys = entry.keys || entry.keywords || entry.key || [];
  const refined = refineKeywords(rawKeys, comment);

  // Read and coerce lorebook entry settings
  const entrySettings = readAndCoerceLorebookEntrySettings(comment);

  return {
    comment,
    content,
    keys: refined.keys,
    secondaryKeys: [],
    constant: entry.constant,
    disable: entry.disable ?? false,
    order: entry.order ?? FULL_COMPLETION_PERCENTAGE,
    position: entry.position ?? 0,
    depth: entry.depth ?? MIN_ENTITY_SECTIONS,
    type: typeof entry.type === 'string' ? sanitizeEntityTypeName(entry.type) : '',
    uid: entry.uid,
    ...entrySettings
  };
}

function readAndCoerceLorebookEntrySettings(entryComment ) {
  // Get entry defaults from artifact system
  const defaults = getEntryDefaultsFromSettings(extension_settings?.auto_recap);

  debug?.(SUBSYSTEM.LOREBOOK, `[readAndCoerceLorebookEntrySettings] Entry defaults from artifact:`, {
    excludeRecursion: defaults.exclude_recursion,
    preventRecursion: defaults.prevent_recursion,
    ignoreBudget: defaults.ignore_budget,
    sticky: defaults.sticky
  });

  const excludeRecursion = defaults.exclude_recursion;
  let preventRecursion = defaults.prevent_recursion;
  const ignoreBudget = defaults.ignore_budget;
  const sticky = defaults.sticky;

  // Check if this is a {{user}} character entry and auto-set preventRecursion if not already set
  if (typeof entryComment === 'string' && typeof name1 === 'string') {
    const commentLower = entryComment.toLowerCase().trim();
    const userName = name1.trim();
    const userNameLower = userName.toLowerCase();

    // Check if comment matches {{user}} name (exact match or with character- prefix)
    const isUserEntry = commentLower === userNameLower ||
                       commentLower === `character-${userNameLower}`;

    debug?.(SUBSYSTEM.LOREBOOK, `[readAndCoerceLorebookEntrySettings] {{user}} check: entryComment="${entryComment}", name1="${userName}", isUserEntry=${isUserEntry}`);

    if (isUserEntry) {
      preventRecursion = true;
      debug?.(SUBSYSTEM.LOREBOOK, `[readAndCoerceLorebookEntrySettings] Auto-enabled preventRecursion for {{user}} entry: "${entryComment}"`);
    }
  }

  debug?.(SUBSYSTEM.LOREBOOK, `[readAndCoerceLorebookEntrySettings] Final settings for entry "${entryComment}":`, {
    excludeRecursion,
    preventRecursion,
    ignoreBudget,
    sticky
  });

  return { excludeRecursion, preventRecursion, ignoreBudget, sticky };
}

// Standalone keyword generation has been removed; entries must provide keywords in the recap JSON.

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
    if (!registry.index || typeof registry.index !== 'object') {registry.index = {};}
    return registry;
  }
  const newState = { index: {} };
  autoLorebooks.registry = newState;
  return newState;
}


export function ensureStringArray(value ) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter(Boolean);
  }
  return [];
}

export function updateRegistryRecord(state , uid , updates ) {
  if (!state.index[uid]) {
    state.index[uid] = {};
  }
  const record = state.index[uid];
  // Ensure uid/id are present on records for downstream consumers
  const parsedUid = Number(uid);
  record.uid = Number.isNaN(parsedUid) ? uid : parsedUid;
  record.id = String(uid);
  if (updates.type) {record.type = updates.type;}
  if (updates.name !== undefined) {record.name = updates.name;}
  if (updates.comment !== undefined) {record.comment = updates.comment;}
  if (updates.synopsis !== undefined) {record.synopsis = updates.synopsis;}
  if (updates.aliases !== undefined) {record.aliases = ensureStringArray(updates.aliases);}
}

export function buildRegistryListing(state ) {
  const grouped  = {};
  for (const [id, record] of Object.entries(state.index || {})) {
    if (!record) {continue;}
    const type = record.type || 'unknown';
    if (!grouped[type]) {grouped[type] = [];}
    grouped[type].push({ id, ...record });
  }
  const types = Object.keys(grouped);
  if (types.length === 0) {
    return 'No registry entries available yet.';
  }
  const sections = [];
  for (const type of types.sort()) {
    sections.push(`[Type: ${type}]`);
    const records = grouped[type] || [];
    for (const [index, record] of records.sort((a, b) => {
      const nameA = (a.name || a.comment || '').toLowerCase();
      const nameB = (b.name || b.comment || '').toLowerCase();
      return nameA.localeCompare(nameB);
    }).entries()) {
      const name = record.name || record.comment || 'Unknown';
      const aliases = ensureStringArray(record.aliases);
      const aliasText = aliases.length > 0 ? aliases.join('; ') : '—';
      const synopsis = record.synopsis || '—';
      sections.push(`${index + 1}. uid: ${record.uid} | name: ${name} | aliases: ${aliasText} | synopsis: ${synopsis}`);
    }
    sections.push('');
  }
  return sections.join('\n').trim();
}

export function buildRegistryItemsForType(state , type ) {
  const items = [];
  for (const [id, record] of Object.entries(state.index || {})) {
    if (!record) {continue;}
    if ((record.type || 'unknown') !== type) {continue;}
    items.push({
      id,
      name: record.name || '',
      comment: record.comment || '',
      aliases: ensureStringArray(record.aliases),
      synopsis: record.synopsis || ''
    });
  }
  items.sort((a, b) => (a.name || a.comment || '').localeCompare(b.name || b.comment || ''));
  return items;
}

// ---------------------------------
// Registry hydration from lorebook
// ---------------------------------

function parseRegistryHeader(line) {
  const m = /^\s*\[Registry:\s*([^\]]+)\]\s*$/i.exec(String(line || ''));
  return m ? String(m[1]).trim() : '';
}

function parseRegistryItemLine(line) {
  const text = String(line || '').trim();
  if (!/^\-\s*/.test(text)) {return null;}
  const parts = text.replace(/^\-\s*/, '').split('|').map((p) => p.trim());
  const getVal = (label) => {
    const p = parts.find((s) => s.toLowerCase().startsWith(label + ':'));
    return p ? p.slice(p.indexOf(':') + 1).trim() : '';
  };
  const uid = getVal('uid');
  if (!uid) {return null;}
  const name = getVal('name');
  const aliasesRaw = getVal('aliases');
  const synopsis = getVal('synopsis');
  const aliases = aliasesRaw && aliasesRaw !== '—' ? aliasesRaw.split(';').map((a) => a.trim()).filter(Boolean) : [];
  return { uid: String(uid), name, aliases, synopsis };
}

function buildIndexFromRegistryEntries(entriesArray ) {
  const index = {};
  for (const entry of entriesArray || []) {
    if (!entry || typeof entry.comment !== 'string') {continue;}
    if (!isRegistryEntry(entry)) {continue;}
    const lines = String(entry.content || '').split(/\r?\n/);
    const type = parseRegistryHeader(lines[0]);
    if (!type) {continue;}
    for (let i = 1; i < lines.length; i++) {
      const item = parseRegistryItemLine(lines[i]);
      if (!item) {continue;}
      const uidStr = String(item.uid);
      const uidNum = Number(uidStr);
      index[uidStr] = {
        uid: Number.isNaN(uidNum) ? uidStr : uidNum,
        type,
        name: item.name || '',
        comment: item.name || '',
        aliases: ensureStringArray(item.aliases),
        synopsis: item.synopsis || ''
      };
    }
  }
  return index;
}

export async function refreshRegistryStateFromEntries(existingEntriesRaw ) {
  try {
    // Keep async semantics for lint rule and future IO expansion
    await Promise.resolve();
    const registryState = ensureRegistryState();
    const built = buildIndexFromRegistryEntries(existingEntriesRaw || []);
    if (Object.keys(built).length > 0) {
      registryState.index = built;
      if (!chat_metadata.auto_lorebooks) {chat_metadata.auto_lorebooks = {};}
      chat_metadata.auto_lorebooks.registry = registryState;
      debug?.(SUBSYSTEM?.LOREBOOK || SUBSYSTEM, '[refreshRegistryStateFromEntries] Hydrated registry from lorebook entries', { count: Object.keys(built).length });
    } else {
      debug?.(SUBSYSTEM?.LOREBOOK || SUBSYSTEM, '[refreshRegistryStateFromEntries] No registry items parsed from entries');
    }
    return registryState;
  } catch (err) {
    try { error?.('[refreshRegistryStateFromEntries] Failed to hydrate registry from entries', err); } catch {}
    return ensureRegistryState();
  }
}

export function buildCandidateEntriesData(candidateIds , registryState , existingEntriesMap ) {
  const data = [];
  for (const id of candidateIds) {
    const record = registryState.index?.[id];
    if (!record) {continue;}
    const entry = existingEntriesMap.get(String(id));
    if (!entry) {continue;}
    data.push({
      uid: id,
      comment: entry.comment || '',
      content: entry.content || '',
      keys: Array.isArray(entry.key) ? entry.key : [],
      aliases: ensureStringArray(record.aliases),
      synopsis: record.synopsis || ''
    });
  }
  return data;
}

function buildNewEntryPayload(entry ) {
  const defaults = getEntryDefaultsFromSettings(extension_settings?.auto_recap);
  return {
    comment: entry.comment || '',
    content: entry.content || '',
    keys: ensureStringArray(entry.keys),
    type: entry.type || '',
    constant: Boolean(entry.constant),
    disable: Boolean(entry.disable),
    excludeRecursion: entry.excludeRecursion ?? defaults.exclude_recursion,
    preventRecursion: entry.preventRecursion ?? defaults.prevent_recursion,
    ignoreBudget: entry.ignoreBudget ?? defaults.ignore_budget,
    sticky: entry.sticky ?? defaults.sticky
  };
}

async function runModelWithSettings(config) {
  const { prompt, prefill, connectionProfile, completionPreset, include_preset_prompts = false, label, entryComment } = config;

  try {
    debug(SUBSYSTEM.LOREBOOK,'[runModelWithSettings] Called with label:', label);

    // Set operation context for ST_METADATA
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    if (entryComment) {
      setOperationSuffix(`-${entryComment}`);
    }

    let response;

    try {
      const { sendLLMRequest } = await import('./llmClient.js');
      const { OperationType } = await import('./operationTypes.js');
      const { resolveProfileId } = await import('./profileResolution.js');
      const effectiveProfile = resolveProfileId(connectionProfile);

      debug(SUBSYSTEM.LOREBOOK,'[runModelWithSettings] label:', label);
      debug(SUBSYSTEM.LOREBOOK,'[runModelWithSettings] include_preset_prompts:', include_preset_prompts);
      debug(SUBSYSTEM.LOREBOOK,'[runModelWithSettings] completionPreset (param):', completionPreset);

      // Determine operation type based on label
      const operationType = label === 'lorebook_entry_lookup' ? OperationType.LOREBOOK_ENTRY_LOOKUP :
                            label === 'lorebookEntryDeduplicate' ? OperationType.RESOLVE_LOREBOOK_ENTRY :
                            label === 'bulk_registry_populate' ? OperationType.POPULATE_REGISTRIES :
                            OperationType.RESOLVE_LOREBOOK_ENTRY;

      const options = {
        includePreset: include_preset_prompts,
        preset: completionPreset,
        prefill: prefill || '',
        trimSentences: false
      };

      response = await sendLLMRequest(effectiveProfile, prompt, operationType, options);
    } finally {
      clearOperationSuffix();
    }

    // Extract token breakdown from response
    const { extractTokenBreakdownFromResponse } = await import('./tokenBreakdown.js');
    const tokenBreakdown = extractTokenBreakdownFromResponse(response);

    if (typeof response === 'string' || response instanceof String) {
      debug?.(`Auto-Lorebooks ${label} response length: ${response.length}`);
      return { response: response.toString().trim(), tokenBreakdown };
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
  if (!rawType || typeof rawType !== 'string') {return '';}
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

// eslint-disable-next-line complexity -- Token breakdown extraction adds one conditional branch
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
    return { type: '', synopsis: '', sameEntityUids: [], needsFullContextUids: [] };
  }
  const payload = buildNewEntryPayload(normalizedEntry);
  // Build all macro values from context - all macros available on all prompts
  const params = buildAllMacroParams({
    typeDefinitions: typeList,
    newEntry: payload,
    registryListing
  });
  const prompt = await substitute_params(promptTemplate, params);

  const config = {
    prompt,
    prefill: settings?.lorebook_entry_lookup_prefill || '',
    connectionProfile: settings?.lorebook_entry_lookup_connection_profile || '',
    completionPreset: settings?.lorebook_entry_lookup_completion_preset || '',
    include_preset_prompts: settings?.lorebook_entry_lookup_include_preset_prompts || false,
    label: 'lorebook_entry_lookup',
    entryComment: normalizedEntry.comment, // Pass comment for context suffix
  };
  const result = await runModelWithSettings(config);
  const response = result?.response || result;
  const tokenBreakdown = result?.tokenBreakdown;

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
      sameEntityUids: [],
      needsFullContextUids: [],
      tokenBreakdown
    };
  }

  const type = sanitizeLorebookEntryLookupType(parsed.type) || normalizedEntry.type || '';
  const sameUids = ensureStringArray(parsed.sameEntityUids).map((id) => String(id));
  const needsUids = ensureStringArray(parsed.needsFullContextUids).map((id) => String(id));
  const synopsis = typeof parsed.synopsis === 'string' ? parsed.synopsis.trim() : '';

  return {
    type,
    synopsis,
    tokenBreakdown,
    sameEntityUids: sameUids,
    needsFullContextUids: needsUids
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

async function buildLorebookEntryDeduplicatePrompt(
normalizedEntry ,
lorebookEntryLookupSynopsis ,
candidateEntries ,
singleType ,
settings )
{
  const payload = buildNewEntryPayload(normalizedEntry);
  const promptTemplate = settings?.lorebook_entry_deduplicate_prompt || '';
  const typeList = singleType ? [{ name: singleType }] : [];
  // Build all macro values from context - all macros available on all prompts
  const params = buildAllMacroParams({
    typeDefinitions: typeList,
    newEntry: payload,
    synopsis: lorebookEntryLookupSynopsis,
    candidateEntries
  });
  return await substitute_params(promptTemplate, params);
}

// eslint-disable-next-line require-await -- Async function returns promise from runModelWithSettings
async function executeLorebookEntryDeduplicateLLMCall(prompt , settings , entryComment ) {
  const config = {
    prompt,
    prefill: settings?.lorebook_entry_deduplicate_prefill || '',
    connectionProfile: settings?.lorebook_entry_deduplicate_connection_profile || '',
    completionPreset: settings?.lorebook_entry_deduplicate_completion_preset || '',
    include_preset_prompts: settings?.lorebook_entry_deduplicate_include_preset_prompts || false,
    label: 'lorebookEntryDeduplicate',
    entryComment, // Pass comment for context suffix
  };
  return runModelWithSettings(config);
}

async function parseLorebookEntryDeduplicateResponse(response , fallbackSynopsis ) {
  // Parse JSON using centralized helper
  let parsed;
  try {
    const { extractJsonFromResponse } = await import('./utils.js');
    parsed = extractJsonFromResponse(response, {
      requiredFields: ['resolvedUid'],
      context: 'lorebook entry deduplication'
    });
  } catch (err) {
    // If parsing failed, return default structure
    debug?.('Failed to parse lorebook entry deduplication response:', err);
    return { resolvedUid: null, synopsis: fallbackSynopsis || '', duplicateUids: [] };
  }

  let resolvedUid = parsed.resolvedUid;
  if (resolvedUid && typeof resolvedUid === 'string') {
    const lowered = resolvedUid.trim().toLowerCase();
    if (lowered === 'new' || lowered === 'none' || lowered === 'null') {
      resolvedUid = null;
    }
  } else {
    resolvedUid = null;
  }

  const synopsis = typeof parsed.synopsis === 'string' && parsed.synopsis.trim().length > 0 ?
  parsed.synopsis.trim() :
  fallbackSynopsis || '';

  const duplicateUids = Array.isArray(parsed.duplicateUids)
    ? parsed.duplicateUids
        .filter(uid => uid && String(uid) !== String(resolvedUid))
        .map(uid => String(uid))
    : [];

  return { resolvedUid: resolvedUid ? String(resolvedUid) : null, synopsis, duplicateUids };
}

export async function runLorebookEntryDeduplicateStage(
normalizedEntry ,
lorebookEntryLookupSynopsis ,
candidateEntries ,
singleType ,
settings )
{
  if (!shouldRunLorebookEntryDeduplicate(candidateEntries, settings)) {
    return { resolvedUid: null, synopsis: lorebookEntryLookupSynopsis || '', duplicateUids: [] };
  }

  const prompt = await buildLorebookEntryDeduplicatePrompt(normalizedEntry, lorebookEntryLookupSynopsis, candidateEntries, singleType, settings);
  const result = await executeLorebookEntryDeduplicateLLMCall(prompt, settings, normalizedEntry.comment);
  const response = result?.response || result;
  const tokenBreakdown = result?.tokenBreakdown;

  if (!response) {
    return { resolvedUid: null, synopsis: lorebookEntryLookupSynopsis || '', duplicateUids: [], tokenBreakdown };
  }

  const parsed = await parseLorebookEntryDeduplicateResponse(response, lorebookEntryLookupSynopsis);
  return { ...parsed, tokenBreakdown };
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
    if (typeDef) {targetType = typeDef.name;}
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

function stripTypePrefix(name) {
  if (!name || typeof name !== 'string') {return '';}
  return name.replace(/^[^-]+-/, '').toLowerCase().trim();
}

export async function runBulkRegistryPopulation(entriesArray , typeList , settings ) {
  const promptTemplate = settings?.bulk_populate_prompt || '';
  if (!promptTemplate) {
    error?.('Bulk populate prompt is missing. Cannot process imported entries.');
    return [];
  }

  // Build all macro values from context - all macros available on all prompts
  const params = buildAllMacroParams({
    typeDefinitions: typeList,
    newEntries: entriesArray
  });
  const prompt = await substitute_params(promptTemplate, params);

  const config = {
    prompt,
    prefill: settings?.bulk_populate_prefill || '',
    connectionProfile: settings?.bulk_populate_connection_profile || '',
    completionPreset: settings?.bulk_populate_completion_preset || '',
    include_preset_prompts: settings?.bulk_populate_include_preset_prompts || false,
    label: 'bulk_registry_populate'
  };

  const result = await runModelWithSettings(config);
  const response = result?.response || result;
  const tokenBreakdown = result?.tokenBreakdown;

  let parsed;
  try {
    const { extractJsonFromResponse } = await import('./utils.js');
    parsed = extractJsonFromResponse(response, {
      requiredFields: ['results'],
      context: 'bulk registry population'
    });
  } catch (err) {
    error?.('Failed to parse bulk registry population response:', err);
    return { results: [], tokenBreakdown };
  }

  if (!Array.isArray(parsed.results)) {
    error?.('Bulk populate response missing results array');
    return { results: [], tokenBreakdown };
  }

  return { results: parsed.results, tokenBreakdown };
}

export async function processBulkPopulateResults(results , lorebookName , existingEntriesMap ) {
  if (!Array.isArray(results) || results.length === 0) {
    debug?.('No results to process from bulk populate');
    return;
  }

  const registryState = ensureRegistryState();
  let updated = false;

  for (const result of results) {
    if (!result || !result.entry_id) {continue;}

    const entryId = String(result.entry_id);
    const entry = existingEntriesMap.get(entryId);
    if (!entry) {
      debug?.(`Entry ${entryId} not found in entries map, skipping registry update`);
      continue;
    }

    const type = result.type || 'character';
    const synopsis = result.synopsis || '';
    const currentComment = entry.comment || 'Unnamed';
    const aliases = ensureStringArray(entry.key);

    // Build prefixed comment using type (e.g., "faction-Companions")
    const prefixedComment = buildEntryName({
      comment: currentComment,
      type: result.type
    });

    // Update entry comment if it changed
    if (prefixedComment !== currentComment) {
      // eslint-disable-next-line no-await-in-loop -- Sequential execution required: each call modifies and saves the same lorebook
      await modifyLorebookEntry(lorebookName, entry.uid, { comment: prefixedComment });
      debug?.(`Updated entry ${entryId} comment from "${currentComment}" to "${prefixedComment}"`);
    }

    updateRegistryRecord(registryState, entryId, {
      type,
      name: prefixedComment,
      comment: prefixedComment,
      aliases,
      synopsis
    });

    debug?.(`Updated registry for ${entryId}: type=${type}, synopsis=${synopsis}`);
    updated = true;
  }

  if (updated) {
    if (!chat_metadata.auto_lorebooks) {
      chat_metadata.auto_lorebooks = {};
    }
    chat_metadata.auto_lorebooks.registry = registryState;

    const typeSet = new Set(
      Object.values(registryState.index || {}).
      map((r) => r?.type).
      filter(Boolean)
    );

    for (const type of typeSet) {
      const items = buildRegistryItemsForType(registryState, type);
      // eslint-disable-next-line no-await-in-loop -- Sequential execution required: each call modifies and saves the same lorebook
      await updateRegistryEntryContent(lorebookName, type, items);
    }

    saveMetadata();
    log?.(`Bulk populated ${results.length} registry entries`);
  }
}

function deterministicMatchIds(normalizedEntry, targetType, registryState) {
  const ids = [];
  try {
    const wantType = (targetType || '').toLowerCase();
    const entryComment = String(normalizedEntry.comment || '').toLowerCase().trim();
    const entryStub = stripTypePrefix(entryComment);

    for (const [id, record] of Object.entries(registryState.index || {})) {
      if (!record) {continue;}
      const recType = String(record.type || '').toLowerCase();
      if (wantType && recType && recType !== wantType) {continue;}

      const recComment = String(record.comment || record.name || '').toLowerCase().trim();
      const recStub = stripTypePrefix(recComment);

      if (recComment && recComment === entryComment) {
        ids.push(id);
        continue;
      }
      if (recStub && recStub === entryStub) {
        ids.push(id);
        continue;
      }

      const aliases = Array.isArray(record.aliases) ? record.aliases.map((a) => String(a).toLowerCase().trim()) : [];
      if (entryStub && aliases.includes(entryStub)) {
        ids.push(id);
      }
    }
  } catch {/* ignore deterministic matching errors */}
  return ids;
}

async function buildCandidateListAndResolve(ctx) {
  const { lorebookEntryLookup, registryState, existingEntriesMap, normalizedEntry, targetType, settings } = ctx;

  const candidateIdSet  = new Set();

  // 1) Deterministic pre-match on canonical name/aliases to avoid duplicates when the LLM misses an obvious match
  for (const id of deterministicMatchIds(normalizedEntry, targetType, registryState)) {
    candidateIdSet.add(String(id));
  }

  // 2) Include LLM-proposed matches
  for (const id of lorebookEntryLookup.sameEntityUids) {candidateIdSet.add(String(id));}
  for (const id of lorebookEntryLookup.needsFullContextUids) {candidateIdSet.add(String(id));}

  const candidateIds = Array.from(candidateIdSet).filter((id) => registryState.index?.[id]);

  let lorebookEntryDeduplicate = null;
  if (candidateIds.length > 0) {
    const candidateEntries = buildCandidateEntriesData(candidateIds, registryState, existingEntriesMap);
    if (candidateEntries.length > 0) {
      lorebookEntryDeduplicate = await runLorebookEntryDeduplicateStage(normalizedEntry, lorebookEntryLookup.synopsis || '', candidateEntries, targetType, settings);
    }
  }

  if (!lorebookEntryDeduplicate) {
    lorebookEntryDeduplicate = { resolvedUid: null, synopsis: lorebookEntryLookup.synopsis || '' };
  }

  return { candidateIds, lorebookEntryDeduplicate };
}

function applyFallbackAndValidateIdentity(
lorebookEntryDeduplicate ,
candidateIds ,
lorebookEntryLookup ,
registryState )
{
  let resolvedUid = lorebookEntryDeduplicate.resolvedUid;

  // Single candidate fallback: if only one candidate and no needsFullContext, use it
  if (!resolvedUid && candidateIds.length === 1 && (!lorebookEntryLookup.needsFullContextUids || lorebookEntryLookup.needsFullContextUids.length === 0)) {
    const fallbackId = candidateIds[0];
    if (registryState.index?.[fallbackId]) {
      resolvedUid = fallbackId;
    }
  }

  // Validate resolved UID exists in registry
  if (resolvedUid && !registryState.index?.[resolvedUid]) {
    resolvedUid = null;
  }

  const previousType = resolvedUid ? registryState.index?.[resolvedUid]?.type : null;
  const finalSynopsis = lorebookEntryDeduplicate.synopsis || lorebookEntryLookup.synopsis || '';

  return { resolvedUid, previousType, finalSynopsis };
}

async function executeMergeWorkflow(config) {
  const { resolvedUid, normalizedEntry, targetType, previousType, finalSynopsis, lorebookName, existingEntriesMap, registryState, useQueue, results, typesToUpdate, ctx } = config;

  const record = registryState.index?.[resolvedUid];
  const existingEntry = record ? existingEntriesMap.get(String(resolvedUid)) : null;

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

      results.merged.push({ comment: finalComment, uid: existingEntry.uid });
      updateRegistryRecord(registryState, resolvedUid, {
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
      const newId = createdEntry.uid;
      updateRegistryRecord(registryState, newId, {
        type: targetType,
        name: normalizedEntry.comment || createdEntry.comment || '',
        comment: normalizedEntry.comment || createdEntry.comment || '',
        aliases: ensureStringArray(normalizedEntry.keys),
        synopsis: finalSynopsis
      });
      ctx.registryStateDirty = true;
      typesToUpdate.add(targetType);
      results.created.push({ comment: normalizedEntry.comment, uid: createdEntry.uid });
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

  // UID-based direct merge path: Skip lookup if UID is provided
  if (normalizedEntry.uid) {
    const providedUid = String(normalizedEntry.uid);
    const existingEntry = existingEntriesMap.get(providedUid);

    if (existingEntry) {
      debug(SUBSYSTEM.CORE, `UID-based direct merge for ${normalizedEntry.comment || normalizedEntry.name} (uid: ${providedUid})`);

      // Find the registry record to get type and synopsis
      let registryRecord = null;
      let previousType = null;
      for (const record of Object.values(registryState.index || {})) {
        if (record.uid === providedUid) {
          registryRecord = record;
          previousType = record.type;
          break;
        }
      }

      // Determine target type: prefer registry type, fall back to entry type
      const targetType = previousType || (normalizedEntry.type ? sanitizeEntityTypeName(normalizedEntry.type) : entityTypeDefs[0]?.name || 'character');
      const finalSynopsis = registryRecord?.synopsis || '';

      // Execute merge directly
      const merged = await executeMergeWorkflow({
        resolvedUid: providedUid,
        normalizedEntry,
        targetType,
        previousType,
        finalSynopsis,
        ctx,
        ...ctx
      });

      if (merged) {
        return;
      }

      // If merge failed, entry already added to results.failed by executeMergeWorkflow
      error(SUBSYSTEM.CORE, `UID-based merge failed for ${normalizedEntry.comment}`);
      return;
    } else {
      // UID validation failed - fall back to normal lookup pipeline
      // Only error if UID is non-empty (truly invalid vs expected missing)
      if (isMeaningfulUid(providedUid)) {
        error(SUBSYSTEM.CORE, `Invalid UID ${providedUid} for ${normalizedEntry.comment || normalizedEntry.name} - falling back to lookup`);
        toast(`⚠ Invalid UID for ${normalizedEntry.comment || normalizedEntry.name}, using lookup instead`, 'warning');
      }
      // Remove the invalid UID to prevent confusion
      delete normalizedEntry.uid;
    }
  }

  // Normal lookup pipeline (no UID provided or UID validation failed)
  const registryListing = buildRegistryListing(registryState);
  const lorebookEntryLookup = await runLorebookEntryLookupStage(normalizedEntry, registryListing, typeList, settings);

  const { targetType } = resolveEntryType(normalizedEntry, lorebookEntryLookup, entityTypeMap, entityTypeDefs);

  const lookupCtx = {
    lorebookEntryLookup,
    registryState,
    existingEntriesMap,
    normalizedEntry,
    targetType,
    settings,
  };
  const { candidateIds, lorebookEntryDeduplicate } = await buildCandidateListAndResolve(lookupCtx);

  const { resolvedUid, previousType, finalSynopsis } = applyFallbackAndValidateIdentity(
    lorebookEntryDeduplicate,
    candidateIds,
    lorebookEntryLookup,
    registryState
  );

  if (resolvedUid) {
    const merged = await executeMergeWorkflow({
      resolvedUid,
      normalizedEntry,
      targetType,
      previousType,
      finalSynopsis,
      ctx,
      ...ctx
    });
    if (merged) {
      return;
    }
  }

  await executeCreateWorkflow(normalizedEntry, targetType, finalSynopsis, ctx);
}

function initializeRecapProcessing(recap , options ) {
  const { useQueue = true } = options;
  const entityTypeDefs = getEntityTypeDefinitionsFromSettings(extension_settings?.auto_recap);
  const entityTypeMap = createEntityTypeMap(entityTypeDefs);

  return { useQueue, entityTypeDefs, entityTypeMap };
}

function extractAndValidateEntities(recap ) {
  const lorebookData = extractLorebookData(recap);
  if (!lorebookData || !lorebookData.entries) {
    debug('No lorebook entries found in recap');
    return { valid: false, error: 'No lorebook data found' };
  }
  return { valid: true, entries: lorebookData.entries };
}

 
async function loadRecapContext(config ) {
  const lorebookName = getAttachedLorebook();
  if (!lorebookName) {
    error('No lorebook attached to process recap');
    return { error: 'No lorebook attached' };
  }

  const existingEntriesRaw = await getLorebookEntries(lorebookName);
  if (!existingEntriesRaw) {
    error('Failed to get existing entries');
    return { error: 'Failed to load lorebook' };
  }

  // Hydrate registry state from any persisted registry entries in the lorebook
  await refreshRegistryStateFromEntries(existingEntriesRaw);

  const existingEntries = existingEntriesRaw.filter((entry) => !isRegistryEntry(entry));
  const existingEntriesMap  = new Map();
  for (const entry of existingEntries) {
    if (entry && entry.uid !== undefined) {
      existingEntriesMap.set(String(entry.uid), entry);
    }
  }

  const registryState = ensureRegistryState();

  // Build recapSettings from operations presets system
  // Configuration is logged by resolveOperationConfig() for each operation type
  const { buildLorebookOperationsSettings } = await import('./index.js');
  const recapSettings = {
    ...(await buildLorebookOperationsSettings()),
    enabled: true
  };

  const typeList = config.entityTypeDefs || [];

  // Validate critical settings are loaded
  if (!recapSettings.lorebook_entry_lookup_prompt) {
    error('CRITICAL: Auto-Lorebooks lorebook_entry_lookup_prompt not found in profile settings');
    error('Lorebook Entry Lookup prompt type:', typeof recapSettings.lorebook_entry_lookup_prompt);
    error('Lorebook Entry Lookup prompt length:', recapSettings.lorebook_entry_lookup_prompt?.length || 0);
    toast('Auto-Lorebooks: Critical configuration error - lorebook entry lookup prompt not loaded! Check browser console for details.', 'error');
  }
  if (!recapSettings.lorebook_entry_deduplicate_prompt) {
    error('CRITICAL: Auto-Lorebooks lorebook_entry_deduplicate_prompt not found in profile settings');
    error('LorebookEntryDeduplicate prompt type:', typeof recapSettings.lorebook_entry_deduplicate_prompt);
    error('LorebookEntryDeduplicate prompt length:', recapSettings.lorebook_entry_deduplicate_prompt?.length || 0);
    toast('Auto-Lorebooks: Critical configuration error - lorebook entry deduplicate prompt not loaded! Check browser console for details.', 'error');
  }

  return {
    lorebookName,
    existingEntries,
    existingEntriesMap,
    registryState,
    recapSettings,
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
    // eslint-disable-next-line no-await-in-loop -- Lorebook entries must be processed sequentially to maintain state consistency
    await handleLorebookEntry(normalizedEntry, context);
  }
}

async function finalizeRecapProcessing(context ) {
  await finalizeRegistryUpdates(context);
}

function buildRecapResult(results , totalEntries ) {
  const message = `Processed ${totalEntries} entries: ${results.created.length} created, ${results.merged.length} merged, ${results.failed.length} failed`;
  log(message);

  if (results.created.length > 0 || results.merged.length > 0) {
    toast(message, 'success');
  } else if (results.failed.length > 0) {
    toast(`Failed to process ${results.failed.length} entries`, 'warning');
  }

  return { success: true, results, message };
}

export async function processRecapToLorebook(recap , options  = {}) {
  try {
    // Initialize configuration
    const config = initializeRecapProcessing(recap, options);

    // Extract and validate entities
    const extraction = extractAndValidateEntities(recap);
    if (!extraction.valid) {
      return { success: false, message: extraction.error };
    }

    // Load processing context
    const ctx = await loadRecapContext(config);
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
      settings: ctx.recapSettings,
      useQueue: config.useQueue,
      results,
      typesToUpdate,
      typeList: ctx.typeList,
      registryStateDirty: false
    };

    // Process batch
    await processBatchEntries(extraction.entries, context, config);

    // Finalize
    await finalizeRecapProcessing(context);

    // Build result
    return buildRecapResult(results, extraction.entries.length);

  } catch (err) {
    error('Error processing recap to lorebook', err);
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
      // eslint-disable-next-line no-await-in-loop -- Registry entries must update sequentially to avoid race conditions
      await updateRegistryEntryContent(lorebookName, type, items);
    }
  }

  if (context.registryStateDirty) {
    saveMetadata();
  }
}

export async function processRecapsToLorebook(recaps , options  = {}) {
  try {
    if (!Array.isArray(recaps) || recaps.length === 0) {
      return {
        success: false,
        message: 'No recaps provided'
      };
    }

    log(`Processing ${recaps.length} recaps to lorebook...`);

    const allResults = {
      processed: 0,
      created: [],
      merged: [],
      failed: []
    };

    for (const recap of recaps) {
      // Sequential execution required: recaps must be processed in order
      // eslint-disable-next-line no-await-in-loop -- Recaps must be processed sequentially to maintain message order
      const result = await processRecapToLorebook(recap, options);

      if (result.success) {
        allResults.processed++;
        if (result.results) {
          allResults.created.push(...result.results.created);
          allResults.merged.push(...result.results.merged);
          allResults.failed.push(...result.results.failed);
        }
      }
    }

    const message = `Processed ${allResults.processed} recaps: ${allResults.created.length} created, ${allResults.merged.length} merged, ${allResults.failed.length} failed`;
    log(message);
    toast(message, 'info');

    return {
      success: true,
      results: allResults,
      message
    };

  } catch (err) {
    error('Error processing recaps to lorebook', err);
    return {
      success: false,
      message: err.message
    };
  }
}

export default {
  initRecapToLorebookProcessor,
  processRecapToLorebook,
  processRecapsToLorebook
};

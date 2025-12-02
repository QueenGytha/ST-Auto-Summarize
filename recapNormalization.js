/**
 * Centralized recap normalization and extraction.
 *
 * CANONICAL STORAGE FORMATS (after normalization):
 * - Stage 1: {sn, extracted: [...]} - stored as-is
 * - Stage 2: {sn, recap: {outcomes, threads, state}, entities: [...]} - stored as-is
 * - Stage 3: {developments: [...], open: [...], state: [...], resolved: [...]} - stored as-is
 * - Running recap: {recap: string, entities: [...]} - recap converted to string for display/injection
 * - Multi-stage wrapper: {stage1:{...}, stage2:{...}, stage3:{...}, stage4:{...}, scene_name:"..."}
 *
 * LLM DEVIATIONS HANDLED:
 * - Running recap object format: {recap: {developments, open, state}} → converted to string
 * - Entity short field names: t/n/k/c → type/name/keywords/content
 * - Content as string vs array: normalized to array
 *
 * VALIDATION:
 * - Stage 1: requires extracted array
 * - Stage 2: requires recap object and entities array
 * - Stage 3: requires at least one of developments/open/state/resolved arrays
 * - Running recap: requires recap object, outputs string
 *
 * USAGE:
 * - WRITE: Call normalizeStageOutput(stage, parsed) after every LLM response before saving
 * - READ: Call extractRecapString(data) when reading recap content from stored data
 */

// NOTE: This module must NOT import from utils.js or index.js to avoid circular dependencies.

const LOG_PREFIX = '[AutoRecap] [recapNormalization]';

// Stage number constants for normalizeStageOutput
export const STAGE = {
  EXTRACTION: 1,
  ORGANIZE: 2,
  FILTER_RC: 3,
  RUNNING: 'running'
};

/**
 * Normalize entity fields from short names to full names.
 * Handles: t→type, n→name, k→keywords, c→content, u→uid
 * Also normalizes content to array format.
 */
function normalizeEntityFields(entity) {
  const normalized = {
    type: entity.type || entity.t || 'unknown',
    name: entity.name || entity.n || '',
    keywords: entity.keywords || entity.k || entity.keys || [],
    content: normalizeContentToArray(entity.content || entity.c || [])
  };

  // Copy uid if present
  const uid = entity.uid || entity.u;
  if (uid !== undefined) {
    normalized.uid = uid;
  }

  return normalized;
}

/**
 * Normalize content to array format.
 * Handles: string → [string], already array → array
 */
function normalizeContentToArray(content) {
  if (Array.isArray(content)) {
    return content;
  }
  if (typeof content === 'string' && content.trim()) {
    return [content];
  }
  return [];
}

/**
 * Format a recap object to a display string.
 * Used for running recap storage and display.
 *
 * Input: {developments: [...], open: [...], state: [...]}
 * Output: "DEVELOPMENTS:\n...\n\nOPEN:\n...\n\nSTATE:\n..."
 */
function formatRecapObjectToString(recapObj) {
  if (!recapObj || typeof recapObj !== 'object') {
    return '';
  }

  const parts = [];

  if (recapObj.developments?.length > 0) {
    parts.push('DEVELOPMENTS:\n' + recapObj.developments.join('\n'));
  }

  if (recapObj.open?.length > 0) {
    parts.push('OPEN:\n' + recapObj.open.join('\n'));
  }

  if (recapObj.state?.length > 0) {
    parts.push('STATE:\n' + recapObj.state.join('\n'));
  }

  return parts.join('\n\n');
}

/**
 * Format Stage 2 recap object to string for display.
 * Input: {outcomes: "...", threads: "...", state: "..."}
 */
function formatStage2RecapToString(recapObj) {
  if (!recapObj || typeof recapObj !== 'object') {
    return '';
  }

  const parts = [];

  if (recapObj.outcomes?.trim()) {
    parts.push('OUTCOMES:\n' + recapObj.outcomes);
  }

  if (recapObj.threads?.trim()) {
    parts.push('THREADS:\n' + recapObj.threads);
  }

  if (recapObj.state?.trim()) {
    parts.push('STATE:\n' + recapObj.state);
  }

  return parts.join('\n\n');
}

/**
 * Format Stage 3 output to string for display.
 * Input: {developments: [...], open: [...], state: [...], resolved: [...]}
 * Defensive: handles string fields that weren't normalized
 */
function formatStage3ToString(filtered) {
  if (!filtered || typeof filtered !== 'object') {
    return '';
  }

  const parts = [];

  // Normalize each field to array for safe .join()
  const developments = normalizeContentToArray(filtered.developments);
  const open = normalizeContentToArray(filtered.open);
  const state = normalizeContentToArray(filtered.state);
  const resolved = normalizeContentToArray(filtered.resolved);

  if (developments.length > 0) {
    parts.push('DEVELOPMENTS:\n' + developments.join('\n'));
  }

  if (open.length > 0) {
    parts.push('OPEN:\n' + open.join('\n'));
  }

  if (state.length > 0) {
    parts.push('STATE:\n' + state.join('\n'));
  }

  if (resolved.length > 0) {
    parts.push('RESOLVED:\n' + resolved.join('\n'));
  }

  return parts.join('\n\n');
}

// Stage 1 facet keys for legacy format detection
const STAGE1_FACET_KEYS = ['plot', 'goals', 'reveals', 'state', 'tone', 'stance', 'voice', 'quotes', 'appearance', 'verbatim', 'docs'];

// Stage 1 helper: Check for legacy array formats
function tryStage1LegacyArray(parsed) {
  if (Array.isArray(parsed)) {
    return { chronological_items: parsed };
  }
  if (parsed && Array.isArray(parsed.chronological_items)) {
    return parsed;
  }
  return null;
}

// Stage 1 helper: Check for new extraction format
function tryStage1NewExtraction(parsed) {
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.extracted)) {
    return { sn: parsed.sn || '', extracted: parsed.extracted };
  }
  return null;
}

// Stage 1 helper: Check for entity-based format
function tryStage1EntityBased(parsed) {
  const hasRecapField = parsed?.plot !== undefined || parsed?.rc !== undefined || parsed?.recap !== undefined;
  if (parsed && typeof parsed === 'object' && hasRecapField && Array.isArray(parsed.entities)) {
    return {
      sn: parsed.sn || '',
      plot: parsed.plot ?? parsed.rc ?? parsed.recap ?? '',
      entities: parsed.entities.map(normalizeEntityFields)
    };
  }
  return null;
}

// Stage 1 helper: Check for faceted format
function tryStage1Faceted(parsed) {
  if (parsed && typeof parsed === 'object') {
    const hasFacets = STAGE1_FACET_KEYS.some(key => Array.isArray(parsed[key]));
    if (hasFacets) {
      return parsed;
    }
  }
  return null;
}

/**
 * Normalize Stage 1 output (extraction).
 * Handles ALL formats via helper functions.
 */
function normalizeStage1(parsed) {
  const legacy = tryStage1LegacyArray(parsed);
  if (legacy) {
    // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
    console.log(LOG_PREFIX, 'Stage 1: Legacy array format');
    return legacy;
  }

  const newFormat = tryStage1NewExtraction(parsed);
  if (newFormat) {
    // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
    console.log(LOG_PREFIX, `Stage 1: New extraction format with ${newFormat.extracted.length} items`);
    return newFormat;
  }

  const entityBased = tryStage1EntityBased(parsed);
  if (entityBased) {
    // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
    console.log(LOG_PREFIX, `Stage 1: Entity-based format with ${entityBased.entities.length} entities`);
    return entityBased;
  }

  const faceted = tryStage1Faceted(parsed);
  if (faceted) {
    // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
    console.log(LOG_PREFIX, 'Stage 1: Faceted format');
    return faceted;
  }

  const keys = parsed ? Object.keys(parsed).join(', ') : 'null';
  throw new Error(`Stage 1: Unrecognized format. Got keys: [${keys}]`);
}

/**
 * Normalize Stage 2 output (organize).
 * Expected format: {sn, recap: {outcomes, threads, state}, entities: [...]}
 */
function normalizeStage2(parsed) {
  if (!parsed.recap || typeof parsed.recap !== 'object') {
    // Check for legacy format with 'plot' field
    if (parsed.plot) {
      // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
      console.log(LOG_PREFIX, 'Stage 2: Converting legacy plot format to new recap format');
      return {
        sn: parsed.sn || '',
        recap: { outcomes: parsed.plot, threads: '', state: '' },
        entities: (parsed.entities || []).map(normalizeEntityFields)
      };
    }
    const keys = Object.keys(parsed).join(', ');
    throw new Error(`Stage 2: Missing 'recap' object. Got keys: [${keys}]`);
  }

  return {
    sn: parsed.sn || '',
    recap: {
      outcomes: parsed.recap.outcomes || '',
      threads: parsed.recap.threads || '',
      state: parsed.recap.state || ''
    },
    entities: (parsed.entities || []).map(normalizeEntityFields)
  };
}

/**
 * Normalize Stage 3 output (filter RC).
 * Expected format: {developments: [...], open: [...], state: [...], resolved: [...]}
 * Handles LLM deviations:
 * - string instead of array for any field
 * - wrapped in {recap: {...}} object
 * - legacy {rc: "string"} format
 */
function normalizeStage3(parsed) {
  // Check for legacy 'rc' field
  if (parsed.rc && typeof parsed.rc === 'string') {
    // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
    console.log(LOG_PREFIX, 'Stage 3: Converting legacy rc format to new format');
    return {
      developments: [parsed.rc],
      open: [],
      state: [],
      resolved: []
    };
  }

  // Check if LLM wrapped output in {recap: {...}} - unwrap it
  let source = parsed;
  if (parsed.recap && typeof parsed.recap === 'object') {
    // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
    console.log(LOG_PREFIX, 'Stage 3: Unwrapping from recap wrapper');
    source = parsed.recap;
  }

  // Normalize each field to array (handles string→array conversion)
  const developments = normalizeContentToArray(source.developments);
  const open = normalizeContentToArray(source.open);
  const state = normalizeContentToArray(source.state);
  const resolved = normalizeContentToArray(source.resolved);

  // Must have at least one non-empty field
  if (developments.length === 0 && open.length === 0 && state.length === 0 && resolved.length === 0) {
    const keys = Object.keys(parsed).join(', ');
    throw new Error(`Stage 3: All arrays empty. Got keys: [${keys}]`);
  }

  return {
    developments,
    open,
    state,
    resolved
  };
}

/**
 * Normalize Running Recap output.
 * Expected format: {recap: {developments, open, state}, entities: [...]}
 * Converts recap object to string for storage/display.
 * Handles LLM deviation: string instead of array for recap fields
 */
function normalizeRunningRecap(parsed) {
  let recapString = '';

  if (parsed.recap) {
    if (typeof parsed.recap === 'string') {
      // Already a string (legacy format)
      recapString = parsed.recap;
    } else if (typeof parsed.recap === 'object') {
      // New object format - normalize fields to arrays, then convert to string
      const normalizedRecap = {
        developments: normalizeContentToArray(parsed.recap.developments),
        open: normalizeContentToArray(parsed.recap.open),
        state: normalizeContentToArray(parsed.recap.state)
      };
      recapString = formatRecapObjectToString(normalizedRecap);
    }
  }

  if (!recapString.trim()) {
    const keys = Object.keys(parsed).join(', ');
    throw new Error(`Running recap: Empty recap content. Got keys: [${keys}]`);
  }

  return {
    recap: recapString,
    entities: (parsed.entities || []).map(normalizeEntityFields)
  };
}

/**
 * Normalize LLM output before saving to storage.
 * Call this after every LLM response, before saving.
 *
 * @param {1|2|3|'running'} stage - Which stage produced this output
 * @param {Object} parsed - The parsed LLM response
 * @returns {Object} - Normalized object ready for storage
 * @throws {Error} - If parsed is garbage or missing required fields
 */
export function normalizeStageOutput(stage, parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Stage ${stage}: LLM response is not an object (got ${typeof parsed})`);
  }

  switch (stage) {
    case STAGE.EXTRACTION:
    case 1:
      return normalizeStage1(parsed);

    case STAGE.ORGANIZE:
    case 2:
      return normalizeStage2(parsed);

    case STAGE.FILTER_RC:
    case 3: // eslint-disable-line no-magic-numbers -- Legacy fallback for numeric stage value
      return normalizeStage3(parsed);

    case STAGE.RUNNING:
    case 'running':
      return normalizeRunningRecap(parsed);

    default:
      // Unknown stage - pass through with entity normalization
      // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
      console.log(LOG_PREFIX, `Unknown stage ${stage}, passing through with entity normalization`);
      if (parsed.entities) {
        parsed.entities = parsed.entities.map(normalizeEntityFields);
      }
      return parsed;
  }
}

/**
 * Parse string input that may be JSON.
 * @returns {{ parsed: Object|null, plainText: string|null }} - parsed object or plainText string
 */
function parseStringInput(data) {
  const trimmed = data.trim();
  if (!trimmed) {
    return { parsed: null, plainText: '' };
  }

  // Strip markdown code fences if present
  let jsonStr = trimmed;
  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (codeFenceMatch) {
    jsonStr = codeFenceMatch[1].trim();
  }

  // Try to parse as JSON
  if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
    try {
      return { parsed: JSON.parse(jsonStr), plainText: null };
    } catch {
      return { parsed: null, plainText: trimmed };
    }
  }

  return { parsed: null, plainText: trimmed };
}

/**
 * Extract from multi-stage wrapper format.
 * Checks stage3, stage2, stage1 in reverse order (most processed first).
 */
function extractFromMultiStage(parsed) {
  if (parsed.stage3) {
    const result = extractFromStage3(parsed.stage3);
    if (result) {
      return result;
    }
  }
  if (parsed.stage2) {
    const result = extractFromStage2(parsed.stage2);
    if (result) {
      return result;
    }
  }
  if (parsed.stage1) {
    const result = extractFromStage1(parsed.stage1);
    if (result) {
      return result;
    }
  }
  return null;
}

/**
 * Extract from root-level format fields.
 * Handles new structured formats and legacy formats.
 */
function extractFromRootFormat(parsed) {
  // New structured Stage 3 format
  if (parsed.developments || parsed.open || parsed.state) {
    return formatStage3ToString(parsed);
  }

  // Stage 2 recap format (recap is object without entities at root)
  if (parsed.recap && typeof parsed.recap === 'object' && !parsed.entities) {
    return formatStage2RecapToString(parsed.recap);
  }

  // Running recap format (recap is string)
  if (parsed.recap && typeof parsed.recap === 'string') {
    return parsed.recap;
  }

  // Legacy: plot field
  if (parsed.plot && typeof parsed.plot === 'string') {
    return parsed.plot;
  }

  // Legacy: rc field
  if (parsed.rc && typeof parsed.rc === 'string') {
    return parsed.rc;
  }

  return null;
}

/**
 * Extract recap string content from stored data.
 * Handles all storage formats: multi-stage, legacy, structured objects.
 * Call this when reading recap content for display or injection.
 *
 * @param {string|Object} data - Raw stored data (JSON string or parsed object)
 * @returns {string} - Extracted recap content as string, or empty string if not found
 */
export function extractRecapString(data) {
  if (!data) {
    return '';
  }

  // Handle string input (may be JSON)
  let parsed = data;
  if (typeof data === 'string') {
    const { parsed: parsedObj, plainText } = parseStringInput(data);
    if (plainText !== null) {
      return plainText;
    }
    parsed = parsedObj;
  }

  if (!parsed || typeof parsed !== 'object') {
    return String(data);
  }

  // Try multi-stage wrapper format first
  const multiStageResult = extractFromMultiStage(parsed);
  if (multiStageResult) {
    return multiStageResult;
  }

  // Try root format fields
  const rootResult = extractFromRootFormat(parsed);
  if (rootResult) {
    return rootResult;
  }

  // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
  console.log(LOG_PREFIX, 'No recap content found in data');
  return '';
}

function extractFromStage3(stage3) {
  if (!stage3 || typeof stage3 !== 'object') {
    return null;
  }

  // New format with arrays
  if (stage3.developments || stage3.open || stage3.state) {
    return formatStage3ToString(stage3);
  }

  // Legacy string format
  if (stage3.rc && typeof stage3.rc === 'string') {
    return stage3.rc;
  }

  return null;
}

function extractFromStage2(stage2) {
  if (!stage2 || typeof stage2 !== 'object') {
    return null;
  }

  // New format with recap object
  if (stage2.recap && typeof stage2.recap === 'object') {
    return formatStage2RecapToString(stage2.recap);
  }

  // Legacy format with plot string
  if (stage2.plot && typeof stage2.plot === 'string') {
    return stage2.plot;
  }

  return null;
}

function extractFromStage1(stage1) {
  if (!stage1 || typeof stage1 !== 'object') {
    return null;
  }

  // Stage 1 extracts items, not formatted recap
  // Return extracted items as text if present
  if (Array.isArray(stage1.extracted) && stage1.extracted.length > 0) {
    return stage1.extracted.join('\n');
  }

  return null;
}

/**
 * Check if stored data has non-empty recap content.
 * Convenience function for conditional logic.
 *
 * @param {string|Object} data - Raw stored data
 * @returns {boolean} - True if recap content exists and is non-empty
 */
export function hasRecapContent(data) {
  const content = extractRecapString(data);
  return content.trim().length > 0;
}

/**
 * Normalize entity content for storage/display.
 * Exported for use by other modules that need to normalize entity content.
 */
export { normalizeEntityFields, normalizeContentToArray };

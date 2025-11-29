/**
 * Centralized recap normalization and extraction.
 *
 * CANONICAL STORAGE FORMATS:
 * - Stage 1/2 (entity-based): {sn, plot: "DEV:...\nPEND:...", entities:[...]}
 * - Stage 1/2 (legacy): {chronological_items:[...]} or {plot:[...], goals:[...], ...}
 * - Stage 3: {rc: "DEV:...\nPEND:..."}
 * - Running recap: {recap: "DEV:...\nPEND:...", ...}
 * - Multi-stage wrapper: {stage1:{...}, stage2:{...}, stage3:{...}, scene_name:"..."}
 *
 * LLM DEVIATIONS HANDLED:
 * - Object format: {DEV:"...", PEND:"..."} → "DEV:...\nPEND:..."
 * - Field name variations: plot/rc/recap used interchangeably by LLM
 * - Legacy formats: chronological_items, faceted arrays (plot/goals/reveals/etc as arrays)
 *
 * VALIDATION (positive compliance - if LLM refuses/errors, it won't have proper fields):
 * - Stage 1/2: accepts recap field (string) OR legacy markers (arrays)
 * - Stage 3/Running: REQUIRES recap field (string) - legacy NOT allowed
 * - Entity-based: validates recap field is non-empty string
 * - Legacy (Stage 1/2 only): passes through as-is
 * - Garbage: THROWS to trigger retry
 *
 * USAGE:
 * - WRITE: Call normalizeStageOutput(stage, parsed) after every LLM response before saving
 *          It will throw if the response is garbage (no recap field AND not legacy)
 * - READ: Call extractRecapString(data) when reading recap content from stored data
 */

// NOTE: This module must NOT import from utils.js or index.js to avoid circular dependencies.
// It is imported by sceneBreak.js, operationHandlers.js, runningSceneRecap.js, and macros/scene_recaps.js
// which are all re-exported by index.js. utils.js imports from index.js, creating a cycle.

const LOG_PREFIX = '[AutoRecap] [recapNormalization]';

// Stage number constants for normalizeStageOutput
export const STAGE = {
  EXTRACTION: 1,
  ORGANIZE: 2,
  FILTER_RC: 3,
  RUNNING: 'running'
};

/**
 * Normalize DEV/PEND value from object format to string format.
 * LLM sometimes returns {DEV: "...", PEND: "..."} instead of "DEV: ... PEND: ..."
 *
 * @param {*} value - The value to normalize (string, object, or other)
 * @returns {*} - String if normalized, original value otherwise
 */
function normalizeDevPendValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // Check if it looks like a DEV/PEND object
    if ('DEV' in value || 'PEND' in value) {
      const parts = [];
      if (value.DEV) {
        parts.push(`DEV: ${value.DEV}`);
      }
      if (value.PEND) {
        parts.push(`PEND: ${value.PEND}`);
      }
      if (parts.length > 0) {
        const normalized = parts.join('\n\n');
        // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
        console.log(LOG_PREFIX, `Converted DEV/PEND object to string: ${normalized.length} chars`);
        return normalized;
      }
    }
  }
  return value;
}

/**
 * Get the recap field value from a parsed object, checking all possible field names.
 * Does NOT normalize - just extracts the raw value.
 *
 * @param {Object} obj - Parsed object to extract from
 * @returns {*} - The recap field value (may be undefined if not found)
 */
function getRecapFieldValue(obj) {
  if (!obj || typeof obj !== 'object') {
    return null;
  }
  // Check field names in order of preference
  // plot (Stage 1/2), rc (Stage 3), recap (Running)
  return obj.plot ?? obj.rc ?? obj.recap ?? null;
}

// Legacy format detection - these indicate valid legacy output, not garbage
const LEGACY_MARKERS = ['chronological_items', 'goals', 'reveals', 'state', 'tone', 'stance', 'voice', 'quotes', 'appearance', 'verbatim', 'docs'];

/**
 * Check if parsed object is a legacy format (arrays instead of recap string).
 */
function isLegacyFormat(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return false;
  }

  // chronological_items array = legacy
  if (Array.isArray(parsed.chronological_items)) {
    return true;
  }

  // Faceted format: any legacy marker is an array
  if (LEGACY_MARKERS.some(key => Array.isArray(parsed[key]))) {
    return true;
  }

  return false;
}

/**
 * Get canonical field name for a stage.
 */
function getCanonicalField(stage) {
  if (stage === STAGE.FILTER_RC) {
    return 'rc';
  }
  if (stage === STAGE.RUNNING) {
    return 'recap';
  }
  return 'plot';
}

/**
 * Apply normalization to the recap field and remove non-canonical names.
 */
function applyFieldNormalization(normalized, stage, rawValue) {
  const normalizedValue = normalizeDevPendValue(rawValue);
  const canonicalField = getCanonicalField(stage);

  normalized[canonicalField] = normalizedValue;

  // Remove non-canonical field names
  const allFields = ['plot', 'rc', 'recap'];
  for (const field of allFields) {
    if (field !== canonicalField) {
      delete normalized[field];
    }
  }

  // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
  console.log(LOG_PREFIX, `Stage ${stage}: normalized to ${canonicalField} field`);
  return canonicalField;
}

/**
 * Normalize LLM output before saving to storage.
 * Call this after every LLM response, before saving.
 *
 * Handles:
 * - Entity-based format: normalizes plot/rc/recap field, validates non-empty string
 * - Legacy format: passes through as-is (arrays, not strings)
 * - Garbage: THROWS to trigger retry
 *
 * @param {1|2|3|'running'} stage - Which stage produced this output
 * @param {Object} parsed - The parsed LLM response
 * @returns {Object} - Normalized object ready for storage
 * @throws {Error} - If parsed is garbage (not object, no recap field AND not legacy)
 */
export function normalizeStageOutput(stage, parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Stage ${stage}: LLM response is not an object (got ${typeof parsed})`);
  }

  // Check for recap field (entity-based format)
  const rawValue = parsed.plot ?? parsed.rc ?? parsed.recap;
  const hasRecapField = rawValue !== null && rawValue !== undefined;

  // Check for legacy format (arrays instead of recap string)
  const isLegacy = isLegacyFormat(parsed);

  // Stage 3 and Running MUST have a recap field - legacy not allowed
  const requiresRecapField = stage === STAGE.FILTER_RC || stage === STAGE.RUNNING;

  // Validate based on stage requirements
  validateStageInput(stage, hasRecapField, isLegacy, requiresRecapField, parsed);

  // Legacy format (Stage 1/2 only): pass through as-is
  if (isLegacy && !hasRecapField) {
    // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
    console.log(LOG_PREFIX, `Stage ${stage}: Legacy format detected, passing through`);
    return parsed;
  }

  // Entity-based format: normalize and validate
  const normalized = { ...parsed };
  const canonicalField = applyFieldNormalization(normalized, stage, rawValue);
  validateNormalizedContent(stage, normalized[canonicalField], canonicalField);

  return normalized;
}

/**
 * Validate stage input based on requirements.
 */
function validateStageInput(stage, hasRecapField, isLegacy, requiresRecapField, parsed) {
  if (requiresRecapField && !hasRecapField) {
    const keys = Object.keys(parsed).join(', ');
    console.error(LOG_PREFIX, `Stage ${stage}: Missing required recap field. Got keys: [${keys}]`);
    throw new Error(`Stage ${stage}: Response missing required recap field (plot/rc/recap). Got: [${keys}]`);
  }

  if (!requiresRecapField && !hasRecapField && !isLegacy) {
    const keys = Object.keys(parsed).join(', ');
    console.error(LOG_PREFIX, `Stage ${stage}: No recap field and not legacy format. Got keys: [${keys}]`);
    throw new Error(`Stage ${stage}: Response missing recap field (plot/rc/recap) and not legacy format. Got: [${keys}]`);
  }
}

/**
 * Validate normalized content is a non-empty string.
 */
function validateNormalizedContent(stage, value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`Stage ${stage}: Recap field '${fieldName}' is not a string (got ${typeof value})`);
  }
  if (!value.trim()) {
    throw new Error(`Stage ${stage}: Recap field '${fieldName}' is empty`);
  }
}

/**
 * Parse string data to object, handling code fences and JSON.
 * Returns the parsed object or null if not JSON.
 */
function parseStringToObject(data) {
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
      // Not valid JSON - return as plain text
      return { parsed: null, plainText: trimmed };
    }
  }
  // Not JSON - return as plain text
  return { parsed: null, plainText: trimmed };
}

/**
 * Try to extract recap from a stage object, returning the normalized string or null.
 */
function tryExtractFromStage(stageObj, stageName) {
  const value = getRecapFieldValue(stageObj);
  if (value !== null) {
    const result = normalizeDevPendValue(value);
    if (typeof result === 'string' && result.trim()) {
      // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
      console.log(LOG_PREFIX, `Extracted from ${stageName}: ${result.length} chars`);
      return result;
    }
  }
  return null;
}

/**
 * Extract recap string content from stored data.
 * Handles all storage formats: multi-stage, legacy, any field names.
 * Call this when reading recap content for display, injection, or processing.
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
    const { parsed: parsedObj, plainText } = parseStringToObject(data);
    if (plainText !== null) {
      return plainText;
    }
    parsed = parsedObj;
  }

  if (!parsed || typeof parsed !== 'object') {
    return String(data);
  }

  // Multi-stage format: check stages in reverse order (stage3 has most processed content)
  const stage3Result = tryExtractFromStage(parsed.stage3, 'stage3');
  if (stage3Result) {
    return stage3Result;
  }

  const stage2Result = tryExtractFromStage(parsed.stage2, 'stage2');
  if (stage2Result) {
    return stage2Result;
  }

  const stage1Result = tryExtractFromStage(parsed.stage1, 'stage1');
  if (stage1Result) {
    return stage1Result;
  }

  // Legacy/root format: check root fields directly
  const rootResult = tryExtractFromStage(parsed, 'root');
  if (rootResult) {
    return rootResult;
  }

  // No recap content found
  // eslint-disable-next-line no-console -- Direct console to avoid circular dependency
  console.log(LOG_PREFIX, `No recap content found in data`);
  return '';
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

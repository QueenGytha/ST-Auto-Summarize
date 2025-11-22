
import {
  MODULE_NAME_FANCY,
  get_settings,
  debounce,
  getContext,
  debounce_timeout,
  getMaxContextSize,
  default_settings,
  set_settings,
  refresh_settings,
  refresh_memory,
  save_profile } from
'./index.js';
import {
  UI_UPDATE_DELAY_MS,
  HEX_COLOR_BASE,
  MAX_QUEUE_PRIORITY,
  DEBUG_OUTPUT_MEDIUM_LENGTH,
  FULL_COMPLETION_PERCENTAGE,
  CHAR_CODE_LF,
  CHAR_CODE_CR,
  CHAR_CODE_TAB,
  CHAR_CODE_BACKSPACE,
  CHAR_CODE_FORM_FEED,
  JSON_FIELD_START_ADVANCE
} from './constants.js';
import { jsonrepair } from './vendor/index.js';

// Consistent prefix for ALL extension logs - easily searchable
const LOG_PREFIX = '[AutoRecap]';

// Subsystem prefixes for filtering specific functionality
const SUBSYSTEM = {
  CORE: '[Core]',
  MEMORY: '[Memory]',
  SCENE: '[Scene]',
  RUNNING: '[Running]',
  COMBINED: '[Combined]',
  VALIDATION: '[Validation]',
  UI: '[UI]',
  PROFILE: '[Profile]',
  EVENT: '[Event]',
  QUEUE: '[Queue]',
  LOREBOOK: '[Lorebook]'
};

function log(subsystem , ...args ) {
  // subsystem and args are any type for flexible logging - legitimate use of any
  // Always log with prefix - subsystem check not needed as both branches are identical
  // eslint-disable-next-line no-console -- Console is the intended logging mechanism for extension
  console.log(LOG_PREFIX, subsystem, ...args);
}

function debug(subsystem , ...args ) {
  // subsystem and args are any type for flexible logging - legitimate use of any
  // Always log with prefix - subsystem check not needed as both branches are identical
  // eslint-disable-next-line no-console -- Console is the intended logging mechanism for extension
  console.log(LOG_PREFIX, '[DEBUG]', subsystem, ...args);
}

function error(subsystem , ...args ) {
  // subsystem and args are any type for flexible error logging - legitimate use of any
  // If subsystem is not a string starting with '[', treat it as a regular arg
  if (typeof subsystem !== 'string' || !subsystem.startsWith('[')) {
    console.error(LOG_PREFIX, '[ERROR]', subsystem, ...args);
    const message = typeof subsystem === 'string' ? subsystem : String(subsystem);
    toastr.error(message, MODULE_NAME_FANCY);
  } else {
    console.error(LOG_PREFIX, '[ERROR]', subsystem, ...args);
    const message = typeof args[0] === 'string' ? args[0] : String(args[0]);
    toastr.error(message, MODULE_NAME_FANCY);
  }
}

function toast(message , type  = "info") {
  // debounce the toast messages
  toastr[type](message, MODULE_NAME_FANCY);
}
const toast_debounced = debounce(toast, UI_UPDATE_DELAY_MS);

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);
function count_tokens(text , padding  = 0) {
  // text is any type because ST API accepts any type - legitimate use of any
  // count the number of tokens in a text
  const ctx = getContext();
  return ctx.getTokenCount(text, padding);
}
function get_context_size() {
  // Get the current context size
  return getMaxContextSize();
}
function get_short_token_limit() {
  // Get the single message recap token limit, given the current context size and settings
  const message_recap_context_limit = get_settings('message_recap_context_limit');
  const number_type = get_settings('message_recap_context_type');
  if (number_type === "percent") {
    const context_size = get_context_size();
    return Math.floor(context_size * message_recap_context_limit / FULL_COMPLETION_PERCENTAGE);
  } else {
    return message_recap_context_limit;
  }
}
function get_current_character_identifier() {
  // uniquely identify the current character
  // You have to use the character's avatar image path to uniquely identify them
  const context = getContext();
  if (context.groupId) {
    return null; // if a group is selected, return
  }

  // otherwise get the avatar image path of the current character
  const index = context.characterId;
  if (!index) {// not a character
    return null;
  }

  return context.characters[index].avatar;
}
function get_current_chat_identifier() {
  // uniquely identify the current chat
  const context = getContext();
  if (context.groupId) {
    return context.groupId;
  }
  return context.chatId;

}
function get_extension_directory() {
  // get the directory of the extension
  const index_path = new URL(import.meta.url).pathname;
  return index_path.slice(0, index_path.lastIndexOf('/')); // remove the /index.js from the path
}
function clean_string_for_title(text ) {
  // clean a given string for use in a div title.
  return text.replace(/["&'<>]/g, function (match) {
    switch (match) {
      case '"':return "&quot;";
      case "&":return "&amp;";
      case "'":return "&apos;";
      case "<":return "&lt;";
      case ">":return "&gt;";
      default:return match; // Flow requires explicit default case
    }
  });
}
function escape_string(text ) {
  // escape control characters in the text
  if (!text) {return text;}
  return text.replace(/[\x00-\x1F\x7F]/g, function (match) {
    // Escape control characters
    switch (match) {
      case '\n':return '\\n';
      case '\t':return '\\t';
      case '\r':return '\\r';
      case '\b':return '\\b';
      case '\f':return '\\f';
      default:return '\\x' + match.charCodeAt(0).toString(HEX_COLOR_BASE).padStart(2, '0');
    }
  });
}
function unescape_string(text ) {
  // given a string with escaped characters, unescape them
  if (!text) {return text;}
  return text.replace(/\\[ntrbf0x][0-9a-f]{2}|\\[ntrbf]/g, function (match) {
    switch (match) {
      case '\\n':return '\n';
      case '\\t':return '\t';
      case '\\r':return '\r';
      case '\\b':return '\b';
      case '\\f':return '\f';
      default:{
          // Handle escaped hexadecimal characters like \\xNN
          const hexMatch = match.match(/\\x([0-9a-f]{2})/i);
          if (hexMatch) {
            return String.fromCharCode(Number.parseInt(hexMatch[1], HEX_COLOR_BASE));
          }
          return match; // Return as is if no match
        }
    }
  });
}

function convertLiteralNewlinesToActual(text ) {
  // Convert literal \n strings to actual newline characters for display
  if (!text) {return text;}
  return text.replace(/\\n/g, '\n');
}

function convertActualNewlinesToLiteral(text ) {
  // Convert actual newline characters to literal \n strings for storage
  if (!text) {return text;}
  return text.replace(/\n/g, '\\n');
}
function check_st_version() {
  // Check to see if the current version of ST is acceptable.
  // Currently checks for the "symbols" property of the global context,
  //   which was added in https://github.com/SillyTavern/SillyTavern/pull/3763#issue-2948421833
  log("Checking ST version...");
  if (getContext().symbols !== undefined) {
    return true;
  } else {
    log(`Symbols not found in context: [${getContext().symbols}]`);
    toast("Incompatible ST version - please update.", "error");
    return false;
  }
}

async function display_injection_preview() {
  let text = refresh_memory();
  text = `...\n\n${text}\n\n...`;
  await display_text_modal("Memory State Preview", text);
}

async function display_text_modal(title , text  = "") {
  // Display a modal with the given title and text
  // replace newlines in text with <br> for HTML
  const ctx = getContext();
  const htmlText = text.replace(/\n/g, '<br>');
  const html = `<h2>${title}</h2><div style="text-align: left; overflow: auto;">${htmlText}</div>`;
  //const popupResult = await ctx.callPopup(html, 'text', undefined, { okButton: `Close` });
  const popup = new ctx.Popup(html, ctx.POPUP_TYPE.TEXT, undefined, { okButton: 'Close', allowVerticalScrolling: true });
  await popup.show();
}
async function get_user_setting_text_input(key , title , description  = "", _defaultValue  = "") {
  // _defaultValue is unused parameter - any is acceptable
  const value = get_settings(key) ?? '';
  const htmlTitle = `
<h3>${title}</h3>
<p>${description}</p>
`;
  const ctx = getContext();
  // Use let with any type annotation to avoid Flow recursive definition error
  // Can't use const because Flow would throw recursive-definition error
  // popup is any type to avoid Flow recursive definition - legitimate use of any
  /* eslint-disable prefer-const -- Variable must be let to reference itself in callback before assignment */
  let popup ;
  popup = new ctx.Popup(htmlTitle, ctx.POPUP_TYPE.INPUT, value, {
    rows: 20,
    customButtons: [{
      text: 'Restore Default',
      appendAtEnd: true,
      action: function () {
        // Capture popup from outer scope since 'this' is not bound correctly
        popup.mainInput.value = default_settings[key] ?? '';
      }
    }]
  });
  popup.mainInput.classList.remove('result-control');
  const input = await popup.show();
  /* eslint-enable prefer-const -- Re-enable after self-referencing pattern */
  if (input !== undefined && input !== null && input !== false) {
    set_settings(key, input);
    save_profile(); // auto-save when prompt is edited
    refresh_settings();
    refresh_memory();
  }
}

export {
  SUBSYSTEM,
  log,
  debug,
  error,
  toast,
  toast_debounced,
  saveChatDebounced,
  count_tokens,
  get_context_size,
  get_short_token_limit,
  get_current_character_identifier,
  get_current_chat_identifier,
  get_extension_directory,
  clean_string_for_title,
  escape_string,
  unescape_string,
  convertLiteralNewlinesToActual,
  convertActualNewlinesToLiteral,
  check_st_version,
  display_injection_preview,
  display_text_modal,
  get_user_setting_text_input };


// Name helpers for Auto‑Lorebooks
function sanitizeNameSegment(text ) {
  // Remove filesystem-hostile characters and normalize whitespace
  let s = String(text ?? '');
  s = s.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim();
  // Collapse multiple spaces
  s = s.replace(/\s{2,}/g, ' ');
  try {return s.normalize('NFC');} catch {return s;}
}

/**
 * Escape control characters in a string for JSON compatibility.
 * Tracks escape state to avoid double-escaping already-escaped sequences.
 * @param {string} str - String that may contain control characters
 * @returns {string} String with control characters escaped
 */
function escapeJsonControlChars(str) {
  let result = '';
  let isEscaped = false;

  for (let j = 0; j < str.length; j++) {
    const charCode = str.charCodeAt(j);
    const char = str[j];

    if (isEscaped) {
      result += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      isEscaped = true;
      continue;
    }

    if (charCode === CHAR_CODE_LF) {
      result += '\\n';
    } else if (charCode === CHAR_CODE_CR) {
      result += '\\r';
    } else if (charCode === CHAR_CODE_TAB) {
      result += '\\t';
    } else if (charCode === CHAR_CODE_BACKSPACE) {
      result += '\\b';
    } else if (charCode === CHAR_CODE_FORM_FEED) {
      result += '\\f';
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Check if a quote character appears to be a closing quote based on context.
 * @param {string} jsonString - The full JSON string
 * @param {number} index - Index of the quote character
 * @returns {boolean} True if this appears to be a closing quote
 */
function isLikelyClosingQuote(jsonString, index) {
  const nextChar = index + 1 < jsonString.length ? jsonString[index + 1] : '';

  // Definitely closing if followed by JSON structural characters or EOF
  if (nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === '') {
    return true;
  }

  // If followed by whitespace, check what comes after the whitespace
  if (/\s/.test(nextChar)) {
    // Look ahead to find first non-whitespace character
    let lookAhead = index + 2;
    while (lookAhead < jsonString.length && /\s/.test(jsonString[lookAhead])) {
      lookAhead++;
    }

    const charAfterWhitespace = lookAhead < jsonString.length ? jsonString[lookAhead] : '';

    // Closing quote if whitespace is followed by JSON structural characters
    // NOT a closing quote if whitespace is followed by regular text (handles dialogue: "Hello," she said)
    return charAfterWhitespace === ',' || charAfterWhitespace === '}' || charAfterWhitespace === ']' || charAfterWhitespace === '';
  }

  return false;
}

/**
 * Check if a newline appears to end the JSON string value.
 * @param {string} jsonString - The full JSON string
 * @param {number} index - Index of the newline character
 * @returns {boolean} True if this newline likely ends the value
 */
function isValueEndingNewline(jsonString, index) {
  // ONLY treat newline as ending value at absolute EOF
  // Previous logic (/^\n\s*[}\]]/) was too aggressive and caused false positives
  // when multi-line string content happened to contain patterns like "\n  }"
  // Let JSON repair logic handle truly malformed strings instead of guessing
  return index === jsonString.length - 1;
}

/**
 * Process a JSON string value, escaping control characters and adding closing quote if needed.
 * @param {string} jsonString - The full JSON string
 * @param {number} startIndex - Index where the value content starts (after opening quote)
 * @returns {{result: string, nextIndex: number}} Processed value and next index
 */
function processJsonStringValue(jsonString, startIndex) {
  let valueContent = '';
  let i = startIndex;

  while (i < jsonString.length) {
    const char = jsonString[i];

    if (char === '"' && isLikelyClosingQuote(jsonString, i)) {
      return {
        result: escapeJsonControlChars(valueContent) + '"',
        nextIndex: i + 1
      };
    } else if (char === '\n' && isValueEndingNewline(jsonString, i)) {
      return {
        result: escapeJsonControlChars(valueContent) + '"',
        nextIndex: i
      };
    } else {
      valueContent += char;
      i++;
    }
  }

  return {
    result: escapeJsonControlChars(valueContent) + '"',
    nextIndex: i
  };
}

/**
 * Aggressively normalize JSON by escaping literal newlines in string values.
 * This handles both well-formed strings and malformed strings without closing quotes.
 * @param {string} jsonString - JSON string that may have literal newlines in values
 * @returns {string} JSON with literal newlines replaced with \n escapes
 */
function normalizeJsonStringValues(jsonString) {
  let normalized = '';
  let i = 0;

  while (i < jsonString.length) {
    // Handle both spaced (`: "`) and compact (`:"`) JSON formats
    // Mobile browsers may return compact JSON without spaces after colons
    const hasSpace = i < jsonString.length - 2 &&
      jsonString[i] === ':' &&
      /\s/.test(jsonString[i + 1]) &&
      jsonString[i + 2] === '"';

    const isCompact = i < jsonString.length - 1 &&
      jsonString[i] === ':' &&
      jsonString[i + 1] === '"';

    if (hasSpace) {
      normalized += ': "';
      const processed = processJsonStringValue(jsonString, i + JSON_FIELD_START_ADVANCE);
      normalized += processed.result;
      i = processed.nextIndex;
    } else if (isCompact) {
      normalized += ':"';
      const processed = processJsonStringValue(jsonString, i + 2); // Skip : and "
      normalized += processed.result;
      i = processed.nextIndex;
    } else {
      normalized += jsonString[i];
      i++;
    }
  }

  return normalized;
}

/**
 * Repair and parse malformed JSON using the jsonrepair library.
 * Handles common LLM output issues: unescaped quotes, control chars, truncation, etc.
 *
 * @param {string} jsonString - Potentially malformed JSON string
 * @param {string} context - Context for logging (e.g., "scene break detection")
 * @returns {Object} Parsed JSON object
 * @throws {Error} If repair attempts fail
 */
function repairAndParseJson(jsonString, context = 'JSON repair') {
  // Try native parse first (fastest path)
  try {
    return JSON.parse(jsonString);
  } catch {
    debug(SUBSYSTEM.CORE, `[JSON Repair] Native parse failed in ${context}, using jsonrepair library`);
  }

  // Use jsonrepair library for comprehensive repair
  try {
    const repaired = jsonrepair(jsonString);
    const parsed = JSON.parse(repaired);
    debug(SUBSYSTEM.CORE, `[JSON Repair] Successfully repaired JSON using jsonrepair in ${context}`);
    return parsed;
  } catch (repairErr) {
    error(SUBSYSTEM.CORE, `[JSON Repair] jsonrepair failed in ${context}:`, repairErr);
    throw new Error(`${context}: Could not repair JSON - ${repairErr.message}`);
  }
}

/**
 * Preprocess raw JSON string by stripping fences, preambles, postambles, and normalizing control chars.
 * @param {string} jsonString - Raw JSON string to preprocess
 * @param {string} context - Context for debug logging
 * @returns {string} Preprocessed JSON string
 */
function preprocessJsonString(jsonString, context) {
  let cleaned = jsonString.trim();

  // Try to strip code fences - handle both actual newlines and escaped \n
  let codeFenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (!codeFenceMatch) {
    // Try with literal \n (escaped newlines)
    codeFenceMatch = cleaned.match(/```(?:json)?\\n([\s\S]*?)\\n```/);
  }
  if (codeFenceMatch) {
    cleaned = codeFenceMatch[1].trim();
    debug(SUBSYSTEM.CORE, `[JSON Extract] Stripped code fences from ${context}`);
  }

  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const partialJsonMatch = cleaned.match(/^\s*"[^"]+"\s*:/);
    if (partialJsonMatch && cleaned.includes('}')) {
      cleaned = '{' + cleaned;
      debug(SUBSYSTEM.CORE, `[JSON Extract] Repaired partial JSON (added opening brace) in ${context}`);
    }
  }

  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const jsonStartMatch = cleaned.match(/[{[]/);
    if (jsonStartMatch) {
      const jsonStart = cleaned.indexOf(jsonStartMatch[0]);
      cleaned = cleaned.slice(jsonStart);
      debug(SUBSYSTEM.CORE, `[JSON Extract] Stripped preamble from ${context}`);
    }
  }

  if (!cleaned.endsWith('}') && !cleaned.endsWith(']')) {
    const lastBrace = cleaned.lastIndexOf('}');
    const lastBracket = cleaned.lastIndexOf(']');
    const lastJsonChar = Math.max(lastBrace, lastBracket);
    if (lastJsonChar > 0) {
      cleaned = cleaned.slice(0, lastJsonChar + 1);
      debug(SUBSYSTEM.CORE, `[JSON Extract] Stripped postamble from ${context}`);
    }
  }

  const beforeNormalize = cleaned;
  cleaned = normalizeJsonStringValues(cleaned);
  if (cleaned !== beforeNormalize) {
    debug(SUBSYSTEM.CORE, `[JSON Extract] Pre-normalized literal control characters in ${context}`);
  }

  return cleaned;
}

/**
 * Extract and parse JSON from AI responses, handling common issues like preambles and code fences.
 * @param {string} rawResponse - The raw AI response that should contain JSON
 * @param {Object} options - Optional validation and extraction options
 * @param {string[]} options.requiredFields - Array of field names that must exist in the parsed JSON
 * @param {string} options.context - Context string for error messages (e.g., "merge operation", "scene recap")
 * @returns {Object} The parsed JSON object
 * @throws {Error} If JSON cannot be extracted or parsed, or if required fields are missing
 */
export function extractJsonFromResponse(rawResponse, options = {}) {
  const { requiredFields = [], context = 'AI response' } = options;

  // Handle both primitive strings and String objects (from llmClient token breakdown attachment)
  const isStringPrimitive = typeof rawResponse === 'string';
  const isStringObject = rawResponse instanceof String;

  if (!rawResponse || (!isStringPrimitive && !isStringObject)) {
    throw new Error(`${context}: Response is empty or not a string`);
  }

  // Convert String object to primitive for processing
  const responseStr = isStringObject ? rawResponse.toString() : rawResponse;
  const cleaned = preprocessJsonString(responseStr, context);

  // Parse JSON with comprehensive repair
  let parsed;
  try {
    parsed = repairAndParseJson(cleaned, context);
  } catch (parseErr) {
    // repairAndParseJson already logged the error details
    error(SUBSYSTEM.CORE, `[JSON Extract] Attempted to parse:`, cleaned.slice(0, DEBUG_OUTPUT_MEDIUM_LENGTH));
    throw parseErr; // Re-throw the error from repairAndParseJson
  }

  // Step 5: Validate required fields
  if (requiredFields.length > 0) {
    const missing = requiredFields.filter(field => !(field in parsed));
    if (missing.length > 0) {
      error(SUBSYSTEM.CORE, `[JSON Extract] Missing required fields in ${context}:`, missing);
      throw new Error(`${context}: JSON missing required fields: ${missing.join(', ')}`);
    }
  }

  debug(SUBSYSTEM.CORE, `[JSON Extract] Successfully parsed JSON from ${context}`);
  return parsed;
}

export function generateLorebookName(template , characterName , chatId ) {
  const charSeg = sanitizeNameSegment(characterName || 'Unknown');
  const chatSeg = sanitizeNameSegment(chatId || 'Chat');
  const tpl = template || 'z-AutoLB-{{char}}-{{chat}}';
  return tpl.
  replace(/\{\{\s*char\s*\}\}/g, charSeg).
  replace(/\{\{\s*chat\s*\}\}/g, chatSeg);
}

export function getUniqueLorebookName(baseName , existingNames ) {
  const existing = Array.isArray(existingNames) ? existingNames : [];
  let chosen  = baseName;

  if (existing.includes(baseName)) {
    let found  = '';
    // Try numeric suffixes (2..9999)
    for (let i = 2; i <= MAX_QUEUE_PRIORITY; i++) {
      const candidate = `${baseName} (${i})`;
      if (!existing.includes(candidate)) {found = candidate;break;}
    }
    chosen = found || `${baseName} (${Date.now()})`;
  }

  return chosen;
}
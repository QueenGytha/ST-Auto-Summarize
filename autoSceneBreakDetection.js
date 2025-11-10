
import {
  get_settings,
  getContext,
  get_data,
  set_data,
  debug,
  error,
  toast,
  log,
  SUBSYSTEM,
  saveChatDebounced } from
'./index.js';
import { DEFAULT_MAX_TOKENS } from './constants.js';

const DEFAULT_MINIMUM_SCENE_LENGTH = 4;

// Disallow rationale that references formatting/separators instead of content
export function validateRationaleNoFormatting(rationale) {
  const text = String(rationale || '');
  const lower = text.toLowerCase();

  // Patterns for common decorative separators / formatting mentions
  const patterns = [
    /(^|[^-])-{3,}([^\w-]|$)/, // --- (not part of a word/hyphen chain)
    /\*{3,}/,                  // ***
    /_{3,}/,                   // ___
    /= {3,}|={3,}/,            // === or spaced variants
    /\bchapter\s+[\wivx]+\b/i, // "Chapter X" (numbers or roman numerals)
    /\bseparator\b/i,
    /\bseparators\b/i,
    /\bdivider\b/i,
    /\bhorizontal\s+rule\b/i,
    /\bheading(s)?\b/i,
    /\bmarkdown\b/i
  ];

  for (const p of patterns) {
    if (p.test(text) || p.test(lower)) {
      return { valid: false, reason: 'rationale references formatting markers (decorative separators/headings) which are disallowed' };
    }
  }

  return { valid: true };
}

// Objective-only rationale detection (no time/location/cast anchors)
export function rationaleSuggestsOnlyObjectiveShift(rationale) {
  const text = String(rationale || '').toLowerCase();
  if (!text) { return false; }
  const objectiveHints = [
    'objective', 'plan', 'decision', 'decides', 'decided', 'agree', 'agrees',
    'agreement', 'team up', 'team-up', 'partner', 'partnership', 'dynamic',
    'shift in', 'reframe', 'pivot', 'blindsided', 'relationship'
  ];
  const transitionAnchors = [
    // time
    'the next morning', 'next morning', 'the next day', 'next day', 'hours later',
    'later that night', 'later that evening', 'dawn', 'at dawn', 'sunrise', 'by morning', 'by evening',
    // location
    'arrived', 'arrives', 'entered', 'enters', 'exited', 'exits', 'left', 'departed', 'returned', 'back to',
    'made their way', 'reached', 'headed to', 'walked to', 'went to', 'came to',
    // cast
    'joined', 'only', 'alone', 'the others', 'remained', 'entered the room'
  ];
  const hasObjectiveOnly = objectiveHints.some(k => text.includes(k));
  const hasAnchor = transitionAnchors.some(k => text.includes(k));
  return hasObjectiveOnly && !hasAnchor;
}

function hasExplicitTimeTransition(text) {
  const t = String(text || '').toLowerCase();
  if (!t) { return false; }
  const patterns = [
    /\bthe next (morning|day|evening|night)\b/i,
    /\bnext (morning|day|evening|night)\b/i,
    /\bhours later\b/i,
    /\blater that (night|evening|day)\b/i,
    /\bat (dawn|sunrise)\b/i,
    /\bdawn arrived\b/i,
    /\bby (morning|evening|night)\b/i
  ];
  return patterns.some(p => p.test(t));
}

function hasExplicitLocationTransition(text) {
  const t = String(text || '').toLowerCase();
  if (!t) { return false; }
  const patterns = [
    /\b(arrived|arrives|entered|enters|exited|exits|left|departed|returned)\b/i,
    /\b(back to|made (?:their|his|her) way to|reached|headed to|walked to|went to|came to)\b/i
  ];
  return patterns.some(p => p.test(t));
}

function hasCastChangeIndicators(text) {
  const t = String(text || '').toLowerCase();
  if (!t) { return false; }
  const patterns = [
    /\bjoined\b/i,
    /\bonly\b/i,
    /\balone\b/i,
    /\bthe others\b/i,
    /\bremained\b/i
  ];
  return patterns.some(p => p.test(t));
}

// Continuity veto: if no time/location/cast transition around candidate, prefer continuation
export function shouldVetoByContinuityAndObjective(chat, candidateIndex, rationale, forwardWindow = 2) {
  if (!Array.isArray(chat) || typeof candidateIndex !== 'number') {
    return false;
  }

  const candidate = chat[candidateIndex];
  const texts = [];
  if (candidate?.mes) { texts.push(candidate.mes); }
  for (let i = 1; i <= forwardWindow; i++) {
    const next = chat[candidateIndex + i];
    if (next?.mes) { texts.push(next.mes); }
  }

  const hasTransition = texts.some((tx) => (
    hasExplicitTimeTransition(tx) || hasExplicitLocationTransition(tx) || hasCastChangeIndicators(tx)
  ));

  const objectiveOnly = rationaleSuggestsOnlyObjectiveShift(rationale);

  // Veto when rationale is objective-only AND no clear transition cues present nearby
  return objectiveOnly && !hasTransition;
}

// Remove decorative-only separator lines from a message to reduce LLM bias
function stripDecorativeSeparators(text) {
  if (!text) { return text; }
  const lines = String(text).split(/\r?\n/);
  const cleaned = lines.filter((line) => {
    const l = line.trim();
    if (l === '') { return true; }
    // pure separators or heading-only labels
    if (/^(?:-{3,}|\*{3,}|_{3,}|={3,})$/.test(l)) { return false; }
    if (/^(?:scene\s*break|chapter\s+[\wivx]+)\.?$/i.test(l)) { return false; }
    return true;
  });
  return cleaned.join('\n');
}

function shouldCheckMessage(
message ,
messageIndex ,
latestIndex ,
offset ,
checkWhich )
{
  // Skip the very first message (index 0) - can't be a scene break
  if (messageIndex === 0) {
    return false;
  }

  // Skip if already checked
  if (get_data(message, 'auto_scene_break_checked')) {
    return false;
  }

  // Skip if message has no text
  if (!message.mes || message.mes.trim() === '') {
    return false;
  }

  // Skip system messages (mes.extra?.type === 'system')
  if (message.extra?.type === 'system') {
    return false;
  }

  // Filter by message type based on setting
  if (checkWhich === 'user' && !message.is_user) {
    // Only check user messages, skip character messages
    return false;
  }
  if (checkWhich === 'character' && message.is_user) {
    // Only check character messages, skip user messages
    return false;
  }
  // If checkWhich === 'both', check all messages (no filtering)

  // Check if within offset range
  // offset = 1 means skip latest message (check if messageIndex <= latestIndex - 1)
  // offset = 2 means skip 2 latest messages (check if messageIndex <= latestIndex - 2)
  // offset = 0 means check all including latest
  const maxAllowedIndex = latestIndex - offset;
  if (messageIndex > maxAllowedIndex) {
    return false;
  }

  return true;
}

// Helper: Determine if a message matches the configured type filter
function messageMatchesType(message, checkWhich ) {
  if (!message) {
    return false;
  }

  if (!message.mes || message.mes.trim() === '') {
    return false;
  }

  if (message.extra?.type === 'system') {
    return false;
  }

  if (checkWhich === 'user') {
    return Boolean(message.is_user);
  }

  if (checkWhich === 'character') {
    return !message.is_user;
  }

  return true; // 'both' or any other value defaults to all non-system messages
}

// Helper: Hard rule — always skip the immediate message after any scene break
// This is non-consuming: if the previous message has a scene break marker, the current is skipped.
function isCooldownSkip(chat , index , _consume  = false) {
  if (!Array.isArray(chat) || index <= 0) {return false;}
  const prev = chat[index - 1];
  if (!prev) {return false;}
  try {
    const hasSceneBreak = get_data(prev, 'scene_break');
    const isVisible = get_data(prev, 'scene_break_visible');
    return Boolean(hasSceneBreak && (isVisible === undefined || isVisible === true));
  } catch {
    return false;
  }
}

// Helper: Format messages for range-based detection (all messages with their ST indices)
function formatMessagesForRangeDetection(chat, startIndex, endIndex, checkWhich) {
  if (!chat || chat.length === 0) {
    return { formatted: '(No messages available)', filteredIndices: [] };
  }

  const formattedMessages = [];
  const filteredIndices = [];

  for (let i = startIndex; i <= endIndex; i++) {
    const message = chat[i];
    if (!message) {continue;}

    if (messageMatchesType(message, checkWhich)) {
      const speaker = message.is_user ? '[USER]' : '[CHARACTER]';
      const cleaned = stripDecorativeSeparators(message.mes);
      formattedMessages.push(`Message #${i} ${speaker}: ${cleaned}`);
      filteredIndices.push(i);
    }
  }

  if (formattedMessages.length === 0) {
    return { formatted: '(No messages match the selected type filter)', filteredIndices: [] };
  }

  return {
    formatted: formattedMessages.join('\n\n'),
    filteredIndices
  };
}

// Helper: Parse scene break detection response (extracts message number or false)
async function parseSceneBreakResponse(response, _startIndex, _endIndex, _filteredIndices) {
  // Try to parse as JSON first using centralized helper
  try {
    const { extractJsonFromResponse } = await import('./utils.js');
    const parsed = extractJsonFromResponse(response, {
      requiredFields: ['sceneBreakAt'],
      context: 'scene break detection'
    });
    const sceneBreakAt = parsed.sceneBreakAt === false || parsed.sceneBreakAt === 'false' || parsed.sceneBreakAt === null
      ? false
      : Number(parsed.sceneBreakAt);
    const rationale = parsed.rationale || '';
    debug('Parsed JSON - sceneBreakAt:', sceneBreakAt, '- Rationale:', rationale);
    return { sceneBreakAt, rationale };
  } catch (jsonErr) {
    // JSON parsing failed, try structured fallback patterns
    debug('JSON parsing failed, using fallback:', jsonErr.message);

    const lower = response.toLowerCase();
    const original = response.trim();

    // Pattern 1: Key-value extraction (sceneBreakAt: X or sceneBreakAt = X)
    const keyValueMatch = original.match(/sceneBreakAt\s*[:=]\s*(?:false|(\d+))/i);
    if (keyValueMatch) {
      const sceneBreakAt = keyValueMatch[1] ? Number(keyValueMatch[1]) : false;
      const rationaleMatch = original.match(/rationale\s*[:=]\s*["']?([^"'\n]+)["']?/i);
      const rationale = rationaleMatch ? rationaleMatch[1].trim() : 'Extracted from key-value pattern';
      debug(`Fallback pattern 1 matched: sceneBreakAt=${sceneBreakAt}, rationale="${rationale}"`);
      return { sceneBreakAt, rationale };
    }

    // Pattern 2: Message number patterns (message #5, message 5, #5)
    const messageNumMatch = original.match(/\b(?:message\s*#?|#)(\d+)\b/i);
    if (messageNumMatch) {
      const sceneBreakAt = Number(messageNumMatch[1]);
      const rationale = 'Extracted message number from response';
      debug(`Fallback pattern 2 matched: message #${sceneBreakAt}`);
      return { sceneBreakAt, rationale };
    }

    // Pattern 3: Explicit false/no break statements
    if (lower.includes('false') || lower.includes('no break') || lower.includes('no scene break')) {
      debug('Fallback pattern 3 matched: explicit false');
      return { sceneBreakAt: false, rationale: 'No scene break found' };
    }

    // Pattern 4: Just a number (if response is mostly just a number)
    const justNumberMatch = original.match(/^\s*(\d+)\s*$/);
    if (justNumberMatch) {
      const sceneBreakAt = Number(justNumberMatch[1]);
      debug(`Fallback pattern 4 matched: just number ${sceneBreakAt}`);
      return { sceneBreakAt, rationale: 'Message number extracted from simple response' };
    }

    // Default: conservative fallback (assume no break if uncertain)
    debug('No fallback patterns matched, defaulting to false');
    return { sceneBreakAt: false, rationale: 'Could not parse scene break information from response' };
  }
}

// Helper: Validate scene break response
function validateSceneBreakResponse(sceneBreakAt, startIndex, endIndex, filteredIndices, minimumSceneLength) {
  // If false, that's valid
  if (sceneBreakAt === false) {
    return { valid: true };
  }

  // Must be a number
  if (typeof sceneBreakAt !== 'number' || Number.isNaN(sceneBreakAt)) {
    return { valid: false, reason: `not a valid number: ${sceneBreakAt}` };
  }

  // Must be in the range we sent
  if (sceneBreakAt < startIndex || sceneBreakAt > endIndex) {
    return { valid: false, reason: `out of range (${startIndex}-${endIndex}): ${sceneBreakAt}` };
  }

  // Must be one of the filtered message indices we sent to LLM
  if (!filteredIndices.includes(sceneBreakAt)) {
    return { valid: false, reason: `not in filtered message set: ${sceneBreakAt}` };
  }

  // Must have at least minimumSceneLength filtered messages before it
  const filteredBeforeBreak = filteredIndices.filter(i => i < sceneBreakAt).length;
  if (filteredBeforeBreak < minimumSceneLength) {
    return {
      valid: false,
      reason: `below minimum scene length (${filteredBeforeBreak} < ${minimumSceneLength}): ${sceneBreakAt}`
    };
  }

  return { valid: true };
}

async function detectSceneBreak(
startIndex ,
endIndex )
{
  const ctx = getContext();

  try {
    debug('Checking message range', startIndex, 'to', endIndex, 'for scene break');

    // Get settings
    const promptTemplate = get_settings('auto_scene_break_prompt');
    const prefill = get_settings('auto_scene_break_prefill') || '';
    const profile = get_settings('auto_scene_break_connection_profile');
    const preset = get_settings('auto_scene_break_completion_preset');
    const includePresetPrompts = get_settings('auto_scene_break_include_preset_prompts') ?? false;
    const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
    const minimumSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;

    const chat = ctx.chat || [];

    // Format all messages in range with their ST indices
    const { filteredIndices } = formatMessagesForRangeDetection(chat, startIndex, endIndex, checkWhich);

    // Guard: Need at least (minimum + 1) filtered messages to analyze
    if (filteredIndices.length < minimumSceneLength + 1) {
      debug('Skipping scene break detection - not enough filtered messages:', filteredIndices.length, '< minimum + 1:', minimumSceneLength + 1);
      return {
        sceneBreakAt: false,
        rationale: `Not enough messages (${filteredIndices.length} < ${minimumSceneLength + 1} required)`,
        filteredIndices
      };
    }

    // Compute the earliest allowed message number that could start a new scene under the minimum rule
    // This is the (minimumSceneLength)th element in filteredIndices (0-based), i.e., the first index with at least N before it
    const earliestAllowedBreak = filteredIndices[minimumSceneLength];
    debug('Earliest allowed scene break index by minimum rule:', earliestAllowedBreak);

    // Rebuild formatted messages with an explicit ineligibility marker for too-early candidates
    // Replace the message number for any message before earliestAllowedBreak with 'invalid choice'
    const formattedForPrompt = filteredIndices.map((i) => {
      const m = chat[i];
      const speaker = m?.is_user ? '[USER]' : '[CHARACTER]';
      const header = (i < earliestAllowedBreak)
        ? `Message #invalid choice ${speaker}:`
        : `Message #${i} ${speaker}:`;
      const cleaned = stripDecorativeSeparators(m?.mes ?? '');
      return `${header} ${cleaned}`;
    }).join('\n\n');

    // Build prompt with macro replacements
    let prompt = promptTemplate;
    if (ctx.substituteParamsExtended) {
      prompt = ctx.substituteParamsExtended(prompt, {
        messages: formattedForPrompt,
        minimum_scene_length: String(minimumSceneLength),
        earliest_allowed_break: String(earliestAllowedBreak),
        prefill
      }) || prompt;
    }

    prompt = prompt.replace(/\{\{messages\}\}/g, formattedForPrompt);
    prompt = prompt.replace(/\{\{minimum_scene_length\}\}/g, String(minimumSceneLength));
    prompt = prompt.replace(/\{\{earliest_allowed_break\}\}/g, String(earliestAllowedBreak));

    ctx.deactivateSendButtons();

    // Set operation context for ST_METADATA with range
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    setOperationSuffix(`-${startIndex}-${endIndex}`);

    let response;

    try {
      // Use ConnectionManager for ALL requests (handles profile switching internally)
      const { sendLLMRequest } = await import('./llmClient.js');
      const { OperationType } = await import('./operationTypes.js');
      const { resolveProfileId } = await import('./profileResolution.js');

      const effectiveProfile = resolveProfileId(profile);

      debug('Sending range detection prompt to AI for range', startIndex, 'to', endIndex);

      response = await sendLLMRequest(effectiveProfile, prompt, OperationType.DETECT_SCENE_BREAK, {
        prefill,
        includePreset: includePresetPrompts,
        preset: preset,
        maxTokens: DEFAULT_MAX_TOKENS
      });

      debug('AI raw response for range', startIndex, 'to', endIndex, ':', response);
    } finally {
      clearOperationSuffix();
    }

    // Parse response for message number or false
    const { sceneBreakAt, rationale } = await parseSceneBreakResponse(response, startIndex, endIndex, filteredIndices);

    // Log the decision
    if (sceneBreakAt === false) {
      debug('✗ No scene break found in range', startIndex, 'to', endIndex);
    } else {
      debug('✓ SCENE BREAK DETECTED at message', sceneBreakAt);
    }
    debug('  Rationale:', rationale);

    return { sceneBreakAt, rationale, filteredIndices };

  } catch (err) {
    error('ERROR in detectSceneBreak for range', startIndex, 'to', endIndex);
    error('Error message:', err?.message || String(err));
    throw err;
  }
}

// Helper: Find and mark existing scene breaks as checked
function findAndMarkExistingSceneBreaks(chat) {
  let latestVisibleSceneBreakIndex = -1;
  for (let i = 0; i < chat.length; i++) {
    const message = chat[i];
    const hasSceneBreak = get_data(message, 'scene_break');
    const isVisible = get_data(message, 'scene_break_visible');

    // Scene break is visible if: scene_break is true AND (scene_break_visible is undefined OR true)
    if (hasSceneBreak && (isVisible === undefined || isVisible === true)) {
      latestVisibleSceneBreakIndex = i;
      debug(SUBSYSTEM.SCENE, 'Found visible scene break at index', i);
    }
  }

  if (latestVisibleSceneBreakIndex >= 0) {
    log(SUBSYSTEM.SCENE, 'Latest visible scene break found at index', latestVisibleSceneBreakIndex);
    log(SUBSYSTEM.SCENE, 'Marking messages 0 to', latestVisibleSceneBreakIndex, 'as already checked');

    for (let i = 0; i <= latestVisibleSceneBreakIndex; i++) {
      set_data(chat[i], 'auto_scene_break_checked', true);
    }

    saveChatDebounced();
    toast(`Marked ${latestVisibleSceneBreakIndex + 1} messages before latest scene break as already checked`, 'info');
  } else {
    debug(SUBSYSTEM.SCENE, 'No visible scene breaks found - will scan from beginning');
  }
}

// Helper: Try to queue scene break detections
async function tryQueueSceneBreaks(config) {
  const { chat, start, end, checkWhich } = config;

  log(SUBSYSTEM.SCENE, '[Queue] Queueing range-based scene break detection');

  // Import queue integration
  const { enqueueOperation, OperationType } = await import('./operationQueue.js');

  // Get minimum scene length setting
  const minimumSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;

  // Count filtered messages in range
  let filteredCount = 0;
  for (let i = start; i <= end; i++) {
    const message = chat[i];
    if (message && messageMatchesType(message, checkWhich)) {
      filteredCount++;
    }
  }

  // Check if we have enough messages (minimum + 1)
  if (filteredCount < minimumSceneLength + 1) {
    toast(`Not enough messages for scene break detection (${filteredCount} < ${minimumSceneLength + 1} required)`, 'info');
    return { queued: true, count: 0 };
  }

  // Queue single range-based detection operation
  const operationId = await enqueueOperation(
    OperationType.DETECT_SCENE_BREAK,
    { startIndex: start, endIndex: end },
    {
      priority: 5, // Normal priority for scene break detection
      metadata: {
        filtered_count: filteredCount,
        minimum_required: minimumSceneLength + 1,
        triggered_by: 'auto_scene_break_detection'
      }
    }
  );

  if (operationId) {
    log(SUBSYSTEM.SCENE, `[Queue] Queued range-based scene break detection for ${start}-${end} (${filteredCount} filtered messages)`);
    toast(`Queued scene break detection for range ${start}-${end}`, 'info');
    return { queued: true, count: 1 };
  }

  error(SUBSYSTEM.SCENE, '[Queue] Failed to enqueue scene break detection');
  return null;
}

export async function processAutoSceneBreakDetection(
startIndex  = null,
endIndex  = null)
{
  log(SUBSYSTEM.SCENE, '=== processAutoSceneBreakDetection called with startIndex:', startIndex, 'endIndex:', endIndex, '===');

  // Detection is always available; behavior is controlled by per-event settings

  const ctx = getContext();
  const chat = ctx.chat;
  if (!chat || chat.length === 0) {
    debug(SUBSYSTEM.SCENE, 'No messages to process - chat is empty');
    return;
  }

  // Find and mark existing scene breaks
  findAndMarkExistingSceneBreaks(chat);

  // Get settings and determine range
  const offset = Number(get_settings('auto_scene_break_message_offset')) ?? 0;
  const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
  const latestIndex = chat.length - 1;
  const start = startIndex !== null ? startIndex : 0;
  const end = endIndex !== null ? endIndex : latestIndex;

  log(SUBSYSTEM.SCENE, 'Processing messages', start, 'to', end, '(latest:', latestIndex, ', offset:', offset, ', checking:', checkWhich, ')');

  // Queue is required - enqueue operations instead of executing directly
  const rangeConfig = { start, end, latestIndex, offset, checkWhich };
  const queueResult = await tryQueueSceneBreaks({ chat, ...rangeConfig });
  if (!queueResult) {
    error(SUBSYSTEM.SCENE, 'Failed to enqueue scene break detection operations');
    toast('Failed to queue scene break detection. Check console for details.', 'error');
    return;
  }

  log(SUBSYSTEM.SCENE, `Successfully queued ${queueResult.count} scene break detection(s)`);
}

export async function manualSceneBreakDetection() {
  debug('Manual scene break detection triggered');

  const ctx = getContext();
  const chat = ctx.chat;

  if (!chat || chat.length === 0) {
    debug(SUBSYSTEM.SCENE, 'No messages to process - chat is empty');
    toast('No messages to scan for scene breaks', 'info');
    return;
  }

  // Find the latest VISIBLE scene break and start scanning after it
  // This intentionally ignores any "checked" flags so we can rescan the tail
  let latestVisibleSceneBreakIndex = -1;
  for (let i = chat.length - 1; i >= 0; i--) {
    try {
      const hasSceneBreak = get_data(chat[i], 'scene_break');
      const isVisible = get_data(chat[i], 'scene_break_visible');
      if (hasSceneBreak && (isVisible === undefined || isVisible === true)) {
        latestVisibleSceneBreakIndex = i;
        break;
      }
    } catch {/* ignore lookup errors */}
  }

  const startIndex = latestVisibleSceneBreakIndex + 1;
  const endIndex = chat.length - 1;

  if (startIndex > endIndex) {
    debug(SUBSYSTEM.SCENE, 'No messages after the latest visible scene break to scan');
    toast('No new messages after the last visible scene break', 'info');
    return;
  }

  toast(`Scanning messages ${startIndex}-${endIndex} for scene breaks...`, 'info');

  // Only process the range AFTER the last visible scene break
  await processAutoSceneBreakDetection(startIndex, endIndex);
}

export async function processNewMessageForSceneBreak(messageIndex ) {
  const enabled = get_settings('auto_scene_break_on_new_message');
  if (!enabled) {
    debug(SUBSYSTEM.SCENE, 'Auto-check on new message is disabled');
    return;
  }

  const offset = Number(get_settings('auto_scene_break_message_offset')) || 0;

  // Calculate range based on offset
  // If offset = 1 and new message is at index 10, check messages 0 to 9
  // If offset = 0 and new message is at index 10, check messages 0 to 10
  const ctx = getContext();
  const chat = ctx.chat;

  if (!chat || chat.length === 0) {
    debug(SUBSYSTEM.SCENE, 'No chat messages available for scene break processing');
    return;
  }

  const endIndexRaw = messageIndex - offset;
  const endIndex = Math.min(endIndexRaw, chat.length - 1);

  if (endIndex < 0) {
    debug(SUBSYSTEM.SCENE, 'No messages to check based on offset - messageIndex:', messageIndex, 'offset:', offset);
    return;
  }

  const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';

  const forceFullRescan = typeof window !== 'undefined' && window.autoRecapForceSceneBreakRescan === true;

  let rangeStart = 0;
  if (!forceFullRescan) {
    // Find the latest visible scene break
    let latestVisibleSceneBreakIndex = -1;
    for (let i = endIndex; i >= 0; i--) {
      try {
        const hasSceneBreak = get_data(chat[i], 'scene_break');
        const isVisible = get_data(chat[i], 'scene_break_visible');
        if (hasSceneBreak && (isVisible === undefined || isVisible === true)) {
          latestVisibleSceneBreakIndex = i;
          break;
        }
      } catch {/* ignore lookup errors */}
    }

    // Start scanning from the message after the latest scene break
    rangeStart = latestVisibleSceneBreakIndex + 1;
  }

  debug(
    SUBSYSTEM.SCENE,
    'New message at index',
    messageIndex,
    ', checking range',
    rangeStart,
    'to',
    endIndex,
    '(mode:',
    forceFullRescan ? 'full-rescan' : 'to-last-scene-break',
    ', type:',
    checkWhich,
    ')'
  );

  log(SUBSYSTEM.SCENE, 'Processing auto scene break detection for range', rangeStart, 'to', endIndex);
  await processAutoSceneBreakDetection(rangeStart, endIndex);

  if (forceFullRescan && typeof window !== 'undefined') {
    window.autoRecapForceSceneBreakRescan = false;
    debug(SUBSYSTEM.SCENE, 'Completed forced full scene break rescan after clear-all action');
  }
}

export async function processSceneBreakOnChatLoad() {
  const enabled = get_settings('auto_scene_break_on_load');
  if (!enabled) {
    debug('Auto-check on chat load is disabled');
    return;
  }

  debug('Processing scene breaks on chat load');

  // Process all messages
  await processAutoSceneBreakDetection();
}

export function clearCheckedFlagsInRange(
startIndex ,
endIndex )
{
  const ctx = getContext();
  const chat = ctx.chat;

  if (!chat || chat.length === 0) {
    return 0;
  }

  let clearedCount = 0;

  for (let i = startIndex; i < endIndex && i < chat.length; i++) {
    const message = chat[i];
    if (get_data(message, 'auto_scene_break_checked')) {
      set_data(message, 'auto_scene_break_checked', false);
      clearedCount++;
    }
  }

  if (clearedCount > 0) {
    saveChatDebounced();
    debug(SUBSYSTEM.SCENE, `Cleared checked flags from ${clearedCount} message(s) in range ${startIndex}-${endIndex - 1}`);
  }

  return clearedCount;
}

export function setCheckedFlagsInRange(
startIndex ,
endIndex )
{
  const ctx = getContext();
  const chat = ctx.chat;

  if (!chat || chat.length === 0) {
    return 0;
  }

  let markedCount = 0;

  for (let i = startIndex; i <= endIndex && i < chat.length; i++) {
    const message = chat[i];
    if (!get_data(message, 'auto_scene_break_checked')) {
      set_data(message, 'auto_scene_break_checked', true);
      markedCount++;
    }
  }

  if (markedCount > 0) {
    saveChatDebounced();
    debug(SUBSYSTEM.SCENE, `Marked ${markedCount} message(s) as checked in range ${startIndex}-${endIndex}`);
  }

  return markedCount;
}

export function clearAllCheckedFlags() {
  const ctx = getContext();
  const chat = ctx.chat;

  if (!chat || chat.length === 0) {
    toast('No messages in current chat', 'warning');
    return;
  }

  let clearedCount = 0;

  for (let i = 0; i < chat.length; i++) {
    const message = chat[i];
    if (get_data(message, 'auto_scene_break_checked')) {
      set_data(message, 'auto_scene_break_checked', false);
      clearedCount++;
    }
  }

  if (clearedCount > 0) {
    saveChatDebounced();
    toast(`Cleared checked flag from ${clearedCount} message(s). You can now re-scan them.`, 'success');
    debug('Cleared checked flags from', clearedCount, 'messages');
  } else {
    toast('No messages had the checked flag set', 'info');
  }
}

export {
  shouldCheckMessage,
  detectSceneBreak,
  isCooldownSkip,
  validateSceneBreakResponse,
  messageMatchesType };

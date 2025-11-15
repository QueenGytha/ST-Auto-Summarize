
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
  saveChatDebounced,
  count_tokens,
  main_api } from
'./index.js';
import { pauseQueue } from './operationQueue.js';

const DEFAULT_MINIMUM_SCENE_LENGTH = 3;

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

function isContextLengthError(err) {
  const errorMessage = (err?.message || String(err)).toLowerCase();
  const errorCause = (err?.cause?.message || '').toLowerCase();
  return errorMessage.includes('context') ||
         errorMessage.includes('maximum') ||
         errorMessage.includes('too large') ||
         errorMessage.includes('tokens') ||
         errorCause.includes('context') ||
         errorCause.includes('maximum') ||
         errorCause.includes('tokens');
}

async function trySendRequest(options) {
  const { effectiveProfile, prompt, prefill, includePresetPrompts, preset, startIndex, endIndex } = options;
  const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
  const { sendLLMRequest } = await import('./llmClient.js');
  const { OperationType } = await import('./operationTypes.js');

  setOperationSuffix(`-${startIndex}-${endIndex}`);

  try {
    const response = await sendLLMRequest(effectiveProfile, prompt, OperationType.DETECT_SCENE_BREAK, {
      prefill,
      includePreset: includePresetPrompts,
      preset: preset,
      trimSentences: false
    });

    clearOperationSuffix();
    return { success: true, response };
  } catch (err) {
    clearOperationSuffix();

    // Log full error details for debugging
    const ERROR_DEBUG_LENGTH = 500;
    debug(SUBSYSTEM.OPERATIONS, `API request failed. Error message: ${err?.message || String(err)}`);
    debug(SUBSYSTEM.OPERATIONS, `Error type: ${err?.constructor?.name || typeof err}`);

    // Log full error object structure
    try {
      const errorProps = Object.getOwnPropertyNames(err);
      debug(SUBSYSTEM.OPERATIONS, `Error properties: ${errorProps.join(', ')}`);
      debug(SUBSYSTEM.OPERATIONS, `Full error: ${JSON.stringify(err, errorProps).slice(0, ERROR_DEBUG_LENGTH)}`);
    } catch (e) {
      debug(SUBSYSTEM.OPERATIONS, `Could not stringify error: ${e.message}`);
    }

    // Log full cause object structure
    if (err?.cause) {
      try {
        const causeProps = Object.getOwnPropertyNames(err.cause);
        debug(SUBSYSTEM.OPERATIONS, `Cause properties: ${causeProps.join(', ')}`);
        debug(SUBSYSTEM.OPERATIONS, `Full cause: ${JSON.stringify(err.cause, causeProps).slice(0, ERROR_DEBUG_LENGTH)}`);
      } catch (e) {
        debug(SUBSYSTEM.OPERATIONS, `Could not stringify cause: ${e.message}`);
      }
    }

    if (isContextLengthError(err)) {
      return { success: false, error: err };
    }

    // Non-context error - rethrow
    throw err;
  }
}

function calculateReductionAmount(checkWhich, chat, currentEndIndex) {
  if (checkWhich === 'user') {
    for (let i = currentEndIndex; i >= 0; i--) {
      if (chat[i].is_user) {
        return currentEndIndex - i + 1;
      }
    }
    return 1;
  }

  if (checkWhich === 'character') {
    for (let i = currentEndIndex; i >= 0; i--) {
      if (!chat[i].is_user) {
        return currentEndIndex - i + 1;
      }
    }
    return 1;
  }

  if (checkWhich === 'both') {
    let foundUser = -1;
    let foundAI = -1;

    for (let i = currentEndIndex; i >= 0; i--) {
      if (chat[i].is_user && foundUser === -1) {foundUser = i;}
      if (!chat[i].is_user && foundAI === -1) {foundAI = i;}

      if (foundUser !== -1 && foundAI !== -1) {
        const earliestOfPair = Math.min(foundUser, foundAI);
        return currentEndIndex - earliestOfPair + 1;
      }
    }
    return 2;
  }

  return 1;
}

async function calculateAvailableContext(preset) {
  const { getPresetManager } = await import('../../../preset-manager.js');
  const presetManager = getPresetManager('openai');

  let effectivePresetName;
  if (preset === '') {
    effectivePresetName = presetManager?.getSelectedPresetName();
    if (!effectivePresetName) {
      return null;
    }
  } else {
    effectivePresetName = preset;
  }

  const presetData = presetManager?.getCompletionPresetByName(effectivePresetName);
  if (!presetData) {
    return null;
  }

  const presetMaxContext = presetData.max_context || presetData.openai_max_context;
  if (!presetMaxContext || presetMaxContext <= 0) {
    return null;
  }

  const presetMaxTokens = presetData.genamt || presetData.openai_max_tokens || 0;
  return presetMaxContext - presetMaxTokens;
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
    error('Failed to parse scene break response:', jsonErr.message);
    throw jsonErr;
  }
}

// Helper: Validate scene break response
function validateSceneBreakResponse(sceneBreakAt, config) {
  const { startIndex, endIndex, filteredIndices, minimumSceneLength, maxEligibleIndex = null } = config;

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

  // Must not be in the offset zone (if maxEligibleIndex is provided)
  if (maxEligibleIndex !== null && sceneBreakAt > maxEligibleIndex) {
    return {
      valid: false,
      reason: `in offset zone (${sceneBreakAt} > ${maxEligibleIndex}): ${sceneBreakAt}`
    };
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

function buildFormattedMessages(chat, filteredIndices, earliestAllowedBreak, maxEligibleIndex) {
  // Defensive validation: warn if maxEligibleIndex is unexpectedly null
  if (maxEligibleIndex === null || maxEligibleIndex === undefined) {
    debug(SUBSYSTEM.OPERATIONS, `WARNING: maxEligibleIndex is ${maxEligibleIndex} in buildFormattedMessages - offset marking may not work correctly`);
  }

  return filteredIndices.map((i) => {
    const m = chat[i];
    const speaker = m?.is_user ? '[USER]' : '[CHARACTER]';
    // Fix: Explicitly check maxEligibleIndex is not null/undefined before comparing
    // to prevent silent failures from null comparison (i > null evaluates to false)
    const isIneligible = (i < earliestAllowedBreak) || (maxEligibleIndex !== null && maxEligibleIndex !== undefined && i > maxEligibleIndex);
    const header = isIneligible
      ? `Message #invalid choice ${speaker}:`
      : `Message #${i} ${speaker}:`;
    const cleaned = stripDecorativeSeparators(m?.mes ?? '');
    return `${header} ${cleaned}`;
  }).join('\n\n');
}

function buildPromptFromTemplate(ctx, promptTemplate, options) {
  const { formattedForPrompt, minimumSceneLength, earliestAllowedBreak, prefill, rangeWasReduced = false, forceSelection = false } = options;
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

  if (rangeWasReduced || forceSelection) {
    prompt += `\n\n**MANDATORY:** You MUST select the best possible scene break from the messages provided. Returning false is not permitted. Choose the most reasonable break point based on topic shifts, pauses, emotional beats, or any natural separation between narrative moments.`;
  }

  return prompt;
}

async function calculateTotalRequestTokens(prompt, includePreset, preset, prefill, profile) {
  let totalTokens = count_tokens(prompt);
  const promptTokens = totalTokens;

  const DEBUG_PREFILL_LENGTH = 50;
  debug(SUBSYSTEM.OPERATIONS, `calculateTotalRequestTokens: includePreset=${includePreset}, preset="${preset}", profile="${profile}", prefill="${prefill?.slice(0, DEBUG_PREFILL_LENGTH) || ''}"`);

  // OpenAI ALWAYS adds system prompt (llmClient.js lines 130-132, 146-148)
  if (main_api === 'openai') {
    const systemPrompt = "You are a data extraction system. Output ONLY valid JSON. Never generate roleplay content.";
    const systemTokens = count_tokens(systemPrompt);
    totalTokens += systemTokens;
    debug(SUBSYSTEM.OPERATIONS, `Added OpenAI system prompt overhead: ${systemTokens} tokens`);
  }

  // CRITICAL: ConnectionManager ALWAYS loads preset from the PROFILE, completely ignoring
  // the includePreset flag and the operation preset parameter. We MUST count these tokens.
  const ctx = getContext();
  const profileData = ctx.extensionSettings.connectionManager?.profiles?.find(p => p.id === profile);
  const profilePresetName = profileData?.preset;

  if (profilePresetName) {
    const { loadPresetPrompts } = await import('./presetPromptLoader.js');
    const presetMessages = await loadPresetPrompts(profilePresetName);
    let presetTokens = 0;
    for (const msg of presetMessages) {
      const msgTokens = count_tokens(msg.content || '');
      presetTokens += msgTokens;
    }
    debug(SUBSYSTEM.OPERATIONS, `ConnectionManager will load ${presetMessages.length} preset messages from PROFILE preset "${profilePresetName}", ${presetTokens} tokens`);
    totalTokens += presetTokens;

    debug(SUBSYSTEM.OPERATIONS, `Token breakdown: prompt=${promptTokens}, profilePreset=${presetTokens} (from "${profilePresetName}"), total=${totalTokens}`);
  } else {
    debug(SUBSYSTEM.OPERATIONS, `Warning: No profile preset found, ConnectionManager behavior undefined`);
  }

  // Add prefill overhead if provided
  if (prefill && typeof prefill === 'string') {
    const prefillTokens = count_tokens(prefill);
    totalTokens += prefillTokens;
    debug(SUBSYSTEM.OPERATIONS, `Added prefill overhead: ${prefillTokens} tokens`);
  }

  // Add small buffer for message formatting overhead (role tags, etc.)
  const MESSAGE_FORMAT_OVERHEAD = 50;
  totalTokens += MESSAGE_FORMAT_OVERHEAD;

  debug(SUBSYSTEM.OPERATIONS, `Final token count: ${totalTokens} (includes ${MESSAGE_FORMAT_OVERHEAD} token formatting buffer)`);

  return totalTokens;
}

function filterEligibleIndices(filteredIndices, maxEligibleIndex) {
  return filteredIndices.filter(i => i <= maxEligibleIndex);
}

async function reduceMessagesUntilTokenFit(config) {
  const { ctx, chat, startIndex, endIndex, offset, checkWhich, filteredIndices, maxEligibleIndex, preset, promptTemplate, minimumSceneLength, prefill, forceSelection = false, includePresetPrompts = false, profile, effectiveProfile } = config;

  let currentEndIndex = endIndex;
  let currentFilteredIndices = filteredIndices;
  let currentMaxEligibleIndex = maxEligibleIndex;
  let currentEarliestAllowedBreak;
  let currentFormattedForPrompt;
  let prompt;

  const maxAllowedTokens = await calculateAvailableContext(preset);

  while (true) {
    const currentEligibleFilteredIndices = filterEligibleIndices(currentFilteredIndices, currentMaxEligibleIndex);

    if (currentEligibleFilteredIndices.length < minimumSceneLength + 1) {
      if (currentEligibleFilteredIndices.length <= 2 && maxAllowedTokens !== null) {
        // eslint-disable-next-line no-await-in-loop -- Need to pause queue before throwing error
        await pauseQueue();
        toast(`Scene break detection failed: Even ${currentEligibleFilteredIndices.length} messages exceed ${maxAllowedTokens} token limit. Reduce message length or increase preset max_context.`, 'error', { timeOut: 0 });
        throw new Error(`Scene break detection: minimum range still exceeds token limit`);
      }

      debug('Not enough eligible messages after token reduction:', currentEligibleFilteredIndices.length, '< minimum + 1:', minimumSceneLength + 1);
      return {
        sceneBreakAt: false,
        rationale: `Not enough eligible messages after token reduction (${currentEligibleFilteredIndices.length} < ${minimumSceneLength + 1} required)`,
        filteredIndices: currentFilteredIndices,
        maxEligibleIndex: currentMaxEligibleIndex
      };
    }

    currentEarliestAllowedBreak = currentEligibleFilteredIndices[minimumSceneLength];

    currentFormattedForPrompt = buildFormattedMessages(chat, currentFilteredIndices, currentEarliestAllowedBreak, currentMaxEligibleIndex);

    prompt = buildPromptFromTemplate(ctx, promptTemplate, {
      formattedForPrompt: currentFormattedForPrompt,
      minimumSceneLength,
      earliestAllowedBreak: currentEarliestAllowedBreak,
      prefill,
      rangeWasReduced: currentEndIndex !== endIndex,
      forceSelection
    });

    // Calculate total tokens including preset messages, system prompt, and prefill
    // eslint-disable-next-line no-await-in-loop -- Need to calculate tokens in loop to check if reduction is needed
    const tokenCount = await calculateTotalRequestTokens(prompt, includePresetPrompts, preset, prefill, profile);

    if (maxAllowedTokens === null || tokenCount <= maxAllowedTokens) {
      debug(SUBSYSTEM.OPERATIONS, `Scene break detection: ${tokenCount} tokens (including overhead), fits within limit per calculation`);

      // Token calculation says it fits - now try actually sending it
      // eslint-disable-next-line no-await-in-loop -- Need to try request in loop to handle API rejections
      const apiResult = await trySendRequest({ effectiveProfile, prompt, prefill, includePresetPrompts, preset, startIndex, endIndex: currentEndIndex });

      if (apiResult.success) {
        // Request succeeded - return the response
        return {
          response: apiResult.response,
          currentEndIndex,
          currentFilteredIndices,
          currentMaxEligibleIndex,
          rangeWasReduced: currentEndIndex !== endIndex
        };
      }

      // API rejected with context error - continue loop to reduce further
      debug(SUBSYSTEM.OPERATIONS, `API rejected request (context exceeded), continuing reduction from ${currentEndIndex}`);
    } else {
      debug(SUBSYSTEM.OPERATIONS, `Scene break detection: ${tokenCount} > ${maxAllowedTokens} tokens, reducing end index`);
    }

    // Reduce range and continue loop
    const reductionAmount = calculateReductionAmount(checkWhich, chat, currentEndIndex);
    currentEndIndex -= reductionAmount;
    currentMaxEligibleIndex = currentEndIndex - offset;

    if (currentEndIndex < startIndex) {
      // eslint-disable-next-line no-await-in-loop -- Need to pause queue before throwing error
      await pauseQueue();
      toast(`Scene break detection failed: Cannot reduce further. Token limit ${maxAllowedTokens} exceeded.`, 'error', { timeOut: 0 });
      throw new Error(`Scene break detection: cannot reduce end index below start index`);
    }

    const formatResult = formatMessagesForRangeDetection(chat, startIndex, currentEndIndex, checkWhich);
    currentFilteredIndices = formatResult.filteredIndices;
  }
}

async function detectSceneBreak(
startIndex ,
endIndex ,
offset  = 0,
forceSelection  = false,
_operationId  = null)
{
  const ctx = getContext();

  try {
    debug('Checking message range', startIndex, 'to', endIndex, 'for scene break (offset:', offset, ')');

    // Get settings
    const promptTemplate = get_settings('auto_scene_break_prompt');
    const prefill = get_settings('auto_scene_break_prefill') || '';
    const profile = get_settings('auto_scene_break_connection_profile');
    const preset = get_settings('auto_scene_break_completion_preset');
    const includePresetPrompts = get_settings('auto_scene_break_include_preset_prompts') ?? false;
    const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
    const minimumSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;

    // Resolve profile ID early so we can use it for token counting
    const { resolveProfileId } = await import('./profileResolution.js');
    const effectiveProfile = resolveProfileId(profile);

    const chat = ctx.chat || [];

    // Calculate max eligible index (messages after this are in offset zone)
    const maxEligibleIndex = endIndex - offset;

    // Format all messages in range with their ST indices
    const { filteredIndices } = formatMessagesForRangeDetection(chat, startIndex, endIndex, checkWhich);

    // Count eligible filtered messages (excluding offset zone)
    const eligibleFilteredIndices = filteredIndices.filter(i => i <= maxEligibleIndex);

    // Guard: Need at least (minimum + 1) eligible filtered messages to analyze
    if (eligibleFilteredIndices.length < minimumSceneLength + 1) {
      debug('Skipping scene break detection - not enough eligible filtered messages:', eligibleFilteredIndices.length, '< minimum + 1:', minimumSceneLength + 1);
      return {
        sceneBreakAt: false,
        rationale: `Not enough eligible messages (${eligibleFilteredIndices.length} < ${minimumSceneLength + 1} required)`,
        filteredIndices,
        maxEligibleIndex
      };
    }

    // Compute the earliest allowed message number that could start a new scene under the minimum rule
    // This is the (minimumSceneLength)th element in eligibleFilteredIndices (0-based)
    const earliestAllowedBreak = eligibleFilteredIndices[minimumSceneLength];
    debug('Earliest allowed scene break index by minimum rule:', earliestAllowedBreak);
    debug('Max eligible index by offset rule:', maxEligibleIndex);

    // Count how many messages are actually valid choices (not marked as "invalid choice")
    // A message is valid if: earliestAllowedBreak <= i <= maxEligibleIndex
    const validChoices = filteredIndices.filter(i => i >= earliestAllowedBreak && i <= maxEligibleIndex);
    if (validChoices.length === 0) {
      debug('No valid choices after applying minimum scene length and offset rules');
      return {
        sceneBreakAt: false,
        rationale: 'No valid scene break choices (all messages ineligible due to minimum length + offset)',
        filteredIndices,
        maxEligibleIndex
      };
    }
    debug('Valid choices for scene break:', validChoices.length, 'messages');

    // FIRST: Bulk reduce based on token calculation (fast reduction for large ranges)
    // SECOND: Try API request and fine-tune if needed (integrated in same loop)
    const reductionResult = await reduceMessagesUntilTokenFit({
      ctx,
      chat,
      startIndex,
      endIndex,
      offset,
      checkWhich,
      filteredIndices,
      maxEligibleIndex,
      preset,
      promptTemplate,
      minimumSceneLength,
      prefill,
      forceSelection,
      includePresetPrompts,
      profile: effectiveProfile,
      effectiveProfile: effectiveProfile
    });

    if (reductionResult.sceneBreakAt !== undefined) {
      return reductionResult;
    }

    const { response, currentEndIndex, currentFilteredIndices, currentMaxEligibleIndex } = reductionResult;

    ctx.deactivateSendButtons();

    debug('AI raw response for range', startIndex, 'to', currentEndIndex, ':', response);

    // Parse response for message number or false
    const { sceneBreakAt, rationale } = await parseSceneBreakResponse(response, startIndex, currentEndIndex, currentFilteredIndices);

    // Log the decision
    if (sceneBreakAt === false) {
      debug('✗ No scene break found in range', startIndex, 'to', currentEndIndex);
    } else {
      debug('✓ SCENE BREAK DETECTED at message', sceneBreakAt);
    }
    debug('  Rationale:', rationale);

    return { sceneBreakAt, rationale, filteredIndices: currentFilteredIndices, maxEligibleIndex: currentMaxEligibleIndex };

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
  const { chat, start, end, offset, checkWhich } = config;

  log(SUBSYSTEM.SCENE, '[Queue] Queueing range-based scene break detection');

  // Import queue integration
  const { enqueueOperation, OperationType } = await import('./operationQueue.js');

  // Get minimum scene length setting
  const minimumSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;

  // Calculate max eligible index (messages after this are in the offset zone)
  const maxEligibleIndex = end - (offset || 0);

  // Count filtered messages in eligible range only
  let filteredCount = 0;
  for (let i = start; i <= maxEligibleIndex; i++) {
    const message = chat[i];
    if (message && messageMatchesType(message, checkWhich)) {
      filteredCount++;
    }
  }

  // Check if we have enough eligible messages (minimum + 1)
  if (filteredCount < minimumSceneLength + 1) {
    toast(`Not enough eligible messages for scene break detection (${filteredCount} < ${minimumSceneLength + 1} required)`, 'info');
    return { queued: true, count: 0 };
  }

  // Queue single range-based detection operation
  const operationId = await enqueueOperation(
    OperationType.DETECT_SCENE_BREAK,
    { startIndex: start, endIndex: end, offset: offset || 0 },
    {
      priority: 5, // Normal priority for scene break detection
      metadata: {
        filtered_count: filteredCount,
        minimum_required: minimumSceneLength + 1,
        offset: offset || 0,
        triggered_by: 'auto_scene_break_detection',
        start_index: start,
        end_index: end
      }
    }
  );

  if (operationId) {
    log(SUBSYSTEM.SCENE, `[Queue] Queued range-based scene break detection for ${start}-${end} (${filteredCount} eligible filtered messages, offset: ${offset || 0})`);
    toast(`Queued scene break detection for range ${start}-${end}`, 'info');
    return { queued: true, count: 1 };
  }

  error(SUBSYSTEM.SCENE, '[Queue] Failed to enqueue scene break detection');
  return null;
}

// Core unified scene break detection function
async function detectSceneBreaksInRange(chat, options = {}) {
  const {
    startIndex = null,
    endIndex = null
  } = options;

  if (!chat || chat.length === 0) {
    debug(SUBSYSTEM.SCENE, 'No messages to process - chat is empty');
    return;
  }

  // Get settings
  const offset = Number(get_settings('auto_scene_break_message_offset')) ?? 0;
  const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';

  // Determine the raw end index (will include offset messages in prompt, marked as ineligible)
  const latestIndex = chat.length - 1;
  const rawEnd = endIndex !== null ? endIndex : latestIndex;

  // Calculate the maximum eligible index (messages beyond this are marked as ineligible due to offset)
  const maxEligibleIndex = rawEnd - offset;

  // If no messages are eligible after applying offset, nothing to check
  if (maxEligibleIndex < 0) {
    debug(SUBSYSTEM.SCENE, 'No messages eligible after applying offset');
    return;
  }

  // Find the latest visible scene break to determine start
  let latestVisibleSceneBreakIndex = -1;
  for (let i = maxEligibleIndex; i >= 0; i--) {
    try {
      const hasSceneBreak = get_data(chat[i], 'scene_break');
      const isVisible = get_data(chat[i], 'scene_break_visible');
      if (hasSceneBreak && (isVisible === undefined || isVisible === true)) {
        latestVisibleSceneBreakIndex = i;
        break;
      }
    } catch {/* ignore lookup errors */}
  }

  // Determine actual start index
  const actualStart = startIndex !== null ? startIndex : (latestVisibleSceneBreakIndex + 1);

  // Validate range
  if (actualStart > maxEligibleIndex) {
    debug(SUBSYSTEM.SCENE, 'No eligible messages in range after applying offset and finding scene break');
    return;
  }

  log(
    SUBSYSTEM.SCENE,
    'Processing scene break detection - eligible range:',
    actualStart,
    'to',
    maxEligibleIndex,
    ', full range:',
    actualStart,
    'to',
    rawEnd,
    '(offset:',
    offset,
    ', checking:',
    checkWhich,
    ')'
  );

  // Queue the detection operation
  // Pass rawEnd (includes offset messages) and offset value so detection can mark them as ineligible
  const rangeConfig = { chat, start: actualStart, end: rawEnd, offset, checkWhich };
  const queueResult = await tryQueueSceneBreaks(rangeConfig);

  if (!queueResult) {
    error(SUBSYSTEM.SCENE, 'Failed to enqueue scene break detection operations');
    toast('Failed to queue scene break detection. Check console for details.', 'error');
    return;
  }

  log(SUBSYSTEM.SCENE, `Successfully queued ${queueResult.count} scene break detection(s)`);
}

export async function processAutoSceneBreakDetection(
startIndex  = null,
endIndex  = null)
{
  log(SUBSYSTEM.SCENE, '=== processAutoSceneBreakDetection called with startIndex:', startIndex, 'endIndex:', endIndex, '===');

  const ctx = getContext();
  const chat = ctx.chat;
  if (!chat || chat.length === 0) {
    debug(SUBSYSTEM.SCENE, 'No messages to process - chat is empty');
    return;
  }

  // Find and mark existing scene breaks
  findAndMarkExistingSceneBreaks(chat);

  // Delegate to unified core function
  await detectSceneBreaksInRange(chat, { startIndex, endIndex });
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

  toast('Scanning for scene breaks...', 'info');

  // Delegate to unified core function
  // It will find the latest scene break, apply offset, and queue detection
  await detectSceneBreaksInRange(chat, {});
}

export async function processNewMessageForSceneBreak(messageIndex ) {
  const enabled = get_settings('auto_scene_break_on_new_message');
  if (!enabled) {
    debug(SUBSYSTEM.SCENE, 'Auto-check on new message is disabled');
    return;
  }

  const ctx = getContext();
  const chat = ctx.chat;

  if (!chat || chat.length === 0) {
    debug(SUBSYSTEM.SCENE, 'No chat messages available for scene break processing');
    return;
  }

  const forceFullRescan = typeof window !== 'undefined' && window.autoRecapForceSceneBreakRescan === true;

  debug(
    SUBSYSTEM.SCENE,
    'New message at index',
    messageIndex,
    '(mode:',
    forceFullRescan ? 'full-rescan' : 'to-last-scene-break',
    ')'
  );

  // Delegate to unified core function
  // Pass messageIndex as endIndex - core function will apply offset automatically
  // For forceFullRescan, explicitly set startIndex to 0
  await detectSceneBreaksInRange(chat, {
    startIndex: forceFullRescan ? 0 : null,
    endIndex: messageIndex
  });

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


import {
  get_settings,
  getContext,
  get_data,
  set_data,
  summarize_text,
  debug,
  error,
  toast,
  log,
  SUBSYSTEM,
  saveChatDebounced,
  get_connection_profile_api,
  getPresetManager,
  set_connection_profile,
  get_current_connection_profile } from
'./index.js';

const DEFAULT_RECENT_MESSAGE_COUNT = 3;

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

// Helper: Collect matching messages before the current index for prompt context
function collectContextMessages(chat , index , checkWhich , count ) {
  const contextMessages = [];
  if (!chat || chat.length === 0) {
    return contextMessages;
  }

  const limit = count > 0 ? count : Number.POSITIVE_INFINITY;

  for (let i = index - 1; i >= 0; i--) {
    const message = chat[i];
    // Stop at the most recent VISIBLE scene break and exclude it from context
    try {
      const hasSceneBreak = get_data(message, 'scene_break');
      const isVisible = get_data(message, 'scene_break_visible');
      if (hasSceneBreak && (isVisible === undefined || isVisible === true)) {
        break;
      }
    } catch {/* ignore lookup errors */}
    if (!messageMatchesType(message, checkWhich)) {
      continue;
    }

    contextMessages.push(message);
    if (contextMessages.length >= limit) {
      break;
    }
  }

  return contextMessages.reverse();
}

// Helper: Hard rule — always skip the immediate message after any scene break
// This is non-consuming: if the previous message has a scene break marker, the current is skipped.
function isCooldownSkip(chat , index , _consume  = false) {
  if (!Array.isArray(chat) || index <= 0) return false;
  const prev = chat[index - 1];
  if (!prev) return false;
  try {
    const hasSceneBreak = get_data(prev, 'scene_break');
    const isVisible = get_data(prev, 'scene_break_visible');
    return Boolean(hasSceneBreak && (isVisible === undefined || isVisible === true));
  } catch {
    return false;
  }
}

// Helper: Format messages for the detection prompt
function formatContextMessagesForPrompt(messages ) {
  if (!messages || messages.length === 0) {
    return '(No previous messages available for comparison)';
  }

  return messages.map((msg, idx) => {
    const speaker = msg.is_user ? '[USER]' : '[CHARACTER]';
    const numbering = messages.length > 1 ? `${idx + 1}. ` : '';
    return `${numbering}${speaker} ${msg.mes}`;
  }).join('\n\n');
}

// Helper: Parse scene break detection response
async function parseSceneBreakResponse(response, messageIndex) {
  // Try to parse as JSON first using centralized helper
  try {
    const { extractJsonFromResponse } = await import('./utils.js');
    const parsed = extractJsonFromResponse(response, {
      requiredFields: ['status'],
      context: 'scene break detection'
    });
    const isSceneBreak = parsed.status === true || parsed.status === 'true';
    const rationale = parsed.rationale || '';
    debug('Parsed JSON for message', messageIndex, '- Status:', isSceneBreak, '- Rationale:', rationale);
    return { isSceneBreak, rationale };
  } catch (jsonErr) {
    // JSON parsing failed, try fallback patterns
    debug('JSON parsing failed for message', messageIndex, ', using fallback:', jsonErr.message);

    // Fallbacks: common plain-text patterns
    const lower = response.toLowerCase();
    // Explicit "SCENE BREAK:" style prefix used in tests
    if (lower.startsWith('scene break')) {
      const rationale = response.split(':').slice(1).join(':').trim();
      return { isSceneBreak: true, rationale };
    }
    // Generic text that contains the word "true"
    const isSceneBreak = lower.includes('true');
    debug('No JSON found for message', messageIndex, ', using fallback. Status:', isSceneBreak);
    return { isSceneBreak, rationale: 'No JSON found, fallback to text search' };
  }
}

// Helper: Switch to detection profile/preset using PresetManager API
async function switchToDetectionSettings(ctx, profile, preset) {
  // Save current connection profile
  const savedProfile = await get_current_connection_profile();

  // Switch to configured connection profile if specified
  if (profile) {
    await set_connection_profile(profile);
    debug(`Switched connection profile to: ${profile}`);
  }

  // Get API from connection profile
  const api = await get_connection_profile_api(profile);
  if (!api) {
    debug('No API found for connection profile, using defaults');
    return { savedProfile };
  }

  // Get PresetManager for that API
  const presetManager = getPresetManager(api);
  if (!presetManager) {
    debug(`No PresetManager found for API: ${api}`);
    return { savedProfile };
  }

  // Save current preset for this API
  const savedPreset = presetManager.getSelectedPreset();

  // Switch to configured preset if specified
  if (preset) {
    const presetValue = presetManager.findPreset(preset);
    if (presetValue) {
      debug(`Switching ${api} preset to: ${preset}`);
      presetManager.selectPreset(presetValue);
    } else {
      debug(`Preset '${preset}' not found for API ${api}`);
    }
  }

  return { savedProfile, api, presetManager, savedPreset };
}

// Helper: Restore previous profile/preset using PresetManager API
async function restoreSettings(ctx, saved) {
  if (!saved) return;

  // Restore preset if it was changed
  if (saved.presetManager && saved.savedPreset) {
    debug(`Restoring ${saved.api} preset to original`);
    saved.presetManager.selectPreset(saved.savedPreset);
  }

  // Restore connection profile if it was changed
  if (saved.savedProfile) {
    await set_connection_profile(saved.savedProfile);
    debug(`Restored connection profile to: ${saved.savedProfile}`);
  }
}

// Helper: Build detection prompt
function buildDetectionPrompt(ctx, promptTemplate, message, contextMessages, prefill) {
  const previousText = formatContextMessagesForPrompt(contextMessages);

  let prompt = promptTemplate;
  if (ctx.substituteParamsExtended) {
    prompt = ctx.substituteParamsExtended(prompt, {
      previous_messages: previousText,
      previous_message: previousText,
      current_message: message.mes,
      message: message.mes,
      prefill
    }) || prompt;
  }

  prompt = prompt.replace(/\{\{previous_messages\}\}/g, previousText);
  prompt = prompt.replace(/\{\{previous_message\}\}/g, previousText);
  prompt = prompt.replace(/\{\{current_message\}\}/g, message.mes);
  prompt = prompt.replace(/\{\{message\}\}/g, message.mes);
  return { prompt, prefill };
}

async function detectSceneBreak(
message ,
messageIndex )
{
  const ctx = getContext();

  try {
    debug('Checking message', messageIndex, 'for scene break');

    // Get settings
    const promptTemplate = get_settings('auto_scene_break_prompt');
    const prefill = get_settings('auto_scene_break_prefill') || '';
    const profile = get_settings('auto_scene_break_connection_profile');
    const preset = get_settings('auto_scene_break_completion_preset');
    const includePresetPrompts = get_settings('auto_scene_break_include_preset_prompts') ?? false;
    const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
    const contextCountRaw = Number(get_settings('auto_scene_break_recent_message_count'));
    const contextCount = Number.isFinite(contextCountRaw) ? Math.max(0, contextCountRaw) : DEFAULT_RECENT_MESSAGE_COUNT;

    const chat = ctx.chat || [];
    const contextMessages = collectContextMessages(chat, messageIndex, checkWhich, contextCount);

    // Guard: Skip detection if no context messages available
    // This happens when the message immediately follows a scene break or is at the start of chat
    if (contextMessages.length === 0) {
      debug('Skipping scene break detection for message', messageIndex, '- no previous context available');
      set_data(message, 'auto_scene_break_checked', true);
      saveChatDebounced();
      return {
        isSceneBreak: false,
        rationale: 'Skipped - no previous messages available for comparison'
      };
    }

    // Calculate actual range based on collected context messages
    // This accounts for scene breaks that limit the context window
    let actualStartIdx = messageIndex;
    if (contextMessages.length > 0) {
      // Find the index of the first (oldest) context message in the chat array
      const firstContextMsg = contextMessages[0];
      actualStartIdx = chat.indexOf(firstContextMsg);
      if (actualStartIdx === -1) {
        // Fallback if not found (shouldn't happen)
        actualStartIdx = Math.max(0, messageIndex - contextCount);
      }
    }

    // Build prompt
    const { prompt, prefill: detectionPrefill } = buildDetectionPrompt(ctx, promptTemplate, message, contextMessages, prefill);

    // Switch to detection profile/preset and save current
    const saved = await switchToDetectionSettings(ctx, profile, preset);

    ctx.deactivateSendButtons();

    // Set operation context for ST_METADATA with actual range
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    setOperationSuffix(`-${actualStartIdx}-${messageIndex}`);

    let response;
    try {
      // Call LLM using the configured API
      debug('Sending prompt to AI for message', messageIndex);
      response = await summarize_text(prompt, detectionPrefill, includePresetPrompts, preset);
      debug('AI raw response for message', messageIndex, ':', response);
    } finally {
      clearOperationSuffix();
    }

    // Re-enable input and restore settings
    ctx.activateSendButtons();
    await restoreSettings(ctx, saved);

    // Parse response
    const { isSceneBreak, rationale } = await parseSceneBreakResponse(response, messageIndex);

    // Log the decision
    debug(isSceneBreak ? '✓ SCENE BREAK DETECTED' : '✗ No scene break', 'for message', messageIndex);
    debug('  Rationale:', rationale);

    // Mark message as checked
    set_data(message, 'auto_scene_break_checked', true);
    saveChatDebounced();

    return { isSceneBreak, rationale };

  } catch (err) {
    error('ERROR in detectSceneBreak for message', messageIndex);
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
async function tryQueueSceneBreaks(chat, start, end, latestIndex, offset, checkWhich) {
  log(SUBSYSTEM.SCENE, '[Queue] Queueing scene break detections instead of executing directly');

  // Import queue integration
  const { queueDetectSceneBreaks } = await import('./queueIntegration.js');

  // Collect indexes to check
  const indexesToCheck = [];
  for (let i = start; i <= end; i++) {
    if (!shouldCheckMessage(chat[i], i, latestIndex, offset, checkWhich)) {
      continue;
    }
    // Apply cooldown: if previous message has an unconsumed cooldown, skip and consume it
    if (isCooldownSkip(chat, i, true)) {
      debug(SUBSYSTEM.SCENE, 'Skipping index', i, 'due to scene-break cooldown');
      continue;
    }
    indexesToCheck.push(i);
  }

  if (indexesToCheck.length === 0) {
    toast(`No messages to check (all already scanned or filtered out)`, 'info');
    return { queued: true, count: 0 };
  }

  // Queue all scene break detections
  const operationIds = await queueDetectSceneBreaks(indexesToCheck);

  if (operationIds && operationIds.length > 0) {
    log(SUBSYSTEM.SCENE, `[Queue] Queued ${operationIds.length} scene break detection operations`);
    toast(`Queued ${operationIds.length} scene break detection(s)`, 'info');
    return { queued: true, count: operationIds.length };
  }

  error(SUBSYSTEM.SCENE, '[Queue] Failed to enqueue scene break detections');
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
  const queueResult = await tryQueueSceneBreaks(chat, start, end, latestIndex, offset, checkWhich);
  if (!queueResult) {
    error(SUBSYSTEM.SCENE, 'Failed to enqueue scene break detection operations');
    toast('Failed to queue scene break detection. Check console for details.', 'error');
    return;
  }

  log(SUBSYSTEM.SCENE, `Successfully queued ${queueResult.count} scene break detection(s)`);
  return;
}

export async function manualSceneBreakDetection() {
  debug('Manual scene break detection triggered');
  toast('Scanning messages for scene breaks...', 'info');

  // Process all messages
  await processAutoSceneBreakDetection();
}

// Complex range calculation algorithm with multiple constraints - inherent complexity
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
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
  let endIndex = Math.min(endIndexRaw, chat.length - 1);

  if (endIndex < 0) {
    debug(SUBSYSTEM.SCENE, 'No messages to check based on offset - messageIndex:', messageIndex, 'offset:', offset);
    return;
  }

  const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
  const recentCountRaw = Number(get_settings('auto_scene_break_recent_message_count'));
  const recentCount = Number.isFinite(recentCountRaw) ? Math.max(0, recentCountRaw) : DEFAULT_RECENT_MESSAGE_COUNT;

  const forceFullRescan = typeof window !== 'undefined' && window.autoSummarizeForceSceneBreakRescan === true;

  let rangeStart = 0;
  if (!forceFullRescan && recentCount > 0) {
    let matchedCount = 0;
    rangeStart = endIndex;
    for (let i = endIndex; i >= 0; i--) {
      if (messageMatchesType(chat[i], checkWhich)) {
        matchedCount++;
        rangeStart = i;
        if (matchedCount >= recentCount) {
          break;
        }
      }

      if (i === 0) {
        rangeStart = 0;
      }
    }

    if (matchedCount < recentCount) {
      rangeStart = 0;
    }
  }

  const latestIndex = chat.length - 1;

  if (!forceFullRescan) {
    // Determine the newest message that needs checking within the window
    const windowStart = rangeStart;
    let targetIndex = -1;
    for (let i = endIndex; i >= windowStart; i--) {
      const candidate = chat[i];
      if (shouldCheckMessage(candidate, i, latestIndex, offset, checkWhich) && !isCooldownSkip(chat, i, false)) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex === -1) {
      debug(
        SUBSYSTEM.SCENE,
        'No eligible messages to check after window evaluation (end:',
        endIndex,
        ', window start:',
        windowStart,
        ')'
      );
      return;
    }

    rangeStart = targetIndex;
    endIndex = targetIndex;
  }

  debug(
    SUBSYSTEM.SCENE,
    'New message at index',
    messageIndex,
    ', checking range',
    rangeStart,
    'to',
    endIndex,
    '(recent count:',
    forceFullRescan ? 'full-rescan' : recentCount,
    ', type:',
    checkWhich,
    ')'
  );

  log(SUBSYSTEM.SCENE, 'Processing auto scene break detection for range', rangeStart, 'to', endIndex);
  await processAutoSceneBreakDetection(rangeStart, endIndex);

  if (forceFullRescan && typeof window !== 'undefined') {
    window.autoSummarizeForceSceneBreakRescan = false;
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

export async function clearAllCheckedFlags() {
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
  isCooldownSkip };
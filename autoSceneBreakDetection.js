
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
  toggleSceneBreak,
  generateSceneSummary,
  get_connection_profile_api,
  getPresetManager,
  set_connection_profile,
  get_current_connection_profile } from
'./index.js';

const DEFAULT_RECENT_MESSAGE_COUNT = 3;

// Module-level cancellation token for the current scan
// This allows us to cancel delays when user aborts
let currentScanCancellationToken = null;

/**
 * Check if a message should be scanned for scene break detection
 * @param {object} message - The message object
 * @param {number} messageIndex - Index in chat array
 * @param {number} latestIndex - Index of latest message
 * @param {number} offset - Message offset setting (how many to skip from end)
 * @param {string} checkWhich - Which messages to check ("user", "character", "both")
 * @returns {boolean} - True if message should be checked
 */
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
function parseSceneBreakResponse(response, messageIndex) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const isSceneBreak = parsed.status === true || parsed.status === 'true';
      const rationale = parsed.rationale || '';
      debug('Parsed JSON for message', messageIndex, '- Status:', isSceneBreak, '- Rationale:', rationale);
      return { isSceneBreak, rationale };
    }
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
  } catch (err) {
    error('Failed to parse JSON response for message', messageIndex, ':', err);
    const isSceneBreak = response.toLowerCase().includes('true');
    return { isSceneBreak, rationale: 'JSON parse error, fallback to text search' };
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
  return `${prompt}\n${prefill}`;
}

/**
 * Detect if a message should be a scene break using LLM
 * @param {object} message - The message object being checked
 * @param {number} messageIndex - Index in chat array
 * @param {object|null} previousMessage - The previous message for context (null if first message)
 * @returns {Promise<{isSceneBreak: boolean, rationale: string}>} - Object with detection result and rationale
 */
async function detectSceneBreak(
message ,
messageIndex ,
previousMessage  = null)
{
  const ctx = getContext();

  try {
    debug('Checking message', messageIndex, 'for scene break');

    // Get settings
    const promptTemplate = get_settings('auto_scene_break_prompt');
    const prefill = get_settings('auto_scene_break_prefill') || '';
    const profile = get_settings('auto_scene_break_connection_profile');
    const preset = get_settings('auto_scene_break_completion_preset');
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
    const prompt = buildDetectionPrompt(ctx, promptTemplate, message, contextMessages, prefill);

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
      response = await summarize_text(prompt);
      debug('AI raw response for message', messageIndex, ':', response);
    } finally {
      clearOperationSuffix();
    }

    // Re-enable input and restore settings
    ctx.activateSendButtons();
    await restoreSettings(ctx, saved);

    // Parse response
    const { isSceneBreak, rationale } = parseSceneBreakResponse(response, messageIndex);

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

/**
 * Delay for a specified number of milliseconds
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Interruptible delay that checks for abort signals periodically
 * Splits the delay into 1-second chunks and checks if we should abort between chunks
 * @param {number} ms - Milliseconds to delay
 * @param {object} cancellationToken - Object with a `cancelled` property that can be set to true to abort
 * @returns {Promise<void>}
 */
async function interruptibleDelay(ms, cancellationToken = null) {
  const chunkSize = 1000; // Check every 1 second
  const chunks = Math.ceil(ms / chunkSize);

  for (let i = 0; i < chunks; i++) {
    // Check if cancelled before each chunk
    if (cancellationToken?.cancelled) {
      debug('Delay interrupted - cancellation detected');
      throw new Error('ABORTED');
    }

    // Wait for the chunk (or remaining time if last chunk)
    const remainingMs = ms - i * chunkSize;
    const waitTime = Math.min(chunkSize, remainingMs);
    // Sequential execution required: chunked delay must complete in order
    // eslint-disable-next-line no-await-in-loop
    await delay(waitTime);
  }
}

/**
 * Detect scene break with exponential backoff retry on ALL errors
 * Since SillyTavern strips error details, we can't detect rate limits specifically.
 * Instead, we retry with backoff on ANY error (rate limit or otherwise).
 * @param {object} message - The message object
 * @param {number} messageIndex - Index in chat array
 * @param {object|null} previousMessage - The previous message for context
 * @param {number} maxRetries - Maximum number of retries (default 5)
 * @param {object|null} cancellationToken - Token to check for cancellation during delays
 * @returns {Promise<{isSceneBreak: boolean, rationale: string}>} - Object with detection result and rationale
 */
async function detectSceneBreakWithRetry(message, messageIndex, previousMessage = null, maxRetries = 5, cancellationToken = null) {
  let retryCount = 0;
  let lastError = null;

  while (retryCount <= maxRetries) {
    try {
      debug('Attempting detection for message', messageIndex, 'attempt', retryCount + 1, '/', maxRetries + 1);
      // Sequential execution required: retry loop must wait for each attempt
      // eslint-disable-next-line no-await-in-loop
      const result = await detectSceneBreak(message, messageIndex, previousMessage);
      debug('Detection successful for message', messageIndex, 'on attempt', retryCount + 1);
      return result;
    } catch (err) {
      lastError = err;
      error('***** RETRY LOOP CAUGHT ERROR for message', messageIndex, 'attempt', retryCount + 1, '*****');
      error('***** Error message:', err?.message || String(err), '*****');

      // Check if user aborted the request - if so, stop immediately without retrying
      const errorString = String(err?.message || err);
      if (errorString.includes('Clicked stop button') || errorString.includes('aborted') || errorString.includes('ABORTED')) {
        error('***** USER ABORTED - stopping all retries *****');
        // Mark the cancellation token so delays will also stop
        if (cancellationToken) {
          cancellationToken.cancelled = true;
        }
        toast('Scene break detection aborted by user', 'warning');
        throw new Error('ABORTED'); // Throw special error to signal abort
      }

      // Retry with backoff on ANY error (we can't detect rate limits due to error stripping)
      if (retryCount < maxRetries) {
        // Calculate exponential backoff delay: 10s, 20s, 40s, 80s, 160s
        const backoffDelay = 10 * Math.pow(2, retryCount) * 1000;

        retryCount++;
        error('***** BACKING OFF', backoffDelay, 'ms before retry', retryCount, '/', maxRetries, '*****');
        toast(`⚠️ Error! Waiting ${backoffDelay / 1000}s before retry ${retryCount}/${maxRetries} for message ${messageIndex}...`, 'warning');
        // Sequential execution required: allow toast to display before continuing
        // eslint-disable-next-line no-await-in-loop
        await delay(50); // Allow toast to display

        // Use interruptible delay that can be cancelled mid-wait
        try {
          // Sequential execution required: exponential backoff between retries
          // eslint-disable-next-line no-await-in-loop
          await interruptibleDelay(backoffDelay, cancellationToken);
          error('***** Backoff complete, retrying message', messageIndex, '*****');
        } catch {
          // Delay was interrupted by cancellation
          error('***** Backoff cancelled - user aborted *****');
          throw new Error('ABORTED');
        }
        // Continue to next retry iteration
      } else {
        // Max retries exceeded - stop scanning
        error('***** MAX RETRIES EXCEEDED - throwing error up *****');
        throw err;
      }
    }
  }

  // If we got here, all retries failed
  error('Max retries', maxRetries, 'exceeded for message', messageIndex);
  throw lastError;
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

// Helper: Handle detected scene break
async function handleDetectedSceneBreak(i, rationale, cancellationToken) {
  debug('Marking message', i, 'as scene break');

  const get_message_div = (idx) => $(`div[mesid="${idx}"]`);
  toggleSceneBreak(i, get_message_div, getContext, set_data, get_data, saveChatDebounced);

  // No per-message decrementing cooldown; skipping is enforced by adjacency rule (prev has scene_break)

  // Auto-generate scene summary if enabled
  if (!get_settings('auto_scene_break_generate_summary')) return;

  // Delay before generating summary to avoid rate limiting
  debug('Waiting 5 seconds before generating scene summary...');
  toast(`Waiting 5s before generating scene summary for message ${i}...`, 'info');
  await delay(50);

  try {
    await interruptibleDelay(5000, cancellationToken);
  } catch {
    error('Pre-summary delay cancelled - user aborted');
    throw new Error('ABORTED');
  }

  debug('Auto-generating scene summary for message', i);
  toast(`Generating scene summary for message ${i}...`, 'info');
  await delay(50);

  // Set loading state in summary box
  const $msgDiv = get_message_div(i);
  const $summaryBox = $msgDiv.find('.scene-summary-box');
  if ($summaryBox.length) {
    $summaryBox.val("Generating scene summary...");
  }

  await generateSceneSummary(i, get_message_div, getContext, get_data, set_data, saveChatDebounced);

  toast(`✓ Scene summary generated for message ${i}`, 'success');
  await delay(50);
}

// Helper: Handle scan errors
function handleScanError(err, i, checkedCount, totalToCheck, detectedCount, cancellationToken, eventSource, event_types, stopHandler) {
  error('!!!!! FATAL ERROR IN MAIN LOOP for message', i, '!!!!!', err);
  error('!!!!! Error message:', err?.message || String(err), '!!!!!');

  const errorString = String(err?.message || err);
  if (errorString.includes('ABORTED') || errorString.includes('Clicked stop button') || errorString.includes('aborted')) {
    error('!!!!! USER ABORTED - STOPPING SCAN !!!!!');
    cancellationToken.cancelled = true;
    currentScanCancellationToken = null;
    eventSource.off(event_types.GENERATION_STOPPED, stopHandler);
    return { aborted: true, checkedCount, totalToCheck, detectedCount };
  }

  // Real error - stop scan
  error('!!!!! STOPPING SCAN !!!!!');
  currentScanCancellationToken = null;
  eventSource.off(event_types.GENERATION_STOPPED, stopHandler);
  return { error: true, message: err?.message || String(err), checkedCount, totalToCheck, detectedCount };
}

// Helper: Count messages to check in range
function countMessagesToCheck(chat, start, end, latestIndex, offset, checkWhich) {
  let totalToCheck = 0;
  for (let i = start; i <= end; i++) {
    if (shouldCheckMessage(chat[i], i, latestIndex, offset, checkWhich) && !isCooldownSkip(chat, i, false)) {
      totalToCheck++;
    }
  }
  return totalToCheck;
}

// Helper: Handle scene break summary generation
async function handleSceneSummaryGeneration(i, rationale, cancellationToken) {
  try {
    await handleDetectedSceneBreak(i, rationale, cancellationToken);
  } catch (err) {
    const errorString = String(err?.message || err);
    if (errorString.includes('Clicked stop button') || errorString.includes('aborted')) {
      error('Scene summary generation aborted by user for message', i);
      cancellationToken.cancelled = true;
      throw new Error('ABORTED');
    }
    error('Failed to auto-generate scene summary for message', i, ':', err);
    toast(`Failed to generate scene summary for message ${i}: ${err?.message || String(err)}`, 'error');
    await delay(50);
  }
}

// Helper: Process single message in scan
async function processScanMessage(chat, i, end, cancellationToken) {
  const previousMessage = i > 0 ? chat[i - 1] : null;
  const { isSceneBreak, rationale } = await detectSceneBreakWithRetry(chat[i], i, previousMessage, 5, cancellationToken);

  let detectedCount = 0;
  if (isSceneBreak) {
    detectedCount = 1;
    const rationaleText = rationale ? ` - ${rationale}` : '';
    toast(`✓ Scene break at message ${i}${rationaleText}`, 'success');
    await delay(50);
    await handleSceneSummaryGeneration(i, rationale, cancellationToken);
  }

  // Delay between messages
  if (i < end) {
    try {
      await interruptibleDelay(5000, cancellationToken);
    } catch {
      error('Between-message delay cancelled - user aborted');
      throw new Error('ABORTED');
    }
  }

  return detectedCount;
}

// Helper: Execute scan loop
async function executeScanLoop(chat, start, end, latestIndex, offset, checkWhich, cancellationToken, eventSource, event_types, stopHandler) {
  let checkedCount = 0;
  let detectedCount = 0;

  const totalToCheck = countMessagesToCheck(chat, start, end, latestIndex, offset, checkWhich);

  if (totalToCheck === 0) {
    toast(`No messages to check (all already scanned or filtered out)`, 'info');
    return { checkedCount, detectedCount, totalToCheck };
  }

  toast(`Starting scene break scan: 0/${totalToCheck} messages to check...`, 'info');
  await delay(50);

  // Process each message
  for (let i = start; i <= end; i++) {
    const message = chat[i];

    if (!shouldCheckMessage(message, i, latestIndex, offset, checkWhich)) {
      continue;
    }

    // Cooldown: skip and consume if immediately after a scene break with remaining cooldown
    if (isCooldownSkip(chat, i, true)) {
      debug(SUBSYSTEM.SCENE, 'Cooldown skip applied at index', i);
      continue;
    }

    checkedCount++;
    toast(`Scanning for scene breaks: ${checkedCount}/${totalToCheck} (found ${detectedCount})...`, 'info');
    // Sequential execution required: UI responsiveness delay
    // eslint-disable-next-line no-await-in-loop
    await delay(50);

    try {
      // Sequential execution required: messages must be processed in order, respecting rate limits
      // eslint-disable-next-line no-await-in-loop
      const detected = await processScanMessage(chat, i, end, cancellationToken);
      detectedCount += detected;
    } catch (err) {
      const result = handleScanError(err, i, checkedCount, totalToCheck, detectedCount, cancellationToken, eventSource, event_types, stopHandler);
      if (result.aborted) {
        toast(`⏹️ Scan aborted by user. Checked ${result.checkedCount}/${result.totalToCheck}, found ${result.detectedCount} scene breaks.`, 'info');
        // Sequential execution required: allow toast to display before returning
        // eslint-disable-next-line no-await-in-loop
        await delay(100);
        return null;
      }
      if (result.error) {
        toast(`🛑 Error on message ${i} after all retries: ${result.message}. Checked ${result.checkedCount}/${result.totalToCheck}, found ${result.detectedCount} scene breaks.`, 'error');
        // Sequential execution required: allow toast to display before returning
        // eslint-disable-next-line no-await-in-loop
        await delay(100);
        return null;
      }
    }
  }

  return { checkedCount, detectedCount, totalToCheck };
}

/**
 * Process messages for auto scene break detection
 * @param {number} startIndex - Start index (optional, defaults to 0)
 * @param {number} endIndex - End index (optional, defaults to latest)
 */
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

/**
 * Manually trigger scene break detection on all eligible messages
 */
export async function manualSceneBreakDetection() {
  debug('Manual scene break detection triggered');
  toast('Scanning messages for scene breaks...', 'info');

  // Process all messages
  await processAutoSceneBreakDetection();
}

/**
 * Process only new messages (called on MESSAGE_SENT, MESSAGE_RECEIVED events)
 * @param {number} messageIndex - Index of the new message
 */
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

/**
 * Process messages on chat load
 */
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

/**
 * Used when a scene break is hidden to allow re-detection
 * @param {number} startIndex - Index of the hidden scene break
 * @param {number} endIndex - Index of the next visible scene break (or end of chat)
 */
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

/**
 * Sets auto_scene_break_checked flag for messages in a range
 * @param {number} startIndex - Start index (inclusive)
 * @param {number} endIndex - End index (inclusive)
 * @returns {number} - Number of messages marked
 */
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

/**
 */
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
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
} from './index.js';

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
function shouldCheckMessage(message, messageIndex, latestIndex, offset, checkWhich) {
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

/**
 * Detect if a message should be a scene break using LLM
 * @param {object} message - The message object being checked
 * @param {number} messageIndex - Index in chat array
 * @param {object|null} previousMessage - The previous message for context (null if first message)
 * @returns {Promise<{isSceneBreak: boolean, rationale: string}>} - Object with detection result and rationale
 */
async function detectSceneBreak(message, messageIndex, previousMessage = null) {
    const ctx = getContext();

    try {
        debug('Checking message', messageIndex, 'for scene break');

        // Get settings
        const promptTemplate = get_settings('auto_scene_break_prompt');
        const prefill = get_settings('auto_scene_break_prefill') || '';
        const profile = get_settings('auto_scene_break_connection_profile');
        const preset = get_settings('auto_scene_break_completion_preset');

        // Save current profile/preset to restore later
        const current_profile = await ctx.get_current_connection_profile?.();
        const current_preset = await ctx.get_current_preset?.();

        // Format previous message for context (if exists)
        const previousText = previousMessage ? previousMessage.mes : '(No previous message - this is the first message)';

        // Prepare prompt with both previous and current message
        let prompt = promptTemplate;
        if (ctx.substituteParamsExtended) {
            prompt = ctx.substituteParamsExtended(prompt, {
                previous_message: previousText,
                current_message: message.mes,
                message: message.mes, // Keep for backward compatibility
                prefill
            }) || prompt;
        }
        // Replace placeholders
        prompt = prompt.replace(/\{\{previous_message\}\}/g, previousText);
        prompt = prompt.replace(/\{\{current_message\}\}/g, message.mes);
        prompt = prompt.replace(/\{\{message\}\}/g, message.mes); // Backward compatibility
        prompt = `${prompt}\n${prefill}`;

        // Switch to detection profile/preset if set
        if (profile) {
            debug('Switching to connection profile:', profile);
            await ctx.set_connection_profile?.(profile);
        }
        if (preset) {
            debug('Switching to preset:', preset);
            await ctx.set_preset?.(preset);
        }

        // Block input if setting is enabled
        if (get_settings('block_chat')) {
            ctx.deactivateSendButtons();
        }

        // Call LLM
        debug('Sending prompt to AI for message', messageIndex);
        const response = await summarize_text(prompt);
        debug('AI raw response for message', messageIndex, ':', response);

        // Re-enable input if it was blocked
        if (get_settings('block_chat')) {
            ctx.activateSendButtons();
        }

        // Restore previous profile/preset
        if (profile) {
            debug('Restoring previous connection profile:', current_profile);
            await ctx.set_connection_profile?.(current_profile);
        }
        if (preset) {
            debug('Restoring previous preset:', current_preset);
            await ctx.set_preset?.(current_preset);
        }

        // Parse JSON response
        let isSceneBreak = false;
        let rationale = '';

        try {
            // Try to extract JSON from response (in case there's extra text)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                isSceneBreak = parsed.status === true || parsed.status === 'true';
                rationale = parsed.rationale || '';
                debug('Parsed JSON for message', messageIndex, '- Status:', isSceneBreak, '- Rationale:', rationale);
            } else {
                // Fallback: check if response contains "true" (backward compatibility)
                isSceneBreak = response.toLowerCase().includes('true');
                rationale = 'No JSON found, fallback to text search';
                debug('No JSON found for message', messageIndex, ', using fallback. Status:', isSceneBreak);
            }
        } catch (err) {
            // If JSON parsing fails, fall back to simple text search
            error('Failed to parse JSON response for message', messageIndex, ':', err);
            isSceneBreak = response.toLowerCase().includes('true');
            rationale = 'JSON parse error, fallback to text search';
            debug('JSON parse failed for message', messageIndex, ', using fallback. Status:', isSceneBreak);
        }

        // Log the decision with rationale
        if (isSceneBreak) {
            debug('✓ SCENE BREAK DETECTED for message', messageIndex);
            debug('  Rationale:', rationale);
        } else {
            debug('✗ No scene break for message', messageIndex);
            debug('  Rationale:', rationale);
        }

        // Mark message as checked
        set_data(message, 'auto_scene_break_checked', true);
        saveChatDebounced();

        return { isSceneBreak, rationale };

    } catch (err) {
        // SillyTavern strips error details, so we can't detect rate limits specifically
        // Just log the error and throw it up for retry handling
        error('ERROR in detectSceneBreak for message', messageIndex);
        error('Error message:', err?.message || String(err));

        // DO NOT mark message as checked - allow retry
        // Throw error up to retry handler
        throw err;
    }
}

/**
 * Delay for a specified number of milliseconds
 * @param {number} ms - Milliseconds to delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        const remainingMs = ms - (i * chunkSize);
        const waitTime = Math.min(chunkSize, remainingMs);
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
            // Try to detect scene break with previous message context
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
                toast(`⚠️ Error! Waiting ${backoffDelay/1000}s before retry ${retryCount}/${maxRetries} for message ${messageIndex}...`, 'warning');
                await delay(50); // Allow toast to display

                // Use interruptible delay that can be cancelled mid-wait
                try {
                    await interruptibleDelay(backoffDelay, cancellationToken);
                    error('***** Backoff complete, retrying message', messageIndex, '*****');
                } catch (cancelErr) {
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

/**
 * Process messages for auto scene break detection
 * @param {number} startIndex - Start index (optional, defaults to 0)
 * @param {number} endIndex - End index (optional, defaults to latest)
 */
export async function processAutoSceneBreakDetection(startIndex = null, endIndex = null) {
    log(SUBSYSTEM.SCENE, '=== processAutoSceneBreakDetection called with startIndex:', startIndex, 'endIndex:', endIndex, '===');

    // Check if enabled
    const enabled = get_settings('auto_scene_break_enabled');
    if (!enabled) {
        debug(SUBSYSTEM.SCENE, 'Auto scene break detection is disabled - exiting');
        return;
    }

    log(SUBSYSTEM.SCENE, 'Auto scene break detection is ENABLED, proceeding...');

    const ctx = getContext();
    const chat = ctx.chat;
    if (!chat || chat.length === 0) {
        debug(SUBSYSTEM.SCENE, 'No messages to process - chat is empty');
        return;
    }

    // Get settings
    const offset = Number(get_settings('auto_scene_break_message_offset')) ?? 0;
    const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';

    // Determine range
    const latestIndex = chat.length - 1;
    const start = startIndex !== null ? startIndex : 0;
    const end = endIndex !== null ? endIndex : latestIndex;

    log(SUBSYSTEM.SCENE, 'Processing messages', start, 'to', end, '(latest:', latestIndex, ', offset:', offset, ', checking:', checkWhich, ')');

    // Create a new cancellation token for this scan
    // This allows us to cancel delays when user aborts
    currentScanCancellationToken = { cancelled: false };
    const cancellationToken = currentScanCancellationToken;

    // Listen for stop button clicks and cancel the scan
    const eventSource = ctx.eventSource;
    const event_types = ctx.event_types;

    const stopHandler = () => {
        if (cancellationToken && !cancellationToken.cancelled) {
            debug('!!!!! GENERATION_STOPPED event received - cancelling scan !!!!!');
            cancellationToken.cancelled = true;
        }
    };

    // Add the event listener
    eventSource.once(event_types.GENERATION_STOPPED, stopHandler);

    let checkedCount = 0;
    let detectedCount = 0;
    let errorCount = 0;

    // Count how many messages will actually be checked (after filtering)
    let totalToCheck = 0;
    for (let i = start; i <= end; i++) {
        if (shouldCheckMessage(chat[i], i, latestIndex, offset, checkWhich)) {
            totalToCheck++;
        }
    }

    if (totalToCheck === 0) {
        toast(`No messages to check (all already scanned or filtered out)`, 'info');
        currentScanCancellationToken = null; // Clear the token
        eventSource.off(event_types.GENERATION_STOPPED, stopHandler); // Clean up event listener
        return;
    }

    // Show initial progress
    toast(`Starting scene break scan: 0/${totalToCheck} messages to check...`, 'info');
    await delay(50); // Small delay to allow UI to update

    // Process each message in range
    for (let i = start; i <= end; i++) {
        const message = chat[i];

        // Check if message should be scanned
        if (!shouldCheckMessage(message, i, latestIndex, offset, checkWhich)) {
            continue;
        }

        checkedCount++;

        // Show progress on every message for immediate feedback
        toast(`Scanning for scene breaks: ${checkedCount}/${totalToCheck} (found ${detectedCount})...`, 'info');
        await delay(50); // Small delay to allow UI to update and show toast

        try {
            // Get previous message for context (if exists)
            const previousMessage = i > 0 ? chat[i - 1] : null;

            // Detect scene break with exponential backoff retry (pass cancellation token)
            const { isSceneBreak, rationale } = await detectSceneBreakWithRetry(message, i, previousMessage, 5, cancellationToken);

            if (isSceneBreak) {
                detectedCount++;
                debug('Marking message', i, 'as scene break');

                // Show toast with rationale
                const rationaleText = rationale ? ` - ${rationale}` : '';
                toast(`✓ Scene break at message ${i}${rationaleText}. Total: ${detectedCount}`, 'success');
                await delay(50); // Allow toast to display

                // Use toggleSceneBreak from sceneBreak.js to mark the message
                const get_message_div = (idx) => $(`div[mesid="${idx}"]`);
                toggleSceneBreak(i, get_message_div, getContext, set_data, get_data, saveChatDebounced);

                // Auto-generate scene summary if enabled
                if (get_settings('auto_scene_break_generate_summary')) {
                    try {
                        // Delay before generating summary to avoid rate limiting
                        debug('Waiting 5 seconds before generating scene summary...');
                        toast(`Waiting 5s before generating scene summary for message ${i}...`, 'info');
                        await delay(50); // Allow toast to display

                        try {
                            await interruptibleDelay(5000, cancellationToken);
                        } catch (cancelErr) {
                            error('Pre-summary delay cancelled - user aborted');
                            throw new Error('ABORTED');
                        }

                        debug('Auto-generating scene summary for message', i);
                        toast(`Generating scene summary for message ${i}...`, 'info');
                        await delay(50); // Allow toast to display

                        // Set loading state in summary box (same as manual generation)
                        const $msgDiv = get_message_div(i);
                        const $summaryBox = $msgDiv.find('.scene-summary-box');
                        if ($summaryBox.length) {
                            $summaryBox.val("Generating scene summary...");
                        }

                        await generateSceneSummary(i, get_message_div, getContext, get_data, set_data, saveChatDebounced);

                        toast(`✓ Scene summary generated for message ${i}`, 'success');
                        await delay(50); // Allow toast to display
                    } catch (err) {
                        // Check if user aborted summary generation
                        const errorString = String(err?.message || err);
                        if (errorString.includes('Clicked stop button') || errorString.includes('aborted')) {
                            error('Scene summary generation aborted by user for message', i);
                            cancellationToken.cancelled = true; // Mark token as cancelled
                            throw new Error('ABORTED'); // Propagate abort to stop entire scan
                        }

                        error('Failed to auto-generate scene summary for message', i, ':', err);
                        toast(`Failed to generate scene summary for message ${i}: ${err?.message || String(err)}`, 'error');
                        await delay(50); // Allow toast to display
                    }
                }
            }

            // Add delay between API calls to avoid rate limiting (5 seconds)
            // Skip delay on last message
            // Use interruptible delay so user can abort mid-delay
            if (i < end) {
                try {
                    await interruptibleDelay(5000, cancellationToken);
                } catch (cancelErr) {
                    // Delay was interrupted - user aborted
                    error('Between-message delay cancelled - user aborted');
                    throw new Error('ABORTED');
                }
            }
        } catch (err) {
            error('!!!!! FATAL ERROR IN MAIN LOOP for message', i, '!!!!!', err);
            error('!!!!! Error message:', err?.message || String(err), '!!!!!');

            // Check if user aborted - if so, stop gracefully without error count
            const errorString = String(err?.message || err);
            if (errorString.includes('ABORTED') || errorString.includes('Clicked stop button') || errorString.includes('aborted')) {
                error('!!!!! USER ABORTED - STOPPING SCAN !!!!!');
                cancellationToken.cancelled = true; // Ensure token is marked as cancelled
                currentScanCancellationToken = null; // Clear the module-level token
                eventSource.off(event_types.GENERATION_STOPPED, stopHandler); // Clean up event listener
                toast(`⏹️ Scan aborted by user. Checked ${checkedCount}/${totalToCheck}, found ${detectedCount} scene breaks.`, 'info');
                await delay(100);
                return;
            }

            // Not an abort - this is a real error
            errorCount++;

            // Show error toast
            toast(`🛑 Error on message ${i} after all retries: ${err?.message || String(err)}. Checked ${checkedCount}/${totalToCheck}, found ${detectedCount} scene breaks.`, 'error');
            await delay(100); // Allow error toast to display

            // STOP on ANY error (after all retries exhausted)
            error('!!!!! STOPPING SCAN !!!!!');
            currentScanCancellationToken = null; // Clear the module-level token
            eventSource.off(event_types.GENERATION_STOPPED, stopHandler); // Clean up event listener
            return;
        }
    }

    // Show final summary
    debug('Completed: checked', checkedCount, '/', totalToCheck, 'messages, detected', detectedCount, 'scene breaks,', errorCount, 'errors');

    // Clear the cancellation token now that scan is complete
    currentScanCancellationToken = null;
    eventSource.off(event_types.GENERATION_STOPPED, stopHandler); // Clean up event listener

    if (errorCount > 0) {
        toast(`Scan complete: ${checkedCount}/${totalToCheck} messages checked, ${detectedCount} scene breaks found (${errorCount} errors)`, 'warning');
    } else if (detectedCount > 0) {
        toast(`Scan complete: Found ${detectedCount} scene break(s) in ${checkedCount} messages!`, 'success');
    } else {
        toast(`Scan complete: ${checkedCount} messages checked, no scene breaks detected`, 'info');
    }
    await delay(50); // Allow final toast to display
}

/**
 * Manually trigger scene break detection on all eligible messages
 */
export async function manualSceneBreakDetection() {
    debug('Manual scene break detection triggered');
    toast('Scanning messages for scene breaks...', 'info');

    const enabled = get_settings('auto_scene_break_enabled');
    if (!enabled) {
        toast('Auto scene break detection is disabled. Enable it in settings first.', 'warning');
        return;
    }

    // Process all messages
    await processAutoSceneBreakDetection();
}

/**
 * Process only new messages (called on MESSAGE_SENT, MESSAGE_RECEIVED events)
 * @param {number} messageIndex - Index of the new message
 */
export async function processNewMessageForSceneBreak(messageIndex) {
    const enabled = get_settings('auto_scene_break_on_new_message');
    if (!enabled) {
        debug(SUBSYSTEM.SCENE, 'Auto-check on new message is disabled');
        return;
    }

    const offset = Number(get_settings('auto_scene_break_message_offset')) || 0;

    // Calculate range based on offset
    // If offset = 1 and new message is at index 10, check messages 0 to 9
    // If offset = 0 and new message is at index 10, check messages 0 to 10
    const endIndex = messageIndex - offset;

    if (endIndex < 0) {
        debug(SUBSYSTEM.SCENE, 'No messages to check based on offset - messageIndex:', messageIndex, 'offset:', offset);
        return;
    }

    debug(SUBSYSTEM.SCENE, 'New message at index', messageIndex, ', checking up to', endIndex);

    // Only process the range that might include new unchecked messages
    // For efficiency, only check the last few messages
    const startIndex = Math.max(0, endIndex - 5); // Check last 5 messages max

    log(SUBSYSTEM.SCENE, 'Processing auto scene break detection for range', startIndex, 'to', endIndex);
    await processAutoSceneBreakDetection(startIndex, endIndex);
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
 * Clear all auto_scene_break_checked flags from all messages
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
};

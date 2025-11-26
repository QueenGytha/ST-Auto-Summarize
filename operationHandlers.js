
// operationHandlers.js - Register and handle all queue operations

import {
  registerOperationHandler,
  OperationType,
  enqueueOperation,
  getAbortSignal,
  throwIfAborted,
  pauseQueue,
  getPendingOperations,
  removeOperation,
  transferDependencies,
  updateOperationMetadata } from
'./operationQueue.js';
// Note: OPERATION_FETCH_TIMEOUT_MS no longer used after removing scene-name operation
import {
  validate_recap } from
'./recapValidation.js';
import {
  detectSceneBreak,
  validateSceneBreakResponse,
  messageMatchesType,
  validateRationaleNoFormatting,
  calculateAvailableContext,
  calculateSceneRecapTokensForRange } from
'./autoSceneBreakDetection.js';
import { generateSceneRecap, toggleSceneBreak, clearSceneBreak, renderSceneBreak, saveSceneRecap } from './sceneBreak.js';
import { prepareParseScenePrompt } from './prepareParseScenePrompt.js';
import {
  generate_running_scene_recap,
  combine_scene_with_running_recap } from
'./runningSceneRecap.js';
import {
  runLorebookEntryLookupStage,
  runLorebookEntryDeduplicateStage,
  buildCandidateEntriesData,
  ensureRegistryState,
  updateRegistryRecord,
  ensureStringArray,
  buildRegistryItemsForType,
  refreshRegistryStateFromEntries,
  runBulkRegistryPopulation,
  processBulkPopulateResults } from
'./recapToLorebookProcessor.js';
import {
  mergeLorebookEntryByUid,
  mergeLorebookEntry } from
'./lorebookEntryMerger.js';
import {
  getEntryData,
  getLorebookEntryLookupResult,
  getLorebookEntryDeduplicateResult,
  setLorebookEntryLookupResult,
  setLorebookEntryDeduplicateResult,
  markStageInProgress,
  completePendingEntry } from
'./lorebookPendingOps.js';
import {
  getAttachedLorebook,
  getLorebookEntries,
  addLorebookEntry,
  deleteLorebookEntry,
  updateRegistryEntryContent,
  reorderLorebookEntriesAlphabetically,
  getLorebookEntryTokenCount } from
'./lorebookManager.js';
import { getEntityTypeDefinitionsFromSettings } from './entityTypes.js';
import { extension_settings } from '../../../extensions.js';
import {
  getContext,
  get_data,
  set_data,
  saveChatDebounced,
  get_settings,
  debug,
  error,
  log,
  toast,
  SUBSYSTEM,
  selectorsExtension,
  resolveOperationConfig,
  buildLorebookOperationsSettings,
  MODULE_NAME } from
'./index.js';
import { saveMetadata } from '../../../../script.js';
import { queueCombineSceneWithRunning } from './queueIntegration.js';
import { DEFAULT_COMPACTION_THRESHOLD } from './constants.js';

const DEFAULT_MINIMUM_SCENE_LENGTH = 4;

function get_message_div(index) {
  return $(`div[mesid="${index}"]`);
}

// Helper: Get scene range from Stage 1 metadata
function getSceneRangeFromMetadata(index) {
  const ctx = getContext();
  const message = ctx.chat[index];
  const stage1Metadata = get_data(message, 'stage1_lorebook_metadata') || {};
  return {
    startIdx: stage1Metadata.startIdx,
    endIdx: stage1Metadata.endIdx
  };
}

// Helper: Check if lorebook lookup can be skipped (empty lorebook optimization)
function checkCanSkipLorebookLookup(operation, entryData) {
  if (operation.metadata?.lorebook_was_empty_at_scene_start !== true) {
    return { canSkip: false };
  }

  debug(SUBSYSTEM.QUEUE, `[SKIP] Skipping LLM lookup for "${entryData.comment}" (lorebook empty at message ${operation.metadata?.message_index}, version ${operation.metadata?.version_index})`);

  return { canSkip: true };
}

// Helper: Execute skip path for lorebook lookup (when lorebook is empty)
async function executeSkipPath(operation, entryId, entryData) {
  // Build synthetic result with empty UIDs (matches structure of real LLM result)
  const syntheticResult = {
    type: entryData.type || 'unknown',
    synopsis: entryData.synopsis || '',
    sameEntityUids: [],
    needsFullContextUids: []
  };

  // Store synthetic result and mark stage complete
  setLorebookEntryLookupResult(entryId, syntheticResult);
  markStageInProgress(entryId, 'lorebook_entry_lookup_complete');

  debug(SUBSYSTEM.QUEUE, `✓ Lorebook Entry Lookup SKIPPED for ${entryId}: type=${syntheticResult.type}, sameUids=[], needsUids=[]`);

  // Enqueue CREATE operation directly (no match possible in empty lorebook)
  const nextOpId = await enqueueOperation(
    OperationType.CREATE_LOREBOOK_ENTRY,
    { entryId, action: 'create' },
    {
      priority: 14,
      queueVersion: operation.queueVersion,
      metadata: {
        entry_comment: entryData.comment,
        message_index: operation.metadata?.message_index,
        version_index: operation.metadata?.version_index,
        hasPrefill: false,
        includePresetPrompts: false,
        skipped_llm_lookup: true,
        skip_reason: 'lorebook_empty_at_scene_start'
      }
    }
  );
  await transferDependencies(operation.id, nextOpId);

  return { success: true, lorebookEntryLookupResult: syntheticResult, skipped: true };
}

// Helper: Update scene break message with current lorebook snapshot
async function updateSceneLorebookSnapshot(messageIndex) {
  try {
    const ctx = getContext();
    const chat = ctx.chat;
    const message = chat[messageIndex];

    if (!message) {
      return;
    }

    // Only update if this is actually a scene break message
    const isSceneBreak = get_data(message, 'scene_break');
    if (!isSceneBreak) {
      return;
    }

    // Get the current version index
    const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
    const metadata = get_data(message, 'scene_recap_metadata') || {};

    if (!metadata[currentVersionIndex]) {
      debug(SUBSYSTEM.QUEUE, `No metadata found for version ${currentVersionIndex} at message ${messageIndex}`);
      return;
    }

    // Get chatLorebookName from existing metadata (don't re-query, it might have changed)
    const chatLorebookName = metadata[currentVersionIndex].chatLorebookName;

    if (!chatLorebookName) {
      debug(SUBSYSTEM.QUEUE, `No lorebook name in metadata for scene ${messageIndex}`);
      return;
    }

    // Load ALL entries from the lorebook (excluding only operation queue)
    const { loadWorldInfo } = await import('../../../world-info.js');
    const worldData = await loadWorldInfo(chatLorebookName);

    if (!worldData?.entries) {
      debug(SUBSYSTEM.QUEUE, `No entries in lorebook for scene ${messageIndex}`);
      return;
    }

    // Ensure metadata exists for this version (defensive)
    if (!metadata[currentVersionIndex]) {
      metadata[currentVersionIndex] = {
        timestamp: Date.now(),
        allEntries: [],
        entries: [],
        created_entry_uids: []
      };
    }

    // Get ALL entries (including registries), excluding only operation queue
    const allLorebookEntries = Object.values(worldData.entries)
      .filter(entry => entry && entry.comment !== '__operation_queue')
      .map(entry => ({
        comment: entry.comment || '(unnamed)',
        uid: entry.uid,
        world: chatLorebookName,
        key: Array.isArray(entry.key) ? [...entry.key] : [],
        keysecondary: [],
        content: entry.content || '',
        position: entry.position,
        depth: entry.depth,
        order: entry.order,
        role: entry.role,
        constant: entry.constant || false,
        vectorized: entry.vectorized || false,
        selective: entry.selective,
        selectiveLogic: entry.selectiveLogic,
        sticky: entry.sticky,
        disable: entry.disable || false,
        addMemo: entry.addMemo || false,
        excludeRecursion: entry.excludeRecursion || false,
        preventRecursion: entry.preventRecursion || false,
        ignoreBudget: entry.ignoreBudget || false,
        probability: entry.probability,
        useProbability: entry.useProbability,
        group: entry.group,
        groupOverride: entry.groupOverride,
        groupWeight: entry.groupWeight,
        tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
        strategy: entry.constant ? 'constant' : (entry.vectorized ? 'vectorized' : 'normal')
      }));

    // Get ACTIVE entries by re-running lorebook activation check
    const { getActiveLorebooksAtPosition } = await import('./sceneBreak.js');
    const lorebookResult = await getActiveLorebooksAtPosition(messageIndex, ctx, get_data, false);

    const activeEntries = lorebookResult?.entries || [];

    // Update the versioned metadata with the NEW snapshot (AFTER state)
    metadata[currentVersionIndex].allEntries = allLorebookEntries;
    metadata[currentVersionIndex].entries = activeEntries;
    metadata[currentVersionIndex].totalActivatedEntries = activeEntries.length;

    set_data(message, 'scene_recap_metadata', metadata);

    debug(SUBSYSTEM.QUEUE,
      `Updated lorebook snapshot for scene ${messageIndex} version ${currentVersionIndex}: ` +
      `${activeEntries.length} active, ${allLorebookEntries.length} total`
    );

    saveChatDebounced();
  } catch (err) {
    error(SUBSYSTEM.QUEUE, `Failed to update lorebook snapshot for scene ${messageIndex}:`, err);
  }
}

// Helper: Mark range of messages as scene-break-checked
function markRangeAsChecked(chat, startIdx, endIdx) {
  for (let i = startIdx; i <= endIdx; i++) {
    const msg = chat[i];
    if (msg) {
      set_data(msg, 'auto_scene_break_checked', true);
    }
  }
}

/**
 * Find the index of the scene break before the given index
 * @param {Array} chat - Chat messages
 * @param {number} beforeIndex - Search backwards from this index (exclusive)
 * @returns {number} Index of previous scene break, or 0 if none found
 */
// eslint-disable-next-line no-unused-vars -- Reserved for future use
function findPreviousSceneBreak(chat, beforeIndex) {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    if (get_data(chat[i], 'scene_break')) {
      return i;
    }
  }
  return 0;
}

// Helper: Count filtered messages in a range
function countRemainingFilteredMessages(chat, startIndex, endIndex, checkWhich) {
  let count = 0;
  for (let i = startIndex; i <= endIndex; i++) {
    const msg = chat[i];
    if (msg && messageMatchesType(msg, checkWhich)) {
      count++;
    }
  }
  return count;
}

// Helper: Handle formatting rationale rejection
async function handleFormattingRationaleRejection({ operation, startIndex, endIndex, offset, rationale }) {
  error(SUBSYSTEM.QUEUE, `Scene break rationale rejected (formatting referenced) for range ${startIndex}-${endIndex}`);
  error(SUBSYSTEM.QUEUE, `  Rationale: ${rationale}`);
  toast('⚠ Scene break rejected: rationale cited formatting (ignore decorative separators). Retrying...', 'warning');

  const alreadyRetried = operation.metadata?.triggered_by === 'formatting_rationale_retry';
  if (!alreadyRetried) {
    await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK,
      { startIndex, endIndex, offset },
      {
        priority: 5,
        queueVersion: operation.queueVersion,
        metadata: { triggered_by: 'formatting_rationale_retry' }
      }
    );
    debug(SUBSYSTEM.QUEUE, `Re-queued DETECT_SCENE_BREAK after formatting rationale rejection for ${startIndex}-${endIndex}`);
  } else {
    debug(SUBSYSTEM.QUEUE, `Formatting rationale rejection already retried once for ${startIndex}-${endIndex}; skipping requeue`);
  }

  return { sceneBreakAt: false, rationale: 'Rejected: rationale referenced formatting; retried without marking as checked' };
}

// Helper: Handle below minimum scene length rejection
async function handleBelowMinimumRejection({ operation, startIndex, originalEndIndex, offset, sceneBreakAt, filteredIndices, minimumSceneLength, validation, chat }) {
  const earliestAllowedBreak = Array.isArray(filteredIndices) && filteredIndices.length > minimumSceneLength
    ? filteredIndices[minimumSceneLength]
    : null;

  if (typeof earliestAllowedBreak === 'number' && !Number.isNaN(earliestAllowedBreak)) {
    debug(
      SUBSYSTEM.QUEUE,
      `Scene break at ${sceneBreakAt} rejected (below minimum). Marking ${startIndex}-${earliestAllowedBreak - 1} as checked and retrying ${earliestAllowedBreak}-${originalEndIndex}`
    );

    if (earliestAllowedBreak > startIndex) {
      markRangeAsChecked(chat, startIndex, earliestAllowedBreak - 1);
      saveChatDebounced();
    }

    await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK,
      { startIndex: earliestAllowedBreak, endIndex: originalEndIndex, offset },
      {
        priority: 5,
        queueVersion: operation.queueVersion,
        metadata: {
          triggered_by: 'below_minimum_retry',
          earliest_allowed_break: earliestAllowedBreak,
          start_index: earliestAllowedBreak,
          end_index: originalEndIndex
        }
      }
    );

    toast(`⚠ Early scene-break candidate rejected; retrying from ${earliestAllowedBreak}`, 'info');
    return { sceneBreakAt: false, rationale: `Rejected: ${validation.reason}; retrying from ${earliestAllowedBreak}` };
  }

  debug(SUBSYSTEM.QUEUE, `Scene break at ${sceneBreakAt} rejected (too close) - treating range ${startIndex}-${originalEndIndex} as complete`);
  markRangeAsChecked(chat, startIndex, originalEndIndex);
  saveChatDebounced();
  return { sceneBreakAt: false, rationale: `Rejected: ${validation.reason}` };
}

// Helper: Handle continuity veto check
async function handleContinuityVeto({ operation, chat, sceneBreakAt, rationale, startIndex, originalEndIndex, offset, minimumSceneLength }) {
  try {
    const { shouldVetoByContinuityAndObjective } = await import('./autoSceneBreakDetection.js');
    const veto = shouldVetoByContinuityAndObjective(chat, sceneBreakAt, rationale, 2);
    if (veto) {
      debug(SUBSYSTEM.QUEUE, `Scene break at ${sceneBreakAt} vetoed by continuity/objective rule for range ${startIndex}-${originalEndIndex}`);
      toast('⚠ Scene break rejected: continuity with no time/location/cast transition', 'info');

      markRangeAsChecked(chat, startIndex, sceneBreakAt);
      saveChatDebounced();

      const remainingStart = sceneBreakAt + 1;
      const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
      const remainingFiltered = countRemainingFilteredMessages(chat, remainingStart, originalEndIndex, checkWhich);

      if (remainingFiltered >= minimumSceneLength + 1) {
        await enqueueOperation(
          OperationType.DETECT_SCENE_BREAK,
          { startIndex: remainingStart, endIndex: originalEndIndex, offset },
          {
            priority: 5,
            queueVersion: operation.queueVersion,
            metadata: {
              triggered_by: 'continuity_veto_retry',
              start_index: remainingStart,
              end_index: originalEndIndex
            }
          }
        );
      } else {
        debug(SUBSYSTEM.QUEUE, `Not enough remaining messages (${remainingFiltered} < ${minimumSceneLength + 1}) after veto; not queuing`);
      }

      return { vetoed: true, result: { sceneBreakAt: false, rationale: 'Rejected by continuity/objective rule' } };
    }
  } catch (e) {
    error(SUBSYSTEM.QUEUE, 'Continuity/objective veto check failed:', e?.message || String(e));
  }
  return { vetoed: false };
}

function buildMergeErrorDiagnostics(resolvedUid, record, existingEntry, registryState, existingEntriesRaw) {
  const registryKeys = Object.keys(registryState.index || {}).join(', ');
  const lorebookUids = existingEntriesRaw?.map((e) => e.uid).join(', ') || 'none';
  const hasRecord = !!record;
  const hasEntry = !!existingEntry;

  const diagnostics = [
    `Registry has record: ${hasRecord}`,
    `Lorebook has entry: ${hasEntry}`,
    `Registry keys: [${registryKeys}]`,
    `Lorebook uids: [${lorebookUids}]`,
    hasRecord && !hasEntry ? `DESYNC: Registry claims uid ${resolvedUid} exists but lorebook entry is missing` : '',
    !hasRecord && hasEntry ? `DESYNC: Lorebook has entry but registry record is missing` : '',
    !hasRecord && !hasEntry ? `CRITICAL: Neither registry nor lorebook have uid ${resolvedUid}` : ''
  ].filter(Boolean).join('. ');

  return { diagnostics, registryKeys, lorebookUids };
}

// Resolve compacted content for merges without inflating handler complexity
async function resolveCompactedContent(operation, existingContent) {
  const compactedContentFromMetadata = operation.metadata?.compactedContent;
  const shouldUseCompaction = operation.params.useCompactedContent || operation.metadata?.was_compacted;

  if (!shouldUseCompaction) {
    return { content: existingContent };
  }

  if (compactedContentFromMetadata) {
    return { content: compactedContentFromMetadata };
  }

  const dependencies = operation.dependencies || [];
  if (dependencies.length > 0) {
    const { getOperation, OperationStatus } = await import('./operationQueue.js');
    for (const compactOpId of dependencies) {
      const compactOp = getOperation(compactOpId);
      if (compactOp?.status === OperationStatus.COMPLETED && compactOp.result?.compactedContent) {
        return { content: compactOp.result.compactedContent };
      }
    }
  }

  return { content: existingContent ?? null };
}

// eslint-disable-next-line max-lines-per-function -- Sequential operation handler registration for 10+ operation types (431 lines is acceptable for initialization)
export function registerAllOperationHandlers() {
  // Validate recap
  registerOperationHandler(OperationType.VALIDATE_RECAP, async (operation) => {
    const { recap, type } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing VALIDATE_RECAP for type ${type}`);

    const result = await validate_recap(recap, type);

    // Check if cancelled after validation (before potential side effects)
    throwIfAborted(signal, 'VALIDATE_RECAP', 'validation');

    // Store token breakdown in operation metadata
    if (result?.tokenBreakdown) {
      const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
      const tokenMetadata = formatTokenBreakdownForMetadata(result.tokenBreakdown, {
        max_context: result.tokenBreakdown.max_context,
        max_tokens: result.tokenBreakdown.max_tokens
      });
      await updateOperationMetadata(operation.id, tokenMetadata);
    }

    return { isValid: result?.valid ?? result };
  });

  // Detect scene break (range-based)
  // eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Retry logic and range reduction handling adds complexity, acceptable increase
  registerOperationHandler(OperationType.DETECT_SCENE_BREAK, async (operation) => {
    const { startIndex, offset = 0 } = operation.params;
    let { endIndex, forceSelection = false } = operation.params;
    const signal = getAbortSignal(operation);
    const ctx = getContext();
    const chat = ctx.chat;

    debug(SUBSYSTEM.QUEUE, `Executing DETECT_SCENE_BREAK for range ${startIndex} to ${endIndex} (offset: ${offset}, forceSelection: ${forceSelection})`);

    // Store original endIndex - this may be reduced during processing, but we need the original for continuation
    const originalEndIndex = operation.metadata?.end_index ?? endIndex;

    // Declare variables outside loop for access after loop completes
    let sceneBreakAt;
    let rationale;
    let tokenBreakdown;
    let filteredIndices;
    let maxEligibleIndex;
    let rangeWasReduced;
    let currentEndIndex;
    let result;
    const minimumSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;

    // Retry loop: When forceSelection=true and AI incorrectly returns false, retry indefinitely
    // Note: Range reduction now automatically upgrades to FORCED prompt before the first LLM call
    let retryCount = 0;
    while (true) {
      if (retryCount > 0) {
        debug(SUBSYSTEM.QUEUE, `[FORCED RETRY #${retryCount}] Retrying scene break detection for range ${startIndex}-${endIndex}`);
        toast(`⟳ Forced scene break retry #${retryCount}...`, 'info');
      }

      // eslint-disable-next-line no-await-in-loop -- Intentional retry loop for forced scene break detection
      result = await detectSceneBreak(startIndex, endIndex, offset, forceSelection, operation.id, false, null);

      // Check if cancelled after detection (before side effects)
      throwIfAborted(signal, 'DETECT_SCENE_BREAK', 'LLM call');

      ({ sceneBreakAt, rationale, tokenBreakdown, filteredIndices, maxEligibleIndex, rangeWasReduced, currentEndIndex } = result);

      // If range was reduced, update operation params AND metadata to reflect the new state
      // Note: forceSelection was already upgraded to true in reduceMessagesUntilTokenFit before the LLM call
      if (rangeWasReduced) {
        const previousEndIndex = operation.params.endIndex;
        operation.params.endIndex = currentEndIndex;
        endIndex = currentEndIndex; // Update local variable for validation

        // Update metadata for UI display
        operation.metadata = operation.metadata || {};
        operation.metadata.range_reduced = true;
        // Only set original_end_index once (preserve the truly original value)
        if (!operation.metadata.original_end_index) {
          operation.metadata.original_end_index = previousEndIndex;
        }
        // Always update current_end_index to show latest reduction
        operation.metadata.current_end_index = currentEndIndex;

        // Update forceSelection in params to match what was used in the LLM call
        if (result.forceSelectionWasUpgraded) {
          operation.params.forceSelection = true;
          forceSelection = true; // Update local variable for retry logic
          debug(SUBSYSTEM.QUEUE, `Range reduced from ${startIndex}-${previousEndIndex} to ${startIndex}-${currentEndIndex}, FORCED prompt was used`);
        } else {
          debug(SUBSYSTEM.QUEUE, `Range reduced from ${startIndex}-${previousEndIndex} to ${startIndex}-${currentEndIndex} (forceSelection already true)`);
        }
      }

      // Store token breakdown in operation metadata
      if (tokenBreakdown) {
        // eslint-disable-next-line no-await-in-loop -- Intentional: capturing metadata after successful LLM call in retry loop
        const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
        const tokenMetadata = formatTokenBreakdownForMetadata(tokenBreakdown, {
          max_context: tokenBreakdown.max_context,
          max_tokens: tokenBreakdown.max_tokens
        });
        // eslint-disable-next-line no-await-in-loop -- Intentional: updating operation metadata after successful LLM call in retry loop
        await updateOperationMetadata(operation.id, tokenMetadata);
      }

      // Enforce content-only rationale (no formatting references like '---')
      const rationaleCheck = validateRationaleNoFormatting(rationale);
      if (!rationaleCheck.valid) {
        // eslint-disable-next-line no-await-in-loop -- Intentional retry loop for forced scene break detection
        return await handleFormattingRationaleRejection({ operation, startIndex, endIndex, offset, rationale });
      }

      // Validate the response (including offset check via maxEligibleIndex)
      const validation = validateSceneBreakResponse(sceneBreakAt, {
        startIndex,
        endIndex,
        filteredIndices,
        minimumSceneLength,
        maxEligibleIndex
      });

      if (!validation.valid) {
        const isBelowMinimum = validation.reason.includes('below minimum scene length');

        if (isBelowMinimum) {
          // eslint-disable-next-line no-await-in-loop -- Intentional retry loop for forced scene break detection
          return await handleBelowMinimumRejection({ operation, startIndex, originalEndIndex, offset, sceneBreakAt, filteredIndices, minimumSceneLength, validation, chat });
        }

        // Other validation errors (out of range, not in filtered set, etc.) - retry indefinitely
        retryCount++;
        error(SUBSYSTEM.QUEUE, `Invalid scene break response for range ${startIndex}-${endIndex}: ${validation.reason}`);
        error(SUBSYSTEM.QUEUE, `  sceneBreakAt: ${sceneBreakAt}, rationale: ${rationale}`);
        toast(`⚠ Invalid scene break response - retrying (attempt #${retryCount})`, 'warning');
        continue; // Retry the detection
      }

      if (sceneBreakAt === false) {
        // Check if this is a forced selection that returned false (retry indefinitely)
        // Note: rangeWasReduced now implies forceSelection=true was already used in the LLM call
        if (forceSelection) {
          retryCount++;
          debug(SUBSYSTEM.QUEUE, `[FORCED] AI returned false despite MANDATORY instruction - retrying (attempt #${retryCount})`);
          continue; // Retry the detection
        }

        // No scene break found - mark entire range as checked
        debug(SUBSYSTEM.QUEUE, `✗ No scene break found in range ${startIndex} to ${endIndex}`);
        markRangeAsChecked(chat, startIndex, endIndex);
        saveChatDebounced();

        // Check if there are remaining unchecked messages that exceed token threshold
        // (Only continue if range is too large - prevents infinite loop at end of chat)
        if (endIndex < originalEndIndex) {
          const remainingStart = endIndex + 1;
          const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
          const remainingFiltered = countRemainingFilteredMessages(chat, remainingStart, originalEndIndex, checkWhich);

          if (remainingFiltered >= minimumSceneLength + 1) {
            // Calculate tokens for remaining range
            // eslint-disable-next-line no-await-in-loop -- Continuation logic runs before return, no actual iteration
            const config = await resolveOperationConfig('auto_scene_break');
            const preset = config.completion_preset_name || '';
            const connectionProfile = config.connection_profile;
            // eslint-disable-next-line no-await-in-loop -- Continuation logic runs before return, no actual iteration
            const { resolveProfileId } = await import('./profileResolution.js');
            const effectiveProfile = resolveProfileId(connectionProfile);
            // eslint-disable-next-line no-await-in-loop -- Continuation logic runs before return, no actual iteration
            const maxAllowedTokens = await calculateAvailableContext(preset, effectiveProfile);
            // eslint-disable-next-line no-await-in-loop -- Continuation logic runs before return, no actual iteration
            const sceneRecapTokens = await calculateSceneRecapTokensForRange(remainingStart, originalEndIndex, chat, ctx);

            // Only continue if tokens EXCEED limit (range too large, needs breaking)
            if (maxAllowedTokens !== null && sceneRecapTokens > maxAllowedTokens) {
              debug(SUBSYSTEM.QUEUE, `Continuing detection - remaining range tokens (${sceneRecapTokens}) exceed limit (${maxAllowedTokens})`);
              // eslint-disable-next-line no-await-in-loop -- Continuation logic runs before return, no actual iteration
              await enqueueOperation(
                OperationType.DETECT_SCENE_BREAK,
                { startIndex: remainingStart, endIndex: originalEndIndex, offset },
                {
                  priority: 5,
                  queueVersion: operation.queueVersion,
                  metadata: {
                    triggered_by: 'no_break_found_continuation',
                    start_index: remainingStart,
                    end_index: originalEndIndex
                  }
                }
              );
            } else {
              debug(SUBSYSTEM.QUEUE, `Stopping detection - remaining range tokens (${sceneRecapTokens}) fit within limit (${maxAllowedTokens})`);
            }
          } else {
            debug(SUBSYSTEM.QUEUE, `Not enough remaining messages (${remainingFiltered} < ${minimumSceneLength + 1}) - not queuing new detection`);
          }
        }

        return result;
      }

      // Valid scene break found - break out of retry loop
      break;
    }

    // Continuity veto + objective-only rule
    // BUT: Skip veto when range was reduced or selection was forced due to token limits
    // (We told LLM "pick the best available even if imperfect" - so we must accept it)
    // Note: rangeWasReduced is already set from result destructuring above
    const skipVeto = forceSelection || rangeWasReduced;

    if (!skipVeto) {
      const vetoResult = await handleContinuityVeto({ operation, chat, sceneBreakAt, rationale, startIndex, originalEndIndex, offset, minimumSceneLength });
      if (vetoResult.vetoed) {
        return vetoResult.result;
      }
    } else {
      debug(SUBSYSTEM.QUEUE, `Skipping continuity veto for message ${sceneBreakAt} (forceSelection=${forceSelection}, rangeWasReduced=${rangeWasReduced})`);
    }

    // Valid scene break detected at sceneBreakAt
    debug(SUBSYSTEM.QUEUE, `✓ Scene break detected at message ${sceneBreakAt}`);
    const rationaleText = rationale ? ` - ${rationale}` : '';
    toast(`✓ Scene break at message ${sceneBreakAt}${rationaleText}`, 'success');

    // Place the scene break marker
    toggleSceneBreak(sceneBreakAt, get_message_div, getContext, set_data, get_data, saveChatDebounced);

    // Mark messages from startIndex to sceneBreakAt (inclusive) as checked
    markRangeAsChecked(chat, startIndex, sceneBreakAt);
    saveChatDebounced();

    // Queue backwards chain to find earlier breaks in the range before this one
    const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
    const backwardsOp = await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK_BACKWARDS,
      { startIndex: startIndex, endIndex: sceneBreakAt - 1 },
      {
        priority: 15, // HIGH - runs before forward continuation
        queueVersion: operation.queueVersion,
        metadata: {
          next_break_index: sceneBreakAt,
          original_next_break_index: sceneBreakAt,  // Preserve original break that triggered backwards
          discovered_breaks: [],
          check_which: checkWhich,
          forward_continuation: {
            start_index: sceneBreakAt + 1,
            end_index: originalEndIndex,
            original_operation_id: operation.id
          }
        }
      }
    );

    // Fallback: if backwards operation fails to queue, queue forward continuation directly
    if (!backwardsOp) {
      debug(SUBSYSTEM.OPERATIONS, 'Failed to queue backwards operation, queueing forward continuation directly');
      if (sceneBreakAt < originalEndIndex) {
        const remainingStart = sceneBreakAt + 1;
        const remainingFiltered = countRemainingFilteredMessages(chat, remainingStart, originalEndIndex, checkWhich);

        if (remainingFiltered >= minimumSceneLength + 1) {
          debug(SUBSYSTEM.QUEUE, `Enqueueing DETECT_SCENE_BREAK for remaining range ${remainingStart} to ${originalEndIndex}`);
          await enqueueOperation(
            OperationType.DETECT_SCENE_BREAK,
            { startIndex: remainingStart, endIndex: originalEndIndex, offset },
            {
              priority: 5,
              queueVersion: operation.queueVersion,
              metadata: {
                triggered_by: 'backwards_chain_fallback',
                start_index: remainingStart,
                end_index: originalEndIndex
              }
            }
          );
        }
      }
    }

    // Auto-generate scene recap if enabled
    // NOTE: If backwards operation was queued, DON'T queue recap here - terminateBackwardsChain will handle it
    if (get_settings('auto_scene_break_generate_recap') && !backwardsOp) {
      debug(SUBSYSTEM.QUEUE, `Enqueueing GENERATE_SCENE_RECAP for message ${sceneBreakAt} (no backwards chain)`);
      await enqueueOperation(
        OperationType.GENERATE_SCENE_RECAP,
        { index: sceneBreakAt },
        {
          // Run after lorebook pipeline/combine (priorities 10–14)
          priority: 9,
          queueVersion: operation.queueVersion,
          metadata: {
            scene_index: sceneBreakAt,
            triggered_by: 'auto_scene_break_detection'
          }
        }
      );
    } else if (backwardsOp) {
      debug(SUBSYSTEM.QUEUE, `Recap for message ${sceneBreakAt} will be queued by backwards chain`);
    }

    return result;
  });

  /**
   * Handle backwards scene break detection operation
   * Recursively searches backwards from next_break_index to find earlier breaks
   */
  registerOperationHandler(OperationType.DETECT_SCENE_BREAK_BACKWARDS, async (operation) => {
    const ctx = getContext();
    const chat = ctx.chat;
    const signal = getAbortSignal(operation);

    // Extract from PARAMS (execution data)
    const { startIndex, endIndex } = operation.params;

    // Extract from METADATA (tracking/state data)
    const {
      next_break_index: nextBreakIndex,
      original_next_break_index: originalNextBreakIndex,
      discovered_breaks: discoveredBreaks = [],
      check_which: checkWhich = 'both',
      forward_continuation: forwardContinuation
    } = operation.metadata;

    // Validate required parameters
    if (nextBreakIndex === undefined || nextBreakIndex === null) {
      throw new Error('next_break_index is required for backwards detection');
    }

    debug(SUBSYSTEM.OPERATIONS, `Backwards detection: [${startIndex}, ${endIndex}], next break: ${nextBreakIndex}`);

    // Un-mark checked state to allow re-evaluation
    for (let i = startIndex; i < nextBreakIndex; i++) {
      set_data(chat[i], 'auto_scene_break_checked', false);
    }

    // Attempt backwards detection
    let result;
    try {
      result = await detectSceneBreak(
        startIndex,
        endIndex,
        0, // offset = 0 for backwards
        false, // forceSelection
        operation.id, // operationId
        true, // isBackwards = true
        nextBreakIndex // nextBreakIndex
      );

      // Check if cancelled after detection
      throwIfAborted(signal, 'DETECT_SCENE_BREAK_BACKWARDS', 'LLM call');
    } catch (err) {
      debug(SUBSYSTEM.OPERATIONS, `Error in backwards detection: ${err.message}`);
      await terminateBackwardsChain(operation);
      return;
    }

    const { sceneBreakAt, rationale } = result;

    // Case 1: No break found - terminate backwards chain
    if (sceneBreakAt === false) {
      debug(SUBSYSTEM.OPERATIONS, `No break found in backwards range [${startIndex}, ${endIndex}]`);
      debug(SUBSYSTEM.OPERATIONS, `Rationale: ${rationale}`);

      markRangeAsChecked(chat, startIndex, endIndex);
      saveChatDebounced();

      await terminateBackwardsChain(operation);
      return;
    }

    // Case 2: Break found - place marker and continue recursion
    debug(SUBSYSTEM.OPERATIONS, `Found backwards break at ${sceneBreakAt}`);

    // Place break marker - 6 dependency injection parameters
    toggleSceneBreak(sceneBreakAt, get_message_div, getContext, set_data, get_data, saveChatDebounced);

    // Mark intermediate range as checked (between break and next break)
    if (sceneBreakAt + 1 < nextBreakIndex) {
      markRangeAsChecked(chat, sceneBreakAt + 1, nextBreakIndex - 1);
    }
    saveChatDebounced();

    // Add to discovered breaks
    const updatedDiscoveredBreaks = [...discoveredBreaks, sceneBreakAt];
    debug(SUBSYSTEM.OPERATIONS, `Discovered breaks so far: ${JSON.stringify(updatedDiscoveredBreaks)}`);

    // Validate that range shrinks
    const newEndIndex = sceneBreakAt - 1;
    if (newEndIndex >= endIndex) {
      debug(SUBSYSTEM.OPERATIONS, 'Range did not shrink, terminating backwards chain');
      await terminateBackwardsChain({
        ...operation,
        metadata: {
          ...operation.metadata,
          discovered_breaks: updatedDiscoveredBreaks
        }
      });
      return;
    }

    // Check if enough messages remain for another backwards recursion
    const minSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;
    const remainingRange = newEndIndex - startIndex + 1;
    if (remainingRange < minSceneLength * 2) {
      debug(SUBSYSTEM.OPERATIONS, 'Insufficient messages for further backwards detection');

      markRangeAsChecked(chat, startIndex, newEndIndex);
      saveChatDebounced();

      await terminateBackwardsChain({
        ...operation,
        metadata: {
          ...operation.metadata,
          discovered_breaks: updatedDiscoveredBreaks
        }
      });
      return;
    }

    // Queue next backwards recursion
    const nextBackwardsOp = await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK_BACKWARDS,  // type
      { startIndex: startIndex, endIndex: newEndIndex },  // params
      {
        priority: 15,  // HIGH
        queueVersion: operation.queueVersion,
        metadata: {
          next_break_index: sceneBreakAt,
          original_next_break_index: originalNextBreakIndex,  // Pass through original
          discovered_breaks: updatedDiscoveredBreaks,
          check_which: checkWhich,
          forward_continuation: forwardContinuation
        }
      }
    );

    if (!nextBackwardsOp) {
      debug(SUBSYSTEM.OPERATIONS, 'Failed to queue next backwards operation, terminating chain');
      await terminateBackwardsChain({
        ...operation,
        metadata: {
          ...operation.metadata,
          discovered_breaks: updatedDiscoveredBreaks
        }
      });
      return;
    }

    debug(SUBSYSTEM.OPERATIONS, `Queued next backwards operation: ${nextBackwardsOp.id}`);
  });

  /**
   * Terminate backwards chain and queue all recaps + forward continuation
   */
  async function terminateBackwardsChain(operation) {
    const {
      discovered_breaks: discoveredBreaks = [],
      forward_continuation: forwardContinuation,
      original_next_break_index: originalNextBreakIndex
    } = operation.metadata;

    debug(SUBSYSTEM.OPERATIONS, `Terminating backwards chain. Discovered breaks: ${discoveredBreaks.join(', ')}`);
    debug(SUBSYSTEM.OPERATIONS, `Original next break index (forward-detected): ${originalNextBreakIndex}`);

    // Sort breaks in chronological order (ascending)
    const chronologicalBreaks = [...discoveredBreaks].sort((a, b) => a - b);

    // Add the original forward-detected break to the end
    const allBreaks = [...chronologicalBreaks, originalNextBreakIndex];

    debug(SUBSYSTEM.OPERATIONS, `Queueing ${allBreaks.length} recaps in chronological order: ${allBreaks.join(', ')}`);

    // Queue ONLY THE FIRST recap - each COMBINE operation will queue the next
    const generateRecaps = get_settings('auto_scene_break_generate_recap');

    if (generateRecaps && allBreaks.length > 0) {
      const firstBreak = allBreaks[0];
      const remainingBreaks = allBreaks.slice(1);

      const firstRecapOp = await enqueueOperation(
        OperationType.GENERATE_SCENE_RECAP,
        { index: firstBreak },
        {
          // Run after lorebook pipeline/combine (priorities 10–14)
          priority: 9,
          queueVersion: operation.queueVersion,
          metadata: {
            triggered_by: 'backwards_detection',
            backwards_chain: true,
            backwards_chain_remaining: remainingBreaks,
            backwards_chain_forward_continuation: forwardContinuation
          }
        }
      );

      if (firstRecapOp) {
        debug(SUBSYSTEM.OPERATIONS, `✓ Queued first recap for break ${firstBreak}, remaining: ${remainingBreaks.join(', ')}`);
      } else {
        debug(SUBSYSTEM.OPERATIONS, `Failed to queue first recap for break ${firstBreak}`);
      }
    }

    // Forward continuation will be queued by the LAST COMBINE operation in the chain
    // If no recaps are being generated, queue forward continuation now
    if (!generateRecaps && forwardContinuation) {
      const forwardOp = await enqueueOperation(
        OperationType.DETECT_SCENE_BREAK,  // type
        {
          startIndex: forwardContinuation.start_index,
          endIndex: forwardContinuation.end_index,
          offset: get_settings('auto_scene_break_message_offset') || 2
        },  // params
        {
          priority: 5,  // NORMAL
          queueVersion: operation.queueVersion,
          metadata: {
            triggered_by: 'backwards_chain_completion_no_recaps',
            original_operation_id: forwardContinuation.original_operation_id
          }
        }
      );

      if (forwardOp) {
        debug(SUBSYSTEM.OPERATIONS, `✓ Queued forward continuation (no recaps): ${forwardOp.id}`);
      } else {
        debug(SUBSYSTEM.OPERATIONS, 'Failed to queue forward continuation');
      }
    } else if (generateRecaps) {
      debug(SUBSYSTEM.OPERATIONS, 'Forward continuation will be queued by last COMBINE operation');
    }

    debug(SUBSYSTEM.OPERATIONS, 'Backwards chain terminated successfully');
  }

  // Generate scene recap (Stage 1: extraction only)
  registerOperationHandler(OperationType.GENERATE_SCENE_RECAP, async (operation) => {
    const { index } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing GENERATE_SCENE_RECAP for index ${index}`);
    toast(`Generating scene recap for message ${index}...`, 'info');

    try {
      // Set loading state in recap box
      const $msgDiv = get_message_div(index);
      const $recapBox = $msgDiv.find(selectorsExtension.sceneBreak.recapBox);
      if ($recapBox.length) {
        $recapBox.val("Generating scene recap...");
      }

      const result = await generateSceneRecap({
        index,
        get_message_div,
        getContext,
        get_data,
        set_data,
        saveChatDebounced,
        skipQueue: true, // skipQueue = true when called from queue handler
        signal, // Pass abort signal to check before side effects
        manual: operation.metadata?.manual === true // Pass manual flag from metadata
      });

      // Check if operation was cancelled during execution
      throwIfAborted(signal, 'GENERATE_SCENE_RECAP', 'LLM call');

      // Store token breakdown in operation metadata
      if (result.tokenBreakdown) {
        const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
        const tokenMetadata = formatTokenBreakdownForMetadata(result.tokenBreakdown, {
          max_context: result.tokenBreakdown.max_context,
          max_tokens: result.tokenBreakdown.max_tokens
        });
        await updateOperationMetadata(operation.id, tokenMetadata);
      }

      toast(`✓ Stage 1 extraction complete for message ${index}`, 'success');

      // Get scene range from Stage 1 lorebook metadata for display
      const { startIdx, endIdx } = getSceneRangeFromMetadata(index);

      // Queue Stage 2 (ORGANIZE_SCENE_RECAP) to filter and organize the extracted data
      debug(SUBSYSTEM.QUEUE, `Queueing ORGANIZE_SCENE_RECAP for scene at index ${index} (range: ${startIdx}-${endIdx})`);

      const organizeMetadata = {
        manual: operation.metadata?.manual === true,
        // Include scene range for UI display
        start_index: startIdx,
        end_index: endIdx
      };

      // Pass through backwards chain metadata if present
      if (operation.metadata.backwards_chain) {
        organizeMetadata.backwards_chain = true;
        organizeMetadata.backwards_chain_remaining = operation.metadata.backwards_chain_remaining;
        organizeMetadata.backwards_chain_forward_continuation = operation.metadata.backwards_chain_forward_continuation;
      }

      // Update GENERATE_SCENE_RECAP operation metadata with scene range
      if (startIdx !== undefined && endIdx !== undefined) {
        await updateOperationMetadata(operation.id, {
          start_index: startIdx,
          end_index: endIdx
        });
      }

      await enqueueOperation(
        OperationType.ORGANIZE_SCENE_RECAP,
        { index },
        {
          priority: 14,
          dependencies: [operation.id],
          queueVersion: operation.queueVersion,
          metadata: organizeMetadata
        }
      );

      return { recap: result.recap };
    } catch (err) {
      const errorMessage = err?.message || String(err);

      if (errorMessage.includes('exceeds available context')) {
        error(SUBSYSTEM.QUEUE, `Scene recap generation failed due to token limit at message ${index}`);
        toast(`⚠ Scene too large to recap - retrying with earlier break point`, 'warning');

        clearSceneBreak({ index, get_message_div, getContext, saveChatDebounced });

        const pendingOps = getPendingOperations();
        const orphanedDetects = pendingOps.filter(op =>
          op.type === OperationType.DETECT_SCENE_BREAK &&
          op.params.startIndex === index + 1
        );

        for (const op of orphanedDetects) {
          // eslint-disable-next-line no-await-in-loop -- Operations must be removed sequentially to maintain queue state
          await removeOperation(op.id);
          debug(SUBSYSTEM.QUEUE, `Cancelled orphaned detect operation ${op.id} for range ${op.params.startIndex}-${op.params.endIndex}`);
        }

        const ctx = getContext();
        const chat = ctx.chat;
        let startIndex = 0;
        for (let i = index - 1; i >= 0; i--) {
          if (get_data(chat[i], 'scene_break')) {
            startIndex = i + 1;
            break;
          }
        }

        const newEndIndex = index - 1;
        const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
        const minimumSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;

        let remainingCount = 0;
        for (let i = startIndex; i <= newEndIndex; i++) {
          if (messageMatchesType(chat[i], checkWhich)) {
            remainingCount++;
          }
        }

        if (remainingCount >= minimumSceneLength + 1) {
          debug(SUBSYSTEM.QUEUE, `Queueing new DETECT_SCENE_BREAK for range ${startIndex} to ${newEndIndex} after token limit failure with forceSelection=true`);
          await enqueueOperation(
            OperationType.DETECT_SCENE_BREAK,
            { startIndex, endIndex: newEndIndex, offset: 0, forceSelection: true },
            {
              priority: 5,
              queueVersion: operation.queueVersion,
              metadata: { triggered_by: 'scene_recap_token_limit_retry' }
            }
          );
        } else {
          error(SUBSYSTEM.QUEUE, `Not enough messages (${remainingCount}) to retry detection after clearing scene break at ${index}`);
        }

        return { recap: null };
      }

      throw err;
    }
  });

  // Organize scene recap (Stage 2: filter and organize extracted data)
  registerOperationHandler(OperationType.ORGANIZE_SCENE_RECAP, async (operation) => {
    const { index } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing ORGANIZE_SCENE_RECAP for index ${index}`);
    toast(`Organizing scene recap for message ${index}...`, 'info');

    try {
      const ctx = getContext();
      const message = ctx.chat[index];
      if (!message) {
        throw new Error(`Message at index ${index} not found`);
      }

      // Read Stage 1 extraction data
      const stage1DataRaw = get_data(message, 'scene_recap_memory');
      if (!stage1DataRaw) {
        throw new Error(`No Stage 1 data found for message ${index}`);
      }

      // Parse Stage 1 output - handle both multi-stage and legacy formats
      let stage1Data;
      try {
        const parsed = JSON.parse(stage1DataRaw);
        // Multi-stage format has stage1 key, legacy format is the data directly
        stage1Data = parsed.stage1 || parsed;
      } catch (err) {
        throw new Error(`Failed to parse Stage 1 data: ${err.message}`);
      }

      debug(SUBSYSTEM.QUEUE, `Parsed Stage 1 data for message ${index}`);

      // Get lorebook metadata from Stage 1
      const lorebookMetadata = get_data(message, 'stage1_lorebook_metadata') || {};

      // Strip scene name fields - Stage 2 doesn't need them (already extracted in Stage 1)
      const { sn: _sn, scene_name: _scene_name, ...stage1DataWithoutName } = stage1Data;

      // Prepare Stage 2 (organize) prompt
      const { prepareOrganizeScenePrompt } = await import('./prepareOrganizeScenePrompt.js');
      const { prompt, prefill } = await prepareOrganizeScenePrompt(stage1DataWithoutName, ctx);

      // Get config for connection profile
      const config = await resolveOperationConfig('organize_scene_recap');
      const profile_name = config.connection_profile || '';
      const preset_name = config.completion_preset_name || '';
      const include_preset_prompts = config.include_preset_prompts || false;

      // Resolve profileId using profileResolution
      const { resolveProfileId } = await import('./profileResolution.js');
      const profileId = resolveProfileId(profile_name);

      // Set operation context suffix for ST_METADATA (message range)
      const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
      const endIdx = index;
      const startIdx = lorebookMetadata?.startIdx ?? endIdx;
      setOperationSuffix(`-${startIdx}-${endIdx}`);

      // Make LLM request
      const { sendLLMRequest } = await import('./llmClient.js');
      const options = {
        includePreset: include_preset_prompts,
        preset: preset_name,
        prefill,
        trimSentences: false
      };

      let rawResponse;
      try {
        rawResponse = await sendLLMRequest(profileId, prompt, OperationType.ORGANIZE_SCENE_RECAP, options);
      } finally {
        clearOperationSuffix();
      }
      debug(SUBSYSTEM.SCENE, "Stage 2 (organize) AI response:", rawResponse);

      // Check if operation was cancelled during execution
      throwIfAborted(signal, 'ORGANIZE_SCENE_RECAP', 'LLM call');

      // Extract token breakdown from response
      const { extractTokenBreakdownFromResponse } = await import('./tokenBreakdown.js');
      const tokenBreakdown = extractTokenBreakdownFromResponse(rawResponse);

      // Store token breakdown in operation metadata
      if (tokenBreakdown) {
        const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
        const tokenMetadata = formatTokenBreakdownForMetadata(tokenBreakdown, {
          max_context: tokenBreakdown.max_context,
          max_tokens: tokenBreakdown.max_tokens
        });
        await updateOperationMetadata(operation.id, tokenMetadata);
      }

      // Extract and validate JSON
      const { extractJsonFromResponse } = await import('./utils.js');
      const stage2Data = extractJsonFromResponse(rawResponse, {
        requiredFields: [],
        context: 'Stage 2 scene recap organization'
      });

      // Store multi-stage format with stage1 and stage2
      const multiStageData = {
        stage1: stage1Data,
        stage2: stage2Data
      };
      set_data(message, 'scene_recap_memory', JSON.stringify(multiStageData));
      saveChatDebounced();

      toast(`✓ Stage 2 organization complete for message ${index}`, 'success');

      // Queue Stage 3 (PARSE_SCENE_RECAP) to deduplicate and format
      debug(SUBSYSTEM.QUEUE, `Queueing PARSE_SCENE_RECAP for scene at index ${index}`);

      const parseMetadata = {
        manual: operation.metadata?.manual === true,
        start_index: startIdx,
        end_index: endIdx
      };

      // Pass through backwards chain metadata if present
      if (operation.metadata.backwards_chain) {
        parseMetadata.backwards_chain = true;
        parseMetadata.backwards_chain_remaining = operation.metadata.backwards_chain_remaining;
        parseMetadata.backwards_chain_forward_continuation = operation.metadata.backwards_chain_forward_continuation;
      }

      await enqueueOperation(
        OperationType.PARSE_SCENE_RECAP,
        { index },
        {
          priority: 14,
          dependencies: [operation.id],
          queueVersion: operation.queueVersion,
          metadata: parseMetadata
        }
      );

      return { organized: stage2Data };
    } catch (err) {
      error(SUBSYSTEM.QUEUE, `Stage 2 organization failed for message ${index}:`, err.message);
      toast(`⚠ Failed to organize scene recap for message ${index}: ${err.message}`, 'error');
      throw err;
    }
  });

  // Parse scene recap (Stage 3: deduplication and final formatting)
  // eslint-disable-next-line complexity -- Stage 3 handler requires validation, LLM call, and conditional queueing logic
  registerOperationHandler(OperationType.PARSE_SCENE_RECAP, async (operation) => {
    const { index } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing PARSE_SCENE_RECAP for index ${index}`);
    toast(`Filtering and formatting scene recap for message ${index}...`, 'info');

    try {
      const ctx = getContext();
      const message = ctx.chat[index];
      if (!message) {
        throw new Error(`Message at index ${index} not found`);
      }

      // Read stage data from previous stages
      const stageDataRaw = get_data(message, 'scene_recap_memory');
      if (!stageDataRaw) {
        throw new Error(`No stage data found for message ${index}`);
      }

      // Parse and extract stage2 data from multi-stage format
      let stage2Data;
      let existingStages;
      try {
        const parsed = JSON.parse(stageDataRaw);
        if (parsed.stage2) {
          // Multi-stage format - use stage2 output for Stage 3 input
          existingStages = parsed;
          stage2Data = parsed.stage2;
        } else {
          // Legacy format (with or without chronological_items) - wrap as stage1/stage2 and use directly
          existingStages = { stage1: parsed, stage2: parsed };
          stage2Data = parsed;
        }
      } catch (err) {
        throw new Error(`Failed to parse stage data: ${err.message}`);
      }

      debug(SUBSYSTEM.QUEUE, `Parsed Stage 2 data for message ${index}`);

      // Get lorebook metadata from Stage 1 (stored temporarily in 'stage1_lorebook_metadata')
      const lorebookMetadata = get_data(message, 'stage1_lorebook_metadata') || {};
      debug(SUBSYSTEM.QUEUE, `Retrieved Stage 1 lorebook metadata: startIdx=${lorebookMetadata?.startIdx}, endIdx=${lorebookMetadata?.endIdx}`);

      // Strip scene name fields - Stage 3 doesn't need them (already extracted in Stage 1)
      const { sn: _sn, scene_name: _scene_name, ...stage2DataWithoutName } = stage2Data;

      // Prepare Stage 3 prompt (endIdx is the scene break message index)
      const endIdx = index;
      const { prompt, prefill } = await prepareParseScenePrompt(stage2DataWithoutName, ctx, endIdx, get_data);

      // Get config for connection profile
      const config = await resolveOperationConfig('parse_scene_recap');
      const profile_name = config.connection_profile || '';
      const preset_name = config.completion_preset_name || '';
      const include_preset_prompts = config.include_preset_prompts || false;

      // Resolve profileId using profileResolution
      const { resolveProfileId } = await import('./profileResolution.js');
      const profileId = resolveProfileId(profile_name);

      // Set operation context suffix for ST_METADATA (message range)
      const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
      const startIdx = lorebookMetadata?.startIdx ?? endIdx;
      setOperationSuffix(`-${startIdx}-${endIdx}`);

      // Make LLM request
      const { sendLLMRequest } = await import('./llmClient.js');
      const options = {
        includePreset: include_preset_prompts,
        preset: preset_name,
        prefill,
        trimSentences: false
      };

      let rawResponse;
      try {
        rawResponse = await sendLLMRequest(profileId, prompt, OperationType.PARSE_SCENE_RECAP, options);
      } finally {
        clearOperationSuffix();
      }
      debug(SUBSYSTEM.SCENE, "Stage 3 AI response:", rawResponse);

      // Check if operation was cancelled during execution
      throwIfAborted(signal, 'PARSE_SCENE_RECAP', 'LLM call');

      // Extract token breakdown from response
      const { extractTokenBreakdownFromResponse } = await import('./tokenBreakdown.js');
      const tokenBreakdown = extractTokenBreakdownFromResponse(rawResponse);

      // Store token breakdown in operation metadata
      if (tokenBreakdown) {
        const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
        const tokenMetadata = formatTokenBreakdownForMetadata(tokenBreakdown, {
          max_context: tokenBreakdown.max_context,
          max_tokens: tokenBreakdown.max_tokens
        });
        await updateOperationMetadata(operation.id, tokenMetadata);
      }

      // Extract JSON - accept any valid JSON object, no required fields
      const { extractJsonFromResponse } = await import('./utils.js');
      const parsed = extractJsonFromResponse(rawResponse, {
        requiredFields: [],
        context: 'Stage 3 scene recap'
      });

      // Store parsed JSON as-is - prompts can output any format
      // Normalize common fields for display if present, but don't require them
      const normalized = { ...parsed };

      // Try to extract scene_name from common field names for display purposes
      if (normalized.scene_name === undefined && parsed.sn !== undefined) {
        normalized.scene_name = parsed.sn;
      }

      debug(SUBSYSTEM.SCENE, "Stage 3 returned JSON, storing as-is");

      // Extract scene_name from Stage 1 (has most context for naming)
      const stage1SceneName = existingStages.stage1?.sn || existingStages.stage1?.scene_name;

      // Store in multi-stage format with scene_name at top level from Stage 1
      const finalMultiStageData = {
        ...(stage1SceneName ? { scene_name: stage1SceneName } : {}),
        ...existingStages,
        stage3: normalized
      };
      const recap = JSON.stringify(finalMultiStageData);
      debug(SUBSYSTEM.SCENE, `Stage 3 formatting complete for message ${index}`);

      // Save the formatted recap with full versioning and lorebook operations
      const isManual = operation.metadata?.manual === true;
      const lorebookOpIds = await saveSceneRecap({
        message,
        recap,
        get_data,
        set_data,
        saveChatDebounced,
        messageIndex: index,
        lorebookMetadata,
        manual: isManual
      });

      // Clean up temporary Stage 1 metadata (no longer needed after Stage 3 completes)
      delete message.extra?.[MODULE_NAME]?.stage1_lorebook_metadata;
      saveChatDebounced();

      // Render scene break UI to show new version
      renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);

      toast(`✓ Scene recap formatted and saved for message ${index}`, 'success');

      // Queue COMBINE operation if not manual and auto-generate is enabled
      if (!isManual && get_settings('running_scene_recap_auto_generate')) {
        debug(SUBSYSTEM.QUEUE, `Queueing COMBINE_SCENE_WITH_RUNNING for scene at index ${index} (depends on ${lorebookOpIds.length} lorebook operations)`);

        // Pass through backwards chain metadata if present
        const combineMetadata = {};
        if (operation.metadata.backwards_chain) {
          combineMetadata.backwards_chain = true;
          combineMetadata.backwards_chain_remaining = operation.metadata.backwards_chain_remaining;
          combineMetadata.backwards_chain_forward_continuation = operation.metadata.backwards_chain_forward_continuation;
        }

        await queueCombineSceneWithRunning(index, {
          dependencies: lorebookOpIds,
          queueVersion: operation.queueVersion,
          metadata: combineMetadata
        });
      } else {
        debug(SUBSYSTEM.QUEUE, `Skipping auto-combine for ${isManual ? 'manual' : 'disabled'} scene recap at index ${index}`);

        // If COMBINE won't run, queue snapshot update directly (depends on lorebook ops)
        if (lorebookOpIds && lorebookOpIds.length > 0) {
          debug(SUBSYSTEM.QUEUE, `Queueing snapshot update for scene at index ${index} (depends on ${lorebookOpIds.length} lorebook operations)`);
          await enqueueOperation(
            OperationType.UPDATE_LOREBOOK_SNAPSHOT,
            { messageIndex: index },
            {
              priority: 15,
              dependencies: lorebookOpIds,
              queueVersion: operation.queueVersion,
              metadata: { scene_index: index }
            }
          );
        }
      }

      return { recap };
    } catch (err) {
      error(SUBSYSTEM.QUEUE, `Stage 2 filtering failed for message ${index}:`, err.message);
      toast(`⚠ Failed to format scene recap for message ${index}: ${err.message}`, 'error');
      throw err;
    }
  });

  // Standalone scene name generation operation removed.

  // Generate running recap (bulk)
  registerOperationHandler(OperationType.GENERATE_RUNNING_RECAP, async (operation) => {
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing GENERATE_RUNNING_RECAP`);

    const result = await generate_running_scene_recap(true);

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'GENERATE_RUNNING_RECAP', 'LLM call');

    // Store token breakdown in operation metadata
    if (result?.tokenBreakdown) {
      const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
      const tokenMetadata = formatTokenBreakdownForMetadata(result.tokenBreakdown, {
        max_context: result.tokenBreakdown.max_context,
        max_tokens: result.tokenBreakdown.max_tokens
      });
      await updateOperationMetadata(operation.id, tokenMetadata);
    }

    return { recap: result?.recap || result };
  });

  // Combine scene with running recap
  registerOperationHandler(OperationType.COMBINE_SCENE_WITH_RUNNING, async (operation) => {
    const index = operation.metadata.scene_index;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing COMBINE_SCENE_WITH_RUNNING for index ${index}`);

    const result = await combine_scene_with_running_recap(index);

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'COMBINE_SCENE_WITH_RUNNING', 'LLM call');

    // Store token breakdown in operation metadata
    if (result?.tokenBreakdown) {
      const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
      const tokenMetadata = formatTokenBreakdownForMetadata(result.tokenBreakdown, {
        max_context: result.tokenBreakdown.max_context,
        max_tokens: result.tokenBreakdown.max_tokens
      });
      await updateOperationMetadata(operation.id, tokenMetadata);
    }

    // Update lorebook snapshot AFTER all lorebook operations complete
    // Snapshot will only include entries created by this specific recap version
    if (index !== undefined) {
      const lorebookOpsCount = (operation.dependencies && operation.dependencies.length) || 0;
      debug(SUBSYSTEM.QUEUE, `Updating lorebook snapshot for scene ${index} (${lorebookOpsCount} lorebook operations completed)`);
      await updateSceneLorebookSnapshot(index);

      // Mark this scene/version as combined (locked in - prevents further modification)
      const ctx = getContext();
      const message = ctx.chat[index];
      if (message) {
        const metadata = get_data(message, 'scene_recap_metadata') || {};
        const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
        if (metadata[currentVersionIndex]) {
          metadata[currentVersionIndex].combined_at = Date.now();
          set_data(message, 'scene_recap_metadata', metadata);
          saveChatDebounced();
          debug(SUBSYSTEM.QUEUE, `Marked scene ${index} version ${currentVersionIndex} as combined (locked)`);

          // Re-render scene break UI to immediately show locked state
          renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
        }
      }
    }

    // Check if this is part of a backwards chain and queue next recap
    if (operation.metadata.backwards_chain && operation.metadata.backwards_chain_remaining) {
      const remainingBreaks = operation.metadata.backwards_chain_remaining;

      if (remainingBreaks.length > 0) {
        const nextBreak = remainingBreaks[0];
        const newRemaining = remainingBreaks.slice(1);

        debug(SUBSYSTEM.OPERATIONS, `Backwards chain: queueing next recap for break ${nextBreak}, ${newRemaining.length} remaining`);

        await enqueueOperation(
          OperationType.GENERATE_SCENE_RECAP,
          { index: nextBreak },
          {
            // Run after lorebook pipeline/combine (priorities 10–14)
            priority: 9,
            queueVersion: operation.queueVersion,
            metadata: {
              triggered_by: 'backwards_chain_continuation',
              backwards_chain: true,
              backwards_chain_remaining: newRemaining,
              backwards_chain_forward_continuation: operation.metadata.backwards_chain_forward_continuation
            }
          }
        );
      } else {
        // No more recaps - queue forward continuation if present
        const forwardContinuation = operation.metadata.backwards_chain_forward_continuation;
        if (forwardContinuation) {
          debug(SUBSYSTEM.OPERATIONS, 'Backwards chain complete, queueing forward continuation');

          await enqueueOperation(
            OperationType.DETECT_SCENE_BREAK,
            {
              startIndex: forwardContinuation.start_index,
              endIndex: forwardContinuation.end_index,
              offset: get_settings('auto_scene_break_message_offset') || 2
            },
            {
              priority: 5,  // NORMAL
              queueVersion: operation.queueVersion,
              metadata: {
                triggered_by: 'backwards_chain_completion',
                original_operation_id: forwardContinuation.original_operation_id
              }
            }
          );
        }
      }
    }

    return { recap: result?.recap || result };
  });

  // Merge lorebook entry (standalone operation)
  registerOperationHandler(OperationType.MERGE_LOREBOOK_ENTRY, async (operation) => {
    const { lorebookName, entryUid, existingContent, newContent, newKeys } = operation.params;
    const signal = getAbortSignal(operation);
    const entryComment = operation.metadata?.entry_comment || entryUid;
    debug(SUBSYSTEM.QUEUE, `Executing MERGE_LOREBOOK_ENTRY for: ${entryComment}`);

    // Prefer compacted content if it was produced; fall back to latest entry content instead of stale pre-compaction text.
    const { content: effectiveExistingContent } = await resolveCompactedContent(operation, existingContent);

    const result = await mergeLorebookEntryByUid({
      lorebookName,
      entryUid,
      existingContent: effectiveExistingContent ?? undefined,
      newContent,
      newKeys
    });

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'MERGE_LOREBOOK_ENTRY', 'LLM call');

    // Store token breakdown in operation metadata
    if (result?.tokenBreakdown) {
      const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
      const tokenMetadata = formatTokenBreakdownForMetadata(result.tokenBreakdown, {
        max_context: result.tokenBreakdown.max_context,
        max_tokens: result.tokenBreakdown.max_tokens
      });
      await updateOperationMetadata(operation.id, tokenMetadata);
    }

    return result;
  });

  // COMPACT_LOREBOOK_ENTRY - Compact large lorebook entry before merge
  registerOperationHandler(OperationType.COMPACT_LOREBOOK_ENTRY, async (operation) => {
    const { lorebookName, entryUid, existingContent } = operation.params;
    const signal = getAbortSignal(operation);
    const entryComment = operation.metadata?.entry_comment || entryUid;

    debug(SUBSYSTEM.QUEUE, `Executing COMPACT_LOREBOOK_ENTRY for: ${entryComment}`);

    // Import compaction function
    const { compactLorebookEntryByUid } = await import('./lorebookEntryMerger.js');

    // Execute compaction
    const result = await compactLorebookEntryByUid({
      lorebookName,
      entryUid,
      existingContent
    });

    // Check if cancelled after LLM call
    throwIfAborted(signal, 'COMPACT_LOREBOOK_ENTRY', 'LLM call');

    // Store token breakdown in operation metadata
    if (result?.tokenBreakdown) {
      const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
      const tokenMetadata = formatTokenBreakdownForMetadata(result.tokenBreakdown, {
        max_context: result.tokenBreakdown.max_context,
        max_tokens: result.tokenBreakdown.max_tokens
      });
      await updateOperationMetadata(operation.id, tokenMetadata);
    }

    return result;
  });

  // LOREBOOK_ENTRY_LOOKUP - First stage of lorebook processing pipeline
  // Pipeline state machine: determines next stage based on AI results

  registerOperationHandler(OperationType.LOREBOOK_ENTRY_LOOKUP, async (operation) => {
    const { entryId, entryData, registryListing, typeList } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] ⚙️ Starting for: ${entryData.comment || 'Unknown'}, entryId: ${entryId}`);
    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Operation ID: ${operation.id}, Status: ${operation.status}`);

    // Build settings from resolved configs
    const settings = await buildLorebookOperationsSettings();

    // Check for skip path optimization (empty lorebook at scene start)
    const skipCheck = checkCanSkipLorebookLookup(operation, entryData);
    if (skipCheck.canSkip) {
      return await executeSkipPath(operation, entryId, entryData);
    }

    // Run lorebook entry lookup
    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Running lookup stage...`);
    const lorebookEntryLookupResult = await runLorebookEntryLookupStage(entryData, registryListing, typeList, settings);

    // Check if cancelled after LLM call (before side effects)
    throwIfAborted(signal, 'LOREBOOK_ENTRY_LOOKUP', 'LLM call');

    // Store token breakdown in operation metadata
    if (lorebookEntryLookupResult?.tokenBreakdown) {
      const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
      const tokenMetadata = formatTokenBreakdownForMetadata(lorebookEntryLookupResult.tokenBreakdown, {
        max_context: lorebookEntryLookupResult.tokenBreakdown.max_context,
        max_tokens: lorebookEntryLookupResult.tokenBreakdown.max_tokens
      });
      await updateOperationMetadata(operation.id, tokenMetadata);
    }

    // Store lorebook entry lookup result in pending ops
    setLorebookEntryLookupResult(entryId, lorebookEntryLookupResult);
    markStageInProgress(entryId, 'lorebook_entry_lookup_complete');

    debug(SUBSYSTEM.QUEUE, `✓ Lorebook Entry Lookup complete for ${entryId}: type=${lorebookEntryLookupResult.type}, sameUids=${lorebookEntryLookupResult.sameEntityUids.length}, needsUids=${lorebookEntryLookupResult.needsFullContextUids.length}`);

    // Enqueue next operation based on lorebook entry lookup result
    const needsResolution = (lorebookEntryLookupResult.needsFullContextUids && lorebookEntryLookupResult.needsFullContextUids.length > 0) ||
                           (lorebookEntryLookupResult.sameEntityUids && lorebookEntryLookupResult.sameEntityUids.length > 1);

    if (needsResolution) {
      // Need lorebook entry deduplication - handles both uncertain matches AND multiple definite matches
      const nextOpId = await enqueueOperation(
        OperationType.RESOLVE_LOREBOOK_ENTRY,
        { entryId },
        {
          priority: 12,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            message_index: operation.metadata?.message_index,
            version_index: operation.metadata?.version_index,
            hasPrefill: Boolean(settings.lorebook_entry_deduplicate_prefill && settings.lorebook_entry_deduplicate_prefill.trim().length > 0),
            includePresetPrompts: settings.lorebook_entry_deduplicate_include_preset_prompts ?? false
          }
        }
      );
      await transferDependencies(operation.id, nextOpId);
    } else if (lorebookEntryLookupResult.sameEntityUids.length === 1) {
      // Exact match found - merge - capture merge settings at enqueue time
      const resolvedUid = lorebookEntryLookupResult.sameEntityUids[0];
      setLorebookEntryDeduplicateResult(entryId, { resolvedUid, synopsis: lorebookEntryLookupResult.synopsis, duplicateUids: [] });
      markStageInProgress(entryId, 'lorebook_entry_deduplicate_complete');

      const nextOpId = await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'merge', resolvedUid },
        {
          priority: 14,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            message_index: operation.metadata?.message_index,
            version_index: operation.metadata?.version_index,
            hasPrefill: Boolean(settings.merge_prefill && settings.merge_prefill.trim().length > 0),
            includePresetPrompts: settings.merge_include_preset_prompts ?? false
          }
        }
      );
      await transferDependencies(operation.id, nextOpId);
    } else {
      // No match - create new (no prefill/preset prompts for create operations)
      const nextOpId = await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'create' },
        {
          priority: 14,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            message_index: operation.metadata?.message_index,
            version_index: operation.metadata?.version_index,
            hasPrefill: false,
            includePresetPrompts: false
          }
        }
      );
      await transferDependencies(operation.id, nextOpId);
    }

    return { success: true, lorebookEntryLookupResult };
  });

  // Helper: Merge duplicate UIDs from LLM and LOOKUP results
  function mergeDuplicateUidsFromLookup(lorebookEntryDeduplicateResult, lorebookEntryLookupResult) {
    if (lorebookEntryDeduplicateResult.resolvedUid &&
        lorebookEntryLookupResult.sameEntityUids &&
        lorebookEntryLookupResult.sameEntityUids.length > 1) {
      // LOOKUP identified multiple same entities - ensure ALL are in duplicateUids for consolidation
      const llmDuplicates = lorebookEntryDeduplicateResult.duplicateUids || [];
      const lookupDuplicates = lorebookEntryLookupResult.sameEntityUids
        .filter(uid => String(uid) !== String(lorebookEntryDeduplicateResult.resolvedUid))
        .map(uid => String(uid));

      // Merge both sources, deduplicate
      const allDuplicates = [...new Set([...llmDuplicates, ...lookupDuplicates])];

      if (allDuplicates.length !== llmDuplicates.length) {
        debug(SUBSYSTEM.QUEUE, `Merged duplicates: LLM provided [${llmDuplicates.join(', ')}], LOOKUP identified [${lookupDuplicates.join(', ')}], final: [${allDuplicates.join(', ')}]`);
      }

      lorebookEntryDeduplicateResult.duplicateUids = allDuplicates;
    }
  }

  // RESOLVE_LOREBOOK_ENTRY - Second stage (conditional) - get full context for uncertain matches
  // Pipeline state machine: determines next stage based on AI results

  registerOperationHandler(OperationType.RESOLVE_LOREBOOK_ENTRY, async (operation) => {
    const { entryId } = operation.params;
    const signal = getAbortSignal(operation);
    const entryData = getEntryData(entryId);
    const lorebookEntryLookupResult = getLorebookEntryLookupResult(entryId);

    if (!entryData || !lorebookEntryLookupResult) {
      throw new Error(`Missing pending data for entry ${entryId}`);
    }

    debug(SUBSYSTEM.QUEUE, `Executing RESOLVE_LOREBOOK_ENTRY for: ${entryData.comment || 'Unknown'}`);

    // Build settings from resolved configs
    const settings = await buildLorebookOperationsSettings();

    const lorebookName = getAttachedLorebook();

    if (!lorebookName) {
      throw new Error('No lorebook attached');
    }

    // Get existing entries to build candidate data
    const existingEntriesRaw = await getLorebookEntries(lorebookName);
    const existingEntriesMap  = new Map();
    if (existingEntriesRaw) {for (const entry of existingEntriesRaw) {
      if (entry && entry.uid !== undefined) {
        existingEntriesMap.set(String(entry.uid), entry);
      }
    }}

    const registryState = ensureRegistryState();
    const candidateIds = Array.from(new Set([
    ...lorebookEntryLookupResult.sameEntityUids,
    ...lorebookEntryLookupResult.needsFullContextUids]
    ));

    const candidateEntries = buildCandidateEntriesData(candidateIds, registryState, existingEntriesMap);

    // Run lorebook entry deduplication
    const lorebookEntryDeduplicateResult = await runLorebookEntryDeduplicateStage(
      entryData,
      lorebookEntryLookupResult.synopsis,
      candidateEntries,
      lorebookEntryLookupResult.type,
      settings
    );

    // Check if cancelled after LLM call (before side effects)
    throwIfAborted(signal, 'RESOLVE_LOREBOOK_ENTRY', 'LLM call');

    // Store token breakdown in operation metadata
    if (lorebookEntryDeduplicateResult?.tokenBreakdown) {
      const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
      const tokenMetadata = formatTokenBreakdownForMetadata(lorebookEntryDeduplicateResult.tokenBreakdown, {
        max_context: lorebookEntryDeduplicateResult.tokenBreakdown.max_context,
        max_tokens: lorebookEntryDeduplicateResult.tokenBreakdown.max_tokens
      });
      await updateOperationMetadata(operation.id, tokenMetadata);
    }

    // Store lorebook entry deduplicate result
    // Merge duplicateUids from LLM with sameEntityUids from LOOKUP to ensure we consolidate everything
    mergeDuplicateUidsFromLookup(lorebookEntryDeduplicateResult, lorebookEntryLookupResult);
    setLorebookEntryDeduplicateResult(entryId, lorebookEntryDeduplicateResult);
    markStageInProgress(entryId, 'lorebook_entry_deduplicate_complete');

    debug(SUBSYSTEM.QUEUE, `✓ LorebookEntryDeduplicate complete for ${entryId}: resolvedUid=${lorebookEntryDeduplicateResult.resolvedUid || 'new'}`);

    // Enqueue next operation - capture settings at enqueue time
    if (lorebookEntryDeduplicateResult.resolvedUid) {
      // Match found - merge
      const nextOpId = await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'merge', resolvedUid: lorebookEntryDeduplicateResult.resolvedUid },
        {
          priority: 14, // Match other CREATE operations, ensure completion before new LOOKUPs
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            message_index: operation.metadata?.message_index,
            version_index: operation.metadata?.version_index,
            hasPrefill: Boolean(settings.merge_prefill && settings.merge_prefill.trim().length > 0),
            includePresetPrompts: settings.merge_include_preset_prompts ?? false
          }
        }
      );
      await transferDependencies(operation.id, nextOpId);
    } else {
      // No match - create new (no prefill/preset prompts for create operations)
      const nextOpId = await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'create' },
        {
          priority: 14,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            message_index: operation.metadata?.message_index,
            version_index: operation.metadata?.version_index,
            hasPrefill: false,
            includePresetPrompts: false
          }
        }
      );
      await transferDependencies(operation.id, nextOpId);
    }

    return { success: true, lorebookEntryDeduplicateResult };
  });

  function prepareEntryContext(operation ) {
    const { entryId, action, resolvedUid } = operation.params;
    const signal = getAbortSignal(operation);
    const entryData = getEntryData(entryId);
    const lorebookEntryLookupResult = getLorebookEntryLookupResult(entryId);
    const lorebookEntryDeduplicateResult = getLorebookEntryDeduplicateResult(entryId);

    if (!entryData) {
      throw new Error(`Missing entry data for ${entryId}`);
    }

    debug(SUBSYSTEM.QUEUE, `Executing CREATE_LOREBOOK_ENTRY (${action}) for: ${entryData.comment || 'Unknown'}`);

    const lorebookName = getAttachedLorebook();
    if (!lorebookName) {
      throw new Error('No lorebook attached');
    }

    const registryState = ensureRegistryState();
    const finalType = lorebookEntryLookupResult?.type || entryData.type || 'character';
    const finalSynopsis = lorebookEntryDeduplicateResult?.synopsis || lorebookEntryLookupResult?.synopsis || '';

    return {
      entryId, action, resolvedUid, entryData, lorebookName,
      registryState, finalType, finalSynopsis, signal,
      contextGetLorebookEntries: getLorebookEntries, contextAddLorebookEntry: addLorebookEntry, contextMergeLorebookEntry: mergeLorebookEntry,
      contextUpdateRegistryRecord: updateRegistryRecord, contextEnsureStringArray: ensureStringArray
    };
  }

  // eslint-disable-next-line complexity,max-params -- Consolidation requires sequential operations with error handling
  async function consolidateDuplicateEntries(entryId , resolvedUid , lorebookName , registryState , contextGetLorebookEntries , contextMergeLorebookEntry , signal ) {
    const lorebookEntryDeduplicateResult = getLorebookEntryDeduplicateResult(entryId);
    const duplicateUidsRaw = lorebookEntryDeduplicateResult?.duplicateUids || [];

    if (duplicateUidsRaw.length === 0) {
      return { canonicalUid: resolvedUid, record: registryState.index?.[resolvedUid] };
    }

    // ALWAYS use LOWEST UID as canonical (first created = source of truth)
    const allUids = [resolvedUid, ...duplicateUidsRaw].map(uid => String(uid));
    const numericUids = allUids.map(uid => {
      const num = Number.parseInt(uid, 10);
      return Number.isNaN(num) ? Infinity : num;
    });
    const minIdx = numericUids.indexOf(Math.min(...numericUids));
    const canonicalUid = allUids[minIdx];
    const duplicateUids = allUids.filter(uid => uid !== canonicalUid);

    // Sort duplicates in DESCENDING order (merge highest → canonical first)
    duplicateUids.sort((a, b) => {
      const aNum = Number.parseInt(a, 10);
      const bNum = Number.parseInt(b, 10);
      if (Number.isNaN(aNum) || Number.isNaN(bNum)) {return 0;}
      return bNum - aNum; // Descending
    });

    debug(SUBSYSTEM.QUEUE, `Consolidating ${duplicateUids.length} duplicate entries into canonical UID ${canonicalUid} (lowest): [${duplicateUids.join(', ')}]`);

    // Update record to canonical if it changed
    let record = registryState.index?.[canonicalUid];
    if (!record) {
      const allEntries = await contextGetLorebookEntries(lorebookName);
      await refreshRegistryStateFromEntries(allEntries);
      record = registryState.index?.[canonicalUid];
    }
    if (!record) {
      throw new Error(`Canonical UID ${canonicalUid} not found in registry after resolution`);
    }

    for (const dupUid of duplicateUids) {
      // Refetch to get latest merged content
      // eslint-disable-next-line no-await-in-loop -- Sequential refetch required to get latest merged content after each merge
      const currentEntries = await contextGetLorebookEntries(lorebookName);
      const currentResolvedEntry = currentEntries?.find((e) => String(e.uid) === String(record.uid));
      const dupRecord = registryState.index?.[dupUid];
      const dupEntry = dupRecord ? currentEntries?.find((e) => String(e.uid) === String(dupRecord.uid)) : null;

      if (!currentResolvedEntry) {
        throw new Error(`Canonical entry ${canonicalUid} disappeared during consolidation`);
      }

      if (dupEntry) {
        debug(SUBSYSTEM.QUEUE, `Merging duplicate UID ${dupUid} → canonical UID ${canonicalUid}`);

        // eslint-disable-next-line no-await-in-loop -- Sequential merges required to maintain data integrity
        const dupMergeResult = await contextMergeLorebookEntry(
          lorebookName,
          currentResolvedEntry,
          { content: dupEntry.content, keys: dupEntry.key },
          { useQueue: false }
        );

        throwIfAborted(signal, 'CREATE_LOREBOOK_ENTRY (consolidate duplicates)', 'duplicate merge LLM call');

        if (!dupMergeResult?.success) {
          throw new Error(`Failed to merge duplicate ${dupUid}: ${dupMergeResult?.message || 'Unknown error'}`);
        }

        // eslint-disable-next-line no-await-in-loop -- Sequential deletions required
        const deleted = await deleteLorebookEntry(lorebookName, dupRecord.uid);
        if (!deleted) {
          debug(SUBSYSTEM.QUEUE, `Warning: Failed to delete duplicate entry ${dupUid}`);
        }

        debug(SUBSYSTEM.QUEUE, `✓ Consolidated and deleted duplicate ${dupUid}`);
      } else {
        debug(SUBSYSTEM.QUEUE, `Duplicate ${dupUid} not found in lorebook, skipping`);
      }

      // Remove from registry
      delete registryState.index[dupUid];
    }

    return { canonicalUid, record };
  }

  // eslint-disable-next-line complexity -- Merge operation requires validation and consolidation steps
  async function executeMergeAction(context ) {
    const { resolvedUid, entryData, lorebookName, registryState, finalType, finalSynopsis,
      contextGetLorebookEntries, contextMergeLorebookEntry, contextUpdateRegistryRecord, contextEnsureStringArray, entryId, signal } = context;

    let existingEntriesRaw = await contextGetLorebookEntries(lorebookName);
    let record = registryState.index?.[resolvedUid];
    let existingEntry = record ? existingEntriesRaw?.find((e) => e.uid === record.uid) : null;

    if (!record || !existingEntry) {
      // Defensive refresh: hydrate registry state from lorebook and retry lookup once
      await refreshRegistryStateFromEntries(existingEntriesRaw);
      record = registryState.index?.[resolvedUid];
      // Reload entries in case they changed
      existingEntriesRaw = await contextGetLorebookEntries(lorebookName);
      existingEntry = record ? existingEntriesRaw?.find((e) => e.uid === record.uid) : null;
    }

    if (!record || !existingEntry) {
      // Hard fail: do NOT fallback to create — prevents duplicates
      const { diagnostics, registryKeys, lorebookUids } = buildMergeErrorDiagnostics(resolvedUid, record, existingEntry, registryState, existingEntriesRaw);

      debug(SUBSYSTEM.QUEUE, `MERGE failed to locate resolvedUid=${resolvedUid}. Registry keys: ${registryKeys}. Lorebook uids: ${lorebookUids}`);

      // Pause the queue to prevent further corruption
      await pauseQueue();

      throw new Error(`DUPLICATE/STATE ERROR: Cannot merge into uid ${resolvedUid} — registry/entry not found after hydration. ${diagnostics}`);
    }

    // Check if compaction is needed before merge
    const existingTokenCount = await getLorebookEntryTokenCount(lorebookName, existingEntry.uid);
    const compactionThreshold = get_settings?.('auto_lorebooks_compaction_threshold') ?? DEFAULT_COMPACTION_THRESHOLD;

    if (existingTokenCount >= compactionThreshold) {
      debug(SUBSYSTEM.QUEUE, `Entry ${existingEntry.uid} has ${existingTokenCount} tokens (threshold: ${compactionThreshold}), compacting before merge`);

      // Perform compaction synchronously
      const { compactLorebookEntryByUid } = await import('./lorebookEntryMerger.js');
      const compactionResult = await compactLorebookEntryByUid({
        lorebookName,
        entryUid: existingEntry.uid,
        existingContent: existingEntry.content
      });

      // Check if cancelled after compaction LLM call
      throwIfAborted(signal, 'CREATE_LOREBOOK_ENTRY (compaction)', 'compaction LLM call');

      if (!compactionResult?.success) {
        throw new Error(`Compaction failed: ${compactionResult?.message || 'Unknown error'}`);
      }

      // Update existingEntry with compacted content for subsequent merge
      existingEntry = { ...existingEntry, content: compactionResult.compactedContent };
      debug(SUBSYSTEM.QUEUE, `✓ Compacted entry ${existingEntry.uid} (${existingTokenCount} → ${compactionResult.newTokenCount} tokens)`);
    }

    // Consolidate duplicates if any exist
    const consolidation = await consolidateDuplicateEntries(entryId, resolvedUid, lorebookName, registryState, contextGetLorebookEntries, contextMergeLorebookEntry, signal);
    const canonicalUid = consolidation.canonicalUid;

    if (canonicalUid !== resolvedUid) {
      // Canonical UID changed, update context and refetch
      context.resolvedUid = canonicalUid;
      record = consolidation.record;
      existingEntriesRaw = await contextGetLorebookEntries(lorebookName);
      existingEntry = existingEntriesRaw?.find((e) => String(e.uid) === String(record.uid));
      if (!existingEntry) {
        throw new Error(`Canonical entry ${canonicalUid} disappeared after consolidation`);
      }
    }

    const mergeResult = await contextMergeLorebookEntry(lorebookName, existingEntry, entryData, { useQueue: false });

    // Check if cancelled after LLM call (before side effects)
    throwIfAborted(signal, 'CREATE_LOREBOOK_ENTRY (merge)', 'LLM call');

    if (!mergeResult?.success) {
      throw new Error(mergeResult?.message || 'Merge failed');
    }

    contextUpdateRegistryRecord(registryState, canonicalUid, {
      type: finalType,
      name: entryData.comment || existingEntry.comment || '',
      comment: entryData.comment || existingEntry.comment || '',
      aliases: contextEnsureStringArray(entryData.keys),
      synopsis: finalSynopsis
    });

    debug(SUBSYSTEM.QUEUE, `✓ Merged entry ${entryId} into ${canonicalUid}`);

    return { success: true, entityId: canonicalUid, entityUid: existingEntry.uid, action: 'merged' };
  }

  async function executeCreateAction(context ) {
    const { entryData, lorebookName, registryState, finalType, finalSynopsis,
      contextAddLorebookEntry, contextUpdateRegistryRecord, contextEnsureStringArray, entryId, contextGetLorebookEntries } = context;

    // HARD DUPLICATE GUARD: Check existing entries for a matching entity name
    const existingEntriesRaw = await contextGetLorebookEntries(lorebookName);
    const targetName = String(entryData.comment || '').trim();
    const typePrefix = String(finalType || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const prefixedTarget = typePrefix && targetName ? `${typePrefix}-${targetName}` : targetName;
    const targetLower = targetName.toLowerCase();
    const prefixedLower = prefixedTarget.toLowerCase();

    const dup = (existingEntriesRaw || []).find((e) => {
      if (!e || typeof e.comment !== 'string') {return false;}
      const c = e.comment.trim();
      if (c.startsWith('_registry_')) {return false;}
      const cLower = c.toLowerCase();
      const cStub = cLower.replace(/^[^-]+-/, '');
      return cLower === prefixedLower || cLower === targetLower || cStub === targetLower;
    });

    if (dup) {
      // Hard guard caught a duplicate that LLM lookup missed - fallback to merge
      debug(SUBSYSTEM.QUEUE, `Hard guard detected duplicate: "${targetName}" (${finalType}) exists as UID=${dup.uid}. Falling back to merge.`);
      return { success: false, fallbackToMerge: true, resolvedUid: String(dup.uid) };
    }

    const createdEntry = await contextAddLorebookEntry(lorebookName, entryData);

    if (!createdEntry) {
      throw new Error('Failed to create lorebook entry');
    }

    const entityId = createdEntry.uid;

    contextUpdateRegistryRecord(registryState, entityId, {
      type: finalType,
      name: entryData.comment || createdEntry.comment || '',
      comment: entryData.comment || createdEntry.comment || '',
      aliases: contextEnsureStringArray(entryData.keys),
      synopsis: finalSynopsis
    });

    debug(SUBSYSTEM.QUEUE, `✓ Created entry ${entryId} as ${entityId}`);

    return { success: true, entityId, entityUid: createdEntry.uid, action: 'created' };
  }

  async function handleCreateLorebookEntry(operation ) {
    const context = await prepareEntryContext(operation);

    let result;
    if (context.action === 'merge' && context.resolvedUid) {
      result = await executeMergeAction(context);
      if (result.fallbackToCreate) {
        result = await executeCreateAction(context);
      }
    } else {
      result = await executeCreateAction(context);
      if (result.fallbackToMerge) {
        // Hard guard detected duplicate - retry as merge
        debug(SUBSYSTEM.QUEUE, `Retrying as merge operation for UID ${result.resolvedUid}`);
        context.action = 'merge';
        context.resolvedUid = result.resolvedUid;
        result = await executeMergeAction(context);
      }
    }

    if (!result.success || !result.entityId || result.entityUid === undefined || result.entityUid === null) {
      throw new Error('Failed to create or merge entry');
    }

    // Track created entry UID for this recap version
    const messageIndex = operation.metadata?.message_index;
    const versionIndex = operation.metadata?.version_index;
    debug(SUBSYSTEM.QUEUE, `[UID TRACKING] messageIndex=${messageIndex}, versionIndex=${versionIndex}, uid=${result.entityUid}, metadata exists: ${!!operation.metadata}`);
    if (messageIndex !== undefined && versionIndex !== undefined) {
      const ctx = getContext();
      const message = ctx.chat[messageIndex];
      if (message) {
        const metadata = get_data(message, 'scene_recap_metadata') || {};

        // Ensure metadata exists for this version (defensive)
        if (!metadata[versionIndex]) {
          metadata[versionIndex] = {
            timestamp: Date.now(),
            allEntries: [],
            entries: [],
            created_entry_uids: []
          };
        }

        if (!metadata[versionIndex].created_entry_uids) {
          metadata[versionIndex].created_entry_uids = [];
        }

        const uid = String(result.entityUid);
        if (!metadata[versionIndex].created_entry_uids.includes(uid)) {
          metadata[versionIndex].created_entry_uids.push(uid);
          set_data(message, 'scene_recap_metadata', metadata);
          saveChatDebounced();
          debug(SUBSYSTEM.QUEUE, `Tracked entry UID ${uid} for message ${messageIndex}, version ${versionIndex}`);
        } else {
          debug(SUBSYSTEM.QUEUE, `[UID TRACKING] UID ${uid} already tracked for message ${messageIndex}, version ${versionIndex}`);
        }
      } else {
        debug(SUBSYSTEM.QUEUE, `[UID TRACKING] Message ${messageIndex} not found in chat`);
      }
    } else {
      debug(SUBSYSTEM.QUEUE, `[UID TRACKING] Skipping - messageIndex or versionIndex undefined`);
    }

    // Enqueue registry update
    await enqueueOperation(
      OperationType.UPDATE_LOREBOOK_REGISTRY,
      { entryId: context.entryId, entityType: context.finalType, entityId: result.entityId, action: result.action },
      { priority: 14, queueVersion: operation.queueVersion, metadata: { entry_comment: context.entryData.comment, message_index: operation.metadata?.message_index, version_index: operation.metadata?.version_index } }
    );

    return { success: true, entityId: result.entityId, entityUid: result.entityUid, action: result.action };
  }

  // CREATE_LOREBOOK_ENTRY - Third stage - create new entry or merge with existing
  registerOperationHandler(OperationType.CREATE_LOREBOOK_ENTRY, handleCreateLorebookEntry);

  // UPDATE_LOREBOOK_REGISTRY - Fourth stage - update registry entry content
  registerOperationHandler(OperationType.UPDATE_LOREBOOK_REGISTRY, async (operation) => {
    const { entryId, entityType, entityId, action } = operation.params;
    const entryData = getEntryData(entryId);

    debug(SUBSYSTEM.QUEUE, `Executing UPDATE_LOREBOOK_REGISTRY for type=${entityType}, id=${entityId}`);

    const lorebookName = getAttachedLorebook();
    if (!lorebookName) {
      throw new Error('No lorebook attached');
    }

    const registryState = ensureRegistryState();
    const items = buildRegistryItemsForType(registryState, entityType);

    // Update registry content
    await updateRegistryEntryContent(lorebookName, entityType, items);

    // Save metadata
    saveMetadata();

    debug(SUBSYSTEM.QUEUE, `✓ Updated registry for type ${entityType}`);

    // Reorder entries alphabetically after successful create/merge
    await reorderLorebookEntriesAlphabetically(lorebookName);

    // Complete pending entry (cleanup)
    completePendingEntry(entryId);

    // Show success toast
    const comment = entryData?.comment || 'Entry';
    toast(`✓ Lorebook ${action}: ${comment}`, 'success');

    return { success: true };
  });

  // UPDATE_LOREBOOK_SNAPSHOT - Update scene lorebook snapshot after all entries are created
  registerOperationHandler(OperationType.UPDATE_LOREBOOK_SNAPSHOT, async (operation) => {
    const { messageIndex } = operation.params;
    debug(SUBSYSTEM.QUEUE, `Executing UPDATE_LOREBOOK_SNAPSHOT for scene ${messageIndex}`);

    if (messageIndex !== undefined) {
      await updateSceneLorebookSnapshot(messageIndex);
    }

    return { success: true };
  });

  registerOperationHandler(OperationType.POPULATE_REGISTRIES, async (operation) => {
    const { entries, lorebookName } = operation.params;
    const signal = getAbortSignal(operation);

    debug(SUBSYSTEM.QUEUE, `Executing POPULATE_REGISTRIES for ${entries.length} entries`);

    const bulkPopulateConfig = await resolveOperationConfig('auto_lorebooks_bulk_populate');

    const settings = {
      bulk_populate_prompt: bulkPopulateConfig.prompt,
      bulk_populate_prefill: bulkPopulateConfig.prefill,
      bulk_populate_connection_profile: bulkPopulateConfig.connection_profile,
      bulk_populate_completion_preset: bulkPopulateConfig.completion_preset_name,
      bulk_populate_include_preset_prompts: bulkPopulateConfig.include_preset_prompts
    };

    const typeList = getEntityTypeDefinitionsFromSettings(extension_settings?.auto_recap);

    const result = await runBulkRegistryPopulation(entries, typeList, settings);
    const results = result?.results || result;
    const tokenBreakdown = result?.tokenBreakdown;

    throwIfAborted(signal, 'POPULATE_REGISTRIES', 'LLM call');

    // Store token breakdown in operation metadata
    if (tokenBreakdown) {
      const { formatTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
      const tokenMetadata = formatTokenBreakdownForMetadata(tokenBreakdown, {
        max_context: tokenBreakdown.max_context,
        max_tokens: tokenBreakdown.max_tokens
      });
      await updateOperationMetadata(operation.id, tokenMetadata);
    }

    const entriesMap = new Map(entries.map((e) => [e.id, e]));
    await processBulkPopulateResults(results, lorebookName, entriesMap);

    debug(SUBSYSTEM.QUEUE, `✓ Populated registries for ${Array.isArray(results) ? results.length : 0} entries`);

    return { success: true, processedCount: Array.isArray(results) ? results.length : 0 };
  });

  log(SUBSYSTEM.QUEUE, 'Registered all operation handlers');
}

export default {
  registerAllOperationHandlers
};

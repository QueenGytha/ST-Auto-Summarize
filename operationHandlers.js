
// operationHandlers.js - Register and handle all queue operations

import {
  registerOperationHandler,
  OperationType,
  enqueueOperation,
  getAbortSignal,
  throwIfAborted,
  pauseQueue,
  getPendingOperations,
  removeOperation } from
'./operationQueue.js';
// Note: OPERATION_FETCH_TIMEOUT_MS no longer used after removing scene-name operation
import {
  validate_recap } from
'./recapValidation.js';
import {
  detectSceneBreak,
  validateSceneBreakResponse,
  messageMatchesType,
  validateRationaleNoFormatting } from
'./autoSceneBreakDetection.js';
import { generateSceneRecap, toggleSceneBreak, clearSceneBreak } from './sceneBreak.js';
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
  updateRegistryEntryContent,
  reorderLorebookEntriesAlphabetically } from
'./lorebookManager.js';
import { getConfiguredEntityTypeDefinitions } from './entityTypes.js';
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
  selectorsExtension } from
'./index.js';
import { saveMetadata } from '../../../../script.js';
import { queueCombineSceneWithRunning } from './queueIntegration.js';

const DEFAULT_MINIMUM_SCENE_LENGTH = 4;

function get_message_div(index) {
  return $(`div[mesid="${index}"]`);
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
async function handleBelowMinimumRejection({ operation, startIndex, endIndex, offset, sceneBreakAt, filteredIndices, minimumSceneLength, validation, chat }) {
  const earliestAllowedBreak = Array.isArray(filteredIndices) && filteredIndices.length > minimumSceneLength
    ? filteredIndices[minimumSceneLength]
    : null;

  if (typeof earliestAllowedBreak === 'number' && !Number.isNaN(earliestAllowedBreak)) {
    debug(
      SUBSYSTEM.QUEUE,
      `Scene break at ${sceneBreakAt} rejected (below minimum). Marking ${startIndex}-${earliestAllowedBreak - 1} as checked and retrying ${earliestAllowedBreak}-${endIndex}`
    );

    if (earliestAllowedBreak > startIndex) {
      markRangeAsChecked(chat, startIndex, earliestAllowedBreak - 1);
      saveChatDebounced();
    }

    await enqueueOperation(
      OperationType.DETECT_SCENE_BREAK,
      { startIndex: earliestAllowedBreak, endIndex, offset },
      {
        priority: 5,
        queueVersion: operation.queueVersion,
        metadata: {
          triggered_by: 'below_minimum_retry',
          earliest_allowed_break: earliestAllowedBreak
        }
      }
    );

    toast(`⚠ Early scene-break candidate rejected; retrying from ${earliestAllowedBreak}`, 'info');
    return { sceneBreakAt: false, rationale: `Rejected: ${validation.reason}; retrying from ${earliestAllowedBreak}` };
  }

  debug(SUBSYSTEM.QUEUE, `Scene break at ${sceneBreakAt} rejected (too close) - treating range ${startIndex}-${endIndex} as complete`);
  markRangeAsChecked(chat, startIndex, endIndex);
  saveChatDebounced();
  return { sceneBreakAt: false, rationale: `Rejected: ${validation.reason}` };
}

// Helper: Handle continuity veto check
async function handleContinuityVeto({ operation, chat, sceneBreakAt, rationale, startIndex, endIndex, offset, minimumSceneLength }) {
  try {
    const { shouldVetoByContinuityAndObjective } = await import('./autoSceneBreakDetection.js');
    const veto = shouldVetoByContinuityAndObjective(chat, sceneBreakAt, rationale, 2);
    if (veto) {
      debug(SUBSYSTEM.QUEUE, `Scene break at ${sceneBreakAt} vetoed by continuity/objective rule for range ${startIndex}-${endIndex}`);
      toast('⚠ Scene break rejected: continuity with no time/location/cast transition', 'info');

      markRangeAsChecked(chat, startIndex, sceneBreakAt);
      saveChatDebounced();

      const remainingStart = sceneBreakAt + 1;
      const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
      const remainingFiltered = countRemainingFilteredMessages(chat, remainingStart, endIndex, checkWhich);

      if (remainingFiltered >= minimumSceneLength + 1) {
        await enqueueOperation(
          OperationType.DETECT_SCENE_BREAK,
          { startIndex: remainingStart, endIndex, offset },
          {
            priority: 5,
            queueVersion: operation.queueVersion,
            metadata: { triggered_by: 'continuity_veto_retry' }
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

// eslint-disable-next-line max-lines-per-function -- Sequential operation handler registration for 10+ operation types (431 lines is acceptable for initialization)
export function registerAllOperationHandlers() {
  // Validate recap
  registerOperationHandler(OperationType.VALIDATE_RECAP, async (operation) => {
    const { recap, type } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing VALIDATE_RECAP for type ${type}`);

    const isValid = await validate_recap(recap, type);

    // Check if cancelled after validation (before potential side effects)
    throwIfAborted(signal, 'VALIDATE_RECAP', 'validation');

    return { isValid };
  });

  // Detect scene break (range-based)
  registerOperationHandler(OperationType.DETECT_SCENE_BREAK, async (operation) => {
    const { startIndex, endIndex, offset = 0 } = operation.params;
    const signal = getAbortSignal(operation);
    const ctx = getContext();
    const chat = ctx.chat;

    debug(SUBSYSTEM.QUEUE, `Executing DETECT_SCENE_BREAK for range ${startIndex} to ${endIndex} (offset: ${offset})`);
    const result = await detectSceneBreak(startIndex, endIndex, offset);

    // Check if cancelled after detection (before side effects)
    throwIfAborted(signal, 'DETECT_SCENE_BREAK', 'LLM call');

    const { sceneBreakAt, rationale, filteredIndices, maxEligibleIndex } = result;

    // Enforce content-only rationale (no formatting references like '---')
    const rationaleCheck = validateRationaleNoFormatting(rationale);
    if (!rationaleCheck.valid) {
      return await handleFormattingRationaleRejection({ operation, startIndex, endIndex, offset, rationale });
    }

    const minimumSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;

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
        return await handleBelowMinimumRejection({ operation, startIndex, endIndex, offset, sceneBreakAt, filteredIndices, minimumSceneLength, validation, chat });
      }

      error(SUBSYSTEM.QUEUE, `Invalid scene break response for range ${startIndex}-${endIndex}: ${validation.reason}`);
      error(SUBSYSTEM.QUEUE, `  sceneBreakAt: ${sceneBreakAt}, rationale: ${rationale}`);
      toast(`⚠ Invalid scene break detection response - will retry`, 'warning');
      return { sceneBreakAt: false, rationale: `Invalid: ${validation.reason}` };
    }

    if (sceneBreakAt === false) {
      // No scene break found - mark entire range as checked
      debug(SUBSYSTEM.QUEUE, `✗ No scene break found in range ${startIndex} to ${endIndex}`);
      markRangeAsChecked(chat, startIndex, endIndex);
      saveChatDebounced();
      return result;
    }

    // Continuity veto + objective-only rule
    const vetoResult = await handleContinuityVeto({ operation, chat, sceneBreakAt, rationale, startIndex, endIndex, offset, minimumSceneLength });
    if (vetoResult.vetoed) {
      return vetoResult.result;
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

    // Queue new detection for remaining range if there are enough messages
    if (sceneBreakAt < endIndex) {
      const remainingStart = sceneBreakAt + 1;
      const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
      const remainingFiltered = countRemainingFilteredMessages(chat, remainingStart, endIndex, checkWhich);

      if (remainingFiltered >= minimumSceneLength + 1) {
        debug(SUBSYSTEM.QUEUE, `Enqueueing DETECT_SCENE_BREAK for remaining range ${remainingStart} to ${endIndex}`);
        await enqueueOperation(
          OperationType.DETECT_SCENE_BREAK,
          { startIndex: remainingStart, endIndex, offset },
          {
            priority: 5,
            queueVersion: operation.queueVersion,
            metadata: { triggered_by: 'scene_break_found_in_range' }
          }
        );
      } else {
        debug(SUBSYSTEM.QUEUE, `Not enough remaining messages (${remainingFiltered} < ${minimumSceneLength + 1}) - not queuing new detection`);
      }
    }

    // Auto-generate scene recap if enabled
    if (get_settings('auto_scene_break_generate_recap')) {
      debug(SUBSYSTEM.QUEUE, `Enqueueing GENERATE_SCENE_RECAP for message ${sceneBreakAt}`);
      const recapOpId = await enqueueOperation(
        OperationType.GENERATE_SCENE_RECAP,
        { index: sceneBreakAt },
        {
          priority: 20, // Highest priority
          queueVersion: operation.queueVersion,
          metadata: {
            scene_index: sceneBreakAt,
            triggered_by: 'auto_scene_break_detection'
          }
        }
      );
      debug(SUBSYSTEM.QUEUE, `✓ Enqueued GENERATE_SCENE_RECAP (${recapOpId ?? 'null'}) for message ${sceneBreakAt}`);
    }

    return result;
  });

  // Generate scene recap
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
        signal // Pass abort signal to check before side effects
      });

      // Check if operation was cancelled during execution
      throwIfAborted(signal, 'GENERATE_SCENE_RECAP', 'LLM call');

      toast(`✓ Scene recap generated for message ${index}`, 'success');

      // Scene naming is now embedded in the scene recap output (scene_name field)

      // Queue running recap combine as a separate operation, depending on lorebook operations
      if (get_settings('running_scene_recap_auto_generate')) {
        debug(SUBSYSTEM.QUEUE, `Queueing COMBINE_SCENE_WITH_RUNNING for scene at index ${index} (depends on ${result.lorebookOpIds.length} lorebook operations)`);
        await queueCombineSceneWithRunning(index, {
          dependencies: result.lorebookOpIds,
          queueVersion: operation.queueVersion
        });
      }

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
          debug(SUBSYSTEM.QUEUE, `Queueing new DETECT_SCENE_BREAK for range ${startIndex} to ${newEndIndex} after token limit failure`);
          await enqueueOperation(
            OperationType.DETECT_SCENE_BREAK,
            { startIndex, endIndex: newEndIndex, offset: 0 },
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

  // Standalone scene name generation operation removed.

  // Generate running recap (bulk)
  registerOperationHandler(OperationType.GENERATE_RUNNING_RECAP, async (operation) => {
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing GENERATE_RUNNING_RECAP`);

    const recap = await generate_running_scene_recap(true);

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'GENERATE_RUNNING_RECAP', 'LLM call');

    return { recap };
  });

  // Combine scene with running recap
  registerOperationHandler(OperationType.COMBINE_SCENE_WITH_RUNNING, async (operation) => {
    const { index } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing COMBINE_SCENE_WITH_RUNNING for index ${index}`);

    const recap = await combine_scene_with_running_recap(index);

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'COMBINE_SCENE_WITH_RUNNING', 'LLM call');

    return { recap };
  });

  // Merge lorebook entry (standalone operation)
  registerOperationHandler(OperationType.MERGE_LOREBOOK_ENTRY, async (operation) => {
    const { lorebookName, entryUid, existingContent, newContent, newKeys, newSecondaryKeys } = operation.params;
    const signal = getAbortSignal(operation);
    const entryComment = operation.metadata?.entry_comment || entryUid;
    debug(SUBSYSTEM.QUEUE, `Executing MERGE_LOREBOOK_ENTRY for: ${entryComment}`);

    const result = await mergeLorebookEntryByUid({
      lorebookName,
      entryUid,
      existingContent,
      newContent,
      newKeys,
      newSecondaryKeys
    });

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'MERGE_LOREBOOK_ENTRY', 'LLM call');

    return result;
  });

  // LOREBOOK_ENTRY_LOOKUP - First stage of lorebook processing pipeline
  // Pipeline state machine: determines next stage based on AI results
  // eslint-disable-next-line complexity -- Pipeline state machine with multiple conditional branches based on AI results
  registerOperationHandler(OperationType.LOREBOOK_ENTRY_LOOKUP, async (operation) => {
    const { entryId, entryData, registryListing, typeList } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] ⚙️ Starting for: ${entryData.comment || 'Unknown'}, entryId: ${entryId}`);
    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Operation ID: ${operation.id}, Status: ${operation.status}`);

    // Build settings from profile
    const settings = {
      merge_connection_profile: get_settings('auto_lorebooks_recap_merge_connection_profile') || '',
      merge_completion_preset: get_settings('auto_lorebooks_recap_merge_completion_preset') || '',
      merge_prefill: get_settings('auto_lorebooks_recap_merge_prefill') || '',
      merge_prompt: get_settings('auto_lorebooks_recap_merge_prompt') || '',
      lorebook_entry_lookup_connection_profile: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_connection_profile') || '',
      lorebook_entry_lookup_completion_preset: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_completion_preset') || '',
      lorebook_entry_lookup_prefill: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_prefill') || '',
      lorebook_entry_lookup_prompt: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_prompt') || '',
      lorebook_entry_deduplicate_connection_profile: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_connection_profile') || '',
      lorebook_entry_deduplicate_completion_preset: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_completion_preset') || '',
      lorebook_entry_deduplicate_prefill: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_prefill') || '',
      lorebook_entry_deduplicate_prompt: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_prompt') || '',
      merge_include_preset_prompts: get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false,
      lorebook_entry_lookup_include_preset_prompts: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_include_preset_prompts') ?? false,
      lorebook_entry_deduplicate_include_preset_prompts: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_include_preset_prompts') ?? false,
      skip_duplicates: get_settings('auto_lorebooks_recap_skip_duplicates') ?? true
    };

    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Settings - skip_duplicates: ${settings.skip_duplicates}`);

    // Run lorebook entry lookup
    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Running lookup stage...`);
    const lorebookEntryLookupResult = await runLorebookEntryLookupStage(entryData, registryListing, typeList, settings);

    // Check if cancelled after LLM call (before side effects)
    throwIfAborted(signal, 'LOREBOOK_ENTRY_LOOKUP', 'LLM call');

    // Store lorebook entry lookup result in pending ops
    setLorebookEntryLookupResult(entryId, lorebookEntryLookupResult);
    markStageInProgress(entryId, 'lorebook_entry_lookup_complete');

    debug(SUBSYSTEM.QUEUE, `✓ Lorebook Entry Lookup complete for ${entryId}: type=${lorebookEntryLookupResult.type}, sameUids=${lorebookEntryLookupResult.sameEntityUids.length}, needsUids=${lorebookEntryLookupResult.needsFullContextUids.length}`);

    // Enqueue next operation based on lorebook entry lookup result
    if (lorebookEntryLookupResult.needsFullContextUids && lorebookEntryLookupResult.needsFullContextUids.length > 0) {
      // Need lorebook entry deduplication - capture settings at enqueue time
      const deduplicatePrefill = get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_prefill') || '';
      const deduplicateIncludePresetPrompts = get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_include_preset_prompts') ?? false;

      await enqueueOperation(
        OperationType.RESOLVE_LOREBOOK_ENTRY,
        { entryId },
        {
          priority: 12,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            hasPrefill: Boolean(deduplicatePrefill && deduplicatePrefill.trim().length > 0),
            includePresetPrompts: deduplicateIncludePresetPrompts
          }
        }
      );
    } else if (lorebookEntryLookupResult.sameEntityUids.length === 1) {
      // Exact match found - merge - capture merge settings at enqueue time
      const resolvedUid = lorebookEntryLookupResult.sameEntityUids[0];
      setLorebookEntryDeduplicateResult(entryId, { resolvedUid, synopsis: lorebookEntryLookupResult.synopsis });
      markStageInProgress(entryId, 'lorebook_entry_deduplicate_complete');

      const mergePrefill = get_settings('auto_lorebooks_recap_merge_prefill') || '';
      const mergeIncludePresetPrompts = get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false;

      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'merge', resolvedUid },
        {
          priority: 14,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            hasPrefill: Boolean(mergePrefill && mergePrefill.trim().length > 0),
            includePresetPrompts: mergeIncludePresetPrompts
          }
        }
      );
    } else {
      // No match - create new (no prefill/preset prompts for create operations)
      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'create' },
        {
          priority: 14,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            hasPrefill: false,
            includePresetPrompts: false
          }
        }
      );
    }

    return { success: true, lorebookEntryLookupResult };
  });

  // RESOLVE_LOREBOOK_ENTRY - Second stage (conditional) - get full context for uncertain matches
  // Pipeline state machine: determines next stage based on AI results
  // eslint-disable-next-line complexity -- Pipeline state machine with multiple conditional branches based on AI results
  registerOperationHandler(OperationType.RESOLVE_LOREBOOK_ENTRY, async (operation) => {
    const { entryId } = operation.params;
    const signal = getAbortSignal(operation);
    const entryData = getEntryData(entryId);
    const lorebookEntryLookupResult = getLorebookEntryLookupResult(entryId);

    if (!entryData || !lorebookEntryLookupResult) {
      throw new Error(`Missing pending data for entry ${entryId}`);
    }

    debug(SUBSYSTEM.QUEUE, `Executing RESOLVE_LOREBOOK_ENTRY for: ${entryData.comment || 'Unknown'}`);

    // Build settings from profile
    const settings = {
      merge_connection_profile: get_settings('auto_lorebooks_recap_merge_connection_profile') || '',
      merge_completion_preset: get_settings('auto_lorebooks_recap_merge_completion_preset') || '',
      merge_prefill: get_settings('auto_lorebooks_recap_merge_prefill') || '',
      merge_prompt: get_settings('auto_lorebooks_recap_merge_prompt') || '',
      lorebook_entry_lookup_connection_profile: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_connection_profile') || '',
      lorebook_entry_lookup_completion_preset: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_completion_preset') || '',
      lorebook_entry_lookup_prefill: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_prefill') || '',
      lorebook_entry_lookup_prompt: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_prompt') || '',
      lorebook_entry_deduplicate_connection_profile: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_connection_profile') || '',
      lorebook_entry_deduplicate_completion_preset: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_completion_preset') || '',
      lorebook_entry_deduplicate_prefill: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_prefill') || '',
      lorebook_entry_deduplicate_prompt: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_prompt') || '',
      merge_include_preset_prompts: get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false,
      lorebook_entry_lookup_include_preset_prompts: get_settings('auto_lorebooks_recap_lorebook_entry_lookup_include_preset_prompts') ?? false,
      lorebook_entry_deduplicate_include_preset_prompts: get_settings('auto_lorebooks_recap_lorebook_entry_deduplicate_include_preset_prompts') ?? false,
      skip_duplicates: get_settings('auto_lorebooks_recap_skip_duplicates') ?? true
    };

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

    // Store lorebook entry deduplicate result
    setLorebookEntryDeduplicateResult(entryId, lorebookEntryDeduplicateResult);
    markStageInProgress(entryId, 'lorebook_entry_deduplicate_complete');

    debug(SUBSYSTEM.QUEUE, `✓ LorebookEntryDeduplicate complete for ${entryId}: resolvedUid=${lorebookEntryDeduplicateResult.resolvedUid || 'new'}`);

    // Enqueue next operation - capture settings at enqueue time
    if (lorebookEntryDeduplicateResult.resolvedUid) {
      // Match found - merge
      const mergePrefill = get_settings('auto_lorebooks_recap_merge_prefill') || '';
      const mergeIncludePresetPrompts = get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false;

      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'merge', resolvedUid: lorebookEntryDeduplicateResult.resolvedUid },
        {
          priority: 10,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            hasPrefill: Boolean(mergePrefill && mergePrefill.trim().length > 0),
            includePresetPrompts: mergeIncludePresetPrompts
          }
        }
      );
    } else {
      // No match - create new (no prefill/preset prompts for create operations)
      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'create' },
        {
          priority: 14,
          queueVersion: operation.queueVersion,
          metadata: {
            entry_comment: entryData.comment,
            hasPrefill: false,
            includePresetPrompts: false
          }
        }
      );
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

    const mergeResult = await contextMergeLorebookEntry(lorebookName, existingEntry, entryData, { useQueue: false });

    // Check if cancelled after LLM call (before side effects)
    throwIfAborted(signal, 'CREATE_LOREBOOK_ENTRY (merge)', 'LLM call');

    if (!mergeResult?.success) {
      throw new Error(mergeResult?.message || 'Merge failed');
    }

    contextUpdateRegistryRecord(registryState, resolvedUid, {
      type: finalType,
      name: entryData.comment || existingEntry.comment || '',
      comment: entryData.comment || existingEntry.comment || '',
      aliases: contextEnsureStringArray(entryData.keys),
      synopsis: finalSynopsis
    });

    debug(SUBSYSTEM.QUEUE, `✓ Merged entry ${entryId} into ${resolvedUid}`);

    return { success: true, entityId: resolvedUid, entityUid: existingEntry.uid, action: 'merged' };
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
      // Pause the queue and throw an explicit error
      await pauseQueue();
      throw new Error(`DUPLICATE DETECTED: Cannot create entry for "${targetName}" (${finalType}). Existing entry UID=${dup.uid}, comment="${dup.comment}"`);
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
    }

    if (!result.success || !result.entityId || result.entityUid === undefined || result.entityUid === null) {
      throw new Error('Failed to create or merge entry');
    }

    // Enqueue registry update
    await enqueueOperation(
      OperationType.UPDATE_LOREBOOK_REGISTRY,
      { entryId: context.entryId, entityType: context.finalType, entityId: result.entityId, action: result.action },
      { priority: 14, queueVersion: operation.queueVersion, metadata: { entry_comment: context.entryData.comment } }
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

  registerOperationHandler(OperationType.POPULATE_REGISTRIES, async (operation) => {
    const { entries, lorebookName } = operation.params;
    const signal = getAbortSignal(operation);

    debug(SUBSYSTEM.QUEUE, `Executing POPULATE_REGISTRIES for ${entries.length} entries`);

    const settings = {
      bulk_populate_prompt: get_settings('auto_lorebooks_bulk_populate_prompt'),
      bulk_populate_prefill: get_settings('auto_lorebooks_bulk_populate_prefill'),
      bulk_populate_connection_profile: get_settings('auto_lorebooks_bulk_populate_connection_profile'),
      bulk_populate_completion_preset: get_settings('auto_lorebooks_bulk_populate_completion_preset'),
      bulk_populate_include_preset_prompts: get_settings('auto_lorebooks_bulk_populate_include_preset_prompts')
    };

    const typeList = getConfiguredEntityTypeDefinitions().
    map((def) => def.name).
    filter(Boolean).
    join('|');

    const results = await runBulkRegistryPopulation(entries, typeList, settings);

    throwIfAborted(signal, 'POPULATE_REGISTRIES', 'LLM call');

    const entriesMap = new Map(entries.map((e) => [e.id, e]));
    await processBulkPopulateResults(results, lorebookName, entriesMap);

    debug(SUBSYSTEM.QUEUE, `✓ Populated registries for ${results.length} entries`);

    return { success: true, processedCount: results.length };
  });

  log(SUBSYSTEM.QUEUE, 'Registered all operation handlers');
}

export default {
  registerAllOperationHandlers
};


// operationHandlers.js - Register and handle all queue operations

import {
  registerOperationHandler,
  OperationType,
  enqueueOperation,
  getAbortSignal,
  throwIfAborted } from
'./operationQueue.js';
// Note: OPERATION_FETCH_TIMEOUT_MS no longer used after removing scene-name operation
import {
  validate_recap } from
'./recapValidation.js';
import {
  detectSceneBreak,
  validateSceneBreakResponse,
  messageMatchesType } from
'./autoSceneBreakDetection.js';
import { generateSceneRecap, toggleSceneBreak } from './sceneBreak.js';
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
    const { startIndex, endIndex } = operation.params;
    const signal = getAbortSignal(operation);
    const ctx = getContext();
    const chat = ctx.chat;

    debug(SUBSYSTEM.QUEUE, `Executing DETECT_SCENE_BREAK for range ${startIndex} to ${endIndex}`);
    const result = await detectSceneBreak(startIndex, endIndex);

    // Check if cancelled after detection (before side effects)
    throwIfAborted(signal, 'DETECT_SCENE_BREAK', 'LLM call');

    const { sceneBreakAt, rationale, filteredIndices } = result;
    const minimumSceneLength = Number(get_settings('auto_scene_break_minimum_scene_length')) || DEFAULT_MINIMUM_SCENE_LENGTH;

    // Validate the response
    const validation = validateSceneBreakResponse(sceneBreakAt, startIndex, endIndex, filteredIndices, minimumSceneLength);

    if (!validation.valid) {
      // Invalid response - don't mark as checked (allows retry)
      error(SUBSYSTEM.QUEUE, `Invalid scene break response for range ${startIndex}-${endIndex}: ${validation.reason}`);
      error(SUBSYSTEM.QUEUE, `  sceneBreakAt: ${sceneBreakAt}, rationale: ${rationale}`);
      toast(`⚠ Invalid scene break detection response - will retry`, 'warning');
      return { sceneBreakAt: false, rationale: `Invalid: ${validation.reason}` };
    }

    if (sceneBreakAt === false) {
      // No scene break found - mark entire range as checked
      debug(SUBSYSTEM.QUEUE, `✗ No scene break found in range ${startIndex} to ${endIndex}`);
      for (let i = startIndex; i <= endIndex; i++) {
        const msg = chat[i];
        if (msg) {
          set_data(msg, 'auto_scene_break_checked', true);
        }
      }
      saveChatDebounced();
      return result;
    }

    // Valid scene break detected at sceneBreakAt
    debug(SUBSYSTEM.QUEUE, `✓ Scene break detected at message ${sceneBreakAt}`);
    const rationaleText = rationale ? ` - ${rationale}` : '';
    toast(`✓ Scene break at message ${sceneBreakAt}${rationaleText}`, 'success');

    // Place the scene break marker
    toggleSceneBreak(sceneBreakAt, get_message_div, getContext, set_data, get_data, saveChatDebounced);

    // Mark messages from startIndex to sceneBreakAt (inclusive) as checked
    for (let i = startIndex; i <= sceneBreakAt; i++) {
      const msg = chat[i];
      if (msg) {
        set_data(msg, 'auto_scene_break_checked', true);
      }
    }
    saveChatDebounced();

    // Queue new detection for remaining range if there are enough messages
    if (sceneBreakAt < endIndex) {
      const remainingStart = sceneBreakAt + 1;
      const remainingEnd = endIndex;

      // Count filtered messages in remaining range
      const checkWhich = get_settings('auto_scene_break_check_which_messages') || 'both';
      let remainingFiltered = 0;
      for (let i = remainingStart; i <= remainingEnd; i++) {
        const msg = chat[i];
        if (msg && messageMatchesType(msg, checkWhich)) {
          remainingFiltered++;
        }
      }

      // Only queue if we have enough messages (minimum + 1)
      if (remainingFiltered >= minimumSceneLength + 1) {
        debug(SUBSYSTEM.QUEUE, `Enqueueing DETECT_SCENE_BREAK for remaining range ${remainingStart} to ${remainingEnd}`);
        await enqueueOperation(
          OperationType.DETECT_SCENE_BREAK,
          { startIndex: remainingStart, endIndex: remainingEnd },
          {
            priority: 5, // Same priority as scene break detection
            queueVersion: operation.queueVersion,
            metadata: {
              triggered_by: 'scene_break_found_in_range'
            }
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

    debug(SUBSYSTEM.QUEUE, `✓ Lorebook Entry Lookup complete for ${entryId}: type=${lorebookEntryLookupResult.type}, sameIds=${lorebookEntryLookupResult.sameEntityIds.length}, needsIds=${lorebookEntryLookupResult.needsFullContextIds.length}`);

    // Enqueue next operation based on lorebook entry lookup result
    if (lorebookEntryLookupResult.needsFullContextIds && lorebookEntryLookupResult.needsFullContextIds.length > 0) {
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
    } else if (lorebookEntryLookupResult.sameEntityIds.length === 1) {
      // Exact match found - merge - capture merge settings at enqueue time
      const resolvedId = lorebookEntryLookupResult.sameEntityIds[0];
      setLorebookEntryDeduplicateResult(entryId, { resolvedId, synopsis: lorebookEntryLookupResult.synopsis });
      markStageInProgress(entryId, 'lorebook_entry_deduplicate_complete');

      const mergePrefill = get_settings('auto_lorebooks_recap_merge_prefill') || '';
      const mergeIncludePresetPrompts = get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false;

      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'merge', resolvedId },
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
    ...lorebookEntryLookupResult.sameEntityIds,
    ...lorebookEntryLookupResult.needsFullContextIds]
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

    debug(SUBSYSTEM.QUEUE, `✓ LorebookEntryDeduplicate complete for ${entryId}: resolvedId=${lorebookEntryDeduplicateResult.resolvedId || 'new'}`);

    // Enqueue next operation - capture settings at enqueue time
    if (lorebookEntryDeduplicateResult.resolvedId) {
      // Match found - merge
      const mergePrefill = get_settings('auto_lorebooks_recap_merge_prefill') || '';
      const mergeIncludePresetPrompts = get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false;

      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'merge', resolvedId: lorebookEntryDeduplicateResult.resolvedId },
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
    const { entryId, action, resolvedId } = operation.params;
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
      entryId, action, resolvedId, entryData, lorebookName,
      registryState, finalType, finalSynopsis, signal,
      contextGetLorebookEntries: getLorebookEntries, contextAddLorebookEntry: addLorebookEntry, contextMergeLorebookEntry: mergeLorebookEntry,
      contextUpdateRegistryRecord: updateRegistryRecord, contextEnsureStringArray: ensureStringArray
    };
  }

  async function executeMergeAction(context ) {
    const { resolvedId, entryData, lorebookName, registryState, finalType, finalSynopsis,
      contextGetLorebookEntries, contextMergeLorebookEntry, contextUpdateRegistryRecord, contextEnsureStringArray, entryId, signal } = context;

    const existingEntriesRaw = await contextGetLorebookEntries(lorebookName);
    const record = registryState.index?.[resolvedId];
    const existingEntry = record ? existingEntriesRaw?.find((e) => e.uid === record.uid) : null;

    if (!record || !existingEntry) {
      return { success: false, fallbackToCreate: true };
    }

    const mergeResult = await contextMergeLorebookEntry(lorebookName, existingEntry, entryData, { useQueue: false });

    // Check if cancelled after LLM call (before side effects)
    throwIfAborted(signal, 'CREATE_LOREBOOK_ENTRY (merge)', 'LLM call');

    if (!mergeResult?.success) {
      throw new Error(mergeResult?.message || 'Merge failed');
    }

    contextUpdateRegistryRecord(registryState, resolvedId, {
      type: finalType,
      name: entryData.comment || existingEntry.comment || '',
      comment: entryData.comment || existingEntry.comment || '',
      aliases: contextEnsureStringArray(entryData.keys),
      synopsis: finalSynopsis
    });

    debug(SUBSYSTEM.QUEUE, `✓ Merged entry ${entryId} into ${resolvedId}`);

    return { success: true, entityId: resolvedId, entityUid: existingEntry.uid, action: 'merged' };
  }

  async function executeCreateAction(context ) {
    const { entryData, lorebookName, registryState, finalType, finalSynopsis,
      contextAddLorebookEntry, contextUpdateRegistryRecord, contextEnsureStringArray, entryId } = context;

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
    if (context.action === 'merge' && context.resolvedId) {
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

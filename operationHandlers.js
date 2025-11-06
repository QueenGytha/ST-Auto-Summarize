
// operationHandlers.js - Register and handle all queue operations

import {
  registerOperationHandler,
  OperationType,
  enqueueOperation,
  getAbortSignal,
  throwIfAborted } from
'./operationQueue.js';
import {
  validate_summary } from
'./summaryValidation.js';
import {
  detectSceneBreak,
  isCooldownSkip } from
'./autoSceneBreakDetection.js';
import {
  generateSceneSummary,
  toggleSceneBreak,
  autoGenerateSceneNameFromSummary } from
'./sceneBreak.js';
import {
  generate_running_scene_summary,
  combine_scene_with_running_summary } from
'./runningSceneSummary.js';
import {
  runLorebookEntryLookupStage,
  runLorebookEntryDeduplicateStage,
  buildCandidateEntriesData,
  ensureRegistryState,
  updateRegistryRecord,
  assignEntityId,
  ensureStringArray,
  buildRegistryItemsForType } from
'./summaryToLorebookProcessor.js';
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
import {
  getContext,
  get_data,
  set_data,
  saveChatDebounced,
  get_settings,
  debug,
  log,
  toast,
  SUBSYSTEM,
  selectorsExtension } from
'./index.js';
import { saveMetadata } from '../../../../script.js';

function get_message_div(index) {
  return $(`div[mesid="${index}"]`);
}

export function registerAllOperationHandlers() {
  // Validate summary
  registerOperationHandler(OperationType.VALIDATE_SUMMARY, async (operation) => {
    const { summary, type } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing VALIDATE_SUMMARY for type ${type}`);

    const isValid = await validate_summary(summary, type);

    // Check if cancelled after validation (before potential side effects)
    throwIfAborted(signal, 'VALIDATE_SUMMARY', 'validation');

    return { isValid };
  });

  // Detect scene break
  registerOperationHandler(OperationType.DETECT_SCENE_BREAK, async (operation) => {
    const { index } = operation.params;
    const signal = getAbortSignal(operation);
    const ctx = getContext();
    const chat = ctx.chat;

    // Check cooldown at execution time (scene breaks may have been added after queueing)
    if (isCooldownSkip(chat, index, false)) {
      debug(SUBSYSTEM.QUEUE, `Skipping DETECT_SCENE_BREAK at index ${index} - cooldown (execution-time check)`);
      return {
        isSceneBreak: false,
        rationale: 'Skipped due to cooldown - immediately follows a scene break'
      };
    }

    const message = chat[index];
    const previousMessage = index > 0 ? chat[index - 1] : null;

    debug(SUBSYSTEM.QUEUE, `Executing DETECT_SCENE_BREAK for index ${index}`);
    const result = await detectSceneBreak(message, index, previousMessage);

    // Check if cancelled after detection (before side effects)
    throwIfAborted(signal, 'DETECT_SCENE_BREAK', 'LLM call');

    // If scene break detected, actually set it on the message
    if (result.isSceneBreak) {
      debug(SUBSYSTEM.QUEUE, `✓ Scene break detected for message ${index}, setting scene break marker`);
      const rationaleText = result.rationale ? ` - ${result.rationale}` : '';
      toast(`✓ Scene break at message ${index}${rationaleText}`, 'success');

      toggleSceneBreak(index, get_message_div, getContext, set_data, get_data, saveChatDebounced);

      // No decrementing cooldown needed; adjacency rule enforces skip for the immediate next message

      // Auto-generate scene summary if enabled - ENQUEUE as separate operation
      if (get_settings('auto_scene_break_generate_summary')) {
        debug(SUBSYSTEM.QUEUE, `Enqueueing GENERATE_SCENE_SUMMARY for message ${index}`);

        // Enqueue summary generation as next operation (highest priority)
        const summaryOpId = await enqueueOperation(
          OperationType.GENERATE_SCENE_SUMMARY,
          { index },
          {
            priority: 20, // Highest priority - process before all other operations
            queueVersion: operation.queueVersion,
            metadata: {
              scene_index: index,
              triggered_by: 'auto_scene_break_detection'
            }
          }
        );

        debug(SUBSYSTEM.QUEUE, `✓ Enqueued GENERATE_SCENE_SUMMARY (${summaryOpId ?? 'null'}) for message ${index}`);
      }
    } else {
      debug(SUBSYSTEM.QUEUE, `✗ No scene break for message ${index}`);
    }

    return result;
  });

  // Generate scene summary
  registerOperationHandler(OperationType.GENERATE_SCENE_SUMMARY, async (operation) => {
    const { index } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing GENERATE_SCENE_SUMMARY for index ${index}`);
    toast(`Generating scene summary for message ${index}...`, 'info');

    // Set loading state in summary box
    const $msgDiv = get_message_div(index);
    const $summaryBox = $msgDiv.find(selectorsExtension.sceneBreak.summaryBox);
    if ($summaryBox.length) {
      $summaryBox.val("Generating scene summary...");
    }

    const summary = await generateSceneSummary(
      index,
      get_message_div,
      getContext,
      get_data,
      set_data,
      saveChatDebounced,
      true, // skipQueue = true when called from queue handler
      signal // Pass abort signal to check before side effects
    );

    // Check if operation was cancelled during execution
    throwIfAborted(signal, 'GENERATE_SCENE_SUMMARY', 'LLM call');

    toast(`✓ Scene summary generated for message ${index}`, 'success');

    // Enqueue scene name generation if enabled
    const autoGenerateSceneName = get_settings('scene_summary_auto_name') ?? true;
    if (autoGenerateSceneName && summary) {
      debug(SUBSYSTEM.QUEUE, `Enqueueing GENERATE_SCENE_NAME for index ${index}`);
      enqueueOperation(OperationType.GENERATE_SCENE_NAME, {
        index,
        summary
      }, {
        priority: 5, // Lower priority than summary generation
        queueVersion: operation.queueVersion,
        metadata: {
          message_index: index,
          operation_source: 'scene_summary'
        }
      });
    }

    return { summary };
  });

  // Generate scene name from scene summary
  registerOperationHandler(OperationType.GENERATE_SCENE_NAME, async (operation) => {
    const { index, summary } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing GENERATE_SCENE_NAME for index ${index}`);

    const ctx = getContext();
    const chat = ctx.chat;
    const message = chat[index];

    if (!message) {
      throw new Error(`Message at index ${index} not found`);
    }

    if (!summary) {
      debug(SUBSYSTEM.QUEUE, `No summary provided for GENERATE_SCENE_NAME at index ${index}, skipping`);
      return { name: null };
    }

    // Wait 5 seconds before generating scene name (rate limiting)
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check if cancelled during delay
    throwIfAborted(signal, 'GENERATE_SCENE_NAME', 'rate limit delay');

    const name = await autoGenerateSceneNameFromSummary(
      summary,
      message,
      get_data,
      set_data,
      ctx,
      null, // savedProfiles not needed, function handles its own profile switching
      index // Pass index for context suffix
    );

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'GENERATE_SCENE_NAME', 'LLM call');

    return { name };
  });

  // Generate running summary (bulk)
  registerOperationHandler(OperationType.GENERATE_RUNNING_SUMMARY, async (operation) => {
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing GENERATE_RUNNING_SUMMARY`);

    const summary = await generate_running_scene_summary(true);

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'GENERATE_RUNNING_SUMMARY', 'LLM call');

    return { summary };
  });

  // Combine scene with running summary
  registerOperationHandler(OperationType.COMBINE_SCENE_WITH_RUNNING, async (operation) => {
    const { index } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `Executing COMBINE_SCENE_WITH_RUNNING for index ${index}`);

    const summary = await combine_scene_with_running_summary(index);

    // Check if cancelled after LLM call (before return)
    throwIfAborted(signal, 'COMBINE_SCENE_WITH_RUNNING', 'LLM call');

    return { summary };
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
  registerOperationHandler(OperationType.LOREBOOK_ENTRY_LOOKUP, async (operation) => {
    const { entryId, entryData, registryListing, typeList } = operation.params;
    const signal = getAbortSignal(operation);
    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] ⚙️ Starting for: ${entryData.comment || 'Unknown'}, entryId: ${entryId}`);
    debug(SUBSYSTEM.QUEUE, `[HANDLER LOREBOOK_ENTRY_LOOKUP] Operation ID: ${operation.id}, Status: ${operation.status}`);

    // Build settings from profile
    const settings = {
      merge_connection_profile: get_settings('auto_lorebooks_summary_merge_connection_profile') || '',
      merge_completion_preset: get_settings('auto_lorebooks_summary_merge_completion_preset') || '',
      merge_prefill: get_settings('auto_lorebooks_summary_merge_prefill') || '',
      merge_prompt: get_settings('auto_lorebooks_summary_merge_prompt') || '',
      lorebook_entry_lookup_connection_profile: get_settings('auto_lorebooks_summary_lorebook_entry_lookup_connection_profile') || '',
      lorebook_entry_lookup_completion_preset: get_settings('auto_lorebooks_summary_lorebook_entry_lookup_completion_preset') || '',
      lorebook_entry_lookup_prefill: get_settings('auto_lorebooks_summary_lorebook_entry_lookup_prefill') || '',
      lorebook_entry_lookup_prompt: get_settings('auto_lorebooks_summary_lorebook_entry_lookup_prompt') || '',
      lorebook_entry_deduplicate_connection_profile: get_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_connection_profile') || '',
      lorebook_entry_deduplicate_completion_preset: get_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_completion_preset') || '',
      lorebook_entry_deduplicate_prefill: get_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_prefill') || '',
      lorebook_entry_deduplicate_prompt: get_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_prompt') || '',
      skip_duplicates: get_settings('auto_lorebooks_summary_skip_duplicates') ?? true
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
      // Need lorebook entry deduplication
      await enqueueOperation(
        OperationType.RESOLVE_LOREBOOK_ENTRY,
        { entryId },
        { priority: 12, queueVersion: operation.queueVersion, metadata: { entry_comment: entryData.comment } }
      );
    } else if (lorebookEntryLookupResult.sameEntityIds.length === 1) {
      // Exact match found - merge
      const resolvedId = lorebookEntryLookupResult.sameEntityIds[0];
      setLorebookEntryDeduplicateResult(entryId, { resolvedId, synopsis: lorebookEntryLookupResult.synopsis });
      markStageInProgress(entryId, 'lorebook_entry_deduplicate_complete');

      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'merge', resolvedId },
        { priority: 14, queueVersion: operation.queueVersion, metadata: { entry_comment: entryData.comment } }
      );
    } else {
      // No match - create new
      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'create' },
        { priority: 14, queueVersion: operation.queueVersion, metadata: { entry_comment: entryData.comment } }
      );
    }

    return { success: true, lorebookEntryLookupResult };
  });

  // RESOLVE_LOREBOOK_ENTRY - Second stage (conditional) - get full context for uncertain matches
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
      merge_connection_profile: get_settings('auto_lorebooks_summary_merge_connection_profile') || '',
      merge_completion_preset: get_settings('auto_lorebooks_summary_merge_completion_preset') || '',
      merge_prefill: get_settings('auto_lorebooks_summary_merge_prefill') || '',
      merge_prompt: get_settings('auto_lorebooks_summary_merge_prompt') || '',
      lorebook_entry_lookup_connection_profile: get_settings('auto_lorebooks_summary_lorebook_entry_lookup_connection_profile') || '',
      lorebook_entry_lookup_completion_preset: get_settings('auto_lorebooks_summary_lorebook_entry_lookup_completion_preset') || '',
      lorebook_entry_lookup_prefill: get_settings('auto_lorebooks_summary_lorebook_entry_lookup_prefill') || '',
      lorebook_entry_lookup_prompt: get_settings('auto_lorebooks_summary_lorebook_entry_lookup_prompt') || '',
      lorebook_entry_deduplicate_connection_profile: get_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_connection_profile') || '',
      lorebook_entry_deduplicate_completion_preset: get_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_completion_preset') || '',
      lorebook_entry_deduplicate_prefill: get_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_prefill') || '',
      lorebook_entry_deduplicate_prompt: get_settings('auto_lorebooks_summary_lorebook_entry_deduplicate_prompt') || '',
      skip_duplicates: get_settings('auto_lorebooks_summary_skip_duplicates') ?? true
    };

    const lorebookName = getAttachedLorebook();

    if (!lorebookName) {
      throw new Error('No lorebook attached');
    }

    // Get existing entries to build candidate data
    const existingEntriesRaw = await getLorebookEntries(lorebookName);
    const existingEntriesMap  = new Map();
    existingEntriesRaw?.forEach((entry) => {
      if (entry && entry.uid !== undefined) {
        existingEntriesMap.set(String(entry.uid), entry);
      }
    });

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

    // Enqueue next operation
    if (lorebookEntryDeduplicateResult.resolvedId) {
      // Match found - merge
      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'merge', resolvedId: lorebookEntryDeduplicateResult.resolvedId },
        { priority: 10, queueVersion: operation.queueVersion, metadata: { entry_comment: entryData.comment } }
      );
    } else {
      // No match - create new
      await enqueueOperation(
        OperationType.CREATE_LOREBOOK_ENTRY,
        { entryId, action: 'create' },
        { priority: 14, queueVersion: operation.queueVersion, metadata: { entry_comment: entryData.comment } }
      );
    }

    return { success: true, lorebookEntryDeduplicateResult };
  });

  async function prepareEntryContext(operation ) {
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
      getLorebookEntries, addLorebookEntry, mergeLorebookEntry,
      updateRegistryRecord, assignEntityId, ensureStringArray
    };
  }

  async function executeMergeAction(context ) {
    const { resolvedId, entryData, lorebookName, registryState, finalType, finalSynopsis,
      getLorebookEntries, mergeLorebookEntry, updateRegistryRecord, ensureStringArray, entryId, signal } = context;

    const existingEntriesRaw = await getLorebookEntries(lorebookName);
    const record = registryState.index?.[resolvedId];
    const existingEntry = record ? existingEntriesRaw?.find((e) => e.uid === record.uid) : null;

    if (!record || !existingEntry) {
      return { success: false, fallbackToCreate: true };
    }

    const mergeResult = await mergeLorebookEntry(lorebookName, existingEntry, entryData, { useQueue: false });

    // Check if cancelled after LLM call (before side effects)
    throwIfAborted(signal, 'CREATE_LOREBOOK_ENTRY (merge)', 'LLM call');

    if (!mergeResult?.success) {
      throw new Error(mergeResult?.message || 'Merge failed');
    }

    updateRegistryRecord(registryState, resolvedId, {
      uid: existingEntry.uid,
      type: finalType,
      name: entryData.comment || existingEntry.comment || '',
      comment: entryData.comment || existingEntry.comment || '',
      aliases: ensureStringArray(entryData.keys),
      synopsis: finalSynopsis
    });

    debug(SUBSYSTEM.QUEUE, `✓ Merged entry ${entryId} into ${resolvedId}`);

    return { success: true, entityId: resolvedId, entityUid: existingEntry.uid, action: 'merged' };
  }

  async function executeCreateAction(context ) {
    const { entryData, lorebookName, registryState, finalType, finalSynopsis,
      addLorebookEntry, updateRegistryRecord, assignEntityId, ensureStringArray, entryId } = context;

    const createdEntry = await addLorebookEntry(lorebookName, entryData);

    if (!createdEntry) {
      throw new Error('Failed to create lorebook entry');
    }

    const entityId = assignEntityId(registryState, finalType);

    updateRegistryRecord(registryState, entityId, {
      uid: createdEntry.uid,
      type: finalType,
      name: entryData.comment || createdEntry.comment || '',
      comment: entryData.comment || createdEntry.comment || '',
      aliases: ensureStringArray(entryData.keys),
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

    if (!result.success || !result.entityId || !result.entityUid) {
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

  log(SUBSYSTEM.QUEUE, 'Registered all operation handlers');
}

export default {
  registerAllOperationHandlers
};
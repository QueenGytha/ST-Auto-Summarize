// @flow
// operationHandlers.js - Register and handle all queue operations

import {
    registerOperationHandler,
    OperationType,
    enqueueOperation,
} from './operationQueue.js';
import {
    summarize_message,
} from './summarization.js';
import {
    validate_summary,
} from './summaryValidation.js';
import {
    detectSceneBreak,
} from './autoSceneBreakDetection.js';
import {
    generateSceneSummary,
    toggleSceneBreak,
    SCENE_SUMMARY_HASH_KEY,
} from './sceneBreak.js';
import {
    generate_running_scene_summary,
    combine_scene_with_running_summary,
} from './runningSceneSummary.js';
import {
    processSingleLorebookEntry,
} from './summaryToLorebookProcessor.js';
import {
    mergeLorebookEntryByUid,
} from './lorebookEntryMerger.js';
import {
    getEntryData,
    getTriageResult,
    getResolutionResult,
    setTriageResult,
    setResolutionResult,
    markStageInProgress,
    completePendingEntry,
} from './lorebookPendingOps.js';
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
} from './index.js';

/**
 * Helper to get message div
 */
// $FlowFixMe[missing-local-annot]
function get_message_div(index) {
    // $FlowFixMe[cannot-resolve-name]
    return $(`div[mesid="${index}"]`);
}

/**
 * Register all operation handlers
 */
export function registerAllOperationHandlers() {
    // Summarize message
    registerOperationHandler(OperationType.SUMMARIZE_MESSAGE, async (operation) => {
        const { index } = operation.params;
        debug(SUBSYSTEM.QUEUE, `Executing SUMMARIZE_MESSAGE for index ${index}`);
        return await summarize_message(index);
    });

    // Validate summary
    registerOperationHandler(OperationType.VALIDATE_SUMMARY, async (operation) => {
        const { summary, type } = operation.params;
        debug(SUBSYSTEM.QUEUE, `Executing VALIDATE_SUMMARY for type ${type}`);
        const isValid = await validate_summary(summary, type);
        return { isValid };
    });

    // Detect scene break
    registerOperationHandler(OperationType.DETECT_SCENE_BREAK, async (operation) => {
        const { index } = operation.params;
        const ctx = getContext();
        const message = ctx.chat[index];
        const previousMessage = index > 0 ? ctx.chat[index - 1] : null;

        debug(SUBSYSTEM.QUEUE, `Executing DETECT_SCENE_BREAK for index ${index}`);
        const result = await detectSceneBreak(message, index, previousMessage);

        // If scene break detected, actually set it on the message
        if (result.isSceneBreak) {
            debug(SUBSYSTEM.QUEUE, `✓ Scene break detected for message ${index}, setting scene break marker`);
            const rationaleText = result.rationale ? ` - ${result.rationale}` : '';
            toast(`✓ Scene break at message ${index}${rationaleText}`, 'success');

            toggleSceneBreak(index, get_message_div, getContext, set_data, get_data, saveChatDebounced);

            // Auto-generate scene summary if enabled - ENQUEUE as separate operation
            if (get_settings('auto_scene_break_generate_summary')) {
                debug(SUBSYSTEM.QUEUE, `Enqueueing GENERATE_SCENE_SUMMARY for message ${index}`);

                // Enqueue summary generation as next operation (high priority so it runs before more detections)
                const summaryOpId = await enqueueOperation(
                    OperationType.GENERATE_SCENE_SUMMARY,
                    { index },
                    {
                        priority: 10, // High priority - process before more detections
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
        debug(SUBSYSTEM.QUEUE, `Executing GENERATE_SCENE_SUMMARY for index ${index}`);
        toast(`Generating scene summary for message ${index}...`, 'info');

        // Set loading state in summary box
        const $msgDiv = get_message_div(index);
        const $summaryBox = $msgDiv.find('.scene-summary-box');
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
            true  // skipQueue = true when called from queue handler
        );

        toast(`✓ Scene summary generated for message ${index}`, 'success');
        return { summary };
    });

    // Generate scene name (handled within scene summary generation)
    registerOperationHandler(OperationType.GENERATE_SCENE_NAME, async (operation) => {
        const { index } = operation.params;
        debug(SUBSYSTEM.QUEUE, `Executing GENERATE_SCENE_NAME for index ${index}`);
        // Scene name generation is integrated into generateSceneSummary
        // This handler is a placeholder for future standalone implementation
        return { name: '' };
    });

    // Generate running summary (bulk)
    registerOperationHandler(OperationType.GENERATE_RUNNING_SUMMARY, async (_operation) => {
        debug(SUBSYSTEM.QUEUE, `Executing GENERATE_RUNNING_SUMMARY`);
        const summary = await generate_running_scene_summary(true);
        return { summary };
    });

    // Combine scene with running summary
    registerOperationHandler(OperationType.COMBINE_SCENE_WITH_RUNNING, async (operation) => {
        const { index } = operation.params;
        debug(SUBSYSTEM.QUEUE, `Executing COMBINE_SCENE_WITH_RUNNING for index ${index}`);
        const summary = await combine_scene_with_running_summary(index);
        return { summary };
    });

    // Process single lorebook entry
    registerOperationHandler(OperationType.PROCESS_LOREBOOK_ENTRY, async (operation) => {
        const { entryData, messageIndex, summaryHash } = operation.params;

        if (typeof messageIndex === 'number' && summaryHash) {
            const ctx = getContext();
            const chat = (ctx && ctx.chat) ? ctx.chat : [];
            const message = chat[messageIndex];
            if (message) {
                const currentHash = get_data(message, SCENE_SUMMARY_HASH_KEY);
                if (currentHash && currentHash !== summaryHash) {
                    debug(SUBSYSTEM.QUEUE, `Skipping PROCESS_LOREBOOK_ENTRY for outdated summary hash (message ${messageIndex})`);
                    return {
                        success: true,
                        skipped: true,
                        reason: 'outdated_summary'
                    };
                }
            }
        }

        debug(SUBSYSTEM.QUEUE, `Executing PROCESS_LOREBOOK_ENTRY for: ${entryData.name || entryData.comment || 'Unknown'}`);
        const result = await processSingleLorebookEntry(entryData, { useQueue: true });

        // If processing failed, throw error to trigger queue retry logic
        if (!result.success) {
            throw new Error(result.message || 'Failed to process lorebook entry');
        }

        return result;
    });

    // Merge lorebook entry (standalone operation)
    registerOperationHandler(OperationType.MERGE_LOREBOOK_ENTRY, async (operation) => {
        const { lorebookName, entryUid, existingContent, newContent, newKeys, newSecondaryKeys } = operation.params;
        const entryComment = operation.metadata?.entry_comment || entryUid;
        debug(SUBSYSTEM.QUEUE, `Executing MERGE_LOREBOOK_ENTRY for: ${entryComment}`);
        return await mergeLorebookEntryByUid({
            lorebookName,
            entryUid,
            existingContent,
            newContent,
            newKeys,
            newSecondaryKeys
        });
    });

    // TRIAGE_LOREBOOK_ENTRY - First stage of lorebook processing pipeline
    registerOperationHandler(OperationType.TRIAGE_LOREBOOK_ENTRY, async (operation) => {
        const { entryId, entryData, registryListing, typeList } = operation.params;
        debug(SUBSYSTEM.QUEUE, `Executing TRIAGE_LOREBOOK_ENTRY for: ${entryData.comment || 'Unknown'}`);

        // Import the triage function (dynamic import to avoid circular dependencies)
        const { runTriageStage } = await import('./summaryToLorebookProcessor.js');
        const settings = get_settings('autoLorebooks')?.summary_processing || {};

        // Run triage
        const triageResult = await runTriageStage(entryData, registryListing, typeList, settings);

        // Store triage result in pending ops
        setTriageResult(entryId, triageResult);
        markStageInProgress(entryId, 'triage_complete');

        debug(SUBSYSTEM.QUEUE, `✓ Triage complete for ${entryId}: type=${triageResult.type}, sameIds=${triageResult.sameEntityIds.length}, needsIds=${triageResult.needsFullContextIds.length}`);

        // Enqueue next operation based on triage result
        if (triageResult.needsFullContextIds && triageResult.needsFullContextIds.length > 0) {
            // Need resolution
            await enqueueOperation(
                OperationType.RESOLVE_LOREBOOK_ENTRY,
                { entryId },
                { metadata: { entry_comment: entryData.comment } }
            );
        } else if (triageResult.sameEntityIds.length === 1) {
            // Exact match found - merge
            const resolvedId = triageResult.sameEntityIds[0];
            setResolutionResult(entryId, { resolvedId, synopsis: triageResult.synopsis });
            markStageInProgress(entryId, 'resolution_complete');

            await enqueueOperation(
                OperationType.CREATE_LOREBOOK_ENTRY,
                { entryId, action: 'merge', resolvedId },
                { metadata: { entry_comment: entryData.comment } }
            );
        } else {
            // No match - create new
            await enqueueOperation(
                OperationType.CREATE_LOREBOOK_ENTRY,
                { entryId, action: 'create' },
                { metadata: { entry_comment: entryData.comment } }
            );
        }

        return { success: true, triageResult };
    });

    // RESOLVE_LOREBOOK_ENTRY - Second stage (conditional) - get full context for uncertain matches
    registerOperationHandler(OperationType.RESOLVE_LOREBOOK_ENTRY, async (operation) => {
        const { entryId } = operation.params;
        const entryData = getEntryData(entryId);
        const triageResult = getTriageResult(entryId);

        if (!entryData || !triageResult) {
            throw new Error(`Missing pending data for entry ${entryId}`);
        }

        debug(SUBSYSTEM.QUEUE, `Executing RESOLVE_LOREBOOK_ENTRY for: ${entryData.comment || 'Unknown'}`);

        // Import resolution function
        const { runResolutionStage, buildCandidateEntriesData } = await import('./summaryToLorebookProcessor.js');
        const { getAttachedLorebook, getLorebookEntries } = await import('./lorebookManager.js');
        const { ensureRegistryState } = await import('./summaryToLorebookProcessor.js');

        const settings = get_settings('autoLorebooks')?.summary_processing || {};
        const lorebookName = getAttachedLorebook();

        if (!lorebookName) {
            throw new Error('No lorebook attached');
        }

        // Get existing entries to build candidate data
        const existingEntriesRaw = await getLorebookEntries(lorebookName);
        const existingEntriesMap /*: Map<string, any> */ = new Map();
        existingEntriesRaw?.forEach(entry => {
            if (entry && entry.uid !== undefined) {
                existingEntriesMap.set(String(entry.uid), entry);
            }
        });

        const registryState = ensureRegistryState();
        const candidateIds = Array.from(new Set([
            ...triageResult.sameEntityIds,
            ...triageResult.needsFullContextIds
        ]));

        const candidateEntries = buildCandidateEntriesData(candidateIds, registryState, existingEntriesMap);

        // Run resolution
        const resolutionResult = await runResolutionStage(
            entryData,
            triageResult.synopsis,
            candidateEntries,
            triageResult.type,
            settings
        );

        // Store resolution result
        setResolutionResult(entryId, resolutionResult);
        markStageInProgress(entryId, 'resolution_complete');

        debug(SUBSYSTEM.QUEUE, `✓ Resolution complete for ${entryId}: resolvedId=${resolutionResult.resolvedId || 'new'}`);

        // Enqueue next operation
        if (resolutionResult.resolvedId) {
            // Match found - merge
            await enqueueOperation(
                OperationType.CREATE_LOREBOOK_ENTRY,
                { entryId, action: 'merge', resolvedId: resolutionResult.resolvedId },
                { metadata: { entry_comment: entryData.comment } }
            );
        } else {
            // No match - create new
            await enqueueOperation(
                OperationType.CREATE_LOREBOOK_ENTRY,
                { entryId, action: 'create' },
                { metadata: { entry_comment: entryData.comment } }
            );
        }

        return { success: true, resolutionResult };
    });

    /**
     * Prepares context for entry creation/merge
     * @param {any} operation - Operation with params
     * @returns {Promise<any>} - Context object
     */
    async function prepareEntryContext(operation /*: any */) /*: Promise<any> */ {
        const { entryId, action, resolvedId } = operation.params;
        const entryData = getEntryData(entryId);
        const triageResult = getTriageResult(entryId);
        const resolutionResult = getResolutionResult(entryId);

        if (!entryData) {
            throw new Error(`Missing entry data for ${entryId}`);
        }

        debug(SUBSYSTEM.QUEUE, `Executing CREATE_LOREBOOK_ENTRY (${action}) for: ${entryData.comment || 'Unknown'}`);

        const { getAttachedLorebook, getLorebookEntries, addLorebookEntry } = await import('./lorebookManager.js');
        const { mergeLorebookEntry } = await import('./lorebookEntryMerger.js');
        const { ensureRegistryState, updateRegistryRecord, assignEntityId, ensureStringArray } = await import('./summaryToLorebookProcessor.js');

        const lorebookName = getAttachedLorebook();
        if (!lorebookName) {
            throw new Error('No lorebook attached');
        }

        const registryState = ensureRegistryState();
        const finalType = triageResult?.type || entryData.type || 'character';
        const finalSynopsis = resolutionResult?.synopsis || triageResult?.synopsis || '';

        return {
            entryId, action, resolvedId, entryData, lorebookName,
            registryState, finalType, finalSynopsis,
            getLorebookEntries, addLorebookEntry, mergeLorebookEntry,
            updateRegistryRecord, assignEntityId, ensureStringArray
        };
    }

    /**
     * Executes merge action
     * @param {any} context - Entry context
     * @returns {Promise<any>} - Merge result
     */
    async function executeMergeAction(context /*: any */) /*: Promise<any> */ {
        const { resolvedId, entryData, lorebookName, registryState, finalType, finalSynopsis,
                getLorebookEntries, mergeLorebookEntry, updateRegistryRecord, ensureStringArray, entryId } = context;

        const existingEntriesRaw = await getLorebookEntries(lorebookName);
        const record = registryState.index?.[resolvedId];
        const existingEntry = record ? existingEntriesRaw?.find(e => e.uid === record.uid) : null;

        if (!record || !existingEntry) {
            return { success: false, fallbackToCreate: true };
        }

        const mergeResult = await mergeLorebookEntry(lorebookName, existingEntry, entryData, { useQueue: false });

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

    /**
     * Executes create action
     * @param {any} context - Entry context
     * @returns {Promise<any>} - Create result
     */
    async function executeCreateAction(context /*: any */) /*: Promise<any> */ {
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

    /**
     * Handles CREATE_LOREBOOK_ENTRY operation
     * @param {any} operation - Operation to handle
     * @returns {Promise<any>} - Operation result
     */
    async function handleCreateLorebookEntry(operation /*: any */) /*: Promise<any> */ {
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
            { metadata: { entry_comment: context.entryData.comment } }
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

        const { getAttachedLorebook, updateRegistryEntryContent } = await import('./lorebookManager.js');
        const { buildRegistryItemsForType, ensureRegistryState } = await import('./summaryToLorebookProcessor.js');
        const { saveMetadata } = await import('../../../../script.js');

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

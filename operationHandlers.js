// operationHandlers.js - Register and handle all queue operations

import {
    registerOperationHandler,
    OperationType,
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
} from './sceneBreak.js';
import {
    generate_running_scene_summary,
    combine_scene_with_running_summary,
} from './runningSceneSummary.js';
import {
    generate_combined_summary,
} from './combinedSummary.js';
import {
    getContext,
    get_data,
    set_data,
    saveChatDebounced,
    debug,
    log,
    error,
    SUBSYSTEM,
} from './index.js';

/**
 * Helper to get message div
 */
function get_message_div(index) {
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
        const result = await summarize_message(index);
        return result;
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
        return result;
    });

    // Generate scene summary
    registerOperationHandler(OperationType.GENERATE_SCENE_SUMMARY, async (operation) => {
        const { index } = operation.params;
        debug(SUBSYSTEM.QUEUE, `Executing GENERATE_SCENE_SUMMARY for index ${index}`);
        const summary = await generateSceneSummary(
            index,
            get_message_div,
            getContext,
            get_data,
            set_data,
            saveChatDebounced
        );
        return { summary };
    });

    // Generate scene name (handled within scene summary generation)
    registerOperationHandler(OperationType.GENERATE_SCENE_NAME, async (operation) => {
        const { index, summary } = operation.params;
        debug(SUBSYSTEM.QUEUE, `Executing GENERATE_SCENE_NAME for index ${index}`);
        // Scene name generation is integrated into generateSceneSummary
        // This handler is a placeholder for future standalone implementation
        return { name: '' };
    });

    // Generate running summary (bulk)
    registerOperationHandler(OperationType.GENERATE_RUNNING_SUMMARY, async (operation) => {
        debug(SUBSYSTEM.QUEUE, `Executing GENERATE_RUNNING_SUMMARY`);
        const summary = await generate_running_scene_summary();
        return { summary };
    });

    // Combine scene with running summary
    registerOperationHandler(OperationType.COMBINE_SCENE_WITH_RUNNING, async (operation) => {
        const { index } = operation.params;
        debug(SUBSYSTEM.QUEUE, `Executing COMBINE_SCENE_WITH_RUNNING for index ${index}`);
        const summary = await combine_scene_with_running_summary(index);
        return { summary };
    });

    // Generate combined summary
    registerOperationHandler(OperationType.GENERATE_COMBINED_SUMMARY, async (operation) => {
        debug(SUBSYSTEM.QUEUE, `Executing GENERATE_COMBINED_SUMMARY`);
        await generate_combined_summary();
        return { success: true };
    });

    log(SUBSYSTEM.QUEUE, 'Registered all operation handlers');
}

export default {
    registerAllOperationHandlers
};

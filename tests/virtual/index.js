// @flow
// Imports from SillyTavern
// $FlowFixMe[cannot-resolve-module]
import { getPresetManager } from './stubs/externals.js'
// $FlowFixMe[cannot-resolve-module]
import { formatInstructModeChat } from './stubs/externals.js';
// $FlowFixMe[cannot-resolve-module]
import { is_group_generating, selected_group, openGroupId, groups } from './stubs/externals.js';
// $FlowFixMe[cannot-resolve-module]
import { loadMovingUIState, renderStoryString, power_user } from './stubs/externals.js';
// $FlowFixMe[cannot-resolve-module]
import { dragElement } from './stubs/externals.js';
// $FlowFixMe[cannot-resolve-module]
import { debounce_timeout } from './stubs/externals.js';
// $FlowFixMe[cannot-resolve-module]
import { MacrosParser } from './stubs/externals.js';
// $FlowFixMe[cannot-resolve-module]
import { commonEnumProviders } from './stubs/externals.js';
import { getRegexScripts } from './stubs/externals.js'
import { runRegexScript } from './stubs/externals.js'
// $FlowFixMe[cannot-resolve-module]
import { getContext, getApiUrl, extension_settings } from './stubs/externals.js';
// $FlowFixMe[cannot-resolve-module]
import { getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition } from './stubs/externals.js';
import { animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, setSendButtonState, saveSettingsDebounced, generateRaw, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata, saveMetadata } from './stubs/externals.js';

export {
    // Exports from imported SillyTavern modules
    formatInstructModeChat, getPresetManager, is_group_generating, selected_group, openGroupId, groups, loadMovingUIState, renderStoryString, power_user, dragElement, debounce_timeout, MacrosParser, commonEnumProviders, getRegexScripts, runRegexScript, getContext, getApiUrl, extension_settings, getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition, animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, setSendButtonState, saveSettingsDebounced, generateRaw, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata, saveMetadata
};

// Barrel file. Implictly imports before exporting
export * from './settingsUI.js';
export * from './profileManager.js';
export { MemoryEditInterface } from './memoryEditInterface.js';
export * from './defaultPrompts.js';
export * from './defaultSettings.js';
export * from './sceneBreak.js';
export * from './autoSceneBreakDetection.js';
export * from './runningSceneSummary.js';
export * from './runningSceneSummaryUI.js';
export * from './utils.js';
export * from './slashCommands.js';
export * from './settingsManager.js';
export * from './messageVisuals.js';
export * from './memoryCore.js';
export * from './progressBar.js';
export * from './uiBindings.js';
export * from './characterSelect.js';
export * from './profileUI.js';
export * from './messageData.js';
export * from './popout.js';
export * from './buttonBindings.js';
export * from './connectionProfiles.js';
export * from './connectionSettingsManager.js';
export * from './promptUtils.js';
export * from './summarization.js';
export * from './summaryValidation.js';
export * from './presetManager.js';
export * from './eventHandlers.js';
export * from './styleConstants.js';
export * from './autoHide.js';
export * from './sceneNavigator.js';
export * from './operationQueue.js';
export * from './operationQueueUI.js';
export * from './operationHandlers.js';
export * from './queueIntegration.js';

// Lorebooks functionality (merged from ST-Auto-Lorebooks)
export * from './lorebookManager.js';
export * from './lorebookEntryMerger.js';
export * from './categoryIndexes.js';
export * from './trackingEntries.js';
export * from './sendButtonInterceptor.js';
export * from './summaryToLorebookProcessor.js';
export * from './tests.js';

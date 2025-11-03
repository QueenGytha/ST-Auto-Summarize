// @flow
// Imports from SillyTavern
// $FlowFixMe[cannot-resolve-module]
import { getPresetManager } from '../../../preset-manager.js'
// $FlowFixMe[cannot-resolve-module]
import { formatInstructModeChat } from '../../../instruct-mode.js';
// $FlowFixMe[cannot-resolve-module]
import { is_group_generating, selected_group, openGroupId, groups } from '../../../group-chats.js';
// $FlowFixMe[cannot-resolve-module]
import { loadMovingUIState, renderStoryString, power_user } from '../../../power-user.js';
// $FlowFixMe[cannot-resolve-module]
import { dragElement } from '../../../RossAscends-mods.js';
// $FlowFixMe[cannot-resolve-module]
import { debounce_timeout } from '../../../constants.js';
// $FlowFixMe[cannot-resolve-module]
import { MacrosParser } from '../../../macros.js';
// $FlowFixMe[cannot-resolve-module]
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { getRegexScripts } from '../../../../scripts/extensions/regex/index.js'
import { runRegexScript } from '../../../../scripts/extensions/regex/engine.js'
// $FlowFixMe[cannot-resolve-module]
import { getContext, getApiUrl, extension_settings } from '../../../extensions.js';
// $FlowFixMe[cannot-resolve-module]
import { getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition } from '../../../utils.js';
import { animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, saveSettingsDebounced, generateRaw, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata, saveMetadata, activateSendButtons as _originalActivateSendButtons, deactivateSendButtons as _originalDeactivateSendButtons } from '../../../../script.js';

// Track if queue is blocking (set by operationQueue.js)
let isQueueBlocking = false;

// Queue indicator button element
let queueIndicatorButton = null;

// Function for queue to control blocking state
export function setQueueBlocking(blocking /*: boolean */) /*: void */ {
    console.log('[AutoSummarize] [ButtonControl] setQueueBlocking:', blocking);
    isQueueBlocking = blocking;

    const sendButton = document.getElementById('send_but');
    const stopButton = document.getElementById('mes_stop');

    if (blocking) {
        _originalDeactivateSendButtons();

        // Hide both ST buttons
        if (sendButton) {
            sendButton.classList.add('displayNone');
        }
        if (stopButton) {
            stopButton.style.display = 'none';
        }

        // Create and show our custom queue indicator button
        if (!queueIndicatorButton) {
            queueIndicatorButton = document.createElement('div');
            queueIndicatorButton.id = 'queue_indicator_but';
            queueIndicatorButton.className = 'fa-solid fa-hourglass-half interactable';
            queueIndicatorButton.title = 'Queue operations in progress - click to view queue';
            queueIndicatorButton.style.opacity = '1';
            queueIndicatorButton.style.cursor = 'pointer';

            // Click opens queue UI
            queueIndicatorButton.addEventListener('click', async () => {
                const queueUI = document.getElementById('queue-panel');
                if (queueUI) {
                    queueUI.classList.toggle('hidden');
                }
            });

            // Insert next to send button
            if (sendButton && sendButton.parentNode) {
                sendButton.parentNode.insertBefore(queueIndicatorButton, sendButton);
            }
        }

        queueIndicatorButton.classList.remove('displayNone');
        console.log('[AutoSummarize] [ButtonControl] Showing queue indicator button');
    } else {
        _originalActivateSendButtons();

        // Hide our queue indicator
        if (queueIndicatorButton) {
            queueIndicatorButton.classList.add('displayNone');
        }

        // Restore send button
        if (sendButton) {
            sendButton.classList.remove('displayNone');
        }

        console.log('[AutoSummarize] [ButtonControl] Restored send button');
    }
}

// Override the GLOBAL functions to intercept ALL calls
export function installButtonInterceptor() /*: void */ {
    if (typeof window === 'undefined') return;

    console.log('[AutoSummarize] Installing button function interceptors...');

    // ST's script.js doesn't export to window, so we need to hook into the DOM manipulation directly
    // Instead of trying to override functions, we'll use MutationObserver to watch button state changes
    // and force-override them when queue is blocking

    const attemptInstall = () => {
        const sendButton = document.getElementById('send_but');
        const stopButton = document.getElementById('mes_stop');

        if (!sendButton || !stopButton) {
            console.warn('[AutoSummarize] Buttons not found yet, retrying in 500ms...');
            setTimeout(attemptInstall, 500);
            return;
        }

        console.log('[AutoSummarize] Found send/stop buttons, installing observer...');

        // Watch for changes to the body's data-generating attribute
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-generating') {
                    const isGenerating = document.body.dataset.generating === 'true';
                    console.log('[AutoSummarize] [ButtonControl] Generation state changed:', isGenerating, 'isQueueBlocking:', isQueueBlocking);

                    // If queue is blocking and ST tries to unblock (by removing data-generating), re-block it
                    if (isQueueBlocking && !isGenerating) {
                        console.log('[AutoSummarize] [ButtonControl] Queue is blocking - forcing generation state back to true');
                        document.body.dataset.generating = 'true';
                    }
                }
            });
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-generating']
        });

        console.log('[AutoSummarize] Button state observer installed');
    };

    attemptInstall();
}

// Re-export for other modules (these won't be used by ST, but by our own code)
function activateSendButtons() {
    _originalActivateSendButtons();
}

function deactivateSendButtons() {
    _originalDeactivateSendButtons();
}

export {
    // Exports from imported SillyTavern modules
    formatInstructModeChat, getPresetManager, is_group_generating, selected_group, openGroupId, groups, loadMovingUIState, renderStoryString, power_user, dragElement, debounce_timeout, MacrosParser, commonEnumProviders, getRegexScripts, runRegexScript, getContext, getApiUrl, extension_settings, getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition, animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, saveSettingsDebounced, generateRaw, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata, saveMetadata, activateSendButtons, deactivateSendButtons
};

// Barrel file. Implictly imports before exporting
export * from './settingsUI.js';
export * from './profileManager.js';
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
export * from './summaryToLorebookProcessor.js';
export * from './tests.js';

// Metadata injection for LLM requests
export * from './metadataInjector.js';

// ============================================================================
// Enter Key Interception for Queue Operations
// ============================================================================
// Intercepts Enter key presses to block when queue is active

/**
 * Install Enter key interceptor for textarea
 * This is called during extension initialization
 */
export function installEnterKeyInterceptor() /*: void */ {
    console.log('[AutoSummarize] Installing Enter key interceptor');
    if (typeof window === 'undefined') return;

    const attemptInstall = () => {
        const textarea = document.getElementById('send_textarea');
        if (!textarea) {
            console.warn('[AutoSummarize] Could not find #send_textarea, retrying in 500ms...');
            setTimeout(attemptInstall, 500);
            return;
        }

        textarea.addEventListener('keydown', async function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                // Check if queue is active
                const { isQueueActive } = await import('./operationQueue.js');
                if (isQueueActive()) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[AutoSummarize] [Queue] Blocked Enter key - queue is processing operations');
                    const { toast } = await import('./index.js');
                    toast('Please wait - queue operations in progress', 'warning');
                }
            }
        }, true); // Use capture phase to intercept before ST's handlers

        console.log('[AutoSummarize] Enter key interceptor installed');
    };

    attemptInstall();
}

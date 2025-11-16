
// Imports from SillyTavern
import { getPresetManager } from '../../../preset-manager.js';
import { formatInstructModeChat } from '../../../instruct-mode.js';
import { is_group_generating, selected_group, openGroupId, groups } from '../../../group-chats.js';
import { loadMovingUIState, renderStoryString, power_user } from '../../../power-user.js';
import { dragElement } from '../../../RossAscends-mods.js';
import { debounce_timeout } from '../../../constants.js';
import { MacrosParser } from '../../../macros.js';
import { commonEnumProviders } from '../../../slash-commands/SlashCommandCommonEnumsProvider.js';
import { getRegexScripts } from '../../../../scripts/extensions/regex/index.js';
import { runRegexScript } from '../../../../scripts/extensions/regex/engine.js';
import { getContext, getApiUrl, extension_settings } from '../../../extensions.js';
import { getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition } from '../../../utils.js';
import { animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, saveSettingsDebounced, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata, saveMetadata, getCurrentChatId, activateSendButtons as _originalActivateSendButtons, deactivateSendButtons as _originalDeactivateSendButtons } from '../../../../script.js';
import { loadWorldInfo } from '../../../world-info.js';

// Import SillyTavern selectors (direct import since this is the barrel file)
import { selectorsSillyTavern } from './selectorsSillyTavern.js';

// Import constants (direct import since this is the barrel file)
import { UI_UPDATE_DELAY_MS } from './constants.js';

// Import logging utilities (direct import since this is the barrel file)
import { debug, SUBSYSTEM, toast } from './utils.js';

// Import settings functions for window.AutoRecap export
import { get_settings, set_settings, global_settings as default_settings } from './settingsManager.js';

// Track if queue is blocking (set by operationQueue.js)
let isQueueBlocking = false;

// Queue indicator button element
let queueIndicatorButton = null;

// Function for queue to control blocking state
export function setQueueBlocking(blocking ) {
  debug(SUBSYSTEM.UI, '[ButtonControl] setQueueBlocking:', blocking);
  isQueueBlocking = blocking;

  const sendButton = document.querySelector(selectorsSillyTavern.buttons.send);
  const stopButton = document.querySelector(selectorsSillyTavern.buttons.stop);

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
      queueIndicatorButton.title = 'Queue operations in progress';
      queueIndicatorButton.style.opacity = '1';
      queueIndicatorButton.style.cursor = 'default';

      // Insert next to send button
      if (sendButton && sendButton.parentNode) {
        sendButton.parentNode.insertBefore(queueIndicatorButton, sendButton);
      }
    }

    queueIndicatorButton.classList.remove('displayNone');
    debug(SUBSYSTEM.UI, '[ButtonControl] Showing queue indicator button');
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

    debug(SUBSYSTEM.UI, '[ButtonControl] Restored send button');
  }
}

// Override the GLOBAL functions to intercept ALL calls
export function installButtonInterceptor() {
  if (typeof window === 'undefined') {return;}

  debug(SUBSYSTEM.UI, 'Installing button function interceptors...');

  // ST's script.js doesn't export to window, so we need to hook into the DOM manipulation directly
  // Instead of trying to override functions, we'll use MutationObserver to watch button state changes
  // and force-override them when queue is blocking

  const attemptInstall = () => {
    const sendButton = document.querySelector(selectorsSillyTavern.buttons.send);
    const stopButton = document.querySelector(selectorsSillyTavern.buttons.stop);

    if (!sendButton || !stopButton) {
      debug(SUBSYSTEM.UI, 'Buttons not found yet, retrying in 500ms...');
      setTimeout(attemptInstall, UI_UPDATE_DELAY_MS);
      return;
    }

    debug(SUBSYSTEM.UI, 'Found send/stop buttons, installing observer...');

    // Watch for changes to the body's data-generating attribute
    // eslint-disable-next-line no-undef -- MutationObserver is a browser global, not Node.js
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-generating') {
          const isGenerating = document.body.dataset.generating === 'true';
          debug(SUBSYSTEM.UI, '[ButtonControl] Generation state changed:', isGenerating, 'isQueueBlocking:', isQueueBlocking);

          // If queue is blocking and ST tries to unblock (by removing data-generating), re-block it
          if (isQueueBlocking && !isGenerating) {
            debug(SUBSYSTEM.UI, '[ButtonControl] Queue is blocking - forcing generation state back to true');
            document.body.dataset.generating = 'true';
          }
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-generating']
    });

    debug(SUBSYSTEM.UI, 'Button state observer installed');
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

// Import wrapped generateRaw from interceptor (will be set up during init)
import { wrappedGenerateRaw } from './generateRawInterceptor.js';

// Export wrapped version as generateRaw so all extension code uses it
export const generateRaw = wrappedGenerateRaw;

export {
  // Exports from imported SillyTavern modules
  formatInstructModeChat, getPresetManager, is_group_generating, selected_group, openGroupId, groups, loadMovingUIState, renderStoryString, power_user, dragElement, debounce_timeout, MacrosParser, commonEnumProviders, getRegexScripts, runRegexScript, getContext, getApiUrl, extension_settings, getStringHash, debounce, copyText, trimToEndSentence, download, parseJsonFile, waitUntilCondition, animation_duration, scrollChatToBottom, extension_prompt_roles, extension_prompt_types, saveSettingsDebounced, getMaxContextSize, streamingProcessor, amount_gen, system_message_types, CONNECT_API_MAP, main_api, chat_metadata, saveMetadata, getCurrentChatId, activateSendButtons, deactivateSendButtons };


// Barrel file. Implictly imports before exporting
// profileUI.js must be exported first as it provides refresh_settings used by many modules
export * from './profileUI.js';
export * from './settingsUI.js';
export * from './profileManager.js';
export * from './defaultPrompts.js';
export * from './defaultSettings.js';
export * from './constants.js';
export * from './sceneBreak.js';
export * from './autoSceneBreakDetection.js';
export * from './runningSceneRecap.js';
export * from './runningSceneRecapUI.js';
export * from './utils.js';
export * from './slashCommands.js';
export * from './settingsManager.js';
export * from './messageVisuals.js';
export * from './memoryCore.js';
export * from './uiBindings.js';
export * from './characterSelect.js';
export * from './messageData.js';
export * from './popout.js';
export * from './buttonBindings.js';
export * from './connectionProfiles.js';
export * from './promptUtils.js';
export * from './presetPromptLoader.js';
export * from './recapValidation.js';
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
export * from './recapToLorebookProcessor.js';

// Metadata injection for LLM requests
export * from './metadataInjector.js';
export * from './generateRawInterceptor.js';
export * from './operationContext.js';

// ConnectionManager integration
export * from './operationTypes.js';
export * from './profileResolution.js';
export * from './llmClient.js';
export * from './settingsMigration.js';

// Lorebook entry wrapping for downstream parsing
export * from './lorebookWrapper.js';

// Lorebook viewer UI
export * from './lorebookViewer.js';

// Selector files for testing (E2E test infrastructure)
export { selectorsExtension, scopeToSettings } from './selectorsExtension.js';
export { selectorsSillyTavern } from './selectorsSillyTavern.js';

// ============================================================================
// Enter Key Interception for Queue Operations
// ============================================================================
// Intercepts Enter key presses to block when queue is active

export function installEnterKeyInterceptor() {
  debug(SUBSYSTEM.UI, 'Installing Enter key interceptor');
  if (typeof window === 'undefined') {return;}

  const attemptInstall = () => {
    const textarea = document.querySelector(selectorsSillyTavern.chat.input);
    if (!textarea) {
      debug(SUBSYSTEM.UI, 'Could not find chat input textarea, retrying in 500ms...');
      setTimeout(attemptInstall, UI_UPDATE_DELAY_MS);
      return;
    }

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Check if chat is blocked by queue (synchronous check)
        if (isQueueBlocking) {
          e.preventDefault();
          e.stopPropagation();
          debug(SUBSYSTEM.UI, '[Queue] Blocked Enter key - queue is processing operations');
          toast('Please wait - queue operations in progress', 'warning');
        }
      }
    }, true); // Use capture phase to intercept before ST's handlers

    debug(SUBSYSTEM.UI, 'Enter key interceptor installed');
  };

  attemptInstall();
}

// ============================================================================
// World Info Activation Tracking
// ============================================================================
// Tracks which lorebook entries are active per message
// Maintains sticky/constant entry state across generations

const activeLorebooksPerMessage = new Map();
const activeStickyEntries = new Map(); // uid -> {entry, stickyCount, messageIndex}
let currentGenerationType = null;
let targetMessageIndex = null;

/**
 * Get active lorebook entries for a specific message
 * First checks message.extra for persisted data, falls back to in-memory Map
 */
export function getActiveLorebooksForMessage(messageIndex) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  // Try to load from persisted data first
  if (message?.extra?.activeLorebookEntries) {
    return message.extra.activeLorebookEntries;
  }

  // Fall back to in-memory storage
  return activeLorebooksPerMessage.get(messageIndex) || null;
}

/**
 * Get inactive lorebook entries for a specific message
 * @param {number} messageIndex - The message index
 * @returns {Array|null} Array of inactive lorebook entry objects, or null if none
 */
export function getInactiveLorebooksForMessage(messageIndex) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  if (message?.extra?.inactiveLorebookEntries) {
    return message.extra.inactiveLorebookEntries;
  }

  return null;
}

/**
 * Clear all lorebook tracking data
 */
export function clearActiveLorebooksData() {
  activeLorebooksPerMessage.clear();
  activeStickyEntries.clear();
  currentGenerationType = null;
  targetMessageIndex = null;
}

/**
 * Determine entry strategy type
 */
function getEntryStrategy(entry) {
  if (entry.constant === true) {return 'constant';}
  if (entry.vectorized === true) {return 'vectorized';}
  return 'normal';
}

/**
 * Decrement sticky counters for all active sticky entries
 * Removes entries that have expired (count reaches 0)
 */
function decrementStickyCounters() {
  const toRemove = [];

  for (const [uid, stickyData] of activeStickyEntries.entries()) {
    if (stickyData.stickyCount > 0) {
      stickyData.stickyCount--;
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Decremented sticky count for ${stickyData.entry.comment}: ${stickyData.stickyCount} remaining`);

      if (stickyData.stickyCount === 0) {
        toRemove.push(uid);
      }
    }
  }

  // Remove expired entries
  for (const uid of toRemove) {
    const removed = activeStickyEntries.get(uid);
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Removed expired sticky entry: ${removed.entry.comment}`);
    activeStickyEntries.delete(uid);
  }
}

/**
 * Get currently active sticky/constant entries
 * Returns entries that are still active from previous activations
 */
function getStillActiveEntries() {
  const stillActive = [];

  for (const [, stickyData] of activeStickyEntries.entries()) {
    // Include if: constant OR sticky count > 0
    if (stickyData.entry.constant || stickyData.stickyCount > 0) {
      stillActive.push(stickyData.entry);
    }
  }

  return stillActive;
}

/**
 * Update sticky entry tracking with newly activated entries
 */
function updateStickyTracking(entries, messageIndex) {
  for (const entry of entries) {
    const strategy = getEntryStrategy(entry);

    // Track sticky entries
    if (entry.sticky && entry.sticky > 0) {
      activeStickyEntries.set(entry.uid, {
        entry: entry,
        stickyCount: entry.sticky,
        messageIndex: messageIndex
      });
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Tracking sticky entry: ${entry.comment} (${entry.sticky} rounds)`);
    }

    // Track constant entries (always active)
    if (strategy === 'constant') {
      activeStickyEntries.set(entry.uid, {
        entry: entry,
        stickyCount: Infinity, // Never expires
        messageIndex: messageIndex
      });
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Tracking constant entry: ${entry.comment}`);
    }
  }
}

/**
 * Persist lorebook entries to message.extra for durability across refresh
 */
/**
 * Get ALL lorebook entries from lorebooks used by active entries
 * @param {Array} mergedEntries - Active lorebook entries to extract world names from
 * @returns {Promise<Array>} Promise resolving to array of all entry objects with full content
 */
async function getAllLorebookEntries(mergedEntries) {
  const allEntries = [];

  // Extract unique world names from active entries
  const uniqueWorldNames = new Set(mergedEntries.map(e => e.world));

  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Loading entries from ${uniqueWorldNames.size} unique lorebook(s): ${Array.from(uniqueWorldNames).join(', ')}`);
  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] mergedEntries contains ${mergedEntries.length} active entries`);

  for (const worldName of uniqueWorldNames) {
    // eslint-disable-next-line no-await-in-loop -- Sequential loading required to fetch lorebook data
    const worldData = await loadWorldInfo(worldName);

    if (!worldData?.entries) {
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Lorebook "${worldName}" has no entries`);
      continue;
    }

    const entriesArray = Object.values(worldData.entries);
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Lorebook "${worldName}" - worldData.entries has ${entriesArray.length} entries`);
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Lorebook "${worldName}" - worldData.entries keys: ${Object.keys(worldData.entries).length}`);

    for (const entry of entriesArray) {
      const strategy = getEntryStrategy(entry);
      allEntries.push({
        comment: entry.comment || '(unnamed)',
        uid: entry.uid,
        world: worldName,
        key: entry.key || [],
        position: entry.position,
        depth: entry.depth,
        order: entry.order,
        role: entry.role,
        constant: entry.constant || false,
        vectorized: entry.vectorized || false,
        sticky: entry.sticky || 0,
        strategy: strategy,
        content: entry.content || ''
      });
    }
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Lorebook "${worldName}" - added ${entriesArray.length} entries to allEntries`);
  }

  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Loaded ${allEntries.length} total entries from all lorebooks`);
  return allEntries;
}

function persistToMessage(messageIndex, entries) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  if (!message) {
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Cannot persist: message ${messageIndex} not found`);
    return;
  }

  if (!message.extra) {
    message.extra = {};
  }

  message.extra.activeLorebookEntries = entries;
  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Persisted ${entries.length} entries to message ${messageIndex}.extra`);
}

/**
 * Persist inactive lorebook entries to message metadata
 * @param {number} messageIndex - The message index
 * @param {Array} entries - Array of inactive entry objects
 */
function persistInactiveToMessage(messageIndex, entries) {
  const ctx = getContext();
  const message = ctx?.chat?.[messageIndex];

  if (!message) {
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Cannot persist inactive entries: message ${messageIndex} not found`);
    return;
  }

  if (!message.extra) {
    message.extra = {};
  }

  message.extra.inactiveLorebookEntries = entries;
  debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Persisted ${entries.length} inactive entries to message ${messageIndex}.extra`);
}

/**
 * Install world info activation tracker
 * Listens to GENERATION_STARTED and WORLD_INFO_ACTIVATED events
 * Tracks sticky/constant entries across multiple generations
 */
export function installWorldInfoActivationLogger() {
  debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Installing activation tracker');

  const ctx = getContext();
  const eventSource = ctx?.eventSource;
  const event_types = ctx?.event_types;

  if (!eventSource || !event_types?.WORLD_INFO_ACTIVATED || !event_types?.GENERATION_STARTED) {
    debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Unable to install tracker (missing eventSource or event types)');
    return;
  }

  // Track generation type and target message index
  eventSource.on(event_types.GENERATION_STARTED, (genType) => {
    currentGenerationType = genType;
    const chatLength = ctx.chat?.length || 0;

    // Calculate target message index based on generation type
    if (genType === 'swipe') {
      // Swipe replaces the last message
      targetMessageIndex = Math.max(0, chatLength - 1);
    } else if (genType === 'continue') {
      // Continue appends to the last message
      targetMessageIndex = Math.max(0, chatLength - 1);
    } else {
      // Normal generation or impersonate creates new message
      targetMessageIndex = chatLength;
    }

    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Generation started: type=${genType}, targetIndex=${targetMessageIndex}`);
  });

  // Track world info activations
  eventSource.on(event_types.WORLD_INFO_ACTIVATED, async (entries) => {
    const chatLength = ctx.chat?.length || 0;

    // Use calculated target index, fallback to last message
    const messageIndex = targetMessageIndex !== null ? targetMessageIndex : Math.max(0, chatLength - 1);

    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Event fired - Chat length: ${chatLength}, Target message: ${messageIndex}, Type: ${currentGenerationType}`);
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] ${entries.length} newly activated entries`);

    // First, decrement sticky counters for ongoing entries
    decrementStickyCounters();

    // Get still-active sticky/constant entries
    const stillActive = getStillActiveEntries();
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] ${stillActive.length} still-active sticky/constant entries`);

    // Capture rich entry data with all metadata
    const enhancedEntries = entries.map(entry => {
      const strategy = getEntryStrategy(entry);
      return {
        comment: entry.comment || '(unnamed)',
        uid: entry.uid,
        world: entry.world,
        key: entry.key || [],
        position: entry.position,
        depth: entry.depth,
        order: entry.order,
        role: entry.role,
        constant: entry.constant || false,
        vectorized: entry.vectorized || false,
        sticky: entry.sticky || 0,
        strategy: strategy,
        content: entry.content || ''
      };
    });

    // Update sticky tracking with newly activated entries
    updateStickyTracking(enhancedEntries, messageIndex);

    // Merge newly activated + still-active entries
    // Deduplicate by uid (newly activated entries take precedence)
    const entryMap = new Map();

    // Add still-active entries first
    for (const entry of stillActive) {
      entryMap.set(entry.uid, entry);
    }

    // Add/replace with newly activated entries
    for (const entry of enhancedEntries) {
      entryMap.set(entry.uid, entry);
    }

    const mergedEntries = Array.from(entryMap.values());
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Total active entries for message ${messageIndex}: ${mergedEntries.length} (${enhancedEntries.length} new + ${stillActive.length} still-active)`);

    // Capture ALL entries from lorebooks for complete snapshot
    const allLorebookEntries = await getAllLorebookEntries(mergedEntries);
    const activeUIDs = new Set(mergedEntries.map(e => e.uid));

    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Active UIDs set contains ${activeUIDs.size} UIDs: ${Array.from(activeUIDs).join(', ')}`);
    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] allLorebookEntries contains ${allLorebookEntries.length} total entries`);

    // Parse ALL entries into active/inactive based on activation state
    const activeEntriesFromAll = [];
    const inactiveEntries = [];

    for (const entry of allLorebookEntries) {
      if (activeUIDs.has(entry.uid)) {
        activeEntriesFromAll.push(entry);
        debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Entry "${entry.comment}" (${entry.uid}) classified as ACTIVE`);
      } else {
        inactiveEntries.push(entry);
        debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Entry "${entry.comment}" (${entry.uid}) classified as INACTIVE`);
      }
    }

    // Store in memory (use original mergedEntries which has sticky/metadata)
    activeLorebooksPerMessage.set(messageIndex, mergedEntries);

    // Persist to message.extra
    persistToMessage(messageIndex, mergedEntries);
    persistInactiveToMessage(messageIndex, inactiveEntries);

    debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Complete snapshot: ${allLorebookEntries.length} total entries (${activeEntriesFromAll.length} active, ${inactiveEntries.length} inactive)`);

    // Log entry details for debugging
    for (const [i, entry] of mergedEntries.entries()) {
      const stickyInfo = entry.sticky > 0 ? ` (sticky: ${entry.sticky})` : '';
      const constantInfo = entry.constant ? ' (constant)' : '';
      debug(SUBSYSTEM.LOREBOOK, `[worldinfoactive] Entry ${i + 1}: ${entry.strategy} - ${entry.comment}${stickyInfo}${constantInfo}`);
    }
  });

  // Clear sticky state on chat change
  eventSource.on(event_types.CHAT_CHANGED, () => {
    debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] Chat changed, clearing sticky entry state');
    activeStickyEntries.clear();
    currentGenerationType = null;
    targetMessageIndex = null;
  });

  debug(SUBSYSTEM.LOREBOOK, '[worldinfoactive] ✓ Tracker installed successfully');
}

/**
 * TEMPORARY TEST MARKER
 * Used by extension-reload-verification.spec.js to verify reload works
 *
 * DELETE THIS FUNCTION after verification test passes
 */
export function _testMarker() {
  return 'CODE_VERSION_NEW_2025_01_13_15_47';
}

// Import POC test function
import { testMandatoryCalculation, calculateAvailableContextWithMandatory } from './z-POC-mandatory-prompts.js';

// Export extension API to window.AutoRecap for tests and external access
window.AutoRecap = {
  get_settings,
  set_settings,
  default_settings,  // Actually global_settings, aliased above
  _testMarker,
  // POC: Test mandatory prompt calculation
  testMandatoryCalculation,
  calculateAvailableContextWithMandatory
};
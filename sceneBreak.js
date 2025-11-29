/* global ResizeObserver -- Browser API for responsive layout detection */

import {
  get_settings,
  refresh_memory,
  renderSceneNavigatorBar,
  log,
  debug,
  error,
  toast,
  SUBSYSTEM,
  extension_settings,
  createSceneBreakLorebookIcon,
  selectorsExtension,
  selectorsSillyTavern,
  convertLiteralNewlinesToActual,
  MODULE_NAME,
  count_tokens,
  resolveOperationConfig } from
'./index.js';
import {
  queueCombineSceneWithRunning,
  queueProcessLorebookEntry } from
'./queueIntegration.js';
import { clearCheckedFlagsInRange, setCheckedFlagsInRange } from './autoSceneBreakDetection.js';
import {
  get_running_recap_versions,
  delete_running_recap_version,
  cleanup_invalid_running_recaps } from
'./runningSceneRecap.js';
import { getEntityTypeDefinitionsFromSettings } from './entityTypes.js';
import { getAttachedLorebook, getLorebookEntries, invalidateLorebookCache, isInternalEntry } from './lorebookManager.js';
import { restoreCurrentLorebookFromSnapshot } from './lorebookReconstruction.js';
import { build as buildSceneMessages } from './macros/scene_messages.js';
import { build as buildActiveSettingLore } from './macros/active_setting_lore.js';
import { buildAllMacroParams, substitute_params } from './macros/index.js';

import {
  MAX_RECAP_ATTEMPTS,
  ID_GENERATION_BASE,
  LOREBOOK_ENTRY_NAME_MAX_LENGTH,
  TOAST_WARNING_DURATION_WPM,
  TOAST_SHORT_DURATION_WPM,
  UI_UPDATE_DELAY_MS,
  SCENE_BREAK_CHARS,
  SCENE_BREAK_MIN_CHARS
} from './constants.js';
import { normalizeStageOutput, STAGE } from './recapNormalization.js';

// SCENE RECAP PROPERTY STRUCTURE:
// - Scene recaps are stored on the message object as:
//     - 'scene_recap_memory': the current scene recap text (not at the root like 'memory')
//     - 'scene_recap_versions': array of all versions of the scene recap
//     - 'scene_recap_current_index': index of the current version
//     - 'scene_break_visible': whether the scene break is visible
//     - 'scene_recap_include': whether to include this scene recap in injections
// - Do NOT expect scene recaps to be stored in the root 'memory' property.

export const SCENE_BREAK_KEY = 'scene_break';
export const SCENE_BREAK_VISIBLE_KEY = 'scene_break_visible';
export const SCENE_BREAK_NAME_KEY = 'scene_break_name';
export const SCENE_BREAK_RECAP_KEY = 'scene_break_recap';
export const SCENE_RECAP_MEMORY_KEY = 'scene_recap_memory';
export const SCENE_RECAP_HASH_KEY = 'scene_recap_hash';
export const SCENE_RECAP_METADATA_KEY = 'scene_recap_metadata';
export const SCENE_BREAK_COLLAPSED_KEY = 'scene_break_collapsed';
export const SCENE_BREAK_BUTTON_CLASS = 'auto_recap_scene_break_button';
export const SCENE_BREAK_DIV_CLASS = 'auto_recap_scene_break_div';
const SCENE_BREAK_SELECTED_CLASS = 'sceneBreak-selected';

// Simple deterministic hash to detect when recap content changes
function computeRecapHash(recapText ) {
  const text = (recapText || '').trim();
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    hash = (hash << MAX_RECAP_ATTEMPTS) - hash + charCode;
    hash |= 0; // force 32-bit int
  }
  return Math.abs(hash).toString(ID_GENERATION_BASE);
}

// Adds the scene break button to the message template
export function addSceneBreakButton() {
  const html = `
<div title="Mark end of scene" class="mes_button ${SCENE_BREAK_BUTTON_CLASS} fa-solid fa-clapperboard" tabindex="0"></div>
`;
  $(`${selectorsSillyTavern.message.template} ${selectorsSillyTavern.message.buttons} ${selectorsSillyTavern.message.extraButtons}`).prepend(html);
}

// Handles click events for the scene break button
export function bindSceneBreakButton(
get_message_div , // Returns jQuery object - any is appropriate
getContext ,
set_data , // value can be any type - legitimate
get_data , // Returns any type - legitimate
saveChatDebounced )
{
  $(`div${selectorsSillyTavern.chat.container}`).on("click", `.${SCENE_BREAK_BUTTON_CLASS}`, function () {
    const message_block = $(this).closest(selectorsSillyTavern.message.block);
    const message_id = Number(message_block.attr("mesid"));
    toggleSceneBreak(message_id, get_message_div, getContext, set_data, get_data, saveChatDebounced);
  });
}

// Toggles the scene break UI and persists state
// eslint-disable-next-line max-params -- SillyTavern API dependency injection (6 functions always passed together)
export function toggleSceneBreak(
index ,
get_message_div , // Returns jQuery object - any is appropriate
getContext ,
set_data , // value can be any type - legitimate
get_data , // Returns any type - legitimate
saveChatDebounced )
{
  const ctx = getContext();
  const message = ctx.chat[index];
  const isSet = !!get_data(message, SCENE_BREAK_KEY);
  const visible = get_data(message, SCENE_BREAK_VISIBLE_KEY);

  if (!isSet) {
    set_data(message, SCENE_BREAK_KEY, true);
    set_data(message, SCENE_BREAK_VISIBLE_KEY, true);
  } else {
    set_data(message, SCENE_BREAK_VISIBLE_KEY, !visible);
    if (isSet && visible && !get_data(message, SCENE_BREAK_VISIBLE_KEY)) {
      // Scene break was visible, now hidden - clear checked flags
      const chat = ctx.chat;

      // Find the next visible scene break
      let nextSceneBreakIndex = chat.length;
      for (let i = index + 1; i < chat.length; i++) {
        const isSceneBreak = get_data(chat[i], SCENE_BREAK_KEY);
        const isVisible = get_data(chat[i], SCENE_BREAK_VISIBLE_KEY);
        if (isSceneBreak && isVisible) {
          nextSceneBreakIndex = i;
          break;
        }
      }

      // Clear checked flags from hidden scene to next visible scene
      const clearedCount = clearCheckedFlagsInRange(index, nextSceneBreakIndex);
      if (clearedCount > 0) {
        debug(SUBSYSTEM.SCENE, `Scene break at ${index} hidden - cleared ${clearedCount} checked flags (range ${index}-${nextSceneBreakIndex - 1})`);
      }
    }
  }
  renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
  saveChatDebounced();

  // Re-run auto-hide logic after toggling scene break (fire-and-forget async import)
  void (async () => {
    try {
      const mod = await import('./autoHide.js');
      mod.auto_hide_messages_by_command();
    } catch (err) {
      console.error('[AutoRecap] Failed to load autoHide module:', err);
    }
  })();

  // Update navigator bar if present
  if (window.renderSceneNavigatorBar) {window.renderSceneNavigatorBar();}
}

// eslint-disable-next-line complexity -- Cleanup function with many sequential delete operations
export function clearSceneBreak(config) {
  const { index, get_message_div, getContext, saveChatDebounced } = config;
  const ctx = getContext();
  const message = ctx.chat[index];

  if (!message) {
    return;
  }

  delete message.extra?.[MODULE_NAME]?.[SCENE_BREAK_KEY];
  delete message.extra?.[MODULE_NAME]?.[SCENE_BREAK_VISIBLE_KEY];
  delete message.extra?.[MODULE_NAME]?.[SCENE_BREAK_NAME_KEY];
  delete message.extra?.[MODULE_NAME]?.[SCENE_BREAK_RECAP_KEY];
  delete message.extra?.[MODULE_NAME]?.[SCENE_RECAP_MEMORY_KEY];
  delete message.extra?.[MODULE_NAME]?.[SCENE_RECAP_HASH_KEY];
  delete message.extra?.[MODULE_NAME]?.[SCENE_RECAP_METADATA_KEY];
  delete message.extra?.[MODULE_NAME]?.[SCENE_BREAK_COLLAPSED_KEY];
  delete message.extra?.[MODULE_NAME]?.scene_recap_versions;
  delete message.extra?.[MODULE_NAME]?.scene_recap_current_index;

  const $msgDiv = get_message_div(index);
  if ($msgDiv && $msgDiv.length) {
    $msgDiv.find(`.${SCENE_BREAK_DIV_CLASS}`).remove();
  }

  saveChatDebounced();
  debug(SUBSYSTEM.SCENE, `Cleared all scene break data from message ${index}`);

  if (window.renderSceneNavigatorBar) {window.renderSceneNavigatorBar();}
}

// Handles delete scene click - fully deletes a scene with confirmation
// eslint-disable-next-line max-params, complexity, sonarjs/cognitive-complexity -- SillyTavern API dependency injection (6 functions always passed together), complex deletion workflow with lorebook restoration
export async function handleDeleteSceneClick(
  index ,
  get_message_div , // Returns jQuery object - any is appropriate
  getContext ,
  get_data , // Returns any type - legitimate
  set_data , // value can be any type - legitimate
  saveChatDebounced )
{
  const ctx = getContext();
  const chat = ctx.chat;
  const message = chat[index];

  if (!message) {
    error(SUBSYSTEM.SCENE, `Cannot delete scene - message ${index} not found`);
    return;
  }

  // Check if this is actually a scene break
  const hasSceneBreak = get_data(message, SCENE_BREAK_KEY);
  if (!hasSceneBreak) {
    error(SUBSYSTEM.SCENE, `Cannot delete scene - message ${index} is not a scene break`);
    toast('This message is not a scene break', 'warning');
    return;
  }

  // Find the previous scene break (we'll need this for clearing checked flags)
  // The deleted scene starts right after this previous scene break
  let previousSceneBreak = 0;
  for (let i = index - 1; i >= 0; i--) {
    const isSceneBreak = get_data(chat[i], SCENE_BREAK_KEY);
    const isVisible = get_data(chat[i], SCENE_BREAK_VISIBLE_KEY);
    const hasRecapData = get_data(chat[i], SCENE_RECAP_MEMORY_KEY);

    if (isSceneBreak && (isVisible === undefined || isVisible) && hasRecapData) {
      previousSceneBreak = i;
      break;
    }
  }

  // Check if this is the most recent scene (no scene breaks after this one)
  let nextSceneBreakIndex = chat.length;
  for (let i = index + 1; i < chat.length; i++) {
    const isSceneBreak = get_data(chat[i], SCENE_BREAK_KEY);
    const isVisible = get_data(chat[i], SCENE_BREAK_VISIBLE_KEY);
    const hasRecapData = get_data(chat[i], SCENE_RECAP_MEMORY_KEY);

    if (isSceneBreak && (isVisible === undefined || isVisible) && hasRecapData) {
      nextSceneBreakIndex = i;
      break;
    }
  }

  const isMostRecentScene = nextSceneBreakIndex === chat.length;

  // Find all running recap versions that merged this scene
  const runningVersions = get_running_recap_versions();
  const affectedVersions = runningVersions.filter(v => v.new_scene_index === index);

  // Build confirmation dialog message
  const deletionItems = [
    'Scene break marker and recap',
    'Lorebook snapshot for this scene',
    `${affectedVersions.length} running recap version${affectedVersions.length !== 1 ? 's' : ''} that merged this scene`
  ];

  // Only mention checked flags if this is the most recent scene
  if (isMostRecentScene) {
    const clearStartIndex = previousSceneBreak + 1;
    const estimatedFlagsToCleared = chat.length - clearStartIndex;
    deletionItems.push(`Checked flags from message ${clearStartIndex} to end of chat (~${estimatedFlagsToCleared} messages - will allow re-detection)`);
  }

  const html = `
    <div style="text-align: center !important; width: 100% !important;">
      <div style="max-width: 420px; margin: 0 auto; text-align: center !important;">
        <h3 style="text-align: center !important; color: #d32f2f;">Delete Scene?</h3>
        <p>This will permanently delete:</p>
        <ul style="text-align: left; margin: 1em auto; max-width: 380px;">
          ${deletionItems.map(item => `<li>${item}</li>`).join('')}
        </ul>
        ${!isMostRecentScene ? '<p style="color:#ff9800;"><strong>Note:</strong> This is not the most recent scene. Checked flags will NOT be cleared to preserve later scene integrity.</p>' : ''}
        <p><strong>This action cannot be undone.</strong></p>
      </div>
    </div>
  `;

  const popup = new ctx.Popup(html, ctx.POPUP_TYPE.CONFIRM, '', {
    okButton: 'Delete Scene',
    wide: true
  });

  const confirmed = await popup.show();

  if (!confirmed) {
    debug(SUBSYSTEM.SCENE, `Delete scene cancelled by user for message ${index}`);
    return;
  }

  // Delete all affected running recap versions
  let deletedVersionsCount = 0;
  for (const version of affectedVersions) {
    delete_running_recap_version(version.version);
    deletedVersionsCount++;
    debug(SUBSYSTEM.SCENE, `Deleted running recap version ${version.version} (merged scene at ${index})`);
  }

  // Clear scene break data (this also removes lorebook snapshots in metadata)
  clearSceneBreak({ index, get_message_div, getContext, saveChatDebounced });

  // Only clear checked flags if this is the most recent scene
  // (Otherwise, later scenes were already processed with knowledge of this scene existing)
  let clearedCount = 0;
  const clearStartIndex = previousSceneBreak + 1;
  if (isMostRecentScene) {
    // Clear from start of deleted scene (right after previous scene break) to end of chat
    clearedCount = clearCheckedFlagsInRange(clearStartIndex, chat.length);
    debug(SUBSYSTEM.SCENE, `Most recent scene deleted - cleared ${clearedCount} checked flags from ${clearStartIndex} (after previous scene at ${previousSceneBreak}) to end of chat`);
  } else {
    debug(SUBSYSTEM.SCENE, `Not the most recent scene - skipping checked flag clearing to preserve later scene integrity`);
  }

  // If this was the most recent scene, restore lorebook to previous scene snapshot
  let lorebookRestored = false;
  if (isMostRecentScene) {
    // Find the previous scene break with a lorebook snapshot
    let previousSceneIndex = null;
    for (let i = index - 1; i >= 0; i--) {
      const msg = chat[i];
      const prevSceneHasBreak = get_data(msg, SCENE_BREAK_KEY);
      if (prevSceneHasBreak) {
        const metadata = get_data(msg, SCENE_RECAP_METADATA_KEY);
        const currentVersionIndex = get_data(msg, 'scene_recap_current_index') ?? 0;
        const versionMetadata = metadata?.[currentVersionIndex];
        const hasLorebookSnapshot = versionMetadata && (versionMetadata.totalActivatedEntries ?? 0) > 0;

        if (hasLorebookSnapshot) {
          previousSceneIndex = i;
          break;
        }
      }
    }

    if (previousSceneIndex !== null) {
      try {
        debug(SUBSYSTEM.SCENE, `Most recent scene deleted - restoring lorebook from previous scene at ${previousSceneIndex}`);
        const result = await restoreCurrentLorebookFromSnapshot(previousSceneIndex, true);

        if (!result.cancelled) {
          lorebookRestored = true;
          log(SUBSYSTEM.SCENE, `Restored ${result.entriesRestored} entries to ${result.lorebookName}`);
        } else {
          debug(SUBSYSTEM.SCENE, 'Lorebook restoration cancelled by user');
        }
      } catch (err) {
        error(SUBSYSTEM.SCENE, `Failed to restore lorebook from previous scene:`, err);
      }
    } else {
      debug(SUBSYSTEM.SCENE, 'Most recent scene deleted but no previous scene with lorebook snapshot found');
    }
  }

  // Save and refresh everything
  saveChatDebounced();
  refresh_memory();
  cleanup_invalid_running_recaps();

  if (window.renderSceneNavigatorBar) {
    window.renderSceneNavigatorBar();
  }

  if (typeof window.updateVersionSelector === 'function') {
    window.updateVersionSelector();
  }

  // Show success message
  const details = [];
  if (deletedVersionsCount > 0) {
    details.push(`${deletedVersionsCount} running recap version${deletedVersionsCount !== 1 ? 's' : ''}`);
  }
  if (clearedCount > 0) {
    details.push(`${clearedCount} checked message${clearedCount !== 1 ? 's' : ''} (${clearStartIndex} to end)`);
  }

  let successMessage = 'Scene deleted.';
  if (details.length > 0) {
    successMessage += ` Removed ${details.join(', ')}.`;
  }
  if (lorebookRestored) {
    successMessage += ' Lorebook restored to previous scene.';
  }

  toast(successMessage, 'success');

  log(SUBSYSTEM.SCENE, `Scene at message ${index} deleted successfully`);
}

// --- Helper functions for versioned scene recaps ---
// Scene recap properties are not at the root; see file header for structure.
function getSceneRecapVersions(
message ,
get_data  // Returns any type - legitimate
) {
  // Returns the array of recap versions, or an empty array if none
  return get_data(message, 'scene_recap_versions') || [];
}

// Scene recap properties are not at the root; see file header for structure.
function setSceneRecapVersions(
message ,
set_data , // value can be any type - legitimate
versions )
{
  set_data(message, 'scene_recap_versions', versions);
}

// Scene recap properties are not at the root; see file header for structure.
function getCurrentSceneRecapIndex(
message ,
get_data  // Returns any type - legitimate
) {
  return get_data(message, 'scene_recap_current_index') ?? 0;
}

// Scene recap properties are not at the root; see file header for structure.
function setCurrentSceneRecapIndex(
message ,
set_data , // value can be any type - legitimate
idx )
{
  set_data(message, 'scene_recap_current_index', idx);
}

function getSceneRangeIndexes(
index ,
chat ,
get_data , // Returns any type - legitimate
sceneCount )
{
  // Find all visible scene breaks up to and including index
  const sceneBreakIndexes = [];
  for (let i = 0; i <= index; i++) {
    if (
    get_data(chat[i], SCENE_BREAK_KEY) && (
    get_data(chat[i], SCENE_BREAK_VISIBLE_KEY) === undefined || get_data(chat[i], SCENE_BREAK_VISIBLE_KEY)))
    {
      sceneBreakIndexes.push(i);
    }
  }
  // We want to start after the (sceneBreakIndexes.length - sceneCount - 1)th break (the (sceneCount-1)th before the current one)
  // For count=1, this is after the last break before the current one (or 0 if none)
  let startIdx = 0;
  if (sceneBreakIndexes.length >= sceneCount + 1) {
    // There are enough breaks to go back sceneCount scenes
    const idx = sceneBreakIndexes.length - sceneCount - 1;
    startIdx = sceneBreakIndexes[idx] + 1;
  }
  const endIdx = index;
  return [startIdx, endIdx];
}

// Helper: Handle generate recap button click
// eslint-disable-next-line max-params -- SillyTavern API dependency injection + UI context
async function handleGenerateRecapButtonClick(
index ,
chat ,
message ,
$sceneBreak , // jQuery object - any is appropriate
get_message_div , // Returns jQuery object - any is appropriate
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
saveChatDebounced )
{
  log(SUBSYSTEM.SCENE, "Generate button clicked for scene at index", index);

  // Use the queue-enabled generateSceneRecap function with manual flag
  await generateSceneRecap({ index, get_message_div, getContext, get_data, set_data, saveChatDebounced, skipQueue: false, manual: true });
}

// Helper: Initialize versioned recaps for backward compatibility
function initializeSceneRecapVersions(
message ,
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
saveChatDebounced )
{
  let versions = getSceneRecapVersions(message, get_data);
  let currentIdx = getCurrentSceneRecapIndex(message, get_data);

  // Get the latest recap from SCENE_BREAK_RECAP_KEY (Stage 1 stores extraction here)
  const latestRecap = get_data(message, SCENE_BREAK_RECAP_KEY) || '';

  if (versions.length === 0) {
    // No versions yet - initialize with the latest recap (or empty)
    versions = [latestRecap];
    setSceneRecapVersions(message, set_data, versions);
    setCurrentSceneRecapIndex(message, set_data, 0);
    set_data(message, SCENE_RECAP_MEMORY_KEY, latestRecap);
    set_data(message, SCENE_RECAP_HASH_KEY, computeRecapHash(latestRecap));
    saveChatDebounced();
  } else if (versions.length === 1 && !versions[0] && latestRecap) {
    // Edge case: versions was initialized with empty string, but now Stage 1 has set a recap
    // Update the empty placeholder with the actual extraction
    versions[0] = latestRecap;
    setSceneRecapVersions(message, set_data, versions);
    set_data(message, SCENE_RECAP_MEMORY_KEY, latestRecap);
    set_data(message, SCENE_RECAP_HASH_KEY, computeRecapHash(latestRecap));
    saveChatDebounced();
    debug(SUBSYSTEM.SCENE, `Updated empty placeholder version with Stage 1 extraction`);
  }

  // Clamp currentIdx to valid range
  if (currentIdx < 0) {currentIdx = 0;}
  if (currentIdx >= versions.length) {currentIdx = versions.length - 1;}

  return { versions, currentIdx };
}

// Helper: Find scene boundaries (skips empty bookmark breaks to avoid orphaning messages)
function findSceneBoundaries(
chat ,
index ,
get_data  // Returns any type - legitimate
) {
  let startIdx = 0;
  for (let i = index - 1; i >= 0; i--) {
    const isSceneBreak = get_data(chat[i], SCENE_BREAK_KEY);
    const isVisible = get_data(chat[i], SCENE_BREAK_VISIBLE_KEY);

    if (isSceneBreak && (isVisible === undefined || isVisible)) {
      // Check if this is a real scene (has recap data) or just a bookmark
      const hasRecapData = get_data(chat[i], SCENE_RECAP_MEMORY_KEY);

      if (hasRecapData) {
        // Real scene - use as boundary
        startIdx = i + 1;
        break;
      }
      // Empty bookmark - skip it and continue searching backwards
    }
  }

  const sceneMessages = [];
  for (let i = startIdx; i <= index; i++) {
    sceneMessages.push(i);
  }

  return { startIdx, sceneMessages };
}

// Helper: Check if any later scene has been combined (blocks earlier scenes from regenerating)
function hasLaterCombinedScenes(index, chat, get_data) {
  for (let i = index + 1; i < chat.length; i++) {
    const laterMessage = chat[i];
    if (!get_data(laterMessage, SCENE_BREAK_KEY)) {
      continue;
    }

    // Only count real scenes (with recap data), not empty bookmarks
    const laterRecap = get_data(laterMessage, SCENE_RECAP_MEMORY_KEY);
    if (!laterRecap) {
      continue;
    }

    const laterMetadata = get_data(laterMessage, SCENE_RECAP_METADATA_KEY) || {};
    const laterCurrentIdx = get_data(laterMessage, 'scene_recap_current_index') ?? 0;
    if (laterMetadata[laterCurrentIdx]?.combined_at) {
      return true;
    }
  }
  return false;
}

// Helper: Create restore lorebook icon for scene breaks
function createSceneRestoreLorebookIcon(messageIndex) {
  return `<i class="fa-solid fa-clock-rotate-left scene-lorebook-restore" data-message-index="${messageIndex}" title="Restore lorebook to this point in time" style="cursor:pointer; margin-left:0.5em;"></i>`;
}

// Helper: Setup compact mode detection for button row
function setupCompactModeDetection($actionsRow) {
  const el = $actionsRow[0];
  if (!el) {return;}

  const observer = new ResizeObserver(() => {
    // Temporarily remove compact mode to measure natural width
    el.classList.remove('compact-mode');
    const overflows = el.scrollWidth > el.clientWidth;
    el.classList.toggle('compact-mode', overflows);
  });

  observer.observe(el);
}

// Helper: Build scene break HTML element
function buildSceneBreakElement(index, sceneData) {// Returns jQuery object - any is appropriate
  const { startIdx, sceneMessages, sceneName, sceneRecap, isVisible, isCollapsed, versions, currentIdx, isCombined, hasLaterCombinedScene } = sceneData;

  const sceneStartLink = `<a href="javascript:void(0);" class="scene-start-link" data-testid="scene-start-link" data-mesid="${startIdx}">#${startIdx}</a>`;
  const previewIcon = `<i class="fa-solid fa-eye scene-preview-recap" data-testid="scene-preview-recap" title="Preview scene content" style="cursor:pointer; margin-left:0.5em;"></i>`;
  const lorebookIcon = createSceneBreakLorebookIcon(index);
  const restoreIcon = createSceneRestoreLorebookIcon(index);

  const stateClass = isVisible ? "sceneBreak-visible" : "sceneBreak-hidden";
  const borderClass = isVisible ? "auto_recap_scene_break_border" : "";
  const collapsedClass = isCollapsed ? "sceneBreak-collapsed" : "";
  const collapseIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
  const collapseTitle = isCollapsed ? 'Expand scene recap' : 'Collapse scene recap';

  // Disable all buttons if scene has been combined (processed and locked in)
  const disabledAttr = isCombined ? 'disabled' : '';
  const disabledStyle = isCombined ? 'opacity:0.5; cursor:not-allowed;' : '';

  // Show different message depending on why it's locked
  const lockedBadge = isCombined ? (hasLaterCombinedScene ?
    '<span style="color:#888; font-size:0.85em; margin-left:0.5em;" title="Cannot modify - later scenes already combined">[Locked - Later scenes exist]</span>' :
    '<span style="color:#888; font-size:0.85em; margin-left:0.5em;" title="Scene already combined">[Locked]</span>') : '';

  return $(`
    <div class="${SCENE_BREAK_DIV_CLASS} ${stateClass} ${borderClass} ${collapsedClass}" data-testid="scene-break-div" style="margin:0 0 5px 0;" tabindex="0">
        <div class="sceneBreak-header" style="display:flex; align-items:center; gap:0.5em; margin-bottom:0.5em;">
            <input type="text" class="sceneBreak-name auto_recap_memory_text" data-testid="scene-break-name" placeholder="Scene name..." value="${sceneName.replace(/"/g, '&quot;')}" style="flex:1;" />
            <button class="scene-delete-scene menu_button" data-testid="scene-delete-scene" title="Delete this entire scene" style="padding:0.3em 0.6em; color:#d32f2f;"><i class="fa-solid fa-trash"></i></button>
            <button class="scene-collapse-toggle menu_button fa-solid ${collapseIcon}" data-testid="scene-collapse-toggle" title="${collapseTitle}" style="padding:0.3em 0.6em;"></button>
        </div>
        <div class="sceneBreak-content">
            <div style="font-size:0.95em; color:inherit; margin-bottom:0.5em;">
                Scene: ${sceneStartLink} &rarr; #${index} (${sceneMessages.length} messages)${previewIcon}${lorebookIcon}${restoreIcon}${lockedBadge}
            </div>
            <textarea class="scene-recap-box auto_recap_memory_text" data-testid="scene-recap-box" placeholder="Scene recap..." ${disabledAttr}>${sceneRecap}</textarea>
            <div class="scene-recap-actions" style="margin-top:0.5em; display:flex; gap:0.5em;">
                <button class="scene-rollback-recap menu_button" data-testid="scene-rollback-recap" title="Go to previous recap" style="white-space:nowrap; ${disabledStyle}" ${disabledAttr}><i class="fa-solid fa-rotate-left"></i><span> Previous Recap</span></button>
                <button class="scene-generate-recap menu_button" data-testid="scene-generate-recap" title="Generate new recap" style="white-space:nowrap; ${disabledStyle}" ${disabledAttr}><i class="fa-solid fa-wand-magic-sparkles"></i><span> Generate</span></button>
                <button class="scene-rollforward-recap menu_button" data-testid="scene-rollforward-recap" title="Go to next recap" style="white-space:nowrap; ${disabledStyle}" ${disabledAttr}><i class="fa-solid fa-rotate-right"></i><span> Next Recap</span></button>
                <button class="scene-regenerate-running menu_button" data-testid="scene-regenerate-running" title="Combine this scene with current running recap" style="margin-left:auto; white-space:nowrap; ${disabledStyle}" ${disabledAttr}><i class="fa-solid fa-sync-alt"></i><span> Combine</span></button>
                <span class="version-counter" style="align-self:center; font-size:0.9em; color:inherit; margin-left:0.5em;">${versions.length > 1 ? `[${currentIdx + 1}/${versions.length}]` : ''}</span>
            </div>
        </div>
    </div>
    `);
}

/* eslint-disable max-params, max-lines-per-function -- UI rendering: 6 ST functions required, complex UI setup with many event handlers */
export function renderSceneBreak(
index ,
get_message_div , // Returns jQuery object - any is appropriate
getContext ,
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
saveChatDebounced )
{
  const $msgDiv = get_message_div(index);
  if (!$msgDiv?.length) {return;}

  $msgDiv.find(`.${SCENE_BREAK_DIV_CLASS}`).remove();

  const ctx = getContext();
  const chat = ctx.chat;
  const message = chat[index];
  const isSet = !!get_data(message, SCENE_BREAK_KEY);
  const visible = get_data(message, SCENE_BREAK_VISIBLE_KEY);
  const isVisible = visible === undefined ? true : visible;

  if (!isSet) {return;}

  // Initialize versioned recaps
  const { versions, currentIdx } = initializeSceneRecapVersions(message, get_data, set_data, saveChatDebounced);
  const sceneName = get_data(message, SCENE_BREAK_NAME_KEY) || '';

  // Get recap for display (prettify JSON for readability)
  let sceneRecap = versions[currentIdx] || '';
  let isJSON = false;
  try {
    const parsed = JSON.parse(sceneRecap);
    if (parsed && typeof parsed === 'object') {
      // For multi-stage format, display the entire multi-stage object
      // This preserves stage1, stage2, stage3 outputs for visibility
      // Prettify for display ONLY (original stored value is compact JSON)
      sceneRecap = JSON.stringify(parsed, null, 2);
      isJSON = true;
    }
  } catch {
    // Not valid JSON, use as-is
  }

  // Only convert literal newlines for non-JSON text (legacy plain text recaps)
  // For JSON, keep escaped newlines in string values to maintain valid JSON
  if (!isJSON) {
    sceneRecap = convertLiteralNewlinesToActual(sceneRecap);
  }

  let isCollapsed = get_data(message, SCENE_BREAK_COLLAPSED_KEY);
  if (isCollapsed === undefined) {
    isCollapsed = get_settings('scene_recap_default_collapsed') ?? true;
  }

  // Find scene boundaries
  const { startIdx, sceneMessages } = findSceneBoundaries(chat, index, get_data);

  // Check if this scene has been combined OR if any later scene has been combined
  const metadata = get_data(message, SCENE_RECAP_METADATA_KEY) || {};
  const thisSceneCombined = metadata[currentIdx]?.combined_at !== undefined;
  const hasLaterCombinedScene = hasLaterCombinedScenes(index, chat, get_data);
  const isCombined = thisSceneCombined || hasLaterCombinedScene;

  // Build scene break element
  const sceneData = {
    startIdx,
    sceneMessages,
    sceneName,
    sceneRecap,
    isVisible,
    isCollapsed,
    versions,
    currentIdx,
    isCombined,
    hasLaterCombinedScene,
  };
  const $sceneBreak = buildSceneBreakElement(index, sceneData);

  // === Insert after the recap box, or after message text if no recap box exists ===
  const $recapBox = $msgDiv.find(selectorsExtension.memory.text);
  if ($recapBox.length) {
    $recapBox.last().after($sceneBreak);
  } else {
    const $mesText = $msgDiv.find(selectorsSillyTavern.message.text);
    if ($mesText.length) {
      $mesText.after($sceneBreak);
    } else {
      $msgDiv.append($sceneBreak);
    }
  }

  // Setup compact mode detection for button overflow
  setupCompactModeDetection($sceneBreak.find(selectorsExtension.sceneBreak.actionsRow));

  // --- Editable handlers ---
  $sceneBreak.find(selectorsExtension.sceneBreak.name).on('change blur', function () {
    set_data(message, SCENE_BREAK_NAME_KEY, $(this).val());
    saveChatDebounced();
    // Update navigator bar to show the new name immediately
    renderSceneNavigatorBar();
  });

  // --- Collapse/expand toggle handler ---
  $sceneBreak.find(selectorsExtension.sceneBreak.collapseToggle).on('click', function (e) {
    e.stopPropagation();
    // Use same default logic as render function
    let currentCollapsed = get_data(message, SCENE_BREAK_COLLAPSED_KEY);
    if (currentCollapsed === undefined) {
      currentCollapsed = get_settings('scene_recap_default_collapsed') ?? true;
    }
    set_data(message, SCENE_BREAK_COLLAPSED_KEY, !currentCollapsed);
    saveChatDebounced();
    renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
  });

  $sceneBreak.find(selectorsExtension.sceneBreak.recapBox).on('change blur', function () {
    // Update the current version in the versions array
    const updatedVersions = getSceneRecapVersions(message, get_data).slice();
    const idx = getCurrentSceneRecapIndex(message, get_data);

    // Get value from textarea (has actual newlines from prettified display)
    let newRecap = $(this).val();
    try {
      // Parse directly (textarea has actual newlines, not literal \n strings)
      const parsed = JSON.parse(newRecap);
      // Store as compact JSON (single line, no whitespace)
      newRecap = (parsed && typeof parsed === 'object')
        ? JSON.stringify(parsed)
        : newRecap;
    } catch {
      // Not valid JSON, store as-is (no modification needed)
    }

    updatedVersions[idx] = newRecap;
    setSceneRecapVersions(message, set_data, updatedVersions);
    // Also update the legacy recap field for compatibility
    set_data(message, SCENE_BREAK_RECAP_KEY, newRecap);
    set_data(message, SCENE_RECAP_MEMORY_KEY, newRecap); // <-- ensure top-level property is set
    set_data(message, SCENE_RECAP_HASH_KEY, computeRecapHash(newRecap));
    saveChatDebounced();
  });

  // --- Hyperlink handler ---
  $sceneBreak.find(selectorsExtension.sceneBreak.startLink).on('click', function () {
    const mesid = $(this).data('mesid');
    let $target = $(`div[mesid="${mesid}"]`);
    if ($target.length) {
      // Scroll the chat container so the target is near the top
      const $chat = $(selectorsSillyTavern.chat.container);
      const chatOffset = $chat.offset()?.top ?? 0;
      const targetOffset = $target.offset()?.top ?? 0;
      const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - LOREBOOK_ENTRY_NAME_MAX_LENGTH; // 20px padding
      $chat.animate({ scrollTop }, TOAST_WARNING_DURATION_WPM);

      $target.addClass('scene-highlight');
      setTimeout(() => $target.removeClass('scene-highlight'), TOAST_SHORT_DURATION_WPM);
    } else {
      // fallback: scroll to top to try to load more messages
      const $chat = $(selectorsSillyTavern.chat.container);
      $chat.scrollTop(0);
      setTimeout(() => {
        $target = $(`div[mesid="${mesid}"]`);
        if ($target.length) {
          const chatOffset = $chat.offset()?.top ?? 0;
          const targetOffset = $target.offset()?.top ?? 0;
          const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - LOREBOOK_ENTRY_NAME_MAX_LENGTH;
          $chat.animate({ scrollTop }, TOAST_WARNING_DURATION_WPM);

          $target.addClass('scene-highlight');
          setTimeout(() => $target.removeClass('scene-highlight'), TOAST_SHORT_DURATION_WPM);
        }
      }, UI_UPDATE_DELAY_MS);
    }
  });

  // --- Preview scene content handler ---
  $sceneBreak.find(selectorsExtension.sceneBreak.previewRecap).off('click').on('click', function (e) {
    e.stopPropagation();
    const sceneCount = Number(get_settings('scene_recap_history_count')) || 1;
    const [rangeStartIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);

    const messageTypes = get_settings('scene_recap_message_types') || "both";
    const sceneObjects = [];
    for (let i = rangeStartIdx; i <= endIdx; i++) {
      const msg = chat[i];
      if (msg.mes && msg.mes.trim() !== "") {
        // Filter by message type
        const includeMessage = messageTypes === "both" ||
        messageTypes === "user" && msg.is_user ||
        messageTypes === "character" && !msg.is_user;
        if (includeMessage) {
          sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
        }
      }
    }

    const pretty = JSON.stringify(sceneObjects, null, 2);
    const html = `<div>
            <h3>Scene Content Preview</h3>
            <pre style="max-height:400px;overflow-y:auto;white-space:pre-wrap;background:#222;color:#fff;padding:1em;border-radius:4px;">${pretty}</pre>
        </div>`;
    if (ctx.callPopup) {
      ctx.callPopup(html, 'text', undefined, {
        okButton: "Close",
        wide: true,
        large: true
      });
    } else {
      alert(pretty);
    }
  });

  // --- Restore lorebook to point-in-time snapshot handler ---
  $sceneBreak.find(selectorsExtension.sceneBreak.restoreLorebook).off('click').on('click', async function (e) {
    e.stopPropagation();
    try {
      const result = await restoreCurrentLorebookFromSnapshot(index);
      if (result && !result.cancelled) {
        debug(SUBSYSTEM.LOREBOOK, `Lorebook restored from message ${index}`);
      }
    } catch (err) {
      error(SUBSYSTEM.LOREBOOK, 'Failed to restore lorebook from snapshot:', err);
    }
  });

  // --- Button handlers (prevent event bubbling to avoid toggling scene break) ---
  $sceneBreak.find(selectorsExtension.sceneBreak.generateRecap).off('click').on('click', async function (e) {
    e.stopPropagation();
    await handleGenerateRecapButtonClick(index, chat, message, $sceneBreak, get_message_div, get_data, set_data, saveChatDebounced);
  });

  $sceneBreak.find(selectorsExtension.sceneBreak.rollbackRecap).off('click').on('click', function (e) {
    e.stopPropagation();
    const idx = getCurrentSceneRecapIndex(message, get_data);
    if (idx > 0) {
      setCurrentSceneRecapIndex(message, set_data, idx - 1);
      const recap = getSceneRecapVersions(message, get_data)[idx - 1];
      set_data(message, SCENE_BREAK_RECAP_KEY, recap);
      set_data(message, SCENE_RECAP_MEMORY_KEY, recap); // <-- ensure top-level property is set
      set_data(message, SCENE_RECAP_HASH_KEY, computeRecapHash(recap));
      saveChatDebounced();
      refresh_memory(); // <-- refresh memory injection to use the newly selected recap
      renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
    }
  });
  $sceneBreak.find(selectorsExtension.sceneBreak.rollforwardRecap).off('click').on('click', function (e) {
    e.stopPropagation();
    const currentVersions = getSceneRecapVersions(message, get_data);
    const idx = getCurrentSceneRecapIndex(message, get_data);
    if (idx < currentVersions.length - 1) {
      setCurrentSceneRecapIndex(message, set_data, idx + 1);
      const recap = currentVersions[idx + 1];
      set_data(message, SCENE_BREAK_RECAP_KEY, recap);
      set_data(message, SCENE_RECAP_MEMORY_KEY, recap); // <-- ensure top-level property is set
      set_data(message, SCENE_RECAP_HASH_KEY, computeRecapHash(recap));
      saveChatDebounced();
      refresh_memory(); // <-- refresh memory injection to use the newly selected recap
      renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
    }
  });

  // --- Regenerate running recap from this scene onwards ---
  $sceneBreak.find(selectorsExtension.sceneBreak.regenerateRunning).off('click').on('click', async function (e) {
    e.stopPropagation();

    // Get the CURRENTLY SELECTED recap version
    const currentVersions = getSceneRecapVersions(message, get_data);
    const selectedIdx = getCurrentSceneRecapIndex(message, get_data);
    const currentRecap = currentVersions[selectedIdx];

    if (!currentRecap) {
      alert('This scene has no recap yet. Generate a scene recap first.');
      return;
    }

    log(SUBSYSTEM.SCENE, "Combine button clicked for scene at index", index);
    log(SUBSYSTEM.SCENE, `Using recap version ${selectedIdx + 1}/${currentVersions.length}`);

    // Extract and queue lorebook entries from the CURRENT version
    const recapHash = computeRecapHash(currentRecap);
    const lorebookOpIds = await extractAndQueueLorebookEntries(currentRecap, index, selectedIdx);

    debug(SUBSYSTEM.SCENE, `Queued ${lorebookOpIds.length} lorebook operations from recap version ${selectedIdx}`);

    // Queue combine operation with lorebook ops as dependencies
    const opId = await queueCombineSceneWithRunning(index, {
      dependencies: lorebookOpIds,
      metadata: {
        manual_combine: true,
        recap_version: selectedIdx,
        recap_hash: recapHash
      }
    });

    if (opId) {
      log(SUBSYSTEM.SCENE, "Scene combine operation queued with ID:", opId);
      toast(`Queued combine operation (${lorebookOpIds.length} lorebook entries)`, 'success');
    } else {
      error(SUBSYSTEM.SCENE, "Failed to queue scene combine operation");
      alert('Failed to queue operation. Check console for details.');
    }
  });

  // --- Delete scene handler ---
  $sceneBreak.find(selectorsExtension.sceneBreak.deleteScene).off('click').on('click', async function (e) {
    e.stopPropagation();
    await handleDeleteSceneClick(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
  });

  // --- Selection handlers for visual feedback ---
  $sceneBreak.on('mousedown', function (_e) {
    $(selectorsExtension.sceneBreak.div).removeClass(SCENE_BREAK_SELECTED_CLASS);
    $(this).addClass(SCENE_BREAK_SELECTED_CLASS);
  });
  // Remove selection when clicking outside any scene break
  $(document).off('mousedown.sceneBreakDeselect').on('mousedown.sceneBreakDeselect', function (e) {
    if (!$(e.target).closest(selectorsExtension.sceneBreak.div).length) {
      $(selectorsExtension.sceneBreak.div).removeClass(SCENE_BREAK_SELECTED_CLASS);
    }
  });
  // Also add focus/blur for keyboard navigation
  $sceneBreak.on('focusin', function () {
    $(selectorsExtension.sceneBreak.div).removeClass(SCENE_BREAK_SELECTED_CLASS);
    $(this).addClass(SCENE_BREAK_SELECTED_CLASS);
  });
  $sceneBreak.on('focusout', function () {
    $(this).removeClass(SCENE_BREAK_SELECTED_CLASS);
  });
}
/* eslint-enable max-params, max-lines-per-function -- Re-enable rules disabled for jQuery UI binding function */

export function collectSceneContent(
startIdx ,
endIdx ,
mode ,
ctx ,
_get_memory )
{
  const chat = ctx.chat;
  const result = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const msg = chat[i];
    result.push(msg.mes);
  }
  return result.join('\n');
}

// Call this after chat loads or refresh to re-render all scene breaks
export function renderAllSceneBreaks(
get_message_div , // Returns jQuery object - any is appropriate
getContext ,
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
saveChatDebounced )
{
  const ctx = getContext();
  if (!ctx?.chat) {return;}
  for (let i = 0; i < ctx.chat.length; i++) {
    const message = ctx.chat[i];
    if (get_data(message, SCENE_BREAK_KEY)) {
      // Ensure visible is set to true if undefined (for backward compatibility)
      if (get_data(message, SCENE_BREAK_VISIBLE_KEY) === undefined) {
        set_data(message, SCENE_BREAK_VISIBLE_KEY, true);
      }
    }
  }
  // Now render after all flags are set
  for (let i = 0; i < ctx.chat.length; i++) {
    const message = ctx.chat[i];
    if (get_data(message, SCENE_BREAK_KEY)) {
      renderSceneBreak(i, get_message_div, getContext, get_data, set_data, saveChatDebounced);
    }
  }
  // Update navigator bar if present
  if (window.renderSceneNavigatorBar) {window.renderSceneNavigatorBar();}
}


// Helper: Try to queue scene recap generation
async function tryQueueSceneRecap(index , manual = false) {
  debug(SUBSYSTEM.SCENE, `[Queue] Queueing scene recap generation for index ${index} (manual: ${manual})`);

  // Ensure chat lorebook exists and populate registries BEFORE queueing scene recap
  const { ensureChatLorebook } = await import('./lorebookManager.js');
  await ensureChatLorebook();

  const { queueGenerateSceneRecap } = await import('./queueIntegration.js');
  const operationId = await queueGenerateSceneRecap(index, {
    metadata: { manual }
  });

  if (operationId) {
    log(SUBSYSTEM.SCENE, `[Queue] Queued scene recap generation for index ${index}:`, operationId);
    toast(`Queued scene recap generation for message ${index}`, 'info');
    return true;
  }

  error(SUBSYSTEM.SCENE, `[Queue] Failed to enqueue scene recap generation`);
  return false;
}

// Helper: Collect scene objects for recap
export function collectSceneObjects(
startIdx ,
endIdx ,
chat )
{
  const messageTypes = get_settings('scene_recap_message_types') || "both";
  const sceneObjects = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const msg = chat[i];
    if (msg.mes && msg.mes.trim() !== "") {
      const includeMessage = messageTypes === "both" ||
      messageTypes === "user" && msg.is_user ||
      messageTypes === "character" && !msg.is_user;
      if (includeMessage) {
        sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
      }
    }
  }

  return sceneObjects;
}

// Helper: Check if a lorebook entry should be filtered out
function shouldFilterLorebookEntry(entry, suppressOtherLorebooks, chatLorebookName) {
  // Filter out internal/system entries
  if (entry.comment && entry.comment.startsWith('_registry_')) {
    return true;
  }
  if (entry.tags && entry.tags.includes('auto_lorebooks_registry')) {
    return true;
  }
  if (entry.comment === 'Auto-Recap Operations Queue') {
    return true;
  }

  // Filter to only chat lorebook entries if suppression is enabled
  if (suppressOtherLorebooks && chatLorebookName) {
    if (entry.world !== chatLorebookName) {
      return true;
    }
  }

  return false;
}

// Helper: Determine why a lorebook entry was filtered out
function getFilterReason(entry, suppressOtherLorebooks, chatLorebookName) {
  if (entry.comment && entry.comment.startsWith('_registry_')) {
    return 'registry';
  }
  if (entry.tags && entry.tags.includes('auto_lorebooks_registry')) {
    return 'registry_tag';
  }
  if (entry.comment === 'Auto-Recap Operations Queue') {
    return 'queue';
  }
  if (suppressOtherLorebooks && chatLorebookName && entry.world !== chatLorebookName) {
    return `different_lorebook(${entry.world})`;
  }
  return 'unknown';
}

// Helper: Log detailed filtering results
function logFilteringResults(options) {
  const { entries, filteredEntries, startIdx, endIdx, chatLorebookName, suppressOtherLorebooks } = options;
  const totalBeforeFiltering = entries.length;

  debug(SUBSYSTEM.SCENE, `Lorebook activation for scene ${startIdx}-${endIdx}: ${totalBeforeFiltering} total -> ${filteredEntries.length} after filtering (chatLB: ${chatLorebookName || 'none'}, suppress: ${suppressOtherLorebooks})`);

  if (filteredEntries.length > 0) {
    const keptList = filteredEntries.map(e => e.comment || e.uid || 'unnamed').join(', ');
    debug(SUBSYSTEM.SCENE, `Kept entries: ${keptList}`);
  }

  if (totalBeforeFiltering - filteredEntries.length > 0) {
    const removedCount = totalBeforeFiltering - filteredEntries.length;
    const removed = entries.filter(e => !filteredEntries.includes(e));
    const removedList = removed.map(e => {
      const reason = getFilterReason(e, suppressOtherLorebooks, chatLorebookName);
      return `${e.comment || e.uid || 'unnamed'} (reason: ${reason})`;
    }).join(', ');
    debug(SUBSYSTEM.SCENE, `Filtered out ${removedCount} entries: ${removedList}`);
  }
}

// Helper: Get active lorebook entries at a specific message position
// eslint-disable-next-line complexity -- Lorebook scanning requires detailed processing
export async function getActiveLorebooksAtPosition(endIdx, ctx, get_data) {
  const chat = ctx.chat;

  // Always calculate scene boundaries for metadata (regardless of lorebook settings)
  let startIdx = 0;
  for (let i = endIdx - 1; i >= 0; i--) {
    if (
      get_data(chat[i], SCENE_BREAK_KEY) && (
      get_data(chat[i], SCENE_BREAK_VISIBLE_KEY) === undefined || get_data(chat[i], SCENE_BREAK_VISIBLE_KEY))
    ) {
      startIdx = i + 1;
      break;
    }
  }

  const includeActiveLorebooks = get_settings('scene_recap_include_active_setting_lore');
  if (!includeActiveLorebooks) {
    return { entries: [], metadata: { startIdx, endIdx, sceneMessageCount: endIdx - startIdx + 1 } };
  }

  try {
    const { checkWorldInfo, getWorldInfoSettings, setWorldInfoSettings } = await import('../../../world-info.js');

    // Extract only scene messages (from startIdx to endIdx inclusive)
    const sceneMessages = [];
    for (let i = startIdx; i <= endIdx; i++) {
      if (chat[i]) {
        sceneMessages.push(chat[i].mes);
      }
    }

    debug(SUBSYSTEM.SCENE, `Checking lorebook activation for scene messages ${startIdx}-${endIdx} (${sceneMessages.length} messages)`);

    // Build globalScanData with character context for lorebook matching
    const globalScanData = {
      characterDescription: ctx.description || '',
      characterPersonality: ctx.personality || '',
      personaDescription: ctx.userPersonality || '',
      scenario: ctx.scenario || ''
    };

    // Get chat lorebook name and refresh cache to ensure latest entries are checked
    const chatLorebookName = getAttachedLorebook();
    if (chatLorebookName) {
      debug(SUBSYSTEM.SCENE, `Refreshing lorebook cache for: ${chatLorebookName}`);
      const { worldInfoCache } = await import('../../../world-info.js');
      worldInfoCache.delete(chatLorebookName);
      debug(SUBSYSTEM.SCENE, `Cache cleared for ${chatLorebookName}, will reload on next access`);
    }

    // CRITICAL FIX: checkWorldInfo expects messages in reverse chronological order (newest → oldest)
    // but chat array is in chronological order (oldest → newest). We must reverse before calling.
    // Override world info settings for scene recap:
    // - scan_depth: 1000 (scan entire scene, not just last N messages)
    // - min_activations: 0 (disable, otherwise it overwrites scan_depth behavior)
    // - max_recursion_steps: 1 (effectively disables recursion after first pass)
    const originalSettings = getWorldInfoSettings();
    const MAX_SCAN_DEPTH = 1000;

    // Use setWorldInfoSettings API to temporarily override WI settings
    // Note: Direct module export mutation doesn't work (ES modules have read-only bindings)
    const { world_names } = await import('../../../world-info.js');

    setWorldInfoSettings({
      world_info: originalSettings.world_info,
      world_info_depth: MAX_SCAN_DEPTH,
      world_info_min_activations: 0,
      world_info_max_recursion_steps: 1
    }, { world_names });
    debug(SUBSYSTEM.SCENE, `Temporarily overriding WI settings - scan_depth: ${MAX_SCAN_DEPTH}, min_activations: 0, max_recursion: 1 (original: ${originalSettings.world_info_depth}, ${originalSettings.world_info_min_activations}, ${originalSettings.world_info_max_recursion_steps})`);

    try {
      const reversedSceneMessages = sceneMessages.slice().reverse();
      const MAX_CONTEXT_FOR_WI_CHECK = 999999;
      const wiResult = await checkWorldInfo(reversedSceneMessages, MAX_CONTEXT_FOR_WI_CHECK, true, globalScanData);

      if (!wiResult || !wiResult.allActivatedEntries) {
        return { entries: [], metadata: { startIdx, endIdx, sceneMessageCount: sceneMessages.length } };
      }

      const suppressOtherLorebooks = get_settings('suppress_other_lorebooks');

      const entries = Array.from(wiResult.allActivatedEntries);
      const totalBeforeFiltering = entries.length;

      debug(SUBSYSTEM.SCENE, `checkWorldInfo returned ${totalBeforeFiltering} total entries`);
      if (totalBeforeFiltering > 0) {
        const entryList = entries.map(e => `${e.comment || e.uid || 'unnamed'} (world: ${e.world})`).join(', ');
        debug(SUBSYSTEM.SCENE, `Entries before filtering: ${entryList}`);
      }

      const filteredEntries = entries.filter(entry => !shouldFilterLorebookEntry(entry, suppressOtherLorebooks, chatLorebookName));

      logFilteringResults({ entries, filteredEntries, startIdx, endIdx, chatLorebookName, suppressOtherLorebooks });

      // Enhance entries with strategy metadata (matching automatic tracking format)
      const enhancedEntries = filteredEntries.map(entry => ({
        comment: entry.comment || '(unnamed)',
        uid: entry.uid,
        world: entry.world,
        key: Array.isArray(entry.key) ? [...entry.key] : [],
        position: entry.position,
        depth: entry.depth,
        order: entry.order,
        role: entry.role,
        constant: entry.constant || false,
        vectorized: entry.vectorized || false,
        sticky: entry.sticky || 0,
        strategy: entry.constant ? 'constant' : (entry.vectorized ? 'vectorized' : 'normal'),
        content: entry.content || ''
      }));

      // Load ALL entries from the chat lorebook (for point-in-time snapshot)
      let allLorebookEntries = [];
      if (chatLorebookName) {
        try {
          const { loadWorldInfo } = await import('../../../world-info.js');
          const worldData = await loadWorldInfo(chatLorebookName);
          if (worldData?.entries) {
            allLorebookEntries = Object.values(worldData.entries)
              // Exclude ONLY operation queue entry (comment === '__operation_queue')
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
            debug(SUBSYSTEM.SCENE, `Loaded ${allLorebookEntries.length} total entries from lorebook for snapshot (excluding operation queue)`);
          }
        } catch (err) {
          debug(SUBSYSTEM.SCENE, `Failed to load full lorebook for snapshot: ${err.message}`);
        }
      }

      return {
        entries: enhancedEntries,
        metadata: {
          startIdx,
          endIdx,
          sceneMessageCount: sceneMessages.length,
          totalActivatedEntries: enhancedEntries.length,
          totalBeforeFiltering,
          chatLorebookName: chatLorebookName || null,
          suppressOtherLorebooks,
          entryNames: enhancedEntries.map(e => e.comment || e.uid || 'Unnamed'),
          allEntries: allLorebookEntries // Point-in-time snapshot of ALL entries
        }
      };
    } finally {
      // Restore original world info settings
      setWorldInfoSettings({
        world_info: originalSettings.world_info,
        world_info_depth: originalSettings.world_info_depth,
        world_info_min_activations: originalSettings.world_info_min_activations,
        world_info_max_recursion_steps: originalSettings.world_info_max_recursion_steps
      }, { world_names });
      debug(SUBSYSTEM.SCENE, `Restored WI settings - scan_depth: ${originalSettings.world_info_depth}, min_activations: ${originalSettings.world_info_min_activations}, max_recursion: ${originalSettings.world_info_max_recursion_steps}`);
    }
  } catch (err) {
    debug(SUBSYSTEM.SCENE, `Failed to get active lorebooks: ${err.message}`);
    return { entries: [], metadata: { startIdx: endIdx, endIdx, sceneMessageCount: 0, error: err.message } };
  }
}

// Helper: Prepare scene recap prompt
export async function prepareScenePrompt(
sceneObjects ,
ctx ,
endIdx ,
get_data)
{
  // Configuration is logged by resolveOperationConfig()
  const config = await resolveOperationConfig('scene_recap');

  const promptTemplate = config.prompt;
  const prefill = config.prefill || "";
  const typeDefinitions = getEntityTypeDefinitionsFromSettings(extension_settings?.auto_recap);

  // Get active lorebooks if enabled (now returns { entries, metadata })
  const { entries: activeEntries, metadata: lorebookMetadata } = await getActiveLorebooksAtPosition(endIdx, ctx, get_data);
  const activeSettingLoreText = buildActiveSettingLore(activeEntries);

  // Build individual lorebook entry token breakdown
  const lorebookBreakdown = [];
  for (const entry of activeEntries) {
    const name = entry.comment || 'Unnamed Entry';
    const uid = entry.uid || '';
    const world = entry.world || '';
    const keys = (entry.key || []).join('|');

    // Format exactly as it will appear in the prompt
    const unwrappedContent = (entry.content || '')
      .trim()
      .replace(/^<setting_lore[^>]*>\s*/i, '')
      .replace(/\s*<\/setting_lore>$/i, '')
      .trim();

    const formattedEntry = `<setting_lore name="${name}" uid="${uid}" world="${world}" position="${entry.position !== undefined ? entry.position : ''}" order="${entry.order !== undefined ? entry.order : ''}" keys="${keys}">\n${unwrappedContent}\n</setting_lore>`;

    const tokens = count_tokens(formattedEntry);
    const MAX_PREVIEW = 80;
    const preview = unwrappedContent.length > MAX_PREVIEW ? `${unwrappedContent.slice(0, MAX_PREVIEW)}...` : unwrappedContent;

    lorebookBreakdown.push({
      name,
      uid,
      tokens,
      preview
    });
  }

  // Format scene messages using macro (also build individual message token breakdown)
  const formattedMessages = buildSceneMessages(sceneObjects);
  const messageBreakdown = [];

  for (const obj of sceneObjects) {
    let formatted = '';
    if (obj.type === 'message') {
      const role = obj.is_user ? 'USER' : 'CHARACTER';
      formatted = `[${role}: ${obj.name}]\n${obj.text}`;
    } else if (obj.type === 'recap') {
      formatted = `[RECAP]\n${obj.recap}`;
    }

    if (formatted) {
      const tokens = count_tokens(formatted);
      const MAX_PREVIEW = 80;
      const previewText = obj.type === 'message' ? obj.text : obj.recap;
      const preview = previewText.length > MAX_PREVIEW ? `${previewText.slice(0, MAX_PREVIEW)}...` : previewText;

      messageBreakdown.push({
        index: obj.type === 'message' ? obj.index : -1, // Use -1 for recaps
        tokens,
        preview,
        type: obj.type
      });
    }
  }

  // Count tokens for messages and lorebooks separately for proper breakdown
  const messagesTokenCount = count_tokens(formattedMessages);
  const lorebooksTokenCount = count_tokens(activeSettingLoreText);

  // Build all macro values from context - all macros available on all prompts
  const params = buildAllMacroParams({
    sceneObjects,
    typeDefinitions,
    activeEntries,
    prefillText: prefill
  });

  const prompt = await substitute_params(promptTemplate, params);

  return { prompt, prefill, lorebookMetadata: { ...lorebookMetadata, entries: activeEntries }, messagesTokenCount, lorebooksTokenCount, messageBreakdown, lorebookBreakdown };
}

// Helper: Calculate total request tokens for scene recap (uses centralized token breakdown)
export async function calculateSceneRecapTokens(options) {
  const { prompt, includePreset, preset, prefill, operationType, messagesTokenCount = null, lorebooksTokenCount = null, messageBreakdown = null, lorebookBreakdown = null } = options;
  const { calculateTokenBreakdown } = await import('./tokenBreakdown.js');

  const breakdown = await calculateTokenBreakdown({
    prompt,
    includePreset,
    preset,
    prefill,
    operationType,
    messagesTokenCount,
    lorebooksTokenCount,
    messageBreakdown,
    lorebookBreakdown
  });

  return breakdown.total;
}

// Helper: Extract and validate JSON from AI response (REMOVED - now uses centralized helper in utils.js)

// Helper: Normalize Stage 1 extraction response - supports entity-based and legacy formats
// Uses centralzied normalizeStageOutput for field/value normalization
function normalizeStage1Extraction(parsed) {
  const facetKeys = ['plot', 'goals', 'reveals', 'state', 'tone', 'stance', 'voice', 'quotes', 'appearance', 'verbatim', 'docs'];

  // Plain array format (legacy) - wrap as chronological_items
  if (Array.isArray(parsed)) {
    debug(SUBSYSTEM.SCENE, "Stage 1 returned plain array format (legacy), wrapped as chronological_items");
    return { chronological_items: parsed };
  }

  // Already wrapped format (legacy)
  if (parsed && Array.isArray(parsed.chronological_items)) {
    debug(SUBSYSTEM.SCENE, "Stage 1 returned wrapped object format (legacy)");
    return parsed;
  }

  // Entity-based format (current pipeline): {sn, plot/rc, entities (array)}
  // Check if it has entities array and a recap field (plot/rc/recap)
  const hasRecapField = parsed?.plot !== undefined || parsed?.rc !== undefined || parsed?.recap !== undefined;
  if (parsed && typeof parsed === 'object' && hasRecapField && Array.isArray(parsed.entities)) {
    // Use centralized normalization - handles field names and object→string conversion
    const normalized = normalizeStageOutput(STAGE.EXTRACTION, parsed);
    debug(SUBSYSTEM.SCENE, `Stage 1 returned entity-based format: ${normalized.entities.length} entities, plot length=${normalized.plot?.length || 0}, sn="${normalized.sn || ''}"`);
    return normalized;
  }

  // Faceted format (legacy 3-stage pipeline) - preserve as-is including sn
  if (parsed && typeof parsed === 'object') {
    const hasFacets = facetKeys.some(key => Array.isArray(parsed[key]));
    if (hasFacets) {
      const populatedFacets = facetKeys.filter(key => Array.isArray(parsed[key]) && parsed[key].length > 0);
      const totalItems = populatedFacets.reduce((sum, key) => sum + parsed[key].length, 0);
      debug(SUBSYSTEM.SCENE, `Stage 1 returned faceted format: ${totalItems} items in ${populatedFacets.length} facets (${populatedFacets.join(', ')}), sn="${parsed.sn || ''}"`);
      // Return as-is to preserve faceted structure for Stage 2
      return parsed;
    }
  }

  throw new Error("Stage 1 extraction must return either: (1) array, (2) {chronological_items: [...]}, (3) faceted object with arrays, or (4) entity-based {plot: string, entities: array}");
}

// Helper: Validate Stage 1 extraction has non-empty content
function validateStage1Content(parsed) {
  const facetKeys = ['plot', 'goals', 'reveals', 'state', 'tone', 'stance', 'voice', 'quotes', 'appearance', 'verbatim', 'docs'];
  // Accept both "plot" and "rc" as the summary field (already normalized in normalizeStage1Extraction)
  const plotField = parsed.plot ?? parsed.rc;
  const isEntityFormat = typeof plotField === 'string' && Array.isArray(parsed.entities);
  const isLegacyFormat = Array.isArray(parsed.chronological_items);
  const isFacetedFormat = facetKeys.some(key => Array.isArray(parsed[key]));

  if (isEntityFormat) {
    if (parsed.entities.length === 0 && !plotField?.trim()) {
      throw new Error("AI returned empty extraction (no entities and no plot)");
    }
    debug(SUBSYSTEM.SCENE, `Validated Stage 1 extraction (entity-based): ${parsed.entities.length} entities, plot length=${plotField.length}, sn="${parsed.sn || ''}"`);
  } else if (isLegacyFormat) {
    if (parsed.chronological_items.length === 0) {
      throw new Error("AI returned empty extraction (no items)");
    }
    debug(SUBSYSTEM.SCENE, `Validated Stage 1 extraction (legacy): ${parsed.chronological_items.length} items`);
  } else if (isFacetedFormat) {
    const totalItems = facetKeys.reduce((sum, key) => sum + (Array.isArray(parsed[key]) ? parsed[key].length : 0), 0);
    if (totalItems === 0) {
      throw new Error("AI returned empty extraction (no items in any facet)");
    }
    debug(SUBSYSTEM.SCENE, `Validated Stage 1 extraction (faceted): ${totalItems} items, sn="${parsed.sn || ''}"`);
  } else {
    throw new Error("Stage 1 extraction must contain either chronological_items array, faceted arrays, or entity-based {plot, entities}");
  }
}

// Helper: Generate recap with error handling
async function executeSceneRecapGeneration(llmConfig, range, ctx, profileId, operationType) {
  const { prompt, prefill, include_preset_prompts = false, preset_name = null, messagesTokenCount = null, lorebooksTokenCount = null, messageBreakdown = null, lorebookBreakdown = null } = llmConfig;
  const { startIdx, endIdx } = range;

  let recap = "";
  let tokenBreakdown = null;
  try {
    ctx.deactivateSendButtons();
    debug(SUBSYSTEM.SCENE, "Sending prompt to AI:", prompt);

    // Set operation context for ST_METADATA
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    setOperationSuffix(`-${startIdx}-${endIdx}`);

    // Calculate and log token breakdown BEFORE sending
    await calculateSceneRecapTokens({
      prompt,
      includePreset: include_preset_prompts,
      preset: preset_name,
      prefill,
      operationType,
      messagesTokenCount,
      lorebooksTokenCount,
      messageBreakdown,
      lorebookBreakdown
    });

    try {
      const { sendLLMRequest } = await import('./llmClient.js');

      const options = {
        includePreset: include_preset_prompts,
        preset: preset_name,
        prefill,
        trimSentences: false,
        messagesTokenCount,
        lorebooksTokenCount,
        messageBreakdown,
        lorebookBreakdown
      };

      const rawResponse = await sendLLMRequest(profileId, prompt, operationType, options);
      debug(SUBSYSTEM.SCENE, "AI response:", rawResponse);

      // Extract token breakdown from response
      const { extractTokenBreakdownFromResponse } = await import('./tokenBreakdown.js');
      tokenBreakdown = extractTokenBreakdownFromResponse(rawResponse);

      // Extract and validate JSON using centralized helper
      const { extractJsonFromResponse } = await import('./utils.js');

      // Stage 1 format evolution:
      // 1. Plain array: ["item1", "item2"]
      // 2. Wrapped object: {"chronological_items": ["item1", "item2"]}
      // 3. Categorized object: {"plot": [...], "goals": [...], "reveals": [...], ...}
      const rawParsed = extractJsonFromResponse(rawResponse, {
        requiredFields: [],  // No required fields - accept any valid JSON
        context: 'Stage 1 scene recap extraction'
      });

      // Normalize Stage 1 response (handles entity-based, faceted, and legacy formats)
      const parsed = normalizeStage1Extraction(rawParsed);

      // Validate non-empty content
      validateStage1Content(parsed);

      // Convert back to JSON string for storage
      recap = JSON.stringify(parsed);
    } finally {
      clearOperationSuffix();
    }
  } catch (err) {
    recap = "Error generating recap: " + (err?.message || err);
    error(SUBSYSTEM.SCENE, "Error generating recap:", err);
    throw err;
  } finally {
    ctx.activateSendButtons();
  }
  return { recap, tokenBreakdown };
}

// Helper: Save scene recap and queue lorebook entries

// Helper: Get message range string for scene name suffix
function getMessageRangeForSceneName(lorebookMetadata) {
  if (!lorebookMetadata) {
    throw new Error('lorebookMetadata is required for scene name range suffix');
  }
  if (lorebookMetadata.startIdx === undefined) {
    throw new Error('lorebookMetadata.startIdx is required for scene name range suffix');
  }
  if (lorebookMetadata.endIdx === undefined) {
    throw new Error('lorebookMetadata.endIdx is required for scene name range suffix');
  }
  const range = `${lorebookMetadata.startIdx}-${lorebookMetadata.endIdx}`;
  debug(SUBSYSTEM.SCENE, `Scene name range from actual recap generation: ${range}`);
  return range;
}


export async function saveSceneRecap(config) {
  const { message, recap, get_data, set_data, saveChatDebounced, messageIndex, lorebookMetadata, manual = false } = config;
  const updatedVersions = getSceneRecapVersions(message, get_data).slice();
  updatedVersions.push(recap);
  setSceneRecapVersions(message, set_data, updatedVersions);
  setCurrentSceneRecapIndex(message, set_data, updatedVersions.length - 1);
  set_data(message, SCENE_BREAK_RECAP_KEY, recap);
  set_data(message, SCENE_RECAP_MEMORY_KEY, recap);
  set_data(message, SCENE_RECAP_HASH_KEY, computeRecapHash(recap));

  // Store lorebook metadata for this version
  if (lorebookMetadata) {
    const existingMetadata = get_data(message, SCENE_RECAP_METADATA_KEY) || {};
    const versionIndex = updatedVersions.length - 1;

    // Store metadata WITHOUT snapshot data (allEntries/entries)
    // Snapshot will be populated by updateSceneLorebookSnapshot() after lorebook entries are created
    const { allEntries, entries, entryNames, ...metadataWithoutSnapshot } = lorebookMetadata;

    existingMetadata[versionIndex] = {
      timestamp: Date.now(),
      ...metadataWithoutSnapshot,
      // Placeholder empty arrays - will be populated by updateSceneLorebookSnapshot()
      allEntries: [],
      entries: [],
      // Track which lorebook entry UIDs were created by this recap version
      created_entry_uids: []
    };
    set_data(message, SCENE_RECAP_METADATA_KEY, existingMetadata);
    debug(SUBSYSTEM.SCENE, `Stored lorebook metadata for version ${versionIndex} (snapshot pending)`);

    // NOTE: We no longer persist to message.extra here because:
    // 1. It would store BEFORE state (wrong snapshot)
    // 2. Versioned metadata is now the primary source (message.extra is legacy fallback only)
    // 3. updateSceneLorebookSnapshot() will populate the correct AFTER state snapshot
  }

  saveChatDebounced();
  refresh_memory();

  // If the recap is JSON and contains a scene name (sn or scene_name), use it
  debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] Starting auto scene name check for message ${messageIndex}`);
  try {
    const parsed = JSON.parse(recap);
    debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] JSON parse succeeded for message ${messageIndex}`);

    // Check for sn (3-stage pipeline) or scene_name (legacy) or stage1.sn (multi-stage storage)
    const maybeName = typeof parsed.sn === 'string' ? parsed.sn
      : typeof parsed.scene_name === 'string' ? parsed.scene_name
      : typeof parsed.stage1?.sn === 'string' ? parsed.stage1.sn
      : '';
    const existing = get_data(message, SCENE_BREAK_NAME_KEY);

    debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] scene name from JSON: "${maybeName}" (sn: ${typeof parsed.sn}, scene_name: ${typeof parsed.scene_name}, stage1.sn: ${typeof parsed.stage1?.sn})`);
    debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] existing name from data: "${existing}" (type: ${typeof existing}, truthy: ${!!existing})`);

    if (maybeName && !existing) {
      debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] Condition passed - proceeding with auto-naming`);
      let clean = maybeName.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\n/g, ' ')
        .trim();
      debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] Cleaned name: "${clean}" (length: ${clean.length})`);

      if (clean.length > SCENE_BREAK_CHARS) {
        clean = clean.slice(0, SCENE_BREAK_MIN_CHARS) + '...';
        debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] Truncated to: "${clean}"`);
      }
      if (clean) {
        // Append message range if setting is enabled
        const settings = extension_settings[MODULE_NAME];
        if (settings.scene_name_append_range) {
          debug(SUBSYSTEM.SCENE, `Appending message range for scene at index ${messageIndex}`);
          const messageRange = getMessageRangeForSceneName(lorebookMetadata);
          clean = `${clean} ${messageRange}`;
          debug(SUBSYSTEM.SCENE, `Scene name with range: "${clean}"`);
        }

        set_data(message, SCENE_BREAK_NAME_KEY, clean);
        debug(SUBSYSTEM.SCENE, `Set scene name for message ${messageIndex}: "${clean}"`);
        // Update scene navigator immediately if available
        try { renderSceneNavigatorBar(); } catch {}
      } else {
        debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] Clean name is empty - skipping auto-naming`);
      }
    } else {
      debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] Condition failed - maybeName: ${!!maybeName}, !existing: ${!existing}`);
    }
  } catch (err) {
    debug(SUBSYSTEM.SCENE, `[AUTO SCENE NAME] JSON parse failed for message ${messageIndex}:`, err.message);
  }

  // Extract and queue lorebook entries (skip for manual generation)
  let lorebookOpIds = [];
  if (recap && !manual) {
    const versionIndex = updatedVersions.length - 1;
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE RECAP] Calling extractAndQueueLorebookEntries for message ${messageIndex}, version ${versionIndex}...`);
    lorebookOpIds = await extractAndQueueLorebookEntries(recap, messageIndex, versionIndex);
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE RECAP] extractAndQueueLorebookEntries completed for message ${messageIndex}, version ${versionIndex}`);
  } else if (manual) {
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE RECAP] Skipping lorebook extraction - manual generation`);
  } else {
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE RECAP] Skipping lorebook extraction - no recap available`);
  }
  return lorebookOpIds;
}

// Helper: Check if lorebook is empty at scene start (only internal entries exist)
async function checkLorebookEmptyState(messageIndex, versionIndex) {
  try {
    const lorebookName = getAttachedLorebook();
    if (!lorebookName) {
      debug(SUBSYSTEM.SCENE, `[EMPTY CHECK] No lorebook attached for message ${messageIndex}, version ${versionIndex}`);
      return false;
    }

    // Invalidate cache to ensure fresh read
    await invalidateLorebookCache(lorebookName);

    // Get all entries
    const entries = await getLorebookEntries(lorebookName);
    if (!entries || !Array.isArray(entries)) {
      debug(SUBSYSTEM.SCENE, `[EMPTY CHECK] Failed to load entries for lorebook: ${lorebookName}`);
      return false;
    }

    // Filter out internal entries
    const realEntries = entries.filter(entry => !isInternalEntry(entry?.comment));

    const isEmpty = realEntries.length === 0;
    debug(SUBSYSTEM.SCENE, `[EMPTY CHECK] Lorebook "${lorebookName}" for message ${messageIndex}, version ${versionIndex}: ${isEmpty ? 'EMPTY' : 'HAS ENTRIES'} (${entries.length} total, ${realEntries.length} real)`);

    return isEmpty;
  } catch (err) {
    error(SUBSYSTEM.SCENE, `[EMPTY CHECK] Error checking lorebook empty state for message ${messageIndex}, version ${versionIndex}:`, err);
    return false;
  }
}

// Helper: Normalize and deduplicate sl entries for lorebook processing
// sl format: { t: type, n: name, c: content, k: keywords, u: uid (optional) }
// expected format: { name, comment, type, keys, content, uid (optional) }
function normalizeAndDeduplicateEntries(entriesArray) {
  const seenNames = new Set();
  const uniqueEntries = [];

  for (const entry of entriesArray) {
    const rawName = entry.n || entry.name || entry.comment;
    if (!entry || !rawName) { continue; }

    const entryName = rawName.toLowerCase().trim();
    if (seenNames.has(entryName)) {
      debug(SUBSYSTEM.SCENE, `Skipping duplicate lorebook entry: ${rawName}`);
      continue;
    }
    seenNames.add(entryName);

    const normalized = {
      name: rawName,
      comment: rawName,
      content: entry.c || entry.content || '',
      type: entry.t || entry.type || 'character',
      keys: entry.k || entry.keys || [rawName]
    };

    // Pass through uid if Stage 4 identified an exact match
    // Accept both "uid" (explicit) and "u" (legacy short form) for backwards compatibility
    if (entry.uid || entry.u) {
      normalized.uid = entry.uid || entry.u;
    }

    uniqueEntries.push(normalized);
  }

  return uniqueEntries;
}

// Helper: Find entities array from parsed recap data (supports multiple formats)
function findEntitiesArray(parsed) {
  // Check in order of preference: new format → legacy format → nested stage data
  const candidates = [
    parsed.entities,
    parsed.stage4?.entities,
    parsed.sl,
    parsed.stage4?.sl,
    parsed.stage3?.entities,
    parsed.stage3?.sl,
    parsed.setting_lore
  ];
  return candidates.find(c => Array.isArray(c)) || null;
}

// Helper: Extract lorebooks from recap JSON and queue each as individual operation
// Note: Recap should already be clean JSON from executeSceneRecapGeneration()
async function extractAndQueueLorebookEntries(recap, messageIndex, versionIndex) {
  debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Starting for message ${messageIndex}, version ${versionIndex}`);
  try {
    const recapHash = computeRecapHash(recap);
    debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Recap hash: ${recapHash}`);
    const RECAP_DEBUG_LENGTH = 200;
    debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Recap length: ${recap.length}, first ${RECAP_DEBUG_LENGTH} chars: ${recap.slice(0, RECAP_DEBUG_LENGTH)}`);

    // Parse JSON (should already be clean from generation)
    const parsed = JSON.parse(recap);

    // Find entities array from any supported format
    const entriesArray = findEntitiesArray(parsed);
    if (entriesArray) {
      debug(SUBSYSTEM.SCENE, `Found ${entriesArray.length} sl/setting_lore entries in scene recap at index ${messageIndex}`);

      // Check if lorebook is empty at scene start (optimization for first scene)
      const lorebookWasEmptyAtSceneStart = await checkLorebookEmptyState(messageIndex, versionIndex);

      // Normalize and deduplicate entries
      const uniqueEntries = normalizeAndDeduplicateEntries(entriesArray);
      debug(SUBSYSTEM.SCENE, `After deduplication: ${uniqueEntries.length} unique entries (removed ${entriesArray.length - uniqueEntries.length} duplicates)`);

      // Queue each unique entry individually and collect operation IDs
      debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Queueing ${uniqueEntries.length} unique entries...`);
      const lorebookOpIds = [];
      for (const entry of uniqueEntries) {
        // Sequential execution required: entries must be queued in order
        debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Calling queueProcessLorebookEntry for: ${entry.name || entry.comment}`);
        // eslint-disable-next-line no-await-in-loop -- Lorebook entries must be queued sequentially to maintain processing order
        const opId = await queueProcessLorebookEntry(entry, messageIndex, recapHash, { metadata: { version_index: versionIndex, lorebook_was_empty_at_scene_start: lorebookWasEmptyAtSceneStart } });
        if (opId) {
          debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] ✓ Queued lorebook entry: ${entry.name || entry.comment} (op: ${opId})`);
          lorebookOpIds.push(opId);
        } else {
          debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] ✗ Failed to queue lorebook entry: ${entry.name || entry.comment} (returned null/undefined)`);
        }
      }
      debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Finished queueing all entries`);
      return lorebookOpIds;
    } else {
      debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] No sl/setting_lore array found in scene recap at index ${messageIndex}`);
    }
  } catch (err) {
    // Not JSON or parsing failed - skip lorebook processing
    debug(SUBSYSTEM.SCENE, `Scene recap is not JSON, skipping lorebook extraction: ${err.message}`);
  }
  return [];
}


export async function generateSceneRecap(config) {
  const { index, get_message_div, getContext, get_data, set_data, saveChatDebounced, skipQueue = false, signal = null, manual = false } = config;
  const ctx = getContext();
  const chat = ctx.chat;
  const message = chat[index];

  // Try queueing if not bypassed
  if (!skipQueue) {
    const enqueued = await tryQueueSceneRecap(index, manual);
    if (enqueued) {
      return null;
    }
    // Queue is required. If enqueue failed, abort rather than running directly.
    error(SUBSYSTEM.SCENE, `Failed to enqueue scene recap generation for index ${index}. Aborting.`);
    toast('Queue required: failed to enqueue scene recap generation. Aborting.', 'error');
    return null;
  }

  // Direct execution path is only used by queue handler (skipQueue=true)
  debug(SUBSYSTEM.SCENE, `Executing scene recap generation directly for index ${index} (skipQueue=true, manual=${manual})`);

  // Get scene range and collect objects
  const sceneCount = Number(get_settings('scene_recap_history_count')) || 1;
  const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
  const sceneObjects = collectSceneObjects(startIdx, endIdx, chat);

  // Prepare prompt (now returns lorebook metadata and token counts)
  const { prompt, prefill, lorebookMetadata, messagesTokenCount, lorebooksTokenCount, messageBreakdown, lorebookBreakdown } = await prepareScenePrompt(sceneObjects, ctx, endIdx, get_data);

  // Debug: Check if {{user}} is in the final prompt
  if (prompt.includes('{{user}}')) {
    debug(SUBSYSTEM.SCENE, 'WARNING: {{user}} macro still in prompt after prepareScenePrompt!');
  }

  // Generate recap with connection profile/preset switching
  const operationConfig = await resolveOperationConfig('scene_recap');
  const profile_name = operationConfig.connection_profile || '';
  const preset_name = operationConfig.completion_preset_name;
  const include_preset_prompts = operationConfig.include_preset_prompts;

  const { OperationType } = await import('./operationTypes.js');
  const { resolveProfileId } = await import('./profileResolution.js');
  const effectiveProfile = resolveProfileId(profile_name);
  const llmConfig = { prompt, prefill, include_preset_prompts, preset_name, messagesTokenCount, lorebooksTokenCount, messageBreakdown, lorebookBreakdown };
  const range = { startIdx, endIdx };
  const { recap, tokenBreakdown } = await executeSceneRecapGeneration(llmConfig, range, ctx, effectiveProfile, OperationType.GENERATE_SCENE_RECAP);

  // Check if operation was cancelled while LLM call was in progress
  if (signal?.aborted) {
    debug(SUBSYSTEM.SCENE, `Scene recap cancelled for index ${index}, discarding result without saving`);
    throw new Error('Operation cancelled by user');
  }

  // Stage 1 (extraction only): Store in multi-stage format
  // Stage 2 (ORGANIZE_SCENE_RECAP) and Stage 3 (PARSE_SCENE_RECAP) will add their outputs
  debug(SUBSYSTEM.SCENE, `Storing Stage 1 extraction data for index ${index}`);

  // Parse the recap JSON and wrap in multi-stage format
  let stage1Data;
  try {
    stage1Data = JSON.parse(recap);
  } catch {
    stage1Data = recap;
  }
  const multiStageData = { stage1: stage1Data };
  const multiStageJson = JSON.stringify(multiStageData);

  // Store extraction data in multi-stage format (no versioning, no lorebook ops yet)
  // Set both keys so renderSceneBreak() can display the extraction while later stages are pending
  set_data(message, SCENE_RECAP_MEMORY_KEY, multiStageJson);
  set_data(message, SCENE_BREAK_RECAP_KEY, multiStageJson);

  // Store lorebook metadata for Stage 2 to use when appending message range to scene name
  set_data(message, 'stage1_lorebook_metadata', lorebookMetadata);
  debug(SUBSYSTEM.SCENE, `Stored Stage 1 lorebook metadata for index ${index}: startIdx=${lorebookMetadata?.startIdx}, endIdx=${lorebookMetadata?.endIdx}`);

  saveChatDebounced();

  // Mark all messages in this scene as checked to prevent auto-detection from splitting the scene
  const markedCount = setCheckedFlagsInRange(startIdx, endIdx);
  if (markedCount > 0) {
    debug(SUBSYSTEM.SCENE, `Marked ${markedCount} messages in scene (${startIdx}-${endIdx}) as checked after extraction`);
  }

  renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);

  return { recap, tokenBreakdown };
}

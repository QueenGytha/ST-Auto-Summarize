

import {
  get_settings,
  recap_text,
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
  convertActualNewlinesToLiteral } from
'./index.js';
import {
  queueCombineSceneWithRunning,
  queueProcessLorebookEntry } from
'./queueIntegration.js';
import { clearCheckedFlagsInRange, setCheckedFlagsInRange } from './autoSceneBreakDetection.js';
import { getConfiguredEntityTypeDefinitions, formatEntityTypeListForPrompt } from './entityTypes.js';
import { getAttachedLorebook } from './lorebookManager.js';

import {
  MAX_RECAP_ATTEMPTS,
  ID_GENERATION_BASE,
  LOREBOOK_ENTRY_NAME_MAX_LENGTH,
  TOAST_WARNING_DURATION_WPM,
  TOAST_SHORT_DURATION_WPM,
  UI_UPDATE_DELAY_MS,
  SCENE_BREAK_CHARS,
  SCENE_BREAK_MIN_CHARS,
  DEFAULT_POLLING_INTERVAL
} from './constants.js';

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

  // Use the queue-enabled generateSceneRecap function
  await generateSceneRecap({ index, get_message_div, getContext, get_data, set_data, saveChatDebounced, skipQueue: false });
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

  if (versions.length === 0) {
    const initialRecap = get_data(message, SCENE_BREAK_RECAP_KEY) || '';
    versions = [initialRecap];
    setSceneRecapVersions(message, set_data, versions);
    setCurrentSceneRecapIndex(message, set_data, 0);
    set_data(message, SCENE_RECAP_MEMORY_KEY, initialRecap);
    set_data(message, SCENE_RECAP_HASH_KEY, computeRecapHash(initialRecap));
    saveChatDebounced();
  }

  // Clamp currentIdx to valid range
  if (currentIdx < 0) {currentIdx = 0;}
  if (currentIdx >= versions.length) {currentIdx = versions.length - 1;}

  return { versions, currentIdx };
}

// Helper: Find scene boundaries
function findSceneBoundaries(
chat ,
index ,
get_data  // Returns any type - legitimate
) {
  let startIdx = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (
    get_data(chat[i], SCENE_BREAK_KEY) && (
    get_data(chat[i], SCENE_BREAK_VISIBLE_KEY) === undefined || get_data(chat[i], SCENE_BREAK_VISIBLE_KEY)))
    {
      startIdx = i + 1;
      break;
    }
  }

  const sceneMessages = [];
  for (let i = startIdx; i <= index; i++) {
    sceneMessages.push(i);
  }

  return { startIdx, sceneMessages };
}

// Helper: Build scene break HTML element
function buildSceneBreakElement(index, sceneData) {// Returns jQuery object - any is appropriate
  const { startIdx, sceneMessages, sceneName, sceneRecap, isVisible, isCollapsed, versions, currentIdx } = sceneData;

  const sceneStartLink = `<a href="javascript:void(0);" class="scene-start-link" data-testid="scene-start-link" data-mesid="${startIdx}">#${startIdx}</a>`;
  const previewIcon = `<i class="fa-solid fa-eye scene-preview-recap" data-testid="scene-preview-recap" title="Preview scene content" style="cursor:pointer; margin-left:0.5em;"></i>`;
  const lorebookIcon = createSceneBreakLorebookIcon(index);

  const stateClass = isVisible ? "sceneBreak-visible" : "sceneBreak-hidden";
  const borderClass = isVisible ? "auto_recap_scene_break_border" : "";
  const collapsedClass = isCollapsed ? "sceneBreak-collapsed" : "";
  const collapseIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
  const collapseTitle = isCollapsed ? 'Expand scene recap' : 'Collapse scene recap';

  return $(`
    <div class="${SCENE_BREAK_DIV_CLASS} ${stateClass} ${borderClass} ${collapsedClass}" data-testid="scene-break-div" style="margin:0 0 5px 0;" tabindex="0">
        <div class="sceneBreak-header" style="display:flex; align-items:center; gap:0.5em; margin-bottom:0.5em;">
            <input type="text" class="sceneBreak-name auto_recap_memory_text" data-testid="scene-break-name" placeholder="Scene name..." value="${sceneName.replace(/"/g, '&quot;')}" style="flex:1;" />
            <button class="scene-collapse-toggle menu_button fa-solid ${collapseIcon}" data-testid="scene-collapse-toggle" title="${collapseTitle}" style="padding:0.3em 0.6em;"></button>
        </div>
        <div class="sceneBreak-content">
            <div style="font-size:0.95em; color:inherit; margin-bottom:0.5em;">
                Scene: ${sceneStartLink} &rarr; #${index} (${sceneMessages.length} messages)${previewIcon}${lorebookIcon}
            </div>
            <textarea class="scene-recap-box auto_recap_memory_text" data-testid="scene-recap-box" placeholder="Scene recap...">${sceneRecap}</textarea>
            <div class="scene-recap-actions" style="margin-top:0.5em; display:flex; gap:0.5em;">
                <button class="scene-rollback-recap menu_button" data-testid="scene-rollback-recap" title="Go to previous recap" style="white-space:nowrap;"><i class="fa-solid fa-rotate-left"></i> Previous Recap</button>
                <button class="scene-generate-recap menu_button" data-testid="scene-generate-recap" title="Generate recap for this scene" style="white-space:nowrap;"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate</button>
                <button class="scene-rollforward-recap menu_button" data-testid="scene-rollforward-recap" title="Go to next recap" style="white-space:nowrap;"><i class="fa-solid fa-rotate-right"></i> Next Recap</button>
                <button class="scene-regenerate-running menu_button" data-testid="scene-regenerate-running" title="Combine this scene with current running recap" style="margin-left:auto; white-space:nowrap;"><i class="fa-solid fa-sync-alt"></i> Combine</button>
                <span style="align-self:center; font-size:0.9em; color:inherit; margin-left:0.5em;">${versions.length > 1 ? `[${currentIdx + 1}/${versions.length}]` : ''}</span>
            </div>
        </div>
    </div>
    `);
}

/* eslint-disable max-params -- UI rendering: 6 ST functions required */
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
  const sceneRecap = convertLiteralNewlinesToActual(versions[currentIdx] || '');

  let isCollapsed = get_data(message, SCENE_BREAK_COLLAPSED_KEY);
  if (isCollapsed === undefined) {
    isCollapsed = get_settings('scene_recap_default_collapsed') ?? true;
  }

  // Find scene boundaries
  const { startIdx, sceneMessages } = findSceneBoundaries(chat, index, get_data);

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
    const newRecap = convertActualNewlinesToLiteral($(this).val());
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
    const loadedSceneRecap = get_data(message, SCENE_RECAP_MEMORY_KEY);
    if (!loadedSceneRecap) {
      alert('This scene has no recap yet. Generate a scene recap first.');
      return;
    }

    log(SUBSYSTEM.SCENE, "Combine scene with running recap button clicked for scene at index", index);

    // Queue the operation - this will lock the UI and process through the queue
    const opId = await queueCombineSceneWithRunning(index);

    if (opId) {
      log(SUBSYSTEM.SCENE, "Scene combine operation queued with ID:", opId);
      toast('Scene combine operation queued', 'success');
    } else {
      error(SUBSYSTEM.SCENE, "Failed to queue scene combine operation");
      alert('Failed to queue operation. Check console for details.');
    }
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
/* eslint-enable max-params -- Re-enable rule disabled for jQuery UI binding function */

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
async function tryQueueSceneRecap(index ) {
  debug(SUBSYSTEM.SCENE, `[Queue] Queueing scene recap generation for index ${index}`);

  const { queueGenerateSceneRecap } = await import('./queueIntegration.js');
  const operationId = await queueGenerateSceneRecap(index);

  if (operationId) {
    log(SUBSYSTEM.SCENE, `[Queue] Queued scene recap generation for index ${index}:`, operationId);
    toast(`Queued scene recap generation for message ${index}`, 'info');
    return true;
  }

  error(SUBSYSTEM.SCENE, `[Queue] Failed to enqueue scene recap generation`);
  return false;
}

// Helper: Collect scene objects for recap
function collectSceneObjects(
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

// Helper: Get active lorebook entries at a specific message position
async function getActiveLorebooksAtPosition(endIdx, ctx, get_data) {
  const includeActiveLorebooks = get_settings('scene_recap_include_active_lorebooks');
  if (!includeActiveLorebooks) {
    return { entries: [], metadata: { startIdx: endIdx, endIdx, sceneMessageCount: 0 } };
  }

  try {
    const { checkWorldInfo } = await import('../../../world-info.js');
    const chat = ctx.chat;

    // Find scene boundaries (walk back to previous scene break or chat start)
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

    // Extract only scene messages (from startIdx to endIdx inclusive)
    const sceneMessages = [];
    for (let i = startIdx; i <= endIdx; i++) {
      if (chat[i]) {
        sceneMessages.push(chat[i]);
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

    const MAX_CONTEXT_FOR_WI_CHECK = 999999;
    const wiResult = await checkWorldInfo(sceneMessages, MAX_CONTEXT_FOR_WI_CHECK, true, globalScanData);

    if (!wiResult || !wiResult.allActivatedEntries) {
      return { entries: [], metadata: { startIdx, endIdx, sceneMessageCount: sceneMessages.length } };
    }

    // Get chat lorebook name to filter entries
    const chatLorebookName = getAttachedLorebook();
    const suppressOtherLorebooks = get_settings('suppress_other_lorebooks');

    const entries = Array.from(wiResult.allActivatedEntries);
    const totalBeforeFiltering = entries.length;

    const filteredEntries = entries.filter(entry => {
      // Filter out internal/system entries
      if (entry.comment && entry.comment.startsWith('_registry_')) {
        return false;
      }
      if (entry.tags && entry.tags.includes('auto_lorebooks_registry')) {
        return false;
      }
      if (entry.comment === 'Auto-Recap Operations Queue') {
        return false;
      }

      // Filter to only chat lorebook entries if suppression is enabled
      if (suppressOtherLorebooks && chatLorebookName) {
        if (entry.world !== chatLorebookName) {
          return false;
        }
      }

      return true;
    });

    debug(SUBSYSTEM.SCENE, `Lorebook activation for scene ${startIdx}-${endIdx}: ${totalBeforeFiltering} total -> ${filteredEntries.length} after filtering (chatLB: ${chatLorebookName || 'none'}, suppress: ${suppressOtherLorebooks})`);

    return {
      entries: filteredEntries,
      metadata: {
        startIdx,
        endIdx,
        sceneMessageCount: sceneMessages.length,
        totalActivatedEntries: filteredEntries.length,
        totalBeforeFiltering,
        chatLorebookName: chatLorebookName || null,
        suppressOtherLorebooks,
        entryNames: filteredEntries.map(e => e.comment || e.uid || 'Unnamed')
      }
    };
  } catch (err) {
    debug(SUBSYSTEM.SCENE, `Failed to get active lorebooks: ${err.message}`);
    return { entries: [], metadata: { startIdx: endIdx, endIdx, sceneMessageCount: 0, error: err.message } };
  }
}

// Helper: Format lorebook entries for prompt with inline instructions
function formatLorebooksForPrompt(entries) {
  if (!entries || entries.length === 0) {
    return '';
  }

  const wrapEnabled = get_settings('wrap_lorebook_entries');

  let formattedEntries = '';
  let instructions = '';

  if (wrapEnabled) {
    instructions = `INSTRUCTIONS: The following <setting_lore> entries contain context that is active for this scene. Only include information from these entries that is new or has changed in the scene. If the scene rehashes something already captured in these entries, omit it to avoid duplication.\n\n`;
    formattedEntries = entries.map(e => {
      const name = e.comment || 'Unnamed Entry';
      const uid = e.uid || '';
      const world = e.world || '';
      const position = e.position !== undefined ? e.position : '';
      const order = e.order !== undefined ? e.order : '';
      const keys = (e.key || []).join('|');

      return `<setting_lore name="${name}" uid="${uid}" world="${world}" position="${position}" order="${order}" keys="${keys}">\n${e.content}\n</setting_lore>`;
    }).join('\n\n');
  } else {
    instructions = `INSTRUCTIONS: The following entries contain context that is active for this scene. Only include information from these entries that is new or has changed in the scene. If the scene rehashes something already captured in these entries, omit it to avoid duplication.\n\n`;
    formattedEntries = entries.map(e => {
      const name = e.comment || 'Unnamed Entry';
      return `[${name}]\n${e.content}`;
    }).join('\n\n');
  }

  return instructions + formattedEntries;
}

// Helper: Prepare scene recap prompt
async function prepareScenePrompt(
sceneObjects ,
ctx ,
endIdx ,
get_data )
{
  const promptTemplate = get_settings('scene_recap_prompt');
  const prefill = get_settings('scene_recap_prefill') || "";
  const typeDefinitions = getConfiguredEntityTypeDefinitions(extension_settings?.autoLorebooks?.entity_types);
  let lorebookTypesMacro = formatEntityTypeListForPrompt(typeDefinitions);
  if (!lorebookTypesMacro) {
    lorebookTypesMacro = formatEntityTypeListForPrompt(getConfiguredEntityTypeDefinitions());
  }

  // Get active lorebooks if enabled (now returns { entries, metadata })
  const { entries: activeEntries, metadata: lorebookMetadata } = await getActiveLorebooksAtPosition(endIdx, ctx, get_data);
  const activeLorebooksText = formatLorebooksForPrompt(activeEntries);

  // Format scene messages with speaker labels to prevent substituteParamsExtended from stripping them
  const formattedMessages = sceneObjects.map((obj) => {
    if (obj.type === 'message') {
      const role = obj.is_user ? 'USER' : 'CHARACTER';
      return `[${role}: ${obj.name}]\n${obj.text}`;
    } else if (obj.type === 'recap') {
      return `[RECAP]\n${obj.recap}`;
    }
    return '';
  }).filter((m) => m).join('\n\n');

  let prompt = promptTemplate;
  if (ctx.substituteParamsExtended) {
    prompt = ctx.substituteParamsExtended(prompt, {
      scene_messages: formattedMessages,
      message: JSON.stringify(sceneObjects, null, 2), // Keep for backward compatibility
      prefill,
      lorebook_entry_types: lorebookTypesMacro,
      active_lorebooks: activeLorebooksText
    }) || prompt;
  }
  // Fallback replacements
  prompt = prompt.replace(/\{\{scene_messages\}\}/g, formattedMessages);
  prompt = prompt.replace(/\{\{message\}\}/g, JSON.stringify(sceneObjects, null, 2));
  prompt = prompt.replace(/\{\{lorebook_entry_types\}\}/g, lorebookTypesMacro);
  prompt = prompt.replace(/\{\{active_lorebooks\}\}/g, activeLorebooksText);

  return { prompt, prefill, lorebookMetadata };
}

// Helper: Switch to scene recap profile/preset
// Legacy switching functions removed - now using withConnectionSettings() from connectionSettingsManager.js

// Helper: Extract and validate JSON from AI response (REMOVED - now uses centralized helper in utils.js)

// Helper: Generate recap with error handling
async function executeSceneRecapGeneration(llmConfig, range, ctx) {
  const { prompt, prefill, include_preset_prompts = false, preset_name = null } = llmConfig;
  const { startIdx, endIdx } = range;

  let recap = "";
  try {
    ctx.deactivateSendButtons();
    debug(SUBSYSTEM.SCENE, "Sending prompt to AI:", prompt);

    // Set operation context for ST_METADATA
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    setOperationSuffix(`-${startIdx}-${endIdx}`);

    try {
      const rawResponse = await recap_text(prompt, prefill, include_preset_prompts, preset_name);
      debug(SUBSYSTEM.SCENE, "AI response:", rawResponse);

      // Extract and validate JSON using centralized helper
      const { extractJsonFromResponse } = await import('./utils.js');
      const parsed = extractJsonFromResponse(rawResponse, {
        requiredFields: ['recap'],
        context: 'scene recap generation'
      });

      // Additional validation specific to scene recaps
      const recapText = parsed.recap?.trim() || '';
      if (recapText === '' || recapText === '...' || recapText === 'TODO') {
        throw new Error("AI returned empty or placeholder recap");
      }
      if (recapText.length < DEFAULT_POLLING_INTERVAL) {
        throw new Error("AI returned suspiciously short recap (less than 10 chars)");
      }

      // Convert back to JSON string for storage (maintains compatibility)
      recap = JSON.stringify(parsed);
      debug(SUBSYSTEM.SCENE, "Validated and cleaned recap");
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
  return recap;
}

// Helper: Save scene recap and queue lorebook entries

async function saveSceneRecap(config) {
  const { message, recap, get_data, set_data, saveChatDebounced, messageIndex, lorebookMetadata } = config;
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
    existingMetadata[versionIndex] = {
      timestamp: Date.now(),
      ...lorebookMetadata
    };
    set_data(message, SCENE_RECAP_METADATA_KEY, existingMetadata);
    debug(SUBSYSTEM.SCENE, `Stored lorebook metadata for version ${versionIndex}: ${lorebookMetadata.totalActivatedEntries || 0} entries`);
  }

  saveChatDebounced();
  refresh_memory();

  // If the recap is JSON and contains a scene_name, use it (standardized format)
  try {
    const parsed = JSON.parse(recap);
    const maybeName = typeof parsed.scene_name === 'string' ? parsed.scene_name : '';
    const existing = get_data(message, SCENE_BREAK_NAME_KEY);
    if (maybeName && !existing) {
      let clean = maybeName.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\n/g, ' ')
        .trim();
      if (clean.length > SCENE_BREAK_CHARS) {
        clean = clean.slice(0, SCENE_BREAK_MIN_CHARS) + '...';
      }
      if (clean) {
        set_data(message, SCENE_BREAK_NAME_KEY, clean);
        // Update scene navigator immediately if available
        try { renderSceneNavigatorBar(); } catch {}
      }
    }
  } catch {/* non-JSON recap or parse failed; ignore */}

  // Extract and queue lorebook entries
  let lorebookOpIds = [];
  if (recap) {
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE RECAP] Calling extractAndQueueLorebookEntries for message ${messageIndex}...`);
    lorebookOpIds = await extractAndQueueLorebookEntries(recap, messageIndex);
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE RECAP] extractAndQueueLorebookEntries completed for message ${messageIndex}`);
  } else {
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE RECAP] Skipping lorebook extraction - no recap available`);
  }
  return lorebookOpIds;
}

// Helper: Extract lorebooks from recap JSON and queue each as individual operation
// Note: Recap should already be clean JSON from executeSceneRecapGeneration()
async function extractAndQueueLorebookEntries(
recap ,
messageIndex )
{
  debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Starting for message ${messageIndex}`);
  try {
    const recapHash = computeRecapHash(recap);
    debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Recap hash: ${recapHash}`);

    // Parse JSON (should already be clean from generation)
    const parsed = JSON.parse(recap);

    // Check for 'lorebooks' array (standard format)
    if (parsed.lorebooks && Array.isArray(parsed.lorebooks)) {
      debug(SUBSYSTEM.SCENE, `Found ${parsed.lorebooks.length} lorebook entries in scene recap at index ${messageIndex}`);

      // Deduplicate entries by name/comment before queueing
      const seenNames  = new Set();
      const uniqueEntries = [];

      for (const entry of parsed.lorebooks) {
        if (entry && (entry.name || entry.comment)) {
          const entryName = (entry.name || entry.comment).toLowerCase().trim();

          if (seenNames.has(entryName)) {
            debug(SUBSYSTEM.SCENE, `Skipping duplicate lorebook entry: ${entry.name || entry.comment}`);
            continue;
          }

          seenNames.add(entryName);
          uniqueEntries.push(entry);
        }
      }

      debug(SUBSYSTEM.SCENE, `After deduplication: ${uniqueEntries.length} unique entries (removed ${parsed.lorebooks.length - uniqueEntries.length} duplicates)`);

      // Queue each unique entry individually and collect operation IDs
      debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Queueing ${uniqueEntries.length} unique entries...`);
      const lorebookOpIds = [];
      for (const entry of uniqueEntries) {
        // Sequential execution required: entries must be queued in order
        debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Calling queueProcessLorebookEntry for: ${entry.name || entry.comment}`);
        // eslint-disable-next-line no-await-in-loop -- Lorebook entries must be queued sequentially to maintain processing order
        const opId = await queueProcessLorebookEntry(entry, messageIndex, recapHash);
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
      debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] No lorebooks array found in scene recap at index ${messageIndex}`);
    }
  } catch (err) {
    // Not JSON or parsing failed - skip lorebook processing
    debug(SUBSYSTEM.SCENE, `Scene recap is not JSON, skipping lorebook extraction: ${err.message}`);
  }
  return [];
}


export async function generateSceneRecap(config) {
  const { index, get_message_div, getContext, get_data, set_data, saveChatDebounced, skipQueue = false, signal = null } = config;
  const ctx = getContext();
  const chat = ctx.chat;
  const message = chat[index];

  // Try queueing if not bypassed
  if (!skipQueue) {
    const enqueued = await tryQueueSceneRecap(index);
    if (enqueued) {
      return null;
    }
    // Queue is required. If enqueue failed, abort rather than running directly.
    error(SUBSYSTEM.SCENE, `Failed to enqueue scene recap generation for index ${index}. Aborting.`);
    toast('Queue required: failed to enqueue scene recap generation. Aborting.', 'error');
    return null;
  }

  // Direct execution path is only used by queue handler (skipQueue=true)
  debug(SUBSYSTEM.SCENE, `Executing scene recap generation directly for index ${index} (skipQueue=true)`);

  // Get scene range and collect objects
  const sceneCount = Number(get_settings('scene_recap_history_count')) || 1;
  const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
  const sceneObjects = collectSceneObjects(startIdx, endIdx, chat);

  // Prepare prompt (now returns lorebook metadata)
  const { prompt, prefill, lorebookMetadata } = await prepareScenePrompt(sceneObjects, ctx, endIdx, get_data);

  // Generate recap with connection profile/preset switching
  const { withConnectionSettings } = await import('./connectionSettingsManager.js');
  const profile_name = get_settings('scene_recap_connection_profile');
  const preset_name = get_settings('scene_recap_completion_preset');
  const include_preset_prompts = get_settings('scene_recap_include_preset_prompts');

  const recap = await withConnectionSettings(
    profile_name,
    preset_name,
    // eslint-disable-next-line require-await -- Async wrapper required by withConnectionSettings signature
    async () => {
      const llmConfig = { prompt, prefill, include_preset_prompts, preset_name };
      const range = { startIdx, endIdx };
      return executeSceneRecapGeneration(llmConfig, range, ctx);
    }
  );

  // Check if operation was cancelled while LLM call was in progress
  if (signal?.aborted) {
    debug(SUBSYSTEM.SCENE, `Scene recap cancelled for index ${index}, discarding result without saving`);
    throw new Error('Operation cancelled by user');
  }

  // Save and render (returns lorebook operation IDs, now includes lorebook metadata)
  const lorebookOpIds = await saveSceneRecap({ message, recap, get_data, set_data, saveChatDebounced, messageIndex: index, lorebookMetadata });

  // Mark all messages in this scene as checked to prevent auto-detection from splitting the scene
  const markedCount = setCheckedFlagsInRange(startIdx, endIdx);
  if (markedCount > 0) {
    debug(SUBSYSTEM.SCENE, `Marked ${markedCount} messages in scene (${startIdx}-${endIdx}) as checked after manual recap generation`);
  }

  renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);

  return { recap, lorebookOpIds };
}

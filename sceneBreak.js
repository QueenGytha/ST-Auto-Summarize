

import {
  get_settings,
  summarize_text,
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
  selectorsSillyTavern } from
'./index.js';
import {
  auto_generate_running_summary } from
'./runningSceneSummary.js';
import {
  queueCombineSceneWithRunning,
  queueProcessLorebookEntry } from
'./queueIntegration.js';
import { clearCheckedFlagsInRange, setCheckedFlagsInRange } from './autoSceneBreakDetection.js';
import { getConfiguredEntityTypeDefinitions, formatEntityTypeListForPrompt } from './entityTypes.js';

// SCENE SUMMARY PROPERTY STRUCTURE:
// - Scene summaries are stored on the message object as:
//     - 'scene_summary_memory': the current scene summary text (not at the root like 'memory')
//     - 'scene_summary_versions': array of all versions of the scene summary
//     - 'scene_summary_current_index': index of the current version
//     - 'scene_break_visible': whether the scene break is visible
//     - 'scene_summary_include': whether to include this scene summary in injections
// - Do NOT expect scene summaries to be stored in the root 'memory' property.

export const SCENE_BREAK_KEY = 'scene_break';
export const SCENE_BREAK_VISIBLE_KEY = 'scene_break_visible';
export const SCENE_BREAK_NAME_KEY = 'scene_break_name';
export const SCENE_BREAK_SUMMARY_KEY = 'scene_break_summary';
export const SCENE_SUMMARY_MEMORY_KEY = 'scene_summary_memory';
export const SCENE_SUMMARY_HASH_KEY = 'scene_summary_hash';
export const SCENE_BREAK_COLLAPSED_KEY = 'scene_break_collapsed';
export const SCENE_BREAK_BUTTON_CLASS = 'auto_summarize_scene_break_button';
export const SCENE_BREAK_DIV_CLASS = 'auto_summarize_scene_break_div';
const SCENE_BREAK_SELECTED_CLASS = 'sceneBreak-selected';

// Simple deterministic hash to detect when summary content changes
function computeSummaryHash(summaryText ) {
  const text = (summaryText || '').trim();
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash |= 0; // force 32-bit int
  }
  return Math.abs(hash).toString(36);
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

  // Re-run auto-hide logic after toggling scene break
  import('./autoHide.js').then((mod) => {
    mod.auto_hide_messages_by_command();
  });

  // Update navigator bar if present
  if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
}

// --- Helper functions for versioned scene summaries ---
// Scene summary properties are not at the root; see file header for structure.
function getSceneSummaryVersions(
message ,
get_data  // Returns any type - legitimate
) {
  // Returns the array of summary versions, or an empty array if none
  return get_data(message, 'scene_summary_versions') || [];
}

// Scene summary properties are not at the root; see file header for structure.
function setSceneSummaryVersions(
message ,
set_data , // value can be any type - legitimate
versions )
{
  set_data(message, 'scene_summary_versions', versions);
}

// Scene summary properties are not at the root; see file header for structure.
function getCurrentSceneSummaryIndex(
message ,
get_data  // Returns any type - legitimate
) {
  return get_data(message, 'scene_summary_current_index') ?? 0;
}

// Scene summary properties are not at the root; see file header for structure.
function setCurrentSceneSummaryIndex(
message ,
set_data , // value can be any type - legitimate
idx )
{
  set_data(message, 'scene_summary_current_index', idx);
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

// Helper: Handle generate summary button click
async function handleGenerateSummaryButtonClick(
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

  // Use the queue-enabled generateSceneSummary function
  await generateSceneSummary(index, get_message_div, getContext, get_data, set_data, saveChatDebounced, false);
}

// Helper: Initialize versioned summaries for backward compatibility
function initializeSceneSummaryVersions(
message ,
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
saveChatDebounced )
{
  let versions = getSceneSummaryVersions(message, get_data);
  let currentIdx = getCurrentSceneSummaryIndex(message, get_data);

  if (versions.length === 0) {
    const initialSummary = get_data(message, SCENE_BREAK_SUMMARY_KEY) || '';
    versions = [initialSummary];
    setSceneSummaryVersions(message, set_data, versions);
    setCurrentSceneSummaryIndex(message, set_data, 0);
    set_data(message, SCENE_SUMMARY_MEMORY_KEY, initialSummary);
    set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(initialSummary));
    saveChatDebounced();
  }

  // Clamp currentIdx to valid range
  if (currentIdx < 0) currentIdx = 0;
  if (currentIdx >= versions.length) currentIdx = versions.length - 1;

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
function buildSceneBreakElement(
index ,
startIdx ,
sceneMessages ,
sceneName ,
sceneSummary ,
isVisible ,
isCollapsed ,
versions ,
currentIdx )
{// Returns jQuery object - any is appropriate
  const sceneStartLink = `<a href="javascript:void(0);" class="scene-start-link" data-testid="scene-start-link" data-mesid="${startIdx}">#${startIdx}</a>`;
  const previewIcon = `<i class="fa-solid fa-eye scene-preview-summary" data-testid="scene-preview-summary" title="Preview scene content" style="cursor:pointer; margin-left:0.5em;"></i>`;
  const lorebookIcon = createSceneBreakLorebookIcon(index);

  const stateClass = isVisible ? "sceneBreak-visible" : "sceneBreak-hidden";
  const borderClass = isVisible ? "auto_summarize_scene_break_border" : "";
  const collapsedClass = isCollapsed ? "sceneBreak-collapsed" : "";
  const collapseIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
  const collapseTitle = isCollapsed ? 'Expand scene summary' : 'Collapse scene summary';

  return $(`
    <div class="${SCENE_BREAK_DIV_CLASS} ${stateClass} ${borderClass} ${collapsedClass}" data-testid="scene-break-div" style="margin:0 0 5px 0;" tabindex="0">
        <div class="sceneBreak-header" style="display:flex; align-items:center; gap:0.5em; margin-bottom:0.5em;">
            <input type="text" class="sceneBreak-name auto_summarize_memory_text" data-testid="scene-break-name" placeholder="Scene name..." value="${sceneName.replace(/"/g, '&quot;')}" style="flex:1;" />
            <button class="scene-collapse-toggle menu_button fa-solid ${collapseIcon}" data-testid="scene-collapse-toggle" title="${collapseTitle}" style="padding:0.3em 0.6em;"></button>
        </div>
        <div class="sceneBreak-content">
            <div style="font-size:0.95em; color:inherit; margin-bottom:0.5em;">
                Scene: ${sceneStartLink} &rarr; #${index} (${sceneMessages.length} messages)${previewIcon}${lorebookIcon}
            </div>
            <textarea class="scene-summary-box auto_summarize_memory_text" data-testid="scene-summary-box" placeholder="Scene summary...">${sceneSummary}</textarea>
            <div class="scene-summary-actions" style="margin-top:0.5em; display:flex; gap:0.5em;">
                <button class="scene-rollback-summary menu_button" data-testid="scene-rollback-summary" title="Go to previous summary" style="white-space:nowrap;"><i class="fa-solid fa-rotate-left"></i> Previous Summary</button>
                <button class="scene-generate-summary menu_button" data-testid="scene-generate-summary" title="Generate summary for this scene" style="white-space:nowrap;"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate</button>
                <button class="scene-rollforward-summary menu_button" data-testid="scene-rollforward-summary" title="Go to next summary" style="white-space:nowrap;"><i class="fa-solid fa-rotate-right"></i> Next Summary</button>
                <button class="scene-regenerate-running menu_button" data-testid="scene-regenerate-running" title="Combine this scene with current running summary" style="margin-left:auto; white-space:nowrap;"><i class="fa-solid fa-sync-alt"></i> Combine</button>
                <span style="align-self:center; font-size:0.9em; color:inherit; margin-left:0.5em;">${versions.length > 1 ? `[${currentIdx + 1}/${versions.length}]` : ''}</span>
            </div>
        </div>
    </div>
    `);
}

export function renderSceneBreak(
index ,
get_message_div , // Returns jQuery object - any is appropriate
getContext ,
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
saveChatDebounced )
{
  const $msgDiv = get_message_div(index);
  if (!$msgDiv?.length) return;

  $msgDiv.find(`.${SCENE_BREAK_DIV_CLASS}`).remove();

  const ctx = getContext();
  const chat = ctx.chat;
  const message = chat[index];
  const isSet = !!get_data(message, SCENE_BREAK_KEY);
  const visible = get_data(message, SCENE_BREAK_VISIBLE_KEY);
  const isVisible = visible === undefined ? true : visible;

  if (!isSet) return;

  // Initialize versioned summaries
  const { versions, currentIdx } = initializeSceneSummaryVersions(message, get_data, set_data, saveChatDebounced);

  const sceneName = get_data(message, SCENE_BREAK_NAME_KEY) || '';
  const sceneSummary = versions[currentIdx] || '';

  let isCollapsed = get_data(message, SCENE_BREAK_COLLAPSED_KEY);
  if (isCollapsed === undefined) {
    isCollapsed = get_settings('scene_summary_default_collapsed') ?? true;
  }

  // Find scene boundaries
  const { startIdx, sceneMessages } = findSceneBoundaries(chat, index, get_data);

  // Build scene break element
  const $sceneBreak = buildSceneBreakElement(index, startIdx, sceneMessages, sceneName, sceneSummary, isVisible, isCollapsed, versions, currentIdx);

  // === Insert after the summary box, or after message text if no summary box exists ===
  const $summaryBox = $msgDiv.find(selectorsExtension.memory.text);
  if ($summaryBox.length) {
    $summaryBox.last().after($sceneBreak);
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
      currentCollapsed = get_settings('scene_summary_default_collapsed') ?? true;
    }
    set_data(message, SCENE_BREAK_COLLAPSED_KEY, !currentCollapsed);
    saveChatDebounced();
    renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
  });

  $sceneBreak.find(selectorsExtension.sceneBreak.summaryBox).on('change blur', function () {
    // Update the current version in the versions array
    const updatedVersions = getSceneSummaryVersions(message, get_data).slice();
    const idx = getCurrentSceneSummaryIndex(message, get_data);
    const newSummary = $(this).val();
    updatedVersions[idx] = newSummary;
    setSceneSummaryVersions(message, set_data, updatedVersions);
    // Also update the legacy summary field for compatibility
    set_data(message, SCENE_BREAK_SUMMARY_KEY, newSummary);
    set_data(message, SCENE_SUMMARY_MEMORY_KEY, newSummary); // <-- ensure top-level property is set
    set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(newSummary));
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
      const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - 20; // 20px padding
      $chat.animate({ scrollTop }, 300);

      $target.addClass('scene-highlight');
      setTimeout(() => $target.removeClass('scene-highlight'), 1200);
    } else {
      // fallback: scroll to top to try to load more messages
      const $chat = $(selectorsSillyTavern.chat.container);
      $chat.scrollTop(0);
      setTimeout(() => {
        $target = $(`div[mesid="${mesid}"]`);
        if ($target.length) {
          const chatOffset = $chat.offset()?.top ?? 0;
          const targetOffset = $target.offset()?.top ?? 0;
          const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - 20;
          $chat.animate({ scrollTop }, 300);

          $target.addClass('scene-highlight');
          setTimeout(() => $target.removeClass('scene-highlight'), 1200);
        }
      }, 500);
    }
  });

  // --- Preview scene content handler ---
  $sceneBreak.find(selectorsExtension.sceneBreak.previewSummary).off('click').on('click', function (e) {
    e.stopPropagation();
    const sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
    const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
    const ctx = getContext();

    const messageTypes = get_settings('scene_summary_message_types') || "both";
    const sceneObjects = [];
    for (let i = startIdx; i <= endIdx; i++) {
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
  $sceneBreak.find(selectorsExtension.sceneBreak.generateSummary).off('click').on('click', async function (e) {
    e.stopPropagation();
    await handleGenerateSummaryButtonClick(index, chat, message, $sceneBreak, get_message_div, get_data, set_data, saveChatDebounced);
  });

  $sceneBreak.find(selectorsExtension.sceneBreak.rollbackSummary).off('click').on('click', function (e) {
    e.stopPropagation();
    const idx = getCurrentSceneSummaryIndex(message, get_data);
    if (idx > 0) {
      setCurrentSceneSummaryIndex(message, set_data, idx - 1);
      const summary = getSceneSummaryVersions(message, get_data)[idx - 1];
      set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
      set_data(message, SCENE_SUMMARY_MEMORY_KEY, summary); // <-- ensure top-level property is set
      set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(summary));
      saveChatDebounced();
      refresh_memory(); // <-- refresh memory injection to use the newly selected summary
      renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
    }
  });
  $sceneBreak.find(selectorsExtension.sceneBreak.rollforwardSummary).off('click').on('click', function (e) {
    e.stopPropagation();
    const versions = getSceneSummaryVersions(message, get_data);
    const idx = getCurrentSceneSummaryIndex(message, get_data);
    if (idx < versions.length - 1) {
      setCurrentSceneSummaryIndex(message, set_data, idx + 1);
      const summary = versions[idx + 1];
      set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
      set_data(message, SCENE_SUMMARY_MEMORY_KEY, summary); // <-- ensure top-level property is set
      set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(summary));
      saveChatDebounced();
      refresh_memory(); // <-- refresh memory injection to use the newly selected summary
      renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
    }
  });

  // --- Regenerate running summary from this scene onwards ---
  $sceneBreak.find(selectorsExtension.sceneBreak.regenerateRunning).off('click').on('click', async function (e) {
    e.stopPropagation();
    const sceneSummary = get_data(message, SCENE_SUMMARY_MEMORY_KEY);
    if (!sceneSummary) {
      alert('This scene has no summary yet. Generate a scene summary first.');
      return;
    }

    log(SUBSYSTEM.SCENE, "Combine scene with running summary button clicked for scene at index", index);

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
  if (!ctx?.chat) return;
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
  if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
}

export async function autoGenerateSceneNameFromSummary(
summary ,
message ,
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
ctx ,
_savedProfiles , // any is appropriate for PresetManager
index  // Message index for context
) {
  const existingSceneName = get_data(message, SCENE_BREAK_NAME_KEY);

  // Only generate if no name already exists
  if (existingSceneName) {
    debug(SUBSYSTEM.SCENE, "Scene name already exists, skipping auto-generation");
    return null;
  }

  try {
    debug(SUBSYSTEM.SCENE, "Auto-generating scene name...");

    // Create a prompt to generate a brief scene name
    const sceneNamePrompt = `Based on the following scene summary, generate a very brief scene name (maximum 5 words, like a chapter title).

Scene Summary:
${summary}

Respond with ONLY the scene name, nothing else. Make it concise and descriptive, like a chapter title.`;

    ctx.deactivateSendButtons();

    // Set operation context for ST_METADATA
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    if (index != null) {
      setOperationSuffix(`-${index}`);
    }

    let sceneName;
    try {
      sceneName = await summarize_text(sceneNamePrompt);
    } finally {
      clearOperationSuffix();
      ctx.activateSendButtons();
    }

    // Clean up the scene name (remove quotes, trim, limit length)
    let cleanSceneName = sceneName.trim().
    replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .trim();

    // Limit to ~50 characters max
    if (cleanSceneName.length > 50) {
      cleanSceneName = cleanSceneName.substring(0, 47) + '...';
    }

    debug(SUBSYSTEM.SCENE, "Generated scene name:", cleanSceneName);
    set_data(message, SCENE_BREAK_NAME_KEY, cleanSceneName);

    // Refresh the scene navigator bar to show the new name immediately
    renderSceneNavigatorBar();

    return cleanSceneName;
  } catch (err) {
    error(SUBSYSTEM.SCENE, "Error generating scene name:", err);
    // Don't fail the whole summary generation if scene name fails
    return null;
  }
}

// Helper: Try to queue scene summary generation
async function tryQueueSceneSummary(index ) {
  debug(SUBSYSTEM.SCENE, `[Queue] Queueing scene summary generation for index ${index}`);

  const { queueGenerateSceneSummary } = await import('./queueIntegration.js');
  const operationId = await queueGenerateSceneSummary(index);

  if (operationId) {
    log(SUBSYSTEM.SCENE, `[Queue] Queued scene summary generation for index ${index}:`, operationId);
    toast(`Queued scene summary generation for message ${index}`, 'info');
    return true;
  }

  error(SUBSYSTEM.SCENE, `[Queue] Failed to enqueue scene summary generation`);
  return false;
}

// Helper: Collect scene objects for summary
function collectSceneObjects(
startIdx ,
endIdx ,
chat )
{
  const messageTypes = get_settings('scene_summary_message_types') || "both";
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

// Helper: Prepare scene summary prompt
function prepareScenePrompt(
sceneObjects ,
ctx )
{
  const promptTemplate = get_settings('scene_summary_prompt');
  const prefill = get_settings('scene_summary_prefill') || "";
  const typeDefinitions = getConfiguredEntityTypeDefinitions(extension_settings?.autoLorebooks?.entity_types);
  let lorebookTypesMacro = formatEntityTypeListForPrompt(typeDefinitions);
  if (!lorebookTypesMacro) {
    lorebookTypesMacro = formatEntityTypeListForPrompt(getConfiguredEntityTypeDefinitions(undefined));
  }

  // Format scene messages with speaker labels to prevent substituteParamsExtended from stripping them
  const formattedMessages = sceneObjects.map((obj) => {
    if (obj.type === 'message') {
      const role = obj.is_user ? 'USER' : 'CHARACTER';
      return `[${role}: ${obj.name}]\n${obj.text}`;
    } else if (obj.type === 'summary') {
      return `[SUMMARY]\n${obj.summary}`;
    }
    return '';
  }).filter((m) => m).join('\n\n');

  let prompt = promptTemplate;
  if (ctx.substituteParamsExtended) {
    prompt = ctx.substituteParamsExtended(prompt, {
      scene_messages: formattedMessages,
      message: JSON.stringify(sceneObjects, null, 2), // Keep for backward compatibility
      prefill,
      lorebook_entry_types: lorebookTypesMacro
    }) || prompt;
  }
  // Fallback replacements
  prompt = prompt.replace(/\{\{scene_messages\}\}/g, formattedMessages);
  prompt = prompt.replace(/\{\{message\}\}/g, JSON.stringify(sceneObjects, null, 2));
  prompt = prompt.replace(/\{\{lorebook_entry_types\}\}/g, lorebookTypesMacro);

  return { prompt, prefill };
}

// Helper: Switch to scene summary profile/preset
// Legacy switching functions removed - now using withConnectionSettings() from connectionSettingsManager.js

// Helper: Extract and validate JSON from AI response (REMOVED - now uses centralized helper in utils.js)

// Helper: Generate summary with error handling
async function executeSceneSummaryGeneration(
prompt ,
prefill ,
ctx ,
startIdx ,
endIdx ,
include_preset_prompts = false ,
preset_name = null )
{
  let summary = "";
  try {
    ctx.deactivateSendButtons();
    debug(SUBSYSTEM.SCENE, "Sending prompt to AI:", prompt);

    // Set operation context for ST_METADATA
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    setOperationSuffix(`-${startIdx}-${endIdx}`);

    try {
      const rawResponse = await summarize_text(prompt, prefill, include_preset_prompts, preset_name);
      debug(SUBSYSTEM.SCENE, "AI response:", rawResponse);

      // Extract and validate JSON using centralized helper
      const { extractJsonFromResponse } = await import('./utils.js');
      const parsed = extractJsonFromResponse(rawResponse, {
        requiredFields: ['summary'],
        context: 'scene summary generation'
      });

      // Additional validation specific to scene summaries
      const summaryText = parsed.summary?.trim() || '';
      if (summaryText === '' || summaryText === '...' || summaryText === 'TODO') {
        throw new Error("AI returned empty or placeholder summary");
      }
      if (summaryText.length < 10) {
        throw new Error("AI returned suspiciously short summary (less than 10 chars)");
      }

      // Convert back to JSON string for storage (maintains compatibility)
      summary = JSON.stringify(parsed);
      debug(SUBSYSTEM.SCENE, "Validated and cleaned summary");
    } finally {
      clearOperationSuffix();
    }
  } catch (err) {
    summary = "Error generating summary: " + (err?.message || err);
    error(SUBSYSTEM.SCENE, "Error generating summary:", err);
    throw err;
  } finally {
    ctx.activateSendButtons();
  }
  return summary;
}

// Helper: Save scene summary and queue lorebook entries
async function saveSceneSummary(
message ,
summary ,
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
saveChatDebounced ,
messageIndex )
{
  const updatedVersions = getSceneSummaryVersions(message, get_data).slice();
  updatedVersions.push(summary);
  setSceneSummaryVersions(message, set_data, updatedVersions);
  setCurrentSceneSummaryIndex(message, set_data, updatedVersions.length - 1);
  set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
  set_data(message, SCENE_SUMMARY_MEMORY_KEY, summary);
  set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(summary));
  saveChatDebounced();
  refresh_memory();

  // Extract and queue lorebook entries
  if (summary) {
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE SUMMARY] Calling extractAndQueueLorebookEntries for message ${messageIndex}...`);
    await extractAndQueueLorebookEntries(summary, messageIndex);
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE SUMMARY] extractAndQueueLorebookEntries completed for message ${messageIndex}`);
  } else {
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE SUMMARY] Skipping lorebook extraction - no summary available`);
  }
}

// Helper: Extract lorebooks from summary JSON and queue each as individual operation
// Note: Summary should already be clean JSON from executeSceneSummaryGeneration()
async function extractAndQueueLorebookEntries(
summary ,
messageIndex )
{
  debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Starting for message ${messageIndex}`);
  try {
    const summaryHash = computeSummaryHash(summary);
    debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Summary hash: ${summaryHash}`);

    // Parse JSON (should already be clean from generation)
    const parsed = JSON.parse(summary);

    // Check for 'lorebooks' array (standard format)
    if (parsed.lorebooks && Array.isArray(parsed.lorebooks)) {
      debug(SUBSYSTEM.SCENE, `Found ${parsed.lorebooks.length} lorebook entries in scene summary at index ${messageIndex}`);

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

      // Queue each unique entry individually
      debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Queueing ${uniqueEntries.length} unique entries...`);
      for (const entry of uniqueEntries) {
        // Sequential execution required: entries must be queued in order
        debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Calling queueProcessLorebookEntry for: ${entry.name || entry.comment}`);
        // eslint-disable-next-line no-await-in-loop
        const opId = await queueProcessLorebookEntry(entry, messageIndex, summaryHash);
        if (opId) {
          debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] ✓ Queued lorebook entry: ${entry.name || entry.comment} (op: ${opId})`);
        } else {
          debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] ✗ Failed to queue lorebook entry: ${entry.name || entry.comment} (returned null/undefined)`);
        }
      }
      debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Finished queueing all entries`);
    } else {
      debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] No lorebooks array found in scene summary at index ${messageIndex}`);
    }
  } catch (err) {
    // Not JSON or parsing failed - skip lorebook processing
    debug(SUBSYSTEM.SCENE, `Scene summary is not JSON, skipping lorebook extraction: ${err.message}`);
  }
}

export async function generateSceneSummary(
index ,
get_message_div , // Returns jQuery object - any is appropriate
getContext ,
get_data , // Returns any type - legitimate
set_data , // value can be any type - legitimate
saveChatDebounced ,
skipQueue  = false,
signal  = null) // AbortSignal to check for cancellation
{
  const ctx = getContext();
  const chat = ctx.chat;
  const message = chat[index];

  // Try queueing if not bypassed
  if (!skipQueue) {
    const enqueued = await tryQueueSceneSummary(index);
    if (enqueued) {
      return;
    }
    // Queue is required. If enqueue failed, abort rather than running directly.
    error(SUBSYSTEM.SCENE, `Failed to enqueue scene summary generation for index ${index}. Aborting.`);
    toast('Queue required: failed to enqueue scene summary generation. Aborting.', 'error');
    return null;
  }

  // Direct execution path is only used by queue handler (skipQueue=true)
  debug(SUBSYSTEM.SCENE, `Executing scene summary generation directly for index ${index} (skipQueue=true)`);

  // Get scene range and collect objects
  const sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
  const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
  const sceneObjects = collectSceneObjects(startIdx, endIdx, chat);

  // Prepare prompt
  const { prompt, prefill } = prepareScenePrompt(sceneObjects, ctx);

  // Generate summary with connection profile/preset switching
  const { withConnectionSettings } = await import('./connectionSettingsManager.js');
  const profile_name = get_settings('scene_summary_connection_profile');
  const preset_name = get_settings('scene_summary_completion_preset');
  const include_preset_prompts = get_settings('scene_summary_include_preset_prompts');

  const summary = await withConnectionSettings(
    profile_name,
    preset_name,
    async () => {
      return await executeSceneSummaryGeneration(prompt, prefill, ctx, startIdx, endIdx, include_preset_prompts, preset_name);
    }
  );

  // Check if operation was cancelled while LLM call was in progress
  if (signal?.aborted) {
    debug(SUBSYSTEM.SCENE, `Scene summary cancelled for index ${index}, discarding result without saving`);
    throw new Error('Operation cancelled by user');
  }

  // Save and render
  await saveSceneSummary(message, summary, get_data, set_data, saveChatDebounced, index);

  // Mark all messages in this scene as checked to prevent auto-detection from splitting the scene
  const markedCount = setCheckedFlagsInRange(startIdx, endIdx);
  if (markedCount > 0) {
    debug(SUBSYSTEM.SCENE, `Marked ${markedCount} messages in scene (${startIdx}-${endIdx}) as checked after manual summary generation`);
  }

  await auto_generate_running_summary(index);
  renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);

  return summary;
}
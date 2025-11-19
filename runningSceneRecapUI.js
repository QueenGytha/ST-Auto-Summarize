
/* global localStorage -- Browser API for persisting UI preferences */
import {
  get_settings,
  getContext,
  SUBSYSTEM,
  debug,
  log,
  error,
  toast,
  get_data,
  refresh_memory,
  renderSceneNavigatorBar,
  clear_all_recaps_for_chat,
  clearAllOperations,
  selectorsExtension,
  selectorsSillyTavern,
  getAttachedLorebook,
  deleteChatLorebook } from
'./index.js';
import {
  get_running_recap_versions,
  get_current_running_recap_version,
  get_running_recap,
  set_current_running_recap_version } from
'./runningSceneRecap.js';
import { manualSceneBreakDetection } from './autoSceneBreakDetection.js';

function createRunningSceneRecapNavbar() {
  // Remove existing controls if present
  $(`${selectorsExtension.sceneNav.bar} .running-recap-controls`).remove();

  // Control width constant - change here to adjust all control widths
  const CONTROL_WIDTH = '95%';

  // Create controls HTML (version selector and edit button only, no regenerate)
  const html = `
    <div class="running-recap-controls" data-testid="running-recap-controls" style="
        display: flex;
        flex-direction: column;
        gap: 0;
        align-items: center;
        margin-top: auto;
        padding-top: 5px;
        padding-bottom: 5px;
        border-top: 1px solid var(--SmartThemeBorderColor);
        width: 100%;
    ">
        <select id="running_recap_version_selector" data-testid="running-version-selector" class="text_pole" style="width: ${CONTROL_WIDTH}; font-size: 11px; margin: 0;">
            <option value="-1">No Running Recap</option>
        </select>
        <button id="running_recap_edit_btn" data-testid="running-edit-btn" class="menu_button" title="Edit running recap" style="
            width: ${CONTROL_WIDTH};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 11px;
            text-transform: none;
            margin: 0;
        ">
            <i class="fa-solid fa-edit"></i>
            <span>Edit Recap</span>
        </button>
        <button id="running_recap_scan_breaks_btn" data-testid="running-scan-breaks-btn" class="menu_button" title="Scan all messages for scene breaks (manual run)" style="
            width: ${CONTROL_WIDTH};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 11px;
            text-transform: none;
            margin: 0;
        ">
            <i class="fa-solid fa-magnifying-glass"></i>
            <span>Scan Scene Breaks</span>
        </button>
        <button id="running_recap_clear_all_btn" data-testid="running-clear-all-btn" class="menu_button" title="Clear all recaps and reset scene tracking" style="
            width: ${CONTROL_WIDTH};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 11px;
            text-transform: none;
            margin: 0;
        ">
            <i class="fa-solid fa-broom"></i>
            <span>Clear All Recaps</span>
        </button>
    </div>
    `;

  // Ensure scene navigator bar exists
  let $navbar = $(selectorsExtension.sceneNav.bar);
  if (!$navbar.length) {
    // Create the bar if it doesn't exist
    $navbar = $('<div id="scene-recap-navigator-bar" data-testid="scene-navigator-bar"></div>');
    $(selectorsSillyTavern.chat.holder).after($navbar);

    log(SUBSYSTEM.RUNNING, 'Created scene navigator bar for running recap controls');
  }

  $navbar.append(html);

  // ALWAYS respect user's navbar visibility preference from localStorage (defaults to collapsed)
  // This must run every time, not just on creation, because the navbar
  // might already exist from Queue UI or previous initialization
  const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
  if (navbarVisible === 'true') {
    $navbar.show();
  } else {
    $navbar.hide(); // Default to collapsed
  }

  // Bind event handlers
  $(selectorsExtension.runningUI.versionSelector).on('change', function () {
    const versionNum = Number.parseInt($(this).val(), 10);
    if (versionNum === -1) {
      set_current_running_recap_version(0);
    } else {
      set_current_running_recap_version(versionNum);
    }
    debug(SUBSYSTEM.RUNNING, `Switched to running recap version ${versionNum}`);
  });

  // Manual scene break scan handler
  $(selectorsExtension.runningUI.scanBreaksBtn).on('click', async () => {
    try {
      await manualSceneBreakDetection();
    } catch (err) {
      error(SUBSYSTEM.SCENE, 'Manual scene break scan failed', err);
      toast('Failed to scan scene breaks. Check console for details.', 'error');
    }
  });

  $(selectorsExtension.runningUI.editBtn).on('click', async function () {
    const current = get_running_recap(get_current_running_recap_version());
    if (!current) {
      toast('No running recap to edit', 'warning');
      return;
    }

    const ctx = getContext();
    const popupHtml = `
            <div>
                <h3>Edit Running Scene Recap</h3>
                <p>Editing will create a new version.</p>
                <textarea id="running_recap_edit_textarea" data-testid="running-edit-textarea" rows="20" style="width: 100%; height: 70vh;">${current.content || ""}</textarea>
            </div>
        `;

    try {
      const result = await ctx.callPopup(popupHtml, 'text', undefined, {
        okButton: "Save",
        cancelButton: "Cancel",
        wide: true,
        large: true
      });

      if (result) {
        const edited = $(selectorsExtension.runningUI.editTextarea).val();
        if (edited !== null && edited !== current.content) {
          // Editing creates a new version with same scene indexes
          const versions = get_running_recap_versions();
          const newVersion = {
            version: versions.length + 1,
            content: edited,
            timestamp: Date.now(),
            scene_count: current.scene_count,
            exclude_count: current.exclude_count,
            prev_scene_index: current.prev_scene_index ?? 0,
            new_scene_index: current.new_scene_index ?? 0
          };
          versions.push(newVersion);
          set_current_running_recap_version(newVersion.version);
          updateVersionSelector();
          toast('Created new version from edit', 'success');
        }
      }
    } catch (err) {
      error(SUBSYSTEM.RUNNING, 'Failed to edit running recap', err);
    }
  });

  // Clear all recaps handler
  $(selectorsExtension.runningUI.clearAllBtn).on('click', async () => {
    await handleClearAllRecapsClick();
  });

  debug(SUBSYSTEM.RUNNING, 'Running scene recap controls added to navigator bar');
}

function updateRunningSceneRecapNavbar() {
  const show = get_settings('running_scene_recap_show_navbar');

  const $controls = $(`${selectorsExtension.sceneNav.bar} .running-recap-controls`);

  if (!$controls.length) {
    if (show) {
      createRunningSceneRecapNavbar();
      updateVersionSelector();
    }
    return;
  }

  if (show) {
    $controls.show();
    updateVersionSelector();
  } else {
    $controls.hide();
  }

  // ALWAYS respect user's navbar visibility preference from localStorage (defaults to collapsed)
  // Even when showing controls, the navbar itself might need to be hidden
  const $navbar = $(selectorsExtension.sceneNav.bar);
  const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
  if (navbarVisible === 'true') {
    $navbar.show();
  } else {
    $navbar.hide(); // Default to collapsed
  }

  debug(SUBSYSTEM.UI, `Running scene recap controls ${show ? 'shown' : 'hidden'}`);
}

function updateVersionSelector() {
  const $selector = $(selectorsExtension.runningUI.versionSelector);
  if (!$selector.length) {return;}

  const ctx = getContext();
  const chat = ctx.chat;
  const versions = get_running_recap_versions();
  const currentVersion = get_current_running_recap_version();

  // Clear and rebuild options
  $selector.empty();

  if (versions.length === 0) {
    $selector.append('<option value="-1">No versions</option>');
    $selector.val('-1');
    $(selectorsExtension.runningUI.editBtn).prop('disabled', true);
    return;
  }

  // Filter out versions that reference deleted messages (defensive check)
  const validVersions = versions.filter((v) => {
    const new_scene_idx = v.new_scene_index ?? 0;
    // Check if the scene index is still valid and has a scene recap
    if (new_scene_idx >= chat.length) {return false;}
    const msg = chat[new_scene_idx];
    return msg && get_data(msg, 'scene_recap_memory');
  });

  if (validVersions.length === 0) {
    $selector.append('<option value="-1">No valid versions</option>');
    $selector.val('-1');
    $(selectorsExtension.runningUI.editBtn).prop('disabled', true);
    debug(SUBSYSTEM.RUNNING, 'All versions reference deleted messages');
    return;
  }

  // Add versions (newest first)
  const sortedVersions = validVersions.slice().sort((a, b) => b.version - a.version);
  for (const v of sortedVersions) {
    // Format: Recap: v0 (0 > 3), Recap: v1 (3 > 7), etc.
    const prev_idx = v.prev_scene_index ?? 0;
    const new_idx = v.new_scene_index ?? 0;
    const label = `Recap: v${v.version} (${prev_idx} > ${new_idx})`;
    $selector.append(`<option value="${v.version}">${label}</option>`);
  }

  // Set current selection
  $selector.val(currentVersion);
  $(selectorsExtension.runningUI.editBtn).prop('disabled', false);

  debug(SUBSYSTEM.RUNNING, `Version selector updated: ${validVersions.length} valid versions (${versions.length - validVersions.length} filtered), current: ${currentVersion}`);
}

function formatCount(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function buildClearRecapsMessage(result, lorebookDeleted) {
  const breakdown = [];
  if (result.singleRecapsCleared) {
    breakdown.push(formatCount(result.singleRecapsCleared, 'single-message recap'));
  }
  if (result.sceneRecapsCleared) {
    breakdown.push(formatCount(result.sceneRecapsCleared, 'scene recap'));
  }

  const extras = [];
  if (result.runningRecapCleared) {
    extras.push(formatCount(result.runningRecapCleared, 'running recap version'));
  }
  if (result.sceneBreaksCleared) {
    extras.push(formatCount(result.sceneBreaksCleared, 'scene break marker'));
  }
  if (result.checkedFlagsCleared) {
    extras.push(formatCount(result.checkedFlagsCleared, 'checked flag'));
  }
  if (result.swipeRecapsCleared) {
    extras.push(formatCount(result.swipeRecapsCleared, 'swipe record'));
  }

  let message = '';
  if (result.messageMetadataCleared) {
    const details = breakdown.length ? ` (${breakdown.join(', ')})` : '';
    message = `Removed recap metadata from ${formatCount(result.messageMetadataCleared, 'message')}${details}.`;
  }
  if (extras.length) {
    message += `${message ? ' ' : ''}Also cleared ${extras.join(', ')}.`;
  }
  if (lorebookDeleted) {
    message += `${message ? ' ' : ''}Deleted chat lorebook.`;
  }

  return message.trim() || 'Cleared recap data.';
}

async function handleLorebookDeletion() {
  const currentLorebook = getAttachedLorebook();
  if (!currentLorebook) {
    debug(SUBSYSTEM.RUNNING, 'No lorebook attached to delete');
    return false;
  }

  debug(SUBSYSTEM.RUNNING, `Deleting lorebook: ${currentLorebook}`);
  const deleted = await deleteChatLorebook(currentLorebook);

  if (!deleted) {
    error(SUBSYSTEM.RUNNING, 'Failed to delete lorebook');
    toast('Failed to delete lorebook', 'error');
    return false;
  }

  debug(SUBSYSTEM.RUNNING, `Successfully deleted lorebook: ${currentLorebook}`);
  return true;
}

async function handleClearAllRecapsClick() {
  const ctx = getContext();

  const html = `
        <div style="text-align: center !important; width: 100% !important;">
            <div style="max-width: 420px; margin: 0 auto; text-align: center !important;">
                <h3 style="text-align: center !important; margin: 0 0 10px 0;">Clear All Recaps?</h3>
                <p style="text-align: center !important; margin: 10px 0;">This removes every generated recap, scene break marker, running scene recap version, and scene break scan history for the current chat.</p>
                <p style="text-align: center !important; margin: 10px 0;">Messages stay untouched.</p>
                <div style="margin: 15px 0; text-align: center !important;">
                    <label style="display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="clear_recaps_delete_lorebook" data-testid="clear-recaps-delete-lorebook" style="cursor: pointer;">
                        <span>Also delete chat lorebook</span>
                    </label>
                </div>
                <p style="text-align: center !important; margin: 10px 0;"><strong>This action cannot be undone.</strong></p>
            </div>
        </div>
    `;

  try {
    // Capture checkbox state before popup closes
    let shouldDeleteLorebook = false;

    // Use event delegation to capture checkbox changes
    const changeHandler = function (event) {
      if (event.target.id === 'clear_recaps_delete_lorebook') {
        shouldDeleteLorebook = $(event.target).prop('checked');
        debug(SUBSYSTEM.RUNNING, `[Reset] Checkbox changed: ${shouldDeleteLorebook}`);
      }
    };

    $(document).on('change', changeHandler);

    const popup = new ctx.Popup(html, ctx.POPUP_TYPE.CONFIRM, '', {
      okButton: 'Clear Everything',
      wide: true
    });

    const confirmed = await popup.show();

    // Clean up event handler
    $(document).off('change', changeHandler);

    if (!confirmed) {
      debug(SUBSYSTEM.RUNNING, '[Reset] Clear recaps cancelled by user');
      return;
    }

    // Use captured checkbox state
    debug(SUBSYSTEM.RUNNING, `[Reset] Lorebook deletion requested: ${shouldDeleteLorebook}`);

    // Clear any pending operations first (only after confirmation)
    const clearedCount = await clearAllOperations();
    if (clearedCount > 0) {
      debug(SUBSYSTEM.RUNNING, `Cleared ${clearedCount} pending operations before clearing recaps`);
    }

    const result = clear_all_recaps_for_chat();
    const anyCleared = Object.values(result).some((count) => typeof count === 'number' && count > 0);

    // Handle lorebook deletion if requested (before early return check)
    let lorebookDeleted = false;
    if (shouldDeleteLorebook) {
      lorebookDeleted = await handleLorebookDeletion();
    }

    // Check if anything was actually done
    if (!anyCleared && !lorebookDeleted) {
      toast('No recap data or lorebook found to clear for this chat', 'info');
      return;
    }

    refresh_memory();
    renderSceneNavigatorBar();
    updateRunningSceneRecapNavbar();
    updateVersionSelector();

    const message = buildClearRecapsMessage(result, lorebookDeleted);
    toast(message, 'success');
    debug(SUBSYSTEM.RUNNING, '[Reset] Cleared recaps successfully', result);
  } catch (err) {
    error(SUBSYSTEM.RUNNING, 'Failed to clear recaps', err);
    toast('Failed to clear recaps. Check console for details.', 'error');
  }
}

// Make functions globally accessible for scene navigator refresh
window.updateRunningSceneRecapNavbar = updateRunningSceneRecapNavbar;
window.updateVersionSelector = updateVersionSelector;

export {
  createRunningSceneRecapNavbar,
  updateRunningSceneRecapNavbar,
  updateVersionSelector };
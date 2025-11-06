
/* global localStorage */
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
  clear_all_summaries_for_chat,
  selectorsExtension,
  selectorsSillyTavern } from
'./index.js';
import {
  get_running_summary_versions,
  get_current_running_summary_version,
  get_running_summary,
  set_current_running_summary_version } from
'./runningSceneSummary.js';
import { manualSceneBreakDetection } from './autoSceneBreakDetection.js';

function createRunningSceneSummaryNavbar() {
  // Remove existing controls if present
  $(`${selectorsExtension.sceneNav.bar} .running-summary-controls`).remove();

  // Create controls HTML (version selector and edit button only, no regenerate)
  const html = `
    <div class="running-summary-controls" data-testid="running-summary-controls" style="
        display: flex;
        flex-direction: column;
        gap: 5px;
        align-items: center;
        margin-top: auto;
        padding-top: 10px;
        padding-bottom: 10px;
        border-top: 1px solid var(--SmartThemeBorderColor);
        width: 100%;
    ">
        <select id="running_summary_version_selector" data-testid="running-version-selector" class="text_pole" style="width: 90%; font-size: 11px;">
            <option value="-1">No Running Summary</option>
        </select>
        <button id="running_summary_edit_btn" data-testid="running-edit-btn" class="menu_button" title="Edit running summary" style="
            width: 90%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 11px;
            text-transform: none;
        ">
            <i class="fa-solid fa-edit"></i>
            <span>Edit Summary</span>
        </button>
        <button id="running_summary_scan_breaks_btn" data-testid="running-scan-breaks-btn" class="menu_button" title="Scan all messages for scene breaks (manual run)" style="
            width: 90%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 11px;
            text-transform: none;
        ">
            <i class="fa-solid fa-magnifying-glass"></i>
            <span>Scan Scene Breaks</span>
        </button>
        <button id="running_summary_clear_all_btn" data-testid="running-clear-all-btn" class="menu_button" title="Clear all summaries and reset scene tracking" style="
            width: 90%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-size: 11px;
            text-transform: none;
        ">
            <i class="fa-solid fa-broom"></i>
            <span>Clear All Summaries</span>
        </button>
    </div>
    `;

  // Ensure scene navigator bar exists
  let $navbar = $(selectorsExtension.sceneNav.bar);
  if (!$navbar.length) {
    // Create the bar if it doesn't exist
    $navbar = $('<div id="scene-summary-navigator-bar" data-testid="scene-navigator-bar"></div>');
    $(selectorsSillyTavern.chat.holder).after($navbar);

    log(SUBSYSTEM.RUNNING, 'Created scene navigator bar for running summary controls');
  }

  $navbar.append(html);

  // ALWAYS respect user's navbar visibility preference from localStorage
  // This must run every time, not just on creation, because the navbar
  // might already exist from Queue UI or previous initialization
  const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
  if (navbarVisible === 'false') {
    $navbar.hide();
  }

  // Bind event handlers
  $(selectorsExtension.runningUI.versionSelector).on('change', async function () {
    const versionNum = parseInt($(this).val());
    if (versionNum === -1) {
      set_current_running_summary_version(0);
    } else {
      set_current_running_summary_version(versionNum);
    }
    debug(SUBSYSTEM.RUNNING, `Switched to running summary version ${versionNum}`);
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
    const current = get_running_summary(get_current_running_summary_version());
    if (!current) {
      toast('No running summary to edit', 'warning');
      return;
    }

    const ctx = getContext();
    const html = `
            <div>
                <h3>Edit Running Scene Summary</h3>
                <p>Editing will create a new version.</p>
                <textarea id="running_summary_edit_textarea" data-testid="running-edit-textarea" rows="20" style="width: 100%; height: 400px;">${current.content || ""}</textarea>
            </div>
        `;

    try {
      const result = await ctx.callPopup(html, 'text', undefined, {
        okButton: "Save",
        cancelButton: "Cancel",
        wide: true,
        large: true
      });

      if (result) {
        const edited = $(selectorsExtension.runningUI.editTextarea).val();
        if (edited !== null && edited !== current.content) {
          // Editing creates a new version with same scene indexes
          const versions = get_running_summary_versions();
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
          set_current_running_summary_version(newVersion.version);
          updateVersionSelector();
          toast('Created new version from edit', 'success');
        }
      }
    } catch (err) {
      error(SUBSYSTEM.RUNNING, 'Failed to edit running summary', err);
    }
  });

  // Clear all summaries handler
  $(selectorsExtension.runningUI.clearAllBtn).on('click', async () => {
    await handleClearAllSummariesClick();
  });

  debug(SUBSYSTEM.RUNNING, 'Running scene summary controls added to navigator bar');
}

function updateRunningSceneSummaryNavbar() {
  const show = get_settings('running_scene_summary_show_navbar');

  const $controls = $(`${selectorsExtension.sceneNav.bar} .running-summary-controls`);

  if (!$controls.length) {
    if (show) {
      createRunningSceneSummaryNavbar();
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

  // ALWAYS respect user's navbar visibility preference from localStorage
  // Even when showing controls, the navbar itself might need to be hidden
  const $navbar = $(selectorsExtension.sceneNav.bar);
  const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
  if (navbarVisible === 'false') {
    $navbar.hide();
  }

  debug(SUBSYSTEM.UI, `Running scene summary controls ${show ? 'shown' : 'hidden'}`);
}

function updateVersionSelector() {
  const $selector = $(selectorsExtension.runningUI.versionSelector);
  if (!$selector.length) return;

  const ctx = getContext();
  const chat = ctx.chat;
  const versions = get_running_summary_versions();
  const currentVersion = get_current_running_summary_version();

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
    // Check if the scene index is still valid and has a scene summary
    if (new_scene_idx >= chat.length) return false;
    const msg = chat[new_scene_idx];
    return msg && get_data(msg, 'scene_summary_memory');
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
  sortedVersions.forEach((v) => {
    // Format: Summary: v0 (0 > 3), Summary: v1 (3 > 7), etc.
    const prev_idx = v.prev_scene_index ?? 0;
    const new_idx = v.new_scene_index ?? 0;
    const label = `Summary: v${v.version} (${prev_idx} > ${new_idx})`;
    $selector.append(`<option value="${v.version}">${label}</option>`);
  });

  // Set current selection
  $selector.val(currentVersion);
  $(selectorsExtension.runningUI.editBtn).prop('disabled', false);

  debug(SUBSYSTEM.RUNNING, `Version selector updated: ${validVersions.length} valid versions (${versions.length - validVersions.length} filtered), current: ${currentVersion}`);
}

function formatCount(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

async function handleClearAllSummariesClick() {
  const ctx = getContext();

  const html = `
        <div style="max-width: 420px;">
            <h3>Clear All Summaries?</h3>
            <p>This removes every generated summary, scene break marker, running scene summary version, and scene break scan history for the current chat.</p>
            <p>Messages and lorebooks stay untouched.</p>
            <p><strong>This action cannot be undone.</strong></p>
        </div>
    `;

  try {
    const confirmed = await ctx.callPopup?.(html, 'text', undefined, {
      okButton: 'Clear Everything',
      cancelButton: 'Cancel',
      wide: true
    });

    if (!confirmed) {
      debug(SUBSYSTEM.RUNNING, '[Reset] Clear summaries cancelled by user');
      return;
    }

    const result = clear_all_summaries_for_chat();
    const anyCleared = Object.values(result).some((count) => typeof count === 'number' && count > 0);

    if (!anyCleared) {
      toast('No summary data found to clear for this chat', 'info');
      return;
    }

    refresh_memory();
    renderSceneNavigatorBar();
    updateRunningSceneSummaryNavbar();
    updateVersionSelector();

    const breakdown = [];
    if (result.singleSummariesCleared) {
      breakdown.push(formatCount(result.singleSummariesCleared, 'single-message summary'));
    }
    if (result.sceneSummariesCleared) {
      breakdown.push(formatCount(result.sceneSummariesCleared, 'scene summary'));
    }

    const extras = [];
    if (result.runningSummaryCleared) {
      extras.push(formatCount(result.runningSummaryCleared, 'running summary version'));
    }
    if (result.sceneBreaksCleared) {
      extras.push(formatCount(result.sceneBreaksCleared, 'scene break marker'));
    }
    if (result.checkedFlagsCleared) {
      extras.push(formatCount(result.checkedFlagsCleared, 'checked flag'));
    }
    if (result.swipeSummariesCleared) {
      extras.push(formatCount(result.swipeSummariesCleared, 'swipe record'));
    }

    let message = '';
    if (result.messageMetadataCleared) {
      const details = breakdown.length ? ` (${breakdown.join(', ')})` : '';
      message = `Removed summary metadata from ${formatCount(result.messageMetadataCleared, 'message')}${details}.`;
    }
    if (extras.length) {
      message += `${message ? ' ' : ''}Also cleared ${extras.join(', ')}.`;
    }

    toast(message.trim() || 'Cleared summary data.', 'success');
    debug(SUBSYSTEM.RUNNING, '[Reset] Cleared summaries successfully', result);
  } catch (err) {
    error(SUBSYSTEM.RUNNING, 'Failed to clear summaries', err);
    toast('Failed to clear summaries. Check console for details.', 'error');
  }
}

// Make functions globally accessible for scene navigator refresh
window.updateRunningSceneSummaryNavbar = updateRunningSceneSummaryNavbar;
window.updateVersionSelector = updateVersionSelector;

export {
  createRunningSceneSummaryNavbar,
  updateRunningSceneSummaryNavbar,
  updateVersionSelector };
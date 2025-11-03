// @flow
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
} from './index.js';
import {
    get_running_summary_versions,
    get_current_running_summary_version,
    get_running_summary,
    set_current_running_summary_version,
} from './runningSceneSummary.js';

/**
 * Create and initialize running scene summary controls in scene navigator bar
 * Integrated into #scene-summary-navigator-bar (bottom-left)
 */
function createRunningSceneSummaryNavbar() {
    // Remove existing controls if present
    // $FlowFixMe[cannot-resolve-name]
    $('#scene-summary-navigator-bar .running-summary-controls').remove();

    // Create controls HTML (version selector and edit button only, no regenerate)
    const html = `
    <div class="running-summary-controls" style="
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
        <select id="running_summary_version_selector" class="text_pole" style="width: 90%; font-size: 11px;">
            <option value="-1">No Running Summary</option>
        </select>
        <button id="running_summary_edit_btn" class="menu_button fa-solid fa-edit" title="Edit running summary" style="width: 90%;"></button>
    </div>
    `;

    // Ensure scene navigator bar exists
    // $FlowFixMe[cannot-resolve-name]
    let $navbar = $('#scene-summary-navigator-bar');
    if (!$navbar.length) {
        // Create the bar if it doesn't exist
        // $FlowFixMe[cannot-resolve-name]
        $navbar = $('<div id="scene-summary-navigator-bar"></div>');
        // $FlowFixMe[cannot-resolve-name]
        $('#sheld').after($navbar);

        log(SUBSYSTEM.RUNNING, 'Created scene navigator bar for running summary controls');
    }

    $navbar.append(html);

    // ALWAYS respect user's navbar visibility preference from localStorage
    // This must run every time, not just on creation, because the navbar
    // might already exist from Queue UI or previous initialization
    // $FlowFixMe[cannot-resolve-name]
    const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
    if (navbarVisible === 'false') {
        $navbar.hide();
    }

    // Bind event handlers
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $('#running_summary_version_selector').on('change', async function () {
        // $FlowFixMe[cannot-resolve-name]
        const versionNum = parseInt($(this).val());
        if (versionNum === -1) {
            set_current_running_summary_version(0);
        } else {
            set_current_running_summary_version(versionNum);
        }
        debug(SUBSYSTEM.RUNNING, `Switched to running summary version ${versionNum}`);
    });

    // $FlowFixMe[cannot-resolve-name]
    $('#running_summary_edit_btn').on('click', async function() {
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
                <textarea id="running_summary_edit_textarea" rows="20" style="width: 100%; height: 400px;">${current.content || ""}</textarea>
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
                // $FlowFixMe[cannot-resolve-name]
                const edited = $('#running_summary_edit_textarea').val();
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
                        new_scene_index: current.new_scene_index ?? 0,
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

    debug(SUBSYSTEM.RUNNING, 'Running scene summary controls added to navigator bar');
}

/**
 * Update the navbar visibility and content
 */
function updateRunningSceneSummaryNavbar() {
    const show = get_settings('running_scene_summary_show_navbar');

    // $FlowFixMe[cannot-resolve-name]
    const $controls = $('#scene-summary-navigator-bar .running-summary-controls');

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
    // $FlowFixMe[cannot-resolve-name]
    const $navbar = $('#scene-summary-navigator-bar');
    // $FlowFixMe[cannot-resolve-name]
    const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
    if (navbarVisible === 'false') {
        $navbar.hide();
    }

    debug(SUBSYSTEM.UI, `Running scene summary controls ${show ? 'shown' : 'hidden'}`);
}

/**
 * Update the version selector dropdown
 */
function updateVersionSelector() {
    // $FlowFixMe[cannot-resolve-name]
    const $selector = $('#running_summary_version_selector');
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
        // $FlowFixMe[cannot-resolve-name]
        $('#running_summary_edit_btn').prop('disabled', true);
        return;
    }

    // Filter out versions that reference deleted messages (defensive check)
    const validVersions = versions.filter(v => {
        const new_scene_idx = v.new_scene_index ?? 0;
        // Check if the scene index is still valid and has a scene summary
        if (new_scene_idx >= chat.length) return false;
        const msg = chat[new_scene_idx];
        return msg && get_data(msg, 'scene_summary_memory');
    });

    if (validVersions.length === 0) {
        $selector.append('<option value="-1">No valid versions</option>');
        $selector.val('-1');
        // $FlowFixMe[cannot-resolve-name]
        $('#running_summary_edit_btn').prop('disabled', true);
        debug(SUBSYSTEM.RUNNING, 'All versions reference deleted messages');
        return;
    }

    // Add versions (newest first)
    const sortedVersions = validVersions.slice().sort((a, b) => b.version - a.version);
    sortedVersions.forEach(v => {
        // Format: Summary: v0 (0 > 3), Summary: v1 (3 > 7), etc.
        const prev_idx = v.prev_scene_index ?? 0;
        const new_idx = v.new_scene_index ?? 0;
        const label = `Summary: v${v.version} (${prev_idx} > ${new_idx})`;
        $selector.append(`<option value="${v.version}">${label}</option>`);
    });

    // Set current selection
    $selector.val(currentVersion);
    // $FlowFixMe[cannot-resolve-name]
    $('#running_summary_edit_btn').prop('disabled', false);

    debug(SUBSYSTEM.RUNNING, `Version selector updated: ${validVersions.length} valid versions (${versions.length - validVersions.length} filtered), current: ${currentVersion}`);
}

// Make functions globally accessible for scene navigator refresh
// $FlowFixMe[cannot-resolve-name]
window.updateRunningSceneSummaryNavbar = updateRunningSceneSummaryNavbar;
// $FlowFixMe[cannot-resolve-name]
window.updateVersionSelector = updateVersionSelector;

export {
    createRunningSceneSummaryNavbar,
    updateRunningSceneSummaryNavbar,
    updateVersionSelector,
};

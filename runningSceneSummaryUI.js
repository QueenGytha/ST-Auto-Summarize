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
    generate_running_scene_summary,
} from './runningSceneSummary.js';

/**
 * Create and initialize running scene summary controls in scene navigator bar
 * Integrated into #scene-summary-navigator-bar (bottom-left)
 */
function createRunningSceneSummaryNavbar() {
    // Remove existing controls if present
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

    // Append to scene navigator bar
    const $navbar = $('#scene-summary-navigator-bar');
    if ($navbar.length) {
        $navbar.append(html);
    } else {
        log(SUBSYSTEM.RUNNING, 'Scene navigator bar not found, controls not added yet');
        return;
    }

    // Bind event handlers
    $('#running_summary_version_selector').on('change', async function() {
        const versionNum = parseInt($(this).val());
        if (versionNum === -1) {
            set_current_running_summary_version(0);
        } else {
            set_current_running_summary_version(versionNum);
        }
        debug(SUBSYSTEM.RUNNING, `Switched to running summary version ${versionNum}`);
    });

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
    const show = get_settings('running_scene_summary_enabled') &&
                 get_settings('running_scene_summary_show_navbar');

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

    debug(SUBSYSTEM.UI, `Running scene summary controls ${show ? 'shown' : 'hidden'}`);
}

/**
 * Update the version selector dropdown
 */
function updateVersionSelector() {
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
        $('#running_summary_edit_btn').prop('disabled', true);
        debug(SUBSYSTEM.RUNNING, 'All versions reference deleted messages');
        return;
    }

    // Add versions (newest first)
    const sortedVersions = validVersions.slice().sort((a, b) => b.version - a.version);
    sortedVersions.forEach(v => {
        // Format: v0 (0 > 3), v1 (3 > 7), etc.
        const prev_idx = v.prev_scene_index ?? 0;
        const new_idx = v.new_scene_index ?? 0;
        const label = `v${v.version} (${prev_idx} > ${new_idx})`;
        $selector.append(`<option value="${v.version}">${label}</option>`);
    });

    // Set current selection
    $selector.val(currentVersion);
    $('#running_summary_edit_btn').prop('disabled', false);

    debug(SUBSYSTEM.RUNNING, `Version selector updated: ${validVersions.length} valid versions (${versions.length - validVersions.length} filtered), current: ${currentVersion}`);
}

// Make functions globally accessible for scene navigator refresh
window.updateRunningSceneSummaryNavbar = updateRunningSceneSummaryNavbar;
window.updateVersionSelector = updateVersionSelector;

export {
    createRunningSceneSummaryNavbar,
    updateRunningSceneSummaryNavbar,
    updateVersionSelector,
};

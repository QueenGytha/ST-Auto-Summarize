// @flow
/* global localStorage */
// operationQueueUI.js - UI for operation queue display in navbar

import {
    getQueueStats,
    getAllOperations,
    pauseQueue,
    resumeQueue,
    isQueuePaused,
    clearAllOperations,
    removeOperation,
    registerUIUpdateCallback,
    OperationStatus,
    OperationType
} from './operationQueue.js';
import {
    get_settings,
    debug,
    SUBSYSTEM
} from './index.js';

// Constants
const NAVBAR_ID = 'scene-summary-navigator-bar';
const ICON_CHEVRON_LEFT = 'fa-chevron-left';
const ICON_CHEVRON_RIGHT = 'fa-chevron-right';

let queueUIContainer = null;
let isInitialized = false;

/**
 * Initialize the queue UI
 */
export function initQueueUI() {
    if (isInitialized) {
        debug(SUBSYSTEM.QUEUE, 'Queue UI already initialized');
        return;
    }

    debug(SUBSYSTEM.QUEUE, 'Initializing queue UI');

    // Register for queue updates
    registerUIUpdateCallback(updateQueueDisplay);

    // Create UI elements
    createQueueUI();

    // Initial render
    updateQueueDisplay();

    isInitialized = true;
}

/**
 * Create queue UI container in shared navbar
 */
function createQueueUI() {
    // Find or create the shared navbar (used by both extensions)
    // $FlowFixMe[cannot-resolve-name]
    let $navbar = $(`#${NAVBAR_ID}`);

    if (!$navbar.length) {
        debug(SUBSYSTEM.QUEUE, 'Creating shared navbar');
        // $FlowFixMe[cannot-resolve-name]
        $navbar = $(`<div id="${NAVBAR_ID}" style="width: 175px; position: relative;"></div>`);
        // Insert after the send button area
        // $FlowFixMe[cannot-resolve-name]
        $('#sheld').after($navbar);
    }

    // Check if queue container already exists (shared between extensions)
    // $FlowFixMe[cannot-resolve-name]
    let $queueContainer = $('#shared_operation_queue_ui');

    if ($queueContainer.length) {
        debug(SUBSYSTEM.QUEUE, 'Queue UI already exists (created by other extension)');
        queueUIContainer = $queueContainer;
        return;
    }

    // Create shared queue container
    // $FlowFixMe[cannot-resolve-name]
    $queueContainer = $(`
        <div id="shared_operation_queue_ui" style="margin-top: 1em; padding-top: 1em; border-top: 1px solid var(--SmartThemeBlurTintColor);">
            <div class="queue-header" style="margin-bottom: 0.5em;">
                <div id="queue_toggle_visibility" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.3em; cursor: pointer;" title="Collapse/Expand">
                    <h4 style="margin: 0; font-size: 1em;">Operations <span id="queue_count">(0)</span></h4>
                    <i class="fa-solid fa-chevron-up" style="padding: 0.2em 0.5em;"></i>
                </div>
            </div>
            <div id="queue_list_container" class="queue-list" style="max-height: 200px; overflow-y: auto;">
                <div class="queue-controls" style="display: flex; flex-direction: column; gap: 0.3em; margin-bottom: 0.5em;">
                    <button id="queue_toggle_pause" class="menu_button fa-solid fa-pause" title="Pause/Resume queue"></button>
                    <button id="queue_clear_all" class="menu_button fa-solid fa-trash" title="Clear all"></button>
                </div>
                <div id="queue_operations_list"></div>
            </div>
        </div>
    `);

    // Insert queue container at top of navbar
    $navbar.prepend($queueContainer);

    // Create navbar collapse/expand toggle button (fixed position at middle-right of navbar)
    // This button is NOT a child of the navbar - it's fixed to viewport
    // $FlowFixMe[cannot-resolve-name]
    const $navbarToggle = $(`
        <button id="queue_navbar_toggle" class="menu_button fa-solid ${ICON_CHEVRON_LEFT}"
            title="Hide Queue Navbar"
            style="position: fixed; top: 50vh; left: 200px; transform: translateY(-50%); padding: 0.8em 0.5em; font-size: 1.2em; z-index: 1000002; background: rgba(30,30,40,0.95); border: 1px solid var(--SmartThemeBlurTintColor); border-radius: 0 8px 8px 0;"></button>
    `);

    // Append button to body (not navbar) so it stays visible when navbar is hidden
    // $FlowFixMe[cannot-resolve-name]
    $('body').append($navbarToggle);

    // Bind event handlers
    bindQueueControlEvents();

    queueUIContainer = $queueContainer;

    debug(SUBSYSTEM.QUEUE, 'Queue UI created');
}

/**
 * Bind event handlers to queue control buttons
 */
function bindQueueControlEvents() {
    // Pause/Resume
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('click', '#queue_toggle_pause', async function () {
        if (isQueuePaused()) {
            await resumeQueue();
            // $FlowFixMe[cannot-resolve-name]
            $(this).removeClass('fa-play').addClass('fa-pause');
            // $FlowFixMe[cannot-resolve-name]
            $(this).attr('title', 'Pause queue');
        } else {
            await pauseQueue();
            // $FlowFixMe[cannot-resolve-name]
            $(this).removeClass('fa-pause').addClass('fa-play');
            // $FlowFixMe[cannot-resolve-name]
            $(this).attr('title', 'Resume queue');
        }
    });

    // Clear all
    // $FlowFixMe[cannot-resolve-name]
    $(document).on('click', '#queue_clear_all', async function() {
        // $FlowFixMe[cannot-resolve-name]
        if (confirm('Clear all operations from queue?')) {
            await clearAllOperations();
        }
    });

    // Toggle visibility
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('click', '#queue_toggle_visibility', function () {
        // $FlowFixMe[cannot-resolve-name]
        const $list = $('#queue_list_container');
        // $FlowFixMe[cannot-resolve-name]
        const $icon = $(this).find('i');

        if ($list.is(':visible')) {
            $list.slideUp(200);
            $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            $list.slideDown(200);
            $icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // Remove individual operation
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('click', '.queue-operation-remove', async function () {
        // $FlowFixMe[cannot-resolve-name]
        const operationId = $(this).data('operation-id');
        await removeOperation(operationId);
    });

    // Navbar toggle (show/hide ENTIRE navbar)
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $(document).on('click', '#queue_navbar_toggle', function () {
        // $FlowFixMe[cannot-resolve-name]
        const $navbar = $(`#${NAVBAR_ID}`);
        // $FlowFixMe[cannot-resolve-name]
        const $button = $(this);

        if ($navbar.is(':visible')) {
            // Hide ENTIRE navbar, keep button visible
            $navbar.hide();
            $button.removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT);
            $button.attr('title', 'Show Queue Navbar');
            $button.css('left', '0'); // Move button to left edge when navbar hidden
            localStorage.setItem('operation_queue_navbar_visible', 'false');
        } else {
            // Show navbar
            $navbar.show();
            $button.removeClass(ICON_CHEVRON_RIGHT).addClass(ICON_CHEVRON_LEFT);
            $button.attr('title', 'Hide Queue Navbar');
            $button.css('left', '200px'); // Move button back to navbar edge when shown
            localStorage.setItem('operation_queue_navbar_visible', 'true');
        }
    });

    // Restore navbar visibility state from localStorage
    // $FlowFixMe[cannot-resolve-name]
    const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
    if (navbarVisible === 'false') {
        // $FlowFixMe[cannot-resolve-name]
        const $navbar = $(`#${NAVBAR_ID}`);
        // $FlowFixMe[cannot-resolve-name]
        const $button = $('#queue_navbar_toggle');
        $navbar.hide(); // Hide entire navbar
        $button.removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT);
        $button.attr('title', 'Show Queue Navbar');
        $button.css('left', '0'); // Button at left edge when collapsed
    }
}

/**
 * Update queue display
 */
function updateQueueDisplay() {
    if (!queueUIContainer) {
        // Try to create UI if it doesn't exist yet
        createQueueUI();
        if (!queueUIContainer) {
            return; // Still can't create, bail out
        }
    }

    // Check if queue display is enabled in settings
    const enabled = get_settings('operation_queue_display_enabled') !== false; // Default to true

    // $FlowFixMe[cannot-resolve-name]
    const $navbar = $(`#${NAVBAR_ID}`);
    // $FlowFixMe[cannot-resolve-name]
    const $button = $('#queue_navbar_toggle');

    if (!enabled) {
        // Setting disabled: hide both navbar and button
        $navbar.hide();
        $button.hide();
        return;
    }

    // Setting enabled: show button, navbar visibility controlled by user
    $button.show();

    // Check user's toggle preference (default to visible)
    // $FlowFixMe[cannot-resolve-name]
    const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
    if (navbarVisible !== 'false') {
        // Navbar visible - sync button state
        $navbar.show();
        $button.removeClass(ICON_CHEVRON_RIGHT).addClass(ICON_CHEVRON_LEFT);
        $button.attr('title', 'Hide Queue Navbar');
        $button.css('left', '200px');
    } else {
        // Navbar hidden - sync button state
        $navbar.hide();
        $button.removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT);
        $button.attr('title', 'Show Queue Navbar');
        $button.css('left', '0');
    }

    // Update count in header
    const stats = getQueueStats();
    // $FlowFixMe[cannot-resolve-name]
    const $count = $('#queue_count');
    const totalCount = stats.pending + stats.in_progress + stats.failed;
    $count.text(`(${totalCount})`);

    // Update pause/resume button
    // $FlowFixMe[cannot-resolve-name]
    const $pauseBtn = $('#queue_toggle_pause');
    if (stats.paused) {
        $pauseBtn.removeClass('fa-pause').addClass('fa-play');
        $pauseBtn.attr('title', 'Resume queue');
    } else {
        $pauseBtn.removeClass('fa-play').addClass('fa-pause');
        $pauseBtn.attr('title', 'Pause queue');
    }

    // Update operations list
    renderOperationsList();
}

/**
 * Render operations list
 */
function renderOperationsList() {
    // $FlowFixMe[cannot-resolve-name]
    const $list = $('#queue_operations_list');
    const allOperations = getAllOperations();

    // Filter out completed operations (they're auto-removed)
    const operations = allOperations.filter(op => op.status !== OperationStatus.COMPLETED);

    if (operations.length === 0) {
        $list.html('<div style="opacity: 0.6; padding: 0.5em; text-align: center;">No operations in queue</div>');
        return;
    }

    // Sort: in_progress first, then pending, then failed/cancelled
    const sorted = [...operations].sort((a, b) => {
        const statusOrder = {
            [OperationStatus.IN_PROGRESS]: 0,
            [OperationStatus.PENDING]: 1,
            [OperationStatus.COMPLETED]: 2,
            [OperationStatus.FAILED]: 3,
            [OperationStatus.CANCELLED]: 4
        };

        const orderA = statusOrder[a.status] ?? 99;
        const orderB = statusOrder[b.status] ?? 99;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        return a.created_at - b.created_at;
    });

    const $operations = sorted.map(op => renderOperation(op));
    $list.html($operations);
}

/**
 * Render individual operation
 */
// $FlowFixMe[missing-local-annot]
function renderOperation(operation) {
    const statusIcons = {
        [OperationStatus.PENDING]: '<i class="fa-solid fa-clock" style="color: var(--SmartThemeQuoteColor);"></i>',
        [OperationStatus.IN_PROGRESS]: '<i class="fa-solid fa-spinner fa-spin" style="color: var(--SmartThemeBodyColor);"></i>',
        [OperationStatus.COMPLETED]: '<i class="fa-solid fa-check" style="color: #4caf50;"></i>',
        [OperationStatus.FAILED]: '<i class="fa-solid fa-xmark" style="color: #f44336;"></i>',
        [OperationStatus.CANCELLED]: '<i class="fa-solid fa-ban" style="color: #ff9800;"></i>'
    };

    const statusColors = {
        [OperationStatus.PENDING]: 'rgba(128, 128, 128, 0.1)',
        [OperationStatus.IN_PROGRESS]: 'rgba(33, 150, 243, 0.1)',
        [OperationStatus.COMPLETED]: 'rgba(76, 175, 80, 0.1)',
        [OperationStatus.FAILED]: 'rgba(244, 67, 54, 0.1)',
        [OperationStatus.CANCELLED]: 'rgba(255, 152, 0, 0.1)'
    };

    const icon = statusIcons[operation.status] || '';
    const bgColor = statusColors[operation.status] || 'transparent';

    // Format operation type for display
    const typeName = formatOperationType(operation.type);

    // Format params for display
    const paramsText = formatOperationParams(operation.type, operation.params);

    // Calculate duration if completed
    let durationText = '';
    if (operation.completed_at && operation.started_at) {
        const duration = operation.completed_at - operation.started_at;
        durationText = `<span style="opacity: 0.6; font-size: 0.8em;">${formatDuration(duration)}</span>`;
    }

    // Error message if failed
    let errorText = '';
    if (operation.status === OperationStatus.FAILED && operation.error) {
        errorText = `<div style="font-size: 0.8em; color: #f44336; margin-top: 0.2em;">${operation.error}</div>`;
    }

    // Retry info
    let retryText = '';
    if (operation.retries > 0) {
        retryText = `<span style="font-size: 0.8em; opacity: 0.6;">(retry ${operation.retries})</span>`;
    }

    // Remove button (only for pending/failed/cancelled)
    let removeButton = '';
    if (operation.status !== OperationStatus.IN_PROGRESS) {
        removeButton = `<button class="queue-operation-remove fa-solid fa-times" data-operation-id="${operation.id}" title="Remove" style="background: none; border: none; cursor: pointer; padding: 0.2em 0.5em; opacity: 0.5;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5"></button>`;
    }

    // $FlowFixMe[cannot-resolve-name]
    return $(`
        <div class="queue-operation" style="background: ${bgColor}; padding: 0.4em; margin-bottom: 0.3em; border-radius: 4px; font-size: 0.8em;">
            <div style="display: flex; align-items: flex-start; gap: 0.4em; margin-bottom: 0.2em;">
                <div style="flex-shrink: 0; margin-top: 0.1em;">${icon}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 500; font-size: 0.9em;">${typeName} ${retryText}</div>
                    ${paramsText ? `<div style="opacity: 0.7; font-size: 0.85em; margin-top: 0.1em;">${paramsText}</div>` : ''}
                </div>
                ${removeButton}
            </div>
            ${durationText ? `<div style="opacity: 0.6; font-size: 0.8em; margin-left: 1.5em;">${durationText}</div>` : ''}
            ${errorText}
        </div>
    `);
}

/**
 * Format operation type for display
 */
// $FlowFixMe[missing-local-annot]
function formatOperationType(type) {
    const names = {
        [OperationType.SUMMARIZE_MESSAGE]: 'Summarize',
        [OperationType.VALIDATE_SUMMARY]: 'Validate',
        [OperationType.DETECT_SCENE_BREAK]: 'Detect Scene',
        [OperationType.GENERATE_SCENE_SUMMARY]: 'Scene Summary',
        [OperationType.GENERATE_SCENE_NAME]: 'Scene Name',
        [OperationType.GENERATE_RUNNING_SUMMARY]: 'Running Summary',
        [OperationType.COMBINE_SCENE_WITH_RUNNING]: 'Combine Scene',
        // $FlowFixMe[prop-missing] [invalid-computed-prop]
        [OperationType.GENERATE_COMBINED_SUMMARY]: 'Combined Summary'
    };

    return names[type] || type;
}

/**
 * Format operation params for display
 */
// $FlowFixMe[missing-local-annot]
function formatOperationParams(type, params) {
    switch (type) {
        case OperationType.SUMMARIZE_MESSAGE:
        case OperationType.VALIDATE_SUMMARY:
        case OperationType.DETECT_SCENE_BREAK:
        case OperationType.GENERATE_SCENE_SUMMARY:
        case OperationType.GENERATE_SCENE_NAME:
        case OperationType.COMBINE_SCENE_WITH_RUNNING:
            if (params.index !== undefined) {
                return `Message #${params.index}`;
            }
            if (params.indexes && params.indexes.length) {
                return `Messages #${params.indexes[0]}-${params.indexes[params.indexes.length - 1]}`;
            }
            return '';

        case OperationType.GENERATE_RUNNING_SUMMARY:
            // falls through
        // $FlowFixMe[prop-missing]
        // eslint-disable-next-line no-fallthrough
        case OperationType.GENERATE_COMBINED_SUMMARY:
            return 'All messages';

        default:
            return JSON.stringify(params);
    }
}

/**
 * Format duration in ms to human readable
 */
// $FlowFixMe[missing-local-annot]
function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Show/hide queue UI based on settings
 */
export function updateQueueUIVisibility() {
    if (!queueUIContainer) {
        return;
    }

    const enabled = get_settings('operation_queue_display_enabled') !== false;

    // $FlowFixMe[cannot-resolve-name]
    const $navbar = $(`#${NAVBAR_ID}`);
    // $FlowFixMe[cannot-resolve-name]
    const $button = $('#queue_navbar_toggle');

    if (!enabled) {
        // Setting disabled: hide both navbar and button
        $navbar.hide();
        $button.hide();
    } else {
        // Setting enabled: show button, navbar visibility controlled by user
        $button.show();

        // Check user's toggle preference (default to visible)
        // $FlowFixMe[cannot-resolve-name]
        const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
        if (navbarVisible !== 'false') {
            // Navbar visible - sync button state
            $navbar.show();
            $button.removeClass(ICON_CHEVRON_RIGHT).addClass(ICON_CHEVRON_LEFT);
            $button.attr('title', 'Hide Queue Navbar');
            $button.css('left', '200px');
        } else {
            // Navbar hidden - sync button state
            $navbar.hide();
            $button.removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT);
            $button.attr('title', 'Show Queue Navbar');
            $button.css('left', '0');
        }
    }
}

export default {
    initQueueUI,
    updateQueueDisplay,
    updateQueueUIVisibility
};

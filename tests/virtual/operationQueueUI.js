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
const NAVBAR_TOGGLE_ID = 'queue_navbar_toggle';
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
        <div id="shared_operation_queue_ui">
            <div class="queue-header">
                <div id="queue_toggle_visibility" title="Collapse/Expand">
                    <h4>Operations <span id="queue_count">(0)</span></h4>
                    <i class="fa-solid fa-chevron-up"></i>
                </div>
            </div>
            <div id="queue_list_container" class="queue-list">
                <div class="queue-controls">
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
    // Position is calculated dynamically based on navbar width
    // $FlowFixMe[cannot-resolve-name]
    const navbarWidth = $navbar.outerWidth() || 175;
    // $FlowFixMe[cannot-resolve-name]
    const $navbarToggle = $(`
        <button id="${NAVBAR_TOGGLE_ID}" class="menu_button fa-solid ${ICON_CHEVRON_LEFT}"
            title="Hide Queue Navbar"
            style="position: fixed; top: 50vh; left: ${navbarWidth}px; transform: translateY(-50%); padding: 0.8em 0.5em; font-size: 1.2em; z-index: 1000002; background: rgba(30,30,40,0.95); border: 1px solid var(--SmartThemeBlurTintColor); border-radius: 0 8px 8px 0;"></button>
    `);

    // Append button to body (not navbar) so it stays visible when navbar is hidden
    // $FlowFixMe[cannot-resolve-name]
    $('body').append($navbarToggle);

    // Bind event handlers
    bindQueueControlEvents();

    queueUIContainer = $queueContainer;

    // Initialize dynamic height calculation
    updateQueueHeight();

    debug(SUBSYSTEM.QUEUE, 'Queue UI created');
}

/**
 * Update queue container height dynamically based on viewport and content
 */
function updateQueueHeight() {
    // $FlowFixMe[cannot-resolve-name]
    const $queueUI = $('#shared_operation_queue_ui');
    // $FlowFixMe[cannot-resolve-name]
    const $queueList = $('#queue_list_container');

    if (!$queueUI.length || !$queueList.length) {
        return;
    }

    // Check if queue is collapsed
    // $FlowFixMe[cannot-resolve-name]
    if ($queueUI.hasClass('queue-collapsed')) {
        return;
    }

    // Get viewport height
    // $FlowFixMe[cannot-resolve-name]
    const viewportHeight = $(window).height() || 800;

    // Get queue container's position from top of viewport
    const queueTop = $queueUI.offset()?.top || 60;

    // Reserve space for:
    // - Bottom margin/padding (20px)
    // - Other navbar elements below queue (estimate based on presence)
    // $FlowFixMe[cannot-resolve-name]
    const navbarBottomContent = $('#scene-summary-navigator-bar').find('.running-summary-controls, .scene-nav-link').length > 0 ? 150 : 50;

    // Calculate available height for queue
    const availableHeight = viewportHeight - queueTop - navbarBottomContent;

    // Set constraints
    const minHeight = 100; // Minimum height when queue has items
    const maxHeight = Math.max(minHeight, availableHeight);

    // Get the queue header height
    // $FlowFixMe[cannot-resolve-name]
    const headerHeight = $queueUI.find('.queue-header').outerHeight() || 50;

    // Calculate height for the list container
    const listMaxHeight = maxHeight - headerHeight - 20; // 20px for padding/margin

    // Update the queue UI max-height
    $queueUI.css('max-height', `${maxHeight}px`);

    // Update the list container max-height if needed (let CSS flexbox handle most of it)
    // Only set if we need to override the CSS
    if (listMaxHeight < 200) {
        $queueList.css('max-height', `${listMaxHeight}px`);
    } else {
        $queueList.css('max-height', ''); // Clear inline style, let CSS take over
    }

    debug(SUBSYSTEM.QUEUE, `Queue height updated: maxHeight=${maxHeight}px, listMaxHeight=${listMaxHeight}px`);
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
        const $queueUI = $('#shared_operation_queue_ui');
        // $FlowFixMe[cannot-resolve-name]
        const $list = $('#queue_list_container');
        // $FlowFixMe[cannot-resolve-name]
        const $icon = $(this).find('i');

        if ($list.is(':visible')) {
            $list.slideUp(200);
            $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
            $queueUI.addClass('queue-collapsed');
        } else {
            $list.slideDown(200, () => {
                // After expanding, recalculate height
                updateQueueHeight();
            });
            $icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
            $queueUI.removeClass('queue-collapsed');
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
    $(document).on('click', `#${NAVBAR_TOGGLE_ID}`, function () {
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
            // Calculate button position based on actual navbar width
            // $FlowFixMe[cannot-resolve-name]
            const navbarWidth = $navbar.outerWidth() || 175;
            $button.css('left', `${navbarWidth}px`); // Move button to navbar edge when shown
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
        const $button = $(`#${NAVBAR_TOGGLE_ID}`);
        $navbar.hide(); // Hide entire navbar
        $button.removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT);
        $button.attr('title', 'Show Queue Navbar');
        $button.css('left', '0'); // Button at left edge when collapsed
    }

    // Add window resize listener
    // $FlowFixMe[cannot-resolve-name]
    let resizeTimeout;
    // $FlowFixMe[cannot-resolve-name]
    $(window).on('resize', function() {
        // Debounce resize events
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            updateQueueHeight();
        }, 150);
    });
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
    const $button = $(`#${NAVBAR_TOGGLE_ID}`);

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
        // Calculate button position based on actual navbar width
        // $FlowFixMe[cannot-resolve-name]
        const navbarWidth = $navbar.outerWidth() || 175;
        $button.css('left', `${navbarWidth}px`);
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

    // Update queue height after rendering operations
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
        updateQueueHeight();
    }, 0);
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
    const paramsText = formatOperationParams(operation.type, operation.params, operation.metadata);

    // Calculate duration if completed
    let durationText = '';
    if (operation.completed_at && operation.started_at) {
        const duration = operation.completed_at - operation.started_at;
        durationText = `<span style="opacity: 0.6; font-size: 0.8em;">${formatDuration(duration)}</span>`;
    }

    // Error message if failed
    let errorText = '';
    if (operation.status === OperationStatus.FAILED && operation.error) {
        errorText = `<div class="queue-operation-error">${operation.error}</div>`;
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
        <div class="queue-operation" style="background: ${bgColor};">
            <div class="queue-operation-header">
                <div class="queue-operation-icon">${icon}</div>
                <div class="queue-operation-content">
                    <div class="queue-operation-type">${typeName} ${retryText}</div>
                    ${paramsText ? `<div class="queue-operation-params">${paramsText}</div>` : ''}
                </div>
                ${removeButton}
            </div>
            ${durationText ? `<div class="queue-operation-duration">${durationText}</div>` : ''}
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
        [OperationType.GENERATE_COMBINED_SUMMARY]: 'Combined Summary',
        [OperationType.PROCESS_LOREBOOK_ENTRY]: 'Lorebook - Process',
        [OperationType.LOREBOOK_ENTRY_LOOKUP]: 'Lorebook - Lookup',
        [OperationType.RESOLVE_LOREBOOK_ENTRY]: 'Lorebook - Dedupe',
        [OperationType.CREATE_LOREBOOK_ENTRY]: 'Lorebook - Create',
        [OperationType.MERGE_LOREBOOK_ENTRY]: 'Lorebook - Merge',
        [OperationType.UPDATE_LOREBOOK_REGISTRY]: 'Lorebook - Registry'
    };

    return names[type] || type;
}

/**
 * Format lorebook operation params as <type>-<name>
 */
// $FlowFixMe[missing-local-annot]
function formatLorebookOperationParams(params, metadata) {
    const entryType = params.entryData?.type || metadata?.entry_type || 'entry';
    const entryName = metadata?.entry_comment || params.entryData?.comment || params.entryData?.name || 'Unknown';

    // Check if name already has type prefix to avoid duplication (e.g., "location-Apartment")
    if (entryName.startsWith(`${entryType}-`)) {
        return entryName;
    }

    return `${entryType}-${entryName}`;
}

/**
 * Format message operation params as Message #N
 */
// $FlowFixMe[missing-local-annot]
function formatMessageOperationParams(params) {
    if (params.index !== undefined) {
        return `Message #${params.index}`;
    }
    if (params.indexes && params.indexes.length) {
        return `Messages #${params.indexes[0]}-${params.indexes[params.indexes.length - 1]}`;
    }
    return '';
}

/**
 * Format operation params for display
 */
// $FlowFixMe[missing-local-annot]
function formatOperationParams(type, params, metadata) {
    switch (type) {
        case OperationType.SUMMARIZE_MESSAGE:
        case OperationType.VALIDATE_SUMMARY:
        case OperationType.DETECT_SCENE_BREAK:
        case OperationType.GENERATE_SCENE_SUMMARY:
        case OperationType.GENERATE_SCENE_NAME:
        case OperationType.COMBINE_SCENE_WITH_RUNNING:
            return formatMessageOperationParams(params);

        case OperationType.GENERATE_RUNNING_SUMMARY:
            // falls through
        // $FlowFixMe[prop-missing]
        // eslint-disable-next-line no-fallthrough
        case OperationType.GENERATE_COMBINED_SUMMARY:
            return 'All messages';

        case OperationType.PROCESS_LOREBOOK_ENTRY:
        case OperationType.LOREBOOK_ENTRY_LOOKUP:
        case OperationType.RESOLVE_LOREBOOK_ENTRY:
        case OperationType.CREATE_LOREBOOK_ENTRY:
        case OperationType.MERGE_LOREBOOK_ENTRY:
        case OperationType.UPDATE_LOREBOOK_REGISTRY:
            return formatLorebookOperationParams(params, metadata);

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
    const $button = $(`#${NAVBAR_TOGGLE_ID}`);

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
            // Calculate button position based on actual navbar width
            // $FlowFixMe[cannot-resolve-name]
            const navbarWidth = $navbar.outerWidth() || 175;
            $button.css('left', `${navbarWidth}px`);
        } else {
            // Navbar hidden - sync button state
            $navbar.hide();
            $button.removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT);
            $button.attr('title', 'Show Queue Navbar');
            $button.css('left', '0');
        }
    }
}

/**
 * Update navbar toggle button position to match navbar width
 * Call this when navbar width changes dynamically
 */
function updateNavbarToggleButtonPosition() {
    // $FlowFixMe[cannot-resolve-name]
    const $navbar = $(`#${NAVBAR_ID}`);
    // $FlowFixMe[cannot-resolve-name]
    const $button = $(`#${NAVBAR_TOGGLE_ID}`);

    // Only update if navbar is visible and button exists
    if (!$navbar.length || !$button.length) return;
    if (!$navbar.is(':visible')) return;

    // Calculate button position based on current navbar width
    // $FlowFixMe[cannot-resolve-name]
    const navbarWidth = $navbar.outerWidth() || 175;
    $button.css('left', `${navbarWidth}px`);
}

export default {
    initQueueUI,
    updateQueueDisplay,
    updateQueueUIVisibility,
    updateNavbarToggleButtonPosition
};

// Export to window for external access
// $FlowFixMe[cannot-resolve-name]
window.updateNavbarToggleButtonPosition = updateNavbarToggleButtonPosition;

// operationQueueUI.js - UI for operation queue display in navbar

import {
    getQueueStats,
    getAllOperations,
    getPendingOperations,
    getInProgressOperations,
    pauseQueue,
    resumeQueue,
    isQueuePaused,
    clearCompletedOperations,
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
    let $navbar = $('#scene-summary-navigator-bar');

    if (!$navbar.length) {
        debug(SUBSYSTEM.QUEUE, 'Creating shared navbar');
        $navbar = $('<div id="scene-summary-navigator-bar" style="width: 175px;"></div>');
        // Insert after the send button area
        $('#sheld').after($navbar);
    }

    // Check if queue container already exists (shared between extensions)
    let $queueContainer = $('#shared_operation_queue_ui');

    if ($queueContainer.length) {
        debug(SUBSYSTEM.QUEUE, 'Queue UI already exists (created by other extension)');
        queueUIContainer = $queueContainer;
        return;
    }

    // Create shared queue container
    $queueContainer = $(`
        <div id="shared_operation_queue_ui" style="margin-top: 1em; padding-top: 1em; border-top: 1px solid var(--SmartThemeBlurTintColor);">
            <div class="queue-header" style="margin-bottom: 0.5em;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.3em;">
                    <h4 style="margin: 0; font-size: 1em;">Operations</h4>
                    <button id="queue_toggle_visibility" class="menu_button fa-solid fa-chevron-up" title="Collapse/Expand" style="padding: 0.2em 0.5em;"></button>
                </div>
                <div style="font-size: 0.8em; opacity: 0.7; margin-bottom: 0.3em;">
                    <span id="queue_stats"></span>
                </div>
                <div class="queue-controls" style="display: flex; gap: 0.3em; flex-wrap: wrap;">
                    <button id="queue_toggle_pause" class="menu_button fa-solid fa-pause" title="Pause/Resume queue" style="flex: 1;"></button>
                    <button id="queue_clear_completed" class="menu_button fa-solid fa-check-double" title="Clear completed" style="flex: 1;"></button>
                    <button id="queue_clear_all" class="menu_button fa-solid fa-trash" title="Clear all" style="flex: 1;"></button>
                </div>
            </div>
            <div id="queue_list_container" class="queue-list" style="max-height: 200px; overflow-y: auto;">
                <div id="queue_operations_list"></div>
            </div>
        </div>
    `);

    // Insert at top of navbar (above any other content)
    $navbar.prepend($queueContainer);

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
    $(document).on('click', '#queue_toggle_pause', async function() {
        if (isQueuePaused()) {
            await resumeQueue();
            $(this).removeClass('fa-play').addClass('fa-pause');
            $(this).attr('title', 'Pause queue');
        } else {
            await pauseQueue();
            $(this).removeClass('fa-pause').addClass('fa-play');
            $(this).attr('title', 'Resume queue');
        }
    });

    // Clear completed
    $(document).on('click', '#queue_clear_completed', async function() {
        await clearCompletedOperations();
    });

    // Clear all
    $(document).on('click', '#queue_clear_all', async function() {
        if (confirm('Clear all operations from queue?')) {
            await clearAllOperations();
        }
    });

    // Toggle visibility
    $(document).on('click', '#queue_toggle_visibility', function() {
        const $list = $('#queue_list_container');
        const $icon = $(this);

        if ($list.is(':visible')) {
            $list.slideUp(200);
            $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            $list.slideDown(200);
            $icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // Remove individual operation
    $(document).on('click', '.queue-operation-remove', async function() {
        const operationId = $(this).data('operation-id');
        await removeOperation(operationId);
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

    // Check if queue display is enabled
    const enabled = get_settings('operation_queue_display_enabled') !== false; // Default to true

    if (!enabled) {
        queueUIContainer.hide();
        return;
    }

    queueUIContainer.show();

    // Update stats
    const stats = getQueueStats();
    const $stats = $('#queue_stats');
    const parts = [];
    if (stats.pending > 0) parts.push(`${stats.pending} pending`);
    if (stats.in_progress > 0) parts.push(`${stats.in_progress} running`);
    if (stats.completed > 0) parts.push(`${stats.completed} done`);
    if (stats.failed > 0) parts.push(`${stats.failed} failed`);
    $stats.text(parts.length > 0 ? parts.join(', ') : 'No operations');

    // Update pause/resume button
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
    const $list = $('#queue_operations_list');
    const operations = getAllOperations();

    if (operations.length === 0) {
        $list.html('<div style="opacity: 0.6; padding: 0.5em; text-align: center;">No operations in queue</div>');
        return;
    }

    // Sort: in_progress first, then pending, then completed/failed
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
        retryText = `<span style="font-size: 0.8em; opacity: 0.6;">(retry ${operation.retries}/${operation.max_retries})</span>`;
    }

    // Remove button (only for pending/failed/cancelled)
    let removeButton = '';
    if (operation.status !== OperationStatus.IN_PROGRESS) {
        removeButton = `<button class="queue-operation-remove fa-solid fa-times" data-operation-id="${operation.id}" title="Remove" style="background: none; border: none; cursor: pointer; padding: 0.2em 0.5em; opacity: 0.5;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5"></button>`;
    }

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
function formatOperationType(type) {
    const names = {
        [OperationType.SUMMARIZE_MESSAGE]: 'Summarize',
        [OperationType.VALIDATE_SUMMARY]: 'Validate',
        [OperationType.DETECT_SCENE_BREAK]: 'Detect Scene',
        [OperationType.GENERATE_SCENE_SUMMARY]: 'Scene Summary',
        [OperationType.GENERATE_SCENE_NAME]: 'Scene Name',
        [OperationType.GENERATE_RUNNING_SUMMARY]: 'Running Summary',
        [OperationType.COMBINE_SCENE_WITH_RUNNING]: 'Combine Scene',
        [OperationType.GENERATE_COMBINED_SUMMARY]: 'Combined Summary'
    };

    return names[type] || type;
}

/**
 * Format operation params for display
 */
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
        case OperationType.GENERATE_COMBINED_SUMMARY:
            return 'All messages';

        default:
            return JSON.stringify(params);
    }
}

/**
 * Format duration in ms to human readable
 */
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

    if (enabled) {
        queueUIContainer.show();
    } else {
        queueUIContainer.hide();
    }
}

export default {
    initQueueUI,
    updateQueueDisplay,
    updateQueueUIVisibility
};

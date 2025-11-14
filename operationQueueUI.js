
/* global localStorage -- Browser API for persisting UI preferences */
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
  OperationType } from
'./operationQueue.js';
import {
  debug,
  SUBSYSTEM,
  selectorsExtension,
  selectorsSillyTavern } from
'./index.js';

import {
  QUEUE_BUTTON_WIDTH_PX,
  QUEUE_CONTAINER_WIDTH_PX,
  QUEUE_INDICATOR_HEIGHT_PX,
  PROGRESS_BAR_OFFSET_PX,
  PROGRESS_BAR_MINOR_OFFSET_PX,
  PROGRESS_CIRCLE_STROKE_OFFSET_PX,
  ANIMATION_DELAY_MS,
  MAX_DISPLAY_PERCENTAGE,
  ONE_SECOND_MS,
  ONE_MINUTE_MS
} from './constants.js';

// Constants
const NAVBAR_ID = 'scene-recap-navigator-bar';
const NAVBAR_TOGGLE_ID = 'queue_navbar_toggle';
const ICON_CHEVRON_LEFT = 'fa-chevron-left';
const ICON_CHEVRON_RIGHT = 'fa-chevron-right';
const QUEUE_COLLAPSED_KEY = 'operation_queue_collapsed';

let queueUIContainer = null;
let isInitialized = false;

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

function createQueueUI() {
  // Find or create the shared navbar (used by both extensions)
  let $navbar = $(selectorsExtension.sceneNav.bar);

  if (!$navbar.length) {
    debug(SUBSYSTEM.QUEUE, 'Creating shared navbar');
    $navbar = $(`<div id="${NAVBAR_ID}" data-testid="scene-navigator-bar" style="width: ${QUEUE_BUTTON_WIDTH_PX}px; position: relative;"></div>`);
    // Insert after the send button area
    $(selectorsSillyTavern.chat.holder).after($navbar);
  }

  // Check if queue container already exists (shared between extensions)
  let $queueContainer = $(selectorsExtension.queue.panel);

  if ($queueContainer.length) {
    debug(SUBSYSTEM.QUEUE, 'Queue UI already exists (created by other extension)');
    queueUIContainer = $queueContainer;
    return;
  }

  // Check collapsed state from localStorage
  const isCollapsed = localStorage.getItem(QUEUE_COLLAPSED_KEY) === 'true';
  const chevronIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
  const collapsedClass = isCollapsed ? ' queue-collapsed' : '';

  // Create shared queue container
  $queueContainer = $(`
        <div id="shared_operation_queue_ui" data-testid="queue-panel"${collapsedClass}>
            <div class="queue-header" data-testid="queue-header">
                <div id="queue_toggle_visibility" data-testid="queue-toggle-visibility" title="Collapse/Expand">
                    <h4>Operations <span id="queue_count" data-testid="queue-count">(0)</span></h4>
                    <div class="queue-controls">
                        <button id="queue_toggle_pause" data-testid="queue-toggle-pause" class="menu_button fa-solid fa-pause" title="Pause/Resume queue"></button>
                        <button id="queue_clear_all" data-testid="queue-clear-all" class="menu_button fa-solid fa-trash" title="Clear all"></button>
                    </div>
                    <i class="fa-solid ${chevronIcon}"></i>
                </div>
            </div>
            <div id="queue_list_container" data-testid="queue-list-container" class="queue-list" style="${isCollapsed ? 'display: none;' : ''}">
                <div id="queue_operations_list" data-testid="queue-operations-list"></div>
            </div>
        </div>
    `);

  // Insert queue container at top of navbar
  $navbar.prepend($queueContainer);

  // Create navbar collapse/expand toggle button (fixed position at middle-right of navbar)
  // This button is NOT a child of the navbar - it's fixed to viewport
  // Position is calculated dynamically based on navbar width
  const navbarWidth = $navbar.outerWidth() || QUEUE_BUTTON_WIDTH_PX;
  const $navbarToggle = $(`
        <button id="${NAVBAR_TOGGLE_ID}" data-testid="queue-navbar-toggle" class="menu_button fa-solid ${ICON_CHEVRON_LEFT}"
            title="Hide Queue Navbar"
            style="position: fixed; top: 50vh; left: ${navbarWidth}px; transform: translateY(-50%); font-size: 1.2em; z-index: 1000002; background: rgba(30,30,40,0.95); border: 1px solid var(--SmartThemeBlurTintColor); border-radius: 0 8px 8px 0;"></button>
    `);

  // Append button to body (not navbar) so it stays visible when navbar is hidden
  $(selectorsSillyTavern.dom.body).append($navbarToggle);

  // Bind event handlers
  bindQueueControlEvents();

  queueUIContainer = $queueContainer;

  // Initialize dynamic height calculation
  updateQueueHeight();

  debug(SUBSYSTEM.QUEUE, 'Queue UI created');
}

function updateQueueHeight() {
  const $queueUI = $(selectorsExtension.queue.panel);
  const $queueList = $(selectorsExtension.queue.listContainer);

  if (!$queueUI.length || !$queueList.length) {
    return;
  }

  // Check if queue is collapsed
  if ($queueUI.hasClass('queue-collapsed')) {
    return;
  }

  // Get viewport height
  const viewportHeight = $(window).height() || QUEUE_CONTAINER_WIDTH_PX;

  // Get queue container's position from top of viewport
  const queueTop = $queueUI.offset()?.top || QUEUE_INDICATOR_HEIGHT_PX;

  // Reserve space for:
  // - Bottom margin/padding (20px)
  // - Other navbar elements below queue (estimate based on presence)
  const navbarBottomContent = $(selectorsExtension.sceneNav.bar).find('.running-recap-controls, .scene-nav-link').length > 0 ? PROGRESS_BAR_OFFSET_PX : PROGRESS_BAR_MINOR_OFFSET_PX;

  // Calculate available height for queue
  const availableHeight = viewportHeight - queueTop - navbarBottomContent;

  // Set constraints
  const minHeight = 100; // Minimum height when queue has items
  const maxHeight = Math.max(minHeight, availableHeight);

  // Get the queue header height
  const headerHeight = $queueUI.find(selectorsExtension.queue.header).outerHeight() || PROGRESS_BAR_MINOR_OFFSET_PX;

  // Calculate height for the list container
  const listMaxHeight = maxHeight - headerHeight - PROGRESS_CIRCLE_STROKE_OFFSET_PX; // 20px for padding/margin

  // Update the queue UI max-height
  $queueUI.css('max-height', `${maxHeight}px`);

  // Update the list container max-height if needed (let CSS flexbox handle most of it)
  // Only set if we need to override the CSS
  if (listMaxHeight < ANIMATION_DELAY_MS) {
    $queueList.css('max-height', `${listMaxHeight}px`);
  } else {
    $queueList.css('max-height', ''); // Clear inline style, let CSS take over
  }

  debug(SUBSYSTEM.QUEUE, `Queue height updated: maxHeight=${maxHeight}px, listMaxHeight=${listMaxHeight}px`);
}

function bindQueueControlEvents() {
  // Pause/Resume
  $(document).on('click', '#queue_toggle_pause', async function (e) {
    e.stopPropagation(); // Prevent toggling collapse/expand
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

  // Clear all
  $(document).on('click', '#queue_clear_all', async function (e) {
    e.stopPropagation(); // Prevent toggling collapse/expand
    if (confirm('Clear all operations from queue?')) {
      await clearAllOperations();
    }
  });

  // Toggle visibility
  $(document).on('click', selectorsExtension.queue.toggleVisibility, function () {
    const $queueUI = $(selectorsExtension.queue.panel);
    const $list = $(selectorsExtension.queue.listContainer);
    const $icon = $(this).find('i');

    if ($list.is(':visible')) {
      $list.slideUp(ANIMATION_DELAY_MS);
      $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
      $queueUI.addClass('queue-collapsed');
      localStorage.setItem(QUEUE_COLLAPSED_KEY, 'true');
    } else {
      $list.slideDown(ANIMATION_DELAY_MS, () => {
        // After expanding, recalculate height
        updateQueueHeight();
      });
      $icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
      $queueUI.removeClass('queue-collapsed');
      localStorage.setItem(QUEUE_COLLAPSED_KEY, 'false');
    }
  });

  // Remove individual operation
  $(document).on('click', '.queue-operation-remove', async function (e) {
    e.stopPropagation(); // Prevent toggling collapse/expand
    const operationId = $(this).data('operation-id');
    await removeOperation(operationId);
  });

  // Navbar toggle (show/hide ENTIRE navbar)
  $(document).on('click', selectorsExtension.queue.navbarToggle, function () {
    const $navbar = $(selectorsExtension.sceneNav.bar);
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
      const navbarWidth = $navbar.outerWidth() || QUEUE_BUTTON_WIDTH_PX;
      $button.css('left', `${navbarWidth}px`); // Move button to navbar edge when shown
      localStorage.setItem('operation_queue_navbar_visible', 'true');
    }
  });

  // Restore navbar visibility state from localStorage
  const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
  if (navbarVisible === 'false') {
    const $navbar = $(selectorsExtension.sceneNav.bar);
    const $button = $(selectorsExtension.queue.navbarToggle);
    $navbar.hide(); // Hide entire navbar
    $button.removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT);
    $button.attr('title', 'Show Queue Navbar');
    $button.css('left', '0'); // Button at left edge when collapsed
  }

  // Add window resize listener
  let resizeTimeout;
  $(window).on('resize', function () {
    // Debounce resize events
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      updateQueueHeight();
    }, PROGRESS_BAR_OFFSET_PX);
  });
}

function updateQueueDisplay() {
  if (!queueUIContainer) {
    // Try to create UI if it doesn't exist yet
    createQueueUI();
    if (!queueUIContainer) {
      return; // Still can't create, bail out
    }
  }

  const $navbar = $(selectorsExtension.sceneNav.bar);
  const $button = $(selectorsExtension.queue.navbarToggle);

  // Always show button, navbar visibility controlled by user
  $button.show();

  // Check user's toggle preference (default to visible)
  const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
  if (navbarVisible !== 'false') {
    // Navbar visible - sync button state
    $navbar.show();
    $button.removeClass(ICON_CHEVRON_RIGHT).addClass(ICON_CHEVRON_LEFT);
    $button.attr('title', 'Hide Queue Navbar');
    // Calculate button position based on actual navbar width
    const navbarWidth = $navbar.outerWidth() || QUEUE_BUTTON_WIDTH_PX;
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
  const $count = $(selectorsExtension.queue.count);
  if (stats.paused) {
    $count.text('(PAUSED)').addClass('queue-paused');
  } else {
    const totalCount = stats.pending + stats.in_progress + stats.failed;
    $count.text(`(${totalCount})`).removeClass('queue-paused');
  }

  // Update pause/resume button
  const $pauseBtn = $(selectorsExtension.queue.togglePause);
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

function renderOperationsList() {
  const $list = $(selectorsExtension.queue.operationsList);
  const allOperations = getAllOperations();

  // Filter out completed operations (they're auto-removed)
  // RETRYING operations are displayed prominently
  const operations = allOperations.filter((op) => op.status !== OperationStatus.COMPLETED);

  if (operations.length === 0) {
    $list.empty();
    return;
  }

  // Sort: in_progress first, retrying second, then by priority (highest first), then by creation time (oldest first)
  const sorted = [...operations].sort((a, b) => {
    const statusOrder = {
      [OperationStatus.IN_PROGRESS]: 0,
      [OperationStatus.RETRYING]: 1,
      [OperationStatus.PENDING]: 2,
      [OperationStatus.COMPLETED]: 3,
      [OperationStatus.FAILED]: 4,
      [OperationStatus.CANCELLED]: 5
    };

    const orderA = statusOrder[a.status] ?? MAX_DISPLAY_PERCENTAGE;
    const orderB = statusOrder[b.status] ?? MAX_DISPLAY_PERCENTAGE;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // Sort by priority (higher first)
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    // Sort by creation time (older first)
    return a.created_at - b.created_at;
  });

  const $operations = sorted.map((op) => renderOperation(op));
  $list.html($operations);

  // Update queue height after rendering operations
  // Use setTimeout to ensure DOM has updated
  setTimeout(() => {
    updateQueueHeight();
  }, 0);
}

function renderOperation(operation) {
  const statusIcons = {
    [OperationStatus.PENDING]: '<i class="fa-solid fa-clock" style="color: var(--SmartThemeQuoteColor);"></i>',
    [OperationStatus.IN_PROGRESS]: '<i class="fa-solid fa-spinner fa-spin" style="color: var(--SmartThemeBodyColor);"></i>',
    [OperationStatus.COMPLETED]: '<i class="fa-solid fa-check" style="color: #4caf50;"></i>',
    [OperationStatus.FAILED]: '<i class="fa-solid fa-xmark" style="color: #f44336;"></i>',
    [OperationStatus.CANCELLED]: '<i class="fa-solid fa-ban" style="color: #ff9800;"></i>',
    [OperationStatus.RETRYING]: '<i class="fa-solid fa-rotate fa-spin" style="color: #ff9800;"></i>'
  };

  const statusColors = {
    [OperationStatus.PENDING]: 'rgba(128, 128, 128, 0.1)',
    [OperationStatus.IN_PROGRESS]: 'rgba(33, 150, 243, 0.1)',
    [OperationStatus.COMPLETED]: 'rgba(76, 175, 80, 0.1)',
    [OperationStatus.FAILED]: 'rgba(244, 67, 54, 0.1)',
    [OperationStatus.CANCELLED]: 'rgba(255, 152, 0, 0.1)',
    [OperationStatus.RETRYING]: 'rgba(255, 152, 0, 0.2)'
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

  // Error message if failed or retrying
  let errorText = '';
  if ((operation.status === OperationStatus.FAILED || operation.status === OperationStatus.RETRYING) && operation.error) {
    const errorStyle = operation.status === OperationStatus.RETRYING ? 'color: #ff9800;' : '';
    errorText = `<div class="queue-operation-error" style="${errorStyle}">${operation.error}</div>`;
  }

  // Retry info - more prominent for RETRYING status
  let retryText = '';
  if (operation.retries > 0) {
    const retryStyle = operation.status === OperationStatus.RETRYING
      ? 'font-size: 0.85em; opacity: 1; color: #ff9800; font-weight: bold;'
      : 'font-size: 0.8em; opacity: 0.6;';
    retryText = `<span style="${retryStyle}">(retry ${operation.retries})</span>`;
  }

  // Build tooltip with operation settings
  const tooltip = buildOperationTooltip(operation);

  // Remove button - available for ALL states
  // IN_PROGRESS/RETRYING: Attempts to abort the operation before removal
  // PENDING/FAILED/CANCELLED: Immediate removal
  const removeTitle = operation.status === OperationStatus.IN_PROGRESS || operation.status === OperationStatus.RETRYING
    ? 'Cancel and Remove'
    : 'Remove';
  const removeButton = `<button class="queue-operation-remove fa-solid fa-times" data-operation-id="${operation.id}" title="${removeTitle}" style="background: none; border: none; cursor: pointer; padding: 0.2em 0.5em; opacity: 0.5;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.5"></button>`;

  return $(`
        <div class="queue-operation" style="background: ${bgColor};">
            <div class="queue-operation-header">
                <div class="queue-operation-icon">${icon}</div>
                <div class="queue-operation-content">
                    <div class="queue-operation-type" title="${tooltip}">${typeName} ${retryText}</div>
                    ${paramsText ? `<div class="queue-operation-params">${paramsText}</div>` : ''}
                </div>
                ${removeButton}
            </div>
            ${durationText ? `<div class="queue-operation-duration">${durationText}</div>` : ''}
            ${errorText}
        </div>
    `);
}

function formatOperationType(type) {
  const names = {
    [OperationType.VALIDATE_RECAP]: 'Validate',
    [OperationType.DETECT_SCENE_BREAK]: 'Detect Scene',
    [OperationType.GENERATE_SCENE_RECAP]: 'Scene Recap',
    [OperationType.GENERATE_RUNNING_RECAP]: 'Running Recap',
    [OperationType.COMBINE_SCENE_WITH_RUNNING]: 'Combine Scene',
    [OperationType.LOREBOOK_ENTRY_LOOKUP]: 'Lorebook - Lookup',
    [OperationType.RESOLVE_LOREBOOK_ENTRY]: 'Lorebook - Dedupe',
    [OperationType.CREATE_LOREBOOK_ENTRY]: 'Lorebook - Create',
    [OperationType.MERGE_LOREBOOK_ENTRY]: 'Lorebook - Merge',
    [OperationType.UPDATE_LOREBOOK_REGISTRY]: 'Lorebook - Registry'
  };

  return names[type] || type;
}

// UI formatting: displays all available operation metadata fields
function buildOperationTooltip(operation) {
  const lines = [];

  // Add operation-specific metadata
  const metadata = operation.metadata || {};

  // Prefill and preset prompts settings (captured at enqueue time)
  if (metadata.hasPrefill !== undefined) {
    lines.push(`Prefill: ${metadata.hasPrefill ? 'Yes' : 'No'}`);
  }
  if (metadata.includePresetPrompts !== undefined) {
    lines.push(`Preset Prompts: ${metadata.includePresetPrompts ? 'Yes' : 'No'}`);
  }

  // Message range for message-based operations
  if (operation.params?.index !== undefined) {
    lines.push(`Message: #${operation.params.index}`);
  } else if (operation.params?.indexes && operation.params.indexes.length > 0) {
    const start = operation.params.indexes[0];
    const end = operation.params.indexes[operation.params.indexes.length - 1];
    lines.push(`Messages: #${start}-${end}`);
  }

  // Scene information
  if (metadata.scene_index !== undefined) {
    lines.push(`Scene: #${metadata.scene_index}`);
  }

  // Lorebook entry information
  if (metadata.entry_type) {
    lines.push(`Type: ${metadata.entry_type}`);
  }
  if (metadata.entry_comment) {
    lines.push(`Entity: ${metadata.entry_comment}`);
  }
  if (metadata.entry_name && !metadata.entry_comment) {
    lines.push(`Entry: ${metadata.entry_name}`);
  }

  // Context settings for operations that use them
  if (metadata.context_limit !== undefined) {
    const contextType = metadata.context_type || 'percent';
    lines.push(`Context: ${metadata.context_limit} ${contextType === 'percent' ? '%' : 'msgs'}`);
  }

  return lines.join('\n');
}

function formatLorebookOperationParams(params, metadata) {
  const entryType = params.entryData?.type || metadata?.entry_type || 'entry';
  const entryName = metadata?.entry_name || metadata?.entry_comment || params.entryData?.comment || params.entryData?.name || 'Unknown';

  // Check if name already has type prefix to avoid duplication (e.g., "location-Apartment")
  if (entryName.startsWith(`${entryType}-`)) {
    return entryName;
  }

  return `${entryType}-${entryName}`;
}

function formatMessageOperationParams(params, metadata = {}) {
  if (params.index !== undefined) {
    return `Message #${params.index}`;
  }
  if (params.indexes && params.indexes.length) {
    return `Messages #${params.indexes[0]}-${params.indexes[params.indexes.length - 1]}`;
  }
  if (params.startIndex !== undefined && params.endIndex !== undefined) {
    const startIndex = metadata.start_index ?? params.startIndex;
    const originalEndIndex = metadata.original_end_index ?? metadata.end_index ?? params.endIndex;
    const currentEndIndex = metadata.current_end_index ?? originalEndIndex;
    const wasReduced = metadata.range_reduced === true;

    const rangeText = `Messages #${startIndex}-${currentEndIndex}`;
    return wasReduced ? `${rangeText} (reduced from ${originalEndIndex})` : rangeText;
  }
  return '';
}

function formatOperationParams(type, params, metadata) {
  switch (type) {
    case OperationType.VALIDATE_RECAP:
    case OperationType.DETECT_SCENE_BREAK:
    case OperationType.GENERATE_SCENE_RECAP:
    case OperationType.COMBINE_SCENE_WITH_RUNNING:
      return formatMessageOperationParams(params, metadata);

    case OperationType.GENERATE_RUNNING_RECAP:
      return 'All messages';

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

function formatDuration(ms) {
  if (ms < ONE_SECOND_MS) {
    return `${ms}ms`;
  }
  if (ms < ONE_MINUTE_MS) {
    return `${(ms / ONE_SECOND_MS).toFixed(1)}s`;
  }
  return `${(ms / ONE_MINUTE_MS).toFixed(1)}m`;
}

export function updateQueueUIVisibility() {
  if (!queueUIContainer) {
    return;
  }

  const $navbar = $(selectorsExtension.sceneNav.bar);
  const $button = $(selectorsExtension.queue.navbarToggle);

  // Always show button, navbar visibility controlled by user
  $button.show();

  // Check user's toggle preference (default to visible)
  const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
  if (navbarVisible !== 'false') {
    // Navbar visible - sync button state
    $navbar.show();
    $button.removeClass(ICON_CHEVRON_RIGHT).addClass(ICON_CHEVRON_LEFT);
    $button.attr('title', 'Hide Queue Navbar');
    // Calculate button position based on actual navbar width
    const navbarWidth = $navbar.outerWidth() || QUEUE_BUTTON_WIDTH_PX;
    $button.css('left', `${navbarWidth}px`);
  } else {
    // Navbar hidden - sync button state
    $navbar.hide();
    $button.removeClass(ICON_CHEVRON_LEFT).addClass(ICON_CHEVRON_RIGHT);
    $button.attr('title', 'Show Queue Navbar');
    $button.css('left', '0');
  }
}

function updateNavbarToggleButtonPosition() {
  const $navbar = $(selectorsExtension.sceneNav.bar);
  const $button = $(selectorsExtension.queue.navbarToggle);

  // Only update if navbar is visible and button exists
  if (!$navbar.length || !$button.length) {return;}
  if (!$navbar.is(':visible')) {return;}

  // Calculate button position based on current navbar width
  const navbarWidth = $navbar.outerWidth() || QUEUE_BUTTON_WIDTH_PX;
  $button.css('left', `${navbarWidth}px`);
}

export default {
  initQueueUI,
  updateQueueDisplay,
  updateQueueUIVisibility,
  updateNavbarToggleButtonPosition
};

// Export to window for external access
window.updateNavbarToggleButtonPosition = updateNavbarToggleButtonPosition;

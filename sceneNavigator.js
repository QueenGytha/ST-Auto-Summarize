/* global localStorage -- Browser API for persisting UI preferences */

import { get_settings, getContext, get_data, SCENE_BREAK_KEY, SCENE_BREAK_VISIBLE_KEY, selectorsExtension, selectorsSillyTavern } from './index.js';

import {
  NAVIGATION_TIME_LIMIT_SECONDS,
  NAVIGATION_DATE_THRESHOLD_MONTHS,
  LOREBOOK_ENTRY_NAME_MAX_LENGTH,
  TOAST_WARNING_DURATION_WPM,
  TOAST_SHORT_DURATION_WPM
} from './constants.js';

export function renderSceneNavigatorBar() {
  const width = get_settings('scene_recap_navigator_width') ?? NAVIGATION_TIME_LIMIT_SECONDS;
  const fontSize = get_settings('scene_recap_navigator_font_size') ?? NAVIGATION_DATE_THRESHOLD_MONTHS;

  // In headless/test environments the jQuery stub may be minimal. If required
  // DOM methods (like after) are missing, gracefully skip rendering.
  const $maybeHost = typeof $ === 'function' ? $(selectorsSillyTavern.chat.holder) : null;
  if (!$maybeHost || typeof $maybeHost.after !== 'function') {
    return; // skip in environments without full jQuery/DOM
  }

  let $bar = $(selectorsExtension.sceneNav.bar);
  // If not present or in the wrong place, move it after chat holder (main chat container)
  if (!$bar.length) {
    $bar = $('<div id="scene-recap-navigator-bar" data-testid="scene-navigator-bar"></div>');
    $(selectorsSillyTavern.chat.holder).after($bar);
  } else if (!$bar.parent().is('body')) {
    // Move to correct place if needed
    $bar.detach();
    $(selectorsSillyTavern.chat.holder).after($bar);
  }

  // Apply width setting
  $bar.css('width', `${width}px`);

  // Update navbar toggle button position after applying width
  if (window.updateNavbarToggleButtonPosition) {
    window.updateNavbarToggleButtonPosition();
  }

  const ctx = getContext();
  if (!ctx?.chat) {return;}

  // Save running recap controls and queue UI before clearing
  const $runningControls = $bar.find(selectorsExtension.runningUI.controls).detach();
  const $queueUI = $bar.find(selectorsExtension.queue.panel).detach();
  $bar.empty();

  // Restore queue UI first (should be at top)
  if ($queueUI.length) {
    $bar.append($queueUI);
  }

  // Create container for scene navigation links
  const $sceneLinksContainer = $('<div class="scene-nav-links-container" data-testid="scene-nav-links-container"></div>');

  // Find all visible scene breaks and number them sequentially
  // let sceneNum = 1; // Not currently used - using idx instead
  for (const [idx, msg] of ctx.chat.entries()) {
    if (get_data(msg, SCENE_BREAK_KEY) && get_data(msg, SCENE_BREAK_VISIBLE_KEY) !== false) {
      const name = get_data(msg, 'scene_break_name') || `#${idx}`;
      // Use the actual message index for the label
      const label = name !== `#${idx}` ? name : `#${idx}`;
      const $link = $(`<button class="scene-nav-link" title="${label}">${label}</button>`);

      // Apply font size setting
      $link.css('font-size', `${fontSize}px`);

      $link.on('click', () => {
        const $target = $(`div[mesid="${idx}"]`);
        if ($target.length) {
          const $chat = $(selectorsSillyTavern.chat.container);
          const chatOffset = $chat.offset()?.top ?? 0;
          const targetOffset = $target.offset()?.top ?? 0;
          const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - LOREBOOK_ENTRY_NAME_MAX_LENGTH;
          $chat.animate({ scrollTop }, TOAST_WARNING_DURATION_WPM);
          $target.addClass('scene-highlight');
          setTimeout(() => $target.removeClass('scene-highlight'), TOAST_SHORT_DURATION_WPM);
        }
      });
      $sceneLinksContainer.append($link); // Append to container instead of bar
      // sceneNum++; // Not currently used
    }
  }

  // Append scene links container to navbar
  $bar.append($sceneLinksContainer);

  // Restore running recap controls if they existed
  if ($runningControls.length) {
    $bar.append($runningControls);
  }

  // Always show the queue toggle button, but respect navbar visibility preference
  $(selectorsExtension.queue.navbarToggle).show();

  // Check user's navbar visibility preference (defaults to collapsed)
  const navbarVisible = localStorage.getItem('operation_queue_navbar_visible');
  if (navbarVisible === 'true') {
    $bar.show();
  } else {
    $bar.hide(); // Default to collapsed
  }

  // Update running recap controls after rendering
  if (window.updateRunningSceneRecapNavbar) {
    window.updateRunningSceneRecapNavbar();
  }
}

// Call this after chat loads or scene breaks change
export function initializeSceneNavigatorBar() {
  // Initial render
  renderSceneNavigatorBar();
}

window.renderSceneNavigatorBar = renderSceneNavigatorBar;
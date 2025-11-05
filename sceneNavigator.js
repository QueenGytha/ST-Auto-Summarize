
import { get_settings, getContext, get_data, SCENE_BREAK_KEY, SCENE_BREAK_VISIBLE_KEY } from './index.js';

export function renderSceneNavigatorBar() {
  const width = get_settings('scene_summary_navigator_width') ?? 240;
  const fontSize = get_settings('scene_summary_navigator_font_size') ?? 12;

  // In headless/test environments the jQuery stub may be minimal. If required
  // DOM methods (like after) are missing, gracefully skip rendering.
  const $maybeHost = typeof $ === 'function' ? $('#sheld') : null;
  if (!$maybeHost || typeof $maybeHost.after !== 'function') {
    return; // skip in environments without full jQuery/DOM
  }

  let $bar = $('#scene-summary-navigator-bar');
  // If not present or in the wrong place, move it after #sheld (main chat container)
  if (!$bar.length) {
    $bar = $('<div id="scene-summary-navigator-bar"></div>');
    $('#sheld').after($bar); // or $('#chat').before($bar); depending on your layout
  } else if (!$bar.parent().is('body')) {
    // Move to correct place if needed
    $bar.detach();
    $('#sheld').after($bar);
  }

  // Apply width setting
  $bar.css('width', `${width}px`);

  // Update navbar toggle button position after applying width
  if (window.updateNavbarToggleButtonPosition) {
    window.updateNavbarToggleButtonPosition();
  }

  const ctx = getContext();
  if (!ctx?.chat) return;

  // Save running summary controls and queue UI before clearing
  const $runningControls = $bar.find('.running-summary-controls').detach();
  const $queueUI = $bar.find('#shared_operation_queue_ui').detach();
  $bar.empty();

  // Restore queue UI first (should be at top)
  if ($queueUI.length) {
    $bar.append($queueUI);
  }

  // Find all visible scene breaks and number them sequentially
  // let sceneNum = 1; // Not currently used - using idx instead
  ctx.chat.forEach((msg, idx) => {
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
          const $chat = $('#chat');
          const chatOffset = $chat.offset()?.top ?? 0;
          const targetOffset = $target.offset()?.top ?? 0;
          const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - 20;
          $chat.animate({ scrollTop }, 300);
          $target.addClass('scene-highlight');
          setTimeout(() => $target.removeClass('scene-highlight'), 1200);
        }
      });
      $bar.append($link);
      // sceneNum++; // Not currently used
    }
  });

  // Restore running summary controls if they existed
  if ($runningControls.length) {
    $bar.append($runningControls);
  }

  // Always show the navbar and queue toggle button
  $bar.show();
  $('#queue_navbar_toggle').show();

  // Update running summary controls after rendering
  if (window.updateRunningSceneSummaryNavbar) {
    window.updateRunningSceneSummaryNavbar();
  }
}

// Call this after chat loads or scene breaks change
export function initializeSceneNavigatorBar() {
  // Initial render
  renderSceneNavigatorBar();
}

window.renderSceneNavigatorBar = renderSceneNavigatorBar;
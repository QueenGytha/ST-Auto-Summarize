// @flow
import { get_settings, set_settings, getContext, get_data, SCENE_BREAK_KEY, SCENE_BREAK_VISIBLE_KEY } from './index.js';

export function renderSceneNavigatorBar() {
    const show = get_settings('scene_summary_navigator_toggle');
    const width = get_settings('scene_summary_navigator_width') ?? 96;
    const fontSize = get_settings('scene_summary_navigator_font_size') ?? 12;

    // $FlowFixMe[cannot-resolve-name]
    let $bar = $('#scene-summary-navigator-bar');
    // If not present or in the wrong place, move it after #sheld (main chat container)
    if (!$bar.length) {
        // $FlowFixMe[cannot-resolve-name]
        $bar = $('<div id="scene-summary-navigator-bar"></div>');
        // $FlowFixMe[cannot-resolve-name]
        $('#sheld').after($bar); // or $('#chat').before($bar); depending on your layout
    } else if (!$bar.parent().is('body')) {
        // Move to correct place if needed
        $bar.detach();
        // $FlowFixMe[cannot-resolve-name]
        $('#sheld').after($bar);
    }

    // Apply width setting
    $bar.css('width', `${width}px`);

    // Hide/show entire navbar based on toggle setting
    if (!show) {
        $bar.hide();
        return;
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
            // $FlowFixMe[cannot-resolve-name]
            const $link = $(`<button class="scene-nav-link" title="${label}">${label}</button>`);

            // Apply font size setting
            $link.css('font-size', `${fontSize}px`);

            $link.on('click', () => {
                // $FlowFixMe[cannot-resolve-name]
                const $target = $(`div[mesid="${idx}"]`);
                if ($target.length) {
                    // $FlowFixMe[cannot-resolve-name]
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

    $bar.show();

    // Update running summary controls after rendering
    // $FlowFixMe[cannot-resolve-name]
    if (window.updateRunningSceneSummaryNavbar) {
        // $FlowFixMe[cannot-resolve-name]
        window.updateRunningSceneSummaryNavbar();
    }
}

// Call this after chat loads, scene breaks change, or toggle changes
export function initializeSceneNavigatorBar() {
    // Set the checkbox to the saved value on load
    const checked = get_settings('scene_summary_navigator_toggle');
    // $FlowFixMe[cannot-resolve-name]
    $('#scene_summary_navigator_toggle').prop('checked', !!checked);

    // Toggle handler
    // $FlowFixMe[cannot-resolve-name] [missing-this-annot]
    $('#scene_summary_navigator_toggle').off('change').on('change', function (this: any) {
        set_settings('scene_summary_navigator_toggle', this.checked);
        renderSceneNavigatorBar();
    });
    // Initial render
    renderSceneNavigatorBar();
}

// $FlowFixMe[cannot-resolve-name]
window.renderSceneNavigatorBar = renderSceneNavigatorBar;
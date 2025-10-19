import { get_settings, set_settings, getContext, get_data, SCENE_BREAK_KEY, SCENE_BREAK_VISIBLE_KEY } from './index.js';

export function renderSceneNavigatorBar() {
    const show = get_settings('scene_summary_navigator_toggle');
    const width = get_settings('scene_summary_navigator_width') ?? 96;
    const fontSize = get_settings('scene_summary_navigator_font_size') ?? 12;

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

    // Hide/show based on toggle setting and whether there are scene breaks
    if (!show) {
        // Even if hidden by toggle, keep the bar in DOM for running summary controls
        // But hide the scene break navigation links
        $bar.find('.scene-nav-link').hide();
        // If there are running summary controls, keep bar visible for those
        const hasRunningControls = $bar.find('.running-summary-controls').length > 0;
        if (!hasRunningControls) {
            $bar.hide();
        }
        return;
    }
    const ctx = getContext();
    if (!ctx?.chat) return;

    // Save running summary controls before clearing
    const $runningControls = $bar.find('.running-summary-controls').detach();
    $bar.empty();

    // Find all visible scene breaks and number them sequentially
    let sceneNum = 1;
    ctx.chat.forEach((msg, idx) => {
        if (get_data(msg, SCENE_BREAK_KEY) && get_data(msg, SCENE_BREAK_VISIBLE_KEY) !== false) {
            const name = get_data(msg, 'scene_break_name') || `#${idx}`;
            // Use the actual message index for the label, or use sceneNum for sequential scene numbers
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
            sceneNum++;
        }
    });

    // Restore running summary controls if they existed
    if ($runningControls.length) {
        $bar.append($runningControls);
    }

    $bar.show();

    // Update running summary controls after rendering
    if (window.updateRunningSceneSummaryNavbar) {
        window.updateRunningSceneSummaryNavbar();
    }
}

// Call this after chat loads, scene breaks change, or toggle changes
export function initializeSceneNavigatorBar() {
    // Set the checkbox to the saved value on load
    const checked = get_settings('scene_summary_navigator_toggle');
    $('#scene_summary_navigator_toggle').prop('checked', !!checked);

    // Toggle handler
    $('#scene_summary_navigator_toggle').off('change').on('change', function() {
        set_settings('scene_summary_navigator_toggle', this.checked);
        renderSceneNavigatorBar();
    });
    // Initial render
    renderSceneNavigatorBar();
}

window.renderSceneNavigatorBar = renderSceneNavigatorBar;
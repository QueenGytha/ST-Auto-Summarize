import { get_settings, set_settings, getContext, get_data, SCENE_BREAK_KEY, SCENE_BREAK_VISIBLE_KEY } from './index.js';

export function renderSceneNavigatorBar() {
    const show = get_settings('scene_summary_navigator_toggle');
    let $bar = $('#scene-summary-navigator-bar');
    // If not present or in the wrong place, move it after #sheld (main chat container)
    if (!$bar.length) {
        $bar = $('<div id="scene-summary-navigator-bar" style="display:none;"></div>');
        $('#sheld').after($bar); // or $('#chat').before($bar); depending on your layout
    } else if (!$bar.parent().is('body')) {
        // Move to correct place if needed
        $bar.detach();
        $('#sheld').after($bar);
    }
    if (!show) {
        $bar.hide();
        return;
    }
    const ctx = getContext();
    if (!ctx?.chat) return;
    $bar.empty();

    // Find all visible scene breaks and number them sequentially
    let sceneNum = 1;
    ctx.chat.forEach((msg, idx) => {
        if (get_data(msg, SCENE_BREAK_KEY) && get_data(msg, SCENE_BREAK_VISIBLE_KEY) !== false) {
            const name = get_data(msg, 'scene_break_name') || `#${idx}`;
            // Use the actual message index for the label, or use sceneNum for sequential scene numbers
            const label = name !== `#${idx}` ? name : `#${idx}`;
            const $link = $(`<button class="scene-nav-link" title="${label}">${label}</button>`);
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
    $bar.show();
}

// Call this after chat loads, scene breaks change, or toggle changes
export function initializeSceneNavigatorBar() {
    // Toggle handler
    $('#scene_summary_navigator_toggle').on('change', function() {
        set_settings('scene_summary_navigator_toggle', this.checked);
        renderSceneNavigatorBar();
    });
    // Initial render
    renderSceneNavigatorBar();
}
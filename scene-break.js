export const SCENE_BREAK_KEY = 'scene_break';
export const SCENE_BREAK_VISIBLE_KEY = 'scene_break_visible';
export const SCENE_BREAK_NAME_KEY = 'scene_break_name';
export const SCENE_BREAK_SUMMARY_KEY = 'scene_break_summary';
export const SCENE_BREAK_BUTTON_CLASS = 'auto_summarize_scene_break_button';
export const SCENE_BREAK_DIV_CLASS = 'auto_summarize_scene_break_div';

// Adds the scene break button to the message template
export function addSceneBreakButton() {
    const html = `
<div title="Mark end of scene" class="mes_button ${SCENE_BREAK_BUTTON_CLASS} fa-solid fa-clapperboard" tabindex="0"></div>
`;
    $("#message_template .mes_buttons .extraMesButtons").prepend(html);
}

// Handles click events for the scene break button
export function bindSceneBreakButton(get_message_div, getContext, set_data, get_data, saveChatDebounced) {
    $("div#chat").on("click", `.${SCENE_BREAK_BUTTON_CLASS}`, function () {
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        toggleSceneBreak(message_id, get_message_div, getContext, set_data, get_data, saveChatDebounced);
    });
}

// Toggles the scene break UI and persists state
export function toggleSceneBreak(index, get_message_div, getContext, set_data, get_data, saveChatDebounced) {
    const ctx = getContext();
    const message = ctx.chat[index];
    let isSet = !!get_data(message, SCENE_BREAK_KEY);
    let visible = get_data(message, SCENE_BREAK_VISIBLE_KEY);

    if (!isSet) {
        set_data(message, SCENE_BREAK_KEY, true);
        set_data(message, SCENE_BREAK_VISIBLE_KEY, true);
        renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
        saveChatDebounced();
    } else {
        set_data(message, SCENE_BREAK_VISIBLE_KEY, !visible);
        renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
        saveChatDebounced();
    }
}

// Renders or hides the scene break UI below the message
export function renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced) {
    const $msgDiv = get_message_div(index);
    if (!$msgDiv?.length) return;

    // Remove any existing scene break
    $msgDiv.find(`.${SCENE_BREAK_DIV_CLASS}`).remove();

    const ctx = getContext();
    const chat = ctx.chat;
    const message = chat[index];
    const isSet = !!get_data(message, SCENE_BREAK_KEY);
    const visible = get_data(message, SCENE_BREAK_VISIBLE_KEY);
    const isVisible = (visible === undefined) ? true : visible;

    if (!isSet) return;

    // Get persisted values
    const sceneName = get_data(message, SCENE_BREAK_NAME_KEY) || '';
    const sceneSummary = get_data(message, SCENE_BREAK_SUMMARY_KEY) || '';

    // --- Find the start of the scene (previous VISIBLE scene break or 0) ---
    let startIdx = 0;
    for (let i = index - 1; i >= 0; i--) {
        if (
            get_data(chat[i], SCENE_BREAK_KEY) &&
            (get_data(chat[i], SCENE_BREAK_VISIBLE_KEY) === undefined || get_data(chat[i], SCENE_BREAK_VISIBLE_KEY))
        ) {
            startIdx = i + 1;
            break;
        }
    }
    // Message numbers in this scene
    const sceneMessages = [];
    for (let i = startIdx; i <= index; i++) {
        sceneMessages.push(i);
    }

    // --- Hyperlink to the start message ---
    const sceneStartLink = `<a href="javascript:void(0);" class="scene-start-link" data-mesid="${startIdx}">#${startIdx}</a>`;

    // Determine visible/hidden class for styling
    const stateClass = isVisible ? "scene-break-visible" : "scene-break-hidden";
    const borderClass = isVisible ? "auto_summarize_scene_break_border" : "";

    // Use the same classes as summary boxes for consistent placement and style
    // Wrap the summary content in a container for easy hiding
    const $sceneBreak = $(`
        <div class="${SCENE_BREAK_DIV_CLASS} ${stateClass} ${borderClass}" style="margin:0 0 5px 0;" tabindex="0">
            <div class="scene-break-content">
                <input type="text" class="scene-break-name auto_summarize_memory_text" placeholder="Scene name..." value="${sceneName.replace(/"/g, '&quot;')}" />
                <div style="font-size:0.95em; color:inherit; margin-bottom:0.5em;">
                    Scene: ${sceneStartLink} &rarr; #${index} (${sceneMessages.length} messages)
                </div>
                <textarea class="scene-summary-box auto_summarize_memory_text" placeholder="Scene summary...">${sceneSummary}</textarea>
            </div>
        </div>
    `);

    // === Insert after the summary box, or after .mes_text if no summary box exists ===
    let $summaryBox = $msgDiv.find('.auto_summarize_memory_text');
    if ($summaryBox.length) {
        $summaryBox.last().after($sceneBreak);
    } else {
        let $mesText = $msgDiv.find('.mes_text');
        if ($mesText.length) {
            $mesText.after($sceneBreak);
        } else {
            $msgDiv.append($sceneBreak);
        }
    }

    // --- Editable handlers ---
    $sceneBreak.find('.scene-break-name').on('change blur', function () {
        set_data(message, SCENE_BREAK_NAME_KEY, $(this).val());
        saveChatDebounced();
    });
    $sceneBreak.find('.scene-summary-box').on('change blur', function () {
        set_data(message, SCENE_BREAK_SUMMARY_KEY, $(this).val());
        saveChatDebounced();
    });

    // --- Hyperlink handler ---
    $sceneBreak.find('.scene-start-link').on('click', function () {
        const mesid = $(this).data('mesid');
        let $target = $(`div[mesid="${mesid}"]`);
        if ($target.length) {
            // Scroll the #chat container so the target is near the top
            const $chat = $('#chat');
            const chatOffset = $chat.offset()?.top ?? 0;
            const targetOffset = $target.offset()?.top ?? 0;
            const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - 20; // 20px padding
            $chat.animate({ scrollTop }, 300);

            $target.addClass('scene-highlight');
            setTimeout(() => $target.removeClass('scene-highlight'), 1200);
        } else {
            // fallback: scroll to top to try to load more messages
            const $chat = $('#chat');
            $chat.scrollTop(0);
            setTimeout(() => {
                $target = $(`div[mesid="${mesid}"]`);
                if ($target.length) {
                    const chatOffset = $chat.offset()?.top ?? 0;
                    const targetOffset = $target.offset()?.top ?? 0;
                    const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - 20;
                    $chat.animate({ scrollTop }, 300);

                    $target.addClass('scene-highlight');
                    setTimeout(() => $target.removeClass('scene-highlight'), 1200);
                }
            }, 500);
        }
    });

    // --- Selection handlers for visual feedback ---
    $sceneBreak.on('mousedown', function (e) {
        $('.' + SCENE_BREAK_DIV_CLASS).removeClass('scene-break-selected');
        $(this).addClass('scene-break-selected');
    });
    // Remove selection when clicking outside any scene break
    $(document).off('mousedown.sceneBreakDeselect').on('mousedown.sceneBreakDeselect', function (e) {
        if (!$(e.target).closest('.' + SCENE_BREAK_DIV_CLASS).length) {
            $('.' + SCENE_BREAK_DIV_CLASS).removeClass('scene-break-selected');
        }
    });
    // Also add focus/blur for keyboard navigation
    $sceneBreak.on('focusin', function () {
        $('.' + SCENE_BREAK_DIV_CLASS).removeClass('scene-break-selected');
        $(this).addClass('scene-break-selected');
    });
    $sceneBreak.on('focusout', function () {
        $(this).removeClass('scene-break-selected');
    });
}

// Call this after chat loads or refresh to re-render all scene breaks
export function renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced) {
    const ctx = getContext();
    if (!ctx?.chat) return;
    for (let i = 0; i < ctx.chat.length; i++) {
        const message = ctx.chat[i];
        if (get_data(message, SCENE_BREAK_KEY)) {
            // Ensure visible is set to true if undefined (for backward compatibility)
            if (get_data(message, SCENE_BREAK_VISIBLE_KEY) === undefined) {
                set_data(message, SCENE_BREAK_VISIBLE_KEY, true);
            }
        }
    }
    // Now render after all flags are set
    for (let i = 0; i < ctx.chat.length; i++) {
        const message = ctx.chat[i];
        if (get_data(message, SCENE_BREAK_KEY)) {
            renderSceneBreak(i, get_message_div, getContext, get_data, set_data, saveChatDebounced);
        }
    }
}
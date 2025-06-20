import {
    get_settings,
    get_memory,
    summarize_text,
} from './index.js';

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
    } else {
        set_data(message, SCENE_BREAK_VISIBLE_KEY, !visible);
    }
    renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
    saveChatDebounced();

    // Re-run auto-hide logic after toggling scene break
    import('./autoHide.js').then(mod => {
        mod.auto_hide_messages_by_command();
    });

    // Update navigator bar if present
    if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
}

// --- Helper functions for versioned scene summaries ---
function getSceneSummaryVersions(message, get_data) {
    // Returns the array of summary versions, or an empty array if none
    return get_data(message, 'scene_summary_versions') || [];
}

function setSceneSummaryVersions(message, set_data, versions) {
    set_data(message, 'scene_summary_versions', versions);
}

function getCurrentSceneSummaryIndex(message, get_data) {
    return get_data(message, 'scene_summary_current_index') ?? 0;
}

function setCurrentSceneSummaryIndex(message, set_data, idx) {
    set_data(message, 'scene_summary_current_index', idx);
}

// Helper to collect scene content as a chronological array of objects with type
function collectSceneChronologicalObjects(startIdx, endIdx, ctx, get_memory) {
    const chat = ctx.chat;
    const result = [];
    for (let i = startIdx; i <= endIdx; i++) {
        const msg = chat[i];
        const summary = get_memory(msg);
        if (msg.mes && msg.mes.trim() !== "") {
            result.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
        }
        if (summary) {
            result.push({ type: "summary", index: i, summary });
        }
    }
    return result;
}

function getSceneRangeIndexes(index, chat, get_data, sceneCount) {
    // Find all visible scene breaks up to and including index
    let sceneBreakIndexes = [];
    for (let i = 0; i <= index; i++) {
        if (
            get_data(chat[i], SCENE_BREAK_KEY) &&
            (get_data(chat[i], SCENE_BREAK_VISIBLE_KEY) === undefined || get_data(chat[i], SCENE_BREAK_VISIBLE_KEY))
        ) {
            sceneBreakIndexes.push(i);
        }
    }
    // We want to start after the (sceneBreakIndexes.length - sceneCount - 1)th break (the (sceneCount-1)th before the current one)
    // For count=1, this is after the last break before the current one (or 0 if none)
    let startIdx = 0;
    if (sceneBreakIndexes.length >= sceneCount + 1) {
        // There are enough breaks to go back sceneCount scenes
        let idx = sceneBreakIndexes.length - sceneCount - 1;
        startIdx = sceneBreakIndexes[idx] + 1;
    }
    let endIdx = index;
    return [startIdx, endIdx];
}

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

    // --- Versioned summaries logic ---
    let versions = getSceneSummaryVersions(message, get_data);
    let currentIdx = getCurrentSceneSummaryIndex(message, get_data);

    // If no versions exist, initialize with current summary (for backward compatibility)
    if (versions.length === 0) {
        const initialSummary = get_data(message, SCENE_BREAK_SUMMARY_KEY) || '';
        versions = [initialSummary];
        setSceneSummaryVersions(message, set_data, versions);
        setCurrentSceneSummaryIndex(message, set_data, 0);
        set_data(message, 'scene_summary_memory', initialSummary); // <-- ensure top-level property is set
        saveChatDebounced();
    }

    // Clamp currentIdx to valid range
    if (currentIdx < 0) currentIdx = 0;
    if (currentIdx >= versions.length) currentIdx = versions.length - 1;

    // Use the current version for display
    const sceneName = get_data(message, SCENE_BREAK_NAME_KEY) || '';
    const sceneSummary = versions[currentIdx] || '';

    // --- Find the start of this scene ---
    // The end is always the current message (index).
    // The start is the first message after the previous visible scene break, or 0 if none.
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

    // Collect all message indices in this scene
    const sceneMessages = [];
    for (let i = startIdx; i <= index; i++) {
        sceneMessages.push(i);
    }

    // --- Hyperlink to the start message ---
    const sceneStartLink = `<a href="javascript:void(0);" class="scene-start-link" data-mesid="${startIdx}">#${startIdx}</a>`;

    // Add preview icon (eye) for scene content preview
    const previewIcon = `<i class="fa-solid fa-eye scene-preview-summary" title="Preview scene content" style="cursor:pointer; margin-left:0.5em;"></i>`;

    // Determine visible/hidden class for styling
    const stateClass = isVisible ? "sceneBreak-visible" : "sceneBreak-hidden";
    const borderClass = isVisible ? "auto_summarize_scene_break_border" : "";

    // Use the same classes as summary boxes for consistent placement and style
    // Wrap the summary content in a container for easy hiding
    const isIncluded = get_data(message, 'scene_summary_include') !== false; // default to included

    const $sceneBreak = $(`
    <div class="${SCENE_BREAK_DIV_CLASS} ${stateClass} ${borderClass}" style="margin:0 0 5px 0;" tabindex="0">
        <div class="sceneBreak-content">
            <input type="text" class="sceneBreak-name auto_summarize_memory_text" placeholder="Scene name..." value="${sceneName.replace(/"/g, '&quot;')}" />
            <div style="font-size:0.95em; color:inherit; margin-bottom:0.5em;">
                Scene: ${sceneStartLink} &rarr; #${index} (${sceneMessages.length} messages)${previewIcon}
            </div>
            <textarea class="scene-summary-box auto_summarize_memory_text" placeholder="Scene summary...">${sceneSummary}</textarea>
            <div class="scene-summary-actions" style="margin-top:0.5em; display:flex; gap:0.5em;">
                <button class="scene-rollback-summary menu_button" title="Go to previous summary"><i class="fa-solid fa-rotate-left"></i> Previous Summary</button>
                <button class="scene-generate-summary menu_button" title="Generate summary for this scene"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate</button>
                <button class="scene-rollforward-summary menu_button" title="Go to next summary"><i class="fa-solid fa-rotate-right"></i> Next Summary</button>
                <span style="align-self:center; font-size:0.9em; color:inherit; margin-left:0.5em;">${versions.length > 1 ? `[${currentIdx + 1}/${versions.length}]` : ''}</span>
            </div>
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
    $sceneBreak.find('.sceneBreak-name').on('change blur', function () {
        set_data(message, SCENE_BREAK_NAME_KEY, $(this).val());
        saveChatDebounced();
        // Update navigator bar if present
        if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
    });
    $sceneBreak.find('.scene-summary-box').on('change blur', function () {
        // Update the current version in the versions array
        let updatedVersions = getSceneSummaryVersions(message, get_data).slice();
        let idx = getCurrentSceneSummaryIndex(message, get_data);
        updatedVersions[idx] = $(this).val();
        setSceneSummaryVersions(message, set_data, updatedVersions);
        // Also update the legacy summary field for compatibility
        set_data(message, SCENE_BREAK_SUMMARY_KEY, $(this).val());
        set_data(message, 'scene_summary_memory', $(this).val()); // <-- ensure top-level property is set
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

    // --- Preview scene content handler ---
    $sceneBreak.find('.scene-preview-summary').off('click').on('click', function(e) {
        e.stopPropagation();
        let sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
        let [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
        let ctx = getContext();

        let mode = get_settings('scene_summary_history_mode') || "both";
        let sceneObjects = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const msg = chat[i];
            if ((mode === "messages" || mode === "both") && msg.mes && msg.mes.trim() !== "") {
                sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
            }
            if ((mode === "summaries" || mode === "both") && get_memory(msg)) {
                sceneObjects.push({ type: "summary", index: i, summary: get_memory(msg) });
            }
        }

        const pretty = JSON.stringify(sceneObjects, null, 2);
        const html = `<div>
            <h3>Scene Content Preview</h3>
            <pre style="max-height:400px;overflow-y:auto;white-space:pre-wrap;background:#222;color:#fff;padding:1em;border-radius:4px;">${pretty}</pre>
        </div>`;
        if (ctx.callPopup) {
            ctx.callPopup(html, 'text', undefined, {
                okButton: "Close",
                wide: true,
                large: true
            });
        } else {
            alert(pretty);
        }
    });

    // --- Button handlers (prevent event bubbling to avoid toggling scene break) ---
    $sceneBreak.find('.scene-generate-summary').off('click').on('click', async function(e) {
        e.stopPropagation();
        console.log("[SceneBreak] Generate button clicked for scene at index", index);

        let sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
        let [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
        let ctx = getContext();

        // Collect scene objects (messages/summaries) as before
        let mode = get_settings('scene_summary_history_mode') || "both";
        let sceneObjects = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const msg = chat[i];
            if ((mode === "messages" || mode === "both") && msg.mes && msg.mes.trim() !== "") {
                sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
            }
            if ((mode === "summaries" || mode === "both") && get_memory(msg)) {
                sceneObjects.push({ type: "summary", index: i, summary: get_memory(msg) });
            }
        }

        // 1. Get prompt and connection profile for scene summaries
        let promptTemplate = get_settings('scene_summary_prompt');
        let prefill = get_settings('scene_summary_prefill') || "";
        let profile = get_settings('scene_summary_connection_profile');
        let preset = get_settings('scene_summary_completion_preset');
        let current_profile = await ctx.get_current_connection_profile?.();
        let current_preset = await ctx.get_current_preset?.();

        // 2. Prepare prompt (substitute macros)
        let prompt = promptTemplate;
        if (ctx.substituteParamsExtended) {
            prompt = ctx.substituteParamsExtended(prompt, {
                message: JSON.stringify(sceneObjects, null, 2),
                prefill
            }) || prompt;
        }
        prompt = prompt.replace(/\{\{message\}\}/g, JSON.stringify(sceneObjects, null, 2));
        prompt = `${prompt}\n${prefill}`;

        // 3. Switch to scene summary profile/preset if set
        if (profile) {
            console.log("[SceneBreak] Switching to connection profile:", profile);
            await ctx.set_connection_profile?.(profile);
        }
        if (preset) {
            console.log("[SceneBreak] Switching to preset:", preset);
            await ctx.set_preset?.(preset);
        }

        // 4. Show loading state in summary box
        let $summaryBox = $sceneBreak.find('.scene-summary-box');
        $summaryBox.val("Generating scene summary...");

        // 5. Generate summary using the same logic as summarize_text
        let summary = "";
        try {
            // Block input if setting is enabled
            if (get_settings('block_chat')) {
                ctx.deactivateSendButtons();
            }
            console.log("[SceneBreak] Sending prompt to AI:", prompt);
            summary = await summarize_text(prompt);
            console.log("[SceneBreak] AI response:", summary);
        } catch (err) {
            summary = "Error generating summary: " + (err?.message || err);
            console.error("[SceneBreak] Error generating summary:", err);
        } finally {
            // Re-enable input if it was blocked
            if (get_settings('block_chat')) {
                ctx.activateSendButtons();
            }
        }

        // 6. Restore previous profile/preset
        if (profile) {
            console.log("[SceneBreak] Restoring previous connection profile:", current_profile);
            await ctx.set_connection_profile?.(current_profile);
        }
        if (preset) {
            console.log("[SceneBreak] Restoring previous preset:", current_preset);
            await ctx.set_preset?.(current_preset);
        }

        // 7. Save and display the summary in the box
        let updatedVersions = getSceneSummaryVersions(message, get_data).slice();
        updatedVersions.push(summary);
        setSceneSummaryVersions(message, set_data, updatedVersions);
        setCurrentSceneSummaryIndex(message, set_data, updatedVersions.length - 1);
        set_data(message, SCENE_BREAK_SUMMARY_KEY, summary); // update legacy field
        set_data(message, 'scene_summary_memory', summary); // <-- ensure top-level property is set
        saveChatDebounced();
        renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
    });

    $sceneBreak.find('.scene-rollback-summary').off('click').on('click', function(e) {
        e.stopPropagation();
        let idx = getCurrentSceneSummaryIndex(message, get_data);
        if (idx > 0) {
            setCurrentSceneSummaryIndex(message, set_data, idx - 1);
            let summary = getSceneSummaryVersions(message, get_data)[idx - 1];
            set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
            set_data(message, 'scene_summary_memory', summary); // <-- ensure top-level property is set
            saveChatDebounced();
            renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
        }
    });
    $sceneBreak.find('.scene-rollforward-summary').off('click').on('click', function(e) {
        e.stopPropagation();
        let versions = getSceneSummaryVersions(message, get_data);
        let idx = getCurrentSceneSummaryIndex(message, get_data);
        if (idx < versions.length - 1) {
            setCurrentSceneSummaryIndex(message, set_data, idx + 1);
            let summary = versions[idx + 1];
            set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
            set_data(message, 'scene_summary_memory', summary); // <-- ensure top-level property is set
            saveChatDebounced();
            renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
        }
    });

    // --- Selection handlers for visual feedback ---
    $sceneBreak.on('mousedown', function (e) {
        $('.' + SCENE_BREAK_DIV_CLASS).removeClass('sceneBreak-selected');
        $(this).addClass('sceneBreak-selected');
    });
    // Remove selection when clicking outside any scene break
    $(document).off('mousedown.sceneBreakDeselect').on('mousedown.sceneBreakDeselect', function (e) {
        if (!$(e.target).closest('.' + SCENE_BREAK_DIV_CLASS).length) {
            $('.' + SCENE_BREAK_DIV_CLASS).removeClass('sceneBreak-selected');
        }
    });
    // Also add focus/blur for keyboard navigation
    $sceneBreak.on('focusin', function () {
        $('.' + SCENE_BREAK_DIV_CLASS).removeClass('sceneBreak-selected');
        $(this).addClass('sceneBreak-selected');
    });
    $sceneBreak.on('focusout', function () {
        $(this).removeClass('sceneBreak-selected');
    });
}

/**
 * Collects all messages and/or summaries for a scene, regardless of exclusion/hidden status.
 * @param {number} startIdx - Start index of the scene (inclusive)
 * @param {number} endIdx - End index of the scene (inclusive)
 * @param {string} mode - "messages", "summaries", or "both"
 * @param {object} ctx - Context object
 * @returns {string} - Concatenated scene content
 */
export function collectSceneContent(startIdx, endIdx, mode, ctx, get_memory) {
    let chat = ctx.chat;
    let result = [];
    for (let i = startIdx; i <= endIdx; i++) {
        let msg = chat[i];
        if (mode === "messages" || mode === "both") {
            result.push(msg.mes);
        }
        if ((mode === "summaries" || mode === "both") && get_memory(msg)) {
            result.push(get_memory(msg));
        }
    }
    return result.join('\n');
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
    // Update navigator bar if present
    if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
}

function collect_scene_summary_indexes() {
    const ctx = getContext();
    const chat = ctx.chat;
    let indexes = [];
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg) continue;
        if (get_data(msg, 'scene_break_visible') === false) continue;
        const summary = get_data(msg, 'scene_summary_memory');
        if (summary && summary.trim()) {
            indexes.push(i);
        }
    }
    debug(`[SCENE SUMMARY] Final collected indexes: ${JSON.stringify(indexes)}`);
    return indexes;
}
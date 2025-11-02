// @flow
/*:: import type { STContext } from '../../../../scripts/st-context.js'; */

import {
    get_settings,
    get_memory,
    summarize_text,
    refresh_memory,
    renderSceneNavigatorBar,
    log,
    debug,
    error,
    toast,
    SUBSYSTEM,
    extension_settings,
    get_connection_profile_api,
    getPresetManager,
    set_connection_profile,
    get_current_connection_profile,
} from './index.js';
import {
    auto_generate_running_summary,
} from './runningSceneSummary.js';
import {
    queueCombineSceneWithRunning,
    queueProcessLorebookEntry,
} from './queueIntegration.js';
import { clearCheckedFlagsInRange } from './autoSceneBreakDetection.js';
import { getConfiguredEntityTypeDefinitions, formatEntityTypeListForPrompt } from './entityTypes.js';

// SCENE SUMMARY PROPERTY STRUCTURE:
// - Scene summaries are stored on the message object as:
//     - 'scene_summary_memory': the current scene summary text (not at the root like 'memory')
//     - 'scene_summary_versions': array of all versions of the scene summary
//     - 'scene_summary_current_index': index of the current version
//     - 'scene_break_visible': whether the scene break is visible
//     - 'scene_summary_include': whether to include this scene summary in injections
// - Do NOT expect scene summaries to be stored in the root 'memory' property.

export const SCENE_BREAK_KEY = 'scene_break';
export const SCENE_BREAK_VISIBLE_KEY = 'scene_break_visible';
export const SCENE_BREAK_NAME_KEY = 'scene_break_name';
export const SCENE_BREAK_SUMMARY_KEY = 'scene_break_summary';
export const SCENE_SUMMARY_MEMORY_KEY = 'scene_summary_memory';
export const SCENE_SUMMARY_HASH_KEY = 'scene_summary_hash';
export const SCENE_BREAK_COLLAPSED_KEY = 'scene_break_collapsed';
export const SCENE_BREAK_BUTTON_CLASS = 'auto_summarize_scene_break_button';
export const SCENE_BREAK_DIV_CLASS = 'auto_summarize_scene_break_div';
const SCENE_BREAK_SELECTED_CLASS = 'sceneBreak-selected';

// Simple deterministic hash to detect when summary content changes
function computeSummaryHash(summaryText /*: string */) /*: string */ {
    const text = (summaryText || '').trim();
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + charCode;
        hash |= 0; // force 32-bit int
    }
    return Math.abs(hash).toString(36);
}

// Adds the scene break button to the message template
export function addSceneBreakButton() {
    const html = `
<div title="Mark end of scene" class="mes_button ${SCENE_BREAK_BUTTON_CLASS} fa-solid fa-clapperboard" tabindex="0"></div>
`;
    // $FlowFixMe[cannot-resolve-name]
    $("#message_template .mes_buttons .extraMesButtons").prepend(html);
}

// Handles click events for the scene break button
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export function bindSceneBreakButton(
    get_message_div /*: (index: number) => any */,  // Returns jQuery object - any is appropriate
    getContext /*: () => STContext */,
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    saveChatDebounced /*: () => void */
) /*: void */ {
    // $FlowFixMe[cannot-resolve-name]
    // $FlowFixMe[missing-this-annot]
    $("div#chat").on("click", `.${SCENE_BREAK_BUTTON_CLASS}`, function () {
        // $FlowFixMe[cannot-resolve-name]
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        toggleSceneBreak(message_id, get_message_div, getContext, set_data, get_data, saveChatDebounced);
    });
}

// Toggles the scene break UI and persists state
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export function toggleSceneBreak(
    index /*: number */,
    get_message_div /*: (index: number) => any */,  // Returns jQuery object - any is appropriate
    getContext /*: () => STContext */,
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    saveChatDebounced /*: () => void */
) /*: void */ {
    const ctx = getContext();
    const message = ctx.chat[index];
    const isSet = !!get_data(message, SCENE_BREAK_KEY);
    const visible = get_data(message, SCENE_BREAK_VISIBLE_KEY);

    if (!isSet) {
        set_data(message, SCENE_BREAK_KEY, true);
        set_data(message, SCENE_BREAK_VISIBLE_KEY, true);
    } else {
        set_data(message, SCENE_BREAK_VISIBLE_KEY, !visible);
        // $FlowFixMe[constant-condition]
        if (isSet && visible && !get_data(message, SCENE_BREAK_VISIBLE_KEY)) {
            // Scene break was visible, now hidden - clear checked flags
            const chat = ctx.chat;

            // Find the next visible scene break
            let nextSceneBreakIndex = chat.length;
            for (let i = index + 1; i < chat.length; i++) {
                const isSceneBreak = get_data(chat[i], SCENE_BREAK_KEY);
                const isVisible = get_data(chat[i], SCENE_BREAK_VISIBLE_KEY);
                if (isSceneBreak && isVisible) {
                    nextSceneBreakIndex = i;
                    break;
                }
            }

            // Clear checked flags from hidden scene to next visible scene
            const clearedCount = clearCheckedFlagsInRange(index, nextSceneBreakIndex);
            if (clearedCount > 0) {
                debug(SUBSYSTEM.SCENE, `Scene break at ${index} hidden - cleared ${clearedCount} checked flags (range ${index}-${nextSceneBreakIndex - 1})`);
            }
        }
    }
    renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
    saveChatDebounced();

    // Re-run auto-hide logic after toggling scene break
    import('./autoHide.js').then(mod => {
        mod.auto_hide_messages_by_command();
    });

    // Update navigator bar if present
    // $FlowFixMe[cannot-resolve-name]
    if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
}

// --- Helper functions for versioned scene summaries ---
// Scene summary properties are not at the root; see file header for structure.
// $FlowFixMe[missing-local-annot] - Return type is inferred correctly
function getSceneSummaryVersions(
    message /*: STMessage */,
    get_data /*: (message: STMessage, key: string) => any */  // Returns any type - legitimate
) /*: Array<string> */ {
    // Returns the array of summary versions, or an empty array if none
    return get_data(message, 'scene_summary_versions') || [];
}

// Scene summary properties are not at the root; see file header for structure.
// $FlowFixMe[missing-local-annot] - Function signature is correct
function setSceneSummaryVersions(
    message /*: STMessage */,
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    versions /*: Array<string> */
) /*: void */ {
    set_data(message, 'scene_summary_versions', versions);
}

// Scene summary properties are not at the root; see file header for structure.
// $FlowFixMe[missing-local-annot] - Return type is inferred correctly
function getCurrentSceneSummaryIndex(
    message /*: STMessage */,
    get_data /*: (message: STMessage, key: string) => any */  // Returns any type - legitimate
) /*: number */ {
    return get_data(message, 'scene_summary_current_index') ?? 0;
}

// Scene summary properties are not at the root; see file header for structure.
// $FlowFixMe[missing-local-annot] - Function signature is correct
function setCurrentSceneSummaryIndex(
    message /*: STMessage */,
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    idx /*: number */
) /*: void */ {
    set_data(message, 'scene_summary_current_index', idx);
}

// $FlowFixMe[missing-local-annot] - Function signature is correct
function getSceneRangeIndexes(
    index /*: number */,
    chat /*: Array<STMessage> */,
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    sceneCount /*: number */
) /*: [number, number] */ {
    // Find all visible scene breaks up to and including index
    const sceneBreakIndexes = [];
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
        const idx = sceneBreakIndexes.length - sceneCount - 1;
        startIdx = sceneBreakIndexes[idx] + 1;
    }
    const endIdx = index;
    return [startIdx, endIdx];
}

// Helper: Handle generate summary button click
// $FlowFixMe[missing-local-annot] - Function signature is correct
async function handleGenerateSummaryButtonClick(
    index /*: number */,
    chat /*: Array<STMessage> */,
    message /*: STMessage */,
    $sceneBreak /*: any */,  // jQuery object - any is appropriate
    get_message_div /*: (index: number) => any */,  // Returns jQuery object - any is appropriate
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    saveChatDebounced /*: () => void */
) /*: Promise<void> */ {
    log(SUBSYSTEM.SCENE, "Generate button clicked for scene at index", index);

    // Use the queue-enabled generateSceneSummary function
    // $FlowFixMe[cannot-resolve-name]
    await generateSceneSummary(index, get_message_div, getContext, get_data, set_data, saveChatDebounced, false);
}

// Helper: Initialize versioned summaries for backward compatibility
// $FlowFixMe[missing-local-annot] - Function signature is correct
function initializeSceneSummaryVersions(
    message /*: STMessage */,
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    saveChatDebounced /*: () => void */
) /*: {versions: Array<string>, currentIdx: number} */ {
    let versions = getSceneSummaryVersions(message, get_data);
    let currentIdx = getCurrentSceneSummaryIndex(message, get_data);

    if (versions.length === 0) {
        const initialSummary = get_data(message, SCENE_BREAK_SUMMARY_KEY) || '';
        versions = [initialSummary];
        setSceneSummaryVersions(message, set_data, versions);
        setCurrentSceneSummaryIndex(message, set_data, 0);
        set_data(message, SCENE_SUMMARY_MEMORY_KEY, initialSummary);
        set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(initialSummary));
        saveChatDebounced();
    }

    // Clamp currentIdx to valid range
    if (currentIdx < 0) currentIdx = 0;
    if (currentIdx >= versions.length) currentIdx = versions.length - 1;

    return { versions, currentIdx };
}

// Helper: Find scene boundaries
// $FlowFixMe[missing-local-annot] - Function signature is correct
function findSceneBoundaries(
    chat /*: Array<STMessage> */,
    index /*: number */,
    get_data /*: (message: STMessage, key: string) => any */  // Returns any type - legitimate
) /*: {startIdx: number, sceneMessages: Array<number>} */ {
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

    const sceneMessages = [];
    for (let i = startIdx; i <= index; i++) {
        sceneMessages.push(i);
    }

    return { startIdx, sceneMessages };
}

// Helper: Build scene break HTML element
// $FlowFixMe[missing-local-annot] - Function signature is correct
function buildSceneBreakElement(
    index /*: number */,
    startIdx /*: number */,
    sceneMessages /*: Array<number> */,
    sceneName /*: string */,
    sceneSummary /*: string */,
    isVisible /*: boolean */,
    isCollapsed /*: boolean */,
    versions /*: Array<string> */,
    currentIdx /*: number */
) /*: any */ {  // Returns jQuery object - any is appropriate
    const sceneStartLink = `<a href="javascript:void(0);" class="scene-start-link" data-mesid="${startIdx}">#${startIdx}</a>`;
    const previewIcon = `<i class="fa-solid fa-eye scene-preview-summary" title="Preview scene content" style="cursor:pointer; margin-left:0.5em;"></i>`;

    const stateClass = isVisible ? "sceneBreak-visible" : "sceneBreak-hidden";
    const borderClass = isVisible ? "auto_summarize_scene_break_border" : "";
    const collapsedClass = isCollapsed ? "sceneBreak-collapsed" : "";
    const collapseIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
    const collapseTitle = isCollapsed ? 'Expand scene summary' : 'Collapse scene summary';

    // $FlowFixMe[cannot-resolve-name]
    return $(`
    <div class="${SCENE_BREAK_DIV_CLASS} ${stateClass} ${borderClass} ${collapsedClass}" style="margin:0 0 5px 0;" tabindex="0">
        <div class="sceneBreak-header" style="display:flex; align-items:center; gap:0.5em; margin-bottom:0.5em;">
            <input type="text" class="sceneBreak-name auto_summarize_memory_text" placeholder="Scene name..." value="${sceneName.replace(/"/g, '&quot;')}" style="flex:1;" />
            <button class="scene-collapse-toggle menu_button fa-solid ${collapseIcon}" title="${collapseTitle}" style="padding:0.3em 0.6em;"></button>
        </div>
        <div class="sceneBreak-content">
            <div style="font-size:0.95em; color:inherit; margin-bottom:0.5em;">
                Scene: ${sceneStartLink} &rarr; #${index} (${sceneMessages.length} messages)${previewIcon}
            </div>
            <textarea class="scene-summary-box auto_summarize_memory_text" placeholder="Scene summary...">${sceneSummary}</textarea>
            <div class="scene-summary-actions" style="margin-top:0.5em; display:flex; gap:0.5em;">
                <button class="scene-rollback-summary menu_button" title="Go to previous summary" style="white-space:nowrap;"><i class="fa-solid fa-rotate-left"></i> Previous Summary</button>
                <button class="scene-generate-summary menu_button" title="Generate summary for this scene" style="white-space:nowrap;"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate</button>
                <button class="scene-rollforward-summary menu_button" title="Go to next summary" style="white-space:nowrap;"><i class="fa-solid fa-rotate-right"></i> Next Summary</button>
                <button class="scene-regenerate-running menu_button" title="Combine this scene with current running summary" style="margin-left:auto; white-space:nowrap;"><i class="fa-solid fa-sync-alt"></i> Combine</button>
                <span style="align-self:center; font-size:0.9em; color:inherit; margin-left:0.5em;">${versions.length > 1 ? `[${currentIdx + 1}/${versions.length}]` : ''}</span>
            </div>
        </div>
    </div>
    `);
}

// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export function renderSceneBreak(
    index /*: number */,
    get_message_div /*: (index: number) => any */,  // Returns jQuery object - any is appropriate
    getContext /*: () => STContext */,
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    saveChatDebounced /*: () => void */
) /*: void */ {
    const $msgDiv = get_message_div(index);
    if (!$msgDiv?.length) return;

    $msgDiv.find(`.${SCENE_BREAK_DIV_CLASS}`).remove();

    const ctx = getContext();
    const chat = ctx.chat;
    const message = chat[index];
    const isSet = !!get_data(message, SCENE_BREAK_KEY);
    const visible = get_data(message, SCENE_BREAK_VISIBLE_KEY);
    const isVisible = (visible === undefined) ? true : visible;

    if (!isSet) return;

    // Initialize versioned summaries
    const { versions, currentIdx } = initializeSceneSummaryVersions(message, get_data, set_data, saveChatDebounced);

    const sceneName = get_data(message, SCENE_BREAK_NAME_KEY) || '';
    const sceneSummary = versions[currentIdx] || '';

    let isCollapsed = get_data(message, SCENE_BREAK_COLLAPSED_KEY);
    if (isCollapsed === undefined) {
        isCollapsed = get_settings('scene_summary_default_collapsed') ?? true;
    }

    // Find scene boundaries
    const { startIdx, sceneMessages } = findSceneBoundaries(chat, index, get_data);

    // Build scene break element
    const $sceneBreak = buildSceneBreakElement(index, startIdx, sceneMessages, sceneName, sceneSummary, isVisible, isCollapsed, versions, currentIdx);

    // === Insert after the summary box, or after .mes_text if no summary box exists ===
    const $summaryBox = $msgDiv.find('.auto_summarize_memory_text');
    if ($summaryBox.length) {
        $summaryBox.last().after($sceneBreak);
    } else {
        const $mesText = $msgDiv.find('.mes_text');
        if ($mesText.length) {
            $mesText.after($sceneBreak);
        } else {
            $msgDiv.append($sceneBreak);
        }
    }

    // --- Editable handlers ---
    // $FlowFixMe[missing-this-annot]
    $sceneBreak.find('.sceneBreak-name').on('change blur', function () {
        // $FlowFixMe[cannot-resolve-name]
        set_data(message, SCENE_BREAK_NAME_KEY, $(this).val());
        saveChatDebounced();
        // Update navigator bar to show the new name immediately
        renderSceneNavigatorBar();
    });

    // --- Collapse/expand toggle handler ---
    $sceneBreak.find('.scene-collapse-toggle').on('click', function (e) {
        e.stopPropagation();
        // Use same default logic as render function
        let currentCollapsed = get_data(message, SCENE_BREAK_COLLAPSED_KEY);
        if (currentCollapsed === undefined) {
            currentCollapsed = get_settings('scene_summary_default_collapsed') ?? true;
        }
        set_data(message, SCENE_BREAK_COLLAPSED_KEY, !currentCollapsed);
        saveChatDebounced();
        renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
    });

    // $FlowFixMe[missing-this-annot]
    $sceneBreak.find('.scene-summary-box').on('change blur', function () {
        // Update the current version in the versions array
        const updatedVersions = getSceneSummaryVersions(message, get_data).slice();
        const idx = getCurrentSceneSummaryIndex(message, get_data);
        // $FlowFixMe[cannot-resolve-name]
        const newSummary = $(this).val();
        updatedVersions[idx] = newSummary;
        setSceneSummaryVersions(message, set_data, updatedVersions);
        // Also update the legacy summary field for compatibility
        // $FlowFixMe[cannot-resolve-name]
        set_data(message, SCENE_BREAK_SUMMARY_KEY, newSummary);
        // $FlowFixMe[cannot-resolve-name]
        set_data(message, SCENE_SUMMARY_MEMORY_KEY, newSummary); // <-- ensure top-level property is set
        set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(newSummary));
        saveChatDebounced();
    });

    // --- Hyperlink handler ---
    // $FlowFixMe[missing-this-annot]
    $sceneBreak.find('.scene-start-link').on('click', function () {
        // $FlowFixMe[cannot-resolve-name]
        const mesid = $(this).data('mesid');
        // $FlowFixMe[cannot-resolve-name]
        let $target = $(`div[mesid="${mesid}"]`);
        if ($target.length) {
            // Scroll the #chat container so the target is near the top
            // $FlowFixMe[cannot-resolve-name]
            const $chat = $('#chat');
            const chatOffset = $chat.offset()?.top ?? 0;
            const targetOffset = $target.offset()?.top ?? 0;
            const scrollTop = $chat.scrollTop() + (targetOffset - chatOffset) - 20; // 20px padding
            $chat.animate({ scrollTop }, 300);

            $target.addClass('scene-highlight');
            setTimeout(() => $target.removeClass('scene-highlight'), 1200);
        } else {
            // fallback: scroll to top to try to load more messages
            // $FlowFixMe[cannot-resolve-name]
            const $chat = $('#chat');
            $chat.scrollTop(0);
            setTimeout(() => {
                // $FlowFixMe[cannot-resolve-name]
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
        const sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
        const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
        const ctx = getContext();

        const messageTypes = get_settings('scene_summary_message_types') || "both";
        const sceneObjects = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const msg = chat[i];
            if (msg.mes && msg.mes.trim() !== "") {
                // Filter by message type
                const includeMessage = (messageTypes === "both") ||
                                     (messageTypes === "user" && msg.is_user) ||
                                     (messageTypes === "character" && !msg.is_user);
                if (includeMessage) {
                    sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
                }
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
            // $FlowFixMe[cannot-resolve-name]
            alert(pretty);
        }
    });

    // --- Button handlers (prevent event bubbling to avoid toggling scene break) ---
    $sceneBreak.find('.scene-generate-summary').off('click').on('click', async function(e) {
        e.stopPropagation();
        await handleGenerateSummaryButtonClick(index, chat, message, $sceneBreak, get_message_div, get_data, set_data, saveChatDebounced);
    });

    $sceneBreak.find('.scene-rollback-summary').off('click').on('click', function(e) {
        e.stopPropagation();
        const idx = getCurrentSceneSummaryIndex(message, get_data);
        if (idx > 0) {
            setCurrentSceneSummaryIndex(message, set_data, idx - 1);
            const summary = getSceneSummaryVersions(message, get_data)[idx - 1];
            set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
            set_data(message, SCENE_SUMMARY_MEMORY_KEY, summary); // <-- ensure top-level property is set
            set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(summary));
            saveChatDebounced();
            refresh_memory(); // <-- refresh memory injection to use the newly selected summary
            renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
        }
    });
    $sceneBreak.find('.scene-rollforward-summary').off('click').on('click', function(e) {
        e.stopPropagation();
        const versions = getSceneSummaryVersions(message, get_data);
        const idx = getCurrentSceneSummaryIndex(message, get_data);
        if (idx < versions.length - 1) {
            setCurrentSceneSummaryIndex(message, set_data, idx + 1);
            const summary = versions[idx + 1];
            set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
            set_data(message, SCENE_SUMMARY_MEMORY_KEY, summary); // <-- ensure top-level property is set
            set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(summary));
            saveChatDebounced();
            refresh_memory(); // <-- refresh memory injection to use the newly selected summary
            renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
        }
    });

    // --- Regenerate running summary from this scene onwards ---
    // $FlowFixMe[missing-this-annot]
    $sceneBreak.find('.scene-regenerate-running').off('click').on('click', async function(e) {
        e.stopPropagation();
        if (!get_settings('running_scene_summary_enabled')) {
            // $FlowFixMe[cannot-resolve-name]
            alert('Running scene summary is not enabled. Enable it in settings first.');
            return;
        }

        const sceneSummary = get_data(message, SCENE_SUMMARY_MEMORY_KEY);
        if (!sceneSummary) {
            // $FlowFixMe[cannot-resolve-name]
            alert('This scene has no summary yet. Generate a scene summary first.');
            return;
        }

        log(SUBSYSTEM.SCENE, "Combine scene with running summary button clicked for scene at index", index);

        // Queue the operation - this will lock the UI and process through the queue
        const opId = await queueCombineSceneWithRunning(index);

        if (opId) {
            log(SUBSYSTEM.SCENE, "Scene combine operation queued with ID:", opId);
            toast('Scene combine operation queued', 'success');
        } else {
            error(SUBSYSTEM.SCENE, "Failed to queue scene combine operation");
            // $FlowFixMe[cannot-resolve-name]
            alert('Failed to queue operation. Check console for details.');
        }
    });

    // --- Selection handlers for visual feedback ---
    // $FlowFixMe[missing-this-annot]
    $sceneBreak.on('mousedown', function (_e) {
        // $FlowFixMe[cannot-resolve-name]
        $('.' + SCENE_BREAK_DIV_CLASS).removeClass(SCENE_BREAK_SELECTED_CLASS);
        // $FlowFixMe[cannot-resolve-name]
        $(this).addClass(SCENE_BREAK_SELECTED_CLASS);
    });
    // Remove selection when clicking outside any scene break
    // $FlowFixMe[cannot-resolve-name]
    $(document).off('mousedown.sceneBreakDeselect').on('mousedown.sceneBreakDeselect', function (e) {
        // $FlowFixMe[cannot-resolve-name]
        if (!$(e.target).closest('.' + SCENE_BREAK_DIV_CLASS).length) {
            // $FlowFixMe[cannot-resolve-name]
            $('.' + SCENE_BREAK_DIV_CLASS).removeClass(SCENE_BREAK_SELECTED_CLASS);
        }
    });
    // Also add focus/blur for keyboard navigation
    // $FlowFixMe[missing-this-annot]
    $sceneBreak.on('focusin', function () {
        // $FlowFixMe[cannot-resolve-name]
        $('.' + SCENE_BREAK_DIV_CLASS).removeClass(SCENE_BREAK_SELECTED_CLASS);
        // $FlowFixMe[cannot-resolve-name]
        $(this).addClass(SCENE_BREAK_SELECTED_CLASS);
    });
    // $FlowFixMe[missing-this-annot]
    $sceneBreak.on('focusout', function () {
        // $FlowFixMe[cannot-resolve-name]
        $(this).removeClass(SCENE_BREAK_SELECTED_CLASS);
    });
}

/**
 * Collects all messages for a scene, regardless of exclusion/hidden status.
 * @param {number} startIdx - Start index of the scene (inclusive)
 * @param {number} endIdx - End index of the scene (inclusive)
 * @param {string} mode - Ignored (kept for compatibility, always uses messages)
 * @param {object} ctx - Context object
 * @returns {string} - Concatenated scene content
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export function collectSceneContent(
    startIdx /*: number */,
    endIdx /*: number */,
    mode /*: string */,
    ctx /*: STContext */,
    get_memory /*: (message: STMessage) => ?string */
) /*: string */ {
    const chat = ctx.chat;
    const result = [];
    for (let i = startIdx; i <= endIdx; i++) {
        const msg = chat[i];
        result.push(msg.mes);
    }
    return result.join('\n');
}

// Call this after chat loads or refresh to re-render all scene breaks
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export function renderAllSceneBreaks(
    get_message_div /*: (index: number) => any */,  // Returns jQuery object - any is appropriate
    getContext /*: () => STContext */,
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    saveChatDebounced /*: () => void */
) /*: void */ {
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
    // $FlowFixMe[cannot-resolve-name]
    if (window.renderSceneNavigatorBar) window.renderSceneNavigatorBar();
}

/**
 * Generate a scene summary for a message that has a scene break marker
 * @param {number} index - Index of the message with the scene break
 * @param {function} get_message_div - Function to get message div by index
 * @param {function} getContext - Function to get SillyTavern context
 * @param {function} get_data - Function to get data from message
 * @param {function} set_data - Function to set data on message
 * @param {function} saveChatDebounced - Function to save chat
 * @returns {Promise<string>} - The generated scene summary
 */
/**
 * Generate a scene name using AI based on the scene summary
 * @param {string} summary - The scene summary text
 * @param {object} message - The message object to set the scene name on
 * @param {function} get_data - Function to get data from message
 * @param {function} set_data - Function to set data on message
 * @param {object} ctx - SillyTavern context
 * @param {object|null} _savedProfiles - Saved profile/preset info from switchToSceneProfile() (optional, unused but kept for signature consistency)
 * @returns {Promise<string|null>} - The generated scene name, or null if generation failed
 */
// $FlowFixMe[missing-local-annot] - Function signature is correct
async function autoGenerateSceneNameFromSummary(
    summary /*: string */,
    message /*: STMessage */,
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    ctx /*: STContext */,
    _savedProfiles /*: ?{savedProfile: ?string, api: ?string, presetManager: ?any, savedPreset: ?any} */  // any is appropriate for PresetManager
) /*: Promise<?string> */ {
    const existingSceneName = get_data(message, SCENE_BREAK_NAME_KEY);

    // Only generate if no name already exists
    if (existingSceneName) {
        debug(SUBSYSTEM.SCENE, "Scene name already exists, skipping auto-generation");
        return null;
    }

    try {
        debug(SUBSYSTEM.SCENE, "Auto-generating scene name...");

        // Create a prompt to generate a brief scene name
        const sceneNamePrompt = `Based on the following scene summary, generate a very brief scene name (maximum 5 words, like a chapter title).

Scene Summary:
${summary}

Respond with ONLY the scene name, nothing else. Make it concise and descriptive, like a chapter title.`;

        ctx.deactivateSendButtons();

        const sceneName = await summarize_text(sceneNamePrompt);

        ctx.activateSendButtons();

        // Clean up the scene name (remove quotes, trim, limit length)
        let cleanSceneName = sceneName.trim()
            .replace(/^["']|["']$/g, '') // Remove leading/trailing quotes
            .replace(/\n/g, ' ') // Replace newlines with spaces
            .trim();

        // Limit to ~50 characters max
        if (cleanSceneName.length > 50) {
            cleanSceneName = cleanSceneName.substring(0, 47) + '...';
        }

        debug(SUBSYSTEM.SCENE, "Generated scene name:", cleanSceneName);
        set_data(message, SCENE_BREAK_NAME_KEY, cleanSceneName);

        // Refresh the scene navigator bar to show the new name immediately
        renderSceneNavigatorBar();

        return cleanSceneName;
    } catch (err) {
        error(SUBSYSTEM.SCENE, "Error generating scene name:", err);
        // Don't fail the whole summary generation if scene name fails
        return null;
    }
}

// Helper: Try to queue scene summary generation
// $FlowFixMe[missing-local-annot] - Function signature is correct
async function tryQueueSceneSummary(index /*: number */) /*: Promise<boolean> */ {
    const queueEnabled = get_settings('operation_queue_enabled') !== false;
    if (!queueEnabled) return false;

    debug(SUBSYSTEM.SCENE, `[Queue] Operation queue enabled, queueing scene summary generation for index ${index}`);

    const { queueGenerateSceneSummary } = await import('./queueIntegration.js');
    const operationId = await queueGenerateSceneSummary(index);

    if (operationId) {
        log(SUBSYSTEM.SCENE, `[Queue] Queued scene summary generation for index ${index}:`, operationId);
        toast(`Queued scene summary generation for message ${index}`, 'info');
        return true;
    }

    debug(SUBSYSTEM.SCENE, `[Queue] Failed to queue operation, falling back to direct execution`);
    return false;
}

// Helper: Collect scene objects for summary
// $FlowFixMe[missing-local-annot] - Function signature is correct
function collectSceneObjects(
    startIdx /*: number */,
    endIdx /*: number */,
    chat /*: Array<STMessage> */
) /*: Array<Object> */ {
    const messageTypes = get_settings('scene_summary_message_types') || "both";
    const sceneObjects = [];

    for (let i = startIdx; i <= endIdx; i++) {
        const msg = chat[i];
        if (msg.mes && msg.mes.trim() !== "") {
            const includeMessage = (messageTypes === "both") ||
                                 (messageTypes === "user" && msg.is_user) ||
                                 (messageTypes === "character" && !msg.is_user);
            if (includeMessage) {
                sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
            }
        }
    }

    return sceneObjects;
}

// Helper: Prepare scene summary prompt
// $FlowFixMe[missing-local-annot] - Function signature is correct
function prepareScenePrompt(
    sceneObjects /*: Array<Object> */,
    ctx /*: STContext */
) /*: string */ {
    const promptTemplate = get_settings('scene_summary_prompt');
    const prefill = get_settings('scene_summary_prefill') || "";
    const typeDefinitions = getConfiguredEntityTypeDefinitions(extension_settings?.autoLorebooks?.entity_types);
    let lorebookTypesMacro = formatEntityTypeListForPrompt(typeDefinitions);
    if (!lorebookTypesMacro) {
        lorebookTypesMacro = formatEntityTypeListForPrompt(getConfiguredEntityTypeDefinitions(undefined));
    }

    // Format scene messages with speaker labels to prevent substituteParamsExtended from stripping them
    const formattedMessages = sceneObjects.map(obj => {
        if (obj.type === 'message') {
            const role = obj.is_user ? 'USER' : 'CHARACTER';
            return `[${role}: ${obj.name}]\n${obj.text}`;
        } else if (obj.type === 'summary') {
            return `[SUMMARY]\n${obj.summary}`;
        }
        return '';
    }).filter(m => m).join('\n\n');

    let prompt = promptTemplate;
    if (ctx.substituteParamsExtended) {
        prompt = ctx.substituteParamsExtended(prompt, {
            scene_messages: formattedMessages,
            message: JSON.stringify(sceneObjects, null, 2), // Keep for backward compatibility
            prefill,
            lorebook_entry_types: lorebookTypesMacro,
        }) || prompt;
    }
    // Fallback replacements
    prompt = prompt.replace(/\{\{scene_messages\}\}/g, formattedMessages);
    prompt = prompt.replace(/\{\{message\}\}/g, JSON.stringify(sceneObjects, null, 2));
    prompt = prompt.replace(/\{\{lorebook_entry_types\}\}/g, lorebookTypesMacro);
    prompt = `${prompt}\n${prefill}`;

    return prompt;
}

// Helper: Switch to scene summary profile/preset
// $FlowFixMe[missing-local-annot] - Function signature is correct
export async function switchToSceneProfile(_ctx /*: STContext */) /*: Promise<?{savedProfile: ?string, api: ?string, presetManager: ?any, savedPreset: ?any}> */ {
    const preset_name = get_settings('scene_summary_completion_preset');
    const profile_name = get_settings('scene_summary_connection_profile');

    debug(SUBSYSTEM.SCENE, `Scene settings: profile='${profile_name}', preset='${preset_name}'`);

    // Save current connection profile
    const savedProfile = await get_current_connection_profile();

    // Switch to configured connection profile if specified
    if (profile_name) {
        await set_connection_profile(profile_name);
        debug(SUBSYSTEM.SCENE, `Switched connection profile to: ${profile_name}`);
    }

    // Get API type for the configured connection profile
    const api = await get_connection_profile_api(profile_name);
    if (!api) {
        debug(SUBSYSTEM.SCENE, 'No API found for connection profile, using defaults');
        return { savedProfile, api: undefined, presetManager: undefined, savedPreset: undefined };
    }

    // Get PresetManager for that API
    const presetManager = getPresetManager(api);
    if (!presetManager) {
        debug(SUBSYSTEM.SCENE, `No PresetManager found for API: ${api}`);
        return { savedProfile, api, presetManager: undefined, savedPreset: undefined };
    }

    // Save current preset for this API
    const savedPreset = presetManager.getSelectedPreset();

    // Switch to configured preset if specified
    if (preset_name) {
        const presetValue = presetManager.findPreset(preset_name);
        if (presetValue) {
            debug(SUBSYSTEM.SCENE, `Switching ${api} preset to: ${preset_name}`);
            presetManager.selectPreset(presetValue);
        } else {
            debug(SUBSYSTEM.SCENE, `Preset '${preset_name}' not found for API ${api}`);
        }
    }

    return { savedProfile, api, presetManager, savedPreset };
}

// Helper: Restore previous profile/preset
// $FlowFixMe[missing-local-annot] - Function signature is correct
async function restoreProfile(
    ctx /*: STContext */,
    saved /*: ?{savedProfile: ?string, api: ?string, presetManager: ?any, savedPreset: ?any} */  // any is appropriate for PresetManager
) /*: Promise<void> */ {
    if (!saved) return;

    // Restore preset if it was changed
    const presetManager = saved.presetManager;
    const savedPreset = saved.savedPreset;
    const api = saved.api;
    if (presetManager && savedPreset && api) {
        debug(SUBSYSTEM.SCENE, `Restoring ${api} preset to original`);
        presetManager.selectPreset(savedPreset);
    }

    // Restore connection profile if it was changed
    const savedProfile = saved.savedProfile;
    if (savedProfile) {
        await set_connection_profile(savedProfile);
        debug(SUBSYSTEM.SCENE, `Restored connection profile to: ${savedProfile}`);
    }
}

// Helper: Extract and validate JSON from AI response
// Strips code fences, explanatory text, and validates JSON structure
// $FlowFixMe[missing-local-annot] - Function signature is correct
function extractAndValidateJson(rawResponse /*: string */) /*: string */ {
    let cleaned = rawResponse.trim();

    // Try to find and extract JSON from code fences first
    const codeFenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeFenceMatch) {
        cleaned = codeFenceMatch[1].trim();
        debug(SUBSYSTEM.SCENE, "Extracted JSON from code fences");
    }

    // If still doesn't look like JSON, try to find the first { or [
    if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        const jsonStartMatch = cleaned.match(/[{[]/);
        if (jsonStartMatch) {
            const jsonStart = cleaned.indexOf(jsonStartMatch[0]);
            cleaned = cleaned.substring(jsonStart);
            debug(SUBSYSTEM.SCENE, "Stripped explanatory text before JSON");
        }
    }

    // If still doesn't look like JSON, try to find last } or ]
    if (!cleaned.endsWith('}') && !cleaned.endsWith(']')) {
        const lastBrace = cleaned.lastIndexOf('}');
        const lastBracket = cleaned.lastIndexOf(']');
        const lastJsonChar = Math.max(lastBrace, lastBracket);
        if (lastJsonChar > 0) {
            cleaned = cleaned.substring(0, lastJsonChar + 1);
            debug(SUBSYSTEM.SCENE, "Stripped text after JSON");
        }
    }

    // Validate it's actually JSON and has expected structure
    try {
        const parsed = JSON.parse(cleaned);

        // Scene summaries should have a "summary" field (and optionally "lorebooks")
        if (typeof parsed === 'object' && parsed !== null) {
            if (!('summary' in parsed)) {
                throw new Error("JSON missing required 'summary' field");
            }

            // Check if summary is empty or just placeholder text
            const summaryText = parsed.summary?.trim() || '';
            if (summaryText === '' || summaryText === '...' || summaryText === 'TODO') {
                throw new Error("AI returned empty or placeholder summary");
            }

            // Check if it's just the template structure with no content
            if (summaryText.length < 10) {
                throw new Error("AI returned suspiciously short summary (less than 10 chars)");
            }

            debug(SUBSYSTEM.SCENE, "JSON validated successfully");
            return cleaned;
        } else {
            throw new Error("JSON is not an object");
        }
    } catch (parseErr) {
        error(SUBSYSTEM.SCENE, "Failed to parse or validate JSON:", parseErr);
        error(SUBSYSTEM.SCENE, "Attempted to parse:", cleaned.substring(0, 200));
        throw new Error(`Invalid JSON from AI: ${parseErr.message}`);
    }
}

// Helper: Generate summary with error handling
// $FlowFixMe[missing-local-annot] - Function signature is correct
async function executeSceneSummaryGeneration(
    prompt /*: string */,
    ctx /*: STContext */
) /*: Promise<string> */ {
    let summary = "";
    try {
        ctx.deactivateSendButtons();
        debug(SUBSYSTEM.SCENE, "Sending prompt to AI:", prompt);
        const rawResponse = await summarize_text(prompt);
        debug(SUBSYSTEM.SCENE, "AI response:", rawResponse);

        // Extract and validate JSON immediately
        summary = extractAndValidateJson(rawResponse);
        if (summary !== rawResponse) {
            debug(SUBSYSTEM.SCENE, "Cleaned summary:", summary);
        }
    } catch (err) {
        summary = "Error generating summary: " + (err?.message || err);
        error(SUBSYSTEM.SCENE, "Error generating summary:", err);
        throw err;
    } finally {
        ctx.activateSendButtons();
    }
    return summary;
}

// Helper: Save scene summary and queue lorebook entries
// $FlowFixMe[missing-local-annot] - Function signature is correct
async function saveSceneSummary(
    message /*: STMessage */,
    summary /*: string */,
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    saveChatDebounced /*: () => void */,
    messageIndex /*: number */
) /*: Promise<void> */ {
    const updatedVersions = getSceneSummaryVersions(message, get_data).slice();
    updatedVersions.push(summary);
    setSceneSummaryVersions(message, set_data, updatedVersions);
    setCurrentSceneSummaryIndex(message, set_data, updatedVersions.length - 1);
    set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
    set_data(message, SCENE_SUMMARY_MEMORY_KEY, summary);
    set_data(message, SCENE_SUMMARY_HASH_KEY, computeSummaryHash(summary));
    saveChatDebounced();
    refresh_memory();

    // Extract and queue lorebook entries if Auto-Lorebooks is enabled
    const autoLorebooksEnabled = get_settings('auto_lorebooks_summary_enabled');
    debug(SUBSYSTEM.SCENE, `[SAVE SCENE SUMMARY] auto_lorebooks_summary_enabled = ${autoLorebooksEnabled}, has summary = ${String(!!summary)}`);
    if (autoLorebooksEnabled && summary) {
        debug(SUBSYSTEM.SCENE, `[SAVE SCENE SUMMARY] Calling extractAndQueueLorebookEntries for message ${messageIndex}...`);
        await extractAndQueueLorebookEntries(summary, messageIndex);
        debug(SUBSYSTEM.SCENE, `[SAVE SCENE SUMMARY] extractAndQueueLorebookEntries completed for message ${messageIndex}`);
    } else {
        debug(SUBSYSTEM.SCENE, `[SAVE SCENE SUMMARY] Skipping lorebook extraction - enabled: ${autoLorebooksEnabled}, has summary: ${String(!!summary)}`);
    }
}

// Helper: Extract lorebooks from summary JSON and queue each as individual operation
// Note: Summary should already be clean JSON from executeSceneSummaryGeneration()
// $FlowFixMe[missing-local-annot] - Function signature is correct
async function extractAndQueueLorebookEntries(
    summary /*: string */,
    messageIndex /*: number */
) /*: Promise<void> */ {
    debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Starting for message ${messageIndex}`);
    try {
        const summaryHash = computeSummaryHash(summary);
        debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Summary hash: ${summaryHash}`);

        // Parse JSON (should already be clean from generation)
        const parsed = JSON.parse(summary);

        // Check for 'lorebooks' array (standard format)
        if (parsed.lorebooks && Array.isArray(parsed.lorebooks)) {
            debug(SUBSYSTEM.SCENE, `Found ${parsed.lorebooks.length} lorebook entries in scene summary at index ${messageIndex}`);

            // Deduplicate entries by name/comment before queueing
            const seenNames /*: Set<string> */ = new Set();
            const uniqueEntries = [];

            for (const entry of parsed.lorebooks) {
                if (entry && (entry.name || entry.comment)) {
                    const entryName = (entry.name || entry.comment).toLowerCase().trim();

                    if (seenNames.has(entryName)) {
                        debug(SUBSYSTEM.SCENE, `Skipping duplicate lorebook entry: ${entry.name || entry.comment}`);
                        continue;
                    }

                    seenNames.add(entryName);
                    uniqueEntries.push(entry);
                }
            }

            debug(SUBSYSTEM.SCENE, `After deduplication: ${uniqueEntries.length} unique entries (removed ${parsed.lorebooks.length - uniqueEntries.length} duplicates)`);

            // Queue each unique entry individually
            debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Queueing ${uniqueEntries.length} unique entries...`);
            for (const entry of uniqueEntries) {
                // Sequential execution required: entries must be queued in order
                // eslint-disable-next-line no-await-in-loop
                debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Calling queueProcessLorebookEntry for: ${entry.name || entry.comment}`);
                const opId = await queueProcessLorebookEntry(entry, messageIndex, summaryHash);
                if (opId) {
                    debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] ✓ Queued lorebook entry: ${entry.name || entry.comment} (op: ${opId})`);
                } else {
                    debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] ✗ Failed to queue lorebook entry: ${entry.name || entry.comment} (returned null/undefined)`);
                }
            }
            debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] Finished queueing all entries`);
        } else {
            debug(SUBSYSTEM.SCENE, `[LOREBOOK EXTRACTION] No lorebooks array found in scene summary at index ${messageIndex}`);
        }
    } catch (err) {
        // Not JSON or parsing failed - skip lorebook processing
        debug(SUBSYSTEM.SCENE, `Scene summary is not JSON, skipping lorebook extraction: ${err.message}`);
    }
}

// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
export async function generateSceneSummary(
    index /*: number */,
    get_message_div /*: (index: number) => any */,  // Returns jQuery object - any is appropriate
    getContext /*: () => STContext */,
    get_data /*: (message: STMessage, key: string) => any */,  // Returns any type - legitimate
    set_data /*: (message: STMessage, key: string, value: any) => void */,  // value can be any type - legitimate
    saveChatDebounced /*: () => void */,
    skipQueue /*: boolean */ = false
) /*: Promise<?string> */ {
    const ctx = getContext();
    const chat = ctx.chat;
    const message = chat[index];

    // Try queueing if not bypassed
    if (!skipQueue && await tryQueueSceneSummary(index)) {
        return;
    }

    debug(SUBSYSTEM.SCENE, `Executing scene summary generation directly for index ${index} (queue ${skipQueue ? 'bypassed' : 'disabled or unavailable'})`);

    // Get scene range and collect objects
    const sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
    const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
    const sceneObjects = collectSceneObjects(startIdx, endIdx, chat);

    // Prepare prompt and switch profiles
    const prompt = prepareScenePrompt(sceneObjects, ctx);
    const savedProfiles = await switchToSceneProfile(ctx);

    // Generate summary
    let summary;
    try {
        summary = await executeSceneSummaryGeneration(prompt, ctx);
    } finally {
        await restoreProfile(ctx, savedProfiles);
    }

    // Auto-generate scene name if enabled
    const autoGenerateSceneName = get_settings('scene_summary_auto_name') ?? true;
    if (autoGenerateSceneName) {
        debug(SUBSYSTEM.SCENE, "Waiting 5 seconds before generating scene name...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        await autoGenerateSceneNameFromSummary(summary, message, get_data, set_data, ctx, savedProfiles);
    }

    // Save and render
    await saveSceneSummary(message, summary, get_data, set_data, saveChatDebounced, index);
    await auto_generate_running_summary(index);
    renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);

    return summary;
}

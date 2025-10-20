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
} from './index.js';
import {
    auto_generate_running_summary,
    combine_scene_with_running_summary,
} from './runningSceneSummary.js';

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
export const SCENE_BREAK_COLLAPSED_KEY = 'scene_break_collapsed';
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
    const isSet = !!get_data(message, SCENE_BREAK_KEY);
    const visible = get_data(message, SCENE_BREAK_VISIBLE_KEY);

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
// Scene summary properties are not at the root; see file header for structure.
function getSceneSummaryVersions(message, get_data) {
    // Returns the array of summary versions, or an empty array if none
    return get_data(message, 'scene_summary_versions') || [];
}

// Scene summary properties are not at the root; see file header for structure.
function setSceneSummaryVersions(message, set_data, versions) {
    set_data(message, 'scene_summary_versions', versions);
}

// Scene summary properties are not at the root; see file header for structure.
function getCurrentSceneSummaryIndex(message, get_data) {
    return get_data(message, 'scene_summary_current_index') ?? 0;
}

// Scene summary properties are not at the root; see file header for structure.
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

    // Check collapsed state - use default setting for new scenes (when undefined)
    let isCollapsed = get_data(message, SCENE_BREAK_COLLAPSED_KEY);
    if (isCollapsed === undefined) {
        // New scene - use default setting
        isCollapsed = get_settings('scene_summary_default_collapsed') ?? true;
    }

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
    const collapsedClass = isCollapsed ? "sceneBreak-collapsed" : "";

    // Use the same classes as summary boxes for consistent placement and style
    // Wrap the summary content in a container for easy hiding
    const isIncluded = get_data(message, 'scene_summary_include') !== false; // default to included

    // Collapse/expand button icon
    const collapseIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
    const collapseTitle = isCollapsed ? 'Expand scene summary' : 'Collapse scene summary';

    const $sceneBreak = $(`
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
    $sceneBreak.find('.sceneBreak-name').on('change blur', function () {
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

    $sceneBreak.find('.scene-summary-box').on('change blur', function () {
        // Update the current version in the versions array
        const updatedVersions = getSceneSummaryVersions(message, get_data).slice();
        const idx = getCurrentSceneSummaryIndex(message, get_data);
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
        const sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
        const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
        const ctx = getContext();

        const mode = get_settings('scene_summary_history_mode') || "both";
        const messageTypes = get_settings('scene_summary_message_types') || "both";
        const sceneObjects = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const msg = chat[i];
            if ((mode === "messages" || mode === "both") && msg.mes && msg.mes.trim() !== "") {
                // Filter by message type
                const includeMessage = (messageTypes === "both") ||
                                     (messageTypes === "user" && msg.is_user) ||
                                     (messageTypes === "character" && !msg.is_user);
                if (includeMessage) {
                    sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
                }
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
        log(SUBSYSTEM.SCENE, "Generate button clicked for scene at index", index);

        const sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
        const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);
        const ctx = getContext();

        // Collect scene objects (messages/summaries) as before
        const mode = get_settings('scene_summary_history_mode') || "both";
        const messageTypes = get_settings('scene_summary_message_types') || "both";
        const sceneObjects = [];
        for (let i = startIdx; i <= endIdx; i++) {
            const msg = chat[i];
            if ((mode === "messages" || mode === "both") && msg.mes && msg.mes.trim() !== "") {
                // Filter by message type
                const includeMessage = (messageTypes === "both") ||
                                     (messageTypes === "user" && msg.is_user) ||
                                     (messageTypes === "character" && !msg.is_user);
                if (includeMessage) {
                    sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
                }
            }
            if ((mode === "summaries" || mode === "both") && get_memory(msg)) {
                sceneObjects.push({ type: "summary", index: i, summary: get_memory(msg) });
            }
        }

        // 1. Get prompt and connection profile for scene summaries
        const promptTemplate = get_settings('scene_summary_prompt');
        const prefill = get_settings('scene_summary_prefill') || "";
        const profile = get_settings('scene_summary_connection_profile');
        const preset = get_settings('scene_summary_completion_preset');
        const current_profile = await ctx.get_current_connection_profile?.();
        const current_preset = await ctx.get_current_preset?.();

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
            debug(SUBSYSTEM.SCENE, "Switching to connection profile:", profile);
            await ctx.set_connection_profile?.(profile);
        }
        if (preset) {
            debug(SUBSYSTEM.SCENE, "Switching to preset:", preset);
            await ctx.set_preset?.(preset);
        }

        // 4. Show loading state in summary box
        const $summaryBox = $sceneBreak.find('.scene-summary-box');
        $summaryBox.val("Generating scene summary...");

        // 5. Generate summary using the same logic as summarize_text
        let summary = "";
        try {
            // Block input if setting is enabled
            if (get_settings('block_chat')) {
                ctx.deactivateSendButtons();
            }
            debug(SUBSYSTEM.SCENE, "Sending prompt to AI:", prompt);
            summary = await summarize_text(prompt);
            debug(SUBSYSTEM.SCENE, "AI response:", summary);
        } catch (err) {
            summary = "Error generating summary: " + (err?.message || err);
            error(SUBSYSTEM.SCENE, "Error generating summary:", err);
        } finally {
            // Re-enable input if it was blocked
            if (get_settings('block_chat')) {
                ctx.activateSendButtons();
            }
        }

        // 6. Restore previous profile/preset
        if (profile) {
            debug(SUBSYSTEM.SCENE, "Restoring previous connection profile:", current_profile);
            await ctx.set_connection_profile?.(current_profile);
        }
        if (preset) {
            debug(SUBSYSTEM.SCENE, "Restoring previous preset:", current_preset);
            await ctx.set_preset?.(current_preset);
        }

        // 6.5. Auto-generate scene name if enabled and not already set (for manual generation)
        const autoGenerateSceneNameManual = get_settings('scene_summary_auto_name_manual') ?? true;
        if (autoGenerateSceneNameManual) {
            // Delay before generating scene name to avoid rate limiting
            debug(SUBSYSTEM.SCENE, "Waiting 5 seconds before generating scene name...");
            await new Promise(resolve => setTimeout(resolve, 5000));

            await autoGenerateSceneNameFromSummary(summary, message, get_data, set_data, ctx, profile, preset, current_profile, current_preset);
        }

        // 7. Save and display the summary in the box
        const updatedVersions = getSceneSummaryVersions(message, get_data).slice();
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
        const idx = getCurrentSceneSummaryIndex(message, get_data);
        if (idx > 0) {
            setCurrentSceneSummaryIndex(message, set_data, idx - 1);
            const summary = getSceneSummaryVersions(message, get_data)[idx - 1];
            set_data(message, SCENE_BREAK_SUMMARY_KEY, summary);
            set_data(message, 'scene_summary_memory', summary); // <-- ensure top-level property is set
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
            set_data(message, 'scene_summary_memory', summary); // <-- ensure top-level property is set
            saveChatDebounced();
            refresh_memory(); // <-- refresh memory injection to use the newly selected summary
            renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);
        }
    });

    // --- Regenerate running summary from this scene onwards ---
    $sceneBreak.find('.scene-regenerate-running').off('click').on('click', async function(e) {
        e.stopPropagation();
        if (!get_settings('running_scene_summary_enabled')) {
            alert('Running scene summary is not enabled. Enable it in settings first.');
            return;
        }

        const sceneSummary = get_data(message, 'scene_summary_memory');
        if (!sceneSummary) {
            alert('This scene has no summary yet. Generate a scene summary first.');
            return;
        }

        log(SUBSYSTEM.SCENE, "Combine scene with running summary button clicked for scene at index", index);

        const $btn = $(this);
        $btn.prop('disabled', true);
        $btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Combining...');

        try {
            await combine_scene_with_running_summary(index);
            log(SUBSYSTEM.SCENE, "Scene combined with running summary successfully");
            if (window.updateVersionSelector) {
                window.updateVersionSelector();
            }
        } catch (err) {
            error(SUBSYSTEM.SCENE, "Failed to combine scene with running summary:", err);
            alert('Failed to combine scene with running summary. Check console for details.');
        } finally {
            $btn.prop('disabled', false);
            $btn.html('<i class="fa-solid fa-sync-alt"></i> Combine');
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
    const chat = ctx.chat;
    const result = [];
    for (let i = startIdx; i <= endIdx; i++) {
        const msg = chat[i];
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
 * @param {string|null} profile - Connection profile to use (optional)
 * @param {string|null} preset - Completion preset to use (optional)
 * @param {string|null} current_profile - Current profile to restore after generation (optional)
 * @param {string|null} current_preset - Current preset to restore after generation (optional)
 * @returns {Promise<string|null>} - The generated scene name, or null if generation failed
 */
async function autoGenerateSceneNameFromSummary(summary, message, get_data, set_data, ctx, profile = null, preset = null, current_profile = null, current_preset = null) {
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

        // Switch to scene summary profile/preset if set (reuse same settings)
        if (profile) {
            await ctx.set_connection_profile?.(profile);
        }
        if (preset) {
            await ctx.set_preset?.(preset);
        }

        // Block input if setting is enabled
        if (get_settings('block_chat')) {
            ctx.deactivateSendButtons();
        }

        const sceneName = await summarize_text(sceneNamePrompt);

        // Re-enable input if it was blocked
        if (get_settings('block_chat')) {
            ctx.activateSendButtons();
        }

        // Restore previous profile/preset
        if (profile) {
            await ctx.set_connection_profile?.(current_profile);
        }
        if (preset) {
            await ctx.set_preset?.(current_preset);
        }

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

export async function generateSceneSummary(index, get_message_div, getContext, get_data, set_data, saveChatDebounced, skipQueue = false) {
    const ctx = getContext();
    const chat = ctx.chat;
    const message = chat[index];

    // Check if operation queue is enabled (skip if called from queue handler)
    const queueEnabled = !skipQueue && get_settings('operation_queue_enabled') !== false;
    if (queueEnabled) {
        debug(SUBSYSTEM.SCENE, `[Queue] Operation queue enabled, queueing scene summary generation for index ${index}`);

        // Import queue integration
        const { queueGenerateSceneSummary } = await import('./queueIntegration.js');

        // Queue the scene summary generation
        const operationId = queueGenerateSceneSummary(index);

        if (operationId) {
            log(SUBSYSTEM.SCENE, `[Queue] Queued scene summary generation for index ${index}:`, operationId);
            toast(`Queued scene summary generation for message ${index}`, 'info');
            return; // Operation will be processed by queue
        }

        debug(SUBSYSTEM.SCENE, `[Queue] Failed to queue operation, falling back to direct execution`);
    }

    // Fallback to direct execution if queue disabled or queueing failed
    debug(SUBSYSTEM.SCENE, `Executing scene summary generation directly for index ${index} (queue ${skipQueue ? 'bypassed' : 'disabled or unavailable'})`);

    // Get scene range
    const sceneCount = Number(get_settings('scene_summary_history_count')) || 1;
    const [startIdx, endIdx] = getSceneRangeIndexes(index, chat, get_data, sceneCount);

    // Collect scene objects (messages/summaries)
    const mode = get_settings('scene_summary_history_mode') || "both";
    const messageTypes = get_settings('scene_summary_message_types') || "both";
    const sceneObjects = [];
    for (let i = startIdx; i <= endIdx; i++) {
        const msg = chat[i];
        if ((mode === "messages" || mode === "both") && msg.mes && msg.mes.trim() !== "") {
            // Filter by message type
            const includeMessage = (messageTypes === "both") ||
                                 (messageTypes === "user" && msg.is_user) ||
                                 (messageTypes === "character" && !msg.is_user);
            if (includeMessage) {
                sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
            }
        }
        if ((mode === "summaries" || mode === "both") && get_memory(msg)) {
            sceneObjects.push({ type: "summary", index: i, summary: get_memory(msg) });
        }
    }

    // Get prompt and connection profile for scene summaries
    const promptTemplate = get_settings('scene_summary_prompt');
    const prefill = get_settings('scene_summary_prefill') || "";
    const profile = get_settings('scene_summary_connection_profile');
    const preset = get_settings('scene_summary_completion_preset');
    const current_profile = await ctx.get_current_connection_profile?.();
    const current_preset = await ctx.get_current_preset?.();

    // Prepare prompt (substitute macros)
    let prompt = promptTemplate;
    if (ctx.substituteParamsExtended) {
        prompt = ctx.substituteParamsExtended(prompt, {
            message: JSON.stringify(sceneObjects, null, 2),
            prefill
        }) || prompt;
    }
    prompt = prompt.replace(/\{\{message\}\}/g, JSON.stringify(sceneObjects, null, 2));
    prompt = `${prompt}\n${prefill}`;

    // Switch to scene summary profile/preset if set
    if (profile) {
        debug(SUBSYSTEM.SCENE, "Switching to connection profile:", profile);
        await ctx.set_connection_profile?.(profile);
    }
    if (preset) {
        debug(SUBSYSTEM.SCENE, "Switching to preset:", preset);
        await ctx.set_preset?.(preset);
    }

    // Generate summary using the same logic as summarize_text
    let summary = "";
    try {
        // Block input if setting is enabled
        if (get_settings('block_chat')) {
            ctx.deactivateSendButtons();
        }
        debug(SUBSYSTEM.SCENE, "Sending prompt to AI:", prompt);
        summary = await summarize_text(prompt);
        debug(SUBSYSTEM.SCENE, "AI response:", summary);
    } catch (err) {
        summary = "Error generating summary: " + (err?.message || err);
        error(SUBSYSTEM.SCENE, "Error generating summary:", err);
        throw err; // Re-throw so caller knows it failed
    } finally {
        // Re-enable input if it was blocked
        if (get_settings('block_chat')) {
            ctx.activateSendButtons();
        }
    }

    // Restore previous profile/preset
    if (profile) {
        debug(SUBSYSTEM.SCENE, "Restoring previous connection profile:", current_profile);
        await ctx.set_connection_profile?.(current_profile);
    }
    if (preset) {
        debug(SUBSYSTEM.SCENE, "Restoring previous preset:", current_preset);
        await ctx.set_preset?.(current_preset);
    }

    // Auto-generate scene name if enabled and not already set
    const autoGenerateSceneName = get_settings('scene_summary_auto_name') ?? true;
    if (autoGenerateSceneName) {
        // Delay before generating scene name to avoid rate limiting
        debug(SUBSYSTEM.SCENE, "Waiting 5 seconds before generating scene name...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        await autoGenerateSceneNameFromSummary(summary, message, get_data, set_data, ctx, profile, preset, current_profile, current_preset);
    }

    // Save and display the summary
    const updatedVersions = getSceneSummaryVersions(message, get_data).slice();
    updatedVersions.push(summary);
    setSceneSummaryVersions(message, set_data, updatedVersions);
    setCurrentSceneSummaryIndex(message, set_data, updatedVersions.length - 1);
    set_data(message, SCENE_BREAK_SUMMARY_KEY, summary); // update legacy field
    set_data(message, 'scene_summary_memory', summary); // ensure top-level property is set
    saveChatDebounced();
    refresh_memory(); // Refresh memory injection to include the new summary

    // Auto-generate running scene summary if enabled
    await auto_generate_running_summary(index);

    renderSceneBreak(index, get_message_div, getContext, get_data, set_data, saveChatDebounced);

    return summary;
}
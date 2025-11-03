// @flow
import {
    get_settings,
    getContext,
    chat_metadata,
    SUBSYSTEM,
    debug,
    error,
    log,
    toast,
    get_data,
    summarize_text,
    saveChatDebounced,
    saveMetadata
} from './index.js';
import { running_scene_summary_prompt } from './defaultPrompts.js';
// Lorebook processing for running summary has been disabled; no queue integration needed here.

/**
 * Get running scene summary storage object from chat metadata
 * Creates it if it doesn't exist
 */
function get_running_summary_storage() {
    if (!chat_metadata.auto_summarize_running_scene_summaries) {
        chat_metadata.auto_summarize_running_scene_summaries = {
            current_version: 0,
            versions: []
        };
    }
    return chat_metadata.auto_summarize_running_scene_summaries;
}

/**
 * Get all running scene summary versions
 * @returns {Array} Array of version objects
 */
// $FlowFixMe[signature-verification-failure]
function get_running_summary_versions() {
    const storage = get_running_summary_storage();
    return storage.versions || [];
}

/**
 * Get current running scene summary version number
 * @returns {number} Current version number
 */
// $FlowFixMe[signature-verification-failure]
function get_current_running_summary_version() {
    const storage = get_running_summary_storage();
    return storage.current_version || 0;
}

/**
 * Get running scene summary by version number
 * @param {number} version - Version number to retrieve (defaults to current)
 * @returns {object|null} Version object or null if not found
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function get_running_summary(version /*: ?number */ = null) /*: ?Object */ {
    const storage = get_running_summary_storage();
    if (version === null) {
        version = storage.current_version;
    }

    const versions = storage.versions || [];
    return versions.find(v => v.version === version) || null;
}

/**
 * Get current running scene summary content
 * @returns {string} Current running summary content or empty string
 */
// $FlowFixMe[signature-verification-failure]
function get_current_running_summary_content() {
    const current = get_running_summary();
    return current ? current.content : "";
}

/**
 * Set current running scene summary version
 * @param {number} version - Version number to set as current
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function set_current_running_summary_version(version /*: number */) /*: void */ {
    const storage = get_running_summary_storage();
    const versions = storage.versions || [];

    // Verify version exists
    if (!versions.find(v => v.version === version)) {
        error(SUBSYSTEM.RUNNING, `Cannot set version ${version} as current - version not found`);
        return;
    }

    // $FlowFixMe[incompatible-type] - current_version can be any number, not just 0
    storage.current_version = version;
    saveChatDebounced();
    debug(SUBSYSTEM.RUNNING, `Set current running summary version to ${version}`);
}

/**
 * Add a new running scene summary version
 * @param {string} content - Summary content
 * @param {number} scene_count - Number of scenes included
 * @param {number} excluded_count - Number of scenes excluded
 * @param {number} prev_scene_index - Previous scene index (0 for first version)
 * @param {number} new_scene_index - New scene index being combined
 * @returns {number} New version number
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function add_running_summary_version(
    content /*: string */,
    scene_count /*: number */,
    excluded_count /*: number */,
    prev_scene_index /*: number */ = 0,
    new_scene_index /*: number */ = 0
) /*: number */ {
    const storage = get_running_summary_storage();
    const versions = storage.versions || [];

    // Find highest version number
    const max_version = versions.reduce((max, v) => Math.max(max, v.version), -1);
    const new_version = max_version + 1;

    const version_obj = {
        version: new_version,
        timestamp: Date.now(),
        content: content,
        scene_count: scene_count,
        excluded_count: excluded_count,
        prev_scene_index: prev_scene_index,
        new_scene_index: new_scene_index
    };

    versions.push(version_obj);
    storage.versions = versions;
    // $FlowFixMe[incompatible-type]
    storage.current_version = new_version;

    saveChatDebounced();
    debug(SUBSYSTEM.RUNNING, `Created running summary version ${new_version} (${prev_scene_index} > ${new_scene_index})`);

    // Update the UI dropdown to reflect the new version
    if (typeof window.updateVersionSelector === 'function') {
        window.updateVersionSelector();
    }

    return new_version;
}

/**
 * Delete a running scene summary version
 * @param {number} version - Version number to delete
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function delete_running_summary_version(version /*: number */) /*: void */ {
    const storage = get_running_summary_storage();
    const versions = storage.versions || [];

    const index = versions.findIndex(v => v.version === version);
    if (index === -1) {
        error(SUBSYSTEM.RUNNING, `Cannot delete version ${version} - version not found`);
        return;
    }

    versions.splice(index, 1);
    storage.versions = versions;

    // If we deleted the current version, set to latest remaining version
    if (storage.current_version === version) {
        if (versions.length > 0) {
            const latest = versions.reduce((max, v) => Math.max(max, v.version), -1);
            // $FlowFixMe[incompatible-type]
            storage.current_version = latest;
        } else {
            storage.current_version = 0;
        }
    }

    saveChatDebounced();
    debug(SUBSYSTEM.RUNNING, `Deleted running summary version ${version}`);
}

/**
 * Clear all running scene summary versions for the current chat
 * @returns {number} Number of versions removed
 */
function clear_running_scene_summaries() {
    const storage = chat_metadata.auto_summarize_running_scene_summaries;
    const existingVersions = Array.isArray(storage?.versions) ? storage.versions.length : 0;
    const hadState = storage && (existingVersions > 0 || (storage.current_version ?? 0) !== 0);

    if (!hadState) {
        return 0;
    }

    chat_metadata.auto_summarize_running_scene_summaries = {
        current_version: 0,
        versions: [],
    };

    saveMetadata();
    debug(SUBSYSTEM.RUNNING, `Cleared ${existingVersions} running scene summary version(s)`);
    return existingVersions;
}

/**
 * Collect scene summary indexes based on settings
 * @returns {Array} Array of message indexes with scene summaries
 */
// $FlowFixMe[signature-verification-failure]
function collect_scene_summary_indexes_for_running() {
    const ctx = getContext();
    const chat = ctx.chat;
    const exclude_latest = get_settings('running_scene_summary_exclude_latest') || 0;

    const indexes = [];
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (get_data(msg, 'scene_summary_memory')) {
            indexes.push(i);
        }
    }

    // Exclude latest N scenes if configured
    if (exclude_latest > 0 && indexes.length > exclude_latest) {
        const to_remove = indexes.slice(-exclude_latest);
        // $FlowFixMe[incompatible-type]
        debug(SUBSYSTEM.RUNNING, `Excluding latest ${exclude_latest} scene(s) from running summary: indexes ${to_remove}`);
        return indexes.slice(0, -exclude_latest);
    }

    return indexes;
}

/**
 * Extract summary text from a scene summary, handling JSON format
 * @param {string} scene_summary - Raw scene summary (may be JSON)
 * @returns {string} Extracted summary text
 */
function extractSummaryText(scene_summary /*: string */) /*: string */ {
    let summary_text = scene_summary;

    // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
    let json_to_parse = scene_summary.trim();
    const code_fence_match = json_to_parse.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (code_fence_match) {
        json_to_parse = code_fence_match[1].trim();
    }

    try {
        const parsed = JSON.parse(json_to_parse);
        if (parsed && typeof parsed === 'object') {
            if (parsed.summary) {
                summary_text = parsed.summary;
            } else {
                // Valid JSON but no 'summary' property - use empty string
                summary_text = "";
            }
        }
    } catch {
        // Not JSON or parsing failed - use the whole text as-is
    }

    return summary_text;
}

/**
 * Build formatted text from scene summaries
 * @param {Array<number>} indexes - Message indexes containing scene summaries
 * @param {Array<Object>} chat - Chat messages
 * @returns {string} Formatted scene summaries text
 */
function buildSceneSummariesText(indexes /*: Array<number> */, chat /*: Array<any> */) /*: string */ {
    return indexes.map((idx, i) => {
        const msg = chat[idx];
        const scene_summary = get_data(msg, 'scene_summary_memory') || "";
        const name = get_data(msg, 'scene_break_name') || `Scene ${i + 1}`;
        const summary_text = extractSummaryText(scene_summary);
        return `[Scene ${i + 1}: ${name}]\n${summary_text}`;
    }).join('\n\n');
}

/**
 * Replace macros and Handlebars conditionals in prompt
 * @param {string} prompt - Template prompt
 * @param {string|null} current_summary - Current running summary or null
 * @param {string} scene_summaries_text - Formatted scene summaries
 * @param {string|null} prefill - Optional prefill text
 * @returns {string} Processed prompt
 */
function processPromptMacros(
    prompt /*: string */,
    current_summary /*: ?string */,
    scene_summaries_text /*: string */,
    prefill /*: ?string */
) /*: string */ {
    // Replace macros
    let processed = prompt.replace(/\{\{current_running_summary\}\}/g, current_summary || "");
    processed = processed.replace(/\{\{scene_summaries\}\}/g, scene_summaries_text);

    // Handle Handlebars conditionals manually (simplified)
    if (current_summary) {
        processed = processed.replace(/\{\{#if current_running_summary\}\}/g, '');
        processed = processed.replace(/\{\{\/if\}\}/g, '');
    } else {
        // Remove the conditional block if no current summary
        processed = processed.replace(/\{\{#if current_running_summary\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }

    // Add prefill if configured
    if (prefill) {
        processed = `${processed}\n${prefill}`;
    }

    return processed;
}

/**
 * Generate running scene summary by combining individual scene summaries
 * @returns {Promise<string|null>} Generated summary or null on failure
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
async function generate_running_scene_summary(skipQueue /*: boolean */ = false) /*: Promise<?string> */ {
    const ctx = getContext();
    const chat = ctx.chat;

    // Queue running scene summary generation unless explicitly skipped
    if (!skipQueue) {
        debug(SUBSYSTEM.RUNNING, '[Queue] Queueing running scene summary generation');

        // Import queue integration
        const { queueGenerateRunningSummary } = await import('./queueIntegration.js');

        // Queue the running scene summary generation
        const operationId = await queueGenerateRunningSummary();

        if (operationId) {
            log(SUBSYSTEM.RUNNING, '[Queue] Queued running scene summary generation:', operationId);
            toast('Queued running scene summary generation', 'info');
            return null; // Operation will be processed by queue
        }

        debug(SUBSYSTEM.RUNNING, '[Queue] Failed to queue operation, falling back to direct execution');
    }

    // Fallback to direct execution if queueing was skipped or failed
    debug(SUBSYSTEM.RUNNING, 'Executing running scene summary generation directly (queue skipped or unavailable)');

    debug(SUBSYSTEM.RUNNING, 'Starting running scene summary generation');

    // Collect scene summary indexes
    const indexes = collect_scene_summary_indexes_for_running();
    const exclude_count = get_settings('running_scene_summary_exclude_latest') || 0;

    if (indexes.length === 0) {
        debug(SUBSYSTEM.RUNNING, 'No scene summaries available for running summary');
        return null;
    }

    debug(SUBSYSTEM.RUNNING, `Found ${indexes.length} scene summaries (excluding latest ${exclude_count})`);

    // Build scene summaries text (extract only 'summary' field, exclude 'lorebooks')
    const scene_summaries_text = buildSceneSummariesText(indexes, chat);

    // Get current running summary if exists
    const current_summary = get_current_running_summary_content();

    // Build prompt with macro replacement
    const template = get_settings('running_scene_summary_prompt') || running_scene_summary_prompt;
    const prefill = get_settings('running_scene_summary_prefill');
    const prompt = processPromptMacros(template, current_summary, scene_summaries_text, prefill);

    // Get connection profile and preset settings
    const running_preset = get_settings('running_scene_summary_completion_preset');
    const running_profile = get_settings('running_scene_summary_connection_profile');

    // Execute with connection profile/preset switching
    const { withConnectionSettings } = await import('./connectionSettingsManager.js');

    try {
        // Add new version - for bulk generation, track from 0 to last scene index
        const last_scene_idx = indexes.length > 0 ? indexes[indexes.length - 1] : 0;

        const result = await withConnectionSettings(
            running_profile,
            running_preset,
            async () => {
                debug(SUBSYSTEM.RUNNING, 'Sending running scene summary prompt to LLM');

                // Set operation context for ST_METADATA
                const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
                setOperationSuffix(`-0-${last_scene_idx}`);

                try {
                    // Generate summary using the configured API
                    const summaryResult = await summarize_text(prompt);

                    debug(SUBSYSTEM.RUNNING, `Generated running summary (${summaryResult.length} chars)`);

                    return summaryResult;
                } finally {
                    clearOperationSuffix();
                }
            }
        );
        const version = add_running_summary_version(result, indexes.length, exclude_count, 0, last_scene_idx);

        log(SUBSYSTEM.RUNNING, `Created running scene summary version ${version} (0 > ${last_scene_idx})`);

        toast(`Running scene summary updated (v${version})`, 'success');

        return result;

    } catch (err) {
        error(SUBSYSTEM.RUNNING, 'Failed to generate running scene summary:', err);
        // Re-throw to let queue retry logic handle it (don't return null)
        throw err;
    }
}

/**
 * Validates combine request and extracts scene data
 * @param {number} scene_index - Scene index
 * @returns {Object|null} Scene data or null if invalid
 */
function validateCombineRequest(scene_index /*: number */) /*: ?Object */ {
    const ctx = getContext();
    const chat = ctx.chat;
    const message = chat[scene_index];

    if (!message) {
        error(SUBSYSTEM.RUNNING, `No message at index ${scene_index}`);
        return null;
    }

    const scene_summary = get_data(message, 'scene_summary_memory');
    if (!scene_summary) {
        error(SUBSYSTEM.RUNNING, `No scene summary at index ${scene_index}`);
        return null;
    }

    const scene_name = get_data(message, 'scene_break_name') || `Scene #${scene_index}`;

    return { message, scene_summary, scene_name };
}

/**
 * Extracts summary text from JSON scene summary
 * @param {string} scene_summary - Scene summary (may be JSON)
 * @returns {string} Extracted summary text
 */
function extractSummaryFromJSON(scene_summary /*: string */) /*: string */ {
    let summary_text = scene_summary;

    // Strip markdown code fences if present
    let json_to_parse = scene_summary.trim();
    const code_fence_match = json_to_parse.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (code_fence_match) {
        json_to_parse = code_fence_match[1].trim();
        debug(SUBSYSTEM.RUNNING, `Stripped markdown code fences from scene summary`);
    }

    try {
        const parsed = JSON.parse(json_to_parse);
        if (parsed && typeof parsed === 'object') {
            if (parsed.summary) {
                summary_text = parsed.summary;
                debug(SUBSYSTEM.RUNNING, `Extracted summary field from JSON (${summary_text.length} chars, excluding lorebooks)`);
            } else {
                summary_text = "";
                debug(SUBSYSTEM.RUNNING, `Scene summary is JSON but missing 'summary' property, using empty string`);
            }
        }
    } catch (err) {
        debug(SUBSYSTEM.RUNNING, `Scene summary is not JSON, using as-is: ${err.message}`);
    }

    return summary_text;
}

/**
 * Builds combine prompt with macros replaced
 * @param {string} current_summary - Current running summary
 * @param {string} scene_summaries_text - Scene summaries text
 * @returns {string} Built prompt
 */
function buildCombinePrompt(current_summary /*: string */, scene_summaries_text /*: string */) /*: string */ {
    let prompt = get_settings('running_scene_summary_prompt') || running_scene_summary_prompt;

    // Replace macros
    prompt = prompt.replace(/\{\{current_running_summary\}\}/g, current_summary || "");
    prompt = prompt.replace(/\{\{scene_summaries\}\}/g, scene_summaries_text);

    // Handle Handlebars conditionals
    if (current_summary) {
        prompt = prompt.replace(/\{\{#if current_running_summary\}\}/g, '');
        prompt = prompt.replace(/\{\{\/if\}\}/g, '');
    } else {
        prompt = prompt.replace(/\{\{#if current_running_summary\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }

    // Add prefill if configured
    const prefill = get_settings('running_scene_summary_prefill');
    if (prefill) {
        prompt = `${prompt}\n${prefill}`;
    }

    return prompt;
}

/**
 * Executes LLM call with preset switching
 * @param {string} prompt - Prompt to send
 * @param {string} scene_name - Scene name for logging
 * @param {number} scene_index - Scene index for context
 * @returns {Promise<string>} Generated summary
 */
async function executeCombineLLMCall(prompt /*: string */, scene_name /*: string */, scene_index /*: number */) /*: Promise<string> */ {
    // Get connection profile and preset settings
    const running_preset = get_settings('running_scene_summary_completion_preset');
    const running_profile = get_settings('running_scene_summary_connection_profile');

    // Execute with connection profile/preset switching
    const { withConnectionSettings } = await import('./connectionSettingsManager.js');

    return await withConnectionSettings(
        running_profile,
        running_preset,
        async () => {
            debug(SUBSYSTEM.RUNNING, `Sending prompt to LLM to combine with ${scene_name}`);

            // Set operation context for ST_METADATA
            const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
            const prev_version = get_running_summary(get_current_running_summary_version());
            const prev_scene_idx = prev_version ? prev_version.new_scene_index : 0;
            setOperationSuffix(`-${prev_scene_idx}-${scene_index}`);

            try {
                const result = await summarize_text(prompt);

                debug(SUBSYSTEM.RUNNING, `Combined running summary with scene (${result.length} chars)`);

                return result;
            } finally {
                clearOperationSuffix();
            }
        }
    );
}

/**
 * Stores running summary version and handles lorebook processing
 * @param {string} result - Generated summary
 * @param {number} scene_index - Scene index
 * @param {string} scene_name - Scene name
 * @param {string} _scene_summary - Original scene summary (unused)
 * @returns {number} Version number
 */
function storeRunningSummary(result /*: string */, scene_index /*: number */, scene_name /*: string */, _scene_summary /*: string */) /*: number */ {
    const prev_version = get_running_summary(get_current_running_summary_version());
    const scene_count = prev_version ? prev_version.scene_count + 1 : 1;
    const exclude_count = get_settings('running_scene_summary_exclude_latest') || 0;

    const prev_scene_idx = prev_version ? prev_version.new_scene_index : 0;
    const new_scene_idx = scene_index;

    const version = add_running_summary_version(result, scene_count, exclude_count, prev_scene_idx, new_scene_idx);

    log(SUBSYSTEM.RUNNING, `Created running summary version ${version} (${prev_scene_idx} > ${new_scene_idx})`);

    // Lorebook processing is intentionally disabled during running summary combination
    // Lorebook extraction is handled per individual scene summary instead
    debug(SUBSYSTEM.RUNNING, 'Skipping lorebook processing during running summary; handled per scene summary');

    toast(`Running summary updated with ${scene_name} (v${version})`, 'success');

    return version;
}

/**
 * Combine current running summary with a specific scene summary
 * Creates a new version by merging them
 * @param {number} scene_index - Chat message index of the scene to combine
 * @returns {Promise<string|null>} Generated summary or null on failure
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
async function combine_scene_with_running_summary(scene_index /*: number */) /*: Promise<?string> */ {
    const sceneData = validateCombineRequest(scene_index);
    if (!sceneData) {
        return null;
    }

    const { scene_summary, scene_name } = sceneData;

    debug(SUBSYSTEM.RUNNING, `Combining running summary with scene at index ${scene_index} (${scene_name})`);

    const summary_text = extractSummaryFromJSON(scene_summary);
    const current_summary = get_current_running_summary_content();
    const scene_summaries_text = `[${scene_name}]\n${summary_text}`;

    const prompt = buildCombinePrompt(current_summary, scene_summaries_text);

    try {
        const result = await executeCombineLLMCall(prompt, scene_name, scene_index);
        storeRunningSummary(result, scene_index, scene_name, scene_summary);
        return result;

    } catch (err) {
        error(SUBSYSTEM.RUNNING, 'Failed to combine scene with running summary:', err);
        throw err;
    }
}

/**
 * Auto-generate running scene summary if enabled
 * Called after scene summary is created/updated
 * @param {number} scene_index - Index of the scene that was just summarized
 */
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
async function auto_generate_running_summary(scene_index /*: ?number */ = null) /*: Promise<void> */ {
    if (!get_settings('running_scene_summary_auto_generate')) return;

    debug(SUBSYSTEM.RUNNING, 'Auto-generating running scene summary for scene index:', scene_index);

    // Check if we have any existing versions
    const versions = get_running_summary_versions();
    const hasExistingVersions = versions.length > 0;

    if (hasExistingVersions && scene_index !== null) {
        // Use incremental combine to add this scene to the existing running summary
        debug(SUBSYSTEM.RUNNING, 'Existing running summary found, using incremental combine');
        // $FlowFixMe[incompatible-type] - scene_index is not null here due to condition above
        await combine_scene_with_running_summary(scene_index);
    } else {
        // No existing summary or no scene index provided - do bulk regeneration
        debug(SUBSYSTEM.RUNNING, 'No existing running summary or no scene index, doing bulk regeneration');
        await generate_running_scene_summary();
    }

    // Update UI dropdown if available
    // $FlowFixMe[cannot-resolve-name]
    if (typeof window.updateVersionSelector === 'function') {
        // $FlowFixMe[cannot-resolve-name]
        window.updateVersionSelector();
        debug(SUBSYSTEM.RUNNING, 'Updated version selector UI');
    }
}

/**
 * Clean up running summary versions that reference deleted messages
 * Should be called after messages are deleted
 */
function cleanup_invalid_running_summaries() {
    const ctx = getContext();
    const chat = ctx.chat;
    const storage = get_running_summary_storage();
    const versions = storage.versions || [];

    if (versions.length === 0) {
        debug(SUBSYSTEM.RUNNING, 'No running summary versions to clean up');
        return;
    }

    // Get all valid scene summary indexes
    const valid_scene_indexes = [];
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (get_data(msg, 'scene_summary_memory')) {
            valid_scene_indexes.push(i);
        }
    }

    debug(SUBSYSTEM.RUNNING, `Valid scene indexes: ${valid_scene_indexes.join(', ')}`);

    // Find versions that reference deleted messages
    const versions_to_delete = [];
    for (const version of versions) {
        const new_scene_idx = version.new_scene_index ?? 0;

        // Check if the new_scene_index still exists and has a scene summary
        // If new_scene_idx >= chat.length, the message was deleted
        // If the message exists but has no scene summary, it was deleted or the summary was removed
        if (new_scene_idx >= chat.length || !get_data(chat[new_scene_idx], 'scene_summary_memory')) {
            versions_to_delete.push(version.version);
            debug(SUBSYSTEM.RUNNING, `Version ${version.version} references invalid scene at index ${new_scene_idx}`);
        }
    }

    // Delete invalid versions
    if (versions_to_delete.length > 0) {
        log(SUBSYSTEM.RUNNING, `Cleaning up ${versions_to_delete.length} invalid running summary version(s)`);

        for (const version_num of versions_to_delete) {
            delete_running_summary_version(version_num);
        }

        // After cleanup, if current version was deleted, it will be auto-set to the latest
        // But we should also verify that the new current version is valid
        const current_version = get_current_running_summary_version();
        const current = get_running_summary(current_version);

        if (current && current.new_scene_index >= chat.length) {
            // Current version is still invalid, find the most recent valid one
            const remaining_versions = get_running_summary_versions();
            if (remaining_versions.length > 0) {
                const valid_versions = remaining_versions.filter(v =>
                    v.new_scene_index < chat.length &&
                    get_data(chat[v.new_scene_index], 'scene_summary_memory')
                );

                if (valid_versions.length > 0) {
                    const latest_valid = valid_versions.reduce((max, v) =>
                        v.version > max.version ? v : max
                    );
                    set_current_running_summary_version(latest_valid.version);
                    log(SUBSYSTEM.RUNNING, `Set current version to ${latest_valid.version} after cleanup`);
                }
            }
        }

        toast(`Cleaned up ${versions_to_delete.length} invalid running summary version(s)`, 'info');
    } else {
        debug(SUBSYSTEM.RUNNING, 'No invalid running summary versions found');
    }
}

/**
 * Get running scene summary injection text for memory
 * @returns {string} Formatted injection text
 */
// $FlowFixMe[signature-verification-failure]
function get_running_summary_injection() {
    const current = get_running_summary();
    if (!current || !current.content) {
        return "";
    }

    const template = get_settings('running_scene_summary_template') || "";
    if (!template.trim()) {
        // Fallback to simple format
        return current.content;
    }

    return template.replace(/\{\{running_summary\}\}/g, current.content);
}

export {
    get_running_summary_versions,
    get_current_running_summary_version,
    get_running_summary,
    get_current_running_summary_content,
    set_current_running_summary_version,
    add_running_summary_version,
    delete_running_summary_version,
    clear_running_scene_summaries,
    collect_scene_summary_indexes_for_running,
    generate_running_scene_summary,
    combine_scene_with_running_summary,
    auto_generate_running_summary,
    get_running_summary_injection,
    cleanup_invalid_running_summaries,
};

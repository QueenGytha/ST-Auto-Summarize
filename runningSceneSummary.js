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
    get_current_preset,
    set_preset,
    get_current_connection_profile,
    set_connection_profile,
    running_scene_summary_prompt,
} from './index.js';

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
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function get_running_summary(version /*: any */ = null) {
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
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function set_current_running_summary_version(version /*: any */) {
    const storage = get_running_summary_storage();
    const versions = storage.versions || [];

    // Verify version exists
    if (!versions.find(v => v.version === version)) {
        error(SUBSYSTEM.RUNNING, `Cannot set version ${version} as current - version not found`);
        return;
    }

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
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function add_running_summary_version(content /*: any */, scene_count /*: any */, excluded_count /*: any */, prev_scene_index /*: any */ = 0, new_scene_index /*: any */ = 0) {
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

    return new_version;
}

/**
 * Delete a running scene summary version
 * @param {number} version - Version number to delete
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function delete_running_summary_version(version /*: any */) {
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
 * Generate running scene summary by combining individual scene summaries
 * @returns {Promise<string|null>} Generated summary or null on failure
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
async function generate_running_scene_summary(skipQueue /*: any */ = false) {
    if (!get_settings('running_scene_summary_enabled')) {
        debug(SUBSYSTEM.RUNNING, 'Running scene summary disabled, skipping generation');
        return null;
    }

    const ctx = getContext();
    const chat = ctx.chat;

    // Check if operation queue is enabled
    const queueEnabled = get_settings('operation_queue_enabled') !== false;
    if (queueEnabled && !skipQueue) {
        debug(SUBSYSTEM.RUNNING, '[Queue] Operation queue enabled, queueing running scene summary generation');

        // Import queue integration
        const { queueGenerateRunningSummary } = await import('./queueIntegration.js');

        // Queue the running scene summary generation
        const operationId = queueGenerateRunningSummary();

        if (operationId) {
            log(SUBSYSTEM.RUNNING, '[Queue] Queued running scene summary generation:', operationId);
            toast('Queued running scene summary generation', 'info');
            return null; // Operation will be processed by queue
        }

        debug(SUBSYSTEM.RUNNING, '[Queue] Failed to queue operation, falling back to direct execution');
    }

    // Fallback to direct execution if queue disabled or queueing failed
    debug(SUBSYSTEM.RUNNING, 'Executing running scene summary generation directly (queue disabled or unavailable)');

    debug(SUBSYSTEM.RUNNING, 'Starting running scene summary generation');

    // Collect scene summary indexes
    const indexes = collect_scene_summary_indexes_for_running();
    const exclude_count = get_settings('running_scene_summary_exclude_latest') || 0;

    if (indexes.length === 0) {
        debug(SUBSYSTEM.RUNNING, 'No scene summaries available for running summary');
        return null;
    }

    debug(SUBSYSTEM.RUNNING, `Found ${indexes.length} scene summaries (excluding latest ${exclude_count})`);

    // Build scene summaries text
    const scene_summaries_text = indexes.map((idx, i) => {
        const msg = chat[idx];
        const summary = get_data(msg, 'scene_summary_memory') || "";
        const name = get_data(msg, 'scene_break_name') || `Scene ${i + 1}`;
        return `[Scene ${i + 1}: ${name}]\n${summary}`;
    }).join('\n\n');

    // Get current running summary if exists
    const current_summary = get_current_running_summary_content();

    // Build prompt
    let prompt = get_settings('running_scene_summary_prompt') || running_scene_summary_prompt;

    // Replace macros
    prompt = prompt.replace(/\{\{current_running_summary\}\}/g, current_summary || "");
    prompt = prompt.replace(/\{\{scene_summaries\}\}/g, scene_summaries_text);

    // Handle Handlebars conditionals manually (simplified)
    if (current_summary) {
        prompt = prompt.replace(/\{\{#if current_running_summary\}\}/g, '');
        prompt = prompt.replace(/\{\{\/if\}\}/g, '');
    } else {
        // Remove the conditional block if no current summary
        prompt = prompt.replace(/\{\{#if current_running_summary\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }

    // Add prefill if configured
    const prefill = get_settings('running_scene_summary_prefill');
    if (prefill) {
        prompt = `${prompt}\n${prefill}`;
    }

    // Save current preset/profile
    const current_preset = await get_current_preset();
    const current_profile = await get_current_connection_profile();

    try {
        // Set running summary preset/profile if configured
        const running_preset = get_settings('running_scene_summary_completion_preset');
        const running_profile = get_settings('running_scene_summary_connection_profile');

        if (running_preset) {
            await set_preset(running_preset);
        }
        if (running_profile) {
            await set_connection_profile(running_profile);
        }

        debug(SUBSYSTEM.RUNNING, 'Sending running scene summary prompt to LLM');

        // Generate summary
        const result = await summarize_text(prompt);

        debug(SUBSYSTEM.RUNNING, `Generated running summary (${result.length} chars)`);

        // Add new version - for bulk generation, track from 0 to last scene index
        const last_scene_idx = indexes.length > 0 ? indexes[indexes.length - 1] : 0;
        const version = add_running_summary_version(result, indexes.length, exclude_count, 0, last_scene_idx);

        log(SUBSYSTEM.RUNNING, `Created running scene summary version ${version} (0 > ${last_scene_idx})`);

        toast(`Running scene summary updated (v${version})`, 'success');

        return result;

    } catch (err) {
        error(SUBSYSTEM.RUNNING, 'Failed to generate running scene summary:', err);
        return null;
    } finally {
        // Restore original preset/profile
        await set_preset(current_preset);
        await set_connection_profile(current_profile);
    }
}

/**
 * Combine current running summary with a specific scene summary
 * Creates a new version by merging them
 * @param {number} scene_index - Chat message index of the scene to combine
 * @returns {Promise<string|null>} Generated summary or null on failure
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
async function combine_scene_with_running_summary(scene_index /*: any */) {
    if (!get_settings('running_scene_summary_enabled')) {
        debug(SUBSYSTEM.RUNNING, 'Running scene summary disabled, skipping combination');
        return null;
    }

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

    debug(SUBSYSTEM.RUNNING, `Combining running summary with scene at index ${scene_index} (${scene_name})`);

    // Get current running summary
    const current_summary = get_current_running_summary_content();

    // Build scene summaries text (just this one scene)
    const scene_summaries_text = `[${scene_name}]\n${scene_summary}`;

    // Build prompt
    let prompt = get_settings('running_scene_summary_prompt') || running_scene_summary_prompt;

    // Replace macros
    prompt = prompt.replace(/\{\{current_running_summary\}\}/g, current_summary || "");
    prompt = prompt.replace(/\{\{scene_summaries\}\}/g, scene_summaries_text);

    // Handle Handlebars conditionals manually (simplified)
    if (current_summary) {
        prompt = prompt.replace(/\{\{#if current_running_summary\}\}/g, '');
        prompt = prompt.replace(/\{\{\/if\}\}/g, '');
    } else {
        // Remove the conditional block if no current summary
        prompt = prompt.replace(/\{\{#if current_running_summary\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }

    // Add prefill if configured
    const prefill = get_settings('running_scene_summary_prefill');
    if (prefill) {
        prompt = `${prompt}\n${prefill}`;
    }

    // Save current preset/profile
    const current_preset = await get_current_preset();
    const current_profile = await get_current_connection_profile();

    try {
        // Set running summary preset/profile if configured
        const running_preset = get_settings('running_scene_summary_completion_preset');
        const running_profile = get_settings('running_scene_summary_connection_profile');

        if (running_preset) {
            await set_preset(running_preset);
        }
        if (running_profile) {
            await set_connection_profile(running_profile);
        }

        debug(SUBSYSTEM.RUNNING, `Sending prompt to LLM to combine with ${scene_name}`);

        // Generate summary
        const result = await summarize_text(prompt);

        debug(SUBSYSTEM.RUNNING, `Combined running summary with scene (${result.length} chars)`);

        // Add new version
        const prev_version = get_running_summary(get_current_running_summary_version());
        const scene_count = prev_version ? prev_version.scene_count + 1 : 1;
        const exclude_count = get_settings('running_scene_summary_exclude_latest') || 0;

        // Track scene indexes: prev is from previous version's new_scene_index, or 0 if first
        const prev_scene_idx = prev_version ? prev_version.new_scene_index : 0;
        const new_scene_idx = scene_index;

        const version = add_running_summary_version(result, scene_count, exclude_count, prev_scene_idx, new_scene_idx);

        log(SUBSYSTEM.RUNNING, `Created running summary version ${version} (${prev_scene_idx} > ${new_scene_idx})`);

        toast(`Running summary updated with ${scene_name} (v${version})`, 'success');

        return result;

    } catch (err) {
        error(SUBSYSTEM.RUNNING, 'Failed to combine scene with running summary:', err);
        return null;
    } finally {
        // Restore original preset/profile
        await set_preset(current_preset);
        await set_connection_profile(current_profile);
    }
}

/**
 * Auto-generate running scene summary if enabled
 * Called after scene summary is created/updated
 * @param {number} scene_index - Index of the scene that was just summarized
 */
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
async function auto_generate_running_summary(scene_index /*: any */ = null) {
    if (!get_settings('running_scene_summary_enabled')) return;
    if (!get_settings('running_scene_summary_auto_generate')) return;

    debug(SUBSYSTEM.RUNNING, 'Auto-generating running scene summary for scene index:', scene_index);

    // Check if we have any existing versions
    const versions = get_running_summary_versions();
    const hasExistingVersions = versions.length > 0;

    if (hasExistingVersions && scene_index !== null) {
        // Use incremental combine to add this scene to the existing running summary
        debug(SUBSYSTEM.RUNNING, 'Existing running summary found, using incremental combine');
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
    if (!get_settings('running_scene_summary_enabled')) {
        return "";
    }

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
    collect_scene_summary_indexes_for_running,
    generate_running_scene_summary,
    combine_scene_with_running_summary,
    auto_generate_running_summary,
    get_running_summary_injection,
    cleanup_invalid_running_summaries,
};

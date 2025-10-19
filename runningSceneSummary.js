import {
    get_settings,
    set_settings,
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
function get_running_summary_versions() {
    const storage = get_running_summary_storage();
    return storage.versions || [];
}

/**
 * Get current running scene summary version number
 * @returns {number} Current version number
 */
function get_current_running_summary_version() {
    const storage = get_running_summary_storage();
    return storage.current_version || 0;
}

/**
 * Get running scene summary by version number
 * @param {number} version - Version number to retrieve (defaults to current)
 * @returns {object|null} Version object or null if not found
 */
function get_running_summary(version = null) {
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
function get_current_running_summary_content() {
    const current = get_running_summary();
    return current ? current.content : "";
}

/**
 * Set current running scene summary version
 * @param {number} version - Version number to set as current
 */
function set_current_running_summary_version(version) {
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
function add_running_summary_version(content, scene_count, excluded_count, prev_scene_index = 0, new_scene_index = 0) {
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
    storage.current_version = new_version;

    saveChatDebounced();
    debug(SUBSYSTEM.RUNNING, `Created running summary version ${new_version} (${prev_scene_index} > ${new_scene_index})`);

    return new_version;
}

/**
 * Delete a running scene summary version
 * @param {number} version - Version number to delete
 */
function delete_running_summary_version(version) {
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
        debug(SUBSYSTEM.RUNNING, `Excluding latest ${exclude_latest} scene(s) from running summary: indexes ${to_remove}`);
        return indexes.slice(0, -exclude_latest);
    }

    return indexes;
}

/**
 * Generate running scene summary by combining individual scene summaries
 * @returns {Promise<string|null>} Generated summary or null on failure
 */
async function generate_running_scene_summary() {
    if (!get_settings('running_scene_summary_enabled')) {
        debug(SUBSYSTEM.RUNNING, 'Running scene summary disabled, skipping generation');
        return null;
    }

    const ctx = getContext();
    const chat = ctx.chat;

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

        // Show toast if enabled
        if (get_settings('show_combined_summary_toast')) {
            toast(`Running scene summary updated (v${version})`, 'success');
        }

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
async function combine_scene_with_running_summary(scene_index) {
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

        // Show toast if enabled
        if (get_settings('show_combined_summary_toast')) {
            toast(`Running summary updated with ${scene_name} (v${version})`, 'success');
        }

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
async function auto_generate_running_summary(scene_index = null) {
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
    if (typeof window.updateVersionSelector === 'function') {
        window.updateVersionSelector();
        debug(SUBSYSTEM.RUNNING, 'Updated version selector UI');
    }
}

/**
 * Get running scene summary injection text for memory
 * @returns {string} Formatted injection text
 */
function get_running_summary_injection() {
    if (!get_settings('running_scene_summary_enabled')) {
        return "";
    }

    const current = get_running_summary();
    if (!current || !current.content) {
        return "";
    }

    let template = get_settings('running_scene_summary_template') || "";
    if (!template.trim()) {
        // Fallback to simple format
        return current.content;
    }

    const injection = template.replace(/\{\{running_summary\}\}/g, current.content);
    return injection;
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
};

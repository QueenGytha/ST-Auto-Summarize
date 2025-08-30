import {
    getContext,
    get_settings,
    debug,
    get_data
} from './index.js';

async function auto_hide_messages_by_command() {
    let ctx = getContext();
    let auto_hide_age = get_settings('auto_hide_message_age');
    let auto_hide_scene_count = get_settings('auto_hide_scene_count');
    let chat = ctx.chat;

    let to_hide = new Set();
    let to_unhide = new Set();

    // --- Standard message age-based auto-hide ---
    if (auto_hide_age >= 0) {
        let cutoff = chat.length - auto_hide_age;
        for (let i = 0; i < chat.length; i++) {
            if (i < cutoff) {
                to_hide.add(i);
            } else {
                to_unhide.add(i);
            }
        }
    } else {
        // If disabled, unhide all
        for (let i = 0; i < chat.length; i++) {
            to_unhide.add(i);
        }
    }

    // --- Scene-based auto-hide ---
    if (auto_hide_scene_count >= 0) {
        // Find all visible scene breaks
        let scene_break_indexes = [];
        for (let i = 0; i < chat.length; i++) {
            if (get_data(chat[i], 'scene_break') && get_data(chat[i], 'scene_break_visible') !== false) {
                scene_break_indexes.push(i);
            }
        }
        // Only keep the last N scenes visible
        let scenes_to_keep = auto_hide_scene_count;
        if (scene_break_indexes.length >= scenes_to_keep) {
            let first_visible_scene = scene_break_indexes.length - scenes_to_keep;
            let visible_start = scene_break_indexes[first_visible_scene] + 1; // Start after the scene break

            // Hide all messages before visible_start (including scene breaks)
            for (let i = 0; i < visible_start; i++) {
                to_hide.add(i);
                to_unhide.delete(i);
            }

            // Unhide all messages from visible_start onwards
            for (let i = visible_start; i < chat.length; i++) {
                to_unhide.add(i);
                to_hide.delete(i);
            }
        }
    }

    // Convert sets to sorted arrays for batching
    let to_hide_arr = Array.from(to_hide).sort((a, b) => a - b);
    let to_unhide_arr = Array.from(to_unhide).sort((a, b) => a - b);

    // Hide in contiguous ranges
    if (to_hide_arr.length > 0) {
        let batchStart = null;
        let last = null;
        for (let i = 0; i < to_hide_arr.length; i++) {
            if (batchStart === null) batchStart = to_hide_arr[i];
            if (last !== null && to_hide_arr[i] !== last + 1) {
                if (batchStart === last) {
                    debug(`[auto_hide] Hiding message ${batchStart}`);
                    await ctx.executeSlashCommandsWithOptions(`/hide ${batchStart}`);
                } else {
                    debug(`[auto_hide] Hiding messages ${batchStart}-${last}`);
                    await ctx.executeSlashCommandsWithOptions(`/hide ${batchStart}-${last}`);
                }
                batchStart = to_hide_arr[i];
            }
            last = to_hide_arr[i];
        }
        if (batchStart !== null) {
            if (batchStart === last) {
                debug(`[auto_hide] Hiding message ${batchStart}`);
                await ctx.executeSlashCommandsWithOptions(`/hide ${batchStart}`);
            } else {
                debug(`[auto_hide] Hiding messages ${batchStart}-${last}`);
                await ctx.executeSlashCommandsWithOptions(`/hide ${batchStart}-${last}`);
            }
        }
    }

    // Unhide in contiguous ranges
    if (to_unhide_arr.length > 0) {
        let batchStart = null;
        let last = null;
        for (let i = 0; i < to_unhide_arr.length; i++) {
            if (batchStart === null) batchStart = to_unhide_arr[i];
            if (last !== null && to_unhide_arr[i] !== last + 1) {
                if (batchStart === last) {
                    debug(`[auto_hide] Unhiding message ${batchStart}`);
                    await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}`);
                } else {
                    debug(`[auto_hide] Unhiding messages ${batchStart}-${last}`);
                    await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}-${last}`);
                }
                batchStart = to_unhide_arr[i];
            }
            last = to_unhide_arr[i];
        }
        if (batchStart !== null) {
            if (batchStart === last) {
                debug(`[auto_hide] Unhiding message ${batchStart}`);
                await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}`);
            } else {
                debug(`[auto_hide] Unhiding messages ${batchStart}-${last}`);
                await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}-${last}`);
            }
        }
    }

    // Wait a bit for SillyTavern to update the UI/backend
    debug("[auto_hide] Waiting for backend/UI update...");
    await new Promise(resolve => setTimeout(resolve, 200));
}

export {
    auto_hide_messages_by_command
}
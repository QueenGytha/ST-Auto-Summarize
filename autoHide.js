import {
    getContext,
    get_settings,
    debug
} from './index.js';

async function auto_hide_messages_by_command() {
    let ctx = getContext();
    let auto_hide_age = get_settings('auto_hide_message_age');
    if (auto_hide_age < 0) {
        debug("[auto_hide] Disabled (auto_hide_age < 0)");
        return;
    }

    let chat = ctx.chat;
    let cutoff = chat.length - auto_hide_age;
    let to_hide = [];
    let to_unhide = [];

    debug(`[auto_hide] Running. auto_hide_age=${auto_hide_age}, chat.length=${chat.length}, cutoff=${cutoff}`);

    for (let i = 0; i < chat.length; i++) {
        if (i < cutoff) {
            debug(`[auto_hide] Will hide message ${i}`);
            to_hide.push(i);
        } else {
            debug(`[auto_hide] Will unhide message ${i}`);
            to_unhide.push(i);
        }
    }

    // Hide in a single range if possible
    if (to_hide.length > 0) {
        let start = to_hide[0];
        let end = to_hide[to_hide.length - 1];
        debug(`[auto_hide] Hiding messages ${start}-${end}`);
        await ctx.executeSlashCommandsWithOptions(`/hide ${start}-${end}`);
    }

    // Batch unhide contiguous ranges
    if (to_unhide.length > 0) {
        let batchStart = null;
        let last = null;
        for (let i = 0; i < to_unhide.length; i++) {
            if (batchStart === null) batchStart = to_unhide[i];
            if (last !== null && to_unhide[i] !== last + 1) {
                // Send previous batch
                if (batchStart === last) {
                    debug(`[auto_hide] Unhiding message ${batchStart}`);
                    await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}`);
                } else {
                    debug(`[auto_hide] Unhiding messages ${batchStart}-${last}`);
                    await ctx.executeSlashCommandsWithOptions(`/unhide ${batchStart}-${last}`);
                }
                batchStart = to_unhide[i];
            }
            last = to_unhide[i];
        }
        // Send final batch
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
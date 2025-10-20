import {
    log,
    extension_settings,
    get_settings,
    getContext,
    chat_enabled,
    toggle_chat_enabled,
    refresh_memory,
    stop_summarization,
    get_memory,
    MODULE_NAME,
    hard_reset_settings,
    refresh_settings,
    settings_content_class,
    toggle_popout,
    memoryEditInterface,
    collect_scene_summary_indexes,
    get_scene_memory_injection,
    summarize_messages,
    collect_messages_to_auto_summarize,
    display_injection_preview,
    remember_message_toggle,
    forget_message_toggle,
    toast,
} from './index.js';

function initialize_slash_commands() {
    const ctx = getContext()
    const SlashCommandParser = ctx.SlashCommandParser
    const SlashCommand = ctx.SlashCommand
    const SlashCommandArgument = ctx.SlashCommandArgument
    // const SlashCommandNamedArgument = ctx.SlashCommandNamedArgument
    const ARGUMENT_TYPE = ctx.ARGUMENT_TYPE

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'auto_summarize_log_chat',
        callback: (_args) => {
            log(getContext())
            log(getContext().chat)
        },
        helpString: 'log chat',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'auto_summarize_log_settings',
        callback: async (_args) => {
            log(extension_settings[MODULE_NAME])
        },
        helpString: 'Log current settings',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'hard_reset',
        callback: (_args) => {
            hard_reset_settings()
            refresh_settings()
            refresh_memory()
        },
        helpString: 'Hard reset all settings',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'remember',
        callback: (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            remember_message_toggle(index);
        },
        helpString: 'Toggle the remember status of a message (default is the most recent message)',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to toggle',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'force_exclude_memory',
        callback: (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            forget_message_toggle(index);
        },
        helpString: 'Toggle the ememory exclusion status of a message (default is the most recent message)',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to toggle',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory',
        callback: (args, state) => {
            if (state === "") {  // if not provided the state is an empty string, but we need it to be null to get the default behavior
                state = null
            } else {
                state = state === "true"  // convert to boolean
            }

            toggle_chat_enabled(state);  // toggle the memory for the current chat
        },
        helpString: 'Change whether memory is enabled for the current chat. If no state is provided, it will toggle the current state.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Boolean value to set the memory state',
                isRequired: false,
                typeList: ARGUMENT_TYPE.BOOLEAN,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'get_memory_enabled',
        callback: (_args) => {
            return chat_enabled()
        },
        helpString: 'Return whether memory is currently enabled.'
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_display',
        callback: (_args) => {
            $(`.${settings_content_class} #display_memories`).click();  // toggle the memory display
        },
        helpString: "Toggle the \"display memories\" setting on the current profile (doesn't save the profile).",
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_popout',
        callback: (_args) => {
            toggle_popout()
        },
        helpString: 'Toggle the extension config popout',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_edit_interface',
        callback: (_args) => {
            memoryEditInterface.show()
        },
        helpString: 'Toggle the memory editing interface',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_injection_preview',
        callback: (_args) => {
            display_injection_preview()
        },
        helpString: 'Toggle a preview of the current memory injection',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'summarize_chat',
        helpString: 'Summarize the chat using the auto-summarization criteria, even if auto-summarization is off.',
        callback: async (_args, _limit) => {
            const indexes = collect_messages_to_auto_summarize()
            await summarize_messages(indexes);
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'summarize',
        callback: async (args, index) => {
            if (index === "") index = null  // if not provided the index is an empty string, but we need it to be null to get the default behavior
            await summarize_messages(index);  // summarize the message
            refresh_memory();
        },
        helpString: 'Summarize the given message index (defaults to most recent applicable message)',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message to summarize',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'stop_summarization',
        callback: (_args) => {
            stop_summarization()
        },
        helpString: 'Abort any summarization taking place.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'get_memory',
        callback: async (args, index) => {
            const chat = getContext().chat
            if (index === "") index = chat.length - 1
            return get_memory(chat[index])
        },
        helpString: 'Return the memory associated with a given message index. If no index given, assumes the most recent message.',
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'Index of the message',
                isRequired: false,
                typeList: ARGUMENT_TYPE.NUMBER,
            }),
        ],
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'log_scene_summary_injection',
        callback: () => {
            const settings = {
                scene_summary_enabled: get_settings('scene_summary_enabled'),
                scene_summary_position: get_settings('scene_summary_position'),
                scene_summary_role: get_settings('scene_summary_role'),
            };
            const indexes = collect_scene_summary_indexes();
            const injection = get_scene_memory_injection();
            log('[Scene Summary Injection] Settings:', settings);
            log('[Scene Summary Injection] Collected indexes:', indexes);
            log('[Scene Summary Injection] Injection text:', injection);
            return { settings, indexes, injection };
        },
        helpString: 'Log scene summary injection settings, collected indexes, and injection text.',
    }));

    // Queue management commands
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'queue-status',
        aliases: ['queue'],
        callback: async () => {
            const { getQueueStats } = await import('./operationQueue.js');
            const stats = getQueueStats();
            const message = `Queue Status:\n• Total: ${stats.total}\n• Pending: ${stats.pending}\n• Running: ${stats.in_progress}\n• Completed: ${stats.completed}\n• Failed: ${stats.failed}\n• Paused: ${stats.paused}`;
            toast(message, 'info');
            return message;
        },
        helpString: 'Show operation queue status',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'queue-pause',
        callback: async () => {
            const { pauseQueue } = await import('./operationQueue.js');
            pauseQueue();
            return 'Queue paused';
        },
        helpString: 'Pause the operation queue',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'queue-resume',
        callback: async () => {
            const { resumeQueue } = await import('./operationQueue.js');
            resumeQueue();
            return 'Queue resumed';
        },
        helpString: 'Resume the operation queue',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'queue-clear-all',
        callback: async () => {
            const { clearAllOperations } = await import('./operationQueue.js');
            const count = await clearAllOperations();
            return `Cleared all ${count} operations`;
        },
        helpString: 'Clear all operations from queue',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'queue-test',
        callback: async () => {
            const { enqueueOperation, OperationType } = await import('./operationQueue.js');
            const opId = await enqueueOperation(OperationType.SUMMARIZE_MESSAGE, { index: 0 }, {});
            return `Test operation added to queue: ${opId}`;
        },
        helpString: 'Add a test operation to the queue (for debugging)',
    }));
}

export {
    initialize_slash_commands
};
import {
    log,
    debug,
    error,
    toast,
    extension_settings,
    get_settings,
    set_settings,
    getContext,
    chat_enabled,
    remember_message_toggle,
    forget_message_toggle,
    toggle_chat_enabled,
    refresh_memory,
    summarize_messages,
    stop_summarization,
    get_memory,
    display_injection_preview,
    collect_messages_to_auto_summarize,
    generate_combined_summary,
} from './index.js';

function initialize_slash_commands() {
    let ctx = getContext()
    let SlashCommandParser = ctx.SlashCommandParser
    let SlashCommand = ctx.SlashCommand
    let SlashCommandArgument = ctx.SlashCommandArgument
    let SlashCommandNamedArgument = ctx.SlashCommandNamedArgument
    let ARGUMENT_TYPE = ctx.ARGUMENT_TYPE

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'auto_summarize_log_chat',
        callback: (args) => {
            log(getContext())
            log(getContext().chat)
        },
        helpString: 'log chat',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'auto_summarize_log_settings',
        callback: async (args) => {
            log(extension_settings[MODULE_NAME])
        },
        helpString: 'Log current settings',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'hard_reset',
        callback: (args) => {
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
        callback: (args) => {
            return chat_enabled()
        },
        helpString: 'Return whether memory is currently enabled.'
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_display',
        callback: (args) => {
            $(`.${settings_content_class} #display_memories`).click();  // toggle the memory display
        },
        helpString: "Toggle the \"display memories\" setting on the current profile (doesn't save the profile).",
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_popout',
        callback: (args) => {
            toggle_popout()
        },
        helpString: 'Toggle the extension config popout',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_edit_interface',
        callback: (args) => {
            memoryEditInterface.show()
        },
        helpString: 'Toggle the memory editing interface',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'toggle_memory_injection_preview',
        callback: (args) => {
            display_injection_preview()
        },
        helpString: 'Toggle a preview of the current memory injection',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'summarize_chat',
        helpString: 'Summarize the chat using the auto-summarization criteria, even if auto-summarization is off.',
        callback: async (args, limit) => {
            let indexes = collect_messages_to_auto_summarize()
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
        callback: (args) => {
            stop_summarization()
        },
        helpString: 'Abort any summarization taking place.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'get_memory',
        callback: async (args, index) => {
            let chat = getContext().chat
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
}

export {
    initialize_slash_commands
};
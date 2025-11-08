
import {
  log,
  extension_settings,
  get_settings,
  getContext,
  chat_enabled,
  toggle_chat_enabled,
  refresh_memory,
  get_memory,
  MODULE_NAME,
  hard_reset_settings,
  refresh_settings,
  toggle_popout,
  get_running_summary_injection,
  display_injection_preview,
  toast } from
'./index.js';

function initialize_slash_commands() {
  const ctx = getContext();
  const SlashCommandParser = ctx.SlashCommandParser;
  const SlashCommand = ctx.SlashCommand;
  const SlashCommandArgument = ctx.SlashCommandArgument;
  // const SlashCommandNamedArgument = ctx.SlashCommandNamedArgument
  const ARGUMENT_TYPE = ctx.ARGUMENT_TYPE;

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'auto_summarize_log_chat',
    callback: (_args) => {
      log(getContext());
      log(getContext().chat);
    },
    helpString: 'log chat'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'auto_summarize_log_settings',
    // eslint-disable-next-line require-await -- SillyTavern expects async callback
    callback: async (_args) => {
      log(extension_settings[MODULE_NAME]);
    },
    helpString: 'Log current settings'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'hard_reset',
    callback: (_args) => {
      hard_reset_settings();
      refresh_settings();
      refresh_memory();
    },
    helpString: 'Hard reset all settings'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'toggle_memory',
    callback: (args, state) => {
      // if not provided the state is an empty string, but we need it to be null to get the default behavior
      const enabledState = state === "" ? null : state === "true";

      toggle_chat_enabled(enabledState); // toggle the memory for the current chat
    },
    helpString: 'Change whether memory is enabled for the current chat. If no state is provided, it will toggle the current state.',
    unnamedArgumentList: [
    SlashCommandArgument.fromProps({
      description: 'Boolean value to set the memory state',
      isRequired: false,
      typeList: ARGUMENT_TYPE.BOOLEAN
    })]

  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'get_memory_enabled',
    callback: (_args) => {
      return chat_enabled();
    },
    helpString: 'Return whether memory is currently enabled.'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'toggle_memory_popout',
    callback: (_args) => {
      toggle_popout();
    },
    helpString: 'Toggle the extension config popout'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'toggle_memory_injection_preview',
    callback: (_args) => {
      display_injection_preview();
    },
    helpString: 'Toggle a preview of the current memory injection'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'get_memory',
    // eslint-disable-next-line require-await -- SillyTavern expects async callback
    callback: async (args, index) => {
      const chat = getContext().chat;
      let messageIndex = index;
      if (messageIndex === "") {messageIndex = chat.length - 1;}
      return get_memory(chat[messageIndex]);
    },
    helpString: 'Return the memory associated with a given message index. If no index given, assumes the most recent message.',
    unnamedArgumentList: [
    SlashCommandArgument.fromProps({
      description: 'Index of the message',
      isRequired: false,
      typeList: ARGUMENT_TYPE.NUMBER
    })]

  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'log_scene_summary_injection',
    callback: () => {
      const settings = {
        running_scene_summary_position: get_settings('running_scene_summary_position'),
        running_scene_summary_role: get_settings('running_scene_summary_role'),
        running_scene_summary_depth: get_settings('running_scene_summary_depth'),
        running_scene_summary_scan: get_settings('running_scene_summary_scan')
      };
      const injection = get_running_summary_injection();
      log('[Running Scene Summary Injection] Settings:', settings);
      log('[Running Scene Summary Injection] Injection text:', injection);
      return { settings, injection };
    },
    helpString: 'Log running scene summary injection settings and injection text.'
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
    helpString: 'Show operation queue status'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'queue-pause',
    callback: async () => {
      const { pauseQueue } = await import('./operationQueue.js');
      pauseQueue();
      return 'Queue paused';
    },
    helpString: 'Pause the operation queue'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'queue-resume',
    callback: async () => {
      const { resumeQueue } = await import('./operationQueue.js');
      resumeQueue();
      return 'Queue resumed';
    },
    helpString: 'Resume the operation queue'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'queue-clear-all',
    callback: async () => {
      const { clearAllOperations } = await import('./operationQueue.js');
      const count = await clearAllOperations();
      return `Cleared all ${count} operations`;
    },
    helpString: 'Clear all operations from queue'
  }));

}

export {
  initialize_slash_commands };

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
  get_running_recap_injection,
  display_injection_preview,
  toast,
  get_data } from
'./index.js';
import { loadWorldInfo } from '../../../world-info.js';
import { getAttachedLorebook } from './lorebookManager.js';

async function count_lorebook_tokens(context) {
  const lorebookName = getAttachedLorebook();

  if (!lorebookName) {
    return { lorebookTokens: 0, lorebookEntryCount: 0 };
  }

  const data = await loadWorldInfo(lorebookName);
  if (!data?.entries) {
    return { lorebookTokens: 0, lorebookEntryCount: 0 };
  }

  const entries = Object.values(data.entries);
  let lorebookTokens = 0;
  let lorebookEntryCount = 0;

  for (const entry of entries) {
    const entryContent = entry.content || '';
    // eslint-disable-next-line no-await-in-loop -- must count tokens sequentially
    const tokenCount = await context.getTokenCountAsync(entryContent);
    lorebookTokens += tokenCount;
    lorebookEntryCount++;
  }

  return { lorebookTokens, lorebookEntryCount };
}

async function count_running_recap_tokens(context) {
  const runningRecapText = get_running_recap_injection();
  if (!runningRecapText) {
    return 0;
  }
  return await context.getTokenCountAsync(runningRecapText);
}

function findVisibleSceneBreaks(chat) {
  const scene_break_indexes = [];
  for (let i = 0; i < chat.length; i++) {
    if (get_data(chat[i], 'scene_break') && get_data(chat[i], 'scene_break_visible') !== false) {
      scene_break_indexes.push(i);
    }
  }
  return scene_break_indexes;
}

function calculateVisibleStartIndex(chat) {
  const auto_hide_scene_count = get_settings('auto_hide_scene_count');

  if (auto_hide_scene_count < 0) {
    return 0;
  }

  const scene_break_indexes = findVisibleSceneBreaks(chat);
  const scenes_to_keep = auto_hide_scene_count;

  if (scene_break_indexes.length >= scenes_to_keep) {
    const first_visible_scene = scene_break_indexes.length - scenes_to_keep;
    return scene_break_indexes[first_visible_scene] + 1;
  }

  return 0;
}

function initialize_slash_commands() {
  const ctx = getContext();
  const SlashCommandParser = ctx.SlashCommandParser;
  const SlashCommand = ctx.SlashCommand;
  const SlashCommandArgument = ctx.SlashCommandArgument;
  // const SlashCommandNamedArgument = ctx.SlashCommandNamedArgument
  const ARGUMENT_TYPE = ctx.ARGUMENT_TYPE;

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'auto_recap_log_chat',
    callback: (_args) => {
      log(getContext());
      log(getContext().chat);
    },
    helpString: 'log chat'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'auto_recap_log_settings',
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
    name: 'log_scene_recap_injection',
    callback: () => {
      const settings = {
        running_scene_recap_position: get_settings('running_scene_recap_position'),
        running_scene_recap_role: get_settings('running_scene_recap_role'),
        running_scene_recap_depth: get_settings('running_scene_recap_depth'),
        running_scene_recap_scan: get_settings('running_scene_recap_scan')
      };
      const injection = get_running_recap_injection();
      log('[Running Scene Recap Injection] Settings:', settings);
      log('[Running Scene Recap Injection] Injection text:', injection);
      return { settings, injection };
    },
    helpString: 'Log running scene recap injection settings and injection text.'
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

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'countmessagetokens',
    callback: async () => {
      const context = getContext();
      const chat = context.chat;

      if (!chat || chat.length === 0) {
        const message = 'No messages in current chat';
        toast(message, 'warning');
        return message;
      }

      const visible_start = calculateVisibleStartIndex(chat);

      const PREVIEW_LENGTH = 50;
      let messageTokens = 0;
      let hiddenTokens = 0;
      let visibleTokens = 0;
      const messageTokenCounts = [];

      for (let i = 0; i < chat.length; i++) {
        const message = chat[i];
        const messageText = message.mes || '';
        // eslint-disable-next-line no-await-in-loop -- must count tokens sequentially
        const tokenCount = await context.getTokenCountAsync(messageText);
        messageTokens += tokenCount;

        if (i < visible_start) {
          hiddenTokens += tokenCount;
        } else {
          visibleTokens += tokenCount;
        }

        messageTokenCounts.push({
          index: i,
          tokens: tokenCount,
          preview: messageText.slice(0, PREVIEW_LENGTH)
        });
      }

      const hiddenCount = visible_start;
      const visibleCount = chat.length - visible_start;

      const { lorebookTokens, lorebookEntryCount } = await count_lorebook_tokens(context);
      const runningRecapTokens = await count_running_recap_tokens(context);

      const tokensSaved = hiddenTokens - lorebookTokens - runningRecapTokens;
      const totalRemainingTokens = visibleTokens + lorebookTokens + runningRecapTokens;

      const summary = `Token Count Summary:
• Messages: ${chat.length} (${messageTokens.toLocaleString()} tokens, avg ${Math.round(messageTokens / chat.length)})
  - Hidden: ${hiddenCount} (${hiddenTokens.toLocaleString()} tokens)
  - Visible: ${visibleCount} (${visibleTokens.toLocaleString()} tokens)
• Chat Lorebook Entries: ${lorebookEntryCount} (${lorebookTokens.toLocaleString()} tokens)
• Running Scene Recap: ${runningRecapTokens.toLocaleString()} tokens
• Tokens Saved: ${tokensSaved.toLocaleString()} tokens
• Total Remaining Tokens: ${totalRemainingTokens.toLocaleString()} tokens`;

      log('[Token Count] Summary:', summary);
      log('[Token Count] Per-message breakdown:', messageTokenCounts);
      log('[Token Count] Chat lorebook entries:', lorebookEntryCount, 'tokens:', lorebookTokens);
      log('[Token Count] Running recap tokens:', runningRecapTokens);
      log('[Token Count] Tokens saved:', tokensSaved);
      log('[Token Count] Total remaining tokens:', totalRemainingTokens);

      toast(summary, 'info');
      return summary;
    },
    helpString: 'Count tokens in all messages, lorebook entries, and running scene recap'
  }));

}

export {
  initialize_slash_commands };
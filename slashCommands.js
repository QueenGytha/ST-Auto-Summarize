
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
  get_data,
  count_tokens } from
'./index.js';
import { loadWorldInfo } from '../../../world-info.js';
import { getAttachedLorebook, getLorebookEntries } from './lorebookManager.js';
import { get_running_recap_versions, get_previous_running_recap_version_before_scene } from './runningSceneRecap.js';
import { SCENE_RECAP_METADATA_KEY } from './sceneBreak.js';

async function count_lorebook_tokens() {
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
    const tokenCount = count_tokens(entryContent);
    lorebookTokens += tokenCount;
    lorebookEntryCount++;
  }

  return { lorebookTokens, lorebookEntryCount };
}

function count_running_recap_tokens() {
  const runningRecapText = get_running_recap_injection();
  if (!runningRecapText) {
    return 0;
  }
  return count_tokens(runningRecapText);
}

function count_enabled_lorebook_tokens_from_snapshot(allEntries) {
  if (!allEntries || allEntries.length === 0) {
    return { tokenCount: 0, enabledCount: 0 };
  }

  let tokenCount = 0;
  let enabledCount = 0;

  for (const entry of allEntries) {
    if (entry.disable === false && entry.content) {
      const entryTokens = count_tokens(entry.content);
      tokenCount += entryTokens;
      enabledCount++;
    }
  }

  return { tokenCount, enabledCount };
}

function find_running_recap_version_for_scene(sceneMessageIndex) {
  const versions = get_running_recap_versions();
  if (!versions || versions.length === 0) {
    return null;
  }

  for (const version of versions) {
    if (version.new_scene_index === sceneMessageIndex) {
      return version;
    }
  }

  return get_previous_running_recap_version_before_scene(sceneMessageIndex);
}

function calculate_tokens_for_messages(messages) {
  if (!messages || messages.length === 0) {
    return 0;
  }

  let totalTokens = 0;
  for (const message of messages) {
    const messageText = message.mes || '';
    const tokenCount = count_tokens(messageText);
    totalTokens += tokenCount;
  }

  return totalTokens;
}

async function analyze_scene_effective_tokens({ currentScene, previousScene, chat, context, sceneIndex, allSceneBreaks }) {
  const startIdx = currentScene.metadata.startIdx;
  const endIdx = currentScene.metadata.endIdx;

  const previousLorebookSnapshot = previousScene ? previousScene.metadata.allEntries : [];
  const { tokenCount: lorebookTokens, enabledCount: lorebookEntryCount } =
    count_enabled_lorebook_tokens_from_snapshot(previousLorebookSnapshot);

  const runningRecapVersion = find_running_recap_version_for_scene(currentScene.index);
  const runningRecapText = runningRecapVersion?.content || '';
  const runningRecapTokens = runningRecapText
    ? await context.getTokenCountAsync(runningRecapText)
    : 0;

  const autoHideSceneCount = get_settings('auto_hide_scene_count');
  let firstVisibleSceneStart = 0;
  if (autoHideSceneCount >= 0 && sceneIndex > autoHideSceneCount) {
    const firstVisibleSceneIdx = sceneIndex - autoHideSceneCount;
    firstVisibleSceneStart = allSceneBreaks[firstVisibleSceneIdx].metadata.startIdx;
  }

  const hiddenMessages = chat.slice(0, firstVisibleSceneStart);
  const hiddenTokens = calculate_tokens_for_messages(hiddenMessages);

  const perMessageStats = [];
  for (let msgIdx = startIdx; msgIdx <= endIdx; msgIdx++) {
    const message = chat[msgIdx];

    // Only count USER messages - these trigger LLM calls where tokens are sent
    // Assistant messages are outputs from previous calls, not new token sends
    if (!message.is_user) {
      continue;
    }

    const visibleMessages = chat.slice(firstVisibleSceneStart, msgIdx + 1);
    const visibleTokens = calculate_tokens_for_messages(visibleMessages);

    const withMemoryTokens = visibleTokens + lorebookTokens + runningRecapTokens;
    const withoutMemoryTokens = hiddenTokens + visibleTokens;
    const savings = withoutMemoryTokens - withMemoryTokens;

    perMessageStats.push({
      messageIndex: msgIdx,
      visibleTokens: visibleTokens,
      savings: savings,
      isUser: true
    });
  }

  const totalVisibleTokens = perMessageStats[perMessageStats.length - 1]?.visibleTokens || 0;
  const totalSavings = perMessageStats[perMessageStats.length - 1]?.savings || 0;
  const avgSavingsPerMessage = perMessageStats.length > 0
    ? totalSavings / perMessageStats.length
    : 0;

  const compressionRatio = (lorebookTokens + runningRecapTokens) > 0
    ? hiddenTokens / (lorebookTokens + runningRecapTokens)
    : 0;

  return {
    startIdx,
    endIdx,
    hiddenTokens,
    totalVisibleTokens,
    lorebookTokens,
    lorebookEntryCount,
    runningRecapTokens,
    runningRecapVersion,
    totalSavings,
    avgSavingsPerMessage,
    compressionRatio,
    perMessageStats
  };
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

function isSystemEntry(comment) {
  if (!comment || typeof comment !== 'string') {return false;}
  return comment.startsWith('_registry_') ||
         comment === '__operation_queue' ||
         comment.startsWith('__index_');
}

async function runCompactLorebook() {
  const lorebookName = getAttachedLorebook();
  if (!lorebookName) {
    return { success: false, error: 'No lorebook attached to this chat.' };
  }

  const allEntries = await getLorebookEntries(lorebookName);
  if (!allEntries || allEntries.length === 0) {
    return { success: false, error: 'No entries found in lorebook.' };
  }

  const entriesToCompact = allEntries.filter(entry =>
    entry && entry.comment && !isSystemEntry(entry.comment)
  );

  if (entriesToCompact.length === 0) {
    return { success: false, error: 'No non-system entries to compact.' };
  }

  const { enqueueOperation, OperationType } = await import('./operationQueue.js');

  for (const entry of entriesToCompact) {
    // eslint-disable-next-line no-await-in-loop -- must enqueue sequentially
    await enqueueOperation(
      OperationType.COMPACT_LOREBOOK_ENTRY,
      {
        lorebookName,
        entryUid: entry.uid,
        existingContent: entry.content
      },
      {
        priority: 14,
        metadata: {
          entry_comment: entry.comment,
          source: 'compactlorebook_command'
        }
      }
    );
  }

  return { success: true, count: entriesToCompact.length };
}

// eslint-disable-next-line max-lines-per-function -- This function registers all slash commands, inherently long
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
    name: 'compact-entry',
    callback: async (args, entryUid) => {
      const lorebookName = getAttachedLorebook();
      if (!lorebookName) {
        const msg = 'No lorebook attached to current chat';
        toast(msg, 'error');
        return msg;
      }

      if (!entryUid || entryUid === "") {
        const msg = 'Entry UID is required. Usage: /compact-entry <uid>';
        toast(msg, 'error');
        return msg;
      }

      const entries = await getLorebookEntries(lorebookName);
      const entry = entries?.find((e) => String(e.uid) === String(entryUid));

      if (!entry) {
        const msg = `Entry UID ${entryUid} not found in lorebook "${lorebookName}"`;
        toast(msg, 'error');
        return msg;
      }

      const { enqueueOperation, OperationType } = await import('./operationQueue.js');
      await enqueueOperation(
        OperationType.COMPACT_LOREBOOK_ENTRY,
        {
          lorebookName,
          entryUid: entry.uid,
          existingContent: entry.content
        },
        {
          priority: 14,
          metadata: {
            entry_comment: entry.comment
          }
        }
      );

      const msg = `Queued compaction for entry: ${entry.comment} (UID: ${entryUid})`;
      toast(msg, 'success');
      return msg;
    },
    helpString: 'Compact a lorebook entry by UID. Usage: /compact-entry <uid>',
    unnamedArgumentList: [
      SlashCommandArgument.fromProps({
        description: 'UID of the lorebook entry to compact',
        isRequired: true,
        typeList: ARGUMENT_TYPE.NUMBER
      })
    ]
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

      const { lorebookTokens, lorebookEntryCount } = await count_lorebook_tokens();
      const runningRecapTokens = count_running_recap_tokens();

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

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'countmessagetokenseffective',
    callback: async () => {
      const context = getContext();
      const chat = context.chat;

      if (!chat || chat.length === 0) {
        const message = 'No messages in current chat';
        toast(message, 'warning');
        return message;
      }

      const sceneBreaks = [];
      for (let i = 0; i < chat.length; i++) {
        if (get_data(chat[i], 'scene_break')) {
          const metadata = get_data(chat[i], SCENE_RECAP_METADATA_KEY);
          const versionIndex = get_data(chat[i], 'scene_recap_current_index') ?? 0;
          const versionMeta = metadata?.[versionIndex];

          if (versionMeta && versionMeta.allEntries) {
            sceneBreaks.push({
              index: i,
              versionIndex: versionIndex,
              metadata: versionMeta,
              message: chat[i]
            });
          }
        }
      }

      if (sceneBreaks.length === 0) {
        const message = 'No scene breaks with complete metadata found in current chat';
        toast(message, 'warning');
        return message;
      }

      const sceneStats = [];

      for (let sceneIdx = 0; sceneIdx < sceneBreaks.length; sceneIdx++) {
        const currentScene = sceneBreaks[sceneIdx];
        const previousScene = sceneIdx > 0 ? sceneBreaks[sceneIdx - 1] : null;

        // eslint-disable-next-line no-await-in-loop -- scenes must be analyzed sequentially
        const analysis = await analyze_scene_effective_tokens({
          currentScene,
          previousScene,
          chat,
          context,
          sceneIndex: sceneIdx,
          allSceneBreaks: sceneBreaks
        });

        sceneStats.push({
          sceneIndex: sceneIdx,
          messageIndex: currentScene.index,
          messageRange: `${analysis.startIdx}-${analysis.endIdx}`,
          messagesInScene: analysis.endIdx - analysis.startIdx + 1,
          hiddenTokens: analysis.hiddenTokens,
          visibleTokens: analysis.totalVisibleTokens,
          lorebookTokens: analysis.lorebookTokens,
          lorebookEntryCount: analysis.lorebookEntryCount,
          runningRecapTokens: analysis.runningRecapTokens,
          runningRecapVersion: analysis.runningRecapVersion?.version ?? null,
          totalMemoryTokens: analysis.lorebookTokens + analysis.runningRecapTokens,
          savingsThisScene: analysis.totalSavings,
          avgSavingsPerMessage: Math.round(analysis.avgSavingsPerMessage),
          compressionRatio: analysis.compressionRatio.toFixed(2),
          perMessageStats: analysis.perMessageStats
        });
      }

      const finalScene = sceneStats[sceneStats.length - 1];
      const totalScenes = sceneBreaks.length;
      const totalMessages = chat.length;
      const finalCompressionRatio = finalScene.compressionRatio;

      let cumulativeHistoricalSavings = 0;
      let userMessagesInScenes = 0;
      for (const scene of sceneStats) {
        for (const msgStat of scene.perMessageStats) {
          cumulativeHistoricalSavings += msgStat.savings;
          userMessagesInScenes++;
        }
      }

      // Count total user messages in entire chat for comparison
      const totalUserMessages = chat.filter((msg) => msg.is_user).length;

      const allMessagesTokens = calculate_tokens_for_messages(chat);
      const { lorebookTokens: currentLorebookTokens, lorebookEntryCount: currentLorebookEntryCount } =
        await count_lorebook_tokens();
      const currentRunningRecapTokens = count_running_recap_tokens();
      const currentTotalMemory = currentLorebookTokens + currentRunningRecapTokens;

      const visibleStartIdx = sceneBreaks.length > 0
        ? sceneBreaks[sceneBreaks.length - 1].metadata.endIdx + 1
        : 0;
      const currentVisibleMessages = chat.slice(visibleStartIdx);
      const currentVisibleTokens = calculate_tokens_for_messages(currentVisibleMessages);

      const totalWithMemory = currentVisibleTokens + currentTotalMemory;
      const totalSavingsVsFullChain = allMessagesTokens - totalWithMemory;
      const fullChainCompressionRatio = currentTotalMemory > 0
        ? (allMessagesTokens - currentVisibleTokens) / currentTotalMemory
        : 0;

      const PERCENT_MULTIPLIER = 100;
      const savingsPercentage = ((totalSavingsVsFullChain / allMessagesTokens) * PERCENT_MULTIPLIER).toFixed(1);

      const summary = `Effective Token Savings Analysis:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Overall Statistics:
  • Scenes Analyzed: ${totalScenes}
  • Total Messages: ${totalMessages} (${totalUserMessages} user, ${totalMessages - totalUserMessages} assistant)
  • User Messages in Scenes: ${userMessagesInScenes} of ${totalUserMessages}
  • Cumulative Historical Savings: ${cumulativeHistoricalSavings.toLocaleString()} tokens
  • Final Scene Compression Ratio: ${finalCompressionRatio}:1

📈 End-to-End Comparison:
  • All Messages (No Memory): ${allMessagesTokens.toLocaleString()} tokens
  • With Memory System: ${totalWithMemory.toLocaleString()} tokens
  • Total Savings (Current State): ${totalSavingsVsFullChain.toLocaleString()} tokens (${savingsPercentage}%)
  • Full Chain Compression: ${fullChainCompressionRatio.toFixed(2)}:1

💾 Current State (Actual):
  • Visible Messages: ${currentVisibleMessages.length} (${currentVisibleTokens.toLocaleString()} tokens)
  • Lorebook: ${currentLorebookEntryCount} entries (${currentLorebookTokens.toLocaleString()} tokens)
  • Running Recap: ${currentRunningRecapTokens.toLocaleString()} tokens
  • Total Memory: ${currentTotalMemory.toLocaleString()} tokens

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 See console for detailed per-scene breakdown`;

      log('[Effective Token Analysis] ===== SUMMARY =====');
      log(summary);
      log('[Effective Token Analysis] ===== PER-SCENE BREAKDOWN =====');

      for (const sceneStat of sceneStats) {
        log(`\n--- Scene ${sceneStat.sceneIndex} [Messages ${sceneStat.messageRange}] ---`);
        log(`  Messages in scene: ${sceneStat.messagesInScene}`);
        log(`  Hidden tokens (prior messages): ${sceneStat.hiddenTokens.toLocaleString()}`);
        log(`  Visible tokens (this scene): ${sceneStat.visibleTokens.toLocaleString()}`);
        log(`  Lorebook: ${sceneStat.lorebookEntryCount} entries, ${sceneStat.lorebookTokens.toLocaleString()} tokens`);
        log(`  Running recap: v${sceneStat.runningRecapVersion}, ${sceneStat.runningRecapTokens.toLocaleString()} tokens`);
        log(`  Total memory tokens: ${sceneStat.totalMemoryTokens.toLocaleString()}`);
        log(`  Savings this scene: ${sceneStat.savingsThisScene.toLocaleString()} tokens`);
        log(`  Avg savings per message: ${sceneStat.avgSavingsPerMessage.toLocaleString()} tokens`);
        log(`  Compression ratio: ${sceneStat.compressionRatio}:1`);
      }

      log('[Effective Token Analysis] ===== DETAILED DATA =====');
      log('[Effective Token Analysis] Scene statistics:', sceneStats);
      log('\n[Effective Token Analysis] ===== SAVINGS COMPARISON =====');
      log(`  Total messages: ${totalMessages} (${totalUserMessages} user, ${totalMessages - totalUserMessages} assistant)`);
      log(`  User messages in completed scenes: ${userMessagesInScenes} of ${totalUserMessages}`);
      log(`  Cumulative historical savings (all user messages as sent): ${cumulativeHistoricalSavings.toLocaleString()} tokens`);
      log(`  Current state savings (vs sending all messages now): ${totalSavingsVsFullChain.toLocaleString()} tokens (${savingsPercentage}%)`);
      log('\n[Effective Token Analysis] ===== END-TO-END COMPARISON =====');
      log(`  All messages (no memory): ${allMessagesTokens.toLocaleString()} tokens`);
      log(`  Current visible messages: ${currentVisibleMessages.length} messages, ${currentVisibleTokens.toLocaleString()} tokens`);
      log(`  Current lorebook: ${currentLorebookEntryCount} entries, ${currentLorebookTokens.toLocaleString()} tokens`);
      log(`  Current running recap: ${currentRunningRecapTokens.toLocaleString()} tokens`);
      log(`  Total with memory: ${totalWithMemory.toLocaleString()} tokens`);
      log(`  Full chain compression: ${fullChainCompressionRatio.toFixed(2)}:1`);

      toast(summary, 'info');
      return summary;
    },
    helpString: 'Calculate historical per-message token usage showing actual token savings across all scenes'
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'compactlorebook',
    callback: async () => {
      const { getQueueStats } = await import('./operationQueue.js');
      const stats = getQueueStats();

      if (stats.pending > 0 || stats.in_progress > 0) {
        const msg = `Queue must be empty. Current: ${stats.pending} pending, ${stats.in_progress} in progress.`;
        toast(msg, 'error');
        return msg;
      }

      const result = await runCompactLorebook();
      if (!result.success) {
        toast(result.error, 'warning');
        return result.error;
      }

      return '';
    },
    helpString: 'Compact all lorebook entries (excluding system entries). Queue must be empty.',
    aliases: ['compactlb']
  }));

  SlashCommandParser.addCommandObject(SlashCommand.fromProps({
    name: 'compactall',
    callback: async () => {
      const { getQueueStats } = await import('./operationQueue.js');
      const stats = getQueueStats();

      if (stats.pending > 0 || stats.in_progress > 0) {
        const msg = `Queue must be empty. Current: ${stats.pending} pending, ${stats.in_progress} in progress.`;
        toast(msg, 'error');
        return msg;
      }

      // Run all compaction operations
      // Add additional compaction functions here as they are created
      const compactionFunctions = [
        { name: 'lorebook', fn: runCompactLorebook }
        // Future: { name: 'recaps', fn: runCompactRecaps },
        // Future: { name: 'other', fn: runCompactOther },
      ];

      for (const { name, fn } of compactionFunctions) {
        // eslint-disable-next-line no-await-in-loop -- must run sequentially
        const result = await fn();
        if (!result.success) {
          log(`[compactall] ${name}: ${result.error}`);
        }
      }

      return '';
    },
    helpString: 'Run all compaction operations (lorebook entries, etc.). Queue must be empty.'
  }));

}

export {
  initialize_slash_commands };
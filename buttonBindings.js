
import {
  debug,
  getContext,
  refresh_memory,
  group_member_enable_button,
  error,
  toggle_character_enabled,
  openGroupId,
  character_enabled,
  group_member_enable_button_highlight,
  toggle_chat_enabled,
  manualSceneBreakDetection,
  clearAllCheckedFlags,
  selectorsSillyTavern,
  get_data,
  toast,
  MODULE_NAME,
  getCurrentChatId,
  chat_metadata,
  SUBSYSTEM } from
'./index.js';
import { getQueueStats } from './operationQueue.js';

function initialize_message_buttons() {
  // Hook into SillyTavern's hide/unhide message buttons to refresh memory
  debug("Initializing message button listeners");
  const ctx = getContext();

  const $chat = $(`div${selectorsSillyTavern.chat.container}`);

  // when a message is hidden/unhidden, trigger a memory refresh.
  // Yes the chat is saved already when these buttons are clicked, but we need to wait until after to refresh.
  $chat.on("click", selectorsSillyTavern.message.hide, async () => {
    await ctx.saveChat();
    refresh_memory();
  });
  $chat.on("click", selectorsSillyTavern.message.unhide, async () => {
    await ctx.saveChat();
    refresh_memory();
  });
}
function initialize_group_member_buttons() {
  // Insert a button into the group member selection to disable recap generation
  debug("Initializing group member buttons");

  const $template = $(selectorsSillyTavern.group.memberTemplate).find(selectorsSillyTavern.group.memberIcon);
  const $button = $(`<div title="Toggle recap generation for memory" class="right_menu_button fa-solid fa-lg fa-brain ${group_member_enable_button}"></div>`);

  // add listeners
  $(document).on("click", `.${group_member_enable_button}`, (e) => {

    const member_block = $(e.target).closest(selectorsSillyTavern.group.member);
    const char_key = member_block.data('id');

    if (!char_key) {
      error("Character key not found in group member block.");
    }

    // toggle the enabled status of this character
    toggle_character_enabled(char_key);
    set_character_enabled_button_states(); // update the button state
  });

  $template.prepend($button);
}
function set_character_enabled_button_states() {
  // for each character in the group chat, set the button state based on their enabled status
  const $enable_buttons = $(selectorsSillyTavern.group.membersContainer).find(`.${group_member_enable_button}`);

  // if we are creating a new group (openGroupId is undefined), then hide the buttons
  if (openGroupId === undefined) {
    $enable_buttons.hide();
    return;
  }

  // set the state of each button
  for (const button of $enable_buttons) {
    const member_block = $(button).closest(selectorsSillyTavern.group.member);
    const char_key = member_block.data('id');
    const enabled = character_enabled(char_key);
    if (enabled) {
      $(button).addClass(group_member_enable_button_highlight);
    } else {
      $(button).removeClass(group_member_enable_button_highlight);
    }
  }
}

function add_menu_button(text , fa_icon , callback , hover  = null) {
  const $button = $(`
    <div class="list-group-item flex-container flexGap5 interactable" title="${hover ?? text}" tabindex="0">
        <i class="${fa_icon}"></i>
        <span>${text}</span>
    </div>
    `);

  const $extensions_menu = $(selectorsSillyTavern.extensions.menu);
  if (!$extensions_menu.length) {
    error('Could not find the extensions menu');
  }

  $button.appendTo($extensions_menu);
  $button.click(() => callback());
}
function initialize_menu_buttons() {
  add_menu_button("Toggle Memory", "fa-solid fa-brain", toggle_chat_enabled, "Toggle memory for the current chat.");
  add_menu_button("Scan for Scene Breaks", "fa-solid fa-magnifying-glass", manualSceneBreakDetection, "Automatically detect and mark scene breaks in all messages.");
  add_menu_button("Clear Scene Break Checks", "fa-solid fa-eraser", clearAllCheckedFlags, "Clear the 'checked' flag from all messages so they can be re-scanned for scene breaks.");
}

function canCreateCheckpointOrBranch(messageIndex ) {
  const ctx = getContext();
  const chat = ctx.chat;

  if (!chat[messageIndex]) {
    return { allowed: false, reason: 'Message not found' };
  }

  const queueStats = getQueueStats();
  const queueEmpty = queueStats.pending === 0 && queueStats.in_progress === 0;

  if (!queueEmpty) {
    return {
      allowed: false,
      reason: `Queue is not empty (${queueStats.pending} pending, ${queueStats.in_progress} in progress)`
    };
  }

  return { allowed: true, reason: null };
}

async function deepCloneSceneRecapData() {
  const ctx = getContext();
  const chat = ctx.chat;

  // Deep-clone message-level scene recap data
  for (let i = 0; i < chat.length; i++) {
    const msg = chat[i];
    if (msg.extra && msg.extra[MODULE_NAME]) {
      msg.extra[MODULE_NAME] = structuredClone(msg.extra[MODULE_NAME]);
    }
  }

  // Deep-clone chat-level running recap data and update chat_id
  if (chat_metadata.auto_recap_running_scene_recaps) {
    chat_metadata.auto_recap_running_scene_recaps = structuredClone(chat_metadata.auto_recap_running_scene_recaps);
    chat_metadata.auto_recap_running_scene_recaps.chat_id = getCurrentChatId();
  }

  await ctx.saveChat();
}

function initialize_checkpoint_branch_interceptor() {
  debug(SUBSYSTEM.UI, 'Initializing checkpoint/branch button interceptor');

  const chatContainer = document.querySelector(selectorsSillyTavern.chat.container);
  if (!chatContainer) {
    error('Could not find chat container for checkpoint/branch interceptor');
    return;
  }

  chatContainer.addEventListener('click', async (e) => {
    const target = e.target.closest('.mes_create_bookmark, .mes_create_branch');
    if (!target) {
      return;
    }

    const mesElement = target.closest('.mes');
    if (!mesElement) {
      error('Could not find message element for checkpoint/branch button');
      return;
    }

    const messageIndex = Number(mesElement.getAttribute('mesid'));
    if (Number.isNaN(messageIndex)) {
      error('Invalid message ID for checkpoint/branch button');
      return;
    }

    const buttonType = target.classList.contains('mes_create_bookmark') ? 'checkpoint' : 'branch';

    // Validate checkpoint/branch creation
    const check = canCreateCheckpointOrBranch(messageIndex);

    if (!check.allowed) {
      e.stopImmediatePropagation();
      e.preventDefault();
      toast(`Cannot create ${buttonType}: ${check.reason}`, 'warning');
      debug(SUBSYSTEM.UI, `${buttonType} creation blocked: ${check.reason} (message ${messageIndex})`);
      return;
    }

    // Validation passed - block event and create branch/checkpoint with lorebook
    e.stopImmediatePropagation();
    e.preventDefault();

    debug(SUBSYSTEM.UI, `${buttonType} creation allowed: proceeding with ${buttonType} creation`);

    try {
      // Create the checkpoint/branch (creates file but doesn't switch)
      const { createBranch, createBookmark } = await import('../../../../scripts/bookmarks.js');
      const newChatName = await (buttonType === 'branch' ? createBranch(messageIndex) : createBookmark(messageIndex));

      if (!newChatName) {
        throw new Error(`Failed to create ${buttonType} - no chat name returned`);
      }

      debug(SUBSYSTEM.UI, `${buttonType} created: ${newChatName}`);

      // Switch to the new branch/checkpoint
      const { openCharacterChat } = await import('../../../../script.js');
      await openCharacterChat(newChatName);

      debug(SUBSYSTEM.UI, `Switched to ${buttonType}: ${newChatName}`);

      // Deep-clone scene recap data for all messages to prevent shared references
      await deepCloneSceneRecapData();

      // Find the most recent scene break with a lorebook snapshot (at or before this message)
      const ctx = getContext();
      const chat = ctx.chat;
      let sceneBreakIndexForLorebook = null;

      for (let i = messageIndex; i >= 0; i--) {
        const msg = chat[i];
        const hasSceneBreak = get_data(msg, 'scene_break');
        if (!hasSceneBreak) {
          continue;
        }

        const metadata = get_data(msg, 'scene_recap_metadata');
        const currentVersionIndex = get_data(msg, 'scene_recap_current_index') ?? 0;
        const versionMetadata = metadata?.[currentVersionIndex];
        const hasLorebookSnapshot = versionMetadata && (versionMetadata.totalActivatedEntries ?? 0) > 0;

        if (hasLorebookSnapshot) {
          sceneBreakIndexForLorebook = i;
          break;
        }
      }

      if (sceneBreakIndexForLorebook !== null) {
        debug(SUBSYSTEM.UI, `Found scene break with lorebook snapshot at message ${sceneBreakIndexForLorebook}, creating lorebook`);
        try {
          const { createCheckpointLorebook } = await import('./checkpointLorebookIntegration.js');
          const lorebookName = await createCheckpointLorebook(sceneBreakIndexForLorebook, newChatName);
          debug(SUBSYSTEM.UI, `${buttonType} created successfully with lorebook ${lorebookName}`);
        } catch (lorebookErr) {
          error(SUBSYSTEM.UI, `Failed to create lorebook for ${buttonType}:`, lorebookErr);
          toast(`${buttonType} created but lorebook creation failed: ${lorebookErr.message}`, 'warning');
        }
      } else {
        debug(SUBSYSTEM.UI, `${buttonType} created successfully (no previous scene break with lorebook snapshot found)`);
        toast(`${buttonType} created (no lorebook - no previous scene break with snapshot)`, 'info');
      }

    } catch (err) {
      error(SUBSYSTEM.UI, `Failed to create ${buttonType}:`, err);
      toast(`Failed to create ${buttonType}: ${err.message}`, 'error');
    }
  }, { capture: true });

  debug(SUBSYSTEM.UI, 'Checkpoint/branch button interceptor installed');
}

export {
  initialize_message_buttons,
  initialize_group_member_buttons,
  set_character_enabled_button_states,
  add_menu_button,
  initialize_menu_buttons,
  initialize_checkpoint_branch_interceptor };
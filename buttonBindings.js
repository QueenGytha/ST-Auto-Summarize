
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
  clearAllCheckedFlags } from
'./index.js';

function initialize_message_buttons() {
  // Hook into SillyTavern's hide/unhide message buttons to refresh memory
  debug("Initializing message button listeners");
  const ctx = getContext();

  const $chat = $("div#chat");

  // when a message is hidden/unhidden, trigger a memory refresh.
  // Yes the chat is saved already when these buttons are clicked, but we need to wait until after to refresh.
  $chat.on("click", ".mes_hide", async () => {
    await ctx.saveChat();
    refresh_memory();
  });
  $chat.on("click", ".mes_unhide", async () => {
    await ctx.saveChat();
    refresh_memory();
  });
}
function initialize_group_member_buttons() {
  // Insert a button into the group member selection to disable summarization
  debug("Initializing group member buttons");

  const $template = $('#group_member_template').find('.group_member_icon');
  const $button = $(`<div title="Toggle summarization for memory" class="right_menu_button fa-solid fa-lg fa-brain ${group_member_enable_button}"></div>`);

  // add listeners
  $(document).on("click", `.${group_member_enable_button}`, (e) => {

    const member_block = $(e.target).closest('.group_member');
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
  const $enable_buttons = $(`#rm_group_members`).find(`.${group_member_enable_button}`);

  // if we are creating a new group (openGroupId is undefined), then hide the buttons
  if (openGroupId === undefined) {
    $enable_buttons.hide();
    return;
  }

  // set the state of each button
  for (const button of $enable_buttons) {
    const member_block = $(button).closest('.group_member');
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

  const $extensions_menu = $('#extensionsMenu');
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

export {
  initialize_message_buttons,
  initialize_group_member_buttons,
  set_character_enabled_button_states,
  add_menu_button,
  initialize_menu_buttons };
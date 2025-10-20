// @flow
import {
    debug,
    getContext,
    forget_button_class,
    edit_button_class,
    summarize_button_class,
    css_button_separator,
    forget_message_toggle,
    summarize_messages,
    open_edit_memory_input,
    refresh_memory,
    group_member_enable_button,
    error,
    toggle_character_enabled,
    openGroupId,
    character_enabled,
    group_member_enable_button_highlight,
    toggle_chat_enabled,
    manualSceneBreakDetection,
    clearAllCheckedFlags
} from './index.js';

function initialize_message_buttons() {
    // Add the message buttons to the chat messages
    debug("Initializing message buttons")
    const ctx = getContext()

    const html = `
<div title="Force Exclude (toggle inclusion of summary from all memory)" class="mes_button ${forget_button_class} fa-solid fa-ban" tabindex="0"></div>
<div title="Edit Summary" class="mes_button ${edit_button_class} fa-solid fa-pen-fancy" tabindex="0"></div>
<div title="Summarize (AI)" class="mes_button ${summarize_button_class} fa-solid fa-quote-left" tabindex="0"></div>
<span class="${css_button_separator}"></span>
`

    // $FlowFixMe[cannot-resolve-name]
    $("#message_template .mes_buttons .extraMesButtons").prepend(html);

    // button events
    // $FlowFixMe[cannot-resolve-name]
    const $chat = $("div#chat")
    // $FlowFixMe[missing-this-annot]
    $chat.on("click", `.${forget_button_class}`, async function () {
        // $FlowFixMe[cannot-resolve-name]
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        forget_message_toggle(message_id);
    })
    // $FlowFixMe[missing-this-annot]
    $chat.on("click", `.${summarize_button_class}`, async function () {
        // $FlowFixMe[cannot-resolve-name]
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await summarize_messages(message_id);  // summarize the message
    });
    // $FlowFixMe[missing-this-annot]
    $chat.on("click", `.${edit_button_class}`, async function () {
        // $FlowFixMe[cannot-resolve-name]
        const message_block = $(this).closest(".mes");
        const message_id = Number(message_block.attr("mesid"));
        await open_edit_memory_input(message_id);
    });

    // when a message is hidden/unhidden, trigger a memory refresh.
    // Yes the chat is saved already when these buttons are clicked, but we need to wait until after to refresh.
    $chat.on("click", ".mes_hide", async () => {
        await ctx.saveChat()
        refresh_memory()
    });
    $chat.on("click", ".mes_unhide", async () => {
        await ctx.saveChat()
        refresh_memory()
    });
}
function initialize_group_member_buttons() {
    // Insert a button into the group member selection to disable summarization
    debug("Initializing group member buttons")

    // $FlowFixMe[cannot-resolve-name]
    const $template = $('#group_member_template').find('.group_member_icon')
    // $FlowFixMe[cannot-resolve-name]
    const $button = $(`<div title="Toggle summarization for memory" class="right_menu_button fa-solid fa-lg fa-brain ${group_member_enable_button}"></div>`)

    // add listeners
    // $FlowFixMe[cannot-resolve-name]
    $(document).on("click", `.${group_member_enable_button}`, (e) => {

        // $FlowFixMe[cannot-resolve-name]
        const member_block = $(e.target).closest('.group_member');
        const char_key = member_block.data('id')

        if (!char_key) {
            error("Character key not found in group member block.")
        }

        // toggle the enabled status of this character
        toggle_character_enabled(char_key)
        set_character_enabled_button_states()  // update the button state
    })

    $template.prepend($button)
}
function set_character_enabled_button_states() {
    // for each character in the group chat, set the button state based on their enabled status
    // $FlowFixMe[cannot-resolve-name]
    const $enable_buttons = $(`#rm_group_members`).find(`.${group_member_enable_button}`)

    // if we are creating a new group (openGroupId is undefined), then hide the buttons
    if (openGroupId === undefined) {
        $enable_buttons.hide()
        return
    }

    // set the state of each button
    for (const button of $enable_buttons) {
        // $FlowFixMe[cannot-resolve-name]
        const member_block = $(button).closest('.group_member');
        const char_key = member_block.data('id')
        const enabled = character_enabled(char_key)
        if (enabled) {
            // $FlowFixMe[cannot-resolve-name]
            $(button).addClass(group_member_enable_button_highlight)
        } else {
            // $FlowFixMe[cannot-resolve-name]
            $(button).removeClass(group_member_enable_button_highlight)
        }
    }
}

// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function add_menu_button(text: any, fa_icon: any, callback: any, hover: any=null) {
    // $FlowFixMe[cannot-resolve-name]
    const $button = $(`
    <div class="list-group-item flex-container flexGap5 interactable" title="${hover ?? text}" tabindex="0">
        <i class="${fa_icon}"></i>
        <span>${text}</span>
    </div>
    `)

    // $FlowFixMe[cannot-resolve-name]
    const $extensions_menu = $('#extensionsMenu');
    if (!$extensions_menu.length) {
        error('Could not find the extensions menu');
    }

    $button.appendTo($extensions_menu)
    $button.click(() => callback());
}
function initialize_menu_buttons() {
    add_menu_button("Toggle Memory", "fa-solid fa-brain", toggle_chat_enabled, "Toggle memory for the current chat.")
    add_menu_button("Scan for Scene Breaks", "fa-solid fa-magnifying-glass", manualSceneBreakDetection, "Automatically detect and mark scene breaks in all messages.")
    add_menu_button("Clear Scene Break Checks", "fa-solid fa-eraser", clearAllCheckedFlags, "Clear the 'checked' flag from all messages so they can be re-scanned for scene breaks.")
}

export {
    initialize_message_buttons,
    initialize_group_member_buttons,
    set_character_enabled_button_states,
    add_menu_button,
    initialize_menu_buttons
};
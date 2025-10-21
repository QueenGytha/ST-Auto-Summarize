// @flow
import {
    getContext,
    get_settings,
    chat_enabled,
    get_data,
    get_memory,
    clean_string_for_title,
    summary_div_class,
    css_message_div,
    css_single_message_summary,
    css_exclude_memory,
    css_lagging_memory,
    summary_reasoning_class,
    edit_memory,
    refresh_memory,
    css_edit_textarea
} from './index.js';

// UI functions
// $FlowFixMe[signature-verification-failure] - Return type is jQuery object (complex, use any)
function get_message_div(index /*: number */) /*: any */ {
    // given a message index, get the div element for that message
    // it will have an attribute "mesid" that is the message index
    // $FlowFixMe[cannot-resolve-name] - $ is jQuery (global)
    const div = $(`div[mesid="${index}"]`);
    if (div.length === 0) {
        return null;
    }
    return div;
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function get_summary_style_class(message /*: STMessage */) /*: string */ {
    const include = get_data(message, 'include');
    const exclude = get_data(message, 'exclude');  // force-excluded by user
    const lagging = get_data(message, 'lagging');  // not injected yet

    let style = ""
    if (include === "Summary of message(s)") {  // included as single message summary
        style = css_single_message_summary
    } else if (exclude) {  // marked as force-excluded
        style = css_exclude_memory
    }

    if (lagging) {
        style = `${style} ${css_lagging_memory}`
    }

    return style
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function update_message_visuals(i /*: number */, style /*: boolean */=true, text /*: ?string */=null) /*: void */ {
    // Update the message visuals according to its current memory status
    // Each message div will have a div added to it with the memory for that message.
    // Even if there is no memory, I add the div because otherwise the spacing changes when the memory is added later.

    // div not found (message may not be loaded)
    const div_element = get_message_div(i);
    if (!div_element) {
        return;
    }

    // remove any existing added divs
    div_element.find(`div.${summary_div_class}`).remove();

    // If setting isn't enabled, don't display memories
    if (!get_settings('display_memories') || !chat_enabled()) {
        return;
    }

    const chat = getContext().chat;
    const message = chat[i];
    const error_message = get_data(message, 'error');
    let reasoning = get_data(message, 'reasoning')
    const memory = get_memory(message)

    // get the div holding the main message text
    const message_element = div_element.find('div.mes_text');
    let style_class = style ? get_summary_style_class(message) : ""

    // if no text is provided, use the memory text
    if (!text) {
        text = ""  // default text when no memory
        if (memory) {
            text = clean_string_for_title(`Memory: ${memory}`)
        } else if (error_message) {
            style_class = ''  // clear the style class if there's an error
            text = `Error: ${error_message}`
        }
    }

    // create the div element for the memory and add it to the message div
    // $FlowFixMe[cannot-resolve-name]
    const memory_div = $(`<div class="${summary_div_class} ${css_message_div}"><span class="${style_class}">${text}</span></div>`)
    if (reasoning) {
        reasoning = clean_string_for_title(reasoning)
        // $FlowFixMe[cannot-resolve-name]
        memory_div.prepend($(`<span class="${summary_reasoning_class}" title="${reasoning}">[Reasoning] </span>`))
    }
    message_element.after(memory_div);

    // add a click event to the memory div to edit the memory
    memory_div.on('click', function () {
        open_edit_memory_input(i);
    })
}
function update_all_message_visuals() {
    // update the message visuals of each visible message, styled according to the inclusion criteria
    const chat = getContext().chat
    // $FlowFixMe[cannot-resolve-name]
    const first_displayed_message_id = Number($('#chat').children('.mes').first().attr('mesid'))
    for (let i=chat.length-1; i >= first_displayed_message_id; i--) {
        update_message_visuals(i, true);
    }
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function open_edit_memory_input(index /*: number */) /*: void */ {
    // Allow the user to edit a message summary
    const message = getContext().chat[index];
    let memory = get_memory(message)
    memory = memory?.trim() ?? '';  // get the current memory text

    const $message_div = get_message_div(index);  // top level div for this message
    // $FlowFixMe[incompatible-use]
    const $message_text_div = $message_div.find('.mes_text')  // holds message text
    // $FlowFixMe[incompatible-use]
    const $memory_div = $message_div.find(`div.${summary_div_class}`);  // div holding the memory text

    // Hide the memory div and add the textarea after the main message text
    // $FlowFixMe[cannot-resolve-name]
    const $textarea = $(`<textarea class="${css_message_div} ${css_edit_textarea}" rows="1"></textarea>`);
    $memory_div.hide();
    $message_text_div.after($textarea);
    $textarea.focus();  // focus on the textarea
    $textarea.val(memory);  // set the textarea value to the memory text (this is done after focus to keep the cursor at the end)
    $textarea.height($textarea[0].scrollHeight-10);  // set the height of the textarea to fit the text

    function confirm_edit() {
        const new_memory = $textarea.val();
        if (new_memory === memory) {  // no change
            cancel_edit()
            return;
        }
        edit_memory(message, new_memory)
        $textarea.remove();  // remove the textarea
        $memory_div.show();  // show the memory div
        refresh_memory();
    }

    function cancel_edit() {
        $textarea.remove();  // remove the textarea
        $memory_div.show();  // show the memory div
    }

    // save when the textarea loses focus, or when enter is pressed
    $textarea.on('blur', confirm_edit);
    $textarea.on('keydown', function (event) {
        if (event.key === 'Enter') {  // confirm edit
            event.preventDefault();
            confirm_edit();
        } else if (event.key === 'Escape') {  // cancel edit
            event.preventDefault();
            cancel_edit();
        }
    })
}

export {
    get_message_div,
    get_summary_style_class,
    update_message_visuals,
    update_all_message_visuals,
    open_edit_memory_input
};
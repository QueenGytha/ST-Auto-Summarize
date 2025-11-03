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

    let style = ""
    if (include === "Summary of message(s)") {  // included as single message summary
        style = css_single_message_summary
    } else if (exclude) {  // marked as force-excluded
        style = css_exclude_memory
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

    // Don't display memories if chat is disabled
    if (!chat_enabled()) {
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

export {
    get_message_div,
    get_summary_style_class,
    update_message_visuals,
    update_all_message_visuals
};

import {
    MODULE_NAME_FANCY,
    get_settings,
    debounce,
    getContext,
    debounce_timeout,
    getMaxContextSize,
    default_settings,
    set_settings,
    refresh_settings,
    refresh_memory,
    save_profile
} from './index.js';

// Consistent prefix for ALL extension logs - easily searchable
const LOG_PREFIX = '[AutoSummarize]';

// Subsystem prefixes for filtering specific functionality
const SUBSYSTEM = {
    CORE: '[Core]',
    MEMORY: '[Memory]',
    SCENE: '[Scene]',
    RUNNING: '[Running]',
    COMBINED: '[Combined]',
    VALIDATION: '[Validation]',
    UI: '[UI]',
    PROFILE: '[Profile]',
    EVENT: '[Event]'
};

function log(subsystem, ...args) {
    // If subsystem is not a string starting with '[', treat it as a regular arg
    if (typeof subsystem !== 'string' || !subsystem.startsWith('[')) {
        console.log(LOG_PREFIX, subsystem, ...args);
    } else {
        console.log(LOG_PREFIX, subsystem, ...args);
    }
}

function debug(subsystem, ...args) {
    if (!get_settings('debug_mode')) return;

    // If subsystem is not a string starting with '[', treat it as a regular arg
    if (typeof subsystem !== 'string' || !subsystem.startsWith('[')) {
        console.log(LOG_PREFIX, '[DEBUG]', subsystem, ...args);
    } else {
        console.log(LOG_PREFIX, '[DEBUG]', subsystem, ...args);
    }
}

function error(subsystem, ...args) {
    // If subsystem is not a string starting with '[', treat it as a regular arg
    if (typeof subsystem !== 'string' || !subsystem.startsWith('[')) {
        console.error(LOG_PREFIX, '[ERROR]', subsystem, ...args);
        const message = typeof subsystem === 'string' ? subsystem : String(subsystem);
        toastr.error(message, MODULE_NAME_FANCY);
    } else {
        console.error(LOG_PREFIX, '[ERROR]', subsystem, ...args);
        const message = typeof args[0] === 'string' ? args[0] : String(args[0]);
        toastr.error(message, MODULE_NAME_FANCY);
    }
}

function toast(message, type="info") {
    // debounce the toast messages
    toastr[type](message, MODULE_NAME_FANCY);
}
const toast_debounced = debounce(toast, 500);

/**
 * IMPORTANT: All extension code MUST use the centralized logging functions (log, debug, error)
 * instead of raw console.log/error/debug calls. This ensures:
 * 1. ALL logs have the [AutoSummarize] prefix for easy filtering
 * 2. Debug logs can be toggled via the debug_mode setting
 * 3. Error logs automatically show toast notifications to the user
 * 4. Consistent formatting across the entire extension
 *
 * Example usage:
 *   log(SUBSYSTEM.SCENE, "Scene created", sceneData);
 *   debug(SUBSYSTEM.MEMORY, "Memory updated", memoryState);
 *   error(SUBSYSTEM.VALIDATION, "Validation failed", err);
 *
 * DO NOT USE:
 *   console.log() - Use log() instead
 *   console.error() - Use error() instead
 *   console.debug() - Use debug() instead
 */

const saveChatDebounced = debounce(() => getContext().saveChat(), debounce_timeout.relaxed);
function count_tokens(text, padding = 0) {
    // count the number of tokens in a text
    let ctx = getContext();
    return ctx.getTokenCount(text, padding);
}
function get_context_size() {
    // Get the current context size
    return getMaxContextSize();
}
function get_long_token_limit() {
    // Get the long-term memory token limit, given the current context size and settings
    let long_term_context_limit = get_settings('long_term_context_limit');
    let number_type = get_settings('long_term_context_type')
    if (number_type === "percent") {
        let context_size = get_context_size();
        return Math.floor(context_size * long_term_context_limit / 100);
    } else {
        return long_term_context_limit
    }
}
function get_short_token_limit() {
    // Get the short-term memory token limit, given the current context size and settings
    let short_term_context_limit = get_settings('short_term_context_limit');
    let number_type = get_settings('short_term_context_type')
    if (number_type === "percent") {
        let context_size = get_context_size();
        return Math.floor(context_size * short_term_context_limit / 100);
    } else {
        return short_term_context_limit
    }
}
function get_current_character_identifier() {
    // uniquely identify the current character
    // You have to use the character's avatar image path to uniquely identify them
    let context = getContext();
    if (context.groupId) {
        return  // if a group is selected, return
    }

    // otherwise get the avatar image path of the current character
    let index = context.characterId;
    if (!index) {  // not a character
        return null;
    }

    return context.characters[index].avatar;
}
function get_current_chat_identifier() {
    // uniquely identify the current chat
    let context = getContext();
    if (context.groupId) {
        return context.groupId;
    }
    return context.chatId

}
function get_extension_directory() {
    // get the directory of the extension
    let index_path = new URL(import.meta.url).pathname
    return index_path.substring(0, index_path.lastIndexOf('/'))  // remove the /index.js from the path
}
function clean_string_for_title(text) {
    // clean a given string for use in a div title.
    return text.replace(/["&'<>]/g, function(match) {
        switch (match) {
            case '"': return "&quot;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case "<": return "&lt;";
            case ">": return "&gt;";
        }
    })
}
function escape_string(text) {
    // escape control characters in the text
    if (!text) return text
    return text.replace(/[\x00-\x1F\x7F]/g, function(match) {
        // Escape control characters
        switch (match) {
          case '\n': return '\\n';
          case '\t': return '\\t';
          case '\r': return '\\r';
          case '\b': return '\\b';
          case '\f': return '\\f';
          default: return '\\x' + match.charCodeAt(0).toString(16).padStart(2, '0');
        }
    });
}
function unescape_string(text) {
    // given a string with escaped characters, unescape them
    if (!text) return text
    return text.replace(/\\[ntrbf0x][0-9a-f]{2}|\\[ntrbf]/g, function(match) {
        switch (match) {
          case '\\n': return '\n';
          case '\\t': return '\t';
          case '\\r': return '\r';
          case '\\b': return '\b';
          case '\\f': return '\f';
          default: {
            // Handle escaped hexadecimal characters like \\xNN
            const hexMatch = match.match(/\\x([0-9a-f]{2})/i);
            if (hexMatch) {
              return String.fromCharCode(parseInt(hexMatch[1], 16));
            }
            return match; // Return as is if no match
          }
        }
    });
}
function check_st_version() {
    // Check to see if the current version of ST is acceptable.
    // Currently checks for the "symbols" property of the global context,
    //   which was added in https://github.com/SillyTavern/SillyTavern/pull/3763#issue-2948421833
    log("Checking ST version...")
    if (getContext().symbols !== undefined) {
        return true
    } else {
        log(`Symbols not found in context: [${getContext().symbols}]`)
        toast("Incompatible ST version - please update.", "error")
    }
}

function display_injection_preview() {
    let text = refresh_memory()
    text = `...\n\n${text}\n\n...`
    display_text_modal("Memory State Preview", text);
}

async function display_text_modal(title, text="") {
    // Display a modal with the given title and text
    // replace newlines in text with <br> for HTML
    let ctx = getContext();
    text = text.replace(/\n/g, '<br>');
    let html = `<h2>${title}</h2><div style="text-align: left; overflow: auto;">${text}</div>`
    //const popupResult = await ctx.callPopup(html, 'text', undefined, { okButton: `Close` });
    let popup = new ctx.Popup(html, ctx.POPUP_TYPE.TEXT, undefined, {okButton: 'Close', allowVerticalScrolling: true});
    await popup.show()
}
async function get_user_setting_text_input(key, title, description="", defaultValue="") {
    let value = get_settings(key) ?? '';
    title = `
<h3>${title}</h3>
<p>${description}</p>
`
    let restore_button = {
        text: 'Restore Default',
        appendAtEnd: true,
        action: () => {
            popup.mainInput.value = default_settings[key] ?? '';
        }
    }
    let ctx = getContext();
    let popup = new ctx.Popup(title, ctx.POPUP_TYPE.INPUT, value, {rows: 20, customButtons: [restore_button]});
    popup.mainInput.classList.remove('result-control');
    let input = await popup.show();
    if (input !== undefined && input !== null && input !== false) {
        set_settings(key, input);
        save_profile(); // auto-save when prompt is edited
        refresh_settings()
        refresh_memory()
    }
}

export {
    SUBSYSTEM,
    log,
    debug,
    error,
    toast,
    toast_debounced,
    saveChatDebounced,
    count_tokens,
    get_context_size,
    get_long_token_limit,
    get_short_token_limit,
    get_current_character_identifier,
    get_current_chat_identifier,
    get_extension_directory,
    clean_string_for_title,
    escape_string,
    unescape_string,
    check_st_version,
    display_injection_preview,
    display_text_modal,
    get_user_setting_text_input
};
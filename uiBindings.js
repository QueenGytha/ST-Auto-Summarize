// @flow
import {
    get_settings,
    set_settings,
    refresh_settings,
    refresh_memory,
    refresh_memory_debounced,
    error,
    escape_string,
    unescape_string,
    settings_content_class,
    settings_ui_map,
    save_profile
} from './index.js';

/**
 * Bind a UI element to a setting.
 * @param selector {string} jQuery Selector for the UI element
 * @param key {string} Key of the setting
 * @param type {string} Type of the setting (number, boolean)
 * @param callback {function} Callback function to run when the setting is updated
 * @param disable {boolean} Whether to disable the element when chat is disabled
 */

// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function bind_setting(selector /*: any */, key /*: any */, type /*: any */=null, callback /*: any */=null, disable /*: any */=true) {
    // Bind a UI element to a setting, so if the UI element changes, the setting is updated
    selector = `.${settings_content_class} ${selector}`  // add the settings div to the selector
    // $FlowFixMe[cannot-resolve-name]
    const element = $(selector)
    settings_ui_map[key] = [element, type]

    // if no elements found, log error
    if (element.length === 0) {
        error(`No element found for selector [${selector}] for setting [${key}]`);
        return;
    }

    // mark as a settings UI function
    if (disable) {
        element.addClass('settings_input');
    }

    // default trigger for a settings update is on a "change" event (as opposed to an input event)
    const trigger = 'change';

    // Set the UI element to the current setting value
    set_setting_ui_element(key, element, type);

    // Make the UI element update the setting when changed
    // $FlowFixMe[missing-this-annot]
    element.on(trigger, function (_event) {
        let value;
        if (type === 'number') {  // number input
            // $FlowFixMe[cannot-resolve-name]
            value = Number($(this).val());
        } else if (type === 'boolean') {  // checkbox
            // $FlowFixMe[cannot-resolve-name]
            value = Boolean($(this).prop('checked'));
        } else {  // text, dropdown, select2
            // $FlowFixMe[cannot-resolve-name]
            value = $(this).val();
            value = unescape_string(value)  // ensures values like "\n" are NOT escaped from input
        }

        // update the setting
        set_settings(key, value)

        // auto-save to current profile
        save_profile();

        // trigger callback if provided, passing the new value
        if (callback !== null) {
            callback(value);
        }

        // update all other settings UI elements
        refresh_settings()

        // refresh memory state (update message inclusion criteria, etc)
        if (trigger === 'change') {
            refresh_memory();
        // $FlowFixMe[invalid-compare]
        } else if (trigger === 'input') {
            refresh_memory_debounced();  // debounce the refresh for input elements
        }
    });
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function bind_function(selector /*: any */, func /*: any */, disable /*: any */=true) {
    // bind a function to an element (typically a button or input)
    // if disable is true, disable the element if chat is disabled
    selector = `.${settings_content_class} ${selector}`
    // $FlowFixMe[cannot-resolve-name]
    const element = $(selector);
    if (element.length === 0) {
        error(`No element found for selector [${selector}] when binding function`);
        return;
    }

    // mark as a settings UI element
    if (disable) {
        element.addClass('settings_input');
    }

    // check if it's an input element, and bind a "change" event if so
    if (element.is('input')) {
        element.on('change', function (event) {
            func(event);
        });
    } else {  // otherwise, bind a "click" event
        element.on('click', function (event) {
            func(event);
        });
    }
}
// $FlowFixMe[signature-verification-failure] [missing-local-annot]
function set_setting_ui_element(key /*: any */, element /*: any */, type /*: any */) {
    // Set a UI element to the current setting value
    let radio = false;
    if (element.is('input[type="radio"]')) {
        radio = true;
    }

    // get the setting value
    let setting_value = get_settings(key);
    if (type === "text") {
        setting_value = escape_string(setting_value)  // escape values like "\n"
    }

    // initialize the UI element with the setting value
    if (radio) {  // if a radio group, select the one that matches the setting value
        const selected = element.filter(`[value="${setting_value}"]`)
        if (selected.length === 0) {
            error(`Error: No radio button found for value [${setting_value}] for setting [${key}]`);
            return;
        }
        selected.prop('checked', true);
    } else {  // otherwise, set the value directly
        if (type === 'boolean') {  // checkbox
            element.prop('checked', setting_value);
        } else {  // text input or dropdown
            element.val(setting_value);
        }
    }
}

export { bind_setting, bind_function, set_setting_ui_element };
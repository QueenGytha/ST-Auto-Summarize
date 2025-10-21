// @flow
import { get_connection_profile_api, getContext, getPresetManager, amount_gen, get_settings, toast_debounced, debug } from './index.js';

// Completion presets
// $FlowFixMe[signature-verification-failure]
function get_current_preset() {
    // get the currently selected completion preset
    return getPresetManager().getSelectedPresetName()
}
// $FlowFixMe[signature-verification-failure]
async function get_summary_preset() {
    // get the current summary preset OR the default if it isn't valid for the current API
    let preset_name = get_settings('completion_preset');
    if (preset_name === "" || !await verify_preset(preset_name)) {  // none selected or invalid, use the current preset
        preset_name = get_current_preset();
    }
    return preset_name
}
// $FlowFixMe[signature-verification-failure]
async function set_preset(name /*: string */) /*: Promise<void> */ {
    if (name === get_current_preset()) return;  // If already using the current preset, return

    // $FlowFixMe[constant-condition]
    if (!check_preset_valid()) return;  // don't set an invalid preset

    // Set the completion preset
    debug(`Setting completion preset to ${name}`)
    if (get_settings('debug_mode')) {
        // commented out toast // toastr.info(`Setting completion preset to ${name}`);
    }
    const ctx = getContext();
    await ctx.executeSlashCommandsWithOptions(`/preset ${name}`)
}
// $FlowFixMe[signature-verification-failure]
async function get_presets() /*: Promise<Array<string>> */ {
    // Get the list of available completion presets for the selected connection profile API
    const summary_api = await get_connection_profile_api()  // API for the summary connection profile (undefined if not active)
    const { preset_names } = getPresetManager().getPresetList(summary_api)  // presets for the given API (current if undefined)
    // array of names
    if (Array.isArray(preset_names)) return preset_names
    // object of {names: index}
    // $FlowFixMe[incompatible-type] - Object.keys returns Array<string> but Flow can't infer preset_names type
    return (Object.keys(preset_names) /*: Array<string> */)
}
// $FlowFixMe[signature-verification-failure]
async function verify_preset(name /*: string */) /*: Promise<boolean> */ {
    // check if the given preset name is valid for the current API
    if (name === "") return true;  // no preset selected, always valid

    const preset_names = await get_presets()

    if (Array.isArray(preset_names)) {  // array of names
        return preset_names.includes(name)
    } else {  // object of {names: index}
        return preset_names[name] !== undefined
    }

}
// $FlowFixMe[signature-verification-failure]
async function check_preset_valid() {
    // check whether the current preset selected for summarization is valid
    const summary_preset = get_settings('completion_preset')
    const valid_preset = await verify_preset(summary_preset)
    if (!valid_preset) {
        toast_debounced(`Your selected summary preset "${summary_preset}" is not valid for the current API.`, "warning")
        return false
    }
    return true
}
// $FlowFixMe[signature-verification-failure]
async function get_summary_preset_max_tokens() {
    // get the maximum token length for the chosen summary preset
    const preset_name = await get_summary_preset()
    const preset = getPresetManager().getCompletionPresetByName(preset_name)

    // if the preset doesn't have a genamt (which it may not for some reason), use the current genamt. See https://discord.com/channels/1100685673633153084/1100820587586273343/1341566534908121149
    // Also if you are using chat completion, it's openai_max_tokens instead.
    const max_tokens = preset?.genamt || preset?.openai_max_tokens || amount_gen
    debug("Got summary preset genamt: "+max_tokens)

    return max_tokens
}

export {
    get_current_preset,
    get_summary_preset,
    set_preset,
    get_presets,
    verify_preset,
    check_preset_valid,
    get_summary_preset_max_tokens
};

import { get_connection_profile_api, getContext, getPresetManager, amount_gen, get_settings, toast_debounced, debug } from './index.js';

// Completion presets
function get_current_preset() {
  // get the currently selected completion preset
  return getPresetManager().getSelectedPresetName();
}
async function get_summary_preset() {
  // get the current summary preset OR the default if it isn't valid for the current API
  let preset_name = get_settings('completion_preset');
  if (preset_name === "" || !(await verify_preset(preset_name))) {// none selected or invalid, use the current preset
    preset_name = get_current_preset();
  }
  return preset_name;
}
async function set_preset(name ) {
  if (name === get_current_preset()) {return;} // If already using the current preset, return

  if (!check_preset_valid()) {return;} // don't set an invalid preset

  // Set the completion preset
  debug(`Setting completion preset to ${name}`);
  const ctx = getContext();
  await ctx.executeSlashCommandsWithOptions(`/preset ${name}`);
}
async function get_presets() {
  // Get the list of available completion presets for the selected connection profile API
  const summary_api = await get_connection_profile_api(); // API for the summary connection profile (undefined if not active)
  const { preset_names } = getPresetManager().getPresetList(summary_api); // presets for the given API (current if undefined)
  // array of names
  if (Array.isArray(preset_names)) {return preset_names;}
  // object of {names: index}
  return Object.keys(preset_names) ;
}
async function verify_preset(name ) {
  // check if the given preset name is valid for the current API
  if (name === "") {return true;} // no preset selected, always valid

  const preset_names = await get_presets();

  // array of names vs object of {names: index}
  return Array.isArray(preset_names)
    ? preset_names.includes(name)
    : preset_names[name] !== undefined;
}
async function check_preset_valid() {
  // check whether the current preset selected for summarization is valid
  const summary_preset = get_settings('completion_preset');
  const valid_preset = await verify_preset(summary_preset);
  if (!valid_preset) {
    toast_debounced(`Your selected summary preset "${summary_preset}" is not valid for the current API.`, "warning");
    return false;
  }
  return true;
}
async function get_summary_preset_max_tokens() {
  // get the maximum token length for the chosen summary preset
  const preset_name = await get_summary_preset();
  const preset = getPresetManager().getCompletionPresetByName(preset_name);

  // if the preset doesn't have a genamt (which it may not for some reason), use the current genamt. See https://discord.com/channels/1100685673633153084/1100820587586273343/1341566534908121149
  // Also if you are using chat completion, it's openai_max_tokens instead.
  const max_tokens = preset?.genamt || preset?.openai_max_tokens || amount_gen;
  debug("Got summary preset genamt: " + max_tokens);

  return max_tokens;
}

export {
  get_current_preset,
  get_summary_preset,
  set_preset,
  get_presets,
  verify_preset,
  check_preset_valid,
  get_summary_preset_max_tokens };
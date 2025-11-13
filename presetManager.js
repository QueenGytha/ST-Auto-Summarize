
import { get_connection_profile_api, getContext, getPresetManager, amount_gen, debug } from './index.js';

// Completion presets
function get_current_preset() {
  // get the currently selected completion preset
  return getPresetManager().getSelectedPresetName();
}
function get_recap_preset() {
  // NOTE: The 'completion_preset' setting was removed in commit 124d47b.
  // This function now simply returns the current preset.
  // Kept for backward compatibility with get_recap_preset_max_tokens().
  return get_current_preset();
}
async function set_preset(name ) {
  if (name === get_current_preset()) {return;} // If already using the current preset, return

  if (!(await verify_preset(name))) {return;} // don't set an invalid preset

  // Set the completion preset
  debug(`Setting completion preset to ${name}`);
  const ctx = getContext();
  await ctx.executeSlashCommandsWithOptions(`/preset ${name}`);
}
async function get_presets() {
  // Get the list of available completion presets for the selected connection profile API
  const recap_api = await get_connection_profile_api(); // API for the recap connection profile (null if not active)

  // Convert null to undefined - SillyTavern's getPresetList expects undefined for "current API"
  // but get_connection_profile_api returns null when Connection Profiles extension isn't active yet
  const api_to_use = recap_api === null ? undefined : recap_api;

  const { preset_names } = getPresetManager().getPresetList(api_to_use); // presets for the given API (current if undefined)
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
function check_preset_valid() {
  // NOTE: This function is now a no-op. The 'completion_preset' setting was removed
  // in commit 124d47b as part of removing general message recapping settings.
  // Scene-specific preset validation happens in their respective dropdown updates.
  // This function is kept for backward compatibility with existing callers.
  return true;
}
function get_recap_preset_max_tokens() {
  // get the maximum token length for the chosen recap preset
  const preset_name = get_recap_preset();
  const preset = getPresetManager().getCompletionPresetByName(preset_name);

  // if the preset doesn't have a genamt (which it may not for some reason), use the current genamt. See https://discord.com/channels/1100685673633153084/1100820587586273343/1341566534908121149
  // Also if you are using chat completion, it's openai_max_tokens instead.
  const max_tokens = preset?.genamt || preset?.openai_max_tokens || amount_gen;
  debug("Got recap preset genamt: " + max_tokens);

  return max_tokens;
}

export {
  get_current_preset,
  get_recap_preset,
  set_preset,
  get_presets,
  verify_preset,
  check_preset_valid,
  get_recap_preset_max_tokens };
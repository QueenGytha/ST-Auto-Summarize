
import {
  get_settings,
  set_settings,
  error,
  log,
  toast,
  global_settings,
  extension_settings,
  refresh_settings,
  MODULE_NAME,
  MODULE_NAME_FANCY,
  get_current_character_identifier,
  get_current_chat_identifier,
  check_preset_valid } from
'./index.js';
import { JSON_INDENT_SPACES } from './constants.js';


// Profile management
function copy_settings(profile  = null) {
  // copy the setting from the given profile (or current settings if none provided)
  let settings;

  if (!profile) {// no profile given, copy current settings
    settings = structuredClone(extension_settings[MODULE_NAME]);
  } else {// copy from the profile
    const profiles = get_settings('profiles');
    if (profiles[profile] === undefined) {// profile doesn't exist, return empty
      return {};
    }

    // copy the settings from the profile
    settings = structuredClone(profiles[profile]);
  }

  // remove global settings from the copied settings
  for (const key of Object.keys(global_settings)) {
    delete settings[key];
  }
  return settings;
}
function detect_settings_difference(profile  = null) {
  // check if the current settings differ from the given profile
  let activeProfile = profile;
  if (!activeProfile) {// if none provided, compare to the current profile
    activeProfile = get_settings('profile');
  }
  const current_settings = copy_settings();
  const profile_settings = copy_settings(activeProfile);

  let different = false;
  for (const key of Object.keys(profile_settings)) {
    if (profile_settings[key] !== current_settings[key]) {
      different = true;
      break;
    }
  }
  return different;
}
function save_profile(profile  = null) {
  // Save the current settings to the given profile
  let targetProfile = profile;
  if (!targetProfile) {// if none provided, save to the current profile
    targetProfile = get_settings('profile');
  }
  log("Saving Configuration Profile: " + targetProfile);

  // save the current settings to the profile
  const profiles = get_settings('profiles');
  profiles[targetProfile] = copy_settings();
  set_settings('profiles', profiles);

  // check preset validity
  check_preset_valid();
}
function load_profile(profile  = null) {
  // load a given settings profile
  const current_profile = get_settings('profile');
  let targetProfile = profile;
  if (!targetProfile) {// if none provided, reload the current profile
    targetProfile = current_profile;
  }

  const settings = copy_settings(targetProfile); // copy the settings from the profile
  if (!settings) {
    error("Profile not found: " + profile);
    return;
  }

  log("Loading Configuration Profile: " + profile);
  Object.assign(extension_settings[MODULE_NAME], settings); // update the settings
  set_settings('profile', profile); // set the current profile
  if (get_settings("notify_on_profile_switch") && current_profile !== profile) {
    toast(`Switched to profile "${profile}"`, 'info');
  }
  refresh_settings();
}
function export_profile(profile  = null) {
  // export a settings profile
  let targetProfile = profile;
  if (!targetProfile) {// if none provided, reload the current profile
    targetProfile = get_settings('profile');
  }

  const settings = copy_settings(targetProfile); // copy the settings from the profile
  if (!settings) {
    error("Profile not found: " + profile);
    return;
  }

  log("Exporting Configuration Profile: " + profile);
  const data = JSON.stringify(settings, null, JSON_INDENT_SPACES);
  download(data, `${profile}.json`, 'application/json');
}
async function import_profile(e ) {
  // e is a DOM event object - legitimate use of any
  const file = e.target.files[0];
  if (!file) {
    return;
  }

  const name = file.name.replace('.json', '');
  const data = await parseJsonFile(file);

  // save to the profile
  const profiles = get_settings('profiles');
  profiles[name] = data;
  set_settings('profiles', profiles);

  toast(`${MODULE_NAME_FANCY} profile \"${name}\" imported`, 'success');
  e.target.value = null;

  refresh_settings();
}
async function rename_profile() {
  // Rename the current profile via user input
  const ctx = getContext();
  const old_name = get_settings('profile');
  const new_name = await ctx.Popup.show.input("Rename Configuration Profile", `Enter a new name:`, old_name);

  // if it's the same name or none provided, do nothing
  if (!new_name || old_name === new_name) {
    return;
  }

  const profiles = get_settings('profiles');

  // check if the new name already exists
  if (profiles[new_name]) {
    error(`Profile [${new_name}] already exists`);
    return;
  }

  // rename the profile
  profiles[new_name] = profiles[old_name];
  delete profiles[old_name];
  set_settings('profiles', profiles);
  set_settings('profile', new_name); // set the current profile to the new name

  // if any characters are using the old profile, update it to the new name
  const character_profiles = get_settings('character_profiles');
  for (const [character_key, character_profile] of Object.entries(character_profiles)) {
    if (character_profile === old_name) {
      character_profiles[character_key] = new_name;
    }
  }

  log(`Renamed profile [${old_name}] to [${new_name}]`);
  refresh_settings();
}
function new_profile() {
  // create a new profile
  const profiles = get_settings('profiles');
  let profile = 'New Profile';
  let i = 1;
  while (profiles[profile]) {
    profile = `New Profile ${i}`;
    i++;
  }
  save_profile(profile);
  load_profile(profile);
}
function delete_profile() {
  // Delete the current profile
  if (get_settings('profiles').length === 1) {
    error("Cannot delete your last profile");
    return;
  }
  const profile = get_settings('profile');
  const profiles = get_settings('profiles');

  // delete the profile
  delete profiles[profile];
  set_settings('profiles', profiles);
  toast(`Deleted Configuration Profile: \"${profile}\"`, "success");

  // remove any references to this profile connected to characters or chats
  const character_profiles = get_settings('character_profiles');
  const chat_profiles = get_settings('chat_profiles');
  for (const [id, name] of Object.entries(character_profiles)) {
    if (name === profile) {
      delete character_profiles[id];
    }
  }
  for (const [id, name] of Object.entries(chat_profiles)) {
    if (name === profile) {
      delete chat_profiles[id];
    }
  }
  set_settings('character_profiles', character_profiles);
  set_settings('chat_profiles', chat_profiles);

  auto_load_profile();
}
function toggle_character_profile() {
  // Toggle whether the current profile is set to the default for the current character
  const key = get_current_character_identifier(); // uniquely identify the current character or group chat
  log("Character Key: " + key);
  if (!key) {// no character selected
    return;
  }

  // current profile
  const profile = get_settings('profile');

  // if the character profile is already set to the current profile, unset it.
  // otherwise, set it to the current profile.
  set_character_profile(key, profile === get_character_profile() ? null : profile);
}
function toggle_chat_profile() {
  // Toggle whether the current profile is set to the default for the current character
  const key = get_current_chat_identifier(); // uniquely identify the current chat
  log("Chat ID: " + key);
  if (!key) {// no chat selected
    return;
  }

  // current profile
  const profile = get_settings('profile');

  // if the chat profile is already set to the current profile, unset it.
  // otherwise, set it to the current profile.
  set_chat_profile(key, profile === get_chat_profile() ? null : profile);
}
function get_character_profile(key  = null) {
  // Get the profile for a given character
  let characterKey = key;
  if (!characterKey) {// if none given, assume the current character
    characterKey = get_current_character_identifier();
  }
  const character_profiles = get_settings('character_profiles');
  if (!character_profiles || typeof character_profiles !== 'object') {
    return null;
  }
  return character_profiles[characterKey];
}
function set_character_profile(key , profile  = null) {
  // Set the profile for a given character (or unset it if no profile provided)
  const character_profiles = get_settings('character_profiles');

  if (profile) {
    character_profiles[key] = profile;
    log(`Set character [${key}] to use profile [${profile}]`);
  } else {
    delete character_profiles[key];
    log(`Unset character [${key}] default profile`);
  }

  set_settings('character_profiles', character_profiles);
  refresh_settings();
}
function get_chat_profile(id  = null) {
  // Get the profile for a given chat
  let chatId = id;
  if (!chatId) {// if none given, assume the current character
    chatId = get_current_chat_identifier();
  }
  const profiles = get_settings('chat_profiles');
  return profiles[chatId];
}
function set_chat_profile(id , profile  = null) {
  // Set the profile for a given chat (or unset it if no profile provided)
  const chat_profiles = get_settings('chat_profiles');

  if (profile) {
    chat_profiles[id] = profile;
    log(`Set chat [${id}] to use profile [${profile}]`);
  } else {
    delete chat_profiles[id];
    log(`Unset chat [${id}] default profile`);
  }

  set_settings('chat_profiles', chat_profiles);
  refresh_settings();
}
function auto_load_profile() {
  // Load the settings profile for the current chat or character
  const profile = get_chat_profile() || get_character_profile();
  load_profile(profile || 'Default');
  refresh_settings();
}

export {
  copy_settings,
  detect_settings_difference,
  save_profile,
  load_profile,
  export_profile,
  import_profile,
  rename_profile,
  new_profile,
  delete_profile,
  toggle_character_profile,
  toggle_chat_profile,
  get_character_profile,
  set_character_profile,
  get_chat_profile,
  set_chat_profile,
  auto_load_profile };
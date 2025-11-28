
import {
  log,
  error,
  toast,
  debug,
  extension_settings,
  MODULE_NAME,
  refresh_settings,
  saveSettingsDebounced,
  get_extension_directory,
  load_profile,
  getContext,
  refresh_memory,
  update_all_message_visuals,
  scrollChatToBottom,
  selected_group,
  selectorsSillyTavern } from
'./index.js';
import { default_settings } from './defaultSettings.js';
import { DEFAULT_ENTITY_TYPES } from './entityTypes.js';

// Settings
const global_settings = {
  profiles: {}, // dict of profiles by name
  character_profiles: {}, // dict of character identifiers to profile names
  chat_profiles: {}, // dict of chat identifiers to profile names
  profile: 'Default', // Current profile
  notify_on_profile_switch: false,
  chats_enabled: {}, // dict of chat IDs to whether memory is enabled
  global_toggle_state: true, // global state of memory (used when a profile uses the global state)
  disabled_group_characters: {}, // group chat IDs mapped to a list of disabled character keys
  memory_edit_interface_settings: {}, // settings last used in the memory edit interface
  operations_presets: {}, // operations presets (global, not profile-specific)
  operation_artifacts: {}, // operation artifacts (global, not profile-specific)
  active_operations_preset_global: null, // user-selected operations preset (global, not profile-specific)
  character_sticky_presets: {}, // character-specific preset overrides (global, not profile-specific)
  chat_sticky_presets: {} // chat-specific preset overrides (global, not profile-specific)
};
const settings_ui_map = {}; // map of settings to UI elements

function getDefaultAutoLorebookSettings() {
  // Build a fresh copy of the global Auto-Lorebooks defaults each time
  return {
    nameTemplate: 'z-AutoLB-{{char}}-{{chat}}',
    deleteOnChatDelete: true,
    autoReorderAlphabetically: true,
    entity_types: [...DEFAULT_ENTITY_TYPES]
  };
}

// Settings Management
function initialize_settings() {
  if (extension_settings[MODULE_NAME] !== undefined) {// setting already initialized
    log("Settings already initialized.");
    soft_reset_settings();
  } else {// no settings present, first time initializing
    log("Extension settings not found. Initializing...");
    hard_reset_settings();
  }

  // Initialize Auto-Lorebooks GLOBAL settings (merged extension uses separate namespace)
  // NOTE: Per-profile settings (tracking, recap_processing) are stored in profiles via default_settings
  if (!extension_settings.autoLorebooks) {
    log("Auto-Lorebooks global settings not found. Initializing with defaults...");
    extension_settings.autoLorebooks = getDefaultAutoLorebookSettings();
    saveSettingsDebounced();
  } else {
    // Merge with defaults for any missing global properties
    const defaultLorebooks = getDefaultAutoLorebookSettings();

    // Shallow merge global settings (queue settings removed)
    extension_settings.autoLorebooks = {
      ...defaultLorebooks,
      ...extension_settings.autoLorebooks
    };

    // Purge legacy queue block if still present in saved settings
    if (extension_settings.autoLorebooks.queue) {
      delete extension_settings.autoLorebooks.queue;
    }

    // Remove old per-profile settings from global namespace if they exist
    // These are now stored in individual profiles
    if (extension_settings.autoLorebooks.tracking) {
      delete extension_settings.autoLorebooks.tracking;
    }
    if (extension_settings.autoLorebooks.recap_processing) {
      delete extension_settings.autoLorebooks.recap_processing;
    }
  }

  // load default profile
  load_profile();
}
function hard_reset_settings() {
  // Set the settings to the completely fresh values, deleting all profiles too
  if (global_settings['profiles']['Default'] === undefined) {// if the default profile doesn't exist, create it
    global_settings['profiles']['Default'] = structuredClone(default_settings);
  }
  extension_settings[MODULE_NAME] = structuredClone(default_settings);

  for (const key of Object.keys(global_settings)) {
    if (extension_settings[MODULE_NAME][key] === undefined) {
      extension_settings[MODULE_NAME][key] = structuredClone(global_settings[key]);
    }
  }

  extension_settings.autoLorebooks = getDefaultAutoLorebookSettings();
  saveSettingsDebounced();
}
function soft_reset_settings() {
  // fix any missing settings without destroying profiles
  extension_settings[MODULE_NAME] = Object.assign(
    structuredClone(default_settings),
    extension_settings[MODULE_NAME]
  );

  for (const key of Object.keys(global_settings)) {
    if (extension_settings[MODULE_NAME][key] === undefined) {
      extension_settings[MODULE_NAME][key] = structuredClone(global_settings[key]);
    }
  }

  // check for any missing profiles
  const profiles = get_settings('profiles');
  if (Object.keys(profiles).length === 0) {
    log("No profiles found, creating default profile.");
    profiles['Default'] = structuredClone(default_settings);
    set_settings('profiles', profiles);
  } else {// for each existing profile, add any missing default settings without overwriting existing settings
    for (const [profile, settings] of Object.entries(profiles)) {
      profiles[profile] = Object.assign(structuredClone(default_settings), settings);
    }
    set_settings('profiles', profiles);
  }
}
async function reset_settings() {
  // Reset ONLY the currently selected profile to defaults plus the global Auto-Lorebooks settings
  // Preserves all other profiles

  const currentProfile = get_settings('profile');
  const profiles = get_settings('profiles');

  if (!currentProfile) {
    log("No profile selected, cannot reset");
    toast("No profile selected", "error");
    return;
  }

  const ctx = getContext();
  const html = `
    <div>
      <h3>Restore All Defaults?</h3>
      <p>This will reset the current profile "${currentProfile}" to factory defaults.</p>
      <p><strong>All settings will be lost:</strong></p>
      <ul>
        <li>Connection profiles and completion presets</li>
        <li>Prompts and templates</li>
        <li>All feature configurations</li>
        <li>Auto-Lorebooks settings</li>
      </ul>
      <p>Other profiles will not be affected.</p>
      <p><strong>This action cannot be undone.</strong></p>
    </div>
  `;

  const popup = new ctx.Popup(html, ctx.POPUP_TYPE.CONFIRM, '', {
    okButton: 'Restore Defaults',
    wide: true
  });

  const confirmed = await popup.show();

  if (!confirmed) {
    log("Reset settings cancelled by user");
    return;
  }

  log(`Resetting profile "${currentProfile}" to defaults`);

  // Reset the current profile to default settings
  // This includes ALL 117+ settings - connection profiles, presets, prompts, everything
  profiles[currentProfile] = structuredClone(default_settings);

  set_settings('profiles', profiles);

  // Reset global Auto-Lorebooks block to factory defaults as well
  extension_settings.autoLorebooks = getDefaultAutoLorebookSettings();

  // Reload the profile to apply the reset settings
  load_profile(currentProfile);

  // Save immediately
  saveSettingsDebounced();

  // Refresh the UI
  refresh_settings();

  log(`Profile "${currentProfile}" reset to defaults`);
  toast(`Profile "${currentProfile}" reset to defaults`, "success");
}
function set_settings(key , value ) {
  // Set a setting for the extension and save it (value can be any type - legitimate use of any)
  extension_settings[MODULE_NAME][key] = value;
  saveSettingsDebounced();
}
function get_settings(key ) {
  // Get a setting for the extension, or the default value if not set (returns any type - legitimate use of any)
  return extension_settings[MODULE_NAME]?.[key] ?? default_settings[key];
}
function get_settings_element(key ) {
  // Returns DOM/jQuery element - any is appropriate
  return settings_ui_map[key]?.[0];
}
async function get_manifest() {
  // Get the manifest.json for the extension
  const module_dir = get_extension_directory();
  const path = `${module_dir}/manifest.json`;
  const response = await fetch(path);
  if (response.ok) {
    return response.json();
  }
  error(`Error getting manifest.json from "${path}": status: ${response.status}`);
  return null;
}
async function load_settings_html() {
  // fetch the settings html file and append it to the settings div.
  log("Loading settings.html...");

  const module_dir = get_extension_directory();
  const path = `${module_dir}/settings.html`;

  try {
    const response = await $.get(path);
    log(`Loaded settings.html at "${path}"`);
    $(selectorsSillyTavern.extensions.settings).append(response); // load html into the settings div
    return true;
  } catch (response) {
    error(`Error getting settings.json from "${path}": status: ${response.status}`);
    return false;
  }
}

function chat_enabled() {
  // check if the extension is enabled in the current chat
  const context = getContext();

  // global state
  if (get_settings('use_global_toggle_state')) {
    return get_settings('global_toggle_state');
  }

  // per-chat state
  return get_settings('chats_enabled')?.[context.chatId] ?? get_settings('default_chat_enabled');
}
function toggle_chat_enabled(value  = null) {
  // Change the state of the extension. If value is null, toggle. Otherwise, set to the given value
  const current = chat_enabled();

  let newValue = value;
  if (newValue === null) {// toggle
    newValue = !current;
  } else if (newValue === current) {
    return; // no change
  }

  // set the new value
  if (get_settings('use_global_toggle_state')) {// using the global state - update the global state
    set_settings('global_toggle_state', newValue);
  } else {// using per-chat state - update the chat state
    const enabled = get_settings('chats_enabled');
    const context = getContext();
    enabled[context.chatId] = newValue;
    set_settings('chats_enabled', enabled);
  }


  if (newValue) {
    toastr.info(`Memory is now enabled for this chat`);
  } else {
    toastr.warning(`Memory is now disabled for this chat`);
  }
  refresh_memory();

  // update the message visuals
  update_all_message_visuals(); //not needed? happens in update_message_influsion_flags

  // refresh settings UI
  refresh_settings();

  // scroll to the bottom of the chat
  scrollChatToBottom();
}
function character_enabled(character_key ) {
  // check if the given character is enabled for recap generation in the current chat
  const group_id = selected_group;
  if (selected_group === null) {return true;} // not in group chat, always enabled

  const disabled_characters_settings = get_settings('disabled_group_characters');
  const disabled_characters = disabled_characters_settings[group_id];
  if (!disabled_characters) {return true;}
  return !disabled_characters.includes(character_key);

}
function toggle_character_enabled(character_key ) {
  // Toggle whether the given character is enabled for recap generation in the current chat
  const group_id = selected_group;
  if (group_id === undefined) {return;} // not in group chat, nothing to toggle

  const disabled_characters_settings = get_settings('disabled_group_characters');
  const disabled_characters = disabled_characters_settings[group_id] || [];
  const disabled = disabled_characters.includes(character_key);

  if (disabled) {// if currently disabled, enable by removing it from the disabled set
    disabled_characters.splice(disabled_characters.indexOf(character_key), 1);
  } else {// if enabled, disable by adding it to the disabled set
    disabled_characters.push(character_key);
  }

  disabled_characters_settings[group_id] = disabled_characters;
  set_settings('disabled_group_characters', disabled_characters_settings);
  debug(`${disabled ? "Enabled" : "Disabled"} group character recap generation (${character_key})`);
  refresh_memory();
}

export {
  initialize_settings,
  hard_reset_settings,
  soft_reset_settings,
  reset_settings,
  set_settings,
  get_settings,
  get_settings_element,
  get_manifest,
  load_settings_html,
  global_settings,
  settings_ui_map,
  chat_enabled,
  toggle_chat_enabled,
  character_enabled,
  toggle_character_enabled };
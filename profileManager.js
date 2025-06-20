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
    get_current_character_identifier,
    get_current_chat_identifier
} from './index.js';


// Profile management
function copy_settings(profile=null) {
    // copy the setting from the given profile (or current settings if none provided)
    let settings;

    if (!profile) {  // no profile given, copy current settings
        settings = structuredClone(extension_settings[MODULE_NAME]);
    } else {  // copy from the profile
        let profiles = get_settings('profiles');
        if (profiles[profile] === undefined) {  // profile doesn't exist, return empty
            return {}
        }

        // copy the settings from the profile
        settings = structuredClone(profiles[profile]);
    }

    // remove global settings from the copied settings
    for (let key of Object.keys(global_settings)) {
        delete settings[key];
    }
    return settings;
}
function detect_settings_difference(profile=null) {
    // check if the current settings differ from the given profile
    if (!profile) {  // if none provided, compare to the current profile
        profile = get_settings('profile')
    }
    let current_settings = copy_settings();
    let profile_settings = copy_settings(profile);

    let different = false;
    for (let key of Object.keys(profile_settings)) {
        if (profile_settings[key] !== current_settings[key]) {
            different = true;
            break;
        }
    }
    return different;
}
function save_profile(profile=null) {
    // Save the current settings to the given profile
    if (!profile) {  // if none provided, save to the current profile
        profile = get_settings('profile');
    }
    log("Saving Configuration Profile: "+profile);

    // save the current settings to the profile
    let profiles = get_settings('profiles');
    profiles[profile] = copy_settings();
    set_settings('profiles', profiles);

    // check preset validity
    check_preset_valid()

    // update the button highlight
    update_save_icon_highlight();
}
function load_profile(profile=null) {
    // load a given settings profile
    let current_profile = get_settings('profile')
    if (!profile) {  // if none provided, reload the current profile
        profile = current_profile
    }

    let settings = copy_settings(profile);  // copy the settings from the profile
    if (!settings) {
        error("Profile not found: "+profile);
        return;
    }

    log("Loading Configuration Profile: "+profile);
    Object.assign(extension_settings[MODULE_NAME], settings);  // update the settings
    set_settings('profile', profile);  // set the current profile
    if (get_settings("notify_on_profile_switch") && current_profile !== profile) {
        toast(`Switched to profile "${profile}"`, 'info')
    }
    refresh_settings();
}
function export_profile(profile=null) {
    // export a settings profile
    if (!profile) {  // if none provided, reload the current profile
        profile = get_settings('profile')
    }

    let settings = copy_settings(profile);  // copy the settings from the profile
    if (!settings) {
        error("Profile not found: "+profile);
        return;
    }

    log("Exporting Configuration Profile: "+profile);
    const data = JSON.stringify(settings, null, 4);
    download(data, `${profile}.json`, 'application/json');
}
async function import_profile(e) {
    let file = e.target.files[0];
    if (!file) {
        return;
    }

    const name = file.name.replace('.json', '')
    const data = await parseJsonFile(file);

    // save to the profile
    let profiles = get_settings('profiles');
    profiles[name] = data
    set_settings('profiles', profiles);

    toast(`auto_summarize Memory profile \"${name}\" imported`, 'success')
    e.target.value = null;

    refresh_settings()
}
async function rename_profile() {
    // Rename the current profile via user input
    let ctx = getContext();
    let old_name = get_settings('profile');
    let new_name = await ctx.Popup.show.input("Rename Configuration Profile", `Enter a new name:`, old_name);

    // if it's the same name or none provided, do nothing
    if (!new_name || old_name === new_name) {
        return;
    }

    let profiles = get_settings('profiles');

    // check if the new name already exists
    if (profiles[new_name]) {
        error(`Profile [${new_name}] already exists`);
        return;
    }

    // rename the profile
    profiles[new_name] = profiles[old_name];
    delete profiles[old_name];
    set_settings('profiles', profiles);
    set_settings('profile', new_name);  // set the current profile to the new name

    // if any characters are using the old profile, update it to the new name
    let character_profiles = get_settings('character_profiles');
    for (let [character_key, character_profile] of Object.entries(character_profiles)) {
        if (character_profile === old_name) {
            character_profiles[character_key] = new_name;
        }
    }

    log(`Renamed profile [${old_name}] to [${new_name}]`);
    refresh_settings()
}
function new_profile() {
    // create a new profile
    let profiles = get_settings('profiles');
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
    let profile = get_settings('profile');
    let profiles = get_settings('profiles');

    // delete the profile
    delete profiles[profile];
    set_settings('profiles', profiles);
    toast(`Deleted Configuration Profile: \"${profile}\"`, "success");

    // remove any references to this profile connected to characters or chats
    let character_profiles = get_settings('character_profiles')
    let chat_profiles = get_settings('chat_profiles')
    for (let [id, name] of Object.entries(character_profiles)) {
        if (name === profile) {
            delete character_profiles[id]
        }
    }
    for (let [id, name] of Object.entries(chat_profiles)) {
        if (name === profile) {
            delete chat_profiles[id]
        }
    }
    set_settings('character_profiles', character_profiles)
    set_settings('chat_profiles', chat_profiles)

    auto_load_profile()
}
function toggle_character_profile() {
    // Toggle whether the current profile is set to the default for the current character
    let key = get_current_character_identifier();  // uniquely identify the current character or group chat
    log("Character Key: "+key)
    if (!key) {  // no character selected
        return;
    }

    // current profile
    let profile = get_settings('profile');

    // if the character profile is already set to the current profile, unset it.
    // otherwise, set it to the current profile.
    set_character_profile(key, profile === get_character_profile() ? null : profile);
}
function toggle_chat_profile() {
    // Toggle whether the current profile is set to the default for the current character
    let key = get_current_chat_identifier();  // uniquely identify the current chat
    log("Chat ID: "+key)
    if (!key) {  // no chat selected
        return;
    }

    // current profile
    let profile = get_settings('profile');

    // if the chat profile is already set to the current profile, unset it.
    // otherwise, set it to the current profile.
    set_chat_profile(key, profile === get_chat_profile() ? null : profile);
}
function get_character_profile(key) {
    // Get the profile for a given character
    if (!key) {  // if none given, assume the current character
        key = get_current_character_identifier();
    }
    let character_profiles = get_settings('character_profiles');
    return character_profiles[key]
}
function set_character_profile(key, profile=null) {
    // Set the profile for a given character (or unset it if no profile provided)
    let character_profiles = get_settings('character_profiles');

    if (profile) {
        character_profiles[key] = profile;
        log(`Set character [${key}] to use profile [${profile}]`);
    } else {
        delete character_profiles[key];
        log(`Unset character [${key}] default profile`);
    }

    set_settings('character_profiles', character_profiles);
    refresh_settings()
}
function get_chat_profile(id) {
    // Get the profile for a given chat
    if (!id) {  // if none given, assume the current character
        id = get_current_chat_identifier();
    }
    let profiles = get_settings('chat_profiles');
    return profiles[id]
}
function set_chat_profile(id, profile=null) {
    // Set the profile for a given chat (or unset it if no profile provided)
    let chat_profiles = get_settings('chat_profiles');

    if (profile) {
        chat_profiles[id] = profile;
        log(`Set chat [${id}] to use profile [${profile}]`);
    } else {
        delete chat_profiles[id];
        log(`Unset chat [${id}] default profile`);
    }

    set_settings('chat_profiles', chat_profiles);
    refresh_settings()
}
function auto_load_profile() {
    // Load the settings profile for the current chat or character
    let profile = get_chat_profile() || get_character_profile();
    load_profile(profile || 'Default');
    refresh_settings()
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
    auto_load_profile
};
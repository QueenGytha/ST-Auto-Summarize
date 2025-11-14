export const selectorsSillyTavern = {
    // Chat interface buttons
    buttons: {
        send: '#send_but',              // Send message button (verified: id="send_but")
        stop: '#mes_stop',              // Stop generation button (verified: id="mes_stop")
    },

    // Chat interface - main containers
    chat: {
        container: '#chat',             // Main chat container (verified: id="chat")
        holder: '#sheld',               // Main chat holder/wrapper (verified: id="sheld")
        input: '#send_textarea',        // Chat input textarea (verified: id="send_textarea")
    },

    // Message elements (within chat)
    message: {
        template: '#message_template',  // Message template container (verified: id="message_template")
        block: '.mes',                  // Individual message block (verified: class="mes")
        buttons: '.mes_buttons',        // Message button container (verified: class="mes_buttons")
        extraButtons: '.extraMesButtons', // Extra buttons area in messages (verified: class="extraMesButtons")
        text: '.mes_text',              // Message text content (verified: class="mes_text")
        hide: '.mes_hide',              // Hide message button (verified: class="mes_hide")
        unhide: '.mes_unhide',          // Unhide message button (verified: class="mes_unhide")
    },

    // Group chat elements
    group: {
        memberTemplate: '#group_member_template',  // Group member template (verified: id="group_member_template")
        member: '.group_member',                   // Individual group member element (verified: class="group_member")
        memberIcon: '.group_member_icon',          // Group member icon (verified: class="group_member_icon")
        membersContainer: '#rm_group_members',     // Group members container (verified: id="rm_group_members")
    },

    // Extensions and settings UI
    extensions: {
        settings: '#extensions_settings2',  // Settings panel container (verified: id="extensions_settings2")
        settingsButton: '#extensions_settings', // Extensions settings button (for opening extensions panel)
        settingsButtonDataTarget: '[data-target="extensions-settings-button"]', // Extensions settings button by data attribute
        menu: '#extensionsMenu',            // Extensions menu (verified: id="extensionsMenu")
        sysSettingsButton: '#sys-settings-button',  // System settings button (verified: id="sys-settings-button")
        connectionProfiles: '#connection_profiles', // Connection profiles UI element (verified: id="connection_profiles")
        saveButton: '#extensions_save',     // Extensions save button
        extensionBlock: '.extension_block', // Extension block in manage extensions dialog
    },

    // DOM elements (standard HTML)
    dom: {
        body: 'body',                       // Document body element (standard HTML)
    },

    // Templates (ST core UI templates)
    templates: {
        zoomedAvatar: '#zoomed_avatar_template',  // Popout/zoomed avatar template (verified: id="zoomed_avatar_template")
    },

    // Event types (for eventSource.on)
    // These are SillyTavern's event type strings that could change between versions
    events: {
        CHAT_COMPLETION_PROMPT_READY: 'CHAT_COMPLETION_PROMPT_READY',
        CHARACTER_MESSAGE_RENDERED: 'CHARACTER_MESSAGE_RENDERED',
        USER_MESSAGE_RENDERED: 'USER_MESSAGE_RENDERED',
        GENERATE_BEFORE_COMBINE_PROMPTS: 'GENERATE_BEFORE_COMBINE_PROMPTS',
        MESSAGE_DELETED: 'MESSAGE_DELETED',
        MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
        MESSAGE_EDITED: 'MESSAGE_EDITED',
        MESSAGE_SWIPED: 'MESSAGE_SWIPED',
        CHAT_CHANGED: 'CHAT_CHANGED',
        CHAT_DELETED: 'CHAT_DELETED',
        GROUP_CHAT_DELETED: 'GROUP_CHAT_DELETED',
        MORE_MESSAGES_LOADED: 'MORE_MESSAGES_LOADED',
        MESSAGE_SENT: 'MESSAGE_SENT',
        GROUP_UPDATED: 'GROUP_UPDATED',
        WORLD_INFO_ACTIVATED: 'WORLD_INFO_ACTIVATED',
        WORLDINFO_ENTRIES_LOADED: 'WORLDINFO_ENTRIES_LOADED',
        GENERATION_STOPPED: 'GENERATION_STOPPED',
    },
};

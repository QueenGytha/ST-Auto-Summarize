import {
    debug,
    getContext,
    chat_enabled,
    get_settings,
    refresh_memory,
    auto_load_profile,
    scrollChatToBottom,
    auto_summarize_chat,
    summarize_messages,
    check_message_exclusion,
    get_previous_swipe_memory,
    clear_memory,
    get_data,
    set_data,
    last_long_injection,
    last_short_injection,
    last_combined_injection,
    last_scene_injection,
    load_settings_html,
    initialize_settings_listeners,
    initialize_popout,
    initialize_message_buttons,
    initialize_group_member_buttons,
    initialize_slash_commands,
    initialize_menu_buttons,
    addSceneBreakButton,
    bindSceneBreakButton,
    get_message_div,
    saveChatDebounced,
    set_character_enabled_button_states,
    renderAllSceneBreaks,
    generate_combined_summary,
    get_manifest,
    log,
    refresh_settings,
    update_connection_profile_dropdown,
    check_st_version,
    initialize_settings,
    get_short_memory,
    get_long_memory,
    combined_memory_macro,
    MacrosParser,
    MemoryEditInterface,
    short_memory_macro,
    long_memory_macro,
    streamingProcessor,
    initializeSceneNavigatorBar,
    renderSceneNavigatorBar,
    load_combined_summary,
    get_scene_memory_injection
} from './index.js';

// Event handling
var last_message_swiped = null  // if an index, that was the last message swiped
async function on_chat_event(event=null, data=null) {
    debug(`[on_chat_event] event: ${event}, data: ${JSON.stringify(data)}`);
    // When the chat is updated, check if the summarization should be triggered
    debug("Chat updated: " + event)

    const context = getContext();
    let index = data

    switch (event) {
        case 'chat_changed':  // chat was changed
            last_message_swiped = null;
            auto_load_profile();  // load the profile for the current chat or character
            refresh_memory();  // refresh the memory state
            if (context?.chat?.length) {
                scrollChatToBottom();  // scroll to the bottom of the chat (area is added due to memories)
            }
            break;

        case 'message_deleted':   // message was deleted
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message deleted, refreshing memory")
            refresh_memory();
            break;

        case 'before_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            break;

        // currently no triggers on user message rendered
        case 'user_message':
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing

            // Summarize the chat if "include_user_messages" is enabled
            if (get_settings('include_user_messages')) {
                debug("New user message detected, summarizing")
                await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
            }

            break;

        case 'char_message':
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!context.groupId && context.characterId === undefined) break; // no characters or group selected
            if (streamingProcessor && !streamingProcessor.isFinished) break;  // Streaming in-progress
            if (last_message_swiped === index) {  // this is a swipe
                let message = context.chat[index];
                if (!get_settings('auto_summarize_on_swipe')) break;  // if auto-summarize on swipe is disabled, do nothing
                if (!check_message_exclusion(message)) break;  // if the message is excluded, skip
                if (!get_previous_swipe_memory(message, 'memory')) break;  // if the previous swipe doesn't have a memory, skip
                debug("re-summarizing on swipe")
                await summarize_messages(index);  // summarize the swiped message
                refresh_memory()
                break;
            } else { // not a swipe
                last_message_swiped = null;
                if (!get_settings('auto_summarize')) break;  // if auto-summarize is disabled, do nothing
                if (get_settings("auto_summarize_on_send")) break;  // if auto_summarize_on_send is enabled, don't auto-summarize on character message
                debug("New message detected, summarizing")
                await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
                break;
            }

        case 'message_edited':  // Message has been edited
            last_message_swiped = null;
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            if (!get_settings('auto_summarize_on_edit')) break;  // if auto-summarize on edit is disabled, skip
            if (!check_message_exclusion(context.chat[index])) break;  // if the message is excluded, skip
            if (!get_data(context.chat[index], 'memory')) break;  // if the message doesn't have a memory, skip
            debug("Message with memory edited, summarizing")
            summarize_messages(index);  // summarize that message (no await so the message edit goes through)

            // TODO: I'd like to be able to refresh the memory here, but we can't await the summarization because
            //  then the message edit textbox doesn't close until the summary is done.

            break;

        case 'message_swiped':  // when this event occurs, don't summarize yet (a new_message event will follow)
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug("Message swiped, reloading memory")

            // if this is creating a new swipe, remove the current memory.
            // This is detected when the swipe ID is greater than the last index in the swipes array,
            //  i.e. when the swipe ID is EQUAL to the length of the swipes array, not when it's length-1.
            let message = context.chat[index];
            if (message.swipe_id === message.swipes.length) {
                clear_memory(message)
            }

            refresh_memory()
            last_message_swiped = index;

            // make sure the chat is scrolled to the bottom because the memory will change
            scrollChatToBottom();
            break;

        case 'message_sent':
            if (!chat_enabled()) break;
            if (get_settings('debug_mode')) {
                if (
                    last_long_injection ||
                    last_short_injection ||
                    last_combined_injection ||
                    last_scene_injection
                ) {
                    if (last_long_injection) debug(`[MEMORY INJECTION] long_injection:\n${last_long_injection}`);
                    if (last_short_injection) debug(`[MEMORY INJECTION] short_injection:\n${last_short_injection}`);
                    if (last_combined_injection) debug(`[MEMORY INJECTION] combined_injection:\n${last_combined_injection}`);
                    if (last_scene_injection) debug(`[MEMORY INJECTION] scene_injection:\n${last_scene_injection}`);
                }
            }
            break;

        default:
            if (!chat_enabled()) break;  // if chat is disabled, do nothing
            debug(`Unknown event: "${event}", refreshing memory`)
            refresh_memory();
    }
}

// Entry point
let memoryEditInterface;
jQuery(async function () {
    log(`Loading extension...`)

    // Read version from manifest.json
    const manifest = await get_manifest();
    const VERSION = manifest.version;
    log(`Version: ${VERSION}`)

    check_st_version()

    // Load settings
    initialize_settings();

    memoryEditInterface = new MemoryEditInterface()

    // load settings html
    await load_settings_html();

    // initialize UI stuff
    initialize_settings_listeners();
    initialize_popout()
    initialize_message_buttons();
    initialize_group_member_buttons();
    initialize_slash_commands();
    initialize_menu_buttons();

    addSceneBreakButton();
    bindSceneBreakButton(get_message_div, getContext, set_data, get_data, saveChatDebounced);

    // ST event listeners
    let ctx = getContext();
    let eventSource = ctx.eventSource;
    let event_types = ctx.event_types;
    debug(`[eventHandlers] Registered event_types: ${JSON.stringify(event_types)}`);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (id, stuff) => {
        on_chat_event('chat_completion_prompt_ready', id);
    });
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('char_message', id));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, (id) => on_chat_event('user_message', id));
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (id, stuff) => on_chat_event('before_message', id));
    eventSource.on(event_types.MESSAGE_DELETED, (id) => on_chat_event('message_deleted', id));
    eventSource.on(event_types.MESSAGE_EDITED, (id) => on_chat_event('message_edited', id));
    eventSource.on(event_types.MESSAGE_SWIPED, (id) => on_chat_event('message_swiped', id));
    eventSource.on(event_types.CHAT_CHANGED, () => on_chat_event('chat_changed'));
    eventSource.on(event_types.MORE_MESSAGES_LOADED, refresh_memory)
    eventSource.on(event_types.MESSAGE_SENT, (id) => on_chat_event('message_sent', id));
    eventSource.on(event_types.MORE_MESSAGES_LOADED, () => {
    refresh_memory();
    renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
    renderSceneNavigatorBar();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        renderAllSceneBreaks(get_message_div, getContext, get_data, set_data, saveChatDebounced);
    });
    eventSource.on('groupSelected', set_character_enabled_button_states)
    eventSource.on(event_types.GROUP_UPDATED, set_character_enabled_button_states)

    // Log all events for debugging
Object.entries(event_types).forEach(([key, type]) => {
    eventSource.on(type, (...args) => {
        debug(`[eventHandlers] Event triggered: ${key} (${type}), args: ${JSON.stringify(args)}`);
    });
});

    // Global Macros
    MacrosParser.registerMacro(short_memory_macro, () => get_short_memory());
    MacrosParser.registerMacro(long_memory_macro, () => get_long_memory());
    MacrosParser.registerMacro(combined_memory_macro, () => load_combined_summary());

    // Export to the Global namespace so can be used in the console for debugging
    window.getContext = getContext;
    window.refresh_memory = refresh_memory;
    window.generate_combined_summary = generate_combined_summary;
    window.refresh_settings = refresh_settings;
    window.update_connection_profile_dropdown = update_connection_profile_dropdown;

    initializeSceneNavigatorBar();
});

export {
    on_chat_event,
    memoryEditInterface
};
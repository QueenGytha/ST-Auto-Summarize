// @flow
import {
    debug,
    log,
    SUBSYSTEM,
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
    last_message_summary_injection,
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
    get_manifest,
    refresh_settings,
    update_connection_profile_dropdown,
    check_st_version,
    initialize_settings,
    MacrosParser,
    MemoryEditInterface,
    single_message_summary_macro,
    get_message_summary_injection,
    streamingProcessor,
    initializeSceneNavigatorBar,
    renderSceneNavigatorBar,
    processSceneBreakOnChatLoad,
    processNewMessageForSceneBreak,
    cleanup_invalid_running_summaries,
} from './index.js';

// Event handling
let last_message_swiped = null  // if an index, that was the last message swiped
let operationQueueModule = null;  // Reference to queue module for reloading

// Handler functions for each event type
async function handleChatChanged() {
    const context = getContext();
    last_message_swiped = null;
    auto_load_profile();  // load the profile for the current chat or character
    refresh_memory();  // refresh the memory state
    if (context?.chat?.length) {
        scrollChatToBottom();  // scroll to the bottom of the chat (area is added due to memories)
    }
    // Auto scene break detection on chat load
    processSceneBreakOnChatLoad();

    // Reload queue from new chat's lorebook
    if (operationQueueModule) {
        await operationQueueModule.reloadQueue();
    }
}

async function handleMessageDeleted() {
    if (!chat_enabled()) return;
    last_message_swiped = null;
    debug("Message deleted, refreshing memory and cleaning up running summaries")
    refresh_memory();
    cleanup_invalid_running_summaries();
    // Update the version selector UI after cleanup
    // $FlowFixMe[cannot-resolve-name]
    if (typeof window.updateVersionSelector === 'function') {
        // $FlowFixMe[cannot-resolve-name]
        window.updateVersionSelector();
    }
    // Refresh the scene navigator bar to remove deleted scenes
    renderSceneNavigatorBar();
}

async function handleBeforeMessage() {
    if (!chat_enabled()) return;
}

async function handleUserMessage() {
    if (!chat_enabled()) return;
    last_message_swiped = null;
    if (!get_settings('auto_summarize')) return;

    // Summarize the chat if "include_user_messages" is enabled
    if (get_settings('include_user_messages')) {
        debug("New user message detected, summarizing")
        await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
    }
    // NOTE: Auto scene break detection runs on 'char_message' after AI responds, not here
}

// $FlowFixMe[missing-local-annot]
async function handleCharMessageSwipe(index) {
    const context = getContext();
    const message = context.chat[index];
    if (!get_settings('auto_summarize_on_swipe')) return;
    if (!check_message_exclusion(message)) return;
    if (!get_previous_swipe_memory(message, 'memory')) return;
    debug("re-summarizing on swipe")
    await summarize_messages(index);  // summarize the swiped message (handles queue internally)
    refresh_memory()
}

// $FlowFixMe[missing-local-annot]
async function handleCharMessageNew(index) {
    last_message_swiped = null;
    // Auto scene break detection on new character message (runs regardless of auto_summarize setting)
    log(SUBSYSTEM.EVENT, "Triggering auto scene break detection for character message at index", index);
    await processNewMessageForSceneBreak(index);

    if (!get_settings('auto_summarize')) return;
    if (get_settings("auto_summarize_on_send")) return;
    debug("New message detected, summarizing")
    await auto_summarize_chat();  // auto-summarize the chat (checks for exclusion criteria and whatnot)
}

// $FlowFixMe[missing-local-annot]
async function handleCharMessage(index) {
    if (!chat_enabled()) return;
    const context = getContext();
    if (!context.groupId && context.characterId === undefined) return; // no characters or group selected
    if (streamingProcessor && !streamingProcessor.isFinished) return;  // Streaming in-progress

    if (last_message_swiped === index) {  // this is a swipe
        await handleCharMessageSwipe(index);
    } else { // not a swipe
        await handleCharMessageNew(index);
    }
}

// $FlowFixMe[missing-local-annot]
async function handleMessageEdited(index) {
    if (!chat_enabled()) return;
    const context = getContext();
    last_message_swiped = null;
    if (!get_settings('auto_summarize_on_edit')) return;
    if (!check_message_exclusion(context.chat[index])) return;
    if (!get_data(context.chat[index], 'memory')) return;
    debug("Message with memory edited, summarizing")
    summarize_messages(index);  // summarize that message (no await so edit goes through, handles queue internally)
    // TODO: I'd like to be able to refresh the memory here, but we can't await the summarization because
    //  then the message edit textbox doesn't close until the summary is done.
}

// $FlowFixMe[missing-local-annot]
async function handleMessageSwiped(index) {
    if (!chat_enabled()) return;
    const context = getContext();
    debug("Message swiped, reloading memory")

    // if this is creating a new swipe, remove the current memory.
    // This is detected when the swipe ID is greater than the last index in the swipes array,
    //  i.e. when the swipe ID is EQUAL to the length of the swipes array, not when it's length-1.
    const message = context.chat[index];
    if (message.swipe_id === message.swipes.length) {
        clear_memory(message)
    }

    refresh_memory()
    last_message_swiped = index;

    // make sure the chat is scrolled to the bottom because the memory will change
    scrollChatToBottom();
}

async function handleMessageSent() {
    if (!chat_enabled()) return;
    if (get_settings('debug_mode')) {
        if (last_message_summary_injection || last_scene_injection) {
            if (last_message_summary_injection) debug(`[MEMORY INJECTION] message_summary_injection:\n${last_message_summary_injection}`);
            if (last_scene_injection) debug(`[MEMORY INJECTION] scene_injection:\n${last_scene_injection}`);
        }
    }
}

// $FlowFixMe[missing-local-annot]
async function handleDefaultEvent(event) {
    if (!chat_enabled()) return;
    debug(`Unknown event: "${event}", refreshing memory`)
    refresh_memory();
}

// Event handler map for cleaner dispatch
const eventHandlers = {
    'chat_changed': handleChatChanged,
    'message_deleted': handleMessageDeleted,
    'before_message': handleBeforeMessage,
    'user_message': handleUserMessage,
    'char_message': handleCharMessage,
    'message_edited': handleMessageEdited,
    'message_swiped': handleMessageSwiped,
    'message_sent': handleMessageSent,
};

// $FlowFixMe[signature-verification-failure] [missing-local-annot]
async function on_chat_event(event: any=null, data: any=null) {
    debug(`[on_chat_event] event: ${event}, data: ${JSON.stringify(data)}`);
    debug("Chat updated: " + event)

    const handler = eventHandlers[event];
    if (handler) {
        await handler(data);
    } else {
        await handleDefaultEvent(event);
    }
}

// Entry point
// $FlowFixMe[signature-verification-failure]
let memoryEditInterface;
// $FlowFixMe[cannot-resolve-name]
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
    await initialize_settings_listeners();
    initialize_popout()
    initialize_message_buttons();
    initialize_group_member_buttons();
    initialize_slash_commands();
    initialize_menu_buttons();
    
    // Refresh settings UI to populate dropdowns and other elements
    refresh_settings();

    addSceneBreakButton();
    bindSceneBreakButton(get_message_div, getContext, set_data, get_data, saveChatDebounced);

    // ST event listeners
    const ctx = getContext();
    const eventSource = ctx.eventSource;
    const event_types = ctx.event_types;
    debug(`[eventHandlers] Registered event_types: ${JSON.stringify(event_types)}`);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (id, _stuff) => {
        on_chat_event('chat_completion_prompt_ready', id);
    });
    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('char_message', id));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, (id) => on_chat_event('user_message', id));
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (id, _stuff) => on_chat_event('before_message', id));
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
    MacrosParser.registerMacro(single_message_summary_macro, () => get_message_summary_injection());

    // Export to the Global namespace so can be used in the console for debugging
    // $FlowFixMe[cannot-resolve-name]
    window.getContext = getContext;
    // $FlowFixMe[cannot-resolve-name]
    window.refresh_memory = refresh_memory;
    // $FlowFixMe[cannot-resolve-name]
    window.refresh_settings = refresh_settings;
    // $FlowFixMe[cannot-resolve-name]
    window.update_connection_profile_dropdown = update_connection_profile_dropdown;

    initializeSceneNavigatorBar();

    // Initialize operation queue system
    const queueSetting = get_settings('operation_queue_enabled');
    log('[Queue] Checking queue initialization - setting value:', queueSetting);

    if (queueSetting !== false) {
        log('[Queue] Initializing operation queue...');
        operationQueueModule = await import('./operationQueue.js');
        const { initQueueUI } = await import('./operationQueueUI.js');
        const { registerAllOperationHandlers } = await import('./operationHandlers.js');

        await operationQueueModule.initOperationQueue();
        registerAllOperationHandlers();
        initQueueUI();
        log('[Queue] ✓ Operation queue initialized with handlers');
    } else {
        log('[Queue] Queue disabled by setting, skipping initialization');
    }
});

export {
    on_chat_event,
    memoryEditInterface
};
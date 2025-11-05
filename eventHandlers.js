// @flow
import {
    debug,
    log,
    SUBSYSTEM,
    getContext,
    chat_enabled,
    get_settings,
    set_settings,
    refresh_memory,
    auto_load_profile,
    scrollChatToBottom,
    clear_memory,
    get_data,
    set_data,
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
    extension_settings,
    groups,
    MacrosParser,
    streamingProcessor,
    initializeSceneNavigatorBar,
    renderSceneNavigatorBar,
    processSceneBreakOnChatLoad,
    processNewMessageForSceneBreak,
    cleanup_invalid_running_summaries,
    installGenerateRawInterceptor,
    installLorebookWrapper,
} from './index.js';

// Import lorebooks utilities (will be dynamically imported if enabled)
import * as lorebookUtils from './utils.js';

// Event handling
let operationQueueModule = null;  // Reference to queue module for reloading
// Track reason for last MESSAGE_RECEIVED to distinguish swipes
let lastMessageReceivedReason /*: ?string */ = null;

// Handler functions for each event type
async function handleChatChanged() {
    const context = getContext();

    // Restore connection settings if they were left in a switched state (crash recovery)
    try {
        const { restoreConnectionSettingsIfNeeded } = await import('./connectionSettingsManager.js');
        const restored = await restoreConnectionSettingsIfNeeded();
        if (restored) {
            log(SUBSYSTEM.CORE, 'Restored connection settings after interruption');
        }
    } catch (err) {
        debug('[ConnectionSettings] Failed to restore connection settings:', String(err));
    }

    auto_load_profile();  // load the profile for the current chat or character
    refresh_memory();  // refresh the memory state
    if (context?.chat?.length) {
        scrollChatToBottom();  // scroll to the bottom of the chat (area is added due to memories)
    }
    // Auto scene break detection on chat load
    processSceneBreakOnChatLoad();

    // Ensure chat lorebook exists
    try {
        const lorebookManager = await import('./lorebookManager.js');
        // Make sure lorebook utils are wired
        lorebookManager.initLorebookManager(lorebookUtils);
        await lorebookManager.initializeChatLorebook();
    } catch (err) {
        debug('[Lorebooks] Failed to initialize lorebook on chat change:', String(err));
    }

    // Reload queue from new chat's lorebook (after ensuring it's available)
    if (operationQueueModule) {
        await operationQueueModule.reloadQueue();
    }
}

// Delete the auto-created lorebook when a chat is deleted
async function handleChatDeleted(deletedChatName /*: ?string */) {
    try {
        if (!deletedChatName) return;

        const deleteEnabled = extension_settings?.autoLorebooks?.deleteOnChatDelete ?? true;
        if (!deleteEnabled) {
            debug('[Lorebooks] Delete on chat delete disabled; skipping');
            return;
        }

        // Derive character/group name from chat name (format: "<CharOrGroup> - <timestamp>")
    let characterName = null;
    try {
        // If this is a group chat id, find the owning group name
        const allGroups = groups || [];
        const owner = allGroups.find(g => Array.isArray(g?.chats) && g.chats.includes(deletedChatName));
        if (owner && owner.name) {
            characterName = owner.name;
        }
    } catch { /* ignore */ }
    if (!characterName) {
        const parts = String(deletedChatName).split(' - ');
        characterName = parts[0] || deletedChatName;
    }

        // Reconstruct the lorebook name using the same template we use for creation
        const template = extension_settings?.autoLorebooks?.nameTemplate || 'z-AutoLB-{{chat}}';
        const lorebookName = lorebookUtils.generateLorebookName(template, characterName, deletedChatName);

        const lorebookManager = await import('./lorebookManager.js');
        lorebookManager.initLorebookManager(lorebookUtils);
        await lorebookManager.deleteChatLorebook(lorebookName);
    } catch (err) {
        debug('[Lorebooks] Error processing chat deletion:', String(err));
    }
}

async function handleMessageDeleted() {
    if (!chat_enabled()) return;
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
    // NOTE: Auto scene break detection runs on 'char_message' after AI responds, not here
}

// $FlowFixMe[missing-local-annot]
async function handleCharMessageNew(index) {
    // Auto scene break detection on new character message
    log(SUBSYSTEM.EVENT, "Triggering auto scene break detection for character message at index", index);
    // If the last message was a swipe and offset >= 1 (skip latest), skip detection for this char_message
    const offset = Number(get_settings('auto_scene_break_message_offset')) || 0;
    if (offset >= 1 && lastMessageReceivedReason === 'swipe') {
        debug('[Scene] Skipping auto scene break detection on swipe due to offset >= 1');
        lastMessageReceivedReason = null; // consume the reason
        return;
    }
    // consume any prior reason to avoid accidental carry-over
    lastMessageReceivedReason = null;
    await processNewMessageForSceneBreak(index);
}

// $FlowFixMe[missing-local-annot]
async function handleCharMessage(index) {
    if (!chat_enabled()) return;
    const context = getContext();
    if (!context.groupId && context.characterId === undefined) return; // no characters or group selected
    if (streamingProcessor && !streamingProcessor.isFinished) return;  // Streaming in-progress

    await handleCharMessageNew(index);
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

    // make sure the chat is scrolled to the bottom because the memory will change
    scrollChatToBottom();
}

async function handleMessageSent() {
    if (!chat_enabled()) return;
    if (last_scene_injection) {
        debug(`[MEMORY INJECTION] scene_injection:\n${last_scene_injection}`);
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
    'chat_deleted': handleChatDeleted,
    'message_deleted': handleMessageDeleted,
    'before_message': handleBeforeMessage,
    'user_message': handleUserMessage,
    'char_message': handleCharMessage,
    'message_swiped': handleMessageSwiped,
    'message_sent': handleMessageSent,
  };

// $FlowFixMe[signature-verification-failure]
async function on_chat_event(event /*: ?string */=null, data /*: any */=null) /*: Promise<void> */ {
    // data is any type - different event types pass different data types (number for message id, undefined, etc.) - legitimate use of any
    if (!event) return;  // Guard against null event
    debug(`[on_chat_event] event: ${event}, data: ${JSON.stringify(data)}`);
    debug("Chat updated: " + event)

    // $FlowFixMe[invalid-computed-prop] - eventHandlers is an object with string keys, check for existence below
    const handler = eventHandlers[event];
    if (handler) {
        await handler(data);
    } else {
        await handleDefaultEvent(event);
    }
}

// Entry point

// Initialization function that runs when module loads
async function initializeExtension() {
    console.log('[EVENT HANDLERS] initializeExtension() called');
    log(`Loading extension...`)

    // Read version from manifest.json
    const manifest = await get_manifest();
    const VERSION = manifest.version;
    log(`Version: ${VERSION}`)

    check_st_version()

    // Install global generateRaw interceptor BEFORE anything else
    // This ensures ALL LLM calls (including from ST core) get metadata injected
    installGenerateRawInterceptor();

    // Install lorebook wrapper for individual entry wrapping with XML tags
    console.log('[Auto-Summarize:Init] About to call installLorebookWrapper()');
    installLorebookWrapper();
    console.log('[Auto-Summarize:Init] installLorebookWrapper() call completed');

    // Load settings
    initialize_settings();

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
    // Inject metadata into chat completion prompts for proxy logging
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
        on_chat_event('chat_completion_prompt_ready', promptData);

        try {
            debug('[Interceptor] CHAT_COMPLETION_PROMPT_READY handler started');

            // Check if injection is enabled (get_settings expects a key parameter)
            const enabled = get_settings('first_hop_proxy_send_chat_details');
            debug('[Interceptor] first_hop_proxy_send_chat_details:', enabled);

            if (!enabled) {
                debug('[Interceptor] Metadata injection disabled, skipping');
                return; // Not enabled, skip
            }

            debug('[Interceptor] Metadata injection enabled, proceeding...');

            // Import metadata injector
            const { injectMetadataIntoChatArray } = await import('./metadataInjector.js');

            // Process the chat array
            if (promptData && Array.isArray(promptData.chat)) {
                debug('[Interceptor] Processing chat array for CHAT_COMPLETION_PROMPT_READY');

                // Inject metadata header
                injectMetadataIntoChatArray(promptData.chat, { operation: 'chat' });

                debug('[Interceptor] Successfully processed chat array');

            } else {
                debug('[Interceptor] No chat array found in promptData');
            }
        } catch (err) {
            debug('[Interceptor] Error processing CHAT_COMPLETION_PROMPT_READY:', String(err));
        }
    });

    eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (id) => on_chat_event('char_message', id));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, (id) => on_chat_event('user_message', id));
    eventSource.on(event_types.GENERATE_BEFORE_COMBINE_PROMPTS, (id, _stuff) => on_chat_event('before_message', id));
    eventSource.on(event_types.MESSAGE_DELETED, (id) => on_chat_event('message_deleted', id));
    // Record message_received reasons (e.g., 'swipe') so we can gate char_message handling
    if (event_types.MESSAGE_RECEIVED) {
        eventSource.on(event_types.MESSAGE_RECEIVED, (id, reason) => {
            try {
                lastMessageReceivedReason = reason;
            } catch { /* ignore */ }
        });
    }
    eventSource.on(event_types.MESSAGE_EDITED, (id) => on_chat_event('message_edited', id));
    eventSource.on(event_types.MESSAGE_SWIPED, (id) => on_chat_event('message_swiped', id));
    eventSource.on(event_types.CHAT_CHANGED, () => on_chat_event('chat_changed'));
    // Also listen for chat deletions to clean up auto lorebooks
    if (event_types.CHAT_DELETED) {
        eventSource.on(event_types.CHAT_DELETED, (name) => on_chat_event('chat_deleted', name));
    }
    if (event_types.GROUP_CHAT_DELETED) {
        eventSource.on(event_types.GROUP_CHAT_DELETED, (name) => on_chat_event('chat_deleted', name));
    }
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
    log('[Queue] Initializing operation queue...');
    operationQueueModule = await import('./operationQueue.js');
    const { initQueueUI } = await import('./operationQueueUI.js');

    await operationQueueModule.initOperationQueue();
    initQueueUI();
    log('[Queue] ✓ Operation queue initialized (handlers will be registered after module init)');

    // Initialize Auto-Lorebooks functionality
    console.log('[EVENT HANDLERS] About to initialize Auto-Lorebooks functionality...');
    log('[Lorebooks] Initializing Auto-Lorebooks functionality...');
    try {
        console.log('[EVENT HANDLERS] Importing modules...');
        const lorebookManager = await import('./lorebookManager.js');
        const categoryIndexes = await import('./categoryIndexes.js');
        const lorebookEntryMerger = await import('./lorebookEntryMerger.js');
        const summaryToLorebookProcessor = await import('./summaryToLorebookProcessor.js');
        const connectionSettingsManager = await import('./connectionSettingsManager.js');
        console.log('[EVENT HANDLERS] All modules imported successfully');

        // Initialize lorebooks modules
        console.log('[EVENT HANDLERS] Initializing lorebookManager...');
        lorebookManager.initLorebookManager(lorebookUtils);
        console.log('[EVENT HANDLERS] Initializing categoryIndexes...');
        categoryIndexes.initCategoryIndexes(lorebookUtils, lorebookManager, { get_settings });

        // Initialize with operation queue
        console.log('[EVENT HANDLERS] Initializing lorebookEntryMerger...');
        if (operationQueueModule) {
            lorebookEntryMerger.initLorebookEntryMerger(lorebookUtils, lorebookManager, { get_settings }, operationQueueModule);
        } else {
            lorebookEntryMerger.initLorebookEntryMerger(lorebookUtils, lorebookManager, { get_settings }, null);
        }

        console.log('[EVENT HANDLERS] About to init summaryToLorebookProcessor with connectionSettingsManager:', connectionSettingsManager);
        console.log('[EVENT HANDLERS] connectionSettingsManager.withConnectionSettings:', connectionSettingsManager?.withConnectionSettings);
        summaryToLorebookProcessor.initSummaryToLorebookProcessor(lorebookUtils, lorebookManager, lorebookEntryMerger, connectionSettingsManager, { get_settings, set_settings });
        console.log('[EVENT HANDLERS] ✓ summaryToLorebookProcessor initialized');

        log('[Lorebooks] ✓ Auto-Lorebooks functionality initialized');
    } catch (err) {
        log('[Lorebooks] Failed to initialize Auto-Lorebooks:', err);
    }

    // Initialize metadata injection system
    log('[Metadata] Initializing metadata injection...');
    try {
        const metadataInjector = await import('./metadataInjector.js');
        metadataInjector.initMetadataInjector({ get_settings });
        log('[Metadata] ✓ Metadata injection initialized');
    } catch (err) {
        log('[Metadata] Failed to initialize metadata injection:', err);
    }

    // Register operation handlers AFTER all modules are initialized
    if (operationQueueModule) {
        log('[Queue] Registering operation handlers...');
        const { registerAllOperationHandlers } = await import('./operationHandlers.js');
        registerAllOperationHandlers();
        log('[Queue] ✓ Operation handlers registered');
    }
}

// Call initialization immediately when module loads
console.log('[EVENT HANDLERS] Module loaded, calling initializeExtension()...');
initializeExtension().catch(err => {
    console.error('[EVENT HANDLERS] Failed to initialize extension:', err);
    console.error('[EVENT HANDLERS] Stack trace:', err.stack);
});

export {
    on_chat_event
};

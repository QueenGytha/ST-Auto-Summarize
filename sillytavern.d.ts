// Type definitions for SillyTavern exports used by ST-Auto-Recap
// Generated from actual SillyTavern source code (script.js, st-context.js, events.js)
// This file provides TypeScript type checking to catch errors like calling variables as functions

// ============================================================================
// SCRIPT.JS EXPORTS
// ============================================================================

declare module '../../../../script.js' {
    // ========================================================================
    // VARIABLES (exported with 'let' - can be reassigned by SillyTavern)
    // ========================================================================

    /**
     * CRITICAL: This is a BOOLEAN VARIABLE, not a function!
     * Indicates whether a message send/generation is currently in progress.
     * Use setSendButtonState(value) to modify this.
     * @example
     * // CORRECT:
     * if (is_send_press) { ... }
     *
     * // WRONG - will cause TypeError:
     * is_send_press(true);
     */
    export let is_send_press: boolean;

    /** Animation duration in milliseconds */
    export let animation_duration: number;

    /** Animation easing function name */
    export let animation_easing: string;

    /** Default max length of AI generated responses */
    export let amount_gen: number;

    /** Maximum context size in tokens */
    export let max_context: number;

    /** Current main API being used (e.g., 'openai', 'kobold', 'novel') */
    export let main_api: string;

    /** Current menu type */
    export let menu_type: string;

    /** Current user name */
    export let name1: string;

    /** Current character/AI name */
    export let name2: string;

    /** Current online connection status */
    export let online_status: string;

    /** Current character ID */
    export let this_chid: number | undefined;

    /** Current chat messages array */
    export let chat: any[];

    /** Chat metadata object */
    export let chat_metadata: Record<string, any>;

    /** Streaming processor instance */
    export let streamingProcessor: any;

    /** Array of all loaded characters */
    export let characters: any[];

    /** Extension prompts registry */
    export let extension_prompts: Record<string, any>;

    /** Whether chat is currently being saved */
    export let isChatSaving: boolean;

    /** SillyTavern display version string */
    export let displayVersion: string;

    /** Active character identifier */
    export let active_character: string;

    /** Active group identifier */
    export let active_group: string;

    /** Settings object */
    export let settings: any;

    /** Authentication token */
    export let token: string | undefined;

    // ========================================================================
    // CONSTANTS (exported with 'const' - readonly)
    // ========================================================================

    /** Default animation duration */
    export const ANIMATION_DURATION_DEFAULT: number;

    /** System user name constant */
    export const systemUserName: string;

    /** Neutral character name constant */
    export const neutralCharacterName: string;

    /** Default user avatar path */
    export const default_user_avatar: string;

    /** Default AI avatar path */
    export const default_avatar: string;

    /** System avatar path */
    export const system_avatar: string;

    /** Comment avatar path */
    export const comment_avatar: string;

    /** Maximum injection depth for extension prompts */
    export const MAX_INJECTION_DEPTH: number;

    /** Default talkativeness value */
    export const talkativeness_default: number;

    /** Default depth prompt depth */
    export const depth_prompt_depth_default: number;

    /** Default depth prompt role */
    export const depth_prompt_role_default: string;

    /** Main chat element jQuery reference */
    export const chatElement: JQuery<HTMLElement>;

    /** Character drag-drop handler */
    export let charDragDropHandler: any;

    /** Chat drag-drop handler */
    export let chatDragDropHandler: any;

    /** Default save/edit timeout constant */
    export const DEFAULT_SAVE_EDIT_TIMEOUT: number;

    /** Default print timeout constant */
    export const DEFAULT_PRINT_TIMEOUT: number;

    /** Character creation/save data object */
    export let create_save: any;

    /**
     * Extension prompt types enum
     * @example { BEFORE_PROMPT: 0, IN_PROMPT: 1, AFTER_PROMPT: 2, ... }
     */
    export const extension_prompt_types: {
        BEFORE_PROMPT: number;
        IN_PROMPT: number;
        AFTER_PROMPT: number;
        [key: string]: number;
    };

    /**
     * Extension prompt roles enum
     * @example { SYSTEM: 0, USER: 1, ASSISTANT: 2 }
     */
    export const extension_prompt_roles: {
        SYSTEM: number;
        USER: number;
        ASSISTANT: number;
        [key: string]: number;
    };

    /**
     * System message types (imported from system-messages.js)
     */
    export const system_message_types: {
        GENERIC: string;
        NARRATOR: string;
        ASSISTANT_NOTE: string;
        [key: string]: string;
    };

    /**
     * API connection map for slash commands
     */
    export const CONNECT_API_MAP: Record<string, any>;

    // ========================================================================
    // FUNCTIONS
    // ========================================================================

    /**
     * Sets the send button state (locks/unlocks UI during generation)
     * @param value - true to lock (generation in progress), false to unlock
     */
    export function setSendButtonState(value: boolean): void;

    /**
     * Activates (enables) send buttons
     */
    export function activateSendButtons(): void;

    /**
     * Deactivates (disables) send buttons
     */
    export function deactivateSendButtons(): void;

    /**
     * Generates text using raw API call
     * @param options - Generation options
     * @returns Generated text
     */
    export function generateRaw(options: {
        prompt?: string;
        api?: string | null;
        instructOverride?: boolean;
        quietToLoud?: boolean;
        systemPrompt?: string;
        responseLength?: number | null;
        trimNames?: boolean;
        prefill?: string;
        jsonSchema?: any;
    }): Promise<string>;

    /**
     * Gets the maximum context size for current API/model
     * @param overrideResponseLength - Optional response length override
     * @returns Maximum context size in tokens
     */
    export function getMaxContextSize(overrideResponseLength?: number | null): number;

    /**
     * Scrolls chat to bottom
     */
    export function scrollChatToBottom(): void;

    /**
     * Saves settings with debounce
     */
    export function saveSettingsDebounced(): void;

    /**
     * Saves character with debounce
     */
    export function saveCharacterDebounced(): void;

    /**
     * Saves chat with debounce
     */
    export function saveChatDebounced(): void;

    /**
     * Gets current chat ID
     * @returns Current chat ID or undefined
     */
    export function getCurrentChatId(): string | undefined;

    /**
     * Gets request headers for API calls
     * @param options - Header options
     * @returns Headers object
     */
    export function getRequestHeaders(options?: { omitContentType?: boolean }): Record<string, string>;

    /**
     * Substitutes template params in content
     * @param content - Content with template variables
     * @param _name1 - User name (optional)
     * @param _name2 - Character name (optional)
     * @param _original - Original content (optional)
     * @param _group - Group info (optional)
     * @param _replaceCharacterCard - Whether to replace character card (optional)
     * @param additionalMacro - Additional macro definitions (optional)
     * @param postProcessFn - Post-processing function (optional)
     * @returns Content with substituted params
     */
    export function substituteParams(
        content: string,
        _name1?: string,
        _name2?: string,
        _original?: string,
        _group?: any,
        _replaceCharacterCard?: boolean,
        additionalMacro?: Record<string, any>,
        postProcessFn?: (x: string) => string
    ): string;

    /**
     * Extended version of substituteParams with additional macro support
     * @param content - Content with template variables
     * @param additionalMacro - Additional macro definitions
     * @param postProcessFn - Post-processing function
     * @returns Content with substituted params
     */
    export function substituteParamsExtended(
        content: string,
        additionalMacro?: Record<string, any>,
        postProcessFn?: (x: string) => string
    ): string;

    /**
     * Formats a message for display
     * @param mes - Message text
     * @param ch_name - Character name
     * @param isSystem - Whether message is system message
     * @param isUser - Whether message is user message
     * @param messageId - Message ID
     * @param sanitizerOverrides - Sanitizer override options
     * @param isReasoning - Whether message is reasoning
     * @returns Formatted message HTML
     */
    export function messageFormatting(
        mes: string,
        ch_name: string,
        isSystem: boolean,
        isUser: boolean,
        messageId: number,
        sanitizerOverrides?: Record<string, any>,
        isReasoning?: boolean
    ): string;

    /**
     * Updates a message block in the UI
     * @param messageId - Message ID to update
     * @param message - New message object
     * @param options - Update options
     */
    export function updateMessageBlock(
        messageId: number,
        message: any,
        options?: { rerenderMessage?: boolean }
    ): void;

    /**
     * Adds one message to the chat
     * @param mes - Message object
     * @param options - Display options
     */
    export function addOneMessage(
        mes: any,
        options?: {
            type?: string;
            insertAfter?: number | null;
            scroll?: boolean;
            insertBefore?: number | null;
            forceId?: number | null;
            showSwipes?: boolean;
        }
    ): void;

    /**
     * Appends media (images, audio) to a message element
     * @param mes - Message object
     * @param messageElement - Message DOM element
     * @param adjustScroll - Whether to adjust scroll position
     */
    export function appendMediaToMessage(
        mes: any,
        messageElement: HTMLElement,
        adjustScroll?: boolean
    ): void;

    /**
     * Sets an extension prompt at specified position/depth
     * @param key - Prompt identifier key
     * @param value - Prompt text
     * @param position - Position in prompt (from extension_prompt_types)
     * @param depth - Injection depth
     * @param scan - Whether to scan for activation
     * @param role - Prompt role (from extension_prompt_roles)
     * @param filter - Optional filter function
     */
    export function setExtensionPrompt(
        key: string,
        value: string,
        position: number,
        depth: number,
        scan?: boolean,
        role?: number,
        filter?: ((messages: any[]) => any[]) | null
    ): void;

    /**
     * Updates chat metadata
     * @param newValues - New metadata values
     * @param reset - Whether to reset existing metadata
     */
    export function updateChatMetadata(
        newValues: Record<string, any>,
        reset?: boolean
    ): void;

    /**
     * Displays a popup dialog
     * @param text - Popup text/HTML
     * @param type - Popup type
     * @param inputValue - Default input value
     * @param options - Popup options
     * @returns Promise that resolves with user input
     */
    export function callPopup(
        text: string,
        type: string,
        inputValue?: string,
        options?: {
            okButton?: string;
            rows?: number;
            wide?: boolean;
            wider?: boolean;
            large?: boolean;
            allowHorizontalScrolling?: boolean;
            allowVerticalScrolling?: boolean;
            cropAspect?: number;
        }
    ): Promise<string | boolean | null>;

    /**
     * Stops current generation
     */
    export function stopGeneration(): void;

    /**
     * Resets chat state
     */
    export function resetChatState(): void;

    /**
     * Sets menu type
     * @param value - Menu type string
     */
    export function setMenuType(value: string): void;

    /**
     * Sets character ID
     * @param value - Character ID
     */
    export function setCharacterId(value: number | undefined): void;

    /**
     * Sets character name
     * @param value - Character name
     */
    export function setCharacterName(value: string): void;

    /**
     * Sets online status
     * @param value - Online status string
     */
    export function setOnlineStatus(value: string): void;

    /**
     * Sets edited message ID
     * @param value - Message ID
     */
    export function setEditedMessageId(value: number): void;

    /**
     * Gets thumbnail URL for media
     * @param type - Media type
     * @param file - File path
     * @param t - Timestamp flag
     * @returns Thumbnail URL
     */
    export function getThumbnailUrl(type: string, file: string, t?: boolean): string;

    /**
     * Swipe left (previous message variant)
     * @param _event - Event object
     * @param options - Swipe options
     */
    export function swipe_left(_event?: Event, options?: { source?: string; repeated?: boolean }): void;

    /**
     * Swipe right (next message variant)
     * @param _event - Event object
     * @param options - Swipe options
     */
    export function swipe_right(_event?: Event | null, options?: { source?: string; repeated?: boolean }): void;

    /**
     * Gets character card fields
     * @param options - Options object
     * @returns Character card fields
     */
    export function getCharacterCardFields(options?: { chid?: number | null }): Record<string, any>;

    /**
     * Reloads markdown processor
     */
    export function reloadMarkdownProcessor(): void;
}

// ============================================================================
// ST-CONTEXT.JS - getContext() RETURN TYPE
// ============================================================================

declare module '../../../../scripts/st-context.js' {
    import { EventEmitter } from '../lib/eventemitter.js';

    /**
     * Context object returned by getContext()
     * Provides access to SillyTavern's internal state and functions
     */
    export interface STContext {
        // Core data
        accountStorage: any;
        chat: any[];
        characters: any[];
        groups: any[];
        name1: string;
        name2: string;
        characterId: number | undefined;
        groupId: string;
        chatId: string | undefined;

        // Functions
        getCurrentChatId: () => string | undefined;
        getRequestHeaders: (options?: { omitContentType?: boolean }) => Record<string, string>;
        reloadCurrentChat: () => Promise<void>;
        renameChat: (newName: string) => Promise<void>;
        saveSettingsDebounced: () => void;

        // Status
        onlineStatus: string;
        maxContext: number;

        // Metadata
        chatMetadata: Record<string, any>;
        saveMetadataDebounced: () => void;

        // Streaming
        streamingProcessor: any;

        // Events
        eventSource: EventEmitter;
        eventTypes: typeof event_types;
        event_types: typeof event_types; // Legacy snake-case

        // Messages
        addOneMessage: (mes: any, options?: any) => void;
        deleteLastMessage: () => void;

        // Generation
        generate: any;
        sendStreamingRequest: any;
        sendGenerationRequest: any;
        stopGeneration: () => void;

        // Tokenization
        tokenizers: any;
        getTextTokens: (text: string) => any[];
        getTokenCount: (text: string) => number; // @deprecated
        getTokenCountAsync: (text: string) => Promise<number>;

        // Extension prompts
        extensionPrompts: Record<string, any>;
        setExtensionPrompt: (key: string, value: string, position: number, depth: number, scan?: boolean, role?: number, filter?: any) => void;

        // Chat operations
        updateChatMetadata: (newValues: Record<string, any>, reset?: boolean) => void;
        saveChat: (force?: boolean) => Promise<void>;
        openCharacterChat: (characterId: number) => Promise<void>;
        openGroupChat: (groupId: string) => Promise<void>;
        saveMetadata: () => void;

        // System messages
        sendSystemMessage: (type: string, text?: string, options?: any) => void;

        // UI control
        activateSendButtons: () => void;
        deactivateSendButtons: () => void;

        // Reply handling
        saveReply: (type: string, mes: string) => Promise<void>;

        // Substitution
        substituteParams: (content: string, ...args: any[]) => string;
        substituteParamsExtended: (content: string, additionalMacro?: Record<string, any>, postProcessFn?: (x: string) => string) => string;

        // Slash commands
        SlashCommandParser: any;
        SlashCommand: any;
        SlashCommandArgument: any;
        SlashCommandNamedArgument: any;
        ARGUMENT_TYPE: any;
        executeSlashCommandsWithOptions: any;
        registerSlashCommand: any; // @deprecated
        executeSlashCommands: any; // @deprecated

        // Utilities
        timestampToMoment: (timestamp: number) => any;
        registerHelper: () => void; // @deprecated
        registerMacro: (name: string, fn: Function) => void;
        unregisterMacro: (name: string) => void;

        // Tool calling
        registerFunctionTool: any;
        unregisterFunctionTool: any;
        isToolCallingSupported: any;
        canPerformToolCalls: any;
        ToolManager: any;

        // Debug
        registerDebugFunction: (name: string, fn: Function) => void;

        // Templates
        renderExtensionTemplate: any; // @deprecated
        renderExtensionTemplateAsync: (extensionName: string, templateName: string, data?: any) => Promise<string>;

        // Data bank
        registerDataBankScraper: any;

        // Popups
        callPopup: (text: string, type: string, inputValue?: string, options?: any) => Promise<any>; // @deprecated
        callGenericPopup: any;

        // Loader
        showLoader: () => void;
        hideLoader: () => void;

        // API info
        mainApi: string;

        // Settings
        extensionSettings: Record<string, any>;

        // Workers
        ModuleWorkerWrapper: any;

        // Generation functions
        getTokenizerModel: () => string;
        generateQuietPrompt: any;
        generateRaw: (options: any) => Promise<string>;

        // Extension fields
        writeExtensionField: (extensionName: string, key: string, value: any) => Promise<void>;

        // Media
        getThumbnailUrl: (type: string, file: string, t?: boolean) => string;

        // Character selection
        selectCharacterById: (characterId: number) => Promise<void>;

        // Message formatting
        messageFormatting: (mes: string, ch_name: string, isSystem: boolean, isUser: boolean, messageId: number, sanitizerOverrides?: any, isReasoning?: boolean) => string;

        // Input handling
        shouldSendOnEnter: () => boolean;
        isMobile: () => boolean;

        // i18n
        t: (key: string, ...args: any[]) => string;
        translate: (text: string, lang: string, provider?: string | null) => Promise<string>;
        getCurrentLocale: () => string;
        addLocaleData: (locale: string, data: Record<string, string>) => void;

        // Tags
        tags: any[];
        tagMap: Map<any, any>;

        // Menu
        menuType: string;

        // Character creation
        createCharacterData: any;

        // Popups (new API)
        Popup: any;
        POPUP_TYPE: any;
        POPUP_RESULT: any;

        // Settings objects
        chatCompletionSettings: any;
        textCompletionSettings: any;
        powerUserSettings: any;

        // Character functions
        getCharacters: () => any[];
        getCharacterCardFields: (options?: { chid?: number | null }) => Record<string, any>;

        // UUID
        uuidv4: () => string;

        // DateTime
        humanizedDateTime: (timestamp: number) => string;

        // Message operations
        updateMessageBlock: (messageId: number, message: any, options?: any) => void;
        appendMediaToMessage: (mes: any, messageElement: HTMLElement, adjustScroll?: boolean) => void;

        // Swipe
        swipe: {
            left: (event?: Event, options?: any) => void;
            right: (event?: Event | null, options?: any) => void;
        };

        // Variables
        variables: {
            local: {
                get: (name: string) => any;
                set: (name: string, value: any) => void;
            };
            global: {
                get: (name: string) => any;
                set: (name: string, value: any) => void;
            };
        };

        // World Info
        loadWorldInfo: any;
        saveWorldInfo: any;
        reloadWorldInfoEditor: any;
        updateWorldInfoList: any;
        convertCharacterBook: any;
        getWorldInfoPrompt: any;

        // API map
        CONNECT_API_MAP: Record<string, any>;

        // Text gen
        getTextGenServer: any;

        // Data extraction
        extractMessageFromData: any;

        // Preset manager
        getPresetManager: any;

        // Model info
        getChatCompletionModel: any;

        // Chat display
        printMessages: any;
        clearChat: any;

        // Services
        ChatCompletionService: any;
        TextCompletionService: any;
        ConnectionManagerRequestService: any;

        // Reasoning
        updateReasoningUI: any;
        parseReasoningFromString: any;

        // Character management
        unshallowCharacter: any;
        unshallowGroupMembers: any;
        openThirdPartyExtensionMenu: any;

        // Symbols
        symbols: {
            ignore: symbol;
        };
    }

    /**
     * Gets the SillyTavern context object
     * @returns Context with access to SillyTavern internals
     */
    export default function getContext(): STContext;
    export function getContext(): STContext;
}

// ============================================================================
// EVENTS.JS - EVENT TYPES
// ============================================================================

declare module '../../../../scripts/events.js' {
    import { EventEmitter } from '../lib/eventemitter.js';

    /**
     * All event types that can be emitted by SillyTavern
     */
    export const event_types: {
        APP_READY: 'app_ready';
        EXTRAS_CONNECTED: 'extras_connected';
        MESSAGE_SWIPED: 'message_swiped';
        MESSAGE_SENT: 'message_sent';
        MESSAGE_RECEIVED: 'message_received';
        MESSAGE_EDITED: 'message_edited';
        MESSAGE_DELETED: 'message_deleted';
        MESSAGE_UPDATED: 'message_updated';
        MESSAGE_FILE_EMBEDDED: 'message_file_embedded';
        MESSAGE_REASONING_EDITED: 'message_reasoning_edited';
        MESSAGE_REASONING_DELETED: 'message_reasoning_deleted';
        MESSAGE_SWIPE_DELETED: 'message_swipe_deleted';
        MORE_MESSAGES_LOADED: 'more_messages_loaded';
        IMPERSONATE_READY: 'impersonate_ready';
        CHAT_CHANGED: 'chat_id_changed';
        GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS';
        GENERATION_STARTED: 'generation_started';
        GENERATION_STOPPED: 'generation_stopped';
        GENERATION_ENDED: 'generation_ended';
        SD_PROMPT_PROCESSING: 'sd_prompt_processing';
        EXTENSIONS_FIRST_LOAD: 'extensions_first_load';
        EXTENSION_SETTINGS_LOADED: 'extension_settings_loaded';
        SETTINGS_LOADED: 'settings_loaded';
        SETTINGS_UPDATED: 'settings_updated';
        GROUP_UPDATED: 'group_updated';
        MOVABLE_PANELS_RESET: 'movable_panels_reset';
        SETTINGS_LOADED_BEFORE: 'settings_loaded_before';
        SETTINGS_LOADED_AFTER: 'settings_loaded_after';
        CHATCOMPLETION_SOURCE_CHANGED: 'chatcompletion_source_changed';
        CHATCOMPLETION_MODEL_CHANGED: 'chatcompletion_model_changed';
        OAI_PRESET_CHANGED_BEFORE: 'oai_preset_changed_before';
        OAI_PRESET_CHANGED_AFTER: 'oai_preset_changed_after';
        OAI_PRESET_EXPORT_READY: 'oai_preset_export_ready';
        OAI_PRESET_IMPORT_READY: 'oai_preset_import_ready';
        WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated';
        WORLDINFO_UPDATED: 'worldinfo_updated';
        CHARACTER_EDITOR_OPENED: 'character_editor_opened';
        CHARACTER_EDITED: 'character_edited';
        CHARACTER_PAGE_LOADED: 'character_page_loaded';
        CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE: 'character_group_overlay_state_change_before';
        CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER: 'character_group_overlay_state_change_after';
        USER_MESSAGE_RENDERED: 'user_message_rendered';
        CHARACTER_MESSAGE_RENDERED: 'character_message_rendered';
        FORCE_SET_BACKGROUND: 'force_set_background';
        CHAT_DELETED: 'chat_deleted';
        CHAT_CREATED: 'chat_created';
        GROUP_CHAT_DELETED: 'group_chat_deleted';
        GROUP_CHAT_CREATED: 'group_chat_created';
        GENERATE_BEFORE_COMBINE_PROMPTS: 'generate_before_combine_prompts';
        GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts';
        GENERATE_AFTER_DATA: 'generate_after_data';
        GROUP_MEMBER_DRAFTED: 'group_member_drafted';
        GROUP_WRAPPER_STARTED: 'group_wrapper_started';
        GROUP_WRAPPER_FINISHED: 'group_wrapper_finished';
        WORLD_INFO_ACTIVATED: 'world_info_activated';
        TEXT_COMPLETION_SETTINGS_READY: 'text_completion_settings_ready';
        CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready';
        CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready';
        CHARACTER_FIRST_MESSAGE_SELECTED: 'character_first_message_selected';
        CHARACTER_DELETED: 'characterDeleted';
        CHARACTER_DUPLICATED: 'character_duplicated';
        CHARACTER_RENAMED: 'character_renamed';
        CHARACTER_RENAMED_IN_PAST_CHAT: 'character_renamed_in_past_chat';
        SMOOTH_STREAM_TOKEN_RECEIVED: 'stream_token_received'; // @deprecated
        STREAM_TOKEN_RECEIVED: 'stream_token_received';
        STREAM_REASONING_DONE: 'stream_reasoning_done';
        FILE_ATTACHMENT_DELETED: 'file_attachment_deleted';
        WORLDINFO_FORCE_ACTIVATE: 'worldinfo_force_activate';
        OPEN_CHARACTER_LIBRARY: 'open_character_library';
        ONLINE_STATUS_CHANGED: 'online_status_changed';
        IMAGE_SWIPED: 'image_swiped';
        CONNECTION_PROFILE_LOADED: 'connection_profile_loaded';
        CONNECTION_PROFILE_CREATED: 'connection_profile_created';
        CONNECTION_PROFILE_DELETED: 'connection_profile_deleted';
        CONNECTION_PROFILE_UPDATED: 'connection_profile_updated';
        TOOL_CALLS_PERFORMED: 'tool_calls_performed';
        TOOL_CALLS_RENDERED: 'tool_calls_rendered';
        CHARACTER_MANAGEMENT_DROPDOWN: 'charManagementDropdown';
        SECRET_WRITTEN: 'secret_written';
        SECRET_DELETED: 'secret_deleted';
        SECRET_ROTATED: 'secret_rotated';
        SECRET_EDITED: 'secret_edited';
        PRESET_CHANGED: 'preset_changed';
        PRESET_DELETED: 'preset_deleted';
        PRESET_RENAMED: 'preset_renamed';
        PRESET_RENAMED_BEFORE: 'preset_renamed_before';
        MAIN_API_CHANGED: 'main_api_changed';
        WORLDINFO_ENTRIES_LOADED: 'worldinfo_entries_loaded';
    };

    /**
     * Global event emitter instance
     * Use this to listen for and emit events
     * @example
     * eventSource.on(event_types.MESSAGE_SENT, (data) => { ... });
     */
    export const eventSource: EventEmitter;
}

// ============================================================================
// REGEX EXTENSION EXPORTS
// ============================================================================

declare module '../../../../scripts/extensions/regex/index.js' {
    /**
     * Gets available regex scripts
     * @returns Array of regex script objects
     */
    export function getRegexScripts(): any[];
}

declare module '../../../../scripts/extensions/regex/engine.js' {
    /**
     * Runs a regex script on text
     * @param scriptName - Name of regex script to run
     * @param text - Text to process
     * @returns Processed text
     */
    export function runRegexScript(scriptName: string, text: string): Promise<string>;
}

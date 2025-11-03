// @flow
// metadataInjector.js - System for injecting structured metadata into LLM prompts
// Metadata is added as JSON blocks that can be parsed and stripped by downstream proxies

// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { getCurrentChatId, characters, this_chid, name2 } from '../../../../script.js';
// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { selected_group, groups } from '../../../group-chats.js';

// Will be imported from index.js via barrel exports
let get_settings /*: any */;

/**
 * Initialize the metadata injector with imported utilities
 * This is called from index.js after all exports are set up
 */
// $FlowFixMe[signature-verification-failure]
export function initMetadataInjector(utils /*: any */) /*: void */ {
    get_settings = utils.get_settings;
}

/**
 * Metadata block structure
 * @typedef {Object} MetadataBlock
 * @property {string} version - Schema version for future compatibility
 * @property {string} chat - Current chat name/ID (character or group name)
 * @property {string} operation - Type of operation being performed
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {Object} custom - Custom operation-specific data
 */
/*::
type MetadataBlock = {
    version: string,
    chat: string,
    operation?: string,
    timestamp?: string,
    custom?: {[string]: any}
};
*/

/**
 * Get the current chat identifier for metadata
 * Returns the full chat ID with timestamp (matches {{chat}} macro in Auto-Lorebooks)
 * @returns {string} Chat identifier (e.g., "CharacterName - 2025-11-03@16h32m59s" or group name)
 */
// $FlowFixMe[signature-verification-failure]
export function getChatName() /*: string */ {
    try {
        // For single character chats, getCurrentChatId() returns the full identifier with timestamp
        // This matches what's used in Auto-Lorebooks naming: "CharacterName - YYYY-MM-DD@HHhMMmSSs"
        const chatId = getCurrentChatId();
        if (chatId && !selected_group) {
            return String(chatId).trim();
        }

        // For group chats, use group name
        if (selected_group) {
            const group = groups?.find((x) => x.id === selected_group);
            if (group && group.name) {
                return String(group.name).trim();
            }
        }

        // Fallback
        return 'Unknown';
    } catch (err) {
        console.error('[Auto-Summarize:Metadata] Error getting chat name:', err);
        return 'Unknown';
    }
}

/**
 * Check if metadata injection is enabled in settings
 * Implicitly enabled when send_chat_details is true
 * @returns {boolean} True if enabled
 */
// $FlowFixMe[signature-verification-failure]
export function isMetadataInjectionEnabled() /*: boolean */ {
    try {
        // get_settings expects a key parameter
        const enabled = get_settings('first_hop_proxy_send_chat_details');
        return enabled === true;
    } catch (err) {
        console.error('[Auto-Summarize:Metadata] Error checking if enabled:', err);
        return false; // Default to disabled
    }
}

/**
 * Get default metadata that should be included in all requests
 * @returns {Object} Base metadata object
 */
// $FlowFixMe[signature-verification-failure]
export function getDefaultMetadata() /*: {[string]: any} */ {
    const chatName = getChatName();

    return {
        version: '1.0',
        chat: chatName
    };
}

/**
 * Create a metadata block with optional custom fields
 * @param {Object} options - Optional metadata fields
 * @param {string} options.operation - Operation type (e.g., 'message_summary', 'scene_summary')
 * @param {Object} options.custom - Custom operation-specific data
 * @param {boolean} options.includeTimestamp - Include ISO timestamp (default: false)
 * @returns {Object} Complete metadata object
 */
// $FlowFixMe[signature-verification-failure]
export function createMetadataBlock(options /*: ?{operation?: string, custom?: {[string]: any}, includeTimestamp?: boolean} */ = {}) /*: MetadataBlock */ {
    const metadata /*: MetadataBlock */ = getDefaultMetadata();

    // Add operation type if provided
    if (options?.operation) {
        metadata.operation = String(options.operation);
    }

    // Add timestamp if requested
    if (options?.includeTimestamp) {
        metadata.timestamp = new Date().toISOString();
    }

    // Add custom fields if provided
    if (options?.custom && typeof options.custom === 'object') {
        metadata.custom = options.custom;
    }

    return metadata;
}

/**
 * Format metadata block as string for injection into prompt
 * Uses XML-style tags for easy parsing and stripping
 * @param {Object} metadata - Metadata object to format
 * @returns {string} Formatted metadata block
 */
// $FlowFixMe[signature-verification-failure]
export function formatMetadataBlock(metadata /*: MetadataBlock */) /*: string */ {
    try {
        const jsonStr = JSON.stringify(metadata, null, 2);
        return `<ST_METADATA>\n${jsonStr}\n</ST_METADATA>\n\n`;
    } catch (err) {
        console.error('[Auto-Summarize:Metadata] Error formatting metadata block:', err);
        return '';
    }
}

/**
 * Inject metadata into a prompt
 * Prepends metadata block before the prompt text
 * @param {string} prompt - Original prompt text
 * @param {Object} options - Metadata options (same as createMetadataBlock)
 * @returns {string} Prompt with metadata prepended
 */
// $FlowFixMe[signature-verification-failure]
export function injectMetadata(
    prompt /*: string */,
    options /*: ?{operation?: string, custom?: {[string]: any}, includeTimestamp?: boolean} */ = {}
) /*: string */ {
    try {
        // Check if injection is enabled
        if (!isMetadataInjectionEnabled()) {
            return prompt;
        }

        // Create metadata block
        const metadata = createMetadataBlock(options);

        // Format as string
        const metadataStr = formatMetadataBlock(metadata);

        // Prepend to prompt
        return metadataStr + prompt;

    } catch (err) {
        console.error('[Auto-Summarize:Metadata] Error injecting metadata:', err);
        // Return original prompt on error
        return prompt;
    }
}

/**
 * Strip metadata blocks from a prompt (utility for testing)
 * @param {string} prompt - Prompt that may contain metadata
 * @returns {string} Prompt with metadata removed
 */
// $FlowFixMe[signature-verification-failure]
export function stripMetadata(prompt /*: string */) /*: string */ {
    try {
        return prompt.replace(/<ST_METADATA>[\s\S]*?<\/ST_METADATA>\n?\n?/g, '');
    } catch (err) {
        console.error('[Auto-Summarize:Metadata] Error stripping metadata:', err);
        return prompt;
    }
}

/**
 * Inject metadata into the first system message of a chat array
 * Mutates the chat array in place
 * @param {Array} chatArray - Array of chat messages
 * @param {Object} options - Metadata options
 */
// $FlowFixMe[signature-verification-failure]
export function injectMetadataIntoChatArray(
    chatArray /*: Array<any> */,
    options /*: ?{operation?: string, custom?: {[string]: any}, includeTimestamp?: boolean} */ = {}
) /*: void */ {
    try {
        if (!isMetadataInjectionEnabled()) {
            return;
        }

        if (!Array.isArray(chatArray) || chatArray.length === 0) {
            return;
        }

        // Create metadata block
        const metadata = createMetadataBlock(options);
        const metadataStr = formatMetadataBlock(metadata);

        // Find first system message, or create one if none exists
        let firstSystemMessage = chatArray.find(msg => msg.role === 'system');

        if (firstSystemMessage) {
            // Prepend to existing system message
            firstSystemMessage.content = metadataStr + firstSystemMessage.content;
            console.log('[Auto-Summarize:Interceptor] Injected metadata into existing system message');
        } else {
            // No system message exists, insert at beginning
            chatArray.unshift({
                role: 'system',
                content: metadataStr
            });
            console.log('[Auto-Summarize:Interceptor] Created new system message with metadata');
        }

        console.log('[Auto-Summarize:Interceptor] Metadata:', JSON.stringify(metadata));
    } catch (err) {
        console.error('[Auto-Summarize:Metadata] Error injecting metadata into chat array:', err);
    }
}

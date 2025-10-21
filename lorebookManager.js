// @flow
// lorebookManager.js - Lorebook creation and management for ST-Auto-Lorebooks

// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
// $FlowFixMe[missing-export] - All exports exist in world-info.js at runtime
import {
    createNewWorldInfo,
    deleteWorldInfo,
    loadWorldInfo,
    saveWorldInfo,
    createWorldInfoEntry,
    deleteWorldInfoEntry,
    METADATA_KEY,
    world_names
    // $FlowFixMe[cannot-resolve-module]
} from '../../../world-info.js';
// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { chat_metadata, saveMetadata, getCurrentChatId, characters, this_chid, name2 } from '../../../../script.js';
// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { extension_settings } from '../../../extensions.js';
// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { selected_group, groups } from '../../../group-chats.js';

// Will be imported from index.js via barrel exports
let log /*: any */, debug /*: any */, error /*: any */, toast /*: any */, generateLorebookName /*: any */, getUniqueLorebookName /*: any */;  // Utility functions - any type is legitimate

/**
 * Initialize the lorebook manager with imported utilities
 * This is called from index.js after all exports are set up
 */
// $FlowFixMe[signature-verification-failure]
export function initLorebookManager(utils /*: any */) /*: void */ {
    // utils is any type - object with various utility functions - legitimate use of any
    log = utils.log;
    debug = utils.debug;
    error = utils.error;
    toast = utils.toast;
    generateLorebookName = utils.generateLorebookName;
    getUniqueLorebookName = utils.getUniqueLorebookName;
}

/**
 * Get current context information (character name, chat ID, group info)
 * @returns {Object} Context object with characterName, chatId, isGroupChat, groupName
 */
export function getCurrentContext() /*: any */ {
    try {
        let characterName = null;
        let chatId = null;
        let isGroupChat = false;
        let groupName = null;

        // Check if we're in a group chat
        if (selected_group) {
            isGroupChat = true;
            const group = groups?.find(x => x.id === selected_group);
            if (group) {
                groupName = group.name;
                chatId = group.chat_id;
                characterName = groupName; // Use group name as character name
            }
        } else {
            // Single character chat
            if (name2 && name2.trim()) {
                characterName = String(name2).trim();
            } else if (this_chid !== undefined && characters && characters[this_chid]) {
                characterName = characters[this_chid].name;
            }

            // Normalize unicode
            if (characterName && characterName.normalize) {
                characterName = characterName.normalize('NFC');
            }

            // Get chat ID
            chatId = getCurrentChatId();
        }

        return {
            characterName,
            chatId,
            isGroupChat,
            groupName
        };

    } catch (err) {
        error("Error getting current context", err);
        return {
            characterName: null,
            chatId: null,
            isGroupChat: false,
            groupName: null
        };
    }
}

/**
 * Check if auto-lorebooks is enabled for current chat
 * @returns {boolean} True if enabled
 */
export function isAutoLorebooksEnabled() /*: boolean */ {
    try {
        // Check chat-specific setting first
        const chatSetting = chat_metadata?.auto_lorebooks?.enabled;
        if (chatSetting !== undefined) {
            return chatSetting;
        }

        // Fall back to global default
        return extension_settings?.autoLorebooks?.enabledByDefault ?? true;

    } catch (err) {
        error("Error checking if auto-lorebooks enabled", err);
        return false;
    }
}

/**
 * Set auto-lorebooks enabled state for current chat
 * @param {boolean} enabled - Enable or disable
 */
export function setAutoLorebooksEnabled(enabled /*: boolean */) /*: void */ {
    try {
        if (!chat_metadata.auto_lorebooks) {
            chat_metadata.auto_lorebooks = ({} /*: any */);
        }

        chat_metadata.auto_lorebooks.enabled = enabled;
        saveMetadata();

        debug(`Auto-lorebooks ${enabled ? 'enabled' : 'disabled'} for current chat`);

    } catch (err) {
        error("Error setting auto-lorebooks enabled state", err);
    }
}

/**
 * Get the lorebook currently attached to this chat
 * @returns {string|null} Lorebook name or null
 */
export function getAttachedLorebook() /*: ?string */ {
    try {
        return chat_metadata?.[METADATA_KEY] || null;
    } catch (err) {
        error("Error getting attached lorebook", err);
        return null;
    }
}

/**
 * Check if a lorebook exists in SillyTavern
 * @param {string} lorebookName - Name of lorebook to check
 * @returns {boolean} True if exists
 */
export function lorebookExists(lorebookName /*: string */) /*: boolean */ {
    try {
        if (!lorebookName) return false;
        return world_names && world_names.includes(lorebookName);
    } catch (err) {
        error("Error checking if lorebook exists", err);
        return false;
    }
}

/**
 * Handle case where attached lorebook was manually deleted
 * Clears the stale reference and optionally recreates the lorebook
 * @param {string} missingLorebookName - Name of the missing lorebook
 * @returns {Promise<string|null>} New lorebook name or null
 */
export async function handleMissingLorebook(missingLorebookName /*: string */) /*: Promise<any> */ {
    try {
        log(`Detected missing lorebook: "${missingLorebookName}"`);

        // Clear the stale reference from chat metadata
        if (chat_metadata[METADATA_KEY] === missingLorebookName) {
            delete chat_metadata[METADATA_KEY];
            debug("Cleared stale lorebook reference from chat metadata");
        }

        if (chat_metadata.auto_lorebooks?.lorebookName === missingLorebookName) {
            delete chat_metadata.auto_lorebooks.lorebookName;
            delete chat_metadata.auto_lorebooks.attachedAt;
            debug("Cleared stale lorebook reference from extension metadata");
        }

        saveMetadata();

        // Check if auto-lorebooks is enabled for this chat
        if (!isAutoLorebooksEnabled()) {
            toast("Attached lorebook was deleted. Auto-lorebooks is disabled for this chat.", "warning");
            return null;
        }

        // Create a new lorebook to replace the deleted one
        log("Auto-lorebooks enabled: creating replacement lorebook");
        const newLorebookName = await createChatLorebook();

        if (!newLorebookName) {
            toast("Attached lorebook was deleted. Failed to create replacement.", "error");
            return null;
        }

        // Attach the new lorebook
        const attached = attachLorebook(newLorebookName);
        if (!attached) {
            error("Created replacement lorebook but failed to attach");
            toast("Created replacement lorebook but failed to attach", "error");
            return null;
        }

        toast(`Recreated deleted lorebook as: ${newLorebookName}`, "info");
        log(`Successfully recreated lorebook: ${newLorebookName}`);
        return newLorebookName;

    } catch (err) {
        error("Error handling missing lorebook", err);
        return null;
    }
}

/**
 * Attach a lorebook to the current chat
 * @param {string} lorebookName - Name of lorebook to attach
 * @returns {boolean} Success
 */
export function attachLorebook(lorebookName /*: string */) /*: boolean */ {
    try {
        if (!lorebookName) {
            error("Cannot attach lorebook: name is empty");
            return false;
        }

        // Verify lorebook exists
        if (!world_names || !world_names.includes(lorebookName)) {
            error(`Cannot attach lorebook: "${lorebookName}" does not exist`);
            return false;
        }

        // Attach via SillyTavern's standard metadata key
        chat_metadata[METADATA_KEY] = lorebookName;

        // Store in our extension metadata
        if (!chat_metadata.auto_lorebooks) {
            chat_metadata.auto_lorebooks = ({} /*: any */);
        }
        chat_metadata.auto_lorebooks.lorebookName = lorebookName;
        chat_metadata.auto_lorebooks.attachedAt = Date.now();

        saveMetadata();

        debug(`Attached lorebook: ${lorebookName}`);
        return true;

    } catch (err) {
        error("Error attaching lorebook", err);
        return false;
    }
}

/**
 * Create a new lorebook for the current chat
 * @returns {Promise<string|null>} Created lorebook name or null on failure
 */
export async function createChatLorebook() /*: Promise<any> */ {
    try {
        // Get current context
        const context = getCurrentContext();
        if (!context.characterName || !context.chatId) {
            error("Cannot create lorebook: missing character name or chat ID");
            toast("Cannot create lorebook: invalid chat context", "error");
            return null;
        }

        // Get naming template
        const template = extension_settings?.autoLorebooks?.nameTemplate || 'z-AutoLB - {{char}} - {{chat}}';

        // Generate name
        const baseName = generateLorebookName(template, context.characterName, context.chatId);
        const uniqueName = getUniqueLorebookName(baseName, world_names);

        debug(`Creating lorebook: ${uniqueName}`);

        // Create the lorebook
        const created = await createNewWorldInfo(uniqueName);

        if (!created) {
            error(`Failed to create lorebook: ${uniqueName}`);
            toast("Failed to create lorebook", "error");
            return null;
        }

        log(`Created lorebook: ${uniqueName}`);
        return uniqueName;

    } catch (err) {
        error("Error creating chat lorebook", err);
        toast("Error creating lorebook", "error");
        return null;
    }
}

/**
 * Ensure the current chat has a lorebook (create if needed)
 * @returns {Promise<boolean>} Success
 */
export async function ensureChatLorebook() /*: Promise<boolean> */ {
    try {
        // Check if enabled
        if (!isAutoLorebooksEnabled()) {
            debug("Auto-lorebooks not enabled for this chat");
            return false;
        }

        // Check if already has lorebook
        const existingLorebook = getAttachedLorebook();
        if (existingLorebook) {
            debug(`Chat already has lorebook: ${existingLorebook}`);
            return true;
        }

        // Create new lorebook
        const lorebookName = await createChatLorebook();
        if (!lorebookName) {
            return false;
        }

        // Attach it
        const attached = attachLorebook(lorebookName);
        if (!attached) {
            error("Created lorebook but failed to attach");
            return false;
        }

        toast(`Created chat lorebook: ${lorebookName}`, "success");
        log(`Ensured chat lorebook: ${lorebookName}`);
        return true;

    } catch (err) {
        error("Error ensuring chat lorebook", err);
        return false;
    }
}

/**
 * Delete the lorebook associated with a specific chat
 * NOTE: This is called when a chat is deleted
 * @param {string} lorebookName - Name of lorebook to delete
 * @returns {Promise<boolean>} Success
 */
export async function deleteChatLorebook(lorebookName /*: string */) /*: Promise<boolean> */ {
    try {
        if (!lorebookName) {
            debug("No lorebook to delete");
            return false;
        }

        // Verify it's one of our auto-created lorebooks
        if (!lorebookName.startsWith('z-AutoLB')) {
            debug(`Skipping deletion of non-auto lorebook: ${lorebookName}`);
            return false;
        }

        // Check if lorebook exists
        if (!world_names || !world_names.includes(lorebookName)) {
            debug(`Lorebook "${lorebookName}" does not exist, skipping deletion`);
            return false;
        }

        log(`Deleting lorebook: ${lorebookName}`);

        // Call SillyTavern's deleteWorldInfo API
        const result = await deleteWorldInfo(lorebookName);

        if (result) {
            log(`Successfully deleted lorebook: ${lorebookName}`);
            return true;
        } else {
            error(`Failed to delete lorebook: ${lorebookName}`);
            return false;
        }

    } catch (err) {
        error("Error deleting chat lorebook", err);
        return false;
    }
}

/**
 * Get lorebook metadata for current chat
 * @returns {Object|null} Metadata object or null
 */
export function getLorebookMetadata() /*: any */ {
    try {
        return chat_metadata?.auto_lorebooks || null;
    } catch (err) {
        error("Error getting lorebook metadata", err);
        return null;
    }
}

/**
 * Initialize lorebook for current chat (called on chat load/change)
 * @returns {Promise<void>}
 */
export async function initializeChatLorebook() {
    try {
        debug("Initializing chat lorebook");

        // Wait a bit for SillyTavern to finish loading
        await new Promise(resolve => setTimeout(resolve, 500));

        // Ensure lorebook exists if enabled
        await ensureChatLorebook();

    } catch (err) {
        error("Error initializing chat lorebook", err);
    }
}

/**
 * Add a new entry to a lorebook
 * @param {string} lorebookName - Name of the lorebook
 * @param {Object} entryData - Entry data (keys, content, etc.)
 * @returns {Promise<Object|null>} Created entry object or null on failure
 */
export async function addLorebookEntry(lorebookName /*: string */, entryData /*: any */ = {}) /*: Promise<any> */ {
    try {
        if (!lorebookName) {
            error("Cannot add entry: lorebook name is empty");
            return null;
        }

        // Verify lorebook exists
        if (!world_names || !world_names.includes(lorebookName)) {
            error(`Cannot add entry: lorebook "${lorebookName}" does not exist`);
            return null;
        }

        debug(`Adding entry to lorebook: ${lorebookName}`, entryData);

        // Load lorebook data
        const data = await loadWorldInfo(lorebookName);
        if (!data) {
            error(`Failed to load lorebook data for: ${lorebookName}`);
            return null;
        }

        // Create new entry
        const newEntry = createWorldInfoEntry(lorebookName, data);
        if (!newEntry) {
            error(`Failed to create entry in lorebook: ${lorebookName}`);
            return null;
        }

        // Apply provided data to the new entry
        if (entryData.keys && Array.isArray(entryData.keys)) {
            newEntry.key = entryData.keys;
        }
        if (entryData.secondaryKeys && Array.isArray(entryData.secondaryKeys)) {
            newEntry.keysecondary = entryData.secondaryKeys;
        }
        if (entryData.content) {
            newEntry.content = String(entryData.content);
        }
        if (entryData.comment) {
            newEntry.comment = String(entryData.comment);
        }
        if (typeof entryData.constant === 'boolean') {
            newEntry.constant = entryData.constant;
        }
        if (typeof entryData.order === 'number') {
            newEntry.order = entryData.order;
        }
        if (typeof entryData.position === 'number') {
            newEntry.position = entryData.position;
        }
        if (typeof entryData.depth === 'number') {
            newEntry.depth = entryData.depth;
        }

        // Save the lorebook
        await saveWorldInfo(lorebookName, data, true);

        log(`Added entry to lorebook "${lorebookName}": UID ${newEntry.uid}`);
        return newEntry;

    } catch (err) {
        error("Error adding lorebook entry", err);
        return null;
    }
}

/**
 * Modify an existing lorebook entry
 * @param {string} lorebookName - Name of the lorebook
 * @param {number} uid - UID of the entry to modify
 * @param {Object} updates - Object containing fields to update
 * @returns {Promise<boolean>} Success
 */
export async function modifyLorebookEntry(lorebookName /*: string */, uid /*: string */, updates /*: any */ = {}) /*: Promise<any> */ {
    try {
        if (!lorebookName) {
            error("Cannot modify entry: lorebook name is empty");
            return false;
        }

        if (uid === undefined || uid == null) {
            error("Cannot modify entry: UID is required");
            return false;
        }

        // Verify lorebook exists
        if (!world_names || !world_names.includes(lorebookName)) {
            error(`Cannot modify entry: lorebook "${lorebookName}" does not exist`);
            return false;
        }

        debug(`Modifying entry UID ${uid} in lorebook: ${lorebookName}`, updates);

        // Load lorebook data
        const data = await loadWorldInfo(lorebookName);
        if (!data) {
            error(`Failed to load lorebook data for: ${lorebookName}`);
            return false;
        }

        // Check if entry exists
        if (!data.entries || !data.entries[uid]) {
            error(`Entry with UID ${uid} does not exist in lorebook: ${lorebookName}`);
            return false;
        }

        const entry = data.entries[uid];

        // Apply updates
        if (updates.keys && Array.isArray(updates.keys)) {
            entry.key = updates.keys;
        }
        if (updates.secondaryKeys && Array.isArray(updates.secondaryKeys)) {
            entry.keysecondary = updates.secondaryKeys;
        }
        if (updates.content !== undefined) {
            entry.content = String(updates.content);
        }
        if (updates.comment !== undefined) {
            entry.comment = String(updates.comment);
        }
        if (typeof updates.constant === 'boolean') {
            entry.constant = updates.constant;
        }
        if (typeof updates.disable === 'boolean') {
            entry.disable = updates.disable;
        }
        if (typeof updates.order === 'number') {
            entry.order = updates.order;
        }
        if (typeof updates.position === 'number') {
            entry.position = updates.position;
        }
        if (typeof updates.depth === 'number') {
            entry.depth = updates.depth;
        }

        // Save the lorebook
        await saveWorldInfo(lorebookName, data, true);

        log(`Modified entry UID ${uid} in lorebook "${lorebookName}"`);
        return true;

    } catch (err) {
        error("Error modifying lorebook entry", err);
        return false;
    }
}

/**
 * Delete an entry from a lorebook
 * @param {string} lorebookName - Name of the lorebook
 * @param {number} uid - UID of the entry to delete
 * @param {boolean} silent - Skip confirmation dialog
 * @returns {Promise<boolean>} Success
 */
export async function deleteLorebookEntry(lorebookName /*: string */, uid /*: string */, silent /*: boolean */ = true) /*: Promise<boolean> */ {
    try {
        if (!lorebookName) {
            error("Cannot delete entry: lorebook name is empty");
            return false;
        }

        if (uid === undefined || uid == null) {
            error("Cannot delete entry: UID is required");
            return false;
        }

        // Verify lorebook exists
        if (!world_names || !world_names.includes(lorebookName)) {
            error(`Cannot delete entry: lorebook "${lorebookName}" does not exist`);
            return false;
        }

        debug(`Deleting entry UID ${uid} from lorebook: ${lorebookName}`);

        // Load lorebook data
        const data = await loadWorldInfo(lorebookName);
        if (!data) {
            error(`Failed to load lorebook data for: ${lorebookName}`);
            return false;
        }

        // Check if entry exists
        if (!data.entries || !data.entries[uid]) {
            error(`Entry with UID ${uid} does not exist in lorebook: ${lorebookName}`);
            return false;
        }

        // Delete the entry
        const deleted = await deleteWorldInfoEntry(data, uid, { silent });
        if (!deleted) {
            debug(`Entry deletion cancelled or failed for UID ${uid}`);
            return false;
        }

        // Save the lorebook
        await saveWorldInfo(lorebookName, data, true);

        log(`Deleted entry UID ${uid} from lorebook "${lorebookName}"`);
        return true;

    } catch (err) {
        error("Error deleting lorebook entry", err);
        return false;
    }
}

/**
 * Get all entries from a lorebook
 * @param {string} lorebookName - Name of the lorebook
 * @returns {Promise<Array|null>} Array of entries or null on failure
 */
export async function getLorebookEntries(lorebookName /*: string */) /*: Promise<any> */ {
    try {
        if (!lorebookName) {
            error("Cannot get entries: lorebook name is empty");
            return null;
        }

        // Verify lorebook exists
        if (!world_names || !world_names.includes(lorebookName)) {
            error(`Cannot get entries: lorebook "${lorebookName}" does not exist`);
            return null;
        }

        // Load lorebook data
        const data = await loadWorldInfo(lorebookName);
        if (!data) {
            error(`Failed to load lorebook data for: ${lorebookName}`);
            return null;
        }

        if (!data.entries) {
            return [];
        }

        // Convert entries object to array
        const entriesArray = Object.values(data.entries);
        debug(`Retrieved ${entriesArray.length} entries from lorebook: ${lorebookName}`);

        return entriesArray;

    } catch (err) {
        error("Error getting lorebook entries", err);
        return null;
    }
}

export default {
    initLorebookManager,
    getCurrentContext,
    isAutoLorebooksEnabled,
    setAutoLorebooksEnabled,
    getAttachedLorebook,
    lorebookExists,
    handleMissingLorebook,
    attachLorebook,
    createChatLorebook,
    ensureChatLorebook,
    deleteChatLorebook,
    getLorebookMetadata,
    initializeChatLorebook,
    addLorebookEntry,
    modifyLorebookEntry,
    deleteLorebookEntry,
    getLorebookEntries
};

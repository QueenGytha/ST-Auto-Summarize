// @flow
// trackingEntries.js - AI-editable tracking entries (GM notes, character stats, etc.)

// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { extension_settings } from '../../../extensions.js';
// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { generateRaw } from '../../../../script.js';

// Will be imported from index.js via barrel exports
let log /*: any */, debug /*: any */, error /*: any */, toast /*: any */;  // Utility functions - any type is legitimate
let getAttachedLorebook /*: any */, lorebookExists /*: any */, handleMissingLorebook /*: any */, addLorebookEntry /*: any */, modifyLorebookEntry /*: any */, getLorebookEntries /*: any */;  // Lorebook functions - any type is legitimate
let queueMergeGMNotes /*: any */, queueMergeCharacterStats /*: any */;  // Queue functions - any type is legitimate
let withConnectionSettings /*: any */;  // Connection settings management - any type is legitimate

/**
 * Configuration for tracking entry types
 */
const TRACKING_ENTRY_CONFIG = {
    gm_notes: {
        entryName: '__gm_notes',
        displayName: 'GM Notes',
        defaultContent: '[GM Notes]\nNo notes yet.',
        keys: ['gm notes', 'game master notes', 'campaign notes', 'dm notes'],
        order: 1001,
        description: 'Game Master notes for campaign tracking, plot threads, secrets, and foreshadowing'
    },
    character_stats: {
        entryName: '__character_stats',
        displayName: 'Character Stats',
        defaultContent: '[Character Stats]\nNo stats tracked yet.',
        keys: ['character stats', 'player stats', 'character sheet', 'stats'],
        order: 1002,
        description: 'Character statistics, inventory, and status effects'
    }
};

/**
 * Default prompts for merging updates
 */
export const DEFAULT_MERGE_PROMPTS = {
    gm_notes: `You are a Game Master assistant helping to maintain campaign notes.

Current GM Notes:
{{current_content}}

New Information to Add:
{{new_update}}

Instructions:
1. Read the current GM notes and the new information
2. Merge the new information into the existing notes
3. Organize information logically (plot threads, NPC motivations, secrets, foreshadowing, etc.)
4. Keep the format clean and readable
5. Remove duplicate information
6. Preserve important details from both sources
7. Use clear section headers if helpful

Output only the updated GM notes content, nothing else.`,

    character_stats: `Merge the new updates with the current content.

Current Content:
{{current_content}}

New Updates:
{{new_update}}

Instructions:
1. Apply the updates to the current content
2. Preserve the existing format and structure exactly
3. Only add or modify what the updates specify
4. Remove outdated information if updates indicate replacement
5. Keep formatting clean and consistent

Output only the merged content, nothing else.`
};

/**
 * Initialize the tracking entries module
 */
export function initTrackingEntries(utils /*: any */, lorebookManager /*: any */, queueIntegrationModule /*: any */, connectionSettingsManager /*: any */) /*: void */ {
    log = utils.log;
    debug = utils.debug;
    error = utils.error;
    toast = utils.toast;
    getAttachedLorebook = lorebookManager.getAttachedLorebook;
    lorebookExists = lorebookManager.lorebookExists;
    handleMissingLorebook = lorebookManager.handleMissingLorebook;
    addLorebookEntry = lorebookManager.addLorebookEntry;
    modifyLorebookEntry = lorebookManager.modifyLorebookEntry;
    getLorebookEntries = lorebookManager.getLorebookEntries;

    // Import connection settings management
    if (connectionSettingsManager) {
        withConnectionSettings = connectionSettingsManager.withConnectionSettings;
    }

    // Import queue integration functions if available
    if (queueIntegrationModule) {
        queueMergeGMNotes = queueIntegrationModule.queueMergeGMNotes;
        queueMergeCharacterStats = queueIntegrationModule.queueMergeCharacterStats;
    }
}

/**
 * Get tracking settings (with defaults)
 */
function getTrackingSetting(key /*: string */, defaultValue /*: any */ = null) /*: any */ {
    try {
        const settings = extension_settings?.autoLorebooks?.tracking || {};
        return settings[key] ?? defaultValue;
    } catch (err) {
        error("Error getting tracking setting", err);
        return defaultValue;
    }
}

/**
 * Set tracking setting
 */
function setTrackingSetting(key /*: string */, value /*: any */) /*: void */ {
    try {
        if (!extension_settings.autoLorebooks) {
            extension_settings.autoLorebooks = ({} /*: any */);
        }
        if (!extension_settings.autoLorebooks.tracking) {
            extension_settings.autoLorebooks.tracking = ({} /*: any */);
        }
        // $FlowFixMe[prop-missing] - Dynamic property assignment to tracking settings
        extension_settings.autoLorebooks.tracking[key] = value;
    } catch (err) {
        error("Error setting tracking setting", err);
    }
}

/**
 * Initialize default tracking settings
 */
export function initializeTrackingSettings() /*: void */ {
    try {
        // Enable/disable tracking
        if (getTrackingSetting('enabled') === null) {
            setTrackingSetting('enabled', true);
        }

        // Auto-create tracking entries
        if (getTrackingSetting('auto_create') === null) {
            setTrackingSetting('auto_create', true);
        }

        // Remove syntax from messages
        if (getTrackingSetting('remove_from_message') === null) {
            setTrackingSetting('remove_from_message', true);
        }

        // Syntax patterns
        if (!getTrackingSetting('syntax_gm_notes')) {
            setTrackingSetting('syntax_gm_notes', '<-- gm_notes: {{content}} -->');
        }
        if (!getTrackingSetting('syntax_character_stats')) {
            setTrackingSetting('syntax_character_stats', '<-- character_stats: {{content}} -->');
        }

        // Merge prompts
        if (!getTrackingSetting('merge_prompt_gm_notes')) {
            setTrackingSetting('merge_prompt_gm_notes', DEFAULT_MERGE_PROMPTS.gm_notes);
        }
        if (!getTrackingSetting('merge_prompt_character_stats')) {
            setTrackingSetting('merge_prompt_character_stats', DEFAULT_MERGE_PROMPTS.character_stats);
        }

        // Connection profile for merging (empty = use main API)
        if (getTrackingSetting('merge_connection_profile') === null) {
            setTrackingSetting('merge_connection_profile', '');
        }

        // Completion preset for merging
        if (getTrackingSetting('merge_completion_preset') === null) {
            setTrackingSetting('merge_completion_preset', '');
        }

        // Prefill for Claude models
        if (getTrackingSetting('merge_prefill') === null) {
            setTrackingSetting('merge_prefill', '');
        }

        // Intercept send button to process latest message before generation
        if (getTrackingSetting('intercept_send_button') === null) {
            setTrackingSetting('intercept_send_button', true);
        }

        debug("Initialized tracking settings");

    } catch (err) {
        error("Error initializing tracking settings", err);
    }
}

/**
 * Parse syntax pattern and extract content
 * @param {string} text - Text to parse
 * @param {string} syntaxPattern - Pattern like "<-- gm_notes: {{content}} -->"
 * @returns {Array<{match: string, content: string, start: number, end: number}>} Matches
 */
function parseSyntaxPattern(text /*: string */, syntaxPattern /*: any */) /*: any */ {
    try {
        // Convert pattern to regex
        // Escape special regex characters except {{content}}
        const pattern = syntaxPattern
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars
            .replace('\\{\\{content\\}\\}', '([\\s\\S]*?)');  // Replace {{content}} with capture group

        const regex = new RegExp(pattern, 'g');
        const matches = [];

        let match;
        while ((match = regex.exec(text)) !== null) {
            // Flow doesn't understand that match is non-null inside while loop
            // Assert non-null for Flow
            if (!match) continue; // This will never happen but satisfies Flow
            matches.push({
                match: match[0],
                content: match[1]?.trim() || '',
                start: match.index,
                end: match.index + match[0].length
            });
        }

        return matches;

    } catch (err) {
        error("Error parsing syntax pattern", err);
        return [];
    }
}

/**
 * Parse message for tracking updates
 * @param {string} messageText - The message text to parse
 * @returns {Object} { gm_notes: [...], character_stats: [...] }
 */
export function parseMessageForUpdates(messageText /*: string */) /*: any */ {
    try {
        if (!messageText || typeof messageText !== 'string') {
            return { gm_notes: [], character_stats: [] };
        }

        const gmNotesSyntax = getTrackingSetting('syntax_gm_notes', '<-- gm_notes: {{content}} -->');
        const characterStatsSyntax = getTrackingSetting('syntax_character_stats', '<-- character_stats: {{content}} -->');

        const gmNotesMatches = parseSyntaxPattern(messageText, gmNotesSyntax);
        const characterStatsMatches = parseSyntaxPattern(messageText, characterStatsSyntax);

        if (gmNotesMatches.length > 0 || characterStatsMatches.length > 0) {
            debug(`Found tracking updates: ${gmNotesMatches.length} gm_notes, ${characterStatsMatches.length} character_stats`);
        }

        return {
            gm_notes: gmNotesMatches,
            character_stats: characterStatsMatches
        };

    } catch (err) {
        error("Error parsing message for updates", err);
        return { gm_notes: [], character_stats: [] };
    }
}

/**
 * Remove tracking syntax from message text
 * @param {string} messageText - Original message text
 * @param {Object} updates - Updates object from parseMessageForUpdates
 * @returns {string} Cleaned message text
 */
export function removeTrackingSyntax(messageText /*: string */, updates /*: any */) /*: string */ {
    try {
        let cleaned = messageText;

        // Remove all matches (work backwards to preserve indices)
        const allMatches = [
            ...updates.gm_notes,
            ...updates.character_stats
        ].sort((a, b) => b.start - a.start);

        for (const match of allMatches) {
            cleaned = cleaned.slice(0, match.start) + cleaned.slice(match.end);
        }

        // Clean up extra whitespace
        cleaned = cleaned.replace(/\n\n\n+/g, '\n\n').trim();

        return cleaned;

    } catch (err) {
        error("Error removing tracking syntax", err);
        return messageText;
    }
}

/**
 * Merge update with current entry content using AI
 * @param {string} entryType - 'gm_notes' or 'character_stats'
 * @param {string} currentContent - Current entry content
 * @param {string} newUpdate - New update to merge
 * @returns {Promise<string|null>} Merged content or null on failure
 */
async function mergeUpdateWithAI(entryType /*: string */, currentContent /*: string */, newUpdate /*: string */) /*: Promise<?string> */ {
    try {
        const mergePrompt = getTrackingSetting(`merge_prompt_${entryType}`);
        if (!mergePrompt) {
            error(`No merge prompt configured for ${entryType}`);
            return null;
        }

        // Substitute macros
        const prompt = mergePrompt
            .replace(/\{\{current_content\}\}/g, currentContent || 'None')
            .replace(/\{\{new_update\}\}/g, newUpdate || 'None');

        debug(`Merging ${entryType} update using AI`);

        // Get settings
        const connectionProfile = getTrackingSetting('merge_connection_profile', '');
        const completionPreset = getTrackingSetting('merge_completion_preset', '');
        const prefill = getTrackingSetting('merge_prefill', '');

        // Use centralized connection settings management
        const result = await withConnectionSettings(
            connectionProfile,
            completionPreset,
            async () => {
                // Call AI with new object-based signature
                // $FlowFixMe[incompatible-call] - generateRaw signature
                return await generateRaw({
                    prompt: prompt,
                    instructOverride: false,
                    quietToLoud: false,
                    prefill: prefill
                });
            }
        );

        if (!result || typeof result !== 'string') {
            error("AI merge returned invalid result");
            return null;
        }

        debug(`Successfully merged ${entryType} (${result.length} chars)`);
        return result.trim();

    } catch (err) {
        error("Error merging update with AI", err);
        return null;
    }
}

/**
 * Ensure tracking entry exists in lorebook
 * @param {string} lorebookName - Name of lorebook
 * @param {string} entryType - 'gm_notes' or 'character_stats'
 * @returns {Promise<Object|null>} Entry object or null
 */
async function ensureTrackingEntry(lorebookName /*: string */, entryType /*: string */) /*: Promise<any> */ {
    try {
        // $FlowFixMe[invalid-computed-prop] - Dynamic lookup of tracking entry config
        const config = TRACKING_ENTRY_CONFIG[entryType];
        if (!config) {
            error(`Unknown tracking entry type: ${entryType}`);
            return null;
        }

        // Check if lorebook exists - handle missing lorebook case
        if (!lorebookExists(lorebookName)) {
            error(`Lorebook "${lorebookName}" does not exist - attempting to recover`);

            // Try to handle the missing lorebook (will recreate if enabled)
            const newLorebookName = await handleMissingLorebook(lorebookName);
            if (!newLorebookName) {
                error("Could not recover from missing lorebook");
                return null;
            }

            // Use the new lorebook name
            lorebookName = newLorebookName;
            debug(`Using recovered lorebook: ${newLorebookName}`);
        }

        // Get all entries
        const entries = await getLorebookEntries(lorebookName);
        if (!entries) {
            error("Failed to get lorebook entries");
            return null;
        }

        // Find existing entry
        const existing = entries.find(e => e.comment === config.entryName);
        if (existing) {
            debug(`Found existing ${entryType} entry: UID ${existing.uid}`);
            return existing;
        }

        // Create new entry
        debug(`Creating new ${entryType} entry`);
        const newEntry = await addLorebookEntry(lorebookName, {
            comment: config.entryName,
            content: config.defaultContent,
            keys: config.keys,
            constant: true,
            order: config.order,
            depth: 0,
            position: 6, // Depth-based positioning (after character card)
            excludeRecursion: true,
            preventRecursion: true,
            disable: false
        });

        if (newEntry) {
            log(`Created ${config.displayName} tracking entry`);
            toast(`Created ${config.displayName} entry`, 'success');
        }

        return newEntry;

    } catch (err) {
        error("Error ensuring tracking entry", err);
        return null;
    }
}

/**
 * Update tracking entry with new content
 * @param {string} lorebookName - Name of lorebook
 * @param {string} entryType - 'gm_notes' or 'character_stats'
 * @param {string} newContent - New content to set
 * @returns {Promise<boolean>} Success
 */
async function updateTrackingEntry(lorebookName /*: string */, entryType /*: string */, newContent /*: string */) /*: Promise<boolean> */ {
    try {
        // Ensure entry exists
        const entry = await ensureTrackingEntry(lorebookName, entryType);
        if (!entry) {
            error("Failed to ensure tracking entry exists");
            return false;
        }

        // Update content
        const success = await modifyLorebookEntry(lorebookName, entry.uid, {
            content: newContent
        });

        if (success) {
            debug(`Updated ${entryType} entry`);
        }

        return success;

    } catch (err) {
        error("Error updating tracking entry", err);
        return false;
    }
}

/**
 * Process tracking updates from a message
 * @param {Object} message - SillyTavern message object
 * @returns {Promise<boolean>} Success
 */
export async function processTrackingUpdates(message /*: any */) /*: Promise<boolean> */ {
    try {
        // Check if tracking is enabled
        if (!getTrackingSetting('enabled', true)) {
            debug("Tracking is disabled");
            return false;
        }

        // Get message text
        const messageText = message?.mes;
        if (!messageText) {
            return false;
        }

        // Parse for updates
        const updates = parseMessageForUpdates(messageText);
        const hasUpdates = updates.gm_notes.length > 0 || updates.character_stats.length > 0;

        if (!hasUpdates) {
            return false;
        }

        log(`Processing tracking updates: ${updates.gm_notes.length} gm_notes, ${updates.character_stats.length} character_stats`);

        // Get attached lorebook
        const lorebookName = getAttachedLorebook();
        if (!lorebookName) {
            error("No lorebook attached, cannot process tracking updates");
            toast("No lorebook attached for tracking updates", "warning");
            return false;
        }

        // Process GM notes updates
        for (const update of updates.gm_notes) {
            // Sequential execution required: tracking entry updates must process in order
            // eslint-disable-next-line no-await-in-loop
            const queued = queueMergeGMNotes ? await queueMergeGMNotes(lorebookName, update.content) : null;
            if (!queued) {
                // Sequential execution required: fallback to direct execution
                // eslint-disable-next-line no-await-in-loop
                await processEntryUpdate(lorebookName, 'gm_notes', update.content);
            }
        }

        // Process character stats updates
        for (const update of updates.character_stats) {
            // Sequential execution required: tracking entry updates must process in order
            // eslint-disable-next-line no-await-in-loop
            const queued = queueMergeCharacterStats ? await queueMergeCharacterStats(lorebookName, update.content) : null;
            if (!queued) {
                // Sequential execution required: fallback to direct execution
                // eslint-disable-next-line no-await-in-loop
                await processEntryUpdate(lorebookName, 'character_stats', update.content);
            }
        }

        // Remove syntax from message if configured
        if (getTrackingSetting('remove_from_message', true)) {
            const cleaned = removeTrackingSyntax(messageText, updates);
            if (cleaned !== messageText) {
                message.mes = cleaned;
                debug("Removed tracking syntax from message");
            }
        }

        return true;

    } catch (err) {
        error("Error processing tracking updates", err);
        return false;
    }
}

/**
 * Process a single entry update
 * @param {string} lorebookName - Lorebook name
 * @param {string} entryType - Entry type
 * @param {string} updateContent - Update content
 * @returns {Promise<boolean>} Success
 */
export async function processEntryUpdate(lorebookName /*: string */, entryType /*: string */, updateContent /*: string */) /*: Promise<boolean> */ {
    try {
        // Get current entry
        const entry = await ensureTrackingEntry(lorebookName, entryType);
        if (!entry) {
            return false;
        }

        // Merge with AI
        const mergedContent = await mergeUpdateWithAI(
            entryType,
            entry.content,
            updateContent
        );

        if (!mergedContent) {
            error("Failed to merge update");
            return false;
        }

        // Update entry
        const success = await updateTrackingEntry(lorebookName, entryType, mergedContent);

        if (success) {
            // $FlowFixMe[invalid-computed-prop] - Dynamic lookup of tracking entry config
            const displayName = TRACKING_ENTRY_CONFIG[entryType].displayName;
            log(`Updated ${displayName}`);
            toast(`Updated ${displayName}`, 'success');
        }

        return success;

    } catch (err) {
        error("Error processing entry update", err);
        return false;
    }
}

/**
 * Initialize tracking entries for current chat
 * @returns {Promise<void>}
 */
export async function initializeChatTrackingEntries() /*: Promise<void> */ {
    try {
        if (!getTrackingSetting('enabled', true)) {
            return;
        }

        if (!getTrackingSetting('auto_create', true)) {
            return;
        }

        let lorebookName = getAttachedLorebook();
        if (!lorebookName) {
            debug("No lorebook attached, skipping tracking entry initialization");
            return;
        }

        // Check if the attached lorebook actually exists
        if (!lorebookExists(lorebookName)) {
            error(`Attached lorebook "${lorebookName}" does not exist - attempting to recover`);

            // Try to handle the missing lorebook (will recreate if enabled)
            const newLorebookName = await handleMissingLorebook(lorebookName);
            if (!newLorebookName) {
                error("Could not recover from missing lorebook, skipping tracking entry initialization");
                return;
            }

            lorebookName = newLorebookName;
            debug(`Using recovered lorebook: ${newLorebookName}`);
        }

        debug("Initializing tracking entries");

        // Ensure both tracking entries exist
        await ensureTrackingEntry(lorebookName, 'gm_notes');
        await ensureTrackingEntry(lorebookName, 'character_stats');

        debug("Tracking entries initialized");

    } catch (err) {
        error("Error initializing chat tracking entries", err);
    }
}

export default {
    initTrackingEntries,
    initializeTrackingSettings,
    parseMessageForUpdates,
    removeTrackingSyntax,
    processTrackingUpdates,
    initializeChatTrackingEntries,
    processEntryUpdate,  // Export for operation handlers
    TRACKING_ENTRY_CONFIG,
    DEFAULT_MERGE_PROMPTS
};

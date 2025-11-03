// @flow
// lorebookEntryMerger.js - AI-powered merging of new lorebook content with existing entries

// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { extension_settings } from '../../../extensions.js';
// Use wrapped version from our interceptor
import { wrappedGenerateRaw as generateRaw } from './generateRawInterceptor.js';

// Will be imported from index.js via barrel exports
let log /*: any */, debug /*: any */, error /*: any */;  // Logging functions - any type is legitimate
let modifyLorebookEntry /*: any */, getLorebookEntries /*: any */, reorderLorebookEntriesAlphabetically /*: any */;  // Lorebook functions - any type is legitimate
let get_settings /*: any */;  // Settings function - any type is legitimate
let enqueueOperation /*: any */, OperationType /*: any */;  // Queue functions - any type is legitimate

/**
 * Initialize the lorebook entry merger module
 */
// $FlowFixMe[signature-verification-failure]
export function initLorebookEntryMerger(utils /*: any */, lorebookManagerModule /*: any */, settingsManagerModule /*: any */, queueModule /*: any */) /*: void */ {
    // All parameters are any type - passed as objects with various properties - legitimate use of any
    log = utils.log;
    debug = utils.debug;
    error = utils.error;

    // Import lorebook manager functions
    if (lorebookManagerModule) {
        modifyLorebookEntry = lorebookManagerModule.modifyLorebookEntry;
        getLorebookEntries = lorebookManagerModule.getLorebookEntries;
        reorderLorebookEntriesAlphabetically = lorebookManagerModule.reorderLorebookEntriesAlphabetically;
    }

    // Import settings manager
    if (settingsManagerModule) {
        get_settings = settingsManagerModule.get_settings;
    }

    // Import queue functions
    if (queueModule) {
        enqueueOperation = queueModule.enqueueOperation;
        OperationType = queueModule.OperationType;
    }
}

/**
 * Get default merge prompt
 * @returns {string} Default prompt
 */
function getDefaultMergePrompt() /*: string */ {
    return `You are updating a lorebook entry. You have the existing entry content and new information from a summary.

Your task:
1. Compare the existing content with the new information
2. Merge them intelligently:
   - Add new details that don't exist
   - Update information that has changed
   - Remove details that are contradicted or no longer relevant
   - Preserve important existing information
   - Maintain consistent formatting and tone

Existing Entry Content:
{{existing_content}}

New Information from Summary:
{{new_content}}

Output ONLY the merged content, nothing else. Do not include explanations or meta-commentary.`;
}

/**
 * Get summary processing setting with fallback to default
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value
 * @returns {*} Setting value
 */
function getSummaryProcessingSetting(key /*: string */, defaultValue /*: any */ = null) /*: any */ {
    // defaultValue and return value are any type - can be various types - legitimate use of any
    try {
        // ALL summary processing settings are per-profile
        const settingKey = `auto_lorebooks_summary_${key}`;
        return get_settings(settingKey) ?? defaultValue;
    } catch (err) {
        error("Error getting summary processing setting", err);
        return defaultValue;
    }
}

/**
 * Create merge prompt by substituting variables
 * @param {string} existingContent - Current entry content
 * @param {string} newContent - New content from summary
 * @param {string} entryName - Current entry name/comment
 * @returns {string} Formatted prompt
 */
function createMergePrompt(existingContent /*: string */, newContent /*: string */, entryName /*: string */ = '') /*: string */ {
    const template = getSummaryProcessingSetting('merge_prompt') || getDefaultMergePrompt();
    const prefill = getSummaryProcessingSetting('merge_prefill') || '';

    // DEBUG: Log what template we got
    debug('Merge prompt template first 300 chars:', template.substring(0, 300));
    debug('Entry name being passed:', entryName);

    let prompt = template
        .replace(/\{\{existing_content\}\}/g, existingContent || '')
        .replace(/\{\{current_content\}\}/g, existingContent || '') // Alternate name
        .replace(/\{\{new_content\}\}/g, newContent || '')
        .replace(/\{\{new_update\}\}/g, newContent || '') // Alternate name
        .replace(/\{\{entry_name\}\}/g, entryName || ''); // Entry name for name resolution

    // Add prefill if configured
    if (prefill) {
        prompt = `${prompt}\n${prefill}`;
    }

    return prompt;
}

/**
 * Call AI to merge entry content
 * @param {string} existingContent - Current entry content
 * @param {string} newContent - New content from summary
 * @param {string} entryName - Current entry name/comment
 * @returns {Promise<Object>} Object with mergedContent and optional canonicalName
 */
async function callAIForMerge(existingContent /*: string */, newContent /*: string */, entryName /*: string */ = '') /*: Promise<any> */ {
    try {
        const prompt = createMergePrompt(existingContent, newContent, entryName);

        debug('Calling AI for entry merge...');
        debug('Prompt:', prompt.substring(0, 200) + '...');

        // Metadata injection now handled by global generateRaw interceptor
        // Call the AI with new object-based signature
        // $FlowFixMe[incompatible-call] - generateRaw signature
        const response = await generateRaw({
            prompt: prompt,
            instructOverride: false,
            quietToLoud: false
        });

        if (!response || response.trim().length === 0) {
            throw new Error('AI returned empty response');
        }

        const trimmedResponse = response.trim();

        // Try to parse as JSON first (FORMAT 2 - with name resolution)
        // The AI might add explanatory text before the JSON, so extract JSON if present
        try {
            // Try parsing the whole response first
            const parsed = JSON.parse(trimmedResponse);
            if (parsed.mergedContent) {
                debug('AI merge completed with name resolution');
                return {
                    mergedContent: parsed.mergedContent,
                    canonicalName: parsed.canonicalName || null
                };
            }
        } catch (jsonErr) {
            // If direct parsing failed, try to extract JSON from the response
            const jsonMatch = trimmedResponse.match(/\{[\s\S]*"mergedContent"[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.mergedContent) {
                        debug('AI merge completed with name resolution (extracted JSON)');
                        return {
                            mergedContent: parsed.mergedContent,
                            canonicalName: parsed.canonicalName || null
                        };
                    }
                } catch (extractErr) {
                    // Extraction failed, treat as plain text
                    debug('AI merge completed (plain text format - JSON extraction failed)');
                }
            } else {
                // Not JSON or malformed - treat as plain text (FORMAT 1 - backward compatible)
                debug('AI merge completed (plain text format)');
            }
        }

        // FORMAT 1: Plain text response (backward compatible)
        return {
            mergedContent: trimmedResponse,
            canonicalName: null
        };

    } catch (err) {
        error('Failed to call AI for merge', err);
        throw err;
    }
}

/**
 * Merge new content into an existing lorebook entry using AI
 * @param {string} lorebookName - Name of the lorebook
 * @param {Object} existingEntry - Existing entry object
 * @param {Object} newEntryData - New entry data from summary
 * @param {Object} options - Merge options
 * @returns {Promise<Object>} Merge result
 */
// $FlowFixMe[signature-verification-failure]
export async function mergeLorebookEntry(lorebookName /*: string */, existingEntry /*: any */, newEntryData /*: any */, options /*: any */ = {}) /*: Promise<any> */ {
    // existingEntry, newEntryData, options, and return type are any - complex objects with various properties - legitimate use of any
    try {
        const { useQueue = true } = options;

        // Check if queue is enabled and should be used
        const queueEnabled = get_settings?.('queue')?.enabled !== false;
        if (useQueue && queueEnabled && enqueueOperation) {
            // Queue the merge operation
            debug(`Queueing merge operation for entry: ${existingEntry.comment}`);

            const operationId = await enqueueOperation(
                OperationType.MERGE_LOREBOOK_ENTRY,
                {
                    lorebookName,
                    entryUid: existingEntry.uid,
                    existingContent: existingEntry.content,
                    newContent: newEntryData.content,
                    newKeys: newEntryData.keys,
                    newSecondaryKeys: newEntryData.secondaryKeys
                },
                {
                    priority: 10,  // Medium-high priority - lorebook processing pipeline
                    metadata: {
                        entry_comment: existingEntry.comment
                    }
                }
            );

            return {
                success: true,
                queued: true,
                operationId,
                message: 'Merge queued for processing'
            };
        }

        // Execute merge immediately
        return await executeMerge(lorebookName, existingEntry, newEntryData);

    } catch (err) {
        error('Error in mergeLorebookEntry', err);
        return {
            success: false,
            message: err.message
        };
    }
}

/**
 * Execute the merge operation (called directly or by queue handler)
 * @param {string} lorebookName - Name of the lorebook
 * @param {Object} existingEntry - Existing entry object
 * @param {Object} newEntryData - New entry data
 * @returns {Promise<Object>} Merge result
 */
// $FlowFixMe[signature-verification-failure]
export async function executeMerge(lorebookName /*: string */, existingEntry /*: any */, newEntryData /*: any */) /*: Promise<any> */ {
    // existingEntry, newEntryData, and return type are any - complex objects with various properties - legitimate use of any
    try {
        debug(`Executing merge for entry: ${existingEntry.comment}`);

        // Call AI to merge content (now returns object with mergedContent and optional canonicalName)
        const mergeResult = await callAIForMerge(
            existingEntry.content || '',
            newEntryData.content || '',
            existingEntry.comment || ''
        );

        // Prepare updates
        const updates /*: any */ = {
            content: mergeResult.mergedContent
        };

        // Handle name resolution if AI suggested a canonical name
        let finalCanonicalName = null;
        if (mergeResult.canonicalName && mergeResult.canonicalName.trim()) {
            finalCanonicalName = mergeResult.canonicalName.trim();
            const currentComment = existingEntry.comment || '';

            // Extract the type prefix (e.g., "character-" from "character-amelia's sister")
            const typeMatch = currentComment.match(/^([^-]+)-/);
            const typePrefix = typeMatch ? typeMatch[1] + '-' : '';

            // Build new comment with canonical name
            const newComment = typePrefix + finalCanonicalName;

            // Only update if the name actually changed
            if (newComment !== currentComment) {
                updates.comment = newComment;

                // Extract old stub name (without type prefix) to add as keyword
                const oldStubName = currentComment.replace(/^[^-]+-/, '').toLowerCase();

                debug(`Name resolution: "${currentComment}" -> "${newComment}"`);
                debug(`Adding old stub "${oldStubName}" to keywords`);

                // Add old stub name to keys if not already present
                const existingKeys = existingEntry.key || [];
                if (oldStubName && !existingKeys.includes(oldStubName)) {
                    // We'll add it when merging keys below
                    newEntryData.keys = [...(newEntryData.keys || []), oldStubName];
                }
            }
        }

        // Merge keys if new ones provided
        if (newEntryData.keys && newEntryData.keys.length > 0) {
            const existingKeys = existingEntry.key || [];
            const newKeys = newEntryData.keys.filter(k => k && k.trim());
            // Combine and deduplicate
            const mergedKeys = [...new Set([...existingKeys, ...newKeys])];
            if (mergedKeys.length > existingKeys.length) {
                updates.keys = mergedKeys;
                debug(`Merged keys: ${existingKeys.length} existing + ${newKeys.length} new = ${mergedKeys.length} total`);
            }
        }

        // Merge secondary keys if new ones provided
        if (newEntryData.secondaryKeys && newEntryData.secondaryKeys.length > 0) {
            const existingSecondary = existingEntry.keysecondary || [];
            const newSecondary = newEntryData.secondaryKeys.filter(k => k && k.trim());
            const mergedSecondary = [...new Set([...existingSecondary, ...newSecondary])];
            if (mergedSecondary.length > existingSecondary.length) {
                updates.secondaryKeys = mergedSecondary;
            }
        }

        // Apply the updates
        const success = await modifyLorebookEntry(lorebookName, existingEntry.uid, updates);

        if (!success) {
            throw new Error('Failed to modify lorebook entry');
        }

        log(`Successfully merged entry: ${existingEntry.comment}`);

        // If entry was renamed, trigger alphabetical reordering
        if (finalCanonicalName && reorderLorebookEntriesAlphabetically) {
            debug(`Entry was renamed, triggering alphabetical reordering for lorebook: ${lorebookName}`);
            await reorderLorebookEntriesAlphabetically(lorebookName);
        }

        return {
            success: true,
            message: 'Entry merged successfully',
            mergedContent: mergeResult.mergedContent,
            canonicalName: finalCanonicalName
        };

    } catch (err) {
        error('Error executing merge', err);
        throw err;
    }
}

/**
 * Merge operation by UID (for queue handler)
 * @param {Object} params - Operation parameters
 * @returns {Promise<Object>} Result
 */
// $FlowFixMe[signature-verification-failure]
export async function mergeLorebookEntryByUid(params /*: any */) /*: Promise<any> */ {
    // params and return type are any - complex objects with various properties - legitimate use of any
    try {
        const { lorebookName, entryUid, existingContent, newContent, newKeys, newSecondaryKeys } = params;

        debug(`Merging entry UID ${entryUid} in lorebook ${lorebookName}`);

        // Get current entry data
        const entries = await getLorebookEntries(lorebookName);
        const entry = entries?.find(e => e.uid === entryUid);

        if (!entry) {
            throw new Error(`Entry UID ${entryUid} not found in lorebook`);
        }

        // Execute merge
        return await executeMerge(
            lorebookName,
            { ...entry, content: existingContent },
            { content: newContent, keys: newKeys, secondaryKeys: newSecondaryKeys }
        );

    } catch (err) {
        error('Error in mergeLorebookEntryByUid', err);
        throw err;
    }
}

export default {
    initLorebookEntryMerger,
    mergeLorebookEntry,
    executeMerge,
    mergeLorebookEntryByUid
};

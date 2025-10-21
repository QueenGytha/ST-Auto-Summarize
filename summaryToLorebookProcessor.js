// @flow
// summaryToLorebookProcessor.js - Extract lorebook entries from summary JSON objects and process them

// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { chat_metadata, saveMetadata, generateRaw } from '../../../../script.js';
// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { extension_settings } from '../../../extensions.js';

// Will be imported from index.js via barrel exports
let log /*: any */, debug /*: any */, error /*: any */, toast /*: any */, get_settings /*: any */;  // Utility functions - any type is legitimate
let getAttachedLorebook /*: any */, getLorebookEntries /*: any */, addLorebookEntry /*: any */;  // Lorebook functions - any type is legitimate
let mergeLorebookEntry /*: any */;  // Entry merger function - any type is legitimate

/**
 * Initialize the summary-to-lorebook processor module
 */
// $FlowFixMe[signature-verification-failure]
export function initSummaryToLorebookProcessor(utils /*: any */, lorebookManagerModule /*: any */, entryMergerModule /*: any */) /*: void */ {
    // All parameters are any type - objects with various properties - legitimate use of any
    log = utils.log;
    debug = utils.debug;
    error = utils.error;
    toast = utils.toast;
    get_settings = utils.get_settings;

    // Import lorebook manager functions
    if (lorebookManagerModule) {
        getAttachedLorebook = lorebookManagerModule.getAttachedLorebook;
        getLorebookEntries = lorebookManagerModule.getLorebookEntries;
        addLorebookEntry = lorebookManagerModule.addLorebookEntry;
    }

    // Import entry merger function
    if (entryMergerModule) {
        mergeLorebookEntry = entryMergerModule.mergeLorebookEntry;
    }
}

/**
 * Get processed summaries tracker from chat metadata
 * @returns {Set<string>} Set of processed summary IDs
 */
function getProcessedSummaries() /*: any */ {
    if (!chat_metadata.auto_lorebooks_processed_summaries) {
        chat_metadata.auto_lorebooks_processed_summaries = [];
    }
    return new Set(chat_metadata.auto_lorebooks_processed_summaries);
}

/**
 * Mark a summary as processed
 * @param {string} summaryId - Unique ID for the summary
 */
function markSummaryProcessed(summaryId /*: string */) /*: void */ {
    const processed = getProcessedSummaries();
    processed.add(summaryId);
    chat_metadata.auto_lorebooks_processed_summaries = Array.from(processed);
    saveMetadata();
    debug(`Marked summary as processed: ${summaryId}`);
}

/**
 * Check if a summary has been processed
 * @param {string} summaryId - Unique ID for the summary
 * @returns {boolean}
 */
function isSummaryProcessed(summaryId /*: string */) /*: boolean */ {
    return getProcessedSummaries().has(summaryId);
}

/**
 * Generate unique ID for a summary object
 * @param {Object} summary - Summary object
 * @returns {string} Unique ID
 */
function generateSummaryId(summary /*: any */) /*: string */ {
    // Use timestamp + content hash as ID
    const timestamp = summary.timestamp || Date.now();
    const content = JSON.stringify(summary.lorebook || summary);
    const hash = simpleHash(content);
    return `summary_${timestamp}_${hash}`;
}

/**
 * Simple hash function for content
 * @param {string} str - String to hash
 * @returns {string} Hash value
 */
function simpleHash(str /*: string */) /*: number */ {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Extract lorebook portion from a summary JSON object
 * @param {Object} summary - Summary object
 * @returns {Object|null} Lorebook data or null
 */
function extractLorebookData(summary /*: any */) /*: any */ {
    try {
        // Check if summary has a lorebooks array (plural - standard format)
        if (summary.lorebooks && Array.isArray(summary.lorebooks)) {
            debug('Found lorebooks array in summary');
            return { entries: summary.lorebooks };
        }

        // Check if summary has a lorebook property (singular - legacy format)
        if (summary.lorebook) {
            debug('Found lorebook property in summary');
            return summary.lorebook;
        }

        // Check if summary has entries array directly
        if (summary.entries && Array.isArray(summary.entries)) {
            debug('Found entries array in summary');
            return { entries: summary.entries };
        }

        // Check if the entire summary is lorebook data
        if (summary.comment || summary.content || summary.keys) {
            debug('Summary appears to be a single entry');
            return { entries: [summary] };
        }

        debug('No lorebook data found in summary');
        return null;

    } catch (err) {
        error('Error extracting lorebook data from summary', err);
        return null;
    }
}

/**
 * Find existing entry by comment/name
 * @param {Array} entries - Array of existing lorebook entries
 * @param {Object} newEntry - New entry to find
 * @returns {Object|null} Matching entry or null
 */
function findExistingEntry(entries /*: any */, newEntry /*: any */) /*: any */ {
    if (!entries || !newEntry) return null;

    const searchComment = (newEntry.comment || newEntry.name || '').toLowerCase().trim();
    if (!searchComment) return null;

    // Try to find by exact comment match
    let match = entries.find(e =>
        (e.comment || '').toLowerCase().trim() === searchComment
    );

    if (match) return match;

    // Try to find by primary key match
    if (newEntry.keys && Array.isArray(newEntry.keys) && newEntry.keys.length > 0) {
        const primaryKey = newEntry.keys[0].toLowerCase().trim();
        match = entries.find(e => {
            if (!e.key || !Array.isArray(e.key)) return false;
            return e.key.some(k => k.toLowerCase().trim() === primaryKey);
        });
    }

    return match || null;
}

/**
 * Normalize entry data structure
 * @param {Object} entry - Entry data
 * @returns {Object} Normalized entry
 */
function normalizeEntryData(entry /*: any */) /*: any */ {
    return {
        comment: entry.comment || entry.name || '',
        content: entry.content || entry.description || '',
        keys: entry.keys || entry.key || [],
        secondaryKeys: entry.secondaryKeys || entry.keysecondary || [],
        constant: entry.constant ?? false,
        disable: entry.disable ?? false,
        order: entry.order ?? 100,
        position: entry.position ?? 0,
        depth: entry.depth ?? 4
    };
}

/**
 * Generate keywords for a lorebook entry using AI
 * @param {string} entryName - Name/comment of the entry
 * @param {string} entryContent - Content of the entry
 * @returns {Promise<Array<string>>} Generated keywords or empty array
 */
async function generateKeywordsForEntry(entryName /*: string */, entryContent /*: string */) /*: Promise<Array<string>> */ {
    try {
        // Check if keyword generation is enabled
        const keywordGenEnabled = get_settings('auto_lorebooks_keyword_generation_enabled');
        if (!keywordGenEnabled) {
            debug('Keyword generation disabled, skipping');
            return [];
        }

        debug(`Generating keywords for entry: ${entryName}`);

        // Get prompt template
        const promptTemplate = get_settings('auto_lorebooks_keyword_generation_prompt') ||
            extension_settings?.autoLorebooks?.keyword_generation_prompt || '';

        if (!promptTemplate) {
            error('No keyword generation prompt configured');
            return [];
        }

        // Build prompt
        let prompt = promptTemplate
            .replace(/\{\{entry_name\}\}/g, entryName || '')
            .replace(/\{\{entry_content\}\}/g, entryContent || '');

        // Add prefill if configured
        const prefill = get_settings('auto_lorebooks_keyword_generation_prefill') || '';
        if (prefill) {
            prompt = `${prompt}\n${prefill}`;
        }

        // Get connection profile and preset from settings
        const connectionProfile = get_settings('auto_lorebooks_keyword_generation_connection_profile') || null;
        const preset = get_settings('auto_lorebooks_keyword_generation_completion_preset') || null;

        // Prepare generation options
        const options = {
            quiet_prompt: prompt,
            quiet: true,
            force_name2: true
        };

        if (connectionProfile) {
            options.connectionProfile = connectionProfile;
        }

        if (preset) {
            options.preset = preset;
        }

        // Call AI
        debug('Calling AI for keyword generation...');
        const response = await generateRaw(prompt, '', false, false, options);

        if (!response || response.trim().length === 0) {
            error('AI returned empty response for keyword generation');
            return [];
        }

        // Parse JSON response
        // Strip markdown code fences if present
        let jsonText = response.trim();
        const codeFenceMatch = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
        if (codeFenceMatch) {
            jsonText = codeFenceMatch[1].trim();
        }

        const keywords = JSON.parse(jsonText);

        if (!Array.isArray(keywords)) {
            error('AI response is not an array:', keywords);
            return [];
        }

        // Filter and clean keywords
        const cleanedKeywords = keywords
            .filter(k => k && typeof k === 'string')
            .map(k => k.trim())
            .filter(k => k.length > 0);

        debug(`Generated ${cleanedKeywords.length} keywords: ${cleanedKeywords.join(', ')}`);
        return cleanedKeywords;

    } catch (err) {
        error('Error generating keywords:', err);
        return [];
    }
}

/**
 * Process a single summary object - extracts lorebook entries and creates/merges them
 * @param {Object} summary - Summary object to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processSummaryToLorebook(summary /*: any */, options /*: any */ = {}) /*: Promise<any> */ {
    try {
        const {
            useQueue = true,
            skipDuplicates = true
        } = options;

        // Generate unique ID for this summary
        const summaryId = generateSummaryId(summary);

        // Check if already processed
        if (skipDuplicates && isSummaryProcessed(summaryId)) {
            debug(`Summary already processed: ${summaryId}`);
            return {
                success: true,
                skipped: true,
                message: 'Already processed'
            };
        }

        // Extract lorebook data
        const lorebookData = extractLorebookData(summary);
        if (!lorebookData || !lorebookData.entries) {
            debug('No lorebook entries found in summary');
            return {
                success: false,
                message: 'No lorebook data found'
            };
        }

        // Get attached lorebook
        const lorebookName = getAttachedLorebook();
        if (!lorebookName) {
            error('No lorebook attached to process summary');
            return {
                success: false,
                message: 'No lorebook attached'
            };
        }

        // Get existing entries
        const existingEntries = await getLorebookEntries(lorebookName);
        if (!existingEntries) {
            error('Failed to get existing entries');
            return {
                success: false,
                message: 'Failed to load lorebook'
            };
        }

        // Process each entry
        const results = {
            created: [],
            merged: [],
            failed: []
        };

        for (const newEntryData of lorebookData.entries) {
            const normalizedEntry = normalizeEntryData(newEntryData);

            // Check if entry exists
            const existingEntry = findExistingEntry(existingEntries, normalizedEntry);

            if (existingEntry) {
                // Entry exists - merge with AI
                debug(`Found existing entry: ${existingEntry.comment} (UID: ${existingEntry.uid})`);

                try {
                    const mergeResult = await mergeLorebookEntry(
                        lorebookName,
                        existingEntry,
                        normalizedEntry,
                        { useQueue }
                    );

                    if (mergeResult.success) {
                        results.merged.push({
                            comment: normalizedEntry.comment,
                            uid: existingEntry.uid
                        });
                    } else {
                        results.failed.push({
                            comment: normalizedEntry.comment,
                            error: mergeResult.message
                        });
                    }
                } catch (err) {
                    error(`Failed to merge entry: ${normalizedEntry.comment}`, err);
                    results.failed.push({
                        comment: normalizedEntry.comment,
                        error: err.message
                    });
                }

            } else {
                // Entry doesn't exist - create new
                debug(`Creating new entry: ${normalizedEntry.comment}`);

                try {
                    // Generate keywords if none provided
                    if (!normalizedEntry.keys || normalizedEntry.keys.length === 0) {
                        debug(`No keywords provided, generating keywords for: ${normalizedEntry.comment}`);
                        const generatedKeys = await generateKeywordsForEntry(
                            normalizedEntry.comment,
                            normalizedEntry.content
                        );

                        if (generatedKeys && generatedKeys.length > 0) {
                            normalizedEntry.keys = generatedKeys;
                            debug(`Generated ${generatedKeys.length} keywords: ${generatedKeys.join(', ')}`);
                        } else {
                            debug('No keywords generated, entry will have no activation keywords');
                        }
                    }

                    const createdEntry = await addLorebookEntry(lorebookName, normalizedEntry);

                    if (createdEntry) {
                        results.created.push({
                            comment: normalizedEntry.comment,
                            uid: createdEntry.uid
                        });
                    } else {
                        results.failed.push({
                            comment: normalizedEntry.comment,
                            error: 'Failed to create entry'
                        });
                    }
                } catch (err) {
                    error(`Failed to create entry: ${normalizedEntry.comment}`, err);
                    results.failed.push({
                        comment: normalizedEntry.comment,
                        error: err.message
                    });
                }
            }
        }

        // Mark summary as processed
        markSummaryProcessed(summaryId);

        // Generate result message
        const message = `Processed ${lorebookData.entries.length} entries: ${results.created.length} created, ${results.merged.length} merged, ${results.failed.length} failed`;
        log(message);

        if (results.created.length > 0 || results.merged.length > 0) {
            toast(message, 'success');
        } else if (results.failed.length > 0) {
            toast(`Failed to process ${results.failed.length} entries`, 'warning');
        }

        return {
            success: true,
            results,
            message
        };

    } catch (err) {
        error('Error processing summary to lorebook', err);
        return {
            success: false,
            message: err.message
        };
    }
}

/**
 * Process a single lorebook entry - creates or merges with existing entry
 * @param {Object} entryData - Single lorebook entry data
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processSingleLorebookEntry(entryData /*: any */, options /*: any */ = {}) /*: Promise<any> */ {
    try {
        const { useQueue = false } = options;

        if (!entryData) {
            return {
                success: false,
                message: 'No entry data provided'
            };
        }

        // Get attached lorebook
        const lorebookName = getAttachedLorebook();
        if (!lorebookName) {
            error('No lorebook attached to process entry');
            return {
                success: false,
                message: 'No lorebook attached'
            };
        }

        // Normalize the entry data
        const normalizedEntry = normalizeEntryData(entryData);
        debug(`Processing lorebook entry: ${normalizedEntry.comment}`);

        // Get existing entries
        const existingEntries = await getLorebookEntries(lorebookName);
        if (!existingEntries) {
            error('Failed to get existing entries');
            return {
                success: false,
                message: 'Failed to load lorebook'
            };
        }

        // Check if entry exists
        const existingEntry = findExistingEntry(existingEntries, normalizedEntry);

        if (existingEntry) {
            // Entry exists - merge with AI
            debug(`Found existing entry: ${existingEntry.comment} (UID: ${existingEntry.uid})`);

            const mergeResult = await mergeLorebookEntry(
                lorebookName,
                existingEntry,
                normalizedEntry,
                { useQueue }
            );

            if (mergeResult.success) {
                return {
                    success: true,
                    action: 'merged',
                    comment: normalizedEntry.comment,
                    uid: existingEntry.uid
                };
            } else {
                return {
                    success: false,
                    message: mergeResult.message,
                    comment: normalizedEntry.comment
                };
            }

        } else {
            // Entry doesn't exist - create new
            debug(`Creating new entry: ${normalizedEntry.comment}`);

            // Generate keywords if none provided
            if (!normalizedEntry.keys || normalizedEntry.keys.length === 0) {
                debug(`No keywords provided, generating keywords for: ${normalizedEntry.comment}`);
                const generatedKeys = await generateKeywordsForEntry(
                    normalizedEntry.comment,
                    normalizedEntry.content
                );

                if (generatedKeys && generatedKeys.length > 0) {
                    normalizedEntry.keys = generatedKeys;
                    debug(`Generated ${generatedKeys.length} keywords: ${generatedKeys.join(', ')}`);
                } else {
                    debug('No keywords generated, entry will have no activation keywords');
                }
            }

            const createdEntry = await addLorebookEntry(lorebookName, normalizedEntry);

            if (createdEntry) {
                return {
                    success: true,
                    action: 'created',
                    comment: normalizedEntry.comment,
                    uid: createdEntry.uid
                };
            } else {
                return {
                    success: false,
                    message: 'Failed to create entry',
                    comment: normalizedEntry.comment
                };
            }
        }

    } catch (err) {
        error('Error processing single lorebook entry', err);
        return {
            success: false,
            message: err.message,
            comment: entryData?.comment || entryData?.name || 'Unknown'
        };
    }
}

/**
 * Process multiple summaries - extracts lorebook entries from each and creates/merges them
 * @param {Array<Object>} summaries - Array of summary objects
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Combined results
 */
export async function processSummariesToLorebook(summaries /*: any */, options /*: any */ = {}) /*: Promise<any> */ {
    try {
        if (!Array.isArray(summaries) || summaries.length === 0) {
            return {
                success: false,
                message: 'No summaries provided'
            };
        }

        log(`Processing ${summaries.length} summaries to lorebook...`);

        const allResults = {
            processed: 0,
            skipped: 0,
            created: [],
            merged: [],
            failed: []
        };

        for (const summary of summaries) {
            const result = await processSummaryToLorebook(summary, options);

            if (result.skipped) {
                allResults.skipped++;
            } else if (result.success) {
                allResults.processed++;
                if (result.results) {
                    allResults.created.push(...result.results.created);
                    allResults.merged.push(...result.results.merged);
                    allResults.failed.push(...result.results.failed);
                }
            }
        }

        const message = `Processed ${allResults.processed} summaries (${allResults.skipped} skipped): ${allResults.created.length} created, ${allResults.merged.length} merged, ${allResults.failed.length} failed`;
        log(message);
        toast(message, 'info');

        return {
            success: true,
            results: allResults,
            message
        };

    } catch (err) {
        error('Error processing summaries to lorebook', err);
        return {
            success: false,
            message: err.message
        };
    }
}

/**
 * Clear processed summaries tracker
 */
export function clearProcessedSummaries() /*: void */ {
    chat_metadata.auto_lorebooks_processed_summaries = [];
    saveMetadata();
    log('Cleared processed summaries tracker');
    toast('Cleared processed summaries tracker', 'info');
}

export default {
    initSummaryToLorebookProcessor,
    processSummaryToLorebook,
    processSingleLorebookEntry,
    processSummariesToLorebook,
    clearProcessedSummaries,
    isSummaryProcessed
};

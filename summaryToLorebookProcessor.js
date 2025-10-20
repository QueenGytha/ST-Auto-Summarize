// summaryToLorebookProcessor.js - Extract lorebook entries from summary JSON objects and process them

import { chat_metadata, saveMetadata } from '../../../../script.js';

// Will be imported from index.js via barrel exports
let log, debug, error, toast;
let getAttachedLorebook, getLorebookEntries, addLorebookEntry;
let mergeLorebookEntry;

/**
 * Initialize the summary-to-lorebook processor module
 */
export function initSummaryToLorebookProcessor(utils, lorebookManagerModule, entryMergerModule) {
    log = utils.log;
    debug = utils.debug;
    error = utils.error;
    toast = utils.toast;

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
function getProcessedSummaries() {
    if (!chat_metadata.auto_lorebooks_processed_summaries) {
        chat_metadata.auto_lorebooks_processed_summaries = [];
    }
    return new Set(chat_metadata.auto_lorebooks_processed_summaries);
}

/**
 * Mark a summary as processed
 * @param {string} summaryId - Unique ID for the summary
 */
function markSummaryProcessed(summaryId) {
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
function isSummaryProcessed(summaryId) {
    return getProcessedSummaries().has(summaryId);
}

/**
 * Generate unique ID for a summary object
 * @param {Object} summary - Summary object
 * @returns {string} Unique ID
 */
function generateSummaryId(summary) {
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
function simpleHash(str) {
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
function extractLorebookData(summary) {
    try {
        // Check if summary has a lorebook property
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
function findExistingEntry(entries, newEntry) {
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
function normalizeEntryData(entry) {
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
 * Process a single summary object - extracts lorebook entries and creates/merges them
 * @param {Object} summary - Summary object to process
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
export async function processSummaryToLorebook(summary, options = {}) {
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
 * Process multiple summaries - extracts lorebook entries from each and creates/merges them
 * @param {Array<Object>} summaries - Array of summary objects
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Combined results
 */
export async function processSummariesToLorebook(summaries, options = {}) {
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
export function clearProcessedSummaries() {
    chat_metadata.auto_lorebooks_processed_summaries = [];
    saveMetadata();
    log('Cleared processed summaries tracker');
    toast('Cleared processed summaries tracker', 'info');
}

export default {
    initSummaryToLorebookProcessor,
    processSummaryToLorebook,
    processSummariesToLorebook,
    clearProcessedSummaries,
    isSummaryProcessed
};

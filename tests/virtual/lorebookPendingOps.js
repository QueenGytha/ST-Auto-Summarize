// @flow
// lorebookPendingOps.js - Manage pending lorebook operation state in chat metadata

// $FlowFixMe[cannot-resolve-module] - SillyTavern core modules
import { chat_metadata, saveMetadata } from './stubs/externals.js';

// Will be imported from index.js via barrel exports
let debug /*: any */, log /*: any */, error /*: any */;

/**
 * Initialize the pending operations manager
 */
// $FlowFixMe[signature-verification-failure]
export function initLorebookPendingOps(utils /*: any */) /*: void */ {
    debug = utils.debug;
    log = utils.log;
    error = utils.error;
}

/**
 * Ensure pending ops structure exists in metadata
 */
function ensurePendingOps() /*: any */ {
    if (!chat_metadata.autoLorebooks) {
        chat_metadata.autoLorebooks = { pendingOps: {} };
    }
    if (!chat_metadata.autoLorebooks.pendingOps) {
        chat_metadata.autoLorebooks.pendingOps = {};
    }
    return chat_metadata.autoLorebooks.pendingOps;
}

/**
 * Generate unique entry ID
 * @returns {string} Entry ID in format "entry_{timestamp}_{random}"
 */
export function generateEntryId() /*: string */ {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `entry_${timestamp}_${random}`;
}

/**
 * Get pending operation data for an entry
 * @param {string} entryId - Entry ID
 * @returns {Object|null} Pending data or null if not found
 */
export function getPendingEntry(entryId /*: string */) /*: any */ {
    const pending = ensurePendingOps();
    return pending[entryId] || null;
}

/**
 * Create new pending entry
 * @param {string} entryId - Entry ID
 * @param {Object} entryData - Initial entry data
 * @returns {Object} Created pending entry
 */
export function createPendingEntry(entryId /*: string */, entryData /*: any */) /*: any */ {
    const pending = ensurePendingOps();

    pending[entryId] = {
        stage: 'triage',
        timestamp: Date.now(),
        entryData: {
            comment: entryData.comment || '',
            content: entryData.content || '',
            keys: Array.isArray(entryData.keys) ? entryData.keys : [],
            secondaryKeys: Array.isArray(entryData.secondaryKeys) ? entryData.secondaryKeys : [],
            type: entryData.type || '',
            constant: Boolean(entryData.constant),
            disable: Boolean(entryData.disable)
        }
    };

    debug(`[PendingOps] Created pending entry: ${entryId}`);
    saveMetadata();

    return pending[entryId];
}

/**
 * Update pending entry with new data
 * @param {string} entryId - Entry ID
 * @param {Object} updates - Updates to apply
 */
export function updatePendingEntry(entryId /*: string */, updates /*: any */) /*: void */ {
    const pending = ensurePendingOps();
    const entry = pending[entryId];

    if (!entry) {
        error(`[PendingOps] Cannot update non-existent entry: ${entryId}`);
        return;
    }

    Object.assign(entry, updates);
    debug(`[PendingOps] Updated pending entry: ${entryId}`, updates);
    saveMetadata();
}

/**
 * Set triage result for entry
 * @param {string} entryId - Entry ID
 * @param {Object} triageResult - Triage result
 */
export function setTriageResult(entryId /*: string */, triageResult /*: any */) /*: void */ {
    updatePendingEntry(entryId, {
        stage: 'triage_complete',
        triageResult: {
            type: triageResult.type || '',
            synopsis: triageResult.synopsis || '',
            sameEntityIds: Array.isArray(triageResult.sameEntityIds) ? triageResult.sameEntityIds : [],
            needsFullContextIds: Array.isArray(triageResult.needsFullContextIds) ? triageResult.needsFullContextIds : []
        }
    });
}

/**
 * Set resolution result for entry
 * @param {string} entryId - Entry ID
 * @param {Object} resolutionResult - Resolution result
 */
export function setResolutionResult(entryId /*: string */, resolutionResult /*: any */) /*: void */ {
    updatePendingEntry(entryId, {
        stage: 'resolution_complete',
        resolutionResult: {
            resolvedId: resolutionResult.resolvedId || null,
            synopsis: resolutionResult.synopsis || ''
        }
    });
}

/**
 * Mark entry stage as in progress
 * @param {string} entryId - Entry ID
 * @param {string} stage - Stage name
 */
export function markStageInProgress(entryId /*: string */, stage /*: string */) /*: void */ {
    updatePendingEntry(entryId, { stage });
}

/**
 * Complete pending entry and remove from metadata
 * @param {string} entryId - Entry ID
 */
export function completePendingEntry(entryId /*: string */) /*: void */ {
    const pending = ensurePendingOps();

    if (pending[entryId]) {
        delete pending[entryId];
        debug(`[PendingOps] Completed and removed pending entry: ${entryId}`);
        saveMetadata();
    }
}

/**
 * Get all pending entries
 * @returns {Object} All pending entries
 */
export function getAllPendingEntries() /*: any */ {
    return ensurePendingOps();
}

/**
 * Clean up stale pending entries (older than maxAgeMs)
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @returns {number} Number of entries removed
 */
export function cleanupStalePendingEntries(maxAgeMs /*: number */ = 86400000) /*: number */ {
    const pending = ensurePendingOps();
    const now = Date.now();
    let removed = 0;

    Object.keys(pending).forEach(entryId => {
        const entry = pending[entryId];
        if (entry && entry.timestamp) {
            const age = now - entry.timestamp;
            if (age > maxAgeMs) {
                delete pending[entryId];
                removed++;
                debug(`[PendingOps] Removed stale entry: ${entryId} (age: ${Math.round(age / 1000)}s)`);
            }
        }
    });

    if (removed > 0) {
        log(`[PendingOps] Cleaned up ${removed} stale pending entries`);
        saveMetadata();
    }

    return removed;
}

/**
 * Get entry data from pending entry
 * @param {string} entryId - Entry ID
 * @returns {Object|null} Entry data or null
 */
export function getEntryData(entryId /*: string */) /*: any */ {
    const pending = getPendingEntry(entryId);
    return pending ? pending.entryData : null;
}

/**
 * Get triage result from pending entry
 * @param {string} entryId - Entry ID
 * @returns {Object|null} Triage result or null
 */
export function getTriageResult(entryId /*: string */) /*: any */ {
    const pending = getPendingEntry(entryId);
    return pending ? pending.triageResult : null;
}

/**
 * Get resolution result from pending entry
 * @param {string} entryId - Entry ID
 * @returns {Object|null} Resolution result or null
 */
export function getResolutionResult(entryId /*: string */) /*: any */ {
    const pending = getPendingEntry(entryId);
    return pending ? pending.resolutionResult : null;
}

export default {
    initLorebookPendingOps,
    generateEntryId,
    getPendingEntry,
    createPendingEntry,
    updatePendingEntry,
    setTriageResult,
    setResolutionResult,
    markStageInProgress,
    completePendingEntry,
    getAllPendingEntries,
    cleanupStalePendingEntries,
    getEntryData,
    getTriageResult,
    getResolutionResult
};

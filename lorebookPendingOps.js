
// lorebookPendingOps.js - Manage pending lorebook operation state in chat metadata

import { chat_metadata, saveMetadata } from '../../../../script.js';
import { debug, log, error } from './index.js';
import { ID_GENERATION_BASE, OPERATION_ID_LENGTH, ONE_SECOND_MS } from './constants.js';

function ensurePendingOps() {
  if (!chat_metadata.autoLorebooks) {
    chat_metadata.autoLorebooks = { pendingOps: {} };
  }
  if (!chat_metadata.autoLorebooks.pendingOps) {
    chat_metadata.autoLorebooks.pendingOps = {};
  }
  return chat_metadata.autoLorebooks.pendingOps;
}

export function generateEntryId() {
  const timestamp = Date.now();
  const random = Math.random().toString(ID_GENERATION_BASE).substring(2, OPERATION_ID_LENGTH);
  return `entry_${timestamp}_${random}`;
}

export function getPendingEntry(entryId ) {
  const pending = ensurePendingOps();
  return pending[entryId] || null;
}

export function createPendingEntry(entryId , entryData ) {
  const pending = ensurePendingOps();

  pending[entryId] = {
    stage: 'lorebook_entry_lookup',
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

export function updatePendingEntry(entryId , updates ) {
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

export function setLorebookEntryLookupResult(entryId , lorebookEntryLookupResult ) {
  updatePendingEntry(entryId, {
    stage: 'lorebook_entry_lookup_complete',
    lorebookEntryLookupResult: {
      type: lorebookEntryLookupResult.type || '',
      synopsis: lorebookEntryLookupResult.synopsis || '',
      sameEntityIds: Array.isArray(lorebookEntryLookupResult.sameEntityIds) ? lorebookEntryLookupResult.sameEntityIds : [],
      needsFullContextIds: Array.isArray(lorebookEntryLookupResult.needsFullContextIds) ? lorebookEntryLookupResult.needsFullContextIds : []
    }
  });
}

export function setLorebookEntryDeduplicateResult(entryId , lorebookEntryDeduplicateResult ) {
  updatePendingEntry(entryId, {
    stage: 'lorebook_entry_deduplicate_complete',
    lorebookEntryDeduplicateResult: {
      resolvedId: lorebookEntryDeduplicateResult.resolvedId || null,
      synopsis: lorebookEntryDeduplicateResult.synopsis || ''
    }
  });
}

export function markStageInProgress(entryId , stage ) {
  updatePendingEntry(entryId, { stage });
}

export function completePendingEntry(entryId ) {
  const pending = ensurePendingOps();

  if (pending[entryId]) {
    delete pending[entryId];
    debug(`[PendingOps] Completed and removed pending entry: ${entryId}`);
    saveMetadata();
  }
}

export function getAllPendingEntries() {
  return ensurePendingOps();
}

export function cleanupStalePendingEntries(maxAgeMs  = 86400000) {
  const pending = ensurePendingOps();
  const now = Date.now();
  let removed = 0;

  Object.keys(pending).forEach((entryId) => {
    const entry = pending[entryId];
    if (entry && entry.timestamp) {
      const age = now - entry.timestamp;
      if (age > maxAgeMs) {
        delete pending[entryId];
        removed++;
        debug(`[PendingOps] Removed stale entry: ${entryId} (age: ${Math.round(age / ONE_SECOND_MS)}s)`);
      }
    }
  });

  if (removed > 0) {
    log(`[PendingOps] Cleaned up ${removed} stale pending entries`);
    saveMetadata();
  }

  return removed;
}

export function getEntryData(entryId ) {
  const pending = getPendingEntry(entryId);
  return pending ? pending.entryData : null;
}

export function getLorebookEntryLookupResult(entryId ) {
  const pending = getPendingEntry(entryId);
  return pending ? pending.lorebookEntryLookupResult : null;
}

export function getLorebookEntryDeduplicateResult(entryId ) {
  const pending = getPendingEntry(entryId);
  return pending ? pending.lorebookEntryDeduplicateResult : null;
}

export default {
  generateEntryId,
  getPendingEntry,
  createPendingEntry,
  updatePendingEntry,
  setLorebookEntryLookupResult,
  setLorebookEntryDeduplicateResult,
  markStageInProgress,
  completePendingEntry,
  getAllPendingEntries,
  cleanupStalePendingEntries,
  getEntryData,
  getLorebookEntryLookupResult,
  getLorebookEntryDeduplicateResult
};
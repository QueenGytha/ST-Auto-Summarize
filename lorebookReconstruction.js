/**
 * Lorebook Reconstruction - Point-in-Time Snapshot
 *
 * Reconstructs a lorebook from scene break metadata, creating an exact
 * point-in-time snapshot of the lorebook state at a specific message.
 */

import { get_data } from './index.js';
import { debug, error, SUBSYSTEM } from './utils.js';
import { createNewWorldInfo } from '../../../world-info.js';
import { getSanitizedFilename } from '../../../../scripts/utils.js';
import { getRequestHeaders } from '../../../../script.js';

// Constants for lorebook entry defaults
const DEFAULT_DEPTH = 4;
const DEFAULT_ORDER = 100;
const DEFAULT_PROBABILITY = 100;

/**
 * Extract historical lorebook state from scene break metadata snapshot
 *
 * @param {number} messageIndex - Message index with scene break
 * @returns {Object} Historical state with entries and metadata
 */
export function extractHistoricalLorebookState(messageIndex) {
  const ctx = window.SillyTavern.getContext();
  const chat = ctx.chat;
  const message = chat[messageIndex];

  if (!message) {
    throw new Error(`Message not found at index ${messageIndex}`);
  }

  // Check for scene break
  const hasSceneBreak = get_data(message, 'scene_break');
  if (!hasSceneBreak) {
    throw new Error(`Message ${messageIndex} does not have a scene break`);
  }

  // Get scene recap metadata
  const metadata = get_data(message, 'scene_recap_metadata');
  if (!metadata || Object.keys(metadata).length === 0) {
    throw new Error(`Message ${messageIndex} has no scene recap metadata`);
  }

  // Get current version
  const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
  const versionMetadata = metadata[currentVersionIndex];

  if (!versionMetadata) {
    throw new Error(`No metadata found for version ${currentVersionIndex} at message ${messageIndex}`);
  }

  // Get ALL entries from snapshot (including disabled registries)
  const allEntries = versionMetadata.allEntries;
  if (!allEntries || !Array.isArray(allEntries) || allEntries.length === 0) {
    throw new Error(`Scene break at message ${messageIndex} has no allEntries in metadata snapshot`);
  }

  debug(SUBSYSTEM.LOREBOOK,
    `Loaded ${allEntries.length} entries from scene break snapshot at message ${messageIndex}`
  );

  // Sort by UID ascending (creation order)
  const sortedEntries = [...allEntries].sort((a, b) => a.uid - b.uid);

  // Check if UIDs are sequential starting from 0
  const firstUID = sortedEntries[0].uid;
  const hasGaps = sortedEntries.some((entry, index) => entry.uid !== (firstUID + index));

  if (firstUID !== 0) {
    debug(SUBSYSTEM.LOREBOOK,
      `Warning: Historical UIDs don't start at 0 (start at ${firstUID}). ` +
      `UIDs will be remapped starting from 0.`
    );
  }

  if (hasGaps) {
    debug(SUBSYSTEM.LOREBOOK,
      `Warning: UID sequence has gaps. UIDs will be remapped to sequential values.`
    );
  }

  debug(SUBSYSTEM.LOREBOOK,
    `Extracted ${sortedEntries.length} entries (including registries) from scene break snapshot`
  );

  return {
    entries: sortedEntries,
    sourceLorebookName: versionMetadata.chatLorebookName || 'Unknown',
    totalEntries: sortedEntries.length,
    sourceMessageIndex: messageIndex,
    hasUIDGaps: hasGaps || firstUID !== 0
  };
}

/**
 * Create a new lorebook with the given name
 *
 * @param {string} lorebookName - Name for the new lorebook
 * @returns {Promise<string>} The sanitized lorebook name (what it's actually saved as)
 */
export async function createLorebookForSnapshot(lorebookName) {
  debug(SUBSYSTEM.LOREBOOK, `Creating lorebook: ${lorebookName}`);

  // Get sanitized filename (SillyTavern removes special characters)
  const sanitizedName = await getSanitizedFilename(lorebookName);
  debug(SUBSYSTEM.LOREBOOK, `Sanitized lorebook name: ${sanitizedName}`);

  const created = await createNewWorldInfo(lorebookName);
  if (!created) {
    throw new Error(`Failed to create lorebook: ${lorebookName}`);
  }

  debug(SUBSYSTEM.LOREBOOK, `✓ Created lorebook: ${sanitizedName}`);
  return sanitizedName;
}

/**
 * Build lorebook entry object from historical data
 *
 * @param {number} nextUID - UID for the new entry
 * @param {Object} entryData - Entry data from scene break metadata
 * @returns {Object} Entry object ready for lorebook
 */
// eslint-disable-next-line complexity -- Entry object requires mapping many fields from source to maintain full fidelity
function buildLorebookEntryObject(nextUID, entryData) {
  return {
    uid: nextUID,
    comment: entryData.comment || '',
    key: Array.isArray(entryData.key) ? entryData.key : [],
    keysecondary: Array.isArray(entryData.keysecondary) ? entryData.keysecondary : [],
    content: entryData.content || '',
    constant: entryData.constant || false,
    vectorized: entryData.vectorized || false,
    selective: entryData.selective !== undefined ? entryData.selective : true,
    selectiveLogic: entryData.selectiveLogic ?? 0,
    position: entryData.position ?? 0,
    depth: entryData.depth ?? DEFAULT_DEPTH,
    order: entryData.order ?? DEFAULT_ORDER,
    role: entryData.role ?? 0,
    sticky: entryData.sticky ?? null,

    // SillyTavern required fields
    enabled: true,
    addMemo: false,
    excludeRecursion: entryData.excludeRecursion || false,
    preventRecursion: entryData.preventRecursion || false,
    ignoreBudget: entryData.ignoreBudget || false,
    disable: entryData.disable || false,
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false,
    delayUntilRecursion: 0,
    probability: entryData.probability ?? DEFAULT_PROBABILITY,
    useProbability: entryData.useProbability !== undefined ? entryData.useProbability : false,
    group: entryData.group || '',
    groupOverride: entryData.groupOverride || false,
    groupWeight: entryData.groupWeight ?? DEFAULT_PROBABILITY,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    cooldown: null,
    delay: null,
    displayIndex: nextUID,
    triggers: [],
    tags: entryData.tags || []
  };
}

/**
 * Create a single lorebook entry
 *
 * @param {string} lorebookName - Target lorebook name
 * @param {Object} entryData - Entry data from scene break metadata
 * @returns {Promise<Object>} The created entry
 */
async function createLorebookEntry(lorebookName, entryData) {
  // Load the lorebook
  const response = await fetch('/api/worldinfo/get', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ name: lorebookName }),
    cache: 'no-cache'
  });

  if (!response.ok) {
    throw new Error(`Failed to load lorebook: ${lorebookName}`);
  }

  const lorebook = await response.json();

  // Determine next UID (sequential)
  const existingUIDs = Object.keys(lorebook.entries || {}).map(Number);
  const nextUID = existingUIDs.length > 0 ? Math.max(...existingUIDs) + 1 : 0;

  // Build entry object
  const newEntry = buildLorebookEntryObject(nextUID, entryData);

  // Add entry to lorebook
  if (!lorebook.entries) {
    lorebook.entries = {};
  }
  lorebook.entries[nextUID] = newEntry;

  // Save lorebook back
  const saveResponse = await fetch('/api/worldinfo/edit', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ name: lorebookName, data: lorebook }),
    cache: 'no-cache'
  });

  if (!saveResponse.ok) {
    throw new Error(`Failed to save entry to lorebook: ${lorebookName}`);
  }

  return newEntry;
}

/**
 * Reconstruct all entries in UID order
 *
 * @param {string} lorebookName - Target lorebook name
 * @param {Object} historicalState - Historical state from extractHistoricalLorebookState
 * @returns {Promise<void>}
 */
export async function reconstructLorebookEntries(lorebookName, historicalState) {
  const { entries, hasUIDGaps } = historicalState;

  debug(SUBSYSTEM.LOREBOOK,
    `Reconstructing ${entries.length} entries in UID order (will be assigned UIDs 0-${entries.length - 1})`
  );

  if (hasUIDGaps) {
    debug(SUBSYSTEM.LOREBOOK,
      `Note: Original UIDs will be remapped to sequential values 0-${entries.length - 1}`
    );
  }

  for (let i = 0; i < entries.length; i++) {
    const historicalEntry = entries[i];

    try {
      // eslint-disable-next-line no-await-in-loop -- Sequential execution required: UIDs must be assigned in order
      const newEntry = await createLorebookEntry(lorebookName, historicalEntry);

      debug(SUBSYSTEM.LOREBOOK,
        `Created entry ${i}: "${historicalEntry.comment}" ` +
        `(original uid=${historicalEntry.uid}, new uid=${newEntry.uid})`
      );

    } catch (err) {
      error(SUBSYSTEM.LOREBOOK,
        `Failed to create entry ${i} "${historicalEntry.comment}":`,
        err
      );
      throw new Error(`Failed to create entry "${historicalEntry.comment}": ${err.message}`);
    }
  }

  debug(SUBSYSTEM.LOREBOOK,
    `✓ Successfully reconstructed ${entries.length} entries with UIDs 0-${entries.length - 1}`
  );
}

/**
 * Create operation queue entry for the new lorebook
 *
 * @param {string} lorebookName - Target lorebook name
 * @returns {Promise<void>}
 */
async function createOperationQueueEntry(lorebookName) {
  debug(SUBSYSTEM.LOREBOOK, `Creating operation queue entry for ${lorebookName}`);

  // Load the lorebook
  const response = await fetch('/api/worldinfo/get', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ name: lorebookName }),
    cache: 'no-cache'
  });

  if (!response.ok) {
    throw new Error(`Failed to load lorebook: ${lorebookName}`);
  }

  const lorebook = await response.json();

  // Create empty queue structure
  const emptyQueue = {
    queue: [],
    current_operation_id: null,
    paused: false,
    version: 1
  };

  // Generate timestamp UID for operation queue
  const timestampUID = Date.now();

  // Create operation queue entry
  const queueEntry = {
    uid: timestampUID,
    key: [],
    keysecondary: [],
    content: JSON.stringify(emptyQueue, null, 2),
    comment: '__operation_queue',
    constant: false,
    disable: true, // Never inject into context
    excludeRecursion: true, // Never trigger other entries
    order: 9999, // Low priority
    position: 0,
    depth: 4,
    selectiveLogic: 0,
    addMemo: false,
    displayIndex: timestampUID,
    probability: 100,
    useProbability: true,

    // SillyTavern required fields
    enabled: false,
    vectorized: false,
    selective: true,
    role: 0,
    sticky: null,
    preventRecursion: false,
    ignoreBudget: false,
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false,
    delayUntilRecursion: 0,
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    cooldown: null,
    delay: null,
    triggers: [],
    tags: [],
    group: ''
  };

  if (!lorebook.entries) {
    lorebook.entries = {};
  }
  lorebook.entries[timestampUID] = queueEntry;

  // Save lorebook back
  const saveResponse = await fetch('/api/worldinfo/edit', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ name: lorebookName, data: lorebook }),
    cache: 'no-cache'
  });

  if (!saveResponse.ok) {
    throw new Error(`Failed to save operation queue entry to lorebook: ${lorebookName}`);
  }

  debug(SUBSYSTEM.LOREBOOK, `✓ Created operation queue entry with UID: ${timestampUID}`);
}

/**
 * Main function: Reconstruct point-in-time lorebook from scene break
 *
 * @param {number} messageIndex - Message index with scene break
 * @param {string} targetLorebookName - Name for the new lorebook
 * @returns {Promise<Object>} Reconstruction result with metadata
 */
export async function reconstructPointInTimeLorebook(messageIndex, targetLorebookName) {
  try {
    debug(SUBSYSTEM.LOREBOOK,
      `Starting point-in-time lorebook reconstruction for message ${messageIndex}`
    );
    debug(SUBSYSTEM.LOREBOOK,
      `Target lorebook: ${targetLorebookName}`
    );

    // Step 1: Extract historical state from scene break metadata snapshot
    const historicalState = extractHistoricalLorebookState(messageIndex);

    // Step 2: Create new lorebook (returns sanitized name)
    const sanitizedLorebookName = await createLorebookForSnapshot(targetLorebookName);

    // Step 3: Reconstruct all entries in UID order (registries + content)
    await reconstructLorebookEntries(sanitizedLorebookName, historicalState);

    // Step 4: Create operation queue entry with timestamp UID
    await createOperationQueueEntry(sanitizedLorebookName);

    // Return result with sanitized name
    const result = {
      lorebookName: sanitizedLorebookName,
      entriesReconstructed: historicalState.totalEntries,
      sourceMessageIndex: messageIndex,
      sourceLorebookName: historicalState.sourceLorebookName,
      hadUIDGaps: historicalState.hasUIDGaps
    };

    debug(SUBSYSTEM.LOREBOOK,
      `✓ Point-in-time lorebook reconstruction complete: ${sanitizedLorebookName} ` +
      `(${result.entriesReconstructed} entries + operation queue from message ${messageIndex})`
    );

    return result;

  } catch (err) {
    error(SUBSYSTEM.LOREBOOK,
      `Point-in-time lorebook reconstruction failed for message ${messageIndex}:`,
      err
    );
    throw err;
  }
}

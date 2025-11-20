/**
 * Lorebook Reconstruction - Point-in-Time Snapshot
 *
 * Reconstructs a lorebook from scene break metadata, creating an exact
 * point-in-time snapshot of the lorebook state at a specific message.
 */

import { get_data } from './index.js';
import { debug, error, SUBSYSTEM } from './utils.js';
import { createNewWorldInfo } from '../../../world-info.js';

// Constants for lorebook entry defaults
const DEFAULT_DEPTH = 4;
const DEFAULT_ORDER = 100;

/**
 * Extract historical lorebook state from scene break metadata
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
  if (!metadata || metadata.length === 0) {
    throw new Error(`Message ${messageIndex} has no scene recap metadata`);
  }

  // Get current version
  const currentVersionIndex = get_data(message, 'scene_recap_current_index') ?? 0;
  const versionMetadata = metadata[currentVersionIndex];

  if (!versionMetadata?.entries || versionMetadata.entries.length === 0) {
    throw new Error(`Scene break at message ${messageIndex} has no lorebook entries in metadata`);
  }

  // Filter out operation queue entry (must be excluded)
  const contentEntries = versionMetadata.entries.filter(
    entry => entry.comment !== '__operation_queue'
  );

  if (contentEntries.length === 0) {
    throw new Error(`Scene break has no content entries (only operation queue)`);
  }

  // Sort by UID ascending (creation order)
  const sortedEntries = [...contentEntries].sort((a, b) => a.uid - b.uid);

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
    `Extracted ${sortedEntries.length} entries from scene break at message ${messageIndex}`
  );

  return {
    entries: sortedEntries,
    chatLorebookName: versionMetadata.metadata?.chatLorebookName,
    totalEntries: sortedEntries.length,
    sourceMessageIndex: messageIndex,
    hasUIDGaps: hasGaps || firstUID !== 0
  };
}

/**
 * Create a new lorebook with the given name
 *
 * @param {string} lorebookName - Name for the new lorebook
 * @returns {Promise<string>} The lorebook name
 */
export async function createLorebookForSnapshot(lorebookName) {
  debug(SUBSYSTEM.LOREBOOK, `Creating lorebook: ${lorebookName}`);

  const created = await createNewWorldInfo(lorebookName);
  if (!created) {
    throw new Error(`Failed to create lorebook: ${lorebookName}`);
  }

  debug(SUBSYSTEM.LOREBOOK, `✓ Created lorebook: ${lorebookName}`);
  return lorebookName;
}

/**
 * Build lorebook entry object from historical data
 *
 * @param {number} nextUID - UID for the new entry
 * @param {Object} entryData - Entry data from scene break metadata
 * @returns {Object} Entry object ready for lorebook
 */
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
    probability: 100,
    useProbability: false,
    group: '',
    groupOverride: false,
    groupWeight: 100,
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: lorebookName })
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: lorebookName, data: lorebook })
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

    // Step 1: Extract historical state from scene break metadata
    const historicalState = extractHistoricalLorebookState(messageIndex);

    // Step 2: Create new lorebook
    await createLorebookForSnapshot(targetLorebookName);

    // Step 3: Reconstruct all entries in UID order
    await reconstructLorebookEntries(targetLorebookName, historicalState);

    // Return result
    const result = {
      lorebookName: targetLorebookName,
      entriesReconstructed: historicalState.totalEntries,
      sourceMessageIndex: messageIndex,
      sourceLorebookName: historicalState.chatLorebookName,
      hadUIDGaps: historicalState.hasUIDGaps
    };

    debug(SUBSYSTEM.LOREBOOK,
      `✓ Point-in-time lorebook reconstruction complete: ${targetLorebookName} ` +
      `(${result.entriesReconstructed} entries from message ${messageIndex})`
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

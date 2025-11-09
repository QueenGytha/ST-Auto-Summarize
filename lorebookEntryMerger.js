
// lorebookEntryMerger.js - AI-powered merging of new lorebook content with existing entries

// Use wrapped version from our interceptor
import { wrappedGenerateRaw as generateRaw } from './generateRawInterceptor.js';
import { loadPresetPrompts } from './presetPromptLoader.js';
import { SUBSYSTEM } from './index.js';
import { DEBUG_OUTPUT_LONG_LENGTH, DEBUG_OUTPUT_MEDIUM_LENGTH } from './constants.js';

// Will be imported from index.js via barrel exports
let log , debug , error ; // Logging functions - any type is legitimate
let modifyLorebookEntry , getLorebookEntries , reorderLorebookEntriesAlphabetically ; // Lorebook functions - any type is legitimate
let get_settings ; // Settings function - any type is legitimate
let enqueueOperation , OperationType ; // Queue functions - any type is legitimate

export function initLorebookEntryMerger(utils , lorebookManagerModule , settingsManagerModule , queueModule ) {
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

function getDefaultMergePrompt() {
  return `You are updating a lorebook entry. You have the existing entry content and new information from a recap.

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

New Information from Recap:
{{new_content}}

You MUST respond with valid JSON in this format:
{
  "mergedContent": "the merged entry content here",
  "canonicalName": null
}`;
}

function getRecapProcessingSetting(key , defaultValue  = null) {
  // defaultValue and return value are any type - can be various types - legitimate use of any
  try {
    // ALL recap processing settings are per-profile
    const settingKey = `auto_lorebooks_recap_${key}`;
    return get_settings(settingKey) ?? defaultValue;
  } catch (err) {
    error("Error getting recap processing setting", err);
    return defaultValue;
  }
}

function createMergePrompt(existingContent , newContent , entryName  = '') {
  const template = getRecapProcessingSetting('merge_prompt') || getDefaultMergePrompt();
  const prefill = getRecapProcessingSetting('merge_prefill') || '';

  // DEBUG: Log what template we got
  debug('Merge prompt template first 300 chars:', template.slice(0, DEBUG_OUTPUT_LONG_LENGTH));
  debug('Entry name being passed:', entryName);

  const prompt = template.
  replace(/\{\{existing_content\}\}/g, existingContent || '').
  replace(/\{\{current_content\}\}/g, existingContent || '') // Alternate name
  .replace(/\{\{new_content\}\}/g, newContent || '').
  replace(/\{\{new_update\}\}/g, newContent || '') // Alternate name
  .replace(/\{\{entry_name\}\}/g, entryName || ''); // Entry name for name resolution

  return { prompt, prefill };
}

async function callAIForMerge(existingContent , newContent , entryName  = '', connectionProfile  = '', completionPreset  = '') {
  try {
    const { prompt, prefill } = createMergePrompt(existingContent, newContent, entryName);

    debug('Calling AI for entry merge...');
    debug('Prompt:', prompt.slice(0, DEBUG_OUTPUT_MEDIUM_LENGTH) + '...');

    // Get include_preset_prompts setting
    const include_preset_prompts = getRecapProcessingSetting('merge_include_preset_prompts', false);

    debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] entryName:', entryName);
    debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] include_preset_prompts:', include_preset_prompts);
    debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] completionPreset (param):', completionPreset);

    // If preset_name is empty, use the currently active preset (like recapping.js does)
    const { setOperationSuffix, clearOperationSuffix, withConnectionSettings, get_current_preset } = await import('./index.js');
    const effectivePresetName = completionPreset || (include_preset_prompts ? get_current_preset() : '');

    debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] effectivePresetName:', effectivePresetName);
    debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] Condition check (include && preset):', include_preset_prompts && effectivePresetName);

    // Set operation context for ST_METADATA
    if (entryName) {
      setOperationSuffix(`-${entryName}`);
    }

    let response;
    try {
      // Wrap with connection settings to switch profile/preset
      response = await withConnectionSettings(
        connectionProfile,
        effectivePresetName,
        // eslint-disable-next-line complexity -- Prompt construction with multiple conditional branches inherently complex
        async () => {
          let prompt_input;

          if (include_preset_prompts && effectivePresetName) {
            // Load preset prompts and preset settings
            const { getPresetManager } = await import('../../../preset-manager.js');
            const presetManager = getPresetManager('openai');
            const preset = presetManager?.getCompletionPresetByName(effectivePresetName);
            const presetMessages = await loadPresetPrompts(effectivePresetName);

            debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] presetMessages loaded:', presetMessages?.length || 0, 'prompts');
            if (presetMessages && presetMessages.length > 0) {
              debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] First preset prompt role:', presetMessages[0]?.role);
              debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] First preset prompt content length:', presetMessages[0]?.content?.length || 0);
            }

            // Use extension's prefill if set, otherwise use preset's prefill
            const effectivePrefill = prefill || preset?.assistant_prefill || '';
            debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] effectivePrefill source:', prefill ? 'extension' : (preset?.assistant_prefill ? 'preset' : 'empty'));

            // Only use messages array if we actually got preset prompts
            if (presetMessages && presetMessages.length > 0) {
              debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] Using messages array format with preset prompts');

              prompt_input = [
                ...presetMessages,
                { role: 'user', content: prompt }
              ];

              // eslint-disable-next-line no-restricted-syntax -- Internal call within operation handler (already in queue context)
              return generateRaw({
                prompt: prompt_input,
                instructOverride: false,
                quietToLoud: false,
                prefill: effectivePrefill
              });
            } else {
              console.warn('[callAIForMerge] include_preset_prompts enabled but no preset prompts loaded, falling back to string format');
              // Fall back to string format
              // eslint-disable-next-line no-restricted-syntax -- Internal call within operation handler (already in queue context)
              return generateRaw({
                prompt: prompt,
                instructOverride: false,
                quietToLoud: false,
                prefill: prefill || ''
              });
            }
          } else {
            debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] Using string format (include_preset_prompts not enabled or no preset)');
            // Current behavior - string prompt only
            // eslint-disable-next-line no-restricted-syntax -- Internal call within operation handler (already in queue context)
            return generateRaw({
              prompt: prompt,
              instructOverride: false,
              quietToLoud: false,
              prefill: prefill || ''
            });
          }
        }
      );
    } finally {
      clearOperationSuffix();
    }

    if (!response || response.trim().length === 0) {
      throw new Error('AI returned empty response');
    }

    // Parse JSON response using centralized helper
    const { extractJsonFromResponse } = await import('./utils.js');
    const parsed = extractJsonFromResponse(response, {
      requiredFields: ['mergedContent'],
      context: 'lorebook merge operation'
    });

    debug('AI merge completed successfully');
    return {
      mergedContent: parsed.mergedContent,
      canonicalName: parsed.canonicalName || null
    };

  } catch (err) {
    error('Failed to call AI for merge', err);
    throw err;
  }
}

export async function mergeLorebookEntry(lorebookName , existingEntry , newEntryData , options  = {}) {
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
          priority: 13, // Third stage of lorebook pipeline - merge existing entry
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
 * Synchronizes PList-style content name: [oldName: ...] → [newName: ...]
 * @param {string} content - Content to update
 * @param {string} newComment - New canonical name
 * @param {string} currentComment - Old name for logging
 * @returns {string} Updated content
 */
function synchronizePListContentName(content, newComment, currentComment) {
  const colonIndex = content.indexOf(':');
  if (colonIndex <= 0) {
    return content; // Early return - no colon found
  }

  debug(`Updated content prefix from [${currentComment}: to [${newComment}:`);
  return `[${newComment}${content.slice(colonIndex)}`;
}

/**
 * Synchronizes bullet-style content with Identity/Entity/Name line
 * @param {string} content - Content to update
 * @param {string} finalCanonicalName - Canonical name to use
 * @param {RegExpMatchArray|null} typeMatch - Type prefix match result
 * @param {string} currentComment - Current comment for logging
 * @param {string} newComment - New comment for logging
 * @returns {string} Updated content
 */
function synchronizeBulletContentName(content, finalCanonicalName, typeMatch, currentComment, newComment) {
  const typeWord = (typeMatch && typeMatch[1]) ? String(typeMatch[1]) : '';
  const typeLabel = typeWord ? typeWord.charAt(0).toUpperCase() + typeWord.slice(1) : '';
  const lines = content.split('\n');
  const identityIdx = lines.findIndex((l) => /^(\s*[-*]\s*)(Identity|Entity|Name)\s*:\s*/i.test(l));
  const newIdentity = `- Identity: ${typeLabel ? typeLabel + ' — ' : ''}${finalCanonicalName}`;

  if (identityIdx >= 0) {
    // Update existing Identity line
    lines[identityIdx] = newIdentity;
    debug(`Updated Identity bullet for ${currentComment} -> ${newComment}`);
    return lines.join('\n');
  }

  // Prepend new Identity line
  debug(`Prepended Identity bullet for ${newComment}`);
  return `${newIdentity}\n${content}`;
}

/**
 * Merges key arrays with deduplication
 * @param {Array} existingKeys - Current keys
 * @param {Array} newKeys - New keys to add
 * @returns {Array|null} Merged keys or null if no changes
 */
function mergeKeyArrays(existingKeys, newKeys) {
  const existingArray = existingKeys || [];
  const newArray = (newKeys || []).filter((k) => k && k.trim());

  if (newArray.length === 0) {
    return null; // No changes
  }

  // Combine and deduplicate
  const mergedKeys = [...new Set([...existingArray, ...newArray])];

  if (mergedKeys.length > existingArray.length) {
    debug(`Merged keys: ${existingArray.length} existing + ${newArray.length} new = ${mergedKeys.length} total`);
    return mergedKeys;
  }

  return null; // No changes
}

/**
 * Merges secondary key arrays with deduplication
 * @param {Array} existingSecondary - Current secondary keys
 * @param {Array} newSecondary - New secondary keys to add
 * @returns {Array|null} Merged secondary keys or null if no changes
 */
function mergeSecondaryKeyArrays(existingSecondary, newSecondary) {
  const existingArray = existingSecondary || [];
  const newArray = (newSecondary || []).filter((k) => k && k.trim());

  if (newArray.length === 0) {
    return null; // No changes
  }

  const mergedSecondary = [...new Set([...existingArray, ...newArray])];

  if (mergedSecondary.length > existingArray.length) {
    return mergedSecondary;
  }

  return null; // No changes
}

/**
 * Builds name resolution updates from AI merge result
 * @param {Object} mergeResult - AI merge result with canonicalName
 * @param {Object} existingEntry - Existing lorebook entry
 * @param {Object} newEntryData - New entry data to merge
 * @returns {Object} { updates, finalCanonicalName }
 */
function buildNameResolutionUpdates(mergeResult, existingEntry, newEntryData) {
  const updates = {
    content: mergeResult.mergedContent
  };

  let finalCanonicalName = null;

  // Check if AI suggested a canonical name
  if (!mergeResult.canonicalName || !mergeResult.canonicalName.trim()) {
    return { updates, finalCanonicalName };
  }

  finalCanonicalName = mergeResult.canonicalName.trim();
  const currentComment = existingEntry.comment || '';

  // Extract the type prefix (e.g., "character-" from "character-amelia's sister")
  const typeMatch = currentComment.match(/^([^-]+)-/);
  const typePrefix = typeMatch ? typeMatch[1] + '-' : '';

  // Build new comment with canonical name
  const newComment = typePrefix + finalCanonicalName;

  // Only update if the name actually changed
  if (newComment === currentComment) {
    return { updates, finalCanonicalName };
  }

  updates.comment = newComment;

  // Synchronize content with new name
  if (updates.content && typeof updates.content === 'string') {
    const contentTrim = updates.content.trim();
    // Use ternary for PList vs Bullet style selection
    updates.content = contentTrim.startsWith('[')
      ? synchronizePListContentName(updates.content, newComment, currentComment)
      : synchronizeBulletContentName(updates.content, finalCanonicalName, typeMatch, currentComment, newComment);
  }

  // Extract old stub name (without type prefix) to add as keyword
  const oldStubName = currentComment.replace(/^[^-]+-/, '').toLowerCase();

  debug(`Name resolution: "${currentComment}" -> "${newComment}"`);
  debug(`Adding old stub "${oldStubName}" to keywords`);

  // Add old stub name to newEntryData.keys for later merging
  const existingKeys = existingEntry.key || [];
  if (oldStubName && !existingKeys.includes(oldStubName)) {
    newEntryData.keys = [...(newEntryData.keys || []), oldStubName];
  }

  return { updates, finalCanonicalName };
}

// Business logic: merge entries with name resolution and key deduplication
export async function executeMerge(lorebookName , existingEntry , newEntryData ) {
  // existingEntry, newEntryData, and return type are any - complex objects with various properties - legitimate use of any
  try {
    debug(`Executing merge for entry: ${existingEntry.comment}`);

    // Get connection settings for merge operation
    const connectionProfile = getRecapProcessingSetting('merge_connection_profile', '');
    const completionPreset = getRecapProcessingSetting('merge_completion_preset', '');

    // Call AI to merge content (now returns object with mergedContent and optional canonicalName)
    const mergeResult = await callAIForMerge(
      existingEntry.content || '',
      newEntryData.content || '',
      existingEntry.comment || '',
      connectionProfile,
      completionPreset
    );

    // Handle name resolution using helper function
    const { updates, finalCanonicalName } = buildNameResolutionUpdates(mergeResult, existingEntry, newEntryData);

    // Merge keys if new ones provided
    const mergedKeys = mergeKeyArrays(existingEntry.key, newEntryData.keys);
    if (mergedKeys) {
      updates.keys = mergedKeys;
    }

    // Merge secondary keys if new ones provided
    const mergedSecondary = mergeSecondaryKeyArrays(existingEntry.keysecondary, newEntryData.secondaryKeys);
    if (mergedSecondary) {
      updates.secondaryKeys = mergedSecondary;
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

export async function mergeLorebookEntryByUid(params ) {
  // params and return type are any - complex objects with various properties - legitimate use of any
  try {
    const { lorebookName, entryUid, existingContent, newContent, newKeys, newSecondaryKeys } = params;

    debug(`Merging entry UID ${entryUid} in lorebook ${lorebookName}`);

    // Get current entry data
    const entries = await getLorebookEntries(lorebookName);
    const entry = entries?.find((e) => e.uid === entryUid);

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

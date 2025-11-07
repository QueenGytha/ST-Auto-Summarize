
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

You MUST respond with valid JSON in this format:
{
  "mergedContent": "the merged entry content here",
  "canonicalName": null
}`;
}

function getSummaryProcessingSetting(key , defaultValue  = null) {
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

function createMergePrompt(existingContent , newContent , entryName  = '') {
  const template = getSummaryProcessingSetting('merge_prompt') || getDefaultMergePrompt();
  const prefill = getSummaryProcessingSetting('merge_prefill') || '';

  // DEBUG: Log what template we got
  debug('Merge prompt template first 300 chars:', template.substring(0, DEBUG_OUTPUT_LONG_LENGTH));
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
    debug('Prompt:', prompt.substring(0, DEBUG_OUTPUT_MEDIUM_LENGTH) + '...');

    // Get include_preset_prompts setting
    const include_preset_prompts = getSummaryProcessingSetting('merge_include_preset_prompts', false);

    debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] entryName:', entryName);
    debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] include_preset_prompts:', include_preset_prompts);
    debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] completionPreset (param):', completionPreset);

    // If preset_name is empty, use the currently active preset (like summarization.js does)
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
        // eslint-disable-next-line complexity
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

              return await generateRaw({
                prompt: prompt_input,
                instructOverride: false,
                quietToLoud: false,
                prefill: effectivePrefill
              });
            } else {
              console.warn('[callAIForMerge] include_preset_prompts enabled but no preset prompts loaded, falling back to string format');
              // Fall back to string format
              return await generateRaw({
                prompt: prompt,
                instructOverride: false,
                quietToLoud: false,
                prefill: prefill || ''
              });
            }
          } else {
            debug(SUBSYSTEM.LOREBOOK,'[callAIForMerge] Using string format (include_preset_prompts not enabled or no preset)');
            // Current behavior - string prompt only
            return await generateRaw({
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

// Business logic: merge entries with name resolution and key deduplication
// eslint-disable-next-line complexity
export async function executeMerge(lorebookName , existingEntry , newEntryData ) {
  // existingEntry, newEntryData, and return type are any - complex objects with various properties - legitimate use of any
  try {
    debug(`Executing merge for entry: ${existingEntry.comment}`);

    // Get connection settings for merge operation
    const connectionProfile = getSummaryProcessingSetting('merge_connection_profile', '');
    const completionPreset = getSummaryProcessingSetting('merge_completion_preset', '');

    // Call AI to merge content (now returns object with mergedContent and optional canonicalName)
    const mergeResult = await callAIForMerge(
      existingEntry.content || '',
      newEntryData.content || '',
      existingEntry.comment || '',
      connectionProfile,
      completionPreset
    );

    // Prepare updates
    const updates  = {
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

        // Synchronize content prefix with new comment
        // Replace [oldComment: with [newComment: in the PList content
        if (updates.content && updates.content.trim().startsWith('[')) {
          const colonIndex = updates.content.indexOf(':');
          if (colonIndex > 0) {
            // Replace the entity name prefix in content to match the new comment
            updates.content = `[${newComment}${updates.content.substring(colonIndex)}`;
            debug(`Updated content prefix from [${currentComment}: to [${newComment}:`);
          }
        }

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
      const newKeys = newEntryData.keys.filter((k) => k && k.trim());
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
      const newSecondary = newEntryData.secondaryKeys.filter((k) => k && k.trim());
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
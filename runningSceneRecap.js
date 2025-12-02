
import {
  get_settings,
  getContext,
  chat_metadata,
  SUBSYSTEM,
  debug,
  error,
  log,
  toast,
  get_data,
  saveChatDebounced,
  saveMetadata,
  getCurrentChatId,
  resolveOperationConfig,
  detectImportedChatWithMissingLorebook } from
'./index.js';
import { running_scene_recap_prompt } from './default-prompts/index.js';
import { buildAllMacroParams, substitute_params, substitute_conditionals } from './macros/index.js';
import { normalizeStageOutput } from './recapNormalization.js';
import { queueProcessLorebookEntry } from './queueIntegration.js';

// Hash computation constants
const HASH_MULTIPLIER = 31;
const HASH_RADIX = 36;

// Simple, deterministic hash for deduplication (no external dependencies)
function computeRunningRecapHash(text = '') {
  const trimmed = String(text).trim();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = ((hash * HASH_MULTIPLIER) + trimmed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(HASH_RADIX);
}

function extractEventEntities(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }
  const entities = parsed.entities;
  if (!Array.isArray(entities)) {
    return [];
  }
  return entities.filter((e) => (e.t || e.type) === 'event');
}

function normalizeEventEntity(entity) {
  const name = String(entity.name || entity.n || '').trim();
  // Content can be string or array - normalize to string for display
  let content = entity.content || entity.c || '';
  if (Array.isArray(content)) {
    content = content.join('\n');
  }
  content = String(content).trim();
  const rawKeys = entity.keywords || entity.k || entity.keys || [];
  const keys = Array.isArray(rawKeys) ? rawKeys.map((k) => String(k)) : [];
  const type = entity.type || entity.t || 'event';
  return {
    name: name || 'event',
    content,
    keys,
    type
  };
}

function buildEventKey(versionNumber, entity) {
  return `${versionNumber}:${entity.name}:${computeRunningRecapHash(entity.content || '')}`;
}

async function processRunningRecapEvents(events, versionNumber, recapHash, messageIndex) {
  if (!events || events.length === 0) {
    return [];
  }

  const storage = get_running_recap_storage();
  const versions = storage.versions || [];
  const targetVersion = versions.find((v) => v.version === versionNumber);
  const seen = new Set(targetVersion?.event_keys || []);

  for (const event of events) {
    const normalized = normalizeEventEntity(event);
    const key = buildEventKey(versionNumber, normalized);
    if (seen.has(key)) {
      debug(SUBSYSTEM.RUNNING, `[Running recap] Skipping duplicate event '${normalized.name}' (key ${key})`);
      continue;
    }

    const entry = {
      name: normalized.name,
      content: normalized.content,
      keywords: normalized.keys,
      type: normalized.type || 'event'
    };

    try {
      // eslint-disable-next-line no-await-in-loop -- Sequential processing required
      await queueProcessLorebookEntry(entry, messageIndex ?? targetVersion?.new_scene_index ?? 0, recapHash, {
        metadata: { running_recap_version: versionNumber }
      });
      debug(SUBSYSTEM.RUNNING, `[Running recap] Queued event '${normalized.name}' (key ${key})`);
      seen.add(key);
    } catch (err) {
      error(SUBSYSTEM.RUNNING, `Failed to queue running recap event '${normalized.name}':`, err);
    }
  }

  if (targetVersion) {
    targetVersion.event_keys = Array.from(seen);
    saveChatDebounced();
    saveMetadata();
    return targetVersion.event_keys;
  }

  return Array.from(seen);
}

/**
 * Extract Stage 3 filtered data from a scene's stored multi-stage format.
 * @param {string|Object} scene_recap - Raw scene recap data
 * @returns {Object|null} Stage 3 data object or null if not found
 */
function extractStage3FromScene(scene_recap) {
  if (!scene_recap || (typeof scene_recap === 'string' && scene_recap.trim().length === 0)) {
    return null;
  }

  try {
    const parsed = typeof scene_recap === 'string' ? JSON.parse(scene_recap) : scene_recap;
    // Stage 3 data in multi-stage format
    if (parsed.stage3) {
      return parsed.stage3;
    }
    // Direct Stage 3 format
    if (parsed.developments || parsed.open || parsed.state) {
      return parsed;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/**
 * Combine Stage 3 data from multiple scenes into one filtered recap object.
 * @param {number[]} indexes - Scene message indexes
 * @param {Object[]} chat - Chat messages
 * @returns {{ combinedFiltered: Object, validSceneCount: number }}
 */
function combineStage3FromScenes(indexes, chat) {
  const combinedFiltered = { developments: [], open: [], state: [], resolved: [] };
  let validSceneCount = 0;

  for (const idx of indexes) {
    const msg = chat[idx];
    const scene_recap = get_data(msg, 'scene_recap_memory') || '';
    const stage3 = extractStage3FromScene(scene_recap);

    if (stage3) {
      validSceneCount++;
      if (Array.isArray(stage3.developments)) {
        combinedFiltered.developments.push(...stage3.developments);
      }
      if (Array.isArray(stage3.open)) {
        combinedFiltered.open.push(...stage3.open);
      }
      if (Array.isArray(stage3.state)) {
        combinedFiltered.state.push(...stage3.state);
      }
      if (Array.isArray(stage3.resolved)) {
        combinedFiltered.resolved.push(...stage3.resolved);
      }
    }
  }

  return { combinedFiltered, validSceneCount };
}

function get_running_recap_storage() {
  const currentChatId = getCurrentChatId();

  if (!chat_metadata.auto_recap_running_scene_recaps) {
    chat_metadata.auto_recap_running_scene_recaps = {
      chat_id: currentChatId,
      current_version: 0,
      versions: []
    };
  } else if (chat_metadata.auto_recap_running_scene_recaps.chat_id !== currentChatId) {
    // Check if this is a branch/checkpoint (indicated by main_chat metadata)
    if (chat_metadata.main_chat) {
      // This is a branch/checkpoint - update chat_id to preserve running recap data
      debug(
        SUBSYSTEM.RUNNING,
        `Branch/checkpoint detected: updating running recap chat_id from '${chat_metadata.auto_recap_running_scene_recaps.chat_id}' to '${currentChatId}'`
      );
      chat_metadata.auto_recap_running_scene_recaps.chat_id = currentChatId;
    } else {
      // Check if this is an imported chat (has extension data but lorebook is missing)
      const importDetection = detectImportedChatWithMissingLorebook();
      if (importDetection.isLikelyImport) {
        // Imported chat - preserve data and update chat_id
        log(
          SUBSYSTEM.RUNNING,
          `Import detected: updating running recap chat_id from '${chat_metadata.auto_recap_running_scene_recaps.chat_id}' to '${currentChatId}'. ` +
          `Missing lorebook: '${importDetection.missingLorebookName}'`
        );
        chat_metadata.auto_recap_running_scene_recaps.chat_id = currentChatId;
      } else {
        // Data belongs to different chat - reset to prevent contamination
        error(
          SUBSYSTEM.RUNNING,
          `Running recap storage belongs to chat '${chat_metadata.auto_recap_running_scene_recaps.chat_id}', ` +
          `but current chat is '${currentChatId}'. Resetting to prevent cross-chat contamination.`
        );
        chat_metadata.auto_recap_running_scene_recaps = {
          chat_id: currentChatId,
          current_version: 0,
          versions: []
        };
      }
    }
  }

  return chat_metadata.auto_recap_running_scene_recaps;
}

function get_running_recap_versions() {
  const storage = get_running_recap_storage();
  return storage.versions || [];
}

function get_current_running_recap_version() {
  const storage = get_running_recap_storage();
  return storage.current_version || 0;
}

function get_running_recap(version  = null) {
  const storage = get_running_recap_storage();
  let targetVersion = version;
  if (targetVersion === null) {
    targetVersion = storage.current_version;
  }

  const versions = storage.versions || [];
  return versions.find((v) => v.version === targetVersion) || null;
}

function get_current_running_recap_content() {
  const current = get_running_recap();
  return current ? current.content : "";
}

function get_previous_running_recap_version_before_scene(scene_index ) {
  const versions = get_running_recap_versions();

  if (versions.length === 0) {
    return null;
  }

  // Find the most recent version where new_scene_index < scene_index
  // This gives us the running recap that existed BEFORE this scene was combined
  let previous_version = null;

  for (let i = versions.length - 1; i >= 0; i--) {
    const version = versions[i];
    const version_scene_idx = version.new_scene_index ?? 0;

    if (version_scene_idx < scene_index) {
      previous_version = version;
      break;
    }
  }

  return previous_version;
}

function set_current_running_recap_version(version ) {
  const storage = get_running_recap_storage();
  const versions = storage.versions || [];

  // Verify version exists
  if (!versions.some((v) => v.version === version)) {
    error(SUBSYSTEM.RUNNING, `Cannot set version ${version} as current - version not found`);
    return;
  }

  storage.current_version = version;
  saveChatDebounced();
  debug(SUBSYSTEM.RUNNING, `Set current running recap version to ${version}`);
}

function add_running_recap_version(options) {
  const {
    content,
    scene_count,
    excluded_count,
    prev_scene_index = 0,
    new_scene_index = 0,
    event_keys = []
  } = options;

  const storage = get_running_recap_storage();
  const versions = storage.versions || [];

  // Find highest version number
  const max_version = versions.reduce((max, v) => Math.max(max, v.version), -1);
  const new_version = max_version + 1;

  const version_obj = {
    version: new_version,
    timestamp: Date.now(),
    content,
    scene_count,
    excluded_count,
    prev_scene_index,
    new_scene_index,
    event_keys
  };

  versions.push(version_obj);
  storage.versions = versions;
  storage.current_version = new_version;

  saveChatDebounced();
  saveMetadata();
  debug(SUBSYSTEM.RUNNING, `Created running recap version ${new_version} (${prev_scene_index} > ${new_scene_index})`);

  // Update the UI dropdown to reflect the new version
  if (typeof window.updateVersionSelector === 'function') {
    window.updateVersionSelector();
  }

  return new_version;
}

function delete_running_recap_version(version ) {
  const storage = get_running_recap_storage();
  const versions = storage.versions || [];

  const index = versions.findIndex((v) => v.version === version);
  if (index === -1) {
    error(SUBSYSTEM.RUNNING, `Cannot delete version ${version} - version not found`);
    return;
  }

  versions.splice(index, 1);
  storage.versions = versions;

  // If we deleted the current version, set to latest remaining version
  if (storage.current_version === version) {
    if (versions.length > 0) {
      const latest = versions.reduce((max, v) => Math.max(max, v.version), -1);
      storage.current_version = latest;
    } else {
      storage.current_version = 0;
    }
  }

  saveChatDebounced();
  saveMetadata();
  debug(SUBSYSTEM.RUNNING, `Deleted running recap version ${version}`);
}

function clear_running_scene_recaps() {
  const storage = chat_metadata.auto_recap_running_scene_recaps;
  const existingVersions = Array.isArray(storage?.versions) ? storage.versions.length : 0;
  const hadState = storage && (existingVersions > 0 || (storage.current_version ?? 0) !== 0);

  if (!hadState) {
    return 0;
  }

  chat_metadata.auto_recap_running_scene_recaps = {
    current_version: 0,
    versions: []
  };

  saveChatDebounced();
  saveMetadata();
  debug(SUBSYSTEM.RUNNING, `Cleared ${existingVersions} running scene recap version(s)`);
  return existingVersions;
}

function collect_scene_recap_indexes_for_running() {
  const ctx = getContext();
  const chat = ctx.chat;
  const exclude_latest = get_settings('running_scene_recap_exclude_latest') || 0;

  const indexes = [];
  for (let i = 0; i < chat.length; i++) {
    const msg = chat[i];
    if (get_data(msg, 'scene_recap_memory')) {
      indexes.push(i);
    }
  }

  // Exclude latest N scenes if configured
  if (exclude_latest > 0 && indexes.length > exclude_latest) {
    const to_remove = indexes.slice(-exclude_latest);
    debug(SUBSYSTEM.RUNNING, `Excluding latest ${exclude_latest} scene(s) from running recap: indexes ${to_remove}`);
    return indexes.slice(0, -exclude_latest);
  }

  return indexes;
}

async function generate_running_scene_recap(skipQueue  = false) {
  const ctx = getContext();
  const chat = ctx.chat;

  // Collect scene recap indexes early (needed for queue display)
  const indexes = collect_scene_recap_indexes_for_running();

  // Queue running scene recap generation unless explicitly skipped
  if (!skipQueue) {
    debug(SUBSYSTEM.RUNNING, '[Queue] Queueing running scene recap generation');

    // Import queue integration
    const { queueGenerateRunningRecap } = await import('./queueIntegration.js');

    // Queue the running scene recap generation, passing indexes for display
    const operationId = await queueGenerateRunningRecap({ indexes });

    if (operationId) {
      log(SUBSYSTEM.RUNNING, '[Queue] Queued running scene recap generation:', operationId);
      toast('Queued running scene recap generation', 'info');
      return null; // Operation will be processed by queue
    }

    // Queue is required. If enqueue failed, abort rather than running directly.
    error(SUBSYSTEM.RUNNING, '[Queue] Failed to enqueue running scene recap generation. Aborting.');
    toast('Queue required: failed to enqueue running scene recap generation. Aborting.', 'error');
    return null;
  }

  // Direct execution path is only used by queue handler (skipQueue=true)
  debug(SUBSYSTEM.RUNNING, `Executing running scene recap generation directly (skipQueue=${String(skipQueue)})`);

  debug(SUBSYSTEM.RUNNING, 'Starting running scene recap generation');

  const exclude_count = get_settings('running_scene_recap_exclude_latest') || 0;

  if (indexes.length === 0) {
    debug(SUBSYSTEM.RUNNING, 'No scene recaps available for running recap');
    return null;
  }

  debug(SUBSYSTEM.RUNNING, `Found ${indexes.length} scene recaps (excluding latest ${exclude_count})`);

  // Extract and combine Stage 3 data from all scenes
  const { combinedFiltered, validSceneCount } = combineStage3FromScenes(indexes, chat);

  if (validSceneCount === 0) {
    debug(SUBSYSTEM.RUNNING, 'No valid Stage 3 data found in scenes, skipping running recap generation');
    return null;
  }
  debug(SUBSYSTEM.RUNNING, `Combined Stage 3 data from ${validSceneCount} scenes`);

  // Get current running recap if exists
  const current_recap = get_current_running_recap_content();

  // Build prompt using combined filtered recap
  const { prompt, prefill } = await buildCombinePrompt(current_recap, combinedFiltered);

  // Get connection profile and preset settings
  const config = await resolveOperationConfig('running_scene_recap');
  const running_preset = config.completion_preset_name;
  const running_profile = config.connection_profile || '';
  const include_preset_prompts = config.include_preset_prompts;

  try {
    // Add new version - for bulk generation, track from 0 to last scene index
    const last_scene_idx = indexes.length > 0 ? indexes[indexes.length - 1] : 0;

    let result;

    // Set operation context for ST_METADATA
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    setOperationSuffix(`-0-${last_scene_idx}`);

    try {
      const { sendLLMRequest } = await import('./llmClient.js');
      const { OperationType } = await import('./operationTypes.js');
      const { resolveProfileId } = await import('./profileResolution.js');
      const effectiveProfile = resolveProfileId(running_profile);

      debug(SUBSYSTEM.RUNNING, 'Sending running scene recap prompt to LLM');

      const options = {
        includePreset: include_preset_prompts,
        preset: running_preset,
        prefill,
        trimSentences: false
      };

      result = await sendLLMRequest(effectiveProfile, prompt, OperationType.GENERATE_RUNNING_RECAP, options);
      debug(SUBSYSTEM.RUNNING, `Generated running recap (${result.length} chars)`);
    } finally {
      clearOperationSuffix();
    }

    // Extract token breakdown from response
    const { extractTokenBreakdownFromResponse } = await import('./tokenBreakdown.js');
    const tokenBreakdown = extractTokenBreakdownFromResponse(result);

    // Parse JSON response using centralized helper
    const { extractJsonFromResponse } = await import('./utils.js');
    const parsedRaw = extractJsonFromResponse(result, {
      requiredFields: [],
      context: 'running scene recap generation'
    });

    // Normalize running recap output (handles field names and object→string conversion)
    const parsed = normalizeStageOutput('running', parsedRaw);
    const recapContent = parsed.recap || '';
    const eventEntities = extractEventEntities(parsed);
    const recapHash = computeRunningRecapHash(recapContent);

    const version = add_running_recap_version({
      content: recapContent,
      scene_count: indexes.length,
      excluded_count: exclude_count,
      prev_scene_index: 0,
      new_scene_index: last_scene_idx
    });
    await processRunningRecapEvents(eventEntities, version, recapHash, last_scene_idx);

    log(SUBSYSTEM.RUNNING, `Created running scene recap version ${version} (0 > ${last_scene_idx})`);

    toast(`Running scene recap updated (v${version})`, 'success');

    return { recap: recapContent, tokenBreakdown };

  } catch (err) {
    error(SUBSYSTEM.RUNNING, 'Failed to generate running scene recap:', err);
    // Re-throw to let queue retry logic handle it (don't return null)
    throw err;
  }
}

function validateCombineRequest(scene_index ) {
  const ctx = getContext();
  const chat = ctx.chat;
  const message = chat[scene_index];

  if (!message) {
    error(SUBSYSTEM.RUNNING, `No message at index ${scene_index}`);
    return null;
  }

  const scene_recap = get_data(message, 'scene_recap_memory');
  if (!scene_recap) {
    error(SUBSYSTEM.RUNNING, `No scene recap at index ${scene_index}`);
    return null;
  }

  const scene_name = get_data(message, 'scene_break_name') || `Scene #${scene_index}`;

  return { message, scene_recap, scene_name };
}

async function buildCombinePrompt(current_recap, filteredRecap) {
  const config = await resolveOperationConfig('running_scene_recap');
  let prompt = config.prompt || running_scene_recap_prompt;

  // Build all macro values from context
  const params = buildAllMacroParams({
    currentRunningRecap: current_recap || '',
    filteredRecap: filteredRecap || {}
  });

  // Use centralized macro substitution
  prompt = substitute_conditionals(prompt, params);
  prompt = await substitute_params(prompt, params);

  // Get prefill if configured
  const prefill = config.prefill || '';

  return { prompt, prefill };
}

async function executeCombineLLMCall(prompt , prefill , scene_name , scene_index ) {
  // Get connection profile and preset settings
  const config = await resolveOperationConfig('running_scene_recap');
  const running_preset = config.completion_preset_name;
  const running_profile = config.connection_profile || '';
  const include_preset_prompts = config.include_preset_prompts;

  debug(SUBSYSTEM.RUNNING, `Sending prompt to LLM to combine with ${scene_name}`);

  // Set operation context for ST_METADATA
  const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
  const prev_version = get_previous_running_recap_version_before_scene(scene_index);
  const prev_scene_idx = prev_version ? prev_version.new_scene_index : 0;
  setOperationSuffix(`-${prev_scene_idx}-${scene_index}`);

  try {
    const { sendLLMRequest } = await import('./llmClient.js');
    const { OperationType } = await import('./operationTypes.js');
    const { resolveProfileId } = await import('./profileResolution.js');
    const effectiveProfile = resolveProfileId(running_profile);

    const options = {
      includePreset: include_preset_prompts,
      preset: running_preset,
      prefill,
      trimSentences: false
    };

    const result = await sendLLMRequest(effectiveProfile, prompt, OperationType.COMBINE_SCENE_WITH_RUNNING, options);

    // Extract token breakdown from response
    const { extractTokenBreakdownFromResponse } = await import('./tokenBreakdown.js');
    const tokenBreakdown = extractTokenBreakdownFromResponse(result);

    // Parse JSON response using centralized helper
    const { extractJsonFromResponse } = await import('./utils.js');
    const parsedRaw = extractJsonFromResponse(result, {
      requiredFields: [],
      context: 'running scene recap combine'
    });

    // Normalize running recap output (handles field names and object→string conversion)
    const parsed = normalizeStageOutput('running', parsedRaw);
    const recapContent = parsed.recap || '';
    const eventEntities = extractEventEntities(parsed);

    debug(SUBSYSTEM.RUNNING, `Combined running recap with scene (${recapContent.length} chars)`);

    return { recap: recapContent, events: eventEntities, tokenBreakdown };
  } finally {
    clearOperationSuffix();
  }
}

async function storeRunningRecap(result , scene_index , scene_name , _scene_recap , events  = []) {
  const prev_version = get_previous_running_recap_version_before_scene(scene_index);
  const scene_count = prev_version ? prev_version.scene_count + 1 : 1;
  const exclude_count = get_settings('running_scene_recap_exclude_latest') || 0;

  const prev_scene_idx = prev_version ? prev_version.new_scene_index : 0;
  const new_scene_idx = scene_index;

  const version = add_running_recap_version({
    content: result,
    scene_count,
    excluded_count: exclude_count,
    prev_scene_index: prev_scene_idx,
    new_scene_index: new_scene_idx
  });
  const recapHash = computeRunningRecapHash(result);
  await processRunningRecapEvents(events, version, recapHash, scene_index);

  log(SUBSYSTEM.RUNNING, `Created running recap version ${version} (${prev_scene_idx} > ${new_scene_idx})`);

  toast(`Running recap updated with ${scene_name} (v${version})`, 'success');

  return version;
}

async function combine_scene_with_running_recap(scene_index ) {
  const sceneData = validateCombineRequest(scene_index);
  if (!sceneData) {
    return null;
  }

  const { scene_recap, scene_name } = sceneData;

  debug(SUBSYSTEM.RUNNING, `Combining running recap with scene at index ${scene_index} (${scene_name})`);

  // Extract Stage 3 filtered data from stored multi-stage format
  const filteredRecap = extractStage3FromScene(scene_recap) || {};

  const previous_version = get_previous_running_recap_version_before_scene(scene_index);
  const previous_recap = previous_version ? previous_version.content : "";

  const { prompt, prefill } = await buildCombinePrompt(previous_recap, filteredRecap);

  try {
    const { recap, events, tokenBreakdown } = await executeCombineLLMCall(prompt, prefill, scene_name, scene_index);
    await storeRunningRecap(recap, scene_index, scene_name, scene_recap, events);
    return { recap, tokenBreakdown };

  } catch (err) {
    error(SUBSYSTEM.RUNNING, 'Failed to combine scene with running recap:', err);
    throw err;
  }
}

async function auto_generate_running_recap(scene_index  = null) {
  if (!get_settings('running_scene_recap_auto_generate')) {return;}

  debug(SUBSYSTEM.RUNNING, 'Auto-generating running scene recap for scene index:', scene_index);

  // Check if we have any existing versions
  const versions = get_running_recap_versions();
  const hasExistingVersions = versions.length > 0;

  if (hasExistingVersions && scene_index !== null) {
    // Use incremental combine to add this scene to the existing running recap
    debug(SUBSYSTEM.RUNNING, 'Existing running recap found, using incremental combine');
    await combine_scene_with_running_recap(scene_index);
  } else {
    // No existing recap or no scene index provided - do bulk regeneration
    debug(SUBSYSTEM.RUNNING, 'No existing running recap or no scene index, doing bulk regeneration');
    await generate_running_scene_recap();
  }

  // Update UI dropdown if available
  if (typeof window.updateVersionSelector === 'function') {
    window.updateVersionSelector();
    debug(SUBSYSTEM.RUNNING, 'Updated version selector UI');
  }
}

function cleanup_invalid_running_recaps() {
  const ctx = getContext();
  const chat = ctx.chat;
  const storage = get_running_recap_storage();
  const versions = storage.versions || [];

  if (versions.length === 0) {
    debug(SUBSYSTEM.RUNNING, 'No running recap versions to clean up');
    return;
  }

  // Get all valid scene recap indexes
  const valid_scene_indexes = [];
  for (let i = 0; i < chat.length; i++) {
    const msg = chat[i];
    if (get_data(msg, 'scene_recap_memory')) {
      valid_scene_indexes.push(i);
    }
  }

  debug(SUBSYSTEM.RUNNING, `Valid scene indexes: ${valid_scene_indexes.join(', ')}`);

  // Find versions that reference deleted messages
  const versions_to_delete = [];
  for (const version of versions) {
    const new_scene_idx = version.new_scene_index ?? 0;

    // Check if the new_scene_index still exists and has a scene recap
    // If new_scene_idx >= chat.length, the message was deleted
    // If the message exists but has no scene recap, it was deleted or the recap was removed
    if (new_scene_idx >= chat.length || !get_data(chat[new_scene_idx], 'scene_recap_memory')) {
      versions_to_delete.push(version.version);
      debug(SUBSYSTEM.RUNNING, `Version ${version.version} references invalid scene at index ${new_scene_idx}`);
    }
  }

  // Delete invalid versions
  if (versions_to_delete.length > 0) {
    log(SUBSYSTEM.RUNNING, `Cleaning up ${versions_to_delete.length} invalid running recap version(s)`);

    for (const version_num of versions_to_delete) {
      delete_running_recap_version(version_num);
    }

    // After cleanup, if current version was deleted, it will be auto-set to the latest
    // But we should also verify that the new current version is valid
    const current_version = get_current_running_recap_version();
    const current = get_running_recap(current_version);

    if (current && current.new_scene_index >= chat.length) {
      // Current version is still invalid, find the most recent valid one
      const remaining_versions = get_running_recap_versions();
      if (remaining_versions.length > 0) {
        const valid_versions = remaining_versions.filter((v) =>
        v.new_scene_index < chat.length &&
        get_data(chat[v.new_scene_index], 'scene_recap_memory')
        );

        if (valid_versions.length > 0) {
          const latest_valid = valid_versions.reduce((max, v) =>
          v.version > max.version ? v : max
          );
          set_current_running_recap_version(latest_valid.version);
          log(SUBSYSTEM.RUNNING, `Set current version to ${latest_valid.version} after cleanup`);
        }
      }
    }

    toast(`Cleaned up ${versions_to_delete.length} invalid running recap version(s)`, 'info');
  } else {
    debug(SUBSYSTEM.RUNNING, 'No invalid running recap versions found');
  }
}

function get_running_recap_injection() {
  const current = get_running_recap();
  if (!current || !current.content) {
    return "";
  }

  const template = get_settings('running_scene_recap_template') || "";
  if (!template.trim()) {
    // Fallback to simple format
    return current.content;
  }

  return template.replace(/\{\{running_recap\}\}/g, current.content);
}

export {
  get_running_recap_versions,
  get_current_running_recap_version,
  get_running_recap,
  get_current_running_recap_content,
  get_previous_running_recap_version_before_scene,
  set_current_running_recap_version,
  add_running_recap_version,
  delete_running_recap_version,
  clear_running_scene_recaps,
  collect_scene_recap_indexes_for_running,
  generate_running_scene_recap,
  combine_scene_with_running_recap,
  auto_generate_running_recap,
  get_running_recap_injection,
  cleanup_invalid_running_recaps };

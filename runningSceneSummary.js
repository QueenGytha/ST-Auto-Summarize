
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
  summarize_text,
  saveChatDebounced,
  saveMetadata } from
'./index.js';
import { running_scene_summary_prompt } from './defaultPrompts.js';
// Lorebook processing for running summary has been disabled; no queue integration needed here.

function get_running_summary_storage() {
  if (!chat_metadata.auto_summarize_running_scene_summaries) {
    chat_metadata.auto_summarize_running_scene_summaries = {
      current_version: 0,
      versions: []
    };
  }
  return chat_metadata.auto_summarize_running_scene_summaries;
}

function get_running_summary_versions() {
  const storage = get_running_summary_storage();
  return storage.versions || [];
}

function get_current_running_summary_version() {
  const storage = get_running_summary_storage();
  return storage.current_version || 0;
}

function get_running_summary(version  = null) {
  const storage = get_running_summary_storage();
  let targetVersion = version;
  if (targetVersion === null) {
    targetVersion = storage.current_version;
  }

  const versions = storage.versions || [];
  return versions.find((v) => v.version === targetVersion) || null;
}

function get_current_running_summary_content() {
  const current = get_running_summary();
  return current ? current.content : "";
}

function set_current_running_summary_version(version ) {
  const storage = get_running_summary_storage();
  const versions = storage.versions || [];

  // Verify version exists
  if (!versions.some((v) => v.version === version)) {
    error(SUBSYSTEM.RUNNING, `Cannot set version ${version} as current - version not found`);
    return;
  }

  storage.current_version = version;
  saveChatDebounced();
  debug(SUBSYSTEM.RUNNING, `Set current running summary version to ${version}`);
}

function add_running_summary_version(
content ,
scene_count ,
excluded_count ,
prev_scene_index  = 0,
new_scene_index  = 0)
{
  const storage = get_running_summary_storage();
  const versions = storage.versions || [];

  // Find highest version number
  const max_version = versions.reduce((max, v) => Math.max(max, v.version), -1);
  const new_version = max_version + 1;

  const version_obj = {
    version: new_version,
    timestamp: Date.now(),
    content: content,
    scene_count: scene_count,
    excluded_count: excluded_count,
    prev_scene_index: prev_scene_index,
    new_scene_index: new_scene_index
  };

  versions.push(version_obj);
  storage.versions = versions;
  storage.current_version = new_version;

  saveChatDebounced();
  debug(SUBSYSTEM.RUNNING, `Created running summary version ${new_version} (${prev_scene_index} > ${new_scene_index})`);

  // Update the UI dropdown to reflect the new version
  if (typeof window.updateVersionSelector === 'function') {
    window.updateVersionSelector();
  }

  return new_version;
}

function delete_running_summary_version(version ) {
  const storage = get_running_summary_storage();
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
  debug(SUBSYSTEM.RUNNING, `Deleted running summary version ${version}`);
}

function clear_running_scene_summaries() {
  const storage = chat_metadata.auto_summarize_running_scene_summaries;
  const existingVersions = Array.isArray(storage?.versions) ? storage.versions.length : 0;
  const hadState = storage && (existingVersions > 0 || (storage.current_version ?? 0) !== 0);

  if (!hadState) {
    return 0;
  }

  chat_metadata.auto_summarize_running_scene_summaries = {
    current_version: 0,
    versions: []
  };

  saveMetadata();
  debug(SUBSYSTEM.RUNNING, `Cleared ${existingVersions} running scene summary version(s)`);
  return existingVersions;
}

function collect_scene_summary_indexes_for_running() {
  const ctx = getContext();
  const chat = ctx.chat;
  const exclude_latest = get_settings('running_scene_summary_exclude_latest') || 0;

  const indexes = [];
  for (let i = 0; i < chat.length; i++) {
    const msg = chat[i];
    if (get_data(msg, 'scene_summary_memory')) {
      indexes.push(i);
    }
  }

  // Exclude latest N scenes if configured
  if (exclude_latest > 0 && indexes.length > exclude_latest) {
    const to_remove = indexes.slice(-exclude_latest);
    debug(SUBSYSTEM.RUNNING, `Excluding latest ${exclude_latest} scene(s) from running summary: indexes ${to_remove}`);
    return indexes.slice(0, -exclude_latest);
  }

  return indexes;
}

function extractSummaryText(scene_summary ) {
  let summary_text = scene_summary;

  // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
  let json_to_parse = scene_summary.trim();
  const code_fence_match = json_to_parse.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (code_fence_match) {
    json_to_parse = code_fence_match[1].trim();
  }

  try {
    const parsed = JSON.parse(json_to_parse);
    if (parsed && typeof parsed === 'object') {
      // Valid JSON but no 'summary' property - use empty string
      summary_text = parsed.summary || "";
    }
  } catch {

    // Not JSON or parsing failed - use the whole text as-is
  }
  return summary_text;
}

function buildSceneSummariesText(indexes , chat ) {
  return indexes.map((idx, i) => {
    const msg = chat[idx];
    const scene_summary = get_data(msg, 'scene_summary_memory') || "";
    const name = get_data(msg, 'scene_break_name') || `Scene ${i + 1}`;
    const summary_text = extractSummaryText(scene_summary);
    return `[Scene ${i + 1}: ${name}]\n${summary_text}`;
  }).join('\n\n');
}

function processPromptMacros(
prompt ,
current_summary ,
scene_summaries_text ,
prefill )
{
  // Replace macros
  let processed = prompt.replace(/\{\{current_running_summary\}\}/g, current_summary || "");
  processed = processed.replace(/\{\{scene_summaries\}\}/g, scene_summaries_text);

  // Handle Handlebars conditionals manually (simplified)
  if (current_summary) {
    processed = processed.replace(/\{\{#if current_running_summary\}\}/g, '');
    processed = processed.replace(/\{\{\/if\}\}/g, '');
  } else {
    // Remove the conditional block if no current summary
    processed = processed.replace(/\{\{#if current_running_summary\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  return { prompt: processed, prefill: prefill || '' };
}

async function generate_running_scene_summary(skipQueue  = false) {
  const ctx = getContext();
  const chat = ctx.chat;

  // Queue running scene summary generation unless explicitly skipped
  if (!skipQueue) {
    debug(SUBSYSTEM.RUNNING, '[Queue] Queueing running scene summary generation');

    // Import queue integration
    const { queueGenerateRunningSummary } = await import('./queueIntegration.js');

    // Queue the running scene summary generation
    const operationId = await queueGenerateRunningSummary();

    if (operationId) {
      log(SUBSYSTEM.RUNNING, '[Queue] Queued running scene summary generation:', operationId);
      toast('Queued running scene summary generation', 'info');
      return null; // Operation will be processed by queue
    }

    // Queue is required. If enqueue failed, abort rather than running directly.
    error(SUBSYSTEM.RUNNING, '[Queue] Failed to enqueue running scene summary generation. Aborting.');
    toast('Queue required: failed to enqueue running scene summary generation. Aborting.', 'error');
    return null;
  }

  // Direct execution path is only used by queue handler (skipQueue=true)
  debug(SUBSYSTEM.RUNNING, `Executing running scene summary generation directly (skipQueue=${String(skipQueue)})`);

  debug(SUBSYSTEM.RUNNING, 'Starting running scene summary generation');

  // Collect scene summary indexes
  const indexes = collect_scene_summary_indexes_for_running();
  const exclude_count = get_settings('running_scene_summary_exclude_latest') || 0;

  if (indexes.length === 0) {
    debug(SUBSYSTEM.RUNNING, 'No scene summaries available for running summary');
    return null;
  }

  debug(SUBSYSTEM.RUNNING, `Found ${indexes.length} scene summaries (excluding latest ${exclude_count})`);

  // Build scene summaries text (extract only 'summary' field, exclude 'lorebooks')
  const scene_summaries_text = buildSceneSummariesText(indexes, chat);

  // Get current running summary if exists
  const current_summary = get_current_running_summary_content();

  // Build prompt with macro replacement
  const template = get_settings('running_scene_summary_prompt') || running_scene_summary_prompt;
  const prefillSetting = get_settings('running_scene_summary_prefill');
  const { prompt, prefill } = processPromptMacros(template, current_summary, scene_summaries_text, prefillSetting);

  // Get connection profile and preset settings
  const running_preset = get_settings('running_scene_summary_completion_preset');
  const running_profile = get_settings('running_scene_summary_connection_profile');
  const include_preset_prompts = get_settings('running_scene_summary_include_preset_prompts');

  // Execute with connection profile/preset switching
  const { withConnectionSettings } = await import('./connectionSettingsManager.js');

  try {
    // Add new version - for bulk generation, track from 0 to last scene index
    const last_scene_idx = indexes.length > 0 ? indexes[indexes.length - 1] : 0;

    const result = await withConnectionSettings(
      running_profile,
      running_preset,
      async () => {
        debug(SUBSYSTEM.RUNNING, 'Sending running scene summary prompt to LLM');

        // Set operation context for ST_METADATA
        const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
        setOperationSuffix(`-0-${last_scene_idx}`);

        try {
          // Generate summary using the configured API
          const summaryResult = await summarize_text(prompt, prefill, include_preset_prompts, running_preset);

          debug(SUBSYSTEM.RUNNING, `Generated running summary (${summaryResult.length} chars)`);

          return summaryResult;
        } finally {
          clearOperationSuffix();
        }
      }
    );

    // Parse JSON response using centralized helper
    const { extractJsonFromResponse } = await import('./utils.js');
    const parsed = extractJsonFromResponse(result, {
      requiredFields: ['summary'],
      context: 'running scene summary generation'
    });

    const version = add_running_summary_version(parsed.summary, indexes.length, exclude_count, 0, last_scene_idx);

    log(SUBSYSTEM.RUNNING, `Created running scene summary version ${version} (0 > ${last_scene_idx})`);

    toast(`Running scene summary updated (v${version})`, 'success');

    return parsed.summary;

  } catch (err) {
    error(SUBSYSTEM.RUNNING, 'Failed to generate running scene summary:', err);
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

  const scene_summary = get_data(message, 'scene_summary_memory');
  if (!scene_summary) {
    error(SUBSYSTEM.RUNNING, `No scene summary at index ${scene_index}`);
    return null;
  }

  const scene_name = get_data(message, 'scene_break_name') || `Scene #${scene_index}`;

  return { message, scene_summary, scene_name };
}

function extractSummaryFromJSON(scene_summary ) {
  let summary_text = scene_summary;

  // Strip markdown code fences if present
  let json_to_parse = scene_summary.trim();
  const code_fence_match = json_to_parse.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (code_fence_match) {
    json_to_parse = code_fence_match[1].trim();
    debug(SUBSYSTEM.RUNNING, `Stripped markdown code fences from scene summary`);
  }

  try {
    const parsed = JSON.parse(json_to_parse);
    if (parsed && typeof parsed === 'object') {
      if (parsed.summary) {
        summary_text = parsed.summary;
        debug(SUBSYSTEM.RUNNING, `Extracted summary field from JSON (${summary_text.length} chars, excluding lorebooks)`);
      } else {
        summary_text = "";
        debug(SUBSYSTEM.RUNNING, `Scene summary is JSON but missing 'summary' property, using empty string`);
      }
    }
  } catch (err) {
    debug(SUBSYSTEM.RUNNING, `Scene summary is not JSON, using as-is: ${err.message}`);
  }

  return summary_text;
}

function buildCombinePrompt(current_summary , scene_summaries_text ) {
  let prompt = get_settings('running_scene_summary_prompt') || running_scene_summary_prompt;

  // Replace macros
  prompt = prompt.replace(/\{\{current_running_summary\}\}/g, current_summary || "");
  prompt = prompt.replace(/\{\{scene_summaries\}\}/g, scene_summaries_text);

  // Handle Handlebars conditionals
  if (current_summary) {
    prompt = prompt.replace(/\{\{#if current_running_summary\}\}/g, '');
    prompt = prompt.replace(/\{\{\/if\}\}/g, '');
  } else {
    prompt = prompt.replace(/\{\{#if current_running_summary\}\}[\s\S]*?\{\{\/if\}\}/g, '');
  }

  // Get prefill if configured
  const prefill = get_settings('running_scene_summary_prefill') || '';

  return { prompt, prefill };
}

async function executeCombineLLMCall(prompt , prefill , scene_name , scene_index ) {
  // Get connection profile and preset settings
  const running_preset = get_settings('running_scene_summary_completion_preset');
  const running_profile = get_settings('running_scene_summary_connection_profile');
  const include_preset_prompts = get_settings('running_scene_summary_include_preset_prompts');

  // Execute with connection profile/preset switching
  const { withConnectionSettings } = await import('./connectionSettingsManager.js');

  return withConnectionSettings(
    running_profile,
    running_preset,
    async () => {
      debug(SUBSYSTEM.RUNNING, `Sending prompt to LLM to combine with ${scene_name}`);

      // Set operation context for ST_METADATA
      const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
      const prev_version = get_running_summary(get_current_running_summary_version());
      const prev_scene_idx = prev_version ? prev_version.new_scene_index : 0;
      setOperationSuffix(`-${prev_scene_idx}-${scene_index}`);

      try {
        const result = await summarize_text(prompt, prefill, include_preset_prompts, running_preset);

        // Parse JSON response using centralized helper
        const { extractJsonFromResponse } = await import('./utils.js');
        const parsed = extractJsonFromResponse(result, {
          requiredFields: ['summary'],
          context: 'running scene summary combine'
        });

        debug(SUBSYSTEM.RUNNING, `Combined running summary with scene (${parsed.summary.length} chars)`);

        return parsed.summary;
      } finally {
        clearOperationSuffix();
      }
    }
  );
}

function storeRunningSummary(result , scene_index , scene_name , _scene_summary ) {
  const prev_version = get_running_summary(get_current_running_summary_version());
  const scene_count = prev_version ? prev_version.scene_count + 1 : 1;
  const exclude_count = get_settings('running_scene_summary_exclude_latest') || 0;

  const prev_scene_idx = prev_version ? prev_version.new_scene_index : 0;
  const new_scene_idx = scene_index;

  const version = add_running_summary_version(result, scene_count, exclude_count, prev_scene_idx, new_scene_idx);

  log(SUBSYSTEM.RUNNING, `Created running summary version ${version} (${prev_scene_idx} > ${new_scene_idx})`);

  // Lorebook processing is intentionally disabled during running summary combination
  // Lorebook extraction is handled per individual scene summary instead
  debug(SUBSYSTEM.RUNNING, 'Skipping lorebook processing during running summary; handled per scene summary');

  toast(`Running summary updated with ${scene_name} (v${version})`, 'success');

  return version;
}

async function combine_scene_with_running_summary(scene_index ) {
  const sceneData = validateCombineRequest(scene_index);
  if (!sceneData) {
    return null;
  }

  const { scene_summary, scene_name } = sceneData;

  debug(SUBSYSTEM.RUNNING, `Combining running summary with scene at index ${scene_index} (${scene_name})`);

  const summary_text = extractSummaryFromJSON(scene_summary);
  const current_summary = get_current_running_summary_content();
  const scene_summaries_text = `[${scene_name}]\n${summary_text}`;

  const { prompt, prefill } = buildCombinePrompt(current_summary, scene_summaries_text);

  try {
    const result = await executeCombineLLMCall(prompt, prefill, scene_name, scene_index);
    storeRunningSummary(result, scene_index, scene_name, scene_summary);
    return result;

  } catch (err) {
    error(SUBSYSTEM.RUNNING, 'Failed to combine scene with running summary:', err);
    throw err;
  }
}

async function auto_generate_running_summary(scene_index  = null) {
  if (!get_settings('running_scene_summary_auto_generate')) {return;}

  debug(SUBSYSTEM.RUNNING, 'Auto-generating running scene summary for scene index:', scene_index);

  // Check if we have any existing versions
  const versions = get_running_summary_versions();
  const hasExistingVersions = versions.length > 0;

  if (hasExistingVersions && scene_index !== null) {
    // Use incremental combine to add this scene to the existing running summary
    debug(SUBSYSTEM.RUNNING, 'Existing running summary found, using incremental combine');
    await combine_scene_with_running_summary(scene_index);
  } else {
    // No existing summary or no scene index provided - do bulk regeneration
    debug(SUBSYSTEM.RUNNING, 'No existing running summary or no scene index, doing bulk regeneration');
    await generate_running_scene_summary();
  }

  // Update UI dropdown if available
  if (typeof window.updateVersionSelector === 'function') {
    window.updateVersionSelector();
    debug(SUBSYSTEM.RUNNING, 'Updated version selector UI');
  }
}

function cleanup_invalid_running_summaries() {
  const ctx = getContext();
  const chat = ctx.chat;
  const storage = get_running_summary_storage();
  const versions = storage.versions || [];

  if (versions.length === 0) {
    debug(SUBSYSTEM.RUNNING, 'No running summary versions to clean up');
    return;
  }

  // Get all valid scene summary indexes
  const valid_scene_indexes = [];
  for (let i = 0; i < chat.length; i++) {
    const msg = chat[i];
    if (get_data(msg, 'scene_summary_memory')) {
      valid_scene_indexes.push(i);
    }
  }

  debug(SUBSYSTEM.RUNNING, `Valid scene indexes: ${valid_scene_indexes.join(', ')}`);

  // Find versions that reference deleted messages
  const versions_to_delete = [];
  for (const version of versions) {
    const new_scene_idx = version.new_scene_index ?? 0;

    // Check if the new_scene_index still exists and has a scene summary
    // If new_scene_idx >= chat.length, the message was deleted
    // If the message exists but has no scene summary, it was deleted or the summary was removed
    if (new_scene_idx >= chat.length || !get_data(chat[new_scene_idx], 'scene_summary_memory')) {
      versions_to_delete.push(version.version);
      debug(SUBSYSTEM.RUNNING, `Version ${version.version} references invalid scene at index ${new_scene_idx}`);
    }
  }

  // Delete invalid versions
  if (versions_to_delete.length > 0) {
    log(SUBSYSTEM.RUNNING, `Cleaning up ${versions_to_delete.length} invalid running summary version(s)`);

    for (const version_num of versions_to_delete) {
      delete_running_summary_version(version_num);
    }

    // After cleanup, if current version was deleted, it will be auto-set to the latest
    // But we should also verify that the new current version is valid
    const current_version = get_current_running_summary_version();
    const current = get_running_summary(current_version);

    if (current && current.new_scene_index >= chat.length) {
      // Current version is still invalid, find the most recent valid one
      const remaining_versions = get_running_summary_versions();
      if (remaining_versions.length > 0) {
        const valid_versions = remaining_versions.filter((v) =>
        v.new_scene_index < chat.length &&
        get_data(chat[v.new_scene_index], 'scene_summary_memory')
        );

        if (valid_versions.length > 0) {
          const latest_valid = valid_versions.reduce((max, v) =>
          v.version > max.version ? v : max
          );
          set_current_running_summary_version(latest_valid.version);
          log(SUBSYSTEM.RUNNING, `Set current version to ${latest_valid.version} after cleanup`);
        }
      }
    }

    toast(`Cleaned up ${versions_to_delete.length} invalid running summary version(s)`, 'info');
  } else {
    debug(SUBSYSTEM.RUNNING, 'No invalid running summary versions found');
  }
}

function get_running_summary_injection() {
  const current = get_running_summary();
  if (!current || !current.content) {
    return "";
  }

  const template = get_settings('running_scene_summary_template') || "";
  if (!template.trim()) {
    // Fallback to simple format
    return current.content;
  }

  return template.replace(/\{\{running_summary\}\}/g, current.content);
}

export {
  get_running_summary_versions,
  get_current_running_summary_version,
  get_running_summary,
  get_current_running_summary_content,
  set_current_running_summary_version,
  add_running_summary_version,
  delete_running_summary_version,
  clear_running_scene_summaries,
  collect_scene_summary_indexes_for_running,
  generate_running_scene_summary,
  combine_scene_with_running_summary,
  auto_generate_running_summary,
  get_running_summary_injection,
  cleanup_invalid_running_summaries };
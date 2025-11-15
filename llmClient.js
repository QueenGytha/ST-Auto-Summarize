// llmClient.js
// LLM client wrapper for ConnectionManagerRequestService

import { getContext } from '../../../extensions.js';
import { injectMetadataIntoChatArray } from './metadataInjector.js';
import { getOperationSuffix } from './operationContext.js';
import { debug, error, SUBSYSTEM, count_tokens, main_api, trimToEndSentence, loadPresetPrompts } from './index.js';

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Complete LLM wrapper
export async function sendLLMRequest(profileId, prompt, operationType, options = {}) {
  if (!profileId || profileId === '') {
    throw new Error('sendLLMRequest requires explicit profileId. Empty string not allowed.');
  }

  const ctx = getContext();

  // 1. TEST OVERRIDE SUPPORT (for mocking in tests)
  if (typeof globalThis !== 'undefined') {
    const override = globalThis.__TEST_RECAP_TEXT_RESPONSE;
    if (typeof override === 'string') {
      debug(SUBSYSTEM.CORE, '[LLMClient] Using test override response');
      return override;
    }
  }

  // 2. VERIFY PROFILE EXISTS
  const profile = ctx.extensionSettings.connectionManager.profiles.find(p => p.id === profileId);
  if (!profile) {
    throw new Error(`Connection Manager profile not found: ${profileId}`);
  }

  debug(SUBSYSTEM.CORE, `[LLMClient] Sending request with profile "${profile.name}" (${profileId}), API type: ${profile.api}, operation: ${operationType}`);
  debug(SUBSYSTEM.CORE, `[LLMClient] Full profile data:`, JSON.stringify(profile, null, 2));

  // 3. LOAD GENERATION PARAMETERS FROM PRESET
  let generationParams = {};

  // Resolve preset: explicit value or empty string (meaning "use current active")
  if (options.preset === undefined || options.preset === null) {
    throw new Error(`FATAL: options.preset is required. Caller must provide completion preset from operation settings (e.g., scene_recap_completion_preset, auto_scene_break_completion_preset).`);
  }

  const { getPresetManager } = await import('../../../preset-manager.js');
  const presetManager = getPresetManager('openai');

  let effectivePresetName;
  if (options.preset === '') {
    // Empty string means "use current active preset"
    effectivePresetName = presetManager?.getSelectedPresetName();

    if (!effectivePresetName) {
      throw new Error(`FATAL: Empty preset setting means "use current active preset", but no preset is currently active in SillyTavern. Either select a preset in SillyTavern or configure an explicit preset in operation settings.`);
    }

    debug(SUBSYSTEM.CORE, `[LLMClient] Empty preset resolved to current active: ${effectivePresetName}`);
  } else {
    // Non-empty string - use explicit preset
    effectivePresetName = options.preset;
  }

  const presetData = presetManager?.getCompletionPresetByName(effectivePresetName);

  if (!presetData) {
    throw new Error(`FATAL: Preset "${effectivePresetName}" not found. Preset must exist and be valid.`);
  }

  generationParams = {
    temperature: presetData.temperature >= 0 ? Number(presetData.temperature) : undefined,
    top_p: presetData.top_p >= 0 ? Number(presetData.top_p) : undefined,
    min_p: presetData.min_p >= 0 ? Number(presetData.min_p) : undefined,
    presence_penalty: presetData.presence_penalty >= 0 ? Number(presetData.presence_penalty) : undefined,
    frequency_penalty: presetData.frequency_penalty >= 0 ? Number(presetData.frequency_penalty) : undefined,
    repetition_penalty: presetData.repetition_penalty >= 0 ? Number(presetData.repetition_penalty) : undefined,
    top_k: presetData.top_k >= 0 ? Number(presetData.top_k) : undefined,
  };
  for (const key of Object.keys(generationParams)) {
    if (generationParams[key] === undefined) {
      delete generationParams[key];
    }
  }

  const presetMaxTokens = presetData.genamt || presetData.openai_max_tokens;
  if (!presetMaxTokens || presetMaxTokens <= 0) {
    throw new Error(`FATAL: Preset "${effectivePresetName}" has no valid max_tokens (genamt or openai_max_tokens). Preset must have max_tokens > 0 configured.`);
  }

  debug(SUBSYSTEM.CORE, `[LLMClient] Loaded generation params from preset "${effectivePresetName}":`, generationParams);
  debug(SUBSYSTEM.CORE, `[LLMClient] Loaded max_tokens from preset: ${presetMaxTokens}`);

  // 4. TOKEN VALIDATION (using profile preset's context size, not global)
  if (typeof prompt === 'string') {
    const tokenSize = count_tokens(prompt);

    // Try to get context size from preset
    const presetMaxContext = presetData.max_context || presetData.openai_max_context;

    if (presetMaxContext && presetMaxContext > 0) {
      // Available context = total context - tokens reserved for response
      const availableContextForPrompt = presetMaxContext - presetMaxTokens;

      if (tokenSize > availableContextForPrompt) {
        throw new Error(`Prompt ${tokenSize} tokens exceeds available context ${availableContextForPrompt} (model context: ${presetMaxContext}, reserved for response: ${presetMaxTokens})`);
      }

      debug(SUBSYSTEM.CORE, `[LLMClient] Token validation passed: ${tokenSize} <= ${availableContextForPrompt} (${presetMaxContext} - ${presetMaxTokens})`);
    } else {
      debug(SUBSYSTEM.CORE, `[LLMClient] Skipping token validation - preset has no max_context configured`);
    }
  }

  // 5. LOAD PRESET PROMPTS + PREFILL (ConnectionManager doesn't do this)
  let messages;
  let effectivePrefill = options.prefill || '';

  debug(SUBSYSTEM.CORE, `[LLMClient] includePreset=${options.includePreset}, preset="${options.preset || effectivePresetName}"`);

  if (options.includePreset) {
    // Load preset messages - use same preset as generation params
    const presetMessages = await loadPresetPrompts(effectivePresetName);

    // Load preset prefill - reuse presetData from above
    const presetPrefill = presetData?.assistant_prefill || '';

    // Prefill priority: explicit option > preset
    effectivePrefill = options.prefill || presetPrefill;

    // Build messages array with preset prompts
    if (typeof prompt === 'string') {
      // Add system prompt for OpenAI if needed
      const systemPrompt = main_api === 'openai'
        ? "You are a data extraction system. Output ONLY valid JSON. Never generate roleplay content."
        : null;

      messages = [
        ...presetMessages,
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ];
    } else {
      // Prompt is already an array - prepend preset messages
      messages = [...presetMessages, ...prompt];
    }
  } else {
    // No preset - simple message construction
    if (typeof prompt === 'string') {
      const systemPrompt = main_api === 'openai'
        ? "You are a data extraction system. Output ONLY valid JSON. Never generate roleplay content."
        : null;

      messages = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }]
        : [{ role: 'user', content: prompt }];
    } else {
      // Prompt is already messages array
      messages = Array.isArray(prompt) ? prompt : [prompt];
    }
  }

  // 6. ADD PREFILL as assistant message (ConnectionManager has no prefill parameter)
  if (effectivePrefill) {
    messages.push({ role: 'assistant', content: effectivePrefill });
  }

  // 7. INJECT METADATA
  const suffix = getOperationSuffix();
  const fullOperation = suffix ? `${operationType}${suffix}` : operationType;
  const messagesWithMetadata = [...messages];
  injectMetadataIntoChatArray(messagesWithMetadata, { operation: fullOperation });

  // 8. CALL ConnectionManager
  // CRITICAL: Always set includePreset=false to prevent ConnectionManager from loading profile's preset
  // We already manually loaded preset messages from the CORRECT preset (effectivePresetName) at lines 116-141
  // If we set includePreset=true, ConnectionManager would load preset messages from the CONNECTION PROFILE's preset,
  // which may be DIFFERENT from the completion preset we want to use (e.g., profile has "momoura-neovorpus" but
  // user selected "bbypwg-claude" for generation). This would result in WRONG preset messages being used.
  debug(SUBSYSTEM.CORE, `[LLMClient] Setting ConnectionManager includePreset=false because we already loaded preset messages from "${effectivePresetName}"`);
  debug(SUBSYSTEM.CORE, `[LLMClient] If includePreset=true, ConnectionManager would load from profile's preset "${profile.preset}" instead, which is WRONG`);
  debug(SUBSYSTEM.CORE, `[LLMClient] Profile preset: "${profile.preset}", Completion preset we're using: "${effectivePresetName}"`);

  try {
    const connectionManagerOptions = {
      stream: options.stream ?? false,
      signal: options.signal ?? null,
      extractData: options.extractData ?? true,
      includePreset: false,  // ALWAYS false - we manually loaded correct preset messages above
      includeInstruct: options.includeInstruct ?? false,
      instructSettings: options.instructSettings || {}
    };

    debug(SUBSYSTEM.CORE, `[LLMClient] ConnectionManager options: includePreset=${connectionManagerOptions.includePreset}, messages.length=${messagesWithMetadata.length}`);
    debug(SUBSYSTEM.CORE, `[LLMClient] Total tokens being sent: ${count_tokens(JSON.stringify(messagesWithMetadata))}`);

    const result = await ctx.ConnectionManagerRequestService.sendRequest(
      profileId,
      messagesWithMetadata,
      presetMaxTokens,
      connectionManagerOptions,
      { ...generationParams, ...options.overridePayload }
    );

    // DEBUG: Log raw response structure
    const DEBUG_PREVIEW_LENGTH = 100;
    debug(SUBSYSTEM.CORE, `[LLMClient] Raw response type: ${typeof result}`);
    if (result && typeof result === 'object') {
      debug(SUBSYSTEM.CORE, `[LLMClient] Response keys: ${Object.keys(result).join(', ')}`);
      debug(SUBSYSTEM.CORE, `[LLMClient] Response.content: ${typeof result.content} = ${JSON.stringify(result.content)?.slice(0, DEBUG_PREVIEW_LENGTH)}`);
      if ('reasoning' in result) {
        debug(SUBSYSTEM.CORE, `[LLMClient] Response.reasoning: ${typeof result.reasoning} = ${JSON.stringify(result.reasoning)?.slice(0, DEBUG_PREVIEW_LENGTH)}`);
      }
      if ('text' in result) {
        debug(SUBSYSTEM.CORE, `[LLMClient] Response.text: ${typeof result.text} = ${JSON.stringify(result.text)?.slice(0, DEBUG_PREVIEW_LENGTH)}`);
      }
      if ('response' in result) {
        debug(SUBSYSTEM.CORE, `[LLMClient] Response.response: ${typeof result.response} = ${JSON.stringify(result.response)?.slice(0, DEBUG_PREVIEW_LENGTH)}`);
      }
      if ('message' in result) {
        debug(SUBSYSTEM.CORE, `[LLMClient] Response.message: ${typeof result.message} = ${JSON.stringify(result.message)?.slice(0, DEBUG_PREVIEW_LENGTH)}`);
      }
    } else if (typeof result === 'string') {
      debug(SUBSYSTEM.CORE, `[LLMClient] Response string length: ${result.length}, preview: ${result.slice(0, DEBUG_PREVIEW_LENGTH)}`);
    }

    // 9. NORMALIZE RESPONSE FORMAT
    // ConnectionManager with reasoning returns {content, reasoning}
    // Normalize to always return string content
    let finalResult = result;
    if (finalResult && typeof finalResult === 'object' && 'content' in finalResult) {
      finalResult = finalResult.content || '';
      debug(SUBSYSTEM.CORE, `[LLMClient] Extracted content from object response (reasoning was included)`);
    }

    // 10. SENTENCE TRIMMING (if enabled in ST settings)
    if (options.trimSentences !== false && typeof finalResult === 'string') {
      if (ctx.powerUserSettings.trim_sentences) {
        finalResult = trimToEndSentence(finalResult);
        debug(SUBSYSTEM.CORE, `[LLMClient] Trimmed result to complete sentence`);
      }
    }

    debug(SUBSYSTEM.CORE, `[LLMClient] Request completed successfully for operation: ${operationType}`);
    return finalResult;
  } catch (err) {
    error(SUBSYSTEM.CORE, `[LLMClient] Request failed for operation ${operationType}:`, err);
    error(SUBSYSTEM.CORE, `[LLMClient] Profile being used: "${profile.name}" (ID: ${profileId}, API: ${profile.api})`);

    // Enhanced error for API type mismatches (common issue with stale profile data)
    if (err.message && (err.message.includes('is not supported') || err.message.includes('API type'))) {
      const enhancedError = new Error(
        `Profile "${profile.name}" has API type "${profile.api}" which failed. ` +
        `This profile's data may be stale/corrupted (common on mobile browsers). ` +
        `Fix: Delete this profile in ConnectionManager settings and recreate it from scratch. ` +
        `Original error: ${err.message}`
      );
      enhancedError.originalError = err;
      throw enhancedError;
    }

    throw err;
  }
}

export function getConnectionManagerProfileId(profileName) {
  const ctx = getContext();
  const profiles = ctx.extensionSettings.connectionManager?.profiles || [];
  const profile = profiles.find(p => p.name === profileName);
  return profile?.id || null;
}

export function resolveProfileSettings(profileId) {
  if (!profileId || profileId === '') {return null;}

  const ctx = getContext();
  const profile = ctx.extensionSettings.connectionManager?.profiles?.find(p => p.id === profileId);
  if (!profile) {
    throw new Error(`Connection Manager profile not found: ${profileId}`);
  }
  return profile;
}

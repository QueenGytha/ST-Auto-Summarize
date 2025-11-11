// llmClient.js
// LLM client wrapper for ConnectionManagerRequestService

import { getContext } from '../../../extensions.js';
import { injectMetadataIntoChatArray } from './metadataInjector.js';
import { getOperationSuffix } from './operationContext.js';
import { debug, error, SUBSYSTEM, count_tokens, get_context_size, main_api, trimToEndSentence, loadPresetPrompts, get_current_preset } from './index.js';
import { DEFAULT_MAX_TOKENS } from './constants.js';

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

  // 2. TOKEN VALIDATION
  if (typeof prompt === 'string') {
    const tokenSize = count_tokens(prompt);
    const contextSize = get_context_size();
    if (tokenSize > contextSize) {
      throw new Error(`Prompt ${tokenSize} tokens exceeds context size ${contextSize}`);
    }
  }

  // 3. VERIFY PROFILE EXISTS
  const profile = ctx.extensionSettings.connectionManager.profiles.find(p => p.id === profileId);
  if (!profile) {
    throw new Error(`Connection Manager profile not found: ${profileId}`);
  }

  debug(SUBSYSTEM.CORE, `[LLMClient] Sending request with profile "${profile.name}" (${profileId}), operation: ${operationType}`);

  // 4. LOAD GENERATION PARAMETERS FROM PROFILE PRESET
  let generationParams = {};
  if (profile.preset) {
    const { getPresetManager } = await import('../../../preset-manager.js');
    const presetManager = getPresetManager('openai');
    const presetData = presetManager?.getCompletionPresetByName(profile.preset);
    if (presetData) {
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
      debug(SUBSYSTEM.CORE, `[LLMClient] Loaded generation params from preset "${profile.preset}":`, generationParams);
    }
  }

  // 5. LOAD PRESET PROMPTS + PREFILL (ConnectionManager doesn't do this)
  let messages;
  let effectivePrefill = options.prefill || '';

  if (options.includePreset && options.preset) {
    // Load preset messages
    const presetName = options.preset || get_current_preset();
    const presetMessages = await loadPresetPrompts(presetName);

    // Load preset prefill
    const { getPresetManager } = await import('../../../preset-manager.js');
    const presetManager = getPresetManager('openai');
    const presetData = presetManager?.getCompletionPresetByName(presetName);
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

  // 5. ADD PREFILL as assistant message (ConnectionManager has no prefill parameter)
  if (effectivePrefill) {
    messages.push({ role: 'assistant', content: effectivePrefill });
  }

  // 6. INJECT METADATA
  const suffix = getOperationSuffix();
  const fullOperation = suffix ? `${operationType}${suffix}` : operationType;
  const messagesWithMetadata = [...messages];
  injectMetadataIntoChatArray(messagesWithMetadata, { operation: fullOperation });

  // 7. CALL ConnectionManager
  try {
    const result = await ctx.ConnectionManagerRequestService.sendRequest(
      profileId,
      messagesWithMetadata,
      options.maxTokens || DEFAULT_MAX_TOKENS,
      {
        stream: options.stream ?? false,
        signal: options.signal ?? null,
        extractData: options.extractData ?? true,
        includePreset: options.includePreset ?? Boolean(options.preset),
        includeInstruct: options.includeInstruct ?? false,
        instructSettings: options.instructSettings || {}
      },
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

    // 9. SENTENCE TRIMMING (if enabled in ST settings)
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

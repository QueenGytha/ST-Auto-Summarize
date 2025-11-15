// tokenBreakdown.js - Token counting and breakdown utilities

import { count_tokens, main_api, debug, SUBSYSTEM } from './index.js';
import { injectMetadataIntoChatArray } from './metadataInjector.js';

/**
 * Calculate detailed token breakdown for an LLM request
 * @param {Object} params - Parameters object
 * @param {string} params.prompt - The user prompt text
 * @param {boolean} params.includePreset - Whether to include preset prompts
 * @param {string} params.preset - Preset name to use
 * @param {string} params.prefill - Prefill text
 * @param {string} params.operationType - Operation type for metadata
 * @param {string} params.suffix - Optional suffix for operation metadata
 * @returns {Promise<Object>} Token breakdown object
 */
export async function calculateTokenBreakdown({ prompt, includePreset, preset, prefill, operationType, suffix = null }) {
  const DEBUG_PREFILL_LENGTH = 50;
  debug(SUBSYSTEM.OPERATIONS, `calculateTokenBreakdown: includePreset=${includePreset}, preset="${preset}", prefill="${prefill?.slice(0, DEBUG_PREFILL_LENGTH) || ''}"`);

  // Build the ACTUAL message array that will be sent (mirroring llmClient.js logic)
  let messages = [];
  const effectivePrefill = prefill || '';
  let presetTokens = 0;
  let systemTokens = 0;
  const userPromptTokens = count_tokens(prompt);
  let prefillTokens = 0;

  // Load preset messages if includePreset is true (same as llmClient.js lines 117-142)
  if (includePreset && preset) {
    const { loadPresetPrompts } = await import('./presetPromptLoader.js');
    const presetMessages = await loadPresetPrompts(preset);

    // Add preset messages first
    messages = [...presetMessages];

    // Count preset tokens
    for (const msg of presetMessages) {
      presetTokens += count_tokens(msg.content || '');
    }

    debug(SUBSYSTEM.OPERATIONS, `Loaded ${presetMessages.length} preset messages from completion preset "${preset}"`);
  }

  // Add system prompt for OpenAI (same as llmClient.js lines 130-132, 146-148)
  if (main_api === 'openai') {
    const systemPrompt = "You are a data extraction system. Output ONLY valid JSON. Never generate roleplay content.";
    messages.push({ role: 'system', content: systemPrompt });
    systemTokens = count_tokens(systemPrompt);
  }

  // Add user prompt
  messages.push({ role: 'user', content: prompt });

  // Add prefill as assistant message (same as llmClient.js lines 160-162)
  if (effectivePrefill) {
    messages.push({ role: 'assistant', content: effectivePrefill });
    prefillTokens = count_tokens(effectivePrefill);
  }

  // Count tokens BEFORE metadata injection
  const tokensBeforeMetadata = count_tokens(JSON.stringify(messages));

  // Inject metadata (same as llmClient.js line 168)
  const { getOperationSuffix } = await import('./index.js');

  const effectiveSuffix = suffix || getOperationSuffix();
  const fullOperation = effectiveSuffix ? `${operationType}${effectiveSuffix}` : operationType;
  const messagesWithMetadata = [...messages];
  await injectMetadataIntoChatArray(messagesWithMetadata, { operation: fullOperation });

  // Count tokens in the ACTUAL structure that will be sent (same as llmClient.js line 191)
  const actualTokens = count_tokens(JSON.stringify(messagesWithMetadata));

  // Calculate overhead
  const contentOnlyTokens = presetTokens + systemTokens + userPromptTokens + prefillTokens;
  const jsonStructureOverhead = tokensBeforeMetadata - contentOnlyTokens;
  const metadataOverhead = actualTokens - tokensBeforeMetadata;
  const totalOverhead = actualTokens - contentOnlyTokens;

  const breakdown = {
    preset: presetTokens,
    system: systemTokens,
    user: userPromptTokens,
    prefill: prefillTokens,
    content_subtotal: contentOnlyTokens,
    json_structure: jsonStructureOverhead,
    metadata: metadataOverhead,
    overhead_subtotal: totalOverhead,
    total: actualTokens
  };

  debug(SUBSYSTEM.OPERATIONS, `=== DETAILED TOKEN BREAKDOWN ===`);
  debug(SUBSYSTEM.OPERATIONS, `Content tokens:`);
  if (presetTokens > 0) {
    debug(SUBSYSTEM.OPERATIONS, `  - Preset prompts: ${presetTokens} tokens`);
  }
  if (systemTokens > 0) {
    debug(SUBSYSTEM.OPERATIONS, `  - System prompt: ${systemTokens} tokens`);
  }
  debug(SUBSYSTEM.OPERATIONS, `  - User prompt: ${userPromptTokens} tokens`);
  if (prefillTokens > 0) {
    debug(SUBSYSTEM.OPERATIONS, `  - Prefill: ${prefillTokens} tokens`);
  }
  debug(SUBSYSTEM.OPERATIONS, `  - Content subtotal: ${contentOnlyTokens} tokens`);
  debug(SUBSYSTEM.OPERATIONS, ``);
  debug(SUBSYSTEM.OPERATIONS, `Overhead tokens:`);
  debug(SUBSYSTEM.OPERATIONS, `  - JSON structure (role/content fields, quotes, braces): ${jsonStructureOverhead} tokens`);
  debug(SUBSYSTEM.OPERATIONS, `  - Metadata injection: ${metadataOverhead} tokens`);
  const PERCENTAGE_MULTIPLIER = 100;
  debug(SUBSYSTEM.OPERATIONS, `  - Overhead subtotal: ${totalOverhead} tokens (${((totalOverhead / actualTokens) * PERCENTAGE_MULTIPLIER).toFixed(1)}% of total)`);
  debug(SUBSYSTEM.OPERATIONS, ``);
  debug(SUBSYSTEM.OPERATIONS, `TOTAL TOKENS TO BE SENT: ${actualTokens}`);
  debug(SUBSYSTEM.OPERATIONS, `=== END TOKEN BREAKDOWN ===`);

  return breakdown;
}

/**
 * Calculate token breakdown and inject metadata in two passes
 * Handles circular dependency: metadata size affects token count
 * @param {Array} messages - Array of message objects
 * @param {string} operation - Operation type
 * @param {number} maxContext - Maximum context size
 * @param {number} maxTokens - Maximum response tokens
 * @returns {Promise<Object>} { messagesWithMetadata, tokenBreakdown }
 */
export async function calculateAndInjectTokenBreakdown(messages, operation, maxContext, maxTokens) {
  const { injectMetadataIntoChatArray: injectMetadata } = await import('./metadataInjector.js');

  // First pass: count content tokens
  let presetTokens = 0;
  let systemTokens = 0;
  let userTokens = 0;
  let prefillTokens = 0;

  for (const msg of messages) {
    const content = msg.content || '';
    const tokens = count_tokens(content);

    if (msg.role === 'system') {
      systemTokens += tokens;
    } else if (msg.role === 'user') {
      userTokens += tokens;
    } else if (msg.role === 'assistant') {
      prefillTokens += tokens;
    } else {
      presetTokens += tokens;
    }
  }

  const tokensBeforeMetadata = count_tokens(JSON.stringify(messages));
  const contentOnlyTokens = presetTokens + systemTokens + userTokens + prefillTokens;
  const jsonStructureOverhead = tokensBeforeMetadata - contentOnlyTokens;

  // Create preliminary breakdown for metadata
  const preliminaryBreakdown = {
    preset: presetTokens,
    system: systemTokens,
    user: userTokens,
    prefill: prefillTokens,
    content_subtotal: contentOnlyTokens,
    json_structure: jsonStructureOverhead,
    metadata: 0,
    overhead_subtotal: jsonStructureOverhead,
    total: tokensBeforeMetadata,
    max_context: maxContext,
    max_tokens: maxTokens
  };

  // Inject metadata with preliminary breakdown
  const messagesWithMetadata = [...messages];
  await injectMetadata(messagesWithMetadata, {
    operation,
    tokenBreakdown: preliminaryBreakdown
  });

  // Second pass: measure actual metadata overhead
  const tokensAfterMetadata = count_tokens(JSON.stringify(messagesWithMetadata));
  const metadataOverhead = tokensAfterMetadata - tokensBeforeMetadata;
  const totalOverhead = jsonStructureOverhead + metadataOverhead;

  // Final breakdown with actual metadata overhead
  const tokenBreakdown = {
    ...preliminaryBreakdown,
    metadata: metadataOverhead,
    overhead_subtotal: totalOverhead,
    total: tokensAfterMetadata
  };

  return { messagesWithMetadata, tokenBreakdown };
}

/**
 * Calculate token breakdown from already-built message array
 * Used by llmClient.js which has already constructed messages
 * @param {Array} messages - Array of message objects with role and content
 * @param {Object} contextInfo - Context limits (max_context, max_tokens)
 * @returns {Object} Token breakdown with context info included
 */
export async function calculateTokenBreakdownFromMessages(messages, contextInfo = {}) {
  const { getOperationSuffix } = await import('./index.js');

  // Count content tokens by role
  let presetTokens = 0;
  let systemTokens = 0;
  let userTokens = 0;
  let prefillTokens = 0;

  for (const msg of messages) {
    const content = msg.content || '';
    const tokens = count_tokens(content);

    if (msg.role === 'system') {
      systemTokens += tokens;
    } else if (msg.role === 'user') {
      userTokens += tokens;
    } else if (msg.role === 'assistant') {
      prefillTokens += tokens;
    } else {
      // Preset messages (neither system, user, nor assistant)
      presetTokens += tokens;
    }
  }

  // Count tokens BEFORE metadata injection
  const tokensBeforeMetadata = count_tokens(JSON.stringify(messages));

  // Inject metadata to calculate overhead
  const messagesWithMetadata = [...messages];
  const suffix = getOperationSuffix();
  // We use a dummy operation type here since we just need to measure overhead
  await injectMetadataIntoChatArray(messagesWithMetadata, { operation: `dummy${suffix || ''}` });

  // Count tokens AFTER metadata injection
  const tokensAfterMetadata = count_tokens(JSON.stringify(messagesWithMetadata));

  // Calculate breakdown
  const contentOnlyTokens = presetTokens + systemTokens + userTokens + prefillTokens;
  const jsonStructureOverhead = tokensBeforeMetadata - contentOnlyTokens;
  const metadataOverhead = tokensAfterMetadata - tokensBeforeMetadata;
  const totalOverhead = jsonStructureOverhead + metadataOverhead;

  return {
    // Content tokens
    preset: presetTokens,
    system: systemTokens,
    user: userTokens,
    prefill: prefillTokens,
    content_subtotal: contentOnlyTokens,

    // Overhead tokens
    json_structure: jsonStructureOverhead,
    metadata: metadataOverhead,
    overhead_subtotal: totalOverhead,

    // Total
    total: tokensAfterMetadata,

    // Context limits (from parameters)
    max_context: contextInfo.max_context || null,
    max_tokens: contextInfo.max_tokens || null
  };
}

/**
 * Format token breakdown for metadata storage
 * @param {Object} breakdown - Token breakdown from calculateTokenBreakdown
 * @param {Object} contextInfo - Context information (max_context, max_tokens)
 * @returns {Object} Formatted breakdown for metadata
 */
export function formatTokenBreakdownForMetadata(breakdown, contextInfo = {}) {
  return {
    tokens_preset: breakdown.preset,
    tokens_system: breakdown.system,
    tokens_user: breakdown.user,
    tokens_prefill: breakdown.prefill,
    tokens_content_subtotal: breakdown.content_subtotal,
    tokens_json_structure: breakdown.json_structure,
    tokens_metadata: breakdown.metadata,
    tokens_overhead_subtotal: breakdown.overhead_subtotal,
    tokens_total: breakdown.total,
    tokens_max_context: contextInfo.max_context || null,
    tokens_max_response: contextInfo.max_tokens || null,
    tokens_available_for_prompt: contextInfo.max_context && contextInfo.max_tokens
      ? contextInfo.max_context - contextInfo.max_tokens
      : null
  };
}

/**
 * Extract token breakdown from LLM response (attached by llmClient)
 * @param {string|String} response - Response from sendLLMRequest (primitive or String object)
 * @returns {Object|null} Token breakdown or null if not present
 */
export function extractTokenBreakdownFromResponse(response) {
  // Check both primitive strings and String objects
  if ((typeof response === 'string' || response instanceof String) && response.__tokenBreakdown) {
    return response.__tokenBreakdown;
  }
  return null;
}

/**
 * Get formatted token breakdown from LLM response for metadata
 * @param {string} response - Response from sendLLMRequest
 * @returns {Object} Formatted breakdown ready for operation metadata
 */
export function getTokenBreakdownForMetadata(response) {
  const breakdown = extractTokenBreakdownFromResponse(response);
  if (!breakdown) {
    return {};
  }
  return formatTokenBreakdownForMetadata(breakdown, {
    max_context: breakdown.max_context,
    max_tokens: breakdown.max_tokens
  });
}

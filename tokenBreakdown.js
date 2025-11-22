// tokenBreakdown.js - Token counting and breakdown utilities

import { count_tokens, main_api, debug, SUBSYSTEM, get_settings } from './index.js';
import { injectMetadataIntoChatArray } from './metadataInjector.js';

// Performance optimization: Cache preset and system prompt tokens to avoid recounting
const presetTokenCache = new Map();
const systemPromptTokenCache = new Map();

/**
 * Apply tokenizer correction factor to adjust for discrepancies between ST and actual LLM tokenizers
 * ST uses tokenizer approximations that may undercount or overcount vs actual provider tokenizers
 * @param {number} rawCount - Raw token count from ST's count_tokens
 * @returns {number} Corrected token count
 */
function applyCorrectionFactor(rawCount) {
  const correctionFactor = get_settings('tokenizer_correction_factor') || 1.0;

  // If factor is 1.0, no correction needed
  if (correctionFactor === 1.0) {
    return rawCount;
  }

  const corrected = Math.ceil(rawCount * correctionFactor);
  debug(SUBSYSTEM.CORE, `[TokenCorrection] Applied ${correctionFactor}x correction: ${rawCount} → ${corrected} tokens`);

  return corrected;
}

/**
 * Log detailed token breakdown to console
 * @param {Object} options - Logging options
 * @param {Object} options.breakdown - Token breakdown object
 * @param {number} options.actualTokensRaw - Raw token count before correction
 * @param {number} options.actualTokens - Corrected token count
 * @param {number} options.contentOnlyTokens - Content tokens only
 * @param {number} options.totalOverhead - Total overhead tokens
 * @param {Array} options.messageBreakdown - Optional per-message breakdown
 * @param {Array} options.lorebookBreakdown - Optional per-lorebook-entry breakdown
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- Comprehensive logging requires many conditionals
function logTokenBreakdown({ breakdown, actualTokensRaw, actualTokens, contentOnlyTokens, totalOverhead, messageBreakdown = null, lorebookBreakdown = null }) {
  debug(SUBSYSTEM.OPERATIONS, `=== DETAILED TOKEN BREAKDOWN ===`);
  debug(SUBSYSTEM.OPERATIONS, `Content tokens:`);
  if (breakdown.preset > 0) {
    debug(SUBSYSTEM.OPERATIONS, `  - Preset prompts: ${breakdown.preset.toLocaleString()} tokens`);
  }
  if (breakdown.system > 0) {
    debug(SUBSYSTEM.OPERATIONS, `  - System prompt: ${breakdown.system.toLocaleString()} tokens`);
  }
  debug(SUBSYSTEM.OPERATIONS, `  - User prompt (template): ${breakdown.user.toLocaleString()} tokens`);
  if (breakdown.messages !== null && breakdown.messages > 0) {
    const messageCountInfo = messageBreakdown ? ` (${messageBreakdown.length} messages)` : '';
    debug(SUBSYSTEM.OPERATIONS, `  - Embedded messages: ${breakdown.messages.toLocaleString()} tokens${messageCountInfo}`);

    // Show individual message breakdown
    if (messageBreakdown && messageBreakdown.length > 0) {
      debug(SUBSYSTEM.OPERATIONS, `    Per-message breakdown:`);

      for (const msg of messageBreakdown) {
        const msgLabel = msg.type === 'recap' ? 'RECAP' : `#${msg.index}`;
        const MAX_PREVIEW_LENGTH = 60;
        const preview = msg.preview.length > MAX_PREVIEW_LENGTH
          ? `${msg.preview.slice(0, MAX_PREVIEW_LENGTH)}...`
          : msg.preview;
        debug(SUBSYSTEM.OPERATIONS, `      ${msgLabel}: ${msg.tokens.toLocaleString()} tokens - "${preview}"`);
      }
    }
  }
  if (breakdown.lorebooks !== null && breakdown.lorebooks > 0) {
    const lorebookCountInfo = lorebookBreakdown ? ` (${lorebookBreakdown.length} entries)` : '';
    debug(SUBSYSTEM.OPERATIONS, `  - Embedded lorebooks: ${breakdown.lorebooks.toLocaleString()} tokens${lorebookCountInfo}`);

    // Show individual lorebook breakdown
    if (lorebookBreakdown && lorebookBreakdown.length > 0) {
      debug(SUBSYSTEM.OPERATIONS, `    Per-entry breakdown:`);

      for (const entry of lorebookBreakdown) {
        const MAX_PREVIEW_LENGTH = 60;
        const preview = entry.preview.length > MAX_PREVIEW_LENGTH
          ? `${entry.preview.slice(0, MAX_PREVIEW_LENGTH)}...`
          : entry.preview;
        debug(SUBSYSTEM.OPERATIONS, `      ${entry.name} (UID:${entry.uid}): ${entry.tokens.toLocaleString()} tokens - "${preview}"`);
      }
    }
  }
  if (breakdown.prefill > 0) {
    debug(SUBSYSTEM.OPERATIONS, `  - Prefill: ${breakdown.prefill.toLocaleString()} tokens`);
  }
  debug(SUBSYSTEM.OPERATIONS, `  - Content subtotal: ${contentOnlyTokens.toLocaleString()} tokens`);
  debug(SUBSYSTEM.OPERATIONS, ``);
  debug(SUBSYSTEM.OPERATIONS, `Overhead tokens:`);
  debug(SUBSYSTEM.OPERATIONS, `  - JSON structure (role/content fields, quotes, braces): ${breakdown.json_structure.toLocaleString()} tokens`);
  debug(SUBSYSTEM.OPERATIONS, `  - Metadata injection: ${breakdown.metadata.toLocaleString()} tokens`);
  const PERCENTAGE_MULTIPLIER = 100;
  debug(SUBSYSTEM.OPERATIONS, `  - Overhead subtotal: ${totalOverhead.toLocaleString()} tokens (${((totalOverhead / actualTokens) * PERCENTAGE_MULTIPLIER).toFixed(1)}% of total)`);
  debug(SUBSYSTEM.OPERATIONS, ``);
  debug(SUBSYSTEM.OPERATIONS, `TOTAL TOKENS TO BE SENT: ${actualTokens.toLocaleString()}`);
  debug(SUBSYSTEM.OPERATIONS, ``);
  debug(SUBSYSTEM.OPERATIONS, `Sanity check:`);
  debug(SUBSYSTEM.OPERATIONS, `  - Content + Overhead = ${(contentOnlyTokens + totalOverhead).toLocaleString()}`);
  debug(SUBSYSTEM.OPERATIONS, `  - Actual (before correction) = ${actualTokensRaw.toLocaleString()}`);
  debug(SUBSYSTEM.OPERATIONS, `  - Actual (after ${actualTokensRaw !== actualTokens ? `${(actualTokens / actualTokensRaw).toFixed(2)}x correction` : 'no correction'}) = ${actualTokens.toLocaleString()}`);
  const discrepancy = actualTokensRaw - (contentOnlyTokens + totalOverhead);
  if (Math.abs(discrepancy) > 1) {
    debug(SUBSYSTEM.OPERATIONS, `  - ⚠️ DISCREPANCY: ${discrepancy.toLocaleString()} tokens (calculation may be incorrect)`);
  } else {
    debug(SUBSYSTEM.OPERATIONS, `  - ✓ Calculation verified (discrepancy: ${discrepancy} tokens)`);
  }
  debug(SUBSYSTEM.OPERATIONS, `=== END TOKEN BREAKDOWN ===`);
}

/**
 * Calculate detailed token breakdown for an LLM request
 * @param {Object} params - Parameters object
 * @param {string} params.prompt - The user prompt text
 * @param {boolean} params.includePreset - Whether to include preset prompts
 * @param {string} params.preset - Preset name to use
 * @param {string} params.prefill - Prefill text
 * @param {string} params.operationType - Operation type for metadata
 * @param {string} params.suffix - Optional suffix for operation metadata
 * @param {number} params.messagesTokenCount - Optional: Token count for embedded chat messages
 * @param {number} params.lorebooksTokenCount - Optional: Token count for embedded lorebooks
 * @param {Array<{index: number, tokens: number, preview: string}>} params.messageBreakdown - Optional: Individual message token counts
 * @param {Array<{name: string, uid: number, tokens: number, preview: string}>} params.lorebookBreakdown - Optional: Individual lorebook entry token counts
 * @returns {Promise<Object>} Token breakdown object
 */
// eslint-disable-next-line complexity -- Token breakdown requires conditional logic for preset/system/messages/lorebooks/prefill
export async function calculateTokenBreakdown({ prompt, includePreset, preset, prefill, operationType, suffix = null, messagesTokenCount = null, lorebooksTokenCount = null, messageBreakdown = null, lorebookBreakdown = null }) {
  const DEBUG_PREFILL_LENGTH = 50;
  debug(SUBSYSTEM.OPERATIONS, `calculateTokenBreakdown: includePreset=${includePreset}, preset="${preset}", prefill="${prefill?.slice(0, DEBUG_PREFILL_LENGTH) || ''}"`);

  // Build the ACTUAL message array that will be sent (mirroring llmClient.js logic)
  let messages = [];
  const effectivePrefill = prefill || '';
  let presetTokens = 0;
  let systemTokens = 0;
  const userPromptTotalTokens = count_tokens(prompt);

  // Separate user prompt into components:
  // - Template/prompt text (user prompt minus embedded messages/lorebooks)
  // - Embedded chat messages
  // - Embedded lorebooks
  const embeddedTokens = (messagesTokenCount || 0) + (lorebooksTokenCount || 0);
  const userPromptTokens = userPromptTotalTokens - embeddedTokens;
  let prefillTokens = 0;

  // Load preset messages if includePreset is true (same as llmClient.js lines 117-142)
  if (includePreset && preset) {
    // Check cache first
    const cacheKey = preset;
    if (presetTokenCache.has(cacheKey)) {
      const cached = presetTokenCache.get(cacheKey);
      messages = [...cached.presetMessages];
      presetTokens = cached.presetTokens;
      debug(SUBSYSTEM.OPERATIONS, `Using cached preset messages for "${preset}" (${presetTokens} tokens)`);
    } else {
      const { loadPresetPrompts } = await import('./presetPromptLoader.js');
      const presetMessages = await loadPresetPrompts(preset);

      // Add preset messages first
      messages = [...presetMessages];

      // Count preset tokens
      for (const msg of presetMessages) {
        presetTokens += count_tokens(msg.content || '');
      }

      // Cache for future use
      presetTokenCache.set(cacheKey, { presetMessages, presetTokens });

      debug(SUBSYSTEM.OPERATIONS, `Loaded ${presetMessages.length} preset messages from completion preset "${preset}" (${presetTokens} tokens, cached)`);
    }
  }

  // Add system prompt for OpenAI (same as llmClient.js lines 130-132, 146-148)
  if (main_api === 'openai') {
    const systemPrompt = "You are a data extraction system. Output ONLY valid JSON. Never generate roleplay content.";

    // Check cache first
    const cacheKey = 'openai_system_prompt';
    if (systemPromptTokenCache.has(cacheKey)) {
      systemTokens = systemPromptTokenCache.get(cacheKey);
    } else {
      systemTokens = count_tokens(systemPrompt);
      systemPromptTokenCache.set(cacheKey, systemTokens);
    }

    messages.push({ role: 'system', content: systemPrompt });
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
  const actualTokensRaw = count_tokens(JSON.stringify(messagesWithMetadata));

  // Apply correction factor for Claude tokenizer discrepancy
  const actualTokens = applyCorrectionFactor(actualTokensRaw);

  // Calculate overhead
  const embeddedTokensTotal = (messagesTokenCount || 0) + (lorebooksTokenCount || 0);
  const contentOnlyTokens = presetTokens + systemTokens + userPromptTokens + embeddedTokensTotal + prefillTokens;
  const jsonStructureOverhead = tokensBeforeMetadata - contentOnlyTokens;
  const metadataOverhead = actualTokensRaw - tokensBeforeMetadata;
  const totalOverhead = jsonStructureOverhead + metadataOverhead;

  const breakdown = {
    preset: presetTokens,
    system: systemTokens,
    user: userPromptTokens,
    prefill: prefillTokens,
    lorebooks: lorebooksTokenCount,
    messages: messagesTokenCount,
    content_subtotal: contentOnlyTokens,
    json_structure: jsonStructureOverhead,
    metadata: metadataOverhead,
    overhead_subtotal: totalOverhead,
    total: actualTokens,
    st_raw_count: actualTokensRaw // Include raw count for comparison
  };

  logTokenBreakdown({ breakdown, actualTokensRaw, actualTokens, contentOnlyTokens, totalOverhead, messageBreakdown, lorebookBreakdown });

  return breakdown;
}

/**
 * Calculate token breakdown and inject metadata in two passes
 * Handles circular dependency: metadata size affects token count
 * @param {Array} messages - Array of message objects
 * @param {string} operation - Operation type
 * @param {number} maxContext - Maximum context size
 * @param {number} maxTokens - Maximum response tokens
 * @param {Object} options - Optional parameters
 * @param {number} options.messagesTokenCount - Token count for embedded chat messages
 * @param {number} options.lorebooksTokenCount - Token count for embedded lorebooks
 * @returns {Promise<Object>} { messagesWithMetadata, tokenBreakdown }
 */
export async function calculateAndInjectTokenBreakdown(messages, operation, maxContext, maxTokens, options = {}) {
  const { messagesTokenCount = null, lorebooksTokenCount = null, messageBreakdown = null, lorebookBreakdown = null } = options;
  const { injectMetadataIntoChatArray: injectMetadata } = await import('./metadataInjector.js');

  // First pass: count content tokens
  let presetTokens = 0;
  let systemTokens = 0;
  let userTokensTotalRaw = 0;
  let prefillTokens = 0;

  for (const msg of messages) {
    const content = msg.content || '';
    const tokens = count_tokens(content);

    if (msg.role === 'system') {
      systemTokens += tokens;
    } else if (msg.role === 'user') {
      userTokensTotalRaw += tokens;
    } else if (msg.role === 'assistant') {
      prefillTokens += tokens;
    } else {
      presetTokens += tokens;
    }
  }

  // Separate user tokens into: template text vs embedded messages/lorebooks
  const embeddedTokens = (messagesTokenCount || 0) + (lorebooksTokenCount || 0);
  const userTokens = userTokensTotalRaw - embeddedTokens;

  const tokensBeforeMetadata = count_tokens(JSON.stringify(messages));
  const contentOnlyTokens = presetTokens + systemTokens + userTokensTotalRaw + prefillTokens;
  const jsonStructureOverhead = tokensBeforeMetadata - contentOnlyTokens;

  // Create preliminary breakdown for metadata
  const preliminaryBreakdown = {
    preset: presetTokens,
    system: systemTokens,
    user: userTokens,
    prefill: prefillTokens,
    lorebooks: lorebooksTokenCount,
    messages: messagesTokenCount,
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

  // Extract base operation type from full operation string (e.g., "detect_scene_break-0-45" -> "detect_scene_break")
  // Map operation types to their config keys
  const operationTypeMap = {
    'detect_scene_break': 'auto_scene_break',
    'scene_recap': 'scene_recap',
    'running_scene_recap': 'running_scene_recap',
    'recap_merge': 'auto_lorebooks_recap_merge',
    'lorebook_entry_lookup': 'auto_lorebooks_recap_lorebook_entry_lookup',
    'lorebook_entry_deduplicate': 'auto_lorebooks_recap_lorebook_entry_deduplicate',
    'bulk_populate': 'auto_lorebooks_bulk_populate'
  };

  let baseOperationType = null;
  for (const [key, value] of Object.entries(operationTypeMap)) {
    if (operation.startsWith(key)) {
      baseOperationType = value;
      break;
    }
  }

  debug(SUBSYSTEM.CORE, `[TokenBreakdown] Injecting metadata for operation="${operation}", mapped operationType="${baseOperationType}"`);

  await injectMetadata(messagesWithMetadata, {
    operation,
    operationType: baseOperationType,
    tokenBreakdown: preliminaryBreakdown
  });

  // Second pass: measure actual metadata overhead
  const tokensAfterMetadataRaw = count_tokens(JSON.stringify(messagesWithMetadata));
  const metadataOverhead = tokensAfterMetadataRaw - tokensBeforeMetadata;
  const totalOverhead = jsonStructureOverhead + metadataOverhead;

  // Apply correction factor for Claude tokenizer discrepancy
  const tokensAfterMetadata = applyCorrectionFactor(tokensAfterMetadataRaw);

  // Final breakdown with actual metadata overhead
  const tokenBreakdown = {
    ...preliminaryBreakdown,
    metadata: metadataOverhead,
    overhead_subtotal: totalOverhead,
    total: tokensAfterMetadata,
    st_raw_count: tokensAfterMetadataRaw // Include raw count for comparison
  };

  // Log token breakdown
  logTokenBreakdown({
    breakdown: tokenBreakdown,
    actualTokensRaw: tokensAfterMetadataRaw,
    actualTokens: tokensAfterMetadata,
    contentOnlyTokens,
    totalOverhead,
    messageBreakdown,
    lorebookBreakdown
  });

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
    tokens_messages: breakdown.messages || null,
    tokens_lorebooks: breakdown.lorebooks || null,
    tokens_prefill: breakdown.prefill,
    tokens_content_subtotal: breakdown.content_subtotal,
    tokens_json_structure: breakdown.json_structure,
    tokens_metadata: breakdown.metadata,
    tokens_overhead_subtotal: breakdown.overhead_subtotal,
    tokens_total: breakdown.total,
    tokens_max_context: contextInfo.max_context || null,
    tokens_max_response: contextInfo.max_tokens || null,
    tokens_available_for_prompt: contextInfo.max_context || null
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

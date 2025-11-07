
import {
  error,
  count_tokens,
  get_context_size,
  getContext,
  main_api,
  generateRaw,
  trimToEndSentence,
  loadPresetPrompts,
  get_current_preset } from
'./index.js';

// eslint-disable-next-line complexity
async function summarize_text(prompt, prefill = '', include_preset_prompts = false, preset_name = null) {
  // Test override: allow tests to inject a fixed response
  if (typeof globalThis !== 'undefined') {
    const __override = globalThis.__TEST_SUMMARIZE_TEXT_RESPONSE;
    if (typeof __override === 'string') {
      return __override;
    }
  }

  // get size of text
  const token_size = count_tokens(prompt);

  const context_size = get_context_size();
  if (token_size > context_size) {
    error(`Text ${token_size} exceeds context size ${context_size}.`);
  }

  const ctx = getContext();

  // At least one openai-style API required at least two messages to be sent.
  // We can do this by adding a system prompt, which will get added as another message in generateRaw().
  // WORKAROUND: This is a known requirement for OpenAI-style APIs. While not elegant,
  // it's been tested and works reliably. A more robust solution would require deeper
  // integration with SillyTavern's message handling.
  let system_prompt = false;
  if (main_api === 'openai') {
    system_prompt = "You are a data extraction system. Output ONLY valid JSON. Never generate roleplay content.";
  }

  let result;

  try {
    /*
     * Generates a message using the provided prompt.
     * @param {string|object[]} prompt Prompt to generate a message from (string or messages array)
     * @param {string} api API to use. Main API is used if not specified.
     * @param {boolean} instructOverride true to override instruct mode, false to use the default value
     * @param {boolean} quietToLoud true to generate a message in system mode, false to generate a message in character mode
     * @param {string} [systemPrompt] System prompt to use. Only Instruct mode or OpenAI.
     * @param {number} [responseLength] Maximum response length. If unset, the global default value is used.
     * @param {string} [prefill] Assistant message starter to guide response format
     * @returns {Promise<string>} Generated message
     */

    // Build prompt input - either string (current behavior) or messages array (with preset prompts)
    let prompt_input;

    // Try to load preset prompts if requested
    let presetMessages = [];
    let presetPrefill = '';
    if (include_preset_prompts) {
      // If preset_name is empty, use the currently active preset
      const effectivePresetName = preset_name || get_current_preset();

      // Load preset prompts by name
      presetMessages = await loadPresetPrompts(effectivePresetName);

      // Get preset settings for prefill
      const { getPresetManager } = await import('../../../preset-manager.js');
      const presetManager = getPresetManager('openai');
      const preset = presetManager?.getCompletionPresetByName(effectivePresetName);
      presetPrefill = preset?.assistant_prefill || '';
    }

    // Only use messages array format if we actually have preset prompts to include
    // Otherwise fall back to string format to preserve metadata injection
    if (presetMessages && presetMessages.length > 0) {
      // Use extension's prefill if set, otherwise use preset's prefill
      const effectivePrefill = prefill || presetPrefill || '';

      // Build messages array: preset prompts FIRST, then extension prompt
      prompt_input = [
        ...presetMessages,
        { role: 'system', content: system_prompt || 'Complete the requested task.' },
        { role: 'user', content: prompt }
      ];

      // When using messages array, don't pass systemPrompt separately (would duplicate)
      // Also don't override instruct mode when using preset prompts
      // Metadata injection now handled by global generateRaw interceptor
      result = await generateRaw({
        prompt: prompt_input,
        instructOverride: false,  // Let preset prompts control formatting
        quietToLoud: false,
        responseLength: null,
        trimNames: false,
        prefill: effectivePrefill
      });
    } else {
      // Current behavior - string prompt only
      // Metadata injection now handled by global generateRaw interceptor
      result = await generateRaw({
        prompt: prompt,
        instructOverride: true,
        quietToLoud: false,
        systemPrompt: system_prompt,
        responseLength: null,
        trimNames: false,
        prefill: prefill || ''
      });
    }
  } catch (err) {
    // SillyTavern strips error details before they reach us
    // Just re-throw for upper-level handling
    throw err;
  }

  // trim incomplete sentences if set in ST settings
  if (ctx.powerUserSettings.trim_sentences) {
    result = trimToEndSentence(result);
  }

  return result;
}

export {
  summarize_text // Used by scene summaries
};

import {
  error,
  count_tokens,
  get_context_size,
  getContext,
  main_api,
  generateRaw,
  trimToEndSentence } from
'./index.js';

async function summarize_text(prompt ) {
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
  // A hack obviously. Is this a standard requirement for openai-style chat completion?
  // TODO update with a more robust method
  let system_prompt = false;
  if (main_api === 'openai') {
    system_prompt = "Complete the requested task.";
  }

  let result;

  try {
    /*
     * Generates a message using the provided prompt.
     * @param {string} prompt Prompt to generate a message from
     * @param {string} api API to use. Main API is used if not specified.
     * @param {boolean} instructOverride true to override instruct mode, false to use the default value
     * @param {boolean} quietToLoud true to generate a message in system mode, false to generate a message in character mode
     * @param {string} [systemPrompt] System prompt to use. Only Instruct mode or OpenAI.
     * @param {number} [responseLength] Maximum response length. If unset, the global default value is used.
     * @returns {Promise<string>} Generated message
     */
    // Metadata injection now handled by global generateRaw interceptor
    result = await generateRaw({
      prompt: prompt,
      instructOverride: true,
      quietToLoud: false,
      systemPrompt: system_prompt,
      responseLength: null,
      trimNames: false
    });
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
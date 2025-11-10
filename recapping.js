
import { getContext, get_current_preset } from './index.js';
import { sendLLMRequest } from './llmClient.js';
import { OperationType } from './operationTypes.js';

// Wrapper around sendLLMRequest for backwards compatibility
// All functionality now in sendLLMRequest
async function recap_text(prompt, prefill = '', include_preset_prompts = false, preset_name = null) {
  const ctx = getContext();
  const profile = ctx.extensionSettings.connectionProfile;

  return await sendLLMRequest(profile, prompt, OperationType.RECAP, {
    prefill,
    includePreset: include_preset_prompts,
    preset: preset_name || (include_preset_prompts ? get_current_preset() : null),
    trimSentences: true
  });
}

export {
  recap_text // Used by scene recaps
};
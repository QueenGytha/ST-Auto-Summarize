// prepareOrganizeScenePrompt.js
// Prepares the prompt for Stage 2 (ORGANIZE_SCENE_RECAP) operation
// This stage receives extracted data from Stage 1 and filters/organizes it

import { resolveOperationConfig } from './operationsPresetsResolution.js';
import { buildAllMacroParams, substitute_params } from './macros/index.js';

/**
 * Prepare the prompt for Stage 2 (ORGANIZE_SCENE_RECAP) operation
 * @param {Object} extractedData - The extracted data from Stage 1
 * @param {Object} _ctx - SillyTavern context (unused but kept for consistency)
 * @returns {Promise<{prompt: string, prefill: string}>}
 */
export async function prepareOrganizeScenePrompt(extractedData, _ctx) {
  // Resolve config for organize_scene_recap operation
  const config = await resolveOperationConfig('organize_scene_recap');

  const promptTemplate = config.prompt;
  const prefill = config.prefill || "";

  // Build all macro values from context - extractedData becomes {{extracted_data}}
  const params = buildAllMacroParams({
    extractedData,
    prefillText: prefill
  });

  const prompt = await substitute_params(promptTemplate, params);

  return { prompt, prefill };
}

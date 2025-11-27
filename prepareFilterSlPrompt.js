// prepareFilterSlPrompt.js
// Prepares the prompt for Stage 4 (FILTER_SCENE_RECAP_SL) operation
// This stage receives sl entries from Stage 2 and filters against existing lorebook entries

import { resolveOperationConfig } from './operationsPresetsResolution.js';
import { getActiveLorebooksAtPosition } from './sceneBreak.js';
import { getEntityTypeDefinitionsFromSettings } from './entityTypes.js';
import { extension_settings } from './index.js';
import { buildAllMacroParams, substitute_params } from './macros/index.js';

/**
 * Prepare the prompt for Stage 4 (FILTER_SCENE_RECAP_SL) operation
 * @param {Object} extractedData - The organized data from Stage 2 (contains sl array)
 * @param {Object} ctx - SillyTavern context
 * @param {number} endIdx - End message index for this scene
 * @param {Function} get_data - Function to get data from messages
 * @returns {Promise<{prompt: string, prefill: string}>}
 */
export async function prepareFilterSlPrompt(extractedData, ctx, endIdx, get_data) {
  // Resolve config for filter_scene_recap_sl operation
  const config = await resolveOperationConfig('filter_scene_recap_sl');

  const promptTemplate = config.prompt;
  const prefill = config.prefill || "";

  // Get active lore for comparison (filtering sl entries against existing entries)
  const { entries: activeEntries } = await getActiveLorebooksAtPosition(endIdx, ctx, get_data);

  // Get entity type definitions from artifact system
  const typeDefinitions = getEntityTypeDefinitionsFromSettings(extension_settings?.auto_recap);

  // Build all macro values from context - all macros available on all prompts
  // extractedData is the full Stage 2 output; extractedSl is the .sl field for {{extracted_sl}} macro
  const params = buildAllMacroParams({
    extractedData,
    extractedSl: extractedData?.sl,
    activeEntries,
    typeDefinitions,
    prefillText: prefill
  });

  const prompt = await substitute_params(promptTemplate, params);

  return { prompt, prefill };
}

// prepareFilterSlPrompt.js
// Prepares the prompt for Stage 4 (FILTER_SCENE_RECAP_SL) operation
// This stage receives entities from Stage 2 and filters against existing lorebook entries

import { resolveOperationConfig } from './operationsPresetsResolution.js';
import { getActiveLorebooksAtPosition } from './sceneBreak.js';
import { getEntityTypeDefinitionsFromSettings } from './entityTypes.js';
import { extension_settings } from './index.js';
import { buildAllMacroParams, substitute_params } from './macros/index.js';

/**
 * Prepare the prompt for Stage 4 (FILTER_SCENE_RECAP_SL) operation
 * @param {Object} stage2Data - Stage 2 output (contains .entities array)
 * @param {Object} ctx - SillyTavern context
 * @param {number} endIdx - End message index for this scene
 * @param {Function} get_data - Function to get data from messages
 * @returns {Promise<{prompt: string, prefill: string}>}
 */
export async function prepareFilterSlPrompt(stage2Data, ctx, endIdx, get_data) {
  // Resolve config for filter_scene_recap_sl operation
  const config = await resolveOperationConfig('filter_scene_recap_sl');

  const promptTemplate = config.prompt;
  const prefill = config.prefill || "";

  // Get active lore for comparison (filtering entities against existing entries)
  const { entries: activeEntries } = await getActiveLorebooksAtPosition(endIdx, ctx, get_data);

  // Get entity type definitions from artifact system
  const typeDefinitions = getEntityTypeDefinitionsFromSettings(extension_settings?.auto_recap);

  // Entities come from Stage 2 (character, location, lore, etc.)
  const combinedEntities = stage2Data?.entities || [];

  // Build all macro values from context - all macros available on all prompts
  // extractedSl receives the combined entities for {{extracted_sl}} macro
  const params = buildAllMacroParams({
    extractedData: stage2Data,
    extractedSl: combinedEntities,
    activeEntries,
    typeDefinitions,
    prefillText: prefill
  });

  const prompt = await substitute_params(promptTemplate, params);

  return { prompt, prefill };
}

// prepareParseScenePrompt.js
// Prepares the prompt for Stage 2 (PARSE_SCENE_RECAP) operation
// This stage receives extracted data from Stage 1 and filters/formats it

import { resolveOperationConfig } from './operationsPresetsResolution.js';
import { getActiveLorebooksAtPosition } from './sceneBreak.js';
import { getEntityTypeDefinitionsFromSettings } from './entityTypes.js';
import { extension_settings } from './index.js';
import { buildAllMacroParams, substitute_params } from './macros/index.js';

/**
 * Prepare the prompt for Stage 2 (PARSE_SCENE_RECAP) operation
 * @param {Object} extractedData - The extracted data from Stage 1 (chronological_items array)
 * @param {Object} ctx - SillyTavern context
 * @param {number} endIdx - End message index for this scene
 * @param {Function} get_data - Function to get data from messages
 * @returns {Promise<{prompt: string, prefill: string}>}
 */
export async function prepareParseScenePrompt(extractedData, ctx, endIdx, get_data) {
  // Resolve config for parse_scene_recap operation
  const config = await resolveOperationConfig('parse_scene_recap');

  const promptTemplate = config.prompt;
  const prefill = config.prefill || "";

  // Get active lore for comparison
  const { entries: activeEntries } = await getActiveLorebooksAtPosition(endIdx, ctx, get_data);

  // Get entity type definitions from artifact system
  const typeDefinitions = getEntityTypeDefinitionsFromSettings(extension_settings?.auto_recap);

  // Get current running recap for semantic deduplication comparison
  const runningRecapData = ctx.chat_metadata?.auto_recap?.running_scene_recap;
  const currentRunningRecap = runningRecapData?.recap || '';

  // Build all macro values from context - all macros available on all prompts
  const params = buildAllMacroParams({
    extractedData,
    activeEntries,
    typeDefinitions,
    currentRunningRecap,
    prefillText: prefill
  });

  const prompt = await substitute_params(promptTemplate, params);

  return { prompt, prefill };
}

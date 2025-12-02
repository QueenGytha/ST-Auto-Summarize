// prepareParseScenePrompt.js
// Prepares the prompt for Stage 3 (PARSE_SCENE_RECAP) operation
// This stage merges the new scene's plot into the running recap

import { resolveOperationConfig } from './operationsPresetsResolution.js';
import { getActiveLorebooksAtPosition } from './sceneBreak.js';
import { getEntityTypeDefinitionsFromSettings } from './entityTypes.js';
import { extension_settings } from './index.js';
import { buildAllMacroParams, substitute_params } from './macros/index.js';
import { get_current_running_recap_content } from './runningSceneRecap.js';

/**
 * Prepare the prompt for Stage 3 (PARSE_SCENE_RECAP) operation
 * @param {Object} extractedData - The organized data from Stage 2 (contains sn, plot, entities)
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

  // Get current running recap for merging
  const currentRunningRecap = get_current_running_recap_content();

  // Build scene_recaps format for {{scene_recaps}} macro (legacy support)
  // Stage 2 output has {sn, recap: {outcomes, threads, state}, entities}
  const sceneRecaps = [{
    name: extractedData?.sn || 'Current Scene',
    recap: extractedData?.recap || {}
  }];

  // Build all macro values from context - all macros available on all prompts
  // stage2Recap provides {{stage2_recap}}, currentRunningRecap provides {{current_running_recap}}
  const params = buildAllMacroParams({
    extractedData,
    stage2Recap: extractedData?.recap,  // Stage 2 recap object for Stage 3 filtering
    sceneRecaps,
    activeEntries,
    typeDefinitions,
    currentRunningRecap,
    prefillText: prefill
  });

  const prompt = await substitute_params(promptTemplate, params);

  return { prompt, prefill };
}

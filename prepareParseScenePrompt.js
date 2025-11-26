// prepareParseScenePrompt.js
// Prepares the prompt for Stage 2 (PARSE_SCENE_RECAP) operation
// This stage receives extracted data from Stage 1 and filters/formats it

import { resolveOperationConfig } from './operationsPresetsResolution.js';
import { getActiveLorebooksAtPosition } from './sceneBreak.js';
import { build as buildActiveSettingLore } from './macros/active_setting_lore.js';
import { getEntityTypeDefinitionsFromSettings } from './entityTypes.js';
import { extension_settings } from './index.js';
import { build as buildLorebookEntryTypes } from './macros/lorebook_entry_types.js';
import { substitute_params } from './promptUtils.js';

function buildPrefill(prefill) {
  if (!prefill || prefill.trim() === '') {
    return '';
  }
  return prefill.trim();
}

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
  const activeSettingLoreText = buildActiveSettingLore(activeEntries);

  // Get entity type definitions from artifact system
  const typeDefinitions = getEntityTypeDefinitionsFromSettings(extension_settings?.auto_recap);
  const lorebookTypesMacro = buildLorebookEntryTypes(typeDefinitions);

  // Build macro values for Stage 2
  const params = {
    extracted_data: JSON.stringify(extractedData, null, 2),  // Pretty-print for LLM readability
    active_setting_lore: activeSettingLoreText,
    lorebook_entry_types: lorebookTypesMacro,
    prefill: buildPrefill(prefill)
  };

  const prompt = await substitute_params(promptTemplate, params);

  return { prompt, prefill };
}

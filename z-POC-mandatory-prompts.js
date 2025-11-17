// POC: Calculate mandatory prompts using prepareOpenAIMessages dry-run
// This tests if we can factor in SillyTavern's mandatory prompts into our token calculations

import { getContext } from '../../../extensions.js';
import { prepareOpenAIMessages } from '../../../openai.js';
import { debug, SUBSYSTEM } from './utils.js';

/**
 * Get preset data for token calculation
 * @param {string} preset - Preset name (empty string = use current active)
 * @returns {Promise<{presetMaxContext: number, presetMaxTokens: number, effectivePresetName: string}|null>}
 */
async function getPresetData(preset) {
  const { getPresetManager } = await import('../../../preset-manager.js');
  const presetManager = getPresetManager('openai');

  let effectivePresetName;
  if (preset === '') {
    effectivePresetName = presetManager?.getSelectedPresetName();
    if (!effectivePresetName) {
      debug(SUBSYSTEM.OPERATIONS, '[MandatoryCalc] No active preset, cannot calculate');
      return null;
    }
  } else {
    effectivePresetName = preset;
  }

  const presetData = presetManager?.getCompletionPresetByName(effectivePresetName);
  if (!presetData) {
    debug(SUBSYSTEM.OPERATIONS, `[MandatoryCalc] Preset "${effectivePresetName}" not found`);
    return null;
  }

  const presetMaxContext = presetData.max_context || presetData.openai_max_context;
  const presetMaxTokens = presetData.genamt || presetData.openai_max_tokens;

  if (!presetMaxContext || presetMaxContext <= 0) {
    debug(SUBSYSTEM.OPERATIONS, '[MandatoryCalc] Preset has no valid max_context');
    return null;
  }
  if (!presetMaxTokens || presetMaxTokens <= 0) {
    debug(SUBSYSTEM.OPERATIONS, '[MandatoryCalc] Preset has no valid max_tokens');
    return null;
  }

  return { presetMaxContext, presetMaxTokens, effectivePresetName };
}

/**
 * Calculate mandatory prompt tokens via dry-run
 * @param {Object} character - Character object
 * @returns {Promise<number|null>}
 */
async function calculateMandatoryTokens(character) {
  const [, tokenCounts] = await prepareOpenAIMessages({
    name2: character.name,
    charDescription: character.description || '',
    charPersonality: character.personality || '',
    scenario: character.scenario || '',
    worldInfoBefore: '',
    worldInfoAfter: '',
    bias: '',
    type: 'normal',
    quietPrompt: '',
    quietImage: null,
    extensionPrompts: {},
    cyclePrompt: null,
    systemPromptOverride: character.data?.system_prompt || '',
    jailbreakPromptOverride: character.data?.post_history_instructions || '',
    messages: [],
    messageExamples: character.mes_example ? [{ role: 'system', content: character.mes_example }] : []
  }, true);

  if (!tokenCounts) {
    debug(SUBSYSTEM.OPERATIONS, '[MandatoryCalc] prepareOpenAIMessages returned null tokenCounts');
    return null;
  }

  const mandatoryTokens = Object.entries(tokenCounts).reduce((sum, [identifier, tokens]) => {
    debug(SUBSYSTEM.OPERATIONS, `[MandatoryCalc]   ${identifier}: ${tokens} tokens`);
    return sum + tokens;
  }, 0);

  debug(SUBSYSTEM.OPERATIONS, `[MandatoryCalc] Total mandatory tokens: ${mandatoryTokens}`);
  return mandatoryTokens;
}

/**
 * Calculate available context after accounting for mandatory prompts
 * Uses SillyTavern's prepareOpenAIMessages in dry-run mode
 *
 * @param {string} preset - Preset name (empty string = use current active)
 * @returns {Promise<number|null>} Available tokens for recap content, or null if calculation failed
 */
export async function calculateAvailableContextWithMandatory(preset) {
  try {
    const ctx = getContext();

    const characterId = ctx.characterId;
    if (characterId === undefined || characterId === null) {
      debug(SUBSYSTEM.OPERATIONS, '[MandatoryCalc] No character selected');
      return null;
    }

    const character = ctx.characters[characterId];
    if (!character) {
      debug(SUBSYSTEM.OPERATIONS, `[MandatoryCalc] Character ${characterId} not found`);
      return null;
    }

    debug(SUBSYSTEM.OPERATIONS, `[MandatoryCalc] Calculating for: ${character.name}`);

    const presetInfo = await getPresetData(preset);
    if (!presetInfo) {
      return null;
    }

    const { presetMaxContext, presetMaxTokens, effectivePresetName } = presetInfo;
    debug(SUBSYSTEM.OPERATIONS, `[MandatoryCalc] Preset: ${effectivePresetName}, max_context: ${presetMaxContext}, max_tokens: ${presetMaxTokens}`);

    const mandatoryTokens = await calculateMandatoryTokens(character);
    if (mandatoryTokens === null) {
      return null;
    }

    const availableForRecap = presetMaxContext - presetMaxTokens - mandatoryTokens;
    debug(SUBSYSTEM.OPERATIONS, `[MandatoryCalc] Available: ${presetMaxContext} - ${presetMaxTokens} - ${mandatoryTokens} = ${availableForRecap}`);

    return availableForRecap;
  } catch (err) {
    debug(SUBSYSTEM.OPERATIONS, '[MandatoryCalc] Failed:', err);
    debug(SUBSYSTEM.OPERATIONS, '[MandatoryCalc] Stack:', err.stack);
    return null;
  }
}

/**
 * Test function to compare old vs new calculation
 * Call from browser console: window.AutoRecap.testMandatoryCalculation()
 */
export async function testMandatoryCalculation() {
  const PERCENTAGE_MULTIPLIER = 100;

  debug(SUBSYSTEM.OPERATIONS, '=== TESTING MANDATORY PROMPT CALCULATION ===');

  const { getPresetManager } = await import('../../../preset-manager.js');
  const presetManager = getPresetManager('openai');
  const presetName = presetManager?.getSelectedPresetName();
  const presetData = presetManager?.getCompletionPresetByName(presetName);
  const oldMaxContext = presetData.max_context || presetData.openai_max_context;

  debug(SUBSYSTEM.OPERATIONS, `Old method (preset max_context only): ${oldMaxContext} tokens`);

  const newMaxContext = await calculateAvailableContextWithMandatory('');

  if (newMaxContext !== null) {
    debug(SUBSYSTEM.OPERATIONS, `New method (minus mandatory prompts): ${newMaxContext} tokens`);
    debug(SUBSYSTEM.OPERATIONS, `Difference (mandatory prompts): ${oldMaxContext - newMaxContext} tokens`);
    debug(SUBSYSTEM.OPERATIONS, `Reduction: ${((1 - newMaxContext / oldMaxContext) * PERCENTAGE_MULTIPLIER).toFixed(1)}%`);
  } else {
    debug(SUBSYSTEM.OPERATIONS, 'New method failed to calculate');
  }

  debug(SUBSYSTEM.OPERATIONS, '=== TEST COMPLETE ===');
}

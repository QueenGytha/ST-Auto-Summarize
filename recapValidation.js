
import {
  get_settings,
  getContext,
  debug,
  error,
  log,
  SUBSYSTEM } from
'./index.js';
import { DEBUG_OUTPUT_MEDIUM_LENGTH } from './constants.js';

// Helper: Get setting key for validation type
function getValidationKey(type , suffix ) {
  // Only scene recaps are supported now (no more message recaps)
  const prefix = 'scene_recap';
  return `${prefix}_${suffix}`;
}

async function validate_recap(recap , type  = "scene") {
  if (!get_settings('error_detection_enabled')) {return true;}
  if (!get_settings(getValidationKey(type, 'error_detection_enabled'))) {return true;}

  debug(SUBSYSTEM.VALIDATION, `Validating ${type} recap...`);

  // Ensure chat is blocked during validation
  const ctx = getContext();
  ctx.deactivateSendButtons();

  try {
    // Get connection profile and preset for validation
    const validation_profile = get_settings(getValidationKey(type, 'error_detection_connection_profile')) || '';
    const validation_preset = get_settings(getValidationKey(type, 'error_detection_preset'));
    const include_preset_prompts = get_settings(getValidationKey(type, 'error_detection_include_preset_prompts'));

    // Get the error detection prompt
    let prompt = get_settings(getValidationKey(type, 'error_detection_prompt'));
    prompt = prompt.replace("{{recap}}", recap);

    // Get prefill if configured
    const prefill = get_settings(getValidationKey(type, 'error_detection_prefill')) || '';
    if (prefill) {
      debug(SUBSYSTEM.VALIDATION, `Using prefill for validation prompt`);
    }

    // Set operation context for ST_METADATA
    const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
    setOperationSuffix(`-${type}`);

    let validation_result;

    try {
      debug(SUBSYSTEM.VALIDATION, `Sending validation prompt: ${prompt.slice(0, DEBUG_OUTPUT_MEDIUM_LENGTH)}...`);

      const { sendLLMRequest } = await import('./llmClient.js');
      const { OperationType } = await import('./operationTypes.js');
      const { resolveProfileId } = await import('./profileResolution.js');
      const effectiveProfile = resolveProfileId(validation_profile);

      const options = {
        includePreset: include_preset_prompts,
        preset: validation_preset,
        prefill,
        trimSentences: false
      };

      validation_result = await sendLLMRequest(effectiveProfile, prompt, OperationType.VALIDATE_RECAP, options);
      debug(SUBSYSTEM.VALIDATION, `Raw validation result: ${validation_result}`);
    } finally {
      clearOperationSuffix();
    }

    // Clean up and check result
    const result_upper = validation_result.trim().toUpperCase();
    const valid = result_upper.includes("VALID") && !result_upper.includes("INVALID");

    if (!valid) {
      log(SUBSYSTEM.VALIDATION, `Recap validation FAILED: "${result_upper}"`);
    } else {
      debug(SUBSYSTEM.VALIDATION, `Recap validation passed with result: "${result_upper}"`);
    }

    return valid;

  } catch (e) {
    error(SUBSYSTEM.VALIDATION, `Error during recap validation: ${e}`);
    // If validation fails technically, assume the recap is valid
    return true;
  } finally {


    // We don't re-enable buttons here because that will be handled
    // by the calling function after all retries are complete
  }}
export { validate_recap };
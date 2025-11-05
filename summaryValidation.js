
import {
  get_settings,
  getContext,
  summarize_text,
  debug,
  error,
  log,
  SUBSYSTEM } from
'./index.js';

// Helper: Get setting key for validation type
function getValidationKey(type , suffix ) {
  // Only scene summaries are supported now (no more message summaries)
  const prefix = 'scene_summary';
  return `${prefix}_${suffix}`;
}

async function validate_summary(summary , type  = "scene") {
  if (!get_settings('error_detection_enabled')) return true;
  if (!get_settings(getValidationKey(type, 'error_detection_enabled'))) return true;

  debug(SUBSYSTEM.VALIDATION, `Validating ${type} summary...`);

  // Ensure chat is blocked during validation
  const ctx = getContext();
  ctx.deactivateSendButtons();

  try {
    // Get connection profile and preset for validation
    const validation_profile = get_settings(getValidationKey(type, 'error_detection_connection_profile'));
    const validation_preset = get_settings(getValidationKey(type, 'error_detection_preset'));

    // Execute validation with connection profile/preset switching
    const { withConnectionSettings } = await import('./connectionSettingsManager.js');

    const is_valid = await withConnectionSettings(
      validation_profile,
      validation_preset,
      async () => {
        // Get the error detection prompt
        let prompt = get_settings(getValidationKey(type, 'error_detection_prompt'));
        prompt = prompt.replace("{{summary}}", summary);

        // Add prefill if configured
        const prefill = get_settings(getValidationKey(type, 'error_detection_prefill'));
        if (prefill) {
          debug(SUBSYSTEM.VALIDATION, `Adding prefill to validation prompt`);
          prompt = `${prompt}\n${prefill}`;
        }

        // Set operation context for ST_METADATA
        const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
        setOperationSuffix(`-${type}`);

        let validation_result;
        try {
          // Generate validation response
          debug(SUBSYSTEM.VALIDATION, `Sending validation prompt: ${prompt.substring(0, 200)}...`);
          validation_result = await summarize_text(prompt);
          debug(SUBSYSTEM.VALIDATION, `Raw validation result: ${validation_result}`);
        } finally {
          clearOperationSuffix();
        }

        // Clean up and check result
        const result_upper = validation_result.trim().toUpperCase();
        const valid = result_upper.includes("VALID") && !result_upper.includes("INVALID");

        if (!valid) {
          log(SUBSYSTEM.VALIDATION, `Summary validation FAILED: "${result_upper}"`);
        } else {
          debug(SUBSYSTEM.VALIDATION, `Summary validation passed with result: "${result_upper}"`);
        }

        return valid;
      }
    );

    return is_valid;

  } catch (e) {
    error(SUBSYSTEM.VALIDATION, `Error during summary validation: ${e}`);
    // If validation fails technically, assume the summary is valid
    return true;
  } finally {


    // We don't re-enable buttons here because that will be handled
    // by the calling function after all retries are complete
  }}
export { validate_summary };
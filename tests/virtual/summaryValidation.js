// @flow
import {
    get_settings,
    getContext,
    summarize_text,
    debug,
    error,
    log,
    SUBSYSTEM,
    getPresetManager,
    main_api
} from './index.js';

// Helper: Get setting key for validation type
function getValidationKey(type /*: string */, suffix /*: string */) /*: string */ {
    const prefix = type === "regular" ? 'message_summary' : 'combined_summary';
    return `${prefix}_${suffix}`;
}

// $FlowFixMe[signature-verification-failure]
async function validate_summary(summary /*: string */, type /*: string */ = "regular") /*: Promise<boolean> */ {
    if (!get_settings('error_detection_enabled')) return true;
    if (!get_settings(getValidationKey(type, 'error_detection_enabled'))) return true;

    debug(SUBSYSTEM.VALIDATION, `Validating ${type} summary...`);

    // Ensure chat is blocked during validation
    const ctx = getContext();
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    // Get PresetManager for current main_api to handle preset switching
    // Validation uses the current connection profile, but can use a custom preset
    const api = main_api;
    const presetManager = api ? getPresetManager(api) : null;
    let savedPreset = null;

    if (presetManager) {
        savedPreset = presetManager.getSelectedPreset();
    }

    try {
        // Get the error detection prompt
        let prompt = get_settings(getValidationKey(type, 'error_detection_prompt'));
        prompt = prompt.replace("{{summary}}", summary);

        // Switch to validation preset if configured
        const error_preset = get_settings(getValidationKey(type, 'error_detection_preset'));
        if (error_preset && presetManager) {
            const presetValue = presetManager.findPreset(error_preset);
            if (presetValue) {
                debug(SUBSYSTEM.VALIDATION, `Switching ${api} preset to validation preset: ${error_preset}`);
                presetManager.selectPreset(presetValue);
            } else {
                debug(SUBSYSTEM.VALIDATION, `Validation preset '${error_preset}' not found for API ${api}`);
            }
        }

        // Add prefill if configured
        const prefill = get_settings(getValidationKey(type, 'error_detection_prefill'));
        if (prefill) {
            debug(SUBSYSTEM.VALIDATION, `Adding prefill to validation prompt`);
            prompt = `${prompt}\n${prefill}`;
        }

        // Generate validation response (uses current main_api)
        debug(SUBSYSTEM.VALIDATION, `Sending validation prompt: ${prompt.substring(0, 200)}...`);
        const validation_result = await summarize_text(prompt);
        debug(SUBSYSTEM.VALIDATION, `Raw validation result: ${validation_result}`);

        // Clean up and check result
        const result_upper = validation_result.trim().toUpperCase();
        const is_valid = result_upper.includes("VALID") && !result_upper.includes("INVALID");

        if (!is_valid) {
            log(SUBSYSTEM.VALIDATION, `Summary validation FAILED: "${result_upper}"`);
        } else {
            debug(SUBSYSTEM.VALIDATION, `Summary validation passed with result: "${result_upper}"`);
        }

        // Restore original preset
        if (presetManager && savedPreset) {
            debug(SUBSYSTEM.VALIDATION, `Restoring ${api} preset to original`);
            presetManager.selectPreset(savedPreset);
        }

        return is_valid;
    } catch (e) {
        error(SUBSYSTEM.VALIDATION, `Error during summary validation: ${e}`);

        // Restore original preset
        if (presetManager && savedPreset) {
            debug(SUBSYSTEM.VALIDATION, `Restoring ${api} preset after error`);
            presetManager.selectPreset(savedPreset);
        }

        // If validation fails technically, assume the summary is valid
        return true;
    } finally {
        // We don't re-enable buttons here because that will be handled
        // by the calling function after all retries are complete
    }
}

export { validate_summary };
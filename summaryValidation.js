import {
    get_settings,
    getContext,
    get_current_preset,
    get_current_connection_profile,
    set_preset,
    set_connection_profile,
    summarize_text,
    debug,
    error,
    log,
    SUBSYSTEM
} from './index.js';

async function validate_summary(summary, type = "regular") {
    if (!get_settings('error_detection_enabled')) return true;
    
    // Check if error detection is enabled for this summary type
    const enabled_key = type === "regular" ? 'regular_summary_error_detection_enabled' : 'combined_summary_error_detection_enabled';
    if (!get_settings(enabled_key)) return true;
    
    debug(SUBSYSTEM.VALIDATION, `Validating ${type} summary...`);
    
    // Ensure chat is blocked during validation
    const ctx = getContext();
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    // Save current preset and profile (declare outside try so accessible in catch)
    let current_preset;
    let current_profile;

    try {
        // Get the error detection prompt
        const prompt_key = type === "regular" ? 'regular_summary_error_detection_prompt' : 'combined_summary_error_detection_prompt';
        let prompt = get_settings(prompt_key);

        // Substitute the summary in the prompt
        prompt = prompt.replace("{{summary}}", summary);

        // Get current preset and profile
        current_preset = await get_current_preset();
        current_profile = await get_current_connection_profile();

        // Set the error detection preset
        const preset_key = type === "regular" ? 'regular_summary_error_detection_preset' : 'combined_summary_error_detection_preset';
        const error_preset = get_settings(preset_key);
        if (error_preset) {
            debug(SUBSYSTEM.VALIDATION, `Using custom validation preset: ${error_preset}`);
            await set_preset(error_preset);
        }

        // Add prefill if configured
        const prefill_key = type === "regular" ? 'regular_summary_error_detection_prefill' : 'combined_summary_error_detection_prefill';
        const prefill = get_settings(prefill_key);
        if (prefill) {
            debug(SUBSYSTEM.VALIDATION, `Adding prefill to validation prompt`);
            prompt = `${prompt}\n${prefill}`;
        }
        
        // Generate validation response
        let validation_result;
        debug(SUBSYSTEM.VALIDATION, `Sending validation prompt: ${prompt.substring(0, 200)}...`);
        validation_result = await summarize_text(prompt);
        debug(SUBSYSTEM.VALIDATION, `Raw validation result: ${validation_result}`);
        
        // Clean up and check result
        validation_result = validation_result.trim().toUpperCase();
        const is_valid = validation_result.includes("VALID") && !validation_result.includes("INVALID");
        
        if (!is_valid) {
            log(SUBSYSTEM.VALIDATION, `Summary validation FAILED: "${validation_result}"`);
        } else {
            debug(SUBSYSTEM.VALIDATION, `Summary validation passed with result: "${validation_result}"`);
        }
        
        // Restore original preset and profile
        await set_preset(current_preset);
        await set_connection_profile(current_profile);
        
        return is_valid;
    } catch (e) {
        error(SUBSYSTEM.VALIDATION, `Error during summary validation: ${e}`);
        
        // Restore original preset and profile
        await set_preset(current_preset);
        await set_connection_profile(current_profile);
        
        // If validation fails technically, assume the summary is valid
        return true;
    } finally {
        // We don't re-enable buttons here because that will be handled 
        // by the calling function after all retries are complete
    }
}

export { validate_summary };
import {
    get_settings,
    get_current_preset,
    get_current_connection_profile,
    set_preset,
    set_connection_profile,
    summarize_text,
    debug,
    error
} from './index.js';

async function validate_summary(summary, type = "regular") {
    if (!get_settings('error_detection_enabled')) return true;
    
    // Check if error detection is enabled for this summary type
    const enabled_key = type === "regular" ? 'regular_summary_error_detection_enabled' : 'combined_summary_error_detection_enabled';
    if (!get_settings(enabled_key)) return true;
    
    debug(`[Validation] Validating ${type} summary...`);
    
    // Ensure chat is blocked during validation
    let ctx = getContext();
    if (get_settings('block_chat')) {
        ctx.deactivateSendButtons();
    }

    try {
        // Get the error detection prompt
        const prompt_key = type === "regular" ? 'regular_summary_error_detection_prompt' : 'combined_summary_error_detection_prompt';
        let prompt = get_settings(prompt_key);
        
        // Substitute the summary in the prompt
        prompt = prompt.replace("{{summary}}", summary);
        
        // Save current preset and profile
        const summary_preset = type === "regular" ? 
            get_settings('completion_preset') : 
            get_settings('combined_summary_completion_preset');
        const current_preset = await get_current_preset();
        const summary_profile = get_settings('connection_profile');
        const current_profile = await get_current_connection_profile();

        // Set the error detection preset
        const preset_key = type === "regular" ? 'regular_summary_error_detection_preset' : 'combined_summary_error_detection_preset';
        const error_preset = get_settings(preset_key);
        if (error_preset) {
            debug(`[Validation] Using custom validation preset: ${error_preset}`);
            await set_preset(error_preset);
        }

        // Add prefill if configured
        const prefill_key = type === "regular" ? 'regular_summary_error_detection_prefill' : 'combined_summary_error_detection_prefill';
        const prefill = get_settings(prefill_key);
        if (prefill) {
            debug(`[Validation] Adding prefill to validation prompt`);
            prompt = `${prompt}\n${prefill}`;
        }
        
        // Generate validation response
        let validation_result;
        debug(`[Validation] Sending validation prompt: ${prompt.substring(0, 200)}...`);
        validation_result = await summarize_text(prompt);
        debug(`[Validation] Raw validation result: ${validation_result}`);
        
        // Clean up and check result
        validation_result = validation_result.trim().toUpperCase();
        const is_valid = validation_result.includes("VALID") && !validation_result.includes("INVALID");
        
        if (!is_valid) {
            console.log(`[Validation] Summary validation FAILED: "${validation_result}"`);
        } else {
            debug(`[Validation] Summary validation passed with result: "${validation_result}"`);
        }
        
        // Restore original preset and profile
        await set_preset(current_preset);
        await set_connection_profile(current_profile);
        
        return is_valid;
    } catch (e) {
        error(`[Validation] Error during summary validation: ${e}`);
        
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
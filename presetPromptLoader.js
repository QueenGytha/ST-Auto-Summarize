/**
 * Preset Prompt Loader
 *
 * Utility for loading prompts from completion presets by name.
 * This allows the extension to include preset prompts (main, jailbreak, nsfw, etc.)
 * in its LLM calls without waiting for preset switching to complete.
 */

import { debug, SUBSYSTEM } from './utils.js';
import { DEBUG_OUTPUT_SHORT_LENGTH } from './constants.js';

/**
 * Loads prompts from a completion preset by name
 * @param {string} presetName - Name of the preset to load prompts from
 * @returns {Promise<Array<{role: string, content: string}>>} Array of message objects
 */
export async function loadPresetPrompts(presetName) {
    try {
        // Import SillyTavern APIs
        const { substituteParams, main_api } = await import('../../../../script.js');
        const { getPresetManager } = await import('../../../preset-manager.js');

        if (!presetName) {
            debug(SUBSYSTEM.CORE, '[PresetPromptLoader] No preset name provided');
            return [];
        }

        // Only works for OpenAI API
        if (main_api !== 'openai') {
            debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Preset prompts only supported for OpenAI API, current API: ${main_api}`);
            return [];
        }

        const presetManager = getPresetManager('openai');
        if (!presetManager) {
            debug(SUBSYSTEM.CORE, '[PresetPromptLoader] Preset manager not available');
            return [];
        }

        // Get the preset data
        const preset = presetManager.getCompletionPresetByName(presetName);
        if (!preset || !Array.isArray(preset.prompts)) {
            debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Preset "${presetName}" not found or has no prompts`);
            return [];
        }

        // Include only enabled prompts with content
        const messages = preset.prompts
            .filter(p => {
                // Skip if explicitly disabled
                if (p.enabled === false) return false;
                // Must have content
                if (!p.content || p.content.trim() === '') return false;
                return true;
            })
            .map(p => ({
                // Preserve all prompt properties for proper injection
                ...p,
                // Substitute params in content
                content: substituteParams(p.content || '')
            }))
            .sort((a, b) => {
                // Sort by injection order if specified
                const orderA = a.injection_order ?? DEBUG_OUTPUT_SHORT_LENGTH;
                const orderB = b.injection_order ?? DEBUG_OUTPUT_SHORT_LENGTH;
                return orderA - orderB;
            });

        debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Loaded ${messages.length} prompts from preset "${presetName}"`);

        if (messages.length > 0) {
            const promptIdentifiers = preset.prompts
                .filter(p => p.content && p.content.trim() !== '')
                .map(p => p.identifier || p.name || 'unnamed')
                .join(', ');
            debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Prompt identifiers: ${promptIdentifiers}`);
        }

        return messages;

    } catch (error) {
        console.error('[PresetPromptLoader] Error loading preset prompts:', error);
        debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Stack trace: ${error.stack}`);
        return [];
    }
}

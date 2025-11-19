/**
 * Preset Prompt Loader
 *
 * Utility for loading prompts from completion presets by name.
 * This allows the extension to include preset prompts (main, jailbreak, nsfw, etc.)
 * in its LLM calls without waiting for preset switching to complete.
 */

import { debug, SUBSYSTEM } from './utils.js';
import { DEBUG_OUTPUT_SHORT_LENGTH, DEFAULT_CHARACTER_ID } from './constants.js';

/**
 * Loads prompts from a completion preset by name
 * @param {string} presetName - Name of the preset to load prompts from
 * @returns {Promise<Array<{role: string, content: string}>>} Array of message objects
 */
export async function loadPresetPrompts(presetName) {
    try {
        // Import SillyTavern APIs
        const { substituteParams, name1, name2, main_api } = await import('../../../../script.js');
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

        // Get current character/chat ID for prompt_order lookup
        const { this_chid } = await import('../../../../script.js');
        const characterId = this_chid ?? DEFAULT_CHARACTER_ID; // Use default if no character

        // Get prompt order configuration for this character
        const promptOrderConfig = preset.prompt_order?.[characterId] ?? preset.prompt_order?.[DEFAULT_CHARACTER_ID];

        // Build enabled prompts set from prompt_order
        const enabledIdentifiers = new Set();
        if (promptOrderConfig && Array.isArray(promptOrderConfig.order)) {
            for (const item of promptOrderConfig.order) {
                if (item.enabled !== false) {
                    enabledIdentifiers.add(item.identifier);
                }
            }
        }

        // Include prompts with content that are enabled in prompt_order
        const messages = preset.prompts
            .filter(p => {
                // Must have content
                if (!p.content || p.content.trim() === '') {return false;}
                // If prompt_order exists, check if this prompt is enabled there
                if (enabledIdentifiers.size > 0) {
                    return enabledIdentifiers.has(p.identifier);
                }
                // Fallback: check enabled field in prompts array
                if (p.enabled === false) {return false;}
                return true;
            })
            .map(p => ({
                // Preserve all prompt properties for proper injection
                ...p,
                // Substitute params in content (pass name1/name2 explicitly for {{user}}/{{char}} macros)
                content: substituteParams(p.content || '', name1, name2)
            }))
            .sort((a, b) => {
                // Sort by injection order if specified
                const orderA = a.injection_order ?? DEBUG_OUTPUT_SHORT_LENGTH;
                const orderB = b.injection_order ?? DEBUG_OUTPUT_SHORT_LENGTH;
                return orderA - orderB;
            });

        debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Loaded ${messages.length} prompts from preset "${presetName}" for character ${characterId}`);

        if (messages.length > 0) {
            const loadedIdentifiers = messages
                .map(p => p.identifier || p.name || 'unnamed')
                .join(', ');
            debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Loaded prompt identifiers: ${loadedIdentifiers}`);
        }

        // Log which prompts were skipped
        const allWithContent = preset.prompts.filter(p => p.content && p.content.trim() !== '');
        const skipped = allWithContent.filter(p => !messages.some(m => m.identifier === p.identifier));
        if (skipped.length > 0) {
            const skippedIds = skipped.map(p => p.identifier || p.name || 'unnamed').join(', ');
            debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Skipped ${skipped.length} prompts (disabled or not in prompt_order): ${skippedIds}`);
        }

        return messages;

    } catch (error) {
        console.error('[PresetPromptLoader] Error loading preset prompts:', error);
        debug(SUBSYSTEM.CORE, `[PresetPromptLoader] Stack trace: ${error.stack}`);
        return [];
    }
}

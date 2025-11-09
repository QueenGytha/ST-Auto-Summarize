
// generateRawInterceptor.js - Global interceptor for all generateRaw calls
// Injects metadata into ALL LLM requests, including from SillyTavern core

import { generateRaw as _importedGenerateRaw } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { injectMetadata, injectMetadataIntoChatArray } from './metadataInjector.js';
import { getOperationSuffix } from './operationContext.js';
import { debug, error, SUBSYSTEM } from './index.js';
import { DEBUG_OUTPUT_SHORT_LENGTH, DEBUG_OUTPUT_MEDIUM_LENGTH } from './constants.js';

let _originalGenerateRaw  = null; // Store original function
let _isInterceptorActive  = false; // Prevent recursion

export async function wrappedGenerateRaw(options ) {
  debug(SUBSYSTEM.CORE, '[Interceptor] wrappedGenerateRaw called! isInterceptorActive:', _isInterceptorActive);

  // Prevent infinite recursion
  if (_isInterceptorActive) {
    debug(SUBSYSTEM.CORE, '[Interceptor] Recursion detected, calling original');
    return _importedGenerateRaw(options);
  }

  try {
    _isInterceptorActive = true;

    // Process prompt - handle both string and messages array formats
    if (options && options.prompt) {
      // Determine operation type from call stack or default
      const baseOperation = determineOperationType();

      // Get contextual suffix if set
      const suffix = getOperationSuffix();
      const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;

      debug(SUBSYSTEM.CORE, '[Interceptor] Operation type:', operation);

      if (typeof options.prompt === 'string') {
        // String prompt - inject at beginning
        debug(SUBSYSTEM.CORE, '[Interceptor] Processing string prompt (first 100 chars):', options.prompt.slice(0, DEBUG_OUTPUT_SHORT_LENGTH));

        const processedPrompt = injectMetadata(options.prompt, {
          operation: operation
        });

        debug(SUBSYSTEM.CORE, '[Interceptor] Processed prompt (first 200 chars):', processedPrompt.slice(0, DEBUG_OUTPUT_MEDIUM_LENGTH));
        options.prompt = processedPrompt;

      } else if (Array.isArray(options.prompt) && options.prompt.length > 0) {
        // Messages array - inject metadata using existing helper
        debug(SUBSYSTEM.CORE, '[Interceptor] Processing messages array with', options.prompt.length, 'messages');

        injectMetadataIntoChatArray(options.prompt, {
          operation: operation
        });

        debug(SUBSYSTEM.CORE, '[Interceptor] Injected metadata into messages array');
      } else {
        debug(SUBSYSTEM.CORE, '[Interceptor] Prompt format not recognized');
      }
    } else {
      debug(SUBSYSTEM.CORE, '[Interceptor] No prompt found in options');
    }

    // Call original function
    return await _importedGenerateRaw(options);
  } catch (err) {
    error(SUBSYSTEM.CORE, '[Interceptor] Error in wrapped generateRaw:', err);
    // Still call original on error
    return await _importedGenerateRaw(options);
  } finally {
    _isInterceptorActive = false;
  }
}

export function installGenerateRawInterceptor() {
  debug(SUBSYSTEM.CORE, '[Interceptor] Installing generateRaw interceptor...');

  try {
    // Strategy 1: Wrap on context object (for code that uses ctx.generateRaw)
    const ctx = getContext();
    debug(SUBSYSTEM.CORE, '[Interceptor] Context object exists:', !!ctx);

    if (ctx) {
      debug(SUBSYSTEM.CORE, '[Interceptor] ctx.generateRaw exists:', !!ctx.generateRaw);
      debug(SUBSYSTEM.CORE, '[Interceptor] ctx.generateRaw is function:', typeof ctx.generateRaw === 'function');

      if (typeof ctx.generateRaw === 'function') {
        _originalGenerateRaw = ctx.generateRaw;
        ctx.generateRaw = wrappedGenerateRaw;
        debug(SUBSYSTEM.CORE, '[Interceptor] ✓ Wrapped ctx.generateRaw');
        debug(SUBSYSTEM.CORE, '[Interceptor] Verification - ctx.generateRaw === wrappedGenerateRaw:', ctx.generateRaw === wrappedGenerateRaw);
      } else {
        debug(SUBSYSTEM.CORE, '[Interceptor] ctx.generateRaw not found or not a function');
      }
    }

    // Strategy 2: Wrap on window object (for global access)
    if (typeof window !== 'undefined') {
      debug(SUBSYSTEM.CORE, '[Interceptor] window.generateRaw exists:', !!window.generateRaw);
      debug(SUBSYSTEM.CORE, '[Interceptor] window.generateRaw is function:', typeof window.generateRaw === 'function');

      if (window.generateRaw) {
        if (!_originalGenerateRaw) {_originalGenerateRaw = window.generateRaw;}
        window.generateRaw = wrappedGenerateRaw;
        debug(SUBSYSTEM.CORE, '[Interceptor] ✓ Wrapped window.generateRaw');
        debug(SUBSYSTEM.CORE, '[Interceptor] Verification - window.generateRaw === wrappedGenerateRaw:', window.generateRaw === wrappedGenerateRaw);
      } else {
        debug(SUBSYSTEM.CORE, '[Interceptor] window.generateRaw not found');
      }
    }

    debug(SUBSYSTEM.CORE, '[Interceptor] ✓ Interceptor installed successfully');
    debug(SUBSYSTEM.CORE, '[Interceptor] NOTE: Extension code must import wrappedGenerateRaw to use interception');
  } catch (err) {
    error(SUBSYSTEM.CORE, '[Interceptor] Failed to install interceptor:', err);
  }
}

// eslint-disable-next-line complexity -- Stack trace analysis requires checking multiple conditions
function determineOperationType() {
  try {
    // Try to determine from call stack
    const stack = new Error('Stack trace for operation type detection').stack || '';

    // Check for specific scene operations FIRST (before generic recap_text check)
    // Scene operations often call recap_text(), so must be checked first
    if (stack.includes('detectSceneBreak') || stack.includes('autoSceneBreakDetection.js')) {
      return 'detect_scene_break';
    }
    if (stack.includes('generateSceneRecap') && !stack.includes('runningSceneRecap.js') && !stack.includes('generate_running_scene_recap') && !stack.includes('combine_scene_with_running_recap')) {
      return 'generate_scene_recap';
    }
    if (stack.includes('SceneName') || stack.includes('sceneNamePrompt')) {
      return 'generate_scene_name';
    }
    if (stack.includes('generate_running_scene_recap') || stack.includes('runningSceneRecap.js') || stack.includes('combine_scene_with_running_recap')) {
      // Check for specific running recap operations
      if (stack.includes('combine_scene_with_running_recap')) {
        return 'combine_scene_with_running';
      }
      return 'generate_running_recap';
    }

    // Check for validation operations
    if (stack.includes('validateRecap') || stack.includes('recapValidation.js')) {
      return 'validate_recap';
    }

    // Check for specific lorebook operations
    // Match actual function names used in the codebase
    if (stack.includes('runLorebookEntryLookupStage') || stack.includes('lookupLorebookEntry') || stack.includes('lorebookEntryLookup')) {
      return 'lorebook_entry_lookup';
    }
    if (stack.includes('runLorebookEntryDeduplicateStage') || stack.includes('resolveLorebookEntry') || stack.includes('lorebookEntryResolution')) {
      return 'resolve_lorebook_entry';
    }
    if (stack.includes('executeCreateAction') || stack.includes('createLorebookEntry') || stack.includes('addLorebookEntry')) {
      return 'create_lorebook_entry';
    }
    if (stack.includes('executeMergeAction') || stack.includes('mergeLorebookEntry')) {
      return 'merge_lorebook_entry';
    }
    if (stack.includes('updateRegistryRecord') || stack.includes('updateRegistryEntryContent') || stack.includes('updateLorebookRegistry') || stack.includes('updateRegistry')) {
      return 'update_lorebook_registry';
    }

    // Check for message recap generation (AFTER scene checks!)
    // This is generic and will match many operations, so must be last
    if (stack.includes('recap_text') || stack.includes('recapping.js')) {
      return 'recap';
    }

    // Default for chat messages and other operations
    return 'chat';
  } catch {
    return 'unknown';
  }
}

export function getOriginalGenerateRaw() {
  return _originalGenerateRaw;
}

// generateRawInterceptor.js - Global interceptor for all generateRaw calls
// Injects metadata into ALL LLM requests, including from SillyTavern core

import { generateRaw as _importedGenerateRaw } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { injectMetadata } from './metadataInjector.js';
import { getOperationSuffix } from './operationContext.js';

let _originalGenerateRaw  = null; // Store original function
let _isInterceptorActive  = false; // Prevent recursion

export async function wrappedGenerateRaw(options ) {
  console.log('[Auto-Summarize:Interceptor] wrappedGenerateRaw called! isInterceptorActive:', _isInterceptorActive);

  // Prevent infinite recursion
  if (_isInterceptorActive) {
    console.log('[Auto-Summarize:Interceptor] Recursion detected, calling original');
    return await _importedGenerateRaw(options);
  }

  try {
    _isInterceptorActive = true;

    // Process prompt if it exists
    if (options && typeof options.prompt === 'string') {
      console.log('[Auto-Summarize:Interceptor] Processing prompt (first 100 chars):', options.prompt.substring(0, 100));

      // Determine operation type from call stack or default
      const baseOperation = determineOperationType();

      // Get contextual suffix if set
      const suffix = getOperationSuffix();
      const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;

      console.log('[Auto-Summarize:Interceptor] Operation type:', operation);

      // Add metadata header
      const processedPrompt = injectMetadata(options.prompt, {
        operation: operation
      });

      console.log('[Auto-Summarize:Interceptor] Processed prompt (first 200 chars):', processedPrompt.substring(0, 200));

      options.prompt = processedPrompt;
    } else {
      console.log('[Auto-Summarize:Interceptor] No prompt found in options or not a string');
    }

    // Call original function
    return await _importedGenerateRaw(options);
  } catch (err) {
    console.error('[Auto-Summarize:Interceptor] Error in wrapped generateRaw:', err);
    // Still call original on error
    return await _importedGenerateRaw(options);
  } finally {
    _isInterceptorActive = false;
  }
}

export function installGenerateRawInterceptor() {
  console.log('[Auto-Summarize:Interceptor] Installing generateRaw interceptor...');

  try {
    // Strategy 1: Wrap on context object (for code that uses ctx.generateRaw)
    const ctx = getContext();
    console.log('[Auto-Summarize:Interceptor] Context object exists:', !!ctx);

    if (ctx) {
      console.log('[Auto-Summarize:Interceptor] ctx.generateRaw exists:', !!ctx.generateRaw);
      console.log('[Auto-Summarize:Interceptor] ctx.generateRaw is function:', typeof ctx.generateRaw === 'function');

      if (typeof ctx.generateRaw === 'function') {
        _originalGenerateRaw = ctx.generateRaw;
        ctx.generateRaw = wrappedGenerateRaw;
        console.log('[Auto-Summarize:Interceptor] ✓ Wrapped ctx.generateRaw');
        console.log('[Auto-Summarize:Interceptor] Verification - ctx.generateRaw === wrappedGenerateRaw:', ctx.generateRaw === wrappedGenerateRaw);
      } else {
        console.warn('[Auto-Summarize:Interceptor] ctx.generateRaw not found or not a function');
      }
    }

    // Strategy 2: Wrap on window object (for global access)
    if (typeof window !== 'undefined') {
      console.log('[Auto-Summarize:Interceptor] window.generateRaw exists:', !!window.generateRaw);
      console.log('[Auto-Summarize:Interceptor] window.generateRaw is function:', typeof window.generateRaw === 'function');

      if (window.generateRaw) {
        if (!_originalGenerateRaw) _originalGenerateRaw = window.generateRaw;
        window.generateRaw = wrappedGenerateRaw;
        console.log('[Auto-Summarize:Interceptor] ✓ Wrapped window.generateRaw');
        console.log('[Auto-Summarize:Interceptor] Verification - window.generateRaw === wrappedGenerateRaw:', window.generateRaw === wrappedGenerateRaw);
      } else {
        console.warn('[Auto-Summarize:Interceptor] window.generateRaw not found');
      }
    }

    console.log('[Auto-Summarize:Interceptor] ✓ Interceptor installed successfully');
    console.log('[Auto-Summarize:Interceptor] NOTE: Extension code must import wrappedGenerateRaw to use interception');
  } catch (err) {
    console.error('[Auto-Summarize:Interceptor] Failed to install interceptor:', err);
  }
}

// eslint-disable-next-line complexity
function determineOperationType() {
  try {
    // Try to determine from call stack
    const stack = new Error().stack || '';

    // Check for specific scene operations FIRST (before generic summarize_text check)
    // Scene operations often call summarize_text(), so must be checked first
    if (stack.includes('detectSceneBreak') || stack.includes('autoSceneBreakDetection.js')) {
      return 'detect_scene_break';
    }
    if (stack.includes('generateSceneSummary') && !stack.includes('Running')) {
      return 'generate_scene_summary';
    }
    if (stack.includes('SceneName') || stack.includes('sceneNamePrompt')) {
      return 'generate_scene_name';
    }
    if (stack.includes('generateRunningSceneSummary') || stack.includes('runningSceneSummary.js') || stack.includes('combineSceneWithRunning')) {
      // Check for specific running summary operations
      if (stack.includes('combineSceneWithRunning')) {
        return 'combine_scene_with_running';
      }
      return 'generate_running_summary';
    }

    // Check for validation operations
    if (stack.includes('validateSummary') || stack.includes('summaryValidation.js')) {
      return 'validate_summary';
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

    // Check for message summarization (AFTER scene checks!)
    // This is generic and will match many operations, so must be last
    if (stack.includes('summarize_text') || stack.includes('summarization.js')) {
      return 'summary';
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
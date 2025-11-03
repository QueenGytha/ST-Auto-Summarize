// @flow
// generateRawInterceptor.js - Global interceptor for all generateRaw calls
// Injects metadata into ALL LLM requests, including from SillyTavern core

// $FlowFixMe[cannot-resolve-module]
import { generateRaw as _importedGenerateRaw } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { injectMetadata } from './metadataInjector.js';

let _originalGenerateRaw /*: any */ = null; // Store original function
let _isInterceptorActive /*: boolean */ = false; // Prevent recursion

/**
 * Create wrapped version of generateRaw
 * This is exported and should be used instead of the original
 */
// $FlowFixMe[signature-verification-failure]
export async function wrappedGenerateRaw(options /*: any */) /*: Promise<any> */ {
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
            const operation = determineOperationType();
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

/**
 * Install global generateRaw interceptor
 * Tries multiple strategies to intercept all generateRaw calls
 * Must be called during extension initialization
 */
// $FlowFixMe[signature-verification-failure]
export function installGenerateRawInterceptor() /*: void */ {
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
        // $FlowFixMe[cannot-resolve-name]
        if (typeof window !== 'undefined') {
            // $FlowFixMe[cannot-resolve-name]
            console.log('[Auto-Summarize:Interceptor] window.generateRaw exists:', !!window.generateRaw);
            // $FlowFixMe[cannot-resolve-name]
            console.log('[Auto-Summarize:Interceptor] window.generateRaw is function:', typeof window.generateRaw === 'function');

            // $FlowFixMe[cannot-resolve-name]
            if (window.generateRaw) {
                // $FlowFixMe[cannot-resolve-name]
                if (!_originalGenerateRaw) _originalGenerateRaw = window.generateRaw;
                // $FlowFixMe[cannot-resolve-name]
                window.generateRaw = wrappedGenerateRaw;
                console.log('[Auto-Summarize:Interceptor] ✓ Wrapped window.generateRaw');
                // $FlowFixMe[cannot-resolve-name]
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

/**
 * Determine operation type from call context
 * Uses heuristics to identify the type of LLM operation
 * @returns {string} Operation type identifier
 */
// $FlowFixMe[signature-verification-failure]
function determineOperationType() /*: string */ {
    try {
        // Try to determine from call stack
        const stack = new Error().stack || '';

        // Check for specific operation types in call stack
        if (stack.includes('summarize_text') || stack.includes('summarization.js')) {
            return 'summary';
        }
        if (stack.includes('sceneBreak') || stack.includes('scene')) {
            return 'scene';
        }
        if (stack.includes('lorebook') || stack.includes('Lorebook')) {
            return 'lorebook';
        }
        if (stack.includes('validation') || stack.includes('validate')) {
            return 'validation';
        }

        // Default for chat messages and other operations
        return 'chat';
    } catch (err) {
        return 'unknown';
    }
}

/**
 * Get the original generateRaw function (for testing/debugging)
 * @returns {Function|null} Original generateRaw or null if not installed
 */
// $FlowFixMe[signature-verification-failure]
export function getOriginalGenerateRaw() /*: any */ {
    return _originalGenerateRaw;
}

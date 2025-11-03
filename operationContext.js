// @flow
// operationContext.js - Thread-local context storage for ST_METADATA operation suffixes
//
// This module provides a simple way to pass contextual information from high-level
// operations (e.g., scene summaries, lorebook lookups) down to the low-level
// generateRaw interceptor without modifying function signatures.
//
// Usage pattern:
//   import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';
//
//   setOperationSuffix('-42-67');  // e.g., message range
//   try {
//       await generateRaw(...);  // Interceptor will read suffix
//   } finally {
//       clearOperationSuffix();  // Always cleanup
//   }

/**
 * Thread-local context storage
 * JavaScript is single-threaded, so this is safe for concurrent operations
 */
let _context /*: { suffix: ?string } */ = { suffix: null };

/**
 * Set operation suffix for the current operation
 * This will be appended to the operation type in ST_METADATA
 * @param {string} suffix - The suffix to append (e.g., '-42-67', '-character-Anonfilly')
 */
export function setOperationSuffix(suffix /*: string */) /*: void */ {
    _context = { suffix };
}

/**
 * Get the current operation suffix
 * @returns {?string} The current suffix, or null if not set
 */
export function getOperationSuffix() /*: ?string */ {
    return _context.suffix;
}

/**
 * Clear the operation suffix
 * Should be called in a finally block to ensure cleanup
 */
export function clearOperationSuffix() /*: void */ {
    _context = { suffix: null };
}

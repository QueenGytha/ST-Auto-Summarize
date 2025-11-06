
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

let _context  = { suffix: null };

export function setOperationSuffix(suffix ) {
  _context = { suffix };
}

export function getOperationSuffix() {
  return _context.suffix;
}

export function clearOperationSuffix() {
  _context = { suffix: null };
}
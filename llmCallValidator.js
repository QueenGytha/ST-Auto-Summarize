
// llmCallValidator.js - Runtime validation for LLM call counts in operations

/**
 * LLM Call Validator
 *
 * This module provides runtime validation to enforce the rule:
 * "Each operation should make at most ONE LLM call"
 *
 * Enable in development mode to catch violations early.
 */

// Global state
let validationEnabled  = false;
let currentOperationId  = null;
let currentOperationType  = null;
let llmCallsInCurrentOperation  = 0;
let llmCallDetails  = [];
let violations  = [];

// Logging functions (will be initialized)
let debug  = console.log;
let error  = console.error;
let log  = console.log;

/**
 * Initialize the validator
 */
export function initLLMCallValidator(utils ) {
  if (utils) {
    debug = utils.debug || console.log;
    error = utils.error || console.error;
    log = utils.log || console.log;
  }
}

/**
 * Enable validation (call this in development mode)
 */
export function enableLLMCallValidation() {
  validationEnabled = true;
  log('[LLM Validator] Enabled - will check for multiple LLM calls per operation');
}

/**
 * Disable validation
 */
export function disableLLMCallValidation() {
  validationEnabled = false;
}

/**
 * Check if validation is enabled
 */
export function isValidationEnabled() {
  return validationEnabled;
}

/**
 * Mark the start of an operation
 * Call this before executing an operation handler
 */
export function beginOperation(operationId , operationType ) {
  if (!validationEnabled) return;

  currentOperationId = operationId;
  currentOperationType = operationType;
  llmCallsInCurrentOperation = 0;
  llmCallDetails = [];

  debug(`[LLM Validator] Begin operation: ${operationType} (${operationId})`);
}

/**
 * Record an LLM call
 * Call this whenever generateRaw or similar LLM function is invoked
 */
export function recordLLMCall(callInfo  = {}) {
  if (!validationEnabled || !currentOperationId) return;

  llmCallsInCurrentOperation++;

  const callDetail = {
    operationId: currentOperationId,
    operationType: currentOperationType,
    callNumber: llmCallsInCurrentOperation,
    timestamp: Date.now(),
    prompt: callInfo.prompt?.substring(0, 100) || 'unknown',
    stackTrace: new Error().stack
  };

  llmCallDetails.push(callDetail);

  debug(`[LLM Validator] LLM call #${llmCallsInCurrentOperation} in ${currentOperationType || 'unknown'}`);

  // Warn immediately if more than 1 call
  if (llmCallsInCurrentOperation > 1) {
    const violation = {
      operationId: currentOperationId,
      operationType: currentOperationType,
      callCount: llmCallsInCurrentOperation,
      calls: [...llmCallDetails]
    };

    error(
      `[LLM Validator] ❌ VIOLATION: Operation "${currentOperationType || 'unknown'}" made ${llmCallsInCurrentOperation} LLM calls!\n` +
      `This operation should be split into ${llmCallsInCurrentOperation} separate operations.\n` +
      `Rate limit retries will waste tokens by re-running successful LLM calls.`
    );

    violations.push(violation);
  }
}

/**
 * Mark the end of an operation
 * Call this after operation handler completes
 */
export function endOperation(_success  = true) {
  if (!validationEnabled || !currentOperationId) return;

  const operationType = currentOperationType || 'unknown';
  const callCount = llmCallsInCurrentOperation;

  if (callCount > 1) {
    error(
      `[LLM Validator] ❌ Operation "${operationType}" completed with ${callCount} LLM calls. ` +
      `This violates the single LLM call rule.`
    );
  } else if (callCount === 1) {
    debug(`[LLM Validator] ✓ Operation "${operationType}" correctly made 1 LLM call`);
  } else {
    debug(`[LLM Validator] ✓ Operation "${operationType}" made no LLM calls (expected for non-LLM operations)`);
  }

  // Reset state
  currentOperationId = null;
  currentOperationType = null;
  llmCallsInCurrentOperation = 0;
  llmCallDetails = [];
}

/**
 * Get all violations
 */
export function getViolations() {
  return violations;
}

/**
 * Clear violations
 */
export function clearViolations() {
  violations = [];
}

/**
 * Get violation report
 */
export function getViolationReport() {
  if (violations.length === 0) {
    return '✅ No LLM call violations detected';
  }

  const lines = [
  '❌ LLM CALL VIOLATIONS DETECTED',
  '='.repeat(80),
  '',
  `Found ${violations.length} operation(s) that made multiple LLM calls:`,
  ''];


  violations.forEach((v, index) => {
    lines.push(`${index + 1}. Operation: ${v.operationType} (${v.operationId})`);
    lines.push(`   LLM Calls: ${v.callCount}`);
    lines.push(`   Issue: Should be split into ${v.callCount} separate operations`);
    lines.push('');
  });

  lines.push('='.repeat(80));
  lines.push('');
  lines.push('CRITICAL: Each operation must make at most ONE LLM call.');
  lines.push('This ensures efficient retry behavior when rate limits are hit.');
  lines.push('');

  return lines.join('\n');
}

/**
 * Wrapper for generateRaw that automatically records LLM calls
 *
 * Usage in index.js:
 *   import { generateRaw } from '../../../../script.js';
 *   import { wrapGenerateRaw } from './llmCallValidator.js';
 *   const trackedGenerateRaw = wrapGenerateRaw(generateRaw);
 *   // Use trackedGenerateRaw instead of generateRaw
 */
export function wrapGenerateRaw(generateRawFn ) {
  return async function wrappedGenerateRaw(...args ) {
    // Record the call
    recordLLMCall({
      prompt: args[0]?.prompt
    });

    // Execute the actual LLM call
    return await generateRawFn(...args);
  };
}

/**
 * Integration with operation queue
 *
 * Add this to operationQueue.js executeOperation():
 *
 * import { beginOperation, endOperation, isValidationEnabled } from './llmCallValidator.js';
 *
 * async function executeOperation(operation) {
 *     if (isValidationEnabled()) {
 *         beginOperation(operation.id, operation.type);
 *     }
 *
 *     try {
 *         const result = await handler(operation);
 *         if (isValidationEnabled()) {
 *             endOperation(true);
 *         }
 *         return result;
 *     } catch (err) {
 *         if (isValidationEnabled()) {
 *             endOperation(false);
 *         }
 *         throw err;
 *     }
 * }
 */

export default {
  initLLMCallValidator,
  enableLLMCallValidation,
  disableLLMCallValidation,
  isValidationEnabled,
  beginOperation,
  recordLLMCall,
  endOperation,
  getViolations,
  clearViolations,
  getViolationReport,
  wrapGenerateRaw
};
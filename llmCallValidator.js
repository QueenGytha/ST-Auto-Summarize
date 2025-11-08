
// llmCallValidator.js - Runtime validation for LLM call counts in operations

import { debug, error, log } from './index.js';
import { DEBUG_OUTPUT_SHORT_LENGTH, SEPARATOR_LINE_LENGTH } from './constants.js';

// Global state
let validationEnabled  = false;
let currentOperationId  = null;
let currentOperationType  = null;
let llmCallsInCurrentOperation  = 0;
let llmCallDetails  = [];
let violations  = [];

export function initLLMCallValidator(utils ) {
  if (utils) {
    // These are fallback assignments - console usage is legitimate here as fallback
    debug = utils.debug || console.log; // eslint-disable-line no-console -- Fallback for debug when utils not available
    error = utils.error || console.error;
    log = utils.log || console.log; // eslint-disable-line no-console -- Fallback for log when utils not available
  }
}

export function enableLLMCallValidation() {
  validationEnabled = true;
  log('[LLM Validator] Enabled - will check for multiple LLM calls per operation');
}

export function disableLLMCallValidation() {
  validationEnabled = false;
}

export function isValidationEnabled() {
  return validationEnabled;
}

export function beginOperation(operationId , operationType ) {
  if (!validationEnabled) {return;}

  currentOperationId = operationId;
  currentOperationType = operationType;
  llmCallsInCurrentOperation = 0;
  llmCallDetails = [];

  debug(`[LLM Validator] Begin operation: ${operationType} (${operationId})`);
}

export function recordLLMCall(callInfo  = {}) {
  if (!validationEnabled || !currentOperationId) {return;}

  llmCallsInCurrentOperation++;

  const callDetail = {
    operationId: currentOperationId,
    operationType: currentOperationType,
    callNumber: llmCallsInCurrentOperation,
    timestamp: Date.now(),
    prompt: callInfo.prompt?.slice(0, DEBUG_OUTPUT_SHORT_LENGTH) || 'unknown',
    stackTrace: new Error('Stack trace for LLM call tracking').stack
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

export function endOperation(_success  = true) {
  if (!validationEnabled || !currentOperationId) {return;}

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

export function getViolations() {
  return violations;
}

export function clearViolations() {
  violations = [];
}

export function getViolationReport() {
  if (violations.length === 0) {
    return '✅ No LLM call violations detected';
  }

  const lines = [
  '❌ LLM CALL VIOLATIONS DETECTED',
  '='.repeat(SEPARATOR_LINE_LENGTH),
  '',
  `Found ${violations.length} operation(s) that made multiple LLM calls:`,
  ''];


  for (const [index, v] of violations.entries()) {
    lines.push(`${index + 1}. Operation: ${v.operationType} (${v.operationId})`);
    lines.push(`   LLM Calls: ${v.callCount}`);
    lines.push(`   Issue: Should be split into ${v.callCount} separate operations`);
    lines.push('');
  }

  lines.push('='.repeat(SEPARATOR_LINE_LENGTH));
  lines.push('');
  lines.push('CRITICAL: Each operation must make at most ONE LLM call.');
  lines.push('This ensures efficient retry behavior when rate limits are hit.');
  lines.push('');

  return lines.join('\n');
}

export function wrapGenerateRaw(generateRawFn ) {
  // eslint-disable-next-line require-await -- Wrapper maintains async signature of generateRaw
  return async function wrappedGenerateRaw(...args ) {
    // Record the call
    recordLLMCall({
      prompt: args[0]?.prompt
    });

    // Execute the actual LLM call
    return generateRawFn(...args);
  };
}

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
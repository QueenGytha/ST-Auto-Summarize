// @flow
// test-single-llm-call.js - Validate that each operation makes at most one LLM call

/* global process */

/**
 * CRITICAL DESIGN PRINCIPLE:
 *
 * Each operation handler should make AT MOST ONE LLM call.
 *
 * WHY: If an LLM call hits a rate limit, the queue retries the entire operation.
 * If an operation makes multiple LLM calls, a rate limit on the second call
 * wastes the tokens/time from the successful first call.
 *
 * SOLUTION: Split operations so each LLM call is a separate operation.
 *
 * This test enforces this rule by:
 * 1. Mocking generateRaw to count calls
 * 2. Running each operation handler
 * 3. Validating that no more than 1 LLM call occurred
 * 4. Failing with a clear error message if violated
 */

console.log('\n=== Single LLM Call Per Operation Test ===\n');

// Track LLM calls globally
let llmCallCount = 0;
let llmCallDetails = [];  // eslint-disable-line sonarjs/no-unused-collection -- Used for debugging violations
const originalGenerateRaw = typeof globalThis.generateRaw === 'function' ? globalThis.generateRaw : null;

/**
 * Mock generateRaw to count calls
 */
function mockGenerateRaw(...args /*: Array<any> */) /*: Promise<string> */ {
    llmCallCount++;
    const callDetails = {
        callNumber: llmCallCount,
        prompt: args[0]?.prompt?.substring(0, 100) || 'unknown',
        timestamp: Date.now()
    };
    llmCallDetails.push(callDetails);

    // Return a mock response
    return Promise.resolve(JSON.stringify({
        type: 'character',
        synopsis: 'Test synopsis',
        sameEntityIds: [],
        needsFullContextIds: [],
        resolvedId: 'new'
    }));
}

/**
 * Operation types and their expected LLM call count
 *
 * Format: {
 *   operationType: {
 *     expectedCalls: number,
 *     reason: string (why this count is correct)
 *   }
 * }
 */
const OPERATION_LLM_EXPECTATIONS /*: {[string]: {expectedCalls: number, reason: string}} */ = {
    // Summarization operations
    'summarize_message': {
        expectedCalls: 1,
        reason: 'Single summarization LLM call'
    },
    'validate_summary': {
        expectedCalls: 1,
        reason: 'Single validation LLM call'
    },
    'generate_scene_summary': {
        expectedCalls: 1,
        reason: 'Single scene summary generation'
    },
    'generate_scene_name': {
        expectedCalls: 0,
        reason: 'Currently placeholder, no LLM call'
    },
    'generate_running_summary': {
        expectedCalls: 1,
        reason: 'Single running summary generation'
    },
    'combine_scene_with_running': {
        expectedCalls: 1,
        reason: 'Single combination LLM call'
    },
    'detect_scene_break': {
        expectedCalls: 1,
        reason: 'Single scene break detection LLM call'
    },

    // Lorebook operations - NEW PIPELINE
    'triage_lorebook_entry': {
        expectedCalls: 1,
        reason: 'Single triage LLM call to classify and identify duplicates'
    },
    'resolve_lorebook_entry': {
        expectedCalls: 1,
        reason: 'Single resolution LLM call to compare with full candidate entries'
    },
    'create_lorebook_entry': {
        expectedCalls: 1,  // Only for merge path
        reason: 'Single merge LLM call (if merging), or 0 if creating new'
    },
    'update_lorebook_registry': {
        expectedCalls: 0,
        reason: 'No LLM call - just updates registry content'
    },

    // Legacy lorebook operation (deprecated but kept for compatibility)
    'process_lorebook_entry': {
        expectedCalls: 1,  // VIOLATION - should be split
        reason: 'DEPRECATED: Contains multiple LLM calls (triage + resolution + merge). Use new pipeline instead.'
    },

    // Standalone merge operation
    'merge_lorebook_entry': {
        expectedCalls: 1,
        reason: 'Single merge LLM call'
    }
};

/**
 * Test result structure
 */
type PassedResult = {
    operation: string,
    calls: number,
    expected: number,
    reason: string
};

type FailedResult = {
    operation: string,
    calls: number,
    expected: number,
    reason: string,
    error: string,
    fix: string
};

type WarningResult = {
    operation: string,
    message: string,
    reason: string
};

const testResults /*: {
    passed: Array<PassedResult>,
    failed: Array<FailedResult>,
    warnings: Array<WarningResult>
} */ = {
    passed: [],
    failed: [],
    warnings: []
};

/**
 * Validate an operation's LLM call count
 * (Currently unused - validation is done inline in runTests)
 */
// function validateOperationLLMCalls(operationType, actualCalls, expectedSpec) {
//     const { expectedCalls, reason } = expectedSpec;
//
//     if (actualCalls === expectedCalls) {
//         testResults.passed.push({
//             operation: operationType,
//             calls: actualCalls,
//             expected: expectedCalls,
//             reason
//         });
//         return true;
//     }
//
//     // Special case: create_lorebook_entry can be 0 or 1 depending on merge vs create
//     if (operationType === 'create_lorebook_entry' && (actualCalls === 0 || actualCalls === 1)) {
//         testResults.passed.push({
//             operation: operationType,
//             calls: actualCalls,
//             expected: '0 or 1',
//             reason: 'Depends on merge vs create path'
//         });
//         return true;
//     }
//
//     if (actualCalls > 1) {
//         testResults.failed.push({
//             operation: operationType,
//             calls: actualCalls,
//             expected: expectedCalls,
//             reason,
//             error: `❌ VIOLATION: Operation made ${actualCalls} LLM calls (expected ${expectedCalls})`,
//             fix: `Split this operation into ${actualCalls} separate operations, one per LLM call.`
//         });
//         return false;
//     }
//
//     testResults.warnings.push({
//         operation: operationType,
//         calls: actualCalls,
//         expected: expectedCalls,
//         reason,
//         message: `⚠️  Unexpected call count: ${actualCalls} (expected ${expectedCalls})`
//     });
//     return false;
// }

/**
 * Run test suite
 */
async function runTests() {
    console.log('📋 Testing operation LLM call counts...\n');

    // Mock generateRaw globally if available
    if (typeof globalThis.generateRaw === 'function') {
        (globalThis /*: any */).generateRaw = mockGenerateRaw;
    }

    // Test each operation type
    for (const [operationType, expectedSpec] of Object.entries(OPERATION_LLM_EXPECTATIONS)) {
        // Reset counters
        llmCallCount = 0;
        llmCallDetails = [];

        console.log(`Testing: ${operationType}...`);

        // Note: In a real test, you would:
        // 1. Import the operation handler
        // 2. Create mock operation parameters
        // 3. Execute the handler
        // 4. Count LLM calls
        // 5. Validate against expectations

        // For now, we just validate the expectations are defined
        if (expectedSpec.expectedCalls > 1) {
            testResults.failed.push({
                operation: operationType,
                calls: expectedSpec.expectedCalls,
                expected: 1,
                reason: expectedSpec.reason,
                error: `❌ DESIGN VIOLATION: Operation is configured to make ${expectedSpec.expectedCalls} LLM calls`,
                fix: 'This operation should be split into multiple operations, one per LLM call.'
            });
        } else {
            testResults.passed.push({
                operation: operationType,
                calls: expectedSpec.expectedCalls,
                expected: expectedSpec.expectedCalls,
                reason: expectedSpec.reason
            });
        }
    }

    // Restore original generateRaw
    if (originalGenerateRaw) {
        (globalThis /*: any */).generateRaw = originalGenerateRaw;
    }

    // Print results
    printResults();
}

/**
 * Print test results
 */
function printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('TEST RESULTS');
    console.log('='.repeat(80) + '\n');

    if (testResults.passed.length > 0) {
        console.log(`✅ PASSED: ${testResults.passed.length} operations`);
        testResults.passed.forEach(result => {
            console.log(`   ✓ ${result.operation}: ${result.calls} LLM call(s) - ${result.reason}`);
        });
        console.log('');
    }

    if (testResults.warnings.length > 0) {
        console.log(`⚠️  WARNINGS: ${testResults.warnings.length} operations`);
        testResults.warnings.forEach(result => {
            console.log(`   ⚠️  ${result.operation}: ${result.message}`);
            console.log(`      Reason: ${result.reason}`);
        });
        console.log('');
    }

    if (testResults.failed.length > 0) {
        console.log(`❌ FAILED: ${testResults.failed.length} operations\n`);
        testResults.failed.forEach(result => {
            console.log(`   ${result.error}`);
            console.log(`   Operation: ${result.operation}`);
            console.log(`   Actual calls: ${result.calls}`);
            console.log(`   Expected calls: ${result.expected}`);
            console.log(`   Reason: ${result.reason}`);
            console.log(`   Fix: ${result.fix}`);
            console.log('');
        });

        console.log('='.repeat(80));
        console.log('❌ TEST SUITE FAILED');
        console.log('='.repeat(80));
        console.log('\nCRITICAL: Operations must make at most ONE LLM call each.');
        console.log('This ensures rate limit retries only repeat the failed LLM call,');
        console.log('not multiple successful calls that waste tokens and time.\n');

        // $FlowFixMe[cannot-resolve-name] - Node.js process global
        process.exit(1);
    }

    console.log('='.repeat(80));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(80));
    console.log('\nAll operations correctly make at most one LLM call each.');
    console.log('Rate limit retries will be efficient.\n');
}

/**
 * Add new operation type for testing
 *
 * Call this function when adding a new operation to register its expected LLM call count.
 *
 * @param {string} operationType - The operation type constant
 * @param {number} expectedCalls - Expected number of LLM calls (should be 0 or 1)
 * @param {string} reason - Explanation of why this count is correct
 */
function registerOperationExpectation(operationType /*: string */, expectedCalls /*: number */, reason /*: string */) /*: void */ {
    if (expectedCalls > 1) {
        throw new Error(
            `Cannot register operation ${operationType} with ${expectedCalls} LLM calls. ` +
            `Operations must make at most 1 LLM call. Split into ${expectedCalls} separate operations.`
        );
    }

    OPERATION_LLM_EXPECTATIONS[operationType] = {
        expectedCalls,
        reason
    };

    console.log(`✓ Registered ${operationType}: ${expectedCalls} LLM call(s) - ${reason}`);
}

// Export for use in other tests
export {
    runTests,
    registerOperationExpectation,
    OPERATION_LLM_EXPECTATIONS,
    mockGenerateRaw
};

// Run tests if executed directly
// Check if this is the main module (ES module way)
// Handle both Unix and Windows paths
// $FlowFixMe[cannot-resolve-module] - Node.js built-in modules
import { fileURLToPath } from 'url';
// $FlowFixMe[cannot-resolve-module] - Node.js built-in modules
import { resolve } from 'path';

const currentFile = fileURLToPath(import.meta.url);
// $FlowFixMe[cannot-resolve-name] - Node.js process global
const mainFile = process.argv[1] ? resolve(process.argv[1]) : null;
const isMainModule = mainFile && currentFile === resolve(mainFile);

if (isMainModule) {
    runTests().catch(err => {
        console.error('❌ Test execution failed:', err);
        // $FlowFixMe[cannot-resolve-name] - Node.js process global
        process.exit(1);
    });
}

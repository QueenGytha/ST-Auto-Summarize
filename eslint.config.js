// ESLint v9+ flat config format
/* eslint-disable import/namespace, import/default -- ESLint plugins may use syntax that import validation can't parse */
import complexity from 'eslint-plugin-complexity';
import sonarjs from 'eslint-plugin-sonarjs';
import importPlugin from 'eslint-plugin-import';
import promisePlugin from 'eslint-plugin-promise';
import noFloatingPromise from 'eslint-plugin-no-floating-promise';
import unicorn from 'eslint-plugin-unicorn';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import {
  MAX_LINE_LENGTH,
  MAX_NESTING_DEPTH,
  MAX_NESTED_CALLBACKS,
  MAX_FUNCTION_PARAMS,
} from './constants.js';

export default [
{
  // Apply to all JS files
  files: ['**/*.js'],

  plugins: {
    complexity,
    sonarjs,
    import: importPlugin,
    promise: promisePlugin,
    'no-floating-promise': noFloatingPromise,
    unicorn,
    '@eslint-community/eslint-comments': eslintComments
  },

  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: {
      // Browser environment
      window: 'readonly',
      document: 'readonly',
      console: 'readonly',
      setTimeout: 'readonly',
      setInterval: 'readonly',
      clearTimeout: 'readonly',
      clearInterval: 'readonly',
      confirm: 'readonly',
      URL: 'readonly',
      structuredClone: 'readonly',

      // jQuery
      $: 'readonly',
      jQuery: 'readonly',

      // SillyTavern globals
      toastr: 'readonly',
      eventSource: 'readonly',
      event_types: 'readonly',
      saveSettingsDebounced: 'readonly',
      getContext: 'readonly',
      alert: 'readonly',
      fetch: 'readonly',
      download: 'readonly',
      parseJsonFile: 'readonly',
      prompt: 'readonly'
    }
  },

  rules: {
    // ERROR PREVENTION (would have caught the toast bug)
    'no-undef': 'error', // Catch undefined variables like 'toast'
    'no-unused-vars': ['error', { // Catch unused imports
      vars: 'all',
      args: 'after-used',
      ignoreRestSiblings: true,
      argsIgnorePattern: '^_' // Allow _unused convention
    }],
    'no-use-before-define': ['error', { // Catch using variables before declaration
      functions: false, // Allow function hoisting
      classes: true,
      variables: true
    }],

    // IMPORT VALIDATION (catches exported-but-undefined functions)
    'import/named': 'error', // Validate named imports exist in target module
    'import/namespace': 'error', // Validate namespace imports
    'import/default': 'error', // Validate default imports exist

    // COMMON BUGS
    'no-const-assign': 'error', // Catch const reassignment
    'no-dupe-keys': 'error', // Catch duplicate object keys
    'no-duplicate-case': 'error', // Catch duplicate switch cases
    'no-unreachable': 'error', // Catch unreachable code after return/throw
    'no-empty': ['error', { // Catch empty blocks
      allowEmptyCatch: true // Allow empty catch blocks
    }],
    'no-ex-assign': 'error', // Catch reassigning exception variable
    'no-fallthrough': 'error', // Catch missing break in switch
    'no-irregular-whitespace': 'error', // Catch weird whitespace characters
    'no-obj-calls': 'error', // Catch calling global objects as functions
    'no-prototype-builtins': 'error', // Catch unsafe hasOwnProperty calls
    'no-sparse-arrays': 'error', // Catch [1,,3]
    'no-unexpected-multiline': 'error', // Catch unexpected semicolon insertion
    'use-isnan': 'error', // Catch comparing with NaN directly

    // ASYNC/PROMISE ERRORS
    'no-async-promise-executor': 'error', // Catch async promise executor
    'no-await-in-loop': 'warn', // Warn about await in loop (performance)
    'no-promise-executor-return': 'off', // Disabled due to false positives with setTimeout
    'require-atomic-updates': 'off', // Disabled due to false positives

    // LOGICAL ERRORS
    'no-cond-assign': 'error', // Catch assignment in condition
    'no-constant-condition': 'error', // Catch if(true) etc
    'no-dupe-else-if': 'error', // Catch duplicate else-if conditions
    'no-self-assign': 'error', // Catch x = x
    'no-self-compare': 'error', // Catch x === x
    'no-template-curly-in-string': 'warn', // Catch "${x}" in regular string
    'no-unmodified-loop-condition': 'error', // Catch infinite loops
    'no-unreachable-loop': 'error', // Catch loops that only run once

    // CODE QUALITY
    'eqeqeq': ['error', 'always', { // Require === instead of ==
      null: 'ignore' // Allow == null check
    }],
    'no-eval': 'error', // Disallow eval()
    'no-implied-eval': 'error', // Disallow setTimeout("code")
    'no-throw-literal': 'error', // Require throwing Error objects
    'prefer-promise-reject-errors': 'error', // Require rejecting with Error objects

    // STYLE (not critical but helpful)
    'no-var': 'warn', // Prefer let/const over var
    'prefer-const': 'warn', // Prefer const when not reassigned
    'no-multiple-empty-lines': ['warn', { // Limit empty lines
      max: 2,
      maxEOF: 1
    }],

    // AI DEVELOPMENT SAFEGUARDS
    'no-console': ['error', { // Block console.log, force debug() subsystem
      allow: ['warn', 'error']
    }],
    'consistent-return': 'error', // Catch functions with inconsistent return statements
    'no-magic-numbers': ['error', { // Force named constants for magic numbers
      ignore: [0, 1, -1, 2], // Allow common numbers
      ignoreArrayIndexes: true,
      ignoreDefaultValues: true,
      enforceConst: true,
      detectObjects: false // Don't flag object property values
    }],
    'no-warning-comments': ['error', { // Block TODO/FIXME comments
      terms: ['TODO', 'FIXME', 'XXX'],
      location: 'start'
    }],

    // PROMISE/ASYNC HANDLING (prevents silent failures and race conditions)
    'promise/catch-or-return': 'error', // Require .catch() or return on promises
    'promise/no-return-wrap': 'error', // Avoid unnecessary Promise.resolve() wrapping
    'promise/param-names': 'error', // Enforce standard resolve/reject naming
    'promise/always-return': 'error', // Require return in .then() to maintain chain
    'promise/no-nesting': 'warn', // Discourage nested .then() (callback hell)
    'promise/no-promise-in-callback': 'error', // Don't create promises inside callbacks
    'promise/no-callback-in-promise': 'error', // Don't use callbacks inside promises
    'promise/avoid-new': 'off', // Disabled: setTimeout delays and abort controller patterns require new Promise (no alternative exists)
    'promise/prefer-await-to-then': 'warn', // Prefer async/await over .then()
    'no-floating-promise/no-floating-promise': 'error', // Catch missing await on async functions

    // CODE QUALITY - UNICORN (catches outdated patterns and inefficiencies)
    'unicorn/error-message': 'error', // Require error messages in new Error()
    'unicorn/no-array-callback-reference': 'off', // Disabled: false positives with jQuery .find() (DOM selector, not Array method)
    'unicorn/prefer-array-find': 'error', // Use .find() instead of .filter()[0]
    'unicorn/prefer-array-some': 'error', // Use .some() instead of .filter().length
    'unicorn/prefer-default-parameters': 'error', // Use default params instead of x || default
    'unicorn/prefer-includes': 'error', // Use .includes() instead of .indexOf() !== -1
    'unicorn/prefer-number-properties': 'error', // Use Number.isNaN instead of global isNaN
    'unicorn/prefer-optional-catch-binding': 'error', // Allow catch without error param
    'unicorn/throw-new-error': 'error', // Require 'new' when throwing Error
    'unicorn/no-useless-undefined': 'error', // Avoid explicit return undefined
    'unicorn/consistent-function-scoping': 'warn', // Prevent unnecessarily nested functions
    'unicorn/prefer-ternary': 'warn', // Suggest ternary over if/else when appropriate
    'unicorn/no-array-for-each': 'warn', // Prefer for-of over forEach for flexibility

    // FUNCTION COMPLEXITY LIMITS (prevents AI creating massive functions)
    'max-depth': ['error', MAX_NESTING_DEPTH], // Max nesting depth of blocks
    'max-nested-callbacks': ['error', MAX_NESTED_CALLBACKS], // Max callback nesting
    'max-params': ['error', MAX_FUNCTION_PARAMS], // Max function parameters
    'max-lines-per-function': ['warn', { // Max lines per function
      max: 200,
      skipBlankLines: true,
      skipComments: true
    }],

    // PARAMETER & STYLE SAFEGUARDS
    'no-param-reassign': ['error', { // Prevent mutating function parameters
      props: false // Allow modifying properties of params
    }],
    'curly': 'error', // Require braces around all blocks

    // DEAD CODE DETECTION (catches AI rushing/incomplete work)
    // ESLint comments discipline
    '@eslint-community/eslint-comments/disable-enable-pair': ['error', { allowWholeFile: true }],
    '@eslint-community/eslint-comments/no-aggregating-enable': 'error',
    '@eslint-community/eslint-comments/no-duplicate-disable': 'error',
    '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
    '@eslint-community/eslint-comments/no-unused-disable': 'error',
    '@eslint-community/eslint-comments/no-unused-enable': 'error',
    '@eslint-community/eslint-comments/require-description': 'error',

    // Built-in dead code rules
    'no-useless-return': 'error', // Return with no value at end of function
    'no-useless-concat': 'error', // String concatenation that could be literals
    'no-useless-constructor': 'error', // Empty constructors
    'require-await': 'warn', // Async functions without await
    'no-unused-expressions': 'error', // Statements with no effect
    // NOTE: 'no-return-await' removed (deprecated). Modern best practice is to keep 'return await' for better stack traces.

    // Unicorn dead code rules
    'unicorn/no-useless-promise-resolve-reject': 'error', // Unnecessary Promise.resolve/reject
    'unicorn/no-useless-switch-case': 'error', // Switch cases that do nothing
    'unicorn/no-useless-fallback-in-spread': 'error', // Redundant fallbacks in spread

    // Architecture enforcement
    'no-restricted-syntax': ['error',
      {
        selector: 'CallExpression[callee.name="generateRaw"]',
        message: 'Direct generateRaw() calls not allowed. Use enqueueOperation() to maintain queue integrity.',
      },
      {
        selector: 'CallExpression[callee.property.name="then"]',
        message: 'Prefer async/await over .then() chains for better AI code comprehension.',
      },
    ],

    // BROWSER EXTENSION-SPECIFIC RULES (memory leaks, real bugs, type safety)
    // Memory & Performance
    'unicorn/no-invalid-remove-event-listener': 'error', // Event listeners never removed (memory leaks)
    'radix': 'error', // Require radix parameter in parseInt (octal bugs)

    // Type Safety
    'valid-typeof': 'error', // Catch typeof typos ("strnig" instead of "string")
    'no-unsafe-optional-chaining': 'error', // Prevent using optional chain result in operations

    // Logic Errors
    'no-loop-func': 'error', // Functions in loops (closure bugs)
    'no-redeclare': 'error', // Variable redeclaration bugs

    // Import Safety
    'import/no-self-import': 'error', // Prevent file importing itself

    // Modern API Enforcement
    'unicorn/prefer-string-slice': 'error', // Use .slice() instead of deprecated .substr()/.substring()
    'unicorn/prefer-string-starts-ends-with': 'error', // Use .startsWith()/.endsWith() instead of indexOf

    // Promise Quality
    'promise/no-return-in-finally': 'error', // Prevent return in finally block
    'promise/valid-params': 'error', // Validate Promise constructor parameters

    // Code Quality
    'no-shadow': 'warn', // Variable shadowing (can cause confusion)

    // COMPLEXITY ANALYSIS (critical for AI-generated code)
    'complexity': ['error', { max: 20 }], // Error on functions with complexity > 20

    // SONARJS CODE QUALITY RULES (only using rules available in v3.0.5)
    'sonarjs/cognitive-complexity': ['error', MAX_LINE_LENGTH], // Error on high cognitive complexity
    'sonarjs/no-all-duplicated-branches': 'error', // Catch if/else with same code
    'sonarjs/no-collection-size-mischeck': 'error', // Catch .length === 0 bugs
    'sonarjs/no-duplicate-string': ['warn', { // Warn on repeated strings
      threshold: 5 // Only warn if string appears 5+ times
    }],
    'sonarjs/no-duplicated-branches': 'error', // Catch duplicated if/else branches
    'sonarjs/no-element-overwrite': 'error', // Catch array[i] = x; array[i] = y;
    'sonarjs/no-empty-collection': 'error', // Catch iterating over empty collection
    'sonarjs/no-extra-arguments': 'error', // Catch calling with too many args
    'sonarjs/no-identical-conditions': 'error', // Catch if (x) else if (x)
    'sonarjs/no-identical-expressions': 'error', // Catch x === x bugs
    'sonarjs/no-identical-functions': 'warn', // Warn on duplicate functions
    'sonarjs/no-inverted-boolean-check': 'warn', // Suggest !x instead of x === false
    'sonarjs/no-redundant-boolean': 'warn', // Catch x === true, x === false
    'sonarjs/no-unused-collection': 'error', // Catch creating but not using arrays
    'sonarjs/no-use-of-empty-return-value': 'error', // Catch using void return values
    'sonarjs/prefer-immediate-return': 'warn', // Suggest immediate return
    'sonarjs/prefer-object-literal': 'warn', // Suggest object literal over Object()
    'sonarjs/prefer-single-boolean-return': 'warn', // Simplify boolean returns
    'sonarjs/prefer-while': 'warn' // Suggest while over for when appropriate
  }
}];
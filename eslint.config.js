// ESLint v9+ flat config format
import complexity from 'eslint-plugin-complexity';
import sonarjs from 'eslint-plugin-sonarjs';
import importPlugin from 'eslint-plugin-import';
import { MAX_LINE_LENGTH } from './constants.js';

export default [
{
  // Apply to all JS files
  files: ['**/*.js'],

  plugins: {
    complexity,
    sonarjs,
    import: importPlugin
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
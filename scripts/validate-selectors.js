#!/usr/bin/env node

/*
 * Selector Validation Script
 *
 * Enforces the strict selector strategy to prevent hardcoded selectors in:
 * 1. Extension code (all .js files)
 * 2. Test code (all .spec.js files)
 *
 * See docs/development/SELECTORS_GUIDE.md for the strategy details.
 *
 * CRITICAL: AI tends to hallucinate selectors. This script prevents that by
 * requiring all selectors to come from selectorsExtension.js or selectorsSillyTavern.js
 */

/* eslint-disable no-console, unicorn/no-array-for-each, no-magic-numbers, sonarjs/no-extra-arguments, unicorn/prefer-optional-catch-binding, no-unused-vars -- Node.js validation script */
/* global process -- Node.js global for exit codes */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Files to exclude from validation
const EXCLUDED_FILES = [
  'node_modules',
  'selectorsExtension.js', // Selector definitions allowed here
  'selectorsSillyTavern.js', // Selector definitions allowed here
  'syntax-check.js', // Utility script
  'scripts/', // All scripts (including this one)
  '.git',
  'test-results',
  'playwright-report',
  'playwright/.cache',
  'first-hop-proxy' // Python proxy, not JS
];

// Patterns that indicate hardcoded selectors
const HARDCODED_PATTERNS = [
  // jQuery selectors
  {
    regex: /\$\s*\(\s*['"`](#[a-zA-Z0-9_-]+|\.[\w-]+|\[[\w-]+[=~|^$*]?['"]?[\w-]*['"]?\])/,
    description: 'jQuery selector with hardcoded ID, class, or attribute',
    examples: ["$('#myId')", "$('.myClass')", "$('[data-testid=\"foo\"]')"]
  },
  {
    regex: /\$\s*\(\s*['"`](?!<)[^'"`]*['"`]\s*\)/,
    description: 'jQuery selector with string literal (excluding element creation)',
    examples: ["$('#id')", "$('.class')"]
  },

  // DOM querySelector
  {
    regex: /\.querySelector\s*\(\s*['"`](#[a-zA-Z0-9_-]+|\.[\w-]+|\[[\w-]+[=~|^$*]?['"]?[\w-]*['"]?\])/,
    description: 'querySelector with hardcoded ID, class, or attribute',
    examples: ["querySelector('#myId')", "querySelector('.myClass')"]
  },
  {
    regex: /\.querySelectorAll\s*\(\s*['"`](#[a-zA-Z0-9_-]+|\.[\w-]+|\[[\w-]+[=~|^$*]?['"]?[\w-]*['"]?\])/,
    description: 'querySelectorAll with hardcoded ID, class, or attribute',
    examples: ["querySelectorAll('#myId')", "querySelectorAll('.myClass')"]
  },

  // Playwright selectors
  {
    regex: /page\.(click|fill|type|selectOption|check|uncheck|hover|focus|press|dblclick)\s*\(\s*['"`](#[a-zA-Z0-9_-]+|\.[\w-]+|\[[\w-]+[=~|^$*]?['"]?[\w-]*['"]?\])/,
    description: 'Playwright action with hardcoded selector',
    examples: ["page.click('#myButton')", "page.fill('.myInput', 'text')"]
  },
  {
    regex: /page\.locator\s*\(\s*['"`](#[a-zA-Z0-9_-]+|\.[\w-]+|\[[\w-]+[=~|^$*]?['"]?[\w-]*['"]?\])/,
    description: 'Playwright locator with hardcoded selector',
    examples: ["page.locator('#myId')", "page.locator('.myClass')"]
  },
  {
    regex: /page\.waitForSelector\s*\(\s*['"`](#[a-zA-Z0-9_-]+|\.[\w-]+|\[[\w-]+[=~|^$*]?['"]?[\w-]*['"]?\])/,
    description: 'Playwright waitForSelector with hardcoded selector',
    examples: ["page.waitForSelector('#myId')"]
  },

  // Element.find (jQuery)
  {
    regex: /\.find\s*\(\s*['"`](#[a-zA-Z0-9_-]+|\.[\w-]+|\[[\w-]+[=~|^$*]?['"]?[\w-]*['"]?\])/,
    description: 'jQuery .find() with hardcoded selector',
    examples: ["element.find('#childId')", "element.find('.childClass')"]
  }
];

// Patterns that are ALLOWED (using selector files)
const ALLOWED_PATTERNS = [
  /selectorsExtension\.\w+/,
  /selectorsSillyTavern\.\w+/,
  /selectors\.\w+/ // Generic variable name from selector imports
];

function isAllowedPattern(line) {
  return ALLOWED_PATTERNS.some(pattern => pattern.test(line));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmedLine = line.trim();

    // Skip comments
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
      return;
    }

    // Skip if line uses selector files (allowed)
    if (isAllowedPattern(line)) {
      return;
    }

    // Check each hardcoded pattern
    HARDCODED_PATTERNS.forEach(pattern => {
      if (pattern.regex.test(line)) {
        violations.push({
          file: path.relative(rootDir, filePath),
          line: lineNumber,
          content: trimmedLine,
          pattern: pattern.description,
          examples: pattern.examples
        });
      }
    });
  });

  return violations;
}

function findJsFiles() {
  const fileList = [];

  // Scan root-level JS files only
  const rootFiles = fs.readdirSync(rootDir);
  rootFiles.forEach(file => {
    // Skip excluded files
    if (EXCLUDED_FILES.includes(file)) {
      return;
    }

    const filePath = path.join(rootDir, file);

    // Skip hidden files and directories
    if (file.startsWith('.')) {
      return;
    }

    // Handle I/O errors (symlinks, etc.)
    let stat;
    try {
      stat = fs.lstatSync(filePath); // Use lstat to not follow symlinks
    } catch (err) {
      return;
    }

    // Skip symlinks
    if (stat.isSymbolicLink()) {
      return;
    }

    // Add root-level JS files (excluding config files)
    if (stat.isFile() && file.endsWith('.js') && !file.endsWith('.config.js')) {
      fileList.push(filePath);
    }
  });

  // Scan tests/ directory recursively
  const testsDir = path.join(rootDir, 'tests');
  if (fs.existsSync(testsDir)) {
    scanDirectory(testsDir, fileList);
  }

  return fileList;
}

function scanDirectory(dir, fileList) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (err) {
    return; // Skip directories we can't read
  }

  files.forEach(file => {
    const filePath = path.join(dir, file);

    // Handle I/O errors
    let stat;
    try {
      stat = fs.lstatSync(filePath);
    } catch (err) {
      return;
    }

    // Skip symlinks
    if (stat.isSymbolicLink()) {
      return;
    }

    if (stat.isDirectory()) {
      // Skip node_modules and other excluded directories
      if (!EXCLUDED_FILES.includes(file) && !file.startsWith('.')) {
        scanDirectory(filePath, fileList);
      }
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
}

function validateSelectors() {
  console.log('🔍 Validating selectors...\n');
  console.log(`Root dir: ${rootDir}\n`);

  // Find all JS files
  console.log('Finding JS files...');
  const jsFiles = findJsFiles(rootDir);
  console.log(`📁 Scanning ${jsFiles.length} JavaScript files...\n`);

  if (jsFiles.length > 0) {
    console.log('First 5 files:');
    jsFiles.slice(0, 5).forEach(f => console.log(`  - ${path.relative(rootDir, f)}`));
    console.log('');
  }

  // Scan each file
  const allViolations = [];
  jsFiles.forEach(file => {
    const violations = scanFile(file);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
  });

  // Report results
  if (allViolations.length === 0) {
    console.log('✅ No hardcoded selectors found!\n');
    console.log('All selectors properly use selectorsExtension.js or selectorsSillyTavern.js\n');
    return true;
  }

  // Report violations
  console.error('❌ HARDCODED SELECTORS FOUND:\n');
  console.error(`Found ${allViolations.length} violation(s):\n`);

  allViolations.forEach((violation, index) => {
    console.error(`${index + 1}. ${violation.file}:${violation.line}`);
    console.error(`   Pattern: ${violation.pattern}`);
    console.error(`   Code: ${violation.content}`);
    console.error(`   Examples: ${violation.examples.join(', ')}`);
    console.error('');
  });

  console.error('🛠️  HOW TO FIX:\n');
  console.error('1. Add the selector to selectorsExtension.js (for extension HTML)');
  console.error('   OR selectorsSillyTavern.js (for SillyTavern HTML)\n');
  console.error('2. Import the selector file:');
  console.error('   import { selectorsExtension, selectorsSillyTavern } from \'./index.js\';\n');
  console.error('3. Use the selector:');
  console.error('   $(selectorsExtension.memory.toggleButton) instead of $(\'#toggle_chat_memory\')\n');
  console.error('See docs/development/SELECTORS_GUIDE.md for details.\n');

  return false;
}

// Run validation
const success = validateSelectors();
process.exit(success ? 0 : 1);

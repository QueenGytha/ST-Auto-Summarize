#!/usr/bin/env node
// verify-flow-annotations.js - Ensure all JS files have Flow type annotations
/* eslint-env node */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Files to exclude from Flow annotation requirement
const EXCLUDED_FILES = [
    'verify-flow-annotations.js',  // This script
    'syntax-check.js',             // Syntax validation script
    'eslint.config.js',            // ESLint config
    'tests.js',                    // Test file (optional - could add @flow later)
];

// Get all .js files in current directory
const files = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.js'))
    .filter(file => !EXCLUDED_FILES.includes(file));

let missingAnnotations = [];
let hasAnnotations = [];

for (const file of files) {
    const filePath = path.join(__dirname, file);
    const content = fs.readFileSync(filePath, 'utf8');

    // Check if first line is exactly "// @flow"
    const firstLine = content.split('\n')[0].trim();

    if (firstLine !== '// @flow') {
        missingAnnotations.push(file);
    } else {
        hasAnnotations.push(file);
    }
}

// Report results
console.log('Flow Annotation Verification');
console.log('============================\n');

if (hasAnnotations.length > 0) {
    console.log(`✓ Files with @flow annotation: ${hasAnnotations.length}`);
    hasAnnotations.forEach(file => console.log(`  ✓ ${file}`));
    console.log();
}

if (missingAnnotations.length > 0) {
    console.error(`✗ Files MISSING @flow annotation: ${missingAnnotations.length}`);
    missingAnnotations.forEach(file => console.error(`  ✗ ${file}`));
    console.log();
    console.error('FAILED: All JavaScript files must have "// @flow" as the first line.');
    console.error('\nTo fix, add "// @flow" as the first line of each file.');
    process.exit(1);
}

console.log('✓ All JavaScript files have @flow annotations!\n');
process.exit(0);

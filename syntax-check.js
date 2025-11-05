#!/usr/bin/env node
/* eslint-env node */
/**
 * Syntax validation script
 * Checks that all JS files are valid browser-compatible JavaScript
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = fs.readdirSync(__dirname).
filter((f) => f.endsWith('.js') && f !== 'syntax-check.js');

let errors = [];

for (const file of files) {
  try {
    execSync(`node --check "${path.join(__dirname, file)}"`, { stdio: 'pipe' });
  } catch (err) {
    errors.push({
      file,
      error: err.stderr?.toString() || err.message
    });
  }
}

if (errors.length > 0) {
  console.error('❌ Syntax validation failed!\n');
  console.error('The following files contain non-browser-compatible syntax:\n');
  errors.forEach(({ file, error }) => {
    console.error(`  ${file}:`);
    console.error(`    ${error.trim().split('\n')[0]}\n`);
  });
  console.error('Files must contain valid browser-compatible JavaScript syntax.');
  process.exit(1);
}

console.log(`✓ All ${files.length} files have valid browser-compatible syntax`);
#!/usr/bin/env node
/* eslint-env node -- pre-commit syntax checker runs in Node.js */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = fs.readdirSync(__dirname).
filter((f) => f.endsWith('.js') && f !== 'syntax-check.js');

const errors = [];

for (const file of files) {
  const fullPath = path.join(__dirname, file);
  // Use spawnSync to avoid shell invocation issues in restricted environments
  const res = spawnSync(process.execPath, ['--check', fullPath], { encoding: 'utf8' });
  if (res.status !== 0) {
    errors.push({
      file,
      error: (res.stderr || res.stdout || '').trim() || `node --check failed with code ${res.status}`
    });
  }
}

if (errors.length > 0) {
  process.stderr.write('❌ Syntax validation failed!\n\n');
  process.stderr.write('The following files contain non-browser-compatible syntax:\n\n');
  for (const { file, error } of errors) {
    process.stderr.write(`  ${file}:\n`);
    process.stderr.write(`    ${error.trim().split('\n')[0]}\n\n`);
  }
  process.stderr.write('Files must contain valid browser-compatible JavaScript syntax.');
  process.exit(1);
}

process.stdout.write(`✓ All ${files.length} files have valid browser-compatible syntax\n`);

/**
 * HARD ENFORCEMENT: Tests cannot run with stale code
 *
 * This module uses file modification times to detect if code has changed
 * since the last extension reload. If code is newer than the reload,
 * it throws an error that cannot be ignored.
 *
 * HOW IT WORKS:
 * 1. Global setup calls recordReload() after successful reload
 * 2. This writes current timestamp to .extension-reload-timestamp file
 * 3. Every test file calls enforceReload() at module load time
 * 4. enforceReload() compares code file mtimes with reload timestamp
 * 5. If any code file is newer → THROW ERROR (tests cannot run)
 */

import fs from 'fs';
import path from 'path';

const RELOAD_LOCK_FILE = '.extension-reload-timestamp';
const CODE_DIR = './';

export class ReloadEnforcer {

  /**
   * Called by global setup after successful reload
   * Records current timestamp to lock file
   */
  static recordReload() {
    const timestamp = Date.now();
    fs.writeFileSync(RELOAD_LOCK_FILE, timestamp.toString());
    console.log(`✅ Reload recorded at: ${new Date(timestamp).toISOString()}`);
  }

  /**
   * Called by EVERY test file at module load time
   * Throws if reload is missing or stale
   *
   * IMPORTANT: This runs before any tests, at import time
   */
  static enforceReload() {
    if (!fs.existsSync(RELOAD_LOCK_FILE)) {
      throw new Error(
        '\n\n' +
        '❌❌❌ FATAL: NO RELOAD DETECTED ❌❌❌\n' +
        '\n' +
        'Extension must be reloaded before tests.\n' +
        '\n' +
        'To fix:\n' +
        '  npm run test:reload\n' +
        '\n' +
        'Or manually in ST UI:\n' +
        '  1. Disable extension → Save\n' +
        '  2. Enable extension → Save\n' +
        '  3. Wait 10-20 seconds\n' +
        '\n' +
        '⚠️  DO NOT BYPASS THIS CHECK ⚠️\n' +
        'You will waste hours testing old code.\n' +
        '\n'
      );
    }

    const reloadTime = parseInt(fs.readFileSync(RELOAD_LOCK_FILE, 'utf8'));

    const jsFiles = this._getJsFiles(CODE_DIR);
    let newestFileTime = 0;
    let newestFile = null;

    for (const file of jsFiles) {
      const stat = fs.statSync(file);
      if (stat.mtimeMs > newestFileTime) {
        newestFileTime = stat.mtimeMs;
        newestFile = file;
      }
    }

    if (newestFileTime > reloadTime) {
      const codeAge = Math.floor((Date.now() - newestFileTime) / 1000);
      const reloadAge = Math.floor((Date.now() - reloadTime) / 1000);

      throw new Error(
        '\n\n' +
        '❌❌❌ FATAL: CODE CHANGED AFTER RELOAD ❌❌❌\n' +
        '\n' +
        `Newest file: ${newestFile}\n` +
        `  Modified: ${codeAge}s ago (${new Date(newestFileTime).toISOString()})\n` +
        `Last reload: ${reloadAge}s ago (${new Date(reloadTime).toISOString()})\n` +
        '\n' +
        '🚨 YOU ARE TESTING OLD CODE 🚨\n' +
        '\n' +
        'You MUST reload extension after code changes:\n' +
        '  npm run test:reload\n' +
        '\n' +
        'Or manually in ST UI:\n' +
        '  1. Disable extension → Save\n' +
        '  2. Enable extension → Save\n' +
        '  3. Wait 10-20 seconds\n' +
        '\n' +
        '⚠️  DO NOT BYPASS THIS CHECK ⚠️\n' +
        'You will waste hours debugging.\n' +
        '\n'
      );
    }

    const age = Math.floor((Date.now() - reloadTime) / 1000);
    console.log(`✅ Reload verified (${age}s ago, code is current)`);
  }

  /**
   * Recursively find all .js files
   * Excludes: node_modules, .git, tests
   */
  static _getJsFiles(dir) {
    const files = [];

    if (!fs.existsSync(dir)) {
      return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'tests' ||
          entry.name === '.husky' ||
          entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...this._getJsFiles(fullPath));
      } else if (entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Manual reset (for debugging only)
   * Deletes lock file to force fresh reload
   */
  static reset() {
    if (fs.existsSync(RELOAD_LOCK_FILE)) {
      fs.unlinkSync(RELOAD_LOCK_FILE);
      console.log('🔄 Lock file deleted - reload will be required');
    }
  }
}

/**
 * Global setup for Playwright tests
 *
 * This runs ONCE before all test files.
 *
 * CRITICAL: Must reload extension so tests run against current code.
 */

import { chromium } from '@playwright/test';
import { ExtensionReloadHelper } from './helpers/ExtensionReloadHelper.js';
import fs from 'fs';

const RELOAD_LOCK_FILE = '.extension-reload-timestamp';

export default async function globalSetup() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('   GLOBAL SETUP: Extension Reload Required');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // Slow down by 500ms per action so you can see it
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const reloader = new ExtensionReloadHelper(page);
    await reloader.reloadExtension();

    await reloader.verifyExtensionLoaded();

    // Record reload timestamp (inline to avoid config context pollution)
    const timestamp = Date.now();
    fs.writeFileSync(RELOAD_LOCK_FILE, timestamp.toString());
    console.log(`✅ Reload recorded at: ${new Date(timestamp).toISOString()}`);

    console.log('');
    console.log('✅ Extension ready for testing');
    console.log('');

    // Wait to ensure SillyTavern saves extension state to disk
    console.log('⏳ Waiting for SillyTavern to persist settings...');
    await page.waitForTimeout(2000);

  } catch (error) {
    console.error('');
    console.error('❌ FATAL: Global setup failed');
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Cannot run tests without successful extension reload.');
    console.error('Fix the error above and try again.');
    console.error('');

    throw error;

  } finally {
    await browser.close();
  }

  console.log('═══════════════════════════════════════════════');
  console.log('');
}

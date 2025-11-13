/**
 * Global setup for Playwright tests
 *
 * This runs ONCE before all test files.
 *
 * CRITICAL: Must reload extension so tests run against current code.
 */

import { chromium } from '@playwright/test';
import { ExtensionReloadHelper } from './helpers/ExtensionReloadHelper.js';
import { ReloadEnforcer } from './helpers/ReloadEnforcer.js';

export default async function globalSetup() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('   GLOBAL SETUP: Extension Reload Required');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const reloader = new ExtensionReloadHelper(page);
    await reloader.reloadExtension();

    await reloader.verifyExtensionLoaded();

    ReloadEnforcer.recordReload();

    console.log('');
    console.log('✅ Extension ready for testing');
    console.log('');

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

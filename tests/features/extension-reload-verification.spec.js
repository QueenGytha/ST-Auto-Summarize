/**
 * Extension Reload Verification Tests
 *
 * These tests verify that the reload enforcement system works correctly.
 *
 * CRITICAL: These tests MUST pass before any other tests run.
 * If these fail, all other tests are invalid (testing old code).
 */

import { test, expect } from '@playwright/test';
import { ReloadEnforcer } from '../helpers/ReloadEnforcer.js';

ReloadEnforcer.enforceReload();

test.describe('Extension Reload Verification', () => {

  test('extension loaded with window.AutoRecap available', async ({ page }) => {
    await page.goto('http://localhost:8000');

    const autoRecapExists = await page.evaluate(() => {
      return typeof window.AutoRecap !== 'undefined';
    });

    expect(autoRecapExists).toBe(true);
  });

  test('extension has critical exports', async ({ page }) => {
    await page.goto('http://localhost:8000');

    const exports = await page.evaluate(() => {
      return {
        get_settings: typeof window.AutoRecap.get_settings,
        set_settings: typeof window.AutoRecap.set_settings,
        default_settings: typeof window.AutoRecap.default_settings
      };
    });

    expect(exports.get_settings).toBe('function');
    expect(exports.set_settings).toBe('function');
    expect(exports.default_settings).toBe('object');
  });

  test('can access and modify settings', async ({ page }) => {
    await page.goto('http://localhost:8000');

    const result = await page.evaluate(() => {
      const testValue = 'test_' + Date.now();
      window.AutoRecap.set_settings('_test_key', testValue);
      const retrieved = window.AutoRecap.get_settings('_test_key');

      delete SillyTavern.getContext().extensionSettings.auto_recap._test_key;

      return retrieved === testValue;
    });

    expect(result).toBe(true);
  });

  test('CODE MARKER: verify testing current code', async ({ page }) => {
    /**
     * This test verifies reload actually loads new code.
     *
     * TO USE THIS TEST:
     * 1. Add to index.js temporarily:
     *    export function _testMarker() { return 'CODE_VERSION_12345'; }
     *
     * 2. Run this test:
     *    npm test tests/features/extension-reload-verification.spec.js
     *
     * 3. If test PASSES: Reload works, testing current code ✅
     *    If test FAILS: Reload broken, testing old code ❌
     *
     * 4. After verification, remove _testMarker from index.js
     */

    await page.goto('http://localhost:8000');

    const markerExists = await page.evaluate(() => {
      return typeof window.AutoRecap._testMarker === 'function';
    });

    expect(markerExists).toBe(true);

    const markerValue = await page.evaluate(() => {
      return window.AutoRecap._testMarker();
    });

    expect(markerValue).toBe('CODE_VERSION_12345');
  });
});

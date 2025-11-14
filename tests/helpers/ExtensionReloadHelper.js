/**
 * Automates extension reload via Playwright
 *
 * This class handles reloading extension code in SillyTavern by:
 * 1. Disabling the extension (if enabled) via UI
 * 2. Saving (triggers page reload)
 * 3. Enabling the extension via UI
 * 4. Saving (triggers page reload and loads new code)
 *
 * This is the ONLY way to reload extension code in SillyTavern.
 * A simple page refresh does NOT reload extension code.
 */

import { selectorsSillyTavern } from '../../selectorsSillyTavern.js';

export class ExtensionReloadHelper {
  constructor(page) {
    this.page = page;
    this.extensionName = 'Auto-Recap & Lorebooks';
    this.baseUrl = 'http://localhost:8000';
  }

  /**
   * Execute full reload by disabling and re-enabling the extension
   * This is the ONLY way to reload extension code
   *
   * @throws {Error} If extension cannot be reloaded
   */
  async reloadExtension() {
    console.log('🔄 Starting extension reload...');
    console.log('   This will ensure extension is disabled, then enable it to load fresh code');
    console.log('');

    try {
      // Step 1: Navigate to SillyTavern
      console.log('📍 Step 1: Navigate to SillyTavern');
      await this.page.goto(this.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });
      console.log('   ✓ Page loaded');
      console.log('');

      // Step 2: Disable extension if enabled
      console.log('📍 Step 2: Disable extension (if currently enabled)');
      const wasDisabled = await this._disableIfEnabled();
      if (wasDisabled) {
        console.log('   ✓ Extension disabled and page reloaded');
      } else {
        console.log('   ✓ Extension was already disabled');
      }
      console.log('');

      // Step 3: Enable extension (loads new code)
      console.log('📍 Step 3: Enable extension (loads new code)');
      await this._enableExtension();
      console.log('   ✓ Extension enabled with fresh code');
      console.log('');

      console.log('✅ Extension reloaded successfully with current code');

    } catch (error) {
      console.error('');
      console.error('❌ Failed to reload extension:', error.message);
      console.error('');
      throw new Error(
        `Extension reload failed: ${error.message}\n\n` +
        'Make sure:\n' +
        '1. SillyTavern is running at http://localhost:8000\n' +
        '2. Extension is installed in SillyTavern\n' +
        '3. Extension name in Manage Extensions: "${this.extensionName}"'
      );
    }
  }

  /**
   * Disable extension if it's currently enabled
   * @private
   * @returns {boolean} True if extension was disabled, false if already disabled
   */
  async _disableIfEnabled() {
    // Open Extensions panel
    await this.page.locator(selectorsSillyTavern.extensions.settingsButtonDataTarget).click();
    console.log('   → Opened Extensions panel');

    // Open Manage Extensions dialog
    await this.page.getByRole('button', { name: 'Manage extensions' }).click();
    console.log('   → Opened Manage Extensions dialog');

    // Find the extension checkbox
    const extensionRow = this.page.locator(selectorsSillyTavern.extensions.extensionBlock).filter({ hasText: this.extensionName });
    const checkbox = extensionRow.locator('input[type="checkbox"]');

    // Check if extension is enabled (checkbox is checked)
    const isChecked = await checkbox.isChecked();

    if (!isChecked) {
      // Extension already disabled, just close dialog
      console.log('   → Extension already disabled, skipping disable');
      await this.page.getByRole('button', { name: 'Close' }).click();
      return false;
    }

    // Extension is enabled, disable it
    console.log('   → Extension is enabled, disabling it');
    await checkbox.click();
    console.log('   → Clicked checkbox to disable');

    // Close and wait for page reload
    await this.page.getByRole('button', { name: 'Close' }).click();
    console.log('   → Clicked Close (saving and reloading page)');

    await this.page.waitForLoadState('load', { timeout: 30000 });
    await this.page.waitForLoadState('networkidle', { timeout: 30000 });

    // Wait for page to be fully ready before evaluating
    await this.page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });

    // Verify extension is NOT loaded
    const isLoaded = await this.page.evaluate(() => {
      return typeof window.AutoRecap !== 'undefined';
    });

    if (isLoaded) {
      throw new Error('Extension still loaded after disable! Disable failed.');
    }

    console.log('   → Verified extension is disabled (window.AutoRecap === undefined)');
    return true;
  }

  /**
   * Enable the extension
   * Assumes extension is currently disabled
   * @private
   */
  async _enableExtension() {
    // Open Extensions panel
    await this.page.locator(selectorsSillyTavern.extensions.settingsButtonDataTarget).click();
    console.log('   → Opened Extensions panel');

    // Open Manage Extensions dialog
    await this.page.getByRole('button', { name: 'Manage extensions' }).click();
    console.log('   → Opened Manage Extensions dialog');

    // Find the extension checkbox
    const extensionRow = this.page.locator(selectorsSillyTavern.extensions.extensionBlock).filter({ hasText: this.extensionName });
    const checkbox = extensionRow.locator('input[type="checkbox"]');

    // Verify extension is disabled (checkbox is unchecked)
    const isChecked = await checkbox.isChecked();
    if (isChecked) {
      throw new Error(`Extension "${this.extensionName}" is not disabled! Cannot enable.`);
    }

    // Enable the extension
    console.log('   → Extension is disabled, enabling it');
    await checkbox.click();
    console.log('   → Clicked checkbox to enable');

    // Close and wait for page reload
    await this.page.getByRole('button', { name: 'Close' }).click();
    console.log('   → Clicked Close (saving and reloading page with new code)');

    await this.page.waitForLoadState('load', { timeout: 30000 });
    await this.page.waitForLoadState('networkidle', { timeout: 30000 });

    // Wait for page to be fully ready
    await this.page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });

    // Wait for extension to initialize
    await this.page.waitForFunction(() => {
      return typeof window.AutoRecap !== 'undefined';
    }, { timeout: 30000 });

    console.log('   → Verified extension loaded (window.AutoRecap defined)');
  }

  /**
   * Verify extension loaded correctly with expected exports
   *
   * @returns {Object} Object with boolean flags for each expected export
   * @throws {Error} If extension not loaded
   */
  async verifyExtensionLoaded() {
    const exports = await this.page.evaluate(() => {
      if (!window.AutoRecap) {
        return null;
      }

      return {
        hasGetSettings: typeof window.AutoRecap.get_settings === 'function',
        hasSetSettings: typeof window.AutoRecap.set_settings === 'function',
        hasDefaultSettings: typeof window.AutoRecap.default_settings === 'object'
      };
    });

    if (!exports) {
      throw new Error('Extension not loaded: window.AutoRecap is undefined');
    }

    console.log('Extension exports verified:', JSON.stringify(exports, null, 2));

    if (!exports.hasGetSettings || !exports.hasSetSettings) {
      throw new Error(
        'Extension loaded but missing critical exports:\n' +
        JSON.stringify(exports, null, 2)
      );
    }

    return exports;
  }
}

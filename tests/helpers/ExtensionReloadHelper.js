/**
 * Automates extension reload via Playwright
 *
 * This class handles reloading extension code in SillyTavern by refreshing the page.
 * SillyTavern automatically loads all extensions from the extensions directory on page load.
 */

export class ExtensionReloadHelper {
  constructor(page) {
    this.page = page;
    this.extensionName = 'auto_recap';
  }

  /**
   * Execute full reload by refreshing the page
   * This is the ONLY way to reload extension code
   *
   * @throws {Error} If extension cannot be reloaded
   */
  async reloadExtension() {
    console.log('🔄 Starting extension reload...');

    try {
      console.log('  🔄 Refreshing page to reload extension code...');
      await this.page.goto('http://localhost:8000', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await this.page.waitForTimeout(5000);
      console.log('  ✓ Page refreshed');

      console.log('  ⏳ Waiting for extension to initialize...');
      await this.page.waitForFunction(() => {
        return typeof window.AutoRecap !== 'undefined';
      }, { timeout: 15000 });

      console.log('✅ Extension reloaded successfully');

    } catch (error) {
      console.error('❌ Failed to reload extension:', error.message);
      throw new Error(
        `Extension reload failed: ${error.message}\n\n` +
        'Make sure:\n' +
        '1. SillyTavern is running at http://localhost:8000\n' +
        '2. Extension is installed in SillyTavern\n' +
        '3. Extension name is correct: auto_recap'
      );
    }
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

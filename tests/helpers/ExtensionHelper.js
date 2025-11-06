import { selectorsExtension, selectorsSillyTavern } from '../../index.js';

/**
 * ExtensionHelper - Base helper class for E2E testing
 *
 * Provides common operations for testing ST-Auto-Summarize extension.
 * All methods use selectors from selectorsExtension.js and selectorsSillyTavern.js
 *
 * Usage:
 * ```javascript
 * import { ExtensionHelper } from '../helpers/ExtensionHelper.js';
 *
 * test('example', async ({ page }) => {
 *   const ext = new ExtensionHelper(page);
 *   await ext.navigateToExtension();
 *   await ext.setSettings({ enabled: true });
 * });
 * ```
 *
 * See docs/development/PLAYWRIGHT_TEST_WRITING_GUIDE.md for patterns
 */
export class ExtensionHelper {
  /**
   * @param {import('@playwright/test').Page} page - Playwright page object
   */
  constructor(page) {
    this.page = page;
    this.selectors = selectorsExtension;
    this.stSelectors = selectorsSillyTavern;
  }

  // ============================================================================
  // Navigation Methods
  // ============================================================================

  /**
   * Navigate to the extension's settings panel
   * TODO: Implement after selector files are populated
   */
  async navigateToExtension() {
    // Example implementation (requires selectors):
    // await this.page.click(this.stSelectors.extensions.menuButton);
    // await this.page.click(this.selectors.panel.container);
    throw new Error('Not implemented - add selectors first');
  }

  /**
   * Navigate to SillyTavern main chat page
   */
  async navigateToChat() {
    await this.page.goto('/');
  }

  // ============================================================================
  // Settings Methods
  // ============================================================================

  /**
   * Get current extension settings from browser state
   * @returns {Promise<Object>} Current settings object
   */
  async getSettings() {
    return await this.page.evaluate(() => {
      const MODULE_NAME = 'auto-summarize';
      return window.extension_settings?.[MODULE_NAME];
    });
  }

  /**
   * Set extension settings directly (fast setup for tests)
   * @param {Object} settings - Settings to merge with current settings
   */
  async setSettings(settings) {
    await this.page.evaluate((newSettings) => {
      const MODULE_NAME = 'auto-summarize';
      if (!window.extension_settings) {
        window.extension_settings = {};
      }
      if (!window.extension_settings[MODULE_NAME]) {
        window.extension_settings[MODULE_NAME] = {};
      }
      Object.assign(window.extension_settings[MODULE_NAME], newSettings);
    }, settings);
  }

  /**
   * Reset to default settings
   */
  async setDefaultSettings() {
    await this.page.evaluate(() => {
      const MODULE_NAME = 'auto-summarize';
      // TODO: Import default settings from defaultSettings.js
      window.extension_settings[MODULE_NAME] = {
        enabled: false,
        profile: 'default'
        // Add other defaults as needed
      };
    });
  }

  // ============================================================================
  // Chat Methods
  // ============================================================================

  /**
   * Add a chat message to the current chat
   * @param {string} text - Message text
   * @param {string} [sender='user'] - Message sender
   */
  async addChatMessage(text, sender = 'user') {
    // TODO: Implement using chat selectors
    throw new Error('Not implemented - add selectors first');
  }

  /**
   * Get chat messages from the current chat
   * @returns {Promise<Array>} Array of message objects
   */
  async getChatMessages() {
    return await this.page.evaluate(() => {
      // Access SillyTavern's chat array
      return window.chat || [];
    });
  }

  // ============================================================================
  // Memory/Summary Methods
  // ============================================================================

  /**
   * Get summary data for a specific message
   * @param {number} messageIndex - Index of message in chat
   * @returns {Promise<Object|null>} Summary data or null
   */
  async getSummaryForMessage(messageIndex) {
    return await this.page.evaluate((idx) => {
      const message = window.chat?.[idx];
      return message?.extra?.memory || null;
    }, messageIndex);
  }

  /**
   * Click the summarize button for current message
   * TODO: Implement after selector files are populated
   */
  async clickSummarize() {
    throw new Error('Not implemented - add selectors first');
  }

  /**
   * Toggle memory on/off for current chat
   * TODO: Implement after selector files are populated
   */
  async toggleMemory() {
    throw new Error('Not implemented - add selectors first');
  }

  // ============================================================================
  // Operation Queue Methods
  // ============================================================================

  /**
   * Wait for operation queue to complete all pending operations
   * @param {number} [timeout=30000] - Timeout in milliseconds
   */
  async waitForOperationComplete(timeout = 30000) {
    // TODO: Implement polling for queue completion
    // Check chat_metadata.__operation_queue or use queue UI
    throw new Error('Not implemented - add selectors first');
  }

  /**
   * Get current operation queue status
   * @returns {Promise<Object>} Queue status
   */
  async getQueueStatus() {
    return await this.page.evaluate(() => {
      const metadata = window.chat_metadata || {};
      const queueEntry = Object.values(metadata).find(
        entry => entry?.comment === '__operation_queue'
      );
      return queueEntry?.content ? JSON.parse(queueEntry.content) : { operations: [] };
    });
  }

  /**
   * Get error from most recent failed operation
   * @returns {Promise<string|null>} Error message or null
   */
  async getOperationError() {
    const queue = await this.getQueueStatus();
    const failedOp = queue.operations?.find(op => op.error);
    return failedOp?.error || null;
  }

  // ============================================================================
  // Profile Methods
  // ============================================================================

  /**
   * Switch to a different profile
   * @param {string} profileName - Name of profile to switch to
   * TODO: Implement after selector files are populated
   */
  async switchProfile(profileName) {
    throw new Error('Not implemented - add selectors first');
  }

  /**
   * Create a new profile
   * @param {string} profileName - Name for new profile
   * TODO: Implement after selector files are populated
   */
  async createProfile(profileName) {
    throw new Error('Not implemented - add selectors first');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Wait for extension to be loaded and initialized
   */
  async waitForExtensionLoaded() {
    await this.page.waitForFunction(() => {
      return window.extension_settings && window.extension_settings['auto-summarize'];
    }, { timeout: 10000 });
  }

  /**
   * Take a screenshot for debugging
   * @param {string} name - Screenshot name
   */
  async screenshot(name) {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true
    });
  }

  /**
   * Get toast notification messages
   * @returns {Promise<Array<string>>} Array of toast messages
   */
  async getToastMessages() {
    // TODO: Implement by reading toastr messages from DOM
    throw new Error('Not implemented - add selectors first');
  }
}

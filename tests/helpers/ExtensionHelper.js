import { selectorsExtension, selectorsSillyTavern } from '../../index.js';

export class ExtensionHelper {
  constructor(page) {
    this.page = page;
    this.selectors = selectorsExtension;
    this.stSelectors = selectorsSillyTavern;
  }

  // ============================================================================
  // Navigation Methods
  // ============================================================================

  async navigateToChat() {
    await this.page.goto('/');
  }

  // ============================================================================
  // Settings Methods
  // ============================================================================

  async getSettings() {
    return await this.page.evaluate(() => {
      const MODULE_NAME = 'auto-recap';
      return window.extension_settings?.[MODULE_NAME];
    });
  }

  async setSettings(settings) {
    await this.page.evaluate((newSettings) => {
      const MODULE_NAME = 'auto-recap';
      if (!window.extension_settings) {
        window.extension_settings = {};
      }
      if (!window.extension_settings[MODULE_NAME]) {
        window.extension_settings[MODULE_NAME] = {};
      }
      Object.assign(window.extension_settings[MODULE_NAME], newSettings);
    }, settings);
  }

  async setDefaultSettings() {
    await this.page.evaluate(() => {
      const MODULE_NAME = 'auto-recap';
      // Note: Default settings should match defaultSettings.js
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

  async getChatMessages() {
    return await this.page.evaluate(() => {
      // Access SillyTavern's chat array
      return window.chat || [];
    });
  }

  // ============================================================================
  // Memory/Recap Methods
  // ============================================================================

  async getRecapForMessage(messageIndex) {
    return await this.page.evaluate((idx) => {
      const message = window.chat?.[idx];
      return message?.extra?.memory || null;
    }, messageIndex);
  }

  // ============================================================================
  // Operation Queue Methods
  // ============================================================================

  async getQueueStatus() {
    return await this.page.evaluate(() => {
      const metadata = window.chat_metadata || {};
      const queueEntry = Object.values(metadata).find(
        entry => entry?.comment === '__operation_queue'
      );
      return queueEntry?.content ? JSON.parse(queueEntry.content) : { operations: [] };
    });
  }

  async getOperationError() {
    const queue = await this.getQueueStatus();
    const failedOp = queue.operations?.find(op => op.error);
    return failedOp?.error || null;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async waitForExtensionLoaded() {
    await this.page.waitForFunction(() => {
      return window.extension_settings && window.extension_settings['auto-recap'];
    }, { timeout: 10000 });
  }

  async screenshot(name) {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true
    });
  }
}

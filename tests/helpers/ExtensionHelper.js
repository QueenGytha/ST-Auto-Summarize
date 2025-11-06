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

  async navigateToExtension() {
    // Example implementation (requires selectors):
    // await this.page.click(this.stSelectors.extensions.menuButton);
    // await this.page.click(this.selectors.panel.container);
    throw new Error('Not implemented - add selectors first');
  }

  async navigateToChat() {
    await this.page.goto('/');
  }

  // ============================================================================
  // Settings Methods
  // ============================================================================

  async getSettings() {
    return await this.page.evaluate(() => {
      const MODULE_NAME = 'auto-summarize';
      return window.extension_settings?.[MODULE_NAME];
    });
  }

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

  async addChatMessage(text, sender = 'user') {
    // TODO: Implement using chat selectors
    throw new Error('Not implemented - add selectors first');
  }

  async getChatMessages() {
    return await this.page.evaluate(() => {
      // Access SillyTavern's chat array
      return window.chat || [];
    });
  }

  // ============================================================================
  // Memory/Summary Methods
  // ============================================================================

  async getSummaryForMessage(messageIndex) {
    return await this.page.evaluate((idx) => {
      const message = window.chat?.[idx];
      return message?.extra?.memory || null;
    }, messageIndex);
  }

  async clickSummarize() {
    throw new Error('Not implemented - add selectors first');
  }

  async toggleMemory() {
    throw new Error('Not implemented - add selectors first');
  }

  // ============================================================================
  // Operation Queue Methods
  // ============================================================================

  async waitForOperationComplete(timeout = 30000) {
    // TODO: Implement polling for queue completion
    // Check chat_metadata.__operation_queue or use queue UI
    throw new Error('Not implemented - add selectors first');
  }

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
  // Profile Methods
  // ============================================================================

  async switchProfile(profileName) {
    throw new Error('Not implemented - add selectors first');
  }

  async createProfile(profileName) {
    throw new Error('Not implemented - add selectors first');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async waitForExtensionLoaded() {
    await this.page.waitForFunction(() => {
      return window.extension_settings && window.extension_settings['auto-summarize'];
    }, { timeout: 10000 });
  }

  async screenshot(name) {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true
    });
  }

  async getToastMessages() {
    // TODO: Implement by reading toastr messages from DOM
    throw new Error('Not implemented - add selectors first');
  }
}

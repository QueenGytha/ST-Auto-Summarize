# Playwright Test Writing Guide

**Date:** 2025-01-06
**Status:** Production guide for writing E2E tests
**Context:** Fully AI-developed project requiring verifiable, non-hallucinated testing

---

## Table of Contents

1. [Overview & Philosophy](#overview--philosophy)
2. [Two Test Paths](#two-test-paths)
3. [Project Structure](#project-structure)
4. [Selector Management](#selector-management)
5. [Helper Patterns](#helper-patterns)
6. [Test Writing Idioms](#test-writing-idioms)
7. [Speed Optimization Techniques](#speed-optimization-techniques)
8. [Error Handling & Debugging](#error-handling--debugging)
9. [Common Patterns Library](#common-patterns-library)
10. [Full Examples](#full-examples)
11. [AI Development Workflow](#ai-development-workflow)

---

## Overview & Philosophy

### Core Principles

**1. E2E Only, No Mocks (Except LLM)**

In AI-developed projects, mocked tests are dangerous:
- AI fabricates mock behavior based on assumptions
- AI writes features against fabricated behavior
- AI iterates forever on impossible problems
- Nobody realizes the mock doesn't match reality

**E2E tests are verifiable:** They either work or don't, no room for hallucination.

**Exception:** LLM calls are mocked via transparent proxy (canned responses). This is invisible to the extension and SillyTavern - they think they're making real LLM calls.

**2. Sequential Execution Only**

One SillyTavern backend = one shared state. Parallel workers would corrupt each other's state. This is a hard constraint, not a preference.

**3. Speed Through Optimization, Not Parallelization**

Since we can't parallelize, we optimize:
- Shared browser context
- State chaining between tests
- Lazy navigation
- Batch operations
- Direct state manipulation for setup

**4. Two Test Paths for Different Purposes**

- **Feature-isolation tests:** Start fresh, test one feature, fast iteration during development
- **Full-suite tests:** Chain state across tests, comprehensive validation before commit

---

## Two Test Paths

### Path 1: Feature-Isolation Tests

**Purpose:** Fast iteration during feature development

**Characteristics:**
- Each test starts from default settings
- Tests one feature in isolation
- Fast to write and debug
- Run during feature development

**When to use:**
- Developing a new feature
- Debugging a specific issue
- Testing edge cases for one feature
- Quick validation after code change

**Structure:**
```javascript
// tests/features/summarization.spec.js

import { test, expect } from '@playwright/test';
import { ExtensionHelper } from '../helpers/ExtensionHelper.js';

test.describe('Summarization Feature', () => {
  let page;
  let ext;

  // IMPORTANT: Each test resets to default state
  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    ext = new ExtensionHelper(page);

    // Fast setup: set default state via evaluate
    await page.goto('/');
    await ext.setDefaultSettings();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('can summarize a message', async () => {
    await ext.addChatMessage('Test message');
    await page.reload(); // Show new state

    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    const summary = await ext.getSummaryForMessage(0);
    expect(summary).toBeTruthy();
  });

  test('summarization fails gracefully without connection', async () => {
    await ext.setSettings({ connection_profile: 'invalid' });
    await ext.addChatMessage('Test message');
    await page.reload();

    await ext.clickSummarize();

    const errorMsg = await ext.getOperationError();
    expect(errorMsg).toContain('connection');
  });
});
```

**Pros:**
- Easy to reason about (each test is independent)
- Easy to debug (no dependencies on other tests)
- Easy to write (AI doesn't need to track complex state chains)

**Cons:**
- Slower (resets state every test)
- Doesn't catch integration issues between features

**Run command:**
```bash
npm run test:feature summarization
```

### Path 2: Full-Suite Tests

**Purpose:** Comprehensive validation before commit

**Characteristics:**
- First test starts from default settings
- Each subsequent test inherits state from previous test
- Tests build on each other logically
- Optimized for speed through state reuse

**When to use:**
- Before committing code
- In CI/CD pipeline
- After major refactoring
- To catch regressions across features

**Structure:**
```javascript
// tests/suite/complete-workflow.spec.js

import { test, expect } from '@playwright/test';
import { ExtensionHelper } from '../helpers/ExtensionHelper.js';

// CRITICAL: Use describe.serial() to enforce order
test.describe.serial('Complete Workflow', () => {
  let page;
  let ext;

  // Browser stays open across ALL tests
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ext = new ExtensionHelper(page);
    await page.goto('/'); // Only navigate once
  });

  test.afterAll(async () => {
    await page.close();
  });

  // TEST 1: Starts from default state
  test('1. enable extension and configure basic settings', async () => {
    await ext.setDefaultSettings();
    await ext.setSettings({ enabled: true, notify_on_switch: true });
    await page.reload(); // Verify persistence

    const settings = await ext.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.notify_on_switch).toBe(true);

    // State after test 1:
    // - Extension enabled
    // - Notifications enabled
    // - Browser on main page
  });

  // TEST 2: Inherits state from test 1
  test('2. create and switch to detailed profile', async () => {
    // NO page.goto(), NO setDefaultSettings()
    // We're still on the main page with extension enabled

    await ext.openExtensionPanel();
    await ext.createProfile('detailed');
    await ext.switchToProfile('detailed');

    const profile = await ext.getCurrentProfile();
    expect(profile).toBe('detailed');

    // State after test 2:
    // - Extension enabled (from test 1)
    // - Profile 'detailed' exists and is active
    // - Extension panel is open
  });

  // TEST 3: Inherits state from test 2
  test('3. summarize message using detailed profile', async () => {
    // NO navigation, NO profile creation
    // Extension panel is already open
    // 'detailed' profile is already active

    await ext.addChatMessage('Test message for summarization');

    // No need to navigate or find panel, already there
    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    const summary = await ext.getSummaryForMessage(0);
    expect(summary).toBeTruthy();
    expect(summary.length).toBeGreaterThan(50); // Detailed summaries are longer

    // State after test 3:
    // - One chat message with summary
    // - Operation queue processed
  });

  // TEST 4: Inherits state from test 3
  test('4. switch to brief profile and verify different behavior', async () => {
    // Still on same page, extension panel open

    await ext.switchToProfile('default'); // or create 'brief' profile
    await ext.addChatMessage('Second test message');

    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    const summary = await ext.getSummaryForMessage(1);
    expect(summary).toBeTruthy();

    const firstSummary = await ext.getSummaryForMessage(0);
    // Compare summary styles (detailed vs brief)

    // State after test 4:
    // - Two messages with summaries
    // - Profile switched to default
  });

  // TEST 5: Inherits state from test 4
  test('5. verify summaries persist across reload', async () => {
    await page.reload(); // First reload since test 1!

    const summaries = await ext.getAllSummaries();
    expect(summaries.length).toBe(2);

    // State after test 5:
    // - Back on fresh page load
    // - All data persisted
  });
});
```

**Pros:**
- Much faster (minimal navigation, reused state)
- Tests realistic workflows (users don't reset settings every action)
- Catches integration issues

**Cons:**
- Harder to write (must track state chain)
- Harder to debug (failure in test 5 might be caused by test 2)
- Order matters (can't run tests independently)

**Run command:**
```bash
npm run test:suite
```

### Choosing Between Paths

**During development:**
```bash
# Feature development: Use isolation tests
npm run test:feature summarization  # Fast iteration
```

**Before commit:**
```bash
# Final validation: Run full suite
npm run test:suite  # Comprehensive check
```

---

## Project Structure

### Directory Layout

```
tests/
├── playwright.config.js          # Main config
├── playwright.feature.config.js  # Config for feature-isolation tests
├── playwright.suite.config.js    # Config for full-suite tests
│
├── selectors.js                  # Centralized selectors
│
├── helpers/
│   ├── ExtensionHelper.js       # Main helper class
│   ├── SettingsHelper.js        # Settings-specific actions
│   ├── LorebookHelper.js        # Lorebook-specific actions
│   ├── ProfileHelper.js         # Profile-specific actions
│   └── OperationQueueHelper.js  # Queue-specific actions
│
├── fixtures/
│   ├── default-settings.json    # Default extension settings
│   ├── test-chat.json           # Sample chat data
│   └── canned-responses.json    # LLM mock responses
│
├── features/                     # Feature-isolation tests
│   ├── settings.spec.js
│   ├── profiles.spec.js
│   ├── summarization.spec.js
│   ├── validation.spec.js
│   ├── lorebook.spec.js
│   ├── scene-detection.spec.js
│   └── operation-queue.spec.js
│
└── suite/                        # Full-suite chained tests
    ├── 01-initialization.spec.js
    ├── 02-settings-workflow.spec.js
    ├── 03-summarization-workflow.spec.js
    ├── 04-profile-workflow.spec.js
    └── 05-advanced-features.spec.js
```

### Playwright Configs

**Main config (playwright.config.js):**
```javascript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Sequential execution only
  workers: 1,
  fullyParallel: false,

  // Timeouts
  timeout: 30000,              // 30s per test
  expect: {
    timeout: 10000             // 10s for assertions
  },

  use: {
    baseURL: 'http://localhost:8000',
    headless: true,

    // Reduced timeouts (most actions complete quickly)
    actionTimeout: 10000,      // 10s instead of 30s default
    navigationTimeout: 10000,

    // Debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  // Projects for different test types
  projects: [
    {
      name: 'features',
      testDir: './tests/features',
      use: {
        // Feature tests get fresh state
      }
    },
    {
      name: 'suite',
      testDir: './tests/suite',
      use: {
        // Suite tests chain state
      }
    }
  ],

  // Fail fast in CI
  maxFailures: process.env.CI ? 10 : undefined,
});
```

**Package.json scripts:**
```json
{
  "scripts": {
    "test:feature": "playwright test --project=features",
    "test:suite": "playwright test --project=suite",
    "test:all": "playwright test",
    "test:debug": "playwright test --debug",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed"
  }
}
```

---

## Selector Management

> **See also:** `docs/development/SELECTORS_GUIDE.md` for comprehensive selector strategy documentation

### The Problem

When HTML changes, selectors break. In AI-developed projects, this is critical because:
- AI needs precise selectors (no ambiguity)
- AI can't hallucinate selectors
- Fallback chains hide problems and create false positives
- AI must know exactly which element it's interacting with

### Solution: Split-File Centralized Selectors (NO Fallbacks)

**Two selector files:**
1. **`selectorsExtension.js`** - Our extension's HTML elements (stable, we control)
2. **`selectorsSillyTavern.js`** - SillyTavern's HTML elements (may break on ST updates)

### Why Split Files?

- ✅ **Clear separation**: "Ours" vs "Theirs"
- ✅ **Different lifecycles**: Extension refactors vs ST updates
- ✅ **Version tracking**: Can document ST version separately
- ✅ **Update scope**: Know which file to check when ST updates
- ✅ **AI clarity**: `selectorsExtension` vs `selectorsSillyTavern` is unambiguous

### File: selectorsExtension.js

**Location:** `ST-Auto-Summarize/selectorsExtension.js` (root level)

```javascript
/**
 * Extension HTML Selectors
 *
 * RULES:
 * 1. ALL extension HTML must have data-testid attributes
 * 2. Use data-testid selectors (most stable)
 * 3. NO fallback chains (precision required for AI)
 * 4. One selector per element (no ambiguity)
 *
 * Usage:
 * - Extension code: import { selectorsExtension } from './index.js'
 * - Tests: import { selectorsExtension } from '../../index.js'
 */

export const selectorsExtension = {
  // Memory controls
  memory: {
    toggleButton: '[data-testid="memory-toggle"]',
    refreshButton: '[data-testid="memory-refresh"]',
    statusIndicator: '[data-testid="memory-status"]'
  },

  // Profile management
  profiles: {
    dropdown: '[data-testid="profile-select"]',
    newButton: '[data-testid="profile-new"]',
    deleteButton: '[data-testid="profile-delete"]',
    renameButton: '[data-testid="profile-rename"]',
    restoreButton: '[data-testid="profile-restore"]',
    importButton: '[data-testid="profile-import"]',
    exportButton: '[data-testid="profile-export"]',
    characterButton: '[data-testid="profile-character"]',
    chatButton: '[data-testid="profile-chat"]'
  },

  // Settings
  settings: {
    notifyCheckbox: '[data-testid="setting-notify-switch"]',
    proxyCheckbox: '[data-testid="setting-proxy-details"]',
    wrapCheckbox: '[data-testid="setting-wrap-lorebook"]'
  },

  // Summarization
  summarization: {
    summarizeButton: '[data-testid="summarize-btn"]',
    validateButton: '[data-testid="validate-btn"]',
    progressBar: '[data-testid="summary-progress"]'
  },

  // Operation queue
  queue: {
    list: '[data-testid="operation-queue"]',
    pauseButton: '[data-testid="queue-pause"]',
    clearButton: '[data-testid="queue-clear"]',
    statusComplete: '[data-testid="queue-complete"]'
  }
};
```

### File: selectorsSillyTavern.js

**Location:** `ST-Auto-Summarize/selectorsSillyTavern.js` (root level)

```javascript
/**
 * SillyTavern Core UI Selectors
 *
 * Version: SillyTavern 1.12.x
 * Last Updated: 2025-01-06
 *
 * IMPORTANT: These selectors may break when SillyTavern updates.
 * When ST updates:
 * 1. Check if tests fail with selector errors
 * 2. Use Playwright Inspector to discover new selectors
 * 3. Update this file
 * 4. Update version comment above
 *
 * RULES:
 * 1. Use precise IDs from ST's HTML
 * 2. NO fallback chains (precision required)
 * 3. Document ST version for tracking
 *
 * Usage:
 * - Extension code: import { selectorsSillyTavern } from './index.js'
 * - Tests: import { selectorsSillyTavern } from '../../index.js'
 */

export const selectorsSillyTavern = {
  // Chat interface
  chat: {
    sendButton: '#send_but',
    input: '#send_textarea',
    messageBlock: '.mes',
    messageText: '.mes_text',
    messageSwipe: '.mes_swipe'
  },

  // Extensions menu
  extensions: {
    menu: '#extensions_menu',
    settingsButton: '#extensions_settings'
  },

  // UI elements
  ui: {
    toast: '.toast-container .toast',
    modal: '.modal-content',
    modalClose: '.modal-close'
  }
};
```

### Barrel Export (index.js)

**Add to existing barrel exports:**

```javascript
// index.js
import { getContext, ... } from '../../../script.js';

// Import selectors
import { selectorsExtension } from './selectorsExtension.js';
import { selectorsSillyTavern } from './selectorsSillyTavern.js';

// Import other local modules
import { settingsManager } from './settingsManager.js';
// ...

// Re-export everything
export {
  // SillyTavern APIs
  getContext,
  // ...

  // Selectors (for both extension and tests)
  selectorsExtension,
  selectorsSillyTavern,

  // Extension modules
  settingsManager,
  // ...
};
```

### Usage in Extension Code

```javascript
// settingsManager.js
import {
  getContext,
  extension_settings,
  selectorsExtension,      // Our selectors
  selectorsSillyTavern     // ST selectors
} from './index.js';

// Use extension selectors
$(selectorsExtension.settings.notifyCheckbox).on('change', handler);

// Use ST selectors
$(selectorsSillyTavern.ui.toast).fadeIn();
```

### Usage in Tests

```javascript
// tests/features/memory.spec.js
import { test, expect } from '@playwright/test';
import { selectorsExtension, selectorsSillyTavern } from '../../index.js';

test('toggle memory', async ({ page }) => {
  // Our button
  await page.click(selectorsExtension.memory.toggleButton);

  // ST's button
  await page.click(selectorsSillyTavern.chat.sendButton);
});
```

### Adding data-testid to Extension HTML

**REQUIRED: All extension HTML must have data-testid**

```html
<!-- settings.html -->
<button id="toggle_chat_memory" data-testid="memory-toggle">
  Toggle Memory
</button>

<select id="profile" data-testid="profile-select">
  <option>default</option>
</select>

<input type="checkbox" id="notify_on_profile_switch" data-testid="setting-notify-switch" />
```

**Why data-testid:**
- ✅ Never breaks unless intentionally changed
- ✅ Not affected by CSS refactoring
- ✅ Clear intent (testing)
- ✅ Standard practice
- ✅ AI-friendly (precise, no ambiguity)

### When Selectors Break

#### Extension Selector Breaks

1. **Test fails:** `selector '[data-testid="memory-toggle"]' not found`
2. **Cause:** HTML refactored, data-testid changed
3. **Fix:** Update `selectorsExtension.js` with new data-testid
4. **Token cost:** ~2k tokens

#### SillyTavern Selector Breaks

1. **Test fails:** `selector '#send_but' not found`
2. **Cause:** ST updated, changed their HTML
3. **AI workflow:**
   ```bash
   npx playwright codegen http://localhost:8000
   ```
4. **AI uses MCP to:**
   - Navigate to element
   - Playwright Inspector shows new selector
5. **AI updates `selectorsSillyTavern.js`:**
   ```javascript
   chat: {
     sendButton: '#new_send_button'  // Updated
   }
   ```
6. **AI updates version comment**
7. **Token cost:** ~10-20k tokens

### Enforcement: NO Hardcoded Selectors

**Validation script catches hardcoded selectors:**

```javascript
// scripts/validate-selectors.js
// Checks BOTH extension code and tests
// Blocks execution if hardcoded selectors found

// ❌ FORBIDDEN:
$('#toggle_memory').on('click', ...);
page.click('#send_but');

// ✅ REQUIRED:
$(selectorsExtension.memory.toggleButton).on('click', ...);
await page.click(selectorsSillyTavern.chat.sendButton);
```

**Run automatically:**
```bash
npm run pretest  # Runs validation before tests
npm run lint     # Includes validation
```

**See:** `docs/development/SELECTORS_GUIDE.md` for enforcement details

---

## Helper Patterns

### Base Helper: ExtensionHelper

**tests/helpers/ExtensionHelper.js:**
```javascript
import { selectorsExtension, selectorsSillyTavern } from '../../index.js';

/**
 * Base helper for extension interactions
 *
 * Guidelines:
 * - Use page.evaluate() for setup (fast, not testing UI)
 * - Use page.click() for testing (slow, testing actual UI)
 * - Batch operations where possible
 * - Provide both fast and UI versions of actions
 */
export class ExtensionHelper {
  constructor(page) {
    this.page = page;
  }

  // ============ NAVIGATION ============

  /**
   * Navigate to ST and wait for ready
   * Only call this when necessary (e.g., first test in suite)
   */
  async goto() {
    await this.page.goto('/');
    await this.page.waitForSelector(selectorsSillyTavern.chat.input);
  }

  /**
   * Open extension panel via UI (SLOW - tests UI)
   */
  async openExtensionPanel() {
    await this.page.click(selectorsSillyTavern.extensions.menu);
    await this.page.click(selectorsExtension.panel);
    await this.page.waitForSelector(selectorsExtension.memory.toggleButton);
  }

  // ============ SETTINGS (Fast Setup) ============

  /**
   * Set default settings (FAST - doesn't test UI)
   * Use for test setup, not for testing settings UI
   */
  async setDefaultSettings() {
    await this.page.evaluate(() => {
      // Load default settings from fixture or hardcode
      window.extension_settings['auto-summarize'] = {
        enabled: false,
        profile: 'default',
        notify_on_switch: false,
        // ... all default settings
      };
      // Trigger save
      window.saveSettingsDebounced();
    });
  }

  /**
   * Set specific settings (FAST - doesn't test UI)
   * Use for test setup
   */
  async setSettings(settings) {
    await this.page.evaluate((s) => {
      Object.assign(window.extension_settings['auto-summarize'], s);
      window.saveSettingsDebounced();
    }, settings);
  }

  /**
   * Get current settings (FAST - direct access)
   */
  async getSettings() {
    return await this.page.evaluate(() => {
      return window.extension_settings['auto-summarize'];
    });
  }

  // ============ SETTINGS (UI Interactions) ============

  /**
   * Change setting via UI (SLOW - tests UI)
   * Use this when testing settings UI works correctly
   */
  async changeSettingViaUI(settingId, value) {
    const selector = selectorsExtension.settings[settingId];
    const element = this.page.locator(selector);

    // Handle different input types
    const type = await element.getAttribute('type');
    if (type === 'checkbox') {
      await element.setChecked(value);
    } else if (await element.evaluate(el => el.tagName === 'SELECT')) {
      await element.selectOption(value);
    } else {
      await element.fill(value);
    }
  }

  // ============ CHAT MESSAGES ============

  /**
   * Add chat message (FAST - doesn't test UI)
   * Use for test setup
   */
  async addChatMessage(text, isUser = true) {
    await this.page.evaluate((msg) => {
      const context = window.SillyTavern.getContext();
      context.chat.push({
        mes: msg.text,
        is_user: msg.isUser,
        name: msg.isUser ? 'User' : 'Assistant',
        extra: {}
      });
      window.saveChat();
    }, { text, isUser });
  }

  /**
   * Send message via UI (SLOW - tests UI)
   * Use when testing message sending workflow
   */
  async sendMessageViaUI(text) {
    await this.page.fill(selectorsSillyTavern.chat.input, text);
    await this.page.click(selectorsSillyTavern.chat.sendButton);
    await this.page.waitForSelector(`${selectorsSillyTavern.chat.messageBlock}:has-text("${text}")`);
  }

  // ============ SUMMARIZATION ============

  /**
   * Click summarize button (SLOW - tests UI)
   */
  async clickSummarize(messageIndex = 0) {
    // If button requires message context, select message first
    if (messageIndex !== null) {
      await this.selectMessage(messageIndex);
    }
    await this.page.click(selectorsExtension.summarization.summarizeButton);
  }

  /**
   * Wait for operation to complete
   */
  async waitForOperationComplete(timeout = 30000) {
    await this.page.waitForSelector(
      selectorsExtension.operationQueue.statusComplete,
      { timeout }
    );
  }

  /**
   * Get summary for message (FAST - direct access)
   */
  async getSummaryForMessage(messageIndex) {
    return await this.page.evaluate((idx) => {
      const context = window.SillyTavern.getContext();
      return context.chat[idx]?.extra?.memory?.summary;
    }, messageIndex);
  }

  /**
   * Get all summaries (FAST - direct access)
   */
  async getAllSummaries() {
    return await this.page.evaluate(() => {
      const context = window.SillyTavern.getContext();
      return context.chat
        .map(msg => msg.extra?.memory?.summary)
        .filter(s => s);
    });
  }

  // ============ OPERATION QUEUE ============

  /**
   * Get operation queue state (FAST - direct access)
   */
  async getOperationQueue() {
    return await this.page.evaluate(() => {
      return window.getOperationQueue(); // Or however you access it
    });
  }

  /**
   * Enqueue operation (FAST - direct call)
   */
  async enqueueOperation(type, params, options = {}) {
    return await this.page.evaluate((args) => {
      return window.enqueueOperation(args.type, args.params, args.options);
    }, { type, params, options });
  }

  /**
   * Get operation error (if any)
   */
  async getOperationError(operationId) {
    return await this.page.evaluate((id) => {
      const queue = window.getOperationQueue();
      const op = queue.operations.find(o => o.id === id);
      return op?.error;
    }, operationId);
  }

  // ============ PROFILES ============

  /**
   * Create profile via UI (SLOW - tests UI)
   */
  async createProfile(name) {
    await this.page.click(selectorsExtension.profiles.newButton);
    await this.page.fill('[data-testid="profile-name-input"]', name);
    await this.page.click('[data-testid="profile-create-confirm"]');
  }

  /**
   * Switch profile (FAST - direct call)
   */
  async switchToProfile(name) {
    await this.page.evaluate((profileName) => {
      window.switchProfile(profileName);
    }, name);
  }

  /**
   * Switch profile via UI (SLOW - tests UI)
   */
  async switchToProfileViaUI(name) {
    await this.page.selectOption(selectorsExtension.profiles.dropdown, name);
  }

  /**
   * Get current profile (FAST - direct access)
   */
  async getCurrentProfile() {
    return await this.page.evaluate(() => {
      return window.extension_settings['auto-summarize'].profile;
    });
  }

  // ============ BATCH OPERATIONS ============

  /**
   * Batch setup (FAST - single evaluate call)
   * Use this to set up complex test state quickly
   */
  async setupTestScenario(config) {
    await this.page.evaluate((cfg) => {
      const context = window.SillyTavern.getContext();

      // Set settings
      if (cfg.settings) {
        Object.assign(window.extension_settings['auto-summarize'], cfg.settings);
      }

      // Add messages
      if (cfg.messages) {
        cfg.messages.forEach(msg => {
          context.chat.push({
            mes: msg.text,
            is_user: msg.isUser ?? true,
            name: msg.isUser ? 'User' : 'Assistant',
            extra: msg.extra || {}
          });
        });
      }

      // Add summaries
      if (cfg.summaries) {
        cfg.summaries.forEach((summary, idx) => {
          if (!context.chat[idx].extra) context.chat[idx].extra = {};
          if (!context.chat[idx].extra.memory) context.chat[idx].extra.memory = {};
          context.chat[idx].extra.memory.summary = summary;
        });
      }

      window.saveChat();
      window.saveSettingsDebounced();
    }, config);
  }

  /**
   * Get multiple values in one call (FAST - batch query)
   */
  async getTestState() {
    return await this.page.evaluate(() => {
      const context = window.SillyTavern.getContext();
      return {
        settings: window.extension_settings['auto-summarize'],
        messages: context.chat.map(msg => ({
          text: msg.mes,
          summary: msg.extra?.memory?.summary
        })),
        queue: window.getOperationQueue(),
        profile: window.extension_settings['auto-summarize'].profile
      };
    });
  }

  // ============ UTILITIES ============

  /**
   * Select message in chat
   */
  async selectMessage(index) {
    await this.page.locator(selectorsSillyTavern.chat.messageBlock).nth(index).click();
  }

  /**
   * Wait for toast notification
   */
  async waitForToast(text) {
    await this.page.waitForSelector(`${selectorsSillyTavern.ui.toast}:has-text("${text}")`);
  }

  /**
   * Dismiss modal
   */
  async dismissModal() {
    await this.page.click(selectorsSillyTavern.ui.modalClose);
  }
}
```

### Specialized Helpers

For complex features, create specialized helpers that extend or compose with ExtensionHelper:

**tests/helpers/LorebookHelper.js:**
```javascript
import { ExtensionHelper } from './ExtensionHelper.js';
import { selectors } from '../selectors.js';

export class LorebookHelper extends ExtensionHelper {
  /**
   * Get lorebook entries for current chat
   */
  async getLorebookEntries() {
    return await this.page.evaluate(() => {
      const chatId = window.getCurrentChatId();
      const lorebook = window.getLorebookForChat(chatId);
      return lorebook?.entries || [];
    });
  }

  /**
   * Find entry by name
   */
  async findEntry(name) {
    const entries = await this.getLorebookEntries();
    return entries.find(e => e.comment === name || e.key?.includes(name));
  }

  /**
   * Verify entry exists with expected content
   */
  async verifyEntry(name, expectedContent) {
    const entry = await this.findEntry(name);
    if (!entry) return { exists: false };

    return {
      exists: true,
      contentMatches: entry.content.includes(expectedContent)
    };
  }
}
```

---

## Test Writing Idioms

### Idiom 1: Use describe.serial() for State Chaining

```javascript
// WRONG: Default describe() doesn't guarantee order
test.describe('My tests', () => {
  test('test 1', async () => { /* ... */ });
  test('test 2', async () => { /* ... */ });
  // Order not guaranteed, tests might run in any order
});

// RIGHT: describe.serial() guarantees sequential order
test.describe.serial('My tests', () => {
  test('test 1', async () => { /* ... */ });
  test('test 2', async () => { /* ... */ });
  // test 2 always runs after test 1
});
```

### Idiom 2: Shared Browser Context in Suite Tests

```javascript
// FEATURE-ISOLATION: New context each test
test.describe('Feature tests', () => {
  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage(); // Fresh context
    await page.goto('/');
  });

  test.afterEach(async () => {
    await page.close(); // Close after each
  });
});

// FULL-SUITE: Shared context across tests
test.describe.serial('Suite tests', () => {
  let page;
  let ext;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage(); // Once for all tests
    ext = new ExtensionHelper(page);
    await page.goto('/'); // Once for all tests
  });

  test.afterAll(async () => {
    await page.close(); // Once at end
  });

  test('test 1', async () => { /* page is shared */ });
  test('test 2', async () => { /* same page */ });
});
```

### Idiom 3: Fast Setup, Slow Testing

```javascript
test('summarization works', async () => {
  // FAST: Setup via evaluate (not testing this)
  await ext.setSettings({ enabled: true });
  await ext.addChatMessage('Test message');
  await page.reload(); // Show new state

  // SLOW: Test via UI (testing this)
  await ext.clickSummarize();
  await ext.waitForOperationComplete();

  // FAST: Verify via evaluate (not testing UI, just checking result)
  const summary = await ext.getSummaryForMessage(0);
  expect(summary).toBeTruthy();
});
```

### Idiom 4: Batch Assertions

```javascript
// SLOW: Multiple page.evaluate calls
const profile = await page.evaluate(() => extension_settings.profile);
const enabled = await page.evaluate(() => extension_settings.enabled);
const notify = await page.evaluate(() => extension_settings.notify);
expect(profile).toBe('detailed');
expect(enabled).toBe(true);
expect(notify).toBe(false);
// Time: ~150ms

// FAST: Single page.evaluate call
const settings = await page.evaluate(() => ({
  profile: extension_settings.profile,
  enabled: extension_settings.enabled,
  notify: extension_settings.notify
}));
expect(settings).toEqual({
  profile: 'detailed',
  enabled: true,
  notify: false
});
// Time: ~50ms
```

### Idiom 5: Lazy Navigation

```javascript
// SLOW: Navigate every test
test.describe('Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/'); // 500ms per test
  });
});

// FAST: Navigate once, stay there
test.describe.serial('Tests', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/'); // Once: 500ms total
  });

  test('test 1', async () => { /* already there */ });
  test('test 2', async () => { /* still there */ });
});
```

### Idiom 6: Parallel Assertions Within Test

```javascript
// SLOW: Sequential waits
await page.waitForSelector('#summary'); // 100ms
await page.waitForSelector('#lorebook'); // 100ms
await page.waitForSelector('#complete'); // 100ms
// Total: 300ms

// FAST: Parallel waits
await Promise.all([
  page.waitForSelector('#summary'),
  page.waitForSelector('#lorebook'),
  page.waitForSelector('#complete')
]);
// Total: 100ms (all at once)
```

### Idiom 7: Direct State Manipulation vs Reload

```javascript
// SLOW: Reload to reset state
await page.reload(); // 500ms
await ext.setSettings({ profile: 'default' });

// FAST: Direct manipulation (when not testing persistence)
await ext.setSettings({ profile: 'default' }); // 50ms
// No reload needed if not testing persistence

// ONLY reload when testing:
// - Persistence across sessions
// - Extension initialization
// - Cache clearing
```

### Idiom 8: Test.step() for Complex Tests

```javascript
test('complex workflow', async () => {
  await test.step('Setup: Create profile', async () => {
    await ext.createProfile('test');
    const profile = await ext.getCurrentProfile();
    expect(profile).toBe('test');
  });

  await test.step('Action: Summarize messages', async () => {
    await ext.addChatMessage('Message 1');
    await ext.clickSummarize();
    await ext.waitForOperationComplete();
  });

  await test.step('Verify: Check results', async () => {
    const summary = await ext.getSummaryForMessage(0);
    expect(summary).toBeTruthy();
  });

  // Benefit: Playwright trace shows which step failed
});
```

### Idiom 9: Conditional Timeouts

```javascript
// Default timeout: 10s (set in config)

// Override for slow operations
await page.click('#summarize', { timeout: 30000 }); // LLM call
await ext.waitForOperationComplete(60000); // Long operation

// Override for fast operations (fail faster)
await page.click('#toggle', { timeout: 5000 }); // Should be instant
```

### Idiom 10: Comment State Expectations

```javascript
test.describe.serial('Chained tests', () => {
  test('1. setup', async () => {
    await ext.setSettings({ enabled: true });
    await ext.createProfile('detailed');

    // STATE AFTER THIS TEST:
    // - Extension enabled
    // - Profile 'detailed' exists and is active
    // - Browser on main page, extension panel closed
  });

  test('2. use feature', async () => {
    // STATE EXPECTED:
    // - Extension enabled (from test 1)
    // - Profile 'detailed' active (from test 1)

    await ext.addChatMessage('Test');
    await ext.clickSummarize();

    // STATE AFTER THIS TEST:
    // - All from test 1
    // - One message with summary
    // - Operation queue empty
  });
});
```

---

## Speed Optimization Techniques

### Summary of Optimizations

| Technique | Savings per Test | Applies To |
|-----------|------------------|------------|
| Shared browser context | 500ms | Suite tests |
| Lazy navigation | 400ms | Suite tests |
| Batch assertions | 50ms | All tests |
| Skip unnecessary reloads | 200ms | All tests |
| Parallel assertions | 100ms | Complex tests |
| Direct state manipulation | 200ms | Setup phases |
| Reduced timeouts | 50ms | All tests |

**Total potential:** 4 min → 2.1 min (~45% reduction) for 100 tests

### Optimization 1: Shared Browser Context

**Implementation:**

```javascript
// playwright.config.js
export default {
  workers: 1,
  use: {
    // Don't need to set anything special
    // Just use beforeAll instead of beforeEach
  }
};

// In tests
test.describe.serial('Suite', () => {
  let page; // Shared across tests

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto('/');
  });

  test.afterAll(async () => {
    await page.close();
  });

  // All tests use same page instance
});
```

**Savings:** ~500ms per test (no browser creation, no initial navigation)

### Optimization 2: Batch Operations

**Setup in one call:**

```javascript
// Helper method
async setupTestScenario(config) {
  await this.page.evaluate((cfg) => {
    // Single evaluate call does everything
    if (cfg.settings) {
      Object.assign(extension_settings['auto-summarize'], cfg.settings);
    }
    if (cfg.messages) {
      cfg.messages.forEach(msg => chat.push(msg));
    }
    if (cfg.summaries) {
      cfg.summaries.forEach((s, i) => {
        chat[i].extra.memory.summary = s;
      });
    }
    saveChat();
    saveSettings();
  }, config);
}

// In test
await ext.setupTestScenario({
  settings: { enabled: true, profile: 'detailed' },
  messages: [
    { text: 'Message 1', isUser: true },
    { text: 'Response 1', isUser: false }
  ],
  summaries: ['Summary 1', 'Summary 2']
});
// One call, ~50ms
```

**Savings:** ~200ms per complex setup

### Optimization 3: Block Unnecessary Resources

```javascript
// In helper or global setup
await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,ico,woff,woff2}',
  route => route.abort()
);

// Block analytics, ads, etc.
await page.route('**/analytics/**', route => route.abort());
await page.route('**/ads/**', route => route.abort());
```

**Savings:** ~100-300ms per page load

### Optimization 4: Optimized Waiters

```javascript
// SLOW: Wait for selector with default options
await page.waitForSelector('#element');

// FAST: Wait with state option (more specific)
await page.waitForSelector('#element', { state: 'visible' });

// FAST: Wait for function (custom condition)
await page.waitForFunction(() => {
  return document.querySelector('#element')?.textContent?.length > 0;
});

// FAST: Wait for multiple conditions at once
await Promise.all([
  page.waitForSelector('#summary'),
  page.waitForFunction(() => operationQueue.length === 0)
]);
```

### Optimization 5: Disable Animations (Minor Impact)

```javascript
// In beforeAll or helper constructor
await page.addInitScript(() => {
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after {
      animation-duration: 0s !important;
      transition-duration: 0s !important;
    }
  `;
  document.head.appendChild(style);
});
```

**Savings:** ~10-20ms per page (minimal but free)

### Optimization 6: Strategic Reloads

```javascript
// WRONG: Reload after every state change
await ext.setSettings({ enabled: true });
await page.reload(); // Unnecessary
await ext.setSettings({ profile: 'detailed' });
await page.reload(); // Unnecessary

// RIGHT: Reload only when testing persistence
await ext.setSettings({ enabled: true });
await ext.setSettings({ profile: 'detailed' });
await page.reload(); // Once, to test both persisted
```

### Optimization 7: Reduce Timeout Overhead

```javascript
// playwright.config.js
export default {
  use: {
    actionTimeout: 5000, // Most actions complete in <5s
  }
};

// Override for slow actions
await page.click('#summarize', { timeout: 30000 }); // LLM call

// Override for instant actions (fail faster)
await page.click('#toggle', { timeout: 2000 }); // Should be instant
```

---

## Error Handling & Debugging

### When Tests Fail

**AI workflow for handling test failures:**

1. **Read the error message:**
   ```
   Error: selector '#toggle_memory' not found
   ```

2. **Identify the issue:**
   - Selector doesn't exist? → HTML changed
   - Timeout? → Operation took too long or element never appeared
   - Assertion failed? → Behavior doesn't match expectation

3. **For selector issues:**
   ```bash
   # AI runs Playwright Inspector
   npx playwright codegen http://localhost:8000

   # AI uses MCP to navigate and find element
   # Inspector shows new selector
   # AI updates selectors.js
   ```

4. **For timeout issues:**
   - Check if operation completed but selector is wrong
   - Check if operation failed (look for error messages)
   - Check if timeout is too short

5. **For assertion failures:**
   - Take screenshot to see actual state
   - Check console logs for errors
   - Verify test assumptions (previous tests might have failed)

### Debugging Tools

**Screenshots on failure:**

```javascript
// Automatic (configured in playwright.config.js)
screenshot: 'only-on-failure'

// Manual in test
await page.screenshot({ path: 'debug.png', fullPage: true });
```

**Video recording:**

```javascript
// Automatic (configured in playwright.config.js)
video: 'retain-on-failure'

// Videos saved to test-results/
```

**Trace viewer:**

```javascript
// Automatic (configured in playwright.config.js)
trace: 'on-first-retry'

// View trace
npx playwright show-trace test-results/trace.zip
```

**Console logs:**

```javascript
// Listen to console
page.on('console', msg => console.log('Browser log:', msg.text()));

// In helper
async getConsoleLogs() {
  const logs = [];
  this.page.on('console', msg => logs.push(msg.text()));
  return logs;
}
```

**Pause execution:**

```javascript
// Pause and open inspector
await page.pause();

// Or run with --debug
npm run test:debug
```

### Common Error Patterns

**Error: Selector not found**

```javascript
// Cause: HTML changed
// Fix: Update selectors.js

// Or: Element not visible yet
// Fix: Add explicit wait
await page.waitForSelector('#element', { state: 'visible' });
```

**Error: Timeout exceeded**

```javascript
// Cause: Operation taking longer than expected
// Fix 1: Increase timeout for that operation
await page.click('#slow-button', { timeout: 60000 });

// Fix 2: Wait for actual completion signal
await page.waitForFunction(() => operationQueue.length === 0);
```

**Error: Element is not stable**

```javascript
// Cause: Element moving/changing while clicking
// Fix: Wait for element to be stable
await page.waitForSelector('#element', { state: 'visible' });
await page.waitForTimeout(100); // Small delay for animations
await page.click('#element');

// Better: Disable animations (see optimization section)
```

**Error: Navigation timeout**

```javascript
// Cause: Page taking too long to load
// Fix: Increase navigation timeout
await page.goto('/', { timeout: 30000 });

// Or: Wait for specific element instead of full load
await page.goto('/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#ready-indicator');
```

---

## Common Patterns Library

### Pattern: Test Settings Persistence

```javascript
test('settings persist across reload', async () => {
  // Set via UI
  await ext.openExtensionPanel();
  await ext.changeSettingViaUI('notifySwitch', true);

  // Verify immediate change
  const beforeReload = await ext.getSettings();
  expect(beforeReload.notify_on_switch).toBe(true);

  // Reload and verify persistence
  await page.reload();
  const afterReload = await ext.getSettings();
  expect(afterReload.notify_on_switch).toBe(true);
});
```

### Pattern: Test Async Operation Completion

```javascript
test('summarization completes successfully', async () => {
  await ext.addChatMessage('Test message');
  await page.reload();

  // Start operation
  await ext.clickSummarize();

  // Wait for completion (with timeout)
  await ext.waitForOperationComplete(30000);

  // Verify result
  const summary = await ext.getSummaryForMessage(0);
  expect(summary).toBeTruthy();
  expect(summary.length).toBeGreaterThan(10);
});
```

### Pattern: Test Error Handling

```javascript
test('handles connection failure gracefully', async () => {
  // Set invalid connection
  await ext.setSettings({ connection_profile: 'invalid' });
  await ext.addChatMessage('Test message');
  await page.reload();

  // Attempt operation
  await ext.clickSummarize();

  // Wait for error (not completion)
  await page.waitForSelector('.error-message', { timeout: 10000 });

  // Verify error message
  const errorText = await page.locator('.error-message').textContent();
  expect(errorText).toContain('connection');

  // Verify retry button appears
  const retryButton = page.locator('.retry-button');
  await expect(retryButton).toBeVisible();
});
```

### Pattern: Test Profile Switching

```javascript
test('switching profiles changes behavior', async () => {
  // Setup: Create two profiles with different settings
  await ext.setSettings({ profile: 'brief' });
  await ext.addChatMessage('Test 1');
  await page.reload();

  await ext.clickSummarize();
  await ext.waitForOperationComplete();
  const briefSummary = await ext.getSummaryForMessage(0);

  // Switch profile
  await ext.switchToProfile('detailed');
  await ext.addChatMessage('Test 2');
  await page.reload();

  await ext.clickSummarize();
  await ext.waitForOperationComplete();
  const detailedSummary = await ext.getSummaryForMessage(1);

  // Verify different behavior
  expect(detailedSummary.length).toBeGreaterThan(briefSummary.length);
});
```

### Pattern: Test Lorebook Entry Creation

```javascript
test('creates lorebook entry from summary', async () => {
  await ext.setSettings({
    enabled: true,
    auto_lorebook_enabled: true
  });

  await ext.addChatMessage('Alice went to the market and bought apples.');
  await page.reload();

  await ext.clickSummarize();
  await ext.waitForOperationComplete();

  // Wait for lorebook processing
  await page.waitForTimeout(2000); // Give time for async processing

  const entries = await lorebookHelper.getLorebookEntries();

  // Verify entry created
  const aliceEntry = entries.find(e =>
    e.key?.includes('Alice') || e.comment === 'Alice'
  );
  expect(aliceEntry).toBeTruthy();
  expect(aliceEntry.content).toContain('market');
});
```

### Pattern: Test Operation Queue

```javascript
test('operations process in order', async () => {
  // Enqueue multiple operations
  await ext.addChatMessage('Message 1');
  await ext.addChatMessage('Message 2');
  await ext.addChatMessage('Message 3');
  await page.reload();

  // Click summarize for each (queues operations)
  await ext.selectMessage(0);
  await ext.clickSummarize();
  await ext.selectMessage(1);
  await ext.clickSummarize();
  await ext.selectMessage(2);
  await ext.clickSummarize();

  // Check queue has 3 operations
  const queue = await ext.getOperationQueue();
  expect(queue.operations.length).toBe(3);

  // Wait for all to complete
  await page.waitForFunction(() => {
    return window.getOperationQueue().operations.length === 0;
  }, { timeout: 90000 }); // 3 operations × 30s

  // Verify all summaries created
  const summaries = await ext.getAllSummaries();
  expect(summaries.length).toBe(3);
});
```

### Pattern: Test State Chaining (Suite Test)

```javascript
test.describe.serial('Complete workflow', () => {
  let page, ext;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ext = new ExtensionHelper(page);
    await page.goto('/');
  });

  test('1. enable and configure', async () => {
    await ext.setDefaultSettings();
    await ext.setSettings({ enabled: true });

    const settings = await ext.getSettings();
    expect(settings.enabled).toBe(true);
  });

  test('2. create first summary', async () => {
    // Extension already enabled from test 1
    await ext.addChatMessage('First message');
    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    const summary = await ext.getSummaryForMessage(0);
    expect(summary).toBeTruthy();
  });

  test('3. create second summary', async () => {
    // First message and summary already exist from test 2
    await ext.addChatMessage('Second message');
    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    const summaries = await ext.getAllSummaries();
    expect(summaries.length).toBe(2);
  });

  test('4. verify persistence', async () => {
    // First reload since test 1!
    await page.reload();

    const summaries = await ext.getAllSummaries();
    expect(summaries.length).toBe(2);
  });

  test.afterAll(async () => {
    await page.close();
  });
});
```

---

## Full Examples

### Example 1: Feature-Isolation Test

**tests/features/summarization.spec.js:**

```javascript
import { test, expect } from '@playwright/test';
import { ExtensionHelper } from '../helpers/ExtensionHelper.js';

test.describe('Summarization Feature', () => {
  let page;
  let ext;

  // Each test gets fresh state
  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    ext = new ExtensionHelper(page);
    await page.goto('/');
    await ext.setDefaultSettings();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('can summarize a single message', async () => {
    // Arrange
    await ext.setSettings({ enabled: true });
    await ext.addChatMessage('Test message for summarization');
    await page.reload();

    // Act
    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    // Assert
    const summary = await ext.getSummaryForMessage(0);
    expect(summary).toBeTruthy();
    expect(summary.length).toBeGreaterThan(0);
  });

  test('summarization fails when extension disabled', async () => {
    // Arrange: Extension disabled by default
    await ext.addChatMessage('Test message');
    await page.reload();

    // Act & Assert
    const summarizeButton = page.locator(selectorsExtension.summarization.summarizeButton);
    await expect(summarizeButton).toBeDisabled();
  });

  test('can validate summary after creation', async () => {
    // Arrange
    await ext.setSettings({
      enabled: true,
      validation_enabled: true
    });
    await ext.addChatMessage('Test message');
    await page.reload();

    // Act: Summarize
    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    // Act: Validate
    await ext.clickValidate();
    await ext.waitForOperationComplete();

    // Assert
    const validation = await page.evaluate(() => {
      const chat = window.SillyTavern.getContext().chat;
      return chat[0].extra.memory.validation;
    });
    expect(validation).toBeTruthy();
    expect(validation.status).toBe('valid');
  });

  test('handles malformed LLM response gracefully', async () => {
    // Arrange: Configure proxy to return invalid JSON
    await ext.setSettings({ enabled: true });
    await page.evaluate(() => {
      window.testInjectBadResponse = true;
    });
    await ext.addChatMessage('Test message');
    await page.reload();

    // Act
    await ext.clickSummarize();

    // Assert: Error appears
    await page.waitForSelector('.error-message');
    const errorText = await page.locator('.error-message').textContent();
    expect(errorText).toContain('Invalid response');
  });

  test('summarization works with different profiles', async () => {
    // Test 1: Brief profile
    await ext.setSettings({
      enabled: true,
      profile: 'brief'
    });
    await ext.addChatMessage('Test message 1');
    await page.reload();
    await ext.clickSummarize();
    await ext.waitForOperationComplete();
    const briefSummary = await ext.getSummaryForMessage(0);

    // Reset state
    await page.close();
    page = await browser.newPage();
    ext = new ExtensionHelper(page);
    await page.goto('/');
    await ext.setDefaultSettings();

    // Test 2: Detailed profile
    await ext.setSettings({
      enabled: true,
      profile: 'detailed'
    });
    await ext.addChatMessage('Test message 2');
    await page.reload();
    await ext.clickSummarize();
    await ext.waitForOperationComplete();
    const detailedSummary = await ext.getSummaryForMessage(0);

    // Assert: Different lengths
    expect(detailedSummary.length).toBeGreaterThan(briefSummary.length);
  });
});
```

### Example 2: Full-Suite Test

**tests/suite/01-complete-workflow.spec.js:**

```javascript
import { test, expect } from '@playwright/test';
import { ExtensionHelper } from '../helpers/ExtensionHelper.js';
import { LorebookHelper } from '../helpers/LorebookHelper.js';

test.describe.serial('Complete Workflow Suite', () => {
  let page;
  let ext;
  let lore;

  // Shared context for entire suite
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    ext = new ExtensionHelper(page);
    lore = new LorebookHelper(page);

    // Navigate once
    await page.goto('/');

    // Setup default state
    await ext.setDefaultSettings();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // TEST 1: Initial setup
  test('1. enable extension', async () => {
    await ext.setSettings({ enabled: true });
    await page.reload();

    const settings = await ext.getSettings();
    expect(settings.enabled).toBe(true);

    // STATE AFTER:
    // - Extension enabled
    // - Default profile active
  });

  // TEST 2: First message and summary
  test('2. summarize first message', async () => {
    // STATE EXPECTED:
    // - Extension enabled

    await ext.addChatMessage('Alice went to the market to buy fresh apples and oranges.');
    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    const summary = await ext.getSummaryForMessage(0);
    expect(summary).toBeTruthy();
    expect(summary).toContain('Alice');

    // STATE AFTER:
    // - One message with summary
  });

  // TEST 3: Second message
  test('3. summarize second message', async () => {
    // STATE EXPECTED:
    // - One message with summary from test 2

    await ext.addChatMessage('Bob joined Alice at the market and they bought vegetables.');
    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    const summaries = await ext.getAllSummaries();
    expect(summaries.length).toBe(2);

    // STATE AFTER:
    // - Two messages with summaries
  });

  // TEST 4: Enable Auto-Lorebooks
  test('4. enable lorebook creation', async () => {
    // STATE EXPECTED:
    // - Two messages with summaries

    await ext.setSettings({ auto_lorebook_enabled: true });

    // Trigger lorebook processing for existing summaries
    await ext.processLorebooksForAllSummaries();
    await page.waitForTimeout(3000); // Allow async processing

    const entries = await lore.getLorebookEntries();
    expect(entries.length).toBeGreaterThan(0);

    // Verify character entries
    const aliceEntry = await lore.findEntry('Alice');
    const bobEntry = await lore.findEntry('Bob');
    expect(aliceEntry).toBeTruthy();
    expect(bobEntry).toBeTruthy();

    // STATE AFTER:
    // - Auto-Lorebooks enabled
    // - Lorebook entries for Alice, Bob
  });

  // TEST 5: Create profile
  test('5. create detailed profile', async () => {
    // STATE EXPECTED:
    // - Two messages, summaries, lorebook entries

    await ext.openExtensionPanel();
    await ext.createProfile('detailed');
    await ext.switchToProfileViaUI('detailed');

    const profile = await ext.getCurrentProfile();
    expect(profile).toBe('detailed');

    // STATE AFTER:
    // - Profile 'detailed' exists and is active
    // - Extension panel open
  });

  // TEST 6: Third message with detailed profile
  test('6. summarize with detailed profile', async () => {
    // STATE EXPECTED:
    // - Profile 'detailed' active
    // - Extension panel open

    await ext.addChatMessage('Charlie arrived with a basket of fresh bread from the bakery.');
    await ext.clickSummarize();
    await ext.waitForOperationComplete();

    const summary = await ext.getSummaryForMessage(2);
    expect(summary).toBeTruthy();

    // Compare with previous summaries (detailed should be longer)
    const previousSummary = await ext.getSummaryForMessage(1);
    expect(summary.length).toBeGreaterThan(previousSummary.length * 0.8);

    // Verify lorebook entry created for Charlie
    await page.waitForTimeout(2000);
    const charlieEntry = await lore.findEntry('Charlie');
    expect(charlieEntry).toBeTruthy();

    // STATE AFTER:
    // - Three messages with summaries
    // - Three character entries (Alice, Bob, Charlie)
  });

  // TEST 7: Scene break
  test('7. create scene break and scene summary', async () => {
    // STATE EXPECTED:
    // - Three messages with summaries

    await ext.clickSceneBreak();
    await ext.waitForOperationComplete();

    const sceneData = await page.evaluate(() => {
      return window.SillyTavern.getContext().chat_metadata.scene_summaries;
    });

    expect(sceneData).toBeTruthy();
    expect(sceneData.length).toBe(1);
    expect(sceneData[0].summary).toContain('market');

    // STATE AFTER:
    // - Scene break after message 2
    // - One scene summary
  });

  // TEST 8: Switch back to default profile
  test('8. switch to default profile', async () => {
    // STATE EXPECTED:
    // - Profile 'detailed' active

    await ext.switchToProfileViaUI('default');

    const profile = await ext.getCurrentProfile();
    expect(profile).toBe('default');

    // STATE AFTER:
    // - Profile 'default' active
  });

  // TEST 9: Persistence check
  test('9. verify all data persists across reload', async () => {
    // STATE EXPECTED:
    // - Three messages with summaries
    // - Lorebook entries
    // - Scene summary
    // - Profile 'default' active

    // First reload in the entire suite!
    await page.reload();

    // Wait for extension to initialize
    await page.waitForTimeout(1000);

    // Verify settings
    const settings = await ext.getSettings();
    expect(settings.enabled).toBe(true);
    expect(settings.auto_lorebook_enabled).toBe(true);

    // Verify profile
    const profile = await ext.getCurrentProfile();
    expect(profile).toBe('default');

    // Verify summaries
    const summaries = await ext.getAllSummaries();
    expect(summaries.length).toBe(3);

    // Verify lorebook entries
    const entries = await lore.getLorebookEntries();
    expect(entries.length).toBeGreaterThan(2);

    // Verify scene data
    const sceneData = await page.evaluate(() => {
      return window.SillyTavern.getContext().chat_metadata.scene_summaries;
    });
    expect(sceneData.length).toBe(1);

    // STATE AFTER:
    // - All data verified persisted
    // - Fresh page load
  });

  // TEST 10: Disable and cleanup
  test('10. disable extension and verify cleanup', async () => {
    // STATE EXPECTED:
    // - Extension enabled with data

    await ext.setSettings({ enabled: false });
    await page.reload();

    const settings = await ext.getSettings();
    expect(settings.enabled).toBe(false);

    // Verify UI elements are disabled/hidden
    const summarizeButton = page.locator(selectorsExtension.summarization.summarizeButton);
    await expect(summarizeButton).toBeDisabled();

    // STATE AFTER:
    // - Extension disabled
    // - Data preserved but inactive
  });
});
```

---

## AI Development Workflow

### Typical Development Session

```
Feature: Add scene break detection

├─ STEP 1: Write feature code
│  Duration: 15 min
│  AI writes: sceneBreak.js, autoSceneDetection.js
│
├─ STEP 2: Write feature-isolation test
│  Duration: 5 min
│  AI writes: tests/features/scene-detection.spec.js
│  Focus: Tests scene break feature only
│
├─ STEP 3: Run feature test
│  Command: npm run test:feature scene-detection
│  Duration: 20s
│  Result: 2 failures
│
├─ STEP 4: Fix bugs found in feature test
│  Duration: 5 min
│  AI fixes: sceneBreak.js line 42
│
├─ STEP 5: Re-run feature test
│  Command: npm run test:feature scene-detection
│  Duration: 20s
│  Result: All pass ✓
│
├─ STEP 6: Add to full suite
│  Duration: 10 min
│  AI adds: test case to tests/suite/03-summarization-workflow.spec.js
│  Chains with existing tests
│
├─ STEP 7: Run full suite
│  Command: npm run test:suite
│  Duration: 2.5 min
│  Result: 1 regression (lorebook test broke)
│
├─ STEP 8: Fix regression
│  Duration: 5 min
│  AI fixes: lorebookManager.js (scene break affected lorebook)
│
├─ STEP 9: Re-run full suite
│  Command: npm run test:suite
│  Duration: 2.5 min
│  Result: All pass ✓
│
└─ TOTAL: 45 minutes with comprehensive testing
```

### AI Handling Test Failures

**Scenario: Selector not found**

```
1. Test fails: "Error: selector '#toggle_memory' not found"

2. AI reasons:
   - Test trying to click memory toggle button
   - Selector doesn't exist
   - Likely HTML changed

3. AI runs:
   npx playwright codegen http://localhost:8000

4. AI uses MCP browser to:
   - Navigate to extension panel
   - Identify memory toggle button visually
   - Playwright Inspector shows: "#memory_toggle"

5. AI updates selectors.js:
   toggleButton: '[data-testid="memory-toggle"], #memory_toggle, #toggle_memory'

6. AI re-runs test
   Result: Pass ✓
```

**Scenario: Assertion failure**

```
1. Test fails: "Expected summary.length > 50, got 12"

2. AI reasons:
   - Summary was created (length=12) but too short
   - Possible causes:
     a) LLM mock returning wrong response
     b) Profile using wrong prompt
     c) Summarization truncated

3. AI investigates:
   - Takes screenshot (see actual state)
   - Checks console logs (any errors?)
   - Checks operation queue (operation succeeded?)

4. AI discovers:
   - Operation succeeded
   - LLM mock returned: "Summary here"
   - Mock configured wrong for this test

5. AI fixes:
   - Updates test to use correct mock response fixture
   - Or updates mock fixture to return realistic response

6. AI re-runs test
   Result: Pass ✓
```

### When to Write Tests

**During feature development:**
- Write feature-isolation test for new feature
- Run frequently during development
- Fast iteration (20s per run)

**Before committing:**
- Add feature to full-suite test
- Run full suite once
- Catch regressions (2.5 min)

**After refactoring:**
- Run full suite
- Verify no regressions
- Update tests if behavior changed intentionally

### Token Economics Summary

```
One-time setup:
├─ Playwright config: 2k tokens
├─ Extract selectors: 2k tokens
├─ Discover ST selectors (MCP): 50-100k tokens
├─ Write helpers: 10k tokens
├─ Write initial tests: 20k tokens
└─ Total: ~85-135k tokens (one time)

Per feature:
├─ Write feature code: 15k tokens
├─ Write feature test: 5k tokens
├─ Run & iterate (3 cycles): 5k tokens
├─ Add to suite: 5k tokens
├─ Fix regressions: 10k tokens
└─ Total: ~40k tokens per feature

Maintenance:
├─ Selector breaks: 10k tokens (MCP + update)
├─ Test breaks: 15k tokens (debug + fix)
├─ New test: 5k tokens
└─ Average: ~10k tokens per maintenance task
```

---

## Summary

### Core Principles

1. **E2E only** - No mocks (except transparent LLM proxy)
2. **Sequential execution** - One backend = one worker
3. **Two test paths** - Feature-isolation (dev) + Full-suite (validation)
4. **Speed through optimization** - Shared context, lazy navigation, batch operations
5. **AI-friendly patterns** - Verifiable, discoverable, maintainable

### Key Patterns

- `describe.serial()` for chained tests
- `beforeAll` for shared context
- Fast setup (evaluate), slow testing (UI)
- Centralized selectors with fallbacks
- Helper classes hide implementation details
- Batch assertions and operations

### Realistic Expectations

- Feature-isolation tests: ~20s for 10 tests
- Full-suite tests: ~2-3 min for 100 tests
- With optimizations: ~45% faster
- Development with testing: ~45 min per feature
- This is acceptable for comprehensive E2E testing

### Tools for AI

- Playwright Inspector for selector discovery
- MCP browser for visual navigation
- Automatic screenshots/videos on failure
- Trace viewer for debugging
- Console log capture

---

## Quick Reference

### Test Commands

```bash
# Feature-isolation tests (fast iteration)
npm run test:feature summarization

# Full-suite tests (comprehensive)
npm run test:suite

# All tests
npm run test:all

# Debug mode (pause execution)
npm run test:debug

# Headed mode (see browser)
npm run test:headed

# UI mode (interactive)
npm run test:ui
```

### Helper Quick Reference

```javascript
// Setup (fast)
await ext.setDefaultSettings();
await ext.setSettings({ enabled: true });
await ext.addChatMessage('text');

// UI interaction (slow)
await ext.openExtensionPanel();
await ext.clickSummarize();
await ext.waitForOperationComplete();

// Verification (fast)
const summary = await ext.getSummaryForMessage(0);
const settings = await ext.getSettings();
const queue = await ext.getOperationQueue();

// Batch operations (fast)
await ext.setupTestScenario({ settings, messages, summaries });
const state = await ext.getTestState();
```

### Optimization Checklist

- [ ] Use `describe.serial()` for suite tests
- [ ] Use `beforeAll` instead of `beforeEach`
- [ ] Navigate once, reuse page context
- [ ] Use `page.evaluate()` for setup
- [ ] Batch assertions in single `evaluate()`
- [ ] Only reload when testing persistence
- [ ] Use `Promise.all()` for parallel assertions
- [ ] Reduce timeouts where appropriate
- [ ] Block unnecessary resources
- [ ] Comment expected state between tests

---

**End of Guide**

For more information, see:
- `PLAYWRIGHT_TESTING_GUIDE.md` - Why Playwright E2E
- `TESTING_REALITY_CHECK_FINAL.md` - Why other approaches failed
- `AI_DEVELOPMENT_WORKFLOW.md` - General AI development patterns

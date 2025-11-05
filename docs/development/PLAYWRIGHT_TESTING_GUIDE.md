# Playwright E2E Testing Guide

**Date:** 2025-01-06
**Status:** Production approach - this is what actually works
**Previous attempts:** See TESTING_REALITY_CHECK_FINAL.md for why everything else failed

---

## Table of Contents

1. [Why Playwright E2E](#why-playwright-e2e)
2. [Critical Constraints](#critical-constraints)
3. [Realistic Expectations](#realistic-expectations)
4. [Selector Management](#selector-management)
5. [Test Architecture](#test-architecture)
6. [Optimization Techniques](#optimization-techniques)
7. [Development Workflow](#development-workflow)
8. [Common Pitfalls](#common-pitfalls)
9. [Token Economics](#token-economics)
10. [What to Actually Test](#what-to-actually-test)

---

## Why Playwright E2E

### The Only Viable Option

After extensive validation (see TESTING_REALITY_CHECK_FINAL.md), Playwright E2E is the **only approach** that:

- ✅ Tests real SillyTavern code (not mocks)
- ✅ Tests actual UI interactions (not just function calls)
- ✅ Tests end-to-end workflows (button click → backend → UI update)
- ✅ Doesn't require modifying SillyTavern core
- ✅ Is fully AI-developable

### What Other Approaches Failed

**Node.js Import-Based Testing:**
- Import success rate: 9.1%
- CommonJS/ESM incompatibility in ST's lib.js
- Circular dependencies
- **Status:** Dead on arrival

**Browser Import Testing (claimed in TESTING_METHOD_DETAILED_GUIDE.md):**
- **Claimed:** "Test against real ST code, fast (~1ms per test)"
- **Reality:** Tests if functions exist, NOT if UI works
- **Problem:** Uses `page.evaluate(() => await import('/script.js'))` to call functions directly
- **What it misses:**
  - UI elements don't exist
  - UI elements not wired to functions
  - Settings UI doesn't update backend state
  - Click handlers don't fire
  - Real user workflows don't work
- **Verdict:** Unit testing disguised as integration testing through clever wording

**Example of what it "tests":**
```javascript
// What the "import-based" method does:
const result = await page.evaluate(async () => {
  const ext = await import('/scripts/extensions/third-party/auto-summarize/index.js');
  return typeof ext.get_settings === 'function';  // ✓ Function exists!
});
// Proves: get_settings function exists
// Does NOT prove: Settings UI renders, settings button works, clicking button saves settings
```

**What Playwright E2E actually tests:**
```javascript
test('user can change profile setting', async ({ page }) => {
  await page.goto('/');
  await page.click('#extensions_menu');              // Real UI interaction
  await page.click('#auto_summarize_panel');         // Real navigation
  await page.selectOption('#profile', 'detailed');   // Real setting change
  await page.click('#save_settings');                // Real save action

  // Verify backend state changed
  const profile = await page.evaluate(() => {
    return extension_settings['auto-summarize'].profile;
  });
  expect(profile).toBe('detailed');                  // Backend actually updated

  // Verify persists across reload
  await page.reload();
  const stillDetailed = await page.evaluate(() => {
    return extension_settings['auto-summarize'].profile;
  });
  expect(stillDetailed).toBe('detailed');            // Persisted!
});
```

**This tests the entire chain:** UI exists → UI is wired → Handler fires → Backend updates → State persists

### Why "Fast Tests" Are a Red Flag

If tests run in ~1ms each, they're not testing real integration:
- No UI navigation (takes 200-500ms)
- No element waiting (takes 50-200ms)
- No actual clicks (takes 50-100ms)
- No backend state changes (takes 10-100ms)
- No DOM updates (takes 10-50ms)

**Real E2E tests take 1-3 seconds** because they do real work.

---

## Critical Constraints

### 1. Sequential Execution Required

**Constraint:** ONE SillyTavern backend at localhost:8000

**Why parallelization is impossible:**

```
Playwright Worker 1                SillyTavern Backend
├─ Sets profile to "test-1" ────→ [Profile: test-1] ←── SHARED STATE
                                          ↓
Playwright Worker 2                       ↓
├─ Sets profile to "test-2" ────→ [Profile: test-2] ←── OVERWRITES
                                          ↓
Worker 1 reads profile ─────────→ Gets "test-2" ❌ TEST BROKEN
```

**All workers hit the same backend.**

Browser contexts give you isolated:
- ✅ Cookies
- ✅ localStorage
- ✅ sessionStorage
- ✅ IndexedDB

But NOT isolated:
- ❌ Extension settings (stored server-side or in global state)
- ❌ Profiles (stored server-side)
- ❌ Chats (stored server-side)
- ❌ Lorebook entries (stored server-side)
- ❌ Operation queue (stored in chat metadata)

**Solution:** Sequential execution only (`workers: 1` in Playwright config)

### 2. Shared State Means No Parallelization

Every meaningful test mutates state:
- Change settings → verify they persist ❌ Conflicts
- Click summarize → verify summary appears ❌ Conflicts
- Switch profiles → verify operations use new profile ❌ Conflicts
- Create lorebook entry → verify it shows ❌ Conflicts
- Enqueue operation → verify it processes ❌ Conflicts

**"Read-only tests" are pointless:**
- Checking if button exists without clicking it = not a real test
- You only care if button exists BECAUSE you need to test clicking it

### 3. Alternative (Complex): Multiple ST Backends

**Could enable parallelization:**
```bash
# Start 4 ST instances
PORT=8000 DATA_DIR=./test-data-0 node server.js &
PORT=8001 DATA_DIR=./test-data-1 node server.js &
PORT=8002 DATA_DIR=./test-data-2 node server.js &
PORT=8003 DATA_DIR=./test-data-3 node server.js &
```

**Playwright config:**
```javascript
workers: 4,
projects: [
  { name: 'w0', use: { baseURL: 'http://localhost:8000' } },
  { name: 'w1', use: { baseURL: 'http://localhost:8001' } },
  { name: 'w2', use: { baseURL: 'http://localhost:8002' } },
  { name: 'w3', use: { baseURL: 'http://localhost:8003' } }
]
```

**Time benefit:** 100 tests ÷ 4 workers × 1.5s = ~38 seconds (vs 2.5-3 minutes)

**Downsides:**
- 4 ST instances = 1GB+ RAM
- Complex setup/teardown scripts
- Each instance needs isolated data directory
- More things to break
- AI has to manage 4 backends

**Verdict:** Only worth it if 2.5 min → 40 sec matters enough to justify complexity

---

## Realistic Expectations

### Time Budget (Sequential, Optimized)

```
Test execution breakdown (per test):
├─ Navigation (page.goto): 200-500ms
├─ Wait for selectors: 50-200ms per element
├─ Click actions: 50-100ms per click
├─ Fill inputs: 50-100ms per fill
├─ DOM queries: 10-50ms per query
├─ Assertions: 10-50ms per assertion
├─ State verification: 100-500ms
└─ Total per test: 1-3 seconds

Realistic suite times:
├─ 10 smoke tests: 15-30 seconds
├─ 50 integration tests: 75-150 seconds (1.2-2.5 min)
├─ 100 full tests: 150-300 seconds (2.5-5 min)
└─ Average: ~2.5-3 minutes for comprehensive suite
```

**This is the price of real E2E testing with shared backend.**

### What Can't Be Optimized Away

- UI navigation takes time
- Waiting for elements takes time
- DOM manipulation takes time
- Backend operations take time

**Accept 2.5-3 minutes for full suite or accept complexity of multiple backends.**

### Development Velocity

```
Typical feature development:
├─ Write code: 10-20 min
├─ Run smoke tests: 20 sec
├─ Iterate with smoke: 20 sec × 3-4 times = 1 min
├─ Run full suite before commit: 3 min
├─ Fix any regressions: 5-15 min
├─ Run full suite again: 3 min
└─ Total: 30-45 minutes per feature with comprehensive testing

This is acceptable for quality assurance.
```

---

## Selector Management

### The Problem

**Without centralized selectors:**
```javascript
// You refactor: id="toggle_chat_memory" → id="toggle_memory"

// AI has to update ALL of these individually:
// test1.spec.js
await page.click('#toggle_chat_memory');  // ← Update

// test2.spec.js
await page.waitForSelector('#toggle_chat_memory');  // ← Update

// test5.spec.js
await expect(page.locator('#toggle_chat_memory')).toBeVisible();  // ← Update

// test12.spec.js
await page.click('#toggle_chat_memory');  // ← Update

// ... 20+ more places

// Risk: AI misses test12, that test silently fails
```

### The Solution: Centralized selectors.js

```javascript
// tests/selectors.js
export const selectors = {
  // Extension's own UI
  memory: {
    toggleButton: '#toggle_chat_memory',
    refreshButton: '#refresh_memory'
  },

  profiles: {
    dropdown: '#profile',
    renameButton: '#rename_profile',
    newButton: '#new_profile',
    deleteButton: '#delete_profile',
    characterButton: '#character_profile',
    chatButton: '#chat_profile'
  },

  settings: {
    notifyOnSwitch: '#notify_on_profile_switch',
    proxyDetails: '#first_hop_proxy_send_chat_details',
    wrapLorebook: '#wrap_lorebook_entries',
    includeUserMessages: '#include_user_messages'
  },

  // SillyTavern UI
  sillytavern: {
    chat: {
      input: '#send_textarea',
      sendButton: '#send_but',
      messageBlock: '.mes',
      messageText: '.mes_text'
    },
    extensions: {
      menu: '[data-extensions-menu]',  // Discovered via MCP
      panel: '[data-extension-panel]'
    }
  }
};
```

**In tests:**
```javascript
import { selectors } from './selectors.js';

test('can toggle memory', async ({ page }) => {
  await page.click(selectors.memory.toggleButton);
});

test('can refresh memory', async ({ page }) => {
  await page.click(selectors.memory.refreshButton);
});

// etc. - all tests use centralized selectors
```

**When you refactor:**
```javascript
// Change ONE place:
export const selectors = {
  memory: {
    toggleButton: '#toggle_memory'  // ← Only change here
  }
};

// ALL tests automatically use new selector
// Zero risk of missing updates
```

### How to Populate selectors.js

**1. Extension's Own UI (NO MCP needed):**

Your extension already documents all IDs in:
- `settings.html` - Contains all `id="..."` attributes
- `settingsUI.js` - References all IDs via `bind_setting('#...', ...)`

AI can extract these automatically:
```bash
# Grep all IDs from HTML
grep -o 'id="[^"]*"' settings.html

# Grep all bindings from settingsUI.js
grep -o "#[a-z_]*" settingsUI.js

# Generate selectors.js from extracted IDs
# Cost: ~2k tokens
```

**2. SillyTavern UI (MCP once):**

Need to discover:
- How to open extensions menu
- Where chat messages appear
- Where send button is
- Extension panel location
- etc.

**Process:**
```javascript
// AI uses MCP to navigate and document:
1. Load ST in browser via MCP
2. Take snapshot (25k tokens)
3. Click extensions menu
4. Take snapshot (25k tokens)
5. Document all discovered selectors
6. Total cost: ~50-100k tokens (one time only)
```

**3. Maintenance During Refactors:**

```
Refactor workflow:
├─ You change HTML: id="toggle_chat_memory" → id="toggle_memory"
├─ Tests run and fail: "Element '#toggle_chat_memory' not found"
├─ AI sees failure
├─ AI updates selectors.js: toggleButton: '#toggle_memory'
├─ Tests pass
└─ Done - all tests updated via single change
```

### Why This Approach Works

- ✅ **Single point of change** - update once, all tests fixed
- ✅ **Lower risk** - can't miss updating a test file
- ✅ **AI can't fuck it up** - one file vs. 20+ files
- ✅ **Documents all selectors** - visible in one place
- ✅ **Easier code review** - selector changes are obvious

---

## Test Architecture

### Directory Structure

```
tests/
├── playwright.config.js       # Sequential config
├── selectors.js               # Centralized selectors
├── helpers/
│   └── ExtensionHelper.js    # Reusable test actions
├── smoke/                     # 10 critical tests (20s)
│   └── critical-path.spec.js
└── integration/               # Full suite (2.5-3 min)
    ├── settings.spec.js
    ├── profiles.spec.js
    ├── summarization.spec.js
    ├── lorebook.spec.js
    ├── operation-queue.spec.js
    └── scene-detection.spec.js
```

### Playwright Config

```javascript
// playwright.config.js
export default {
  // Sequential execution only
  workers: 1,
  fullyParallel: false,

  // Timeouts
  timeout: 30000,              // 30s per test

  use: {
    baseURL: 'http://localhost:8000',
    headless: true,            // Faster than headed
    actionTimeout: 10000,      // 10s per action (vs 30s default)

    // Debugging
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry'
  },

  // Test organization
  projects: [
    {
      name: 'smoke',
      testMatch: /smoke.*\.spec\.js/,
      timeout: 15000           // Smoke tests should be fast
    },
    {
      name: 'integration',
      testMatch: /integration.*\.spec\.js/
    }
  ],

  // Fail fast in CI
  maxFailures: process.env.CI ? 10 : undefined
};
```

### Helper Pattern

**Create: `tests/helpers/ExtensionHelper.js`**

```javascript
import { selectors } from '../selectors.js';

export class ExtensionHelper {
  constructor(page) {
    this.page = page;
  }

  /**
   * Navigate to ST and wait for ready
   */
  async goto() {
    await this.page.goto('/');
    await this.page.waitForSelector(selectors.sillytavern.chat.input);
  }

  /**
   * Fast setup via page.evaluate() - don't use UI
   */
  async setSettings(settings) {
    await this.page.evaluate((s) => {
      Object.assign(window.extension_settings['auto-summarize'], s);
    }, settings);
  }

  /**
   * Fast setup - create chat message directly
   */
  async addChatMessage(text, isUser = true) {
    await this.page.evaluate((msg) => {
      const context = window.SillyTavern.getContext();
      context.chat.push({
        mes: msg.text,
        is_user: msg.isUser,
        name: msg.isUser ? 'User' : 'Assistant'
      });
      // Trigger UI update
      window.saveChat();
    }, { text, isUser });
  }

  /**
   * UI interaction - open extension panel
   */
  async openExtensionPanel() {
    await this.page.click(selectors.sillytavern.extensions.menu);
    await this.page.click(selectors.extension.panel);
    await this.page.waitForSelector(selectors.memory.toggleButton);
  }

  /**
   * UI interaction - click summarize button
   */
  async clickSummarize() {
    await this.page.click(selectors.summarization.summarizeButton);
  }

  /**
   * Wait for operation to complete
   */
  async waitForOperationComplete(timeout = 30000) {
    await this.page.waitForSelector(
      selectors.operationQueue.completeStatus,
      { timeout }
    );
  }

  /**
   * Get operation queue state
   */
  async getOperationQueue() {
    return await this.page.evaluate(() => {
      return window.getOperationQueue();  // Or however you access it
    });
  }

  /**
   * Get summary for message
   */
  async getSummaryForMessage(messageIndex) {
    return await this.page.evaluate((idx) => {
      const context = window.SillyTavern.getContext();
      return context.chat[idx]?.extra?.memory?.summary;
    }, messageIndex);
  }
}
```

### Test Pattern

**Smoke test example:**

```javascript
// tests/smoke/critical-path.spec.js
import { test, expect } from '@playwright/test';
import { ExtensionHelper } from '../helpers/ExtensionHelper.js';
import { selectors } from '../selectors.js';

test('extension loads and can summarize message', async ({ page }) => {
  const ext = new ExtensionHelper(page);

  // Fast setup
  await ext.goto();
  await ext.setSettings({ enabled: true });
  await ext.addChatMessage('Test message for summarization');

  // Reload to show new state
  await page.reload();

  // Test actual UI interaction
  await ext.clickSummarize();
  await ext.waitForOperationComplete();

  // Verify result
  const summary = await ext.getSummaryForMessage(0);
  expect(summary).toBeTruthy();
  expect(summary.length).toBeGreaterThan(0);
});
```

**Integration test example:**

```javascript
// tests/integration/profiles.spec.js
import { test, expect } from '@playwright/test';
import { ExtensionHelper } from '../helpers/ExtensionHelper.js';
import { selectors } from '../selectors.js';

test('switching profiles changes summarization behavior', async ({ page }) => {
  const ext = new ExtensionHelper(page);

  await ext.goto();
  await ext.openExtensionPanel();

  // Set profile to "brief"
  await page.selectOption(selectors.profiles.dropdown, 'brief');
  await ext.addChatMessage('Test message');
  await page.reload();

  await ext.clickSummarize();
  await ext.waitForOperationComplete();

  const briefSummary = await ext.getSummaryForMessage(0);

  // Switch to "detailed" profile
  await ext.openExtensionPanel();
  await page.selectOption(selectors.profiles.dropdown, 'detailed');
  await ext.addChatMessage('Second test message');
  await page.reload();

  await ext.clickSummarize();
  await ext.waitForOperationComplete();

  const detailedSummary = await ext.getSummaryForMessage(1);

  // Verify different prompts were used
  expect(detailedSummary.length).toBeGreaterThan(briefSummary.length);
});
```

### Key Principles

**1. Use page.evaluate() for setup, UI for testing:**

```javascript
// FAST: Setup via evaluate (don't test this)
await ext.setSettings({ enabled: true });
await ext.addChatMessage('test');

// SLOW: Test via UI (this is what we're actually testing)
await ext.clickSummarize();
await ext.waitForOperationComplete();
```

**2. Helper methods hide implementation details:**

```javascript
// Good: Declarative, easy to maintain
await ext.openExtensionPanel();
await ext.clickSummarize();

// Bad: Coupled to selectors, breaks on refactor
await page.click('#extensions_menu');
await page.click('#auto_summarize_panel');
await page.click('[data-action="summarize"]');
```

**3. Test one thing per test:**

```javascript
// Good: Tests profile switching
test('switching profiles works', async ({ page }) => {
  // ... test only profile switching
});

// Good: Tests summarization
test('summarization creates summary', async ({ page }) => {
  // ... test only summarization
});

// Bad: Tests everything at once
test('everything works', async ({ page }) => {
  // ... 200 lines testing profiles, summaries, lorebook, scenes, queue
  // When it fails, you don't know what broke
});
```

---

## Optimization Techniques

### What Actually Helps

**1. Reduce Timeouts**

```javascript
// playwright.config.js
use: {
  actionTimeout: 10000,      // 10s instead of 30s default
  navigationTimeout: 10000   // 10s instead of 30s default
}
```

**Saves:** ~50-100ms per action when things succeed (timeout not hit)

**2. Headless Mode**

```javascript
use: {
  headless: true  // No rendering overhead
}
```

**Saves:** ~10-20% time vs. headed mode

**3. Block Unnecessary Resources**

```javascript
// In helper or global setup
await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,ico,woff,woff2}',
  route => route.abort()
);
```

**Saves:** ~100-300ms per page load

**4. Use page.evaluate() for Setup**

```javascript
// FAST: Direct state manipulation (50ms)
await page.evaluate(() => {
  extension_settings['auto-summarize'].enabled = true;
});

// SLOW: Click through UI (500ms)
await page.click('#extensions_menu');
await page.click('#auto_summarize_panel');
await page.click('#enable_checkbox');
```

**Saves:** ~450ms per setup action

### What Doesn't Help Much

**1. Disabling Animations**

```javascript
await page.addInitScript(() => {
  const style = document.createElement('style');
  style.textContent = '* { transition: none !important; animation: none !important; }';
  document.head.appendChild(style);
});
```

**Saves:** ~10-50ms per page (minimal impact)

**2. Parallel Workers (Can't Use)**

Would save time but breaks shared state - not viable.

### Realistic Optimizations Impact

```
Without optimizations:
├─ 100 tests × 3-5s = 300-500s = 5-8 min

With optimizations:
├─ 100 tests × 1.5-2s = 150-200s = 2.5-3.3 min

Savings: ~50% time reduction
Still sequential, still 2.5-3 minutes minimum
```

---

## Development Workflow

### During Feature Development

```bash
# AI makes code change
# AI runs smoke tests to verify major functionality
npm run test:smoke

# Output: 10 tests in 20 seconds
# Fast feedback loop

# Iterate rapidly with smoke tests
# Make change → test:smoke → make change → test:smoke
```

### Before Committing Feature

```bash
# AI runs full suite to catch regressions
npm run test:full

# Output: 100 tests in 2.5-3 minutes
# Comprehensive validation

# If any failures:
# AI fixes issues
# AI runs full suite again
# Repeat until all pass
```

### NPM Scripts

```json
{
  "scripts": {
    "test:smoke": "playwright test --project=smoke",
    "test:full": "playwright test",
    "test:debug": "playwright test --debug",
    "test:ui": "playwright test --ui",
    "test:settings": "playwright test --grep @settings",
    "test:lorebook": "playwright test --grep @lorebook"
  }
}
```

### Typical Development Session

```
Feature: Add scene break detection
├─ 0:00 - Write feature code (15 min)
├─ 0:15 - Write smoke test (5 min)
├─ 0:20 - Run smoke test (20s)
├─ 0:21 - Fix bug found (5 min)
├─ 0:26 - Run smoke test (20s)
├─ 0:27 - Write integration test (10 min)
├─ 0:37 - Run full suite (3 min)
├─ 0:40 - Fix regression in lorebook (5 min)
├─ 0:45 - Run full suite (3 min)
├─ 0:48 - All tests pass ✓
└─ Total: 48 minutes with comprehensive testing

This is acceptable velocity.
```

---

## Common Pitfalls

### Pitfall 1: Updating Selectors Individually

**DON'T:**
```javascript
// Refactor changes ID
// AI updates 20 test files individually
// Risks missing some, breaking tests silently
```

**DO:**
```javascript
// Update selectors.js once
// All tests automatically use new selector
export const selectors = {
  memory: {
    toggleButton: '#toggle_memory'  // Changed here only
  }
};
```

### Pitfall 2: Trusting AI to Parallelize

**DON'T:**
```javascript
// AI sets up parallel workers
// Tests step on each other's state
// Random failures, impossible to debug
```

**DO:**
```javascript
// Sequential execution only
export default {
  workers: 1,
  fullyParallel: false
};
```

### Pitfall 3: Testing Function Existence

**DON'T:**
```javascript
test('extension has get_settings function', async ({ page }) => {
  const hasFunction = await page.evaluate(() => {
    return typeof window.extension.get_settings === 'function';
  });
  expect(hasFunction).toBe(true);
  // This proves nothing about whether the feature works
});
```

**DO:**
```javascript
test('user can change and persist settings', async ({ page }) => {
  await page.goto('/');
  await page.click('#extensions_menu');
  await page.selectOption('#profile', 'detailed');
  await page.click('#save_settings');

  await page.reload();

  const profile = await page.evaluate(() => {
    return extension_settings['auto-summarize'].profile;
  });
  expect(profile).toBe('detailed');
  // This proves the entire chain works: UI → handler → backend → persistence
});
```

### Pitfall 4: Mocking LLM Thinking It's the Bottleneck

**DON'T:**
```javascript
// Mock LLM responses thinking that's what makes tests slow
await page.route('**/api/generate', route => {
  route.fulfill({ json: { text: 'mocked' } });
});
// Tests still take 2.5 min because UI interaction is the bottleneck
```

**REALITY:**
- LLM calls: Already mocked via proxy
- Bottleneck: UI navigation, element waiting, DOM manipulation
- Mocking more things won't make tests faster

### Pitfall 5: Writing Only "Happy Path" Tests

**DON'T:**
```javascript
test('summarization works', async ({ page }) => {
  // Only test success case
  await clickSummarize();
  await expectSummaryAppears();
});
```

**DO:**
```javascript
test('summarization handles errors gracefully', async ({ page }) => {
  // Disconnect backend
  await mockBackendFailure();

  await clickSummarize();

  // Verify error handling
  await expect(page.locator('.error-message')).toContainText('Failed to summarize');
  await expect(page.locator('.retry-button')).toBeVisible();
});

test('summarization can be retried after failure', async ({ page }) => {
  await mockBackendFailureOnce();

  await clickSummarize();
  await expect(page.locator('.error-message')).toBeVisible();

  await page.click('.retry-button');
  await waitForOperationComplete();

  const summary = await getSummary();
  expect(summary).toBeTruthy();
});
```

### Pitfall 6: Not Using test.step()

**DON'T:**
```javascript
test('complex workflow', async ({ page }) => {
  await doThing1();
  await doThing2();
  await doThing3();
  // Fails at thing3, have to re-run entire test to debug
});
```

**DO:**
```javascript
test('complex workflow', async ({ page }) => {
  await test.step('Setup', async () => {
    await doThing1();
  });

  await test.step('Action', async () => {
    await doThing2();
  });

  await test.step('Verify', async () => {
    await doThing3();
  });
  // Trace viewer shows which step failed, can jump to that step
});
```

---

## Token Economics

### Initial Setup

```
One-time costs:
├─ Install Playwright: 0 tokens (bash command)
├─ Create config: 2k tokens
├─ Extract extension selectors: 2k tokens (grep own HTML/JS)
├─ Discover ST selectors via MCP: 50-100k tokens
├─ Write helper class: 5k tokens
├─ Write initial smoke tests: 10k tokens
└─ Total: ~70-120k tokens (one time)
```

### Per-Test Development

```
Writing new test:
├─ Write test code: 3-5k tokens
├─ Run test via bash: 500 tokens
├─ Read failure output: 2k tokens
├─ Fix code: 3-5k tokens
├─ Re-run test: 500 tokens
└─ Total per test: ~10-15k tokens

Compare with MCP interactive:
├─ Take snapshot: 25k tokens
├─ Click element: 5k tokens
├─ Take snapshot: 25k tokens
├─ Verify state: 5k tokens
├─ Take snapshot: 25k tokens
└─ Total: 85k+ tokens for single action

Savings: ~85% token reduction by running tests via bash
```

### Maintenance Costs

```
Selector changes:
├─ Update selectors.js: 1k tokens
├─ All tests automatically fixed: 0k tokens
└─ Total: 1k tokens

Without centralized selectors:
├─ Update test1.spec.js: 1k tokens
├─ Update test2.spec.js: 1k tokens
├─ Update test5.spec.js: 1k tokens
├─ ... update 20+ files: 20k+ tokens
├─ Risk missing some: HIGH
└─ Total: 20k+ tokens with risk

Savings: ~95% reduction
```

### Full Development Cycle

```
Complete feature with testing:
├─ Write feature code: 10-15k tokens
├─ Write smoke test: 5k tokens
├─ Iterate with smoke (3 runs): 3k tokens
├─ Write integration tests: 15k tokens
├─ Run full suite: 1k tokens
├─ Fix regressions: 10k tokens
├─ Run full suite: 1k tokens
└─ Total: ~50-60k tokens

Without testing:
├─ Write feature code: 10-15k tokens
├─ Manual testing by human: N/A
├─ Miss regressions: LIKELY
├─ Break other features: LIKELY
├─ Debug in production: EXPENSIVE
└─ Total: Lower token cost, higher bug cost
```

---

## What to Actually Test

### Real Integration Tests

**Test complete workflows:**

```javascript
test('user creates summary and it persists', async ({ page }) => {
  // Start to finish workflow
  await createMessage();
  await clickSummarize();
  await waitForComplete();
  await verifySummaryExists();
  await reload();
  await verifySummaryStillExists();
});
```

**Not just:**

```javascript
test('summarize function exists', async ({ page }) => {
  // Proves nothing about whether it works
  const exists = await page.evaluate(() => {
    return typeof window.summarize === 'function';
  });
  expect(exists).toBe(true);
});
```

### Test the Integration Points

**Extension ↔ SillyTavern:**

```javascript
test('extension receives ST events', async ({ page }) => {
  await page.evaluate(() => {
    window.testEventReceived = false;
    SillyTavern.eventSource.on('MESSAGE_SENT', () => {
      window.testEventReceived = true;
    });
  });

  await sendMessage();

  const received = await page.evaluate(() => window.testEventReceived);
  expect(received).toBe(true);
});
```

**Extension ↔ Backend:**

```javascript
test('extension saves to backend', async ({ page }) => {
  await changeSettings();

  // Verify backend endpoint was called
  const saved = await checkBackendState();
  expect(saved).toBe(true);

  // Verify persists across reload
  await page.reload();
  const stillSaved = await checkBackendState();
  expect(stillSaved).toBe(true);
});
```

### Test Error Cases

```javascript
test('handles backend timeout gracefully', async ({ page }) => {
  await mockSlowBackend();

  await clickSummarize();

  await expect(page.locator('.timeout-message')).toBeVisible();
  await expect(page.locator('.retry-button')).toBeVisible();
});

test('handles malformed LLM response', async ({ page }) => {
  await mockInvalidJSON();

  await clickSummarize();

  await expect(page.locator('.error-message')).toContainText('Invalid response');
});

test('handles missing lorebook gracefully', async ({ page }) => {
  await deleteLorebook();

  await clickCreateEntry();

  await expect(page.locator('.warning')).toContainText('Lorebook not found');
  await expect(page.locator('.create-lorebook-button')).toBeVisible();
});
```

### Test Complex State

**Operation queue processing:**

```javascript
test('queued operations process in order', async ({ page }) => {
  await enqueueOperation('summarize', { messageId: 1 });
  await enqueueOperation('validate', { messageId: 1 });
  await enqueueOperation('summarize', { messageId: 2 });

  const queue = await getQueue();
  expect(queue[0].type).toBe('summarize');
  expect(queue[1].type).toBe('validate');
  expect(queue[2].type).toBe('summarize');

  await waitForQueueEmpty();

  const summary1 = await getSummary(1);
  const summary2 = await getSummary(2);
  expect(summary1).toBeTruthy();
  expect(summary2).toBeTruthy();
});
```

**Profile switching:**

```javascript
test('switching profiles mid-operation uses new profile', async ({ page }) => {
  await setProfile('brief');
  await enqueueOperation('summarize', { messageId: 1 });

  // Switch profile while operation is queued
  await setProfile('detailed');

  await waitForQueueEmpty();

  // Operation should use detailed profile (new one)
  const summary = await getSummary(1);
  expect(summary.length).toBeGreaterThan(100); // Detailed summaries are longer
});
```

### Don't Test Implementation Details

**BAD:**

```javascript
test('_internal_parse_json_helper works', async ({ page }) => {
  // Testing internal implementation
  // This will break when you refactor, even if feature still works
});
```

**GOOD:**

```javascript
test('lorebook entries are created from summary', async ({ page }) => {
  // Testing user-visible behavior
  // Won't break from refactors unless actual behavior changes
  await summarizeMessage();
  await waitForComplete();

  const entries = await getLorebookEntries();
  expect(entries.length).toBeGreaterThan(0);
});
```

---

## Summary

### What Works

- ✅ Sequential Playwright E2E tests
- ✅ Centralized selector management
- ✅ Helper classes for common actions
- ✅ page.evaluate() for setup, UI for testing
- ✅ Smoke tests for fast iteration
- ✅ Full suite for comprehensive validation
- ✅ 2.5-3 minute test runs
- ✅ Fully AI-developable

### What Doesn't Work

- ❌ Parallel execution (shared backend)
- ❌ Import-based "fast" tests (unit tests in disguise)
- ❌ Testing function existence without UI
- ❌ Hoping for <1 minute full suite without multiple backends
- ❌ Updating selectors individually across test files
- ❌ Trusting AI to manage parallel workers

### Realistic Expectations

```
Development velocity:
├─ Feature code: 15 min
├─ Smoke test development: 5 min
├─ Smoke iterations: 2-3 min
├─ Integration tests: 15 min
├─ Full suite runs: 6 min (2 runs)
├─ Fix regressions: 10 min
└─ Total: 50-60 min per feature with comprehensive tests

This is acceptable for quality assurance.
```

### Decision Points

**Accept 2.5-3 minutes?**
- Sequential execution
- Simple setup
- Reliable

**Or setup multiple backends?**
- ~40 seconds for 100 tests
- Complex infrastructure
- More things to break
- Higher RAM usage

**Choose based on whether 2.5 min → 40 sec matters enough to justify complexity.**

---

## Final Word

This is the pragmatic approach that actually works. It's not fast enough to run after every small change, but it's fast enough to run:
- During development (smoke tests)
- Before commits (full suite)
- In CI/CD (full suite)

The alternative is no automated testing, which means:
- Features break silently
- Regressions go unnoticed
- Manual testing required
- Quality suffers

**2.5 minutes is the price of comprehensive E2E testing. Accept it or build complex multi-backend infrastructure.**

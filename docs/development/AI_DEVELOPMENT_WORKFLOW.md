# AI Development Workflow for ST-Auto-Recap

**Complete end-to-end guide for AI-driven feature development with testing**

---

## Table of Contents

1. [Overview](#overview)
2. [One-Time Setup](#one-time-setup)
3. [Development Workflow](#development-workflow)
4. [Test Patterns](#test-patterns)
5. [Common Failures & Fixes](#common-failures--fixes)
6. [Checklist for Every Feature](#checklist-for-every-feature)

---

## Overview

### The Problem This Solves

AI systematically makes these mistakes when implementing features:
1. **Creates UI elements but forgets to wire them** → User sees dropdown, changes it, nothing happens
2. **Wires elements but to wrong settings** → Dropdown changes `settings.foo` but code reads `settings.bar`
3. **Reads settings but uses wrong values** → Code reads `settings.prompt` but sends hardcoded default to LLM
4. **Breaks existing functionality** → New feature changes shared code, breaks unrelated features

### The Solution

**In-browser unit testing** - Tests run in real browser with real SillyTavern loaded, but test individual functions directly.

**When:** After implementing feature, before considering it "done"

**Why:** Catches wiring failures, setting mismatches, integration breaks immediately

---

## One-Time Setup

### Step 1: Install Dependencies

```bash
cd /mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New/public/scripts/extensions/third-party/ST-Auto-Recap

npm install --save-dev puppeteer http-server
```

### Step 2: Create Test Infrastructure

#### tests/index.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>ST-Auto-Recap Tests</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/mocha@10/mocha.css">
</head>
<body>
  <div id="mocha"></div>

  <!-- Mocha test framework -->
  <script src="https://cdn.jsdelivr.net/npm/mocha@10/mocha.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chai@4/chai.min.js"></script>

  <!-- Load real SillyTavern code -->
  <script>
    // Minimal ST globals that extension expects
    window.chat = [];
    window.chat_metadata = {};
    window.extension_settings = {
      auto_recap: {
        profiles: {
          default: {}
        },
        profile: 'default'
      }
    };
    window.characters = [];
    window.this_chid = 0;
    window.name2 = 'TestChar';

    // Mock ST functions with spies
    window.generateRaw = async (options) => {
      window.generateRaw.calls = window.generateRaw.calls || [];
      window.generateRaw.calls.push(options);
      return { content: 'Mock LLM response' };
    };

    window.saveMetadata = () => {
      window.saveMetadata.calls = window.saveMetadata.calls || [];
      window.saveMetadata.calls.push(Date.now());
    };

    window.getContext = () => ({
      chat: window.chat,
      characters: window.characters,
      name2: window.name2
    });

    // jQuery (if not already loaded by ST)
    window.$ = window.jQuery = (sel) => {
      if (typeof sel === 'string') {
        return $(document.querySelector(sel));
      }
      if (sel === document) {
        return {
          ready: (fn) => fn()
        };
      }
      return {
        append: (html) => {
          if (typeof html === 'string') {
            sel.insertAdjacentHTML('beforeend', html);
          } else {
            sel.appendChild(html);
          }
          return $;
        },
        val: function(v) {
          if (v !== undefined) {
            sel.value = v;
            return this;
          }
          return sel.value;
        },
        on: (event, handler) => {
          sel.addEventListener(event, handler);
          return $;
        },
        click: () => {
          sel.click();
          return $;
        },
        prop: (name, val) => {
          if (val !== undefined) {
            sel[name] = val;
            return $;
          }
          return sel[name];
        }
      };
    };
    window.$.fn = {};
  </script>

  <!-- Load extension code (all modules) -->
  <script type="module">
    // Import all extension modules
    // Note: These are loaded as modules, so exports are available
    import * as index from '../index.js';
    import * as settingsUI from '../settingsUI.js';
    import * as settingsManager from '../settingsManager.js';
    import * as recap generation from '../recapping.js';
    import * as memoryCore from '../memoryCore.js';
    import * as operationQueue from '../operationQueue.js';
    // ... import all other modules

    // Expose to window for tests
    window.extensionModules = {
      index,
      settingsUI,
      settingsManager,
      recap generation,
      memoryCore,
      operationQueue
      // ... etc
    };
  </script>

  <!-- Setup Mocha -->
  <script>
    mocha.setup({
      ui: 'bdd',
      timeout: 5000
    });
    const { expect } = chai;
    window.expect = expect;
  </script>

  <!-- Load test files -->
  <script type="module" src="./tests/ui-wiring.test.js"></script>
  <script type="module" src="./tests/settings.test.js"></script>
  <script type="module" src="./tests/integration.test.js"></script>

  <!-- Run tests and expose results -->
  <script>
    mocha.run((failures) => {
      const runner = mocha.suite;
      const tests = [];

      function collectTests(suite) {
        suite.tests.forEach(test => {
          tests.push({
            title: test.title,
            fullTitle: test.fullTitle(),
            state: test.state,
            error: test.err ? test.err.message : null,
            duration: test.duration
          });
        });
        suite.suites.forEach(collectTests);
      }

      collectTests(runner);

      const passed = tests.filter(t => t.state === 'passed');
      const failed = tests.filter(t => t.state === 'failed');

      window.mochaResults = {
        passes: passed.length,
        failures: failed.length,
        tests: tests,
        passed: passed,
        failed: failed
      };
    });
  </script>
</body>
</html>
```

#### tests/runner.js

```javascript
import puppeteer from 'puppeteer';
import { createServer } from 'http-server';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('Starting test server...');

  // Start HTTP server
  const server = createServer({
    root: __dirname + '/..',
    cache: -1
  });

  await new Promise((resolve) => {
    server.listen(8888, () => {
      console.log('Test server running on http://localhost:8888\n');
      resolve();
    });
  });

  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Capture console output from page
    page.on('console', msg => {
      const text = msg.text();
      if (!text.includes('Download the React DevTools')) {
        console.log(`  [Browser] ${text}`);
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      console.error(`  [Browser Error] ${error.message}`);
    });

    console.log('Loading tests...\n');
    await page.goto('http://localhost:8888/tests/index.html');

    // Wait for tests to complete (max 30s)
    console.log('Running tests...\n');
    await page.waitForFunction(
      () => window.mochaResults,
      { timeout: 30000 }
    );

    // Get results
    const results = await page.evaluate(() => window.mochaResults);

    // Print results
    console.log('='.repeat(70));
    console.log(`RESULTS: ${results.passes} passed, ${results.failures} failed`);
    console.log('='.repeat(70));

    if (results.passed.length > 0) {
      console.log('\n✅ PASSED:');
      results.passed.forEach(test => {
        console.log(`  ✓ ${test.fullTitle}`);
      });
    }

    if (results.failed.length > 0) {
      console.log('\n❌ FAILED:');
      results.failed.forEach(test => {
        console.log(`  ✗ ${test.fullTitle}`);
        console.log(`    Error: ${test.error}`);
      });
    }

    console.log('\n' + '='.repeat(70));

    await browser.close();
    server.close();

    process.exit(results.failures > 0 ? 1 : 0);

  } catch (error) {
    console.error('Test runner error:', error);
    if (browser) await browser.close();
    server.close();
    process.exit(1);
  }
}

runTests();
```

#### package.json (add test script)

```json
{
  "scripts": {
    "test": "node tests/runner.js",
    "test:manual": "npx http-server . -p 8888 -o /tests/index.html"
  },
  "devDependencies": {
    "puppeteer": "^21.0.0",
    "http-server": "^14.0.0"
  }
}
```

**Setup is now complete. AI never needs to touch these files again.**

---

## Development Workflow

### Phase 1: Receive Feature Request

**Example:** "Add a dropdown to select which prompt template to use for recap generation"

**Requirements:**
- Dropdown in settings UI
- Options: "Default", "Detailed", "Brief"
- Setting stored in profile
- Selected prompt used when calling generateRaw

### Phase 2: Implement Feature

**AI implements the feature normally:**

```javascript
// settingsUI.js - Add UI element
export function setupPromptSelector() {
  const html = `
    <label for="recap_prompt_template">Prompt Template:</label>
    <select id="recap_prompt_template">
      <option value="default">Default</option>
      <option value="detailed">Detailed</option>
      <option value="brief">Brief</option>
    </select>
  `;

  $('#prompt_settings_container').append(html);

  // Wire to settings
  $('#recap_prompt_template').on('change', function() {
    const settings = get_settings();
    settings.prompt_template = $(this).val();
    saveSettingsDebounced();
  });

  // Load current value
  const settings = get_settings();
  $('#recap_prompt_template').val(settings.prompt_template || 'default');
}

// recapping.js - Use the setting
export async function generateRecap(messageId) {
  const settings = get_settings();
  const message = chat[messageId];

  const prompts = {
    default: 'Recap this message: {{message}}',
    detailed: 'Provide a detailed recap of: {{message}}',
    brief: 'Briefly recap: {{message}}'
  };

  const template = prompts[settings.prompt_template] || prompts.default;
  const prompt = template.replace('{{message}}', message.mes);

  const result = await generateRaw({
    prompt: prompt,
    max_tokens: settings.max_tokens
  });

  return result.content;
}
```

### Phase 3: Write Tests (CRITICAL - Do NOT Skip)

**Create test file immediately after implementing:**

```javascript
// tests/tests/prompt-selector.test.js
describe('Prompt Selector Feature', () => {

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '<div id="prompt_settings_container"></div>';

    // Reset settings
    window.extension_settings.auto_recap.profiles.default = {
      prompt_template: 'default'
    };

    // Clear spy calls
    if (window.generateRaw.calls) {
      window.generateRaw.calls = [];
    }
  });

  describe('UI Creation', () => {
    it('creates dropdown element', () => {
      window.extensionModules.settingsUI.setupPromptSelector();

      const dropdown = document.getElementById('recap_prompt_template');
      expect(dropdown).to.exist;
      expect(dropdown.tagName).to.equal('SELECT');
    });

    it('has all three options', () => {
      window.extensionModules.settingsUI.setupPromptSelector();

      const dropdown = document.getElementById('recap_prompt_template');
      const options = Array.from(dropdown.options).map(o => o.value);

      expect(options).to.include('default');
      expect(options).to.include('detailed');
      expect(options).to.include('brief');
    });
  });

  describe('Settings Wiring', () => {
    it('updates setting when dropdown changes', () => {
      window.extensionModules.settingsUI.setupPromptSelector();

      const dropdown = document.getElementById('recap_prompt_template');
      dropdown.value = 'detailed';
      dropdown.dispatchEvent(new Event('change'));

      const settings = window.extension_settings.auto_recap.profiles.default;
      expect(settings.prompt_template).to.equal('detailed');
    });

    it('loads current setting value on init', () => {
      // Set initial value
      window.extension_settings.auto_recap.profiles.default.prompt_template = 'brief';

      // Setup UI
      window.extensionModules.settingsUI.setupPromptSelector();

      // Verify dropdown shows current value
      const dropdown = document.getElementById('recap_prompt_template');
      expect(dropdown.value).to.equal('brief');
    });
  });

  describe('Integration with Recap Generation', () => {
    it('uses selected prompt template', async () => {
      // Set prompt template
      window.extension_settings.auto_recap.profiles.default.prompt_template = 'detailed';
      window.extension_settings.auto_recap.profiles.default.max_tokens = 100;

      // Add message to chat
      window.chat = [{
        mes: 'This is a test message',
        extra: {}
      }];

      // Generate recap
      await window.extensionModules.recap generation.generateRecap(0);

      // Verify correct prompt was used
      expect(window.generateRaw.calls).to.have.lengthOf(1);
      const call = window.generateRaw.calls[0];
      expect(call.prompt).to.include('Provide a detailed recap');
      expect(call.prompt).to.include('This is a test message');
    });

    it('falls back to default if template not set', async () => {
      // Don't set prompt_template (undefined)
      window.extension_settings.auto_recap.profiles.default = {};

      window.chat = [{ mes: 'Test', extra: {} }];

      await window.extensionModules.recap generation.generateRecap(0);

      const call = window.generateRaw.calls[0];
      expect(call.prompt).to.include('Recap this message:');
    });

    it('uses correct template for each option', async () => {
      window.chat = [{ mes: 'Test message', extra: {} }];

      const templates = ['default', 'detailed', 'brief'];
      const expectedStrings = [
        'Recap this message:',
        'Provide a detailed recap',
        'Briefly recap:'
      ];

      for (let i = 0; i < templates.length; i++) {
        window.generateRaw.calls = []; // Clear calls
        window.extension_settings.auto_recap.profiles.default.prompt_template = templates[i];

        await window.extensionModules.recap generation.generateRecap(0);

        expect(window.generateRaw.calls[0].prompt).to.include(expectedStrings[i]);
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles invalid template gracefully', async () => {
      window.extension_settings.auto_recap.profiles.default.prompt_template = 'nonexistent';
      window.chat = [{ mes: 'Test', extra: {} }];

      // Should not crash
      await window.extensionModules.recap generation.generateRecap(0);

      // Should fall back to default
      expect(window.generateRaw.calls[0].prompt).to.include('Recap this message:');
    });
  });
});
```

### Phase 4: Run Tests

```bash
npm test
```

**AI sees output:**

```
Starting test server...
Test server running on http://localhost:8888

Launching browser...
Loading tests...

Running tests...

======================================================================
RESULTS: 8 passed, 2 failed
======================================================================

✅ PASSED:
  ✓ Prompt Selector Feature UI Creation creates dropdown element
  ✓ Prompt Selector Feature UI Creation has all three options
  ✓ Prompt Selector Feature Settings Wiring loads current setting value on init
  ✓ Prompt Selector Feature Integration with Recap Generation falls back to default if template not set
  ✓ Prompt Selector Feature Integration with Recap Generation uses correct template for each option
  ✓ Prompt Selector Feature Edge Cases handles invalid template gracefully

❌ FAILED:
  ✗ Prompt Selector Feature Settings Wiring updates setting when dropdown changes
    Error: expected undefined to equal 'detailed'
  ✗ Prompt Selector Feature Integration with Recap Generation uses selected prompt template
    Error: expected 'Recap this message: This is a test message' to include 'Provide a detailed recap'

======================================================================
```

### Phase 5: Fix Failures

**AI analyzes failures:**

1. **"updates setting when dropdown changes" failed** - Setting is undefined after change
   - **Diagnosis:** Forgot to wire the change handler, or wired it wrong

2. **"uses selected prompt template" failed** - Wrong prompt used
   - **Diagnosis:** Code not reading the setting, or reading wrong setting

**AI fixes:**

```javascript
// settingsUI.js - FIX: Actually wire the handler (was missing)
export function setupPromptSelector() {
  const html = `
    <label for="recap_prompt_template">Prompt Template:</label>
    <select id="recap_prompt_template">
      <option value="default">Default</option>
      <option value="detailed">Detailed</option>
      <option value="brief">Brief</option>
    </select>
  `;

  $('#prompt_settings_container').append(html);

  // FIX: Add the handler that was missing
  $('#recap_prompt_template').on('change', function() {
    const settings = get_settings();
    settings.prompt_template = $(this).val();
    saveSettingsDebounced();
  });

  const settings = get_settings();
  $('#recap_prompt_template').val(settings.prompt_template || 'default');
}
```

### Phase 6: Run Tests Again

```bash
npm test
```

**Output:**

```
======================================================================
RESULTS: 10 passed, 0 failed
======================================================================

✅ PASSED:
  ✓ Prompt Selector Feature UI Creation creates dropdown element
  ✓ Prompt Selector Feature UI Creation has all three options
  ✓ Prompt Selector Feature Settings Wiring updates setting when dropdown changes
  ✓ Prompt Selector Feature Settings Wiring loads current setting value on init
  ✓ Prompt Selector Feature Integration with Recap Generation uses selected prompt template
  ✓ Prompt Selector Feature Integration with Recap Generation falls back to default if template not set
  ✓ Prompt Selector Feature Integration with Recap Generation uses correct template for each option
  ✓ Prompt Selector Feature Edge Cases handles invalid template gracefully

======================================================================
```

### Phase 7: Commit

```bash
git add .
git commit -m "Add prompt template selector with tests"
```

**Feature is now complete and verified working.**

---

## Test Patterns

### Pattern 1: UI Element Creation

**Tests that element exists:**

```javascript
describe('Feature Name - UI Creation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="target_container"></div>';
  });

  it('creates the main element', () => {
    setupMyFeatureUI();

    const element = document.getElementById('my_feature_element');
    expect(element).to.exist;
  });

  it('creates element with correct type', () => {
    setupMyFeatureUI();

    const element = document.getElementById('my_checkbox');
    expect(element.type).to.equal('checkbox');
  });

  it('creates all sub-elements', () => {
    setupMyFeatureUI();

    expect(document.getElementById('element_1')).to.exist;
    expect(document.getElementById('element_2')).to.exist;
    expect(document.getElementById('element_3')).to.exist;
  });
});
```

### Pattern 2: Settings Wiring

**Tests that UI changes update settings:**

```javascript
describe('Feature Name - Settings Wiring', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="settings"></div>';
    window.extension_settings.auto_recap.profiles.default = {};
  });

  it('updates setting when input changes', () => {
    setupMyFeatureUI();

    const input = document.getElementById('my_input');
    input.value = 'new_value';
    input.dispatchEvent(new Event('input'));

    const settings = window.extension_settings.auto_recap.profiles.default;
    expect(settings.my_setting).to.equal('new_value');
  });

  it('updates setting when checkbox clicked', () => {
    setupMyFeatureUI();

    const checkbox = document.getElementById('my_checkbox');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    const settings = window.extension_settings.auto_recap.profiles.default;
    expect(settings.my_flag).to.be.true;
  });

  it('loads current setting value on init', () => {
    // Pre-set the setting
    window.extension_settings.auto_recap.profiles.default.my_setting = 'existing';

    setupMyFeatureUI();

    const input = document.getElementById('my_input');
    expect(input.value).to.equal('existing');
  });
});
```

### Pattern 3: Setting Usage

**Tests that code actually uses the settings:**

```javascript
describe('Feature Name - Setting Usage', () => {
  beforeEach(() => {
    window.generateRaw.calls = [];
    window.chat = [{ mes: 'test', extra: {} }];
  });

  it('uses the configured setting', async () => {
    window.extension_settings.auto_recap.profiles.default.my_setting = 'custom_value';

    await myFeatureFunction();

    // Verify the setting was actually used
    expect(window.generateRaw.calls[0]).to.include('custom_value');
  });

  it('respects setting changes', async () => {
    window.extension_settings.auto_recap.profiles.default.max_retries = 3;

    // Simulate operation
    let attempts = 0;
    window.riskyOperation = () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'success';
    };

    await myRetryableFunction();

    expect(attempts).to.equal(3); // Used the setting
  });
});
```

### Pattern 4: Integration Testing

**Tests that features work together:**

```javascript
describe('Feature Name - Integration', () => {
  it('end-to-end workflow works', async () => {
    // Setup: Create UI
    setupMyFeatureUI();

    // Step 1: User changes setting via UI
    const dropdown = document.getElementById('my_dropdown');
    dropdown.value = 'option2';
    dropdown.dispatchEvent(new Event('change'));

    // Step 2: Feature uses that setting
    window.chat = [{ mes: 'test message', extra: {} }];
    await processMessage(0);

    // Step 3: Verify correct behavior happened
    expect(window.generateRaw.calls[0].prompt).to.include('option2 behavior');
    expect(window.chat[0].extra.result).to.exist;
  });
});
```

### Pattern 5: Edge Cases

**Tests error handling and edge cases:**

```javascript
describe('Feature Name - Edge Cases', () => {
  it('handles missing setting gracefully', async () => {
    // Don't set the setting
    window.extension_settings.auto_recap.profiles.default = {};

    // Should not crash
    await expect(myFeatureFunction()).to.not.throw;
  });

  it('handles invalid setting value', async () => {
    window.extension_settings.auto_recap.profiles.default.my_setting = 'invalid';

    // Should fall back to default
    await myFeatureFunction();
    expect(window.generateRaw.calls[0].setting).to.equal('default_value');
  });

  it('handles empty chat array', async () => {
    window.chat = [];

    await expect(processAllMessages()).to.not.throw;
  });
});
```

---

## Common Failures & Fixes

### Failure 1: "expected undefined to equal 'value'"

**Symptom:** Setting not updating when UI changes

**Common Causes:**
1. Forgot to add event handler
2. Event handler attached but uses wrong setting path
3. Event handler reads from UI wrong

**Fix:**
```javascript
// WRONG: No handler
$('#my_input').val(settings.foo);

// RIGHT: Handler attached
$('#my_input').val(settings.foo).on('input', function() {
  settings.foo = $(this).val();
});
```

### Failure 2: "expected 'default' to include 'custom'"

**Symptom:** Code not using the setting

**Common Causes:**
1. Code has hardcoded value instead of reading setting
2. Code reads wrong setting path
3. Code reads setting before it's set

**Fix:**
```javascript
// WRONG: Hardcoded
const prompt = 'Recap: ' + message;

// RIGHT: Uses setting
const settings = get_settings();
const prompt = settings.prompt_template + message;
```

### Failure 3: "element not found"

**Symptom:** UI element doesn't exist

**Common Causes:**
1. Forgot to create the element
2. Created in wrong container
3. Created with wrong ID

**Fix:**
```javascript
// WRONG: Forgot to append
const html = '<input id="my_input">';

// RIGHT: Actually append it
const html = '<input id="my_input">';
$('#container').append(html);
```

### Failure 4: "expected spy to be called"

**Symptom:** Function never called

**Common Causes:**
1. Logic bug prevents reaching the call
2. Wrong condition check
3. Early return

**Fix:**
```javascript
// WRONG: Condition prevents call
if (settings.enabled === true) {  // But setting is undefined
  await generateRaw(...);
}

// RIGHT: Handle undefined
if (settings.enabled !== false) {  // True by default
  await generateRaw(...);
}
```

---

## Checklist for Every Feature

**Before considering feature "done", verify:**

### Implementation Checklist:
- [ ] Code written and compiles
- [ ] UI elements created (if applicable)
- [ ] Settings added to default_settings (if new settings)
- [ ] No ESLint errors

### Testing Checklist:
- [ ] Test file created in `tests/tests/`
- [ ] **UI Creation tests** - Elements exist with correct IDs/types
- [ ] **Settings Wiring tests** - UI changes update settings correctly
- [ ] **Setting Usage tests** - Code actually uses the settings
- [ ] **Integration tests** - End-to-end workflow works
- [ ] **Edge case tests** - Handles missing/invalid settings
- [ ] All tests pass (`npm test` shows 0 failures)

### Verification Checklist:
- [ ] Run tests: `npm test`
- [ ] All tests green
- [ ] No console errors in test output
- [ ] Manually verify in browser if UI-heavy (optional)

**If ANY test fails, DO NOT commit. Fix and re-test.**

---

## Development Cycle Recap

```
1. Receive feature request
   ↓
2. Implement feature (code + UI)
   ↓
3. Write tests IMMEDIATELY
   ↓
4. Run: npm test
   ↓
5. Tests fail? → Fix → Go to 4
   ↓
6. Tests pass? → Commit
   ↓
7. Move to next feature
```

**Time per feature:**
- Implementation: 5-10 minutes
- Writing tests: 5-10 minutes
- Fixing failures: 2-5 minutes
- **Total: 15-25 minutes per feature**

**Without tests:**
- Implementation: 5-10 minutes
- Finding wiring bug later: 30-60 minutes
- **Total: 35-70 minutes per feature**

**Tests save time and prevent bugs from reaching users.**

---

## Manual Testing (Optional)

Sometimes you want to see tests run in real browser:

```bash
npm run test:manual
```

Opens browser with test results. Use for debugging test failures.

---

## Recap

**This workflow catches AI's systematic mistakes automatically:**

1. ✅ **Forgot to wire UI** → Test fails: "expected setting to equal X"
2. ✅ **Wired to wrong setting** → Test fails: "expected settingA but got settingB"
3. ✅ **Not using setting** → Test fails: "expected call to include setting value"
4. ✅ **Broke existing feature** → Existing tests fail

**The test suite is AI's safety net. Use it for every feature.**

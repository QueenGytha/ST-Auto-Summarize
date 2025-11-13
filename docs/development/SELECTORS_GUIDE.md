# Selector Strategy Guide

**Date:** 2025-01-06
**Status:** Production - Active Strategy
**Context:** AI-developed project requiring precise, non-ambiguous selectors

---

## Table of Contents

1. [Overview](#overview)
2. [Why This Strategy](#why-this-strategy)
3. [Two-File Approach](#two-file-approach)
4. [File Structure](#file-structure)
5. [Adding data-testid Attributes](#adding-data-testid-attributes)
6. [Barrel Export Pattern](#barrel-export-pattern)
7. [Usage Patterns](#usage-patterns)
8. [Enforcement Mechanisms](#enforcement-mechanisms)
9. [AI Workflows](#ai-workflows)
10. [Complete Examples](#complete-examples)
11. [Migration Guide](#migration-guide)

---

## Overview

This project uses a **split-file, centralized selector strategy** with **strict enforcement** to prevent hardcoded selectors in both extension code and tests.

**Core Principles:**
1. **Two selector files**: Extension vs SillyTavern selectors
2. **NO fallback chains**: Precision required for AI
3. **data-testid mandatory**: All extension HTML must have it
4. **Barrel exports**: Single import point for all code
5. **Strict enforcement**: Validation blocks hardcoded selectors

---

## Why This Strategy

### Problem: AI + Hardcoded Selectors = Disaster

In AI-developed projects:
- ❌ **AI fabricates selectors** when uncertain
- ❌ **Fallback chains hide problems** (selector matches wrong element)
- ❌ **Duplicate selectors drift** (extension uses `#old_id`, tests use `#new_id`)
- ❌ **No single source of truth** (change HTML, tests break silently)
- ❌ **AI iterates forever** on phantom problems from wrong selectors

### Solution: Single Source of Truth with Enforcement

- ✅ **One selector definition per element** (no ambiguity)
- ✅ **Precise selectors only** (no fallbacks to mask issues)
- ✅ **Shared by extension and tests** (no drift)
- ✅ **Enforced by validation** (AI can't cheat)
- ✅ **Clear naming** (AI knows which file to check)

---

## Two-File Approach

### selectorsExtension.js
**Our HTML elements (stable, we control)**

- Contains selectors for extension's own UI
- Uses `data-testid` attributes (required)
- Changes only when we refactor HTML
- Very stable (data-testid rarely changes)

### selectorsSillyTavern.js
**SillyTavern's HTML elements (may break on ST updates)**

- Contains selectors for ST's UI we interact with
- Uses ST's existing IDs/classes
- Changes when ST updates their HTML
- Includes ST version tracking in comments
- Updated via Playwright Inspector when breaks

### Why Split?

**Different Lifecycles:**
```
Extension HTML Change:
1. Refactor extension HTML
2. Update data-testid if needed
3. Update selectorsExtension.js
4. Done

SillyTavern Update:
1. ST releases new version
2. Tests fail with selector errors
3. Use Playwright Inspector to find new selectors
4. Update selectorsSillyTavern.js
5. Update version comment
```

**Clear Scope:**
- AI knows: "Extension selector → selectorsExtension.js"
- AI knows: "ST selector → selectorsSillyTavern.js"
- No confusion about which file to check/update

---

## File Structure

```
ST-Auto-Recap/
├── index.js                      # Barrel: exports both selector files
├── selectorsExtension.js         # Our HTML (data-testid based)
├── selectorsSillyTavern.js       # ST's HTML (ID/class based)
├── settingsManager.js            # Imports from './index.js'
├── eventHandlers.js              # Imports from './index.js'
├── tests/
│   ├── features/
│   │   └── memory.spec.js        # Imports from '../../index.js'
│   └── suite/
│       └── workflow.spec.js      # Imports from '../../index.js'
└── scripts/
    └── validate-selectors.js     # Enforcement script
```

---

## Adding data-testid Attributes

### Required for All Extension HTML

**RULE:** Every interactive element in `settings.html` MUST have `data-testid`.

**Pattern:**
```html
<!-- Button -->
<button id="toggle_chat_memory" data-testid="memory-toggle">
  Toggle Memory
</button>

<!-- Input -->
<input type="checkbox" id="notify_on_profile_switch" data-testid="setting-notify-switch" />

<!-- Select -->
<select id="profile" data-testid="profile-select">
  <option>default</option>
</select>

<!-- Div with interaction -->
<div id="operation_queue" data-testid="operation-queue">
  <!-- queue contents -->
</div>
```

### Naming Convention

**Pattern:** `[feature]-[element]` or `[feature]-[action]`

**Examples:**
- `data-testid="memory-toggle"` → memory feature, toggle button
- `data-testid="profile-select"` → profile feature, select dropdown
- `data-testid="profile-new"` → profile feature, new button
- `data-testid="setting-notify-switch"` → setting category, notify checkbox
- `data-testid="queue-pause"` → queue feature, pause button

**Guidelines:**
- Lowercase, kebab-case
- Feature-first, element-second
- Descriptive but concise
- Unique across entire extension

### Why data-testid?

**Stability:**
- ✅ **Never changes** unless intentionally refactored
- ✅ **Not affected by CSS changes** (classes can change freely)
- ✅ **Not affected by ID changes** (IDs can change freely)
- ✅ **Clear testing intent** (everyone knows it's for tests)

**AI-Friendly:**
- ✅ **Precise** (no ambiguity about which element)
- ✅ **Discoverable** (Playwright Inspector shows data-testid)
- ✅ **Standard practice** (AI trained on this pattern)

---

## Barrel Export Pattern

### index.js (Barrel)

```javascript
// index.js - Barrel export file
import { getContext, extension_settings, saveSettingsDebounced } from '../../../script.js';
// ... other ST imports

// Import selector files
import { selectorsExtension } from './selectorsExtension.js';
import { selectorsSillyTavern } from './selectorsSillyTavern.js';

// Import local modules
import { settingsManager } from './settingsManager.js';
import { profileManager } from './profileManager.js';
// ... other local imports

// Re-export everything
export {
  // SillyTavern APIs
  getContext,
  extension_settings,
  saveSettingsDebounced,
  // ... other ST exports

  // Selectors (shared by extension and tests)
  selectorsExtension,
  selectorsSillyTavern,

  // Extension modules
  settingsManager,
  profileManager,
  // ... other module exports
};
```

**Why barrel export selectors?**
- ✅ Single import point for all code
- ✅ Consistent with existing architecture
- ✅ Extension code and tests use same import pattern
- ✅ Easier to refactor (change export, not all imports)

---

## Usage Patterns

### Extension Code

```javascript
// settingsManager.js
import {
  getContext,
  extension_settings,
  selectorsExtension,      // Our selectors
  selectorsSillyTavern     // ST selectors
} from './index.js';

// Use extension selectors
export function initSettings() {
  $(selectorsExtension.settings.notifyCheckbox).on('change', (e) => {
    // handle notify checkbox change
  });

  $(selectorsExtension.profiles.dropdown).on('change', (e) => {
    // handle profile change
  });
}

// Use ST selectors
export function showToast(message) {
  $(selectorsSillyTavern.ui.toast)
    .text(message)
    .fadeIn();
}
```

### Test Code

```javascript
// tests/features/memory.spec.js
import { test, expect } from '@playwright/test';
import { selectorsExtension, selectorsSillyTavern } from '../../index.js';
import { ExtensionHelper } from '../helpers/ExtensionHelper.js';

test.describe('Memory Feature', () => {
  let page;
  let ext;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    ext = new ExtensionHelper(page);
    await page.goto('/');
  });

  test('can toggle memory', async () => {
    // Click our button
    await page.click(selectorsExtension.memory.toggleButton);

    // Verify toast appears (ST element)
    await page.waitForSelector(selectorsSillyTavern.ui.toast);

    const toastText = await page.locator(selectorsSillyTavern.ui.toast).textContent();
    expect(toastText).toContain('Memory');
  });

  test('can send message', async () => {
    // Use ST's chat elements
    await page.fill(selectorsSillyTavern.chat.input, 'Test message');
    await page.click(selectorsSillyTavern.chat.sendButton);

    // Verify message appears
    await page.waitForSelector(selectorsSillyTavern.chat.messageBlock);
  });
});
```

### Helper Classes

```javascript
// tests/helpers/ExtensionHelper.js
import { selectorsExtension, selectorsSillyTavern } from '../../index.js';

export class ExtensionHelper {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForSelector(selectorsSillyTavern.chat.input);
  }

  async openExtensionPanel() {
    await this.page.click(selectorsSillyTavern.extensions.menu);
    await this.page.click(selectorsExtension.panel);
  }

  async clickMemoryToggle() {
    await this.page.click(selectorsExtension.memory.toggleButton);
  }

  async clickRecap() {
    await this.page.click(selectorsExtension.recap generation.recapButton);
  }
}
```

---

## Enforcement Mechanisms

### 1. Validation Script (Primary Enforcement)

**File:** `scripts/validate-selectors.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// Forbidden patterns (hardcoded selectors)
const FORBIDDEN_PATTERNS = [
  { pattern: /\$\s*\(\s*['"`][#.[[]/, name: '$("selector")', type: 'jQuery' },
  { pattern: /document\.querySelector\s*\(\s*['"`][#.[[]/, name: 'querySelector("selector")', type: 'DOM' },
  { pattern: /document\.querySelectorAll\s*\(\s*['"`][#.[[]/, name: 'querySelectorAll("selector")', type: 'DOM' },
  { pattern: /document\.getElementById\s*\(\s*['"`]/, name: 'getElementById("id")', type: 'DOM' },
  { pattern: /page\.click\s*\(\s*['"`][#.[[]/, name: 'page.click("selector")', type: 'Playwright' },
  { pattern: /page\.locator\s*\(\s*['"`][#.[[]/, name: 'page.locator("selector")', type: 'Playwright' },
  { pattern: /page\.waitForSelector\s*\(\s*['"`][#.[[]/, name: 'page.waitForSelector("selector")', type: 'Playwright' },
  { pattern: /page\.fill\s*\(\s*['"`][#.[[]/, name: 'page.fill("selector")', type: 'Playwright' },
];

// Get all .js files (extension root + tests, exclude node_modules)
const getFiles = () => {
  try {
    const rootFiles = execSync(`find ${ROOT} -maxdepth 1 -name "*.js"`, { encoding: 'utf8' })
      .split('\n').filter(f => f);

    const testFiles = execSync(`find ${ROOT}/tests -name "*.js" 2>/dev/null || true`, { encoding: 'utf8' })
      .split('\n').filter(f => f);

    return [...rootFiles, ...testFiles];
  } catch (e) {
    console.error('Error finding files:', e.message);
    return [];
  }
};

// Files to check (exclude selector files and this script)
const files = getFiles()
  .filter(f => !f.endsWith('selectorsExtension.js'))
  .filter(f => !f.endsWith('selectorsSillyTavern.js'))
  .filter(f => !f.includes('node_modules'))
  .filter(f => !f.includes('validate-selectors.js'));

let violations = [];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip import statements
    if (line.match(/import.*selectors/)) continue;
    if (line.match(/from ['"]\.\/index\.js['"]/)) continue;

    // Check for forbidden patterns
    for (const { pattern, name, type } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          content: line.trim(),
          method: name,
          type
        });
      }
    }
  }
}

// Report violations
if (violations.length > 0) {
  console.error('\n❌ SELECTOR VALIDATION FAILED\n');
  console.error('Hardcoded selectors found:\n');

  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.content}`);
    console.error(`    ^^^ ${v.method} uses hardcoded selector (${v.type})\n`);
  }

  console.error('RULE: All selectors must be in selectorsExtension.js or selectorsSillyTavern.js');
  console.error('\nFIX:\n');
  console.error('  Extension code:');
  console.error('    import { selectorsExtension, selectorsSillyTavern } from "./index.js";');
  console.error('    $(selectorsExtension.memory.toggleButton).on("click", handler);\n');
  console.error('  Test code:');
  console.error('    import { selectorsExtension, selectorsSillyTavern } from "../../index.js";');
  console.error('    await page.click(selectorsExtension.memory.toggleButton);\n');

  process.exit(1);
}

console.log('✅ Selector validation passed - all code uses selector files\n');
process.exit(0);
```

### 2. NPM Scripts Integration

**package.json:**
```json
{
  "scripts": {
    "validate:selectors": "node scripts/validate-selectors.js",
    "pretest": "npm run validate:selectors",
    "lint": "eslint . && npm run validate:selectors",
    "test:feature": "npm run validate:selectors && playwright test --project=features",
    "test:suite": "npm run validate:selectors && playwright test --project=suite"
  }
}
```

**Enforcement points:**
- ✅ Before every test run
- ✅ During linting
- ✅ In CI/CD pipeline
- ✅ Pre-commit hook (optional)

### 3. Git Pre-commit Hook (Optional)

**`.git/hooks/pre-commit`:**
```bash
#!/bin/bash

echo "Running selector validation..."
npm run validate:selectors

if [ $? -ne 0 ]; then
  echo "❌ Commit blocked: Hardcoded selectors found"
  echo "   Fix violations and try again"
  exit 1
fi

echo "✅ Selector validation passed"
```

---

## AI Workflows

### CRITICAL: Always Check Selector Files First

**BEFORE using Playwright MCP or any discovery tool, AI MUST:**

1. ✅ **Check `selectorsExtension.js`** - Does selector already exist?
2. ✅ **Check `selectorsSillyTavern.js`** - Does selector already exist?
3. ✅ **Search codebase** - Is selector used elsewhere?

**WHY:** AI often gets lazy and duplicates existing functionality without checking first. This wastes tokens and creates duplicate selectors.

**When to use Playwright MCP:**
- ✅ Selector exists in file but is BROKEN (test fails, selector not found)
- ✅ Adding NEW selector that doesn't exist yet
- ❌ **NEVER** use MCP without checking files first

### Workflow 1: Extension Selector Breaks

**Scenario:** Refactored HTML, changed data-testid

```
1. AI refactors HTML:
   <button data-testid="memory-toggle" → data-testid="toggle-memory">

2. Tests fail:
   Error: selector '[data-testid="memory-toggle"]' not found

3. AI FIRST checks selectorsExtension.js:
   ✅ Selector exists: memory.toggleButton = '[data-testid="memory-toggle"]'
   ✅ Knows: Just need to update the data-testid value

4. AI updates selectorsExtension.js:
   memory: {
     toggleButton: '[data-testid="toggle-memory"]'  // Updated
   }

5. Tests pass ✅

Token cost: ~2k tokens (simple update)

NO MCP NEEDED - file already had the selector defined
```

### Workflow 2: SillyTavern Selector Breaks

**Scenario:** ST updated, changed their HTML

```
1. ST updates to new version

2. Tests fail:
   Error: selector '#send_but' not found

3. AI FIRST checks selectorsSillyTavern.js:
   ✅ Selector exists: chat.sendButton = '#send_but'
   ✅ Knows: Selector is defined, but value is wrong (ST changed HTML)
   ✅ Decides: NOW is appropriate time to use MCP to discover new value

4. AI runs Playwright Inspector:
   npx playwright codegen http://localhost:8000

5. AI uses MCP browser to:
   - Navigate to chat
   - Hover over send button
   - Inspector shows: #send_button (new ID)

6. AI updates selectorsSillyTavern.js:
   /**
    * SillyTavern Core UI Selectors
    * Version: SillyTavern 1.13.x  ← Updated version
    * Last Updated: 2025-01-15     ← Updated date
    */
   export const selectorsSillyTavern = {
     chat: {
       sendButton: '#send_button',  // ← Updated selector
       ...
     }
   };

7. Tests pass ✅

Token cost: ~10-20k tokens (MCP + update)

MCP APPROPRIATE - selector existed but needed new value
```

### Workflow 3: Adding New Selector

**Scenario:** Adding new feature, need new selector

```
1. AI FIRST checks selectorsExtension.js:
   ❌ Selector doesn't exist for this feature
   ✅ Decides: This is a NEW selector, okay to add

2. AI adds new HTML:
   <button id="new_feature_btn" data-testid="feature-action">

3. AI adds to selectorsExtension.js:
   export const selectorsExtension = {
     // ... existing selectors

     feature: {
       actionButton: '[data-testid="feature-action"]'
     }
   };

4. AI uses in extension code:
   import { selectorsExtension } from './index.js';
   $(selectorsExtension.feature.actionButton).on('click', ...);

5. AI uses in tests:
   import { selectorsExtension } from '../../index.js';
   await page.click(selectorsExtension.feature.actionButton);

6. Validation passes ✅
   Tests pass ✅

Token cost: ~5k tokens (add selector + usage)

NO MCP NEEDED - AI created the HTML, knows the data-testid
```

### Workflow 4: AI Gets Lazy (ANTI-PATTERN)

**Scenario:** AI doesn't check files first (WRONG)

```
❌ BAD WORKFLOW:

1. AI needs to click memory toggle

2. AI thinks: "I'll use MCP to find the selector"
   (Skips checking selectorsExtension.js)

3. AI runs Playwright Inspector: 10k tokens
   AI uses MCP to find element: 10k tokens
   AI discovers: '[data-testid="memory-toggle"]'

4. AI uses directly in code:
   await page.click('[data-testid="memory-toggle"]')

5. Validation FAILS: Hardcoded selector detected

6. AI realizes: Should have checked selectorsExtension.js first
   AI checks: memory.toggleButton = '[data-testid="memory-toggle"]'
   AI sees: Selector already existed!

7. AI fixes code:
   await page.click(selectorsExtension.memory.toggleButton)

8. Validation passes ✅

Token cost: ~25k tokens WASTED
- Could have been 2k if checked file first
- MCP was completely unnecessary
```

**CORRECT WORKFLOW:**

```
✅ GOOD WORKFLOW:

1. AI needs to click memory toggle

2. AI checks selectorsExtension.js FIRST:
   ✅ Found: memory.toggleButton = '[data-testid="memory-toggle"]'

3. AI uses in code:
   await page.click(selectorsExtension.memory.toggleButton)

4. Validation passes ✅

Token cost: ~2k tokens (checked file, used selector)
- NO MCP needed
- NO wasted tokens
- NO duplication
```

### Recap: Check Files First

**ALWAYS:**
1. Check `selectorsExtension.js` or `selectorsSillyTavern.js`
2. Search codebase for existing usage
3. Only use MCP if:
   - Selector exists but is BROKEN
   - Adding genuinely NEW selector
   - ST changed HTML, need new value

**NEVER:**
- Use MCP without checking files first
- Assume selector doesn't exist
- Hardcode selectors (validation blocks this)
- Duplicate selectors (waste of tokens)

---

## Complete Examples

### Example 1: selectorsExtension.js (Complete)

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
  // Panel
  panel: '[data-testid="extension-panel"]',

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
    importFile: '[data-testid="profile-import-file"]',
    characterButton: '[data-testid="profile-character"]',
    chatButton: '[data-testid="profile-chat"]'
  },

  // Settings
  settings: {
    notifyCheckbox: '[data-testid="setting-notify-switch"]',
    proxyCheckbox: '[data-testid="setting-proxy-details"]',
    wrapCheckbox: '[data-testid="setting-wrap-lorebook"]',
    includeUserCheckbox: '[data-testid="setting-include-user"]',
    includeSystemCheckbox: '[data-testid="setting-include-system"]',
    includenarratorCheckbox: '[data-testid="setting-include-narrator"]',
    messageLengthInput: '[data-testid="setting-message-length"]',
    defaultEnabledCheckbox: '[data-testid="setting-default-enabled"]',
    globalToggleCheckbox: '[data-testid="setting-global-toggle"]'
  },

  // Recap Generation
  recap generation: {
    recapButton: '[data-testid="recap-btn"]',
    validateButton: '[data-testid="validate-btn"]',
    progressBar: '[data-testid="recap-progress"]'
  },

  // Scene management
  scene: {
    editPromptButton: '[data-testid="scene-edit-prompt"]',
    viewRunningButton: '[data-testid="scene-view-running"]',
    navigatorWidth: '[data-testid="scene-nav-width"]',
    navigatorFontSize: '[data-testid="scene-nav-font"]',
    autoNameCheckbox: '[data-testid="scene-auto-name"]',
    defaultCollapsedCheckbox: '[data-testid="scene-default-collapsed"]'
  },

  // Operation queue
  queue: {
    list: '[data-testid="operation-queue"]',
    pauseButton: '[data-testid="queue-pause"]',
    clearButton: '[data-testid="queue-clear"]',
    statusComplete: '[data-testid="queue-complete"]'
  },

  // Auto-Lorebooks
  lorebooks: {
    deleteCheckbox: '[data-testid="lorebook-delete-on-chat"]',
    reorderCheckbox: '[data-testid="lorebook-reorder-alpha"]',
    nameTemplate: '[data-testid="lorebook-name-template"]',
    entityTypesList: '[data-testid="lorebook-entity-types"]',
    addEntityButton: '[data-testid="lorebook-add-entity"]',
    restoreEntityButton: '[data-testid="lorebook-restore-entity"]'
  },

  // Misc
  misc: {
    revertButton: '[data-testid="revert-settings"]',
    popoutButton: '[data-testid="popout-button"]'
  }
};
```

### Example 2: selectorsSillyTavern.js (Complete)

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
    messageSwipe: '.mes_swipe',
    messageEdit: '.mes_edit',
    messageDelete: '.mes_delete'
  },

  // Extensions menu
  extensions: {
    menu: '#extensions_menu',
    settingsButton: '#extensions_settings',
    panel: '.extensions_block'
  },

  // Character management
  character: {
    contextMenu: '#character_context_menu',
    favoriteButton: '#character_context_menu_favorite',
    duplicateButton: '#character_context_menu_duplicate',
    deleteButton: '#character_context_menu_delete'
  },

  // UI elements
  ui: {
    toast: '.toast-container .toast',
    modal: '.modal-content',
    modalClose: '.modal-close',
    topBar: '#top-bar',
    loadingSpinner: '.loading-spinner'
  },

  // World Info / Lorebook
  worldInfo: {
    button: '#world_button',
    panel: '#world_popup',
    entryList: '.world_entry',
    addButton: '#world_popup_new',
    deleteButton: '.world_entry_delete'
  }
};
```

---

## Migration Guide

### Step 1: Create Selector Files

```bash
# Create files
touch selectorsExtension.js
touch selectorsSillyTavern.js
```

### Step 2: Extract Existing Selectors

**Find all selectors in extension code:**
```bash
# Find jQuery selectors
grep -r "\$('#" *.js | grep -v node_modules

# Find querySelector calls
grep -r "querySelector('#" *.js | grep -v node_modules

# Find IDs in HTML
grep -o 'id="[^"]*"' settings.html
```

### Step 3: Populate selectorsExtension.js

```javascript
// Group by feature area
export const selectorsExtension = {
  memory: {
    toggleButton: '[data-testid="memory-toggle"]'  // Add data-testid first!
  },
  // ... etc
};
```

### Step 4: Add data-testid to HTML

```html
<!-- Update settings.html -->
<button id="toggle_chat_memory" data-testid="memory-toggle">
```

### Step 5: Populate selectorsSillyTavern.js

```javascript
// Only ST elements we interact with
export const selectorsSillyTavern = {
  chat: {
    sendButton: '#send_but',  // From ST's HTML
    input: '#send_textarea'
  }
};
```

### Step 6: Update Barrel Export

```javascript
// index.js
import { selectorsExtension } from './selectorsExtension.js';
import { selectorsSillyTavern } from './selectorsSillyTavern.js';

export {
  // ... existing exports
  selectorsExtension,
  selectorsSillyTavern
};
```

### Step 7: Update Extension Code

```javascript
// Before:
$('#toggle_chat_memory').on('click', handler);

// After:
import { selectorsExtension } from './index.js';
$(selectorsExtension.memory.toggleButton).on('click', handler);
```

### Step 8: Update Tests

```javascript
// Before:
await page.click('#toggle_chat_memory');

// After:
import { selectorsExtension } from '../../index.js';
await page.click(selectorsExtension.memory.toggleButton);
```

### Step 9: Set Up Validation

```bash
# Create validation script
touch scripts/validate-selectors.js
# (Copy content from Enforcement Mechanisms section)

# Add to package.json
npm pkg set scripts.validate:selectors="node scripts/validate-selectors.js"
npm pkg set scripts.pretest="npm run validate:selectors"
```

### Step 10: Run Validation

```bash
npm run validate:selectors
```

Fix any violations found, then run tests to ensure everything works.

---

## Recap

**This strategy ensures:**
- ✅ Single source of truth for all selectors
- ✅ No hardcoded selectors in extension or tests
- ✅ Clear separation between our HTML and ST's HTML
- ✅ Precise selectors (no ambiguity for AI)
- ✅ Enforced by validation (AI can't bypass)
- ✅ Discoverable when broken (Playwright Inspector)
- ✅ Version tracked (ST updates documented)

**AI workflow is simple:**
1. Need selector → Check selector file
2. Selector breaks → Use Playwright Inspector
3. Update selector file → All code automatically fixed
4. Try to hardcode → Validation blocks it

**This is the ONLY way to maintain selector sanity in an AI-developed project.**

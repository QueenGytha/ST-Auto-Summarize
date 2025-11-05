# Testing Architecture for ST-Auto-Summarize

## Table of Contents
1. [Problem Statement](#problem-statement)
2. [Requirements](#requirements)
3. [Approaches Considered](#approaches-considered)
4. [Chosen Solution](#chosen-solution)
5. [Implementation Guide](#implementation-guide)
6. [Test Patterns](#test-patterns)
7. [Troubleshooting](#troubleshooting)

---

## Problem Statement

### The Challenge

ST-Auto-Summarize is developed **entirely by AI**, including all functionality, UI, and tests. This creates unique testing challenges:

#### AI's Systematic Mistakes

1. **Forgets UI Elements**
   - Creates setting in code but no input element
   - Creates button handler but no button
   - Missing elements in settings page

2. **Forgets Wiring**
   - UI element exists but no event handler attached
   - Setting input exists but doesn't update `extension_settings`
   - Button exists but click does nothing

3. **Misunderstands SillyTavern APIs**
   - Invents functions that don't exist (`getSetting()` instead of `extension_settings`)
   - Uses wrong parameters (`generateRaw(prompt)` instead of `generateRaw({prompt})`)
   - Expects wrong return types (assumes synchronous when async)
   - Creates impossible functionality based on hallucinated APIs

4. **Silent Breakage**
   - Changes `operationQueue.js` → breaks `lorebookManager.js`
   - Refactors settings structure → breaks memory injection
   - Renames function → orphans all callers

### Why Traditional Testing Fails

#### Manual Mocks Don't Work
```javascript
// ❌ AI writes fantasy contract that doesn't match reality
export function generateRaw(prompt) {  // Wrong signature!
  return "mock response";  // Wrong return type!
}

// AI code then uses fantasy API
const result = generateRaw("Summarize this");  // Works in tests, fails in production
```

**Problem**: AI develops against fantasy version of SillyTavern, tests pass, production fails.

#### Pure Business Logic Tests Miss Critical Issues
```javascript
// ✅ Tests that business logic works
test('extracts entities from summary', () => {
  const entities = extractEntities({ lorebooks: [...] });
  expect(entities).toHaveLength(2);
});

// ❌ Doesn't catch:
// - UI button doesn't exist
// - Button not wired to function
// - Function uses wrong ST API
// - Real integration with ST fails
```

#### Playwright Too Complex for AI
- AI struggles with async waiting strategies
- Token-heavy when using MCP tools
- Tests become more complex than code
- AI writes brittle selectors
- Feedback loop too slow (tests take minutes)

### Test Requirements

1. **Catches all four mistake types** (UI, wiring, API misuse, breakage)
2. **AI can write tests** (simple patterns, clear errors)
3. **Fast feedback loop** (<10 seconds for full suite)
4. **Tests real integration** (not fantasy mocks)
5. **Runs after every change** (tight feedback loop)

---

## Approaches Considered

### Approach 1: Playwright with Real Browser ❌

#### Description
Run full SillyTavern instance in browser, test with Playwright.

```javascript
// playwright.config.js
export default {
  webServer: {
    command: 'cd ../../../../ && node server.js',
    port: 8000
  }
};

// Test
test('can generate summary', async ({ page }) => {
  await page.goto('http://127.0.0.1:8000');
  await page.click('#auto_summarize_button');
  await page.waitForSelector('.summary-result');
  // ...
});
```

#### Pros
✅ Tests real integration completely
✅ Catches everything including visual issues
✅ Tests actual user workflows

#### Cons
❌ **AI struggles with Playwright** - Complex async patterns, brittle selectors
❌ **Token-heavy with MCP** - Playwright MCP tool consumes massive tokens
❌ **Slow** - Browser startup, page loads, animations (minutes per test)
❌ **Complex setup** - Requires ST server running, state management
❌ **Flaky** - Timing issues, race conditions

#### Why Rejected
**AI cannot write good Playwright tests.** Tests become more complex than the code being tested. Token usage makes it impractical for frequent use.

---

### Approach 2: Pure Business Logic Tests (Node.js only) ❌

#### Description
Test only pure JavaScript functions without any DOM or SillyTavern dependencies.

```javascript
// No DOM, no ST, just pure functions
test('combines summaries correctly', () => {
  const summaries = ['Summary 1', 'Summary 2'];
  const result = combineSummaries(summaries);
  expect(result).toContain('Summary 1');
});

test('calculates tokens correctly', () => {
  const tokens = countTokens('Hello world');
  expect(tokens).toBe(2);
});
```

#### Pros
✅ **Very fast** - Milliseconds per test
✅ **Simple** - AI can write these easily
✅ **Reliable** - No flakiness

#### Cons
❌ **Misses UI completely** - Doesn't test element creation or wiring
❌ **Misses ST integration** - Can't catch API misuse
❌ **Misses breakage** - Module integration not tested
❌ **Low coverage** - Only ~30% of actual functionality

#### Why Rejected
**Doesn't catch AI's most common mistakes.** Tests pass while UI is broken, settings aren't wired, and ST APIs are used incorrectly.

---

### Approach 3: Manual Mocks ❌

#### Description
Write mock implementations of SillyTavern APIs manually.

```javascript
// tests/mocks/script.js
export const chat = [];
export const chat_metadata = {};

export function generateRaw(options) {
  // Hand-written mock behavior
  return Promise.resolve({ content: "Mock summary" });
}

export function saveMetadata() {
  // Mock implementation
}
```

#### Pros
✅ Can test against "SillyTavern" in Node.js
✅ Fast
✅ AI can write tests against mocks

#### Cons
❌ **Mocks are fantasy** - Don't match real ST behavior
❌ **AI writes wrong mocks** - AI doesn't know real ST API either
❌ **Drift** - Real ST changes, mocks don't, tests pass but production fails
❌ **False confidence** - Tests pass but code doesn't work

#### Example Failure
```javascript
// AI writes mock based on hallucination
export function generateRaw(prompt) {  // Wrong signature
  return "response";  // Wrong return type
}

// AI writes code against wrong mock
const summary = generateRaw("Summarize");  // ✅ Test passes

// Real ST:
const summary = await generateRaw({ prompt: "Summarize" });  // ❌ Production fails
```

#### Why Rejected
**Tests become validation of fantasy, not reality.** AI develops against imagined SillyTavern APIs. This is worse than no tests because it creates false confidence.

---

### Approach 4: Vitest Auto-Mocks ❌

#### Description
Use Vitest's `vi.mock()` to automatically generate mocks.

```javascript
vi.mock('../../../script.js', () => ({
  chat: [],
  generateRaw: vi.fn(),
  saveMetadata: vi.fn()
}));
```

#### Pros
✅ No manual mock writing
✅ Built into Vitest

#### Cons
❌ **Mocks are empty stubs** - `vi.fn()` returns undefined, has no behavior
❌ **Still need to define behavior** - Back to manual mocking
❌ **No type checking** - Can call with wrong params, returns wrong types
❌ **Same fantasy problem** - AI defines behavior based on hallucination

#### Why Rejected
**Auto-mocks are just scaffolding.** Still requires manual definition of behavior, which leads to fantasy APIs.

---

### Approach 5: Contract-Based Testing with Manual Contracts ❌

#### Description
Write "contract validators" that enforce API usage rules.

```javascript
// tests/contracts/st-contracts.js
export function generateRaw(options) {
  // Validate contract
  if (!options.prompt) {
    throw new Error('generateRaw requires options.prompt');
  }

  // Make real call to proxy
  return fetch('http://localhost:8080/api/generate', {
    method: 'POST',
    body: JSON.stringify(options)
  });
}
```

#### Pros
✅ Enforces correct API usage
✅ Makes real LLM calls (via proxy)
✅ Clear error messages when contract violated

#### Cons
❌ **Contracts are manually written** - Who writes them? AI? (fantasy again)
❌ **Contracts can be wrong** - Based on documentation/assumption, not reality
❌ **Maintenance burden** - Update contracts when ST changes

#### Why Rejected
**Same fundamental problem as manual mocks.** Someone has to write accurate contracts, and if AI does it, they'll be based on hallucinations.

---

### Approach 6: Extract Contracts from Running ST ⚠️

#### Description
Run real SillyTavern, extract API signatures programmatically, generate test contracts.

```javascript
// tools/extract-st-api.js
const page = await browser.goto('http://127.0.0.1:8000');

const api = await page.evaluate(() => ({
  generateRaw: {
    signature: window.generateRaw.toString(),
    testCall: window.generateRaw({ prompt: 'test' })
  }
}));

fs.writeFileSync('tests/fixtures/st-api.json', JSON.stringify(api));
```

#### Pros
✅ Contracts based on real ST
✅ Automatically extracted
✅ Can be refreshed when ST updates

#### Cons
⚠️ **Complex tooling** - Requires browser automation to extract
⚠️ **Partial capture** - Can't capture everything about API
⚠️ **Still need behavior** - Contracts enforce shape, not behavior
⚠️ **Maintenance** - Need to re-extract on ST updates

#### Why Rejected (Partial)
**Better than manual contracts but unnecessarily complex.** If we're running real ST to extract APIs, why not just import real ST code directly?

---

## Chosen Solution

### Approach: Import Real SillyTavern Code with Polyfills ✅

#### Core Concept

**Import the actual SillyTavern source code into the Node.js test environment.**

Instead of mocking SillyTavern, make the real code work in Node.js by providing necessary polyfills.

```
┌─────────────────────────────────────────────────┐
│  Node.js + Vitest Test Environment             │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │  jsdom (Browser Polyfills)             │    │
│  │  - window, document, Element           │    │
│  │  - jQuery, localStorage                │    │
│  └────────────────────────────────────────┘    │
│                    ▲                             │
│                    │                             │
│  ┌────────────────┴───────────────────────┐    │
│  │  REAL SillyTavern Code                 │    │
│  │  import * from '../../../script.js'    │    │
│  │  (actual ST source, unmodified)        │    │
│  └────────────────┬───────────────────────┘    │
│                    ▲                             │
│                    │                             │
│  ┌────────────────┴───────────────────────┐    │
│  │  Extension Code (being tested)         │    │
│  │  import { generateRaw } from 'ST'      │    │
│  └────────────────────────────────────────┘    │
│                    │                             │
│                    │ HTTP (only backend calls)   │
│                    ▼                             │
│  ┌────────────────────────────────────────┐    │
│  │  MSW (Mock Service Worker)             │    │
│  │  Intercepts fetch() calls              │    │
│  │  Redirects to proxy or returns mocks   │    │
│  └────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
                    │
                    │ HTTP
                    ▼
         ┌──────────────────────┐
         │  First-Hop Proxy     │
         │  Returns canned LLM  │
         │  responses           │
         └──────────────────────┘
```

#### Why This Works

1. **Real API, Not Fantasy**
   - Tests run against actual SillyTavern code
   - If AI uses wrong API → real ST code throws error
   - No drift: ST changes → tests immediately reflect changes

2. **Catches All Four Mistake Types**
   - **Forgets UI**: jsdom + real imports allow testing DOM structure
   - **Forgets wiring**: Can verify event handlers actually attached
   - **Wrong API**: Real ST code throws when used incorrectly
   - **Silent breakage**: Integration tests catch cross-module failures

3. **AI-Friendly**
   - Simple Vitest syntax
   - Clear error messages from real ST code
   - Fast enough for tight feedback loop

4. **Fast Feedback**
   - No browser startup
   - No network delays (proxy returns immediately)
   - Tests run in seconds

#### Key Innovation: Polyfill, Don't Mock

Instead of mocking SillyTavern APIs, **make them work** by providing what they need:

- ST needs DOM → Provide jsdom
- ST needs jQuery → Load jQuery on jsdom
- ST needs localStorage → Use jsdom's localStorage
- ST needs HTTP backend → Intercept with MSW, redirect to proxy

**Mock at the boundary (HTTP), not at the API layer.**

---

## Implementation Guide

### Phase 1: Setup Test Infrastructure

#### 1.1 Install Dependencies

```bash
npm install -D vitest jsdom @vitest/ui happy-dom
npm install -D msw  # Mock Service Worker for HTTP interception
npm install -D jquery  # If not already in dependencies
```

#### 1.2 Create Vitest Configuration

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use jsdom environment for browser APIs
    environment: 'jsdom',

    // Setup files run before each test file
    setupFiles: [
      './tests/setup/polyfills.js',
      './tests/setup/sillytavern-loader.js'
    ],

    // Global test helpers (no need to import describe, it, expect)
    globals: true,

    // Test file patterns
    include: ['tests/**/*.test.js'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['*.js', '!index.js', '!tests.js'],
      exclude: [
        'tests/**',
        'node_modules/**',
        'first-hop-proxy/**'
      ]
    },

    // Timeout for tests (LLM calls may take a few seconds)
    testTimeout: 10000,

    // Avoid port conflicts
    server: {
      port: 5174
    }
  },

  resolve: {
    alias: {
      // Make SillyTavern imports work from extension directory
      '@st': path.resolve(__dirname, '../../../')
    }
  }
});
```

#### 1.3 Create Browser Polyfills

```javascript
// tests/setup/polyfills.js
/**
 * Provides browser APIs that SillyTavern expects
 */

import { JSDOM } from 'jsdom';
import jQuery from 'jquery';

// Create jsdom instance with realistic browser environment
const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost:8000',  // SillyTavern's typical URL
  pretendToBeVisual: true,       // Enable requestAnimationFrame, etc.
  resources: 'usable'            // Allow loading external resources if needed
});

// Expose browser globals
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;

// localStorage
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;

// jQuery
global.$ = jQuery(dom.window);
global.jQuery = global.$;

// Console APIs (jsdom has these, but ensure they're available)
global.console = dom.window.console;

// Timing functions
global.setTimeout = dom.window.setTimeout;
global.setInterval = dom.window.setInterval;
global.clearTimeout = dom.window.clearTimeout;
global.clearInterval = dom.window.clearInterval;
global.requestAnimationFrame = dom.window.requestAnimationFrame;

// Fetch (use Node's fetch if available, or polyfill)
if (!global.fetch) {
  global.fetch = dom.window.fetch;
}

// Events
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;

// Add common HTML elements to body for tests to find
const $body = global.$('body');
$body.append('<div id="extensions_settings"></div>');
$body.append('<div id="chat"></div>');
$body.append('<div id="send_form"></div>');

// Stub third-party libraries SillyTavern might use
global.toastr = {
  info: () => {},
  warning: () => {},
  error: () => {},
  success: () => {}
};

// DOMPurify stub (ST uses this for sanitization)
global.DOMPurify = {
  sanitize: (html) => html  // In tests, just return as-is
};

console.log('✅ Browser polyfills loaded');
```

#### 1.4 Load Real SillyTavern Code

```javascript
// tests/setup/sillytavern-loader.js
/**
 * Attempts to load real SillyTavern code.
 * Documents what works and what doesn't.
 */

import fs from 'fs';
import path from 'path';

const ST_ROOT = path.resolve(__dirname, '../../../..');
const LOAD_LOG = path.resolve(__dirname, '../st-import-status.log');

// Track what we successfully imported
const importStatus = {
  timestamp: new Date().toISOString(),
  successes: [],
  failures: [],
  workarounds: []
};

/**
 * Try to import a SillyTavern module
 */
async function tryImport(modulePath, exportName) {
  try {
    const fullPath = path.join(ST_ROOT, modulePath);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    const module = await import(fullPath);

    if (exportName && !(exportName in module)) {
      throw new Error(`Export '${exportName}' not found in ${modulePath}`);
    }

    importStatus.successes.push({
      module: modulePath,
      exports: Object.keys(module)
    });

    return module;
  } catch (error) {
    importStatus.failures.push({
      module: modulePath,
      error: error.message,
      stack: error.stack
    });

    console.warn(`⚠️  Failed to import ${modulePath}:`, error.message);
    return null;
  }
}

// Try to import key SillyTavern modules
let scriptModule = null;
let worldInfoModule = null;
let extensionsModule = null;

// Attempt imports
(async () => {
  scriptModule = await tryImport('public/script.js');
  worldInfoModule = await tryImport('public/scripts/world-info.js');
  extensionsModule = await tryImport('public/scripts/extensions.js');

  // Write status log
  fs.writeFileSync(LOAD_LOG, JSON.stringify(importStatus, null, 2));

  console.log(`📊 Import status: ${importStatus.successes.length} successes, ${importStatus.failures.length} failures`);
  console.log(`📝 Details written to: ${LOAD_LOG}`);
})();

/**
 * Export what we successfully imported, or provide fallbacks
 */

// If real imports worked, re-export them
if (scriptModule) {
  // Re-export everything from script.js
  export * from '../../../script.js';
  console.log('✅ Using real SillyTavern script.js');
} else {
  // Provide minimal fallbacks that throw helpful errors
  console.log('⚠️  Using fallback stubs for script.js');

  export const chat = [];
  export const chat_metadata = {};
  export const extension_settings = {};
  export const characters = [];
  export const this_chid = 0;
  export const name2 = 'Character';

  export async function generateRaw(options) {
    throw new Error(
      'generateRaw called but real ST code not loaded. ' +
      'Check tests/st-import-status.log for details.'
    );
  }

  export function saveMetadata() {
    // Fallback: just a no-op
  }

  export function getContext() {
    return {
      chat,
      characters,
      name2
    };
  }

  importStatus.workarounds.push('Using stub implementations for script.js');
}

// World Info
if (worldInfoModule) {
  export * from '../../../scripts/world-info.js';
  console.log('✅ Using real SillyTavern world-info.js');
} else {
  console.log('⚠️  Using fallback stubs for world-info.js');

  export const world_info = {};
  export const world_names = {};

  export function loadWorldInfo() {
    throw new Error('loadWorldInfo called but real ST code not loaded');
  }

  export function saveWorldInfo() {
    throw new Error('saveWorldInfo called but real ST code not loaded');
  }

  importStatus.workarounds.push('Using stub implementations for world-info.js');
}

// Extensions
if (extensionsModule) {
  export * from '../../../scripts/extensions.js';
  console.log('✅ Using real SillyTavern extensions.js');
} else {
  console.log('⚠️  Using fallback stubs for extensions.js');

  export function getContext() {
    return {
      chat: global.chat || [],
      characters: global.characters || []
    };
  }

  export function getApiUrl() {
    return 'http://localhost:8080';  // Point to test proxy
  }

  importStatus.workarounds.push('Using stub implementations for extensions.js');
}
```

#### 1.5 Setup HTTP Interception

```javascript
// tests/setup/http-intercept.js
/**
 * Intercepts HTTP calls that SillyTavern makes to its backend.
 * Redirects to test proxy for LLM calls.
 */

import { rest } from 'msw';
import { setupServer } from 'msw/node';

// Create MSW server to intercept fetch() calls
export const server = setupServer(
  // Intercept ST's generate endpoint
  rest.post('*/api/backends/text-completions/generate', async (req, res, ctx) => {
    // Forward to your first-hop proxy
    const response = await fetch('http://localhost:8080/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(await req.json())
    });

    const data = await response.json();
    return res(ctx.json(data));
  }),

  // Mock other ST backend calls that don't need real responses
  rest.get('*/api/characters', (req, res, ctx) => {
    return res(ctx.json([]));
  }),

  rest.get('*/api/worlds', (req, res, ctx) => {
    return res(ctx.json({}));
  }),

  rest.post('*/api/settings/save', (req, res, ctx) => {
    return res(ctx.json({ success: true }));
  })
);

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
  console.log('🌐 HTTP interceptor started');
});

// Reset handlers between tests
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => {
  server.close();
  console.log('🌐 HTTP interceptor stopped');
});
```

#### 1.6 Update package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:debug": "vitest --inspect-brk --inspect --single-thread"
  }
}
```

### Phase 2: Write Test Helpers

#### 2.1 Test Data Builders

```javascript
// tests/helpers/builders.js
/**
 * Fluent APIs for building test data
 */

export function chatBuilder() {
  const messages = [];
  const metadata = {};

  return {
    addUserMessage(text, id) {
      messages.push({
        name: 'User',
        is_user: true,
        mes: text,
        extra: {},
        mesid: id ?? messages.length
      });
      return this;
    },

    addCharMessage(text, id) {
      messages.push({
        name: 'Character',
        is_user: false,
        mes: text,
        extra: {},
        mesid: id ?? messages.length
      });
      return this;
    },

    withSummary(messageId, summary, isLongTerm = false) {
      messages[messageId].extra.memory = {
        summary,
        isLongTerm
      };
      return this;
    },

    withSceneSummary(name, content, startIndex) {
      if (!metadata.scene_summaries) {
        metadata.scene_summaries = [];
      }
      metadata.scene_summaries.push({
        name,
        content,
        startIndex: startIndex ?? messages.length - 1
      });
      return this;
    },

    withMetadata(data) {
      Object.assign(metadata, data);
      return this;
    },

    build() {
      return { messages, metadata };
    },

    // Install into global chat/chat_metadata
    install() {
      global.chat = messages;
      global.chat_metadata = metadata;
      return this;
    }
  };
}

export function lorebookBuilder(name = 'test-lorebook') {
  const lorebook = {
    name,
    entries: []
  };

  return {
    addEntry(comment, keys, content) {
      lorebook.entries.push({
        uid: lorebook.entries.length,
        comment,
        keys: Array.isArray(keys) ? keys : [keys],
        content,
        enabled: true,
        position: 0,
        disable_trimming: false
      });
      return this;
    },

    addRegistryEntry(type, entries) {
      lorebook.entries.push({
        comment: `_registry_${type}`,
        keys: ['__never_match__'],
        content: JSON.stringify(entries),
        enabled: false
      });
      return this;
    },

    build() {
      return lorebook;
    }
  };
}

export function operationBuilder(type) {
  const operation = {
    id: `op_${Date.now()}_${Math.random()}`,
    type,
    status: 'pending',
    params: {},
    priority: 0,
    createdAt: Date.now()
  };

  return {
    withParams(params) {
      operation.params = params;
      return this;
    },

    withPriority(priority) {
      operation.priority = priority;
      return this;
    },

    dependsOn(...opIds) {
      operation.dependencies = opIds;
      return this;
    },

    withConnection(profile, preset) {
      operation.connectionProfile = profile;
      operation.completionPreset = preset;
      return this;
    },

    withMaxRetries(count) {
      operation.maxRetries = count;
      return this;
    },

    build() {
      return operation;
    }
  };
}
```

#### 2.2 Custom Assertions

```javascript
// tests/helpers/assertions.js
/**
 * Domain-specific assertions for clearer tests
 */

import { expect } from 'vitest';

export const customMatchers = {
  toBeValidOperation(received) {
    const pass =
      received &&
      typeof received === 'object' &&
      received.id &&
      received.type &&
      received.status &&
      ['pending', 'running', 'completed', 'failed'].includes(received.status);

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${JSON.stringify(received)} not to be a valid operation`
          : `Expected ${JSON.stringify(received)} to be a valid operation with id, type, and status`
    };
  },

  toHaveUIElement(received, selector) {
    const $element = global.$(selector);
    const pass = $element.length > 0;

    return {
      pass,
      message: () =>
        pass
          ? `Expected UI not to have element "${selector}" but it exists`
          : `Expected UI to have element "${selector}" but it was not found`
    };
  },

  toHaveWiredHandler(received, eventType) {
    const $element = global.$(received);
    const events = $element.data('events') || {};
    const pass = eventType in events;

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to have ${eventType} handler`
          : `Expected element to have ${eventType} handler but none was found`
    };
  },

  toHaveLorebookEntry(received, entryComment) {
    const entry = received.entries?.find(e => e.comment === entryComment);
    const pass = !!entry;

    return {
      pass,
      message: () =>
        pass
          ? `Expected lorebook not to have entry "${entryComment}"`
          : `Expected lorebook to have entry "${entryComment}" but it was not found. Available: ${received.entries?.map(e => e.comment).join(', ')}`
    };
  },

  toHaveSummary(received, messageId) {
    const message = Array.isArray(received) ? received[messageId] : received;
    const pass = message?.extra?.memory?.summary !== undefined;

    return {
      pass,
      message: () =>
        pass
          ? `Expected message ${messageId} not to have summary`
          : `Expected message ${messageId} to have summary but extra.memory.summary was undefined`
    };
  }
};

// Register custom matchers
expect.extend(customMatchers);
```

#### 2.3 Test Fixtures

```javascript
// tests/fixtures/chats.js
/**
 * Pre-built test chats for common scenarios
 */

export const greetingChat = {
  messages: [
    { name: 'User', is_user: true, mes: 'Hello!', extra: {} },
    { name: 'Char', is_user: false, mes: 'Hi there!', extra: {} }
  ],
  metadata: {}
};

export const longConversationChat = {
  messages: Array.from({ length: 50 }, (_, i) => ({
    name: i % 2 === 0 ? 'User' : 'Char',
    is_user: i % 2 === 0,
    mes: `Message ${i}`,
    extra: {}
  })),
  metadata: {}
};

export const chatWithSummaries = {
  messages: [
    { name: 'User', is_user: true, mes: 'Hello', extra: { memory: { summary: 'User greets' } } },
    { name: 'Char', is_user: false, mes: 'Hi', extra: { memory: { summary: 'Char responds' } } }
  ],
  metadata: {}
};

// tests/fixtures/llm-responses.js
/**
 * Canned LLM responses for proxy
 */

export const summarizationResponses = {
  greeting: {
    match: /summarize.*hello/i,
    response: {
      content: 'Summary: User sends a friendly greeting to the character.'
    }
  },

  complexScene: {
    match: /scene.*alice.*bob/i,
    response: {
      content: JSON.stringify({
        summary: 'Alice and Bob discuss plans',
        lorebooks: [
          { type: 'character', name: 'Alice', description: 'A detective' },
          { type: 'character', name: 'Bob', description: 'A suspect' }
        ]
      })
    }
  }
};
```

### Phase 3: Write Tests

#### 3.1 UI Wiring Tests

```javascript
// tests/integration/ui-wiring.test.js
/**
 * Tests that UI elements exist and are wired correctly.
 * Catches AI forgetting to create elements or attach handlers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setupSettingsUI } from '../../settingsUI.js';

describe('Settings UI - Element Existence', () => {
  beforeEach(() => {
    // Clear and setup DOM
    global.$('body').empty();
    global.$('body').append('<div id="extensions_settings"></div>');

    // Setup extension settings
    global.extension_settings = { auto_summarize: {} };

    // Initialize UI
    setupSettingsUI();
  });

  it('creates enable checkbox', () => {
    expect(null).toHaveUIElement('#enable_auto_summarize');
  });

  it('creates max tokens input', () => {
    expect(null).toHaveUIElement('#max_tokens');
  });

  it('creates summary prompt textarea', () => {
    expect(null).toHaveUIElement('#summary_prompt');
  });

  it('creates scene break button', () => {
    expect(null).toHaveUIElement('#auto_summarize_scene_break_button');
  });

  it('creates all required profile settings', () => {
    const required = [
      '#scene_connection_profile',
      '#scene_completion_preset',
      '#validation_enabled',
      '#auto_scene_detection_enabled'
    ];

    required.forEach(selector => {
      expect(null).toHaveUIElement(selector);
    });
  });
});

describe('Settings UI - Wiring', () => {
  beforeEach(() => {
    global.$('body').empty();
    global.$('body').append('<div id="extensions_settings"></div>');
    global.extension_settings = { auto_summarize: { profiles: { default: {} } } };
    setupSettingsUI();
  });

  it('checkbox changes setting when clicked', () => {
    const $checkbox = global.$('#enable_auto_summarize');

    // Simulate user interaction
    $checkbox.prop('checked', true);
    $checkbox.trigger('change');

    // Verify setting changed
    expect(global.extension_settings.auto_summarize.enabled).toBe(true);
  });

  it('slider updates setting value', () => {
    const $slider = global.$('#max_tokens');

    $slider.val(1000);
    $slider.trigger('input');

    expect(global.extension_settings.auto_summarize.profiles.default.max_tokens).toBe(1000);
  });

  it('scene break button has click handler', () => {
    const $button = global.$('#auto_summarize_scene_break_button');
    expect($button[0]).toHaveWiredHandler('click');
  });
});
```

#### 3.2 API Usage Tests

```javascript
// tests/integration/api-usage.test.js
/**
 * Tests that extension uses SillyTavern APIs correctly.
 * Real ST code will throw if used incorrectly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateSummary } from '../../summarization.js';
import { chat, chat_metadata } from '../setup/sillytavern-loader.js';

describe('SillyTavern API - generateRaw Usage', () => {
  it('calls generateRaw with correct options object', async () => {
    chat[0] = { mes: 'Test message', extra: {} };

    // If generateSummary calls generateRaw incorrectly, real ST code throws
    await expect(generateSummary(0)).resolves.toBeDefined();
  });

  it('handles generateRaw promise correctly', async () => {
    chat[0] = { mes: 'Test', extra: {} };

    // Should await the promise, not treat as synchronous
    const result = await generateSummary(0);
    expect(result).toHaveProperty('summary');
  });
});

describe('SillyTavern API - Chat Structure', () => {
  it('modifies chat structure correctly', () => {
    const { addSummaryToMessage } = require('../../memoryCore.js');

    chat[0] = { mes: 'Test', extra: {} };
    addSummaryToMessage(0, 'Test summary');

    // Verify structure matches ST expectations
    expect(chat[0]).toHaveProperty('extra');
    expect(chat[0].extra).toHaveProperty('memory');
    expect(chat[0].extra.memory).toHaveProperty('summary');
  });

  it('checks message exists before modifying', () => {
    const { addSummaryToMessage } = require('../../memoryCore.js');

    chat.length = 0;

    // Should not crash or create invalid state
    expect(() => addSummaryToMessage(5, 'summary')).not.toThrow();
  });
});
```

#### 3.3 Integration Workflow Tests

```javascript
// tests/integration/workflows.test.js
/**
 * End-to-end workflow tests.
 * Catches silent breakage across modules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { chatBuilder, lorebookBuilder } from '../helpers/builders.js';

describe('Summarization Workflow', () => {
  beforeEach(() => {
    chatBuilder().install();
  });

  it('generates and stores summary for message', async () => {
    // Setup
    chatBuilder()
      .addUserMessage('Hello there!')
      .install();

    // Execute workflow
    const { summarizeMessage } = await import('../../summarization.js');
    await summarizeMessage(0);

    // Verify
    expect(global.chat).toHaveSummary(0);
    expect(global.chat[0].extra.memory.summary).toBeTruthy();
  });

  it('validates summary if validation enabled', async () => {
    // Setup
    global.extension_settings.auto_summarize = {
      profiles: {
        default: {
          validation_enabled: true
        }
      },
      profile: 'default'
    };

    chatBuilder()
      .addUserMessage('Test message')
      .install();

    // Execute
    const { summarizeMessage } = await import('../../summarization.js');
    await summarizeMessage(0);

    // Verify validation was performed
    expect(global.chat[0].extra.memory.validated).toBe(true);
  });
});

describe('Lorebook Pipeline', () => {
  it('extracts entities and creates lorebook entries', async () => {
    // Setup
    const sceneSummary = {
      content: JSON.stringify({
        summary: 'Alice meets Bob at the cafe',
        lorebooks: [
          { type: 'character', name: 'Alice', description: 'A detective investigating' },
          { type: 'character', name: 'Bob', description: 'A cafe owner' }
        ]
      })
    };

    const lorebook = lorebookBuilder().build();

    // Execute
    const { processLorebookExtraction } = await import('../../lorebookManager.js');
    const result = await processLorebookExtraction(sceneSummary, lorebook);

    // Verify
    expect(result).toHaveLorebookEntry('character_alice');
    expect(result).toHaveLorebookEntry('character_bob');
  });
});

describe('Scene Detection', () => {
  it('detects scene break and generates summary', async () => {
    // Setup
    chatBuilder()
      .addUserMessage('Goodbye for now')
      .addCharMessage('See you later')
      .addUserMessage('Next day arrives')
      .install();

    global.extension_settings.auto_summarize = {
      profiles: {
        default: {
          auto_scene_detection_enabled: true,
          scene_detection_cooldown: 0
        }
      },
      profile: 'default'
    };

    // Execute
    const { detectSceneBreak } = await import('../../autoSceneBreakDetection.js');
    const hasBreak = await detectSceneBreak(2);

    // Verify
    expect(hasBreak).toBe(true);
    expect(global.chat_metadata.scene_summaries).toBeDefined();
  });
});
```

#### 3.4 Operation Queue Tests

```javascript
// tests/integration/operation-queue.test.js
/**
 * Tests operation queue processing logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { operationBuilder } from '../helpers/builders.js';
import { enqueueOperation, processQueue, getQueue } from '../../operationQueue.js';

describe('Operation Queue - Basic Operations', () => {
  beforeEach(() => {
    global.chat_metadata = {};
  });

  it('enqueues operation', async () => {
    const op = operationBuilder('TEST_OP')
      .withParams({ test: 'data' })
      .build();

    await enqueueOperation(op);

    const queue = getQueue();
    expect(queue.operations).toHaveLength(1);
    expect(queue.operations[0]).toBeValidOperation();
  });

  it('processes operations in priority order', async () => {
    const opLow = operationBuilder('LOW')
      .withPriority(1)
      .build();

    const opHigh = operationBuilder('HIGH')
      .withPriority(10)
      .build();

    await enqueueOperation(opLow);
    await enqueueOperation(opHigh);

    // Process should handle high priority first
    const processOrder = [];
    const handler = (op) => {
      processOrder.push(op.type);
      return Promise.resolve({ success: true });
    };

    registerOperationHandler('LOW', handler);
    registerOperationHandler('HIGH', handler);

    await processQueue();

    expect(processOrder[0]).toBe('HIGH');
    expect(processOrder[1]).toBe('LOW');
  });

  it('persists queue to chat metadata', async () => {
    const op = operationBuilder('PERSIST_TEST').build();

    await enqueueOperation(op);

    // Verify stored in metadata
    expect(global.chat_metadata.operation_queue).toBeDefined();
    expect(global.chat_metadata.operation_queue.operations).toHaveLength(1);
  });
});

describe('Operation Queue - Dependencies', () => {
  it('waits for dependencies before processing', async () => {
    const op1 = operationBuilder('FIRST').build();
    const op2 = operationBuilder('SECOND')
      .dependsOn(op1.id)
      .build();

    await enqueueOperation(op1);
    await enqueueOperation(op2);

    await processQueue();

    // Both should complete, second after first
    const queue = getQueue();
    expect(queue.operations[0].status).toBe('completed');
    expect(queue.operations[1].status).toBe('completed');
  });
});
```

### Phase 4: Document for AI

#### 4.1 Create AI Testing Guide

```markdown
// tests/AI-TESTING-GUIDE.md

# Testing Guide for AI Developers

## When to Write Tests

**Write tests for EVERY feature you implement:**
1. After creating new UI elements
2. After adding new settings
3. After implementing new workflows
4. After modifying existing functionality

## Test Templates

### Template 1: UI Element Test

```javascript
describe('New Feature UI', () => {
  beforeEach(() => {
    global.$('body').empty();
    global.$('body').append('<div id="extensions_settings"></div>');
    setupSettingsUI();
  });

  it('creates [element name]', () => {
    expect(null).toHaveUIElement('#your_element_id');
  });

  it('[element] updates setting when changed', () => {
    const $element = global.$('#your_element_id');
    $element.val('new_value');
    $element.trigger('change');

    expect(global.extension_settings.auto_summarize.your_setting).toBe('new_value');
  });
});
```

### Template 2: Workflow Test

```javascript
describe('New Feature Workflow', () => {
  beforeEach(() => {
    chatBuilder().install();
  });

  it('completes workflow successfully', async () => {
    // 1. Setup test data
    chatBuilder()
      .addUserMessage('test')
      .install();

    // 2. Execute your function
    const { yourFunction } = await import('../../yourModule.js');
    const result = await yourFunction();

    // 3. Verify result
    expect(result).toBeDefined();
    expect(result.property).toBe('expected_value');
  });
});
```

### Template 3: API Usage Test

```javascript
describe('New Feature API Usage', () => {
  it('uses SillyTavern API correctly', async () => {
    const { yourFunction } = await import('../../yourModule.js');

    // If you use ST API incorrectly, this will throw
    await expect(yourFunction()).resolves.toBeDefined();
  });
});
```

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (re-run on change)
npm run test:watch

# With coverage
npm run test:coverage

# UI mode (browser interface)
npm run test:ui
```

## Common Errors and Fixes

### Error: "Element not found #my_button"
**Cause**: You forgot to create the UI element
**Fix**: Add the element creation code to your UI setup function

### Error: "generateRaw requires options.prompt"
**Cause**: Called `generateRaw(prompt)` instead of `generateRaw({ prompt })`
**Fix**: Pass an options object, not a string

### Error: "Cannot read property 'extra' of undefined"
**Cause**: Tried to access `chat[index]` that doesn't exist
**Fix**: Check `if (chat[index])` before accessing

## Best Practices

1. **Test after writing code, not before** - You need to understand what you built first
2. **Copy templates** - Use the templates above as starting points
3. **Run tests frequently** - After every file save
4. **Read error messages carefully** - They tell you exactly what's wrong
5. **Keep tests simple** - One thing per test

## What to Test

✅ **DO test:**
- UI elements exist
- Settings update correctly
- Functions return expected results
- Workflows complete end-to-end
- Error handling works

❌ **DON'T test:**
- Visual appearance
- Animation timing
- Exact positioning
- Third-party library internals
```

---

## Test Patterns

### Pattern 1: Test UI Creation

```javascript
describe('Feature Name - UI Elements', () => {
  beforeEach(() => {
    // Setup clean DOM
    global.$('body').empty();
    global.$('body').append('<div id="extensions_settings"></div>');

    // Initialize extension
    setupSettingsUI();
  });

  it('creates all required elements', () => {
    const elements = [
      '#element_one',
      '#element_two',
      '#element_three'
    ];

    elements.forEach(selector => {
      expect(null).toHaveUIElement(selector);
    });
  });
});
```

### Pattern 2: Test Settings Wiring

```javascript
describe('Feature Name - Settings Wiring', () => {
  beforeEach(() => {
    global.extension_settings = {
      auto_summarize: {
        profiles: { default: {} },
        profile: 'default'
      }
    };

    setupSettingsUI();
  });

  it('updates setting when input changes', () => {
    const $input = global.$('#setting_input');

    // Simulate user interaction
    $input.val('new_value');
    $input.trigger('change');

    // Verify setting changed
    const settings = global.extension_settings.auto_summarize.profiles.default;
    expect(settings.your_setting).toBe('new_value');
  });
});
```

### Pattern 3: Test Complete Workflow

```javascript
describe('Feature Name - Complete Workflow', () => {
  beforeEach(() => {
    // Setup test environment
    chatBuilder()
      .addUserMessage('Test message')
      .install();
  });

  it('executes workflow successfully', async () => {
    // Arrange
    const input = { data: 'test' };

    // Act
    const { workflowFunction } = await import('../../module.js');
    const result = await workflowFunction(input);

    // Assert
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(global.chat[0].extra.data).toBe('expected');
  });
});
```

### Pattern 4: Test Error Handling

```javascript
describe('Feature Name - Error Handling', () => {
  it('handles missing data gracefully', async () => {
    const { yourFunction } = await import('../../module.js');

    // Call with invalid data
    const result = await yourFunction(null);

    // Should not crash
    expect(result).toBeDefined();
    expect(result.error).toBe(true);
  });

  it('retries on failure', async () => {
    let attempts = 0;

    // Mock to fail twice then succeed
    vi.mock('../../module.js', () => ({
      riskyOperation: () => {
        attempts++;
        if (attempts < 3) throw new Error('Fail');
        return { success: true };
      }
    }));

    const { retryWrapper } = await import('../../utils.js');
    const result = await retryWrapper(() => riskyOperation(), 3);

    expect(attempts).toBe(3);
    expect(result.success).toBe(true);
  });
});
```

### Pattern 5: Test API Contracts

```javascript
describe('Feature Name - ST API Usage', () => {
  it('uses generateRaw correctly', async () => {
    // Setup
    global.chat = [{ mes: 'test', extra: {} }];

    const { generateWithLLM } = await import('../../module.js');

    // Execute - if API used wrong, ST code throws
    await expect(generateWithLLM('prompt')).resolves.toBeDefined();
  });

  it('modifies chat structure correctly', () => {
    global.chat = [{ mes: 'test', extra: {} }];

    const { modifyChatMessage } = await import('../../module.js');
    modifyChatMessage(0, { data: 'value' });

    // Verify structure matches ST expectations
    expect(global.chat[0].extra.data).toBe('value');
  });
});
```

---

## Troubleshooting

### Issue: "Cannot import SillyTavern module"

**Check**: `tests/st-import-status.log`

This file documents what ST modules loaded successfully and what failed.

**Common causes:**
1. ST module uses Node.js-specific APIs (fs, path)
   - **Fix**: Add polyfill or conditional import

2. ST module requires browser-only APIs jsdom doesn't support
   - **Fix**: Add to polyfills.js or provide stub

3. Circular dependency
   - **Fix**: May need to import in specific order

**Example fix:**
```javascript
// If ST module fails because of missing global
// Add to tests/setup/polyfills.js:
global.missingAPI = {
  method: () => {}
};
```

### Issue: "Test times out"

**Cause**: Async operation never resolves

**Check:**
1. Is your proxy running? (http://localhost:8080)
2. Does function await all promises?
3. Is there an infinite loop?

**Debug:**
```javascript
it('operation that times out', async () => {
  console.log('Starting...');
  const result = await yourFunction();
  console.log('Completed:', result);
}, 10000);  // Increase timeout temporarily
```

### Issue: "Expected element not found"

**Cause**: UI element not created

**Verify:**
```javascript
it('debug element creation', () => {
  setupSettingsUI();

  // Print all created elements
  console.log('Elements:', global.$('#extensions_settings').html());

  // Check if your element exists
  const $el = global.$('#your_element');
  console.log('Found:', $el.length);
});
```

### Issue: "ST API throws unexpected error"

**Cause**: Using ST API incorrectly

**Check documentation:**
1. Is it an object or string parameter?
2. Is it sync or async?
3. What does it actually return?

**Verify with real ST:**
```javascript
// In browser console on real ST:
console.log(generateRaw.toString());  // See actual signature
console.log(await generateRaw({ prompt: 'test' }));  // See actual return
```

### Issue: "Tests pass but production fails"

**Causes:**
1. Real ST API differs from test environment
   - **Fix**: Check st-import-status.log, ensure real ST loaded

2. Browser API not properly polyfilled
   - **Fix**: Add to polyfills.js

3. Timing differences (tests faster than real ST)
   - **Fix**: Add proper awaits, check race conditions

---

## Maintaining Tests

### When ST Updates

1. **Run tests after ST update**
   ```bash
   npm test
   ```

2. **Check import status**
   ```bash
   cat tests/st-import-status.log
   ```

3. **If imports fail:**
   - Check what changed in ST
   - Update polyfills if needed
   - Update fallbacks if necessary

4. **Update documentation**
   - Note any new ST APIs used
   - Document any workarounds added

### When Adding Features

1. **Write tests for new code**
   - UI elements
   - Settings wiring
   - Workflow integration

2. **Run existing tests**
   ```bash
   npm test
   ```

3. **Fix any breaking tests**
   - Your change may have broken existing functionality
   - Update tests if behavior intentionally changed

### Coverage Goals

- **Overall**: 80%+ line coverage
- **Core modules**: 90%+ coverage
  - operationQueue.js
  - lorebookManager.js
  - memoryCore.js
  - connectionSettingsManager.js

**Check coverage:**
```bash
npm run test:coverage
open coverage/index.html
```

---

## Summary

### The Testing Approach

1. **Import real SillyTavern code** (no fantasy mocks)
2. **Run in Node.js + jsdom** (fast feedback)
3. **Polyfill browser APIs** (make ST code work)
4. **Mock only HTTP boundary** (redirect to proxy)
5. **Test everything** (UI, wiring, APIs, workflows)

### What This Catches

✅ Forgot to create UI element
✅ Forgot to wire up handler
✅ Used ST API incorrectly
✅ Broke existing functionality
✅ Invalid data structures
✅ Missing error handling

### What This Doesn't Catch

❌ Visual appearance issues
❌ Layout calculation bugs
❌ Animation problems
❌ Real browser-specific bugs

For those, manual testing or Playwright required.

### Key Takeaway

**Tests run against reality, not fantasy.** When AI makes mistakes using SillyTavern APIs, tests fail with real errors from real code. No drift, no imagination, just truth.

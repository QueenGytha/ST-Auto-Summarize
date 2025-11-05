# Testing Strategy for ST-Auto-Summarize

⚠️ **IMPLEMENTATION STATUS: THEORETICAL - NOT YET IMPLEMENTED** ⚠️

This document describes a proposed testing methodology that has **not been validated**. Before proceeding with full implementation:
1. Validate that real SillyTavern code can be imported (see [IMPLEMENTATION_REALITY_CHECK.md](./IMPLEMENTATION_REALITY_CHECK.md))
2. Measure actual success rate (target: 80%+ of imports working)
3. If imports fail, use runtime proxy to real ST (Option B below)

**CRITICAL RULE: Zero tolerance for AI-written mocks, stubs, or fantasy behavior. Either import real ST code or call real running ST at runtime. Nothing else is acceptable.**

---

## Quick Reference

This document provides a high-level overview. **For comprehensive implementation details, see [TESTING_ARCHITECTURE.md](./TESTING_ARCHITECTURE.md).**

---

## The Problem

AI develops all code and tests for this extension. AI makes systematic mistakes:

1. **Forgets UI elements** - Creates settings but no input
2. **Forgets wiring** - Creates elements but no event handlers
3. **Misunderstands APIs** - Invents SillyTavern functions that don't exist
4. **Silent breakage** - Changes break other modules with no errors

Traditional testing approaches don't work because AI cannot maintain accurate mocks.

---

## The Solution

**Import real SillyTavern code into Node.js tests using jsdom for browser APIs.**

### Key Innovation (Option A: Real Imports - Preferred)

Instead of mocking SillyTavern, make the actual ST source code run in Node.js by providing polyfills:
- jsdom provides: `window`, `document`, jQuery, localStorage
- MSW intercepts HTTP calls to ST backend
- Tests use **real ST code** that validates API usage
- Mock only at HTTP boundary (redirect to test proxy)

### Fallback (Option B: Runtime Proxy - If Imports Fail)

**If real imports fail completely**, use runtime proxy to real running SillyTavern:
- Start real ST server before tests
- Extension code calls "ST APIs" that are HTTP proxies
- Proxies forward to real ST endpoints
- Real ST validates API usage and returns real responses
- **Still zero mocks - tests against running reality**

### Why This Works

✅ Tests against reality, not fantasy
✅ Wrong API usage → Real ST throws error (imports) or rejects request (proxy)
✅ No drift when ST updates
✅ Catches all four AI mistake types
✅ Fast enough for tight feedback loop (~10s with imports, ~20s with proxy)
✅ AI can write simple test patterns
✅ **No AI-written mocks in either approach**

---

## What Gets Tested

### ✅ Can Test (~95% of functionality)

**UI & Wiring**:
- Elements exist in DOM
- Event handlers attached
- Settings update correctly

**Business Logic**:
- Operation queue processing
- Lorebook pipeline (extraction, dedup, merge)
- Memory generation and injection
- Scene detection workflows

**Integration**:
- Cross-module interactions
- SillyTavern API usage
- Data flow end-to-end

### ❌ Cannot Test (~5%)

**Visual/Layout** (requires real browser):
- Element positioning
- Scroll behavior
- Drag and drop
- Animation timing

For these, manual testing or Playwright required.

---

## What Happens If Imports Fail?

### Pre-Implementation: Validate First

**Before building full test infrastructure:**

1. **Try to import real ST code** (see [IMPLEMENTATION_REALITY_CHECK.md](./IMPLEMENTATION_REALITY_CHECK.md))
   ```bash
   node -e "import('../../../../script.js').then(() => console.log('SUCCESS')).catch(e => console.error('FAILED:', e))"
   ```

2. **Measure success rate:**
   - 90-100% imports work → Proceed with Option A (imports)
   - 70-90% imports work → Proceed with Option A + selective Option B
   - Below 70% → Use Option B (runtime proxy) exclusively
   - 0% imports work → Reevaluate approach entirely

### If Imports Fail: Runtime Proxy Architecture

**Do NOT write fallback stubs or "documented proxies"** - that's just mocks with extra steps.

Instead, call real running SillyTavern:

```javascript
// tests/setup/sillytavern-proxy.js
// This is a PROXY, not a mock - forwards to real ST

export async function generateRaw(options) {
  // Every call goes to REAL SillyTavern
  const response = await fetch('http://localhost:8000/extension-api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    throw new Error(`Real ST rejected call: ${await response.text()}`);
  }

  return await response.json();
}

// Real ST's state, fetched at runtime
export async function getChat() {
  return await fetch('http://localhost:8000/extension-api/chat').then(r => r.json());
}
```

**Setup requirements for Option B:**
1. ST must expose test endpoints (`/extension-api/*`)
2. Tests start real ST server before running
3. Tests call proxies that forward to real ST
4. Real ST validates all API usage
5. **Zero AI-written behavior - all responses from real ST**

---

## Quick Start

### Running Tests

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
npm run test:ui         # Interactive UI
```

### Writing a Simple Test

```javascript
describe('My Feature', () => {
  it('creates UI element', () => {
    setupMyFeature();
    expect(null).toHaveUIElement('#my_button');
  });

  it('updates setting when clicked', () => {
    global.$('#my_button').click();
    expect(global.extension_settings.my_setting).toBe(true);
  });
});
```

**For full test patterns and examples**, see [TESTING_ARCHITECTURE.md - Test Patterns](./TESTING_ARCHITECTURE.md#test-patterns).

---

## Approaches Considered and Rejected

**For detailed analysis**, see [TESTING_ARCHITECTURE.md - Approaches Considered](./TESTING_ARCHITECTURE.md#approaches-considered).

### ❌ Playwright with Real Browser
- **Pros**: Tests everything
- **Cons**: AI struggles with complexity, token-heavy, slow (minutes per test)
- **Why rejected**: Not viable for AI-written tests with tight feedback loop

### ❌ Pure Business Logic Tests (Node.js only)
- **Pros**: Simple, fast
- **Cons**: Doesn't test UI, wiring, or ST integration
- **Why rejected**: Misses AI's most common mistakes

### ❌ Manual Mocks
- **Pros**: Can test in Node.js
- **Cons**: AI writes fantasy APIs, tests pass but production fails
- **Why rejected**: Creates false confidence, allows drift from reality

### ❌ Vitest Auto-Mocks
- **Pros**: No manual mock writing
- **Cons**: Empty stubs, still need to define behavior manually
- **Why rejected**: Same problem as manual mocks

### ❌ Contract-Based Testing with Manual Contracts
- **Pros**: Enforces API usage rules
- **Cons**: Contracts manually written, can be wrong
- **Why rejected**: Who writes accurate contracts? If AI, they're fantasy

### ⚠️ Extract Contracts from Running ST
- **Pros**: Based on real ST
- **Cons**: Complex tooling, doesn't capture behavior, extracted contracts still need implementation
- **Why rejected**: Extracted structure + AI-written behavior = still fantasy mocks

### ✅ Runtime Proxy to Real ST (Fallback Option)
- **Description**: Don't import ST code; call real running ST at test time
- **Pros**: Tests against real ST, no imports needed, no mocks possible
- **Cons**: Requires ST running, slower, needs test API endpoints
- **Status**: Viable fallback if imports fail completely

---

## Implementation Overview

**Full details in [TESTING_ARCHITECTURE.md - Implementation Guide](./TESTING_ARCHITECTURE.md#implementation-guide).**

### Phase 0: Validation (DO THIS FIRST!)

**Before any infrastructure work:**

1. **Test if imports work** (see [IMPLEMENTATION_REALITY_CHECK.md](./IMPLEMENTATION_REALITY_CHECK.md))
2. **Measure success rate** (how many ST modules import successfully)
3. **Decide approach** based on results:
   - High success (80%+) → Proceed with import-based testing
   - Low success (<80%) → Use runtime proxy approach
4. **Document what works** (create import status log)

### Phase 1: Setup (After Validation)

**If imports work (Option A):**
1. Install: `vitest`, `jsdom`, `fake-indexeddb`, `ws`, `canvas`, `msw`
2. Create `tests/setup/polyfills.js` - Browser APIs (jsdom + polyfills)
3. Create `tests/setup/sillytavern-loader.js` - Import real ST code (NO fallback stubs)
4. Create `tests/setup/http-intercept.js` - Redirect LLM calls to proxy
5. Configure `vitest.config.js`

**If imports fail (Option B):**
1. Install: `vitest`, `jsdom` (minimal setup)
2. Create `tests/setup/sillytavern-proxy.js` - Runtime proxies to real ST
3. Create test script to start ST server before tests
4. Configure `vitest.config.js` with longer timeouts
5. Add ST test API endpoints (in ST codebase, not extension)

### Phase 2: Test Helpers

1. `tests/helpers/builders.js` - Fluent APIs (chatBuilder, operationBuilder)
2. `tests/helpers/assertions.js` - Custom matchers (toHaveUIElement, etc.)
3. `tests/fixtures/*.js` - Test data

### Phase 3: Write Tests

1. **UI Wiring Tests**: Elements exist, handlers attached
2. **API Usage Tests**: ST APIs used correctly
3. **Integration Tests**: End-to-end workflows
4. **Queue Tests**: Operation processing

### Phase 4: AI Guide

Create `tests/AI-TESTING-GUIDE.md` with templates and patterns for AI to copy.

---

## Test Coverage Goals

- **Overall**: 80%+ line coverage
- **Core modules**: 90%+ (queue, lorebook, memory, connection)
- **UI modules**: Lower acceptable (visual testing not possible)

```bash
npm run test:coverage
open coverage/index.html
```

---

## Troubleshooting

### "Cannot import SillyTavern module"

Check `tests/st-import-status.log` for details on what failed to load.

**Common fixes**:
- Add polyfill to `tests/setup/polyfills.js`
- Add Node.js equivalent for browser API
- Stub the specific API ST needs

### "Test times out"

1. Is proxy running? (`http://localhost:8080`)
2. Did you `await` all promises?
3. Increase timeout temporarily for debugging

### "Element not found"

UI element wasn't created. Check if setup function called.

### "ST API throws unexpected error"

You're using ST API incorrectly. Check:
- Real ST documentation
- Actual signature in ST code
- What it returns (sync vs async, type)

**Full troubleshooting guide**: [TESTING_ARCHITECTURE.md - Troubleshooting](./TESTING_ARCHITECTURE.md#troubleshooting).

---

## For AI Developers

### When to Write Tests

**After EVERY feature you implement**:
- New UI elements → Test they exist
- New settings → Test wiring
- New workflows → Test end-to-end
- Modify existing code → Ensure tests still pass

### Test Templates

See [TESTING_ARCHITECTURE.md - AI Testing Guide](./TESTING_ARCHITECTURE.md#phase-4-document-for-ai) for copy-paste templates.

### What Tests Catch

✅ Forgot to create element → Test fails "element not found"
✅ Forgot to wire handler → Test fails "setting didn't change"
✅ Wrong API signature → Real ST code throws error
✅ Broke other module → Integration test fails

### Workflow

1. Write feature code
2. Write test using template
3. Run `npm test`
4. Fix errors if any
5. Commit when tests pass

---

## Key Takeaway

**Tests run against real SillyTavern, not imagined APIs.**

When AI makes mistakes:
- Uses wrong API → Real ST code throws error (imports) OR real ST server rejects request (proxy)
- Forgets UI → Test can't find element
- Forgets wiring → Setting doesn't change
- Breaks integration → Workflow test fails

**No fantasy, no drift, no AI-written mocks - just reality.**

### Critical Success Factors

1. ✅ **Validate imports work** before building infrastructure
2. ✅ **Use runtime proxy** if imports fail, not manual mocks
3. ✅ **Never write mock behavior** - all behavior comes from real ST
4. ✅ **Document import failures** - know what works and what doesn't
5. ✅ **Re-validate periodically** - ST changes may affect import success

---

## Next Steps

1. **Read**: [TESTING_ARCHITECTURE.md](./TESTING_ARCHITECTURE.md) for complete implementation
2. **Setup**: Follow Phase 1-4 implementation guide
3. **Write**: Use test patterns and templates
4. **Run**: `npm test` after every change

Questions? Check the troubleshooting section or the detailed architecture doc.

# Testing Strategy for ST-Auto-Summarize

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

### Key Innovation

Instead of mocking SillyTavern, make the actual ST source code run in Node.js by providing polyfills:
- jsdom provides: `window`, `document`, jQuery, localStorage
- MSW intercepts HTTP calls to ST backend
- Tests use **real ST code** that validates API usage
- Mock only at HTTP boundary (redirect to test proxy)

### Why This Works

✅ Tests against reality, not fantasy
✅ Wrong API usage → Real ST throws error
✅ No drift when ST updates
✅ Catches all four AI mistake types
✅ Fast enough for tight feedback loop (~10s)
✅ AI can write simple test patterns

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

### ❌ Extract Contracts from Running ST
- **Pros**: Based on real ST
- **Cons**: Complex tooling, doesn't capture behavior
- **Why rejected**: If running real ST to extract, why not just import ST code?

---

## Implementation Overview

**Full details in [TESTING_ARCHITECTURE.md - Implementation Guide](./TESTING_ARCHITECTURE.md#implementation-guide).**

###  Phase 1: Setup

1. Install: `vitest`, `jsdom`, `msw` (Mock Service Worker)
2. Create `tests/setup/polyfills.js` - Browser APIs (jsdom)
3. Create `tests/setup/sillytavern-loader.js` - Import real ST code
4. Create `tests/setup/http-intercept.js` - Redirect LLM calls to proxy
5. Configure `vitest.config.js`

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

**Tests run against real SillyTavern code, not imagined APIs.**

When AI makes mistakes:
- Uses wrong API → Real ST throws error
- Forgets UI → Test can't find element
- Forgets wiring → Setting doesn't change
- Breaks integration → Workflow test fails

No fantasy, no drift, just reality.

---

## Next Steps

1. **Read**: [TESTING_ARCHITECTURE.md](./TESTING_ARCHITECTURE.md) for complete implementation
2. **Setup**: Follow Phase 1-4 implementation guide
3. **Write**: Use test patterns and templates
4. **Run**: `npm test` after every change

Questions? Check the troubleshooting section or the detailed architecture doc.

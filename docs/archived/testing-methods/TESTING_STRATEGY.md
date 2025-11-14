# Testing Strategy for ST-Auto-Recap

✅ **SOLUTION VALIDATED: IN-BROWSER TESTING** ✅

**Why Other Approaches Failed:**
- **Import-based testing:** 9.1% success rate (CommonJS incompatibility in `lib.js`)
- **Runtime proxy:** Can't test UI wiring (missing 50% of coverage)
- **Playwright with AI:** AI iterates for hours trying to figure out ST's DOM structure

**The Working Solution: In-Browser Unit Testing**
- Load real SillyTavern in real browser (no import issues)
- Test functions directly (no navigation complexity)
- Verify UI creation, settings wiring, and integration
- Run headlessly via Puppeteer (fully autonomous)
- AI writes simple tests, gets immediate pass/fail

**CRITICAL RULE: Zero tolerance for AI-written mocks. Tests run in real browser with real ST loaded. All behavior is real.**

**Complete workflow documented in [AI_DEVELOPMENT_WORKFLOW.md](./AI_DEVELOPMENT_WORKFLOW.md)**

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

**In-browser unit testing with headless automation**

### Why This Approach?

**Three approaches were evaluated:**

1. **Import ST code into Node.js** ❌
   - Tried, failed: 9.1% success rate
   - CommonJS incompatibility blocks all imports

2. **Runtime HTTP proxy to ST server** ❌
   - Can't test UI creation or wiring
   - Misses 50% of what needs testing

3. **In-browser unit tests** ✅
   - Loads real ST in real browser
   - Tests call functions directly (no navigation)
   - Verifies UI creation, wiring, integration
   - Runs headlessly for automation

### How It Works

**Load real SillyTavern in browser:**
```html
<script src="path/to/sillytavern/script.js"></script>
<script src="extension/index.js"></script>
<script src="tests/my-feature.test.js"></script>
```

**Test functions directly:**
```javascript
describe('My Feature', () => {
  it('creates checkbox and wires to settings', () => {
    setupMyFeature();  // Call function directly

    const checkbox = document.getElementById('my_checkbox');
    expect(checkbox).to.exist;  // UI created?

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(settings.my_flag).to.be.true;  // Wiring works?
  });
});
```

**Run headlessly for CI:**
```bash
npm test  # Puppeteer runs tests, outputs results
```

### Why This Works

✅ **Tests against real ST** - Actually loaded and running in browser
✅ **Catches UI bugs** - Tests can verify elements exist
✅ **Catches wiring bugs** - Tests can trigger events and check settings
✅ **Catches integration bugs** - Tests call real ST functions
✅ **Simple for AI** - Test what AI just wrote, not ST's structure
✅ **Fully autonomous** - AI runs `npm test`, sees pass/fail
✅ **Fast enough** - ~10-20s for full test suite
✅ **No mocks** - Everything is real and loaded

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

## Implementation Guide

**Complete end-to-end workflow in [AI_DEVELOPMENT_WORKFLOW.md](./AI_DEVELOPMENT_WORKFLOW.md)**

### Quick Setup

**1. Install dependencies:**
```bash
npm install --save-dev puppeteer http-server
```

**2. Create test infrastructure:**
- `tests/index.html` - Loads ST + extension + test framework
- `tests/runner.js` - Headless test runner via Puppeteer
- `tests/tests/*.test.js` - Individual test files

**3. Add npm scripts:**
```json
{
  "scripts": {
    "test": "node tests/runner.js"
  }
}
```

### Test Pattern Example

```javascript
describe('Prompt Selector', () => {
  it('dropdown updates setting when changed', () => {
    setupPromptUI();  // Function AI just wrote

    const dropdown = document.getElementById('prompt_selector');
    dropdown.value = 'custom';
    dropdown.dispatchEvent(new Event('change'));

    // Did the wiring work?
    expect(extension_settings.auto_recap.profiles.default.prompt)
      .to.equal('custom');
  });

  it('code uses the selected prompt', async () => {
    extension_settings.auto_recap.profiles.default.prompt = 'custom';

    await generateRecap(0);

    // Did the code actually use the setting?
    expect(window.generateRaw.calls[0].prompt).to.include('custom');
  });
});
```

### AI Workflow

1. **Implement feature** - Write code normally
2. **Write tests** - Test what you just wrote
3. **Run tests** - `npm test`
4. **See failures** - "expected undefined to equal 'value'"
5. **Fix bugs** - Add missing wiring
6. **Run again** - Tests pass
7. **Commit** - Feature complete

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

## Detailed Documentation

### Complete Workflow Guide
**See [AI_DEVELOPMENT_WORKFLOW.md](./AI_DEVELOPMENT_WORKFLOW.md)** for:
- One-time setup instructions
- Step-by-step development workflow
- Test pattern examples
- Common failures and fixes
- Feature completion checklist

### Validation Results
**See [IMPLEMENTATION_REALITY_CHECK.md](./IMPLEMENTATION_REALITY_CHECK.md)** for:
- Why import-based testing failed (9.1% success rate)
- Technical root cause analysis
- Why runtime proxy was insufficient
- Decision rationale

### Architecture Details
**See [TESTING_ARCHITECTURE.md](./TESTING_ARCHITECTURE.md)** for:
- Detailed test infrastructure design
- Browser environment setup
- Test framework integration
- Advanced patterns and troubleshooting
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

**Tests run in real browser with real SillyTavern loaded.**

When AI makes mistakes:
- **Forgets UI element** → Test fails: "expected element to exist"
- **Forgets wiring** → Test fails: "expected setting to equal 'value'"
- **Uses wrong setting** → Test fails: "expected call to include 'custom'"
- **Breaks integration** → Test fails: workflow doesn't complete

**No imports, no mocks, no fantasy - just real code in real browser.**

### Critical Success Factors

1. ✅ **In-browser testing** - Loads real ST in real browser
2. ✅ **Direct function calls** - Tests what AI just wrote
3. ✅ **Headless automation** - Puppeteer runs tests autonomously
4. ✅ **Immediate feedback** - AI sees pass/fail in seconds
5. ✅ **Catches all bug types** - UI, wiring, integration, logic
6. ✅ **Simple for AI** - Standard describe/it/expect patterns

---

## Next Steps

1. **Read**: [TESTING_ARCHITECTURE.md](./TESTING_ARCHITECTURE.md) for complete implementation
2. **Setup**: Follow Phase 1-4 implementation guide
3. **Write**: Use test patterns and templates
4. **Run**: `npm test` after every change

Questions? Check the troubleshooting section or the detailed architecture doc.

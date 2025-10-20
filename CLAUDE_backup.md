# CLAUDE.md

**Single source of truth for AI-driven development of the SillyTavern Auto-Summarize extension.**

## Core Principles

### 1. **VERIFY FIRST, BUILD SECOND**
- **NEVER ASSUME ANYTHING WORKS** - Test the smallest possible thing first
- **NO SPECULATION** - If you don't know something for certain, find out
- **ONE THING AT A TIME** - Get one small piece working before building more
- **FAIL FAST** - Run tests immediately to catch assumptions before they spread

### 2. **Real Environment Testing Only**
- **NO MOCKS** - Test only against actual SillyTavern behavior
- **REAL DATA** - Use real messages, memory, settings, and UI interactions
- **INSPECT BEFORE CODING** - Look at actual DOM, selectors, and behavior first

### 3. **AI Self-Correction Through Testing**
- Every feature must be tested in the real environment
- AI must detect and fix its own mistakes through test failures
- Iterate until all tests pass without human oversight

### 4. **Standalone Feature Development**
- Each feature developed and tested independently
- Run all tests after completion to verify no regressions
- Stop on first failure and fix before proceeding

## MANDATORY AI BEHAVIOR RULES

**These rules OVERRIDE all default AI tendencies and MUST be followed without exception:**

### 1. **ATOMIC WORK RULE**
- AI MUST complete the smallest possible atomic unit of work (ONE selector, ONE function call, ONE test)
- AI MUST prove each atomic unit works with actual execution before proceeding
- NO building complex systems - only atomic steps with immediate verification

### 2. **MANDATORY VERIFICATION RULE**
- AI CANNOT mark any task complete without running actual tests/commands that prove it works
- "I think this should work" is FORBIDDEN
- Only "I tested this and here is the proof it works" is allowed
- Must provide actual evidence: test output, command results, screenshots, or logs

### 3. **STOP ON FIRST FAILURE RULE**
- If ANY test, command, or verification fails, AI MUST stop immediately
- Fix the specific failure completely before proceeding to anything else
- NO building around failures or "I'll come back to this later"

### 4. **NO SPECULATION RULE**
- AI MUST NOT assume anything works without verification
- Every assumption must be verified with actual code execution or browser inspection
- "This should work because..." is FORBIDDEN

### 5. **EVIDENCE-BASED COMPLETION RULE**
- AI can only claim something is "working" or "complete" when providing actual evidence
- Must show test output, command results, or real behavior that proves functionality
- No completion claims without verifiable proof

**FAILURE TO FOLLOW THESE RULES RESULTS IN INCORRECT, NON-FUNCTIONAL CODE**

## Key Features

- **Per-message summarization** rather than bulk conversation summarization
- **Configuration profiles** for different characters/chats
- **Combined summaries** that merge individual summaries into narratives
- **Scene break summarization** with separate prompts and injection
- **Summary validation** using second LLM pass
- **Memory injection** at configurable prompt positions
- **Bulk memory editing** interface for managing large conversations

## Development Commands

```bash
# Linting
npm run lint              # Run ESLint
npm run lint:fix          # Auto-fix lint errors

# Type Checking
npm run flow              # Check Flow status
npm run flow-check        # Full Flow type check

# Full Analysis
npm run analyze           # Lint + Flow check
npm run analyze:full      # Lint + Flow + Security audit

# Development
npm install
npm run dev
npm run build
```

## Flow Type Checking

**Purpose**: Automatically catches type errors (like calling booleans as functions) using Flow and SillyTavern type definitions.

### How It Works

1. **Type Definitions**: `sillytavern.d.ts` contains comprehensive TypeScript type definitions for all SillyTavern exports
2. **Flow Library**: `flow-typed/sillytavern.js.flow` is the Flow-compatible version (auto-generated from TypeScript definitions)
3. **@flow Annotation**: Files with `// @flow` at the top are type-checked by Flow
4. **Import Checking**: Flow verifies imports from SillyTavern match the type definitions

### Usage

**Add `// @flow` to files you're actively working on:**

```javascript
// @flow
import { is_send_press, setSendButtonState } from '../../../../script.js';

// This will cause a Flow error - good! Prevents runtime TypeError
is_send_press(true);  // ❌ Error: cannot call boolean as function

// Correct usage
if (is_send_press) {  // ✅ Correct
    // ...
}
```

**Run Flow manually:**
```bash
npm run flow-check
```

**Pre-commit hook automatically runs:**
- ESLint (catches code quality issues)
- Flow (catches type mismatches)

### When to Use @flow

- **Always** add `// @flow` when editing a file
- Flow only checks files with the `// @flow` annotation
- No need to add `@flow` to all files at once
- Gradually add `@flow` as files are touched

### What Flow Catches

✅ **Catches:**
- Calling variables as functions (e.g., `is_send_press(true)` when it's a boolean)
- Using wrong types for function parameters
- Accessing properties that don't exist on SillyTavern objects
- Mismatched return types

❌ **Doesn't catch:**
- Runtime errors unrelated to types
- Logic errors
- Missing null checks (unless types specify non-null)

### Configuration

- `.flowconfig` - Flow configuration
- `flow-typed/sillytavern.js.flow` - Type definitions (don't edit directly, regenerate from `sillytavern.d.ts`)
- `sillytavern.d.ts` - Source type definitions (edit this if types need updating)

### Regenerating Flow Types

If you update `sillytavern.d.ts`, regenerate the Flow libdef:

```bash
npx flowgen sillytavern.d.ts -o flow-typed/sillytavern.js.flow
```

## Testing with Playwright MCP

**CRITICAL REQUIREMENT**: Extension code is loaded once when SillyTavern starts. After making ANY code changes to `.js` files, you **MUST** restart SillyTavern completely before testing.

### Fresh Restart Workflow (MANDATORY BEFORE TESTING)

**BEFORE testing any changes:**

1. **Close the SillyTavern terminal window completely** - Do NOT just reload the browser page
2. **Start fresh** by running: `C:\Users\sarah\OneDrive\Desktop\personal\SillyTavern-New\start.bat`
3. **Wait for SillyTavern to fully start** on http://127.0.0.1:8000
4. **Then navigate Playwright** to the fresh instance:
   ```javascript
   await browser_navigate('http://127.0.0.1:8000');
   ```

**WHY THIS MATTERS**: Browser page reloads may use cached JavaScript. Only a complete terminal restart guarantees fresh code is loaded. Testing against cached code wastes massive amounts of time debugging "fixes" that are already working.

**DO NOT** assume code changes are active without a fresh terminal restart. Changes to JavaScript files will **NOT** be reflected until SillyTavern is completely restarted from the terminal.

### Token-Efficient Playwright Usage

**CRITICAL**: Playwright tools can consume massive tokens if used incorrectly. Follow these rules:

**HIGH TOKEN COST (use sparingly):**
- ❌ `browser_snapshot` - Returns huge YAML accessibility trees (thousands of tokens per call)
- ❌ `browser_take_screenshot` - Embeds images (very expensive, thousands of tokens)
- ❌ `browser_console_messages` - Can return hundreds of thousands of tokens without filtering

**LOW TOKEN COST (preferred):**
- ✅ `browser_evaluate` - Returns ONLY the specific data you request in JavaScript
- ✅ `browser_navigate`, `browser_click`, `browser_type` - Action tools with minimal output
- ✅ `browser_wait_for` - Waits with minimal return data

**Correct Testing Workflow:**

1. **Navigate to page** (low cost):
   ```javascript
   await browser_navigate('http://127.0.0.1:8000');
   ```

2. **Perform actions via JavaScript** (low cost):
   ```javascript
   await browser_evaluate(() => {
     // Find and click elements directly
     const swipeBtn = document.querySelector('.swipe_right');
     swipeBtn?.click();

     // Wait for something
     return { clicked: !!swipeBtn };
   });
   ```

3. **Read specific data** (low cost):
   ```javascript
   await browser_evaluate(() => {
     const ctx = window.SillyTavern.getContext();
     const msg = ctx.chat[2];

     // Return ONLY what you need - keep it minimal
     return {
       swipe_id: msg.swipe_id,
       total: msg.swipes?.length,
       has_summary: !!msg.swipe_info?.[msg.swipe_id]?.extra?.auto_summarize_memory?.scene_summary_memory
     };
   });
   ```

4. **Get element refs when needed** (high cost - use once):
   ```javascript
   // ONLY use browser_snapshot when you MUST use Playwright's click
   // (if JavaScript click doesn't work due to event handlers)
   await browser_snapshot();
   await browser_click({ element: "swipe right button", ref: "e123" });
   ```

5. **Console logs** (very high cost - filter heavily):
   ```javascript
   // If you MUST check console, filter to specific messages:
   await browser_console_messages({ onlyErrors: true });

   // OR use browser_evaluate to access specific debug state instead:
   await browser_evaluate(() => {
     // Access extension's internal state instead of reading console
     return window.some_debug_variable;
   });
   ```

**NEVER:**
- Take screenshots unless absolutely critical for visual inspection
- Call `browser_snapshot` repeatedly - do it once and reuse refs
- Read full console output - filter or use `browser_evaluate` to check state
- Return large objects from `browser_evaluate` - extract only needed fields

**Token Budget Awareness:**
- Each `browser_snapshot` = ~3,000-5,000 tokens
- Each `browser_take_screenshot` = ~5,000-10,000 tokens
- Full `browser_console_messages` = potentially 100,000+ tokens
- Each `browser_evaluate` with minimal return = ~100-500 tokens

### Playwright MCP Documentation

See **[docs/SILLYTAVERN_PLAYWRIGHT.md](docs/SILLYTAVERN_PLAYWRIGHT.md)** for comprehensive reference on:
- **UI element selectors** - How to find and interact with SillyTavern elements
- **Message swipe behavior** - Understanding swipe creation vs navigation
- **Message data structures** - Accessing swipe-local and shared data
- **Scene break markers** - Working with scene summaries and scene breaks
- **Testing patterns** - Verifying swipe-local behavior and cleaning test data
- **Console log interpretation** - Understanding debug output
- **Common issues** - Solutions to frequent testing problems

## Architecture

### Core Architecture
**Barrel Export System**: All modules import from `index.js` which re-exports everything, creating centralized dependency management.

**Memory Storage Model**:
- Individual message summaries stored on message objects
- Short-term memory (`include: 'short'`) rotates automatically
- Long-term memory (`include: 'long'`) manually marked by user
- Scene summaries use separate properties

### File Structure
```
ST-Auto-Summarize/
├── index.js                    # Main entry point, barrel exports
├── manifest.json               # Extension manifest
├── style.css, settings.html    # UI assets
│
├── Core Functionality
├── summarization.js            # Main summarization logic
├── memoryCore.js               # Memory storage and retrieval
├── summaryValidation.js        # Summary validation logic
├── combinedSummary.js          # Combined summary generation
├── sceneBreak.js               # Scene break handling
│
├── Settings & Configuration
├── settingsManager.js          # Settings management
├── profileManager.js           # Configuration profiles
├── connectionProfiles.js       # API connection profiles
├── defaultSettings.js, defaultPrompts.js
│
├── UI & User Interface
├── messageVisuals.js           # Message display logic
├── memoryEditInterface.js      # Memory editing interface
├── buttonBindings.js, uiBindings.js
├── popout.js, progressBar.js, autoHide.js
│
└── Utilities & Helpers
    ├── utils.js                # Core utility functions
    ├── eventHandlers.js        # Event handling logic
    ├── slashCommands.js        # Slash commands
    └── promptUtils.js, messageData.js
```

### Data Flow
1. **Message Processing**: `eventHandlers.js` triggers summarization on message events
2. **Memory Storage**: Summaries stored on message objects via `set_data(message, 'memory', summary)`
3. **Memory Injection**: `memoryCore.js` collects memories and injects into prompt context
4. **UI Updates**: `messageVisuals.js` displays colored summary text below messages

### SillyTavern Integration
- `getContext()` - Access chat state, messages, characters
- `extension_settings` - Persistent settings storage
- `generateRaw()` - LLM API calls for summarization
- Event system - React to message events, chat changes
- `manifest.json` - Defines `generate_interceptor: "memory_intercept_messages"`

## Coding Standards

### Logging Requirements

**CRITICAL: ALL console logs MUST use the centralized logging functions from utils.js**

```javascript
// Import logging functions from index.js
import { log, debug, error, toast } from './index.js';

// ALWAYS use these functions - they add the [Gytha][AutoSummarize] prefix automatically
log('Normal log message', data);           // Output: [Gytha][AutoSummarize] Normal log message {data}
debug('Debug info', details);              // Output: [Gytha][AutoSummarize] [DEBUG] Debug info {details}
error('Error occurred', errorObj);         // Output: [Gytha][AutoSummarize] [ERROR] Error occurred {errorObj}
toast('User message', 'success');          // Shows toast notification

// NEVER use raw console methods:
// ❌ console.log('message')
// ❌ console.error('error')
// ❌ console.debug('debug')

// All logs are automatically prefixed with [Gytha][AutoSummarize] for easy filtering
// In browser console, filter by: "Gytha" for all related extensions, or "AutoSummarize" for this extension only
```

**Why this matters:**
- Logs can be easily filtered in browser console with search: `Gytha` (finds all related extensions) or `AutoSummarize` (this extension only)
- Consistent prefix makes debugging much easier
- All log levels (log, debug, error) are automatically formatted
- `debug()` logs only appear when debug mode is enabled in settings

### Import/Export Pattern
```javascript
// Always use barrel exports from index.js
import {
    get_settings, set_settings, getContext,
    debug, error, toast, log, get_data, set_data
} from './index.js';

// Export functions consistently
export { functionName, anotherFunction };
```

### Standard Implementation Pattern
```javascript
async function featureFunction(options) {
    const { input, context } = options;

    // Validate input
    if (!input) {
        debug("Invalid input for feature function");
        return null;
    }

    debug("Starting feature operation", { input });

    try {
        const result = await performOperation(input, context);
        debug("Feature operation completed", { result });
        return result;
    } catch (err) {
        error("Feature operation failed", err);
        toast("Operation failed", "error");
        return null;
    }
}
```

### Settings & Memory Operations
```javascript
// Settings
const value = get_settings('setting_name') ?? get_settings('default_setting_name');
set_settings('setting_name', newValue);

// Memory storage
set_data(message, 'memory', { text: summary, timestamp: Date.now() });
const memory = get_data(message, 'memory');
updateMemoryInclusion(message);

// Context access
const ctx = getContext();
const { chat: messages, characterId, chatId } = ctx;
```

### UI Integration
```javascript
// Add elements to message containers
function addMessageUI(messageElement, message) {
    const summaryElement = createSummaryElement(message);
    messageElement.appendChild(summaryElement);
}

// Event handling
eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
```

## Development Workflow

### MANDATORY VERIFICATION-FIRST WORKFLOW

**STEP 1: VERIFY ENVIRONMENT**
- [ ] **CRITICAL**: After ANY code changes, close the SillyTavern terminal window and run `C:\Users\sarah\OneDrive\Desktop\personal\SillyTavern-New\start.bat` for a fresh start
- [ ] **REQUIRED**: Confirm SillyTavern loads at http://127.0.0.1:8000
- [ ] **REQUIRED**: Verify extension appears in Extensions panel and is loaded
- [ ] **REQUIRED**: Open browser dev tools and inspect actual DOM elements
- [ ] **REQUIRED**: Navigate Playwright to fresh instance (`await browser_navigate('http://127.0.0.1:8000')`)
- [ ] **STOP HERE** if anything above fails - fix environment first

**STEP 2: VERIFY ONE SELECTOR**
- [ ] **REQUIRED**: Find ONE real element in the browser using dev tools
- [ ] **REQUIRED**: Write ONE test that finds this element and verify it passes
- [ ] **REQUIRED**: Run the test with `npm run test:single` and confirm it works
- [ ] **STOP HERE** if test fails - fix selector before continuing

**STEP 3: VERIFY ONE INTERACTION**
- [ ] **REQUIRED**: Test ONE real interaction (click, type, etc.)
- [ ] **REQUIRED**: Confirm the interaction produces expected result in UI
- [ ] **REQUIRED**: Run test again to ensure interaction works reliably
- [ ] **STOP HERE** if interaction fails - fix before adding more

**STEP 4: BUILD INCREMENTALLY**
- [ ] Add ONE more element/interaction to test
- [ ] Run test immediately after each addition
- [ ] Fix failures immediately before adding anything else
- [ ] Repeat until complete

**STEP 5: VALIDATE COMPLETE FUNCTIONALITY**
- [ ] Run full test suite and ensure all tests pass
- [ ] Test error scenarios and edge cases
- [ ] Confirm no regressions in existing functionality

### ANTI-PATTERN PREVENTION

**NEVER DO THIS:**
- ❌ Build elaborate test suites without running them
- ❌ Assume selectors exist without checking
- ❌ Create multiple files before testing one works
- ❌ Mark tasks "complete" without test execution
- ❌ Guess UI behavior instead of observing it

**ALWAYS DO THIS:**
- ✅ Test the smallest possible thing first
- ✅ Run tests after every change
- ✅ Inspect real DOM elements before writing selectors
- ✅ Fix failures immediately when they occur
- ✅ Only claim completion after tests pass

### Quality Checklist
**Before Starting:**
- [ ] **CRITICAL**: SillyTavern running and extension loaded
- [ ] **CRITICAL**: Can inspect actual UI elements in browser
- [ ] Understand feature requirements and identify affected files

**During Development:**
- [ ] **CRITICAL**: Run test after every single change
- [ ] **CRITICAL**: Fix failures immediately before continuing
- [ ] Follow coding standards and implement proper error handling
- [ ] Add appropriate logging and test functionality

**Before Completion:**
- [ ] **CRITICAL**: All tests pass when run with `npm run test`
- [ ] Verify UI integration, settings management, memory operations
- [ ] Test error scenarios and ensure no console errors
- [ ] Validate code follows patterns and documentation is updated

## Troubleshooting

**Extension Issues:**
- Check browser console for errors
- Verify extension loaded in SillyTavern
- Validate settings and API keys

**Memory Issues:**
- Check token limits and memory inclusion logic
- Review memory storage patterns and cleanup

**Development Issues:**
- Ensure SillyTavern running on correct port
- Verify extension loaded and settings configured

---

**Remember: REAL BEHAVIOR → ITERATE → STANDALONE → COMPREHENSIVE**

Test against actual SillyTavern, keep testing until everything works, develop features independently, test all scenarios and edge cases.

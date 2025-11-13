# CRITICAL FINDINGS: ConnectionManagerRequestService Event System Bypass

**Status**: BLOCKING ISSUE DISCOVERED
**Date**: 2025-01-08
**Severity**: HIGH - Event system incompatibility found

## Executive Recap

During deep-dive investigation, a **CRITICAL INCOMPATIBILITY** was discovered with ConnectionManagerRequestService:

**ConnectionManagerRequestService DOES NOT emit `CHAT_COMPLETION_PROMPT_READY` event**, which our extension relies on for metadata injection in user chat messages.

This is NOT a show-stopper for extension operations, but reveals architecture complexity that was underestimated.

---

## CRITICAL FINDING #1: Event System Bypass

### Current Event Flow (generateRaw)

**User sends chat message**:
```
User types message
  ↓
ST's Generate() function
  ↓
generateRaw() (script.js:3190)
  ↓
sendOpenAIRequest() (openai.js:2272)
  ↓
Line 1533: await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData)
  ↓
OUR EVENT HANDLER RUNS (eventHandlers.js:297)
  ↓
Metadata injected into chat array
  ↓
Backend request sent
```

**Extension operation (current)**:
```
Extension operation
  ↓
generateRaw() (intercepted)
  ↓
Interceptor injects metadata (generateRawInterceptor.js:42-55)
  ↓
sendOpenAIRequest() (openai.js:2272)
  ↓
Line 1533: Event emitted (but we skip it - see eventHandlers.js:325-330)
  ↓
Backend request sent
```

### ConnectionManagerRequestService Flow

**Extension operation (proposed)**:
```
Extension operation
  ↓
ConnectionManagerRequestService.sendRequest() (shared.js:383)
  ↓
ChatCompletionService.processRequest() (custom-request.js:535)
  ↓
ChatCompletionService.sendRequest() (custom-request.js:453)
  ↓
fetch('/api/backends/chat-completions/generate') - DIRECT TO BACKEND
  ↓
❌ NO EVENT EMITTED ❌
```

### Verified Facts

**openai.js:1533** - ONLY place CHAT_COMPLETION_PROMPT_READY is emitted:
```javascript
const eventData = { chat, dryRun };
await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);
```

**custom-request.js** - Verified via grep:
```bash
$ grep "CHAT_COMPLETION_PROMPT_READY" custom-request.js
# NO RESULTS
```

**Conclusion**: ConnectionManagerRequestService bypasses the entire event system.

---

## Our Event Handler Analysis

### eventHandlers.js:297-364

```javascript
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
  // Check if injection is enabled
  const enabled = get_settings('first_hop_proxy_send_chat_details');
  if (!enabled) {return;}

  // Process the chat array
  if (promptData && Array.isArray(promptData.chat)) {
    // Check if an extension operation is already in progress
    const operationSuffix = getOperationSuffix();

    if (operationSuffix !== null) {
      // Extension operation in progress - interceptor handles it
      debug('[Interceptor] Extension operation in progress, skipping');
      return;  // ← SKIP event-based injection for extension operations
    }

    // Only for user/character messages
    const messageIndex = (context?.chat?.length ?? 0) - 1;
    let operation = `chat-${messageIndex}`;

    injectMetadataIntoChatArray(promptData.chat, { operation });
  }
});
```

### What This Event Handler Does

1. **User chat messages**: Injects metadata with operation `chat-{index}`
2. **Extension operations**: SKIPS (lines 325-330) because interceptor already handled it

### Impact Assessment

**User chat messages**:
- ✅ Still use ST's normal flow (generateRaw → sendOpenAIRequest)
- ✅ Event fires
- ✅ Our handler runs
- ✅ Metadata injected
- **NO IMPACT** - User chats unaffected

**Extension operations (with ConnectionManagerRequestService)**:
- ❌ Event does NOT fire
- ❌ Event handler does NOT run
- ✅ BUT we inject metadata manually before calling (in llmClient.js)
- **MITIGATION WORKS** - Manual injection compensates

**Extension operations (generateRaw with interceptor - current)**:
- ✅ Interceptor injects metadata
- ✅ Event fires but handler skips (line 325-330 guard)
- ✅ Metadata already injected by interceptor
- **CURRENT STATE WORKS**

---

## CRITICAL FINDING #2: Dual Injection Path Complexity

We currently have **TWO SEPARATE METADATA INJECTION PATHS**:

### Path 1: Interceptor (for extension operations)

**File**: generateRawInterceptor.js:15-74

```javascript
export async function wrappedGenerateRaw(options) {
  if (options && options.prompt) {
    const baseOperation = determineOperationType();  // Stack trace analysis
    const suffix = getOperationSuffix();
    const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;

    if (typeof options.prompt === 'string') {
      const processedPrompt = injectMetadata(options.prompt, { operation });
      options.prompt = processedPrompt;
    } else if (Array.isArray(options.prompt)) {
      injectMetadataIntoChatArray(options.prompt, { operation });
    }
  }

  return await _importedGenerateRaw(options);
}
```

**Operation type**: Determined from **stack trace analysis**
**Activated**: When extension calls `generateRaw()`

### Path 2: Event Handler (for user chat messages)

**File**: eventHandlers.js:297-364

```javascript
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
  const operationSuffix = getOperationSuffix();

  if (operationSuffix !== null) {
    // Extension operation - skip (interceptor handled it)
    return;
  }

  // User chat message
  const messageIndex = (context?.chat?.length ?? 0) - 1;
  let operation = `chat-${messageIndex}`;

  injectMetadataIntoChatArray(promptData.chat, { operation });
});
```

**Operation type**: Calculated as `chat-{index}` or `chat-{index}-swipe{n}`
**Activated**: When user sends chat message via ST's normal flow

### Why Two Paths?

1. **Extension operations**: Use stack trace to identify operation type (recap, scene, lorebook, etc.)
2. **User chat messages**: Use message index to identify which chat message

**Both paths** ultimately call `injectMetadataIntoChatArray()` from metadataInjector.js.

---

## Migration Impact

### If We Use ConnectionManagerRequestService

**Extension operations** would need to:
1. **NO LONGER use interceptor** (ConnectionManagerRequestService doesn't call generateRaw)
2. **Manually inject metadata** BEFORE calling ConnectionManagerRequestService
3. **Pass operation type explicitly** (can't use stack trace - not in call stack anymore)

**User chat messages** would:
- Continue using ST's normal flow (generateRaw → sendOpenAIRequest)
- Event fires normally
- Event handler runs normally
- **NO CHANGES NEEDED**

### New Architecture

```javascript
// llmClient.js (new module)
export async function sendLLMRequest(options) {
  const {
    prompt,
    operationType,  // ← MUST BE PASSED EXPLICITLY
    profileName,
    maxTokens,
  } = options;

  // Inject metadata BEFORE calling API
  let promptWithMetadata;
  if (typeof prompt === 'string') {
    promptWithMetadata = injectMetadata(prompt, { operation: operationType });
  } else if (Array.isArray(prompt)) {
    promptWithMetadata = [...prompt];
    injectMetadataIntoChatArray(promptWithMetadata, { operation: operationType });
  }

  // Call ConnectionManagerRequestService with metadata already injected
  const result = await ctx.ConnectionManagerRequestService.sendRequest(
    profileId,
    promptWithMetadata,
    maxTokens,
    { /* options */ }
  );

  return result;
}
```

**Key Changes**:
1. Operation type MUST be passed as parameter (no more stack trace analysis)
2. Metadata injected BEFORE API call (not during)
3. Event system not used for extension operations

---

## CRITICAL FINDING #3: Operation Type Detection Breaks

### Current Stack Trace Analysis

**File**: generateRawInterceptor.js:121-179

```javascript
function determineOperationType() {
  try {
    const stack = new Error('Stack trace').stack || '';

    // Check for specific operations (order matters!)
    if (stack.includes('detectSceneBreak')) return 'detect_scene_break';
    if (stack.includes('generateSceneRecap')) return 'generate_scene_recap';
    if (stack.includes('SceneName')) return 'generate_scene_name';
    // ... more checks ...
    if (stack.includes('recap_text')) return 'recap';

    return 'chat';
  } catch {
    return 'unknown';
  }
}
```

**Why this works**: `generateRaw()` is called from within our extension functions, so their names appear in the stack.

### With ConnectionManagerRequestService

**Call stack would be**:
```
sendLLMRequest() (llmClient.js)
  ↓
ConnectionManagerRequestService.sendRequest()
  ↓
ChatCompletionService.processRequest()
  ↓
Backend
```

**Problem**: Original caller (`detectSceneBreak`, `recap_text`, etc.) **NOT in stack** because:
- They called `sendLLMRequest()`
- `sendLLMRequest()` called ConnectionManagerRequestService
- ConnectionManagerRequestService doesn't call back into our code

**Stack trace would only show**:
- `sendLLMRequest`
- `ConnectionManagerRequestService.sendRequest`
- `ChatCompletionService.processRequest`

**Operation-specific function names MISSING** from stack!

### Solution

**MUST pass operation type explicitly**:

```javascript
// OLD (implicit from stack):
await generateRaw({ prompt });  // Interceptor determines type from stack

// NEW (explicit parameter):
await sendLLMRequest({
  prompt,
  operationType: 'detect_scene_break',  // ← MUST SPECIFY
  profileName,
});
```

**Every call site** must be updated to pass operation type.

---

## CRITICAL FINDING #4: operationContext.js Complexity

### Current System: operationContext.js

```javascript
let currentSuffix = null;

export function setOperationSuffix(suffix) {
  currentSuffix = suffix;
}

export function getOperationSuffix() {
  return currentSuffix;
}

export function clearOperationSuffix() {
  currentSuffix = null;
}
```

**Used for**: Adding context to operation type (e.g., `recap-42-67` for message range)

**Pattern**:
```javascript
setOperationSuffix('-42-67');
try {
  await generateRaw(...);  // Interceptor reads suffix via getOperationSuffix()
} finally {
  clearOperationSuffix();
}
```

### With ConnectionManagerRequestService

**Pattern must change**:
```javascript
// OLD:
setOperationSuffix('-42-67');
await generateRaw(...);
clearOperationSuffix();

// NEW:
const operation = `recap${'-42-67'}`;  // Build full operation string
await sendLLMRequest({ operationType: operation, ... });
// No context management needed
```

**Impact**:
- Simpler (no global state for context)
- But requires updating all 15+ call sites that use operationContext

---

## Compatibility Matrix

| Feature | Current (generateRaw) | Proposed (ConnectionManagerRequestService) |
|---------|----------------------|-------------------------------------------|
| User chat metadata injection | ✅ Via event handler | ✅ Via event handler (unchanged) |
| Extension operation metadata | ✅ Via interceptor | ✅ Via manual injection |
| Operation type detection | ✅ Stack trace analysis | ❌ Must pass explicitly |
| Operation context suffix | ✅ Global state | ⚠️ Build into operation string |
| Profile switching | ❌ 500ms delay, global state | ✅ No delay, no global state |
| Event system compatibility | ✅ Events fire | ❌ Events bypassed |
| Interceptor compatibility | ✅ Works | ❌ Bypassed entirely |

---

## Updated Risk Assessment

### NEW RISKS DISCOVERED

#### Risk: Event System Dependencies Unknown
**Likelihood**: Medium
**Impact**: High

**Scenario**: Other parts of our code or other extensions rely on CHAT_COMPLETION_PROMPT_READY event firing for extension operations.

**Mitigation**:
- Audit all event listeners in our code
- Test with other extensions active
- Document that extension operations no longer fire events

#### Risk: Operation Type Detection Refactor
**Likelihood**: High
**Impact**: Medium

**Scenario**: Must update every LLM call site to pass operation type explicitly.

**Count**: 30+ files, potentially 100+ call sites

**Mitigation**:
- Use TypeScript/JSDoc to enforce operationType parameter
- Grep for all `sendLLMRequest` calls and verify
- Gradual migration with feature flag

#### Risk: operationContext Pattern Change
**Likelihood**: High
**Impact**: Low

**Scenario**: 15+ call sites use setOperationSuffix/clearOperationSuffix pattern.

**Mitigation**:
- Update all call sites to build operation string directly
- Remove operationContext.js after migration

---

## Updated Recommendations

### DO NOT PROCEED without addressing:

1. ✅ **Event system bypass** - Understood, mitigated by manual injection
2. ⚠️ **Operation type detection** - Requires explicit passing (30+ files to update)
3. ⚠️ **operationContext refactor** - Requires updating 15+ call sites
4. ❓ **Unknown event dependencies** - Need to audit

### MUST VERIFY before pilot:

1. **All event listeners** in our extension
2. **All uses of operationContext.js**
3. **All LLM call sites** and their operation types
4. **Other extensions'** reliance on events (if any)

### Pilot Phase Requirements

**Before starting pilot**:
1. Complete audit of event system usage
2. Map all LLM call sites and operation types
3. Design explicit operation type enum/constants
4. Plan operationContext.js removal

**Pilot implementation**:
1. Create llmClient.js with explicit operation types
2. Update ONE module (lorebookEntryMerger.js)
3. Verify metadata injection works
4. Verify no event-related breakage

---

## Conclusion

The migration is **TECHNICALLY VIABLE** and **MORE FEASIBLE** than initially assessed.

**⚠️ SCOPE CORRECTED (2025-01-08)**: Comprehensive verification revealed original analysis significantly overestimated refactor scope. See VERIFICATION_REPORT.md for complete audit.

**Critical findings** (VERIFIED):
- Event system bypass (understood, mitigatable)
- Operation type must be explicit (**8-10 file refactor**, NOT 30+)
- operationContext pattern must change (**9 files**, NOT 15+ call sites)
- **NO EXISTING TESTS TO UPDATE** (0 tests exist, NOT 100+)

**Estimated effort** (CORRECTED):
- Development: **40-50 hours** (was ~~80~~) - **45% reduction**
- Testing: **10-15 hours** (was ~~40~~) - **63% reduction**
- **Total: 50-65 hours** (was ~~120~~) - **45% REDUCTION**

**Benefits remain**:
- 500ms delay elimination
- No UI flicker
- Concurrent operations possible

**Recommendation** (CORRECTED): **PILOT FIRST** - with corrected scope:
1. Audit phase (5 hours) - event/error/streaming analysis
2. Design phase (5 hours) - llmClient API, operation types
3. Pilot implementation (5-10 hours) - ONE module migration
4. **Total pilot: 15-20 hours** (NOT 40)

If pilot validates approach → Proceed with full migration (35-45 more hours)
If pilot reveals more issues → Re-assess or abort (15-20 hours sunk, NOT 40)

---

## Appendix: Event System Audit Checklist

- [ ] List all `eventSource.on()` calls in our extension
- [ ] List all `eventSource.emit()` calls in our extension
- [ ] Document which events we listen to
- [ ] Document which events we emit
- [ ] Verify CHAT_COMPLETION_PROMPT_READY is only user chat dependency
- [ ] Check if other extensions listen to this event
- [ ] Test with other extensions enabled

---

## Appendix: LLM Call Site Inventory

Need to map all call sites and their operation types:

**recapping.js**:
- `recap_text()` → operation: `recap` (with optional suffix)

**lorebookEntryMerger.js**:
- `callAIForMerge()` → operation: `merge_lorebook_entry`
- `lookupLorebookEntry()` → operation: `lorebook_entry_lookup`
- `resolveLorebookEntry()` → operation: `resolve_lorebook_entry`

**autoSceneBreakDetection.js**:
- `detectSceneBreak()` → operation: `detect_scene_break`

**runningSceneRecap.js**:
- `generate_running_scene_recap()` → operation: `generate_running_recap`
- `combine_scene_with_running_recap()` → operation: `combine_scene_with_running`

**sceneBreak.js**:
- `generateSceneRecap()` → operation: `generate_scene_recap`
- `generateSceneName()` → operation: `generate_scene_name`

**recapValidation.js**:
- `validateRecap()` → operation: `validate_recap`

**recapToLorebookProcessor.js**:
- Various → operation: `recap_to_lorebook_*` (need to map)

**(Continue mapping remaining modules...)**

---

**END OF DOCUMENT**

*Original findings documented 2025-01-08. Scope corrections applied 2025-01-08 after comprehensive verification (see VERIFICATION_REPORT.md). Core technical findings remain accurate; effort estimates corrected to reflect actual file/call site counts.*

# Technical Issue Traces - End-to-End Analysis

This document provides complete end-to-end traces of each technical issue with the ConnectionManagerRequestService migration proposal, backed by actual code analysis.

## Table of Contents

1. [Event System Bypass](#1-event-system-bypass)
2. [Stack Trace Analysis Incompatibility](#2-stack-trace-analysis-incompatibility)
3. [Dual Injection Path Complexity](#3-dual-injection-path-complexity)
4. [operationContext Pattern Incompatibility](#4-operationcontext-pattern-incompatibility)
5. [Metadata Injection Mechanism](#5-metadata-injection-mechanism)
6. [Connection Profile Switching](#6-connection-profile-switching)

---

## 1. Event System Bypass

### 1.1 Current Flow: User Chat Message

**Complete Trace:**

```
User types message in SillyTavern
    ↓
[ST Core] Message processing begins
    ↓
[ST Core] openai.js::sendOpenAIRequest() (lines ~1400-1538)
    ↓
[ST Core] Builds ChatCompletion object
    ↓
[ST Core] Line 1533: eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData)
    ↓
[Extension] eventHandlers.js::line 297: Event handler receives event
    ↓
[Extension] eventHandlers.js::line 304: Check if metadata injection enabled
    |   const enabled = get_settings('first_hop_proxy_send_chat_details');
    ↓
[Extension] eventHandlers.js::line 322: Check if extension operation in progress
    |   const operationSuffix = getOperationSuffix();
    |   if (operationSuffix !== null) { return; }  // Skip, interceptor handles it
    ↓
[Extension] eventHandlers.js::line 334: Calculate message index
    |   const messageIndex = (context?.chat?.length ?? 0) - 1;
    ↓
[Extension] eventHandlers.js::line 342: Build operation string
    |   let operation = `chat-${messageIndex}`;
    |   if (swipeId > 0) { operation += `-swipe${swipeId + 1}`; }
    ↓
[Extension] eventHandlers.js::line 348: Inject metadata
    |   injectMetadataIntoChatArray(promptData.chat, { operation });
    ↓
[Extension] metadataInjector.js::line 127: injectMetadataIntoChatArray()
    |   - Finds/creates system message
    |   - Prepends metadata block
    ↓
[ST Core] Request continues to backend with metadata
```

**Code Evidence:**

```javascript
// openai.js:1533 (ST Core)
const eventData = { chat, dryRun };
await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);
```

```javascript
// eventHandlers.js:297 (Extension)
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
    await on_chat_event('chat_completion_prompt_ready', promptData);

    try {
        debug('[Interceptor] CHAT_COMPLETION_PROMPT_READY handler started');

        // Check if injection is enabled
        const enabled = get_settings('first_hop_proxy_send_chat_details');
        if (!enabled) { return; }

        // Check if an extension operation is already in progress
        const operationSuffix = getOperationSuffix();
        if (operationSuffix !== null) {
            // The generateRawInterceptor will handle metadata injection
            debug('[Interceptor] Extension operation in progress, skipping chat-{index} metadata');
            return;
        }

        // Calculate message index
        const context = getContext();
        const messageIndex = (context?.chat?.length ?? 0) - 1;

        // Build operation string
        let operation = `chat-${messageIndex}`;
        const lastMessage = context.chat[messageIndex];
        const swipeId = lastMessage?.swipe_id ?? 0;
        if (swipeId > 0) {
            operation += `-swipe${swipeId + 1}`;
        }

        // Inject metadata
        injectMetadataIntoChatArray(promptData.chat, { operation });
    } catch (err) {
        debug('[Interceptor] Error:', String(err));
    }
});
```

### 1.2 Current Flow: Extension Operation

**Complete Trace:**

```
Extension calls recap_text()
    ↓
[Extension] recapping.js::line 95 or 106: Call generateRaw()
    |   await generateRaw({ prompt: prompt_input, ... })
    ↓
[Extension] generateRawInterceptor.js::line 15: wrappedGenerateRaw() called
    ↓
[Extension] generateRawInterceptor.js::line 30: Determine operation type from stack
    |   const baseOperation = determineOperationType();
    |   // Stack trace shows "recap_text" → returns "recap"
    ↓
[Extension] generateRawInterceptor.js::line 33: Get operation suffix from global state
    |   const suffix = getOperationSuffix();  // e.g., "-42-67"
    |   const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;
    |   // Result: "recap-42-67"
    ↓
[Extension] generateRawInterceptor.js::line 42 or 53: Inject metadata
    |   if (typeof options.prompt === 'string') {
    |       options.prompt = injectMetadata(options.prompt, { operation });
    |   } else if (Array.isArray(options.prompt)) {
    |       injectMetadataIntoChatArray(options.prompt, { operation });
    |   }
    ↓
[Extension] generateRawInterceptor.js::line 66: Call original generateRaw
    |   return await _importedGenerateRaw(options);
    ↓
[ST Core] generateRaw continues as normal
    ↓
[ST Core] Eventually calls sendOpenAIRequest()
    ↓
[ST Core] Line 1533: Emits CHAT_COMPLETION_PROMPT_READY
    ↓
[Extension] eventHandlers.js::line 297: Event handler receives event
    ↓
[Extension] eventHandlers.js::line 322: Check operationSuffix
    |   const operationSuffix = getOperationSuffix();  // Still set!
    |   if (operationSuffix !== null) { return; }      // EXIT HERE
    ↓
NO DUPLICATE INJECTION - Event handler exits early
```

**Code Evidence:**

```javascript
// generateRawInterceptor.js:15-66
export async function wrappedGenerateRaw(options) {
  // Prevent infinite recursion
  if (_isInterceptorActive) {
    return await _importedGenerateRaw(options);
  }

  try {
    _isInterceptorActive = true;

    if (options && options.prompt) {
      // Determine operation type from call stack
      const baseOperation = determineOperationType();

      // Get contextual suffix if set
      const suffix = getOperationSuffix();
      const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;

      if (typeof options.prompt === 'string') {
        options.prompt = injectMetadata(options.prompt, { operation });
      } else if (Array.isArray(options.prompt)) {
        injectMetadataIntoChatArray(options.prompt, { operation });
      }
    }

    // Call original function
    return await _importedGenerateRaw(options);
  } finally {
    _isInterceptorActive = false;
  }
}
```

**Why No Duplication:**

The event handler checks `getOperationSuffix()` and exits if set (line 325-329), preventing duplicate injection. The interceptor already injected metadata, so the event handler skips processing.

### 1.3 Proposed Flow: Extension Operation with ConnectionManagerRequestService

**Hypothetical Trace (IF IMPLEMENTED):**

```
Extension calls sendLLMRequest()
    ↓
[Extension] NEW sendLLMRequest() function
    |   - Receives: operationType parameter (e.g., "recap-42-67")
    |   - Injects metadata manually into prompt
    |   - Builds request payload
    ↓
[Extension] Calls ConnectionManagerRequestService.sendRequest()
    |   (from custom-request.js)
    ↓
[ST Core] custom-request.js::ChatCompletionService.sendRequest() (line 453)
    |   async sendRequest(data, extractData = true, signal = null) {
    |       const response = await fetch('/api/backends/chat-completions/generate', {
    |           method: 'POST',
    |           headers: getRequestHeaders(),
    |           body: JSON.stringify(data),
    |       });
    |   }
    ↓
[ST Backend] Direct HTTP request to backend
    ↓
NO EVENT EMITTED - Bypasses sendOpenAIRequest() entirely
```

**Critical Issue:**

```javascript
// custom-request.js:453-460 (ST Core)
static async sendRequest(data, extractData = true, signal = null) {
    const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        cache: 'no-cache',
        body: JSON.stringify(data),
        signal: signal ?? new AbortController().signal,
    });
    // ... process response
}
```

**No event emission occurs** because:
1. `ChatCompletionService.sendRequest()` makes a direct `fetch()` call
2. It does NOT call `sendOpenAIRequest()` (which emits the event)
3. Therefore, `CHAT_COMPLETION_PROMPT_READY` is never emitted

**Consequence:**

For **user chat messages**, the event handler is the ONLY way to inject metadata, because:
- We cannot intercept ST core's internal `generateRaw()` calls for user chat
- The event is emitted by ST core during normal chat flow
- Our extension listens for this event and injects metadata

If ConnectionManagerRequestService is used for user chat (hypothetically), metadata injection would fail completely because the event never fires.

---

## 2. Stack Trace Analysis Incompatibility

### 2.1 Current Implementation

**Stack Trace Mechanism:**

```javascript
// generateRawInterceptor.js:121-179
function determineOperationType() {
  try {
    // Capture stack trace
    const stack = new Error('Stack trace for operation type detection').stack || '';

    // Check for specific scene operations FIRST
    if (stack.includes('detectSceneBreak') || stack.includes('autoSceneBreakDetection.js')) {
      return 'detect_scene_break';
    }
    if (stack.includes('generateSceneRecap') && !stack.includes('runningSceneRecap.js')) {
      return 'generate_scene_recap';
    }
    // ... more checks ...

    // Check for message recap generation (AFTER scene checks!)
    if (stack.includes('recap_text') || stack.includes('recapping.js')) {
      return 'recap';
    }

    // Default for chat messages
    return 'chat';
  } catch {
    return 'unknown';
  }
}
```

**What the Stack Trace Contains:**

When `determineOperationType()` is called from `wrappedGenerateRaw()`, the JavaScript call stack is:

```
Error: Stack trace for operation type detection
    at determineOperationType (generateRawInterceptor.js:124)
    at wrappedGenerateRaw (generateRawInterceptor.js:30)
    at Object.generateRaw (generateRawInterceptor.js:90)
    at recap_text (recapping.js:95)
    at detectSceneBreak (autoSceneBreakDetection.js:332)
    at handleCharMessage (eventHandlers.js:178)
    ...
```

The stack string contains function names that appear **below** the current execution point. This is why checking for `'recap_text'` or `'detectSceneBreak'` works - these are **callers** of the current function.

### 2.2 Current Call Stack Example: Scene Break Detection

**Actual Call Sequence:**

```
handleCharMessage()  (eventHandlers.js:178)
    ↓
detectSceneBreak()  (autoSceneBreakDetection.js:332)
    ↓
recap_text()  (recapping.js:95)
    ↓
generateRaw()  [wrappedGenerateRaw] (generateRawInterceptor.js:90)
    ↓
determineOperationType()  (generateRawInterceptor.js:30)
    ↓
new Error().stack  (generateRawInterceptor.js:124)
```

**Stack Trace String Contents:**

```javascript
const stack = `
Error: Stack trace for operation type detection
    at determineOperationType (generateRawInterceptor.js:124)
    at wrappedGenerateRaw (generateRawInterceptor.js:30)
    at Object.generateRaw (generateRawInterceptor.js:90)
    at recap_text (recapping.js:95)           <-- FOUND!
    at detectSceneBreak (autoSceneBreakDetection.js:332)  <-- FOUND!
    at handleCharMessage (eventHandlers.js:178)
    at async on_chat_event (eventHandlers.js:232)
    ...
`;

// Check results:
stack.includes('detectSceneBreak')  // TRUE
stack.includes('autoSceneBreakDetection.js')  // TRUE
// Returns: 'detect_scene_break'
```

**Why It Works:**

The stack trace contains the **caller chain** - all functions that led to the current point. This allows checking for function names or file names that appear earlier in the call sequence.

### 2.3 Proposed Call Stack Example: sendLLMRequest()

**Hypothetical Call Sequence (IF IMPLEMENTED):**

```
detectSceneBreak()  (autoSceneBreakDetection.js:332)
    ↓
recap_text()  (recapping.js:95)
    ↓
sendLLMRequest()  [NEW FUNCTION]
    ↓
    |-- Inject metadata HERE
    |   const operation = operationType;  // Passed as parameter
    |   injectMetadataIntoChatArray(messages, { operation });
    |
    ↓
ConnectionManagerRequestService.sendRequest()  (custom-request.js:453)
    ↓
fetch('/api/backends/chat-completions/generate')
```

**Stack Trace IF Captured INSIDE sendLLMRequest():**

```javascript
// Hypothetical code INSIDE sendLLMRequest():
function sendLLMRequest(messages, operationType) {
    // Try to determine operation from stack (THIS WON'T WORK)
    const stack = new Error().stack;
    
    console.log(stack);
    // Output:
    // Error
    //     at sendLLMRequest (NEW_FILE.js:XX)              <-- Current function
    //     at recap_text (recapping.js:95)          <-- Caller
    //     at detectSceneBreak (autoSceneBreakDetection.js:332)  <-- Caller's caller
    
    // Problem: "recap_text" is in the stack!
    // But we CANNOT distinguish between:
    //   - recap operation
    //   - detect_scene_break operation (which also calls recap_text)
    
    // The stack only shows that recap_text called us.
    // It doesn't tell us which HIGH-LEVEL operation initiated the chain.
}
```

**The Fundamental Problem:**

Stack traces contain the **call chain** (who called who), but NOT the **purpose** or **context** of the call.

When `detectSceneBreak()` calls `recap_text()` which calls `sendLLMRequest()`, the stack shows:
- `detectSceneBreak` → `recap_text` → `sendLLMRequest`

But the stack does NOT tell us that this is a "detect_scene_break" operation vs a "recap" operation.

**Current System Works Because:**

The interceptor runs INSIDE `generateRaw()`, which is called directly by the operation-specific function. The stack trace can look "backwards" at the caller:
- If caller is `detectSceneBreak` → operation is "detect_scene_break"
- If caller is `recap_text` (without detectSceneBreak above it) → operation is "recap"

**Proposed System Breaks Because:**

The metadata injection happens OUTSIDE the generateRaw call, in a new `sendLLMRequest()` function. At that point:
- The stack shows the caller is `recap_text`
- But `recap_text` is called by MANY different operations
- We cannot determine which high-level operation initiated the call

### 2.4 Why Stack Traces Don't Include Callers' Context

**JavaScript Stack Trace Behavior:**

```javascript
function operation1() {
    operation2();
}

function operation2() {
    const stack = new Error().stack;
    console.log(stack);
}

operation1();

// Output:
// Error
//     at operation2 (<file>:XX)    <-- Current function (where error was created)
//     at operation1 (<file>:XX)    <-- Caller
//     at <global> (<file>:XX)      <-- Caller's caller
```

The stack contains:
1. **Current function** (where `new Error()` was called)
2. **Callers** (functions that led to current function)

The stack does NOT contain:
1. **Context** about why the function was called
2. **Purpose** of the operation
3. **Metadata** about the call

**Why Current Interceptor Works:**

```javascript
// autoSceneBreakDetection.js:332
async function detectSceneBreak() {
    setOperationSuffix('-42-67');  // Set global state
    try {
        await recap_text(prompt);
        // ↓ calls generateRaw
        //     ↓ calls wrappedGenerateRaw
        //         ↓ calls determineOperationType()
        //             ↓ new Error().stack contains "detectSceneBreak"
    } finally {
        clearOperationSuffix();
    }
}
```

The stack trace captures the CALLER ("detectSceneBreak"), which is used to identify the operation type.

**Why Proposed Approach Fails:**

```javascript
// Hypothetical sendLLMRequest()
async function sendLLMRequest(messages, operationType) {
    // At this point, the stack is:
    //   sendLLMRequest <-- Current
    //   recap_text <-- Caller
    //   detectSceneBreak <-- Caller's caller
    
    // We can see "recap_text" and "detectSceneBreak" in the stack,
    // BUT we must inject metadata NOW (before calling ConnectionManagerRequestService).
    
    // Problem: Multiple operations call recap_text:
    //   - detectSceneBreak → recap_text → sendLLMRequest
    //   - generateSceneRecap → recap_text → sendLLMRequest
    //   - (direct) recap_text → sendLLMRequest
    
    // We cannot reliably determine which operation this is from the stack alone.
}
```

**The Real Issue:**

The stack trace shows the **call hierarchy**, but when multiple operations share a common function (`recap_text`), the stack becomes ambiguous:

```
Operation A → recap_text → sendLLMRequest
Operation B → recap_text → sendLLMRequest
Operation C → recap_text → sendLLMRequest

// Inside sendLLMRequest, the stack shows "recap_text" as the caller.
// But we cannot tell if this is Operation A, B, or C without looking FURTHER up the stack.

// Current approach: Look up the stack to find the specific operation function.
// Proposed approach: Metadata injection happens TOO EARLY, before we can examine the stack.
```

---

## 3. Dual Injection Path Complexity

### 3.1 Path 1: Interceptor (Current)

**Complete Flow:**

```
Extension operation calls generateRaw()
    ↓
[Extension] generateRawInterceptor.js::wrappedGenerateRaw (line 15)
    ↓
[Extension] Line 30: determineOperationType()
    |   const baseOperation = determineOperationType();
    |   // Examines stack trace
    |   // Returns: "recap", "detect_scene_break", "generate_scene_recap", etc.
    ↓
[Extension] Line 33: getOperationSuffix()
    |   const suffix = getOperationSuffix();
    |   // Reads from global state (set by caller via setOperationSuffix)
    |   // Returns: "-42-67", "-EntryName", null, etc.
    ↓
[Extension] Line 34: Build complete operation string
    |   const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;
    |   // Examples:
    |   //   "recap-42-67"
    |   //   "detect_scene_break-10-25"
    |   //   "merge_lorebook_entry-CharacterName"
    ↓
[Extension] Line 38-60: Inject metadata based on prompt type
    |   if (typeof options.prompt === 'string') {
    |       options.prompt = injectMetadata(options.prompt, { operation });
    |   } else if (Array.isArray(options.prompt)) {
    |       injectMetadataIntoChatArray(options.prompt, { operation });
    |   }
    ↓
[Extension] metadataInjector.js::injectMetadata (line 92) OR injectMetadataIntoChatArray (line 127)
    |   
    |   For STRING prompts (line 92-116):
    |   --------------------------------
    |   const metadata = createMetadataBlock(options);
    |   // Returns: { version: '1.0', chat: 'ChatName', operation: 'recap-42-67' }
    |   
    |   const metadataStr = formatMetadataBlock(metadata);
    |   // Returns: '<ST_METADATA>\n{...JSON...}\n</ST_METADATA>\n\n'
    |   
    |   return metadataStr + prompt;
    |   // Metadata prepended to prompt string
    |   
    |   For ARRAY prompts (line 127-164):
    |   ----------------------------------
    |   const metadata = createMetadataBlock(options);
    |   const metadataStr = formatMetadataBlock(metadata);
    |   
    |   const firstSystemMessage = chatArray.find(msg => msg.role === 'system');
    |   if (firstSystemMessage) {
    |       // Prepend to existing system message
    |       firstSystemMessage.content = metadataStr + firstSystemMessage.content;
    |   } else {
    |       // Create new system message at beginning
    |       chatArray.unshift({ role: 'system', content: metadataStr });
    |   }
    ↓
[Extension] Line 66: Call original generateRaw with modified prompt
    |   return await _importedGenerateRaw(options);
    ↓
[ST Core] Continues normal flow...
```

**Metadata Format (line 82-90):**

```javascript
export function formatMetadataBlock(metadata) {
  try {
    const jsonStr = JSON.stringify(metadata, null, 2);
    return `<ST_METADATA>\n${jsonStr}\n</ST_METADATA>\n\n`;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error formatting metadata block:', err);
    return '';
  }
}
```

**Example Metadata Block:**

```
<ST_METADATA>
{
  "version": "1.0",
  "chat": "Alice - 2025-01-08@10h30m45s",
  "operation": "recap-42-67"
}
</ST_METADATA>

[Rest of prompt...]
```

### 3.2 Path 2: Event Handler (Current)

**Complete Flow:**

```
User sends chat message in ST
    ↓
[ST Core] Normal message processing
    ↓
[ST Core] openai.js::sendOpenAIRequest() (around line 1400-1538)
    ↓
[ST Core] Line 1533: Emit event
    |   const eventData = { chat, dryRun };
    |   await eventSource.emit(event_types.CHAT_COMPLETION_PROMPT_READY, eventData);
    ↓
[Extension] eventHandlers.js::line 297: Event handler triggered
    |   eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
    ↓
[Extension] Line 304: Check if metadata injection enabled
    |   const enabled = get_settings('first_hop_proxy_send_chat_details');
    |   if (!enabled) { return; }
    ↓
[Extension] Line 322: Check if extension operation already in progress
    |   const { getOperationSuffix } = await import('./operationContext.js');
    |   const operationSuffix = getOperationSuffix();
    |   
    |   if (operationSuffix !== null) {
    |       // Extension operation in progress (interceptor already handled it)
    |       debug('[Interceptor] Extension operation in progress, skipping chat-{index} metadata');
    |       return;  // EXIT - Prevent duplicate injection
    |   }
    ↓
[Extension] Line 333: Get current chat context
    |   const context = getContext();
    |   const messageIndex = (context?.chat?.length ?? 0) - 1;
    ↓
[Extension] Line 337: Check if this is a swipe
    |   const lastMessage = context.chat[messageIndex];
    |   const swipeId = lastMessage?.swipe_id ?? 0;
    ↓
[Extension] Line 342: Build operation string for chat message
    |   let operation = `chat-${messageIndex}`;
    |   if (swipeId > 0) {
    |       // swipe_id is 0-indexed, but display as 1-indexed
    |       operation += `-swipe${swipeId + 1}`;
    |   }
    |   // Examples:
    |   //   "chat-42"
    |   //   "chat-42-swipe2"
    |   //   "chat-42-swipe3"
    ↓
[Extension] Line 348: Inject metadata into chat array
    |   injectMetadataIntoChatArray(promptData.chat, { operation });
    ↓
[Extension] metadataInjector.js::injectMetadataIntoChatArray (line 127)
    |   [Same as Path 1 - see above]
    |   
    |   const metadata = createMetadataBlock({ operation });
    |   // Returns: { version: '1.0', chat: 'ChatName', operation: 'chat-42' }
    |   
    |   const metadataStr = formatMetadataBlock(metadata);
    |   
    |   // Find or create system message
    |   const firstSystemMessage = promptData.chat.find(msg => msg.role === 'system');
    |   if (firstSystemMessage) {
    |       firstSystemMessage.content = metadataStr + firstSystemMessage.content;
    |   } else {
    |       promptData.chat.unshift({ role: 'system', content: metadataStr });
    |   }
    ↓
[Extension] Line 349: Metadata injected
    |   debug(`[Interceptor] Injected metadata with operation: ${operation}`);
    ↓
[ST Core] Request continues to backend with modified chat array
```

**Code Evidence:**

```javascript
// eventHandlers.js:297-364
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
    try {
        // Check if injection is enabled
        const enabled = get_settings('first_hop_proxy_send_chat_details');
        if (!enabled) { return; }

        // Import metadata injector
        const { injectMetadataIntoChatArray } = await import('./metadataInjector.js');

        // Process the chat array
        if (promptData && Array.isArray(promptData.chat)) {
            // Check if an extension operation is already in progress
            const { getOperationSuffix } = await import('./operationContext.js');
            const operationSuffix = getOperationSuffix();

            if (operationSuffix !== null) {
                // Extension operation in progress
                // The generateRawInterceptor will handle metadata injection
                debug('[Interceptor] Extension operation in progress, skipping chat-{index} metadata');
                return;
            }

            // Only inject chat-{index} for actual user/character messages
            const context = getContext();
            const messageIndex = (context?.chat?.length ?? 0) - 1;

            if (messageIndex >= 0) {
                // Check if this is a swipe
                const lastMessage = context.chat[messageIndex];
                const swipeId = lastMessage?.swipe_id ?? 0;

                // Build operation string
                let operation = `chat-${messageIndex}`;
                if (swipeId > 0) {
                    operation += `-swipe${swipeId + 1}`;
                }

                injectMetadataIntoChatArray(promptData.chat, { operation });
                debug(`[Interceptor] Injected metadata with operation: ${operation}`);
            }
        }
    } catch (err) {
        debug('[Interceptor] Error processing CHAT_COMPLETION_PROMPT_READY:', String(err));
    }
});
```

### 3.3 Path 3: Manual Injection (Proposed New)

**Hypothetical Flow (IF IMPLEMENTED):**

```
Extension operation needs LLM call
    ↓
[Extension] Operation determines its type upfront
    |   // Example from scene break detection:
    |   const operationType = `detect_scene_break-${startIdx}-${endIdx}`;
    ↓
[Extension] NEW sendLLMRequest() function
    |   
    |   async function sendLLMRequest(messages, options) {
    |       const { operationType, connectionProfile, preset } = options;
    |       
    |       // Step 1: Inject metadata BEFORE sending
    |       const metadata = createMetadataBlock({ operation: operationType });
    |       const metadataStr = formatMetadataBlock(metadata);
    |       
    |       // Find or create system message
    |       const firstSystemMsg = messages.find(m => m.role === 'system');
    |       if (firstSystemMsg) {
    |           firstSystemMsg.content = metadataStr + firstSystemMsg.content;
    |       } else {
    |           messages.unshift({ role: 'system', content: metadataStr });
    |       }
    |       
    |       // Step 2: Switch connection profile if specified
    |       if (connectionProfile) {
    |           await withConnectionSettings(connectionProfile, preset, async () => {
    |               // Step 3: Send request via ConnectionManagerRequestService
    |               return await ConnectionManagerRequestService.sendRequest({
    |                   messages,
    |                   max_tokens: ...,
    |                   temperature: ...,
    |                   // ... other params
    |               });
    |           });
    |       } else {
    |           // No profile switch needed
    |           return await ConnectionManagerRequestService.sendRequest({ messages, ... });
    |       }
    |   }
    ↓
[Extension] ConnectionManagerRequestService.sendRequest()
    |   [See custom-request.js:453]
    |   
    |   static async sendRequest(data, extractData = true, signal = null) {
    |       const response = await fetch('/api/backends/chat-completions/generate', {
    |           method: 'POST',
    |           headers: getRequestHeaders(),
    |           body: JSON.stringify(data),
    |       });
    |       
    |       // NO EVENT EMISSION
    |       // Direct HTTP request to backend
    |   }
    ↓
[Backend] Receives request with metadata already injected
```

**Proposed Code Example:**

```javascript
// NEW FILE: llmRequestService.js
import { ChatCompletionService } from '../../../../custom-request.js';
import { createMetadataBlock, formatMetadataBlock } from './metadataInjector.js';
import { withConnectionSettings } from './connectionSettingsManager.js';

export async function sendLLMRequest(messages, options) {
    const {
        operationType,        // REQUIRED: e.g., "recap-42-67"
        connectionProfile,    // Optional: profile name to switch to
        preset,               // Optional: preset name
        maxTokens,
        temperature,
        // ... other options
    } = options;

    // Step 1: Inject metadata MANUALLY (no interceptor, no event)
    if (operationType) {
        const metadata = createMetadataBlock({ operation: operationType });
        const metadataStr = formatMetadataBlock(metadata);
        
        const firstSystemMsg = messages.find(m => m.role === 'system');
        if (firstSystemMsg) {
            firstSystemMsg.content = metadataStr + firstSystemMsg.content;
        } else {
            messages.unshift({ role: 'system', content: metadataStr });
        }
    }

    // Step 2: Build request payload
    const requestData = {
        messages,
        max_tokens: maxTokens,
        temperature,
        chat_completion_source: 'openai',  // Or determine from current settings
        // ... other params
    };

    // Step 3: Send request with optional profile switching
    if (connectionProfile) {
        return await withConnectionSettings(connectionProfile, preset, async () => {
            return await ChatCompletionService.sendRequest(requestData);
        });
    } else {
        return await ChatCompletionService.sendRequest(requestData);
    }
}
```

### 3.4 Why Both Paths Needed

**User Chat Messages MUST Use Event Handler:**

- User types message in ST UI
- ST core processes message internally
- ST core calls `generateRaw()` (we cannot intercept this)
- ST core emits `CHAT_COMPLETION_PROMPT_READY` event
- Our event handler injects metadata: `chat-42`, `chat-42-swipe2`, etc.
- **No alternative** - we cannot hook into ST's internal message processing

**Extension Operations CAN Use Either Approach:**

Current approach (Interceptor):
- Extension calls `generateRaw()` (via our wrapped version)
- Interceptor determines operation type from stack
- Interceptor injects metadata
- Interceptor calls original `generateRaw()`
- Event fires, but handler sees `operationSuffix !== null` and skips

Proposed approach (Manual Injection):
- Extension calls `sendLLMRequest()` with operation type parameter
- sendLLMRequest injects metadata manually
- sendLLMRequest calls ConnectionManagerRequestService
- **No event fires** (bypasses sendOpenAIRequest)
- Event handler never triggered

**Complexity Analysis:**

Current system:
- 2 injection paths: Interceptor (extension ops) + Event handler (user chat)
- Both paths call same `injectMetadataIntoChatArray()` function
- Coordination via `operationSuffix` global state

Proposed system:
- 3 injection paths: Manual (extension ops) + Event handler (user chat) + Interceptor (backward compat?)
- Manual injection duplicates logic from metadataInjector
- Event handler still needed for user chat
- Interceptor still needed if any extension code still calls `generateRaw()` directly

---

## 4. operationContext Pattern Incompatibility

### 4.1 Current Pattern

**Global State Storage:**

```javascript
// operationContext.js:18-30
let _context = { suffix: null };

export function setOperationSuffix(suffix) {
  _context = { suffix };
}

export function getOperationSuffix() {
  return _context.suffix;
}

export function clearOperationSuffix() {
  _context = { suffix: null };
}
```

**Usage Pattern:**

```javascript
// autoSceneBreakDetection.js:325-336
const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
setOperationSuffix(`-${actualStartIdx}-${messageIndex}`);

let response;
try {
    // Call recap_text which calls generateRaw
    response = await recap_text(prompt, detectionPrefill, includePresetPrompts, preset);
} finally {
    clearOperationSuffix();
}
```

**Complete Flow:**

```
detectSceneBreak() function runs
    ↓
Line 326: setOperationSuffix('-10-25')
    |   _context.suffix = '-10-25'  (global state set)
    ↓
Line 332: await recap_text(...)
    ↓
recapping.js::recap_text (line 95)
    |   await generateRaw({ prompt, ... })
    ↓
generateRawInterceptor.js::wrappedGenerateRaw (line 15)
    |   SYNCHRONOUSLY reads global state
    ↓
Line 30: determineOperationType()
    |   Returns: 'detect_scene_break' (from stack trace)
    ↓
Line 33: getOperationSuffix()
    |   Returns: '-10-25' (from global state)
    ↓
Line 34: Build operation string
    |   const operation = 'detect_scene_break' + '-10-25'
    |   // Result: 'detect_scene_break-10-25'
    ↓
Line 42-60: Inject metadata
    |   injectMetadataIntoChatArray(options.prompt, { operation: 'detect_scene_break-10-25' })
    ↓
Line 66: Call original generateRaw
    |   return await _importedGenerateRaw(options);
    ↓
[Back to detectSceneBreak]
Line 335: clearOperationSuffix()
    |   _context.suffix = null  (cleanup)
```

**Key Insight:**

The suffix is read DURING the `generateRaw()` call, while the call stack is still active. This is a **synchronous read** of global state within the interceptor.

**Timing Diagram:**

```
Time →
|
|-- setOperationSuffix('-10-25')           [Global state: suffix = '-10-25']
|
|-- await recap_text()
|   |
|   |-- await generateRaw()
|       |
|       |-- wrappedGenerateRaw()           [Reads global state DURING call]
|       |   |
|       |   |-- getOperationSuffix()       [Returns: '-10-25']
|       |   |-- Build: 'detect_scene_break-10-25'
|       |   |-- Inject metadata
|       |   |-- Call original generateRaw
|       |
|       [Returns]
|   
|   [Returns]
|
|-- clearOperationSuffix()                 [Global state: suffix = null]
```

### 4.2 Why It's Incompatible with ConnectionManagerRequestService

**The Timing Problem:**

With ConnectionManagerRequestService, metadata injection happens BEFORE the request is sent, not DURING an intercepted function call.

**Proposed Flow (BROKEN):**

```
detectSceneBreak() function runs
    ↓
setOperationSuffix('-10-25')               [Global state: suffix = '-10-25']
    ↓
await recap_text()
    ↓
recapping.js calls NEW sendLLMRequest()
    ↓
sendLLMRequest MUST inject metadata NOW
    |
    |-- Problem: How do we get the suffix?
    |   
    |   Option A: Read global state (FRAGILE)
    |   -----------------------------------------
    |   const suffix = getOperationSuffix();  // Returns: '-10-25'
    |   const baseOp = ???;  // How do we determine base operation?
    |   
    |   // We could try stack trace, but stack shows:
    |   //   sendLLMRequest ← recap_text ← detectSceneBreak
    |   // Which operation is this? "recap" or "detect_scene_break"?
    |   
    |   // We'd need to parse the stack, but that's the SAME logic
    |   // as the interceptor, just in a different place!
    |   
    |   Option B: Pass as parameter (BETTER)
    |   -----------------------------------------
    |   // Caller must build complete operation string upfront:
    |   const operation = 'detect_scene_break-10-25';
    |   await sendLLMRequest(messages, { operationType: operation });
    |   
    |   // But then setOperationSuffix/getOperationSuffix are NOT USED
    |   // This is a completely different pattern!
    ↓
sendLLMRequest injects metadata and sends request
    ↓
[Returns to detectSceneBreak]
    ↓
clearOperationSuffix()                     [Global state: suffix = null]
    |
    |-- But this doesn't matter anymore, because
    |   sendLLMRequest never read the global state!
```

**The Fundamental Issue:**

The operationContext pattern relies on:
1. Setting global state BEFORE a call
2. Reading global state DURING the call (in the interceptor)
3. Clearing global state AFTER the call

With ConnectionManagerRequestService:
1. Metadata injection happens BEFORE the call
2. There is NO interceptor to read global state during the call
3. We must pass the operation type as a PARAMETER instead

**This requires rewriting ALL call sites.**

### 4.3 Proposed Pattern (Parameter Passing)

**New Pattern:**

Instead of:
```javascript
setOperationSuffix('-42-67');
try {
    await recap_text(prompt);
} finally {
    clearOperationSuffix();
}
```

Must become:
```javascript
const operation = 'recap-42-67';
await sendLLMRequest(messages, { operationType: operation });
```

**Migration Required for ALL Uses:**

```bash
$ grep -l "setOperationSuffix" --include="*.js" . | grep -v "node_modules"
```

Files using operationContext:
- autoSceneBreakDetection.js (line 326)
- lorebookEntryMerger.js (line 119)
- (Any other operation that needs to pass contextual info)

Each call site must be rewritten to:
1. Build the complete operation string upfront
2. Pass it as a parameter to sendLLMRequest
3. Remove setOperationSuffix/clearOperationSuffix calls

**Code Change Example:**

**Before:**
```javascript
// autoSceneBreakDetection.js:325-336
const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
setOperationSuffix(`-${actualStartIdx}-${messageIndex}`);

let response;
try {
    response = await recap_text(prompt, detectionPrefill, includePresetPrompts, preset);
} finally {
    clearOperationSuffix();
}
```

**After:**
```javascript
// autoSceneBreakDetection.js (rewritten)
const operationType = `detect_scene_break-${actualStartIdx}-${messageIndex}`;

const messages = [
    { role: 'system', content: 'You are a scene break detector...' },
    { role: 'user', content: prompt }
];

const response = await sendLLMRequest(messages, {
    operationType,
    connectionProfile: get_settings('connection_profile'),
    preset: preset,
    maxTokens: 500,
    temperature: 0.7
});
```

**Impact:**

- **Every** operation that uses setOperationSuffix must be rewritten
- The operation type determination logic must be moved OUT of the interceptor and INTO each call site
- This duplicates logic across multiple files
- Increases risk of inconsistency (different operations might format their strings differently)

---

## 5. Metadata Injection Mechanism

### 5.1 Metadata Structure

**Source Code:**

```javascript
// metadataInjector.js:52-59
export function getDefaultMetadata() {
  const chatName = getChatName();

  return {
    version: '1.0',
    chat: chatName
  };
}

// metadataInjector.js:61-80
export function createMetadataBlock(options = {}) {
  const metadata = getDefaultMetadata();

  // Add operation type if provided
  if (options?.operation) {
    metadata.operation = String(options.operation);
  }

  // Add timestamp if requested
  if (options?.includeTimestamp) {
    metadata.timestamp = new Date().toISOString();
  }

  // Add custom fields if provided
  if (options?.custom && typeof options.custom === 'object') {
    metadata.custom = options.custom;
  }

  return metadata;
}
```

**Example Metadata Object:**

```javascript
{
  "version": "1.0",
  "chat": "Alice - 2025-01-08@10h30m45s",
  "operation": "recap-42-67"
}
```

### 5.2 Metadata Formatting

**Source Code:**

```javascript
// metadataInjector.js:82-90
export function formatMetadataBlock(metadata) {
  try {
    const jsonStr = JSON.stringify(metadata, null, 2);
    return `<ST_METADATA>\n${jsonStr}\n</ST_METADATA>\n\n`;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error formatting metadata block:', err);
    return '';
  }
}
```

**Example Formatted Metadata:**

```
<ST_METADATA>
{
  "version": "1.0",
  "chat": "Alice - 2025-01-08@10h30m45s",
  "operation": "recap-42-67"
}
</ST_METADATA>

```

**Note:** Two newlines after closing tag to separate metadata from actual prompt.

### 5.3 Injection into String Prompts

**Source Code:**

```javascript
// metadataInjector.js:92-116
export function injectMetadata(prompt, options = {}) {
  try {
    // Check if injection is enabled
    if (!isMetadataInjectionEnabled()) {
      return prompt;
    }

    // Create metadata block
    const metadata = createMetadataBlock(options);

    // Format as string
    const metadataStr = formatMetadataBlock(metadata);

    // Prepend to prompt
    return metadataStr + prompt;

  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error injecting metadata:', err);
    // Return original prompt on error
    return prompt;
  }
}
```

**Example:**

**Input:**
```javascript
const prompt = "Recap the following conversation:\n\nUser: Hello\nAI: Hi there!";
const result = injectMetadata(prompt, { operation: 'recap-42-67' });
```

**Output:**
```
<ST_METADATA>
{
  "version": "1.0",
  "chat": "Alice - 2025-01-08@10h30m45s",
  "operation": "recap-42-67"
}
</ST_METADATA>

Recap the following conversation:

User: Hello
AI: Hi there!
```

### 5.4 Injection into Chat Arrays (Messages Format)

**Source Code:**

```javascript
// metadataInjector.js:127-164
export function injectMetadataIntoChatArray(chatArray, options = {}) {
  try {
    if (!isMetadataInjectionEnabled()) {
      return;
    }

    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      return;
    }

    // Create metadata block
    const metadata = createMetadataBlock(options);
    const metadataStr = formatMetadataBlock(metadata);

    // Find first system message, or create one if none exists
    const firstSystemMessage = chatArray.find((msg) => msg.role === 'system');

    if (firstSystemMessage) {
      // Prepend to existing system message
      firstSystemMessage.content = metadataStr + firstSystemMessage.content;
      debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Injected metadata into existing system message');
    } else {
      // No system message exists, insert at beginning
      chatArray.unshift({
        role: 'system',
        content: metadataStr
      });
      debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Created new system message with metadata');
    }

    debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Metadata:', JSON.stringify(metadata));
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error injecting metadata into chat array:', err);
  }
}
```

**Example:**

**Input:**
```javascript
const chatArray = [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
];

injectMetadataIntoChatArray(chatArray, { operation: 'chat-42' });
```

**Output:**
```javascript
[
    {
        role: 'system',
        content: '<ST_METADATA>\n{\n  "version": "1.0",\n  "chat": "Alice - 2025-01-08@10h30m45s",\n  "operation": "chat-42"\n}\n</ST_METADATA>\n\nYou are a helpful assistant.'
    },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
]
```

**If no system message exists:**

**Input:**
```javascript
const chatArray = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
];

injectMetadataIntoChatArray(chatArray, { operation: 'chat-42' });
```

**Output:**
```javascript
[
    {
        role: 'system',
        content: '<ST_METADATA>\n{\n  "version": "1.0",\n  "chat": "Alice - 2025-01-08@10h30m45s",\n  "operation": "chat-42"\n}\n</ST_METADATA>\n\n'
    },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
]
```

### 5.5 Duplicate Detection

**Current Implementation:**

The code does NOT explicitly check for duplicate metadata blocks. However, duplicates are prevented by:

1. **Interceptor path**: Only injects once per generateRaw call
2. **Event handler path**: Only injects if `operationSuffix === null` (not an extension operation)
3. **No overlap**: Extension operations go through interceptor, user chat goes through event handler

**Potential Issue with Proposed Approach:**

If both the interceptor AND manual injection exist simultaneously:
- Extension calls sendLLMRequest (manual injection)
- sendLLMRequest still calls generateRaw internally?
- Interceptor also injects?
- **Result: Duplicate metadata blocks**

To prevent this, either:
- Remove the interceptor entirely (breaks backward compatibility)
- Disable the interceptor for requests sent via ConnectionManagerRequestService (complex flag passing)
- Build ConnectionManagerRequestService requests outside of generateRaw (proposed approach)

---

## 6. Connection Profile Switching

### 6.1 Current Profile Switching (Global State)

**Implementation:**

```javascript
// connectionProfiles.js:94-109
async function set_connection_profile(name) {
  // Set the connection profile
  if (!check_connection_profiles_active()) {return;} // if the extension isn't active, return
  if (!name) {return;} // if no name provided, return
  if (name === (await get_current_connection_profile())) {return;} // If already using the current profile, return
  if (!(await verify_connection_profile(name))) {return;} // don't set an invalid profile

  // Set the connection profile
  debug(`Setting connection profile to "${name}"`);
  toastr.info(`Setting connection profile to "${name}"`);
  const ctx = getContext();
  await ctx.executeSlashCommandsWithOptions(`/profile ${name}`);

  // Wait a moment for the profile to fully apply
  await new Promise((resolve) => setTimeout(resolve, PROFILE_SWITCH_DELAY_MS));
}
```

**Key Points:**

1. **Slash command**: Uses `/profile ${name}` to switch
2. **Global state change**: Affects ALL subsequent LLM calls
3. **Wait delay**: 500ms wait for profile to apply (line 108)
4. **Early exit**: If already using the profile, skip switching (line 98)

**Wrapper Pattern:**

```javascript
// connectionSettingsManager.js:99-124
async function withConnectionSettings(profileName, presetName, operation) {
  // Save current settings
  const currentSettings = await getCurrentConnectionSettings();

  // Save to persistent storage (for crash recovery)
  saveConnectionSettingsState(currentSettings);

  try {
    // Switch to operation settings
    await switchConnectionSettings(profileName, presetName);

    // Execute operation and return result
    return await operation();

  } finally {
    // Always restore original settings
    await switchConnectionSettings(currentSettings.connectionProfile, currentSettings.completionPreset);

    // Clear saved state (successful completion)
    clearSavedConnectionSettingsState();
  }
}
```

**Flow:**

```
withConnectionSettings('RecapProfile', 'RecapPreset', async () => {
    ↓
Save current settings to crash recovery storage
    ↓
Switch to 'RecapProfile' (global state change)
    ↓
Wait 500ms for profile to apply
    ↓
Execute operation (e.g., await recap_text(...))
    |   
    |   Operation uses GLOBAL connection settings
    |   (currently set to 'RecapProfile')
    |
    ↓
Operation completes
    ↓
[finally block]
    ↓
Switch back to original profile (global state change)
    ↓
Wait 500ms for profile to apply
    ↓
Clear crash recovery storage
})
```

**Problem: Global State Mutations**

Every call to `set_connection_profile()`:
1. Changes global ST state (active connection profile)
2. Waits 500ms for change to propagate
3. Affects ALL LLM calls system-wide during this time

If two operations run concurrently:
- Operation A switches to ProfileA
- Operation B switches to ProfileB (before A finishes)
- **Operation A now uses ProfileB** (race condition)

This is why operations run SEQUENTIALLY in the operation queue.

### 6.2 ConnectionManagerRequestService Approach (Request-Scoped)

**How ConnectionManagerRequestService Works:**

```javascript
// custom-request.js:453-460
static async sendRequest(data, extractData = true, signal = null) {
    const response = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        cache: 'no-cache',
        body: JSON.stringify(data),
        signal: signal ?? new AbortController().signal,
    });
    
    // Process response...
}
```

**Key Point:**

The request payload (`data`) contains ALL configuration:
- `chat_completion_source`: Which API to use (OpenAI, Claude, etc.)
- `model`: Which model to use
- `temperature`, `max_tokens`, etc.: Generation parameters
- `custom_url`, `reverse_proxy`: Connection details

**No Global State Changes Needed:**

With ConnectionManagerRequestService, profile switching could be avoided by:
1. Reading the profile's settings (via `/profile-get ProfileName`)
2. Extracting connection details (API, model, URL, etc.)
3. Building request payload with those details
4. Sending request with profile-specific settings
5. **No global state mutation**

**Example (Hypothetical):**

```javascript
async function sendLLMRequestWithProfile(messages, profileName) {
    // Step 1: Get profile settings (without switching)
    const profileSettings = await getProfileSettings(profileName);
    
    // Step 2: Build request payload with profile settings
    const requestData = {
        messages,
        chat_completion_source: profileSettings.api,
        model: profileSettings.model,
        max_tokens: profileSettings.max_tokens,
        temperature: profileSettings.temperature,
        custom_url: profileSettings.custom_url,
        reverse_proxy: profileSettings.reverse_proxy,
        // ... all other settings from profile
    };
    
    // Step 3: Send request (no global state change!)
    return await ChatCompletionService.sendRequest(requestData);
}
```

**Verification Needed:**

```javascript
// connectionProfiles.js:46-82
async function get_connection_profile_api(name) {
  // Get the API for the given connection profile name
  if (!check_connection_profiles_active()) {return null;}
  let profileName = name;
  if (profileName === undefined) {profileName = await get_recap_connection_profile();}
  const ctx = getContext();
  const result = await ctx.executeSlashCommandsWithOptions(`/profile-get ${profileName}`);

  if (!result.pipe) {
    debug(`/profile-get ${profileName} returned nothing`);
    return null;
  }

  let data;
  try {
    data = JSON.parse(result.pipe);
  } catch {
    error(`Failed to parse JSON from /profile-get for "${name}".`);
    return null;
  }

  // Map API type to completion API
  if (CONNECT_API_MAP[data.api] === undefined) {
    error(`API type "${data.api}" not found in CONNECT_API_MAP`);
    return null;
  }
  return CONNECT_API_MAP[data.api].selected;
}
```

The `/profile-get` command returns profile data as JSON. This COULD be used to extract all settings without changing global state.

**However:**

Current code only extracts the API type, not all settings. Full implementation would need:
1. Extract ALL relevant settings from profile JSON
2. Map profile settings to ChatCompletionService request format
3. Ensure ALL profile settings are correctly applied

This is MORE complex than the current `set_connection_profile()` approach, but avoids global state mutations.

### 6.3 Comparison

| Aspect | Current (Global State) | Proposed (Request-Scoped) |
|--------|------------------------|---------------------------|
| **State Mutation** | Yes (changes global ST state) | No (settings only in request payload) |
| **Wait Time** | 500ms per switch (×2 per operation) | None |
| **Concurrency** | Requires sequential execution | Could allow parallel requests |
| **Complexity** | Simple (slash command) | Complex (parse profile, map settings) |
| **Crash Recovery** | Needed (restore if interrupted) | Not needed (no global state) |
| **Compatibility** | Uses ST's profile system directly | Bypasses profile system |
| **Risk** | Race conditions if not sequential | Settings mapping errors |

---

## Recap

All six technical issues have been traced end-to-end through actual code:

1. **Event System Bypass**: ConnectionManagerRequestService bypasses `sendOpenAIRequest()`, which emits `CHAT_COMPLETION_PROMPT_READY`. This breaks metadata injection for user chat messages.

2. **Stack Trace Incompatibility**: Stack traces show the call chain, but when metadata injection happens BEFORE the call (not during an interceptor), we cannot reliably determine operation type from the stack.

3. **Dual Injection Path Complexity**: Current system has 2 paths (interceptor + event handler). Proposed system would need 3 paths (manual + event handler + interceptor for backward compat).

4. **operationContext Pattern Incompatibility**: Current pattern relies on global state read DURING an intercepted call. Proposed approach requires parameter passing BEFORE the call, necessitating rewrites of ALL call sites.

5. **Metadata Injection Mechanism**: Well-defined format (`<ST_METADATA>...</ST_METADATA>`), but duplicate prevention relies on coordination between interceptor and event handler via `operationSuffix` global state.

6. **Connection Profile Switching**: Current approach uses global state mutations (slash commands), which require sequential execution. Proposed approach could use request-scoped settings, but requires complex profile parsing and mapping.

**Overall Assessment:**

The ConnectionManagerRequestService migration introduces significant architectural incompatibilities that would require:
- Complete rewrite of operation context pattern
- Maintenance of multiple injection paths
- Complex profile settings extraction and mapping
- Risk of breaking user chat metadata injection

The current interceptor-based approach, while complex, provides a working solution that handles both extension operations and user chat messages with minimal code duplication.

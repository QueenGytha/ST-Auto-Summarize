# Metadata Injection System - Data Flow

## Overview

This document traces the complete flow of metadata through the system, from operation initiation to proxy logging. Understanding these flows is critical for debugging, extending functionality, and integrating with downstream systems.

## Flow Diagrams

### Flow 1: Chat Message Metadata Injection

```
User Action: Send Chat Message
         ↓
SillyTavern Core: Build Chat Array
         ↓
         ├─ System messages (preset prompts)
         ├─ User messages
         └─ Assistant messages
         ↓
Fire Event: CHAT_COMPLETION_PROMPT_READY
         ↓
Event Handler (eventHandlers.js:299-372)
         ├─ Check: first_hop_proxy_send_chat_details enabled?
         │    ├─ No → Skip metadata injection
         │    └─ Yes → Continue
         ├─ Check: Metadata already exists?
         │    ├─ Yes → Skip (extension operation in progress)
         │    └─ No → Continue
         ├─ Check: Operation context has suffix?
         │    ├─ Yes → Skip (extension operation)
         │    └─ No → Continue
         ├─ Determine: Message index and swipe status
         │    ├─ Index: context.chat.length - 1
         │    └─ Swipe: lastMessage.swipe_id
         └─ Build operation string
              ├─ Format: "chat-{index}"
              └─ If swipe: "chat-{index}-swipe{n}"
         ↓
injectMetadataIntoChatArray()
         ├─ Find or create system message
         ├─ Build metadata block
         │    └─ { version, chat, operation }
         ├─ Format as XML-tagged JSON
         │    └─ <ST_METADATA>{...}</ST_METADATA>
         └─ Prepend to system message content
         ↓
Modified Chat Array
         ↓
SillyTavern: Send to API
         ↓
First-Hop Proxy
         ├─ Extract metadata
         ├─ Log request
         ├─ Strip metadata
         └─ Forward to LLM
         ↓
LLM Response
         ↓
User sees response
```

**Key Points:**
1. Event-based interception (not function wrapping)
2. Multiple checks prevent double-injection
3. Message index determines operation suffix
4. Swipe detection adds swipe number

### Flow 2: Extension Operation Metadata Injection (with Context)

```
Extension Operation: Generate Scene Recap (messages 42-67)
         ↓
Operation Handler
         ├─ Set context suffix: setOperationSuffix('-42-67')
         ├─ Build prompt
         └─ Call: generateRaw({ prompt: '...' })
         ↓
Wrapped generateRaw (generateRawInterceptor.js:15-78)
         ├─ Check: Recursion guard (isInterceptorActive)
         │    ├─ Active → Call original directly
         │    └─ Not active → Continue
         ├─ Set recursion guard: _isInterceptorActive = true
         ├─ Determine base operation type
         │    └─ Stack trace analysis → "generate_scene_recap"
         ├─ Get context suffix
         │    └─ getOperationSuffix() → "-42-67"
         └─ Combine: operation = "generate_scene_recap-42-67"
         ↓
Check Prompt Format
         ├─ String prompt?
         │    └─ Call: injectMetadata(prompt, { operation })
         │         ├─ Build metadata block
         │         ├─ Format as XML-tagged JSON
         │         └─ Prepend to prompt
         └─ Array prompt?
              └─ Call: injectMetadataIntoChatArray(prompt, { operation, replaceIfChat: true })
                   ├─ Check existing metadata
                   ├─ Replace if "chat*" operation
                   └─ Inject into system message
         ↓
Modified Prompt
         ↓
Original generateRaw
         ↓
SillyTavern: Send to API
         ↓
First-Hop Proxy
         ├─ Extract metadata
         ├─ Log to: logs/characters/{char}/{timestamp}/1-generate_scene_recap-42-67.md
         ├─ Strip metadata
         └─ Forward to LLM
         ↓
LLM Response
         ↓
Operation Handler
         └─ Clear context: clearOperationSuffix()
         ↓
Recap stored in message
```

**Key Points:**
1. Context set before LLM call
2. Stack trace determines base operation
3. Context suffix adds message range
4. Always clear context after operation

### Flow 3: LLM Client Direct Call

```
Extension Module: Scene Recap Generator
         ↓
Set Context
         └─ setOperationSuffix('-42-67')
         ↓
Call sendLLMRequest()
         ├─ Parameters:
         │    ├─ profileId: "uuid-123"
         │    ├─ prompt: "Summarize these messages..."
         │    ├─ operationType: "generate_scene_recap"
         │    └─ options: { preset: "creative-writing" }
         ↓
Build Messages Array
         ├─ Convert string to messages
         │    └─ [{ role: 'user', content: prompt }]
         ├─ Add preset prompts (if includePreset)
         └─ Add prefill (if provided)
         ↓
Get Operation Context
         ├─ Read suffix: getOperationSuffix() → "-42-67"
         └─ Combine: fullOperation = "generate_scene_recap-42-67"
         ↓
Inject Metadata
         └─ injectMetadataIntoChatArray(messages, { operation: fullOperation })
              ├─ Build metadata block
              ├─ Format as XML-tagged JSON
              └─ Insert into system message
         ↓
Messages with Metadata
         ↓
ConnectionManager.sendRequest()
         ├─ Switch to profile (if different)
         ├─ Add generation params
         └─ Send to API
         ↓
First-Hop Proxy
         ├─ Extract metadata
         ├─ Log request
         ├─ Strip metadata
         └─ Forward to LLM
         ↓
LLM Response
         ↓
Normalize Response
         ├─ Extract content from object
         ├─ Trim to sentence (if enabled)
         └─ Return string
         ↓
Extension Module
         └─ Clear context: clearOperationSuffix()
```

**Key Points:**
1. Explicit operation type parameter
2. Context suffix from global storage
3. Metadata injected before ConnectionManager call
4. Response normalized to string

## Data Structures

### Operation Context

**Storage:**
```javascript
// operationContext.js
let _context = { suffix: null };
```

**States:**
```javascript
// No context
{ suffix: null }

// Message range context
{ suffix: '-42-67' }

// Single message context
{ suffix: '-42' }
```

**Lifecycle:**
```
setOperationSuffix('-42-67')  →  { suffix: '-42-67' }
                                          ↓
                                  Operation uses suffix
                                          ↓
clearOperationSuffix()        →  { suffix: null }
```

### Metadata Block

**Default Structure:**
```javascript
{
  version: '1.0',
  chat: 'CharacterName - 2025-11-03@16h32m59s',
  operation: 'generate_scene_recap-42-67'
}
```

**With Optional Fields:**
```javascript
{
  version: '1.0',
  chat: 'CharacterName - 2025-11-03@16h32m59s',
  operation: 'generate_scene_recap-42-67',
  timestamp: '2025-11-03T16:32:59.123Z',
  custom: {
    retry_count: 2,
    include_lorebooks: true
  }
}
```

**Formatted Block:**
```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

```

### Prompt Formats

**String Prompt (Before Injection):**
```
Summarize the following messages in 2-3 sentences:

Message #42: [USER] "Let's go to the market."
Message #43: [ASSISTANT] "Sure, I'll grab my coat."
...
```

**String Prompt (After Injection):**
```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

Summarize the following messages in 2-3 sentences:

Message #42: [USER] "Let's go to the market."
Message #43: [ASSISTANT] "Sure, I'll grab my coat."
...
```

**Messages Array (Before Injection):**
```javascript
[
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Summarize these messages...' }
]
```

**Messages Array (After Injection):**
```javascript
[
  {
    role: 'system',
    content: `<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

You are a helpful assistant.`
  },
  { role: 'user', content: 'Summarize these messages...' }
]
```

## Operation Type Determination

### Stack Trace Analysis Flow

```
Generate Error Stack Trace
         ↓
Parse Stack for Function Names
         ↓
Check in Priority Order:
         ↓
1. Scene Operations
   ├─ 'detectSceneBreak' → 'detect_scene_break'
   ├─ 'generateSceneRecap' (not running) → 'generate_scene_recap'
   ├─ 'generate_running_scene_recap' → 'generate_running_recap'
   └─ 'combine_scene_with_running_recap' → 'combine_scene_with_running'
         ↓
2. Validation Operations
   └─ 'validateRecap' → 'validate_recap'
         ↓
3. Lorebook Operations
   ├─ 'lookupLorebookEntry' → 'lorebook_entry_lookup'
   ├─ 'resolveLorebookEntry' → 'resolve_lorebook_entry'
   ├─ 'createLorebookEntry' → 'create_lorebook_entry'
   ├─ 'mergeLorebookEntry' → 'merge_lorebook_entry'
   ├─ 'updateRegistryEntryContent' → 'update_lorebook_registry'
   └─ 'bulk_registry_populate' → 'populate_registries'
         ↓
4. Default Fallback
   └─ No matches → 'chat'
         ↓
Return Operation Type
```

**Example Stack Trace:**
```
Error: Stack trace for operation type detection
    at determineOperationType (generateRawInterceptor.js:128)
    at wrappedGenerateRaw (generateRawInterceptor.js:30)
    at generateSceneRecap (sceneBreak.js:245)
    at processOperation (operationHandlers.js:156)
    at processQueue (operationQueue.js:89)
```

**Matching:**
- Found: `generateSceneRecap` in stack
- Does NOT contain: `runningSceneRecap.js`
- Result: `'generate_scene_recap'`

## Context Propagation Patterns

### Pattern 1: Single Operation

```javascript
// Set context
setOperationSuffix('-42-67');

// Perform operation
try {
  const recap = await generateSceneRecap(messages);
  // Context used here ↑
} finally {
  clearOperationSuffix();
}

// Context cleared
```

**Timeline:**
```
Time  Context         Action
----  ------------    ---------------------
T0    null            setOperationSuffix('-42-67')
T1    '-42-67'        generateSceneRecap() called
T2    '-42-67'        wrappedGenerateRaw() reads context
T3    '-42-67'        Metadata injected with suffix
T4    '-42-67'        LLM call proceeds
T5    '-42-67'        Response received
T6    '-42-67'        clearOperationSuffix() called
T7    null            Context cleared
```

### Pattern 2: Nested Operations (Context Overwrite)

```javascript
// Outer operation
setOperationSuffix('-42-67');
try {
  // Inner operation (OVERWRITES context)
  setOperationSuffix('-50');
  try {
    await innerOperation();
    // Uses '-50' context
  } finally {
    clearOperationSuffix();
    // Context now null (not restored to '-42-67')
  }

  // Outer operation continues WITHOUT context
  await outerOperation();
  // Uses null context (LOST)
} finally {
  clearOperationSuffix();
}
```

**Problem:**
Inner operation overwrites outer context, and clear sets to null instead of restoring.

**Solution:**
Save and restore context:
```javascript
// Outer operation
setOperationSuffix('-42-67');
try {
  // Save current context
  const savedSuffix = getOperationSuffix();

  // Inner operation
  setOperationSuffix('-50');
  try {
    await innerOperation();
  } finally {
    // Restore saved context
    if (savedSuffix !== null) {
      setOperationSuffix(savedSuffix);
    } else {
      clearOperationSuffix();
    }
  }

  // Outer operation continues with restored context
  await outerOperation();
} finally {
  clearOperationSuffix();
}
```

### Pattern 3: Sequential Operations

```javascript
// Operation 1
setOperationSuffix('-10-20');
try {
  await operation1();
} finally {
  clearOperationSuffix();
}

// Operation 2 (independent)
setOperationSuffix('-30-40');
try {
  await operation2();
} finally {
  clearOperationSuffix();
}
```

**Timeline:**
```
Time  Context         Operation
----  ------------    ---------------------
T0    null
T1    '-10-20'        operation1() starts
T2    '-10-20'        operation1() uses context
T3    null            operation1() clears
T4    '-30-40'        operation2() starts
T5    '-30-40'        operation2() uses context
T6    null            operation2() clears
```

## Metadata Replacement Logic

### Scenario: Extension Operation During Chat

**Initial State:**
User sends chat message, event handler runs first:

```javascript
// Event handler injects chat metadata
chatArray = [
  {
    role: 'system',
    content: `<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "chat-42"
}
</ST_METADATA>

System prompt here...`
  }
]
```

**Extension Operation:**
Scene recap operation triggers with same chat array:

```javascript
// Interceptor checks existing metadata
const existingOperation = getExistingOperation(chatArray);
// Returns: "chat-42"

// Is this a specific operation?
const isSpecificOperation = baseOperation !== 'chat';
// baseOperation = "generate_scene_recap"
// isSpecificOperation = true

// Inject with replaceIfChat=true
injectMetadataIntoChatArray(chatArray, {
  operation: "generate_scene_recap-42-67",
  replaceIfChat: true
});
```

**Replacement Logic:**
```javascript
if (existingOperation !== null) {
  if (options?.replaceIfChat === true) {
    // Only replace if existing is a chat-type operation
    if (!existingOperation.startsWith('chat')) {
      // Keep existing specific operation
      return;
    }
    // Replace chat-type with specific operation
  } else {
    // Don't replace
    return;
  }
}
```

**Result:**
```javascript
chatArray = [
  {
    role: 'system',
    content: `<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

System prompt here...`
  }
]
```

**Priority Rules:**
1. Specific operations (scene_recap, lorebook, etc.) > Generic chat
2. First specific operation wins (no replacement between specific types)
3. Generic chat is always replaced by specific operations

## Proxy Integration Flow

### Request Processing

```
Proxy Receives Request
         ↓
Parse Messages Array
         ↓
Extract First System Message
         ↓
Search for <ST_METADATA> Tag
         ↓
Found?
├─ Yes → Parse JSON
│         ├─ Extract: version, chat, operation
│         ├─ Validate: JSON structure
│         └─ Store metadata
└─ No → Use defaults
          └─ { operation: 'unknown', chat: 'unknown' }
         ↓
Determine Log Location
├─ Parse chat name
│    ├─ Single: "CharacterName - 2025-11-03@16h32m59s"
│    │    ├─ Character: "CharacterName"
│    │    └─ Timestamp: "2025-11-03@16h32m59s"
│    └─ Group: "GroupName"
│         ├─ Character: "GroupName"
│         └─ Timestamp: current timestamp
├─ Build path
│    └─ logs/characters/{character}/{timestamp}/
└─ Get next log number
     └─ Scan folder for existing logs
         ↓
Generate Filename
├─ Format: {number}-{operation}.md
└─ Example: 1-generate_scene_recap-42-67.md
         ↓
Strip Metadata
├─ Regex: /<ST_METADATA>[\s\S]*?<\/ST_METADATA>\n?\n?/
└─ Remove from all messages
         ↓
Forward Clean Request to LLM
         ↓
Receive Response
         ↓
Log Request + Response
├─ Write to: logs/characters/{character}/{timestamp}/{number}-{operation}.md
├─ Include: request data, response data, timing, headers
└─ Format as Markdown
         ↓
Forward Response to Client
```

### Log File Structure

**Filename:** `1-generate_scene_recap-42-67.md`

**Content:**
```markdown
# LLM Request Log

## Metadata
- **Operation:** generate_scene_recap-42-67
- **Chat:** CharacterName - 2025-11-03@16h32m59s
- **Timestamp:** 2025-11-03T16:32:59.123Z
- **Version:** 1.0

## Request
**Model:** claude-sonnet-3.5
**Temperature:** 0.8
**Max Tokens:** 500

### Messages
1. [SYSTEM] You are a helpful assistant.
2. [USER] Summarize these messages...

## Response
**Duration:** 2.34s
**Tokens:** 150

### Content
The user and assistant discuss going to the market...

## Timing
- Request sent: 16:32:59.123
- Response received: 16:33:01.463
- Duration: 2.34s
```

## Debugging Flows

### Debug: Context Not Propagating

**Symptoms:**
- Metadata shows base operation without suffix
- Expected: `generate_scene_recap-42-67`
- Actual: `generate_scene_recap`

**Debug Steps:**
1. Check context is set:
```javascript
setOperationSuffix('-42-67');
console.log('Set context:', getOperationSuffix()); // Should log '-42-67'
```

2. Check context before LLM call:
```javascript
const suffix = getOperationSuffix();
console.log('Before LLM call, suffix:', suffix); // Should log '-42-67'
```

3. Check context is not cleared early:
```javascript
setOperationSuffix('-42-67');
// ... operation code ...
console.log('Before clear, suffix:', getOperationSuffix()); // Should still be '-42-67'
clearOperationSuffix();
```

4. Check for nested operations overwriting context (see Pattern 2)

### Debug: Metadata Not Injected

**Symptoms:**
- Proxy receives request without metadata
- No `<ST_METADATA>` tag in logs

**Debug Steps:**
1. Check setting is enabled:
```javascript
const enabled = get_settings('first_hop_proxy_send_chat_details');
console.log('Metadata injection enabled:', enabled); // Should be true
```

2. Check interceptor is installed:
```javascript
// Look for console output on extension load:
// [Auto-Recap:Interceptor] ✓ Wrapped ctx.generateRaw
```

3. Check injection is called:
```javascript
// Add debug to injectMetadata:
console.log('[DEBUG] injectMetadata called with operation:', options?.operation);
```

4. Check for errors in console:
```javascript
// Look for:
// [Auto-Recap:Metadata] Error injecting metadata: ...
```

### Debug: Wrong Operation Type

**Symptoms:**
- Metadata shows unexpected operation type
- Expected: `generate_scene_recap`
- Actual: `chat`

**Debug Steps:**
1. Check stack trace detection:
```javascript
// Add to determineOperationType():
const stack = new Error('Stack trace').stack;
console.log('Stack trace:', stack);
```

2. Verify function names in stack:
```javascript
// Look for expected function name in stack
if (stack.includes('generateSceneRecap')) {
  console.log('Found generateSceneRecap in stack');
}
```

3. Check function name spelling:
```javascript
// Verify actual function name matches detection pattern
// File: sceneBreak.js
export async function generateSceneRecap(messages) {
  // Name must match pattern in determineOperationType()
}
```

## Summary

The Metadata Injection System flows through three main paths:

1. **Chat Messages** - Event-based interception with message index tracking
2. **Extension Operations** - Function wrapping with context-based suffixes
3. **Direct LLM Calls** - Explicit operation types with context suffixes

All paths converge on the same metadata format (XML-tagged JSON) which is:
- Extracted by the proxy for logging
- Stripped before forwarding to LLM
- Used to organize logs by character, chat, and operation

The system maintains operation context through a simple global variable that must be manually set and cleared around each operation to ensure proper isolation.

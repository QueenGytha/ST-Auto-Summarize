# generateRaw Interceptor - Data Flow

## Table of Contents

1. [Overview](#overview)
2. [Chat Message Flow](#chat-message-flow)
3. [Extension Operation Flow](#extension-operation-flow)
4. [Context Propagation Flow](#context-propagation-flow)
5. [Metadata Injection Flow](#metadata-injection-flow)
6. [Error Flow](#error-flow)
7. [Complete Request Examples](#complete-request-examples)
8. [Flow Diagrams](#flow-diagrams)

## Overview

This document traces the complete data flow for different types of LLM requests through the generateRaw interceptor system. Each section shows the path from initial call to final API request.

## Chat Message Flow

### Trigger: User Sends Message

```
User types message in ST UI and presses Send
    ↓
ST core: runGenerate()
    ↓
ST core: finishGenerating()
    ↓
ST core: Build chat array (system, user, assistant messages)
    ↓
ST core: Fire CHAT_COMPLETION_PROMPT_READY event
    ↓
Extension: Event handler intercepts
    ↓
Extension: Check if metadata injection enabled
    ↓
Extension: injectMetadataIntoChatArray(chat, { operation: 'chat' })
    ↓
Extension: Find/create system message
    ↓
Extension: Prepend metadata to system message content
    ↓
Extension: Return (array modified in place)
    ↓
ST core: Send modified chat array to API
    ↓
API: Receive request with metadata
    ↓
Proxy: Extract metadata, log, strip, forward to LLM
    ↓
LLM: Generate response (never sees metadata)
    ↓
Response flows back to ST
```

### Data Transformation

**Before Event Handler:**
```javascript
[
  {
    role: 'system',
    content: 'You are a helpful assistant.'
  },
  {
    role: 'user',
    content: 'Hello, how are you?'
  }
]
```

**After Event Handler (Metadata Injected):**
```javascript
[
  {
    role: 'system',
    content: `<ST_METADATA>
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "chat"
}
</ST_METADATA>

You are a helpful assistant.`
  },
  {
    role: 'user',
    content: 'Hello, how are you?'
  }
]
```

### Event Handler Code Path

```javascript
// In eventHandlers.js
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
  // Check if enabled
  const enabled = get_settings('first_hop_proxy_send_chat_details');
  if (!enabled) return;

  // Import injector
  const { injectMetadataIntoChatArray } = await import('./metadataInjector.js');

  // Process chat array
  if (promptData && Array.isArray(promptData.chat)) {
    injectMetadataIntoChatArray(promptData.chat, {
      operation: 'chat'
    });
  }
});
```

## Extension Operation Flow

### Trigger: Generate Scene Recap

```
User clicks "Generate Scene Recap" button
    ↓
UI: handleGenerateSceneRecap()
    ↓
Queue: enqueueOperation({ type: SCENE_RECAP, metadata: {...} })
    ↓
Queue: processQueue() picks up operation
    ↓
Handler: handle_scene_recap(operation)
    ↓
Handler: Set operation context
    setOperationSuffix('-42-67')
    ↓
Handler: generateSceneRecap(messageIndex, startIndex, endIndex)
    ↓
Scene: Build prompt with scene messages
    ↓
Scene: Call recap_text(prompt, prefill, presets, preset_name)
    ↓
Recap: connectionProfiles.withConnectionProfile(profile, async () => {
    ↓
Recap: wrappedGenerateRaw({ prompt: '...', ... })  ← INTERCEPTOR
    ↓
Interceptor: Check recursion guard
    ↓
Interceptor: Determine operation type → 'generate_scene_recap'
    ↓
Interceptor: Get operation suffix → '-42-67'
    ↓
Interceptor: Combine → 'generate_scene_recap-42-67'
    ↓
Interceptor: Detect string prompt
    ↓
Interceptor: injectMetadata(prompt, { operation: '...' })
    ↓
Metadata: createMetadataBlock({ operation: 'generate_scene_recap-42-67' })
    ↓
Metadata: formatMetadataBlock(metadata) → XML string
    ↓
Metadata: Prepend to prompt
    ↓
Interceptor: options.prompt = processedPrompt
    ↓
Interceptor: Call _importedGenerateRaw(options)
    ↓
ST: generateRaw sends request to API
    ↓
API: Receive request with metadata
    ↓
Proxy: Extract, log, strip, forward
    ↓
LLM: Generate scene recap
    ↓
Response: Return recap text
    ↓
Recap: Return to handler
    ↓
Handler: clearOperationSuffix()
    ↓
Handler: Store recap on message
    ↓
Handler: Operation complete
```

### Code Path

```javascript
// In sceneBreak.js
export async function generateSceneRecap(messageIndex, startIndex, endIndex) {
  // Set context
  setOperationSuffix(`-${startIndex}-${endIndex}`);

  try {
    // Build prompt
    const prompt = buildSceneRecapPrompt(messages);

    // Call recap_text (which calls generateRaw)
    const recap = await recap_text(
      prompt,
      prefill,
      include_presets,
      preset_name
    );

    return recap;
  } finally {
    // Always clear context
    clearOperationSuffix();
  }
}

// In recapping.js
export async function recap_text(prompt, prefill, include_presets, preset_name) {
  // Check for test override
  const __override = globalThis.__TEST_RECAP_TEXT_RESPONSE;
  if (typeof __override === 'string') {
    return __override;
  }

  // Build options
  const options = {
    prompt: prompt,
    use_instruct: false,
    // ... other options
  };

  // Call generateRaw (resolves to wrappedGenerateRaw via import)
  const result = await generateRaw(options);
  return result;
}

// In generateRawInterceptor.js
export async function wrappedGenerateRaw(options) {
  if (_isInterceptorActive) {
    return _importedGenerateRaw(options);
  }

  try {
    _isInterceptorActive = true;

    if (options && options.prompt) {
      const baseOperation = determineOperationType();  // 'generate_scene_recap'
      const suffix = getOperationSuffix();             // '-42-67'
      const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;

      if (typeof options.prompt === 'string') {
        const processedPrompt = injectMetadata(options.prompt, { operation });
        options.prompt = processedPrompt;
      }
    }

    return await _importedGenerateRaw(options);
  } finally {
    _isInterceptorActive = false;
  }
}
```

### Data Transformation

**Original Prompt:**
```
You are analyzing a scene in a roleplay.

Messages:
42: [User] Let's go to the park.
43: [Char] Great idea! I love the park.
...
67: [Char] What a wonderful day.

Generate a scene-level recap summarizing the key events.
```

**After Interceptor:**
```
<ST_METADATA>
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

You are analyzing a scene in a roleplay.

Messages:
42: [User] Let's go to the park.
43: [Char] Great idea! I love the park.
...
67: [Char] What a wonderful day.

Generate a scene-level recap summarizing the key events.
```

## Context Propagation Flow

### Problem: Async Context Across Call Boundaries

```
generateSceneRecap(42, 67)
    ↓
buildPrompt()
    ↓
recap_text()
    ↓
generateRaw()  ← Need to know: messages 42-67
```

**Without context system:** Would need to pass `startIndex, endIndex` through every function signature.

**With context system:** Set context once, read anywhere.

### Context Lifecycle

```
1. BEFORE Operation
   _context = { suffix: null }

2. SET Context
   setOperationSuffix('-42-67')
   _context = { suffix: '-42-67' }

3. PROPAGATE (automatic)
   Any nested call can read context via getOperationSuffix()

4. READ Context
   const suffix = getOperationSuffix()  // '-42-67'

5. CLEAR Context
   clearOperationSuffix()
   _context = { suffix: null }
```

### Multi-Operation Example

```javascript
// Operation A: Scene Recap 42-67
setOperationSuffix('-42-67');
try {
  await generateSceneRecap();  // Uses '-42-67' ✓
} finally {
  clearOperationSuffix();
}

// Context now null

// Operation B: Scene Recap 68-90
setOperationSuffix('-68-90');
try {
  await generateSceneRecap();  // Uses '-68-90' ✓
} finally {
  clearOperationSuffix();
}

// Context now null
```

### Context Flow Diagram

```
┌─────────────────────────────────────┐
│ High-Level Operation                │
│ generateSceneRecap(42, 67)          │
│                                     │
│ setOperationSuffix('-42-67')       │
└──────────┬──────────────────────────┘
           │
           ├─────────────────────────────┐
           │                             │
           ▼                             ▼
    ┌─────────────┐              ┌─────────────┐
    │ buildPrompt │              │ recap_text  │
    │             │              │             │
    │ (no args)   │              │ (no context)│
    └──────┬──────┘              └──────┬──────┘
           │                             │
           └──────────┬──────────────────┘
                      │
                      ▼
           ┌──────────────────────┐
           │ generateRaw          │
           │                      │
           │ Interceptor reads:   │
           │ getOperationSuffix() │
           │ → '-42-67'           │
           └──────────────────────┘
```

## Metadata Injection Flow

### String Prompt Injection

```
Input: options.prompt (string)
    ↓
Check: isMetadataInjectionEnabled()
    ↓
    ├─ false → Return original prompt
    └─ true  → Continue
    ↓
Create: metadata = {
  version: '1.0',
  chat: getChatName(),
  operation: 'generate_scene_recap-42-67'
}
    ↓
Format: metadataStr = `<ST_METADATA>\n${JSON.stringify(metadata, null, 2)}\n</ST_METADATA>\n\n`
    ↓
Prepend: processedPrompt = metadataStr + prompt
    ↓
Replace: options.prompt = processedPrompt
    ↓
Output: Modified options object
```

### Array Prompt Injection

```
Input: options.prompt (array of messages)
    ↓
Check: isMetadataInjectionEnabled()
    ↓
    ├─ false → Return (no modification)
    └─ true  → Continue
    ↓
Check: hasExistingMetadata(array)
    ↓
    ├─ true → Check replacement rules
    │   ├─ Existing specific operation → Keep it, return
    │   └─ Existing 'chat' operation + replaceIfChat=true → Strip and continue
    └─ false → Continue
    ↓
Create: metadata = {
  version: '1.0',
  chat: getChatName(),
  operation: 'chat'
}
    ↓
Format: metadataStr = `<ST_METADATA>\n...\n</ST_METADATA>\n\n`
    ↓
Find: firstSystemMessage = array.find(msg => msg.role === 'system')
    ↓
    ├─ Found → Prepend to system message content
    └─ Not found → Create new system message at array[0]
    ↓
Modify: array modified in place
    ↓
Output: Original array reference (now modified)
```

### Metadata Replacement Logic

```
Scenario 1: No existing metadata
    ↓
Inject new metadata

Scenario 2: Existing metadata for 'chat' operation
    ↓
New operation is specific (e.g., 'generate_scene_recap')
    ↓
replaceIfChat = true
    ↓
Strip old metadata, inject new

Scenario 3: Existing metadata for specific operation
    ↓
New operation is 'chat'
    ↓
Keep existing specific operation (don't replace)

Scenario 4: Existing metadata for specific operation
    ↓
New operation is different specific operation
    ↓
Keep first one (defer to existing)
```

### getChatName() Flow

```
Called to get chat identifier
    ↓
Check: selected_group exists?
    ├─ Yes → Get group name from groups array
    │   ↓
    │   Return: "GroupName"
    │
    └─ No → Get single character chat
        ↓
        Get: getCurrentChatId()
        ↓
        Return: "CharacterName - YYYY-MM-DD@HHhMMmSSs"
```

**Examples:**
- Single character: `"Anonfilly - 2025-11-03@16h32m59s"`
- Group chat: `"Adventure Party"`

## Error Flow

### Interceptor Error Handling

```
wrappedGenerateRaw called
    ↓
try {
    Set recursion flag
    ↓
    Process prompt
    ↓
    Inject metadata
    ↓
    Call original generateRaw
}
    ↓
catch (err) {
    Log error
    ↓
    Call original generateRaw anyway ← FALLBACK
}
    ↓
finally {
    Clear recursion flag ← ALWAYS
}
    ↓
Return result
```

### Metadata Injection Error Handling

```
injectMetadata called
    ↓
try {
    Check if enabled
    ↓
    Create metadata block
    ↓
    Format as XML
    ↓
    Prepend to prompt
    ↓
    Return modified prompt
}
    ↓
catch (err) {
    Log error
    ↓
    Return original unmodified prompt ← FALLBACK
}
```

### Installation Error Handling

```
installGenerateRawInterceptor called
    ↓
try {
    Get context object
    ↓
    Wrap ctx.generateRaw
    ↓
    Wrap window.generateRaw
    ↓
    Log success
}
    ↓
catch (err) {
    Log error
    ↓
    Continue without interception ← GRACEFUL DEGRADATION
}
```

### Error Principles

1. **Never break LLM calls**: Always fall back to original function
2. **Always log errors**: Report for debugging
3. **Graceful degradation**: Continue without interception if installation fails
4. **Always cleanup**: Use finally blocks for flags

## Complete Request Examples

### Example 1: Chat Message

**User Action:** Send message "Hello!"

**Full Flow:**
```
1. ST builds chat array:
[
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello!' }
]

2. ST fires CHAT_COMPLETION_PROMPT_READY event

3. Event handler checks: first_hop_proxy_send_chat_details = true

4. Event handler calls: injectMetadataIntoChatArray(array, { operation: 'chat' })

5. Metadata injector creates:
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "chat"
}

6. Metadata injector finds system message at index 0

7. Metadata injector prepends to system message content:
[
  {
    role: 'system',
    content: '<ST_METADATA>\n{\n  "version": "1.0",\n  "chat": "TestChar - 2025-11-03@16h32m59s",\n  "operation": "chat"\n}\n</ST_METADATA>\n\nYou are helpful.'
  },
  { role: 'user', content: 'Hello!' }
]

8. ST sends modified array to API

9. Proxy receives request, extracts metadata:
   - Chat: "TestChar - 2025-11-03@16h32m59s"
   - Operation: "chat"

10. Proxy logs metadata to database

11. Proxy strips metadata:
[
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello!' }
]

12. Proxy forwards to LLM

13. LLM generates response (never sees metadata)

14. Response flows back to ST
```

### Example 2: Scene Recap Generation

**User Action:** Click "Generate Scene Recap" for messages 42-67

**Full Flow:**
```
1. UI enqueues operation:
   { type: SCENE_RECAP, metadata: { messageIndex: 42, startIndex: 42, endIndex: 67 } }

2. Queue processor picks up operation

3. Handler: handle_scene_recap calls generateSceneRecap(42, 42, 67)

4. Scene generator sets context:
   setOperationSuffix('-42-67')
   _context = { suffix: '-42-67' }

5. Scene generator builds prompt:
   "You are analyzing a scene...\n\nMessages:\n42: [User] Let's go...\n..."

6. Scene generator calls:
   recap_text(prompt, prefill, include_presets, preset_name)

7. Recap function calls:
   generateRaw({ prompt: '...', use_instruct: false, ... })
   (Import resolves to wrappedGenerateRaw)

8. Interceptor entry:
   - Check recursion guard: false
   - Set flag: _isInterceptorActive = true

9. Interceptor determines operation type:
   - Generate stack trace
   - Find 'generateSceneRecap' in stack
   - Return 'generate_scene_recap'

10. Interceptor gets context suffix:
    - getOperationSuffix() returns '-42-67'

11. Interceptor combines:
    - operation = 'generate_scene_recap' + '-42-67'
    - operation = 'generate_scene_recap-42-67'

12. Interceptor detects string prompt

13. Interceptor calls:
    injectMetadata(prompt, { operation: 'generate_scene_recap-42-67' })

14. Metadata injector checks: first_hop_proxy_send_chat_details = true

15. Metadata injector creates metadata:
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}

16. Metadata injector formats as XML:
<ST_METADATA>
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

17. Metadata injector prepends to prompt:
processedPrompt = metadataStr + prompt

18. Interceptor replaces:
options.prompt = processedPrompt

19. Interceptor calls:
_importedGenerateRaw(options)

20. ST sends request to API

21. Proxy receives request, extracts metadata:
    - Chat: "TestChar - 2025-11-03@16h32m59s"
    - Operation: "generate_scene_recap-42-67"
    - Message range: 42-67 (parsed from suffix)

22. Proxy logs to database with operation type

23. Proxy strips metadata from prompt

24. Proxy forwards to LLM

25. LLM generates scene recap

26. Response returns: "The characters went to the park..."

27. Interceptor clears flag:
    _isInterceptorActive = false

28. Recap function returns result

29. Scene generator clears context:
    clearOperationSuffix()
    _context = { suffix: null }

30. Handler stores recap on message object

31. Handler updates UI

32. Operation complete
```

### Example 3: Lorebook Entry Lookup

**User Action:** LLM call triggers lorebook lookup

**Full Flow:**
```
1. Lorebook system calls:
   lookupLorebookEntry(query)

2. Lookup function calls:
   generateRaw({ prompt: 'Find entries matching: ...', ... })

3. Interceptor entry:
   - Recursion guard: false
   - Set flag: true

4. Interceptor determines operation:
   - Stack includes 'lookupLorebookEntry'
   - Return 'lorebook_entry_lookup'

5. Interceptor checks context:
   - getOperationSuffix() returns null (no context set)

6. Operation = 'lorebook_entry_lookup'

7. Inject metadata with operation

8. Call original generateRaw

9. Request sent to API with metadata:
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "lorebook_entry_lookup"
}

10. Proxy logs: Lorebook lookup operation

11. LLM generates entry matches

12. Response returns

13. Lookup function processes results
```

## Flow Diagrams

### Interceptor Decision Tree

```
generateRaw called
    |
    ├─> Direct import from script.js?
    |   └─> Call original (no interception)
    |
    └─> Import via index.js?
        └─> Resolve to wrappedGenerateRaw
            |
            ├─> Recursion guard active?
            |   └─> Call original directly
            |
            └─> Recursion guard inactive
                |
                ├─> Set guard = true
                |
                ├─> Metadata enabled?
                |   ├─> No → Skip to call
                |   └─> Yes → Continue
                |
                ├─> Determine operation type
                |
                ├─> Get context suffix
                |
                ├─> Combine operation + suffix
                |
                ├─> Detect prompt format
                |   ├─> String → injectMetadata
                |   └─> Array → injectMetadataIntoChatArray
                |
                ├─> Call _importedGenerateRaw
                |
                ├─> Clear guard = false (finally)
                |
                └─> Return result
```

### Context Lifecycle

```
┌────────────────────────────┐
│ Context Initially Null     │
│ _context = { suffix: null }│
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ Operation Starts           │
│ setOperationSuffix('-X-Y') │
│ _context = { suffix: ... } │
└────────────┬───────────────┘
             │
             ├──────────────────────────┐
             │                          │
             ▼                          ▼
    ┌────────────────┐        ┌────────────────┐
    │ Nested Call A  │        │ Nested Call B  │
    │ reads suffix   │        │ reads suffix   │
    └────────┬───────┘        └────────┬───────┘
             │                          │
             └──────────┬───────────────┘
                        │
                        ▼
            ┌──────────────────────┐
            │ Operation Completes  │
            │ clearOperationSuffix │
            │ _context = { ... }   │
            └──────────┬───────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │ Context Null Again   │
            │ Ready for next op    │
            └──────────────────────┘
```

### Metadata Injection Pipeline

```
Input Prompt
    |
    ├─> Check enabled
    |   └─> Disabled? → Return original
    |
    ├─> getChatName()
    |   ├─> Group chat? → Group name
    |   └─> Single chat → "Char - timestamp"
    |
    ├─> createMetadataBlock()
    |   └─> { version, chat, operation }
    |
    ├─> formatMetadataBlock()
    |   └─> <ST_METADATA>\n{...}\n</ST_METADATA>\n\n
    |
    ├─> Detect format
    |   ├─> String → Prepend to string
    |   └─> Array → Inject into system message
    |
    └─> Output Modified Prompt
```

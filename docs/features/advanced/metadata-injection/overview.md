# Metadata Injection

**Feature #161**
**Category:** Advanced

---

## Description

The Metadata Injection System provides comprehensive tracking of all LLM requests by injecting structured metadata into prompts. This enables downstream proxies to identify, log, and categorize requests based on their operation type, message ranges, and chat context without affecting LLM behavior.

The system operates transparently across all LLM calls - both from SillyTavern core (chat messages) and extension operations (recaps, scene detection, lorebook processing). Metadata is formatted as XML-tagged JSON blocks that proxies can parse and strip before forwarding to the LLM.

---

## Overview

### Purpose

**Problem:** In complex conversational systems with multiple extension operations running concurrently, it's difficult to:
- Track which operation triggered an LLM call
- Organize logs by operation type and context
- Debug extension behavior in production
- Analyze usage patterns and costs

**Solution:** The Metadata Injection System solves this by:
- Automatically tagging every LLM request with operation metadata
- Using a standardized format (XML-tagged JSON) that proxies can parse
- Providing operation context through thread-local storage
- Supporting both event-based and function-wrapping interception strategies

### Key Features

1. **Universal Coverage** - All LLM requests are tagged, including:
   - Normal chat messages from SillyTavern core
   - Extension operations (scene recaps, validation, lorebook processing)
   - Direct LLM client calls

2. **Operation Context Management** - Simple API for passing context through call stack:
   ```javascript
   setOperationSuffix('-42-67');  // Message range
   try {
     await generateRaw(...);  // Metadata includes suffix
   } finally {
     clearOperationSuffix();  // Always cleanup
   }
   ```

3. **Stack-Based Operation Detection** - Automatically determines operation type from call stack:
   - Scene operations: `generate_scene_recap`, `detect_scene_break`
   - Validation operations: `validate_recap`
   - Lorebook operations: `lorebook_entry_lookup`, `create_lorebook_entry`
   - Chat operations: `chat-{index}`, `chat-{index}-swipe{n}`

4. **Proxy Integration** - Standardized metadata format for downstream systems:
   ```xml
   <ST_METADATA>
   {
     "version": "1.0",
     "chat": "CharacterName - 2025-11-03@16h32m59s",
     "operation": "generate_scene_recap-42-67"
   }
   </ST_METADATA>
   ```

5. **Smart Replacement Logic** - Specific operations override generic chat metadata:
   - Chat metadata is replaced by extension operations
   - Specific operations preserve their metadata
   - Ensures most specific operation type is logged

---

## Usage

### Basic Usage (Automatic)

For most operations, metadata injection is completely automatic:

```javascript
// No special code needed - metadata injected automatically
const recap = await generateSceneRecap(messages);

// Metadata:
// operation: "generate_scene_recap"
```

### With Operation Context (Message Ranges)

For operations on message ranges, set context before calling:

```javascript
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';

// Set context for message range 42-67
setOperationSuffix('-42-67');
try {
  const recap = await generateSceneRecap(messages);
  // Metadata: operation: "generate_scene_recap-42-67"
} finally {
  clearOperationSuffix();  // Always cleanup
}
```

### LLM Client Direct Calls

For direct LLM client calls, pass explicit operation type:

```javascript
import { sendLLMRequest } from './llmClient.js';
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';

setOperationSuffix('-42-67');
try {
  const result = await sendLLMRequest(
    profileId,
    prompt,
    'generate_scene_recap',  // Explicit operation type
    options
  );
  // Metadata: operation: "generate_scene_recap-42-67"
} finally {
  clearOperationSuffix();
}
```

### Chat Messages (Automatic)

Chat messages are handled via event hooks with automatic message index tracking:

```javascript
// User sends message at index 42
// Event handler automatically injects:
// operation: "chat-42"

// User swipes to alternative 2
// Event handler automatically injects:
// operation: "chat-42-swipe2"
```

---

## Configuration

### Settings

**Setting Key:** `first_hop_proxy_send_chat_details`
**Type:** Boolean
**Default:** `false`
**Storage:** Per-profile setting

**UI Location:**
- Panel: "First-Hop Proxy Integration"
- Control: Checkbox labeled "Send Chat Details"

**Access:**
```javascript
import { get_settings } from './index.js';

const enabled = get_settings('first_hop_proxy_send_chat_details');
```

### Enabling Metadata Injection

1. Open ST-Auto-Recap settings
2. Find "First-Hop Proxy Integration" section
3. Check "Send Chat Details" checkbox
4. Metadata will be injected into all subsequent LLM requests

### Disabling Metadata Injection

1. Uncheck "Send Chat Details" checkbox
2. No metadata will be injected
3. LLM requests proceed normally without metadata

---

## Architecture

### Components

**1. Operation Context (`operationContext.js`)**
- Simple global variable for thread-local storage
- Stores operation suffix (e.g., `-42-67` for message ranges)
- Must be manually set and cleared around operations

**2. Metadata Injector (`metadataInjector.js`)**
- Constructs metadata blocks with version, chat, operation fields
- Formats metadata as XML-tagged JSON
- Provides injection functions for strings and message arrays
- Handles metadata detection and replacement logic

**3. Global Interceptor (`generateRawInterceptor.js`)**
- Wraps `generateRaw` function globally
- Determines operation type from call stack
- Injects metadata into all extension LLM calls
- Prevents infinite recursion with guard flag

**4. Event Handler (`eventHandlers.js`)**
- Hooks `CHAT_COMPLETION_PROMPT_READY` event
- Injects metadata for normal chat messages
- Tracks message index and swipe status
- Avoids double-injection when extension operations run

### Metadata Format

**Structure:**
```javascript
{
  version: '1.0',           // Schema version
  chat: 'CharName - ...',   // Full chat identifier with timestamp
  operation: 'op-suffix'    // Operation type with optional suffix
}
```

**Formatted:**
```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

```

**Placement:**
- Prepended to string prompts
- Inserted into first system message of message arrays
- Always appears at the beginning of prompt content

### Operation Types

**Chat Operations:**
- `chat` - Base chat message
- `chat-{index}` - Chat at message index
- `chat-{index}-swipe{n}` - Chat swipe

**Scene Operations:**
- `detect_scene_break` - Scene break detection
- `generate_scene_recap` - Scene recap generation
- `generate_running_recap` - Running scene recap
- `combine_scene_with_running` - Combine scene with running recap

**Validation:**
- `validate_recap` - Recap validation

**Lorebook:**
- `lorebook_entry_lookup` - Entity lookup
- `resolve_lorebook_entry` - Entry deduplication
- `create_lorebook_entry` - Entry creation
- `merge_lorebook_entry` - Entry merging
- `update_lorebook_registry` - Registry update
- `populate_registries` - Bulk registry population

---

## Examples

### Example 1: Automatic Scene Recap

```javascript
// Extension code (no special setup needed)
const recap = await generateSceneRecap(messages);

// Interceptor automatically injects:
{
  "version": "1.0",
  "chat": "Anonfilly - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap"
}
```

### Example 2: Scene Recap with Message Range

```javascript
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';

setOperationSuffix('-42-67');
try {
  const recap = await generateSceneRecap(messages);
} finally {
  clearOperationSuffix();
}

// Injected metadata:
{
  "version": "1.0",
  "chat": "Anonfilly - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
```

### Example 3: Chat Message with Swipe

```javascript
// User sends message at index 42
// Event handler automatically injects:
{
  "version": "1.0",
  "chat": "Anonfilly - 2025-11-03@16h32m59s",
  "operation": "chat-42"
}

// User swipes to alternative 2 (swipe_id = 1)
// Event handler updates to:
{
  "version": "1.0",
  "chat": "Anonfilly - 2025-11-03@16h32m59s",
  "operation": "chat-42-swipe2"
}
```

### Example 4: Lorebook Entry Creation

```javascript
// Extension calls createLorebookEntry()
// Interceptor detects from stack and injects:
{
  "version": "1.0",
  "chat": "Anonfilly - 2025-11-03@16h32m59s",
  "operation": "create_lorebook_entry"
}
```

---

## Proxy Integration

### Extracting Metadata

**Python Example:**
```python
import re
import json

def extract_metadata(content):
    match = re.search(r'<ST_METADATA>\s*(\{[^}]+\})\s*</ST_METADATA>', content)
    if match:
        return json.loads(match.group(1))
    return None

# Extract from system message
metadata = extract_metadata(request.messages[0].content)
# {"version": "1.0", "chat": "...", "operation": "generate_scene_recap-42-67"}
```

### Stripping Metadata

**Python Example:**
```python
def strip_metadata(content):
    return re.sub(r'<ST_METADATA>[\s\S]*?</ST_METADATA>\n?\n?', '', content)

# Strip from all messages before forwarding
for msg in request.messages:
    msg.content = strip_metadata(msg.content)
```

### Organizing Logs

**Directory Structure:**
```
logs/
├─ characters/
│  ├─ CharacterName/
│  │  ├─ 2025-11-03@16h32m59s/
│  │  │  ├─ 1-chat-42.md
│  │  │  ├─ 2-generate_scene_recap-42-67.md
│  │  │  ├─ 3-chat-43.md
│  │  │  └─ 4-validate_recap-42-67.md
```

**Log Filename Format:**
- `{number}-{operation}.md`
- Sequential numbering across all operations
- Operation type preserved in filename

---

## Best Practices

### Always Use Try/Finally

```javascript
// CORRECT - context always cleared
setOperationSuffix('-42-67');
try {
  await operation();
} finally {
  clearOperationSuffix();
}

// WRONG - context may leak
setOperationSuffix('-42-67');
await operation();
clearOperationSuffix();  // Skipped if operation() throws
```

### Save/Restore for Nested Operations

```javascript
// Save current context before overwriting
const savedSuffix = getOperationSuffix();

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
```

### Check Setting Before Custom Injection

```javascript
import { isMetadataInjectionEnabled } from './metadataInjector.js';

if (isMetadataInjectionEnabled()) {
  // Custom metadata logic
}
```

---

## Debugging

### Verify Installation

Check console on extension load:
```
[Auto-Recap:Interceptor] Installing generateRaw interceptor...
[Auto-Recap:Interceptor] ✓ Wrapped ctx.generateRaw
[Auto-Recap:Interceptor] ✓ Interceptor installed successfully
```

### Verify Chat Injection

Enable setting, send message, check console:
```
[Interceptor] Processing chat array for CHAT_COMPLETION_PROMPT_READY
[Auto-Recap:Interceptor] Injected metadata into existing system message
[Auto-Recap:Interceptor] Metadata: {"version":"1.0","chat":"...","operation":"chat-42"}
```

### Verify Extension Operations

Trigger recap, check console:
```
[Auto-Recap:Interceptor] wrappedGenerateRaw called!
[Auto-Recap:Interceptor] Operation type: generate_scene_recap
[Auto-Recap:Interceptor] Processed prompt (first 200 chars): <ST_METADATA>...
```

### Common Issues

**Issue: Metadata not injected**
- Check: `first_hop_proxy_send_chat_details` setting is enabled
- Check: Interceptor installed successfully (console logs)
- Check: No errors in console during injection

**Issue: Wrong operation type**
- Check: Function names match detection patterns
- Check: Stack trace includes expected function names
- Add debug logs to `determineOperationType()`

**Issue: Context not propagating**
- Check: Context set before LLM call
- Check: Context not cleared too early
- Check: No nested operations overwriting context

---

## Related Documentation

- **[Implementation](./implementation.md)** - Detailed technical implementation
- **[Data Flow](./data-flow.md)** - Complete data flow diagrams
- **[Proxy Integration](../../PROXY_INTEGRATION.md)** - First-hop proxy setup
- **[Advanced Features](../README.md)** - Other advanced features
- **[Main Feature Overview](../../overall-overview.md)** - All features

---

**Status:** Implemented and Active - Production ready

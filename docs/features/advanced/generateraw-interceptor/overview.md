# generateRaw Interceptor

**Feature #160**
**Category:** Advanced Infrastructure

---

## Description

The generateRaw interceptor is a critical infrastructure component that wraps SillyTavern's `generateRaw()` function to intercept ALL LLM requests and inject structured metadata for downstream proxy logging and processing.

---

## Overview

The interceptor uses function wrapping to transparently inject metadata into every LLM request made by the extension and (partially) by SillyTavern core. This enables first-hop proxies to:

- **Log operations** by type (chat, recap, scene_recap, lorebook operations)
- **Track chat context** with full chat identifiers matching Auto-Lorebooks naming
- **Filter requests** based on operation metadata
- **Analyze usage patterns** across different operation types

### Key Capabilities

1. **Universal Interception**: Wraps `generateRaw` globally to catch all extension LLM calls
2. **Event-Based Augmentation**: Hooks ST events to catch chat message generations
3. **Operation Type Detection**: Analyzes call stack to automatically determine operation type
4. **Context Propagation**: Maintains operation context (message ranges, scene indices) across async boundaries
5. **Transparent Operation**: Existing code continues working without modifications
6. **Graceful Fallback**: If interception fails, requests proceed normally

### Two Interception Strategies

**1. Function Wrapping (Extension Operations)**

Replaces `ctx.generateRaw` and `window.generateRaw` with `wrappedGenerateRaw`:

```javascript
import { wrappedGenerateRaw } from './index.js';
await wrappedGenerateRaw({ prompt: '...' });
```

Covers: Recaps, scene recaps, validation, lorebook operations, any extension code.

**2. Event Interception (Chat Messages)**

Hooks `CHAT_COMPLETION_PROMPT_READY` event before ST sends chat to API:

```javascript
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
  injectMetadataIntoChatArray(promptData.chat, { operation: 'chat' });
});
```

Covers: Normal chat messages, SillyTavern core generation.

### Why Two Approaches?

SillyTavern uses different code paths:
- **Chat messages**: `runGenerate` → direct API call (can't wrap)
- **Extension operations**: `generateRaw()` function (can wrap)

We can't modify ST core, so we use events for chat and function wrapping for extensions.

---

## Usage

### Automatic Operation

The interceptor is **always active** after installation. No code changes required.

### Installation

Installed automatically during extension initialization:

```javascript
// In eventHandlers.js, during jQuery ready handler
installGenerateRawInterceptor();
```

Must be installed BEFORE any code uses `generateRaw`.

### Enabling Metadata Injection

Controlled by single setting:

**Settings UI**: First-Hop Proxy Integration → "Send Chat Details"

**Setting key**: `first_hop_proxy_send_chat_details` (boolean, default: false)

When disabled, interceptor is installed but metadata injection is skipped.

### Using Operation Context

For operations that need to pass context (message ranges, etc.):

```javascript
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';

async function myOperation(startIndex, endIndex) {
  // Set context before any async LLM calls
  setOperationSuffix(`-${startIndex}-${endIndex}`);

  try {
    // Any generateRaw calls will include suffix in operation
    await generateRaw({ prompt: '...' });
    // Metadata will show: "my_operation-42-67"
  } finally {
    // ALWAYS clear context, even on error
    clearOperationSuffix();
  }
}
```

**Critical:** Always use try-finally to prevent context leaks.

---

## Configuration

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `first_hop_proxy_send_chat_details` | boolean | false | Enable metadata injection into all LLM requests |

### Metadata Format

```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>
```

**Fields:**
- `version`: Schema version (always "1.0")
- `chat`: Full chat identifier matching `{{chat}}` macro
  - Single character: `"CharName - YYYY-MM-DD@HHhMMmSSs"`
  - Group: `"GroupName"`
- `operation`: Operation type with optional suffix
  - Base type from stack analysis (e.g., `generate_scene_recap`)
  - Optional suffix from context (e.g., `-42-67` for message range)
  - Combined: `generate_scene_recap-42-67`

### Operation Types

| Operation | Description | Trigger |
|-----------|-------------|---------|
| `chat` | Normal chat message | User sends message |
| `generate_scene_recap` | Single scene recap | Scene recap generation |
| `generate_running_recap` | Running scene recap | Running recap combination |
| `combine_scene_with_running` | Combine scene with running | Scene merge operation |
| `detect_scene_break` | Auto scene detection | Scene break analysis |
| `validate_recap` | Recap validation | Validation operation |
| `lorebook_entry_lookup` | Lorebook lookup | Entry lookup stage |
| `resolve_lorebook_entry` | Lorebook deduplication | Entry resolution |
| `create_lorebook_entry` | Create entry | New entry creation |
| `merge_lorebook_entry` | Merge entries | Entry merging |
| `update_lorebook_registry` | Update registry | Registry update |
| `populate_registries` | Bulk population | Bulk registry operation |
| `unknown` | Unrecognized | Stack analysis failed |

---

## Examples

### Example 1: Normal Chat Message

**User action:** Send message "Hello!"

**Result:**
```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "chat"
}
</ST_METADATA>

[Rest of prompt...]
```

### Example 2: Scene Recap Generation

**User action:** Generate scene recap for messages 42-67

**Context set:**
```javascript
setOperationSuffix('-42-67');
```

**Result:**
```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

[Scene recap prompt...]
```

### Example 3: Lorebook Lookup

**Trigger:** Automatic lorebook entry lookup

**Result:**
```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "lorebook_entry_lookup"
}
</ST_METADATA>

[Lookup prompt...]
```

### Example 4: Using Test Overrides

For testing without calling LLM:

```javascript
// In test file
globalThis.__TEST_RECAP_TEXT_RESPONSE = 'Mock recap text';

// Function that calls generateRaw will check override
const result = await recap_text(prompt);
// Returns 'Mock recap text' without LLM call
```

---

## Verification

### Console Logs

Enable debug logging to see interceptor activity:

**Installation:**
```
[Auto-Recap:CORE] [Interceptor] Installing generateRaw interceptor...
[Auto-Recap:CORE] [Interceptor] ✓ Wrapped ctx.generateRaw
[Auto-Recap:CORE] [Interceptor] ✓ Wrapped window.generateRaw
[Auto-Recap:CORE] [Interceptor] ✓ Interceptor installed successfully
```

**Request processing:**
```
[Auto-Recap:CORE] [Interceptor] wrappedGenerateRaw called! isInterceptorActive: false
[Auto-Recap:CORE] [Interceptor] Operation type: generate_scene_recap-42-67
[Auto-Recap:CORE] [Interceptor] Processing string prompt (first 100 chars): ...
[Auto-Recap:CORE] [Interceptor] Processed prompt (first 200 chars): <ST_METADATA>...
```

### Network Inspection

1. Open browser DevTools → Network tab
2. Enable metadata injection in settings
3. Trigger any LLM operation
4. Inspect request payload
5. Look for `<ST_METADATA>` block in prompt

---

## Implementation Details

### Key Components

1. **generateRawInterceptor.js**
   - Main wrapper function
   - Operation type detection from call stack
   - Recursion prevention
   - Integration with metadata injector

2. **metadataInjector.js**
   - Metadata block creation
   - XML formatting
   - String and array prompt injection
   - Replacement logic for existing metadata

3. **operationContext.js**
   - Thread-local context storage
   - Suffix propagation across async boundaries
   - Context lifecycle management

4. **eventHandlers.js**
   - Installation during extension init
   - Event-based chat message interception

### Recursion Prevention

```javascript
let _isInterceptorActive = false;

export async function wrappedGenerateRaw(options) {
  // Prevent infinite recursion
  if (_isInterceptorActive) {
    return _importedGenerateRaw(options);
  }

  try {
    _isInterceptorActive = true;
    // Process request...
    return await _importedGenerateRaw(options);
  } finally {
    _isInterceptorActive = false;
  }
}
```

### Error Handling

All errors are caught and logged, but never prevent LLM calls:

```javascript
try {
  // Inject metadata...
} catch (err) {
  error('[Interceptor] Error:', err);
  // Fall back to original prompt
  return await _importedGenerateRaw(options);
}
```

---

## Related Documentation

- [implementation.md](./implementation.md) - Complete implementation details (600+ lines)
- [data-flow.md](./data-flow.md) - Complete data flow diagrams and examples (300+ lines)
- [PROXY_INTEGRATION.md](../../PROXY_INTEGRATION.md) - Proxy integration guide
- [Advanced Features](../README.md) - Other advanced features
- [Documentation Hub](../../../README.md) - All extension documentation

---

## Proxy Implementation

### Parsing Metadata

```python
import re
import json

def extract_metadata(content):
    match = re.search(r'<ST_METADATA>\s*(\{[^}]+\})\s*</ST_METADATA>', content)
    if match:
        return json.loads(match.group(1))
    return None
```

### Stripping Metadata

```python
def strip_metadata(content):
    return re.sub(r'<ST_METADATA>[\s\S]*?</ST_METADATA>\n?\n?', '', content)
```

### Logging

```python
metadata = extract_metadata(prompt)
if metadata:
    log_to_database(
        chat=metadata['chat'],
        operation=metadata['operation'],
        timestamp=datetime.now()
    )

# Strip before forwarding to LLM
clean_prompt = strip_metadata(prompt)
```

---

**Status:** Fully Documented - Implementation details and data flow traced end-to-end

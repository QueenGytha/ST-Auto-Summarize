# First-Hop Proxy Integration

This document explains how the ST-Auto-Summarize extension adds metadata to LLM requests for downstream proxy logging.

## Overview

The extension injects structured metadata into **ALL LLM requests**, including:
- Normal chat messages from SillyTavern core
- Extension-generated requests (summaries, lorebook operations, etc.)

The metadata is added as XML-tagged JSON blocks that proxies can parse and strip before forwarding to the LLM.

## Architecture

### Two Interception Points

**1. Event-Based Interception (Chat Messages)**
- Hooks into `CHAT_COMPLETION_PROMPT_READY` event
- Intercepts normal chat generation before API call
- Modifies the `chat` array of messages in place
- See: `eventHandlers.js:276-305`

**2. Function Wrapping (Extension Operations)**
- Wraps `generateRaw` function for extension code
- Extension modules import wrapped version via `index.js`
- Processes prompt strings before calling original function
- See: `generateRawInterceptor.js`

### Why Two Approaches?

SillyTavern uses different code paths for different operations:
- **Chat messages**: Use `runGenerate` → `finishGenerating` → direct API call
- **Extension operations**: Use `generateRaw` function

We cannot modify ST core files, so we use event hooks for chat and function wrapping for extensions.

## Metadata Format

### XML-Tagged JSON Block

```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "Anonfilly - 2025-11-03@16h32m59s",
  "operation": "chat"
}
</ST_METADATA>
```

### Fields

- `version`: Schema version ("1.0")
- `chat`: Full chat identifier with timestamp (e.g., "CharacterName - 2025-11-03@16h32m59s") or group name. Matches the `{{chat}}` macro value used in Auto-Lorebooks naming.
- `operation`: Operation type (chat, message_summary, scene_summary, lorebook, etc.)
- `timestamp`: (optional) ISO 8601 timestamp
- `custom`: (optional) Custom operation-specific data

## Settings

### UI Control

Single checkbox in settings UI:
- **Send Chat Details** - Enable metadata injection

Located in: "First-Hop Proxy Integration" section

### Implementation

- Setting key: `first_hop_proxy_send_chat_details` (per-profile)
- When `false`: No metadata injected
- When `true`: Metadata injected into all LLM requests

## File Structure

### Core Files

1. **metadataInjector.js**
   - `getChatName()` - Get full chat identifier with timestamp (matches {{chat}} macro)
   - `createMetadataBlock()` - Build metadata object
   - `formatMetadataBlock()` - Format as XML-tagged JSON
   - `injectMetadata()` - Inject into string prompt (for generateRaw)
   - `injectMetadataIntoChatArray()` - Inject into chat array (for events)

2. **generateRawInterceptor.js**
   - `wrappedGenerateRaw()` - Wrapped version of generateRaw
   - `installGenerateRawInterceptor()` - Install global wrapper
   - `determineOperationType()` - Infer operation from call stack

3. **eventHandlers.js** (modified)
   - Event handler for `CHAT_COMPLETION_PROMPT_READY`
   - Calls injector functions on chat array

4. **defaultSettings.js** (modified)
   - Added `first_hop_proxy_send_chat_details: false`

5. **settings.html** (modified)
   - Added UI section with checkbox

6. **settingsUI.js** (modified)
   - Bound checkbox to setting

## How It Works

### Chat Message Flow

1. User sends message in ST
2. ST builds chat array (system, user, assistant messages)
3. ST fires `CHAT_COMPLETION_PROMPT_READY` event
4. **Our event handler intercepts:**
   - Checks if `first_hop_proxy_send_chat_details` enabled
   - Injects metadata into first system message
5. ST sends modified array to API
6. Proxy receives request with metadata
7. Proxy logs/processes metadata
8. Proxy strips metadata and forwards to LLM

### Extension Operation Flow

1. Extension calls `generateRaw({ prompt: '...' })`
2. Import resolves to `wrappedGenerateRaw` (via index.js)
3. **Wrapper processes:**
   - Checks if enabled
   - Injects metadata header into prompt
4. Calls original `_importedGenerateRaw`
5. Request sent to API with metadata

## Testing

### Verify Installation

Check console logs on extension load:
```
[Auto-Summarize:Interceptor] Installing generateRaw interceptor...
[Auto-Summarize:Interceptor] ✓ Wrapped ctx.generateRaw
[Auto-Summarize:Interceptor] ✓ Interceptor installed successfully
```

### Verify Chat Interception

Enable checkbox, send a message, check console:
```
[Interceptor] Processing chat array for CHAT_COMPLETION_PROMPT_READY
[Auto-Summarize:Interceptor] Injected metadata into existing system message
[Auto-Summarize:Interceptor] Metadata: {"version":"1.0","chat":"Anonfilly - 2025-11-03@16h32m59s","operation":"chat"}
```

### Verify Extension Operations

Trigger a summary, check console:
```
[Auto-Summarize:Interceptor] wrappedGenerateRaw called!
[Auto-Summarize:Interceptor] Processing prompt (first 100 chars): ...
[Auto-Summarize:Interceptor] Operation type: summary
[Auto-Summarize:Interceptor] Processed prompt (first 200 chars): <ST_METADATA>...
```

## Proxy Implementation

### Parsing Metadata

Extract JSON from XML tags:
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

Remove before forwarding to LLM:
```python
def strip_metadata(content):
    # Remove ST_METADATA blocks
    content = re.sub(r'<ST_METADATA>[\s\S]*?</ST_METADATA>\n?\n?', '', content)
    return content
```

## Limitations

1. **Cannot intercept ST core direct imports** - We can only hook events and wrap functions, not modify ST core code
2. **Chat array mutation** - Event handler mutates the array in place (ST expects this)

## Future Enhancements

Potential additions:
- `timestamp` field for request timing
- `user_id` or session identifiers
- Token count estimates
- Model/preset information
- Custom metadata per operation type

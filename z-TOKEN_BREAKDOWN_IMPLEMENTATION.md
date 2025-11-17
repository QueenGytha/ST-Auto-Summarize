# Token Breakdown Implementation - Complete Guide

This document explains the complete token breakdown system that captures, sends to first-hop proxy, and displays token usage information for all LLM operations.

## Overview

The system calculates detailed token breakdowns for every LLM request and:
1. **Sends to first-hop proxy** - Included in ST_METADATA for logging
2. **Stores in operation metadata** - Available in operation tooltips
3. **Logs debug output** - Detailed breakdown in console

## Architecture

### Core Components

1. **`tokenBreakdown.js`** - Shared token calculation utilities
2. **`llmClient.js`** - Calculates and attaches breakdown to responses
3. **`metadataInjector.js`** - Includes breakdown in proxy metadata
4. **`operationQueueUI.js`** - Displays breakdown in tooltips

## How It Works

### 1. Token Calculation (llmClient.js)

When `sendLLMRequest()` is called:

```javascript
// Step 7: Calculate token breakdown BEFORE metadata injection
const { calculateTokenBreakdownFromMessages } = await import('./tokenBreakdown.js');
const tokenBreakdown = calculateTokenBreakdownFromMessages(messages, {
  max_context: presetData.max_context,
  max_tokens: presetMaxTokens
});
```

The breakdown includes:
- **Content tokens**: preset, system, user, prefill
- **Overhead tokens**: JSON structure, metadata
- **Context limits**: max_context, max_tokens, available

### 2. Proxy Metadata (metadataInjector.js)

The breakdown is included in ST_METADATA sent to first-hop proxy:

```javascript
// Step 8: Inject metadata including token breakdown
await injectMetadataIntoChatArray(messagesWithMetadata, {
  operation: fullOperation,
  tokenBreakdown: tokenBreakdown  // ← Sent to proxy
});
```

**Proxy receives:**
```json
{
  "version": "1.0",
  "chat": "Character Name - 2025-01-15@12h34m56s",
  "operation": "detect_scene_break-0-10",
  "tokens": {
    "max_context": 200000,
    "max_response": 4096,
    "available_for_prompt": 195904,
    "content": {
      "preset": 1234,
      "system": 45,
      "user": 3456,
      "prefill": 123,
      "lorebooks": null,
      "messages": null,
      "subtotal": 4858
    },
    "overhead": {
      "json_structure": 234,
      "metadata": 56,
      "subtotal": 290
    },
    "total": 5148
  }
}
```

### 3. Response Attachment (llmClient.js)

The breakdown is attached to the response string for operation handlers:

```javascript
// Step 13: Attach token breakdown as non-enumerable property
Object.defineProperty(finalResult, '__tokenBreakdown', {
  value: tokenBreakdown,
  enumerable: false,  // Doesn't interfere with string operations
  writable: false
});
```

### 4. Operation Metadata Capture (operation handlers)

Handlers can extract and store the breakdown:

```javascript
import { getTokenBreakdownForMetadata } from './tokenBreakdown.js';
import { updateOperationMetadata } from './operationQueue.js';

// After getting LLM response
const response = await sendLLMRequest(...);

// Extract token breakdown
const tokenData = getTokenBreakdownForMetadata(response);

// Update operation metadata
await updateOperationMetadata(operation.id, tokenData);
```

### 5. Tooltip Display (operationQueueUI.js)

The tooltip shows the breakdown on mouseover:

```
=== TOKEN BREAKDOWN ===
Max Context: 200,000
Reply Reserved: 4,096
Available: 195,904

Content:
  Preset: 1,234
  System: 45
  User: 3,456
  Prefill: 123
  Subtotal: 4,858

Overhead:
  JSON: 234
  Metadata: 56
  Subtotal: 290

TOTAL: 5,148

[rest of operation metadata]
```

## Token Types Explained

### Content Tokens

| Type | Description | Source |
|------|-------------|--------|
| **Preset** | Preset prompt messages | Completion preset (e.g., "bbypwg-claude35") |
| **System** | System prompt | OpenAI API only: "You are a data extraction system..." |
| **User** | User prompt content | The actual operation prompt text |
| **Prefill** | Assistant prefill | From settings (e.g., `{"scene_name": "`) |

### Overhead Tokens

| Type | Description | Example |
|------|-------------|---------|
| **JSON Structure** | Message array formatting | `{"role":"user","content":"..."}` |
| **Metadata** | ST_METADATA block | `<ST_METADATA>\n{...}\n</ST_METADATA>` |

### Context Limits

| Field | Description |
|-------|-------------|
| **Max Context** | Model's total context window (from preset) |
| **Reply Reserved** | Tokens reserved for response (max_tokens from preset) |
| **Available** | Context available for prompt (max_context - max_tokens) |

## Usage Examples

### Example 1: Capture Breakdown in Operation Handler

```javascript
// In operationHandlers.js
registerOperationHandler(OperationType.DETECT_SCENE_BREAK, async (operation) => {
  // ... prepare prompt ...

  // Send LLM request (breakdown auto-attached)
  const response = await sendLLMRequest(profileId, prompt, OperationType.DETECT_SCENE_BREAK, {
    prefill: settings.prefill,
    includePreset: settings.include_preset,
    preset: settings.preset_name
  });

  // Extract token breakdown
  const { getTokenBreakdownForMetadata } = await import('./tokenBreakdown.js');
  const tokenData = getTokenBreakdownForMetadata(response);

  // Store in operation metadata
  await updateOperationMetadata(operation.id, tokenData);

  // ... continue with response processing ...
});
```

### Example 2: Add Lorebook/Message Token Counts

If you have additional token counts to include (e.g., from lorebook entries or messages):

```javascript
const tokenData = getTokenBreakdownForMetadata(response);

// Add custom token counts
tokenData.tokens_lorebooks = lorebookTokenCount;
tokenData.tokens_messages = messageTokenCount;

await updateOperationMetadata(operation.id, tokenData);
```

### Example 3: Check Available Context Before Sending

```javascript
const tokenBreakdown = calculateTokenBreakdownFromMessages(messages, {
  max_context: presetMaxContext,
  max_tokens: presetMaxTokens
});

const available = tokenBreakdown.max_context - tokenBreakdown.max_tokens;

if (tokenBreakdown.total > available) {
  throw new Error(`Prompt too large: ${tokenBreakdown.total} > ${available}`);
}
```

## Shared Functions Reference

### `tokenBreakdown.js`

#### `calculateTokenBreakdown(prompt, includePreset, preset, prefill, operationType, options)`
Calculates breakdown by building message array from scratch.
- **Used by**: `autoSceneBreakDetection.js` (token limit checks)
- **Returns**: Breakdown object with all components

#### `calculateTokenBreakdownFromMessages(messages, contextInfo)`
Calculates breakdown from already-built message array.
- **Used by**: `llmClient.js` (automatic calculation)
- **Returns**: Breakdown object with context info included

#### `getTokenBreakdownForMetadata(response)`
Extracts breakdown from LLM response and formats for metadata.
- **Used by**: Operation handlers (metadata capture)
- **Returns**: Flat object ready for `updateOperationMetadata()`

#### `extractTokenBreakdownFromResponse(response)`
Gets raw breakdown from response.
- **Used by**: Advanced use cases
- **Returns**: Breakdown object or null

## First-Hop Proxy Logging

The proxy logs the token breakdown in multiple places:

1. **Stripped ST_METADATA section** - Shows what was removed before forwarding
2. **Original Request Data** - Shows the complete request as received
3. **Forwarded Request Data** - Shows the cleaned request sent to LLM

Example log file (`logs/characters/CharName/2025-01-15@12h34m56s/00001-detect_scene_break.md`):

```markdown
## Stripped ST_METADATA

*1 block*

\```json
{
  "version": "1.0",
  "chat": "Elara - 2025-01-15@12h34m56s",
  "operation": "detect_scene_break-0-10",
  "tokens": {
    "max_context": 200000,
    "max_response": 4096,
    ...
  }
}
\```
```

## Benefits

1. **Complete visibility** - Know exactly what's being sent and where tokens are used
2. **Debugging** - Identify token-heavy components
3. **Optimization** - Find opportunities to reduce token usage
4. **Troubleshooting** - Diagnose "prompt too large" errors
5. **Auditing** - Track token usage across operations

## Implementation Status

✅ **Complete** - All components implemented:
- [x] Token breakdown calculator (`tokenBreakdown.js`)
- [x] LLM client integration (`llmClient.js`)
- [x] Proxy metadata injection (`metadataInjector.js`)
- [x] Tooltip display (`operationQueueUI.js`)
- [x] Helper functions for extraction and formatting
- [x] Shared logic (no duplication)

## Next Steps for Developers

To add token breakdown capture to an operation handler:

1. Import the helper:
   ```javascript
   import { getTokenBreakdownForMetadata } from './tokenBreakdown.js';
   ```

2. Extract after LLM call:
   ```javascript
   const response = await sendLLMRequest(...);
   const tokenData = getTokenBreakdownForMetadata(response);
   ```

3. Update operation metadata:
   ```javascript
   await updateOperationMetadata(operation.id, tokenData);
   ```

That's it! The breakdown will automatically appear in tooltips and proxy logs.

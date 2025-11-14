# Operation Suffix Management

**Feature #163**
**Category:** Advanced Infrastructure

---

## Description

Operation suffix management is a lightweight context propagation system that allows high-level operations to pass contextual information (message ranges, validation types, entry names) down to the generateRaw interceptor without modifying function signatures. Suffixes are appended to operation metadata to create traceable operation identifiers.

---

## Overview

### Key Concept

The generateRaw interceptor determines operation type via call stack analysis (e.g., `generate_scene_recap`), but this only gives the base operation type. The suffix system allows callers to attach contextual data that enriches the metadata:

- **Base operation:** `generate_scene_recap` (from stack analysis)
- **Suffix:** `-42-67` (message range from caller context)
- **Final metadata:** `generate_scene_recap-42-67`

### Core System

**Module:** `operationContext.js` (30 lines, zero dependencies)

**API:**
```javascript
setOperationSuffix(suffix)    // Set context for current call chain
getOperationSuffix()          // Read current context
clearOperationSuffix()        // Reset context to null
```

**Pattern:**
```javascript
setOperationSuffix('-42-67');
try {
  await generateRaw(...);
} finally {
  clearOperationSuffix();  // Always cleanup
}
```

### Integration

The suffix system integrates with 7 modules:

1. **generateRawInterceptor.js** - Reads suffix, includes in metadata
2. **sceneBreak.js** - Sets suffix with message range
3. **autoSceneBreakDetection.js** - Sets suffix during scene detection
4. **recapValidation.js** - Sets suffix with validation type
5. **runningSceneRecap.js** - Sets suffix for scene index ranges
6. **lorebookEntryMerger.js** - Sets suffix with entry name
7. **recapToLorebookProcessor.js** - Sets suffix with entry comment

### Suffix Formats

| Module | Format | Example | Purpose |
|--------|--------|---------|---------|
| sceneBreak.js | `-${startIdx}-${endIdx}` | `-42-67` | Track message range |
| recapValidation.js | `-${validationType}` | `-structure` | Identify validation type |
| runningSceneRecap.js | `-${prevIdx}-${currentIdx}` | `-100-150` | Track scene progression |
| lorebookEntryMerger.js | `-${entryName}` | `-Twilight Sparkle` | Identify entry |

---

## Usage

### Installation

Installed automatically during extension initialization. No manual setup required.

### Basic Usage

```javascript
import { setOperationSuffix, clearOperationSuffix } from './index.js';

// Set context before any async LLM calls
setOperationSuffix('-42-67');

try {
  // Any generateRaw calls will include suffix in metadata
  await generateRaw({ prompt: '...' });
  // Metadata will show: "generate_scene_recap-42-67"
} finally {
  // ALWAYS clear context, even on error
  clearOperationSuffix();
}
```

### Critical Rule

**Always use try-finally to ensure cleanup.** Suffix leakage causes subsequent operations to have incorrect metadata.

WRONG:
```javascript
setOperationSuffix('-42-67');
await generateRaw(prompt);
clearOperationSuffix();  // May never execute on error!
```

CORRECT:
```javascript
setOperationSuffix('-42-67');
try {
  await generateRaw(prompt);
} finally {
  clearOperationSuffix();
}
```

---

## Configuration

The suffix system itself has no configuration. It's always active after interceptor installation.

**Related Settings:**
- `first_hop_proxy_send_chat_details` (boolean) - Enable/disable metadata injection overall

When disabled, suffix is still captured but not injected into metadata.

---

## Examples

### Example 1: Scene Recap Generation

```javascript
export async function generateSceneRecap(startIdx, endIdx, prompt) {
  setOperationSuffix(`-${startIdx}-${endIdx}`);
  
  try {
    const response = await sendLLMRequest(prompt);
    return parseResponse(response);
  } finally {
    clearOperationSuffix();
  }
}
```

**Resulting Metadata:**
```json
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
```

### Example 2: Validation with Type

```javascript
export async function validateRecap(recapText, validationType, prompt) {
  setOperationSuffix(`-${validationType}`);
  
  try {
    const result = await sendLLMRequest(prompt);
    return parseValidationResult(result);
  } finally {
    clearOperationSuffix();
  }
}
```

**Resulting Metadata Examples:**
- `"operation": "validate_recap-structure"`
- `"operation": "validate_recap-coherence"`
- `"operation": "validate_recap-relevance"`

### Example 3: Lorebook Entry Merge

```javascript
export async function mergeLorebookEntry(entryName, entryContent, profileId) {
  setOperationSuffix(`-${entryName}`);
  
  try {
    const prompt = buildEntryMergePrompt(entryName, entryContent);
    const result = await sendLLMRequest(profileId, prompt);
    return parseEntry(result);
  } finally {
    clearOperationSuffix();
  }
}
```

**Resulting Metadata:**
```json
{
  "operation": "merge_lorebook_entry-Twilight Sparkle"
}
```

---

## How It Works

1. **Caller sets suffix:** `setOperationSuffix('-42-67')`
2. **Caller initiates async operation:** `await sendLLMRequest(...)`
3. **Interceptor reads suffix:** `getOperationSuffix()` returns `-42-67`
4. **Interceptor builds operation:** Combines base type + suffix = `generate_scene_recap-42-67`
5. **Interceptor injects metadata:** Prepends `<ST_METADATA>` block to prompt
6. **Caller clears suffix:** `clearOperationSuffix()` in finally block

The suffix persists across async/await boundaries because JavaScript is single-threaded and the context object reference is maintained.

---

## Verification

### Console Logs

Enable debug logging to see suffix in action:

```
[Auto-Recap:CORE] Operation type: generate_scene_recap
[Auto-Recap:CORE] Suffix: -42-67
[Auto-Recap:CORE] Final operation: generate_scene_recap-42-67
[Auto-Recap:CORE] Injecting metadata...
```

### Network Inspection

1. Open DevTools → Network tab
2. Filter to API requests (e.g., `/api/chat/completions`)
3. Inspect request body
4. Look for `<ST_METADATA>` block
5. Verify operation includes suffix

Example request body:
```json
{
  "messages": [
    {
      "role": "system",
      "content": "<ST_METADATA>\n{\"version\": \"1.0\", \"operation\": \"generate_scene_recap-42-67\"...}\n</ST_METADATA>\n\nYou are..."
    }
  ]
}
```

---

## Related Documentation

- [implementation.md](./implementation.md) - Complete implementation details
- [data-flow.md](./data-flow.md) - Complete data flow diagrams and examples
- [generateraw-interceptor/overview.md](../generateraw-interceptor/overview.md) - Main interceptor documentation
- [Advanced Features](../overview.md) - Other advanced features
- [Documentation Hub](../../../README.md) - All extension documentation

---

**Status:** Complete - Feature fully documented with implementation and data flow

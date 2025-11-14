# generateRaw Interceptor - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Interception Mechanism](#interception-mechanism)
5. [Metadata Injection System](#metadata-injection-system)
6. [Operation Context Tracking](#operation-context-tracking)
7. [Installation Process](#installation-process)
8. [Request Processing Flow](#request-processing-flow)
9. [Operation Type Detection](#operation-type-detection)
10. [Error Handling](#error-handling)
11. [Integration with Memory System](#integration-with-memory-system)
12. [Testing and Validation](#testing-and-validation)

## Overview

The generateRaw interceptor is a critical infrastructure component that wraps SillyTavern's `generateRaw()` function to inject metadata and operation context into ALL LLM requests. This enables downstream proxies to log, filter, and process requests based on their operation type (chat, recap, scene_recap, lorebook operations, etc.).

### Purpose

1. **Universal Interception**: Intercept ALL LLM calls, including those from SillyTavern core
2. **Metadata Injection**: Add structured metadata to every request for proxy logging
3. **Operation Tracking**: Maintain operation context throughout async LLM call chains
4. **Memory Integration**: Enable memory injection into prompts before LLM calls
5. **Transparent Operation**: Wrap function without breaking existing code

### Key Files

- `generateRawInterceptor.js` - Main interceptor wrapper
- `metadataInjector.js` - Metadata creation and injection
- `operationContext.js` - Thread-local operation context
- `memoryCore.js` - Memory injection integration
- `eventHandlers.js` - Installation and initialization

## Architecture

### Two Interception Strategies

The extension uses TWO complementary interception points to cover all LLM calls:

#### 1. Function Wrapping (Extension Operations)

```javascript
// Extension code imports wrapped version
import { wrappedGenerateRaw } from './index.js';

// Calls go through interceptor
await wrappedGenerateRaw({ prompt: '...' });
```

**Coverage:**
- Extension-generated operations (recaps, scene recaps, validation)
- Lorebook operations (lookup, deduplication, merging)
- Any code that imports from `index.js`

**How it works:**
- Replace `ctx.generateRaw` and `window.generateRaw` with `wrappedGenerateRaw`
- Wrapped function processes request BEFORE calling original
- Original function never knows it was intercepted

#### 2. Event-Based Interception (Chat Messages)

```javascript
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
  // Inject metadata into chat array
  injectMetadataIntoChatArray(promptData.chat, { operation: 'chat' });
});
```

**Coverage:**
- Normal chat messages from user
- SillyTavern core generation calls
- Any generation that fires `CHAT_COMPLETION_PROMPT_READY` event

**How it works:**
- Hook into ST event system before API call
- Modify chat array in place
- ST sends modified array to API

### Why Two Approaches?

SillyTavern uses different code paths for different operations:

- **Chat messages**: `runGenerate` → `finishGenerating` → direct API call
- **Extension operations**: `generateRaw()` function

We cannot modify ST core files, so we use:
- Event hooks for chat (external observation)
- Function wrapping for extensions (internal interception)

## Core Components

### generateRawInterceptor.js

The main interceptor module that wraps the `generateRaw` function.

#### Key Variables

```javascript
let _originalGenerateRaw = null;  // Store original function
let _isInterceptorActive = false; // Prevent recursion
```

**Purpose:**
- `_originalGenerateRaw`: Reference to original unwrapped function
- `_isInterceptorActive`: Recursion guard to prevent infinite loops

#### Core Functions

1. **wrappedGenerateRaw(options)**
   - Wrapped version of `generateRaw` that processes requests
   - Checks recursion guard, injects metadata, calls original
   - Returns result from original function

2. **installGenerateRawInterceptor()**
   - Installs wrapper on `ctx.generateRaw` and `window.generateRaw`
   - Called once during extension initialization
   - Stores reference to original function

3. **determineOperationType()**
   - Analyzes call stack to infer operation type
   - Returns operation string (e.g., 'generate_scene_recap', 'chat', 'lorebook_entry_lookup')
   - Complex logic with priority ordering

4. **getOriginalGenerateRaw()**
   - Returns reference to original unwrapped function
   - Used when bypass is needed (rare)

### metadataInjector.js

Creates and injects structured metadata into prompts.

#### Metadata Format

```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap"
}
</ST_METADATA>
```

#### Key Functions

1. **getChatName()**
   - Returns full chat identifier with timestamp
   - For single character: "CharacterName - YYYY-MM-DD@HHhMMmSSs"
   - For groups: Group name
   - Matches `{{chat}}` macro used in Auto-Lorebooks naming

2. **isMetadataInjectionEnabled()**
   - Checks if `first_hop_proxy_send_chat_details` setting is enabled
   - Returns boolean
   - Guards all injection operations

3. **createMetadataBlock(options)**
   - Builds metadata object with version, chat, operation
   - Optional: timestamp, custom fields
   - Returns plain object

4. **formatMetadataBlock(metadata)**
   - Formats metadata as XML-tagged JSON block
   - Returns string with `<ST_METADATA>` tags

5. **injectMetadata(prompt, options)**
   - Injects metadata into string prompt (for generateRaw)
   - Prepends metadata block to prompt
   - Returns modified prompt

6. **injectMetadataIntoChatArray(chatArray, options)**
   - Injects metadata into chat array (for events)
   - Finds/creates system message
   - Prepends metadata to system message content
   - Modifies array in place

7. **stripMetadata(prompt)**
   - Removes metadata blocks from prompt
   - Uses regex: `/<ST_METADATA>[\s\S]*?<\/ST_METADATA>\n?\n?/g`
   - Returns cleaned prompt

8. **hasExistingMetadata(chatArray)**
   - Checks if any message contains metadata block
   - Returns boolean
   - Used to prevent duplicate injection

9. **getExistingOperation(chatArray)**
   - Extracts operation type from existing metadata
   - Returns operation string or null
   - Used for replacement logic

### operationContext.js

Simple thread-local context storage for operation suffixes.

#### Context Structure

```javascript
let _context = { suffix: null };
```

**Purpose:** Pass contextual information from high-level operations down to low-level interceptor without modifying function signatures.

#### Key Functions

1. **setOperationSuffix(suffix)**
   - Sets suffix for current operation
   - Example: `'-42-67'` for message range
   - Stored in module-level variable

2. **getOperationSuffix()**
   - Returns current suffix or null
   - Called by interceptor to augment operation type

3. **clearOperationSuffix()**
   - Resets suffix to null
   - MUST be called in finally block to prevent leaks

#### Usage Pattern

```javascript
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';

setOperationSuffix('-42-67');  // Set context
try {
  await generateRaw(...);  // Interceptor reads suffix
} finally {
  clearOperationSuffix();  // Always cleanup
}
```

### memoryCore.js

Handles memory injection into prompts (separate from interceptor but complementary).

**Note:** The interceptor focuses on metadata injection. Memory injection (recaps, scene recaps) happens through ST's `setExtensionPrompt` API and is NOT part of the interceptor's responsibility.

## Interception Mechanism

### Function Wrapping Technique

The interceptor uses JavaScript's function reference replacement to wrap `generateRaw`.

#### Before Installation

```
Extension Code → generateRaw() → LLM API
                    (original)
```

#### After Installation

```
Extension Code → wrappedGenerateRaw() → [Process] → generateRaw() → LLM API
                    (wrapper)                        (original)
```

### Installation Process

1. **Import Original Function**

```javascript
import { generateRaw as _importedGenerateRaw } from '../../../../script.js';
```

2. **Create Wrapper Function**

```javascript
export async function wrappedGenerateRaw(options) {
  // Guard against recursion
  if (_isInterceptorActive) {
    return _importedGenerateRaw(options);
  }

  try {
    _isInterceptorActive = true;

    // Process prompt
    // Inject metadata
    // Augment with context

    return await _importedGenerateRaw(options);
  } finally {
    _isInterceptorActive = false;
  }
}
```

3. **Replace Global References**

```javascript
export function installGenerateRawInterceptor() {
  const ctx = getContext();

  // Strategy 1: Wrap on context object
  if (ctx && typeof ctx.generateRaw === 'function') {
    _originalGenerateRaw = ctx.generateRaw;
    ctx.generateRaw = wrappedGenerateRaw;
  }

  // Strategy 2: Wrap on window object
  if (window.generateRaw) {
    if (!_originalGenerateRaw) {
      _originalGenerateRaw = window.generateRaw;
    }
    window.generateRaw = wrappedGenerateRaw;
  }
}
```

### Recursion Prevention

**Problem:** If wrapped function calls original which somehow calls back to wrapped, infinite loop occurs.

**Solution:** Use recursion guard flag

```javascript
let _isInterceptorActive = false;

export async function wrappedGenerateRaw(options) {
  // Check flag immediately
  if (_isInterceptorActive) {
    // Already in wrapper, call original directly
    return _importedGenerateRaw(options);
  }

  try {
    // Set flag before processing
    _isInterceptorActive = true;

    // Process request...

    // Call original (flag still set)
    return await _importedGenerateRaw(options);
  } finally {
    // Always clear flag
    _isInterceptorActive = false;
  }
}
```

**Why it works:**
- Flag set BEFORE any processing
- Checked IMMEDIATELY on entry
- Cleared in finally block (even on error)
- Prevents nested wrapper calls

## Metadata Injection System

### Injection Decision Tree

```
wrappedGenerateRaw called
    |
    ├─> Recursion guard active? → Call original directly
    |
    ├─> Metadata injection enabled?
    |     ├─> Yes → Continue
    |     └─> No → Skip to original call
    |
    ├─> Determine operation type from stack
    |
    ├─> Get operation suffix from context
    |
    ├─> options.prompt exists?
    |     ├─> String prompt
    |     |     ├─> Create metadata block
    |     |     ├─> Prepend to prompt
    |     |     └─> Replace options.prompt
    |     |
    |     └─> Array prompt (messages)
    |           ├─> Check existing metadata
    |           ├─> Inject into system message
    |           └─> Modify array in place
    |
    └─> Call original generateRaw with modified options
```

### String Prompt Processing

Used for most extension operations (recaps, lorebook, validation).

```javascript
if (typeof options.prompt === 'string') {
  debug('[Interceptor] Processing string prompt');

  const processedPrompt = injectMetadata(options.prompt, {
    operation: operation
  });

  options.prompt = processedPrompt;
}
```

**Flow:**
1. Detect string prompt
2. Call `injectMetadata(prompt, options)`
3. Metadata prepended to prompt
4. Replace `options.prompt` with modified version

**Result:**
```
Original: "Please recap this message: ..."

Modified:
<ST_METADATA>
{"version":"1.0","chat":"...","operation":"recap"}
</ST_METADATA>

Please recap this message: ...
```

### Array Prompt Processing

Used for chat completion with messages array.

```javascript
if (Array.isArray(options.prompt) && options.prompt.length > 0) {
  debug('[Interceptor] Processing messages array');

  const isSpecificOperation = baseOperation !== 'chat';

  injectMetadataIntoChatArray(options.prompt, {
    operation: operation,
    replaceIfChat: isSpecificOperation
  });
}
```

**Flow:**
1. Detect array prompt
2. Call `injectMetadataIntoChatArray(array, options)`
3. Find or create system message
4. Prepend metadata to system message content
5. Array modified in place

**Result:**
```javascript
// Before
[
  { role: 'system', content: 'You are an assistant.' },
  { role: 'user', content: 'Hello' }
]

// After
[
  {
    role: 'system',
    content: '<ST_METADATA>\n{...}\n</ST_METADATA>\n\nYou are an assistant.'
  },
  { role: 'user', content: 'Hello' }
]
```

### Replacement Logic

When injecting into chat arrays, the system handles existing metadata intelligently.

#### Scenario 1: No Existing Metadata

```javascript
// Simply inject new metadata
injectMetadataIntoChatArray(chatArray, { operation: 'chat' });
```

#### Scenario 2: Existing Chat-Type Metadata

```javascript
// Specific operation replaces generic chat
injectMetadataIntoChatArray(chatArray, {
  operation: 'generate_scene_recap',
  replaceIfChat: true  // Replace if existing is 'chat'
});
```

**Logic:**
```javascript
const existingOperation = getExistingOperation(chatArray);

if (existingOperation !== null) {
  if (options?.replaceIfChat === true) {
    // Only replace if existing is a chat-type operation
    if (!existingOperation.startsWith('chat')) {
      // Keep existing specific operation
      return;
    }
    // Continue to replace chat-type with specific operation
  } else {
    // Don't replace, defer to existing
    return;
  }
}
```

#### Scenario 3: Existing Specific Metadata

```javascript
// Keep existing specific operation, don't replace
// Example: lorebook operation already set, don't overwrite
```

### Metadata Block Creation

```javascript
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

function getDefaultMetadata() {
  const chatName = getChatName();

  return {
    version: '1.0',
    chat: chatName
  };
}
```

**Fields:**
- `version`: Always "1.0" (schema version)
- `chat`: Full chat identifier from `getChatName()`
- `operation`: Operation type from stack analysis + context suffix
- `timestamp`: (optional) ISO 8601 timestamp
- `custom`: (optional) Operation-specific data

## Operation Context Tracking

### Problem: Contextual Information Across Async Boundaries

Operations like scene recap generation need to pass contextual information (message ranges, scene indices) down to the interceptor without modifying every function signature in the call chain.

**Example:**
```
generateSceneRecap(start=42, end=67)
  → buildPrompt()
    → generateRaw()  // Need to know: messages 42-67
```

### Solution: Thread-Local Context Storage

```javascript
// In operationContext.js
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

### Usage Pattern

#### Setting Context

```javascript
// In sceneBreak.js or runningSceneRecap.js
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';

async function generateSceneRecap(startIndex, endIndex) {
  // Set context before ANY async operations
  setOperationSuffix(`-${startIndex}-${endIndex}`);

  try {
    // Any generateRaw calls in this async chain will see the suffix
    const recap = await recap_text(prompt, prefill, include_presets, preset);
    return recap;
  } finally {
    // ALWAYS clear context, even on error
    clearOperationSuffix();
  }
}
```

#### Reading Context

```javascript
// In generateRawInterceptor.js
const baseOperation = determineOperationType(); // e.g., 'generate_scene_recap'
const suffix = getOperationSuffix();            // e.g., '-42-67'
const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;
// Result: 'generate_scene_recap-42-67'
```

### Context Lifecycle

1. **Set**: Called at start of high-level operation
2. **Propagate**: Automatically available to all nested calls
3. **Read**: Interceptor reads without explicit passing
4. **Clear**: MUST clear in finally block

**Critical:** Always use try-finally to prevent context leaks:

```javascript
setOperationSuffix('-data-');
try {
  await operation();
} finally {
  clearOperationSuffix();  // Guaranteed cleanup
}
```

### Context Leak Prevention

**Problem:** If context not cleared, subsequent operations inherit wrong suffix.

```javascript
// BAD - Context leak
setOperationSuffix('-42-67');
await generateSceneRecap();  // Uses '-42-67' ✓
await generateSceneRecap();  // STILL uses '-42-67' ✗ (leak!)

// GOOD - Proper cleanup
setOperationSuffix('-42-67');
try {
  await generateSceneRecap();
} finally {
  clearOperationSuffix();
}
// Next operation has no suffix ✓
```

## Installation Process

### Initialization Sequence

Called from `eventHandlers.js` during extension load:

```javascript
jQuery(async () => {
  // ... other initialization ...

  // Install global generateRaw interceptor BEFORE anything else
  // This ensures ALL LLM calls get metadata injected
  installGenerateRawInterceptor();

  // ... rest of initialization ...
});
```

**Why early installation?**
- Must wrap function BEFORE any other code uses it
- Any code that imports `generateRaw` must get wrapped version
- Early installation = guaranteed coverage

### Installation Steps

```javascript
export function installGenerateRawInterceptor() {
  debug('[Interceptor] Installing generateRaw interceptor...');

  try {
    // Strategy 1: Wrap on context object (for code that uses ctx.generateRaw)
    const ctx = getContext();

    if (ctx && typeof ctx.generateRaw === 'function') {
      _originalGenerateRaw = ctx.generateRaw;
      ctx.generateRaw = wrappedGenerateRaw;
      debug('[Interceptor] ✓ Wrapped ctx.generateRaw');
    }

    // Strategy 2: Wrap on window object (for global access)
    if (typeof window !== 'undefined' && window.generateRaw) {
      if (!_originalGenerateRaw) {
        _originalGenerateRaw = window.generateRaw;
      }
      window.generateRaw = wrappedGenerateRaw;
      debug('[Interceptor] ✓ Wrapped window.generateRaw');
    }

    debug('[Interceptor] ✓ Interceptor installed successfully');
  } catch (err) {
    error('[Interceptor] Failed to install interceptor:', err);
  }
}
```

### Verification

Check console logs on extension load:

```
[Auto-Recap:CORE] [Interceptor] Installing generateRaw interceptor...
[Auto-Recap:CORE] [Interceptor] Context object exists: true
[Auto-Recap:CORE] [Interceptor] ctx.generateRaw exists: true
[Auto-Recap:CORE] [Interceptor] ctx.generateRaw is function: true
[Auto-Recap:CORE] [Interceptor] ✓ Wrapped ctx.generateRaw
[Auto-Recap:CORE] [Interceptor] Verification - ctx.generateRaw === wrappedGenerateRaw: true
[Auto-Recap:CORE] [Interceptor] ✓ Interceptor installed successfully
```

## Request Processing Flow

### Complete Request Lifecycle

```
1. Extension code calls generateRaw
   ↓
2. Import resolves to wrappedGenerateRaw
   ↓
3. Recursion guard check
   ↓
4. Set recursion flag
   ↓
5. Check if metadata injection enabled
   ↓
6. Determine operation type from stack
   ↓
7. Get operation suffix from context
   ↓
8. Combine into full operation string
   ↓
9. Detect prompt format (string vs array)
   ↓
10. Inject metadata based on format
    ↓
11. Call original _importedGenerateRaw
    ↓
12. Clear recursion flag (finally)
    ↓
13. Return result to caller
```

### Detailed Code Flow

```javascript
export async function wrappedGenerateRaw(options) {
  debug('[Interceptor] wrappedGenerateRaw called! isInterceptorActive:', _isInterceptorActive);

  // Step 1: Recursion guard
  if (_isInterceptorActive) {
    debug('[Interceptor] Recursion detected, calling original');
    return _importedGenerateRaw(options);
  }

  try {
    // Step 2: Set recursion flag
    _isInterceptorActive = true;

    // Step 3: Process prompt if exists
    if (options && options.prompt) {
      // Step 4: Determine operation type from call stack
      const baseOperation = determineOperationType();

      // Step 5: Get contextual suffix if set
      const suffix = getOperationSuffix();
      const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;

      debug('[Interceptor] Operation type:', operation);

      // Step 6: Handle string prompts
      if (typeof options.prompt === 'string') {
        debug('[Interceptor] Processing string prompt (first 100 chars):',
              options.prompt.slice(0, 100));

        const processedPrompt = injectMetadata(options.prompt, {
          operation: operation
        });

        debug('[Interceptor] Processed prompt (first 200 chars):',
              processedPrompt.slice(0, 200));
        options.prompt = processedPrompt;
      }
      // Step 7: Handle array prompts
      else if (Array.isArray(options.prompt) && options.prompt.length > 0) {
        debug('[Interceptor] Processing messages array with',
              options.prompt.length, 'messages');

        const isSpecificOperation = baseOperation !== 'chat';

        injectMetadataIntoChatArray(options.prompt, {
          operation: operation,
          replaceIfChat: isSpecificOperation
        });

        debug('[Interceptor] Injected metadata into messages array');
      } else {
        debug('[Interceptor] Prompt format not recognized');
      }
    } else {
      debug('[Interceptor] No prompt found in options');
    }

    // Step 8: Call original function
    return await _importedGenerateRaw(options);
  } catch (err) {
    error('[Interceptor] Error in wrapped generateRaw:', err);
    // Still call original on error
    return await _importedGenerateRaw(options);
  } finally {
    // Step 9: Always clear recursion flag
    _isInterceptorActive = false;
  }
}
```

## Operation Type Detection

### Purpose

Determine what operation is being performed by analyzing the call stack. This enables operation-specific metadata.

### Detection Function

```javascript
function determineOperationType() {
  try {
    // Generate stack trace
    const stack = new Error('Stack trace for operation type detection').stack || '';

    // Check patterns in priority order
    // (Most specific first, most general last)

    // Scene operations (check first for specificity)
    if (stack.includes('detectSceneBreak') ||
        stack.includes('autoSceneBreakDetection.js')) {
      return 'detect_scene_break';
    }

    if (stack.includes('generateSceneRecap') &&
        !stack.includes('runningSceneRecap.js')) {
      return 'generate_scene_recap';
    }

    if (stack.includes('generate_running_scene_recap') ||
        stack.includes('runningSceneRecap.js')) {
      if (stack.includes('combine_scene_with_running_recap')) {
        return 'combine_scene_with_running';
      }
      return 'generate_running_recap';
    }

    // Validation operations
    if (stack.includes('validateRecap') ||
        stack.includes('recapValidation.js')) {
      return 'validate_recap';
    }

    // Lorebook operations
    if (stack.includes('runLorebookEntryLookupStage') ||
        stack.includes('lookupLorebookEntry')) {
      return 'lorebook_entry_lookup';
    }

    if (stack.includes('runLorebookEntryDeduplicateStage') ||
        stack.includes('resolveLorebookEntry')) {
      return 'resolve_lorebook_entry';
    }

    if (stack.includes('executeCreateAction') ||
        stack.includes('createLorebookEntry')) {
      return 'create_lorebook_entry';
    }

    if (stack.includes('executeMergeAction') ||
        stack.includes('mergeLorebookEntry')) {
      return 'merge_lorebook_entry';
    }

    if (stack.includes('updateRegistryRecord') ||
        stack.includes('updateLorebookRegistry')) {
      return 'update_lorebook_registry';
    }

    if (stack.includes('runBulkRegistryPopulation') ||
        stack.includes('bulk_registry_populate')) {
      return 'populate_registries';
    }

    // Default for chat messages and unknown operations
    return 'chat';
  } catch {
    return 'unknown';
  }
}
```

### Detection Strategy

1. **Generate Stack Trace**: Create error object to capture call stack
2. **Pattern Matching**: Check stack for function/file names
3. **Priority Ordering**: Check specific patterns before general ones
4. **Fallback**: Default to 'chat' for unrecognized operations

### Operation Types

| Operation | Pattern | Description |
|-----------|---------|-------------|
| `detect_scene_break` | `detectSceneBreak`, `autoSceneBreakDetection.js` | Auto scene break detection |
| `generate_scene_recap` | `generateSceneRecap` (not running) | Single scene recap |
| `generate_running_recap` | `generate_running_scene_recap`, `runningSceneRecap.js` | Running scene recap |
| `combine_scene_with_running` | `combine_scene_with_running_recap` | Combining scene with running |
| `validate_recap` | `validateRecap`, `recapValidation.js` | Recap validation |
| `lorebook_entry_lookup` | `runLorebookEntryLookupStage`, `lookupLorebookEntry` | Lorebook lookup |
| `resolve_lorebook_entry` | `runLorebookEntryDeduplicateStage`, `resolveLorebookEntry` | Lorebook deduplication |
| `create_lorebook_entry` | `executeCreateAction`, `createLorebookEntry` | Create lorebook entry |
| `merge_lorebook_entry` | `executeMergeAction`, `mergeLorebookEntry` | Merge lorebook entries |
| `update_lorebook_registry` | `updateRegistryRecord`, `updateLorebookRegistry` | Update registry |
| `populate_registries` | `runBulkRegistryPopulation`, `bulk_registry_populate` | Bulk registry population |
| `chat` | (default) | Normal chat messages |
| `unknown` | (error fallback) | Stack analysis failed |

### Augmentation with Context Suffix

```javascript
const baseOperation = determineOperationType(); // e.g., 'generate_scene_recap'
const suffix = getOperationSuffix();            // e.g., '-42-67'
const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;
// Result: 'generate_scene_recap-42-67'
```

## Error Handling

### Interceptor Error Strategy

The interceptor uses defensive error handling to ensure LLM calls always proceed, even if interception fails.

```javascript
try {
  _isInterceptorActive = true;

  // Process request...

  return await _importedGenerateRaw(options);
} catch (err) {
  error('[Interceptor] Error in wrapped generateRaw:', err);
  // Still call original on error
  return await _importedGenerateRaw(options);
} finally {
  _isInterceptorActive = false;
}
```

**Key principles:**
1. **Always call original**: Even if interception fails, call original function
2. **Log errors**: Report errors for debugging
3. **Don't throw**: Never throw from interceptor (breaks caller)
4. **Always cleanup**: Use finally for recursion flag

### Metadata Injection Errors

```javascript
export function injectMetadata(prompt, options = {}) {
  try {
    // Check if injection is enabled
    if (!isMetadataInjectionEnabled()) {
      return prompt;
    }

    // Create and format metadata
    const metadata = createMetadataBlock(options);
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

**Fallback behavior:**
- If injection fails, return original unmodified prompt
- Log error for debugging
- Don't break the LLM call

### Installation Errors

```javascript
export function installGenerateRawInterceptor() {
  try {
    // Install wrapper...
  } catch (err) {
    error('[Interceptor] Failed to install interceptor:', err);
    // Don't throw - extension continues without interception
  }
}
```

**Graceful degradation:**
- If installation fails, extension continues
- Interception simply won't work
- Core functionality (recapping) still operates

## Integration with Memory System

### Memory Injection vs Metadata Injection

**Two separate concerns:**

1. **Metadata Injection (Interceptor)**
   - Adds operation context to ALL requests
   - XML-tagged JSON blocks for proxy logging
   - Happens in `generateRawInterceptor.js`
   - Prepended to prompt

2. **Memory Injection (Memory System)**
   - Adds recap memory to prompts for LLM context
   - Uses ST's `setExtensionPrompt` API
   - Happens in `memoryCore.js`
   - Positioned per settings (depth, role, position)

### How They Coexist

```
Final Prompt Structure:

<ST_METADATA>
{operation context}
</ST_METADATA>

[System Prompt]

[Extension Prompt - Memory]
Scene Recap: ...
Scene Recap: ...

[Chat History]
User: ...
Assistant: ...
```

**Process:**
1. ST builds base prompt with chat history
2. ST injects extension prompts (memory) via `setExtensionPrompt`
3. Interceptor adds metadata to complete prompt
4. Request sent to API

### No Conflict

The two systems don't conflict because:
- Metadata injection happens at function boundary (generateRaw call)
- Memory injection happens earlier (ST prompt building)
- Both prepend/inject at different positions
- Both are idempotent (can safely run multiple times)

## Testing and Validation

### Console Verification

Enable debug logging to see interceptor in action:

#### Installation Verification

```
[Auto-Recap:CORE] [Interceptor] Installing generateRaw interceptor...
[Auto-Recap:CORE] [Interceptor] ✓ Wrapped ctx.generateRaw
[Auto-Recap:CORE] [Interceptor] ✓ Wrapped window.generateRaw
[Auto-Recap:CORE] [Interceptor] ✓ Interceptor installed successfully
```

#### Request Interception

```
[Auto-Recap:CORE] [Interceptor] wrappedGenerateRaw called! isInterceptorActive: false
[Auto-Recap:CORE] [Interceptor] Operation type: generate_scene_recap-42-67
[Auto-Recap:CORE] [Interceptor] Processing string prompt (first 100 chars): You are analyzing...
[Auto-Recap:CORE] [Interceptor] Processed prompt (first 200 chars): <ST_METADATA>
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

You are analyzing...
```

### Test Override Pattern

For testing, the extension supports global test overrides:

```javascript
// In test file
globalThis.__TEST_RECAP_TEXT_RESPONSE = 'Mock recap text';

// In recapping.js (calls generateRaw internally)
const __override = globalThis.__TEST_RECAP_TEXT_RESPONSE;
if (typeof __override === 'string') {
  // Return override without calling LLM
  return __override;
}
```

**How it works:**
1. Test sets global override
2. Function checks for override before calling generateRaw
3. If override exists, return mock response
4. Interceptor never called (bypass for testing)

### Verification Checklist

- [ ] Interceptor installed successfully (check console logs)
- [ ] `ctx.generateRaw === wrappedGenerateRaw` (verification log)
- [ ] Chat messages show metadata injection
- [ ] Extension operations show metadata injection
- [ ] Operation types detected correctly from stack
- [ ] Context suffixes propagate correctly
- [ ] Recursion guard prevents infinite loops
- [ ] Errors don't break LLM calls
- [ ] Original prompt preserved on error

### Manual Testing

1. **Enable metadata injection**
   - Settings → First-Hop Proxy Integration → Send Chat Details ☑

2. **Send chat message**
   - Check console for event handler logs
   - Check network tab for request with metadata

3. **Trigger recap generation**
   - Generate a recap manually
   - Check console for interceptor logs
   - Verify operation type is 'recap' or similar

4. **Trigger scene recap**
   - Mark scene break and generate recap
   - Check console for 'generate_scene_recap' operation
   - Verify context suffix appears (e.g., '-42-67')

5. **Check error handling**
   - Temporarily break metadata injector (modify code)
   - Verify LLM calls still work (fallback to original)
   - Check error logs

### Integration Testing

The extension uses Playwright for E2E testing with real SillyTavern:

```javascript
// Tests verify interceptor behavior with real API calls
test('interceptor adds metadata to requests', async ({ page }) => {
  // Setup proxy to capture requests
  // Trigger operation
  // Verify metadata present in request
});
```

**Test coverage:**
- Installation verification
- Chat message interception
- Extension operation interception
- Operation type detection
- Context propagation
- Error handling

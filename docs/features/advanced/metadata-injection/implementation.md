# Metadata Injection System - Implementation

## Overview

The Metadata Injection System provides a complete infrastructure for tagging all LLM requests with contextual information. This enables downstream proxies to track, log, and categorize requests based on their origin and purpose without modifying request semantics.

The system operates through three coordinated components:
1. **Operation Context Management** - Thread-local context storage for operation metadata
2. **Metadata Injection** - Formatting and injecting metadata into LLM prompts
3. **Global Interception** - Intercepting all LLM calls to ensure universal coverage

## Architecture Components

### 1. Operation Context (`operationContext.js`)

The operation context provides a simple thread-local storage mechanism for passing contextual information through the call stack without modifying function signatures.

#### Context Storage

```javascript
// Global context storage
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

**Design Rationale:**
- Simple global variable instead of AsyncLocalStorage (browser context)
- Suffix-based approach allows operation type + range identification
- Must be manually cleared to prevent context leaking

#### Context Lifecycle

**Setting Context:**
```javascript
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';

setOperationSuffix('-42-67');  // Message range 42-67
try {
  await generateRaw(...);  // Interceptor reads suffix
} finally {
  clearOperationSuffix();  // Always cleanup
}
```

**Context Propagation:**
The context is NOT automatically propagated through async boundaries. Each operation must explicitly set and clear context.

**Critical Pattern:**
Always use try/finally to ensure cleanup:
```javascript
setOperationSuffix(suffix);
try {
  // Operation that calls LLM
  await performOperation();
} finally {
  clearOperationSuffix();
}
```

### 2. Metadata Injector (`metadataInjector.js`)

The metadata injector constructs structured metadata blocks and injects them into LLM prompts.

#### Core Functions

**Settings Check:**
```javascript
export function isMetadataInjectionEnabled() {
  try {
    const enabled = get_settings('first_hop_proxy_send_chat_details');
    return enabled === true;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error checking if enabled:', err);
    return false; // Default to disabled
  }
}
```

**Chat Name Resolution:**
```javascript
export function getChatName() {
  try {
    // For single character chats, use full identifier with timestamp
    const chatId = getCurrentChatId();
    if (chatId && !selected_group) {
      return String(chatId).trim();
    }

    // For group chats, use group name
    if (selected_group) {
      const group = groups?.find((x) => x.id === selected_group);
      if (group && group.name) {
        return String(group.name).trim();
      }
    }

    return 'Unknown';
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error getting chat name:', err);
    return 'Unknown';
  }
}
```

**Metadata Construction:**
```javascript
export function getDefaultMetadata() {
  const chatName = getChatName();

  return {
    version: '1.0',
    chat: chatName
  };
}

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

**Metadata Formatting:**
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

#### Injection Methods

**String Prompt Injection:**
```javascript
export function injectMetadata(
  prompt,
  options = {})
{
  try {
    if (!isMetadataInjectionEnabled()) {
      return prompt;
    }

    const metadata = createMetadataBlock(options);
    const metadataStr = formatMetadataBlock(metadata);

    // Prepend to prompt
    return metadataStr + prompt;

  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error injecting metadata:', err);
    return prompt;
  }
}
```

**Chat Array Injection:**
```javascript
export function injectMetadataIntoChatArray(
  chatArray,
  options = {})
{
  try {
    if (!isMetadataInjectionEnabled()) {
      return;
    }

    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      return;
    }

    // Check if metadata already exists
    const existingOperation = getExistingOperation(chatArray);

    if (existingOperation !== null) {
      if (options?.replaceIfChat === true) {
        // Only replace if existing is a chat-type operation
        if (!existingOperation.startsWith('chat')) {
          debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Existing specific operation found, keeping it:', existingOperation);
          return; // Keep existing specific operation
        }
        debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Replacing chat-type operation with specific operation');
      } else {
        debug(SUBSYSTEM.CORE,'[Auto-Recap:Interceptor] Metadata already exists, skipping injection');
        return;
      }
    }

    // Create metadata block
    const metadata = createMetadataBlock(options);
    const metadataStr = formatMetadataBlock(metadata);

    // Find first system message, or create one if none exists
    const firstSystemMessage = chatArray.find((msg) => msg.role === 'system');

    if (firstSystemMessage) {
      // Strip existing metadata if replacing
      if (existingOperation !== null) {
        firstSystemMessage.content = firstSystemMessage.content.replace(/<ST_METADATA>[\s\S]*?<\/ST_METADATA>\n?\n?/, '');
      }
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

**Replacement Logic:**
The `replaceIfChat` option enables specific operations to override generic chat metadata:
1. Check if metadata already exists
2. If `replaceIfChat=true` and existing operation is "chat*", replace it
3. If existing operation is specific (not "chat*"), keep existing
4. This ensures most specific operation type is preserved

#### Metadata Detection

**Check for Existing Metadata:**
```javascript
export function hasExistingMetadata(chatArray) {
  try {
    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      return false;
    }

    // Check ALL messages, not just system messages
    for (const msg of chatArray) {
      if (typeof msg.content === 'string' && /<ST_METADATA>[\s\S]*?<\/ST_METADATA>/.test(msg.content)) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error checking existing metadata:', err);
    return false;
  }
}
```

**Extract Existing Operation:**
```javascript
export function getExistingOperation(chatArray) {
  try {
    if (!Array.isArray(chatArray) || chatArray.length === 0) {
      return null;
    }

    // Check ALL messages, not just system messages
    for (const msg of chatArray) {
      if (typeof msg.content === 'string') {
        const match = msg.content.match(/<ST_METADATA>([\s\S]*?)<\/ST_METADATA>/);
        if (match) {
          const metadata = JSON.parse(match[1]);
          return metadata?.operation || null;
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error getting existing operation:', err);
    return null;
  }
}
```

### 3. Global Interceptor (`generateRawInterceptor.js`)

The global interceptor wraps all `generateRaw` calls to ensure metadata injection for extension operations.

#### Interception Strategy

**Two-Strategy Approach:**
```javascript
export function installGenerateRawInterceptor() {
  debug(SUBSYSTEM.CORE, '[Interceptor] Installing generateRaw interceptor...');

  try {
    // Strategy 1: Wrap on context object (for code that uses ctx.generateRaw)
    const ctx = getContext();

    if (ctx && typeof ctx.generateRaw === 'function') {
      _originalGenerateRaw = ctx.generateRaw;
      ctx.generateRaw = wrappedGenerateRaw;
      debug(SUBSYSTEM.CORE, '[Interceptor] ✓ Wrapped ctx.generateRaw');
    }

    // Strategy 2: Wrap on window object (for global access)
    if (typeof window !== 'undefined' && window.generateRaw) {
      if (!_originalGenerateRaw) {
        _originalGenerateRaw = window.generateRaw;
      }
      window.generateRaw = wrappedGenerateRaw;
      debug(SUBSYSTEM.CORE, '[Interceptor] ✓ Wrapped window.generateRaw');
    }

    debug(SUBSYSTEM.CORE, '[Interceptor] ✓ Interceptor installed successfully');
  } catch (err) {
    error(SUBSYSTEM.CORE, '[Interceptor] Failed to install interceptor:', err);
  }
}
```

**Why Two Strategies:**
- SillyTavern code uses `ctx.generateRaw` from context object
- Extension code may use `window.generateRaw` for global access
- Both must be wrapped to ensure complete coverage

#### Wrapped Function

**Core Wrapper:**
```javascript
let _isInterceptorActive = false; // Prevent recursion

export async function wrappedGenerateRaw(options) {
  debug(SUBSYSTEM.CORE, '[Interceptor] wrappedGenerateRaw called! isInterceptorActive:', _isInterceptorActive);

  // Prevent infinite recursion
  if (_isInterceptorActive) {
    debug(SUBSYSTEM.CORE, '[Interceptor] Recursion detected, calling original');
    return _importedGenerateRaw(options);
  }

  try {
    _isInterceptorActive = true;

    // Process prompt
    if (options && options.prompt) {
      const baseOperation = determineOperationType();
      const suffix = getOperationSuffix();
      const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;

      debug(SUBSYSTEM.CORE, '[Interceptor] Operation type:', operation);

      if (typeof options.prompt === 'string') {
        // String prompt - inject at beginning
        const processedPrompt = injectMetadata(options.prompt, {
          operation: operation
        });
        options.prompt = processedPrompt;

      } else if (Array.isArray(options.prompt) && options.prompt.length > 0) {
        // Messages array - inject metadata
        const isSpecificOperation = baseOperation !== 'chat';

        injectMetadataIntoChatArray(options.prompt, {
          operation: operation,
          replaceIfChat: isSpecificOperation
        });
      }
    }

    // Call original function
    return await _importedGenerateRaw(options);
  } catch (err) {
    error(SUBSYSTEM.CORE, '[Interceptor] Error in wrapped generateRaw:', err);
    return await _importedGenerateRaw(options);
  } finally {
    _isInterceptorActive = false;
  }
}
```

**Recursion Prevention:**
The `_isInterceptorActive` flag prevents infinite recursion when the wrapper calls the original function.

#### Operation Type Detection

**Stack-Based Detection:**
```javascript
function determineOperationType() {
  try {
    // Try to determine from call stack
    const stack = new Error('Stack trace for operation type detection').stack || '';

    // Check for specific scene operations FIRST
    if (stack.includes('detectSceneBreak') || stack.includes('autoSceneBreakDetection.js')) {
      return 'detect_scene_break';
    }
    if (stack.includes('generateSceneRecap') && !stack.includes('runningSceneRecap.js')) {
      return 'generate_scene_recap';
    }
    if (stack.includes('generate_running_scene_recap') || stack.includes('runningSceneRecap.js')) {
      if (stack.includes('combine_scene_with_running_recap')) {
        return 'combine_scene_with_running';
      }
      return 'generate_running_recap';
    }

    // Check for validation operations
    if (stack.includes('validateRecap') || stack.includes('recapValidation.js')) {
      return 'validate_recap';
    }

    // Check for lorebook operations
    if (stack.includes('runLorebookEntryLookupStage') || stack.includes('lookupLorebookEntry')) {
      return 'lorebook_entry_lookup';
    }
    if (stack.includes('runLorebookEntryDeduplicateStage') || stack.includes('resolveLorebookEntry')) {
      return 'resolve_lorebook_entry';
    }
    if (stack.includes('executeCreateAction') || stack.includes('createLorebookEntry')) {
      return 'create_lorebook_entry';
    }
    if (stack.includes('executeMergeAction') || stack.includes('mergeLorebookEntry')) {
      return 'merge_lorebook_entry';
    }
    if (stack.includes('updateRegistryRecord') || stack.includes('updateRegistryEntryContent')) {
      return 'update_lorebook_registry';
    }
    if (stack.includes('runBulkRegistryPopulation') || stack.includes('bulk_registry_populate')) {
      return 'populate_registries';
    }

    // Default for chat messages and other operations
    return 'chat';
  } catch {
    return 'unknown';
  }
}
```

**Detection Strategy:**
1. Generate stack trace for current call
2. Check for function names and file names in stack
3. Match most specific operation type first
4. Fall back to 'chat' for unrecognized operations

**Ordering Importance:**
Operations are checked in order of specificity:
- Scene operations (most specific)
- Validation operations
- Lorebook operations
- Chat (default fallback)

### 4. Event-Based Interception (`eventHandlers.js`)

For normal chat messages, metadata is injected via event hooks instead of function wrapping.

#### Chat Completion Event Handler

```javascript
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (promptData) => {
  await on_chat_event('chat_completion_prompt_ready', promptData);

  try {
    debug('[Interceptor] CHAT_COMPLETION_PROMPT_READY handler started');

    const enabled = get_settings('first_hop_proxy_send_chat_details');

    if (!enabled) {
      debug('[Interceptor] Metadata injection disabled, skipping');
      return;
    }

    const { injectMetadataIntoChatArray, hasExistingMetadata } = await import('./metadataInjector.js');

    if (promptData && Array.isArray(promptData.chat)) {
      // Check if metadata already exists
      if (hasExistingMetadata(promptData.chat)) {
        debug('[Interceptor] Metadata already exists in prompt, skipping chat-{index} metadata');
        return;
      }

      // Check if an extension operation is already in progress
      const { getOperationSuffix } = await import('./operationContext.js');
      const operationSuffix = getOperationSuffix();

      if (operationSuffix !== null) {
        debug('[Interceptor] Extension operation in progress, skipping chat-{index} metadata');
        return;
      }

      // Inject chat-{index} for actual user/character messages
      const context = getContext();
      const messageIndex = (context?.chat?.length ?? 0) - 1;

      if (messageIndex >= 0) {
        const lastMessage = context.chat[messageIndex];
        const swipeId = lastMessage?.swipe_id ?? 0;

        // Build operation string: chat-{index} or chat-{index}-swipe{n}
        let operation = `chat-${messageIndex}`;
        if (swipeId > 0) {
          operation += `-swipe${swipeId + 1}`;
        }

        injectMetadataIntoChatArray(promptData.chat, { operation });
        debug(`[Interceptor] Injected metadata with operation: ${operation}`);
      } else {
        injectMetadataIntoChatArray(promptData.chat, { operation: 'chat' });
        debug('[Interceptor] Injected metadata with operation: chat (index unavailable)');
      }
    }
  } catch (err) {
    debug('[Interceptor] Error processing CHAT_COMPLETION_PROMPT_READY:', String(err));
  }
});
```

**Event Flow:**
1. SillyTavern fires `CHAT_COMPLETION_PROMPT_READY` event
2. Event handler receives `promptData` with chat array
3. Check if injection is enabled
4. Check if metadata already exists (extension operation may have added it)
5. Check if extension operation is in progress via context
6. Determine message index and swipe status
7. Inject metadata with operation type `chat-{index}` or `chat-{index}-swipe{n}`

**Operation Context Check:**
The handler checks `getOperationSuffix()` to avoid double-injection when extension operations trigger chat events.

## LLM Client Integration

The `llmClient.js` module uses metadata injection when making direct LLM requests:

```javascript
export async function sendLLMRequest(profileId, prompt, operationType, options = {}) {
  // ... setup code ...

  // Build messages array
  let messages;
  if (typeof prompt === 'string') {
    messages = [{ role: 'user', content: prompt }];
  } else {
    messages = Array.isArray(prompt) ? prompt : [prompt];
  }

  // Add prefill as assistant message
  if (effectivePrefill) {
    messages.push({ role: 'assistant', content: effectivePrefill });
  }

  // INJECT METADATA
  const suffix = getOperationSuffix();
  const fullOperation = suffix ? `${operationType}${suffix}` : operationType;
  const messagesWithMetadata = [...messages];
  injectMetadataIntoChatArray(messagesWithMetadata, { operation: fullOperation });

  // Call ConnectionManager
  const result = await ctx.ConnectionManagerRequestService.sendRequest(
    profileId,
    messagesWithMetadata,
    presetMaxTokens,
    options,
    generationParams
  );

  return result;
}
```

**Key Points:**
1. Accepts explicit `operationType` parameter
2. Reads operation suffix from context
3. Combines base operation type with suffix
4. Injects metadata into messages before sending
5. Works with both string prompts and message arrays

## Metadata Format

### XML-Tagged JSON Structure

```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>
```

### Field Definitions

**version** (string, required)
- Schema version identifier
- Currently always "1.0"
- Enables future schema evolution

**chat** (string, required)
- Full chat identifier with timestamp
- Format: "CharacterName - YYYY-MM-DD@HHhMMmSSs" for single chats
- Format: "GroupName" for group chats
- Matches `{{chat}}` macro used in Auto-Lorebooks

**operation** (string, required)
- Operation type with optional suffix
- Base types: chat, generate_scene_recap, detect_scene_break, lorebook_entry_lookup, etc.
- Suffixes: message ranges (e.g., "-42-67"), swipe numbers (e.g., "-swipe2")
- Combined: "generate_scene_recap-42-67"

**timestamp** (string, optional)
- ISO 8601 timestamp
- Added when `includeTimestamp: true` in options
- Currently not used by default

**custom** (object, optional)
- Operation-specific custom data
- Added when `custom: {...}` in options
- Currently not used by default

## Operation Types Reference

### Chat Operations

**chat**
- Base chat message from user/character
- No specific operation in progress

**chat-{index}**
- Chat message at specific index
- Example: "chat-42" = message at index 42

**chat-{index}-swipe{n}**
- Chat message swipe at specific index
- Example: "chat-42-swipe2" = second swipe of message 42

### Scene Operations

**detect_scene_break**
- Auto scene break detection LLM call
- Analyzes message ranges for scene boundaries

**generate_scene_recap**
- Scene recap generation
- Creates summary of scene content

**generate_scene_recap-{start}-{end}**
- Scene recap with message range
- Example: "generate_scene_recap-42-67" = recap of messages 42-67

**generate_running_recap**
- Running scene recap generation
- Combines multiple scene recaps into narrative

**combine_scene_with_running**
- Combining new scene with existing running recap
- Updates running narrative with new scene

### Validation Operations

**validate_recap**
- Recap validation LLM call
- Checks recap quality and adherence to guidelines

### Lorebook Operations

**lorebook_entry_lookup**
- Looking up lorebook entry information
- Searches for entity mentions in text

**resolve_lorebook_entry**
- Resolving/deduplicating lorebook entries
- Determines if entries refer to same entity

**create_lorebook_entry**
- Creating new lorebook entry
- Adds entity to lorebook

**merge_lorebook_entry**
- Merging lorebook entries
- Combines duplicate entries

**update_lorebook_registry**
- Updating lorebook registry entry
- Refreshes entity registry content

**populate_registries**
- Bulk registry population
- Processes multiple registry updates

### Unknown Operations

**unknown**
- Operation type could not be determined
- Fallback when stack trace analysis fails

## Settings

### Configuration Location

**Setting Key:** `first_hop_proxy_send_chat_details`
**Storage:** Per-profile setting in `extension_settings.auto_recap.profiles`
**Type:** Boolean
**Default:** `false`

### UI Location

**Panel:** First-Hop Proxy Integration
**Control:** Checkbox labeled "Send Chat Details"
**Description:** Enable metadata injection for downstream proxy logging

### Access Pattern

```javascript
import { get_settings } from './index.js';

const enabled = get_settings('first_hop_proxy_send_chat_details');
if (enabled) {
  // Inject metadata
}
```

## Usage Patterns

### Pattern 1: Simple Operation (No Range)

```javascript
import { generateRaw } from './index.js';

// No context needed - operation type detected from stack
const result = await generateRaw({
  prompt: 'Your prompt here',
  // ... other options
});

// Metadata injected automatically:
// operation: "generate_scene_recap"
```

### Pattern 2: Operation with Range

```javascript
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';
import { generateRaw } from './index.js';

setOperationSuffix('-42-67');
try {
  const result = await generateRaw({
    prompt: 'Your prompt here',
    // ... other options
  });
  // Metadata: operation: "generate_scene_recap-42-67"
} finally {
  clearOperationSuffix();
}
```

### Pattern 3: LLM Client Direct Call

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

## First-Hop Proxy Integration

### Proxy Responsibilities

**Metadata Extraction:**
```python
import re
import json

def extract_metadata(content):
    match = re.search(r'<ST_METADATA>\s*(\{[^}]+\})\s*</ST_METADATA>', content)
    if match:
        return json.loads(match.group(1))
    return None
```

**Metadata Stripping:**
```python
def strip_metadata(content):
    # Remove ST_METADATA blocks before forwarding to LLM
    content = re.sub(r'<ST_METADATA>[\s\S]*?</ST_METADATA>\n?\n?', '', content)
    return content
```

**Logging by Operation:**
The proxy uses metadata to organize logs:
- Create folder structure: `logs/characters/{character}/{timestamp}/`
- Name files: `{number}-{operation}.md`
- Separate chat vs extension operations

### Example Metadata Flow

**1. Extension sets context:**
```javascript
setOperationSuffix('-42-67');
```

**2. Extension calls LLM:**
```javascript
await generateRaw({ prompt: '...' });
```

**3. Interceptor injects metadata:**
```javascript
// Prompt becomes:
`<ST_METADATA>
{
  "version": "1.0",
  "chat": "Anonfilly - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
</ST_METADATA>

Your original prompt here...`
```

**4. Proxy receives request:**
```python
# Extract metadata
metadata = extract_metadata(request.content)
# {"version": "1.0", "chat": "Anonfilly - 2025-11-03@16h32m59s", "operation": "generate_scene_recap-42-67"}

# Strip metadata
clean_content = strip_metadata(request.content)

# Log to: logs/characters/Anonfilly/2025-11-03@16h32m59s/1-generate_scene_recap-42-67.md

# Forward clean content to LLM
response = llm_api.generate(clean_content)
```

**5. Extension cleans context:**
```javascript
clearOperationSuffix();
```

## Error Handling

### Metadata Injection Failures

All injection functions are wrapped in try/catch:

```javascript
export function injectMetadata(prompt, options = {}) {
  try {
    // ... injection logic ...
  } catch (err) {
    console.error('[Auto-Recap:Metadata] Error injecting metadata:', err);
    return prompt; // Return original prompt on error
  }
}
```

**Failure Behavior:**
- Log error to console
- Return original prompt unchanged
- LLM call proceeds without metadata
- No user-visible error

### Context Cleanup Failures

Always use try/finally for context cleanup:

```javascript
setOperationSuffix(suffix);
try {
  await performOperation();
} finally {
  clearOperationSuffix(); // Always executes
}
```

**Missing Cleanup:**
If cleanup is skipped, context leaks to next operation:
```javascript
// BAD - context leaks
setOperationSuffix('-42-67');
await operation1(); // Gets suffix
await operation2(); // Also gets suffix (wrong!)

// GOOD - context isolated
setOperationSuffix('-42-67');
try {
  await operation1(); // Gets suffix
} finally {
  clearOperationSuffix();
}
await operation2(); // No suffix (correct)
```

## Performance Considerations

### Interception Overhead

**Minimal Impact:**
- Metadata construction: ~0.1ms
- String concatenation: ~0.01ms
- Stack trace generation: ~1-2ms
- Total overhead: ~2-3ms per LLM call

**LLM Call Duration:**
- Typical LLM call: 500-5000ms
- Metadata overhead: <0.5% of total time

### Memory Usage

**Context Storage:**
- Global variable: 8 bytes per suffix string
- No memory accumulation (cleared after each operation)

**Metadata Blocks:**
- Typical size: 150-200 bytes
- Added to prompt (already in memory)
- Cleaned by garbage collector with prompt

### Concurrency

**Thread Safety:**
The current implementation is NOT thread-safe for concurrent operations:

```javascript
// Global variable - not safe for concurrent operations
let _context = { suffix: null };
```

**Limitation:**
If two operations run concurrently, they share the same context:
```javascript
// Operation A
setOperationSuffix('-10-20');
await generateRaw(...); // Might get wrong suffix if B runs

// Operation B (concurrent)
setOperationSuffix('-30-40');
await generateRaw(...); // Might get wrong suffix if A runs
```

**Mitigation:**
The extension uses a sequential operation queue to prevent concurrent LLM calls:
- Only one operation executes at a time
- Context is isolated per operation
- No concurrency issues in practice

## Testing

### Manual Testing

**Verify Installation:**
```javascript
// Check console on extension load
// Expected output:
// [Auto-Recap:Interceptor] Installing generateRaw interceptor...
// [Auto-Recap:Interceptor] ✓ Wrapped ctx.generateRaw
// [Auto-Recap:Interceptor] ✓ Interceptor installed successfully
```

**Verify Chat Injection:**
```javascript
// Enable setting
get_settings('first_hop_proxy_send_chat_details'); // true

// Send chat message, check console:
// [Interceptor] Processing chat array for CHAT_COMPLETION_PROMPT_READY
// [Auto-Recap:Interceptor] Injected metadata into existing system message
// [Auto-Recap:Interceptor] Metadata: {"version":"1.0","chat":"...","operation":"chat-42"}
```

**Verify Extension Operation:**
```javascript
// Trigger scene recap, check console:
// [Auto-Recap:Interceptor] wrappedGenerateRaw called!
// [Auto-Recap:Interceptor] Operation type: generate_scene_recap
// [Auto-Recap:Interceptor] Processed prompt (first 200 chars): <ST_METADATA>...
```

### Test Override Support

The system supports test overrides for mocking:

```javascript
// In test file
globalThis.__TEST_RECAP_TEXT_RESPONSE = 'Mock recap text';

// llmClient.js checks for override
const override = globalThis.__TEST_RECAP_TEXT_RESPONSE;
if (typeof override === 'string') {
  debug(SUBSYSTEM.CORE, '[LLMClient] Using test override response');
  return override;
}
```

### Automated Testing

**Test File:** `tests/features/connection-manager-blocking.spec.js`

Tests verify:
1. Metadata injection is enabled when setting is true
2. Metadata is not injected when setting is false
3. Operation context propagates correctly
4. Context cleanup works properly

## Future Enhancements

### Potential Additions

**1. Enhanced Metadata Fields**
```javascript
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67",
  "timestamp": "2025-11-03T16:32:59.123Z",
  "user_id": "user123",
  "session_id": "session456",
  "model": "claude-sonnet-3.5",
  "preset": "creative-writing",
  "token_estimate": 1500
}
```

**2. Operation-Specific Metadata**
```javascript
{
  "version": "1.0",
  "chat": "CharacterName - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67",
  "custom": {
    "scene_name": "The Battle",
    "include_lorebooks": true,
    "retry_count": 2
  }
}
```

**3. Async Context Storage**
Use AsyncLocalStorage for true thread-local storage:
```javascript
import { AsyncLocalStorage } from 'async_hooks';

const operationContext = new AsyncLocalStorage();

export function withOperationContext(context, fn) {
  return operationContext.run(context, fn);
}

export function getOperationContext() {
  return operationContext.getStore();
}
```

**4. Metadata Versioning**
Support multiple metadata schema versions:
```javascript
{
  "version": "2.0",
  "metadata_schema": "extended",
  // ... v2 fields
}
```

## Summary

The Metadata Injection System provides comprehensive operation tracking for all LLM requests through:

1. **Operation Context** - Simple suffix-based context storage
2. **Metadata Injection** - Structured JSON blocks in XML tags
3. **Global Interception** - Universal coverage via function wrapping and events
4. **LLM Client Integration** - Direct metadata support in client calls

The system enables downstream proxies to:
- Track operation types and message ranges
- Organize logs by character, chat, and operation
- Debug extension behavior
- Analyze usage patterns

All while maintaining:
- Minimal performance overhead
- Graceful error handling
- Clean separation of concerns
- Easy proxy integration

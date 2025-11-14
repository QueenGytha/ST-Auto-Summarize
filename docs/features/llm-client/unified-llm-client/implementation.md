# Unified LLM Client - Implementation

## Feature Overview

The Unified LLM Client (`llmClient.js`) provides a centralized, type-safe API wrapper for all LLM requests made by the extension. It replaces direct calls to SillyTavern's ConnectionManager API with a higher-level abstraction that handles:

- Connection profile resolution and management
- Preset loading and parameter extraction
- Token validation and context management
- Metadata injection for proxy tracking
- Response normalization and parsing
- Test override support for automated testing
- Error handling and validation

This unified interface ensures consistent LLM call behavior across all features (scene break detection, recap generation, lorebook merging, etc.) while centralizing configuration and error handling.

## Requirements

### Core Functionality

1. **Explicit Profile Requirement**: All LLM calls MUST specify an explicit connection profile ID (empty string not allowed)
2. **Preset Management**: Load generation parameters and prompts from completion presets by name
3. **Token Validation**: Validate prompt token count against preset context limits before sending
4. **Metadata Injection**: Inject ST_METADATA blocks into requests for proxy tracking
5. **Response Normalization**: Handle varying response formats (string, object with content/reasoning)
6. **Test Override Support**: Allow test harness to mock LLM responses via global override
7. **Sentence Trimming**: Optionally trim responses to complete sentences per ST settings
8. **Error Handling**: Throw descriptive errors for missing profiles, invalid presets, token overruns

### Configuration Parameters

The `sendLLMRequest()` function accepts these parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `profileId` | string | Yes | Connection profile ID (from ConnectionManager) |
| `prompt` | string \| array | Yes | Prompt text or messages array |
| `operationType` | string | Yes | Operation type for metadata (e.g., "DETECT_SCENE_BREAK") |
| `options.preset` | string | Yes | Preset name or "" for current active preset |
| `options.prefill` | string | No | Assistant prefill text (default: "") |
| `options.includePreset` | boolean | No | Include preset prompts in messages (default: false) |
| `options.stream` | boolean | No | Enable streaming (default: false) |
| `options.signal` | AbortSignal | No | Abort signal for cancellation |
| `options.extractData` | boolean | No | Extract response data (default: true) |
| `options.trimSentences` | boolean | No | Trim to complete sentence (default: true) |
| `options.overridePayload` | object | No | Override generation parameters |

### Response Format

Returns a **string** containing the LLM's response text. Internal handling:

1. If ConnectionManager returns `{content, reasoning}`, extract `content`
2. If response is already a string, return as-is
3. Apply sentence trimming if enabled in ST settings
4. Return final normalized string

## Technical Implementation

### Module: `llmClient.js`

#### Core Function: `sendLLMRequest()`

```javascript
export async function sendLLMRequest(profileId, prompt, operationType, options = {})
```

**Execution Flow:**

1. **Validate Profile ID**
   - Throw if profileId is empty or missing
   - Lookup profile in ConnectionManager registry
   - Throw if profile not found

2. **Test Override Check**
   - Check for `globalThis.__TEST_RECAP_TEXT_RESPONSE`
   - Return override value if present (skip all LLM processing)
   - Used by test harness to mock LLM responses

3. **Preset Resolution**
   - `options.preset` is REQUIRED (explicit empty string means "use current active")
   - Empty string ("") → resolve to current active preset name
   - Non-empty string → use as explicit preset name
   - Throw if preset not found or no active preset

4. **Load Generation Parameters**
   - Get preset data via `presetManager.getCompletionPresetByName()`
   - Extract parameters: temperature, top_p, min_p, presence_penalty, frequency_penalty, repetition_penalty, top_k
   - Extract max_tokens from `genamt` or `openai_max_tokens`
   - Throw if max_tokens is missing or invalid

5. **Token Validation**
   - Count tokens in prompt via `count_tokens()`
   - Get context size from preset (`max_context` or `openai_max_context`)
   - Calculate available context: `max_context - max_tokens`
   - Throw if prompt exceeds available context
   - Skip validation if preset has no max_context configured

6. **Load Preset Prompts (if includePreset)**
   - Call `loadPresetPrompts(presetName)` to get preset messages
   - Load preset prefill from `assistant_prefill`
   - Prefill priority: explicit option > preset prefill
   - For OpenAI API: inject system prompt for data extraction
   - Build messages array: `[...presetMessages, systemPrompt?, userPrompt]`

7. **Add Prefill as Assistant Message**
   - If prefill exists, append `{role: 'assistant', content: prefill}` to messages
   - ConnectionManager has no native prefill parameter → must add as message

8. **Inject Metadata**
   - Get operation suffix from `getOperationSuffix()` (e.g., "-42-67" for message range)
   - Build full operation string: `operationType + suffix`
   - Call `injectMetadataIntoChatArray(messages, {operation: fullOperation})`
   - Metadata block prepended to first system message or new system message

9. **Call ConnectionManager**
   - `ctx.ConnectionManagerRequestService.sendRequest(profileId, messages, max_tokens, options, generationParams)`
   - Pass stream, signal, extractData, includePreset, includeInstruct settings
   - Merge generationParams with overridePayload

10. **Normalize Response**
    - If response is object with `content` field, extract content
    - If response is string, use as-is
    - Log response structure for debugging

11. **Sentence Trimming**
    - If `ctx.powerUserSettings.trim_sentences` is enabled
    - Call `trimToEndSentence()` to trim to complete sentence
    - Respects `options.trimSentences` (default: true)

12. **Return Final String**
    - Return normalized string response

#### Error Handling

```javascript
// Empty profile ID
throw new Error('sendLLMRequest requires explicit profileId. Empty string not allowed.');

// Profile not found
throw new Error(`Connection Manager profile not found: ${profileId}`);

// Preset required
throw new Error(`FATAL: options.preset is required. Caller must provide completion preset from operation settings.`);

// No active preset when using empty string
throw new Error(`FATAL: Empty preset setting means "use current active preset", but no preset is currently active in SillyTavern.`);

// Preset not found
throw new Error(`FATAL: Preset "${presetName}" not found. Preset must exist and be valid.`);

// Missing max_tokens
throw new Error(`FATAL: Preset "${presetName}" has no valid max_tokens. Preset must have max_tokens > 0 configured.`);

// Token overrun
throw new Error(`Prompt ${tokenSize} tokens exceeds available context ${availableContext} (model context: ${maxContext}, reserved for response: ${maxTokens})`);
```

### Module: `presetPromptLoader.js`

#### Function: `loadPresetPrompts(presetName)`

Loads prompts from a completion preset by name without waiting for preset switching.

```javascript
export async function loadPresetPrompts(presetName)
```

**Execution Flow:**

1. **API Validation**
   - Only works for OpenAI API (`main_api === 'openai'`)
   - Return empty array for other APIs

2. **Get Preset Manager**
   - Import `getPresetManager('openai')`
   - Return empty array if not available

3. **Load Preset Data**
   - Call `presetManager.getCompletionPresetByName(presetName)`
   - Return empty array if preset not found or has no prompts

4. **Get Character ID**
   - Use `this_chid` for current character
   - Fallback to DEFAULT_CHARACTER_ID if no character

5. **Build Enabled Prompts Set**
   - Get `prompt_order` config for character from preset
   - Extract enabled identifiers from `prompt_order.order[]`
   - Filter prompts by enabled status

6. **Filter and Process Prompts**
   - Filter out prompts with no content
   - Check against enabled identifiers set
   - Substitute params in content via `substituteParams()`
   - Preserve all prompt properties (role, identifier, injection_order, etc.)

7. **Sort by Injection Order**
   - Sort prompts by `injection_order` field
   - Default injection_order: 100

8. **Return Messages Array**
   - Return array of message objects with substituted content

**Return Format:**

```javascript
[
  {
    role: 'system',
    content: 'substituted prompt text',
    identifier: 'main',
    injection_order: 10,
    enabled: true,
    // ... other prompt properties preserved
  },
  // ... more prompts
]
```

### Module: `metadataInjector.js`

#### Function: `injectMetadataIntoChatArray(chatArray, options)`

Injects ST_METADATA blocks into chat arrays for proxy tracking.

```javascript
export function injectMetadataIntoChatArray(chatArray, options = {})
```

**Execution Flow:**

1. **Check if Enabled**
   - Check `get_settings('first_hop_proxy_send_chat_details')`
   - Return early if disabled

2. **Check for Existing Metadata**
   - Call `getExistingOperation(chatArray)` to find existing metadata
   - If `options.replaceIfChat === true` and existing is chat-type operation:
     - Strip existing metadata and inject new specific operation
   - Otherwise, defer to existing metadata

3. **Create Metadata Block**
   - Call `createMetadataBlock(options)` with operation type
   - Format: `{version: '1.0', chat: chatName, operation: operationType}`
   - Optionally add timestamp and custom fields

4. **Format as String**
   - Wrap in `<ST_METADATA>` tags
   - Pretty-print JSON (2-space indent)

5. **Inject into Chat Array**
   - Find first system message in chatArray
   - If found: prepend metadata to existing content
   - If not found: insert new system message at beginning

**Metadata Format:**

```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "Character Name - 2024-01-15@12h34m56s",
  "operation": "DETECT_SCENE_BREAK-42-67"
}
</ST_METADATA>

Original system message content...
```

### Module: `operationContext.js`

#### Global Context for Operation Suffixes

Provides thread-local storage for operation suffixes (e.g., message ranges).

```javascript
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
import { setOperationSuffix, clearOperationSuffix } from './operationContext.js';

// Before LLM call
setOperationSuffix('-42-67');  // e.g., message range 42-67

try {
  await sendLLMRequest(...);  // Metadata injector will read suffix
} finally {
  clearOperationSuffix();  // Always cleanup
}
```

This allows passing contextual information (like message ranges) from high-level operations down to the metadata injector without modifying function signatures.

### Helper Functions

#### `getConnectionManagerProfileId(profileName)`

Convert profile name to profile ID.

```javascript
export function getConnectionManagerProfileId(profileName) {
  const ctx = getContext();
  const profiles = ctx.extensionSettings.connectionManager?.profiles || [];
  const profile = profiles.find(p => p.name === profileName);
  return profile?.id || null;
}
```

#### `resolveProfileSettings(profileId)`

Get full profile settings object by ID.

```javascript
export function resolveProfileSettings(profileId) {
  if (!profileId || profileId === '') { return null; }

  const ctx = getContext();
  const profile = ctx.extensionSettings.connectionManager?.profiles?.find(p => p.id === profileId);
  if (!profile) {
    throw new Error(`Connection Manager profile not found: ${profileId}`);
  }
  return profile;
}
```

## Integration with Features

### Scene Break Detection

**File:** `autoSceneBreakDetection.js`

```javascript
const { sendLLMRequest } = await import('./llmClient.js');

// Get profile ID from settings
const effectiveProfile = getConnectionManagerProfileId(
  get_settings('auto_scene_break_connection_profile') || ''
) || ctx.extensionSettings.connectionManager.activeProfile;

// Build prompt
const prompt = get_settings('auto_scene_break_prompt')
  .replace('{{messages}}', formattedMessages)
  .replace('{{minimum_scene_length}}', minimumSceneLength);

// Call LLM
response = await sendLLMRequest(effectiveProfile, prompt, OperationType.DETECT_SCENE_BREAK, {
  preset: get_settings('auto_scene_break_completion_preset') || '',
  prefill: get_settings('auto_scene_break_prefill') || '',
  includePreset: get_settings('auto_scene_break_include_preset_prompts') ?? false
});
```

### Scene Recap Generation

**File:** `runningSceneRecap.js`

```javascript
const { sendLLMRequest } = await import('./llmClient.js');

const effectiveProfile = getConnectionManagerProfileId(
  get_settings('running_scene_recap_connection_profile') || ''
) || ctx.extensionSettings.connectionManager.activeProfile;

const prompt = get_settings('running_scene_recap_prompt')
  .replace('{{previous_running_recap}}', previousRecap)
  .replace('{{new_scene_recap}}', newSceneRecap);

result = await sendLLMRequest(effectiveProfile, prompt, OperationType.GENERATE_RUNNING_RECAP, {
  preset: get_settings('running_scene_recap_completion_preset') || '',
  prefill: get_settings('running_scene_recap_prefill') || '',
  includePreset: get_settings('running_scene_recap_include_preset_prompts') ?? false
});
```

### Lorebook Entry Merging

**File:** `lorebookEntryMerger.js`

```javascript
const { sendLLMRequest } = await import('./llmClient.js');

const effectiveProfile = getConnectionManagerProfileId(
  get_settings('auto_lorebooks_recap_merge_connection_profile') || ''
) || ctx.extensionSettings.connectionManager.activeProfile;

const prompt = get_settings('auto_lorebooks_recap_merge_prompt')
  .replace('{{existing_content}}', existingContent)
  .replace('{{new_content}}', newContent);

response = await sendLLMRequest(effectiveProfile, prompt, OpType.MERGE_LOREBOOK_ENTRY, {
  preset: get_settings('auto_lorebooks_recap_merge_completion_preset') || '',
  prefill: get_settings('auto_lorebooks_recap_merge_prefill') || '',
  includePreset: get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false
});
```

## Preset Resolution Strategy

### Empty String ("") Preset Handling

When `options.preset === ""`:

1. Get current active preset from PresetManager
2. Throw if no preset is currently active in SillyTavern
3. Use active preset's generation parameters and prompts

**Rationale:** Empty string explicitly means "use whatever is currently active", which is a valid choice when the user wants the extension to use their current ST configuration.

### Explicit Preset Name

When `options.preset === "My Preset Name"`:

1. Load preset by exact name
2. Throw if preset not found
3. Use specified preset's parameters and prompts

**Rationale:** Explicit preset name allows features to use dedicated presets (e.g., "Scene Detection" preset with low temperature).

### Why Preset is Required

The extension operates with separate connection profiles that may have different presets than the main chat. To avoid ambiguity:

- Callers MUST explicitly specify preset behavior (current active or specific name)
- No implicit fallbacks or guesses
- Fail fast if preset is invalid

## Token Validation Logic

### Context Calculation

```
Total Model Context = preset.max_context (e.g., 8192)
Reserved for Response = preset.max_tokens (e.g., 1024)
Available for Prompt = max_context - max_tokens (e.g., 7168)
```

### Validation

```javascript
const tokenSize = count_tokens(prompt);
const availableContextForPrompt = presetMaxContext - presetMaxTokens;

if (tokenSize > availableContextForPrompt) {
  throw new Error(`Prompt ${tokenSize} tokens exceeds available context ${availableContextForPrompt}`);
}
```

### Skip Validation

If preset has no `max_context` configured (some APIs don't expose context limits), skip validation:

```javascript
if (!presetMaxContext || presetMaxContext <= 0) {
  debug('[LLMClient] Skipping token validation - preset has no max_context configured');
}
```

## Test Override Support

The unified client supports test mocking via global override:

```javascript
// In test file
globalThis.__TEST_RECAP_TEXT_RESPONSE = 'Mock LLM response text';

// In llmClient.js - executes before ANY other processing
const override = globalThis.__TEST_RECAP_TEXT_RESPONSE;
if (typeof override === 'string') {
  debug('[LLMClient] Using test override response');
  return override;
}
```

**Benefits:**

1. **Fast Tests**: No actual LLM calls during testing
2. **Deterministic**: Tests always get same response
3. **Coverage**: Test validation logic without API dependency
4. **Global Scope**: Works across all features using sendLLMRequest()

**Usage in Tests:**

```javascript
test('scene break detection validates response', async ({ page }) => {
  // Set override
  await page.evaluate(() => {
    globalThis.__TEST_RECAP_TEXT_RESPONSE = '{"sceneBreakAt": 5, "rationale": "Time skip"}';
  });

  // Trigger detection
  await page.click('#manual_scene_break_detection');

  // Verify behavior
  await expect(page.locator('.scene_break_div[data-mesid="5"]')).toBeVisible();
});
```

## Debugging and Logging

The unified client includes comprehensive debug logging:

```javascript
// Profile and operation
debug(SUBSYSTEM.CORE, `[LLMClient] Sending request with profile "${profile.name}" (${profileId}), operation: ${operationType}`);

// Preset resolution
debug(SUBSYSTEM.CORE, `[LLMClient] Empty preset resolved to current active: ${effectivePresetName}`);
debug(SUBSYSTEM.CORE, `[LLMClient] Loaded generation params from preset "${effectivePresetName}":`, generationParams);

// Token validation
debug(SUBSYSTEM.CORE, `[LLMClient] Token validation passed: ${tokenSize} <= ${availableContextForPrompt} (${presetMaxContext} - ${presetMaxTokens})`);

// Preset prompts
debug(SUBSYSTEM.CORE, `[LLMClient] includePreset=${options.includePreset}, preset="${effectivePresetName}"`);

// Response structure
debug(SUBSYSTEM.CORE, `[LLMClient] Raw response type: ${typeof result}`);
debug(SUBSYSTEM.CORE, `[LLMClient] Response keys: ${Object.keys(result).join(', ')}`);
debug(SUBSYSTEM.CORE, `[LLMClient] Response.content: ${JSON.stringify(result.content)?.slice(0, 100)}`);

// Sentence trimming
debug(SUBSYSTEM.CORE, `[LLMClient] Trimmed result to complete sentence`);

// Success
debug(SUBSYSTEM.CORE, `[LLMClient] Request completed successfully for operation: ${operationType}`);
```

## Error Scenarios and Recovery

### Profile Not Found

**Error:**
```
Connection Manager profile not found: abc123
```

**Cause:** Profile ID doesn't exist in ConnectionManager registry

**Recovery:** Check profile ID is correct, or fall back to active profile

### Preset Not Found

**Error:**
```
FATAL: Preset "Scene Detection" not found. Preset must exist and be valid.
```

**Cause:** Preset name doesn't match any saved preset

**Recovery:** Check preset name spelling, or use "" to use current active preset

### No Active Preset

**Error:**
```
FATAL: Empty preset setting means "use current active preset", but no preset is currently active in SillyTavern.
```

**Cause:** Using "" for preset but no preset selected in ST

**Recovery:** Select a preset in ST, or configure explicit preset name

### Token Overrun

**Error:**
```
Prompt 8500 tokens exceeds available context 7168 (model context: 8192, reserved for response: 1024)
```

**Cause:** Prompt too large for model context

**Recovery:**
1. Reduce prompt size (fewer messages, shorter context)
2. Use model with larger context
3. Increase max_context in preset
4. Decrease max_tokens in preset

### Missing Max Tokens

**Error:**
```
FATAL: Preset "Scene Detection" has no valid max_tokens. Preset must have max_tokens > 0 configured.
```

**Cause:** Preset missing `genamt` or `openai_max_tokens` field

**Recovery:** Edit preset in ST to add max_tokens setting

## Connection to Operation Queue

The unified client integrates with the operation queue system:

1. **LLM Call Validation**: `llmCallValidator.js` tracks LLM calls per operation
2. **Operation Abort**: Accept `signal` parameter for cancellation
3. **Operation Context**: Read operation suffix via `getOperationSuffix()`
4. **Metadata Injection**: Tag requests with operation type for proxy tracking

### Abort Signal Support

```javascript
// In operation handler
const signal = getAbortSignal(operation);

const result = await sendLLMRequest(profileId, prompt, operationType, {
  preset: '...',
  signal: signal  // Pass abort signal
});

// Check if aborted after LLM call
throwIfAborted(signal, 'DETECT_SCENE_BREAK', 'LLM call');
```

### LLM Call Tracking

```javascript
// In llmClient.js (future integration)
import { recordLLMCall } from './llmCallValidator.js';

// Before calling ConnectionManager
recordLLMCall({ prompt: prompt });
```

## Legacy vs Unified Client Comparison

### Old Approach (Deprecated)

```javascript
// Direct ConnectionManager calls scattered across modules
const response = await generateRaw(prompt, '', false, false);

// Issues:
// - No centralized error handling
// - No token validation
// - No metadata injection
// - No preset loading
// - No test override support
// - Inconsistent response parsing
```

### New Unified Approach

```javascript
// Centralized, type-safe API
const { sendLLMRequest } = await import('./llmClient.js');

const response = await sendLLMRequest(profileId, prompt, operationType, {
  preset: presetName,
  prefill: prefillText,
  includePreset: true
});

// Benefits:
// - Centralized error handling and validation
// - Automatic token checking
// - Metadata injection for proxy tracking
// - Preset loading and parameter extraction
// - Test override support
// - Consistent response normalization
// - Comprehensive debug logging
```

## Future Enhancements

### Potential Improvements

1. **Streaming Support**: Full streaming implementation with chunk handling
2. **Retry Logic**: Automatic retry on rate limit or transient errors
3. **Response Caching**: Cache responses for identical prompts (testing only)
4. **Token Estimation**: Pre-flight token estimation before full prompt build
5. **Multi-Model Support**: Fallback to alternative models on primary failure
6. **Response Validation**: Schema validation for structured outputs (JSON)
7. **Performance Metrics**: Track latency, token usage per operation type
8. **Cost Tracking**: Estimate API costs per operation (commercial APIs)

### Considerations

- **Streaming**: Requires UI updates for progressive display
- **Retry Logic**: Must respect abort signals and queue cancellation
- **Caching**: Dev-only feature, disabled in production
- **Validation**: Integrate with JSON schema validation for lorebook extraction
- **Metrics**: Export to extension settings for user visibility

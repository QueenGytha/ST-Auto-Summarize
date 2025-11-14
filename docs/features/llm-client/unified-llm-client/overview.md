# Unified LLM Client

**Feature #153**
**Category:** LLM Client

---

## Description

The Unified LLM Client provides a centralized, type-safe API wrapper for all Large Language Model requests made by the ST-Auto-Recap extension. It abstracts the complexity of connection profile management, preset loading, token validation, and response processing into a single, consistent interface used by all features.

---

## Overview

The extension makes dozens of LLM calls across various features: scene break detection, recap generation, lorebook merging, running scene recap generation, and entity extraction. Before the unified client, each feature made direct calls to SillyTavern's APIs with inconsistent error handling, no token validation, and scattered configuration logic.

The Unified LLM Client (`llmClient.js`) consolidates all LLM request logic into a single module that:

- **Validates profiles and presets**: Ensures connection profiles exist and presets are loaded correctly
- **Validates token counts**: Checks prompt size against model context limits before sending
- **Loads preset prompts**: Automatically includes preset system prompts and jailbreaks when requested
- **Injects metadata**: Tags requests with operation type and context for proxy tracking
- **Normalizes responses**: Handles varying response formats (string, object with content/reasoning)
- **Supports testing**: Allows test harness to mock LLM responses via global override
- **Handles errors consistently**: Throws descriptive errors for all failure modes

This unified approach ensures every LLM call follows the same validation and processing pipeline, reducing bugs and improving maintainability.

---

## Core Function

```javascript
export async function sendLLMRequest(profileId, prompt, operationType, options = {})
```

**Parameters:**

- `profileId` (string, required): Connection profile ID from ConnectionManager
- `prompt` (string | array, required): Prompt text or messages array
- `operationType` (string, required): Operation type for metadata (e.g., "DETECT_SCENE_BREAK")
- `options` (object, optional):
  - `preset` (string, required): Preset name or "" for current active
  - `prefill` (string): Assistant prefill text
  - `includePreset` (boolean): Include preset prompts in messages
  - `stream` (boolean): Enable streaming
  - `signal` (AbortSignal): Abort signal for cancellation
  - `extractData` (boolean): Extract response data
  - `trimSentences` (boolean): Trim to complete sentence
  - `overridePayload` (object): Override generation parameters

**Returns:** String containing the LLM's response text

**Example Usage:**

```javascript
const { sendLLMRequest } = await import('./llmClient.js');
const { getConnectionManagerProfileId } = await import('./llmClient.js');

// Get profile ID from settings
const profileName = get_settings('auto_scene_break_connection_profile') || '';
const profileId = getConnectionManagerProfileId(profileName)
  || ctx.extensionSettings.connectionManager.activeProfile;

// Build prompt
const prompt = get_settings('auto_scene_break_prompt')
  .replace('{{messages}}', formattedMessages);

// Call LLM with unified client
const response = await sendLLMRequest(
  profileId,
  prompt,
  OperationType.DETECT_SCENE_BREAK,
  {
    preset: get_settings('auto_scene_break_completion_preset') || '',
    prefill: get_settings('auto_scene_break_prefill') || '',
    includePreset: false
  }
);

// Parse response
const result = JSON.parse(response);
```

---

## Key Features

### 1. Explicit Profile Requirement

All LLM calls MUST specify an explicit connection profile ID. Empty string is not allowed. This prevents ambiguity when multiple profiles exist.

```javascript
// ✓ CORRECT
const profileId = getConnectionManagerProfileId('Scene Detection')
  || ctx.extensionSettings.connectionManager.activeProfile;

await sendLLMRequest(profileId, prompt, operationType, options);

// ✗ WRONG - will throw error
await sendLLMRequest('', prompt, operationType, options);
```

### 2. Preset Resolution

The `options.preset` parameter is REQUIRED and supports two modes:

- **Empty string ("")**: Use current active preset in SillyTavern
- **Preset name**: Use specific preset (e.g., "Scene Detection")

```javascript
// Use current active preset
await sendLLMRequest(profileId, prompt, operationType, {
  preset: ''  // Resolves to currently active preset
});

// Use specific preset
await sendLLMRequest(profileId, prompt, operationType, {
  preset: 'Scene Detection'  // Load this exact preset
});
```

### 3. Token Validation

Before sending requests, the client validates prompt token count against preset context limits:

```
Available Context = Preset Max Context - Preset Max Tokens
Validation: Prompt Tokens <= Available Context
```

If validation fails, throws descriptive error:

```
Prompt 8500 tokens exceeds available context 7680
(model context: 8192, reserved for response: 512)
```

### 4. Preset Prompt Loading

When `includePreset: true`, automatically loads and includes preset prompts (system prompts, jailbreaks, etc.) in the request:

```javascript
await sendLLMRequest(profileId, prompt, operationType, {
  preset: 'Scene Detection',
  includePreset: true  // Include preset system prompts
});
```

The client:
1. Loads preset prompts from preset data
2. Filters by enabled status and prompt_order
3. Substitutes params in prompt content
4. Sorts by injection_order
5. Prepends to messages array

### 5. Metadata Injection

Automatically injects ST_METADATA blocks into requests for proxy tracking:

```xml
<ST_METADATA>
{
  "version": "1.0",
  "chat": "Character Name - 2024-01-15@12h34m56s",
  "operation": "DETECT_SCENE_BREAK-42-67"
}
</ST_METADATA>
```

The metadata includes:
- Operation type (e.g., DETECT_SCENE_BREAK)
- Operation suffix from context (e.g., "-42-67" for message range)
- Chat name/ID

This allows the first-hop proxy to track which operations generate which requests for monitoring and debugging.

### 6. Response Normalization

Handles varying response formats from ConnectionManager:

```javascript
// If response is object with content field
{ content: "response text", reasoning: null }
// Extracts to: "response text"

// If response is already string
"response text"
// Returns as-is: "response text"
```

Optionally trims to complete sentence if ST's `trim_sentences` setting is enabled.

### 7. Test Override Support

Test harness can mock LLM responses via global override:

```javascript
// In test file
globalThis.__TEST_RECAP_TEXT_RESPONSE = '{"sceneBreakAt": 5, "rationale": "Test"}';

// In production code
const response = await sendLLMRequest(...);
// Immediately returns: '{"sceneBreakAt": 5, "rationale": "Test"}'
// Skips ALL processing (profile, preset, token validation, API call)
```

This enables fast, deterministic testing without actual LLM calls.

---

## Configuration

### Feature-Specific Settings

Each feature using the unified client configures:

- **Connection Profile**: Optional dedicated profile for this feature
- **Completion Preset**: Optional dedicated preset for this feature
- **Prefill**: Optional assistant prefill to enforce output format
- **Include Preset Prompts**: Whether to load preset system prompts

**Example: Scene Break Detection Settings**

```javascript
{
  auto_scene_break_connection_profile: "Scene Detection Profile",  // or "" for current
  auto_scene_break_completion_preset: "Scene Detection",           // or "" for active
  auto_scene_break_prefill: '{"sceneBreakAt":',                    // JSON enforcement
  auto_scene_break_include_preset_prompts: false                   // Skip preset prompts
}
```

### Profile and Preset Lookup

```javascript
// Get profile ID from name
const profileId = getConnectionManagerProfileId(profileName)
  || ctx.extensionSettings.connectionManager.activeProfile;

// Get full profile settings
const profile = resolveProfileSettings(profileId);
```

---

## Supporting Modules

### presetPromptLoader.js

Loads prompts from completion presets by name without waiting for preset switching.

```javascript
export async function loadPresetPrompts(presetName)
```

Returns array of message objects with substituted content.

### metadataInjector.js

Injects ST_METADATA blocks into chat arrays for proxy tracking.

```javascript
export function injectMetadataIntoChatArray(chatArray, options = {})
```

Prepends metadata to first system message or creates new system message.

### operationContext.js

Provides thread-local storage for operation suffixes (e.g., message ranges).

```javascript
setOperationSuffix('-42-67');    // Set suffix
getOperationSuffix();            // Read suffix in metadata injector
clearOperationSuffix();          // Always cleanup after LLM call
```

---

## Integration Examples

### Scene Break Detection

```javascript
// autoSceneBreakDetection.js
const { sendLLMRequest } = await import('./llmClient.js');

setOperationSuffix(`-${startIndex}-${endIndex}`);

try {
  response = await sendLLMRequest(
    effectiveProfile,
    prompt,
    OperationType.DETECT_SCENE_BREAK,
    {
      preset: get_settings('auto_scene_break_completion_preset') || '',
      prefill: get_settings('auto_scene_break_prefill') || '',
      includePreset: false
    }
  );
} finally {
  clearOperationSuffix();
}
```

### Running Scene Recap

```javascript
// runningSceneRecap.js
const { sendLLMRequest } = await import('./llmClient.js');

result = await sendLLMRequest(
  effectiveProfile,
  prompt,
  OperationType.GENERATE_RUNNING_RECAP,
  {
    preset: get_settings('running_scene_recap_completion_preset') || '',
    prefill: get_settings('running_scene_recap_prefill') || '',
    includePreset: get_settings('running_scene_recap_include_preset_prompts') ?? false
  }
);
```

### Lorebook Entry Merging

```javascript
// lorebookEntryMerger.js
const { sendLLMRequest } = await import('./llmClient.js');

response = await sendLLMRequest(
  effectiveProfile,
  prompt,
  OpType.MERGE_LOREBOOK_ENTRY,
  {
    preset: get_settings('auto_lorebooks_recap_merge_completion_preset') || '',
    prefill: get_settings('auto_lorebooks_recap_merge_prefill') || '',
    includePreset: get_settings('auto_lorebooks_recap_merge_include_preset_prompts') ?? false
  }
);
```

---

## Error Handling

The unified client throws descriptive errors for all failure modes:

```javascript
// Empty profile ID
throw new Error('sendLLMRequest requires explicit profileId. Empty string not allowed.');

// Profile not found
throw new Error(`Connection Manager profile not found: ${profileId}`);

// Missing preset parameter
throw new Error(`FATAL: options.preset is required`);

// No active preset when using ""
throw new Error(`FATAL: Empty preset setting means "use current active preset", but no preset is currently active`);

// Preset not found
throw new Error(`FATAL: Preset "${presetName}" not found`);

// Missing max_tokens
throw new Error(`FATAL: Preset "${presetName}" has no valid max_tokens`);

// Token overrun
throw new Error(`Prompt ${tokenSize} tokens exceeds available context ${availableContext}`);
```

Features catch these errors and handle appropriately:

```javascript
try {
  const response = await sendLLMRequest(...);
  // Process response
} catch (err) {
  error(SUBSYSTEM.CORE, `LLM request failed: ${err.message}`);
  toast(`Error: ${err.message}`, 'error');
  throw err; // Re-throw for operation queue retry
}
```

---

## Benefits

### Before Unified Client (Legacy)

- Direct `generateRaw()` calls scattered across codebase
- No token validation
- No preset prompt loading
- No metadata injection
- Inconsistent error handling
- No test override support
- Scattered configuration logic

### After Unified Client (Current)

- Single entry point for all LLM calls
- Automatic token validation
- Preset prompt loading
- Metadata injection for proxy tracking
- Consistent error messages
- Test override support
- Centralized configuration

**Result:** Reduced bugs, improved maintainability, consistent behavior across all features.

---

## Related Documentation

- **[Implementation Details](./implementation.md)** - Complete technical implementation
- **[Data Flow](./data-flow.md)** - Complete request/response data flow
- [Connection Profile Integration](../../profile-configuration/connection-profile-integration/)
- [Preset Management](../../profile-configuration/preset-management/)
- [First-Hop Proxy Metadata](../../proxy-integration/first-hop-proxy-metadata/)
- [LLM Client Features](../README.md)
- [Main Feature Overview](../../overall-overview.md)
- [Documentation Hub](../../../README.md)

---

**Status:** Fully Implemented and Documented

# Unified LLM Client - Data Flow

## Overview

This document traces the complete data flow through the Unified LLM Client system, from initial feature request through response processing. It shows how prompts, settings, and metadata flow through the various modules before reaching the ConnectionManager API.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Feature Layer                              │
│  (Scene Break Detection, Recap Generation, Lorebook Merging)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    llmClient.js                                  │
│  • Profile resolution                                            │
│  • Preset loading                                                │
│  • Token validation                                              │
│  • Message construction                                          │
│  • Metadata injection                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           ConnectionManagerRequestService                        │
│  (SillyTavern Core API)                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Provider                                  │
│  (OpenAI, Claude, Local API, etc.)                               │
└─────────────────────────────────────────────────────────────────┘
```

## Complete Request Flow

### Phase 1: Feature Initiates Request

**Example: Scene Break Detection**

```javascript
// autoSceneBreakDetection.js - Line ~626
const { sendLLMRequest } = await import('./llmClient.js');

// 1. Get connection profile from settings
const profileName = get_settings('auto_scene_break_connection_profile') || '';
const effectiveProfile = getConnectionManagerProfileId(profileName)
  || ctx.extensionSettings.connectionManager.activeProfile;

// 2. Build prompt with substitutions
const prompt = get_settings('auto_scene_break_prompt')
  .replace('{{messages}}', formattedMessages)
  .replace('{{minimum_scene_length}}', minimumSceneLength);

// 3. Get preset and prefill settings
const preset = get_settings('auto_scene_break_completion_preset') || '';
const prefill = get_settings('auto_scene_break_prefill') || '';
const includePreset = get_settings('auto_scene_break_include_preset_prompts') ?? false;

// 4. Set operation context (for metadata suffix)
setOperationSuffix(`-${startIndex}-${endIndex}`);

try {
  // 5. Call unified LLM client
  response = await sendLLMRequest(
    effectiveProfile,                 // profileId
    prompt,                            // prompt string
    OperationType.DETECT_SCENE_BREAK,  // operation type
    {
      preset: preset,
      prefill: prefill,
      includePreset: includePreset
    }
  );
} finally {
  // 6. Always cleanup context
  clearOperationSuffix();
}
```

**Data at this stage:**

```javascript
{
  profileId: "cm_profile_abc123",
  prompt: "You are segmenting a roleplay transcript...\n\nMessages to analyze:\nMessage #42 [USER]: ...",
  operationType: "DETECT_SCENE_BREAK",
  options: {
    preset: "Scene Detection",
    prefill: '{"sceneBreakAt":',
    includePreset: false
  }
}
```

### Phase 2: Profile and Preset Resolution

**llmClient.js - Lines 11-87**

```javascript
// 1. VALIDATE PROFILE
if (!profileId || profileId === '') {
  throw new Error('sendLLMRequest requires explicit profileId');
}

const profile = ctx.extensionSettings.connectionManager.profiles.find(
  p => p.id === profileId
);

if (!profile) {
  throw new Error(`Connection Manager profile not found: ${profileId}`);
}

// 2. RESOLVE PRESET NAME
let effectivePresetName;
if (options.preset === '') {
  // Empty string = use current active preset
  effectivePresetName = presetManager?.getSelectedPresetName();

  if (!effectivePresetName) {
    throw new Error('No preset currently active in SillyTavern');
  }
} else {
  // Use explicit preset name
  effectivePresetName = options.preset;
}

// 3. LOAD PRESET DATA
const presetData = presetManager?.getCompletionPresetByName(effectivePresetName);

if (!presetData) {
  throw new Error(`Preset "${effectivePresetName}" not found`);
}

// 4. EXTRACT GENERATION PARAMETERS
const generationParams = {
  temperature: presetData.temperature >= 0 ? Number(presetData.temperature) : undefined,
  top_p: presetData.top_p >= 0 ? Number(presetData.top_p) : undefined,
  min_p: presetData.min_p >= 0 ? Number(presetData.min_p) : undefined,
  presence_penalty: presetData.presence_penalty >= 0 ? Number(presetData.presence_penalty) : undefined,
  frequency_penalty: presetData.frequency_penalty >= 0 ? Number(presetData.frequency_penalty) : undefined,
  repetition_penalty: presetData.repetition_penalty >= 0 ? Number(presetData.repetition_penalty) : undefined,
  top_k: presetData.top_k >= 0 ? Number(presetData.top_k) : undefined,
};

// Remove undefined values
for (const key of Object.keys(generationParams)) {
  if (generationParams[key] === undefined) {
    delete generationParams[key];
  }
}

// 5. EXTRACT MAX TOKENS
const presetMaxTokens = presetData.genamt || presetData.openai_max_tokens;
if (!presetMaxTokens || presetMaxTokens <= 0) {
  throw new Error(`Preset has no valid max_tokens`);
}
```

**Data after resolution:**

```javascript
{
  profile: {
    id: "cm_profile_abc123",
    name: "Scene Detection Profile",
    api: "openai",
    // ... other profile settings
  },
  effectivePresetName: "Scene Detection",
  presetData: {
    temperature: 0.7,
    top_p: 0.9,
    openai_max_tokens: 512,
    openai_max_context: 8192,
    prompts: [...],
    assistant_prefill: "",
    // ... other preset settings
  },
  generationParams: {
    temperature: 0.7,
    top_p: 0.9
  },
  presetMaxTokens: 512
}
```

### Phase 3: Token Validation

**llmClient.js - Lines 89-108**

```javascript
// Only validate if prompt is a string (not pre-built messages array)
if (typeof prompt === 'string') {
  const tokenSize = count_tokens(prompt);

  // Get context size from preset
  const presetMaxContext = presetData.max_context || presetData.openai_max_context;

  if (presetMaxContext && presetMaxContext > 0) {
    // Calculate available context for prompt
    const availableContextForPrompt = presetMaxContext - presetMaxTokens;

    if (tokenSize > availableContextForPrompt) {
      throw new Error(
        `Prompt ${tokenSize} tokens exceeds available context ${availableContextForPrompt} ` +
        `(model context: ${presetMaxContext}, reserved for response: ${presetMaxTokens})`
      );
    }

    debug(SUBSYSTEM.CORE,
      `[LLMClient] Token validation passed: ${tokenSize} <= ${availableContextForPrompt}`
    );
  } else {
    // Skip validation if no max_context configured
    debug(SUBSYSTEM.CORE,
      '[LLMClient] Skipping token validation - preset has no max_context configured'
    );
  }
}
```

**Validation calculation:**

```
Prompt tokens:           3456
Model max context:       8192
Reserved for response:    512
Available for prompt:    7680
Result:                  3456 <= 7680 ✓ PASS
```

### Phase 4: Message Construction

**llmClient.js - Lines 110-156**

```javascript
let messages;
let effectivePrefill = options.prefill || '';

if (options.includePreset) {
  // 1. LOAD PRESET PROMPTS
  const presetMessages = await loadPresetPrompts(effectivePresetName);

  // 2. LOAD PRESET PREFILL
  const presetPrefill = presetData?.assistant_prefill || '';

  // Prefill priority: explicit option > preset
  effectivePrefill = options.prefill || presetPrefill;

  // 3. BUILD MESSAGES WITH PRESET
  if (typeof prompt === 'string') {
    // Add system prompt for OpenAI if needed
    const systemPrompt = main_api === 'openai'
      ? "You are a data extraction system. Output ONLY valid JSON."
      : null;

    messages = [
      ...presetMessages,
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: prompt }
    ];
  } else {
    // Prompt is already an array - prepend preset messages
    messages = [...presetMessages, ...prompt];
  }
} else {
  // NO PRESET - SIMPLE CONSTRUCTION
  if (typeof prompt === 'string') {
    const systemPrompt = main_api === 'openai'
      ? "You are a data extraction system. Output ONLY valid JSON."
      : null;

    messages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }]
      : [{ role: 'user', content: prompt }];
  } else {
    messages = Array.isArray(prompt) ? prompt : [prompt];
  }
}

// 4. ADD PREFILL AS ASSISTANT MESSAGE
if (effectivePrefill) {
  messages.push({ role: 'assistant', content: effectivePrefill });
}
```

**Messages array after construction (example with preset prompts):**

```javascript
[
  {
    role: 'system',
    content: 'You are a helpful assistant...',  // From preset
    identifier: 'main',
    injection_order: 10
  },
  {
    role: 'system',
    content: 'Output ONLY valid JSON.'  // Added for OpenAI
  },
  {
    role: 'user',
    content: 'You are segmenting a roleplay transcript...\n\nMessages to analyze:\n...'
  },
  {
    role: 'assistant',
    content: '{"sceneBreakAt":'  // Prefill to enforce JSON
  }
]
```

### Phase 5: Metadata Injection

**llmClient.js - Lines 164-167**

```javascript
// 1. GET OPERATION SUFFIX FROM CONTEXT
const suffix = getOperationSuffix();  // e.g., "-42-67"
const fullOperation = suffix ? `${operationType}${suffix}` : operationType;

// 2. CLONE MESSAGES (don't mutate original)
const messagesWithMetadata = [...messages];

// 3. INJECT METADATA
injectMetadataIntoChatArray(messagesWithMetadata, {
  operation: fullOperation
});
```

**metadataInjector.js - Lines 171-232**

```javascript
export function injectMetadataIntoChatArray(chatArray, options = {}) {
  // 1. CHECK IF ENABLED
  if (!isMetadataInjectionEnabled()) {
    return;
  }

  // 2. CHECK FOR EXISTING METADATA
  const existingOperation = getExistingOperation(chatArray);
  if (existingOperation !== null && !options.replaceIfChat) {
    debug('[Metadata] Existing metadata found, skipping injection');
    return;
  }

  // 3. CREATE METADATA BLOCK
  const metadata = createMetadataBlock(options);
  const metadataStr = formatMetadataBlock(metadata);

  // 4. INJECT INTO FIRST SYSTEM MESSAGE
  const firstSystemMessage = chatArray.find(msg => msg.role === 'system');

  if (firstSystemMessage) {
    // Strip existing if replacing
    if (existingOperation !== null) {
      firstSystemMessage.content = firstSystemMessage.content.replace(
        /<ST_METADATA>[\s\S]*?<\/ST_METADATA>\n?\n?/,
        ''
      );
    }

    // Prepend to existing content
    firstSystemMessage.content = metadataStr + firstSystemMessage.content;
  } else {
    // No system message - insert new one at beginning
    chatArray.unshift({
      role: 'system',
      content: metadataStr
    });
  }
}
```

**Messages array after metadata injection:**

```javascript
[
  {
    role: 'system',
    content: `<ST_METADATA>
{
  "version": "1.0",
  "chat": "Character Name - 2024-01-15@12h34m56s",
  "operation": "DETECT_SCENE_BREAK-42-67"
}
</ST_METADATA>

You are a helpful assistant...`,  // Original preset content
    identifier: 'main',
    injection_order: 10
  },
  {
    role: 'system',
    content: 'Output ONLY valid JSON.'
  },
  {
    role: 'user',
    content: 'You are segmenting a roleplay transcript...\n\nMessages to analyze:\n...'
  },
  {
    role: 'assistant',
    content: '{"sceneBreakAt":'
  }
]
```

### Phase 6: ConnectionManager Call

**llmClient.js - Lines 170-184**

```javascript
const result = await ctx.ConnectionManagerRequestService.sendRequest(
  profileId,                    // "cm_profile_abc123"
  messagesWithMetadata,         // Messages array with metadata
  presetMaxTokens,              // 512
  {
    stream: options.stream ?? false,
    signal: options.signal ?? null,
    extractData: options.extractData ?? true,
    includePreset: options.includePreset ?? Boolean(options.preset),
    includeInstruct: options.includeInstruct ?? false,
    instructSettings: options.instructSettings || {}
  },
  {
    ...generationParams,        // { temperature: 0.7, top_p: 0.9 }
    ...options.overridePayload  // Any manual overrides
  }
);
```

**Request sent to ConnectionManager:**

```javascript
{
  profileId: "cm_profile_abc123",
  messages: [
    { role: 'system', content: '<ST_METADATA>...</ST_METADATA>\n\nYou are a helpful assistant...' },
    { role: 'system', content: 'Output ONLY valid JSON.' },
    { role: 'user', content: 'You are segmenting a roleplay transcript...' },
    { role: 'assistant', content: '{"sceneBreakAt":' }
  ],
  max_tokens: 512,
  options: {
    stream: false,
    signal: null,
    extractData: true,
    includePreset: false,
    includeInstruct: false
  },
  generationParams: {
    temperature: 0.7,
    top_p: 0.9
  }
}
```

### Phase 7: Response Processing

**llmClient.js - Lines 186-226**

```javascript
// 1. LOG RAW RESPONSE STRUCTURE (DEBUG)
debug(SUBSYSTEM.CORE, `[LLMClient] Raw response type: ${typeof result}`);
if (result && typeof result === 'object') {
  debug(SUBSYSTEM.CORE, `[LLMClient] Response keys: ${Object.keys(result).join(', ')}`);
  debug(SUBSYSTEM.CORE, `[LLMClient] Response.content: ${JSON.stringify(result.content)?.slice(0, 100)}`);
}

// 2. NORMALIZE RESPONSE FORMAT
// ConnectionManager with reasoning returns {content, reasoning}
let finalResult = result;
if (finalResult && typeof finalResult === 'object' && 'content' in finalResult) {
  finalResult = finalResult.content || '';
  debug(SUBSYSTEM.CORE, '[LLMClient] Extracted content from object response');
}

// 3. SENTENCE TRIMMING (if enabled)
if (options.trimSentences !== false && typeof finalResult === 'string') {
  if (ctx.powerUserSettings.trim_sentences) {
    finalResult = trimToEndSentence(finalResult);
    debug(SUBSYSTEM.CORE, '[LLMClient] Trimmed result to complete sentence');
  }
}

// 4. RETURN FINAL STRING
debug(SUBSYSTEM.CORE, `[LLMClient] Request completed successfully for operation: ${operationType}`);
return finalResult;
```

**Response transformation:**

```javascript
// Raw response from ConnectionManager
{
  content: '{"sceneBreakAt": 5, "rationale": "Message #5 indicates time skip"}',
  reasoning: null
}

// After normalization
'{"sceneBreakAt": 5, "rationale": "Message #5 indicates time skip"}'

// After sentence trimming (no change - already complete)
'{"sceneBreakAt": 5, "rationale": "Message #5 indicates time skip"}'
```

### Phase 8: Feature Processes Response

**autoSceneBreakDetection.js - Lines ~640-680**

```javascript
// 1. Parse JSON response
let responseJson;
try {
  responseJson = JSON.parse(response);
} catch (parseErr) {
  // Fallback: try to extract message number with regex
  const match = response.match(/\b(\d+)\b/);
  if (match) {
    responseJson = { sceneBreakAt: parseInt(match[1], 10), rationale: 'Extracted from text' };
  } else {
    throw new Error('Failed to parse scene break response');
  }
}

const { sceneBreakAt, rationale } = responseJson;

// 2. Validate response
const validation = validateSceneBreakResponse(
  sceneBreakAt,
  startIndex,
  endIndex,
  filteredIndices,
  minimumSceneLength
);

if (!validation.valid) {
  error(`Invalid scene break response: ${validation.reason}`);
  // Return invalid result - operation handler will retry
  return { sceneBreakAt: false, rationale: `Invalid: ${validation.reason}` };
}

// 3. Process valid scene break
if (sceneBreakAt !== false) {
  // Mark as scene break
  toggleSceneBreak(sceneBreakAt, get_message_div, getContext, set_data, get_data, saveChatDebounced);

  // Mark messages as checked
  markRangeAsChecked(chat, startIndex, sceneBreakAt);

  // Queue recursive scan for remainder
  if (sceneBreakAt < endIndex) {
    await enqueueOperation(OperationType.DETECT_SCENE_BREAK, {
      startIndex: sceneBreakAt + 1,
      endIndex: endIndex
    });
  }

  // Optionally queue scene recap generation
  if (get_settings('auto_scene_break_generate_recap')) {
    await enqueueOperation(OperationType.GENERATE_SCENE_RECAP, {
      index: sceneBreakAt
    });
  }
}

return { sceneBreakAt, rationale };
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ Feature: autoSceneBreakDetection.js                                  │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Input:                                                        │    │
│ │ • startIndex: 42                                              │    │
│ │ • endIndex: 67                                                │    │
│ │ • formattedMessages: "Message #42 [USER]: ..."               │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                             │                                         │
│                             ▼                                         │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Settings Resolution:                                          │    │
│ │ • profile: "Scene Detection Profile"                          │    │
│ │ • preset: "Scene Detection"                                   │    │
│ │ • prefill: '{"sceneBreakAt":'                                 │    │
│ └──────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ llmClient.sendLLMRequest()                                            │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Phase 1: Profile & Preset Resolution                          │    │
│ │ • Lookup profileId in ConnectionManager                       │    │
│ │ • Resolve preset name (or use active)                         │    │
│ │ • Load preset data and extract parameters                     │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                             │                                         │
│                             ▼                                         │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Phase 2: Token Validation                                     │    │
│ │ • Count tokens in prompt: 3456                                │    │
│ │ • Available context: 8192 - 512 = 7680                        │    │
│ │ • Validation: 3456 <= 7680 ✓                                  │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                             │                                         │
│                             ▼                                         │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Phase 3: Message Construction                                 │    │
│ │ • Load preset prompts (if includePreset)                      │    │
│ │ • Add system prompt (OpenAI)                                  │    │
│ │ • Add user prompt                                             │    │
│ │ • Add assistant prefill                                       │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                             │                                         │
│                             ▼                                         │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Phase 4: Metadata Injection                                   │    │
│ │ • Get operation suffix: "-42-67"                              │    │
│ │ • Create metadata block with operation type                   │    │
│ │ • Inject into first system message                            │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                             │                                         │
│                             ▼                                         │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Phase 5: ConnectionManager Call                               │    │
│ │ • Send request with profile, messages, params                 │    │
│ │ • Wait for LLM response                                       │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                             │                                         │
│                             ▼                                         │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Phase 6: Response Processing                                  │    │
│ │ • Extract content from object response                        │    │
│ │ • Trim to complete sentence (if enabled)                      │    │
│ │ • Return normalized string                                    │    │
│ └──────────────────────────────────────────────────────────────┘    │
│                             │                                         │
│                             ▼                                         │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ Output:                                                        │    │
│ │ '{"sceneBreakAt": 5, "rationale": "Time skip"}'              │    │
│ └──────────────────────────────────────────────────────────────┘    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│ Feature: Parse and Process Response                                  │
│ ┌──────────────────────────────────────────────────────────────┐    │
│ │ • Parse JSON                                                  │    │
│ │ • Validate sceneBreakAt value                                 │    │
│ │ • Mark scene break in UI                                      │    │
│ │ • Queue recursive scan for remainder                          │    │
│ └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

## Test Override Flow

When testing, the data flow is simplified:

```javascript
// Test sets override
globalThis.__TEST_RECAP_TEXT_RESPONSE = '{"sceneBreakAt": 5, "rationale": "Test"}';

// Feature calls sendLLMRequest
const response = await sendLLMRequest(profileId, prompt, operationType, options);

// Inside sendLLMRequest - IMMEDIATE RETURN
const override = globalThis.__TEST_RECAP_TEXT_RESPONSE;
if (typeof override === 'string') {
  return override;  // Skip ALL processing
}

// Feature receives mock response
// response === '{"sceneBreakAt": 5, "rationale": "Test"}'
```

**Benefits:**

- No profile resolution
- No preset loading
- No token validation
- No ConnectionManager call
- No actual LLM request
- Deterministic test results
- Fast test execution

## Error Flow Examples

### Invalid Preset Name

```
Feature calls sendLLMRequest()
  ├─> Profile resolution: ✓
  ├─> Preset resolution: "NonexistentPreset"
  ├─> Load preset data: ✗ FAIL
  └─> Throw: "FATAL: Preset 'NonexistentPreset' not found"

Feature catches error
  └─> Log error and notify user
```

### Token Overrun

```
Feature calls sendLLMRequest()
  ├─> Profile resolution: ✓
  ├─> Preset resolution: ✓
  ├─> Token validation:
  │     • Prompt tokens: 8500
  │     • Available context: 7680
  │     • Validation: 8500 > 7680 ✗ FAIL
  └─> Throw: "Prompt 8500 tokens exceeds available context 7680"

Feature catches error
  └─> Reduce prompt size and retry
```

### Invalid Response Format

```
Feature calls sendLLMRequest()
  ├─> All phases: ✓
  └─> Return: "The scene break is at message 5"  (not JSON)

Feature attempts JSON.parse()
  ├─> Parse fails
  └─> Fallback: Regex extract number
        └─> Success: { sceneBreakAt: 5 }
```

## Comparison: With vs Without Unified Client

### Without Unified Client (Legacy)

```
Feature
  └─> Build prompt manually
       └─> Call generateRaw() directly
            └─> Hope ConnectionManager handles it
                 └─> Parse whatever comes back
                      └─> Handle errors inconsistently
```

**Issues:**
- No token validation
- No metadata injection
- No preset loading
- No test override
- Inconsistent error handling
- Scattered validation logic

### With Unified Client (Current)

```
Feature
  └─> Get settings (profile, preset, prefill)
       └─> Call sendLLMRequest()
            ├─> Validate profile ✓
            ├─> Resolve and load preset ✓
            ├─> Validate tokens ✓
            ├─> Construct messages ✓
            ├─> Inject metadata ✓
            ├─> Call ConnectionManager ✓
            └─> Normalize response ✓
                 └─> Return clean string
                      └─> Feature parses and processes
```

**Benefits:**
- Centralized validation
- Consistent error messages
- Automatic metadata injection
- Test override support
- Token validation
- Response normalization

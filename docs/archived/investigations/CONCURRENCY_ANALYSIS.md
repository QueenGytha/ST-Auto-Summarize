# Concurrency Analysis: Parallel LLM Operations Safety

**Document Version:** 1.0
**Date:** 2025-11-04
**Status:** ⚠️ **UNSAFE - Critical Race Conditions Identified**

## Executive Summary

This document analyzes the safety of executing concurrent LLM operations (e.g., multiple summarizations, lorebook lookups, validations running simultaneously) across the ST-Auto-Summarize extension, SillyTavern core, and the first-hop proxy.

**Key Findings:**
- ✅ **HTTP/Proxy Layer:** Safe for concurrent requests
- ⚠️ **Extension Layer:** Multiple critical race conditions in connection settings management
- ❌ **SillyTavern Core:** Fundamental architecture assumes sequential execution with global state
- ❌ **Overall Assessment:** **NOT SAFE** for concurrent operations without significant refactoring

**Recommended Solution:** Multi-proxy path architecture (works immediately with zero code changes)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Race Condition Analysis](#race-condition-analysis)
   - [Extension-Level Race Conditions](#extension-level-race-conditions)
   - [SillyTavern Core Race Conditions](#sillytavern-core-race-conditions)
3. [HTTP Layer Safety Analysis](#http-layer-safety-analysis)
4. [Response Routing and Mixing](#response-routing-and-mixing)
5. [Solution Options](#solution-options)
6. [Implementation Guide](#implementation-guide)
7. [Testing Strategy](#testing-strategy)
8. [References](#references)

---

## Architecture Overview

### Request Flow

```
Extension Operation
    ↓
generateRaw() call (SillyTavern)
    ↓
HTTP Request → First-Hop Proxy
    ↓
Target LLM Provider (OpenAI, Claude, etc.)
    ↓
HTTP Response ← First-Hop Proxy
    ↓
generateRaw() returns
    ↓
Operation completes
```

### State Layers

1. **Proxy Layer:** Stateless per-request (Flask + threading)
2. **HTTP Layer:** Per-connection state (TCP streams, AbortControllers)
3. **SillyTavern Layer:** **Global mutable state** (settings, presets, profiles)
4. **Extension Layer:** **Global mutable state** (queue, connection settings)

---

## Race Condition Analysis

### Extension-Level Race Conditions

#### RC-EXT-1: Connection Profile Switching

**Severity:** 🔴 **CRITICAL**
**Location:** `connectionSettingsManager.js:19-158`
**Affected Operations:** All operations using `withConnectionSettings()`

**Description:**

The extension switches connection profiles and presets globally before executing operations:

```javascript
// connectionSettingsManager.js:19-29
async function getCurrentConnectionSettings() {
    const connectionProfile = await get_current_connection_profile();
    const completionPreset = get_current_preset();

    const settings = {};
    if (connectionProfile != null) (settings).connectionProfile = connectionProfile;
    if (completionPreset != null) (settings).completionPreset = completionPreset;

    return settings;
}

// connectionSettingsManager.js:41-56
async function switchConnectionSettings(profileName, presetName) {
    // Step 1: Set connection profile FIRST (this will load its default preset)
    if (profileName) {
        await set_connection_profile(profileName);  // ← GLOBAL STATE MUTATION
        debug(`Switched to connection profile: ${profileName}`);
    }

    // Step 2: THEN set completion preset (overrides the default from profile switch)
    if (presetName) {
        await set_preset(presetName);  // ← GLOBAL STATE MUTATION
        debug(`Switched to completion preset: ${presetName}`);
    }
}
```

**Race Condition Scenario:**

```
Time  | Operation A (Summary)           | Operation B (Lorebook)
------|--------------------------------|---------------------------
T0    | Save current: "Main/Default"   |
T1    | Switch to: "Summary/Fast"      |
T2    |                                | Save current: "Summary/Fast" ❌ (wrong!)
T3    |                                | Switch to: "Lorebook/JSON"
T4    | Execute generateRaw()          | ← Uses "Lorebook/JSON" ❌
T5    | generateRaw() completes        |
T6    | Restore to: "Main/Default"     | ← Clobbers B's settings!
T7    |                                | Execute generateRaw() ← Uses "Main/Default" ❌
T8    |                                | Restore to: "Summary/Fast" ❌ (wrong!)
```

**Impact:**
- Operations execute with wrong connection settings
- Final state unpredictable (depends on completion order)
- Operations may use wrong API provider entirely

**Code References:**
- `connectionSettingsManager.js:133-158` - `withConnectionSettings()` wrapper
- `operationQueue.js:832-857` - Connection switching in `executeOperation()`
- `operationQueue.js:902-938` - Restoration logic in finally block

---

#### RC-EXT-2: Operation Context Suffix

**Severity:** 🟡 **MODERATE**
**Location:** `operationContext.js:22`
**Affected Operations:** All operations using `setOperationSuffix()`

**Description:**

Global variable used for thread-local context storage:

```javascript
// operationContext.js:18-22
/**
 * Thread-local context storage
 * JavaScript is single-threaded, so this is safe for concurrent operations
 */
let _context = { suffix: null };  // ← SHARED GLOBAL STATE
```

**Comment is Incorrect:** The comment claims "JavaScript is single-threaded, so this is safe for concurrent operations" but this is **false for async operations**. While JavaScript execution is single-threaded, async operations can interleave:

```javascript
// setOperationSuffix usage example:
setOperationSuffix('-msg-42');    // Op-A sets suffix
try {
    await generateRaw(...);       // Op-A awaits
    // ← CONTEXT SWITCH: Op-B can run here!
    setOperationSuffix('-char-X'); // Op-B overwrites suffix ❌
    await generateRaw(...);        // Op-B awaits
} finally {
    clearOperationSuffix();
}
```

**Race Condition Scenario:**

```
Time  | Operation A                    | Operation B
------|--------------------------------|---------------------------
T0    | setOperationSuffix('-42-67')   |
T1    | generateRaw() starts           |
T2    |   ↓ async await...             |
T3    |                                | setOperationSuffix('-char-Anon') ❌
T4    |   ↓ interceptor reads suffix   | ← Reads '-char-Anon' (wrong!)
T5    |   ↓ ST_METADATA has wrong op   |
```

**Impact:**
- Wrong operation names in ST_METADATA for proxy logging
- Minor: Only affects log organization, not response content
- Logs may be filed under wrong operation type

**Code References:**
- `operationContext.js:29-47` - Suffix getters/setters
- `generateRawInterceptor.js:39` - Usage in interceptor
- `runningSceneSummary.js` - Example usage with scene ranges

---

#### RC-EXT-3: Interceptor Recursion Guard

**Severity:** 🟢 **LOW**
**Location:** `generateRawInterceptor.js:12`
**Affected Operations:** All LLM calls

**Description:**

Global flag for preventing infinite recursion:

```javascript
// generateRawInterceptor.js:11-12
let _originalGenerateRaw = null;
let _isInterceptorActive = false;  // ← SHARED GLOBAL STATE

// generateRawInterceptor.js:18-27
export async function wrappedGenerateRaw(options) {
    // Prevent infinite recursion
    if (_isInterceptorActive) {
        return await _importedGenerateRaw(options);
    }

    try {
        _isInterceptorActive = true;
        // ... process prompt ...
    } finally {
        _isInterceptorActive = false;
    }
}
```

**Race Condition Scenario:**

```
Time  | Operation A                    | Operation B
------|--------------------------------|---------------------------
T0    | wrappedGenerateRaw()           |
T1    | _isInterceptorActive = true    |
T2    | await eventSource.emit(...)    | ← async yields
T3    |                                | wrappedGenerateRaw()
T4    |                                | if (_isInterceptorActive) ← true!
T5    |                                | Calls original (skips metadata!) ❌
```

**Impact:**
- Low probability (requires exact timing)
- Would skip ST_METADATA injection for one request
- Minimal practical impact (logs incomplete)

**Code References:**
- `generateRawInterceptor.js:18-65` - Wrapper implementation
- `generateRawInterceptor.js:73-122` - Interceptor installation

---

### SillyTavern Core Race Conditions

#### RC-ST-1: TempResponseLength Static State

**Severity:** 🔴 **CRITICAL**
**Location:** `SillyTavern-New/public/script.js:3323-3390`
**Affected Operations:** All `generateRaw()` calls with custom response length

**Description:**

Static class members shared across all `generateRaw` invocations:

```javascript
// script.js:3323-3329
class TempResponseLength {
    static #originalResponseLength = -1;  // ← SHARED STATIC STATE
    static #lastApi = null;               // ← SHARED STATIC STATE

    static isCustomized() {
        return this.#originalResponseLength > -1;
    }
```

**Save/Restore Logic:**

```javascript
// script.js:3336-3347
static save(api, responseLength) {
    if (api === 'openai') {
        this.#originalResponseLength = oai_settings.openai_max_tokens;  // ← Save global
        oai_settings.openai_max_tokens = responseLength;  // ← Mutate global
    } else {
        this.#originalResponseLength = amount_gen;  // ← Save global
        amount_gen = responseLength;  // ← Mutate global
    }

    this.#lastApi = api;
}

// script.js:3354-3370
static restore(api) {
    if (this.#originalResponseLength === -1) {
        return;
    }
    if (!api && this.#lastApi) {
        api = this.#lastApi;
    }
    if (api === 'openai') {
        oai_settings.openai_max_tokens = this.#originalResponseLength;  // ← Restore to global
    } else {
        amount_gen = this.#originalResponseLength;  // ← Restore to global
    }

    this.#originalResponseLength = -1;
    this.#lastApi = null;
}
```

**Race Condition Scenario:**

```
Time  | Operation A (responseLength=100) | Operation B (responseLength=200)
------|----------------------------------|----------------------------------
T0    | TempResponseLength.save()        |
      |   #originalResponseLength = 80   |
      |   amount_gen = 100               |
T1    | await sendOpenAIRequest(...)     | ← async yields
T2    |                                  | TempResponseLength.save()
      |                                  |   #originalResponseLength = 100 ❌
      |                                  |   amount_gen = 200
T3    | Request completes                |
T4    | TempResponseLength.restore()     |
      |   amount_gen = 100 ❌            | ← Wrong! Should be 80
      |   #originalResponseLength = -1   |
T5    |                                  | Request completes
T6    |                                  | TempResponseLength.restore()
      |                                  |   #originalResponseLength == -1
      |                                  |   return early (no restore!) ❌
```

**Final State:** `amount_gen = 100` (should be 80)

**Impact:**
- Wrong token limits for subsequent requests
- Settings corruption persists beyond operation
- Affects unrelated chat operations

**Code References:**
- `script.js:3213-3215` - Save call in `generateRaw()`
- `script.js:3246, 3251, 3256, 3260` - Restore calls after API-specific generation
- `script.js:3316-3318` - Restore in finally block

---

#### RC-ST-2: Global Generation Settings

**Severity:** 🔴 **CRITICAL**
**Location:** `SillyTavern-New/public/script.js:563+`
**Affected Operations:** All text generation operations

**Description:**

Module-level exported globals read during request construction:

```javascript
// script.js:563
export let amount_gen = 80; //default max length of AI generated responses
```

**Mutation Sites:**

```javascript
// script.js:3342 - TempResponseLength modifies it
amount_gen = responseLength;

// script.js:3364 - TempResponseLength restores it
amount_gen = this.#originalResponseLength;

// script.js:6933 - Settings load modifies it
amount_gen = settings.amount_gen;

// script.js:7103 - Preset load modifies it
amount_gen = preset.genamt;
```

**Read Sites (during request construction):**

```javascript
// Various generation functions read amount_gen:
// - getKoboldGenerationData()
// - getNovelGenerationData()
// - getTextGenGenerationData()
```

**Race Condition Scenario:**

```
Time  | Operation A                    | Operation B
------|--------------------------------|---------------------------
T0    | amount_gen = 100 (via save)    |
T1    | Start building request data    |
T2    |   read: amount_gen (100) ✓     |
T3    |   await some async step...     | ← yields
T4    |                                | amount_gen = 200 (via save)
T5    |   continue building data       |
T6    |   read: amount_gen (200) ❌    | ← Inconsistent state!
T7    | Request has mixed values       |
```

**Impact:**
- Request data built with inconsistent settings
- Unpredictable generation behavior
- Possible API validation errors

**Code References:**
- `script.js:563` - Global declaration
- `script.js:3240-3261` - Read during `generateRaw()` request building
- All functions that call `getKoboldGenerationData()`, `getNovelGenerationData()`, etc.

---

#### RC-ST-3: Connection Profile Application

**Severity:** 🔴 **CRITICAL**
**Location:** `SillyTavern-New/public/scripts/extensions/connection-manager/index.js:387-419`
**Affected Operations:** All operations using connection profiles

**Description:**

Sequential execution of slash commands that modify global settings:

```javascript
// connection-manager/index.js:387-419
async function applyConnectionProfile(profile) {
    if (!profile) {
        return;
    }

    // Abort any ongoing profile application
    ConnectionManagerSpinner.abort();  // ← Attempts to prevent races, but insufficient

    const mode = profile.mode;
    const commands = mode === 'cc' ? CC_COMMANDS : TC_COMMANDS;
    const spinner = new ConnectionManagerSpinner();
    spinner.start();

    for (const command of commands) {
        if (spinner.isAborted()) {
            throw new Error('Profile application aborted');
        }

        const argument = profile[command];
        const allowEmpty = ALLOW_EMPTY.includes(command);
        if (!argument && !(allowEmpty && argument === '')) {
            continue;
        }
        try {
            const args = getNamedArguments(allowEmpty ? { force: 'true' } : {});
            await SlashCommandParser.commands[command].callback(args, argument);  // ← Modifies globals
        } catch (error) {
            console.error(`Failed to execute command: ${command} ${argument}`, error);
        }
    }

    spinner.stop();
}
```

**Commands Execute Sequentially:**

```javascript
// connection-manager/index.js:33-47
const CC_COMMANDS = [
    'api',        // Modifies global API setting
    'preset',     // Loads preset (modifies many globals)
    'api',        // Set again (necessary due to preset override)
    'api-url',    // Modifies URL setting
    'model',      // Modifies model setting
    'proxy',      // Modifies proxy setting
    // ... more commands
];
```

**Race Condition Scenario:**

```
Time  | Profile A Application          | Profile B Application
------|--------------------------------|---------------------------
T0    | Start: Apply "Summary" profile |
T1    | /api openai ← Sets global      |
T2    | await (yields)                 |
T3    |                                | Start: Apply "Lorebook" profile
T4    |                                | /api claude ← Overwrites global ❌
T5    | /preset fast ← Sets preset     |
T6    | await (yields)                 |
T7    |                                | /preset json ← Overwrites preset ❌
T8    | /model gpt-4 ← Sets model      | ← But API is now "claude"! ❌
T9    |                                | /model claude-3 ← Overwrites ❌
T10   | Complete with mixed state      | Complete with mixed state
```

**Final State:** Unpredictable mix of both profiles (e.g., Claude API with GPT-4 model)

**Impact:**
- Settings become corrupted mix of multiple profiles
- API requests may fail validation
- Completely unpredictable behavior

**Code References:**
- `connection-manager/index.js:387-419` - Profile application
- `connection-manager/index.js:33-65` - Command lists (CC_COMMANDS, TC_COMMANDS)
- `connection-manager/index.js:502-532` - Profile change handler

---

#### RC-ST-4: oai_settings Global Object

**Severity:** 🔴 **CRITICAL**
**Location:** `SillyTavern-New/public/scripts/openai.js:2286+`
**Affected Operations:** All OpenAI-compatible API calls

**Description:**

Extensive reads from global `oai_settings` object during request construction:

```javascript
// openai.js:2272-2347 (abbreviated)
async function sendOpenAIRequest(type, messages, signal, { jsonSchema = null } = {}) {
    // ... signal setup, message filtering ...

    // MANY reads from global oai_settings:
    const isClaude = oai_settings.chat_completion_source == chat_completion_sources.CLAUDE;
    const isOpenRouter = oai_settings.chat_completion_source == chat_completion_sources.OPENROUTER;
    // ... more source checks ...

    const stream = oai_settings.stream_openai && !isQuiet && ...;
    const useLogprobs = !!power_user.request_token_probabilities;
    const canMultiSwipe = oai_settings.n > 1 && ...;

    // Build request data from global settings:
    const generate_data = {
        'type': type,
        'messages': messages,
        'model': getChatCompletionModel(),  // ← Reads oai_settings.openai_model
        'temperature': Number(oai_settings.temp_openai),           // ← Global read
        'frequency_penalty': Number(oai_settings.freq_pen_openai), // ← Global read
        'presence_penalty': Number(oai_settings.pres_pen_openai),  // ← Global read
        'top_p': Number(oai_settings.top_p_openai),                // ← Global read
        'max_tokens': oai_settings.openai_max_tokens,              // ← Global read
        'stream': stream,
        'logit_bias': logit_bias,
        'stop': getCustomStoppingStrings(openai_max_stop_strings),
        'chat_completion_source': oai_settings.chat_completion_source,
        // ... many more fields from oai_settings ...
    };

    // More reads for provider-specific settings:
    if (isAzureOpenAI) {
        generate_data.azure_base_url = oai_settings.azure_base_url;        // ← Global read
        generate_data.azure_deployment_name = oai_settings.azure_deployment_name; // ← Global read
        generate_data.azure_api_version = oai_settings.azure_api_version;  // ← Global read
        // ...
    }

    // Reverse proxy settings:
    if (oai_settings.reverse_proxy && [...]) {
        await validateReverseProxy();
        generate_data['reverse_proxy'] = oai_settings.reverse_proxy;  // ← Global read
        generate_data['proxy_password'] = oai_settings.proxy_password; // ← Global read
    }

    // ... continues with more reads from oai_settings ...
}
```

**Global Mutation Sites:**

```javascript
// Preset loading mutates oai_settings:
// - When /preset command executes
// - When connection profile switches preset
// - When user changes settings in UI
// - Many other locations
```

**Race Condition Scenario:**

```
Time  | Operation A                      | Operation B (profile switch)
------|----------------------------------|--------------------------------
T0    | sendOpenAIRequest() starts       |
T1    | Read: oai_settings.chat_completion_source = "openai" |
T2    | Read: oai_settings.temp_openai = 0.7 |
T3    | await validateReverseProxy()     | ← async yields
T4    |                                  | /preset fast executes
      |                                  |   oai_settings.temp_openai = 1.0 ❌
      |                                  |   oai_settings.top_p_openai = 0.9 ❌
T5    | Read: oai_settings.top_p_openai = 0.9 ❌ |
T6    | Read: oai_settings.max_tokens = 200 ❌ |
T7    | Request has: temp=0.7 (old), top_p=0.9 (new) ❌ |
T8    | Send request with mixed settings |
```

**Impact:**
- Request contains mix of settings from different presets/profiles
- Generation behavior unpredictable
- May violate API constraints (e.g., incompatible model + parameters)

**Code References:**
- `openai.js:2272-2700+` - `sendOpenAIRequest()` function (reads extensively)
- All preset loading/switching code that mutates `oai_settings`
- Connection profile application that calls `/preset` command

---

## HTTP Layer Safety Analysis

### Proxy Concurrent Request Handling

**Analysis:** ✅ **SAFE**

**Evidence:**

```python
# first-hop-proxy/src/first_hop_proxy/main.py:511
app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)
#                                                                   ↑
#                                                          Threading enabled
```

**Flask Threading Behavior:**
- Each incoming request spawned in separate thread
- Request state isolated to thread-local storage
- No shared mutable state between requests

**Request Isolation:**

```python
# main.py:104-237
def forward_request(request_data, headers, request_config, ...):
    # Generate unique ID per request:
    request_id = str(uuid.uuid4())[:8]  # ← Unique per call
    start_time = time.time()            # ← Thread-local
    response_data = None                # ← Thread-local
    error = None                        # ← Thread-local

    # Each request gets own error handler instance:
    error_handler = ErrorHandler(...)   # ← New instance per request

    # Each request gets own proxy client instance:
    proxy_client = ProxyClient(...)     # ← New instance per request

    # ... execution is fully isolated ...
```

**Logging Isolation:**

```python
# request_logger.py:127-266
def log_complete_request(self, request_id, ...):
    # Each log file is unique:
    filepath = os.path.join(folder, filename)  # ← Unique per request

    # File I/O is atomic at OS level for independent files
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(log_content))
```

**Conclusion:** Proxy handles concurrent requests safely. Each request maintains isolated state throughout execution.

---

### HTTP Response Routing

**Analysis:** ✅ **SAFE - Protocol Level**

**How HTTP Ensures Correctness:**

1. **TCP Connection Isolation:**
   - Each HTTP request uses dedicated TCP connection (or HTTP/2 stream)
   - Response bound to connection by protocol design
   - OS kernel ensures packets routed to correct socket

2. **Flask Request Context:**
   ```python
   @app.route('/chat/completions', methods=['POST'])
   def chat_completions(config_path):
       # Flask binds request/response via context locals
       request_data = request.get_json()  # ← Reads from current request context
       # ...
       return jsonify(result)  # ← Returns to same connection that made request
   ```

3. **Async Request Tracking (SillyTavern):**
   ```javascript
   // script.js:3200
   const abortController = new AbortController();  // ← Unique per generateRaw() call

   // script.js:3272-3278
   const response = await fetch(generateUrl, {
       method: 'POST',
       headers: getRequestHeaders(),
       cache: 'no-cache',
       body: JSON.stringify(generateData),
       signal: abortController.signal,  // ← Binds response to this specific request
   });
   ```

**Cannot Mix Responses Because:**
- Different TCP connections (different file descriptors)
- Different HTTP request contexts in Flask
- Different JavaScript Promise objects
- Different AbortController signals

**Conclusion:** HTTP protocol guarantees responses route to correct caller. No risk of response mixing at network/HTTP layer.

---

## Response Routing and Mixing

### Will Responses Get Mixed Up?

**Short Answer:** No at HTTP layer, **Yes at application layer**.

### Detailed Analysis by Layer

#### Network/HTTP Layer: ✅ NO

Responses cannot be mixed because:

1. **TCP Guarantees:**
   - Each request uses separate TCP connection
   - OS kernel routes packets via socket file descriptor
   - Impossible for Response-A to arrive at Connection-B's socket

2. **HTTP/2 Streams:**
   - If using HTTP/2, requests multiplexed over single connection
   - Stream IDs uniquely identify request/response pairs
   - Protocol spec guarantees stream isolation

3. **Promise Binding:**
   ```javascript
   // Each generateRaw() call creates unique promise chain:
   const promiseA = fetch(url, dataA);  // Promise bound to dataA's request
   const promiseB = fetch(url, dataB);  // Promise bound to dataB's request

   await promiseA;  // Resolves with response to dataA
   await promiseB;  // Resolves with response to dataB
   ```

#### Application Layer: ❌ YES

Responses arrive at correct caller, but **content is corrupted** due to wrong settings:

**Scenario: Operation Executes with Wrong Settings**

```
Initial State: amount_gen=80, profile="Main"

Operation A (Summary):
  1. Target settings: amount_gen=100, profile="Summary"
  2. Switch to Summary profile ← Modifies globals
  3. generateRaw() called
  4. [Context switch to Operation B]

Operation B (Lorebook):
  1. Target settings: amount_gen=200, profile="Lorebook"
  2. Switch to Lorebook profile ← Overwrites globals from Op-A
  3. generateRaw() called

[Now both requests are in-flight with wrong settings]

Operation A's request:
  ✓ Response arrives at correct promise (HTTP works)
  ✗ BUT request was built with profile="Lorebook", amount_gen=200
  ✗ Response content wrong for Summary operation

Operation B's request:
  ✓ Response arrives at correct promise (HTTP works)
  ✗ BUT settings may be corrupted by Op-A's restoration
  ✗ Response content may be wrong
```

**Concrete Example:**

```javascript
// Concurrent execution:
const summaryPromise = queueOperation('summary', { messageIndex: 42 });
const lorebookPromise = queueOperation('lorebook_lookup', { entity: 'Alice' });

// Both operations interleave during profile switching:
// Summary wants: { profile: "Claude-Fast", temp: 0.3, max_tokens: 100 }
// Lorebook wants: { profile: "GPT-4-JSON", temp: 0.0, max_tokens: 500 }

// Actual execution (due to races):
// Summary request sent with: { profile: "GPT-4-JSON", temp: 0.0, max_tokens: 500 } ❌
// Lorebook request sent with: { profile: "Claude-Fast", temp: 0.3, max_tokens: 100 } ❌

// Responses:
const summaryResponse = await summaryPromise;
// ✓ Response arrives correctly (HTTP works)
// ✗ BUT content is JSON-formatted from GPT-4 (wrong format for summary!)
// ✗ AND has 500 tokens (summary only needs 100)

const lorebookResponse = await lorebookPromise;
// ✓ Response arrives correctly (HTTP works)
// ✗ BUT content is prose from Claude (wrong format for JSON lookup!)
// ✗ AND truncated to 100 tokens (lookup needs full 500)
```

**Impact:**
- Summaries formatted incorrectly (expected prose, got JSON)
- Lorebook lookups incomplete (expected JSON, got truncated prose)
- Operations may fail validation
- Downstream processing errors (e.g., JSON.parse() fails)

---

## Solution Options

### Option 1: Multi-Proxy Path Architecture (RECOMMENDED)

**Status:** ✅ **Works immediately with ZERO code changes**

**Concept:**

Use the proxy's existing path-based configuration routing to isolate operation types:

```
Extension Operation Type → Dedicated Proxy Path → Dedicated Config → Dedicated Provider
```

**Implementation:**

```
Directory Structure:
first-hop-proxy/
  ├── config.yaml                      # Default config (unused if using paths)
  ├── config-summary.yaml              # Summary operations → Claude Opus
  ├── config-lorebook.yaml             # Lorebook operations → GPT-4 Turbo
  ├── config-validation.yaml           # Validation operations → Claude Sonnet
  ├── config-scene.yaml                # Scene operations → GPT-4
  └── config-running-summary.yaml      # Running summaries → Claude Opus
```

**Config Files:**

```yaml
# config-summary.yaml
target_proxy:
  url: "https://api.anthropic.com/v1/chat/completions"

error_handling:
  max_retries: 10
  base_delay: 1.0
  max_delay: 60.0

logging:
  enabled: true
  include_request_data: true
  include_response_data: true

# Headers for this provider:
headers:
  x-api-key: "${ANTHROPIC_API_KEY}"
  anthropic-version: "2023-06-01"
```

```yaml
# config-lorebook.yaml
target_proxy:
  url: "https://api.openai.com/v1/chat/completions"

error_handling:
  max_retries: 10
  base_delay: 1.0
  max_delay: 60.0

logging:
  enabled: true
  include_request_data: true
  include_response_data: true

headers:
  Authorization: "Bearer ${OPENAI_API_KEY}"
```

**Extension Changes (Minimal):**

```javascript
// In operationHandlers.js or new file: proxyRouting.js

const OPERATION_PROXY_PATHS = {
    [OperationType.SUMMARY]: '/summary',
    [OperationType.VALIDATE_SUMMARY]: '/validation',
    [OperationType.GENERATE_SCENE_SUMMARY]: '/scene',
    [OperationType.GENERATE_RUNNING_SUMMARY]: '/running-summary',
    [OperationType.LOREBOOK_ENTRY_LOOKUP]: '/lorebook',
    [OperationType.RESOLVE_LOREBOOK_ENTRY]: '/lorebook',
    [OperationType.CREATE_LOREBOOK_ENTRY]: '/lorebook',
    [OperationType.MERGE_LOREBOOK_ENTRY]: '/lorebook',
    [OperationType.UPDATE_LOREBOOK_REGISTRY]: '/lorebook',
};

/**
 * Get proxy path suffix for operation type
 */
export function getProxyPathForOperation(operationType) {
    return OPERATION_PROXY_PATHS[operationType] || '';
}
```

**Usage in Operation Handlers:**

```javascript
// In operationHandlers.js

async function handleSummaryOperation(operation) {
    const settings = get_settings();
    const message = chat[operation.params.index];

    // Get proxy path for this operation type
    const proxyPath = getProxyPathForOperation(operation.type);

    // Build full URL with path-based config routing
    const baseUrl = settings.proxy_base_url || 'http://localhost:5000';
    const fullUrl = `${baseUrl}${proxyPath}`;

    // Override the target URL for this specific call
    // (This assumes we can override oai_settings.reverse_proxy temporarily)
    const originalProxy = oai_settings.reverse_proxy;
    try {
        oai_settings.reverse_proxy = fullUrl;

        const result = await generateRaw({
            prompt: summaryPrompt,
            responseLength: settings.max_tokens,
            // ... other options
        });

        return result;
    } finally {
        oai_settings.reverse_proxy = originalProxy;
    }
}
```

**How This Solves Race Conditions:**

```
Operation A (Summary):
  ↓ generateRaw({ proxy: "http://localhost:5000/summary" })
  ↓ Hits config-summary.yaml
  ↓ Routes to Claude Opus
  ✓ NO profile switching
  ✓ NO global state mutation
  ✓ Isolated execution

Operation B (Lorebook):
  ↓ generateRaw({ proxy: "http://localhost:5000/lorebook" })
  ↓ Hits config-lorebook.yaml
  ↓ Routes to GPT-4 Turbo
  ✓ NO profile switching
  ✓ NO global state mutation
  ✓ Isolated execution

Both operations run CONCURRENTLY with NO shared state!
```

**Benefits:**

✅ **Zero refactoring required** in extension
✅ **Zero changes to SillyTavern core**
✅ **Works with existing infrastructure**
✅ **Complete state isolation** (different configs/providers)
✅ **Natural load distribution** (different providers = no single rate limit)
✅ **Easy to test** (just create config files)
✅ **Easy to debug** (logs separated by operation type)
✅ **Scales horizontally** (can add more operation types easily)

**Drawbacks:**

⚠️ Requires proxy URL override mechanism (may need small hack)
⚠️ Lose connection profile UI benefits (settings in config files instead)
⚠️ Need to manage multiple API keys (one per config file)

**Implementation Complexity:** 🟢 **LOW** (2-3 hours)

---

### Option 2: Sequential with Smart Batching

**Status:** ⚠️ **Current Architecture - Safe but Slow**

**Concept:**

Keep sequential execution but optimize queue processing:

**Current Implementation:**

```javascript
// operationQueue.js:944-1011
function startQueueProcessor() {
    queueProcessor = (async () => {
        while (true) {
            const operation = getNextOperation();
            if (!operation) {
                setQueueChatBlocking(false);
                queueProcessor = null;
                return;
            }

            await executeOperation(operation);  // ← Sequential execution
            await new Promise(resolve => setTimeout(resolve, 5000));  // ← 5s delay
        }
    })();
}
```

**Optimizations:**

1. **Reduce Inter-Operation Delay:**
   ```javascript
   // Current: 5s between ALL operations
   // Optimized: Variable delay based on operation type

   const OPERATION_DELAYS = {
       [OperationType.SUMMARY]: 1000,              // Fast operation, short delay
       [OperationType.LOREBOOK_ENTRY_LOOKUP]: 2000, // Needs time for rate limit
       [OperationType.GENERATE_SCENE_SUMMARY]: 3000, // Longer operation
       // ...
   };

   const delay = OPERATION_DELAYS[operation.type] || 2000;
   await new Promise(resolve => setTimeout(resolve, delay));
   ```

2. **Batch Similar Operations:**
   ```javascript
   async function processBatchedOperations() {
       while (true) {
           const pendingOps = getPendingOperations();
           if (pendingOps.length === 0) break;

           // Group by type
           const batches = groupBy(pendingOps, op => op.type);

           // Process each type's batch
           for (const [type, ops] of Object.entries(batches)) {
               // Execute all ops of this type with same connection settings
               const settings = getExecutionSettings(type);
               await switchConnectionSettings(settings.profile, settings.preset);

               for (const op of ops) {
                   await executeOperationCore(op);  // No switching overhead
                   await delay(500);  // Minimal delay within batch
               }

               await delay(OPERATION_DELAYS[type]);  // Longer delay between batches
           }
       }
   }
   ```

3. **Priority-Based Scheduling:**
   ```javascript
   function getNextOperation() {
       const pending = getPendingOperations();

       // Sort by priority, then creation time
       pending.sort((a, b) => {
           if (b.priority !== a.priority) {
               return b.priority - a.priority;  // Higher priority first
           }
           return a.created_at - b.created_at;  // FIFO within priority
       });

       return pending[0];
   }
   ```

**Benefits:**

✅ **Safe** (no race conditions)
✅ **No refactoring needed**
✅ **Maintains connection profile UI**
✅ **Simple to understand and debug**

**Drawbacks:**

❌ Still fundamentally sequential (slow for many operations)
❌ Doesn't solve rate limiting (still one provider at a time)
❌ Complex batching logic may introduce bugs

**Implementation Complexity:** 🟡 **MEDIUM** (1-2 days)

---

### Option 3: Major Refactoring for True Concurrency

**Status:** 🔴 **FUTURE WORK - Requires Extensive Changes**

**Concept:**

Refactor both extension and SillyTavern core to support concurrent operations with isolated state.

**Required Changes:**

#### 3.1 Extension Refactoring

**Remove Global Connection Switching:**

```javascript
// CURRENT (uses global switching):
async function executeOperation(operation) {
    const originalSettings = await getCurrentConnectionSettings();
    await switchConnectionSettings(operation.profile, operation.preset);
    try {
        const result = await handler(operation);
        return result;
    } finally {
        await switchConnectionSettings(originalSettings.profile, originalSettings.preset);
    }
}

// REFACTORED (pass settings as parameters):
async function executeOperation(operation) {
    const settings = {
        profile: operation.executionSettings?.connectionProfile,
        preset: operation.executionSettings?.completionPreset,
    };

    const result = await handler(operation, settings);
    return result;
}
```

**Use Per-Request Settings:**

```javascript
// REFACTORED: generateRaw accepts settings parameter
async function generateRawWithSettings(options, settings) {
    // Build request with provided settings, not globals
    const requestData = {
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
        // ... all settings from parameter, not globals
    };

    return await makeRequest(requestData);
}
```

**Async-Local Storage for Context:**

```javascript
// Use Node.js AsyncLocalStorage for context
import { AsyncLocalStorage } from 'async_hooks';

const operationContext = new AsyncLocalStorage();

export async function executeWithContext(operation, handler) {
    return operationContext.run({ operationId: operation.id, suffix: operation.suffix }, async () => {
        return await handler(operation);
    });
}

export function getOperationSuffix() {
    const context = operationContext.getStore();
    return context?.suffix || null;
}
```

#### 3.2 SillyTavern Core Refactoring

**Remove TempResponseLength Static State:**

```javascript
// CURRENT (static state):
class TempResponseLength {
    static #originalResponseLength = -1;
    static save(api, responseLength) { ... }
    static restore(api) { ... }
}

// REFACTORED (instance-based):
class TempResponseLength {
    #originalResponseLength = -1;

    constructor() {
        this.#originalResponseLength = -1;
    }

    save(api, responseLength) {
        // Save to instance, not static
        this.#originalResponseLength = getCurrentLength(api);
        return this;
    }

    restore(api) {
        if (this.#originalResponseLength !== -1) {
            setLength(api, this.#originalResponseLength);
        }
    }
}

// Usage in generateRaw:
async function generateRaw({ prompt, responseLength, ... }) {
    const tempLength = new TempResponseLength();  // ← Instance per call

    try {
        if (responseLength) {
            tempLength.save(api, responseLength);
        }

        const result = await sendRequest(...);
        return result;
    } finally {
        tempLength.restore(api);
    }
}
```

**Pass Settings as Parameters:**

```javascript
// CURRENT (reads globals):
async function sendOpenAIRequest(type, messages, signal, options) {
    const generate_data = {
        'temperature': Number(oai_settings.temp_openai),  // ← Global read
        'max_tokens': oai_settings.openai_max_tokens,      // ← Global read
        // ...
    };
}

// REFACTORED (accepts settings):
async function sendOpenAIRequest(type, messages, signal, { settings = null, jsonSchema = null } = {}) {
    // Use provided settings or fall back to globals
    const effectiveSettings = settings || oai_settings;

    const generate_data = {
        'temperature': Number(effectiveSettings.temp_openai),  // ← Parameter read
        'max_tokens': effectiveSettings.openai_max_tokens,      // ← Parameter read
        // ...
    };
}
```

**Immutable Settings Snapshots:**

```javascript
// Create immutable snapshot of settings
function createSettingsSnapshot() {
    return Object.freeze({
        ...oai_settings,
        // Deep clone nested objects
        stop_sequences: [...(oai_settings.stop_sequences || [])],
        // ...
    });
}

// Use snapshot for request
async function generateRaw({ prompt, settings = null, ... }) {
    const requestSettings = settings || createSettingsSnapshot();

    // requestSettings is immutable, safe from concurrent modifications
    const result = await sendOpenAIRequest(type, messages, signal, { settings: requestSettings });
    return result;
}
```

#### 3.3 Concurrent Queue Processor

```javascript
// REFACTORED: Process multiple operations concurrently
function startQueueProcessor() {
    queueProcessor = (async () => {
        const MAX_CONCURRENT = 5;  // Configurable
        const inFlight = new Set();

        while (true) {
            const pending = getPendingOperations();

            if (pending.length === 0 && inFlight.size === 0) {
                setQueueChatBlocking(false);
                queueProcessor = null;
                return;
            }

            // Start new operations up to concurrency limit
            while (inFlight.size < MAX_CONCURRENT && pending.length > 0) {
                const operation = pending.shift();

                // Start operation (don't await immediately)
                const promise = executeOperationWithSettings(operation)
                    .then(() => {
                        inFlight.delete(promise);
                    })
                    .catch(err => {
                        console.error('Operation failed:', err);
                        inFlight.delete(promise);
                    });

                inFlight.add(promise);
            }

            // Wait for at least one to complete
            if (inFlight.size > 0) {
                await Promise.race(inFlight);
            }

            await delay(100);  // Small delay before checking queue again
        }
    })();
}

async function executeOperationWithSettings(operation) {
    // Execute with isolated settings (no global switching)
    const settings = createSettingsForOperation(operation);

    const handler = operationHandlers.get(operation.type);
    const result = await handler(operation, settings);

    await updateOperationStatus(operation.id, OperationStatus.COMPLETED);
    await removeOperation(operation.id);

    return result;
}
```

**Benefits:**

✅ **True concurrency** (5-10x faster for many operations)
✅ **No race conditions** (isolated state)
✅ **Scalable** (can increase concurrency limit)
✅ **Proper architecture** (follows async best practices)

**Drawbacks:**

❌ **Massive refactoring** (weeks of work)
❌ **Requires SillyTavern core changes** (may not be accepted)
❌ **High risk of introducing bugs**
❌ **Complex testing requirements**
❌ **Breaking changes** to extension API

**Implementation Complexity:** 🔴 **VERY HIGH** (2-4 weeks, requires core team involvement)

---

## Implementation Guide

### Option 1: Multi-Proxy Path (RECOMMENDED)

**Time Estimate:** 2-3 hours
**Risk Level:** 🟢 LOW
**Testing Required:** Minimal

#### Step 1: Create Proxy Config Files

```bash
cd first-hop-proxy/

# Copy base config as templates
cp config.yaml config-summary.yaml
cp config.yaml config-lorebook.yaml
cp config.yaml config-validation.yaml
cp config.yaml config-scene.yaml
```

#### Step 2: Configure Each Operation Type

**config-summary.yaml:**

```yaml
# Summary operations: Use Claude Opus for high-quality narrative summaries
target_proxy:
  url: "https://api.anthropic.com/v1/chat/completions"

error_handling:
  max_retries: 10
  base_delay: 1.0
  max_delay: 60.0
  retry_codes: [429, 500, 502, 503, 504]
  fail_codes: [400, 401, 403]

logging:
  enabled: true
  include_request_data: true
  include_response_data: true
  include_headers: true
  include_timing: true

# Optional: Regex replacements for summary operations
regex_replacement:
  enabled: false
  rules: []
```

**config-lorebook.yaml:**

```yaml
# Lorebook operations: Use GPT-4 for structured JSON output
target_proxy:
  url: "https://api.openai.com/v1/chat/completions"

error_handling:
  max_retries: 10
  base_delay: 1.0
  max_delay: 60.0

logging:
  enabled: true
  include_request_data: true
  include_response_data: true

# Optional: Enable JSON mode forcing
regex_replacement:
  enabled: true
  rules:
    - pattern: "^(.*)"
      replacement: "You must respond ONLY with valid JSON.\\n\\n\\1"
      description: "Force JSON output for lorebook operations"
```

**config-validation.yaml:**

```yaml
# Validation operations: Use Claude Sonnet (cheaper, still capable)
target_proxy:
  url: "https://api.anthropic.com/v1/chat/completions"

error_handling:
  max_retries: 5  # Validation is nice-to-have, don't retry as much
  base_delay: 1.0
  max_delay: 30.0
```

#### Step 3: Set API Keys

```bash
# Option A: Environment variables
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# Option B: Update config files with keys (less secure)
# Add to each config:
headers:
  Authorization: "Bearer sk-..."
```

#### Step 4: Test Proxy Paths

```bash
# Start proxy
python -m first_hop_proxy.main

# Test each endpoint (from another terminal):
curl http://localhost:5000/summary/models
curl http://localhost:5000/lorebook/models
curl http://localhost:5000/validation/models

# Should see different model lists based on provider
```

#### Step 5: Add Proxy Routing to Extension

Create new file: `proxyRouting.js`

```javascript
// @flow
// proxyRouting.js - Map operation types to proxy configuration paths

import { OperationType } from './operationQueue.js';

/**
 * Map operation types to proxy path suffixes
 * Each path corresponds to a config-{path}.yaml file in the proxy
 */
const OPERATION_PROXY_PATHS /*: {[key: string]: string} */ = {
    // Summary operations → Claude Opus
    [OperationType.SUMMARY]: '/summary',
    [OperationType.VALIDATE_SUMMARY]: '/validation',

    // Scene operations → GPT-4
    [OperationType.GENERATE_SCENE_SUMMARY]: '/scene',
    [OperationType.GENERATE_RUNNING_SUMMARY]: '/scene',
    [OperationType.DETECT_SCENE_BREAK]: '/scene',

    // Lorebook operations → GPT-4
    [OperationType.LOREBOOK_ENTRY_LOOKUP]: '/lorebook',
    [OperationType.RESOLVE_LOREBOOK_ENTRY]: '/lorebook',
    [OperationType.CREATE_LOREBOOK_ENTRY]: '/lorebook',
    [OperationType.MERGE_LOREBOOK_ENTRY]: '/lorebook',
    [OperationType.UPDATE_LOREBOOK_REGISTRY]: '/lorebook',
};

/**
 * Get proxy path suffix for operation type
 * @param {string} operationType - Operation type from OperationType enum
 * @returns {string} Path suffix (e.g., '/summary') or empty string for default
 */
export function getProxyPathForOperation(operationType /*: string */) /*: string */ {
    return OPERATION_PROXY_PATHS[operationType] || '';
}

/**
 * Build full proxy URL for operation
 * @param {string} operationType - Operation type
 * @param {string} baseUrl - Base proxy URL (e.g., 'http://localhost:5000')
 * @returns {string} Full URL with path (e.g., 'http://localhost:5000/summary/chat/completions')
 */
export function getProxyUrlForOperation(operationType /*: string */, baseUrl /*: string */) /*: string */ {
    const path = getProxyPathForOperation(operationType);
    const endpoint = '/chat/completions';

    // Remove trailing slash from baseUrl
    const cleanBase = baseUrl.replace(/\/$/, '');

    return `${cleanBase}${path}${endpoint}`;
}
```

#### Step 6: Modify Operation Handlers

**Option A: Temporary Override (Quick Hack)**

```javascript
// In operationHandlers.js (or individual handler files)
import { getProxyUrlForOperation } from './proxyRouting.js';
import { oai_settings } from './index.js';

async function handleSummaryOperation(operation) {
    const settings = get_settings();

    // Save original proxy URL
    const originalProxy = oai_settings.reverse_proxy;

    try {
        // Override proxy URL for this operation
        const proxyUrl = getProxyUrlForOperation(operation.type, 'http://localhost:5000');
        oai_settings.reverse_proxy = proxyUrl;

        // Execute operation (will use overridden proxy)
        const result = await summarize_text(
            operation.params.index,
            // ... other params
        );

        return result;
    } finally {
        // Restore original proxy URL
        oai_settings.reverse_proxy = originalProxy;
    }
}
```

**Option B: Wrapper Function (Cleaner)**

Create: `generateRawWithProxy.js`

```javascript
// @flow
// generateRawWithProxy.js - Wrapper for generateRaw with proxy URL override

import { generateRaw, oai_settings } from './index.js';
import { getProxyUrlForOperation } from './proxyRouting.js';

/**
 * Call generateRaw with specific proxy URL for operation type
 * @param {string} operationType - Operation type from OperationType enum
 * @param {Object} options - Options to pass to generateRaw
 * @returns {Promise<string>} Generated text
 */
export async function generateRawWithProxy(
    operationType /*: string */,
    options /*: Object */
) /*: Promise<string> */ {
    const originalProxy = oai_settings.reverse_proxy;

    try {
        // Override proxy URL
        const baseUrl = 'http://localhost:5000';  // TODO: Make configurable
        const proxyUrl = getProxyUrlForOperation(operationType, baseUrl);
        oai_settings.reverse_proxy = proxyUrl;

        // Call original generateRaw
        const result = await generateRaw(options);
        return result;

    } finally {
        // Always restore original proxy
        oai_settings.reverse_proxy = originalProxy;
    }
}
```

**Usage:**

```javascript
// In summarization.js:
import { generateRawWithProxy } from './generateRawWithProxy.js';

async function summarize_text(index, ...) {
    // OLD:
    // const summary = await generateRaw({ prompt: summaryPrompt });

    // NEW:
    const summary = await generateRawWithProxy(
        OperationType.SUMMARY,
        { prompt: summaryPrompt, responseLength: 150 }
    );

    return summary;
}
```

#### Step 7: Update Settings UI (Optional)

Add proxy base URL configuration:

```javascript
// In defaultSettings.js:
export const default_settings = {
    // ... existing settings ...

    proxy_base_url: 'http://localhost:5000',
    proxy_routing_enabled: true,
};
```

```html
<!-- In settings.html: -->
<div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <b>Proxy Routing</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
        <label for="auto_summarize_proxy_routing_enabled">
            <input type="checkbox" id="auto_summarize_proxy_routing_enabled" />
            <span>Enable proxy path routing</span>
        </label>
        <small>Route different operation types to different proxy configs</small>

        <label for="auto_summarize_proxy_base_url">
            <span>Proxy Base URL</span>
        </label>
        <input type="text" id="auto_summarize_proxy_base_url" class="text_pole"
               value="http://localhost:5000" />
        <small>Base URL for first-hop proxy (default: http://localhost:5000)</small>
    </div>
</div>
```

#### Step 8: Test Concurrent Operations

**Test Script:**

```javascript
// test-concurrent-operations.js
import { enqueueOperation, OperationType } from './operationQueue.js';

async function testConcurrentOps() {
    console.log('Enqueueing 10 operations of different types...');

    const operations = [
        enqueueOperation(OperationType.SUMMARY, { index: 0 }),
        enqueueOperation(OperationType.SUMMARY, { index: 1 }),
        enqueueOperation(OperationType.LOREBOOK_ENTRY_LOOKUP, { entity: 'Alice' }),
        enqueueOperation(OperationType.LOREBOOK_ENTRY_LOOKUP, { entity: 'Bob' }),
        enqueueOperation(OperationType.GENERATE_SCENE_SUMMARY, { index: 5 }),
        enqueueOperation(OperationType.VALIDATE_SUMMARY, { summary: 'Test...', type: 'regular' }),
        enqueueOperation(OperationType.SUMMARY, { index: 2 }),
        enqueueOperation(OperationType.LOREBOOK_ENTRY_LOOKUP, { entity: 'Charlie' }),
        enqueueOperation(OperationType.SUMMARY, { index: 3 }),
        enqueueOperation(OperationType.VALIDATE_SUMMARY, { summary: 'Test2...', type: 'scene' }),
    ];

    console.log(`Enqueued ${operations.length} operations`);
    console.log('Watch proxy logs to see concurrent execution with different providers!');
}

testConcurrentOps();
```

**Expected Behavior:**
- Summary operations hit Claude Opus (via /summary path)
- Lorebook operations hit GPT-4 (via /lorebook path)
- Validation operations hit Claude Sonnet (via /validation path)
- All operations execute **sequentially** (queue still processes one at a time)
- BUT each uses correct provider (no race conditions)
- Proxy logs show requests to different configs

#### Step 9: (Optional) Enable True Concurrency

**Modify Queue Processor:**

```javascript
// In operationQueue.js:

/**
 * Start concurrent queue processor
 * Processes multiple operations in parallel, up to MAX_CONCURRENT limit
 */
function startQueueProcessor() {
    if (queueProcessor) {
        debug(SUBSYSTEM.QUEUE, 'Queue processor already running');
        return;
    }

    debug(SUBSYSTEM.QUEUE, 'Starting CONCURRENT queue processor');
    setQueueChatBlocking(true);

    const MAX_CONCURRENT = 3;  // Start conservative

    queueProcessor = (async () => {
        const inFlight = new Map();  // Map<operation.id, Promise>

        while (true) {
            // Get operations that can run (no unmet dependencies)
            const readyOps = getPendingOperations().filter(op => {
                return op.dependencies.every(depId => {
                    const dep = getOperation(depId);
                    return !dep || dep.status === OperationStatus.COMPLETED;
                });
            });

            // Check if we're done
            if (readyOps.length === 0 && inFlight.size === 0) {
                debug(SUBSYSTEM.QUEUE, 'Queue empty, stopping processor');
                setQueueChatBlocking(false);
                queueProcessor = null;
                notifyUIUpdate();
                return;
            }

            // Start new operations up to concurrency limit
            while (inFlight.size < MAX_CONCURRENT && readyOps.length > 0) {
                const operation = readyOps.shift();

                debug(SUBSYSTEM.QUEUE, `Starting concurrent operation: ${operation.type} (${inFlight.size + 1}/${MAX_CONCURRENT})`);

                // Start operation without awaiting
                const promise = executeOperation(operation)
                    .then(() => {
                        debug(SUBSYSTEM.QUEUE, `Completed: ${operation.type}`);
                        inFlight.delete(operation.id);
                    })
                    .catch(err => {
                        error(SUBSYSTEM.QUEUE, `Failed: ${operation.type}`, err);
                        inFlight.delete(operation.id);
                    });

                inFlight.set(operation.id, promise);
            }

            // Wait for at least one to complete
            if (inFlight.size > 0) {
                await Promise.race(Array.from(inFlight.values()));
            }

            // Small delay before next iteration
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    })();
}
```

**Safety Note:** This concurrent processor is **SAFE** because:
- Each operation uses different proxy path (isolated configs)
- No global connection switching (proxy handles routing)
- No shared state between operations
- Dependencies still respected (operations wait for deps)

---

## Testing Strategy

### Unit Tests

**Test: Proxy Path Mapping**

```javascript
// tests/unit/proxyRouting.test.js
import { getProxyPathForOperation, getProxyUrlForOperation } from '../../proxyRouting.js';
import { OperationType } from '../../operationQueue.js';

export function test_proxyPathMapping() {
    const summaryPath = getProxyPathForOperation(OperationType.SUMMARY);
    expect(summaryPath).toBe('/summary');

    const lorebookPath = getProxyPathForOperation(OperationType.LOREBOOK_ENTRY_LOOKUP);
    expect(lorebookPath).toBe('/lorebook');

    const unknownPath = getProxyPathForOperation('unknown_type');
    expect(unknownPath).toBe('');
}

export function test_proxyUrlBuilding() {
    const url = getProxyUrlForOperation(OperationType.SUMMARY, 'http://localhost:5000');
    expect(url).toBe('http://localhost:5000/summary/chat/completions');

    // Test with trailing slash
    const url2 = getProxyUrlForOperation(OperationType.SUMMARY, 'http://localhost:5000/');
    expect(url2).toBe('http://localhost:5000/summary/chat/completions');
}
```

### Integration Tests

**Test: Concurrent Operations with Different Providers**

```javascript
// tests/integration/concurrentOperations.test.js

export async function test_concurrentOperationsUseDifferentProviders() {
    // Clear queue
    await clearAllOperations();

    // Enqueue operations of different types
    const summaryId = await enqueueOperation(OperationType.SUMMARY, { index: 0 });
    const lorebookId = await enqueueOperation(OperationType.LOREBOOK_ENTRY_LOOKUP, { entity: 'Test' });

    // Start processing
    resumeQueue();

    // Wait for completion
    await waitForOperation(summaryId, 30000);
    await waitForOperation(lorebookId, 30000);

    // Check proxy logs to verify different configs were used
    const summaryLog = findProxyLogForOperation(summaryId);
    const lorebookLog = findProxyLogForOperation(lorebookId);

    expect(summaryLog.config_path).toBe('summary');
    expect(lorebookLog.config_path).toBe('lorebook');

    // Verify no cross-contamination
    const summaryOp = getOperation(summaryId);
    const lorebookOp = getOperation(lorebookId);

    expect(summaryOp.status).toBe(OperationStatus.COMPLETED);
    expect(lorebookOp.status).toBe(OperationStatus.COMPLETED);
}
```

### Manual Testing Checklist

- [ ] Proxy starts successfully with all config files
- [ ] Each proxy path returns correct model list (`/summary/models`, `/lorebook/models`, etc.)
- [ ] Summary operations hit correct provider (check proxy logs)
- [ ] Lorebook operations hit correct provider (check proxy logs)
- [ ] Validation operations hit correct provider (check proxy logs)
- [ ] Operations complete successfully with expected results
- [ ] No race conditions (sequential execution works correctly)
- [ ] Concurrent execution works (if enabled)
- [ ] Error handling works (failed operations don't corrupt state)
- [ ] Rate limiting handled per-provider (not global)

---

## References

### Extension Code References

- **Connection Settings Management:**
  - `connectionSettingsManager.js:19-158` - Connection profile switching
  - `operationQueue.js:832-938` - Connection settings in operation execution

- **Operation Context:**
  - `operationContext.js:22-47` - Global context storage
  - `generateRawInterceptor.js:39` - Context usage in interceptor

- **Queue Processing:**
  - `operationQueue.js:944-1011` - Sequential queue processor
  - `operationQueue.js:815-938` - Operation execution logic

- **Operation Handlers:**
  - `operationHandlers.js` - Handler registration and execution
  - `summarization.js` - Summary operation handler
  - `lorebookEntryMerger.js` - Lorebook operation handlers

### SillyTavern Core References

- **generateRaw Function:**
  - `script.js:3190-3321` - Main generateRaw implementation
  - `script.js:3200` - AbortController creation (request isolation)
  - `script.js:3213-3215` - TempResponseLength save

- **TempResponseLength Class:**
  - `script.js:3323-3390` - Class definition
  - `script.js:3336-3347` - Save method (mutates globals)
  - `script.js:3354-3370` - Restore method (restores globals)

- **Global Settings:**
  - `script.js:563` - amount_gen declaration
  - `openai.js:2286-2700` - oai_settings usage in sendOpenAIRequest

- **Connection Profile System:**
  - `connection-manager/index.js:387-419` - applyConnectionProfile
  - `connection-manager/index.js:33-65` - Command lists
  - `connection-manager/index.js:502-532` - Profile change handler

### Proxy Code References

- **Threading and Concurrency:**
  - `main.py:511` - Flask threading enabled
  - `main.py:104-237` - forward_request function (request isolation)

- **Request Logging:**
  - `request_logger.py:127-266` - log_complete_request (unique files per request)
  - `request_logger.py:84-114` - Sequential filename generation

- **Configuration System:**
  - `config.py` - Config class
  - `main.py:51-101` - get_config_name_from_path (path-based routing)
  - `main.py:387-471` - chat_completions endpoint with config path parameter

### External Documentation

- **JavaScript Async/Concurrency:**
  - MDN: Event Loop - https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop
  - MDN: Promise.race - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race

- **Flask Threading:**
  - Flask Documentation: Application - https://flask.palletsprojects.com/en/2.3.x/api/#flask.Flask.run

- **HTTP/2 Multiplexing:**
  - RFC 7540 Section 5 - https://tools.ietf.org/html/rfc7540#section-5

---

## Appendix A: Race Condition Scenarios

### Scenario 1: Profile Switch During generateRaw

```
Initial State:
  - oai_settings.temp_openai = 0.7
  - oai_settings.top_p_openai = 0.9
  - oai_settings.max_tokens = 500
  - Current profile: "Main"

Timeline:
T0  | Op-A: Save settings (profile="Main")
T1  | Op-A: Switch to "Summary" profile
T2  |   - oai_settings.temp_openai = 0.3
T3  |   - oai_settings.max_tokens = 100
T4  | Op-A: generateRaw() starts
T5  | Op-A: Read temp_openai = 0.3 ✓
T6  | Op-A: await eventSource.emit(...) ← YIELDS
T7  |                                      | Op-B: Save settings (profile="Summary"!) ❌
T8  |                                      | Op-B: Switch to "Lorebook" profile
T9  |                                      |   - oai_settings.temp_openai = 0.0
T10 |                                      |   - oai_settings.max_tokens = 500
T11 |                                      | Op-B: generateRaw() starts
T12 | Op-A: Read max_tokens = 500 ❌ (should be 100!)
T13 | Op-A: Build request: { temp: 0.3, max_tokens: 500 } ← INCONSISTENT
T14 | Op-A: Send request (wrong settings)
T15 |                                      | Op-B: Read temp_openai = 0.0 ✓
T16 |                                      | Op-B: Read max_tokens = 500 ✓
T17 | Op-A: Response arrives (too long, wrong temp)
T18 | Op-A: Restore to "Summary" ❌ (clobbers B's "Lorebook")
T19 |                                      | Op-B: Response arrives
T20 |                                      | Op-B: Restore to "Summary" ❌ (wrong!)

Final State:
  - Current profile: "Summary" (should be "Main"!)
  - oai_settings in inconsistent state
```

### Scenario 2: TempResponseLength Corruption

```
Initial State:
  - amount_gen = 80

Timeline:
T0  | Op-A: TempResponseLength.save(api, 100)
T1  |   - #originalResponseLength = 80 ✓
T2  |   - amount_gen = 100
T3  | Op-A: await sendRequest(...) ← YIELDS
T4  |                                      | Op-B: TempResponseLength.save(api, 200)
T5  |                                      |   - #originalResponseLength = 100 ❌ (should be 80!)
T6  |                                      |   - amount_gen = 200
T7  |                                      | Op-B: await sendRequest(...)
T8  | Op-A: Response arrives
T9  | Op-A: TempResponseLength.restore(api)
T10 |   - amount_gen = 100 ❌ (should be 80!)
T11 |   - #originalResponseLength = -1
T12 |                                      | Op-B: Response arrives
T13 |                                      | Op-B: TempResponseLength.restore(api)
T14 |                                      |   - #originalResponseLength == -1
T15 |                                      |   - return (no restore!) ❌

Final State:
  - amount_gen = 100 (should be 80!)
  - Corrupted for all subsequent operations
```

### Scenario 3: Connection Profile Interleaving

```
Initial State:
  - Current profile: "Main"
  - API: openai, Model: gpt-3.5-turbo

Timeline:
T0  | Profile-A: Apply "Summary" (Claude)
T1  |   - /api claude ← Sets API
T2  |   - await SlashCommandParser.execute() ← YIELDS
T3  |                                          | Profile-B: Apply "Lorebook" (GPT-4)
T4  |                                          |   - /api openai ← Overwrites API ❌
T5  |                                          |   - await SlashCommandParser.execute()
T6  |   - /model claude-3-opus ← Sets model
T7  |                                          |   - /model gpt-4-turbo ← Overwrites model ❌
T8  |   - /preset narrative ← Sets preset
T9  |                                          |   - /preset json ← Overwrites preset ❌
T10 | Profile-A: Complete
T11 |                                          | Profile-B: Complete

Final State:
  - API: openai (from Profile-B)
  - Model: gpt-4-turbo (from Profile-B)
  - Preset: json (from Profile-B)
  - But intended Profile-A was last to "complete"!
  - Unpredictable which profile's settings actually stick
```

---

## Appendix B: Glossary

**Terms:**

- **Race Condition:** When multiple operations access shared mutable state concurrently, and the final state depends on unpredictable timing of execution

- **Global State:** Variables/objects accessible from anywhere in the program (module-level exports, singletons, etc.)

- **Async Interleaving:** When async functions yield control (await), allowing other async functions to execute before resuming

- **Thread-Local Storage:** Storage that is isolated per execution thread/context (JavaScript async is NOT automatically thread-local despite being single-threaded)

- **Profile:** Named collection of connection settings (API provider, model, temperature, etc.) in SillyTavern's connection-manager extension

- **Operation:** Queued unit of work in ST-Auto-Summarize (summary, lorebook lookup, validation, etc.)

- **Proxy Path Routing:** Using URL paths to select different proxy configurations (e.g., /summary vs /lorebook)

**Acronyms:**

- **ST:** SillyTavern
- **LLM:** Large Language Model
- **API:** Application Programming Interface
- **HTTP:** Hypertext Transfer Protocol
- **TCP:** Transmission Control Protocol
- **RC:** Race Condition (as in RC-EXT-1, RC-ST-2, etc.)

---

**End of Document**

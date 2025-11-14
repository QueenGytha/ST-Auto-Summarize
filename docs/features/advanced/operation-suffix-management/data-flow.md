# Operation Suffix Management - Data Flow

## Overview

This document traces how operation suffixes flow from callers through the LLM request pipeline to the final metadata injection point.

## Call Stack Flow

### Scenario 1: Scene Recap Generation

Operation: Generate recap for messages 42-67

```
sceneBreak.js: generateSceneRecap(42, 67, prompt)
  -> setOperationSuffix('-42-67')
  -> llmClient.js: sendLLMRequest(prompt, 'SCENE_RECAP')
    -> wrappedGenerateRaw(options)
      -> determineOperationType()  [returns 'generate_scene_recap']
      -> getOperationSuffix()      [returns '-42-67']
      -> operation = 'generate_scene_recap-42-67'
      -> injectMetadata(prompt, { operation: ... })
      -> API call with metadata
  -> finally: clearOperationSuffix()
```

**Suffix Lifecycle:**
- T0: setOperationSuffix('-42-67')
- T1: Async call to sendLLMRequest
- T2: Interceptor reads getOperationSuffix()
- T3: Metadata injected
- T4: API request sent
- T5: clearOperationSuffix()

### Scenario 2: Validation with Type

Operation: Validate recap using 'structure' validation

```
recapValidation.js: validateRecap(recap, 'structure', prompt)
  -> setOperationSuffix('-structure')
  -> sendLLMRequest(prompt, 'VALIDATE_RECAP')
    -> wrappedGenerateRaw(options)
      -> determineOperationType()  [returns 'validate_recap']
      -> getOperationSuffix()      [returns '-structure']
      -> operation = 'validate_recap-structure'
      -> injectMetadata(prompt, { operation: ... })
```

### Scenario 3: Lorebook Entry Merge

Operation: Merge lorebook entry for 'Twilight Sparkle'

```
lorebookEntryMerger.js: mergeLorebookEntry('Twilight Sparkle', ...)
  -> setOperationSuffix('-Twilight Sparkle')
  -> sendLLMRequest(prompt, 'MERGE_LOREBOOK_ENTRY')
    -> wrappedGenerateRaw(options)
      -> determineOperationType()  [returns 'merge_lorebook_entry']
      -> getOperationSuffix()      [returns '-Twilight Sparkle']
      -> operation = 'merge_lorebook_entry-Twilight Sparkle'
```

## Complete Request Examples

### Example 1: Scene Recap with Range

**Input Parameters:**
- startIdx: 42
- endIdx: 67
- prompt: "Generate a recap for the following messages..."

**Suffix Set:** `-42-67`

**Final Operation:** `generate_scene_recap-42-67`

**Injected Metadata:**
```json
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "generate_scene_recap-42-67"
}
```

**Proxy Interpretation:**
- Base operation: scene recap generation
- Target: messages 42 through 67

### Example 2: Validation by Type

**Input Parameters:**
- recapText: "The party arrived at the tavern..."
- validationType: "structure"

**Suffix Set:** `-structure`

**Final Operation:** `validate_recap-structure`

**Injected Metadata:**
```json
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "validate_recap-structure"
}
```

**Proxy Interpretation:**
- Base operation: recap validation
- Validation subtype: structure

### Example 3: Running Scene Recap

**Input Parameters:**
- prev_scene_idx: 100
- scene_index: 150

**Suffix Set:** `-100-150`

**Final Operation:** `combine_scene_with_running-100-150`

**Injected Metadata:**
```json
{
  "version": "1.0",
  "chat": "TestChar - 2025-11-03@16h32m59s",
  "operation": "combine_scene_with_running-100-150"
}
```

## Error Flow

### Exception During Operation

```
sceneBreak.js: generateSceneRecap(...)
  -> setOperationSuffix('-42-67')       [T0]
  -> try {
       await sendLLMRequest(...)         [T1-T2]
     } catch (err) {
       console.error('Error:', err)      [T3, suffix still set]
       throw err;
     } finally {
       clearOperationSuffix()             [T4, always executes]
     }
```

**Key Points:**
1. Suffix remains set during exception
2. Error handlers can log with suffix context
3. Finally block ALWAYS executes
4. Suffix guaranteed to clear

## Async Boundary Preservation

### How Suffix Survives Await

```javascript
setOperationSuffix('-42-67');
_context = { suffix: '-42-67' };

await sendLLMRequest(prompt);
// JavaScript event loop guarantees:
// - Only one call stack executes at a time
// - Context object reference is unchanged
// - Suffix remains '-42-67' throughout execution

clearOperationSuffix();
_context = { suffix: null };
```

## Module Interaction

```
Caller Module          operationContext.js       Interceptor
(sceneBreak.js)        (_context.suffix)         (wrappedGenerateRaw)
     |                       |                           |
     +--setOperationSuffix()--+                           |
     |                     '-42-67'                       |
     |                       |                           |
     +--sendLLMRequest()------+-----------+               |
     |                       |           |               |
     |                       |   wrappedGenerateRaw()----+
     |                       |           |               |
     |                       |  getOperationSuffix()----+
     |                       |           |           '-42-67'
     |                       |           |               |
     |                       |      injectMetadata()----+
     |                       |           |
     |                       |      API Call
     |                       |           |
     +--clearOperationSuffix()+           |
          null
```

## Proxy Processing

### Request Arrives at Proxy

```
POST /api/chat/completions

Request body with metadata:
{
  "messages": [
    {
      "role": "system",
      "content": "<ST_METADATA>\n{\"version\": \"1.0\", \"operation\": \"generate_scene_recap-42-67\"...}\n</ST_METADATA>\n\nYou are a helpful..."
    }
  ]
}
```

### Proxy Extracts Metadata

```python
import re
import json

def extract_metadata(content):
    match = re.search(r'<ST_METADATA>\s*(\{[^}]+\})\s*</ST_METADATA>', content)
    if match:
        return json.loads(match.group(1))
    return None

metadata = extract_metadata(request_content)
# Result: {
#   "version": "1.0",
#   "operation": "generate_scene_recap-42-67"
# }
```

### Proxy Logs Operation

```python
if metadata:
    operation = metadata['operation']  # "generate_scene_recap-42-67"
    
    logger.info(
        "LLM Request",
        operation=operation,
        timestamp=datetime.now()
    )
```

### Proxy Strips Metadata

```python
def strip_metadata(content):
    return re.sub(r'<ST_METADATA>[\s\S]*?</ST_METADATA>\n?\n?', '', content)

clean_prompt = strip_metadata(request_content)
# <ST_METADATA>... block removed
# Forwarded to LLM without metadata
```

## Suffix Format Patterns

### Message Range (sceneBreak.js, autoSceneBreakDetection.js)

Format: `-${startIdx}-${endIdx}`

Examples:
- `-0-50` (first 50 messages)
- `-42-67` (messages 42-67)
- `-100-150` (messages 100-150)

Purpose: Track which messages are being processed

### Validation Type (recapValidation.js)

Format: `-${validationType}`

Examples:
- `-structure` (validate structure)
- `-coherence` (validate coherence)
- `-relevance` (validate relevance)

Purpose: Identify validation subtype

### Entry Name (lorebookEntryMerger.js)

Format: `-${entryName}`

Examples:
- `-Twilight Sparkle` (character entry)
- `-Golden Oak Library` (location entry)
- `-Pinkie Sense` (lore entry)

Purpose: Identify which lorebook entry

### Scene Index (runningSceneRecap.js)

Format: `-${prevIdx}-${currentIdx}`

Examples:
- `-0-150` (full scene recap)
- `-100-150` (scene range update)

Purpose: Track scene progression

---

**Status:** Complete - All data flow scenarios documented

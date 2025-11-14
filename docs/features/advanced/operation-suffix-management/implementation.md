# Operation Suffix Management - Implementation Details

## Overview

Operation suffix management is a context propagation system that allows high-level operations to pass contextual information (message ranges, validation types, entry names) down to the generateRaw interceptor without modifying function signatures.

### Purpose

1. Context Propagation: Pass operation-specific context across async boundaries
2. Metadata Enrichment: Enable interceptor to add suffixes to operation metadata
3. Traceable Operations: Allow proxy logging to distinguish between operation variants
4. Clean API: Preserve existing function signatures

## Architecture

### Design: Thread-Local Context

The module uses a simple thread-local context pattern:

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

### Why This Design?

- Simplicity: Single global variable
- Async-Safe: Persists across await boundaries
- Cleanup-Focused: Caller responsible for cleanup via try-finally
- No Parameter Pollution: Function signatures unchanged

## Core Module

### File: operationContext.js

- **Purpose**: Simple context storage for operation suffixes
- **Size**: 30 lines
- **Dependencies**: None (zero external dependencies)

## API Reference

### setOperationSuffix(suffix)

Sets the operation suffix for the current call chain.

**Parameters:**
- suffix (string|null): Context suffix to append to operation type

**Examples:**
- `-42-67` (message range)
- `-scene_name` (operation variant)
- `-validation_type` (validation subtype)

**Behavior:**
- Replaces previous context
- Does not validate or transform suffix
- Sets immediately (synchronous)

### getOperationSuffix()

Returns the current operation suffix.

**Returns:** string|null

**Behavior:** Does not consume or clear context

### clearOperationSuffix()

Resets context to null.

**Behavior:** Idempotent, synchronous

## Usage Patterns

### Pattern 1: Simple Context Passing

Example from sceneBreak.js:

```javascript
export async function generateSceneRecap(startIdx, endIdx, prompt) {
  const { setOperationSuffix, clearOperationSuffix } = await import('./index.js');
  
  setOperationSuffix(`-${startIdx}-${endIdx}`);
  
  try {
    const response = await sendLLMRequest(prompt);
    return parseResponse(response);
  } finally {
    clearOperationSuffix();  // CRITICAL
  }
}
```

### Pattern 2: Sequential Operations

```javascript
async function processMultipleScenes() {
  const scenes = [
    { start: 0, end: 50 },
    { start: 50, end: 100 }
  ];
  
  for (const scene of scenes) {
    setOperationSuffix(`-${scene.start}-${scene.end}`);
    try {
      await generateSceneRecap(scene.start, scene.end);
    } finally {
      clearOperationSuffix();
    }
  }
}
```

### Pattern 3: Error Handling

```javascript
setOperationSuffix('-42-67');

try {
  const result = await generateRaw(prompt);
  if (!result.success) throw new Error('Failed');
  return result;
} catch (err) {
  console.error('Error:', err);
  throw err;
} finally {
  clearOperationSuffix();
}
```

## Integration Points

### 1. generateRawInterceptor.js

The interceptor READS the suffix:

```javascript
const baseOperation = determineOperationType();
const suffix = getOperationSuffix();
const operation = suffix ? `${baseOperation}${suffix}` : baseOperation;
injectMetadata(options.prompt, { operation });
```

### 2. sceneBreak.js

Sets suffix for message range:

```javascript
setOperationSuffix(`-${startIdx}-${endIdx}`);
// Metadata: "operation": "generate_scene_recap-42-67"
```

### 3. autoSceneBreakDetection.js

Sets suffix during scene detection:

```javascript
setOperationSuffix(`-${startIndex}-${currentEndIndex}`);
// Metadata: "operation": "detect_scene_break-0-50"
```

### 4. recapValidation.js

Sets suffix with validation type:

```javascript
setOperationSuffix(`-${validationType}`);
// Metadata: "operation": "validate_recap-structure"
```

### 5. runningSceneRecap.js

Sets suffix for scene index ranges:

```javascript
setOperationSuffix(`-${prev_scene_idx}-${scene_index}`);
// Metadata: "operation": "combine_scene_with_running-100-150"
```

### 6. lorebookEntryMerger.js

Sets suffix with entry name:

```javascript
setOperationSuffix(`-${entryName}`);
// Metadata: "operation": "merge_lorebook_entry-Twilight Sparkle"
```

### 7. recapToLorebookProcessor.js

Sets suffix with entry comment:

```javascript
setOperationSuffix(`-${entryComment}`);
// Metadata: "operation": "update_lorebook_registry-recaps-combined"
```

## Lifecycle Management

### Correct Pattern: Always Use Try-Finally

```javascript
setOperationSuffix('-42-67');

try {
  await someAsyncOperation();
} finally {
  clearOperationSuffix();
}
```

### Why Finally is Essential

1. Exception Safety: Executes even if exception thrown
2. Context Cleanup: Prevents suffix leaking to next operation
3. Predictability: Guarantees reset after operation

### Common Mistakes

**Mistake 1: Not Using Try-Finally**

```javascript
// WRONG
setOperationSuffix('-42-67');
const result = await generateRaw(prompt);
clearOperationSuffix();  // May not execute!
```

**Mistake 2: Setting Without Clearing**

```javascript
// WRONG
setOperationSuffix('-42-67');
await operation1();
await operation2();  // Sees '-42-67'
```

**Mistake 3: Nested Operations**

```javascript
// WRONG
setOperationSuffix('-outer');
setOperationSuffix('-inner');  // Overwrites
```

## Error Handling

### During Operation Failure

```javascript
setOperationSuffix('-42-67');

try {
  const result = await generateRaw(prompt);
  if (!result.success) throw new Error('Failed');
  return result;
} catch (err) {
  console.error('Error:', err);
  throw err;
} finally {
  clearOperationSuffix();
}
```

### With Retry Logic

```javascript
setOperationSuffix('-42-67');

try {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await generateRaw(prompt);
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }
} finally {
  clearOperationSuffix();
}
```

## Thread-Safety

### JavaScript Single-Threaded Guarantee

No race conditions because JavaScript is single-threaded.

### Async Boundary Crossing

Suffix persists across await:

```javascript
setOperationSuffix('-42-67');

try {
  await innerAsyncCall();
} finally {
  clearOperationSuffix();
}

async function innerAsyncCall() {
  const result = await generateRaw(prompt);
  // Interceptor sees getOperationSuffix() = '-42-67'
}
```

## Testing

### Unit Test

```javascript
import { 
  setOperationSuffix, 
  getOperationSuffix, 
  clearOperationSuffix 
} from './operationContext.js';

describe('Operation Context', () => {
  afterEach(() => clearOperationSuffix());

  it('should set and get suffix', () => {
    setOperationSuffix('-42-67');
    expect(getOperationSuffix()).toBe('-42-67');
  });

  it('should clear suffix', () => {
    setOperationSuffix('-42-67');
    clearOperationSuffix();
    expect(getOperationSuffix()).toBeNull();
  });

  it('should preserve suffix across async', async () => {
    setOperationSuffix('-test');
    await new Promise(r => setTimeout(r, 10));
    expect(getOperationSuffix()).toBe('-test');
  });
});
```

### Console Verification

```
[Auto-Recap:CORE] Operation type: generate_scene_recap
[Auto-Recap:CORE] Suffix: -42-67
[Auto-Recap:CORE] Final operation: generate_scene_recap-42-67
```

---

**Status:** Complete - Implementation details documented

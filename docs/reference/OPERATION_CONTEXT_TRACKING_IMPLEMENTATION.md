# Operation Context Tracking - Implementation Guide

**Purpose**: Detailed technical implementation of operation context tracking system.

**Audience**: Developers integrating new operations or modifying operation handlers.

---

## Quick Reference

**Module**: operationContext.js (30 lines)

**API**:



---

## Core Implementation

### Module Structure

The operationContext.js module maintains a thread-local context object:

**Key Design Decisions**:

1. **Single object pattern** - Easier to extend (add fields) without changing signatures
2. **Explicit null** - No implicit defaults; caller checks explicitly
3. **Immutable assignment** - Creates new object each time (prevents mutations)

### setOperationSuffix(suffix)

- Stores the suffix in module-level context
- Called at the start of an operation
- Parameter: suffix string (e.g., '-42-67' for messages 42-67)

### getOperationSuffix()

- Retrieves current suffix from context
- Returns null if no context is set
- Non-destructive read (can be called multiple times)

### clearOperationSuffix()

- Resets context to null
- Must be called in finally block to prevent leaks
- Safe to call multiple times


## Usage Patterns

### Pattern 1: Scene Break Detection

In operationHandlers.js, when detecting scene breaks for messages 42-67:

1. Extract startIndex, endIndex, offset from operation.metadata
2. Calculate actual message indices
3. setOperationSuffix('-42-67')
4. Call detectSceneBreak(chat, prompt)
5. Finally: clearOperationSuffix()

The detectSceneBreak function internally calls recap_text(), which calls generateRaw(). The generateRaw interceptor reads the suffix and combines it with the operation type to create: 'detect_scene_break-42-67'

### Pattern 2: Scene Recap Generation

In sceneBreak.js, when generating a recap for messages 20-45:

1. setOperationSuffix('-20-45')
2. Call recap_text(prompt, '', false, 'scene_recap_preset')
3. Finally: clearOperationSuffix()

No signature changes needed. The recap_text function doesn't know about the context, but the interceptor sees it.

### Pattern 3: Lorebook Entry Lookup

In recapToLorebookProcessor.js, when looking up an entity:

1. setOperationSuffix('-character-Alice')
2. Call generateRaw with lookup prompt
3. Finally: clearOperationSuffix()

Suffix encodes the entity type and name for identification in logs.

## Integration with generateRawInterceptor

The generateRawInterceptor.js calls getOperationSuffix() and combines it with the base operation type:

1. baseOperation = determineOperationType() - e.g., 'detect_scene_break'
2. suffix = getOperationSuffix() - e.g., '-42-67'
3. operation = suffix ? (baseOperation + suffix) : baseOperation
4. Result: 'detect_scene_break-42-67'
5. This is injected into metadata and visible in prompts and logs

## Error Handling: Always Cleanup

The operation context MUST be cleared, even if errors occur:

```
setOperationSuffix(suffix);
try {
  await risky_operation();
} finally {
  clearOperationSuffix();  // ALWAYS runs, even on error
}
```

If cleanup is missed, the context persists and affects subsequent operations (context leak).

## Nested Operations: Save and Restore

When one operation calls another, the context can be overwritten. Solution: save and restore.

WRONG (context overwriting):
- Outer sets suffix to '-outer'
- Calls inner()
- Inner overwrites with '-inner'
- Inner clears (sets to null)
- Back in outer: suffix is now null (should be '-outer')

CORRECT (save/restore):
- Outer saves current suffix
- Sets suffix to '-outer'
- Calls inner()
- Inner also saves, sets, and restores
- Back in outer: context is restored

Pattern:
```
const saved = getOperationSuffix();
setOperationSuffix(newSuffix);
try {
  await nestedOperation();
} finally {
  if (saved) setOperationSuffix(saved);
  else clearOperationSuffix();
}
```

## Performance

Memory: ~200 bytes per operation (negligible)
CPU: <20 microseconds per call (negligible vs 100-5000ms LLM latency)
Overall impact: Unmeasurable

## Testing

Unit tests should verify:
- setOperationSuffix stores value
- getOperationSuffix returns null when not set
- clearOperationSuffix resets context
- Cleanup happens even on error

Integration tests should verify:
- Context flows through interceptor correctly
- Metadata is properly injected into prompts
- Nested operations preserve context

## File References

Core Module:
- operationContext.js (30 lines, extension root)

Integration Points:
- operationHandlers.js: Calls setOperationSuffix()
- generateRawInterceptor.js: Calls getOperationSuffix()
- autoSceneBreakDetection.js: Scene break logic (wrapped by handler)
- sceneBreak.js: Scene recap generation (wrapped by handler)
- recapToLorebookProcessor.js: Entity lookup logic (wrapped by handler)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-15
**Status**: Complete

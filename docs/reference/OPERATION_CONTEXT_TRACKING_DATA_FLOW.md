# Operation Context Tracking - Data Flow Analysis

**Purpose**: Comprehensive documentation of how operation context flows through the system.

**Audience**: Developers debugging operations, analyzing logs, understanding architecture.

---

## High-Level Data Flow

### Complete Flow Diagram

operationHandlers.js Operation Queue Handler
       ↓
setOperationSuffix() Context: '-42-67'
       ↓
Operation Logic detectSceneBreak(...)
       ↓
recap_text(prompt, ...)
       ↓
generateRaw(options) SillyTavern function
       ↓
wrappedGenerateRaw() Our interceptor
getOperationSuffix() reads '-42-67'
       ↓
determineOperationType() Result: 'detect_scene_break'
       ↓
Combine: 'detect_scene_break' + '-42-67'
       ↓
injectMetadata() Adds ST_METADATA marker
       ↓
Annotated Prompt with operation context


---

## Detailed Example: Scene Break Detection

### Step-by-Step Execution

**Analyzing messages 42-67 for scene breaks:**

1. Operation queued: type='DETECT_SCENE_BREAK', metadata={startIndex:42, endIndex:67, offset:0}
2. Handler called: operationHandlers.handle_DETECT_SCENE_BREAK(operation)
3. Set context: setOperationSuffix('-42-67')
4. Call operation logic: detectSceneBreak(chat, prompt)
5. Interceptor intercepts generateRaw call
6. baseOperation = 'detect_scene_break'
7. suffix = getOperationSuffix() returns '-42-67'
8. operation = 'detect_scene_break-42-67'
9. Inject metadata into prompt: 'ST_METADATA: operation:detect_scene_break-42-67,timestamp:...'
10. Send to API
11. Cleanup: clearOperationSuffix()

---

## Detailed Example: Lorebook Entity Lookup

### Character "Alice" Lookup

1. Queue entity lookup: type='LOREBOOK_ENTRY_LOOKUP', metadata={entity_type:'character', entity_name:'Alice'}
2. Handler called
3. Set context: setOperationSuffix('-character-Alice')
4. Build lookup prompt: 'Find or create entry for character Alice'
5. Call generateRaw(prompt)
6. Interceptor reads context
7. baseOperation = 'lorebook_entry_lookup'
8. suffix = getOperationSuffix() returns '-character-Alice'
9. operation = 'lorebook_entry_lookup-character-Alice'
10. Metadata injected: 'ST_METADATA: operation:lorebook_entry_lookup-character-Alice,...'
11. API receives annotated prompt
12. Cleanup: clearOperationSuffix()

---

## Context State Timeline

### Sequential Operations

Time │ Operation        │ Suffix State      │ Notes
     │ Start op1        │ null -> '-0-20'   │ Set
     │ op1 generateRaw  │ '-0-20'           │ Available
     │ op1 cleanup      │ '-0-20' -> null   │ Clear
     │ Start op2        │ null -> '-21-40'  │ Set
     │ op2 generateRaw  │ '-21-40'          │ Available
     │ op2 cleanup      │ '-21-40' -> null  │ Clear

Key: Suffix always matches current operation

### Nested Operations (With Save/Restore)

Time │ Operation       │ Suffix State    │ Notes
     │ Outer starts    │ null -> '-0-50' │
     │ Save suffix     │ saved = '-0-50' │
     │ Inner starts    │ set to '-Alice' │
     │ Inner generateR │ '-Alice'        │ Correct
     │ Inner cleanup   │ clear           │
     │ Restore saved   │ null -> '-0-50' │
     │ Outer continues │ '-0-50'         │ Back to outer
     │ Outer cleanup   │ '-0-50' -> null │

---

## Metadata Trail in System

### What Goes Into the Prompt

Before:
"Analyze these messages for scene breaks"

After (with context '-42-67'):
"ST_METADATA: operation:detect_scene_break-42-67,timestamp:1699564823000

Analyze these messages for scene breaks"

### What Logs Show

[OPERATIONS] Queued operation: DETECT_SCENE_BREAK
[OPERATIONS] Setting suffix: -42-67
[CORE] [Interceptor] getOperationSuffix() -> -42-67
[CORE] [Interceptor] Combined operation: detect_scene_break-42-67
[INJECTION] Injected metadata: operation:detect_scene_break-42-67
[CORE] API call starting
[OPERATIONS] Clearing operation suffix

---

## Suffix Format Conventions

### Message Range Context

For scene break and scene recap operations:
- Format: -<start>-<end>
- Example: -42-67 for messages 42-67
- Usage: Tells system which messages were analyzed

### Entity Lookup Context

For lorebook lookups:
- Format: -<entity_type>-<entity_name>
- Example: -character-Alice
- Example: -location-Twilight Castle
- Example: -lore-Ancient Spell

### Combined Context

For operations combining multiple contexts:
- Format: -<context1>[-<context2>]*
- Example: -42-67-Alice (scene recap with entity)

---

## Operation Context vs Message Context

### Important Distinction

**Operation Context** (what we track):
- What: The operation being performed
- Stored: Module-level _context.suffix
- Lifetime: Duration of operation call
- Purpose: Annotate LLM requests with context

**Message Context** (SillyTavern native):
- What: The chat messages being analyzed
- Stored: Chat array in DOM
- Lifetime: Entire conversation
- Purpose: Content for LLM

### How They Relate

Operation Context identifies "which operation"
Message Context provides "what messages"

Combined: The LLM knows both what analysis is needed and on what data

---

## Thread Safety Analysis

### Single-Threaded Guarantee

JavaScript runs single-threaded:
- Only ONE function runs at a time
- Context is inherently safe from races
- Risk only with async interleaving

Example of async issue:
```
setOperationSuffix('-outer')
await innerOp()  // May overwrite suffix
// After: suffix might be wrong
```

Solution: Save and restore for nested calls

---

## Error Scenarios

### Scenario 1: Uncaught Error

WRONG:
setOperationSuffix(suffix)
try { await op() } catch(err) {}  // No cleanup!
// LEAK: suffix persists

CORRECT:
setOperationSuffix(suffix)
try { await op() } finally { clearOperationSuffix() }
// Always cleanup, even on error

### Scenario 2: Forgotten Cleanup

WRONG:
setOperationSuffix(suffix)
await op()
// Forgot clearOperationSuffix!
// LEAK: suffix persists to next operation

Prevention: Always use try/finally structure

---

## Performance Characteristics

### Memory Usage

- Context object: ~64 bytes
- Suffix string: 10-50 bytes
- Total per operation: <200 bytes
- System total: ~1 KB

Conclusion: Negligible

### CPU Usage

- setOperationSuffix: 1-5 microseconds
- getOperationSuffix: <1 microsecond
- clearOperationSuffix: 1-5 microseconds
- Per LLM call: <20 microseconds

Compared to LLM latency (100-5000ms): 5,000-250,000x longer

Conclusion: Unmeasurable impact

---

## Future Extensions

### 1. Context Stack

Use stack instead of single suffix:
- pushContext(suffix)
- popContext()
- Automatic save/restore

Benefit: Better handling of deep nesting

### 2. Rich Metadata Object

Instead of suffix, structured object:
- operation: string
- entityType: string
- entityName: string
- messageRange: [start, end]
- priority: number

Benefit: More data available

### 3. Context Validation

Add debugging tools:
- assertContextClean()
- getContextSummary()
- dumpContextStack()

Benefit: Catch leaks earlier

---

**Document Version**: 1.0
**Last Updated**: 2025-11-15
**Status**: Complete

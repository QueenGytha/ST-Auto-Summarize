# Entry Strategy Detection - Implementation Details

## Overview
Entry strategy detection identifies which activation strategy a lorebook entry uses.

Three strategies exist:
- Constant: Always activated
- Vectorized: Semantic vector similarity
- Normal: Keyword matching (default)

## Core Detection: getEntryStrategy()

Location: index.js:314-318

This is the single source of truth for strategy detection.

## Strategy Types

### Constant
- Detection: entry.constant === true
- Always included in prompts
- Never expires
- Tracked with Infinity counter

### Vectorized
- Detection: entry.vectorized === true
- Activated by semantic similarity
- Requires embedding support

### Normal
- Detection: both false/undefined
- Keyword-based activation (default)
- Most common strategy

## Integration Points

1. Sticky Tracking: Constant entries tracked with Infinity
2. Message Persistence: Strategy saved to message.extra.activeLorebookEntries
3. Scene Breaking: Strategy included in scene context
4. UI Display: Emoji indicators
5. Entry Filtering: Determines which entries remain active

## Entity Type Flags

Entity types can specify (entry:constant) flag to create constant entries.

## Testing

Test cases:
- Constant entry: constant=true, vectorized=false -> 'constant'
- Vectorized entry: constant=false, vectorized=true -> 'vectorized'
- Normal entry: constant=false, vectorized=false -> 'normal'
- Missing fields: {} -> 'normal'
- Both true: constant=true, vectorized=true -> 'constant'

## Strategy Type Definitions

### Constant Strategy Details

A constant strategy entry has `entry.constant === true`. This means:
- The entry ALWAYS appears in LLM prompts
- No keyword matching needed
- No depth/position filtering applied
- Cannot be manually disabled via keywords
- Persists across multiple generations

Used for:
- World-level rules that apply everywhere
- Critical lore facts
- System information
- Game mechanics rules

### Vectorized Strategy Details

A vectorized strategy entry has `entry.vectorized === true`. This means:
- Entry activates based on semantic similarity
- Uses embedding vectors for comparison
- More flexible than keyword matching
- Adapts to context and meaning
- Requires embedding model support

Used for:
- Contextual character details
- Thematic background
- Related but not keyword-exact content
- Sophisticated world building

### Normal Strategy Details

Both flags false or undefined means normal strategy:
- Entry activates on keyword match
- Keyword matching against recent messages
- Respects depth and position settings
- Most common and efficient
- Default for most entries

---

## Core Function Specification

### getEntryStrategy()

File: `index.js`
Lines: 314-318

```
PURPOSE:
  Single source of truth for entry strategy detection

INPUT:
  entry (Object) - Lorebook entry from SillyTavern

OUTPUT:
  string - 'constant', 'vectorized', or 'normal'

LOGIC:
  1. If entry.constant is strictly true -> return 'constant'
  2. Else if entry.vectorized is strictly true -> return 'vectorized'
  3. Else -> return 'normal'

USED BY:
  - Entry tracking operations
  - Scene break processing
  - Message persistence
  - UI display logic
  - Entry filtering
```

### Calling Patterns

Pattern 1 - Direct Call:
```javascript
const strategy = getEntryStrategy(entry);
```

Pattern 2 - In Ternary:
```javascript
const strategy = entry.constant 
  ? 'constant' 
  : (entry.vectorized ? 'vectorized' : 'normal');
```

Pattern 3 - In Filter:
```javascript
entries.filter(e => getEntryStrategy(e) === 'constant')
```

---

## Field Requirements

### Strict Equality

Detection uses `=== true`, NOT truthy checks. This means:
- 1 (number) is NOT detected as constant
- "true" (string) is NOT detected as constant  
- true (boolean) IS detected as constant

### Field Defaults

If field missing/undefined:
- Treated as false
- Entry continues to next check
- Result is normal (safe fallback)

---

## Integration Summary

### 5 Key Integration Points

1. **Sticky Tracking** (index.js:366-390)
   - Constant entries tracked with Infinity counter
   - Never expire or get removed
   - Always included in active entries

2. **Message Persistence** (index.js:419-432)
   - Strategy stored in message.extra.activeLorebookEntries
   - Survives chat reload
   - Reconstructs entry state across sessions

3. **Scene Breaking** (sceneBreak.js:830-844)
   - Strategy included in scene context
   - Scene recap knows which strategies active
   - Enables informed scene processing

4. **UI Display** (lorebookViewer.js:44-56)
   - Emoji indicators for each strategy
   - Counts displayed in modal
   - Visual feedback for users

5. **Entry Filtering** (index.js:350-361)
   - Determines active entries for generation
   - Constant entries always included
   - Sticky entries included while active

APPCONTEN T

## Strategy Specifications

### Constant Strategy

Detection: entry.constant === true

Behavior:
- Always included in LLM prompts
- No keyword matching needed
- Persists indefinitely
- Cannot be filtered out
- Tracked with Infinity counter

Implementation Details:
- Field must be explicitly true
- Type must be boolean
- Tracked in activeStickyEntries
- No sticky counter decrement
- Always returned by getStillActiveEntries

### Vectorized Strategy

Detection: entry.vectorized === true

Behavior:
- Activated by semantic similarity
- Uses embedding vectors
- More context-aware than keywords
- Requires embedding model
- Dynamically filtered

Implementation Details:
- Field must be explicitly true
- Type must be boolean
- Not tracked with sticky counter
- Filtered by similarity threshold
- Real-time computation

### Normal Strategy

Detection: both false or undefined

Behavior:
- Keyword-based activation
- Respects depth/position
- Standard lorebook behavior
- Most entries use this
- Default fallback

Implementation Details:
- Default when neither constant nor vectorized
- Safe fallback for missing fields
- Filtered by keyword match
- Position and depth matter
- Most common strategy

---

## Function Signature

Location: index.js:314-318

```javascript
function getEntryStrategy(entry) {
  if (entry.constant === true) {return 'constant';}
  if (entry.vectorized === true) {return 'vectorized';}
  return 'normal';
}
```

Key Points:
- Returns immediately (O(1) operation)
- No async operations
- No side effects
- Deterministic
- Pure function

---

## Integration Points

### 1. Sticky Entry Tracking
Location: index.js:366-390
Purpose: Track entries persisting across generations
Behavior: Constant entries never expire

### 2. Message Persistence
Location: index.js:419-432
Purpose: Durable storage of entry strategy
Behavior: Saves to message.extra metadata

### 3. Scene Enhancement
Location: sceneBreak.js:830-844
Purpose: Include strategy in scene context
Behavior: Scene recap knows active strategies

### 4. UI Display
Location: lorebookViewer.js:44-56
Purpose: Show strategy breakdown
Behavior: Emoji indicators and counts

### 5. Entry Filtering
Location: index.js:350-361
Purpose: Determine active entries
Behavior: Constant always included

---

## Testing Checklist

Test Categories:
- Constant detection (true/false)
- Vectorized detection (true/false)
- Normal detection (both false)
- Missing fields (undefined)
- Type coercion (string vs boolean)
- Null/NaN values
- Edge cases

Test Entry:
- uid number
- constant boolean
- vectorized boolean
- Other fields (should not affect)

Expected Results:
- Correct strategy string returned
- No exceptions thrown
- Deterministic output
- Type safety maintained


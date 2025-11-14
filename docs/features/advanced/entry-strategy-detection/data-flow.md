# Entry Strategy Detection - Data Flow

## Overview

Traces how entry strategy detection flows through the extension from loading through usage.

## Detection Flow

SillyTavern Entry -> Extract fields -> Detect strategy -> Enhance entry -> Use in operations

## Complete Examples

### Example 1: Constant Entry
Input: uid=42, constant=true, vectorized=false
Detection: Check constant===true -> YES -> return 'constant'
Result: strategy='constant', tracked with Infinity

### Example 2: Vectorized Entry
Input: uid=89, constant=false, vectorized=true
Detection: Check constant===true -> NO, check vectorized===true -> YES -> return 'vectorized'
Result: strategy='vectorized', activated by similarity

### Example 3: Normal Entry
Input: uid=156, constant=false, vectorized=false
Detection: Check constant -> NO, check vectorized -> NO -> return 'normal'
Result: strategy='normal', keyword-based

### Example 4: Mixed Lorebook
5 entries total:
- 1 constant
- 1 vectorized
- 3 normal

## Integration Flows

### Flow 1: Loading to Persistence
Load -> Extract fields -> Detect -> Create enhanced entry -> Persist to message

### Flow 2: Sticky Tracking
Generation 1: Track entries, constant gets Infinity
Generation 2: Retrieve still-active, constant persists
Generation N: Constant always there, sticky decrements

### Flow 3: Scene Break Enhancement
Get scene entries -> Map to enhanced -> Include strategy -> Scene recap aware

### Flow 4: UI Update
Open lorebook -> Count by strategy -> Build breakdown -> Display modal

## Detection Algorithm Flow

Step 1: getEntryStrategy(entry) called
Step 2: Check entry.constant === true
        - If YES: return 'constant' immediately
        - If NO: continue to step 3

Step 3: Check entry.vectorized === true
        - If YES: return 'vectorized' immediately
        - If NO: continue to step 4

Step 4: Return 'normal' as fallback

---

## Field Extraction Process

Raw Entry -> Extract constant -> Extract vectorized -> Normalize undefined -> Detect strategy

Normalization Process:
- constant = entry.constant || false
- vectorized = entry.vectorized || false

Result: Two normalized booleans ready for detection

---

## Strategy Assignment Flow

For each entry in collection:
1. Extract strategy fields
2. Call getEntryStrategy(entry)
3. Attach strategy to enhanced entry
4. Add to results array
5. Use in downstream operations

---

## Persistence Flow

Entry detected -> Enhanced entry created -> Persisted to message.extra.activeLorebookEntries

Survival: Persisted entries survive chat reload/close/reopen

---

## Sticky Tracking Flow

Generation N:
1. Get active entries
2. For each constant entry:
   - Add to activeStickyEntries with stickyCount=Infinity
3. For each sticky entry:
   - Add to activeStickyEntries with stickyCount=entry.sticky

Generation N+1:
1. Call getStillActiveEntries()
2. For each entry in activeStickyEntries:
   - If constant: include (Infinity never decrements)
   - If stickyCount > 0: include and decrement
   - If stickyCount == 0: remove from map
3. Merge with new generation entries

Result: Constant entries persist indefinitely

---

## Scene Context Flow

Scene processing:
1. Get entries active during scene
2. For each entry:
   - Detect strategy
   - Create enhanced entry with strategy field
3. Include enhanced entries in scene metadata
4. Scene recap generation uses strategy info
5. Scene awareness of strategy mix

---

## UI Display Flow

User action: Open lorebook viewer
1. Get entries for current message
2. Count by strategy:
   - constant_count = filter(e => e.strategy === 'constant').length
   - vectorized_count = filter(e => e.strategy === 'vectorized').length
   - normal_count = filter(e => e.strategy === 'normal').length
3. Build display string:
   - If constant_count > 0: add "🔵 X constant"
   - If vectorized_count > 0: add "🔗 Y vectorized"
   - If normal_count > 0: add "🟢 Z normal"
4. Display modal with breakdown
5. User sees strategy distribution

---

## Entity Type Flag Flow

Entity Type Definition:
```
DEFAULT_ENTITY_TYPES = ['quest(entry:constant)', ...]
```

Flag Parsing:
1. parseEntityTypeDefinition("quest(entry:constant)")
2. Extract name: "quest"
3. Extract flags: "entry:constant"
4. Parse flags: ["constant"]
5. Return definition with entryFlags

Flag Application:
When creating entry:
1. Check if definition has entryFlags
2. If includes 'constant':
   - Set entry.constant = true
   - Set entry.disable = false
   - Set entry.probability = 100
   - Set entry.useProbability = false

Result: New entries automatically marked constant

---

## Error Handling Flow

Missing constant field:
- entry.constant is undefined
- undefined === true returns false
- Continue to vectorized check
- If also undefined: return 'normal'

Type mismatch:
- entry.constant = "yes" (string)
- "yes" === true returns false
- Continue to vectorized check
- Result: normal (safe fallback)

Null value:
- entry.constant = null
- null === true returns false
- Result: normal (safe)

---

## Cross-Integration Flow

Message generation:
1. Load entries
2. Detect strategies
3. Apply sticky tracking
4. Create enhanced entries
5. Persist to message
6. Inject into scene context
7. Display in UI

All using single getEntryStrategy() function.


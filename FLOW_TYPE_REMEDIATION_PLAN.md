# Flow Type Remediation Plan

## Current State Assessment

### Summary
- **Total files**: 44 JavaScript files
- **Files with `/*: any */` annotations**: 21 files
- **Total `/*: any */` occurrences**: 181
- **Files using `$FlowFixMe` suppressions**: Multiple (needs audit)

### Files by `any` Type Count (Descending)
1. memoryEditInterface.js: 16 occurrences
2. utils.js: 11 occurrences
3. profileManager.js: 10 occurrences
4. messageData.js: 10 occurrences (PARTIALLY FIXED)
5. sceneBreak.js: 9 occurrences (PARTIALLY FIXED)
6. runningSceneSummary.js: 7 occurrences
7. operationQueue.js: 7 occurrences (PARTIALLY FIXED)
8. summarization.js: 6 occurrences
9. settingsManager.js: 6 occurrences
10. autoSceneBreakDetection.js: 5 occurrences
11. messageVisuals.js: 4 occurrences
12. memoryCore.js: 4 occurrences
13. uiBindings.js: 3 occurrences
14. promptUtils.js: 3 occurrences
15. connectionProfiles.js: 3 occurrences
16. progressBar.js: 2 occurrences
17. presetManager.js: 2 occurrences
18. summaryValidation.js: 1 occurrence
19. eventHandlers.js: 1 occurrence
20. characterSelect.js: 1 occurrence
21. buttonBindings.js: 1 occurrence

## Type Definitions Already Created

### In `flow-typed/globals.js.flow`
- `STMessage` - SillyTavern message type with proper structure
- `GetData` - Function type for getting data from messages
- `SetData` - Function type for setting data on messages
- `GetMessageDiv` - Function type for getting message div elements
- `SaveChatDebounced` - Debounced save function type

### In `flow-typed/sillytavern.js.flow`
- `STContext` - Full SillyTavern context object (925 lines, comprehensive)
- All exports from `script.js` and `st-context.js`
- Event types
- Regex utilities

### In `operationQueue.js`
- `OperationStatusType` - Union type for operation statuses
- `OperationTypeType` - Union type for operation types
- `Operation` - Operation object structure
- `QueueStructure` - Queue state structure

## Critical Issues

### Problem 1: Blind Type Replacement
**What NOT to do**: Replace all `message /*: any */` with `message /*: STMessage */` without verification
**Why**: Not every parameter named "message" is a SillyTavern message object. Could be:
- A string message
- An error message
- A different message structure
- A message ID

**Example of dangerous assumption**:
```javascript
function showMessage(message /*: any */) {
    // Is this a string? STMessage? Something else?
    // MUST READ THE CODE to determine
}
```

### Problem 2: Parameter Name != Type
**What NOT to do**: Assume type from parameter name
**Why**: Variable names are just conventions, not contracts

**Examples**:
- `index` - Could be message index (number), array index (number), scene index (number), OR an index object/map
- `value` - Could be boolean, string, number, object, null
- `data` - Could be literally anything
- `options` - Could be any options object structure

### Problem 3: Context-Dependent Types
**What NOT to do**: Apply same type to same parameter name across different files
**Why**: Different contexts use parameters differently

**Example**:
```javascript
// File A
function processMessage(message /*: STMessage */) {
    // Uses message.mes, message.name - definitely STMessage
}

// File B
function logMessage(message /*: string */) {
    // Just logs a text message - definitely string
}
```

## Proper Remediation Process

### Step 1: Read and Understand Each Function
For each function with `/*: any */`:
1. Read the entire function body
2. Note what properties/methods are accessed on each parameter
3. Note what the parameter is compared to
4. Note what it's passed to
5. Trace through the code to understand actual usage

### Step 2: Determine Actual Type
Based on usage, determine the REAL type:
- If accessing `.mes`, `.name`, `.is_user` → likely `STMessage`
- If used with `parseInt()`, `+`, `-` → likely `number`
- If used with `.length`, `.map()`, `.filter()` → likely `Array<T>` (determine T)
- If used with `.toString()`, `.trim()`, `.replace()` → likely `string`
- If used with `if (x)` only → could be `boolean`
- If passed to jQuery `$()` → likely jQuery object or selector
- If accessing DOM properties → likely DOM element
- If function type → determine signature from how it's called

### Step 3: Check for Nullable Types
Determine if parameter can be null/undefined:
- Default value of `null`? → Use `?Type`
- Checked with `if (x)` before use? → Use `?Type`
- Optional parameter? → Use `?Type`
- Required parameter always passed? → Use `Type`

### Step 4: Apply Type Annotations
Apply the determined type using comment syntax:
```javascript
// Correct
function process(message /*: STMessage */, index /*: number */, options /*: ?Object */) {
    // ...
}
```

### Step 5: Verify with Flow
Run Flow check after each file:
```bash
npx flow check --flowconfig-name .flowconfig
```

### Step 6: Fix Flow Errors
If Flow reports errors:
1. Read the error message carefully
2. Understand what Flow is telling you
3. Either fix the type annotation OR fix the code
4. Never suppress with `$FlowFixMe` unless absolutely necessary

## File-by-File Remediation Plan

### Priority 1: Core Data Types (Already Have Global Types)

#### messageData.js - PARTIALLY COMPLETE
**Status**: Most types fixed, needs verification
**What was done**: Replaced message parameters with STMessage
**What needs verification**:
- Are all `message` parameters actually STMessage objects?
- Are get_data/set_data return types correct?
- Is toggle_memory_value function signature correct?

#### messageVisuals.js - 4 occurrences
**Parameters to analyze**:
- `get_message_div(index /*: any */)` - What is index? Likely number
- `get_summary_style_class(message /*: any */)` - What is message? Check usage
- `update_message_visuals(i /*: any */, style /*: any */, text /*: any */)` - Check each
- `open_edit_memory_input(index /*: any */)` - What is index?

**Approach**: Read each function, see what properties are accessed

### Priority 2: Scene/Summary Related

#### sceneBreak.js - PARTIALLY COMPLETE
**Status**: STContext imported, some types fixed
**Remaining work**:
- `chat /*: Array<any> */` - Should this be `Array<STMessage>`?
- `$sceneBreak /*: any */` - What is this? jQuery object?
- `get_data /*: (message: any, key: string) => any */` - Should message be STMessage?
- `set_data /*: (message: any, key: string, value: any) => void */` - Should message be STMessage?
- `savedProfiles /*: any */` - What structure is this?

**Approach**: Examine each usage carefully

#### runningSceneSummary.js - 7 occurrences
**Parameters to analyze**:
- `version /*: any */` - What is version? String? Number? Object?
- `content /*: any */` - String?
- `scene_count /*: any */` - Number?
- `excluded_count /*: any */` - Number?
- `prev_scene_index /*: any */` - Number?
- `new_scene_index /*: any */` - Number?
- `scene_index /*: any */` - Number?
- `skipQueue /*: any */` - Boolean?

**Approach**: These look straightforward but MUST verify by reading code

#### summarization.js - 6 occurrences
**Parameters to analyze**:
- `val /*: any */` - setStopSummarization - Boolean?
- `indexes /*: any */` - Array<number>?
- `show_progress /*: any */` - Boolean?
- `index /*: any */` - Number?
- `prompt /*: any */` - String?
- `type /*: any */` - String?

**Approach**: Read function bodies to confirm

### Priority 3: Settings/Configuration

#### settingsManager.js - 6 occurrences
**Parameters to analyze**:
- `set_settings(key /*: any */, value /*: any */)` - key is string, value is any
- `get_settings(key /*: any */)` - key is string, returns any
- `get_settings_element(key /*: any */)` - key is string
- `toggle_chat_enabled(value /*: any */)` - Boolean?
- `character_enabled(character_key /*: any */)` - String?
- `toggle_character_enabled(character_key /*: any */)` - String?

**Approach**: Check actual usage

#### profileManager.js - 10 occurrences
**Parameters to analyze**:
- `copy_settings(profile /*: any */)` - What is profile structure?
- `detect_settings_difference(profile /*: any */)` - Same
- `save_profile(profile /*: any */)` - Same
- `load_profile(profile /*: any */)` - Same
- `export_profile(profile /*: any */)` - Same
- `import_profile(e /*: any */)` - Event object?
- `get_character_profile(key /*: any */)` - String?
- `set_character_profile(key /*: any */, profile /*: any */)` - String + profile
- `get_chat_profile(id /*: any */)` - String/Number?
- `set_chat_profile(id /*: any */, profile /*: any */)` - String/Number + profile

**Approach**: Understand profile structure first, then type it

### Priority 4: UI/DOM Related

#### memoryEditInterface.js - 16 occurrences (HIGHEST COUNT)
**Parameters to analyze**:
- Class properties: `$content`, `popup`, `ctx`, `settings`
- Multiple filter functions with `(msg /*: any */)` - These are likely STMessage
- Multiple methods with mixed parameter types

**Approach**: This is complex, needs careful analysis of the entire class

#### uiBindings.js - 3 occurrences
**Parameters to analyze**:
- `bind_setting(selector /*: any */, key /*: any */, type /*: any */, callback /*: any */, disable /*: any */)`
- `bind_function(selector /*: any */, func /*: any */, disable /*: any */)`

**Approach**: Check what jQuery selectors are, what callbacks are

### Priority 5: Utilities

#### utils.js - 11 occurrences
**Need to examine**: What utility functions have any types?

#### memoryCore.js - 4 occurrences
**Parameters to analyze**:
- `check_message_exclusion(message /*: any */)` - STMessage?
- `concatenate_summary(existing_text /*: any */, message /*: any */)` - String, STMessage?
- `concatenate_summaries(indexes /*: any */)` - Array<number>?
- `collect_chat_messages(include /*: any */)` - What is include?

#### autoSceneBreakDetection.js - 5 occurrences
**Parameters to analyze**:
- Multiple functions with message, messageIndex, latestIndex, offset parameters
- Need to understand the detection algorithm

### Priority 6: Smaller Files

#### connectionProfiles.js - 3 occurrences
#### promptUtils.js - 3 occurrences
#### progressBar.js - 2 occurrences
#### presetManager.js - 2 occurrences
#### summaryValidation.js - 1 occurrence
#### eventHandlers.js - 1 occurrence
#### characterSelect.js - 1 occurrence
#### buttonBindings.js - 1 occurrence

**Approach**: These are smaller, can be done file-by-file after understanding patterns

## Rules for Remediation

### DO:
1. ✅ Read the entire function before typing anything
2. ✅ Trace parameter usage through the code
3. ✅ Check what properties/methods are accessed
4. ✅ Look at what the parameter is passed to
5. ✅ Verify the type makes sense in context
6. ✅ Run Flow check after each file
7. ✅ Fix Flow errors properly
8. ✅ Use existing type definitions from globals.js.flow
9. ✅ Create new type definitions when needed for complex structures
10. ✅ Use nullable types (`?Type`) when appropriate

### DON'T:
1. ❌ Use find/replace across multiple files
2. ❌ Assume type from parameter name
3. ❌ Apply same type to same-named parameters without verification
4. ❌ Suppress Flow errors with $FlowFixMe without investigation
5. ❌ Use `any` as the "easy way out"
6. ❌ Copy types from similar-looking functions without reading code
7. ❌ Make assumptions - VERIFY EVERYTHING
8. ❌ Work on multiple files at once
9. ❌ Skip Flow validation
10. ❌ Leave broken code

## Type Patterns to Watch For

### Pattern 1: Message Object
```javascript
// If you see:
message.mes
message.name
message.is_user
message.swipe_id

// Then it's: STMessage
```

### Pattern 2: Message Index
```javascript
// If you see:
chat[index]
get_message_div(index)
for (let i = 0; i < chat.length; i++)

// Then it's: number
```

### Pattern 3: Boolean Toggle
```javascript
// If you see:
if (value === null) { toggle }
value ? enable() : disable()
!!value

// Then it's: ?boolean (nullable boolean)
```

### Pattern 4: Settings Key
```javascript
// If you see:
extension_settings[key]
get_settings(key)
set_settings(key, value)

// Then key is: string
// And value is: any (legitimately, settings can be any type)
```

### Pattern 5: jQuery Objects
```javascript
// If you see:
$(selector)
$element.find()
$element.on()

// Then it's: any (jQuery types are complex, using any is acceptable here)
```

### Pattern 6: Event Objects
```javascript
// If you see:
e.preventDefault()
e.target
e.currentTarget

// Then it's: any (DOM event types are complex, using any is acceptable)
```

## Success Criteria

1. All `/*: any */` annotations reviewed and either:
   - Replaced with proper type, OR
   - Documented why `any` is the correct type (e.g., settings values, jQuery, events)

2. Flow check passes with zero errors in extension code (React.js error is external)

3. All browser syntax checks pass (`node --check` on all files)

4. Types are based on ACTUAL CODE BEHAVIOR, not assumptions

5. Type definitions are properly documented

## Next Steps (DO NOT EXECUTE - PLAN ONLY)

1. Pick one file from Priority 1
2. Read through entire file
3. Document each `any` parameter and its actual type
4. Apply types one function at a time
5. Run Flow check
6. Fix any errors
7. Move to next function
8. Complete entire file
9. Move to next file

## Notes

- Some uses of `any` are LEGITIMATE (settings values, jQuery, complex DOM types)
- The goal is not zero `any` - it's CORRECT types
- Quality over speed
- One file at a time
- Verify, verify, verify

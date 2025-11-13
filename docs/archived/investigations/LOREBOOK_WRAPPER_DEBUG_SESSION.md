# Lorebook Wrapper Debug Session - 2025-11-04

## Problem Statement

The lorebook entry wrapping feature was implemented but **IS NOT WORKING**. Lorebook entries are being concatenated without individual XML wrapping in the proxy logs.

### Expected Behavior
Each lorebook entry should be wrapped individually:
```xml
<lorebook name="Entry1" uid="123">
Entry 1 content
</lorebook>
<lorebook name="Entry2" uid="456">
Entry 2 content
</lorebook>
```

### Actual Behavior
Entries are concatenated without wrapping:
```
Entry 1 content
Entry 2 content
```

## Implementation Approach (FAILED)

### Files Modified

1. **lorebookWrapper.js** (NEW FILE - 420 lines)
   - Line 4: Module load log added
   - Line 379-407: `installLorebookWrapper()` function (EXPORTED)
   - Line 37-75: `checkWorldInfo_wrapped()` with extensive logging
   - Line 83-130: `reconstructWithWrapping()` with logging
   - Approach: Monkey-patch `window.checkWorldInfo` to intercept and wrap entries

2. **eventHandlers.js** (MODIFIED)
   - Line 45: Import `installLorebookWrapper` from index.js
   - Line 253-255: Call `installLorebookWrapper()` with logging before/after
   - Location: In `on_extension_load()` function, right after `installGenerateRawInterceptor()`

3. **index.js** (MODIFIED)
   - Line 211: `export * from './lorebookWrapper.js';`
   - Added after other lorebook exports

4. **defaultSettings.js** (MODIFIED)
   - Line 152: `wrap_lorebook_entries: false,`

5. **settings.html** (MODIFIED)
   - Lines 62-65: Checkbox for "Wrap Lorebook Entries"

6. **settingsUI.js** (MODIFIED)
   - Line 76: `bind_setting('#wrap_lorebook_entries', 'wrap_lorebook_entries', 'boolean');`

## Root Cause Analysis

### Hypothesis: Monkey-Patch Fails Due to ES Module Isolation

**The Approach:**
```javascript
// lorebookWrapper.js line 379-407
export function installLorebookWrapper() {
    if (typeof window !== 'undefined' && typeof window.checkWorldInfo === 'function') {
        _originalCheckWorldInfo = window.checkWorldInfo;
        window.checkWorldInfo = checkWorldInfo_wrapped;
    } else {
        console.warn('window.checkWorldInfo not found');
    }
}
```

**Why It Fails:**
- SillyTavern's `world-info.js:4401` exports `checkWorldInfo` as an ES module export
- ES modules do NOT expose functions to `window` object
- `window.checkWorldInfo` does not exist
- Monkey-patching ES module exports is not possible in JavaScript

### Evidence from Console Logs

**Console log provided (z-console.txt):**
- ✅ Shows `WORLD_INFO_ACTIVATED` event firing (lines 117-118, 237-238)
- ✅ Shows metadata injection working (lines 255-256)
- ❌ NO `[Auto-Recap:Init] About to call installLorebookWrapper()`
- ❌ NO `[Auto-Recap:LorebookWrapper] MODULE LOADING`
- ❌ NO `[Auto-Recap:LorebookWrapper] Installing lorebook wrapper`
- ❌ NO `checkWorldInfo_wrapped CALLED!`

**Critical Issue:**
The console log provided does NOT show page initialization - it starts mid-session. We cannot confirm whether:
- The module loads at all
- `installLorebookWrapper()` is called
- The function finds or doesn't find `window.checkWorldInfo`

## Diagnostic Logging Added

### At Module Load (lorebookWrapper.js:4)
```javascript
console.log('[Auto-Recap:LorebookWrapper] ===== MODULE LOADING =====');
```
**Purpose:** Confirms the module file is executed

### Before Function Call (eventHandlers.js:253-255)
```javascript
console.log('[Auto-Recap:Init] About to call installLorebookWrapper()');
installLorebookWrapper();
console.log('[Auto-Recap:Init] installLorebookWrapper() call completed');
```
**Purpose:** Confirms the function is called during initialization

### Inside installLorebookWrapper (lorebookWrapper.js:380-407)
```javascript
console.log('[Auto-Recap:LorebookWrapper] ========== Installing lorebook wrapper ==========');
console.log('[Auto-Recap:LorebookWrapper] typeof window:', typeof window);
console.log('[Auto-Recap:LorebookWrapper] typeof window.checkWorldInfo:', typeof window?.checkWorldInfo);
console.log('[Auto-Recap:LorebookWrapper] window.checkWorldInfo exists:', !!window?.checkWorldInfo);

if (typeof window !== 'undefined' && typeof window.checkWorldInfo === 'function') {
    console.log('[Auto-Recap:LorebookWrapper] ✓ window.checkWorldInfo is a function, proceeding with wrapper');
    // ... wrapper installation
} else {
    console.warn('[Auto-Recap:LorebookWrapper] ❌ window.checkWorldInfo NOT FOUND - wrapper not installed');
    console.warn('[Auto-Recap:LorebookWrapper] window object keys sample:', window ? Object.keys(window).slice(0, 10) : 'window is undefined');
}
```
**Purpose:**
- Confirms function execution
- Shows whether `window.checkWorldInfo` exists
- If missing, shows what IS on window object

### Inside Wrapper Function (lorebookWrapper.js:38-66)
```javascript
console.log('[Auto-Recap:LorebookWrapper] checkWorldInfo_wrapped CALLED!');
console.log('[Auto-Recap:LorebookWrapper] _isWrapperActive:', _isWrapperActive, '_originalCheckWorldInfo exists:', !!_originalCheckWorldInfo);

// ... processing ...

console.log('[Auto-Recap:LorebookWrapper] Original checkWorldInfo returned, entries count:', result?.allActivatedEntries?.size || 0);
console.log('[Auto-Recap:LorebookWrapper] Settings:', settings ? 'exists' : 'NULL');
console.log('[Auto-Recap:LorebookWrapper] wrap_lorebook_entries setting:', settings?.wrap_lorebook_entries);
```
**Purpose:**
- Confirms wrapper function is called (if monkey-patch works)
- Shows settings state
- Shows entry count being processed

### Inside reconstructWithWrapping (lorebookWrapper.js:84-95)
```javascript
console.log('[Auto-Recap:LorebookWrapper] reconstructWithWrapping called');
console.log('[Auto-Recap:LorebookWrapper] result exists:', !!result);
console.log('[Auto-Recap:LorebookWrapper] allActivatedEntries exists:', !!result?.allActivatedEntries);
console.log('[Auto-Recap:LorebookWrapper] allActivatedEntries size:', result?.allActivatedEntries?.size);
console.log('[Auto-Recap:LorebookWrapper] Processing', entriesArray.length, 'entries for wrapping');
```
**Purpose:** Shows reconstruction logic executing

## What to Check in Fresh Console Log

### Must Capture from Page Load
1. Open SillyTavern in browser
2. Open Console (F12 → Console tab)
3. **Clear console** (trash icon or Ctrl+L)
4. **Reload page** (F5 or Ctrl+R)
5. Wait for full page load
6. Copy **ENTIRE** console output from first line
7. Search for the following patterns:

### Key Log Patterns to Search For

#### Pattern 1: Module Loading
```
[Auto-Recap:LorebookWrapper] ===== MODULE LOADING =====
```
- **If present:** Module file executed
- **If missing:** Import error or module not loaded

#### Pattern 2: Function Call
```
[Auto-Recap:Init] About to call installLorebookWrapper()
[Auto-Recap:Init] installLorebookWrapper() call completed
```
- **If present:** Function was called
- **If missing:** Initialization didn't reach that point (earlier error)

#### Pattern 3: Installation Attempt
```
[Auto-Recap:LorebookWrapper] ========== Installing lorebook wrapper ==========
typeof window: object
typeof window.checkWorldInfo: undefined (or function)
window.checkWorldInfo exists: false (or true)
```
- **If `typeof window.checkWorldInfo: undefined`:** Confirms ES module isolation issue
- **If `typeof window.checkWorldInfo: function`:** Monkey-patch should work

#### Pattern 4: Installation Result
```
✓ Wrapped window.checkWorldInfo
```
OR
```
❌ window.checkWorldInfo NOT FOUND - wrapper not installed
```

#### Pattern 5: Wrapper Execution (only if monkey-patch worked)
```
[Auto-Recap:LorebookWrapper] checkWorldInfo_wrapped CALLED!
```
- **If present:** Wrapper is intercepting calls
- **If missing:** Monkey-patch didn't work or function not called

## Expected Diagnosis Results

### Scenario A: Module Not Loading
**Symptoms:**
- No `MODULE LOADING` message
- Import error in console

**Fix:** Fix import/syntax error

### Scenario B: Function Not Called
**Symptoms:**
- `MODULE LOADING` present
- No `About to call installLorebookWrapper()`

**Fix:** Debug why initialization stops before that point

### Scenario C: window.checkWorldInfo Doesn't Exist (MOST LIKELY)
**Symptoms:**
- All logs present up to installation
- `window.checkWorldInfo: undefined`
- `❌ window.checkWorldInfo NOT FOUND`

**Fix:** Abandon monkey-patch approach, use alternative (see below)

### Scenario D: Monkey-Patch Works But Setting Disabled
**Symptoms:**
- Wrapper installed successfully
- `checkWorldInfo_wrapped CALLED!`
- `wrap_lorebook_entries setting: false`

**Fix:** Enable setting in UI

## Alternative Implementation Approach

### If Monkey-Patching Fails (Expected)

**Use Event + generateRaw Interception Instead:**

1. **Listen to `WORLD_INFO_ACTIVATED` event**
   - Cache entry objects with UIDs and content
   - Store in module-level Map

2. **Intercept in existing `generateRawInterceptor.js`**
   - After metadata injection
   - Check if `wrap_lorebook_entries` setting enabled
   - Parse prompt for world info block
   - Match concatenated content to cached entries
   - Replace with individually wrapped entries

3. **Implementation sketch:**
```javascript
// In lorebookWrapper.js
const entryCache = new Map();

export function cacheWorldInfoEntries(entries) {
    entryCache.clear();
    for (const entry of entries) {
        entryCache.set(entry.uid, {
            content: processEntryContent(entry),
            name: entry.comment,
            uid: entry.uid
        });
    }
}

export function wrapWorldInfoInPrompt(prompt) {
    // Find world info section
    // Match lines to cached entries by content
    // Wrap each individually
    // Return modified prompt
}

// In eventHandlers.js - add event listener
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
    if (get_settings().wrap_lorebook_entries) {
        cacheWorldInfoEntries(entries);
    }
});

// In generateRawInterceptor.js
if (settings.wrap_lorebook_entries) {
    options.prompt = wrapWorldInfoInPrompt(options.prompt);
}
```

## Files State After Debug Session

### Modified Files (with logging)
1. `lorebookWrapper.js` - Line 4 added module load log
2. `eventHandlers.js` - Lines 253-255 added call logging
3. `lorebookWrapper.js` - Lines 380-407 extensive installation logging
4. `lorebookWrapper.js` - Lines 38-66 wrapper execution logging
5. `lorebookWrapper.js` - Lines 84-95 reconstruction logging

### New Setting Added
- `defaultSettings.js:152` - `wrap_lorebook_entries: false`
- `settings.html:62-65` - UI checkbox
- `settingsUI.js:76` - Binding

**Setting must be enabled in UI:**
- Auto-Recap Settings → First-Hop Proxy Integration → Check "Wrap Lorebook Entries"

## Import Chain Verification

✅ **lorebookWrapper.js:379** - `export function installLorebookWrapper()`
✅ **index.js:211** - `export * from './lorebookWrapper.js';`
✅ **eventHandlers.js:45** - Import from index.js
✅ **eventHandlers.js:254** - Function called

**All imports correct - issue is runtime behavior, not code structure**

## Next Steps for Fresh Session

1. **Capture full page load console**
2. **Search for the 5 key patterns above**
3. **Determine which scenario matches**
4. **If Scenario C (expected):**
   - Abandon monkey-patch approach
   - Implement event + interceptor approach
   - Rewrite lorebookWrapper.js completely
   - Integrate with existing generateRawInterceptor.js
5. **Test with actual generation and verify wrapped output**

## Critical Files to Preserve

- `docs/SILLYTAVERN_LOREBOOK_INJECTION.md` - Technical analysis
- `docs/LOREBOOK_WRAPPING_IMPLEMENTATION_BRIEF.md` - Implementation guide
- `docs/QUICK_REFERENCE_LOREBOOK_WRAPPING.md` - Quick reference
- This file: `docs/LOREBOOK_WRAPPER_DEBUG_SESSION.md`

## Key SillyTavern References

- **Line 4401** - `world-info.js` exports `checkWorldInfo` as async function
- **Lines 4849-4850** - Processing pipeline uses `getRegexedString()`
- **Line 4926** - Returns object with `allActivatedEntries` Set
- **Line 855** - `getWorldInfoPrompt()` calls `checkWorldInfo()`
- **Line 117** - Console shows `world_info_activated` event with all entry data

## Recap

**What works:**
- Extension loads
- Metadata injection works
- `WORLD_INFO_ACTIVATED` event fires with full entry data

**What doesn't work:**
- Lorebook entries not wrapped individually
- Likely because `window.checkWorldInfo` doesn't exist (ES module isolation)
- Cannot confirm without full page load console log

**What's needed:**
1. Full console log from page reload
2. Confirmation that monkey-patch approach fails
3. Switch to event + interceptor approach if confirmed

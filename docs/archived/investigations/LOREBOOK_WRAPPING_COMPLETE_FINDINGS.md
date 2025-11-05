# Lorebook Entry Wrapping - Complete Diagnostic Findings

**Objective:** Wrap individual lorebook entries with XML tags for proxy logging
**Status:** Multiple approaches tested, all failed - BUT there must be another way

---

## What We've Tested

### ❌ Approach 1: Monkey-Patch `checkWorldInfo`
**Method:** Import and wrap `checkWorldInfo` function from world-info.js
**Result:** FAILED - ES module isolation prevents access
**Evidence:** Console line 130-170 in z-console.txt
```
typeof window.checkWorldInfo: undefined
❌ window.checkWorldInfo NOT FOUND - wrapper not installed
```

### ❌ Approach 2: Modify `entry.content` in WORLD_INFO_ACTIVATED Event
**Method:** Hook `WORLD_INFO_ACTIVATED` event, modify `entry.content` directly
**Test:** Wrapped first entry with `<<<TEST_WRAPPER>>>` tags
**Result:** FAILED - Modifications don't propagate to prompt
**Evidence:** Console lines 622-649
- Line 624: Modified entry successfully
- Line 628: Event args show wrapped content
- Lines 648-649: TEST_WRAPPER not found in any of 15 system messages
**Root Cause:** Event receives COPIES of entry objects, not originals

### ❌ Approach 3: String Matching After Concatenation
**Method:** Match cached entry content to concatenated prompt string
**Result:** FAILED - Too many issues
**Problems:**
1. Newlines between entries (`\n` separators)
2. Multi-line content within entries (can't distinguish from multiple entries)
3. Character entries transformed/formatted differently
4. Only 1/13 sequential matches achieved
**Evidence:** Console lines 1599-1710
- Entries separated by newlines
- Gap content shows formatting differences
- Sequential matching breaks after first mismatch

---

## Critical Discoveries

### 1. Entry Injection Flow (from world-info.js source)
```javascript
// Line 4834-4911 in world-info.js
const WIBeforeEntries = [];
const WIAfterEntries = [];

[...allActivatedEntries.values()].sort(sortFn).forEach((entry) => {
    const content = getRegexedString(entry.content, regex_placement.WORLD_INFO, ...);

    switch (entry.position) {
        case world_info_position.before:
            WIBeforeEntries.unshift(content);
            break;
        case world_info_position.after:
            WIAfterEntries.unshift(content);
            break;
    }
});

const worldInfoBefore = WIBeforeEntries.length ? WIBeforeEntries.join('\n') : '';
const worldInfoAfter = WIAfterEntries.length ? WIAfterEntries.join('\n') : '';
```

**Key Facts:**
- Entries joined with `\n` only (no markers, no structure)
- `getRegexedString()` processes content but doesn't add wrappers
- Individual boundaries lost after `.join()`

### 2. Event Timing
**WORLD_INFO_ACTIVATED fires:**
- Line 862 in world-info.js
- AFTER entry selection
- BEFORE joining into strings
- BUT: Event receives copies, not originals

**Event sequence:**
1. `WORLD_INFO_ACTIVATED` (line 622-628 in console)
2. `CHAT_COMPLETION_PROMPT_READY` (line 648-650)
3. `GENERATE_AFTER_DATA` (line 651)

### 3. Actual Prompt Structure
From console line 1593-1598 (System message 9):
```
[Location: Library built into a large tree, contains Anonfilly's room]
[Character: Attempting to mother Anonfilly, wants Anonfilly to integrate...]
[Character: Earth pony filly, green coat, black hair...]
after-author-notes-gytha
[Registry: rule]
[Registry: quest]
```

**Structure:**
- Entries concatenated with `\n`
- Character/location entries have `[Type: ...]` wrappers
- Simple entries (like `after-author-notes-gytha`) are plain text
- Registry entries wrapped: `[Registry: type]`

---

## What We HAVEN'T Tried Yet

### Option 1: Intercept Earlier in Pipeline
**Hypothesis:** WORLD_INFO_ACTIVATED is too late
**Alternative events to check:**
- `WORLDINFO_ENTRIES_LOADED` (fires multiple times, see lines 292, 356, 519, 726)
- Events BEFORE `checkWorldInfo` is called
- Hook into the actual entry loading from lorebook files

**Investigation needed:**
- When/where are entries loaded from JSON files?
- Can we modify entries in the lorebook data structure before SillyTavern reads them?
- Are there earlier hooks in the world info pipeline?

### Option 2: Direct DOM/Global Manipulation
**Hypothesis:** If ES modules isolate functions, maybe we can inject into global scope differently
**Approaches:**
- Inject code directly into world-info.js via script injection
- Use `Object.defineProperty` on global objects
- Hook into module loader itself
- Patch the actual JavaScript execution context

### Option 3: Intercept at Network/API Level
**Hypothesis:** Wrap entries in the final request body before sending to API
**Approaches:**
- Hook `fetch()` or `XMLHttpRequest`
- Intercept in the API connector layer
- Modify the request body in `CHAT_COMPLETION_SETTINGS_READY` event

### Option 4: Modify Lorebook Files Directly
**Hypothesis:** Pre-wrap content in the actual lorebook JSON files
**Approaches:**
- Wrap `entry.content` when creating/updating entries
- Store wrapped content in the lorebook file itself
- Unwrap for display in UI, keep wrapped for injection

### Option 5: Different Event in Chain
**Check these events:**
- `GENERATE_BEFORE_COMBINE_PROMPTS` (line 633-634)
- `GENERATE_AFTER_COMBINE_PROMPTS` (line 633)
- `TEXT_COMPLETION_SETTINGS_READY`
- Any world-info specific events we missed

### Option 6: Proxy Pattern on Entry Objects
**Hypothesis:** Use JavaScript Proxy to intercept property access
**Approach:**
```javascript
eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
    entries.forEach((entry, index) => {
        entries[index] = new Proxy(entry, {
            get(target, prop) {
                if (prop === 'content') {
                    return `<wrapped>${target.content}</wrapped>`;
                }
                return target[prop];
            }
        });
    });
});
```

### Option 7: Monkey-Patch Array.prototype.join
**Hypothesis:** Since entries are joined with `.join('\n')`, intercept that
**Approach:**
```javascript
const originalJoin = Array.prototype.join;
Array.prototype.join = function(separator) {
    // If this looks like world info entries, wrap them
    if (this.every(item => typeof item === 'string' && item.length > 0)) {
        const wrapped = this.map((item, i) => `<entry id="${i}">${item}</entry>`);
        return originalJoin.call(wrapped, separator);
    }
    return originalJoin.call(this, separator);
};
```

### Option 8: Read SillyTavern Source More Carefully
**What to check:**
- How does `getRegexedString()` work? Can we hook it?
- Are there any extension points in the world-info.js flow?
- What about the PromptManager class?
- Are there any callbacks or hooks we missed?

---

## Files Modified (Diagnostic Code to Clean Up)

### 1. `eventHandlers.js`
**Lines 402-430:** WORLD_INFO_ACTIVATED test wrapper
**Lines 312-331:** CHAT_COMPLETION_PROMPT_READY test wrapper check
**Action:** Remove diagnostic code, keep event structure for real implementation

### 2. `generateRawInterceptor.js`
**Lines 10:** Import `get_settings`
**Action:** Keep import, remove any diagnostic code if present

### 3. `lorebookWrapper.js`
**Current state:** Failed monkey-patch code
**Action:** Complete rewrite once working approach found

---

## Key Source Code Locations

### SillyTavern Core
- `/mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New/public/scripts/world-info.js`
  - Line 862: `WORLD_INFO_ACTIVATED` event emission
  - Lines 4834-4911: Entry joining logic
  - Function `checkWorldInfo`: Main world info processor
  - Function `getRegexedString`: Content processor

### Extension Files
- `eventHandlers.js`: Event hook registration
- `generateRawInterceptor.js`: Intercepts generateRaw calls
- `lorebookWrapper.js`: Wrapper implementation (needs rewrite)
- `defaultSettings.js`: Has `wrap_lorebook_entries` setting
- `settings.html`: UI checkbox already exists

---

## Console Log Evidence Files

All console logs saved to:
`z-console.txt`

**Key sections:**
- Lines 130-170: Monkey-patch failure
- Lines 622-628: WORLD_INFO_ACTIVATED modification test
- Lines 648-649: TEST_WRAPPER check (not found)
- Lines 1593-1710: Actual prompt structure and matching results

---

## Next Session Action Plan

1. **Don't give up** - There's always a way
2. **Investigate untried options** - We have at least 8 approaches above
3. **Read source code more carefully** - Look for ANY hook points
4. **Test alternative events** - Maybe there's an earlier/different event
5. **Consider unconventional approaches** - Proxy, monkey-patch join(), etc.
6. **Check if other extensions solve similar problems** - Research SillyTavern extension ecosystem

---

## Current State

**Setting exists:** `wrap_lorebook_entries` in defaultSettings.js
**UI exists:** Checkbox in settings.html
**Diagnostic code:** In eventHandlers.js (lines 402-430, 312-331)
**Status:** All three approaches tested and failed
**Conclusion:** THERE MUST BE ANOTHER WAY - keep investigating

---

## Critical Insight for Next Session

**The modification worked on the COPY but not the original.**

This means:
1. The entry objects ARE mutable
2. We CAN inject wrappers
3. We just need to find WHERE the original entries are
4. OR intercept at a different point in the pipeline
5. OR use a different mechanism entirely

The fact that we can see the wrapped content in the event args (line 628) proves the wrapping logic itself works. We just need to find the right place to apply it.

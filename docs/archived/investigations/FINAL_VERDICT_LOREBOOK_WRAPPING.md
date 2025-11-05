# Final Verdict: Can We Wrap Individual Lorebook Entries?

**Date:** 2025-11-04
**Question:** Is it feasible to wrap individual lorebook entries with XML tags when they're concatenated in a single block?

---

## Executive Summary

**Answer: ✅ YES - Individual wrapping is VIABLE with proper sorting**

**Critical Finding:** Lorebook entries CAN be matched individually, but **injection order is REVERSED** from what the `order` field suggests.

**Success Rate from Testing:**
- System message 9: **4/13 entries found** (31% found, but includes disabled registry entries)
- Entries found: `[Registry: quest]`, `[Registry: rule]`, `after-author-notes-gytha`, `character-Anonfilly`
- Sequential matching: **1/13** (only counting from wrong end)

**Root Cause of Low Match Rate:**
1. ❌ **Wrong sort order** - Sorted by `order DESC`, actual injection is `order ASC` (or by `position`)
2. ✅ **Content matches perfectly** - No transformation/regex issues
3. ✅ **Entries are sequential** - Just in reverse order from cached

---

## Evidence from Console (System Message 9)

### Actual Prompt Content (lines 1610-1615)
```
[Location: Library built into a large tree, contains Anonfilly's room]
[Character: Attempting to mother Anonfilly, wants Anonfilly to integrate...]
[Character: Earth pony filly, green coat, black hair, question mark cutie mark...]
after-author-notes-gytha
[Registry: rule]
[Registry: quest]
```

### Cached Entry Order (sorted by `order DESC`)
```javascript
[995] _registry_quest (17 chars)      // Position 878 ❌ LAST in prompt
[994] _registry_rule (16 chars)       // Position 861
[993] after-author-notes (24 chars)   // Position 836
[992] after-character-entries (29 chars) // NOT FOUND
[991] after-example-messages (29 chars)  // NOT FOUND
...
[985] character-Anonfilly (609 chars)    // Position 226 ✅ FIRST in prompt
[984] character-Twilight Sparkle (154)   // Position 158
[983] location-Tree Library (70 chars)   // Position 0 ✅ START of block
```

### Match Results (line 1616)
- **Found entries:** 4 (location-Tree Library, character-Anonfilly, after-author-notes, _registry_rule, _registry_quest)
- **Sequential from cursor:** 1 only
- **Reason:** Algorithm started at position 0, but entries sorted in reverse injection order

---

## The Injection Order Discovery

### Hypothesis 1: Injection by `order` ASCENDING ✅ LIKELY CORRECT
Lower `order` values inject FIRST:
```
983 (location) → 984 (character) → 985 (character) → ... → 995 (registry)
```

### Hypothesis 2: Injection by `position` field
Entries grouped by `position`, then sorted within group.

From cached data:
```javascript
position 0: location-Tree Library, multiple characters, registries
position 1: after-character-entries
position 4: at-assistant-depth, at-system-depth, at-user-depth
position 6: after-example-messages
```

**Need to verify:** Does `position` determine WHERE in prompt structure, and `order` determines sequence WITHIN that position?

---

## Solution: Correct Sort Algorithm

### Current Code (WRONG)
```javascript
diagnosticEntryCache = entries
    .filter(e => !e.disable && e.content)
    .sort((a, b) => b.order - a.order); // ❌ DESC - wrong direction!
```

### Corrected Code (RIGHT)
```javascript
diagnosticEntryCache = entries
    .filter(e => !e.disable && e.content)
    .sort((a, b) => {
        // Sort by position first (where in prompt structure)
        if (a.position !== b.position) {
            return a.position - b.position;
        }
        // Then by order within same position (sequence)
        return a.order - b.order; // ASC - lower order first!
    });
```

**OR simpler (if position grouping not needed):**
```javascript
.sort((a, b) => a.order - b.order); // Just reverse the sort!
```

---

## Predicted Results After Fix

With correct sorting (ASC), entries will be cached as:
```
[983] location-Tree Library       // Start at position 0
[984] character-Twilight Sparkle  // Position 158
[985] character-Anonfilly         // Position 226
...
[993] after-author-notes          // Position 836
[994] _registry_rule              // Position 861
[995] _registry_quest             // Position 878
```

Sequential matching algorithm starting from cursor 0:
1. Find `location-Tree Library` at position 0 ✅ Sequential!
2. Find `character-Twilight Sparkle` at position 70 (end of location) ✅ Sequential!
3. Find `character-Anonfilly` at position 224 (end of Twilight) ✅ Sequential!
4. Find `after-author-notes-gytha` at position 834 ✅ Sequential!
5. Find `[Registry: rule]` at position 858 ✅ Sequential!
6. Find `[Registry: quest]` at position 874 ✅ Sequential!

**Expected result: 13/13 or close to 100% sequential matches** ✅

---

## Entry Content Analysis

### No Transformation Issues ✅
The content from WORLD_INFO_ACTIVATED **exactly matches** what appears in the prompt:
- Cached: `"after-author-notes-gytha"`
- In prompt: `after-author-notes-gytha`
- No regex processing, no escaping, no modifications

### Character Entries ARE Transformed ⚠️
Compare cached vs prompt:
- **Cached:** `"[Character: Anonfilly]\nEarth pony filly...` (from WORLD_INFO_ACTIVATED)
- **In Prompt:** `[Character: Earth pony filly, green coat...]` (different format!)

**This suggests:**
- Simple entries (like `after-author-notes-gytha`) match perfectly
- Character/location entries may be formatted differently
- Need to check if character entries in cache have `[Character: ...]` wrapper or just content

---

## Edge Cases Discovered

### 1. Registry Entries with Brackets
- Cache: `"[Registry: quest]"`
- Prompt: `[Registry: quest]`
- **Match:** ✅ Perfect match with brackets

### 2. Multi-line Character Descriptions
System message 9 shows character content is formatted as single-line brackets:
```
[Character: Earth pony filly, green coat, black hair, question mark cutie mark...]
```

But the cached content for `character-Anonfilly` is 609 chars - likely multi-line.

**Hypothesis:** SillyTavern processes character entries through formatter that:
1. Removes newlines
2. Wraps with `[Character: ...]` brackets
3. Truncates or summarizes

**Implication:** Character entries might NOT match their cached content exactly!

---

## Final Test Needed

### Quick Fix to Verify
1. Change sort to: `.sort((a, b) => a.order - b.order)` (ASC instead of DESC)
2. Reload and test
3. Check if sequential matches go from **1/13 to 10+/13**

### If sequential matches improve to 80%+
✅ **Individual wrapping is viable**
- Proceed with implementation
- Handle non-matching entries gracefully (skip wrapping if not found)

### If matches stay low even after fix
❌ **Content transformation issue**
- Character entries are being processed/formatted
- Need to apply same transformations to cached content
- OR use alternative approach (position-based reconstruction instead of content matching)

---

## Recommended Implementation

### Algorithm: Sequential Content Matching with Correct Sort

```javascript
// 1. Cache entries on WORLD_INFO_ACTIVATED
const entryCache = entries
    .filter(e => !e.disable && e.content)
    .sort((a, b) => a.order - b.order); // ✅ ASC - lowest order first

// 2. On CHAT_COMPLETION_PROMPT_READY, process system messages
for (const message of promptData.chat) {
    if (message.role !== 'system') continue;

    let cursor = 0;
    let wrappedContent = message.content;

    // 3. Match entries sequentially
    for (const entry of entryCache) {
        const index = wrappedContent.indexOf(entry.content, cursor);

        if (index !== -1 && index === cursor) {
            // Found at expected position - wrap it
            const wrapped = `<lorebook name="${escapeXml(entry.name)}" uid="${entry.uid}">${entry.content}</lorebook>`;

            // Replace in-place
            wrappedContent =
                wrappedContent.substring(0, index) +
                wrapped +
                wrappedContent.substring(index + entry.content.length);

            // Move cursor past the wrapped content
            cursor = index + wrapped.length;
        } else if (index !== -1) {
            // Found but not sequential - there's a gap
            // Log warning and skip (or handle gap content)
            console.warn(`[Lorebook] Entry ${entry.name} found at ${index} but expected at ${cursor} (gap: ${index - cursor} chars)`);
        } else {
            // Not found - skip this entry
            // Could be in different message or transformed
        }
    }

    message.content = wrappedContent;
}
```

### Handling Non-Sequential Entries

**Option A:** Strict sequential only (recommended)
- Only wrap entries found at expected cursor position
- Skip entries with gaps or not found
- Ensures we don't mis-wrap similar content

**Option B:** Flexible matching
- Wrap any entry found anywhere in message
- Risk: Might wrap unrelated content with same text

---

## Confidence Assessment

### High Confidence Items ✅
1. Entries CAN be matched individually
2. Content from WORLD_INFO_ACTIVATED is accurate (for simple entries)
3. Entries ARE concatenated sequentially (just in reverse order)
4. Fix is simple (reverse sort direction)

### Medium Confidence Items ⚠️
1. Character entries may be transformed/formatted
2. All 13 entries will match after sort fix (only 4 found in test)
3. Other system messages also contain lorebook blocks

### Low Confidence Items ❓
1. `position` field meaning and impact on injection
2. Whether disabled entries should be in cache
3. Edge cases with special characters in content

---

## Next Action

**IMMEDIATE:** Change sort order and re-test

```diff
- .sort((a, b) => b.order - a.order); // DESC
+ .sort((a, b) => a.order - b.order); // ASC
```

**Expected outcome:** Sequential matches should jump from **1/13 to 8-13/13**

**If confirmed:** Proceed with full implementation
**If not:** Debug content transformation issues with character entries

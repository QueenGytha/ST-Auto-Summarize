# Diagnostic Results: Lorebook Wrapping Analysis

**Date:** 2025-11-04
**Objective:** Verify viability of event-driven lorebook wrapping approach

## Executive Recap

✅ **WORLD_INFO_ACTIVATED event provides complete data needed**
❌ **generateRaw interceptor NOT called for chat completions (uses messages array, not string prompt)**
✅ **CHAT_COMPLETION_PROMPT_READY event fires with full messages array**
🎯 **SOLUTION:** Use CHAT_COMPLETION_PROMPT_READY event + intercept messages array, not generateRaw

---

## Key Findings

### 1. WORLD_INFO_ACTIVATED Event ✅

**Event fires:** Line 490-587 in console
**Timestamp:** `2025-11-03T17:18:13.514Z`
**Entries count:** 13 entries provided

**Data Structure (Confirmed):**
```javascript
{
    uid: 4,  // Unique ID
    comment: "_registry_quest",  // Entry name
    content: "[Registry: quest]",  // Full content text
    position: 0,  // Injection position
    order: 995,  // Sort order
    world: "z-AutoLB-Anonfilly - 2025-11-04@04h31m45s",  // Lorebook name
    key: [],  // Activation keys
    // ... other metadata
}
```

**Sample Entries Captured:**
| UID | Name | Content Length | Position |
|-----|------|---------------|----------|
| 13 | after-author-notes | 24 | 0 |
| 9 | after-character-entries | 29 | 1 |
| 6 | character-Anonfilly | 609 | 0 |
| 8 | character-Twilight Sparkle | 154 | 0 |
| 7 | location-Tree Library | 70 | 0 |

**Verdict:** ✅ Event provides ALL data needed (UID, name, content, position)

---

### 2. generateRaw Interceptor Status ❌

**Interceptor installed:** Line 108-112 in console
**Result:** `✓ Wrapped ctx.generateRaw`

**Problem:** No `[Auto-Recap:DIAGNOSTIC] PROMPT ANALYSIS` logs found

**Root Cause:** SillyTavern uses **Chat Completion API** (messages array), not Text Completion API (string prompt)

**Evidence:**
- Line 608: `CHAT_COMPLETION_PROMPT_READY` event fires
- Line 610: `GENERATE_AFTER_DATA` event with `prompt: [array]`
- Line 614: `CHAT_COMPLETION_SETTINGS_READY` event fires
- NO `generateRaw` with string prompt ever called

**Interceptor check shows:**
```javascript
if (options && typeof options.prompt === 'string') {  // <-- FALSE
    // Diagnostic code here
}
```

`options.prompt` is an **array of message objects**, not a string!

---

### 3. Chat Completion Flow ✅

**Actual event sequence:**
1. `WORLD_INFO_ACTIVATED` fires (line 490) ← **Cache entries here**
2. `CHAT_COMPLETION_PROMPT_READY` fires (line 608) ← **Intercept messages array here**
3. World info injected into messages array
4. `GENERATE_AFTER_DATA` fires (line 610)
5. `CHAT_COMPLETION_SETTINGS_READY` fires (line 614)
6. Request sent to API

**Messages array structure (from line 608):**
```javascript
{
    chat: [
        {
            role: "system",
            content: "<ST_METADATA>...</ST_METADATA>\n\n<roleplay_memory>...</roleplay_memory>"
        },
        {
            role: "system",
            content: "You are a creative writer..."
        },
        // ... more messages
    ]
}
```

**World info content appears INSIDE system message `content` field** (concatenated string within the array message)

---

## Revised Solution Architecture

### ❌ Original Plan (Won't Work)
```
WORLD_INFO_ACTIVATED → Cache entries
generateRaw(string prompt) → Find & wrap in prompt string
```
**Problem:** `generateRaw` never receives a string prompt for chat completions

### ✅ Correct Implementation
```
WORLD_INFO_ACTIVATED → Cache entries in Map<uid, entry>
CHAT_COMPLETION_PROMPT_READY → Process messages array
  ↓
For each message where role === "system":
  ↓
Parse message.content (string) for lorebook entries
  ↓
Match content to cached entries by text matching
  ↓
Replace with individually wrapped entries:
  <lorebook name="X" uid="Y">content</lorebook>
  ↓
Update message.content with wrapped version
```

---

## Implementation Requirements

### 1. Entry Caching (eventHandlers.js)
**Event:** `WORLD_INFO_ACTIVATED`
**Action:** Store entries in module-level Map

```javascript
const entryCache = new Map();

eventSource.on(event_types.WORLD_INFO_ACTIVATED, (entries) => {
    if (!get_settings().wrap_lorebook_entries) return;

    entryCache.clear();
    for (const entry of entries) {
        entryCache.set(entry.uid, {
            content: entry.content,
            name: entry.comment,
            uid: entry.uid,
            position: entry.position,
            order: entry.order
        });
    }
});
```

### 2. Message Array Interception (eventHandlers.js)
**Event:** `CHAT_COMPLETION_PROMPT_READY` (ALREADY has handler at line 283!)
**Action:** Process messages array to wrap lorebook entries

```javascript
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (promptData) => {
    // Existing metadata injection code...

    // NEW: Add lorebook wrapping
    const settings = get_settings();
    if (settings?.wrap_lorebook_entries && promptData?.chat) {
        for (const message of promptData.chat) {
            if (message.role === 'system' && typeof message.content === 'string') {
                message.content = wrapLorebookEntriesInContent(message.content, entryCache);
            }
        }
    }
});
```

### 3. Content Wrapping Logic (lorebookWrapper.js)
**Function:** `wrapLorebookEntriesInContent(content, entryCache)`

**Algorithm:**
1. Sort cached entries by `order` (descending) and `position`
2. For each entry, search for its content in the system message
3. When found, replace with: `<lorebook name="${name}" uid="${uid}">${content}</lorebook>`
4. Handle edge cases:
   - Content may have newlines/whitespace variations
   - Multiple entries may be concatenated
   - Need to match EXACT content (normalize whitespace)

**Challenges:**
- Entries are concatenated WITHOUT separators
- Need content matching algorithm
- Must preserve non-lorebook content

---

## Timing Verification ✅

**Question:** Does WORLD_INFO_ACTIVATED fire before CHAT_COMPLETION_PROMPT_READY?

**Answer:** ✅ YES

**Evidence from console:**
- Line 490: `WORLD_INFO_ACTIVATED` event fired at `2025-11-03T17:18:13.514Z`
- Line 608: `CHAT_COMPLETION_PROMPT_READY` event fired LATER

**Implication:** Cached entry data WILL be available when we process the messages array

---

## Content Matching Strategy

### Problem
Lorebook entries are concatenated in prompt WITHOUT unique separators:
```
after-author-notes-gythaafter-character-entries-gythabefore-example-messages-gytha
```

### Solution Options

#### Option A: Simple String Matching
**Pros:** Fast, simple
**Cons:** Fragile if content has whitespace variations

```javascript
for (const [uid, entry] of entryCache) {
    const index = content.indexOf(entry.content);
    if (index !== -1) {
        const wrapped = `<lorebook name="${entry.name}" uid="${uid}">${entry.content}</lorebook>`;
        content = content.substring(0, index) + wrapped + content.substring(index + entry.content.length);
    }
}
```

#### Option B: Regex with Escaping
**Pros:** More robust
**Cons:** Need to escape special chars

```javascript
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const [uid, entry] of entryCache) {
    const pattern = new RegExp(escapeRegex(entry.content), 'g');
    const wrapped = `<lorebook name="${entry.name}" uid="${uid}">${entry.content}</lorebook>`;
    content = content.replace(pattern, wrapped);
}
```

#### Option C: Position-Based Injection ⭐ RECOMMENDED
**Pros:** Precise, matches SillyTavern's injection logic
**Cons:** More complex

Use the `position` field from entries to reconstruct properly:
1. Parse messages array to identify injection points
2. Group cached entries by `position`
3. Inject wrapped entries at correct positions
4. Don't try to "find and replace" - instead, reconstruct

---

## Edge Cases to Handle

1. **Empty/Disabled Entries**
   - Filter out entries with `disable: true`
   - Skip entries with empty content

2. **Registry Entries**
   - Names starting with `_registry_` are usually disabled
   - Content like `[Registry: quest]` shouldn't be wrapped

3. **Duplicate Content**
   - Multiple entries might have similar content
   - Use UID as tie-breaker

4. **Special Characters in Content**
   - XML escaping needed: `<`, `>`, `&`, `"`, `'`
   - Use proper XML escaping function

---

## Next Steps

### Immediate (Proof of Concept)
1. ✅ Add diagnostic logging (DONE)
2. ✅ Capture console output (DONE)
3. ✅ Analyze event flow (DONE)
4. ⏭️ Update diagnostic logs to target CHAT_COMPLETION_PROMPT_READY
5. ⏭️ Verify message.content contains lorebook entries
6. ⏭️ Test content matching logic

### Implementation
1. Move entry caching to WORLD_INFO_ACTIVATED handler
2. Add message array processing to existing CHAT_COMPLETION_PROMPT_READY handler
3. Implement wrapLorebookEntriesInContent() function
4. Test with real chat
5. Verify wrapped output in proxy logs

### Cleanup
1. Remove failed monkey-patch code from lorebookWrapper.js
2. Remove unused generateRaw interceptor diagnostic code
3. Update documentation

---

## Files to Modify

### 1. eventHandlers.js
- ✅ Add WORLD_INFO_ACTIVATED listener with caching (diagnostic exists)
- ⚠️ Update CHAT_COMPLETION_PROMPT_READY handler (line 283) to add wrapping

### 2. lorebookWrapper.js
- ❌ Remove monkey-patch code (installLorebookWrapper, checkWorldInfo_wrapped)
- ✅ Add cacheWorldInfoEntries(entries)
- ✅ Add wrapLorebookEntriesInContent(content, entryCache)
- ✅ Add helper functions for XML escaping, content matching

### 3. generateRawInterceptor.js
- ⚠️ Remove diagnostic code (or keep for other use cases)

---

## Conclusion

**Original Hypothesis:** ❌ PARTIALLY INCORRECT
- ✅ Event-driven approach is viable
- ✅ WORLD_INFO_ACTIVATED provides all needed data
- ❌ generateRaw interceptor won't work (wrong API type)
- ✅ CHAT_COMPLETION_PROMPT_READY is the correct interception point

**Revised Approach:** ✅ FEASIBLE
- Use WORLD_INFO_ACTIVATED for caching
- Use CHAT_COMPLETION_PROMPT_READY for wrapping
- Process messages array, not string prompt
- Match and wrap content within system message content strings

**Implementation Complexity:** MEDIUM
- Entry caching: Simple
- Message array traversal: Simple
- Content matching: Moderate (need robust algorithm)
- XML escaping: Simple (standard function)

**Confidence:** HIGH ✅
- All required data is available
- Timing is correct
- Interception point confirmed
- Algorithm is straightforward

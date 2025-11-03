# Lorebook Entry Wrapping - Complete Implementation Brief

**Version**: 1.0
**Date**: 2025-11-04
**Objective**: Implement optional wrapping of ALL SillyTavern lorebook entries (8 position types) with individual XML tags for downstream parsing.

---

## CRITICAL REQUIREMENT

**EACH ENTRY MUST BE WRAPPED INDIVIDUALLY**

```xml
✅ CORRECT (Individual Wrapping):
<lorebook name="Entry1" uid="123">
Alice is a detective.
She works in the foggy city.
</lorebook>
<lorebook name="Entry2" uid="456">
The city is always foggy.
</lorebook>
<lorebook name="Entry3" uid="789">
Crime is rising.
</lorebook>

❌ WRONG (Block Wrapping):
<lorebook>
Alice is a detective.
She works in the foggy city.
The city is always foggy.
Crime is rising.
</lorebook>
```

If individual wrapping is not possible, **STOP and report it as impossible**.

---

## Background Context

### The Problem We're Solving

SillyTavern does NOT natively mark lorebook entries in prompts. By the time entries reach the prompt, they're **concatenated strings with no boundaries**:

```javascript
// Three entries:
"Entry 1 content\nEntry 2 content\nEntry 3 content"
```

We need to wrap each entry individually so downstream systems (proxies, logging) can detect and parse them.

### The Multi-line Entry Challenge

**This is the critical dealbreaker for naive approaches:**

```javascript
// Entry 1 has newlines:
Entry 1: "Alice is a detective.\nShe works in the foggy city."
Entry 2: "The city is always foggy."

// After SillyTavern joins them:
"Alice is a detective.\nShe works in the foggy city.\nThe city is always foggy."

// If we naively split by \n:
["Alice is a detective.", "She works in the foggy city.", "The city is always foggy."]
// ❌ That's 3 lines but only 2 entries! We can't tell which lines belong to which entry!
```

**Positions 0 and 1** (worldInfoBefore/After) are THE MOST COMMONLY USED lorebook positions, so this MUST work correctly.

---

## The Optimal Solution: Reconstruction from allActivatedEntries

### Key Discovery

When `checkWorldInfo` returns at `/public/scripts/world-info.js:4926`, it provides:

```javascript
{
    worldInfoBefore: "string",           // ❌ Already joined, boundaries lost
    worldInfoAfter: "string",            // ❌ Already joined, boundaries lost
    ANBeforeEntries: ["array"],          // ✅ Individual entries still separate
    ANAfterEntries: ["array"],           // ✅ Individual entries still separate
    // ... other positions
    allActivatedEntries: Set([...])      // ✅✅✅ FULL entry objects with ALL metadata!
}
```

The `allActivatedEntries` Set contains the complete entry objects BEFORE they were concatenated!

### The Approach

1. Let `checkWorldInfo` run normally
2. Intercept its return value via monkey-patch
3. Extract entry objects from `result.allActivatedEntries`
4. Filter by position type
5. Process EACH entry through the SAME pipeline SillyTavern uses (`getRegexedString`)
6. Wrap EACH entry individually with its own `<lorebook>` tags
7. Join the individually-wrapped entries with `\n`
8. Replace the concatenated strings in the result object

**This gives us:**
- ✅ Full entry metadata (uid, name, world, order, position)
- ✅ Exact processed content (after macros/regex)
- ✅ Individual entry boundaries preserved
- ✅ Perfect handling of multi-line entries
- ✅ Works for ALL 8 position types

---

## SillyTavern's 8 Position Types

| Value | Name | UI Label | Data Structure in Return |
|-------|------|----------|-------------------------|
| 0 | `before` | ↑Char | `worldInfoBefore` (string) |
| 1 | `after` | ↓Char | `worldInfoAfter` (string) |
| 2 | `ANTop` | ↑AN | `ANBeforeEntries` (array of strings) |
| 3 | `ANBottom` | ↓AN | `ANAfterEntries` (array of strings) |
| 4 | `atDepth` | @D | `WIDepthEntries` (array of `{depth, role, entries[]}`) |
| 5 | `EMTop` | ↑EM | `EMEntries` (array of `{position, content}`) |
| 6 | `EMBottom` | ↓EM | `EMEntries` (array of `{position, content}`) |
| 7 | `outlet` | ➡️ | `outletEntries` (object `{name: [entries]}`) |

**Reference**: `/public/scripts/world-info.js:815-824`

---

## SillyTavern Code Flow Reference

### Critical Line Numbers in `/public/scripts/world-info.js`

| Lines | Component | Purpose |
|-------|-----------|---------|
| 815-824 | Position enum | `world_info_position` definitions |
| 4728-4927 | `checkWorldInfo()` | Main WI processing function |
| 4837-4844 | Array initialization | Empty arrays created |
| **4848** | **Processing loop start** | `forEach` over `allActivatedEntries` |
| 4849 | regexDepth calc | Calculate depth for position 4 |
| **4850** | **Content processing** | `getRegexedString()` call - THE CRITICAL PROCESSING |
| 4852-4855 | Empty skip | Skip entries with no content |
| 4857-4908 | Switch statement | Add to position-specific arrays |
| **4910-4911** | **❌ Boundary loss** | Arrays joined to strings with `\n` |
| **4926** | **✅ Return point** | Returns with `allActivatedEntries` still intact |

### How SillyTavern Processes Entry Content (Line 4850)

```javascript
const regexDepth = entry.position === world_info_position.atDepth ?
                   (entry.depth ?? DEFAULT_DEPTH) : null;

const content = getRegexedString(
    entry.content,                      // Raw entry content
    regex_placement.WORLD_INFO,         // Placement type
    {
        depth: regexDepth,              // Depth for position 4
        isMarkdown: false,              // Not markdown
        isPrompt: true                  // Is prompt text
    }
);
```

This call:
1. Applies macro substitution (`{{char}}`, `{{user}}`, etc.)
2. Applies regex transformations (if regex extension is active)
3. Returns the final processed content

**WE MUST REPLICATE THIS EXACTLY** to get matching content.

### How SillyTavern Sorts Entries

```javascript
// Higher order values appear first
entries.sort((a, b) => b.order - a.order);

// Then uses .unshift() to add to arrays
WIBeforeEntries.unshift(content);  // Adds to beginning of array
```

**WE MUST REPLICATE THIS SORTING** to preserve order.

---

## Implementation Plan

### Files to Create/Modify

#### 1. **Create `/lorebookWrapper.js`** (NEW)

**Purpose**: Monkey-patch `checkWorldInfo` and implement reconstruction logic.

**Imports needed**:
```javascript
import {
    checkWorldInfo,           // Function to wrap
    getRegexedString,         // Content processor
    world_info_position,      // Position enum
    regex_placement,          // Placement enum
    DEFAULT_DEPTH,            // Depth constant
    get_settings              // Settings accessor
} from './index.js';
```

**Main structure**:
```javascript
// Store original function
const original_checkWorldInfo = checkWorldInfo;

// Wrapped version
export async function checkWorldInfo_wrapped(chat, maxContext, isDryRun, globalScanData) {
    const result = await original_checkWorldInfo(chat, maxContext, isDryRun, globalScanData);

    const settings = get_settings();
    if (!settings.wrap_lorebook_entries) {
        return result; // Pass through if disabled
    }

    return reconstructWithWrapping(result);
}

// Replace global
checkWorldInfo = checkWorldInfo_wrapped;
```

**Functions to implement**:
- `reconstructWithWrapping(result)` - Main coordinator
- `reconstructPositionString(entries, positionType)` - For positions 0,1
- `reconstructPositionArray(entries, positionType)` - For positions 2,3
- `reconstructDepthEntries(entries, positionType)` - For position 4
- `reconstructEMEntries(entries, positionTypes)` - For positions 5,6
- `reconstructOutletEntries(entries, positionType)` - For position 7
- `processEntryContent(entry)` - Replicate ST's processing
- `wrapEntry(content, entry)` - Format wrapper tags
- `escapeXML(str)` - Escape XML special characters

#### 2. **Modify `/defaultSettings.js`**

Add to `default_settings` object:
```javascript
wrap_lorebook_entries: false,
```

**Line to add after**: Line 151 (near `first_hop_proxy_send_chat_details`)

#### 3. **Modify `/settings.html`**

Add checkbox in "First-Hop Proxy Integration" section (after line 64):

```html
<label class="checkbox_label" for="wrap_lorebook_entries">
    <input id="wrap_lorebook_entries" type="checkbox" />
    <span data-i18n="Wrap lorebook entries with XML tags">
        Wrap lorebook entries with XML tags
    </span>
    <div class="icon-info-container">
        <small data-i18n="[title]Wraps each lorebook entry individually with &lt;lorebook&gt; tags for downstream parsing. Supports multi-line entries. Tags are stripped by proxy before sending to LLM.">
            Wraps each lorebook entry individually with &lt;lorebook&gt; tags for downstream parsing. Supports multi-line entries.
        </small>
    </div>
</label>
```

#### 4. **Modify `/settingsUI.js`**

Add binding after line 75:

```javascript
bind_setting('#wrap_lorebook_entries', 'wrap_lorebook_entries', 'boolean');
```

#### 5. **Modify `/index.js`**

**Import SillyTavern modules** (add to existing ST imports section):
```javascript
import {
    checkWorldInfo,
    getRegexedString,
    world_info_position,
    regex_placement,
    DEFAULT_DEPTH
} from '../../../scripts/world-info.js';
```

**Re-export them** (add to re-exports section):
```javascript
export {
    checkWorldInfo,
    getRegexedString,
    world_info_position,
    regex_placement,
    DEFAULT_DEPTH
};
```

**Import wrapper module** (add near end):
```javascript
import './lorebookWrapper.js';  // Activates monkey-patch
```

---

## Detailed Implementation: lorebookWrapper.js

### Full Module Code Template

```javascript
// @flow
import {
    checkWorldInfo,
    getRegexedString,
    world_info_position,
    regex_placement,
    DEFAULT_DEPTH,
    get_settings
} from './index.js';

// Store original function reference
const original_checkWorldInfo = checkWorldInfo;

/**
 * Wrapped version of checkWorldInfo that optionally wraps lorebook entries
 * with individual XML tags for downstream parsing.
 */
export async function checkWorldInfo_wrapped(chat, maxContext, isDryRun, globalScanData) {
    // Call original function
    const result = await original_checkWorldInfo(chat, maxContext, isDryRun, globalScanData);

    // Check if wrapping is enabled
    const settings = get_settings();
    if (!settings.wrap_lorebook_entries) {
        return result;
    }

    // Reconstruct with wrapping
    return reconstructWithWrapping(result);
}

/**
 * Main reconstruction coordinator - processes all position types
 */
function reconstructWithWrapping(result) {
    if (!result.allActivatedEntries || result.allActivatedEntries.size === 0) {
        return result;
    }

    const entriesArray = Array.from(result.allActivatedEntries.values());

    // Position 0 (worldInfoBefore)
    result.worldInfoBefore = reconstructPositionString(
        entriesArray,
        world_info_position.before
    );

    // Position 1 (worldInfoAfter)
    result.worldInfoAfter = reconstructPositionString(
        entriesArray,
        world_info_position.after
    );

    // Position 2 (ANBeforeEntries)
    result.ANBeforeEntries = reconstructPositionArray(
        entriesArray,
        world_info_position.ANTop
    );

    // Position 3 (ANAfterEntries)
    result.ANAfterEntries = reconstructPositionArray(
        entriesArray,
        world_info_position.ANBottom
    );

    // Position 4 (WIDepthEntries)
    result.WIDepthEntries = reconstructDepthEntries(
        entriesArray,
        world_info_position.atDepth
    );

    // Positions 5,6 (EMEntries)
    result.EMEntries = reconstructEMEntries(
        entriesArray,
        [world_info_position.EMTop, world_info_position.EMBottom]
    );

    // Position 7 (outletEntries)
    result.outletEntries = reconstructOutletEntries(
        entriesArray,
        world_info_position.outlet
    );

    return result;
}

/**
 * Reconstruct positions 0,1 (worldInfoBefore/After)
 * These are returned as concatenated strings
 */
function reconstructPositionString(entriesArray, positionType) {
    // Filter entries for this position
    const entries = entriesArray
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order); // Match ST's sort

    if (entries.length === 0) {
        return '';
    }

    // Process and wrap each entry individually
    const wrappedEntries = entries
        .map(entry => {
            const content = processEntryContent(entry);
            if (!content) {
                return null; // Skip empty entries
            }
            return wrapEntry(content, entry);
        })
        .filter(Boolean); // Remove nulls

    // Join individually-wrapped entries
    return wrappedEntries.join('\n');
}

/**
 * Reconstruct positions 2,3 (ANBeforeEntries/ANAfterEntries)
 * These are returned as arrays of strings
 */
function reconstructPositionArray(entriesArray, positionType) {
    const entries = entriesArray
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order);

    if (entries.length === 0) {
        return [];
    }

    return entries
        .map(entry => {
            const content = processEntryContent(entry);
            if (!content) return null;
            return wrapEntry(content, entry);
        })
        .filter(Boolean);
}

/**
 * Reconstruct position 4 (WIDepthEntries)
 * These are returned as arrays of {depth, role, entries[]}
 */
function reconstructDepthEntries(entriesArray, positionType) {
    const entries = entriesArray
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order);

    if (entries.length === 0) {
        return [];
    }

    // Group by depth and role
    const groups = new Map();

    for (const entry of entries) {
        const depth = entry.depth ?? DEFAULT_DEPTH;
        const role = entry.role ?? 0; // 0=SYSTEM, 1=USER, 2=ASSISTANT
        const key = `${depth}-${role}`;

        if (!groups.has(key)) {
            groups.set(key, {
                depth: depth,
                role: role,
                entries: []
            });
        }

        const content = processEntryContent(entry);
        if (content) {
            const wrapped = wrapEntry(content, entry);
            groups.get(key).entries.unshift(wrapped); // Match ST's unshift
        }
    }

    return Array.from(groups.values());
}

/**
 * Reconstruct positions 5,6 (EMEntries)
 * These are returned as arrays of {position, content}
 */
function reconstructEMEntries(entriesArray, positionTypes) {
    const entries = entriesArray
        .filter(e => positionTypes.includes(e.position))
        .sort((a, b) => b.order - a.order);

    if (entries.length === 0) {
        return [];
    }

    return entries
        .map(entry => {
            const content = processEntryContent(entry);
            if (!content) return null;

            return {
                position: entry.position,
                content: wrapEntry(content, entry)
            };
        })
        .filter(Boolean);
}

/**
 * Reconstruct position 7 (outletEntries)
 * These are returned as object {outletName: [entries]}
 */
function reconstructOutletEntries(entriesArray, positionType) {
    const entries = entriesArray
        .filter(e => e.position === positionType)
        .sort((a, b) => b.order - a.order);

    if (entries.length === 0) {
        return {};
    }

    // Group by outlet name
    const outlets = {};

    for (const entry of entries) {
        // TODO: Determine how ST stores outlet name in entry
        // Likely in entry.selectiveLogic or entry.outletName
        const outletName = entry.outletName || entry.selectiveLogic || 'default';

        if (!outlets[outletName]) {
            outlets[outletName] = [];
        }

        const content = processEntryContent(entry);
        if (content) {
            const wrapped = wrapEntry(content, entry);
            outlets[outletName].unshift(wrapped);
        }
    }

    return outlets;
}

/**
 * Process entry content through the SAME pipeline as SillyTavern
 * This replicates lines 4849-4850 from world-info.js
 */
function processEntryContent(entry) {
    const regexDepth = entry.position === world_info_position.atDepth ?
                       (entry.depth ?? DEFAULT_DEPTH) : null;

    const content = getRegexedString(
        entry.content,
        regex_placement.WORLD_INFO,
        { depth: regexDepth, isMarkdown: false, isPrompt: true }
    );

    return content;
}

/**
 * Wrap entry content with XML tags
 */
function wrapEntry(content, entry) {
    const name = escapeXML(entry.comment || 'Unnamed Entry');
    const uid = entry.uid;
    const world = escapeXML(entry.world || 'Unknown');

    // Format: <lorebook name="X" uid="Y">\ncontent\n</lorebook>
    return `<lorebook name="${name}" uid="${uid}">\n${content}\n</lorebook>`;
}

/**
 * Escape XML special characters to prevent injection
 */
function escapeXML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Replace global checkWorldInfo with wrapped version
// This activates the monkey-patch when this module is imported
checkWorldInfo = checkWorldInfo_wrapped;
```

---

## Testing Strategy

### Critical Test Cases (Must Pass)

1. **Multi-line entries** (THE KEY TEST)
   - Create entry with content: `"Line 1\nLine 2\nLine 3"`
   - Verify it's wrapped as ONE entry with all lines inside

2. **Multiple entries in position 0/1**
   - Create 3+ entries
   - Verify each gets its own `<lorebook>` tags
   - Verify order preservation

3. **Entries with macros**
   - Entry content: `"{{char}} is a detective"`
   - Verify macro is substituted before wrapping

4. **Entries with special XML characters**
   - Entry name: `"Alice & Bob's "Adventure""`
   - Verify attributes are escaped: `name="Alice &amp; Bob&apos;s &quot;Adventure&quot;"`

5. **All 8 position types**
   - Test each position type separately
   - Verify correct data structure returned

6. **Empty entries**
   - Entry with empty content after processing
   - Verify it's skipped (not wrapped)

### Test Procedure

```javascript
// In browser console after enabling setting:
const settings = extension_settings['auto-summarize'];
settings.profiles[settings.profile].wrap_lorebook_entries = true;

// Send a message to trigger lorebook activation
// Check the prompt sent to API (use Network tab or proxy logs)
// Verify wrapped entries are present
```

---

## Integration with First-Hop Proxy

### Current Proxy Capabilities

The first-hop proxy (Python) already has:
- ST_METADATA parsing and stripping
- Dual logging (original + stripped)
- Organized log folders by character/chat

### What Needs to Be Added

**In `/first-hop-proxy/src/first_hop_proxy/utils.py`**:

Add function to strip `<lorebook>` tags:

```python
def strip_lorebook_tags(text: str) -> str:
    """
    Strip <lorebook> wrapper tags from text.
    Pattern: <lorebook name="X" uid="Y">content</lorebook>
    Returns: content only
    """
    import re
    pattern = r'<lorebook[^>]*>\n?(.*?)\n?</lorebook>'

    # Extract content from each tag
    matches = re.finditer(pattern, text, re.DOTALL)

    # Build stripped version
    stripped_parts = []
    last_end = 0

    for match in matches:
        # Add text before this tag
        stripped_parts.append(text[last_end:match.start()])
        # Add content from inside tag
        stripped_parts.append(match.group(1))
        last_end = match.end()

    # Add remaining text after last tag
    stripped_parts.append(text[last_end:])

    return ''.join(stripped_parts)
```

**In `/first-hop-proxy/src/first_hop_proxy/main.py`**:

Call stripping function before forwarding to LLM:

```python
# After stripping ST_METADATA
request_data = strip_st_metadata(request_data)

# Also strip lorebook tags
request_data = strip_lorebook_tags(request_data)
```

**Dual Logging**:
- Log original (with `<lorebook>` tags) to organized folder
- Forward stripped version (without tags) to LLM

---

## Common Issues and Solutions

### Issue: Entries wrapped with entire block tags

**Symptom**: Single `<lorebook>` tag around all entries

**Cause**: Using block wrapping instead of individual wrapping

**Solution**: Ensure `.map()` iterates over EACH entry separately:
```javascript
entries.map(entry => wrapEntry(content, entry))  // ✅ Individual
// NOT:
wrapEntryBlock(entries.join('\n'))  // ❌ Block
```

### Issue: Multi-line entries split incorrectly

**Symptom**: Lines from same entry wrapped separately

**Cause**: Splitting concatenated string by `\n` instead of reconstructing

**Solution**: Use reconstruction from `allActivatedEntries`, NOT string splitting

### Issue: Macros not substituted in wrapped content

**Symptom**: `{{char}}` appears in wrapped content instead of character name

**Cause**: Not calling `getRegexedString` which handles macro substitution

**Solution**: Use `processEntryContent(entry)` which calls `getRegexedString`

### Issue: Order is wrong

**Symptom**: Entries appear in wrong order compared to ST

**Cause**: Not replicating ST's sort logic

**Solution**: Use `sort((a, b) => b.order - a.order)` to match ST

### Issue: XML attributes contain unescaped characters

**Symptom**: Broken XML when entry names have `&`, `<`, `>`, `"`, `'`

**Cause**: Not escaping XML special characters

**Solution**: Use `escapeXML()` function on all attribute values

---

## File Paths Reference

### Extension Files (Your Code)
- `/mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New/public/scripts/extensions/third-party/ST-Auto-Summarize/`
  - `lorebookWrapper.js` (CREATE)
  - `defaultSettings.js` (MODIFY)
  - `settings.html` (MODIFY)
  - `settingsUI.js` (MODIFY)
  - `index.js` (MODIFY)

### SillyTavern Core Files (Read Only)
- `/mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New/public/scripts/`
  - `world-info.js` (IMPORT FROM)
  - `extensions/regex/engine.js` (REFERENCED)

### Proxy Files (Will Need Updates)
- `/mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New/public/scripts/extensions/third-party/ST-Auto-Summarize/first-hop-proxy/src/first_hop_proxy/`
  - `utils.py` (ADD `strip_lorebook_tags`)
  - `main.py` (CALL stripping function)

### Documentation
- `docs/SILLYTAVERN_LOREBOOK_INJECTION.md` (REFERENCE)
- `docs/LOREBOOK_WRAPPING_IMPLEMENTATION_BRIEF.md` (THIS FILE)

---

## Summary Checklist

**Pre-Implementation**:
- [ ] Read `SILLYTAVERN_LOREBOOK_INJECTION.md` sections on reconstruction approach
- [ ] Understand the multi-line entry problem
- [ ] Confirm individual wrapping requirement

**Implementation**:
- [ ] Create `lorebookWrapper.js` with all reconstruction functions
- [ ] Add setting to `defaultSettings.js`
- [ ] Add UI checkbox to `settings.html`
- [ ] Add binding to `settingsUI.js`
- [ ] Update `index.js` with imports and re-exports
- [ ] Import wrapper module in `index.js`

**Testing**:
- [ ] Test multi-line entries (CRITICAL)
- [ ] Test multiple entries with individual wrapping
- [ ] Test all 8 position types
- [ ] Test macro substitution
- [ ] Test XML escaping
- [ ] Test order preservation

**Integration**:
- [ ] Update proxy to strip `<lorebook>` tags
- [ ] Verify dual logging (original + stripped)
- [ ] Test end-to-end: ST → Proxy → LLM

---

## Quick Start Command for Fresh Session

```
I need to implement lorebook entry wrapping for the ST-Auto-Summarize extension.

Read /docs/LOREBOOK_WRAPPING_IMPLEMENTATION_BRIEF.md for complete context.

Key requirements:
1. Wrap EACH entry individually (not as a block)
2. Use reconstruction from allActivatedEntries (solves multi-line problem)
3. Handle all 8 position types
4. Replicate ST's exact processing pipeline

Start by creating lorebookWrapper.js with the reconstruction approach.
```

---

**End of Implementation Brief**

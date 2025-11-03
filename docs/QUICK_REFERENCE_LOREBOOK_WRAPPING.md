# Quick Reference: Lorebook Entry Wrapping

**For use in fresh implementation sessions**

---

## Documentation Files

1. **`SILLYTAVERN_LOREBOOK_INJECTION.md`** - Technical deep dive
   - Lines 1343-2078: Optimal reconstruction approach section
   - Lines 1780-1836: Multi-line problem explanation with visual examples
   - Lines 1480-1760: Complete implementation strategy with code

2. **`LOREBOOK_WRAPPING_IMPLEMENTATION_BRIEF.md`** - Implementation guide (THIS SESSION'S OUTPUT)
   - Complete code template for `lorebookWrapper.js`
   - File modification checklist
   - Testing strategy
   - Proxy integration details

---

## Critical Requirement

**INDIVIDUAL WRAPPING ONLY** - Each entry gets its own `<lorebook>` tags:

```xml
✅ CORRECT:
<lorebook name="Entry1" uid="123">content1</lorebook>
<lorebook name="Entry2" uid="456">content2</lorebook>

❌ WRONG:
<lorebook>content1\ncontent2</lorebook>
```

---

## The Solution (One-Sentence Summary)

Monkey-patch `checkWorldInfo` to reconstruct wrapped strings from `result.allActivatedEntries` by processing each entry through `getRegexedString` and wrapping individually before rejoining.

---

## Key SillyTavern Functions to Import

```javascript
import {
    checkWorldInfo,        // /public/scripts/world-info.js:4728-4927
    getRegexedString,      // Called at line 4850 for content processing
    world_info_position,   // Enum, lines 815-824
    regex_placement,       // Used in getRegexedString call
    DEFAULT_DEPTH,         // Default depth for position 4
    get_settings           // Access extension settings
} from './index.js';
```

---

## Critical Processing Pipeline (Must Replicate)

```javascript
// From world-info.js:4849-4850
const regexDepth = entry.position === world_info_position.atDepth ?
                   (entry.depth ?? DEFAULT_DEPTH) : null;

const content = getRegexedString(
    entry.content,
    regex_placement.WORLD_INFO,
    { depth: regexDepth, isMarkdown: false, isPrompt: true }
);
```

This handles:
- Macro substitution (`{{char}}`, `{{user}}`)
- Regex transformations
- All content processing ST does

---

## Critical Sorting (Must Replicate)

```javascript
// From world-info.js:4848
entries.sort((a, b) => b.order - a.order);  // Higher order first
```

---

## Position Type Data Structures

| Position | Type | Return Structure |
|----------|------|-----------------|
| 0, 1 | `before`, `after` | String (concatenated) |
| 2, 3 | `ANTop`, `ANBottom` | Array of strings |
| 4 | `atDepth` | Array of `{depth, role, entries[]}` |
| 5, 6 | `EMTop`, `EMBottom` | Array of `{position, content}` |
| 7 | `outlet` | Object `{outletName: [entries]}` |

---

## Files to Create/Modify

**CREATE**:
- `lorebookWrapper.js` - Main implementation (~250-300 lines)

**MODIFY**:
- `defaultSettings.js` - Add `wrap_lorebook_entries: false`
- `settings.html` - Add checkbox (after line 64)
- `settingsUI.js` - Add binding (after line 75)
- `index.js` - Import/re-export ST functions + import wrapper module

---

## Implementation Checklist

1. Create `lorebookWrapper.js`:
   - [ ] `reconstructWithWrapping()` - Main coordinator
   - [ ] `reconstructPositionString()` - Positions 0,1
   - [ ] `reconstructPositionArray()` - Positions 2,3
   - [ ] `reconstructDepthEntries()` - Position 4
   - [ ] `reconstructEMEntries()` - Positions 5,6
   - [ ] `reconstructOutletEntries()` - Position 7
   - [ ] `processEntryContent()` - Replicate ST's processing
   - [ ] `wrapEntry()` - Format wrapper tags
   - [ ] `escapeXML()` - Escape special characters
   - [ ] Monkey-patch `checkWorldInfo`

2. Add setting

3. Add UI

4. Update index.js

5. Test multi-line entries (CRITICAL)

6. Test all position types

---

## Testing Commands

```javascript
// Enable in console
extension_settings['auto-summarize'].profiles[
    extension_settings['auto-summarize'].profile
].wrap_lorebook_entries = true;

// Trigger lorebook activation (send message)
// Check Network tab or proxy logs for wrapped entries
```

---

## Example Output (What Success Looks Like)

**Input (3 entries, one multi-line)**:
```
Entry 1: "Alice is a detective.\nShe works in the foggy city."
Entry 2: "The city is always foggy."
Entry 3: "Crime is rising."
```

**Expected Output**:
```xml
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
```

**NOT**:
```xml
<lorebook>
Alice is a detective.
She works in the foggy city.
The city is always foggy.
Crime is rising.
</lorebook>
```

---

## Common Pitfalls

1. ❌ **Splitting concatenated strings by `\n`** → Multi-line entries break
   ✅ Reconstruct from `allActivatedEntries`

2. ❌ **Block wrapping** → All entries in one tag
   ✅ Individual wrapping with `.map()`

3. ❌ **Not calling `getRegexedString`** → Macros not substituted
   ✅ Use `processEntryContent(entry)`

4. ❌ **Wrong sort order** → Entries in wrong order
   ✅ Use `sort((a, b) => b.order - a.order)`

5. ❌ **Unescaped XML** → Broken tags with special characters
   ✅ Use `escapeXML()` on attributes

---

## Quick Start Command for Fresh Session

```
Implement lorebook entry wrapping for ST-Auto-Summarize extension.

Context in:
- /docs/LOREBOOK_WRAPPING_IMPLEMENTATION_BRIEF.md (full guide)
- /docs/SILLYTAVERN_LOREBOOK_INJECTION.md (technical reference)

Requirements:
- Individual wrapping (each entry gets own tags)
- Reconstruction from allActivatedEntries (solves multi-line problem)
- All 8 position types
- Replicate ST's processing pipeline exactly

Start with lorebookWrapper.js using the reconstruction approach.
```

---

## File Paths (Absolute)

**Extension root**:
`/mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New/public/scripts/extensions/third-party/ST-Auto-Summarize/`

**Files to modify**:
- `defaultSettings.js`
- `settings.html`
- `settingsUI.js`
- `index.js`
- `lorebookWrapper.js` (create)

**SillyTavern core (read-only)**:
`/mnt/c/Users/sarah/OneDrive/Desktop/personal/SillyTavern-New/public/scripts/world-info.js`

**Documentation**:
- `docs/SILLYTAVERN_LOREBOOK_INJECTION.md`
- `docs/LOREBOOK_WRAPPING_IMPLEMENTATION_BRIEF.md`
- `docs/QUICK_REFERENCE_LOREBOOK_WRAPPING.md` (this file)

---

## Time Estimates

- Implementation: 4-6 hours
- Testing: 2-3 hours
- Total: 6-9 hours

**Start with**: Multi-line entry test case (the critical requirement)

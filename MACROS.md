# Macro System Documentation

**Auto-generated from macro files in `macros/` folder**
**DO NOT EDIT MANUALLY - run `npm run generate-macro-docs` to regenerate**

## Overview

This document describes all available macros in the system. Macros are template variables that get substituted into prompts using the `{{macro_name}}` syntax.

Each macro:
- Is self-contained with zero dependencies
- Takes pre-processed data as input
- Returns a formatted string for prompt substitution
- Is automatically registered when added to the `macros/` folder

## Total Macros: 18


## Scene Recap (6 macros)

### `{{active_setting_lore}}`

**Function signature:** `build(entries)`

**Input:** Takes array of lorebook entry objects

**Output format:**
```
XML-style tags: <setting_lore name="X" uid="Y" keys="Z">\
content\
</setting_lore> joined by \
\

```

**Used by:** scene-recap.js

---

### `{{current_running_recap}}`

**Function signature:** `build(content)`

**Input:** runningSceneRecap.js get_current_running_recap_content()

**Output format:**
```
Markdown text with ## headers (Current Situation, Key Developments, etc.) or empty string
```

**Used by:** running-scene-recap.js (conditionally included via {{#if}})

---

### `{{lorebook_entry_types}}`

**Function signature:** `build(typeDefinitions)`

**Input:** entityTypes.js formatEntityTypeListForPrompt()

**Output format:**
```
String "character, location, item, faction, quest, rule, lore"
```

**Used by:** scene-recap.js, lorebook-entry-lookup.js, lorebook-entry-deduplicate.js, lorebook-bulk-populate.js

---

### `{{message}}`

**Function signature:** `build(sceneObjects)`

**Input:** sceneBreak.js prepareScenePrompt()

**Output format:**
```
JSON array of message objects with {type, index, name, text, is_user, recap}
```

**Used by:** scene-recap.js (backward compatibility)

---

### `{{scene_messages}}`

**Function signature:** `build(sceneObjects)`

**Input:** Takes array of scene objects with {type, is_user, name, text, recap}

**Output format:**
```
Multi-line string with "[USER: name]\
text" or "[RECAP]\
text" blocks joined by \
\

```

**Used by:** scene-recap.js

---

### `{{scene_recaps}}`

**Function signature:** `build(sceneDataArray)`

**Input:** Takes array of {name, recap} objects

**Output format:**
```
Multi-line string "[Scene N: name]\
recap text" blocks joined by \
\

```

**Used by:** running-scene-recap.js

---


## Scene Break Detection (3 macros)

### `{{earliest_allowed_break}}`

**Function signature:** `build(value)`

**Input:** autoSceneBreakDetection.js (calculated from minimumSceneLength)

**Output format:**
```
String representation of integer message index
```

**Used by:** auto-scene-break-detection.js, auto-scene-break-forced.js

---

### `{{messages}}`

**Function signature:** `build(formattedMessages)`

**Input:** autoSceneBreakDetection.js buildPromptFromTemplate()

**Output format:**
```
Multi-line string with numbered messages: "1. [USER: name]\
text\
\
2. [CHARACTER: name]\
text"
```

**Used by:** auto-scene-break-detection.js, auto-scene-break-forced.js

---

### `{{minimum_scene_length}}`

**Function signature:** `build(value)`

**Input:** autoSceneBreakDetection.js (from settings)

**Output format:**
```
String representation of integer
```

**Used by:** auto-scene-break-detection.js

---


## Lorebook Processing (8 macros)

### `{{candidate_entries}}`

**Function signature:** `build(entries)`

**Input:** recapToLorebookProcessor.js (fetches full entries from lorebook)

**Output format:**
```
JSON array of entry objects with full content field
```

**Used by:** lorebook-entry-deduplicate.js

---

### `{{candidate_registry}}`

**Function signature:** `build(registryListing)`

**Input:** recapToLorebookProcessor.js (builds from registry state)

**Output format:**
```
Plain text listing "- [uid] Name (type) - Synopsis\
  Aliases: alias1, alias2"
```

**Used by:** lorebook-entry-lookup.js

---

### `{{entry_name}}`

**Function signature:** `build(entryName)`

**Input:** lorebookEntryMerger.js (from entry.comment or entry name)

**Output format:**
```
Plain text string
```

**Used by:** lorebook-recap-merge.js

---

### `{{existing_content}}`

**Function signature:** `build(content)`

**Input:** lorebookEntryMerger.js (from existing lorebook entry)

**Output format:**
```
Plain text content of lorebook entry
```

**Used by:** lorebook-recap-merge.js

---

### `{{lorebook_entry_lookup_synopsis}}`

**Function signature:** `build(synopsis)`

**Input:** recapToLorebookProcessor.js (from Stage 1 LLM response)

**Output format:**
```
Plain text, one-line string (≤15 words)
```

**Used by:** lorebook-entry-deduplicate.js

---

### `{{new_content}}`

**Function signature:** `build(content)`

**Input:** lorebookEntryMerger.js (from scene recap)

**Output format:**
```
Plain text content to merge
```

**Used by:** lorebook-recap-merge.js

---

### `{{new_entries}}`

**Function signature:** `build(entriesArray)`

**Input:** recapToLorebookProcessor.js (bulk population)

**Output format:**
```
JSON array of entry objects
```

**Used by:** lorebook-bulk-populate.js

---

### `{{new_entry}}`

**Function signature:** `build(payload)`

**Input:** recapToLorebookProcessor.js buildNewEntryPayload()

**Output format:**
```
JSON object {name, type, keywords, secondaryKeys, content, comment}
```

**Used by:** lorebook-entry-lookup.js, lorebook-entry-deduplicate.js

---


## General (1 macros)

### `{{prefill}}`

**Function signature:** `build(prefillText)`

**Input:** Operation config (from artifact.prefill)

**Output format:**
```
Plain text string to prefill LLM response
```

**Used by:** All operations (optional)

---


## Quick Reference Table

| Macro Name | Input | Used By |
|------------|-------|----------|
| `active_setting_lore` | Takes array of lorebook entry objects | scene-recap.js |
| `candidate_entries` | recapToLorebookProcessor.js (fetches full entri... | lorebook-entry-deduplicate.js |
| `candidate_registry` | recapToLorebookProcessor.js (builds from regist... | lorebook-entry-lookup.js |
| `current_running_recap` | runningSceneRecap.js get_current_running_recap_... | running-scene-recap.js (conditionally included via {{#if}}) |
| `earliest_allowed_break` | autoSceneBreakDetection.js (calculated from min... | auto-scene-break-detection.js, auto-scene-break-forced.js |
| `entry_name` | lorebookEntryMerger.js (from entry.comment or e... | lorebook-recap-merge.js |
| `existing_content` | lorebookEntryMerger.js (from existing lorebook ... | lorebook-recap-merge.js |
| `lorebook_entry_lookup_synopsis` | recapToLorebookProcessor.js (from Stage 1 LLM r... | lorebook-entry-deduplicate.js |
| `lorebook_entry_types` | entityTypes.js formatEntityTypeListForPrompt() | scene-recap.js, lorebook-entry-lookup.js, lorebook-entry-deduplicate.js, lorebook-bulk-populate.js |
| `message` | sceneBreak.js prepareScenePrompt() | scene-recap.js (backward compatibility) |
| `messages` | autoSceneBreakDetection.js buildPromptFromTempl... | auto-scene-break-detection.js, auto-scene-break-forced.js |
| `minimum_scene_length` | autoSceneBreakDetection.js (from settings) | auto-scene-break-detection.js |
| `new_content` | lorebookEntryMerger.js (from scene recap) | lorebook-recap-merge.js |
| `new_entries` | recapToLorebookProcessor.js (bulk population) | lorebook-bulk-populate.js |
| `new_entry` | recapToLorebookProcessor.js buildNewEntryPayload() | lorebook-entry-lookup.js, lorebook-entry-deduplicate.js |
| `prefill` | Operation config (from artifact.prefill) | All operations (optional) |
| `scene_messages` | Takes array of scene objects with {type, is_use... | scene-recap.js |
| `scene_recaps` | Takes array of {name, recap} objects | running-scene-recap.js |


## Adding New Macros

1. Create a new file in `macros/` folder: `macros/your_macro.js`
2. Export `name`, `build()` function, and `description` object
3. Run `npm run generate-macros` to register it
4. Run `npm run generate-macro-docs` to update this documentation
5. Both commands run automatically on git pre-commit

**Example macro file:**
```javascript
export const name = 'my_macro';

export function build(inputData) {
  // Your transformation logic here
  return String(inputData);
}

export const description = {
  format: 'Plain text string',
  source: 'Takes a string or number',
  usedBy: ['your-operation.js']
};
```

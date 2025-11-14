# Lorebook Entry Deduplication - Overview

## What is Lorebook Entry Deduplication?

Lorebook Entry Deduplication is the **second stage** of the Auto-Lorebooks duplicate detection pipeline. After the first stage (Lorebook Entry Lookup) identifies entities that **might** be duplicates, this stage performs an LLM-powered **deep comparison** of the full entry content to make the final decision: merge with an existing entry or create a new one.

This is the critical decision point that prevents duplicate entities from cluttering your lorebook while ensuring distinct entities are properly separated.

## Key Capabilities

- **Deep Content Comparison**: LLM analyzes full entry content, not just names and keywords
- **Semantic Understanding**: Detects when entities are the same despite different wording
- **Context-Aware Decisions**: Considers aliases, synopsis, and relationships
- **Merge vs Create**: Returns `resolvedUid` (merge target) or `null` (create new)
- **Synopsis Refinement**: Updates or generates synopsis during resolution
- **Configurable Prompting**: Customizable prompt template and prefill
- **Connection Profile Support**: Uses separate profile/preset for deduplication calls
- **Queue Integration**: Executes as `RESOLVE_LOREBOOK_ENTRY` operation

## Architecture Summary

```
Lorebook Entry Lookup Stage
  └─ Multiple candidates found (needsFullContextUids > 0)
       │
       ▼
  runLorebookEntryDeduplicateStage()
       │
       ├─ Build prompt with candidate entry details
       ├─ Call LLM via sendLLMRequest()
       └─ Parse JSON response {resolvedUid, synopsis}
            │
            ├─ resolvedUid != null → MERGE with existing entry
            └─ resolvedUid == null → CREATE new entry
```

The deduplication stage sits between lookup and merge/create:

```
Entry → Lookup (fast) → Deduplicate (deep) → Merge/Create (final)
```

## Quick Reference

### Primary Entry Point

**Invoked by**: `operationHandlers.js:559` - `RESOLVE_LOREBOOK_ENTRY` operation handler

**When triggered**: Lorebook Entry Lookup returns `needsFullContextUids.length > 0`

### Core Function

- `runLorebookEntryDeduplicateStage(normalizedEntry, lorebookEntryLookupSynopsis, candidateEntries, singleType, settings)` - Performs LLM-based deduplication

### Helper Functions

- `shouldRunLorebookEntryDeduplicate(candidateEntries, settings)` - Validates prompt and candidates
- `buildLorebookEntryDeduplicatePrompt(...)` - Constructs prompt with candidate data
- `executeLorebookEntryDeduplicateLLMCall(prompt, settings, entryComment)` - Sends LLM request
- `parseLorebookEntryDeduplicateResponse(response, fallbackSynopsis)` - Parses JSON response

### Data Storage

**Input**: `chat_metadata.autoLorebooks.pendingOps[entryId]`
- `entryData` - New entry to process
- `lorebookEntryLookupResult` - Results from lookup stage

**Output**: `chat_metadata.autoLorebooks.pendingOps[entryId]`
- `lorebookEntryDeduplicateResult` - `{resolvedUid, synopsis}`
- `stage` - Updated to `'lorebook_entry_deduplicate_complete'`

### Key Settings

- `auto_lorebooks_recap_lorebook_entry_deduplicate_prompt` - Prompt template
- `auto_lorebooks_recap_lorebook_entry_deduplicate_prefill` - Optional prefill text
- `auto_lorebooks_recap_lorebook_entry_deduplicate_connection_profile` - Profile UUID
- `auto_lorebooks_recap_lorebook_entry_deduplicate_completion_preset` - Preset name
- `auto_lorebooks_recap_lorebook_entry_deduplicate_include_preset_prompts` - Include preset messages

## Documentation Structure

This documentation is organized into three files:

### 1. [overview.md](overview.md) (This File)

High-level summary, quick reference, and navigation hub.

### 2. [implementation.md](implementation.md)

**Comprehensive technical reference**:
- Architecture diagrams
- Source file inventory with line counts
- Complete function signatures with parameters, returns, errors
- Data structures and response formats
- Integration points with pipeline stages
- Settings reference tables
- Prompt template structure
- Edge case handling
- Debugging guide
- Code examples

**Read this when**: You need detailed technical information, function signatures, or implementation guidance.

### 3. [data-flow.md](data-flow.md)

**Complete execution flow traces**:
- Entry point scenarios (lookup → deduplicate → merge/create)
- Step-by-step execution with file:line references
- Code snippets showing actual implementation
- Data transformations at each phase
- Error handling flows
- Alternative execution paths
- State changes throughout lifecycle

**Read this when**: You need to understand how deduplication works end-to-end or debug execution issues.

## Common Use Cases

### Scenario 1: AI Identifies Exact Match

```javascript
// Lookup stage found 3 candidates:
// - uid "42" (character-Aelwyn)
// - uid "83" (character-Aelwyn Silverleaf)
// - uid "91" (character-Ael)

// Deduplicate stage response:
{
  "resolvedUid": "42",  // Merge with first entry
  "synopsis": "Elven ranger from Silverwood, skilled archer"
}

// Result: New entry merged into uid 42
```

### Scenario 2: AI Identifies No Match

```javascript
// Lookup stage found 2 candidates:
// - uid "42" (character-Aelwyn)
// - uid "55" (character-Aelric)

// Deduplicate stage response:
{
  "resolvedUid": null,  // No match, create new
  "synopsis": "Human merchant from Stonehaven"
}

// Result: New entry created as uid 96
```

### Scenario 3: Prompt Missing (Error)

```javascript
// Settings check fails:
if (!settings.lorebook_entry_deduplicate_prompt) {
  // Throws error with diagnostic message
  throw new Error(
    'Auto-Lorebooks configuration error: lorebook_entry_deduplicate_prompt ' +
    'is required when duplicate candidates exist, but it is missing. ' +
    'Found 3 candidate(s) that need deduplication.'
  );
}

// Shows toast notification
// Halts lorebook processing
```

### Scenario 4: Special UID Values

```javascript
// AI can return special values:
{
  "resolvedUid": "new",    // Treated as null (create new)
  "synopsis": "..."
}

{
  "resolvedUid": "none",   // Treated as null (create new)
  "synopsis": "..."
}

{
  "resolvedUid": "null",   // Treated as null (create new)
  "synopsis": "..."
}
```

## Related Features

- **[Lorebook Entry Lookup](../lorebook-entry-lookup/)** - First stage: fast candidate identification
- **[Lorebook Entry Merger](../lorebook-entry-merger/)** - Merges content when resolvedUid != null
- **[Entity Registry](../entity-registry/)** - Maintains entity index for lookup
- **[Operation Queue](../../operation-queue/)** - Async operation management
- **[Connection Profiles](../../profile-configuration/)** - Profile-based LLM routing

## Pipeline Stage Transitions

```
Stage 1: LOREBOOK_ENTRY_LOOKUP
├─ sameEntityUids.length == 1
│  └─ Skip deduplicate, go directly to MERGE
│
├─ needsFullContextUids.length > 0
│  └─ Queue RESOLVE_LOREBOOK_ENTRY (this stage)
│       │
│       ├─ resolvedUid != null → Queue CREATE_LOREBOOK_ENTRY (action: merge)
│       └─ resolvedUid == null → Queue CREATE_LOREBOOK_ENTRY (action: create)
│
└─ No candidates
   └─ Queue CREATE_LOREBOOK_ENTRY (action: create)
```

## Historical Note

This deduplication stage was introduced as part of the Auto-Lorebooks feature to handle the challenging problem of duplicate detection in complex narrative contexts. The two-stage approach (fast lookup + deep deduplicate) balances performance with accuracy:

- **Lookup stage**: Fast, keyword-based filtering (registry index)
- **Deduplicate stage**: Slow, content-based analysis (LLM call)

This design minimizes expensive LLM calls while ensuring accurate duplicate detection.

## Quick Start for Developers

```javascript
// Import deduplication function
import { runLorebookEntryDeduplicateStage } from './recapToLorebookProcessor.js';

// Prepare inputs
const normalizedEntry = {
  comment: "character-Aelwyn",
  content: "- Identity: Character — Aelwyn\n- Synopsis: Elven ranger...",
  keys: ["aelwyn", "ael"],
  secondaryKeys: [],
  type: "character"
};

const lorebookEntryLookupSynopsis = "Elven ranger from Silverwood";

const candidateEntries = [
  {
    uid: "42",
    comment: "character-Aelwyn",
    content: "- Identity: Character — Aelwyn\n- Synopsis: Forest elf...",
    keys: ["aelwyn"],
    secondaryKeys: [],
    aliases: ["Ael", "Silver"],
    synopsis: "Forest elf warrior"
  },
  {
    uid: "83",
    comment: "character-Aelric",
    content: "- Identity: Character — Aelric\n- Synopsis: Human knight...",
    keys: ["aelric"],
    secondaryKeys: [],
    aliases: ["Sir Aelric"],
    synopsis: "Human knight"
  }
];

const settings = {
  lorebook_entry_deduplicate_prompt: "...",
  lorebook_entry_deduplicate_prefill: "",
  lorebook_entry_deduplicate_connection_profile: "uuid-profile",
  lorebook_entry_deduplicate_completion_preset: "claude-opus",
  lorebook_entry_deduplicate_include_preset_prompts: false
};

// Run deduplication
const result = await runLorebookEntryDeduplicateStage(
  normalizedEntry,
  lorebookEntryLookupSynopsis,
  candidateEntries,
  "character",
  settings
);

// Result: { resolvedUid: "42", synopsis: "Elven ranger from Silverwood" }
```

## Documentation Completeness

✅ **Fully Documented**:
- Architecture and data flow
- All public functions with signatures
- Data structures and response format
- Integration points with pipeline
- Settings and configuration
- Prompt template structure
- Error handling and edge cases
- Code examples

This documentation provides complete coverage of the lorebook entry deduplication feature from high-level concepts to low-level implementation details.

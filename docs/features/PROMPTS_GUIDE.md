# Prompts Reference Guide

This document contains all LLM prompts used by the ST-Auto-Recap extension, organized in the order they typically execute during operation.

---

## 1. Scene Break Detection

**Prompt Name:** `auto_scene_break_detection_prompt`

**When It Runs:** On each new message (if auto-detection is enabled). Determines if the current message starts a new scene.

**What It Does:** Analyzes the previous messages and current message to decide if a scene break should occur. Looks for location changes, time skips, POV switches, new objectives, or explicit separators.

**Macros Used:**
- `{{previous_message}}` - Previous N messages for context (default: 3 messages)
- `{{current_message}}` - The current message being evaluated

**Expected Output:** JSON with status (true/false) and rationale
```json
{
  "status": true,
  "rationale": "Quote the key cue that triggered your decision"
}
```

**Full Prompt:**
```
You are segmenting a roleplay transcript into scene-sized chunks (short, chapter-like story beats). Determine whether the CURRENT message begins a new scene relative to the PREVIOUS message. A scene break means the prior beat resolved and the story now shifts focus.

Scene break if the current message clearly does at least one of:
- Moves to a new location or setting.
- Skips time with explicit cues ("Later...", "The next morning...", timestamps).
- Switches primary characters or point of view to a different group.
- Starts a new objective or major conflict after the previous one concluded.
- Includes explicit separators or OOC markers ("---", "Scene Break", "Chapter 3", GM notes resetting play).

Do NOT mark a break when:
- The current line is a reaction, continuation, or escalation of the same exchange.
- Minor topic shifts happen within the same setting, participants, and timeframe.
- The message is meta chatter that does not advance the narrative.

Decision process:
1. Check for explicit separators or time/scene headers and mark a break if present.
2. Otherwise compare setting, time, cast, and objective; mark a break only if there is a clear change.
3. If evidence is ambiguous, treat it as a continuation (status false).

Previous messages (oldest to newest):
{{previous_message}}

Current message:
{{current_message}}

Return ONLY valid JSON:
{
  "status": true or false,
  "rationale": "Quote the key cue that triggered your decision"
}
```

---

## 2. Scene Recap

**Prompt Name:** `scene_recap_prompt`

**When It Runs:** At scene breaks (manual or auto-detected). Generates a comprehensive recap of the scene.

**What It Does:** Creates a structured markdown recap with specific headers, plus optional lorebook entries for entities introduced or updated in the scene. Uses JSON format to separate timeline (recap) from entity knowledge (lorebooks).

**Macros Used:**
- `{{scene_messages}}` - Formatted messages from the scene (includes [USER: name] / [CHARACTER: name] labels and any existing recaps)
- `{{lorebook_entry_types}}` - Dynamically inserted list of allowed entity types (character, location, item, faction, quest, rule)

**Expected Output:** JSON with recap (markdown) and lorebooks (array)
```json
{
  "recap": "## Current Situation\n...\n## Key Developments\n...\n## Dialogue Highlights\n...\n## Pending Threads\n...",
  "lorebooks": [
    {
      "name": "Entity Name",
      "type": "character",
      "keywords": ["keyword1", "keyword2"],
      "content": "[character-EntityName: property1, property2, nested(details)]"
    }
  ]
}
```

**Full Prompt:**
```
// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Produce a SCENE RECAP in the JSON schema below, keeping events and long-term lore separate.
//
// ⚠️ CRITICAL: USE ONLY THE SCENE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
// - If the scene does not state a fact, it does not exist
// - Do not invent motives, emotions, or extrapolated outcomes
// - Franchise names: ignore canon outside this transcript
//
// RECAP field (markdown recap):
// - Structure exactly in this order with markdown headers:
//   ## Current Situation  -> Where the scene ends, who is present, unresolved stakes
//   ## Key Developments   -> Bullet each significant change or result from this scene
//   ## Dialogue Highlights -> Short quotes or paraphrases that lock in promises, threats, revelations
//   ## Pending Threads     -> Goals, deadlines, secrets, obligations that carry forward
// - One bullet per fact. Keep wording factual and specific (locations, items, explicit actions).
// - Only record lasting information or immediate consequences. Skip blow-by-blow narration.
// - Reference characters by name, but do NOT restate traits, backstory, or attitudes that belong in lorebooks.
// - You may quote brief lines (max one sentence) only when they establish canon the future scene must respect.
//
// LOREBOOKS array (persistent knowledge targets):
// - Leave empty unless this scene introduced durable information that must live in a lore entry.
// - Each object updates a SINGLE concrete entity (character, location, item, faction, quest, rule) or introduces a brand-new one.
// - Set the "name" field to the entity's canonical name. Never mint a standalone trait or detail entry.
//
// ⚠️ CRITICAL: ONLY THE "content" FIELD IS INJECTED INTO THE AI'S CONTEXT ⚠️
// - The "name", "type", and "keywords" fields are ONLY for indexing/triggering the entry
// - The AI will NEVER see those fields during roleplay - it ONLY sees the "content" text
// - Therefore, content MUST be completely self-contained with ALL necessary context
// - Content MUST identify the entity (use [type-EntityName: ...] format so AI knows what this is about)
// - Content MUST use specific names for relationships (not "the protagonist", "her friend", "his ally")
// - Content MUST be specific about referenced items, places, events (not "the sword", but "Sunblade sword")
//
// - Content MUST stay in valid PList format: [type-EntityName: property, property(detail), ...] with at most two nesting levels.
// - CRITICAL: Start content with lowercase type + hyphen + entity name (e.g., [character-Alice: ...], [location-Tavern: ...]).
// - Add only facts that are new or changed versus what the lorebook would already contain. If unsure, omit them.
// - Keywords: 2-4 lowercase triggers tied to that entity (names, distinctive identifiers). Avoid generic terms.
// - Type must be one of: {{lorebook_entry_types}}.
// - Optional secondaryKeys are allowed for AND disambiguation when needed.
// - If a detail belongs here, also mention the entity inside the recap so scene context stays coherent.
//
// Writing discipline:
// - Neutral tone, modern prose. Avoid repetitive sentence starters ("Despite", "Although").
// - Focus on outcomes and current state; do not speculate about feelings or motivations.
// - When a fact already exists in the lorebook, avoid repeating it in lorebook output unless the scene changes it.
//
// CONTENT SPECIFICITY EXAMPLES:
// ❌ BAD: [character-Sarah: works for him, knows about it, gave her the information]
// ✅ GOOD: [character-Sarah: works for(Marcus at Riverside Tavern), knows(Shadow Guild infiltration plan), gave information to(Alice)]
//
// ❌ BAD: [item-Amulet: powerful artifact, currently with the protagonist, can do magic]
// ✅ GOOD: [item-Amulet: powerful artifact, current owner({{user}}), abilities(protection from fire, detects nearby magic)]
//
// ❌ BAD: [location-Castle: under attack, they are defending, he is leading]
// ✅ GOOD: [location-Castle: under attack by(Shadow Guild forces), defenders(Royal Guard, {{user}}), commander(Captain Marcus)]
//
// OUTPUT FORMAT:
// - Output ONLY valid JSON, no text before or after
// - Recap is required
// - Lorebooks array is optional (empty array if no new entities)

{
  "recap": "",
  "lorebooks": []
}

// Scene Content:
// Messages are formatted as:
// [USER: name] or [CHARACTER: name]
// message text
//
// [RECAP] (if any)
// recap text

{{scene_messages}}
```

---

## 3. Running Scene Recap

**Prompt Name:** `running_scene_recap_prompt`

**When It Runs:** When new scene recaps are created (if auto-generate is enabled). Merges the latest scene recap into the existing running narrative.

**What It Does:** Updates the running recap by integrating the newest scene recap. Maintains the same markdown structure as scene recaps. Resolves conflicts in favor of the newest information and removes outdated bullets.

**Macros Used:**
- `{{current_running_recap}}` - Existing running recap (conditionally included, may be empty on first run)
- `{{scene_recaps}}` - New scene recap to merge in

**Expected Output:** Updated markdown recap with same header structure
```markdown
## Current Situation
- bullet points

## Key Developments
- bullet points

## Dialogue Highlights
- bullet points

## Pending Threads
- bullet points
```

**Full Prompt:**
```
// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Update the RUNNING RECAP by merging the latest scene recap into the existing record.
// This replaces chat history, so preserve all nuance required for future scenes.
//
// ⚠️ CRITICAL: USE ONLY THE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
// - Omit anything not present in the provided recaps
// - Never invent motives, emotions, or unseen context
//
// TARGET STRUCTURE (markdown recap):
// Maintain the same headers and bullet discipline as the scene recap output. Update or append bullets as needed.
//   ## Current Situation  -> Active locations, who is present, unresolved stakes
//   ## Key Developments   -> Durable outcomes and plot shifts (replace outdated bullets)
//   ## Dialogue Highlights -> Quotes or paraphrases that continue to matter
//   ## Pending Threads     -> Goals, timers, secrets, obligations in play
//
// MERGE RULES:
// - Start from the existing running recap and edit it; do not rewrite from scratch unless necessary.
// - Carry forward every still-relevant fact. If something is resolved or superseded, note the change and remove the stale bullet.
// - Integrate the new scene recap line-by-line, combining or updating bullets rather than duplicating them.
// - Reference characters by canonical name; keep descriptive nuance inside lorebook entries, not as standalone bullets.
// - When the new recap introduces lasting character or world detail, assume the scene recap already emitted a lorebook update—just reference the entity here.
// - Avoid chronological narration. Focus on the state of the world after this merge.
// - Keep wording concise and specific (locations, items, promises) so another writer can resume play instantly.
// - Allow short direct quotes only inside Dialogue Highlights when they set canon.
//
// QUALITY CHECK BEFORE RESPONDING:
// - Every open thread, obligation, or secret mentioned in any recap still appears.
// - No bullet restates personality traits or backstory that belongs in lorebooks.
// - Conflicting facts are resolved in favor of the newest scene, with the current state stated clearly.
// - Sections remain in the prescribed order with markdown headers and bullet lists.
//
{{#if current_running_recap}}
// CURRENT RUNNING RECAP (edit in place):
{{current_running_recap}}

{{/if}}
// NEW SCENE RECAP TO MERGE:
{{scene_recaps}}
```

---

## 4. Lorebook Entry Lookup

**Prompt Name:** `auto_lorebook_entry_lookup_prompt`

**When It Runs:** During lorebook processing (Stage 1). When scene recaps generate new lorebook entries, this prompt matches them against the existing registry to find duplicates.

**What It Does:** First-pass deduplication. Determines the correct entity type, validates format, and identifies potential duplicate entries by comparing against a registry listing (id, name, aliases, synopsis). Creates a short synopsis for the entry.

**Macros Used:**
- `{{new_entry}}` - New entry candidate formatted as JSON (name, type, keywords, content)
- `{{candidate_registry}}` - Concise registry listing for existing entries of same type (id, name, aliases, synopsis only)
- `{{lorebook_entry_types}}` - Allowed entity types

**Expected Output:** JSON with type, synopsis, and arrays of matching entity IDs
```json
{
  "type": "character",
  "synopsis": "short one-line recap",
  "sameEntityIds": ["entity_123"],
  "needsFullContextIds": ["entity_456"]
}
```

**Full Prompt:**
```
You are the Auto-Lorebooks registry entry lookup assistant for SillyTavern.

Known lorebook entry types: {{lorebook_entry_types}}

You will be given:
- A NEW entry candidate formatted as JSON
- A concise REGISTRY listing for all existing entries of the same type (id, name, aliases, synopsis)

New entry candidate:
{{new_entry}}

Registry listing:
{{candidate_registry}}

Tasks:
1. Decide which entry type best fits the new entry. The type MUST be one of the allowed list above.
2. Confirm the candidate represents ONE concrete entity. Its 'name' should already be that entity's canonical name.
3. Validate the content is proper PList (single bracketed entry starting with [type-EntityName: ..., comma-separated properties, max two nesting levels, no prose).
4. Validate content uses specific names/references (not pronouns like "him", "her", "it", or vague terms like "the protagonist").
5. Compare the candidate against the registry listing and identify any entries that already cover this entity.
6. Place confident matches in 'sameEntityIds'. If you need more detail before deciding, list those IDs in 'needsFullContextIds'.
7. Craft a one-line synopsis (<=15 words) that reflects the candidate's newest or most important information.

Return ONLY a JSON object in this exact shape:
{
  "type": "<one of the allowed types>",
  "synopsis": "<short one-line recap>",
  "sameEntityIds": ["entity_id_1"],
  "needsFullContextIds": ["entity_id_2"]
}

Rules:
- 'sameEntityIds' and 'needsFullContextIds' must be arrays. Use [] when empty.
- Never invent IDs; only use IDs from the registry listing.
- Always align the candidate with an existing entity when the canonical name already appears in the registry.
- Only leave both arrays empty when you are confident the entity is brand new.
- Even if the candidate repeats known facts, still align it with the correct entity; the merge stage will handle deduplication.
- Output STRICT JSON with double quotes and no commentary.
```

---

## 5. Lorebook Entry Resolution

**Prompt Name:** `auto_lorebook_entry_deduplicate_prompt`

**When It Runs:** During lorebook processing (Stage 2). When Stage 1 (Lookup) flagged uncertain matches (`needsFullContextIds`), this prompt makes the final decision with full content context.

**What It Does:** Second-pass deduplication with complete information. Receives the full content of candidate matches and decides definitively whether the new entry matches an existing entity or should be created as new. Updates the synopsis.

**Macros Used:**
- `{{new_entry}}` - New entry candidate JSON
- `{{lorebook_entry_lookup_synopsis}}` - Synopsis created in Stage 1
- `{{candidate_entries}}` - Full content of candidate matches as JSON array
- `{{lorebook_entry_types}}` - Allowed entity types

**Expected Output:** JSON with resolved ID and updated synopsis
```json
{
  "resolvedId": "entity_123",
  "synopsis": "updated one-line recap"
}
```
(Use `"resolvedId": "new"` if no match found)

**Full Prompt:**
```
You are the Auto-Lorebooks duplicate resolver for SillyTavern.

Known lorebook entry types: {{lorebook_entry_types}}

The Stage 1 lookup flagged possible duplicates and requested full context. You must make the final decision.

New entry candidate:
{{new_entry}}

Stage 1 synopsis:
{{lorebook_entry_lookup_synopsis}}

Candidate lorebook entries (full content, JSON array):
{{candidate_entries}}

Return ONLY a JSON object in this exact shape:
{
  "resolvedId": "<existing entity id or \"new\">",
  "synopsis": "<updated one-line recap for the canonical entity>"
}

Rules:
- Validate the new candidate remains a single-entity PList (brackets starting with [type-EntityName: ..., properties, <=2 nesting levels).
- Validate content uses specific names (not pronouns or vague references).
- If none of the candidates match, set the resolvedId field to "new".
- When choosing an existing entity, pick the ID that truly represents the same subject and merge the newest facts into it.
- If the candidate adds nothing new, keep the existing content and synopsis; do not fabricate alternate copies.
- Ensure the returned synopsis reflects the most current canon after reconciliation (<=15 words).
- Output STRICT JSON with double quotes and no commentary.
```

---

## 6. Lorebook Entry Merge

**Prompt Name:** `auto_lorebooks_recap_merge_prompt`

**When It Runs:** During lorebook processing (Stage 3). When an entry is being updated with new information from a scene recap.

**What It Does:** Intelligently merges new information with existing lorebook entry content. Maintains PList format, adds new details, updates changed information, removes contradictions. Can also detect when entries with vague names (like "amelia's sister") should be renamed to proper names (like "Victoria").

**Macros Used:**
- `{{entry_name}}` - Current entry name
- `{{existing_content}}` - Current entry content (PList format)
- `{{new_content}}` - New information from recap (PList format)

**Expected Output:** Either plain text (merged content) OR JSON (when renaming)

**Format 1 (no rename):**
```
[character-Alice: updated properties, new details, nested(information)]
```

**Format 2 (with rename):**
```json
{
  "mergedContent": "[character-Victoria: updated properties]",
  "canonicalName": "Victoria Thornbrook"
}
```

**Full Prompt:**
```
You are updating a lorebook entry. You have the existing entry content and new information from a recap.

Current Entry Name: {{entry_name}}

⚠️ CRITICAL: ONLY THE CONTENT IS INJECTED INTO THE AI'S CONTEXT ⚠️
The AI will NEVER see the entry title, type, or keywords - it ONLY sees the content text during roleplay.
Therefore, merged content MUST be completely self-contained with specific names and references.
DO NOT use pronouns or vague references ("him", "her", "it", "the protagonist", "his friend").
USE specific names ("Alice", "{{user}}", "Sunblade sword", "Shadow Guild", "Marcus").

Your task:
1. Compare the existing content with the new information.
2. Merge them carefully while keeping strict PList formatting:
   - Keep ONE bracketed entry that starts with [type-EntityName: ...] format.
   - The type prefix (e.g., "character-", "location-", "item-") MUST match the entry type.
   - Example: [character-Alice: warrior, ...] or [location-Tavern: old building, ...]
   - Add new details that are not already present.
   - Update existing details that have changed.
   - Remove information that is contradicted or no longer valid.
   - Preserve important existing properties that remain true.
   - Keep properties grouped logically; use parentheses for sub-details, max two nesting levels.
   - Do NOT spin off separate trait entries; every fact stays under this entity.
   - MAINTAIN SPECIFICITY: Replace any pronouns or vague references with specific names.
3. CRITICAL: Check if the entry name needs updating:
   - If the current name is a VAGUE/RELATIONAL reference (examples: "amelia's sister", "the bartender", "mysterious woman", "the shopkeeper", "victoria's friend")
   - AND either the existing content OR new content reveals an ACTUAL PROPER NAME
   - YOU MUST use FORMAT 2 with the proper name as canonicalName
4. If the new information adds nothing, return the original content EXACTLY (FORMAT 1). Do not rewrite or reorder it.

Existing Entry Content:
{{existing_content}}

New Information from Recap:
{{new_content}}

OUTPUT INSTRUCTIONS:

FORMAT 1 (Plain text - use ONLY when NO proper name is available or no change is needed):
Just output the merged content as plain text. It must remain valid PList.

FORMAT 2 (JSON - use when renaming is needed):
{
  "mergedContent": "the merged lorebook entry content here (MUST start with [type-NewName: ...])",
  "canonicalName": "ProperName"
}

WHEN TO USE FORMAT 2:
- Current name is relational/vague (possessive forms, job titles, family relations, descriptions)
- You have access to a proper name (first name, full name, character name)
- Example: Current="character-Amelia's Sister" + Content has "Victoria" -> canonicalName: "Victoria Thornbrook"

RULES FOR canonicalName:
- Use the full proper name if available (e.g., "Victoria Thornbrook")
- NO type prefixes (use "Victoria Thornbrook" not "character-Victoria Thornbrook")
- If only first name known, use just that (e.g., "Victoria")
- CRITICAL: mergedContent MUST start with [type-canonicalName: ...] format (e.g., [character-Victoria Thornbrook: ...])
- Always ensure mergedContent remains valid PList for this single entity.

If the current name is ALREADY a proper name (like "Victoria", "John Smith"), use FORMAT 1.

SPECIFICITY EXAMPLE:
❌ BAD MERGE:
[character-Alice: friends with him, uses his sword, told her about the plan, works at the place]

✅ GOOD MERGE:
[character-Alice: friends with({{user}}), uses({{user}}'s Sunblade sword), revealed(infiltration plan to Sarah), works at(Riverside Tavern owned by Marcus)]
```

---

## Quick Reference Table

| Prompt Name | When It Runs | Purpose |
|-------------|--------------|---------|
| `auto_scene_break_detection_prompt` | On each new message | Detect if message starts new scene |
| `scene_recap_prompt` | At scene breaks | Generate structured scene recap + extract entities |
| `running_scene_recap_prompt` | When new scenes created | Merge latest scene into running narrative |
| `auto_lorebook_entry_lookup_prompt` | Lorebook Stage 1 | Match new entries against registry, find duplicates |
| `auto_lorebook_entry_deduplicate_prompt` | Lorebook Stage 2 | Resolve uncertain matches with full context |
| `auto_lorebooks_recap_merge_prompt` | Lorebook Stage 3 | Merge new info with existing entry content |

// @flow
// ST-Auto-Summarize Default Prompts
// New structure: summary (timeline) + lorebooks (detailed entries)
// See docs/SUMMARY_LOREBOOK_SEPARATION.md for full documentation

export const default_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Extract key information from the message below into a structured JSON format.
// This separates timeline narrative from detailed reference information.
//
// ⚠️ CRITICAL: ONLY USE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
//
// - ONLY extract information explicitly written in the message text below
// - DO NOT use ANY information from your training data
// - If a name matches a franchise character, IGNORE franchise details completely
// - If something is not mentioned in the text below, it DOES NOT EXIST
// - Incomplete information is CORRECT - do not fill gaps
// - When in doubt, OMIT the detail entirely
//
// CRITICAL: SEPARATION OF CONCERNS
//
// SUMMARY field:
// - Brief timeline of what happened with concrete factual details
// - MENTION entities by name for context, include specific items/quotes/actions
// - DO NOT describe entity personalities or traits (that goes in lorebooks)
// - Include factual details: what was said, read, used, specific names/items
// - Exclude emotional analysis: NOT "felt jealous", "seemed worried", "angrily did X"
// - Terse, factual, minimal tokens but complete factual coverage
// - Primarily past tense (present tense for ongoing/unresolved states)
// - Focus on WHAT HAPPENED and OUTCOMES with specific details, not WHO/WHAT things are
// - Be concise but preserve important factual details
//
// LOREBOOKS array:
// - NEW entities discovered OR updates to existing entities
// - MUST use PList (Property List) format for content (28-44% token savings)
// - Each entry needs: name, type, keywords, content
// - Type must be one of: {{lorebook_entry_types}}
// - Optional: secondaryKeys (array) for AND disambiguation
// - DO NOT include timeline events (that goes in summary)
// - Only entities worth remembering for later
//
// PList FORMAT (REQUIRED):
// Syntax: [type-EntityName: property1, property2, nested(detail1, detail2)]
// - Square brackets [ ] around entire entry
// - Entity identifier is lowercase type + hyphen + entity name (e.g., "character-Alice", "location-Tavern")
// - Colon after entity identifier, comma-separated properties
// - Nested details use parentheses ( ), max 2 levels deep
// Example: [character-Alice: warrior, appearance(red hair, green eyes), personality(confident)]
//
// JSON STRUCTURE:
//
// {
//   "summary": "Timeline of what occurred",
//   "lorebooks": [
//     {
//       "name": "Entity Name",
//       "type": "{{lorebook_entry_types}}",
//       "keywords": ["keyword1", "keyword2", "keyword3"],
//       "secondaryKeys": ["disambiguation term"], // optional
//       "content": "Detailed description with nuance"
//     }
//   ]
// }
//
// ENTRY TYPES (use ONLY these):
// - character: NPCs, recurring characters (appearance, personality, relationships, secrets they know)
// - location: Significant places (description, features, who controls it)
// - item: Objects, artifacts, equipment (capabilities, ownership, significance)
// - faction: Organizations, groups (members, goals, relationships with other factions)
// - quest: Active objectives, missions (participants, deadline, stakes, status)
// - rule: World mechanics, magic systems, game rules (how it works, limitations, exceptions)
//
// KEYWORDS GUIDELINES:
// - 2–4 keywords; all lowercase
// - Use SIMPLE, SINGLE WORDS that will appear in chat (exact match required)
// - Include canonical name and common aliases/nicknames
// - Avoid multi-word phrases unless they're used together consistently
// - Avoid generic terms (e.g., "place", "city", "market", "warrior") and verbs
// - Keywords trigger on exact match - keep them simple and broad
// - If a keyword is too generic and triggers incorrectly, use secondaryKeys for AND disambiguation
// - Do NOT output regex patterns
//
// Examples:
// ✅ GOOD: ["sunblade", "sword"] - simple words that appear in any mention
// ❌ BAD: ["who stole sunblade", "find the thief"] - won't match unless exact phrase used
// ✅ GOOD: ["alice"] - will trigger when Alice is mentioned
// ❌ BAD: ["skilled warrior alice", "alice the brave"] - too specific, won't trigger reliably
//
// CONTENT GUIDELINES (PList format):
// ⚠️ CRITICAL: ONLY THE CONTENT FIELD IS PRESERVED IN THE AI'S CONTEXT ⚠️
// - The "name", "type", and "keywords" fields are ONLY for indexing/triggering
// - The AI will NEVER see those fields - it ONLY sees the "content" text
// - Therefore, content MUST be completely self-contained and specific
// - Content MUST identify what entity it's describing (that's why we use [type-EntityName: ...] format)
// - Content MUST be specific about relationships (use actual names, not "the user", "her friend", "his sister")
// - This is where ALL the detail and nuance goes
// - MUST use PList format: [type-EntityName: property1, property2, nested(details)]
// - CRITICAL: Start with lowercase type + hyphen + entity name (e.g., [character-Alice: ...], [location-Tavern: ...])
// - Be thorough but organized using properties
// - Include appearance, personality, capabilities, significance
// - Include relationships and context as properties
// - Store secrets as properties: knows(X), keeping secret from(Y, Z)
// - For locations/items: Include owner/resident as a property with SPECIFIC NAMES
//   * For user-owned locations/items, use {{user}}'s residence/property
//   * Example: [location-Apartment: {{user}}'s residence, shared with(Sarah)]
//   * Do NOT use: "protagonist", "the user", "main character", "human subject"
// - INCLUDE CONCRETE FACTUAL DETAILS:
//   * Specific quotes: quoted("exact scripture text", "literature about villainy")
//   * Specific items used: used(dagger), read(book title), wore(red cloak)
//   * Specific actions taken: displayed(knife-fighting stance), fled(westward direction)
//   * What they read/saw/heard: read(ancient murals depicting First War)
//   ❌ NOT vague: "has beliefs about women", "knows things"
//   ✅ SPECIFIC: quoted(scripture: "suffer not a woman to teach"), knows(Sunblade thief identity)
// - BE SPECIFIC ABOUT RELATIONSHIPS AND REFERENCES:
//   ❌ VAGUE: [character-Alice: friends with the protagonist, uses his sword]
//   ✅ SPECIFIC: [character-Alice: friends with({{user}}), uses({{user}}'s Sunblade sword)]
//   ❌ VAGUE: [character-Bob: knows what happened, told her about it]
//   ✅ SPECIFIC: [character-Bob: knows(Shadow Guild infiltrated castle), revealed information to(Alice)]
//   ❌ VAGUE: [location-Tavern: owned by him, she works there]
//   ✅ SPECIFIC: [location-Tavern: owned by(Marcus), employees(Sarah, waitress), location(Riverside district)]
//
// EXAMPLES OF GOOD SEPARATION:
//
// Example 1: Combat Scene
// ✅ SUMMARY: "Bandits ambushed Alice and Bob. Alice killed two with greatsword. Bob disabled one with throwing knife. Two fled. Alice wounded in shoulder but mobile."
// ✅ LOREBOOK: {"name": "Alice", "type": "character", "keywords": ["alice"], "content": "[character-Alice: warrior, weapon(greatsword, wields with lethal skill), training(formal), wounded(shoulder), continues fighting when injured]"}
//
// Example 2: Discovery
// ✅ SUMMARY: "Found hidden chamber behind waterfall. Ancient murals depicted the First War."
// ✅ LOREBOOK: {"name": "Hidden Chamber", "type": "location", "keywords": ["chamber", "waterfall"], "content": "[location-Hidden Chamber: secret room, location(behind waterfall), features(stone walls, ancient murals showing First War), status(undisturbed for centuries)]"}
//
// Example 3: Character-Owned Location
// ✅ SUMMARY: "Visited John's apartment. Sarah was researching quantum physics on his laptop."
// ✅ LOREBOOK: {"name": "Apartment", "type": "location", "keywords": ["apartment"], "content": "[location-Apartment: John's residence, shared with(Sarah), contains(laptop, research papers on quantum physics)]"}
//
// Example 4: Revelation
// ✅ SUMMARY: "Bob revealed Shadow Guild membership. Alice became suspicious but agreed to cooperate."
// ✅ LOREBOOK: {"name": "Bob", "type": "character", "keywords": ["bob"], "content": "[character-Bob: Shadow Guild member, keeping secret from(Alice, {{user}} previously), revealed(Guild membership during confrontation), constrained by(Guild secrecy requirements)]"}
//
// BAD EXAMPLES:
//
// ❌ SUMMARY: "Alice, a skilled warrior with red hair and green eyes, fought the bandits using her greatsword technique..."
// → Too much description! Just say "Alice fought bandits with greatsword"
//
// ❌ LOREBOOK: {"name": "Battle", "content": "Alice and Bob were ambushed and fought bandits on the road"}
// → That's a timeline event! Belongs in summary, not lorebooks
//
// ❌ LOREBOOK: {"name": "Alice", "type": "character", "content": "Skilled warrior. Red hair, green eyes."}
// → NOT using PList format! Must be: [character-Alice: warrior, appearance(red hair, green eyes)]
//
// ❌ LOREBOOK: {"name": "Secret Alliance", "type": "concept", "content": "[Secret Alliance: ...]"}
// → Wrong type! Use character/location/item/faction/quest/rule only. Store secrets in character entries.
//
// ❌ LOREBOOK: {"name": "Apartment", "type": "location", "keywords": ["apartment"], "content": "[location-Apartment: shared living space, occupants(human subject, Sarah)]"}
// → Using vague "human subject" instead of specific name! Should be: [location-Apartment: John's residence, shared with(Sarah)]
//
// ❌ LOREBOOK: {"name": "Alice", "type": "character", "keywords": ["alice"], "content": "[character-Alice: friends with him, borrowed his weapon, told her about the plan]"}
// → Pronouns and vague references! The AI won't know who "him", "his", or "her" are! Should be: [character-Alice: friends with({{user}}), borrowed({{user}}'s Sunblade), revealed(plan to Sarah)]
//
// OUTPUT FORMAT:
// - Output ONLY valid JSON, no text before or after
// - Summary is required (empty string if truly nothing happened)
// - Lorebooks array is optional (can be empty: [])
//
// Output template:
{
  "summary": "",
  "lorebooks": []
}

// Message Content:
{{message}}`;


export const scene_summary_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Produce a SCENE RECAP in the JSON schema below, keeping events and long-term lore separate.
//
// ⚠️ CRITICAL: USE ONLY THE SCENE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
// - If the scene does not state a fact, it does not exist
// - Do not invent motives, emotions, or extrapolated outcomes
// - Franchise names: ignore canon outside this transcript
//
// SUMMARY field (markdown recap):
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
// - Summary is required
// - Lorebooks array is optional (empty array if no new entities)

{
  "summary": "",
  "lorebooks": []
}

// Scene Content:
// Messages are formatted as:
// [USER: name] or [CHARACTER: name]
// message text
//
// [SUMMARY] (if any)
// summary text

{{scene_messages}}`;


export const default_short_template = `<!--Roleplay memory containing current state and key facts from previous scenes.
The information below takes priority over character and setting definitions. -->

<roleplay_memory format="json">
{{memories}}
</roleplay_memory>`;


export const default_combined_template = `<!--Roleplay memory containing current state and key facts from previous scenes.
The information below takes priority over character and setting definitions. -->

<roleplay_memory format="json">
{{memories}}
</roleplay_memory>`;


export const default_scene_template = `<!--Roleplay memory containing current state and key facts from previous scenes, organized by scene.
The information below takes priority over character and setting definitions. -->

<roleplay_memory format="json">
{{scene_summaries}}
</roleplay_memory>`;


// Validation prompts check format and structure
export const message_summary_error_detection_prompt = `You are validating a roleplay memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure.
2. Has a "summary" field (string) that contains ALL headers: "## Current Situation", "## Key Developments", "## Dialogue Highlights", "## Pending Threads".
3. Each section uses bullet lines beginning with "- " and states factual outcomes or states (no emotional analysis).
4. Has a "lorebooks" field (array, may be empty).
5. Every lorebook entry object includes "name", "type", "keywords" (array), and "content" in valid PList format starting with [type-EntityName: ...].
6. No timeline narration or descriptive lore in the recap; enduring traits belong in lorebooks.
7. Lorebook content stays PList (single entity, <=2 nesting levels, format: [type-EntityName: property, ...]) and excludes timeline events.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Memory to validate:
{{summary}}`;

export const scene_summary_error_detection_prompt = `You are validating a scene memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure.
2. Has a "summary" field (string) using the headers "## Current Situation", "## Key Developments", "## Dialogue Highlights", "## Pending Threads" in that order.
3. Each section contains bullet lines with observable facts or outcomes from the scene (no speculation or character biographies).
4. Has a "lorebooks" field (array, may be empty).
5. Every lorebook entry object includes "name", "type", "keywords" (array), and "content" in valid PList format (starting with [type-EntityName: ...]) for a single entity.
6. Recap sections focus on state after the scene; lorebook entries handle enduring traits or nuance.
7. Lorebook content omits timeline narration and stays within PList syntax ([type-EntityName: property, ...], max two nesting levels).

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Scene memory to validate:
{{summary}}`;
// Legacy scene summary prompt (narrative style, not JSON)
export const scene_summary_default_prompt = `Extract key facts from the following scene for roleplay memory. Focus on important events, character developments, emotional shifts, and plot points that will be useful after this scene is no longer visible. Include character names, significant decisions, relationship changes, and relevant details for future scenes. Write in past tense, avoid commentary, stay factual.

Scene content:
{{message}}`;


export const auto_scene_break_detection_prompt = `You are segmenting a roleplay transcript into scene-sized chunks (short, chapter-like story beats). Determine whether the CURRENT message begins a new scene relative to the PREVIOUS message. A scene break means the prior beat resolved and the story now shifts focus.

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
}`;


export const running_scene_summary_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
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
{{#if current_running_summary}}
// CURRENT RUNNING RECAP (edit in place):
{{current_running_summary}}

{{/if}}
// NEW SCENE RECAP TO MERGE:
{{scene_summaries}}`;


export const auto_lorebook_entry_lookup_prompt = `You are the Auto-Lorebooks registry entry lookup assistant for SillyTavern.

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
  "synopsis": "<short one-line summary>",
  "sameEntityIds": ["entity_id_1"],
  "needsFullContextIds": ["entity_id_2"]
}

Rules:
- 'sameEntityIds' and 'needsFullContextIds' must be arrays. Use [] when empty.
- Never invent IDs; only use IDs from the registry listing.
- Always align the candidate with an existing entity when the canonical name already appears in the registry.
- Only leave both arrays empty when you are confident the entity is brand new.
- Even if the candidate repeats known facts, still align it with the correct entity; the merge stage will handle deduplication.
- Output STRICT JSON with double quotes and no commentary.`;

export const auto_lorebook_entry_deduplicate_prompt = `You are the Auto-Lorebooks duplicate resolver for SillyTavern.

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
  "resolvedId": "<existing entity id or \\"new\\">",
  "synopsis": "<updated one-line summary for the canonical entity>"
}

Rules:
- Validate the new candidate remains a single-entity PList (brackets starting with [type-EntityName: ..., properties, <=2 nesting levels).
- Validate content uses specific names (not pronouns or vague references).
- If none of the candidates match, set the resolvedId field to "new".
- When choosing an existing entity, pick the ID that truly represents the same subject and merge the newest facts into it.
- If the candidate adds nothing new, keep the existing content and synopsis; do not fabricate alternate copies.
- Ensure the returned synopsis reflects the most current canon after reconciliation (<=15 words).
- Output STRICT JSON with double quotes and no commentary.`;


export const default_running_scene_template = `<!--Roleplay memory containing current state and key facts from all previous scenes, combined into a cohesive narrative.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{running_summary}}
</roleplay_memory>`;

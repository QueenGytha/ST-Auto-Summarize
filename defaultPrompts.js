
// ST-Auto-Summarize Default Prompts
// Structure: recap (events + tone) + lorebooks (detailed entries)
// See docs/SUMMARY_LOREBOOK_SEPARATION.md for full documentation

export const default_prompt = `You are a structured data extraction system analyzing roleplay transcripts.
Your task is to extract message information into JSON format according to the specifications below.
You are NOT participating in the roleplay. You are analyzing completed roleplay text.
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
// RECAP (summary string):
// - Use markdown headers and bullets in this order:
//   ## Current Situation
//   ## Key Developments
//   ## Dialogue Highlights
//   ## Tone & Style
//   ## Pending Threads
// - One fact per bullet; be specific (names, items, places).
// - Focus on outcomes and current state; avoid blow-by-blow narration.
//
// LOREBOOKS array:
// - New entities or durable updates only (characters, locations, items, factions, quests, rules)
// - Each entry needs: name, type, keywords, optional secondaryKeys, content
// - Content uses bullet points and must begin with an Identity bullet: "- Identity: <Type> — <Canonical Name>"
// - Use specific names for all references; avoid pronouns
// - Do NOT include timeline narration here; keep that in the recap
//
// CONTENT FORMAT (bullet style for lorebooks):
// - Identity: <Type> — <Canonical Name>
// - Synopsis: <1 line>
// - Attributes: <traits/capabilities>
// - Relationships: <X ↔ Y with stance + micro-cues>
// - State: <status/location/owner>
// - Secrets/Leverage: <what/who knows>
// - Tension/Triggers: <what escalates/defuses>
// - Style Notes: <voice/tone anchors>
//
// OUTPUT JSON SHAPE:
// {
//   "summary": "markdown recap string",
//   "lorebooks": [
//     {
//       "name": "Entity Name",
//       "type": "{{lorebook_entry_types}}",
//       "keywords": ["keyword1", "keyword2"],
//       "secondaryKeys": ["and-term"],
//       "content": "- Identity: <Type> — <Canonical Name>\n- Synopsis: <1 line>\n- Attributes: <bullets>\n- Relationships: <bullets with specific names>\n- State: <status/location/owner>\n- Secrets/Leverage: <who knows>\n- Tension/Triggers: <micro cues>\n- Style Notes: <voice/tone anchors>"
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
// - No hard limit: include as many meaningful triggers as needed; all lowercase
// - Prioritize canonical name, real aliases/nicknames, and distinctive identifiers likely to appear
// - Use SIMPLE tokens that actually occur in chat (exact match required); avoid padding or redundant variants
// - Avoid generic terms (e.g., "place", "city", "market", "warrior") and verbs; multi-word phrases only if consistently used together
// - If a keyword is broad, use secondaryKeys for AND disambiguation
// - Do NOT output regex patterns
//
// Examples:
// ✅ GOOD: ["sunblade", "sword"] - simple words that appear in any mention
// ❌ BAD: ["who stole sunblade", "find the thief"] - won't match unless exact phrase used
// ✅ GOOD: ["alice"] - will trigger when Alice is mentioned
// ❌ BAD: ["skilled warrior alice", "alice the brave"] - too specific, won't trigger reliably
//
// CONTENT GUIDELINES (bullet style for lorebooks):
// ⚠️ ONLY THE "content" FIELD IS PRESERVED IN CONTEXT ⚠️
// - The "name", "type", and "keywords" fields are ONLY for indexing/triggering
// - The AI will NEVER see those fields; it ONLY sees the "content" text
// - Therefore, content MUST be self-contained and name the entity in the Identity bullet
// - Use specific names for relationships (not pronouns)
// - Include micro-moments and short quotes when they lock in dynamics
// - Keep bullets crisp and factual; one fact per bullet
//
// EXAMPLES OF GOOD SEPARATION (bullet style):
//
// Example 1: Combat Scene
// ✅ SUMMARY (Key Developments):
// - Bandits ambushed Alice and Bob
// - Alice killed two with a greatsword; Bob disabled one with a throwing knife; two fled
// - Alice wounded in shoulder but mobile
// ✅ LOREBOOK (Alice):
// - Identity: Character — Alice
// - Attributes: Greatsword; formal training; continues fighting when injured
// - State: Shoulder wound
//
// Example 2: Discovery
// ✅ SUMMARY (Key Developments):
// - Found hidden chamber behind waterfall; ancient murals depicted the First War
// ✅ LOREBOOK (Hidden Chamber):
// - Identity: Location — Hidden Chamber
// - Attributes: Stone walls; ancient murals (First War)
// - State: Undisturbed for centuries; behind a waterfall
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


export const scene_summary_prompt = `You are a structured data extraction system analyzing roleplay transcripts.
Your task is to extract scene information into JSON according to the specifications below.
You are NOT participating in the roleplay. You are analyzing completed roleplay text.
//
// ⚠️ CRITICAL: USE ONLY THE SCENE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
// - If the scene does not state a fact, it does not exist
// - Do not invent motives beyond the text
// - Franchise names: ignore canon outside this transcript
//
// RECAP (summary string):
// Use markdown headers and bullets in this exact order:
//   ## Current Situation   -> Where the scene ends; who is present; unresolved stakes
//   ## Key Developments    -> One bullet per significant change/outcome in this scene
//   ## Dialogue Highlights  -> Exact short quotes/paraphrases that set canon (promises, threats, reveals)
//   ## Tone & Style        -> Words/phrases that capture the vibe and voice to preserve
//   ## Pending Threads      -> Goals, deadlines, secrets, obligations that carry forward
// Rules:
// - One fact per bullet; be specific (names, items, places).
// - Do not narrate blow-by-blow; focus on durable outcomes.
// - Avoid describing traits/backstory here—put those in lorebooks.
//
// LOREBOOKS (array):
// - Only include if this scene adds durable knowledge about an entity.
// - Each object updates ONE concrete entity (character, location, item, faction, quest, rule).
// - Fields: name, type (one of {{lorebook_entry_types}}), keywords, optional secondaryKeys, content.
// - Content MUST be bullet points. Start with identity so it stands alone without the title:
//   - Identity: <Type> — <Canonical Name>
//   - Synopsis: <1 line identity/purpose>
//   - Attributes: <appearance/traits/capabilities>
//   - Relationships: <X ↔ Y — dynamic snapshot (tone, patterns, salient past interactions); brief evidence or short quote if helpful>
//   - State: <status/location/owner/ongoing effects>
//   - Secrets/Leverage: <what/who knows>
//   - Tension/Triggers: <what escalates/defuses; quotes if needed>
//   - Style Notes: <voice ticks or phrasing anchors>
// - Use specific names (not pronouns) for all references; avoid numeric scoring (no "+1 suspicion").
// - Add only new/changed facts; omit if unsure.
// - Keywords: include as many meaningful triggers as needed (lowercase). Prefer canonical name, real aliases/nicknames, and distinctive identifiers; avoid generic terms. Use secondaryKeys for AND disambiguation when a token is broad.
//
// Output ONLY valid JSON, no text before or after.

{
  "summary": "",
  "lorebooks": []
}

// Scene Content (oldest to newest):
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
2. Has a "summary" field (string) with headers in this order: "## Current Situation", "## Key Developments", "## Dialogue Highlights", "## Tone & Style", "## Pending Threads".
3. Each section uses bullet lines ("- ") with observable facts; no blow-by-blow narration.
4. Has a "lorebooks" field (array, may be empty).
5. Each lorebook entry includes "name", "type", "keywords" (array), and "content" as bullet points.
6. Lorebook content begins with an identity bullet like "- Identity: <Type> — <Canonical Name>" and avoids pronouns for references.
7. Recap focuses on events + overall tone; detailed nuance and relationships live in lorebooks.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Memory to validate:
{{summary}}`;

export const scene_summary_error_detection_prompt = `You are validating a scene memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure.
2. Has a "summary" field (string) using the headers "## Current Situation", "## Key Developments", "## Dialogue Highlights", "## Tone & Style", "## Pending Threads" in that order.
3. Each section contains bullet lines with observable facts or outcomes from the scene (no speculation or biographies).
4. Has a "lorebooks" field (array, may be empty).
5. Every lorebook entry includes "name", "type", "keywords" (array), and bullet-point "content" that starts with an identity bullet and uses specific names.
6. Recap covers events and overall tone; lorebooks capture nuance, relationships, and dynamics.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Scene memory to validate:
{{summary}}`;
// Legacy scene summary prompt (narrative style, not JSON)
export const scene_summary_default_prompt = `Extract key facts from the following scene for roleplay memory. Focus on important events, character developments, emotional shifts, and plot points that will be useful after this scene is no longer visible. Include character names, significant decisions, relationship changes, and relevant details for future scenes. Write in past tense, avoid commentary, stay factual.

Scene content:
{{message}}`;


export const auto_scene_break_detection_prompt = `You are segmenting a roleplay transcript into scene-sized chunks (short, chapter-like story beats). Determine whether the CURRENT message begins a new scene relative to the PREVIOUS messages. A scene break means the prior beat resolved and the story now shifts focus.

Scene break if the current message clearly does at least one of:
- Moves to a new location or setting.
- Skips time with explicit cues ("Later...", "The next morning...", timestamps).
- Switches primary characters or point of view to a different group.
- Starts a new objective or major conflict after the previous one concluded.
- Includes explicit separators or OOC markers ("---", "Scene Break", "Chapter 3", GM notes resetting play).

Natural narrative beats to watch for:
- Resolution or decision that concludes the prior exchange
- Reveal of major information that shifts the situation
- Escalation to a qualitatively new level (not just intensifying current action)
- Clear pause or transition point in the narrative flow

Do NOT mark a break when:
- The current line is a reaction, continuation, or escalation of the same exchange.
- Minor topic shifts happen within the same setting, participants, and timeframe.
- The message is meta chatter that does not advance the narrative.
- The current message is mid-action, mid-conversation, or mid-beat (the exchange hasn't concluded yet).

Decision process:
1. Check for explicit separators or time/scene headers and mark a break if present.
2. Otherwise compare setting, time, cast, and objective; mark a break only if there is a clear change.
3. Consider narrative flow: Has the prior beat concluded? Is this starting a new beat?
4. If evidence is ambiguous, treat it as a continuation (status false).

CRITICAL: Base your decision ONLY on the provided messages below.
- Never invent details, context, or relationships not explicitly stated in the text.
- Do not assume narrative patterns based on genre expectations.
- If a detail is not mentioned in the messages, it does not exist for this decision.

Previous messages (oldest to newest):
{{previous_message}}

Current message:
{{current_message}}

Return ONLY valid JSON with no code fences, no commentary, no additional text:
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
// TARGET STRUCTURE (markdown recap in "summary" field):
// Maintain the same headers and bullet discipline as the scene recap output. Update or append bullets as needed.
//   ## Current Situation   -> Active locations, who is present, unresolved stakes
//   ## Key Developments    -> Durable outcomes and plot shifts (replace outdated bullets)
//   ## Dialogue Highlights  -> Quotes or paraphrases that continue to matter
//   ## Tone & Style         -> Vibe/style anchors that must persist
//   ## Pending Threads       -> Goals, timers, secrets, obligations in play
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
{{scene_summaries}}

// OUTPUT FORMAT:
// You MUST respond with valid JSON in this exact format:
{
  "summary": "markdown recap with headers and bullets here"
}`;


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
2. Confirm the candidate represents ONE concrete entity. Its 'name' is its canonical name.
3. Validate the content uses BULLET POINTS and begins with an identity bullet like "- Identity: <Type> — <Canonical Name>".
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
- Validate the new candidate is a single entity and the content uses bullet points with an identity bullet first.
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

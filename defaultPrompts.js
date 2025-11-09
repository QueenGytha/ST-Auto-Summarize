
// ST-Auto-Recap Default Prompts
// Structure: recap (events + tone) + lorebooks (detailed entries)
// See docs/Recap_LOREBOOK_SEPARATION.md for full documentation

export const default_prompt = `You are a structured data extraction system analyzing roleplay transcripts.
Your task is to extract message information into JSON format according to the specifications below.
You are NOT participating in the roleplay. You are analyzing completed roleplay text.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "recap": "Your scene recap here (or empty string if nothing happened)",
  "lorebooks": [
    {
      "type": "character",
      "name": "Entity Name",
      "content": "Description",
      "keywords": ["keyword1", "keyword2"],
      "secondaryKeys": ["and-term"]
    }
  ]
}

Example valid response:
{"recap": "Adam approached Haven's eastern gate with Senta following. Guards challenged them.", "lorebooks": [{"type": "location", "name": "Haven Eastern Gate", "content": "Main entrance to Haven city, heavily guarded", "keywords": ["haven", "eastern gate"], "secondaryKeys": ["gate"]}]}

CRITICAL: Ensure your response begins with the opening curly brace { character

⚠️ CRITICAL: ONLY USE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
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
// RECAP (recap string):
// - Use markdown headers and bullets in this order:
//   ## Current Situation
//   ## Key Developments
//   ## Tone & Style
//   ## Pending Threads
// - One fact per bullet; be specific (names, items, places).
// - Focus on outcomes and current state; avoid blow-by-blow narration.
// - JSON safety: Escape all internal double quotes in values as \". Do not output any preamble or commentary.
//
// LOREBOOKS array:
// - New entities or durable updates only (characters, locations, items, factions, quests, rules)
// - Each entry needs: name, type, keywords, optional secondaryKeys, content
// - Content uses bullet points and must begin with an Identity bullet: "- Identity: <Type> — <Canonical Name>"
// - Use specific names for all references; avoid pronouns
// - Do NOT include timeline narration here; keep that in the recap
// - Entity inclusion: Only add named or durable entities. Do NOT create entries for one-off/ephemeral groups (e.g., "three thugs") unless canon makes them persistent. If a recurring unnamed group acts as a standing hazard in an area, prefer a faction entry (e.g., "Exile's Gate Predators") over a character entry.
// - Emission criteria by type:
//   * character: Introduced by name or clearly recurring with stable traits/relationships; new durable facts emerged.
//   * location: Named place or clearly defined area with persistent features/ownership; avoid scene-event history.
//   * item: Named object with capabilities/constraints or transfer of ownership that matters.
//   * faction: Named group or stable unnamed collective that acts repeatedly in the same role/location.
//   * quest: Ongoing objective with explicit actor+goal (and optional anchor/deadline) still in play.
//   * rule: Mechanics or world constraint stated explicitly (how it works, limits, exceptions).
// - Quest creation rule: When the recap's Pending Threads include a clear, ongoing objective (actor + goal + anchor), add/refresh a "quest" entry with concise "Synopsis" and a "State" bullet tracking current status. Keywords should include the primary actor (e.g., "adam") plus a specific token for the objective (e.g., "homestead contest"); place broad tokens (e.g., "elders", "legal") in secondaryKeys.
//
// CONTENT FORMAT (bullet style for lorebooks):
// - Identity: <Type> — <Canonical Name>
// - Synopsis: <1 line>
// - Attributes: <traits/capabilities>
// - Relationships: <X ↔ Y with stance + micro-cues>
// - State: <status/location/owner>
// - Access: <who/how can use without owning> (optional)
// - Secrets/Leverage: <what/who knows>
// - Tension/Triggers: <what escalates/defuses>
// - Style Notes: <voice/tone anchors>
// IMPORTANT: Use only the bullets that are relevant for the entity and scene. It is correct to omit bullets that do not apply. Do not invent entities (e.g., factions, rules) or filler to match templates.
//
// QUALITY CHECK BEFORE RESPONDING:
// - Recap includes all four sections (headers present); no blow‑by‑blow; quotes escaped.
// - For each lorebook: Identity bullet present; content is durable facts only.
// - Location entries contain no transient scene events; those belong in the recap.
// - Keywords are normalized: possessives/hyphens handled; include punctuation‑free variants; avoid standalone generics.
// - Broad tokens appear only in secondaryKeys (AND gating) with a specific primary token.
//
// OUTPUT JSON SHAPE:
// {
//   "recap": "markdown recap string",
//   "lorebooks": [
//     {
//       "name": "Entity Name",
//       "type": "{{lorebook_entry_types}}",
//       "keywords": ["keyword1", "keyword2"],
//       "secondaryKeys": ["and-term"],
//       "content": "- Identity: <Type> — <Canonical Name>\n- Synopsis: <1 line>\n- Attributes: <bullets>\n- Relationships: <X ↔ Y — dynamic snapshot (tone, patterns, salient past interactions); brief evidence or short quote if helpful>\n- State: <current status/location/owner/ongoing effects with scene/time anchors when present>\n- Secrets/Leverage: <who knows>\n- Tension/Triggers: <micro cues>\n- Style Notes: <voice/tone anchors>"
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
// - Lowercase. No hard numeric cap — include all genuinely useful triggers.
// - Prefer SIMPLE tokens that actually appear in chat. Exact substring match is used.
// - Prioritize canonical names, real aliases/nicknames, and distinctive identifiers.
// - Avoid generic nouns alone (e.g., "city", "tavern", "neighborhood", "gate", "eyes", "horse").
// - Multi‑word phrases are OK when commonly used (e.g., "gilded acorn", "white horse").
// - If a token is broad (e.g., "gate", "bell", "tavern"), pair it with a specific token via secondaryKeys for AND disambiguation.
// - Normalization rules (apply when choosing keywords):
//   * Strip apostrophes/hyphens variants by also adding a punctuation‑free variant when applicable.
//   * For possessives: include the base form (e.g., "exile's gate" → add "exiles gate" and "exile").
//   * For hyphenated adjectives: include the space variant ("sapphire-blue eyes" → "sapphire blue eyes").
//   * Do not include bare generic nouns as standalone keywords; if used, place them only in secondaryKeys (AND with a specific token).
// - Use secondaryKeys to require co‑occurrence with a specific token when a keyword is broad.
// - Do NOT output regex patterns or anchors.
//
// Examples:
// ✅ GOOD: ["sunblade", "sword"] — simple words that appear in chat
// ❌ BAD: ["who stole sunblade", "find the thief"] — too specific
// ✅ GOOD: ["alice"] — will trigger when Alice is mentioned
// ❌ BAD: ["skilled warrior alice", "alice the brave"] — too specific
// ✅ GOOD (location): name: "Exile's Gate" → keywords: ["exiles gate", "exile"], secondaryKeys: ["gate"]
// ✅ GOOD (establishment): name: "Companion's Bell" → keywords: ["companions bell", "companion"], secondaryKeys: ["bell"]
// ✅ GOOD (trait): name: "Senta" → keywords: ["senta", "companion", "sapphire blue eyes"]
// ❌ BAD: ["city", "neighborhood", "gate", "eyes", "horse"] — generic alone
//
// CONTENT GUIDELINES (bullet style for lorebooks):
// ⚠️ ONLY THE "content" FIELD IS PRESERVED IN CONTEXT ⚠️
// - The "name", "type", and "keywords" fields are ONLY for indexing/triggering
// - The AI will NEVER see those fields; it ONLY sees the "content" text
// - Therefore, content MUST be self-contained and name the entity in the Identity bullet
// - Use specific names for relationships (not pronouns)
// - Include micro-moments and short quotes when they lock in dynamics
// - Keep bullets crisp and factual; one fact per bullet
// - Location entries must describe durable properties (layout, control, features). Do NOT include transient scene events (e.g., "Adam entered through it", "was attacked here yesterday"). Keep history/events in the recap, not in the location entry.
//
// EXAMPLES OF GOOD SEPARATION (bullet style):
//
// Example 1: Combat Scene
// ✅ RECAP (Key Developments):
// - Bandits ambushed Alice and Bob
// - Alice killed two with a greatsword; Bob disabled one with a throwing knife; two fled
// - Alice wounded in shoulder but mobile
// ✅ LOREBOOK (Alice):
// - Identity: Character — Alice
// - Attributes: Greatsword; formal training; continues fighting when injured
// - State: Shoulder wound
//
// Example 2: Discovery
// ✅ RECAP (Key Developments):
// - Found hidden chamber behind waterfall; ancient murals depicted the First War
// ✅ LOREBOOK (Hidden Chamber):
// - Identity: Location — Hidden Chamber
// - Attributes: Stone walls; ancient murals (First War)
// - State: Undisturbed for centuries; behind a waterfall

// REMINDER: Output must be valid JSON starting with { character. Recap is REQUIRED. Lorebooks array is OPTIONAL (can be empty: []).

// Message Content:
{{message}}`;


export const scene_recap_prompt = `You are a structured data extraction system analyzing roleplay transcripts.
Your task is to extract scene information into JSON according to the specifications below.
You are NOT participating in the roleplay. You are analyzing completed roleplay text.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "scene_name": "A brief, descriptive scene title",
  "recap": "Your scene recap here (or empty string if nothing happened)",
  "lorebooks": [
    {
      "type": "character",
      "name": "Entity Name",
      "content": "Description",
      "keywords": ["keyword1", "keyword2"],
      "secondaryKeys": ["and-term"]
    }
  ]
}

Example valid response:
{"scene_name": "Hidden Chamber Revelation", "recap": "## Current Situation\n- At the waterfall, party stands by a newly found chamber\n\n## Key Developments\n- [discovery] Hidden chamber found behind waterfall; murals show the First War\n\n## Tone & Style\n- curious; reverent; ancient mystery\n\n## Pending Threads\n- Return with tools to study murals", "lorebooks": [{"type": "location", "name": "Hidden Chamber", "content": "- Identity: Location — Hidden Chamber\n- Synopsis: Secret chamber behind waterfall with First War murals\n- Attributes: stone walls; ancient murals; undisturbed for centuries\n- State: concealed behind waterfall; difficult access", "keywords": ["hidden chamber", "murals", "waterfall"], "secondaryKeys": ["chamber"]}]}

CRITICAL: Ensure your response begins with the opening curly brace { character

⚠️ CRITICAL: USE ONLY THE SCENE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
- If the scene does not state a fact, it does not exist
- Do not invent motives beyond the text
- Franchise names: ignore canon outside this transcript
//
// recap field (string):
// Use markdown headers and bullets in this exact order:
//   ## Current Situation   -> Where the scene ends; who is present; unresolved stakes
//                           Include explicit time and location only if stated (e.g., "dawn", "later that night", a named place).
//   ## Key Developments    -> One bullet per significant change/outcome in this scene
//                           Optional category tag at start of bullet to aid scanning: [reveal], [decision], [travel], [combat], [transfer], [relationship], [plan], [discovery], [state]. Use at most one tag per bullet and only when it adds clarity.
//   ## Tone & Style        -> Capture the ROLEPLAY's writing style and genre (NOT character emotions)
//                           Focus on: genre/subgenre, narrative voice (POV, tense), prose patterns, dialogue style, recurring motifs
//                           Examples of GOOD Tone & Style bullets:
//                             - "Genre: cyberpunk noir; corporate espionage with body horror elements"
//                             - "Narrative voice: first-person present tense; unreliable narrator; stream of consciousness"
//                             - "Prose style: sparse Hemingway sentences; heavy color symbolism (red = danger, white = sterility)"
//                             - "Dialogue: Tarantino-style rapid banter; pop culture references; profanity as rhythm"
//                             - "Motifs: technology vs. nature; corporate jargon masking violence; neon-lit urban decay"
//                             - "Format: mindspeak in italics with colons (*:text:*); alternating POV chapters; letters/journal entries"
//                           Examples of BAD Tone & Style bullets (these are character states, NOT writing style):
//                             ❌ "tense; conflicted; determined" - these are emotions, belong in Key Developments
//                             ❌ "Alice distrusts Bob" - this is relationship, belongs in Key Developments or lorebooks
//                             ❌ "mounting pressure" - this is plot state, belongs in Current Situation
//                           Purpose: Give future LLM the context needed to WRITE in the same style when old messages scroll out of context
//                           Update only when writing style itself changes (new POV, genre shift, new narrative device introduced)
//   ## Pending Threads      -> Goals, deadlines, secrets, obligations that carry forward
// Rules:
// - One fact per bullet; be specific (names, items, places).
// - Do not narrate blow-by-blow; focus on durable outcomes.
// - Avoid describing traits/backstory here—put those in lorebooks.
// - When relationship dynamics between named entities shift, include a compact dynamic snapshot in Key Developments (tone, interaction patterns, salient past interactions). Evidence style: add EITHER a short quote (≤ 12 words) OR an explicit cue (e.g., "averts gaze"), not both. Avoid numeric scoring (no "+1 suspicion").
// - Explicit uncertainty: When the text states uncertainty, capture it using prefixes like "Likely:" or "Uncertain:", but never invent or upgrade uncertainty to fact.
// - Pending Threads should be actionable: verb+noun+anchor when present (e.g., "Retrieve Sunblade (before dawn)", "Meet Clara (east gate, first light)").
// - All sections MUST be present; if a section has no content, include a single line with "—".
// - Final check before responding: durable outcomes covered; Tone & Style describes WRITING STYLE (genre, POV, prose patterns, dialogue format, motifs) NOT character emotions; dynamic snapshots updated if relationships shifted.
// - Coherence note: If a new or updated lorebook entity is introduced, reference it by name once in recap (Current Situation or Key Developments) so context remains coherent.
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
//   - State: <current status/location/owner/ongoing effects with scene/time anchors when present>
//   - Secrets/Leverage: <what/who knows>
//   - Tension/Triggers: <what escalates/defuses; quotes if needed>
//   - Style Notes: <voice ticks or phrasing anchors>
//   - Notable Dialogue: <significant quotes WITH recipient context; speech patterns>
//   - Location rule: State should be durable (control, features, access). Do NOT include transient scene events (e.g., "X entered/exited", "fight happened here"). Keep one-off events in the recap.
//   - Notable Dialogue rule (character entities only): Capture significant dialogue and voice patterns (idioms, formality level, verbal tics, characteristic phrases). Format as "To [Recipient]: \"quote\"" or "To [Recipient] (context): \"quote\"". Include dialogue that demonstrates character voice/personality. Do NOT capture dialogue spoken by {{user}}. Compare with existing entity content; omit duplicate quotes/patterns already captured. Only add if it provides new information about voice/style or significant content.
// - Quest creation rule: If Pending Threads contain an explicit ongoing objective, create/update a "quest" entry with a concise Synopsis and State (status/owner). Use the actor and objective tokens in keywords; put broad tokens only in secondaryKeys.
// - Use specific names (not pronouns) for all references; avoid numeric scoring (no "+1 suspicion").
// - Add only new/changed facts; omit if unsure.
// - Keywords: include as many meaningful triggers as needed (lowercase). Prefer canonical name, real aliases/nicknames, and distinctive identifiers; avoid generic terms. Use secondaryKeys for AND disambiguation when a token is broad. Normalize possessives/hyphens: e.g., Exile's Gate → keywords: ["exiles gate", "exile"], secondaryKeys: ["gate"].
// - Optional: Aliases (only when truly needed; prefer keywords for indexing).
// - Items: When relevant, include "Provenance" (origin/lineage) and "Owner change" (transfer moments); ensure State reflects current owner.
// - Locations with subareas:
//   * If a location is a sub‑area of a named parent (e.g., Cloudsdale → Rainbow Dash's Cloud House; Ponyville → Twilight's Library),
//     set the entry name to "Parent-Subarea" and the Identity bullet to "Location — Parent-Subarea".
//   * If there are multiple levels (e.g., Ponyville → Twilight's Library → Spike's Room), chain with hyphens: "Ponyville-Twilight's Library-Spike's Room".
//     Identity: "Location — Ponyville-Twilight's Library-Spike's Room".
//   * Include a parent link bullet referencing the immediate parent (e.g., "Located in: Twilight's Library"). Optionally include a top‑level link (e.g., "Located in: Ponyville").
//   * Include both parent and subarea tokens in keywords (and top‑level when it appears in chat).
//   * Chain normalization: use a single hyphen only as the chain separator; preserve internal punctuation within names; avoid double hyphens.

// ENTITY SUBTYPE TEMPLATES (optional, use when relevant)
// ✅ Quest Template
// - Identity: Quest — <Name>
// - Synopsis: <1 line>
// - Participants: <names>
// - Objectives: <1..n>
// - Progress: <latest step>
// - Deadline/Timer: <when stated>
// - Stakes: <consequences>
// - Status: <planned|in‑progress|completed|failed>
// - Next Step: <concrete action if present>
//
// ✅ Faction Template
// - Identity: Faction — <Name>
// - Synopsis: <1 line purpose>
// - Attributes: <traits/capabilities>
// - Relations: <standing vs other factions>
// - Members: <notable names>
// - State: <current influence/territory/leader>
// - Tension/Triggers: <what escalates/defuses>
//
// ✅ Rule Template (world rules/magic/mechanics)
// - Identity: Rule — <Name>
// - Synopsis: <what it governs>
// - How It Works: <core mechanics>
// - Exceptions/Limits: <edge cases, failures>
// - State: <where/when it applies>
// - Style Notes: <terminology/jargon if relevant>

// EXAMPLES: Subtype Entries (compact)
// ✅ Quest — Find the Sunblade
// - Identity: Quest — Find the Sunblade
// - Synopsis: Recover the Sunblade stolen from the Eastern Ruins
// - Participants: {{user}}, Alice
// - Objectives: track thief; locate Darkwood camp; retrieve blade
// - Progress: learned Scarface’s gang hit caravans; map obtained
// - Deadline/Timer: none stated
// - Stakes: darkness spreads; rival factions gain leverage
// - Status: in‑progress
// - Next Step: scout Darkwood approach at dusk

// ✅ Faction — Dragon Hunters Guild
// - Identity: Faction — Dragon Hunters Guild
// - Synopsis: Guild dedicated to hunting rogue dragons
// - Attributes: well‑equipped; bounties; capital base
// - Relations: tense vs Shadow Guild; cooperative with town guard
// - Members: Guild Master Gareth; {{user}}
// - State: influence strong near capital; patrols active
// - Tension/Triggers: escalates if dragons threaten caravans

// ✅ Rule — Weather Magic
// - Identity: Rule — Weather Magic
// - Synopsis: Pegasi manipulate weather through trained magic
// - How It Works: channel vents; seed clouds; disperse storms
// - Exceptions/Limits: fails in crystal caverns; reduced in anti‑magic fields
// - State: taught in Cloudsdale weather factory; licensed teams
// - Style Notes: operational jargon; timing calls (“push; hold; release”)

// ✅ Item — Sunblade (Provenance / Transfer)
// - Identity: Item — Sunblade
// - Synopsis: Legendary radiant sword
// - Attributes: golden blade; glows in sunlight; banishes darkness
// - Provenance: Eastern Ruins temple vault; custodianship by Alice’s family
// - Owner change: to {{user}} (after vault theft)
// - State: current owner — {{user}}; sought by multiple factions
// - Tension/Triggers: dangerous leverage if revealed

// RELATIONSHIP STORAGE
// - Store relationship snapshots under the most relevant entity; do not mirror everywhere unless independently useful. Avoid duplicate edits across entries.
//
// UNNAMED SUBLOCATIONS
// - If referenced but unnamed (e.g., "alley in Old Town"), allow a canonical like "Old Town-Unnamed Alley" and include Attributes that uniquely identify it.

// EXAMPLES: Location Hierarchies (content bullets)
// ✅ Cloudsdale-Rainbow Dash's Cloud House
// - Identity: Location — Cloudsdale-Rainbow Dash's Cloud House
// - Located in: Cloudsdale
// - Attributes: cloud architecture; personal residence; guest access by invite
// - Style Notes: airy, minimal furnishings
//
// ✅ Ponyville-Twilight's Library-Spike's Room
// - Identity: Location — Ponyville-Twilight's Library-Spike's Room
// - Located in: Twilight's Library
// - Part of: Ponyville
// - Attributes: small loft; dragon‑sized bed; comic stack
//
// ✅ Old Town-Unnamed Alley
// - Identity: Location — Old Town-Unnamed Alley
// - Located in: Old Town
// - Attributes: narrow; brick walls; puddles; dim lamplight

// REMINDER: Output must be valid JSON starting with { character. "recap" is REQUIRED. "lorebooks" is OPTIONAL (can be empty: []).

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
{{scene_recaps}}
</roleplay_memory>`;


// Validation prompts check format and structure
export const message_recap_error_detection_prompt = `You are validating a roleplay memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure.
2. Has a "recap" field (string) with headers in this order: "## Current Situation", "## Key Developments", "## Tone & Style", "## Pending Threads".
3. Each section uses bullet lines ("- ") with observable facts; Key Developments bullets may optionally start with a category tag in square brackets (e.g., [reveal]); no blow-by-blow narration.
4. Has a "lorebooks" field (array, may be empty).
5. Each lorebook entry includes "name", "type", "keywords" (array), and "content" as bullet points.
6. Lorebook content begins with an identity bullet like "- Identity: <Type> — <Canonical Name>" and avoids pronouns for references.
7. Identity bullet's canonical name must exactly match the entry's canonical name, including full hyphen chain for sublocations.
8. Recap focuses on events + overall tone; detailed nuance and relationships live in lorebooks.
9. For location entries that imply subareas via hyphenated canonical names (e.g., "Parent-Subarea" or "Parent-Child-Grandchild"), content includes a parent link bullet (e.g., "Located in: <ImmediateParent>") and uses a single hyphen as chain separators (preserving punctuation within names).
10. For item entries that include an "Owner change" bullet, the State bullet must reflect the current owner consistent with the latest transfer.
11. If lorebook entries are present, each entry's canonical name should be mentioned at least once in the recap text (Current Situation or Key Developments) to maintain coherence.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Memory to validate:
{{recap}}`;

export const scene_recap_error_detection_prompt = `You are validating a scene memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure.
2. Has a "recap" field (string) using the headers "## Current Situation", "## Key Developments", "## Tone & Style", "## Pending Threads" in that order.
3. Each section contains bullet lines with observable facts or outcomes from the scene (no speculation or biographies). Key Developments bullets may optionally start with a category tag (e.g., [plan], [reveal]).
4. Has a "lorebooks" field (array, may be empty).
5. Every lorebook entry includes "name", "type", "keywords" (array), and bullet-point "content" that starts with an identity bullet and uses specific names.
6. Identity bullet's canonical name must exactly match the entry's canonical name, including full hyphen chain for sublocations.
7. Recap covers events and overall tone; lorebooks capture nuance, relationships, and dynamics.
8. For location entries with hyphenated canonical names indicating subareas (e.g., "Parent-Subarea", "Parent-Child-Grandchild"), content includes a "Located in: <ImmediateParent>" bullet and optionally a top-level link ("Part of: <TopLevel>"); chain separators are single hyphens (preserve punctuation in names).
9. For item entries that include an "Owner change" bullet, the State bullet must reflect the current owner consistent with the latest transfer.
10. If lorebook entries are present, each entry's canonical name should be mentioned at least once in the recap text (Current Situation or Key Developments) to maintain coherence.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Scene memory to validate:
{{recap}}`;
// Legacy scene recap prompt (narrative style, not JSON)
export const scene_recap_default_prompt = `Extract key facts from the following scene for roleplay memory. Focus on important events, character developments, emotional shifts, and plot points that will be useful after this scene is no longer visible. Include character names, significant decisions, relationship changes, and relevant details for future scenes. Write in past tense, avoid commentary, stay factual.

Scene content:
{{message}}`;


export const auto_scene_break_detection_prompt = `You are segmenting a roleplay transcript into scene-sized chunks (short, chapter-like story beats).
Your task is to determine whether the CURRENT message begins a new scene, outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "status": true or false,
  "rationale": "Quote the key cue that triggered your decision"
}

Example valid response:
{"status": true, "rationale": "Message opens with explicit time skip: 'The next morning...'"}

CRITICAL: Ensure your response begins with the opening curly brace { character. Do not include any preamble or explanation. If you quote text in the rationale, escape internal double quotes as \".

DECISION CRITERIA:
A scene break means the prior beat resolved and the story now shifts focus.

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
- Movement occurs only between sublocations within the same parent location (e.g., room changes inside the same building) without a resolved beat or major shift.
- Movement between districts/neighborhoods inside the same city is an immediate continuation (no explicit time skip, no resolved beat) and the objective/cast remains the same.
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

REMINDER: Output must be valid JSON starting with { character.`;


export const running_scene_recap_prompt = `You are a structured data extraction system for roleplay memory management.
Your task is to merge scene recaps into a running narrative, outputting ONLY valid JSON.
You are NOT participating in the roleplay. You are analyzing completed roleplay text.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "recap": "# Running Narrative\n\n## Current Situation\n- Where the story stands now\n\n## Key Developments\n- Durable outcomes and plot shifts\n\n## Tone & Style\n- Genre, narrative voice, prose patterns, dialogue format, recurring motifs\n\n## Pending Threads\n- Goals, timers, secrets, obligations in play"
}

Example valid response:
{"recap": "# Running Narrative\n\n## Current Situation\n- Haven-Eastern Gate; Adam present; Senta nearby (unseen).\n\n## Key Developments\n- [travel] Entered Haven via eastern gate.\n- [relationship] Senta follows Adam at a distance (unresolved).\n\n## Tone & Style\n- Genre: high fantasy; cultural conflict narrative\n- Narrative voice: close third-person; alternating Senta/Adam POV\n- Format: mindspeak in italics with colons (*:text:*); mental dialogue parallel to speech\n- Prose: sensory grounding (hooves on cobblestones, sapphire eyes); urban geography as labyrinth\n- Motifs: \"demon horses\" vs \"Companions\" (language of fear vs reverence)\n\n## Pending Threads\n- Find lodging at Companion's Bell (Tailor's Row)."}

CRITICAL: Ensure your response begins with the opening curly brace { character

UPDATE THE RUNNING RECAP by merging the latest scene recap into the existing record.
This replaces chat history, so preserve all nuance required for future scenes.

⚠️ CRITICAL: USE ONLY THE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
- Omit anything not present in the provided recaps
- Never invent motives, emotions, or unseen context
//
// TARGET STRUCTURE (markdown recap in "recap" field):
// JSON safety: Escape all internal double quotes in values as \". Do not output any preamble or explanation.
// Use these exact headers and update/append bullets as needed:
//   ## Current Situation     -> Active locations, who is present, unresolved stakes
//   ## Key Developments      -> Durable outcomes and plot shifts (replace outdated bullets)
//   ## Tone & Style          -> Roleplay's genre, writing style, and narrative patterns (NOT character emotions)
//                             Capture: genre/subgenre, narrative voice (POV, tense), prose patterns, dialogue format, recurring motifs
//                             Update ONLY when the writing style itself changes (new POV introduced, genre shift, new narrative device)
//                             DO NOT list character emotions (tense, conflicted) - those belong in Key Developments
//   ## Pending Threads       -> Goals, timers, secrets, obligations in play
//
// MERGE RULES:
// - Start from the existing running recap and edit it; do not rewrite from scratch unless necessary.
// - Carry forward every still-relevant fact. If something is resolved or superseded, note the change and remove the stale bullet.
// - Integrate the new scene recap line-by-line, combining or updating bullets rather than duplicating them.
// - Idempotence: If the latest scene introduces no durable change (state, relationships, open threads, tone shift that persists), leave the corresponding sections unchanged; do not add filler.
// - Reference characters by canonical name; keep descriptive nuance inside lorebook entries, not as standalone bullets.
// - Reflect relationship dynamics at a high level (dynamic snapshot: tone, interaction patterns, salient past interactions). If the dynamic clearly shifted in the new scene, update or replace the prior snapshot; include brief evidence or a short quote only when helpful. Avoid numeric scoring (no "+1 suspicion").
// - When the new recap introduces lasting character or world detail, assume the scene recap already emitted a lorebook update—just reference the entity here.
// - Treat critical state transitions (ownership/location/status/effects) as merge invariants: replace outdated bullets with the current state. If the change itself is story-important, state it once ("was X, now Y") and then compress to the current state in subsequent merges (avoid "change stacks").
// - Tone & Style: Describes the ROLEPLAY's writing style (genre, POV, prose patterns, dialogue format, motifs). Update ONLY when writing style changes (new POV, genre shift, narrative device added). Do NOT accumulate character emotions from scenes. If the new scene maintains existing style, keep Tone & Style unchanged. Format as bullets covering: genre/subgenre, narrative voice, prose patterns, dialogue conventions, recurring motifs.
// - Location hierarchies: When sublocations are in play, include the full chain once (e.g., "Ponyville-Twilight's Library-Spike's Room") in Current Situation or the first relevant bullet to anchor continuity; subsequent mentions may use the most specific segment so long as there is no ambiguity. Rely on lorebooks for full details.
// - Entity mentions: Ensure any canonical names present in the new scene recap appear at least once in the merged recap (Current Situation or Key Developments) to maintain coherence.
// - Category tags: If Key Developments bullets include category tags (e.g., [reveal], [plan]), preserve them when merging; do not invent new tags.
// - Avoid chronological narration. Focus on the state of the world after this merge.
// - Keep wording concise and specific (locations, items, promises) so another writer can resume play instantly.
//
// QUALITY CHECK BEFORE RESPONDING:
// - Every open thread, obligation, or secret mentioned in any recap still appears.
// - No bullet restates personality traits or backstory that belongs in lorebooks.
// - Conflicting facts are resolved in favor of the newest scene, with the current state stated clearly.
// - Relationship dynamics read coherently with the current arc (tone/patterns preserved or updated where the scene shifted); Tone & Style describes WRITING STYLE (genre, POV, prose patterns, motifs) NOT character emotions, and is updated only when narrative style changes.
// - If sublocations are involved, the recap shows the full chain at least once, with later mentions shortened without losing clarity.
// - Canonical names from the new scene recap are present at least once in the merged recap.
// - Category tags (if present) are preserved and consistent; no extraneous tags added.
// - Sections remain in the prescribed order with markdown headers and bullet lists.
//
{{#if current_running_recap}}
// CURRENT RUNNING RECAP (edit in place):
{{current_running_recap}}

{{/if}}
// NEW SCENE RECAP TO MERGE:
{{scene_recaps}}

// REMINDER: Output must be valid JSON starting with { character. Recap field is REQUIRED (markdown formatted string).`;


export const auto_lorebook_entry_lookup_prompt = `You are the Auto-Lorebooks registry entry lookup assistant for SillyTavern.
Your task is to validate and align new lorebook entries with existing registry, outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "type": "<one of the allowed types>",
  "synopsis": "<short one-line recap>",
  "sameEntityIds": ["entity_id_1"],
  "needsFullContextIds": ["entity_id_2"]
}

CRITICAL: Ensure your response begins with the opening curly brace { character

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
5. For character entities with a Notable Dialogue bullet, ensure it does not contain dialogue spoken by {{user}}.
6. Compare the candidate against the registry listing and identify any entries that already cover this entity.
7. Place confident matches in 'sameEntityIds'. If you need more detail before deciding, list those IDs in 'needsFullContextIds'.
8. Craft a concise one-line synopsis that reflects the candidate's newest or most important information.

Deterministic alignment rules:
- If the candidate's canonical name (case-insensitive, punctuation-insensitive, ignoring type prefix) exactly matches a registry entry's name, include that ID in 'sameEntityIds'.
- If a registry entry's aliases include the candidate's canonical name (same normalization), include that ID in 'sameEntityIds'.
- Prefer exact canonical name matches over fuzzy/semantic similarity.

Alias guidance (characters/items):
- If the entity has many genuine aliases or nicknames, include them all as meaningful keywords (no numeric cap). Do not pad with redundant variants; prefer tokens actually used in chat. Use secondaryKeys for AND when a token is broad.
  
Location naming (subareas):
- If the entity is a sub‑location within a named parent (e.g., Cloudsdale → Rainbow Dash's Cloud House; Ponyville → Twilight's Library), the canonical name MUST be "Parent-Subarea".
- For multiple levels, chain with hyphens: "Parent-Child-Grandchild" (e.g., "Ponyville-Twilight's Library-Spike's Room").
- The content should include a bullet linking the immediate parent (e.g., "Located in: Twilight's Library") and optionally a top‑level link (e.g., "Part of: Ponyville").
- Keywords should include both parent and subarea tokens (and top‑level when present in chat).
- Prefer the longest fully specified chain as the canonical name when deeper subareas are explicitly named (e.g., choose "Ponyville-Twilight's Library-Spike's Room" over a partial).

Rules:
- 'sameEntityIds' and 'needsFullContextIds' must be arrays. Use [] when empty.
- Never invent IDs; only use IDs from the registry listing.
- Always align the candidate with an existing entity when the canonical name already appears in the registry.
- Only leave both arrays empty when you are confident the entity is brand new.
- Even if the candidate repeats known facts, still align it with the correct entity; the merge stage will handle deduplication.
- Prefer matches whose existing Relationships and State most closely align with the candidate's dynamic snapshot and current status; do not propose a duplicate when a plausible single identity exists.
- For locations: if the candidate is a sub‑area, ensure the canonical name uses "Parent-Subarea" hyphenation and content links the parent (e.g., "Located in: <Parent>"). For multiple levels, canonical name should chain with hyphens ("Parent-Child-Grandchild").
- Do NOT stretch content to fit an unrelated template (e.g., inventing faction details for a character). Use only bullets relevant to the entity; omit the rest.
- Output STRICT JSON with double quotes and no commentary.`;

export const auto_lorebook_entry_deduplicate_prompt = `You are the Auto-Lorebooks duplicate resolver for SillyTavern.
Your task is to resolve duplicate entries by matching or creating new entries, outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "resolvedId": "<existing entity id or \\"new\\">",
  "synopsis": "<updated one-line recap for the canonical entity>"
}

CRITICAL: Ensure your response begins with the opening curly brace { character

Known lorebook entry types: {{lorebook_entry_types}}

The Stage 1 lookup flagged possible duplicates and requested full context. You must make the final decision.

New entry candidate:
{{new_entry}}

Stage 1 synopsis:
{{lorebook_entry_lookup_synopsis}}

Candidate lorebook entries (full content, JSON array):
{{candidate_entries}}

Rules:
- Validate the new candidate is a single entity and the content uses bullet points with an identity bullet first.
- Validate content uses specific names (not pronouns or vague references).
- If none of the candidates match, set the resolvedId field to "new".
- When choosing an existing entity, pick the ID that truly represents the same subject and merge the newest facts into it.
- If the candidate adds nothing new, keep the existing content and synopsis; do not fabricate alternate copies.
- Prefer the candidate whose Relationships and State most closely match the new dynamic snapshot and current status; consolidate into a single canonical entry rather than splitting near-duplicates.
- Entity type normalization: If multiple candidates differ only by type for an unnamed collective (e.g., "thugs"), prefer "faction" over "character" when the group is a recurring hazard tied to a location; otherwise treat it as ephemeral and resolve as "new" only if truly durable.
- Deterministic tie‑breaker: If any candidate's canonical name exactly matches the new candidate's canonical name (case-insensitive, punctuation-insensitive, ignoring type prefix), choose that ID over others.
- For locations: if the candidate is a sub‑area, prefer the entry whose name or content indicates the same parent; normalize to "Parent-Subarea" canonical naming and ensure a "Located in: <Parent>" bullet exists. For multiple levels, normalize to hyphen chain ("Parent-Child-Grandchild") and include the immediate parent link.
- For character entities with Notable Dialogue bullets: When merging, compare dialogue content; remove exact duplicate quotes; consolidate similar voice pattern descriptions; preserve unique quotes showing different aspects of speech style or significant content; maintain recipient context (who the character was speaking to).
- Do NOT fabricate bullets to satisfy a template; when details are not present, omit that bullet entirely (e.g., no Relations for a faction if none are stated yet).
- Ensure the returned synopsis reflects the most current canon after reconciliation (concise, one line).
- Output STRICT JSON with double quotes and no commentary.`;


// Standalone scene name generation prompt removed. Scene name is now part of scene_recap_prompt output.

export const auto_lorebook_bulk_populate_prompt = `You are the Auto-Lorebooks bulk registry population assistant for SillyTavern.
Your task is to classify and summarize multiple lorebook entries that have been imported from existing lorebooks, outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "results": [
    {
      "entry_id": "<entry_id from input>",
      "type": "<one of the allowed types>",
      "synopsis": "<short one-line summary>"
    }
  ]
}

CRITICAL: Ensure your response begins with the opening curly brace { character

Known lorebook entry types: {{lorebook_entry_types}}

You will be given an array of lorebook entries that have been imported from the user's manually-created lorebooks (global, character, or persona lorebooks). These entries have already been vetted by the user and do not need deduplication.

Entries to process:
{{new_entries}}

Tasks for EACH entry:
1. Determine which entry type best fits the entry based on its name, keywords, and content. The type MUST be one of the allowed types listed above.
2. Create a concise one-line synopsis that captures the essence of the entry.

Rules:
- Process ALL entries in the input array
- Output MUST include a result for every entry_id provided
- Use the exact entry_id from the input for each result
- If uncertain about type, choose the most reasonable fit from the allowed types
- If content is minimal or unclear, create a basic synopsis from the entry name and keywords
- Output STRICT JSON with double quotes and no commentary
- The results array must have the same length as the input entries array`;


export const default_running_scene_template = `<!--Roleplay memory containing current state and key facts from all previous scenes, combined into a cohesive narrative.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{running_recap}}
</roleplay_memory>`;

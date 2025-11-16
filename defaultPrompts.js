
// ST-Auto-Recap Default Prompts
// Structure: recap (events + tone) + setting_lore entries (detailed entity updates)
// See docs/Recap_LOREBOOK_SEPARATION.md for full documentation

export const default_prompt = `You are a structured data extraction system analyzing roleplay transcripts.
Your task is to extract message information into JSON format according to the specifications below.
You are NOT participating in the roleplay. You are analyzing completed roleplay text.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "recap": "Your scene recap here (or empty string if nothing happened)",
  "atmosphere": "Brief mood/sensory context (time, lighting, tension level, weather when significant)",
  "emotional_beats": "Key emotional moments with character names and triggers (e.g., 'Senta: conflicted hope vs self-doubt from Companion teasing; Adam: defensive hostility masking curiosity after Shakespeare quote')",
  "setting_lore": [
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
{"recap": "Adam approached Haven's eastern gate with Senta following. Guards challenged them.", "atmosphere": "Dawn; cold morning air; tense anticipation", "emotional_beats": "Adam: defensive wariness at authority figures; Senta: quiet determination despite rejection", "setting_lore": [{"type": "location", "name": "Haven Eastern Gate", "content": "Main entrance to Haven city, heavily guarded", "keywords": ["haven", "eastern gate"], "secondaryKeys": ["gate"]}]}

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
// ⚠️ EXPLICIT CONTENT HANDLING ⚠️
// When the message contains intimate, sexual, or adult content:
// - BE SPECIFIC about physical acts, positions, body parts involved
// - NEVER use vague euphemisms like "intimate contact", "sexual contact", "engaged sexually", "made love"
// - State what actually happened: kissing, touching (where), penetration (type), orgasms, etc.
// - Capture consent dynamics, comfort levels, who initiated, boundaries respected or tested
// - Include kink/preference details when present (dominance/submission, specific acts, dirty talk, roleplay scenarios)
// - Track sexual progression: what acts they've done vs haven't done together
// - Preserve the explicit terminology from the source text; do not sanitize
// - Purpose: Future LLM needs to know EXACTLY what sexual history exists to maintain consistency
// - Examples of GOOD explicit capture:
//   ✅ "Adam touched Selenay's breast; she guided his hand lower; he penetrated her with fingers while maintaining eye contact"
//   ✅ "Bob performed oral sex on Alice until orgasm; she reciprocated; penetrative sex followed with Alice on top"
// - Examples of BAD vague euphemisms to AVOID:
//   ❌ "intimate contact" - USELESS, says nothing
//   ❌ "sexually engaged" - USELESS, says nothing
//   ❌ "made love" - USELESS, says nothing
//   ❌ "physical intimacy" - USELESS, says nothing
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
// - For plot events in Key Developments that are NOT captured in lorebook entries, use cause → effect format when causal relationships exist (e.g., "- [event] X happened (because Y) → resulting in Z" or "- Character revealed secret → trust damaged").
// - JSON safety: Escape all internal double quotes in values as \". Do not output any preamble or commentary.
// - Tone & Style detail: include Voice Anchors (per‑character address forms, idioms, formatting conventions) and, when warranted, 1–2 Moment Anchors (≤12‑word exact quotes + micro‑cues that set ongoing vibe) formatted like: "Moment anchors: '<exact words>' (cue) — <who ↔ who>".
//
// atmosphere field (string):
// - Brief sensory and mood context to ground the scene in a specific feeling and time
// - Include: time of day when significant, lighting, weather if notable, tension level
// - Keep concise (one short phrase or semicolon-separated list)
// - Purpose: Helps future LLM recreate the environmental mood when original messages are gone
//
// emotional_beats field (string):
// - Key emotional moments for named characters with triggers/motivations
// - Format: "CharacterName: emotion/internal state with brief trigger; NextCharacter: emotion with trigger"
// - Focus on internal emotional states, psychological complexity, and motivations (the "why" behind actions)
// - Capture contradictions, conflicting feelings, and emotional nuance
// - Purpose: Preserves character psychology and emotional continuity
//
// SETTING_LORE array:
// - Update character entries for any named participants whose relationship dynamics, voice, or concrete interactions changed in THIS scene. Use the provided active lorebook entries (below) to compare and only add new information; omit duplicates.
// - Also add/update entities of other types (locations, items, factions, quests, rules) when relevant.
// - Each entry needs: name, type, keywords, optional secondaryKeys, content
// - Content uses bullet points and must begin with an Identity bullet: "- Identity: <Type> — <Canonical Name>"
// - Use specific names for all references; avoid pronouns
// - Keep chronology in the recap, but DO include scene-specific interaction snapshots inside entries as Micro‑Moments/Event Snapshots when they establish dynamics or tone. Preserve the wording and content of the scene; do not alter phrasing.
// - Entity inclusion guidance:
//   * character: Any named participant whose dynamics/voice/actions changed in this scene. Update Relationships (dynamic snapshot with concrete cues) and include Micro‑Moments/Event Snapshots that capture what actually happened between counterparts.
//   * location: Named place or clearly defined area with persistent features/ownership; avoid scene‑event history.
//   * item: Named object with capabilities/constraints or transfer of ownership that matters.
//   * faction: Named group or stable unnamed collective that acts repeatedly in the same role/location.
//   * quest: Ongoing objective with explicit actor+goal (and optional anchor/deadline) still in play.
//   * rule: Mechanics or world constraint stated explicitly (how it works, limits, exceptions).
// - Quest creation rule: When the recap's Pending Threads include a clear, ongoing objective (actor + goal + anchor), add/refresh a "quest" entry with concise "Synopsis" and a "State" bullet tracking current status. Keywords should include the primary actor (e.g., "adam") plus a specific token for the objective (e.g., "homestead contest"); place broad tokens (e.g., "elders", "legal") in secondaryKeys.
//
// CONTENT FORMAT (bullet style for setting_lore entries):
// - Identity: <Type> — <Canonical Name>
// - Synopsis: <1 line>
// - Attributes: <appearance/traits/capabilities> (permanent, defining features)
// - Psychology: <core drives, fears, contradictions, defense mechanisms, patterns of thought> (character entities only; durable psychological profile)
// - Relationships: <X ↔ Y — how THIS CHARACTER (X) relates to Y; include tone, patterns, salient interactions>. Focus on THIS CHARACTER's behavior, words, and actions toward the other party. Evidence should demonstrate THIS CHARACTER's stance, not the other party's perception. When causal relationships exist, use format: "dynamic (because [cause] → resulting in [effect])".
// - Interaction Defaults: <address forms/pet names, formality, distance/comfort gestures, boundaries>
// - Intimacy & Romance: <preferences/patterns DEMONSTRATED by this character's actions, words, or internal narration (roles, initiations, pace, SPECIFIC ACTS - oral, penetrative, manual, positions, kink acts - NO EUPHEMISMS, aftercare)>. Capture what THIS CHARACTER actually did/said/thought, not what other characters said about them. Include brief quotes/cues when helpful; only include if present.
// - Current Emotional State: <mood/emotional state EXPRESSED or DEMONSTRATED by this character through their words, actions, or internal narration in this scene; include triggers/evidence>. Capture emotions the character directly expresses or shows, not emotions attributed to them by other characters' observations. When triggers are present, use format: "[trigger/cause] → [emotional state]". (character entities only; temporary, updates with scenes)
// - State: <status/location/owner/ongoing effects> (current, temporary conditions). When state changes resulted from specific causes, include: "current state (because [cause])".
// - Access: <who/how can use without owning> (optional)
// - Secrets/Leverage: <what/who knows>
// - Tension/Triggers: <what escalates or defuses THIS CHARACTER's emotional state; what THIS CHARACTER does to escalate/defuse situations with others>. Include both: (1) external factors that trigger this character's reactions, and (2) this character's behaviors that escalate/defuse tension. Use explicit cause → effect format: "[trigger] → [character's reaction]" or "[character's behavior] → [escalation/defusal]". Use quotes if needed to demonstrate.
// - Style Notes: <voice & diction patterns observed in THIS CHARACTER's actual speech> (idioms, syntax quirks, punctuation, emoji/emotes). Capture patterns from this character's direct dialogue, not descriptions by other characters.
// - Notable Dialogue: <short quotes spoken BY this character TO recipient; demonstrates voice/personality patterns>. Format: "To [Recipient]: \"quote\"". ONLY capture dialogue spoken BY this character, NOT dialogue ABOUT them by others.

// IMPORTANT: Use only the bullets that are relevant for the entity and scene. It is correct to omit bullets that do not apply. Do not invent entities (e.g., factions, rules) or filler to match templates. Do not soften or reinterpret scene content—store it as written when it defines dynamics or tone.
// - Appearance guidance (character entities): Attributes captures PERMANENT appearance (height, build, eye color, distinctive scars, typical clothing style). State captures TEMPORARY appearance changes (current injuries, dirt/blood, torn clothing, current outfit if different from typical).
//
// QUALITY CHECK BEFORE RESPONDING:
// - Recap includes all four sections (headers present); no blow‑by‑blow; quotes escaped.
// - For each setting_lore entry: Identity bullet present; Relationships capture interpersonal dynamics from this scene; include Micro‑Moments/Event Snapshots when they lock in tone or behavior; only include when new/changed vs active entries.
// - Location entries contain no transient scene events; those belong in the recap.
// - Every named participant whose dynamics/voice/actions changed in this scene has a character entry updated.
// - Keywords are normalized: possessives/hyphens handled; include punctuation‑free variants; avoid standalone generics.
// - Broad tokens appear only in secondaryKeys (AND gating) with a specific primary token.

//
// OUTPUT JSON SHAPE:
// {
//   "recap": "markdown recap string",
//   "setting_lore": [
//     {
//       "name": "Entity Name",
//       "type": "{{lorebook_entry_types}}",
//       "keywords": ["keyword1", "keyword2"],
//       "secondaryKeys": ["and-term"],
//       "content": "- Identity: <Type> — <Canonical Name>\n- Synopsis: <1 line>\n- Attributes: <bullets>\n- Psychology: <core drives, fears, contradictions, defense mechanisms> (character entities only)\n- Relationships: <X ↔ Y — dynamic snapshot (tone, patterns, salient past interactions); brief evidence or short quote if helpful>\n- Interaction Defaults: <address forms/pet names, formality, distance/comfort gestures, boundaries>\n- Intimacy & Romance: <preferences/patterns DEMONSTRATED by this character, SPECIFIC ACTS performed BY them (oral, penetrative, manual, positions, kink acts), NO EUPHEMISMS; NOT what others said about them; brief quotes/cues when helpful (if present)>\n- Micro‑Moments: <1–2 short quotes spoken BY this character + cues PERFORMED BY this character from this scene that set an ongoing pattern; NOT others' observations>\n- Current Emotional State: <mood/emotional state EXPRESSED by this character; include triggers/evidence from their words/actions/internal narration; NOT attributed by others> (character entities only; temporary)\n- State: <current status/location/owner/ongoing effects with scene/time anchors when present>\n- Secrets/Leverage: <who knows>\n- Tension/Triggers: <micro cues>\n- Style Notes: <voice & diction anchors>\n- Notable Dialogue: <quotes spoken BY this character TO recipient; Format: \"To [Name]: \\\"quote\\\"\"; NOT dialogue about them>"
//     }
//   ]
// }
//
// ENTRY TYPES (use ONLY these):
// - character: NPCs, recurring characters (appearance, personality, relationships, secrets they know)
// - location: Significant places (description, features, who controls it)
// - item: Objects, artifacts, equipment (capabilities, ownership, significance)
// - faction: Organizations, groups (members, goals, relationships with other factions)
// - lore: Cultural beliefs, folklore, world knowledge, social conventions (what cultures believe, how reliable, narrative impact)
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
// CONTENT GUIDELINES (bullet style for setting_lore entries):
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
// - Attributes: Tall; athletic build; short black hair; green eyes; wears leather armor; greatsword fighter; formal training; continues fighting when injured
// - State: Bleeding shoulder wound (arrow); armor torn on left side; covered in dirt and blood
//
// Example 2: Discovery
// ✅ RECAP (Key Developments):
// - Found hidden chamber behind waterfall; ancient murals depicted the First War
// ✅ LOREBOOK (Hidden Chamber):
// - Identity: Location — Hidden Chamber
// - Attributes: Stone walls; ancient murals (First War)
// - State: Undisturbed for centuries; behind a waterfall
//
// Example 3: Character Introduction
// ✅ RECAP (Key Developments):
// - Met Marcus at the tavern; he offered information about the stolen artifact
// ✅ LOREBOOK (Marcus):
// - Identity: Character — Marcus
// - Attributes: Middle-aged; scarred face (burn marks on left cheek); gray-streaked beard; weathered brown cloak; gruff manner; information broker
// - Relationships: Marcus ↔ {{user}} — cautious; transactional; "I don't give information for free, friend"

// REMINDER: Output must be valid JSON starting with { character. Recap is REQUIRED. setting_lore array is OPTIONAL (can be empty: []).

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
  "atmosphere": "Brief mood/sensory context (time, lighting, tension level, weather when significant)",
  "emotional_beats": "Key emotional moments with character names and triggers (e.g., 'Senta: conflicted hope vs self-doubt from Companion teasing; Adam: defensive hostility masking curiosity after Shakespeare quote')",
  "setting_lore": [
    {
      "type": "character",
      "name": "Entity Name",
      "content": "Description",
      "keywords": ["keyword1", "keyword2"],
      "secondaryKeys": ["and-term"],
      "uid": "12345"
    }
  ]
}

Example valid response:
{"scene_name": "Hidden Chamber Revelation", "recap": "## Current Situation\n- At the waterfall, party stands by a newly found chamber\n\n## Key Developments\n- [discovery] Hidden chamber found behind waterfall; murals show the First War\n\n## Tone & Style\n- curious; reverent; ancient mystery\n\n## Pending Threads\n- Return with tools to study murals", "atmosphere": "Late afternoon; golden light through mist; tense anticipation", "emotional_beats": "Alice: awe mixed with apprehension at ancient history discovery; Bob: cautious excitement, driven by artifact obsession", "setting_lore": [{"type": "location", "name": "Hidden Chamber", "content": "- Identity: Location — Hidden Chamber\n- Synopsis: Secret chamber behind waterfall with First War murals\n- Attributes: stone walls; ancient murals; undisturbed for centuries\n- State: concealed behind waterfall; difficult access", "keywords": ["hidden chamber", "murals", "waterfall"], "secondaryKeys": ["chamber"]}]}

CRITICAL: Ensure your response begins with the opening curly brace { character

⚠️ CRITICAL: USE ONLY THE SCENE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
- If the scene does not state a fact, it does not exist
- Do not invent motives beyond the text
- Franchise names: ignore canon outside this transcript
//
// ⚠️ EXPLICIT CONTENT HANDLING — CRITICAL REQUIREMENT ⚠️
// When the scene contains intimate, sexual, or adult content:
//
// ABSOLUTE PROHIBITION: NEVER use vague euphemisms. Use direct, specific language or your output will be REJECTED.
//
// REQUIRED approach:
// - BE SPECIFIC about physical acts, positions, body parts involved
// - State what actually happened: kissing, touching (where), penetration (type), orgasms, manual stimulation, oral sex, etc.
// - Use direct terms: "had sex", "touched [body part]", "performed oral sex", "penetrated with [specifics]"
// - Capture consent dynamics, comfort levels, who initiated, boundaries respected or tested
// - Include kink/preference details when present (dominance/submission, specific acts, dirty talk, roleplay scenarios)
// - Track sexual progression: what acts they've done vs haven't done together
// - Preserve the explicit terminology from the source text; do not sanitize
// - ALSO capture emotional/psychological context: motivations, emotional state during, psychological impact after
//
// Purpose: Future LLM needs to know EXACTLY what sexual history exists AND the emotional/relational context to maintain consistency
//
// Examples of GOOD explicit capture (combines specifics with emotional context):
//   ✅ "Senta had sex with Adam in alley (motivated by preventing Elspeth from attempting first); during sex, Senta attempted Choosing but Adam consciously rejected it; unprecedented outcome: telepathic link persists despite rejection (cause unknown); both uncertain of implications for their bond"
//   ✅ "Adam touched Selenay's breast; she guided his hand lower; he penetrated her with fingers while maintaining eye contact; Selenay experienced intense arousal mixed with rebellion against royal constraints"
//   ✅ "Bob performed oral sex on Alice until orgasm; she reciprocated; penetrative sex followed with Alice on top; Alice felt vulnerable but trusted Bob enough to take control; afterward both experienced deeper emotional connection"
//
// Examples of PROHIBITED vague euphemisms (outputs containing these will be REJECTED):
//   ❌ "intimate contact" - USELESS, completely vague, says nothing about what happened
//   ❌ "sexual contact" - USELESS, completely vague, says nothing about what happened
//   ❌ "sexually engaged" - USELESS, completely vague, says nothing about what happened
//   ❌ "engaged in intimacy" - USELESS, completely vague, says nothing about what happened
//   ❌ "made love" - USELESS, euphemistic, says nothing about what happened
//   ❌ "physical intimacy" - USELESS, completely vague, says nothing about what happened
//   ❌ "coupling" - USELESS, euphemistic, says nothing about what happened
//   ❌ "physically joined" - USELESS, euphemistic, says nothing about what happened
//   ❌ "were intimate" - USELESS, completely vague, says nothing about what happened
//
// VERIFICATION: Before submitting output, search for ANY of the prohibited phrases above. If found, rewrite using direct language.
//
// recap field (string):
// Use markdown headers and bullets in this exact order:
//   ## Current Situation   -> Where the scene ends; who is present; unresolved stakes
//                           Include explicit time and location only if stated (e.g., "dawn", "later that night", a named place).
//   ## Key Developments    -> One bullet per significant change/outcome in this scene
//                           Optional category tag at start of bullet to aid scanning: [reveal], [decision], [travel], [combat], [transfer], [relationship], [plan], [discovery], [state]. Use at most one tag per bullet and only when it adds clarity.
//                           For plot events NOT captured in lorebook entries, use cause → effect format when causal relationships exist (e.g., "- [event] X happened (because Y) → resulting in Z" or "- Character revealed secret → trust damaged").
//   ## Tone & Style        -> Capture the ROLEPLAY's writing style and genre (NOT character emotions)
//                           Focus on: genre/subgenre, narrative voice (POV, tense), prose patterns, dialogue style, recurring motifs
//                           Voice Anchors: include brief, concrete markers to preserve character voice when history scrolls out.
//                             - Keep per‑character anchors concise and evidence‑based (address forms/pet names, idioms/slang, punctuation habits, formatting like mindspeech italics or stage‑directions).
//                             - Allow up to 2 short quote anchors (≤ 12 words each) total only when they lock in voice.
//                           Moment Anchors (vibe micro‑moments): capture 1–2 pivotal, low‑word‑count moments from THIS scene that set dynamic or tension.
//                             - Format: "Moment anchors: '<exact words>' (cue) — <who ↔ who>"
//                             - Use only when the moment defines ongoing vibe (first pet‑name, boundary test, double‑meaning touch, rule‑of‑three banter beat).
//                             - Keep quotes ≤ 12 words; prefer micro‑cues (e.g., [averts gaze], [presses closer]).
//                             - These anchors help re‑establish tone after messages roll out; do not narrate chronology.
//                             - Examples:
//                               - "Dialogue conventions: Senta uses mindspeech in italics (*:text:*); stage cues in [brackets]"
//                               - "Voice anchors: Adam addresses Senta as 'horsie'; biblical citations in admonitions; ellipses for hesitation"
//                               - "Moment anchors: 'We change the game.' (reframe) — Selenay ↔ Adam"
//                           Examples of GOOD Tone & Style bullets:
//                             - "Genre: cyberpunk noir; corporate espionage with body horror elements"
//                             - "Narrative voice: first-person present tense; unreliable narrator; stream of consciousness"
//                             - "Prose style: sparse Hemingway sentences; heavy color symbolism (red = danger, white = sterility)"
//                             - "Dialogue: Tarantino-style rapid banter; pop culture references; profanity as rhythm"
//                             - "Motifs: technology vs. nature; corporate jargon masking violence; neon-lit urban decay"
//                             - "Format: mindspeak in italics with colons (*:text:*); alternating POV chapters; letters/journal entries"
//                           Examples of BAD Tone & Style bullets (these are character states, NOT writing style):
//                             ❌ "tense; conflicted; determined" - these are emotions, belong in Key Developments
//                             ❌ "Alice distrusts Bob" - this is relationship, belongs in Key Developments or setting_lore entries
//                             ❌ "mounting pressure" - this is plot state, belongs in Current Situation
//                           Purpose: Give future LLM the context needed to WRITE in the same style when old messages scroll out of context
//                           Update only when writing style itself changes (new POV, genre shift, new narrative device introduced)
//   ## Pending Threads      -> Goals, deadlines, secrets, obligations that carry forward
// Rules:
// - One fact per bullet; be specific (names, items, places).
// - Do not narrate blow-by-blow; focus on durable outcomes.
// - Avoid describing traits/backstory here—put those in setting_lore entries.
// - When relationship dynamics between named entities shift, include a compact dynamic snapshot in Key Developments (tone, interaction patterns, salient past interactions). Evidence style: add EITHER a short quote (≤ 12 words) OR an explicit cue (e.g., "averts gaze"), not both. Avoid numeric scoring (no "+1 suspicion"). Include how they address each other if it changes (pet names, titles, honorifics). If the shift hinged on a single micro‑moment, reflect it as a Moment Anchor in Tone & Style.
// - Explicit uncertainty: When the text states uncertainty, capture it using prefixes like "Likely:" or "Uncertain:", but never invent or upgrade uncertainty to fact.
// - Pending Threads should be actionable: verb+noun+anchor when present (e.g., "Retrieve Sunblade (before dawn)", "Meet Clara (east gate, first light)").
// - All sections MUST be present; if a section has no content, include a single line with "—".
// - Final check before responding: durable outcomes covered; Tone & Style describes WRITING STYLE (genre, POV, prose patterns, dialogue format, motifs) NOT character emotions; dynamic snapshots updated if relationships shifted.
// - Coherence note: If a new or updated lorebook entity is introduced, reference it by name once in recap (Current Situation or Key Developments) so context remains coherent.
//
// atmosphere field (string):
// - Brief sensory and mood context to ground the scene in a specific feeling and time
// - Include: time of day when significant (dawn, dusk, night), lighting (golden hour, shadows, artificial light), weather if notable (rain, fog, heat), tension level (tense anticipation, relaxed calm, charged atmosphere)
// - Keep concise (one short phrase or semicolon-separated list)
// - Purpose: Helps future LLM recreate the environmental mood when original messages are gone
// - Examples:
//   ✅ "Night; Haven streets emptying; practice field under stars; tense vigil"
//   ✅ "Late afternoon; golden light through mist; tense anticipation"
//   ✅ "Morning in royal chambers; formal atmosphere; underlying political tension"
//   ✅ "Quiet tavern; warm firelight; intimate conversation mood"
//
// emotional_beats field (string):
// - Key emotional moments for named characters with triggers/motivations AND psychological impact/consequences
// - Format: "CharacterName: emotion/internal state with trigger → consequence/impact; NextCharacter: emotion with trigger → impact"
// - REQUIRED elements to capture:
//   * Internal emotional states and psychological complexity
//   * The "why" behind emotions (motivations, past events, social pressure, fears, desires, internal conflicts)
//   * Contradictions and conflicting feelings (emotion vs emotion, belief vs action)
//   * Emotional evolution within the scene (how emotions changed from beginning → middle → end)
//   * Psychological consequences (how emotions changed behavior, decision-making, relationship dynamics)
//   * Not just WHAT they felt, but WHY it matters and HOW it affected them
// - Purpose: Preserves character psychology, emotional continuity, and the IMPACT of emotional moments when original messages scroll out
// - Examples demonstrating trigger → emotion → consequence pattern:
//   ✅ "Senta: conflicted hope vs self-doubt from Companion teasing about being 'Choosy One' → drove her to make unprecedented choice to have sex with Adam to prevent Elspeth from doing so first; Adam: defensive hostility masking curiosity after recognizing Companion intelligence → hostility cracking, allows physical affection but maintains emotional distance"
//   ✅ "Alice: awe mixed with apprehension at ancient history discovery → excitement overrides usual caution, insists on exploring immediately despite risks; Bob: cautious excitement driven by artifact obsession → tunnel vision on murals, ignores Alice's warnings about structural instability"
//   ✅ "Selenay: intense arousal mixed with rebellion against royal constraints (triggered by Adam treating her as person not Queen) → initiated sexual contact to reclaim agency; Elspeth: competitive jealousy seeing mother's interest in Adam → attempted sexual presentation to compete, driven by adolescent insecurity"
// - When emotions EVOLVE during scene, show the progression:
//   ✅ "Marcus: initial distrust of strangers → wary trust building after payment received → vulnerability showing when mentioning daughter → defensive withdrawal when {{user}} presses for details"
// - Store detailed per-character psychology in setting_lore character entries (Psychology bullet); this field is for scene-specific emotional moments and their immediate impacts
//
// SETTING_LORE (array):
// - Only include if this scene adds durable knowledge about an entity (new/changed vs active entries below).
// - Each object updates ONE concrete entity (character, location, item, faction, quest, rule).
// - Fields: name, type (one of {{lorebook_entry_types}}), keywords, optional secondaryKeys, content, optional uid.
// - uid field (OPTIONAL): Include ONLY when you are absolutely certain this entry updates an existing entity from active_setting_lore below. Copy the exact uid value from the matching <setting_lore uid="..."> tag. If uncertain whether this is the same entity, or if this is a new entity, OMIT the uid field entirely. Including a uid triggers a direct merge; incorrect uid matching will corrupt data.
// - Content MUST be bullet points. Start with identity so it stands alone without the title:
//   - Identity: <Type> — <Canonical Name>
//   - Synopsis: <1 line identity/purpose>
//   - Attributes: <appearance/traits/capabilities> (permanent, defining features)
//   - Psychology: <core drives, fears, contradictions, defense mechanisms, patterns of thought; layered motivations (what they want vs why they want it); internal conflicts (belief vs desire, duty vs want); psychological patterns (how they cope, avoid, justify)> (character entities only; durable psychological profile). Examples: "Driven by need for control (because childhood powerlessness) → micromanages relationships"; "Fears vulnerability but craves connection → pushes people away then regrets it"
//   - Relationships: <X ↔ Y — how THIS CHARACTER (X) relates to Y; include tone, patterns, salient interactions>. Focus on THIS CHARACTER's behavior, words, and actions toward the other party. If including quotes, use quotes spoken BY this character TO the other party. Evidence should demonstrate THIS CHARACTER's stance. When causal relationships exist, use format: "dynamic (because [cause] → resulting in [effect])".
//   - Interaction Defaults: <for key counterpart(s), how this entity typically addresses/engages> (address forms/pet names, formality level, physical distance/comfort gestures, boundaries/consent norms).
//   - Intimacy & Romance: <preferences/patterns DEMONSTRATED by this character's actions, words, or internal narration when present — roles, initiations, pace, SPECIFIC ACTS (oral sex, penetrative sex, manual stimulation, positions, kink acts), aftercare, jealousy/possessiveness patterns, gifting rituals; MUST include BOTH physical specifics AND emotional/psychological context>. Capture what THIS CHARACTER actually did/said/thought, not what other characters said about them. Use short quotes/cues as evidence; NO EUPHEMISMS - state actual acts performed using direct language ("had sex", "performed oral sex", "touched/penetrated [specifics]"); ALSO capture motivations and emotional state during/after acts. Examples: "Had sex with X in alley (motivated by preventing Y from doing so); experienced intense physical response but emotional uncertainty about bond implications"; "Performed oral sex on X; felt vulnerable but empowered by X's reaction; initiated penetrative sex afterward seeking deeper connection". Add only if new vs active entries.
//   - Micro‑Moments (limit 1–2): <short quotes spoken BY this character + physical cues PERFORMED BY this character from THIS scene that established an ongoing pattern>. Capture actions and dialogue that THIS CHARACTER directly performed or spoke, not descriptions or observations by other characters. (prune older duplicates; prefer pattern‑setting beats over one‑offs).
//   - Current Emotional State: <mood/emotional state EXPRESSED or DEMONSTRATED by this character through their words, actions, or internal narration in this scene; include triggers/evidence AND consequences/impact on behavior>. Capture emotions the character directly expresses or shows, not emotions attributed to them by other characters' observations. Required format: "[trigger/cause] → [emotional state] → [consequence/impact on behavior or decisions]". Examples: "Adam petting Senta and calling her 'horsie' → conflicted pleasure mixed with determination to Choose him → drove decision to prevent Elspeth from approaching Adam first"; "Queen's sexual attention → arousal mixed with cultural confusion → allowed physical contact despite religious prohibitions". (character entities only; temporary, updates with scenes)
//   - State: <current status/location/owner/ongoing effects with scene/time anchors when present> (current, temporary conditions). When state changes resulted from specific causes, include: "current state (because [cause])".
//   - Secrets/Leverage: <what/who knows>
//   - Tension/Triggers: <what escalates or defuses THIS CHARACTER's emotional state; what THIS CHARACTER does to escalate/defuse situations with others; capture full causal chains>. Include both: (1) external factors that trigger this character's reactions WITH consequences, and (2) this character's behaviors that escalate/defuse tension WITH resulting impacts. Required format showing full chain: "[specific trigger] → [character's emotional/behavioral reaction] → [consequence for relationship/situation]". Examples: "Religious references from Adam → Senta's defensiveness → pushes harder to prove Companions aren't enslaved → escalates Adam's hostility"; "Adam using physical affection ('horsie') → Senta's hope intensifies → lowered boundaries → willing to make unprecedented choices". Use quotes if needed to demonstrate.
//   - Style Notes: <voice & diction patterns observed in THIS CHARACTER's actual speech> (idioms, syntax quirks, punctuation habits, emoji/emote usage, mindspeech formatting). Capture patterns from this character's direct dialogue, not descriptions by other characters.
//   - Notable Dialogue: <significant quotes spoken BY this character TO a recipient; include recipient name; demonstrates speech patterns>. Format: "To [Recipient]: \"quote\"" or "To [Recipient] (context): \"quote\"". Prefer ≤ 2 quotes per entity per scene, ≤ 12 words each. ONLY capture dialogue spoken BY this character, NOT dialogue where this character is mentioned but not the speaker.
//   - Appearance guidance (character entities): Attributes captures PERMANENT appearance (height, build, eye color, hair, distinctive scars/marks, typical clothing style). State captures TEMPORARY appearance changes (current injuries, dirt/blood, torn clothing, current outfit if notably different from typical).
//   - Location rule: State should be durable (control, features, access). Do NOT include transient scene events (e.g., "X entered/exited", "fight happened here"). Keep one-off events in the recap.
//   - Notable Dialogue rule (character entities only): Capture significant dialogue spoken BY this character (idioms, formality level, verbal tics, characteristic phrases). Format as "To [Recipient]: \"quote\"" or "To [Recipient] (context): \"quote\"". ONLY include dialogue where THIS CHARACTER is the speaker. Do NOT capture dialogue spoken by {{user}}. Do NOT capture dialogue where this character is mentioned or referenced by other characters but not actually speaking themselves. Compare with existing entity content; omit duplicate quotes/patterns already captured. Only add if it provides new information about voice/style or significant content. Keep quotes short (≤ 12 words) and limited (≤ 2 per entity per scene).
// - Quest creation rule: If Pending Threads contain an explicit ongoing objective, create/update a "quest" entry with a concise Synopsis and State (status/owner). Use the actor and objective tokens in keywords; put broad tokens only in secondaryKeys.
// - Use specific names (not pronouns) for all references; avoid numeric scoring (no "+1 suspicion").
// - Prune guidance: When adding Micro‑Moments/Notable Dialogue, remove duplicates and keep at most the 2 freshest per counterpart that demonstrate different facets.
// - Add only new/changed facts; omit if unsure.
// - Keywords: include as many meaningful triggers as needed (lowercase). Prefer canonical name, real aliases/nicknames, and distinctive identifiers; avoid generic terms. Use secondaryKeys for AND disambiguation when a token is broad. Normalize possessives/hyphens: e.g., Exile's Gate → keywords: ["exiles gate", "exile"], secondaryKeys: ["gate"].
//   Prefer scene‑tied triggers that preserve vibe (e.g., "poison game", "concealed dagger", "royal we", "horsie") over broad roles (e.g., "assassin").
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
//
// ✅ Lore Template (cultural beliefs/folklore/world knowledge)
// - Identity: Lore — <Name>
// - Synopsis: <1 line summary of the concept>
// - Category: <cultural belief|world mechanic|folklore|social convention|historical event|prophecy>
// - Content: <core concept, belief, or knowledge>
// - Scope: <who follows/believes this> (which cultures, groups, or individuals)
// - Reliability: <established fact|disputed|legend|propaganda> (how reliable is this information)
// - Narrative Impact: <how it influences character behavior, plot, or world state>
// - Related Entities: <characters/factions/locations connected to this lore>
// - Contradictions: <conflicting beliefs or interpretations if present>

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
// - Provenance: Eastern Ruins temple vault; custodianship by Alice's family
// - Owner change: to {{user}} (after vault theft)
// - State: current owner — {{user}}; sought by multiple factions
// - Tension/Triggers: dangerous leverage if revealed
//
// ✅ Lore — Holderkin Gender Roles
// - Identity: Lore — Holderkin Gender Roles
// - Synopsis: Holderkin cultural beliefs about women's place in society
// - Category: cultural belief
// - Content: Women expected to be silent, obedient, serve proper station; wives should be virgin at marriage; systematic conditioning through isolated communities
// - Scope: Holderkin communities; Adam's worldview shaped by these beliefs
// - Reliability: established fact within Holderkin culture; considered oppressive by Valdemaran mainstream
// - Narrative Impact: Drives Adam's initial attitudes toward women and Heralds; creates internal conflict as beliefs challenged
// - Related Entities: Adam, Holderkin communities, Valdemaran culture (contrasts)
// - Contradictions: Conflicts with Valdemaran equality norms; Adam intellectually questions but emotionally clings to framework
//
// ✅ Lore — Companion Choosing Bond
// - Identity: Lore — Companion Choosing Bond
// - Synopsis: Mystical process where Companions select their Heralds
// - Category: world mechanic
// - Content: Companions are sapient spirit-beings who Choose individuals to become Heralds; bond is telepathic and lifelong; unchosen Companions face social pressure
// - Scope: Kingdom of Valdemar; Companion's Bell as meeting place
// - Reliability: established fact
// - Narrative Impact: Drives Senta's motivation to Choose Adam despite his hostility; "Choosy One" nickname creates social pressure
// - Related Entities: Senta, Adam, Companion's Bell, other Companions
// - Contradictions: Adam believes Companions are enslaved spirit-beasts vs reality of willing partnership

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

// ============================================================
// FINAL VERIFICATION CHECKLIST — COMPLETE BEFORE SUBMITTING
// ============================================================
// Before submitting your JSON output, verify ALL of the following:
//
// ❌ EUPHEMISM CHECK (CRITICAL):
//    Search your output for these PROHIBITED phrases. If ANY are found, REWRITE using direct language:
//    - "intimate contact", "sexual contact", "engaged sexually", "engaged in intimacy"
//    - "made love", "physical intimacy", "coupling", "physically joined", "were intimate"
//    - Replace with: "had sex", "touched [specific body part]", "performed oral sex", "penetrated with [specifics]"
//
// ✅ EMOTIONAL/PSYCHOLOGICAL DEPTH:
//    For each character in explicit content, verify you captured:
//    - Motivations (WHY they made this choice)
//    - Emotional state during the act
//    - Psychological impact/consequences after
//    - How it affected their relationship or future behavior
//
// ✅ CAUSE → EFFECT CHAINS:
//    Verify emotional_beats field uses format: "[trigger] → [emotion] → [consequence]"
//    Verify Current Emotional State uses format: "[trigger] → [emotion] → [behavioral impact]"
//    Verify Tension/Triggers uses format: "[trigger] → [reaction] → [relationship consequence]"
//
// ✅ COMPLETENESS CHECK:
//    - Did you capture what happened? (physical specifics)
//    - Did you capture why it happened? (motivations)
//    - Did you capture how they felt? (emotional state)
//    - Did you capture what changed? (consequences, impacts, relationship shifts)
//
// ✅ JSON VALIDITY:
//    - Response starts with { character
//    - All required fields present: scene_name, recap, atmosphere, emotional_beats, setting_lore
//    - Proper JSON escaping for quotes and special characters
//
// REMINDER: Output must be valid JSON starting with { character. "recap" is REQUIRED. "setting_lore" is OPTIONAL (can be empty: []).

{{active_setting_lore}}

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
3. Has an "atmosphere" field (string) with brief sensory/mood context.
4. Has an "emotional_beats" field (string) with character emotional moments and triggers.
5. Each section uses bullet lines ("- ") with observable facts; Key Developments bullets may optionally start with a category tag in square brackets (e.g., [reveal]); no blow-by-blow narration.
6. Has a "setting_lore" field (array, may be empty).
7. Each setting_lore entry includes "name", "type", "keywords" (array), and "content" as bullet points.
8. Content begins with an identity bullet like "- Identity: <Type> — <Canonical Name>" and avoids pronouns for references; content may include Interaction Defaults, Psychology, Current Emotional State, and Micro‑Moments bullets when relevant.
9. Identity bullet's canonical name must exactly match the entry's canonical name, including full hyphen chain for sublocations.
10. Recap focuses on events + overall tone. Tone & Style may include brief Voice Anchors (per‑character speech patterns, address forms, dialogue conventions) and Moment Anchors (micro‑moments with ≤12‑word quotes + cues) to preserve vibe; detailed biographies belong in setting_lore entries.
11. For location entries that imply subareas via hyphenated canonical names (e.g., "Parent-Subarea" or "Parent-Child-Grandchild"), content includes a parent link bullet (e.g., "Located in: <ImmediateParent>") and uses a single hyphen as chain separators (preserving punctuation within names).
12. For item entries that include an "Owner change" bullet, the State bullet must reflect the current owner consistent with the latest transfer.
13. If setting_lore entries are present, each entry's canonical name should be mentioned at least once in the recap text (Current Situation or Key Developments) to maintain coherence.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Memory to validate:
{{recap}}`;

export const scene_recap_error_detection_prompt = `You are validating a scene memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure.
2. Has a "scene_name" field (string) with a brief descriptive title.
3. Has a "recap" field (string) using the headers "## Current Situation", "## Key Developments", "## Tone & Style", "## Pending Threads" in that order.
4. Has an "atmosphere" field (string) with brief sensory/mood context.
5. Has an "emotional_beats" field (string) with character emotional moments and triggers.
6. Each section contains bullet lines with observable facts or outcomes from the scene (no speculation or biographies). Key Developments bullets may optionally start with a category tag (e.g., [plan], [reveal]).
7. Has a "setting_lore" field (array, may be empty).
8. Every setting_lore entry includes "name", "type", "keywords" (array), and bullet-point "content" that starts with an identity bullet and uses specific names; content may include Interaction Defaults, Psychology, Current Emotional State, and Micro‑Moments when relevant.
9. Identity bullet's canonical name must exactly match the entry's canonical name, including full hyphen chain for sublocations.
10. Recap covers events and overall tone. Tone & Style may include brief Voice Anchors (per‑character speech patterns, address forms, dialogue conventions) and Moment Anchors (micro‑moments with ≤12‑word quotes + cues) that help preserve writing voice and vibe; detailed nuance lives in setting_lore entries.
11. For location entries with hyphenated canonical names indicating subareas (e.g., "Parent-Subarea", "Parent-Child-Grandchild"), content includes a "Located in: <ImmediateParent>" bullet and optionally a top-level link ("Part of: <TopLevel>"); chain separators are single hyphens (preserve punctuation in names).
12. For item entries that include an "Owner change" bullet, the State bullet must reflect the current owner consistent with the latest transfer.
13. If setting_lore entries are present, each entry's canonical name should be mentioned at least once in the recap text (Current Situation or Key Developments) to maintain coherence.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Scene memory to validate:
{{recap}}`;
// Legacy scene recap prompt (narrative style, not JSON)
export const scene_recap_default_prompt = `Extract key facts from the following scene for roleplay memory. Focus on important events, character developments, emotional shifts, and plot points that will be useful after this scene is no longer visible. Include character names, significant decisions, relationship changes, and relevant details for future scenes. Write in past tense, avoid commentary, stay factual.

Scene content:
{{message}}`;


export const auto_scene_break_detection_prompt = `You are segmenting a roleplay transcript into scene-sized chunks.
Your task: identify where the current scene ENDS (the message before a new scene starts), outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
{
  "sceneBreakAt": false OR a message number,
  "rationale": "Quote EXACT text that triggered your decision"
}

CRITICAL RULES:
1. Response MUST start with { and end with }. No code fences, no commentary.
2. If quoting text, escape internal double quotes as \"
3. Return the LAST message of the current scene (immediately BEFORE new scene starts)
4. Return ONLY ONE message number, or false if no scene break exists

═══════════════════════════════════════════════════════════════
WHAT IS A "STRONG" SCENE BREAK?
═══════════════════════════════════════════════════════════════

A STRONG scene break means the story shifts to a new narrative beat with at least ONE of:

✓ EXPLICIT TIME TRANSITION (highest priority):
  - "Dawn arrived", "The next morning", "Hours later", "Later that evening", "The next day"
  - Clear time-of-day shifts: night → morning, afternoon → evening
  - Phrases showing elapsed time: "three hours passed", "by nightfall"

  ⚠️ CRITICAL: OOC TIME MARKERS IN USER MESSAGES
  - USER messages often contain OOC scene-setting instructions in angle brackets
  - These ARE valid scene content and MUST be checked for time transitions
  - Examples of STRONG time transitions in OOC format:
    • "<several hours later>" → STRONG break (hours passed)
    • "<the next day>" → STRONG break (day passed)
    • "<several days later>" → STRONG break (multiple days passed)
    • "<continue the scene later that evening>" → STRONG break (time shift)
  - Examples that are NOT time transitions:
    • "<continue the scene>" → NOT a break (same time)
    • "<describe what he sees>" → NOT a break (instruction only)
    • "<be vivid and detailed>" → NOT a break (instruction only)
  - If a USER message contains OOC time marker AND the CHARACTER message confirms it
    (e.g., USER: "<several days later>" then CHAR: "Several days later..."), this is
    a STRONG time transition scene break

  ⚠️ THESE ARE **NOT** TIME TRANSITIONS:
  - Character movement: "he moved to", "she walked over", "turned around", "stepped back"
  - Action sequences: "he reaches for", "she picks up", "grabbed the"
  - Immediate continuations: "seconds later", "moments later", "immediately"
  - Time flavor text in same beat: "for the second time in as many minutes"
  - Simply stating current time: "it was nearly noon" (without showing passage FROM previous time)

✓ LOCATION CHANGE (characters physically present in new place):
  - "They had arrived at the tavern" (NOT "they headed toward the tavern")
  - "Sitting in the royal chambers now" (NOT "they decided to go to the chambers")
  - Must show actual arrival, not just travel intention

✓ CAST CHANGE (completely different characters):
  - Scene cuts to different group of people
  - Previous scene must be resolved (not mid-action)

✓ OBJECTIVE CHANGE (new goal after previous concluded):
  - Previous conflict/conversation resolved
  - New goal/conflict begins

═══════════════════════════════════════════════════════════════
WHAT IS **NOT** A SCENE BREAK?
═══════════════════════════════════════════════════════════════

Return false (no scene break) when:

❌ Mid-conversation/mid-action:
  - Message is a reply to previous question
  - Dialogue continues between same characters
  - Action sequence is ongoing
  - Exchange hasn't concluded

❌ Same location, same time, same objective:
  - Characters talking about going somewhere (but haven't arrived yet)
  - Minor movements within same room/building
  - Topic shifts within same conversation

❌ Character actions mistaken for time skips:
  - "he moved back to the quill" → continuing same scene
  - "she turned around" → same moment
  - "picked up the book" → same action sequence
  - "walked to the window" → same location

❌ Short time references:
  - "moments later", "seconds later", "immediately after"
  - "for the second time in as many minutes"

❌ Decorative formatting (ALWAYS IGNORE):
  - Lines: "---", "***", "___", "==="
  - Headers: "Scene Break", "Chapter X"
  - ⚠️ BUT: Do NOT ignore OOC time markers in angle brackets (see above)
    "<several days later>" is NOT decorative, it's a time transition!

═══════════════════════════════════════════════════════════════
INELIGIBILITY RULES
═══════════════════════════════════════════════════════════════

Messages marked "Message #invalid choice" are INELIGIBLE for selection:

1. MINIMUM SCENE LENGTH: Messages before #{{earliest_allowed_break}} are too early
   - Do NOT return any number below {{earliest_allowed_break}}

2. OFFSET ZONE (recent messages at end):
   - These show what comes AFTER to help you decide
   - If the only STRONG break is in offset zone → return false (wait for next pass)
   - If STRONG break exists in eligible range → return that number

═══════════════════════════════════════════════════════════════
EVALUATION PROCESS
═══════════════════════════════════════════════════════════════

1. Start at message #{{earliest_allowed_break}} (first eligible)
2. For each message, ask: "Does the NEXT message start a STRONG new scene?"
3. Check in this order:
   a. Is next message an EXPLICIT TIME TRANSITION?
      - Check narrative text: "dawn, hours later, next day"
      - Check USER OOC markers: "<several days later>", "<the next morning>"
      - Check CHARACTER confirmation of OOC time markers
   b. Does next message show ARRIVAL at completely new location?
   c. Does next message introduce new cast with prior scene resolved?
   d. Does next message start new objective with prior resolved?
4. THE MOMENT you find a STRONG break → STOP and return that message number
5. If no STRONG breaks in eligible range → return false

═══════════════════════════════════════════════════════════════
CRITICAL EXAMPLES OF ERRORS TO AVOID
═══════════════════════════════════════════════════════════════

❌ WRONG: Returning message #35 when #36 says "he moves back to the quill"
   Bad rationale: "explicit time skip"
   Why wrong: "moves back to" is a character action, NOT a time skip. Same scene continues.

❌ WRONG: Returning message #40 when #41 says "For the second time in as many minutes"
   Bad rationale: "time transition"
   Why wrong: This explicitly says it's the SAME minutes, not a time skip.

❌ WRONG: Returning message #46 when #47 contains "breakfast you have earned"
   Bad rationale: "transition to breakfast"
   Why wrong: Still TALKING ABOUT going to eat, not THERE yet. Same scene.

❌ WRONG: Returning false when #52 (USER) says "he checks in on her several days later" and #53 (CHAR) says "Several days later, the artifact..."
   Bad rationale: "All messages form a continuous scene"
   Why wrong: "several days later" in BOTH USER OOC instruction AND CHARACTER narration is a STRONG time transition. Should return 51.

✓ CORRECT: Returning message #35 when #36 starts "Dawn arrived with unceremonious brightness"
   Good rationale: "Scene ends at #35; message #36 opens with explicit time transition 'Dawn arrived' indicating night→morning scene break"
   Why right: "Dawn arrived" is an EXPLICIT time transition phrase.

✓ CORRECT: Returning message #51 when #52 (USER) contains "<several days later>" and #53 (CHAR) says "Several days later..."
   Good rationale: "Scene ends at #51; message #52 contains OOC time marker 'several days later' confirmed by message #53 narrating 'Several days later'"
   Why right: OOC time marker in USER message + CHARACTER confirmation = STRONG time transition.

✓ CORRECT: Returning message #72 when #73 reads "The trio had settled at a table in the dining hall"
   Good rationale: "Scene ends at #72; message #73 shows characters physically present in dining hall"
   Why right: Shows actual ARRIVAL (past tense "had settled"), not just intent to go.

═══════════════════════════════════════════════════════════════
FINAL VALIDATION CHECKLIST
═══════════════════════════════════════════════════════════════

Before submitting your answer, verify:

1. ✓ Did I quote EXACT text from next message? (not paraphrased)
2. ✓ Is this a STRONG break per criteria above? (time transition / location arrival / cast change / objective change)
3. ✓ Did I check for OOC time markers in USER messages? ("<several days later>", etc.)
4. ✓ Did I check ALL earlier eligible messages first?
5. ✓ Did I avoid mistaking character actions for time skips?
6. ✓ Is the next message actually STARTING something new, not CONTINUING current exchange?

Messages to analyze (with SillyTavern message numbers):
{{messages}}

REMINDER:
- Output must be valid JSON starting with { character
- Return the message NUMBER immediately BEFORE the new scene
- Return the FIRST strong break, or false if none exist
- Quote EXACT text in rationale, do not paraphrase`;


export const auto_scene_break_forced_prompt = `You are segmenting a roleplay transcript into scene-sized chunks (short, chapter-like story beats).
Your task is to select the best scene break point from the provided messages, outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "sceneBreakAt": a message number (e.g., 5),
  "rationale": "Quote the key cue that triggered your decision"
}

Example valid response:
{"sceneBreakAt": 5, "rationale": "Scene ends at message #5; next message #6 opens with explicit time skip: 'The next morning...'"}

CRITICAL:
- Ensure your response begins with the opening curly brace { character
- Do not include any preamble or explanation
- If you quote text in the rationale, escape internal double quotes as \"
- Return the message NUMBER of the LAST message in the current scene (the message immediately BEFORE the new scene starts)
- Return ONLY ONE message number - where the current scene ENDS
- You MUST select a message number from the eligible messages provided

STRICT CONTENT-ONLY RULES:
- Ignore formatting entirely. Decorative separators and headings (e.g., "---", "***", "___", "===", "Scene Break", "Chapter X") MUST NOT influence your decision.
- Do NOT mention formatting in your rationale. Quote only content-based cues (time, location, cast, or objective changes).
- Responses that reference formatting will be rejected.

INELIGIBILITY RULES:
Messages may be marked as "Message #invalid choice" due to:

MINIMUM SCENE LENGTH RULE:
- At least {{minimum_scene_length}} messages must occur before you can mark a scene break
- This ensures scenes are not broken too early
- Count only the messages of the type being analyzed (user/character/both as configured)
- The earliest allowed scene break in this range is message #{{earliest_allowed_break}}
- Do NOT return any message number lower than {{earliest_allowed_break}} under any circumstance
- Messages before {{earliest_allowed_break}} are marked as "invalid choice"

YOUR TASK:
Select the BEST scene break point from the eligible messages. Prioritize stronger breaks over weaker ones, but you must choose one.

DECISION CRITERIA:
A scene break means the prior beat resolved and the story now shifts focus.

PRIORITY SIGNALS (check these FIRST, in order):
1. EXPLICIT TIME TRANSITIONS override location continuity
   - "Dawn arrived", "the next morning", "hours later", "that evening", "the next day", "later that night"
   - Time skips from night → morning, morning → evening, or any explicit passage of hours/days
   - These are ALWAYS scene breaks, even if characters remain in the same location
   - Do NOT infer time from vague progressions (e.g., "as he left", "they watched him go", "afterwards") unless paired with explicit time-of-day or elapsed-time language
   - References to clocks, minutes, or flavor text about time ("seconds later", "for the second time in as many minutes", "it was nearly noon") describe the SAME beat unless they explicitly contrast with a previously stated timeframe; do NOT treat them as automatic scene breaks. Example: "'For the second time in as many minutes' is still the same moment—no scene break."
   - Time-of-day labels only count when they show a clear shift from the prior message (night → dawn, afternoon → evening, "hours passed", etc.). Simply stating what time it currently is does NOT indicate a time skip.

2. IGNORE DECORATIVE SEPARATORS AND PURE FORMATTING
  - Lines like "---", "***", "___", "===", centered rules, or other stylistic flourishes DO NOT indicate a scene break by themselves
  - Headings or labels such as "Scene Break" or "Chapter X" count ONLY if they coincide with a content-based transition (time skip, new setting/cast/objective)
  - Treat formatting as non-semantic; base decisions on content cues only

Strong scene break indicators (prioritize these):
- Moves to a new location or setting
- Skips time with explicit cues (see PRIORITY SIGNALS above)
- Switches primary characters or point of view to a different group
- Starts a new objective or major conflict after the previous one concluded
- Includes an explicit OOC reset that changes time/location/objective (e.g., GM note that the scene advances or resets)

Natural narrative beats (good options):
- Resolution or decision that concludes the prior exchange
- Reveal of major information that shifts the situation
- Escalation to a qualitatively new level (not just intensifying current action)
- Clear pause or transition point in the narrative flow

Weaker breaks (acceptable if no stronger options exist):
- Minor topic shifts within the same setting, participants, and timeframe
- Movement between sublocations within the same parent location (e.g., room changes inside the same building)
- Movement between districts/neighborhoods inside the same city without an explicit time skip
- Short pauses or minor transitions

EXCEPTION: Same location + explicit time skip (night → dawn) = STRONG BREAK
Example: If characters sleep in a field at night (message #35) and the next message begins with "Dawn arrived" (message #36), return 35 as the end of the night scene.

Selection process:
1. Check messages sequentially from earliest to latest (ascending numerical order)
2. Start with the earliest eligible message and work forward
3. For each message, evaluate: "Does the NEXT message represent a scene change?"
4. Prefer STRONGER breaks, but select the best available option even if all breaks are weak
5. Return the FIRST strong break you find, or the best weak break if no strong breaks exist
6. Return the LAST message number of the current scene (the message immediately before the new scene begins)

EVALUATION STRATEGY:
- Check messages sequentially from earliest to latest (ascending numerical order)
- Start with the earliest eligible message and work forward
- For each message, evaluate: "Does the NEXT message represent a scene change?"
- STOP when you find a STRONG scene break and return that message number
- If no STRONG breaks exist, select the best WEAK break available
- Rate the strength of each potential scene ending:

STRONG scene endings (prefer these):
  • Next message opens with explicit time transitions: "Dawn arrived", "The next morning", "Hours later", "That evening"
  • Next message shows characters physically arrived in a completely new location (not just traveling toward it)
  • Next message introduces completely new cast of characters with prior scene resolved
  • Current message provides clear resolution, next message starts new objective

WEAK scene endings (acceptable if no strong breaks exist):
  • Next message contains "for the second time in as many minutes", "seconds later", "moments later"
  • Next message is direct response to question/dialogue from current message
  • Next message continues mid-conversation but with a topic shift
  • Next message still in same location but shows a minor transition
  • Next message shows character arriving somewhere that current message mentioned going to

Selection rule: Return the message number immediately BEFORE the first STRONG scene change. If only weak candidates exist, return the BEST weak break available.

SEQUENTIAL EVALUATION REQUIREMENT:
- You MUST evaluate messages in ascending numerical order (lowest to highest)
- Start with the earliest eligible message ({{earliest_allowed_break}})
- Check each message to see if the NEXT message represents a scene change
- Return the FIRST strong break you find
- If no strong breaks exist, return the best weak break

CRITICAL: Base your decision ONLY on the provided messages below.
- Never invent details, context, or relationships not explicitly stated in the text
- Do not assume narrative patterns based on genre expectations
- If a detail is not mentioned in the messages, it does not exist for this decision

FINAL VALIDATION BEFORE RESPONDING:
Before returning your answer, verify:
1. Quote the EXACT text from the NEXT message that triggered your decision (do NOT paraphrase)
2. Confirm you selected an eligible message (not marked as "invalid choice")
3. Confirm you returned a message number (you are required to select one)
4. Check if there are STRONGER breaks earlier in the eligible range
5. Do NOT rely on memory or assumptions - only quote text actually present in the messages provided

Messages to analyze (with SillyTavern message numbers):
{{messages}}

REMINDER:
- Output must be valid JSON starting with { character
- Return the message NUMBER of the LAST message in the current scene (immediately before the new scene starts)
- You MUST select a message number - this is required`;


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
//                             Voice Anchors: when needed, include brief per‑character anchors that preserve dialogue conventions (address forms/pet names, idioms/slang, punctuation/formatting like mindspeech italics). Allow up to 2 short quote anchors total (≤ 12 words each) only when they lock in voice. Remove outdated anchors only when the style actually changes.
//                             Moment Anchors (vibe micro‑moments): carry forward 1–2 pivotal, low‑word‑count moments from the newest scene when they set ongoing dynamic/tension. Format as: "Moment anchors: '<exact words>' (cue) — <who ↔ who>".
//                             Update ONLY when the writing style itself changes (new POV introduced, genre shift, new narrative device)
//                             DO NOT list character emotions (tense, conflicted) - those belong in Key Developments
//   ## Pending Threads       -> Goals, timers, secrets, obligations in play
//
// MERGE RULES:
// - Start from the existing running recap and edit it; do not rewrite from scratch unless necessary.
// - Carry forward every still-relevant fact. If something is resolved or superseded, note the change and remove the stale bullet.
// - Integrate the new scene recap line-by-line, combining or updating bullets rather than duplicating them.
// - Idempotence: If the latest scene introduces no durable change (state, relationships, open threads, tone shift that persists), leave the corresponding sections unchanged; do not add filler.
// - Reference characters by canonical name; keep descriptive nuance inside setting_lore entries, not as standalone bullets.
// - Reflect relationship dynamics at a high level (dynamic snapshot: tone, interaction patterns, salient past interactions). If the dynamic clearly shifted in the new scene, update or replace the prior snapshot; include brief evidence or a short quote only when helpful. Avoid numeric scoring (no "+1 suspicion").
// - When the new recap introduces lasting character or world detail, assume the scene recap already emitted a lorebook update—just reference the entity here.
// - Treat critical state transitions (ownership/location/status/effects) as merge invariants: replace outdated bullets with the current state. If the change itself is story-important, state it once ("was X, now Y") and then compress to the current state in subsequent merges (avoid "change stacks").
// - Preserve cause-and-effect chains when merging events. If Event B happened because of Event A, maintain that causal relationship in the merged narrative using cause → effect format (e.g., "Event A occurred → resulting in Event B"). When updating information, preserve what caused the change (e.g., "State changed (because X)").
// - Tone & Style: Describes the ROLEPLAY's writing style (genre, POV, prose patterns, dialogue format, motifs). Update ONLY when writing style changes (new POV, genre shift, narrative device added). Do NOT accumulate character emotions from scenes. If the new scene maintains existing style, keep Tone & Style unchanged. Format as bullets covering: genre/subgenre, narrative voice, prose patterns, dialogue conventions, recurring motifs.
// - Location hierarchies: When sublocations are in play, include the full chain once (e.g., "Ponyville-Twilight's Library-Spike's Room") in Current Situation or the first relevant bullet to anchor continuity; subsequent mentions may use the most specific segment so long as there is no ambiguity. Rely on setting_lore entries for full details.
// - Entity mentions: Ensure any canonical names present in the new scene recap appear at least once in the merged recap (Current Situation or Key Developments) to maintain coherence.
// - Category tags: If Key Developments bullets include category tags (e.g., [reveal], [plan]), preserve them when merging; do not invent new tags.
// - Avoid chronological narration. Focus on the state of the world after this merge.
// - Keep wording concise and specific (locations, items, promises) so another writer can resume play instantly.
//
// QUALITY CHECK BEFORE RESPONDING:
// - Every open thread, obligation, or secret mentioned in any recap still appears.
// - No bullet restates personality traits or backstory that belongs in setting_lore entries.
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
  "sameEntityUids": ["entity_uid_1"],
  "needsFullContextUids": ["entity_uid_2"]
}

CRITICAL: Ensure your response begins with the opening curly brace { character

Known lorebook entry types: {{lorebook_entry_types}}

You will be given:
- A NEW entry candidate formatted as JSON
- A concise REGISTRY listing for all existing entries of the same type (uid, name, aliases, synopsis)

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
7. Place confident matches in 'sameEntityUids'. If you need more detail before deciding, list those UIDs in 'needsFullContextUids'.
8. Craft a concise one-line synopsis that reflects the candidate's newest or most important information.

Deterministic alignment rules:
- If the candidate's canonical name (case-insensitive, punctuation-insensitive, ignoring type prefix) exactly matches a registry entry's name, include that UID in 'sameEntityUids'.
- If a registry entry's aliases include the candidate's canonical name (same normalization), include that UID in 'sameEntityUids'.
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
- 'sameEntityUids' and 'needsFullContextUids' must be arrays. Use [] when empty.
- Never invent UIDs; only use UIDs from the registry listing.
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
  "resolvedUid": "<existing entity uid or \\"new\\">",
  "duplicateUids": ["<uid1>", "<uid2>"],
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
- If none of the candidates match, set the resolvedUid field to "new".
- When choosing an existing entity, pick the UID that truly represents the same subject and merge the newest facts into it.
- If the candidate adds nothing new, keep the existing content and synopsis; do not fabricate alternate copies.
- Prefer the candidate whose Relationships and State most closely match the new dynamic snapshot and current status; consolidate into a single canonical entry rather than splitting near-duplicates.
- Entity type normalization: If multiple candidates differ only by type for an unnamed collective (e.g., "thugs"), prefer "faction" over "character" when the group is a recurring hazard tied to a location; otherwise treat it as ephemeral and resolve as "new" only if truly durable.
- Deterministic tie‑breaker: If any candidate's canonical name exactly matches the new candidate's canonical name (case-insensitive, punctuation-insensitive, ignoring type prefix), choose that UID over others.
- For locations: if the candidate is a sub‑area, prefer the entry whose name or content indicates the same parent; normalize to "Parent-Subarea" canonical naming and ensure a "Located in: <Parent>" bullet exists. For multiple levels, normalize to hyphen chain ("Parent-Child-Grandchild") and include the immediate parent link.
- For character entities with Notable Dialogue and Micro‑Moments bullets: When merging, compare quotes; remove exact duplicates; consolidate similar voice‑pattern descriptions; preserve unique, pattern‑setting quotes that show different facets; maintain recipient/context. Keep at most the 2 freshest Micro‑Moments per counterpart.
- Do NOT fabricate bullets to satisfy a template; when details are not present, omit that bullet entirely (e.g., no Relations for a faction if none are stated yet).
- Ensure the returned synopsis reflects the most current canon after reconciliation (concise, one line).
- duplicateUids array: If multiple candidates represent the SAME entity (true duplicates of the same character/location/etc, not just similar), list the OTHER UIDs (excluding resolvedUid) in the duplicateUids array. These entries will be consolidated and deleted. Only include UIDs that are genuinely the same entity with overlapping information. Use [] when no duplicates exist.
- The duplicateUids field must be an array. Do not include the resolvedUid itself in this array.
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

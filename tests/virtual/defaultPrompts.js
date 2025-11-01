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
// - Brief timeline of what happened (events, state changes, outcomes)
// - MENTION entities by name for context
// - DO NOT describe entities in detail (that goes in lorebooks)
// - Terse, factual, minimal tokens, past tense
// - Focus on WHAT HAPPENED and OUTCOMES, not WHO/WHAT things are
// - Target: 100-300 tokens maximum
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
// Syntax: [EntityName: property1, property2, nested(detail1, detail2)]
// - Square brackets [ ] around entire entry
// - Colon after entity name, comma-separated properties
// - Nested details use parentheses ( ), max 2 levels deep
// Example: [Alice: warrior, appearance(red hair, green eyes), personality(confident)]
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
// - This is where ALL the detail and nuance goes
// - MUST use PList format: [EntityName: property1, property2, nested(details)]
// - Be thorough but organized using properties
// - Include appearance, personality, capabilities, significance
// - Include relationships and context as properties
// - Store secrets as properties: knows(X), keeping secret from(Y, Z)
// - For locations/items: Include owner/resident as a property with SPECIFIC NAMES
//   * Extract the actual character name from the message (check "name" field for is_user: true)
//   * NEVER use placeholder terms: "protagonist", "the user", "main character", "human subject", "the player", "{{user}}"
//   * Example: If messages show name: "John", use [Apartment: John's residence, shared with(Twilight Sparkle)]
//   * NOT: [Apartment: protagonist's residence] or [Apartment: shared living space, occupants(human subject)]
// - Target: 50-200 tokens per entry
//
// EXAMPLES OF GOOD SEPARATION:
//
// Example 1: Combat Scene
// ✅ SUMMARY: "Bandits ambushed Alice and Bob. Alice killed two with greatsword. Bob disabled one with throwing knife. Two fled. Alice wounded in shoulder."
// ✅ LOREBOOK: {"name": "Alice", "type": "character", "keywords": ["alice"], "content": "[Alice: warrior, weapon(greatsword, wields with lethal skill), training(formal, evident), wounded(shoulder), continues fighting when injured]"}
//
// Example 2: Discovery
// ✅ SUMMARY: "Found hidden chamber behind waterfall. Ancient murals depicted the First War."
// ✅ LOREBOOK: {"name": "Hidden Chamber", "type": "location", "keywords": ["chamber", "waterfall"], "content": "[Hidden Chamber: secret room, location(behind waterfall), features(stone walls, ancient murals showing First War), status(undisturbed for centuries)]"}
//
// Example 3: Character-Owned Location
// ✅ SUMMARY: "Visited Rance's apartment. Twilight Sparkle was researching dimensional portals on his laptop."
// ✅ LOREBOOK: {"name": "location-Apartment", "type": "location", "keywords": ["apartment"], "content": "[Apartment: Rance's residence, shared with(Twilight Sparkle), contains(laptop, research papers on dimensional portals)]"}
//
// Example 4: Revelation
// ✅ SUMMARY: "Bob revealed Shadow Guild membership. Alice became suspicious but agreed to cooperate."
// ✅ LOREBOOK: {"name": "Bob", "type": "character", "keywords": ["bob"], "content": "[Bob: Shadow Guild member, keeping secret from(Alice, {{user}} previously), revealed(Guild membership during confrontation), constrained by(Guild secrecy requirements)]"}
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
// → NOT using PList format! Must be: [Alice: warrior, appearance(red hair, green eyes)]
//
// ❌ LOREBOOK: {"name": "Secret Alliance", "type": "concept", "content": "[Secret Alliance: ...]"}
// → Wrong type! Use character/location/item/faction/quest/rule only. Store secrets in character entries.
//
// ❌ LOREBOOK: {"name": "location-Apartment", "type": "location", "keywords": ["apartment"], "content": "[Apartment: shared living space, occupants(human subject, Twilight Sparkle)]"}
// → Using vague "human subject" instead of specific name "Rance"! Should be: [Apartment: Rance's residence, shared with(Twilight Sparkle)]
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
// Extract key information from the completed scene below into a structured JSON format.
// This separates timeline narrative from detailed reference information.
//
// ⚠️ CRITICAL: ONLY USE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
//
// - ONLY extract information explicitly written in the scene text below
// - DO NOT use ANY information from your training data
// - If a name matches a franchise character, IGNORE franchise details completely
// - If something is not mentioned in the text below, it DOES NOT EXIST
// - Incomplete information is CORRECT - do not fill gaps
// - When in doubt, OMIT the detail entirely
//
// CRITICAL: SEPARATION OF CONCERNS
//
// SUMMARY field:
// - Brief chronological thread of scene outcomes (what happened, how it ended)
// - Capture CURRENT STATE after scene concludes
// - MENTION entities by name but DON'T describe them (descriptions go in lorebooks)
// - Focus on STATE CHANGES and OUTCOMES, not step-by-step processes
// - Terse, factual, past tense
// - Target: 200-500 tokens (scenes are longer than messages)
//
// LOREBOOKS array:
// - NEW entities discovered OR UPDATES to existing entities
// - MUST use PList (Property List) format for content (28-44% token savings)
// - Each entry needs: name, type, keywords, content
// - Type must be one of: {{lorebook_entry_types}}
// - Optional: secondaryKeys (array) for AND disambiguation
// - Only significant entities worth remembering
//
// PList FORMAT (REQUIRED):
// Syntax: [EntityName: property1, property2, nested(detail1, detail2)]
// - Use square brackets [ ] around entire entry
// - Colon after entity name
// - Comma-separated properties
// - Nested details use parentheses ( )
// - Max 2 levels of nesting for AI parsing
// - Strong associations: [Entity(primary descriptor): other properties]
//
// PList Examples:
// [Shadow Guild: secret organization, opposes(corrupt nobility), member(Bob), has(intelligence network), operations(covert)]
// [Alice: warrior, appearance(red hair, green eyes, late 20s), personality(confident, direct), searching for(Sunblade)]
// [Eastern Ruins: ancient temple, location(mountainside), status(ransacked), significance(sacred site)]
//
// SCENE-SPECIFIC GUIDELINES:
//
// 1. ROLEPLAY RELEVANCE
//    - Include what's needed to continue roleplay coherently
//    - Character development and relationship changes
//    - Plot-critical information
//    - Setting details and atmosphere
//    - Current status and pending decisions
//
// 2. FOCUS ON STATE, NOT EVENT SEQUENCES
//    - Summary captures OUTCOMES and CURRENT STATE after scene
//    - Don't narrate step-by-step ("then this, then that")
//    - State changes and results matter, not the detailed process
//
// 3. AVOID PROMPT POISONING
//    - Neutral, factual tone
//    - Avoid repetitive phrasing
//    - Don't copy scene's writing style
//    - Varied sentence structure
//
// 4. LOREBOOK ENTRY TYPES (use ONLY these concrete types):
//
//    character: NPCs and recurring characters
//    - Include: appearance, personality, capabilities, relationships, secrets they know
//    - PList: [Name: profession, appearance(details), personality(traits), knows(secret), relationship with(other)]
//    - Store secrets HERE: knows(X), keeping secret from(Y, Z)
//
//    location: Significant places worth remembering
//    - Include: description, features, atmosphere, who controls/owns it
//    - Use SPECIFIC NAMES for owners/residents extracted from scene messages
//    - NEVER use: "protagonist", "the user", "main character", "human subject", "the player", "{{user}}"
//    - PList: [LocationName: place type, owner/resident(specific name), features(list), atmosphere]
//    - Example: [Apartment: John's residence, shared with(Twilight Sparkle), contains(laptop)]
//
//    item: Important objects, artifacts, equipment
//    - Include: description, capabilities, current owner, significance
//    - Use SPECIFIC NAMES for owners, include as property
//    - PList: [ItemName: object type, owned by(specific name), capabilities(list), significance]
//    - Example: [Steel Greatsword: two-handed sword, owned by(Alice), masterwork quality]
//
//    faction: Organizations, groups, factions
//    - Include: members, goals, relationships with other factions, resources
//    - PList: [FactionName: organization type, members(list), goals(list), controls(resources)]
//
//    quest: Active objectives, missions, goals
//    - Include: objective, who is involved, deadline, stakes, current status
//    - PList: [QuestName: objective, participants(list), deadline(timeframe), stakes, status]
//
//    rule: World mechanics, magic systems, societal rules, game mechanics
//    - Include: how it works, limitations, who it affects, exceptions
//    - PList: [RuleName: mechanism, affects(targets), limitations(list), exceptions(list)]
//
// 5. ONE ENTITY PER LOREBOOK ENTRY
//    - If multiple characters mentioned together ("Discord and Fluttershy"), create SEPARATE character entries
//    - Each character gets their own entry with their individual details
//    - Store relationships as PROPERTIES within character entries:
//      [Discord: chimera of chaos, dating(Fluttershy), dates(three)]
//      [Fluttershy: dating(Discord), dates(three)]
//    - DO NOT create combined entries like "Discord and Fluttershy" - they are two people
//    - DO NOT create separate "relationship" entries - relationships are properties in character entries
//    - Same rule applies to items, locations, factions - one entry per entity
//
// KEYWORDS GUIDELINES (SCENES):
// - 2–4 keywords; all lowercase
// - Use SIMPLE, SINGLE WORDS that will appear in chat (exact match required)
// - Include canonical name and common aliases/nicknames
// - Avoid multi-word phrases unless they're used together consistently
// - Avoid generic terms ("place", "city", "market", etc.) and verbs
// - Keywords trigger on exact match - keep them simple and broad
// - If a keyword is too generic, use secondaryKeys for AND disambiguation
//
// Examples:
// ✅ GOOD: ["sunblade"] - triggers on any mention of sunblade
// ❌ BAD: ["recover sunblade", "find thief"] - won't match unless exact phrase used
// ✅ GOOD: ["alice"] - triggers when name mentioned
// ❌ BAD: ["the brave alice", "warrior alice"] - too specific, won't trigger reliably
//
// SCENE EXAMPLE:
//
// Scene: Alice confronts Bob about his suspicious behavior. Bob reveals he's working for the Shadow Guild, opposing corrupt nobility. He knows who stole the Sunblade through Guild intelligence but can't reveal it without exposing operations. Alice is torn between duty and sympathy. They agree to work together with a three-day deadline for Bob to reveal the thief.
//
// GOOD OUTPUT:
// {
//   "summary": "Alice confronted Bob about suspicious behavior. Bob revealed Shadow Guild membership and knowledge of Sunblade thief. Refused immediate revelation to protect Guild operations. Alice conflicted between duty and sympathy for anti-corruption cause. Agreed to cooperate with three-day deadline for thief's identity. Current state: tense alliance, Bob has three days to reveal information.",
//   "lorebooks": [
//     {
//       "name": "Shadow Guild",
//       "type": "faction",
//       "keywords": ["guild", "shadow"],
//       "content": "[Shadow Guild: secret organization, opposes(corrupt nobility), member(Bob), has(intelligence network), operations(must stay covert), goal(undermine corrupt noble power), tracks(significant persons)]"
//     },
//     {
//       "name": "Bob",
//       "type": "character",
//       "keywords": ["bob"],
//       "content": "[Bob: Shadow Guild member, knows(Sunblade thief identity), keeping secret from(Alice, {{user}}), revealed(Guild membership to Alice), constrained by(Guild secrecy), agreed to(reveal thief within three days)]"
//     },
//     {
//       "name": "Alice",
//       "type": "character",
//       "keywords": ["alice"],
//       "content": "[Alice: warrior, duty(recover Sunblade), knows(Bob is Shadow Guild member), conflicted(duty vs sympathy for anti-corruption cause), relationship with Bob(tense alliance, conditional trust), agreed to(three day deadline for cooperation)]"
//     },
//     {
//       "name": "Recover Sunblade",
//       "type": "quest",
//       "keywords": ["sunblade", "sword"],
//       "content": "[Recover Sunblade: objective(find thief and recover sword), participants(Alice, Bob, {{user}}), deadline(three days), stakes(Alice's duty, Guild operations), status(Bob knows thief identity but keeping secret temporarily)]"
//     }
//   ]
// }
//
// STYLE EXAMPLES:
//
// SUMMARY:
// ✅ GOOD: "Alice and Bob traveled to Eastern Ruins. Temple ransacked, Sunblade stolen. Bob revealed knowledge of thief but refused details. Alice suspicious. Camped outside ruins. Current state: camping, Alice wary of Bob, planning next move."
// ❌ BAD: "Alice, a skilled warrior with red hair, and Bob, a mysterious rogue, made their way through the forest to reach the ancient Eastern Ruins, a sacred temple complex..." (too flowery, describes characters instead of events)
// ❌ BAD: "First they walked to the forest, then they climbed the mountain, then they reached the ruins, then they entered..." (step-by-step sequence, not outcomes)
//
// LOREBOOK CONTENT (PList format):
// ✅ GOOD: "[Alice: warrior, appearance(red hair, green eyes, late 20s), personality(confident, direct), background(military training evident in posture), searching for(Sunblade entrusted to family), trusts({{user}}), suspicious of(Bob's secrecy)]"
// ❌ TOO SPARSE: "[Alice: warrior, red hair]" (missing important details)
// ❌ NOT PLIST: "Skilled warrior. Red hair, green eyes, late 20s..." (natural language, not PList format)
// ❌ TOO FLOWERY: "[Alice: warrior woman with flowing crimson locks cascading down shoulders and piercing emerald eyes that see into soul...]" (purple prose)
// ❌ WRONG TYPE: Don't create "concept" entries - use character/location/item/faction/quest/rule only
// ❌ COMBINED ENTITIES: {"name": "Discord and Fluttershy", "type": "character", ...} (two characters in one entry - WRONG!)
// ✅ CORRECT: Create two separate character entries:
//   {"name": "Discord", "type": "character", "content": "[Discord: chimera of chaos, dating(Fluttershy), dates(three)]"}
//   {"name": "Fluttershy", "type": "character", "content": "[Fluttershy: dating(Discord), dates(three)]"}
// ❌ WRONG: Don't create {"name": "Discord-Fluttershy Relationship", "type": "???"} (relationships are properties, not entries)
//
// OUTPUT FORMAT:
// - Output ONLY valid JSON, no text before or after
// - Summary is required
// - Lorebooks array is optional (empty array if no new entities)
//
{
  "summary": "",
  "lorebooks": []
}

// Scene Content:
{{message}}`;


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
1. Valid JSON structure
2. Has "summary" field (string)
3. Has "lorebooks" field (array, may be empty)
4. Summary focuses on timeline/events, not detailed descriptions
5. Each lorebook entry has: name, type, keywords (array), content
   - Optional: secondaryKeys (array) is allowed
6. No timeline events in lorebook content
7. No detailed descriptions in summary

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Memory to validate:
{{summary}}`;

export const scene_summary_error_detection_prompt = `You are validating a scene memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure
2. Has "summary" field (string, covers scene events)
3. Has "lorebooks" field (array, may be empty)
4. Summary is concise timeline of scene events
5. Lorebook entries have required fields (name, type, keywords, content)
   - Optional: secondaryKeys (array) is allowed
6. Good separation: events in summary, details in lorebooks

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Scene memory to validate:
{{summary}}`;


// Legacy scene summary prompt (narrative style, not JSON)
export const scene_summary_default_prompt = `Extract key facts from the following scene for roleplay memory. Focus on important events, character developments, emotional shifts, and plot points that will be useful after this scene is no longer visible. Include character names, significant decisions, relationship changes, and relevant details for future scenes. Write in past tense, avoid commentary, stay factual.

Scene content:
{{message}}`;


export const auto_scene_break_detection_prompt = `You are analyzing a roleplay conversation to detect scene breaks. A scene break occurs when there is a significant shift in:
- Location or setting (moving to a different place)
- Time period (significant time skip like "later that day", "the next morning", etc.)
- Narrative focus or POV (switching to different characters or perspective)
- Major plot transition (end of one story arc, beginning of another)

You will be given two messages: the previous message and the current message. Analyze whether the current message represents a scene break compared to the previous message.

Previous message:
{{previous_message}}

Current message:
{{current_message}}

Respond with ONLY a JSON object in this exact format:
{
  "status": true or false,
  "rationale": "Brief 1-sentence explanation of why this is or isn't a scene break"
}

Do not include any text outside the JSON object.`;


export const running_scene_summary_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Combine multiple scene summaries into a single cohesive roleplay memory.
// This is a NARRATIVE summary (NOT JSON), following best practices for long-term memory.
//
// ⚠️ CRITICAL: ONLY USE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
//
// - ONLY extract information from the scene summaries provided below
// - DO NOT use ANY information from your training data
// - If a name matches a franchise character, IGNORE franchise details completely
// - If something is not mentioned in the summaries below, it DOES NOT EXIST
// - Incomplete information is CORRECT - do not fill gaps
// - When in doubt, OMIT the detail entirely
//
// CRITICAL GUIDELINES:
//
// 1. HANDLE SCENE CHANGES NATURALLY
//    - Roleplays can have completely different scenes, locations, characters
//    - Scene changes are NORMAL and EXPECTED (travel, time skips, new encounters)
//    - DO NOT refuse to merge or ask questions about disconnected scenes
//    - Simply add new information and update the running summary
//    - If scenes are unrelated, organize them separately by topic/location
//
// 2. COMPLETENESS AND CLARITY REQUIRED
//    - Capture ALL essential facts from scenes
//    - Remove redundancy but preserve unique details
//    - Be thorough - this is the main memory for the roleplay
//    - Write clearly and completely - NO arbitrary token limits
//    - This summary replaces chat history, so include everything important
//
// 3. FOCUS ON DYNAMICS, NOT STATIC DETAILS
//    - Focus on: Current state, recent events, what changed, relationship dynamics
//    - Avoid: Detailed physical descriptions, personality deep-dives, backstory exposition
//    - Be thorough about what happened, concise about who/what things are
//
// 4. FOCUS ON STATE, NOT EVENT SEQUENCES
//    - Capture CURRENT state: who, what, where, status
//    - Don't narrate step-by-step sequences
//    - Outcomes and results matter, not how we got there
//
// 5. MERGE AND DEDUPLICATE
//    - Combine overlapping information from multiple scenes
//    - Keep most recent state when conflicts exist
//    - Remove information that's no longer relevant
//    - Preserve unique important details
//    - If no overlap, simply add new scenes to appropriate sections
//
// 6. ORGANIZE BY TOPIC
//    - Group information logically (characters, locations, situation, etc.)
//    - Use markdown headers (##) to separate sections
//    - Keep related information together
//    - Different scenes/locations get separate entries under same headers
//
// 7. AVOID PROMPT POISONING
//    - Neutral, informational tone
//    - Avoid repetitive phrasing
//    - Don't echo stylistic quirks from scenes
//    - Varied sentence structure
//
// OUTPUT FORMAT:
// - Narrative paragraphs with markdown headers
// - NOT JSON format
// - Organized by topic/category
// - Concise but complete
//
// EXAMPLE OUTPUT STRUCTURE:
//
// ## Current Situation
// [Brief description of where things stand now - can mention multiple ongoing threads]
//
// ## Characters
// **Character Name**: [Key facts, appearance, personality, current status]
// **Another Character**: [Key facts from different scene - this is normal]
//
// ## Locations
// **Location Name**: [Description, current state, significance]
// **Different Location**: [From another scene - organize separately under same header]
//
// ## Key Items & Objects
// **Item Name**: [Description, ownership, significance]
//
// ## Relationships & Dynamics
// **Character & Character**: [Relationship status, recent changes]
//
// ## Active Goals & Plans
// - [Goal or plan with who and what]
//
// ## Secrets & Hidden Information
// **Secret**: Known by X, Y. Hidden from Z.
//
// EXAMPLE - Handling Unrelated Scenes:
// If Scene 1 is about "Twilight in Equestria" and Scene 2 is about "Rance at coffee shop":
// ✅ DO: List both under ## Characters section separately
// ✅ DO: List both locations under ## Locations section
// ✅ DO: Merge naturally without questioning the disconnect
// ❌ DON'T: Refuse to merge or ask questions about why scenes are different
// ❌ DON'T: Try to force connections that don't exist
//
{{#if current_running_summary}}
// CURRENT RUNNING SUMMARY (update and merge with new scenes):
{{current_running_summary}}

{{/if}}
// NEW SCENE SUMMARIES TO MERGE:
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
2. Compare the new entry against the registry listing and decide if any existing entity is a likely duplicate.
3. Select high-confidence duplicate IDs in \`sameEntityIds\`.
4. If additional context is required before deciding, list the IDs in \`needsFullContextIds\`. These IDs will be sent to a follow-up prompt with full lorebook content.
5. Craft a one-line synopsis capturing the essence of the new entry (used in the registry if it becomes canonical).

Return ONLY a JSON object in this exact shape:
{
  "type": "<one of the allowed types>",
  "synopsis": "<short one-line summary>",
  "sameEntityIds": ["entity_id_1"],
  "needsFullContextIds": ["entity_id_2"]
}

Rules:
- \`sameEntityIds\` and \`needsFullContextIds\` must be arrays. Use [] when empty.
- Never invent IDs; only use IDs from the registry listing.
- If nothing matches, return empty arrays and keep the type that best fits.
- The synopsis should be concise, 15 words or fewer, and reflect the NEW entry’s content.
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
- If none of the candidates actually match, set \`"resolvedId": "new"\`.
- When choosing an existing entity, prefer the id that truly represents the same in-world subject.
- The synopsis should reflect the most current and complete understanding after this comparison.
- Output STRICT JSON with double quotes and no commentary.`;


export const default_running_scene_template = `<!--Roleplay memory containing current state and key facts from all previous scenes, combined into a cohesive narrative.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{running_summary}}
</roleplay_memory>`;

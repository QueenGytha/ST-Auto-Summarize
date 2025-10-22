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
// - High-level timeline of what happened (events, state changes, outcomes)
// - MENTION entities by name for context
// - DO NOT describe entities in detail (that goes in lorebooks)
// - Terse, factual, minimal tokens
// - Focus on WHAT HAPPENED, not WHO/WHAT things are
// - Target: 100-300 tokens maximum
//
// LOREBOOKS array:
// - NEW entities discovered OR updates to existing entities
// - Full descriptions WITH nuance and detail
// - Each entry needs: name, type, keywords, content
// - Type must be chosen from: {{lorebook_entry_types}}
// - Optional: secondaryKeys (array) for AND disambiguation of generic terms
// - DO NOT include timeline events (that goes in summary)
// - Only entities worth remembering for later
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
// TYPES EXPLAINED:
// - character: Major NPCs, recurring characters
// - location: Significant places that may be revisited
// - item: Important objects, artifacts, equipment
// - faction: Groups, organizations, factions
// - concept: Abstract concepts (relationships, secrets, status, knowledge)
// - lore: World-building facts, historical events, rules
//
// KEYWORDS GUIDELINES:
// - 2–5 keywords; all lowercase
// - Include canonical name and common aliases
// - Use natural phrases users would actually type
// - Prefer specific multi-word nouns over generic single words
// - Avoid generic terms (e.g., "place", "city", "market", "warrior") and verbs
// - If a keyword is ambiguous, add an AND disambiguator via optional secondaryKeys (array)
// - Do NOT output regex patterns
//
// CONTENT GUIDELINES:
// - This is where ALL the detail and nuance goes
// - Be thorough but organized
// - Include appearance, personality, capabilities, significance
// - Include relationships and context
// - Target: 50-200 tokens per entry
//
// EXAMPLES OF GOOD SEPARATION:
//
// Example 1: Combat Scene
// ✅ SUMMARY: "Bandits ambushed Alice and Bob. Alice killed two with her greatsword. Bob disabled one with throwing knife. Two fled. Alice wounded in shoulder."
// ✅ LOREBOOK: {"name": "Alice - Combat Capabilities", "type": "concept", "keywords": ["Alice fighting", "greatsword"], "content": "Wields greatsword with lethal skill. Formal training evident. Continues fighting when wounded."}
//
// Example 2: Discovery
// ✅ SUMMARY: "They found a hidden chamber behind the waterfall. Ancient murals depicted the First War."
// ✅ LOREBOOK: {"name": "Hidden Chamber", "type": "location", "keywords": ["hidden chamber", "waterfall chamber"], "content": "Secret room behind waterfall. Stone walls with ancient murals showing the First War. Undisturbed for centuries."}
//
// Example 3: Revelation
// ✅ SUMMARY: "Bob revealed he works for the Shadow Guild. Alice became suspicious but agreed to cooperate."
// ✅ LOREBOOK: {"name": "Bob's Guild Affiliation", "type": "concept", "keywords": ["Bob Shadow Guild", "Bob secret"], "content": "Bob is Shadow Guild member. Previously hidden from Alice and {{user}}, revealed during confrontation. Constrains his actions due to Guild secrecy."}
//
// BAD EXAMPLES:
//
// ❌ SUMMARY: "Alice, a skilled warrior with red hair and green eyes, fought the bandits using her greatsword technique..."
// → Too much description! Just say "Alice fought bandits with greatsword"
//
// ❌ LOREBOOK: {"name": "Battle", "content": "Alice and Bob were ambushed and fought bandits on the road"}
// → That's a timeline event! Belongs in summary, not lorebooks
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
// - High-level timeline of what happened in this SCENE
// - Include all major events and state changes
// - MENTION entities by name but DON'T describe them
// - Capture current state after scene ends
// - Terse, factual, past tense for events
// - Target: 200-500 tokens (scenes are longer than messages)
//
// LOREBOOKS array:
// - NEW entities discovered in this scene
// - UPDATES to existing entities
// - Full descriptions WITH all nuance
// - Each entry: name, type, keywords, content
// - Type must be chosen from: {{lorebook_entry_types}}
// - Optional: secondaryKeys (array) for AND disambiguation of generic terms
// - Only significant entities worth remembering
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
//    - Capture CURRENT state after scene ends
//    - Don't narrate step-by-step ("then this, then that")
//    - Outcomes matter, not the detailed process
//
// 3. AVOID PROMPT POISONING
//    - Neutral, factual tone
//    - Avoid repetitive phrasing
//    - Don't copy scene's writing style
//    - Varied sentence structure
//
// 4. LOREBOOK ENTRIES FOR SCENES
//    - Characters: Appearance, personality, speech manner, capabilities
//    - Locations: Description, features, atmosphere, significance
//    - Items: Description, capabilities, ownership, significance
//    - Factions: Members, goals, relationships
//    - Concepts: Secrets (who knows what), relationships, status changes
//    - Lore: World-building, history, rules
//
// KEYWORDS GUIDELINES (SCENES):
// - 2–5 keywords; all lowercase
// - Include canonical name and common aliases
// - Use natural phrases likely to appear in chat
// - Prefer specific multi-word nouns over generic single words
// - Avoid generic terms ("place", "city", "market", etc.) and verbs
// - If a keyword is ambiguous, add an AND disambiguator via optional secondaryKeys
// - For relationships: include both names (e.g., "alice bob")
// - For locations: include area/region qualifiers when needed
//
// SCENE EXAMPLE:
//
// Scene: Alice confronts Bob about his suspicious behavior. Bob reveals he's working for the Shadow Guild, opposing corrupt nobility. He knows who stole the Sunblade through Guild intelligence but can't reveal it without exposing operations. Alice is torn between duty and sympathy. They agree to work together with a three-day deadline for Bob to reveal the thief.
//
// GOOD OUTPUT:
// {
//   "summary": "Alice confronted Bob about suspicious behavior. Bob revealed Shadow Guild membership and knowledge of Sunblade thief through Guild intelligence. He refused immediate revelation to protect Guild operations. Alice conflicted between duty to recover Sunblade and sympathy for anti-corruption cause. They agreed to cooperate with three-day deadline for thief's identity.",
//   "lorebooks": [
//     {
//       "name": "Shadow Guild",
//       "type": "faction",
//       "keywords": ["Shadow Guild", "the Guild", "secret organization", "anti-nobility"],
//       "content": "Secret organization opposing corrupt nobility. Bob is member. Has intelligence network tracking significant persons. Operations must stay covert. Goal: undermine corrupt noble power."
//     },
//     {
//       "name": "Bob - Shadow Guild Member",
//       "type": "concept",
//       "keywords": ["Bob secret", "Bob affiliation", "Bob Guild", "Bob organization"],
//       "content": "Bob is Shadow Guild member. Previously hidden from Alice and {{user}}, revealed during confrontation. Source of his knowledge about Sunblade thief. Constrained by Guild secrecy requirements. Alice now knows."
//     },
//     {
//       "name": "Alice & Bob - Alliance",
//       "type": "concept",
//       "keywords": ["Alice Bob relationship", "alliance", "cooperation", "three day deadline"],
//       "content": "Agreed to work together despite Guild revelation. Tension between Alice's duty (recover Sunblade) and sympathy for Bob's cause. Three-day deadline for thief revelation. Trust is conditional and strained."
//     },
//     {
//       "name": "Sunblade Thief Identity",
//       "type": "concept",
//       "keywords": ["thief identity", "Sunblade thief", "who stole Sunblade"],
//       "content": "Bob knows thief's identity through Shadow Guild intelligence. Information kept secret from Alice and {{user}} to protect Guild operations. Bob agreed to reveal within three days."
//     }
//   ]
// }
//
// STYLE EXAMPLES:
//
// SUMMARY:
// ✅ GOOD: "Alice and Bob traveled to Eastern Ruins. Temple ransacked, Sunblade stolen. Bob revealed knowledge of thief but refused details. Alice suspicious. Camped outside ruins."
// ❌ BAD: "Alice, a skilled warrior with red hair, and Bob, a mysterious rogue, made their way through the forest to reach the ancient Eastern Ruins, a sacred temple complex..."
//
// LOREBOOK CONTENT:
// ✅ GOOD: "Skilled warrior. Red hair, green eyes, late 20s. Confident and direct speech. Military background evident in posture. Searching for stolen Sunblade entrusted to her family. Trusts {{user}} but suspicious of Bob's secrecy."
// ❌ TOO SPARSE: "Warrior. Red hair."
// ❌ TOO FLOWERY: "A highly skilled and experienced warrior woman with flowing crimson locks cascading down her shoulders and piercing emerald eyes that seem to see into one's soul..."
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
// 1. EXTREME BREVITY REQUIRED
//    - Use MINIMUM words to capture essential facts
//    - Remove ALL redundancy across scenes
//    - Prefer fragments over complete sentences
//    - Target: 1500-2000 tokens MAXIMUM for entire output
//
// 2. FOCUS ON STATE, NOT EVENT SEQUENCES
//    - Capture CURRENT state: who, what, where, status
//    - Don't narrate step-by-step sequences
//    - Outcomes and results matter, not how we got there
//
// 3. MERGE AND DEDUPLICATE
//    - Combine overlapping information from multiple scenes
//    - Keep most recent state when conflicts exist
//    - Remove information that's no longer relevant
//    - Preserve unique important details
//
// 4. ORGANIZE BY TOPIC
//    - Group information logically (characters, locations, situation, etc.)
//    - Use markdown headers (##) to separate sections
//    - Keep related information together
//
// 5. AVOID PROMPT POISONING
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
// [Brief description of where things stand now]
//
// ## Characters
// **Character Name**: [Key facts, appearance, personality, current status]
// **Another Character**: [Key facts...]
//
// ## Locations
// **Location Name**: [Description, current state, significance]
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
{{#if current_running_summary}}
// CURRENT RUNNING SUMMARY (update and merge with new scenes):
{{current_running_summary}}

{{/if}}
// NEW SCENE SUMMARIES TO MERGE:
{{scene_summaries}}`;


export const default_running_scene_template = `<!--Roleplay memory containing current state and key facts from all previous scenes, combined into a cohesive narrative.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{running_summary}}
</roleplay_memory>`;

export const default_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Extract key information from the message below into a structured JSON format.
// This feeds both narrative memory AND automatic lorebook population.
//
// JSON STRUCTURE REQUIREMENTS:
//
// {
//   "narrative": "Pure narrative of events",
//   "entities": [entity objects],
//   "character_states": {character state objects}
// }
//
// FIELD GUIDELINES:
//
// 1. NARRATIVE (required string)
//    - What happened in this message (events, actions, decisions, outcomes)
//    - MENTION entities by name for context (locations, NPCs, items)
//    - DO NOT include entity descriptions in narrative
//    - Entity descriptions go in the entities array
//    - Keep concise and factual
//    - Focus on state changes and outcomes
//
// 2. ENTITIES (optional array)
//    - Extract NEW entities discovered in this message
//    - OR provide UPDATES to existing entities
//
//    Entity Object Format:
//    {
//      "name": "Full Entity Name",
//      "type": "character|npc|creature|location|location-sublocation|item|object|faction|concept",
//      "properties": ["list", "of", "properties"],  // For NEW entities
//      "aliases": ["alternate", "names"],
//      "updates": ["property", "updates"]  // For EXISTING entities
//    }
//
//    Properties Format (concise, PList-compatible):
//    - Concise properties (1-5 words each)
//    - Use nested() for details: "sells(potions, equipment)"
//    - Comma-separated
//
// 3. CHARACTER_STATES (optional object)
//    - Current state of main characters ({{char}} and {{user}})
//    - Only include if state changed significantly
//    - Format: concise properties
//    - Include: acquired items, location, relationships, knowledge, goals
//
// OUTPUT FORMAT:
// - Output ONLY valid JSON, no text before or after
// - All fields except narrative are optional
// - Empty arrays: [], Empty objects: {}
//
// Output template:
{
  "narrative": "",
  "entities": [],
  "character_states": {}
}

// Message Content:
{{message}}`;


export const scene_summary_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Extract key facts from the completed scene below for the roleplay memory.
// Preserve information needed for roleplay continuity, character development, and tone.
//
// CRITICAL GUIDELINES:
//
// 1. ROLEPLAY RELEVANCE
//    - Extract what's needed to continue the roleplay coherently
//    - Character personalities, development, quirks, speech patterns
//    - Relationships and their dynamics
//    - Plot-critical information and context
//    - Setting details and atmosphere
//    - Current status and pending decisions
//
// 2. CHARACTER DEVELOPMENT
//    - Capture character traits, behaviors, and changes
//    - Key personality details that define how they act
//    - Relationship evolution and emotional dynamics
//    - Character-specific context (backgrounds, motivations, secrets)
//    - Speech mannerisms and distinctive traits
//
// 3. FOCUS ON STATE, NOT EVENT SEQUENCES
//    - Capture CURRENT state: who, what, where, status
//    - Don't narrate event sequences ("then this, then that")
//    - Outcomes and results matter, not the path taken
//
// 4. BE THOROUGH BUT EFFICIENT
//    - Include all significant NPCs, plot points, and details
//    - Use appropriate fields (npcs_facts vs npcs_mentioned, etc.)
//    - Don't speculate or invent details not in the scene
//    - Preserve important context and nuance
//    - Be concise but don't sacrifice substance
//
// 5. AVOID PROMPT POISONING
//    - Write in neutral, factual tone
//    - Avoid repetitive phrasing or formulaic language
//    - Don't copy distinctive writing style from the scene
//    - Use varied sentence structure
//
// 6. FORMAT REQUIREMENTS
//    - Output ONLY valid JSON, no text before or after
//    - All fields are optional - omit if no relevant data
//    - Empty objects: {} | Empty arrays: []
//
// Field instructions:
// npcs_facts: { "npc_name": "Appearance, personality traits, speech manner, defining characteristics. Facts, not actions." }
// npcs_status: { "npc_name": "Current status (active, missing, deceased, etc.)" }
// npcs_plans: [ "Future plans or goals with context." ]
// npcs_mentioned: { "npc_name": "NPCs mentioned but not yet encountered. Brief role." }
// visited_locations: { "Location Name": "Description including relevant features and atmosphere." }
// secrets: { "Secret content": "Known by: X, Y. Hidden from: Z, {{user}}." }
// current_relationships: { "npc_pair": "Current status, emotional tone, recent changes." }
// planned_events: [ "Future plans with who, what, when if known." ]
// objects: { "Object Name": "Description, significance, current owner/location." }
// lore: { "Fact": "World-building, setting rules, or background information." }
// memorable_events: [ "Major story developments that changed the narrative direction." ]
// minor_npcs: { "npc_name": "Brief role or description." }
// factions: { "Faction Name": { "members": ["npc1", "npc2"], "goals": "Brief goals." } }
// pending_decisions: [ "Unresolved choices that will affect future scenes." ]
//
// STYLE EXAMPLES:
// ❌ TOO SPARSE: "Warrior. Red hair."
// ✅ GOOD: "Warrior. Red hair, green eyes. Speaks confidently, military bearing. Known for tactical thinking."
//
// ❌ TOO FLOWERY: "A skilled and experienced warrior with flowing crimson locks that cascade down her shoulders"
// ✅ GOOD: "Experienced warrior. Crimson hair. Confident demeanor, tactical mindset."
//
// Output only valid JSON:
{
	"npcs_facts": {},
	"npcs_status": {},
	"npcs_plans": [],
	"npcs_mentioned": {},
	"visited_locations": {},
	"secrets": {},
	"current_relationships": {},
	"planned_events": [],
	"objects": {},
	"lore": {},
	"memorable_events": [],
	"minor_npcs": {},
	"factions": {},
	"pending_decisions": []
}

// Scene Content:
{{message}}`;


export const default_combined_summary_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Combine multiple memory fragments from a single roleplay while avoiding redundancy and repetition.
// Extract and merge key facts from the New Roleplay Histories and Roleplay Messages (if provided).
// Preserve information needed for roleplay continuity, character development, and tone.
//
// CRITICAL GUIDELINES:
//
// 1. ROLEPLAY RELEVANCE
//    - Include what's needed to continue the roleplay coherently
//    - Character personalities, development, quirks, speech patterns
//    - Relationships and their evolution
//    - Plot-critical information and context
//    - Setting details and atmosphere
//    - Current status and pending decisions
//
// 2. CHARACTER DEVELOPMENT
//    - Preserve character traits, behaviors, and changes
//    - Key personality details that define how they act
//    - Relationship dynamics and their progression
//    - Character-specific context (backgrounds, motivations, secrets)
//    - Speech mannerisms and distinctive traits
//
// 3. FOCUS ON STATE, NOT EVENT SEQUENCES
//    - Capture CURRENT state: who, what, where, status
//    - Don't narrate event sequences ("then this, then that")
//    - Outcomes and results matter, not the path taken
//
// 4. MERGE REDUNDANCY, PRESERVE SUBSTANCE
//    - Combine duplicate/overlapping information
//    - Keep most recent state when conflicts exist
//    - Remove truly redundant information
//    - BUT preserve unique details from each fragment
//    - Don't sacrifice important context for brevity
//
// 5. AVOID PROMPT POISONING
//    - Write in neutral, factual tone
//    - Avoid repetitive phrasing or formulaic language
//    - Don't copy distinctive writing style from fragments
//    - Use varied sentence structure
//
// 6. FORMAT REQUIREMENTS
//    - Output ONLY valid JSON, no text before or after
//    - All fields are optional - omit if no relevant data
//    - Empty objects: {} | Empty arrays: []
//
// Field instructions:
// npcs_facts: { "npc_name": "Appearance, personality traits, speech manner, defining characteristics. Facts, not actions." }
// npcs_status: { "npc_name": "Current status (active, missing, deceased, etc.)" }
// npcs_plans: [ "Future plans or goals with context." ]
// npcs_mentioned: { "npc_name": "NPCs mentioned but not yet encountered. Brief role." }
// visited_locations: { "Location Name": "Description including relevant features and atmosphere." }
// secrets: { "Secret content": "Known by: X, Y. Hidden from: Z, {{user}}." }
// current_relationships: { "npc_pair": "Current status, emotional tone, recent changes." }
// planned_events: [ "Future plans with who, what, when if known." ]
// objects: { "Object Name": "Description, significance, current owner/location." }
// lore: { "Fact": "World-building, setting rules, or background information." }
// memorable_events: [ "Major story developments that changed the narrative direction." ]
// minor_npcs: { "npc_name": "Brief role or description." }
// factions: { "Faction Name": { "members": ["npc1", "npc2"], "goals": "Brief goals." } }
// pending_decisions: [ "Unresolved choices that will affect future scenes." ]

{
	"npcs_facts": {},
	"npcs_status": {},
	"npcs_plans": [],
	"npcs_mentioned": {},
	"visited_locations": {},
	"secrets": {},
	"current_relationships": {},
	"planned_events": [],
	"objects": {},
	"lore": {},
	"memorable_events": [],
	"minor_npcs": {},
	"factions": {},
	"pending_decisions": []
}

{{#if previous_combined_summary}}
// The current roleplay history template. Use this as the basis of your analysis, updating it with any new or changed information, removing anything which is no longer relevant and fully resolved:
{{previous_combined_summary}}
{{/if}}

{{#if history}}
// Recent direct roleplay messages for context:
{{history}}
{{/if}}

// New Roleplay Histories:
{{message}}`;


export const default_long_template = `<!--Roleplay memory containing current state and key facts from previous scenes.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{memories}}
</roleplay_memory>`;


export const default_short_template = `<!--Roleplay memory containing current state and key facts from previous scenes.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{memories}}
</roleplay_memory>`;


export const default_combined_template = `<!--Roleplay memory containing current state and key facts from previous scenes.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{memories}}
</roleplay_memory>`;


export const default_scene_template = `<!--Roleplay memory containing current state and key facts from previous scenes, organized into logical chapters.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{scene_summaries}}
</roleplay_memory>`;


export const regular_summary_error_detection_prompt = `You are validating summaries for a fictional roleplay system. Your ONLY task is to check if the summary meets the format requirements, not to evaluate the fictional content itself.

A valid summary must meet ALL these criteria:
1. Contains only factual statements without commentary or opinion
...`;

export const scene_summary_error_detection_prompt = `You are validating a scene summary. Return "VALID" if the summary is concise and accurate, otherwise return "INVALID".\n\nSummary:\n{{summary}}`;

export const combined_summary_error_detection_prompt = `...`;

export const scene_summary_default_prompt = `Summarize the following scene as if you are writing a concise chapter summary for a roleplay story. Focus on the most important events, character developments, emotional shifts, and plot points that would be useful to remember after this scene is no longer visible. Include character names, significant decisions, changes in relationships, and any details that may be relevant for future scenes. Write in past tense, avoid commentary or meta-statements, and do not include introductions or explanations.\nScene content:\n{{message}}`;


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
// Preserve information needed for roleplay continuity, character development, and tone.
//
// CRITICAL GUIDELINES:
//
// 1. ROLEPLAY RELEVANCE
//    - Include what's needed to continue the roleplay coherently
//    - Character personalities, development, quirks, speech patterns
//    - Relationships and their evolution
//    - Plot-critical information and context
//    - Setting tone and atmosphere
//    - Current status and pending decisions
//
// 2. CHARACTER DEVELOPMENT
//    - Preserve character traits, growth, and changes
//    - Key personality details that define how they act
//    - Relationship dynamics and their progression
//    - Character-specific context (backgrounds, motivations, secrets)
//
// 3. FOCUS ON STATE, NOT EVENT SEQUENCES
//    - Capture CURRENT state: who, what, where, status
//    - Don't narrate event sequences ("then this, then that")
//    - Outcomes and results matter, not the path taken
//
// 4. MERGE REDUNDANCY, PRESERVE SUBSTANCE
//    - Combine duplicate/overlapping information
//    - Keep most recent state when conflicts exist
//    - Remove truly redundant information
//    - BUT preserve unique details from each scene
//    - Don't sacrifice important context for brevity
//
// 5. AVOID PROMPT POISONING
//    - Write in neutral, informational tone
//    - Avoid repetitive phrasing or formulaic language
//    - Don't capture stylistic quirks that could leak into roleplay
//    - Use varied sentence structure
//
// 6. OUTPUT FORMAT
//    - Concise narrative paragraphs, NOT JSON
//    - Organize by topic (characters, locations, relationships, situation, etc.)
//    - Use markdown headers to separate sections
//    - Be thorough but efficient - no arbitrary word/token limits
//
{{#if current_running_summary}}
// Current running summary (update and merge with new scenes):
{{current_running_summary}}

{{/if}}
// New scene summaries to merge:
{{scene_summaries}}`;


export const default_running_scene_template = `<!--Roleplay memory containing current state and key facts from all previous scenes, combined into a cohesive narrative.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{running_summary}}
</roleplay_memory>`;
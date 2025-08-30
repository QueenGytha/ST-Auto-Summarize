export const default_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Analyze the provided Roleplay History. Fill out the JSON template below, following the instructions for each field. Do not speculate or invent details.
// Output only a single, correctly formatted JSON object. Do not include any text outside the JSON object.
// If a field has no relevant information, leave it empty ({} for objects, [] for arrays).

// Field instructions:
// npcs_facts: { "npc_name": "Appearance, speech manner, personality traits. Only facts, not actions." }
// npcs_status: { "npc_name": "Current status (e.g. active, missing, deceased)." }
// npcs_plans: [ "Future plans or goals discussed by npcs." ]
// npcs_mentioned: { "npc_name": "Role or N/A" }
// visited_locations: { "Location Name": "Describe in at least 3 sentences." }
// secrets: { "Secret": "Kept secret by <npc> from <target>." }
// current_relationships: { "npc_pair": "Current long-term relationship between recurring npcs or with {{user}}, in at least 3 sentences." }
// planned_events: [ "Each planned event in at least 3 sentences." ]
// objects: { "Object Name": "DDescription, significance, and current owner if known." }
// lore: { "Fact": "World-building, rules, or background info." }
// events: [ "Each event, in at least 2 sentences. Add any additional context if appropriate." ]
// minor_npcs: { "npc_name": "Brief description or role." }
// factions: { "Faction Name": { "members": [ "npc1", "npc2" ], "goals": "Description of goals." } }
// pending_decisions: [ "Each unresolved choice or cliffhanger, in at least 2 sentences." ]

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
	"events": [],
	"minor_npcs": {},
	"factions": {},
	"pending_decisions": []
}

// Roleplay History:
{{message}}`;


export const scene_summary_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// Analyze the provided Roleplay History. Fill out the JSON template below, following the instructions for each field. Do not speculate or invent details.
// Output only a single, correctly formatted JSON object. Do not include any text outside the JSON object.
// If a field has no relevant information, leave it empty ({} for objects, [] for arrays).

// Field instructions:
// npcs_facts: { "npc_name": "Appearance, speech manner, personality traits. Only facts, not actions." }
// npcs_status: { "npc_name": "Current status (e.g. active, missing, deceased)." }
// npcs_plans: [ "Future plans or goals discussed by npcs." ]
// npcs_mentioned: { "npc_name": "Role or N/A" }
// visited_locations: { "Location Name": "Describe in at least 3 sentences." }
// secrets: { "Secret": "Kept secret by <npc> from <target>." }
// current_relationships: { "npc_pair": "Current long-term relationship between recurring npcs or with {{user}}, in at least 3 sentences." }
// planned_events: [ "Each planned event in at least 3 sentences." ]
// objects: { "Object Name": "DDescription, significance, and current owner if known." }
// lore: { "Fact": "World-building, rules, or background info." }
// events: [ "Each event, in at least 2 sentences. Add any additional context if appropriate." ]
// minor_npcs: { "npc_name": "Brief description or role." }
// factions: { "Faction Name": { "members": [ "npc1", "npc2" ], "goals": "Description of goals." } }
// pending_decisions: [ "Each unresolved choice or cliffhanger, in at least 2 sentences." ]

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
	"events": [],
	"minor_npcs": {},
	"factions": {},
	"pending_decisions": []
}

// Roleplay History:
{{message}}`;


export const default_combined_summary_prompt = `// OOC REQUEST: Pause the roleplay and step out of character for this reply.
// You are being given multiple pieces of a single roleplay. Analyze and combine them while avoiding redundancy and repetition.
// Analyze the provided New Roleplay Histories and Roleplay Messages (if provided). Fill out the JSON template below, following the instructions for each field. Do not speculate or invent details.
// Output only a single, correctly formatted JSON object. Do not include any text outside the JSON object.
// If a field has no relevant information, leave it empty ({} for objects, [] for arrays).

// Field instructions:
// npcs_facts: { "npc_name": "Appearance, speech manner, personality traits. Only facts, not actions." }
// npcs_status: { "npc_name": "Current status (e.g. active, missing, deceased)." }
// npcs_plans: [ "Future plans or goals discussed by npcs." ]
// npcs_mentioned: { "npc_name": "Role or N/A" }
// visited_locations: { "Location Name": "Describe in at least 3 sentences." }
// secrets: { "Secret": "Kept secret by <npc> from <target>." }
// current_relationships: { "npc_pair": "Current long-term relationship between recurring npcs or with {{user}}, in at least 3 sentences." }
// planned_events: [ "Each planned event in at least 3 sentences." ]
// objects: { "Object Name": "DDescription, significance, and current owner if known." }
// lore: { "Fact": "World-building, rules, or background info." }
// events: [ "Each event, in at least 2 sentences. Add any additional context if appropriate." ]
// minor_npcs: { "npc_name": "Brief description or role." }
// factions: { "Faction Name": { "members": [ "npc1", "npc2" ], "goals": "Description of goals." } }
// pending_decisions: [ "Each unresolved choice or cliffhanger, in at least 2 sentences." ]

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
	"events": [],
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


export const default_long_template = `<!--This is what happened so far during the roleplay, and the current state of the scene.
The information below takes priority over character and setting definitions. -->

<roleplay_summary>
{{memories}}
</roleplay_summary>`;


export const default_short_template = `<!--This is what happened so far during the roleplay, and the current state of the scene.
The information below takes priority over character and setting definitions. -->

<roleplay_summary>
{{memories}}
</roleplay_summary>`;


export const default_combined_template = `<!--This is what happened so far during the roleplay, and the current state of the scene.
The information below takes priority over character and setting definitions. -->

<roleplay_summary>
{{memories}}
</roleplay_summary>`;


export const default_scene_template = `<!--This is what happened so far during the roleplay, and the current state of the scene. This has been ordered into logical chapters.
The information below takes priority over character and setting definitions. -->

<roleplay_summary>
{{scene_summaries}}
</roleplay_summary>`;


export const regular_summary_error_detection_prompt = `You are validating summaries for a fictional roleplay system. Your ONLY task is to check if the summary meets the format requirements, not to evaluate the fictional content itself.

A valid summary must meet ALL these criteria:
1. Contains only factual statements without commentary or opinion
...`;

export const scene_summary_error_detection_prompt = `You are validating a scene summary. Return "VALID" if the summary is concise and accurate, otherwise return "INVALID".\n\nSummary:\n{{summary}}`;

export const combined_summary_error_detection_prompt = `...`;

export const scene_summary_default_prompt = `Summarize the following scene as if you are writing a concise chapter summary for a roleplay story. Focus on the most important events, character developments, emotional shifts, and plot points that would be useful to remember after this scene is no longer visible. Include character names, significant decisions, changes in relationships, and any details that may be relevant for future scenes. Write in past tense, avoid commentary or meta-statements, and do not include introductions or explanations.\nScene content:\n{{message}}`;
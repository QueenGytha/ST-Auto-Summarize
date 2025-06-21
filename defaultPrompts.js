export const default_prompt = `<!-- OOC REQUEST: Pause the roleplay and step out of character for this reply.
Analyze the roleplay history and answer a few questions about it.
Only include what happened in the history you are examining, do not speculate.
Fill in the fact sheet template below. You MUST return a correctly formatted XML template in the below format. -->

<template>
<npcs_facts>
<!-- include every NPC interacted with, besides {{user}}.
This info should be updated if new facts are available.
Do not list NPC actions here, only facts -->
(<!-- role -->): <!-- Appearance, speech manner, personality traits. -->
</npcs_facts>

<npcs_plans>
<!-- include and future plans or goals discussed -->
</npcs_plans

<npcs_mentioned>
<!-- Name -->: <!-- Role or N/A -->
</npcs_mentioned>

<visited_locations> <!-- Only list descriptive facts about the location itself. -->
<!-- title --> : <!-- description in at least 3 sentences -->
</visited_locations>

<secrets>
<!-- secret --> (kept secret by <!-- char --> from X)
</secrets>

<current_relationships> <!-- only include recurring characters, omit minor ones who are unlikely to recur -->
<!-- current long-term relationships between characters X and Y in at least 3 sentences. -->
</current_relationships>

<planned_events>
<!-- each event in at least 3 sentences -->
</planned_events>

<current_quests>
</current_quests>
</template>

<roleplay_history>
{{message}}
</roleplay_history>`;


export const default_combined_summary_prompt = `
<!-- OOC REQUEST: Pause the roleplay and step out of character for this reply.
You are being given multiple pieces of a single roleplay. Analyze and combine them while avoiding redundancy and repetition.
Fill out the fact sheet template below. Add, remove, and update the existing facts as appropriate.
Only include what happened in the history you are examining, do not speculate.
You MUST return a correctly formatted XML template in the below format. -->

{{#if previous_combined_summary}}
<!-- Here is the main roleplay history record. It should be used as the foundation, with any others altering it -->
<history_foundation_template>
{{previous_combined_summary}}
</history_foundation_template>
{{/if}}

<template>
<npcs_facts>
<!-- include every NPC interacted with, besides {{user}}.
This info should be updated if new facts are available.
Do not list NPC actions here, only facts -->
(<!-- role -->): <!-- Appearance, speech manner, personality traits. -->
</npcs_facts>

<npcs_plans>
<!-- include any future plans or goals discussed -->
</npcs_plans

<npcs_mentioned>
<!-- Name -->: <!-- Role or N/A -->
</npcs_mentioned>

<visited_locations> <!-- Only list descriptive facts about the location itself. -->
<!-- title --> : <!-- description in at least 3 sentences -->
</visited_locations>

<secrets>
<!-- secret --> (kept secret by <!-- char --> from X)
</secrets>

<current_relationships> <!-- only include recurring characters, omit minor ones who are unlikely to recur -->
<!-- current long-term relationships between characters X and Y in at least 3 sentences. -->
</current_relationships>

<planned_events>
<!-- each event in at least 3 sentences -->
</planned_events>

<current_quests>
</current_quests>
</template>


{{#if history}}
<roleplay_messages>
<!-- Additional context provided from recent messages: -->
{{history}}
</roleplay_messages>
{{/if}}


<roleplay_history>
<!-- JSON array of roleplay message histories to combine (in chronological order): -->
{{message}}
</roleplay_history>
`;

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

export const scene_summary_prompt = `
<!-- OOC REQUEST: Pause the roleplay and step out of character for this reply.
Analyze the roleplay scenes and answer a few questions about them. Only include what happened in the scenes you are examining, do not speculate.
Fill in the fact sheet template below. You MUST return a correctly formatted XML template in the below format. -->

<template>
<npcs_facts>
<!-- include every NPC interacted with, besides {{user}}.
This info should be updated if new facts are available.
Do not list NPC actions here, only facts -->
(<!-- role -->): <!-- Appearance, speech manner, personality traits. -->
</npcs_facts>

<npcs_plans>
<!-- include any future plans or goals discussed -->
</npcs_plans

<npcs_mentioned>
<!-- Name -->: <!-- Role or N/A -->
</npcs_mentioned>

<visited_locations> <!-- Only list descriptive facts about the location itself. -->
<!-- title --> : <!-- description in at least 3 sentences -->
</visited_locations>

<secrets>
<!-- secret --> (kept secret by <!-- char --> from X)
</secrets>

<current_relationships> <!-- only include recurring characters, omit minor ones who are unlikely to recur -->
<!-- current long-term relationships between characters X and Y in at least 3 sentences. -->
</current_relationships>

<planned_events>
<!-- each event in at least 3 sentences -->
</planned_events>

<current_quests>
</current_quests>
</template>


<roleplay_scenes>
{{message}}
</roleplay_scenes>
`;


export const scene_summary_error_detection_prompt = `You are validating a scene summary. Return "VALID" if the summary is concise and accurate, otherwise return "INVALID".\n\nSummary:\n{{summary}}`;

export const regular_summary_error_detection_prompt = `You are validating summaries for a fictional roleplay system. Your ONLY task is to check if the summary meets the format requirements, not to evaluate the fictional content itself.

A valid summary must meet ALL these criteria:
1. Contains only factual statements without commentary or opinion
...`;

export const combined_summary_error_detection_prompt = `...`;
    
export const scene_summary_default_prompt = `Summarize the following scene as if you are writing a concise chapter summary for a roleplay story. Focus on the most important events, character developments, emotional shifts, and plot points that would be useful to remember after this scene is no longer visible. Include character names, significant decisions, changes in relationships, and any details that may be relevant for future scenes. Write in past tense, avoid commentary or meta-statements, and do not include introductions or explanations.\nScene content:\n{{message}}`;
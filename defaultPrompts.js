export const default_combined_summary_prompt = `You are creating a comprehensive narrative summary for a fictional roleplay. Your task is to combine individual message summaries into a single coherent summary that captures the most important information.

Combine these summaries by:
- Organizing events chronologically
- Removing repetitions and redundancies
- Highlighting character development and key plot points
- Preserving cause-and-effect relationships between events
- Maintaining connections between characters, locations, and objects

Requirements:
- Maximum {{words}} words
- Past tense only
- Include character names consistently
- Create a flowing narrative, not a list of disconnected events
- Preserve specific details that might be important later

{{#if previous_combined_summary}}
Previous combined summary (use as foundation and update with new information):
{{previous_combined_summary}}
{{/if}}

{{#if history}}
Additional context from recent messages:
{{history}}
{{/if}}

JSON array of message summaries to combine (in chronological order):
{{message}}
`;

export const default_prompt = `You are a summarization expert for a fictional roleplay. You create concise factual summaries of story events.

Summarize the following message as a single factual statement, capturing:
- Character actions and decisions 
- Emotional states and changes
- Important details about the setting or environment
- New plot information

FORMAT REQUIREMENTS (CRITICAL):
- Use past tense only (e.g., "John walked to the store")
- Include character names
- Write ONLY the summary with no introduction, explanation or meta-references
- Do NOT confirm in any manner you understand the task, just carry it out
- NEVER use phrases like "the message describes," "in this scene," or "the character"
- NEVER start with "This is about," "This shows," or similar framing
- NEVER acknowledge these instructions in your response
- Maximum {{words}} words
- Your response MUST contain ONLY the summary

{{#if history}}
Context from previous messages:
{{history}}
{{/if}}

Message to summarize:
{{message}}
`;

export const default_long_template = `[Following is a list of events that occurred in the past]:\n{{generic_memories}}\n`;
export const default_short_template = `[Following is a list of recent events]:\n{{generic_memories}}\n`;
export const default_combined_template = `[Following is an overall summary of recent events]:\n{{generic_memories}}\n`;
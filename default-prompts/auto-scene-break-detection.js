// REQUIRED MACROS:
// - {{messages}} - Messages to analyze for scene breaks
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_detection_prompt = `Find the most significant scene break in this roleplay transcript.

Your task: Identify where the current scene ENDS (the message immediately before a new scene starts).

OUTPUT (valid JSON only, no code fences):
{
  "sceneBreakAt": false OR message number,
  "rationale": "Quote from message showing the break"
}

WHAT IS A SCENE BREAK?
A natural narrative boundary where the story shifts. Look for:
• Time passing (hours, days, "later", "meanwhile")
• Location changes (characters go somewhere new)
• Cast changes (new characters enter, others leave)
• Activity/topic shifts (conversation ends, new goal begins)
• Major events concluding (task done, conflict resolved)

NOT BREAKS:
• Ongoing dialogue between same characters
• Minor actions within the same scene
• Immediate continuations ("moments later")

INELIGIBLE:
• Messages marked "invalid choice"
• Messages before #{{earliest_allowed_break}}

INSTRUCTIONS:
1. Read all eligible messages
2. Find the STRONGEST scene transition (if multiple exist, pick the most significant)
3. Return that message number, or false if no clear break exists

Messages to analyze:
{{messages}}

Return the best scene break, or false if none exist.`;

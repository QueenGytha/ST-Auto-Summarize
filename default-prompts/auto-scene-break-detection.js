// REQUIRED MACROS:
// - {{messages}} - Messages to analyze for scene breaks
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_detection_prompt = `Analyze this roleplay transcript to determine if a significant scene break exists.

Your task: IF there is a natural narrative boundary, identify where the current scene ends (the message immediately before a new scene starts). If no clear break exists, return false.

OUTPUT (valid JSON only, no code fences):
{
  "sceneBreakAt": false OR message number,
  "rationale": "Quote showing the break" OR "No clear scene break found"
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
2. Evaluate if ANY message represents a clear scene transition
3. If multiple clear breaks exist, return the STRONGEST one
4. If no clear break exists, return false - do NOT force a weak break

Messages to analyze:
{{messages}}

Only return a scene break if it clearly meets the criteria above.`;

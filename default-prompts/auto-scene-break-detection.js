// REQUIRED MACROS:
// - {{messages}} - Messages to analyze for scene breaks
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_detection_prompt = `Segment roleplay into scenes. Find where current scene ENDS (message before new scene).

🚨 CRITICAL: Return the FIRST break you find. Do NOT read all messages to pick the "best" one.
🚨 Check messages IN ORDER from #{{earliest_allowed_break}}. STOP at the first match.

OUTPUT (valid JSON only, no code fences):
{
  "sceneBreakAt": false OR message number,
  "rationale": "EXACT quote from message"
}

RULES:
1. Start with { and end with }
2. Escape quotes in rationale as \"
3. Return message number immediately BEFORE new scene starts
4. Return FIRST break found - do NOT continue checking after finding one

SCENE BREAKS (ANY ONE of these):
• Time passes: "hours later", "next morning", "meanwhile", "afterward", "eventually", "<hours later>"
• Location changes: new room, new building, characters moving somewhere
• New character appears or enters
• Activity changes: planning→action, talking→fighting, one task→different task
• Topic shifts: conversation ends, new subject begins
• Emotional shift: tense→relaxed, playful→serious
• Something completes: question answered, task done, conversation wrapped
• Storytelling mode changes: dialogue→narration, back-and-forth→description
• Natural pause: character thinking, "after a moment", narrative beat

NOT BREAKS:
• Direct reply in ongoing dialogue (same characters talking)
• Minor actions: "turned around", "picked up", "stepped closer"
• Very short time: "moments later", "seconds later"

INELIGIBLE:
• Messages marked "invalid choice" - skip these
• Messages before #{{earliest_allowed_break}} - too early
• Messages in offset zone at end - these show future context

PROCESS:
1. Start at message #{{earliest_allowed_break}}
2. Check: Does NEXT message match ANY scene break criteria above?
3. YES? Return that message number. STOP. Do not check remaining messages.
4. NO? Move to next message. Repeat step 2.
5. No matches found? Return false.

EXAMPLES OF BREAKS:
"Dawn arrived" | "Rarity appears" | "entered the room" | "Meanwhile..." | planning→action |
conversation ends→new topic | tense→relaxed | question answered→new subject | "he paused, considering"

NOT BREAKS:
"turned around" | "moments later" | "we should get breakfast" (just talking about it)

Messages to analyze (with SillyTavern message numbers):
{{messages}}

🚨 FINAL REMINDER:
Check message #{{earliest_allowed_break}}, then #{{earliest_allowed_break}}+1, then +2, etc.
The MOMENT you find a break, return that number and STOP.
Do NOT read ahead to find a "better" break.`;

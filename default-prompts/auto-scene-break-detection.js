// REQUIRED MACROS:
// - {{messages}} - Messages to analyze for scene breaks
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_detection_prompt = `Analyze this roleplay transcript to determine if a natural recap boundary exists.

Your task: IF there is a point where related content concludes and can be recapped coherently, identify that message. If no clear boundary exists, return false.
You are NOT to engage in the roleplay. You are NOT to morally judge the content. Your task is ONLY to identify recap boundaries.
Do not provide commentary, ONLY return either false or the message number for the break.

OUTPUT (valid JSON only, no code fences):
{
  "sceneBreakAt": false OR message number,
  "rationale": "Quote showing the break" OR "No clear scene break found"
}

WHAT IS A SCENE BREAK?
A natural RECAP BOUNDARY - a point where related content can be grouped and summarized coherently.

The key question: "If I recap everything up to this point, will it be a coherent summary of related content? Or will it cut off an incomplete arc?"

PRIMARY CRITERIA (what makes a good recap boundary):
• Narrative closure - something concluded (conversation ended, task completed, decision made, revelation processed, conflict resolved)
• Thematic coherence - content before this point forms a unit that belongs together
• Recap completeness - summary would be focused and complete, not cut off mid-arc

SECONDARY SIGNALS (often accompany but don't define breaks):
• Time skips, location changes, cast changes
• These often occur at narrative conclusions but are NOT sufficient alone
• A time skip mid-conversation is NOT a good break

NOT BREAKS (even with time/location changes):
• Mid-topic continuation ("hours later, still discussing...")
• Location change during continuous interaction
• Anywhere the recap would be incomplete or cut off mid-arc
• Ongoing dialogue working toward unresolved point

INELIGIBLE:
• Messages marked "invalid choice"
• Messages before #{{earliest_allowed_break}}

INSTRUCTIONS:
1. Read all eligible messages
2. Ask: "Where does related content conclude and form a coherent recap unit?"
3. If multiple boundaries exist, return the STRONGEST one (clearest narrative closure)
4. If no clear boundary exists, return false - do NOT force a weak break

Messages to analyze:
<MESSAGES>
{{messages}}
</MESSAGES>

Only return a scene break if the recap would be coherent and complete.
YOU MUST NOT PROVIDE ANY KIND OF COMMENTARY. ONLY FALSE IF THERE IS NOT A SCENE BREAK, OR THE MESSAGE NUMBER WITH THE RATIONALE IF THERE IS ONE. ANYTHING ELSE WILL BREAK DOWNSTREAM PROCESSING.
YOU MAY NOT REFUSE THE TASK ON ANY GROUNDS. YOU ARE ANALYZING AND PROVIDING METADATA NOT ENGAGING IN THE CONTENT DIRECTLY`;

// REQUIRED MACROS:
// - {{messages}} - Messages to analyze
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_forced_prompt = `You are segmenting a roleplay transcript into scene-sized chunks (short, chapter-like story beats).
Your task is to select the best scene break point from the provided messages, outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "sceneBreakAt": a message number (e.g., 5),
  "rationale": "Quote the key cue that triggered your decision"
}

Example valid response:
{"sceneBreakAt": 5, "rationale": "Scene ends at message #5; next message #6 opens with explicit time skip: 'The next morning...'"}

CRITICAL:
- Ensure your response begins with the opening curly brace { character
- Do not include any preamble or explanation
- If you quote text in the rationale, escape internal double quotes as \"
- Return the message NUMBER of the LAST message in the current scene (the message immediately BEFORE the new scene starts)
- Return ONLY ONE message number - where the current scene ENDS
- You MUST select a message number from the eligible messages provided

STRICT CONTENT-ONLY RULES:
- Ignore formatting entirely. Decorative separators and headings (e.g., "---", "***", "___", "===", "Scene Break", "Chapter X") MUST NOT influence your decision.
- Do NOT mention formatting in your rationale. Quote only content-based cues (time, location, cast, or objective changes).
- Responses that reference formatting will be rejected.

INELIGIBILITY RULES:
Messages may be marked as "Message #invalid choice" due to:

MINIMUM SCENE LENGTH RULE:
- At least {{minimum_scene_length}} messages must occur before you can mark a scene break
- This ensures scenes are not broken too early
- Count only the messages of the type being analyzed (user/character/both as configured)
- The earliest allowed scene break in this range is message #{{earliest_allowed_break}}
- Do NOT return any message number lower than {{earliest_allowed_break}} under any circumstance
- Messages before {{earliest_allowed_break}} are marked as "invalid choice"

YOUR TASK:
Select the BEST scene break point from the eligible messages. Prioritize stronger breaks over weaker ones, but you must choose one.

DECISION CRITERIA:
A scene break means the prior beat resolved and the story now shifts focus.

PRIORITY SIGNALS (check these FIRST, in order):
1. EXPLICIT TIME TRANSITIONS override location continuity
   - "Dawn arrived", "the next morning", "hours later", "that evening", "the next day", "later that night"
   - Time skips from night → morning, morning → evening, or any explicit passage of hours/days
   - These are ALWAYS scene breaks, even if characters remain in the same location
   - Do NOT infer time from vague progressions (e.g., "as he left", "they watched him go", "afterwards") unless paired with explicit time-of-day or elapsed-time language
   - References to clocks, minutes, or flavor text about time ("seconds later", "for the second time in as many minutes", "it was nearly noon") describe the SAME beat unless they explicitly contrast with a previously stated timeframe; do NOT treat them as automatic scene breaks. Example: "'For the second time in as many minutes' is still the same moment—no scene break."
   - Time-of-day labels only count when they show a clear shift from the prior message (night → dawn, afternoon → evening, "hours passed", etc.). Simply stating what time it currently is does NOT indicate a time skip.

2. IGNORE DECORATIVE SEPARATORS AND PURE FORMATTING
  - Lines like "---", "***", "___", "===", centered rules, or other stylistic flourishes DO NOT indicate a scene break by themselves
  - Headings or labels such as "Scene Break" or "Chapter X" count ONLY if they coincide with a content-based transition (time skip, new setting/cast/objective)
  - Treat formatting as non-semantic; base decisions on content cues only

Strong scene break indicators (prioritize these):
- Moves to a new location or setting
- Skips time with explicit cues (see PRIORITY SIGNALS above)
- Switches primary characters or point of view to a different group
- Starts a new objective or major conflict after the previous one concluded
- Includes an explicit OOC reset that changes time/location/objective (e.g., GM note that the scene advances or resets)

Natural narrative beats (good options):
- Resolution or decision that concludes the prior exchange
- Reveal of major information that shifts the situation
- Escalation to a qualitatively new level (not just intensifying current action)
- Clear pause or transition point in the narrative flow

Weaker breaks (acceptable if no stronger options exist):
- Minor topic shifts within the same setting, participants, and timeframe
- Movement between sublocations within the same parent location (e.g., room changes inside the same building)
- Movement between districts/neighborhoods inside the same city without an explicit time skip
- Short pauses or minor transitions

EXCEPTION: Same location + explicit time skip (night → dawn) = STRONG BREAK
Example: If characters sleep in a field at night (message #35) and the next message begins with "Dawn arrived" (message #36), return 35 as the end of the night scene.

Selection process:
1. Check messages sequentially from earliest to latest (ascending numerical order)
2. Start with the earliest eligible message and work forward
3. For each message, evaluate: "Does the NEXT message represent a scene change?"
4. Prefer STRONGER breaks, but select the best available option even if all breaks are weak
5. Return the FIRST strong break you find, or the best weak break if no strong breaks exist
6. Return the LAST message number of the current scene (the message immediately before the new scene begins)

EVALUATION STRATEGY:
- Check messages sequentially from earliest to latest (ascending numerical order)
- Start with the earliest eligible message and work forward
- For each message, evaluate: "Does the NEXT message represent a scene change?"
- STOP when you find a STRONG scene break and return that message number
- If no STRONG breaks exist, select the best WEAK break available
- Rate the strength of each potential scene ending:

STRONG scene endings (prefer these):
  • Next message opens with explicit time transitions: "Dawn arrived", "The next morning", "Hours later", "That evening"
  • Next message shows characters physically arrived in a completely new location (not just traveling toward it)
  • Next message introduces completely new cast of characters with prior scene resolved
  • Current message provides clear resolution, next message starts new objective

WEAK scene endings (acceptable if no strong breaks exist):
  • Next message contains "for the second time in as many minutes", "seconds later", "moments later"
  • Next message is direct response to question/dialogue from current message
  • Next message continues mid-conversation but with a topic shift
  • Next message still in same location but shows a minor transition
  • Next message shows character arriving somewhere that current message mentioned going to

Selection rule: Return the message number immediately BEFORE the first STRONG scene change. If only weak candidates exist, return the BEST weak break available.

SEQUENTIAL EVALUATION REQUIREMENT:
- You MUST evaluate messages in ascending numerical order (lowest to highest)
- Start with the earliest eligible message ({{earliest_allowed_break}})
- Check each message to see if the NEXT message represents a scene change
- Return the FIRST strong break you find
- If no strong breaks exist, return the best weak break

CRITICAL: Base your decision ONLY on the provided messages below.
- Never invent details, context, or relationships not explicitly stated in the text
- Do not assume narrative patterns based on genre expectations
- If a detail is not mentioned in the messages, it does not exist for this decision

FINAL VALIDATION BEFORE RESPONDING:
Before returning your answer, verify:
1. Quote the EXACT text from the NEXT message that triggered your decision (do NOT paraphrase)
2. Confirm you selected an eligible message (not marked as "invalid choice")
3. Confirm you returned a message number (you are required to select one)
4. Check if there are STRONGER breaks earlier in the eligible range
5. Do NOT rely on memory or assumptions - only quote text actually present in the messages provided

Messages to analyze (with SillyTavern message numbers):
{{messages}}

REMINDER:
- Output must be valid JSON starting with { character
- Return the message NUMBER of the LAST message in the current scene (immediately before the new scene starts)
- You MUST select a message number - this is required`;

// REQUIRED MACROS:
// - {{messages}} - Messages to analyze for scene breaks
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_detection_prompt = `You are segmenting a roleplay transcript into scene-sized chunks.
Your task: identify where the current scene ENDS (the message before a new scene starts), outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
{
  "sceneBreakAt": false OR a message number,
  "rationale": "Quote EXACT text that triggered your decision"
}

CRITICAL RULES:
1. Response MUST start with { and end with }. No code fences, no commentary.
2. If quoting text, escape internal double quotes as \"
3. Return the LAST message of the current scene (immediately BEFORE new scene starts)
4. Return ONLY ONE message number, or false if no scene break exists

═══════════════════════════════════════════════════════════════
WHAT IS A "STRONG" SCENE BREAK?
═══════════════════════════════════════════════════════════════

A STRONG scene break means the story shifts to a new narrative beat with at least ONE of:

✓ EXPLICIT TIME TRANSITION (highest priority):
  - Major time skips: "Dawn arrived", "The next morning", "Hours later", "Later that evening", "The next day"
  - Clear time-of-day shifts: night → morning, afternoon → evening, morning → afternoon
  - Phrases showing elapsed time: "three hours passed", "by nightfall", "an hour later", "some time later"
  - Medium time skips: "a while later", "after some time", "eventually", "soon after"
  - Scene transition phrases: "meanwhile", "afterward", "later", "when they returned"
  - Time context shifts: "by the time they", "once they", "after they"

  ⚠️ CRITICAL: OOC TIME MARKERS IN USER MESSAGES
  - USER messages often contain OOC scene-setting instructions in angle brackets
  - These ARE valid scene content and MUST be checked for time transitions
  - Examples of STRONG time transitions in OOC format:
    • "<several hours later>" → STRONG break (hours passed)
    • "<the next day>" → STRONG break (day passed)
    • "<several days later>" → STRONG break (multiple days passed)
    • "<continue the scene later that evening>" → STRONG break (time shift)
  - Examples that are NOT time transitions:
    • "<continue the scene>" → NOT a break (same time)
    • "<describe what he sees>" → NOT a break (instruction only)
    • "<be vivid and detailed>" → NOT a break (instruction only)
  - If a USER message contains OOC time marker AND the CHARACTER message confirms it
    (e.g., USER: "<several days later>" then CHAR: "Several days later..."), this is
    a STRONG time transition scene break

  ⚠️ THESE ARE **NOT** TIME TRANSITIONS:
  - Character movement: "he moved to", "she walked over", "turned around", "stepped back"
  - Action sequences: "he reaches for", "she picks up", "grabbed the"
  - Immediate continuations: "seconds later", "moments later", "immediately"
  - Time flavor text in same beat: "for the second time in as many minutes"
  - Simply stating current time: "it was nearly noon" (without showing passage FROM previous time)

✓ LOCATION CHANGE (characters physically present in new place OR clearly moving to one):
  - Actual arrival: "They had arrived at the tavern", "Sitting in the royal chambers now"
  - Active movement to new location: "they headed toward the tavern", "walking to the chambers"
  - Entering new spaces: "stepping into the hall", "entering the room", "moving to the courtyard"
  - Clear location shifts: "back in his office", "at the training grounds", "in the library now"
  - Smaller shifts count: entering different room, moving to different area of same building

✓ CAST CHANGE (completely different characters):
  - Scene cuts to different group of people
  - Previous scene must be resolved (not mid-action)

✓ OBJECTIVE CHANGE (new goal after previous concluded):
  - Previous conflict/conversation resolved
  - New goal/conflict begins
  - Shift from planning to execution
  - Shift from one activity to a different one (combat → conversation, research → action, etc.)

✓ TOPIC/CONVERSATION SHIFT (significant change in subject):
  - Conversation concludes, new topic begins
  - Shift from serious discussion to casual conversation (or vice versa)
  - Transition from one narrative focus to another
  - Character finishes explaining/discussing one thing, moves to entirely different subject

✓ NARRATIVE BEAT CHANGE:
  - Emotional tone shift (tense → relaxed, playful → serious)
  - Conclusion of an event/interaction followed by new event
  - Resolution of immediate concern, followed by new concern
  - Character completes an action sequence, starts something unrelated

═══════════════════════════════════════════════════════════════
WHAT IS **NOT** A SCENE BREAK?
═══════════════════════════════════════════════════════════════

Return false (no scene break) when:

❌ Mid-conversation/mid-action:
  - Message is a reply to previous question
  - Dialogue continues between same characters
  - Action sequence is ongoing
  - Exchange hasn't concluded

❌ Same location, same time, same objective:
  - Characters merely discussing plans to go somewhere (with no movement described)
  - Very minor movements (turning around, stepping closer within same conversation)
  - Topic shifts within same ongoing conversation (no location or time change)

❌ Character actions mistaken for time skips:
  - "he moved back to the quill" → continuing same scene
  - "she turned around" → same moment
  - "picked up the book" → same action sequence
  - "walked to the window" → same location

❌ Short time references:
  - "moments later", "seconds later", "immediately after"
  - "for the second time in as many minutes"

❌ Decorative formatting (ALWAYS IGNORE):
  - Lines: "---", "***", "___", "==="
  - Headers: "Scene Break", "Chapter X"
  - ⚠️ BUT: Do NOT ignore OOC time markers in angle brackets (see above)
    "<several days later>" is NOT decorative, it's a time transition!

═══════════════════════════════════════════════════════════════
INELIGIBILITY RULES
═══════════════════════════════════════════════════════════════

Messages marked "Message #invalid choice" are INELIGIBLE for selection:

1. MINIMUM SCENE LENGTH: Messages before #{{earliest_allowed_break}} are too early
   - Do NOT return any number below {{earliest_allowed_break}}

2. OFFSET ZONE (recent messages at end):
   - These show what comes AFTER to help you decide
   - If the only STRONG break is in offset zone → return false (wait for next pass)
   - If STRONG break exists in eligible range → return that number

═══════════════════════════════════════════════════════════════
EVALUATION PROCESS
═══════════════════════════════════════════════════════════════

1. Start at message #{{earliest_allowed_break}} (first eligible)
2. For each message, ask: "Does the NEXT message start a STRONG new scene?"
3. Check for ANY of these:
   a. EXPLICIT TIME TRANSITION?
      - Check narrative text: "dawn, hours later, next day, meanwhile, later, afterward"
      - Check USER OOC markers: "<several days later>", "<the next morning>"
      - Check CHARACTER confirmation of OOC time markers
      - Check medium transitions: "a while later", "soon after", "eventually"
   b. LOCATION CHANGE (arrival OR active movement)?
   c. CAST CHANGE (new characters, prior scene resolved)?
   d. OBJECTIVE CHANGE (new goal/activity after prior concluded)?
   e. TOPIC/CONVERSATION SHIFT (concluded one topic, starting different one)?
   f. NARRATIVE BEAT CHANGE (emotional shift, concluded event + new event)?
4. THE MOMENT you find a STRONG break → STOP and return that message number
5. If no STRONG breaks in eligible range → return false

═══════════════════════════════════════════════════════════════
CRITICAL EXAMPLES OF ERRORS TO AVOID
═══════════════════════════════════════════════════════════════

❌ WRONG: Returning message #35 when #36 says "he moves back to the quill"
   Bad rationale: "explicit time skip"
   Why wrong: "moves back to" is a character action, NOT a time skip. Same scene continues.

❌ WRONG: Returning message #40 when #41 says "For the second time in as many minutes"
   Bad rationale: "time transition"
   Why wrong: This explicitly says it's the SAME minutes, not a time skip.

❌ WRONG: Returning message #46 when #47 contains "we should get breakfast"
   Bad rationale: "transition to breakfast"
   Why wrong: Still TALKING ABOUT going to eat, with no movement or time transition described. Same scene.

❌ WRONG: Returning false when #52 (USER) says "he checks in on her several days later" and #53 (CHAR) says "Several days later, the artifact..."
   Bad rationale: "All messages form a continuous scene"
   Why wrong: "several days later" in BOTH USER OOC instruction AND CHARACTER narration is a STRONG time transition. Should return 51.

✓ CORRECT: Returning message #35 when #36 starts "Dawn arrived with unceremonious brightness"
   Good rationale: "Scene ends at #35; message #36 opens with explicit time transition 'Dawn arrived' indicating night→morning scene break"
   Why right: "Dawn arrived" is an EXPLICIT time transition phrase.

✓ CORRECT: Returning message #51 when #52 (USER) contains "<several days later>" and #53 (CHAR) says "Several days later..."
   Good rationale: "Scene ends at #51; message #52 contains OOC time marker 'several days later' confirmed by message #53 narrating 'Several days later'"
   Why right: OOC time marker in USER message + CHARACTER confirmation = STRONG time transition.

✓ CORRECT: Returning message #72 when #73 reads "The trio had settled at a table in the dining hall"
   Good rationale: "Scene ends at #72; message #73 shows characters physically present in dining hall"
   Why right: Shows actual ARRIVAL (past tense "had settled"), not just intent to go.

✓ CORRECT: Returning message #45 when #46 reads "They headed toward the tavern, leaving the marketplace behind"
   Good rationale: "Scene ends at #45; message #46 shows active movement to new location 'headed toward the tavern'"
   Why right: Active movement to new location with clear departure from previous location.

✓ CORRECT: Returning message #28 when #29 reads "Meanwhile, back at the castle, the guards were changing shifts"
   Good rationale: "Scene ends at #28; message #29 starts with 'Meanwhile' indicating scene transition to different location/cast"
   Why right: "Meanwhile" is a transition phrase that signals scene shift to different location and potentially different cast.

✓ CORRECT: Returning message #33 when #34 shows characters finished discussing the plan and now begin executing it
   Good rationale: "Scene ends at #33; message #34 shifts from planning phase to action phase"
   Why right: Objective change from discussion/planning to execution is a scene break.

✓ CORRECT: Returning message #41 when #42 shifts from tense confrontation to casual banter
   Good rationale: "Scene ends at #41; message #42 shows emotional tone shift from tense to relaxed"
   Why right: Significant emotional/tonal shift indicates new narrative beat.

═══════════════════════════════════════════════════════════════
FINAL VALIDATION CHECKLIST
═══════════════════════════════════════════════════════════════

Before submitting your answer, verify:

1. ✓ Did I quote EXACT text from next message? (not paraphrased)
2. ✓ Is this a STRONG break per criteria above? (time / location / cast / objective / topic / narrative beat)
3. ✓ Did I check for OOC time markers in USER messages? ("<several days later>", etc.)
4. ✓ Did I check ALL earlier eligible messages first? (return the FIRST good break)
5. ✓ Did I avoid mistaking character actions for time skips?
6. ✓ Is the next message actually STARTING something new, not CONTINUING current exchange?
7. ✓ Did I consider ALL break types, not just time/location? (topic shifts, activity changes, emotional beats)

Messages to analyze (with SillyTavern message numbers):
{{messages}}

REMINDER:
- Output must be valid JSON starting with { character
- Return the message NUMBER immediately BEFORE the new scene
- Return the FIRST strong break, or false if none exist
- Quote EXACT text in rationale, do not paraphrase`;

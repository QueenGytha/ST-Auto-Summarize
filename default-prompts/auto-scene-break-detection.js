// REQUIRED MACROS:
// - {{messages}} - Messages to analyze for scene breaks
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_detection_prompt = `You are segmenting a roleplay transcript into scene-sized chunks.
Your task: identify where the current scene ENDS (the message before a new scene starts), outputting ONLY valid JSON.

⚠️ PRIORITY: Find the FIRST reasonable scene break. Don't wait for a "perfect" one.
The goal is to segment the story into manageable chunks, not to wait for ideal breaks.

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
5. Return the FIRST scene break you find - don't keep looking for a "better" one

═══════════════════════════════════════════════════════════════
SCENE BREAK CRITERIA (any ONE qualifies)
═══════════════════════════════════════════════════════════════

A scene break is when the story shifts to a new narrative beat. Look for ANY of these:

✓ EXPLICIT TIME TRANSITION (highest priority):
  - Major time skips: "Dawn arrived", "The next morning", "Hours later", "Later that evening", "The next day"
  - Clear time-of-day shifts: night → morning, afternoon → evening, morning → afternoon
  - Phrases showing elapsed time: "three hours passed", "by nightfall", "an hour later", "some time later"
  - Medium time skips: "a while later", "after some time", "eventually", "soon after"
  - Scene transition phrases: "meanwhile", "afterward", "later", "when they returned"
  - Time context shifts: "by the time they", "once they", "after they"

  ⚠️ OOC TIME MARKERS: USER messages may have angle brackets like "<several hours later>"
     These ARE valid time transitions. Count them.
     Examples: "<the next day>", "<hours later>", "<meanwhile>"
     NOT time markers: "<continue>", "<describe>", "<be detailed>" (just instructions)

✓ LOCATION CHANGE (characters physically present in new place OR clearly moving to one):
  - Actual arrival: "They had arrived at the tavern", "Sitting in the royal chambers now"
  - Active movement to new location: "they headed toward the tavern", "walking to the chambers"
  - Entering new spaces: "stepping into the hall", "entering the room", "moving to the courtyard"
  - Clear location shifts: "back in his office", "at the training grounds", "in the library now"
  - Smaller shifts count: entering different room, moving to different area of same building

✓ CAST CHANGE (new character appears or focus shifts):
  - New character introduced into the scene
  - Scene cuts to different group of people
  - Character enters who wasn't present before
  - Previous scene doesn't need to be "resolved" - just shifting focus counts

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

✓ COMPLETION/RESOLUTION POINTS:
  - Question gets answered, then new topic/question begins
  - Task/goal completed, even if new one starts immediately after
  - Conversation naturally wraps up (agreement reached, goodbye said, topic exhausted)
  - Action sequence completes (fight ends, ritual finishes, item obtained)

✓ MODE SHIFTS (how the story is being told):
  - Dialogue → narration/action (or vice versa)
  - Internal thoughts → external action
  - Description/setup → actual event happening
  - Fast-paced exchange → slower detailed narration

✓ NATURAL PAUSES:
  - Significant narrative pause or ellipsis moment
  - Character needs time to think/process before responding
  - Waiting period (even brief ones like "after a moment")
  - Any clear "beat" or "breath" in the narrative flow

═══════════════════════════════════════════════════════════════
NOT A SCENE BREAK
═══════════════════════════════════════════════════════════════

Only skip these:

❌ Direct replies in ongoing dialogue (same characters, immediate response)
❌ Very minor actions: "turned around", "stepped closer", "picked up the book"
❌ Immediate continuations: "moments later", "seconds later"
❌ Decorative formatting: "---", "***", scene divider lines (but OOC markers like "<several days later>" ARE valid)

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
HOW TO FIND THE BREAK
═══════════════════════════════════════════════════════════════

1. Start at message #{{earliest_allowed_break}} (first eligible)
2. For each message, check if the NEXT message has ANY of:
   - Time transition
   - Location change
   - New character appears
   - Activity/objective change
   - Topic shift
   - Emotional/narrative beat change
   - Completion/resolution (question answered, task done, conversation wrapped)
   - Mode shift (dialogue↔narration, internal↔external, setup→event)
   - Natural pause (beat, thinking moment, "after a moment")
3. Found a match? Return that message number immediately. Done.
4. No matches in eligible range? Return false.

═══════════════════════════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════════════════════════

✓ "Dawn arrived" = TIME break
✓ "Rarity appears" = CAST break
✓ "They headed toward the tavern" = LOCATION break
✓ "Meanwhile, back at the castle" = TIME + LOCATION break
✓ planning → execution = ACTIVITY break
✓ "ending up in another private room with Cozy Glow" = LOCATION + CAST break
✓ "She finally nodded. 'I understand.'" then next message starts new topic = COMPLETION break
✓ Long back-and-forth dialogue → suddenly detailed narration = MODE break
✓ "He paused, considering her words" = NATURAL PAUSE break
✓ Character asks question → gets full answer → new subject begins = RESOLUTION break

❌ "he moves back to the quill" = NOT a break (same scene action)
❌ "for the second time in as many minutes" = NOT a break (same timeframe)
❌ "we should get breakfast" = NOT a break (just discussing, not there yet)

═══════════════════════════════════════════════════════════════
FINAL VALIDATION CHECKLIST
═══════════════════════════════════════════════════════════════

Quick checks before answering:
1. ✓ Quoted EXACT text from message (not paraphrased)?
2. ✓ This is the FIRST break I found (didn't skip earlier ones)?
3. ✓ Checked ALL break types (time/location/cast/topic/activity/emotion/completion/mode/pause)?
4. ✓ Next message STARTS something new (not continuing current exchange)?

Messages to analyze (with SillyTavern message numbers):
{{messages}}

REMINDER:
- Output must be valid JSON starting with { character
- Return the message NUMBER immediately BEFORE the new scene
- Return the FIRST strong break, or false if none exist
- Quote EXACT text in rationale, do not paraphrase`;

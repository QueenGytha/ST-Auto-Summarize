// REQUIRED MACROS:
// - {{messages}} - Messages to analyze for scene breaks
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_detection_prompt = `🚨 MANDATORY SEQUENTIAL PROCESSING 🚨
You MUST check messages ONE AT A TIME in order. You are FORBIDDEN from reading all messages before deciding.

Your task: Find where the current scene ENDS (the message immediately before a new scene starts).

REQUIRED OUTPUT FORMAT (valid JSON only, no code fences):
{
  "sceneBreakAt": false OR message number,
  "rationale": "EXACT quote from message"
}

JSON RULES:
1. Start with { and end with }
2. Escape quotes in rationale as \"
3. Return message number immediately BEFORE new scene starts
4. Return FIRST break found - STOP immediately, do NOT continue checking

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEQUENTIAL EVALUATION PROCESS - FOLLOW EXACTLY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Start at message #{{earliest_allowed_break}}

STEP 2: Read ONLY the current message. Check if it matches ANY of these STRONG break criteria:

   STRONG BREAKS (return immediately if found):
   ✓ Character departs/leaves: "he left", "hurried away", "departed", "eager to be away"
   ✓ Conversation explicitly ends: "conversation concluded", characters part ways
   ✓ Major task completes: quest done, goal achieved, big decision made
   ✓ Next message shows arrival at completely new location
   ✓ Next message has explicit time skip: "hours later", "next morning", "the next day"
   ✓ Next message introduces new character who starts participating
   ✓ Major activity change: talking→fighting, planning→executing, storyline changes

STEP 3: Did you find a STRONG break?
   → YES: Return {"sceneBreakAt": [message number], "rationale": "[exact quote]"} - STOP NOW
   → NO: Continue to STEP 4

STEP 4: Move to the NEXT message. Repeat STEP 2-3.

STEP 5: Have you checked 20+ messages without finding a STRONG break?
   → NO: Continue STEP 2-4 (keep looking for STRONG breaks only)
   → YES: Now START accepting WEAK breaks (continue to STEP 6)

STEP 6: From now on, also accept WEAK breaks:

   WEAK BREAKS (accept ONLY after 20+ messages checked):
   ✓ Topic shifts noticeably: conversation changes subject significantly
   ✓ Emotional/tone shift: tense→relaxed, serious→playful
   ✓ Minor completions: question answered, small task done
   ✓ Character expresses intent to leave: "I should go", "I'm going to..."
   ✓ Natural conversational pause: "he paused", "after a moment of thought"
   ✓ Activity changes within scene: sitting→standing, eating→talking

STEP 7: Found ANY break (strong or weak)?
   → YES: Return {"sceneBreakAt": [message number], "rationale": "[exact quote]"} - STOP NOW
   → NO: Move to next message, repeat

STEP 8: Finished checking ALL eligible messages with no breaks found?
   → Return {"sceneBreakAt": false, "rationale": "No scene breaks detected in range"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NOT BREAKS (ignore these):
✗ Direct reply in ongoing dialogue (same characters talking)
✗ Minor actions: "turned around", "picked up", "stepped closer"
✗ Very short time: "moments later", "seconds later"

INELIGIBLE MESSAGES (skip these):
✗ Messages marked "invalid choice"
✗ Messages before #{{earliest_allowed_break}}
✗ Messages in offset zone at end (future context)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Messages to analyze (with SillyTavern message numbers):
{{messages}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 BEFORE YOU RESPOND - VERIFY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Did I check messages sequentially starting from #{{earliest_allowed_break}}?
2. Did I STOP at the FIRST break I found?
3. Did I avoid reading all messages before deciding?
4. If I found a break in the first 20 messages, was it a STRONG break?
5. If I found a break after 20+ messages, can it be WEAK or STRONG?
6. Is my rationale an EXACT quote from the message?

Remember: Return THE FIRST break you encounter. Do NOT compare options.`;

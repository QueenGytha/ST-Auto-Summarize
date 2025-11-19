// REQUIRED MACROS:
// - {{messages}} - Messages to analyze
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_forced_prompt = `🚨 MANDATORY SEQUENTIAL PROCESSING 🚨
You MUST check messages ONE AT A TIME in order. You are FORBIDDEN from reading all messages before deciding.

Your task: Select the FIRST valid scene break from the provided messages. You MUST return a message number (cannot return false).

MANDATORY OUTPUT FORMAT (valid JSON only, no code fences):
{
  "sceneBreakAt": a message number (e.g., 5),
  "rationale": "Quote the key cue that triggered your decision"
}

JSON RULES:
- Response MUST start with { and end with }
- No preamble, no code fences, no commentary
- Escape internal quotes as \"
- Return the message NUMBER of the LAST message in the current scene (immediately BEFORE the new scene starts)
- You MUST select a message number from eligible messages

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INELIGIBILITY RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✗ Messages marked "invalid choice"
✗ Messages before #{{earliest_allowed_break}} (minimum scene length: {{minimum_scene_length}})
✗ Messages in offset zone at end (future context only)

FORMATTING RULE:
✗ Ignore decorative separators: "---", "***", "___", "===", "Scene Break", "Chapter X"
✗ Do NOT mention formatting in rationale - quote ONLY content-based cues

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEQUENTIAL EVALUATION PROCESS - FOLLOW EXACTLY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: Start at message #{{earliest_allowed_break}}

STEP 2: Read ONLY the current message. Check if it matches ANY STRONG break criteria:

   STRONG BREAKS (return immediately if found):
   ✓ Character departs/leaves: "he left", "hurried off", "departed", "eager to be away"
   ✓ Conversation explicitly ends: "conversation concluded", characters part ways
   ✓ Major task completes: quest done, goal achieved, big decision made
   ✓ Next message shows arrival at completely new location
   ✓ Next message has explicit time skip: "Dawn arrived", "hours later", "next morning", "that evening"
      → Time skips OVERRIDE location continuity (same place but hours/days later = STRONG break)
      → Do NOT treat vague time refs as skips: "moments later", "seconds later", "it was nearly noon"
      → Only count clear temporal shifts: night→morning, afternoon→evening, "hours passed"
   ✓ Next message introduces new character who starts participating
   ✓ Major activity change: talking→fighting, planning→executing, storyline changes
   ✓ OOC scene reset that changes time/location/objective

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
   ✓ Movement between sublocations: different room in same building
   ✓ Short time references: "moments later", "after a pause"

STEP 7: Found ANY break (strong or weak)?
   → YES: Return {"sceneBreakAt": [message number], "rationale": "[exact quote]"} - STOP NOW
   → NO: Move to next message, repeat

STEP 8: Checked all messages? Return the BEST break you found:
   → Prioritize STRONG breaks over WEAK breaks
   → If only WEAK breaks exist, return the earliest WEAK break
   → You MUST return a message number

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NOT BREAKS (ignore these):
✗ Direct reply in ongoing dialogue (same characters talking)
✗ Minor actions: "turned around", "picked up", "stepped closer"
✗ Very short time: "moments later", "seconds later"

IMPORTANT NOTES:
• Base decisions ONLY on provided messages - do not invent details
• Do not assume narrative patterns based on genre
• Even dialogue-heavy scenes need breaks - accept WEAK breaks after 20+ messages
• Better to break on weak signal than create 50+ message scenes

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
6. Is my rationale an EXACT quote from the message (no formatting references)?
7. Did I return a valid message number (required - cannot return false)?

Remember: Return THE FIRST break you encounter. Do NOT compare options. You MUST select a message number.`;

// REQUIRED MACROS:
// - {{messages}} - Messages to analyze
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_forced_prompt = `🚨 MANDATORY SCENE BREAK SELECTION 🚨
Your task: Analyze the provided messages and select the SINGLE BEST scene break point. You MUST return a message number (cannot return false).

MANDATORY OUTPUT FORMAT (valid JSON only, no code fences):
{
  "sceneBreakAt": a message number (e.g., 5),
  "rationale": "Quote the key cue that makes this the best break point"
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
SCENE BREAK CRITERIA (evaluate ALL eligible messages, select BEST):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Look for natural narrative boundaries where the story shifts:

✓ Time passing:
  • Explicit time skips: "Dawn arrived", "hours later", "next morning", "that evening"
  • Clear temporal shifts: night→morning, afternoon→evening, "hours passed"
  • Do NOT treat vague refs as skips: "moments later", "seconds later", "it was nearly noon"

✓ Location changes:
  • Characters arrive at completely new location
  • Major scene relocation (not just moving between rooms in same building)
  • Departure/travel: "he left", "hurried off", "departed", "made their way to"

✓ Cast changes:
  • New character enters and participates
  • Character leaves scene: "eager to be away", characters part ways
  • Conversation explicitly ends

✓ Activity/objective shifts:
  • Major activity change: talking→fighting, planning→executing
  • Task completes: quest done, goal achieved, big decision made
  • Topic shifts significantly: conversation changes subject completely
  • Emotional/tone shift: tense→relaxed, serious→playful

✓ Natural pauses:
  • Character expresses intent to leave: "I should go", "I'm going to..."
  • Natural conversational pause with topic closure
  • Minor completions: question answered, small task done

✗ NOT scene breaks:
  • Direct reply in ongoing dialogue (same characters talking)
  • Minor actions: "turned around", "picked up", "stepped closer"
  • Movement between sublocations in same area
  • Very short time: "moments later", "seconds later"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECTION PROCESS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Read all eligible messages (from #{{earliest_allowed_break}} onward, excluding offset zone)
2. Identify ALL potential scene break points based on criteria above
3. Select the BEST break point:
   → Prioritize clear time skips and location changes (strongest signals)
   → Then major activity/cast changes
   → Then topic shifts and natural pauses
4. Return the selected message number with your rationale for why this is the best break point

IMPORTANT NOTES:
• Base decisions ONLY on provided messages - do not invent details
• If multiple strong breaks exist, choose the best one
• You MUST return a valid message number - selection is mandatory

Messages to analyze (with SillyTavern message numbers):
<MESSAGES>
{{messages}}
</MESSAGES>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEFORE YOU RESPOND - VERIFY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Did I evaluate ALL eligible messages?
2. Did I identify the BEST scene break point (not just the first acceptable one)?
3. Is my selected message eligible (not marked "invalid choice")?
4. Is my rationale an EXACT quote from the message (no formatting references)?
5. Did I return a valid message number (required - cannot return false)?

Remember: Select the SINGLE BEST break point. You MUST return a message number.`;

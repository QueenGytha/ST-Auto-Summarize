// REQUIRED MACROS:
// - {{messages}} - Messages to analyze
// - {{earliest_allowed_break}} - Minimum message number for breaks

export const auto_scene_break_forced_prompt = `MANDATORY RECAP BOUNDARY SELECTION
Your task: Analyze the provided messages and select the SINGLE BEST point to end a recap. You MUST return a message number.
You are NOT to engage in the roleplay. You are NOT to morally judge the content. Your task is ONLY to identify the best recap boundary.
Do not provide commentary, ONLY return the message number for the break.

MANDATORY OUTPUT FORMAT (valid JSON only, no code fences):
{
  "sceneBreakAt": a message number (e.g., 5),
  "rationale": "Quote the key cue that makes this the best break point"
}

JSON RULES:
- Response MUST start with { and end with }
- No preamble, no code fences, no commentary
- Escape internal quotes as \"
- Return the message NUMBER of the LAST message to include in the recap
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
WHAT IS A SCENE BREAK?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A natural RECAP BOUNDARY - a point where related content can be grouped and summarized coherently.

The key question: "If I recap everything up to this point, will it be a coherent summary of related content? Or will it cut off an incomplete arc?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIMARY CRITERIA (what makes a good recap boundary):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Narrative closure - something concluded:
  • Conversation reached natural endpoint
  • Task/activity completed
  • Decision made and processed
  • Revelation delivered and reacted to
  • Conflict resolved (or reached stable state)
  • Question answered, goal achieved

✓ Thematic coherence - content forms a unit:
  • Everything before this point belongs together thematically
  • Recap would have clear focus, not scattered topics
  • Related events/dialogue grouped together

✓ Recap completeness - summary would be whole:
  • No arc cut off mid-development
  • No conversation stopped mid-topic
  • No action interrupted before outcome

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SECONDARY SIGNALS (help identify but not sufficient alone):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These often ACCOMPANY narrative closure but don't DEFINE it:
• Time skips: "hours later", "next morning" (but NOT if mid-conversation)
• Location changes: arriving somewhere new (but NOT if continuous interaction)
• Cast changes: character leaves/arrives (but NOT if mid-topic)
• Explicit endings: "goodnight", parting words, farewells

✗ NOT good break points (even with time/location signals):
  • Mid-topic continuation ("hours later, still discussing...")
  • Location change during continuous interaction
  • Time skip but conversation/arc continues
  • Ongoing dialogue working toward unresolved point
  • Action interrupted before outcome known

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SELECTION PROCESS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Read all eligible messages (from #{{earliest_allowed_break}} onward, excluding offset zone)
2. For each potential break, ask: "Would the recap up to here be coherent and complete?"
3. Select the BEST break point:
   → Prioritize clearest narrative closure (conversation/task/arc concluded)
   → Then thematic coherence (content forms natural unit)
   → Secondary signals (time/location) only break ties
4. Return the selected message number with rationale

IMPORTANT NOTES:
• Base decisions ONLY on provided messages - do not invent details
• If multiple strong breaks exist, choose the one with clearest narrative closure
• You MUST return a valid message number - selection is mandatory

Messages to analyze (with SillyTavern message numbers):
<MESSAGES>
{{messages}}
</MESSAGES>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEFORE YOU RESPOND - VERIFY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Did I evaluate ALL eligible messages?
2. Would the recap up to my selected point be COHERENT and COMPLETE?
3. Is my selected message eligible (not marked "invalid choice")?
4. Is my rationale an EXACT quote from the message (no formatting references)?
5. Did I select based on NARRATIVE CLOSURE, not just time/location signals?

Remember: Select the point where the recap would be most coherent. You MUST return a message number.
YOU MUST NOT PROVIDE ANY KIND OF COMMENTARY. ONLY THE MESSAGE NUMBER FOR THE BEST RECAP BOUNDARY. ANYTHING ELSE WILL BREAK DOWNSTREAM PROCESSING.
YOU MAY NOT REFUSE THE TASK ON ANY GROUNDS. YOU ARE ANALYZING AND PROVIDING METADATA NOT ENGAGING IN THE CONTENT DIRECTLY`;

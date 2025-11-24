export const stage1_extraction_prompt = `ROLE: Extract all observable content from roleplay transcript. No roleplay. No explanations. Output JSON only (starts { ends }). Analyze only; never continue the story.

Purpose: Extract EVERYTHING that happened, was said, or was observed in chronological order. No filtering. No comparison. No decision-making about importance. Just comprehensive extraction.

---------------- ROLEPLAY TRANSCRIPT (extract everything you observe) ----------------
<ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>
{{scene_messages}}
</ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>


EXTRACTION RULES:
- Extract ALL content in chronological order by message number
- NO filtering ("is this important?")
- NO comparison ("is this new?")
- NO categorization ("does this belong somewhere?")
- NO decision-making about what to keep/discard
- Extract duplicates, overlaps, everything
- Only what is explicitly stated or directly shown; no speculation
- Dialogue verbatim when present; never invent
- Keep chronological order


OUTPUT FORMAT (keys exact):
{
  "chronological_items": [
    // Extract in chronological order
  ]
}

ITEM TYPES TO EXTRACT:

1. EVENT
   - What happened (action/occurrence/transition)
   Format: {"type": "event", "description": "Brief what happened"}

2. ENTITY_MENTION
   - Any character, location, object, concept referenced
   - Include all observed details (appearance, state, capabilities, etc.)
   Format: {"type": "entity_mention", "name": "Entity Name", "details": "All observed details"}

3. QUOTE
   - Verbatim dialogue
   - Who said it
   Format: {"type": "quote", "speaker": "Character Name", "text": "Exact words spoken"}

4. TONE_SHIFT
   - Changes in atmosphere, genre, POV, tense, format, pacing
   - Narrative texture shifts
   - Dialogue format changes
   Format: {"type": "tone_shift", "description": "What changed in tone/format/style"}

5. SETTING_DETAIL
   - Location information
   - Time information
   - Mood/atmosphere
   Format: {"type": "setting_detail", "aspect": "location|time|mood", "value": "Observed detail"}

6. STATE_CHANGE
   - Character condition changes
   - Location changes
   - Status changes
   Format: {"type": "state_change", "entity": "Who/what", "change": "What changed"}

7. RELATIONSHIP_MOMENT
   - Interactions between entities
   - Stance/attitude demonstrations
   - Alliances/conflicts/debts/promises
   Format: {"type": "relationship_moment", "entities": ["Entity A", "Entity B"], "interaction": "What happened between them"}

8. BEHAVIORAL_OBSERVATION
   - Mannerisms, quirks, patterns
   - Voice/speech patterns
   - Body language
   Format: {"type": "behavioral_observation", "entity": "Who", "behavior": "What was observed"}

9. REVEAL
   - Information disclosed
   - Secrets shared
   - Facts stated
   Format: {"type": "reveal", "content": "What was revealed"}

10. GOAL_OR_HOOK
    - Stated intentions
    - Promises made
    - Threats issued
    - Timers/deadlines mentioned
    Format: {"type": "goal_or_hook", "description": "Goal/promise/threat/timer"}


EXTRACTION GUIDELINES:
- Extract EVERY instance, even if repetitive
- Keep chronological order
- Use exact names/terms from transcript
- Dialogue must be verbatim, never paraphrased
- Description should be brief but complete
- If something appears in multiple messages, extract multiple items
- No assumptions about what matters - extract it all
- No merging or combining - keep items atomic
- No interpretation - just what is directly observable


OUTPUT REQUIREMENTS:
- Must be valid JSON
- No preamble, headings, or code fences
- Output starts with "{" and ends with "}"
- All strings properly escaped
- Message numbers must be integers
- chronological_items array ordered by message number


REMINDER: This is pure extraction. You are NOT deciding what is important, what is new, what is duplicate, or where things should go. You are simply extracting everything observable from the transcript in chronological order. Comprehensive, exhaustive extraction with no filtering.`;

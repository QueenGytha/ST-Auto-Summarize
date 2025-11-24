export const scene_recap_stage1_extraction_prompt = `ROLE: Exhaustively extract all explicit content from the roleplay transcript. No roleplay. No explanations. No extrapolation, guessing, or inferrence. No outside canon; if it's not explicit in the messages, it did not happen.
Output JSON only (starts { ends }). Analyze only; never continue the story.

Purpose: produce a complete, ordered record of everything shown or said that may be useful for reproducing the roleplay continuity/world/setting/tone etc once the messages themselves are removed from LLM context. (including tone, stance, voice, mannerisms, brief context) without judging importance, novelty, or category.

---------------- ROLEPLAY TRANSCRIPT (extract everything exactly as shown) ----------------
<ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>
{{scene_messages}}
</ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>

GROUND RULES:
- Extraction-only: zero filtering, zero deduplication. If it appears and may be relevant to the plot, character arcs or nuance etc, you extract it.
- Only what is explicitly stated or directly shown; no speculation or inference. No outside canon.
- Keep transcript order; items appear in chronological sequence.
- Use exact names/terms from the transcript; do not rename or alias.
- Dialogue must be verbatim; include speaker and target if given; never invent wording.
- Brevity/Token discipline: fragments only (no full sentences); one clause; <=10 words per field; no adjectives/adverbs unless explicitly stated and necessary to the fact; no metaphors, no scene-painting, no intensifiers.
- High-signal facts only: drop narrative glue (e.g., "moment stretched", "everything else fell away"), drop subjective judgments (e.g., "revealing how close to collapse"), drop emotional color unless explicitly stated as dialogue or fact.
- Keep fragments concise but complete enough for downstream reuse; no caps or truncation; reuse identical wording for repeated beats to avoid variance.

OUTPUT FORMAT (keys exact):
{
  "chronological_items": [
    // Ordered chronologically; repeats allowed
  ]
}

ITEM TYPES (emit all that apply; duplicates allowed):
1) EVENT
   - Action/occurrence/transition (who did what, to whom/what, result if stated)
   - Format: {"type": "event", "description": "Brief what happened"}

2) STATE_CHANGE
   - Condition/status/location change
   - Format: {"type": "state_change", "entity": "Who/what", "change": "What changed"}

3) ENTITY_MENTION
   - Any character/location/object/concept with observed details (appearance, state, capabilities, identifiers)
   - Format: {"type": "entity_mention", "name": "Entity Name", "details": "All observed details"}

4) RELATIONSHIP_MOMENT
   - Interactions showing stance/attitude/alliances/conflicts/debts/promises/boundaries
   - Format: {"type": "relationship_moment", "entities": ["Entity A", "Entity B"], "interaction": "What happened between them"}

5) BEHAVIORAL_OBSERVATION
   - Voice/mannerisms/quirks/cadence/body-language/tells
   - Format: {"type": "behavioral_observation", "entity": "Who", "behavior": "What was observed"}

6) QUOTE
   - Verbatim dialogue with speaker (and target if stated). Context only if required to disambiguate speaker/target/location.
   - No mood adjectives; no paraphrase; do not add narrative framing.
   - Format: {"type": "quote", "speaker": "Character Name", "text": "Exact words spoken"}

7) TONE_SHIFT
   - Changes in atmosphere/genre/POV/tense/format/pacing/narration texture/dialogue format
   - Format: {"type": "tone_shift", "description": "What changed in tone/format/style"}

8) SETTING_DETAIL
   - Location/time/mood/ambient cues
   - Format: {"type": "setting_detail", "aspect": "location|time|mood", "value": "Observed detail"}

9) REVEAL
   - Information/secret/fact disclosed
   - Format: {"type": "reveal", "content": "What was revealed"}

10) GOAL_OR_HOOK
    - Stated intention/promise/threat/timer/deadline/task/quest
    - Format: {"type": "goal_or_hook", "description": "Goal/promise/threat/timer"}

EXTRACTION RULES:
- Keep items atomic; do not merge or reinterpret; one fact per item.
- Descriptions are terse fragments; include only concrete specifics; never add embellishing language.
- If a detail repeats later, you may repeat the item but keep wording identical and minimal.
- No preamble, headings, or code fences; output must start with "{" and end with "}".
- Never include meta statements about choosing, bonding, or feelings unless verbatim dialogue.
- Disallow generalized truths not stated in the scene (e.g., “many headmen have military backgrounds”).`;

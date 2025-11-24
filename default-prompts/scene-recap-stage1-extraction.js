export const scene_recap_stage1_extraction_prompt = `ROLE: Extract only explicit facts from the transcript. No roleplay. No explanations. No inference/guessing. If it's not in the text, it did not happen.
Output = JSON array of strings (starts [ ends ]). Each item is a terse fragment. Analyze only; never continue the story.
Purpose: capture only facts needed to rebuild continuity: plot beats, goals/hooks, reveals, state changes, scene-level tone shifts, character stance/voice/mannerisms. Omit trivial prose.

---------------- ROLEPLAY TRANSCRIPT (verbatim extraction) ----------------
<ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>
{{scene_messages}}
</ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>

RULES:
- Exact text only; no outside canon; keep order.
- Use names as written; no aliases.
- Quotes verbatim; include speaker if stated; otherwise just the text.
- Fragments only; one clause; <=10 words; no adjectives/adverbs unless explicit; no metaphors/scene-painting/intensifiers.
- High-signal facts only: keep plot actions/decisions, goals/hooks, reveals, state/location/condition changes, tone shifts, character stance/voice/mannerisms/quotes. Drop ambient fluff, scenery color, generic reactions unless they change state/stance.
- Dedup: drop obvious repeats/near-duplicates; keep the first, shortest phrasing that preserves the fact.
- One fact per string; do not merge multiple facts.
- If uncertain, omit.
- No preamble, headings, or code fences; output must start with "[" and end with "]".`;

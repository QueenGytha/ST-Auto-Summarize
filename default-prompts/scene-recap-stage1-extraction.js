export const scene_recap_stage1_extraction_prompt = `ROLE: Extract only explicit facts from the transcript. No roleplay. No explanations. No inference/guessing. If it's not in the text, it did not happen.
Output = JSON array of strings (starts [ ends ]). Each item is a terse fragment. Order does not matter - merge similar items even if it changes sequence. Analyze only; never continue the story.
Purpose: capture only facts needed to rebuild continuity: plot beats, goals/hooks, reveals, state/location/condition changes, scene-level tone shifts, character stance/voice/mannerisms that affect interaction, and distinctive appearance identifiers. Omit everything else.

---------------- ROLEPLAY TRANSCRIPT (verbatim extraction) ----------------
<ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>
{{scene_messages}}
</ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>

RULES (hard whitelist + brevity + consolidate):
- Exact text only; no outside canon; order optional (prioritize consolidation over sequence).
- Use names as written; no aliases.
- Quotes verbatim ONLY if they convey a decision/goal/reveal/stance/claim; include speaker if stated; otherwise just the text. Drop flavor chatter.
- Fragments only; one clause; <=8 words; no adjectives/adverbs unless explicit; no metaphors/scene-painting/intensifiers.
- Allowed content ONLY if consequential for continuity: plot actions/decisions; goals/hooks/timers; reveals; state/location/condition changes; scene-level tone/format shifts; explicit character stance/relationship boundary; explicit voice/mannerism; distinctive appearance identifiers (only if referenced and identifying). Ban scenery color, ambient fluff, generic movement/posture, generic emotion/pacing, "connection strength," and anything not likely to matter for continuity.
- Dedup by meaning (orderless): merge repeats/near-dupes into the shortest phrasing; drop extras; do not emit micro-actions that do not change state/stance/goal/reveal/appearance/voice. Keep all distinct facts that meet the allowed-content rules; discard distinct but non-consequential fluff.
- Avoid repeats via dedup and consolidation; do not drop distinct allowed facts.
- Merge compatible details for the same entity/concept into a single fragment only when it does not lose any stated fact; otherwise keep separate fragments.
- One fact per string; do not merge multiple facts.
- If uncertain, omit.
- No preamble, headings, or code fences; output must start with "[" and end with "]".`;

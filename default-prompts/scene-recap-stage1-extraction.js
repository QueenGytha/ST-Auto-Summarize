export const scene_recap_stage1_extraction_prompt = `ROLE: Extract only explicit facts from the transcript. No roleplay. No explanations. No inference/guessing. If it's not in the text, it did not happen.
Output: JSON array of terse fragments (starts [ ends ]). Order is irrelevant; merge similar items. Analyze only; never continue the story.
Purpose: keep continuity facts only: plot actions/decisions, goals/hooks/timers, reveals, state/location/condition changes, scene-level tone/format shifts, explicit stance/boundary, explicit voice/mannerism, distinctive appearance identifiers, and verbatim document contents (titles/clauses) if present.

---------------- ROLEPLAY TRANSCRIPT ----------------
<ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>
{{scene_messages}}
</ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>

RULES:
- Verbatim only; no outside canon; names as written.
- Quotes: include only if they carry decision/goal/reveal/stance/claim OR they show unique voice/mannerism/style not already captured. Include speaker if stated. Quotes stay verbatim; no paraphrase. Drop flavor/banter.
- Non-quote fragments: one clause; concise; no added adjectives/adverbs unless explicit; no metaphors/scene-painting.
- Allowed content = Purpose list only. Drop scenery/ambient color, generic movement/posture/emotion/pacing, "connection strength," and anything not needed for continuity.
- Merge related details into a single fragment when they describe one fact (e.g., attack outcome + awakened gift; disguise + footprints). Keep separate only if facts differ.
- Dedup by meaning (orderless): merge repeats/near-dupes to the shortest exact phrasing; keep distinct allowed facts; merge details only if nothing stated is lost.
- No micro-choreography: drop physical beats unless they change state/stance/goal/reveal or are a notable mannerism.
- One fact per string; do not combine unrelated facts.
- If uncertain, omit.
- Output only the JSON array; no preamble/headings/code fences.`;

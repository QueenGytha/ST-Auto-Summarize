export const scene_recap_stage1_extraction_prompt = `ROLE: Extract only explicit facts from the transcript. No roleplay. No explanations. No inference/guessing. If it's not in the text, it did not happen.
Output: JSON array of fragments (starts [ ends ]). Order is irrelevant; merge exact/near-duplicate items. Analyze only; never continue the story.
Purpose: preserve everything needed to continue the roleplay after messages are removed: plot beats/causality, goals/hooks/timers, reveals, state/location/condition changes, scene-level tone/format cues, relationship dynamics/stance/boundaries, character voice/mannerisms/style (via quotes or narration), distinctive appearance identifiers, and verbatim document contents (titles/clauses).

---------------- ROLEPLAY TRANSCRIPT ----------------
<ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>
{{scene_messages}}
</ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>

RULES:
- Verbatim only; no outside canon; names as written. Keep author wording for nuance; do not paraphrase or invent.
- Quotes: include if they show decision/goal/reveal/stance/claim OR unique voice/mannerism/style. Include speaker if stated. Quotes stay verbatim. Drop filler/banter that adds no stance/goal/reveal/voice.
- Non-quote fragments: concise but complete; include who/what/why/outcome when needed for continuity. Avoid adding adjectives/adverbs not in text.
- Allowed content = Purpose list only. Drop scenery/ambient color, generic movement/posture/emotion/pacing, “connection strength,” and anything not relevant to plot/tone/relationships/voice.
- Merge only exact/near-duplicate phrasings of the same fact; keep distinct beats separate. Merge closely related details into one fragment only when they describe a single fact without losing stated nuance.
- No micro-choreography unless it changes state/stance/goal/reveal or is a notable mannerism/voice cue.
- One fact per string; do not combine unrelated facts.
- If uncertain, omit.
- Output only the JSON array; no preamble/headings/code fences.`;

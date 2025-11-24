export const scene_recap_stage1_extraction_prompt = `ROLE: Extract only explicit facts from the transcript. No roleplay. No explanations. No inference/guessing. If it's not in the text, it did not happen.
Output: JSON object with category arrays (starts { ends }). Order inside arrays is irrelevant; merge exact/near-duplicate items. Analyze only; never continue the story.
Purpose: preserve everything needed to continue the roleplay after messages are removed: plot/causality, goals/hooks/timers, reveals, state/location/condition changes, scene-level tone/format cues, relationship dynamics/stance/boundaries, character voice/mannerisms/style (quotes or narration), distinctive appearance identifiers, verbatim document contents (titles/clauses).

OUTPUT FORMAT (keys exact):
{
  "plot": [],
  "goals": [],
  "reveals": [],
  "state": [],
  "tone": [],
  "stance": [],
  "voice": [],
  "appearance": [],
  "docs": []
}

---------------- ROLEPLAY TRANSCRIPT ----------------
<ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>
{{scene_messages}}
</ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>

RULES:
- Verbatim only; no outside canon; names as written. Keep author wording for nuance; do not paraphrase or invent.
- Quotes go in "voice" when they show decision/goal/reveal/stance/claim OR unique voice/mannerism/style not already captured. Include speaker if stated. Drop filler/banter.
- Non-quote fragments: concise but complete; include who/what/why/outcome when needed for continuity. Use literal wording; avoid adding adjectives/adverbs not in text; avoid metaphors/scene-painting.
- Allowed content = Purpose list only. Drop scenery/ambient color, generic movement/posture/emotion/pacing, "connection strength," and anything not relevant to plot/tone/relationships/voice.
- Merge closely related details into one entry when they describe one fact (e.g., attack outcome + awakened gift; disguise + footprints + misdirect; bond + Senta telling power source). Keep separate only if facts differ.
- Dedup by meaning: merge exact/near-duplicate phrasings to the shortest verbatim phrasing; keep distinct allowed facts; merge only if nothing stated is lost.
- No micro-choreography unless it changes state/stance/goal/reveal or is a notable mannerism/voice cue.
- One fact per entry; do not combine unrelated facts. Place each fact in the most fitting category (plot/goals/reveals/state/tone/stance/voice/appearance/docs).
- If uncertain, omit.
- Output only the JSON object; no preamble/headings/code fences.`;

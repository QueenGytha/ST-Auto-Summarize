export const scene_recap_stage1_extraction_prompt = `ROLE: Extract only explicit facts from the transcript. No roleplay. No explanations. No inference/guessing. If it's not in the text, it did not happen.
Output: JSON object with category arrays (starts { ends }) exactly as below. Order inside arrays is irrelevant; merge exact/near-duplicate items. Analyze only; never continue the story. Any other output shape is invalid.
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
- Verbatim only; no outside canon; names as written. Keep author wording; do not paraphrase or invent. Drop metaphors/emotive padding/bond-poetry.
- Quotes in "voice" only if they show decision/goal/reveal/stance/claim OR unique voice/mannerism/style/relationship nuance not already captured. Include speaker if stated. Keep one quote per distinct stance/voice; drop filler/banter/insults if they add nothing.
- Non-quote fragments: concise but complete; include who/what/why/outcome when needed. Literal wording only; avoid added adjectives/adverbs; no scene-painting.
- Allowed content = Purpose list only. Drop scenery/ambient color, generic movement/posture/emotion/pacing, "connection strength," capability boilerplate unless new and consequential (and not already in lore), and anything not relevant to plot/tone/relationships/voice.
- Ignore any transcript-side meta/notes/formatting scaffolding (bracketed directives, stage directions, placeholders); do not treat them as content.
- Drop micro-actions/handling/approach/look/turn/step/travel beats unless they change state/goal/reveal or are a notable voice cue.
- Appearance: one concise identifier per entity (name + key traits) only once across the whole output; skip repeats.
- Merge when details are part of the same fact and fit in one fragment with who/what/why/outcome intact. Do NOT drop nuance; keep separate entries when combining would lose context or meaning. Drop repeated stance/banter unless it adds new voice/relationship nuance.
- Dedup by meaning: merge exact/near-duplicate phrasings to the shortest verbatim phrasing; keep distinct allowed facts; merge only if nothing stated is lost.
- No micro-choreography or travel/handling beats unless they change state/stance/goal/reveal or are a notable mannerism/voice cue.
- If a fact (goal/stance/reveal/condition/voice) is already captured anywhere in the output, skip later restatements; keep the shortest verbatim phrasing only once.
- One fact per entry; do not combine unrelated facts. Place each fact in the most fitting category (plot/goals/reveals/state/tone/stance/voice/appearance/docs).
- If uncertain, omit.
- Output only the JSON object; no preamble/headings/code fences.`;

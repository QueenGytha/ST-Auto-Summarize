export const scene_recap_stage1_extraction_prompt = `ROLE: Extract ONLY stated facts. No roleplay. No explanations. No inference/guessing. If it's not explicitly in the text, omit it.
Output: JSON object with category arrays (starts { ends }) exactly as below. Order inside arrays is irrelevant; merge exact/near-duplicate items. Any other output shape is invalid.
Purpose: keep only what is required to continue after messages are removed: plot/causality, goals/hooks/timers/promises/contingencies, reveals, state/location/condition changes, relationship dynamics/stance/boundaries/obligations, character voice/mannerisms/style (quotes or narration) tied to stance/intent/decision, ONE appearance identifier per entity, verbatim document contents (titles/clauses). Do NOT capture ambient/tone/mood.

OUTPUT FORMAT (keys exact):
{
  "plot": [],
  "goals": [],
  "reveals": [],
  "state": [],
  "stance": [],
  "voice": [],
  "appearance": [],
  "docs": []
}

---------------- ROLEPLAY TRANSCRIPT ----------------
<ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>
{{scene_messages}}
</ROLEPLAY_TRANSCRIPT_FOR_EXTRACTION>

RULES (HARD WHITELIST):
- Verbatim only; names as written; no paraphrase or invention.
- Allowed content ONLY:
  * plot/causality/reveals (who/what/why/outcome);
  * goals/hooks/timers/promises/contracts/contingencies (who/what + condition);
  * state/location/condition changes;
  * relationship dynamics/stance/boundaries/obligations/debts/alliances;
  * character voice/mannerisms/style/quotes that show stance/intent/decision OR distinct diction/cadence; max one quote per unique stance/voice;
  * ONE appearance identifier per entity (name + key trait/role) across the entire output;
  * verbatim document contents (titles/clauses).
- DROP EVERYTHING ELSE: ambient/scenery/tone/mood; travel/movement/approach/handling/“looks”/gaze/pauses/turns/steps; physical micro-actions; meta/stage directions/placeholders/formatting notes; capability boilerplate (distances, speeds, endurance, “can travel…”); generic emotions/posture; mindvoice descriptors; repeated stance/voice; repeated appearance.
- If a fact/quote is already captured, skip later restatements; keep the shortest verbatim phrasing once.
- Non-quote fragments must be concise but complete (who/what/why/outcome when needed). One fact per entry; do not combine unrelated facts.
- Put each fact in the single best category (plot/goals/reveals/state/stance/voice/appearance/docs).
- If uncertain, omit.
- Output only the JSON object; no preamble/headings/code fences.`;

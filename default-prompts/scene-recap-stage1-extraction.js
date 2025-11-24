export const scene_recap_stage1_extraction_prompt = `ROLE: Extract ONLY stated facts. No roleplay. No explanations. No inference/guessing. If it's not explicit, omit it.
Output: JSON object with the exact keys below. Order inside arrays is irrelevant. Any other shape is invalid.
Purpose: preserve only what is needed to continue after messages are removed: plot/causality, goals/hooks/timers/promises/contingencies, reveals, state/location/condition changes, relationship dynamics/stance/boundaries/obligations, character voice/mannerisms/style (quotes or narration) that show stance/intent/decision OR distinct diction/cadence, ONE appearance identifier per entity, verbatim document contents (titles/clauses). Tone/ambience is NOT captured.

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

RULES (BARE WHITELIST):
- Verbatim only; names as written; no paraphrase or invention.
- Keep ONLY:
  * plot/causality/reveals (who/what/why/outcome);
  * goals/hooks/timers/promises/contracts/contingencies (who/what + condition);
  * state/location/condition changes;
  * relationship dynamics/stance/boundaries/obligations/debts/alliances;
  * character voice/mannerisms/style/quotes that show stance/intent/decision OR distinct diction/cadence; max one quote per unique stance/voice;
  * ONE appearance identifier per entity (name + key trait/role) across the entire output;
  * verbatim document contents (titles/clauses).
- DROP EVERYTHING ELSE: ambient/scenery/tone/mood; travel/route/pace/handling/approach/inspection steps; physical micro-actions; meta/stage directions/placeholders/formatting notes; capability boilerplate (distances, speeds, endurance, “can travel…”); generic emotions/posture; mindvoice descriptors; repeated stance/voice; repeated appearance.
- Travel: keep ONLY once as a goal/plan/contingency if it matters (e.g., “to Haven to report/train”); drop all other travel/route/pace/handling beats from plot/state.
- Evidence/inspection/handling: keep only if it introduces a new fact/reveal; otherwise drop the handling steps.
- No duplicates across categories: each fact appears once, in the single best category; drop restatements elsewhere.
- If a fact/quote is already captured, skip later restatements; keep the shortest verbatim phrasing once.
- Non-quote fragments must be concise but complete (who/what/why/outcome when needed). One fact per entry; do not combine unrelated facts.
- If uncertain, omit.
- Output only the JSON object; no preamble/headings/code fences.`;

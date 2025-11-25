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

---------------- RULES ----------------
RULES (BARE WHITELIST):
- Verbatim only; names as written; no paraphrase or invention.
- Keep ONLY:
  * plot/causality/reveals (who/what/why/outcome);
  * goals/hooks/timers/promises/contracts/contingencies (who/what + condition);
  * state/location/condition changes that persist beyond the moment (omit fleeting positions/approach/mount/travel progress);
  * relationship dynamics/stance/boundaries/obligations/debts/alliances—capture NET STANCE per counterpart, not interaction-by-interaction history. Multiple exchanges showing the same relational stance (protective, hostile, trusting) are redundant; collapse to single summary;
  * character voice/mannerisms/style/quotes that show stance/intent/decision OR distinct diction/cadence (for setting_lore use). SAME-INTENT = DUPLICATE: quotes expressing the same emotional stance toward the same target are duplicates regardless of wording—keep only the shortest. One quote per distinct intent, not per distinct phrasing;
  * ONE appearance identifier per entity (name + key trait/role) across the entire output;
  * verbatim document contents (titles/clauses).
- DROP EVERYTHING ELSE: ambient/scenery/tone/mood; travel/route/pace/handling/approach/inspection steps; physical micro-actions; meta/stage directions/placeholders/formatting notes; capability boilerplate (distances, speeds, endurance, “can travel…”); generic emotions/posture; mindvoice descriptors; repeated stance/voice; repeated appearance; intimate/sexual/biological detail (explicit acts, body fluids) unless literally plot-critical.
- Travel: keep ONLY once as a goal/plan/contingency if it matters (e.g., "travel to capital to report"); drop all other travel/route/pace/handling beats from plot/state.
- Evidence/inspection/handling: keep only if it introduces a new fact/reveal; otherwise drop the handling steps.
- NO DUPLICATES: each fact appears ONCE in the single best-fit category. If captured, skip all restatements; keep shortest phrasing. One fact per entry.
- Non-quote fragments: concise but complete (who/what/why/outcome when needed).
- If uncertain, omit.
- Output only the JSON object; no preamble/headings/code fences.`;

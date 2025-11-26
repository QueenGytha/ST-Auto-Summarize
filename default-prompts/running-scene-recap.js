// MACROS: {{current_running_recap}}, {{scene_recaps}}

export const running_scene_recap_prompt = `ROLE: Merge scene recap into running recap. CURRENT is baseline. Output plot/goals only.

DEDUPLICATION (enforce before output):
- DEV: OUTCOMES only. Steps/process toward outcome → DROP, keep only result.
- PEND: SUPERSEDE old goals. If NEW has goals for an actor → REPLACE that actor's old goals, don't accumulate.
- DUPLICATES: If CURRENT already states this → DROP from NEW.

OUTPUT:
{"recap":"DEV: ...\\nPEND: ..."}

- DEV: outcomes; state changes; reveals. No quotes.
- PEND: active goals (who/what/condition). No completed goals.
- Omit empty sections.

STYLE: Fragments; semicolons; no articles/filler.

---------------- CURRENT_RUNNING_RECAP ----------------
<CURRENT_RUNNING_RECAP>
{{current_running_recap}}
</CURRENT_RUNNING_RECAP>

---------------- NEW_SCENE_RECAP ----------------
<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

---------------- MERGE LOGIC ----------------

OUTCOME vs STEP:
Ask: "If I delete this and keep only what follows, do I lose important information?"
YES → outcome (keep). NO → step (DROP or merge into outcome).

Before: "traveled to city; found contact; negotiated; got information"
After: "obtained information from contact"

Before: "argued; fought; separated; reconciled"
After: "reconciled after conflict"

PEND SUPERSESSION:
Old goals for an actor are either achieved (move to DEV) or abandoned.
When NEW has goals for actor X → REPLACE X's old goals, don't add to them.

Before CURRENT: "A: find B; C: protect A"
NEW: "A: interrogate B; C: gather supplies"
After: "A: interrogate B; C: gather supplies" (superseded, not accumulated)

Output JSON only.`;

// MACROS: {{current_running_recap}}, {{scene_recaps}}

export const running_scene_recap_prompt = `ROLE: Merge into running recap. RECONSTRUCTION SIGNAL; minimum anchors for plot/goal continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A agreed to help B investigate the threat after arriving"
Fragment: "A+B arrived; agreed investigate threat"

OUTPUT:
{"recap":"DEV: ...\\nPEND: ..."}
- DEV: outcomes; state changes; reveals
- PEND: active goals (who/what/condition)
- Omit empty sections. No quotes.

MERGE:
- Start from CURRENT; add new from NEW
- Restates existing = keep existing
- Drop resolved goals

WHAT BELONGS:
DEV: outcomes; decisions; reveals
NOT DEV: stance; feelings; nuance (→ setting_lore)
PEND: active goals; unresolved hooks
NOT PEND: completed; routine tasks

---------------- CURRENT ----------------
<CURRENT_RUNNING_RECAP>
{{current_running_recap}}
</CURRENT_RUNNING_RECAP>

---------------- NEW ----------------
<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

---------------- COMPRESS BEFORE OUTPUT ----------------

SUPERSESSION:
Outcome known = drop process.
Before: "X attacked; A defended; overwhelmed; ability triggered; destruction"
After: "X destroyed via A's triggered ability"

BACKSTORY COLLAPSE:
Before: "traveled; rested; argued; arrived; met contact; received task"
After: "arrived; received task"

RESOLVED REMOVAL:
Before PEND: "reach destination; meet contact; get task; complete objective"
After (arrived): "complete objective"

CHECKLIST:
□ Fragments?
□ Backstory collapsed?
□ Process removed where outcome known?
□ Resolved goals removed?
□ No stance/feelings?

Output JSON only.`;

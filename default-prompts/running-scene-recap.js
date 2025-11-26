// MACROS: {{current_running_recap}}, {{scene_recaps}}

export const running_scene_recap_prompt = `ROLE: Merge NEW_SCENE_RECAP into CURRENT_RUNNING_RECAP. CURRENT is baseline.

============ FILTERING (DO THIS FIRST) ============

For EACH item in NEW_SCENE_RECAP, ask: "Does this earn its tokens given what CURRENT_RUNNING_RECAP already has?"

DEV (outcomes):
- Earns inclusion: outcome that changes story state, not already in CURRENT_RUNNING_RECAP
- Drop: steps/process toward outcome (keep only result), already stated in CURRENT_RUNNING_RECAP

PEND (goals):
- SUPERSEDE, don't accumulate. When NEW_SCENE_RECAP has goals for actor X → REPLACE X's old goals entirely.
- Achieved goals → move to DEV. Abandoned goals → drop.

OUTCOME vs STEP test:
"If I delete this and keep only what follows, do I lose important information?"
YES → outcome (keep). NO → step (drop or merge into outcome).

Before: "traveled to city; found contact; negotiated; got information"
After: "obtained information from contact"

==========================================================================

OUTPUT:
{"recap":"DEV: ...\\nPEND: ..."}

- DEV: outcomes; state changes. No quotes. No world lore (belongs in lorebook entries).
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

Output JSON only.`;

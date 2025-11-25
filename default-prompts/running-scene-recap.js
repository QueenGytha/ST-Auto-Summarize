// MACROS: {{current_running_recap}}, {{scene_recaps}}

export const running_scene_recap_prompt = `ROLE: Merge into running recap. RECONSTRUCTION SIGNAL; minimum anchors for plot/goal continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

OUTPUT:
{"recap":"DEV: ...\\nPEND: ..."}
- DEV: outcomes; state changes; reveals
- PEND: active goals (who/what/condition)
- Omit empty sections. No quotes.

---------------- CURRENT_RUNNING_RECAP ----------------
<CURRENT_RUNNING_RECAP>
{{current_running_recap}}
</CURRENT_RUNNING_RECAP>

---------------- NEW_SCENE_RECAP ----------------
<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

---------------- PRINCIPLES ----------------

OUTCOME vs STEP (critical distinction):
- OUTCOME = a state that persists and matters for future scenes (what CHANGED)
- STEP = action taken to reach an outcome (HOW it happened)

Test: "If I delete this and keep only what follows, do I lose important information?"
YES → outcome. NO → step (merge into outcome or drop).

"traveled four days; reached Haven; guards alerted; Healers took patient to Collegium; patient now under care"
All steps except the last. Outcome: "patient delivered to Collegium for treatment"

"confronted B; demanded answers; B refused; threatened B; B confessed"
All steps. Outcome: "extracted confession from B"

WHAT BELONGS IN DEV:
- State changes that persist (bonded, allied, wounded, dead, revealed, decided)
- NOT: how someone got somewhere, who handed off to whom, arrivals, departures, greetings

PEND SUPERSESSION (critical):
- If NEW_SCENE_RECAP has goals for an actor → they REPLACE that actor's old goals
- Old goals are either achieved (in DEV) or abandoned (circumstances changed)
- Don't accumulate goals across scenes for the same actor

CURRENT has: "A: reach Haven; B: protect A"
NEW has: "A: inform council; B: guard A during recovery"
Result: "A: inform council; B: guard A during recovery" (old goals superseded, not added)

MERGE:
- CURRENT_RUNNING_RECAP is baseline
- NEW_SCENE_RECAP items: add if not covered, replace if supersedes
- Collapse sequences into final outcomes

---------------- COMPRESS ----------------

DEV: Keep only outcomes. Merge steps into the result they lead to.
PEND: Current goals only. Drop achieved/obsolete. Replace per actor, don't accumulate.

CHECKLIST:
□ DEV = outcomes (what changed), not process (how it happened)?
□ PEND = current goals only (superseded old goals for same actors)?
□ No arrivals/departures/handoffs kept as separate items?
□ Fragments; no quotes?

Output JSON only.`;

// MACROS: {{current_running_recap}}, {{scene_recaps}}

export const running_scene_recap_prompt = `ROLE: Narrative curator. Maintain the authoritative record of what happened.

CONTEXT: This is for AI roleplay. This recap is injected into the LLM's context so it knows what happened before the current scene. The LLM uses this to:
- Continue the story consistently with past events
- Pick up unresolved plot threads

Every token competes with the current scene for context space. Keep the recap tight - high-level outcomes, not blow-by-blow. The LLM needs to know WHAT happened and WHAT'S UNRESOLVED, not every step of how things happened.

TASK: Merge NEW_SCENE_RECAP into CURRENT_RUNNING_RECAP. CURRENT_RUNNING_RECAP is baseline.

============ DEV (outcomes) ============

- ADD: outcomes that change story state, not already in CURRENT_RUNNING_RECAP
- DROP: steps/process (keep only results), duplicates

OUTCOME vs STEP test:
"If I delete this and keep only what follows, do I lose information?"
YES → outcome. NO → step (drop).

Before: "traveled to city; found contact; negotiated; got information"
After: "obtained information from contact"

============ PEND (plot threads) ============

SUPERSESSION RULE:
- When NEW_SCENE_RECAP resolves a thread → move outcome to DEV, remove from PEND
- When NEW_SCENE_RECAP adds new thread → add to PEND
- Abandoned threads → drop entirely

These are PLOT THREADS (narrative hooks), not character goals.
Character goals belong in quest entries, not PEND.

HOOK TEST: "Can the LLM use this to create drama/conflict/tension?"
- YES = threat, secret, promise, mystery, vulnerability, ticking clock
- NO = scheduling, logistics, implementation details, upcoming meetings

==========================================================================

OUTPUT:
{"recap":"DEV: ...\\nPEND: ..."}

STYLE: Fragments; semicolons; no articles/filler. TELEGRAPHIC.

Omit empty sections.

---------------- CURRENT_RUNNING_RECAP ----------------
<CURRENT_RUNNING_RECAP>
{{current_running_recap}}
</CURRENT_RUNNING_RECAP>

---------------- NEW_SCENE_RECAP ----------------
<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

Output JSON only.`;

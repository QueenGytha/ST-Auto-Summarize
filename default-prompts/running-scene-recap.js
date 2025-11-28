// MACROS: {{current_running_recap}}, {{scene_recaps}}

export const running_scene_recap_prompt = `ROLE: Narrative curator. Maintain the authoritative record of what happened.

CONTEXT: This is for AI roleplay. This recap is injected into the LLM's context so it knows what happened before the current scene. The LLM uses this to:
- Continue the story consistently with past events
- Pick up unresolved plot threads

Every token competes with the current scene for context space. Keep the recap tight - high-level outcomes, not blow-by-blow.

TASK: Merge NEW_SCENE_RECAP into CURRENT_RUNNING_RECAP. CURRENT_RUNNING_RECAP is baseline.

================================================================================
DEV (active outcomes)
================================================================================

Outcomes still relevant to current story state.

ADD: outcomes that change story state, not already in CURRENT_RUNNING_RECAP
DROP: steps/process (keep only results), duplicates

OUTCOME vs STEP test:
"If I delete this and keep only what follows, do I lose information?"
YES → outcome. NO → step (drop).

================================================================================
PEND (plot threads)
================================================================================

Unresolved hooks with dramatic tension.

SUPERSESSION:
- Thread resolved → remove from PEND (see RESOLVED EVENTS below)
- New thread → add to PEND
- Abandoned thread → drop entirely

HOOK TEST: "Can the LLM use this for drama/tension?"
YES = threat, secret, promise, mystery, vulnerability, ticking clock
NO = scheduling, logistics, implementation details → drop

================================================================================
RESOLVED EVENTS (entities)
================================================================================

When an outcome is fully resolved but might be referenced/called back later:
→ Create an EVENT entity (keyword-triggered, not always in context)
→ Remove from DEV (no longer active)

DROP if resolved AND unlikely to ever be referenced.

EVENT entities: minimal detail, just enough to recognize if mentioned.
Keywords should be names/terms that would trigger the callback.

================================================================================
OUTPUT
================================================================================

{
  "recap": "DEV: ...\\nPEND: ...",
  "entities": [{"t": "event", "n": "Name", "c": "minimal description", "k": ["keywords"]}]
}

STYLE: Fragments; semicolons; no articles/filler. TELEGRAPHIC.

Omit empty sections. Omit entities array if no resolved events.

---------------- CURRENT_RUNNING_RECAP ----------------
<CURRENT_RUNNING_RECAP>
{{current_running_recap}}
</CURRENT_RUNNING_RECAP>

---------------- NEW_SCENE_RECAP ----------------
<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

Output JSON only.`;

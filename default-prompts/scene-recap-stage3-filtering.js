// Stage 3: Filter recap (rc) against running recap
// MACROS: {{extracted_rc}}, {{current_running_recap}}

export const scene_recap_stage3_filtering_prompt = `ROLE: Continuity editor. Protect the running recap from redundant additions.

CONTEXT: This is for AI roleplay. The running recap is injected into the LLM's context as the authoritative record of what happened. The LLM uses this to continue the story consistently with past events. Every token competes with the current scene for context space. Redundant additions bloat the recap without adding value.

TASK: Filter INPUT_RC against RUNNING_RECAP. Output only NEW information.

============ DEV (outcomes) ============

- DROP if RUNNING_RECAP already captures this outcome (same meaning = duplicate)
- KEEP only outcomes that change story state beyond what's already recorded

============ PEND (threads) ============

- DROP if thread already tracked in RUNNING_RECAP
- DROP if thread was RESOLVED (now appears as outcome in DEV)
- KEEP genuinely new plot hooks

============ KNOWS (information asymmetry) ============

Compare each secret carefully:

1. Same secret, SAME knowers → DROP (no new information)
2. Same secret, NEW knowers → KEEP with updated list (merge will update)
3. Entirely new secret → KEEP

IMPORTANT distinctions:
- "Witnessed event" ≠ "knows content" (being present ≠ knowing details shared)
- Only list names who know the SPECIFIC secret, not everyone present

============ OUTPUT ============

{"rc": "DEV: ...\\nPEND: ...\\nKNOWS: ..."}

Omit empty sections. If nothing new: {"rc": ""}

STYLE: Telegraphic. Fragments; semicolons; no articles.

---------------- INPUT_RC ----------------
<INPUT_RC>
{{extracted_rc}}
</INPUT_RC>

---------------- EXISTING RUNNING RECAP ----------------
<RUNNING_RECAP>
{{current_running_recap}}
</RUNNING_RECAP>

Output JSON only.`;

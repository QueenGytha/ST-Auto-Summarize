// Stage 4: Filter setting_lore (sl) entries against existing entries
// MACROS: {{extracted_sl}}, {{active_setting_lore}}

export const scene_recap_stage4_filter_sl_prompt = `ROLE: Lore keeper. Guard the setting bible from redundant or contradictory entries.

CONTEXT: This is for AI roleplay. Entity entries are injected into the LLM's context when that entity appears in the story. The LLM uses this to write entities consistently - their voice, relationships, development, current state. Every token competes with the current scene for context space. Redundant additions bloat entries without adding value.

TASK: Filter INPUT_SL against SETTING_LORE. Output only NEW information.

============ FILTERING RULES ============

For each entry in INPUT_SL:
1. Find matching entry in SETTING_LORE (by name)
2. If NO MATCH exists → KEEP entire entry (new entity, no filtering needed)
3. If match exists → compare each bullet against existing content
4. Apply rules by bullet type:

Arc (PROTECT - rarely filter):
- DROP if exact same journey point already captured
- KEEP if new landmark moment (even if entry exists)
- EMBEDDED QUOTES: Compare MEANING not format. "realized 'I was afraid'" and
  "understood her fear was controlling her" are the SAME point if same transformation.
  Keep whichever version captures it better.

Stance (HIGH VALUE):
- DROP if same target with same dynamic already captured
- KEEP if relationship evolved or new target
- EMBEDDED QUOTES: Compare MEANING not format. "swore 'I'll protect you'" and
  "committed to protecting her" are the SAME point if same commitment.
  Keep whichever version captures it better.

Voice (MEDIUM):
- DROP if quote shows same speech pattern as existing quote
- DROP if generic expression anyone might say (no distinctive DELIVERY pattern)
- KEEP if demonstrates DIFFERENT pattern (formal vs casual, etc.) with distinctive delivery

State (SUPERSEDES):
- DROP if same condition already captured
- KEEP if new condition (will replace old in merge)

Identity (CUT FIRST):
- DROP if info already established
- KEEP only if fundamentally new baseline fact

5. Remove entry entirely if ALL content filtered out

Keywords (k): Pass through unchanged from INPUT_SL.
Content (c): Preserve formatting from INPUT_SL.

============ UID MATCHING ============

UID field (u) - CRITICAL for correct downstream merging:
- LITERAL STRING MATCH ONLY on name attribute
- Copy uid from <setting_lore name="X" uid="Y"> where X is IDENTICAL to your n value
- Match specificity: individual→individual, sublocation→sublocation
- OMIT "u" entirely if no IDENTICAL name match exists
- Wrong UID = data corruption. When uncertain, OMIT.

============ OUTPUT ============

{"sl": [{"t": "type", "n": "Name", "c": "content", "k": ["keywords"], "u": "uid if exact match"}]}

If all entries filtered: {"sl": []}

---------------- INPUT_SL ----------------
<INPUT_SL>
{{extracted_sl}}
</INPUT_SL>

---------------- EXISTING SETTING LORE ----------------
<SETTING_LORE>
{{active_setting_lore}}
</SETTING_LORE>

Output JSON only.`;

// Stage 4: Filter entities against existing lorebook entries
// MACROS: {{extracted_sl}}, {{active_setting_lore}}

export const scene_recap_stage4_filter_sl_prompt = `ROLE: Lore keeper. Guard the setting bible from redundant entries.

CONTEXT: Entity entries are injected into LLM context when that entity appears in the story. Every token competes with current scene for context space. Redundant additions bloat entries without adding value.

TASK: Filter INPUT_ENTITIES against EXISTING_LORE. Output only NEW information.

================================================================================
FILTERING RULES
================================================================================

For each entry in INPUT_ENTITIES:
1. Find matching entry in EXISTING_LORE (by name)
2. If NO MATCH exists → KEEP entire entry (new entity)
3. If match exists → filter content against existing

FILTER CRITERIA:
- Same fact already captured → DROP
- Same relationship dynamic already captured → DROP
- Same state already captured → DROP
- Evolution/change from existing state → KEEP
- New relationship target → KEEP
- New facts not in existing → KEEP

Compare MEANING not wording. If same information exists in different words, DROP.

USER CHARACTER ({{user}}) - EXTRA AGGRESSIVE:
{{user}} entries should be MINIMAL or ABSENT. User plays their own character.
- KEEP ONLY: physical state, status/titles, explicit commitments
- DROP ALL relationship content toward other characters
- Relationships belong ONLY in the other character's STANCE-{{user}} section
- If {{user}} entity has ONLY relationship/development content → DROP entire entity
- When in doubt about {{user}} content → DROP it

Remove entry entirely if ALL content filtered out.

Keywords (k): Pass through unchanged.
Content (c): Preserve formatting.

================================================================================
UID MATCHING
================================================================================

UID field (uid) - CRITICAL for correct downstream merging:
- LITERAL STRING MATCH ONLY on name attribute
- Copy uid from <setting_lore name="X" uid="Y"> where X is IDENTICAL to your n value
- OMIT "uid" entirely if no IDENTICAL name match exists
- Wrong UID = data corruption. When uncertain, OMIT.

================================================================================
OUTPUT
================================================================================

{"entities": [{"t": "type", "n": "Name", "c": "content", "k": ["keywords"], "uid": "uid if exact match"}]}

If all entries filtered: {"entities": []}

---------------- INPUT_ENTITIES ----------------
<INPUT_ENTITIES>
{{extracted_sl}}
</INPUT_ENTITIES>

---------------- EXISTING_LORE ----------------
<EXISTING_LORE>
{{active_setting_lore}}
</EXISTING_LORE>

Output JSON only.`;

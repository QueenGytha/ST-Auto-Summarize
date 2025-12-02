// Stage 4: Filter entities against existing lorebook entries
// MACROS: {{extracted_sl}}, {{active_setting_lore}}, {{user}}

export const scene_recap_stage4_filter_sl_prompt = `TASK: Filter new entities against existing lorebook. Output only NEW information.

================================================================================
CONTEXT
================================================================================

Entity entries are injected into LLM context when keywords match. Every token competes with current scene. Redundant additions bloat entries without adding value.

================================================================================
INPUT
================================================================================

NEW ENTITIES (from Stage 2):
<NEW_ENTITIES>
{{extracted_sl}}
</NEW_ENTITIES>

EXISTING LOREBOOK:
<EXISTING>
{{active_setting_lore}}
</EXISTING>

User character: {{user}}

================================================================================
FILTERING RULES
================================================================================

For each entity in NEW_ENTITIES:
1. Find matching entry in EXISTING by name
2. NO MATCH → KEEP entire entity (new)
3. MATCH EXISTS → filter content items against existing

CONTENT FILTERING:
- Same fact already captured → DROP item
- Same relationship dynamic → DROP item
- Evolution/change from existing → KEEP item
- New relationship target → KEEP item
- New facts not in existing → KEEP item

Compare MEANING not wording. Same info in different words = duplicate.

VOLATILE STATE:
- DROP volatile items (current location, in-progress tasks, temporary conditions)
- These go in recap, not lorebook

USER CHARACTER ({{user}}):
- {{user}} entries should be MINIMAL or ABSENT
- KEEP ONLY: stable physical state, titles, explicit commitments
- DROP relationship content toward others (belongs in OTHER character's entry)
- If {{user}} entity has ONLY relationship content → DROP entire entity

Remove entity entirely if ALL content items filtered out.

================================================================================
UID MATCHING
================================================================================

If entity name EXACTLY matches an existing entry name:
- Copy the uid from existing entry
- OMIT uid if no exact name match
- Wrong UID = data corruption. When uncertain, OMIT.

================================================================================
OUTPUT FORMAT
================================================================================

{
  "entities": [
    {
      "type": "character",
      "name": "Name",
      "keywords": ["keywords"],
      "content": ["only new items not in existing"],
      "uid": "from existing if exact name match"
    }
  ]
}

If all entities filtered: {"entities": []}

Output JSON only.`;

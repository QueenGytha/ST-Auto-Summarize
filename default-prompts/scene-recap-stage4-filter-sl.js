// Stage 4: Filter entities against existing lorebook entries
// MACROS: {{extracted_sl}}, {{active_setting_lore}}, {{user}}

export const scene_recap_stage4_filter_sl_prompt = `TASK: Filter new entities against existing lorebook. Output only NEW information.

SOURCE TEXT ONLY: Work only with what's in the inputs. Do not add information from outside knowledge or infer beyond what's stated.

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

For EACH content item in EACH new entity, check against ALL existing entries:

CONTENT FILTERING (check against ALL existing, not just name-matched):
- Fact already captured in ANY existing entry → DROP item
- Relationship dynamic already in ANY existing entry → DROP item
- General worldbuilding covered by ANY existing lore → DROP item
- Evolution/change from existing → KEEP item
- New relationship target → KEEP item
- New facts not in ANY existing → KEEP item

Compare MEANING not wording. Same info in different words = duplicate.
Match concepts across entries even when names differ.

LORE ENTITIES - STRICT FILTERING:
- If a lore entity restates/elaborates worldbuilding already in existing lore → DROP entire entity
- Scene-specific incidents are NOT general lore (e.g., "X insulted Y" is incident, not world rule)
- Only create new lore entries for genuinely new world mechanics not covered anywhere

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

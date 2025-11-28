// Stage 2: Quality filter + keyword generation
// MACROS: {{extracted_data}}

export const scene_recap_stage2_organize_prompt = `TASK: Quality filter and add keywords to scene extraction.

================================================================================
INPUT
================================================================================

Stage 1 extracted:
- sn: scene name
- plot: DEV (outcomes) + PEND (unresolved hooks)
- entities: [{t: type, n: name, c: content}]

================================================================================
QUALITY FILTER
================================================================================

Strip anything that slipped through that shouldn't have:

PLOT:
- DEV should be outcomes only, not play-by-play
- PEND should be dramatic hooks, not logistics/scheduling
- Generic labels without specifics → cut

ENTITIES - Apply the CONTINUITY TEST:
Ask: "Would ignoring this cause contradictions in future scenes?"

CUT if NO:
- Transient conditions (fatigue, hunger, temporary mood) → cut
- Discomfort that naturally resolves → cut
- Recovery from transient conditions (also transient) → cut
- Duration/timing/journey details → cut (belongs in plot)
- Entity that didn't actually CHANGE → cut entirely
- Generic labels ("grew closer") without specifics → cut
- Content that's transcript not substance → cut

KEEP if YES:
- Permanent changes (injuries that affect capability, transformations)
- Status changes the world reacts to
- Relationship dynamics that affect how characters interact
- Commitments that could be called back

USER CHARACTER ({{user}}) - AGGRESSIVE FILTER:
If Stage 1 extracted a {{user}} entity, scrutinize heavily:
- KEEP ONLY: physical state, status/titles, explicit commitments
- CUT: relationships, development, personality, internal state, duration/timing
- If only filtered content remains → DELETE entire {{user}} entity

RELATIONSHIP CONTENT = ALWAYS CUT FROM {{user}}:
Any mention of {{user}}'s connection to another character must be removed.
The relationship belongs ONLY in the other character's STANCE-{{user}} section.

If uncertain about non-{{user}} entities, keep. Stage 1 already filtered heavily.

================================================================================
KEYWORDS
================================================================================

Add keywords (k) to each surviving entity.

INCLUDE:
- The name itself (always)
- Titles/epithets used for this entity
- Aliases/nicknames actually used in story
- For lore: topic terms that should trigger this entry

EXCLUDE:
- Incidental scene elements (a fireplace in the room ≠ keyword for character)
- Other characters' names ([NPC-A]'s entry doesn't get "[NPC-B]" as keyword)
- Generic words (magic, sword, horse) unless that's the entity's identity
- Plot events (battle, escape, kiss)

Conservative. 1-4 keywords typical. Name alone is often enough.

================================================================================
OUTPUT
================================================================================

{
  "sn": "scene name (pass through)",
  "plot": "filtered plot (pass through or trimmed)",
  "entities": [{"t": "type", "n": "Name", "c": "content", "k": ["keywords"]}]
}

Omit entities that were cut entirely. Pass through sn unchanged.

================================================================================
EXTRACTED DATA
================================================================================
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

Output JSON only.`;

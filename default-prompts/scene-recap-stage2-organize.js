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

ENTITIES:
- Entity that didn't actually CHANGE → cut entirely
- Generic labels ("grew closer") without specifics → cut
- Temporary states that won't persist → cut
- Content that's transcript not substance → cut

If uncertain, keep. Stage 1 already filtered heavily.

================================================================================
KEYWORDS
================================================================================

Add keywords (k) to each surviving entity.

INCLUDE:
- The name itself (always)
- Titles/epithets used for this entity ("Queen's Own", "Weaponsmaster")
- Aliases/nicknames actually used in story
- For lore: topic terms that should trigger this entry

EXCLUDE:
- Incidental scene elements (a fireplace in the room ≠ keyword for character)
- Other characters' names (Talia's entry doesn't get "Rance" as keyword)
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

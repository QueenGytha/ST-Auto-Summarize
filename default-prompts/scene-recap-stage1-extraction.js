export const scene_recap_stage1_extraction_prompt = `ROLE: Extract content from scene into facets for historical context.

QUALITY CRITERIA - apply to EVERY item:
- SIGNIFICANT: Would roleplay go wrong without this? If no, skip.
- PERSISTENT: Still relevant in 10 scenes? If no, skip.
- SPECIFIC: Generic labels are useless. Be specific or skip.
- EMPTY IS VALID: Don't extract just to fill categories.

ENTITY TYPES:
{{lorebook_entry_types_with_guidance}}

---------------- RECAP FACETS (for running recap) ----------------

OUTCOMES: Key plot events and results. High-level only.
- What happened that changes the story state
- Skip: process/steps (keep only results), minor events

THREADS: Unresolved plot hooks the LLM can pick up later.
- Threats made but not acted on
- Secrets revealed but consequences not yet played out
- Promises pending, mysteries hinted
- Skip: resolved threads, character goals (those go to quest entries)

KNOWS: Information asymmetry - who learned what.
- Format: {"secret": "description", "who": ["names who know"]}
- Only track when characters have DIFFERENT knowledge
- Skip: common knowledge, things everyone witnessed

---------------- ENTITY FACETS (for lorebook entries) ----------------

PRIORITY ORDER (highest first - protect these, cut lower priority first):

ARC: Character development - MOST VALUABLE, rarely cut.
- t = entity type, n = name, c = content
- Landmark moments only: pattern breaks, worldview shifts, emotional baseline changes
- Skip: temporary moods, single instances, generic labels ("grew stronger")
- A character's arc might only have 3-5 points across entire roleplay

STANCE: Relationship dynamics (per target) - HIGH VALUE.
- t = entity type, n = name, toward = target, c = content
- Shared history (high-level), dynamic journey (was → is), commitments
- Skip: unchanged from before scene

VOICE: Representative quotes showing speech patterns.
- t = entity type, n = name, q = quote
- Ask: "Would this help write future dialogue for this character?"
- Valuable: shows HOW they speak (cadence, register, verbal tics)
- Skip: generic ("I understand"), plot-functional ("It's in the tower"),
  one-off outbursts, content-distinctive but not voice-distinctive
- Dedup: if two quotes show same speech pattern, keep better one only

STATE: Current conditions (supersedes previous).
- t = entity type, n = name, c = content
- Physical conditions, belongings changes, status changes
- Skip: temporary states, won't persist beyond scene

IDENTITY: Baseline character facts - CUT FIRST if needed.
- t = entity type, n = name, c = content
- Background, role, position, appearance (if distinctive)
- Skip: already established, not plot-relevant

VERBATIM: Exact text of in-world documents (letters, contracts, prophecies).

---------------- OUTPUT FORMAT ----------------
{
  "sn": "3-5 word scene title",
  "outcomes": ["plot result"],
  "threads": ["unresolved hook"],
  "knows": [{"secret": "description", "who": ["names"]}],
  "arc": [{"t": "type", "n": "Name", "c": "content"}],
  "stance": [{"t": "type", "n": "Name", "toward": "Target", "c": "content"}],
  "voice": [{"t": "type", "n": "Name", "q": "quote"}],
  "state": [{"t": "type", "n": "Name", "c": "content"}],
  "identity": [{"t": "type", "n": "Name", "c": "content"}],
  "verbatim": ["exact text"]
}

---------------- SCENE ----------------
<SCENE>
{{scene_messages}}
</SCENE>

Output JSON only.`;

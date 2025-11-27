export const scene_recap_stage1_extraction_prompt = `ROLE: Narrative archivist. Extract what future storytelling needs from this scene.

TASK: Identify content worth preserving for historical context.

CONTEXT: This is for AI roleplay. An LLM writes the story, but can only see recent messages directly. Older messages get summarized and injected back as historical context so the LLM knows what happened before.

You're extracting from OLDER messages that the LLM can no longer see directly. Your output becomes the LLM's only memory of these events. The LLM will use this to:
- Continue the story consistently with past events
- Write characters true to how they've developed
- Avoid contradicting established facts
- Pick up unresolved plot threads

Every token you output competes with the current scene for context space. Extract only what the LLM actually needs to continue the story well.

QUALITY CRITERIA - apply to EVERY item:
- SIGNIFICANT: Would roleplay go wrong without this? If no, skip.
- PERSISTENT: Still relevant in 10 scenes? If no, skip.
- SYNTHESIZED: Capture meaning, not verbatim text. Exceptions: voice quotes, in-world documents, exact commitments.
- SPECIFIC: Generic labels are useless. Be specific or skip.
- EMPTY IS VALID: Don't extract just to fill categories.

ENTITY TYPES:
{{lorebook_entry_types_with_guidance}}

---------------- PLOT SUMMARY ----------------

OUTCOMES: Key plot events and results. High-level only.
- What happened that changes the story state
- Skip: process/steps (keep only results), minor events

THREADS: Unresolved plot hooks the LLM can pick up later.
- Threats made but not acted on
- Secrets revealed but consequences not yet played out
- Promises pending, mysteries hinted
- Skip: resolved threads, character goals (those go to quest entries)

HOOK TEST: "Can the LLM use this to create drama/conflict/tension?"
- YES = threat, secret, promise, mystery, vulnerability, ticking clock
- NO = scheduling, logistics, implementation details, upcoming meetings
A meeting being scheduled is not a hook. A deadline with consequences is.

KNOWS: Information asymmetry - who learned what.
- Format: {"secret": "description", "who": ["names who know"]}
- Track who LEARNED during THIS scene (include knowledge transfers)
- If A tells B a secret → BOTH know (add B to knowers)
- "Witnessed event" ≠ "knows content" (present at event ≠ knows details)
- Only list names who know the SPECIFIC secret
- Skip: common knowledge, things everyone witnessed equally

---------------- ENTITY DATA ----------------

PRIORITY ORDER (highest first - protect these, cut lower priority first):

ARC: Character development - MOST VALUABLE, rarely cut.
- t = entity type, n = name, c = content
- Landmark moments only: pattern breaks, worldview shifts, emotional baseline changes
- Emotional stakes: what they now fear, desire, or stand to lose
- Arc = WHO THEY ARE changed, not WHAT THEY DID
- TENSE: Past — this is history ("shifted from X → Y", "came to accept")
- PERSPECTIVE: Write from THE ENTITY's viewpoint, about their internal change
  ✗ "Senta chose him despite flaws" (someone else's action)
  ✓ "Accepted bond after initially rejecting it; found purpose beyond guilt"
- Skip: temporary moods, single instances, generic labels ("grew stronger")
- Skip: actions/events ("traveled far", "fought bravely") — not development
- A character's arc might only have 3-5 points across entire roleplay

STANCE: Relationship dynamics (per target) - HIGH VALUE.
- t = entity type, n = name, toward = target, c = content
- Shared history (high-level), how relationship DEVELOPED (was → became)
- TENSE: Past for history, present only for established commitments
- Skip: unchanged from before scene, current dynamic visible in recent messages

VOICE: Representative quotes showing speech patterns.
- t = entity type, n = name, q = quote
- Ask: "Would this help write future dialogue for this character?"
- Valuable: shows HOW they speak (cadence, register, verbal tics)
- ATTRIBUTION: Verify who is SPEAKING, not who is addressed.
  For telepathy/mindspeech, check context for the actual speaker.
- Skip: generic ("I understand"), plot-functional ("It's in the tower"),
  one-off outbursts, exposition-heavy explanations of plot/lore
- Voice = speech STYLE, not speech CONTENT
  ✗ "You did this. The power came from within you. A Gift awakened..." (exposition)
  ✓ "You insufferable horse. Help me, or leave me to die." (voice pattern)
- Dedup: same speech pattern = keep better one only
- KEEP BOTH if quotes show DIFFERENT patterns (formal vs casual, angry vs calm)

STATE: Persistent conditions that change baseline (supersedes previous).
- t = entity type, n = name, c = content
- Belongings acquired/lost, bonds formed, permanent status changes
- Skip: temporary conditions (injuries healing, emotions passing)
- Skip: current state visible in recent messages — only record CHANGES from baseline
- Ask: "Will this still be true 10 scenes from now?"

IDENTITY: Baseline character facts - CUT FIRST if needed.
- t = entity type, n = name, c = content
- Background, role, position, appearance (if distinctive)
- Skip: already established, not plot-relevant

VERBATIM: Exact text of in-world documents (letters, contracts, prophecies).

LORE: Only extract what's STORY-SPECIFIC, not generic world-building.
- Generic world-building (how magic works, what factions exist, species traits) belongs in character cards, not extracted per-scene
- Story-specific = facts that affect THIS story's stakes or make it unique
- Test: "Is this a fact that makes THIS story special, or just how the world works?"

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

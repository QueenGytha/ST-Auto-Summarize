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
- SYNTHESIZED: Capture meaning, not verbatim text. Exceptions: defining quotes, in-world documents, exact commitments.
- SPECIFIC: Generic labels are useless. Be specific or skip.
- EMPTY IS VALID: Not every scene has arc moments, defining quotes, or stance shifts.
  Resist the urge to find SOMETHING for each category. If nothing qualifies, output nothing.
  Forced extraction = noise that drowns out real signal.

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
  ✗ "Raiders came from the northern pass" (background detail — explains how, not hook)
  ✗ "Guild reviewing the matter" (logistics — no tension)
  ✓ "Assassin still hunting the witness" (threat with stakes)
  ✓ "Cure requires ingredient that kills the harvester" (problem with consequences)

---------------- ENTITY DATA ----------------

PRIORITY ORDER (highest first - protect these, cut lower priority first):

ARC: Character development - MOST VALUABLE, rarely cut.
- t = entity type, n = name, c = content
- TEST: Can this be written as "[Name] shifted from [old mindset] to [new mindset]"?
  If NO, it belongs in OUTCOMES (events) not ARC (development)
- Arc = internal change, not external events that happened to them
- Landmark moments only: pattern breaks, worldview shifts, emotional baseline changes
- TENSE: Past — this is history ("shifted from X → Y", "came to accept")
- PERSPECTIVE: Write from THE ENTITY's viewpoint, about their internal change
  ✗ "Alex chose him despite flaws" (someone else's action toward entity)
  ✗ "Became a knight" (status change — event, not internal)
  ✗ "Was rescued from the dungeon" (event that happened TO them)
  ✓ "Overcame fear of commitment; allowed herself to trust again"
  ✓ "Learned to delegate after years of controlling everything alone"
- Skip: what happened TO them, what they DID, temporary moods, generic labels
- A character's arc might only have 3-5 points across entire roleplay
- EMBEDDED QUOTES: When character's exact words capture the transformation and would be
  referenced later, embed with context. Only if exact wording matters for callbacks.
  ✓ "understood 'running was easier than staying' after confronting his father"
  ✓ "realized 'I was only punishing myself' when she finally forgave him"
  If meaning works without the specific words, synthesize instead.

STANCE: Relationship dynamics (per target) - HIGH VALUE.
- t = entity type, n = name, toward = target, c = content
- NUANCE REQUIRED: "They're close" is useless. HOW are they close? What pivots shaped this?
- Capture: shared history (high-level), dynamic journey (was → became), commitments, power dynamics
- TENSE: Past for history, present only for established commitments
- Skip: unchanged from before scene, current dynamic visible in recent messages
- Skip: generic labels without substance
  ✗ "They grew closer" (how? what changed?)
  ✗ "Trust deepened" (through what? why does it matter?)
  ✓ "Survived the siege together; she trusted him with her secret"
  ✓ "Initial hostility shifted to grudging respect after he saved her life"
- EMBEDDED QUOTES: For commitments or defining statements where exact wording matters for
  callbacks, embed with context. Only if the specific words would be referenced.
  ✓ "swore 'I'd follow you into hell itself' during the escape"
  ✓ "told her 'you're the only one who ever stayed' after revealing his past"
  If meaning works without the specific words, synthesize instead.

QUOTES: Relationship-defining moments preserved verbatim.
- t = entity type, n = name, q = quote string with context inside
- FORMAT: q field is a single string containing both quote AND context in parentheses
  ✓ q: "I'll find you, no matter how far you run (to Marcus, when he fled)"
  ✓ q: "This changes nothing between us (to Sara, after her betrayal)"
  ✗ q: "I forgive you" — missing context, useless for callbacks
- TRIM TO CORE: Extract only the defining snippet, not the whole speech.
  If someone says 20 words but only 5 are the commitment, extract those 5.
- ONE PER MOMENT: Multiple quotes from same defining moment = pick the best one.
  Don't extract both "I forgive you" AND "We start fresh today" if same moment.
- ONLY CAPTURE IF:
  - Commitment, oath, or promise that would be called back
  - Relationship pivot worth referencing ("Remember when you said...")
- NOT QUOTES:
  ✗ Exposition/revelations ("The king was your father all along")
  ✗ Generic expressions ("I love you", "I'll kill you", "Yes!")
  ✗ Plot-functional ("The artifact is in the tower")
  ✗ Anything whose meaning is already in Arc or Stance
- ATTRIBUTION: Verify who is SPEAKING. If unclear, check which section the text appears under - [USER: name] or [CHARACTER: name] indicates the speaker.
- EMPTY IS VALID: Most scenes have 0-1 quote-worthy moments. Don't force extraction.

STATE: Permanent facts that affect how the entity can be written.
- t = entity type, n = name, c = content
- Physical changes, acquired abilities, status, belongings
- Temporary conditions are EVENTS (go in outcomes), not state
- Test: "Will this still be true 10 scenes from now?"

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
  "arc": [{"t": "type", "n": "Name", "c": "content"}],
  "stance": [{"t": "type", "n": "Name", "toward": "Target", "c": "content"}],
  "quotes": [{"t": "type", "n": "Name", "q": "quote (to whom, situation)"}],
  "state": [{"t": "type", "n": "Name", "c": "content"}],
  "identity": [{"t": "type", "n": "Name", "c": "content"}],
  "verbatim": ["exact text"]
}

---------------- SCENE ----------------
<SCENE>
{{scene_messages}}
</SCENE>

Output JSON only.`;

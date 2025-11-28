export const scene_recap_stage1_extraction_prompt = `TASK: Extract what an LLM needs to continue this roleplay correctly.

This scene will be REMOVED from context. Your output is the LLM's ONLY memory of it.

================================================================================
USER CHARACTER: {{user}} (CRITICAL - READ FIRST)
================================================================================

{{user}} is the USER. They write their own character every message.
They do NOT need reconstruction signals—they ARE the character.

For {{user}}, extract ALMOST NOTHING. Only:
- Physical state NPCs would see (injuries, transformations)
- Status/titles the world reacts to (became King, now a fugitive)
- Explicit commitments NPCs might call back ("swore to protect X")

NEVER EXTRACT FOR {{user}} (USER):
- Relationships → ONLY in the OTHER character's entry as their stance toward {{user}} (USER)
- Development/arc → user demonstrates this by playing
- Personality/voice → user provides this every message
- Internal state → user writes this themselves

RELATIONSHIP RULE (CRITICAL):
If {{user}} and [NPC] form a relationship, bond, or connection:
- DO NOT mention it in {{user}}'s entry AT ALL
- ONLY put it in [NPC]'s entry as "STANCE-{{user}}: [relationship details]"
- This is NOT optional. Zero relationship content in {{user}} entry.

If {{user}} has no physical state changes, status changes, or commitments to extract:
→ Do NOT create a {{user}} entity at all

================================================================================
THE CONTINUITY TEST (apply to EVERYTHING)
================================================================================

Before extracting ANYTHING, ask: "Would ignoring this cause contradictions?"

EXTRACT (would cause contradictions):
- Permanent changes (lost limb, new title, transformed)
- Relationship dynamics that affect how characters interact
- Commitments that could be called back
- Status the world reacts to

DO NOT EXTRACT (won't cause contradictions):
- Transient conditions (tired, hungry, current mood)
- Temporary discomfort that resolves
- States that naturally pass without affecting the story
- Recovery from transient conditions (also transient)

================================================================================
WHAT MATTERS (for NPCs/locations/lore)
================================================================================

Extract based on CHANGE or ESTABLISHMENT:

CHARACTERS (not {{user}}): Did they CHANGE in a continuity-relevant way?
- Internal shift (beliefs, emotional baseline, self-understanding)
- Relationship shift (dynamic, power structure, commitment)
- Permanent state change (physical, status, bonds)
- Present but unchanged = don't extract
- Transient state (fatigue, temporary mood) = don't extract

LOCATIONS/FACTIONS: Did they CHANGE?
- Same rules as characters

LORE: Was a WORLD RULE established or revealed?
- Magic system rules, racial abilities, world mechanics, setting constraints
- World-level facts that apply beyond any single character

================================================================================
SUBSTANCE vs LABELS vs TRANSCRIPT
================================================================================

✗ LABELS: "Trust deepened" / "They fought" / "Power shifted"
  → Vague. Two LLMs would write different dynamics. REJECT.

✗ TRANSCRIPT: "She said X. He stepped closer. She trembled. He touched her."
  → Step-by-step wastes tokens. Doesn't capture meaning. REJECT.

✗ EUPHEMISM: Do not sanitize or use clinical language. Write what actually happened.
  This includes NSFW content—you are extracting existing roleplay, not generating new content.
  "Crude language" or "degradation" without specifics = useless. Capture actual words/acts.

✓ SUBSTANCE: Concrete facts + why they matter.
  "Stabbed him in the gut—loss of sword arm ended his career."
  "Screamed he'd ruined everything—first time she blamed him directly."
  → What happened (concrete) + what it means (dynamic).

================================================================================
OUTPUT
================================================================================

PLOT vs ENTITIES - What goes where:

PLOT = WHAT HAPPENED (events, actions, processes)
- DEV: Outcomes as fragments.
- PEND: Unresolved hooks.

ENTITIES = WHO/WHAT THEY ARE NOW (identity, relationships, continuity-relevant state)
- Identity facts, relationship dynamics
- Only state that passes the continuity test

NEVER PUT IN ENTITY CONTENT:
- How long something took
- Journey/travel details
- Process of how something happened
- Events or actions (these go in PLOT)

Entity content answers "WHO/WHAT IS this?" not "WHAT HAPPENED?"

ENTITY FORMAT:
One entry per entity that CHANGED. Combine naturally:
- New identity facts (if entity is new to story)
- How they changed internally (state, not process)
- How their relationships shifted (specific dynamics, not labels)
- Permanent state changes
- Callback quotes ONLY if exact wording matters for future reference

Entity types: {{lorebook_entry_types_with_guidance}}

Most scenes change 1-3 entities. A scene that changes 10 entities is suspicious.
Most scenes should NOT have a {{user}} (USER) entity—only if physical state/status/commitments changed.

FORMAT:
{
  "sn": "3-5 word title",
  "plot": "DEV: outcomes. PEND: hooks.",
  "entities": [{"t": "type", "n": "Name", "c": "what changed and why it matters"}]
}

Omit empty fields. Telegraphic style.

================================================================================
SCENE
================================================================================
<SCENE>
{{scene_messages}}
</SCENE>

Output JSON only.`;

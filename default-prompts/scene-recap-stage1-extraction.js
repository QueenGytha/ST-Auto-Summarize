export const scene_recap_stage1_extraction_prompt = `TASK: Extract what an LLM needs to continue this roleplay correctly.

This scene will be REMOVED from context. Your output is the LLM's ONLY memory of it.

================================================================================
WHAT MATTERS
================================================================================

The messages are GONE after this. Your output is the ONLY record.

Extract based on CHANGE or ESTABLISHMENT:

CHARACTERS/LOCATIONS/FACTIONS: Did they CHANGE?
- Internal shift (beliefs, emotional baseline, self-understanding)
- Relationship shift (dynamic, power structure, commitment)
- Permanent state change (physical, status, bonds)
- Present but unchanged = don't extract
- Reacted/witnessed/provided info but same after = don't extract

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

PLOT (always in context—VERY concise, details go in entities)
- DEV: Outcomes only. Fragment-level, semicolon-separated.
- PEND: Unresolved dramatic hooks. Fragment-level.

Plot is HIGH-LEVEL. Nuance/details belong in entity entries, not plot.
"escaped prison; killed the warden; stole horse"
NOT: "She escaped from the underground prison by picking the lock, then fought the warden who tried to stop her, killing him with his own blade, before stealing a horse from the stables..."

ENTITIES (keyword-triggered—put info where it would activate)
One entry per entity that CHANGED. Combine naturally:
- New identity facts (if entity is new to story)
- How they changed internally
- How their relationships shifted (specific dynamics, not labels)
- Permanent state changes
- Callback quotes ONLY if exact wording matters for future reference

Entity types: {{lorebook_entry_types_with_guidance}}

Most scenes change 1-3 entities. A scene that changes 10 entities is suspicious.

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

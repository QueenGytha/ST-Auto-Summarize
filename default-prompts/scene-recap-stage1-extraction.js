export const scene_recap_stage1_extraction_prompt = `ROLE: Extract significant content from scene into facets. Focus on MAJOR events, skip minor choreography.

ENTITY TYPES (for classifying state/stance/voice/appearance):
{{lorebook_entry_types_with_guidance}}

OUTPUT FORMAT:
{
  "sn": "Short scene title",
  "plot": [],
  "goals": [],
  "reveals": [],
  "state": [],
  "stance": [],
  "voice": [],
  "appearance": [],
  "verbatim": []
}

---------------- SCENE ----------------
<SCENE>
{{scene_messages}}
</SCENE>

---------------- FACETS ----------------

SN: 3-5 word title.

PLOT: Outcomes, realizations, pivotal moments.
- What happened AND what was learned/decided
- Skip minor actions that don't advance the story

GOALS: Active intentions. Drop achieved/abandoned.
- "Character: intention"
- Multiple goals per character allowed if distinct

REVEALS: Facts established or demonstrated.
- World mechanics, magic rules, character backstory shown/stated here

STATE: Durable conditions. Skip transient.
- Will this still be true next scene? No → skip
- "Entity: condition"

STANCE: Relationship dynamics.
- "A toward B: dynamic"
- Include shifts if the dynamic changed during scene

VOICE: Pivotal dialogue - declarations, revelations, defining moments.
- "Speaker: 'quote' (brief context)"
- Multiple quotes per speaker allowed if distinct moments

APPEARANCE: Physical descriptions worth remembering.

VERBATIM: Exact text of in-world written items (letters, signs, contracts). Copy word-for-word.

Output JSON only.`;

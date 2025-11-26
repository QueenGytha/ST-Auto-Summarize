export const scene_recap_stage1_extraction_prompt = `ROLE: Extract significant content from scene into facets.

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
  "docs": []
}

---------------- SCENE ----------------
<SCENE>
{{scene_messages}}
</SCENE>

---------------- FACETS ----------------

SN: 3-5 word title.

PLOT: Outcomes, realizations, and pivotal moments.
- What happened AND what was learned/decided

GOALS: Active intentions only. Drop achieved/abandoned.
- "Character: intention"

REVEALS: Scene-specific facts only. Not generic world lore.
- Skip anything that would be in a character card or world primer

STATE: Durable conditions only. Skip transient.
- Will this still be true next scene? No → skip
- "Entity: condition"

STANCE: One entry per relationship pair.
- "A toward B: dynamic"

VOICE: Pivotal dialogue - declarations, revelations, defining moments.
- "Speaker: 'quote' (brief context)"

APPEARANCE: Physical descriptions worth remembering.

DOCS: Verbatim document text.

Output JSON only.`;

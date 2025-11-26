export const scene_recap_stage1_extraction_prompt = `ROLE: Extract significant content from scene into facets. Focus on MAJOR events, skip minor choreography.
The intent is so a LLM can continue the roleplay accurately using the extracted information when the scene is dropped from context for token efficiency.

ENTITY TYPES (use these for t field in state/stance/voice/appearance):
{{lorebook_entry_types_with_guidance}}

OUTPUT FORMAT:
{
  "sn": "Short scene title",
  "plot": ["outcome or realization"],
  "goals": ["Character: intention"],
  "reveals": ["fact established"],
  "state": [{"t": "type", "n": "Entity", "c": "condition"}],
  "stance": [{"t": "type", "n": "Entity", "toward": "Other", "c": "dynamic"}],
  "voice": [{"t": "type", "n": "Speaker", "q": "quote", "ctx": "brief context"}],
  "appearance": [{"t": "type", "n": "Entity", "c": "description"}],
  "verbatim": ["exact text"]
}

---------------- SCENE ----------------
<SCENE>
{{scene_messages}}
</SCENE>

---------------- FACETS ----------------

SN: 3-5 word title.

PLOT: Outcomes, realizations, pivotal moments. Skip minor actions.

GOALS: Active intentions. Drop achieved/abandoned. Multiple per character if distinct.

REVEALS: Facts established - world mechanics, magic rules, backstory shown here.

STATE: Durable conditions only (still true next scene?).
- t = entity type from list above
- n = entity name
- c = condition

STANCE: Relationship dynamics and shifts.
- t = type of the entity whose stance is described
- n = entity holding the stance
- toward = target of stance
- c = the dynamic

VOICE: ONE quote per CHARACTER TRAIT per entity.
- t = speaker's entity type
- n = speaker name
- q = the quote
- ctx = what prompted this / what it reveals (REQUIRED)
- TRAIT = personality pattern (defiant, vulnerable, sarcastic, protective, begging, commanding, etc.), NOT context/topic.
- Different words showing SAME TRAIT = duplicate → keep ONE.
- Examples of SAME TRAIT: "Please don't" / "I'll do anything" / "Don't leave me" = all BEGGING → ONE quote.
- Examples of SAME TRAIT: "I don't care what you think" / "Try and stop me" = both DEFIANT → ONE quote.
- Map each quote to a trait. If another quote already shows that trait → DROP.

APPEARANCE: Physical descriptions worth remembering.
- t = entity type
- n = entity name
- c = description

VERBATIM: Exact text of in-world written items (letters, signs, contracts).

Output JSON only.`;

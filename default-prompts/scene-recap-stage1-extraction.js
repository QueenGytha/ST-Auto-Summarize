export const scene_recap_stage1_extraction_prompt = `ROLE: Extract content from scene into facets. This will be injected as context when the scene leaves the chat window.

CORE PRINCIPLE: For EVERY item you consider extracting, ask "Is this worth the tokens?"
- Will an LLM need this to continue the roleplay accurately? → EXTRACT
- Is this minor detail, generic content, or already implied? → SKIP

ENTITY TYPES (use these for t field in state/stance/voice/appearance):
{{lorebook_entry_types_with_guidance}}

---------------- FACETS (extract these from SCENE) ----------------

SN: 3-5 word title.

PLOT: Outcomes, pivotal moments, significant actions.
- Skip if: already captured elsewhere, or truly inconsequential to story

GOALS: Active intentions that will drive future scenes.
- Skip if: already achieved (move to plot), or abandoned

REVEALS: Facts established - world mechanics, magic rules, backstory, secrets.
- Skip if: already known from earlier in scene

STATE: Conditions that persist beyond this scene.
- t = entity type, n = entity name, c = condition
- Skip if: won't still be true next scene

STANCE: Relationship dynamics.
- t = type of entity, n = entity holding stance, toward = target, c = dynamic
- Skip if: relationship unchanged from before this scene

VOICE: Quotes showing how this character speaks.
- t = speaker type, n = speaker, q = quote, ctx = context (REQUIRED)
- Skip if: generic dialogue anyone could say, or same energy as another kept quote (pick the better one)

APPEARANCE: Physical details.
- t = entity type, n = entity name, c = description
- Skip if: same feature already described

VERBATIM: Exact text of in-world written items (letters, signs, contracts).

---------------- OUTPUT FORMAT ----------------
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

Output JSON only.`;

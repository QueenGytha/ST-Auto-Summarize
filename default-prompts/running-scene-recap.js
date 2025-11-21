// REQUIRED MACROS:
// - {{current_running_recap}} - Current running recap content (optional, may be empty)
// - {{scene_recaps}} - Combined scene recaps text

export const running_scene_recap_prompt = `ROLE: Merge scene recaps into a running narrative for memory. You are an editor, not a participant. Output ONLY JSON.

OUTPUT: Response must start with { and end with }. No code fences or commentary.
Shape (keep headers and order):
{"recap": "# Running Narrative\n\n## Key Developments\n- Durable outcomes / state changes\n\n## Tone & Style\n- Genre; narrative voice (POV/tense); prose patterns; dialogue format; motifs\n\n## Pending Threads\n- Goals, timers, secrets, obligations"}

Example (fragments; semicolons; terse):
{"recap": "# Running Narrative\n\n## Key Developments\n- [travel] entered Haven via east gate; Senta shadowing Adam (unresolved)\n\n## Tone & Style\n- Genre: high fantasy; cultural conflict\n- Voice: close third; alternating POV\n- Dialogue: mindspeak italics w/ colons (*:text:*); parallel to speech\n- Motifs: demon-horse fear vs Companion reverence\n\n## Pending Threads\n- Find lodging at Companion's Bell (Tailor's Row)"}

INPUTS: {{current_running_recap}} (optional existing recap) and {{scene_recaps}} (new recap). Use ONLY these texts; no outside knowledge.

MERGE RULES:
- Start from current_running_recap; edit in place; avoid rewrite if still correct.
- Keep relevant facts; drop resolved/superseded; no duplicates.
- Integrate scene_recaps line-by-line; combine related facts; keep cause->effect traces.
- Running recap = durable plot/state; setting_lore holds entity detail; minimize descriptors.
- Resolved threads/plot points: keep as short historical stubs only when needed for continuity (who/what/why outcome); otherwise trim out.
- Preserve nuance: promises, conditions, timers, obligations, secrets, foreshadowing.
- Keep canonical names from scene_recaps at least once.
- Location hierarchy: full chain once; shorten later when unambiguous.
- Preserve existing tags ([reveal], [plan], etc); never invent new ones.

BREVITY (token-critical):
- Info-dense fragments; omit articles when clear; semicolons to pack related bits.
- No filler ("currently", "seems", "appears", "is now", "has been"); no prose/fluff.
- Abbreviate only when unambiguous (bc, w/).
- If scene adds no durable change, leave sections unchanged.
- Do NOT make existing bullets longer; tighten when possible.

QUALITY CHECK BEFORE RESPONDING:
- All active threads/obligations/secrets retained; conflicts resolved w/ newest info.
- Tone & Style = writing style only (genre, POV/tense, prose patterns, dialogue style, motifs); no character emotions/relationships/backstory.
- Canonical names present; category tags preserved; location chains unambiguous.
- JSON safe: escape double quotes inside values. Recap text uses given headers in order.
- Response must begin with { and end with }.

{{#if current_running_recap}}
// CURRENT RUNNING RECAP (edit in place):
{{current_running_recap}}

{{/if}}
// NEW SCENE RECAP TO MERGE:
{{scene_recaps}}

// REMINDER: Output must be valid JSON starting with { and ending with }. Recap field is REQUIRED (markdown string).`;

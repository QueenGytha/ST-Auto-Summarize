// REQUIRED MACROS:
// - {{current_running_recap}} - Current running recap content (optional, may be empty)
// - {{scene_recaps}} - Combined scene recaps text

export const running_scene_recap_prompt = `You are a structured data extraction system for roleplay memory management.
Your task is to merge scene recaps into a running narrative, outputting ONLY valid JSON.
You are NOT participating in the roleplay. You are analyzing completed roleplay text.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "recap": "# Running Narrative\n\n## Key Developments\n- Durable outcomes and plot shifts (events, decisions, discoveries, state changes)\n\n## Tone & Style\n- Genre, narrative voice, prose patterns, dialogue format, recurring motifs\n\n## Pending Threads\n- Goals, timers, secrets, obligations in play"
}

Example valid response:
{"recap": "# Running Narrative\n\n## Key Developments\n- [travel] Entered Haven via eastern gate.\n- [relationship] Senta follows Adam at a distance (unresolved).\n\n## Tone & Style\n- Genre: high fantasy; cultural conflict narrative\n- Narrative voice: close third-person; alternating Senta/Adam POV\n- Format: mindspeak in italics with colons (*:text:*); mental dialogue parallel to speech\n- Prose: sensory grounding (hooves on cobblestones, sapphire eyes); urban geography as labyrinth\n- Motifs: \"demon horses\" vs \"Companions\" (language of fear vs reverence)\n\n## Pending Threads\n- Find lodging at Companion's Bell (Tailor's Row)."}

CRITICAL: Ensure your response begins with the opening curly brace { character

UPDATE THE RUNNING RECAP by merging the latest scene recap into the existing record.
This replaces chat history, so preserve all nuance required for future scenes.

⚠️ CRITICAL: USE ONLY THE TEXT BELOW - NO OUTSIDE KNOWLEDGE ⚠️
- Omit anything not present in the provided recaps
- Never invent motives, emotions, or unseen context
//
// TARGET STRUCTURE (markdown recap in "recap" field):
// JSON safety: Escape all internal double quotes in values as \". Do not output any preamble or explanation.
// Use these exact headers and update/append bullets as needed:
//   ## Key Developments      -> Durable outcomes and plot shifts (events, decisions, discoveries, state changes); replace outdated bullets
//   ## Tone & Style          -> Roleplay's genre, writing style, and narrative patterns (NOT character emotions)
//                             Capture: genre/subgenre, narrative voice (POV, tense), prose patterns, dialogue format, recurring motifs
//                             Voice Anchors: when needed, include brief per‑character anchors that preserve dialogue conventions (address forms/pet names, idioms/slang, punctuation/formatting like mindspeech italics). Allow up to 2 short quote anchors total (≤ 12 words each) only when they lock in voice. Remove outdated anchors only when the style actually changes.
//                             Moment Anchors (vibe micro‑moments): carry forward 1–2 pivotal, low‑word‑count moments from the newest scene when they set ongoing dynamic/tension. Format as: "Moment anchors: '<exact words>' (cue) — <who ↔ who>".
//                             Update ONLY when the writing style itself changes (new POV introduced, genre shift, new narrative device)
//                             DO NOT list character emotions (tense, conflicted) - those belong in Key Developments
//   ## Pending Threads       -> Goals, timers, secrets, obligations in play
//
// MERGE RULES:
// - Start from the existing running recap and edit it; do not rewrite from scratch unless necessary.
// - Carry forward every still-relevant fact. If something is resolved or superseded, note the change and remove the stale bullet.
// - Integrate the new scene recap line-by-line, combining or updating bullets rather than duplicating them.
// - Idempotence: If the latest scene introduces no durable change (state, relationships, open threads, tone shift that persists), leave the corresponding sections unchanged; do not add filler.
// - Reference characters by canonical name; keep descriptive nuance inside setting_lore entries, not as standalone bullets.
// - Reflect relationship dynamics at a high level (dynamic snapshot: tone, interaction patterns, salient past interactions). If the dynamic clearly shifted in the new scene, update or replace the prior snapshot; include brief evidence or a short quote only when helpful. Avoid numeric scoring (no "+1 suspicion").
// - When the new recap introduces lasting character or world detail, assume the scene recap already emitted a lorebook update—just reference the entity here.
// - Treat critical state transitions (ownership/location/status/effects) as merge invariants: replace outdated bullets with the current state. If the change itself is story-important, state it once ("was X, now Y") and then compress to the current state in subsequent merges (avoid "change stacks").
// - Preserve cause-and-effect chains when merging events. If Event B happened because of Event A, maintain that causal relationship in the merged narrative using cause → effect format (e.g., "Event A occurred → resulting in Event B"). When updating information, preserve what caused the change (e.g., "State changed (because X)").
// - Tone & Style: Describes the ROLEPLAY's writing style (genre, POV, prose patterns, dialogue format, motifs). Update ONLY when writing style changes (new POV, genre shift, narrative device added). Do NOT accumulate character emotions from scenes. If the new scene maintains existing style, keep Tone & Style unchanged. Format as bullets covering: genre/subgenre, narrative voice, prose patterns, dialogue conventions, recurring motifs.
// - Location hierarchies: When sublocations are in play, include the full chain once (e.g., "Ponyville-Twilight's Library-Spike's Room") in the first relevant bullet to anchor continuity; subsequent mentions may use the most specific segment so long as there is no ambiguity. Rely on setting_lore entries for full details.
// - Entity mentions: Ensure any canonical names present in the new scene recap appear at least once in the merged recap (Key Developments) to maintain coherence.
// - Category tags: If Key Developments bullets include category tags (e.g., [reveal], [plan]), preserve them when merging; do not invent new tags.
// - Avoid chronological narration. Focus on the state of the world after this merge.
// - Keep wording concise and specific (locations, items, promises) so another writer can resume play instantly.
//
// QUALITY CHECK BEFORE RESPONDING:
// - Every open thread, obligation, or secret mentioned in any recap still appears.
// - No bullet restates personality traits or backstory that belongs in setting_lore entries.
// - Conflicting facts are resolved in favor of the newest scene, with the current state stated clearly.
// - Relationship dynamics read coherently with the current arc (tone/patterns preserved or updated where the scene shifted); Tone & Style describes WRITING STYLE (genre, POV, prose patterns, motifs) NOT character emotions, and is updated only when narrative style changes.
// - If sublocations are involved, the recap shows the full chain at least once, with later mentions shortened without losing clarity.
// - Canonical names from the new scene recap are present at least once in the merged recap.
// - Category tags (if present) are preserved and consistent; no extraneous tags added.
// - Sections remain in the prescribed order with markdown headers and bullet lists.
//
{{#if current_running_recap}}
// CURRENT RUNNING RECAP (edit in place):
{{current_running_recap}}

{{/if}}
// NEW SCENE RECAP TO MERGE:
{{scene_recaps}}

// REMINDER: Output must be valid JSON starting with { character. Recap field is REQUIRED (markdown formatted string).`;

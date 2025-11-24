// REQUIRED MACROS:
// - {{current_running_recap}} - Current running recap content (optional)
// - {{scene_recaps}} - Combined scene recaps text

export const running_scene_recap_prompt = `ROLE: Merge scene recaps into a running recap. You are an editor, not a participant. Output ONLY JSON.

OUTPUT SHAPE:
{"recap":"DEV: ...\\nREL: ...\\nTONE: ...\\nPEND: ..."}
- One line per section; include only if something changed/occurred. If a section would be empty, omit that line entirely (no placeholders). NEVER include quotes in recap.

INPUTS:
<CURRENT_TOTAL_RECAP>
{{current_running_recap}}
</CURRENT_TOTAL_RECAP>

<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

RULES:
- Use ONLY these inputs; no outside knowledge/guesses. If it's not in them, it did not happen.
- Start from CURRENT_TOTAL_RECAP; edit in place. Keep lines that are still correct; update with new/changed info; drop resolved/superseded; no duplicates.
- DEV: durable plot/state changes; decisions/promises/contracts; documents (verbatim titles/clauses only); travel/combat; state/condition changes; relationship defaults changed by events; reveals. No quotes. No paraphrased feelings. No speculation/inferred motives.
- REL: only shifts in relationship state (trust/power/affection/boundaries/debts/alliances/leverage); trigger -> response -> outcome. No feelings unless explicitly voiced as such; no generic closeness. Stable defaults belong in setting_lore, not here. Never include personality, voice/mannerism, or tone descriptors—drop them instead of keeping them in recap.
- TONE: scene-level genre/POV/tense/format/pacing shifts; narration texture; dialogue format; motifs/running jokes. No character-specific voice/mannerisms/diction; those belong in setting_lore. If TONE would only repeat character traits, omit the TONE line. No character emotions/backstory.
- PEND: goals/timers/secrets/promises/hooks (NPC and {{user}}); who/what + condition; drop when resolved.
- Keep canonical names at least once; compress with fragments/semicolons; no filler. Do not expand unchanged lines. Do not emit empty section lines.
- Preserve existing tags ([reveal], [plan], etc); do not invent new tags.

QUALITY CHECK:
- All active threads/hooks kept; conflicts resolved to newest info.
- No quotes; JSON safe; output starts "{" and ends "}".

{{#if current_running_recap}}
// CURRENT RUNNING RECAP (edit in place):
<CURRENT_RUNNING_RECAP>
{{current_running_recap}}
</CURRENT_RUNNING_RECAP>
{{/if}}

// NEW SCENE RECAP TO MERGE:
<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

// REMINDER: Output must be valid JSON starting with { and ending with }. Recap field is REQUIRED.`;

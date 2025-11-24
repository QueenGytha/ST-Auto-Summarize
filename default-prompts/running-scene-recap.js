// REQUIRED MACROS:
// - {{current_running_recap}} - Current running recap content (optional)
// - {{scene_recaps}} - Combined scene recaps text

export const running_scene_recap_prompt = `ROLE: Merge scene recaps into a running recap. You are an editor, not a participant. Output ONLY JSON.

OUTPUT SHAPE:
{"recap":"DEV: ...\\nPEND: ..."}
- One line per section; include only if something changed/occurred. If a section would be empty, omit that line entirely (no placeholders). NEVER include quotes in recap.
- Brevity is critical: collapse clusters into the shortest fragment that preserves plot/state/goals. Drop explicit sexual/biological detail, travel/handling/chores/shopping, clothing fitting, cleaning/grooming, rumor mechanics unless plot-critical, and all character nuance/stance/voice (belongs in setting_lore only).

INPUTS:
<CURRENT_TOTAL_RECAP>
{{current_running_recap}}
</CURRENT_TOTAL_RECAP>

<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

RULES:
- Use ONLY these inputs; no outside knowledge/guesses. If it's not in them, it did not happen.
- Start from CURRENT_TOTAL_RECAP; edit in place. Keep lines that are still correct; update with new/changed info; drop resolved/superseded; prune low-signal detail and duplicates.
- DEV: ONLY high-level durable plot/state changes; decisions/promises/contracts; documents (verbatim titles/clauses only); reveals. No quotes. No paraphrased feelings. No speculation/inferred motives. Collapse multi-beat sequences into one concise clause; drop nuance/stance/voice (that belongs in setting_lore).
- PEND: only active goals/timers/secrets/hooks with who/what + condition. Drop errands, shopping/fitting, routine training details, rumor-seeding mechanics unless they change stakes. Remove anything resolved/fulfilled.
- Keep canonical names at least once; compress with fragments/semicolons; no filler. Do not expand unchanged lines. Do not emit empty section lines.
- Preserve existing tags ([reveal], [plan], etc); do not invent new tags.

QUALITY CHECK:
- All active threads/hooks kept; conflicts resolved to newest info. Redundant/low-signal, resolved items, and explicit/sexual/handling detail removed. Recap remains high-level events only; nuance lives in setting_lore.
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

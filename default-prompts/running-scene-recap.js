// REQUIRED MACROS:
// - {{current_running_recap}} - Current running recap content (optional)
// - {{scene_recaps}} - Combined scene recaps text

export const running_scene_recap_prompt = `ROLE: Merge new scene recap into running recap. You are an editor. Output JSON only.

OUTPUT FORMAT:
{"recap":"DEV: ...\\nPEND: ..."}
- DEV: durable plot/state changes, decisions, reveals
- PEND: active goals/hooks (who wants what + condition)
- Omit empty sections. No quotes ever.

PHASE 1 - MERGE:
- Start from CURRENT_RUNNING_RECAP
- Add genuinely new information from NEW_SCENE_RECAP
- If new info restates existing, keep existing wording (don't duplicate)
- Drop resolved goals from PEND

PHASE 2 - WHAT BELONGS HERE:
DEV (keep): plot events, state changes, decisions, contracts, reveals
DEV (exclude): stance, voice, feelings, relationship nuance (belongs in setting_lore)
PEND (keep): active goals, timers, unresolved hooks
PEND (exclude): resolved items, routine tasks, shopping/errands

---------------- CURRENT (edit in place) ----------------
<CURRENT_RUNNING_RECAP>
{{current_running_recap}}
</CURRENT_RUNNING_RECAP>

---------------- NEW (merge in) ----------------
<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

---------------- PHASE 3 - COMPRESS BEFORE OUTPUT ----------------

SUPERSESSION PRINCIPLE:
Once outcome is established, process detail becomes low-signal.

Before (process detail):
  "DEV: X attacked; A defended; A overwhelmed; crisis triggered A's ability; destruction resulted"
After (outcome only):
  "DEV: X destroyed when attack triggered A's ability"

Keep process ONLY when steps have active consequences or unresolved threads.

BACKSTORY COLLAPSING:
Events that set up current situation → single clause.

Before: "A traveled; stopped to rest; argued; arrived destination; met contact; received task"
After: "A arrived destination; received task from contact"

RESOLVED ITEM REMOVAL:
Before PEND: "reach destination; meet contact; get task; complete objective"
After PEND (at destination): "complete objective"
Goals achieved = remove from PEND entirely.

FINAL CHECKLIST:
□ Backstory collapsed to outcomes?
□ Process detail removed where outcome known?
□ Resolved goals removed from PEND?
□ No stance/voice/feelings in recap? (belongs in setting_lore)
□ No quotes?

Output JSON only.`;

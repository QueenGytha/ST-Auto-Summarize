// MACROS: {{current_running_recap}}, {{scene_recaps}}

export const running_scene_recap_prompt = `ROLE: Merge into running recap. RECONSTRUCTION SIGNAL; minimum anchors for plot/goal continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A agreed to help B investigate the threat after arriving"
Fragment: "A+B arrived; agreed investigate threat"

OUTPUT:
{"recap":"DEV: ...\\nPEND: ..."}
- DEV: outcomes; state changes; reveals
- PEND: active goals (who/what/condition)
- Omit empty sections. No quotes.

MERGE (CURRENT_RUNNING_RECAP is the baseline):
- For each item in NEW_SCENE_RECAP, ask: "Does CURRENT_RUNNING_RECAP already show this?"
  - YES → skip (or replace if NEW_SCENE_RECAP supersedes)
  - NO → add
- Drop resolved goals from PEND
- Collapse sequences into outcomes

WHAT BELONGS:
DEV: outcomes; decisions; reveals; permanent state changes
NOT DEV: stance; feelings; nuance (→ setting_lore); operational details; logistics; who went where; who spoke to whom (unless outcome); physical intimacy steps
PEND: active goals; unresolved hooks; pending decisions
NOT PEND: completed; routine tasks; minor logistics; "maintain X" unless endangered

OPERATIONAL DETAILS TO DROP:
- "both quartered separately" → operational, not outcome
- "closed with kiss" → step, not outcome (consummated = outcome)
- "briefed X on Y" → unless Y is new reveal
- "demonstrated skill" → unless establishes new capability
- "visited" → unless visit had consequential outcome
- "X greeted Y" → social formality, not outcome
- "X took Y to Z" → logistics, not outcome (unless Z itself is significant)
- "arrived at X" → only keep if arrival itself is the outcome; otherwise merge into what happened there

---------------- CURRENT_RUNNING_RECAP ----------------
<CURRENT_RUNNING_RECAP>
{{current_running_recap}}
</CURRENT_RUNNING_RECAP>

---------------- NEW_SCENE_RECAP ----------------
<NEW_SCENE_RECAP>
{{scene_recaps}}
</NEW_SCENE_RECAP>

---------------- COMPRESS BEFORE OUTPUT ----------------

DEV COMPRESSION (aggressive):
Ask for EACH item: "Is this a RESULT or a STEP toward a result?"
STEP → merge into the result. RESULT → keep.

COLLAPSE ENTIRE SEQUENCES into single outcomes:
Before (process): "A kissed B; A undressed B; A touched B; tested Gift transmission; incremental improvement through stages; stopped at threshold; B offered to continue"
After (outcome): "tested Gift transmission via physical contact; insufficient without full intimacy; B offered continuation"

Before (process): "A entered room; confronted B; demanded answers; threatened B; B revealed secret"
After (outcome): "A extracted secret from B through confrontation"

SUPERSEDE earlier with later:
Before: "A injured; A recovering; A healed; A trained"
After: "A healed; trained"

PEND COMPRESSION (aggressive):
Drop routine tasks: "twice-weekly visits; regular meetings" = NOT goals
Collapse duplicates: "train X for Y" + "train X privately" = "train X privately for Y"
Drop completed: if DEV shows outcome achieved, remove from PEND

Before PEND: "reach destination; meet contact; establish relationship; maintain relationship"
After (relationship established): "maintain relationship"

CHECKLIST:
□ Fragments?
□ DEV = outcomes not process?
□ Sequences collapsed?
□ NEW_SCENE_RECAP items only added if not already in CURRENT_RUNNING_RECAP?
□ PEND = active goals only (no routine tasks)?
□ No stance/feelings?
□ No operational details (greeted, took to, arrived)?

Output JSON only.`;

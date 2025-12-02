// Stage 3: Filter new recap against running recap, prepare for merge
// MACROS: {{stage2_recap}}, {{current_running_recap}}, {{user}}

export const scene_recap_stage3_filtering_prompt = `TASK: Filter new scene recap against existing running recap. Output only NEW information, flag resolved threads.

================================================================================
CONTEXT
================================================================================

The running recap is injected into LLM context as the authoritative record. Every token competes with the current scene. Redundant additions waste context without adding value.

================================================================================
INPUT
================================================================================

NEW SCENE RECAP (from Stage 2):
<NEW_RECAP>
{{stage2_recap}}
</NEW_RECAP>

CURRENT RUNNING RECAP:
<RUNNING_RECAP>
{{current_running_recap}}
</RUNNING_RECAP>

User character: {{user}}

================================================================================
FILTERING RULES
================================================================================

DEVELOPMENTS (outcomes from new scene):
- DROP if already captured in running recap (same meaning = duplicate)
- KEEP outcomes that change story state beyond what's recorded
- Assign [Label] topics - use existing labels where content fits, create new only for genuinely new topics

OPEN THREADS (from new scene):
- DROP if already tracked in running recap
- FLAG AS RESOLVED if thread appears in running recap's open but new scene shows it resolved (became an outcome)
- KEEP genuinely new hooks

STATE (volatile status):
- New state REPLACES old state for same topics
- Assign [Label] topics matching the content
- DROP state items that duplicate running recap exactly

RESOLVED THREADS:
When a thread from running recap's "open" is now resolved:
- Add resolution to developments
- List the thread in "resolved" array for running-recap to handle (drop or create event entity)

================================================================================
OUTPUT FORMAT
================================================================================

{
  "developments": [
    "[Label] new outcome not in running recap",
    "[Label] another new development"
  ],
  "open": [
    "genuinely new unresolved thread",
    "another new hook"
  ],
  "state": [
    "[Label] current status (replaces old)",
    "[Label] more current status"
  ],
  "resolved": [
    "thread that was open, now resolved"
  ]
}

LABELS:
- Use [Label] prefix to organize by topic
- Match existing labels from running recap where content fits
- Create new labels for genuinely new topics
- Consolidate similar labels (e.g., [Resources] and [Supplies] → pick one)

STYLE: Telegraphic. Fragments; semicolons; no articles. Character names not titles.

Omit empty arrays. If nothing new: {"developments": [], "open": [], "state": [], "resolved": []}

Output JSON only.`;

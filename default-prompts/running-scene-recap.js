// MACROS: {{current_running_recap}}, {{filtered_recap}}

export const running_scene_recap_prompt = `TASK: Merge filtered scene recap into running recap.

================================================================================
CONTEXT
================================================================================

This recap is injected into LLM context so it knows what happened. The LLM uses it to:
- Continue the story consistently with past events
- Pick up unresolved plot threads

Every token competes with current scene. Keep tight - high-level outcomes, not blow-by-blow.

================================================================================
INPUT
================================================================================

CURRENT RUNNING RECAP:
<RUNNING_RECAP>
{{current_running_recap}}
</RUNNING_RECAP>

FILTERED NEW CONTENT (from Stage 3 - already deduplicated):
<FILTERED>
{{filtered_recap}}
</FILTERED>

================================================================================
MERGING RULES
================================================================================

DEVELOPMENTS:
- ADD new items from filtered.developments to running recap developments
- Group under existing [Labels] where content fits
- Create new [Labels] only for genuinely new topics
- Consolidate similar labels (e.g., [Resources] + [Supplies] → pick one)

OPEN THREADS:
- ADD new items from filtered.open
- REMOVE threads listed in filtered.resolved (they're done)

STATE:
- REPLACE old state with new state for matching [Labels]
- State is current status - old values are stale

RESOLVED THREADS:
For each item in filtered.resolved, decide:
- Will this be referenced later via keywords? → Create EVENT entity
- Otherwise → DROP entirely (default)

EVENT entities are minimal: just enough to recognize if mentioned later.

================================================================================
TEMPORAL CLARITY
================================================================================

Status based on ACTIONS, not time words:
- PLANNED = "assigned to," "agreed to" (discussed, no action)
- STARTED = "departed," "began," "en route" (action underway)
- COMPLETED = "returned," "delivered," "completed" (finished)

Names not titles: "Bulwark" not "guard captain"

================================================================================
OUTPUT FORMAT
================================================================================

{
  "recap": {
    "developments": [
      "[Label] facts grouped by topic",
      "[Label] more facts"
    ],
    "open": [
      "unresolved thread",
      "another hook"
    ],
    "state": [
      "[Label] current status",
      "[Label] more status"
    ]
  },
  "entities": [
    {
      "type": "event",
      "name": "Event Name",
      "keywords": ["keywords"],
      "content": ["minimal description of resolved event"]
    }
  ]
}

STYLE: Telegraphic. Fragments; semicolons; no articles. Clear temporal status.

Omit entities array if no resolved events worth keeping.

Output JSON only.`;

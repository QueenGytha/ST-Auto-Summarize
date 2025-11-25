export const scene_recap_stage1_extraction_prompt = `ROLE: Extract stated facts from transcript, then deduplicate before output. No roleplay. No inference.

OUTPUT FORMAT:
{
  "plot": [],
  "goals": [],
  "reveals": [],
  "state": [],
  "stance": [],
  "voice": [],
  "appearance": [],
  "docs": []
}

PHASE 1 - EXTRACTION (what to capture):
- plot: events/causality/outcomes (who did what, why, result)
- goals: active intentions/timers/promises/contracts (who wants what + condition)
- reveals: new information learned this scene
- state: durable location/condition changes (not fleeting positions)
- stance: relationship dynamics/boundaries/obligations per counterpart
- voice: quotes showing distinct diction/cadence (for voice preservation)
- appearance: ONE identifier per entity (name + key trait)
- docs: verbatim document contents (titles/clauses)

DROP: ambient/scenery/tone; travel steps; micro-actions; capability boilerplate; generic emotions; intimate detail unless plot-critical.

---------------- TRANSCRIPT ----------------
<TRANSCRIPT>
{{scene_messages}}
</TRANSCRIPT>

---------------- PHASE 2 - DEDUPLICATE BEFORE OUTPUT ----------------

STANCE COLLAPSING (critical):
Multiple interactions showing the SAME relational stance are redundant.

Before: [
  "A toward B: insisted on rest",
  "A toward B: refused to let B push forward",
  "A toward B: carried B to safety",
  "A toward B: promised to protect B"
]
After: [
  "A toward B: protective; prioritizes B's safety"
]
All four expressed "protective stance" → collapse to ONE summary.

QUOTE DEDUPLICATION (critical):
Quotes expressing the SAME emotional intent are duplicates regardless of wording.

Before: [
  "A: 'I'll protect you'",
  "A: 'I won't let anyone hurt you'",
  "A: 'Your safety is my priority'"
]
After: [
  "A: 'I'll protect you'"
]
All three express "protective commitment" → keep only SHORTEST.

CROSS-CATEGORY:
Each fact appears ONCE in the single best category. If "A and B are now together" is in plot, do not repeat in reveals or state.

FINAL CHECKLIST (apply before output):
□ Stance: collapsed to NET STANCE per counterpart? (not interaction history)
□ Voice: one quote per DISTINCT INTENT? (not per distinct wording)
□ No fact appears in multiple categories?
□ Appearance: max one entry per entity?

Output JSON only.`;

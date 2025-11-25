export const scene_recap_stage1_extraction_prompt = `ROLE: Extract reconstruction signals. Messages will be REMOVED; output = minimum anchors for LLM continuity. LLMs fill gaps; capture signal, not exhaustive detail.

OUTPUT:
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

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A betrayed B by revealing the secret to C, causing alliance collapse"
Fragment: "A betrayed B; revealed secret to C; alliance collapsed"

WHAT TO CAPTURE (fragments):
- plot: outcomes (who/what/result)
- goals: intentions (who wants what + condition)
- reveals: new facts
- state: durable changes only
- stance: relationship dynamics per counterpart (stance + debts/boundaries/pivots/promises/tension)
- voice: distinctive quotes verbatim (full)
- appearance: one per entity (name + trait)
- docs: verbatim (full)

DROP: ambient; travel; micro-actions; boilerplate; generic emotions; process where outcome suffices.

---------------- TRANSCRIPT ----------------
<TRANSCRIPT>
{{scene_messages}}
</TRANSCRIPT>

---------------- DEDUPLICATE BEFORE OUTPUT ----------------

STANCE COLLAPSING:
Collapse repetitive EXAMPLES of same stance; preserve DYNAMICS that define the relationship.

Before (interaction list): "A->B: insisted rest; refused push; carried to safety; promised protection; insisted rest again"
After (stance + dynamics): "A->B: protective; promised safety"

KEEP relationship texture: debts/obligations; boundaries; leverage; trust pivots; promises; unresolved tension.
DROP repetitive demonstrations of same stance.

QUOTE DEDUPLICATION:
Same intent = duplicate. Keep shortest.
Before: "A: 'I'll protect you'; 'Won't let anyone hurt you'"
After: "A: 'I'll protect you'"

STATE SUPERSESSION:
Current only; drop progression.
Before: "injured; recovering; healed"
After: "healed"

CROSS-CATEGORY:
Each fact ONCE in best category.

CHECKLIST:
□ Fragments? (except quotes/docs)
□ Stance = net stance per counterpart?
□ One quote per intent?
□ State = current only?
□ No cross-category repeats?

Output JSON only.`;

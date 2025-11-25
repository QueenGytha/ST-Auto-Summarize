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

DEDUPLICATION PHILOSOPHY (critical):
ONE REPRESENTATIVE EXAMPLE per behavior/trait/outcome. NOT multiple examples.
Different wording expressing SAME THING = duplicate. Drop all but one.
Ask: "What CHARACTER INFORMATION does this convey?" Same info = duplicate.

WHAT TO CAPTURE (fragments):
- plot: outcomes (who/what/result) - NOT blow-by-blow sequence
- goals: intentions (who wants what + condition)
- reveals: new facts
- state: durable changes only
- stance: relationship dynamics per counterpart (stance + debts/boundaries/pivots/promises/tension)
- voice: distinctive quotes verbatim (full) - ONE per character behavior
- appearance: one per entity (name + trait)
- docs: verbatim (full)

DROP: ambient; travel; micro-actions; boilerplate; generic emotions; process where outcome suffices.

---------------- TRANSCRIPT ----------------
<TRANSCRIPT>
{{scene_messages}}
</TRANSCRIPT>

---------------- DEDUPLICATE BEFORE OUTPUT ----------------

PLOT DEDUPLICATION (aggressive):
Capture OUTCOMES, not blow-by-blow sequences. Plot should be 3-6 items for most scenes.

Ask for EACH plot item: "Is this a RESULT or a STEP toward a result?"
STEP → merge into the result it leads to. RESULT → keep.

COLLAPSE ENTIRE SEQUENCES into single outcomes:
Before (12 items - BAD):
"A entered room; A confronted B; A demanded answers; B refused; A threatened B; B revealed secret; A reacted angrily; A attacked B; B defended; A overpowered B; A interrogated B; B confessed everything"

After (2 items - GOOD):
"A confronted B; B initially refused"
"A overpowered B; extracted full confession"

Before (8 items - BAD):
"A approached B; A expressed feelings; B was surprised; B considered; B accepted; they embraced; they kissed; they agreed to relationship"

After (1 item - GOOD):
"A confessed to B; B accepted; began relationship"

KEEP plot items that represent DISTINCT outcomes (decisions, revelations, major state changes).
MERGE plot items that are steps in the same sequence.

STANCE COLLAPSING:
Collapse repetitive EXAMPLES of same stance; preserve DYNAMICS that define the relationship.

Before (interaction list): "A->B: insisted rest; refused push; carried to safety; promised protection; insisted rest again"
After (stance + dynamics): "A->B: protective; promised safety"

KEEP relationship texture: debts/obligations; boundaries; leverage; trust pivots; promises; unresolved tension.
DROP repetitive demonstrations of same stance.

QUOTE DEDUPLICATION (aggressive):
ONE quote per CHARACTER BEHAVIOR per entity. NOT one per wording variation.
Different words expressing SAME BEHAVIOR = duplicate. Keep ONE.

Ask for EACH quote: "What CHARACTER BEHAVIOR does this demonstrate?"
If another quote already demonstrates that behavior → DROP this one.

Before: "A: 'Please don't go'; 'I'll do anything'; 'Don't leave me'; 'I'm begging you'"
All 4 demonstrate SAME BEHAVIOR (A begs desperately). After: "A: 'Please don't go'"

Before: "B: 'You're worthless'; 'Pathetic creature'; 'Know your place'; 'Bow before me'"
All 4 demonstrate SAME BEHAVIOR (B is degrading/dominant). After: "B: 'You're worthless'"

Before: "C: 'It feels amazing'; 'Nothing compares'; 'Don't stop'; 'More, I need more'"
All 4 demonstrate SAME BEHAVIOR (C experiences pleasure). After: "C: 'It feels amazing'"

KEEP a quote ONLY if it reveals a DIFFERENT behavior not shown by other quotes from same character.
Example of DIFFERENT behaviors worth keeping separately:
- "A: 'I'll kill you'" (threat) vs "A: 'I'm sorry'" (remorse) = different behaviors, keep both

STATE SUPERSESSION:
Current only; drop progression.
Before: "injured; recovering; healed"
After: "healed"

CROSS-CATEGORY:
Each fact ONCE in best category.

CHECKLIST:
□ Fragments? (except quotes/docs)
□ Plot = outcomes not blow-by-blow?
□ Stance = net stance per counterpart?
□ One quote per CHARACTER BEHAVIOR per entity?
□ State = current only?
□ No cross-category repeats?

Output JSON only.`;

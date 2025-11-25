// MACROS: {{existing_content}}

export const lorebook_entry_compaction_prompt = `ROLE: Compact setting_lore entry. RECONSTRUCTION SIGNAL; minimum anchors for LLM continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has become protective of B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

DEDUPLICATION PHILOSOPHY (critical):
ONE REPRESENTATIVE EXAMPLE per behavior/trait/outcome. NOT multiple examples.
Different wording expressing SAME THING = duplicate. Drop all but one.
Ask: "What CHARACTER INFORMATION does this convey?" Same info = duplicate.

CONTEXT: Model sees content only (no title/type). Use explicit names.

OUTPUT:
{
  "compactedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

FACETS (fragments; only when shown):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics (debts/boundaries/pivots/promises/tension) | Voice: cadence cues | Notable dialogue: verbatim (full) | Secrets/Tension: if consequential | Keywords: 0-6 tokens | Locations: Parent-Subarea

---------------- ENTRY ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- COMPRESS BEFORE OUTPUT ----------------

RELATIONSHIP COLLAPSING (aggressive):
Collapse interaction sequences into STANCE + DYNAMICS. NOT blow-by-blow.

Ask for EACH relationship item: "Is this a DYNAMIC or a STEP in an interaction?"
STEP → collapse into the dynamic it demonstrates. DYNAMIC → keep.

Before (blow-by-blow - BAD):
"A->B: kissed; undressed; penetrated; carried while thrusting; forced climax; withdrew"

After (stance + dynamics - GOOD):
"A->B: dominant/intimate dynamic"

Before (blow-by-blow - BAD):
"A->B: defended against C; agreed to arrangement; staged cover; established connection; participated in examination; tested transmission; first kiss taken; offered experiment"

After (stance + dynamics - GOOD):
"A->B: allied; established connection; offered intimacy as experiment"

KEEP: stance; debts/obligations; boundaries; leverage; trust pivots; promises; unresolved tension.
DROP: interaction sequences; blow-by-blow physical details; redundant demonstrations of same stance.

STATE COLLAPSING (aggressive):
DURABLE states only. Drop operational/transient details.

Before (includes transient - BAD):
"door locked/barred; curtains closed; crop nearby; four-way arrangement established; Gift awakened"

After (durable only - GOOD):
"four-way arrangement established; Gift awakened"

Ask: "Will this still be true next scene?" NO → drop it.

TRIGGERS DEDUPLICATION (aggressive):
ONE representative per BEHAVIORAL PATTERN. NOT multiple phrasings.

Ask for EACH trigger: "What BEHAVIORAL PATTERN does this express?"
If another trigger already expresses that pattern → DROP this one.

Before (multiple phrasings of same pattern - BAD):
"size up everyone for potential; cultivate multiple relationships; teenage spy network; strike alliance with staff; create layers of gossip"

All 5 express SAME PATTERN (strategic network builder). After (ONE representative - GOOD):
"strategic network builder; cultivates relationships for tactical purposes"

KEEP triggers that express DIFFERENT behavioral patterns.

QUOTE DEDUPLICATION (aggressive):
ONE quote per CHARACTER BEHAVIOR per entity. NOT one per wording variation.
Different words expressing SAME BEHAVIOR toward same entity = duplicate. Keep ONE.

Ask for EACH quote: "What CHARACTER BEHAVIOR does this demonstrate? Toward whom?"
If another quote already demonstrates that behavior toward same entity → DROP this one.

Before: "'Please don't go'; 'I'll do anything'; 'Don't leave me'" (all to B)
All 3 demonstrate SAME BEHAVIOR (begging) toward same entity. After: "'Please don't go'"

KEEP quotes that reveal DIFFERENT behaviors OR same behavior toward DIFFERENT entities.

CROSS-FACET:
Each idea once in best facet.

CHECKLIST:
□ Fragments? (except quotes)
□ Relationships = stance + dynamics (not blow-by-blow)?
□ State = durable only (not transient/operational)?
□ Triggers = one per behavioral pattern?
□ One quote per CHARACTER BEHAVIOR per entity?
□ Cross-facet duplicates removed?
□ canonicalName = proper name or null (no titles)

Output JSON only.`;

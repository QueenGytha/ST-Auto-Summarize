// MACROS: {{existing_content}}

export const lorebook_entry_compaction_prompt = `ROLE: Compact setting_lore entry. RECONSTRUCTION SIGNAL; minimum anchors for LLM continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has become protective of B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

DEDUPLICATION (critical):
For each item, ask: "Is this already shown by another item?"
- If YES → remove it (keep the more distinctive one)
- If NO → keep it
Same information in different words = duplicate. Remove duplicates.

CONTEXT: Model sees content only (no title/type). Use explicit names.

OUTPUT:
{
  "compactedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

FACETS (fragments; only when shown):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics (debts/boundaries/pivots/promises/tension) | Voice: cadence cues | Notable dialogue: verbatim (full) | Secrets/Tension: if consequential | Keywords: ENTITY REFERENCES ONLY (names/titles/aliases for lorebook activation; NOT states/adjectives) | Locations: Parent-Subarea

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
Duplicates = same behavior ABOUT the same thing. Different wording doesn't make it unique.

Before: "'Help me or leave me to die'; 'Refuse and I'll kick down the doors'; 'The healer, no one else'"
All 3 = demanding medical help. Same behavior, same subject. Duplicates.

NOT duplicates:
- "'I killed your father'" vs "'The treasure is under the church'" - both revealing, but different information

Ask: "Same action about the same thing?" YES → duplicate.

KEYWORD RULES (critical):
Keywords = ACTIVATION TRIGGERS for lorebook. Terms that REFER TO this entity.
CORRECT: character names, nicknames, titles, aliases, species, role names
WRONG: emotional states, adjectives, actions, experiences, feelings

Before (BAD): "protective, exhausted, fierce-protection, flustered, resigned, sleeping, inevitable"
After (GOOD): "Senta, white mare, Companion, silver hooves"

STRIP ALL non-reference keywords. Keep ONLY names/titles/aliases that someone would use to refer to this entity.

CROSS-FACET:
Each idea once in best facet.

CHECKLIST:
□ Fragments? (except quotes)
□ Relationships = stance + dynamics (not blow-by-blow)?
□ State = durable only (not transient/operational)?
□ Triggers = one per behavioral pattern?
□ Quotes = one per CHARACTER BEHAVIOR?
□ Keywords = entity references only (names/titles), NOT states/adjectives?
□ Cross-facet duplicates removed?
□ canonicalName = proper name or null (no titles)

Output JSON only.`;

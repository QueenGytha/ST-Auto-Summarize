// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Merge setting_lore entry. RECONSTRUCTION SIGNAL; minimum anchors for character/relationship continuity. Output JSON only.

TOKEN CONSERVATION (critical):
Fragments; semicolons; no articles/filler.

Sentence: "A has become protective of B and prioritizes B's safety"
Fragment: "A->B: protective; prioritizes safety"

DEDUPLICATION PHILOSOPHY (critical):
ONE REPRESENTATIVE EXAMPLE per behavior/trait/outcome. NOT multiple examples.
Different wording expressing SAME THING = duplicate. Drop all but one.
Ask: "What CHARACTER INFORMATION does this convey?" Same info = duplicate.

OUTPUT:
{
  "mergedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

SUBJECT LOCK: Entry = {{entry_name}}. Other entities → Relationships only.

MERGE:
- EXISTING is the baseline
- For each item in NEW, ask: "Does EXISTING already show this?"
  - YES, and EXISTING version is as good or better → skip NEW item
  - YES, but NEW version is more distinctive → REPLACE the EXISTING item with NEW
  - NO → add NEW item
- This applies to quotes, triggers, relationship details - everything

FACETS (fragments; only when shown):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics (debts/boundaries/pivots/promises/tension) | Voice: cadence cues | Notable dialogue: verbatim (full) | Secrets/Tension: if consequential | Keywords: ENTITY REFERENCES ONLY (names/titles/aliases that refer TO this entity for lorebook activation; NOT emotional states, NOT adjectives, NOT experiences)

---------------- EXISTING ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- NEW ----------------
<NEW_CONTENT>
{{new_content}}
</NEW_CONTENT>

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

Before: "'You've cost me everything'; 'I trusted you'; 'This is how you repay me'"
All 3 = accusing someone of betrayal. Same behavior, same subject. Duplicates.

NOT duplicates:
- "'I killed your father'" vs "'The treasure is under the church'" - both revealing, but different information
- "'I'll destroy you'" (to enemy) vs "'Touch her and die'" (protecting someone) - different subjects

Ask: "Same action about the same thing?" YES → duplicate.

KEYWORD RULES (critical):
Keywords = ACTIVATION TRIGGERS for lorebook. Terms that REFER TO this entity.
CORRECT: character names, nicknames, titles, aliases, species, role names
WRONG: emotional states, adjectives, actions, experiences, feelings

Before (BAD - states/experiences): "protective, exhausted, fierce-protection, flustered, resigned, sleeping"
After (GOOD - entity references): "Senta, white mare, Companion, silver hooves"

Before (BAD - adjectives): "loyal, brave, cunning, protective-guard, inevitable"
After (GOOD - what they're called): "Captain Varis, the Captain, Varis, scarred veteran"

NEVER include: emotional states, personality traits, actions taken, things experienced, hyphen variants of same word.

CROSS-FACET:
Each idea once in best facet.

CHECKLIST:
□ Fragments? (except quotes)
□ Relationships = stance + dynamics (not blow-by-blow)?
□ State = durable only (not transient/operational)?
□ Triggers = one per behavioral pattern?
□ Quotes = one per CHARACTER BEHAVIOR?
□ Keywords = entity references only (names/titles/aliases), NOT states/adjectives?
□ Cross-facet duplicates removed?
□ canonicalName = proper name or null (no titles)

Output JSON only.`;

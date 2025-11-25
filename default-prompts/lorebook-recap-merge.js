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

MERGE (EXISTING_CONTENT is the baseline):
- For each item in NEW_CONTENT, ask: "Does EXISTING_CONTENT already show this?"
  - YES, and EXISTING_CONTENT version is as good or better → skip NEW_CONTENT item
  - YES, but NEW_CONTENT version is more distinctive → REPLACE the EXISTING_CONTENT item
  - NO → add NEW_CONTENT item
- This applies to quotes, triggers, relationship details, appearance - everything

FACETS (fragments; only when shown):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics (debts/boundaries/pivots/promises/tension) | Voice: cadence cues | Notable dialogue: verbatim (full) | Secrets/Tension: if consequential | Keywords: ENTITY REFERENCES ONLY (names/titles/aliases that refer TO this entity for lorebook activation; NOT emotional states, NOT adjectives, NOT experiences)

---------------- EXISTING_CONTENT ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- NEW_CONTENT ----------------
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

QUOTES = VOICE SIGNAL (critical):
Purpose: Help LLM reconstruct HOW this character speaks (cadence, style, tone).
NOT for: Recording what they said (content goes in other facets).

If EXISTING_CONTENT has a quote → only add NEW quote if it shows a DIFFERENT voice pattern.
Same voice pattern in different words = duplicate.

Voice patterns: commanding, pleading, philosophical, threatening, tender, formal, casual, etc.
If existing quote shows "commanding" and new quote also shows "commanding" → skip new quote.

Test: "Does this quote teach the LLM something NEW about how this character speaks?"
NO → skip. YES → keep.

APPEARANCE DEDUPLICATION (NEW_CONTENT vs EXISTING_CONTENT):
If EXISTING_CONTENT already describes a physical trait → skip poetic rewordings.

EXISTING_CONTENT has: "brilliant white; silver hooves; sapphire eyes"
NEW_CONTENT has: "coat gleams like polished silver in moonlight"
"brilliant white" already covers coat color. SKIP the NEW_CONTENT description.

Only add appearance if it's a NEW physical feature not already described.

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
□ Quotes = one per VOICE PATTERN (not per topic)?
□ Keywords = entity references only (names/titles/aliases), NOT states/adjectives?
□ Cross-facet duplicates removed?
□ canonicalName = proper name or null (no titles)

Output JSON only.`;

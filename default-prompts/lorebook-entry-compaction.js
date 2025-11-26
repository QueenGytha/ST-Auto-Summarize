// MACROS: {{existing_content}}

export const lorebook_entry_compaction_prompt = `ROLE: Compact setting_lore entry by removing duplicates and redundancy.

DEDUPLICATION (enforce before output):
- QUOTES: One per VOICE PATTERN. Same pattern, different words → DROP all but most distinctive.
- RELATIONSHIPS: Collapse to stance + dynamics. Blow-by-blow steps → DROP.
- STATE: Durable only. "Will this still be true next scene?" NO → DROP.
- TRIGGERS: One per behavioral pattern. Multiple phrasings → DROP all but one.
- CROSS-FACET: Each idea once in best facet. Duplicates across facets → DROP.

OUTPUT:
{
  "compactedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

STYLE: Fragments; semicolons; no articles/filler. Quotes verbatim.

CONTEXT: Model sees content only (no title/type during roleplay). Use explicit names.

FACETS (fragments; only when shown):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics | Voice: cadence cues | Notable dialogue: verbatim | Secrets/Tension: if consequential

KEYWORDS: Names/titles/aliases that REFER TO this entity. NOT adjectives, NOT emotional states, NOT actions.

---------------- ENTRY ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- COMPACTION LOGIC ----------------

RELATIONSHIP COLLAPSING:
Before: "A->B: sat together; talked for hours; shared secrets; made plans"
After: "A->B: close; confided in each other"

QUOTE TEST:
Ask: "What VOICE PATTERN does this quote demonstrate?"
If another quote already shows that pattern → DROP one of them.
Patterns: commanding, pleading, philosophical, threatening, tender, vulnerable, defiant, sarcastic, etc.

STATE TEST:
Ask: "Will this still be true next scene?"
NO → DROP. (scheduled meetings, temporary conditions, current location)
YES → KEEP. (relationship status, major changes, secrets learned)

TRIGGER TEST:
Ask: "What BEHAVIORAL PATTERN does this express?"
If another trigger expresses same pattern → DROP one.
Before: "always watches exits; checks for followers; sits facing door; notes escape routes"
After: "hypervigilant; security-conscious"

KEYWORD TEST:
Ask: "Would someone use this word to REFER TO this entity?"
NO → DROP. (angry, tired, protective, worried)
YES → KEEP. (names, titles, nicknames, species, roles)

Output JSON only.`;

// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Merge setting_lore entry. EXISTING_CONTENT is baseline. Add from NEW_CONTENT only what's genuinely new.

DEDUPLICATION (enforce before output):
- QUOTES: If EXISTING has a quote showing this voice pattern → DROP the new quote. Same pattern, different words = duplicate.
- RELATIONSHIPS: Collapse to stance + dynamics. Blow-by-blow steps → DROP. Keep: debts, boundaries, pivots, promises, tension.
- STATE: Durable only. "Will this still be true next scene?" NO → DROP.
- TRIGGERS: One per behavioral pattern. Multiple phrasings of same pattern → DROP all but one.
- APPEARANCE: If EXISTING describes trait → DROP poetic rewordings.

OUTPUT:
{
  "mergedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

STYLE: Fragments; semicolons; no articles/filler. Quotes verbatim.

SUBJECT LOCK: Entry = {{entry_name}}. Other entities → Relationships only.

FACETS (fragments; only when shown):
Identity <=10 words | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics | Voice: cadence cues | Notable dialogue: verbatim | Secrets/Tension: if consequential

---------------- EXISTING_CONTENT ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- NEW_CONTENT ----------------
<NEW_CONTENT>
{{new_content}}
</NEW_CONTENT>

---------------- MERGE LOGIC ----------------

For each item in NEW_CONTENT:
1. Ask: "Does EXISTING_CONTENT already show this?"
   - YES, EXISTING version is adequate → DROP new item
   - YES, but NEW is more distinctive → REPLACE existing
   - NO → ADD new item

RELATIONSHIP COLLAPSING:
Before: "A->B: held hand; hugged; kissed; stayed overnight"
After: "A->B: intimate"

QUOTE TEST:
Ask: "What VOICE PATTERN does this quote demonstrate?"
If EXISTING already has a quote showing that pattern → DROP the new quote.
Patterns: commanding, pleading, philosophical, threatening, tender, vulnerable, defiant, sarcastic, etc.

STATE TEST:
Ask: "Will this still be true next scene?"
NO → DROP. (scheduled meetings, temporary pain, current location)
YES → KEEP. (relationship changes, major status changes, learned secrets)

Output JSON only.`;

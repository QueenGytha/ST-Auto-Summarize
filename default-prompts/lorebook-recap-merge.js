// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Merge setting_lore entry. EXISTING_CONTENT is baseline. Default action is DROP from NEW_CONTENT unless it clearly earns inclusion.

============ FILTERING (MOST IMPORTANT - APPLY FIRST) ============

Entries bloat over time. Your job is aggressive filtering, not comprehensive merging.

For EACH item in NEW_CONTENT, ask: "Does this earn its tokens given what EXISTING already has?"

QUOTES - hardest filter:
- Does EXISTING already show how this character talks? If yes, NEW quote must be significantly more distinctive to replace it, otherwise DROP.
- Two quotes with similar energy (both stubborn, both sarcastic, both tender) = keep the better one, DROP the other.
- Quote earns inclusion ONLY if: distinctive mannerism not already shown, OR plot-critical line that will be referenced.
- Generic dialogue that anyone could say → DROP.
- When uncertain → DROP.

STATE/FACTS:
- "Will this still be true next scene?" NO → DROP.
- EXISTING already covers this concept? → DROP unless NEW is more precise.

RELATIONSHIPS:
- Collapse to stance + dynamics. Blow-by-blow progression → DROP.
- Keep: debts, boundaries, pivots, promises, tension.

APPEARANCE:
- EXISTING describes this? → DROP unless NEW is more accurate/distinctive.

TRIGGERS:
- Multiple phrasings of same behavioral pattern → keep clearest one, DROP rest.

==========================================================================

OUTPUT:
{
  "mergedContent": "fragment content",
  "canonicalName": "ProperName or null"
}

STYLE: Fragments; semicolons; no articles/filler. Quotes verbatim.

SUBJECT LOCK: Entry = {{entry_name}}. Other entities → Relationships only.

FACETS (fragments; only when shown):
Identity: concise | Appearance: distinctive | State: current only | Capabilities: demonstrated | Triggers: trigger->response | Relationships: stance + dynamics | Voice: cadence cues | Notable dialogue: verbatim | Secrets/Tension: if consequential

---------------- EXISTING_CONTENT ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- NEW_CONTENT ----------------
<NEW_CONTENT>
{{new_content}}
</NEW_CONTENT>

Output JSON only.`;

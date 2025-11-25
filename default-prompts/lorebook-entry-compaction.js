// Standalone compaction prompt for deduping a lorebook entry (no merge). Returns the rewritten entry.
export const lorebook_entry_compaction_prompt = `ROLE: Compact a single setting_lore entry by removing duplicates and redundancy. No roleplay. No explanations. Output JSON only (starts { ends }).

Goal: shortest non-overlapping version preserving all distinct traits/relationships/voice.

CONTEXT RULE:
- Model only sees content text during roleplay (no title/type/keywords). Keep output self-contained with explicit names, not pronouns.

COMPACTION RULES:
- Compact fragments; semicolons; no prose/bullets/filler.
- SAME-INTENT TEST: lines expressing the same idea/stance are duplicates regardless of wording—keep shortest.
- Cross-facet dedupe: each idea appears once in single most relevant facet.
- Quotes: only unique vows/triggers/voice samples with brief context; no {{user}} quotes; one quote per distinct intent.

FACET GUIDE (include only when shown; omit empty):
- Identity/Synopsis: <=10 words; role if needed.
- Appearance: only distinctive, referenced.
- State: current only. New state REPLACES old—don't accumulate.
- Capabilities: demonstrated and consequential, including limits.
- Behavioral triggers: trigger -> response -> outcome.
- Relationships: NET STANCE per counterpart, not interaction history. Collapse redundant interactions to single summary. Keep every counterpart represented.
- Intimacy/Aftercare: only if explicitly shown; direct language, no euphemisms.
- Voice/Mannerisms: distinctive diction/cadence/quirks.
- Notable dialogue: verbatim + brief context; no {{user}}.
- Secrets/Leverage/Tension: only if consequential and shown.
- Entity/location naming: subareas use "Parent-Subarea"; include "Located in: Parent" when applicable.

PRE-FLIGHT:
- All duplicates/near-duplicates merged?
- Cross-facet redundancy removed?
- One line per counterpart with all sentiments merged?
- Quotes unique with context?

OUTPUT (JSON only; no code fences):
{
  "compactedContent": "deduped entry in compact fragment/semicolon lines",
  "canonicalName": "ProperName or null"
}

canonicalName rules:
- Use proper name if available; else first name; else null.
- Omit titles/honorifics/ranks (use "Elizabeth" not "Queen Elizabeth").

// ENTRY TO COMPACT:
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>`;

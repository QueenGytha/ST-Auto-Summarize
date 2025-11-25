// Auto-Lorebooks Recap Merge Prompt
//
// REQUIRED MACROS:
// - {{existing_content}} (alias {{current_content}})
// - {{new_content}} (alias {{new_update}})
// - {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Merge an existing setting_lore entry with new scene info. No roleplay. No explanations. Output JSON only (starts { ends }). Analyze only; never continue the story.

Purpose: keep the entry token-lean while preserving demonstrated traits/voice/relationships once messages are gone. Only use info shown; no guesses/inner thoughts.

OUTPUT:
{
  "mergedContent": "compact fragment/semicolon lines",
  "canonicalName": "ProperName or null"
}

SUBJECT LOCK: The entry subject is fixed to {{entry_name}}. If NEW_CONTENT describes another entity, convert that info into a Relationships line for that counterpart; never merge another entity's attributes into this one.

MERGE RULES:
- Dedupe EXISTING_CONTENT first, then merge NEW_CONTENT. Output final merged result only.
- Compact fragments; semicolons; no prose/bullets/filler. Keep only demonstrated facets.
- If multiple lines express the same idea, keep ONE shortest phrasing. Do NOT paraphrase unchanged facts.
- SAME-INTENT TEST: lines expressing the same stance/intent are duplicates regardless of wording—keep shortest.
- New info that overlaps existing: keep ONE clearest phrasing (favor verbatim over paraphrase).
- Quotes: only vows/triggers/voice samples with minimal context (speaker/target/situation). No {{user}} quotes. One quote per distinct intent, not per distinct wording.

FACET GUIDE (include only when shown and consequential):
- Identity/Synopsis: <=10 words; role if needed.
- Appearance: only distinctive, referenced.
- State: current only. New state REPLACES old (e.g., "recovered" replaces "injured").
- Capabilities: demonstrated and consequential, including limits.
- Behavioral triggers: trigger -> response -> outcome.
- Relationships: NET STANCE per counterpart, not interaction history. Collapse redundant interactions to single summary. Only separate fragments for genuinely distinct stances or pivotal changes.
- Intimacy/Aftercare: only if explicitly shown; change-only.
- Voice/Mannerisms: distinctive diction/cadence/quirks; keep unique cues.
- Notable dialogue: verbatim + brief context; no {{user}}.
- Secrets/Leverage/Tension: only if consequential and shown.
- Do NOT repeat recap events; keep only resulting state/traits.
- Keywords (if present): 0-6 canonical/alias tokens actually used; lowercase; dedupe.

PRE-FLIGHT:
- Subject unchanged; canonicalName = entry_name (if proper name) or null. Never another entity.
- Omit titles/honorifics/ranks from canonicalName (use "Elizabeth" not "Queen Elizabeth").

// EXISTING ENTRY: dedupe this first
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

// NEW INFO: merge into deduped existing
<NEW_CONTENT>
{{new_content}}
</NEW_CONTENT>`;

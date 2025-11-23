// Auto-Lorebooks Recap Merge Prompt
//
// REQUIRED MACROS:
// - {{existing_content}} (alias {{current_content}})
// - {{new_content}} (alias {{new_update}})
// - {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Merge an existing setting_lore entry with new scene info. No roleplay. No explanations. Output JSON only (starts { ends }). Analyze only; never continue the story.

Purpose: keep the entry token-lean while preserving demonstrated traits needed to recreate behavior/voice/relationships once messages are gone. Only use info shown; no guesses/inner thoughts.

OUTPUT:
{
  "mergedContent": "compact fragment/semicolon lines",
  "canonicalName": "ProperName or null"
}

UID handling is upstream; do NOT invent or alter.

TWO-STEP MERGE (do both; output final only)

STEP 1: Deduplicate EXISTING_CONTENT
- Rewrite into compact fragment lines (no prose, no bullets). Semicolons; no filler.
- Keep only demonstrated facets; drop generic personality fluff. If any facet repeats the same idea, merge to one minimal line.
- Keep per-facet uniqueness: Identity, Appearance, State, Capabilities/limits, Behavioral triggers, Relationships (per counterpart), Intimacy/Aftercare (if present), Voice/Mannerisms, Notable dialogue, Secrets/Leverage. Remove Psychology/Micro-Moments/consent boilerplate if present unless explicitly shown.
- Quotes: keep only unique vows/triggers/voice samples; drop paraphrases; no {{user}} quotes.
- Use this deduped set for Step 2; do not emit it separately.

EXISTING_CONTENT:
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

STEP 2: Merge in NEW_CONTENT
- Compare NEW_CONTENT to the deduped set; update changed facts; add only new facets; do not reintroduce overlaps or generic fluff.
- Normalize NEW_CONTENT to compact fragment lines; merge into existing lines when similar.
- Keep causal clarity for history (e.g., promise -> consequence) only if relevant to behavior/stance.
- Only include facets if referenced in NEW_CONTENT or already present and updated.
- Quotes: only vows/triggers/voice samples; keep unique; no labels; no {{user}} quotes.

NEW_CONTENT:
<NEW_CONTENT>
{{new_content}}
</NEW_CONTENT>

FACET GUIDE (include only when shown and consequential; skip if unchanged):
- Identity/Synopsis: <=10 words; role if needed.
- Appearance: only distinctive, referenced.
- State: observed location/condition (as seen), terse.
- Capabilities/limits: demonstrated and consequential.
- Behavioral triggers/defaults: trigger -> response -> outcome that affects future behavior.
- Relationships: per counterpart, demonstrated stance/promise/debt/leverage; include trigger/outcome of change; keep one minimal line per counterpart.
- Intimacy/Aftercare: only if explicitly shown; kinks/turn-ons; hard/soft limits; aftercare/comfort; explicit, change-only.
- Voice/Mannerisms: diction/cadence/quirks/catchphrases/body-language that define voice; keep unique cues.
- Notable dialogue: one-line vows/triggers/voice samples only; verbatim; no paraphrase; no {{user}}.
- Secrets/Leverage: only if consequential and shown.
- Do NOT repeat recap events; keep only the resulting state/traits.

PRE-FLIGHT (before output):
- Overlaps merged? No duplicated ideas within or across facets?
- Only demonstrated info; no guessed emotions/inner thoughts.
- Compact fragments; semicolons; no filler words.
- Quotes unique and minimal; no {{user}} quotes.
- Every counterpart present in either source still represented at least once if relevant; none invented.

canonicalName rules:
- Use full proper name if available (prefer entry_name if it is a proper name); else first name; else null.

OUTPUT JSON only.`;

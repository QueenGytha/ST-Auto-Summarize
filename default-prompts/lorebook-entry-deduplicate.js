// REQUIRED MACROS:
// - {{lorebook_entry_types}} - List of allowed entity types
// - {{new_entry}} - New entry candidate JSON
// - {{lorebook_entry_lookup_synopsis}} - Synopsis from Stage 1
// - {{candidate_entries}} - Candidate entries with full content

export const auto_lorebook_entry_deduplicate_prompt = `You are the setting_lore duplicate resolver for SillyTavern.
Your task is to resolve duplicate entries by matching or creating new entries, outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "resolvedUid": "<existing entity uid or \\"new\\">",
  "duplicateUids": ["<uid1>", "<uid2>"],
  "synopsis": "<updated one-line recap for the canonical entity>"
}

CRITICAL: Ensure your response begins with the opening curly brace { character

Known setting_lore entry types:
<SETTING_LORE_ENTRY_TYPES>
{{lorebook_entry_types}}
</SETTING_LORE_ENTRY_TYPES>

The Stage 1 lookup flagged possible duplicates and requested full context. You must make the final decision.

New entry candidate:
<NEW_ENTRY>
{{new_entry}}
</NEW_ENTRY>

Stage 1 synopsis:
<SYNOPSIS>
{{lorebook_entry_lookup_synopsis}}
</SYNOPSIS>

Candidate setting_lore entries (full content, JSON array):
<CANDIDATE_ENTRIES>
{{candidate_entries}}
</CANDIDATE_ENTRIES>

Rules:
- Validate the new candidate is a single entity and the content uses bullet points with an identity bullet first.
- Validate content uses specific names (not pronouns or vague references).
- If none of the candidates match, set the resolvedUid field to "new".
- When choosing an existing entity, pick the UID that truly represents the same subject and merge the newest facts into it.
- If the candidate adds nothing new, keep the existing content and synopsis; do not fabricate alternate copies.
- Prefer the candidate whose Relationships and State most closely match the new dynamic snapshot and current status; consolidate into a single canonical entry rather than splitting near-duplicates.
- Entity type normalization: If multiple candidates differ only by type for an unnamed collective (e.g., "thugs"), prefer "faction" over "character" when the group is a recurring hazard tied to a location; otherwise treat it as ephemeral and resolve as "new" only if truly durable.
- Deterministic tie‑breaker: If any candidate's canonical name exactly matches the new candidate's canonical name (case-insensitive, punctuation-insensitive, ignoring type prefix), choose that UID over others.
- For locations: if the candidate is a sub‑area, prefer the entry whose name or content indicates the same parent; normalize to "Parent-Subarea" canonical naming and ensure a "Located in: <Parent>" bullet exists. For multiple levels, normalize to hyphen chain ("Parent-Child-Grandchild") and include the immediate parent link.
- For character entities with Quotes bullets: When merging, compare quotes; remove exact duplicates; preserve relationship-defining quotes that capture commitments or pivotal moments; maintain recipient/context.
- Do NOT fabricate bullets to satisfy a template; when details are not present, omit that bullet entirely (e.g., no Relations for a faction if none are stated yet).
- Ensure the returned synopsis reflects the most current canon after reconciliation (concise, one line).
- duplicateUids array: If multiple candidates represent the SAME entity (true duplicates of the same character/location/etc, not just similar), list the OTHER UIDs (excluding resolvedUid) in the duplicateUids array. These entries will be consolidated and deleted. Only include UIDs that are genuinely the same entity with overlapping information. Use [] when no duplicates exist.
- The duplicateUids field must be an array. Do not include the resolvedUid itself in this array.
- Output STRICT JSON with double quotes and no commentary.`;

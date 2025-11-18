// Auto-Lorebooks Recap Merge Prompt
//
// REQUIRED MACROS:
// - {{existing_content}} - Existing entry content (also aliased as {{current_content}})
// - {{new_content}} - New content to merge (also aliased as {{new_update}})
// - {{entry_name}} - Entry name for name resolution

export const auto_lorebook_recap_merge_prompt = `You are updating a lorebook entry. You have the existing entry content and new information from a recap.

Current Entry Name: {{entry_name}}

⚠️ CRITICAL: ONLY THE CONTENT IS INJECTED INTO THE AI'S CONTEXT ⚠️
The AI will NEVER see the entry title, type, or keywords — it ONLY sees the content text during roleplay.
Therefore, merged content MUST be self-contained and use specific names and references.
Do NOT use pronouns or vague references ("him", "her", "it", "the protagonist"). Use specific names ("Alice", "{{user}}", "Sunblade sword", "Shadow Guild", "Marcus").

Target format (bullet style; no PList):
- Identity: <Type> — <Canonical Name>
- Synopsis: <1 line identity/purpose>
- Attributes: <appearance/traits/capabilities>
- Relationships: <X ↔ Y — dynamic snapshot (tone, patterns, salient past interactions); brief evidence or short quote if helpful>
- State: <status/location/owner/ongoing effects>
- Secrets/Leverage: <what/who knows>
- Tension/Triggers: <what escalates/defuses>
- Style Notes: <voice/tone anchors>

Location naming (subareas):
- If this entry is a sub‑location within a named parent (e.g., Cloudsdale → Rainbow Dash's Cloud House; Ponyville → Twilight's Library),
  the canonical name SHOULD be "Parent-Subarea" and the Identity bullet MUST read "Location — Parent-Subarea".
- For multiple levels (e.g., Ponyville → Twilight's Library → Spike's Room), chain with hyphens: "Parent-Child-Grandchild" and reflect the full chain in Identity.
- Include a parent link bullet for the immediate parent (e.g., "Located in: <Parent>") and optionally a top‑level link (e.g., "Part of: <TopLevel>"). Ensure keywords include both parent and subarea tokens (and top‑level when present in chat).

Your task:
1. Compare the existing content with the new information.
2. Merge them carefully while keeping the bullet structure above:
   - Add new details that are not already present.
   - Update details that have changed.
   - Remove information that is contradicted or no longer valid.
   - Preserve important existing bullets that remain true.
   - Keep bullets concise; one fact per bullet.
3. Name resolution:
   - If the current name is relational/vague (e.g., "amelia's sister", "the bartender", "mysterious woman"), and a proper name is available in either content, set canonicalName to that proper name.
   - Ensure the Identity bullet uses the canonical name after merging.
4. If no new information is added, return the original content EXACTLY. Do not rewrite or reorder it.

Existing Entry Content:
{{existing_content}}

New Information from Recap:
{{new_content}}

OUTPUT INSTRUCTIONS:

⚠️ You MUST output valid JSON in the following format ⚠️

{
  "mergedContent": "the merged lorebook entry in bullet-point format",
  "canonicalName": "ProperName or null"
}

Rules for canonicalName:
- Use the full proper name if available (e.g., "Victoria Thornbrook").
- No type prefixes.
- If only a first name is known, use just that (e.g., "Victoria").
- If the current name is already a proper name, set canonicalName to null.`;

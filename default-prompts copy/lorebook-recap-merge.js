// Auto-Lorebooks Recap Merge Prompt
//
// REQUIRED MACROS:
// - {{existing_content}} - Existing entry content (also aliased as {{current_content}})
// - {{new_content}} - New content to merge (also aliased as {{new_update}})
// - {{entry_name}} - Entry name for name resolution

export const auto_lorebook_recap_merge_prompt = `You are updating a setting_lore entry. You have the existing entry content and new information from a recap.

Current Entry Name: {{entry_name}}

⚠️ CRITICAL: ONLY THE CONTENT IS INJECTED INTO THE AI'S CONTEXT ⚠️
The AI will NEVER see the entry title, type, or keywords — it ONLY sees the content text during roleplay.
Therefore, merged content MUST be self-contained and use specific names and references.
Do NOT use pronouns or vague references ("him", "her", "it", "the protagonist"). Use specific names ("Alice", "{{user}}", "Sunblade sword", "Shadow Guild", "Marcus").

⚠️ BREVITY REQUIREMENT ⚠️
Entries injected into EVERY prompt. Fragments only; no articles; semicolons; abbreviations (bc/w/→); NO filler words (currently/seems/appears).
PRESERVE brevity from new_content - don't make compact content verbose.

Format: Identity, Synopsis (≤10 words), Attributes (NO VERBS), Psychology ([trigger] → [response] → [outcome]), Relationships (X ↔ Y — [evolution]), Interaction Defaults, Intimacy & Romance (direct language), Micro-Moments (≤12 words each), State (current only, NO event log), Secrets/Leverage, Tension/Triggers, Style Notes, Notable Dialogue (≤12 words; max 3)

Location naming (subareas):
- If this entry is a sub‑location within a named parent (e.g., Cloudsdale → Rainbow Dash's Cloud House; Ponyville → Twilight's Library),
  the canonical name SHOULD be "Parent-Subarea" and the Identity bullet MUST read "Location — Parent-Subarea".
- For multiple levels (e.g., Ponyville → Twilight's Library → Spike's Room), chain with hyphens: "Parent-Child-Grandchild" and reflect the full chain in Identity.
- Include a parent link bullet for the immediate parent (e.g., "Located in: <Parent>") and optionally a top‑level link (e.g., "Part of: <TopLevel>"). Ensure keywords include both parent and subarea tokens (and top‑level when present in chat).

MERGE RULES:
1. ADD new facts (not duplicates); update changed facts; pack with semicolons; use → for causation
2. PRESERVE story-critical history via causal chains: "enemies (blamed for sister's death) → alliance during siege → lovers"
3. PRUNE: Duplicate facts ("tall" + "tall stature" → "tall"), trivial details (outfit w/ no story impact), superseded minor details (unless story-relevant)
4. DEDUPLICATE fields: State = current (NOT event log); Psychology/Relationships = consolidate repetition (same word 5+ times → 1-2); Micro-Moments = keep distinct facets, merge similar dynamics
5. Name resolution: If vague name ("the bartender") + proper name known → set canonicalName to proper name
6. No new info AND no pruning needed? → return original EXACTLY (don't rewrite)

PRE-OUTPUT: Preserved brevity? No duplicate facts? No sentences/articles/filler words? State not event log? Consolidated repetition? → If failed, revise.

EXAMPLES:

Ex 1 - Add new without duplicating:
  Existing: "- Attributes: tall; silver hair; violet eyes"
  New: "tall w/ silver hair; scar on left cheek"
  ✅ "- Attributes: tall; silver hair; violet eyes; scar on left cheek"
  ❌ "- Attributes: tall stature; silver hair; violet eyes; she has a scar on her left cheek" (duplicate "tall", has verb)

Ex 2 - Preserve history via causal chain:
  Existing: "- Relationships: Alice ↔ Bob — enemies (blamed him for sister's death); deep hatred; refuses to speak"
  New: "Alice ↔ Bob — tentative alliance during siege; working together; still wary"
  ✅ "- Relationships: Alice ↔ Bob — enemies (blamed for sister's death) → tentative alliance during siege; still wary"
  ❌ (loses history): "Alice ↔ Bob — tentative alliance during siege; working together; still wary"
  ❌ (prose): "They were enemies because she blamed him for her sister's death..."

Ex 3 - Consolidate repetitive patterns:
  Existing: "- Psychology: strategic thinker; military pragmatism; strategic network-building; strategic in position; strategic provocation; strategic during intimacy; strategic planning"
  New: "builds alliances deliberately; tests reactions"
  ✅ "- Psychology: strategic thinker; uses every interaction for intelligence/positioning; deliberate provocation as tactic; tests reactions"
  ❌ Keeps all "strategic" repetitions + adds new

Ex 4 - State = current (NOT event log):
  Existing: "- State: moved to cottage; memory-merge; received Greys; training; defeated Alberich; injuries; healing; meetings; met Queen; approved advisor; cleared exercise"
  New: "attending Council meetings"
  ✅ "- State: at cottage; Herald-trainee + special advisor to Queen; cleared for exercise; attending Council"
  ❌ Keeps entire chronological event log


OUTPUT INSTRUCTIONS:

⚠️ You MUST output valid JSON in the following format ⚠️

{
  "mergedContent": "the merged setting_lore entry in bullet-point format",
  "canonicalName": "ProperName or null"
}

Rules for canonicalName:
- Use the full proper name if available (e.g., "Victoria Thornbrook").
- No type prefixes.
- If only a first name is known, use just that (e.g., "Victoria").
- If the current name is already a proper name, set canonicalName to null.


Existing Entry Content:
{{existing_content}}

New Information from Recap:
{{new_content}}`;

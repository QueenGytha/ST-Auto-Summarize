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

⚠️ BREVITY REQUIREMENT - CRITICAL FOR TOKEN EFFICIENCY ⚠️
This setting_lore entry will be injected into EVERY future prompt. Every unnecessary word costs tokens repeatedly.
GOAL: Info-dense extraction - maximum information in minimum words; essence over recounting
- Use sentence fragments, NOT complete sentences
- Omit articles (a, an, the) where meaning is clear
- Pack facts with semicolons on same line
- NO prose, NO filler, NO redundant context
- Abbreviate where unambiguous ("bc" for "because", "w/" for "with", "→" for cause-effect)
- NO filler words: "currently", "seems to be", "appears to", "is now", "has been"
- PRESERVE brevity from new_content - if new info uses compact format, keep it compact

Examples of GOOD vs BAD merging:
  ✅ GOOD: "tall; silver hair; violet eyes; scar across left cheek from duel w/ Marcus"
  ❌ BAD: "She is a tall woman with silver hair and violet eyes. She has a scar across her left cheek that she received from a duel with Marcus."

  ✅ GOOD: "Alice ↔ Bob — wary trust after betrayal → protective when threatened; tense banter"
  ❌ BAD: "Alice's relationship with Bob is characterized by wary trust following his betrayal. She becomes protective of him when he is threatened. They engage in tense banter."

  ✅ GOOD: "conflicted bc duty vs desire → initiated intimacy → regret after"
  ❌ BAD: "She felt conflicted because she was torn between duty and desire, which led her to initiate intimacy, and she experienced regret afterward."

Target format (bullet style; no PList):
- Identity: <Type> — <Canonical Name>
- Synopsis: <1 line identity/purpose> (fragment, not sentence)
- Attributes: <appearance/traits/capabilities> (fragments w/ semicolons; no articles)
- Psychology (character only): <drives; fears; contradictions; emotional states>. Format: "[trigger] → [emotion] → [consequence]"
- Relationships: <X ↔ Y — tone; patterns; shifts>. Format: "[event] → [relationship change] → [new pattern]". Brief quote if pivotal (≤12 words)
- Interaction Defaults: <address forms; pet names; formality; boundaries> (fragments only)
- Intimacy & Romance: <roles; pace; acts; aftercare; jealousy> (direct language, no euphemisms; brief)
- Micro-Moments (limit 1-2): <"'exact quote' (cue) — impact"> (≤12 words per quote)
- State: <status/location/owner/effects> (fragment; "state (bc [cause])" when relevant)
- Secrets/Leverage: <what/who knows> (fragments)
- Tension/Triggers: <what escalates/defuses>. Format: "[trigger] → [reaction] → [consequence]"
- Style Notes: <voice/diction patterns> (idioms, syntax, punctuation only)
- Notable Dialogue: <"To [Name]: \"quote\""> (max 2, ≤12 words each)

Location naming (subareas):
- If this entry is a sub‑location within a named parent (e.g., Cloudsdale → Rainbow Dash's Cloud House; Ponyville → Twilight's Library),
  the canonical name SHOULD be "Parent-Subarea" and the Identity bullet MUST read "Location — Parent-Subarea".
- For multiple levels (e.g., Ponyville → Twilight's Library → Spike's Room), chain with hyphens: "Parent-Child-Grandchild" and reflect the full chain in Identity.
- Include a parent link bullet for the immediate parent (e.g., "Located in: <Parent>") and optionally a top‑level link (e.g., "Part of: <TopLevel>"). Ensure keywords include both parent and subarea tokens (and top‑level when present in chat).

Your task:
1. Compare existing content with new information.
2. Merge carefully while maintaining BREVITY and bullet structure:
   - Add ONLY truly new facts not already present (even in different wording)
   - Update facts that changed
   - Remove contradicted/invalid information
   - Preserve important existing bullets that remain true
   - DO NOT rewrite existing content to be more verbose - preserve or improve brevity
   - DO NOT duplicate facts in different words (e.g., don't add "tall stature" if "tall" exists)
   - Pack related facts with semicolons on same line
   - Use fragments, not sentences; omit articles; use abbreviations
   - Use causal format "[trigger] → [reaction] → [consequence]" for Psychology/Relationships/Tension
3. Name resolution:
   - If current name is relational/vague (e.g., "amelia's sister", "the bartender") and proper name available, set canonicalName to that proper name
   - Ensure Identity bullet uses canonical name after merging
4. If no new information is added, return original content EXACTLY. Do not rewrite or reorder it.

⚠️ ANTI-BLOAT CHECK BEFORE SUBMITTING:
- Did you preserve brevity from existing content or make it worse?
- Did you add duplicate facts in different words?
- Did you use complete sentences instead of fragments?
- Did you add filler words like "currently", "seems to be", "appears to"?
If YES to any, revise to be more concise.

MERGE EXAMPLES (showing how to add new info without bloating):

Example 1 - Adding new attribute without duplicating:
  Existing: "- Attributes: tall; silver hair; violet eyes"
  New: "tall w/ silver hair; scar on left cheek"
  ✅ GOOD merge: "- Attributes: tall; silver hair; violet eyes; scar on left cheek"
  ❌ BAD merge: "- Attributes: tall stature; silver hair; violet eyes; she has a scar on her left cheek"

Example 2 - Updating relationship without bloating:
  Existing: "- Relationships: Alice ↔ Bob — distrust; avoids eye contact"
  New: "Alice ↔ Bob — wary trust after he saved her → protective when he's threatened"
  ✅ GOOD merge: "- Relationships: Alice ↔ Bob — distrust → wary trust after he saved her → protective when threatened; avoids eye contact"
  ❌ BAD merge: "- Relationships: Alice ↔ Bob — She initially distrusted him and avoided eye contact, but developed wary trust after he saved her life. She now becomes protective when he is threatened."

Example 3 - Adding emotional state without prose:
  Existing: "- Psychology: driven by revenge against Marcus; fears abandonment"
  New: "conflicted bc duty vs desire → initiated intimacy w/ Adam → regret after"
  ✅ GOOD merge: "- Psychology: driven by revenge against Marcus; fears abandonment; conflicted bc duty vs desire → initiated intimacy w/ Adam → regret after"
  ❌ BAD merge: "- Psychology: She is driven by a desire for revenge against Marcus and fears abandonment. She recently felt conflicted between her duty and her desires, which led her to initiate intimacy with Adam, after which she experienced regret."


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

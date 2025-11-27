// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Merge NEW into EXISTING entry. EXISTING is baseline. Default is DROP unless NEW clearly earns inclusion.

============ SUPERSESSION RULES (by priority) ============

Different bullet types have different merge rules:

- Arc: ACCUMULATE - add to journey (landmark moments only, 3-5 total max) — PROTECT
- Stance: UPDATE per target - one line per relationship — HIGH VALUE
- Voice: DEDUP - same speech pattern = keep better one only — MEDIUM
- State: SUPERSEDE - newer replaces older — LOWER
- Identity: PRESERVE unless fundamentally changed (rare) — CUT FIRST

============ FILTERING ============

For EACH item in NEW, ask: "Does this earn its tokens given what EXISTING has?"

Voice dedup:
- Does NEW quote show same speech pattern as any EXISTING quote?
- YES same pattern → keep better one only
- NO different pattern → add new quote

Arc threshold:
- Is this a landmark moment (pattern break, worldview shift)?
- NO, just a mood or minor moment → DROP

State check:
- Will this still be true going forward?
- NO → DROP. YES → supersedes existing.

============ OUTPUT ============

{
  "mergedContent": "bullet-formatted content",
  "canonicalName": "ProperName or null"
}

MUST use labeled bullets (priority order):
- Arc: journey (from → through → to)
- Stance: [target] — shared history, dynamic, commitments
- Voice: 'representative quote'
- State: current conditions, belongings, status
- Identity: background, role, position, appearance

OMIT empty bullets. Each bullet on new line.

SUBJECT LOCK: Entry = {{entry_name}}. Other entities → Stance bullets only.

---------------- EXISTING_CONTENT ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- NEW_CONTENT ----------------
<NEW_CONTENT>
{{new_content}}
</NEW_CONTENT>

Output JSON only.`;

// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `ROLE: Setting bible editor. Maintain canonical entity records with precision.

CONTEXT: This is for AI roleplay. Entity entries are injected into the LLM's context when that entity appears in the story. The LLM uses this to write the entity consistently - their voice, relationships, development, current state.

Every token competes with the current scene for context space. Keep entries focused on what helps the LLM write this entity well. If something wouldn't change how the LLM writes the entity, cut it.

TASK: Merge NEW_CONTENT into EXISTING_CONTENT. EXISTING_CONTENT is baseline. Default is DROP unless NEW_CONTENT clearly earns inclusion.

============ SUPERSESSION RULES (by priority) ============

Different bullet types have different merge rules:

- Arc: ACCUMULATE - add to journey (landmark moments only) — PROTECT
- Stance: UPDATE per target - one line per relationship — HIGH VALUE
- Quotes: DEDUP - same relationship moment = keep better one only — MEDIUM
- State: SUPERSEDE - newer replaces older — LOWER
- Identity: PRESERVE unless fundamentally changed (rare) — CUT FIRST

============ FILTERING ============

For EACH item in NEW_CONTENT, ask: "Does this earn its tokens given what EXISTING_CONTENT has?"

Quotes dedup:
- Does NEW_CONTENT quote capture same relationship moment as any EXISTING_CONTENT quote?
- TEST: "Is this the same commitment/oath/defining moment, just worded differently?"
- YES same moment → keep better one only
- NO different moment (new commitment, different relationship pivot) → add new quote

Arc threshold:
- Is this a landmark moment (pattern break, worldview shift)?
- NO, just a mood or minor moment → DROP
- EMBEDDED QUOTES: Compare MEANING not format. If NEW has quote and EXISTING has
  synthesis of same transformation, keep whichever captures it better.
  Quote earns its place only if exact wording matters for callbacks.

Stance update:
- Does NEW_CONTENT show a meaningful SHIFT in the relationship?
- TEST: "Would this change how the LLM writes interactions between these characters?"
- YES (new commitment, betrayal, shift in dynamic) → UPDATE
- NO (just more of the same dynamic) → keep existing
- EMBEDDED QUOTES: Compare MEANING not format. If NEW has quote and EXISTING has
  synthesis of same dynamic/commitment, keep whichever captures it better.
  Quote earns its place only if exact wording matters for callbacks.

State check:
- Will this still be true going forward?
- NO → DROP. YES → REPLACE existing entirely.
- Don't mix old+new state. Drop stale details (old locations, resolved conditions).
- State should reflect CURRENT reality only.

============ OUTPUT ============

{
  "mergedContent": "bullet-formatted content",
  "canonicalName": "ProperName or null"
}

MUST use labeled bullets (priority order). Each helps the LLM differently:
- Arc: journey (from → through → to) — helps LLM write character consistent with growth
- Stance: [target] — shared history, dynamic, commitments — helps LLM write interactions with appropriate subtext
- Quotes: 'defining quote' — relationship-defining moments for callbacks
- State: current conditions, belongings, status — prevents contradictions (injured arm can't be used)
- Identity: background, role, position — provides baseline context for who they are

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

// MACROS: {{existing_content}}, {{new_content}}, {{entry_name}}

export const auto_lorebook_recap_merge_prompt = `TASK: Merge new information into existing entry.

================================================================================
THE CONTINUITY TEST (apply to ALL content)
================================================================================

Ask: "Would ignoring this cause contradictions in future scenes?"

YES (keep):
- Permanent changes (lost limb, new title, transformed)
- Commitments that could be called back
- Relationship dynamics that affect interactions
- Behavioral patterns that define how to write them

NO (drop):
- Transient conditions (tired, hungry, mood fluctuations)
- Temporary discomfort that resolves
- Conditions that naturally pass without consequence

If content doesn't pass this test, DROP IT during merge—even if it's in the input.

================================================================================
SUPERSEDE (CRITICAL - newer replaces older)
================================================================================

When new content contradicts or updates old content, KEEP ONLY THE NEW.
Do NOT keep both. Do NOT show the progression.

State changes: keep only current
- "injured" then "healed" → output ONLY relevant current state
- "at location A" then "at location B" → output ONLY current location
- resolved situations → DELETE entirely (not "was X, now resolved")

================================================================================
CONSOLIDATE (merge should TIGHTEN, not accumulate)
================================================================================

Output should be SHORTER or EQUAL, not longer than inputs combined.
- Multiple mentions of same dynamic → ONE best phrasing
- Redundant sentiments → pick the most specific one
- History of how things developed → just the current state + essential context

================================================================================
WHAT MAKES CHARACTERS FEEL ALIVE (PRESERVE THESE)
================================================================================

BEHAVIORAL MECHANISMS - How they act:
- Patterns that affect how to write them in future scenes

THE "WHY" - Context that explains behavior:
- Motivation that makes dynamics specific, not generic

CALLBACKS - Specific details for future reference:
- Exact words from pivotal moments
- Specific acts that define relationships

TENSIONS - Internal contradictions that create depth

================================================================================
WHAT TO DROP
================================================================================

TRANSIENT: Conditions that naturally pass (fatigue, temporary emotions, discomfort)
REDUNDANT: Same meaning stated multiple ways
OTHER CHARACTERS: Their motivations/feelings belong in THEIR entry

USER CHARACTER ({{user}}) - VERY AGGRESSIVE:
If {{entry_name}} is {{user}}, apply MAXIMUM filtering:
- KEEP ONLY: physical state, status/titles, explicit commitments
- DROP EVERYTHING ELSE: relationships, development, personality, voice, internal state
- User plays their own character—they need almost no lorebook reconstruction
- If merge would result in mostly relationship/development content → output minimal or empty

Example for {{user}} entry:
EXISTING: "Broken arm from battle"
NEW: "Arm healed; now trusts [NPC] completely; growing more confident"
✓ MERGED: "Arm healed" (drop relationship and development—user demonstrates those)

================================================================================
STANCE SECTIONS
================================================================================

STANCE captures relationship dynamics. Keep what affects how they INTERACT:

KEEP:
- Core dynamic (protective/hostile/romantic/complicated)
- Behavioral patterns ("will do X if Y happens")
- Tensions and contradictions ("loves but resents")
- The "why" if it affects behavior ("protective because...")
- Specific commitments or boundaries

COMPACT:
- Multiple phrasings of same sentiment → ONE best version
- Blow-by-blow history of how dynamic developed → just current state + key context
- Generic emotional reactions ("warmed by", "impressed by") unless they create specific behavior

Example:
BLOATED: "grew closer over journey; impressed by courage; warmed by kindness; now trusts completely; will fight for them; protective instincts awakened"
BETTER: "trusts completely; fiercely protective; will fight for them"
(Same meaning, removed redundant sentiment buildup)

But DON'T strip this: "trusts completely yet terrified of losing herself to the connection"
(The tension/contradiction is character-defining, not redundancy)

================================================================================
SUBJECT LOCK
================================================================================

Entry = {{entry_name}}. This entry is ABOUT this entity.
- Their identity, state, changes, relationships
- Other entities appear only in context of relationship TO this entity
- Don't duplicate other entities' own information here

================================================================================
OUTPUT
================================================================================

{
  "mergedContent": "merged content as free-form text",
  "canonicalName": "ProperName or null if no rename needed"
}

---------------- EXISTING_CONTENT ----------------
<EXISTING_CONTENT>
{{existing_content}}
</EXISTING_CONTENT>

---------------- NEW_CONTENT ----------------
<NEW_CONTENT>
{{new_content}}
</NEW_CONTENT>

Output JSON only.`;

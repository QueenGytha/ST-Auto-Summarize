// Stage 2: Split extraction into recap (always visible) and entities (keyword-activated)
// MACROS: {{extracted_data}}, {{user}}, {{lorebook_entry_types_with_guidance}}

export const scene_recap_stage2_organize_prompt = `TASK: Split extracted content into recap and lorebook entities.

RECAP = always in context, high-level plot
ENTITIES = keyword-activated lorebook, detailed nuance

================================================================================
INPUT: Stage 1 Extraction
================================================================================
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

User character: {{user}}

================================================================================
SPLITTING RULES
================================================================================

RECAP gets high-level summary:
- What happened (outcomes, decisions, major events)
- Unresolved threads (problems raised, threats looming)
- Current state that will change (recap is always visible, so put things here that would go stale in keyword-activated storage)

The test: "Will this go stale?"
- No (stable fact) → entity (keyword-activated, may not surface for a while)
- Yes/uncertain → recap.state (always visible, won't go stale)

ENTITIES get nuance and stable facts:
- Character details, relationships, specific dynamics
- Quotes that matter for callbacks
- What something IS (description, history, significance)
- Anything useful when that character/place/thing is mentioned again

INTENTIONAL DUPLICATION is correct:
- Recap gets the high-level fact
- Entity gets the full detail
- Same information at different levels of detail is NOT redundancy

================================================================================
CONSOLIDATION
================================================================================

If multiple items express the same concept differently:
- Keep the BEST expression
- Drop redundant phrasings

If multiple quotes convey the same meaning:
- Keep the strongest/most memorable one
- Drop redundant quotes (different words, same point)

DO NOT filter by category ("cut all transient conditions").
DO consolidate redundancy.

================================================================================
ENTITY TYPES (user-configurable)
================================================================================

{{lorebook_entry_types_with_guidance}}

================================================================================
ENTITY STRUCTURE
================================================================================

{
  "type": "<type from above>",
  "name": "ExactName",
  "keywords": ["name", "aliases", "titles"],
  "content": [
    "Identity/role - what they are",
    "TargetName: specific relationship dynamic (not labels like 'they trust each other')",
    "Quote to TargetName: 'exact words' - context for why it matters",
    "Stable condition or commitment"
  ]
}

Content is an ARRAY of discrete items. Each item is self-contained.

QUOTES must include context:
- Who said it, to whom
- Why it matters (what it reveals, commits to, or establishes)

KEYWORDS:
- Break multi-word names into individual words: "Twilight Sparkle" → "twilight", "sparkle"
- Include titles, epithets, nicknames, likely aliases
- For lore/concepts: words that would naturally appear in roleplay text when this info becomes relevant
  - Keywords match against dialogue and narration, so use natural language
  - Test: "Would a character say this word? Would a narrator write it?"
  - Formal category labels fail this test - nobody says them in conversation
- DO NOT include other character names as keywords

USER CHARACTER ({{user}}):
- Include {{user}} entity only if they have stable status/commitments to track
- DO NOT include {{user}}'s relationships in their own entity
- Relationships with {{user}} belong in the OTHER character's content

================================================================================
OUTPUT FORMAT
================================================================================

{
  "sn": "scene name (pass through)",
  "recap": {
    "outcomes": "High-level what happened",
    "threads": "Unresolved hooks",
    "state": "Volatile status (locations, pending actions, changing quantities)"
  },
  "entities": [
    {
      "type": "<from entity types>",
      "name": "Name",
      "keywords": ["keywords"],
      "content": ["item 1", "item 2", "..."]
    }
  ]
}

Output JSON only.`;

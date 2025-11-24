// Stage 2: Filtering/Formatting Prompt
// REQUIRED MACROS:
// - {{extracted_data}} - JSON from Stage 1 with comprehensive extraction
// - {{active_setting_lore}} - Current lore entries formatted with UIDs
// - {{lorebook_entry_types}} - List of allowed entity types

export const stage2_filtering_prompt = `ROLE: Filter and format extracted data. No roleplay. No explanations. Output JSON only (starts { ends }). Analyze only; never continue the story.

Purpose: Take comprehensive extraction from Stage 1 and make intelligent decisions about what's NEW, what's CHANGED, what belongs in recap vs setting_lore, and how to match UIDs. Output polished, filtered results using minimal tokens.

---------------- CURRENT_SETTING_LORE (for UID lookup & change detection) ----------------
<CURRENT_SETTING_LORE>
{{active_setting_lore}}
</CURRENT_SETTING_LORE>

---------------- EXTRACTED_DATA (from Stage 1 - comprehensive extraction) ----------------
<EXTRACTED_DATA>
{{extracted_data}}
</EXTRACTED_DATA>

---------------- FILTERING & FORMATTING INSTRUCTIONS ----------------

STEP 1: DEDUPLICATION WITHIN EXTRACTED DATA
- Consolidate multiple mentions of the same entity
- Merge redundant facets within each entity
- Remove duplicate plot beats and events
- Keep only one instance of repeated information

STEP 2: COMPARISON AGAINST CURRENT_SETTING_LORE
- Baseline definition: CURRENT_SETTING_LORE is the only baseline
- For each entity, find its baseline entry in CURRENT_SETTING_LORE (same type+name)
- Compare ONLY against that entity's own baseline - no cross-entity comparison
- For every facet in extracted data:
  * If meaning already exists in baseline -> DROP IT
  * If facet is new or meaningfully changed -> KEEP IT
  * If uncertain -> DROP IT (better to omit than duplicate)
- Omit any entity with no surviving new facets after comparison

STEP 3: UID MATCHING (STRICT RULES)
- UID checklist:
  * Entity absent from CURRENT_SETTING_LORE -> NO UID
  * Entity present but identity not 100% certain -> NO UID
  * Only copy UID on confirmed same type+name+identity match
- Never invent, alter, or reuse UIDs
- If entity is new (not in CURRENT_SETTING_LORE) -> emit entry with NO UID
- If match is uncertain -> emit entry with NO UID (do NOT drop the entry)
- Type/name reuse: if entity exists in CURRENT_SETTING_LORE, reuse exact type+name
- When copying UID: must be exact type+name+identity match to CURRENT_SETTING_LORE entry with UID

STEP 4: CATEGORIZATION (recap vs setting_lore)

A. RECAP CATEGORIZATION:
- Move to recap: plot beats, events, cause->effect chains, decisions, travel, combat, state changes, reveals
- Keep recap relationship-free: all stance/affection/boundaries/alliances/debts/leverages go to setting_lore instead
- Remove ALL quotes from recap: quotes belong in setting_lore Notable dialogue
- Never include character voice/mannerisms/personality in recap: those belong in setting_lore
- Omit a line if nothing new

Recap structure (single string; labeled lines):
* DEV: cause->effect plot beats; decisions/promises/contracts; documents (verbatim titles/clauses only); travel/combat; state/condition changes; reveals. NO quotes. NO paraphrased feelings. NO relationship events.
* TONE: scene-level genre/POV/tense/format/pacing shifts only; narration texture; dialogue format; motifs/running jokes. NEVER include character-specific voice/mannerisms/diction. Omit TONE if no POV/voice/pacing shift occurs or if it would only repeat character traits.
* PEND: goals/timers/secrets/promises/hooks (NPC and {{user}}); who/what + condition; drop when resolved.

B. SETTING_LORE CATEGORIZATION:
- Only include entities with NEW or CHANGED information vs baseline
- Delta-only: if a fact/idea is already in baseline, DO NOT include it again
- For existing entities, skip identity/appearance/capabilities/relationships unless the facet itself changed
- Persistent facets only: no one-off travel beats, task steps, or recap-only plot sequencing
- Trim per entry: if text reads like recap choreography (sex acts, door closing, lap counts), delete it
- If nothing new survives after pruning, drop the entire entry
- Hard block: NEVER create entry for {{user}} (or aliases); {{user}}-related stance goes in counterpart's Relationships

STEP 5: OUTPUT FORMATTING

Format match current system exactly:
{
  "scene_name": "Brief title",
  "recap": "DEV: ...\\nTONE: ...\\nPEND: ...",
  "setting_lore": [
    {
      "type": "character",
      "name": "Entity Name",
      "content": "Description with headings",
      "keywords": ["k1", "k2"],
      "uid": "existing-uid-if-matched"
    }
  ]
}

Setting_lore content structure (include headings; highly organized):
* Identity/Synopsis: <=10 words; role if needed.
* Appearance: only if distinctive AND referenced.
* State: location/condition as shown.
* Capabilities/limits: only if demonstrated and consequential.
* Behavioral defaults/triggers: observed trigger -> response -> outcome.
* Relationships: counterpart -> demonstrated stance/promise/debt/leverage; note trigger/outcome of change; no name repetition beyond counterpart; explicit stance/actions only.
* Intimacy/Aftercare: only if explicitly shown; acts/turn-ons/boundaries, aftercare/comfort cues; explicit terms; brief scene/partner cue.
* Voice/Mannerisms: diction/cadence/quirks/catchphrases/body-language; note shift cue if changed.
* Notable dialogue: verbatim; brief context (speaker/target/situation); no {{user}} quotes; no invention/paraphrase.
* Key beat: brief scene action/gesture/line that shifted tone/stance; minimal context + effect.
* Secrets/Leverage/Tension: only if consequential and shown.

Keywords rules:
- Retrieval handles ONLY (canonical name, nicknames/aliases/titles/callsigns/parent-location tokens)
- 0-6 tokens; lowercase; dedupe
- NEVER include schedule/time/context words (today/tonight/tomorrow/morning/afternoon/evening/night/dawn/dusk/noon/midnight/bell/candlemark/hour/week/month/year)
- No numbered timestamps, states/actions/emotions, or scene events
- If no alias beyond canonical name, emit just canonical token or leave empty

COMPRESSION RULES:
- Fragments; semicolons; drop filler/articles; digits ok
- Mark uncertainty with "Uncertain:"/"Likely:"
- Canonical names at least once; short handles after
- Keep as short as possible without losing demonstrated nuance

POST-TRIM VALIDATION:
- For each setting_lore entry, delete any facet that restates baseline
- If nothing new remains after pruning, delete the entry
- Final compliance check: if any clause copies or paraphrases baseline, delete it
- If no new facets remain, delete entry before responding

GLOBAL GUARDRAILS:
- Present data extraction only; no outside canon
- No speculation: omit motives/feelings/assumptions not explicitly stated
- Demonstrated-only: if it did not happen or shift, do not add it
- Change-only: emit setting_lore only when NEW or CHANGED vs CURRENT_SETTING_LORE
- No {{user}} entries in setting_lore
- JSON only; no code fences or extra prose
- Output must start with "{" and end with "}"

UID REMINDER: Copy UID only from CURRENT_SETTING_LORE on exact entity match (type+name+identity); otherwise omit; never invent/alter UID values.

RESPOND WITH JSON ONLY: {"scene_name": "...", "recap": "...", "setting_lore": [...]}`;

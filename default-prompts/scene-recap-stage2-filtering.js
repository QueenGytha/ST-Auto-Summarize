// Stage 2: Filtering/Formatting Prompt
// REQUIRED MACROS:
// - {{extracted_data}} - JSON object from Stage 1 with category arrays (plot/goals/reveals/state/stance/voice/appearance/docs)
// - {{active_setting_lore}} - Current lore entries formatted with UIDs
// - {{lorebook_entry_types}} - List of allowed entity types

export const scene_recap_stage2_filtering_prompt = `ROLE: Filter extracted data into recap + setting_lore. Output JSON only. No roleplay.

OUTPUT FORMAT:
{
  "sn": "Brief title (max 5 words)",
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [
    { "t": "type", "n": "Name", "c": "content", "k": ["keywords"], "u": "uid-if-known" }
  ]
}

PHASE 1 - CATEGORIZATION:
- Recap (rc): HIGH-LEVEL plot beats, decisions, contracts, state changes, reveals only. No quotes. No feelings. No relationship nuance.
  - DEV: what happened (events/outcomes)
  - PEND: active goals/timers/hooks (who wants what + condition)
- Setting_lore (sl): entity-specific nuance that recap excludes. Stance, voice, relationships, behavioral triggers, secrets.
  - Types must match: {{lorebook_entry_types}}
  - Never create entry for {{user}}

PHASE 2 - DELTA CHECK:
- Compare each entity against BASELINE (CURRENT_SETTING_LORE with same type+name)
- Only output NEW or CHANGED facets vs baseline
- If nothing new, omit that entity entirely
- UID: set "u" ONLY if type+name exactly match baseline entry. Any doubt = omit.

Setting_lore facets (include only when shown):
- Identity/Synopsis: <=10 words
- Appearance: distinctive only
- State: current location/condition
- Capabilities: demonstrated, consequential
- Behavioral triggers: trigger -> response -> outcome
- Relationships: NET STANCE per counterpart (not interaction list)
- Voice/Mannerisms: distinctive diction/cadence
- Notable dialogue: verbatim + brief context; no {{user}}
- Secrets/Tension: if consequential
- Keywords: 0-6 retrieval tokens; lowercase

---------------- BASELINE (for delta comparison) ----------------
<CURRENT_SETTING_LORE>
{{active_setting_lore}}
</CURRENT_SETTING_LORE>

---------------- INPUT (extracted facts to filter) ----------------
<EXTRACTED_DATA>
{{extracted_data}}
</EXTRACTED_DATA>

---------------- PHASE 3 - COMPRESS BEFORE OUTPUT ----------------

RELATIONSHIP COLLAPSING:
Before (multiple interactions, same stance):
  "Relationships: A -> protective of B; A -> insisted B rest; A -> carried B; A -> promised safety"
After (net stance):
  "Relationships: A -> protective; prioritizes B's safety"

QUOTE DEDUPLICATION:
Before (same intent, different words):
  "Notable dialogue: 'I'll protect you'; 'I won't let anyone hurt you'; 'Your safety matters most'"
After (one per intent):
  "Notable dialogue: 'I'll protect you' (protective commitment)"

STATE SUPERSESSION:
Before: "State: injured; recovering; healed"
After: "State: healed" (current only)

FINAL CHECKLIST:
□ rc contains ONLY plot/events? (no stance/voice/feelings)
□ sl entries are delta-only vs baseline? (no restating existing facts)
□ Relationships collapsed to net stance per counterpart?
□ Quotes: one per distinct intent?
□ UIDs only set when 100% certain match?

Output JSON only.`;

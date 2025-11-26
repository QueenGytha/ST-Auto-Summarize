// Stage 3: Filter against existing content (semantic deduplication)
// MACROS: {{extracted_data}}, {{current_running_recap}}, {{active_setting_lore}}

export const scene_recap_stage3_filtering_prompt = `ROLE: Filter INPUT against EXISTING content. Drop semantically similar items.

============ FILTERING RULES (APPLY TO INPUT) ============

For EACH item in INPUT, ask: "Does EXISTING already cover this?"

RC filtering (compare INPUT.rc against RUNNING_RECAP):
- DEV: Drop if semantically similar to RUNNING_RECAP (same meaning, different words = drop)
- PEND: Drop goals already tracked in RUNNING_RECAP
- Keep only information not already covered

SL filtering (compare INPUT.sl against SETTING_LORE):
- Drop entry if entity+type combo exists in SETTING_LORE with semantically similar content
- Remove entry entirely if nothing new remains after filtering
- Keep entries with genuinely new information

UID field (u) - CRITICAL for correct merging:
- LITERAL STRING MATCH ONLY on the name attribute
- Copy uid from matching <setting_lore name="X" uid="Y"> where X is IDENTICAL string to your n value
- Individual entity must match individual entry, NOT race/faction/category entries
- Sublocation must match sublocation entry, NOT parent location
- OMIT "u" entirely if no IDENTICAL name match exists
- Wrong UID = data corruption. When uncertain, OMIT.

Empty is valid:
- If all content filtered out, return {"rc": "", "sl": []}

==========================================================================

OUTPUT FORMAT:
{
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["keywords"], "u": "uid if exact match" }]
}

---------------- INPUT (Stage 2 output to filter) ----------------
<INPUT>
{{extracted_data}}
</INPUT>

---------------- EXISTING RUNNING RECAP ----------------
<RUNNING_RECAP>
{{current_running_recap}}
</RUNNING_RECAP>

---------------- EXISTING SETTING LORE ----------------
<SETTING_LORE>
{{active_setting_lore}}
</SETTING_LORE>

Output JSON only.`;

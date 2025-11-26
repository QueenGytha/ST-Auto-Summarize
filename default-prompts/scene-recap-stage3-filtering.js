// Stage 3: Filter against existing content (semantic deduplication)
// MACROS: {{extracted_data}}, {{current_running_recap}}, {{active_setting_lore}}

export const scene_recap_stage3_filtering_prompt = `ROLE: Filter recap against existing content. Drop semantically similar items.

OUTPUT FORMAT:
{
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["keywords"], "u": "uid if exact match" }]
}

---------------- INPUT (Stage 2 output) ----------------
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

---------------- FILTERING RULES ----------------

RC filtering:
- DEV: Drop developments semantically similar to running recap (same meaning, different words = drop)
- PEND: Drop goals already tracked in running recap
- Keep only NEW information not covered elsewhere

SL filtering:
- Drop entry if entity+type combo exists in setting_lore with semantically similar content
- Remove entry entirely if nothing new remains after filtering
- Keep entries with genuinely new information

UID field (u) - CRITICAL for correct merging:
- LITERAL STRING MATCH ONLY on the name attribute
- Individual entity must match individual entry, NOT race/faction/category entries
- Sublocation must match sublocation entry, NOT parent location
- Copy uid from matching <setting_lore name="X" uid="Y"> where X is IDENTICAL string to your n value
- OMIT "u" entirely if no IDENTICAL name match exists
- Wrong UID = data corruption. When uncertain, OMIT.

Empty is valid:
- If all content filtered out, return {"rc": "", "sl": []}
- Empty rc string and empty sl array are acceptable

Output JSON only.`;

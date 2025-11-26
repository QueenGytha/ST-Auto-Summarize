// Stage 3: Filter against existing content (semantic deduplication)
// MACROS: {{extracted_data}}, {{current_running_recap}}, {{active_setting_lore}}

export const scene_recap_stage3_filtering_prompt = `ROLE: Filter recap against existing content. Drop semantically similar items.

OUTPUT FORMAT:
{
  "sn": "Scene title",
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["keywords"] }]
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

SN: Keep as-is.

RC filtering:
- DEV: Drop developments semantically similar to running recap (same meaning, different words = drop)
- PEND: Drop goals already tracked in running recap
- Keep only NEW information not covered elsewhere

SL filtering:
- Drop entry if entity+type combo exists in setting_lore with semantically similar content
- Remove entry entirely if nothing new remains after filtering
- Keep entries with genuinely new information

Empty is valid:
- If all content filtered out, return {"sn": "...", "rc": "", "sl": []}
- Empty rc string and empty sl array are acceptable

Output JSON only.`;

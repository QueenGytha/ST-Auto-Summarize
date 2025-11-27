// Stage 3: Filter against existing content
// MACROS: {{extracted_data}}, {{current_running_recap}}, {{active_setting_lore}}

export const scene_recap_stage3_filtering_prompt = `ROLE: Filter INPUT against EXISTING. Drop what's already captured.

============ RC FILTERING (against RUNNING_RECAP) ============

- DEV: Drop if RUNNING_RECAP already has this outcome (same meaning = drop)
- PEND: Drop threads already in RUNNING_RECAP
- KNOWS: Drop secrets already tracked with same people knowing

Keep ONLY genuinely new information.

============ SL FILTERING (against SETTING_LORE) ============

For each entity entry in INPUT.sl:
- Compare against matching entry in SETTING_LORE (same name)
- Drop content already covered (same meaning = drop)
- Remove entry entirely if nothing new remains

New information means (by priority):
- Arc moment not already captured (don't duplicate journey points)
- Stance change for a target (relationship evolved)
- Voice quote showing speech pattern not already demonstrated
- State that supersedes existing (new condition, changed status)
- Identity info not already established

============ UID MATCHING ============

UID field (u) - CRITICAL for correct merging:
- LITERAL STRING MATCH ONLY on name attribute
- Copy uid from <setting_lore name="X" uid="Y"> where X is IDENTICAL to your n value
- Individual must match individual entry, NOT category entries
- Sublocation must match sublocation, NOT parent location
- OMIT "u" entirely if no IDENTICAL name match exists
- Wrong UID = data corruption. When uncertain, OMIT.

============ OUTPUT ============

Empty is valid - if all content filtered out: {"rc": "", "sl": []}

{
  "rc": "DEV: ...\\nPEND: ...\\nKNOWS: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["keywords"], "u": "uid if exact match" }]
}

---------------- INPUT ----------------
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

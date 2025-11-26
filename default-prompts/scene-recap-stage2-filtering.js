// Stage 2: Condense extraction
// MACROS: {{extracted_data}}

export const scene_recap_stage2_filtering_prompt = `ROLE: Condense extracted content. Remove duplicates. Merge per entity.

OUTPUT FORMAT: Same structure as input, but condensed.
{
  "sn": "...",
  "plot": [],
  "goals": [],
  "reveals": [],
  "state": [],
  "stance": [],
  "voice": [],
  "appearance": [],
  "docs": []
}

---------------- EXTRACTED DATA ----------------
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

---------------- CONDENSE RULES ----------------

SN: Copy from extracted. Do not rewrite.

PLOT: Dedupe. Same event different words = keep one.

GOALS: One per character. Merge if multiple.

REVEALS: Dedupe. Same fact different words = keep one.

STATE: One entry per entity. Merge conditions.

STANCE: One entry per pair. Merge dynamics.

VOICE: One quote per speaker showing each distinct trait.

APPEARANCE: One entry per entity. Merge descriptions.

DOCS: Keep verbatim.

Output JSON only.`;

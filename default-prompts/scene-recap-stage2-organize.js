export const scene_recap_stage2_organize_prompt = `ROLE: Filter and organize extracted content. Remove noise. Merge per entity.

INPUT: Raw extraction from Stage 1
OUTPUT: Same structure, filtered and organized.

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

---------------- FILTER RULES ----------------

SN: Copy from extracted. Do not rewrite.

PLOT: Dedupe. Same event different words = keep one. Remove trivial.

GOALS: One per character. Merge if multiple.

REVEALS: Dedupe. Same fact different words = keep one.

STATE: One entry per entity. Merge conditions.

STANCE: One entry per pair. Merge dynamics.

VOICE: One quote per speaker showing each distinct trait.

APPEARANCE: One entry per entity. Merge descriptions.

DOCS: Keep verbatim.

Output JSON only.`;

// Stage 2: Condense and format
// MACROS: {{extracted_data}}

export const scene_recap_stage2_organize_prompt = `ROLE: Condense extracted content, then format to output structure.

OUTPUT FORMAT:
{
  "sn": "Scene title",
  "rc": "DEV: ...\\nPEND: ...",
  "sl": [{ "t": "type", "n": "Name", "c": "content", "k": ["keywords"] }]
}

---------------- EXTRACTED DATA ----------------
<EXTRACTED>
{{extracted_data}}
</EXTRACTED>

---------------- STEP 1: CONDENSE ----------------

First, dedupe within each facet:
- PLOT: Same event different words = keep one
- GOALS: One per character
- REVEALS: Same fact different words = keep one
- STATE: One entry per entity, merge conditions
- STANCE: One entry per pair
- VOICE: Merge similar quotes, keep distinct character moments
- APPEARANCE: One entry per entity

---------------- STEP 2: FORMAT OUTPUT ----------------

SN: Copy from extracted. Do not rewrite.

RC:
- DEV: condensed plot + reveals, semicolon-separated
- PEND: condensed goals
- Format: "DEV: ...\\nPEND: ..."
- REVEALS GO HERE, not in sl

SL entries (one per entity, NEVER from reveals):
- STATE: t="state", n=entity, c=merged conditions, k=[entity]
- STANCE: t="stance", n="A-B", c=dynamic, k=[both names]
- VOICE: t="voice", n=speaker, c=quotes, k=[speaker]
- APPEARANCE: t="appearance", n=entity, c=description, k=[entity]
- VERBATIM: t="verbatim", n=title, c=exact copied text, k=[entities]

Output JSON only.`;

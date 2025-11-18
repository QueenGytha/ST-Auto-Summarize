// Validation prompts check format and structure
export const message_recap_error_detection_prompt = `You are validating a roleplay memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure.
2. Has a "recap" field (string) with headers in this order: "## Current Situation", "## Key Developments", "## Tone & Style", "## Pending Threads".
3. Has an "atmosphere" field (string) with brief sensory/mood context.
4. Has an "emotional_beats" field (string) with character emotional moments and triggers.
5. Each section uses bullet lines ("- ") with observable facts; Key Developments bullets may optionally start with a category tag in square brackets (e.g., [reveal]); no blow-by-blow narration.
6. Has a "setting_lore" field (array, may be empty).
7. Each setting_lore entry includes "name", "type", "keywords" (array), and "content" as bullet points.
8. Content begins with an identity bullet like "- Identity: <Type> — <Canonical Name>" and avoids pronouns for references; content may include Interaction Defaults, Psychology, Current Emotional State, and Micro‑Moments bullets when relevant.
9. Identity bullet's canonical name must exactly match the entry's canonical name, including full hyphen chain for sublocations.
10. Recap focuses on events + overall tone. Tone & Style may include brief Voice Anchors (per‑character speech patterns, address forms, dialogue conventions) and Moment Anchors (micro‑moments with ≤12‑word quotes + cues) to preserve vibe; detailed biographies belong in setting_lore entries.
11. For location entries that imply subareas via hyphenated canonical names (e.g., "Parent-Subarea" or "Parent-Child-Grandchild"), content includes a parent link bullet (e.g., "Located in: <ImmediateParent>") and uses a single hyphen as chain separators (preserving punctuation within names).
12. For item entries that include an "Owner change" bullet, the State bullet must reflect the current owner consistent with the latest transfer.
13. If setting_lore entries are present, each entry's canonical name should be mentioned at least once in the recap text (Current Situation or Key Developments) to maintain coherence.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Memory to validate:
{{recap}}`;

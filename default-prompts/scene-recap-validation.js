export const scene_recap_error_detection_prompt = `You are validating a scene memory extraction for proper format.

Check that the JSON meets these criteria:
1. Valid JSON structure.
2. Has a "scene_name" field (string) with a brief descriptive title.
3. Has a "recap" field (string) using the headers "## Current Situation", "## Key Developments", "## Tone & Style", "## Pending Threads" in that order.
4. Has an "atmosphere" field (string) with brief sensory/mood context.
5. Has an "emotional_beats" field (string) with character emotional moments and triggers.
6. Each section contains bullet lines with observable facts or outcomes from the scene (no speculation or biographies). Key Developments bullets may optionally start with a category tag (e.g., [plan], [reveal], [document]).
7. If the recap contains written content (letters, notes, inscriptions, contracts, prophecies) mentioned in scene, it must be captured verbatim in quotes with [document] tag, not summarized.
8. Has a "setting_lore" field (array, may be empty).
9. Every setting_lore entry includes "name", "type", "keywords" (array), and bullet-point "content" that starts with an identity bullet and uses specific names; content may include Interaction Defaults, Psychology, Current Emotional State, and Micro‑Moments when relevant.
10. Identity bullet's canonical name must exactly match the entry's canonical name, including full hyphen chain for sublocations.
11. Recap covers events and overall tone. Tone & Style may include brief Voice Anchors (per‑character speech patterns, address forms, dialogue conventions) and Moment Anchors (micro‑moments with ≤12‑word quotes + cues) that help preserve writing voice and vibe; detailed nuance lives in setting_lore entries.
12. For location entries with hyphenated canonical names indicating subareas (e.g., "Parent-Subarea", "Parent-Child-Grandchild"), content includes a "Located in: <ImmediateParent>" bullet and optionally a top-level link ("Part of: <TopLevel>"); chain separators are single hyphens (preserve punctuation in names).
13. For item entries that include an "Owner change" bullet, the State bullet must reflect the current owner consistent with the latest transfer.
14. If setting_lore entries are present, each entry's canonical name should be mentioned at least once in the recap text (Current Situation or Key Developments) to maintain coherence.

Respond with ONLY:
- "VALID" if all criteria met
- "INVALID: [specific issue]" if any criteria failed

Scene memory to validate:
{{recap}}`;

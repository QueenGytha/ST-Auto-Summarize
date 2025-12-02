Stage 1 Extraction – Postmortem (latest)
========================================

Scope
-----
- Covers the recent rewrite of `default-prompts/scene-recap-stage1-extraction.js` (runs ~102–107, baronial-0-18 test).
- Stage 1 is supposed to be extraction-only (sn + items), generic across roleplays, capturing high-signal facts and meaningful quotes with tone/nuance, no edge-casing or cross-stage knowledge.

What was changed
----------------
- Stripped cross-stage/DEV/PEND mentions; kept Stage 1 fully standalone.
- Added generic “no hallucination” rules: one fact per item, no inventing/altering counts/incidents.
- Added brevity/anti-catalog guidance and “quotes only when wording matters (speaker + brief context).”
- Removed RP-specific examples and any hard caps.

Observed output (run-107 @ temp 0.95, baronial-0-18)
----------------------------------------------------
- JSON valid, but items are long, catalog-like, and bundle multiple facts.
- Keeps static lists (population counts, “why ponies leave,” “advantages”) despite guidance to avoid catalogs.
- Hallucinations improved (caravan count fixed), but still paraphrases away tone.
- Meaningful quotes are not captured: confession song and banter are summarized, losing humor/voice/relationships.
- Relationship dynamics and emotional peaks flattened into generic summaries.

Test harness
------------
- Source messages: `prompt-testing/stage1/baronial-0-18.json` (Baron’s Honest Introduction, “messages”: 0–18).
- Runner: prompt-testing framework under `prompt-testing/results/run-107/` (default pipeline, Stage1 only).
- Model settings in that run: temperature 0.95 (matching regular user defaults), standard max tokens, no cross-stage tweaks.

Why it is not fit for purpose
-----------------------------
- Fails the core goal of preserving roleplay tone/nuance: no meaningful quotes are kept, humor is lost.
- Overlong, bundled items dilute signal and waste context budget.
- Still drifts into static catalogs instead of concise incident-level facts.
- Provides no reliable extraction of the “right things at the right granularity” for downstream when messages are dropped.

Root causes
-----------
- Prompt still too weakly enforced on: (a) one-fact-per-item, (b) strict avoidance of catalogs, (c) mandatory capture of meaningful quotes with speaker/context.
- Quote handling remains optional/soft, so the model paraphrases instead of quoting.
- Brevity guidance lacks hard prioritization, so the model fills space with lists.

Next steps (not yet done)
-------------------------
- Harden “one fact per item” and “no catalogs/static rosters unless the change itself is the fact.”
- Make meaningful quotes mandatory when wording carries intent/tone; include speaker + brief scene context.
- Prioritize incident/change-driven facts; demote/remove static background summaries.
- Re-test after tightening; if still failing, consider structural change (e.g., dedicated quotes lane) with downstream updates.

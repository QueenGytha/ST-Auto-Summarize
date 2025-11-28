# Prompt Iteration Guide

## Overview

This document captures lessons learned from prompt engineering for the extraction pipeline, the testing methodology, and critical constraints that must be followed.

## Critical Constraint: NO ROLEPLAY-SPECIFIC FINE-TUNING

**NEVER fine-tune prompts to specific roleplay content.**

This means:
- NO character names from test roleplays in examples (no "Rance", "Senta", etc.)
- NO plot-specific details in examples
- NO mechanics specific to one roleplay universe (mindspeech `_:text:_`, specific magic systems)
- Examples must use generic names: "Alex", "Sara", "Marcus", "Elena", etc.

**Why this matters:**
- Prompts must work across ALL roleplays, not just the test cases
- Fine-tuning to specific content masks underlying prompt weaknesses
- If the LLM needs roleplay-specific hints to follow rules, the rules themselves are unclear

**The test:** Could this prompt work identically for a medieval fantasy RP, a sci-fi RP, and a modern slice-of-life RP? If no, it's too specific.

---

## Known Prompt Issues

### 1. Voice/Quotes Extraction (MAJOR - Partially Addressed)

**Original problem:** "Voice" was defined as speech patterns, communication style, distinctive phrases. This was too abstract - the LLM couldn't consistently identify what qualified.

**Symptoms:**
- Extracted exposition as "voice" (plot revelations, explanations)
- Extracted generic expressions ("I love you", "Yes!")
- Missed actual relationship-defining moments
- Attribution errors (wrong speaker identified)

**Solution implemented:** Changed "voice" to "quotes" with concrete criteria:
- Only relationship-defining moments for callbacks
- Only commitments, oaths, promises worth referencing
- Required format: `"quote" (to whom, situation)`
- Snippets acceptable (don't need full speech)
- Explicit "NOT QUOTES" examples

**Current status:** Improved but needs testing. Key remaining questions:
- Is the LLM following the context format requirement?
- Is it still extracting exposition?
- Is attribution now correct?

### 2. Attribution Errors for Special Dialogue Formats

**Problem:** Roleplays often have special dialogue formats (telepathy, mindspeech, etc.) that confuse speaker attribution.

**Example:** `_:text:_` format for mindspeech - LLM sometimes attributes to wrong character.

**Why we can't fix this directly:** Adding rules for `_:text:_` would be fine-tuning to one roleplay's conventions.

**Attempted solutions:**
- Temperature adjustment (tested 0.3 vs 0.95) - didn't help, error appeared in 2/3 runs regardless
- This is a judgment issue, not randomness

**Current status:** Unsolved. The prompt says "ATTRIBUTION: Verify who is SPEAKING. Read context carefully." but LLM still fails sometimes.

### 3. Filtering Not Aggressive Enough (Stage 2 & 4)

**Problem:** Quality criteria say "EMPTY IS VALID" and give strict tests, but LLM still extracts marginal content.

**Symptoms:**
- Temporary conditions surviving ("exhausted from journey")
- Generic labels surviving ("grew closer", "trust deepened")
- Forced extraction when nothing qualifies

**Root cause:** LLM has bias toward producing output. "Empty array" feels like failure.

**Current status:** Prompt has strong language about empty being valid, but still not aggressive enough.

### 4. Redundancy Between Categories

**Problem:** Same information extracted in multiple places (arc + stance + quote all capturing same moment).

**Solution in progress:** Added redundancy checks:
- "Don't extract if meaning already captured in Arc or Stance"
- "ONE PER MOMENT: Multiple quotes from same defining moment = pick the best one"

### 5. Hidden System Prompt Conflict (FIXED)

**Problem:** `llmClient.js` was injecting a hidden system prompt for OpenAI-type APIs:
```
"You are a data extraction system. Output ONLY valid JSON. Never generate roleplay content."
```

This conflicted with the user prompt's "ROLE: Narrative archivist" framing and the LLM's need to understand roleplay to extract from it.

**Solution:** Removed the hardcoded system prompt entirely. Users now get exactly what's in their configured presets.

---

## Prompt Testing Infrastructure

### Location
```
prompt-testing/
├── config.js           # Default model settings
├── test-prompt.js      # CLI tool to send prompts
└── prompts/            # Test prompt JSON files
    └── sample.json     # Example format
```

### How It Works

1. Create a JSON file in `prompts/` with the prompt structure:
```json
{
  "system": "Optional system message",
  "user": "The main prompt with SCENE content",
  "prefill": "{"
}
```

2. Run the test:
```bash
node test-prompt.js prompts/your-test.json
```

3. Override parameters as needed:
```bash
node test-prompt.js prompts/your-test.json --temperature 0.3
node test-prompt.js prompts/your-test.json --temperature 0.95
node test-prompt.js prompts/your-test.json --max-tokens 5000
```

### Available Options
- `--temperature <n>` - Override temperature (default from config.js)
- `--max-tokens <n>` - Override max tokens
- `--top-p <n>` - Override top_p
- `--top-k <n>` - Override top_k
- `--model <name>` - Override model

### Config Defaults (config.js)
```javascript
{
  model: 'claude-sonnet-4-5-20250929',
  temperature: 0.5,
  max_tokens: 10000,
  top_p: 1,
  top_k: 0,
  presence_penalty: 0,
  frequency_penalty: 0,
  stream: false
}
```

---

## Testing Methodology

### Source Material

**Use real scenes from logs**, not fabricated test cases.

Logs location:
```
logs/characters/{CharacterName}/{ChatName}/
```

Log files contain fully-resolved prompts with:
- All macros expanded (`{{lorebook_entry_types_with_guidance}}`, `{{scene_messages}}`, etc.)
- Actual roleplay content
- The exact request sent to the LLM

### Creating Test Files

1. Find a relevant log file (e.g., `00247-generate_scene_recap-0-11.md`)
2. Extract the `user` content from the "Original Request Data" section
3. Copy to a new JSON file in `prompts/`
4. The prompt template comes from `default-prompts/` - use that for the structure
5. Replace `{{scene_messages}}` with actual scene content from the log

### Iteration Workflow

1. **Test in prompt-testing first** - don't modify `default-prompts/` until it works
2. **Run multiple times** - single runs don't show consistency issues
3. **Test at different temperatures** - some issues only appear at certain temps
4. **Compare outputs** - what changed? what's still wrong?
5. **Only update default-prompts once validated**

### What to Look For

When reviewing outputs, check:
- [ ] Are quotes in correct format with context?
- [ ] Is attribution correct?
- [ ] Are empty arrays used when nothing qualifies?
- [ ] Is there redundancy between categories?
- [ ] Are temporary conditions being filtered?
- [ ] Are generic labels being rejected?

---

## Temperature Testing Results

Tested scene 0-11 at temperature 0.95 vs 0.3:

**Finding:** Temperature doesn't fix core judgment issues.

- Attribution error (mindspeech) appeared in 2/3 runs regardless of temperature
- Both temperatures produced similar structural issues
- The problem is LLM judgment, not randomness

**Implication:** Don't rely on temperature tuning to fix prompt issues. Fix the prompt clarity instead.

---

## What Doesn't Work

### Arbitrary Caps
**FORBIDDEN per z-GOALS.txt.** No "maximum 3 quotes per scene" or similar. This masks root cause issues.

### Post-Processing / Tard-Wrangling
Adding code to fix LLM output after the fact means the prompt failed. Fix upstream.

### Human Review Requirements
This is an AUTOMATED summarization tool. Any solution requiring human review defeats the purpose.

### Additional Pipeline Stages
Each stage adds 1-2 minutes latency. Can't keep adding stages to fix issues from earlier stages.

### Roleplay-Specific Rules
See top of document. No exceptions.

---

## Files Reference

### Prompt Templates
- `default-prompts/scene-recap-stage1-extraction.js` - Main extraction prompt
- `default-prompts/scene-recap-stage2-organize.js` - Organization/filtering
- `default-prompts/scene-recap-stage4-filter-sl.js` - Final SL filtering

### Quality Goals
- `z-GOALS.txt` - Quality criteria and constraints (READ THIS)

### Entity Types (affects prompt macro)
- `entityTypes.js` - Defines `{{lorebook_entry_types_with_guidance}}` macro content

---

## Next Steps for Fresh Session

1. Set up test prompts in `prompt-testing/prompts/` with real scene data
2. Test the current QUOTES section changes
3. Evaluate:
   - Is context format being followed?
   - Is exposition being correctly rejected?
   - Are quotes appropriately trimmed?
   - Is redundancy being avoided?
4. If issues found, iterate on test prompts first
5. Only update `default-prompts/` once testing confirms improvement

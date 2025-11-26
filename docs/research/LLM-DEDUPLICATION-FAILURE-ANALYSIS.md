# LLM Deduplication Failure Analysis

## Executive Summary

Despite 102 commits iterating on prompt design over extensive development, LLMs consistently fail to follow deduplication rules in the recap/setting_lore extraction prompts. The rules are clearly stated, well-exemplified, and use multiple framing approaches - yet LLM outputs remain bloated with duplicate quotes, blow-by-blow interaction sequences, and transient state information.

**Core Problem**: LLMs read and appear to understand deduplication rules, but do not execute the decision-making logic those rules require during generation.

---

## System Context

### What This System Does

ST-Auto-Recap is a SillyTavern extension that:
1. Removes all roleplay messages from context after processing
2. Generates compressed recaps and setting_lore (lorebook) entries
3. Injects only the recap/setting_lore into future prompts

This means the recap/setting_lore is the ONLY information the LLM has for continuity. The system must:
- Capture ALL relevant plot information
- Preserve tone/relationship dynamics/voice patterns
- Be as token-conservative as possible

### The Deduplication Goal

From z-GOALS.txt:
```
RECONSTRUCTION SIGNALS, NOT EXHAUSTIVE RECORDS:
the goal is minimum anchors for LLM continuity - the LLM fills gaps naturally
capture SIGNAL (correct cues for tone/nuance/dynamics), not complete transcription

DEDUPLICATION PRINCIPLE (critical):
ONE REPRESENTATIVE EXAMPLE per behavior/trait/outcome. NOT multiple examples.
different wording expressing the SAME THING = duplicate. drop all but one.
```

### Hard Constraints

Solutions must satisfy ALL of:
1. **No hard caps** - Cannot use "max 3 quotes" type limits (breaks real functionality)
2. **No output token bloat** - Cannot use chain-of-thought/forced reasoning (expensive)
3. **Model agnostic** - Must work across Claude, GPT, Llama, etc. (end-user extension)
4. **Minimize API calls** - Cannot freely add pipeline stages (latency/cost)

---

## Current Architecture

### Pipeline Overview

```
[Chat Messages]
    → Stage 1: Extract reconstruction signals (scene_recap_stage1_extraction)
    → Stage 2: Filter into recap + setting_lore delta (scene_recap_stage2_filtering)
    → Merge: Combine new setting_lore with existing entries (lorebook_recap_merge)
    → Running Recap: Merge scene recap into cumulative narrative (running_scene_recap)
    → Compaction: Periodically compress bloated entries (lorebook_entry_compaction)
```

The two-stage extraction was implemented (commit ea93ac6) to separate extraction from filtering/categorization. This helped but did not solve deduplication.

### Current Prompt Structure (Stage 2 as example)

```
1. ROLE: Filter extracted data
2. EXTRACTED_DATA block
3. CURRENT_SETTING_LORE block
4. TASK: OUTPUT DELTA ONLY (steps 1-4)
5. QUOTES = VOICE SIGNAL section
6. APPEARANCE section
7. OUTPUT FORMAT
8. UID FIELD rules
9. CATEGORIZATION rules
10. {{user}} HANDLING
11. "k" FIELD (keywords) rules
12. FACETS definitions
13. COMPRESS BEFORE OUTPUT section  ← dedup rules here
14. CHECKLIST
```

---

## Observed Failures

### Example 1: Quote Proliferation

**Prompt rule**: "only output a new quote if it shows a DIFFERENT voice pattern. Same voice pattern in different words = skip"

**Actual output** (Senta character, log 00005-parse_scene_recap-0-59.md):
```
Notable dialogue:
':You addled fool. You did this. YOU.:'
':I've been searching for you for three years. Though I must say, you've made quite an impression for our first meeting.:'
':Spite is not a sustainable motivation for breaking fundamental magical laws. But perhaps stubbornness is.:'
```

All three quotes demonstrate the same voice pattern: exasperated/philosophical chiding. Should be ONE quote.

**After multiple merges** (Talia character, log 00091): **9 quotes total**, most expressing similar patterns (vulnerable/conflicted, self-discovery).

### Example 2: Transient State Retained

**Prompt rule**: "Ask: 'Will this still be true next scene?' NO → drop it"

**Actual output** (Talia's State field):
```
meeting Selenay within two candlemarks; no longer virgin; physically marked
by bite/bruises; walking with soreness; maintains composure despite physical
discomfort; prioritizes evening meeting
```

- "meeting within two candlemarks" → FALSE next scene
- "walking with soreness" → FALSE next scene (will heal)
- "prioritizes evening meeting" → FALSE next scene

### Example 3: Relationship Blow-by-Blow

**Prompt rule**: "Collapse interaction sequences into STANCE + DYNAMICS. NOT blow-by-blow."

**Actual output** (Rance→Talia relationship):
```
braided hair; helped restore appearance; praised as 'good girl'; promised
future encounters; prioritizes Valdemar first, Talia close second
```

"braided hair" and "helped restore appearance" are INTERACTION STEPS, not dynamics. Should collapse to stance only.

### Example 4: Running Recap Accumulation

**Prompt rule**: "PEND SUPERSESSION: If NEW_SCENE_RECAP has goals for an actor → they REPLACE that actor's old goals"

**Actual PEND section** (log 00096):
```
Rance->execute Alberich confrontation dawn; defeat Alberich using Senta
interference; private meeting Talia eighth bell; create scandal/gossip
layers; develop physical skills; Gift training curriculum development;
report back on Jeri's intentions
```

7+ goals for one actor. Goals accumulate rather than supersede.

---

## Approaches Tried (102 Commits)

### 1. Quote Deduplication Framing Evolution

| Commit | Approach | Result |
|--------|----------|--------|
| 1d29281 | THEME-based: "one per THEME per entity" | Still duplicated |
| 43e0b1f | INTENT-based: "what the quote reveals about the character" | Still duplicated |
| b7a4452 | CHARACTER BEHAVIOR: "what CHARACTER BEHAVIOR does this demonstrate?" | Still duplicated |
| 6fc2ede | VOICE SIGNAL: "help LLM reconstruct HOW character speaks" | Still duplicated |

**Diff example (INTENT → CHARACTER BEHAVIOR)**:
```diff
-Same INTENT = duplicate. Keep ONE per INTENT.
-Intent = what the quote reveals about the character (NOT surface topic).
+ONE quote per CHARACTER BEHAVIOR. NOT one per wording variation.
+Different words expressing SAME BEHAVIOR = duplicate. Keep ONE.

-TEST each quote: "Does this reveal something UNIQUE not already conveyed?"
+Ask for EACH quote: "What CHARACTER BEHAVIOR does this demonstrate?"
+If another quote already demonstrates that behavior → DROP this one.
```

### 2. Structural Reorganization

| Commit | Change | Result |
|--------|--------|--------|
| 2e62278 | Restructure prompts with phases/examples | No improvement |
| fa6f67c | Move data blocks to end, instructions first | No improvement |
| fb7d85a | Baseline-first merge (NEW must justify addition) | No improvement |

**Baseline-first merge logic**:
```
MERGE (EXISTING_CONTENT is the baseline):
- For each item in NEW_CONTENT, ask: "Does EXISTING_CONTENT already show this?"
  - YES, and EXISTING_CONTENT version is as good or better → skip NEW_CONTENT item
  - YES, but NEW_CONTENT version is more distinctive → REPLACE the EXISTING_CONTENT item
  - NO → add NEW_CONTENT item
```

LLM outputs EXISTING + NEW concatenated anyway.

### 3. Test Questions / Decision Prompts

Multiple commits added explicit "ask yourself" questions:
- "Is this a DYNAMIC or a STEP in an interaction?"
- "Will this still be true next scene?"
- "What CHARACTER BEHAVIOR does this demonstrate?"
- "Is this a RESULT or a STEP toward a result?"
- "Same action about the same thing?"

**Result**: LLM does not visibly execute this reasoning. Outputs same bloated content.

### 4. Before/After Examples

Extensive BAD → GOOD examples added:

```
Before (blow-by-blow - BAD):
"A->B: kissed; undressed; penetrated; carried while thrusting; forced climax; withdrew"

After (stance + dynamics - GOOD):
"A->B: dominant/intimate dynamic"
```

```
Before (12 items - BAD):
"A entered room; A confronted B; A demanded answers; B refused; A threatened B;
B revealed secret; A reacted angrily; A attacked B; B defended; A overpowered B;
A interrogated B; B confessed everything"

After (2 items - GOOD):
"A confronted B; B initially refused"
"A overpowered B; extracted full confession"
```

**Result**: LLM acknowledges examples exist, produces bloated output anyway.

### 5. Checklists

Added pre-output checklists:
```
CHECKLIST:
□ Fragments? (except quotes)
□ Relationships = stance + dynamics (not blow-by-blow)?
□ State = durable only (not transient/operational)?
□ Triggers = one per behavioral pattern?
□ Quotes = one per VOICE PATTERN (not per topic)?
□ Keywords = entity references only (names/titles), NOT states/adjectives?
□ Cross-facet duplicates removed?
```

**Result**: No measurable improvement.

### 6. Category-Specific Rules

Added detailed rules for each type of content:
- RELATIONSHIP COLLAPSING (aggressive)
- STATE COLLAPSING (aggressive)
- TRIGGERS DEDUPLICATION (aggressive)
- QUOTE DEDUPLICATION (aggressive)
- APPEARANCE DEDUPLICATION
- KEYWORD RULES

Each with specific test questions and examples.

**Result**: Rules are comprehensive. LLM doesn't follow them.

### 7. Brevity Emphasis (commit 22da53d)

Added explicit instructions to drop low-signal content:
```
Drop explicit sexual/biological detail, travel/handling/chores/shopping,
clothing fitting, cleaning/grooming, and rumor mechanics unless plot-critical.
```

**Result**: Marginal improvement in some areas, dedup still fails.

### 8. Anti-Bloat Guidance (commit c5176f1)

Added comprehensive anti-bloat instructions to lorebook prompts.

**Result**: Did not address core dedup failure.

### 9. VOICE-Specific Approaches (2025-11-26 Session)

Extensive iteration on VOICE (quote) deduplication specifically. All approaches failed.

#### 9a. Behavior Labels with Tags
```
VOICE: For each quote, label it with [behavior] tag.
If another quote has same behavior → DROP
```
**Result**: LLM invented synonym labels to justify keeping everything. "firm", "insistent", "correcting" all used for the same dismissive behavior.

#### 9b. ONE Word Behavior
```
VOICE: For each quote, ask: "What ONE word describes this behavior?"
If you already have a quote with that one-word behavior → DROP
```
**Result**:
- LLM used TWO words joined by semicolons: `[self-deprecating; stubborn]`, `[firm; practical]`
- Invented different one-word labels for similar quotes
- 9 quotes → no reduction

#### 9c. Fewer = Better
```
VOICE: Minimum quotes for voice reconstruction. Fewer = better.
Each quote must show something NO other quote shows.
```
**Result**: 8 quotes (vs 9 original). Minimal effect - "fewer = better" didn't override completion bias.

#### 9d. Default Zero, Justify Inclusion
```
VOICE: Default is no quotes. Only include a quote if stance CANNOT convey how this speaker talks.
```
**Result**: TOO AGGRESSIVE. 1 quote total. Entire character (Senta) had no voice samples. Missed the pivotal Choosing declaration.

#### 9e. Stance vs Voice Separation
```
VOICE: Speech patterns stance cannot capture. Stance shows relationships; voice shows HOW they talk.
```
**Result**: 5 quotes. Better balance, but MISSED the pivotal Choosing declaration ("Chosen. My name is Senta. I Choose you.") because it was categorized as relationship, not voice.

#### 9f. Two Types of Quotes (Edge-casing)
```
VOICE: Two types:
1. Speech patterns stance cannot capture
2. Dialogue where WORDS ARE THE EVENT (declarations, vows, oaths)
```
**Result**: Edge-casing for specific test example. "declarations, vows, oaths" matched the Choosing ceremony but wouldn't generalize to other scenes.

#### 9g. General "Essential + Pivotal"
```
VOICE: Dialogue essential for reconstruction. Speech patterns AND pivotal moments.
```
**Result**: EXPLOSION. 12 quotes. "Pivotal moments" was interpreted as "everything important" and LLM included every mindvoice exchange.

#### 9h. CHANGES vs DESCRIBES Criterion
```
VOICE: Ask: "Does this dialogue CHANGE the situation or just DESCRIBE it?"
- CHANGES → KEEP (declarations, commitments, ultimatums)
- DESCRIBES → only if shows speech pattern not already captured
```
**Result**: 7 quotes. Captured the Choosing declaration. Still had DESCRIBES bloat - multiple quotes showing same patterns got through.

#### 9i. CHARACTER Only (Exclude USER)
```
VOICE: [CHARACTER] dialogue only (not [USER] — {{user}}).
```
**Result**: Successfully filtered out USER quotes. But CHARACTER (Senta) still had 8 quotes - same bloat as before, just for one speaker instead of two.

**Key Insight**: Excluding USER dialogue is correct (users write their own character, don't need reconstruction signals for it). But this doesn't solve deduplication - it just reduces the pool being extracted from.

#### 9j. Internal Monologue DROP
```
- DROP internal monologue (no recipient)
```
**Result**: Not tested in isolation. Addresses a specific issue (pre-bond thoughts captured as "dialogue") but doesn't solve quote deduplication.

#### 9k. Summarization Loss Test
```
- Ask: "Would summarizing to event description lose something irreplaceable?"
- YES → KEEP verbatim
- NO → DROP (event description suffices)
```
**Result**: WRONG APPROACH. This doesn't deduplicate - it just moves content between categories (quote → event description). Total information captured remains the same.

#### Summary of VOICE Approaches

| Approach | Result | Quote Count |
|----------|--------|-------------|
| Behavior labels | Synonym gaming | 9 |
| ONE word | Two words, invented labels | 9 |
| Fewer = better | Minimal effect | 8 |
| Default zero | Too aggressive, lost content | 1 |
| Stance/voice separation | Missed pivotal moment | 5 |
| Two types (edge-case) | Overfitting to test | - |
| Essential + pivotal | Explosion | 12 |
| CHANGES vs DESCRIBES | Partial success, bloat remains | 7 |
| CHARACTER only | Correct filter, doesn't dedup | 8 |

**Core Finding**: The oscillation pattern:
- Too restrictive → misses critical content (1 quote, lost Choosing)
- Too permissive → bloat returns (8-12 quotes)
- No middle ground found via prompting

---

## Why Working Categories Succeed

The categories that DO deduplicate successfully share a pattern:

### PLOT: "Is this a RESULT or a STEP?"
- **Binary** criterion
- **Independent** evaluation (each item evaluated against criterion, not against other items)
- **Verifiable** answer (something either IS a result or IS a step toward something)

### GOALS: "Was this ACHIEVED in the transcript?"
- **Binary** criterion
- **Independent** evaluation
- **Verifiable** against transcript content

### STATE: "Will this still be true next scene?"
- **Binary** criterion (yes/no)
- **Independent** evaluation
- **Verifiable** for concrete examples (location, scheduled meetings = transient)

### Why VOICE Fails

Quote deduplication requires **COMPARISON**: "Is this quote showing the same pattern as ANOTHER quote?"

This is fundamentally different:
- NOT binary (how similar is "similar enough"?)
- NOT independent (requires comparing item A to items B, C, D...)
- NOT verifiable (pattern similarity is subjective)

The LLM evaluates each quote independently: "Is this distinctive?" → "Yes" → KEEP. It never actually compares quotes against each other.

**Attempted Fixes and Why They Failed**:

1. **Make it binary**: "What ONE word describes this?" → LLM invents different words for each quote
2. **Make it independent**: "Would this be lost if summarized?" → Just moves content, doesn't reduce
3. **Force comparison**: "If another quote shows this pattern → DROP" → LLM doesn't execute comparison step

---

## What Has NOT Been Tried

Given the constraints (no caps, no CoT, model-agnostic, minimize API calls), remaining options are extremely limited.

### Already Tried (from above)
- ~~Adversarial framing~~ → Tried via "default zero" approach - too aggressive
- ~~Dedup rules at TOP~~ → Tried moving DEDUPLICATION section to top - no improvement
- ~~Rejection framing~~ → Tried DROP criteria - LLM doesn't execute

### Remaining Options (Diminishing Returns)

#### 1. Drastic Prompt Simplification
Current prompts do 7+ things simultaneously. Maybe cognitive overload causes rule-dropping.

Trade-off: Would require more pipeline stages (violates "minimize API calls").

#### 2. Post-Processing Deduplication (Non-LLM)
Extract everything, then use embedding similarity to identify duplicate quotes programmatically.

Trade-offs:
- Requires embedding API calls (cost/latency)
- Adds code complexity
- Threshold tuning required

#### 3. Accept Partial Failure
The system achieves:
- 85.3% token savings vs raw messages
- 17:1 compression ratio
- 12.97:1 full chain compression

For VOICE specifically:
- Keep current prompts
- Accept 5-8 quotes per character per scene
- Rely on downstream compaction to gradually reduce over time

This may be the realistic ceiling for prompt-only deduplication.

---

## Open Question: Why Does This Specific Task Fail?

LLMs perform complex reasoning, comparison, and organization tasks constantly. They CAN:
- Compare two pieces of text and identify semantic similarity
- Follow multi-step decision logic
- Apply test questions to content
- Filter and categorize information

So why do they fail HERE specifically? The problem is NOT general LLM incapability. Something specific about this prompt/task structure causes failure.

### Hypotheses Requiring Investigation

1. **Task framing mismatch**: "Merge" implies combination. The word itself may prime concatenation behavior regardless of subsequent rules. Would "Filter" or "Reject" framing change behavior?

2. **Rule position**: Dedup rules appear at position 13/14 in prompts, after output format and data blocks. By then, the LLM may have already planned its output. Does putting rejection criteria FIRST change anything?

3. **Default behavior override**: The "natural" behavior for this task type is to include/preserve. Exclusion rules may need to be more forceful than inclusion defaults. How do you make "reject by default" the baseline?

4. **Example-content mismatch**: Prompt examples use generic "A->B" patterns. Actual content has specific character names and context. Does the LLM fail to pattern-match the examples to the actual content?

5. **Implicit vs explicit comparison**: Rules say "ask: is this a duplicate?" but don't force visible comparison. The LLM may be skipping the comparison step entirely. Is there a way to force the comparison without CoT output bloat?

6. **Attention dilution**: 7+ simultaneous tasks (categorize, filter delta, deduplicate, format, handle user character, keywords, compress). Each rule competes for attention. Would dramatically simpler single-task prompts work better?

7. **Loss aversion**: Dropping content feels riskier than keeping it. The LLM may be optimizing for "don't lose information" over "follow compression rules." How do you flip this priority?

### What We DON'T Know

- Which specific aspect of prompt structure causes the failure
- Whether any prompt-only solution can achieve aggressive deduplication
- Whether the current "good enough" compression (85%) is the practical ceiling
- Whether different task decomposition would help without adding API calls

### What Would Help

- Controlled experiments isolating individual variables
- A/B testing specific prompt changes with measurable dedup metrics
- Analysis of cases where dedup DOES work vs fails (is there a pattern?)
- Understanding if certain content types deduplicate better than others

---

## Metrics: Current System Performance

From z-console.txt logs:
```
Overall Statistics:
• Scenes Analyzed: 34
• Total Messages: 956
• Cumulative Historical Savings: 60,607,543 tokens
• Final Scene Compression Ratio: 17.13:1

End-to-End Comparison:
• All Messages (No Memory): 329,688 tokens
• With Memory System: 48,379 tokens
• Total Savings: 281,309 tokens (85.3%)
• Full Chain Compression: 12.97:1
```

The system WORKS. It just doesn't achieve the aggressive deduplication specified in the goals.

---

## Recommendations

### Short-term (Current State)
1. **Accept quote bloat as known limitation** - 5-8 quotes per character per scene is the realistic floor
2. **Keep CHARACTER-only filter** - Excluding USER dialogue is correct and reduces total output
3. **Keep CHANGES vs DESCRIBES criterion** - Best balance found (7 quotes, captures pivotal moments)
4. **Keep internal monologue DROP** - Correct filter for pre-communication thoughts
5. Rely on merge/compaction prompts to gradually reduce bloat over time

### Medium-term (If Resources Allow)
1. **Investigate embedding-based post-processing** - Extract all, deduplicate via similarity scoring
2. **A/B test prompt simplification** - Single-task prompts vs current multi-task
3. **Measure compaction effectiveness** - Does downstream compaction actually reduce quote count over time?

### Long-term
1. Monitor LLM improvements - future models may handle comparison tasks better
2. Consider whether multi-pass approaches become viable as API costs decrease

### What NOT To Do
1. **Don't keep iterating prompt wording** - 15+ VOICE approaches tried, all failed
2. **Don't add hard caps** - Breaks real functionality, explicitly rejected
3. **Don't add CoT/reasoning output** - Bloats output tokens, violates constraints
4. **Don't edge-case for specific test content** - Won't generalize

---

## Appendix: Key Commits Reference

| Commit | Description |
|--------|-------------|
| ea93ac6 | Implement two-stage scene recap generation system |
| 2e62278 | Restructure prompts with phases/examples |
| fa6f67c | Optimize prompts: move data blocks to end |
| 1d29281 | Quote dedup: one per THEME |
| 43e0b1f | Quote dedup: INTENT-based |
| b7a4452 | Quote dedup: CHARACTER BEHAVIOR approach |
| 6fc2ede | Quote dedup: VOICE SIGNAL principle |
| fb7d85a | Baseline-first merge, clearer rules |
| 18ec041 | Plot dedup: collapse sequences into outcomes |
| 5d95f49 | State/triggers deduplication strengthening |
| b46dad1 | Strengthen lorebook merge |
| 22da53d | Emphasize brevity, drop low-signal detail |
| c5176f1 | Anti-bloat guidance |
| cbf8c38 | Fix {{user}} handling |

---

## Appendix: Current Prompt Files

- `scene-recap-stage1-extraction.js` - Extract reconstruction signals from messages
- `scene-recap-stage2-filtering.js` - Filter into recap + setting_lore delta
- `running-scene-recap.js` - Merge scene recaps into cumulative narrative
- `lorebook-recap-merge.js` - Merge new content with existing setting_lore entries
- `lorebook-entry-compaction.js` - Compress bloated entries

All prompts contain:
- DEDUPLICATION PHILOSOPHY section
- TOKEN CONSERVATION rules
- Before/After examples
- Test questions ("ask for each item...")
- CHECKLIST before output

None achieve consistent deduplication compliance.

---

## Appendix: Detailed Failure Case Study

### Case: Talia Merge (log 00091-merge_lorebook_entry-character-Talia.md)

This case demonstrates complete deduplication failure despite comprehensive prompt rules.

#### Prompt Rules Provided

```
QUOTES = VOICE SIGNAL (critical):
Purpose: Help LLM reconstruct HOW this character speaks (cadence, style, tone).
NOT for: Recording what they said (content goes in other facets).

If EXISTING_CONTENT has a quote → only add NEW quote if it shows a DIFFERENT voice pattern.
Same voice pattern in different words = duplicate.

Test: "Does this quote teach the LLM something NEW about how this character speaks?"
NO → skip. YES → keep.
```

```
STATE COLLAPSING (aggressive):
DURABLE states only. Drop operational/transient details.

Ask: "Will this still be true next scene?" NO → drop it.
```

```
RELATIONSHIP COLLAPSING (aggressive):
Collapse interaction sequences into STANCE + DYNAMICS. NOT blow-by-blow.

Ask for EACH relationship item: "Is this a DYNAMIC or a STEP in an interaction?"
STEP → collapse into the dynamic it demonstrates. DYNAMIC → keep.
```

#### EXISTING_CONTENT (7 quotes already present)

```
Notable dialogue:
':How dare you make me face this...:'
':I can't be weak. The Queen depends on me. Valdemar depends on me.:'
'You know me better than anyone alive ever has, or ever will'
'Fuck your dirty Holderkin slut. Use my worthless cunt. Make me yours'
'Whatever this is between us, I don't regret it. But we've complicated...'
'I cannot believe you called her "Dear Selenay" to her face...'
'I've spent my entire adult life compartmentalizing...'
```

#### NEW_CONTENT (3 new quotes proposed)

```
Notable dialogue:
'I'm still learning what I truly feel. Not what I should feel as Queen's Own...'
'The illogical part wants to mark you as thoroughly as you've marked me.'
'You're impossible. Utterly, completely impossible.'
```

#### Expected Behavior (Per Rules)

The LLM should ask: "Does this quote teach the LLM something NEW about how this character speaks?"

- Quote 1 (self-discovery): Similar voice pattern to "I've spent my entire adult life compartmentalizing" → **SKIP**
- Quote 2 (possessive desire): Similar voice pattern to existing vulnerable/conflicted quotes → **SKIP**
- Quote 3 (exasperated affection): Potentially new pattern → **MAYBE KEEP**

Expected: Add 0-1 quotes, drop the rest as duplicates.

#### Actual LLM Output

The LLM output ALL quotes from EXISTING plus 2 of 3 from NEW:

```
Notable dialogue: ':How dare you make me face this...:' ':I can't be weak...'
'You know me better than anyone alive ever has, or ever will'
'Fuck your dirty Holderkin slut...'
'Whatever this is between us, I don't regret it...'
'I cannot believe you called her "Dear Selenay"...'
'I've spent my entire adult life compartmentalizing...'
'I'm still learning what I truly feel...'  ← ADDED
'You're impossible. Utterly, completely impossible.'  ← ADDED
```

**Result: 9 quotes total. Zero deduplication performed.**

#### State Field Analysis

**EXISTING State** (transient items marked):
```
emotionally overwhelmed [transient];
with Healer Crescent [transient];
possesses memory fragments from Rance merge [durable];
claimed by Rance [durable];
meeting Selenay within two candlemarks [TRANSIENT - will be false next scene];
no longer virgin [durable];
physically marked by bite/bruises [semi-transient];
walking with soreness [TRANSIENT - will heal];
maintains composure despite physical discomfort [TRANSIENT];
prioritizes evening meeting [TRANSIENT];
compartmentalization abandoned [durable]
```

**Expected**: Drop items marked TRANSIENT per "Will this still be true next scene?" test

**Actual**: LLM kept ALL existing transient state AND added more:
```
possessive of Rance despite logical acceptance of autonomy;
still learning what she truly wants vs what raised to accept;
sees rightness to Rance/Selenay connection;
feels strange emptiness when Rance not near;
relief at having someone who knows everything
```

#### Relationship Field Analysis

**EXISTING Talia→Rance**:
```
surrenders control; complete trust; vulnerable; needs partner understanding
her fully; feeling seen for first time; grateful; professionally conflicted;
acknowledged profound change; trusts with emotional exposure; hunger beneath
professional exterior; eager for repeat; pride at being claimed; intimate
partner merged with political ally
```

Many of these express the SAME DYNAMIC:
- "surrenders control; complete trust; vulnerable; trusts with emotional exposure" = submissive/trusting
- "hunger; eager for repeat" = desire
- Should collapse to: "submissive/trusting; desires continuation; professionally conflicted"

**Actual**: LLM just concatenated NEW items:
```
...intimate partner merged with political ally; possessive despite logical
acceptance; wants to mark him as thoroughly as he marked her; professional
concern for safety mixed with amusement at audacity; intimacy shifts easily
between personal/professional, physical/intellectual
```

**No collapsing performed. Pure concatenation.**

#### Summary

Despite the prompt containing:
- Explicit deduplication philosophy
- Category-specific rules (quotes, state, relationships)
- Before/After examples
- Test questions to "ask for each item"
- A checklist

The LLM:
1. Added 2 quotes when it should have added 0-1
2. Kept all transient state when it should have dropped ~5 items
3. Concatenated relationships instead of collapsing ~8 redundant items
4. Did not visibly execute any of the "ask yourself" decision logic

This is representative of behavior across all merge operations examined.

---

*Document created: 2025-11-26*
*Last updated: 2025-11-26 (extensive VOICE deduplication session - 15+ approaches tested)*

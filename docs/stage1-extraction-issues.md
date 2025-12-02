Stage 1 Extraction: Issues and Working Notes
=============================================

## BASELINE PROMPT (established 2024-12-02)

Location: `default-prompts/scene-recap-stage1-extraction.js`

```javascript
TASK: Extract what an LLM would need to continue this story consistently.

After this scene is gone from context, what must remain for the story to feel continuous?

EXTRACT:
- What happened (events, decisions, revelations, changes)
- Who was involved and how they relate (specific dynamics, not labels)
- Words that carry weight (oaths, confessions, threats, jokes that define character) - keep exact wording with speaker and context
- Facts and numbers that characters care about (if they discussed it, it matters to them)
- Conditions that would cause contradictions if forgotten
- Unresolved threads (problems raised, questions unanswered, threats looming)

LEVEL OF DETAIL:
Capture SUBSTANCE - the specific dynamics, concrete facts, what makes interactions unique.

NOT labels: "trust deepened" / "they grew closer" / "tension increased"
These tell the LLM nothing. What SPECIFICALLY happened?

NOT transcript: blow-by-blow action sequences, every line of dialogue
This wastes tokens on sequence instead of meaning.

YES substance: The specific dynamic. The concrete fact. What makes THIS relationship or situation different from a generic one.

For quotes: Keep exact wording only when the words themselves matter (will be referenced later, reveal character, establish commitment). Include who said it, to whom, and brief context for why it matters.

OUTPUT (JSON):
{
  "sn": "3-5 word scene title",
  "extracted": [
    "Each meaningful piece of content as its own item",
    "CharacterName: what they did/said/revealed and why it matters",
    "Quote with context when wording matters",
    "Facts/numbers/status that characters focused on",
    "Relationship dynamics with SPECIFIC details not labels"
  ]
}
```

### Design Principles
- Focus on "what would the LLM need to continue this story consistently"
- Emphasize SUBSTANCE (not labels, not transcript)
- No escape hatches in language
- Genre-agnostic: "if characters discussed it, it matters to them"
- Quotes WITH context as a unit

### Verified Performance (runs 113-115)
- **baronial-0-18** (estate management): All numbers preserved, political relationships with specifics, confession meaning captured
- **scene-0-11** (fantasy action): Gift awakening, Choosing quote, evidence, character dynamics
- **scene-83-113** (intimate/relationship): Dynamic substance, Holderkin background, physical markers with implications

### Known Minor Gaps
- Dynamic tension in conflict scenes could have more texture (run-114)
- NSFW content includes some physical detail that could condense (run-115)
- Character physical descriptions not always captured

---

## Development History

### Iteration 1 - Substance-focused extraction

### Results - baronial-0-18 (estate management scene)

**GOOD - Captured correctly:**
- Population breakdown (340 total, 280 earth, 40 pegasi, 20 unicorns, breakdown by role)
- Treasury status (150 bits, choice between security OR surplus)
- Military composition (12 guards, 4 night watch, 40 militia "farmers with pitchforks", 4 veterans vs 8 local recruits)
- Political relationships with SPECIFIC substance:
  - Thornford: "considers Kordas 'barely above jumped-up sergeant', will trade but won't provide aid"
  - Stormridge: "reliable but 3 hours away and has own problems with griffon raiders"
  - Meadowvale: "views frontier holdings as 'expendable buffer territories', denied petitions twice"
- Everfree escalation (17 vs 9 incursions, missing scouts, intelligent coordination, caravan mystery)
- Practical decisions (cancel feast, repurpose horses) with staff reaction
- The confession song captured with its MEANING, not just "he sang a song"
- Staff reaction with substance: "honest chaos better than dishonest order", increased respect through honesty
- Youth exodus with specific examples (granddaughter age 16 to Thornford, brother to Fillydelphia, nephew to Royal Guard Academy)
- Key quotes WITH context (Hearthglow on hope requiring proof, Vesper on truth, Bulwark on traditional strategy failing)
- Core crisis identified ("not a place worth investing a life in")
- Weather team problems (6/10 staff, lost one to Cloudsdale, Thornford could loan "for a price")
- Training rotation proposal
- Literacy issue (20 ponies can read beyond names)

**POTENTIALLY MISSING:**
- Character physical descriptions (Bulwark's limp/scars, Meadow Sage's appearance, Vesper's bat pony features)
- Some first-appearance intro details

**ASSESSMENT:**
This is capturing substance at the right level of detail. Numbers preserved when they matter. Quotes have context. Relationships are specific not labeled. The confession is captured for what it MEANS, not just that it happened.

The genre-agnostic approach ("if they discussed it, it matters") worked well for estate management content - the numbers and logistics were preserved because the characters were focused on them.

### Cross-Genre Verification (run-114, run-115)

**scene-0-11: Lisle Destruction and Choosing (Fantasy action)**
- ✅ World context (Valdemar, borders, Companions)
- ✅ Rance's condition (Gift-shock, burned channels)
- ✅ The Choosing with EXACT QUOTE and meaning
- ✅ Evidence (red robes under bandit garb, Menmellith)
- ✅ Character dynamics (stubborn, called Senta "insufferable horse")
- ✅ Senta's full description and 3-year unpartnered status
- ✅ Unresolved threats (watchers, captured villagers, attacker identity)

**scene-83-113: Morning Cottage Intimacy (Relationship/intimate)**
- ✅ Political context (Co-Advisors, secret arrangement)
- ✅ Vulnerability quotes with context (arranged marriage, nightmares, fear)
- ✅ Priority hierarchy quote ("Valdemar first, Queen, then you")
- ✅ Dynamic SUBSTANCE (why surrender liberating - years of responsibility)
- ✅ Holderkin background shaping dynamic (not just "degradation" but WHY)
- ✅ Physical markers with implications (bite mark hidden under Whites)
- ✅ Time constraints and unresolved threads

**ASSESSMENT: Prompt generalizes across genres**
- Estate management: Numbers/logistics preserved
- Fantasy action: Magic/mystery/bonds preserved
- Intimate/relationship: Dynamics/vulnerabilities preserved
- NOT producing transcript or labels in any genre
- Capturing substance consistently

### Next Steps
- Consider whether character physical descriptions need explicit prompting
- Evaluate if organization would help downstream without adding escape hatches
- Present to user for review

---

## Previous Issues (historical reference)

### Problems with prior approach
1. OUTPUT STRUCTURE - Flat list of decontextualized items
2. ESCAPE HATCHES - "If uncertain, omit", "when meaningful", "if significant"
3. CONTRADICTORY INSTRUCTIONS - "One signal per item" vs "quotes need context"
4. UNIVERSAL STRIP RULES - "Don't enumerate" destroyed genre-relevant content
5. PREVENTION-BASED DESIGN - Focused on what NOT to do rather than what TO do
6. RULE ACCUMULATION - Each failure led to another rule, never fixed core issues

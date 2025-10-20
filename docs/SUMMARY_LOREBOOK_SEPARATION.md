# Summary and Lorebook Separation - Design Document

**Version:** 2.0
**Date:** 2025-01-20
**Purpose:** Define the clear separation between timeline summaries and lorebook-worthy details

---

## Core Concept

The new JSON structure separates memory into two distinct concerns:

1. **Summary** - High-level timeline of what happened (minimal tokens, no nuance)
2. **Lorebooks** - Detailed reference information with nuance (lorebook entries with keywords)

This separation allows the AI to:
- Quickly understand "what happened" from the summary (low token cost)
- Retrieve detailed information only when keywords are triggered (efficient context usage)
- Manage context more effectively by separating timeline from reference data

---

## JSON Structure

```json
{
  "summary": "High-level timeline of what occurred in this scene/message",
  "lorebooks": [
    {
      "name": "Entity Name",
      "type": "character|location|item|faction|concept|lore",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "content": "Detailed description with all the nuance"
    }
  ]
}
```

---

## Field Definitions

### Summary (string, required)

**Purpose:** Minimal-token timeline of what happened

**What to include:**
- Events that occurred (outcomes only, not process)
- State changes (location changes, relationship changes, status changes)
- Timeline narrative (what led to what)
- Current situation after the scene

**What NOT to include:**
- Detailed descriptions of characters, locations, or items
- Background information or lore details
- Personality traits or appearances
- Complex nuance or subtext

**Token target:** 100-300 tokens maximum

**Style guidelines:**
- Terse, factual statements
- Focus on WHAT HAPPENED, not WHO/WHAT things are
- Past tense for completed actions
- Present tense for current state
- No flowery language or unnecessary adjectives

**Examples:**

✅ **Good:**
```
"Alice and Bob traveled to the Eastern Ruins. They discovered the ancient temple had been ransacked. Bob revealed he knows who the thief is but refused to share. Alice became suspicious of Bob's motives. They made camp outside the ruins for the night."
```

❌ **Bad (too much detail/nuance):**
```
"Alice, a skilled warrior with red hair and a confident demeanor, traveled alongside Bob, a mysterious rogue with questionable loyalties, to the Eastern Ruins, an ancient site filled with crumbling architecture and mystical energy. Upon arrival, they found that someone had broken into the sacred temple and stolen the Sunblade, a legendary weapon of immense power."
```

### Lorebooks (array, optional)

**Purpose:** Detailed reference information that can be converted to lorebook entries

**What to include:**
- NEW entities discovered in this scene
- UPDATES to existing entities
- Detailed descriptions WITH nuance
- Background information and context
- Personality traits, appearances, capabilities

**What NOT to include:**
- Pure timeline events (those go in summary)
- Temporary one-time mentions
- Information that won't be relevant again

**Entry structure:**

#### `name` (string, required)
The canonical name of the entity

#### `type` (string, required)
Category of the entity:
- `character` - Major NPCs, recurring characters
- `location` - Significant places that may be revisited
- `item` - Important objects, artifacts, equipment
- `faction` - Groups, organizations, factions
- `concept` - Abstract concepts, magic systems, world rules
- `lore` - World-building facts, historical events

#### `keywords` (array of strings, required)
Trigger words that should activate this lorebook entry
- Include the entity's name
- Include aliases and alternate names
- Include related terms that would benefit from this context
- Minimum 2 keywords, maximum 8 recommended

#### `content` (string, required)
The detailed description WITH nuance
- This is where ALL the detail goes
- Include personality, appearance, capabilities
- Include relationships and context
- Include significance and background
- Be thorough but organized
- Token target: 50-200 tokens per entry

**Example entries:**

```json
{
  "name": "Alice",
  "type": "character",
  "keywords": ["Alice", "warrior woman", "red-haired warrior"],
  "content": "Skilled warrior. Red hair, green eyes, late 20s. Confident and direct in speech. Military background shows in posture and discipline. Searching for the stolen Sunblade which was entrusted to her family. Trusts {{user}} but growing suspicious of Bob's secretive behavior. Quick to anger when feeling deceived."
}
```

```json
{
  "name": "Eastern Ruins",
  "type": "location",
  "keywords": ["Eastern Ruins", "ancient temple", "ruins", "sacred site"],
  "content": "Ancient temple complex in the eastern mountains. Stone structures overgrown with vines. Central temple dedicated to the Sun God, now ransacked. Sacred vault broken open, Sunblade stolen. Mystical energy still present but weakened. Dangerous to camp inside due to unstable architecture."
}
```

```json
{
  "name": "Sunblade",
  "type": "item",
  "keywords": ["Sunblade", "legendary sword", "sacred weapon"],
  "content": "Legendary sword with a golden blade that glows in sunlight. Originally kept in the Eastern Ruins temple vault. Entrusted to Alice's family for generations. Stolen recently by unknown thief. Said to have the power to banish darkness and evil. Highly sought after by various factions."
}
```

```json
{
  "name": "Bob's Secret Knowledge",
  "type": "concept",
  "keywords": ["Bob's secret", "thief identity", "Bob knows"],
  "content": "Bob claims to know who stole the Sunblade but refuses to reveal the identity. This knowledge is hidden from Alice and {{user}}. Bob's evasiveness about the subject has made Alice suspicious of his true loyalties. Unknown whether Bob is protecting someone or has his own agenda."
}
```

---

## Separation Guidelines

### What Goes in Summary

**Questions to ask:**
- Did something HAPPEN?
- Did a state CHANGE?
- Is this part of the TIMELINE?
- Does the AI need to know this happened to understand what's going on NOW?

**If YES → Goes in Summary**

**Examples:**
- "Alice revealed her true identity as Princess Elara"
- "They traveled from the tavern to the Eastern Ruins"
- "Bob became hostile after the accusation"
- "The temple had been ransacked before they arrived"
- "They made camp for the night outside the ruins"

### What Goes in Lorebooks

**Questions to ask:**
- Is this a DESCRIPTION of an entity?
- Is this BACKGROUND INFORMATION or context?
- Would this be useful to remember if this entity is mentioned LATER?
- Does this contain NUANCE, detail, or characterization?

**If YES → Goes in Lorebooks**

**Examples:**
- Character appearances and personalities
- Location descriptions and features
- Item capabilities and significance
- Faction goals and membership
- World-building rules and lore
- Secret information and who knows it

### Edge Cases

**Relationship changes:**
- **Timeline part → Summary:** "Alice became suspicious of Bob"
- **Detail part → Lorebook:** Entry for "Alice & Bob relationship" with context

**Status changes:**
- **Timeline part → Summary:** "The king was assassinated"
- **Detail part → Lorebook:** Entry for "King [Name]" with status: deceased

**Discoveries:**
- **Timeline part → Summary:** "They discovered the temple had been ransacked"
- **Detail part → Lorebook:** Entry for "Eastern Ruins" with details about the ransacking

---

## Benefits of This Structure

### For AI Context Management

1. **Token Efficiency**
   - Summary provides complete timeline context in minimal tokens
   - Detailed information only loaded when keywords are triggered
   - Reduces bloat from including unused details

2. **Better Recall**
   - AI can quickly scan summary to understand what happened
   - Keyword-triggered lorebook entries provide depth when needed
   - Clear separation prevents confusion between "what happened" and "what things are"

3. **Scalability**
   - Summaries can cover long timelines concisely
   - Lorebook entries don't clutter the timeline
   - Easy to prune irrelevant lorebook entries without losing timeline coherence

### For Context Injection

**Short-term memory (recent timeline):**
- Include summaries from last N messages
- Provides immediate context for current situation
- Minimal token cost

**Long-term memory (persistent reference):**
- Lorebook entries injected based on keyword scanning
- Only relevant details included in each generation
- Efficient use of context window

**Combined usage:**
- Timeline gives structure: "We went from A to B, discovered X, Bob did Y"
- Lorebooks fill in details: "Who is Bob? What is X? Where is B?"
- AI gets both structure AND depth without redundancy

---

## Prompt Design Implications

### For Extraction Prompts

**Instructions must emphasize:**
1. Summary = timeline only, minimal tokens, no descriptions
2. Lorebooks = detailed entries only, no timeline events
3. Don't duplicate information between the two sections
4. If something is described in lorebooks, just MENTION it in summary

**Example instruction:**
```
CRITICAL SEPARATION OF CONCERNS:

SUMMARY field:
- Timeline of what happened (events, state changes, outcomes)
- MENTION entities by name for context
- DO NOT describe entities (that goes in lorebooks)
- Terse, factual, past tense
- Target: 100-300 tokens

LOREBOOKS array:
- NEW entities discovered OR updates to existing entities
- Full descriptions WITH nuance
- Each entry: name, type, keywords, content
- DO NOT include timeline events (that goes in summary)
- Only entities worth remembering for later
```

### For Validation

**Structural validation must check:**
- Summary is a string (not object or array)
- Summary is not too long (hard limit: 500 tokens)
- Lorebooks is an array (may be empty)
- Each lorebook entry has required fields: name, type, keywords, content
- No duplicate entries (same name + type)

**Semantic validation must check:**
- Summary doesn't contain detailed descriptions
- Summary focuses on events and state changes
- Lorebook entries don't contain timeline narratives
- No redundancy between summary and lorebook content

---

## Migration from Current Structure

### Current Structure → New Structure Mapping

**OLD → NEW:**

```javascript
// Old structure had 14+ fields blurring the distinction
{
  "narrative": "...",           // → summary
  "npcs_facts": {...},          // → lorebooks (type: character)
  "visited_locations": {...},   // → lorebooks (type: location)
  "objects": {...},             // → lorebooks (type: item)
  "factions": {...},            // → lorebooks (type: faction)
  "lore": {...},                // → lorebooks (type: lore)
  "secrets": {...},             // → lorebooks (type: concept)
  "npcs_status": {...},         // → summary OR lorebooks (depends on context)
  "current_relationships": {...}, // → summary (changes) + lorebooks (details)
  "memorable_events": [...],    // → summary (outcomes only)
  // ... and more
}
```

**NEW structure:**

```json
{
  "summary": "Combines narrative + status changes + relationship changes + event outcomes into one concise timeline",
  "lorebooks": [
    // All the detailed descriptions from npcs_facts, locations, objects, etc.
    // Each as a separate entry with keywords
  ]
}
```

### What Changes?

**REMOVED fields:**
- `narrative`, `npcs_facts`, `npcs_status`, `visited_locations`, `objects`, `factions`, `lore`, `secrets`, `current_relationships`, `memorable_events`, etc.

**ADDED fields:**
- `summary` (string) - replaces `narrative` but more comprehensive
- `lorebooks` (array) - consolidates ALL detailed entries into keyword-based format

**Benefits of migration:**
1. Simpler structure (2 fields instead of 14+)
2. Clearer separation of concerns
3. Easier to understand and maintain
4. Better for automated lorebook creation
5. More efficient token usage

---

## Examples

### Example 1: Simple Scene

**Scene:**
> Alice and Bob enter a tavern. The bartender, a gruff dwarf named Grim, serves them ale. Bob asks Grim about rumors of bandits on the eastern road. Grim mentions that a group led by "Scarface" has been terrorizing travelers.

**Output:**

```json
{
  "summary": "Alice and Bob entered a tavern. The bartender Grim told them about bandits on the eastern road, led by someone called Scarface who has been terrorizing travelers.",
  "lorebooks": [
    {
      "name": "Grim",
      "type": "character",
      "keywords": ["Grim", "bartender", "dwarf bartender"],
      "content": "Dwarf bartender at the tavern. Gruff demeanor but helpful. Has knowledge of local rumors and events. Keeps track of bandit activity on the trade roads."
    },
    {
      "name": "Scarface's Bandit Gang",
      "type": "faction",
      "keywords": ["Scarface", "bandits", "eastern road bandits"],
      "content": "Bandit group operating on the eastern road. Led by someone known as 'Scarface'. Known for terrorizing travelers. Location and exact numbers unknown."
    }
  ]
}
```

**Why this separation works:**
- Summary tells you WHAT HAPPENED: They went to tavern, learned about bandits
- Lorebooks tell you WHO/WHAT things ARE: Grim's description, bandit group details
- No redundancy: Information appears in only one place
- Efficient: Summary is minimal (2 sentences), lorebooks only contain new entities

### Example 2: Complex Scene with Multiple Events

**Scene:**
> Alice confronted Bob about his suspicious behavior. Bob finally revealed that he's been working for the Shadow Guild, a secret organization that opposes the corrupt nobility. He knows who stole the Sunblade because the Shadow Guild is tracking the thief. However, revealing the thief's identity would expose the Guild's operations. Alice is torn between her duty to recover the Sunblade and her growing sympathy for Bob's cause. They agreed to work together but Alice insisted on knowing the thief's identity within three days.

**Output:**

```json
{
  "summary": "Alice confronted Bob about his suspicious behavior. Bob revealed he works for the Shadow Guild and knows the Sunblade thief's identity through Guild intelligence. He refused to reveal it immediately to protect Guild operations. Alice gave him three days to share the information. They agreed to work together despite the tension. Alice is conflicted between her duty and sympathy for Bob's anti-nobility cause.",
  "lorebooks": [
    {
      "name": "Shadow Guild",
      "type": "faction",
      "keywords": ["Shadow Guild", "the Guild", "secret organization"],
      "content": "Secret organization opposing corrupt nobility. Bob is a member. Has intelligence network tracking significant events and persons of interest. Operations must remain covert. Goal is to undermine corrupt noble power structures."
    },
    {
      "name": "Bob's Guild Membership",
      "type": "concept",
      "keywords": ["Bob Shadow Guild", "Bob's secret", "Bob's organization"],
      "content": "Bob is a member of the Shadow Guild. This was previously hidden from Alice and {{user}}, revealed during confrontation. His knowledge of the Sunblade thief comes from Guild intelligence. He's constrained by Guild secrecy requirements. Alice now knows about this affiliation."
    },
    {
      "name": "Alice & Bob - Alliance",
      "type": "concept",
      "keywords": ["Alice Bob relationship", "alliance", "three day deadline"],
      "content": "Alice and Bob agreed to work together despite Bob's revealed Guild affiliation. Relationship now includes tension between Alice's duty (recover Sunblade) and her growing sympathy for Bob's anti-corruption cause. Alice gave Bob a three-day deadline to reveal the thief's identity. Trust is conditional and strained."
    }
  ]
}
```

**Why this separation works:**
- Summary captures the TIMELINE: Confrontation → Revelation → Negotiation → Agreement
- Summary captures STATE CHANGES: Bob's secret is now known, they have an alliance, there's a deadline
- Lorebooks capture DETAILS: What is Shadow Guild? What does Bob's membership mean? What's the nature of their alliance?
- No redundancy: Timeline events aren't repeated in lorebook details
- Efficient: Summary gives complete picture of what happened, lorebooks add depth when needed

### Example 3: Combat Scene

**Scene:**
> The bandits ambushed Alice and Bob on the eastern road. Five bandits attacked - four with swords, one with a crossbow. Alice killed two with her greatsword technique. Bob disabled the crossbowman with a throwing knife. The remaining two fled. Alice was wounded in the shoulder by an arrow. They found a map on one of the dead bandits showing the location of the bandit camp in the Darkwood Forest.

**Output:**

```json
{
  "summary": "Bandits ambushed Alice and Bob on the eastern road. Five attackers: four swordsmen, one crossbowman. Alice killed two, Bob disabled the crossbowman, two fled. Alice was wounded in the shoulder by an arrow. They recovered a map from the dead bandits showing the bandit camp location in Darkwood Forest.",
  "lorebooks": [
    {
      "name": "Alice - Combat Capabilities",
      "type": "concept",
      "keywords": ["Alice fighting", "Alice combat", "greatsword technique"],
      "content": "Alice wields a greatsword with lethal skill. Demonstrated ability to kill multiple opponents in close combat. Uses refined technique suggesting formal training. Continues fighting even when wounded."
    },
    {
      "name": "Bob - Combat Capabilities",
      "type": "concept",
      "keywords": ["Bob fighting", "Bob combat", "throwing knives"],
      "content": "Bob uses throwing knives with precision. Capable of disabling opponents at range. Prefers non-lethal takedowns when possible. Fights tactically rather than directly."
    },
    {
      "name": "Alice - Current Status",
      "type": "concept",
      "keywords": ["Alice wounded", "Alice injury", "shoulder wound"],
      "content": "Alice has an arrow wound in her shoulder from the bandit ambush. Injury sustained during combat on the eastern road. Severity unknown but she remained functional during the fight."
    },
    {
      "name": "Bandit Camp Map",
      "type": "item",
      "keywords": ["map", "bandit camp map", "Darkwood map"],
      "content": "Crude map recovered from dead bandits. Shows location of bandit camp in Darkwood Forest. May lead to Scarface's base of operations. Currently in Alice and Bob's possession."
    }
  ]
}
```

**Why this separation works:**
- Summary is pure ACTION TIMELINE: Ambush occurred, here's what happened, here's the outcome
- Lorebooks capture CAPABILITIES and STATUS: What can Alice/Bob do in combat? What's Alice's injury status? What's this map?
- Combat results in summary, combat abilities in lorebooks
- Injury EVENT in summary, injury STATUS in lorebooks
- Found map in summary, map DETAILS in lorebooks

---

## Implementation Checklist

### For Prompt Updates

- [ ] Update `default_prompt` to use new structure
- [ ] Update `scene_summary_prompt` to use new structure
- [ ] Update `default_combined_summary_prompt` to use new structure
- [ ] Add clear instructions for summary vs lorebooks separation
- [ ] Include examples in prompts to guide AI behavior
- [ ] Add token targets for both sections

### For Validation

- [ ] Update structural validation for new JSON schema
- [ ] Validate summary is string, not too long
- [ ] Validate lorebooks is array with correct entry format
- [ ] Validate keywords are meaningful (not empty or generic)
- [ ] Check for redundancy between summary and lorebooks

### For Documentation

- [ ] Update README to explain new structure
- [ ] Create migration guide for users with existing memories
- [ ] Document best practices for summary vs lorebooks
- [ ] Provide examples of good separation

### For Code

- [ ] Update `memoryCore.js` to handle new structure
- [ ] Update `messageVisuals.js` to display both summary and lorebook count
- [ ] Update `summaryValidation.js` with new validation rules
- [ ] Support lorebook export functionality
- [ ] Maintain backward compatibility with old structure (optional)

---

## Combining Workflow: Summary-Only Extraction

**CRITICAL:** When combining or reviewing multiple scene memories, the system should extract ONLY the `summary` fields, NOT the lorebook entries.

### Why Summary-Only?

1. **Token Efficiency**: Lorebook entries can be hundreds of tokens each. When combining 10 scenes with 5 lorebook entries each, you'd send 50 lorebook entries to the AI unnecessarily.

2. **Separation of Concerns**: Combining is about merging TIMELINES. Lorebooks are static reference data that don't need narrative merging.

3. **AI Focus**: Without lorebook entries cluttering the prompt, AI focuses purely on timeline deduplication and flow.

### Implementation

**Step 1: Extract Summary Fields**
```javascript
// Parse each scene memory and extract ONLY the summary field
const scene_memories = [
    {"summary": "Alice met Bob at tavern...", "lorebooks": [...]},
    {"summary": "Traveled to Eastern Ruins...", "lorebooks": [...]},
    {"summary": "Bandits ambushed them...", "lorebooks": [...]}
];

// Extract only summaries
const summaries_only = scene_memories.map(m => m.summary);
// Result: ["Alice met Bob at tavern...", "Traveled to Eastern Ruins...", "Bandits ambushed them..."]
```

**Step 2: Send Only Summaries to AI**
```javascript
// Format for prompt
const formatted = summaries_only.map((s, i) => `Scene ${i+1} summary:\n${s}`).join('\n\n');

// Send to AI with combining prompt
const combined = await generate_with_ai(combining_prompt + formatted);

// AI returns: Combined timeline string (NOT JSON)
```

**Step 3: Handle Lorebooks Separately**

Lorebook entries should be merged programmatically (if at all):

```javascript
// Simple approach: Keep all lorebook entries from all scenes
const all_lorebooks = scene_memories.flatMap(m => m.lorebooks);

// Better approach: Deduplicate by name+type
const lorebook_map = new Map();
for (const memory of scene_memories) {
    for (const entry of memory.lorebooks) {
        const key = `${entry.name}|${entry.type}`;
        if (!lorebook_map.has(key)) {
            lorebook_map.set(key, entry);
        }
        // Optional: merge keywords, update content, etc.
    }
}
const merged_lorebooks = Array.from(lorebook_map.values());
```

### Token Savings Example

**OLD (sending full JSON):**
```
3 scenes × (200 token summary + 5 lorebook entries × 100 tokens each) = 2,100 tokens
```

**NEW (summary-only):**
```
3 scenes × 200 token summary = 600 tokens
```

**Savings: 71% reduction!**

### Combined Memory Structure

After combining:

```javascript
{
    "summary": "Combined timeline from all scenes (AI-generated)",
    "lorebooks": [
        // Programmatically merged lorebook entries (deduped by name+type)
        // OR all lorebook entries from all scenes
        // OR completely new set based on combined summary
    ]
}
```

**See `docs/IMPLEMENTATION_SUMMARY_EXTRACTION.md` for complete implementation details.**

---

## Future: Automated Lorebook Creation

This structure makes automated lorebook creation trivial:

```javascript
// Convert lorebook entries from summary to actual lorebook entries
function exportToLorebook(summaries) {
  const lorebook = { entries: [] };

  for (const summary of summaries) {
    for (const entry of summary.lorebooks) {
      lorebook.entries.push({
        keys: entry.keywords,
        content: entry.content,
        name: entry.name,
        // ... other lorebook metadata
      });
    }
  }

  return lorebook;
}
```

**Benefits:**
- Each lorebook entry already has keywords defined
- Content is already formatted for injection
- Type information helps organize lorebook categories
- No manual reformatting needed

---

**End of Document**

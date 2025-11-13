# Lorebook Entry Guidelines

**Purpose**: Define how lorebook entries handle **dynamic entity state** extracted from recaps in ST-Auto-Lorebooks.

## Core Concept: Dynamic Knowledge Extraction

**ST-Auto-Lorebooks manages chat-specific lorebooks that store entity information extracted from recap JSON objects.**

### Knowledge Extraction Pipeline

```
1. Message occurs in chat
   ↓
2. ST-Auto-Recap creates JSON recap with:
   - narrative (what happened)
   - entities (discovered/updated entity data)
   - locations, NPCs, items, revelations
   ↓
3. ST-Auto-Lorebooks reads JSON and:
   - Creates lorebook entries for new entities
   - Updates existing entries with new info
   - Uses chat-specific auto-created lorebook
   ↓
4. Future recaps reference entities by name only
   ↓
5. Lorebook provides entity details when triggered
```

### Division of Responsibility

**RECAPS (ST-Auto-Recap):**
- What happened (events, actions)
- How things changed (state changes, development)
- When things occurred (temporal sequence)
- Character decisions and revelations
- **References to entities by name/key only**

**LOREBOOKS (ST-Auto-Lorebooks):**
- What entities exist (discovered through recaps)
- Entity properties and attributes (extracted from recaps)
- Current entity state (updated from recaps)
- Entity relationships (extracted from recaps)
- **Full entity details in PList format**

## Entity Extraction from Recaps

### Recap JSON Structure

**Recaps will be JSON objects with sections for extraction:**

```json
{
  "narrative": "Events that occurred (pure narrative)",
  "entities": [
    {
      "name": "EntityName",
      "type": "creature|character|npc|item|location|concept",
      "properties": ["prop1", "prop2", "nested(detail1, detail2)"],
      "aliases": ["alias1", "alias2"],
      "updates": ["updated_prop1", "new_prop2"]
    }
  ],
  "character_states": {
    "{{char}}": "state description",
    "{{user}}": "state description"
  }
}
```

### Entity Types

**Creature/Monster:**
```json
{
  "name": "Mountain Dragon",
  "type": "creature",
  "properties": ["reptilian", "scales", "fire breath", "intelligent", "wounded(left wing)", "hoards(treasure)"],
  "aliases": ["dragon", "the beast", "wyrm"]
}
```
**→ Lorebook Entry:**
```
[Mountain Dragon: reptilian, scales, fire breath, intelligent, wounded(left wing), hoards(treasure)]
Keys: "Mountain Dragon,dragon,beast,wyrm"
Position: 6, Depth: 5, Order: 500
```

**Location:**
```json
{
  "name": "Dragon's Treasure Vault",
  "type": "location",
  "properties": ["hidden chamber", "deep in cave", "filled with(gold, gems, artifacts)", "guarded by(dragon)"],
  "aliases": ["vault", "treasure room", "hoard"]
}
```
**→ Lorebook Entry:**
```
[Dragon's Treasure Vault: hidden chamber, deep in cave, filled with(gold, gems, artifacts), guarded by(dragon)]
Keys: "Dragon's Treasure Vault,vault,treasure room,hoard"
Position: 6, Depth: 6, Order: 300
```

**NPC/Character:**
```json
{
  "name": "Bob the Merchant",
  "type": "npc",
  "properties": ["human", "merchant", "friendly", "sells(potions, equipment)", "located at(market square)", "knows about(dragon attack)"],
  "aliases": ["Bob", "the merchant"]
}
```
**→ Lorebook Entry:**
```
[Bob the Merchant: human, merchant, friendly, sells(potions, equipment), located at(market square), knows about(dragon attack)]
Keys: "Bob,merchant,Bob the Merchant"
Position: 6, Depth: 4, Order: 500
```

**Item/Object:**
```json
{
  "name": "Dragonscale Shield",
  "type": "item",
  "properties": ["shield", "made from(dragon scale)", "fireproof", "lightweight", "owned by({{user}})"],
  "aliases": ["shield", "dragonscale"]
}
```
**→ Lorebook Entry:**
```
[Dragonscale Shield: shield, made from(dragon scale), fireproof, lightweight, owned by({{user}})]
Keys: "Dragonscale Shield,shield,dragonscale"
Position: 6, Depth: 5, Order: 400
```

**Faction/Organization:**
```json
{
  "name": "Dragon Hunters Guild",
  "type": "organization",
  "properties": ["guild", "hunts(dragons)", "based in(capital city)", "led by(Master Hunter)", "hostile to(dragons)", "allies with({{user}})"],
  "aliases": ["guild", "hunters"]
}
```
**→ Lorebook Entry:**
```
[Dragon Hunters Guild: guild, hunts(dragons), based in(capital city), led by(Master Hunter), hostile to(dragons), allies with({{user}})]
Keys: "Dragon Hunters Guild,guild,hunters"
Position: 6, Depth: 5, Order: 400
```

## Entry Creation and Updates

### New Entity Discovery

**When recap contains new entity:**
1. Extract entity data from JSON
2. Convert to PList format
3. Create lorebook entry with:
   - Content: PList from properties
   - Keys: Name + aliases
   - Position: 6 (depth-based)
   - Depth: Based on entity type (see below)
   - Order: Based on importance (see below)
   - Enabled: true
   - Constant: false (conditional activation)

### Existing Entity Updates

**When recap contains updates for existing entity:**
1. Find existing lorebook entry by name
2. Extract update properties from JSON
3. Merge with existing properties:
   - Add new properties
   - Update changed properties (e.g., "wounded(left wing)" → "wounded(left wing, healing)")
   - Preserve unchanged properties
4. Regenerate PList content
5. Update lorebook entry

**Example Update Flow:**

**Initial Discovery:**
```json
{
  "name": "Mountain Dragon",
  "properties": ["reptilian", "scales", "fire breath", "intelligent", "hoards(treasure)"]
}
```
**→ Lorebook:** `[Mountain Dragon: reptilian, scales, fire breath, intelligent, hoards(treasure)]`

**Update 1 (wounded in battle):**
```json
{
  "name": "Mountain Dragon",
  "updates": ["wounded(left wing)"]
}
```
**→ Lorebook:** `[Mountain Dragon: reptilian, scales, fire breath, intelligent, hoards(treasure), wounded(left wing)]`

**Update 2 (healing over time):**
```json
{
  "name": "Mountain Dragon",
  "updates": ["wounded(left wing, healing)", "willing to(negotiate)"]
}
```
**→ Lorebook:** `[Mountain Dragon: reptilian, scales, fire breath, intelligent, hoards(treasure), wounded(left wing, healing), willing to(negotiate)]`

## PList Format Requirements

**All lorebook entries MUST use PList format for token efficiency.**

### Basic Syntax
```
[EntityName: property1, property2, property3]
[EntityName(Alias): property1, property2]
[EntityName: nested(sub1, sub2), attribute(detail)]
```

### Strong Associations
```
[Bob(merchant): friendly, sells(potions)]
[Canterlot(capital): city, mountainside, palace]
```

### Nested Properties
```
[Dragon: reptilian, features(scales, wings, claws), breathes(fire), hoards(treasure, gems)]
```

### Sequential Blocks (for entity history)
```
[Dragon: reptilian, scales, history{
  past(terrorized villages),
  present(wounded, negotiating),
  future(potential ally)
}]
```

**Token savings: 28-44% vs natural language**

## Depth and Order by Entity Type

### Depth Assignment (Position = 6)

```
Depth 0-1 (Critical - Active Combat):
  - Enemies in current combat
  - Active threats
  - Current scene dangers
  Order: 700-900

Depth 2-3 (Important - Active Scene):
  - NPCs in current scene
  - Current location details
  - Active quest items
  Order: 600-800

Depth 4 (Standard - Character State):
  - Main character state (if using constant entry)
  - Key allies/companions
  Order: 500-700

Depth 5-6 (Background - Known Entities):
  - Discovered locations
  - Known NPCs not in scene
  - Inventory items
  - Known creatures
  Order: 400-600

Depth 7-9 (Deep Lore - Rare Reference):
  - Historical entities
  - Distant locations
  - Rare items
  - Background factions
  Order: 300-500
```

### Order Assignment by Importance

```
Critical/Active: 700-900
  - Current enemies
  - Active scene elements
  - Immediate threats

Important: 500-700
  - Key NPCs
  - Important locations
  - Quest items
  - Main factions

Standard: 400-600
  - Known entities
  - Discovered locations
  - Inventory items
  - Background NPCs

Low Priority: 200-400
  - Historical info
  - Distant entities
  - Rare references
```

## Entry Auto-Management

### Auto-Creation from Recaps

**ST-Auto-Lorebooks will automatically:**
1. Monitor for new recaps with entity data
2. Extract entities from JSON structure
3. Create new lorebook entries
4. Use chat-specific auto-created lorebook
5. Apply appropriate depth, order, and keys

### Auto-Update from Recaps

**ST-Auto-Lorebooks will automatically:**
1. Detect entity updates in recaps
2. Find matching lorebook entries by name
3. Merge new properties with existing
4. Update lorebook entry content
5. Maintain entry configuration (depth, order, keys)

### Manual Override

**Users can manually:**
- Edit lorebook entries directly
- Mark entries as "manual" to prevent auto-updates
- Delete auto-created entries
- Adjust depth, order, keys manually
- Add properties not captured by recaps

## Key Generation

### Auto-Generated Keys

**Keys are automatically generated from:**
1. Entity name (full)
2. Aliases from JSON
3. Entity type (if relevant)
4. Common variations (plurals, abbreviations)

**Example:**
```json
{
  "name": "Mountain Dragon",
  "aliases": ["dragon", "the beast", "wyrm"]
}
```
**→ Keys:** `"Mountain Dragon,dragon,the beast,wyrm,dragons"`

### Key Specificity

```
GOOD: ["Mountain Dragon", "dragon", "wyrm"]
BAD: ["thing", "creature", "it"] (too generic)
BAD: ["The Mountain Dragon of the Northern Peaks"] (too specific)

Heuristic: 1-4 keys per entry, each 1-3 words
```

## State Tracking

### Dynamic State Properties

**Entities can have dynamic state that changes over time:**

```
[Mountain Dragon:
  reptilian,
  scales,
  fire breath,
  state{
    health(wounded, healing),
    location(mountain cave),
    attitude(hostile turned neutral),
    status(negotiating with {{user}})
  }
]
```

### Character States

**Main character states can be tracked separately:**

```json
{
  "character_states": {
    "{{user}}": "wounded(minor burns), acquired(dragon scale), knows about(treasure vault)",
    "{{char}}": "impressed by({{user}}), willing to(help), concerned about(dragon)"
  }
}
```

**→ Can update character constant entry or create state tracking entry**

## Token Budget Management

### Budget Allocation

**Chat-specific lorebook budget:**
```
Standard chat (1-20 entities): 15-25% of context
Expanded chat (21-50 entities): 25-35% of context
Large chat (51-100 entities): 35-45% of context
Very large chat (100+ entities): 45-55% of context + PList Base World
```

### PList Base World (50+ Entities)

**For chats with 50+ entities, use PList Base World:**

1. Opening bracket entry: `content: "["`, `order: 2`, `constant: true`
2. Closing bracket entry: `content: "]"`, `order: 998`, `constant: true`
3. Entity entries: Remove `[]`, add `;` to end, `order: 3-997`

**Example:**
```
[  <- (order=2, constant)
Mountain Dragon: reptilian, scales, fire breath, wounded(left wing);
Dragon's Treasure Vault: hidden chamber, deep in cave, filled with(gold, gems);
Bob the Merchant: human, friendly, sells(potions, equipment);
]  <- (order=998, constant)
```

## Recursion Strategy

### Parent-Child Relationships

**Use recursion for entity hierarchies:**

```
Parent Category (recursable):
  [Creatures: dragons, slimes, griffons]

Child Entity (recursable):
  [Mountain Dragon: reptilian, scales, fire breath]

Detailed Info (nonRecursable to prevent cascade):
  [Mountain Dragon Combat: dive attacks, fire from above, wounded(left wing)]
```

**Result:**
- Mention "creatures" → Category + all creature PLists
- Mention "dragon" → Category + dragon PList + dragon combat
- Prevents all combat details from activating on category mention

## Recap Integration

### Strategic Entity Mentions in Recaps

**Recaps mention entities at high level for context and lorebook triggering:**

```json
{
  "narrative": "Alice flew to Cloudsdale and met Rainbow Dash at the weather factory. They discussed the storm approaching Ponyville.",
  "entities": [
    {
      "name": "Cloudsdale",
      "type": "location",
      "properties": ["floating city", "pegasus-only", "contains(weather factory)", "above(Ponyville)"],
      "aliases": ["cloud city"]
    }
  ]
}
```

**What happens:**
1. **Narrative mentions** "Cloudsdale" (provides story context)
2. **Entity extracted** → Creates lorebook entry
3. **Future mentions** of "Cloudsdale" → Lorebook activates
4. **Lorebook provides** full details (floating city, pegasus-only, weather factory, etc.)

**Result:**
- Narrative: "Alice flew to Cloudsdale" (lean, contextual)
- Lorebook: Full city details injected when mentioned
- Best of both worlds: Readable narrative + rich context when relevant

### Lorebook Activation Pattern

**When entity mentioned in future messages:**

```json
{
  "narrative": "Alice returned to Cloudsdale with storm equipment."
}
```

**Lorebook activates:**
```
[Cloudsdale: floating city, pegasus-only, contains(weather factory, cloud homes), located(above Ponyville), accessible via(flight, balloon)]
```

**No need to re-extract** - Entity already in lorebook from first mention. Just reference by name.

### Character State Updates

**Recaps can update character states:**

```json
{
  "character_states": {
    "{{user}}": "acquired(Dragonscale Shield), allied with(Dragon Hunters Guild)"
  }
}
```

**→ Updates character constant entry or creates state entry**

## Validation and Quality

### Entry Validation

**Auto-created entries must pass:**
- ✓ Valid PList format: `[Entity: properties]`
- ✓ At least 2 properties OR 1 strong association
- ✓ Properties are concise (1-5 words each)
- ✓ No redundancy
- ✓ Keys include entity name + aliases
- ✓ Appropriate depth and order for entity type

### Manual Review

**Users should periodically:**
- Review auto-created entries for quality
- Merge duplicate entities
- Simplify over-detailed entries
- Add manual properties missed by recaps
- Mark important entries to prevent auto-deletion

## Entry Lifecycle

### Creation Triggers

**New entry created when:**
1. Recap contains entity not in lorebook
2. Entity has sufficient properties (2+)
3. Entity type is recognized
4. Entity name is valid (not generic)

### Update Triggers

**Existing entry updated when:**
1. Recap contains updates for known entity
2. Updates add new properties or modify existing
3. Entity not marked as "manual override"

### Deletion Triggers

**Entry deleted when:**
1. Associated messages are deleted (if tracking enabled)
2. User manually deletes entry
3. Entity marked as "temporary" and aged out
4. Chat is deleted (entire lorebook removed)

## Advanced Features

### Timed Effects

**Use for temporary entity states:**

```
[Dragon: wounded(left wing)]
Sticky: 5 messages (stays active for 5 messages)
Cooldown: 3 messages (can't activate for 3 messages after)
```

### Inclusion Groups

**Group related entities for controlled activation:**

```
Group: "dragons"
Entries:
  - [Mountain Dragon: ...] (weight: 100)
  - [Sea Dragon: ...] (weight: 100)
  - [Ancient Dragon: ...] (weight: 50)

When "dragon" mentioned: Random selection from group
```

### Character Filters

**Activate entries only for specific characters:**

```
[Alice's Secret Weapon: ...]
Character Filter: "Alice" (Include)
→ Only activates when Alice is in scene
```

## Best Practices

1. **Auto-extract from recaps** - Let system create/update entries
2. **PList format exclusively** - Maximum efficiency
3. **Depth-based positioning** - More reliable than fixed positions
4. **System role for entries** - Authoritative world data
5. **Periodic manual review** - Ensure quality and merge duplicates
6. **Budget appropriately** - Scale budget with entity count
7. **PList Base World for 50+ entities** - Prevents bracket leakage
8. **Use recursion for hierarchies** - Scalable architecture
9. **Track dynamic state** - Update entity state over time
10. **Reference by name in recaps** - Keep recaps lean

## Common Pitfalls to Avoid

❌ Duplicating entity info in recaps (use references only)
❌ Creating entries for generic/temporary entities
❌ Not merging duplicate entities
❌ Over-detailed entries (keep properties concise)
❌ Ignoring manual review (auto isn't perfect)
❌ Using natural language instead of PList
❌ Not using PList Base World for large entity counts
❌ Incorrect depth assignment (critical info buried too deep)
❌ Exceeding budget allocation

## Future Enhancements

- **Auto-merge duplicates** - Detect and merge duplicate entities
- **Entity importance scoring** - Adjust depth/order based on mention frequency
- **Relationship extraction** - Auto-detect entity relationships
- **Temporal state tracking** - Version entity state over time
- **Smart property merging** - AI-assisted property consolidation
- **Cross-chat entity sharing** - Share entities across related chats

---

**Remember**: Lorebooks store **dynamic entity state** extracted from recaps. Recaps reference entities by name, lorebooks provide the details. This creates token-efficient, scalable context delegation.

# JSON Syntax Reference for ST-Auto-Summarize & ST-Auto-Lorebooks Integration

## Summary JSON Structure

This document defines the exact JSON structure that ST-Auto-Summarize generates and ST-Auto-Lorebooks consumes.

## Base Structure

```json
{
  "narrative": "string - what happened in this scene",
  "entities": [
    {
      "name": "string - full entity name",
      "type": "string - entity type (see types below)",
      "properties": ["array of strings - for NEW entities"],
      "aliases": ["array of strings - alternate names"],
      "updates": ["array of strings - for EXISTING entities"]
    }
  ],
  "character_states": {
    "{{char}}": "string - character state",
    "{{user}}": "string - user state"
  }
}
```

## Field Specifications

### `narrative` (required)

**Type**: String
**Purpose**: Capture what happened in the scene
**Content**:
- Events, actions, decisions, outcomes
- Mentions entities by name (for context and lorebook activation)
- NO entity descriptions (those go in `entities` array)

**Examples**:

✅ **Correct**:
```json
{
  "narrative": "Alice flew to Cloudsdale and met Rainbow Dash at the weather factory. They discussed the approaching storm. Rainbow Dash warned about unusual weather patterns affecting Ponyville."
}
```

❌ **Incorrect** (includes entity descriptions):
```json
{
  "narrative": "Alice flew to the floating pegasus-only city and met a cyan-coated pegasus with a rainbow mane at the large weather production facility."
}
```

### `entities` (optional)

**Type**: Array of entity objects
**Purpose**: Extract entity data for lorebook population
**When to include**:
- First time an entity is discovered/mentioned
- When updating existing entity properties
- When entity state changes

**Entity Object Structure**:

```json
{
  "name": "EntityName",
  "type": "character|npc|creature|location|location-sublocation|item|object|faction|concept",
  "properties": ["for", "new", "entities"],
  "aliases": ["alternate", "names"],
  "updates": ["for", "existing", "entities"]
}
```

**Fields**:
- `name` (required): Full entity name
- `type` (required): Entity type (see Entity Types section)
- `properties` (optional): For NEW entities - array of concise properties
- `aliases` (optional): Alternative names for lorebook keys
- `updates` (optional): For EXISTING entities - property updates/changes

### `character_states` (optional)

**Type**: Object with character names as keys
**Purpose**: Track main character state changes
**Format**: `{ "character_name": "state_description" }`
**When to include**: Only when character state changed significantly

**Example**:
```json
{
  "character_states": {
    "{{user}}": "in(Cloudsdale), allied with(Rainbow Dash), planning(storm defense), equipped(weather gear)",
    "{{char}}": "concerned about(storm), trusts({{user}}), willing to(help with defenses)"
  }
}
```

## Entity Types

### Type: `character` or `npc`

**Use for**: Named characters, NPCs
**Lorebook naming**: `character-{name}`
**Example**:

```json
{
  "name": "Rainbow Dash",
  "type": "character",
  "properties": [
    "pegasus",
    "cyan coat",
    "rainbow mane",
    "fast flyer",
    "works at(weather factory)",
    "loyal",
    "competitive"
  ],
  "aliases": ["Rainbow", "Dash", "RD"]
}
```

**Lorebook entry created**:
- Name: `character-Rainbow Dash`
- Content: `[Rainbow Dash: pegasus, cyan coat, rainbow mane, fast flyer, works at(weather factory), loyal, competitive]`
- Keys: `Rainbow Dash,Rainbow,Dash,RD`

### Type: `creature`

**Use for**: Monsters, animals, beasts
**Lorebook naming**: `creature-{name}`
**Example**:

```json
{
  "name": "Mountain Dragon",
  "type": "creature",
  "properties": [
    "reptilian",
    "scales(red, armored)",
    "massive",
    "fire breath",
    "intelligent",
    "lives in(mountain cave)",
    "hoards(treasure)"
  ],
  "aliases": ["dragon", "the beast", "wyrm", "the dragon"]
}
```

**Lorebook entry**:
- Name: `creature-Mountain Dragon`
- Content: `[Mountain Dragon: reptilian, scales(red, armored), massive, fire breath, intelligent, lives in(mountain cave), hoards(treasure)]`
- Keys: `Mountain Dragon,dragon,the beast,wyrm,the dragon`

### Type: `location`

**Use for**: Places, areas, cities, buildings
**Lorebook naming**: `location-{name}`
**Example**:

```json
{
  "name": "Cloudsdale",
  "type": "location",
  "properties": [
    "floating city",
    "pegasus-only",
    "contains(weather factory, cloud homes, racing tracks)",
    "located(above Ponyville)",
    "accessible via(flight, balloon)",
    "cloud architecture"
  ],
  "aliases": ["cloud city", "the city"]
}
```

**Lorebook entry**:
- Name: `location-Cloudsdale`
- Content: `[Cloudsdale: floating city, pegasus-only, contains(weather factory, cloud homes, racing tracks), located(above Ponyville), accessible via(flight, balloon), cloud architecture]`
- Keys: `Cloudsdale,cloud city,the city`

### Type: `location-sublocation`

**Use for**: Specific areas within larger locations
**Lorebook naming**: `location-{parent}-{sublocation}`
**Example**:

```json
{
  "name": "Weather Factory",
  "type": "location-sublocation",
  "properties": [
    "facility",
    "produces(weather, clouds, rain, snow)",
    "located in(Cloudsdale)",
    "operated by(pegasi)",
    "large machinery",
    "Rainbow Dash works here"
  ],
  "aliases": ["factory", "weather facility"]
}
```

**Lorebook entry**:
- Name: `location-Cloudsdale-Weather Factory`
- Content: `[Weather Factory: facility, produces(weather, clouds, rain, snow), located in(Cloudsdale), operated by(pegasi), large machinery, Rainbow Dash works here]`
- Keys: `Weather Factory,factory,weather facility`

### Type: `item` or `object`

**Use for**: Items, equipment, artifacts, objects
**Lorebook naming**: `object-{name}`
**Example**:

```json
{
  "name": "Dragonscale Shield",
  "type": "item",
  "properties": [
    "shield",
    "crafted by({{user}})",
    "made from(dragon scales)",
    "lightweight",
    "durable",
    "fireproof",
    "owned by({{user}})",
    "recently crafted"
  ],
  "aliases": ["shield", "dragonscale shield", "the shield"]
}
```

**Lorebook entry**:
- Name: `object-Dragonscale Shield`
- Content: `[Dragonscale Shield: shield, crafted by({{user}}), made from(dragon scales), lightweight, durable, fireproof, owned by({{user}}), recently crafted]`
- Keys: `Dragonscale Shield,shield,dragonscale shield,the shield`

### Type: `faction`

**Use for**: Organizations, guilds, groups
**Lorebook naming**: `faction-{name}`
**Example**:

```json
{
  "name": "Dragon Hunters Guild",
  "type": "faction",
  "properties": [
    "guild organization",
    "hunts(rogue dragons)",
    "based in(capital city)",
    "led by(Guild Master Gareth)",
    "mission(protect settlements)",
    "well-equipped",
    "pays bounties for(dragon parts)",
    "members({{user}}, elite hunters)"
  ],
  "aliases": ["guild", "Dragon Hunters", "the guild", "hunters"]
}
```

**Lorebook entry**:
- Name: `faction-Dragon Hunters Guild`
- Content: `[Dragon Hunters Guild: guild organization, hunts(rogue dragons), based in(capital city), led by(Guild Master Gareth), mission(protect settlements), well-equipped, pays bounties for(dragon parts), members({{user}}, elite hunters)]`
- Keys: `Dragon Hunters Guild,guild,Dragon Hunters,the guild,hunters`

### Type: `concept`

**Use for**: Abstract concepts, magic systems, lore
**Lorebook naming**: `concept-{name}`
**Example**:

```json
{
  "name": "Weather Magic",
  "type": "concept",
  "properties": [
    "magic system",
    "used by(pegasi)",
    "controls(weather, clouds, storms)",
    "requires training",
    "practiced in(weather factory)",
    "essential for(Equestria climate control)"
  ],
  "aliases": ["magic", "weather control"]
}
```

**Lorebook entry**:
- Name: `concept-Weather Magic`
- Content: `[Weather Magic: magic system, used by(pegasi), controls(weather, clouds, storms), requires training, practiced in(weather factory), essential for(Equestria climate control)]`
- Keys: `Weather Magic,magic,weather control`

## Properties Format (PList-Compatible)

Properties should be concise and use PList format conventions:

### Simple Properties
```json
["pegasus", "cyan coat", "friendly", "fast"]
```

### Nested Properties
Use `property(detail1, detail2)` for nested information:
```json
[
  "sells(potions, equipment, supplies)",
  "located at(market square)",
  "knows about(Dragon Hunters Guild, local legends)"
]
```

### Complex Properties
Use multiple levels sparingly (max 2 levels):
```json
[
  "abilities(fire breath, flight, intelligence)",
  "features(scales, wings, claws)",
  "status(wounded(left wing), healing)"
]
```

### ✅ Good Examples

```json
{
  "properties": [
    "pegasus",
    "cyan coat",
    "rainbow mane",
    "works at(weather factory)",
    "abilities(fast flight, weather manipulation)",
    "personality(loyal, competitive, bold)"
  ]
}
```

### ❌ Bad Examples

**Too verbose**:
```json
{
  "properties": [
    "She is a pegasus pony",
    "She has a beautiful cyan colored coat",
    "Her mane is rainbow colored and very distinctive"
  ]
}
```

**Over-nested**:
```json
{
  "properties": [
    "appearance(body(coat(cyan, shiny), mane(rainbow, flowing)))"
  ]
}
```

## Entity Updates

When an entity already exists and you need to update it, use the `updates` array instead of `properties`:

**First Discovery**:
```json
{
  "name": "Mountain Dragon",
  "type": "creature",
  "properties": [
    "reptilian",
    "scales",
    "massive",
    "fire breath",
    "intelligent",
    "lives in(mountain cave)",
    "hoards(treasure)"
  ],
  "aliases": ["dragon", "the beast"]
}
```

**Later Update** (dragon gets wounded and becomes willing to negotiate):
```json
{
  "name": "Mountain Dragon",
  "type": "creature",
  "updates": [
    "wounded(left wing)",
    "attitude(aggressive to neutral)",
    "willing to(negotiate)",
    "location(deep in treasure vault)"
  ]
}
```

**Resulting Lorebook Entry** (merged):
```
[Mountain Dragon: reptilian, scales, massive, fire breath, intelligent, lives in(mountain cave), hoards(treasure), wounded(left wing), attitude(aggressive to neutral), willing to(negotiate), location(deep in treasure vault)]
```

## Complete Examples

### Example 1: First Meeting

**Scenario**: Alice meets Bob at the market for the first time.

```json
{
  "narrative": "Alice arrived at the market square and met Bob, the local merchant. He offered to sell her potions and mentioned the Dragon Hunters Guild recruiting in the capital.",

  "entities": [
    {
      "name": "Bob",
      "type": "npc",
      "properties": [
        "human",
        "merchant",
        "middle-aged",
        "friendly",
        "knowledgeable",
        "sells(potions, equipment, supplies)",
        "buys(rare materials)",
        "located at(market square)",
        "knows about(Dragon Hunters Guild, local legends)"
      ],
      "aliases": ["Bob the Merchant", "the merchant", "merchant Bob"]
    },
    {
      "name": "Dragon Hunters Guild",
      "type": "faction",
      "properties": [
        "guild organization",
        "hunts(dragons)",
        "based in(capital city)",
        "recruiting",
        "well-funded",
        "pays bounties",
        "known to(Bob)"
      ],
      "aliases": ["guild", "hunters", "the guild", "Dragon Hunters"]
    }
  ],

  "character_states": {
    "{{user}}": "in(market square), met(Bob), knows about(Dragon Hunters Guild), interested in(joining guild)"
  }
}
```

### Example 2: Continuing Story

**Scenario**: Alice returns to Bob later after fighting a dragon.

```json
{
  "narrative": "Alice returned to Bob with three dragon scales. Bob revealed he's actually a former Dragon Hunter and offered a good price. He also warned that the guild's current leadership has questionable motives.",

  "entities": [
    {
      "name": "Bob",
      "type": "npc",
      "updates": [
        "formerly(Dragon Hunter)",
        "relationship with({{user}}, friendly trader)",
        "purchased(dragon scales from {{user}})",
        "warns about(guild leadership corruption)"
      ]
    },
    {
      "name": "Dragon Hunters Guild",
      "type": "faction",
      "updates": [
        "current leadership(questionable motives)",
        "warned about by(Bob)"
      ]
    }
  ],

  "character_states": {
    "{{user}}": "sold(dragon scales to Bob), suspicious of(guild motives), trusts(Bob's advice)"
  }
}
```

### Example 3: Complex Scene

**Scenario**: Alice explores a dragon's lair and finds treasure.

```json
{
  "narrative": "Alice ventured deep into the Mountain Dragon's lair and discovered a massive treasure vault. The vault contains ancient artifacts, piles of gold, and a mysterious glowing orb. The dragon confronted her there but proposed a truce instead of attacking.",

  "entities": [
    {
      "name": "Mountain Dragon",
      "type": "creature",
      "updates": [
        "location(treasure vault)",
        "attitude(aggressive to cautious)",
        "proposed(truce with {{user}})",
        "protective of(ancient artifacts)"
      ]
    },
    {
      "name": "Dragon's Treasure Vault",
      "type": "location-sublocation",
      "properties": [
        "hidden chamber",
        "deep in(mountain cave)",
        "massive",
        "filled with(gold, gems, ancient artifacts)",
        "guarded by(Mountain Dragon)",
        "contains(mysterious glowing orb)",
        "accessible via(secret passage)"
      ],
      "aliases": ["treasure vault", "vault", "treasure room", "hoard chamber"]
    },
    {
      "name": "Mysterious Glowing Orb",
      "type": "object",
      "properties": [
        "orb",
        "glowing",
        "mysterious",
        "ancient",
        "magical properties(unknown)",
        "located in(treasure vault)",
        "guarded by(Mountain Dragon)",
        "significance(unclear)"
      ],
      "aliases": ["orb", "glowing orb", "the orb"]
    }
  ],

  "character_states": {
    "{{user}}": "in(treasure vault), confronted by(Mountain Dragon), negotiating(truce), interested in(glowing orb)",
    "Mountain Dragon": "protective of(treasure), proposed truce, willing to(negotiate)"
  }
}
```

## Processing by ST-Auto-Lorebooks

When ST-Auto-Lorebooks processes these summaries:

1. **Reads the JSON** from summary storage
2. **Extracts entities array**
3. **For each entity**:
   - Checks if lorebook entry exists (by name or aliases)
   - If NEW: Creates lorebook entry with naming convention
   - If EXISTS: Merges updates into existing entry
4. **Generates PList content** from properties
5. **Sets lorebook entry metadata** (keys, depth, order, position)
6. **Saves to chat-specific lorebook**

## Naming Convention Summary

| Entity Type | Prefix | Example Entry Name |
|-------------|--------|-------------------|
| character | `character-` | `character-Rainbow Dash` |
| npc | `character-` | `character-Bob` |
| creature | `creature-` | `creature-Mountain Dragon` |
| location | `location-` | `location-Cloudsdale` |
| location-sublocation | `location-{parent}-` | `location-Cloudsdale-Weather Factory` |
| item | `object-` | `object-Dragonscale Shield` |
| object | `object-` | `object-Ancient Artifact` |
| faction | `faction-` | `faction-Dragon Hunters Guild` |
| concept | `concept-` | `concept-Weather Magic` |

---

**This syntax reference serves as the contract between ST-Auto-Summarize (generates JSON) and ST-Auto-Lorebooks (processes JSON).**

# Category Index System for ST-Auto-Lorebooks

## Overview

The category index system automatically creates and maintains "index" lorebook entries that list all entities in each category. These indexes give the AI awareness of what entities exist in the lorebook without loading all the entity details into context.

## Problem Solved

Without category indexes, the AI has no way to know what entities exist in the lorebook until they are mentioned by name or alias. This creates problems:

1. **Limited Awareness**: AI doesn't know what characters, locations, or items are available
2. **Narrow Context**: AI can't make informed decisions about which entities to reference
3. **Poor Suggestions**: AI may suggest generic NPCs instead of using existing lorebook entries

## Solution: Category Index Entries

Category indexes are special lorebook entries that:

1. **List all entities** in each category (Characters, Locations, Objects, etc.)
2. **Always active** (constant: true) - always injected into context
3. **Don't trigger child entries** (excludeRecursion: true) - prevents context bloat
4. **Auto-update** when entities are added/removed/renamed
5. **Minimal tokens** - just entity names, no details

## How It Works

### Index Entry Structure

Each category gets one index entry:

**Example - Characters Index**:
```
Entry Name: __index_characters
Content: [Characters: Alice, Bob, Rainbow Dash, Mountain Dragon Rider]
Keys: characters, character list, known characters
Constant: true (always active)
Order: 1000 (high priority, injected early)
Depth: 0 (always included)
excludeRecursion: true (doesn't trigger child entries)
```

**Example - Locations Index**:
```
Entry Name: __index_locations
Content: [Locations: Cloudsdale, Dragon Mountain, Market Square, Ponyville, Weather Factory]
Keys: locations, location list, known locations, places
Constant: true
Order: 998
Depth: 0
excludeRecursion: true
```

### Why excludeRecursion is Critical

**Without excludeRecursion**:
```
[Characters: Alice, Bob, Rainbow Dash]  ← Injected (constant: true)
  ↓ Mentions "Alice", "Bob", "Rainbow Dash"
  ↓ ALL CHARACTER ENTRIES TRIGGER!

[Alice: details about Alice...]  ← Injected
[Bob: details about Bob...]      ← Injected
[Rainbow Dash: details...]       ← Injected

Result: ALL characters always in context = massive bloat
```

**With excludeRecursion: true**:
```
[Characters: Alice, Bob, Rainbow Dash]  ← Injected (constant: true)
  ↓ excludeRecursion = true
  ↓ Mentions don't trigger child entries

[Alice: ...]     ← Only triggers when "Alice" mentioned in actual messages
[Bob: ...]       ← Only triggers when "Bob" mentioned in actual messages
[Rainbow Dash: ...]  ← Only triggers when "Rainbow Dash" mentioned in actual messages

Result: AI knows characters exist, but details load only when relevant
```

## Categories

The system creates indexes for these categories:

| Category | Prefix | Example Entities | Keys |
|----------|--------|-----------------|------|
| **Characters** | `character-` | Alice, Bob, Rainbow Dash | characters, character list, known characters |
| **Creatures** | `creature-` | Mountain Dragon, Sky Serpent | creatures, creature list, known creatures |
| **Locations** | `location-` | Cloudsdale, Ponyville | locations, location list, known locations, places |
| **Objects** | `object-` | Dragonscale Shield, Ancient Artifact | objects, object list, known objects, items |
| **Factions** | `faction-` | Dragon Hunters Guild, Weather Team | factions, faction list, known factions, organizations |
| **Concepts** | `concept-` | Weather Magic, Dragon Taming | concepts, concept list, known concepts |

## Auto-Update Behavior

Category indexes automatically update when:

### 1. Entity Created

When a new entity is added:
```javascript
// Entity created: character-Alice
// Triggers category index update for 'character'
[Characters: Alice]  // Index updated
```

### 2. Entity Deleted

When an entity is removed:
```javascript
// Entity deleted: character-Bob
// Triggers category index update for 'character'
[Characters: Alice, Rainbow Dash]  // Bob removed from index
```

### 3. Manual Update

User can manually trigger full rebuild:
```
/autolorebooks-update-indexes
```

This scans all entries and rebuilds all category indexes.

## Usage

### Automatic (Recommended)

Category indexes update automatically when using the entity extraction system. When a summary with entity data is processed:

1. Entity lorebook entry created (e.g., `character-Alice`)
2. Category extracted from entity type (e.g., `character`)
3. Category index automatically updated (`__index_characters`)

### Manual Commands

#### Update All Indexes

```
/autolorebooks-update-indexes [lorebook_name]
```

Scans the entire lorebook and rebuilds all category indexes.

**Example**:
```
/autolorebooks-update-indexes
```
(Uses attached lorebook)

```
/autolorebooks-update-indexes z-AutoLB - Alice - chat123
```
(Uses specific lorebook)

#### Show Category Statistics

```
/autolorebooks-show-stats [lorebook_name]
```

Displays count of entities in each category.

**Example Output**:
```
Total entities: 15
character: 5
creature: 2
location: 4
object: 3
faction: 1
concept: 0
```

### Programmatic API

```javascript
import { updateAllCategoryIndexes, updateCategoryIndex, getCategoryStats } from './index.js';

// Update all category indexes
await updateAllCategoryIndexes(lorebookName);

// Update specific category
await updateCategoryIndex(lorebookName, 'character');

// Get statistics
const stats = await getCategoryStats(lorebookName);
console.log(`Total entities: ${stats.total}`);
```

## Example: Complete Flow

### Step 1: Empty Lorebook

```
Lorebook: z-AutoLB - Alice - chat123
Entries: (none)
```

### Step 2: First Entity Added

```javascript
// Summary with entity
{
  "entities": [{
    "name": "Bob",
    "type": "npc",
    "properties": ["merchant", "friendly"]
  }]
}

// Creates entry: character-Bob
// Updates category index
```

**Result**:
```
Entries:
  __index_characters: [Characters: Bob]
  character-Bob: [Bob: merchant, friendly]
```

### Step 3: More Entities Added

```javascript
// More summaries with entities
{
  "entities": [
    { "name": "Cloudsdale", "type": "location", ... },
    { "name": "Rainbow Dash", "type": "character", ... }
  ]
}

// Creates entries and updates indexes
```

**Result**:
```
Entries:
  __index_characters: [Characters: Bob, Rainbow Dash]
  __index_locations: [Locations: Cloudsdale]
  character-Bob: [Bob: merchant, friendly]
  character-Rainbow Dash: [Rainbow Dash: pegasus, cyan coat, ...]
  location-Cloudsdale: [Cloudsdale: floating city, ...]
```

### Step 4: During Message Generation

**Context Includes**:
```
[Characters: Bob, Rainbow Dash]  ← Always injected (constant)
[Locations: Cloudsdale]           ← Always injected (constant)
```

**If message mentions "Bob"**:
```
[Characters: Bob, Rainbow Dash]
[Locations: Cloudsdale]
[Bob: merchant, friendly]  ← Triggered by mention
```

**If message mentions "Cloudsdale"**:
```
[Characters: Bob, Rainbow Dash]
[Locations: Cloudsdale]
[Cloudsdale: floating city, ...]  ← Triggered by mention
```

**Result**: AI knows all available entities but only loads details when relevant!

## Token Impact

### Without Category Indexes

**Problem**: AI has no awareness of entities until mentioned
```
AI sees: (no entity information)
AI suggests: "a random merchant" instead of using Bob
```

### With Category Indexes (Naive - triggers all entries)

**Problem**: All entity details always loaded
```
Token cost: ~2000 tokens (all entity details always loaded)
AI sees: All details for all entities (massive context bloat)
```

### With Category Indexes (excludeRecursion: true)

**Optimal**: AI aware of entities, details load on demand
```
Token cost: ~50-100 tokens (just index entries)
AI sees: [Characters: Bob, Rainbow Dash]
         [Locations: Cloudsdale]
AI knows: Bob exists, can reference him
Details load: Only when "Bob" actually mentioned

Result: Minimal tokens + full awareness!
```

## Implementation Details

### Entry Naming Convention

Category index entries use special naming to avoid conflicts:

```
__index_characters
__index_creatures
__index_locations
__index_objects
__index_factions
__index_concepts
```

The `__index_` prefix ensures:
1. Easy identification as system entries
2. No collision with user-created entries
3. Consistent sorting in lorebook UI

### Entry Properties

```javascript
{
  comment: "__index_characters",
  content: "[Characters: Alice, Bob, Charlie]",
  keys: ["characters", "character list", "known characters"],
  constant: true,           // Always active
  order: 1000,              // High priority (injected early)
  depth: 0,                 // Always included regardless of depth
  position: 6,              // Depth-based positioning
  excludeRecursion: true,   // DON'T trigger child entries
  preventRecursion: true,   // Alternative property for safety
  disable: false            // Entry is active
}
```

### Category Detection

When scanning entries, category is detected from entry name prefix:

```javascript
"character-Alice"  → category: character
"location-Cloudsdale-Weather Factory"  → category: location
"object-Dragonscale Shield"  → category: object
"creature-Mountain Dragon"  → category: creature
"faction-Dragon Hunters Guild"  → category: faction
"concept-Weather Magic"  → category: concept
```

### Alphabetical Sorting

Entities within each index are sorted alphabetically for consistency and readability:

```
[Characters: Alice, Bob, Charlie, Rainbow Dash]
NOT: [Characters: Bob, Alice, Rainbow Dash, Charlie]
```

## Best Practices

### 1. Keep Indexes Updated

After bulk operations, update indexes:
```
/autolorebooks-update-indexes
```

### 2. Monitor Entity Count

Check category stats periodically:
```
/autolorebooks-show-stats
```

If a category has too many entities (50+), consider:
- Creating sub-categories
- Using selective inclusion
- Pruning unused entities

### 3. Verify excludeRecursion

Ensure category indexes don't trigger child entries:
1. Check lorebook entry has `excludeRecursion: true`
2. Test by viewing prompt context in debug mode
3. Verify only index entries appear, not all entities

### 4. Use Descriptive Entity Names

Entity names appear in indexes, so make them clear:

✅ Good:
```
[Characters: Bob the Merchant, Alice the Adventurer, Rainbow Dash]
```

❌ Bad:
```
[Characters: Bob, Alice, RD, Guy1, NPC2]
```

## Troubleshooting

### Problem: All entities always in context

**Cause**: excludeRecursion not set correctly
**Fix**:
```javascript
// Ensure index entries have:
excludeRecursion: true
preventRecursion: true
```

### Problem: Category indexes not updating

**Cause**: Auto-update not triggering
**Fix**: Manually update indexes:
```
/autolorebooks-update-indexes
```

### Problem: Entities missing from index

**Cause**: Entry naming doesn't match expected format
**Fix**: Ensure entity entries use correct prefixes:
- `character-{name}`
- `location-{name}`
- `object-{name}`
- etc.

### Problem: Too many entities in one category

**Cause**: Large lorebook with many entities
**Fix**: Consider:
1. Split into sub-categories
2. Use PList Base World format (for 50+ total entities)
3. Manually curate which entities to index

## Advanced: Custom Categories

To add custom categories, update `CATEGORY_CONFIG` in `categoryIndexes.js`:

```javascript
const CATEGORY_CONFIG = {
    // ... existing categories ...

    'vehicle': {
        indexName: '__index_vehicles',
        displayName: 'Vehicles',
        keys: ['vehicles', 'vehicle list', 'known vehicles'],
        order: 994,
        description: 'List of all known vehicles'
    }
};
```

Then use `vehicle-` prefix for vehicle entities:
```
vehicle-Airship
vehicle-Dragon Cart
```

---

**Result**: AI has full awareness of your world with minimal token cost!

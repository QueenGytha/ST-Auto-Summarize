# Lorebook Entry Processing System - Complete Overview

## What This System Does

The Auto-Lorebooks system automatically builds and maintains a "living encyclopedia" of your chat. As you chat with AI characters, the system:

1. **Detects important entities** (characters, places, items, factions, etc.) from the conversation
2. **Checks if they already exist** in your lorebook to avoid duplicates
3. **Merges new information** with existing entries or creates new ones
4. **Maintains organized indexes** so the AI can easily find relevant information
5. **Tracks dynamic information** like GM notes and character stats that update frequently

This all happens automatically in the background, requiring no manual intervention.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CHAT ACTIVITY                                │
│  • User sends message                                                │
│  • AI responds                                                       │
│  • Scene recap generated (every N messages)                        │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ENTRY EXTRACTION                                  │
│                                                                       │
│  Scene Recap JSON:                                                 │
│  {                                                                    │
│    "recap": "Alice met Bob at the tavern...",                      │
│    "lorebooks": [                                                    │
│      {"name": "Alice", "content": "...", "type": "character"},       │
│      {"name": "Rusty Tankard", "content": "...", "type": "location"} │
│    ]                                                                  │
│  }                                                                    │
│                                                                       │
│  Each entry queued for processing ───────┐                           │
└──────────────────────────────────────────┼───────────────────────────┘
                                           │
           ┌───────────────────────────────┴──────────────────┐
           │                                                   │
           ▼                                                   ▼
    ┌──────────────┐                                  ┌──────────────┐
    │   ENTRY #1   │                                  │   ENTRY #2   │
    │   (Alice)    │                                  │ (Rusty Tank) │
    └──────┬───────┘                                  └──────┬───────┘
           │                                                   │
           └───────────────────┬───────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STAGE 1: NORMALIZATION                            │
│                                                                       │
│  • Standardize entry structure                                       │
│  • Clean entity type names                                           │
│  • Ensure required fields exist                                      │
│                                                                       │
│  Output: {comment, content, keys, secondaryKeys, type}               │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STAGE 2: LOREBOOK ENTRY LOOKUP (AI)                              │
│                                                                       │
│  AI analyzes:                                                        │
│  • What type of entity is this? (character/location/etc.)            │
│  • Does it match any existing entities?                              │
│  • How confident are we about matches?                               │
│                                                                       │
│  Input:                                                              │
│  • New entry data                                                    │
│  • Registry of ALL existing entities (lightweight listing)           │
│                                                                       │
│  Output:                                                             │
│  {                                                                    │
│    "type": "character",                                              │
│    "synopsis": "Brief description",                                  │
│    "sameEntityIds": ["char_0001"],    ← Definite matches             │
│    "needsFullContextIds": ["char_005"] ← Uncertain, needs LorebookEntryDeduplicate │
│  }                                                                    │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
               ┌───────────────┐
               │  Decision:    │
               │  Matches?     │
               └───┬───────┬───┘
                   │       │
        ┌──────────┘       └───────────┐
        │                               │
        ▼                               ▼
  No matches                    Has matches
  or uncertain?                 and certain?
        │                               │
        ▼                               ▼
┌────────────────┐              Skip LorebookEntryDeduplicate
│  STAGE 3:      │                     │
│  LorebookEntryDeduplicate    │                     │
│  (AI)          │                     │
│                │                     │
│ With full      │                     │
│ context of     │                     │
│ candidate      │                     │
│ entries,       │                     │
│ determine:     │                     │
│                │                     │
│ • Same entity? │                     │
│ • Different?   │                     │
│                │                     │
│ Output:        │                     │
│ {              │                     │
│   "resolvedId" │                     │
│   "synopsis"   │                     │
│ }              │                     │
└────────┬───────┘                     │
         │                             │
         └─────────────┬───────────────┘
                       │
                       ▼
               ┌───────────────┐
               │  Decision:    │
               │  Create or    │
               │  Merge?       │
               └───┬───────┬───┘
                   │       │
        ┌──────────┘       └──────────┐
        │                              │
        ▼                              ▼
  Found match                    No match found
  (merge)                        (create new)
        │                              │
        ▼                              ▼
┌────────────────┐              ┌────────────────┐
│  STAGE 4A:     │              │  STAGE 4B:     │
│  MERGE (AI)    │              │  CREATE        │
│                │              │                │
│ AI combines:   │              │ • Generate     │
│ • Existing     │              │   unique ID    │
│   content      │              │   (char_0042)  │
│ • New info     │              │                │
│                │              │ • Set flags    │
│ Smart merge:   │              │   based on     │
│ • Add new      │              │   entity type  │
│   details      │              │                │
│ • Update       │              │ • Create entry │
│   changed info │              │   in lorebook  │
│ • Remove       │              │                │
│   conflicts    │              │ • Add to       │
│ • Keep         │              │   registry     │
│   formatting   │              │                │
└────────┬───────┘              └────────┬───────┘
         │                               │
         └───────────────┬───────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   STAGE 5: REGISTRY UPDATE                           │
│                                                                       │
│  Update the AI-readable index for this entity type:                  │
│                                                                       │
│  [Registry: Characters]                                              │
│  - id: char_0001 | name: Alice | aliases: ... | synopsis: ...        │
│  - id: char_0002 | name: Bob | aliases: ... | synopsis: ...          │
│  - id: char_0042 | name: Carol | aliases: ... | synopsis: ...        │
│                                                                       │
│  Purpose: Next lorebook entry lookup stage uses this for quick matching             │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   STAGE 6: CATEGORY INDEXES                          │
│                                                                       │
│  Update category recap entries:                                    │
│                                                                       │
│  [Characters: Alice, Bob, Carol, David]                              │
│  [Locations: Waterdeep, The Rusty Tankard, The Market Square]        │
│  [Objects: Sword of Truth, Ancient Amulet]                           │
│                                                                       │
│  Purpose: Give AI quick overview of what entities exist              │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
                  ┌─────────┐
                  │  DONE!  │
                  │         │
                  │ User    │
                  │ notified│
                  └─────────┘
```

---

## The Three AI Stages Explained

### Stage 2: Lorebook Entry Lookup (Lightweight Matching)

**Purpose**: Quick scan to find potential duplicates without loading full entry details.

**How it works**:
- AI receives a compact registry listing (just names, aliases, IDs, brief synopsis)
- AI determines entity type and identifies potential matches
- Returns confidence levels: "definitely the same" vs "might be, need full context"

**Why lightweight?**
- Faster processing
- Lower token usage
- Can handle large registries
- Only loads full details if needed

**Example**:
```
New entry: "Alice, a skilled merchant"
Registry snippet:
  - char_0001 | Alice | aliases: Alice Smith | synopsis: Local trader
  - char_0005 | Alicia | aliases: The Mysterious One | synopsis: Unknown woman

Lorebook Entry Lookup decision:
  - char_0001: DEFINITE match (same name, similar role)
  - char_0005: UNCERTAIN (similar name, but different context)
```

### Stage 3: LorebookEntryDeduplicate (Full Context Analysis)

**Purpose**: For uncertain cases, analyze full entry details to make final decision.

**How it works**:
- Loads complete content, keywords, aliases for all uncertain matches
- AI compares full details: "Is this the same person or a different character?"
- Returns definitive answer

**Only runs when**: Lorebook Entry Lookup found uncertain matches

**Example**:
```
New entry: "Alicia, wearing a hooded cloak"
Full candidate: {
  name: "Alicia",
  content: "A mysterious figure in a cloak, identity unknown",
  keys: ["Alicia", "mysterious", "cloaked"],
  aliases: ["The Mysterious One", "Hooded Figure"]
}

LorebookEntryDeduplicate decision: SAME entity (description matches perfectly)
```

### Stage 4: Merge (Intelligent Combination)

**Purpose**: Combine new information with existing entry without losing details.

**How it works**:
- AI reads existing entry content
- AI reads new information
- AI writes updated version that:
  - Keeps all existing details still relevant
  - Adds new information
  - Updates changed details
  - Resolves contradictions
  - Maintains formatting

**Example**:
```
Existing: "Alice is a merchant in Waterdeep. She sells rare herbs."
New info: "Alice, a skilled merchant known for fair prices"

Merged: "Alice is a skilled merchant in Waterdeep known for fair prices.
         She sells rare herbs."
```

---

## Supporting Systems

### Tracking Entries (Dynamic Metadata)

**Problem**: Some information updates frequently (character HP, current plot threads, session notes).

**Solution**: Special lorebook entries that AI can edit directly in chat messages.

**How it works**:
```
AI message: "You take 10 damage! <-- character_stats: HP: 40/100 -->"

System detects syntax → Extracts update → Merges with existing stats entry
```

**Two types**:
1. **GM Notes**: `<-- gm_notes: Current plot thread info -->`
2. **Character Stats**: `<-- character_stats: HP: 40/100, Gold: 250 -->`

**Properties**:
- Always active (appear in every AI context window)
- Auto-update when AI uses tracking syntax
- Can be hidden from chat display (optional)

### Category Indexes (Quick Reference)

**Purpose**: Give AI a quick "table of contents" of what exists.

**Format**:
```
[Characters: Alice, Bob, Carol, David, Edmund]
[Locations: Waterdeep, The Rusty Tankard, The Market Square, The Docks]
[Factions: The Merchants Guild, The City Watch, The Shadow Thieves]
```

**Always active**: These appear in every AI context to help it know what lorebook entries exist.

**Auto-maintained**: Updated after any entry creation/modification.

---

## Key Design Decisions

### Why Three Stages? (Lorebook Entry Lookup → LorebookEntryDeduplicate → Merge)

**Token efficiency**: Don't load full entry details unless needed.

**Accuracy**: Lightweight lorebook entry lookup catches 90% of cases, LorebookEntryDeduplicate handles edge cases.

**Example**:
- 100 existing characters in registry
- New entry: "Alice"
- Lorebook Entry Lookup scans all 100 (lightweight)
- Only loads full details for 2 uncertain matches
- LorebookEntryDeduplicate analyzes just those 2

### Why AI-Powered Merging?

**Context understanding**: AI knows what details are important vs redundant.

**Natural language**: Can rephrase for clarity while preserving meaning.

**Contradiction handling**: Can resolve conflicting information intelligently.

**Example**:
```
Existing: "Alice has brown hair."
New: "Alice's blonde hair shimmers."

Manual merge: Confusion. Which is right?
AI merge: "Alice's blonde hair shimmers. [Previously described with brown hair]"
```

### Why Entity IDs?

**Persistent identity**: Entry names can change, IDs don't.

**Cross-referencing**: Other entries can reference by ID.

**Deduplication**: Prevents "Alice" and "alice" from creating duplicates.

**Format**: `{type_prefix}_{counter}`
- `char_0001`, `char_0002` (characters)
- `loca_0001`, `loca_0002` (locations)
- `fact_0001`, `fact_0002` (factions)

---

## Example: Complete Walkthrough

### Setup
- Chat started with character "Aria"
- Lorebook auto-created: "z-AutoLB-Aria - 20250124"
- Tracking entries initialized (GM Notes, Character Stats)

### Scene 1: Introduction
```
User: "I enter the tavern."
AI: "You push open the heavy oak door. The Rusty Tankard is packed tonight.
     Behind the bar, Marcus the bartender waves. <-- character_stats: HP: 100/100, Gold: 50 -->"
```

**Processing**:
1. Scene recap generated (every N messages)
2. Recap includes:
   - Entity: "The Rusty Tankard" (location)
   - Entity: "Marcus" (character)
3. Two entries queued

**Entry: The Rusty Tankard**
- Lorebook Entry Lookup: No existing locations match → Type: location
- LorebookEntryDeduplicate: Skipped (no matches)
- Create: New entry `loca_0001`
- Registry: Added to location registry
- Category Index: "[Locations: The Rusty Tankard]"

**Entry: Marcus**
- Lorebook Entry Lookup: No existing characters match → Type: character
- LorebookEntryDeduplicate: Skipped
- Create: New entry `char_0001`
- Registry: Added to character registry
- Category Index: "[Characters: Marcus]"

**Tracking Entry: Character Stats**
- Detected syntax in AI message
- Merged with existing stats: "HP: 100/100, Gold: 50"
- Entry updated

### Scene 2: Combat
```
User: "I attack the bandits!"
AI: "You draw your sword and charge the three bandits!
     <-- character_stats: HP: 75/100, Gold: 50 -->
     <-- gm_notes: Combat encounter with bandits at The Rusty Tankard -->"
```

**Processing**:

**Tracking Updates**:
- Stats updated: "HP: 75/100, Gold: 50"
- GM Notes updated: "Combat encounter with bandits at The Rusty Tankard"

**Scene Recap**:
- Entity: "Bandit Group" (character/creature)

**Entry: Bandit Group**
- Lorebook Entry Lookup: No matches → Type: character
- Create: New entry `char_0002`
- Category Index: "[Characters: Marcus, Bandit Group]"

### Scene 3: Marcus Helps
```
User: "Marcus, help me!"
AI: "Marcus vaults over the bar, grabbing a club. 'I've got your back!' he shouts.
     The veteran soldier charges into the fray."
```

**Processing**:

**Scene Recap**:
- Entity: "Marcus" (character) - now with more info
  - "A veteran soldier who owns The Rusty Tankard"

**Entry: Marcus**
- Lorebook Entry Lookup: MATCH found → char_0001
- LorebookEntryDeduplicate: Skipped (definite match)
- Merge:
  - Existing: "Marcus, the bartender"
  - New: "A veteran soldier who owns The Rusty Tankard"
  - Result: "Marcus is a veteran soldier who owns The Rusty Tankard tavern. He works as the bartender."
- Registry: Updated char_0001 synopsis

### Final State

**Lorebook "z-AutoLB-Aria - 20250124"**:

**Always Active Entries**:
- `[Characters: Marcus, Bandit Group]` (category index)
- `[Locations: The Rusty Tankard]` (category index)
- `HP: 75/100, Gold: 50` (character stats)
- `Combat encounter with bandits at The Rusty Tankard` (GM notes)

**Regular Entries** (activate when keywords match):
- `char_0001` (Marcus) - Keys: ["Marcus", "bartender", "veteran"]
- `char_0002` (Bandit Group) - Keys: ["bandits", "thugs"]
- `loca_0001` (The Rusty Tankard) - Keys: ["tavern", "Rusty Tankard", "bar"]

**Registry Entries** (hidden, for AI processing only):
- `_registry_character` - List of Marcus + Bandit Group
- `_registry_location` - List of The Rusty Tankard

---

## Benefits of This System

### For Users
- **Zero manual work**: Lorebook builds itself
- **No duplicates**: Smart matching prevents "Alice" × 3
- **Always up-to-date**: New info automatically merged
- **Dynamic tracking**: Stats and notes update in real-time

### For AI
- **Rich context**: Detailed entity information available
- **Quick lookup**: Category indexes show what exists
- **Organized knowledge**: Easy to find relevant entries
- **Persistent memory**: Information survives across sessions

### For Developers
- **Modular design**: Each stage independent and testable
- **Queue-based**: Rate limiting prevents API throttling
- **Error resilient**: Failures don't corrupt data
- **Extensible**: Easy to add new entity types

---

## Technical Notes

### Operation Queue
All processing happens through a persistent queue:
- **Rate limiting**: Prevents API throttling
- **Retries**: Automatic retry on transient failures
- **Progress tracking**: User can see what's processing
- **Cancellation**: Can abort long-running operations

### LLM Call Efficiency
Each operation makes ≤1 LLM call:
- **Lorebook Entry Lookup**: 1 call
- **LorebookEntryDeduplicate**: 1 call (if needed)
- **Merge**: 1 call

**Why**: If operation fails, queue retries entire operation. Multiple LLM calls = wasted tokens on retry.

### Settings-Driven
All prompts and behavior configurable:
- Entity type definitions
- Lorebook Entry Lookup prompt template
- LorebookEntryDeduplicate prompt template
- Merge prompt template
- Category names
- Tracking syntax patterns

---

## Recap

The Auto-Lorebooks system provides a complete, AI-powered "memory management" solution that:

1. **Automatically extracts** entities from conversations
2. **Intelligently deduplicates** using multi-stage AI analysis
3. **Merges new information** with existing entries
4. **Maintains organized indexes** for quick reference
5. **Tracks dynamic data** via AI-editable entries

All of this happens transparently in the background, creating a rich, living encyclopedia of your chat world with zero manual effort.

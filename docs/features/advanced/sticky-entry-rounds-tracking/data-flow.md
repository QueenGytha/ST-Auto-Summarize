# Sticky Entry Rounds Tracking - Data Flow

## Generation Cycle Flow

```
User Sends Message (Round N)
    ↓
GENERATION_STARTED Event
├─ currentGenerationType = 'normal'|'swipe'|'continue'
└─ targetMessageIndex = calculated

SillyTavern Scans Lorebook
└─ Determines entries to inject

WORLD_INFO_ACTIVATED Event (entries=[...])
    ↓
Handler Execution:
    ├─ decrementStickyCounters()
    │  ├─ For each uid in activeStickyEntries:
    │  │  ├─ if stickyCount > 0: stickyCount--
    │  │  └─ if stickyCount == 0: delete from map
    │  └─ Log operations
    │
    ├─ getStillActiveEntries()
    │  └─ Return entries where constant OR stickyCount > 0
    │
    ├─ mergedEntries = stillActive + newlyActivated
    │
    ├─ Load ALL entries from ALL lorebooks
    │
    ├─ Persist to message.extra:
    │  ├─ activeLorebookEntries = active[]
    │  └─ inactiveLorebookEntries = inactive[]
    │
    └─ updateStickyTracking(newlyActivated)
       ├─ For each entry in newlyActivated:
       │  ├─ if sticky > 0: register with stickyCount=sticky
       │  └─ if constant: register with stickyCount=Infinity
       └─ Update activeStickyEntries Map

Message Generated
    ↓
Round Complete
```

## Sticky Entry State Transitions

```
Entry Definition: sticky=3, constant=false
    ↓
[Round 1] WORLD_INFO_ACTIVATED (Entry matches keyword)
    ├─ updateStickyTracking(): activeStickyEntries.set(uid, {stickyCount: 3})
    └─ Entry active (Round 1 of 3)

[Round 2] WORLD_INFO_ACTIVATED
    ├─ decrementStickyCounters(): stickyCount 3 → 2
    ├─ getStillActiveEntries(): Include (2 > 0)
    └─ Entry active (Round 2 of 3)

[Round 3] WORLD_INFO_ACTIVATED
    ├─ decrementStickyCounters(): stickyCount 2 → 1
    ├─ getStillActiveEntries(): Include (1 > 0)
    └─ Entry active (Round 3 of 3)

[Round 4] WORLD_INFO_ACTIVATED
    ├─ decrementStickyCounters(): stickyCount 1 → 0
    ├─ activeStickyEntries.delete(uid) - Entry removed
    ├─ getStillActiveEntries(): Exclude (not in map)
    └─ Entry expired - No longer active

Result: Entry active for exactly 3 generations
```

## Decrement Count Example

```
Setup:
  Entry A: constant=true
  Entry B: sticky=3
  Entry C: sticky=1

ROUND 1: All entries activated
  activeStickyEntries after updateStickyTracking():
    ├─ A: stickyCount=∞
    ├─ B: stickyCount=3
    └─ C: stickyCount=1
  
  Active entries sent to LLM: [A, B, C]

ROUND 2: Only B mentioned in text
  decrementStickyCounters():
    ├─ A: ∞ → ∞ (unchanged, constant)
    ├─ B: 3 → 2
    └─ C: 1 → 0 (expires!)
  
  Remove expired: Delete C from map
  
  getStillActiveEntries(): [A, B]
  
  Merge: [A, B] + [B] = [A, B]
  
  Active entries: [A, B]

ROUND 3: Neither B nor C mentioned
  decrementStickyCounters():
    ├─ A: ∞ → ∞
    └─ B: 2 → 1
  
  getStillActiveEntries(): [A, B]
  
  Active entries: [A, B]

ROUND 4: No entries triggered
  decrementStickyCounters():
    ├─ A: ∞ → ∞
    └─ B: 1 → 0 (expires!)
  
  Remove expired: Delete B from map
  
  getStillActiveEntries(): [A]
  
  Active entries: [A]

ROUND 5+: Stable state
  Only A remains active (constant entry)
  Entry B: Active for 3 rounds (1-3) ✓
  Entry C: Active for 1 round (1) ✓
  Entry A: Always active ✓
```

## Multi-Entry Scenario

```
Setup:
  ├─ Location: Tavern (constant=true)
  ├─ NPC: Bartender (sticky=2)
  └─ Item: Ale Mug (sticky=1)

Round 1: All triggered
  activeStickyEntries:
    ├─ Tavern: {stickyCount: ∞}
    ├─ Bartender: {stickyCount: 2}
    └─ Ale: {stickyCount: 1}
  
  Active: [Tavern, Bartender, Ale]

Round 2: Text mentions Tavern and something else (not Bartender/Ale)
  decrementStickyCounters():
    ├─ Tavern: ∞ → ∞
    ├─ Bartender: 2 → 1
    └─ Ale: 1 → 0 (expires)
  
  getStillActiveEntries(): [Tavern, Bartender]
  
  Newly triggered: [Tavern]
  
  Merged: [Tavern, Bartender, Tavern] → [Tavern, Bartender]
  
  Active: [Tavern, Bartender]

Round 3: Player leaves tavern
  decrementStickyCounters():
    ├─ Tavern: ∞ → ∞
    └─ Bartender: 1 → 0 (expires)
  
  getStillActiveEntries(): [Tavern]
  
  Newly triggered: []
  
  Active: [Tavern] only

Result:
  ✓ Tavern: constant, always active
  ✓ Bartender: sticky=2, active rounds 1-2
  ✓ Ale: sticky=1, active round 1 only
```

## Persistence Flow: Page Reload

```
Round 1 Completed:
  activeStickyEntries = {
    Bartender: {stickyCount: 2, entry}
  }
  
  message[12].extra = {
    activeLorebookEntries: [Bartender, Ale],
    inactiveLorebookEntries: []
  }
  
  SillyTavern saves message

User refreshes page:
  ├─ Extension reloads
  ├─ activeStickyEntries = new Map() (empty!)
  └─ Module-scoped variables reset

Round 2 starts:
  getActiveLorebooksForMessage(12):
    ├─ Check in-memory Map: activeStickyEntries empty
    ├─ Check message.extra: Found!
    └─ Return [Bartender, Ale] from persistence

  Next, WORLD_INFO_ACTIVATED fires:
    ├─ decrementStickyCounters(): No entries in map yet
    ├─ getStillActiveEntries(): [] (map still empty)
    ├─ Newly activated entries update tracking
    └─ updateStickyTracking(): Bartender re-registered

Result: Sticky state recovered from persistence
  ✓ In-memory state lost but reconstructed
  ✓ Entry remains active for remaining rounds
  ✓ Countdown continues from where it left off
```

## Merging Logic

```
activeStickyEntries state after decrement:
  ├─ Tavern: {constant=true, stickyCount=∞}
  └─ Bartender: {stickyCount: 2}

WORLD_INFO_ACTIVATED fired with newly triggered:
  [Tavern, Drunken Patron]

getStillActiveEntries():
  ├─ Tavern: constant=true → include
  ├─ Bartender: stickyCount=2 > 0 → include
  └─ Returns: [Tavern, Bartender]

Merging:
  stillActive = [Tavern, Bartender]
  newlyActivated = [Tavern, Drunken Patron]
  
  merged = [Tavern, Bartender, Tavern, Drunken Patron]
  
  De-duplication by UID:
  → [Tavern, Bartender, Drunken Patron]

Final active entries for LLM:
  ✓ Tavern (constant)
  ✓ Bartender (sticky countdown)
  ✓ Drunken Patron (newly triggered)
```

## Execution Order Matters

```
Why decrementStickyCounters() runs FIRST:

Option A: Decrement FIRST (correct)
  ├─ decrementStickyCounters()
  │  └─ Entry B: 3 → 2
  ├─ getStillActiveEntries()
  │  └─ Check count: 2 > 0 ✓ Include
  └─ Result: Entry B active for 3 total rounds

Option B: Decrement LAST (wrong)
  ├─ getStillActiveEntries()
  │  └─ Check count: 3 > 0 ✓ Include
  ├─ decrementStickyCounters()
  │  └─ Entry B: 3 → 2
  └─ Result: Entry B counted as active 4 times

Solution: Decrement BEFORE getting still-active
```

## Summary

Data flow ensures:

1. **Accurate Countdown**: Decrements each generation before merging
2. **Proper Expiration**: Removes entries when count reaches 0
3. **State Continuity**: Still-active entries merged even without keyword match
4. **Durable Persistence**: Survives page reload via message.extra
5. **Clean Lifecycle**: Clear entry → activate → persist → expire flow

The two-tier storage (in-memory + persistent) provides:
- **Fast access** during current session
- **Durability** across page reloads
- **Proper recovery** after reload

Each generation:
1. Decrements all counters
2. Identifies still-active entries
3. Merges with newly activated
4. Persists snapshot
5. Registers new entries for next generation

This creates a smooth, predictable entry lifecycle that adapts to user actions.

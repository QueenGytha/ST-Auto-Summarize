Stage 2 Organize: Issues and Working Notes
==========================================

## BASELINE PROMPT (established 2024-12-02)

Location: `default-prompts/scene-recap-stage2-organize.js`

### Purpose
Split Stage 1 extraction into two streams:
- **Recap** (always in context) - high-level plot
- **Entities** (keyword-activated lorebook) - detailed nuance

### Input
Stage 1 output: `{sn, extracted: [...]}`

### Output Structure
```json
{
  "sn": "scene name",
  "recap": {
    "outcomes": "High-level what happened",
    "threads": "Unresolved hooks",
    "state": "Current volatile status"
  },
  "entities": [
    {
      "type": "character|location|faction|item|lore",
      "name": "EntityName",
      "keywords": ["name", "aliases"],
      "content": {
        "who": "identity (characters)",
        "dynamics": {"TargetName": "relationship substance"},
        "quotes": ["exact words - context"],
        "status": "durable conditions"
      }
    }
  ]
}
```

### Entity Content Structure
Designed to resist lazy appending during merges:
- **who/what**: Replace entirely (not append)
- **dynamics**: Per-target key (replace per target)
- **quotes**: Limited slots (2-3 max, replace weakest)
- **status**: Supersede entirely

### Design Principles
- Recap = minimal, high-level plot summary
- Entities = nuance, detail, keyword-activated
- Intentional duplication: high-level in recap, detail in entity
- Consolidate paraphrases (same concept → keep best)
- NO universal filtering rules
- User character relationships go in OTHER character's dynamics

### Verified Performance (runs 15-18)

**baronial-0-18 (estate management, run-18 with volatile fix):**
- Recap: High-level outcomes, threads, state with ALL volatile numbers
- `recap.state`: "340 total ponies (280 earth, 40 pegasi, 20 unicorns)...150 bits in treasury...12 professional guards...40 militia..."
- 17 entities: 12 characters, 2 locations, 1 lore, 2 factions
- Entity.status now contains only durable info (titles, permanent conditions)
- Per-target dynamics with substance (not labels)
- Key quotes (Vesper, Bulwark, Hearthglow)

**scene-0-11 (fantasy action):**
- Recap: Village destroyed, Chosen, heading to Haven
- 7 entities: 2 characters, 2 locations, 1 faction, 2 lore
- Rance dynamics captures "insufferable horse" tension
- Gift-shock/Choosing Bond as lore entries (keyword-activated)

**scene-83-113 (intimate/relationship):**
- Recap: High-level (consummated, Co-Advisors, transformation)
- 5 entities: 3 characters, 2 lore
- Talia dynamics captures substance (vulnerabilities, Holderkin significance)
- NOT a sex transcript - captured MEANING
- Holderkin background as lore with psychological context

### Known Gaps
- Test harness display shows "undefined" for names/keywords (uses old field names)
- Entity keyword coverage could be more complete

### Resolved Issues
- **Volatile numbers in entity.status** (fixed in Iteration 2): Numbers now correctly in recap.state

---

## Development History

### Iteration 1 - Recap/Entity Split
First working implementation. Key decisions:
- Recap has outcomes/threads/state structure
- Entities have who/dynamics/quotes/status structure
- Per-target dynamics as object keys
- Lore type for non-character concepts that deserve keyword activation

### Iteration 2 - Volatile vs Durable Distinction (run-18)

**Problem**: Volatile numbers (population 340, treasury 150 bits) were being placed in `entity.status` for the Willowmere location. These numbers change frequently and need to be always visible (in recap), not keyword-activated (in lorebook entry).

**User feedback**: "population numbers etc in an estate management sim I would expect to be in the recap, not a lorebook entry"

**Solution**: Added VOLATILE vs DURABLE distinction to prompt without edge-casing:
```
VOLATILE vs DURABLE (critical distinction):
- VOLATILE = changes frequently → recap.state (always visible)
  Examples: population counts, treasury balance, resource levels, troop numbers, current locations
- DURABLE = persists long-term → entity.status (keyword-activated)
  Examples: permanent injuries, titles, what a place IS, established relationships

If characters discussed current numbers/quantities, those go in recap.state - they need to be visible without keyword activation because they change.
```

**Result**: Run-18 shows all volatile numbers now in recap.state:
```
"state": "340 total ponies (280 earth, 40 pegasi, 20 unicorns), median age 38. 12 professional guards...150 bits in treasury..."
```

Entity status fields now contain only durable conditions (Baron title, permanent relationships, what something IS).

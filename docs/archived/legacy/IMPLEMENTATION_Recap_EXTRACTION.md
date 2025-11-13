# Implementation Guide: Recap Extraction for Combining

**Purpose:** Implementation details for extracting ONLY the `recap` field when combining/reviewing memories

---

## Core Principle

When combining or reviewing multiple scene memories, the system should:
1. Parse each scene memory JSON
2. Extract ONLY the `recap` field (timeline)
3. Pass ONLY those recaps to the combination prompt
4. Handle lorebook entries separately (if at all)

**Why?**
- Combining is about merging TIMELINES, not detailed reference data
- Lorebook entries are static reference information that don't need narrative merging
- Reduces token usage dramatically
- Maintains clean separation of concerns

---

## Implementation in combinedRecap.js

### Current Behavior (OLD):
```javascript
// OLD - sends entire JSON including lorebooks
async function generate_combined_recap() {
    const recaps = collect_recaps_to_combine();

    // recaps is array of full JSON objects:
    // [
    //   { "recap": "...", "lorebooks": [...] },
    //   { "recap": "...", "lorebooks": [...] },
    // ]

    const prompt = fill_template(combined_prompt, {
        message: JSON.stringify(recaps, null, 2)  // ❌ Sends everything
    });

    // ... generate
}
```

### New Behavior (RECOMMENDED):
```javascript
// NEW - extracts only recap fields
async function generate_combined_recap() {
    const recaps = collect_recaps_to_combine();

    // Extract ONLY recap fields
    const timeline_recaps = extract_recap_fields(recaps);

    const prompt = fill_template(combined_prompt, {
        message: format_recaps_for_combining(timeline_recaps)  // ✅ Only timelines
    });

    // ... generate
}

/**
 * Extract only the recap (timeline) field from each memory
 * @param {Array} memories - Array of memory objects (may be JSON strings or objects)
 * @returns {Array} Array of recap strings
 */
function extract_recap_fields(memories) {
    const recaps = [];

    for (const memory of memories) {
        try {
            // Parse if string
            const parsed = typeof memory === 'string' ? JSON.parse(memory) : memory;

            // Extract recap field
            if (parsed && parsed.recap) {
                recaps.push(parsed.recap);
            } else if (typeof parsed === 'string') {
                // Legacy: if it's just a string (old format), use as-is
                recaps.push(parsed);
            } else {
                debug('[Extract Recaps] Memory has no recap field:', parsed);
            }
        } catch (err) {
            error('[Extract Recaps] Failed to parse memory:', err);
            // Skip this memory
        }
    }

    return recaps;
}

/**
 * Format extracted recaps for combining prompt
 * @param {Array<string>} recaps - Array of recap strings
 * @returns {string} Formatted text for prompt
 */
function format_recaps_for_combining(recaps) {
    // Simple numbered list
    return recaps.map((recap, idx) => {
        return `Scene ${idx + 1} recap:\n${recap}`;
    }).join('\n\n');
}
```

---

## Complete Example Flow

### Input: 3 Scene Memories

```javascript
const scene_memories = [
    {
        "recap": "Alice and Bob met at tavern. Bartender Grim told them about eastern road bandits.",
        "lorebooks": [
            {"name": "Grim", "type": "character", "keywords": ["Grim", "bartender"], "content": "Dwarf bartender..."},
            {"name": "Rusty Nail", "type": "location", "keywords": ["tavern"], "content": "Dimly lit tavern..."}
        ]
    },
    {
        "recap": "Traveled to Eastern Ruins. Temple ransacked, Sunblade stolen. Bob revealed Shadow Guild membership.",
        "lorebooks": [
            {"name": "Eastern Ruins", "type": "location", "keywords": ["ruins"], "content": "Ancient temple..."},
            {"name": "Bob - Shadow Guild", "type": "concept", "keywords": ["Bob secret"], "content": "Bob is Guild member..."}
        ]
    },
    {
        "recap": "Bandits ambushed on eastern road. Alice killed two, Bob disabled one. Alice wounded in shoulder.",
        "lorebooks": [
            {"name": "Alice - Status", "type": "concept", "keywords": ["Alice wounded"], "content": "Arrow wound..."}
        ]
    }
];
```

### Step 1: Extract Recap Fields

```javascript
const timeline_recaps = extract_recap_fields(scene_memories);

// Result:
// [
//   "Alice and Bob met at tavern. Bartender Grim told them about eastern road bandits.",
//   "Traveled to Eastern Ruins. Temple ransacked, Sunblade stolen. Bob revealed Shadow Guild membership.",
//   "Bandits ambushed on eastern road. Alice killed two, Bob disabled one. Alice wounded in shoulder."
// ]
```

### Step 2: Format for Prompt

```javascript
const formatted = format_recaps_for_combining(timeline_recaps);

// Result:
// "Scene 1 recap:
// Alice and Bob met at tavern. Bartender Grim told them about eastern road bandits.
//
// Scene 2 recap:
// Traveled to Eastern Ruins. Temple ransacked, Sunblade stolen. Bob revealed Shadow Guild membership.
//
// Scene 3 recap:
// Bandits ambushed on eastern road. Alice killed two, Bob disabled one. Alice wounded in shoulder."
```

### Step 3: Send to AI

```javascript
const prompt = `// OOC REQUEST: Combine these scene recaps into one unified timeline...
//
// NEW SCENE RECAPS TO MERGE:
${formatted}

// Output the UPDATED combined recap as a plain string:
`;

const combined_recap = await generate_with_ai(prompt);

// AI receives ONLY the timeline recaps, not the lorebook entries
// Result: Combined timeline string
```

### Step 4: AI Returns Combined Recap

```javascript
// AI output (plain string):
const result = "Alice and Bob met at tavern where bartender Grim warned about eastern road bandits. They traveled to Eastern Ruins and found temple ransacked with Sunblade stolen. Bob revealed Shadow Guild membership. Returning via eastern road, bandits ambushed them. Alice killed two, Bob disabled one. Alice sustained arrow wound in shoulder but remained functional."
```

---

## Token Savings Example

### OLD Approach (sending full JSON):
```javascript
// Input to AI (all 3 scenes with lorebooks):
{
  "recap": "Alice and Bob met at tavern...",
  "lorebooks": [
    {"name": "Grim", "type": "character", "keywords": ["Grim", "bartender"], "content": "Dwarf bartender at Rusty Nail. Gruff demeanor but helpful. Has knowledge of local rumors..."},
    {"name": "Rusty Nail", "type": "location", "keywords": ["tavern", "Rusty Nail"], "content": "Dimly lit tavern in merchant quarter. Heavy wooden door. Smells of ale and pipe smoke..."}
  ]
}
// ... plus 2 more full JSON objects

// Estimated tokens: ~1,500 tokens
```

### NEW Approach (recap fields only):
```javascript
// Input to AI (just recaps):
Scene 1 recap:
Alice and Bob met at tavern. Bartender Grim told them about eastern road bandits.

Scene 2 recap:
Traveled to Eastern Ruins. Temple ransacked, Sunblade stolen. Bob revealed Shadow Guild membership.

Scene 3 recap:
Bandits ambushed on eastern road. Alice killed two, Bob disabled one. Alice wounded in shoulder.

// Estimated tokens: ~150 tokens
```

**Token savings: ~90% reduction!**

---

## Lorebook Entry Merging (Optional)

If you want to merge lorebook entries separately:

```javascript
/**
 * Merge lorebook entries from multiple scenes
 * @param {Array} memories - Array of memory objects
 * @returns {Array} Consolidated lorebook entries
 */
function merge_lorebook_entries(memories) {
    const lorebook_map = new Map();

    for (const memory of memories) {
        try {
            const parsed = typeof memory === 'string' ? JSON.parse(memory) : memory;

            if (!parsed.lorebooks || !Array.isArray(parsed.lorebooks)) {
                continue;
            }

            for (const entry of parsed.lorebooks) {
                const key = `${entry.name}|${entry.type}`;

                if (lorebook_map.has(key)) {
                    // Entry exists - merge/update
                    const existing = lorebook_map.get(key);

                    // Merge keywords (deduplicate)
                    const merged_keywords = [...new Set([...existing.keywords, ...entry.keywords])];

                    // Take most recent content (or merge manually)
                    const merged_entry = {
                        name: entry.name,
                        type: entry.type,
                        keywords: merged_keywords,
                        content: entry.content  // Most recent wins, or implement custom merge logic
                    };

                    lorebook_map.set(key, merged_entry);
                } else {
                    // New entry
                    lorebook_map.set(key, entry);
                }
            }
        } catch (err) {
            error('[Merge Lorebooks] Failed to process memory:', err);
        }
    }

    return Array.from(lorebook_map.values());
}
```

### Usage:

```javascript
async function generate_combined_memory() {
    const scene_memories = collect_recaps_to_combine();

    // 1. Combine timelines (AI-assisted)
    const timeline_recaps = extract_recap_fields(scene_memories);
    const combined_timeline = await combine_recaps_with_ai(timeline_recaps);

    // 2. Merge lorebook entries (programmatic)
    const merged_lorebooks = merge_lorebook_entries(scene_memories);

    // 3. Return combined memory structure
    return {
        recap: combined_timeline,
        lorebooks: merged_lorebooks
    };
}
```

---

## Backward Compatibility

Handle old format (string recaps without JSON):

```javascript
function extract_recap_fields(memories) {
    const recaps = [];

    for (const memory of memories) {
        try {
            // Try parsing as JSON
            const parsed = typeof memory === 'string' ? JSON.parse(memory) : memory;

            if (parsed && typeof parsed === 'object') {
                // New format: JSON with recap field
                if (parsed.recap) {
                    recaps.push(parsed.recap);
                }
                // Old format: JSON with other fields (legacy)
                else if (parsed.narrative) {
                    recaps.push(parsed.narrative);  // Old field name
                }
                // Very old format: entire JSON was the recap
                else {
                    recaps.push(JSON.stringify(parsed));
                }
            } else if (typeof parsed === 'string') {
                // Plain string format
                recaps.push(parsed);
            }
        } catch (err) {
            // Not JSON - treat as plain string
            if (typeof memory === 'string') {
                recaps.push(memory);
            } else {
                error('[Extract Recaps] Failed to process memory:', err);
            }
        }
    }

    return recaps;
}
```

---

## Validation Updates

Update validation to handle new structure:

```javascript
// In recapValidation.js

async function validate_combined_recap(recap) {
    // Combined recap should be a plain string now, not JSON

    if (typeof recap !== 'string') {
        debug('[Validation] Combined recap should be plain string, got:', typeof recap);
        return false;
    }

    // Check token count
    const token_count = count_tokens(recap);
    const hard_limit = 1500;

    if (token_count > hard_limit) {
        debug(`[Validation] Combined recap exceeds limit: ${token_count} > ${hard_limit}`);
        return false;
    }

    // Check for redundancy markers
    const redundancy_patterns = [
        /Alice and Bob.*Alice and Bob/,  // Repeated phrases
        /traveled to.*traveled to/i,
        /went to.*went to/i
    ];

    for (const pattern of redundancy_patterns) {
        if (pattern.test(recap)) {
            debug(`[Validation] Combined recap has redundancy: ${pattern}`);
            // Warning, not failure
        }
    }

    return true;
}
```

---

## Settings Integration

Add settings for this behavior:

```javascript
// In defaultSettings.js

export const default_settings = {
    // ... existing settings

    // Combined recap behavior
    "combined_recap_extraction_mode": "recap_only",  // "recap_only" | "full_json"
    "combined_recap_merge_lorebooks": false,  // If true, merge lorebooks programmatically
    "combined_recap_output_format": "string",  // "string" | "json"

    // ... other settings
};
```

---

## Debug Logging

Add logging to track extraction:

```javascript
function extract_recap_fields(memories) {
    debug(`[Extract Recaps] Processing ${memories.length} memories`);

    const recaps = [];
    let extracted_count = 0;
    let failed_count = 0;

    for (const [idx, memory] of memories.entries()) {
        try {
            const parsed = typeof memory === 'string' ? JSON.parse(memory) : memory;

            if (parsed && parsed.recap) {
                recaps.push(parsed.recap);
                extracted_count++;
                debug(`[Extract Recaps] Scene ${idx + 1}: Extracted recap (${count_tokens(parsed.recap)} tokens)`);

                // Log what was excluded
                if (parsed.lorebooks && parsed.lorebooks.length > 0) {
                    debug(`[Extract Recaps] Scene ${idx + 1}: Excluded ${parsed.lorebooks.length} lorebook entries`);
                }
            } else {
                failed_count++;
                debug(`[Extract Recaps] Scene ${idx + 1}: No recap field found`);
            }
        } catch (err) {
            failed_count++;
            error(`[Extract Recaps] Scene ${idx + 1}: Parse error:`, err);
        }
    }

    debug(`[Extract Recaps] Complete: ${extracted_count} extracted, ${failed_count} failed`);

    return recaps;
}
```

---

## Testing

Test the extraction:

```javascript
// Test case 1: New format
const test_memory_1 = {
    recap: "Alice fought bandits.",
    lorebooks: [
        {name: "Alice", type: "character", keywords: ["Alice"], content: "Warrior..."}
    ]
};

const extracted_1 = extract_recap_fields([test_memory_1]);
console.assert(extracted_1[0] === "Alice fought bandits.");
console.assert(extracted_1.length === 1);

// Test case 2: Old format (string)
const test_memory_2 = "Alice fought bandits.";
const extracted_2 = extract_recap_fields([test_memory_2]);
console.assert(extracted_2[0] === "Alice fought bandits.");

// Test case 3: Mixed formats
const mixed = [
    {recap: "Scene 1", lorebooks: []},
    "Scene 2 plain text",
    {recap: "Scene 3", lorebooks: [{name: "X", type: "character", keywords: ["X"], content: "..."}]}
];

const extracted_mixed = extract_recap_fields(mixed);
console.assert(extracted_mixed.length === 3);
console.assert(extracted_mixed[0] === "Scene 1");
console.assert(extracted_mixed[1] === "Scene 2 plain text");
console.assert(extracted_mixed[2] === "Scene 3");
```

---

## Recap

**Implementation Checklist:**

- [ ] Update `combinedRecap.js` to extract only recap fields
- [ ] Implement `extract_recap_fields()` function
- [ ] Implement `format_recaps_for_combining()` function
- [ ] Update validation to expect string output (not JSON)
- [ ] Add backward compatibility for old formats
- [ ] Optional: Implement programmatic lorebook merging
- [ ] Add debug logging for extraction process
- [ ] Update settings to control extraction behavior
- [ ] Test with mixed old/new format memories
- [ ] Update combined recap prompt (already done in defaultPrompts_v2.js)

**Benefits:**
- 90% token reduction when combining
- Cleaner separation of concerns
- Faster combination process
- More focused AI output
- Lorebooks stay as static reference (don't need narrative merging)

---

**End of Implementation Guide**

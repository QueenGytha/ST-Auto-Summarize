/* eslint-disable no-undef, no-unused-vars, no-console, require-await -- Code snippet example file, not production code */
// CODE SNIPPET: Add to combinedRecap.js
// Extracts ONLY recap fields when combining, excludes lorebook entries

function extract_recap_fields(memories) {
    debug(`[Extract Recaps] Processing ${memories.length} memories`);

    const recaps = [];
    let extracted_count = 0;
    let failed_count = 0;
    let excluded_lorebook_count = 0;

    for (const [idx, memory] of memories.entries()) {
        try {
            // Parse if string
            const parsed = typeof memory === 'string' ? JSON.parse(memory) : memory;

            if (parsed && typeof parsed === 'object') {
                // NEW FORMAT: JSON with recap field
                if (parsed.recap) {
                    recaps.push(parsed.recap);
                    extracted_count++;

                    const recap_tokens = count_tokens(parsed.recap);
                    debug(`[Extract Recaps] Scene ${idx + 1}: Extracted recap (${recap_tokens} tokens)`);

                    // Log excluded lorebooks for visibility
                    if (parsed.lorebooks && parsed.lorebooks.length > 0) {
                        excluded_lorebook_count += parsed.lorebooks.length;
                        const lorebook_tokens = count_tokens(JSON.stringify(parsed.lorebooks));
                        debug(`[Extract Recaps] Scene ${idx + 1}: Excluded ${parsed.lorebooks.length} lorebook entries (saved ${lorebook_tokens} tokens)`);
                    }
                }
                // OLD FORMAT: JSON with "narrative" field (legacy compatibility)
                else if (parsed.narrative) {
                    recaps.push(parsed.narrative);
                    extracted_count++;
                    debug(`[Extract Recaps] Scene ${idx + 1}: Extracted legacy 'narrative' field`);
                }
                // VERY OLD FORMAT: Entire JSON object is the recap
                else if (!parsed.recap && !parsed.narrative) {
                    // If it has other fields like npcs_facts, etc, convert to string
                    const stringified = JSON.stringify(parsed);
                    recaps.push(stringified);
                    extracted_count++;
                    debug(`[Extract Recaps] Scene ${idx + 1}: Using entire JSON as recap (very old format)`);
                }
            }
            // Plain string format
            else if (typeof parsed === 'string') {
                recaps.push(parsed);
                extracted_count++;
                debug(`[Extract Recaps] Scene ${idx + 1}: Plain string format`);
            }
            else {
                failed_count++;
                debug(`[Extract Recaps] Scene ${idx + 1}: Unexpected format, type: ${typeof parsed}`);
            }
        } catch (err) {
            // Not JSON - treat as plain string
            if (typeof memory === 'string') {
                recaps.push(memory);
                extracted_count++;
                debug(`[Extract Recaps] Scene ${idx + 1}: Non-JSON string, using as-is`);
            } else {
                failed_count++;
                error(`[Extract Recaps] Scene ${idx + 1}: Parse error:`, err);
            }
        }
    }

    debug(`[Extract Recaps] Complete: ${extracted_count} extracted, ${failed_count} failed, ${excluded_lorebook_count} lorebook entries excluded`);

    return recaps;
}


function format_recaps_for_combining(recaps) {
    if (recaps.length === 0) {
        return '(No recaps to combine)';
    }

    // Format as numbered list for clarity
    return recaps.map((recap, idx) => {
        return `Scene ${idx + 1} recap:\n${recap}`;
    }).join('\n\n');
}


function merge_lorebook_entries(memories) {
    debug('[Merge Lorebooks] Starting programmatic merge');

    const lorebook_map = new Map();
    let total_entries = 0;
    let duplicate_count = 0;

    for (const [idx, memory] of memories.entries()) {
        try {
            const parsed = typeof memory === 'string' ? JSON.parse(memory) : memory;

            if (!parsed.lorebooks || !Array.isArray(parsed.lorebooks)) {
                continue;
            }

            for (const entry of parsed.lorebooks) {
                total_entries++;

                // Validate entry has required fields
                if (!entry.name || !entry.type || !entry.keywords || !entry.content) {
                    debug(`[Merge Lorebooks] Scene ${idx + 1}: Skipping invalid entry (missing fields)`);
                    continue;
                }

                const key = `${entry.name}|${entry.type}`;

                if (lorebook_map.has(key)) {
                    duplicate_count++;

                    // Entry exists - merge
                    const existing = lorebook_map.get(key);

                    // Merge keywords (deduplicate)
                    const merged_keywords = [...new Set([...existing.keywords, ...entry.keywords])];

                    // Most recent content wins (later scenes override earlier)
                    const merged_entry = {
                        name: entry.name,
                        type: entry.type,
                        keywords: merged_keywords,
                        content: entry.content  // Most recent content
                    };

                    lorebook_map.set(key, merged_entry);
                    debug(`[Merge Lorebooks] Scene ${idx + 1}: Updated existing entry "${entry.name}"`);
                } else {
                    // New entry
                    lorebook_map.set(key, entry);
                    debug(`[Merge Lorebooks] Scene ${idx + 1}: Added new entry "${entry.name}" (${entry.type})`);
                }
            }
        } catch (err) {
            error(`[Merge Lorebooks] Scene ${idx + 1}: Failed to process:`, err);
        }
    }

    const merged = Array.from(lorebook_map.values());
    debug(`[Merge Lorebooks] Complete: ${total_entries} total entries, ${duplicate_count} duplicates merged, ${merged.length} unique entries`);

    return merged;
}


async function generate_combined_recap() {
    debug('[Combined Recap] Starting generation');

    // 1. Collect recaps to combine (your existing logic)
    const memories = collect_recaps_to_combine();  // Your existing function

    if (!memories || memories.length === 0) {
        debug('[Combined Recap] No memories to combine');
        return null;
    }

    // 2. Extract ONLY recap fields (NEW - excludes lorebooks)
    const timeline_recaps = extract_recap_fields(memories);

    if (timeline_recaps.length === 0) {
        debug('[Combined Recap] No valid recaps extracted');
        return null;
    }

    // 3. Format for prompt
    const formatted_recaps = format_recaps_for_combining(timeline_recaps);

    // 4. Get existing combined recap (if any)
    const existing_combined = get_settings('combined_recap_data') || '';

    // 5. Build prompt with ONLY recap fields
    const prompt = substitute_params(
        get_settings('combined_recap_prompt'),
        {
            previous_combined_recap: existing_combined,
            message: formatted_recaps,
            history: get_recent_chat_context()  // Optional
        }
    );

    debug(`[Combined Recap] Prompt built with ${timeline_recaps.length} recaps (lorebooks excluded)`);

    // 6. Generate combined recap (AI receives ONLY timelines, not lorebooks)
    const combined_timeline = await generate_with_ai(prompt);

    debug('[Combined Recap] Generation complete');

    // 7. OPTIONAL: Merge lorebook entries programmatically
    const should_merge_lorebooks = get_settings('combined_recap_merge_lorebooks') ?? false;

    let merged_lorebooks = [];
    if (should_merge_lorebooks) {
        merged_lorebooks = merge_lorebook_entries(memories);
        debug(`[Combined Recap] Merged ${merged_lorebooks.length} unique lorebook entries`);
    }

    // 8. Return combined memory structure
    const combined_memory = {
        recap: combined_timeline,
        lorebooks: merged_lorebooks
    };

    // 9. Save
    set_settings('combined_recap_data', combined_memory);

    debug('[Combined Recap] Saved combined memory');

    return combined_memory;
}


// USAGE EXAMPLE:

async function test_recap_extraction() {
    // Example memories (mix of formats)
    const test_memories = [
        // New format with recap + lorebooks
        {
            recap: "Alice and Bob met at tavern. Grim told them about bandits.",
            lorebooks: [
                {name: "Grim", type: "character", keywords: ["Grim", "bartender"], content: "Dwarf bartender..."}
            ]
        },

        // Old format (plain string)
        "They traveled to Eastern Ruins and found temple ransacked.",

        // New format with empty lorebooks
        {
            recap: "Bandits ambushed them. Alice wounded.",
            lorebooks: []
        }
    ];

    // Extract recaps
    const recaps = extract_recap_fields(test_memories);

    console.log('Extracted recaps:', recaps);
    // Result: [
    //   "Alice and Bob met at tavern. Grim told them about bandits.",
    //   "They traveled to Eastern Ruins and found temple ransacked.",
    //   "Bandits ambushed them. Alice wounded."
    // ]

    // Format for combining
    const formatted = format_recaps_for_combining(recaps);
    console.log('Formatted for prompt:\n', formatted);

    // Merge lorebooks (optional)
    const merged_lorebooks = merge_lorebook_entries(test_memories);
    console.log('Merged lorebooks:', merged_lorebooks);
    // Result: [ {name: "Grim", type: "character", ...} ]
    // (Only 1 entry, empty arrays excluded)
}


// INTEGRATION NOTES:

// 1. In combinedRecap.js, find the function that generates combined recaps
//    (likely called generate_combined_recap or similar)

// 2. Add these three functions at the top of the file:
//    - extract_recap_fields()
//    - format_recaps_for_combining()
//    - merge_lorebook_entries() (optional)

// 3. Modify the generation function to use extract_recap_fields()
//    BEFORE building the prompt

// 4. Update the prompt template variable to expect formatted recaps
//    (should use defaultPrompts_v2.js combined recap prompt)

// 5. Update validation to expect string output (not JSON object)

// 6. Test with existing memories to ensure backward compatibility


// VALIDATION UPDATE:

async function validate_combined_recap(recap) {
    // Combined recap should now be a plain string, not JSON

    if (typeof recap !== 'string') {
        debug('[Validation] Combined recap should be plain string, got:', typeof recap);
        return false;
    }

    // Check token count
    const token_count = count_tokens(recap);
    const soft_limit = 1000;
    const hard_limit = 1500;

    if (token_count > hard_limit) {
        debug(`[Validation] Combined recap exceeds hard limit: ${token_count} > ${hard_limit}`);
        return false;
    }

    if (token_count > soft_limit) {
        debug(`[Validation] Combined recap exceeds soft limit: ${token_count} > ${soft_limit} (warning)`);
    }

    // Check for obvious redundancy (repeated phrases)
    const redundancy_patterns = [
        /(.{20,})\1/,  // Repeated 20+ char sequences
        /(Alice and Bob|traveled to|went to|arrived at).{0,30}\1/i  // Common repetitions
    ];

    for (const pattern of redundancy_patterns) {
        if (pattern.test(recap)) {
            debug(`[Validation] Possible redundancy detected: ${pattern}`);
            // Warning only, don't fail validation
        }
    }

    return true;
}


// SETTINGS TO ADD:

// In defaultSettings.js or wherever settings are defined:
const new_settings = {
    // Should combined recap merge lorebook entries programmatically?
    "combined_recap_merge_lorebooks": false,  // Default: don't merge, just keep all

    // Output format for combined recap
    "combined_recap_output_format": "string",  // "string" (new) | "json" (legacy)

    // Token limits for combined recap
    "combined_recap_soft_token_limit": 1000,
    "combined_recap_hard_token_limit": 1500,
};


// BACKWARD COMPATIBILITY:

// The extract_recap_fields() function handles:
// - New format: {recap: "...", lorebooks: [...]}
// - Old format with "narrative": {narrative: "...", entities: [...]}
// - Plain string format: "recap text"
// - Very old JSON format: {npcs_facts: {...}, ...}

// This ensures existing memories continue to work while new ones use the better structure.

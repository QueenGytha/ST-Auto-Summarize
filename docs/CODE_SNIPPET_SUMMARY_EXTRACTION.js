// CODE SNIPPET: Add to combinedSummary.js
// Extracts ONLY summary fields when combining, excludes lorebook entries

/**
 * Extract only the summary (timeline) field from each memory
 * Excludes lorebook entries to reduce token usage when combining
 * @param {Array} memories - Array of memory objects (may be JSON strings or objects)
 * @returns {Array<string>} Array of summary strings
 */
function extract_summary_fields(memories) {
    debug(`[Extract Summaries] Processing ${memories.length} memories`);

    const summaries = [];
    let extracted_count = 0;
    let failed_count = 0;
    let excluded_lorebook_count = 0;

    for (const [idx, memory] of memories.entries()) {
        try {
            // Parse if string
            const parsed = typeof memory === 'string' ? JSON.parse(memory) : memory;

            if (parsed && typeof parsed === 'object') {
                // NEW FORMAT: JSON with summary field
                if (parsed.summary) {
                    summaries.push(parsed.summary);
                    extracted_count++;

                    const summary_tokens = count_tokens(parsed.summary);
                    debug(`[Extract Summaries] Scene ${idx + 1}: Extracted summary (${summary_tokens} tokens)`);

                    // Log excluded lorebooks for visibility
                    if (parsed.lorebooks && parsed.lorebooks.length > 0) {
                        excluded_lorebook_count += parsed.lorebooks.length;
                        const lorebook_tokens = count_tokens(JSON.stringify(parsed.lorebooks));
                        debug(`[Extract Summaries] Scene ${idx + 1}: Excluded ${parsed.lorebooks.length} lorebook entries (saved ${lorebook_tokens} tokens)`);
                    }
                }
                // OLD FORMAT: JSON with "narrative" field (legacy compatibility)
                else if (parsed.narrative) {
                    summaries.push(parsed.narrative);
                    extracted_count++;
                    debug(`[Extract Summaries] Scene ${idx + 1}: Extracted legacy 'narrative' field`);
                }
                // VERY OLD FORMAT: Entire JSON object is the summary
                else if (!parsed.summary && !parsed.narrative) {
                    // If it has other fields like npcs_facts, etc, convert to string
                    const stringified = JSON.stringify(parsed);
                    summaries.push(stringified);
                    extracted_count++;
                    debug(`[Extract Summaries] Scene ${idx + 1}: Using entire JSON as summary (very old format)`);
                }
            }
            // Plain string format
            else if (typeof parsed === 'string') {
                summaries.push(parsed);
                extracted_count++;
                debug(`[Extract Summaries] Scene ${idx + 1}: Plain string format`);
            }
            else {
                failed_count++;
                debug(`[Extract Summaries] Scene ${idx + 1}: Unexpected format, type: ${typeof parsed}`);
            }
        } catch (err) {
            // Not JSON - treat as plain string
            if (typeof memory === 'string') {
                summaries.push(memory);
                extracted_count++;
                debug(`[Extract Summaries] Scene ${idx + 1}: Non-JSON string, using as-is`);
            } else {
                failed_count++;
                error(`[Extract Summaries] Scene ${idx + 1}: Parse error:`, err);
            }
        }
    }

    debug(`[Extract Summaries] Complete: ${extracted_count} extracted, ${failed_count} failed, ${excluded_lorebook_count} lorebook entries excluded`);

    return summaries;
}


/**
 * Format extracted summaries for combining prompt
 * @param {Array<string>} summaries - Array of summary strings
 * @returns {string} Formatted text for prompt
 */
function format_summaries_for_combining(summaries) {
    if (summaries.length === 0) {
        return '(No summaries to combine)';
    }

    // Format as numbered list for clarity
    return summaries.map((summary, idx) => {
        return `Scene ${idx + 1} summary:\n${summary}`;
    }).join('\n\n');
}


/**
 * OPTIONAL: Merge lorebook entries programmatically
 * Deduplicates by name+type, keeps most recent content
 * @param {Array} memories - Array of memory objects
 * @returns {Array} Consolidated lorebook entries
 */
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


/**
 * UPDATED: Generate combined summary using ONLY summary fields
 * This is the main function you'll modify in combinedSummary.js
 */
async function generate_combined_summary() {
    debug('[Combined Summary] Starting generation');

    // 1. Collect summaries to combine (your existing logic)
    const memories = collect_summaries_to_combine();  // Your existing function

    if (!memories || memories.length === 0) {
        debug('[Combined Summary] No memories to combine');
        return null;
    }

    // 2. Extract ONLY summary fields (NEW - excludes lorebooks)
    const timeline_summaries = extract_summary_fields(memories);

    if (timeline_summaries.length === 0) {
        debug('[Combined Summary] No valid summaries extracted');
        return null;
    }

    // 3. Format for prompt
    const formatted_summaries = format_summaries_for_combining(timeline_summaries);

    // 4. Get existing combined summary (if any)
    const existing_combined = get_settings('combined_summary_data') || '';

    // 5. Build prompt with ONLY summary fields
    const prompt = substitute_params(
        get_settings('combined_summary_prompt'),
        {
            previous_combined_summary: existing_combined,
            message: formatted_summaries,
            history: get_recent_chat_context()  // Optional
        }
    );

    debug(`[Combined Summary] Prompt built with ${timeline_summaries.length} summaries (lorebooks excluded)`);

    // 6. Generate combined summary (AI receives ONLY timelines, not lorebooks)
    const combined_timeline = await generate_with_ai(prompt);

    debug('[Combined Summary] Generation complete');

    // 7. OPTIONAL: Merge lorebook entries programmatically
    const should_merge_lorebooks = get_settings('combined_summary_merge_lorebooks') ?? false;

    let merged_lorebooks = [];
    if (should_merge_lorebooks) {
        merged_lorebooks = merge_lorebook_entries(memories);
        debug(`[Combined Summary] Merged ${merged_lorebooks.length} unique lorebook entries`);
    }

    // 8. Return combined memory structure
    const combined_memory = {
        summary: combined_timeline,
        lorebooks: merged_lorebooks
    };

    // 9. Save
    set_settings('combined_summary_data', combined_memory);

    debug('[Combined Summary] Saved combined memory');

    return combined_memory;
}


// USAGE EXAMPLE:

async function test_summary_extraction() {
    // Example memories (mix of formats)
    const test_memories = [
        // New format with summary + lorebooks
        {
            summary: "Alice and Bob met at tavern. Grim told them about bandits.",
            lorebooks: [
                {name: "Grim", type: "character", keywords: ["Grim", "bartender"], content: "Dwarf bartender..."}
            ]
        },

        // Old format (plain string)
        "They traveled to Eastern Ruins and found temple ransacked.",

        // New format with empty lorebooks
        {
            summary: "Bandits ambushed them. Alice wounded.",
            lorebooks: []
        }
    ];

    // Extract summaries
    const summaries = extract_summary_fields(test_memories);

    console.log('Extracted summaries:', summaries);
    // Result: [
    //   "Alice and Bob met at tavern. Grim told them about bandits.",
    //   "They traveled to Eastern Ruins and found temple ransacked.",
    //   "Bandits ambushed them. Alice wounded."
    // ]

    // Format for combining
    const formatted = format_summaries_for_combining(summaries);
    console.log('Formatted for prompt:\n', formatted);

    // Merge lorebooks (optional)
    const merged_lorebooks = merge_lorebook_entries(test_memories);
    console.log('Merged lorebooks:', merged_lorebooks);
    // Result: [ {name: "Grim", type: "character", ...} ]
    // (Only 1 entry, empty arrays excluded)
}


// INTEGRATION NOTES:

// 1. In combinedSummary.js, find the function that generates combined summaries
//    (likely called generate_combined_summary or similar)

// 2. Add these three functions at the top of the file:
//    - extract_summary_fields()
//    - format_summaries_for_combining()
//    - merge_lorebook_entries() (optional)

// 3. Modify the generation function to use extract_summary_fields()
//    BEFORE building the prompt

// 4. Update the prompt template variable to expect formatted summaries
//    (should use defaultPrompts_v2.js combined summary prompt)

// 5. Update validation to expect string output (not JSON object)

// 6. Test with existing memories to ensure backward compatibility


// VALIDATION UPDATE:

async function validate_combined_summary(summary) {
    // Combined summary should now be a plain string, not JSON

    if (typeof summary !== 'string') {
        debug('[Validation] Combined summary should be plain string, got:', typeof summary);
        return false;
    }

    // Check token count
    const token_count = count_tokens(summary);
    const soft_limit = 1000;
    const hard_limit = 1500;

    if (token_count > hard_limit) {
        debug(`[Validation] Combined summary exceeds hard limit: ${token_count} > ${hard_limit}`);
        return false;
    }

    if (token_count > soft_limit) {
        debug(`[Validation] Combined summary exceeds soft limit: ${token_count} > ${soft_limit} (warning)`);
    }

    // Check for obvious redundancy (repeated phrases)
    const redundancy_patterns = [
        /(.{20,})\1/,  // Repeated 20+ char sequences
        /(Alice and Bob|traveled to|went to|arrived at).{0,30}\1/i  // Common repetitions
    ];

    for (const pattern of redundancy_patterns) {
        if (pattern.test(summary)) {
            debug(`[Validation] Possible redundancy detected: ${pattern}`);
            // Warning only, don't fail validation
        }
    }

    return true;
}


// SETTINGS TO ADD:

// In defaultSettings.js or wherever settings are defined:
const new_settings = {
    // Should combined summary merge lorebook entries programmatically?
    "combined_summary_merge_lorebooks": false,  // Default: don't merge, just keep all

    // Output format for combined summary
    "combined_summary_output_format": "string",  // "string" (new) | "json" (legacy)

    // Token limits for combined summary
    "combined_summary_soft_token_limit": 1000,
    "combined_summary_hard_token_limit": 1500,
};


// BACKWARD COMPATIBILITY:

// The extract_summary_fields() function handles:
// - New format: {summary: "...", lorebooks: [...]}
// - Old format with "narrative": {narrative: "...", entities: [...]}
// - Plain string format: "summary text"
// - Very old JSON format: {npcs_facts: {...}, ...}

// This ensures existing memories continue to work while new ones use the better structure.

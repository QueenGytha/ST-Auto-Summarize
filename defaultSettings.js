// @flow
import {
    scene_summary_prompt,
    scene_summary_error_detection_prompt,
    auto_scene_break_detection_prompt,
    running_scene_summary_prompt,
    default_running_scene_template,
    auto_lorebook_entry_lookup_prompt,
    auto_lorebook_entry_deduplicate_prompt,
} from './defaultPrompts.js';

export const default_settings = {
    // --- Error Detection Settings ---
    error_detection_enabled: false,

    // --- Scene Summarization Settings ---
    scene_summary_prompt,
    scene_summary_error_detection_prompt,
    scene_summary_connection_profile: "",
    debug_mode: true,
    default_chat_enabled: true,
    use_global_toggle_state: false,

    // --- Message Filtering Settings (used by scene summaries) ---
    include_user_messages: true, // Include user messages in scene summaries
    include_system_messages: true, // Include hidden messages in scene summaries
    include_narrator_messages: true, // Include system/narrator messages in scene summaries
    message_length_threshold: 0, // Minimum message length to include in scene summaries
    // --- Scene Summary Settings ---
    scene_summary_prefill: "",
    scene_summary_context_limit: 10,
    scene_summary_context_type: 'percent',
    scene_summary_completion_preset: "",
    scene_summary_message_types: "both", // "user", "character", "both" - which message types to include
    scene_summary_auto_name: true, // Auto-generate scene name when auto-generating scene summary (if not already set)
    scene_summary_auto_name_manual: true, // Auto-generate scene name when manually generating scene summary (if not already set)
    scene_summary_navigator_width: 240, // Width of scene navigator bar in pixels (default: 240px, double the original 48px)
    scene_summary_navigator_font_size: 12, // Font size for scene navigator links in pixels (default: 12px)
    scene_summary_default_collapsed: true, // New scene summaries start collapsed by default (only showing scene name)

    // --- Scene Summary Validation Settings ---
    scene_summary_error_detection_enabled: false,
    scene_summary_error_detection_preset: "",
    scene_summary_history_count: 1,
    scene_summary_error_detection_prefill: "",
    scene_summary_error_detection_retries: 3,
    auto_hide_scene_count: 3, // Hide messages older than last 3 scenes

    // --- Auto Scene Break Detection Settings ---
    auto_scene_break_enabled: true,
    auto_scene_break_on_load: false,
    auto_scene_break_on_new_message: true,
    auto_scene_break_message_offset: 1,
    auto_scene_break_check_which_messages: "both", // "user", "character", "both"
    auto_scene_break_recent_message_count: 3,
    auto_scene_break_prompt: auto_scene_break_detection_prompt,
    auto_scene_break_prefill: "",
    auto_scene_break_connection_profile: "",
    auto_scene_break_completion_preset: "",
    auto_scene_break_generate_summary: true, // Auto-generate scene summary when scene break is detected

    // --- Running Scene Summary Settings ---
    running_scene_summary_enabled: true, // Legacy flag (running summary is always enabled)
    running_scene_summary_exclude_latest: 1, // Number of latest scenes to exclude (allows manual validation before combining)
    running_scene_summary_prompt: running_scene_summary_prompt,
    running_scene_summary_template: default_running_scene_template,
    running_scene_summary_prefill: "",
    running_scene_summary_position: 2, // Before main prompt (system prompt)
    running_scene_summary_depth: 2,
    running_scene_summary_role: 0, // System
    running_scene_summary_scan: false,
    running_scene_summary_context_limit: 40, // High limit - running summary becomes bulk of context as roleplay progresses
    running_scene_summary_context_type: 'percent',
    running_scene_summary_completion_preset: "",
    running_scene_summary_connection_profile: "",
    running_scene_summary_auto_generate: true, // Auto-generate when new scene summary is created
    running_scene_summary_show_navbar: true, // Show version controls in navbar

    // --- Auto-Lorebooks Settings ---
    auto_lorebooks_enabled_by_default: true, // Enable auto-lorebooks for new chats
    auto_lorebooks_name_template: 'z-AutoLB-{{chat}}', // Naming template for auto-created lorebooks
    auto_lorebooks_delete_on_chat_delete: true, // Delete lorebook when chat is deleted
    autoReorderAlphabetically: true, // Automatically reorder lorebook entries alphabetically when created or renamed

    // --- Auto-Lorebooks Summary Processing Settings ---
    auto_lorebooks_summary_skip_duplicates: true, // Skip entities that already exist in lorebook
    auto_lorebooks_summary_merge_prompt: `You are updating a lorebook entry. You have the existing entry content and new information from a summary.

Current Entry Name: {{entry_name}}

Your task:
1. Compare the existing content with the new information.
2. Merge them carefully while keeping strict PList formatting:
   - Keep ONE bracketed entry that starts with the canonical entity name.
   - Add new details that are not already present.
   - Update existing details that have changed.
   - Remove information that is contradicted or no longer valid.
   - Preserve important existing properties that remain true.
   - Keep properties grouped logically; use parentheses for sub-details, max two nesting levels.
   - Do NOT spin off separate trait entries; every fact stays under this entity.
3. CRITICAL: Check if the entry name needs updating:
   - If the current name is a VAGUE/RELATIONAL reference (examples: "amelia's sister", "the bartender", "mysterious woman", "the shopkeeper", "victoria's friend")
   - AND either the existing content OR new content reveals an ACTUAL PROPER NAME
   - YOU MUST use FORMAT 2 with the proper name as canonicalName
4. If the new information adds nothing, return the original content EXACTLY (FORMAT 1). Do not rewrite or reorder it.

Existing Entry Content:
{{existing_content}}

New Information from Summary:
{{new_content}}

OUTPUT INSTRUCTIONS:

FORMAT 1 (Plain text - use ONLY when NO proper name is available or no change is needed):
Just output the merged content as plain text. It must remain valid PList.

FORMAT 2 (JSON - use when renaming is needed):
{
  "mergedContent": "the merged lorebook entry content here",
  "canonicalName": "ProperName"
}

WHEN TO USE FORMAT 2:
- Current name is relational/vague (possessive forms, job titles, family relations, descriptions)
- You have access to a proper name (first name, full name, character name)
- Example: Current="character-Amelia's Sister" + Content has "Victoria" -> canonicalName: "Victoria Thornbrook"

RULES FOR canonicalName:
- Use the full proper name if available (e.g., "Victoria Thornbrook")
- NO type prefixes (use "Victoria Thornbrook" not "character-Victoria Thornbrook")
- If only first name known, use just that (e.g., "Victoria")
- Always ensure mergedContent remains valid PList for this single entity.

If the current name is ALREADY a proper name (like "Victoria", "John Smith"), use FORMAT 1.`,
    auto_lorebooks_summary_merge_prefill: '', // Prefill for summary merge prompts
    auto_lorebooks_summary_merge_connection_profile: '', // Connection profile for summary merging
    auto_lorebooks_summary_merge_completion_preset: '', // Completion preset for summary merging
    auto_lorebooks_summary_lorebook_entry_lookup_prompt: auto_lorebook_entry_lookup_prompt,
    auto_lorebooks_summary_lorebook_entry_lookup_prefill: '',
    auto_lorebooks_summary_lorebook_entry_lookup_connection_profile: '',
    auto_lorebooks_summary_lorebook_entry_lookup_completion_preset: '',
    auto_lorebooks_summary_lorebook_entry_deduplicate_prompt: auto_lorebook_entry_deduplicate_prompt,
    auto_lorebooks_summary_lorebook_entry_deduplicate_prefill: '',
    auto_lorebooks_summary_lorebook_entry_deduplicate_connection_profile: '',
    auto_lorebooks_summary_lorebook_entry_deduplicate_completion_preset: '',

    // (Removed) Auto-Lorebooks Keyword Generation Settings – keywords now come from summary JSON

    // --- First-Hop Proxy Integration Settings ---
    first_hop_proxy_send_chat_details: false, // Send chat details in LLM requests for proxy logging
};


import {
  scene_summary_prompt,
  scene_summary_error_detection_prompt,
  auto_scene_break_detection_prompt,
  running_scene_summary_prompt,
  default_running_scene_template,
  auto_lorebook_entry_lookup_prompt,
  auto_lorebook_entry_deduplicate_prompt } from
'./defaultPrompts.js';

// Standard prefill for all JSON extraction operations
const JSON_EXTRACTION_PREFILL = "Understood, I'll complete the requested task while follow all instructions and reminders closely. I've read the prompts and understand what i'm working with and what I need to do, got it. I understand I am examining the roleplay and providing metadata about it, and will NEVER try and continue it myself. Since it's already been written and the content has been pre-approved, there are no concerns with this. I will output valid JSON only. Here I go:\n{";

export const default_settings = {
  // --- Error Detection Settings ---
  error_detection_enabled: false,

  // --- Operation Queue Settings ---
  // Maximum number of retries for failed operations before permanently failing.
  // DEFAULT: 0 (unlimited retries)
  //
  // IMPORTANT: Unlimited retries are INTENTIONAL. Operations will retry indefinitely
  // with exponential backoff until they succeed or are manually removed.
  //
  // WHY UNLIMITED: LLM API errors are often transient (rate limits, temporary outages).
  // Most operations will eventually succeed if given enough time.
  //
  // HOW TO STOP: If you want to give up on a retrying operation, manually remove it
  // from the operations queue UI. The retry loop will detect removal and abort.
  //
  // Set to a positive number (e.g., 10) if you want automatic retry limits.
  max_retries: 0,

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
  scene_summary_prefill: JSON_EXTRACTION_PREFILL,
  scene_summary_context_limit: 10,
  scene_summary_context_type: 'percent',
  scene_summary_completion_preset: "",
  scene_summary_include_preset_prompts: false, // Include completion preset prompts (main, jailbreak, etc.) before extension prompt
  scene_summary_message_types: "both", // "user", "character", "both" - which message types to include
  scene_summary_auto_name: true, // Auto-generate scene name when auto-generating scene summary (if not already set)
  scene_summary_auto_name_manual: true, // Auto-generate scene name when manually generating scene summary (if not already set)
  scene_summary_navigator_width: 240, // Width of scene navigator bar in pixels (default: 240px, double the original 48px)
  scene_summary_navigator_font_size: 12, // Font size for scene navigator links in pixels (default: 12px)
  scene_summary_default_collapsed: true, // New scene summaries start collapsed by default (only showing scene name)

  // --- Scene Summary Validation Settings ---
  scene_summary_error_detection_enabled: false,
  scene_summary_error_detection_preset: "",
  scene_summary_error_detection_include_preset_prompts: false, // Include completion preset prompts for validation operations
  scene_summary_history_count: 1,
  scene_summary_error_detection_prefill: JSON_EXTRACTION_PREFILL,
  scene_summary_error_detection_retries: 3,
  auto_hide_scene_count: 3, // Hide messages older than last 3 scenes

  // --- Auto Scene Break Detection Settings --- (always available; governed by per-event settings)
  auto_scene_break_on_load: false,
  auto_scene_break_on_new_message: true,
  auto_scene_break_message_offset: 1,
  auto_scene_break_check_which_messages: "both", // "user", "character", "both"
  auto_scene_break_recent_message_count: 3,
  auto_scene_break_prompt: auto_scene_break_detection_prompt,
  auto_scene_break_prefill: JSON_EXTRACTION_PREFILL,
  auto_scene_break_connection_profile: "",
  auto_scene_break_completion_preset: "",
  auto_scene_break_include_preset_prompts: false, // Include completion preset prompts (main, jailbreak, etc.) before extension prompt
  auto_scene_break_generate_summary: true, // Auto-generate scene summary when scene break is detected

  // --- Running Scene Summary Settings ---
  running_scene_summary_enabled: true, // Legacy flag (running summary is always enabled)
  running_scene_summary_exclude_latest: 1, // Number of latest scenes to exclude (allows manual validation before combining)
  running_scene_summary_prompt: running_scene_summary_prompt,
  running_scene_summary_template: default_running_scene_template,
  running_scene_summary_prefill: JSON_EXTRACTION_PREFILL,
  running_scene_summary_position: 2, // Before main prompt (system prompt)
  running_scene_summary_depth: 2,
  running_scene_summary_role: 0, // System
  running_scene_summary_scan: false,
  running_scene_summary_context_limit: 40, // High limit - running summary becomes bulk of context as roleplay progresses
  running_scene_summary_context_type: 'percent',
  running_scene_summary_completion_preset: "",
  running_scene_summary_connection_profile: "",
  running_scene_summary_include_preset_prompts: false, // Include completion preset prompts for running summary generation
  running_scene_summary_auto_generate: true, // Auto-generate when new scene summary is created
  running_scene_summary_show_navbar: true, // Show version controls in navbar

  // --- Auto-Lorebooks Settings ---
  auto_lorebooks_enabled_by_default: true, // Enable auto-lorebooks for new chats
  auto_lorebooks_name_template: 'z-AutoLB-{{chat}}', // Naming template for auto-created lorebooks
  auto_lorebooks_delete_on_chat_delete: true, // Delete lorebook when chat is deleted
  autoReorderAlphabetically: true, // Automatically reorder lorebook entries alphabetically when created or renamed

  // --- Auto-Lorebooks Summary Processing Settings ---
  auto_lorebooks_summary_skip_duplicates: true, // Skip entities that already exist in lorebook
  auto_lorebooks_summary_merge_prompt: `You are updating a lorebook entry. You have the existing entry content and new information from a recap.

Current Entry Name: {{entry_name}}

⚠️ CRITICAL: ONLY THE CONTENT IS INJECTED INTO THE AI'S CONTEXT ⚠️
The AI will NEVER see the entry title, type, or keywords — it ONLY sees the content text during roleplay.
Therefore, merged content MUST be self-contained and use specific names and references.
Do NOT use pronouns or vague references ("him", "her", "it", "the protagonist"). Use specific names ("Alice", "{{user}}", "Sunblade sword", "Shadow Guild", "Marcus").

Target format (bullet style; no PList):
- Identity: <Type> — <Canonical Name>
- Synopsis: <1 line identity/purpose>
- Attributes: <appearance/traits/capabilities>
- Relationships: <X ↔ Y — dynamic snapshot (tone, patterns, salient past interactions); brief evidence or short quote if helpful>
- State: <status/location/owner/ongoing effects>
- Secrets/Leverage: <what/who knows>
- Tension/Triggers: <what escalates/defuses>
- Style Notes: <voice/tone anchors>

Your task:
1. Compare the existing content with the new information.
2. Merge them carefully while keeping the bullet structure above:
   - Add new details that are not already present.
   - Update details that have changed.
   - Remove information that is contradicted or no longer valid.
   - Preserve important existing bullets that remain true.
   - Keep bullets concise; one fact per bullet.
3. Name resolution:
   - If the current name is relational/vague (e.g., "amelia's sister", "the bartender", "mysterious woman"), and a proper name is available in either content, set canonicalName to that proper name.
   - Ensure the Identity bullet uses the canonical name after merging.
4. If no new information is added, return the original content EXACTLY. Do not rewrite or reorder it.

Existing Entry Content:
{{existing_content}}

New Information from Recap:
{{new_content}}

OUTPUT INSTRUCTIONS:

⚠️ You MUST output valid JSON in the following format ⚠️

{
  "mergedContent": "the merged lorebook entry in bullet-point format",
  "canonicalName": "ProperName or null"
}

Rules for canonicalName:
- Use the full proper name if available (e.g., "Victoria Thornbrook").
- No type prefixes.
- If only a first name is known, use just that (e.g., "Victoria").
- If the current name is already a proper name, set canonicalName to null.`,
  auto_lorebooks_summary_merge_prefill: JSON_EXTRACTION_PREFILL, // Prefill for summary merge prompts
  auto_lorebooks_summary_merge_connection_profile: '', // Connection profile for summary merging
  auto_lorebooks_summary_merge_completion_preset: '', // Completion preset for summary merging
  auto_lorebooks_summary_merge_include_preset_prompts: false, // Include completion preset prompts for lorebook merge operations
  auto_lorebooks_summary_lorebook_entry_lookup_prompt: auto_lorebook_entry_lookup_prompt,
  auto_lorebooks_summary_lorebook_entry_lookup_prefill: JSON_EXTRACTION_PREFILL,
  auto_lorebooks_summary_lorebook_entry_lookup_connection_profile: '',
  auto_lorebooks_summary_lorebook_entry_lookup_completion_preset: '',
  auto_lorebooks_summary_lorebook_entry_lookup_include_preset_prompts: false, // Include completion preset prompts for lorebook lookup operations
  auto_lorebooks_summary_lorebook_entry_deduplicate_prompt: auto_lorebook_entry_deduplicate_prompt,
  auto_lorebooks_summary_lorebook_entry_deduplicate_prefill: JSON_EXTRACTION_PREFILL,
  auto_lorebooks_summary_lorebook_entry_deduplicate_connection_profile: '',
  auto_lorebooks_summary_lorebook_entry_deduplicate_completion_preset: '',
  auto_lorebooks_summary_lorebook_entry_deduplicate_include_preset_prompts: false, // Include completion preset prompts for lorebook deduplicate operations

  // (Removed) Auto-Lorebooks Keyword Generation Settings – keywords now come from summary JSON

  // --- Lorebook Viewer Settings ---
  lorebook_viewer_show_content: false, // Show entry content in modal
  lorebook_viewer_group_by_world: true, // Group entries by lorebook/world
  lorebook_viewer_show_depth: true, // Show depth and order information

  // --- First-Hop Proxy Integration Settings ---
  first_hop_proxy_send_chat_details: false, // Send chat details in LLM requests for proxy logging
  wrap_lorebook_entries: false // Wrap each lorebook entry individually with XML tags for downstream parsing
};

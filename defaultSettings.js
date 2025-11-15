
import {
  scene_recap_prompt,
  scene_recap_error_detection_prompt,
  auto_scene_break_detection_prompt,
  auto_scene_break_forced_prompt,
  running_scene_recap_prompt,
  default_running_scene_template,
  auto_lorebook_entry_lookup_prompt,
  auto_lorebook_entry_deduplicate_prompt,
  auto_lorebook_bulk_populate_prompt } from
'./defaultPrompts.js';

// Standard prefill for all JSON extraction operations
// Optimized for token efficiency while ensuring JSON-only output
const JSON_EXTRACTION_PREFILL = "Understood. I will output ONLY valid JSON with no additional text:\n{";

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

  // --- Scene Recapping Settings ---
  scene_recap_prompt,
  scene_recap_error_detection_prompt,
  scene_recap_connection_profile: "",
  debug_mode: true,
  default_chat_enabled: true,
  use_global_toggle_state: false,

  // --- Message Filtering Settings (used by scene recaps) ---
  include_user_messages: true, // Include user messages in scene recaps
  include_system_messages: true, // Include hidden messages in scene recaps
  include_narrator_messages: true, // Include system/narrator messages in scene recaps
  message_length_threshold: 0, // Minimum message length to include in scene recaps
  // --- Scene Recap Settings ---
  scene_recap_prefill: JSON_EXTRACTION_PREFILL,
  scene_recap_completion_preset: "",
  scene_recap_include_preset_prompts: false, // Include completion preset prompts (main, jailbreak, etc.) before extension prompt
  scene_recap_include_active_setting_lore: true, // Include active setting_lore entries in scene recap prompt
  scene_recap_message_types: "both", // "user", "character", "both" - which message types to include
  scene_recap_navigator_width: 240, // Width of scene navigator bar in pixels (default: 240px, double the original 48px)
  scene_recap_navigator_font_size: 12, // Font size for scene navigator links in pixels (default: 12px)
  scene_recap_default_collapsed: true, // New scene recaps start collapsed by default (only showing scene name)
  scene_name_append_range: true, // Append message range to auto-generated scene names (e.g., "Scene Name 159-254")

  // --- Scene Recap Validation Settings ---
  scene_recap_error_detection_enabled: false,
  scene_recap_error_detection_preset: "",
  scene_recap_error_detection_include_preset_prompts: false, // Include completion preset prompts for validation operations
  scene_recap_history_count: 1,
  scene_recap_error_detection_prefill: JSON_EXTRACTION_PREFILL,
  scene_recap_error_detection_retries: 3,
  auto_hide_scene_count: 2, // Hide messages older than last 2 scenes

  // --- Auto Scene Break Detection Settings --- (always available; governed by per-event settings)
  auto_scene_break_on_load: false,
  auto_scene_break_on_new_message: true,
  auto_scene_break_message_offset: 4,
  auto_scene_break_check_which_messages: "both", // "user", "character", "both"
  auto_scene_break_minimum_scene_length: 3, // Minimum number of filtered messages required before allowing a scene break
  auto_scene_break_prompt: auto_scene_break_detection_prompt,
  auto_scene_break_prefill: JSON_EXTRACTION_PREFILL,
  auto_scene_break_forced_prompt: auto_scene_break_forced_prompt, // Prompt used when context limits force a scene break (forceSelection=true)
  auto_scene_break_forced_prefill: "Understood. I will select a scene break point and output valid JSON:\n{", // Prefill used when context limits force a scene break (forceSelection=true)
  auto_scene_break_connection_profile: "",
  auto_scene_break_completion_preset: "",
  auto_scene_break_include_preset_prompts: false, // Include completion preset prompts (main, jailbreak, etc.) before extension prompt
  auto_scene_break_generate_recap: true, // Auto-generate scene recap when scene break is detected

  // --- Running Scene Recap Settings ---
  running_scene_recap_enabled: true, // Legacy flag (running recap is always enabled)
  running_scene_recap_exclude_latest: 1, // Number of latest scenes to exclude (allows manual validation before combining)
  running_scene_recap_prompt: running_scene_recap_prompt,
  running_scene_recap_template: default_running_scene_template,
  running_scene_recap_prefill: JSON_EXTRACTION_PREFILL,
  running_scene_recap_position: 2, // Before main prompt (system prompt)
  running_scene_recap_depth: 2,
  running_scene_recap_role: 0, // System
  running_scene_recap_scan: false,
  running_scene_recap_completion_preset: "",
  running_scene_recap_connection_profile: "",
  running_scene_recap_include_preset_prompts: false, // Include completion preset prompts for running recap generation
  running_scene_recap_auto_generate: true, // Auto-generate when new scene recap is created
  running_scene_recap_show_navbar: true, // Show version controls in navbar

  // --- Auto-Lorebooks Settings ---
  auto_lorebooks_enabled_by_default: true, // Enable auto-lorebooks for new chats
  auto_lorebooks_name_template: 'z-AutoLB-{{chat}}', // Naming template for auto-created lorebooks
  auto_lorebooks_delete_on_chat_delete: true, // Delete lorebook when chat is deleted
  autoReorderAlphabetically: true, // Automatically reorder lorebook entries alphabetically when created or renamed

  // --- Auto-Lorebooks Recap Processing Settings ---
  auto_lorebooks_recap_skip_duplicates: true, // Skip entities that already exist in lorebook
  auto_lorebooks_recap_merge_prompt: `You are updating a lorebook entry. You have the existing entry content and new information from a recap.

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

Location naming (subareas):
- If this entry is a sub‑location within a named parent (e.g., Cloudsdale → Rainbow Dash's Cloud House; Ponyville → Twilight's Library),
  the canonical name SHOULD be "Parent-Subarea" and the Identity bullet MUST read "Location — Parent-Subarea".
- For multiple levels (e.g., Ponyville → Twilight's Library → Spike's Room), chain with hyphens: "Parent-Child-Grandchild" and reflect the full chain in Identity.
- Include a parent link bullet for the immediate parent (e.g., "Located in: <Parent>") and optionally a top‑level link (e.g., "Part of: <TopLevel>"). Ensure keywords include both parent and subarea tokens (and top‑level when present in chat).

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
  auto_lorebooks_recap_merge_prefill: JSON_EXTRACTION_PREFILL, // Prefill for recap merge prompts
  auto_lorebooks_recap_merge_connection_profile: '', // Connection profile for recap merging
  auto_lorebooks_recap_merge_completion_preset: '', // Completion preset for recap merging
  auto_lorebooks_recap_merge_include_preset_prompts: false, // Include completion preset prompts for lorebook merge operations
  auto_lorebooks_recap_lorebook_entry_lookup_prompt: auto_lorebook_entry_lookup_prompt,
  auto_lorebooks_recap_lorebook_entry_lookup_prefill: JSON_EXTRACTION_PREFILL,
  auto_lorebooks_recap_lorebook_entry_lookup_connection_profile: '',
  auto_lorebooks_recap_lorebook_entry_lookup_completion_preset: '',
  auto_lorebooks_recap_lorebook_entry_lookup_include_preset_prompts: false, // Include completion preset prompts for lorebook lookup operations
  auto_lorebooks_recap_lorebook_entry_deduplicate_prompt: auto_lorebook_entry_deduplicate_prompt,
  auto_lorebooks_recap_lorebook_entry_deduplicate_prefill: JSON_EXTRACTION_PREFILL,
  auto_lorebooks_recap_lorebook_entry_deduplicate_connection_profile: '',
  auto_lorebooks_recap_lorebook_entry_deduplicate_completion_preset: '',
  auto_lorebooks_recap_lorebook_entry_deduplicate_include_preset_prompts: false, // Include completion preset prompts for lorebook deduplicate operations
  auto_lorebooks_bulk_populate_prompt: auto_lorebook_bulk_populate_prompt,
  auto_lorebooks_bulk_populate_prefill: JSON_EXTRACTION_PREFILL,
  auto_lorebooks_bulk_populate_connection_profile: '',
  auto_lorebooks_bulk_populate_completion_preset: '',
  auto_lorebooks_bulk_populate_include_preset_prompts: false, // Include completion preset prompts for bulk registry population operations

  // --- Auto-Lorebooks Entry Creation Defaults ---
  auto_lorebooks_entry_exclude_recursion: false, // Default: allow entry to trigger other entries
  auto_lorebooks_entry_prevent_recursion: false, // Default: allow entry in recursion scans
  auto_lorebooks_entry_ignore_budget: true, // Default: don't count against token budget
  auto_lorebooks_entry_sticky: 4, // Default: stay active for 4 message rounds

  // (Removed) Auto-Lorebooks Keyword Generation Settings – keywords now come from recap JSON

  // --- First-Hop Proxy Integration Settings ---
  // (Removed) first_hop_proxy_send_chat_details – now auto-detected based on connection profile proxy URL
  suppress_other_lorebooks: true // Suppress global/character/persona lorebooks during generation (only chat lorebooks included)
};

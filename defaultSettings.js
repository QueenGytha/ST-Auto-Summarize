
import {
  scene_recap_prompt,
  scene_recap_error_detection_prompt,
  auto_scene_break_detection_prompt,
  running_scene_recap_prompt,
  default_running_scene_template,
  auto_lorebook_entry_lookup_prompt,
  auto_lorebook_entry_deduplicate_prompt,
  auto_lorebook_bulk_populate_prompt } from
'./defaultPrompts.js';

// Standard prefill for all JSON extraction operations
// Optimized for token efficiency while ensuring JSON-only output
const JSON_EXTRACTION_PREFILL = "Understood. I will output ONLY valid JSON with no additional text:\n{";

// Auto-Lorebooks Recap Merge Prompt
const auto_lorebook_recap_merge_prompt = `You are updating a lorebook entry. You have the existing entry content and new information from a recap.

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
- If the current name is already a proper name, set canonicalName to null.`;

export const default_settings = {
  // --- Error Detection Settings ---
  error_detection_enabled: false,

  // --- Token Counting Settings ---
  // Correction factor for tokenizer discrepancies between ST and actual LLM providers
  // SillyTavern uses tokenizer approximations that may not match the provider's actual tokenizer
  // This multiplier adjusts token estimates to be more accurate
  //
  // Values > 1.0: Use when ST undercounts (multiply to increase estimate)
  // Values < 1.0: Use when ST overcounts (multiply to decrease estimate)
  // Value = 1.0: No correction (use raw ST tokenizer count)
  //
  // Recommended values based on observed discrepancies:
  // - Claude models: 1.35 (ST typically undercounts by 30-40%)
  // - OpenAI models: 1.0 (tiktoken is accurate, no correction needed)
  // - Other models: Test and adjust based on your observations
  tokenizer_correction_factor: 1.35,

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

  // --- Core Settings (non-operation-specific) ---
  debug_mode: true,
  default_chat_enabled: true,
  use_global_toggle_state: false,

  // --- Scene Recap UI Settings ---
  scene_recap_include_active_setting_lore: true, // Include active setting_lore entries in scene recap prompt
  scene_recap_message_types: "both", // "user", "character", "both" - which message types to include
  scene_recap_navigator_width: 240, // Width of scene navigator bar in pixels (default: 240px, double the original 48px)
  scene_recap_navigator_font_size: 12, // Font size for scene navigator links in pixels (default: 12px)
  scene_recap_default_collapsed: true, // New scene recaps start collapsed by default (only showing scene name)
  scene_name_append_range: true, // Append message range to auto-generated scene names (e.g., "Scene Name 159-254")

  // --- Scene Recap Validation Settings ---
  scene_recap_error_detection_enabled: false,
  scene_recap_history_count: 1,
  scene_recap_error_detection_retries: 3,
  auto_hide_scene_count: 2, // Hide messages older than last 2 scenes

  // --- Auto Scene Break Detection Settings --- (always available; governed by per-event settings)
  auto_scene_break_on_load: false,
  auto_scene_break_on_new_message: true,
  auto_scene_break_message_offset: 4,
  auto_scene_break_check_which_messages: "both", // "user", "character", "both"
  auto_scene_break_minimum_scene_length: 3, // Minimum number of filtered messages required before allowing a scene break
  auto_scene_break_forced_prefill: "Understood. I will select a scene break point and output valid JSON:\n{", // Prefill used when context limits force a scene break (forceSelection=true)
  auto_scene_break_generate_recap: true, // Auto-generate scene recap when scene break is detected

  // --- Running Scene Recap Settings ---
  running_scene_recap_enabled: true, // Legacy flag (running recap is always enabled)
  running_scene_recap_exclude_latest: 1, // Number of latest scenes to exclude (allows manual validation before combining)
  running_scene_recap_template: default_running_scene_template,
  running_scene_recap_position: 2, // Before main prompt (system prompt)
  running_scene_recap_depth: 2,
  running_scene_recap_role: 0, // System
  running_scene_recap_scan: false,
  running_scene_recap_auto_generate: true, // Auto-generate when new scene recap is created
  running_scene_recap_show_navbar: true, // Show version controls in navbar

  // --- Auto-Lorebooks Settings ---
  auto_lorebooks_enabled_by_default: true, // Enable auto-lorebooks for new chats
  auto_lorebooks_name_template: 'z-AutoLB-{{chat}}', // Naming template for auto-created lorebooks
  auto_lorebooks_delete_on_chat_delete: true, // Delete lorebook when chat is deleted
  autoReorderAlphabetically: true, // Automatically reorder lorebook entries alphabetically when created or renamed

  // --- Auto-Lorebooks Recap Processing Settings ---
  auto_lorebooks_recap_skip_duplicates: true, // Skip entities that already exist in lorebook

  // --- Auto-Lorebooks Entry Creation Defaults ---
  auto_lorebooks_entry_exclude_recursion: false, // Default: allow entry to trigger other entries
  auto_lorebooks_entry_prevent_recursion: false, // Default: allow entry in recursion scans
  auto_lorebooks_entry_ignore_budget: true, // Default: don't count against token budget
  auto_lorebooks_entry_sticky: 4, // Default: stay active for 4 message rounds

  // (Removed) Auto-Lorebooks Keyword Generation Settings – keywords now come from recap JSON

  // --- First-Hop Proxy Integration Settings ---
  // (Removed) first_hop_proxy_send_chat_details – now auto-detected based on connection profile proxy URL
  first_hop_proxy_manual_override: false, // Manual override to force metadata injection even when first-hop proxy is not auto-detected
  suppress_other_lorebooks: true, // Suppress global/character/persona lorebooks during generation (only chat lorebooks included)

  // --- Operations Presets System (V3) ---
  operation_artifacts: {
    scene_recap: [
      {
        name: 'Default',
        prompt: scene_recap_prompt,
        prefill: JSON_EXTRACTION_PREFILL,
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    scene_recap_error_detection: [
      {
        name: 'Default',
        prompt: scene_recap_error_detection_prompt,
        prefill: '',
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    auto_scene_break: [
      {
        name: 'Default',
        prompt: auto_scene_break_detection_prompt,
        prefill: JSON_EXTRACTION_PREFILL,
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    running_scene_recap: [
      {
        name: 'Default',
        prompt: running_scene_recap_prompt,
        prefill: JSON_EXTRACTION_PREFILL,
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    auto_lorebooks_recap_merge: [
      {
        name: 'Default',
        prompt: auto_lorebook_recap_merge_prompt,
        prefill: JSON_EXTRACTION_PREFILL,
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    auto_lorebooks_recap_lorebook_entry_lookup: [
      {
        name: 'Default',
        prompt: auto_lorebook_entry_lookup_prompt,
        prefill: JSON_EXTRACTION_PREFILL,
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    auto_lorebooks_recap_lorebook_entry_deduplicate: [
      {
        name: 'Default',
        prompt: auto_lorebook_entry_deduplicate_prompt,
        prefill: JSON_EXTRACTION_PREFILL,
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    auto_lorebooks_bulk_populate: [
      {
        name: 'Default',
        prompt: auto_lorebook_bulk_populate_prompt,
        prefill: JSON_EXTRACTION_PREFILL,
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ]
  },

  operations_presets: {
    'Default': {
      name: 'Default',
      isDefault: true,
      operations: {
        scene_recap: 'Default',
        scene_recap_error_detection: 'Default',
        auto_scene_break: 'Default',
        running_scene_recap: 'Default',
        auto_lorebooks_recap_merge: 'Default',
        auto_lorebooks_recap_lorebook_entry_lookup: 'Default',
        auto_lorebooks_recap_lorebook_entry_deduplicate: 'Default',
        auto_lorebooks_bulk_populate: 'Default'
      },
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      description: 'Default configuration for all operations'
    }
  },

  character_sticky_presets: {},
  chat_sticky_presets: {}
};


import {
  scene_recap_stage1_extraction_prompt,
  scene_recap_stage2_organize_prompt,
  scene_recap_stage4_filter_sl_prompt,
  scene_recap_error_detection_prompt,
  auto_scene_break_detection_prompt,
  auto_scene_break_forced_prompt,
  running_scene_recap_prompt,
  default_running_scene_template,
  auto_lorebook_entry_lookup_prompt,
  auto_lorebook_entry_deduplicate_prompt,
  auto_lorebook_bulk_populate_prompt,
  auto_lorebook_recap_merge_prompt,
  lorebook_entry_compaction_prompt
} from './default-prompts/index.js';

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

  // Delay between queue operations in milliseconds.
  // This is an optional rate-limiting delay to avoid hitting API rate limits.
  // DEFAULT: 0 (no delay - operations retry automatically on rate limits)
  //
  // Adjust based on your model/provider rate limits:
  // - 0 = fastest processing, relies on automatic retry for rate limits
  // - Higher values = slower processing but fewer rate limit retries
  operation_delay_ms: 0,

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
  auto_hide_scene_count: 1, // Hide messages older than last 2 scenes

  // --- Auto Scene Break Detection Settings --- (always available; governed by per-event settings)
  auto_scene_break_on_load: false,
  auto_scene_break_on_new_message: true,
  auto_scene_break_message_offset: 8,
  auto_scene_break_check_which_messages: "both", // "user", "character", "both"
  auto_scene_break_minimum_scene_length: 10, // Minimum number of filtered messages required before allowing a scene break
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
  auto_lorebooks_name_template: 'z-AutoLB-{{char}}-{{chat}}', // Naming template for auto-created lorebooks
  auto_lorebooks_delete_on_chat_delete: true, // Delete lorebook when chat is deleted
  autoReorderAlphabetically: true, // Automatically reorder lorebook entries alphabetically when created or renamed

  // --- Auto-Lorebooks Entry Creation Defaults ---
  auto_lorebooks_entry_exclude_recursion: false, // Default: allow entry to trigger other entries
  auto_lorebooks_entry_prevent_recursion: false, // Default: allow entry in recursion scans
  auto_lorebooks_entry_ignore_budget: true, // Default: don't count against token budget
  auto_lorebooks_entry_sticky: 4, // Default: stay active for 4 message rounds
  auto_lorebooks_compaction_threshold: 1000, // Token threshold for compacting lorebook entries before merge

  // (Removed) Auto-Lorebooks Keyword Generation Settings – keywords now come from recap JSON

  // --- First-Hop Proxy Integration Settings ---
  // (Removed) first_hop_proxy_send_chat_details – now auto-detected based on connection profile proxy URL
  first_hop_proxy_manual_override: false, // Manual override to force metadata injection even when first-hop proxy is not auto-detected
  suppress_other_lorebooks: true, // Suppress global/character/persona lorebooks during generation (only chat lorebooks included)

  // --- Operations Presets System (V3) ---
  /* eslint-disable sonarjs/no-duplicate-string -- Each operation must have explicit standalone prefill (no shared constants) */
  operation_artifacts: {
    scene_recap: [
      {
        name: 'Default',
        prompt: scene_recap_stage1_extraction_prompt,
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
    organize_scene_recap: [
      {
        name: 'Default',
        prompt: scene_recap_stage2_organize_prompt,
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
    parse_scene_recap: [
      {
        name: 'Default',
        prompt: running_scene_recap_prompt,
        prefill: "Understood. Merging new scene into running recap. Output JSON only:\n{",
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
    filter_scene_recap_sl: [
      {
        name: 'Default',
        prompt: scene_recap_stage4_filter_sl_prompt,
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
        forced_prompt: auto_scene_break_forced_prompt,
        forced_prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will select a scene break point and output valid JSON. Here I go:\n{",
        forced_connection_profile: null,
        forced_completion_preset_name: '',
        forced_include_preset_prompts: false,
        connection_profile: null,
        completion_preset_name: '',
        include_preset_prompts: false,
        isDefault: true,
        internalVersion: 2,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    running_scene_recap: [
      {
        name: 'Default',
        prompt: running_scene_recap_prompt,
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
    auto_lorebooks_recap_lorebook_entry_compaction: [
      {
        name: 'Default',
        prompt: lorebook_entry_compaction_prompt,
        prefill: "Understood. The roleplay content is acceptable as we are examining it, not writing it. I will output ONLY valid JSON with no additional text. Here I go:\n{",
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
    entity_types: [
      {
        name: 'Default',
        types: [
          // Special guidance-only entry (always first, cannot be deleted)
          { name: 'recap', constant: null, usage: '(NOT FOR SL ENTRIES) Put in rc field: plot progression, emotional beats, temporary states, dialogue, relationships - anything that belongs in narrative recap NOT as a lorebook entry', isGuidanceOnly: true },
          // Regular lorebook entry types
          { name: 'character', constant: false, usage: 'Named characters appearing in the story' },
          { name: 'location', constant: false, usage: 'Places, settings, and notable locations' },
          { name: 'item', constant: false, usage: 'Important objects and possessions' },
          { name: 'faction', constant: false, usage: 'Groups, organizations, and affiliations' },
          { name: 'lore', constant: false, usage: 'World history, mythology, and background lore' },
          { name: 'rule', constant: true, usage: 'Roleplay rules, constraints, and boundaries' },
          { name: 'event', constant: false, usage: 'Resolved plot events and callbacks - major story milestones that should be remembered' }
        ],
        isDefault: true,
        internalVersion: 2,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ],
    entry_defaults: [
      {
        name: 'Default',
        defaults: {
          exclude_recursion: false,
          prevent_recursion: false,
          ignore_budget: true,
          sticky: 4
        },
        isDefault: true,
        internalVersion: 1,
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        customLabel: null
      }
    ]
  },
  /* eslint-enable sonarjs/no-duplicate-string -- End of operation_artifacts section */

  operations_presets: {
    'Default': {
      name: 'Default',
      isDefault: true,
      operations: {
        scene_recap: 'Default',
        organize_scene_recap: 'Default',
        parse_scene_recap: 'Default',
        filter_scene_recap_sl: 'Default',
        scene_recap_error_detection: 'Default',
        auto_scene_break: 'Default',
        running_scene_recap: 'Default',
        auto_lorebooks_recap_merge: 'Default',
        auto_lorebooks_recap_lorebook_entry_lookup: 'Default',
        auto_lorebooks_recap_lorebook_entry_deduplicate: 'Default',
        auto_lorebooks_bulk_populate: 'Default',
        auto_lorebooks_recap_lorebook_entry_compaction: 'Default',
        entity_types: 'Default',
        entry_defaults: 'Default'
      },
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      description: 'Default configuration for all operations'
    }
  },

  active_operations_preset_global: null,
  character_sticky_presets: {},
  chat_sticky_presets: {}
};

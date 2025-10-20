// @flow
// Testing hooks functionality
import {
    default_prompt,
    default_short_template,
    scene_summary_prompt,
    default_scene_template,
    message_summary_error_detection_prompt,
    scene_summary_error_detection_prompt,
    auto_scene_break_detection_prompt,
    running_scene_summary_prompt,
    default_running_scene_template,
} from './index.js';

export const default_settings = {
    // Error detection settings
    error_detection_enabled: false,
    message_summary_error_detection_enabled: true,

    // summarization settings
    prompt: default_prompt,
    scene_summary_prompt,
    message_summary_error_detection_prompt,
    scene_summary_error_detection_prompt,
    prefill: "",
    show_prefill: false,
    completion_preset: "",
    connection_profile: "",
    auto_summarize: true,
    summarization_delay: 1,
    summarization_time_delay: 0,
    auto_summarize_batch_size: 1,
    auto_summarize_message_limit: 10,
    auto_summarize_on_edit: true,
    auto_summarize_on_swipe: true,
    auto_summarize_progress: true,
    auto_summarize_on_send: false,
    include_world_info: false,
    block_chat: true,
    nest_messages_in_prompt: false,
    include_message_history: 3,
    include_message_history_mode: 'none',
    include_user_messages_in_history: false,
    include_system_messages_in_history: false,
    include_thought_messages_in_history: false,
    summary_injection_separator: "\n* ",
    summary_injection_threshold: 0,
    exclude_messages_after_threshold: false,
    keep_last_user_message: true,
    short_template: default_short_template,
    message_summary_context_limit: 10,
    message_summary_context_type: 'percent',
    debug_mode: true,
    display_memories: false, // Hide per-message summary display (not used with scene-based approach)
    default_chat_enabled: true,
    use_global_toggle_state: false,
};

// $FlowFixMe[prop-missing]
Object.assign(default_settings, {
    // --- Scene Summary Settings ---
    scene_summary_enabled: true,
    scene_summary_prefill: "",
    scene_summary_position: -1, // Do not inject (running summary replaces individual scenes)
    scene_summary_depth: 2,
    scene_summary_role: 0, // System
    scene_summary_scan: false,
    scene_summary_context_limit: 10,
    scene_summary_context_type: 'percent',
    scene_summary_completion_preset: "",
    scene_summary_history_mode: "both",
    scene_summary_message_types: "both", // "user", "character", "both" - which message types to include
    scene_summary_template: default_scene_template,
    scene_summary_auto_name: true, // Auto-generate scene name when auto-generating scene summary (if not already set)
    scene_summary_auto_name_manual: true, // Auto-generate scene name when manually generating scene summary (if not already set)
    scene_summary_navigator_toggle: true, // Show scene navigator bar with scene links and operations
    scene_summary_navigator_width: 96, // Width of scene navigator bar in pixels (default: 96px, double the original 48px)
    scene_summary_navigator_font_size: 12, // Font size for scene navigator links in pixels (default: 12px)
    scene_summary_default_collapsed: true, // New scene summaries start collapsed by default (only showing scene name)

    // --- Scene Summary Validation Settings ---
    scene_summary_error_detection_enabled: false,
    scene_summary_error_detection_preset: "",
    scene_summary_history_count: 1,
    scene_summary_error_detection_prefill: "",
    scene_summary_error_detection_retries: 3,
    auto_hide_message_age: -1,
    auto_hide_scene_count: 3, // Hide messages older than last 3 scenes

    // --- Auto Scene Break Detection Settings ---
    auto_scene_break_enabled: true,
    auto_scene_break_on_load: false,
    auto_scene_break_on_new_message: true,
    auto_scene_break_message_offset: 1,
    auto_scene_break_check_which_messages: "user", // "user", "character", "both"
    auto_scene_break_prompt: auto_scene_break_detection_prompt,
    auto_scene_break_prefill: "",
    auto_scene_break_connection_profile: "",
    auto_scene_break_completion_preset: "",
    auto_scene_break_generate_summary: true, // Auto-generate scene summary when scene break is detected

    // --- Running Scene Summary Settings ---
    running_scene_summary_enabled: true, // Enable running scene summary (default behavior, best practice)
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

    // --- Operation Queue Settings ---
    operation_queue_enabled: true, // Enable persistent operation queue (survives restarts)
    operation_queue_use_lorebook: true, // Store queue in lorebook entry (visible) vs chat_metadata (hidden)
    operation_queue_display_enabled: true, // Show queue UI in navbar
});
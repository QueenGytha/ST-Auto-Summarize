// @flow
// CSS classes (must match the CSS file because I'm too stupid to figure out how to do this properly)
const css_message_div = "auto_summarize_memory_display"
const css_single_message_summary = "auto_summarize_single_message_summary"
const css_exclude_memory = `auto_summarize_exclude_memory`
const summary_div_class = `auto_summarize_memory_text`  // class put on all added summary divs to identify them
const summary_reasoning_class = 'auto_summarize_memory_reasoning'
const css_button_separator = `auto_summarize_memory_button_separator`
const css_edit_textarea = `auto_summarize_memory_edit_textarea`
const settings_div_id = `auto_summarize_memory_settings`  // ID of the main settings div.
const settings_content_class = `auto_summarize_memory_settings_content` // Class for the main settings content div which is transferred to the popup
const group_member_enable_button = `auto_summarize_memory_group_member_enable`
const group_member_enable_button_highlight = `auto_summarize_memory_group_member_enabled`

// THe module name modifies where settings are stored, where information is stored on message objects, macros, etc.
const MODULE_NAME = 'auto_summarize_memory';
const MODULE_NAME_FANCY = 'ST-Auto-Summarize';

// Macros for single message summary injection
const single_message_summary_macro = `single_message_summary`;
const generic_memories_macro = `memories`;

// message button classes
const delete_button_class = `${MODULE_NAME}_delete_button`

// Combined Summary Feature additions at the top
const combined_memory_macro = `combined_memory`;


export {
    css_message_div,
    css_single_message_summary,
    css_exclude_memory,
    summary_div_class,
    summary_reasoning_class,
    css_button_separator,
    css_edit_textarea,
    settings_div_id,
    settings_content_class,
    group_member_enable_button,
    group_member_enable_button_highlight,
    MODULE_NAME,
    MODULE_NAME_FANCY,
    single_message_summary_macro,
    generic_memories_macro,
    delete_button_class,
    combined_memory_macro
};

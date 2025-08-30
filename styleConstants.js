// CSS classes (must match the CSS file because I'm too stupid to figure out how to do this properly)
const css_message_div = "auto_summarize_memory_display"
const css_short_memory = "auto_summarize_short_memory"
const css_long_memory = "auto_summarize_long_memory"
const css_remember_memory = `auto_summarize_old_memory`
const css_exclude_memory = `auto_summarize_exclude_memory`
const css_lagging_memory = `auto_summarize_lagging_memory`
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
const MODULE_NAME_FANCY = 'auto_summarize Memory';
const PROGRESS_BAR_ID = `${MODULE_NAME}_progress_bar`;

// Macros for long-term and short-term memory injection
const long_memory_macro = `long_term_memory`;
const short_memory_macro = `short_term_memory`;
const generic_memories_macro = `memories`;

// message button classes
const remember_button_class = `${MODULE_NAME}_remember_button`
const summarize_button_class = `${MODULE_NAME}_summarize_button`
const edit_button_class = `${MODULE_NAME}_edit_button`
const forget_button_class = `${MODULE_NAME}_forget_button`
const delete_button_class = `${MODULE_NAME}_delete_button`

// Combined Summary Feature additions at the top
const combined_memory_macro = `combined_memory`;


export {
    css_message_div,
    css_short_memory,
    css_long_memory,
    css_remember_memory,
    css_exclude_memory,
    css_lagging_memory,
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
    PROGRESS_BAR_ID,
    long_memory_macro,
    short_memory_macro,
    generic_memories_macro,
    remember_button_class,
    summarize_button_class,
    edit_button_class,
    forget_button_class,
    delete_button_class,
    combined_memory_macro
};
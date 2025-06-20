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
    group_member_enable_button_highlight
};
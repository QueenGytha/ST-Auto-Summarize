
// CSS classes (must match the CSS file because I'm too stupid to figure out how to do this properly)
const css_message_div = "auto_recap_memory_display";
const css_single_message_recap = "auto_recap_single_message_recap";
const css_exclude_memory = `auto_recap_exclude_memory`;
const recap_div_class = `auto_recap_memory_text`; // class put on all added recap divs to identify them
const recap_reasoning_class = 'auto_recap_memory_reasoning';
const css_button_separator = `auto_recap_memory_button_separator`;
const css_edit_textarea = `auto_recap_memory_edit_textarea`;
const settings_div_id = `auto_recap_memory_settings`; // ID of the main settings div.
const settings_content_class = `auto_recap_memory_settings_content`; // Class for the main settings content div which is transferred to the popup
const group_member_enable_button = `auto_recap_memory_group_member_enable`;
const group_member_enable_button_highlight = `auto_recap_memory_group_member_enabled`;

// THe module name modifies where settings are stored, where information is stored on message objects, macros, etc.
const MODULE_NAME = 'auto_recap_memory';
const MODULE_NAME_FANCY = 'ST-Auto-Recap';

// Macros for single message recap injection
const single_message_recap_macro = `single_message_recap`;
const generic_memories_macro = `memories`;

// message button classes
const delete_button_class = `${MODULE_NAME}_delete_button`;

// Combined Recap Feature additions at the top
const combined_memory_macro = `combined_memory`;


export {
  css_message_div,
  css_single_message_recap,
  css_exclude_memory,
  recap_div_class,
  recap_reasoning_class,
  css_button_separator,
  css_edit_textarea,
  settings_div_id,
  settings_content_class,
  group_member_enable_button,
  group_member_enable_button_highlight,
  MODULE_NAME,
  MODULE_NAME_FANCY,
  single_message_recap_macro,
  generic_memories_macro,
  delete_button_class,
  combined_memory_macro };
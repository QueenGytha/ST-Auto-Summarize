// Barrel export for all default prompts
// Each prompt is now in its own file for better organization and maintainability

export { scene_recap_prompt } from './scene-recap.js';
export { scene_recap_error_detection_prompt } from './scene-recap-validation.js';
export { auto_scene_break_detection_prompt } from './auto-scene-break-detection.js';
export { auto_scene_break_forced_prompt } from './auto-scene-break-forced.js';
export { running_scene_recap_prompt } from './running-scene-recap.js';
export { default_running_scene_template } from './running-scene-template.js';
export { auto_lorebook_entry_lookup_prompt } from './lorebook-entry-lookup.js';
export { auto_lorebook_entry_deduplicate_prompt } from './lorebook-entry-deduplicate.js';
export { auto_lorebook_bulk_populate_prompt } from './lorebook-bulk-populate.js';
export { auto_lorebook_recap_merge_prompt } from './lorebook-recap-merge.js';

// operationTypes.js
// Centralized operation type constants for LLM operations

export const OperationType = {
  VALIDATE_RECAP: 'validate_recap',
  DETECT_SCENE_BREAK: 'detect_scene_break',
  DETECT_SCENE_BREAK_BACKWARDS: 'detect_scene_break_backwards',
  GENERATE_SCENE_RECAP: 'generate_scene_recap',
  PARSE_SCENE_RECAP: 'parse_scene_recap',
  GENERATE_RUNNING_RECAP: 'generate_running_recap',
  COMBINE_SCENE_WITH_RUNNING: 'combine_scene_with_running',
  LOREBOOK_ENTRY_LOOKUP: 'lorebook_entry_lookup',
  RESOLVE_LOREBOOK_ENTRY: 'resolve_lorebook_entry',
  CREATE_LOREBOOK_ENTRY: 'create_lorebook_entry',
  MERGE_LOREBOOK_ENTRY: 'merge_lorebook_entry',
  COMPACT_LOREBOOK_ENTRY: 'auto_lorebooks_recap_lorebook_entry_compaction',
  POPULATE_REGISTRIES: 'populate_registries',
  UPDATE_LOREBOOK_REGISTRY: 'update_lorebook_registry',
  UPDATE_LOREBOOK_SNAPSHOT: 'update_lorebook_snapshot',
  CHAT: 'chat'
};

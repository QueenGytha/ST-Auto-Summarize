# Supporting/Internal Features

This directory contains 63 feature(s) in the Supporting/Internal category.

## Features

- [Default Prompts](./default-prompts/overview.md) - Built-in default prompts for all operations.
- [Default Settings](./default-settings/overview.md) - Built-in default settings configuration.
- [Constants Management](./constants-management/overview.md) - Centralized constants for all magic numbers.
- [Style Constants](./style-constants/overview.md) - CSS constants for UI styling.
- [Selector Validation](./selector-validation/overview.md) - Validate all DOM selectors exist in SillyTavern.
- [SillyTavern Selectors](./sillytavern-selectors/overview.md) - Centralized ST DOM selectors.
- [Extension Selectors](./extension-selectors/overview.md) - Centralized extension DOM selectors.
- [Macro Parser Integration](./macro-parser-integration/overview.md) - Use ST's macro system in prompts.
- [Regex Script Integration](./regex-script-integration/overview.md) - Support for regex scripts in prompts.
- [Instruct Mode Integration](./instruct-mode-integration/overview.md) - Format prompts using instruct mode.
- [Preset Manager Integration](./preset-manager-integration/overview.md) - Access to ST's preset manager.
- [Group Chat Integration](./group-chat-integration/overview.md) - Full support for group chats.
- [Character Identification](./character-identification/overview.md) - Get current character/chat identifiers.
- [Message Division Helpers](./message-division-helpers/overview.md) - Helper functions to get message DOM elements.
- [Settings UI Bindings](./settings-ui-bindings/overview.md) - Bind all settings controls to data.
- [Settings Refresh](./settings-refresh/overview.md) - Refresh UI when settings change.
- [Profile UI Management](./profile-ui-management/overview.md) - UI for profile dropdown and buttons.
- [Entity Type Settings UI](./entity-type-settings-ui/overview.md) - UI for managing entity types.
- [Debounce Utilities](./debounce-utilities/overview.md) - Debounced saving of settings and chat.
- [Copy Text Utility](./copy-text-utility/overview.md) - Copy text to clipboard.
- [Trim to End Sentence](./trim-to-end-sentence/overview.md) - Trim incomplete sentences from recap output.
- [Download Utility](./download-utility/overview.md) - Download profiles as JSON files.
- [Parse JSON File](./parse-json-file/overview.md) - Parse uploaded JSON files.
- [Wait Until Condition](./wait-until-condition/overview.md) - Polling utility for async conditions.
- [String Hash Generation](./string-hash-generation/overview.md) - Generate hashes for change detection.
- [Lorebook Name Generation](./lorebook-name-generation/overview.md) - Generate unique lorebook names.
- [Newline Conversion](./newline-conversion/overview.md) - Convert literal/actual newlines.
- [LLM Client](./llm-client/overview.md) - Unified client for making LLM requests.
- [LLM Call Validator](./llm-call-validator/overview.md) - Validate LLM call parameters.
- [Operation Types](./operation-types/overview.md) - Define all operation types for queue.
- [Button Interceptor](./button-interceptor/overview.md) - Intercept send button to block when queue active.
- [Settings Content Class](./settings-content-class/overview.md) - CSS class for settings panel.
- [Prompt Utility Functions](./prompt-utility-functions/overview.md) - Helper functions for prompt construction.
- [Preset Prompt Loader](./preset-prompt-loader/overview.md) - Load prompts from completion presets.
- [Scene Recap Hash Computation](./scene-recap-hash-computation/overview.md) - Compute hashes for scene recaps.
- [Running Recap Storage](./running-recap-storage/overview.md) - Dedicated storage for running recaps.
- [Running Recap Injection](./running-recap-injection/overview.md) - Get running recap for injection.
- [Clear Running Scene Recaps](./clear-running-scene-recaps/overview.md) - Clean up invalid running recaps.
- [Cleanup Invalid Running Recaps](./cleanup-invalid-running-recaps/overview.md) - Remove running recaps for deleted messages.
- [Message Exclusion Checking](./message-exclusion-checking/overview.md) - Check if message should be excluded.
- [Character Enable State](./character-enable-state/overview.md) - Track which characters have recapping enabled.
- [Message Inclusion Flag Updates](./message-inclusion-flag-updates/overview.md) - Update which messages are included in memory.
- [Auto-Hide Messages by Command](./auto-hide-messages-by-command/overview.md) - Hide messages older than X scenes.
- [Clear All Recaps](./clear-all-recaps/overview.md) - Comprehensive cleanup with detailed auditing (6 data types).
- [Extension Reload Testing](./extension-reload-testing/overview.md) - Test marker for extension reload verification.
- [Window API Export](./window-api-export/overview.md) - Export functions to window.AutoRecap for tests.
- [SillyTavern Version Check](./sillytavern-version-check/overview.md) - Verify compatible ST version.
- [Manifest Reading](./manifest-reading/overview.md) - Read version from manifest.json.
- [Menu Button Addition](./menu-button-addition/overview.md) - Add buttons to ST extensions menu.
- [Operation Context Get/Set](./operation-context-get-set/overview.md) - Get and set current operation context for tracking.
- [Enter Key Interceptor](./enter-key-interceptor/overview.md) - Intercept Enter key presses to block during queue operations.
- [Button State Observer](./button-state-observer/overview.md) - Observe button state changes to enforce queue blocking.
- [Queue Indicator Button Management](./queue-indicator-button-management/overview.md) - Create and manage custom queue indicator button.
- [Active Lorebooks Map](./active-lorebooks-map/overview.md) - In-memory map of active lorebook entries per message.
- [Sticky Entries Map](./sticky-entries-map/overview.md) - Track sticky/constant lorebook entries across generations.
- [Generation Type Tracking](./generation-type-tracking/overview.md) - Track current generation type (normal/swipe/continue).
- [Target Message Index Calculation](./target-message-index-calculation/overview.md) - Calculate target message index for lorebook activation.
- [Sticky Counter Decrement](./sticky-counter-decrement/overview.md) - Decrement sticky entry counters after each generation.
- [Still Active Entries Getter](./still-active-entries-getter/overview.md) - Get lorebook entries still active from previous activations.
- [Update Sticky Tracking](./update-sticky-tracking/overview.md) - Update sticky entry tracking with newly activated entries.
- [Get All Lorebook Entries](./get-all-lorebook-entries/overview.md) - Retrieve all entries from lorebooks used by active entries.
- [Persist Lorebooks to Message](./persist-lorebooks-to-message/overview.md) - Persist lorebook data to message.extra for durability.
- [Persist Inactive Lorebooks to Message](./persist-inactive-lorebooks-to-message/overview.md) - Persist inactive lorebook entries to message metadata.

---

[Back to Feature Overview](../overall-overview.md)

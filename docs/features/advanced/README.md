# Advanced Features

This directory contains 26 feature(s) in the Advanced category.

## Features

- [World Info Activation Tracking](./world-info-activation-tracking/overview.md) - Track which lorebook entries are active per message.
- [Sticky Entry Tracking](./sticky-entry-tracking/overview.md) - Maintain sticky/constant entry state across generations.
- [Active/Inactive Entry Snapshots](./active-inactive-entry-snapshots/overview.md) - Store complete snapshot of active and inactive entries per message.
- [generateRaw Interceptor](./generateraw-interceptor/overview.md) - Intercept ALL LLM calls to inject metadata.
- [Metadata Injection](./metadata-injection/overview.md) - Inject chat metadata into LLM requests for proxy logging.
- [Operation Context Tracking](./operation-context-tracking/overview.md) - Track which operation is currently executing.
- [Operation Suffix Management](./operation-suffix-management/overview.md) - Add operation suffix to metadata.
- [First-Hop Proxy Integration](./first-hop-proxy-integration/overview.md) - Send chat details to first-hop proxy.
- [Suppress Other Lorebooks](./suppress-other-lorebooks/overview.md) - Option to suppress non-Auto-Recap lorebooks.
- [Message Filtering](./message-filtering/overview.md) - Filter user/system/narrator messages.
- [Message Length Threshold](./message-length-threshold/overview.md) - Only process messages above minimum token count.
- [Character-Specific Enable/Disable](./character-specific-enable-disable/overview.md) - Toggle recap generation per character in group chats.
- [Group Member Enable Buttons](./group-member-enable-buttons/overview.md) - UI buttons in group chat to toggle character recapping.
- [Chat Enable/Disable Per Chat](./chat-enable-disable-per-chat/overview.md) - Toggle extension on/off per chat.
- [Global Toggle State](./global-toggle-state/overview.md) - Share enable/disable state across all chats.
- [Default Chat Enabled State](./default-chat-enabled-state/overview.md) - Set whether new chats start with memory enabled.
- [Verbose Logging](./verbose-logging/overview.md) - Always-on detailed logging for troubleshooting.
- [Debug Subsystem Logging](./debug-subsystem-logging/overview.md) - Categorized logging by subsystem (CORE, SETTINGS, UI, OPERATIONS, INJECTION, VALIDATION, LOREBOOK, RUNNING, MEMORY, QUEUE, EVENT).
- [Token Counting](./token-counting/overview.md) - Count tokens in messages and recaps.
- [Message Data Persistence](./message-data-persistence/overview.md) - Store/retrieve data on messages via message.extra.
- [Swipe Data Persistence](./swipe-data-persistence/overview.md) - Store recap data per swipe.
- [Chat Metadata Storage](./chat-metadata-storage/overview.md) - Store extension data in chat_metadata.
- [Settings Hash Tracking](./settings-hash-tracking/overview.md) - Detect when settings have changed.
- [Entry Strategy Detection](./entry-strategy-detection/overview.md) - Detect lorebook entry strategy type (constant/vectorized/normal).
- [Active and Inactive Entry Snapshots](./active-and-inactive-entry-snapshots/overview.md) - Store complete snapshot of both active and inactive lorebook entries per message.
- [Sticky Entry Rounds Tracking](./sticky-entry-rounds-tracking/overview.md) - Track sticky entry remaining rounds across multiple generations.

---

[Back to Feature Overview](../overall-overview.md)

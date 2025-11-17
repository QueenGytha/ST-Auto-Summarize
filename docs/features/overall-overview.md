# ST-Auto-Recap: High-Level Feature Overview

Comprehensive but concise listing of all major features. For implementation details, see individual feature documentation or the comprehensive 292-feature detailed inventory below.

---

## Core Recapping Features

- **Per-message recaps** - Generate AI summaries for individual messages
- **Auto-recap** - Automatically recap after sending or before generation
- **Manual recap** - Regenerate recaps via message menu or slash commands
- **Batch processing** - Recap multiple messages at configurable intervals
- **Message history context** - Include previous messages/recaps when generating
- **Regenerate on edit/swipe** - Auto-regenerate when messages change
- **Custom recap prompts** - Full control over LLM prompts with macro support
- **Prefill support** - Start recaps with predefined text
- **Connection profiles** - Use different API for recap generation
- **Completion presets** - Separate presets per recap type

---

## Memory System

### Short-term Memory
- Auto-includes most recent message recaps
- Token/percentage-based context limits
- Configurable injection position/depth/role

### Long-term Memory
- Manual marking via "brain" icon
- Persists beyond short-term limits
- Independent context limits and injection settings

### Combined Recap
- Merges all message recaps into single narrative
- Auto-generates at configurable intervals
- Custom prompts and validation
- Independent injection settings

### Scene Recaps
- Recap entire scenes as single units
- Custom prompts and message filtering
- Auto-generate scene names
- Validation support

### Running Scene Recap (Recommended)
- Combines all scene recaps into cohesive narrative
- Version management and history
- Auto-generation on new scenes
- Navbar controls and per-scene regeneration
- See: [RUNNING_SCENE_RECAP.md](RUNNING_SCENE_RECAP.md)

---

## Scene Management

- **Scene breaks** - Manual scene marking via message menu
- **Auto scene detection** - Automatically detect scene changes
- **Scene navigator bar** - Sidebar for quick scene navigation
- **Scene names** - Auto-generate or manually set scene titles
- **Auto-hide** - Hide messages from old scenes
- **Scene metadata** - Track scene data and versions
- See: [AUTO_SCENE_BREAK_DETECTION.md](AUTO_SCENE_BREAK_DETECTION.md)

---

## Validation System

- **Recap validation** - Second LLM pass for quality checking
- **Type-specific validation** - Separate validation for regular/combined/scene recaps
- **Retry logic** - Configurable max retries on validation failure
- **Custom validation prompts** - Full control over validation criteria
- **Independent presets** - Separate presets for validation passes

---

## Configuration & Profiles

- **Configuration profiles** - Save/load different configurations
- **Per-character profiles** - Auto-load profile for specific characters
- **Per-chat profiles** - Auto-load profile for specific chats
- **Import/export** - Share profiles via JSON
- **Profile management** - Rename, delete, restore defaults
- **Switch notifications** - Notify when profiles auto-switch

---

## Operation Queue

- **Persistent queue** - Survives page reloads (stored in lorebook)
- **Sequential processing** - One operation at a time
- **Priority handling** - Operations execute by priority
- **Queue controls** - Pause/resume/clear operations
- **Progress UI** - Visual progress indicators
- **Chat blocking** - Block sending during operations
- **Queue slash commands** - Control queue via commands
- **Retry logic** - Auto-retry failed operations

---

## Lorebook Integration

- **Auto-create lorebooks** - Create chat-specific lorebooks
- **Entry creation** - Create lorebook entries from recaps
- **Entry merging** - Merge new info with existing entries
- **Duplicate detection** - LLM-powered duplicate checking
- **Entity extraction** - Extract and track entities from recaps
- **Entity types** - Configurable types (Character, Location, Object, Event, Faction, Concept)
- **Registry management** - Type-specific registry entries
- **Entry viewer** - View active/inactive entries per message
- **Lorebook wrapping** - Wrap entries with metadata for parsing
- **World info tracking** - Track which entries activate per message

### Entity Tracking (AI-Editable)
- **GM Notes** - Campaign tracking, plot threads, secrets
- **Character Stats** - Statistics, inventory, status
- **AI-editable syntax** - AI updates via special syntax (e.g., `<-- gm_notes: content -->`)
- **Auto-creation** - Entries created when chat loads
- **Merge prompts** - AI merges updates intelligently
- See: [TRACKING_ENTRIES.md](TRACKING_ENTRIES.md)

---

## UI & Display

- **Message visuals** - Color-coded recaps below messages
  - Green: Short-term memory
  - Blue: Long-term memory
  - Red: Out of context
  - Grey: Excluded
- **Memory editor** - Dedicated UI for viewing/editing all memories
- **Popout settings** - Draggable floating settings panel
- **Scene navigator** - Sidebar with scene navigation
- **Progress bars** - Visual progress during operations
- **Toast notifications** - User-friendly notifications
- **Custom CSS** - Customize colors via CSS variables
- **Injection preview** - Preview what gets injected

---

## Message Integration

- **Message menu buttons** - Scene break, recap, edit, exclude buttons
- **Message filtering** - Filter by type (user/system/narrator) and length
- **Group chat support** - Per-character recap enable/disable
- **Event handling** - React to edit/delete/swipe/hide events
- **Lorebook viewer button** - View entries per message

---

## Proxy Integration

- **First-hop proxy support** - Inject metadata into LLM requests
- **Chat identification** - Include chat name and timestamp
- **Operation tracking** - Label operation types (chat, recap, lorebook, etc.)
- **XML-tagged format** - Structured metadata blocks
- **Suppression option** - Suppress other lorebook injections
- See: [PROXY_INTEGRATION.md](PROXY_INTEGRATION.md)

---

## Advanced Features

- **World info activation logging** - Track active/inactive entries per message
- **Sticky entry tracking** - Handle sticky/constant entries correctly
- **Message data persistence** - Store data in message.extra
- **Chat metadata** - Store extension data in chat_metadata
- **Settings migration** - Backward compatibility for old settings
- **Connection profile UUIDs** - UUID-based profile resolution
- **LLM client** - Unified client for all LLM requests
- **Token counting** - Count tokens in messages and recaps
- **Verbose logging** - Detailed subsystem logging
- **Per-chat enable/disable** - Toggle extension per chat
- **Global toggle state** - Share enable state across chats

---

## Slash Commands

### Memory Commands
- `/toggle_memory [true|false]` - Toggle memory for current chat
- `/get_memory_enabled` - Check if enabled
- `/get_memory <n>` - Get memory for message N
- `/refresh_memory` - Recalculate memory inclusion

### UI Commands
- `/toggle_memory_popout` - Toggle popout settings
- `/toggle_memory_edit_interface` - Toggle memory editor
- `/toggle_memory_injection_preview` - Preview injection

### Queue Commands
- `/queue-status` or `/queue` - Show queue status
- `/queue-pause` - Pause queue
- `/queue-resume` - Resume queue
- `/queue-clear-all` - Clear all operations

### Debug Commands
- `/auto_recap_log_chat` - Log chat to console
- `/auto_recap_log_settings` - Log settings to console
- `/hard_reset` - Reset all settings
- `/log_scene_recap_injection` - Log scene injection details

---

## Prompts Reference

All customizable LLM prompts:
- Regular recap prompts
- Combined recap prompts
- Scene recap prompts
- Running scene recap prompts
- Validation prompts (regular/combined/scene)
- Scene detection prompts
- Entity tracking merge prompts
- Lorebook lookup/merge/dedupe prompts

See: [PROMPTS_GUIDE.md](PROMPTS_GUIDE.md)

---

## Feature Summary

### By Category
- **Core Recapping:** 10 features
- **Memory Types:** 5 systems (short/long/combined/scene/running)
- **Scene Management:** 6 features
- **Validation:** 5 features
- **Profiles:** 6 features
- **Operation Queue:** 8 features
- **Lorebook:** 10+ features
- **UI/Display:** 8 features
- **Proxy Integration:** 5 features
- **Slash Commands:** 15+ commands
- **Advanced:** 10+ features

### Fully Implemented ✓
All features listed above are fully implemented and tested.

### Documented Features
- [AUTO_SCENE_BREAK_DETECTION.md](AUTO_SCENE_BREAK_DETECTION.md)
- [RUNNING_SCENE_RECAP.md](RUNNING_SCENE_RECAP.md)
- [TRACKING_ENTRIES.md](TRACKING_ENTRIES.md)
- [PROMPTS_GUIDE.md](PROMPTS_GUIDE.md)
- [PROXY_INTEGRATION.md](PROXY_INTEGRATION.md)

### Proposed (Not Implemented)
See [docs/proposed-features/](../proposed-features/):
- Checkpoint/branch integration
- Prompt versioning system

---

## Detailed Feature Inventory

For a comprehensive, granular listing of all 292 implementation-level features with categories and descriptions, see the detailed inventory section below.

<details>
<summary><strong>Click to expand: Detailed 292-Feature Inventory</strong></summary>

# ST-Auto-Summarize: Complete Feature Overview

This document provides a **high-level reference** of all features in the ST-Auto-Summarize extension. Each feature is listed with a brief one-sentence description and categorized for easy navigation.

**Total Features: 292**

Use this document as a comprehensive index for understanding the extension's capabilities, planning tests, and verifying implementation coverage.

---

## Table of Contents

- [Recap Generation Features](#recap-generation-features) (13)
- [Memory Injection Features](#memory-injection-features) (6)
- [UI/Visual Features](#uivisual-features) (22)
- [Automation Features](#automation-features) (19)
- [Profile/Configuration Features](#profileconfiguration-features) (9)
- [Settings Migration Features](#settings-migration-features) (2)
- [Scene Management Features](#scene-management-features) (15)
- [Operation Queue Features](#operation-queue-features) (15)
- [Lorebook Integration Features](#lorebook-integration-features) (41)
- [Entity Types Management Features](#entity-types-management-features) (10)
- [LLM Client Features](#llm-client-features) (4)
- [Advanced Features](#advanced-features) (26)
- [Validation Features](#validation-features) (6)
- [Message Integration Features](#message-integration-features) (11)
- [Slash Command Features](#slash-command-features) (14)
- [Event Handling Features](#event-handling-features) (16)
- [Supporting/Internal Features](#supportinginternal-features) (63)

---

## Recap Generation Features

### 1. Scene Recap Generation
**Description:** Generates AI-powered summaries for scene breaks marked by the user.
**Category:** Recap Generation

---

### 2. Scene Recap Versioning
**Description:** Stores multiple versions of scene recaps, allowing users to switch between them.
**Category:** Recap Generation

---

### 3. Scene Recap Validation
**Description:** Optional second LLM pass to validate scene recap format and quality.
**Category:** Recap Generation

---

### 4. Scene Recap Retry Logic
**Description:** Automatically retries recap generation with validation if quality check fails.
**Category:** Recap Generation

---

### 5. Running Scene Recap
**Description:** Combines multiple scene recaps into single cohesive narrative memory (enabled by default).
**Category:** Recap Generation

---

### 6. Running Scene Recap Versioning
**Description:** Maintains version history for running scene recaps with edit capability.
**Category:** Recap Generation

---

### 7. Running Scene Recap Auto-Generation
**Description:** Automatically regenerates when new scene recaps are created.
**Category:** Recap Generation

---

### 8. Running Scene Recap Exclude Latest N
**Description:** Waits N scenes before including in running recap (default: 1).
**Category:** Recap Generation

---

### 9. Custom Recap Prompts
**Description:** Fully customizable prompts for scene and running recaps with macro support.
**Category:** Recap Generation

---

### 10. Recap Prefill
**Description:** Configurable prefill text to guide LLM output format.
**Category:** Recap Generation

---

### 11. Connection Profile Selection
**Description:** Use different API connections for recaps vs main chat.
**Category:** Recap Generation

---

### 12. Completion Preset Selection
**Description:** Use different completion presets for recaps with custom temperature/tokens.
**Category:** Recap Generation

---

### 13. Include Preset Prompts Toggle
**Description:** Control whether preset prompts are included in recap generation.
**Category:** Recap Generation

---

## Memory Injection Features

### 14. Running Scene Recap Injection
**Description:** Injects running scene recap into LLM prompt at configurable position.
**Category:** Memory Injection

---

### 15. Injection Position Control
**Description:** Choose where memory is injected (Before/After Character Defs, Author's Note, etc.).
**Category:** Memory Injection

---

### 16. Injection Depth Control
**Description:** Set how deep in context memory appears.
**Category:** Memory Injection

---

### 17. Injection Role Control
**Description:** Set role for injected memory (System, User, Assistant).
**Category:** Memory Injection

---

### 18. World Info Scanning
**Description:** Make memories available for world info scans.
**Category:** Memory Injection

---

### 19. Injection Preview
**Description:** Preview exactly what text will be injected into prompts.
**Category:** Memory Injection

---

## UI/Visual Features

### 20. Scene Break Visual Markers
**Description:** Visual scene break dividers below messages.
**Category:** UI/Visual

---

### 21. Scene Break Button
**Description:** Message menu button to manually mark scene breaks.
**Category:** UI/Visual

---

### 22. Scene Break Name Input
**Description:** Add custom names to scene breaks (like chapter titles).
**Category:** UI/Visual

---

### 23. Scene Break Recap Display
**Description:** Shows recap text directly below scene break marker.
**Category:** UI/Visual

---

### 24. Scene Break Collapse/Expand
**Description:** Collapsible scene break sections.
**Category:** UI/Visual

---

### 25. Scene Navigator Bar
**Description:** Floating sidebar showing all scenes with navigation.
**Category:** UI/Visual

---

### 26. Navigator Bar Width Customization
**Description:** Adjust navigator width (30-500 pixels).
**Category:** UI/Visual

---

### 27. Navigator Font Size Customization
**Description:** Adjust font size for scene names.
**Category:** UI/Visual

---

### 28. Navigator Bar Toggle
**Description:** Show/hide navigator bar.
**Category:** UI/Visual

---

### 29. Scene Name Auto-Generation
**Description:** Automatically generate brief scene names from recaps.
**Category:** UI/Visual

---

### 30. Running Scene Recap Navbar Controls
**Description:** Floating navbar with version selector, edit, and regenerate buttons.
**Category:** UI/Visual

---

### 31. Popout Settings Window
**Description:** Draggable floating window for extension configuration.
**Category:** UI/Visual

---

### 32. Settings Panel
**Description:** Comprehensive settings UI with all controls.
**Category:** UI/Visual

---

### 33. Memory Editor Interface
**Description:** Dedicated UI for viewing/editing all memories in chat.
**Category:** UI/Visual

---

### 34. Progress Bar UI
**Description:** Visual progress indicators during recap generation.
**Category:** UI/Visual

---

### 35. Queue Status UI
**Description:** Shows current operation queue status and progress.
**Category:** UI/Visual

---

### 36. Lorebook Viewer
**Description:** View active and inactive lorebook entries per message via button.
**Category:** UI/Visual

---

### 37. Lorebook Entry Icons
**Description:** Scene breaks show icon to view associated lorebook entries.
**Category:** UI/Visual

---

### 38. Toast Notifications
**Description:** User-friendly notifications for operations and errors.
**Category:** UI/Visual

---

### 39. Toast Duration Calculation
**Description:** Automatically calculate toast display duration based on content length.
**Category:** UI/Visual

---

### 40. Scene Break Icon Creation
**Description:** Create and display lorebook icons for scene breaks.
**Category:** UI/Visual

---

### 41. Extension Reload Test Marker
**Description:** Test marker UI for verifying extension reload functionality.
**Category:** UI/Visual

---

## Automation Features

### 42. Auto Scene Break Detection
**Description:** Automatically detect scene changes in chat messages.
**Category:** Automation

---

### 43. Auto Scene Break on Load
**Description:** Run detection when chat is loaded.
**Category:** Automation

---

### 44. Auto Scene Break on New Message
**Description:** Run detection when new messages arrive.
**Category:** Automation

---

### 45. Auto Scene Break Generate Recap
**Description:** Automatically generate recap when scene detected.
**Category:** Automation

---

### 46. Scene Detection Prompt Customization
**Description:** Customize prompt used to detect scene breaks.
**Category:** Automation

---

### 47. Scene Detection Message Offset
**Description:** Skip latest N messages when detecting (avoid false positives).
**Category:** Automation

---

### 48. Minimum Scene Length Enforcement
**Description:** Require minimum messages between scenes (default: 3).
**Category:** Automation

---

### 49. Scene Detection Validation
**Description:** Advanced logic to validate time/location/cast transitions.
**Category:** Automation

---

### 50. Rationale Format Validation
**Description:** Prevent false positives from decorative separators.
**Category:** Automation

---

### 51. Auto-Generate Scene Names (Auto-Detection)
**Description:** Generate names when auto-detecting scenes.
**Category:** Automation

---

### 52. Auto-Generate Scene Names (Manual)
**Description:** Generate names when manually creating scenes.
**Category:** Automation

---

### 53. Auto-Hide Messages
**Description:** Automatically hide messages from scenes older than X scenes.
**Category:** Automation

---

### 54. Scene Detection Rationale Format Validation
**Description:** Validate rationale format to prevent false positives from decorative separators.
**Category:** Automation

---

### 55. Scene Detection Objective Shift Detection
**Description:** Detect significant narrative objective shifts indicating scene changes.
**Category:** Automation

---

### 56. Scene Detection Continuity Veto System
**Description:** Advanced veto logic for scene continuity and objective validation.
**Category:** Automation

---

### 57. Clear Checked Flags in Range
**Description:** Clear auto scene break checked flags for specific message range.
**Category:** Automation

---

### 58. Set Checked Flags in Range
**Description:** Set auto scene break checked flags for specific message range.
**Category:** Automation

---

### 59. Clear All Checked Flags
**Description:** Clear all auto scene break checked flags across entire chat.
**Category:** Automation

---

### 60. Manual Scene Break Detection Command
**Description:** Manually trigger scene detection for specific message ranges.
**Category:** Automation

---

## Profile/Configuration Features

### 61. Configuration Profiles
**Description:** Save/load different configuration sets.
**Category:** Profile/Configuration

---

### 62. Profile Save/Rename
**Description:** Manage profile names.
**Category:** Profile/Configuration

---

### 63. Profile New/Delete
**Description:** Create and delete profiles.
**Category:** Profile/Configuration

---

### 64. Profile Restore
**Description:** Reload current profile settings.
**Category:** Profile/Configuration

---

### 65. Profile Import/Export
**Description:** Import/export profiles as JSON files.
**Category:** Profile/Configuration

---

### 66. Character Auto-Load Profile
**Description:** Set profile to auto-load for specific character.
**Category:** Profile/Configuration

---

### 67. Chat Auto-Load Profile
**Description:** Set profile to auto-load for specific chat.
**Category:** Profile/Configuration

---

### 68. Profile Switch Notifications
**Description:** Optional toast when profile changes.
**Category:** Profile/Configuration

---

### 69. Default Settings Restoration
**Description:** Reset all settings to defaults.
**Category:** Profile/Configuration

---

---

## Settings Migration Features

### 70. Connection Profile UUID Migration
**Description:** Automatic migration of connection profile settings from names to UUIDs.
**Category:** Settings Migration

---

### 71. Settings Migration System
**Description:** Backward compatibility handling for legacy settings formats.
**Category:** Settings Migration

---

## Scene Management Features

### 72. Scene Break Markers
**Description:** Persistent scene break data on messages.
**Category:** Scene Management

---

### 73. Scene Break Visibility Toggle
**Description:** Show/hide scene break markers.
**Category:** Scene Management

---

### 74. Scene Break Hash Tracking
**Description:** Detect when recap content changes.
**Category:** Scene Management

---

### 75. Scene Recap Metadata
**Description:** Store metadata about scene recaps.
**Category:** Scene Management

---

### 76. Scene Recap Current Index
**Description:** Track active version of scene recap.
**Category:** Scene Management

---

### 77. Scene Recap Include/Exclude
**Description:** Control which scene recaps are injected.
**Category:** Scene Management

---

### 78. Scene Message Type Filtering
**Description:** Choose user/AI/both messages for scene recaps.
**Category:** Scene Management

---

### 79. Scene Message History Mode
**Description:** Configure which messages included in scene recap context.
**Category:** Scene Management

---

### 80. Scene Message History Count
**Description:** Set how many messages to include.
**Category:** Scene Management

---

### 81. Auto Scene Break Checked Flags
**Description:** Track which messages have been checked for scenes.
**Category:** Scene Management

---

### 82. Scene Break Rescan Capability
**Description:** Force full rescan of all messages for scenes.
**Category:** Scene Management

---

### 83. Scene Navigator Jump-to-Message
**Description:** Click scene in navigator to jump to it in chat.
**Category:** Scene Management

---

### 84. Scene Break Hash Verification
**Description:** Verify scene recap content hasn't changed using hash comparison.
**Category:** Scene Management

---

### 85. Scene Metadata Tracking
**Description:** Store and retrieve comprehensive scene metadata for each scene break.
**Category:** Scene Management

---

### 86. Scene Recap Version Management
**Description:** Manage multiple versions of scene recaps with current version tracking.
**Category:** Scene Management

---

## Operation Queue Features

### 87. Persistent Operation Queue
**Description:** Durable queue stored in lorebook (survives page reload).
**Category:** Operation Queue

---

### 88. Queue Processor
**Description:** Sequential execution of queued operations.
**Category:** Operation Queue

---

### 89. Queue Status Tracking
**Description:** Track pending/in-progress/completed/failed operations.
**Category:** Operation Queue

---

### 90. Queue Pause/Resume
**Description:** Manually pause and resume queue processing.
**Category:** Operation Queue

---

### 91. Queue Clear All
**Description:** Remove all operations from queue.
**Category:** Operation Queue

---

### 92. Queue Retry Logic
**Description:** Automatic retry for failed operations.
**Category:** Operation Queue

---

### 93. Queue Blocking Mode
**Description:** Block chat input while queue processes operations.
**Category:** Operation Queue

---

### 94. Queue Progress UI
**Description:** Real-time progress display for queue operations.
**Category:** Operation Queue

---

### 95. Queue Version Control
**Description:** Invalidate in-flight operations on clear.
**Category:** Operation Queue

---

### 96. Queue Operation Timeout
**Description:** Timeout protection for stuck operations.
**Category:** Operation Queue

---

### 97. Queue Polling Interval
**Description:** Configurable polling for queue updates.
**Category:** Operation Queue

---

### 98. Chat Blocking Toggle
**Description:** Automatically block/unblock chat based on queue state.
**Category:** Operation Queue

---

### 99. Enter Key Interception
**Description:** Block Enter key when queue is processing.
**Category:** Operation Queue

---

### 100. Send Button Hiding
**Description:** Hide SillyTavern's send button during queue operations.
**Category:** Operation Queue

---

### 101. Queue Indicator Button
**Description:** Custom button showing queue is active.
**Category:** Operation Queue

---

## Lorebook Integration Features

### 102. Automatic Lorebook Creation
**Description:** Auto-create chat-specific lorebook on first use.
**Category:** Lorebook Integration

---

### 103. Lorebook Entry Creation
**Description:** Create lorebook entries from scene recaps.
**Category:** Lorebook Integration

---

### 104. Lorebook Entry Merging
**Description:** Merge new recap info with existing lorebook entries.
**Category:** Lorebook Integration

---

### 105. Lorebook Registry Entries
**Description:** Type-specific registry entries for entity tracking.
**Category:** Lorebook Integration

---

### 106. Lorebook Duplicate Detection
**Description:** Two-stage duplicate detection (lookup + dedupe).
**Category:** Lorebook Integration

---

### 107. Lorebook Entry Lookup
**Description:** LLM-powered lookup of potentially matching entries.
**Category:** Lorebook Integration

---

### 108. Lorebook Entry Deduplication
**Description:** LLM-powered comparison of full entry details.
**Category:** Lorebook Integration

---

### 109. Lorebook Merge Prompt Customization
**Description:** Customize prompt for merging content.
**Category:** Lorebook Integration

---

### 110. Lorebook Lookup Prompt Customization
**Description:** Customize prompt for entry lookup.
**Category:** Lorebook Integration

---

### 111. Lorebook Dedupe Prompt Customization
**Description:** Customize prompt for deduplication.
**Category:** Lorebook Integration

---

### 112. Entity Type Management
**Description:** Configure which entity types to extract (Character, Location, Object, Event, Faction, Concept).
**Category:** Lorebook Integration

---

### 113. Entity Type UI
**Description:** Add/remove entity types in settings.
**Category:** Lorebook Integration

---

### 114. Entity Type Restore Defaults
**Description:** Reset entity types to default list.
**Category:** Lorebook Integration

---

### 115. Lorebook Name Template
**Description:** Customizable template for lorebook naming.
**Category:** Lorebook Integration

---

### 116. Lorebook Auto-Delete
**Description:** Delete lorebook when chat is deleted.
**Category:** Lorebook Integration

---

### 117. Lorebook Alphabetical Reordering
**Description:** Auto-reorder entries alphabetically.
**Category:** Lorebook Integration

---

### 118. Lorebook Entry Flags
**Description:** Configure entry flags (exclude_recursion, prevent_recursion, ignore_budget, sticky).
**Category:** Lorebook Integration

---

### 119. Lorebook Entry Sticky Rounds
**Description:** Set sticky rounds for auto-created entries.
**Category:** Lorebook Integration

---

### 120. Category Index Management
**Description:** Category indexes for organized lorebook structure.
**Category:** Lorebook Integration

---

### 121. Lorebook Skip Duplicates
**Description:** Skip processing recaps that are duplicates.
**Category:** Lorebook Integration

---

### 122. Lorebook Cache Invalidation
**Description:** Properly invalidate SillyTavern's lorebook cache.
**Category:** Lorebook Integration

---

### 123. Lorebook Wrapper
**Description:** Wrap individual lorebook entries in XML tags for parsing.
**Category:** Lorebook Integration

---

### 124. Lorebook Pending Operations System
**Description:** Multi-stage operation coordination for lorebook processing.
**Category:** Lorebook Integration

---

### 125. Pending Entry Tracking
**Description:** Track pending lorebook entries across multi-stage operations.
**Category:** Lorebook Integration

---

### 126. Entry Data Storage and Retrieval
**Description:** Store and retrieve entry data during pending operations.
**Category:** Lorebook Integration

---

### 127. Lookup Result Caching
**Description:** Cache lookup results to avoid duplicate LLM calls.
**Category:** Lorebook Integration

---

### 128. Deduplicate Result Caching
**Description:** Cache deduplication results between processing stages.
**Category:** Lorebook Integration

---

### 129. Stage Progress Tracking
**Description:** Track progress through multi-stage lorebook operations.
**Category:** Lorebook Integration

---

### 130. Pending Entry Completion
**Description:** Mark pending entries as complete and commit changes.
**Category:** Lorebook Integration

---

### 131. Stage In-Progress Marking
**Description:** Mark current stage of lorebook operation as in-progress.
**Category:** Lorebook Integration

---


### 132. Registry Entry Record Ensuring
**Description:** Ensure registry records exist for all entity types.
**Category:** Lorebook Integration

---

### 133. Registry State Management
**Description:** Manage and synchronize registry state across operations.
**Category:** Lorebook Integration

---

### 134. Registry Listing Builder
**Description:** Build comprehensive registry listings from entries.
**Category:** Lorebook Integration

---

### 135. Registry Items Builder Per Type
**Description:** Build registry items organized by entity type.
**Category:** Lorebook Integration

---

### 136. Registry State Refresh
**Description:** Refresh registry state from lorebook entries.
**Category:** Lorebook Integration

---

### 137. Candidate Entries Data Builder
**Description:** Build candidate entry data for processing operations.
**Category:** Lorebook Integration

---

### 138. Bulk Registry Population
**Description:** Populate multiple registry entries in bulk operations.
**Category:** Lorebook Integration

---

### 139. Bulk Populate Results Processing
**Description:** Process results from bulk registry population operations.
**Category:** Lorebook Integration

---

### 140. Normalize Entry Data
**Description:** Normalize lorebook entry data for consistent processing.
**Category:** Lorebook Integration

---

### 141. Build Candidate Entries Data
**Description:** Build candidate entries data structure for LLM processing.
**Category:** Lorebook Integration

---

### 142. Refresh Registry State from Entries
**Description:** Synchronize registry state with current lorebook entries.
**Category:** Lorebook Integration

---

## Entity Types Management Features

### 143. Entity Type Configuration
**Description:** Configure which entity types to extract from recaps.
**Category:** Entity Types Management

---

### 144. Entity Type Parsing
**Description:** Parse entity types from extraction results with validation.
**Category:** Entity Types Management

---

### 145. Entity Type Normalization
**Description:** Normalize entity type names for consistency.
**Category:** Entity Types Management

---

### 146. Entity Type Sanitization
**Description:** Sanitize entity type values to prevent invalid entries.
**Category:** Entity Types Management

---

### 147. Entity Type Definition Parsing
**Description:** Parse entity type definitions from raw configuration strings.
**Category:** Entity Types Management

---

### 148. Entity Type Map Creation
**Description:** Create entity type mapping structures for processing.
**Category:** Entity Types Management

---

### 149. Entity Type Flags Application
**Description:** Apply entity-specific flags to lorebook entries.
**Category:** Entity Types Management

---

### 150. Entity Type Name Sanitization
**Description:** Sanitize entity type names for use in lorebook keys.
**Category:** Entity Types Management

---

### 151. Entity Type Restore Defaults UI
**Description:** UI button to restore entity types to default configuration.
**Category:** Entity Types Management

---

### 152. Entity Type Add/Remove UI
**Description:** UI controls to add and remove custom entity types.
**Category:** Entity Types Management

---

## LLM Client Features

### 153. Unified LLM Client
**Description:** Centralized client for all LLM API requests.
**Category:** LLM Client

---

### 154. LLM Call Parameter Validation
**Description:** Validate all LLM call parameters before sending requests.
**Category:** LLM Client

---

### 155. Profile Resolution
**Description:** Resolve connection profile IDs to actual profile configurations.
**Category:** LLM Client

---

### 156. Preset Validity Checking
**Description:** Verify completion preset exists before making LLM calls.
**Category:** LLM Client

---

## Advanced Features

### 157. World Info Activation Tracking
**Description:** Track which lorebook entries are active per message.
**Category:** Advanced

---

### 158. Sticky Entry Tracking
**Description:** Maintain sticky/constant entry state across generations.
**Category:** Advanced

---

### 159. Active/Inactive Entry Snapshots
**Description:** Store complete snapshot of active and inactive entries per message.
**Category:** Advanced

---

### 160. generateRaw Interceptor
**Description:** Intercept ALL LLM calls to inject metadata.
**Category:** Advanced

---

### 161. Metadata Injection
**Description:** Inject chat metadata into LLM requests for proxy logging.
**Category:** Advanced

---

### 162. Operation Context Tracking
**Description:** Track which operation is currently executing.
**Category:** Advanced

---

### 163. Operation Suffix Management
**Description:** Add operation suffix to metadata.
**Category:** Advanced

---

### 164. First-Hop Proxy Integration
**Description:** Send chat details to first-hop proxy.
**Category:** Advanced

---

### 165. Suppress Other Lorebooks
**Description:** Option to suppress non-Auto-Recap lorebooks.
**Category:** Advanced

---

### 166. Message Filtering
**Description:** Filter user/system/narrator messages.
**Category:** Advanced

---

### 167. Message Length Threshold
**Description:** Only process messages above minimum token count.
**Category:** Advanced

---

### 168. Character-Specific Enable/Disable
**Description:** Toggle recap generation per character in group chats.
**Category:** Advanced

---

### 169. Group Member Enable Buttons
**Description:** UI buttons in group chat to toggle character recapping.
**Category:** Advanced

---

### 170. Chat Enable/Disable Per Chat
**Description:** Toggle extension on/off per chat.
**Category:** Advanced

---

### 171. Global Toggle State
**Description:** Share enable/disable state across all chats.
**Category:** Advanced

---

### 172. Default Chat Enabled State
**Description:** Set whether new chats start with memory enabled.
**Category:** Advanced

---

### 173. Verbose Logging
**Description:** Always-on detailed logging for troubleshooting.
**Category:** Advanced

---

### 174. Debug Subsystem Logging
**Description:** Categorized logging by subsystem (CORE, SETTINGS, UI, OPERATIONS, INJECTION, VALIDATION, LOREBOOK, RUNNING, MEMORY, QUEUE, EVENT).
**Category:** Advanced

---

### 175. Token Counting
**Description:** Count tokens in messages and recaps.
**Category:** Advanced

---

### 176. Message Data Persistence
**Description:** Store/retrieve data on messages via message.extra.
**Category:** Advanced

---

### 177. Swipe Data Persistence
**Description:** Store recap data per swipe.
**Category:** Advanced

---

### 178. Chat Metadata Storage
**Description:** Store extension data in chat_metadata.
**Category:** Advanced

---

### 179. Settings Hash Tracking
**Description:** Detect when settings have changed.
**Category:** Advanced

---

### 180. Entry Strategy Detection
**Description:** Detect lorebook entry strategy type (constant/vectorized/normal).
**Category:** Advanced

---

### 181. Active and Inactive Entry Snapshots
**Description:** Store complete snapshot of both active and inactive lorebook entries per message.
**Category:** Advanced

---

### 182. Sticky Entry Rounds Tracking
**Description:** Track sticky entry remaining rounds across multiple generations.
**Category:** Advanced

---

## Validation Features

### 183. Recap Validation System
**Description:** Second LLM pass to validate recap quality.
**Category:** Validation

---


### 184. Validation Prompt Customization
**Description:** Customize validation criteria prompts.
**Category:** Validation

---

### 185. Validation Preset Selection
**Description:** Use different preset for validation.
**Category:** Validation

---

### 186. Validation Prefill
**Description:** Prefill for validation prompts.
**Category:** Validation

---

### 187. Validation Max Retries
**Description:** Configure how many times to retry if validation fails.
**Category:** Validation

---

### 188. Validation VALID/INVALID Detection
**Description:** Parse validation output for pass/fail.
**Category:** Validation

---

## Message Integration Features

### 189. Message Button Integration
**Description:** Add buttons to message menu.
**Category:** Message Integration

---

### 190. Scene Break Button Binding
**Description:** Click handler for scene break buttons.
**Category:** Message Integration

---

### 191. Lorebook Viewer Button
**Description:** Button to view lorebook entries per message.
**Category:** Message Integration

---

### 192. Message Hide/Unhide Detection
**Description:** Refresh memory when messages hidden/unhidden.
**Category:** Message Integration

---

### 193. Message Deletion Handling
**Description:** Clean up recap data when messages deleted.
**Category:** Message Integration

---

### 194. Message Edit Handling
**Description:** Handle message edits.
**Category:** Message Integration

---

### 195. Message Swipe Handling
**Description:** Handle swipes and clear old recap data.
**Category:** Message Integration

---

### 196. Message Sent Event
**Description:** Log scene injection on message send.
**Category:** Message Integration

---

### 197. Character Message Rendering
**Description:** Trigger scene detection on character messages.
**Category:** Message Integration

---

### 198. User Message Rendering
**Description:** Track user message events.
**Category:** Message Integration

---

### 199. More Messages Loaded
**Description:** Refresh memory when more messages loaded.
**Category:** Message Integration

---

## Slash Command Features

### 200. /get_memory_enabled
**Description:** Check if extension enabled in current chat.
**Category:** Slash Command

---

### 201. /toggle_memory
**Description:** Toggle extension on/off for current chat.
**Category:** Slash Command

---

### 202. /toggle_memory_popout
**Description:** Open/close popout settings window.
**Category:** Slash Command

---

### 203. /toggle_memory_injection_preview
**Description:** Preview memory injection.
**Category:** Slash Command

---

### 204. /get_memory <n>
**Description:** Get memory for specific message.
**Category:** Slash Command

---

### 205. /auto_recap_log_chat
**Description:** Log current chat to console.
**Category:** Slash Command

---

### 206. /auto_recap_log_settings
**Description:** Log current settings to console.
**Category:** Slash Command

---

### 207. /hard_reset
**Description:** Reset all settings to defaults.
**Category:** Slash Command

---

### 208. /log_scene_recap_injection
**Description:** Log scene recap injection settings.
**Category:** Slash Command

---

### 209. /queue-status
**Description:** Show operation queue status.
**Category:** Slash Command

---

### 210. /queue
**Description:** Alias for queue-status.
**Category:** Slash Command

---

### 211. /queue-pause
**Description:** Pause the operation queue.
**Category:** Slash Command

---

### 212. /queue-resume
**Description:** Resume the operation queue.
**Category:** Slash Command

---

### 213. /queue-clear-all
**Description:** Clear all operations from queue.
**Category:** Slash Command

---

## Event Handling Features

### 214. Chat Changed Event
**Description:** Load profile, refresh memory, scene detection on chat change.
**Category:** Event Handling

---

### 215. Chat Deleted Event
**Description:** Delete auto-created lorebook when chat deleted.
**Category:** Event Handling

---

### 216. Group Chat Deleted Event
**Description:** Handle group chat deletions.
**Category:** Event Handling

---

### 217. Message Deleted Event
**Description:** Clean up running recaps on message delete.
**Category:** Event Handling

---

### 218. Before Message Event
**Description:** Track before message generation.
**Category:** Event Handling

---

### 219. User Message Event
**Description:** Track user messages.
**Category:** Event Handling

---

### 220. Character Message Event
**Description:** Trigger scene detection on character messages.
**Category:** Event Handling

---

### 221. Message Swiped Event
**Description:** Handle swipe logic and memory clearing.
**Category:** Event Handling

---


### 222. Message Edited Event
**Description:** Track message edits.
**Category:** Event Handling

---

### 223. Message Received Event
**Description:** Track message received reasons (swipe vs normal).
**Category:** Event Handling

---

### 224. More Messages Loaded Event
**Description:** Refresh UI when loading more messages.
**Category:** Event Handling

---

### 225. Group Selected Event
**Description:** Update character enable button states.
**Category:** Event Handling

---

### 226. Group Updated Event
**Description:** Update character enable button states.
**Category:** Event Handling

---

### 227. Chat Completion Prompt Ready
**Description:** Inject metadata into prompts.
**Category:** Event Handling

---

### 228. World Info Activated Event
**Description:** Track which lorebook entries activated.
**Category:** Event Handling

---

### 229. Generation Started Event
**Description:** Track generation type and target message.
**Category:** Event Handling

---

## Supporting/Internal Features

### 230. Default Prompts
**Description:** Built-in default prompts for all operations.
**Category:** Supporting/Internal

---

### 231. Default Settings
**Description:** Built-in default settings configuration.
**Category:** Supporting/Internal

---

### 232. Constants Management
**Description:** Centralized constants for all magic numbers.
**Category:** Supporting/Internal

---

### 233. Style Constants
**Description:** CSS constants for UI styling.
**Category:** Supporting/Internal

---

### 234. Selector Validation
**Description:** Validate all DOM selectors exist in SillyTavern.
**Category:** Supporting/Internal

---

### 235. SillyTavern Selectors
**Description:** Centralized ST DOM selectors.
**Category:** Supporting/Internal

---

### 236. Extension Selectors
**Description:** Centralized extension DOM selectors.
**Category:** Supporting/Internal

---

### 237. Macro Parser Integration
**Description:** Use ST's macro system in prompts.
**Category:** Supporting/Internal

---

### 238. Regex Script Integration
**Description:** Support for regex scripts in prompts.
**Category:** Supporting/Internal

---

### 239. Instruct Mode Integration
**Description:** Format prompts using instruct mode.
**Category:** Supporting/Internal

---

### 240. Preset Manager Integration
**Description:** Access to ST's preset manager.
**Category:** Supporting/Internal

---

### 241. Group Chat Integration
**Description:** Full support for group chats.
**Category:** Supporting/Internal

---

### 242. Character Identification
**Description:** Get current character/chat identifiers.
**Category:** Supporting/Internal

---

### 243. Message Division Helpers
**Description:** Helper functions to get message DOM elements.
**Category:** Supporting/Internal

---

### 244. Settings UI Bindings
**Description:** Bind all settings controls to data.
**Category:** Supporting/Internal

---

### 245. Settings Refresh
**Description:** Refresh UI when settings change.
**Category:** Supporting/Internal

---

### 246. Profile UI Management
**Description:** UI for profile dropdown and buttons.
**Category:** Supporting/Internal

---

### 247. Entity Type Settings UI
**Description:** UI for managing entity types.
**Category:** Supporting/Internal

---

### 248. Debounce Utilities
**Description:** Debounced saving of settings and chat.
**Category:** Supporting/Internal

---

### 249. Copy Text Utility
**Description:** Copy text to clipboard.
**Category:** Supporting/Internal

---

### 250. Trim to End Sentence
**Description:** Trim incomplete sentences from recap output.
**Category:** Supporting/Internal

---

### 251. Download Utility
**Description:** Download profiles as JSON files.
**Category:** Supporting/Internal

---

### 252. Parse JSON File
**Description:** Parse uploaded JSON files.
**Category:** Supporting/Internal

---

### 253. Wait Until Condition
**Description:** Polling utility for async conditions.
**Category:** Supporting/Internal

---

### 254. String Hash Generation
**Description:** Generate hashes for change detection.
**Category:** Supporting/Internal

---


### 255. Lorebook Name Generation
**Description:** Generate unique lorebook names.
**Category:** Supporting/Internal

---

### 256. Newline Conversion
**Description:** Convert literal/actual newlines.
**Category:** Supporting/Internal

---

### 257. LLM Client
**Description:** Unified client for making LLM requests.
**Category:** Supporting/Internal

---

### 258. LLM Call Validator
**Description:** Validate LLM call parameters.
**Category:** Supporting/Internal

---


### 259. Operation Types
**Description:** Define all operation types for queue.
**Category:** Supporting/Internal

---

### 260. Button Interceptor
**Description:** Intercept send button to block when queue active.
**Category:** Supporting/Internal

---

### 261. Settings Content Class
**Description:** CSS class for settings panel.
**Category:** Supporting/Internal

---

### 262. Prompt Utility Functions
**Description:** Helper functions for prompt construction.
**Category:** Supporting/Internal

---

### 263. Preset Prompt Loader
**Description:** Load prompts from completion presets.
**Category:** Supporting/Internal

---


### 264. Scene Recap Hash Computation
**Description:** Compute hashes for scene recaps.
**Category:** Supporting/Internal

---

### 265. Running Recap Storage
**Description:** Dedicated storage for running recaps.
**Category:** Supporting/Internal

---

### 266. Running Recap Injection
**Description:** Get running recap for injection.
**Category:** Supporting/Internal

---

### 267. Clear Running Scene Recaps
**Description:** Clean up invalid running recaps.
**Category:** Supporting/Internal

---

### 268. Cleanup Invalid Running Recaps
**Description:** Remove running recaps for deleted messages.
**Category:** Supporting/Internal

---

### 269. Message Exclusion Checking
**Description:** Check if message should be excluded.
**Category:** Supporting/Internal

---

### 270. Character Enable State
**Description:** Track which characters have recapping enabled.
**Category:** Supporting/Internal

---

### 271. Message Inclusion Flag Updates
**Description:** Update which messages are included in memory.
**Category:** Supporting/Internal

---

### 272. Auto-Hide Messages by Command
**Description:** Hide messages older than X scenes.
**Category:** Supporting/Internal

---

### 273. Clear All Recaps
**Description:** Comprehensive cleanup with detailed auditing (6 data types).
**Category:** Supporting/Internal

---

### 274. Extension Reload Testing
**Description:** Test marker for extension reload verification.
**Category:** Supporting/Internal

---

### 275. Window API Export
**Description:** Export functions to window.AutoRecap for tests.
**Category:** Supporting/Internal

---

### 276. SillyTavern Version Check
**Description:** Verify compatible ST version.
**Category:** Supporting/Internal

---

### 277. Manifest Reading
**Description:** Read version from manifest.json.
**Category:** Supporting/Internal

---

### 278. Menu Button Addition
**Description:** Add buttons to ST extensions menu.
**Category:** Supporting/Internal

---


### 279. Operation Context Get/Set
**Description:** Get and set current operation context for tracking.
**Category:** Supporting/Internal

---



### 280. Enter Key Interceptor
**Description:** Intercept Enter key presses to block during queue operations.
**Category:** Supporting/Internal

---

### 281. Button State Observer
**Description:** Observe button state changes to enforce queue blocking.
**Category:** Supporting/Internal

---

### 282. Queue Indicator Button Management
**Description:** Create and manage custom queue indicator button.
**Category:** Supporting/Internal

---

### 283. Active Lorebooks Map
**Description:** In-memory map of active lorebook entries per message.
**Category:** Supporting/Internal

---

### 284. Sticky Entries Map
**Description:** Track sticky/constant lorebook entries across generations.
**Category:** Supporting/Internal

---

### 285. Generation Type Tracking
**Description:** Track current generation type (normal/swipe/continue).
**Category:** Supporting/Internal

---

### 286. Target Message Index Calculation
**Description:** Calculate target message index for lorebook activation.
**Category:** Supporting/Internal

---

### 287. Sticky Counter Decrement
**Description:** Decrement sticky entry counters after each generation.
**Category:** Supporting/Internal

---

### 288. Still Active Entries Getter
**Description:** Get lorebook entries still active from previous activations.
**Category:** Supporting/Internal

---

### 289. Update Sticky Tracking
**Description:** Update sticky entry tracking with newly activated entries.
**Category:** Supporting/Internal

---

### 290. Get All Lorebook Entries
**Description:** Retrieve all entries from lorebooks used by active entries.
**Category:** Supporting/Internal

---

### 291. Persist Lorebooks to Message
**Description:** Persist lorebook data to message.extra for durability.
**Category:** Supporting/Internal

---

### 292. Persist Inactive Lorebooks to Message
**Description:** Persist inactive lorebook entries to message metadata.
**Category:** Supporting/Internal

---

## Summary

**Total Features: 292**
- **User-Facing Features:** 109 (Recap, Memory, UI, Automation, Profiles, Scenes, Messages, Slash Commands)
- **Advanced/Power User Features:** 120 (Migration, Queue, Lorebook, Entity Types, LLM Client, Advanced Settings, Validation, Events)
- **Internal/Supporting Features:** 63 (Utilities, Integrations, Infrastructure)

This extension provides comprehensive AI-powered scene summarization, advanced memory management, automated lorebook creation with entity type management, extensive UI customization, robust operation queue system, profile management, validation systems, settings migration, unified LLM client infrastructure, and deep integration with SillyTavern's events and APIs.

**New in this version:**
- Entity Types Management system (10 features)
- Advanced Lorebook processing with registry and pending operations (20 features)
- Settings Migration for backward compatibility (2 features)
- Enhanced Auto Scene Break Detection with validation (7 features)
- Unified LLM Client infrastructure (4 features)
- Complete World Info snapshot system with sticky tracking (3 features)

---

## Related Documentation

- **[AUTO_SCENE_BREAK_DETECTION.md](AUTO_SCENE_BREAK_DETECTION.md)** - Auto scene detection feature
- **[RUNNING_SCENE_RECAP.md](RUNNING_SCENE_RECAP.md)** - Running scene recap system
- **[TRACKING_ENTRIES.md](TRACKING_ENTRIES.md)** - Entity tracking lorebook feature
- **[PROMPTS_GUIDE.md](PROMPTS_GUIDE.md)** - All LLM prompts reference
- **[../README.md](../README.md)** - Main documentation hub

For implementation details, see source code in the extension root directory.

</details>

---

**Navigation:**
- [Main README](../../README.md)
- [Docs Hub](../README.md)
- [Features](.)

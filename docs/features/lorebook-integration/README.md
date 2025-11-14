# Lorebook Integration Features

This directory contains 41 feature(s) in the Lorebook Integration category.

## Features

- [Automatic Lorebook Creation](./automatic-lorebook-creation/overview.md) - Auto-create chat-specific lorebook on first use.
- [Lorebook Entry Creation](./lorebook-entry-creation/overview.md) - Create lorebook entries from scene recaps.
- [Lorebook Entry Merging](./lorebook-entry-merging/overview.md) - Merge new recap info with existing lorebook entries.
- [Lorebook Registry Entries](./lorebook-registry-entries/overview.md) - Type-specific registry entries for entity tracking.
- [Lorebook Duplicate Detection](./lorebook-duplicate-detection/overview.md) - Two-stage duplicate detection (lookup + dedupe).
- [Lorebook Entry Lookup](./lorebook-entry-lookup/overview.md) - LLM-powered lookup of potentially matching entries.
- [Lorebook Entry Deduplication](./lorebook-entry-deduplication/overview.md) - LLM-powered comparison of full entry details.
- [Lorebook Merge Prompt Customization](./lorebook-merge-prompt-customization/overview.md) - Customize prompt for merging content.
- [Lorebook Lookup Prompt Customization](./lorebook-lookup-prompt-customization/overview.md) - Customize prompt for entry lookup.
- [Lorebook Dedupe Prompt Customization](./lorebook-dedupe-prompt-customization/overview.md) - Customize prompt for deduplication.
- [Entity Type Management](./entity-type-management/overview.md) - Configure which entity types to extract (Character, Location, Object, Event, Faction, Concept).
- [Entity Type UI](./entity-type-ui/overview.md) - Add/remove entity types in settings.
- [Entity Type Restore Defaults](./entity-type-restore-defaults/overview.md) - Reset entity types to default list.
- [Lorebook Name Template](./lorebook-name-template/overview.md) - Customizable template for lorebook naming.
- [Lorebook Auto-Delete](./lorebook-auto-delete/overview.md) - Delete lorebook when chat is deleted.
- [Lorebook Alphabetical Reordering](./lorebook-alphabetical-reordering/overview.md) - Auto-reorder entries alphabetically.
- [Lorebook Entry Flags](./lorebook-entry-flags/overview.md) - Configure entry flags (exclude_recursion, prevent_recursion, ignore_budget, sticky).
- [Lorebook Entry Sticky Rounds](./lorebook-entry-sticky-rounds/overview.md) - Set sticky rounds for auto-created entries.
- [Category Index Management](./category-index-management/overview.md) - Category indexes for organized lorebook structure.
- [Lorebook Skip Duplicates](./lorebook-skip-duplicates/overview.md) - Skip processing recaps that are duplicates.
- [Lorebook Cache Invalidation](./lorebook-cache-invalidation/overview.md) - Properly invalidate SillyTavern's lorebook cache.
- [Lorebook Wrapper](./lorebook-wrapper/overview.md) - Wrap individual lorebook entries in XML tags for parsing.
- [Lorebook Pending Operations System](./lorebook-pending-operations-system/overview.md) - Multi-stage operation coordination for lorebook processing.
- [Pending Entry Tracking](./pending-entry-tracking/overview.md) - Track pending lorebook entries across multi-stage operations.
- [Entry Data Storage and Retrieval](./entry-data-storage-and-retrieval/overview.md) - Store and retrieve entry data during pending operations.
- [Lookup Result Caching](./lookup-result-caching/overview.md) - Cache lookup results to avoid duplicate LLM calls.
- [Deduplicate Result Caching](./deduplicate-result-caching/overview.md) - Cache deduplication results between processing stages.
- [Stage Progress Tracking](./stage-progress-tracking/overview.md) - Track progress through multi-stage lorebook operations.
- [Pending Entry Completion](./pending-entry-completion/overview.md) - Mark pending entries as complete and commit changes.
- [Stage In-Progress Marking](./stage-in-progress-marking/overview.md) - Mark current stage of lorebook operation as in-progress.
- [Registry Entry Record Ensuring](./registry-entry-record-ensuring/overview.md) - Ensure registry records exist for all entity types.
- [Registry State Management](./registry-state-management/overview.md) - Manage and synchronize registry state across operations.
- [Registry Listing Builder](./registry-listing-builder/overview.md) - Build comprehensive registry listings from entries.
- [Registry Items Builder Per Type](./registry-items-builder-per-type/overview.md) - Build registry items organized by entity type.
- [Registry State Refresh](./registry-state-refresh/overview.md) - Refresh registry state from lorebook entries.
- [Candidate Entries Data Builder](./candidate-entries-data-builder/overview.md) - Build candidate entry data for processing operations.
- [Bulk Registry Population](./bulk-registry-population/overview.md) - Populate multiple registry entries in bulk operations.
- [Bulk Populate Results Processing](./bulk-populate-results-processing/overview.md) - Process results from bulk registry population operations.
- [Normalize Entry Data](./normalize-entry-data/overview.md) - Normalize lorebook entry data for consistent processing.
- [Build Candidate Entries Data](./build-candidate-entries-data/overview.md) - Build candidate entries data structure for LLM processing.
- [Refresh Registry State from Entries](./refresh-registry-state-from-entries/overview.md) - Synchronize registry state with current lorebook entries.

---

[Back to Feature Overview](../overall-overview.md)

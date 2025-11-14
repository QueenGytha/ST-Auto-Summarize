# ST-Auto-Recap Documentation

## Quick Start

- **New users**: Start with [Default Settings Best Practices](guides/DEFAULT_SETTINGS_BEST_PRACTICES.md)
- **Feature overview**: See [Features](#features) section below
- **Development**: See [Development](#development) section for workflow and testing

## Features

Core feature documentation for production functionality:

- [Auto Scene Break Detection](features/AUTO_SCENE_BREAK_DETECTION.md) - Automatic scene transition detection
- [Running Scene Recap](features/RUNNING_SCENE_RECAP.md) - Comprehensive memory system combining scene recaps
- [Tracking Entries](features/TRACKING_ENTRIES.md) - AI-editable lorebook entries for entity tracking
- [Prompts Guide](features/PROMPTS_GUIDE.md) - Reference for all LLM prompts used in the extension

## Guides

User and developer guides for configuration and usage:

- [Lorebook Entry Guidelines](guides/LOREBOOK_ENTRY_GUIDELINES.md) - Guidelines for entity extraction and lorebook usage
- [Default Settings Best Practices](guides/DEFAULT_SETTINGS_BEST_PRACTICES.md) - Configuration recommendations
- [Recap/Lorebook Separation](guides/RECAP_LOREBOOK_SEPARATION.md) - Design principles for separating recaps and entities

## Reference

Technical reference material for advanced users and developers:

- [JSON Syntax Reference](reference/JSON_SYNTAX_REFERENCE.md) - JSON structure used throughout the extension
- [Recap/Lorebook Examples](reference/RECAP_LOREBOOK_EXAMPLES.md) - Practical examples for developers
- [SillyTavern Lorebook Injection](reference/SILLYTAVERN_LOREBOOK_INJECTION.md) - Deep dive into ST lorebook internals
- [SillyTavern Playwright](reference/SILLYTAVERN_PLAYWRIGHT.md) - Browser automation reference for testing
- [Data Storage Inventory](reference/DATA_STORAGE_INVENTORY.md) - Complete inventory of extension data storage locations
- [Settings and Profiles Analysis](reference/SETTINGS_AND_PROFILES_ANALYSIS.md) - Analysis of settings architecture
- [Lorebook Duplication Correct Method](reference/LOREBOOK_DUPLICATION_CORRECT_METHOD.md) - Correct method for duplicating lorebook entries

## Development

For contributors and AI-assisted development:

- [AI Development Workflow](development/AI_DEVELOPMENT_WORKFLOW.md) - Complete guide for AI-assisted development
- [Playwright Testing Guide](development/PLAYWRIGHT_TESTING_GUIDE.md) - E2E testing approach (production method)
- [Playwright Test Writing Guide](development/PLAYWRIGHT_TEST_WRITING_GUIDE.md) - How to write E2E tests
- [Selectors Guide](development/SELECTORS_GUIDE.md) - SillyTavern DOM selector reference
- [Testing Reality Check](development/TESTING_REALITY_CHECK_FINAL.md) - Final testing methodology decisions
- [Extension Reload Enforcement](development/EXTENSION_RELOAD_ENFORCEMENT.md) - Critical guide for extension reload during development

## Proposed Features

Design documentation for features that are **NOT YET IMPLEMENTED**:

- **[proposed-features/](proposed-features/)** - Container for all proposed features
  - **[checkpoint-integration/](proposed-features/checkpoint-integration/)** - Integration with SillyTavern checkpoints/branches (16 docs)
  - **[prompt-versioning/](proposed-features/prompt-versioning/)** - Prompt versioning with immutable defaults (4 docs)

⚠️ **Important:** These are design specifications only. No implementation code exists for these features.

## Archived Documentation

Historical analyses, investigations, and legacy documentation:

- **[archived/investigations/](archived/investigations/)** - In-depth analyses that led to current implementations
  - Concurrency analysis
  - Recap Generation best practices analysis
  - Lorebook wrapping investigations
  - Settings access bug documentation

- **[archived/legacy/](archived/legacy/)** - Superseded implementation recaps

- **[archived/testing-methods/](archived/testing-methods/)** - Deprecated testing approaches (failed methods)

---

## Documentation Organization

This documentation is organized into logical categories:

- **features/** - Active feature documentation (implemented)
- **guides/** - How-to guides for users and developers
- **reference/** - Technical deep-dives and API references
- **development/** - Development workflow and testing
- **proposed-features/** - Design specs for unimplemented features
- **research/** - Research on external systems and integrations
- **archived/** - Historical investigations and legacy docs

For the main project README and installation instructions, see the [root directory](../).

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

## Development

For contributors and AI-assisted development:

- [AI Development Workflow](development/AI_DEVELOPMENT_WORKFLOW.md) - Complete guide for AI-assisted development
- [Playwright Testing Guide](development/PLAYWRIGHT_TESTING_GUIDE.md) - E2E testing approach (production method)
- [Testing Reality Check](development/TESTING_REALITY_CHECK_FINAL.md) - Final testing methodology decisions

## Archived Documentation

Historical analyses, investigations, and legacy documentation:

- **[archived/investigations/](archived/investigations/)** - In-depth analyses that led to current implementations
  - Concurrency analysis
  - Recap Generation best practices analysis
  - Lorebook wrapping investigations

- **[archived/session-notes/](archived/session-notes/)** - Temporary development session notes

- **[archived/legacy/](archived/legacy/)** - Superseded implementation recaps

- **[ARCHIVED/](ARCHIVED/)** - Previously archived testing documentation (failed approaches)

---

## Documentation Organization

This documentation is organized into logical categories:

- **features/** - Active feature documentation
- **guides/** - How-to guides for users and developers
- **reference/** - Technical deep-dives and API references
- **development/** - Development workflow and testing
- **archived/** - Historical investigations and legacy docs
- **ARCHIVED/** - Previously archived materials (old testing attempts)

For the main project README and installation instructions, see the [root directory](../).

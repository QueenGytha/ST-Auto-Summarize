# Settings Hash Tracking - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
4. [Hash Calculation](#hash-calculation)
5. [Storage Locations](#storage-locations)
6. [Integration Points](#integration-points)
7. [Settings Change Detection](#settings-change-detection)
8. [Chat-Level Tracking](#chat-level-tracking)
9. [Message-Level Tracking](#message-level-tracking)
10. [Use Cases](#use-cases)
11. [Error Handling](#error-handling)
12. [Testing](#testing)

## Overview

The settings hash tracking system creates cryptographic fingerprints of extension settings at specific points in time. These hashes enable the system to detect when settings have changed, which is essential for:

1. **Invalidating recaps**: When settings change (prompts, templates, injection rules), old recaps may no longer match current configuration
2. **Tracking recap metadata**: Recording which settings were in effect when a recap was generated
3. **Supporting prompt versioning**: Detecting when prompts have changed to determine if versioning is needed
4. **Cache invalidation**: Knowing when cached values need recalculation

### Key Files

- `settingsManager.js` - Settings access and change notification
- `messageData.js` - Hash calculation and storage on messages
- `index.js` - Exports hash utilities
- `eventHandlers.js` - Listens for settings changes
## Architecture

The system maintains hashes at two levels:

1. **Message-Level**: Stored in `message.extra.auto_recap.settings_hash`
2. **Chat-Level**: Stored in `chat_metadata.auto_recap.settings_hash`

## Key Concepts

Hash calculation captures fingerprints of all hashable settings using SHA-256.

**Included**: Prompts, injection settings, auto-generation config, scene detection, lorebook settings

**Excluded**: Toggle state, enable/disable flags, profile selection, API settings

## Integration Points

### Settings Manager
When settings change, if hashable, recalculate and save chat hash

### Profile Manager
When profile loads, new settings produce new hash

### Event Handlers
On chat change, initialize hash if missing

### Recap Generation
Store hash with recap for later comparison

### Message Visuals
Compare hashes to show current/outdated status

## Status

Core system ready for prompt versioning integration

---

**Last Updated**: 2025-11-15

# Chat Metadata Storage - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
4. [Chat Metadata Structure](#chat-metadata-structure)
5. [Core Components and Functions](#core-components-and-functions)
6. [Key Mechanisms](#key-mechanisms)
7. [Data Types and Structures](#data-types-and-structures)
8. [Initialization Process](#initialization-process)
9. [Isolation Prevention](#isolation-prevention)
10. [Integration with SillyTavern](#integration-with-sillytavern)
11. [Error Handling](#error-handling)
12. [Testing](#testing)

---

## Overview

The chat metadata storage system persists extension data at the chat level in SillyTavern's chat_metadata object. Unlike message-level data (message.extra) which is isolated to individual messages, and extension settings (extension_settings.auto_recap) which are global, chat metadata provides per-chat persistent storage that survives page reloads and chat switches.

### Purpose

1. Per-Chat Persistent Storage: Store data for a chat (not global, not per-message)
2. Durable Across Reloads: Data persists after browser refresh
3. Validated Isolation: Cross-chat contamination prevention
4. Centralized Access: Single source of truth for chat-level data

### Key Files

- runningSceneRecap.js - Running scene recap versioning (lines 19-43)
- lorebookPendingOps.js - Pending lorebook operations (lines 8-16)
- recapToLorebookProcessor.js - Processed recap tracking (lines 83-100)
- lorebookManager.js - Lorebook metadata (lines 315-321)
- index.js - Exports chat_metadata and saveMetadata (line 15)

---

## Architecture

### Two-Layer Persistence Model

#### 1. In-Memory Object (chat_metadata)

The extension directly modifies chat_metadata imported from SillyTavern.

#### 2. Disk Persistence via saveMetadata()

Called explicitly after modifications to persist to chat JSON file.

### Key Design Principle: Explicit Isolation

Chat metadata is explicitly validated to prevent cross-chat contamination via chat_id checking.

---

## Core Concepts

### 1. Chat Metadata Keys

- auto_recap: General recap settings
- auto_recap_running_scene_recaps: Running scene recap versions
- auto_lorebooks: Lorebook metadata
- auto_lorebooks_processed_recaps: Processed recap tracking

### 2. Lazy Initialization Pattern

Most chat metadata structures are created on first access rather than during initialization.

---

## Chat Metadata Structure

### Root Level Properties

- auto_recap: { enabled, settings_hash, combined_recap }
- auto_recap_running_scene_recaps: { chat_id, current_version, versions[] }
- autoLorebooks: { pendingOps: {} }
- auto_lorebooks_processed_recaps: []

---

## Core Components and Functions

### runningSceneRecap.js

#### get_running_recap_storage() - File: lines 19-43

Initializes/retrieves running scene recap storage with cross-chat validation.
Returns: RunningSceneRecapStorage object
Side Effects: Creates storage if missing, resets if chat_id mismatch

#### add_running_recap_version(...) - File: lines 86-123

Creates new version in running scene recap storage.
Parameters: content, scene_count, excluded_count, prev_scene_index, new_scene_index
Returns: number (version number)

#### clear_running_scene_recaps() - File: lines 152-169

Clears all running scene recap versions.
Returns: number (versions cleared)

### lorebookPendingOps.js

#### ensurePendingOps() - File: lines 8-16

Initializes and returns pending operations storage.

#### createPendingEntry(entryId, entryData) - File: lines 29-57

Creates a pending lorebook entry.

#### updatePendingEntry(entryId, updates) - File: lines 59-71

Updates an existing pending entry.

#### completePendingEntry(entryId) - File: lines 99-107

Removes pending entry after processing.

### recapToLorebookProcessor.js

#### getProcessedRecaps() - File: lines 83-88

Retrieves processed recap IDs as a Set.

#### markRecapProcessed(recapId) - File: lines 90-96

Marks a recap as processed.

#### isRecapProcessed(recapId) - File: lines 98-100

Checks if recap has been processed.

---

## Key Mechanisms

### 1. Storage Access Pattern

Read -> Modify -> Save pattern:
1. Read/initialize from chat_metadata
2. Modify the data structure
3. Call saveMetadata() to persist

### 2. Save Mechanisms

- saveChatDebounced(): Used for multiple quick changes (reduces I/O)
- saveMetadata(): Used for critical operations (immediate persistence)

### 3. Cross-Chat Contamination Prevention

Every access validates chat_id matches current chat. If not, resets to empty state.

---

## Data Types and Structures

### Running Scene Recap Storage



---

## Initialization

### On Chat Load

Lazy initialization on first access creates structure if missing.

### Cross-Chat Validation

When storage exists from previous chat, validates chat_id and resets if mismatch.

---

## Isolation Prevention

### Problem

chat_metadata is a single global object that gets replaced when switching chats.

### Solution

Extension stores chat_id alongside data and validates on every access.

---

## Integration with SillyTavern

### Imports



### saveMetadata() Function

Provided by SillyTavern, serializes chat_metadata to JSON and saves to chat file.

---

## Error Handling

### Missing Data

Uses fallback values: const versions = storage.versions || [];

### Cross-Chat Contamination Recovery

Resets to empty state if data belongs to different chat.

### Stale Entry Cleanup

Removes pending entries older than maxAgeMs (default 24 hours).

---

## Testing

### Test Scenarios

1. Running Scene Recap Versioning: Verify versions stored/retrieved correctly
2. Cross-Chat Contamination Prevention: Verify switching chats clears old data
3. Pending Entry Lifecycle: Verify creation/update/completion
4. Processed Recap Tracking: Verify marking and checking

---

## Summary

Chat metadata storage provides per-chat persistence with explicit isolation through chat_id validation, multiple storage structures, lazy initialization, and clear persistence semantics.

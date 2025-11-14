# First-Hop Proxy Integration - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Settings Configuration](#settings-configuration)
4. [Metadata Injection](#metadata-injection-system)
5. [Chat Identifiers](#chat-identifier-generation)
6. [Operation Types](#operation-type-tracking)
7. [Error Handling](#error-handling)
8. [Integration](#integration-points)
9. [Proxy Guide](#proxy-implementation-guide)
10. [Testing](#testing-verification)

## Overview

The First-Hop Proxy Integration feature enables ST-Auto-Recap to send structured metadata to a downstream HTTP proxy server. This metadata includes chat details (character name, timestamp), operation type (recap generation, validation, etc.), and other contextual information that helps proxies log and categorize LLM requests.

### What This Feature Does

1. Metadata Injection: Prepends structured XML-formatted metadata to LLM requests
2. Chat Identification: Extracts and communicates current chat identifier to proxies
3. Operation Type Tracking: Labels each request with its operation type for logging
4. Transparent Stripping: Proxies extract and strip metadata before sending to LLMs
5. Selective Enabling: Completely optional, can be toggled on/off via settings

### Relationship to generateRaw Interceptor

The First-Hop Proxy Integration works through the generateRaw Interceptor (Feature #160):

- generateRaw Interceptor: Wraps ALL LLM function calls
- First-Hop Proxy Integration: Defines WHAT metadata to send
- Together: Every request to proxy includes useful context

## Core Components

### metadataInjector.js

Location: metadataInjector.js (232 lines)

Key functions:
- initMetadataInjector(utils) - Line 12
- getChatName() - Line 16
- isMetadataInjectionEnabled() - Line 41
- getDefaultMetadata() - Line 52
- createMetadataBlock(options) - Line 61
- formatMetadataBlock(metadata) - Line 82
- injectMetadata(prompt, options) - Line 92
- stripMetadata(prompt) - Line 118
- hasExistingMetadata(chatArray) - Line 127
- getExistingOperation(chatArray) - Line 147
- injectMetadataIntoChatArray(chatArray, options) - Line 171

### operationContext.js

Location: operationContext.js (30 lines)

Functions:
- setOperationSuffix(suffix) - Line 20
- getOperationSuffix() - Line 24
- clearOperationSuffix() - Line 28

### generateRawInterceptor.js Integration

Location: generateRawInterceptor.js (Lines 15-78)

Calls:
- Line 42: injectMetadata() for string prompts
- Line 56-59: injectMetadataIntoChatArray() for arrays

## Settings Configuration

### Setting: first_hop_proxy_send_chat_details

- Type: Boolean
- Default: false
- Storage: extension_settings.auto_recap
- UI Binding: settingsUI.js:81
- Selector: .proxy-send-chat-details

## Metadata Injection System

### Injection Points

1. String Prompts (generateRawInterceptor.js:42)
   - Recap generation, validation, lorebook operations

2. Message Arrays (generateRawInterceptor.js:56-59)
   - Chat messages, custom completions

3. Event-Based Chat (eventHandlers.js)
   - CHAT_COMPLETION_PROMPT_READY event

### Metadata Format

```
<ST_METADATA>
{
  "version": "1.0",
  "chat": "CharName - YYYY-MM-DD@HHhMMmSSs",
  "operation": "operation_type"
}
</ST_METADATA>
```

## Chat Identifier Generation

### Format

Single character: CharName - YYYY-MM-DD@HHhMMmSSs (e.g., Senta - 2025-11-01@20h29m24s)
Group: Group name (e.g., Secret Meeting)

Source: getCurrentChatId() for single chars, groups array for group chats

### Python Parsing

File: first-hop-proxy/src/first_hop_proxy/utils.py:310

Handles character names with hyphens using LAST " - " separator.

## Operation Type Tracking

### Types Detected (generateRawInterceptor.js:125)

- chat (default)
- detect_scene_break
- generate_scene_recap
- generate_running_recap
- combine_scene_with_running
- validate_recap
- lorebook_entry_lookup
- resolve_lorebook_entry
- create_lorebook_entry
- merge_lorebook_entry
- update_lorebook_registry
- populate_registries
- unknown (fallback)

### Suffix Format

For ranges: operation-START-END (e.g., generate_scene_recap-42-67)

## Error Handling

All errors use try-catch:
- Error logged to console
- Original prompt/array returned
- Never throws exception (fail-safe)

Scenarios:
- Injection failures: Returns original
- Invalid chat IDs: Uses "Unknown"
- Setting failures: Assumes disabled
- Stack analysis failures: Returns "unknown"

## Integration Points

### With generateRaw Interceptor (Feature #160)

generateRawInterceptor.js calls:
- Line 42: injectMetadata() for strings
- Line 56-59: injectMetadataIntoChatArray() for arrays

Optional - works without it.

### With Settings UI

settingsUI.js:81 binds checkbox

### With Event Handlers

eventHandlers.js hooks CHAT_COMPLETION_PROMPT_READY

## Proxy Implementation Guide

### Python Functions

File: first-hop-proxy/src/first_hop_proxy/utils.py

- parse_st_metadata(content) - Line 250: Extract metadata
- strip_st_metadata(content) - Line 290: Remove metadata
- extract_st_metadata_from_messages(messages) - Line 341: Extract from array
- extract_character_chat_info(headers, request_data) - Line 387: Get info
- parse_chat_name(chat) - Line 310: Parse name

## Testing Verification

### JavaScript Tests

Verify metadata creation, formatting, injection

### Playwright Tests

Verify settings and metadata in requests

### Python Tests

File: first-hop-proxy/test_st_metadata.py

Verify parsing and stripping

---

Implementation Documentation Complete

# Settings Hash Tracking - Data Flow

## Table of Contents

1. [Overview](#overview)
2. [Hash Calculation Flow](#hash-calculation-flow)
3. [Settings Change Flow](#settings-change-flow)
4. [Recap Generation Flow](#recap-generation-flow)
5. [Outdated Detection Flow](#outdated-detection-flow)
6. [Profile Switching Flow](#profile-switching-flow)
7. [Chat Switch Flow](#chat-switch-flow)
8. [Complete Examples](#complete-examples)
9. [Flow Diagrams](#flow-diagrams)

## Overview

This document traces the complete data flow for settings hash tracking through different scenarios.

## Hash Calculation Flow

When settings hash is calculated:

```
Call generate_settings_hash()
    |
    ├─> Get current settings via get_settings()
    |
    ├─> Extract only HASHABLE_SETTINGS keys
    |
    ├─> Create flat object
    |
    ├─> JSON.stringify() for deterministic string
    |
    ├─> TextEncoder.encode() to bytes
    |
    ├─> crypto.subtle.digest(SHA-256)
    |
    ├─> Convert ArrayBuffer to hex string
    |
    └─> Return 64-character hex string
```


## Outdated Detection Flow

When checking if recap is current:

```
isRecapCurrent(message) called
    |
    ├─> messageHash = get_data(message, "settings_hash")
    |
    ├─> chatHash = chat_metadata.auto_recap.settings_hash
    |
    ├─> Check: Both hashes exist?
    |     ├─ No  → Return false (outdated)
    |     └─ Yes → Continue
    |
    ├─> Compare: messageHash === chatHash?
    |     ├─ Yes → Return true (current)
    |     └─ No  → Return false (outdated)
    |
    └─> UI shows status indicator
        ├─ Green (current)
        ├─ Yellow (outdated)
        └─ Gray (missing)
```


## Complete Examples

### Example 1: Profile Switching

**Initial State:**

Chat A with Profile "Default"
- scene_recap_prompt: "Analyze the scene..."
- chat_metadata.auto_recap.settings_hash: aaa111

Message 42:
- recap: "The characters met..."
- settings_hash: aaa111
- Status: Current (aaa111 === aaa111)

**User Action: Switch to Profile "Creative"**

load_profile("Creative") called
  - Load all settings from Creative profile
  - New scene_recap_prompt: "Tell a creative narrative..."
  - generate_settings_hash() → bbb222
  - chat_metadata.auto_recap.settings_hash = bbb222
  - saveMetadata()

**Result:**

Message 42:
- recap: "The characters met..."
- settings_hash: aaa111 (unchanged)
- Chat hash now: bbb222
- Status: Outdated (aaa111 !== bbb222)
- UI shows: Yellow indicator

### Example 2: Regenerating After Settings Change

**Step 1: Generate recap**

recap_text(prompt) called
  - LLM generates: "Scene recap content..."
  - generate_settings_hash() → abc123
  - set_data(message, "memory", "Scene recap content...")
  - set_data(message, "settings_hash", abc123)

Message 50:
- recap: "Scene recap content..."
- settings_hash: abc123
- Chat hash: abc123
- Status: Current

**Step 2: User changes setting**

set_settings("minimum_message_length", 50) called
  - Check: Is "minimum_message_length" in HASHABLE_SETTINGS? Yes
  - generate_settings_hash() → def456
  - chat_metadata.auto_recap.settings_hash = def456
  - saveMetadata()
  - update_all_message_visuals()

Message 50:
- recap: "Scene recap content..." (unchanged)
- settings_hash: abc123 (unchanged)
- Chat hash now: def456
- Status: Outdated (abc123 !== def456)
- UI shows: Yellow indicator

**Step 3: Regenerate recap**

recap_text(prompt) called again
  - LLM generates: "Updated recap..." (may differ due to new settings)
  - generate_settings_hash() → def456
  - set_data(message, "memory", "Updated recap...")
  - set_data(message, "settings_hash", def456)

Message 50:
- recap: "Updated recap..."
- settings_hash: def456 (updated)
- Chat hash: def456
- Status: Current (def456 === def456)
- UI shows: Green indicator


## Flow Diagrams

### Hash Comparison Decision Tree

```
isRecapCurrent(message)?
    |
    ├─> Get message.extra.auto_recap.settings_hash
    |
    ├─> Missing?
    |   ├─ Yes → Outdated (legacy recap)
    |   └─ No  → Continue
    |
    ├─> Get chat_metadata.auto_recap.settings_hash
    |
    ├─> Missing?
    |   ├─ Yes → Outdated (no chat hash)
    |   └─ No  → Continue
    |
    ├─> Compare strings
    |
    ├─> Equal?
    |   ├─ Yes → Current (green)
    |   └─ No  → Outdated (yellow)
    |
    └─> Return status
```

### Setting Update Impact

```
User changes setting
    |
    ├─> Hashable setting?
    |   ├─ No  → Skip hash update
    |   └─ Yes → Continue
    |
    ├─> Recalculate chat hash
    |
    ├─> Save chat_metadata
    |
    ├─> Update UI
    |
    └─> Result:
        All message recaps with old hash → Outdated
```

### Chat Switch Sequence

```
User switches to different chat
    |
    ├─> CHAT_CHANGED event fires
    |
    ├─> Load new chat_metadata
    |
    ├─> Check: Has settings_hash?
    |   ├─ Yes → Use existing baseline
    |   └─ No  → Generate new baseline
    |
    ├─> Auto-load character/chat profile
    |
    ├─> Load all message recaps
    |
    ├─> Compare each recap hash vs chat hash
    |
    └─> UI shows status for each
```

## Related Documentation

- [implementation.md](./implementation.md) - Technical details and integration points
- [overview.md](./overview.md) - Feature overview
- [DATA_STORAGE_INVENTORY.md](../../reference/DATA_STORAGE_INVENTORY.md) - Chat metadata storage
- [Advanced Features](../README.md) - Other advanced features
- [Documentation Hub](../../../README.md) - All extension documentation

---

**Status:** Complete data flow documentation ready for reference


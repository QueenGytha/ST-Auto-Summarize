# Message Length Threshold - Implementation Details

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Settings Storage](#settings-storage)
4. [Initialization](#initialization)

## Overview

The Message Length Threshold feature filters messages below a minimum token count from memory inclusion. Messages shorter than the configured threshold are excluded from scene recaps, running scene recaps, and memory injection into LLM prompts.

### Purpose

1. **Reduce noise**: Exclude very short messages (greetings, one-word responses)
2. **Control token usage**: Prevent short messages from consuming valuable context tokens
3. **Focus on substance**: Prioritize messages with meaningful content
4. **Flexible filtering**: Configurable per-chat via settings profiles
5. **Preserve performance**: Lightweight token counting integrated into existing flow

### Key Files

- `defaultSettings.js` - Default threshold value (0 tokens = disabled)
- `memoryCore.js` - Message filtering logic during memory updates
- `settingsUI.js` - UI binding and validation
- `selectorsExtension.js` - DOM selector for settings control
- `utils.js` - `count_tokens()` function for token counting
- `constants.js` - Constants for token/display limits

## Core Components

### get_settings('message_length_threshold')

Retrieves the current minimum token threshold. Default value is `0` (no filtering).

**Semantics:**
- `0` = No filtering (all messages included)
- `> 0` = Minimum tokens required for inclusion
- Value is in tokens, not characters

### count_tokens(text, padding = 0)

**File:** utils.js:83-88

Counts tokens in text using SillyTavern's tokenizer.



**Key Points:**
- Delegates to SillyTavern's `ctx.getTokenCount()`
- Counts tokens for `message.mes` only (message text)
- Token count varies by selected LLM/tokenizer

### check_message_exclusion(message)

**File:** memoryCore.js:42-92

Core filtering function that determines if a message should be included in memory.



**Exclusion Order:**
1. Auto-recap system message → exclude
2. Marked excluded → exclude
3. User message excluded → exclude
4. Thought message → exclude
5. System message excluded → exclude
6. Narrator message excluded → exclude
7. Character disabled → exclude
8. **Too short (token threshold) → exclude** ← THIS FEATURE
9. Otherwise → include

## Settings Storage

**Path:** `extension_settings.auto_recap.message_length_threshold`

**Type:** Number (integer tokens)

**Default:** `0` (disabled - no filtering)

**Initialization:** defaultSettings.js:49



## Initialization

### Startup Sequence

1. **Extension Loads**: defaultSettings.js imported with `message_length_threshold: 0`
2. **Settings Initialized**: Loads saved settings from storage
3. **UI Bound**: settingsUI.js:88 binds number input to setting
4. **Memory Refreshed**: Calls `update_message_inclusion_flags()` with current threshold

### Settings Loading

**On page load:**


**On profile change:**


---

**Status:** Complete - All implementation details traced and documented.

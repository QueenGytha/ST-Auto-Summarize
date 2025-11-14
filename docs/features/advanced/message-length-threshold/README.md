# Message Length Threshold - Documentation Hub

This directory contains comprehensive documentation for the Message Length Threshold advanced feature in ST-Auto-Summarize.

## Quick Links

- **[Overview](overview.md)** - High-level feature description
- **[Implementation Details](implementation.md)** - Technical implementation reference
- **[Data Flow](data-flow.md)** - Complete operation flows with examples

## What is Message Length Threshold?

The Message Length Threshold feature allows excluding messages shorter than a configurable minimum token count from being included in:
- Scene recaps
- Running scene recaps  
- Memory injection into LLM prompts

**Default:** Disabled (0 tokens)

**Use Case:** Reduce noise by filtering out very short messages like "Hi", "Ok", "Thanks!" while keeping substantive content that contributes to context.

## Feature Location in Settings

Settings Panel → Message Filtering Settings → Message Length Threshold (number input)

## Implementation Summary

| Aspect | Details |
|--------|---------|
| **Default Value** | 0 (disabled - no filtering) |
| **Settings Path** | `extension_settings.auto_recap.message_length_threshold` |
| **Setting Type** | Number (integer tokens) |
| **Valid Range** | 0 to ~5000 tokens |
| **UI Control** | Number input [data-testid="filter-message-length"] |
| **Core Filter Function** | `check_message_exclusion()` in memoryCore.js:42-92 |
| **Token Counting** | `count_tokens(text)` in utils.js:83-88 |

## Key Code Integration Points

1. **defaultSettings.js:49** - Default configuration
2. **memoryCore.js:85-89** - Token threshold check during filtering
3. **memoryCore.js:93-140** - Message inclusion flag updates
4. **settingsUI.js:88** - UI binding and event handling
5. **selectorsExtension.js:52** - DOM selector definition
6. **utils.js:83-88** - Token counting implementation

## How It Works

### Basic Flow

```
User sets threshold → Setting saved → User clicks "Refresh Memory" 
  → update_message_inclusion_flags() processes all messages
  → For each message: count_tokens() → compare to threshold
  → Messages < threshold: marked excluded (include = null)
  → Messages >= threshold: marked included (include = 'Recap of message(s)')
  → Visual indicators updated
  → Memory injection uses new flags
```

### Token Counting

The feature uses SillyTavern's tokenizer (selected LLM determines tokenization):
- Different LLM providers have different tokenization rules
- Average: ~4 characters per token
- Counts only message text (`message.mes`), not metadata or labels

### Tokenization Examples

Assuming Claude tokenizer:
- "Hi" = 1 token
- "Hello there!" = 2-3 tokens
- "How are you doing today?" = 4-5 tokens
- "Tell me about yourself in detail..." = 10-15 tokens

## Message Filtering Order

Messages are excluded if any of these conditions match (checked in order):
1. Is auto-recap system message?
2. Is marked as excluded?
3. Is user message with include_user_messages=false?
4. Is thought message?
5. Is system message with include_system_messages=false?
6. Is narrator message with include_narrator_messages=false?
7. Is character disabled?
8. **Is too short (token_size < threshold)?** ← THIS FEATURE
9. Otherwise: INCLUDE

## Settings Persistence

- **In-Memory Storage:** `extension_settings.auto_recap.message_length_threshold`
- **Browser Storage:** Persisted via saveSettingsDebounced() (debounced ~500ms)
- **Profile Support:** Can be overridden per profile
- **Survives:** Page reload, browser restart

## Interaction with Other Filters

The threshold filter works in combination with other message filtering options:
- **include_user_messages** - Include/exclude user messages
- **include_system_messages** - Include/exclude system messages
- **include_narrator_messages** - Include/exclude narrator messages
- **character_enabled** - Disable messages from specific characters

A message must pass ALL filters to be included in memory.

## Manual Refresh Required

**Important:** Changing the threshold value does NOT automatically re-evaluate all messages. Users must manually click the "Refresh Memory" button to apply the new threshold to existing messages.

## Performance Considerations

- Token counting is lightweight (delegates to SillyTavern's existing tokenizer)
- Only runs during manual refresh or other memory update operations
- Does not impact real-time message handling
- Threshold check is checked last in the filter chain (after cheaper filters)

## Related Features

- **Scene Recaps** - Generate summaries of scenes
- **Running Scene Recap** - Combine all scene recaps into narrative
- **Character-Specific Enable/Disable** - Filter messages by character
- **Include/Exclude Message Types** - Filter by message type

## Documentation Files

| File | Size | Purpose |
|------|------|---------|
| overview.md | 627 bytes | High-level feature description |
| implementation.md | 3.1 KB | Technical implementation details |
| data-flow.md | 4.7 KB | Operation flows with examples |
| README.md | This file | Documentation index and reference |

## For Developers

### Understanding the Code

Start with **implementation.md** for:
- Core component functions
- Settings storage structure
- Token counting system
- Message filtering pipeline

Then review **data-flow.md** for:
- Complete operation workflows
- Concrete examples with test data
- State transformations
- Integration points

### Making Changes

To modify this feature:
1. Update implementation.md if changing component behavior
2. Update data-flow.md if changing workflows
3. Update the relevant source files
4. Test with different threshold values
5. Verify against existing tests

### Related Code Locations

- **Filtering Logic:** `memoryCore.js:42-92`
- **Message Updates:** `memoryCore.js:93-140`
- **Token Counting:** `utils.js:83-88`
- **Default Settings:** `defaultSettings.js:49`
- **UI Binding:** `settingsUI.js:88`
- **DOM Selector:** `selectorsExtension.js:52`

## Testing Recommendations

- Test with threshold = 0 (all messages included)
- Test with threshold = 5 (filters short messages)
- Test with threshold = 20+ (filters most messages)
- Test in combination with other filters
- Test profile save/load with threshold
- Verify visual indicators update after refresh
- Verify memory injection uses correct messages

## Questions or Issues?

Refer to the detailed documentation:
- For "how does it work?" → implementation.md
- For "what happens when?" → data-flow.md
- For "what is this?" → overview.md

---

**Documentation Status:** Complete and production-ready
**Last Updated:** 2025-11-15
**Feature Status:** Implemented and tested

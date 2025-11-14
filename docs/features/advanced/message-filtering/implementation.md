# Message Filtering - Implementation Details

## Overview

The Message Filtering feature controls which messages are included in scene recaps. It provides granular control over message types, message length thresholds, and character-specific inclusion rules.

### Key Files

- memoryCore.js - Core exclusion checking and filtering logic
- defaultSettings.js - Default filter configuration
- settingsUI.js - Settings panel for filter controls
- autoSceneBreakDetection.js - Uses filters for scene detection
- index.js - Barrel exports for public filtering API

## Core Components

### memoryCore.js - check_message_exclusion()

Central exclusion checking function.

Input: Single message object from SillyTavern chat array
Output: Boolean (true = include, false = exclude)

Exclusion Criteria (in order):

1. Null Guard - Exclude null/undefined
2. Auto-Recap System Messages - Prevent recursion
3. Explicit Exclusion Flag - Manual exclusion
4. User Message Type - Check include_user_messages setting
5. Thought Messages - Always exclude
6. System Message Type - Check include_system_messages setting
7. Narrator Message Type - Check include_narrator_messages setting
8. Character Filtering - Check character enabled status
9. Message Length Threshold - Token count check

### defaultSettings.js - Filter Configuration

Default settings:

- include_user_messages: true (boolean)
- include_system_messages: true (boolean)
- include_narrator_messages: true (boolean)
- message_length_threshold: 0 (number, tokens)

### settingsUI.js - Filter Controls

UI elements:
- User message inclusion toggle
- System message inclusion toggle
- Narrator message inclusion toggle
- Message length threshold slider (0-100)

## Filter Mechanism

### Message Type Detection

- message.is_user - User-sent messages
- message.is_system - Hidden/system messages
- message.extra?.type - Narrator messages
- message.is_thoughts - Thought messages

### Length Threshold Logic

Token-based minimum filtering:
const token_size = count_tokens(message.mes);
if (token_size < get_settings('message_length_threshold')) {
  return false;
}

### Character-Level Filtering

Per-character enable/disable:
const char_key = get_character_key(message);
if (!character_enabled(char_key)) {
  return false;
}

## Integration Points

### Scene Recap Generation
const filtered = chat.filter(msg => check_message_exclusion(msg));
const prompt = buildSceneRecapPrompt(filtered);

### Memory Inclusion Flagging
for (let i = end; i >= 0; i--) {
  const message = chat[i];
  const include = check_message_exclusion(message);
  if (!include) {
    set_data(message, 'include', null);
  }
}

### Auto Scene Detection
const relevant = getRecentMessages()
  .filter(msg => check_message_exclusion(msg));
const prompt = buildDetectionPrompt(relevant);

## Settings Management

### Loading
const includeUserMessages = get_settings('include_user_messages');
const includeSystemMessages = get_settings('include_system_messages');
const includeNarratorMessages = get_settings('include_narrator_messages');
const lengthThreshold = get_settings('message_length_threshold');

### Storing
set_settings('include_user_messages', false);
set_settings('message_length_threshold', 5);

### Per-Profile
Filters can be overridden per configuration profile.

## Performance Considerations

### Token Counting Cost
Token counting is the most expensive operation. Criteria checked from cheapest (O(1)) to most expensive (O(length)).

### Optimization Strategies
1. Lazy Evaluation - Only count tokens if threshold enabled
2. Check Expensive Last - Booleans before token counting
3. Caching - Cache token counts on message objects

## Error Handling

### Missing Properties
Use optional chaining: message.extra?.type === NARRATOR

### Null/Undefined
Guard with: if (!message) return false;

### Token Counting Errors
Try/catch with default: try { tokenSize = count_tokens(...) } catch { tokenSize = 0; }

## Testing

### Unit Tests
- Exclude null messages
- Exclude disabled message types
- Filter by message length
- Character filtering

### Integration Tests
- Scene recap only includes filtered messages
- Memory inclusion uses correct filters
- Scene detection respects filters

### Manual Testing Checklist
- Enable/disable each filter type
- Set length threshold to 5 tokens
- Verify filters work with large chats (500+ messages)
- Verify settings persist across sessions
- Verify per-profile settings override globals

---

**Status:** Fully documented

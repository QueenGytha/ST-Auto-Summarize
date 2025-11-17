# Message Filtering - Data Flow

## Table of Contents

1. [Overview](#overview)
2. [Message Input Flow](#message-input-flow)
3. [Exclusion Check Flow](#exclusion-check-flow)
4. [Scene Recap Generation Flow](#scene-recap-generation-flow)
5. [Memory Inclusion Flow](#memory-inclusion-flow)
6. [Auto Scene Detection Flow](#auto-scene-detection-flow)
7. [Settings Change Flow](#settings-change-flow)
8. [Examples](#examples)

## Overview

This document traces the complete data flow for messages through the filtering system.

## Message Input Flow

User opens/creates chat
  -> SillyTavern loads chat.json
  -> ST populates context.chat array
  -> Extension initializes
  -> check_message_exclusion available globally

## Message Object Structure

Message objects contain:
- mes: The actual message text
- is_user: true if user-sent
- is_system: true if system/hidden
- send_date: Timestamp
- name: Speaker name
- extra: Metadata object with:
  - type: Message type (e.g., 'narrator')
  - 'ST-Auto-Summarize': Extension-specific data
    - memory: Recap text
    - include: Inclusion status
    - scene_recap_memory: Scene recap

## Exclusion Check Flow

For each message, check_message_exclusion() evaluates:

1. Is message null? -> EXCLUDE
2. Is auto-recap system message? -> EXCLUDE
3. Is exclude flag set? -> EXCLUDE
4. Is user message and include_user disabled? -> EXCLUDE
5. Is thought message? -> EXCLUDE
6. Is system message and include_system disabled? -> EXCLUDE
7. Is narrator message and include_narrator disabled? -> EXCLUDE
8. Is character disabled? -> EXCLUDE
9. Is token count below threshold? -> EXCLUDE
10. Else -> INCLUDE

## Batch Message Filtering

For each message in chat:
  if check_message_exclusion(message):
    add to filtered list
Return filtered list

## Scene Recap Generation Flow

User clicks Generate Scene Recap
  -> Extract message range [startIndex, endIndex]
  -> Filter messages using check_message_exclusion()
  -> Build scene recap prompt from filtered messages
  -> Call LLM to generate recap
  -> Store recap on message.extra
  -> Update UI

Code flow:
1. Get scene messages: chat.slice(startIndex, endIndex + 1)
2. Filter: sceneMessages.filter(msg => check_message_exclusion(msg))
3. Build prompt: buildSceneRecapPrompt(relevantMessages)
4. Call LLM: recap = await recap_text(prompt)
5. Store: set_data(chat[messageIndex], 'scene_recap_memory', recap)

## Memory Inclusion Flow

Chat loaded
  -> Extension initializes memory system
  -> update_message_inclusion_flags() called
  -> Iterate through chat in reverse
  -> For each message:
    - Check exclusion with check_message_exclusion()
    - Check if message has recap
    - Check token limit
    - Set include flag based on results
  -> update_all_message_visuals()

## Auto Scene Detection Flow

Message sent or queue processes auto-detection
  -> detectSceneBreak() called
  -> Get recent messages from chat
  -> Filter using check_message_exclusion()
  -> Build scene detection prompt
  -> Call LLM for analysis
  -> Check result: scene break or continue

## Settings Change Flow

User adjusts filter setting (e.g., "Include system messages")
  -> Setting change event fired
  -> set_settings() called with new value
  -> Settings saved to storage
  -> refresh_memory_debounced() triggered
  -> update_message_inclusion_flags() called
  -> Re-evaluate all messages with new setting
  -> Message visual indicators updated
  -> UI refreshed

## Data Transformation Example

Before filtering:
  [
    { mes: "Let's go", is_user: true },
    { mes: "I agree", is_user: false },
    { mes: "[SYSTEM] Injected", is_system: true },
    { mes: "!", is_user: true }
  ]

After filtering (system disabled, threshold=2 tokens):
  [
    { mes: "Let's go", is_user: true },
    { mes: "I agree", is_user: false }
  ]

Excluded:
  - System message (is_system: true, include_system: false)
  - "!" (1 token < 2 threshold)

## Scene Recap Example

Chat messages (indices 20-24):

20: User: "Let's explore the castle"
21: Char: "I've been here before"
22: [System]: "You have high courage"
23: User: "Wow!"
24: Char: "The throne room awaits"

Settings:
  include_user_messages: true
  include_system_messages: false
  message_length_threshold: 2

Filtering result:

Index | Message | Type | Tokens | Result
------|---------|------|--------|--------
20 | explore castle | User | 3 | INCLUDE
21 | been here | Char | 3 | INCLUDE
22 | high courage | System | 3 | EXCLUDE
23 | Wow! | User | 1 | EXCLUDE
24 | throne awaits | Char | 3 | INCLUDE

Filtered messages for recap:
  20: User: "Let's explore the castle"
  21: Char: "I've been here before"
  24: Char: "The throne room awaits"

## Memory Inclusion Example

Chat with 8 messages, token limit 150.

Processing in reverse order:
  - Include recent filtered messages within budget
  - Exclude system messages (setting disabled)
  - Exclude old messages (outside budget)

Final result:
  - Recent 3-4 messages flagged for inclusion
  - Older messages flagged for exclusion
  - UI updated to show inclusion status

## Integration Points

### Scene Recap Generation
  const filtered = chat.filter(msg => check_message_exclusion(msg));
  const prompt = buildSceneRecapPrompt(filtered);

### Memory Inclusion Flagging
  for each message in chat:
    if !check_message_exclusion(message):
      set_data(message, 'include', null)

### Auto Scene Detection
  const relevant = getRecentMessages()
                    .filter(msg => check_message_exclusion(msg));
  const prompt = buildDetectionPrompt(relevant);

---

**Status:** Fully documented - Data flow paths traced

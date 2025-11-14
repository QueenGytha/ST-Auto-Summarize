# Memory Injection Flow - Data Flow Documentation

This document traces the complete data flow for memory injection, from trigger event through to LLM prompt.

---

## Complete Injection Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TRIGGER EVENT                                   │
│  (CHAT_CHANGED, MESSAGE_SENT, MESSAGE_DELETED, MESSAGE_SWIPED, etc.)   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 v
┌─────────────────────────────────────────────────────────────────────────┐
│                       Event Handler (eventHandlers.js)                   │
│  - handleChatChanged()                                                   │
│  - handleMessageDeleted()                                                │
│  - handleMessageSwiped()                                                 │
│  - handleMessageSent()                                                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 v
                    ┌────────────────────────┐
                    │  refresh_memory()      │ (memoryCore.js:300)
                    │  or                    │
                    │  refresh_memory_       │ (debounced version)
                    │  debounced()           │
                    └────────┬───────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTO-HIDE OLD MESSAGES                                │
│  auto_hide_messages_by_command()                                        │
│  - Hides messages older than N scenes (if configured)                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 v
                    ┌────────────────────────┐
                    │  chat_enabled()        │ (settingsManager.js:202)
                    │  Check if injection    │
                    │  is enabled            │
                    └────────┬───────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
                v                         v
        ┌───────────┐            ┌──────────────┐
        │  DISABLED │            │   ENABLED    │
        └─────┬─────┘            └──────┬───────┘
              │                         │
              v                         v
    ┌──────────────────┐    ┌────────────────────────────┐
    │ Clear Injection  │    │ update_message_inclusion_  │
    │ setExtensionPrompt│   │ flags()                    │
    │ ("", ...)        │    │ (updates UI, not used for  │
    │ RETURN ""        │    │  actual injection)         │
    └──────────────────┘    └─────────────┬──────────────┘
                                          │
                                          v
                            ┌──────────────────────────────┐
                            │ get_running_recap_injection()│ (runningSceneRecap.js:621)
                            │ - Get current recap version  │
                            │ - Apply template formatting  │
                            └─────────────┬────────────────┘
                                          │
                                          v
                            ┌──────────────────────────────┐
                            │ TEMPLATE APPLICATION         │
                            │ template.replace(            │
                            │   /\{\{running_recap\}\}/g,  │
                            │   content                    │
                            │ )                            │
                            └─────────────┬────────────────┘
                                          │
                                          v
                            ┌──────────────────────────────┐
                            │ FORMATTED INJECTION TEXT     │
                            │ scene_injection =            │
                            │ "# Story Memory\n\n..."      │
                            └─────────────┬────────────────┘
                                          │
                                          v
┌─────────────────────────────────────────────────────────────────────────┐
│                    INJECTION REGISTRATION                                │
│  ctx.setExtensionPrompt(                                                │
│    `${MODULE_NAME}_scene`,        // key: "auto_recap_scene"           │
│    scene_injection,               // value: formatted text              │
│    scene_recap_position,          // position: 2 (IN_PROMPT)           │
│    scene_recap_depth,             // depth: 2                           │
│    scene_recap_scan,              // scan: false                        │
│    scene_recap_role               // role: 0 (SYSTEM)                   │
│  )                                                                       │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 v
                    ┌────────────────────────┐
                    │  STORE FOR LOGGING     │
                    │  last_scene_injection  │
                    │  = scene_injection     │
                    └────────┬───────────────┘
                             │
                             v
                    ┌────────────────────────┐
                    │  RETURN scene_injection│
                    └────────────────────────┘
```

---

## Data Flow Stages

### Stage 1: Event Trigger

**Input**: SillyTavern event (e.g., MESSAGE_SENT)
**Processing**: Event router dispatches to appropriate handler
**Output**: Call to `refresh_memory()` or `refresh_memory_debounced()`

**Example Data**:
```javascript
// Event: MESSAGE_SENT
event = "message_sent"
data = 42 // Message index
```

**Handler Selection**:
```javascript
const eventHandlers = {
  'chat_changed': handleChatChanged,
  'message_deleted': handleMessageDeleted,
  'message_swiped': handleMessageSwiped,
  'message_sent': handleMessageSent
};

const handler = eventHandlers[event]; // handleMessageSent
await handler(data); // Calls refresh_memory()
```

---

### Stage 2: Settings Retrieval

**Input**: None (reads from settings)
**Processing**: Load injection configuration settings
**Output**: Configuration values for injection

**Code** (memoryCore.js:303-307):
```javascript
const scene_recap_position = get_settings('running_scene_recap_position');
const scene_recap_role = get_settings('running_scene_recap_role');
const scene_recap_depth = get_settings('running_scene_recap_depth');
const scene_recap_scan = get_settings('running_scene_recap_scan');
```

**Example Values**:
```javascript
scene_recap_position = 2 // IN_PROMPT
scene_recap_role = 0     // SYSTEM
scene_recap_depth = 2    // Moderate depth
scene_recap_scan = false // Don't scan for world info
```

---

### Stage 3: Chat Enabled Check

**Input**: Current chat context
**Processing**: Check if injection is enabled for this chat
**Output**: Boolean (true = inject, false = skip)

**Code Flow**:
```javascript
// Step 1: Check global toggle
if (get_settings('use_global_toggle_state')) {
  return get_settings('global_toggle_state');
}

// Step 2: Check per-chat toggle
const chatId = getContext().chatId;
const perChatState = get_settings('chats_enabled')?.[chatId];

// Step 3: Fallback to default
return perChatState ?? get_settings('default_chat_enabled');
```

**Example Scenarios**:

**Scenario A: Global Toggle On**
```javascript
use_global_toggle_state = true
global_toggle_state = true
→ Result: true (all chats enabled)
```

**Scenario B: Per-Chat Disabled**
```javascript
use_global_toggle_state = false
chatId = "chat-123"
chats_enabled = {"chat-123": false}
→ Result: false (this chat disabled)
```

**Scenario C: Default Fallback**
```javascript
use_global_toggle_state = false
chatId = "chat-new"
chats_enabled = {} // No entry for chat-new
default_chat_enabled = true
→ Result: true (fallback to default)
```

---

### Stage 4: Early Exit (If Disabled)

**Input**: `chat_enabled() === false`
**Processing**: Clear injection and return
**Output**: Empty string

**Code** (memoryCore.js:313-316):
```javascript
if (!chat_enabled()) {
  ctx.setExtensionPrompt(`${MODULE_NAME}_scene`, "", extension_prompt_types.IN_PROMPT, 0);
  return "";
}
```

**Effect**: Removes any existing injection from SillyTavern's prompt builder.

---

### Stage 5: Message Inclusion Flags (UI Only)

**Input**: All messages in current chat
**Processing**: Mark messages for inclusion based on exclusion criteria and token limits
**Output**: Updated `include` flags on message objects

**Code Flow**:
```javascript
update_message_inclusion_flags() {
  // For each message (reverse order, newest to oldest)
  for (let i = end; i >= 0; i--) {
    const message = chat[i];

    // Check exclusion criteria
    const include = check_message_exclusion(message);
    if (!include) {
      set_data(message, 'include', null);
      continue;
    }

    // Check if message has recap and fits in token limit
    const memory = get_memory(message);
    if (!memory) {
      set_data(message, 'include', null);
      continue;
    }

    new_recap = concatenate_recap(recap, message);
    const token_size = count_tokens(new_recap);

    if (token_size > get_short_token_limit()) {
      // Reached token limit, stop including messages
      message_recap_limit_reached = true;
      set_data(message, 'include', null);
    } else {
      // Include this message recap
      set_data(message, 'include', 'Recap of message(s)');
      recap = new_recap;
    }
  }

  update_all_message_visuals(); // Update UI to show inclusion status
}
```

**Example Output**:
```javascript
// Message objects with updated flags
chat[10] → extra.auto_recap.include = null (excluded: too old)
chat[11] → extra.auto_recap.include = null (excluded: too old)
chat[12] → extra.auto_recap.include = 'Recap of message(s)' (included)
chat[13] → extra.auto_recap.include = 'Recap of message(s)' (included)
chat[14] → extra.auto_recap.include = 'Recap of message(s)' (included)
```

**NOTE**: These flags are NOT used for actual injection (only for UI display). The current implementation only injects running scene recaps.

---

### Stage 6: Running Recap Retrieval

**Input**: Current chat metadata
**Processing**: Get current running recap version and content
**Output**: Recap content string

**Code Flow**:
```javascript
function get_running_recap_injection() {
  // Step 1: Get current version
  const current = get_running_recap();
  if (!current || !current.content) {
    return ""; // No recap exists
  }

  // Step 2: Get template
  const template = get_settings('running_scene_recap_template') || "";
  if (!template.trim()) {
    return current.content; // No template, return raw content
  }

  // Step 3: Apply template
  return template.replace(/\{\{running_recap\}\}/g, current.content);
}
```

**Data Flow**:
```javascript
// Input: chat_metadata.auto_recap_running_scene_recaps
{
  current_version: 2,
  versions: [
    {
      version: 0,
      content: "## Characters\nAlice: Warrior...",
      timestamp: 1704067200000,
      scene_count: 3,
      excluded_count: 1
    },
    {
      version: 1,
      content: "## Characters\nAlice: Warrior, injured...",
      timestamp: 1704153600000,
      scene_count: 4,
      excluded_count: 1
    },
    {
      version: 2,
      content: "## Characters\nAlice: Warrior, recovered...",
      timestamp: 1704240000000,
      scene_count: 5,
      excluded_count: 1
    }
  ]
}

// Step 1: Get current version (version 2)
current = {
  version: 2,
  content: "## Characters\nAlice: Warrior, recovered...",
  timestamp: 1704240000000,
  scene_count: 5,
  excluded_count: 1
}

// Step 2: Get template
template = `# Story Memory

The following is a cumulative memory of key scenes and developments from the roleplay so far.

{{running_recap}}`

// Step 3: Apply template
result = template.replace(/\{\{running_recap\}\}/g, current.content)

// Output:
`# Story Memory

The following is a cumulative memory of key scenes and developments from the roleplay so far.

## Characters
Alice: Warrior, recovered...`
```

---

### Stage 7: Injection Registration

**Input**: Formatted injection text + settings
**Processing**: Register extension prompt with SillyTavern
**Output**: Injection registered in ST's prompt builder

**Code** (memoryCore.js:331):
```javascript
ctx.setExtensionPrompt(
  `${MODULE_NAME}_scene`,  // key
  scene_injection,          // value
  scene_recap_position,     // position
  scene_recap_depth,        // depth
  scene_recap_scan,         // scan
  scene_recap_role          // role
);
```

**Example Call**:
```javascript
ctx.setExtensionPrompt(
  "auto_recap_scene",          // Unique key for this extension
  "# Story Memory\n\n...",      // Formatted memory text (200-2000 chars typical)
  2,                            // Position: IN_PROMPT (system prompt area)
  2,                            // Depth: 2 (moderate depth)
  false,                        // Scan: false (don't trigger world info)
  0                             // Role: SYSTEM (system message role)
);
```

**Effect**: SillyTavern's prompt builder now has this extension prompt registered and will include it in the next LLM call.

---

### Stage 8: Logging and Return

**Input**: Formatted injection text
**Processing**: Store for later logging, return value
**Output**: Injection text returned to caller

**Code** (memoryCore.js:327-333):
```javascript
// Store for later logging
last_scene_injection = scene_injection;

// Only inject scene recaps (message recaps are NOT injected)
ctx.setExtensionPrompt(...);

return scene_injection; // return the scene injection
```

**Logging Usage** (eventHandlers.js:196-201):
```javascript
function handleMessageSent() {
  if (!chat_enabled()) {return;}
  if (last_scene_injection) {
    debug(`[MEMORY INJECTION] scene_injection:\n${last_scene_injection}`);
  }
}
```

**Example Log Output**:
```
[MEMORY INJECTION] scene_injection:
# Story Memory

The following is a cumulative memory of key scenes and developments from the roleplay so far.

## Characters
Alice: Warrior princess, currently recovering from battle wounds...

## Locations
Kingdom of Light: The capital where Alice resides...

## Recent Developments
- Battle with dark forces concluded
- Alice sustained injuries but is healing
- Peace treaty negotiations beginning
```

---

## Data Structures

### Running Recap Storage

**Location**: `chat_metadata.auto_recap_running_scene_recaps`

**Structure**:
```typescript
interface RunningSceneRecapStorage {
  current_version: number;                  // Currently active version
  versions: RunningSceneRecapVersion[];     // All versions
}

interface RunningSceneRecapVersion {
  version: number;        // Auto-incremented version number
  timestamp: number;      // Unix timestamp (milliseconds)
  content: string;        // The actual combined narrative text
  scene_count: number;    // How many scenes were included
  excluded_count: number; // How many latest scenes were excluded
}
```

**Example**:
```javascript
{
  current_version: 2,
  versions: [
    {
      version: 0,
      timestamp: 1704067200000,
      content: "## Characters\nAlice: Warrior princess...",
      scene_count: 3,
      excluded_count: 1
    },
    {
      version: 1,
      timestamp: 1704153600000,
      content: "## Characters\nAlice: Warrior, injured...",
      scene_count: 4,
      excluded_count: 1
    },
    {
      version: 2,
      timestamp: 1704240000000,
      content: "## Characters\nAlice: Warrior, recovered...",
      scene_count: 5,
      excluded_count: 1
    }
  ]
}
```

### Message Inclusion Flags (UI Only)

**Location**: `message.extra.auto_recap.include`

**Values**:
- `'Recap of message(s)'` - Message is included in short-term memory (UI display only)
- `null` or `undefined` - Message is excluded

**Example Message Object**:
```javascript
{
  mes: "Alice draws her sword...",
  is_user: false,
  extra: {
    auto_recap: {
      memory: "Alice engaged in combat...",
      include: 'Recap of message(s)',  // UI display flag
      // ... other metadata ...
    }
  }
}
```

### Extension Prompt Registry

**Location**: `context.extensionPrompts` (SillyTavern internal)

**Structure**:
```javascript
{
  "auto_recap_scene": {
    value: "# Story Memory\n\nThe following is...",
    position: 2,
    depth: 2,
    scan: false,
    role: 0
  }
  // ... other extension prompts ...
}
```

---

## Edge Cases and Error Handling

### Case 1: No Running Recap Exists

**Scenario**: New chat with no scene recaps generated yet

**Flow**:
```javascript
get_running_recap_injection() {
  const current = get_running_recap();
  // current = null (no versions exist)

  if (!current || !current.content) {
    return ""; // Return empty string
  }
  // ... rest not executed ...
}

// In refresh_memory():
scene_injection = ""; // Empty string

// Registration still happens:
ctx.setExtensionPrompt("auto_recap_scene", "", 2, 2, false, 0);

// SillyTavern ignores empty extension prompts (no injection occurs)
```

### Case 2: Template is Empty

**Scenario**: User cleared the template setting

**Flow**:
```javascript
get_running_recap_injection() {
  const current = get_running_recap();
  // current exists with content

  const template = get_settings('running_scene_recap_template') || "";
  // template = ""

  if (!template.trim()) {
    return current.content; // Return raw content, no template
  }
  // ... rest not executed ...
}

// Result: Raw recap content injected without formatting
```

### Case 3: Chat Disabled Mid-Conversation

**Scenario**: User disables extension while chat is open

**Flow**:
```javascript
// User clicks toggle to disable
set_settings('chats_enabled', {
  ...get_settings('chats_enabled'),
  [chatId]: false
});

// Next event (e.g., MESSAGE_SENT) triggers refresh_memory()

refresh_memory() {
  // ... get settings ...

  if (!chat_enabled()) { // Returns false
    // Clear injection immediately
    ctx.setExtensionPrompt("auto_recap_scene", "", extension_prompt_types.IN_PROMPT, 0);
    return "";
  }
  // ... rest not executed ...
}

// Next LLM call has no memory injection
```

### Case 4: Debounced Refresh During Rapid Events

**Scenario**: User rapidly swipes through responses

**Flow**:
```javascript
// Swipe 1
handleMessageSwiped() {
  refresh_memory_debounced(); // Schedule refresh in 300ms
}

// Swipe 2 (50ms later)
handleMessageSwiped() {
  refresh_memory_debounced(); // Cancel previous, schedule new refresh in 300ms
}

// Swipe 3 (50ms later)
handleMessageSwiped() {
  refresh_memory_debounced(); // Cancel previous, schedule new refresh in 300ms
}

// 300ms after last swipe: refresh_memory() executes ONCE
// Result: Only one refresh instead of three, improving performance
```

---

## Performance Characteristics

### Memory Refresh Timing

**Typical Execution Time**: 5-20ms (without LLM calls)

**Breakdown**:
- Settings retrieval: <1ms
- Chat enabled check: <1ms
- Message inclusion flags: 2-10ms (depends on chat length)
- Running recap retrieval: <1ms
- Template application: <1ms
- Injection registration: <1ms

**Note**: `update_message_inclusion_flags()` is the slowest part due to token counting, but results are currently unused for injection.

### Token Counting Overhead

```javascript
// For each message in chat:
const token_size = count_tokens(new_recap);

// If chat has 100 messages with recaps:
// 100 token counting calls per refresh
// At ~2-5ms per call = 200-500ms total

// Optimization: Skip this if not using individual recaps
```

### Debouncing Savings

**Without Debouncing** (10 rapid swipes):
```
Swipe 1 → refresh_memory() (20ms)
Swipe 2 → refresh_memory() (20ms)
Swipe 3 → refresh_memory() (20ms)
...
Swipe 10 → refresh_memory() (20ms)
Total: 200ms
```

**With Debouncing** (10 rapid swipes):
```
Swipe 1 → schedule refresh
Swipe 2 → cancel, reschedule
Swipe 3 → cancel, reschedule
...
Swipe 10 → cancel, reschedule
300ms later → refresh_memory() (20ms)
Total: 20ms (90% reduction)
```

---

## Summary

The Memory Injection Flow data flow follows this path:

1. **Event** → Handler function
2. **Handler** → `refresh_memory()` call
3. **Settings** → Load injection configuration
4. **Enable Check** → Verify injection should occur
5. **Early Exit** → Clear injection if disabled
6. **Message Flags** → Update UI inclusion flags (unused for injection)
7. **Recap Retrieval** → Get current running recap version
8. **Template Application** → Format recap with template
9. **Injection Registration** → Register with SillyTavern via `setExtensionPrompt()`
10. **Logging** → Store for debug output
11. **Return** → Complete flow

The system is optimized with debouncing for frequent events and uses SillyTavern's extension prompt system for clean integration with the core prompt building pipeline.

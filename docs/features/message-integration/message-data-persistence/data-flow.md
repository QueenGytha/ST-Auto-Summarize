# Message Data Persistence - Data Flow

## Overview

This document traces the complete data flow for message persistence operations, from initial write to backend storage and subsequent retrieval. It covers normal operations, swipe handling, chat save/load cycles, and error scenarios.

## Core Data Flow Patterns

### Pattern 1: Single Data Write

**Scenario**: Extension generates a recap and stores it on a message.

```
Operation Handler
    ↓
set_data(message, 'memory', 'Recap text...')
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ set_data() Function                                             │
│                                                                 │
│ 1. Initialize message.extra if needed                          │
│    if (!message.extra) message.extra = {}                      │
│                                                                 │
│ 2. Initialize extension namespace                              │
│    if (!message.extra[MODULE_NAME])                            │
│      message.extra[MODULE_NAME] = {}                           │
│                                                                 │
│ 3. Store data                                                  │
│    message.extra[MODULE_NAME][key] = value                     │
│                                                                 │
│ 4. Sync to current swipe                                       │
│    if (message.swipe_id && message.swipe_info?.[swipe_id]) {   │
│      message.swipe_info[swipe_id].extra[MODULE_NAME] =         │
│        structuredClone(message.extra[MODULE_NAME])             │
│    }                                                            │
│                                                                 │
│ 5. Trigger debounced save                                      │
│    if (ctx?.chat && ctx?.chatId) saveChatDebounced()           │
└─────────────────────────────────────────────────────────────────┘
    ↓
saveChatDebounced() [1000ms debounce timer starts]
    ↓
[Other operations may happen during debounce period]
    ↓
[1000ms elapsed]
    ↓
getContext().saveChat()
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ SillyTavern Save Process                                        │
│                                                                 │
│ 1. Serialize chat array to JSON                                │
│    JSON.stringify(chat) → includes all message.extra data      │
│                                                                 │
│ 2. POST /api/chats/save                                        │
│    { chat_id: "...", messages: [...] }                         │
│                                                                 │
│ 3. Backend writes to file                                      │
│    chats/Character - timestamp.jsonl                           │
└─────────────────────────────────────────────────────────────────┘
    ↓
Data persisted to disk
```

### Pattern 2: Batch Data Write

**Scenario**: Extension updates multiple related data keys in quick succession.

```
Operation Handler
    ↓
set_data(message, 'memory', 'Recap...')        [T=0ms]
    ↓ [Debounce timer starts: 1000ms]
set_data(message, 'include', 'Recap of...')    [T=10ms]
    ↓ [Debounce timer resets: 1000ms]
set_data(message, 'error', null)               [T=20ms]
    ↓ [Debounce timer resets: 1000ms]
set_data(message, 'reasoning', '...')          [T=30ms]
    ↓ [Debounce timer resets: 1000ms]

[No more writes for 1000ms]
    ↓
[T=1030ms] Timer fires → getContext().saveChat()
    ↓
Single save operation for all 4 writes
```

**Key Point**: Debouncing batches multiple writes into a single backend save, improving performance.

### Pattern 3: Data Read

**Scenario**: Extension retrieves stored recap data.

```
Memory Core / UI Component
    ↓
get_data(message, 'memory')
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ get_data() Function                                             │
│                                                                 │
│ return message?.extra?.[MODULE_NAME]?.[key]                     │
│   → Safe navigation with optional chaining                      │
│   → Returns undefined if any part of path is missing            │
└─────────────────────────────────────────────────────────────────┘
    ↓
Returns: 'Recap...' or undefined
```

## Complete Operation Flows

### Flow 1: Recap Generation and Storage

```
[User sends message]
    ↓
eventHandlers.js: MESSAGE_SENT event
    ↓
queueIntegration.js: enqueueRecapOperation()
    ↓
operationQueue.js: Queue operation
    ↓
[Queue processor picks up operation]
    ↓
operationHandlers.js: handleRecapOperation()
    ↓
llmClient.js: Call LLM to generate recap
    ↓
[LLM returns recap text]
    ↓
operationHandlers.js: Parse response
    ↓
set_data(message, 'memory', recapText)          ← WRITE
set_data(message, 'reasoning', reasoningText)   ← WRITE
set_data(message, 'prefill', prefillText)       ← WRITE
set_data(message, 'error', null)                ← WRITE
    ↓
[Each set_data triggers swipe sync and saveChatDebounced]
    ↓
[1000ms debounce period]
    ↓
getContext().saveChat()
    ↓
POST /api/chats/save
    ↓
Backend: chats/Chat.jsonl updated
    ↓
memoryCore.js: update_message_inclusion_flags()
    ↓
set_data(message, 'include', 'Recap of message(s)')  ← WRITE
    ↓
[1000ms debounce period]
    ↓
getContext().saveChat()
    ↓
messageVisuals.js: update_message_visuals()
    ↓
get_data(message, 'memory')                     ← READ
get_data(message, 'include')                    ← READ
get_data(message, 'reasoning')                  ← READ
    ↓
Display recap below message with color coding
```

### Flow 2: Scene Break Detection and Storage

```
[Auto scene break detection triggered]
    ↓
autoSceneBreakDetection.js: detectSceneBreak()
    ↓
llmClient.js: Call LLM with message range
    ↓
[LLM returns sceneBreakAt: 42]
    ↓
autoSceneBreakDetection.js: validateSceneBreakResponse()
    ↓
sceneBreak.js: toggleSceneBreak(42)
    ↓
set_data(message[42], 'scene_break', true)              ← WRITE
set_data(message[42], 'scene_break_visible', true)      ← WRITE
    ↓
[Mark messages as checked]
for (i = startIndex; i <= 42; i++) {
  set_data(message[i], 'auto_scene_break_checked', true)  ← WRITE (multiple)
}
    ↓
[1000ms debounce period - batches ALL writes]
    ↓
getContext().saveChat()
    ↓
sceneBreak.js: renderAllSceneBreaks()
    ↓
get_data(message[42], 'scene_break')             ← READ
get_data(message[42], 'scene_break_visible')     ← READ
get_data(message[42], 'scene_break_name')        ← READ
    ↓
Render scene break UI
```

### Flow 3: Scene Recap Generation and Versioning

```
[User clicks "Generate Scene Recap" on scene break]
    ↓
sceneBreak.js: generateSceneRecap(messageIndex)
    ↓
llmClient.js: Call LLM with scene range
    ↓
[LLM returns scene recap text]
    ↓
sceneBreak.js: saveSceneRecap()
    ↓
const versions = get_data(message, 'scene_recap_versions') ?? []  ← READ
    ↓
versions.push({
  version: versions.length,
  timestamp: Date.now(),
  content: recapText,
  metadata: { /* generation settings */ }
})
    ↓
set_data(message, 'scene_recap_versions', versions)     ← WRITE
set_data(message, 'scene_recap_current_index', versions.length - 1) ← WRITE
set_data(message, 'scene_recap_memory', recapText)      ← WRITE
set_data(message, 'scene_recap_hash', hash(recapText))  ← WRITE
    ↓
[1000ms debounce period]
    ↓
getContext().saveChat()
    ↓
queueIntegration.js: queueCombineSceneWithRunning()
    ↓
[Queue combines scene recap with running recap]
    ↓
runningSceneRecap.js: combine_scene_with_running_recap()
    ↓
chat_metadata.auto_recap_running_scene_recaps updated
    ↓
saveMetadata()
```

## Swipe Data Flow

### Flow 4: Swipe Synchronization

```
[Message has 3 swipes: current swipe_id = 1]
    ↓
set_data(message, 'memory', 'New recap for swipe 1')
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ set_data() Swipe Sync Logic                                     │
│                                                                 │
│ 1. Update main storage                                         │
│    message.extra[MODULE_NAME].memory = 'New recap...'          │
│                                                                 │
│ 2. Check for current swipe                                     │
│    swipe_index = message.swipe_id → 1                          │
│    if (swipe_index && message.swipe_info?.[1]) {               │
│                                                                 │
│ 3. Deep clone ALL extension data to swipe                      │
│    message.swipe_info[1].extra[MODULE_NAME] =                  │
│      structuredClone(message.extra[MODULE_NAME])               │
│                                                                 │
│    Result:                                                      │
│    message.swipe_info[1].extra.auto_recap_memory = {           │
│      memory: 'New recap for swipe 1',                          │
│      include: 'Recap of message(s)',  // Also copied           │
│      error: null,                     // Also copied           │
│      // ... all other keys                                     │
│    }                                                            │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
    ↓
saveChatDebounced()
    ↓
Backend save includes:
  - message.extra[MODULE_NAME] (main storage)
  - message.swipe_info[0].extra[MODULE_NAME] (swipe 0 data)
  - message.swipe_info[1].extra[MODULE_NAME] (swipe 1 data - just updated)
  - message.swipe_info[2].extra[MODULE_NAME] (swipe 2 data)
```

### Flow 5: Swipe Switching

```
[Current swipe_id = 1, user swipes right to swipe_id = 2]
    ↓
SillyTavern updates message.swipe_id = 2
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Current State:                                                  │
│                                                                 │
│ message.extra[MODULE_NAME].memory = 'Recap for swipe 1'        │
│   (NOT automatically updated by ST)                             │
│                                                                 │
│ message.swipe_info[2].extra[MODULE_NAME].memory                 │
│   = 'Recap for swipe 2' (stored separately)                    │
│                                                                 │
│ message.swipe_id = 2                                            │
└─────────────────────────────────────────────────────────────────┘
    ↓
User action triggers memory display update
    ↓
messageVisuals.js: update_message_visuals()
    ↓
get_data(message, 'memory')  ← READ
    ↓
Returns: 'Recap for swipe 1' (OLD DATA from previous swipe!)
    ↓
[Display shows wrong recap briefly]
    ↓
[User regenerates recap or next set_data() overwrites]
    ↓
set_data(message, 'memory', 'Recap for swipe 2')
    ↓
message.extra[MODULE_NAME].memory = 'Recap for swipe 2'
message.swipe_info[2].extra[MODULE_NAME] = structuredClone(...)
    ↓
[Now displays correct recap]
```

**Key Point**: Swipe data is isolated per swipe, but main storage (`message.extra`) may briefly show stale data when switching swipes until next write occurs.

### Flow 6: Accessing Previous Swipe Data

```
[User is on swipe 2, wants to compare with swipe 1]
    ↓
get_previous_swipe_memory(message, 'memory')  ← READ
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ get_previous_swipe_memory() Logic                               │
│                                                                 │
│ 1. Check if swipe exists                                       │
│    if (!message.swipe_id) return null                          │
│                                                                 │
│ 2. Access previous swipe index                                 │
│    prevIndex = message.swipe_id - 1  → 2 - 1 = 1               │
│                                                                 │
│ 3. Safely navigate to swipe data                               │
│    return message?.swipe_info?.[1]?.extra                       │
│           ?.[MODULE_NAME]?.['memory']                           │
│                                                                 │
│    Returns: 'Recap for swipe 1'                                │
└─────────────────────────────────────────────────────────────────┘
```

## Chat Lifecycle Data Flow

### Flow 7: Chat Save

```
[Extension has modified message data]
    ↓
set_data(message, 'memory', '...')
    ↓
saveChatDebounced() scheduled
    ↓
[1000ms debounce period]
    ↓
getContext().saveChat()
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ SillyTavern Chat Save Process                                   │
│                                                                 │
│ 1. Collect chat data                                           │
│    const chat = context.chat                                    │
│    const chatId = context.chatId                                │
│                                                                 │
│ 2. Serialize to JSON                                           │
│    const json = JSON.stringify({                                │
│      chat_id: chatId,                                           │
│      messages: chat.map(msg => ({                               │
│        mes: msg.mes,                                            │
│        is_user: msg.is_user,                                    │
│        extra: msg.extra,  ← Includes all extension data        │
│        swipe_info: msg.swipe_info,  ← Includes swipe data      │
│        // ... other message properties                          │
│      }))                                                        │
│    })                                                           │
│                                                                 │
│ 3. POST to backend                                             │
│    fetch('/api/chats/save', {                                   │
│      method: 'POST',                                            │
│      body: json                                                 │
│    })                                                           │
└─────────────────────────────────────────────────────────────────┘
    ↓
Backend receives POST /api/chats/save
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Backend Save Process                                            │
│                                                                 │
│ 1. Parse request                                               │
│    const { chat_id, messages } = req.body                       │
│                                                                 │
│ 2. Determine file path                                         │
│    const filePath = path.join(                                  │
│      chatsPath,                                                 │
│      `${chat_id}.jsonl`                                         │
│    )                                                            │
│                                                                 │
│ 3. Write to file (JSONL format)                                │
│    messages.forEach(msg => {                                    │
│      fs.appendFileSync(filePath, JSON.stringify(msg) + '\n')   │
│    })                                                           │
│                                                                 │
│ 4. Return success                                              │
│    res.json({ success: true })                                  │
└─────────────────────────────────────────────────────────────────┘
    ↓
File on disk:
  chats/Character - 2025-01-13@12h30m45s.jsonl
    Contains all message data including message.extra[MODULE_NAME]
```

### Flow 8: Chat Load

```
[User opens chat]
    ↓
SillyTavern loads chat
    ↓
GET /api/chats/load?id=Character%20-%202025-01-13@12h30m45s
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Backend Load Process                                            │
│                                                                 │
│ 1. Parse chat_id from query                                    │
│    const chatId = req.query.id                                  │
│                                                                 │
│ 2. Determine file path                                         │
│    const filePath = path.join(                                  │
│      chatsPath,                                                 │
│      `${chatId}.jsonl`                                          │
│    )                                                            │
│                                                                 │
│ 3. Read file (JSONL format)                                    │
│    const lines = fs.readFileSync(filePath, 'utf8')             │
│                  .split('\n')                                   │
│                  .filter(line => line.trim())                   │
│                                                                 │
│ 4. Parse each line as JSON                                     │
│    const messages = lines.map(line => JSON.parse(line))        │
│                                                                 │
│ 5. Return messages                                             │
│    res.json({ messages })                                       │
└─────────────────────────────────────────────────────────────────┘
    ↓
SillyTavern receives response
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ SillyTavern Chat Load Process                                   │
│                                                                 │
│ 1. Parse response                                              │
│    const { messages } = await res.json()                        │
│                                                                 │
│ 2. Populate context.chat                                       │
│    context.chat = messages                                      │
│      → Each message includes message.extra[MODULE_NAME]         │
│      → Each message includes message.swipe_info with swipe data │
│                                                                 │
│ 3. Trigger CHAT_CHANGED event                                  │
│    eventSource.emit(event_types.CHAT_CHANGED)                   │
└─────────────────────────────────────────────────────────────────┘
    ↓
eventHandlers.js: handleChatChanged()
    ↓
refresh_memory()
    ↓
memoryCore.js: update_message_inclusion_flags()
    ↓
for (const message of chat) {
  const memory = get_data(message, 'memory')  ← READ (from loaded data)
  if (memory) {
    set_data(message, 'include', 'Recap of message(s)')  ← WRITE
  }
}
    ↓
messageVisuals.js: update_all_message_visuals()
    ↓
for (const message of chat) {
  const memory = get_data(message, 'memory')     ← READ
  const include = get_data(message, 'include')   ← READ
  const error = get_data(message, 'error')       ← READ
  displayRecapBelowMessage(memory, include, error)
}
```

## Error Scenarios

### Scenario 1: Save Failure

```
set_data(message, 'memory', '...')
    ↓
saveChatDebounced() scheduled
    ↓
[1000ms debounce]
    ↓
getContext().saveChat()
    ↓
POST /api/chats/save
    ↓
[Backend error: disk full, permission denied, etc.]
    ↓
SillyTavern error handler
    ↓
toastr.error('Failed to save chat')
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Data State:                                                     │
│                                                                 │
│ In-Memory: message.extra[MODULE_NAME].memory = 'New recap...'  │
│   (Data exists in browser)                                      │
│                                                                 │
│ On-Disk: message.extra[MODULE_NAME].memory = 'Old recap...'    │
│   (File was not updated)                                        │
│                                                                 │
│ Risk: If user closes browser, new data is LOST                 │
└─────────────────────────────────────────────────────────────────┘
```

**Mitigation**: SillyTavern typically retries failed saves automatically.

### Scenario 2: Missing Chat Context

```
Extension loads during page initialization
    ↓
set_data(message, 'memory', '...')
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ set_data() Context Check                                        │
│                                                                 │
│ const ctx = getContext()                                        │
│   → ctx = undefined (not initialized yet)                       │
│                                                                 │
│ if (ctx?.chat && ctx?.chatId) {                                 │
│   saveChatDebounced()  ← NOT CALLED                            │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Data State:                                                     │
│                                                                 │
│ In-Memory: message.extra[MODULE_NAME].memory = 'New recap...'  │
│   (Data exists in browser)                                      │
│                                                                 │
│ On-Disk: No file yet (chat not loaded)                         │
│                                                                 │
│ Risk: Data will be lost if page reloads before chat loads      │
└─────────────────────────────────────────────────────────────────┘
```

**Mitigation**: Extension code should only call `set_data()` after verifying chat is loaded.

### Scenario 3: Debounce Interrupt

```
set_data(message, 'memory', 'Version 1')
    ↓
saveChatDebounced() scheduled [1000ms timer]
    ↓
[500ms elapsed]
    ↓
User closes browser
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Data State:                                                     │
│                                                                 │
│ In-Memory: message.extra[MODULE_NAME].memory = 'Version 1'     │
│   (Data exists in browser)                                      │
│                                                                 │
│ On-Disk: message.extra[MODULE_NAME].memory = 'Old version'     │
│   (Save was never triggered - timer didn't fire)               │
│                                                                 │
│ Result: Data LOST                                               │
└─────────────────────────────────────────────────────────────────┘
    ↓
Next page load
    ↓
get_data(message, 'memory')
    ↓
Returns: 'Old version' (new data was never saved)
```

**Mitigation**:
- Use shorter debounce timeout for critical data
- Implement `beforeunload` handler to flush pending saves
- SillyTavern typically saves on page unload

## Cross-Feature Data Flows

### Flow 9: Memory Injection Pipeline

```
[User sends message → LLM generation triggered]
    ↓
generateRawInterceptor.js: Intercepts generateRaw() call
    ↓
memoryCore.js: refresh_memory()
    ↓
update_message_inclusion_flags()
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ For each message in chat (reverse order):                       │
│                                                                 │
│ 1. Read stored recap                                           │
│    const memory = get_data(message, 'memory')  ← READ          │
│                                                                 │
│ 2. Check exclusion criteria                                    │
│    const exclude = get_data(message, 'exclude')  ← READ        │
│    if (exclude) continue                                        │
│                                                                 │
│ 3. Calculate token budget                                      │
│    totalTokens += count_tokens(memory)                          │
│    if (totalTokens > limit) break                               │
│                                                                 │
│ 4. Mark for inclusion                                          │
│    set_data(message, 'include', 'Recap of message(s)')  ← WRITE │
│                                                                 │
│ 5. Concatenate into injection text                             │
│    injectionText += memory + '\n'                               │
└─────────────────────────────────────────────────────────────────┘
    ↓
runningSceneRecap.js: get_running_recap_injection()
    ↓
const runningRecap = get_current_running_recap_content()  ← READ from chat_metadata
    ↓
Combine message recaps + scene recaps + running recap
    ↓
ctx.setExtensionPrompt('auto_recap_memory_scene', combinedText, ...)
    ↓
[Injected text is sent to LLM along with current message]
```

### Flow 10: Scene Navigator Data Access

```
[User opens scene navigator]
    ↓
sceneNavigator.js: renderSceneNavigatorBar()
    ↓
const chat = getContext().chat
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ For each message in chat:                                       │
│                                                                 │
│ 1. Check if scene break                                        │
│    const isSceneBreak = get_data(msg, 'scene_break')  ← READ   │
│    if (!isSceneBreak) continue                                  │
│                                                                 │
│ 2. Check visibility                                            │
│    const visible = get_data(msg, 'scene_break_visible')  ← READ │
│    if (!visible) continue                                       │
│                                                                 │
│ 3. Get scene name                                              │
│    const name = get_data(msg, 'scene_break_name')  ← READ      │
│    const displayName = name || `Scene ${sceneIndex}`            │
│                                                                 │
│ 4. Build navigation item                                       │
│    scenes.push({                                                │
│      index: i,                                                  │
│      name: displayName,                                         │
│      messageCount: calculateMessageCount(i)                     │
│    })                                                           │
└─────────────────────────────────────────────────────────────────┘
    ↓
Render navigation bar with scene links
    ↓
[User clicks scene link]
    ↓
scrollToMessage(sceneIndex)
```

### Flow 11: Clear All Recaps Operation

```
[User clicks "Clear All Recaps" button]
    ↓
memoryCore.js: clear_all_recaps_for_chat()
    ↓
const chat = getContext().chat
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ For each message in chat:                                       │
│                                                                 │
│ 1. Check if extension data exists                              │
│    const moduleData = message?.extra?.[MODULE_NAME]  ← READ    │
│    if (!moduleData) continue                                    │
│                                                                 │
│ 2. Delete entire namespace                                     │
│    delete message.extra[MODULE_NAME]  ← DELETE                 │
│                                                                 │
│ 3. Clean up empty extra object                                 │
│    if (message.extra && Object.keys(message.extra).length === 0) { │
│      delete message.extra                                       │
│    }                                                            │
│                                                                 │
│ 4. Clear lorebook entries                                      │
│    delete message.extra.activeLorebookEntries                   │
│    delete message.extra.inactiveLorebookEntries                 │
│                                                                 │
│ 5. Clear swipe data                                            │
│    for (const swipe of message.swipe_info ?? []) {             │
│      delete swipe.extra?.[MODULE_NAME]  ← DELETE               │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
    ↓
clear_running_scene_recaps()
    ↓
delete chat_metadata.auto_recap_running_scene_recaps
    ↓
clearActiveLorebooksData()
    ↓
saveChatDebounced()
    ↓
saveMetadata()
    ↓
update_all_message_visuals()
    ↓
[All recap data removed from UI and backend]
```

## Performance Characteristics

### Write Performance

**Single write operation**:
```
Operation                         Time    Notes
─────────────────────────────────────────────────────────────
Initialize message.extra          <1ms    Only if needed
Initialize MODULE_NAME            <1ms    Only if needed
Store value                       <1ms    Direct assignment
structuredClone() (small data)    0.1ms   Typical recap (~500B)
structuredClone() (large data)    5ms     Scene recap with versions (~50KB)
saveChatDebounced() schedule      <1ms    Just schedules, doesn't execute
─────────────────────────────────────────────────────────────
Total per write                   ~5-10ms Worst case (large data)
```

**Batch write performance** (4 writes in 100ms):
```
Without debouncing:    4 backend saves = ~400ms total
With debouncing:       1 backend save  = ~100ms total
Improvement:           75% reduction in save overhead
```

### Read Performance

**Single read operation**:
```
Operation                         Time    Notes
─────────────────────────────────────────────────────────────
Optional chaining navigation      <0.1ms  Pure JavaScript
Return value                      <0.1ms  Direct reference
─────────────────────────────────────────────────────────────
Total per read                    <0.2ms  Negligible overhead
```

### Memory Overhead

**Per-message storage** (typical recap):
```
Component                         Size     Notes
─────────────────────────────────────────────────────────────
message.extra[MODULE_NAME]        ~500B    Main storage
Swipe 0 data                      ~500B    First response
Swipe 1 data                      ~500B    Second response
─────────────────────────────────────────────────────────────
Total (2 swipes)                  ~1.5KB   Per message
```

**Chat with 500 messages**:
```
500 messages × 1.5KB = 750KB total extension data
```

**Scene recap storage** (with versions):
```
Component                         Size     Notes
─────────────────────────────────────────────────────────────
scene_recap_memory                ~2KB     Current recap
scene_recap_versions (5 versions) ~10KB    Version history
scene_recap_metadata              ~500B    Generation settings
─────────────────────────────────────────────────────────────
Total per scene break             ~12.5KB  Larger than regular recaps
```

## Debugging Data Flow

### Trace Write Path

Add logging to `set_data()`:
```javascript
function set_data(message, key, value) {
  console.log('[DATA] WRITE:', key, '=', value);
  console.trace(); // Show call stack

  // ... existing implementation

  if (ctx?.chat && ctx?.chatId) {
    console.log('[DATA] Triggering saveChatDebounced');
    saveChatDebounced();
  } else {
    console.warn('[DATA] No chat context - save not triggered');
  }
}
```

### Trace Read Path

Add logging to `get_data()`:
```javascript
function get_data(message, key) {
  const value = message?.extra?.[MODULE_NAME]?.[key];
  console.log('[DATA] READ:', key, '=', value);
  return value;
}
```

### Monitor Save Operations

Track when debounced saves execute:
```javascript
const originalSave = saveChatDebounced;
saveChatDebounced = function() {
  console.log('[DATA] saveChatDebounced() executing at', Date.now());
  console.trace();
  return originalSave();
};
```

### Verify Data Persistence

Check data before and after reload:
```javascript
// Before reload
const beforeMemory = get_data(chat[50], 'memory');
console.log('Before reload:', beforeMemory);

// Reload page
location.reload();

// After reload (in console after page loads)
const afterMemory = get_data(getContext().chat[50], 'memory');
console.log('After reload:', afterMemory);
console.assert(afterMemory === beforeMemory, 'Data not persisted!');
```

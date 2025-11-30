# Content Stripping Feature - Design Document

## Problem Statement

Character cards often include **status output blocks** that:
1. Get summarized into scene recaps, polluting memory with ephemeral/stale data
2. Remain in earlier chat messages, wasting context tokens on outdated information

### Example Status Formats

**Inline format:**
```
[Season: Spring - Day 3, Year 847 CE | Treasury: 95 bits | Status: Morning routine | Condition: Healthy]
```

**Block format:**
```
Manor Status
✦ ❧ ✦
Season: Spring - Day 2, Year 847 CE
Treasury: 95 bits (40 earmarked for tax, 55 allocated for repairs)
Location: Retiring to private chambers
Condition: Exhausted but resolute
```

These status blocks:
- Contain ephemeral state that changes every message
- Earlier values are **stale** and misleading (e.g., "Treasury: 150 bits" from 10 messages ago)
- Consume tokens without adding narrative value
- Get LLM-summarized into recaps, creating false/contradictory memory

---

## Unified System Design

**One pattern set** with **two application targets** (each independently toggled):

| Target | Effect | Depth Setting | When Applied |
|--------|--------|---------------|--------------|
| **Messages** | Permanently modifies `message.mes` and saves | `messages_depth` | On demand or auto on new message |
| **Summarization** | Filters content before sending to recap LLM | `summarization_depth` | During recap generation |

**Key insight:** Same patterns, different application points. User might want:
- Strip status from messages older than 1, but strip from ALL messages for summarization
- Strip from summarization only (preserve original messages)
- Strip from both with same depth
- etc.

---

## Settings Structure

### Scope & Storage

**Settings storage hierarchy (verified from `profileManager.js`):**
```javascript
extension_settings.auto_recap.content_stripping = {
  // Patterns (one set, shared by both targets)
  // Stored at three levels with priority: chat > character > global
  global_patterns: [
    { id: "uuid1", pattern: "\\[Season:.*?\\]", flags: "gi", name: "Status Line", enabled: true }
  ],
  character_patterns: {
    "character_key": [
      { id: "uuid2", pattern: "Manor Status[\\s\\S]*?Condition:.*", flags: "gim", name: "Manor Status Block", enabled: true }
    ]
  },
  chat_patterns: {
    "chat_id": [
      { id: "uuid3", pattern: "...", flags: "...", name: "...", enabled: true }
    ]
  },

  // Application settings (two targets, each with own toggle + depth)
  apply_to_messages: false,           // Toggle: strip from actual messages
  messages_depth: 1,                  // Depth: skip latest N messages (1 = preserve newest)
  auto_strip_on_message: false,       // Auto-run when new message received

  apply_to_summarization: true,       // Toggle: filter for recap prompts
  summarization_depth: 0,             // Depth: 0 = filter ALL messages for summarization

  // UI settings
  confirm_before_strip: true          // Require confirmation for batch message stripping
}

// Per-message tracking (stored in message.extra via set_data/get_data)
message.extra.content_strip_checked = true;    // Message has been processed
message.extra.content_strip_hash = "abc123";   // Hash of patterns used when stripped
```

### Pattern Resolution (Priority Order)
1. Chat-specific patterns (if defined for current chat) - **replaces** lower levels
2. Character-specific patterns (if defined for current character) - **replaces** global
3. Global patterns (fallback)

**Implementation pattern from existing code (`profileManager.js:306-309`):**
```javascript
function auto_load_profile() {
  const profile = get_chat_profile() || get_character_profile();
  load_profile(profile || 'Default');
}
```

### Pattern Resolution Function
```javascript
function resolveActivePatterns() {
  const chatId = get_current_chat_identifier();
  const charKey = get_current_character_identifier();
  const settings = get_settings('content_stripping') || {};

  // Priority: chat > character > global
  if (chatId && settings.chat_patterns?.[chatId]?.length > 0) {
    return settings.chat_patterns[chatId].filter(p => p.enabled);
  }
  if (charKey && settings.character_patterns?.[charKey]?.length > 0) {
    return settings.character_patterns[charKey].filter(p => p.enabled);
  }
  return (settings.global_patterns || []).filter(p => p.enabled);
}

---

## Core Implementation

### Shared Strip Function

```javascript
/**
 * Apply stripping patterns to text
 * @param {string} text - The text to process
 * @param {Array} patterns - Array of {pattern, flags} objects (pre-filtered to enabled only)
 * @returns {string} - Processed text
 */
function applyStrippingPatterns(text, patterns) {
  if (!text || !patterns?.length) return text;

  let result = text;
  for (const { pattern, flags } of patterns) {
    try {
      const regex = new RegExp(pattern, flags);
      result = result.replace(regex, '');
    } catch (e) {
      error(SUBSYSTEM.CORE, `Invalid regex pattern: ${pattern}`, e);
    }
  }

  // Clean up excess whitespace left by removals
  return result.replace(/\n{3,}/g, '\n\n').trim();
}
```

---

## Target 1: Message Content Stripping

### Purpose
Actually edit historical messages to remove unwanted content, saving the modified versions. Permanently reduces context size.

### Tracking Already-Stripped Messages

To avoid re-processing messages on every new message, track which messages have been stripped using message metadata (same pattern as `auto_scene_break_checked`):

```javascript
// Message-level tracking via set_data/get_data
message.extra.content_strip_checked = true;      // Has been processed
message.extra.content_strip_hash = "abc123";     // Hash of patterns used (to re-strip if patterns change)
```

**Pattern hash** ensures re-stripping when patterns change:
```javascript
function getPatternHash(patterns) {
  const str = patterns.map(p => `${p.pattern}|${p.flags}`).sort().join(';;');
  return getStringHash(str); // Use ST's existing hash utility
}
```

### Implementation

```javascript
async function stripContentFromMessages(options = {}) {
  const ctx = getContext();
  const chat = ctx.chat;
  const settings = get_settings('content_stripping') || {};
  const { force = false, signal = null } = options;

  if (!settings.apply_to_messages) return { modified: 0, skipped: 'disabled' };

  const patterns = resolveActivePatterns();
  if (!patterns.length) return { modified: 0, skipped: 'no patterns' };

  const patternHash = getPatternHash(patterns);
  const depth = settings.messages_depth ?? 1;
  const endIndex = chat.length - depth; // Skip latest N messages

  let modifiedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < endIndex; i++) {
    // Check for cancellation
    if (signal?.aborted) {
      debug(SUBSYSTEM.CORE, 'Strip operation cancelled');
      break;
    }

    const message = chat[i];
    if (!message.mes) continue;

    // Skip if already processed with same patterns (unless forced)
    const wasChecked = get_data(message, 'content_strip_checked');
    const prevHash = get_data(message, 'content_strip_hash');
    if (!force && wasChecked && prevHash === patternHash) {
      skippedCount++;
      continue;
    }

    const original = message.mes;
    const modified = applyStrippingPatterns(original, patterns);

    if (modified !== original && modified.length > 0) {
      message.mes = modified;
      modifiedCount++;
    }

    // Mark as checked with current pattern hash
    set_data(message, 'content_strip_checked', true);
    set_data(message, 'content_strip_hash', patternHash);
  }

  if (modifiedCount > 0 || skippedCount > 0) {
    saveChatDebounced();
  }

  if (modifiedCount > 0) {
    toast(`Stripped content from ${modifiedCount} messages`, 'success');
  }

  return { modified: modifiedCount, skipped: skippedCount };
}
```

### Re-strip Triggers

Messages get re-processed when:
1. **Pattern hash changes** - User added/modified/removed patterns
2. **Force flag** - User clicks "Strip Now" button
3. **Clear flags** - `/strip-clear-flags` slash command to reset tracking

### Queue Integration

**Message stripping DOES go through the operation queue.** Reasons:

1. **Blocks chat while processing** - User wants messages stripped before continuing chat
2. **Ensures ordering** - Stripping completes before detection/recap
3. **Consistency** - All operations visible in queue UI
4. **Cancellable** - User can abort if needed

**New operation type:**
```javascript
// In operationTypes.js
export const OperationType = {
  // ... existing types ...
  STRIP_CONTENT: 'strip_content',  // NEW
};

// In operationQueue.js - add to NON_LLM_OPERATIONS (no rate limit delay needed)
const NON_LLM_OPERATIONS = new Set([
  OperationType.UPDATE_LOREBOOK_REGISTRY,
  OperationType.UPDATE_LOREBOOK_SNAPSHOT,
  OperationType.STRIP_CONTENT,  // NEW - no LLM calls
]);
```

**Critical: Scene detection triggered FROM strip handler, not in parallel:**

```
char_message event
    │
    ▼
handleCharMessageNew()
    │
    └──▶ enqueueOperation(STRIP_CONTENT, { messageIndex, triggerDetection: true })
              │
              ▼
         [Queue blocks chat, processes STRIP_CONTENT]
              │
              ▼
         stripContentFromMessages()
              │
              ▼
         [If triggerDetection] processNewMessageForSceneBreak()
              │
              ▼
         enqueueOperation(DETECT_SCENE_BREAK)  ← Now sees clean content
```

**Operation handler:**
```javascript
// In operationHandlers.js
registerOperationHandler(OperationType.STRIP_CONTENT, async (operation) => {
  const { force } = operation.params;
  const { messageIndex, triggerDetection } = operation.metadata;
  const signal = getAbortSignal(operation);

  const result = await stripContentFromMessages({ force, signal });

  debug(SUBSYSTEM.QUEUE, `Stripped ${result.modified} messages, skipped ${result.skipped}`);

  // Trigger scene detection AFTER stripping completes
  if (triggerDetection && get_settings('auto_scene_break_on_new_message')) {
    await processNewMessageForSceneBreak(messageIndex);
  }

  return result;
});
```

**Modified event handler:**
```javascript
// In eventHandlers.js
async function handleCharMessageNew(index) {
  const settings = get_settings('content_stripping') || {};

  if (settings.apply_to_messages && settings.auto_strip_on_message) {
    // Queue stripping, which will trigger detection after completion
    await enqueueOperation(
      OperationType.STRIP_CONTENT,
      { force: false },  // params - operation inputs
      {
        priority: 10,    // High priority (normal is 5)
        metadata: {
          messageIndex: index,
          triggerDetection: true,  // Handler will call processNewMessageForSceneBreak
          triggered_by: 'auto_strip_on_message'
        }
      }
    );
  } else {
    // No stripping enabled, proceed directly to detection
    await processNewMessageForSceneBreak(index);
  }
}
```

**Manual "Strip Now"** - Same queue path but without triggerDetection:
```javascript
// UI button handler
async function onStripNowClick() {
  await enqueueOperation(
    OperationType.STRIP_CONTENT,
    { force: true },   // params - force re-strip all
    {
      priority: 10,
      metadata: {
        triggerDetection: false,  // Manual action, don't auto-detect
        triggered_by: 'manual_strip_now'
      }
    }
  );
}
```

### Trigger Points

**1. Manual via slash command:** `/strip-content [depth]`
**2. Manual via UI button** in settings panel
**3. Automatic on `char_message` event** (if `auto_strip_on_message` enabled)

**Current event flow (from `eventHandlers.js:203-225`):**
```
char_message event
  └─> handleCharMessage()
      └─> handleCharMessageNew(index)
          └─> processNewMessageForSceneBreak(index)
```

**Modified flow** - `handleCharMessageNew` queues stripping first (see "Modified event handler" above), which then triggers detection from within the handler.

---

## Target 2: Summarization Prompt Filtering

### Purpose
Filter message content **before** sending to the LLM for recap generation, without modifying saved messages.

### Which Operations Get Filtered Content?

| Operation | Gets Filtered? | Source | Reason |
|-----------|---------------|--------|--------|
| `GENERATE_SCENE_RECAP` | ✅ Yes | `collectSceneObjects()` | Main use case - don't summarize status blocks |
| `DETECT_SCENE_BREAK` | ❌ No* | `autoSceneBreakDetection.js` | Status blocks don't usually affect scene detection |
| `GENERATE_RUNNING_RECAP` | ❌ No | Uses scene recaps | Already filtered during scene recap generation |
| `ORGANIZE_SCENE_RECAP` | ❌ No | Uses scene recap | Already filtered |
| Lorebook operations | ❌ No | Uses recaps | Already filtered |

*If `apply_to_messages` is enabled, detection sees already-stripped messages anyway.

### Insertion Point: `collectSceneObjects()`

**Location:** `sceneBreak.js:1041-1062`

**Current flow:**
```
GENERATE_SCENE_RECAP operation
    │
    ▼
generateSceneRecap()
    │
    ▼
collectSceneObjects(startIdx, endIdx, chat)  ← FILTER HERE
    │
    ▼
prepareScenePrompt(sceneObjects, ...)
    │
    ▼
LLM call with filtered content
```

### Current Code (to be modified)

**`sceneBreak.js:1041-1062`:**
```javascript
export function collectSceneObjects(startIdx, endIdx, chat) {
  const messageTypes = get_settings('scene_recap_message_types') || "both";
  const sceneObjects = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const msg = chat[i];
    if (msg.mes && msg.mes.trim() !== "") {
      // ... type filtering ...
      sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text: msg.mes });
    }
  }
  return sceneObjects;
}
```

### Modified Implementation

```javascript
// In sceneBreak.js
import { applyStrippingPatterns, resolveActivePatterns } from './contentStripping.js';

export function collectSceneObjects(startIdx, endIdx, chat) {
  const messageTypes = get_settings('scene_recap_message_types') || "both";
  const settings = get_settings('content_stripping') || {};
  const filteringEnabled = settings.apply_to_summarization;
  const patterns = filteringEnabled ? resolveActivePatterns() : [];
  const filterDepth = settings.summarization_depth ?? 0;

  const sceneObjects = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const msg = chat[i];
    if (msg.mes && msg.mes.trim() !== "") {
      const includeMessage = messageTypes === "both" ||
        (messageTypes === "user" && msg.is_user) ||
        (messageTypes === "character" && !msg.is_user);

      if (includeMessage) {
        let text = msg.mes;

        // Apply filtering based on depth
        // depth 0 = filter all, depth 1 = skip latest 1 message, etc.
        const messageDepth = endIdx - i;
        if (filteringEnabled && patterns.length && messageDepth >= filterDepth) {
          text = applyStrippingPatterns(text, patterns);
        }

        if (text.trim()) { // Only add if not empty after filtering
          sceneObjects.push({ type: "message", index: i, name: msg.name, is_user: msg.is_user, text });
        }
      }
    }
  }

  return sceneObjects;
}
```

### Depth Calculation for Summarization

The depth for summarization filtering is relative to the **scene end**, not the chat end:

```
Scene: messages 50-60 (endIdx = 60)
summarization_depth = 1

Message 50: depth = 60 - 50 = 10  → filtered (10 >= 1)
Message 59: depth = 60 - 59 = 1   → filtered (1 >= 1)
Message 60: depth = 60 - 60 = 0   → NOT filtered (0 < 1)
```

This means `summarization_depth = 1` preserves status in the **last message of the scene** only.

### Alternative: Filter in `prepareScenePrompt()`

Could also filter later in `prepareScenePrompt()` at `sceneBreak.js:1364-1390`, but `collectSceneObjects()` is cleaner because:
1. Single responsibility - collection includes filtering
2. Filtered early - downstream code sees clean data
3. Empty message handling - can skip entirely empty messages

### Scene Break Detection Consideration

Scene break detection reads message content at `autoSceneBreakDetection.js:458`:
```javascript
const cleaned = stripDecorativeSeparators(message.mes);
```

**Two scenarios:**

1. **`apply_to_messages` enabled** - Detection sees already-stripped `message.mes` (from queue operation)
2. **Only `apply_to_summarization` enabled** - Detection sees original content

Scenario 2 is usually fine because status blocks don't typically trigger false scene breaks. But if needed, we could add a third toggle: `apply_to_detection`.

---

## Timing & Order of Operations

### Critical Constraint
Content must be stripped/filtered **BEFORE** it's used for:
1. Scene break detection (if `apply_to_messages` + `auto_strip_on_message`)
2. Recap generation (if `apply_to_summarization`)

### Event Flow (All Queued)

```
char_message event received
    │
    ▼
handleCharMessageNew()
    │
    ▼
┌─────────────────────────────────────┐
│ enqueue STRIP_CONTENT               │  (if apply_to_messages + auto_strip)
│ - Priority: HIGH                    │
│ - Blocks chat immediately           │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Queue processes STRIP_CONTENT       │
│ - Applies patterns to older msgs    │
│ - Modifies chat[].mes permanently   │
│ - Saves via saveChatDebounced()     │
│ - THEN triggers scene detection     │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ enqueue DETECT_SCENE_BREAK          │  (from within STRIP_CONTENT handler)
│ - Now reads STRIPPED content        │
│ - Proper ordering guaranteed        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Queue processes DETECT_SCENE_BREAK  │
│ - If break found, queues            │
│   GENERATE_SCENE_RECAP              │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ Queue processes GENERATE_SCENE_RECAP│
│ - collectSceneObjects() applies     │
│   summarization filtering           │
│ - Filtered content goes to LLM      │
└─────────────────────────────────────┘
    │
    ▼
[Queue empty, chat unblocked]
```

### Queue Benefits

1. **Blocks chat** - User can't send messages while stripping (desired behavior)
2. **Proper ordering** - Detection guaranteed to see stripped content
3. **Visible progress** - Queue UI shows STRIP_CONTENT operation
4. **Cancellable** - User can abort via queue controls
5. **No race conditions** - Everything sequential

---

## UI Design

### Settings Panel Section

```html
<div class="content-stripping-section">
  <h4>Content Stripping</h4>
  <p class="note">Remove unwanted content (status blocks, etc.) using regex patterns</p>

  <!-- Patterns Management -->
  <div class="subsection">
    <h5>Patterns</h5>
    <button id="manage_strip_patterns" class="menu_button">
      <i class="fa-solid fa-list"></i> Manage Patterns...
    </button>
    <span class="pattern-count">3 patterns active (Global)</span>
  </div>

  <!-- Target 1: Messages -->
  <div class="subsection">
    <h5>Apply to Messages</h5>
    <p class="note">Permanently removes content from older messages</p>

    <label class="checkbox_label">
      <input type="checkbox" id="apply_to_messages">
      <span>Enable message stripping</span>
    </label>

    <div class="depth-setting" data-depends="apply_to_messages">
      <label>Skip latest N messages:</label>
      <input type="number" id="messages_depth" min="0" max="50" value="1">
      <span class="hint">(1 = preserve newest message)</span>
    </div>

    <label class="checkbox_label" data-depends="apply_to_messages">
      <input type="checkbox" id="auto_strip_on_message">
      <span>Auto-strip when new message received</span>
    </label>

    <button id="strip_content_now" class="menu_button" data-depends="apply_to_messages">
      <i class="fa-solid fa-scissors"></i> Strip Now
    </button>
  </div>

  <!-- Target 2: Summarization -->
  <div class="subsection">
    <h5>Apply to Summarization</h5>
    <p class="note">Filters content for recaps only (doesn't modify messages)</p>

    <label class="checkbox_label">
      <input type="checkbox" id="apply_to_summarization" checked>
      <span>Enable summarization filtering</span>
    </label>

    <div class="depth-setting" data-depends="apply_to_summarization">
      <label>Skip latest N messages:</label>
      <input type="number" id="summarization_depth" min="0" max="50" value="0">
      <span class="hint">(0 = filter all messages)</span>
    </div>
  </div>
</div>
```

### Pattern Editor Dialog

```html
<div class="pattern-editor-dialog">
  <h3>Content Stripping Patterns</h3>

  <!-- Scope Tabs -->
  <div class="scope-tabs">
    <button class="scope-tab active" data-scope="global">Global</button>
    <button class="scope-tab" data-scope="character">Character: {{char}}</button>
    <button class="scope-tab" data-scope="chat">This Chat</button>
  </div>

  <p class="scope-note">
    Priority: Chat > Character > Global.
    If patterns exist at a higher level, lower levels are ignored.
  </p>

  <!-- Patterns List -->
  <div class="patterns-list">
    <!-- Dynamically populated pattern rows -->
    <div class="pattern-row" data-id="uuid1">
      <input type="checkbox" class="pattern-enabled" checked>
      <span class="pattern-name">Status Line</span>
      <code class="pattern-regex">\[Season:.*?\]</code>
      <span class="pattern-flags">gi</span>
      <button class="pattern-test" title="Test pattern"><i class="fa-solid fa-vial"></i></button>
      <button class="pattern-edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
      <button class="pattern-delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
    </div>
  </div>

  <!-- Add New Pattern -->
  <div class="add-pattern-form">
    <input type="text" id="new-pattern-name" placeholder="Pattern name">
    <input type="text" id="new-pattern-regex" placeholder="Regex pattern">
    <select id="new-pattern-flags">
      <option value="gi">Global, Case-insensitive</option>
      <option value="gim">Global, Case-insensitive, Multiline</option>
      <option value="g">Global only</option>
      <option value="gis">Global, Case-insensitive, DotAll</option>
    </select>
    <button id="add-pattern-btn" class="menu_button">
      <i class="fa-solid fa-plus"></i> Add
    </button>
  </div>

  <!-- Preset Patterns -->
  <div class="preset-patterns">
    <h4>Quick Add Presets</h4>
    <button class="preset-btn" data-preset="status-line">
      <i class="fa-solid fa-brackets-square"></i> Status Line
    </button>
    <button class="preset-btn" data-preset="status-block">
      <i class="fa-solid fa-square"></i> Status Block
    </button>
    <button class="preset-btn" data-preset="img-tags">
      <i class="fa-solid fa-image"></i> Image Tags
    </button>
    <button class="preset-btn" data-preset="decorative">
      <i class="fa-solid fa-star"></i> Decorative Lines
    </button>
  </div>
</div>
```

---

## Preset Patterns

Common patterns that users can add with one click:

```javascript
const PRESET_PATTERNS = {
  'status-line': {
    name: 'Status Line',
    pattern: '\\[(?:Season|Treasury|Status|Location|Condition)[^\\]]*\\]',
    flags: 'gi',
    description: 'Inline status like [Season: Spring - Day 3...]'
  },
  'status-block': {
    name: 'Status Block',
    pattern: '(?:Manor Status|Status Report|Current Status)[\\s\\S]*?(?:Condition|Status):\\s*[^\\n]+',
    flags: 'gim',
    description: 'Multi-line status blocks'
  },
  'img-tags': {
    name: 'Image Tags',
    pattern: '<img[^>]*>',
    flags: 'gi',
    description: 'HTML image tags'
  },
  'decorative-separators': {
    name: 'Decorative Separators',
    pattern: '^[✦❧★☆═─]+\\s*$',
    flags: 'gm',
    description: 'Lines with only decorative characters'
  }
};
```

---

## Implementation Order

### Phase 1: Core Infrastructure
1. Add settings structure to `defaultSettings.js`
2. Create `contentStripping.js` module with:
   - `resolveActivePatterns()` - scope resolution
   - `applyStrippingPatterns()` - shared strip function
   - Pattern validation (test regex is valid before saving)
3. Add to `index.js` barrel exports

### Phase 2: Summarization Filtering (Lower Risk)
- Doesn't modify saved data - safe to implement first
- Modify `collectSceneObjects()` in `sceneBreak.js`
- Add depth threshold logic
- Test with recap generation

### Phase 3: Message Stripping (Higher Risk)
- Modifies saved messages - implement after filtering works
- Implement `stripContentFromMessages()`
- Add confirmation dialog for manual "Strip Now" button
- Integrate with `handleCharMessageNew()` for auto-strip option

### Phase 4: UI
- Settings panel section in `settings.html`
- Pattern editor dialog (popup)
- UI bindings in `uiBindings.js`
- Preset pattern quick-add buttons

### Phase 5: Slash Commands
- `/strip-content [depth]` - Manual strip (respects tracking, only processes unchecked)
- `/strip-content force=true` - Force re-strip all (ignores tracking)
- `/strip-preview` - Preview what would be stripped (dry run)
- `/strip-clear-flags` - Clear tracking flags to allow re-processing
- `/strip-patterns list|add|remove` - Manage patterns

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss from over-aggressive patterns | High | Preview mode, confirmation dialog, non-empty validation |
| Regex performance on long messages | Medium | Timeout, limit pattern count |
| Invalid regex crashes | Medium | Validate on save, try/catch on apply |
| Breaking message integrity | High | Skip if result is empty |
| User confusion about scope priority | Low | Clear UI labels, scope indicator |

---

## Testing Strategy

### Unit Tests
- Pattern resolution (global → character → chat priority)
- `applyStrippingPatterns()` with various inputs
- Depth threshold calculations (messages vs summarization)
- Invalid regex handling

### Integration Tests
- Message stripping: Verify `chat[].mes` modified and saved
- Summarization filtering: Verify filtered content in `sceneObjects`
- Event ordering: Stripping before detection when auto-enabled

### E2E Tests
- Full flow: new message → auto-strip → scene detection → recap with filtering
- UI pattern management (add, edit, delete, enable/disable)
- Scope switching (global → character → chat)
- Slash commands

---

## Open Questions

1. **Undo support for message stripping?**
   - Option A: Store original in `message.extra.stripped_original`
   - Option B: Rely on ST's chat backup system
   - Option C: No undo, but require confirmation

2. **Visual indicator for stripped messages?**
   - Show scissors icon on stripped messages?
   - Show diff on hover?
   - Or keep it invisible (less clutter)?

3. **Interaction with ST's existing regex extension?**
   - ST has a regex extension that processes messages for display
   - Our stripping is different (permanent modification or LLM filtering)
   - Recommend: Stay independent, document the difference

4. **Pattern testing UI?**
   - "Test" button that shows preview of what would be stripped
   - Input a sample message and see result
   - Show match count across current chat

5. **Import/Export patterns?**
   - Share patterns between users
   - JSON export/import
   - Could be Phase 6

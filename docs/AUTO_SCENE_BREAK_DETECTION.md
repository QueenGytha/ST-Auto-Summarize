# Auto Scene Break Detection

## Feature Overview

Automatic scene break detection uses an LLM to analyze messages and determine if they represent logical scene breaks in the roleplay. The system can automatically mark messages as scene breaks on chat load and/or for new messages (per-event settings), and can also be run manually via the navbar “Scan Scene Breaks” button.

## Requirements

### Core Functionality
1. **LLM-Based Detection**: Use a separate LLM call with configurable prompt to detect scene breaks
2. **True/False Output**: Prompt must enforce boolean output; any response containing "true" triggers a scene break
3. **Message Tracking**: Track which messages have been checked on the message object itself (swipe/regen clears tracking)
4. **Message Offset**: Configurable offset from latest message (default: -1, meaning skip latest message)
5. **Automatic Triggers**: Run on chat load and new messages (both configurable, default: enabled)
6. **Manual Trigger**: User can manually trigger detection via button/command

### Storage Strategy
- **Checked Status**: Store `auto_scene_break_checked: true` on message object via `set_data()`
- **Swipe Behavior**: When message is swiped/regenerated, tracking is lost → message will be re-checked
- **No Global Tracking**: Do NOT use extension_settings or chat-level tracking

### API Integration
- **Own Connection Profile**: Separate optional connection profile for detection calls
- **Own Completion Preset**: Separate optional preset for detection calls
- **Fallback**: If profile/preset not set, use current profile/preset
- **Similar to Scene Summary**: Follow same pattern as scene summary generation

### Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `auto_scene_break_on_load` | boolean | false | Auto-check messages when chat loads |
| `auto_scene_break_on_new_message` | boolean | true | Auto-check when new message arrives |
| `auto_scene_break_generate_summary` | boolean | true | Auto-generate scene summary when a scene break is detected |
| `auto_scene_break_message_offset` | number | 1 | How many messages back from latest to skip (1 = skip latest, 0 = check all including latest) |
| `auto_scene_break_check_which_messages` | string | "both" | Which messages to check: "user" (user only), "character" (AI only), "both" (all messages) |
| `auto_scene_break_recent_message_count` | number | 3 | How many recent messages matching the selected type to check when auto-scanning new messages (0 = scan entire history) |
| `auto_scene_break_prompt` | string | (see below) | LLM prompt template for detection |
| `auto_scene_break_prefill` | string | "" | Prefill to enforce true/false output (optional) |
| `auto_scene_break_connection_profile` | string | "" | Optional API connection profile |
| `auto_scene_break_completion_preset` | string | "" | Optional completion preset |

### Default Prompt
```
You are analyzing a roleplay conversation to detect scene breaks. A scene break occurs when there is a significant shift in:
- Location or setting (moving to a different place)
- Time period (significant time skip like "later that day", "the next morning", etc.)
- Narrative focus or POV (switching to different characters or perspective)
- Major plot transition (end of one story arc, beginning of another)

You will be given two messages: the previous message and the current message. Analyze whether the current message represents a scene break compared to the previous message.

Previous messages (oldest to newest):
{{previous_message}}

Current message:
{{current_message}}

Respond with ONLY a JSON object in this exact format:
{
  "status": true or false,
  "rationale": "Brief 1-sentence explanation of why this is or isn't a scene break"
}

Do not include any text outside the JSON object.
```

> **Tip:** `{{previous_message}}` and `{{previous_messages}}` both expand to the formatted list of prior messages (filtered by the "Check Which Messages" setting and limited by the recent message count).

**Response Format:**
The LLM returns a JSON object with:
- `status`: Boolean indicating if scene break detected
- `rationale`: Brief explanation for debugging/troubleshooting

Example responses:
```json
{"status": true, "rationale": "Location changed from bedroom to kitchen"}
{"status": false, "rationale": "Conversation continues in same location and timeframe"}
{"status": true, "rationale": "Time skip indicated by 'later that evening'"}
```

### Default Prefill
```
(blank - no default prefill)
```

## Technical Implementation

### Module: `autoSceneBreakDetection.js`

#### Core Functions

```javascript
/**
 * Check if a message needs to be scanned for scene break detection
 * @param {object} message - The message object
 * @param {number} messageIndex - Index in chat array
 * @param {number} latestIndex - Index of latest message
 * @param {number} offset - Message offset setting
 * @returns {boolean} - True if message should be checked
 */
function shouldCheckMessage(message, messageIndex, latestIndex, offset)

/**
 * Detect if a message should be a scene break using LLM
 * @param {object} message - The message object being checked
 * @param {number} messageIndex - Index in chat array
 * @param {object|null} previousMessage - The previous message for context
 * @returns {Promise<{isSceneBreak: boolean, rationale: string}>} - Detection result with rationale
 */
async function detectSceneBreak(message, messageIndex, previousMessage = null)

/**
 * Process messages for auto scene break detection
 * @param {number} startIndex - Start index (optional, defaults to 0)
 * @param {number} endIndex - End index (optional, defaults to latest)
 */
async function processAutoSceneBreakDetection(startIndex, endIndex)

/**
 * Manually trigger scene break detection on all eligible messages
 */
async function manualSceneBreakDetection()
```

#### Detection Logic Flow

1. **Entry Point** (`processAutoSceneBreakDetection`)
   - Get settings: enabled, offset, connection profile, preset
   - Get chat context and messages
   - Determine range of messages to check (startIndex to endIndex)
   - For new message triggers, use `auto_scene_break_recent_message_count` to include the most recent matching messages of the selected type

2. **Message Filtering** (`shouldCheckMessage`)
   - Check if already marked with `auto_scene_break_checked: true`
   - Check if message index is within offset range (e.g., if offset=-1, skip messages >= latestIndex-1)
   - Return true only if message should be checked

3. **LLM Detection** (`detectSceneBreak`)
   - Get prompt template and prefill from settings
   - Get previous message for context (if exists, otherwise use placeholder text)
   - Substitute both previous and current message into prompt using `{{previous_message}}` and `{{current_message}}` macros
   - Switch to detection connection profile/preset if configured
   - Call `summarize_text(prompt)` (same as scene summary generation)
   - Parse JSON response to extract `status` and `rationale`
   - Fallback: If JSON parsing fails, check if response contains "true" (backward compatibility)
   - Log decision with rationale for debugging
   - Restore original connection profile/preset
   - Mark message as checked: `set_data(message, 'auto_scene_break_checked', true)`
   - Return `{isSceneBreak: boolean, rationale: string}`
   - On error: Retry with exponential backoff (10s, 20s, 40s, 80s, 160s) for up to 6 attempts

4. **Scene Break Marking**
   - If `detectSceneBreak()` returns true:
     - Call `toggleSceneBreak(messageIndex, ...)` from sceneBreak.js
     - This sets `scene_break: true` and `scene_break_visible: true`
     - Renders scene break UI on message

5. **Auto-Generate Scene Summary** (Optional)
   - If `auto_scene_break_generate_summary` is enabled:
     - Call `generateSceneSummary(messageIndex, ...)` from sceneBreak.js
     - Wait for summary generation to complete before continuing
     - This ensures sequential processing: summary finishes before checking next message
     - Handle errors gracefully (log but don't stop scan)
     - Show progress toasts to user

6. **Error Handling**
   - Catch LLM errors gracefully
   - Log errors but continue processing other messages
   - Do NOT mark message as checked if detection fails (allow retry)

### Event Integration

#### Event Handlers (in `eventHandlers.js`)

1. **MESSAGE_RECEIVED** / **MESSAGE_SENT**
   - Check `auto_scene_break_on_new_message` setting
   - If enabled, call `processAutoSceneBreakDetection(startIndex, latestIndex)`
   - `startIndex` is derived from `auto_scene_break_recent_message_count` (limited to the selected message type) and `auto_scene_break_message_offset`

2. **CHAT_CHANGED**
   - Check `auto_scene_break_on_load` setting
   - If enabled, call `processAutoSceneBreakDetection()` (all messages)

3. **Manual Trigger**
   - Navbar button: “Scan Scene Breaks”
   - Calls `manualSceneBreakDetection()` which processes all eligible messages

### UI Components

#### Settings Panel (settings.html)

```html
<div class="auto_scene_break_settings">
  <h3>Auto Scene Break Detection</h3>

  <!-- Master toggle removed; detection is controlled per-event and via manual run -->

  <label class="checkbox_label">
    <input type="checkbox" id="auto_scene_break_on_load" />
    <span>Auto-check on chat load</span>
  </label>

  <label class="checkbox_label">
    <input type="checkbox" id="auto_scene_break_on_new_message" />
    <span>Auto-check on new messages</span>
  </label>

  <label class="checkbox_label">
    <input type="checkbox" id="auto_scene_break_generate_summary" />
    <span>Auto-generate Scene Summary on Detection</span>
  </label>

  <label for="auto_scene_break_message_offset">
    Message Offset (messages back from latest to skip):
    <span class="setting-value" id="auto_scene_break_message_offset_value">1</span>
  </label>
  <input type="range" id="auto_scene_break_message_offset" min="0" max="10" step="1" value="1" />
  <small>0 = check all, 1 = skip latest, 2 = skip 2 latest, etc.</small>

  <h4>Detection Prompt</h4>
  <textarea id="auto_scene_break_prompt" rows="8"></textarea>

  <label for="auto_scene_break_prefill">Prefill:</label>
  <input type="text" id="auto_scene_break_prefill" />

  <h4>API Settings</h4>

  <label for="auto_scene_break_connection_profile">Connection Profile:</label>
  <select id="auto_scene_break_connection_profile">
    <option value="">(Use Current)</option>
    <!-- Populated dynamically from connection profiles -->
  </select>

  <label for="auto_scene_break_completion_preset">Completion Preset:</label>
  <select id="auto_scene_break_completion_preset">
    <option value="">(Use Current)</option>
    <!-- Populated dynamically from presets -->
  </select>

  <button id="manual_scene_break_detection" class="menu_button">
    <i class="fa-solid fa-magnifying-glass"></i> Scan Scene Breaks
  </button>
</div>
```

### Data Structures

#### Message Object Properties (via get_data/set_data)

```javascript
// Checked status (cleared on swipe/regen)
message.auto_scene_break_checked = true;  // Boolean

// Existing scene break properties (from sceneBreak.js)
message.scene_break = true;               // Boolean
message.scene_break_visible = true;       // Boolean
message.scene_break_name = "Scene name";  // String
message.scene_break_summary = "Summary";  // String
```

## Testing Plan

### Manual Testing Steps

1. **Test Message Offset**
   - Set offset to 1 (skip latest)
   - Send 3 messages
   - Verify only first 2 are checked (not latest)
   - Set offset to 0, verify all checked

3. **Test Detection Logic**
   - Create message with obvious scene break content ("Later that day...", location change)
   - Verify scene break is auto-marked
   - Create message without scene break
   - Verify no scene break is marked

4. **Test Swipe Behavior**
   - Mark message as checked
   - Swipe to new response
   - Verify message is re-checked (checked flag cleared by swipe)

5. **Test Chat Load**
   - Enable auto-check on load
   - Reload chat
   - Verify unchecked messages are scanned

5. **Test Manual Trigger**
   - Click "Scan Scene Breaks" button (navbar)
   - Verify all eligible messages are processed

7. **Test API Profile Switching**
   - Set custom connection profile for detection
   - Trigger detection
   - Verify correct profile is used and restored

### Playwright Test Cases

```javascript
// Test 1: Configure auto scene break detection
test('Configure auto scene break detection', async () => {
  // Navigate to settings
  // Set offset to 1
  // Save settings
  // Verify settings persisted
});

// Test 2: Auto-detect scene break on new message
test('Auto-detect scene break', async () => {
  // Send message with scene break content
  // Wait for detection to complete
  // Verify scene break UI appears on message
  // Verify message has scene_break: true
});

// Test 3: Skip latest message with offset
test('Respect message offset', async () => {
  // Set offset to 1
  // Send 2 messages
  // Verify only first message checked
  // Verify latest message NOT checked
});

// Test 4: Swipe clears checked status
test('Swipe clears checked status', async () => {
  // Send message, verify checked
  // Swipe to new response
  // Verify auto_scene_break_checked cleared
  // Verify message re-checked
});

// Test 5: Manual scan all messages
test('Manual scan trigger', async () => {
  // Ensure auto-check is off on load (optional)
  // Send 3 messages
  // Click "Scan Scene Breaks"
  // Verify all messages processed
});
```

## Debugging and Troubleshooting

### Viewing Rationale in Logs
Debug output always includes detailed rationale for each decision:
```
[AutoSummarize] [DEBUG] ✓ SCENE BREAK DETECTED for message 42
[AutoSummarize] [DEBUG]   Rationale: Time skip indicated by 'the next morning'
```

or

```
[AutoSummarize] [DEBUG] ✗ No scene break for message 43
[AutoSummarize] [DEBUG]   Rationale: Conversation continues in same location and timeframe
```

### Rationale in Toast Notifications
When a scene break is detected, the toast notification includes the rationale:
```
✓ Scene break at message 42 - Time skip indicated by 'the next morning'. Total: 3
```

This helps you understand why the LLM made each decision without digging through logs.

### JSON Parsing Fallback
If the LLM response doesn't contain valid JSON, the system falls back to simple text search:
- Searches for "true" in response (case insensitive)
- Logs a warning about the fallback in the debug output
- Rationale set to "No JSON found, fallback to text search"

## Edge Cases

1. **Empty Messages**: Skip messages with no text content
2. **System Messages**: Filtered out automatically (extra?.type === 'system')
3. **First Message**: Always skipped (index 0 cannot be scene break)
4. **Multiple Swipes**: Each swipe creates new message object → fresh check
5. **API Errors**: Retry with exponential backoff, don't mark as checked until success
6. **Rate Limiting**: 10s/20s/40s/80s/160s backoff delays handle rate limits
7. **Long Messages**: Ensure combined previous + current message don't exceed token limits
8. **Invalid JSON**: Falls back to text search for "true"

## Future Enhancements

1. **Confidence Scoring**: Parse confidence level from LLM response
2. **Batch Detection**: Process multiple messages in single API call
3. **Custom Rules**: User-defined regex patterns for instant detection (skip LLM call)
4. **Undo Auto-Detection**: Button to remove auto-detected scene breaks
5. **Detection History**: Track which messages were auto-detected vs manual
6. **Scene Break Suggestions**: Show suggestions without auto-marking (require user confirmation)

## File Changes Summary

### New Files
- `autoSceneBreakDetection.js` - Core detection logic (with auto-generate scene summary integration)

### Modified Files
- `defaultSettings.js` - Add default settings (including `auto_scene_break_generate_summary`)
- `defaultPrompts.js` - Add default detection prompt with JSON response format
- `settings.html` - Add UI section with auto-generate checkbox
- `settingsUI.js` - Wire up settings UI (including auto-generate binding)
- `eventHandlers.js` - Add event triggers for auto-detection
- `index.js` - Add barrel exports for autoSceneBreakDetection module
- `sceneBreak.js` - Extract `generateSceneSummary()` function for reuse

### Files to Reference
- `sceneBreak.js` - Use `toggleSceneBreak()` to mark messages and `generateSceneSummary()` to create summaries
- `summarization.js` - Use `summarize_text()` for LLM calls
- `connectionProfiles.js` - Profile switching logic

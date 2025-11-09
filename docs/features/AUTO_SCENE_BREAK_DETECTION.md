# Auto Scene Break Detection

## Feature Overview

Automatic scene break detection uses an LLM to analyze message ranges and determine if any messages represent logical scene breaks in the roleplay. The system analyzes entire ranges of messages (from last scene break to latest) in a single LLM call, with the LLM returning which message number (if any) should be marked as a scene break. The system can automatically run on chat load and/or for new messages (per-event settings), and can also be triggered manually via the navbar "Scan Scene Breaks" button.

## Requirements

### Core Functionality
1. **LLM-Based Detection**: Uses separate LLM calls with configurable prompt to analyze message ranges for scene breaks
2. **Message Number Output**: LLM returns a message number (e.g., 5) or false; response is validated and retried if invalid
3. **Range-Based Analysis**: Analyzes entire message ranges (from last scene break to latest) in one LLM call instead of checking one-by-one
4. **Message Tracking**: Tracks which messages have been checked on the message object itself (swipe/regen clears tracking)
5. **Message Offset**: Configurable offset from latest message (default: 2, meaning skip 2 most recent messages)
6. **Minimum Scene Length**: Enforces minimum number of messages (default: 4) before allowing scene breaks
7. **Automatic Triggers**: Run on chat load and new messages (both configurable, default: enabled)
8. **Manual Trigger**: User can manually trigger detection via button/command
9. **Recursive Scanning**: When break found mid-range, marks up to that point and queues new detection for remainder

### Storage Strategy
- **Checked Status**: Store `auto_scene_break_checked: true` on message object via `set_data()`
- **Swipe Behavior**: When message is swiped/regenerated, tracking is lost → message will be re-checked
- **No Global Tracking**: Do NOT use extension_settings or chat-level tracking

### API Integration
- **Own Connection Profile**: Separate optional connection profile for detection calls
- **Own Completion Preset**: Separate optional preset for detection calls
- **Fallback**: If profile/preset not set, use current profile/preset
- **Similar to Scene Recap**: Follow same pattern as scene recap generation

### Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `auto_scene_break_on_load` | boolean | false | Auto-check messages when chat loads |
| `auto_scene_break_on_new_message` | boolean | true | Auto-check when new message arrives |
| `auto_scene_break_generate_recap` | boolean | true | Auto-generate scene recap when a scene break is detected |
| `auto_scene_break_message_offset` | number | 2 | How many messages back from latest to skip (2 = skip 2 most recent, 0 = check all including latest) |
| `auto_scene_break_check_which_messages` | string | "both" | Which messages to analyze: "user" (user only), "character" (AI only), "both" (all messages) |
| `auto_scene_break_minimum_scene_length` | number | 4 | Minimum number of filtered messages required before allowing a scene break (prevents breaking too early) |
| `auto_scene_break_prompt` | string | (see below) | LLM prompt template for range-based detection |
| `auto_scene_break_prefill` | string | "" | Prefill to enforce JSON output (optional) |
| `auto_scene_break_connection_profile` | string | "" | Optional API connection profile |
| `auto_scene_break_completion_preset` | string | "" | Optional completion preset |

### Default Prompt
```
You are segmenting a roleplay transcript into scene-sized chunks (short, chapter-like story beats).
Your task is to analyze the provided messages and determine if ANY of them marks the start of a new scene, outputting ONLY valid JSON.

MANDATORY OUTPUT FORMAT:
Your response MUST start with { and end with }. No code fences, no commentary, no additional text before or after the JSON.

Required format (copy this structure exactly):
{
  "sceneBreakAt": false OR a message number (e.g., 5),
  "rationale": "Quote the key cue that triggered your decision"
}

Example valid responses:
{"sceneBreakAt": 5, "rationale": "Message #5 opens with explicit time skip: 'The next morning...'"}
{"sceneBreakAt": false, "rationale": "All messages are part of the same continuous scene"}

MINIMUM SCENE LENGTH RULE:
- At least {{minimum_scene_length}} messages must occur before you can mark a scene break
- This ensures scenes are not broken too early
- Count only the messages of the type being analyzed (user/character/both as configured)

Messages to analyze (with SillyTavern message numbers):
{{messages}}

REMINDER:
- Output must be valid JSON starting with { character
- Return the message NUMBER (as shown above) or false
- Return ONLY the FIRST qualifying scene break
```

> **Macros:** `{{messages}}` expands to all messages in the range formatted with their SillyTavern message numbers (e.g., "Message #5 [USER]: text"). `{{minimum_scene_length}}` expands to the configured minimum scene length setting.

**Response Format:**
The LLM returns a JSON object with:
- `sceneBreakAt`: Message number (e.g., 5) or false
- `rationale`: Brief explanation for debugging/troubleshooting

Example responses:
```json
{"sceneBreakAt": 5, "rationale": "Message #5: Location changed from bedroom to kitchen"}
{"sceneBreakAt": false, "rationale": "All messages are part of the same continuous scene"}
{"sceneBreakAt": 12, "rationale": "Message #12: Time skip indicated by 'later that evening'"}
```

**Validation:**
Responses are validated to ensure:
1. `sceneBreakAt` is either false or a valid message number in the analyzed range
2. Message number is in the filtered set (matches the configured message type filter)
3. At least `minimum_scene_length` messages exist before the break point
4. Invalid responses trigger automatic retry

### Default Prefill
```
(blank - no default prefill)
```

## Technical Implementation

### Module: `autoSceneBreakDetection.js`

#### Core Functions

```javascript
/**
 * Format messages for range-based detection with ST message numbers
 * @param {Array} chat - Chat messages array
 * @param {number} startIndex - Start of range
 * @param {number} endIndex - End of range
 * @param {string} checkWhich - Message type filter ("user", "character", "both")
 * @returns {Object} - {formatted: string, filteredIndices: array}
 */
function formatMessagesForRangeDetection(chat, startIndex, endIndex, checkWhich)

/**
 * Detect scene breaks in a message range using LLM
 * @param {number} startIndex - Start of range to analyze
 * @param {number} endIndex - End of range to analyze
 * @returns {Promise<{sceneBreakAt: number|false, rationale: string, filteredIndices: array}>}
 */
async function detectSceneBreak(startIndex, endIndex)

/**
 * Validate scene break response from LLM
 * @param {number|false} sceneBreakAt - Message number or false
 * @param {number} startIndex - Start of analyzed range
 * @param {number} endIndex - End of analyzed range
 * @param {Array<number>} filteredIndices - Array of filtered message indices
 * @param {number} minimumSceneLength - Minimum required scene length
 * @returns {Object} - {valid: boolean, reason?: string}
 */
function validateSceneBreakResponse(sceneBreakAt, startIndex, endIndex, filteredIndices, minimumSceneLength)

/**
 * Process new message for scene break detection
 * @param {number} messageIndex - Index of the new message
 */
async function processNewMessageForSceneBreak(messageIndex)

/**
 * Manually trigger scene break detection on all eligible messages
 */
async function manualSceneBreakDetection()
```

#### Detection Logic Flow

1. **Entry Point** (`processNewMessageForSceneBreak` or `manualSceneBreakDetection`)
   - Get settings: enabled, offset, message type filter, minimum scene length
   - Determine range: from (latest visible scene break + 1) to (latest - offset)
   - If no scene break exists, start from message 0
   - Queue range-based detection operation

2. **Range Formatting** (`formatMessagesForRangeDetection`)
   - Format all messages in range with SillyTavern message numbers
   - Filter messages by configured type (user/character/both)
   - Format as "Message #X [USER/CHARACTER]: text"
   - Return formatted string and array of filtered indices

3. **Range Analysis** (`detectSceneBreak`)
   - Get prompt template, prefill, and settings
   - Check if enough filtered messages exist (minimum + 1)
   - Substitute `{{messages}}` and `{{minimum_scene_length}}` in prompt
   - Switch to detection connection profile/preset if configured
   - Call `recap_text(prompt)` to send to LLM
   - Parse JSON response to extract `sceneBreakAt` (message number or false) and `rationale`
   - Fallback: Try multiple patterns to extract message number if JSON parsing fails
   - Restore original connection profile/preset
   - Return `{sceneBreakAt: number|false, rationale: string, filteredIndices: array}`

4. **Response Validation** (`validateSceneBreakResponse`)
   - If sceneBreakAt is false, validation passes
   - Check if sceneBreakAt is a valid number
   - Check if number is within the analyzed range (startIndex to endIndex)
   - Check if number is in the filtered message set
   - Check if at least `minimum_scene_length` messages exist before the break
   - Invalid responses trigger automatic retry (operation remains in queue)

5. **Scene Break Marking & Recursive Scanning**
   - If sceneBreakAt is valid:
     - Call `toggleSceneBreak(sceneBreakAt, ...)` to mark the message
     - Mark all messages from startIndex to sceneBreakAt as checked
     - If sceneBreakAt < endIndex, queue new detection for remainder (sceneBreakAt+1 to endIndex)
     - Optionally queue scene recap generation if enabled
   - If sceneBreakAt is false:
     - Mark entire range as checked (no break found)

5. **Auto-Generate Scene Recap** (Optional)
   - If `auto_scene_break_generate_recap` is enabled:
     - Call `generateSceneRecap(messageIndex, ...)` from sceneBreak.js
     - Wait for recap generation to complete before continuing
     - This ensures sequential processing: recap finishes before checking next message
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
   - If enabled, call `processNewMessageForSceneBreak(messageIndex)`
   - Determines range from (latest visible scene break + 1) to (messageIndex - offset)
   - Queues single range-based detection operation

2. **CHAT_CHANGED**
   - Check `auto_scene_break_on_load` setting
   - If enabled, call `processAutoSceneBreakDetection()` to scan all unchecked messages
   - Analyzes entire chat in ranges from scene break to scene break

3. **Manual Trigger**
   - Navbar button: "Scan Scene Breaks"
   - Calls `manualSceneBreakDetection()` which processes all eligible messages in ranges

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
    <input type="checkbox" id="auto_scene_break_generate_recap" />
    <span>Auto-generate Scene Recap on Detection</span>
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
message.scene_break_recap = "Recap";  // String
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
[AutoRecap] [DEBUG] ✓ SCENE BREAK DETECTED for message 42
[AutoRecap] [DEBUG]   Rationale: Time skip indicated by 'the next morning'
```

or

```
[AutoRecap] [DEBUG] ✗ No scene break for message 43
[AutoRecap] [DEBUG]   Rationale: Conversation continues in same location and timeframe
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

## File Changes Recap

### New Files
- `autoSceneBreakDetection.js` - Core detection logic (with auto-generate scene recap integration)

### Modified Files
- `defaultSettings.js` - Add default settings (including `auto_scene_break_generate_recap`)
- `defaultPrompts.js` - Add default detection prompt with JSON response format
- `settings.html` - Add UI section with auto-generate checkbox
- `settingsUI.js` - Wire up settings UI (including auto-generate binding)
- `eventHandlers.js` - Add event triggers for auto-detection
- `index.js` - Add barrel exports for autoSceneBreakDetection module
- `sceneBreak.js` - Extract `generateSceneRecap()` function for reuse

### Files to Reference
- `sceneBreak.js` - Use `toggleSceneBreak()` to mark messages and `generateSceneRecap()` to create recaps
- `recapping.js` - Use `recap_text()` for LLM calls
- `connectionProfiles.js` - Profile switching logic

# SillyTavern Playwright MCP Reference

**Documentation for interacting with SillyTavern via Playwright MCP for testing the ST-Auto-Summarize extension.**

## Critical Testing Requirements

### ALWAYS Refresh SillyTavern Between Code Changes

**IMPORTANT**: After making ANY code changes to the extension, you MUST reload SillyTavern before testing:

```javascript
await page.goto('http://127.0.0.1:8000');
```

- Extension code is loaded once when SillyTavern starts
- Changes to `.js` files will NOT be reflected until SillyTavern is reloaded
- **DO NOT** assume your code changes are active without reloading first

## SillyTavern URL

- Default: `http://127.0.0.1:8000`
- Must be running locally before testing

## Common UI Elements

### Opening a Character

```javascript
// Find and click a character card
const cards = Array.from(document.querySelectorAll('.character_select'));
const characterCard = cards.find(card =>
  card.querySelector('.ch_name')?.textContent?.includes('CharacterName')
);
characterCard?.click();
```

### Message Swipes

**Swipe Controls:**
- `.swipe_left` - Navigate to previous swipe
- `.swipe_right` - Navigate to next swipe OR create new swipe if at the end
- Counter format: "X/Y" where X is current swipe (1-indexed for display) and Y is total swipes

**Swipe Right Behavior:**
- If on last swipe: Creates a NEW swipe and triggers message generation
- If not on last swipe: Just navigates to the next existing swipe

**Getting Swipe Right Button:**

```javascript
const messages = document.querySelectorAll('.mes');
const lastMessage = messages[messages.length - 1];
const swipeRightBtn = lastMessage.querySelector('.swipe_right');
swipeRightBtn?.click();
```

**IMPORTANT: Swipe vs Regenerate**
- **Swiping**: Creates alternative message versions, preserving all previous swipes
- **Regenerating**: Replaces the current message entirely, losing the previous version
- The swipe right button creates NEW swipes, NOT regenerations

### Message Data Structure

**Accessing Message Data:**

```javascript
const ctx = window.SillyTavern.getContext();
const lastMessage = ctx.chat[ctx.chat.length - 1];

// Current swipe index (0-based internally)
const swipeId = lastMessage.swipe_id;

// Total number of swipes
const totalSwipes = lastMessage.swipes?.length;

// Swipe-specific data
const swipeData = lastMessage.swipe_info?.[swipeId]?.extra?.auto_summarize_memory;

// Root data (shared across all swipes for non-swipe-local keys)
const rootData = lastMessage.extra?.auto_summarize_memory;
```

**Swipe-Local vs Shared Data:**
- **Swipe-local keys**: Stored only in `message.swipe_info[swipe_index].extra`
- **Shared keys**: Stored in `message.extra` and synchronized to all swipes
- For ST-Auto-Summarize: `scene_summary_*` keys are swipe-local, `scene_break*` keys are shared

### Extension-Specific UI Elements

**ST-Auto-Summarize Message Buttons:**
- `.auto_summarize_scene_break_button` - Mark end of scene
- `.auto_summarize_memory_remember_button` - Remember (toggle long-term memory)
- `.auto_summarize_memory_forget_button` - Force exclude from memory
- `.auto_summarize_memory_edit_button` - Edit summary
- `.auto_summarize_memory_summarize_button` - Summarize (AI)

**Scene Break UI:**
- Scene name input: `textbox "Scene name..."`
- Scene summary textarea: `textbox "Scene summary..."`
- Scene controls: `.scene-rollback-summary`, `.scene-generate-summary`, `.scene-rollforward-summary`

**Accessing Scene Break Data:**

```javascript
const message = ctx.chat[messageIndex];
const swipeId = message.swipe_id;

// Scene break marker (shared across swipes)
const hasSceneBreak = message.swipe_info?.[swipeId]?.extra?.auto_summarize_memory?.scene_break;

// Scene summary (swipe-specific)
const sceneSummary = message.swipe_info?.[swipeId]?.extra?.auto_summarize_memory?.scene_summary_memory;
```

## Console Logs for Debugging

**Enable Debug Mode:**
The extension outputs detailed console logs when debug mode is enabled in settings.

**Key Log Patterns:**

```
[get_data] key="scene_summary_memory", swipe_id=X, swipes.length=Y
[get_data] swipe_data=EXISTS/undefined, root_data=EXISTS/undefined
[get_data] Swipe-local key: returning swipe data only (no root fallback)
[SCENE SUMMARY] Skipping index X: no summary
[SCENE SUMMARY] Including index X: summary present
```

**Interpreting Logs:**
- `swipe_data=undefined` means the swipe doesn't have this data stored
- `root_data=EXISTS` means the key exists in root storage
- For swipe-local keys, root data should be ignored even if it exists
- `[SCENE SUMMARY] Final collected indexes: [X, Y, Z]` shows which messages have scene summaries being injected

## Testing Patterns

### Verify Swipe-Local Behavior

```javascript
// 1. Create a new swipe
const swipeRightBtn = lastMessage.querySelector('.swipe_right');
swipeRightBtn?.click();

// 2. Wait for generation to complete
await page.waitForTimeout(5000);

// 3. Check swipe data
const ctx = window.SillyTavern.getContext();
const msg = ctx.chat[ctx.chat.length - 1];
const newSwipeId = msg.swipe_id;
const newSwipeData = msg.swipe_info?.[newSwipeId]?.extra?.auto_summarize_memory?.scene_summary_memory;

// New swipes should NOT inherit scene summaries
console.log('New swipe has scene summary:', !!newSwipeData);
```

### Clean Up Test Data

```javascript
// Remove swipe-local keys from root storage
const ctx = window.SillyTavern.getContext();
const SWIPE_LOCAL_KEYS = [
  'scene_summary_versions',
  'scene_summary_current_index',
  'scene_summary_memory',
  'scene_summary_include'
];

for (let msg of ctx.chat) {
  if (msg.extra?.auto_summarize_memory) {
    for (let key of SWIPE_LOCAL_KEYS) {
      delete msg.extra.auto_summarize_memory[key];
    }
  }
}
```

## Common Issues

### Edit Mode Instead of Swipe

**Problem:** Clicking swipe buttons triggers edit mode instead of swiping

**Solution:** The click event might be intercepted. Use direct JavaScript click:

```javascript
const swipeRightBtn = lastMessage.querySelector('.swipe_right');
swipeRightBtn.click(); // Direct JavaScript click
```

### Message Swipe Counter

**Problem:** Counter shows "34/33" or similar (current > total)

**Solution:** This is normal during generation - counter shows the swipe being generated before it's added to the array

### Playwright Response Too Large

**Problem:** `browser_evaluate` returns error about exceeding token limit

**Solution:** Limit the data returned in your evaluation function:

```javascript
// Bad: Returns entire message object
return ctx.chat[ctx.chat.length - 1];

// Good: Returns only needed fields
return {
  swipe_id: msg.swipe_id,
  total_swipes: msg.swipes?.length,
  has_summary: !!msg.swipe_info?.[msg.swipe_id]?.extra?.auto_summarize_memory?.scene_summary_memory
};
```

## Testing Workflow

1. **Make code changes** to extension files
2. **Reload SillyTavern**: `await page.goto('http://127.0.0.1:8000')`
3. **Open character** using character selection
4. **Perform test actions** (swipe, generate, etc.)
5. **Verify behavior** using console logs and data inspection
6. **Repeat** as needed

## Module Name

The extension stores data under the key: `'auto_summarize_memory'`

All extension data is accessed via:
- `message.extra.auto_summarize_memory` (root storage)
- `message.swipe_info[swipe_index].extra.auto_summarize_memory` (swipe storage)

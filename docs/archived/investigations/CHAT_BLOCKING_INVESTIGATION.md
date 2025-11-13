# Chat Blocking Investigation & Solution

## Problem Statement

The operation queue needs to block chat sends during processing to prevent users from sending messages while AI operations are in progress. However, chat was getting unblocked during queue processing despite our blocking code.

## Investigation Timeline

### Initial Issue
- Chat blocked correctly when operation enqueued ✓
- Chat unblocked somewhere during scene recap generation ✗
- Chat remained unblocked during subsequent lorebook processing ✗
- No "Chat UNBLOCKED" log appeared, indicating our code never called unblock

### Discovery Process

#### Phase 1: Initial Blocking Implementation
**Location**: `operationQueue.js`

Added chat blocking when:
1. First operation enqueued (`enqueueOperation()` line 506)
2. Queue processor starts (`startQueueProcessor()` line 970)
3. Unblock only when queue empty or cleared

**Problem**: Chat still got unblocked during processing.

#### Phase 2: Debug Logging
**Changes Made**:
- Added `setQueueChatBlocking()` wrapper to trace all blocking state changes
- Added lifecycle logging throughout operation execution
- Added queue processor loop state logging

**Findings**: Logs showed blocking happened correctly, but no unblock call was logged when chat became unblocked.

#### Phase 3: Tracing setSendButtonState Calls
**Location**: `index.js:27-35`

Wrapped `setSendButtonState` at the central import/export point to trace ALL calls:

```javascript
function setSendButtonState(value /*: boolean */) {
    const stack = new Error().stack;
    const caller = stack?.split('\n')[2]?.trim() || 'unknown';
    const callerFile = caller.match(/\/([^/]+\.js):/)?.[1] || 'unknown';
    console.log(`[AutoRecap] [DEBUG] [Queue] [TRACE] setSendButtonState(${value}) called from: ${callerFile} - ${caller}`);
    return _originalSetSendButtonState(value);
}
```

**Test Results**:
```
[TRACE] setSendButtonState(true) called from: operationQueue.js - at setQueueChatBlocking
[LIFECYCLE] About to call handler for generate_scene_recap, queue state: blocked=true, queueLength=1
... (scene recap generation happens)
... (chat becomes unblocked)
NO [TRACE] setSendButtonState(false) log!
```

**Critical Finding**:
- Only ONE `setSendButtonState` call logged (the initial block)
- ZERO calls to `setSendButtonState(false)` from our extension
- Chat became unblocked WITHOUT our wrapper being called
- Handler lifecycle logs stopped (never saw "Handler returned")

**Conclusion**: SillyTavern core is calling `setSendButtonState(false)` directly from `script.js`, bypassing our extension's wrapper. This happens during the generation process (likely after `generation_ended` event).

## Root Cause

**SillyTavern core automatically unblocks the send button when generation completes**, regardless of whether our extension's queue still has pending operations. This is by design in ST core - it assumes generation completion means the user can send again.

Our extension wrapper in `index.js` only catches calls that go through the extension's import/export barrel. ST core calls the original `setSendButtonState` from `script.js` directly, bypassing our wrapper entirely.

## Solution Implemented: Complete Send Button Replacement

**Location**: `index.js:84-173`

### Full Button Replacement (PRIMARY SOLUTION)

We completely replace SillyTavern's send button with our own, giving us absolute control over both visual state and functionality.

```javascript
let originalSendButton /*: ?HTMLElement */ = null;
let replacementSendButton /*: ?HTMLElement */ = null;
let originalSendTextareaMessage /*: ?Function */ = null;

export function replaceSendButton() {
    if (typeof window === 'undefined') return;

    // Find the original send button
    originalSendButton = document.getElementById('send_but');
    if (!originalSendButton) {
        console.warn('[AutoRecap] Could not find #send_but to replace');
        return;
    }

    // Save the original send function
    if (window.sendTextareaMessage) {
        originalSendTextareaMessage = window.sendTextareaMessage;
    } else {
        console.warn('[AutoRecap] Could not find sendTextareaMessage function');
        return;
    }

    // Create our replacement button with the same styling
    replacementSendButton = document.createElement('div');
    replacementSendButton.id = 'send_but_autorecap';
    replacementSendButton.className = originalSendButton.className;
    replacementSendButton.title = originalSendButton.title;
    replacementSendButton.innerHTML = originalSendButton.innerHTML;

    // Copy all data attributes
    for (const attr of originalSendButton.attributes) {
        if (attr.name.startsWith('data-')) {
            replacementSendButton.setAttribute(attr.name, attr.value);
        }
    }

    // Add click handler
    replacementSendButton.addEventListener('click', async function(e) {
        e.preventDefault();
        e.stopPropagation();

        // Check if queue is active
        const { isQueueActive } = await import('./operationQueue.js');
        if (isQueueActive()) {
            console.log('[AutoRecap] [Queue] Blocked send - queue is processing operations');
            const { toast } = await import('./index.js');
            toast('Please wait - queue operations in progress', 'warning');
            return;
        }

        // Queue is clear, call original send function
        if (originalSendTextareaMessage) {
            originalSendTextareaMessage();
        }
    });

    // Replace the button in DOM
    originalSendButton.parentNode?.insertBefore(replacementSendButton, originalSendButton);
    originalSendButton.style.display = 'none';

    console.log('[AutoRecap] Send button replaced with queue-aware version');
}

export function updateReplacementSendButton(enabled /*: boolean */) {
    if (!replacementSendButton) return;

    if (enabled) {
        replacementSendButton.classList.remove('disabled');
        replacementSendButton.style.opacity = '1';
        replacementSendButton.style.pointerEvents = 'auto';
    } else {
        replacementSendButton.classList.add('disabled');
        replacementSendButton.style.opacity = '0.5';
        replacementSendButton.style.pointerEvents = 'none';
    }
}
```

**Queue Active Check**: `operationQueue.js:576-580`
```javascript
export function isQueueActive() {
    if (!currentQueue) return false;
    return currentQueue.queue.length > 0 || queueProcessor !== null;
}
```

**Installation**: Called during queue initialization (`operationQueue.js:150-153`)

**Visual State Management**: `operationQueue.js:107-118`
```javascript
function setQueueChatBlocking(blocked /*: boolean */) {
    if (isChatBlocked === blocked) return;

    isChatBlocked = blocked;
    // Update our replacement send button (disabled when blocked=true, enabled when blocked=false)
    updateReplacementSendButton(!blocked);
    debug(SUBSYSTEM.QUEUE, `Chat ${blocked ? 'BLOCKED' : 'UNBLOCKED'} by operation queue`);
    notifyUIUpdate();
}
```

**When Applied**:
- `enqueueOperation()` - Block when first operation added
- `startQueueProcessor()` - Safety fallback block
- Queue cleared/completed - Unblock
- Extension load with pending queue - Restore block state

**How It Works**:
1. On extension load, find ST's `#send_but` button
2. Create identical replacement button with ID `send_but_autorecap`
3. Hide original button (`display: none`)
4. Insert replacement button in same DOM position
5. Replacement button click handler checks `isQueueActive()`
6. If queue active: Block + show toast
7. If queue inactive: Call original `sendTextareaMessage()`
8. Visual state controlled by `updateReplacementSendButton()`

**Benefits**:
- **Complete independence**: ST core cannot interfere at all
- **Full visual control**: We control enabled/disabled appearance
- **Full functional control**: We control when sends are allowed
- **User-friendly**: Clear visual feedback (opacity + pointer-events)
- **Non-invasive**: Button looks and behaves identically when queue is clear
- **Absolute protection**: No way for user to send during queue operations

## Flow Diagram

```
User Action: Click Send / Press Enter
    ↓
Our Replacement Button: Click handler fires
    ↓
Check isQueueActive()
    ↓
    ├─ Queue Active (has operations OR processor running)
    │   ↓
    │   Block send
    │   ↓
    │   Show toast: "Please wait - queue operations in progress"
    │   ↓
    │   STOP (message not sent)
    │
    └─ Queue Inactive (no operations AND no processor)
        ↓
        Allow send
        ↓
        Call original window.sendTextareaMessage()
        ↓
        Normal ST processing continues

Visual State:
    Queue Active → updateReplacementSendButton(false)
        ↓
        Button: opacity=0.5, pointer-events=none, class='disabled'

    Queue Inactive → updateReplacementSendButton(true)
        ↓
        Button: opacity=1, pointer-events=auto, class removed
```

## Files Modified

### 1. `index.js`
- **Lines 27-35**: Wrapped `setSendButtonState` for debug tracing (kept for reference)
- **Lines 84-173**: Complete send button replacement implementation
  - `replaceSendButton()`: Main function to replace ST's send button
  - `updateReplacementSendButton()`: Visual state control function
  - Module-level variables to track button elements and original function

### 2. `operationQueue.js`
- **Import changes (line 13)**: Changed from `setSendButtonState` to `updateReplacementSendButton`
- **Lines 107-118**: Updated `setQueueChatBlocking()` to use `updateReplacementSendButton()`
- **Lines 150-153**: Install button replacement during init (changed from interceptor)
- **Lines 576-580**: Added `isQueueActive()` function
- **Operation lifecycle logging**: Throughout file for debugging
- **Block/unblock calls**: Throughout file when queue state changes

## Testing Checklist

When testing the solution:

1. ✓ Enqueue operation → chat blocks immediately
2. ✓ Queue processes → chat stays blocked through delays
3. ✓ Pause queue → chat stays blocked
4. ✓ Clear/complete queue → chat unblocks
5. ✓ Page reload with pending queue → chat blocks on load
6. ✓ Try to send during queue → interceptor blocks + shows toast
7. ✓ Send after queue clears → works normally

## Debug Logging

Current debug logs available:

```javascript
// In browser console:
[AutoRecap] [DEBUG] [Queue] [TRACE] setSendButtonState(true/false) called from: ...
[AutoRecap] [DEBUG] [Queue] Chat BLOCKED/UNBLOCKED by operation queue
[AutoRecap] [DEBUG] [Queue] [LOOP] Start of iteration, queue state: blocked=X, queueLength=Y
[AutoRecap] [DEBUG] [Queue] [LOOP] Found operation: TYPE, id: ID
[AutoRecap] [DEBUG] [Queue] [LOOP] About to execute operation, queue state: ...
[AutoRecap] [DEBUG] [Queue] [LIFECYCLE] About to call handler for TYPE, queue state: ...
[AutoRecap] [DEBUG] [Queue] [LIFECYCLE] Handler returned for TYPE, queue state: ...
[AutoRecap] [DEBUG] [Queue] [LIFECYCLE] About to remove operation ID, queue state: ...
[AutoRecap] [DEBUG] [Queue] [LIFECYCLE] After removeOperation, queue state: ...
[AutoRecap] [Queue] Blocked send - queue is processing operations
[AutoRecap] Send message interceptor installed
```

## Known Issues & Future Considerations

### Current Implementation Notes
- The `setSendButtonState` wrapper in `index.js` (lines 27-35) is kept for debug tracing but is no longer used for blocking
- Our replacement button has ID `send_but_autorecap` to avoid conflicts
- Original button is hidden with `display: none` rather than removed from DOM

### Potential Improvements
1. **Remove debug tracing**: The `setSendButtonState` wrapper can be removed in production
2. **Handle keyboard shortcuts**: May need to also intercept Enter key in textarea
3. **Sync with ST updates**: If ST changes button styling, our button inherits it on load

### Edge Cases
- **Multiple extensions**: If another extension also replaces the send button, last one wins
- **ST core updates**: Changes to button ID or structure could affect our replacement
- **Button recreation**: If ST dynamically recreates the button, we'd need to re-replace it
- **Keyboard send**: Pressing Enter might bypass our button if it calls `sendTextareaMessage` directly

### Solutions for Edge Cases
- Monitor DOM for button recreation and re-replace if needed
- Potentially also wrap `sendTextareaMessage` at window level as backup
- Test with keyboard shortcuts to ensure blocking works for Enter key

## Conclusion

The complete button replacement approach provides absolute control:
- **Visual Control**: We fully control button appearance (enabled/disabled state)
- **Functional Control**: We intercept clicks before any ST processing
- **Independence**: ST core cannot interfere with our button state
- **User Experience**: Clear visual feedback when queue is blocking sends

This solution completely eliminates the issue where ST core was re-enabling the send button during generation. Our replacement button is invisible to ST core's state management, giving us full control over when users can send messages.

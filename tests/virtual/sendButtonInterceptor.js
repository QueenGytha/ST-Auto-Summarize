// @flow
// sendButtonInterceptor.js - Intercept send button to process latest message before generation

// $FlowFixMe[cannot-resolve-module] - SillyTavern core module
// $FlowFixMe[missing-export] - saveMetadataDebounced exists in extensions.js runtime
import { saveMetadataDebounced } from './stubs/externals.js';

// Will be imported from index.js via barrel exports
let log /*: any */, debug /*: any */, error /*: any */, toast /*: any */;  // Logging functions - any type is legitimate
let processTrackingUpdates /*: any */;  // Function from trackingEntries module - any type is legitimate
let getContext /*: any */;  // SillyTavern getContext function - any type is legitimate

let isProcessing = false;
let isIntercepting = false;

/**
 * Initialize the send button interceptor
 */
// $FlowFixMe[signature-verification-failure]
export function initSendButtonInterceptor(utils /*: any */, trackingModule /*: any */) /*: void */ {
    // utils and trackingModule are any type - passed as objects with various properties - legitimate use of any
    log = utils.log;
    debug = utils.debug;
    error = utils.error;
    toast = utils.toast;

    if (trackingModule) {
        processTrackingUpdates = trackingModule.processTrackingUpdates;
    }

    getContext = window.SillyTavern?.getContext;
}

/**
 * Get the send button element
 */
function getSendButton() {
    return document.getElementById('send_but');
}

/**
 * Find the latest AI message in chat
 */
function getLatestAIMessage() {
    try {
        if (!getContext) {
            error("SillyTavern context not available");
            return null;
        }

        const ctx = getContext();
        if (!ctx || !ctx.chat || ctx.chat.length === 0) {
            return null;
        }

        // Find the last message that isn't from the user
        for (let i = ctx.chat.length - 1; i >= 0; i--) {
            const message = ctx.chat[i];
            if (!message.is_user) {
                return message;
            }
        }

        return null;
    } catch (err) {
        error("Error getting latest AI message", err);
        return null;
    }
}

/**
 * Process the latest AI message for lorebook updates
 */
async function processLatestMessage() {
    try {
        const latestMessage = getLatestAIMessage();

        if (!latestMessage) {
            debug("No AI message to process");
            return;
        }

        debug("Processing latest AI message before send");

        // Process tracking updates (GM notes, character stats)
        if (processTrackingUpdates) {
            await processTrackingUpdates(latestMessage);
        }

        // Save metadata
        if (saveMetadataDebounced) {
            saveMetadataDebounced();
        }

        debug("Latest message processed successfully");

    } catch (err) {
        error("Error processing latest message", err);
        throw err;
    }
}

/**
 * Trigger the actual send action by calling SillyTavern's send function directly
 */
function triggerActualSend() {
    try {
        // Set a flag to bypass our interceptor
        window.__autoLorebooksProcessing = true;

        // Get the send button and trigger click
        const sendButton = getSendButton();
        if (!sendButton) {
            error("Send button not found");
            window.__autoLorebooksProcessing = false;
            return;
        }

        // Trigger the click - our handler will see the flag and let it through
        sendButton.click();

        // Clear the flag after a short delay
        setTimeout(() => {
            window.__autoLorebooksProcessing = false;
        }, 500);

    } catch (err) {
        error("Error triggering actual send", err);
        window.__autoLorebooksProcessing = false;
    }
}

/**
 * Our intercepted click handler
 */
async function interceptedClickHandler(event /*: any */) /*: Promise<void> */ {
    // event is DOM Event object - any type is legitimate for DOM events
    // If we're in bypass mode, let the click through
    if (window.__autoLorebooksProcessing) {
        debug("Bypassing interception for actual send");
        return; // Let the event propagate to SillyTavern's handler
    }

    // Prevent default and stop propagation to intercept the click
    event.preventDefault();
    event.stopImmediatePropagation();

    // Prevent double-processing
    if (isProcessing) {
        debug("Already processing, ignoring click");
        return;
    }

    try {
        isProcessing = true;

        // Process latest AI message (update lorebooks)
        await processLatestMessage();

        // Now trigger the actual send
        triggerActualSend();

    } catch (err) {
        error("Error in intercepted send handler", err);
        toast("Failed to process message before send", "error");

        // Still try to send even if processing failed
        triggerActualSend();

    } finally {
        isProcessing = false;
    }
}

/**
 * Enable send button interception
 */
export function enableInterception() {
    try {
        if (isIntercepting) {
            debug("Interception already enabled");
            return;
        }

        const sendButton = getSendButton();
        if (!sendButton) {
            error("Send button not found, cannot enable interception");
            return;
        }

        // Add our interceptor with capture phase (true) to catch the event before SillyTavern's handler
        sendButton.addEventListener('click', interceptedClickHandler, true);

        isIntercepting = true;

        log("Send button interception enabled");
        debug("Will process latest AI message before sending");

    } catch (err) {
        error("Error enabling send button interception", err);
    }
}

/**
 * Disable send button interception
 */
export function disableInterception() {
    try {
        if (!isIntercepting) {
            return;
        }

        const sendButton = getSendButton();
        if (!sendButton) {
            return;
        }

        // Remove our event listener
        sendButton.removeEventListener('click', interceptedClickHandler, true);

        isIntercepting = false;

        log("Send button interception disabled");

    } catch (err) {
        error("Error disabling send button interception", err);
    }
}

/**
 * Update interception state based on settings
 */
export function updateInterceptionState(enabled /*: boolean */) /*: void */ {
    try {
        if (enabled) {
            enableInterception();
        } else {
            disableInterception();
        }
    } catch (err) {
        error("Error updating interception state", err);
    }
}

/**
 * Check if interception is currently active
 */
export function isInterceptionActive() /*: boolean */ {
    return isIntercepting;
}

export default {
    initSendButtonInterceptor,
    enableInterception,
    disableInterception,
    updateInterceptionState,
    isInterceptionActive
};

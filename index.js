function setup() {
  // DEBUG: Watch for any event being added
  const originalAddEventListener = window.addEventListener;
  window.addEventListener = function (type, listener, options) {
    console.log(`[Hook] addEventListener: ${type}`);
    return originalAddEventListener.call(this, type, listener, options);
  };

  // Try listening directly for any character messages
  document.addEventListener('character_message_rendered', (e) => {
    console.log('[Extension] character_message_rendered event captured:', e);
    const message = e.detail?.message;
    const messageElem = e.detail?.element;

    if (!messageElem) {
      console.warn('[Extension] No message element found');
      return;
    }

    const testBox = document.createElement('div');
    testBox.textContent = '✅ Extension triggered for message';
    testBox.style.border = '1px solid green';
    testBox.style.padding = '4px';
    testBox.style.marginTop = '4px';
    messageElem.appendChild(testBox);
  });
}

window.addEventListener('load', () => {
  console.log('[Extension] Page fully loaded, setting up...');
  setup();
});
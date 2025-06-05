function setup() {
  window.addEventListener('character_message_rendered', (e) => {
    const message = e.detail.message;
    const messageElem = e.detail.element;

    console.log('[Extension] character_message_rendered event fired:', message, messageElem);

    // DEBUG: Check author field
    console.log('[Extension] message.author:', message.author);

    // Remove condition to test DOM modification first
    // Then add back conditional later
    if (messageElem) {
      // Append a visible marker div to confirm this works
      const debugDiv = document.createElement('div');
      debugDiv.style.color = 'red';
      debugDiv.textContent = '🛠️ Extension active: message rendered here';
      debugDiv.style.border = '1px solid red';
      debugDiv.style.padding = '4px';
      debugDiv.style.marginTop = '4px';

      messageElem.appendChild(debugDiv);
    }

    // Now try textarea only for AI messages if author info looks correct
    if (message && message.author && message.author.toLowerCase() === 'ai') {
      const textarea = document.createElement('textarea');
      textarea.style.width = '100%';
      textarea.style.marginTop = '8px';
      textarea.style.minHeight = '80px';
      textarea.placeholder = 'Edit the response here...';
      textarea.value = message.content || '';
      textarea.style.border = '1px solid #888';
      textarea.style.background = '#f9f9f9';

      messageElem.appendChild(textarea);
      console.log('[Extension] Added editable textarea to AI message.');
    } else {
      console.log('[Extension] Not AI message, skipped textarea.');
    }
  });
}

window.addEventListener('DOMContentLoaded', setup);
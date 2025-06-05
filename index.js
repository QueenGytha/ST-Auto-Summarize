// index.js for SillyTavern extension

function setup() {
  // Hook into rendering messages
  window.addEventListener('st_render_message', (e) => {
    const message = e.detail.message;
    const messageElem = e.detail.element;

    // Only add editable box for AI responses (adjust condition as needed)
    if (message.author === 'ai') {
      // Create editable textarea
      const textarea = document.createElement('textarea');
      textarea.style.width = '100%';
      textarea.style.marginTop = '8px';
      textarea.style.minHeight = '80px';
      textarea.placeholder = 'Edit the response here...';
      textarea.value = message.content;

      // Append textarea below the message element
      messageElem.appendChild(textarea);
    }
  });
}

// Run setup once the extension loads
setup();
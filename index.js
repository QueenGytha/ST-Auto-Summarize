function setup() {
  window.addEventListener('st_render_message', (e) => {
    const message = e.detail.message;
    const messageElem = e.detail.element;

    console.log('st_render_message fired', message, messageElem);

    if (message && message.author && message.author.toLowerCase() === 'ai') {
      const textarea = document.createElement('textarea');
      textarea.style.width = '100%';
      textarea.style.marginTop = '8px';
      textarea.style.minHeight = '80px';
      textarea.style.border = '1px solid #888';
      textarea.style.background = '#f9f9f9';
      textarea.placeholder = 'Edit the response here...';
      textarea.value = message.content || '';

      messageElem.appendChild(textarea);
    }
  });
}

window.addEventListener('DOMContentLoaded', setup);
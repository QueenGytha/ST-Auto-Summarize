// Lorebook Viewer UI
// Adds buttons to messages and scene breaks to view active lorebook entries

import { getContext, selectorsSillyTavern } from './index.js';
import { getActiveLorebooksForMessage } from './index.js';

const LOREBOOK_VIEWER_BUTTON_CLASS = 'lorebook-viewer-button';

export function addLorebookViewerButton() {
  const html = `
<div title="View active lorebook entries" class="mes_button ${LOREBOOK_VIEWER_BUTTON_CLASS} fa-solid fa-book-atlas" tabindex="0"></div>
`;

  // Insert after the scene break button (which is the first button via prepend)
  const sceneBreakButton = $(`${selectorsSillyTavern.message.template} ${selectorsSillyTavern.message.buttons} ${selectorsSillyTavern.message.extraButtons} .auto_summarize_scene_break_button`);
  if (sceneBreakButton.length > 0) {
    sceneBreakButton.after(html);
    console.log('[Auto-Summarize:LorebookViewer] Added lorebook viewer button after scene break button');
  } else {
    // Fallback: append to end if scene break button not found
    $(`${selectorsSillyTavern.message.template} ${selectorsSillyTavern.message.buttons} ${selectorsSillyTavern.message.extraButtons}`).append(html);
    console.log('[Auto-Summarize:LorebookViewer] Added lorebook viewer button to message template (fallback)');
  }
}

export function bindLorebookViewerButton() {
  $(`div${selectorsSillyTavern.chat.container}`).on("click", `.${LOREBOOK_VIEWER_BUTTON_CLASS}`, function () {
    const message_block = $(this).closest(selectorsSillyTavern.message.block);
    const message_id = Number(message_block.attr("mesid"));

    console.log(`[Auto-Summarize:LorebookViewer] Clicked for message ${message_id}`);
    showLorebookEntriesModal(message_id);
  });

  console.log('[Auto-Summarize:LorebookViewer] Bound click handler for lorebook viewer buttons');
}

export function showLorebookEntriesModal(messageIndex) {
  const ctx = getContext();
  const entries = getActiveLorebooksForMessage(messageIndex);

  if (!entries || entries.length === 0) {
    const html = `
      <div>
        <h3>Active Lorebook Entries - Message #${messageIndex}</h3>
        <p>No lorebook entries were active for this message.</p>
      </div>
    `;

    if (ctx.callPopup) {
      ctx.callPopup(html, 'text', undefined, {
        okButton: "Close",
        wide: false,
        large: false
      });
    }
    return;
  }

  // Build entry list HTML
  const entriesHtml = entries.map((entry, i) => {
    const keys = entry.key && entry.key.length > 0
      ? entry.key.join(', ')
      : '(no keys)';

    const positionNames = ['↑Char', '↓Char', '↑AN', '↓AN', '@D', '↑EM', '↓EM', '➡️'];
    const positionLabel = positionNames[entry.position] || `Position ${entry.position}`;

    return `
      <div style="margin-bottom: 1em; padding: 0.5em; background: rgba(255,255,255,0.05); border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 0.3em;">
          ${i + 1}. ${entry.comment}
        </div>
        <div style="font-size: 0.9em; color: #aaa;">
          <div><strong>World:</strong> ${entry.world}</div>
          <div><strong>Keys:</strong> ${keys}</div>
          <div><strong>Position:</strong> ${positionLabel}</div>
          <div><strong>UID:</strong> ${entry.uid}</div>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <div>
      <h3>Active Lorebook Entries - Message #${messageIndex}</h3>
      <p>${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} active:</p>
      <div style="max-height: 400px; overflow-y: auto;">
        ${entriesHtml}
      </div>
    </div>
  `;

  if (ctx.callPopup) {
    ctx.callPopup(html, 'text', undefined, {
      okButton: "Close",
      wide: true,
      large: false
    });
  }
}

export function createSceneBreakLorebookIcon(messageIndex) {
  return `<i class="fa-solid fa-book-atlas scene-lorebook-viewer" data-message-index="${messageIndex}" title="View active lorebook entries" style="cursor:pointer; margin-left:0.5em;"></i>`;
}

export function bindSceneBreakLorebookIcons() {
  $(`div${selectorsSillyTavern.chat.container}`).on("click", ".scene-lorebook-viewer", function (e) {
    e.stopPropagation();
    const messageIndex = Number($(this).attr("data-message-index"));
    console.log(`[Auto-Summarize:LorebookViewer] Scene break icon clicked for message ${messageIndex}`);
    showLorebookEntriesModal(messageIndex);
  });

  console.log('[Auto-Summarize:LorebookViewer] Bound click handler for scene break lorebook icons');
}

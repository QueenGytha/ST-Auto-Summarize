// Lorebook Viewer UI
// Adds buttons to messages and scene breaks to view active lorebook entries

import { getContext } from './index.js';
import { getActiveLorebooksForMessage } from './index.js';

const LOREBOOK_VIEWER_BUTTON_CLASS = 'lorebook-viewer-button';

/**
 * Add lorebook viewer button to message template
 * Called during extension initialization
 * Positioned after the scene break button
 */
export function addLorebookViewerButton() {
  const html = `
<div title="View active lorebook entries" class="mes_button ${LOREBOOK_VIEWER_BUTTON_CLASS} fa-solid fa-book-atlas" tabindex="0"></div>
`;

  // Insert after the scene break button (which is the first button via prepend)
  const sceneBreakButton = $("#message_template .mes_buttons .extraMesButtons .auto_summarize_scene_break_button");
  if (sceneBreakButton.length > 0) {
    sceneBreakButton.after(html);
    console.log('[Auto-Summarize:LorebookViewer] Added lorebook viewer button after scene break button');
  } else {
    // Fallback: append to end if scene break button not found
    $("#message_template .mes_buttons .extraMesButtons").append(html);
    console.log('[Auto-Summarize:LorebookViewer] Added lorebook viewer button to message template (fallback)');
  }
}

/**
 * Bind click handler for lorebook viewer buttons in messages
 * Uses event delegation for dynamically added messages
 */
export function bindLorebookViewerButton() {
  $("div#chat").on("click", `.${LOREBOOK_VIEWER_BUTTON_CLASS}`, function () {
    const message_block = $(this).closest(".mes");
    const message_id = Number(message_block.attr("mesid"));

    console.log(`[Auto-Summarize:LorebookViewer] Clicked for message ${message_id}`);
    showLorebookEntriesModal(message_id);
  });

  console.log('[Auto-Summarize:LorebookViewer] Bound click handler for lorebook viewer buttons');
}

/**
 * Show modal displaying active lorebook entries for a message
 * @param {number} messageIndex - The message index to display entries for
 */
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

/**
 * Create and return lorebook viewer icon HTML for scene breaks
 * @param {number} messageIndex - The message index for the scene break
 * @returns {string} HTML string for the icon
 */
export function createSceneBreakLorebookIcon(messageIndex) {
  return `<i class="fa-solid fa-book-atlas scene-lorebook-viewer" data-message-index="${messageIndex}" title="View active lorebook entries" style="cursor:pointer; margin-left:0.5em;"></i>`;
}

/**
 * Bind click handler for scene break lorebook icons
 * Should be called after scene breaks are rendered
 */
export function bindSceneBreakLorebookIcons() {
  $("div#chat").on("click", ".scene-lorebook-viewer", function (e) {
    e.stopPropagation();
    const messageIndex = Number($(this).attr("data-message-index"));
    console.log(`[Auto-Summarize:LorebookViewer] Scene break icon clicked for message ${messageIndex}`);
    showLorebookEntriesModal(messageIndex);
  });

  console.log('[Auto-Summarize:LorebookViewer] Bound click handler for scene break lorebook icons');
}

// Lorebook Viewer UI
// Adds buttons to messages and scene breaks to view active and inactive lorebook entries

import { getContext, selectorsSillyTavern } from './index.js';
import { getActiveLorebooksForMessage, getInactiveLorebooksForMessage } from './index.js';
import { debug, SUBSYSTEM } from './index.js';

const LOREBOOK_VIEWER_BUTTON_CLASS = 'lorebook-viewer-button';

export function addLorebookViewerButton() {
  const html = `
<div title="View active lorebook entries" class="mes_button ${LOREBOOK_VIEWER_BUTTON_CLASS} fa-solid fa-book-atlas" tabindex="0"></div>
`;

  // Insert after the scene break button (which is the first button via prepend)
  const sceneBreakButton = $(`${selectorsSillyTavern.message.template} ${selectorsSillyTavern.message.buttons} ${selectorsSillyTavern.message.extraButtons} .auto_recap_scene_break_button`);
  if (sceneBreakButton.length > 0) {
    sceneBreakButton.after(html);
    debug(SUBSYSTEM.LOREBOOK,'[Auto-Recap:LorebookViewer] Added lorebook viewer button after scene break button');
  } else {
    // Fallback: append to end if scene break button not found
    $(`${selectorsSillyTavern.message.template} ${selectorsSillyTavern.message.buttons} ${selectorsSillyTavern.message.extraButtons}`).append(html);
    debug(SUBSYSTEM.LOREBOOK,'[Auto-Recap:LorebookViewer] Added lorebook viewer button to message template (fallback)');
  }
}

export function bindLorebookViewerButton() {
  $(`div${selectorsSillyTavern.chat.container}`).on("click", `.${LOREBOOK_VIEWER_BUTTON_CLASS}`, function () {
    const message_block = $(this).closest(selectorsSillyTavern.message.block);
    const message_id = Number(message_block.attr("mesid"));

    debug(SUBSYSTEM.LOREBOOK,`[Auto-Recap:LorebookViewer] Clicked for message ${message_id}`);
    showLorebookEntriesModal(message_id);
  });

  debug(SUBSYSTEM.LOREBOOK,'[Auto-Recap:LorebookViewer] Bound click handler for lorebook viewer buttons');
}

function buildStrategyBreakdown(entries) {
  if (!entries || entries.length === 0) {
    return '';
  }

  const strategyCounts = {
    constant: entries.filter(e => e.strategy === 'constant').length,
    vectorized: entries.filter(e => e.strategy === 'vectorized').length,
    normal: entries.filter(e => e.strategy === 'normal').length
  };

  const strategyBreakdown = [];
  if (strategyCounts.constant > 0) {strategyBreakdown.push(`🔵 ${strategyCounts.constant} constant`);}
  if (strategyCounts.vectorized > 0) {strategyBreakdown.push(`🔗 ${strategyCounts.vectorized} vectorized`);}
  if (strategyCounts.normal > 0) {strategyBreakdown.push(`🟢 ${strategyCounts.normal} normal`);}

  if (strategyBreakdown.length > 0) {
    return ` (${strategyBreakdown.join(', ')})`;
  }
  return '';
}

export function showLorebookEntriesModal(messageIndex) {
  const ctx = getContext();
  const activeEntries = getActiveLorebooksForMessage(messageIndex);
  const inactiveEntries = getInactiveLorebooksForMessage(messageIndex);

  if ((!activeEntries || activeEntries.length === 0) && (!inactiveEntries || inactiveEntries.length === 0)) {
    const html = `
      <div>
        <h3>Lorebook Entries - Message #${messageIndex}</h3>
        <p>No lorebook entries captured for this message.</p>
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

  // Strategy emoji mapping
  const strategyEmoji = {
    'constant': '🔵',
    'vectorized': '🔗',
    'normal': '🟢'
  };

  // Position labels
  const positionNames = ['↑Char', '↓Char', '↑AN', '↓AN', '@D', '↑EM', '↓EM', '➡️'];

  // Build entry display function
  const buildEntryHtml = (entry, index, isActive) => {
    const keys = entry.key && entry.key.length > 0
      ? entry.key.join(', ')
      : '(no keys)';

    const positionLabel = positionNames[entry.position] || `Position ${entry.position}`;
    const strategy = strategyEmoji[entry.strategy] || '⚪';
    const stickyDisplay = entry.sticky > 0 ? `<span style="color: #ffa500;">📌 ${entry.sticky}</span>` : '';

    // Depth/order display
    let depthOrderHtml = '';
    if (entry.depth !== undefined || entry.order !== undefined) {
      const depthStr = entry.depth !== undefined ? `Depth: ${entry.depth}` : '';
      const orderStr = entry.order !== undefined ? `Order: ${entry.order}` : '';
      const separator = depthStr && orderStr ? ', ' : '';
      depthOrderHtml = `<div><strong>Injection:</strong> ${depthStr}${separator}${orderStr}</div>`;
    }

    // Content preview (always shown, no truncation)
    let contentHtml = '';
    if (entry.content) {
      contentHtml = `
        <div style="margin-top: 0.5em; padding: 0.5em; background: rgba(0,0,0,0.2); border-radius: 3px; font-size: 0.85em; font-style: italic;">
          ${entry.content.replace(/\n/g, '<br>')}
        </div>
      `;
    }

    const bgColor = isActive ? 'rgba(76,175,80,0.1)' : 'rgba(136,136,136,0.05)';
    const borderColor = isActive ? 'rgba(76,175,80,0.3)' : 'rgba(136,136,136,0.2)';

    return `
      <div style="margin-bottom: 1em; padding: 0.5em; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 0.3em; display: flex; align-items: center; gap: 0.5em;">
          <span style="font-size: 1.2em;">${strategy}</span>
          <span>${index}. ${entry.comment}</span>
          ${stickyDisplay ? `<span style="margin-left: auto;">${stickyDisplay}</span>` : ''}
        </div>
        <div style="font-size: 0.9em; color: #aaa;">
          <div><strong>World:</strong> ${entry.world}</div>
          <div><strong>Keys:</strong> ${keys}</div>
          <div><strong>Position:</strong> ${positionLabel}</div>
          ${depthOrderHtml}
          <div><strong>UID:</strong> ${entry.uid}</div>
        </div>
        ${contentHtml}
      </div>
    `;
  };

  // Build active entries HTML
  const activeEntriesHtml = activeEntries && activeEntries.length > 0
    ? activeEntries.map((entry, i) => buildEntryHtml(entry, i + 1, true)).join('')
    : '<p style="color: #888; font-style: italic;">No active entries</p>';

  // Build inactive entries HTML
  const inactiveEntriesHtml = inactiveEntries && inactiveEntries.length > 0
    ? inactiveEntries.map((entry, i) => buildEntryHtml(entry, i + 1, false)).join('')
    : '<p style="color: #888; font-style: italic;">No inactive entries</p>';

  // Strategy breakdown for active entries
  const strategyBreakdownHtml = buildStrategyBreakdown(activeEntries);

  const html = `
    <div>
      <h3>Lorebook Snapshot - Message #${messageIndex}</h3>

      <div style="margin-bottom: 1.5em;">
        <h4 style="color: #4CAF50; margin-bottom: 0.5em;">✓ Active Entries (${activeEntries?.length || 0})</h4>
        <p style="margin-bottom: 0.5em; font-size: 0.9em; color: #aaa;">
          Entries that were injected into the LLM prompt${strategyBreakdownHtml}
        </p>
        <div style="max-height: 300px; overflow-y: auto; padding: 0.5em; border: 1px solid #4CAF50; border-radius: 4px; background: rgba(76,175,80,0.05);">
          ${activeEntriesHtml}
        </div>
      </div>

      <div>
        <h4 style="color: #888; margin-bottom: 0.5em;">○ Inactive Entries (${inactiveEntries?.length || 0})</h4>
        <p style="margin-bottom: 0.5em; font-size: 0.9em; color: #666;">
          Complete snapshot of all other loaded lorebook entries
        </p>
        <div style="max-height: 300px; overflow-y: auto; padding: 0.5em; border: 1px solid #888; border-radius: 4px; background: rgba(136,136,136,0.03);">
          ${inactiveEntriesHtml}
        </div>
      </div>
    </div>
  `;

  if (ctx.callPopup) {
    ctx.callPopup(html, 'text', undefined, {
      okButton: "Close",
      wide: true,
      large: true
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
    debug(SUBSYSTEM.LOREBOOK,`[Auto-Recap:LorebookViewer] Scene break icon clicked for message ${messageIndex}`);
    showLorebookEntriesModal(messageIndex);
  });

  debug(SUBSYSTEM.LOREBOOK,'[Auto-Recap:LorebookViewer] Bound click handler for scene break lorebook icons');
}

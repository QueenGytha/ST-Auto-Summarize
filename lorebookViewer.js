// Lorebook Viewer UI
// Adds buttons to messages and scene breaks to view active lorebook entries

import { getContext, selectorsSillyTavern } from './index.js';
import { getActiveLorebooksForMessage } from './index.js';
import { get_settings } from './index.js';

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
  const settings = get_settings();

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

  // Get settings
  const showContent = settings.lorebook_viewer_show_content || false;
  const groupByWorld = settings.lorebook_viewer_group_by_world !== false; // Default true
  const showDepth = settings.lorebook_viewer_show_depth !== false; // Default true

  // Strategy emoji mapping
  const strategyEmoji = {
    'constant': '🔵',
    'vectorized': '🔗',
    'normal': '🟢'
  };

  // Position labels
  const positionNames = ['↑Char', '↓Char', '↑AN', '↓AN', '@D', '↑EM', '↓EM', '➡️'];

  // Build entry display function
  const buildEntryHtml = (entry, index) => {
    const keys = entry.key && entry.key.length > 0
      ? entry.key.join(', ')
      : '(no keys)';

    const positionLabel = positionNames[entry.position] || `Position ${entry.position}`;
    const strategy = strategyEmoji[entry.strategy] || '⚪';
    const stickyDisplay = entry.sticky > 0 ? `<span style="color: #ffa500;">📌 ${entry.sticky}</span>` : '';

    // Depth/order display
    let depthOrderHtml = '';
    if (showDepth && (entry.depth !== undefined || entry.order !== undefined)) {
      const depthStr = entry.depth !== undefined ? `Depth: ${entry.depth}` : '';
      const orderStr = entry.order !== undefined ? `Order: ${entry.order}` : '';
      const separator = depthStr && orderStr ? ', ' : '';
      depthOrderHtml = `<div><strong>Injection:</strong> ${depthStr}${separator}${orderStr}</div>`;
    }

    // Content preview
    let contentHtml = '';
    if (showContent && entry.content) {
      const truncated = entry.content.length > 200
        ? entry.content.substring(0, 200) + '...'
        : entry.content;
      contentHtml = `
        <div style="margin-top: 0.5em; padding: 0.5em; background: rgba(0,0,0,0.2); border-radius: 3px; font-size: 0.85em; font-style: italic;">
          ${truncated.replace(/\n/g, '<br>')}
        </div>
      `;
    }

    return `
      <div style="margin-bottom: 1em; padding: 0.5em; background: rgba(255,255,255,0.05); border-radius: 4px;">
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

  // Build HTML based on grouping setting
  let entriesHtml = '';

  if (groupByWorld) {
    // Group entries by world/lorebook
    const grouped = {};
    for (const entry of entries) {
      if (!grouped[entry.world]) {
        grouped[entry.world] = [];
      }
      grouped[entry.world].push(entry);
    }

    // Build grouped HTML
    for (const [world, worldEntries] of Object.entries(grouped)) {
      entriesHtml += `
        <div style="margin-bottom: 1.5em;">
          <h4 style="color: #6495ed; margin-bottom: 0.5em; border-bottom: 1px solid #6495ed; padding-bottom: 0.3em;">
            📚 ${world} (${worldEntries.length})
          </h4>
          ${worldEntries.map((entry, i) => buildEntryHtml(entry, i + 1)).join('')}
        </div>
      `;
    }
  } else {
    // Flat list
    entriesHtml = entries.map((entry, i) => buildEntryHtml(entry, i + 1)).join('');
  }

  // Build summary with strategy breakdown
  const strategyCounts = {
    constant: entries.filter(e => e.strategy === 'constant').length,
    vectorized: entries.filter(e => e.strategy === 'vectorized').length,
    normal: entries.filter(e => e.strategy === 'normal').length
  };

  const strategyBreakdown = [];
  if (strategyCounts.constant > 0) strategyBreakdown.push(`🔵 ${strategyCounts.constant} constant`);
  if (strategyCounts.vectorized > 0) strategyBreakdown.push(`🔗 ${strategyCounts.vectorized} vectorized`);
  if (strategyCounts.normal > 0) strategyBreakdown.push(`🟢 ${strategyCounts.normal} normal`);

  const html = `
    <div>
      <h3>Active Lorebook Entries - Message #${messageIndex}</h3>
      <p style="margin-bottom: 0.5em;">
        <strong>${entries.length}</strong> ${entries.length === 1 ? 'entry' : 'entries'} active
        ${strategyBreakdown.length > 0 ? `(${strategyBreakdown.join(', ')})` : ''}
      </p>
      <div style="max-height: 500px; overflow-y: auto; padding-right: 0.5em;">
        ${entriesHtml}
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
    console.log(`[Auto-Summarize:LorebookViewer] Scene break icon clicked for message ${messageIndex}`);
    showLorebookEntriesModal(messageIndex);
  });

  console.log('[Auto-Summarize:LorebookViewer] Bound click handler for scene break lorebook icons');
}

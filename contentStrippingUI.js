import {
  debug,
  SUBSYSTEM,
  get_settings,
  set_settings,
  bind_setting,
  bind_function,
  selectorsExtension,
  toast,
  getContext
} from './index.js';

import {
  getStripPatternSets,
  getStripPatternSet,
  getActivePatternSetName,
  createPatternSet,
  deletePatternSet,
  renamePatternSet,
  setActivePatternSet,
  pinPatternSetToCharacter,
  unpinPatternSetFromCharacter,
  pinPatternSetToChat,
  unpinPatternSetFromChat,
  getCharacterPinnedSet,
  getChatPinnedSet,
  addPatternToSet,
  updatePatternInSet,
  removePatternFromSet,
  exportPatternSet,
  importPatternSet,
  testPatterns,
  getPresetPattern
} from './contentStripping.js';

const RANDOM_ID_BASE = 36;
const RANDOM_ID_SLICE_START = 2;
const RANDOM_ID_SLICE_END = 9;
const TOAST_TYPE_SUCCESS = 'success';
const TOAST_TYPE_WARNING = 'warning';
const MSG_SELECT_PATTERN_SET = 'Select a pattern set first';

let currentEditingSet = null;
let editorPatterns = [];
let editingPatternId = null;

export function initializeContentStrippingUI() {
  debug(SUBSYSTEM.UI, 'Initializing content stripping UI');

  const selectors = selectorsExtension.contentStripping;

  bindMessageTypes(selectors);
  bindDepthSliders(selectors);
  bindPatternSetSelector(selectors);
  bindPatternSetActions(selectors);
  bindStickyButtons(selectors);
  bindApplicationToggles(selectors);
  bindEditorModal(selectors);
}

function bindMessageTypes(selectors) {
  bind_setting(selectors.messageTypes, 'strip_message_types', 'text', () => {
    debug(SUBSYSTEM.UI, 'Message types changed');
  });
}

function bindDepthSliders(selectors) {
  const $messagesDepth = $(selectors.messagesDepth);
  const $messagesDepthDisplay = $(selectors.messagesDepthDisplay);

  $messagesDepth.on('input change', function() {
    const val = Number($(this).val()) || 0;
    $messagesDepthDisplay.text(val);
    set_settings('messages_depth', val);
  });

  const $summarizationDepth = $(selectors.summarizationDepth);
  const $summarizationDepthDisplay = $(selectors.summarizationDepthDisplay);

  $summarizationDepth.on('input change', function() {
    const val = Number($(this).val()) || 0;
    $summarizationDepthDisplay.text(val);
    set_settings('summarization_depth', val);
  });
}

function bindPatternSetSelector(selectors) {
  $(selectors.patternSetSelect).on('change', function() {
    const selectedName = $(this).val();
    debug(SUBSYSTEM.UI, `Pattern set selected: ${selectedName || '(none)'}`);

    setActivePatternSet(selectedName || null);
    updateStickyButtonStates();
    updatePatternSetBadge();
    updatePatternsPreview();
  });
}

function bindPatternSetActions(selectors) {
  bind_function(selectors.patternSetEdit, () => {
    const activeName = getActivePatternSetName();
    if (!activeName) {
      toast('Select or create a pattern set first', TOAST_TYPE_WARNING);
      return;
    }
    openPatternSetEditor(activeName);
  }, false);

  bind_function(selectors.patternSetNew, async () => {
    const ctx = getContext();
    const name = await ctx.Popup.show.input('New Pattern Set', 'Enter a name for the new pattern set:');
    if (!name) {
      return;
    }

    try {
      createPatternSet(name);
      setActivePatternSet(name);
      populatePatternSetDropdown();
      updateStickyButtonStates();
      toast(`Created pattern set: ${name}`, TOAST_TYPE_SUCCESS);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, false);

  bind_function(selectors.patternSetRename, async () => {
    const activeName = getActivePatternSetName();
    if (!activeName) {
      toast(MSG_SELECT_PATTERN_SET, TOAST_TYPE_WARNING);
      return;
    }

    const ctx = getContext();
    const newName = await ctx.Popup.show.input('Rename Pattern Set', 'Enter new name:', activeName);
    if (!newName || newName === activeName) {
      return;
    }

    try {
      renamePatternSet(activeName, newName);
      populatePatternSetDropdown();
      updateStickyButtonStates();
      toast(`Renamed to: ${newName}`, TOAST_TYPE_SUCCESS);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, false);

  bind_function(selectors.patternSetDelete, async () => {
    const activeName = getActivePatternSetName();
    if (!activeName) {
      toast(MSG_SELECT_PATTERN_SET, TOAST_TYPE_WARNING);
      return;
    }

    const ctx = getContext();
    const confirmed = await ctx.Popup.show.confirm(
      'Delete Pattern Set',
      `Are you sure you want to delete "${activeName}"?`
    );
    if (!confirmed) {
      return;
    }

    try {
      deletePatternSet(activeName);
      populatePatternSetDropdown();
      updateStickyButtonStates();
      toast(`Deleted: ${activeName}`, TOAST_TYPE_SUCCESS);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, false);

  bind_function(selectors.patternSetImport, () => {
    $(selectors.patternSetImportFile).click();
  }, false);

  bind_function(selectors.patternSetImportFile, async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const importedName = await importPatternSet(file);
      if (importedName) {
        setActivePatternSet(importedName);
        populatePatternSetDropdown();
        toast(`Imported: ${importedName}`, TOAST_TYPE_SUCCESS);
      }
    } catch (err) {
      toast(`Import failed: ${err.message}`, 'error');
    }

    event.target.value = '';
  }, false);

  bind_function(selectors.patternSetExport, () => {
    const activeName = getActivePatternSetName();
    if (!activeName) {
      toast(MSG_SELECT_PATTERN_SET, TOAST_TYPE_WARNING);
      return;
    }

    try {
      exportPatternSet(activeName);
      toast(`Exported: ${activeName}`, TOAST_TYPE_SUCCESS);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, false);
}

function bindStickyButtons(selectors) {
  bind_function(selectors.patternSetStickyCharacter, () => {
    const activeName = getActivePatternSetName();
    const currentPinned = getCharacterPinnedSet();

    if (currentPinned === activeName) {
      unpinPatternSetFromCharacter();
      toast('Unpinned from character', TOAST_TYPE_SUCCESS);
    } else if (activeName) {
      pinPatternSetToCharacter(activeName);
      toast(`Pinned "${activeName}" to character`, TOAST_TYPE_SUCCESS);
    } else {
      toast(MSG_SELECT_PATTERN_SET, TOAST_TYPE_WARNING);
      return;
    }

    updateStickyButtonStates();
    updatePatternSetBadge();
  }, false);

  bind_function(selectors.patternSetStickyChat, () => {
    const activeName = getActivePatternSetName();
    const currentPinned = getChatPinnedSet();

    if (currentPinned === activeName) {
      unpinPatternSetFromChat();
      toast('Unpinned from chat', TOAST_TYPE_SUCCESS);
    } else if (activeName) {
      pinPatternSetToChat(activeName);
      toast(`Pinned "${activeName}" to chat`, TOAST_TYPE_SUCCESS);
    } else {
      toast(MSG_SELECT_PATTERN_SET, TOAST_TYPE_WARNING);
      return;
    }

    updateStickyButtonStates();
    updatePatternSetBadge();
  }, false);
}

function bindApplicationToggles(selectors) {
  bind_setting(selectors.applyToMessages, 'apply_to_messages', 'boolean', () => {
    debug(SUBSYSTEM.UI, 'Apply to messages toggled');
  });

  bind_setting(selectors.applyToSummarization, 'apply_to_summarization', 'boolean', () => {
    debug(SUBSYSTEM.UI, 'Apply to summarization toggled');
  });

  bind_setting(selectors.autoOnMessage, 'auto_strip_on_message', 'boolean', () => {
    debug(SUBSYSTEM.UI, 'Auto strip on message toggled');
  });

  bind_function(selectors.stripNow, () => {
    debug(SUBSYSTEM.UI, 'Strip now clicked');
    toast('Strip now not yet implemented', 'info');
  }, false);
}

function bindEditorModal(selectors) {
  $(selectors.editorClose).on('click', closePatternSetEditor);
  $(selectors.editorCancel).on('click', closePatternSetEditor);

  $(selectors.editorSave).on('click', () => {
    savePatternSetFromEditor();
  });

  $(selectors.patternAddBtn).on('click', () => {
    addPatternFromForm();
  });

  $(selectors.patternTestBtn).on('click', () => {
    runPatternTest();
  });

  $(document).on('click', '.strip_preset_btn', function() {
    const presetKey = $(this).data('preset');
    const preset = getPresetPattern(presetKey);
    if (preset) {
      addPatternToEditor(preset);
      toast(`Added preset: ${preset.name}`, TOAST_TYPE_SUCCESS);
    }
  });

  $(document).on('click', '.strip_pattern_delete', function() {
    const patternId = $(this).closest('.strip_pattern_row').data('id');
    removePatternFromEditor(patternId);
  });

  $(document).on('click', '.strip_pattern_edit', function() {
    const patternId = $(this).closest('.strip_pattern_row').data('id');
    editPatternInEditor(patternId);
  });

  $(document).on('change', '.strip_pattern_enabled', function() {
    const patternId = $(this).closest('.strip_pattern_row').data('id');
    const enabled = $(this).prop('checked');
    const pattern = editorPatterns.find(p => p.id === patternId);
    if (pattern) {
      pattern.enabled = enabled;
    }
  });
}

function openPatternSetEditor(setName) {
  const selectors = selectorsExtension.contentStripping;
  const patternSet = getStripPatternSet(setName);

  if (!patternSet) {
    toast(`Pattern set "${setName}" not found`, 'error');
    return;
  }

  currentEditingSet = setName;
  editorPatterns = JSON.parse(JSON.stringify(patternSet.patterns || []));

  $(selectors.editorTitle).text(`Edit: ${setName}`);
  $(selectors.editorName).val(setName);

  renderEditorPatternsList();

  $(selectors.patternNewName).val('');
  $(selectors.patternNewRegex).val('');
  $(selectors.patternNewFlags).val('gi');
  $(selectors.patternTestInput).val('');
  $(selectors.patternTestOutput).val('');

  $(selectors.editorModal).css('display', 'flex');
  debug(SUBSYSTEM.UI, `Pattern set editor opened: ${setName}`);
}

function closePatternSetEditor() {
  const selectors = selectorsExtension.contentStripping;

  currentEditingSet = null;
  editorPatterns = [];

  $(selectors.editorModal).css('display', 'none');
  debug(SUBSYSTEM.UI, 'Pattern set editor closed');
}

function renderEditorPatternsList() {
  const selectors = selectorsExtension.contentStripping;
  const $list = $(selectors.editorPatternsList);

  $list.empty();

  if (editorPatterns.length === 0) {
    $list.html('<div class="strip_patterns_empty_message opacity50p" style="padding: 10px; text-align: center;">No patterns defined. Add a pattern below.</div>');
    return;
  }

  for (const pattern of editorPatterns) {
    const $row = $(`
      <div class="strip_pattern_row" data-id="${pattern.id}">
        <div class="strip_pattern_header">
          <input type="checkbox" class="strip_pattern_enabled" ${pattern.enabled ? 'checked' : ''}>
          <span class="strip_pattern_name">${escapeHtml(pattern.name)}</span>
          <span class="strip_pattern_flags">(${pattern.flags})</span>
          <div class="strip_pattern_actions">
            <button class="menu_button strip_pattern_edit" title="Edit pattern">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button class="menu_button strip_pattern_delete" title="Delete pattern">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
        <code class="strip_pattern_regex">${escapeHtml(pattern.pattern)}</code>
      </div>
    `);
    $list.append($row);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addPatternFromForm() {
  const selectors = selectorsExtension.contentStripping;

  const name = $(selectors.patternNewName).val().trim();
  const pattern = $(selectors.patternNewRegex).val().trim();
  const flags = $(selectors.patternNewFlags).val();

  if (!pattern) {
    toast('Pattern is required', TOAST_TYPE_WARNING);
    return;
  }

  try {
    new RegExp(pattern, flags);
  } catch (err) {
    toast(`Invalid regex: ${err.message}`, 'error');
    return;
  }

  if (editingPatternId) {
    const existingPattern = editorPatterns.find(p => p.id === editingPatternId);
    if (existingPattern) {
      existingPattern.name = name || 'Unnamed Pattern';
      existingPattern.pattern = pattern;
      existingPattern.flags = flags;
      toast('Pattern updated', TOAST_TYPE_SUCCESS);
    }
    editingPatternId = null;
    $(selectors.patternAddBtn).html('<i class="fa-solid fa-plus"></i>');
  } else {
    addPatternToEditor({
      name: name || 'Unnamed Pattern',
      pattern,
      flags
    });
  }

  $(selectors.patternNewName).val('');
  $(selectors.patternNewRegex).val('');
  renderEditorPatternsList();
}

function editPatternInEditor(patternId) {
  const selectors = selectorsExtension.contentStripping;
  const pattern = editorPatterns.find(p => p.id === patternId);

  if (!pattern) {
    return;
  }

  editingPatternId = patternId;
  $(selectors.patternNewName).val(pattern.name);
  $(selectors.patternNewRegex).val(pattern.pattern);
  $(selectors.patternNewFlags).val(pattern.flags);
  $(selectors.patternAddBtn).html('<i class="fa-solid fa-check"></i> Update');
  $(selectors.patternNewName).focus();
}

function addPatternToEditor(patternData) {
  const newPattern = {
    id: `temp_${Date.now()}_${Math.random().toString(RANDOM_ID_BASE).slice(RANDOM_ID_SLICE_START, RANDOM_ID_SLICE_END)}`,
    name: patternData.name,
    pattern: patternData.pattern,
    flags: patternData.flags || 'gi',
    enabled: true
  };

  editorPatterns.push(newPattern);
  renderEditorPatternsList();
}

function removePatternFromEditor(patternId) {
  const index = editorPatterns.findIndex(p => p.id === patternId);
  if (index !== -1) {
    editorPatterns.splice(index, 1);
    renderEditorPatternsList();
  }
}

function savePatternSetFromEditor() {
  const selectors = selectorsExtension.contentStripping;
  const newName = $(selectors.editorName).val().trim();

  if (!newName) {
    toast('Pattern set name is required', TOAST_TYPE_WARNING);
    return;
  }

  try {
    if (newName !== currentEditingSet) {
      renamePatternSet(currentEditingSet, newName);
      currentEditingSet = newName;
    }

    const patternSet = getStripPatternSet(newName);
    const existingIds = new Set(patternSet.patterns.map(p => p.id));
    const newIds = new Set(editorPatterns.map(p => p.id));

    for (const existingPattern of patternSet.patterns) {
      if (!newIds.has(existingPattern.id)) {
        removePatternFromSet(newName, existingPattern.id);
      }
    }

    for (const editorPattern of editorPatterns) {
      if (editorPattern.id.startsWith('temp_')) {
        addPatternToSet(newName, editorPattern);
      } else if (existingIds.has(editorPattern.id)) {
        updatePatternInSet(newName, editorPattern.id, {
          name: editorPattern.name,
          pattern: editorPattern.pattern,
          flags: editorPattern.flags,
          enabled: editorPattern.enabled
        });
      }
    }

    populatePatternSetDropdown();
    closePatternSetEditor();
    toast(`Saved: ${newName}`, TOAST_TYPE_SUCCESS);
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'error');
  }
}

function runPatternTest() {
  const selectors = selectorsExtension.contentStripping;
  const testInput = $(selectors.patternTestInput).val();

  if (!testInput) {
    toast('Enter test text first', TOAST_TYPE_WARNING);
    return;
  }

  const enabledPatterns = editorPatterns.filter(p => p.enabled);
  if (enabledPatterns.length === 0) {
    toast('No enabled patterns to test', TOAST_TYPE_WARNING);
    return;
  }

  const results = testPatterns(testInput, enabledPatterns);

  let outputText = `=== Test Results ===\n`;
  outputText += `Patterns tested: ${enabledPatterns.length}\n`;
  outputText += `Total matches: ${results.matches.reduce((sum, m) => sum + (m.matchCount || 0), 0)}\n\n`;

  for (const match of results.matches) {
    outputText += match.error
      ? `❌ ${match.patternName}: ${match.error}\n`
      : `✓ ${match.patternName}: ${match.matchCount} match(es)\n`;
  }

  outputText += `\n=== Stripped Result ===\n${results.stripped}`;

  $(selectors.patternTestOutput).val(outputText);
}

function populatePatternSetDropdown() {
  const selectors = selectorsExtension.contentStripping;
  const $select = $(selectors.patternSetSelect);
  const sets = getStripPatternSets();
  const activeName = get_settings('active_strip_pattern_set');

  $select.empty();
  $select.append('<option value="">-- None --</option>');

  for (const name of Object.keys(sets).sort()) {
    const patternCount = sets[name].patterns?.length || 0;
    $select.append(`<option value="${name}">${name} (${patternCount})</option>`);
  }

  $select.val((activeName && sets[activeName]) ? activeName : '');

  updatePatternSetBadge();
}

function updatePatternSetBadge() {
  const selectors = selectorsExtension.contentStripping;
  const $badge = $(selectors.patternSetBadge);

  const chatPinned = getChatPinnedSet();
  const charPinned = getCharacterPinnedSet();
  const active = get_settings('active_strip_pattern_set');

  if (chatPinned) {
    $badge.text('chat').attr('title', 'Pinned to this chat').show();
  } else if (charPinned) {
    $badge.text('char').attr('title', 'Pinned to this character').show();
  } else if (active) {
    $badge.text('').hide();
  } else {
    $badge.text('').hide();
  }
}

function updatePatternsPreview() {
  const selectors = selectorsExtension.contentStripping;
  const $preview = $(selectors.patternsPreview);
  const $list = $(selectors.patternsPreviewList);

  const activeName = getActivePatternSetName();
  if (!activeName) {
    $preview.hide();
    return;
  }

  const patternSet = getStripPatternSet(activeName);
  if (!patternSet?.patterns?.length) {
    $preview.hide();
    return;
  }

  $list.empty();
  for (const pattern of patternSet.patterns) {
    const statusIcon = pattern.enabled ? '✓' : '✗';
    const statusClass = pattern.enabled ? 'opacity100p' : 'opacity50p';
    $list.append(`<div class="${statusClass}" style="margin-bottom: 4px;" title="${pattern.name}">
      <span style="margin-right: 5px;">${statusIcon}</span>
      <code style="word-break: break-all;">${escapeHtml(pattern.pattern)}</code>
      <small class="opacity50p" style="margin-left: 5px;">(${pattern.flags})</small>
    </div>`);
  }
  $preview.show();
}

function updateStickyButtonStates() {
  const selectors = selectorsExtension.contentStripping;
  const activeName = getActivePatternSetName();
  const charPinned = getCharacterPinnedSet();
  const chatPinned = getChatPinnedSet();

  const $charBtn = $(selectors.patternSetStickyCharacter);
  const $chatBtn = $(selectors.patternSetStickyChat);

  if (charPinned === activeName && activeName) {
    $charBtn.find('i').removeClass('fa-unlock').addClass('fa-lock');
  } else {
    $charBtn.find('i').removeClass('fa-lock').addClass('fa-unlock');
  }

  if (chatPinned === activeName && activeName) {
    $chatBtn.find('i').removeClass('fa-unlock').addClass('fa-lock');
  } else {
    $chatBtn.find('i').removeClass('fa-lock').addClass('fa-unlock');
  }
}

export function refreshContentStrippingUI() {
  debug(SUBSYSTEM.UI, 'Refreshing content stripping UI');

  const selectors = selectorsExtension.contentStripping;

  populatePatternSetDropdown();
  updateStickyButtonStates();
  updatePatternsPreview();

  const messagesDepth = get_settings('messages_depth') ?? 1;
  $(selectors.messagesDepth).val(messagesDepth);
  $(selectors.messagesDepthDisplay).text(messagesDepth);

  const summarizationDepth = get_settings('summarization_depth') ?? 0;
  $(selectors.summarizationDepth).val(summarizationDepth);
  $(selectors.summarizationDepthDisplay).text(summarizationDepth);

  $(selectors.applyToMessages).prop('checked', get_settings('apply_to_messages') ?? false);
  $(selectors.applyToSummarization).prop('checked', get_settings('apply_to_summarization') ?? false);
  $(selectors.autoOnMessage).prop('checked', get_settings('auto_strip_on_message') ?? false);
  $(selectors.messageTypes).val(get_settings('strip_message_types') ?? 'character');
}

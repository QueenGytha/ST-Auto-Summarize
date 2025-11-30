
import {
  debug,
  SUBSYSTEM,
  get_settings,
  set_settings,
  bind_setting,
  bind_function,
  selectorsExtension,
  toast
} from './index.js';

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
  bind_function(selectors.patternSetSelect, () => {
    debug(SUBSYSTEM.UI, 'Pattern set selector changed');
    toast('Pattern set selection not yet implemented', 'info');
  }, false);
}

function bindPatternSetActions(selectors) {
  bind_function(selectors.patternSetEdit, () => {
    debug(SUBSYSTEM.UI, 'Edit pattern set clicked');
    openPatternSetEditor();
  }, false);

  bind_function(selectors.patternSetNew, () => {
    debug(SUBSYSTEM.UI, 'New pattern set clicked');
    toast('New pattern set not yet implemented', 'info');
  }, false);

  bind_function(selectors.patternSetRename, () => {
    debug(SUBSYSTEM.UI, 'Rename pattern set clicked');
    toast('Rename pattern set not yet implemented', 'info');
  }, false);

  bind_function(selectors.patternSetDelete, () => {
    debug(SUBSYSTEM.UI, 'Delete pattern set clicked');
    toast('Delete pattern set not yet implemented', 'info');
  }, false);

  bind_function(selectors.patternSetImport, () => {
    debug(SUBSYSTEM.UI, 'Import pattern set clicked');
    $(selectors.patternSetImportFile).click();
  }, false);

  bind_function(selectors.patternSetImportFile, () => {
    debug(SUBSYSTEM.UI, 'Import file selected');
    toast('Import pattern set not yet implemented', 'info');
  }, false);

  bind_function(selectors.patternSetExport, () => {
    debug(SUBSYSTEM.UI, 'Export pattern set clicked');
    toast('Export pattern set not yet implemented', 'info');
  }, false);
}

function bindStickyButtons(selectors) {
  bind_function(selectors.patternSetStickyCharacter, () => {
    debug(SUBSYSTEM.UI, 'Sticky to character clicked');
    toast('Sticky to character not yet implemented', 'info');
  }, false);

  bind_function(selectors.patternSetStickyChat, () => {
    debug(SUBSYSTEM.UI, 'Sticky to chat clicked');
    toast('Sticky to chat not yet implemented', 'info');
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
    debug(SUBSYSTEM.UI, 'Save pattern set clicked');
    toast('Save pattern set not yet implemented', 'info');
    closePatternSetEditor();
  });

  $(selectors.patternAddBtn).on('click', () => {
    debug(SUBSYSTEM.UI, 'Add pattern clicked');
    toast('Add pattern not yet implemented', 'info');
  });

  $(selectors.patternTestBtn).on('click', () => {
    debug(SUBSYSTEM.UI, 'Test patterns clicked');
    toast('Test patterns not yet implemented', 'info');
  });

  $(document).on('click', '.strip_preset_btn', function() {
    const preset = $(this).data('preset');
    debug(SUBSYSTEM.UI, `Preset button clicked: ${preset}`);
    toast(`Preset "${preset}" not yet implemented`, 'info');
  });
}

function openPatternSetEditor() {
  const selectors = selectorsExtension.contentStripping;
  const $modal = $(selectors.editorModal);

  $modal.css('display', 'flex');
  debug(SUBSYSTEM.UI, 'Pattern set editor opened');
}

function closePatternSetEditor() {
  const selectors = selectorsExtension.contentStripping;
  const $modal = $(selectors.editorModal);

  $modal.css('display', 'none');
  debug(SUBSYSTEM.UI, 'Pattern set editor closed');
}

export function refreshContentStrippingUI() {
  debug(SUBSYSTEM.UI, 'Refreshing content stripping UI');

  const selectors = selectorsExtension.contentStripping;

  const messagesDepth = get_settings('messages_depth') ?? 1;
  $(selectors.messagesDepth).val(messagesDepth);
  $(selectors.messagesDepthDisplay).text(messagesDepth);

  const summarizationDepth = get_settings('summarization_depth') ?? 0;
  $(selectors.summarizationDepth).val(summarizationDepth);
  $(selectors.summarizationDepthDisplay).text(summarizationDepth);

  $(selectors.applyToMessages).prop('checked', get_settings('apply_to_messages') ?? false);
  $(selectors.applyToSummarization).prop('checked', get_settings('apply_to_summarization') ?? false);
  $(selectors.autoOnMessage).prop('checked', get_settings('auto_strip_on_message') ?? false);
}

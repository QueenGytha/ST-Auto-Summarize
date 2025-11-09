
import {
  debug,
  animation_duration,
  settings_content_class,
  bind_function,
  dragElement,
  loadMovingUIState,
  selectorsExtension,
  selectorsSillyTavern } from
'./index.js';

// Popout handling.
// We save a jQuery reference to the entire settings content, and move it between the original location and the popout.
// This is done carefully to preserve all event listeners when moving, and the move is always done before calling remove() on the popout.
// clone() doesn't work because of the select2 widget for some reason.
let $settings_element = null; // all settings content
let $original_settings_parent = null; // original location of the settings element
let $popout = null; // the popout element
let POPOUT_VISIBLE = false;
function initialize_popout() {
  // initialize the popout logic, creating the $popout object and storing the $settings_element

  // Get the settings element and store it
  $settings_element = $(selectorsExtension.settings.panel).find(`.inline-drawer-content .${settings_content_class}`);
  $original_settings_parent = $settings_element.parent(); // where the settings are originally placed

  debug('Creating popout window...');

  // repurposes the zoomed avatar template (it's a floating div to the left of the chat)
  $popout = $($(selectorsSillyTavern.templates.zoomedAvatar).html());
  $popout.attr('id', 'qmExtensionPopout').removeClass('zoomed_avatar').addClass('draggable').empty();

  // create the control bar with the close button
  const controlBarHtml = `<div class="panelControlBar flex-container">
    <div class="fa-solid fa-grip drag-grabber hoverglow"></div>
    <div class="fa-solid fa-circle-xmark hoverglow dragClose" data-testid="popout-drag-close"></div>
    </div>`;
  $popout.append(controlBarHtml);

  loadMovingUIState();
  dragElement($popout);

  // set up the popout button in the settings to toggle it
  bind_function('#auto_recap_popout_button', (e) => {
    toggle_popout();
    e.stopPropagation();
  });

  // when escape is pressed, toggle the popout.
  // This has to be here because ST removes .draggable items when escape is pressed, destroying the popout.
  $(document).on('keydown', function (event) {
    if (event.key === 'Escape') {
      close_popout();
    }
  });
}
function open_popout() {
  debug("Showing popout");
  $(selectorsSillyTavern.dom.body).append($popout); // add the popout to the body

  // setup listener for close button to remove the popout
  $popout.find(selectorsExtension.popout.dragClose).off('click').on('click', function () {
    close_popout();
  });

  $settings_element.appendTo($popout); // move the settings to the popout
  $popout.fadeIn(animation_duration);
  POPOUT_VISIBLE = true;
}
function close_popout() {
  debug("Hiding popout");
  $popout.fadeOut(animation_duration, () => {
    $settings_element.appendTo($original_settings_parent); // move the settings back
    $popout.remove(); // remove the popout
  });
  POPOUT_VISIBLE = false;
}
function toggle_popout() {
  // toggle the popout window
  if (POPOUT_VISIBLE) {
    close_popout();
  } else {
    open_popout();
  }
}

export {
  initialize_popout,
  open_popout,
  close_popout,
  toggle_popout,
  $settings_element,
  $original_settings_parent,
  $popout,
  POPOUT_VISIBLE };
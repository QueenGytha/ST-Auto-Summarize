// @flow
import { 
    debug, 
    animation_duration, 
    settings_div_id, 
    settings_content_class, 
    bind_function, 
    dragElement, 
    loadMovingUIState 
} from './index.js';

// Popout handling.
// We save a jQuery reference to the entire settings content, and move it between the original location and the popout.
// This is done carefully to preserve all event listeners when moving, and the move is always done before calling remove() on the popout.
// clone() doesn't work because of the select2 widget for some reason.
// $FlowFixMe[signature-verification-failure]
let $settings_element = null;  // all settings content
// $FlowFixMe[signature-verification-failure]
let $original_settings_parent = null;  // original location of the settings element
// $FlowFixMe[signature-verification-failure]
let $popout = null;  // the popout element
// $FlowFixMe[signature-verification-failure]
let POPOUT_VISIBLE = false;
function initialize_popout() {
    // initialize the popout logic, creating the $popout object and storing the $settings_element

    // Get the settings element and store it
    // $FlowFixMe[cannot-resolve-name]
    $settings_element = $(`#${settings_div_id}`).find(`.inline-drawer-content .${settings_content_class}`)
    $original_settings_parent = $settings_element.parent()  // where the settings are originally placed

    debug('Creating popout window...');

    // repurposes the zoomed avatar template (it's a floating div to the left of the chat)
    // $FlowFixMe[cannot-resolve-name]
    $popout = $($('#zoomed_avatar_template').html());
    $popout.attr('id', 'qmExtensionPopout').removeClass('zoomed_avatar').addClass('draggable').empty();

    // create the control bar with the close button
    const controlBarHtml = `<div class="panelControlBar flex-container">
    <div class="fa-solid fa-grip drag-grabber hoverglow"></div>
    <div class="fa-solid fa-circle-xmark hoverglow dragClose"></div>
    </div>`;
    $popout.append(controlBarHtml)

    loadMovingUIState();
    dragElement($popout);

    // set up the popout button in the settings to toggle it
    bind_function('#auto_summarize_popout_button', (e) => {
        toggle_popout();
        e.stopPropagation();
    })

    // when escape is pressed, toggle the popout.
    // This has to be here because ST removes .draggable items when escape is pressed, destroying the popout.
    // $FlowFixMe[cannot-resolve-name]
    $(document).on('keydown', async function (event) {
         if (event.key === 'Escape') {
             close_popout()
         }
    });
}
function open_popout() {
    debug("Showing popout")
    // $FlowFixMe[cannot-resolve-name]
    $('body').append($popout);  // add the popout to the body

    // setup listener for close button to remove the popout
    // $FlowFixMe[incompatible-use]
    $popout.find('.dragClose').off('click').on('click', function () {
        close_popout()
    });

    // $FlowFixMe[incompatible-use]
    $settings_element.appendTo($popout)  // move the settings to the popout
    // $FlowFixMe[incompatible-use]
    $popout.fadeIn(animation_duration);
    POPOUT_VISIBLE = true
}
function close_popout() {
    debug("Hiding popout")
    // $FlowFixMe[incompatible-use]
    $popout.fadeOut(animation_duration, () => {
        // $FlowFixMe[incompatible-use]
        $settings_element.appendTo($original_settings_parent)  // move the settings back
        // $FlowFixMe[incompatible-use]
        $popout.remove()  // remove the popout
    });
    POPOUT_VISIBLE = false
}
function toggle_popout() {
    // toggle the popout window
    if (POPOUT_VISIBLE) {
        close_popout()
    } else {
        open_popout()
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
    POPOUT_VISIBLE
};
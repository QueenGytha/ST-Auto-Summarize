import { getContext, get_settings, log } from './index.js';

function refresh_character_select() {
    // sets the select2 multiselect for choosing a list of characters
    let context = getContext()

    // get all characters present in the current chat
    let char_id = context.characterId;
    let group_id = context.groupId;
    let character_options = []  // {id, name}
    if (char_id !== undefined && char_id !== null) {  // we are in an individual chat, add the character
        let id = context.characters[char_id].avatar
        character_options.push({id: id, name: context.characters[char_id].name})
    } else if (group_id) {   // we are in a group - add all members
        let group = context.groups.find(g => g.id == group_id)  // find the group we are in by ID
        for (let key of group.members) {
            let char = context.characters.find(c => c.avatar == key)
            character_options.push({id: key, name: char.name})  // add all group members to options
        }
    }

    // add the user to the list of options
    character_options.push({id: "user", name: "User (you)"})

    // set the current value (default if empty)
    let current_selection = get_settings('characters_to_summarize')
    log(current_selection)

    // register the element as a select2 widget
    refresh_select2_element('characters_to_summarize', current_selection, character_options,'No characters filtered - all will be summarized.')
}

/*
Use like this:
<div class="flex-container justifySpaceBetween alignItemsCenter">
    <label title="description here">
        <span>label here</span>
        <select id="id_here" multiple="multiple" class="select2_multi_sameline"></select>
    </label>
</div>
 */
function refresh_select2_element(id, selected, options, placeholder="") {
    // Refresh a select2 element with the given ID (a select element) and set the options

    // check whether the dropdown is open. If so, don't update the options (it messes with the widget)
    let $dropdown = $(`#select2-${id}-results`)
    if ($dropdown.length > 0) {
        return
    }

    let $select = $(`#${id}`)
    $select.empty()  // clear current options

    // add the options to the dropdown
    for (let {id, name} of options) {
        let option = $(`<option value="${id}">${name}</option>`)
        $select.append(option);
    }

    // If the select2 widget hasn't been created yet, create it
    let $widget = $(`.${settings_content_class} ul#select2-${id}-container`)
    if ($widget.length === 0) {
        $select.select2({  // register as a select2 element
            width: '100%',
            placeholder: placeholder,
            allowClear: true,
            closeOnSelect: false,
        });

        // select2ChoiceClickSubscribe($select, () => {
        //     log("CLICKED")
        // }, {buttonStyle: true, closeDrawer: true});

        //$select.on('select2:unselect', unselect_callback);
        //$select.on('select2:select', select_callback);
    }

    // set current selection.
    // change.select2 lets the widget update itself, but doesn't trigger the change event (which would cause infinite recursion).
    $select.val(selected)
    $select.trigger('change.select2')
}

export { refresh_character_select, refresh_select2_element };
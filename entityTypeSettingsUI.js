// @flow
import { extension_settings, saveSettingsDebounced, toast } from './index.js';
import {
    DEFAULT_ENTITY_TYPES,
    normalizeEntityTypeDefinition,
    parseEntityTypeDefinition,
} from './entityTypes.js';

/*::
type AutoLorebooksSettings = {
    entity_types?: Array<string>,
    [key: string]: any,
    ...
};
*/

function ensureEntityTypesSetting() {
    if (!extension_settings.autoLorebooks) {
        extension_settings.autoLorebooks = ({} /*: AutoLorebooksSettings */);
    }
    const autoLorebooks /*: AutoLorebooksSettings */ = extension_settings.autoLorebooks;
    const current = autoLorebooks.entity_types;
    if (!Array.isArray(current)) {
        autoLorebooks.entity_types = [...DEFAULT_ENTITY_TYPES];
        return;
    }
    const cleaned = Array.from(new Set(current.map(t => normalizeEntityTypeDefinition(String(t))).filter(Boolean)));
    autoLorebooks.entity_types = cleaned.length > 0 ? cleaned : [...DEFAULT_ENTITY_TYPES];
}

function getEntityTypesSetting() /*: Array<string> */ {
    ensureEntityTypesSetting();
    const autoLorebooks /*: AutoLorebooksSettings */ = extension_settings.autoLorebooks;
    return [...(autoLorebooks.entity_types ?? [])];
}

function setEntityTypesSetting(types /*: Array<string> */) {
    const cleaned = Array.from(new Set(types.map(t => normalizeEntityTypeDefinition(String(t))).filter(Boolean)));
    if (!extension_settings.autoLorebooks) {
        extension_settings.autoLorebooks = ({} /*: AutoLorebooksSettings */);
    }
    const autoLorebooks /*: AutoLorebooksSettings */ = extension_settings.autoLorebooks;
    autoLorebooks.entity_types = cleaned.length > 0 ? cleaned : [...DEFAULT_ENTITY_TYPES];
    saveSettingsDebounced();
    renderEntityTypesList();
}

function renderEntityTypesList() {
    ensureEntityTypesSetting();
    const autoLorebooks /*: AutoLorebooksSettings */ = extension_settings.autoLorebooks;
    const types = autoLorebooks.entity_types ?? [];
    // $FlowFixMe[cannot-resolve-name]
    const $list = $('#autolorebooks-entity-types-list');
    if ($list.length === 0) return;
    $list.empty();

    if (types.length === 0) {
        $list.append('<div class="opacity50p">No types configured.</div>');
        return;
    }

    types.forEach(type => {
        const def = parseEntityTypeDefinition(type);
        // $FlowFixMe[cannot-resolve-name]
        const $row = $('<div class="flex-container alignitemscenter justifyspacebetween margin-bot-5px autolorebooks-entity-type-row"></div>');
        // $FlowFixMe[cannot-resolve-name]
        const $labelWrapper = $('<div class="flex-container alignitemscenter" style="gap:6px;"></div>');
        const baseLabel = def.name || type;
        // $FlowFixMe[cannot-resolve-name]
        const $base = $('<code class="padding3px"></code>').text(baseLabel);
        $labelWrapper.append($base);
        def.entryFlags.forEach(flag => {
            // $FlowFixMe[cannot-resolve-name]
            const $flag = $('<span class="tag opacity80"></span>').text(`entry:${flag}`);
            $labelWrapper.append($flag);
        });
        // $FlowFixMe[cannot-resolve-name]
        const $remove = $('<button class="menu_button fa-solid fa-trash autolorebooks-entity-type-remove" title="Remove"></button>').attr('data-type', type);
        $row.append($labelWrapper).append($remove);
        $list.append($row);
    });
}

function handleAddEntityTypeFromInput() {
    // $FlowFixMe[cannot-resolve-name]
    const raw = String($('#autolorebooks-entity-type-input').val() || '');
    const normalized = normalizeEntityTypeDefinition(raw);
    const def = parseEntityTypeDefinition(normalized);
    if (!def.name) {
        toast('Enter a valid type (letters, numbers, hyphen/underscore). Optionally add flags like quest(entry:constant).', 'warning');
        return;
    }
    const types = getEntityTypesSetting();
    if (types.includes(normalized)) {
        toast('Type already exists.', 'warning');
        return;
    }
    types.push(normalized);
    setEntityTypesSetting(types);
    // $FlowFixMe[cannot-resolve-name]
    $('#autolorebooks-entity-type-input').val('');
}

function removeEntityType(type /*: string */) {
    const normalized = normalizeEntityTypeDefinition(type);
    const types = getEntityTypesSetting().filter(t => t !== normalized);
    setEntityTypesSetting(types);
}

function restoreEntityTypesToDefault() {
    setEntityTypesSetting([...DEFAULT_ENTITY_TYPES]);
}

export {
    ensureEntityTypesSetting,
    getEntityTypesSetting,
    setEntityTypesSetting,
    renderEntityTypesList,
    handleAddEntityTypeFromInput,
    removeEntityType,
    restoreEntityTypesToDefault,
};

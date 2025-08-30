import { formatInstructModeChat } from './index.js';

function system_prompt_split(text) {
    // Given text with some number of {{macro}} items, split the text by these items and format the rest as system messages surrounding the macros
    // It is assumed that the macros will be later replaced with appropriate text

    // split on either {{...}} or {{#if ... /if}}.
    // /g flag is for global, /s flag makes . match newlines so the {{#if ... /if}} can span multiple lines
    let parts = text.split(/(\{\{#if.*?\/if}})|(\{\{.*?}})/gs);

    let formatted = parts.map((part) => {
        if (!part) return ""  // some parts are undefined
        part = part.trim()  // trim whitespace
        if (!part) return ""  // if empty after trimming
        if (part.startsWith('{{') && part.endsWith('}}')) {
            return part  // don't format macros
        }
        let formatted = formatInstructModeChat("assistant", part, false, true, "", "", "", null)
        return `${formatted}`
    })
    return formatted.join('')
}
function substitute_conditionals(text, params) {
    // substitute any {{#if macro}} ... {{/if}} blocks in the text with the corresponding content if the macro is present in the params object.
    // Does NOT replace the actual macros, that is done in substitute_params()

    let parts = text.split(/(\{\{#if.*?\/if}})/gs);
    let formatted = parts.map((part) => {
        if (!part) return ""
        if (!part.startsWith('{{#if')) return part
        part = part.trim()  // clean whitespace
        let macro_name = part.match(/\{\{#if (.*?)}}/)[1]
        let macro_present = Boolean(params[macro_name]?.trim())
        let conditional_content = part.match(/\{\{#if.*?}}(.*?)\{\{\/if}}/s)[1] ?? ""
        return macro_present ? conditional_content : ""
    })
    return formatted.join('')
}
function substitute_params(text, params) {
    // custom function to parse macros because I literally cannot find where ST does it in their code.
    // Does NOT take into account {{#if macro}} ... {{/if}} blocks, that is done in substitute_conditionals()
    // If the macro is not found in the params object, it is replaced with an empty string

    let parts = text.split(/(\{\{.*?}})/g);
    let formatted = parts.map((part) => {
        if (!part) return ""
        if (!part.startsWith('{{') || !part.endsWith('}}')) return part
        part = part.trim()  // clean whitespace
        let macro = part.slice(2, -2)
        return params[macro] ?? ""
    })
    return formatted.join('')
}

export { system_prompt_split, substitute_conditionals, substitute_params };
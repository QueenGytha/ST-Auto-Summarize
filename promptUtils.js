// @flow
import { formatInstructModeChat } from './index.js';

// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function system_prompt_split(text /*: string */) /*: string */ {
    // Given text with some number of {{macro}} items, split the text by these items and format the rest as system messages surrounding the macros
    // It is assumed that the macros will be later replaced with appropriate text

    // split on either {{...}} or {{#if ... /if}}.
    // /g flag is for global, /s flag makes . match newlines so the {{#if ... /if}} can span multiple lines
    const parts = text.split(/(\{\{#if.*?\/if}})|(\{\{.*?}})/gs);

    const formatted = parts.map((part) => {
        if (!part) return ""  // some parts are undefined
        part = part.trim()  // trim whitespace
        if (!part) return ""  // if empty after trimming
        if (part.startsWith('{{') && part.endsWith('}}')) {
            return part  // don't format macros
        }
        const formatted = formatInstructModeChat("assistant", part, false, true, "", "", "", null)
        return `${formatted}`
    })
    return formatted.join('')
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function substitute_conditionals(text /*: string */, params /*: Object */) /*: string */ {
    // substitute any {{#if macro}} ... {{/if}} blocks in the text with the corresponding content if the macro is present in the params object.
    // Does NOT replace the actual macros, that is done in substitute_params()

    const parts = text.split(/(\{\{#if.*?\/if}})/gs);
    const formatted = parts.map((part) => {
        if (!part) return ""
        if (!part.startsWith('{{#if')) return part
        part = part.trim()  // clean whitespace
        // $FlowFixMe[incompatible-use] - match is guaranteed to succeed because part.startsWith('{{#if')
        const macro_name = part.match(/\{\{#if (.*?)}}/)[1]
        const macro_present = Boolean(params[macro_name]?.trim())
        // $FlowFixMe[incompatible-use] - match is guaranteed to succeed because part.startsWith('{{#if')
        const conditional_content = part.match(/\{\{#if.*?}}(.*?)\{\{\/if}}/s)[1] ?? ""
        return macro_present ? conditional_content : ""
    })
    return formatted.join('')
}
// $FlowFixMe[signature-verification-failure] - Function signature is correct but Flow needs annotation
function substitute_params(text /*: string */, params /*: Object */) /*: string */ {
    // custom function to parse macros because I literally cannot find where ST does it in their code.
    // Does NOT take into account {{#if macro}} ... {{/if}} blocks, that is done in substitute_conditionals()
    // If the macro is not found in the params object, it is replaced with an empty string

    const parts = text.split(/(\{\{.*?}})/g);
    const formatted = parts.map((part) => {
        if (!part) return ""
        if (!part.startsWith('{{') || !part.endsWith('}}')) return part
        part = part.trim()  // clean whitespace
        const macro = part.slice(2, -2)
        return params[macro] ?? ""
    })
    return formatted.join('')
}

export { system_prompt_split, substitute_conditionals, substitute_params };
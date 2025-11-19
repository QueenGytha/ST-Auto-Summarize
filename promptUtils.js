
import { formatInstructModeChat } from './index.js';

function system_prompt_split(text ) {
  // Given text with some number of {{macro}} items, split the text by these items and format the rest as system messages surrounding the macros
  // It is assumed that the macros will be later replaced with appropriate text

  // split on either {{...}} or {{#if ... /if}}.
  // /g flag is for global, /s flag makes . match newlines so the {{#if ... /if}} can span multiple lines
  const parts = text.split(/(\{\{#if.*?\/if}})|(\{\{.*?}})/gs);

  const formatted = parts.map((part) => {
    if (!part) {return "";} // some parts are undefined
    const trimmed = part.trim(); // trim whitespace
    if (!trimmed) {return "";} // if empty after trimming
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
      return trimmed; // don't format macros
    }
    const instructFormatted = formatInstructModeChat("assistant", trimmed, false, true, "", "", "", null);
    return `${instructFormatted}`;
  });
  return formatted.join('');
}
function substitute_conditionals(text , params ) {
  // substitute any {{#if macro}} ... {{/if}} blocks in the text with the corresponding content if the macro is present in the params object.
  // Does NOT replace the actual macros, that is done in substitute_params()

  const parts = text.split(/(\{\{#if.*?\/if}})/gs);
  const formatted = parts.map((part) => {
    if (!part) {return "";}
    if (!part.startsWith('{{#if')) {return part;}
    const trimmed = part.trim(); // clean whitespace
    const macro_name = trimmed.match(/\{\{#if (.*?)}}/)[1];
    const macro_present = Boolean(params[macro_name]?.trim());
    const conditional_content = trimmed.match(/\{\{#if.*?}}(.*?)\{\{\/if}}/s)[1] ?? "";
    return macro_present ? conditional_content : "";
  });
  return formatted.join('');
}
async function substitute_params(text , params ) {
  // Use ST's substituteParams() with our custom macros passed as additionalMacro
  // This way ST handles ALL macro substitution ({{user}}, {{char}}, and our custom ones)
  const { substituteParams } = await import('../../../../script.js');

  // ST's substituteParams uses the 7th parameter for additional macros
  // Pass undefined for params 2-6 to use defaults, then our macros as additionalMacro
  return substituteParams(
    text,
    undefined,  // _name1 (uses global name1)
    undefined,  // _name2 (uses global name2)
    undefined,  // _original
    undefined,  // _group
    true,       // _replaceCharacterCard
    params      // additionalMacro - our custom macros
  );
}

export { system_prompt_split, substitute_conditionals, substitute_params };
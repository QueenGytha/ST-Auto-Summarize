import {
  debug,
  SUBSYSTEM,
  get_settings,
  set_settings,
  saveSettings,
  saveSettingsDebounced,
  getContext,
  extension_settings,
  MODULE_NAME
} from './index.js';

const JSON_INDENT_SPACES = 2;
const RANDOM_ID_BASE = 36;
const RANDOM_ID_SLICE_START = 2;
const RANDOM_ID_SLICE_END = 9;

export function getStripPatternSets() {
  return get_settings('strip_pattern_sets') || {};
}

export function getStripPatternSet(name) {
  const sets = getStripPatternSets();
  return sets[name] || null;
}

export function getActivePatternSetName() {
  const ctx = getContext();
  const chatId = ctx.chatId;
  const charKey = ctx.characterId;

  const chatMapping = get_settings('chat_strip_patterns')?.[chatId];
  if (chatMapping) {
    debug(SUBSYSTEM.SETTINGS, `Using chat-pinned pattern set: ${chatMapping}`);
    return chatMapping;
  }

  const charMapping = get_settings('character_strip_patterns')?.[charKey];
  if (charMapping) {
    debug(SUBSYSTEM.SETTINGS, `Using character-pinned pattern set: ${charMapping}`);
    return charMapping;
  }

  const active = get_settings('active_strip_pattern_set');
  if (active) {
    debug(SUBSYSTEM.SETTINGS, `Using active pattern set: ${active}`);
  }
  return active;
}

export function getActivePatterns() {
  const setName = getActivePatternSetName();
  if (!setName) {
    debug(SUBSYSTEM.CORE, `[getActivePatterns] No active pattern set name`);
    return [];
  }

  const patternSet = getStripPatternSet(setName);
  if (!patternSet?.patterns) {
    debug(SUBSYSTEM.CORE, `[getActivePatterns] Pattern set "${setName}" not found or has no patterns`);
    return [];
  }

  const enabledPatterns = patternSet.patterns.filter(p => p.enabled);
  debug(SUBSYSTEM.CORE, `[getActivePatterns] Found ${enabledPatterns.length} enabled patterns in set "${setName}"`);
  if (enabledPatterns.length > 0) {
    debug(SUBSYSTEM.CORE, `[getActivePatterns] First pattern: name="${enabledPatterns[0].name}", pattern="${enabledPatterns[0].pattern}", flags="${enabledPatterns[0].flags}"`);
  }
  return enabledPatterns;
}

export function getActiveMessagesDepth() {
  const setName = getActivePatternSetName();
  if (setName) {
    const patternSet = getStripPatternSet(setName);
    if (patternSet?.messagesDepth !== undefined) {
      return patternSet.messagesDepth;
    }
  }
  return get_settings('messages_depth') ?? 1;
}

export function getActiveSummarizationDepth() {
  const setName = getActivePatternSetName();
  if (setName) {
    const patternSet = getStripPatternSet(setName);
    if (patternSet?.summarizationDepth !== undefined) {
      return patternSet.summarizationDepth;
    }
  }
  return get_settings('summarization_depth') ?? 0;
}

export function createPatternSet(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Pattern set name is required');
  }

  const sets = getStripPatternSets();
  if (sets[name]) {
    throw new Error(`Pattern set "${name}" already exists`);
  }

  sets[name] = {
    patterns: [],
    messagesDepth: 1,
    summarizationDepth: 0,
    createdAt: Date.now(),
    modifiedAt: Date.now()
  };

  set_settings('strip_pattern_sets', sets);
  saveSettingsDebounced();

  debug(SUBSYSTEM.SETTINGS, `Created pattern set: ${name}`);
  return sets[name];
}

export function deletePatternSet(name) {
  const sets = getStripPatternSets();
  if (!sets[name]) {
    throw new Error(`Pattern set "${name}" does not exist`);
  }

  delete sets[name];
  set_settings('strip_pattern_sets', sets);

  if (get_settings('active_strip_pattern_set') === name) {
    set_settings('active_strip_pattern_set', null);
  }

  const charMappings = get_settings('character_strip_patterns') || {};
  for (const key of Object.keys(charMappings)) {
    if (charMappings[key] === name) {
      delete charMappings[key];
    }
  }
  set_settings('character_strip_patterns', charMappings);

  const chatMappings = get_settings('chat_strip_patterns') || {};
  for (const key of Object.keys(chatMappings)) {
    if (chatMappings[key] === name) {
      delete chatMappings[key];
    }
  }
  set_settings('chat_strip_patterns', chatMappings);

  saveSettingsDebounced();
  debug(SUBSYSTEM.SETTINGS, `Deleted pattern set: ${name}`);
}

export function renamePatternSet(oldName, newName) {
  if (!newName || typeof newName !== 'string') {
    throw new Error('New name is required');
  }

  const sets = getStripPatternSets();
  if (!sets[oldName]) {
    throw new Error(`Pattern set "${oldName}" does not exist`);
  }
  if (sets[newName]) {
    throw new Error(`Pattern set "${newName}" already exists`);
  }

  sets[newName] = sets[oldName];
  sets[newName].modifiedAt = Date.now();
  delete sets[oldName];
  set_settings('strip_pattern_sets', sets);

  if (get_settings('active_strip_pattern_set') === oldName) {
    set_settings('active_strip_pattern_set', newName);
  }

  const charMappings = get_settings('character_strip_patterns') || {};
  for (const key of Object.keys(charMappings)) {
    if (charMappings[key] === oldName) {
      charMappings[key] = newName;
    }
  }
  set_settings('character_strip_patterns', charMappings);

  const chatMappings = get_settings('chat_strip_patterns') || {};
  for (const key of Object.keys(chatMappings)) {
    if (chatMappings[key] === oldName) {
      chatMappings[key] = newName;
    }
  }
  set_settings('chat_strip_patterns', chatMappings);

  saveSettingsDebounced();
  debug(SUBSYSTEM.SETTINGS, `Renamed pattern set: ${oldName} → ${newName}`);
}

export async function setActivePatternSet(name) {
  if (name !== null) {
    const sets = getStripPatternSets();
    if (!sets[name]) {
      throw new Error(`Pattern set "${name}" does not exist`);
    }
  }

  // Directly set value without triggering debounced save to avoid race conditions
  extension_settings[MODULE_NAME]['active_strip_pattern_set'] = name;
  await saveSettings();
  debug(SUBSYSTEM.SETTINGS, `Set active pattern set: ${name}`);
}

export function pinPatternSetToCharacter(name) {
  const ctx = getContext();
  const charKey = ctx.characterId;
  if (!charKey) {
    throw new Error('No character selected');
  }

  const sets = getStripPatternSets();
  if (!sets[name]) {
    throw new Error(`Pattern set "${name}" does not exist`);
  }

  const mappings = get_settings('character_strip_patterns') || {};
  mappings[charKey] = name;
  set_settings('character_strip_patterns', mappings);
  saveSettingsDebounced();

  debug(SUBSYSTEM.SETTINGS, `Pinned pattern set "${name}" to character: ${charKey}`);
}

export function unpinPatternSetFromCharacter() {
  const ctx = getContext();
  const charKey = ctx.characterId;
  if (!charKey) {
    return;
  }

  const mappings = get_settings('character_strip_patterns') || {};
  if (mappings[charKey]) {
    delete mappings[charKey];
    set_settings('character_strip_patterns', mappings);
    saveSettingsDebounced();
    debug(SUBSYSTEM.SETTINGS, `Unpinned pattern set from character: ${charKey}`);
  }
}

export function pinPatternSetToChat(name) {
  const ctx = getContext();
  const chatId = ctx.chatId;
  if (!chatId) {
    throw new Error('No chat selected');
  }

  const sets = getStripPatternSets();
  if (!sets[name]) {
    throw new Error(`Pattern set "${name}" does not exist`);
  }

  const mappings = get_settings('chat_strip_patterns') || {};
  mappings[chatId] = name;
  set_settings('chat_strip_patterns', mappings);
  saveSettingsDebounced();

  debug(SUBSYSTEM.SETTINGS, `Pinned pattern set "${name}" to chat: ${chatId}`);
}

export function unpinPatternSetFromChat() {
  const ctx = getContext();
  const chatId = ctx.chatId;
  if (!chatId) {
    return;
  }

  const mappings = get_settings('chat_strip_patterns') || {};
  if (mappings[chatId]) {
    delete mappings[chatId];
    set_settings('chat_strip_patterns', mappings);
    saveSettingsDebounced();
    debug(SUBSYSTEM.SETTINGS, `Unpinned pattern set from chat: ${chatId}`);
  }
}

export function getCharacterPinnedSet() {
  const ctx = getContext();
  const charKey = ctx.characterId;
  if (!charKey) {
    return null;
  }

  const mappings = get_settings('character_strip_patterns') || {};
  return mappings[charKey] || null;
}

export function getChatPinnedSet() {
  const ctx = getContext();
  const chatId = ctx.chatId;
  if (!chatId) {
    return null;
  }

  const mappings = get_settings('chat_strip_patterns') || {};
  return mappings[chatId] || null;
}

function generatePatternId() {
  return `pat_${Date.now()}_${Math.random().toString(RANDOM_ID_BASE).slice(RANDOM_ID_SLICE_START, RANDOM_ID_SLICE_END)}`;
}

export function addPatternToSet(setName, pattern) {
  const sets = getStripPatternSets();
  if (!sets[setName]) {
    throw new Error(`Pattern set "${setName}" does not exist`);
  }

  try {
    new RegExp(pattern.pattern, pattern.flags || 'gi');
  } catch {
    throw new Error(`Invalid regex pattern: ${pattern.pattern}`);
  }

  const newPattern = {
    id: generatePatternId(),
    name: pattern.name || 'Unnamed Pattern',
    pattern: pattern.pattern,
    flags: pattern.flags || 'gi',
    enabled: pattern.enabled !== false
  };

  sets[setName].patterns.push(newPattern);
  sets[setName].modifiedAt = Date.now();
  set_settings('strip_pattern_sets', sets);
  saveSettingsDebounced();

  debug(SUBSYSTEM.SETTINGS, `Added pattern "${newPattern.name}" to set "${setName}"`);
  return newPattern;
}

export function updatePatternInSet(setName, patternId, updates) {
  const sets = getStripPatternSets();
  if (!sets[setName]) {
    throw new Error(`Pattern set "${setName}" does not exist`);
  }

  const patternIndex = sets[setName].patterns.findIndex(p => p.id === patternId);
  if (patternIndex === -1) {
    throw new Error(`Pattern "${patternId}" not found in set "${setName}"`);
  }

  if (updates.pattern !== undefined) {
    try {
      new RegExp(updates.pattern, updates.flags || sets[setName].patterns[patternIndex].flags);
    } catch {
      throw new Error(`Invalid regex pattern: ${updates.pattern}`);
    }
  }

  Object.assign(sets[setName].patterns[patternIndex], updates);
  sets[setName].modifiedAt = Date.now();
  set_settings('strip_pattern_sets', sets);
  saveSettingsDebounced();

  debug(SUBSYSTEM.SETTINGS, `Updated pattern "${patternId}" in set "${setName}"`);
}

export function removePatternFromSet(setName, patternId) {
  const sets = getStripPatternSets();
  if (!sets[setName]) {
    throw new Error(`Pattern set "${setName}" does not exist`);
  }

  const patternIndex = sets[setName].patterns.findIndex(p => p.id === patternId);
  if (patternIndex === -1) {
    throw new Error(`Pattern "${patternId}" not found in set "${setName}"`);
  }

  sets[setName].patterns.splice(patternIndex, 1);
  sets[setName].modifiedAt = Date.now();
  set_settings('strip_pattern_sets', sets);
  saveSettingsDebounced();

  debug(SUBSYSTEM.SETTINGS, `Removed pattern "${patternId}" from set "${setName}"`);
}

export function updatePatternSetDepth(setName, depthType, value) {
  const sets = getStripPatternSets();
  if (!sets[setName]) {
    debug(SUBSYSTEM.SETTINGS, `Cannot update depth: pattern set "${setName}" does not exist`);
    return false;
  }

  if (depthType === 'messages') {
    sets[setName].messagesDepth = value;
  } else if (depthType === 'summarization') {
    sets[setName].summarizationDepth = value;
  } else {
    debug(SUBSYSTEM.SETTINGS, `Unknown depth type: ${depthType}`);
    return false;
  }

  sets[setName].modifiedAt = Date.now();
  set_settings('strip_pattern_sets', sets);
  saveSettingsDebounced();

  debug(SUBSYSTEM.SETTINGS, `Updated ${depthType} depth to ${value} for set "${setName}"`);
  return true;
}

export function exportPatternSet(name) {
  const patternSet = getStripPatternSet(name);
  if (!patternSet) {
    throw new Error(`Pattern set "${name}" does not exist`);
  }

  const exportData = {
    name: name,
    version: 1,
    exportedAt: Date.now(),
    patterns: patternSet.patterns,
    messagesDepth: patternSet.messagesDepth ?? 1,
    summarizationDepth: patternSet.summarizationDepth ?? 0
  };

  const data = JSON.stringify(exportData, null, JSON_INDENT_SPACES);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `strip-patterns-${name.replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);

  debug(SUBSYSTEM.SETTINGS, `Exported pattern set: ${name}`);
}

export async function importPatternSet(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data.patterns || !Array.isArray(data.patterns)) {
    throw new Error('Invalid pattern set file: missing patterns array');
  }

  const name = data.name || file.name.replace('.json', '').replace('strip-patterns-', '');

  const sets = getStripPatternSets();

  if (sets[name]) {
    const ctx = getContext();
    const overwrite = await ctx.Popup.show.confirm(
      'Pattern Set Exists',
      `A pattern set named "${name}" already exists. Overwrite it?`
    );
    if (!overwrite) {
      debug(SUBSYSTEM.SETTINGS, `Import cancelled: ${name} already exists`);
      return null;
    }
  }

  const patterns = data.patterns.map(p => ({
    id: generatePatternId(),
    name: p.name || 'Unnamed Pattern',
    pattern: p.pattern,
    flags: p.flags || 'gi',
    enabled: p.enabled !== false
  }));

  sets[name] = {
    patterns,
    messagesDepth: data.messagesDepth ?? 1,
    summarizationDepth: data.summarizationDepth ?? 0,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    importedFrom: file.name
  };

  set_settings('strip_pattern_sets', sets);
  saveSettingsDebounced();

  debug(SUBSYSTEM.SETTINGS, `Imported pattern set: ${name} (${patterns.length} patterns)`);
  return name;
}

export function applyStrippingPatterns(text, patterns) {
  if (!patterns || patterns.length === 0) {
    return text;
  }

  let result = text;
  for (const pattern of patterns) {
    if (!pattern.enabled) {
      continue;
    }

    try {
      const regex = new RegExp(pattern.pattern, pattern.flags || 'gi');
      const matches = text.match(regex);
      if (matches) {
        debug(SUBSYSTEM.CORE, `[applyStrippingPatterns] Pattern "${pattern.name}" (/${pattern.pattern}/${pattern.flags}) found ${matches.length} match(es)`);
      }
      result = result.replace(regex, '');
    } catch (err) {
      debug(SUBSYSTEM.CORE, `Invalid pattern "${pattern.name}": ${err.message}`);
    }
  }

  return result.trim();
}

export function testPatterns(text, patterns) {
  const results = {
    original: text,
    stripped: text,
    matches: []
  };

  if (!patterns || patterns.length === 0) {
    return results;
  }

  for (const pattern of patterns) {
    if (!pattern.enabled) {
      continue;
    }

    try {
      const regex = new RegExp(pattern.pattern, pattern.flags || 'gi');
      const matches = text.match(regex);
      if (matches) {
        results.matches.push({
          patternName: pattern.name,
          matchCount: matches.length,
          matches: matches
        });
      }
      results.stripped = results.stripped.replace(regex, '');
    } catch (err) {
      results.matches.push({
        patternName: pattern.name,
        error: err.message
      });
    }
  }

  results.stripped = results.stripped.trim();
  return results;
}

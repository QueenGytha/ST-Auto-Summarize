


export const DEFAULT_ENTITY_TYPES  = [
'character',
'location',
'item',
'faction',
'quest(entry:constant)',
'rule(entry:constant)'];


const VALID_ENTRY_FLAGS  = new Set(['constant']);

function sanitizeBaseName(value ) {
  return value.
  toLowerCase().
  trim().
  replace(/\s+/g, '_').
  replace(/[^a-z0-9_-]/g, '');
}

export function parseEntityTypeDefinition(rawValue ) {
  const trimmed = String(rawValue || '').trim();
  const lower = trimmed.toLowerCase();

  let namePart = lower;
  let flagsPart = '';

  const openIdx = lower.indexOf('(');
  const closeIdx = lower.lastIndexOf(')');

  if (openIdx >= 0 && closeIdx > openIdx) {
    namePart = lower.slice(0, openIdx);
    flagsPart = lower.slice(openIdx + 1, closeIdx);
  }

  const name = sanitizeBaseName(namePart);
  const entryFlags  = [];

  if (flagsPart) {
    const tokens = flagsPart.split(',');
    tokens.forEach((token) => {
      const t = token.trim();
      if (!t) return;
      if (!t.startsWith('entry:')) return;
      const flagName = t.slice('entry:'.length).trim();
      if (VALID_ENTRY_FLAGS.has(flagName)) {
        if (!entryFlags.includes(flagName)) {
          entryFlags.push(flagName);
        }
      }
    });
  }

  return {
    raw: trimmed,
    name,
    entryFlags
  };
}

export function normalizeEntityTypeDefinition(rawValue ) {
  const parsed = parseEntityTypeDefinition(rawValue);
  if (!parsed.name) return '';
  const flags = [...parsed.entryFlags].sort().map((flag) => `entry:${flag}`);
  return flags.length ? `${parsed.name}(${flags.join(',')})` : parsed.name;
}

export function sanitizeEntityType(value ) {
  return normalizeEntityTypeDefinition(value);
}

export function getConfiguredEntityTypeDefinitions(rawList ) {
  const source = Array.isArray(rawList) && rawList.length > 0 ? rawList : DEFAULT_ENTITY_TYPES;
  const defs  = [];
  const seen  = new Set();

  source.forEach((raw) => {
    const normalized = normalizeEntityTypeDefinition(raw);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    defs.push(parseEntityTypeDefinition(normalized));
  });

  if (defs.length === 0) {
    return getConfiguredEntityTypeDefinitions(DEFAULT_ENTITY_TYPES);
  }

  return defs;
}

export function formatEntityTypeListForPrompt(defs ) {
  return defs.map((def) => def.name).filter(Boolean).join('|');
}

export function createEntityTypeMap(defs ) {
  const map  = new Map();
  defs.forEach((def) => {
    if (!def.name) return;
    if (!map.has(def.name)) {
      map.set(def.name, def);
    }
  });
  return map;
}

export function applyEntityTypeFlagsToEntry(entry , def ) {
  if (!def) return;
  const flags  = new Set(def.entryFlags);
  if (flags.has('constant')) {
    entry.constant = true;
    entry.disable = false;
    entry.useProbability = false;
    entry.probability = 100;
  }
}

export function sanitizeEntityTypeName(name ) {
  return sanitizeBaseName(name);
}

export function getEntityTypeDefinitionsFromSettings(settings ) {
  const rawList = settings?.autoLorebooks?.entity_types;
  return getConfiguredEntityTypeDefinitions(rawList);
}
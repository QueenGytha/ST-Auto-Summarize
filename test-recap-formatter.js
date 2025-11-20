/**
 * Test script for recap formatter
 * Run with: node test-recap-formatter.js
 *
 * Note: This test uses a standalone version of the formatter functions
 * to avoid importing SillyTavern dependencies
 */

// Standalone constants
const SEPARATOR_LENGTH = 60;
const SCENE_PREFIX_LENGTH = 7;
const TYPE_PREFIX_LENGTH = 6;
const KEYWORDS_PREFIX_LENGTH = 10;

// Mock debug function
const debug = () => {};

// Standalone formatter implementation for testing
function formatSceneRecapForDisplay(recapJson) {
  if (!recapJson || typeof recapJson !== 'string') {
    return '';
  }

  try {
    const parsed = JSON.parse(recapJson);

    if (!parsed || typeof parsed !== 'object') {
      return recapJson;
    }

    const parts = [];

    if (parsed.scene_name) {
      parts.push(`Scene: ${parsed.scene_name}`);
      parts.push('');
    }

    if (parsed.recap) {
      parts.push(parsed.recap);
    }

    if (Array.isArray(parsed.setting_lore) && parsed.setting_lore.length > 0) {
      parts.push('');
      parts.push('='.repeat(SEPARATOR_LENGTH));
      parts.push('LOREBOOK ENTRIES');
      parts.push('='.repeat(SEPARATOR_LENGTH));
      parts.push('');

      for (const [index, entry] of parsed.setting_lore.entries()) {
        parts.push(`--- Entry ${index + 1}: ${entry.name || entry.comment || 'Unnamed'} ---`);
        parts.push('');

        if (entry.type) {
          parts.push(`Type: ${entry.type}`);
        }
        if (entry.keywords && Array.isArray(entry.keywords)) {
          parts.push(`Keywords: ${entry.keywords.join(', ')}`);
        }

        if (entry.content) {
          parts.push('');
          parts.push(entry.content);
        }

        parts.push('');
      }
    }

    return parts.join('\n');
  } catch (err) {
    debug('Failed to format recap for display:', err.message);
    return recapJson;
  }
}

function tryParseJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function saveCurrentEntry(currentEntry, contentLines, result) {
  if (!currentEntry) {
    return;
  }
  if (contentLines.length > 0) {
    currentEntry.content = contentLines.join('\n').trim();
  }
  result.setting_lore.push(currentEntry);
}

function parseEntryName(line) {
  const nameMatch = line.match(/^---\s*Entry\s+\d+:\s*(.+?)\s*---/);
  return nameMatch ? nameMatch[1] : 'Unnamed';
}

function processFormattedLine(config) {
  const { line, currentSection, currentEntry, recapLines, contentLines, result } = config;

  if (line.startsWith('Scene: ')) {
    result.scene_name = line.slice(SCENE_PREFIX_LENGTH).trim();
    return { sectionChange: null, entryChange: null };
  }

  if (line.includes('LOREBOOK ENTRIES')) {
    if (recapLines.length > 0) {
      result.recap = recapLines.join('\n').trim();
      recapLines.length = 0;
    }
    return { sectionChange: 'lorebook', entryChange: null };
  }

  if (line.match(/^---\s*Entry\s+\d+:/)) {
    const newEntry = {
      name: parseEntryName(line),
      type: 'character',
      keywords: [],
      content: ''
    };
    contentLines.length = 0;
    return { sectionChange: null, entryChange: newEntry };
  }

  if (currentSection === 'lorebook' && currentEntry) {
    if (line.startsWith('Type: ')) {
      currentEntry.type = line.slice(TYPE_PREFIX_LENGTH).trim();
      return { sectionChange: null, entryChange: null };
    }
    if (line.startsWith('Keywords: ')) {
      currentEntry.keywords = line.slice(KEYWORDS_PREFIX_LENGTH).split(',').map(k => k.trim()).filter(k => k);
      return { sectionChange: null, entryChange: null };
    }
  }

  if (line.match(/^=+$/) || line.trim() === '') {
    if (currentSection === 'header' && recapLines.length > 0) {
      recapLines.push('');
    } else if (currentEntry && contentLines.length > 0) {
      contentLines.push('');
    }
    return { sectionChange: null, entryChange: null };
  }

  if (currentSection === 'header') {
    recapLines.push(line);
  } else if (currentEntry) {
    contentLines.push(line);
  }

  return { sectionChange: null, entryChange: null };
}

function parseFormattedText(trimmed) {
  const result = {
    scene_name: '',
    recap: '',
    setting_lore: []
  };

  const lines = trimmed.split('\n');
  let currentSection = 'header';
  let currentEntry = null;
  const recapLines = [];
  const contentLines = [];

  for (const line of lines) {
    const { sectionChange, entryChange } = processFormattedLine({
      line,
      currentSection,
      currentEntry,
      recapLines,
      contentLines,
      result
    });

    if (entryChange !== null) {
      saveCurrentEntry(currentEntry, contentLines, result);
      currentEntry = entryChange;
    }

    if (sectionChange !== null) {
      currentSection = sectionChange;
    }
  }

  saveCurrentEntry(currentEntry, contentLines, result);

  if (recapLines.length > 0 && !result.recap) {
    result.recap = recapLines.join('\n').trim();
  }

  return result;
}

function parseSceneRecap(recapText) {
  if (!recapText || typeof recapText !== 'string') {
    return null;
  }

  const trimmed = recapText.trim();
  const jsonResult = tryParseJson(trimmed);
  if (jsonResult) {
    return jsonResult;
  }

  try {
    return parseFormattedText(trimmed);
  } catch (err) {
    debug('Failed to parse formatted recap:', err.message);
    return {
      scene_name: '',
      recap: trimmed,
      setting_lore: []
    };
  }
}

function compactSceneRecap(recapText) {
  const parsed = parseSceneRecap(recapText);
  if (!parsed) {
    return recapText;
  }
  return JSON.stringify(parsed);
}

// Example JSON from user
const exampleJson = {
  "scene_name": "Node Examination and Gift Testing",
  "recap": "## Key Developments\n- [discovery] Rance demonstrates extraordinary magical perception during node examination, sensing structure/flow without training\n- [reveal] Rance admits to Circle members he can perceive the node and could potentially use it\n- [reveal] In private with Elspeth, Rance demonstrates fuller abilities (telekinetically levitating her)\n- [discovery] Through physical contact experiments, Elspeth shows signs of faint magical sensitivity\n- [decision] Rance and Elspeth agree to test for her potential Mage-Gift through closer physical contact, removing clothing to enhance connection\n\n## Tone & Style\nGenre: high fantasy with political intrigue; Narrative voice: third-person limited past tense; Prose: descriptive with emphasis on character reactions and magical perception\n\n## Pending Threads\n- Determine if Elspeth has latent Mage-Gift\n- Establish training plan if Elspeth has magical sensitivity\n- Integrate Elspeth into Rance's network outside institutional oversight",
  "setting_lore": [
    {
      "type": "character",
      "name": "Elspeth",
      "content": "- Identity: Character — Elspeth; Heir to Valdemar; trainee with potential latent magical sensitivity\n- Attributes: dark eyes like Selenay's; athletic body beneath formal whites; toned legs from weapons training; practical undergarments; strategic thinking; direct communication; royal bearing; analytical mind; remarkable composure; decisive despite youth",
      "keywords": ["elspeth", "heir", "princess", "latent gift"]
    },
    {
      "type": "character",
      "name": "Elcarth",
      "content": "- Identity: Character — Elcarth; Dean of Collegium; node examination supervisor\n- Psychology: unexpected perception abilities → protective positioning → administrative caution; trainee exceeding parameters → surprise → recalibration of approach",
      "keywords": ["elcarth", "dean"]
    }
  ]
};

const jsonString = JSON.stringify(exampleJson);

const SEPARATOR_LEN = 80;
const PREVIEW_LEN = 100;

/* eslint-disable no-console -- Test script requires console output to display results */
console.log('='.repeat(SEPARATOR_LEN));
console.log('ORIGINAL JSON (compact):');
console.log('='.repeat(SEPARATOR_LEN));
console.log(jsonString);
console.log('\n');

console.log('='.repeat(SEPARATOR_LEN));
console.log('FORMATTED FOR DISPLAY:');
console.log('='.repeat(SEPARATOR_LEN));
const formatted = formatSceneRecapForDisplay(jsonString);
console.log(formatted);
console.log('\n');

console.log('='.repeat(SEPARATOR_LEN));
console.log('PARSE FORMATTED TEXT BACK:');
console.log('='.repeat(SEPARATOR_LEN));
const parsed = parseSceneRecap(formatted);
console.log('Parsed scene_name:', parsed.scene_name);
console.log('Parsed recap (first 100 chars):', parsed.recap.slice(0, PREVIEW_LEN) + '...');
console.log('Parsed lorebook entries count:', parsed.setting_lore.length);
if (parsed.setting_lore.length > 0) {
  console.log('First entry name:', parsed.setting_lore[0].name);
  console.log('First entry keywords:', parsed.setting_lore[0].keywords);
}
console.log('\n');

console.log('='.repeat(SEPARATOR_LEN));
console.log('COMPACT BACK TO JSON:');
console.log('='.repeat(SEPARATOR_LEN));
const compacted = compactSceneRecap(formatted);
console.log('Compacted successfully:', compacted.length > 0);
console.log('Round-trip successful:', JSON.stringify(JSON.parse(compacted)) === JSON.stringify(exampleJson));
console.log('\n');

console.log('✓ All tests completed!');
/* eslint-enable no-console -- Re-enable console restrictions */

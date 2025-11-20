/**
 * Formatting utilities for scene recaps
 * Handles conversion between compact JSON and human-readable formatted text
 */

import { debug, SUBSYSTEM } from './index.js';

const SEPARATOR_LENGTH = 60;
const SCENE_PREFIX_LENGTH = 7;
const TYPE_PREFIX_LENGTH = 6;
const KEYWORDS_PREFIX_LENGTH = 10;

/**
 * Format a scene recap JSON for human readability
 * @param {string} recapJson - The JSON string to format
 * @returns {string} Formatted recap text with line breaks between sections
 */
export function formatSceneRecapForDisplay(recapJson) {
  if (!recapJson || typeof recapJson !== 'string') {
    return '';
  }

  try {
    const parsed = JSON.parse(recapJson);

    if (!parsed || typeof parsed !== 'object') {
      return recapJson;
    }

    const parts = [];

    // Add scene name if present
    if (parsed.scene_name) {
      parts.push(`Scene: ${parsed.scene_name}`);
      parts.push('');
    }

    // Add recap text
    if (parsed.recap) {
      parts.push(parsed.recap);
    }

    // Add lorebook entries if present
    if (Array.isArray(parsed.setting_lore) && parsed.setting_lore.length > 0) {
      parts.push('');
      parts.push('='.repeat(SEPARATOR_LENGTH));
      parts.push('LOREBOOK ENTRIES');
      parts.push('='.repeat(SEPARATOR_LENGTH));
      parts.push('');

      for (const [index, entry] of parsed.setting_lore.entries()) {
        parts.push(`--- Entry ${index + 1}: ${entry.name || entry.comment || 'Unnamed'} ---`);
        parts.push('');

        // Format entry metadata
        if (entry.type) {
          parts.push(`Type: ${entry.type}`);
        }
        if (entry.keywords && Array.isArray(entry.keywords)) {
          parts.push(`Keywords: ${entry.keywords.join(', ')}`);
        }

        // Add entry content
        if (entry.content) {
          parts.push('');
          parts.push(entry.content);
        }

        parts.push('');
      }
    }

    return parts.join('\n');
  } catch (err) {
    debug(SUBSYSTEM.CORE, `Failed to format recap for display: ${err.message}`);
    return recapJson;
  }
}

/**
 * Try parsing as compact JSON
 */
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

/**
 * Save current lorebook entry to result
 */
function saveCurrentEntry(currentEntry, contentLines, result) {
  if (!currentEntry) {
    return;
  }
  if (contentLines.length > 0) {
    currentEntry.content = contentLines.join('\n').trim();
  }
  result.setting_lore.push(currentEntry);
}

/**
 * Parse entry name from line
 */
function parseEntryName(line) {
  const nameMatch = line.match(/^---\s*Entry\s+\d+:\s*(.+?)\s*---/);
  return nameMatch ? nameMatch[1] : 'Unnamed';
}

/**
 * Process a single line during formatted text parsing
 */
function processFormattedLine(config) {
  const { line, currentSection, currentEntry, recapLines, contentLines, result } = config;

  // Check for scene name
  if (line.startsWith('Scene: ')) {
    result.scene_name = line.slice(SCENE_PREFIX_LENGTH).trim();
    return { sectionChange: null, entryChange: null };
  }

  // Check for lorebook section start
  if (line.includes('LOREBOOK ENTRIES')) {
    if (recapLines.length > 0) {
      result.recap = recapLines.join('\n').trim();
      recapLines.length = 0;
    }
    return { sectionChange: 'lorebook', entryChange: null };
  }

  // Check for entry separator
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

  // Parse entry metadata
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

  // Skip separator lines but track empty lines
  if (line.match(/^=+$/) || line.trim() === '') {
    if (currentSection === 'header' && recapLines.length > 0) {
      recapLines.push('');
    } else if (currentEntry && contentLines.length > 0) {
      contentLines.push('');
    }
    return { sectionChange: null, entryChange: null };
  }

  // Accumulate content lines
  if (currentSection === 'header') {
    recapLines.push(line);
  } else if (currentEntry) {
    contentLines.push(line);
  }

  return { sectionChange: null, entryChange: null };
}

/**
 * Parse formatted text back to JSON structure
 */
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

  // Save final entry and recap
  saveCurrentEntry(currentEntry, contentLines, result);

  if (recapLines.length > 0 && !result.recap) {
    result.recap = recapLines.join('\n').trim();
  }

  return result;
}

/**
 * Parse a scene recap from either formatted text or JSON
 * Handles both compact JSON and human-readable formatted versions
 * @param {string} recapText - The recap text to parse
 * @returns {object|null} Parsed recap object or null if parsing fails
 */
export function parseSceneRecap(recapText) {
  if (!recapText || typeof recapText !== 'string') {
    return null;
  }

  const trimmed = recapText.trim();

  // Try parsing as JSON first (compact format)
  const jsonResult = tryParseJson(trimmed);
  if (jsonResult) {
    return jsonResult;
  }

  // Parse formatted text back to JSON structure
  try {
    return parseFormattedText(trimmed);
  } catch (err) {
    debug(SUBSYSTEM.CORE, `Failed to parse formatted recap: ${err.message}`);
    // Return as plain text in recap field
    return {
      scene_name: '',
      recap: trimmed,
      setting_lore: []
    };
  }
}

/**
 * Convert a scene recap back to compact JSON format
 * @param {string} recapText - The recap text (formatted or JSON)
 * @returns {string} Compact JSON string
 */
export function compactSceneRecap(recapText) {
  const parsed = parseSceneRecap(recapText);
  if (!parsed) {
    return recapText;
  }
  return JSON.stringify(parsed);
}

/**
 * Extract just the recap text from a scene recap (formatted or JSON)
 * @param {string} recapText - The recap text to extract from
 * @returns {string} Just the recap portion
 */
export function extractRecapText(recapText) {
  const parsed = parseSceneRecap(recapText);
  if (!parsed) {
    return recapText;
  }
  return parsed.recap || '';
}

/**
 * Extract lorebook entries from a scene recap (formatted or JSON)
 * @param {string} recapText - The recap text to extract from
 * @returns {Array} Array of lorebook entry objects
 */
export function extractLorebookEntries(recapText) {
  const parsed = parseSceneRecap(recapText);
  if (!parsed) {
    return [];
  }
  return parsed.setting_lore || [];
}

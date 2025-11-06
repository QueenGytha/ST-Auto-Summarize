
// categoryIndexes.js - Automatic category index entries for ST-Auto-Lorebooks
// Creates "Characters", "Locations", etc. entries that list all entities in each category
// These are always active but DON'T trigger the actual entity entries (prevents context bloat)

// Will be imported from index.js via barrel exports
let log , debug , error , getLorebookEntries , addLorebookEntry , modifyLorebookEntry , deleteLorebookEntry , getSetting ; // Utility and lorebook functions - any type is legitimate

export function initCategoryIndexes(utils , lorebookManagerUtils , settingsManagerUtils ) {
  // All parameters are any type - objects with various properties - legitimate use of any
  log = utils.log;
  debug = utils.debug;
  error = utils.error;
  getLorebookEntries = lorebookManagerUtils.getLorebookEntries;
  addLorebookEntry = lorebookManagerUtils.addLorebookEntry;
  modifyLorebookEntry = lorebookManagerUtils.modifyLorebookEntry;
  deleteLorebookEntry = lorebookManagerUtils.deleteLorebookEntry;

  if (settingsManagerUtils) {
    getSetting = settingsManagerUtils.getSetting;
  }
}

const CATEGORY_CONFIG = {
  'character': {
    indexName: '__index_characters',
    displayName: 'Characters',
    keys: ['characters', 'character list', 'known characters'],
    order: 1000,
    description: 'List of all known characters and NPCs'
  },
  'creature': {
    indexName: '__index_creatures',
    displayName: 'Creatures',
    keys: ['creatures', 'creature list', 'known creatures'],
    order: 999,
    description: 'List of all known creatures and monsters'
  },
  'location': {
    indexName: '__index_locations',
    displayName: 'Locations',
    keys: ['locations', 'location list', 'known locations', 'places'],
    order: 998,
    description: 'List of all known locations and places'
  },
  'object': {
    indexName: '__index_objects',
    displayName: 'Objects',
    keys: ['objects', 'object list', 'known objects', 'items', 'item list'],
    order: 997,
    description: 'List of all known objects and items'
  },
  'faction': {
    indexName: '__index_factions',
    displayName: 'Factions',
    keys: ['factions', 'faction list', 'known factions', 'organizations'],
    order: 996,
    description: 'List of all known factions and organizations'
  },
  'concept': {
    indexName: '__index_concepts',
    displayName: 'Concepts',
    keys: ['concepts', 'concept list', 'known concepts'],
    order: 995,
    description: 'List of all known concepts and lore'
  }
};

function extractCategoryPrefix(entryName ) {
  if (!entryName) return null;

  // Check for each category prefix
  for (const prefix of Object.keys(CATEGORY_CONFIG)) {
    if (entryName.startsWith(prefix + '-')) {
      return prefix;
    }
  }

  return null;
}

function extractEntityName(entryName ) {
  const parts = entryName.split('-');
  if (parts.length > 1) {
    return parts.slice(1).join('-'); // Handle names with hyphens
  }
  return entryName;
}

async function categorizeEntries(lorebookName ) {
  try {
    const entries = await getLorebookEntries(lorebookName);
    if (!entries) {
      debug("No entries found in lorebook");
      return {};
    }

    const categorized  = {};

    // Initialize all categories
    for (const prefix of Object.keys(CATEGORY_CONFIG)) {
      categorized[prefix] = [];
    }

    // Categorize each entry
    for (const entry of entries) {
      // Skip index entries themselves
      if (entry.comment && entry.comment.startsWith('__index_')) {
        continue;
      }

      // Extract category from entry name
      const category = extractCategoryPrefix(entry.comment);
      if (category && categorized[category]) {
        const entityName = extractEntityName(entry.comment);
        categorized[category].push(entityName);
      }
    }

    // Sort each category alphabetically
    for (const prefix of Object.keys(categorized)) {
      categorized[prefix].sort((a, b) => a.localeCompare(b));
    }

    debug(`Categorized entries:`, categorized);
    return categorized;

  } catch (err) {
    error("Error categorizing entries", err);
    return {};
  }
}

async function updateCategoryIndexEntry(lorebookName , categoryPrefix , entityNames ) {
  try {
    const config = CATEGORY_CONFIG[categoryPrefix];
    if (!config) {
      error(`Unknown category prefix: ${categoryPrefix}`);
      return false;
    }

    // Generate content in PList format
    let content;
    if (entityNames.length === 0) {
      content = `[${config.displayName}: none discovered yet]`;
    } else {
      content = `[${config.displayName}: ${entityNames.join(', ')}]`;
    }

    // Check if index entry already exists
    const entries = await getLorebookEntries(lorebookName);
    const existingIndex = entries ? entries.find((e) => e.comment === config.indexName) : null;

    if (existingIndex) {
      // Update existing entry
      debug(`Updating category index: ${config.displayName}`);
      await modifyLorebookEntry(lorebookName, existingIndex.uid, {
        content: content,
        keys: config.keys,
        constant: true,
        order: config.order,
        depth: 0,
        position: 6,
        excludeRecursion: true,
        preventRecursion: true, // Alternative property name for safety
        disable: false
      });
    } else {
      // Create new index entry
      debug(`Creating category index: ${config.displayName}`);
      await addLorebookEntry(lorebookName, {
        comment: config.indexName,
        content: content,
        keys: config.keys,
        constant: true,
        order: config.order,
        depth: 0,
        position: 6,
        excludeRecursion: true,
        preventRecursion: true,
        disable: false
      });
    }

    return true;

  } catch (err) {
    error(`Error updating category index for ${categoryPrefix}`, err);
    return false;
  }
}

export async function updateAllCategoryIndexes(lorebookName ) {
  try {
    if (!lorebookName) {
      debug("No lorebook name provided for category index update");
      return false;
    }

    // Queue is required for category index updates
    debug(`[Queue] Queueing update of all category indexes`);

    // Import queue integration and check for function presence
    const qi = await import('./queueIntegration.js');
    const queueFn = qi?.queueUpdateAllCategoryIndexes;
    if (typeof queueFn === 'function') {
      const operationId = queueFn(lorebookName);
      if (operationId) {
        log(`[Queue] Queued update of all category indexes for ${lorebookName}:`, operationId);
        return true; // Operation will be processed by queue
      }
      error(`[Queue] Failed to enqueue updateAllCategoryIndexes for ${lorebookName}. Aborting.`);
      return false;
    } else {
      error(`[Queue] queueUpdateAllCategoryIndexes not available. Aborting.`);
      return false;
    }

  } catch (err) {
    error("Error updating category indexes", err);
    return false;
  }
}

export async function updateCategoryIndex(lorebookName , categoryPrefix ) {
  try {
    if (!CATEGORY_CONFIG[categoryPrefix]) {
      error(`Invalid category prefix: ${categoryPrefix}`);
      return false;
    }

    // Queue is required for category index updates
    debug(`[Queue] Queueing category index update for ${categoryPrefix}`);

    // Import queue integration and check for function presence
    const qi = await import('./queueIntegration.js');
    const queueFn = qi?.queueUpdateCategoryIndex;
    if (typeof queueFn === 'function') {
      const operationId = queueFn(lorebookName, categoryPrefix);
      if (operationId) {
        log(`[Queue] Queued category index update for ${categoryPrefix}:`, operationId);
        return true; // Operation will be processed by queue
      }
      error(`[Queue] Failed to enqueue updateCategoryIndex for ${categoryPrefix}. Aborting.`);
      return false;
    } else {
      error(`[Queue] queueUpdateCategoryIndex not available. Aborting.`);
      return false;
    }

  } catch (err) {
    error(`Error updating category index for ${categoryPrefix}`, err);
    return false;
  }
}

export function getCategoryForEntityType(entityType ) {
  switch (entityType) {
    case 'character':
    case 'npc':
      return 'character';
    case 'creature':
      return 'creature';
    case 'location':
    case 'location-sublocation':
      return 'location';
    case 'item':
    case 'object':
      return 'object';
    case 'faction':
      return 'faction';
    case 'concept':
      return 'concept';
    default:
      return 'object'; // Default fallback
  }
}

export async function removeCategoryIndexes(lorebookName ) {
  try {
    debug(`Removing all category indexes from: ${lorebookName}`);

    const entries = await getLorebookEntries(lorebookName);
    if (!entries) return true;

    let removedCount = 0;
    for (const entry of entries) {
      if (entry.comment && entry.comment.startsWith('__index_')) {
        // Sequential execution required: index entries must be deleted in order
        // eslint-disable-next-line no-await-in-loop
        await deleteLorebookEntry(lorebookName, entry.uid, true);
        removedCount++;
      }
    }

    log(`Removed ${removedCount} category indexes from: ${lorebookName}`);
    return true;

  } catch (err) {
    error("Error removing category indexes", err);
    return false;
  }
}

export async function getCategoryStats(lorebookName ) {
  try {
    const categorized = await categorizeEntries(lorebookName);

    const stats  = {
      total: 0,
      categories: {}
    };

    for (const [category, entities] of Object.entries(categorized)) {
      stats.categories[category] = {
        count: entities.length,
        entities: entities
      };
      stats.total += entities.length;
    }

    return stats;

  } catch (err) {
    error("Error getting category stats", err);
    return { total: 0, categories: {} };
  }
}

export default {
  initCategoryIndexes,
  updateAllCategoryIndexes,
  updateCategoryIndex,
  getCategoryForEntityType,
  removeCategoryIndexes,
  getCategoryStats
};
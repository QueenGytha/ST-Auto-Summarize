
// lorebookManager.js - Lorebook creation and management for ST-Auto-Lorebooks

import {
  createNewWorldInfo,
  deleteWorldInfo,
  loadWorldInfo,
  saveWorldInfo,
  createWorldInfoEntry,
  deleteWorldInfoEntry,
  METADATA_KEY,
  world_names
} from '../../../world-info.js';
import { chat_metadata, saveMetadata, getCurrentChatId, characters, this_chid, name2 } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { selected_group, groups } from '../../../group-chats.js';
import { getConfiguredEntityTypeDefinitions } from './entityTypes.js';
import { UI_UPDATE_DELAY_MS, FULL_COMPLETION_PERCENTAGE, INITIAL_LOREBOOK_ORDER } from './constants.js';

// Will be imported from index.js via barrel exports
let log , debug , error , toast , generateLorebookName , getUniqueLorebookName ; // Utility functions - any type is legitimate
const REGISTRY_PREFIX  = '_registry_';
const REGISTRY_TAG  = 'auto_lorebooks_registry';

export function initLorebookManager(utils ) {
  // utils is any type - object with various utility functions - legitimate use of any
  log = utils.log;
  debug = utils.debug;
  error = utils.error;
  toast = utils.toast;
  generateLorebookName = utils.generateLorebookName;
  getUniqueLorebookName = utils.getUniqueLorebookName;
}

async function ensureRegistryEntriesForLorebook(lorebookName ) {
  try {
    const typeDefinitions = getConfiguredEntityTypeDefinitions(extension_settings?.autoLorebooks?.entity_types);
    if (!Array.isArray(typeDefinitions) || typeDefinitions.length === 0) {
      return;
    }

    const data = await loadWorldInfo(lorebookName);
    if (!data) {
      error?.(`Failed to load lorebook data while initializing registries: ${lorebookName}`);
      return;
    }

    if (!data.entries) {
      data.entries = {};
    }

    const existingComments = new Set(
      Object.values(data.entries).
      map((entry) => entry && typeof entry.comment === 'string' ? entry.comment : null).
      filter(Boolean)
    );

    let added = false;
    typeDefinitions.forEach((def) => {
      const typeName = def?.name;
      if (!typeName) return;
      const registryComment = `${REGISTRY_PREFIX}${typeName}`;
      if (existingComments.has(registryComment)) return;

      const entry = createWorldInfoEntry(lorebookName, data);
      if (!entry) return;

      entry.comment = registryComment;
      entry.content = `[Registry: ${typeName}]`;
      entry.key = Array.isArray(entry.key) ? entry.key : [];
      entry.keysecondary = Array.isArray(entry.keysecondary) ? entry.keysecondary : [];
      // Set constant and disable based on type definition flags
      const hasConstantFlag = def?.entryFlags && Array.isArray(def.entryFlags) && def.entryFlags.includes('constant');
      entry.constant = hasConstantFlag ? true : false;
      entry.disable = hasConstantFlag ? false : true;
      entry.preventRecursion = true;
      entry.tags = Array.isArray(entry.tags) ? entry.tags : [];
      if (!entry.tags.includes(REGISTRY_TAG)) {
        entry.tags.push(REGISTRY_TAG);
      }
      added = true;
    });

    if (added) {
      await saveWorldInfo(lorebookName, data, true);
      debug?.(`Initialized registry entries for lorebook: ${lorebookName}`);
      // Reorder alphabetically after creating registry entries
      await reorderLorebookEntriesAlphabetically(lorebookName);
    }
  } catch (err) {
    error?.('Error creating registry entries for lorebook', err);
  }
}

async function ensureRegistryEntryRecord(lorebookName , type ) {
  await ensureRegistryEntriesForLorebook(lorebookName);
  const data = await loadWorldInfo(lorebookName);
  if (!data) {
    error?.(`Failed to load lorebook data while ensuring registry entry: ${lorebookName}`);
    return null;
  }
  if (!data.entries) data.entries = {};
  const registryComment = `${REGISTRY_PREFIX}${type}`;
  let entry = Object.values(data.entries).find((e) => e && e.comment === registryComment);
  if (!entry) {
    entry = createWorldInfoEntry(lorebookName, data);
    if (!entry) return null;
    entry.comment = registryComment;
  }
  const ensuredEntry  = entry;
  ensuredEntry.key = Array.isArray(ensuredEntry.key) ? ensuredEntry.key : [];
  ensuredEntry.keysecondary = Array.isArray(ensuredEntry.keysecondary) ? ensuredEntry.keysecondary : [];
  // Get type definition to check for constant flag
  const typeDefinitions = getConfiguredEntityTypeDefinitions(extension_settings?.auto_summarize?.entity_types);
  const typeDef = typeDefinitions.find((def) => def?.name === type);
  const hasConstantFlag = typeDef?.entryFlags && Array.isArray(typeDef.entryFlags) && typeDef.entryFlags.includes('constant');
  ensuredEntry.constant = hasConstantFlag ? true : false;
  ensuredEntry.disable = hasConstantFlag ? false : true;
  ensuredEntry.preventRecursion = true;
  ensuredEntry.useProbability = false;
  ensuredEntry.probability = FULL_COMPLETION_PERCENTAGE;
  ensuredEntry.tags = Array.isArray(ensuredEntry.tags) ? ensuredEntry.tags : [];
  if (!ensuredEntry.tags.includes(REGISTRY_TAG)) {
    ensuredEntry.tags.push(REGISTRY_TAG);
  }
  return { data, entry: ensuredEntry };
}

export async function updateRegistryEntryContent(
lorebookName ,
type ,
items )
{
  try {
    const ensured = await ensureRegistryEntryRecord(lorebookName, type);
    if (!ensured) return;
    const { data, entry } = ensured;
    const lines = items.map((item) => {
      const name = item.name || item.comment || 'Unknown';
      const aliases = Array.isArray(item.aliases) && item.aliases.length > 0 ? item.aliases.join('; ') : '—';
      const synopsis = item.synopsis || '—';
      return `- id: ${item.id} | name: ${name} | aliases: ${aliases} | synopsis: ${synopsis}`;
    });
    const header = `[Registry: ${type}]`;
    const ensuredEntry  = entry;
    ensuredEntry.content = [header, ...lines].join('\n').trim();
    await saveWorldInfo(lorebookName, data, true);
    debug?.(`Updated registry entry for type "${type}"`);
  } catch (err) {
    error?.('Error updating registry entry content', err);
  }
}

export function getCurrentContext() {
  try {
    let characterName = null;
    let chatId = null;
    let isGroupChat = false;
    let groupName = null;

    // Check if we're in a group chat
    if (selected_group) {
      isGroupChat = true;
      const group = groups?.find((x) => x.id === selected_group);
      if (group) {
        groupName = group.name;
        chatId = group.chat_id;
        characterName = groupName; // Use group name as character name
      }
    } else {
      // Single character chat
      if (name2 && name2.trim()) {
        characterName = String(name2).trim();
      } else if (this_chid !== undefined && characters && characters[this_chid]) {
        characterName = characters[this_chid].name;
      }

      // Normalize unicode
      if (characterName && characterName.normalize) {
        characterName = characterName.normalize('NFC');
      }

      // Get chat ID
      chatId = getCurrentChatId();
    }

    return {
      characterName,
      chatId,
      isGroupChat,
      groupName
    };

  } catch (err) {
    error("Error getting current context", err);
    return {
      characterName: null,
      chatId: null,
      isGroupChat: false,
      groupName: null
    };
  }
}

export function isAutoLorebooksEnabled() {
  return true;
}

export function getAttachedLorebook() {
  try {
    return chat_metadata?.[METADATA_KEY] || null;
  } catch (err) {
    error("Error getting attached lorebook", err);
    return null;
  }
}

export function lorebookExists(lorebookName ) {
  try {
    if (!lorebookName) return false;
    return world_names && world_names.includes(lorebookName);
  } catch (err) {
    error("Error checking if lorebook exists", err);
    return false;
  }
}

export async function handleMissingLorebook(missingLorebookName ) {
  try {
    log(`Detected missing lorebook: "${missingLorebookName}"`);

    // Clear the stale reference from chat metadata
    if (chat_metadata[METADATA_KEY] === missingLorebookName) {
      delete chat_metadata[METADATA_KEY];
      debug("Cleared stale lorebook reference from chat metadata");
    }

    if (chat_metadata.auto_lorebooks?.lorebookName === missingLorebookName) {
      delete chat_metadata.auto_lorebooks.lorebookName;
      delete chat_metadata.auto_lorebooks.attachedAt;
      debug("Cleared stale lorebook reference from extension metadata");
    }

    saveMetadata();

    // Check if auto-lorebooks is enabled for this chat
    // Create a new lorebook to replace the deleted one
    log("Auto-lorebooks enabled: creating replacement lorebook");
    const newLorebookName = await createChatLorebook();

    if (!newLorebookName) {
      toast("Attached lorebook was deleted. Failed to create replacement.", "error");
      return null;
    }

    // Attach the new lorebook
    const attached = attachLorebook(newLorebookName);
    if (!attached) {
      error("Created replacement lorebook but failed to attach");
      toast("Created replacement lorebook but failed to attach", "error");
      return null;
    }

    toast(`Recreated deleted lorebook as: ${newLorebookName}`, "info");
    log(`Successfully recreated lorebook: ${newLorebookName}`);
    return newLorebookName;

  } catch (err) {
    error("Error handling missing lorebook", err);
    return null;
  }
}

export function attachLorebook(lorebookName ) {
  try {
    if (!lorebookName) {
      error("Cannot attach lorebook: name is empty");
      return false;
    }

    // Verify lorebook exists
    if (!world_names || !world_names.includes(lorebookName)) {
      error(`Cannot attach lorebook: "${lorebookName}" does not exist`);
      return false;
    }

    // Attach via SillyTavern's standard metadata key
    chat_metadata[METADATA_KEY] = lorebookName;

    // Store in our extension metadata
    if (!chat_metadata.auto_lorebooks) {
      chat_metadata.auto_lorebooks = {} ;
    }
    chat_metadata.auto_lorebooks.lorebookName = lorebookName;
    chat_metadata.auto_lorebooks.attachedAt = Date.now();

    saveMetadata();

    debug(`Attached lorebook: ${lorebookName}`);
    return true;

  } catch (err) {
    error("Error attaching lorebook", err);
    return false;
  }
}

export async function createChatLorebook() {
  try {
    // Get current context
    const context = getCurrentContext();
    if (!context.characterName || !context.chatId) {
      error("Cannot create lorebook: missing character name or chat ID");
      toast("Cannot create lorebook: invalid chat context", "error");
      return null;
    }

    // Get naming template
    const template = extension_settings?.autoLorebooks?.nameTemplate || 'z-AutoLB-{{chat}}';

    // Generate name
    const baseName = generateLorebookName(template, context.characterName, context.chatId);
    const uniqueName = getUniqueLorebookName(baseName, world_names);

    debug(`Creating lorebook: ${uniqueName}`);

    // Create the lorebook
    const created = await createNewWorldInfo(uniqueName);

    if (!created) {
      error(`Failed to create lorebook: ${uniqueName}`);
      toast("Failed to create lorebook", "error");
      return null;
    }

    log(`Created lorebook: ${uniqueName}`);

    // Clear cached registry BEFORE creating stub entries to prevent stale data
    // This ensures the registry starts fresh, matching the new empty lorebook state
    if (chat_metadata?.auto_lorebooks?.registry) {
      chat_metadata.auto_lorebooks.registry = { index: {}, counters: {} };
      debug(`Cleared cached registry for new lorebook: ${uniqueName}`);
    }

    // Create stub registry entries in the lorebook (disabled entries for each type)
    await ensureRegistryEntriesForLorebook(uniqueName);
    return uniqueName;

  } catch (err) {
    error("Error creating chat lorebook", err);
    toast("Error creating lorebook", "error");
    return null;
  }
}

export async function ensureChatLorebook() {
  try {
    // Check if enabled
    // Check if already has lorebook
    const existingLorebook = getAttachedLorebook();
    if (existingLorebook) {
      debug(`Chat already has lorebook: ${existingLorebook}`);
      return true;
    }

    // Create new lorebook
    const lorebookName = await createChatLorebook();
    if (!lorebookName) {
      return false;
    }

    // Attach it
    const attached = attachLorebook(lorebookName);
    if (!attached) {
      error("Created lorebook but failed to attach");
      return false;
    }

    toast(`Created chat lorebook: ${lorebookName}`, "success");
    log(`Ensured chat lorebook: ${lorebookName}`);
    return true;

  } catch (err) {
    error("Error ensuring chat lorebook", err);
    return false;
  }
}

export async function deleteChatLorebook(lorebookName ) {
  try {
    if (!lorebookName) {
      debug("No lorebook to delete");
      return false;
    }

    // Check if lorebook exists
    if (!world_names || !world_names.includes(lorebookName)) {
      debug(`Lorebook "${lorebookName}" does not exist, skipping deletion`);
      return false;
    }

    log(`Deleting lorebook: ${lorebookName}`);

    // Call SillyTavern's deleteWorldInfo API
    const result = await deleteWorldInfo(lorebookName);

    if (result) {
      log(`Successfully deleted lorebook: ${lorebookName}`);
      return true;
    } else {
      error(`Failed to delete lorebook: ${lorebookName}`);
      return false;
    }

  } catch (err) {
    error("Error deleting chat lorebook", err);
    return false;
  }
}

export function getLorebookMetadata() {
  try {
    return chat_metadata?.auto_lorebooks || null;
  } catch (err) {
    error("Error getting lorebook metadata", err);
    return null;
  }
}

export async function initializeChatLorebook() {
  try {
    debug("Initializing chat lorebook");

    // Wait a bit for SillyTavern to finish loading
    await new Promise((resolve) => setTimeout(resolve, UI_UPDATE_DELAY_MS));

    // If an attached lorebook is referenced but missing, attempt recovery
    const attached = getAttachedLorebook();
    if (attached && !lorebookExists(attached)) {
      await handleMissingLorebook(attached);
    }

    // Ensure lorebook exists if enabled (creates and attaches when absent)
    await ensureChatLorebook();

  } catch (err) {
    error("Error initializing chat lorebook", err);
  }
}

export async function addLorebookEntry(lorebookName , entryData  = {}) {
  try {
    if (!lorebookName) {
      error("Cannot add entry: lorebook name is empty");
      return null;
    }

    // Verify lorebook exists
    if (!world_names || !world_names.includes(lorebookName)) {
      error(`Cannot add entry: lorebook "${lorebookName}" does not exist`);
      return null;
    }

    debug(`Adding entry to lorebook: ${lorebookName}`, entryData);

    // Load lorebook data
    const data = await loadWorldInfo(lorebookName);
    if (!data) {
      error(`Failed to load lorebook data for: ${lorebookName}`);
      return null;
    }

    // Create new entry
    const newEntry = createWorldInfoEntry(lorebookName, data);
    if (!newEntry) {
      error(`Failed to create entry in lorebook: ${lorebookName}`);
      return null;
    }

    // Apply provided data to the new entry
    if (entryData.keys && Array.isArray(entryData.keys)) {
      newEntry.key = entryData.keys;
    }
    if (entryData.secondaryKeys && Array.isArray(entryData.secondaryKeys)) {
      newEntry.keysecondary = entryData.secondaryKeys;
    }
    if (entryData.content) {
      newEntry.content = String(entryData.content);
    }
    if (entryData.comment) {
      newEntry.comment = String(entryData.comment);
    }
    if (typeof entryData.constant === 'boolean') {
      newEntry.constant = entryData.constant;
    }
    if (typeof entryData.order === 'number') {
      newEntry.order = entryData.order;
    }
    if (typeof entryData.position === 'number') {
      newEntry.position = entryData.position;
    }
    if (typeof entryData.depth === 'number') {
      newEntry.depth = entryData.depth;
    }

    // Save the lorebook
    await saveWorldInfo(lorebookName, data, true);

    log(`Added entry to lorebook "${lorebookName}": UID ${newEntry.uid}`);

    // Reorder entries alphabetically after creation
    await reorderLorebookEntriesAlphabetically(lorebookName);

    return newEntry;

  } catch (err) {
    error("Error adding lorebook entry", err);
    return null;
  }
}

function validateModifyParams(lorebookName , uid ) {
  if (!lorebookName) {
    error("Cannot modify entry: lorebook name is empty");
    return false;
  }

  if (uid === undefined || uid == null) {
    error("Cannot modify entry: UID is required");
    return false;
  }

  if (!world_names || !world_names.includes(lorebookName)) {
    error(`Cannot modify entry: lorebook "${lorebookName}" does not exist`);
    return false;
  }

  return true;
}

async function loadLorebookAndEntry(lorebookName , uid ) {
  const data = await loadWorldInfo(lorebookName);
  if (!data) {
    error(`Failed to load lorebook data for: ${lorebookName}`);
    return null;
  }

  if (!data.entries || !data.entries[uid]) {
    error(`Entry with UID ${uid} does not exist in lorebook: ${lorebookName}`);
    return null;
  }

  return { data, entry: data.entries[uid] };
}

function applyEntryUpdates(entry , updates ) {
  if (updates.keys && Array.isArray(updates.keys)) {
    entry.key = updates.keys;
  }
  if (updates.secondaryKeys && Array.isArray(updates.secondaryKeys)) {
    entry.keysecondary = updates.secondaryKeys;
  }
  if (updates.content !== undefined) {
    entry.content = String(updates.content);
  }
  if (updates.comment !== undefined) {
    entry.comment = String(updates.comment);
  }
  if (typeof updates.constant === 'boolean') {
    entry.constant = updates.constant;
  }
  if (typeof updates.disable === 'boolean') {
    entry.disable = updates.disable;
  }
  if (typeof updates.order === 'number') {
    entry.order = updates.order;
  }
  if (typeof updates.position === 'number') {
    entry.position = updates.position;
  }
  if (typeof updates.depth === 'number') {
    entry.depth = updates.depth;
  }
}

export async function modifyLorebookEntry(lorebookName , uid , updates  = {}) {
  try {
    if (!validateModifyParams(lorebookName, uid)) {
      return false;
    }

    debug(`Modifying entry UID ${uid} in lorebook: ${lorebookName}`, updates);

    const lorebookData = await loadLorebookAndEntry(lorebookName, uid);
    if (!lorebookData) {
      return false;
    }

    const { data, entry } = lorebookData;

    applyEntryUpdates(entry, updates);

    await saveWorldInfo(lorebookName, data, true);

    log(`Modified entry UID ${uid} in lorebook "${lorebookName}"`);

    // Reorder entries alphabetically if comment field was changed
    if (updates.comment !== undefined) {
      await reorderLorebookEntriesAlphabetically(lorebookName);
    }

    return true;

  } catch (err) {
    error("Error modifying lorebook entry", err);
    return false;
  }
}

export async function deleteLorebookEntry(lorebookName , uid , silent  = true) {
  try {
    if (!lorebookName) {
      error("Cannot delete entry: lorebook name is empty");
      return false;
    }

    if (uid === undefined || uid == null) {
      error("Cannot delete entry: UID is required");
      return false;
    }

    // Verify lorebook exists
    if (!world_names || !world_names.includes(lorebookName)) {
      error(`Cannot delete entry: lorebook "${lorebookName}" does not exist`);
      return false;
    }

    debug(`Deleting entry UID ${uid} from lorebook: ${lorebookName}`);

    // Load lorebook data
    const data = await loadWorldInfo(lorebookName);
    if (!data) {
      error(`Failed to load lorebook data for: ${lorebookName}`);
      return false;
    }

    // Check if entry exists
    if (!data.entries || !data.entries[uid]) {
      error(`Entry with UID ${uid} does not exist in lorebook: ${lorebookName}`);
      return false;
    }

    // Delete the entry
    const deleted = await deleteWorldInfoEntry(data, uid, { silent });
    if (!deleted) {
      debug(`Entry deletion cancelled or failed for UID ${uid}`);
      return false;
    }

    // Save the lorebook
    await saveWorldInfo(lorebookName, data, true);

    log(`Deleted entry UID ${uid} from lorebook "${lorebookName}"`);
    return true;

  } catch (err) {
    error("Error deleting lorebook entry", err);
    return false;
  }
}

export async function getLorebookEntries(lorebookName ) {
  try {
    if (!lorebookName) {
      error("Cannot get entries: lorebook name is empty");
      return null;
    }

    // Verify lorebook exists
    if (!world_names || !world_names.includes(lorebookName)) {
      error(`Cannot get entries: lorebook "${lorebookName}" does not exist`);
      return null;
    }

    // Load lorebook data
    const data = await loadWorldInfo(lorebookName);
    if (!data) {
      error(`Failed to load lorebook data for: ${lorebookName}`);
      return null;
    }

    if (!data.entries) {
      return [];
    }

    // Convert entries object to array
    const entriesArray = Object.values(data.entries);
    debug(`Retrieved ${entriesArray.length} entries from lorebook: ${lorebookName}`);

    return entriesArray;

  } catch (err) {
    error("Error getting lorebook entries", err);
    return null;
  }
}

export async function reorderLorebookEntriesAlphabetically(lorebookName ) {
  try {
    // Check if auto-reorder is enabled
    if (!extension_settings?.autoLorebooks?.autoReorderAlphabetically) {
      debug("Auto-reorder is disabled, skipping alphabetical reordering");
      return false;
    }

    if (!lorebookName) {
      error("Cannot reorder entries: lorebook name is empty");
      return false;
    }

    // Verify lorebook exists
    if (!world_names || !world_names.includes(lorebookName)) {
      error(`Cannot reorder entries: lorebook "${lorebookName}" does not exist`);
      return false;
    }

    debug(`Reordering entries alphabetically in lorebook: ${lorebookName}`);

    // Load lorebook data
    const data = await loadWorldInfo(lorebookName);
    if (!data) {
      error(`Failed to load lorebook data for: ${lorebookName}`);
      return false;
    }

    if (!data.entries || Object.keys(data.entries).length === 0) {
      debug("No entries to reorder");
      return true;
    }

    // Convert entries object to array
    const entriesArray = Object.values(data.entries);

    // Sort alphabetically by comment field (case-insensitive)
    entriesArray.sort((a, b) => {
      const nameA = (a.comment || '').toLowerCase();
      const nameB = (b.comment || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    // Assign descending order values starting from 1000
    let orderValue = INITIAL_LOREBOOK_ORDER;
    for (const entry of entriesArray) {
      entry.order = orderValue;
      orderValue--;
    }

    // Save the lorebook
    await saveWorldInfo(lorebookName, data, true);

    log(`Reordered ${entriesArray.length} entries alphabetically in lorebook "${lorebookName}"`);
    return true;

  } catch (err) {
    error("Error reordering lorebook entries alphabetically", err);
    return false;
  }
}

export default {
  initLorebookManager,
  getCurrentContext,
  isAutoLorebooksEnabled,
  getAttachedLorebook,
  lorebookExists,
  handleMissingLorebook,
  attachLorebook,
  createChatLorebook,
  ensureChatLorebook,
  deleteChatLorebook,
  getLorebookMetadata,
  initializeChatLorebook,
  addLorebookEntry,
  modifyLorebookEntry,
  deleteLorebookEntry,
  getLorebookEntries,
  updateRegistryEntryContent,
  reorderLorebookEntriesAlphabetically
};
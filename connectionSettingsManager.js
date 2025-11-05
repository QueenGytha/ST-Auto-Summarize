
// connectionSettingsManager.js - Centralized connection settings switching

import {
  get_current_connection_profile,
  set_connection_profile } from
'./index.js';

import {
  get_current_preset,
  set_preset } from
'./index.js';

import { debug, error, chat_metadata, saveMetadata } from './index.js';

/**
 * Get current connection settings (profile and preset)
 */
async function getCurrentConnectionSettings() {
  const connectionProfile = await get_current_connection_profile();
  const completionPreset = get_current_preset();

  // Flow requires explicit property setting for readonly types
  const settings = {};
  if (connectionProfile != null) settings .connectionProfile = connectionProfile;
  if (completionPreset != null) settings .completionPreset = completionPreset;

  return settings ;
}

/**
 * Switch connection profile and preset in the correct order
 *
 * CRITICAL: Connection profile MUST be set first because switching profiles
 * auto-loads the profile's default preset. Then we set the desired preset
 * to override that default.
 *
 * @param {?string} profileName - Connection profile to switch to (or null/undefined to skip)
 * @param {?string} presetName - Completion preset to switch to (or null/undefined to skip)
 */
async function switchConnectionSettings(
profileName ,
presetName )
{
  // Step 1: Set connection profile FIRST (this will load its default preset)
  if (profileName) {
    await set_connection_profile(profileName);
    debug(`Switched to connection profile: ${profileName}`);
  }

  // Step 2: THEN set completion preset (overrides the default from profile switch)
  if (presetName) {
    await set_preset(presetName);
    debug(`Switched to completion preset: ${presetName}`);
  }
}

/**
 * Save connection settings state to persistent storage (for crash recovery)
 */
function saveConnectionSettingsState(state ) {
  try {
    if (!chat_metadata.autoSummarize) {
      chat_metadata.autoSummarize = {} ;
    }

    chat_metadata.autoSummarize.savedConnectionSettings = state;
    saveMetadata();

    debug('Saved connection settings state', state);
  } catch (err) {
    error('Failed to save connection settings state', err);
  }
}

/**
 * Get saved connection settings state from persistent storage
 */
function getSavedConnectionSettingsState() {
  try {
    const saved = chat_metadata?.autoSummarize?.savedConnectionSettings;
    if (saved && typeof saved === 'object') {
      return saved;
    }
  } catch (err) {
    error('Failed to get saved connection settings state', err);
  }
  return null;
}

/**
 * Clear saved connection settings state
 */
function clearSavedConnectionSettingsState() {
  try {
    if (chat_metadata?.autoSummarize?.savedConnectionSettings) {
      delete chat_metadata.autoSummarize.savedConnectionSettings;
      saveMetadata();
      debug('Cleared saved connection settings state');
    }
  } catch (err) {
    error('Failed to clear saved connection settings state', err);
  }
}

/**
 * Restore connection settings from persistent storage (crash recovery)
 */
async function restoreConnectionSettingsIfNeeded() {
  const saved = getSavedConnectionSettingsState();

  if (!saved) {
    return false; // Nothing to restore
  }

  debug('Restoring connection settings after interruption', saved);

  await switchConnectionSettings(saved.connectionProfile, saved.completionPreset);
  clearSavedConnectionSettingsState();

  return true;
}

/**
 * Wrapper for executing a function with specific connection settings
 * Automatically saves current settings, switches, executes, and restores
 *
 * @param {?string} profileName - Connection profile to use for operation
 * @param {?string} presetName - Completion preset to use for operation
 * @param {Function} operation - Async function to execute
 * @returns {Promise<any>} Result of the operation
 */
async function withConnectionSettings(
profileName ,
presetName ,
operation )
{
  // Save current settings
  const currentSettings = await getCurrentConnectionSettings();

  // Save to persistent storage (for crash recovery)
  saveConnectionSettingsState(currentSettings);

  try {
    // Switch to operation settings
    await switchConnectionSettings(profileName, presetName);

    // Execute operation and return result
    return await operation();

  } finally {
    // Always restore original settings
    await switchConnectionSettings(currentSettings.connectionProfile, currentSettings.completionPreset);

    // Clear saved state (successful completion)
    clearSavedConnectionSettingsState();
  }
}

export {
  getCurrentConnectionSettings,
  switchConnectionSettings,
  saveConnectionSettingsState,
  getSavedConnectionSettingsState,
  clearSavedConnectionSettingsState,
  restoreConnectionSettingsIfNeeded,
  withConnectionSettings };
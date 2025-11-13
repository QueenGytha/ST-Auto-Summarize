# Prompt Versioning System - Corrected Design (Immutable Defaults)

**Document Version:** 2.0
**Date:** 2025-11-12
**Status:** Authoritative Design Specification
**Replaces:** PROMPT_VERSIONING_DESIGN.md
**Purpose:** Corrected design with immutable defaults principle

---

## Executive Summary

This document specifies the corrected prompt versioning system based on the **immutable defaults** principle:

**Core Rule:** Default prompts are read-only code. Editing creates a user version.

### Key Improvements Over Original Design

1. ✅ **Defaults never stored** - Only in code, never in profiles/settings (~75-90% storage savings)
2. ✅ **User versions only when edited** - Profiles store only customizations
3. ✅ **Auto-updates for defaults** - Users get improvements automatically
4. ✅ **Clear UI distinction** - "Default" (read-only) vs "My Version" (editable)
5. ✅ **Simplified resolution** - No version history bloat, no customization flags
6. ✅ **Settings separated** - Only prompt text versioned, not prefill/connection_profile/etc
7. ✅ **Clean migration** - Deletes non-customized prompts instead of storing them

### Critical Fixes from Verification Report

- ✅ Migration deletes non-customized prompts (don't store defaults)
- ✅ Export omits defaults (smaller files, cleaner)
- ✅ Import merges with code defaults (backward compatible)
- ✅ Settings (prefill, connection_profile, etc.) kept separate from prompts
- ✅ All prompt access sites refactored to use `getPromptText()`

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Data Structures](#2-data-structures)
3. [Storage Strategy](#3-storage-strategy)
4. [Resolution Algorithm](#4-resolution-algorithm)
5. [Migration Strategy](#5-migration-strategy)
6. [UI Design](#6-ui-design)
7. [Update Detection](#7-update-detection)
8. [Implementation Guide](#8-implementation-guide)
9. [Testing Strategy](#9-testing-strategy)
10. [Backward Compatibility](#10-backward-compatibility)

---

## 1. Core Principles

### 1.1 Immutable Defaults

**Default prompts are CODE, not DATA**

```javascript
// Defaults live in defaultPrompts.js (version-controlled)
export const scene_recap_prompt = `You are a structured...`;

// Never stored in profiles unless user edits
// Always available as fallback
// Updates propagate automatically (no storage to update)
```

**Analogy:** Like `character_profiles` and `chat_profiles` - they only store the **mapping** (character → profile name), not the profile data itself.

### 1.2 User Versions (Forks)

**User versions are created when editing:**

```
User clicks "Edit" on default prompt
  → Creates user version (fork from default)
  → Stores in profile/sticky
  → User edits the fork

User clicks "Delete My Version"
  → Deletes user version
  → Falls back to default (always available)
```

### 1.3 Resolution Priority

```
HIGHEST PRIORITY
    ↓
Chat sticky (user version) - if exists
    ↓
Character sticky (user version) - if exists
    ↓
Profile (user version) - if exists
    ↓
Default (from code) - always available
    ↓
LOWEST PRIORITY (but always present)
```

### 1.4 Storage Efficiency

**Comparison:**

| Approach | Storage |
|----------|---------|
| **v1 (current)** | Every profile stores all 8 prompts (~50KB per profile) |
| **v2 (immutable defaults)** | Profile stores only customized prompts |
| - 0 customized | ~0KB (100% savings) |
| - 2 customized | ~12KB (75% savings) |
| - 8 customized | ~50KB (same as v1) |

**Typical user:** 1-2 customized prompts per profile
**Expected savings:** 75-90% on average

---

## 2. Data Structures

### 2.1 Default Prompt (CODE - Never Stored)

**File:** `promptVersionRegistry.js`

```javascript
export const PROMPT_VERSIONS = {
  scene_recap_prompt: {
    version: '2.1.0',
    changelog: 'Added explicit content handling improvements',
    updatedAt: '2025-01-15'
  },
  auto_scene_break_prompt: {
    version: '1.2.0',
    changelog: 'Improved scene boundary detection',
    updatedAt: '2025-01-10'
  },
  running_scene_recap_prompt: {
    version: '1.1.0',
    changelog: 'Enhanced narrative coherence',
    updatedAt: '2025-01-10'
  },
  // ... all prompts (8 total, no templates)
};

/**
 * Get default prompt (always from code, never stored)
 * @param {string} promptId - e.g., 'scene_recap_prompt'
 * @returns {VersionedPrompt}
 */
export function getDefaultPrompt(promptId) {
  const content = defaultPrompts[promptId];
  const meta = PROMPT_VERSIONS[promptId];

  if (!content) {
    throw new Error(`No default prompt for ${promptId}`);
  }

  return {
    id: promptId,
    version: meta?.version || '1.0.0',
    content: content,

    // Flags
    isDefault: true,
    userModified: false,

    // Metadata (null for defaults)
    createdAt: null,
    modifiedAt: null,
    customLabel: null,
    basedOnVersion: null
  };
}
```

### 2.2 User Version Object (STORED When Customized)

**Structure:**

```javascript
{
  // Identity
  id: "scene_recap_prompt",

  // Version tracking
  version: "2.1.0-custom-1705320000000",  // Custom version string
  basedOnVersion: "2.1.0",                 // Which default was forked from

  // Content
  content: "My custom prompt text...",

  // Flags
  isDefault: false,
  userModified: true,

  // Metadata
  createdAt: 1705320000000,
  modifiedAt: 1705320000000,
  customLabel: "My custom scene recap",  // Optional user label

  // Update tracking
  updateAvailable: false,
  updateDismissed: false,
  dismissedVersion: null
}
```

**Field Descriptions:**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Prompt identifier (matches setting key) |
| `version` | string | Custom version string (timestamp-based) |
| `basedOnVersion` | string | Default version this was forked from |
| `content` | string | The actual prompt text |
| `isDefault` | boolean | Always `false` for user versions |
| `userModified` | boolean | Always `true` for user versions |
| `createdAt` | number | When user created this version (epoch ms) |
| `modifiedAt` | number | Last edit timestamp |
| `customLabel` | string\|null | User-friendly label |
| `updateAvailable` | boolean | Is default newer than `basedOnVersion`? |
| `updateDismissed` | boolean | Did user dismiss update notification? |
| `dismissedVersion` | string\|null | Which default version was dismissed |

### 2.3 Versionable Prompts List

**File:** `promptMigration.js`

```javascript
/**
 * List of prompts that support versioning
 * EXCLUDES templates (e.g., running_scene_recap_template)
 */
export const VERSIONABLE_PROMPTS = [
  // Scene recap
  'scene_recap_prompt',
  'scene_recap_error_detection_prompt',

  // Scene break
  'auto_scene_break_prompt',

  // Running scene recap
  'running_scene_recap_prompt',

  // Auto-Lorebooks
  'auto_lorebooks_recap_merge_prompt',
  'auto_lorebooks_recap_lorebook_entry_lookup_prompt',
  'auto_lorebooks_recap_lorebook_entry_deduplicate_prompt',
  'auto_lorebooks_bulk_populate_prompt'
];

// Total: 8 prompts
```

---

## 3. Storage Strategy

### 3.1 Storage Locations

```javascript
// extension_settings.auto_recap
{
  // ===== PROFILES =====
  // Only store user versions (not defaults)
  profiles: {
    "Default": {
      // If user never edited scene_recap_prompt, this key DOESN'T EXIST
      // If user edited it:
      scene_recap_prompt: { /* user version object */ },

      // Settings (NOT prompts) always stored
      scene_recap_prefill: "{",
      scene_recap_connection_profile: "",
      scene_recap_completion_preset_name: "",
      scene_recap_include_preset_prompts: false,

      // ... other settings
    }
  },

  // ===== CHARACTER STICKIES =====
  // Only user versions
  character_sticky_prompts: {
    "alice.png": {
      scene_recap_prompt: { /* user version */ }
      // No entry = use profile or default
    },
    "bob.png": {
      auto_scene_break_prompt: { /* user version */ }
    }
  },

  // ===== CHAT STICKIES =====
  // Only user versions
  chat_sticky_prompts: {
    "chat-2024-01-15-12345": {
      scene_recap_prompt: { /* user version */ }
    }
  }
}
```

### 3.2 Settings vs Prompts

**CRITICAL:** Each prompt has associated **settings** that are stored **separately**:

```javascript
// Profile structure
{
  // ===== PROMPT (versioned, optional) =====
  scene_recap_prompt: { /* user version */ },  // Only if customized

  // ===== SETTINGS (always stored, never versioned) =====
  scene_recap_prefill: "{",                           // Prefill text
  scene_recap_connection_profile: "uuid-1234",        // API connection
  scene_recap_completion_preset_name: "Creative",     // Temperature/top_p/etc
  scene_recap_include_preset_prompts: true            // Boolean flag
}
```

**Why separate:**
- Prompt = AI instructions (content to version)
- Settings = Configuration (runtime behavior, don't version)
- User may want different settings per profile without forking prompt

**Sticky behavior:**
- Sticky the **prompt only**
- Settings resolved from profile (not stickied)

**Example:**
```javascript
// Alice uses custom scene recap prompt
character_sticky_prompts: {
  "alice.png": {
    scene_recap_prompt: { /* user version */ }
    // Settings NOT here, resolved from profile
  }
}

// Settings come from active profile
profile: {
  scene_recap_prefill: "{",              // From profile
  scene_recap_connection_profile: "..."  // From profile
}
```

### 3.3 What Gets Stored Where

| Data | Storage Location | When Stored |
|------|------------------|-------------|
| Default prompt text | `defaultPrompts.js` (code) | Always (never in settings) |
| Default prompt metadata | `promptVersionRegistry.js` (code) | Always (never in settings) |
| User version | `profiles[name][promptId]` | When user edits |
| Character sticky | `character_sticky_prompts[char][promptId]` | When user stickies |
| Chat sticky | `chat_sticky_prompts[chatId][promptId]` | When user stickies |
| Prompt settings | `profiles[name][promptId_*]` | Always (prefill, connection, etc.) |

---

## 4. Resolution Algorithm

### 4.1 Resolution Function

**File:** `promptResolution.js`

```javascript
import { get_settings } from './settingsManager.js';
import { get_current_character_identifier, get_current_chat_identifier } from './utils.js';
import { getDefaultPrompt } from './promptVersionRegistry.js';

/**
 * Resolve which prompt to use based on priority chain
 * @param {string} promptId - e.g., 'scene_recap_prompt'
 * @returns {VersionedPrompt} - Resolved prompt object
 */
export function resolvePrompt(promptId) {
  try {
    const context = getContext();

    // If context not ready, skip stickies (use profile or default)
    if (!context || !context.characters) {
      const profileVersion = get_settings(promptId);
      if (profileVersion && !profileVersion.isDefault) {
        return profileVersion;
      }
      return getDefaultPrompt(promptId);
    }

    // PRIORITY 1: Check chat sticky (user version only)
    const chatId = get_current_chat_identifier();
    if (chatId) {
      const chatStickies = get_settings('chat_sticky_prompts') || {};
      const chatVersion = chatStickies[chatId]?.[promptId];
      if (chatVersion) {
        return chatVersion;
      }
    }

    // PRIORITY 2: Check character sticky (user version only)
    const characterKey = get_current_character_identifier();
    if (characterKey) {
      const characterStickies = get_settings('character_sticky_prompts') || {};
      const characterVersion = characterStickies[characterKey]?.[promptId];
      if (characterVersion) {
        return characterVersion;
      }
    }

    // PRIORITY 3: Check profile (user version only)
    const profileVersion = get_settings(promptId);
    if (profileVersion && !profileVersion.isDefault) {
      return profileVersion;
    }

    // PRIORITY 4: Use default (always available from code)
    return getDefaultPrompt(promptId);

  } catch (error) {
    error(`Failed to resolve prompt ${promptId}:`, error);
    return getDefaultPrompt(promptId);  // Safe fallback
  }
}

/**
 * Get the actual prompt text to use (unwraps versioned object)
 * @param {string} promptId
 * @returns {string} - The prompt text
 */
export function getPromptText(promptId) {
  return resolvePrompt(promptId).content;
}

/**
 * Check if a prompt is using default or user version
 * @param {string} promptId
 * @returns {boolean}
 */
export function isUsingDefault(promptId) {
  return resolvePrompt(promptId).isDefault;
}

/**
 * Get information about where a prompt is coming from
 * Used for UI badges
 * @param {string} promptId
 * @returns {Object} - { type, label, isUserVersion }
 */
export function getPromptSource(promptId) {
  const resolved = resolvePrompt(promptId);

  // Check if using default
  if (resolved.isDefault) {
    return {
      type: 'default',
      label: 'Default',
      icon: '📄',
      color: 'gray',
      isUserVersion: false
    };
  }

  // Check where user version comes from
  const chatId = get_current_chat_identifier();
  const chatStickies = get_settings('chat_sticky_prompts') || {};
  if (chatId && chatStickies[chatId]?.[promptId]) {
    return {
      type: 'chat',
      label: 'Chat Override',
      icon: '💬',
      color: 'blue',
      isUserVersion: true
    };
  }

  const characterKey = get_current_character_identifier();
  const characterStickies = get_settings('character_sticky_prompts') || {};
  if (characterKey && characterStickies[characterKey]?.[promptId]) {
    return {
      type: 'character',
      label: 'Character Override',
      icon: '👤',
      color: 'purple',
      isUserVersion: true
    };
  }

  // Profile user version
  return {
    type: 'profile',
    label: 'My Version',
    icon: '✏️',
    color: 'orange',
    isUserVersion: true
  };
}
```

### 4.2 Resolution Examples

#### Example 1: Using Default (No Customization)

```javascript
// Setup:
// - User never edited scene_recap_prompt
// - profile['scene_recap_prompt'] doesn't exist
// - No character/chat stickies

resolvePrompt('scene_recap_prompt')
// → Returns default from code

getPromptSource('scene_recap_prompt')
// → { type: 'default', label: 'Default', isUserVersion: false }
```

#### Example 2: Using Profile User Version

```javascript
// Setup:
// - User edited scene_recap_prompt
// - profile['scene_recap_prompt'] = { /* user version */ }
// - No character/chat stickies

resolvePrompt('scene_recap_prompt')
// → Returns profile user version

getPromptSource('scene_recap_prompt')
// → { type: 'profile', label: 'My Version', isUserVersion: true }
```

#### Example 3: Character Sticky Override

```javascript
// Setup:
// - character_sticky_prompts['alice.png']['scene_recap_prompt'] exists
// - profile also has user version
// - Character: alice.png

resolvePrompt('scene_recap_prompt')
// → Returns character sticky (overrides profile)

getPromptSource('scene_recap_prompt')
// → { type: 'character', label: 'Character Override', isUserVersion: true }
```

#### Example 4: Chat Sticky (Highest Priority)

```javascript
// Setup:
// - chat_sticky_prompts['chat-123']['scene_recap_prompt'] exists
// - character_sticky_prompts['alice.png']['scene_recap_prompt'] exists
// - profile also has user version
// - Chat: chat-123, Character: alice.png

resolvePrompt('scene_recap_prompt')
// → Returns chat sticky (highest priority)

getPromptSource('scene_recap_prompt')
// → { type: 'chat', label: 'Chat Override', isUserVersion: true }
```

---

## 5. Migration Strategy

### 5.1 Migration Goal

**Convert v1.x (string prompts) → v2.x (immutable defaults with optional user versions)**

**Key principle:** Only store what user actually customized

### 5.2 Migration Logic

**File:** `promptMigration.js`

```javascript
import { get_settings, set_settings, log, SUBSYSTEM } from './index.js';
import { getDefaultPrompt } from './promptVersionRegistry.js';
import * as defaultPrompts from './defaultPrompts.js';

/**
 * Check if migration is needed
 * @returns {boolean}
 */
export function needsPromptMigration() {
  const profiles = get_settings('profiles');

  for (const [profileName, profileSettings] of Object.entries(profiles)) {
    for (const promptKey of VERSIONABLE_PROMPTS) {
      const value = profileSettings[promptKey];

      // If string exists, need migration
      if (typeof value === 'string') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Migrate string prompts to versioned format
 * KEY: Only create user versions if customized, otherwise delete
 * @returns {Promise<boolean>} - true if migration performed
 */
export async function migratePromptsToVersioned() {
  log(SUBSYSTEM.SETTINGS, '=== Starting Prompt Migration (Immutable Defaults) ===');

  const profiles = get_settings('profiles');
  let migrated = false;

  for (const [profileName, profileSettings] of Object.entries(profiles)) {
    log(SUBSYSTEM.SETTINGS, `Migrating profile: "${profileName}"`);

    for (const promptKey of VERSIONABLE_PROMPTS) {
      const currentValue = profileSettings[promptKey];

      // Skip if already versioned or missing
      if (!currentValue || typeof currentValue !== 'string') {
        continue;
      }

      // Get default for comparison
      const defaultValue = defaultPrompts[promptKey];
      const isCustomized = currentValue !== defaultValue;

      if (isCustomized) {
        // User customized = create user version
        const userVersion = createUserVersion(
          promptKey,
          currentValue,
          getDefaultPrompt(promptKey).version
        );

        profileSettings[promptKey] = userVersion;
        log(SUBSYSTEM.SETTINGS, `  ✓ ${promptKey} → USER VERSION (customized)`);
        migrated = true;

      } else {
        // Not customized = delete from profile (use code default)
        delete profileSettings[promptKey];
        log(SUBSYSTEM.SETTINGS, `  ✓ ${promptKey} → DELETED (will use code default)`);
        migrated = true;
      }
    }
  }

  if (migrated) {
    set_settings('profiles', profiles);
    log(SUBSYSTEM.SETTINGS, '=== Prompt Migration Complete ===');
  } else {
    log(SUBSYSTEM.SETTINGS, '=== No Migration Needed ===');
  }

  return migrated;
}

/**
 * Create user version object from string
 * @param {string} promptId
 * @param {string} content
 * @param {string} basedOnVersion
 * @returns {UserVersion}
 */
function createUserVersion(promptId, content, basedOnVersion) {
  const timestamp = Date.now();

  return {
    id: promptId,
    version: `${basedOnVersion}-custom-${timestamp}`,
    basedOnVersion: basedOnVersion,
    content: content,
    isDefault: false,
    userModified: true,
    createdAt: timestamp,
    modifiedAt: timestamp,
    customLabel: 'Migrated from v1.x',
    updateAvailable: false,
    updateDismissed: false,
    dismissedVersion: null
  };
}
```

### 5.3 Migration Timing

**When:** During extension initialization

**File:** `eventHandlers.js` (or `index.js`)

```javascript
async function initializeExtension() {
  // Initialize settings
  initialize_settings();
  initializeAutoLorebooksGlobalSettings();
  load_profile();

  // EXISTING: Migrate connection profiles
  if (needsMigration()) {
    await migrateConnectionProfileSettings();
  }

  // NEW: Migrate prompts to versioned (with immutable defaults)
  if (needsPromptMigration()) {
    await migratePromptsToVersioned();
    saveSettingsDebounced();
  }

  // Continue with rest of initialization...
}
```

### 5.4 Migration Outcomes

**Before migration (v1.x profile):**
```javascript
{
  scene_recap_prompt: "You are a structured...",  // Default text (string)
  auto_scene_break_prompt: "Custom prompt...",    // Customized (string)
  scene_recap_prefill: "{",
  // ... settings
}
```

**After migration (v2.x profile):**
```javascript
{
  // scene_recap_prompt: DELETED (will use code default)

  auto_scene_break_prompt: {  // User version (customized)
    id: "auto_scene_break_prompt",
    version: "1.2.0-custom-1705320000000",
    basedOnVersion: "1.2.0",
    content: "Custom prompt...",
    isDefault: false,
    userModified: true,
    // ... metadata
  },

  scene_recap_prefill: "{",
  // ... settings (unchanged)
}
```

**Result:**
- ✅ Non-customized prompts deleted (75-90% storage saved)
- ✅ Customized prompts preserved as user versions
- ✅ Zero data loss
- ✅ Auto-updates for non-customized prompts

---

## 6. UI Design

### 6.1 Prompt Editor States

#### State 1: Using Default (Read-Only)

```
┌──────────────────────────────────────────────────────┐
│ Scene Recap Prompt                                   │
│ [📄 Default] v2.1.0                      [Edit] [▼]  │
├──────────────────────────────────────────────────────┤
│ (Read-only preview of default prompt)               │
│                                                      │
│ You are a structured assistant that generates...    │
│ (grayed out, not editable)                           │
│                                                      │
├──────────────────────────────────────────────────────┤
│ [✏️ Edit] Click to create your own version          │
└──────────────────────────────────────────────────────┘
```

**Behavior:**
- Textarea is **disabled** (read-only)
- "Edit" button is **prominent** (primary action)
- Clicking "Edit" creates user version and switches to State 2

#### State 2: Using User Version (Editable)

```
┌──────────────────────────────────────────────────────┐
│ Scene Recap Prompt                                   │
│ [✏️ My Version] v2.1.0-custom           [Edit] [▼]  │
├──────────────────────────────────────────────────────┤
│ (Editable textarea with user content)               │
│                                                      │
│ My custom prompt text...                            │
│ (white background, editable)                         │
│                                                      │
├──────────────────────────────────────────────────────┤
│ [💾 Save Changes] [🗑️ Delete My Version]            │
└──────────────────────────────────────────────────────┘
```

**Behavior:**
- Textarea is **enabled** (editable)
- "Save Changes" saves modifications
- "Delete My Version" deletes user version, reverts to default

#### State 3: Character/Chat Override

```
┌──────────────────────────────────────────────────────┐
│ Scene Recap Prompt                                   │
│ [👤 Character Override] v2.1.0-custom   [Edit] [▼]  │
├──────────────────────────────────────────────────────┤
│ (Editable textarea with sticky content)             │
│                                                      │
│ Custom prompt for Alice...                           │
│                                                      │
├──────────────────────────────────────────────────────┤
│ [💾 Save Changes] [🗑️ Remove Sticky]                │
└──────────────────────────────────────────────────────┘
```

**Behavior:**
- Similar to State 2, but badge shows override source
- "Remove Sticky" deletes sticky, falls back to profile/default

### 6.2 Badge System

```javascript
/**
 * Get badge configuration for UI
 * @param {string} promptId
 * @returns {Object}
 */
function getPromptBadge(promptId) {
  const source = getPromptSource(promptId);

  return {
    text: source.label,
    icon: source.icon,
    color: source.color,
    isUserVersion: source.isUserVersion
  };
}
```

**Badge Styles:**

| Badge | Icon | Color | State |
|-------|------|-------|-------|
| Default | 📄 | Gray | Read-only, no user version |
| My Version | ✏️ | Orange | User customized (profile) |
| Character Override | 👤 | Purple | Stickied to character |
| Chat Override | 💬 | Blue | Stickied to chat |

### 6.3 Action Buttons

#### "Edit" Button

**When showing default:**
```javascript
function handleEditDefaultPrompt(promptId) {
  const defaultPrompt = getDefaultPrompt(promptId);

  // Create user version (fork from default)
  const userVersion = {
    id: promptId,
    version: `${defaultPrompt.version}-custom-${Date.now()}`,
    basedOnVersion: defaultPrompt.version,
    content: defaultPrompt.content,  // Start with default content
    isDefault: false,
    userModified: true,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    customLabel: null,
    updateAvailable: false,
    updateDismissed: false,
    dismissedVersion: null
  };

  // Save to profile
  set_settings(promptId, userVersion);

  // Refresh UI to show editable state
  toast('Created your version. You can now edit this prompt.', 'success');
  refreshPromptEditor(promptId);
}
```

**When showing user version:**
```javascript
function handleEditUserPrompt(promptId) {
  // Just open editor (already editable)
  openPromptEditorModal(promptId);
}
```

#### "Delete My Version" Button

```javascript
function handleDeleteUserVersion(promptId) {
  const confirmed = confirm(
    'Delete your custom version?\n\n' +
    'This will revert to the default prompt. This action cannot be undone.'
  );

  if (!confirmed) return;

  // Delete from current source
  const source = getPromptSource(promptId);

  if (source.type === 'chat') {
    const chatId = get_current_chat_identifier();
    const chatStickies = get_settings('chat_sticky_prompts') || {};
    delete chatStickies[chatId]?.[promptId];
    set_settings('chat_sticky_prompts', chatStickies);

  } else if (source.type === 'character') {
    const characterKey = get_current_character_identifier();
    const characterStickies = get_settings('character_sticky_prompts') || {};
    delete characterStickies[characterKey]?.[promptId];
    set_settings('character_sticky_prompts', characterStickies);

  } else {
    // Profile user version
    const profile = get_settings('profile');
    const profiles = get_settings('profiles');
    delete profiles[profile][promptId];
    set_settings('profiles', profiles);
  }

  toast('Reverted to default prompt', 'success');
  refreshPromptEditor(promptId);
}
```

#### "Sticky" Button

**Menu options:**

```javascript
function showStickyMenu(promptId) {
  const source = getPromptSource(promptId);
  const characterKey = get_current_character_identifier();
  const chatId = get_current_chat_identifier();

  const menu = [
    {
      label: 'Sticky to Character',
      sublabel: characterKey || 'No character selected',
      icon: 'fa-user',
      enabled: !!characterKey,
      active: source.type === 'character',
      action: () => stickyToCharacter(promptId)
    },
    {
      label: 'Sticky to Chat',
      sublabel: chatId ? `Chat ${chatId.substring(0, 20)}...` : 'No chat selected',
      icon: 'fa-comments',
      enabled: !!chatId,
      active: source.type === 'chat',
      action: () => stickyToChat(promptId)
    },
    { type: 'divider' },
    {
      label: 'Remove Sticky',
      icon: 'fa-times',
      enabled: source.type === 'character' || source.type === 'chat',
      action: () => removeSticky(promptId)
    }
  ];

  showContextMenu(menu);
}

function stickyToCharacter(promptId) {
  const characterKey = get_current_character_identifier();
  if (!characterKey) {
    toast('No character selected', 'error');
    return;
  }

  // Get current resolved prompt (could be default or user version)
  const currentPrompt = resolvePrompt(promptId);

  // If it's a default, create user version first
  let stickyVersion;
  if (currentPrompt.isDefault) {
    stickyVersion = createUserVersionFromDefault(promptId);
  } else {
    stickyVersion = structuredClone(currentPrompt);
  }

  // Save to character stickies
  const characterStickies = get_settings('character_sticky_prompts') || {};
  if (!characterStickies[characterKey]) {
    characterStickies[characterKey] = {};
  }
  characterStickies[characterKey][promptId] = stickyVersion;
  set_settings('character_sticky_prompts', characterStickies);

  toast(`Prompt stickied to character: ${characterKey}`, 'success');
  refreshPromptEditor(promptId);
}
```

### 6.4 Update Notification

**When user has outdated custom version:**

```
┌──────────────────────────────────────────────────────┐
│ ⚠️ Prompt Update Available                           │
├──────────────────────────────────────────────────────┤
│ Scene Recap Prompt has a new default version:       │
│ v2.1.0 (based on v2.0.0)                             │
│                                                      │
│ Changes: "Added explicit content handling"          │
│                                                      │
│ Your custom version is based on v2.0.0              │
├──────────────────────────────────────────────────────┤
│ [Compare Changes] [Revert to Default] [Keep Mine]   │
└──────────────────────────────────────────────────────┘
```

**Actions:**
- **Compare Changes** - Show diff between user version and new default
- **Revert to Default** - Delete user version (get new default automatically)
- **Keep Mine** - Acknowledge update, dismiss notification

---

## 7. Update Detection

### 7.1 Update Detection Logic

```javascript
// promptUpdate.js

/**
 * Check if user version is outdated
 * @param {UserVersion} userVersion
 * @returns {boolean}
 */
export function hasUpdateAvailable(userVersion) {
  if (!userVersion || userVersion.isDefault) {
    return false;  // Defaults are always current (from code)
  }

  const defaultPrompt = getDefaultPrompt(userVersion.id);
  const latestVersion = defaultPrompt.version;
  const baseVersion = userVersion.basedOnVersion;

  // Compare base version with latest
  return compareVersions(latestVersion, baseVersion) > 0;
}

/**
 * Compare semantic versions
 * @param {string} v1
 * @param {string} v2
 * @returns {number} - -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * Get all user versions with available updates
 * @returns {Array}
 */
export function checkForUpdates() {
  const updates = [];

  // Check profile user versions
  const currentProfile = get_settings('profile');
  const profiles = get_settings('profiles');
  const profileSettings = profiles[currentProfile];

  for (const promptKey of VERSIONABLE_PROMPTS) {
    const userVersion = profileSettings[promptKey];

    if (userVersion && hasUpdateAvailable(userVersion)) {
      if (!userVersion.updateDismissed ||
          userVersion.dismissedVersion !== getDefaultPrompt(promptKey).version) {
        updates.push({
          promptId: promptKey,
          userVersion: userVersion.version,
          baseVersion: userVersion.basedOnVersion,
          latestVersion: getDefaultPrompt(promptKey).version,
          changelog: PROMPT_VERSIONS[promptKey].changelog
        });
      }
    }
  }

  return updates;
}

/**
 * Show update notification on init
 */
export function notifyUpdates() {
  const updates = checkForUpdates();

  if (updates.length === 0) return;

  const count = updates.length;
  const message = count === 1
    ? '1 custom prompt has an update available'
    : `${count} custom prompts have updates available`;

  toast(message, 'info', {
    timeout: 5000,
    onclick: () => showUpdateModal(updates)
  });
}
```

### 7.2 Update Actions

```javascript
/**
 * Handle user's update choice
 * @param {string} promptId
 * @param {string} action - 'revert' | 'keep' | 'dismiss'
 */
export function handleUpdate(promptId, action) {
  const userVersion = resolvePrompt(promptId);
  const defaultPrompt = getDefaultPrompt(promptId);

  if (action === 'revert') {
    // Delete user version = automatically use default
    deleteUserVersion(promptId);
    toast(`Reverted to default prompt (v${defaultPrompt.version})`, 'success');
    refreshPromptEditor(promptId);

  } else if (action === 'keep') {
    // Update base version, acknowledge update
    const source = getPromptSource(promptId);
    userVersion.basedOnVersion = defaultPrompt.version;
    userVersion.updateDismissed = false;  // Clear dismissal
    saveUserVersionToSource(promptId, userVersion, source);
    toast('Acknowledged update, keeping your version', 'info');

  } else if (action === 'dismiss') {
    // Dismiss this specific version update
    const source = getPromptSource(promptId);
    userVersion.updateDismissed = true;
    userVersion.dismissedVersion = defaultPrompt.version;
    saveUserVersionToSource(promptId, userVersion, source);
    toast('Update dismissed', 'info');
  }
}
```

---

## 8. Implementation Guide

### 8.1 Code Changes Required

#### 8.1.1 All Prompt Access Sites

**Current pattern:**
```javascript
const prompt = get_settings('scene_recap_prompt');
```

**New pattern:**
```javascript
import { getPromptText } from './promptResolution.js';
const prompt = getPromptText('scene_recap_prompt');
```

**Sites to update:**
1. `autoSceneBreakDetection.js:537`
2. `sceneBreak.js:867`
3. `runningSceneRecap.js:298`
4. `runningSceneRecap.js:410`
5. All Auto-Lorebooks prompt access (grep for confirmation)

**Action:** Run grep before starting:
```bash
grep -rn "get_settings.*_prompt" --include="*.js" | grep -v "prefill\|connection\|preset"
```

#### 8.1.2 Profile Export

**File:** `profileManager.js`

```javascript
// BEFORE
export function export_profile(profile = null) {
  const settings = copy_settings(targetProfile);
  const data = JSON.stringify(settings, null, 2);
  download(data, `${profile}.json`, 'application/json');
}

// AFTER
export function export_profile(profile = null) {
  let targetProfile = profile || get_settings('profile');
  const settings = copy_settings(targetProfile);

  // NEW: Remove prompts using defaults (don't export)
  for (const promptKey of VERSIONABLE_PROMPTS) {
    if (!settings[promptKey] || settings[promptKey].isDefault) {
      delete settings[promptKey];
    }
  }

  const data = JSON.stringify(settings, null, 2);
  download(data, `${profile}.json`, 'application/json');
}
```

#### 8.1.3 Profile Import

**File:** `profileManager.js`

```javascript
// BEFORE
async function import_profile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const name = file.name.replace('.json', '');
  const data = await parseJsonFile(file);

  const profiles = get_settings('profiles');
  profiles[name] = data;  // ❌ No merging
  set_settings('profiles', profiles);

  toast(`Profile "${name}" imported`, 'success');
  refresh_settings();
}

// AFTER
async function import_profile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const name = file.name.replace('.json', '');
  let data = await parseJsonFile(file);

  // ✅ Merge with defaults (adds missing settings)
  data = Object.assign(structuredClone(default_settings), data);

  // ✅ Migrate string prompts to versioned
  for (const promptKey of VERSIONABLE_PROMPTS) {
    if (typeof data[promptKey] === 'string') {
      const defaultValue = defaultPrompts[promptKey];

      if (data[promptKey] === defaultValue) {
        // Not customized, delete (use code default)
        delete data[promptKey];
      } else {
        // Customized, create user version
        data[promptKey] = createUserVersion(
          promptKey,
          data[promptKey],
          getDefaultPrompt(promptKey).version
        );
      }
    }
  }

  const profiles = get_settings('profiles');
  profiles[name] = data;
  set_settings('profiles', profiles);

  toast(`Profile "${name}" imported and migrated`, 'success');
  refresh_settings();
}
```

### 8.2 New Files to Create

1. **`promptVersionRegistry.js`**
   - `PROMPT_VERSIONS` constant
   - `getDefaultPrompt(promptId)` function
   - Version comparison utilities

2. **`promptResolution.js`**
   - `resolvePrompt(promptId)` function
   - `getPromptText(promptId)` function
   - `getPromptSource(promptId)` function
   - `isUsingDefault(promptId)` function

3. **`promptMigration.js`**
   - `VERSIONABLE_PROMPTS` constant
   - `needsPromptMigration()` function
   - `migratePromptsToVersioned()` function
   - `createUserVersion()` helper

4. **`promptUpdate.js`**
   - `hasUpdateAvailable(userVersion)` function
   - `checkForUpdates()` function
   - `notifyUpdates()` function
   - `handleUpdate(promptId, action)` function

5. **`promptEditor.js`** (UI)
   - Prompt editor component logic
   - Badge rendering
   - Action button handlers

6. **`promptSticky.js`**
   - `stickyToCharacter(promptId)` function
   - `stickyToChat(promptId)` function
   - `removeSticky(promptId)` function

---

## 9. Testing Strategy

### 9.1 Unit Tests

```javascript
// tests/unit/promptResolution.spec.js

describe('Prompt Resolution (Immutable Defaults)', () => {
  test('should return default when no user version', () => {
    const prompt = resolvePrompt('scene_recap_prompt');
    expect(prompt.isDefault).toBe(true);
    expect(prompt.content).toBe(defaultPrompts.scene_recap_prompt);
  });

  test('should return user version when exists', () => {
    const userVersion = createMockUserVersion('scene_recap_prompt');
    set_settings('scene_recap_prompt', userVersion);

    const prompt = resolvePrompt('scene_recap_prompt');
    expect(prompt.isDefault).toBe(false);
    expect(prompt).toEqual(userVersion);
  });

  test('should prioritize chat sticky over profile', () => {
    const profileVersion = createMockUserVersion('profile');
    const chatVersion = createMockUserVersion('chat');

    set_settings('scene_recap_prompt', profileVersion);
    set_settings('chat_sticky_prompts', {
      'chat-123': { scene_recap_prompt: chatVersion }
    });
    mockCurrentChat('chat-123');

    const prompt = resolvePrompt('scene_recap_prompt');
    expect(prompt).toEqual(chatVersion);
  });
});
```

### 9.2 Migration Tests

```javascript
// tests/unit/promptMigration.spec.js

describe('Prompt Migration', () => {
  test('should delete non-customized string prompts', async () => {
    const defaultValue = defaultPrompts.scene_recap_prompt;

    set_settings('profiles', {
      'Default': {
        scene_recap_prompt: defaultValue  // Same as default
      }
    });

    await migratePromptsToVersioned();

    const profiles = get_settings('profiles');
    expect(profiles['Default'].scene_recap_prompt).toBeUndefined();
  });

  test('should create user version for customized prompts', async () => {
    set_settings('profiles', {
      'Default': {
        scene_recap_prompt: 'Custom prompt text'
      }
    });

    await migratePromptsToVersioned();

    const profiles = get_settings('profiles');
    const migrated = profiles['Default'].scene_recap_prompt;

    expect(migrated.isDefault).toBe(false);
    expect(migrated.userModified).toBe(true);
    expect(migrated.content).toBe('Custom prompt text');
  });
});
```

### 9.3 Integration Tests

```javascript
// tests/integration/promptVersioning.spec.js

describe('Prompt Versioning E2E', () => {
  test('should use default, edit, save, and delete cycle', async () => {
    // 1. Initially uses default
    let prompt = resolvePrompt('scene_recap_prompt');
    expect(prompt.isDefault).toBe(true);

    // 2. User clicks "Edit" (creates user version)
    await handleEditDefaultPrompt('scene_recap_prompt');

    prompt = resolvePrompt('scene_recap_prompt');
    expect(prompt.isDefault).toBe(false);
    expect(prompt.userModified).toBe(true);

    // 3. User edits content
    prompt.content = 'Modified content';
    set_settings('scene_recap_prompt', prompt);

    // 4. User clicks "Delete My Version"
    await handleDeleteUserVersion('scene_recap_prompt');

    prompt = resolvePrompt('scene_recap_prompt');
    expect(prompt.isDefault).toBe(true);
  });
});
```

---

## 10. Backward Compatibility

### 10.1 Migration Guarantees

**v1.x → v2.x migration ensures:**

1. ✅ **Zero data loss** - All customized prompts preserved as user versions
2. ✅ **Storage cleanup** - Non-customized prompts deleted (~75-90% savings)
3. ✅ **Auto-updates** - Non-customized prompts use latest defaults immediately
4. ✅ **Idempotent** - Safe to run multiple times

### 10.2 Import/Export Compatibility

**Exporting from v2.x:**
- Includes only user versions (not defaults)
- Smaller file size
- Clean, minimal JSON

**Importing v1.x profile into v2.x:**
- Automatically migrated during import
- Non-customized prompts deleted
- Customized prompts converted to user versions
- Fully backward compatible

**Importing v2.x profile into v2.x:**
- Works as-is
- Missing defaults filled from code
- User versions preserved

### 10.3 Rollback Strategy

**If issues arise:**

1. **User can export current profile** before updating
2. **Import old profile** to restore (with migration)
3. **Delete user versions** individually to revert to defaults
4. **No automatic rollback** (migration is one-way by design)

**Recommendation:** Prompt users to export profiles before major version update.

---

## Summary

This corrected design implements the **immutable defaults** principle, fixing all critical flaws from the original design:

### Problems Solved

1. ✅ **Storage bloat** - Defaults not stored, 75-90% savings
2. ✅ **Update confusion** - Non-customized prompts auto-update
3. ✅ **Prompt vs settings** - Only prompt text versioned, settings separate
4. ✅ **Profile import** - Now merges with defaults correctly
5. ✅ **Migration clarity** - Clear customized vs default detection
6. ✅ **UI simplicity** - No "Reset to Default" buttons needed

### Key Features

1. **Defaults are code** - `defaultPrompts.js` + `promptVersionRegistry.js`
2. **User versions are data** - Stored only when customized
3. **Clean migration** - Deletes non-customized, preserves customized
4. **Simple resolution** - Chat → Character → Profile → Default
5. **Clear UI** - "Default" (read-only) vs "My Version" (editable)
6. **Update detection** - Based on `basedOnVersion` tracking

### Implementation Checklist

- [ ] Phase 0: Grep all prompt access sites, plan refactoring
- [ ] Phase 1: Create core files (registry, resolution, migration)
- [ ] Phase 2: Refactor all prompt access to use `getPromptText()`
- [ ] Phase 3: Add storage (character/chat stickies)
- [ ] Phase 4: Implement update detection
- [ ] Phase 5: Build UI components
- [ ] Phase 6: Comprehensive testing

**Status:** Ready for implementation with this corrected design.

---

**END OF CORRECTED DESIGN**

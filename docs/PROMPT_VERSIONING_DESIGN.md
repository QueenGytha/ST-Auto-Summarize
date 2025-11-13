# Prompt Versioning & Stickying System Design

**Document Version:** 1.0
**Date:** 2025-11-12
**Status:** Design Specification
**Purpose:** Comprehensive design for prompt versioning with character/chat-level stickying

---

## Executive Summary

This document specifies a system for versioning prompts with character/chat-level override capabilities ("stickying"). The design follows existing architectural patterns in ST-Auto-Summarize while enabling:

1. **Versioned prompts** - Semantic versioning with changelog tracking
2. **Update notifications** - Alert users when improved prompts are available
3. **Character-level stickying** - Override prompts for specific characters
4. **Chat-level stickying** - Override prompts for specific chats (highest priority)
5. **Backward compatibility** - Automatic migration from string prompts
6. **User control** - Choose how to handle updates (replace/merge/review/dismiss)

### Resolution Priority Chain

```
HIGHEST PRIORITY
    ↓
Chat-level sticky prompt (if exists)
    ↓
Character-level sticky prompt (if exists)
    ↓
Profile prompt (current active profile)
    ↓
Default prompt (from defaultPrompts.js)
    ↓
LOWEST PRIORITY
```

---

## Table of Contents

1. [Data Structures](#1-data-structures)
2. [Storage Strategy](#2-storage-strategy)
3. [Resolution Algorithm](#3-resolution-algorithm)
4. [Migration Strategy](#4-migration-strategy)
5. [Update Workflow](#5-update-workflow)
6. [UI Design](#6-ui-design)
7. [Code Examples](#7-code-examples)
8. [Edge Cases](#8-edge-cases)
9. [Performance](#9-performance)
10. [Testing](#10-testing)
11. [Backward Compatibility](#11-backward-compatibility)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. Data Structures

### 1.1 Versioned Prompt Object

Replace string prompts with versioned objects:

**Current (v1.x):**
```javascript
profile.scene_recap_prompt = "You are a structured...";  // Plain string
```

**New (v2.x):**
```javascript
profile.scene_recap_prompt = {
  // Identity
  id: "scene_recap_prompt",                    // Unique identifier

  // Current state
  currentVersion: "2.1.0",                      // Semantic version (semver)
  content: "You are a structured...",           // The actual prompt text

  // Version history
  versionHistory: [
    {
      version: "2.1.0",
      content: "You are a structured...",
      timestamp: 1699564800000,
      changelog: "Added explicit content handling improvements",
      isDefault: true                           // From defaultPrompts.js
    },
    {
      version: "2.0.0",
      content: "Previous prompt text...",
      timestamp: 1699478400000,
      changelog: "Initial versioned release",
      isDefault: true
    },
    {
      version: "2.0.0-custom-1",
      content: "User's custom version...",
      timestamp: 1699478500000,
      changelog: "User edit",
      isDefault: false
    }
  ],

  // Customization tracking
  userModified: false,                          // Has user edited this prompt?
  lastModifiedTimestamp: null,                  // When user last edited (epoch ms)
  customVersionLabel: null,                     // User can label their custom version

  // Update notification state
  hasUpdate: false,                             // Is there a newer default version?
  latestDefaultVersion: "2.1.0",               // What's the latest from defaults?
  updateDismissed: false,                       // Did user dismiss update notification?
  updateDismissedVersion: null                  // Which update version was dismissed?
};
```

**Field Descriptions:**

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| `id` | string | Unique identifier matching setting key | `"scene_recap_prompt"` |
| `currentVersion` | string | Current version (semver) | `"2.1.0"` |
| `content` | string | The actual prompt text | `"You are..."` |
| `versionHistory` | array | All versions (newest first) | `[{version, content, ...}]` |
| `userModified` | boolean | User has customized | `true` |
| `lastModifiedTimestamp` | number\|null | When user last edited (ms) | `1699564800000` |
| `customVersionLabel` | string\|null | User's label for their version | `"My custom recap prompt"` |
| `hasUpdate` | boolean | New default available | `true` |
| `latestDefaultVersion` | string | Latest default version | `"2.1.0"` |
| `updateDismissed` | boolean | User dismissed notification | `false` |
| `updateDismissedVersion` | string\|null | Which version was dismissed | `"2.0.0"` |

### 1.2 Sticky Prompt Storage

Following the existing `character_profiles` and `chat_profiles` pattern:

```javascript
// In extension_settings.auto_recap (global settings)
{
  // EXISTING global settings
  profiles: { /* profile definitions */ },
  character_profiles: { /* character → profile mapping */ },
  chat_profiles: { /* chat → profile mapping */ },
  profile: "Default",
  // ...

  // NEW: Prompt stickying mappings
  character_sticky_prompts: {
    // character_key → { prompt_id → versioned_prompt_object }
    "alice.png": {
      "scene_recap_prompt": {
        id: "scene_recap_prompt",
        currentVersion: "2.1.0-custom",
        content: "Custom prompt for Alice...",
        userModified: true,
        // ... full versioned prompt object
      },
      "auto_scene_break_prompt": { /* ... */ }
    },
    "bob_avatar.png": {
      "running_scene_recap_prompt": { /* ... */ }
    }
  },

  chat_sticky_prompts: {
    // chat_id → { prompt_id → versioned_prompt_object }
    "chat-2024-01-15-12345": {
      "scene_recap_prompt": {
        id: "scene_recap_prompt",
        currentVersion: "2.1.0",
        content: "Prompt specific to this chat...",
        userModified: true,
        // ... full versioned prompt object
      }
    }
  }
}
```

**Storage Structure:**

```
extension_settings.auto_recap
├── character_sticky_prompts: {
│   ├── [character_identifier]: {
│   │   ├── [prompt_id]: VersionedPrompt
│   │   └── [prompt_id]: VersionedPrompt
│   │   }
│   └── ...
│   }
├── chat_sticky_prompts: {
│   ├── [chat_id]: {
│   │   ├── [prompt_id]: VersionedPrompt
│   │   └── [prompt_id]: VersionedPrompt
│   │   }
│   └── ...
│   }
```

**Why This Structure:**
- ✅ Follows existing patterns (same as `character_profiles`)
- ✅ Minimal storage (only stores overrides)
- ✅ Fast lookups (direct object access)
- ✅ Survives settings export/import
- ✅ Easy cleanup (delete character → delete stickies)

### 1.3 Profile Prompt Storage

Prompts in profiles become versioned objects:

```javascript
// In extension_settings.auto_recap.profiles['Default']
{
  // CURRENT (v1.x):
  // scene_recap_prompt: "string prompt text...",

  // NEW (v2.x):
  scene_recap_prompt: {
    id: "scene_recap_prompt",
    currentVersion: "2.1.0",
    content: "You are a structured...",
    versionHistory: [...],
    userModified: false,
    // ... full versioned prompt object
  },

  auto_scene_break_prompt: { /* ... */ },
  running_scene_recap_prompt: { /* ... */ },
  // ... all other prompts
}
```

### 1.4 Prompt List

All prompts that support versioning:

```javascript
const VERSIONABLE_PROMPTS = [
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
```

---

## 2. Storage Strategy

### 2.1 Storage Locations

| Data Type | Location | Scope | Persistence |
|-----------|----------|-------|-------------|
| **Default prompts** | `defaultPrompts.js` | Global | Code (version controlled) |
| **Version registry** | `promptVersionRegistry.js` | Global | Code (version controlled) |
| **Profile prompts** | `extension_settings.auto_recap.profiles[name]` | Per-profile | `settings.json` |
| **Character stickies** | `extension_settings.auto_recap.character_sticky_prompts` | Per-character | `settings.json` |
| **Chat stickies** | `extension_settings.auto_recap.chat_sticky_prompts` | Per-chat | `settings.json` |

### 2.2 Data Flow

```
┌──────────────────────────────────────────────────────────┐
│ CODE (Version Controlled)                                │
├──────────────────────────────────────────────────────────┤
│ defaultPrompts.js                                        │
│ ├─ scene_recap_prompt: "text..."                        │
│ └─ [all default prompt texts]                           │
│                                                          │
│ promptVersionRegistry.js                                 │
│ ├─ PROMPT_VERSIONS: {                                   │
│ │    scene_recap_prompt: {                              │
│ │      latest: "2.1.0",                                 │
│ │      versions: { "2.1.0": {...}, "2.0.0": {...} }    │
│ │    }                                                  │
│ │  }                                                    │
│ └─ getDefaultPrompt(id) → VersionedPrompt              │
└──────────────────────────────────────────────────────────┘
                        ↓ (provides defaults)
┌──────────────────────────────────────────────────────────┐
│ SETTINGS.JSON (User Data)                               │
├──────────────────────────────────────────────────────────┤
│ extension_settings.auto_recap:                          │
│                                                          │
│ 1. profiles: {                                          │
│      "Default": {                                       │
│        scene_recap_prompt: VersionedPrompt,            │
│        // ... other prompts                            │
│      }                                                  │
│    }                                                    │
│                                                          │
│ 2. character_sticky_prompts: {                         │
│      "alice.png": {                                     │
│        scene_recap_prompt: VersionedPrompt             │
│      }                                                  │
│    }                                                    │
│                                                          │
│ 3. chat_sticky_prompts: {                              │
│      "chat-123": {                                      │
│        scene_recap_prompt: VersionedPrompt             │
│      }                                                  │
│    }                                                    │
└──────────────────────────────────────────────────────────┘
                        ↓ (runtime resolution)
┌──────────────────────────────────────────────────────────┐
│ RUNTIME (Active Prompt Selection)                       │
├──────────────────────────────────────────────────────────┤
│ resolvePrompt("scene_recap_prompt")                     │
│   1. Check chat_sticky_prompts[current_chat]           │
│   2. Check character_sticky_prompts[current_char]      │
│   3. Check profiles[current_profile]                   │
│   4. Fallback to getDefaultPrompt()                    │
│                                                          │
│ → Returns: VersionedPrompt                             │
│                                                          │
│ getPromptText("scene_recap_prompt")                     │
│ → Returns: prompt.content (string)                     │
└──────────────────────────────────────────────────────────┘
```

### 2.3 Why This Storage Strategy

**Advantages:**
1. **Minimal storage overhead** - Only store overrides, not full prompt copies for every character/chat
2. **Follows existing patterns** - Same structure as `character_profiles` and `chat_profiles`
3. **Easy cleanup** - Delete character → delete stickies mapping
4. **Fast resolution** - Direct object access, no searching
5. **Export-friendly** - Stickies in global settings, included in settings export
6. **Version-controlled defaults** - Default prompts in code, updated via git

**Trade-offs:**
- Chat stickies don't travel with chat exports (design choice - can be added if needed)
- Duplicates prompt content when stickied (acceptable - allows independent versioning)
- Character identifier changes require sticky remapping (rare edge case)

---

## 3. Resolution Algorithm

### 3.1 Priority Chain

The resolution algorithm checks locations in order of priority:

```
HIGHEST PRIORITY (1)
    ↓
Chat-level sticky prompt
  ├─ extension_settings.auto_recap.chat_sticky_prompts[current_chat_id][prompt_id]
  └─ Most specific override, applies only to this chat
    ↓
PRIORITY 2
    ↓
Character-level sticky prompt
  ├─ extension_settings.auto_recap.character_sticky_prompts[current_character][prompt_id]
  └─ Applies to all chats with this character
    ↓
PRIORITY 3
    ↓
Profile prompt
  ├─ extension_settings.auto_recap.profiles[current_profile][prompt_id]
  └─ Applies to all characters/chats using this profile
    ↓
LOWEST PRIORITY (4)
    ↓
Default prompt
  ├─ defaultPrompts.js + promptVersionRegistry.js
  └─ Fallback, applies when no overrides exist
```

### 3.2 Resolution Function

**File:** `promptResolution.js`

```javascript
import { get_settings } from './settingsManager.js';
import { get_current_character_identifier, get_current_chat_identifier } from './index.js';
import { getDefaultPrompt } from './promptVersionRegistry.js';

/**
 * Resolve which prompt to use based on priority chain
 * @param {string} promptId - e.g., 'scene_recap_prompt'
 * @returns {VersionedPrompt} - The resolved versioned prompt object
 */
export function resolvePrompt(promptId) {
  // PRIORITY 1: Check for chat-sticky prompt (HIGHEST)
  const chatId = get_current_chat_identifier();
  if (chatId) {
    const chatStickies = get_settings('chat_sticky_prompts') || {};
    const chatPrompt = chatStickies[chatId]?.[promptId];
    if (chatPrompt && isValidVersionedPrompt(chatPrompt)) {
      return chatPrompt;
    }
  }

  // PRIORITY 2: Check for character-sticky prompt
  const characterKey = get_current_character_identifier();
  if (characterKey) {
    const characterStickies = get_settings('character_sticky_prompts') || {};
    const characterPrompt = characterStickies[characterKey]?.[promptId];
    if (characterPrompt && isValidVersionedPrompt(characterPrompt)) {
      return characterPrompt;
    }
  }

  // PRIORITY 3: Check profile prompt (current profile)
  const profilePrompt = get_settings(promptId);
  if (profilePrompt && isValidVersionedPrompt(profilePrompt)) {
    return profilePrompt;
  }

  // PRIORITY 4: Fall back to default (from defaultPrompts.js)
  return getDefaultPrompt(promptId);
}

/**
 * Validate that an object is a properly structured VersionedPrompt
 * @param {any} obj
 * @returns {boolean}
 */
function isValidVersionedPrompt(obj) {
  return obj &&
         typeof obj === 'object' &&
         typeof obj.id === 'string' &&
         typeof obj.content === 'string' &&
         typeof obj.currentVersion === 'string';
}

/**
 * Get the actual prompt text to use (unwraps versioned object)
 * @param {string} promptId
 * @returns {string} - The prompt text
 */
export function getPromptText(promptId) {
  const versionedPrompt = resolvePrompt(promptId);
  return versionedPrompt.content;
}

/**
 * Get information about where a prompt is coming from
 * Useful for UI display (showing source badges)
 * @param {string} promptId
 * @returns {Object} - { source: 'chat'|'character'|'profile'|'default', identifier: string, isSticky: boolean }
 */
export function getPromptSource(promptId) {
  const chatId = get_current_chat_identifier();
  const chatStickies = get_settings('chat_sticky_prompts') || {};
  if (chatId && chatStickies[chatId]?.[promptId]) {
    return {
      source: 'chat',
      identifier: chatId,
      isSticky: true,
      description: `Chat-specific (${chatId})`
    };
  }

  const characterKey = get_current_character_identifier();
  const characterStickies = get_settings('character_sticky_prompts') || {};
  if (characterKey && characterStickies[characterKey]?.[promptId]) {
    return {
      source: 'character',
      identifier: characterKey,
      isSticky: true,
      description: `Character-specific (${characterKey})`
    };
  }

  const profilePrompt = get_settings(promptId);
  if (profilePrompt && isValidVersionedPrompt(profilePrompt)) {
    return {
      source: 'profile',
      identifier: get_settings('profile'),
      isSticky: false,
      description: `Profile: ${get_settings('profile')}`
    };
  }

  return {
    source: 'default',
    identifier: 'defaultPrompts.js',
    isSticky: false,
    description: 'Default'
  };
}

/**
 * Check if a prompt is currently stickied
 * @param {string} promptId
 * @returns {boolean}
 */
export function isPromptStickied(promptId) {
  const source = getPromptSource(promptId);
  return source.isSticky;
}
```

### 3.3 Resolution Examples

#### Example 1: No Overrides

```javascript
// Setup:
// - No chat sticky
// - No character sticky
// - Profile has default prompt
// - Character: alice.png
// - Chat: chat-123

resolvePrompt('scene_recap_prompt')
// → Returns profile prompt

getPromptSource('scene_recap_prompt')
// → { source: 'profile', identifier: 'Default', isSticky: false }
```

#### Example 2: Character Sticky

```javascript
// Setup:
// - No chat sticky
// - Character sticky exists for alice.png
// - Profile has different prompt
// - Character: alice.png
// - Chat: chat-123

resolvePrompt('scene_recap_prompt')
// → Returns character sticky prompt (overrides profile)

getPromptSource('scene_recap_prompt')
// → { source: 'character', identifier: 'alice.png', isSticky: true }
```

#### Example 3: Chat Sticky (Highest Priority)

```javascript
// Setup:
// - Chat sticky exists for chat-123
// - Character sticky exists for alice.png
// - Profile has different prompt
// - Character: alice.png
// - Chat: chat-123

resolvePrompt('scene_recap_prompt')
// → Returns chat sticky prompt (overrides all)

getPromptSource('scene_recap_prompt')
// → { source: 'chat', identifier: 'chat-123', isSticky: true }
```

#### Example 4: Fallback to Default

```javascript
// Setup:
// - No chat sticky
// - No character sticky
// - Profile prompt is corrupted/missing
// - Character: alice.png
// - Chat: chat-123

resolvePrompt('scene_recap_prompt')
// → Returns default prompt from defaultPrompts.js

getPromptSource('scene_recap_prompt')
// → { source: 'default', identifier: 'defaultPrompts.js', isSticky: false }
```

---

## 4. Migration Strategy

### 4.1 Migration Overview

Convert existing string prompts to versioned objects automatically and safely.

**Goals:**
1. ✅ Zero data loss
2. ✅ Detect user customizations
3. ✅ Preserve all profiles
4. ✅ Idempotent (safe to run multiple times)
5. ✅ Backward compatible

**Approach:**
- Detect string prompts during initialization
- Convert strings → versioned objects
- Mark as customized if different from default
- Add to version history

### 4.2 Migration Detection

**File:** `promptMigration.js`

```javascript
import { get_settings, set_settings, log, SUBSYSTEM } from './index.js';
import { createVersionedPromptFromString, getLatestVersion } from './promptVersionRegistry.js';
import * as defaultPrompts from './defaultPrompts.js';

const VERSIONABLE_PROMPTS = [
  'scene_recap_prompt',
  'scene_recap_error_detection_prompt',
  'auto_scene_break_prompt',
  'running_scene_recap_prompt',
  'auto_lorebooks_recap_merge_prompt',
  'auto_lorebooks_recap_lorebook_entry_lookup_prompt',
  'auto_lorebooks_recap_lorebook_entry_deduplicate_prompt',
  'auto_lorebooks_bulk_populate_prompt'
];

/**
 * Check if a value is a legacy string prompt (needs migration)
 * @param {any} value
 * @returns {boolean}
 */
function isLegacyStringPrompt(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if any prompts need migration to versioned format
 * @returns {boolean}
 */
export function needsPromptMigration() {
  // Check all profiles
  const profiles = get_settings('profiles');
  for (const [profileName, profileSettings] of Object.entries(profiles)) {
    for (const promptKey of VERSIONABLE_PROMPTS) {
      if (isLegacyStringPrompt(profileSettings[promptKey])) {
        log(SUBSYSTEM.SETTINGS, `Migration needed: ${promptKey} in profile "${profileName}"`);
        return true;
      }
    }
  }

  log(SUBSYSTEM.SETTINGS, 'No prompt migration needed');
  return false;
}
```

### 4.3 Migration Execution

```javascript
/**
 * Migrate all string prompts to versioned objects
 * @returns {Promise<boolean>} - true if migration performed
 */
export async function migratePromptsToVersioned() {
  log(SUBSYSTEM.SETTINGS, '=== Starting Prompt Versioning Migration ===');
  let migrated = false;

  // Migrate all profiles
  const profiles = get_settings('profiles');

  for (const [profileName, profileSettings] of Object.entries(profiles)) {
    log(SUBSYSTEM.SETTINGS, `Checking profile: "${profileName}"`);

    for (const promptKey of VERSIONABLE_PROMPTS) {
      const currentValue = profileSettings[promptKey];

      if (isLegacyStringPrompt(currentValue)) {
        log(SUBSYSTEM.SETTINGS, `  Migrating: ${promptKey}`);

        // Get the default value for comparison
        const defaultValue = defaultPrompts[promptKey];
        const isCustomized = currentValue !== defaultValue;

        // Create versioned prompt from string
        const versionedPrompt = createVersionedPromptFromString(
          promptKey,
          currentValue,
          getLatestVersion(promptKey),
          isCustomized
        );

        // Mark as customized if different from default
        if (isCustomized) {
          versionedPrompt.userModified = true;
          versionedPrompt.lastModifiedTimestamp = Date.now();
          versionedPrompt.customVersionLabel = 'Migrated from v1.x';

          // Add custom version to history
          versionedPrompt.versionHistory.unshift({
            version: `${versionedPrompt.currentVersion}-migrated`,
            content: currentValue,
            timestamp: Date.now(),
            changelog: 'Migrated user customization from v1.x',
            isDefault: false
          });

          log(SUBSYSTEM.SETTINGS, `    ✓ Migrated as CUSTOMIZED`);
        } else {
          log(SUBSYSTEM.SETTINGS, `    ✓ Migrated as DEFAULT`);
        }

        // Replace string with versioned object
        profileSettings[promptKey] = versionedPrompt;
        migrated = true;
      }
    }
  }

  if (migrated) {
    // Save migrated profiles
    set_settings('profiles', profiles);
    log(SUBSYSTEM.SETTINGS, '=== Prompt Versioning Migration Complete ===');
  } else {
    log(SUBSYSTEM.SETTINGS, '=== No Migration Needed ===');
  }

  return migrated;
}
```

### 4.4 Migration Timing

Add to extension initialization:

```javascript
// In eventHandlers.js or index.js initialization

async function initializeExtension() {
  // Initialize settings
  initialize_settings();
  initializeAutoLorebooksGlobalSettings();
  load_profile();

  // EXISTING: Migrate connection profiles
  if (needsMigration()) {
    await migrateConnectionProfileSettings();
  }

  // NEW: Migrate prompts to versioned
  if (needsPromptMigration()) {
    await migratePromptsToVersioned();

    // Save after migration
    saveSettingsDebounced();
  }

  // Continue with rest of initialization...
}
```

### 4.5 Migration Safety

**Idempotent Design:**
```javascript
// Migration can be run multiple times safely
if (isLegacyStringPrompt(value)) {
  // Only migrate if still a string
  // Already migrated prompts are objects, skipped
}
```

**Validation:**
```javascript
function isValidVersionedPrompt(obj) {
  return obj &&
         typeof obj === 'object' &&
         typeof obj.id === 'string' &&
         typeof obj.content === 'string' &&
         typeof obj.currentVersion === 'string';
}

// Before using any prompt, validate it
if (!isValidVersionedPrompt(prompt)) {
  // Fall back to default
  prompt = getDefaultPrompt(promptId);
}
```

**Rollback:**
```javascript
// Users can export profiles before migration
// If issues occur, can import old profile and re-migrate
```

---

## 5. Update Workflow

### 5.1 Version Registry

**File:** `promptVersionRegistry.js`

```javascript
/**
 * Central registry of all prompt versions
 * Tracks version history and changelogs
 */
export const PROMPT_VERSIONS = {
  scene_recap_prompt: {
    latest: '2.1.0',
    versions: {
      '2.1.0': {
        timestamp: 1699564800000,
        changelog: 'Added explicit content handling improvements and better JSON extraction'
      },
      '2.0.0': {
        timestamp: 1699478400000,
        changelog: 'Initial versioned release with improved structure'
      },
      '1.0.0': {
        timestamp: 1690000000000,
        changelog: 'Legacy version (pre-versioning)'
      }
    }
  },

  auto_scene_break_prompt: {
    latest: '1.2.0',
    versions: {
      '1.2.0': {
        timestamp: 1699564800000,
        changelog: 'Improved scene boundary detection with context awareness'
      },
      '1.1.0': {
        timestamp: 1699478400000,
        changelog: 'Added support for dialogue-based scene breaks'
      },
      '1.0.0': {
        timestamp: 1690000000000,
        changelog: 'Initial version'
      }
    }
  },

  running_scene_recap_prompt: {
    latest: '1.1.0',
    versions: {
      '1.1.0': {
        timestamp: 1699564800000,
        changelog: 'Enhanced narrative coherence and continuity tracking'
      },
      '1.0.0': {
        timestamp: 1690000000000,
        changelog: 'Initial version'
      }
    }
  }

  // ... all other prompts
};

/**
 * Get the latest version number for a prompt
 * @param {string} promptId
 * @returns {string} - Semantic version (e.g., "2.1.0")
 */
export function getLatestVersion(promptId) {
  return PROMPT_VERSIONS[promptId]?.latest || '1.0.0';
}

/**
 * Get version metadata
 * @param {string} promptId
 * @param {string} version
 * @returns {Object|null}
 */
export function getVersionMetadata(promptId, version) {
  return PROMPT_VERSIONS[promptId]?.versions[version] || null;
}

/**
 * Get full version history for a prompt
 * @param {string} promptId
 * @returns {Array} - [{version, timestamp, changelog}, ...]
 */
export function getVersionHistory(promptId) {
  const versions = PROMPT_VERSIONS[promptId]?.versions || {};
  return Object.entries(versions)
    .map(([version, meta]) => ({
      version,
      ...meta
    }))
    .sort((a, b) => b.timestamp - a.timestamp); // Newest first
}
```

### 5.2 Update Detection

```javascript
/**
 * Check if a versioned prompt has updates available
 * @param {VersionedPrompt} prompt
 * @returns {boolean}
 */
export function hasUpdateAvailable(prompt) {
  if (!prompt || !prompt.id) return false;

  const latestVersion = getLatestVersion(prompt.id);
  const currentVersion = prompt.currentVersion;

  // Use semantic versioning comparison
  return compareVersions(latestVersion, currentVersion) > 0;
}

/**
 * Compare two semantic version strings
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
 * Get detailed update information
 * @param {VersionedPrompt} prompt
 * @returns {Object|null} - Update info or null if no update
 */
export function getUpdateInfo(prompt) {
  if (!hasUpdateAvailable(prompt)) return null;

  const latestVersion = getLatestVersion(prompt.id);
  const latestMeta = getVersionMetadata(prompt.id, latestVersion);
  const defaultPrompt = getDefaultPrompt(prompt.id);

  return {
    currentVersion: prompt.currentVersion,
    latestVersion: latestVersion,
    changelog: latestMeta?.changelog || 'No changelog available',
    timestamp: latestMeta?.timestamp,
    newContent: defaultPrompt.content,
    currentContent: prompt.content,
    canAutoUpdate: !prompt.userModified,
    requiresManualReview: prompt.userModified,
    isDismissed: prompt.updateDismissed && prompt.updateDismissedVersion === latestVersion
  };
}
```

### 5.3 Update Application

**File:** `promptUpdate.js`

```javascript
import { get_settings, set_settings, toast } from './index.js';
import { resolvePrompt, getPromptSource } from './promptResolution.js';
import { getDefaultPrompt } from './promptVersionRegistry.js';

/**
 * Apply an update to a prompt
 * @param {string} promptId
 * @param {string} updateMode - 'replace'|'merge'|'dismiss'
 * @returns {Promise<boolean>} - true if successful
 */
export async function applyPromptUpdate(promptId, updateMode) {
  const source = getPromptSource(promptId);
  const currentPrompt = resolvePrompt(promptId);
  const latestDefault = getDefaultPrompt(promptId);

  if (updateMode === 'replace') {
    // Replace with latest default (discards user customizations)
    const updated = structuredClone(latestDefault);
    updated.userModified = false;
    updated.updateDismissed = false;
    updated.updateDismissedVersion = null;

    savePromptToSource(promptId, updated, source);
    toast(`Updated "${promptId}" to v${updated.currentVersion}`, 'success');
    return true;

  } else if (updateMode === 'merge') {
    // Keep user customizations, update version metadata only
    const merged = structuredClone(currentPrompt);
    merged.latestDefaultVersion = latestDefault.currentVersion;
    merged.hasUpdate = false;
    merged.updateDismissed = false;

    // Add entry to version history (user kept their version)
    merged.versionHistory.unshift({
      version: `${latestDefault.currentVersion}-kept-custom`,
      content: merged.content,
      timestamp: Date.now(),
      changelog: `Acknowledged update to v${latestDefault.currentVersion}, kept customizations`,
      isDefault: false
    });

    savePromptToSource(promptId, merged, source);
    toast(`Acknowledged update, kept your customizations`, 'info');
    return true;

  } else if (updateMode === 'dismiss') {
    // Dismiss update notification
    const dismissed = structuredClone(currentPrompt);
    dismissed.updateDismissed = true;
    dismissed.updateDismissedVersion = latestDefault.currentVersion;
    dismissed.hasUpdate = false;

    savePromptToSource(promptId, dismissed, source);
    toast('Update notification dismissed', 'info');
    return true;
  }

  return false;
}

/**
 * Save a prompt to its current source location
 * @param {string} promptId
 * @param {VersionedPrompt} prompt
 * @param {Object} source - From getPromptSource()
 */
function savePromptToSource(promptId, prompt, source) {
  if (source.source === 'chat') {
    const chatStickies = get_settings('chat_sticky_prompts') || {};
    if (!chatStickies[source.identifier]) {
      chatStickies[source.identifier] = {};
    }
    chatStickies[source.identifier][promptId] = prompt;
    set_settings('chat_sticky_prompts', chatStickies);

  } else if (source.source === 'character') {
    const characterStickies = get_settings('character_sticky_prompts') || {};
    if (!characterStickies[source.identifier]) {
      characterStickies[source.identifier] = {};
    }
    characterStickies[source.identifier][promptId] = prompt;
    set_settings('character_sticky_prompts', characterStickies);

  } else {
    // Save to profile
    set_settings(promptId, prompt);
  }

  saveSettingsDebounced();
}
```

### 5.4 Bulk Update Check

Check all prompts on extension load:

```javascript
/**
 * Check all prompts for available updates
 * @returns {Array} - Array of prompts with updates
 */
export function checkAllPromptsForUpdates() {
  const updates = [];

  for (const promptId of VERSIONABLE_PROMPTS) {
    const prompt = resolvePrompt(promptId);
    const updateInfo = getUpdateInfo(prompt);

    if (updateInfo && !updateInfo.isDismissed) {
      updates.push({
        promptId,
        ...updateInfo
      });
    }
  }

  return updates;
}

/**
 * Show update notification if updates are available
 * Called during extension initialization
 */
export async function notifyPromptUpdates() {
  const updates = checkAllPromptsForUpdates();

  if (updates.length === 0) return;

  // Show badge/notification
  const count = updates.length;
  const message = count === 1
    ? '1 prompt update available'
    : `${count} prompt updates available`;

  toast(message, 'info', {
    timeout: 5000,
    onclick: () => showPromptUpdateModal(updates)
  });
}
```

---

## 6. UI Design

### 6.1 Enhanced Prompt Editor

Replace simple textareas with enhanced editors showing version info and sticky status.

**HTML Structure:**

```html
<!-- In settingsUI.js -->
<div class="prompt-editor-container" data-prompt-id="scene_recap_prompt">
  <!-- Header with badges and controls -->
  <div class="prompt-editor-header">
    <label class="prompt-label">Scene Recap Prompt</label>

    <div class="prompt-badges">
      <!-- Source badge: shows where prompt comes from -->
      <span class="prompt-source-badge badge-chat" title="This prompt is stickied to the current chat">
        <i class="fa fa-comments"></i> Chat Sticky
      </span>

      <!-- Version badge: shows current version and update status -->
      <span class="prompt-version-badge badge-update-available" title="Update available: v2.0.0 → v2.1.0">
        <i class="fa fa-code-branch"></i> v2.0.0
        <i class="fa fa-arrow-up update-icon"></i>
      </span>

      <!-- Customization badge: shows if user modified -->
      <span class="prompt-custom-badge" title="You have customized this prompt" style="display:none;">
        <i class="fa fa-edit"></i> Customized
      </span>
    </div>

    <div class="prompt-controls">
      <!-- Sticky button: pin to character/chat -->
      <button class="prompt-sticky-btn icon-button" title="Sticky to character or chat">
        <i class="fa fa-thumbtack"></i>
      </button>

      <!-- Version history button -->
      <button class="prompt-history-btn icon-button" title="View version history">
        <i class="fa fa-history"></i>
      </button>

      <!-- Edit button (opens modal for large prompts) -->
      <button class="prompt-edit-btn icon-button" title="Edit prompt">
        <i class="fa fa-pencil"></i>
      </button>
    </div>
  </div>

  <!-- Textarea for prompt content -->
  <textarea
    id="scene_recap_prompt"
    class="prompt-textarea"
    rows="8"
    placeholder="Prompt content..."
  ></textarea>

  <!-- Footer with actions -->
  <div class="prompt-editor-footer">
    <button class="prompt-reset-btn secondary-button">
      <i class="fa fa-undo"></i> Reset to Default
    </button>

    <!-- Update button (shown when update available) -->
    <button class="prompt-update-btn primary-button" style="display:none;">
      <i class="fa fa-arrow-up"></i> Apply Update (v2.1.0)
    </button>

    <!-- Comparison button (shown when customized + update available) -->
    <button class="prompt-compare-btn secondary-button" style="display:none;">
      <i class="fa fa-columns"></i> Compare with Default
    </button>
  </div>
</div>
```

**CSS Styling:**

```css
/* promptEditor.css */

.prompt-editor-container {
  margin-bottom: 20px;
  border: 1px solid var(--SmartThemeBorderColor);
  border-radius: 8px;
  padding: 12px;
  background: var(--SmartThemeBlurTintColor);
}

.prompt-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}

.prompt-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--SmartThemeBodyColor);
}

.prompt-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.prompt-source-badge,
.prompt-version-badge,
.prompt-custom-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.badge-chat {
  background: #3498db;
  color: white;
}

.badge-character {
  background: #9b59b6;
  color: white;
}

.badge-profile {
  background: #95a5a6;
  color: white;
}

.badge-default {
  background: #34495e;
  color: white;
}

.badge-update-available {
  background: #e67e22;
  color: white;
}

.badge-latest {
  background: #27ae60;
  color: white;
}

.prompt-custom-badge {
  background: #f39c12;
  color: white;
}

.update-icon {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.prompt-controls {
  display: flex;
  gap: 4px;
}

.icon-button {
  padding: 6px 10px;
  border: 1px solid var(--SmartThemeBorderColor);
  background: var(--SmartThemeBlurTintColor);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-button:hover {
  background: var(--SmartThemeQuotesColor);
  transform: translateY(-1px);
}

.prompt-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--SmartThemeBorderColor);
  border-radius: 4px;
  background: var(--black50a);
  color: var(--SmartThemeBodyColor);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  resize: vertical;
}

.prompt-editor-footer {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.primary-button,
.secondary-button {
  padding: 6px 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.primary-button {
  background: #3498db;
  color: white;
}

.primary-button:hover {
  background: #2980b9;
  transform: translateY(-1px);
}

.secondary-button {
  background: var(--SmartThemeBlurTintColor);
  border: 1px solid var(--SmartThemeBorderColor);
  color: var(--SmartThemeBodyColor);
}

.secondary-button:hover {
  background: var(--SmartThemeQuotesColor);
  transform: translateY(-1px);
}
```

### 6.2 Sticky Menu

Context menu when clicking thumbtack button:

```javascript
// promptStickyUI.js

import { get_current_character_identifier, get_current_chat_identifier } from './index.js';
import { getPromptSource, resolvePrompt } from './promptResolution.js';

/**
 * Show sticky menu for a prompt
 * @param {string} promptId
 * @param {HTMLElement} buttonElement
 */
export function showStickyMenu(promptId, buttonElement) {
  const characterKey = get_current_character_identifier();
  const chatId = get_current_chat_identifier();
  const source = getPromptSource(promptId);

  const menuItems = [
    {
      id: 'sticky-character',
      label: `Sticky to Character`,
      sublabel: characterKey || 'No character selected',
      icon: 'fa-user',
      enabled: !!characterKey,
      active: source.source === 'character',
      action: () => stickyToCharacter(promptId)
    },
    {
      id: 'sticky-chat',
      label: `Sticky to Chat`,
      sublabel: chatId ? `Chat ID: ${chatId.substring(0, 20)}...` : 'No chat selected',
      icon: 'fa-comments',
      enabled: !!chatId,
      active: source.source === 'chat',
      action: () => stickyToChat(promptId)
    },
    {
      id: 'divider',
      type: 'divider'
    },
    {
      id: 'remove-sticky',
      label: 'Remove Sticky',
      icon: 'fa-times',
      enabled: source.isSticky,
      action: () => removeSticky(promptId)
    },
    {
      id: 'view-all-stickies',
      label: 'Manage All Stickies...',
      icon: 'fa-list',
      action: () => showStickyManagementUI()
    }
  ];

  // Show context menu at button position
  showContextMenu(menuItems, buttonElement);
}

/**
 * Sticky a prompt to the current character
 * @param {string} promptId
 */
function stickyToCharacter(promptId) {
  const characterKey = get_current_character_identifier();
  if (!characterKey) {
    toast('No character selected', 'error');
    return;
  }

  // Get current resolved prompt
  const currentPrompt = resolvePrompt(promptId);

  // Clone it for character sticky
  const stickyPrompt = structuredClone(currentPrompt);

  // Save to character stickies
  const characterStickies = get_settings('character_sticky_prompts') || {};
  if (!characterStickies[characterKey]) {
    characterStickies[characterKey] = {};
  }
  characterStickies[characterKey][promptId] = stickyPrompt;
  set_settings('character_sticky_prompts', characterStickies);

  toast(`Prompt stickied to character: ${characterKey}`, 'success');
  refresh_settings();
}

/**
 * Sticky a prompt to the current chat
 * @param {string} promptId
 */
function stickyToChat(promptId) {
  const chatId = get_current_chat_identifier();
  if (!chatId) {
    toast('No chat selected', 'error');
    return;
  }

  // Get current resolved prompt
  const currentPrompt = resolvePrompt(promptId);

  // Clone it for chat sticky
  const stickyPrompt = structuredClone(currentPrompt);

  // Save to chat stickies
  const chatStickies = get_settings('chat_sticky_prompts') || {};
  if (!chatStickies[chatId]) {
    chatStickies[chatId] = {};
  }
  chatStickies[chatId][promptId] = stickyPrompt;
  set_settings('chat_sticky_prompts', chatStickies);

  toast(`Prompt stickied to chat: ${chatId}`, 'success');
  refresh_settings();
}

/**
 * Remove sticky for a prompt
 * @param {string} promptId
 */
function removeSticky(promptId) {
  const source = getPromptSource(promptId);

  if (source.source === 'character') {
    const characterStickies = get_settings('character_sticky_prompts') || {};
    if (characterStickies[source.identifier]) {
      delete characterStickies[source.identifier][promptId];

      // Clean up empty character entry
      if (Object.keys(characterStickies[source.identifier]).length === 0) {
        delete characterStickies[source.identifier];
      }
    }
    set_settings('character_sticky_prompts', characterStickies);
    toast('Character sticky removed', 'success');

  } else if (source.source === 'chat') {
    const chatStickies = get_settings('chat_sticky_prompts') || {};
    if (chatStickies[source.identifier]) {
      delete chatStickies[source.identifier][promptId];

      // Clean up empty chat entry
      if (Object.keys(chatStickies[source.identifier]).length === 0) {
        delete chatStickies[source.identifier];
      }
    }
    set_settings('chat_sticky_prompts', chatStickies);
    toast('Chat sticky removed', 'success');
  }

  refresh_settings();
}
```

### 6.3 Version History Modal

Modal showing version history with restore capability:

```html
<!-- promptVersionModal.html -->
<div id="prompt-version-modal" class="modal fade">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">
          <i class="fa fa-history"></i>
          Version History: <span id="prompt-version-title"></span>
        </h4>
        <button type="button" class="close" data-dismiss="modal">&times;</button>
      </div>

      <div class="modal-body">
        <div id="version-history-list">
          <!-- Populated dynamically -->
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>

<!-- Template for version entry -->
<template id="version-entry-template">
  <div class="version-entry">
    <div class="version-header">
      <div class="version-info">
        <span class="version-number"></span>
        <span class="version-date"></span>
      </div>
      <div class="version-badges">
        <!-- Badges: Current, Default, Custom -->
      </div>
    </div>

    <div class="version-changelog">
      <!-- Changelog text -->
    </div>

    <div class="version-preview">
      <button class="toggle-preview-btn">
        <i class="fa fa-eye"></i> Show Content
      </button>
      <pre class="version-content" style="display:none;"></pre>
    </div>

    <div class="version-actions">
      <button class="restore-version-btn">
        <i class="fa fa-undo"></i> Restore This Version
      </button>
      <button class="compare-version-btn">
        <i class="fa fa-columns"></i> Compare with Current
      </button>
    </div>
  </div>
</template>
```

**JavaScript:**

```javascript
// promptVersionModal.js

/**
 * Show version history modal for a prompt
 * @param {string} promptId
 */
export function showVersionHistoryModal(promptId) {
  const prompt = resolvePrompt(promptId);
  const modal = $('#prompt-version-modal');

  // Set title
  $('#prompt-version-title').text(promptId);

  // Clear existing content
  $('#version-history-list').empty();

  // Populate version history
  for (const historyEntry of prompt.versionHistory) {
    const entry = createVersionEntry(historyEntry, prompt.currentVersion);
    $('#version-history-list').append(entry);
  }

  // Show modal
  modal.modal('show');
}

/**
 * Create a version entry element
 * @param {Object} historyEntry
 * @param {string} currentVersion
 * @returns {jQuery}
 */
function createVersionEntry(historyEntry, currentVersion) {
  const template = $('#version-entry-template').html();
  const $entry = $(template);

  // Version number
  $entry.find('.version-number').text(`v${historyEntry.version}`);

  // Date
  const date = new Date(historyEntry.timestamp);
  $entry.find('.version-date').text(date.toLocaleDateString());

  // Badges
  const badges = [];
  if (historyEntry.version === currentVersion) {
    badges.push('<span class="badge badge-primary">Current</span>');
  }
  if (historyEntry.isDefault) {
    badges.push('<span class="badge badge-success">Default</span>');
  } else {
    badges.push('<span class="badge badge-warning">Custom</span>');
  }
  $entry.find('.version-badges').html(badges.join(' '));

  // Changelog
  $entry.find('.version-changelog').text(historyEntry.changelog);

  // Content preview
  $entry.find('.version-content').text(historyEntry.content);

  // Toggle preview
  $entry.find('.toggle-preview-btn').on('click', function() {
    const $content = $entry.find('.version-content');
    $content.toggle();
    $(this).find('i').toggleClass('fa-eye fa-eye-slash');
  });

  // Restore button
  $entry.find('.restore-version-btn').on('click', function() {
    restoreVersion(promptId, historyEntry);
  });

  // Compare button
  $entry.find('.compare-version-btn').on('click', function() {
    compareVersions(promptId, currentVersion, historyEntry.version);
  });

  return $entry;
}
```

### 6.4 Update Notification Modal

Modal showing all available updates:

```html
<!-- promptUpdateModal.html -->
<div id="prompt-update-modal" class="modal fade">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h4 class="modal-title">
          <i class="fa fa-arrow-up"></i>
          Prompt Updates Available
        </h4>
        <button type="button" class="close" data-dismiss="modal">&times;</button>
      </div>

      <div class="modal-body">
        <p class="update-summary">
          <strong id="update-count"></strong> prompt(s) have new versions available.
        </p>

        <div id="update-list">
          <!-- Populated dynamically -->
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="dismiss-all-updates">
          Dismiss All
        </button>
        <button type="button" class="btn btn-primary" id="update-all-non-customized">
          Update All Non-Customized
        </button>
        <button type="button" class="btn btn-secondary" data-dismiss="modal">
          Close
        </button>
      </div>
    </div>
  </div>
</div>

<!-- Template for update entry -->
<template id="update-entry-template">
  <div class="update-entry">
    <div class="update-header">
      <h5 class="update-prompt-name"></h5>
      <div class="update-version-info">
        <span class="update-current-version"></span>
        <i class="fa fa-arrow-right"></i>
        <span class="update-new-version"></span>
      </div>
    </div>

    <div class="update-changelog">
      <!-- Changelog -->
    </div>

    <div class="update-warning" style="display:none;">
      <i class="fa fa-exclamation-triangle"></i>
      You have customized this prompt. Updating will discard your changes.
    </div>

    <div class="update-actions">
      <button class="btn btn-primary update-replace-btn">
        <i class="fa fa-download"></i> Update (Replace)
      </button>
      <button class="btn btn-secondary update-merge-btn">
        <i class="fa fa-code-branch"></i> Keep Custom (Acknowledge)
      </button>
      <button class="btn btn-secondary update-compare-btn">
        <i class="fa fa-columns"></i> Compare Changes
      </button>
      <button class="btn btn-light update-dismiss-btn">
        <i class="fa fa-times"></i> Dismiss
      </button>
    </div>
  </div>
</template>
```

### 6.5 Sticky Management UI

Section in settings to view/manage all stickies:

```html
<!-- In settingsUI.js -->
<div id="sticky-prompts-section" class="settings-section">
  <h3>
    <i class="fa fa-thumbtack"></i>
    Sticky Prompt Overrides
  </h3>

  <p class="section-description">
    Sticky prompts override the default profile prompts for specific characters or chats.
    <br>
    <strong>Priority:</strong> Chat Sticky > Character Sticky > Profile > Default
  </p>

  <!-- Character Stickies -->
  <div class="sticky-category">
    <h4>
      <i class="fa fa-user"></i>
      Character Stickies
      <span class="sticky-count badge badge-secondary" id="character-sticky-count">0</span>
    </h4>

    <div id="character-stickies-list" class="sticky-list">
      <!-- Populated dynamically -->
      <div class="empty-state" style="display:none;">
        <i class="fa fa-info-circle"></i>
        No character-specific prompts. Use the thumbtack icon next to any prompt to sticky it.
      </div>
    </div>
  </div>

  <!-- Chat Stickies -->
  <div class="sticky-category">
    <h4>
      <i class="fa fa-comments"></i>
      Chat Stickies
      <span class="sticky-count badge badge-secondary" id="chat-sticky-count">0</span>
    </h4>

    <div id="chat-stickies-list" class="sticky-list">
      <!-- Populated dynamically -->
      <div class="empty-state" style="display:none;">
        <i class="fa fa-info-circle"></i>
        No chat-specific prompts. Use the thumbtack icon next to any prompt to sticky it.
      </div>
    </div>
  </div>
</div>

<!-- Template for sticky entry -->
<template id="sticky-entry-template">
  <div class="sticky-entry">
    <div class="sticky-info">
      <span class="sticky-target">
        <!-- Character name or chat ID -->
      </span>
      <i class="fa fa-arrow-right"></i>
      <span class="sticky-prompt-name">
        <!-- Prompt ID -->
      </span>
      <span class="sticky-version badge">
        <!-- Version -->
      </span>
    </div>

    <div class="sticky-actions">
      <button class="btn btn-sm btn-secondary sticky-edit-btn">
        <i class="fa fa-pencil"></i> Edit
      </button>
      <button class="btn btn-sm btn-danger sticky-remove-btn">
        <i class="fa fa-trash"></i> Remove
      </button>
    </div>
  </div>
</template>
```

---

## 7. Code Examples

### 7.1 Using Prompts in Code

**Before (v1.x):**

```javascript
// Old way: direct settings access
const prompt = get_settings('scene_recap_prompt');
const result = await generateRaw(prompt, prefill, ...);
```

**After (v2.x):**

```javascript
// New way: use resolution
import { getPromptText } from './promptResolution.js';

const promptText = getPromptText('scene_recap_prompt');
const result = await generateRaw(promptText, prefill, ...);
```

### 7.2 Saving Custom Prompts

When user edits a prompt in the UI:

```javascript
// promptEditor.js

/**
 * Handle user editing a prompt
 * @param {string} promptId
 * @param {string} newContent - New prompt text
 */
function handlePromptEdit(promptId, newContent) {
  const source = getPromptSource(promptId);
  const currentPrompt = resolvePrompt(promptId);

  // Check if content actually changed
  if (currentPrompt.content === newContent) {
    toast('No changes made', 'info');
    return;
  }

  // Create updated version
  const updatedPrompt = structuredClone(currentPrompt);
  updatedPrompt.content = newContent;
  updatedPrompt.userModified = true;
  updatedPrompt.lastModifiedTimestamp = Date.now();

  // Generate new version number
  const customVersion = `${updatedPrompt.currentVersion}-custom-${Date.now()}`;
  updatedPrompt.currentVersion = customVersion;

  // Add to version history
  updatedPrompt.versionHistory.unshift({
    version: customVersion,
    content: newContent,
    timestamp: Date.now(),
    changelog: 'User edit',
    isDefault: false
  });

  // Save to appropriate location based on source
  savePromptToSource(promptId, updatedPrompt, source);

  toast('Prompt saved', 'success');
  refresh_settings();
}
```

### 7.3 Creating Default Prompts

When adding a new prompt to the extension:

**1. Add to `defaultPrompts.js`:**

```javascript
// defaultPrompts.js

export const my_new_feature_prompt = `
You are an AI assistant helping to process messages.

Task: [Your task description]

Output format: JSON
{
  "result": "..."
}
`.trim();
```

**2. Add to `defaultSettings.js`:**

```javascript
// defaultSettings.js

import { my_new_feature_prompt } from './defaultPrompts.js';

export const default_settings = {
  // ... existing settings

  my_new_feature_prompt: my_new_feature_prompt,
  my_new_feature_prefill: JSON_EXTRACTION_PREFILL,
  my_new_feature_connection_profile: '',
  my_new_feature_completion_preset_name: ''
};
```

**3. Add to version registry:**

```javascript
// promptVersionRegistry.js

export const PROMPT_VERSIONS = {
  // ... existing prompts

  my_new_feature_prompt: {
    latest: '1.0.0',
    versions: {
      '1.0.0': {
        timestamp: Date.now(),
        changelog: 'Initial release of new feature prompt'
      }
    }
  }
};
```

**4. Add to migration list:**

```javascript
// promptMigration.js

const VERSIONABLE_PROMPTS = [
  // ... existing prompts
  'my_new_feature_prompt'
];
```

### 7.4 Checking for Updates

In application code:

```javascript
// Example: Show update badge on settings icon

import { checkAllPromptsForUpdates } from './promptUpdate.js';

function updateSettingsBadge() {
  const updates = checkAllPromptsForUpdates();

  if (updates.length > 0) {
    $('#settings-icon .badge').text(updates.length).show();
  } else {
    $('#settings-icon .badge').hide();
  }
}

// Call on extension load and when settings change
$(document).ready(() => {
  updateSettingsBadge();
});
```

---

## 8. Edge Cases

### 8.1 Character Deleted But Has Stickies

**Scenario:** User deletes a character, but character_sticky_prompts still has entries

**Behavior:**
- Stickies remain in storage
- Inactive until character is re-added or identifier reused
- No errors or warnings

**Cleanup Option:**
```javascript
// Optional cleanup function (can be called manually)
function cleanupOrphanedCharacterStickies() {
  const characterStickies = get_settings('character_sticky_prompts') || {};
  const activeCharacters = getActiveCharacterList(); // From ST API

  let cleaned = 0;
  for (const characterKey of Object.keys(characterStickies)) {
    if (!activeCharacters.includes(characterKey)) {
      delete characterStickies[characterKey];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    set_settings('character_sticky_prompts', characterStickies);
    toast(`Cleaned up ${cleaned} orphaned character sticky mapping(s)`, 'info');
  }
}
```

### 8.2 Chat Deleted With Stickies

**Scenario:** User deletes a chat that has sticky prompts

**Behavior:**
- Hook into SillyTavern's chat delete event
- Auto-cleanup chat stickies

```javascript
// In eventHandlers.js

eventSource.on(event_types.CHAT_DELETED, (chatId) => {
  const chatStickies = get_settings('chat_sticky_prompts') || {};

  if (chatStickies[chatId]) {
    delete chatStickies[chatId];
    set_settings('chat_sticky_prompts', chatStickies);
    log(SUBSYSTEM.SETTINGS, `Cleaned up sticky prompts for deleted chat: ${chatId}`);
  }
});
```

### 8.3 Profile Export/Import With Stickies

**Scenario:** User exports a profile, should stickies be included?

**Design Decision:**
- Profiles do NOT include character/chat stickies (those are global)
- Profiles include only the prompts defined in that profile
- Stickies stay in global settings, survive profile changes

**Import Behavior:**
```javascript
// When importing a profile, stickies are NOT imported
// User can manually sticky prompts after import if desired
```

### 8.4 Update Dismissed Then New Version Released

**Scenario:** User dismissed update to v2.1.0, then developer releases v2.2.0

**Behavior:**
- Reset `updateDismissed` if `updateDismissedVersion !== latestVersion`

```javascript
export function hasUpdateAvailable(prompt) {
  const latestVersion = getLatestVersion(prompt.id);

  // If user dismissed v2.1.0 but we're now on v2.2.0, show update again
  if (prompt.updateDismissed && prompt.updateDismissedVersion !== latestVersion) {
    return true;
  }

  return compareVersions(latestVersion, prompt.currentVersion) > 0;
}
```

### 8.5 Concurrent Edits (Profile + Sticky)

**Scenario:** User edits prompt in profile, then stickies it to character with different content

**Behavior:**
- Both versions exist independently
- Sticky takes precedence when that character is active
- Profile version remains for other characters

**No Conflict:** This is expected behavior, not an error.

### 8.6 Malformed Versioned Prompt

**Scenario:** Corrupted settings.json or manual edit breaks prompt structure

**Behavior:**
- Validation function detects invalid structure
- Falls back to default prompt
- Log warning

```javascript
export function resolvePrompt(promptId) {
  // ... resolution logic

  // Validate before returning
  if (!isValidVersionedPrompt(resolved)) {
    error(`Invalid versioned prompt structure for ${promptId}, falling back to default`);
    return getDefaultPrompt(promptId);
  }

  return resolved;
}
```

### 8.7 Version Comparison Edge Cases

**Scenario:** Non-standard version formats (e.g., "2.1.0-custom-12345")

**Behavior:**
- Extract major.minor.patch from version string
- Ignore suffixes for comparison
- Suffixes preserved in version history

```javascript
function compareVersions(v1, v2) {
  // Extract major.minor.patch (ignore suffixes)
  const clean1 = v1.split('-')[0];
  const clean2 = v2.split('-')[0];

  const parts1 = clean1.split('.').map(Number);
  const parts2 = clean2.split('.').map(Number);

  // Compare numerically
  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}
```

---

## 9. Performance

### 9.1 Lazy Loading Version History

Don't load full version history until user requests it:

```javascript
// Only load minimal data by default
const prompt = {
  id: 'scene_recap_prompt',
  currentVersion: '2.1.0',
  content: "...",
  versionHistory: null,  // Not loaded yet
  // ...
};

// Load on demand
async function loadVersionHistory(promptId) {
  const prompt = resolvePrompt(promptId);

  // Check if already loaded
  if (prompt.versionHistory && prompt.versionHistory.length > 0) {
    return prompt.versionHistory;
  }

  // Load from registry
  const history = buildVersionHistory(promptId);
  prompt.versionHistory = history;

  return history;
}
```

### 9.2 Resolution Caching

Cache resolved prompts per session:

```javascript
// promptResolutionCache.js

const CACHE = new Map();

/**
 * Get cache key for current context
 * @param {string} promptId
 * @returns {string}
 */
function getCacheKey(promptId) {
  const chatId = get_current_chat_identifier() || 'no-chat';
  const charId = get_current_character_identifier() || 'no-char';
  const profileId = get_settings('profile');

  return `${promptId}:${chatId}:${charId}:${profileId}`;
}

/**
 * Resolve prompt with caching
 * @param {string} promptId
 * @returns {VersionedPrompt}
 */
export function resolvePromptCached(promptId) {
  const key = getCacheKey(promptId);

  if (CACHE.has(key)) {
    return CACHE.get(key);
  }

  const resolved = resolvePrompt(promptId);
  CACHE.set(key, resolved);

  return resolved;
}

/**
 * Clear cache when context changes
 */
export function clearPromptCache() {
  CACHE.clear();
}

/**
 * Clear cache for specific prompt
 */
export function clearPromptCacheForId(promptId) {
  for (const key of CACHE.keys()) {
    if (key.startsWith(`${promptId}:`)) {
      CACHE.delete(key);
    }
  }
}

// Hook into events that change context
eventSource.on(event_types.CHAT_CHANGED, clearPromptCache);
eventSource.on(event_types.CHARACTER_CHANGED, clearPromptCache);
// Clear when settings change
$(document).on('auto_recap_settings_changed', clearPromptCache);
```

### 9.3 Debounced Saves

Avoid excessive writes when editing prompts:

```javascript
// Debounce prompt saves (already using saveSettingsDebounced)
import { saveSettingsDebounced } from './settingsManager.js';

function handlePromptTextareaChange(promptId, newContent) {
  // Update in-memory
  const prompt = resolvePrompt(promptId);
  prompt.content = newContent;

  // Debounced save (300ms default)
  saveSettingsDebounced();
}
```

### 9.4 Minimal Storage

Only store what's necessary:

```javascript
// DON'T store full prompt objects for every character/chat
// BAD:
{
  character_sticky_prompts: {
    "alice.png": {
      scene_recap_prompt: { /* FULL versioned prompt */ },
      auto_scene_break_prompt: { /* FULL versioned prompt */ },
      running_scene_recap_prompt: { /* FULL versioned prompt */ },
      // ... all 8 prompts even if only 1 is stickied
    }
  }
}

// DO store only overridden prompts
// GOOD:
{
  character_sticky_prompts: {
    "alice.png": {
      scene_recap_prompt: { /* ONLY THIS ONE */ }
    }
  }
}
```

---

## 10. Testing

### 10.1 Unit Tests

```javascript
// tests/unit/promptResolution.spec.js

import { resolvePrompt, getPromptSource } from '../../promptResolution.js';
import { set_settings } from '../../settingsManager.js';

describe('Prompt Resolution', () => {
  beforeEach(() => {
    // Clear test state
    clearTestSettings();
  });

  test('should resolve chat sticky over character sticky', () => {
    // Setup
    const profilePrompt = createMockPrompt('profile-version');
    const characterPrompt = createMockPrompt('character-version');
    const chatPrompt = createMockPrompt('chat-version');

    set_settings('scene_recap_prompt', profilePrompt);
    set_settings('character_sticky_prompts', {
      'alice.png': { scene_recap_prompt: characterPrompt }
    });
    set_settings('chat_sticky_prompts', {
      'chat-123': { scene_recap_prompt: chatPrompt }
    });

    // Mock context
    mockCurrentCharacter('alice.png');
    mockCurrentChat('chat-123');

    // Execute
    const resolved = resolvePrompt('scene_recap_prompt');

    // Assert
    expect(resolved.content).toBe('chat-version');
  });

  test('should fallback to profile when no stickies', () => {
    const profilePrompt = createMockPrompt('profile-version');
    set_settings('scene_recap_prompt', profilePrompt);

    const resolved = resolvePrompt('scene_recap_prompt');

    expect(resolved.content).toBe('profile-version');
  });

  test('should fallback to default on corrupted prompt', () => {
    set_settings('scene_recap_prompt', { corrupted: 'data' });

    const resolved = resolvePrompt('scene_recap_prompt');

    expect(resolved.id).toBe('scene_recap_prompt');
    expect(resolved.content).toBeTruthy(); // Has default content
  });
});
```

### 10.2 Integration Tests

```javascript
// tests/integration/promptSticky.spec.js

describe('Prompt Stickying', () => {
  test('should sticky prompt to character and persist', async () => {
    // Navigate to settings
    await navigateToSettings();

    // Sticky a prompt to character
    await clickPromptStickyButton('scene_recap_prompt');
    await selectStickyOption('character');

    // Verify sticky created
    const stickies = get_settings('character_sticky_prompts');
    const characterKey = getCurrentCharacter();
    expect(stickies[characterKey]['scene_recap_prompt']).toBeTruthy();

    // Reload extension
    await reloadExtension();

    // Verify sticky persisted
    const stickiesAfterReload = get_settings('character_sticky_prompts');
    expect(stickiesAfterReload[characterKey]['scene_recap_prompt']).toBeTruthy();
  });

  test('should override character sticky with chat sticky', async () => {
    // Create character sticky
    await stickyToCharacter('scene_recap_prompt', 'character-content');

    // Create chat sticky
    await stickyToChat('scene_recap_prompt', 'chat-content');

    // Verify chat sticky wins
    const resolved = resolvePrompt('scene_recap_prompt');
    expect(resolved.content).toBe('chat-content');
  });
});
```

### 10.3 Migration Tests

```javascript
// tests/unit/promptMigration.spec.js

describe('Prompt Migration', () => {
  test('should detect string prompts needing migration', () => {
    set_settings('profiles', {
      'Default': {
        scene_recap_prompt: 'string prompt'  // Legacy format
      }
    });

    expect(needsPromptMigration()).toBe(true);
  });

  test('should migrate string to versioned object', async () => {
    set_settings('profiles', {
      'Default': {
        scene_recap_prompt: 'custom prompt text'
      }
    });

    await migratePromptsToVersioned();

    const profiles = get_settings('profiles');
    const prompt = profiles['Default'].scene_recap_prompt;

    expect(prompt.id).toBe('scene_recap_prompt');
    expect(prompt.content).toBe('custom prompt text');
    expect(prompt.currentVersion).toBeTruthy();
    expect(prompt.userModified).toBe(true); // Custom content
  });

  test('should preserve customization flag during migration', async () => {
    const defaultContent = defaultPrompts.scene_recap_prompt;

    set_settings('profiles', {
      'Default': {
        scene_recap_prompt: defaultContent  // Same as default
      }
    });

    await migratePromptsToVersioned();

    const profiles = get_settings('profiles');
    const prompt = profiles['Default'].scene_recap_prompt;

    expect(prompt.userModified).toBe(false); // Not custom
  });
});
```

### 10.4 Update Detection Tests

```javascript
// tests/unit/promptUpdate.spec.js

describe('Prompt Update Detection', () => {
  test('should detect available updates', () => {
    const oldPrompt = createMockPrompt('old-content', '2.0.0');

    // Mock latest version is 2.1.0
    jest.spyOn(registry, 'getLatestVersion').mockReturnValue('2.1.0');

    expect(hasUpdateAvailable(oldPrompt)).toBe(true);
  });

  test('should not detect update when on latest', () => {
    const latestPrompt = createMockPrompt('content', '2.1.0');

    jest.spyOn(registry, 'getLatestVersion').mockReturnValue('2.1.0');

    expect(hasUpdateAvailable(latestPrompt)).toBe(false);
  });

  test('should respect dismissed updates', () => {
    const prompt = createMockPrompt('content', '2.0.0');
    prompt.updateDismissed = true;
    prompt.updateDismissedVersion = '2.1.0';

    jest.spyOn(registry, 'getLatestVersion').mockReturnValue('2.1.0');

    const updateInfo = getUpdateInfo(prompt);
    expect(updateInfo.isDismissed).toBe(true);
  });
});
```

---

## 11. Backward Compatibility

### 11.1 Reading Old Prompts

The system is fully backward compatible:

**String Prompts (v1.x):**
```javascript
profile.scene_recap_prompt = "You are an AI...";
```

**Automatic Migration:**
- Detected during initialization
- Converted to versioned object automatically
- Zero user intervention required
- Zero data loss

**Fallback on Read:**
```javascript
export function getPromptText(promptId) {
  const prompt = get_settings(promptId);

  // Handle legacy string prompts
  if (typeof prompt === 'string') {
    return prompt;  // Use string directly
  }

  // Handle versioned prompts
  if (prompt && prompt.content) {
    return prompt.content;
  }

  // Fallback to default
  return getDefaultPrompt(promptId).content;
}
```

### 11.2 Write Compatibility

Writing prompts always creates versioned objects:

```javascript
function savePrompt(promptId, content) {
  const versionedPrompt = createVersionedPromptFromString(
    promptId,
    content,
    getLatestVersion(promptId),
    true  // userModified
  );

  set_settings(promptId, versionedPrompt);
}
```

### 11.3 Profile Import/Export Compatibility

**Exporting v2.x Profile:**
- Includes versioned prompts
- Can be imported to v2.x installations

**Importing v1.x Profile:**
- Contains string prompts
- Automatically migrated on import
- Works seamlessly

```javascript
async function import_profile(file) {
  let data = await parseJsonFile(file);

  // Merge with defaults (adds missing settings)
  data = Object.assign(structuredClone(default_settings), data);

  // Migrate string prompts to versioned
  for (const key of VERSIONABLE_PROMPTS) {
    if (typeof data[key] === 'string') {
      data[key] = createVersionedPromptFromString(
        key,
        data[key],
        getLatestVersion(key),
        data[key] !== defaultPrompts[key]
      );
    }
  }

  // Save
  profiles[name] = data;
  set_settings('profiles', profiles);
}
```

### 11.4 Rollback Strategy

If issues arise, users can:

1. **Export current profile** before updating
2. **Restore from version history** within a prompt
3. **Import old profile** and re-migrate
4. **Reset to defaults** and reconfigure

---

## 12. Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1)

**Goal:** Establish data structures and migration

**Tasks:**
1. ✅ Create `promptVersionRegistry.js`
   - Define PROMPT_VERSIONS structure
   - Implement getLatestVersion, getVersionMetadata
   - Add version history for all prompts

2. ✅ Create `promptMigration.js`
   - Implement needsPromptMigration()
   - Implement migratePromptsToVersioned()
   - Add to initialization flow

3. ✅ Create `promptResolution.js`
   - Implement resolvePrompt() with priority chain
   - Implement getPromptText() helper
   - Implement getPromptSource() for UI

4. ✅ Test migration
   - Unit tests for migration detection
   - Unit tests for string → versioned conversion
   - Integration test for initialization

**Deliverable:** String prompts automatically migrate to versioned objects

---

### Phase 2: Resolution & Storage (Week 1-2)

**Goal:** Implement sticky prompt storage and resolution

**Tasks:**
1. ✅ Add storage fields to settings
   - Add character_sticky_prompts
   - Add chat_sticky_prompts
   - Update settings schema

2. ✅ Implement sticky functions
   - stickyToCharacter()
   - stickyToChat()
   - removeSticky()

3. ✅ Test resolution priority
   - Unit tests for priority chain
   - Test chat > character > profile > default

4. ✅ Add event cleanup
   - Hook CHAT_DELETED event
   - Clean up chat stickies on delete

**Deliverable:** Sticky prompts work end-to-end

---

### Phase 3: Update Detection (Week 2)

**Goal:** Detect and notify users of prompt updates

**Tasks:**
1. ✅ Implement update detection
   - hasUpdateAvailable()
   - getUpdateInfo()
   - compareVersions()

2. ✅ Create `promptUpdate.js`
   - applyPromptUpdate()
   - checkAllPromptsForUpdates()
   - notifyPromptUpdates()

3. ✅ Add update notification
   - Call on initialization
   - Show toast with count
   - Link to update modal

4. ✅ Test update detection
   - Unit tests for version comparison
   - Test update info structure

**Deliverable:** Users notified when updates available

---

### Phase 4: UI Components (Week 2-3)

**Goal:** Build user-facing UI for managing prompts

**Tasks:**
1. ✅ Enhanced prompt editor
   - Add badges (source, version, custom)
   - Add buttons (sticky, history, edit)
   - Add footer (reset, update, compare)
   - CSS styling

2. ✅ Sticky menu
   - Context menu component
   - Sticky to character/chat actions
   - Remove sticky action

3. ✅ Version history modal
   - List all versions
   - Show changelog
   - Restore version
   - Compare versions

4. ✅ Update modal
   - List all updates
   - Show changelog for each
   - Update/merge/dismiss actions
   - Bulk actions

5. ✅ Sticky management section
   - List character stickies
   - List chat stickies
   - Edit/remove actions

**Deliverable:** Complete UI for prompt management

---

### Phase 5: Testing & Polish (Week 3-4)

**Goal:** Comprehensive testing and refinement

**Tasks:**
1. ✅ Unit tests
   - Prompt resolution
   - Migration
   - Update detection
   - Version comparison

2. ✅ Integration tests
   - End-to-end stickying
   - Update workflow
   - Profile import/export

3. ✅ Performance testing
   - Resolution caching
   - Large version histories
   - Many stickies

4. ✅ Documentation
   - User guide (README.md)
   - Developer guide (CLAUDE.md)
   - API documentation

5. ✅ Edge case handling
   - Corrupted prompts
   - Missing settings
   - Orphaned stickies

**Deliverable:** Production-ready prompt versioning system

---

### Phase 6: Deployment (Week 4)

**Goal:** Release to users

**Tasks:**
1. ✅ Version bump
   - Update to v2.0.0
   - Update manifest.json
   - Tag release

2. ✅ Changelog
   - Document all changes
   - Migration notes
   - Breaking changes (none)

3. ✅ User communication
   - Announce new feature
   - Link to documentation
   - Provide examples

4. ✅ Monitor feedback
   - Watch for issues
   - Gather user feedback
   - Plan improvements

**Deliverable:** v2.0.0 released with prompt versioning

---

## Summary

This prompt versioning and stickying system provides:

1. **Robust versioning** - Semantic versioning with full changelog tracking
2. **Flexible stickying** - Character and chat-level overrides with clear priority
3. **Smooth migration** - Automatic string → versioned conversion, zero data loss
4. **User control** - Multiple update strategies (replace/merge/dismiss)
5. **Clean architecture** - Follows existing patterns, maintainable code
6. **Backward compatibility** - Works with v1.x profiles and settings
7. **Comprehensive UI** - All functionality accessible through intuitive interface
8. **Performance** - Caching and lazy loading for efficiency

The system respects project principles:
- **Explicit-Only Development** - Clear resolution priority, no hidden fallbacks
- **Scope Discipline** - Implements exactly what's requested, no feature creep
- **Transparent Implementation** - Clear data structures and algorithms
- **Real-Environment Testing** - Can be tested against actual SillyTavern

**Next Steps:** Review this design, provide feedback, and begin Phase 1 implementation.

# UI-Driven Operations Presets System - Planning Document

**Document Version:** 1.0
**Date:** 2025-11-17
**Status:** Planning Phase
**Purpose:** Plan UI-driven operations configuration with presets and artifacts

---

## Executive Summary

This document specifies a **preset-based operations configuration system** that allows users to:

1. **Bundle operation configurations into shareable presets**
2. **Version individual operation artifacts with auto-incrementing names**
3. **Sticky presets to characters/chats**
4. **Import/export presets safely** (no API key leakage)
5. **Reuse artifacts across multiple presets**

**Key Innovation:** Two-layer architecture - **Presets** (bundles) reference **Artifacts** (individual configs)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Structures](#2-data-structures)
3. [UI Layout Specification](#3-ui-layout-specification)
4. [Resolution Algorithm](#4-resolution-algorithm)
5. [Versioning Strategy](#5-versioning-strategy)
6. [Import/Export Format](#6-importexport-format)
7. [Migration Strategy](#7-migration-strategy)
8. [Implementation Plan](#8-implementation-plan)
9. [File Changes](#9-file-changes)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Architecture Overview

### 1.1 Concept Hierarchy

```
Operations Preset (shareable bundle, can be stickied)
├── Scene Recap Operation
│   └── References Artifact: "Detailed Recap v3"
├── Scene Break Operation
│   └── References Artifact: "Strict Detection v1"
├── Running Scene Recap Operation
│   └── References Artifact: "Narrative Summary v2"
└── ... (8 operation types total)

Operation Artifact (atomic config, reusable)
├── Prompt text
├── Prefill
├── Connection profile (name reference only)
├── Completion preset name
└── Include preset prompts flag
```

### 1.2 Key Concepts

| Concept | Definition | Example |
|---------|------------|---------|
| **Operation Artifact** | Atomic configuration for one operation type (prompt + execution settings) | "Detailed Recap v3" (prompt, prefill, connection profile, preset) |
| **Operations Preset** | Bundle that maps each operation type to a specific artifact | "Alice RP Setup" (scene_recap → "Detailed Recap v3", auto_scene_break → "Strict Detection v1") |
| **Default Preset** | Always-available preset that uses default artifacts for all operations | "Default" (cannot be deleted or renamed) |
| **Sticky Preset** | Preset pinned to a specific character or chat (overrides profile preset) | Chat "alice-2024-01-15" uses "Alice RP Setup" |

### 1.3 Benefits Over CORRECTED_DESIGN.md Approach

| Feature | CORRECTED_DESIGN.md | This Approach |
|---------|---------------------|---------------|
| **Artifact Reuse** | ❌ Each profile has independent configs | ✅ One artifact used in multiple presets |
| **Shareability** | ⚠️ Share entire profile (includes unrelated settings) | ✅ Share just operation configs (clean JSON) |
| **Organization** | ⚠️ Scattered per-operation stickies | ✅ Bundled presets for coherent configs |
| **Versioning** | ✅ Track history per operation | ✅ Track history + auto-increment names |
| **API Key Safety** | N/A | ✅ Export connection profile names only |

---

## 2. Data Structures

### 2.1 Global Artifact Registry

Store all operation artifacts in a global registry:

```javascript
// extension_settings.auto_recap.operation_artifacts
{
  // Key = operation type (8 types)
  "scene_recap": [
    {
      name: "Default",
      prompt: "You are a structured assistant...",
      prefill: "{",
      connection_profile: null,  // null = use current connection
      completion_preset_name: "",
      include_preset_prompts: false,

      isDefault: true,
      internalVersion: 1,
      createdAt: 1705320000000,
      modifiedAt: 1705320000000,
      customLabel: null
    },
    {
      name: "Detailed Recap v3",
      prompt: "You are an expert at creating detailed recaps...",
      prefill: "{",
      connection_profile: null,
      completion_preset_name: "Creative",
      include_preset_prompts: true,

      isDefault: false,
      internalVersion: 3,
      createdAt: 1705320100000,
      modifiedAt: 1705320300000,
      customLabel: "My detailed recap config"
    },
    {
      name: "Concise Recap v1",
      prompt: "Create a brief recap...",
      prefill: "{",
      connection_profile: null,
      completion_preset_name: "",
      include_preset_prompts: false,

      isDefault: false,
      internalVersion: 1,
      createdAt: 1705320400000,
      modifiedAt: 1705320400000,
      customLabel: null
    }
  ],

  "auto_scene_break": [
    {
      name: "Default",
      // ... default artifact
    },
    {
      name: "Strict Detection v1",
      // ... custom artifact
    }
  ],

  // ... for all 8 operation types:
  // - scene_recap
  // - scene_recap_error_detection
  // - auto_scene_break
  // - running_scene_recap
  // - auto_lorebooks_recap_merge
  // - auto_lorebooks_recap_lorebook_entry_lookup
  // - auto_lorebooks_recap_lorebook_entry_deduplicate
  // - auto_lorebooks_bulk_populate
}
```

**Field Descriptions:**

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | Display name (user-editable or auto-generated "v<N>") |
| `prompt` | string | The actual prompt text |
| `prefill` | string | Prefill text for LLM response |
| `connection_profile` | string\|null | Connection profile UUID, null = use current |
| `completion_preset_name` | string | Completion preset name |
| `include_preset_prompts` | boolean | Include preset prompts flag |
| `isDefault` | boolean | Is this the default artifact? |
| `internalVersion` | number | Auto-increment version number (for uniqueness) |
| `createdAt` | number | Creation timestamp (epoch ms) |
| `modifiedAt` | number | Last modification timestamp |
| `customLabel` | string\|null | Optional user description |

### 2.2 Operations Presets

Store preset bundles that reference artifacts:

```javascript
// extension_settings.auto_recap.operations_presets
{
  "Default": {
    name: "Default",
    isDefault: true,
    operations: {
      scene_recap: "Default",
      scene_recap_error_detection: "Default",
      auto_scene_break: "Default",
      running_scene_recap: "Default",
      auto_lorebooks_recap_merge: "Default",
      auto_lorebooks_recap_lorebook_entry_lookup: "Default",
      auto_lorebooks_recap_lorebook_entry_deduplicate: "Default",
      auto_lorebooks_bulk_populate: "Default"
    },
    createdAt: 1705320000000,
    modifiedAt: 1705320000000,
    description: "Default configuration for all operations"
  },

  "Alice RP Setup": {
    name: "Alice RP Setup",
    isDefault: false,
    operations: {
      scene_recap: "Detailed Recap v3",
      scene_recap_error_detection: "Default",
      auto_scene_break: "Strict Detection v1",
      running_scene_recap: "Narrative Summary v2",
      auto_lorebooks_recap_merge: "Default",
      auto_lorebooks_recap_lorebook_entry_lookup: "Default",
      auto_lorebooks_recap_lorebook_entry_deduplicate: "Default",
      auto_lorebooks_bulk_populate: "Default"
    },
    createdAt: 1705320500000,
    modifiedAt: 1705320600000,
    description: "Optimized for romantic RP with Alice"
  },

  "Quick Chat Setup v1": {
    name: "Quick Chat Setup v1",
    isDefault: false,
    operations: {
      scene_recap: "Concise Recap v1",
      scene_recap_error_detection: "Default",
      auto_scene_break: "Default",
      running_scene_recap: "Default",
      auto_lorebooks_recap_merge: "Default",
      auto_lorebooks_recap_lorebook_entry_lookup: "Default",
      auto_lorebooks_recap_lorebook_entry_deduplicate: "Default",
      auto_lorebooks_bulk_populate: "Default"
    },
    createdAt: 1705320700000,
    modifiedAt: 1705320700000,
    description: null
  }
}
```

**Field Descriptions:**

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | Preset name (user-editable, must be unique) |
| `isDefault` | boolean | Is this the default preset? (cannot delete/rename) |
| `operations` | object | Map of operation_type → artifact_name |
| `createdAt` | number | Creation timestamp |
| `modifiedAt` | number | Last modification timestamp |
| `description` | string\|null | Optional user description |

### 2.3 Active Preset Tracking

Track which preset is active in different contexts:

```javascript
// Per-profile active preset
extension_settings.auto_recap.profiles["Default"].active_operations_preset = "Default";

// Character sticky presets (global)
extension_settings.auto_recap.character_sticky_presets = {
  "alice.png": "Alice RP Setup",
  "bob_avatar.png": "Quick Chat Setup v1"
};

// Chat sticky presets (global)
extension_settings.auto_recap.chat_sticky_presets = {
  "chat-2024-01-15-12345": "Alice RP Setup",
  "chat-2024-01-16-67890": "Default"
};
```

### 2.4 Storage Summary

```
extension_settings.auto_recap
├── operation_artifacts: { [operation_type]: [artifacts...] }
├── operations_presets: { [preset_name]: preset_object }
├── character_sticky_presets: { [character_key]: preset_name }
├── chat_sticky_presets: { [chat_id]: preset_name }
└── profiles: {
    "Default": {
      active_operations_preset: "Default",
      // ... other profile settings
    }
  }
```

---

## 3. UI Layout Specification

### 3.1 Overall Structure

Place in settings panel under a new collapsible section:

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Operations Configuration                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Preset Selector Section]                                  │
│                                                             │
│ [Operation Type Sections] × 8                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Preset Selector Section

```html
┌─────────────────────────────────────────────────────────────┐
│ Active Operations Preset                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Preset: [Alice RP Setup ▼] 👤                              │
│         ^^^^^^^^^^^^^^^^  ^^                                │
│         Dropdown          Badge (📄=Profile, 👤=Char, 💬=Chat)
│                                                             │
│ Description: Optimized for romantic RP with Alice          │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [💾 Save] [✏️ Rename] [🗑️ Delete]                       │ │
│ │ [📥 Import] [📤 Export] [📋 Duplicate]                   │ │
│ │ [📌 Sticky to Character] [📌 Sticky to Chat]             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Elements:**

1. **Preset Dropdown**
   - Lists all available presets
   - Shows badge indicating source (profile/character/chat)
   - Badge icons:
     - 📄 = Profile (default)
     - 👤 = Character sticky
     - 💬 = Chat sticky

2. **Description Field**
   - Read-only display of preset description
   - Editable when Rename clicked

3. **Button Row 1:**
   - **Save** - Save current state as new version (auto-increment)
     - Disabled if no changes made
     - Creates "Alice RP Setup v2" if "Alice RP Setup v1" exists
   - **Rename** - Rename the preset
     - Disabled if Default preset
     - Opens inline editor for name + description
   - **Delete** - Delete the preset
     - Disabled if Default preset
     - Confirmation prompt

4. **Button Row 2:**
   - **Import** - Import preset from JSON file
     - Opens file picker
     - Validates JSON structure
     - Merges artifacts into registry
   - **Export** - Export preset to JSON file
     - Bundles preset + referenced artifacts
     - Connection profiles exported as names only
     - Downloads JSON file
   - **Duplicate** - Create copy of current preset
     - Auto-names as "Copy of <preset_name>"
     - User can rename immediately

5. **Button Row 3:**
   - **Sticky to Character** - Pin preset to current character
     - Disabled if no character selected
     - Shows menu if multiple characters available
   - **Sticky to Chat** - Pin preset to current chat
     - Disabled if no chat selected
     - Highest priority in resolution chain

### 3.3 Per-Operation Type Sections

For each of the 8 operation types, create a sub-section:

```html
┌─────────────────────────────────────────────────────────────┐
│ ▼ Scene Recap                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Artifact: [Detailed Recap v3 ▼]                            │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [✏️ Edit] [✏️ Rename] [🗑️ Delete] [📋 Duplicate]         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Elements:**

1. **Artifact Dropdown**
   - Lists all artifacts for this operation type
   - Shows currently selected artifact for this preset
   - Default option always available

2. **Button Row:**
   - **Edit** - Opens artifact editor popup (see 3.4)
   - **Rename** - Rename the artifact
     - Disabled if Default artifact
     - Inline editor
   - **Delete** - Delete the artifact
     - Disabled if Default artifact
     - Disabled if artifact used in any preset
     - Confirmation prompt with usage list
   - **Duplicate** - Create copy of artifact
     - Auto-names with auto-increment "v<N>"
     - Immediately available for selection

### 3.4 Artifact Editor Popup

Modal popup opened when clicking "Edit" on an artifact:

```html
┌─────────────────────────────────────────────────────────────┐
│ Edit Operation Artifact                                     │
│ Scene Recap - "Detailed Recap v3"                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Artifact Name:                                              │
│ [Detailed Recap v3_____________________________________]    │
│                                                             │
│ Description:                                                │
│ [My detailed recap config___________________________]      │
│                                                             │
│ Prompt:                                                     │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ You are an expert at creating detailed recaps...      │ │
│ │                                                         │ │
│ │ [Large textarea - 10 rows]                             │ │
│ │                                                         │ │
│ │                                                         │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                             │
│ Prefill:                                                    │
│ [{ _______________________________________________]         │
│                                                             │
│ Connection Profile:                                         │
│ [Use Current Connection ▼]                                 │
│   Options: null, "My Claude Profile", "GPT-4 Profile"...   │
│                                                             │
│ Completion Preset Name:                                     │
│ [Creative_______________________________________]           │
│                                                             │
│ [✓] Include preset prompts                                 │
│                                                             │
│ ─────────────────────────────────────────────────────────  │
│                                                             │
│ ⚠️ Changes auto-save with version increment                │
│                                                             │
│ [💾 Save & Close] [❌ Cancel (Discard Changes)]            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**

1. **Auto-save on change:**
   - First change triggers version increment
   - Creates new artifact "v<N+1>"
   - Updates preset to reference new version
   - Subsequent changes update same version (debounced save)

2. **Version Increment Logic:**
   ```javascript
   // User editing "Detailed Recap v3"
   // Makes first change → Creates "Detailed Recap v4"
   // Preset now references "Detailed Recap v4"
   // Original "v3" remains in registry (version history)
   ```

3. **Connection Profile Dropdown:**
   - Shows "Use Current Connection" (null)
   - Lists all available connection profiles by name
   - Stores profile UUID internally
   - On export: exports name only (not UUID or API keys)

4. **Save & Close:**
   - Closes popup
   - Returns to settings panel

5. **Cancel:**
   - Confirmation if changes made
   - Discards unsaved version
   - Reverts preset to previous artifact

### 3.5 Wireframe Layout

```
┌─────────────────────────────────────────────────────────────┐
│ SillyTavern Settings                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ▼ Auto-Recap Extension Settings                            │
│   ├─ [Basic Settings Section]                              │
│   ├─ [Memory Injection Settings]                           │
│   │                                                         │
│   └─ ▼ Operations Configuration                            │
│       │                                                     │
│       ├─ [Preset Selector Section]                         │
│       │   Preset: [Alice RP Setup ▼] 👤                    │
│       │   [💾 Save] [✏️ Rename] [🗑️ Delete]                │
│       │   [📥 Import] [📤 Export] [📋 Duplicate]            │
│       │   [📌 Sticky to Character] [📌 Sticky to Chat]     │
│       │                                                     │
│       ├─ ▼ Scene Recap                                      │
│       │   Artifact: [Detailed Recap v3 ▼]                  │
│       │   [✏️ Edit] [✏️ Rename] [🗑️ Delete] [📋 Duplicate]  │
│       │                                                     │
│       ├─ ▼ Scene Recap Error Detection                      │
│       │   Artifact: [Default ▼]                            │
│       │   [✏️ Edit] [✏️ Rename] [🗑️ Delete] [📋 Duplicate]  │
│       │                                                     │
│       ├─ ▼ Auto Scene Break                                 │
│       │   Artifact: [Strict Detection v1 ▼]                │
│       │   [✏️ Edit] [✏️ Rename] [🗑️ Delete] [📋 Duplicate]  │
│       │                                                     │
│       ├─ ▼ Running Scene Recap                              │
│       │   Artifact: [Narrative Summary v2 ▼]               │
│       │   [✏️ Edit] [✏️ Rename] [🗑️ Delete] [📋 Duplicate]  │
│       │                                                     │
│       ├─ ▼ Auto-Lorebooks: Recap Merge                      │
│       │   ... (same pattern)                               │
│       │                                                     │
│       ├─ ▼ Auto-Lorebooks: Entry Lookup                     │
│       │   ... (same pattern)                               │
│       │                                                     │
│       ├─ ▼ Auto-Lorebooks: Entry Deduplicate                │
│       │   ... (same pattern)                               │
│       │                                                     │
│       └─ ▼ Auto-Lorebooks: Bulk Populate                    │
│           ... (same pattern)                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Resolution Algorithm

### 4.1 Preset Resolution

```javascript
/**
 * Resolve which operations preset to use
 * Priority: Chat sticky > Character sticky > Profile > Default
 * @returns {string} - Preset name
 */
function resolveOperationsPreset() {
  try {
    // PRIORITY 1: Check chat sticky (HIGHEST)
    const chatId = get_current_chat_identifier();
    if (chatId) {
      const chatStickies = get_settings('chat_sticky_presets') || {};
      const chatPreset = chatStickies[chatId];
      if (chatPreset && presetExists(chatPreset)) {
        return chatPreset;
      }
    }

    // PRIORITY 2: Check character sticky
    const characterKey = get_current_character_identifier();
    if (characterKey) {
      const characterStickies = get_settings('character_sticky_presets') || {};
      const characterPreset = characterStickies[characterKey];
      if (characterPreset && presetExists(characterPreset)) {
        return characterPreset;
      }
    }

    // PRIORITY 3: Check profile active preset
    const profile = get_settings('profile');
    const profiles = get_settings('profiles');
    const activePreset = profiles[profile]?.active_operations_preset;
    if (activePreset && presetExists(activePreset)) {
      return activePreset;
    }

    // PRIORITY 4: Fallback to Default
    return "Default";

  } catch (error) {
    error('Failed to resolve operations preset:', error);
    return "Default";
  }
}

/**
 * Check if a preset exists
 * @param {string} presetName
 * @returns {boolean}
 */
function presetExists(presetName) {
  const presets = get_settings('operations_presets') || {};
  return !!presets[presetName];
}
```

### 4.2 Operation Config Resolution

```javascript
/**
 * Resolve the full configuration for a specific operation type
 * @param {string} operationType - e.g., 'scene_recap'
 * @returns {OperationArtifact} - The artifact object
 */
function resolveOperationConfig(operationType) {
  try {
    // 1. Get active preset
    const presetName = resolveOperationsPreset();
    const presets = get_settings('operations_presets') || {};
    const preset = presets[presetName];

    if (!preset) {
      error(`Preset not found: ${presetName}, using Default`);
      return getDefaultArtifact(operationType);
    }

    // 2. Get artifact name for this operation from preset
    const artifactName = preset.operations[operationType];
    if (!artifactName) {
      error(`No artifact defined for ${operationType} in preset ${presetName}`);
      return getDefaultArtifact(operationType);
    }

    // 3. Fetch artifact from registry
    const artifacts = get_settings('operation_artifacts') || {};
    const operationArtifacts = artifacts[operationType] || [];
    const artifact = operationArtifacts.find(a => a.name === artifactName);

    if (!artifact) {
      error(`Artifact not found: ${artifactName} for ${operationType}`);
      return getDefaultArtifact(operationType);
    }

    return artifact;

  } catch (error) {
    error(`Failed to resolve operation config for ${operationType}:`, error);
    return getDefaultArtifact(operationType);
  }
}

/**
 * Get default artifact for an operation type
 * @param {string} operationType
 * @returns {OperationArtifact}
 */
function getDefaultArtifact(operationType) {
  const artifacts = get_settings('operation_artifacts') || {};
  const operationArtifacts = artifacts[operationType] || [];
  const defaultArtifact = operationArtifacts.find(a => a.isDefault);

  if (!defaultArtifact) {
    throw new Error(`No default artifact found for ${operationType}`);
  }

  return defaultArtifact;
}
```

### 4.3 Usage in Code

**Current pattern:**
```javascript
// autoSceneBreakDetection.js:537
const promptTemplate = get_settings('auto_scene_break_prompt');
const prefill = get_settings('auto_scene_break_prefill');
const connectionProfile = get_settings('auto_scene_break_connection_profile');
```

**New pattern:**
```javascript
import { resolveOperationConfig } from './operationsPresets.js';

const config = resolveOperationConfig('auto_scene_break');
const promptTemplate = config.prompt;
const prefill = config.prefill;
const connectionProfile = config.connection_profile;
const completionPresetName = config.completion_preset_name;
const includePresetPrompts = config.include_preset_prompts;
```

### 4.4 Resolution Flow Diagram

```
User Action (e.g., generate recap)
    ↓
resolveOperationConfig('scene_recap')
    ↓
resolveOperationsPreset()
    ├─→ Check chat_sticky_presets[currentChatId] → "Alice RP Setup" ✓
    ├─→ (Skip: character sticky - chat won)
    ├─→ (Skip: profile preset - chat won)
    └─→ (Skip: Default - chat won)
    ↓
Get preset: operations_presets["Alice RP Setup"]
    ↓
Get artifact name: preset.operations['scene_recap'] → "Detailed Recap v3"
    ↓
Fetch artifact: operation_artifacts['scene_recap'].find("Detailed Recap v3")
    ↓
Return artifact:
{
  name: "Detailed Recap v3",
  prompt: "You are an expert...",
  prefill: "{",
  connection_profile: null,
  completion_preset_name: "Creative",
  include_preset_prompts: true
}
```

---

## 5. Versioning Strategy

### 5.1 Auto-Increment Versioning

**Initial Creation:**
```javascript
// User creates new artifact from Default
// System auto-names: "v1"
{
  name: "v1",
  internalVersion: 1,
  // ...
}
```

**First Edit:**
```javascript
// User edits "v1"
// System creates: "v2"
{
  name: "v2",
  internalVersion: 2,
  // ...
}
// Preset updated to reference "v2"
// Original "v1" remains in registry (history)
```

**User Rename:**
```javascript
// User renames "v2" → "Detailed Recap for Alice"
{
  name: "Detailed Recap for Alice",
  internalVersion: 2,  // Internal version unchanged
  customLabel: "My custom config",
  // ...
}
```

**Subsequent Edit:**
```javascript
// User edits "Detailed Recap for Alice"
// System creates: "Detailed Recap for Alice v3"
{
  name: "Detailed Recap for Alice v3",
  internalVersion: 3,
  // ...
}
```

### 5.2 Version Increment Logic

```javascript
/**
 * Create new version of an artifact
 * @param {string} operationType
 * @param {string} currentArtifactName
 * @returns {string} - New artifact name
 */
function createNewArtifactVersion(operationType, currentArtifactName) {
  const artifacts = get_settings('operation_artifacts')[operationType] || [];

  // Find current artifact
  const currentArtifact = artifacts.find(a => a.name === currentArtifactName);
  if (!currentArtifact) {
    throw new Error(`Artifact not found: ${currentArtifactName}`);
  }

  // Determine new version number
  const maxVersion = Math.max(...artifacts.map(a => a.internalVersion));
  const newVersion = maxVersion + 1;

  // Determine new name
  let newName;
  if (currentArtifact.customLabel) {
    // User renamed it, append version
    newName = `${currentArtifact.customLabel} v${newVersion}`;
  } else {
    // Auto-generated name
    newName = `v${newVersion}`;
  }

  // Clone current artifact with new version
  const newArtifact = {
    ...structuredClone(currentArtifact),
    name: newName,
    internalVersion: newVersion,
    createdAt: Date.now(),
    modifiedAt: Date.now()
  };

  // Add to registry
  artifacts.push(newArtifact);
  saveArtifactRegistry(operationType, artifacts);

  return newName;
}
```

### 5.3 Version History Management

**Pruning Strategy:**
- Keep last 10 versions per operation type
- Default artifacts never pruned
- User can manually delete old versions (if not referenced)

```javascript
/**
 * Prune old artifact versions
 * @param {string} operationType
 */
function pruneArtifactVersions(operationType, maxVersions = 10) {
  const artifacts = get_settings('operation_artifacts')[operationType] || [];

  // Separate defaults and non-defaults
  const defaults = artifacts.filter(a => a.isDefault);
  const nonDefaults = artifacts.filter(a => !a.isDefault);

  // Check if artifacts are referenced in any preset
  const referencedNames = getReferencedArtifactNames();

  // Sort by internal version (newest first)
  nonDefaults.sort((a, b) => b.internalVersion - a.internalVersion);

  // Keep maxVersions newest + all referenced
  const toKeep = nonDefaults.filter((artifact, index) => {
    return index < maxVersions || referencedNames.has(artifact.name);
  });

  // Combine with defaults
  const pruned = [...defaults, ...toKeep];

  saveArtifactRegistry(operationType, pruned);
}
```

---

## 6. Import/Export Format

### 6.1 Export Format

```json
{
  "format_version": "1.0",
  "exported_at": 1705320000000,
  "preset_name": "Alice RP Setup",
  "preset_description": "Optimized for romantic RP with Alice",

  "operations": {
    "scene_recap": {
      "artifact_name": "Detailed Recap v3",
      "prompt": "You are an expert at creating detailed recaps...",
      "prefill": "{",
      "connection_profile_name": "My Claude Profile",
      "completion_preset_name": "Creative",
      "include_preset_prompts": true
    },

    "scene_recap_error_detection": {
      "artifact_name": "Default",
      "prompt": "Analyze the recap...",
      "prefill": "",
      "connection_profile_name": null,
      "completion_preset_name": "",
      "include_preset_prompts": false
    },

    "auto_scene_break": {
      "artifact_name": "Strict Detection v1",
      "prompt": "Analyze the following messages...",
      "prefill": "",
      "connection_profile_name": "My Claude Profile",
      "completion_preset_name": "",
      "include_preset_prompts": true
    },

    // ... all 8 operation types
  }
}
```

**Key Security Feature:**
- `connection_profile_name` exports the **name** only
- UUID and API keys NOT exported
- On import, system looks up connection profile by name
- If not found → uses `null` (current connection)

### 6.2 Import Logic

```javascript
/**
 * Import operations preset from JSON
 * @param {string} jsonString
 * @returns {Promise<boolean>}
 */
async function importOperationsPreset(jsonString) {
  try {
    const data = JSON.parse(jsonString);

    // Validate format version
    if (data.format_version !== "1.0") {
      throw new Error(`Unsupported format version: ${data.format_version}`);
    }

    // Validate operations structure
    validateImportedOperations(data.operations);

    // Create preset name (avoid collisions)
    let presetName = data.preset_name;
    let counter = 1;
    const presets = get_settings('operations_presets') || {};
    while (presets[presetName]) {
      presetName = `${data.preset_name} (${counter})`;
      counter++;
    }

    // Import artifacts into registry
    const artifactMapping = {}; // old_name → new_name
    for (const [operationType, operationData] of Object.entries(data.operations)) {
      const importedName = operationData.artifact_name;

      // Check if artifact with same content already exists
      const existingArtifact = findArtifactByContent(operationType, operationData);

      if (existingArtifact) {
        // Reuse existing artifact
        artifactMapping[importedName] = existingArtifact.name;
      } else {
        // Create new artifact
        const newArtifactName = await createArtifactFromImport(
          operationType,
          operationData
        );
        artifactMapping[importedName] = newArtifactName;
      }
    }

    // Create preset
    const newPreset = {
      name: presetName,
      isDefault: false,
      operations: {},
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      description: data.preset_description || `Imported on ${new Date().toLocaleString()}`
    };

    // Map operations to imported/existing artifacts
    for (const operationType of Object.keys(data.operations)) {
      const oldArtifactName = data.operations[operationType].artifact_name;
      newPreset.operations[operationType] = artifactMapping[oldArtifactName];
    }

    // Save preset
    presets[presetName] = newPreset;
    set_settings('operations_presets', presets);

    toast(`Imported preset: "${presetName}"`, 'success');
    return true;

  } catch (error) {
    error('Failed to import preset:', error);
    toast(`Import failed: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Create artifact from imported data
 * @param {string} operationType
 * @param {Object} operationData
 * @returns {Promise<string>} - New artifact name
 */
async function createArtifactFromImport(operationType, operationData) {
  const artifacts = get_settings('operation_artifacts')[operationType] || [];

  // Determine new version
  const maxVersion = Math.max(...artifacts.map(a => a.internalVersion), 0);
  const newVersion = maxVersion + 1;

  // Look up connection profile by name
  let connectionProfileUuid = null;
  if (operationData.connection_profile_name) {
    connectionProfileUuid = lookupConnectionProfileByName(
      operationData.connection_profile_name
    );
    if (!connectionProfileUuid) {
      warn(`Connection profile not found: ${operationData.connection_profile_name}, using current`);
    }
  }

  // Create artifact
  const newArtifact = {
    name: `${operationData.artifact_name} (imported)`,
    prompt: operationData.prompt,
    prefill: operationData.prefill,
    connection_profile: connectionProfileUuid,
    completion_preset_name: operationData.completion_preset_name,
    include_preset_prompts: operationData.include_preset_prompts,
    isDefault: false,
    internalVersion: newVersion,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    customLabel: `Imported from ${operationData.artifact_name}`
  };

  artifacts.push(newArtifact);
  saveArtifactRegistry(operationType, artifacts);

  return newArtifact.name;
}
```

### 6.3 Export Logic

```javascript
/**
 * Export operations preset to JSON
 * @param {string} presetName
 * @returns {string} - JSON string
 */
function exportOperationsPreset(presetName) {
  const presets = get_settings('operations_presets') || {};
  const preset = presets[presetName];

  if (!preset) {
    throw new Error(`Preset not found: ${presetName}`);
  }

  const exportData = {
    format_version: "1.0",
    exported_at: Date.now(),
    preset_name: preset.name,
    preset_description: preset.description,
    operations: {}
  };

  // Export each operation's artifact
  for (const [operationType, artifactName] of Object.entries(preset.operations)) {
    const artifact = getArtifact(operationType, artifactName);

    if (!artifact) {
      warn(`Artifact not found: ${artifactName} for ${operationType}, using Default`);
      artifact = getDefaultArtifact(operationType);
    }

    // Look up connection profile name (export name only, not UUID/keys)
    let connectionProfileName = null;
    if (artifact.connection_profile) {
      connectionProfileName = getConnectionProfileName(artifact.connection_profile);
    }

    exportData.operations[operationType] = {
      artifact_name: artifact.name,
      prompt: artifact.prompt,
      prefill: artifact.prefill,
      connection_profile_name: connectionProfileName,  // NAME ONLY
      completion_preset_name: artifact.completion_preset_name,
      include_preset_prompts: artifact.include_preset_prompts
    };
  }

  return JSON.stringify(exportData, null, 2);
}
```

---

## 7. Migration Strategy

### 7.1 Current State (v1.x)

Profiles currently store scattered settings:

```javascript
profile = {
  // Scene recap
  scene_recap_prompt: "You are a structured...",
  scene_recap_prefill: "{",
  scene_recap_connection_profile: "",
  scene_recap_completion_preset_name: "",
  scene_recap_include_preset_prompts: false,

  // Auto scene break
  auto_scene_break_prompt: "Analyze...",
  auto_scene_break_prefill: "",
  auto_scene_break_connection_profile: "",
  auto_scene_break_completion_preset_name: "",
  auto_scene_break_include_preset_prompts: true,

  // ... all 8 operation types (40 keys total)
}
```

### 7.2 Migration Steps

**File:** `operationsPresetsMigration.js`

```javascript
/**
 * Check if migration is needed
 * @returns {boolean}
 */
export function needsOperationsPresetsMigration() {
  // Check if new structure exists
  const artifacts = get_settings('operation_artifacts');
  const presets = get_settings('operations_presets');

  if (artifacts && presets) {
    return false; // Already migrated
  }

  // Check if old structure exists
  const profiles = get_settings('profiles');
  for (const profile of Object.values(profiles)) {
    if (profile.scene_recap_prompt !== undefined) {
      return true; // Old structure found
    }
  }

  return false;
}

/**
 * Migrate from scattered settings to operations presets
 * @returns {Promise<boolean>}
 */
export async function migrateToOperationsPresets() {
  log(SUBSYSTEM.SETTINGS, '=== Starting Operations Presets Migration ===');

  const profiles = get_settings('profiles');
  const artifacts = {};
  const presets = {};

  // Step 1: Create default artifacts from defaultSettings.js
  for (const operationType of OPERATION_TYPES) {
    artifacts[operationType] = [
      createDefaultArtifact(operationType)
    ];
  }

  // Step 2: For each profile, create preset and artifacts
  for (const [profileName, profileSettings] of Object.entries(profiles)) {
    log(SUBSYSTEM.SETTINGS, `Migrating profile: "${profileName}"`);

    const presetOperations = {};

    // Step 3: For each operation type, check if customized
    for (const operationType of OPERATION_TYPES) {
      const gatheredConfig = gatherScatteredSettings(profileSettings, operationType);
      const defaultConfig = getDefaultConfigForType(operationType);

      const isCustomized = !deepEqualConfigs(gatheredConfig, defaultConfig);

      if (isCustomized) {
        // Create custom artifact
        const customArtifact = {
          name: `${operationType} v1`,
          prompt: gatheredConfig.prompt,
          prefill: gatheredConfig.prefill,
          connection_profile: gatheredConfig.connection_profile || null,
          completion_preset_name: gatheredConfig.completion_preset_name,
          include_preset_prompts: gatheredConfig.include_preset_prompts,
          isDefault: false,
          internalVersion: 1,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          customLabel: `Migrated from profile "${profileName}"`
        };

        artifacts[operationType].push(customArtifact);
        presetOperations[operationType] = customArtifact.name;

        log(SUBSYSTEM.SETTINGS, `  ✓ ${operationType} → CUSTOM ARTIFACT`);
      } else {
        // Use default artifact
        presetOperations[operationType] = "Default";
        log(SUBSYSTEM.SETTINGS, `  ✓ ${operationType} → DEFAULT ARTIFACT`);
      }

      // Delete old scattered settings
      delete profileSettings[`${operationType}_prompt`];
      delete profileSettings[`${operationType}_prefill`];
      delete profileSettings[`${operationType}_connection_profile`];
      delete profileSettings[`${operationType}_completion_preset_name`];
      delete profileSettings[`${operationType}_include_preset_prompts`];
    }

    // Step 4: Create preset for this profile
    const presetName = `${profileName} (migrated)`;
    presets[presetName] = {
      name: presetName,
      isDefault: profileName === "Default",
      operations: presetOperations,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      description: `Migrated from profile "${profileName}"`
    };

    // Set active preset for this profile
    profileSettings.active_operations_preset = presetName;
  }

  // Step 5: Save new structures
  set_settings('operation_artifacts', artifacts);
  set_settings('operations_presets', presets);
  set_settings('profiles', profiles);

  log(SUBSYSTEM.SETTINGS, '=== Operations Presets Migration Complete ===');
  return true;
}

/**
 * Gather scattered settings into one config object
 * @param {Object} profileSettings
 * @param {string} operationType
 * @returns {Object}
 */
function gatherScatteredSettings(profileSettings, operationType) {
  return {
    prompt: profileSettings[`${operationType}_prompt`],
    prefill: profileSettings[`${operationType}_prefill`],
    connection_profile: profileSettings[`${operationType}_connection_profile`],
    completion_preset_name: profileSettings[`${operationType}_completion_preset_name`],
    include_preset_prompts: profileSettings[`${operationType}_include_preset_prompts`]
  };
}
```

### 7.3 Migration Timing

Add to initialization sequence:

```javascript
// In eventHandlers.js

async function initializeExtension() {
  // Existing migrations...
  if (needsMigration()) {
    await migrateConnectionProfileSettings();
  }

  // NEW: Operations presets migration
  if (needsOperationsPresetsMigration()) {
    await migrateToOperationsPresets();
    saveSettingsDebounced();
  }

  // Continue...
}
```

### 7.4 Rollback Strategy

Create backup before migration:

```javascript
function backupBeforeMigration() {
  const profiles = get_settings('profiles');
  const backup = {
    profiles: structuredClone(profiles),
    timestamp: Date.now(),
    version: '1.x'
  };

  set_settings('_migration_backup_operations_presets', backup);
  saveSettingsDebounced();
  log(SUBSYSTEM.SETTINGS, 'Created backup before operations presets migration');
}
```

---

## 8. Implementation Plan

### Phase 1: Data Layer (Week 1)

**Goal:** Implement artifact registry and preset management

**Tasks:**
1. Create `operationArtifacts.js`
   - CRUD operations for artifacts
   - `createArtifact()`, `updateArtifact()`, `deleteArtifact()`
   - `getArtifact()`, `listArtifacts()`
   - Version increment logic

2. Create `operationsPresets.js`
   - CRUD operations for presets
   - `createPreset()`, `updatePreset()`, `deletePreset()`
   - `getPreset()`, `listPresets()`
   - Sticky management

3. Create `operationsPresetsResolution.js`
   - `resolveOperationsPreset()`
   - `resolveOperationConfig(operationType)`
   - Validation and fallbacks

4. Create `operationsPresetsMigration.js`
   - Migration detection
   - Scattered → artifacts + presets conversion
   - Backup mechanism

**Deliverable:** Data structures in place, migration works

---

### Phase 2: Import/Export (Week 1-2)

**Goal:** Enable preset sharing

**Tasks:**
1. Create `operationsPresetsExport.js`
   - `exportPreset(presetName)` → JSON
   - Connection profile name lookup
   - Artifact bundling

2. Create `operationsPresetsImport.js`
   - `importPreset(jsonString)` → create artifacts + preset
   - Connection profile name → UUID lookup
   - Duplicate detection

3. Add validation
   - JSON schema validation
   - Artifact content validation
   - Preset structure validation

**Deliverable:** Users can import/export presets

---

### Phase 3: UI Components (Week 2-3)

**Goal:** Build user interface

**Tasks:**
1. Create `operationsPresetsUI.js`
   - Preset selector dropdown
   - Badge display (profile/character/chat)
   - Button row (Save, Rename, Delete, Import, Export, Duplicate)
   - Sticky buttons

2. Create `operationArtifactEditor.js`
   - Modal popup component
   - Form fields (prompt, prefill, connection profile, preset, flag)
   - Auto-save on change
   - Version increment handling

3. Create `operationTypeSelector.js`
   - Per-operation artifact dropdown
   - Button row (Edit, Rename, Delete, Duplicate)

4. Update `settingsUI.js`
   - Add "Operations Configuration" collapsible section
   - Integrate preset selector
   - Integrate operation type selectors (8 total)

5. Add CSS styling
   - `operationsPresetsUI.css`
   - Badge styles
   - Button styles
   - Modal styles

**Deliverable:** Complete UI for managing presets and artifacts

---

### Phase 4: Integration (Week 3)

**Goal:** Refactor all operation config access sites

**Tasks:**
1. Identify all access sites
   ```bash
   grep -rn "get_settings.*_prompt\|get_settings.*_prefill\|get_settings.*_connection_profile" --include="*.js"
   ```

2. Refactor operation access
   - `recapping.js` - Use `resolveOperationConfig('scene_recap')`
   - `autoSceneBreakDetection.js` - Use `resolveOperationConfig('auto_scene_break')`
   - `runningSceneRecap.js` - Use `resolveOperationConfig('running_scene_recap')`
   - `sceneBreak.js` - Use `resolveOperationConfig('scene_recap_error_detection')`
   - Auto-Lorebooks files (4 operations)

3. Update selectors
   - `selectorsExtension.js` - Add new UI element selectors
   - Validate all new selectors exist

**Deliverable:** All code uses new resolution system

---

### Phase 5: Testing (Week 3-4)

**Goal:** Comprehensive testing

**Tasks:**
1. Unit tests
   - `tests/unit/operationArtifacts.spec.js`
   - `tests/unit/operationsPresets.spec.js`
   - `tests/unit/operationsPresetsResolution.spec.js`
   - `tests/unit/operationsPresetsMigration.spec.js`

2. Integration tests
   - `tests/integration/operationsPresetsWorkflow.spec.js`
     - Create preset
     - Edit artifacts
     - Sticky to character/chat
     - Import/export
   - `tests/integration/operationsPresetsUI.spec.js`
     - UI interactions
     - Auto-save behavior
     - Version increments

3. Migration tests
   - Test with real v1.x profiles
   - Verify customization detection
   - Validate artifact creation
   - Verify zero data loss

**Deliverable:** All tests passing

---

### Phase 6: Documentation & Release (Week 4)

**Goal:** Release to users

**Tasks:**
1. Update documentation
   - `README.md` - Add Operations Presets section
   - `CLAUDE.md` - Update with new system
   - `docs/features/OPERATIONS_PRESETS.md` - Detailed guide

2. Create user guide
   - How to create presets
   - How to edit artifacts
   - How to import/export
   - How to sticky presets

3. Version bump
   - Update to v2.0.0
   - Update manifest.json

4. Changelog
   - Document all changes
   - Migration notes
   - Breaking changes (none)

**Deliverable:** v2.0.0 released

---

## 9. File Changes

### New Files to Create

```
operationArtifacts.js            - Artifact CRUD and versioning
operationsPresets.js             - Preset CRUD and sticky management
operationsPresetsResolution.js   - Resolution algorithm
operationsPresetsMigration.js    - Migration from v1.x
operationsPresetsExport.js       - Export logic
operationsPresetsImport.js       - Import logic
operationsPresetsUI.js           - Preset selector UI
operationArtifactEditor.js       - Artifact editor modal
operationTypeSelector.js         - Per-operation artifact selector
operationsPresetsUI.css          - Styling
```

### Files to Modify

```
settingsUI.js                    - Add Operations Configuration section
recapping.js                     - Use resolveOperationConfig()
autoSceneBreakDetection.js       - Use resolveOperationConfig()
runningSceneRecap.js             - Use resolveOperationConfig()
sceneBreak.js                    - Use resolveOperationConfig()
[Auto-Lorebooks files]           - Use resolveOperationConfig()
selectorsExtension.js            - Add new UI selectors
eventHandlers.js                 - Add migration call
index.js                         - Export new functions
```

### Selectors to Add

```javascript
// selectorsExtension.js

export const EXT_SELECTORS = {
  // ... existing selectors

  // Operations Presets
  OPERATIONS_CONFIG_SECTION: '#auto_recap_operations_config_section',
  PRESET_SELECTOR: '#auto_recap_preset_selector',
  PRESET_SAVE_BTN: '#auto_recap_preset_save',
  PRESET_RENAME_BTN: '#auto_recap_preset_rename',
  PRESET_DELETE_BTN: '#auto_recap_preset_delete',
  PRESET_IMPORT_BTN: '#auto_recap_preset_import',
  PRESET_EXPORT_BTN: '#auto_recap_preset_export',
  PRESET_DUPLICATE_BTN: '#auto_recap_preset_duplicate',
  PRESET_STICKY_CHARACTER_BTN: '#auto_recap_preset_sticky_character',
  PRESET_STICKY_CHAT_BTN: '#auto_recap_preset_sticky_chat',

  // Per-operation sections (repeat for all 8)
  OPERATION_SCENE_RECAP_SECTION: '#auto_recap_op_scene_recap',
  OPERATION_SCENE_RECAP_ARTIFACT: '#auto_recap_op_scene_recap_artifact',
  OPERATION_SCENE_RECAP_EDIT: '#auto_recap_op_scene_recap_edit',
  OPERATION_SCENE_RECAP_RENAME: '#auto_recap_op_scene_recap_rename',
  OPERATION_SCENE_RECAP_DELETE: '#auto_recap_op_scene_recap_delete',
  OPERATION_SCENE_RECAP_DUPLICATE: '#auto_recap_op_scene_recap_duplicate',
  // ... repeat for other 7 operations

  // Artifact editor modal
  ARTIFACT_EDITOR_MODAL: '#auto_recap_artifact_editor_modal',
  ARTIFACT_EDITOR_NAME: '#auto_recap_artifact_editor_name',
  ARTIFACT_EDITOR_DESCRIPTION: '#auto_recap_artifact_editor_description',
  ARTIFACT_EDITOR_PROMPT: '#auto_recap_artifact_editor_prompt',
  ARTIFACT_EDITOR_PREFILL: '#auto_recap_artifact_editor_prefill',
  ARTIFACT_EDITOR_CONNECTION: '#auto_recap_artifact_editor_connection',
  ARTIFACT_EDITOR_PRESET: '#auto_recap_artifact_editor_preset',
  ARTIFACT_EDITOR_INCLUDE_FLAG: '#auto_recap_artifact_editor_include_flag',
  ARTIFACT_EDITOR_SAVE: '#auto_recap_artifact_editor_save',
  ARTIFACT_EDITOR_CANCEL: '#auto_recap_artifact_editor_cancel'
};
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

**File:** `tests/unit/operationsPresetsResolution.spec.js`

```javascript
describe('Operations Presets Resolution', () => {
  test('should resolve chat sticky over character sticky', () => {
    // Setup
    setupProfile('Default', 'Default Preset');
    setupCharacterSticky('alice.png', 'Alice Preset');
    setupChatSticky('chat-123', 'Chat Preset');
    mockCurrentCharacter('alice.png');
    mockCurrentChat('chat-123');

    // Execute
    const preset = resolveOperationsPreset();

    // Assert
    expect(preset).toBe('Chat Preset');
  });

  test('should resolve operation config from preset', () => {
    // Setup
    createArtifact('scene_recap', 'Custom v1', { prompt: 'Custom prompt' });
    createPreset('Test Preset', {
      scene_recap: 'Custom v1'
    });
    setActivePreset('Test Preset');

    // Execute
    const config = resolveOperationConfig('scene_recap');

    // Assert
    expect(config.prompt).toBe('Custom prompt');
  });

  test('should fallback to default when artifact not found', () => {
    // Setup
    createPreset('Test Preset', {
      scene_recap: 'Nonexistent Artifact'
    });
    setActivePreset('Test Preset');

    // Execute
    const config = resolveOperationConfig('scene_recap');

    // Assert
    expect(config.name).toBe('Default');
    expect(config.isDefault).toBe(true);
  });
});
```

### 10.2 Integration Tests

**File:** `tests/integration/operationsPresetsWorkflow.spec.js`

```javascript
describe('Operations Presets Workflow', () => {
  test('should create preset, edit artifact, sticky to character', async () => {
    // Navigate to settings
    await navigateToSettings();

    // Create new preset
    await clickPresetDuplicate();
    await renamePreset('My Custom Preset');

    // Edit scene recap artifact
    await selectOperation('scene_recap');
    await clickArtifactEdit();
    await fillPrompt('My custom prompt');
    await saveArtifact();

    // Verify new version created
    const artifactName = await getSelectedArtifact('scene_recap');
    expect(artifactName).toContain('v2');

    // Sticky to character
    await selectCharacter('alice.png');
    await clickStickyToCharacter();

    // Verify sticky
    const stickyPreset = getCharacterStickyPreset('alice.png');
    expect(stickyPreset).toBe('My Custom Preset');

    // Navigate to chat with Alice
    await openChatWithCharacter('alice.png');

    // Verify resolved preset
    const resolved = resolveOperationsPreset();
    expect(resolved).toBe('My Custom Preset');
  });

  test('should export and import preset', async () => {
    // Create preset with custom artifacts
    await createTestPreset('Export Test', {
      scene_recap: 'Custom Recap v1'
    });

    // Export
    await selectPreset('Export Test');
    const exportedJson = await exportPreset();

    // Parse and validate
    const data = JSON.parse(exportedJson);
    expect(data.preset_name).toBe('Export Test');
    expect(data.operations.scene_recap.artifact_name).toBe('Custom Recap v1');

    // Import in new session
    await clearAllPresets();
    await importPreset(exportedJson);

    // Verify imported
    const presets = listPresets();
    expect(presets).toContain('Export Test');

    // Verify artifacts created
    const artifact = getArtifact('scene_recap', 'Custom Recap v1 (imported)');
    expect(artifact).toBeTruthy();
  });
});
```

### 10.3 Migration Tests

**File:** `tests/unit/operationsPresetsMigration.spec.js`

```javascript
describe('Operations Presets Migration', () => {
  test('should detect old scattered settings', () => {
    // Setup old format
    setupOldProfile('Default', {
      scene_recap_prompt: 'Old prompt',
      scene_recap_prefill: '{'
    });

    // Execute
    const needsMigration = needsOperationsPresetsMigration();

    // Assert
    expect(needsMigration).toBe(true);
  });

  test('should migrate customized settings to artifacts', async () => {
    // Setup
    setupOldProfile('Default', {
      scene_recap_prompt: 'Custom prompt',  // Different from default
      scene_recap_prefill: '{'
    });

    // Execute
    await migrateToOperationsPresets();

    // Assert
    const artifacts = getArtifacts('scene_recap');
    const customArtifact = artifacts.find(a => a.prompt === 'Custom prompt');
    expect(customArtifact).toBeTruthy();
    expect(customArtifact.name).toContain('v1');
  });

  test('should use default artifacts for non-customized settings', async () => {
    // Setup
    const defaultPrompt = getDefaultPrompt('scene_recap');
    setupOldProfile('Default', {
      scene_recap_prompt: defaultPrompt,  // Same as default
      scene_recap_prefill: '{'
    });

    // Execute
    await migrateToOperationsPresets();

    // Assert
    const preset = getPreset('Default (migrated)');
    expect(preset.operations.scene_recap).toBe('Default');
  });
});
```

---

## Summary

This UI-driven operations presets system provides:

1. **Two-layer architecture** - Presets reference reusable artifacts
2. **Auto-versioning** - Edits create v<N+1> automatically
3. **Shareable configs** - Export/import with API key safety
4. **Flexible organization** - Character/chat stickies for context-specific configs
5. **Clean migration** - Zero data loss from v1.x
6. **Intuitive UI** - Clear preset/artifact management
7. **Artifact reuse** - One artifact in multiple presets

**Next Steps:**
1. Review this plan
2. Provide feedback
3. Begin Phase 1 implementation

---

**END OF PLANNING DOCUMENT**

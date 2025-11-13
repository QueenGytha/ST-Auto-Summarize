# Data Storage Inventory

Complete inventory of all data storage locations used by the ST-Auto-Recap extension, organized by storage mechanism and persistence characteristics.

---

## Overview

The extension uses **4 primary storage locations**:

1. **Message-level data** (`message.extra.auto_recap.*`)
2. **Chat metadata** (`chat_metadata.auto_recap*`)
3. **Extension settings** (`extension_settings.auto_recap`)
4. **Lorebook entries** (special entries in attached lorebook)

---

## 1. Message-Level Data

**Storage Location:** `message.extra.auto_recap.*`

**Access Functions:**
- `get_data(message, key)` - Read data from message
- `set_data(message, key, value)` - Write data to message

**Persistence:** Saved in chat JSON file (per-message, per-chat)

**Isolation:** Perfectly isolated per message and per chat

### Data Fields

#### Regular Recap Fields

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `memory` | string | The recap text for this message | `recapping.js:recap_text()` |
| `include` | string | Inclusion status (e.g., 'Recap of message(s)') | `memoryCore.js` |
| `prefill` | string | Prefill text used when generating recap | `recapping.js:recap_text()` |
| `reasoning` | string | Reasoning for the recap (if generated) | `recapping.js:recap_text()` |
| `error` | string | Error message if recap generation failed | `recapping.js:recap_text()` |
| `edited` | boolean | Whether the recap was manually edited | `messageData.js:edit_memory()` |
| `exclude` | boolean | Whether to exclude this recap from injection | `memoryCore.js` |

#### Scene Recap Fields

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `scene_recap_memory` | string | Scene-level recap text | `sceneBreak.js` |
| `scene_recap_versions` | Array | All versions of scene recap | `sceneBreak.js` |
| `scene_recap_current_index` | number | Active version index | `sceneBreak.js` |
| `scene_break_name` | string | Name of the scene break | `sceneBreak.js` |

#### Metadata Fields

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `profile_used` | string | Profile name used for this recap | `recapping.js` |
| `settings_hash` | string | Hash of settings when recap was generated | `recapping.js` |
| `timestamp` | number | When the recap was generated | `recapping.js` |

---

## 2. Chat Metadata

**Storage Location:** `chat_metadata.auto_recap*`

**Access:** Direct property access via `chat_metadata.auto_recap_<key>`

**Persistence:** Saved in chat JSON file (per-chat)

**Isolation:** Isolated per chat (validated in code)

### Data Fields

#### Chat Configuration

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `chat_metadata.auto_recap.enabled` | boolean | Whether recapping is enabled for this chat | Set by user toggle |
| `chat_metadata.auto_recap.settings_hash` | string | Hash of current settings | Calculated on settings change |

#### Running Scene Recap

**Storage Location:** `chat_metadata.auto_recap_running_scene_recaps`

**Validation:** Chat ID validated to prevent cross-chat contamination (lines 28-39 in `runningSceneRecap.js`)

```javascript
// Validation code from runningSceneRecap.js:28-39
if (chat_metadata.auto_recap_running_scene_recaps.chat_id !== currentChatId) {
  // Data belongs to different chat - reset to prevent contamination
  error(
    SUBSYSTEM.RUNNING,
    `Running recap storage belongs to chat '${chat_metadata.auto_recap_running_scene_recaps.chat_id}', ` +
    `but current chat is '${currentChatId}'. Resetting to prevent cross-chat contamination.`
  );
  chat_metadata.auto_recap_running_scene_recaps = {
    chat_id: currentChatId,
    current_version: 0,
    versions: []
  };
}
```

**Data Structure:**
```typescript
interface RunningSceneRecapStorage {
  chat_id: string;                    // Chat ID for validation
  current_version: number;            // Active version number
  versions: RunningRecapVersion[];    // All versions
}

interface RunningRecapVersion {
  version: number;           // Version number
  timestamp: number;         // When created
  content: string;           // The running recap text
  scene_count: number;       // Number of scenes included
  excluded_count: number;    // Number of scenes excluded
  prev_scene_index: number;  // Previous scene index (for incremental updates)
  new_scene_index: number;   // New scene index (for incremental updates)
}
```

**Source:** `runningSceneRecap.js:19-43`

#### Combined Recap

**Storage Location:** `chat_metadata.auto_recap.combined_recap`

**Data Structure:**
```typescript
interface CombinedRecapStorage {
  chat_id: string;           // Chat ID for validation
  content: string;           // Combined recap text
  message_count: number;     // Number of messages included
  timestamp: number;         // When generated
}
```

**Source:** `recapToLorebookProcessor.js` (combined recap generation)

#### Auto-Lorebooks Metadata

**Storage Location:** `chat_metadata.auto_lorebooks`

**Data Structure:**
```typescript
interface AutoLorebooksMetadata {
  lorebookName: string;      // Name of attached lorebook
  attachedAt: number;        // Timestamp when attached
  registry: RegistryState;   // Registry index (cached)
}

interface RegistryState {
  index: Record<string, RegistryRecord>;  // UID -> record mapping
}

interface RegistryRecord {
  uid: number | string;      // Entry UID
  id: string;                // Entry ID (string version)
  type: string;              // Entity type (character, location, etc.)
  name: string;              // Entity name
  comment: string;           // Comment (same as name)
  aliases: string[];         // Aliases/keywords
  synopsis: string;          // Entity synopsis
}
```

**Source:** `lorebookManager.js:316-320`, `recapToLorebookProcessor.js:361-374`

#### Processed Recaps Tracker

**Storage Location:** `chat_metadata.auto_lorebooks_processed_recaps`

**Type:** `string[]` (array of recap IDs)

**Purpose:** Track which recaps have been processed to avoid duplicates

**Source:** `recapToLorebookProcessor.js:83-100`

---

## 3. Extension Settings

**Storage Location:** `extension_settings.auto_recap`

**Access Functions:**
- `get_settings(key)` - Read setting
- `set_settings(key, value)` - Write setting

**Persistence:** Saved in global extension settings (persists across all chats)

**Isolation:** Global (shared across all chats)

### Settings Structure

#### Global Settings

| Field | Type | Description | Source |
|-------|------|-------------|--------|
| `profiles` | object | Dictionary of profiles by name | `settingsManager.js:24-34` |
| `character_profiles` | object | Character ID → profile name mapping | `settingsManager.js:26` |
| `chat_profiles` | object | Chat ID → profile name mapping | `settingsManager.js:27` |
| `profile` | string | Current active profile name | `settingsManager.js:28` |
| `notify_on_profile_switch` | boolean | Show notification on profile switch | `settingsManager.js:29` |
| `chats_enabled` | object | Chat ID → enabled state mapping | `settingsManager.js:30` |
| `global_toggle_state` | boolean | Global toggle state | `settingsManager.js:31` |
| `disabled_group_characters` | object | Group ID → disabled characters list | `settingsManager.js:32` |
| `memory_edit_interface_settings` | object | Memory editor settings | `settingsManager.js:33` |

#### Profile Settings (117+ settings per profile)

**Note:** Each profile contains a complete copy of all default settings. See `defaultSettings.js` for the full list.

**Key Profile Settings Categories:**
- Connection profiles (for recap generation)
- Completion presets
- Prompts (recap, scene recap, running recap, etc.)
- Auto-generation settings
- Memory injection settings (position, depth, role, etc.)
- Scene break detection settings
- Auto-Lorebooks settings (tracking, recap processing)

**Source:** `settingsManager.js:48-158`, `defaultSettings.js`

#### Auto-Lorebooks Global Settings

**Storage Location:** `extension_settings.autoLorebooks`

**Data Structure:**
```typescript
interface AutoLorebooksGlobalSettings {
  nameTemplate: string;              // Template for lorebook names
  deleteOnChatDelete: boolean;       // Delete lorebook when chat deleted
  autoReorderAlphabetically: boolean; // Auto-reorder entries alphabetically
  entity_types: EntityTypeDefinition[]; // Entity type definitions
}
```

**Source:** `settingsManager.js:37-44`, `lorebookManager.js:548-553`

---

## 4. Lorebook Entries

**Storage Location:** Lorebook file referenced by `chat_metadata.world_info`

**Access Functions:**
- `loadWorldInfo(lorebookName)` - Load lorebook data
- `saveWorldInfo(lorebookName, data, skipCacheInvalidation)` - Save lorebook data
- `createWorldInfoEntry(lorebookName, data)` - Create new entry
- `deleteWorldInfoEntry(data, uid, options)` - Delete entry

**Persistence:** Saved in lorebook JSON files (separate from chat files)

**Isolation:** **SHARED across all chats that reference the same lorebook**

### Special Entries (Internal Use)

#### Operation Queue Entry

**Comment:** `__operation_queue`

**Purpose:** Persistent operation queue that survives page reloads

**Data Structure:**
```typescript
interface QueueEntry {
  uid: number;              // Lorebook entry UID
  comment: '__operation_queue';
  content: string;          // JSON-serialized QueueState
  disable: true;            // Entry disabled (not injected)
  constant: false;
  preventRecursion: true;
  ignoreBudget: true;
}

interface QueueState {
  operations: Operation[];
  currentOperation: Operation | null;
  isProcessing: boolean;
  lastProcessed: number;
}

interface Operation {
  id: string;                    // Unique operation ID
  type: OperationType;           // Operation type (RECAP, SCENE_RECAP, etc.)
  priority: number;              // Priority (lower = higher priority)
  metadata: Record<string, any>; // Operation-specific metadata
  attempts: number;              // Number of retry attempts
  maxAttempts: number;           // Maximum retry attempts
  createdAt: number;             // Timestamp when created
  startedAt?: number;            // Timestamp when started
}
```

**Source:** `operationQueue.js:180-256` (load), `operationQueue.js:338-405` (save)

#### Registry Entries

**Comment Pattern:** `_registry_{type}` (e.g., `_registry_character`, `_registry_location`)

**Purpose:** Store entity registry for each type

**Data Structure:**
```typescript
interface RegistryEntry {
  uid: number;                    // Lorebook entry UID
  comment: '_registry_{type}';    // Comment identifies type
  content: string;                // Text listing of all entities of this type
  tags: ['auto_lorebooks_registry']; // Tag for identification
  disable: boolean;               // Depends on type flags (constant entities are enabled)
  constant: boolean;              // Depends on type flags
  preventRecursion: true;
  ignoreBudget: true;
}
```

**Content Format:**
```
[Registry: {type}]
- uid: {uid} | name: {name} | aliases: {aliases} | synopsis: {synopsis}
- uid: {uid} | name: {name} | aliases: {aliases} | synopsis: {synopsis}
...
```

**Source:** `lorebookManager.js:56-116` (creation), `recapToLorebookProcessor.js:454-500` (parsing)

### User Entries (Generated from Recaps)

**Comment Pattern:** `{type}-{name}` (e.g., `character-Alice`, `location-Exiles Gate`)

**Purpose:** Store lorebook entries extracted from recaps

**Data Structure:**
```typescript
interface UserEntry {
  uid: number;              // Lorebook entry UID
  comment: string;          // "{type}-{name}"
  content: string;          // Entry content (PList format)
  key: string[];            // Primary keywords
  keysecondary: string[];   // Secondary keywords (must co-occur)
  order: number;            // Display order
  position: number;         // Injection position (0=before, 1=after)
  depth: number;            // Injection depth
  role: number;             // Role filter
  constant: boolean;        // Always inject
  disable: boolean;         // Entry disabled
  sticky: number;           // Sticky rounds
  excludeRecursion: boolean; // Exclude from recursion
  preventRecursion: boolean; // Prevent recursion
  ignoreBudget: boolean;    // Ignore token budget
  tags: string[];           // Tags for categorization
}
```

**Source:** `lorebookManager.js:761-802` (creation), `recapToLorebookProcessor.js:278-314` (normalization)

---

## Storage Isolation Analysis

### Perfectly Isolated (Per-Chat)

✅ **Message-level data** (`message.extra.auto_recap.*`)
- Saved in chat JSON file
- Each chat has its own message array
- No cross-chat contamination possible

✅ **Chat metadata** (`chat_metadata.auto_recap*`)
- Saved in chat JSON file
- Validated with chat ID checks (running scene recap)
- Each chat has its own metadata object
- No cross-chat contamination possible

### Globally Shared

⚠️ **Extension settings** (`extension_settings.auto_recap`)
- Shared across all chats
- Profile system allows per-character/chat overrides
- Global toggle state affects all chats (if enabled)

### Shared Across Referenced Chats

❌ **Lorebook entries** (special entries in attached lorebook)
- **Operation queue** (`__operation_queue`): SHARED
- **Registry entries** (`_registry_*`): SHARED
- **User entries**: SHARED

**Problem:** All chats/checkpoints/branches that reference the same lorebook share these entries.

**Impact:**
- Main chat and checkpoint reference same lorebook file
- Queue operations contaminate across timelines
- Registry updates contaminate across timelines
- User entry modifications affect all timelines

**Solution:** Checkpoint integration requires lorebook cloning (see `CHECKPOINT_INTEGRATION_COMPLETE.md`)

---

## Data Flow Examples

### Message Recap Generation

1. User sends message
2. `eventHandlers.js:MESSAGE_SENT` triggers
3. `queueIntegration.js:queueRecap()` enqueues operation
4. Operation saved to `__operation_queue` lorebook entry (SHARED)
5. Queue processes operation
6. `recapping.js:recap_text()` generates recap
7. Result saved to `message.extra.auto_recap.memory` (ISOLATED)
8. Visual indicator updated in UI

### Scene Recap Generation

1. User marks message as scene break
2. `queueIntegration.js:queueSceneRecap()` enqueues operation
3. Operation saved to `__operation_queue` lorebook entry (SHARED)
4. Queue processes operation
5. `sceneBreak.js:generate_scene_recap()` generates recap
6. Result saved to `message.extra.auto_recap.scene_recap_memory` (ISOLATED)
7. Running recap auto-generation triggered (if enabled)

### Running Scene Recap Update

1. Scene recap completed
2. `runningSceneRecap.js:auto_generate_running_recap()` called
3. `queueIntegration.js:queueGenerateRunningRecap()` enqueues operation
4. Operation saved to `__operation_queue` lorebook entry (SHARED)
5. Queue processes operation
6. `runningSceneRecap.js:generate_running_scene_recap()` generates recap
7. Result saved to `chat_metadata.auto_recap_running_scene_recaps` (ISOLATED, chat ID validated)
8. New version added to versions array

### Lorebook Entry Processing

1. Recap contains `setting_lore` array
2. `recapToLorebookProcessor.js:processRecapToLorebook()` called
3. Registry state loaded from `chat_metadata.auto_lorebooks.registry` (CACHED)
4. Existing entries loaded from lorebook (SHARED)
5. For each entity:
   - Lorebook Entry Lookup stage (LLM call)
   - LorebookEntryDeduplicate stage (LLM call if duplicates)
   - Merge or create entry in lorebook (SHARED)
   - Update registry in `chat_metadata.auto_lorebooks.registry` (CACHED)
   - Update registry entry in lorebook `_registry_{type}` (SHARED)
6. Metadata saved

---

## Checkpoint/Branch Implications

### Data That Survives Checkpoint Switch

✅ **Message-level data** - Each checkpoint has its own chat JSON file with complete message history
✅ **Chat metadata** - Each checkpoint has its own `chat_metadata` object (replaced on load)

### Data That Does NOT Survive Checkpoint Switch

❌ **Extension settings** - Global, shared across all chats/checkpoints
❌ **Lorebook entries** - All checkpoints reference same lorebook file (shared state)

### Critical Problems

1. **Queue Contamination**
   - Checkpoint A enqueues recap for message 50
   - Switch to Checkpoint B (message 30)
   - Queue still has operation for message 50 (doesn't exist in B)
   - Operation fails or contaminates timeline

2. **Registry Contamination**
   - Main chat at message 100, registry has 50 entities
   - Create checkpoint at message 50, registry has 25 entities
   - Switch to checkpoint, registry still shows 50 entities (wrong)
   - Add new entity in checkpoint, contaminates main chat registry

3. **Running Recap Desync**
   - Main chat has running recap up to scene 10
   - Checkpoint has running recap up to scene 5
   - `chat_metadata.auto_recap_running_scene_recaps` correctly isolates
   - BUT: Version index (e.g., version 7) may reference scene index 100 which doesn't exist in checkpoint

### Solution Requirements

See `CHECKPOINT_INTEGRATION_COMPLETE.md` for complete solution:

1. **Requirements Validation**
   - Queue must be empty at checkpoint creation
   - Message must be scene break with scene recap
   - Running scene recap must exist

2. **Lorebook Cloning**
   - Clone lorebook for each checkpoint
   - Each checkpoint gets isolated `__operation_queue`
   - Each checkpoint gets isolated `_registry_*` entries
   - Each checkpoint gets isolated user entries

3. **State Recording**
   - Record running recap version in checkpoint metadata
   - Record lorebook name in checkpoint metadata
   - Record scene info in checkpoint metadata

4. **State Restoration**
   - On `CHAT_CHANGED` event, verify running recap version exists
   - Verify lorebook reference matches checkpoint metadata
   - Display warnings for mismatches

---

## File References

### Storage Access

- **Message data:** `messageData.js:13-78`
- **Chat metadata:** Direct access throughout codebase
- **Extension settings:** `settingsManager.js:160-168`
- **Lorebook entries:** `lorebookManager.js:761-1053`

### Data Structures

- **Running recap storage:** `runningSceneRecap.js:19-43`
- **Registry state:** `recapToLorebookProcessor.js:361-374`
- **Queue state:** `operationQueue.js:180-256`
- **Auto-Lorebooks metadata:** `lorebookManager.js:654-661`

### Validation

- **Chat ID validation:** `runningSceneRecap.js:28-39`
- **Lorebook existence:** `lorebookManager.js:243-250`
- **Registry hydration:** `recapToLorebookProcessor.js:502-521`

---

## Group Chat Support

The extension fully supports group chats with some storage location differences compared to solo chats.

### Group Chat Detection

**Code Location:** `lorebookManager.js:179-227`

```javascript
if (selected_group) {
  isGroupChat = true;
  const group = groups?.find((x) => x.id === selected_group);
  if (group) {
    groupName = group.name;
    chatId = group.chat_id;
    characterName = groupName;  // Use group name as character name
  }
}
```

### Storage Differences

| Aspect | Solo Chat | Group Chat |
|--------|-----------|------------|
| **Checkpoint metadata** | Stored in chat file first element | Stored in `group.past_metadata[chatName]` |
| **Message data** | `message.extra.auto_recap.*` | Same: `message.extra.auto_recap.*` ✅ |
| **Chat metadata** | `chat_metadata.auto_recap*` | Same: `chat_metadata.auto_recap*` ✅ |
| **Lorebook reference** | `chat_metadata.world_info` | Same: `chat_metadata.world_info` ✅ |
| **Save API** | `/api/chats/save` | `/api/chats/group/save` |
| **Metadata storage** | Chat file first element | `group.past_metadata` object |

### Group Metadata Storage

**SillyTavern's `group.past_metadata`:**

From `group-chats.js:2100-2127`:
```javascript
export async function saveGroupBookmarkChat(groupId, name, metadata, mesId) {
  const group = groups.find(x => x.id === groupId);
  if (!group) { return; }

  // Store checkpoint metadata in group.past_metadata
  group.past_metadata[name] = { ...chat_metadata, ...(metadata || {}) };
  group.chats.push(name);

  const trimmed_chat = (mesId !== undefined && mesId >= 0 && mesId < chat.length)
    ? chat.slice(0, parseInt(mesId) + 1)
    : chat;

  await editGroup(groupId, true, false);
  await fetch('/api/chats/group/save', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: JSON.stringify({ id: name, chat: [...trimmed_chat] }),
  });
}
```

**Key Insight:** `group.past_metadata` acts as a metadata cache for ALL group chats. When switching group chats:
1. Current `chat_metadata` saved to `group.past_metadata[oldChatId]`
2. `chat_metadata` replaced with `group.past_metadata[newChatId]`

**Checkpoint Behavior:**
- Solo: Metadata merged and saved in checkpoint chat file
- Group: Metadata merged and saved in `group.past_metadata[checkpointName]`
- **Merge/replace behavior is IDENTICAL** ✅

### Checkpoint Integration Implications

**For Group Chats:**
1. ✅ Message data isolation works identically
2. ✅ Chat metadata isolation works identically
3. ✅ Lorebook cloning required (same as solo)
4. ✅ Requirements validation works identically
5. ⚠️ Lorebook naming should include group context

**Lorebook Naming for Groups:**
```javascript
function generateCheckpointLorebookName(sourceName, checkpointName) {
  const context = selected_group
    ? `Group_${groups.find(x => x.id === selected_group)?.name || 'Unknown'}`
    : `Character_${characters[this_chid]?.name || 'Unknown'}`;

  return `${sourceName}__CP_${checkpointName}__${context}`;
}
```

**Example:**
```
Solo chat: "z-AutoLB-Main__CP_Checkpoint5__Character_Alice"
Group chat: "z-AutoLB-Main__CP_Checkpoint5__Group_AdventureParty"
```

---

## Profile System

The extension has TWO separate profile systems that can cause confusion:

### 1. Settings Profiles (Extension Profiles)

**Purpose:** Store different configurations of extension settings

**Storage:** `extension_settings.auto_recap.profiles`

**Scope:** Extension settings only (prompts, injection settings, auto-generation, etc.)

**Management:** `profileManager.js`

**Key Functions:**
- `load_profile(profile)` - Load a settings profile
- `save_profile(profile)` - Save current settings to profile
- `auto_load_profile()` - Auto-load profile for character/chat

**Profile Structure:**
```javascript
extension_settings.auto_recap.profiles = {
  "Default": {
    // Full copy of all extension settings (117+ settings)
    auto_recap_enabled: true,
    recap_prompt: "...",
    connection_profile: "GPT-4-Recap",  // Link to connection profile
    // ... all other settings
  },
  "Claude-Profile": {
    // Another complete copy with different values
    auto_recap_enabled: true,
    recap_prompt: "...",
    connection_profile: "Claude-Recap",
    // ...
  }
};
```

**Profile Mapping:**
```javascript
extension_settings.auto_recap.character_profiles = {
  "Alice": "Alice-Profile",
  "Bob": "Default"
};

extension_settings.auto_recap.chat_profiles = {
  "2025-01-12-Story": "Special-Profile"
};
```

**Auto-Loading:** When `CHAT_CHANGED` fires:
```javascript
// From eventHandlers.js:62
async function handleChatChanged() {
  auto_load_profile();  // Loads character or chat specific profile
  // ...
}
```

### 2. Connection Profiles (API Endpoint Profiles)

**Purpose:** Select which API endpoint to use for recap generation

**Storage:** Managed by separate "Connection Profile Manager" extension

**Scope:** API connection settings (endpoint, model, API key, etc.)

**Management:** `connectionProfiles.js`

**Key Functions:**
- `get_recap_connection_profile()` - Get connection profile for recap generation
- `set_connection_profile(name)` - Switch to a connection profile
- `verify_connection_profile(name)` - Check if profile exists

**Usage in Extension:**
```javascript
// From connectionProfiles.js:83-109
async function get_recap_connection_profile() {
  let name = get_settings('connection_profile');  // From extension settings profile

  // Validate profile exists and is active
  if (name === "" || !(await verify_connection_profile(name)) || !check_connection_profiles_active()) {
    name = await get_current_connection_profile();  // Use current ST profile
  }

  return name;
}
```

**Profile Switching:**
```javascript
// From connectionProfiles.js:111-125
async function set_connection_profile(name) {
  if (!check_connection_profiles_active()) {return;}
  if (!name) {return;}
  if (name === (await get_current_connection_profile())) {return;}
  if (!(await verify_connection_profile(name))) {return;}

  debug(`Setting connection profile to "${name}"`);
  toastr.info(`Setting connection profile to "${name}"`);

  const ctx = getContext();
  await ctx.executeSlashCommandsWithOptions(`/profile ${name}`);

  await new Promise((resolve) => setTimeout(resolve, 500));  // 500ms delay
}
```

**IMPORTANT:** Connection profile switching is **async with 500ms delay**. This prevents rapid switching race conditions.

### Profile System Interaction

**Example Flow:**
```
1. User opens chat with character "Alice"
2. CHAT_CHANGED event fires
3. auto_load_profile() runs
4. Loads extension profile "Alice-Profile" from:
   extension_settings.auto_recap.profiles["Alice-Profile"]
5. "Alice-Profile" has connection_profile: "GPT-4-Recap"
6. When generating recap:
   - get_recap_connection_profile() returns "GPT-4-Recap"
   - set_connection_profile("GPT-4-Recap") switches ST to that API
   - recap generated using GPT-4-Recap API endpoint
   - set_connection_profile() switches back to original (if different)
```

### Checkpoint Implications for Profiles

**Settings Profiles:**
- ❌ **NOT** saved in checkpoint metadata
- ✅ Auto-loaded based on character/chat when switching to checkpoint
- ✅ Correct behavior: Character/chat profiles take precedence over checkpoint creator's profile

**Connection Profiles:**
- ❌ **NOT** saved in checkpoint metadata
- ✅ Determined by loaded extension settings profile
- ⚠️ Async switching (500ms delay) - potential timing issue

**Example Scenario:**
```
Main Chat (Extension Profile A: connection_profile = "GPT-4"):
  - Create checkpoint at message 50
  - Checkpoint metadata does NOT include profile info

User switches to Extension Profile B (connection_profile = "Claude"):
  - Loads checkpoint
  - auto_load_profile() runs
  - Loads profile based on character (might be A, B, or Default)
  - New recaps generated use loaded profile's connection_profile

Result: Profile choice is user-controlled, not checkpoint-controlled ✅
```

**Design Decision:** Checkpoints do NOT save profile information because:
1. Profile is a **setting**, not chat state
2. Character/chat profiles should take precedence
3. User may intentionally want different profile for checkpoint
4. Allows flexibility (regenerate recaps with different profiles/models)

**Risk:** None - current behavior is correct

---

## Summary Table

| Storage Location | Isolation | Persistence | Checkpoint Behavior | Cloning Required |
|-----------------|-----------|-------------|---------------------|------------------|
| `message.extra.auto_recap.*` | Per-message, per-chat | Chat JSON file | ✅ Isolated (new chat file) | ❌ No (automatic) |
| `chat_metadata.auto_recap*` | Per-chat | Chat JSON file | ✅ Isolated (replaced on load) | ❌ No (automatic) |
| `extension_settings.auto_recap` | Global | Extension settings | ⚠️ Shared (global) | ❌ No (global state) |
| Lorebook `__operation_queue` | Shared (per-lorebook) | Lorebook file | ❌ Shared (same lorebook) | ✅ **Yes** |
| Lorebook `_registry_*` | Shared (per-lorebook) | Lorebook file | ❌ Shared (same lorebook) | ✅ **Yes** |
| Lorebook user entries | Shared (per-lorebook) | Lorebook file | ⚠️ Shared (same lorebook) | ⚠️ Optional (user entries can be shared or cloned) |

---

## Conclusion

The extension uses a mix of isolated (message-level, chat metadata) and shared (lorebook entries) storage. For checkpoint/branch support:

1. **Message-level data** and **chat metadata** automatically isolate ✅
2. **Extension settings** remain global (acceptable) ⚠️
3. **Lorebook entries** MUST be cloned to prevent contamination ❌

**Next Steps:** See `CHECKPOINT_INTEGRATION_COMPLETE.md` for implementation plan.

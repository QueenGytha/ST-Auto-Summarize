# Automatic Lorebook Creation - Overview

## What is Automatic Lorebook Creation?

Automatic Lorebook Creation is the foundational feature of the lorebook integration system that **automatically creates a dedicated chat-specific lorebook** when a chat is first loaded or when entities are extracted from scene recaps. This lorebook serves as the persistent storage container for all entity tracking, registry entries, and operation queue state.

The system creates lorebooks on-demand using configurable naming templates and automatically attaches them to the current chat via SillyTavern's standard lorebook attachment mechanism.

## Key Capabilities

- **On-Demand Creation**: Lorebook automatically created when first needed (chat load, first entity extraction)
- **Chat-Specific Naming**: Generated names uniquely identify each chat's lorebook using templates
- **Template-Based Naming**: Supports `{{char}}` and `{{chat}}` placeholders for flexible naming patterns
- **Conflict Resolution**: Automatically appends numeric suffixes `(2)`, `(3)`, etc. when name conflicts occur
- **Automatic Attachment**: Created lorebooks immediately attached to chat via `chat_metadata.world_info`
- **Registry Pre-Population**: All configured entity type registries created as stub entries on lorebook creation
- **Active Lorebook Duplication**: Entries from active global/character/persona lorebooks duplicated into chat lorebook
- **Missing Lorebook Recovery**: Detects and recreates deleted lorebooks to maintain chat functionality

## Architecture Summary

```
Chat Load/First Entity Extraction
         |
         v
  ensureChatLorebook()
         |
         +---> Check if lorebook exists (chat_metadata.world_info)
         |            |
         |            +---> EXISTS --> Return true
         |            |
         |            +---> MISSING --> createChatLorebook()
         |                                    |
         +------------------------------------+
         |
         v
  createChatLorebook()
         |
         +---> getCurrentContext() - Get character/chat info
         |
         +---> generateLorebookName(template, char, chat)
         |           |
         |           +---> Apply template: "z-AutoLB-{{chat}}"
         |           |
         |           +---> getUniqueLorebookName(baseName, world_names)
         |                       |
         |                       +---> Check conflicts, append (2), (3), etc.
         |
         +---> createNewWorldInfo(uniqueName) - ST API call
         |
         +---> Clear cached registry (chat_metadata.auto_lorebooks.registry)
         |
         +---> ensureRegistryEntriesForLorebook(uniqueName)
         |           |
         |           +---> For each entity type: character, location, item, etc.
         |                       |
         |                       +---> Create stub registry entry (disabled)
         |                       |
         |                       +---> Set comment: "_registry_character", etc.
         |                       |
         |                       +---> Tag: "auto_lorebooks_registry"
         |
         +---> duplicateActiveLorebookEntries(uniqueName)
         |           |
         |           +---> getActiveLorebookNames() - Global/char/persona lorebooks
         |           |
         |           +---> For each active lorebook:
         |                       |
         |                       +---> Load entries
         |                       |
         |                       +---> Filter out internal entries (_registry_, _operations_queue_)
         |                       |
         |                       +---> Duplicate non-internal entries to chat lorebook
         |                       |
         |                       +---> Apply entry settings (sticky, recursion, budget)
         |           |
         |           +---> Enqueue POPULATE_REGISTRIES operation for all duplicated entries
         |
         +---> Return lorebook name
         |
         v
  attachLorebook(lorebookName)
         |
         +---> Set chat_metadata.world_info = lorebookName (ST standard)
         |
         +---> Set chat_metadata.auto_lorebooks.lorebookName = lorebookName
         |
         +---> Set chat_metadata.auto_lorebooks.attachedAt = Date.now()
         |
         +---> saveMetadata()
```

## Quick Reference

### Primary Functions

| Function | Purpose | Location |
|----------|---------|----------|
| `createChatLorebook()` | Creates new chat-specific lorebook with registries | lorebookManager.js:535-585 |
| `ensureChatLorebook()` | Checks for existing lorebook, creates if missing | lorebookManager.js:587-618 |
| `initializeChatLorebook()` | Entry point called on chat load | lorebookManager.js:661-680 |
| `attachLorebook(name)` | Attaches lorebook to current chat metadata | lorebookManager.js:299-331 |
| `handleMissingLorebook(name)` | Recovers from deleted lorebook | lorebookManager.js:253-297 |
| `generateLorebookName(tpl, char, chat)` | Generates lorebook name from template | utils.js:643-650 |
| `getUniqueLorebookName(base, existing)` | Resolves naming conflicts | utils.js:652-667 |

### Data Storage

| Location | Key | Purpose |
|----------|-----|---------|
| `chat_metadata` | `world_info` | SillyTavern standard lorebook attachment key |
| `chat_metadata.auto_lorebooks` | `lorebookName` | Extension tracking of attached lorebook |
| `chat_metadata.auto_lorebooks` | `attachedAt` | Timestamp of lorebook attachment |
| `chat_metadata.auto_lorebooks` | `registry` | Cached registry index (cleared on creation) |
| `extension_settings.autoLorebooks` | `nameTemplate` | Naming template (default: `"z-AutoLB-{{chat}}"`) |
| `extension_settings.autoLorebooks` | `deleteOnChatDelete` | Auto-delete lorebook when chat deleted |
| `extension_settings.autoLorebooks` | `autoReorderAlphabetically` | Auto-reorder entries alphabetically |
| `extension_settings.autoLorebooks` | `entity_types` | Array of entity type definitions |

### Key Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `nameTemplate` | string | `"z-AutoLB-{{chat}}"` | Lorebook naming template with placeholders |
| `deleteOnChatDelete` | boolean | `true` | Delete lorebook when chat is deleted |
| `autoReorderAlphabetically` | boolean | `true` | Reorder entries alphabetically after creation |
| `entity_types` | string[] | `['character', 'location', 'item', 'faction', 'lore', 'quest(entry:constant)', 'rule(entry:constant)']` | Entity types for registry creation |

## Documentation Structure

This documentation is organized into three files:

### 1. [overview.md](overview.md) (This File)

High-level summary, quick reference, and navigation hub.

### 2. [implementation.md](implementation.md)

**Comprehensive technical reference** (~1,000+ lines):
- Detailed architecture diagrams
- Complete source file inventory with line counts
- Full function signatures with parameters, returns, errors
- Data structures and storage formats
- Integration points with other features
- Settings reference tables
- Edge case handling
- Debugging guide
- Code examples

**Read this when**: You need detailed technical information, function signatures, or implementation guidance.

### 3. [data-flow.md](data-flow.md)

**Complete execution flow traces** (~300-900 lines):
- Entry point scenarios (chat load, first entity extraction, missing lorebook recovery)
- Step-by-step execution with file:line references
- Code snippets showing actual implementation
- Data transformations at each phase
- State changes throughout lifecycle
- Error handling flows
- Alternative execution paths

**Read this when**: You need to understand how lorebook creation works end-to-end or debug execution issues.

## Common Use Cases

### Automatic Creation on Chat Load

1. User opens a chat for the first time
2. `handleChatChanged()` event fires in `eventHandlers.js:59`
3. `initializeChatLorebook()` called at line 75
4. No existing lorebook found in `chat_metadata.world_info`
5. `createChatLorebook()` generates name: `"z-AutoLB-Chat123"`
6. Lorebook created via `createNewWorldInfo()` (SillyTavern API)
7. Registry entries created for all entity types
8. Active global/character lorebooks duplicated into chat lorebook
9. Lorebook attached to chat via `attachLorebook()`
10. Toast notification: "Created chat lorebook: z-AutoLB-Chat123"

### Creation on First Entity Extraction

1. Scene recap generated with `setting_lore` entities
2. `processSceneRecapResponse()` queues lorebook operations
3. `LOREBOOK_ENTRY_LOOKUP` operation executes
4. Operation needs chat lorebook to store entity
5. `ensureChatLorebook()` called
6. No existing lorebook → `createChatLorebook()` executes
7. Lorebook created, registries initialized, duplications completed
8. Entity extraction continues with newly created lorebook

### Missing Lorebook Recovery

1. User manually deletes attached lorebook from lorebook manager
2. Extension detects missing lorebook on next operation
3. `handleMissingLorebook(missingName)` called
4. Stale references cleared from `chat_metadata`
5. `createChatLorebook()` creates replacement lorebook
6. New lorebook attached via `attachLorebook()`
7. Toast: "Recreated deleted lorebook as: z-AutoLB-Chat123 (2)"

### Template Customization

1. User opens extension settings
2. Changes `nameTemplate` to `"{{char}}-Memory-{{chat}}"`
3. Saves settings
4. Next chat opened: lorebook named `"Alice-Memory-Chat456"`
5. Name conflicts resolved: `"Alice-Memory-Chat456 (2)"` if needed

## Related Features

- **[Lorebook Registry Entries](../lorebook-registry-entries/)** - Registry stub entries created during initialization
- **[Entity Type Management](../entity-type-management/)** - Entity types used for registry creation
- **[Lorebook Entry Creation](../lorebook-entry-creation/)** - Entity storage in created lorebook
- **[Lorebook Name Template](../lorebook-name-template/)** - Naming template configuration
- **[Lorebook Auto-Delete](../lorebook-auto-delete/)** - Automatic deletion when chat deleted
- **[Operation Queue](../../operation-queue/)** - Queue entry stored in created lorebook

## Code Example

```javascript
// Import lorebook manager
import {
  createChatLorebook,
  ensureChatLorebook,
  initializeChatLorebook,
  attachLorebook,
  getAttachedLorebook
} from './lorebookManager.js';

// Example 1: Check if chat has lorebook, create if missing
const hasLorebook = await ensureChatLorebook();
if (hasLorebook) {
  console.log('Chat lorebook ready');
}

// Example 2: Manually create new lorebook (not recommended, use ensureChatLorebook instead)
const lorebookName = await createChatLorebook();
if (lorebookName) {
  console.log(`Created lorebook: ${lorebookName}`);

  // Manually attach it (normally done automatically by createChatLorebook)
  const attached = attachLorebook(lorebookName);
  if (attached) {
    console.log('Lorebook attached successfully');
  }
}

// Example 3: Get currently attached lorebook
const attachedLorebook = getAttachedLorebook();
if (attachedLorebook) {
  console.log(`Current lorebook: ${attachedLorebook}`);
} else {
  console.log('No lorebook attached');
}

// Example 4: Initialize on chat load (normally called by event handler)
await initializeChatLorebook();

// Example 5: Custom naming template
import { extension_settings, saveSettingsDebounced } from './index.js';

// Change naming template
extension_settings.autoLorebooks.nameTemplate = '{{char}}-Lore-{{chat}}';
saveSettingsDebounced();

// Next lorebook created will use new template
const newLorebookName = await createChatLorebook();
// Result: "Alice-Lore-Chat789"
```

## Completeness Checklist

✅ **Fully Documented**:
- Architecture and data flow
- All public functions with signatures
- Data structures and storage locations
- Integration points with event handlers and entity extraction
- Settings and configuration options
- Template system and conflict resolution
- Registry initialization process
- Active lorebook duplication
- Missing lorebook recovery
- UI toast notifications
- Code examples

This documentation provides complete coverage of the automatic lorebook creation system from high-level concepts to low-level implementation details.

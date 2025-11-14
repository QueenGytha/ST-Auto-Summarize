# Core Recapping System - Overview

## What is the Core Recapping System?

The core recapping system is the foundational feature of ST-Auto-Recap that generates AI-powered summaries (recaps) of roleplay chat content. The system currently implements **scene-based recapping** as its primary mechanism, where groups of related messages (scenes) are summarized as cohesive narrative units.

## Key Capabilities

- **Scene-Based Summarization**: Summarizes scenes (message groups) into structured JSON with narrative recap, atmosphere, emotional beats, and entity extraction
- **LLM-Powered Generation**: Uses SillyTavern's ConnectionManager to call OpenAI, Claude, or other LLM APIs with configurable profiles and presets
- **Versioned Recaps**: Maintains version history for each scene recap with rollback/rollforward UI controls
- **Entity Extraction**: Automatically extracts characters, locations, items, and other entities from recaps into lorebook entries
- **Active Lorebook Context**: Optionally includes currently-active lorebook entries in prompt to prevent duplication
- **Async Operation Queue**: All recap generation flows through persistent queue for sequential execution and cancellation support
- **Memory Injection**: Scene recaps automatically injected into LLM prompts for context retention

## Architecture Summary

```
User Trigger → Event Handler → Queue Operation → Handler → Collect Scene → Format Prompt → LLM Call → Parse JSON → Store Recap → Extract Entities → Update UI
```

The system integrates with:
- **SillyTavern ConnectionManager** for LLM API calls
- **SillyTavern World Info** for active lorebook detection
- **Operation Queue** for async job management
- **Memory System** for prompt injection
- **Lorebook Manager** for entity storage

## Quick Reference

### Primary Entry Points

1. **Manual Generation**: User clicks "Generate" button in scene break UI
2. **Auto-Detection**: Auto scene break detection triggers recap generation after placing marker
3. **Manual Scene Break**: User places scene break marker (does not auto-generate)

### Core Functions

- `generateSceneRecap(options)` - Orchestrates scene recap generation
- `sendLLMRequest(profileId, prompt, operationType, options)` - Makes LLM API call via ConnectionManager
- `enqueueOperation(type, params, options)` - Queues async operation for execution
- `toggleSceneBreak(index, ...)` - Places/toggles scene break marker

### Data Storage

- `message.extra.scene_recap_memory` - Current active recap text
- `message.extra.scene_recap_versions` - Array of all recap versions
- `message.extra.scene_recap_current_index` - Active version index (0-indexed)
- `message.extra.scene_recap_metadata` - Metadata (lorebook count, timestamp, atmosphere, emotional beats)

### Key Settings

- `scene_recap_prompt` - Prompt template with macros
- `scene_recap_connection_profile` - ConnectionManager profile UUID
- `scene_recap_completion_preset` - Completion preset name
- `scene_recap_message_types` - Message filter ('user'|'character'|'both')
- `scene_recap_include_active_setting_lore` - Include active lorebook entries

## Documentation Structure

This documentation is organized into three files:

### 1. [overview.md](overview.md) (This File)

High-level summary, quick reference, and navigation hub.

### 2. [implementation.md](implementation.md)

**Comprehensive technical reference** (550+ lines):
- Architecture diagrams
- Source file inventory with line counts
- Complete function signatures with parameters, returns, errors
- Data structures and storage formats
- Integration points with other features
- Settings reference tables
- UI component documentation
- Public API surface
- Testing approach
- Edge case handling
- Debugging guide
- Code examples

**Read this when**: You need detailed technical information, function signatures, or implementation guidance.

### 3. [data-flow.md](data-flow.md)

**Complete execution flow traces** (300+ lines):
- Entry point scenarios (manual, auto-detection, button click)
- Step-by-step execution with file:line references
- Code snippets showing actual implementation
- Data transformations at each phase
- Error handling flows
- Alternative execution paths
- Timing and performance analysis
- State changes throughout lifecycle

**Read this when**: You need to understand how recap generation works end-to-end or debug execution issues.

## Common Use Cases

### Generate Scene Recap Manually

1. Place scene break marker on message (clapperboard button)
2. Click "Generate" button in scene break UI
3. Wait for LLM to generate recap (~5-30 seconds)
4. Recap appears in textarea with version "v1/1"
5. Edit recap text if needed (creates new version on next generate)

### Auto-Generate on Scene Detection

1. Enable auto scene break detection in settings
2. Enable "Generate recap after scene break" in settings
3. Chat normally - extension detects scene transitions
4. Scene break placed automatically
5. Recap generated automatically
6. Running recap updated automatically (if enabled)

### Navigate Recap Versions

1. Generate recap multiple times (each creates new version)
2. Click "◀" button to rollback to previous version
3. Click "▶" button to rollforward to next version
4. Version indicator shows current: "v2/5"
5. Manual edits stored as new version

### Extract Lorebook Entities

1. Generate scene recap (automatic entity extraction)
2. LLM returns `setting_lore` array with entities
3. Extension queues lorebook operations automatically
4. Entities created/merged in chat lorebook
5. Check lorebook viewer to see new entries

## Related Features

- **[Running Scene Recap](../RUNNING_SCENE_RECAP.md)** - Combines scene recaps into running narrative
- **[Auto Scene Break Detection](../AUTO_SCENE_BREAK_DETECTION.md)** - Automatically detects scene transitions
- **[Memory System](../memory-system/)** - Memory injection into LLM prompts
- **[Lorebook Integration](../lorebook-integration/)** - Entity extraction and management
- **[Operation Queue](../operation-queue/)** - Async operation management

## Historical Note

This extension originally supported **per-message recapping** where individual messages could be recapped separately. That functionality has been superseded by the scene-based approach but legacy code remains for potential future use. The current focus is on scene-level recapping which provides better narrative cohesion and context.

## Quick Start for Developers

```javascript
// Import core functions
import { generateSceneRecap, sendLLMRequest } from './sceneBreak.js';
import { enqueueOperation, OperationType } from './operationQueue.js';

// Queue a scene recap generation
await enqueueOperation(
  OperationType.GENERATE_SCENE_RECAP,
  { index: 42 },
  { priority: 20 }
);

// Or generate directly (bypassing queue)
await generateSceneRecap({
  index: 42,
  get_message_div: (idx) => $(`div[mesid="${idx}"]`),
  getContext,
  get_data,
  set_data,
  saveChatDebounced,
  skipQueue: true
});
```

## Documentation Completeness

✅ **Fully Documented**:
- Architecture and data flow
- All public functions with signatures
- Data structures and storage
- Integration points
- Settings and configuration
- UI components and event handlers
- Testing approach
- Error handling and edge cases
- Code examples

This documentation provides complete coverage of the core recapping system from high-level concepts to low-level implementation details.

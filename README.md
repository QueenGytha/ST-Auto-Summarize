# Auto-Recap & Lorebooks

A SillyTavern extension that provides AI-powered scene recapping and automatic lorebook management for long roleplays.

## Contents

- [What This Extension Does](#what-this-extension-does)
- [Key Features](#key-features)
- [Installation](#installation)
- [How It Works](#how-it-works)
- [Scene Management](#scene-management)
- [Running Scene Recap](#running-scene-recap)
- [Auto-Lorebooks](#auto-lorebooks)
- [AI-Editable Tracking Entries](#ai-editable-tracking-entries)
- [Configuration Profiles](#configuration-profiles)
- [Operation Queue](#operation-queue)
- [Settings Reference](#settings-reference)
- [Slash Commands](#slash-commands)
- [Tips & Best Practices](#tips--best-practices)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## What This Extension Does

**IMPORTANT**: Only the **running scene recap** gets injected into your LLM prompts. This is a single, cohesive narrative that combines all your scene recaps. Individual scene recaps are NOT injected separately.

This extension provides two main systems working together:

1. **Running Scene Recap**: Generates a cohesive narrative summary of your roleplay by scene, injected directly into the LLM prompt for context retention
2. **Auto-Lorebooks**: Automatically extracts entities (characters, locations, objects, etc.) from scene recaps and manages them in your lorebook

---

## Key Features

### Scene-Based Recapping
- **Scene breaks**: Divide your roleplay into logical narrative units (manual or auto-detected)
- **Scene recaps**: Generate AI summaries for each scene
- **Running scene recap**: Combines all scene recaps into one cohesive narrative that gets injected into the prompt
- **Version management**: Switch between different versions of the running recap, edit manually, or regenerate
- **Scene navigator**: Visual navigation bar to jump between scenes

### Auto-Lorebooks
- **Automatic entity extraction**: AI extracts characters, locations, objects, events, factions, and concepts from scene recaps
- **Duplicate detection**: Two-stage process (lookup + deduplicate) prevents duplicate entries
- **Customizable entity types**: Define your own entity types and extraction prompts
- **AI-editable tracking**: Special lorebook entries that the AI can update during roleplay (__gm_notes, __character_stats)
- **Bulk operations**: Enable/disable/delete multiple entries at once

### Configuration Management
- **Profiles**: Save and load different configuration profiles
- **Per-character/chat presets**: Auto-load specific profiles for each character or chat
- **Import/export**: Share profiles as JSON files

### Quality of Life
- **Operation queue**: Background processing of LLM operations with progress tracking
- **Connection profiles**: Use different API settings for recap generation vs. regular chat
- **Recap validation**: Optional second LLM pass to validate recap quality
- **Auto-hide old messages**: Automatically hide messages from older scenes
- **Popout config**: Dedicated popup window for extension settings

---

## Installation

1. In SillyTavern, go to **Extensions** > **Install Extension**
2. Enter the GitHub URL: https://github.com/QueenGytha/ST-Auto-Recap
3. Click **Install**
4. Reload SillyTavern if prompted

---

## How It Works

### The Big Picture

1. **You chat normally** in SillyTavern
2. **Mark scene breaks** manually or let the extension auto-detect them
3. **Scene recaps are generated** automatically in the background
4. **Running scene recap combines all scenes** into a cohesive narrative
5. **The running recap is injected** into your LLM prompts automatically
6. **Auto-Lorebooks extracts entities** from scene recaps and adds them to your lorebook

### What Gets Injected

**Only the running scene recap** gets injected into your prompts. This is a single, unified narrative that:
- Combines all your scene recaps
- Removes redundancy
- Focuses on current state rather than blow-by-blow events
- Updates automatically as new scenes are recapped

Individual scene recaps are NOT injected separately.

---

## Scene Management

### Manual Scene Breaks

1. Enable **"Show Scene Break Button"** in settings
2. Click the scene break button in any message's button menu
3. Optionally add a scene name (like a chapter title)
4. Generate a scene recap using the **Generate** button

### Auto Scene Break Detection

Enable **"Auto Scene Break Detection"** in settings. The extension will:
- Detect scene changes automatically (using configurable LLM analysis)
- Insert scene break markers
- Optionally generate scene names automatically
- Queue scene recap generation

### Scene Navigator

A floating navigation bar shows all your scenes:
- Click a scene to jump to it
- See which scenes have recaps
- Manage scene names and recaps
- Configure width and font size in settings

---

## Running Scene Recap

**This is the memory system that actually gets injected into your prompts.**

### What It Does

The running scene recap:
- **Combines** all individual scene recaps into one cohesive narrative
- **Deduplicates** information across scenes
- **Focuses** on current state (relationships, locations, ongoing plots)
- **Updates** automatically when new scene recaps are generated
- **Versions** each generation so you can switch between them or edit manually

### Configuration

**Basic Settings:**
- **Running Scene Recap**: Toggle on/off (enabled by default)
- **Exclude Latest N Scenes**: Wait N scenes before including in running recap (default: 1)
- **Auto-generate on New Scene Recaps**: Regenerate running recap when new scenes are recapped

**Version Management:**
- **Show Navbar Version Controls**: Display floating navbar with version selector and controls
- **Version dropdown**: Switch between generated versions
- **Edit button**: Create a new version by editing
- **Regenerate button**: Manually trigger regeneration

**Prompt Customization:**
- **Edit Running Recap Prompt**: Customize how scenes are combined
- Output format is JSON with a single recap field (markdown text inside)

**Injection Settings:**
- **Running Recap Position/Depth/Role**: Control where and how the recap is injected
- **Context Limit**: Maximum tokens/percent for the running recap
- **Scan for Running Recap**: Include in world info scanning

### How to Use

1. Enable **"Running Scene Recap"** (default: on)
2. Set **"Exclude Latest N Scenes"** (default: 1, allows time for validation)
3. Enable **"Auto-generate on New Scene Recaps"** (default: on)
4. Scene recaps are generated → running recap updates automatically → injected into prompts

**Manual Control:**
- Click **"Regenerate Running"** on any scene recap to trigger regeneration
- Use version dropdown to switch between versions
- Edit the running recap manually to create a new version

---

## Auto-Lorebooks

Automatically extract entities from scene recaps and manage them in your lorebook.

### Entity Types

Default entity types (customizable):
- **Character**: People, creatures, companions
- **Location**: Places, buildings, regions
- **Object**: Items, artifacts, tools
- **Event**: Battles, ceremonies, discoveries
- **Faction**: Organizations, groups, alliances
- **Concept**: Ideas, phenomena, magic systems

### How It Works

1. **Scene recap is generated** (contains narrative summary)
2. **Auto-Lorebooks analyzes** the scene recap text
3. **Entities are extracted** based on configured entity types
4. **Lookup phase**: Check if entity already exists (using LLM)
5. **Deduplicate phase**: If similar entity exists, merge instead of creating duplicate
6. **Create lorebook entry**: New entry added to your lorebook (disabled by default)

### Configuration

**Enable/Disable:**
- **Enable Auto-Lorebooks**: Master toggle for the feature

**Entity Type Management:**
- Add/edit/delete custom entity types
- Customize extraction prompts per type
- Set priority for entity extraction

**Duplicate Detection:**
- **Lookup prompt**: Customize how the LLM searches for existing entities
- **Deduplicate prompt**: Customize how the LLM decides if entities should be merged
- **Thresholds**: Adjust confidence thresholds for duplicate detection

**Entry Settings:**
- **Default State**: New entries start disabled (you enable manually)
- **Keywords**: Automatically extracted from entity name
- **Content Format**: Customizable template for entry content
- **Insertion Order**: Control where entries are inserted in prompt

### Managing Lorebook Entries

**View Extracted Entities:**
- Open **World Info** in SillyTavern
- Entries created by Auto-Lorebooks are tagged with [Auto-Lorebook]

**Bulk Operations:**
- Select multiple entries
- Enable/disable in bulk
- Delete unused entries
- Edit entry content

**Manual Additions:**
- You can still add lorebook entries manually
- Auto-Lorebooks won't interfere with manual entries

---

## AI-Editable Tracking Entries

Special lorebook entries that the AI can update during roleplay.

### What They Are

Two special entry types:
- **__gm_notes**: GM notes that track ongoing events, decisions, and consequences
- **__character_stats**: Character stats, conditions, inventory, relationships

These entries use a special syntax that allows the AI to update them in-character during roleplay.

### How They Work

1. **Create tracking entries** in your lorebook with special keywords (__gm_notes or __character_stats)
2. **Enable the entries** so they're injected into the prompt
3. **During roleplay**, the AI can suggest updates using special syntax
4. **Extension detects updates** and automatically modifies the lorebook entries
5. **Changes persist** across the conversation

### Setting Up Tracking Entries

**GM Notes:**
1. Create a lorebook entry with keyword: __gm_notes
2. Set content to empty or initial notes
3. Enable the entry
4. AI can now append notes as events happen

**Character Stats:**
1. Create a lorebook entry with keyword: __character_stats
2. Set content in a structured format
3. Enable the entry
4. AI can now update stats during roleplay

### Configuration

- **Enable AI-Editable Tracking**: Master toggle
- **Update Syntax**: Customize the syntax the AI uses to suggest updates
- **Auto-apply Updates**: Automatically apply updates vs. review first
- **Update Logging**: Log all updates for review

---

## Configuration Profiles

Save and load different settings configurations.

### Managing Profiles

**Create a Profile:**
1. Open extension settings
2. Configure settings as desired
3. Click **"Save Profile"** or **"New Profile"**
4. Name your profile

**Switch Profiles:**
- Use the profile dropdown to switch instantly

**Auto-load Profiles:**
- **Character Profile**: Set a profile to auto-load for a specific character
- **Chat Profile**: Set a profile to auto-load for a specific chat

**Import/Export:**
- Export profiles as JSON files
- Share profiles with others
- Import profiles from JSON files

### What's Included in Profiles

- All recap generation settings
- Injection settings (position, depth, role)
- Scene recap settings
- Running scene recap settings
- Auto-Lorebooks configuration
- Validation settings
- Connection profiles and presets

---

## Operation Queue

Background processing system for LLM operations.

### What It Does

The operation queue:
- **Processes LLM operations** in the background (recap generation, validation, entity extraction)
- **Prevents rate limiting** by spacing out requests
- **Persists across page reloads** using lorebook storage
- **Shows progress** with visual indicators
- **Allows pausing** if you need to stop processing

### Queue Controls

**Slash Commands:**
- /queue-status or /queue: Show current queue status
- /queue-pause: Pause the queue
- /queue-resume: Resume the queue
- /queue-clear-all: Clear all pending operations

**Queue UI:**
- Visual progress bar when operations are running
- Shows pending/running/completed/failed operation counts
- Click **"Stop"** to pause queue

### Queue Behavior

**Non-blocking (default):**
- You can continue chatting while operations process
- Operations run in background

**Blocking Mode:**
- Enable **"Block Chat"** in settings
- Prevents sending new messages while queue is processing
- Useful for ensuring recaps are up-to-date before continuing

---

## Settings Reference

### Core Settings

**Toggle Memory:**
- Enable/disable the extension for the current chat
- Slash command: /toggle_memory [true|false]

**Auto Scene Break Detection:**
- Automatically detect scene changes and insert scene breaks
- Configurable detection prompt and thresholds

**Show Scene Break Button:**
- Add scene break button to message button menu

**Block Chat:**
- Prevent sending messages while queue is processing

### Scene Recap Settings

**Edit Scene Prompt:**
- Customize the prompt used to generate scene recaps
- Use macros: {{char}}, {{user}}, etc.

**Scene Completion Preset:**
- Choose which API connection preset to use for scene recaps

**Scene Prefill:**
- Text to start each scene recap with
- Useful for enforcing format

**Scene Message History:**
- Include previous messages as context for scene recap
- Mode: None / Previous messages / Previous recaps
- Count: How many to include

**Include Message Types:**
- User messages only / AI messages only / Both

**Scene Recap Validation:**
- Enable second LLM pass to validate scene recap quality
- Customize validation prompt and retry count

### Running Scene Recap Settings

**Running Scene Recap:**
- Enable/disable running scene recap (default: on)

**Exclude Latest N Scenes:**
- Wait N scenes before including in running recap
- Default: 1 (allows time for validation)

**Auto-generate on New Scene Recaps:**
- Automatically regenerate when new scene recaps are created

**Show Navbar Version Controls:**
- Display floating navbar with version selector and controls

**Edit Running Recap Prompt:**
- Customize how scenes are combined into running recap
- Output format: JSON with single recap field (markdown text)

**Running Recap Injection Settings:**
- Position: Where in the prompt (e.g., "After Character Defs")
- Depth: How many messages back from the end
- Role: System / User / Assistant
- Scan: Include in world info scanning
- Context Limit: Maximum tokens or percent

### Auto-Lorebooks Settings

**Enable Auto-Lorebooks:**
- Master toggle for automatic entity extraction

**Entity Types:**
- Add/edit/delete entity types
- Customize extraction prompts per type

**Lookup Settings:**
- Customize how existing entities are searched
- Adjust confidence thresholds

**Deduplicate Settings:**
- Customize how similar entities are merged
- Adjust similarity thresholds

**Entry Defaults:**
- Default state (enabled/disabled)
- Default insertion order
- Content template

### Validation Settings

**Enable Recap Validation:**
- Use second LLM pass to validate recaps

**Validate Scene Recaps:**
- Enable validation specifically for scene recaps

**Edit Validation Prompt:**
- Customize validation criteria

**Validation Completion Preset:**
- Choose which API preset to use for validation

**Max Retries:**
- How many times to retry if validation fails

### Auto-Hide Settings

**Auto Hide Messages Older Than The Last X Scene(s):**
- Automatically hide messages from scenes older than X
- Set to -1 to disable
- Useful for reducing visual clutter in long roleplays

### Scene Navigator Settings

**Navigator Bar Width:**
- Customize width in pixels (default: 240px)

**Navigator Font Size:**
- Customize font size in pixels (default: 12px)

**Auto-generate Scene Names (Auto-Detection):**
- Automatically generate scene names when auto-detecting scene breaks

**Auto-generate Scene Names (Manual):**
- Automatically generate scene names when manually creating scene breaks

### Miscellaneous

**Verbose Logging:**
- Always enabled for easier troubleshooting

**Enable Memory in New Chats:**
- Default memory state for new chats

**Use Global Toggle State:**
- Share memory enable/disable state across all chats

---

## Slash Commands

**Memory Control:**
- /get_memory_enabled - Returns whether memory is enabled for the current chat
- /toggle_memory [true|false] - Toggle memory on/off (or set directly with boolean)
- /get_memory [n] - Get the memory associated with message index n (default: most recent)

**UI Control:**
- /toggle_memory_popout - Toggle the extension config popout
- /toggle_memory_injection_preview - Toggle preview of what will be injected

**Queue Management:**
- /queue-status or /queue - Show operation queue status (total, pending, running, completed, failed, paused)
- /queue-pause - Pause the operation queue
- /queue-resume - Resume the operation queue
- /queue-clear-all - Clear all operations from the queue

**Debugging:**
- /auto_recap_log_chat - Log current chat to console
- /auto_recap_log_settings - Log current extension settings to console
- /log_scene_recap_injection - Log running scene recap injection settings and text
- /hard_reset - Reset all extension settings to default (WARNING: destructive)

---

## Tips & Best Practices

### Recap Generation

**Keep prompts simple:**
- Longer recap prompts tend to muddy results
- LLMs handle information overload poorly (hence this extension!)

**Use low temperature:**
- Temperature 0 reduces creativity and focuses on facts
- No need for flowery language in recaps

**No repetition penalty:**
- You WANT the AI to repeat what happened
- Disable repetition penalty for recap presets

**Use global macros:**
- {{char}} and {{user}} help with proper name usage
- Other SillyTavern macros work in recap prompts

**Save your presets:**
- If using different connection profiles for recaps, save your main preset first
- Switching profiles discards unsaved changes (this is how ST works)

**Don't use reasoning models:**
- Reasoning models (like o1) work but are very slow for recapping
- Use faster models for better experience

### Scene Management

**Scene breaks work best at natural narrative boundaries:**
- End of a conversation
- Change of location
- Time skip
- Major event conclusion

**Use scene names:**
- Brief titles (like chapter names) help navigation
- Auto-generate names or write your own

**Validate important scenes:**
- Enable scene recap validation for quality control
- Review and edit scene recaps manually if needed

### Running Scene Recap

**Exclude latest N scenes:**
- Default: 1 scene excluded
- Gives you time to validate/edit before inclusion
- Increase if you want more time to review

**Edit when needed:**
- Running recap can be edited manually
- Creates a new version (keeps history)
- Useful for fixing errors or adjusting focus

**Version management:**
- Switch between versions if a regeneration goes wrong
- Keep multiple versions for different story branches

### Auto-Lorebooks

**Review extracted entities:**
- Auto-Lorebooks creates entries in disabled state (by default)
- Review and enable the ones you want
- Delete entries you don't need

**Customize entity types:**
- Add entity types specific to your setting
- Remove types you don't use
- Adjust extraction prompts for better results

**Use AI-editable tracking:**
- __gm_notes for tracking plot threads and consequences
- __character_stats for tracking character state
- Enable these entries to get dynamic updates during roleplay

### Performance

**Connection profiles:**
- Use a cheaper/faster API for recap generation if cost is a concern
- Save your expensive API for actual roleplay

**Queue management:**
- Pause queue if you need to stop processing
- Clear queue if you want to cancel pending operations
- Use blocking mode if you want to ensure recaps are current

### Troubleshooting Tips

**Recaps continuing the conversation:**
- Check your instruct template (system messages must be distinct)
- Try toggling "Nest Message in Recap Prompt" in settings
- Make sure "System same as user" is unchecked in instruct template

**Recaps too long:**
- Set max tokens in your recap completion preset
- Use {{words}} macro in recap prompt (though LLMs can't count perfectly)

**Names wrong in recaps:**
- Use {{char}} and {{user}} macros in recap prompt
- Enable "Message History" to give more context

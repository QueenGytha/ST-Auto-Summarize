# Auto-Recap & Lorebooks

A SillyTavern extension that provides AI-powered scene recapping and automatic lorebook management for long roleplays.

## Contents

- [Overview](#overview)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Settings Reference](#settings-reference)
- [Slash Commands](#slash-commands)
- [Tips & Best Practices](#tips--best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

**Key concept**: Only the **running scene recap** gets injected into your LLM prompts. This is a single, cohesive narrative that combines all your scene recaps. Individual scene recaps are NOT injected separately.

The extension provides two systems:

1. **Running Scene Recap**: Divides your roleplay into scenes, generates AI summaries for each, then combines them into a unified narrative injected into prompts for context retention

2. **Auto-Lorebooks**: Extracts entities (characters, locations, items, etc.) from scene recaps and manages them in a per-chat lorebook with duplicate detection and automatic merging

---

## Installation

1. In SillyTavern, go to **Extensions** > **Install Extension**
2. Enter: `https://github.com/QueenGytha/ST-Auto-Recap`
3. Click **Install** and reload if prompted

---

## Getting Started

1. Find **"ST-Auto-Recap"** in Extensions panel
2. Click **Toggle Memory** to enable for current chat
3. Click the **clapperboard icon** (🎬) in any message's button menu to mark a scene break
4. The extension processes the scene through a 4-stage pipeline and creates a recap
5. A **scene navigator** bar appears on the left showing your scenes

With default settings, the extension will:
- Auto-detect scene breaks as you chat
- Generate scene recaps for each scene
- Combine them into a running recap
- Inject the running recap into prompts
- Extract entities into a chat-specific lorebook

---

## How It Works

### Scene Recap Pipeline

When you mark a scene break (or one is auto-detected), the extension runs a 4-stage AI pipeline:

| Stage | Name | Purpose |
|-------|------|---------|
| 1 | Extraction | Extract raw information from scene messages |
| 2 | Organization | Organize into structured format with scene name |
| 3 | Recap Filtering | Filter what goes into the running scene recap |
| 4 | Lorebook Filtering | Extract entities for lorebook entries |

### Running Scene Recap

After scene recaps are generated:
- They're combined into a single **running scene recap**
- This unified narrative is injected into your LLM prompts
- It maintains version history (you can switch between or edit versions)
- Updates automatically when new scenes are added

### Auto-Lorebooks

From Stage 4, entities are processed:
1. **Lookup**: Check if entity already exists
2. **Deduplicate**: Merge with existing entry if similar
3. **Create/Update**: Add or update the lorebook entry

Lorebook entries use SillyTavern's standard keyword-matching injection.

---

## Settings Reference

### Core Controls

| Setting | Description |
|---------|-------------|
| **Toggle Memory** | Enable/disable extension for current chat |
| **Refresh Memory** | Manually refresh memory display |

### Configuration Profiles

Save and load entire extension configurations.

| Setting | Description |
|---------|-------------|
| **Profile dropdown** | Select active profile |
| **Rename/New/Restore/Delete** | Manage profiles |
| **Import/Export** | Share profiles as JSON files |
| **Character/Chat autoload** | Auto-load profile for specific character or chat |
| **Notify on Switch** | Show notification when profile changes |

**Note**: Configuration Profiles save behavioral settings. Operations Presets (below) save prompts/connections.

### Operations Configuration

Customize the prompts, prefills, and API connections for each operation type.

**Structure:**
- **Operation Artifacts**: Individual configurations per operation
- **Operations Presets**: Bundles of artifacts you can switch between
- **Sticky Presets**: Auto-load presets for specific characters/chats

**Operation Types** (each has its own prompt, prefill, and connection settings):

| Operation | Description |
|-----------|-------------|
| Scene Recap Stage 1 | Extract raw information from messages |
| Scene Recap Stage 2 | Organize into structured format |
| Scene Recap Stage 3 | Filter content for running recap |
| Scene Recap Stage 4 | Extract entities for lorebook |
| Scene Recap Error Detection | Validate recap quality (optional) |
| Auto Scene Break | Detect scene changes |
| Running Scene Recap | Combine scenes into narrative |
| Lorebook: Bulk Populate | Mass-create entries |
| Lorebook: Entry Lookup | Find existing entries |
| Lorebook: Entry Deduplicate | Merge similar entries |
| Lorebook: Recap Merge | Merge new info into entries |
| Lorebook: Entry Compaction | Compress verbose entries |

**Artifact Editor fields:**
- **Prompt**: AI prompt text (supports `{{char}}`, `{{user}}` macros)
- **Prefill**: Text to start AI response (e.g., `{` for JSON)
- **Connection Profile**: Which API to use (empty = current)
- **Completion Preset**: Temperature/sampling settings
- **Include Preset Prompts**: Include system prompts from preset

**Entity Types** (also under Operations Configuration):
- Define what entity types to extract (character, location, item, etc.)
- Mark types as "constant" (unchanging facts) or not
- The "recap" type provides guidance for what goes in narrative vs lorebook

**Entry Defaults** (for new lorebook entries):
- **Exclude Recursion**: Entry won't trigger other entries
- **Prevent Further Recursion**: Entry won't be scanned for more triggers
- **Ignore Budget**: Always include regardless of token budget
- **Sticky**: Keep entry active for N rounds after triggering

### Scene Recap

| Setting | Description | Default |
|---------|-------------|---------|
| **Navigator Bar Width** | Width in pixels | 240 |
| **Navigator Font Size** | Font size in pixels | 12 |
| **Collapse New Scenes by Default** | New scenes start collapsed | On |
| **Append Message Range to Scene Names** | Add "159-254" to names | On |
| **Include Active setting_lore Entries** | Include setting lore in prompts | On |
| **Include Message Types** | User only / AI only / All | All |
| **Recap the last N scenes** | Scenes to recap at once | 1 |

### Running Scene Recap

| Setting | Description | Default |
|---------|-------------|---------|
| **Exclude Latest N Scene(s)** | Delay before including in running recap | 1 |
| **Auto-generate on New Scene Recaps** | Auto-regenerate running recap | On |
| **Show Navbar Version Controls** | Show version switcher in navbar | On |
| **View Running Recap** | Open dialog to view/edit current recap | - |
| **Position** | Where to inject (Before/After main prompt, In chat) | Before main prompt |
| **Depth** | Chat depth for "In chat" injection | 2 |
| **Role** | System / User / Assistant | System |
| **Include in World Info Scanning** | Let lorebook scan the recap | Off |

### Auto Scene Break Detection

| Setting | Description | Default |
|---------|-------------|---------|
| **Auto-check on Chat Load** | Check when chat opens | Off |
| **Auto-check on New Messages** | Check after each message | On |
| **Auto-generate Scene Recap on Detection** | Generate recap immediately | On |
| **Message Offset** | Skip latest N messages | 2 |
| **Check Which Messages** | AI only / User only / Both | Both |
| **Minimum Scene Length** | Min messages before allowing break | 10 |

### Auto-Lorebooks

| Setting | Description | Default |
|---------|-------------|---------|
| **Delete lorebook when chat is deleted** | Auto-cleanup | On |
| **Auto-reorder entries alphabetically** | Keep entries sorted | On |
| **Lorebook naming template** | Template with `{{char}}`, `{{chat}}` | z-AutoLB-{{char}}-{{chat}} |

### Miscellaneous

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable Recap in New Chats** | Default state for new chats | On |
| **Use Global Toggle State** | Share on/off across all chats | Off |
| **Auto Hide Messages Older Than Last N Scene(s)** | Hide old messages (-1 = off) | 1 |
| **Tokenizer Correction Factor** | Adjust token estimates | 1.35 |
| **Lorebook Compaction Threshold** | Token threshold for compaction | 1000 |

**Tokenizer Correction Factor**: SillyTavern's tokenizer may not match your provider. Claude models: use 1.35 (ST undercounts ~35%). OpenAI: use 1.0.

### First-Hop Proxy Integration

For users with a local proxy at `localhost:8765`:

| Setting | Description |
|---------|-------------|
| **Always Send Metadata** | Force metadata injection (normally auto-detected) |
| **Suppress Non-Chat Lorebooks** | Only include chat lorebooks during generation |

---

## Slash Commands

### Memory & UI

| Command | Description |
|---------|-------------|
| `/toggle_memory [true\|false]` | Toggle memory on/off |
| `/get_memory_enabled` | Check if memory is enabled |
| `/get_memory [n]` | Get memory for message n |
| `/toggle_memory_popout` | Toggle settings popout |
| `/toggle_memory_injection_preview` | Preview injection content |

### Queue

| Command | Description |
|---------|-------------|
| `/queue` | Show queue status |
| `/queue-pause` | Pause processing |
| `/queue-resume` | Resume processing |
| `/queue-clear-all` | Clear all operations |

### Token Analysis

| Command | Description |
|---------|-------------|
| `/countmessagetokens` | Count tokens in messages, lorebook, recap |
| `/countmessagetokenseffective` | Per-scene token analysis with savings |

### Compaction

| Command | Description |
|---------|-------------|
| `/compact-entry <uid>` | Compact specific entry |
| `/compactlorebook` | Compact all entries (queue must be empty) |
| `/compactall` | Run all compaction operations |

### Debugging

| Command | Description |
|---------|-------------|
| `/auto_recap_log_chat` | Log chat to console |
| `/auto_recap_log_settings` | Log settings to console |
| `/log_scene_recap_injection` | Log injection settings |
| `/hard_reset` | Reset ALL settings (destructive!) |

---

## Tips & Best Practices

### API Setup

- **Create a dedicated recap preset**: Lower temperature (0.7-0.9), appropriate context size
- **Use a separate connection profile**: Different LLM for recaps allows background processing without blocking chat
- **Match context limits**: Set completion preset context size to your model's actual limit

### Scene Management

- Mark scene breaks at natural boundaries: location changes, time skips, conversation ends
- Keep "Exclude Latest N Scenes" at 1 to review recaps before they're combined
- Use `/countmessagetokenseffective` to check compression efficiency

### Queue

- Operations persist across page reloads
- Failed operations retry with exponential backoff
- Use `/queue-clear-all` to stop stuck retries

---

## Troubleshooting

**"Exceeds available context" errors:**
- Scenes too large for context limit
- Increase context size in completion preset, or create more frequent scene breaks

**Scene recaps not generating:**
- Check memory is enabled (Toggle Memory)
- Check queue status with `/queue`
- Check browser console (F12) for errors

**Running recap not updating:**
- Check "Auto-generate on New Scene Recaps" is enabled
- Check "Exclude Latest N Scenes" - latest scenes are delayed

**Lorebook entries not appearing:**
- Open World Info > select chat lorebook
- Entries are disabled by default
- Check queue for pending operations

**Operations stuck:**
- `/queue-pause` then `/queue-clear-all`
- Check API connection and rate limits

**Getting Help:**
- Browser console (F12) for errors
- `/auto_recap_log_settings` for config
- Report issues: https://github.com/QueenGytha/ST-Auto-Recap/issues

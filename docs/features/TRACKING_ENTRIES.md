# AI-Editable Tracking Entries System

## Overview

The tracking entries system allows AI characters to maintain persistent notes and statistics through special lorebook entries that are automatically updated when the AI outputs specific syntax in its messages.

## Features

### Two Special Tracking Entry Types

1. **GM Notes (`__gm_notes`)** - For campaign tracking, plot threads, secrets, and foreshadowing
2. **Character Stats (`__character_stats`)** - For character statistics, inventory, and status effects

Both entries are:
- **Always active** (`constant: true`) - Always visible to the AI
- **Non-recursive** (`excludeRecursion: true`) - Won't trigger other lorebook entries
- **Auto-created** - Created automatically when a chat loads (if enabled)
- **AI-editable** - Updated automatically when AI outputs tracking syntax

## How It Works

### 1. AI Outputs Tracking Syntax

The AI includes special syntax in its message to update tracking entries:

**Default Syntax:**
```
<-- gm_notes: The dragon is actually the king in disguise -->
<-- character_stats: HP-15, Gold+200, Inventory+Healing Potion -->
```

### 2. Extension Detects and Extracts

When the AI message is received:
1. Extension parses message for tracking syntax
2. Extracts update information
3. Optionally removes syntax from message (configurable, on by default)

### 3. AI Merges Update with Current Content

The extension:
1. Gets current lorebook entry content
2. Sends current content + new update to AI
3. AI merges them intelligently using a configurable prompt
4. Updates lorebook entry with merged result

### 4. Entry is Always Visible to AI

The updated tracking entry is always in the AI's context for future messages.

## Configuration

### Settings Location

Extensions menu → Auto-Lorebooks → AI-Editable Tracking Entries

### Basic Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Enable tracking entries** | Enable/disable the tracking system | Enabled |
| **Auto-create tracking entries** | Create entries when chat loads | Enabled |
| **Remove tracking syntax** | Hide syntax from user when editing messages | Enabled |

### Syntax Patterns

Customize how the AI signals updates:

| Entry Type | Default Pattern | Description |
|------------|----------------|-------------|
| **GM Notes** | `<-- gm_notes: {{content}} -->` | Syntax for GM note updates |
| **Character Stats** | `<-- character_stats: {{content}} -->` | Syntax for stat updates |

**Note:** Use `{{content}}` as the placeholder for the update information.

### AI Merge Settings

Configure how updates are merged:

| Setting | Description | Default |
|---------|-------------|---------|
| **Connection Profile** | Which API to use for merging | Main API |
| **Prefill** | Prefill text for Claude models | `[` |
| **GM Notes merge prompt** | Prompt for merging GM notes | See below |
| **Character Stats merge prompt** | Prompt for merging stats | See below |

## Default Merge Prompts

### GM Notes Merge Prompt

```
You are a Game Master assistant helping to maintain campaign notes.

Current GM Notes:
{{current_content}}

New Information to Add:
{{new_update}}

Instructions:
1. Read the current GM notes and the new information
2. Merge the new information into the existing notes
3. Organize information logically (plot threads, NPC motivations, secrets, foreshadowing, etc.)
4. Keep the format clean and readable
5. Remove duplicate information
6. Preserve important details from both sources
7. Use clear section headers if helpful

Output only the updated GM notes content, nothing else.
```

### Character Stats Merge Prompt

```
Merge the new updates with the current content.

Current Content:
{{current_content}}

New Updates:
{{new_update}}

Instructions:
1. Apply the updates to the current content
2. Preserve the existing format and structure exactly
3. Only add or modify what the updates specify
4. Remove outdated information if updates indicate replacement
5. Keep formatting clean and consistent

Output only the merged content, nothing else.
```

## Usage Examples

### Example 1: GM Notes

**AI Message:**
```
As you approach the throne room, you notice a faint dragon scent.

<-- gm_notes: Players discovered dragon scent near throne. They don't know yet that the king is a polymorphed dragon. Next session: King will reveal prophecy. -->
```

**What Happens:**
1. Extension extracts: "Players discovered dragon scent near throne..."
2. AI merges with current GM notes
3. Syntax removed from message (user sees only: "As you approach the throne room...")
4. Lorebook entry updated with merged notes

**Resulting Entry:**
```
[GM Notes]
Plot Threads:
- Players investigating dragon activity
- Players discovered dragon scent near throne room

Secrets:
- King is actually a polymorphed dragon
- Players don't know king's true identity yet

Next Session:
- King will reveal prophecy to players
```

### Example 2: Character Stats

**AI Message:**
```
[Your AI's message with narrative content]

<-- character_stats: [whatever updates are relevant to your specific roleplay] -->
```

**What Happens:**
1. Extension extracts the update content
2. AI merges with current stats using your configured prompt
3. Updates applied based on your existing structure
4. Entry updated

**The format and content of the stats entry is entirely up to your roleplay.**

### Example 3: Multiple Updates

**AI Message:**
```
[Narrative content]

<-- gm_notes: [some important plot information] -->
<-- character_stats: [relevant stat changes] -->
```

Both entries are updated simultaneously.

## Customization

### Custom Syntax Patterns

You can customize the syntax to match your preferences:

**Examples:**
```
GM_NOTE: {{content}}
[GM]{{content}}[/GM]
{gm_notes:{{content}}}
***GM: {{content}}***
```

**Character Stats:**
```
STATS: {{content}}
[STATS]{{content}}[/STATS]
{character_stats:{{content}}}
***STATS: {{content}}***
```

### Custom Merge Prompts

Customize the merge prompts to match your specific needs. Keep the `{{current_content}}` and `{{new_update}}` placeholders.

**Key principle:** Don't tell the AI what fields to track - let it learn from what already exists in the entry.

## Technical Details

### Lorebook Entry Configuration

Both tracking entries use these properties:

```javascript
{
  comment: "__gm_notes" or "__character_stats",
  content: "[Updated by AI]",
  keys: ["gm notes", "campaign notes", ...],
  constant: true,           // Always active
  order: 1001/1002,         // High priority
  depth: 0,                 // Always included
  position: 6,              // After character card
  excludeRecursion: true,   // Don't trigger child entries
  preventRecursion: true,   // Extra safety
  disable: false            // Entry is active
}
```

### Event Flow

```
1. AI generates message with tracking syntax
   ↓
2. MESSAGE_RECEIVED event fires
   ↓
3. Extension parses message for syntax patterns
   ↓
4. Extract update content
   ↓
5. Get current lorebook entry content
   ↓
6. Call AI to merge current + update
   ↓
7. Update lorebook entry with merged result
   ↓
8. Remove syntax from message (if enabled)
   ↓
9. Save message and metadata
```

### File Structure

```
ST-Auto-Lorebooks/
├── trackingEntries.js       # Core tracking logic
├── eventHandlers.js         # MESSAGE_RECEIVED integration
├── settingsManager.js       # UI and settings
├── settings.html            # UI elements
└── TRACKING_ENTRIES.md      # This file
```

## Troubleshooting

### Tracking Not Working

**Check:**
1. Is tracking enabled in settings?
2. Is auto-create enabled?
3. Is there a lorebook attached to the chat?
4. Does the syntax match your configured pattern?
5. Check browser console for `[AutoLorebooks]` errors

### Syntax Not Removed

**Check:**
1. Is "Remove tracking syntax" enabled in settings?
2. Does the syntax exactly match your configured pattern?
3. Check that `{{content}}` placeholder is in the pattern

### Merge Not Happening

**Check:**
1. Is the AI API available and working?
2. Check merge prompts are configured
3. Check connection profile is valid
4. Look for `[AutoLorebooks]` errors in console

### Entry Not Created

**Check:**
1. Is auto-create enabled?
2. Is there a lorebook attached to the chat?
3. Did you load the chat after enabling tracking?
4. Check console for creation errors

## Best Practices

### For AI Prompting

**Instruct the AI to use tracking syntax:**

```
You have access to special tracking entries for maintaining continuity:

- GM Notes: Use <-- gm_notes: content --> to record plot threads, secrets,
  important details, and future plans
- Character Stats: Use <-- character_stats: content --> to track character
  statistics, resources, and state changes

These entries are always visible to you and help maintain story continuity.
Use them when important changes occur or information should be remembered.
```

Or customize for your specific roleplay type.

### For GM Notes

Track whatever is important to your specific story. The format is up to you.

### For Character Stats

Track whatever is relevant to your specific roleplay. The AI will learn the structure from what's already in the entry.

## Advanced Usage

### Conditional Updates

The AI can include tracking updates conditionally based on what happens in the narrative.

### Multi-Entry Updates

The AI can update both GM notes and character stats in the same message.

### Narrative Integration

The tracking syntax can be placed anywhere in the AI's message. It will be removed (if that option is enabled) so the user only sees the narrative.

---

**Result:** AI maintains persistent, always-visible campaign state with minimal user intervention!

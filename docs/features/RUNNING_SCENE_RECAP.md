# Running Scene Recap - Technical Documentation

## Overview

The **Running Scene Recap** feature combines multiple individual scene recaps into a single, cohesive narrative memory that evolves as the roleplay progresses. This is the **recommended default behavior** following best practices from the rentry.org/how2claude#recap generation guide.

### Why Running Scene Recap?

**Problem**: Individual scene recaps inject as separate bullet points, creating a fragmented memory that:
- Wastes tokens on redundant information
- Makes it harder for Claude to extract relationships between scenes
- Doesn't follow the "state not events" best practice

**Solution**: Running scene recap combines all scenes into a cohesive narrative that:
- Focuses on current state across all scenes
- Deduplicates redundant information
- Merges related facts (character descriptions, locations, relationships)
- Stays under 2000 tokens through aggressive brevity
- Updates incrementally as new scenes are added

### Default Behavior

- **Always enabled**: Running scene recap is now always on (toggle removed)
- **Auto-generates**: After each new scene recap is created
- **Excludes latest**: By default excludes 1 latest scene to allow manual validation
- **Replaces individual scenes**: When enabled, injects running recap instead of individual scene recaps
- **Versioned**: Stores history of all generated versions with timestamps

---

## Architecture

### File Structure

```
ST-Auto-Recap/
├── runningSceneRecap.js       # Core logic - generation, storage, retrieval
├── runningSceneRecapUI.js     # Navbar controls - version selector, edit, regenerate
├── defaultPrompts.js            # running_scene_recap_prompt, default_running_scene_template
├── defaultSettings.js           # Settings defaults
├── settings.html                # UI settings panel
├── settingsUI.js                # Settings bindings
├── sceneBreak.js               # "Regenerate Running" button integration
├── memoryCore.js               # Memory injection integration
└── utils.js                    # Enhanced logging with SUBSYSTEM.RUNNING
```

### Data Flow

```
Scene Recap Generated (sceneBreak.js:721)
    ↓
auto_generate_running_recap() called (sceneBreak.js:721)
    ↓
collect_scene_recap_indexes_for_running() (runningSceneRecap.js:172-192)
    - Finds all messages with scene_recap_memory
    - Excludes latest N scenes (configurable)
    - Returns array of message indexes
    ↓
generate_running_scene_recap() (runningSceneRecap.js:194-279)
    - Builds scene_recaps_text from individual recaps
    - Gets current_running_recap (if exists)
    - Substitutes into running_scene_recap_prompt
    - Sends to LLM
    - Receives JSON with a single field: `{"recap": "...markdown narrative..."}`
    ↓
add_running_recap_version() (runningSceneRecap.js:126-152)
    - Stores in chat_metadata.auto_recap_running_scene_recaps
    - Creates new version object with timestamp
    - Sets as current version
    - Saves chat
    ↓
refresh_memory() triggers (sceneBreak.js:718)
    ↓
get_running_recap_injection() called (runningSceneRecap.js:299-317)
    - Gets current version content
    - Substitutes into running_scene_recap_template
    - Returns formatted injection text
    ↓
Injected into context (memoryCore.js:381-392)
```

---

## Data Structures

### Storage Location

```javascript
chat_metadata.auto_recap_running_scene_recaps = {
    current_version: 2,
    versions: [
        {
            version: 0,
            timestamp: 1704067200000,
            content: "## Characters\nAlice: Warrior...",
            scene_count: 3,
            excluded_count: 1
        },
        {
            version: 1,
            timestamp: 1704153600000,
            content: "## Characters\nAlice: Warrior, injured...",
            scene_count: 4,
            excluded_count: 1
        },
        {
            version: 2,
            timestamp: 1704240000000,
            content: "## Characters\nAlice: Warrior, recovered...",
            scene_count: 5,
            excluded_count: 1
        }
    ]
}
```

### Version Object Schema

```typescript
interface RunningSceneRecapVersion {
    version: number;           // Auto-incremented version number
    timestamp: number;         // Unix timestamp (milliseconds)
    content: string;          // The actual combined narrative text
    scene_count: number;      // How many scenes were included
    excluded_count: number;   // How many latest scenes were excluded
}

interface RunningSceneRecapStorage {
    current_version: number;                           // Currently active version
    versions: RunningSceneRecapVersion[];           // All versions
}
```

### Why This Structure?

1. **Versioning**: Allows rollback if LLM produces poor output
2. **Metadata**: `scene_count` and `excluded_count` help debug issues
3. **Timestamp**: Provides audit trail and version identification
4. **Incremental versions**: New versions never overwrite old ones
5. **Current pointer**: `current_version` allows switching between versions without data loss

---

## Settings Reference

### Core Settings (defaultSettings.js:150-166)

| Setting | Default | Description |
|---------|---------|-------------|
| `running_scene_recap_enabled` | `true` (legacy) | Legacy flag (running recap is always enabled) |
| `running_scene_recap_exclude_latest` | `1` | Number of latest scenes to exclude (allows validation) |
| `running_scene_recap_auto_generate` | `true` | Auto-generate when new scene recap created |
| `running_scene_recap_show_navbar` | `true` | Show navbar version controls |
| `running_scene_recap_prompt` | `running_scene_recap_prompt` | Prompt template for generation |
| `running_scene_recap_template` | `default_running_scene_template` | Injection template (XML) |
| `running_scene_recap_prefill` | `""` | Prefill text for LLM |
| `running_scene_recap_position` | `2` | Injection position (2 = before main prompt) |
| `running_scene_recap_depth` | `2` | Injection depth |
| `running_scene_recap_role` | `0` | Injection role (0 = system) |
| `running_scene_recap_scan` | `false` | Include in World Info scanning |
| `running_scene_recap_context_limit` | `15` | Context limit (percent or tokens) |
| `running_scene_recap_context_type` | `'percent'` | Type of context limit |
| `running_scene_recap_completion_preset` | `""` | Completion preset to use (empty = current) |
| `running_scene_recap_connection_profile` | `""` | Connection profile to use (empty = current) |

### Exclude Latest Scenes

**Purpose**: Allow manual validation of scene recaps before they're combined into the running recap.

**How it works**:
- `exclude_latest: 0` - Include all scenes immediately
- `exclude_latest: 1` - Wait until next scene recap before including current one (default)
- `exclude_latest: 2` - Wait 2 scene recaps before including

**Example**:
```
Scene 1: ✓ Has recap → Excluded (latest)
Scene 2: ✓ Has recap → Included
Scene 3: ✓ Has recap → Included
Scene 4: ✓ Has recap → Included

Running recap generated from: Scene 2, 3, 4
```

**Use case**: You generate Scene 1's recap, review it, make edits. After Scene 2's recap is generated, Scene 1 is included in the running recap.

---

## Prompt Design

### running_scene_recap_prompt (defaultPrompts.js:288-337)

**Key characteristics**:

1. **Output format**: JSON containing markdown narrative
   - Shape: `{ "recap": "...markdown with headers..." }`
   - Markdown headers organize content for readability
   - JSON envelope ensures reliable downstream parsing and validation

2. **Guidelines**:
   - Extreme brevity (fragments over sentences)
   - Focus on state not events
   - Merge and deduplicate information
   - Keep most recent state when conflicts exist

3. **Macros**:
   - `{{current_running_recap}}` - Previous version (if exists)
   - `{{scene_recaps}}` - Individual scene recaps to merge

4. **Handlebars conditionals**:
   ```handlebars
   {{#if current_running_recap}}
   // Current running recap (update and merge with new scenes):
   {{current_running_recap}}

   {{/if}}
   // New scene recaps to merge:
   {{scene_recaps}}
   ```

### Example Output Format

```markdown
## Characters
Alice: Warrior. Red hair, green eyes. Confident. Currently injured (arrow wound, left shoulder). Trusts Bob but suspicious of Clara.

Bob: Merchant. Rotund, jolly. Helps Alice despite risk. Hiding family secret.

Clara: Mysterious stranger. Appeared at tavern. Claims to know Alice's father.

## Locations
Riverside Tavern: Two-story inn, east side of river. Frequented by merchants. Alice staying in Room 3.

Old Mill: Abandoned, north of town. Meeting location Bob suggested.

## Current Situation
Alice wounded during bandit attack. Recuperating at tavern. Bob offered to help reach Old Mill. Clara approached with information about Alice's father.

## Plans and Secrets
Bob plans to reveal family connection at Old Mill.
Clara hiding true identity - actually Alice's estranged sister.
Bandits still searching for Alice.
```

### Why Narrative Instead of JSON?

**JSON format (individual scene recaps)**:
```json
{
  "npcs_facts": { "Alice": "Warrior. Red hair, green eyes." },
  "npcs_status": { "Alice": "injured" },
  "planned_events": ["Bob will reveal secret"]
}
```

**Narrative format (running recap)**:
```markdown
## Characters
Alice: Warrior. Red hair, green eyes. Currently injured.

## Plans
Bob will reveal family secret at Old Mill.
```

**Benefits**:
- **Less verbose**: No field names repeated for every entry
- **More natural**: Claude reads narrative better than JSON structure
- **Better merging**: "Alice: Warrior, injured" vs separate objects to merge
- **Token efficient**: ~30% fewer tokens for same information

### Template (default_running_scene_template)

```xml
<!--Roleplay memory containing current state and key facts from all previous scenes, combined into a cohesive narrative.
The information below takes priority over character and setting definitions. -->

<roleplay_memory>
{{running_recap}}
</roleplay_memory>
```

**Note**: Uses `<roleplay_memory>` tag (not `<roleplay_recap>`) following best practices to avoid triggering Claude's RLHF recap generation training.

---

## API Reference

### Core Functions (runningSceneRecap.js)

#### Storage Functions

```javascript
/**
 * Get running scene recap storage object from chat metadata
 * Creates it if it doesn't exist
 * @returns {RunningSceneRecapStorage}
 */
function get_running_recap_storage()
```

```javascript
/**
 * Get all running scene recap versions
 * @returns {RunningSceneRecapVersion[]}
 */
function get_running_recap_versions()
```

```javascript
/**
 * Get current running scene recap version number
 * @returns {number}
 */
function get_current_running_recap_version()
```

```javascript
/**
 * Get running scene recap by version number
 * @param {number} version - Version number (defaults to current)
 * @returns {RunningSceneRecapVersion|null}
 */
function get_running_recap(version = null)
```

```javascript
/**
 * Get current running scene recap content
 * @returns {string} - Content or empty string
 */
function get_current_running_recap_content()
```

#### Version Management

```javascript
/**
 * Set current running scene recap version
 * @param {number} version - Version number to set as current
 */
function set_current_running_recap_version(version)
```

```javascript
/**
 * Add a new running scene recap version
 * @param {string} content - Recap content
 * @param {number} scene_count - Number of scenes included
 * @param {number} excluded_count - Number of scenes excluded
 * @returns {number} - New version number
 */
function add_running_recap_version(content, scene_count, excluded_count)
```

```javascript
/**
 * Delete a running scene recap version
 * NOTE: Not exposed in UI - kept for potential future use
 * @param {number} version - Version number to delete
 */
function delete_running_recap_version(version)
```

#### Generation Functions

```javascript
/**
 * Collect scene recap indexes based on settings
 * Respects running_scene_recap_exclude_latest setting
 * @returns {number[]} - Array of message indexes with scene recaps
 */
function collect_scene_recap_indexes_for_running()
```

```javascript
/**
 * Generate running scene recap by combining individual scene recaps
 * Main generation function - calls LLM, creates new version
 * @returns {Promise<string|null>} - Generated recap or null on failure
 */
async function generate_running_scene_recap()
```

```javascript
/**
 * Auto-generate running scene recap if enabled
 * Called after scene recap is created/updated
 * Checks settings before generating
 */
async function auto_generate_running_recap()
```

```javascript
/**
 * Get running scene recap injection text for memory
 * @returns {string} - Formatted injection text
 */
function get_running_recap_injection()
```

### UI Functions (runningSceneRecapUI.js)

```javascript
/**
 * Create and initialize running scene recap navbar controls
 * Adds floating navbar to bottom-right of page
 */
function createRunningSceneRecapNavbar()
```

```javascript
/**
 * Update the navbar visibility and content
 * Called when settings change or versions are updated
 */
function updateRunningSceneRecapNavbar()
```

```javascript
/**
 * Update the version selector dropdown
 * Refreshes dropdown with current versions
 */
function updateVersionSelector()
```

---

## UI Components

### Navbar (Bottom-Right Floating)

**Location**: Fixed position at `bottom: 10px, right: 10px`

**Visibility**:
- Shows when: `running_scene_recap_show_navbar` is enabled (running recap is always active)
- Hides when: Navbar controls are disabled in settings

**Components**:

1. **Version Selector Dropdown**
   - Format: `v{version} ({scene_count} scenes, {date})`
   - Example: `v2 (5 scenes, 1/15/2024)`
   - Sorted: Newest first
   - Empty state: "No versions"

2. **Edit Button** (`fa-edit`)
   - Opens modal with current version content
   - Save creates new version (doesn't overwrite)
   - Disabled when no versions exist

3. **Regenerate Button** (`fa-rotate`)
   - Manually trigger regeneration
   - Shows spinner during generation
   - Updates dropdown after completion

**Event Handlers**:
```javascript
$('#running_recap_version_selector').on('change', onVersionChange);
$('#running_recap_edit_btn').on('click', onEditClick);
$('#running_recap_regenerate_btn').on('click', onRegenerateClick);
```

**Styling**:
```css
background: var(--SmartThemeBlurTintColor);
backdrop-filter: blur(var(--SmartThemeBlurStrength));
border: 1px solid var(--SmartThemeBorderColor);
border-radius: 10px;
padding: 8px 12px;
z-index: 3000;
```

### "Regenerate Running" Button (Per-Scene)

**Location**: In each scene recap box, after "Previous/Generate/Next Recap" buttons

**Layout**: `margin-left: auto` pushes it to the right side

**Visibility**: Always visible when scene recap is rendered

**Behavior**:
1. Checks if running scene recap enabled
2. Checks if current scene has recap
3. Shows spinner: `<i class="fa-solid fa-spinner fa-spin"></i> Regenerating...`
4. Calls `generate_running_scene_recap()`
5. Updates navbar version selector
6. Restores button: `<i class="fa-solid fa-sync-alt"></i> Regenerate Running`

**Error Handling**:
- Alert if running recap disabled
- Alert if scene has no recap yet
- Alert on generation failure with console error

**Integration** (sceneBreak.js:455-488):
```javascript
$sceneBreak.find('.scene-regenerate-running').off('click').on('click', async function(e) {
    e.stopPropagation();
    // ... validation checks
    const $btn = $(this);
    $btn.prop('disabled', true);
    $btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Regenerating...');

    try {
        await generate_running_scene_recap();
        if (window.updateVersionSelector) {
            window.updateVersionSelector();
        }
    } catch (err) {
        // ... error handling
    } finally {
        $btn.prop('disabled', false);
        $btn.html('<i class="fa-solid fa-sync-alt"></i> Regenerate Running');
    }
});
```

---

## Integration Points

### 1. Memory Injection (memoryCore.js:270-319)

**Priority system**:
```javascript
const scene_recap_position = get_settings('running_scene_recap_position');
const scene_recap_role = get_settings('running_scene_recap_role');
const scene_recap_depth = get_settings('running_scene_recap_depth');
const scene_recap_scan = get_settings('running_scene_recap_scan');

const scene_injection = get_running_recap_injection();
debug(SUBSYSTEM.MEMORY, `Using running scene recap for injection (${scene_injection.length} chars)`);
```

**Key points**:
- Running recap is the sole injection path
- Uses dedicated position/depth/role/scan settings
- Logged with `SUBSYSTEM.MEMORY` prefix

### 2. Scene Recap Generation (sceneBreak.js:720-721)

**Trigger point**: After scene recap is generated and stored

```javascript
await auto_generate_running_recap();
```

**Flow**:
1. Scene recap generated via "Generate" button or auto-detection
2. Recap stored in `message.scene_recap_memory`
3. `refresh_memory()` called to update injection
4. `auto_generate_running_recap()` called
5. Running recap regenerated with new scene included (if not excluded)

### 3. Settings UI (settingsUI.js:494-537)

**Bindings**:
```javascript
// Core settings
bind_setting('#running_scene_recap_auto_generate', 'running_scene_recap_auto_generate', 'boolean');
bind_setting('#running_scene_recap_show_navbar', 'running_scene_recap_show_navbar', 'boolean', () => {
    if (window.updateRunningSceneRecapNavbar) window.updateRunningSceneRecapNavbar();
});

// Injection settings
bind_setting('#running_scene_recap_position', 'running_scene_recap_position', 'number');
bind_setting('#running_scene_recap_depth', 'running_scene_recap_depth', 'number');
bind_setting('#running_scene_recap_role', 'running_scene_recap_role');
bind_setting('#running_scene_recap_scan', 'running_scene_recap_scan', 'boolean');

// Slider
const $runningExcludeLatest = $('#running_scene_recap_exclude_latest');
const $runningExcludeLatestDisplay = $('#running_scene_recap_exclude_latest_display');
$runningExcludeLatest.on('input change', function () {
    let val = Math.max(0, Math.min(5, Number($(this).val()) || 1));
    set_settings('running_scene_recap_exclude_latest', val);
    save_profile();
    $runningExcludeLatest.val(val);
    $runningExcludeLatestDisplay.text(val);
});

// Edit prompt button
bind_function('#edit_running_scene_recap_prompt', async () => {
    get_user_setting_text_input('running_scene_recap_prompt', 'Edit Running Scene Recap Prompt', description);
});
```

**Initialization** (settingsUI.js:582-585):
```javascript
// Initialize running scene recap navbar
const { createRunningSceneRecapNavbar, updateRunningSceneRecapNavbar } = await import('./runningSceneRecapUI.js');
createRunningSceneRecapNavbar();
updateRunningSceneRecapNavbar();
```

### 4. Export System (index.js:30-31)

```javascript
export * from './runningSceneRecap.js';
export * from './runningSceneRecapUI.js';
```

**Barrel export pattern**: All modules import from `index.js` which re-exports everything.

---

## Logging

### Subsystem Prefixes

**Format**: `[AutoRecap] [Subsystem] Message`

**Example**:
```
[AutoRecap] [Running] Starting running scene recap generation
[AutoRecap] [Running] Found 4 scene recaps (excluding latest 1)
[AutoRecap] [Running] Sending running scene recap prompt to LLM
[AutoRecap] [Running] Generated running recap (1847 chars)
[AutoRecap] [Running] Created running scene recap version 2 from 4 scenes
```

### Console Filtering

**All extension logs**:
```javascript
// Browser console filter
AutoRecap
```

**Running recap only**:
```javascript
// Browser console filter
[AutoRecap] [Running]
```

**Memory injection**:
```javascript
// Browser console filter
[AutoRecap] [Memory]
```

**UI interactions**:
```javascript
// Browser console filter
[AutoRecap] [UI]
```

### Debug vs Log vs Error

```javascript
debug(SUBSYSTEM.RUNNING, 'Detailed debug info');  // Always emits verbose tracing details
log(SUBSYSTEM.RUNNING, 'Important event');         // Standard operational updates
error(SUBSYSTEM.RUNNING, 'Error occurred', err);   // Shows + toast notification
```

---

## Testing Guide

### Initial Setup Test

1. **Fresh SillyTavern Start**
   ```bash
   # CRITICAL: Code changes require full restart
   # Close terminal window completely
   cd C:\Users\sarah\OneDrive\Desktop\personal\SillyTavern-New
   start.bat
   ```

2. **Verify Extension Loaded**
   - Open browser console (F12)
   - Filter by: `AutoRecap`
   - Should see: Extension initialization logs

3. **Verify Settings Panel**
   - Navigate to Extensions → Auto Recap
   - Scroll to "Running Scene Recap" section
   - Verify controls present (toggle removed – feature always enabled):
     - "Exclude Latest X Scene(s)" slider
     - "Auto-generate on New Scene Recaps" checkbox
     - "Show Navbar Version Controls" checkbox
     - "Edit Running Recap Prompt" button
     - Completion preset dropdown
     - Position/depth/role/scan controls

4. **Verify Navbar**
   - Should appear in bottom-right corner
   - Shows: "Running Recap:" label
   - Version selector dropdown
   - Edit button
   - Regenerate button

### Basic Functionality Test

**Scenario**: Generate 3 scene recaps, verify running recap auto-generates

1. **Create Scene Breaks**
   ```
   User: [Create message]
   AI: [Response]
   [Click scene break button on AI message]
   [Repeat 2 more times for total of 3 scene breaks]
   ```

2. **Generate Scene Recaps**
   ```
   For each scene break:
   - Click "Generate" button
   - Wait for recap to appear
   - Verify recap is generated
   ```

3. **Verify Running Recap Auto-Generation**
   ```
   After 2nd scene recap generated:
   - Console should show: [AutoRecap] [Running] Starting running scene recap generation
   - Should show: Found 1 scene recaps (excluding latest 1)
   - Should show: Created running scene recap version 0 from 1 scenes

   After 3rd scene recap generated:
   - Should show: Found 2 scene recaps (excluding latest 1)
   - Should show: Created running scene recap version 1 from 2 scenes
   ```

4. **Verify Navbar Updates**
   ```
   After each generation:
   - Dropdown should show new version
   - Format: "v0 (1 scenes, [date])", "v1 (2 scenes, [date])", etc.
   ```

5. **Verify Memory Injection**
   ```
   - Click "Refresh Memory" button (or send new message)
   - Console filter: [AutoRecap] [Memory]
   - Should show: Using running scene recap for injection (XXX chars)
   - Should NOT show individual scene recaps being injected
   ```

### Version Management Test

**Scenario**: Test version switching, editing, manual regeneration

1. **Switch Versions**
   ```
   - Change dropdown from v1 to v0
   - Console should show: [AutoRecap] [UI] Switched to running recap version 0
   - Toast should appear: "Switched to running recap version 0"
   - Memory should refresh
   ```

2. **Edit Current Version**
   ```
   - Click Edit button
   - Modal should open with current content
   - Modify text (e.g., add "EDITED" at top)
   - Save
   - Console should show: [AutoRecap] [UI] Created new running recap version X from edit
   - Toast: "Created new version X"
   - Dropdown should show new version
   ```

3. **Manual Regeneration**
   ```
   - Click Regenerate button
   - Button should show spinner
   - Console should show generation logs
   - Dropdown should update with new version
   - Toast: "Running recap regenerated"
   ```

### Scene-Level Regeneration Test

**Scenario**: Test "Regenerate Running" button on individual scenes

1. **Find Scene with Recap**
   ```
   - Locate any scene break with generated recap
   - Should have "Regenerate Running" button on right side
   ```

2. **Click Regenerate Running**
   ```
   - Button shows: <spinner> Regenerating...
   - Console shows generation logs
   - Navbar dropdown updates
   - Button restores: <icon> Regenerate Running
   ```

3. **Error Cases**
   ```
   Test with scene without recap:
   - Create scene break without generating recap
   - Click "Regenerate Running" button
   - Should alert: "This scene has no recap yet..."
   ```

### Exclude Latest Test

**Scenario**: Verify exclude_latest setting works correctly

1. **Set exclude_latest = 0**
   ```
   - Settings: Set slider to 0
   - Generate scene recap for Scene 1
   - Console should show: Found 1 scene recaps (excluding latest 0)
   - Running recap includes Scene 1 immediately
   ```

2. **Set exclude_latest = 1 (default)**
   ```
   - Settings: Set slider to 1
   - Generate scene recap for Scene 2
   - Console should show: Found 1 scene recaps (excluding latest 1)
   - Running recap includes Scene 1 only (Scene 2 excluded)

   - Generate scene recap for Scene 3
   - Console should show: Found 2 scene recaps (excluding latest 1)
   - Running recap includes Scene 1 and 2 (Scene 3 excluded)
   ```

3. **Set exclude_latest = 2**
   ```
   - Settings: Set slider to 2
   - Generate scene recap for Scene 4
   - Console should show: Found 2 scene recaps (excluding latest 2)
   - Running recap includes Scene 1 and 2 only (Scene 3 and 4 excluded)
   ```

### Prompt Customization Test

**Scenario**: Test custom prompt and prefill

1. **Edit Prompt**
   ```
   - Click "Edit Running Recap Prompt" button
   - Modal should open with current prompt
   - Modify prompt (e.g., add "ALWAYS START WITH 'RECAP:'")
   - Save
   - Generate new running recap
   - Verify output follows custom prompt
   ```

2. **Add Prefill**
   ```
   - Settings: Set prefill to "## Overview"
   - Generate new running recap
   - LLM response should start with "## Overview"
   ```

3. **Custom Completion Preset**
   ```
   - Settings: Select specific completion preset
   - Generate new running recap
   - Console should show: Using custom preset
   - Verify preset settings are used (temperature, max tokens, etc.)
   ```

### Injection Position Test

**Scenario**: Test different injection positions

1. **Before Main Prompt (Default)**
   ```
   - Settings: Position = "Before main prompt"
   - Send message
   - Check prompt builder logs
   - Running recap should appear before character card
   ```

2. **After Main Prompt**
   ```
   - Settings: Position = "After main prompt"
   - Send message
   - Running recap should appear after character card
   ```

3. **In Chat at Depth**
   ```
   - Settings: Position = "In chat at depth", Depth = 2
   - Send message
   - Running recap should appear 2 messages from bottom
   ```

4. **Do Not Inject**
   ```
   - Settings: Position = "Do not inject"
   - Send message
   - Console should NOT show running recap injection
   - Individual scene recaps should NOT be injected either
   ```

### Edge Cases

1. **No Scene Recaps Yet**
   ```
   - Fresh chat with no scene breaks
   - Running recap storage should not exist
   - Navbar dropdown shows: "No versions"
   - Edit button disabled
   - Memory injection empty
   ```

2. **All Scenes Excluded**
   ```
   - Have 2 scene recaps
   - Set exclude_latest = 2
   - Generate running recap
   - Console should show: Found 0 scene recaps (excluding latest 2)
   - Should return null, no version created
   ```

4. **LLM Failure**
   ```
   - Disconnect API or use invalid preset
   - Generate running recap
   - Console should show: [AutoRecap] [ERROR] [Running] Failed to generate
   - Toast: "Failed to generate running recap"
   - Button restores to normal state
   ```

---

## Troubleshooting

### Running Recap Not Auto-Generating

**Symptoms**: Scene recaps generate but running recap doesn't update

**Checks**:
1. Trigger a manual regeneration once (feature is always enabled; look for new versions)
2. Verify `running_scene_recap_auto_generate: true` in settings
3. Check exclude_latest setting - might be excluding all scenes
4. Check console for errors: `[AutoRecap] [ERROR] [Running]`
5. Verify LLM API is working (test with manual message)

**Debug**:
```javascript
// In browser console
const ctx = SillyTavern.getContext();
const settings = ctx.extension_settings.auto_recap;
console.log('Auto-gen:', settings.running_scene_recap_auto_generate);
console.log('Exclude:', settings.running_scene_recap_exclude_latest);
```

### Navbar Not Appearing

**Symptoms**: Navbar controls missing from bottom-right

**Checks**:
1. Verify `running_scene_recap_show_navbar: true` in settings
2. Check console for UI initialization: `[AutoRecap] [UI] Running scene recap navbar created`
3. Check DOM: `$('#running_scene_recap_navbar').length` should be 1

**Fix**:
```javascript
// Manually trigger navbar creation
const { updateRunningSceneRecapNavbar } = await import('./scripts/extensions/third-party/ST-Auto-Recap/runningSceneRecapUI.js');
updateRunningSceneRecapNavbar();
```

### Individual Scenes Still Injecting

**Symptoms**: Both running recap AND individual scenes in context

**Cause**: Legacy metadata or another extension injected stale scene recaps. The running recap code no longer falls back to individual scenes.

**Checks**:
1. Filter console: `[AutoRecap] [Memory]`
2. You should only see `Using running scene recap for injection` messages

**Debug**:
- Run `/log_scene_recap_injection` to print the current running recap injection payload
- If individual scenes appear, clear legacy metadata (`chat_metadata.auto_recap_scene_recaps`) and regenerate the running scene recap

### Version Selector Not Updating

**Symptoms**: Dropdown doesn't show new versions after generation

**Checks**:
1. Verify generation completed successfully (check console)
2. Verify version was added: `chat_metadata.auto_recap_running_scene_recaps.versions`
3. Check for errors in `updateVersionSelector()`

**Fix**:
```javascript
// Manually refresh version selector
window.updateVersionSelector();
```

### LLM Returns JSON Instead of Narrative

**Symptoms**: Running recap contains JSON structure instead of narrative paragraphs

**Cause**: LLM ignoring prompt instructions or confused with individual scene recap prompt

**Fix**:
1. Check prompt hasn't been edited to request JSON
2. Verify using correct prompt: `running_scene_recap_prompt` not `scene_recap_prompt`
3. Add to prefill: "## Characters" (forces narrative start)
4. Increase temperature slightly to encourage more natural output

**Debugging**:
```javascript
// Check current prompt
const settings = SillyTavern.getContext().extension_settings.auto_recap;
console.log(settings.running_scene_recap_prompt);
// Should contain: "Output ONLY valid JSON with a 'recap' field containing markdown"
```

### Memory Not Refreshing After Version Switch

**Symptoms**: Switch version but injection doesn't update

**Cause**: `refresh_memory()` not being called

**Fix**: Already implemented in `onVersionChange()` callback (runningSceneRecapUI.js:135-136)

**Verify**:
```javascript
// Should see in console after version switch
[AutoRecap] [UI] Switched to running recap version X
// Followed by:
[AutoRecap] [Memory] Using running scene recap for injection (XXX chars)
```

---

## Future Enhancements

### Planned Features

1. **Incremental Updates**
   - Instead of regenerating entire recap, just merge new scenes
   - Faster generation for long chats
   - Reduces LLM token usage

2. **Smart Pruning**
   - Automatically detect resolved plot threads
   - Remove outdated information (e.g., "planning to visit tavern" after already visited)
   - Keep recap under token limit as chat grows

3. **Diff Visualization**
   - Show what changed between versions
   - Highlight added/removed information
   - Help debug LLM hallucinations

4. **Export/Import Versions**
   - Export running recap as standalone file
   - Import from another chat
   - Share "memory packs" with others

5. **Branch Points**
   - Tag certain versions as "branch points"
   - Easy rollback to major story moments
   - "What if" alternate timeline exploration

6. **Token Analytics**
   - Show token count for each version
   - Graph token efficiency over time
   - Warn when approaching limit

### Code Structure Improvements

1. **Separate Prompt Builder**
   ```javascript
   // Currently inline in generate_running_scene_recap()
   // Should be:
   class RunningSceneRecapPromptBuilder {
       constructor(current_recap, scene_recaps) { }
       build() { }
       addPrefill() { }
       substituteHandlebars() { }
   }
   ```

2. **Version Comparator**
   ```javascript
   class VersionDiff {
       compare(v1, v2) { }
       getAdditions() { }
       getRemovals() { }
       getChanges() { }
   }
   ```

3. **Storage Abstraction**
   ```javascript
   class RunningSceneRecapStorage {
       constructor(chat_metadata) { }
       getVersions() { }
       addVersion(content, metadata) { }
       getCurrentVersion() { }
       setCurrentVersion(version) { }
       // Potential future: Compress old versions, archive to file, etc.
   }
   ```

### Performance Optimizations

1. **Lazy Loading**
   - Don't create navbar until first scene recap generated
   - Reduces initial load time

2. **Debounced Updates**
   - If multiple scenes generated rapidly, debounce running recap generation
   - Avoid spamming LLM API

3. **Cached Injections**
   - Cache formatted injection text
   - Only regenerate when current version changes
   - Reduces processing during message generation

4. **Incremental Versioning**
   - Store diffs instead of full content for each version
   - Reduces chat metadata size
   - Reconstruct version on-demand

---

## Known Limitations

### Current Constraints

1. **No Automatic Pruning**
   - Running recap will grow indefinitely as scenes are added
   - May eventually exceed optimal token count (2000)
   - Manual editing required to trim

2. **No Conflict Resolution**
   - If LLM receives contradictory information, it makes best guess
   - No validation against character cards or lorebooks
   - User must manually verify accuracy

3. **Version Limit**
   - No automatic cleanup of old versions
   - Chat metadata could grow large in very long chats
   - Consider future: Max 10 versions, auto-delete oldest

4. **Single Running Recap Per Chat**
   - Can't maintain multiple parallel running recaps
   - No "character A's perspective" vs "character B's perspective"
   - Would need to be implemented as separate storage keys

5. **No Handlebars Support in Template**
   - Template only supports `{{running_recap}}` substitution
   - Can't use conditionals or loops in template
   - Would need proper Handlebars parser integration

### Potential Issues

1. **LLM Hallucinations**
   - LLM may invent facts not in scene recaps
   - May merge similar characters incorrectly
   - Recommend periodic manual review

2. **Context Confusion**
   - If scenes have drastically different tones/settings
   - LLM may struggle to maintain coherent narrative
   - Works best with consistent storytelling

3. **Lost in the Middle**
   - Very long running recaps (>2000 tokens) may suffer from middle information loss
   - Same problem we're trying to solve with scenes
   - Needs smart pruning to maintain effectiveness

4. **Race Conditions**
   - If user triggers multiple regenerations rapidly
   - May create versions out of order
   - UI should disable buttons during generation

---

## Migration Guide

### Upgrading from Individual Scene Recaps

If you have existing chats using individual scene recaps and want to switch to running recap:

1. **Confirm Running Recap Controls**
   ```
   Settings → Running Scene Recap (toggle removed – feature always enabled)
   ```

2. **Generate Initial Running Recap**
   ```
   - Click any scene's "Regenerate Running" button
   - This will create v0 from all existing scenes (minus excluded)
   - Navbar will appear with version selector
   ```

3. **Verify Injection**
   ```
   - Send a test message or click "Refresh Memory"
   - Console should show: Using running scene recap for injection
   - Individual scenes should no longer be injected
   ```

4. **Cleanup (Optional)**
   ```
   - Individual scene recaps remain on messages
   - They're just not injected anymore
   - Can still view/edit them in scene break UI
   - Running recap uses them as source data
   ```

### Reverting to Individual Scenes

Running scene recap can no longer be disabled. If you need a blank injection temporarily, clear the running recap versions or adjust the running recap template to output minimal content.

---

## Best Practices

### For Users

1. **Review First Version**
   - After first running recap generated, read it carefully
   - Check for hallucinations or missing information
   - Edit if needed (creates v1)

2. **Periodic Manual Review**
   - Every 5-10 scenes, review running recap
   - Ensure important details aren't being lost
   - Edit to add missing information or remove redundancy

3. **Use Exclude Latest**
   - Keep at 1 (default) for manual validation
   - Review each scene recap before it's included
   - Catch errors early before they propagate

4. **Version Management**
   - Keep meaningful versions (good milestones)
   - After major edits, create explicit versions
   - Use version selector to compare improvements

5. **Token Awareness**
   - Aim to keep under 2000 tokens (estimate ~1500 words)
   - If getting too long, manually edit to remove resolved threads
   - Focus on current state, not historical events

### For Developers

1. **Test After Every Change**
   - Running recap generation is complex
   - Small changes can break prompt interpretation
   - Always test generation after modifying prompts

2. **Log Everything**
   - Use SUBSYSTEM.RUNNING prefix
   - Log all major steps (collection, generation, storage)
   - Makes debugging much easier

3. **Handle Errors Gracefully**
   - LLM calls can fail
   - Network issues, rate limits, etc.
   - Always restore UI state in finally blocks

4. **Maintain Backwards Compatibility**
   - Chat metadata format may change
   - Always check if fields exist before accessing
   - Provide defaults for missing fields

5. **Document Changes**
   - Update this document when changing behavior
   - Add JSDoc comments to new functions
   - Update examples in prompts

---

## Version History

### v1.0.0 - Initial Implementation (2024-01-XX)

**Features**:
- Versioned storage in chat_metadata
- Auto-generation after scene recaps
- Navbar controls (version selector, edit, regenerate)
- Per-scene "Regenerate Running" button
- Memory injection integration
- Full settings panel
- Enhanced logging with subsystem prefixes
- Exclude latest scenes support

**Files**:
- runningSceneRecap.js (319 lines)
- runningSceneRecapUI.js (206 lines)
- Updated: defaultSettings.js, defaultPrompts.js, settings.html, settingsUI.js, sceneBreak.js, memoryCore.js, utils.js, index.js

**Prompt Design**:
- Narrative output (not JSON)
- Extreme brevity guidelines
- State-focused (not event-focused)
- Merge and deduplicate instructions
- Handlebars conditionals for incremental updates

---

## Conclusion

The Running Scene Recap feature implements the best practices from rentry.org/how2claude#recap generation by:

1. **Combining fragmented information** into cohesive narrative
2. **Focusing on state not events** to avoid "lost in the middle" problems
3. **Using extreme brevity** to stay under token limits
4. **Deduplicating information** across scenes
5. **Providing versioning** to catch and fix LLM errors

This is the **recommended default** for scene-based memory in SillyTavern Auto-Recap extension.

For questions or issues, check:
- Console logs: `[AutoRecap] [Running]`
- This documentation
- Code comments in runningSceneRecap.js

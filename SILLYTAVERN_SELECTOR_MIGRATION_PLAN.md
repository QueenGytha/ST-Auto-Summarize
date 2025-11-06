# SillyTavern Selector Migration Plan

**Date:** 2025-01-06
**Status:** Planning Phase
**Scope:** Create `selectorsSillyTavern.js` and migrate all hardcoded SillyTavern selectors

---

## Executive Summary

This document outlines the complete migration plan for creating `selectorsSillyTavern.js` - a centralized file for all SillyTavern core UI selectors used by the ST-Auto-Summarize extension.

**CRITICAL:** This migration is for SillyTavern selectors ONLY. Extension selectors (handled by another AI) are in `selectorsExtension.js`.

---

## Phase 1: Create selectorsSillyTavern.js

### File Structure

```javascript
/**
 * SillyTavern Core UI Selectors
 *
 * Version: SillyTavern 1.12.x
 * Last Updated: 2025-01-06
 *
 * IMPORTANT: These selectors target SillyTavern's HTML elements.
 * They may break when SillyTavern updates.
 *
 * When ST updates:
 * 1. Tests will fail with selector errors
 * 2. Use Playwright MCP to discover new selectors
 * 3. Update this file
 * 4. Update version comment above
 *
 * RULES:
 * 1. Use precise selectors from ST's HTML
 * 2. NO fallback chains (precision required for AI)
 * 3. Document ST version for tracking
 * 4. Group by logical UI area
 *
 * Usage:
 * - Extension code: import { selectorsSillyTavern } from './index.js'
 * - Tests: import { selectorsSillyTavern } from '../../index.js'
 */

export const selectorsSillyTavern = {
  // Chat interface buttons
  buttons: {
    send: '#send_but',              // Send message button
    stop: '#mes_stop',              // Stop generation button
  },

  // Chat interface - main containers
  chat: {
    container: '#chat',             // Main chat container
    holder: '#sheld',               // Main chat holder/wrapper
    input: '#send_textarea',        // Chat input textarea
  },

  // Message elements (within chat)
  message: {
    template: '#message_template',  // Message template container
    block: '.mes',                  // Individual message block
    buttons: '.mes_buttons',        // Message button container
    extraButtons: '.extraMesButtons', // Extra buttons area in messages
    text: '.mes_text',              // Message text content
    hide: '.mes_hide',              // Hide message button
    unhide: '.mes_unhide',          // Unhide message button
  },

  // Group chat elements
  group: {
    memberTemplate: '#group_member_template',  // Group member template
    member: '.group_member',                   // Individual group member element
    memberIcon: '.group_member_icon',          // Group member icon
    membersContainer: '#rm_group_members',     // Group members container
  },

  // Extensions and settings UI
  extensions: {
    settings: '#extensions_settings2',  // Settings panel container
    menu: '#extensionsMenu',            // Extensions menu
    sysSettingsButton: '#sys-settings-button',  // System settings button
    connectionProfiles: '#connection_profiles', // Connection profiles UI element (if present)
  },

  // Event types (for eventSource.on)
  events: {
    CHAT_COMPLETION_PROMPT_READY: 'CHAT_COMPLETION_PROMPT_READY',
    CHARACTER_MESSAGE_RENDERED: 'CHARACTER_MESSAGE_RENDERED',
    USER_MESSAGE_RENDERED: 'USER_MESSAGE_RENDERED',
    GENERATE_BEFORE_COMBINE_PROMPTS: 'GENERATE_BEFORE_COMBINE_PROMPTS',
    MESSAGE_DELETED: 'MESSAGE_DELETED',
    MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
    MESSAGE_EDITED: 'MESSAGE_EDITED',
    MESSAGE_SWIPED: 'MESSAGE_SWIPED',
    CHAT_CHANGED: 'CHAT_CHANGED',
    CHAT_DELETED: 'CHAT_DELETED',
    GROUP_CHAT_DELETED: 'GROUP_CHAT_DELETED',
    MORE_MESSAGES_LOADED: 'MORE_MESSAGES_LOADED',
    MESSAGE_SENT: 'MESSAGE_SENT',
    GROUP_UPDATED: 'GROUP_UPDATED',
    WORLD_INFO_ACTIVATED: 'WORLD_INFO_ACTIVATED',
    WORLDINFO_ENTRIES_LOADED: 'WORLDINFO_ENTRIES_LOADED',
    GENERATION_STOPPED: 'GENERATION_STOPPED',
  },
};
```

**Rationale:**
- **Event types included**: While not DOM selectors, they're SillyTavern API strings that could change
- **Grouped logically**: By UI area for easy navigation
- **Comments**: Each selector has inline comment showing what it targets
- **Version tracking**: Documents ST version for maintenance

---

## Phase 2: Update Barrel Export (index.js)

Add to existing barrel exports:

```javascript
// Import SillyTavern selectors
import { selectorsSillyTavern } from './selectorsSillyTavern.js';

// Re-export
export {
  // ... existing exports
  selectorsExtension,
  selectorsSillyTavern,  // ADD THIS
  // ... other exports
};
```

---

## Phase 3: Systematic Migration by File

### Migration Strategy

**CRITICAL RULES:**
1. ✅ **Read entire file first** - understand context
2. ✅ **Verify exact selector match** - no false positives
3. ✅ **Check surrounding code** - ensure it's ST selector, not our extension
4. ✅ **One file at a time** - complete each file fully
5. ✅ **Test after each file** - run validation script

**NEVER:**
- ❌ Change selectors that are already using `selectorsExtension`
- ❌ Change selectors for our own extension's HTML
- ❌ Batch multiple files without verification
- ❌ Skip reading the full context

### File Priority Order (High Impact First)

#### **Tier 1: Core Event/API Files (Critical)**

1. **eventHandlers.js** (371-404 lines)
   - **Selectors:** 17+ event type strings
   - **Migration:** Replace hardcoded event strings with `selectorsSillyTavern.events.*`
   - **Example:**
     ```javascript
     // BEFORE:
     eventSource.on('CHAT_CHANGED', handler);

     // AFTER:
     import { selectorsSillyTavern } from './index.js';
     eventSource.on(selectorsSillyTavern.events.CHAT_CHANGED, handler);
     ```
   - **Risk Level:** HIGH - events are strings, typos would silently fail

2. **index.js** (28, 29, 95, 96, 223)
   - **Selectors:** `#send_but`, `#mes_stop`, `#send_textarea`
   - **Migration:** Replace `document.getElementById` and direct IDs
   - **Example:**
     ```javascript
     // BEFORE:
     const sendButton = document.getElementById('send_but');

     // AFTER:
     import { selectorsSillyTavern } from './index.js';
     const sendButton = document.querySelector(selectorsSillyTavern.buttons.send);
     ```
   - **Risk Level:** MEDIUM - buttons are accessed frequently

#### **Tier 2: UI Manipulation Files (High Impact)**

3. **sceneBreak.js** (lines 65, 77, 358, 407, 417)
   - **Selectors:** `.mes_buttons`, `.extraMesButtons`, `#message_template`, `.mes`, `.mes_text`, `#chat`
   - **Risk Level:** MEDIUM - DOM manipulation for scene UI

4. **lorebookViewer.js** (lines 20, 26, 36, 37, 130)
   - **Selectors:** `.mes_buttons`, `.extraMesButtons`, `#message_template`, `.mes`, `#chat`
   - **Risk Level:** MEDIUM - DOM manipulation for lorebook UI

5. **buttonBindings.js** (lines 22, 26, 30, 39, 45, 61, 71, 90)
   - **Selectors:** `#chat`, `.mes_hide`, `.mes_unhide`, `#group_member_template`, `.group_member`, `.group_member_icon`, `#rm_group_members`, `#extensionsMenu`
   - **Risk Level:** MEDIUM - button setup and event delegation

6. **settingsManager.js** (line 190)
   - **Selectors:** `#extensions_settings2`
   - **Risk Level:** LOW - single insertion point

7. **connectionProfiles.js** (lines 9, 19, 20, 95)
   - **Selectors:** `#sys-settings-button`, `#connection_profiles`, `toastr`
   - **Risk Level:** LOW - conditional feature detection

#### **Tier 3: UI Display Files (Medium Impact)**

8. **operationQueueUI.js** (line 65)
   - **Selectors:** `#sheld`
   - **Risk Level:** LOW - UI insertion

9. **runningSceneSummaryUI.js** (line 92)
   - **Selectors:** `#sheld`
   - **Risk Level:** LOW - UI insertion

10. **sceneNavigator.js** (lines 19, 23, 62)
    - **Selectors:** `#sheld`, `#chat`
    - **Risk Level:** LOW - navigation UI

11. **messageVisuals.js** (lines 68, 93)
    - **Selectors:** `.mes_text`, `.mes`, `#chat`
    - **Risk Level:** LOW - visual indicators

12. **autoSceneBreakDetection.js** (lines 614, 621)
    - **Selectors:** `GENERATION_STOPPED` event
    - **Risk Level:** LOW - event listener cleanup

---

## Phase 4: Verification Strategy

### Per-File Verification Checklist

After migrating each file:

```bash
# 1. Syntax check
npm run syntax-check

# 2. Selector validation
npm run validate:selectors

# 3. ESLint check
npm run lint:quiet

# 4. Manual review
git diff [filename]
```

### Verification Criteria

**For each migration, verify:**
1. ✅ Import statement added correctly
2. ✅ Selector path is correct (`selectorsSillyTavern.category.selector`)
3. ✅ No other code changed unintentionally
4. ✅ Selector usage matches original intent
5. ✅ No extension selectors were accidentally changed

### What to Look For (False Positive Prevention)

**DON'T change these (they're our extension):**
- Anything with `data-testid`
- Selectors already using `selectorsExtension`
- IDs from our `settings.html` (e.g., `#profile`, `#toggle_chat_memory`)

**DO change these (they're SillyTavern):**
- `#send_but`, `#mes_stop`, `#send_textarea`
- `#chat`, `#sheld`, `#message_template`
- `.mes`, `.mes_buttons`, `.mes_text`
- Event type strings like `'CHAT_CHANGED'`

---

## Phase 5: Testing Strategy

### Validation Script

The existing `scripts/validate-selectors.js` will catch hardcoded selectors.

**Expected behavior:**
- ❌ Before migration: "Hardcoded selectors found" errors
- ✅ After migration: "Selector validation passed"

### Manual Testing Checklist

After all migrations complete:

1. **Extension loads without errors**
   ```bash
   # Start SillyTavern and check console
   # No import errors, no undefined selector errors
   ```

2. **Core functionality works**
   - [ ] Messages display correctly
   - [ ] Summarization button appears
   - [ ] Scene break button appears
   - [ ] Lorebook viewer works
   - [ ] Operation queue displays
   - [ ] Settings panel loads

3. **Event handlers fire**
   - [ ] `CHAT_CHANGED` handler works
   - [ ] `MESSAGE_SENT` handler works
   - [ ] `MESSAGE_RENDERED` handler works

4. **UI insertions work**
   - [ ] Buttons appear in message blocks
   - [ ] UI appears after `#sheld`
   - [ ] Settings panel inserted correctly

---

## Phase 6: Documentation Updates

### Files to Update

1. **SELECTOR_MIGRATION_STATUS.md**
   - Mark SillyTavern selectors as migrated
   - Document any issues encountered

2. **CLAUDE.md** (if needed)
   - Update selector strategy section
   - Add notes about event type constants

---

## Risk Assessment

### High Risk Changes

**eventHandlers.js:**
- **Risk:** Typo in event type string = silent failure
- **Mitigation:** Use constants from `selectorsSillyTavern.events`
- **Verification:** Test each event type after migration

**index.js:**
- **Risk:** Breaking core button hiding/showing
- **Mitigation:** Test immediately after migration
- **Verification:** Verify send button still hides during operations

### Medium Risk Changes

**DOM Manipulation Files:**
- **Risk:** Wrong selector = UI doesn't appear
- **Mitigation:** Visual testing in live ST instance
- **Verification:** Check each UI element appears correctly

### Low Risk Changes

**UI Insertion Files:**
- **Risk:** Minimal - single insertion points
- **Mitigation:** Quick visual check
- **Verification:** Element appears in correct location

---

## Rollback Plan

If migration causes issues:

1. **Per-file rollback:**
   ```bash
   git checkout HEAD -- [filename]
   ```

2. **Complete rollback:**
   ```bash
   git checkout HEAD -- selectorsSillyTavern.js index.js [affected files]
   ```

3. **Identify issue:**
   - Check console for errors
   - Check which selector is undefined
   - Verify selector path in `selectorsSillyTavern.js`

---

## Success Criteria

Migration is complete when:

1. ✅ `selectorsSillyTavern.js` created with all selectors
2. ✅ `index.js` exports `selectorsSillyTavern`
3. ✅ All 12 files migrated successfully
4. ✅ `npm run validate:selectors` passes
5. ✅ `npm run lint` passes
6. ✅ Extension loads without errors
7. ✅ All core functionality tested and working
8. ✅ Documentation updated

---

## Execution Timeline

**Estimated time:** 2-3 hours

- Phase 1 (Create file): 15 min
- Phase 2 (Barrel export): 5 min
- Phase 3 (Migration): 90-120 min (12 files × 7-10 min each)
- Phase 4 (Verification): 20 min
- Phase 5 (Testing): 20 min
- Phase 6 (Documentation): 10 min

---

## Notes for AI Executor

**CRITICAL REMINDERS:**

1. **Always check selector files FIRST before using MCP**
   - The selectors are already documented in this plan
   - NO MCP needed for migration
   - Only use MCP if a selector is genuinely broken

2. **One file at a time**
   - Read entire file
   - Make changes
   - Verify
   - Move to next file

3. **No false positives allowed**
   - If uncertain whether selector is ST or extension: SKIP IT
   - Better to miss one than change wrong one

4. **Event types are strings**
   - `'CHAT_CHANGED'` → `selectorsSillyTavern.events.CHAT_CHANGED`
   - These are constants, not DOM selectors
   - But they belong in this file (ST API surface)

5. **Test frequently**
   - After every 2-3 files, run validation
   - Don't wait until all 12 files are done

---

## Appendix A: Complete Selector Inventory

### Buttons
- `#send_but` (2 files, 4 usages)
- `#mes_stop` (2 files, 4 usages)

### Containers
- `#chat` (6 files, 10+ usages)
- `#sheld` (4 files, 6+ usages)
- `#send_textarea` (1 file, 1 usage)
- `#message_template` (3 files, 4 usages)

### Message Elements
- `.mes` (3 files, 4 usages)
- `.mes_buttons` (3 files, 4 usages)
- `.extraMesButtons` (3 files, 4 usages)
- `.mes_text` (2 files, 3 usages)
- `.mes_hide` (1 file, 1 usage)
- `.mes_unhide` (1 file, 1 usage)

### Group Chat
- `#group_member_template` (1 file, 1 usage)
- `.group_member` (1 file, 2 usages)
- `.group_member_icon` (1 file, 1 usage)
- `#rm_group_members` (1 file, 1 usage)

### Settings/Extensions
- `#extensions_settings2` (1 file, 1 usage)
- `#extensionsMenu` (1 file, 1 usage)
- `#sys-settings-button` (1 file, 2 usages)
- `#connection_profiles` (1 file, 2 usages)

### Event Types
- 17 unique event type strings (1 file, 20+ usages)

**Total:** ~60-70 selector usages across 12 files

---

## Appendix B: Example Migration Pattern

### Before:
```javascript
// eventHandlers.js (line 302)
eventSource.on('CHAT_CHANGED', (chatId) => {
    // handle chat change
});

// index.js (line 28)
const sendButton = document.getElementById('send_but');
sendButton.style.display = 'none';

// sceneBreak.js (line 65)
const messageTemplate = $('#message_template').find('.mes_buttons');
```

### After:
```javascript
// eventHandlers.js (line 302)
import { selectorsSillyTavern } from './index.js';

eventSource.on(selectorsSillyTavern.events.CHAT_CHANGED, (chatId) => {
    // handle chat change
});

// index.js (line 28)
import { selectorsSillyTavern } from './selectorsSillyTavern.js';  // Direct import (barrel not available in index.js itself)

const sendButton = document.querySelector(selectorsSillyTavern.buttons.send);
sendButton.style.display = 'none';

// sceneBreak.js (line 65)
import { selectorsSillyTavern } from './index.js';

const messageTemplate = $(selectorsSillyTavern.message.template).find(selectorsSillyTavern.message.buttons);
```

---

**END OF MIGRATION PLAN**

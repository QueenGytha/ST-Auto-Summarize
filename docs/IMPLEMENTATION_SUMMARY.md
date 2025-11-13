# Prompt Versioning & Settings System - Implementation Summary

**Created:** 2025-11-12
**Status:** Ready for Implementation
**Purpose:** Guide for implementing prompt versioning and settings improvements

---

## What We're Doing

Implementing **two major improvements** to the ST-Auto-Summarize extension:

1. **Settings Versioning System** - Enable safe schema evolution and user data protection during updates
2. **Prompt Versioning with Immutable Defaults** - Version-controlled prompts with character/chat-level overrides

---

## Which Documents to Use

### ✅ AUTHORITATIVE DOCUMENTS (Use These)

| Document | Purpose | Use For |
|----------|---------|---------|
| **`SETTINGS_AND_PROFILES_ANALYSIS.md`** | Complete analysis of current settings system | Understanding how current system works |
| **`PROMPT_VERSIONING_VERIFICATION.md`** | Verification report with critical findings | Understanding what NOT to do (flaws to avoid) |
| **`PROMPT_VERSIONING_CORRECTED.md`** | Corrected design with immutable defaults | **PRIMARY IMPLEMENTATION GUIDE** |

### ❌ DEPRECATED DOCUMENTS (Do Not Use)

| Document | Status | Why Deprecated |
|----------|--------|----------------|
| `PROMPT_VERSIONING_DESIGN.md` | ❌ SUPERSEDED | Contains critical flaws, rating 6.5/10 |

---

## Quick Context: Why We're Doing This

### Problem 1: Settings Updates Overwrite User Data

**Current issue:**
- Extension updates might break existing profiles
- No safe way to evolve settings schema
- No migration system for settings changes
- Users stuck on old prompts forever

**Solution:**
- Add `_version` field to settings
- Create migration registry
- Track which migrations have run
- Safe schema evolution

### Problem 2: Default Prompts Stored Everywhere

**Current issue:**
- Every profile stores full copy of all prompts (~50KB per profile)
- Users never get improved default prompts
- No way to distinguish customized vs default
- Massive storage bloat

**Solution (Immutable Defaults):**
- Default prompts only in code (`defaultPrompts.js`)
- Profiles store ONLY user-customized prompts
- Editing default creates user version (fork)
- "Delete My Version" reverts to default
- 75-90% storage savings

---

## Implementation Overview

### Phase 1: Settings Versioning (Foundation)

**Goal:** Enable safe settings schema evolution

**Tasks:**
1. Add `_version` field to `default_settings`
2. Create migration registry in `settingsMigration.js`
3. Migrate ALL profiles on update (not just active)
4. Fix `import_profile()` to merge with defaults
5. Add migration backup mechanism

**Files to modify:**
- `defaultSettings.js` - Add `_version: 1`
- `settingsManager.js` - Update `soft_reset_settings()`
- `settingsMigration.js` - Add migration registry
- `profileManager.js` - Fix `import_profile()`

**Result:** Settings can evolve safely, user data protected

---

### Phase 2: Prompt Versioning (Core)

**Goal:** Implement immutable defaults system

**Key Principle:**
```
DEFAULT PROMPTS = READ-ONLY CODE
USER VERSIONS = WRITABLE DATA (created when user edits)
```

**Tasks:**
1. Create `promptVersionRegistry.js` - Default prompts metadata
2. Create `promptResolution.js` - Resolution algorithm
3. Create `promptMigration.js` - String → versioned migration
4. Refactor ALL prompt access sites to use `getPromptText()`
5. Update `export_profile()` to omit defaults
6. Update `import_profile()` to handle versioned prompts

**New files to create:**
- `promptVersionRegistry.js` - `getDefaultPrompt()`, version metadata
- `promptResolution.js` - `resolvePrompt()`, `getPromptText()`
- `promptMigration.js` - Migration logic
- `promptUpdate.js` - Update detection
- `promptSticky.js` - Sticky functionality
- `promptEditor.js` - UI components

**Files to modify:**
- `autoSceneBreakDetection.js:537` - Use `getPromptText()`
- `sceneBreak.js:867` - Use `getPromptText()`
- `runningSceneRecap.js:298, 410` - Use `getPromptText()`
- All Auto-Lorebooks prompt access (grep first)
- `profileManager.js` - Export/import changes

**Result:** Prompts versioned, defaults immutable, 75-90% storage savings

---

### Phase 3: Character/Chat Stickies

**Goal:** Allow per-character and per-chat prompt overrides

**Tasks:**
1. Add `character_sticky_prompts` to global settings
2. Add `chat_sticky_prompts` to global settings
3. Implement sticky functions (sticky/remove)
4. Update resolution to check stickies first
5. Add cleanup on chat delete

**Resolution priority:**
```
Chat sticky (highest)
  ↓
Character sticky
  ↓
Profile user version
  ↓
Default (code)
```

**Result:** Users can override prompts per character/chat

---

### Phase 4: UI Components

**Goal:** User-facing interface for managing prompts

**Tasks:**
1. Enhanced prompt editor (two states: default vs user version)
2. Badges (Default, My Version, Character Override, Chat Override)
3. "Edit" button (creates fork from default)
4. "Delete My Version" button (reverts to default)
5. Sticky menu (pin to character/chat)
6. Update notification modal
7. Version history viewer (optional)

**UI States:**
- **Default (read-only):** "Edit" button creates user version
- **User version (editable):** "Delete My Version" reverts to default
- **Override (editable):** "Remove Sticky" falls back to profile/default

**Result:** Intuitive UI for managing prompts

---

### Phase 5: Testing & Release

**Goal:** Ensure production readiness

**Tasks:**
1. Unit tests (resolution, migration, updates)
2. Integration tests (end-to-end workflows)
3. Migration testing (v1.x → v2.x)
4. Performance testing (storage savings verification)
5. Backward compatibility verification
6. Documentation updates (README, CLAUDE.md)

**Result:** Stable v2.0.0 release

---

## Critical Implementation Details

### 1. Prompts vs Settings (CRITICAL)

**Each prompt has associated SETTINGS that must stay SEPARATE:**

```javascript
// PROMPT (versioned if customized, optional in storage)
scene_recap_prompt: {
  id: "scene_recap_prompt",
  version: "2.1.0-custom-123",
  content: "Prompt text...",
  // ... metadata
}

// SETTINGS (always stored, NEVER versioned)
scene_recap_prefill: "{"
scene_recap_connection_profile: "uuid-1234"
scene_recap_completion_preset_name: "Creative"
scene_recap_include_preset_prompts: true
```

**Why separate:**
- Prompt = AI instructions (content to version)
- Settings = Configuration (runtime behavior, don't version)
- User may change settings without creating prompt version

**Sticky behavior:**
- Sticky the PROMPT only
- Settings resolved from profile

### 2. Migration Strategy (CRITICAL)

**Current (v1.x) profiles store prompts as strings:**
```javascript
{
  scene_recap_prompt: "You are a structured..."  // String
}
```

**Migration must:**
1. Compare string with default
2. If customized → Create user version
3. If not customized → DELETE from profile (use code default)

```javascript
// Migration logic
if (currentValue === defaultValue) {
  delete profileSettings[promptKey];  // Use code default
} else {
  profileSettings[promptKey] = createUserVersion(...);  // User version
}
```

**Result:**
- Non-customized prompts deleted (~75-90% storage saved)
- Customized prompts preserved as user versions
- Zero data loss

### 3. All Prompt Access Sites (CRITICAL)

**Must refactor ALL sites that access prompts:**

**Before:**
```javascript
const prompt = get_settings('scene_recap_prompt');
```

**After:**
```javascript
import { getPromptText } from './promptResolution.js';
const prompt = getPromptText('scene_recap_prompt');
```

**Known sites (grep for more):**
- `autoSceneBreakDetection.js:537`
- `sceneBreak.js:867`
- `runningSceneRecap.js:298`
- `runningSceneRecap.js:410`
- Auto-Lorebooks features (TBD)

**Action BEFORE implementing:**
```bash
grep -rn "get_settings.*_prompt" --include="*.js" | grep -v "prefill\|connection\|preset"
```

### 4. Templates Are NOT Prompts (CRITICAL)

**Exclude from versioning:**
- `running_scene_recap_template` - This is a wrapper template, NOT a prompt
- Templates are structural, not AI instructions

**Only version these 8 prompts:**
1. `scene_recap_prompt`
2. `scene_recap_error_detection_prompt`
3. `auto_scene_break_prompt`
4. `running_scene_recap_prompt`
5. `auto_lorebooks_recap_merge_prompt`
6. `auto_lorebooks_recap_lorebook_entry_lookup_prompt`
7. `auto_lorebooks_recap_lorebook_entry_deduplicate_prompt`
8. `auto_lorebooks_bulk_populate_prompt`

### 5. Import Must Merge Defaults (CRITICAL)

**Current `import_profile()` is broken:**
```javascript
profiles[name] = data;  // ❌ Direct assignment, no merging
```

**Must merge with defaults:**
```javascript
data = Object.assign(structuredClone(default_settings), data);
```

**Why:** Imported v1.x profiles lack v2.x fields, causing undefined errors.

---

## Key Algorithms

### Resolution Algorithm

```javascript
function resolvePrompt(promptId) {
  // 1. Check chat sticky (user version)
  const chatVersion = chat_sticky_prompts[chatId]?.[promptId];
  if (chatVersion) return chatVersion;

  // 2. Check character sticky (user version)
  const charVersion = character_sticky_prompts[charId]?.[promptId];
  if (charVersion) return charVersion;

  // 3. Check profile (user version)
  const profileVersion = profiles[profile][promptId];
  if (profileVersion && !profileVersion.isDefault) {
    return profileVersion;
  }

  // 4. Use default (from code)
  return getDefaultPrompt(promptId);
}
```

### Update Detection

```javascript
function hasUpdateAvailable(userVersion) {
  const defaultPrompt = getDefaultPrompt(userVersion.id);
  const latestVersion = defaultPrompt.version;
  const baseVersion = userVersion.basedOnVersion;

  return compareVersions(latestVersion, baseVersion) > 0;
}
```

---

## Expected Outcomes

### After Implementation

**Settings System:**
- ✅ Safe schema evolution (version tracking)
- ✅ User data protected during updates
- ✅ Migration system for settings changes
- ✅ Backward compatible profile import/export

**Prompt System:**
- ✅ Defaults immutable (always from code)
- ✅ User versions created only when edited
- ✅ 75-90% storage savings (typical user)
- ✅ Auto-updates for non-customized prompts
- ✅ Character/chat-level overrides
- ✅ Clear UI (Default vs My Version)

### Performance Metrics

**Storage comparison (typical 5 profiles, 2 customized prompts each):**
- v1.x: ~250KB (5 profiles × 50KB)
- v2.x: ~50KB (5 profiles × 10KB)
- **Savings: 80% (~200KB)**

**Load time:**
- No performance degradation (resolution cached)
- Faster profile loads (less data to parse)

---

## Pre-Implementation Checklist

Before starting implementation:

- [ ] Read `PROMPT_VERSIONING_CORRECTED.md` thoroughly
- [ ] Run grep for all prompt access sites
- [ ] Document exact refactoring scope
- [ ] Understand migration strategy (delete vs create)
- [ ] Understand prompts vs settings separation
- [ ] Review resolution priority chain

---

## Implementation Order

**Do NOT skip or reorder these phases:**

1. **Settings Versioning** (Week 1)
   - Foundation for everything else
   - Must complete before prompt versioning

2. **Prompt Versioning Core** (Week 1-2)
   - Create all new files
   - Refactor ALL prompt access sites
   - Critical: All-or-nothing (can't be partial)

3. **Character/Chat Stickies** (Week 2)
   - Builds on prompt versioning
   - Adds override capability

4. **UI Components** (Week 3)
   - User-facing interface
   - Can be iterative

5. **Testing & Release** (Week 4)
   - Comprehensive validation
   - Documentation updates

---

## Common Pitfalls to Avoid

### ❌ DON'T

1. **Store defaults in profiles** - Always pull from code
2. **Version settings with prompts** - Only version prompt text
3. **Partial refactoring** - Must update ALL prompt access sites at once
4. **Skip profile import fix** - Will break backward compatibility
5. **Forget templates** - Don't version `running_scene_recap_template`
6. **Skip migration backup** - Always create backup before migrating

### ✅ DO

1. **Grep before implementing** - Find all prompt access sites first
2. **Test migration thoroughly** - With real profiles
3. **Validate imports** - Test v1.x profile import
4. **Check storage savings** - Verify 75-90% reduction
5. **Follow immutable defaults principle** - Defaults = code, user versions = data
6. **Document all changes** - Update README, CLAUDE.md

---

## Quick Reference

### Key Concepts

| Concept | Definition |
|---------|------------|
| **Default prompt** | Immutable prompt from code, never stored |
| **User version** | User-customized fork, stored when edited |
| **Sticky** | Character/chat-specific override |
| **Resolution** | Algorithm to find which prompt to use |
| **Migration** | Converting v1.x → v2.x format |

### Key Functions

| Function | Purpose |
|----------|---------|
| `getDefaultPrompt(id)` | Get default from code (never stored) |
| `resolvePrompt(id)` | Find which prompt to use (priority chain) |
| `getPromptText(id)` | Get actual prompt text (unwrap object) |
| `createUserVersion()` | Fork default into editable user version |
| `deleteUserVersion()` | Revert to default |

### Storage Locations

| Data | Location |
|------|----------|
| Default prompts | `defaultPrompts.js` (code) |
| Default metadata | `promptVersionRegistry.js` (code) |
| User versions | `profiles[name][promptId]` (optional) |
| Character stickies | `character_sticky_prompts[char][id]` |
| Chat stickies | `chat_sticky_prompts[chatId][id]` |

---

## Success Criteria

Implementation is complete when:

- ✅ All prompt access sites use `getPromptText()`
- ✅ Migration deletes non-customized prompts
- ✅ Import/export works with v1.x and v2.x profiles
- ✅ UI shows Default vs My Version states
- ✅ Character/chat stickies work end-to-end
- ✅ Update detection alerts users to new defaults
- ✅ Storage reduced by 75-90% for typical users
- ✅ All tests passing (unit + integration)
- ✅ Documentation updated

---

## Getting Help

If stuck during implementation:

1. **Check `PROMPT_VERSIONING_CORRECTED.md`** - Most detailed guide
2. **Review `PROMPT_VERSIONING_VERIFICATION.md`** - Common pitfalls documented
3. **Check `SETTINGS_AND_PROFILES_ANALYSIS.md`** - How current system works
4. **Grep the codebase** - Find examples of similar patterns

---

## Final Notes

This is a **significant architectural improvement** that will:
- Make the extension more maintainable
- Enable safe evolution of prompts and settings
- Dramatically reduce storage footprint
- Improve user experience (auto-updates for defaults)

Take time to understand the immutable defaults principle before implementing. It's simple once you grasp it, but requires careful execution.

**Ready for implementation in fresh session!**

---

**END OF SUMMARY**

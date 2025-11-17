# Operation Config Versioning & Settings System - Implementation Summary

**Created:** 2025-11-12
**Updated:** 2025-11-17
**Status:** Planning Phase - Latest Spec: UI_DRIVEN_OPERATIONS_PRESETS.md
**Purpose:** Overview of atomic operation config versioning approaches

---

## Design Evolution

This document summarizes the **atomic operation config** approach. The latest design is:

**➡️ [UI_DRIVEN_OPERATIONS_PRESETS.md](UI_DRIVEN_OPERATIONS_PRESETS.md)** - **LATEST SPEC (2025-11-17)**

### Timeline:
1. **V1 (DESIGN_V1.md)** - Deprecated (flaws identified in VERIFICATION_REPORT.md)
2. **V2 (CORRECTED_DESIGN.md)** - Foundation: Atomic configs + immutable defaults
3. **V3 (UI_DRIVEN_OPERATIONS_PRESETS.md)** - **CURRENT**: Preset-based system with artifacts

---

## What We're Implementing (V3)

**Two-layer architecture** for operations configuration:

1. **Operation Artifacts** - Atomic configs (prompt + execution settings)
   - Reusable across multiple presets
   - Auto-versioned (v1, v2, v3...)
   - Stored in global registry

2. **Operations Presets** - Bundles that reference artifacts
   - Maps each operation type to specific artifact
   - Can be stickied to character/chat
   - Shareable via import/export (API key safe)

---

## Which Documents to Use

### ✅ AUTHORITATIVE DOCUMENTS (Use These)

| Document | Purpose | Use For |
|----------|---------|---------|
| **`UI_DRIVEN_OPERATIONS_PRESETS.md`** | **LATEST SPEC** - Preset-based system with artifacts | **PRIMARY IMPLEMENTATION GUIDE (2025-11-17)** |
| **`CORRECTED_DESIGN.md`** | Foundation: Atomic configs + immutable defaults | Understanding core atomic config concept |
| **`VERIFICATION_REPORT.md`** | Critical review of V1 design | Understanding what NOT to do (flaws to avoid) |
| **`SETTINGS_AND_PROFILES_ANALYSIS.md`** | Analysis of current settings system | Understanding how current system works |

### ❌ DEPRECATED DOCUMENTS (Do Not Use)

| Document | Status | Why Deprecated |
|----------|--------|----------------|
| `DESIGN_V1.md` | ❌ SUPERSEDED | Contains critical flaws, rating 6.5/10, scattered settings approach |

---

## V3 vs V2: Key Differences

| Aspect | V2 (CORRECTED_DESIGN.md) | V3 (UI_DRIVEN_OPERATIONS_PRESETS.md) |
|--------|---------------------------|--------------------------------------|
| **Architecture** | Single-layer: Operation configs | Two-layer: Presets → Artifacts |
| **Stickying** | Individual operation configs | Entire preset bundles |
| **Shareability** | Not designed for sharing | Import/export with API key safety |
| **Artifact Reuse** | Each profile has independent configs | One artifact used in multiple presets |
| **Versioning** | Track history per operation | Auto-increment v<N> on edit |
| **Organization** | Per-operation stickies | Bundled presets for coherent configs |
| **UI Approach** | Edit individual configs | Manage presets + artifacts |

**Why V3?**
- More flexible organization (character-specific preset bundles)
- Better shareability (users can share community presets)
- Cleaner UX (one preset selector vs 8 sticky buttons)
- Artifact reuse (efficiency + consistency)

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

### Problem 2: Default Operation Configs Stored Everywhere (Scattered)

**Current issue:**
- Every profile stores full copy of all operation configs (8 operations × 5 settings = 40 keys per profile, ~50KB)
- Settings scattered: `scene_recap_prompt`, `scene_recap_prefill`, `scene_recap_connection_profile`, etc.
- Users never get improved default configs
- No way to distinguish customized vs default
- Massive storage bloat

**Solution (Atomic Immutable Defaults):**
- Default operation configs only in code (`operationConfigRegistry.js`)
- Each operation = ONE atomic object (prompt + prefill + connection_profile + preset + flags)
- Profiles store ONLY user-customized operation configs
- Editing ANY field creates user version of ENTIRE config (fork)
- "Delete My Version" reverts to default
- 75-90% storage savings + cleaner structure (1 key per operation instead of 5)

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

### Phase 2: Operation Config Versioning (Core)

**Goal:** Implement atomic operation configs with immutable defaults system

**Key Principle:**
```
DEFAULT OPERATION CONFIGS = READ-ONLY CODE (entire config: prompt + settings)
USER VERSIONS = WRITABLE DATA (created when user edits ANY field)
```

**Tasks:**
1. Create `operationConfigRegistry.js` - Default operation configs (atomic) + metadata
2. Create `operationConfigResolution.js` - Resolution algorithm (returns entire config)
3. Create `operationConfigMigration.js` - Scattered settings → atomic config migration
4. Refactor ALL operation config access sites to use `resolveOperationConfig()`
5. Update `export_profile()` to omit defaults
6. Update `import_profile()` to handle versioned atomic configs

**New files to create:**
- `operationConfigRegistry.js` - `getDefaultConfig()`, `OPERATION_CONFIGS`, version metadata
- `operationConfigResolution.js` - `resolveOperationConfig()`, `getPromptText()`, `getPrefillText()`, etc.
- `operationConfigMigration.js` - Migration logic (gather scattered → compare → store if customized)
- `operationConfigUpdate.js` - Update detection
- `operationConfigSticky.js` - Sticky functionality (entire configs)
- `operationConfigEditor.js` - UI components

**Files to modify:**
- `autoSceneBreakDetection.js` - Use `resolveOperationConfig('auto_scene_break')`
- `sceneBreak.js` - Use `resolveOperationConfig('scene_recap')`
- `runningSceneRecap.js` - Use `resolveOperationConfig('running_scene_recap')`
- All Auto-Lorebooks operation access (grep first)
- `profileManager.js` - Export/import changes
- `recapping.js` - Use config fields from resolved config

**Result:** Operation configs versioned (atomic), defaults immutable, 75-90% storage savings, cleaner structure

---

### Phase 3: Character/Chat Stickies

**Goal:** Allow per-character and per-chat operation config overrides

**Tasks:**
1. Add `character_sticky_configs` to global settings
2. Add `chat_sticky_configs` to global settings
3. Implement sticky functions (sticky/remove - entire configs)
4. Update resolution to check stickies first
5. Add cleanup on chat delete

**Resolution priority:**
```
Chat sticky (entire config - highest)
  ↓
Character sticky (entire config)
  ↓
Profile user version (entire config)
  ↓
Default (entire config from code)
```

**Important:** Stickying stickies the **entire operation config** (prompt + prefill + connection_profile + preset + flags), not individual fields.

**Result:** Users can override entire operation configs per character/chat

---

### Phase 4: UI Components

**Goal:** User-facing interface for managing operation configs

**Tasks:**
1. Enhanced operation config editor (two states: default vs user version)
2. Badges (Default, My Version, Character Override, Chat Override)
3. "Edit" button (creates fork of ENTIRE config from default)
4. "Delete My Version" button (reverts to default, deletes ENTIRE config)
5. Sticky menu (pin ENTIRE config to character/chat)
6. Update notification modal
7. Version history viewer (optional)

**UI States:**
- **Default (read-only):** "Edit" button creates user version of entire config
- **User version (editable):** "Delete My Version" reverts to default, editing ANY field saves entire config
- **Override (editable):** "Remove Sticky" falls back to profile/default

**UI displays:**
- Prompt text (textarea)
- Prefill text (input)
- Connection profile (dropdown)
- Completion preset name (input)
- Include preset prompts (checkbox)

**Result:** Intuitive UI for managing atomic operation configs

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

### 1. Atomic Operation Configs (CRITICAL)

**Each operation = ONE atomic versioned artifact (all fields together):**

```javascript
// ATOMIC OPERATION CONFIG (versioned if customized, optional in storage)
scene_recap: {
  id: "scene_recap",
  version: "2.1.0-custom-123",

  // All fields in ONE object
  prompt: "Prompt text...",
  prefill: "{",
  connection_profile: null,  // null = use current
  completion_preset_name: "Creative",
  include_preset_prompts: true,

  // Metadata
  isDefault: false,
  userModified: true,
  // ...
}
```

**Why atomic:**
- Changing ANY field (prompt, prefill, connection_profile, etc.) creates user version of ENTIRE config
- Simpler to reason about: "Is scene_recap customized?" → Check if key exists
- Cleaner storage: 1 key per operation instead of 5 scattered keys
- Stickying stickies ENTIRE config (not just prompt)

**Sticky behavior:**
- Sticky the **ENTIRE operation config**
- Includes prompt + prefill + connection_profile + preset + flags

### 2. Migration Strategy (CRITICAL)

**Current (v1.x) profiles store scattered settings:**
```javascript
{
  scene_recap_prompt: "You are a structured...",  // String
  scene_recap_prefill: "{",                        // Separate
  scene_recap_connection_profile: "",              // Separate
  scene_recap_completion_preset_name: "",          // Separate
  scene_recap_include_preset_prompts: false,       // Separate
}
```

**Migration must:**
1. Gather all 5 settings into one config
2. Compare ENTIRE config with default
3. If customized → Create user version (entire config)
4. If not customized → DELETE (use code default)
5. Delete old scattered keys

```javascript
// Migration logic
const gatheredConfig = {
  prompt: profile[`${opType}_prompt`],
  prefill: profile[`${opType}_prefill`],
  connection_profile: profile[`${opType}_connection_profile`] || null,
  completion_preset_name: profile[`${opType}_completion_preset_name`],
  include_preset_prompts: profile[`${opType}_include_preset_prompts`],
};

if (deepEqualConfigs(gatheredConfig, defaultConfig)) {
  // Not customized, don't store (use code default)
} else {
  profile[opType] = createUserVersion(opType, gatheredConfig);
}

// Delete old scattered keys
delete profile[`${opType}_prompt`];
delete profile[`${opType}_prefill`];
// ... etc
```

**Result:**
- Non-customized configs NOT stored (~75-90% storage saved)
- Customized configs preserved as atomic user versions
- Scattered settings consolidated
- Zero data loss

### 3. All Operation Config Access Sites (CRITICAL)

**Must refactor ALL sites that access operation configs:**

**Before:**
```javascript
const prompt = get_settings('scene_recap_prompt');
const prefill = get_settings('scene_recap_prefill');
const connectionProfile = get_settings('scene_recap_connection_profile');
// ... scattered access
```

**After:**
```javascript
import { resolveOperationConfig } from './operationConfigResolution.js';
const config = resolveOperationConfig('scene_recap');
const prompt = config.prompt;
const prefill = config.prefill;
const connectionProfile = config.connection_profile;
// OR use helper functions:
import { getPromptText, getPrefillText } from './operationConfigResolution.js';
const prompt = getPromptText('scene_recap');
```

**Known sites (grep for more):**
- `autoSceneBreakDetection.js` - Use `resolveOperationConfig('auto_scene_break')`
- `sceneBreak.js` - Use `resolveOperationConfig('scene_recap')`
- `runningSceneRecap.js` - Use `resolveOperationConfig('running_scene_recap')`
- `recapping.js` - Use resolved config fields
- Auto-Lorebooks features (TBD)

**Action BEFORE implementing:**
```bash
grep -rn "get_settings.*_prompt\|get_settings.*_prefill\|get_settings.*_connection_profile" --include="*.js"
```

### 4. Templates Are NOT Operation Configs (CRITICAL)

**Exclude from versioning:**
- `running_scene_recap_template` - This is a wrapper template, NOT an operation config
- Templates are structural, not operation configs

**Only version these 8 operation types:**
1. `scene_recap`
2. `scene_recap_error_detection`
3. `auto_scene_break`
4. `running_scene_recap`
5. `auto_lorebooks_recap_merge`
6. `auto_lorebooks_recap_lorebook_entry_lookup`
7. `auto_lorebooks_recap_lorebook_entry_deduplicate`
8. `auto_lorebooks_bulk_populate`

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

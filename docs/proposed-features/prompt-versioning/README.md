# Prompt Versioning - Proposed Feature

**Status:** NOT IMPLEMENTED (Design Phase Only)

**Last Updated:** 2025-11-12

---

## Overview

This folder contains design documentation for a prompt versioning system that would enable:

1. **Settings Versioning** - Safe schema evolution with migrations
2. **Immutable Default Prompts** - Defaults in code, user versions created only when edited
3. **Character/Chat Overrides** - Per-character and per-chat prompt customization
4. **Update Notifications** - Alert users when improved prompts are available
5. **Automatic Updates** - Users get prompt improvements automatically (unless customized)

**IMPORTANT:** This feature is NOT implemented. These documents represent design work only.

---

## Implementation Status

- ❌ **NOT IMPLEMENTED** - No code exists
- ✅ Design specification complete
- ✅ Verification report identifies critical flaws in V1
- ✅ Corrected design (immutable defaults) created
- ⏸️ Awaiting decision on implementation priority

---

## Key Documents

### Start Here

- **[UI_DRIVEN_OPERATIONS_PRESETS.md](UI_DRIVEN_OPERATIONS_PRESETS.md)** - **LATEST SPEC** - UI-driven presets system (2025-11-17)
- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Overview of atomic operation configs approach
- **[CORRECTED_DESIGN.md](CORRECTED_DESIGN.md)** - Atomic configs with immutable defaults (foundation for presets system)

### Analysis & Verification

- **[VERIFICATION_REPORT.md](VERIFICATION_REPORT.md)** - Critical review of V1 design (rating: 6.5/10)
- **[DESIGN_V1.md](DESIGN_V1.md)** - ❌ DEPRECATED - Original design with critical flaws

---

## Design Evolution

**V1 (DESIGN_V1.md)** - ❌ DEPRECATED
- Versioned prompts with character/chat stickies
- Critical flaws identified in VERIFICATION_REPORT.md
- Rating: 6.5/10

**V2 (CORRECTED_DESIGN.md)** - ✅ Foundation
- Atomic operation configs (prompt + execution settings together)
- Immutable defaults principle (defaults in code, not stored)
- 75-90% storage savings
- Resolution: Chat sticky → Character sticky → Profile → Default

**V3 (UI_DRIVEN_OPERATIONS_PRESETS.md)** - ✅ **LATEST**
- Builds on V2's atomic configs
- Adds two-layer architecture: **Presets** (bundles) reference **Artifacts** (configs)
- Auto-versioning with v<N> increments
- Import/export with API key safety
- Artifact reuse across multiple presets

---

## Core Principles

### 1. Atomic Operation Configs (from V2/CORRECTED_DESIGN.md)

Each operation type is **one atomic artifact** containing:
- Prompt text
- Prefill
- Connection profile
- Completion preset name
- Include preset prompts flag

**Benefits:**
- No scattered settings (1 object instead of 5 separate keys)
- Atomic editing (change any field = new version)
- Simpler resolution

### 2. Two-Layer Architecture (V3/UI_DRIVEN_OPERATIONS_PRESETS.md)

```
Operations Preset (shareable bundle, can be stickied)
├── Scene Recap → References "Detailed Recap v3" artifact
├── Scene Break → References "Strict Detection v1" artifact
└── ... (8 operation types)

Operation Artifact (atomic config, reusable)
├── Prompt text
├── Prefill
├── Connection profile
├── Completion preset name
└── Include preset prompts flag
```

**Key Innovation:**
- **Presets** bundle artifact references (shareable, stickied to char/chat)
- **Artifacts** are the actual configs (reusable across presets)
- Auto-versioning with v<N> increments
- Import/export with API key safety

**Benefits:**
- Artifact reuse (one artifact in multiple presets)
- Shareable configs (users can share presets)
- Character-specific presets (without duplication)
- Clear organization (bundled configs vs scattered settings)

---

## Resolution Priority (V3 System)

Two-step resolution:

**Step 1: Resolve which preset to use**
```
HIGHEST PRIORITY
    ↓
Chat sticky preset - if exists
    ↓
Character sticky preset - if exists
    ↓
Profile active preset - if exists
    ↓
Default preset - always available
    ↓
LOWEST PRIORITY
```

**Step 2: Resolve artifact for specific operation**
```
Preset.operations[operation_type] → artifact_name
    ↓
operation_artifacts[operation_type].find(artifact_name)
    ↓
Returns: { prompt, prefill, connection_profile, ... }
```

**Result:** Returns the **entire operation config** (atomic artifact) for that operation type.

---

## What This Feature Would Provide

If implemented, this would enable:

1. **Safe Settings Evolution** - Add/change settings without breaking profiles
2. **Settings Migrations** - Automatic migration system for schema changes
3. **Prompt Improvements** - Users get better prompts automatically
4. **User Customization** - Edit prompts per-profile, per-character, or per-chat
5. **Update Detection** - Notify users when new prompt versions available
6. **Clean Exports** - Profile exports omit defaults (smaller files)

---

## Critical Fixes from V1

The V1 design had several critical flaws identified in VERIFICATION_REPORT.md:

1. ❌ **Misunderstood prompt storage** - Thought prompts were literals, actually imported constants
2. ❌ **Confused prompts with settings** - Each prompt has 4 associated settings (prefill, connection_profile, etc.)
3. ❌ **Wrong sticky storage** - Designed for extension_settings, should use chat_metadata
4. ❌ **No validation** - Didn't handle corrupted/malformed prompt objects

V2 (CORRECTED_DESIGN.md) fixes all these issues with **atomic operation configs**:

- ✅ **One versioned artifact per operation** - Prompt + prefill + connection_profile + preset settings
- ✅ **No scattered settings** - `scene_recap` object instead of 5 separate `scene_recap_*` keys
- ✅ **Simpler resolution** - One lookup returns entire config
- ✅ **Atomic editing** - Changing any field creates user version of entire config

---

## Implementation Estimate

**Phase 1: Settings Versioning** (Foundation)
- 3-4 hours
- Add `_version` field
- Create migration registry
- Fix multi-profile migration

**Phase 2: Prompt Versioning** (Core)
- 5-6 hours
- Implement immutable defaults
- Create resolution algorithm
- Migration from current strings to versioned structure

**Phase 3: UI** (User-facing)
- 4-5 hours
- Prompt editor with "Default" vs "My Version" indication
- "Delete My Version" button
- Update notifications

**Total:** 12-15 hours for complete implementation

---

## Decision Points

Before implementing, decide:

1. **Priority** - Implement now or wait for user request?
2. **Scope** - Settings versioning only, or full prompt versioning?
3. **Migration Strategy** - Aggressive (auto-delete non-customized) or conservative?
4. **UI Design** - Simple or advanced (version history, diff view)?

---

## Related Documentation

- **[../../../reference/SETTINGS_AND_PROFILES_ANALYSIS.md](../../reference/SETTINGS_AND_PROFILES_ANALYSIS.md)** - Analysis of current settings system
- **[../../../guides/DEFAULT_SETTINGS_BEST_PRACTICES.md](../../guides/DEFAULT_SETTINGS_BEST_PRACTICES.md)** - Current best practices

---

*This is a proposed feature. All documentation is design only. No implementation exists.*

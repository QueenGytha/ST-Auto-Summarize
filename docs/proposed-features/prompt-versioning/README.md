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

- **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Overview and implementation guide
- **[CORRECTED_DESIGN.md](CORRECTED_DESIGN.md)** - **PRIMARY SPEC** - Authoritative design with immutable defaults

### Analysis & Verification

- **[VERIFICATION_REPORT.md](VERIFICATION_REPORT.md)** - Critical review of V1 design (rating: 6.5/10)
- **[DESIGN_V1.md](DESIGN_V1.md)** - ❌ DEPRECATED - Original design with critical flaws

---

## Core Principle: Immutable Defaults

**Default prompts = READ-ONLY CODE (never stored in profiles)**

```
User clicks "Edit" on default prompt
  → Creates user version (fork)
  → Stores in profile/chat/character sticky
  → User edits their version

User clicks "Delete My Version"
  → Deletes user version
  → Reverts to default (always available from code)
```

**Benefits:**
- 75-90% storage savings (only customizations stored)
- Users get improvements automatically (unless they customized)
- Clear distinction between default vs user versions
- No version history bloat

---

## Resolution Priority

When resolving which prompt to use:

```
HIGHEST PRIORITY
    ↓
Chat sticky (user version) - if exists
    ↓
Character sticky (user version) - if exists
    ↓
Profile (user version) - if exists
    ↓
Default (from code) - always available
    ↓
LOWEST PRIORITY
```

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

V2 (CORRECTED_DESIGN.md) fixes all these issues.

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

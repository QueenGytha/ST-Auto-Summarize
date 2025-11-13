# Checkpoint Integration: Implementation Checklist

**Document Version:** 1.0
**Last Updated:** 2025-01-12
**Purpose:** Pre-implementation validation and progress tracking

## Document Purpose

This checklist ensures all critical research, validation, and planning steps are completed before beginning checkpoint integration implementation. Use this to track progress and verify readiness at each phase.

---

## Pre-Implementation Validation

### Documentation Review

- [x] Read CHECKPOINT_BRANCH_INTEGRATION.md (general overview)
- [x] Read CHECKPOINT_BRANCH_BEHAVIOR.md (low-level code analysis)
- [x] Read DATA_STORAGE_INVENTORY.md (extension data storage)
- [x] Read CHECKPOINT_INTEGRATION_COMPLETE.md (implementation spec)
- [x] Read CHECKPOINT_RISKS_AND_MITIGATIONS.md (risk analysis)
- [ ] Team review of all documentation completed
- [ ] All team members understand checkpoint/branch mechanics
- [ ] All team members understand identified risks

### Code Verification

- [x] Verified SillyTavern's `saveChat()` metadata merge behavior
- [x] Verified SillyTavern's `getChat()` metadata replace behavior
- [x] Verified `createNewBookmark()` implementation and timing
- [x] Verified `branchChat()` implementation and auto-open behavior
- [x] Verified extension's data storage locations
- [x] Verified extension's current group chat support
- [x] Verified extension's profile system
- [ ] Confirmed current SillyTavern version compatibility

### Risk Assessment

- [x] All 10 critical risks identified and documented
- [x] P0 mitigations defined (Branch timing, Concurrent operations)
- [x] P1 mitigations defined (Data corruption safeguards)
- [x] P2 mitigations defined (Nested checkpoints, Performance)
- [ ] Team consensus on mitigation priorities
- [ ] Decision made on P2/P3 scope inclusion

### Test Environment

- [ ] SillyTavern running at localhost:8000
- [ ] Test character/chat created
- [ ] Test lorebook created (small: 50 entries)
- [ ] Test lorebook created (medium: 200 entries)
- [ ] Test lorebook created (large: 500+ entries)
- [ ] Playwright test environment validated
- [ ] Can create/switch checkpoints manually in test environment

---

## Phase 0: Foundation (Before Any Code)

### Decision Points

- [ ] **DECISION:** Include P2 mitigations in initial release? (Y/N)
  - Nested checkpoint safeguards (root_chat, nesting limits)
  - Performance warnings and cleanup utility
  - **Recommendation:** Yes (adds 8 hours, prevents issues)

- [ ] **DECISION:** Include P3 enhancements? (Y/N)
  - Version compatibility check
  - Checkpoint integrity checker
  - Enhanced UI indicators
  - **Recommendation:** No (can add in v1.1)

- [ ] **DECISION:** Maximum lorebook entry limit?
  - **Options:** None, 500, 1000, 1500
  - **Recommendation:** 1000 entries

- [ ] **DECISION:** Maximum nesting depth?
  - **Options:** Unlimited, 3, 5, 10
  - **Recommendation:** 5 levels

- [ ] **DECISION:** Cleanup strategy for orphaned lorebooks?
  - **Options:** Manual only, Automatic after 30 days, User prompt
  - **Recommendation:** Manual utility (safest)

### File Structure Planning

- [ ] Confirm file locations:
  - `checkpointValidator.js` - Requirements validation
  - `lorebookCloner.js` - Lorebook cloning with isolation
  - `checkpointManager.js` - Main checkpoint creation/loading logic
  - `checkpointStateManager.js` - State recording/restoration
  - `checkpointUI.js` - UI indicators and progress

- [ ] Confirm integration points:
  - Hook into `createNewBookmark()` (via event or wrapper?)
  - Hook into `branchChat()` (modify ST core or extension wrapper?)
  - Hook into `CHAT_CHANGED` event (already exists in eventHandlers.js)

### Testing Strategy

- [ ] Define test categories:
  - Unit tests (validation, cloning, state management)
  - Integration tests (full checkpoint creation/loading)
  - E2E tests (UI interactions, multiple scenarios)
  - Performance tests (large lorebooks, timing)
  - Edge case tests (corruption, race conditions, nesting)

- [ ] Define success criteria:
  - All P0 mitigations pass tests
  - All P1 mitigations pass tests
  - No data loss in any scenario
  - No UI deadlocks or freezes
  - Checkpoint creation < 3 seconds for typical lorebook
  - 95%+ code coverage for new modules

---

## Phase 1: P0 Critical Mitigations (REQUIRED)

### R1: Branch Auto-Open Timing

#### Requirements Validation for Branches

- [ ] Extend `validateCheckpointRequirements()` to accept branch flag
- [ ] Apply validation to `branchChat()` before creation
- [ ] Test: Branch creation blocked if queue not empty
- [ ] Test: Branch creation blocked if not scene break
- [ ] Test: Branch creation blocked if no scene recap
- [ ] Test: Error messages clear and actionable

#### Lorebook Cloning for Branches

- [ ] Modify `branchChat()` to call lorebook cloning
- [ ] Clone lorebook BEFORE branch file creation
- [ ] Inject cloned lorebook into branch metadata
- [ ] Restore original lorebook reference after save
- [ ] Test: Branch has different lorebook than main
- [ ] Test: Branch lorebook has clean queue (empty)
- [ ] Test: Branch lorebook has correct registry entries
- [ ] Test: Main lorebook unchanged after branch creation

#### Branch Creation Lock

- [ ] Add `isCreatingBranch` flag (similar to checkpoint lock)
- [ ] Prevent concurrent branch creation attempts
- [ ] Show user-friendly message if already in progress
- [ ] Test: Rapid branch clicks → only one created
- [ ] Test: Lock released on success
- [ ] Test: Lock released on failure

#### Acceptance Criteria

- [ ] Branch creation follows same validation as checkpoints
- [ ] Branches have isolated lorebooks (no contamination)
- [ ] Branch creation cannot be triggered concurrently
- [ ] All tests pass
- [ ] Code reviewed by team

**Estimated Time:** 6 hours
**Priority:** P0 - CRITICAL

---

### R2: Concurrent Operations

#### Checkpoint Creation Lock

- [ ] Add `isCreatingCheckpoint` flag module-level
- [ ] Wrap checkpoint creation in lock check
- [ ] Prevent concurrent creation attempts
- [ ] Show clear message if creation already in progress
- [ ] Test: Rapid checkpoint clicks → only one created
- [ ] Test: Lock prevents second creation attempt
- [ ] Test: Lock released after success
- [ ] Test: Lock released after failure/error

#### UI Blocking During Creation

- [ ] Call `setQueueBlocking(true)` at start of creation
- [ ] Reuse existing queue blocking UI mechanism
- [ ] Call `setQueueBlocking(false)` in `finally` block
- [ ] Test: Send button hidden during checkpoint creation
- [ ] Test: Queue blocking indicator shown
- [ ] Test: UI unblocks after completion
- [ ] Test: UI unblocks after error
- [ ] Test: User cannot send messages during creation

#### Chat Context Validation

- [ ] Capture chat context before async operations:
  - Current chat ID
  - Current character ID
  - Current group ID (if group chat)
- [ ] Validate context after each async operation:
  - After lorebook cloning
  - After metadata preparation
  - Before bookmark creation
- [ ] Abort checkpoint creation if context changed
- [ ] Rollback any partial changes (lorebook clone)
- [ ] Show clear error message to user
- [ ] Test: Switch chat during creation → aborted
- [ ] Test: Error message explains what happened
- [ ] Test: No corrupted checkpoint files created
- [ ] Test: Original chat metadata unchanged

#### Queue Reload Debouncing

- [ ] Add debounce timer for `reloadQueue()` calls
- [ ] Set debounce delay to 100ms
- [ ] Clear previous timer on new reload request
- [ ] Test: Rapid chat switches (5 in 2 seconds)
- [ ] Test: Queue reloads only once per chat (debounced)
- [ ] Test: No console errors from rapid reloads
- [ ] Test: Final queue state is correct

#### Acceptance Criteria

- [ ] Only one checkpoint can be created at a time
- [ ] UI blocks user actions during creation
- [ ] Context changes detected and abort creation
- [ ] Queue reloads are debounced
- [ ] All tests pass
- [ ] No race conditions in testing
- [ ] Code reviewed by team

**Estimated Time:** 8 hours
**Priority:** P0 - CRITICAL

---

## Phase 2: P1 Important Safeguards (STRONGLY RECOMMENDED)

### R4: Data Corruption Prevention

#### Atomic Lorebook Cloning

- [ ] Implement clone with rollback on failure
- [ ] Clone all entries before writing any
- [ ] Delete partial clone if error occurs
- [ ] Test: Simulate clone failure (network error)
- [ ] Test: Partial clone deleted (rollback)
- [ ] Test: Original lorebook unchanged
- [ ] Test: Error reported to user clearly

#### Metadata Restoration

- [ ] Save original metadata values before injection
- [ ] Restore in `finally` block (guaranteed execution)
- [ ] Test: Simulate crash during metadata injection
- [ ] Test: Original metadata restored on next load
- [ ] Test: No lingering wrong references

#### Missing Lorebook Detection

- [ ] Check lorebook exists on checkpoint load
- [ ] Offer repair options if missing:
  - Create empty lorebook
  - Clone from current lorebook
  - Detach lorebook reference
  - Cancel load
- [ ] Test: Delete lorebook, load checkpoint
- [ ] Test: User can choose repair option
- [ ] Test: Checkpoint loads after repair

#### Running Recap Version Fallback

- [ ] Detect missing version on checkpoint load
- [ ] Fallback to latest available version
- [ ] Warn user about version mismatch
- [ ] Test: Delete version, load checkpoint
- [ ] Test: Latest version used instead
- [ ] Test: Warning shown to user

#### Acceptance Criteria

- [ ] Lorebook cloning is atomic (all-or-nothing)
- [ ] Original metadata always restored
- [ ] Missing lorebook detected and repairable
- [ ] Missing versions handled gracefully
- [ ] All tests pass
- [ ] Code reviewed by team

**Estimated Time:** 6 hours
**Priority:** P1 - IMPORTANT

---

## Phase 3: P2 Recommended Features (OPTIONAL BUT RECOMMENDED)

### R3: Nested Checkpoint Safeguards

#### Root Chat Reference

- [ ] Add `root_chat` field to checkpoint metadata
- [ ] Set to current `root_chat` or `main_chat` or current chat
- [ ] Add `nesting_depth` field (increment from parent)
- [ ] Test: Create nested checkpoint (3 levels)
- [ ] Test: `root_chat` points to original main chat
- [ ] Test: `nesting_depth` increments correctly

#### Parent Existence Validation

- [ ] Check parent chat exists on checkpoint load
- [ ] If missing, check if root chat exists
- [ ] Offer to link to root chat if parent missing
- [ ] Warn user about orphaned checkpoint
- [ ] Test: Delete parent checkpoint
- [ ] Test: Load child checkpoint → detect missing parent
- [ ] Test: Fallback to root chat if available
- [ ] Test: Warning shown to user

#### Nesting Depth Limit

- [ ] Add validation for maximum nesting depth
- [ ] Block checkpoint creation if depth exceeded
- [ ] Set limit to 5 levels (configurable)
- [ ] Test: Create 5-level nested checkpoint → success
- [ ] Test: Create 6th level → blocked
- [ ] Test: Error message clear

#### UI Nesting Indicator

- [ ] Show nesting depth in UI (e.g., "↑↑↑ Main Chat")
- [ ] Display on checkpoint messages
- [ ] Update on CHAT_CHANGED
- [ ] Test: Load 3-level checkpoint → shows "↑↑↑"
- [ ] Test: Indicator links to root chat name

#### Acceptance Criteria

- [ ] Root chat reference preserved in nested checkpoints
- [ ] Missing parents detected and handled
- [ ] Nesting depth limited to reasonable value
- [ ] UI shows nesting depth clearly
- [ ] All tests pass
- [ ] Code reviewed by team

**Estimated Time:** 5 hours
**Priority:** P2 - RECOMMENDED

---

### R5: Performance Management

#### Lorebook Size Warning

- [ ] Check entry count before checkpoint creation
- [ ] Warn if > 500 entries
- [ ] Block if > 1000 entries (optional, configurable)
- [ ] Allow user to proceed or cancel
- [ ] Test: Create checkpoint with 600 entries → warning shown
- [ ] Test: User can proceed after warning
- [ ] Test: User can cancel

#### Orphaned Lorebook Cleanup Utility

- [ ] Implement `findOrphanedCheckpointLorebooks()`
- [ ] Scan all lorebooks for `__CP_` pattern
- [ ] Check if corresponding checkpoint exists
- [ ] Return list of orphaned lorebooks
- [ ] Implement `cleanupOrphanedLorebooks()`
- [ ] Confirm deletion with user
- [ ] Delete orphaned lorebooks
- [ ] Add to settings UI or slash command
- [ ] Test: Create 3 checkpoints, delete 2
- [ ] Test: Cleanup finds 2 orphaned lorebooks
- [ ] Test: User confirms → lorebooks deleted
- [ ] Test: Checkpoint lorebooks not deleted

#### Performance Benchmarking

- [ ] Create test lorebooks: 100, 200, 500, 1000 entries
- [ ] Measure clone time for each size
- [ ] Document timing results
- [ ] Validate warning thresholds appropriate
- [ ] Test: 100 entries → <500ms
- [ ] Test: 500 entries → <2s
- [ ] Test: 1000 entries → <5s (or blocked)

#### Acceptance Criteria

- [ ] Large lorebooks show warning
- [ ] Cleanup utility removes orphaned lorebooks only
- [ ] Performance acceptable for typical use cases
- [ ] All tests pass
- [ ] Code reviewed by team

**Estimated Time:** 3 hours
**Priority:** P2 - RECOMMENDED

---

## Phase 4: P3 Optional Polish (CAN DEFER TO v1.1)

### R8: Version Compatibility Check (Optional)

- [ ] Detect SillyTavern version via `getContext().version`
- [ ] Compare to minimum supported version (1.10.0)
- [ ] Warn if version too old
- [ ] Test: Mock old version → warning shown
- [ ] Test: Current version → no warning

**Estimated Time:** 1 hour
**Priority:** P3 - OPTIONAL

---

### R9: Checkpoint Integrity Checker (Optional)

- [ ] Implement `validateCheckpointIntegrity()`
- [ ] Check lorebook exists
- [ ] Check running recap versions exist
- [ ] Check parent chat exists
- [ ] Return validation report
- [ ] Implement `repairCheckpoint()`
- [ ] Offer repair options for each issue type
- [ ] Test: Corrupted checkpoint → detected
- [ ] Test: Repair → checkpoint fixed

**Estimated Time:** 4 hours
**Priority:** P3 - OPTIONAL

---

### R10: Enhanced UI (Optional)

- [ ] Add "Checkpoint Ready" indicator to scene breaks
- [ ] Add detailed validation status tooltip
- [ ] Add progress bar during checkpoint creation
- [ ] Add detailed error panel for validation failures
- [ ] Test: UI indicators update correctly
- [ ] Test: Progress bar shows all steps
- [ ] Test: Error panel shows all failed requirements

**Estimated Time:** 5 hours
**Priority:** P3 - OPTIONAL

---

## Integration & Testing

### Unit Tests

- [ ] `validateCheckpointRequirements()` tests
  - Queue not empty → invalid
  - Not scene break → invalid
  - No scene recap → invalid
  - No running recap → invalid
  - All valid → valid
  - Nested depth exceeded → invalid

- [ ] `cloneLorebook()` tests
  - Clone success → correct entries copied
  - Internal entries filtered (`__operation_queue`, `_registry_*`)
  - Clone failure → partial clone deleted
  - Original lorebook unchanged

- [ ] `prepareCheckpointState()` tests
  - Running recap version recorded
  - Original lorebook recorded
  - State structure correct

- [ ] `loadCheckpointState()` tests
  - Running recap version restored
  - Missing version → fallback to latest
  - Missing lorebook → detection and error

**Estimated Time:** 8 hours

---

### Integration Tests

- [ ] Full checkpoint creation flow
  - Validation → Clone → Inject → Create → Restore
  - Verify checkpoint file created
  - Verify metadata correct
  - Verify original state restored

- [ ] Full checkpoint loading flow
  - Load checkpoint → CHAT_CHANGED → State restoration
  - Verify running recap version correct
  - Verify lorebook reference correct

- [ ] Full branch creation flow
  - Validation → Clone → Create → Auto-open
  - Verify branch file created
  - Verify branch auto-opened
  - Verify isolated lorebook

**Estimated Time:** 6 hours

---

### E2E Tests (Playwright)

- [ ] User creates checkpoint via UI
  - Click scene break menu → "Create Checkpoint"
  - Enter checkpoint name
  - Verify checkpoint created
  - Verify still on main chat

- [ ] User creates branch via UI
  - Click scene break menu → "Create Branch"
  - Verify branch created
  - Verify switched to branch

- [ ] User switches to checkpoint
  - Open checkpoint from chat list
  - Verify state restored
  - Verify correct running recap

- [ ] User switches back to main
  - Click "Back to Main Chat"
  - Verify main chat loaded
  - Verify main state restored

- [ ] Nested checkpoint scenario
  - Create checkpoint A from main
  - Switch to checkpoint A
  - Create checkpoint B from A
  - Switch to checkpoint B
  - Verify state correct
  - Switch back to A → verify
  - Switch back to main → verify

**Estimated Time:** 8 hours

---

### Edge Case Tests

- [ ] Concurrent creation attempts
  - Click "Create Checkpoint" twice rapidly
  - Verify only one created
  - Verify second attempt blocked

- [ ] Chat switch during creation
  - Start checkpoint creation
  - Switch chat immediately
  - Verify creation aborted
  - Verify no corrupted files

- [ ] Lorebook clone failure
  - Simulate network error during clone
  - Verify partial clone deleted
  - Verify error reported

- [ ] Missing lorebook on load
  - Delete checkpoint lorebook manually
  - Load checkpoint
  - Verify detection and repair offered

- [ ] Missing parent checkpoint
  - Create nested checkpoint
  - Delete parent
  - Load child checkpoint
  - Verify detection and fallback to root

- [ ] Large lorebook
  - Create checkpoint with 600 entry lorebook
  - Verify warning shown
  - Verify creation succeeds after confirmation

**Estimated Time:** 6 hours

---

## Performance Testing

- [ ] Measure checkpoint creation time
  - Small lorebook (50 entries) → <500ms
  - Medium lorebook (200 entries) → <1s
  - Large lorebook (500 entries) → <2s

- [ ] Measure lorebook clone time
  - 100 entries → <300ms
  - 500 entries → <1.5s
  - 1000 entries → <4s

- [ ] Measure checkpoint loading time
  - Any size → <1s (just metadata load)

- [ ] Measure memory usage
  - Clone 500 entry lorebook → <50MB peak

- [ ] Test with maximum nesting
  - 5-level nested checkpoint
  - Verify performance acceptable
  - Verify lorebook name length reasonable

**Estimated Time:** 4 hours

---

## Documentation

- [ ] Update README.md with checkpoint feature documentation
- [ ] Add user guide for checkpoint creation
- [ ] Add user guide for branch creation
- [ ] Document requirements for checkpoint creation
- [ ] Document troubleshooting guide
- [ ] Add developer guide for checkpoint system
- [ ] Document all new APIs
- [ ] Add JSDoc comments to all new functions
- [ ] Update CHANGELOG.md

**Estimated Time:** 4 hours

---

## Code Review & Quality

- [ ] All new code follows extension coding standards
- [ ] All functions have JSDoc comments
- [ ] All complex logic has explanatory comments
- [ ] No magic numbers (use named constants)
- [ ] Error messages are clear and actionable
- [ ] Logging uses appropriate subsystems
- [ ] No console.log (use debug/log/warn/error)
- [ ] ESLint passes with 0 warnings
- [ ] All complexity metrics within limits
- [ ] Code reviewed by at least one team member
- [ ] All review comments addressed

**Estimated Time:** 4 hours

---

## Pre-Release Checklist

### Functionality

- [ ] All P0 mitigations implemented and tested
- [ ] All P1 safeguards implemented and tested
- [ ] P2 features implemented (if decided yes)
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] All edge case tests pass
- [ ] Performance benchmarks meet targets
- [ ] No known bugs or issues

### Quality

- [ ] Code review completed
- [ ] ESLint passes
- [ ] No compiler warnings
- [ ] All functions documented
- [ ] User documentation complete
- [ ] Developer documentation complete

### Testing

- [ ] Tested with SillyTavern stable version
- [ ] Tested with SillyTavern staging version (if available)
- [ ] Tested in solo chat
- [ ] Tested in group chat
- [ ] Tested with various lorebook sizes
- [ ] Tested with various nesting depths
- [ ] Tested with multiple profiles
- [ ] Tested with connection profile switching

### Release

- [ ] Version number updated
- [ ] CHANGELOG.md updated
- [ ] README.md updated
- [ ] All documentation merged to main branch
- [ ] Tagged release in git
- [ ] Release notes prepared

---

## Time Estimates Summary

| Phase | Components | Time | Priority |
|-------|-----------|------|----------|
| **Phase 0** | Foundation & Decisions | 4 hours | Required |
| **Phase 1 (P0)** | Branch timing + Concurrent ops | 14 hours | **CRITICAL** |
| **Phase 2 (P1)** | Data corruption safeguards | 6 hours | Important |
| **Phase 3 (P2)** | Nested checkpoints + Performance | 8 hours | Recommended |
| **Phase 4 (P3)** | Optional polish | 10 hours | Optional |
| **Testing** | Unit + Integration + E2E + Edge + Performance | 32 hours | Required |
| **Documentation** | User + Developer docs | 4 hours | Required |
| **Code Review** | Review + quality checks | 4 hours | Required |

**Minimum Viable Release:** Phase 0 + Phase 1 (P0) + Testing = **50 hours (6-7 days)**

**Recommended Release:** Phase 0-2 (P0+P1) + Testing = **56 hours (7 days)**

**Full Featured Release:** Phase 0-3 (P0+P1+P2) + Testing = **64 hours (8 days)**

**Deluxe Release:** All phases + Testing = **74 hours (9-10 days)**

---

## Success Criteria

### Must Have (Required for Release)

✅ All P0 mitigations implemented and tested
✅ All P1 safeguards implemented and tested
✅ No data loss in any tested scenario
✅ No data corruption in any tested scenario
✅ No race conditions in tested scenarios
✅ Branch and checkpoint creation work correctly
✅ State restoration works correctly
✅ All tests pass
✅ Code reviewed and approved

### Should Have (Recommended for Release)

✅ P2 features implemented (nested safeguards, performance)
✅ Performance meets benchmarks
✅ User documentation complete
✅ Developer documentation complete

### Nice to Have (Can Defer to v1.1)

- P3 enhancements (version check, integrity checker, UI polish)
- Advanced repair utilities
- Telemetry and usage analytics

---

## Sign-Off

### Pre-Implementation

- [ ] **Team Lead:** All documentation reviewed and approved
- [ ] **Developer:** Understands all requirements and risks
- [ ] **QA:** Test plan reviewed and approved
- [ ] **Product:** Feature scope and priorities confirmed

**Date:** ________________

### Post-Implementation

- [ ] **Developer:** All required features implemented
- [ ] **QA:** All tests pass, no critical bugs
- [ ] **Team Lead:** Code review approved
- [ ] **Product:** Feature acceptance complete

**Date:** ________________

---

**Document Maintained By:** Development Team
**Review Frequency:** Daily during implementation
**Status:** Ready for use

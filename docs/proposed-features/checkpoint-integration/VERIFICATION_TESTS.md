# Checkpoint Integration Verification Tests

**Date:** 2025-01-12
**Purpose:** Test cases to verify checkpoint/branch integration implementation
**Status:** ⚠️ DESIGN ONLY - Test files DELETED
**Version:** V1 (Original test plan with filtered entries)

---

## ⚠️ NEW: V2 Requirements Available

**This document describes V1 test cases** (filter internal entries).

**NEW V2 Requirements** (2025-01-12) change test expectations:
- **All entries should be cloned** (not filtered)
- **Queue blocking test** (must error if queue not empty)
- **Running recap version validation** (check versions array)
- **Combined recap validation** (check content preservation)

**See `CHECKPOINT_REQUIREMENTS_V2.md` section "Testing Requirements" for V2 test cases.**

---

## ⚠️ IMPORTANT: TEST FILES DELETED

**The test helper and test implementation files have been DELETED** due to critical issues:

1. `tests/helpers/CheckpointTestHelper.js` - **DELETED**
   - Assumed `window.AutoRecap.createCheckpoint()` exists (not wired up)
   - Assumed `chat_metadata.checkpoints` array (wrong data structure)
   - Helper methods did not match actual SillyTavern APIs

2. `tests/features/checkpoint-lorebook-isolation.spec.js` - **DELETED**
   - Used deleted helper methods
   - Cannot run without complete rewrite

**This document remains as:**
- ✅ Test strategy and requirements
- ✅ Test case specifications
- ❌ NO implementation exists
- ⚠️ Test helpers need complete rewrite before implementation

---

## Overview

This document defines verification tests for the checkpoint/branch integration feature. Tests are organized by priority (P0-P3) and must pass before proceeding to the next implementation stage.

**Test Framework:** Playwright E2E tests running against real SillyTavern at `http://localhost:8000`

**Test Requirements:**
- All tests run against REAL SillyTavern with REAL data
- NO mocks or simulations (Constitutional Principle III)
- Tests must FAIL first, then pass after implementation (Constitutional Principle V)
- Each test verifies ONE specific requirement

---

## P0 Tests (Critical - Stage Blockers)

### P0-1: Checkpoint Lorebook Isolation

**Requirement:** Checkpoints must have independent lorebook copies, not shared references.

**Test Case:**
```javascript
test('checkpoint has independent lorebook copy', async ({ page }) => {
  // Setup: Create chat with lorebook
  const chatName = await createTestChat(page);
  await addLorebookEntry(page, 'Original Entry');

  // Action: Create checkpoint
  await createCheckpoint(page, 5, 'Test Checkpoint');

  // Action: Modify main chat lorebook
  await editLorebookEntry(page, 'Original Entry', 'Modified Entry');

  // Action: Open checkpoint
  await openCheckpoint(page, 'Test Checkpoint');

  // Verify: Checkpoint has original lorebook
  const checkpointEntry = await getLorebookEntry(page, 0);
  expect(checkpointEntry.content).toBe('Original Entry');

  // Verify: Main chat has modified lorebook
  await openCharacterChat(page, chatName);
  const mainEntry = await getLorebookEntry(page, 0);
  expect(mainEntry.content).toBe('Modified Entry');
});
```

**Why this test:**
- Verifies the core problem we're solving
- Tests actual lorebook cloning, not reference copying
- Ensures timeline isolation

**Expected failure mode:** Without implementation, checkpoint will show 'Modified Entry' (shared reference).

---

### P0-2: Branch Lorebook Isolation

**Requirement:** Branches must have independent lorebook copies, not shared references.

**Test Case:**
```javascript
test('branch has independent lorebook copy', async ({ page }) => {
  // Setup: Create chat with lorebook
  const chatName = await createTestChat(page);
  await addLorebookEntry(page, 'Original Entry');

  // Action: Create branch
  const branchName = await createBranch(page, 5);

  // Action: Modify main chat lorebook
  await openCharacterChat(page, chatName);
  await editLorebookEntry(page, 'Original Entry', 'Modified in Main');

  // Action: Open branch and modify its lorebook
  await openCharacterChat(page, branchName);
  await editLorebookEntry(page, 'Original Entry', 'Modified in Branch');

  // Verify: Branch has its own modification
  const branchEntry = await getLorebookEntry(page, 0);
  expect(branchEntry.content).toBe('Modified in Branch');

  // Verify: Main chat has different modification
  await openCharacterChat(page, chatName);
  const mainEntry = await getLorebookEntry(page, 0);
  expect(mainEntry.content).toBe('Modified in Main');
});
```

**Why this test:**
- Verifies branch isolation (critical P0 requirement)
- Tests that branch solution correctly restores metadata BEFORE opening
- Ensures no cross-timeline contamination

**Expected failure mode:** Without fix, branch would show 'Modified in Main' (contaminated by finally block executing in branch).

---

### P0-3: Branch Creation Timing (Regression Test)

**Requirement:** Branch creation must restore metadata in MAIN chat, not in branch.

**Test Case:**
```javascript
test('branch creation restores metadata in main chat', async ({ page }) => {
  // Setup: Create chat with lorebook
  const chatName = await createTestChat(page);
  await addLorebookEntry(page, 'Main Entry');

  // Setup: Add spy to track chat_metadata changes
  await page.evaluate(() => {
    window.__metadata_timeline = [];
    const originalOpenChat = window.openCharacterChat;
    window.openCharacterChat = async function(...args) {
      window.__metadata_timeline.push({
        event: 'openCharacterChat',
        world_info: chat_metadata.world_info
      });
      return await originalOpenChat(...args);
    };
  });

  // Action: Create branch
  await createBranch(page, 5);

  // Verify: Metadata was restored BEFORE opening branch
  const timeline = await page.evaluate(() => window.__metadata_timeline);

  // First event should be openCharacterChat with MAIN's lorebook name
  expect(timeline[0].event).toBe('openCharacterChat');
  expect(timeline[0].world_info).toMatch(/Main Entry/);
});
```

**Why this test:**
- Directly tests the critical timing bug we found
- Verifies metadata restoration happens in correct chat context
- Regression test for the try/finally bug

**Expected failure mode:** Without fix, `world_info` would be the cloned lorebook name (wrong!).

---

### P0-4: Concurrent Checkpoint Creation

**Requirement:** Multiple simultaneous checkpoint creation attempts must be serialized, not allowed to run concurrently.

**Test Case:**
```javascript
test('concurrent checkpoint creation is blocked', async ({ page }) => {
  // Setup: Create chat
  await createTestChat(page);

  // Action: Trigger two checkpoint creations simultaneously
  const [result1, result2] = await Promise.all([
    page.evaluate(() => window.AutoRecap.createCheckpoint(5, 'Checkpoint1')),
    page.evaluate(() => window.AutoRecap.createCheckpoint(5, 'Checkpoint2'))
  ]);

  // Verify: One succeeded, one was blocked
  const succeeded = [result1, result2].filter(r => r.success).length;
  const blocked = [result1, result2].filter(r => r.blocked).length;

  expect(succeeded).toBe(1);
  expect(blocked).toBe(1);

  // Verify: Only one checkpoint was created
  const checkpoints = await getCheckpoints(page);
  expect(checkpoints.length).toBe(1);
});
```

**Why this test:**
- Verifies reentrancy protection works
- Tests actual concurrent execution, not sequential calls
- Ensures data integrity under concurrent load

**Expected failure mode:** Without lock, both would execute, potentially corrupting data or creating duplicate checkpoints.

---

### P0-5: Context Validation (Chat Switch During Creation)

**Requirement:** If user switches chats during checkpoint creation, creation must fail with clear error.

**Test Case:**
```javascript
test('checkpoint creation fails if chat switches mid-operation', async ({ page }) => {
  // Setup: Create two chats
  const chat1 = await createTestChat(page, 'Chat 1');
  const chat2 = await createTestChat(page, 'Chat 2');

  // Setup: Start in chat1
  await openCharacterChat(page, chat1);

  // Setup: Inject delay into checkpoint creation
  await page.evaluate(() => {
    const original = window.AutoRecap._createCheckpointInternal;
    window.AutoRecap._createCheckpointInternal = async function(...args) {
      await new Promise(r => setTimeout(r, 1000));  // 1s delay
      return await original(...args);
    };
  });

  // Action: Start checkpoint creation
  const createPromise = page.evaluate(() =>
    window.AutoRecap.createCheckpoint(5, 'Test')
  );

  // Action: Switch to chat2 mid-creation
  await page.waitForTimeout(500);  // Wait 500ms (mid-operation)
  await openCharacterChat(page, chat2);

  // Verify: Creation fails with context error
  const result = await createPromise;
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/context changed|chat switched/i);

  // Verify: No checkpoint was created in chat1
  await openCharacterChat(page, chat1);
  const checkpoints = await getCheckpoints(page);
  expect(checkpoints.length).toBe(0);
});
```

**Why this test:**
- Tests critical context validation requirement
- Verifies graceful failure mode
- Ensures no partial/corrupted checkpoints

**Expected failure mode:** Without validation, would create checkpoint in wrong chat or with wrong metadata.

---

### P0-6: Queue Debouncing Promise Resolution

**Requirement:** When queue reload is debounced, ALL promises must resolve (not just the last one).

**Test Case:**
```javascript
test('debounced queue reload resolves all promises', async ({ page }) => {
  // Setup: Create chat
  await createTestChat(page);

  // Action: Call reloadQueue 5 times rapidly
  const promises = await page.evaluate(async () => {
    const results = [];
    const startTime = Date.now();

    // Create 5 reload promises rapidly (within 50ms)
    const p1 = window.AutoRecap.reloadQueue().then(() => ({ id: 1, time: Date.now() - startTime }));
    await new Promise(r => setTimeout(r, 10));
    const p2 = window.AutoRecap.reloadQueue().then(() => ({ id: 2, time: Date.now() - startTime }));
    await new Promise(r => setTimeout(r, 10));
    const p3 = window.AutoRecap.reloadQueue().then(() => ({ id: 3, time: Date.now() - startTime }));
    await new Promise(r => setTimeout(r, 10));
    const p4 = window.AutoRecap.reloadQueue().then(() => ({ id: 4, time: Date.now() - startTime }));
    await new Promise(r => setTimeout(r, 10));
    const p5 = window.AutoRecap.reloadQueue().then(() => ({ id: 5, time: Date.now() - startTime }));

    // Wait for all with timeout
    return await Promise.race([
      Promise.all([p1, p2, p3, p4, p5]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
    ]);
  });

  // Verify: All 5 promises resolved (no timeout)
  expect(promises.length).toBe(5);

  // Verify: All resolved at approximately the same time (within 50ms)
  const times = promises.map(p => p.time);
  const maxTime = Math.max(...times);
  const minTime = Math.min(...times);
  expect(maxTime - minTime).toBeLessThan(50);
});
```

**Why this test:**
- Directly tests the debouncing bug we found
- Uses actual Promise.race to detect hanging promises
- Verifies all callers get resolved, not just the last one

**Expected failure mode:** Without fix, promises p1-p4 would hang forever, causing timeout.

---

## P1 Tests (High Priority - Data Integrity)

### P1-1: Checkpoint Auto-Recap Data Isolation

**Requirement:** Checkpoint must snapshot ALL auto-recap data, not just lorebook.

**Test Case:**
```javascript
test('checkpoint includes all auto-recap metadata', async ({ page }) => {
  // Setup: Create chat with auto-recap data
  await createTestChat(page);
  await enableAutoRecap(page);

  // Setup: Create recap data
  await sendMessage(page, 'Test message 1');
  await waitForRecap(page, 0);
  await sendMessage(page, 'Test message 2');
  await waitForRecap(page, 1);

  // Action: Create checkpoint
  await createCheckpoint(page, 2, 'Data Test');

  // Action: Modify main chat recaps
  await regenerateRecap(page, 0);
  await regenerateRecap(page, 1);

  // Action: Open checkpoint
  await openCheckpoint(page, 'Data Test');

  // Verify: Checkpoint has original recaps
  const recap0 = await getMessageRecap(page, 0);
  const recap1 = await getMessageRecap(page, 1);

  expect(recap0).toBe('(original recap for message 0)');
  expect(recap1).toBe('(original recap for message 1)');
});
```

**Why this test:**
- Verifies complete data snapshot
- Tests integration with existing auto-recap system
- Ensures no data loss in checkpoints

---

### P1-2: Branch Auto-Recap Data Independence

**Requirement:** Branch modifications to auto-recap data must not affect main chat.

**Test Case:**
```javascript
test('branch recap modifications do not affect main chat', async ({ page }) => {
  // Setup: Create chat with recaps
  const chatName = await createTestChat(page);
  await enableAutoRecap(page);
  await sendMessage(page, 'Test message');
  await waitForRecap(page, 0);

  const originalRecap = await getMessageRecap(page, 0);

  // Action: Create branch
  const branchName = await createBranch(page, 1);

  // Action: Regenerate recap in branch
  await regenerateRecap(page, 0);
  const branchRecap = await getMessageRecap(page, 0);

  // Verify: Branch has new recap
  expect(branchRecap).not.toBe(originalRecap);

  // Verify: Main chat still has original
  await openCharacterChat(page, chatName);
  const mainRecap = await getMessageRecap(page, 0);
  expect(mainRecap).toBe(originalRecap);
});
```

---

### P1-3: Checkpoint Metadata Restoration on Error

**Requirement:** If checkpoint creation fails, metadata must be restored to original state.

**Test Case:**
```javascript
test('metadata restored on checkpoint creation error', async ({ page }) => {
  // Setup: Create chat with lorebook
  await createTestChat(page);
  await addLorebookEntry(page, 'Original Entry');

  const originalLorebookName = await page.evaluate(() => chat_metadata.world_info);

  // Setup: Inject error into checkpoint creation
  await page.evaluate(() => {
    const original = window.AutoRecap._saveCheckpointFile;
    window.AutoRecap._saveCheckpointFile = async function() {
      throw new Error('Simulated save error');
    };
  });

  // Action: Attempt to create checkpoint (will fail)
  const result = await page.evaluate(() =>
    window.AutoRecap.createCheckpoint(5, 'Will Fail')
  );

  // Verify: Creation failed
  expect(result.success).toBe(false);

  // Verify: Metadata was restored
  const currentLorebookName = await page.evaluate(() => chat_metadata.world_info);
  expect(currentLorebookName).toBe(originalLorebookName);

  // Verify: No orphaned lorebook entries
  const lorebookCount = await getLorebookEntryCount(page);
  expect(lorebookCount).toBe(1);  // Only original entry
});
```

**Why this test:**
- Tests rollback/cleanup on error
- Verifies no orphaned data after failure
- Ensures transactional behavior

---

### P1-4: Branch Metadata Restoration on Error

**Requirement:** If branch creation fails, metadata must be restored to original state.

**Test Case:**
```javascript
test('metadata restored on branch creation error', async ({ page }) => {
  // Setup: Create chat with lorebook
  await createTestChat(page);
  await addLorebookEntry(page, 'Original Entry');

  const originalLorebookName = await page.evaluate(() => chat_metadata.world_info);

  // Setup: Inject error into branch file creation
  await page.evaluate(() => {
    const original = window.createBranch;
    window.createBranch = async function() {
      throw new Error('Simulated branch creation error');
    };
  });

  // Action: Attempt to create branch (will fail)
  const result = await page.evaluate(() =>
    window.AutoRecap.createBranch(5)
  );

  // Verify: Creation failed
  expect(result.success).toBe(false);

  // Verify: Metadata was restored
  const currentLorebookName = await page.evaluate(() => chat_metadata.world_info);
  expect(currentLorebookName).toBe(originalLorebookName);

  // Verify: No orphaned lorebook entries
  const lorebookCount = await getLorebookEntryCount(page);
  expect(lorebookCount).toBe(1);  // Only original entry
});
```

---

## P2 Tests (Medium Priority - Feature Completeness)

### P2-1: Nested Checkpoint Prevention

**Requirement:** Cannot create checkpoint from a checkpoint (must be from main timeline).

**Test Case:**
```javascript
test('cannot create checkpoint from checkpoint', async ({ page }) => {
  // Setup: Create main chat
  const chatName = await createTestChat(page);

  // Action: Create checkpoint
  await createCheckpoint(page, 5, 'Checkpoint1');

  // Action: Open checkpoint
  await openCheckpoint(page, 'Checkpoint1');

  // Action: Attempt to create checkpoint from checkpoint
  const result = await createCheckpoint(page, 3, 'Nested');

  // Verify: Creation blocked
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/cannot create checkpoint from checkpoint/i);
});
```

---

### P2-2: Nested Branch Prevention

**Requirement:** Cannot create branch from a checkpoint (must be from main timeline or branch).

**Test Case:**
```javascript
test('cannot create branch from checkpoint', async ({ page }) => {
  // Setup: Create main chat and checkpoint
  await createTestChat(page);
  await createCheckpoint(page, 5, 'Checkpoint1');

  // Action: Open checkpoint
  await openCheckpoint(page, 'Checkpoint1');

  // Action: Attempt to create branch
  const result = await createBranch(page, 3);

  // Verify: Creation blocked
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/cannot create branch from checkpoint/i);
});
```

---

### P2-3: Combined Recap Isolation in Checkpoints

**Requirement:** Checkpoint combined recap must be independent of main chat.

**Test Case:**
```javascript
test('checkpoint combined recap is independent', async ({ page }) => {
  // Setup: Create chat with combined recap
  await createTestChat(page);
  await enableAutoRecap(page);
  await enableCombinedRecap(page);

  await sendMessage(page, 'Message 1');
  await sendMessage(page, 'Message 2');
  await waitForCombinedRecap(page);

  // Action: Create checkpoint
  await createCheckpoint(page, 2, 'Combined Test');

  // Action: Regenerate combined recap in main
  await regenerateCombinedRecap(page);
  const mainCombined = await getCombinedRecap(page);

  // Action: Open checkpoint
  await openCheckpoint(page, 'Combined Test');
  const checkpointCombined = await getCombinedRecap(page);

  // Verify: Different combined recaps
  expect(checkpointCombined).not.toBe(mainCombined);
});
```

---

### P2-4: Running Scene Recap Isolation

**Requirement:** Running scene recap data must be independent in checkpoints/branches.

**Test Case:**
```javascript
test('running scene recap is independent in branches', async ({ page }) => {
  // Setup: Create chat with running scene recap
  const chatName = await createTestChat(page);
  await enableAutoRecap(page);
  await enableSceneRecap(page);

  await sendMessage(page, 'Scene 1 message');
  await createSceneBreak(page);
  await waitForRunningSceneRecap(page);

  const originalRunningRecap = await getRunningSceneRecap(page);

  // Action: Create branch
  const branchName = await createBranch(page, 2);

  // Action: Add new scene in branch
  await sendMessage(page, 'Scene 2 message');
  await createSceneBreak(page);
  await waitForRunningSceneRecap(page);

  const branchRunningRecap = await getRunningSceneRecap(page);

  // Verify: Branch has updated running recap
  expect(branchRunningRecap).not.toBe(originalRunningRecap);

  // Verify: Main still has original
  await openCharacterChat(page, chatName);
  const mainRunningRecap = await getRunningSceneRecap(page);
  expect(mainRunningRecap).toBe(originalRunningRecap);
});
```

---

## P3 Tests (Low Priority - Edge Cases)

### P3-1: Checkpoint Creation with Empty Lorebook

**Requirement:** Can create checkpoint even if lorebook is empty/null.

**Test Case:**
```javascript
test('checkpoint creation works with no lorebook', async ({ page }) => {
  // Setup: Create chat with no lorebook
  await createTestChat(page);
  await page.evaluate(() => {
    chat_metadata.world_info = null;
  });

  // Action: Create checkpoint
  const result = await createCheckpoint(page, 5, 'No Lorebook');

  // Verify: Success
  expect(result.success).toBe(true);

  // Verify: Checkpoint opens correctly
  await openCheckpoint(page, 'No Lorebook');
  const lorebook = await page.evaluate(() => chat_metadata.world_info);
  expect(lorebook).toBeNull();
});
```

---

### P3-2: Branch Creation with Empty Lorebook

**Test Case:**
```javascript
test('branch creation works with no lorebook', async ({ page }) => {
  // Setup: Create chat with no lorebook
  const chatName = await createTestChat(page);
  await page.evaluate(() => {
    chat_metadata.world_info = null;
  });

  // Action: Create branch
  const branchName = await createBranch(page, 5);

  // Verify: Branch created
  expect(branchName).toBeTruthy();

  // Action: Add lorebook to main
  await openCharacterChat(page, chatName);
  await addLorebookEntry(page, 'Main Entry');

  // Verify: Branch still has no lorebook
  await openCharacterChat(page, branchName);
  const lorebook = await page.evaluate(() => chat_metadata.world_info);
  expect(lorebook).toBeNull();
});
```

---

### P3-3: Group Chat Checkpoint Support

**Requirement:** Checkpoints work in group chats (if applicable).

**Test Case:**
```javascript
test('checkpoint creation works in group chat', async ({ page }) => {
  // Setup: Create group chat
  const groupName = await createTestGroupChat(page, ['Char1', 'Char2']);
  await addLorebookEntry(page, 'Group Lorebook');

  // Action: Create checkpoint
  const result = await createCheckpoint(page, 5, 'Group Checkpoint');

  // Verify: Success
  expect(result.success).toBe(true);

  // Action: Modify group lorebook
  await editLorebookEntry(page, 'Group Lorebook', 'Modified');

  // Action: Open checkpoint
  await openCheckpoint(page, 'Group Checkpoint');

  // Verify: Has original lorebook
  const entry = await getLorebookEntry(page, 0);
  expect(entry.content).toBe('Group Lorebook');
});
```

---

### P3-4: Large Lorebook Performance

**Requirement:** Checkpoint/branch creation with large lorebooks completes in reasonable time.

**Test Case:**
```javascript
test('checkpoint creation with large lorebook is performant', async ({ page }) => {
  // Setup: Create chat with large lorebook (100 entries)
  await createTestChat(page);
  for (let i = 0; i < 100; i++) {
    await addLorebookEntry(page, `Entry ${i}`, { content: 'x'.repeat(1000) });
  }

  // Action: Create checkpoint and measure time
  const startTime = Date.now();
  const result = await createCheckpoint(page, 5, 'Large Lorebook');
  const duration = Date.now() - startTime;

  // Verify: Success
  expect(result.success).toBe(true);

  // Verify: Completed in reasonable time (< 5 seconds)
  expect(duration).toBeLessThan(5000);

  // Verify: Checkpoint has all entries
  await openCheckpoint(page, 'Large Lorebook');
  const entryCount = await getLorebookEntryCount(page);
  expect(entryCount).toBe(100);
});
```

---

## Integration Tests (Cross-Feature)

### INT-1: Checkpoint → Branch → Checkpoint Chain

**Requirement:** Can create branch from checkpoint's parent chat.

**Test Case:**
```javascript
test('checkpoint and branch can coexist from same parent', async ({ page }) => {
  // Setup: Create main chat
  const chatName = await createTestChat(page);
  await addLorebookEntry(page, 'Main');

  // Action: Create checkpoint
  await createCheckpoint(page, 5, 'CP1');

  // Action: Create branch from main
  const branchName = await createBranch(page, 5);

  // Action: Modify each timeline
  await openCharacterChat(page, chatName);
  await editLorebookEntry(page, 'Main', 'Modified Main');

  await openCheckpoint(page, 'CP1');
  await editLorebookEntry(page, 'Main', 'Modified CP');

  await openCharacterChat(page, branchName);
  await editLorebookEntry(page, 'Main', 'Modified Branch');

  // Verify: All three timelines are independent
  await openCharacterChat(page, chatName);
  expect((await getLorebookEntry(page, 0)).content).toBe('Modified Main');

  await openCheckpoint(page, 'CP1');
  expect((await getLorebookEntry(page, 0)).content).toBe('Modified CP');

  await openCharacterChat(page, branchName);
  expect((await getLorebookEntry(page, 0)).content).toBe('Modified Branch');
});
```

---

### INT-2: Auto-Recap Integration (Full Flow)

**Requirement:** Auto-recap continues to work normally in checkpoints and branches.

**Test Case:**
```javascript
test('auto-recap works in checkpoint and branch timelines', async ({ page }) => {
  // Setup: Main chat with auto-recap enabled
  const chatName = await createTestChat(page);
  await enableAutoRecap(page);

  await sendMessage(page, 'Main message 1');
  await waitForRecap(page, 0);

  // Action: Create checkpoint
  await createCheckpoint(page, 1, 'Auto-Recap Test');

  // Action: Create branch
  const branchName = await createBranch(page, 1);

  // Action: Add message in branch (auto-recap should trigger)
  await sendMessage(page, 'Branch message 2');
  await waitForRecap(page, 1);
  const branchRecap = await getMessageRecap(page, 1);

  // Action: Add message in main (auto-recap should trigger)
  await openCharacterChat(page, chatName);
  await sendMessage(page, 'Main message 2');
  await waitForRecap(page, 1);
  const mainRecap = await getMessageRecap(page, 1);

  // Action: Open checkpoint (should have no second message)
  await openCheckpoint(page, 'Auto-Recap Test');
  const messages = await getMessageCount(page);
  expect(messages).toBe(1);

  // Verify: All recaps are independent
  expect(branchRecap).not.toBe(mainRecap);
});
```

---

## Test Helpers (To Be Implemented)

### Required Helper Functions

```javascript
// Chat Management
async function createTestChat(page, name)
async function openCharacterChat(page, chatName)
async function openCheckpoint(page, checkpointName)
async function createTestGroupChat(page, characters)

// Checkpoint/Branch Operations
async function createCheckpoint(page, mesId, name)
async function createBranch(page, mesId)
async function getCheckpoints(page)

// Lorebook Operations
async function addLorebookEntry(page, key, options)
async function editLorebookEntry(page, key, newContent)
async function getLorebookEntry(page, index)
async function getLorebookEntryCount(page)

// Auto-Recap Operations
async function enableAutoRecap(page)
async function enableCombinedRecap(page)
async function enableSceneRecap(page)
async function sendMessage(page, text)
async function waitForRecap(page, messageIndex)
async function getMessageRecap(page, messageIndex)
async function regenerateRecap(page, messageIndex)
async function getCombinedRecap(page)
async function regenerateCombinedRecap(page)
async function getRunningSceneRecap(page)
async function waitForRunningSceneRecap(page)
async function createSceneBreak(page)

// Message Operations
async function getMessageCount(page)
```

---

## Test Execution Order

### Stage Verification Gates

**Stage 2 Gate:** P0-1, P0-2 must pass (lorebook isolation)
**Stage 3 Gate:** P0-3 must pass (branch timing)
**Stage 4 Gate:** P1-1, P1-2 must pass (auto-recap data)
**Stage 5 Gate:** P0-4, P0-5 must pass (concurrency/context)
**Stage 6 Gate:** P0-6 must pass (debouncing)
**Stage 7 Gate:** P1-3, P1-4 must pass (error handling)
**Stage 8 Gate:** INT-1, INT-2 must pass (integration)
**Stage 9 Gate:** All P2 and P3 tests must pass

---

## Notes

1. **Test Data Cleanup:** All tests must clean up created chats/lorebooks after completion
2. **Test Isolation:** Each test must be independently runnable (no shared state)
3. **Async Timing:** Use proper waits for async operations (no arbitrary timeouts)
4. **Error Messages:** All test failures must have clear, actionable error messages
5. **Constitutional Compliance:**
   - Tests run against REAL SillyTavern (no mocks)
   - Tests must FAIL first, then pass after implementation
   - Each test verifies ONE requirement
   - No generic assertions (specific expectations only)

---

**Total Test Count:** 21 tests
**P0 Critical:** 6 tests
**P1 High:** 4 tests
**P2 Medium:** 4 tests
**P3 Low:** 4 tests
**Integration:** 2 tests
**Helper Functions:** 1 test

**Estimated Test Implementation Time:** 12-16 hours
**Estimated Test Execution Time:** 15-20 minutes (sequential, real environment)

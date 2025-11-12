import { test, expect } from '@playwright/test';
import { CheckpointTestHelper } from '../helpers/CheckpointTestHelper.js';

test.describe('Checkpoint Lorebook Isolation (P0)', () => {

  let helper;

  test.beforeEach(async ({ page }) => {
    helper = new CheckpointTestHelper(page);

    await page.goto('http://localhost:8000');
    await page.waitForSelector(helper.stSelectors.chat.input, { timeout: 30000 });
    await helper.waitForExtensionLoaded();
  });

  test.afterEach(async () => {
    await helper.cleanupTestData();
  });

  test('P0-1: checkpoint has independent lorebook copy', async ({ page }) => {
    const chatName = await helper.createTestChat('LB_Isolation_Test');
    await helper.addLorebookEntry('Original Entry');

    const originalLorebookName = await helper.getLorebookName();

    const result = await helper.createCheckpoint(5, 'Test Checkpoint');
    expect(result.success).toBe(true);

    await helper.editLorebookEntry('Original Entry', 'Modified Entry');

    await helper.openCheckpoint('Test Checkpoint');

    const checkpointEntry = await helper.getLorebookEntry(0);
    expect(checkpointEntry).not.toBeNull();
    expect(checkpointEntry.content).toBe('Content for Original Entry');

    await helper.openCharacterChat(chatName);
    const mainEntry = await helper.getLorebookEntry(0);
    expect(mainEntry).not.toBeNull();
    expect(mainEntry.content).toBe('Modified Entry');

    const checkpointLorebookName = await page.evaluate(() => {
      const ctx = SillyTavern.getContext();
      const checkpoints = ctx.chat_metadata?.checkpoints || [];
      return checkpoints[0]?.lorebookName;
    });

    expect(checkpointLorebookName).not.toBe(originalLorebookName);
  });

  test('P0-2: branch has independent lorebook copy', async ({ page }) => {
    const chatName = await helper.createTestChat('Branch_Isolation_Test');
    await helper.addLorebookEntry('Original Entry');

    const branchName = await helper.createBranch(5);
    expect(branchName).toBeTruthy();

    await helper.openCharacterChat(chatName);
    await helper.editLorebookEntry('Original Entry', 'Modified in Main');

    await helper.openCharacterChat(branchName);
    await helper.editLorebookEntry('Original Entry', 'Modified in Branch');

    const branchEntry = await helper.getLorebookEntry(0);
    expect(branchEntry.content).toBe('Modified in Branch');

    await helper.openCharacterChat(chatName);
    const mainEntry = await helper.getLorebookEntry(0);
    expect(mainEntry.content).toBe('Modified in Main');
  });

  test('P0-3: branch creation restores metadata in main chat', async ({ page }) => {
    const chatName = await helper.createTestChat('Branch_Timing_Test');
    await helper.addLorebookEntry('Main Entry');

    await page.evaluate(() => {
      window.__metadata_timeline = [];
      const originalOpenChat = window.openCharacterChat;
      window.openCharacterChat = async function(...args) {
        window.__metadata_timeline.push({
          event: 'openCharacterChat',
          world_info: chat_metadata.world_info
        });
        return await originalOpenChat.apply(this, args);
      };
    });

    await helper.createBranch(5);

    const timeline = await page.evaluate(() => window.__metadata_timeline);

    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[0].event).toBe('openCharacterChat');

    const firstWorldInfo = timeline[0].world_info;
    expect(firstWorldInfo).toBeTruthy();
  });

  test('P0-4: concurrent checkpoint creation is blocked', async ({ page }) => {
    await helper.createTestChat('Concurrent_Test');
    await helper.addLorebookEntry('Test Entry');

    const [result1, result2] = await Promise.all([
      page.evaluate(() => window.AutoRecap.createCheckpoint(5, 'Checkpoint1')),
      page.evaluate(() => window.AutoRecap.createCheckpoint(5, 'Checkpoint2'))
    ]);

    const succeeded = [result1, result2].filter(r => r?.success === true).length;
    const blocked = [result1, result2].filter(r => r?.success === false || r?.blocked === true).length;

    expect(succeeded).toBe(1);
    expect(blocked).toBe(1);

    const checkpoints = await helper.getCheckpoints();
    expect(checkpoints.length).toBe(1);
  });

  test('P0-5: checkpoint creation fails if chat switches mid-operation', async ({ page }) => {
    const chat1 = await helper.createTestChat('Chat 1');
    const chat2 = await helper.createTestChat('Chat 2');

    await helper.openCharacterChat(chat1);
    await helper.addLorebookEntry('Chat1 Entry');

    await page.evaluate(() => {
      const original = window.AutoRecap._createCheckpointInternal || window.AutoRecap.createCheckpoint;
      window.AutoRecap._originalCreateCheckpoint = original;
      window.AutoRecap.createCheckpoint = async function(...args) {
        await new Promise(r => setTimeout(r, 1000));
        return await window.AutoRecap._originalCreateCheckpoint(...args);
      };
    });

    const createPromise = page.evaluate(() =>
      window.AutoRecap.createCheckpoint(5, 'Test')
    );

    await helper.waitForTimeout(500);
    await helper.openCharacterChat(chat2);

    const result = await createPromise;
    expect(result.success).toBe(false);

    await helper.openCharacterChat(chat1);
    const checkpoints = await helper.getCheckpoints();
    expect(checkpoints.length).toBe(0);
  });

  test('P0-6: debounced queue reload resolves all promises', async ({ page }) => {
    await helper.createTestChat('Debounce_Test');

    const promises = await page.evaluate(async () => {
      const results = [];
      const startTime = Date.now();

      const p1 = window.AutoRecap.reloadQueue().then(() => ({ id: 1, time: Date.now() - startTime }));
      await new Promise(r => setTimeout(r, 10));
      const p2 = window.AutoRecap.reloadQueue().then(() => ({ id: 2, time: Date.now() - startTime }));
      await new Promise(r => setTimeout(r, 10));
      const p3 = window.AutoRecap.reloadQueue().then(() => ({ id: 3, time: Date.now() - startTime }));
      await new Promise(r => setTimeout(r, 10));
      const p4 = window.AutoRecap.reloadQueue().then(() => ({ id: 4, time: Date.now() - startTime }));
      await new Promise(r => setTimeout(r, 10));
      const p5 = window.AutoRecap.reloadQueue().then(() => ({ id: 5, time: Date.now() - startTime }));

      return await Promise.race([
        Promise.all([p1, p2, p3, p4, p5]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
      ]);
    });

    expect(promises.length).toBe(5);

    const times = promises.map(p => p.time);
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    expect(maxTime - minTime).toBeLessThan(50);
  });

});

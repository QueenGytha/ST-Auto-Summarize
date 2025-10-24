/**
 * @file Tests for operationQueue.js error handling and retry logic
 * @module operationQueue
 */

export default ({ test, expect }) => {
  // Helper function to wait for queue to drain
  async function waitForQueue(oq, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const stats = oq.getQueueStats();
      if (stats.pending === 0 && stats.in_progress === 0) {
        return true;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }

  // ======== Error Handling & Retry Logic ========

  test('operation failure: non-retryable error (unauthorized) removes operation', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('test_auth_fail', async () => {
      throw new Error('unauthorized - invalid credentials');
    });

    await oq.enqueueOperation('test_auth_fail', {});
    const statsBefore = oq.getQueueStats();
    expect(statsBefore.pending).toBe(1);

    await oq.resumeQueue();
    await new Promise(r => setTimeout(r, 1000));

    // Should be removed from queue (not stored as FAILED)
    const statsAfter = oq.getQueueStats();
    expect(statsAfter.total).toBe(0);

    await oq.pauseQueue();
  });

  test('operation failure: non-retryable error (forbidden) removes operation', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('test_forbidden', async () => {
      throw new Error('Access forbidden - insufficient permissions');
    });

    await oq.enqueueOperation('test_forbidden', {});
    await oq.resumeQueue();
    await new Promise(r => setTimeout(r, 1000));

    const stats = oq.getQueueStats();
    expect(stats.total).toBe(0);

    await oq.pauseQueue();
  });

  test('operation failure: invalid API key removes operation', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('test_api_key', async () => {
      throw new Error('Invalid API key provided');
    });

    await oq.enqueueOperation('test_api_key', {});
    await oq.resumeQueue();
    await new Promise(r => setTimeout(r, 1000));

    const stats = oq.getQueueStats();
    expect(stats.total).toBe(0);

    await oq.pauseQueue();
  });

  test('getFailedOperations: returns empty array (failed ops are removed)', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('fail_op', async () => {
      throw new Error('unauthorized');
    });

    await oq.enqueueOperation('fail_op', {});
    await oq.resumeQueue();
    await new Promise(r => setTimeout(r, 1000));

    // Failed operations are removed, not stored
    const failedOps = oq.getFailedOperations();
    expect(Array.isArray(failedOps)).toBe(true);
    expect(failedOps.length).toBe(0);

    await oq.pauseQueue();
  });

  test('getFailedOperations: returns empty when no failures', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('success_only', async () => 'ok');
    await oq.enqueueOperation('success_only', {});
    await oq.resumeQueue();

    await waitForQueue(oq, 5000);

    const failedOps = oq.getFailedOperations();
    expect(Array.isArray(failedOps)).toBe(true);
    expect(failedOps.length).toBe(0);
  });

  test('updateOperationStatus: updates status correctly', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('status_test', async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    await oq.enqueueOperation('status_test', {});

    // Operation should be pending initially
    const stats1 = oq.getQueueStats();
    expect(stats1.pending).toBe(1);

    await oq.resumeQueue();
    await waitForQueue(oq, 5000);

    // Should be completed and removed now
    const stats2 = oq.getQueueStats();
    expect(stats2.pending).toBe(0);
    expect(stats2.in_progress).toBe(0);
  });

  test('queue stats: failed count is always 0 (ops are removed)', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('will_fail', async () => {
      throw new Error('authentication required');
    });

    await oq.enqueueOperation('will_fail', {});
    await oq.resumeQueue();
    await new Promise(r => setTimeout(r, 1000));

    const stats = oq.getQueueStats();
    expect(stats.failed).toBe(0);
    expect(stats.total).toBe(0);

    await oq.pauseQueue();
  });

  // ======== Handler Registration ========

  test('operation execution: completed operations removed from queue', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('auto_remove', async () => 'completed');
    await oq.enqueueOperation('auto_remove', {});

    const stats1 = oq.getQueueStats();
    expect(stats1.pending).toBe(1);

    await oq.resumeQueue();
    await waitForQueue(oq, 5000);

    const stats2 = oq.getQueueStats();
    expect(stats2.pending).toBe(0);
    expect(stats2.completed).toBe(0); // Auto-removed
  });
};

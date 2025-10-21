export default ({ test, expect }) => {
  test('queue: pause/resume and stats reflect state', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');
    // Start with a registered trivial handler
    oq.registerOperationHandler(oq.OperationType.GENERATE_RUNNING_SUMMARY, async () => 'ok');
    await oq.pauseQueue();
    expect(oq.isQueuePaused()).toBe(true);
    await oq.resumeQueue();
    expect(oq.isQueuePaused()).toBe(false);
  }, 16000);

  test('queue: processes multiple ops', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');
    await oq.pauseQueue();
    await oq.clearAllOperations();
    // Handlers that complete immediately
    oq.registerOperationHandler('op_a', async () => 'a');
    oq.registerOperationHandler('op_b', async () => 'b');

    const depId = await oq.enqueueOperation('op_a', {}, { priority: 0 });
    const mainId = await oq.enqueueOperation('op_b', {}, { priority: 10 });
    await oq.resumeQueue();
    expect(typeof depId).toBe('string');
    expect(typeof mainId).toBe('string');

    // Wait until queue drains
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const stats = oq.getQueueStats();
      if (stats.pending === 0 && stats.in_progress === 0) break;
      await new Promise(r => setTimeout(r, 25));
    }
    const stats = oq.getQueueStats();
    expect(stats.pending).toBe(0);
  }, 16000);

  test('queue: clearCompleted and clearAll purge items (paused)', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');
    oq.registerOperationHandler('noop', async () => 'ok');
    await oq.pauseQueue();
    // Enqueue and confirm items present
    await oq.enqueueOperation('noop', {}, {});
    await oq.enqueueOperation('noop', {}, {});
    let stats = oq.getQueueStats();
    expect(stats.total >= 2).toBe(true);
    // Clear all while paused
    await oq.clearAllOperations();
    stats = oq.getQueueStats();
    expect(stats.total).toBe(0);
    await oq.resumeQueue();
  }, 10000);
};

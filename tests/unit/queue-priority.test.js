/**
 * @file Tests for operationQueue.js priority ordering and execution
 * @module operationQueue
 */

export default ({ test, expect }) => {
  // ======== Priority Ordering ========

  test('priority: enqueueOperation accepts priority in options', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('test_op', async () => 'done');

    // Should not throw
    const opId = await oq.enqueueOperation('test_op', {}, { priority: 42 });

    expect(typeof opId).toBe('string');
    expect(opId.length > 0).toBe(true);

    await oq.clearAllOperations();
  });

  test('priority: default priority is 0', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('test_op', async () => 'done');

    // Enqueue without specifying priority
    const opId1 = await oq.enqueueOperation('test_op', {});
    // Enqueue with explicit priority
    const opId2 = await oq.enqueueOperation('test_op', {}, { priority: 5 });

    const op1 = oq.getOperation(opId1);
    const op2 = oq.getOperation(opId2);

    expect(op1.priority).toBe(0);
    expect(op2.priority).toBe(5);

    await oq.clearAllOperations();
  });

  test('priority: negative priority works correctly', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('test_op', async () => 'done');

    const opId = await oq.enqueueOperation('test_op', {}, { priority: -5 });
    const op = oq.getOperation(opId);

    expect(op.priority).toBe(-5);

    await oq.clearAllOperations();
  });

  test('priority: large priority values handled correctly', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('test_op', async () => 'done');

    const opId = await oq.enqueueOperation('test_op', {}, { priority: 9999 });
    const op = oq.getOperation(opId);

    expect(op.priority).toBe(9999);

    await oq.clearAllOperations();
  });

  // ======== Queue Stats ========

  test('getQueueStats: returns correct counts', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('stat_test', async () => {
      await new Promise(r => setTimeout(r, 100));
    });

    await oq.enqueueOperation('stat_test', {});
    await oq.enqueueOperation('stat_test', {});
    await oq.enqueueOperation('stat_test', {});

    const stats = oq.getQueueStats();

    expect(typeof stats.pending).toBe('number');
    expect(typeof stats.in_progress).toBe('number');
    expect(typeof stats.completed).toBe('number');
    expect(typeof stats.failed).toBe('number');
    expect(stats.pending).toBe(3);

    await oq.clearAllOperations();
  });

  test('getQueueStats: paused status reflected', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();

    await oq.pauseQueue();
    let stats = oq.getQueueStats();
    expect(stats.paused).toBe(true);

    await oq.resumeQueue();
    stats = oq.getQueueStats();
    expect(stats.paused).toBe(false);
  });

  test('getQueueStats: total count is sum of all statuses', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');

    await oq.initOperationQueue();
    await oq.pauseQueue();
    await oq.clearAllOperations();

    oq.registerOperationHandler('count_test', async () => 'done');

    await oq.enqueueOperation('count_test', {});
    await oq.enqueueOperation('count_test', {});

    const stats = oq.getQueueStats();
    const total = stats.pending + stats.in_progress + stats.completed + stats.failed;

    expect(stats.total).toBe(total);

    await oq.clearAllOperations();
  });
};

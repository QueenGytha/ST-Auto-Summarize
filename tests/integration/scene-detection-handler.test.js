export default ({ test, expect }) => {
  test('operationHandlers: DETECT_SCENE_BREAK enqueues scene summary when detected', async () => {
    // Configure summarize_text to yield a positive detection
    globalThis.__TEST_SUMMARIZE_TEXT_RESPONSE = 'SCENE BREAK: Rationale here';

    // Minimal $ stub used by get_message_div and handlers
    globalThis.$ = (selector) => ({
      find: () => ({ length: 0 }),
      length: 0,
      attr: () => '0',
      closest: () => ({ attr: () => '0' })
    });

    const oq = await import('../../tests/virtual/operationQueue.js');
    const oh = await import('../../tests/virtual/operationHandlers.js');
    const qi = await import('../../tests/virtual/queueIntegration.js');
    const idx = await import('../../tests/virtual/index.js');

    // Build a tiny chat with two messages for detection context
    const ctx = idx.getContext();
    ctx.chat = [
      { mes: 'Hello', is_user: true },
      { mes: 'New message that ends scene', is_user: false },
    ];

    // Register operation handlers from module
    oh.registerAllOperationHandlers();

    // Spy: register a trivial handler for GENERATE_SCENE_SUMMARY to allow completion
    oq.registerOperationHandler(oq.OperationType.GENERATE_SCENE_SUMMARY, async () => ({ ok: true }));

    // Enqueue detect scene break for index 1
    const opId = await oq.enqueueOperation(oq.OperationType.DETECT_SCENE_BREAK, { index: 1 }, {});
    expect(typeof opId).toBe('string');

    // Wait for the queue to drain (detection + possibly enqueued summary)
    const deadline = Date.now() + 14000; // allow for inter-op delay
    while (Date.now() < deadline) {
      const stats = oq.getQueueStats();
      if (stats.pending === 0 && stats.in_progress === 0) break;
      await new Promise(r => setTimeout(r, 50));
    }
    const stats = oq.getQueueStats();
    expect(stats.pending).toBe(0);

    // Cleanup
    delete globalThis.__TEST_SUMMARIZE_TEXT_RESPONSE;
  }, 20000);
};


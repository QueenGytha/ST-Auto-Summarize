export default ({ test, expect }) => {
  test('queue: UI update callback is invoked on enqueue', async () => {
    const oq = await import('../../tests/virtual/operationQueue.js');
    let calls = 0;
    oq.registerUIUpdateCallback(() => { calls++; });
    // Register a trivial handler so processing completes
    oq.registerOperationHandler('ui_noop', async () => 'ok');
    await oq.enqueueOperation('ui_noop', {}, {});
    // wait briefly for saveQueue -> notify
    await new Promise(r => setTimeout(r, 50));
    expect(calls >= 1).toBe(true);
  });
};

